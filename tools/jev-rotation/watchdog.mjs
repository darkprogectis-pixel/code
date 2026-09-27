#!/usr/bin/env node
// JEV Rotation Controller V3 — successor liveness watchdog (spawned detached by hook.mjs).
//   node watchdog.mjs <predecessor-session-id>
// "Spawned" is not "alive": waits for the successor's SessionStart (successor_started_at in
// the predecessor lock). If it never comes, opens ONE replacement successor (new session id,
// new brief/launcher) and rewrites the lock; a late start of the old one is SUPERSEDED
// (blocked by hook.mjs), so exactly one successor is ever active.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from './controller.mjs';
import { env, TEST_MODE, stateDir, lockFile, lineage, readJson, writeBrief, writeLauncher, openWindow } from './hook.mjs';

const sid = process.argv[2];
const cfg = loadConfig(env);
const timeoutS = Number((TEST_MODE && env.JEV_ROTATION_CONFIRM_TIMEOUT_S) || cfg.rotation?.confirm_timeout_s || 90);
const respawnMax = cfg.rotation?.respawn_max ?? 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitStarted(successor) {
  const until = Date.now() + timeoutS * 1000;
  while (Date.now() < until) {
    const l = readJson(lockFile(sid));
    if (l && l.successor !== successor) return 'CHANGED';
    if (l?.successor_started_at) return 'STARTED';
    await sleep(Math.min(2000, timeoutS * 250));
  }
  return 'TIMEOUT';
}

async function main() {
  if (!sid) return;
  for (;;) {
    const lock = readJson(lockFile(sid));
    if (!lock || lock.status !== 'SPAWNED') return;
    const r = await waitStarted(lock.successor);
    if (r === 'STARTED') { lineage({ event: 'SUCCESSOR_CONFIRMED', from: sid, successor: lock.successor }); return; }
    if (r === 'CHANGED') return;
    const cur = readJson(lockFile(sid));
    if (!cur || cur.successor !== lock.successor) return;
    if ((cur.respawns || 0) >= respawnMax) {
      lineage({ event: 'SUCCESSOR_NOT_STARTED_GAVE_UP', from: sid, successor: cur.successor, respawns: cur.respawns || 0 });
      return;
    }
    const pred = readJson(path.join(stateDir, 'state', `${sid}.json`)) || {};
    const rec = { ...cur, successor: crypto.randomUUID(), respawns: (cur.respawns || 0) + 1,
      superseded: [...(cur.superseded || []), cur.successor], at_respawn: new Date().toISOString() };
    rec.brief = writeBrief(rec, pred, { transcript_path: cur.transcript_path }, cfg, cur.carried_prompt_text);
    rec.launch = writeLauncher(rec, rec.brief);
    fs.writeFileSync(path.join(stateDir, 'state', `${rec.successor}.json`), JSON.stringify({
      session_id: rec.successor, max_level: 'OK', max_tokens: 0, crossings: [],
      predecessor: { from: sid, depth: rec.depth, root: rec.root, brief: rec.brief, at: rec.at_respawn },
    }, null, 2));
    // Lock first (atomic rename), window second: a late start of the old successor is superseded from now on.
    const tmp = `${lockFile(sid)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, lockFile(sid));
    lineage({ event: 'SUCCESSOR_NOT_STARTED', from: sid, successor: cur.successor, waited_s: timeoutS });
    if (TEST_MODE && env.JEV_ROTATION_SPAWN === 'dry') {
      rec.spawn = { mode: 'dry-run' };
    } else {
      const w = await openWindow(rec.launch, `JEV rot${rec.depth} ${rec.successor.slice(0, 8)}`);
      rec.spawn = w.ok ? { mode: w.mode, pid: w.pid } : { mode: 'failed', error: w.error };
    }
    const now = readJson(lockFile(sid));
    fs.writeFileSync(tmp, JSON.stringify({ ...now, spawn: rec.spawn }, null, 2));
    fs.renameSync(tmp, lockFile(sid));
    lineage({ event: 'SUCCESSOR_RESPAWNED', from: sid, superseded: cur.successor, successor: rec.successor, spawn: rec.spawn });
  }
}

main().catch((e) => { try { lineage({ event: 'WATCHDOG_ERROR', from: sid, error: String(e.stack || e) }); } catch { /* ignore */ } });
