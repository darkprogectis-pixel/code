#!/usr/bin/env node
// JEV Rotation Controller V3 — manual immediate rotation of ONE live session.
//   node force.mjs [--session <id>] [--config-dir <dir>] [--check]
// Session id: --session, else CLAUDE_CODE_SESSION_ID (set by Claude Code inside the session);
// both given and different => refused. --check validates only (nothing written, no window).
// Rotation itself is the hook's own rotate() (brief, launcher, O_EXCL lock exactly-once,
// lineage, successor state, new window, watchdog, install-hooks --verify in the launcher):
// no thresholds are changed and no test override is used. The predecessor becomes
// ROTATED_READ_ONLY at once (its next hook event reads the lock).
// Exit: 0 rotated / check OK · 3 refused · 4 spawn failed · 2 usage.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const check = args.includes('--check');
if (arg('--config-dir')) process.env.CLAUDE_CONFIG_DIR = path.resolve(arg('--config-dir'));

// Imported after --config-dir is applied: hook.mjs derives its state dir at import time.
const { rank, maxLevel, levelFor, loadConfig, measureTranscript, ROTATED } = await import('./controller.mjs');
const { env, stateDir, lockFile, lineage, readJson, rotate, writeAutoSnapshot } = await import('./hook.mjs');

const out = (status, code, extra = '') => { console.log(`JEV_ROTATION_FORCE ${status}${extra ? ` ${extra}` : ''}`); process.exit(code); };
const refuse = (why) => out('REFUSED', 3, why);

const argSid = arg('--session');
const envSid = env.CLAUDE_CODE_SESSION_ID;
if (args.includes('--session') && !argSid) out('USAGE', 2, 'node force.mjs [--session <id>] [--config-dir <dir>] [--check]');
if (argSid && envSid && argSid !== envSid) refuse(`--session ${argSid} is not the current Claude Code session ${envSid}`);
const sid = argSid || envSid;
if (!sid) refuse('no session id: pass --session <id> (or run inside the Claude Code session)');
if (!env.CLAUDE_CONFIG_DIR) refuse('CLAUDE_CONFIG_DIR not set: pass --config-dir <dir> (the successor must use the JEV config dir)');

const cfg = loadConfig(env);
if (cfg.rotation?.enabled === false) refuse('rotation disabled in config.json');
const stateFile = path.join(stateDir, 'state', `${sid}.json`);
const st = readJson(stateFile);
if (!st) refuse(`no controller state for session ${sid} in ${stateDir} (not a JEV session of this config dir)`);
if (fs.existsSync(lockFile(sid))) {
  const l = readJson(lockFile(sid));
  refuse(`${ROTATED}: session ${sid} already rotated or rotation in progress (successor ${l?.successor || 'UNKNOWN (lock being written)'})`);
}
if (st.rotation) refuse(`${ROTATED}: state of ${sid} already records successor ${st.rotation.successor}`);
const predLock = st.predecessor ? readJson(lockFile(st.predecessor.from)) : null;
if (predLock && predLock.successor !== sid) refuse(`session ${sid} was superseded by ${predLock.successor} (read-only)`);
if (!st.transcript_path || !fs.existsSync(st.transcript_path)) refuse(`transcript of ${sid} not found (${st.transcript_path || 'none recorded'})`);

const m = measureTranscript(st.transcript_path);
const tokens = m.tokens ?? st.last_tokens ?? null;
const level = maxLevel(tokens === null ? 'OK' : levelFor(tokens, cfg.thresholds), st.max_level || 'OK');
const info = `session=${sid} level=${level} tokens=${tokens ?? 'UNKNOWN'} rotation=#${(st.predecessor?.depth || 0) + 1} root=${st.predecessor?.root || sid}`;
if (check) out('CHECK_OK', 0, info);

st.crossings = st.crossings || [];
st.snapshot = writeAutoSnapshot(sid, level, tokens, { transcript_path: st.transcript_path }, st);
lineage({ event: 'FORCE_ROTATION_REQUESTED', from: sid, level, tokens, rank: rank(level), config_dir: env.CLAUDE_CONFIG_DIR });
const rec = await rotate(sid, st, { session_id: sid, transcript_path: st.transcript_path, hook_event_name: 'FORCE' }, 'FORCE', level, tokens, tokens, cfg);
if (rec.status === 'SPAWN_FAILED') out('SPAWN_FAILED', 4, `${info} error=${rec.error}`);
// rotate() returns the existing lock on a concurrent rotation: never report someone else's successor as ours.
if (rec.trigger !== 'FORCE' || rec.from !== sid) refuse(`concurrent rotation won the lock (successor ${rec.successor}, trigger ${rec.trigger || '?'})`);

// Same bookkeeping the hook writes for a rotated session (the hook re-derives it from the lock anyway).
const cur = readJson(stateFile) || st;
Object.assign(cur, { rotation: { status: ROTATED, successor: rec.successor, brief: rec.brief, at: rec.at }, rotation_required: false, updated_at: new Date().toISOString() });
fs.writeFileSync(stateFile, JSON.stringify(cur, null, 2));
out('ROTATED', 0, `${info} successor=${rec.successor} spawn=${rec.spawn?.mode} brief=${rec.brief}`);
