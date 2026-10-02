#!/usr/bin/env node
// /jev-finish V1 — loop state CLI (used by the skill .claude/skills/jev-finish/SKILL.md).
//   start --objective "<txt>" [--handoff <md>] [--max-iterations N] [--require-test NAME]... [--jev-diff required|not_required]
//         [--jev-final auto|forbidden_by_handoff]
//   status [--loop <id>]           stage <STAGE> [--note "<txt>"]          require-test --name <N>
//   test --name <N> [--shell cmd|powershell|bash] --cmd "<command>"   (PASS only on exit 0; exit code propagated)
//   recheck                        (V1.1: the CLI re-runs every recorded test; RECHECK is performed, never declared)
//   blocker add --text "<txt>" | blocker resolve --index <i>           note --text "<txt>"
//   jev-adopt --kind diff|final --request-id <id> --result <X> [--confidence c]   (id must appear in a handoff)
//   complete --evidence "<txt>"     block --cause <CAUSE> --detail "<txt>"     cancel --by-operator
// Session: --session <id> (tests) or CLAUDE_CODE_SESSION_ID (inside Claude Code).
// Exit: 0 ok · 1 test FAIL · 2 usage · 3 refused.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cfg, env, repoRoot, stateDir, activeFile, NEXT, TERMINAL, readJson, nowIso, sha16, writeJson, withMutex, loadLoop, saveLoop, log,
  heartbeat, hbFile, activeLoop, activeLoopId, clearActive, mutate, tryClaim, isRotated, handoffs, gitChanged, lastWorkMs,
  latestHandoffMtime, realModifications, summary, loopFile, rotState, isAllowlisted, isHandoffMd,
} from './lib.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const sub = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const args = (n) => argv.flatMap((a, i) => (a === n && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const print = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));
const done = (status, code, extra = {}) => { print({ jev_finish: status, ...extra }); process.exit(code); };
const refuse = (why, extra = {}) => done('REFUSED', 3, { reason: why, ...extra });
const sid = arg('--session') || env.CLAUDE_CODE_SESSION_ID || null;

function ownLoop() {
  if (!sid) refuse('no session id (CLAUDE_CODE_SESSION_ID / --session)');
  const loop = tryClaim(sid);
  if (!loop) refuse('no active /jev-finish loop');
  if (loop.owner_session !== sid) refuse(`session ${sid} is not the owner of loop ${loop.loop_id} (owner ${loop.owner_session})`);
  if (isRotated(sid)) refuse(`session ${sid} is ROTATED_READ_ONLY: the loop continues in the successor`);
  heartbeat(loop.loop_id, sid, `cli:${cmd}`);
  return loop;
}
const needFresh = (loop) => Math.max(lastWorkMs(loop), Date.parse(loop.created_at) || 0);

function start() {
  if (!sid) refuse('no session id (CLAUDE_CODE_SESSION_ID / --session)');
  const objective = String(arg('--objective') || '').trim();
  if (!objective) done('USAGE', 2, { reason: 'objective required: /jev-finish "<objetivo>"' });
  if (isRotated(sid)) refuse(`session ${sid} is ROTATED_READ_ONLY`);
  for (let attempt = 0; attempt < 250; attempt++) {
    const cur = activeLoop();
    if (cur) {
      const claimed = tryClaim(sid);
      if (claimed?.owner_session === sid) {
        if (claimed.objective !== objective) mutate(claimed.loop_id, (l) => { (l.operator_notes = l.operator_notes || []).push({ at: nowIso(), session: sid, text: objective }); });
        log(claimed.loop_id, { event: 'START_REPLAY', session: sid });
        return done('ALREADY_ACTIVE', 0, { ...summary(loadLoop(claimed.loop_id)), next: 'continue the existing loop from its stage' });
      }
      const hb = readJson(hbFile(cur.loop_id));
      const lastSeen = hb ? hb.at_ms : Date.parse(cur.updated_at || cur.created_at) || 0; // no heartbeat yet => use the loop's own timestamps
      const stale = Date.now() - lastSeen > cfg.stale_owner_s * 1000;
      if (!stale && !isRotated(cur.owner_session)) refuse(`loop ${cur.loop_id} is owned by live session ${cur.owner_session} (heartbeat ${hb?.at}); exactly one continuation per lineage`);
      const l = mutate(cur.loop_id, (x) => {
        x.lineage.push({ session: sid, via: 'adopt', from: x.owner_session, at: nowIso() });
        x.owner_session = sid;
        (x.operator_notes = x.operator_notes || []).push({ at: nowIso(), session: sid, text: objective });
      });
      log(l.loop_id, { event: 'ADOPTED', session: sid, reason: stale ? 'owner heartbeat stale' : 'owner rotated' });
      heartbeat(l.loop_id, sid, 'adopt');
      return done('ADOPTED', 0, summary(l));
    }
    if (fs.existsSync(activeFile)) {
      // Points to a terminal loop => stale slot. Unreadable => a concurrent start is writing it (wait), or it crashed (> 10 s).
      const ptr = readJson(activeFile), l = ptr && loadLoop(ptr.loop_id);
      let age = 0; try { age = Date.now() - fs.statSync(activeFile).mtimeMs; } catch { continue; }
      if ((l && TERMINAL.has(l.status)) || (!l && age > 10000)) { fs.rmSync(activeFile, { force: true }); continue; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
      continue;
    }
    fs.mkdirSync(stateDir, { recursive: true });
    const loopId = `jf-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
    let fd;
    try { fd = fs.openSync(activeFile, 'wx'); } catch (e) { if (e.code === 'EEXIST') continue; throw e; }
    try {
      const hArg = arg('--handoff');
      const hFile = hArg ? path.resolve(repoRoot, hArg) : handoffs()[0]?.file;
      if (!hFile || !fs.existsSync(hFile)) { fs.closeSync(fd); fs.rmSync(activeFile, { force: true }); refuse(`canonical handoff not found (${hFile || 'handoffs/*.md empty'})`); }
      const maxIt = Number(arg('--max-iterations') || cfg.max_iterations);
      if (!Number.isInteger(maxIt) || maxIt < 1 || maxIt > 500) { fs.closeSync(fd); fs.rmSync(activeFile, { force: true }); done('USAGE', 2, { reason: '--max-iterations 1..500' }); }
      const jd = arg('--jev-diff') || 'required', jf = arg('--jev-final') || 'auto';
      if (!['required', 'not_required'].includes(jd) || !['auto', 'forbidden_by_handoff'].includes(jf)) { fs.closeSync(fd); fs.rmSync(activeFile, { force: true }); done('USAGE', 2, { reason: 'bad --jev-diff/--jev-final' }); }
      const t = nowIso();
      const rs = rotState(sid);
      const loop = {
        schema: 'jev-finish/v1', loop_id: loopId, status: 'ACTIVE', objective, objective_sha: sha16(objective), created_at: t, repo: repoRoot,
        handoff: { path: path.relative(repoRoot, hFile).replace(/\\/g, '/'), sha_at_start: sha16(fs.readFileSync(hFile, 'utf8')), mtime_at_start: fs.statSync(hFile).mtimeMs },
        stage: 'LOAD_HANDOFF', stage_history: [{ stage: 'INIT', at: t, session: sid }, { stage: 'LOAD_HANDOFF', at: t, session: sid, note: 'handoff resolved by start' }],
        criteria: { tests_required: args('--require-test'), jev_diff: jd, jev_final: jf },
        tests: {}, tests_history: [], files_modified: [], blockers: [], operator_notes: [],
        owner_session: sid, root: rs?.predecessor?.root || sid, lineage: [{ session: sid, via: 'start', at: t }],
        iteration: 0, max_iterations: maxIt, progress_seq: 0, stall_count: 0, last_stop_progress_seq: null,
        jev: { diff: null, final: null }, git_at_start: gitChanged(), rotation_yield: null,
      };
      saveLoop(loop);
      fs.writeSync(fd, JSON.stringify({ loop_id: loopId, at: t }));
    } finally { try { fs.closeSync(fd); } catch { /* closed */ } }
    log(loopId, { event: 'START', session: sid });
    heartbeat(loopId, sid, 'start');
    const l = loadLoop(loopId);
    return done('STARTED', 0, { ...summary(l), next: `read ${l.handoff.path} (bounded) and CLAUDE.md, then stage JEV_PRECHECK/PLAN` });
  }
  refuse('could not acquire the active loop slot (concurrent start)');
}

function stage() {
  const target = sub;
  const loop = ownLoop();
  if (!target) done('USAGE', 2, { reason: 'stage <STAGE>' });
  if (['COMPLETE', 'BLOCKED', 'ROTATE_IF_NEEDED', 'INIT'].includes(target)) refuse(`${target} is not settable with stage (use complete/block; ROTATE_IF_NEEDED is hook-owned)`);
  if (target === 'RECHECK') refuse('RECHECK only via recheck (the CLI re-runs the recorded tests; it is never declared)');
  const allowed = NEXT[loop.stage] || [];
  if (!allowed.includes(target)) refuse(`transition ${loop.stage} -> ${target} not allowed (allowed: ${allowed.join(', ')})`);
  if (target === 'EXECUTE' && loop.criteria.jev_diff === 'required' && loop.jev?.diff?.result !== 'A') {
    refuse('EXECUTE requires JEV DIFF = A first (node tools/jev-finish/jev-diff.mjs --kind diff --proposal <file>)');
  }
  const l = mutate(loop.loop_id, (x) => { x.stage = target; x.stage_history.push({ stage: target, at: nowIso(), session: sid, note: arg('--note') || null }); });
  log(l.loop_id, { event: 'STAGE', stage: target, note: arg('--note') || null, session: sid });
  done('OK', 0, summary(l));
}

function requireTest() {
  const name = arg('--name');
  if (!name) done('USAGE', 2, { reason: 'require-test --name <N>' });
  const loop = ownLoop();
  const l = mutate(loop.loop_id, (x) => { if (!x.criteria.tests_required.includes(name)) x.criteria.tests_required.push(name); });
  done('OK', 0, summary(l));
}

function runCmd(command, shell, cwd = process.cwd()) {
  const t0 = Date.now();
  const opt = { cwd, encoding: 'utf8', timeout: cfg.test_timeout_s * 1000, maxBuffer: 256 * 1024 * 1024, windowsHide: true };
  const r = shell === 'powershell' ? spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], opt)
    : shell === 'bash' ? spawnSync('bash', ['-c', command], opt)
    : spawnSync(command, { ...opt, shell: true });
  const outTxt = `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}${r.error ? `\n[spawn error] ${r.error.message}` : ''}`;
  const tail = outTxt.split(/\r?\n/).filter((x) => x.trim()).slice(-cfg.test_tail_lines);
  const exit = r.status === null ? (r.signal ? `signal:${r.signal}` : 'error') : r.status;
  const result = exit === 0 ? 'PASS' : 'FAIL';
  return { result, exit, cmd: command, shell, cwd, at: nowIso(), ms: Date.now() - t0, tail, session: sid };
}

function test() {
  const name = arg('--name'), command = arg('--cmd'), shell = arg('--shell') || 'cmd';
  if (!name || !command) done('USAGE', 2, { reason: 'test --name <N> [--shell cmd|powershell|bash] --cmd "<command>"' });
  const loop = ownLoop();
  const rec = runCmd(command, shell), { result, exit, tail } = rec;
  const l = mutate(loop.loop_id, (x) => { x.tests[name] = rec; x.tests_history.push({ name, result, exit, at: rec.at }); if (x.tests_history.length > 200) x.tests_history.splice(0, x.tests_history.length - 200); });
  log(l.loop_id, { event: 'TEST', name, result, exit, ms: rec.ms, session: sid });
  console.log(tail.join('\n'));
  done(result === 'PASS' ? 'TEST_PASS' : 'TEST_FAIL', result === 'PASS' ? 0 : 1, { name, exit, ms: rec.ms, next: result === 'PASS' ? 'advance' : 'diagnose, FIX, re-run this test' });
}

// Non-allowlisted git delta (repo edits by any tool, shell included): snapshotted by recheck, compared by complete.
function repoDelta() {
  const g = gitChanged();
  if (!g) return null;
  return Object.fromEntries(Object.entries(g).filter(([f]) => !isAllowlisted(path.join(repoRoot, f))));
}

// V1.1 — RECHECK is performed by the CLI, never declared: every recorded test is re-executed with its recorded cmd/shell.
function recheck() {
  const loop = ownLoop();
  const never = (loop.criteria.tests_required || []).filter((n) => !loop.tests[n]);
  if (never.length) refuse(`required tests never run: ${never.join(', ')} (run them with test first)`);
  const names = Object.keys(loop.tests || {});
  if (!names.length) refuse('no recorded test to re-run (run the tests with test first)');
  const recs = {};
  for (const n of names) { recs[n] = runCmd(loop.tests[n].cmd, loop.tests[n].shell, loop.tests[n].cwd); console.log(`[recheck] ${n}: ${recs[n].result} (exit ${recs[n].exit})`); }
  const results = Object.fromEntries(names.map((n) => [n, { result: recs[n].result, exit: recs[n].exit }]));
  const allPass = names.every((n) => recs[n].result === 'PASS');
  const atMs = Date.now();
  const l = mutate(loop.loop_id, (x) => {
    for (const n of names) { x.tests[n] = recs[n]; x.tests_history.push({ name: n, result: recs[n].result, exit: recs[n].exit, at: recs[n].at, recheck: true }); }
    if (x.tests_history.length > 200) x.tests_history.splice(0, x.tests_history.length - 200);
    x.recheck = { at: new Date(atMs).toISOString(), at_ms: atMs, session: sid, results, all_pass: allPass, git: repoDelta() };
    x.stage = allPass ? 'RECHECK' : 'FIX';
    x.stage_history.push({ stage: x.stage, at: x.recheck.at, session: sid, note: `recheck by CLI: ${allPass ? 'all PASS' : 'FAIL'}` });
  });
  log(l.loop_id, { event: 'RECHECK', all_pass: allPass, results, session: sid });
  done(allPass ? 'RECHECK_PASS' : 'RECHECK_FAIL', allPass ? 0 : 1, { results, next: allPass
    ? `JEV FINAL if required; update the canonical handoff ${l.handoff.path} with the verified result citing ${l.loop_id}; then complete in its own call`
    : 'FIX the failing tests, test them again, then recheck' });
}

function blocker() {
  const loop = ownLoop();
  if (sub === 'add') {
    const text = String(arg('--text') || '').trim();
    if (!text) done('USAGE', 2, { reason: 'blocker add --text "<txt>"' });
    const l = mutate(loop.loop_id, (x) => { x.blockers.push({ text, at: nowIso(), session: sid, resolved_at: null }); });
    log(l.loop_id, { event: 'BLOCKER_ADD', text });
    return done('OK', 0, summary(l));
  }
  if (sub === 'resolve') {
    const i = Number(arg('--index'));
    if (!loop.blockers[i] || loop.blockers[i].resolved_at) refuse(`no open blocker #${i}`);
    const l = mutate(loop.loop_id, (x) => { x.blockers[i].resolved_at = nowIso(); x.blockers[i].resolution = arg('--note') || null; });
    log(l.loop_id, { event: 'BLOCKER_RESOLVE', index: i });
    return done('OK', 0, summary(l));
  }
  done('USAGE', 2, { reason: 'blocker add|resolve' });
}

function note() {
  const text = String(arg('--text') || '').trim();
  if (!text) done('USAGE', 2, { reason: 'note --text "<txt>"' });
  const loop = ownLoop();
  const l = mutate(loop.loop_id, (x) => { (x.notes = x.notes || []).push({ at: nowIso(), session: sid, text }); if (x.notes.length > 200) x.notes.shift(); });
  done('OK', 0, summary(l));
}

// Records a JEV result (also used by jev-diff.mjs). diff != A => BLOCKED JEV_REJECTED (terminal).
export function recordJev(loopId, kind, rec) {
  const l = mutate(loopId, (x) => {
    x.jev[kind] = rec;
    (x.jev.history = x.jev.history || []).push({ kind, ...rec });
    if (kind === 'diff' && rec.result !== 'A') {
      x.status = 'BLOCKED'; x.stage = 'BLOCKED'; x.block_cause = 'JEV_REJECTED';
      x.block_detail = `JEV DIFF = ${rec.result} (request ${rec.request_id}, confidence ${rec.confidence})`;
      x.stage_history.push({ stage: 'BLOCKED', at: nowIso(), session: sid, note: x.block_detail });
    }
  });
  log(loopId, { event: `JEV_${kind.toUpperCase()}`, result: rec.result, request_id: rec.request_id, confidence: rec.confidence });
  if (l.status === 'BLOCKED') clearActive(loopId);
  return l;
}

function jevAdopt() {
  const kind = arg('--kind'), rid = arg('--request-id'), result = arg('--result');
  if (!['diff', 'final'].includes(kind) || !rid || !result) done('USAGE', 2, { reason: 'jev-adopt --kind diff|final --request-id <id> --result <X>' });
  const loop = ownLoop();
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.md')) files.push(p); } };
  try { walk(path.join(repoRoot, 'handoffs')); } catch { /* none */ }
  const src = files.find((f) => { const t = fs.readFileSync(f, 'utf8'); return t.includes(rid) && new RegExp(`\\b${result}\\b`).test(t); });
  if (!src) refuse(`request_id ${rid} with result ${result} not found in any handoffs/**/*.md (adopt only documented JEV results)`);
  const l = recordJev(loop.loop_id, kind, { result, confidence: arg('--confidence') ? Number(arg('--confidence')) : null, probabilities: null, request_id: rid, source: path.relative(repoRoot, src).replace(/\\/g, '/'), adopted: true, at: nowIso() });
  done(l.status === 'BLOCKED' ? 'BLOCKED' : 'OK', l.status === 'BLOCKED' ? 3 : 0, summary(l));
}

function complete() {
  const loop = ownLoop();
  const evidence = String(arg('--evidence') || '').trim();
  const errs = [];
  if (!evidence) errs.push('--evidence "<what was done / verified>" is required');
  const tests = Object.entries(loop.tests || {});
  const fails = tests.filter(([, v]) => v.result !== 'PASS').map(([k]) => k);
  if (fails.length) errs.push(`tests not PASS: ${fails.join(', ')}`);
  const pending = (loop.criteria.tests_required || []).filter((n) => loop.tests[n]?.result !== 'PASS');
  if (pending.length) errs.push(`required tests pending: ${pending.join(', ')}`);
  const open = loop.blockers.filter((b) => !b.resolved_at);
  if (open.length) errs.push(`open blockers: ${open.map((b) => b.text).join(' | ')}`);
  const real = realModifications(loop);
  if (real.length && !tests.length) errs.push(`real edits without any recorded test: ${real.slice(0, 5).join(', ')}`);
  if (real.length && loop.jev?.diff?.result !== 'A') errs.push('real edits require JEV DIFF = A');
  if (real.length && loop.criteria.jev_final !== 'forbidden_by_handoff' && loop.jev?.final?.result !== 'A') errs.push('JEV FINAL = A required (jev-diff.mjs --kind final)');
  if (!(latestHandoffMtime() > needFresh(loop))) errs.push('handoff not updated after the last work event (update handoffs/*.md)');
  // V1.1: completion is proven by the CLI's own recheck, bound to the current state and to the loop's canonical handoff.
  const rc = loop.recheck;
  if (!rc?.all_pass) errs.push('recheck required: run finish.mjs recheck (the CLI re-runs every recorded test, all PASS)');
  else {
    const late = (loop.files_modified || []).some((x) => !isHandoffMd(x.path) && Date.parse(x.at) > rc.at_ms)
      || Object.values(loop.tests || {}).some((t) => Date.parse(t.at) > rc.at_ms)
      || JSON.stringify(repoDelta()) !== JSON.stringify(rc.git);
    if (late) errs.push('recheck stale: work after recheck (run recheck again)');
    const hf = path.join(repoRoot, loop.handoff.path);
    let ok = false;
    try { ok = fs.statSync(hf).mtimeMs > rc.at_ms && fs.readFileSync(hf, 'utf8').includes(loop.loop_id); } catch { /* missing */ }
    if (!ok) errs.push(`canonical handoff ${loop.handoff.path} must be updated after recheck and reference ${loop.loop_id}`);
  }
  if (errs.length) {
    mutate(loop.loop_id, () => 'no-progress');
    log(loop.loop_id, { event: 'COMPLETE_REFUSED', errs });
    refuse('COMPLETE refused', { errors: errs, next: 'fix the items above; the loop continues' });
  }
  const l = mutate(loop.loop_id, (x) => {
    x.status = 'COMPLETE'; x.stage = 'COMPLETE'; x.completed_at = nowIso(); x.evidence = { text: evidence, verified: x.recheck }; x.real_modifications = real;
    x.stage_history.push({ stage: 'COMPLETE', at: x.completed_at, session: sid });
  });
  clearActive(l.loop_id);
  log(l.loop_id, { event: 'COMPLETE', session: sid });
  done('COMPLETE', 0, summary(l));
}

function block() {
  const loop = ownLoop();
  const cause = arg('--cause'), detail = String(arg('--detail') || '').trim();
  if (!cfg.block_causes.includes(cause)) done('USAGE', 2, { reason: `--cause one of ${cfg.block_causes.join('|')}` });
  if (detail.length < 10) done('USAGE', 2, { reason: '--detail "<precise cause, evidence, what would unblock>" required' });
  if (!(latestHandoffMtime() > needFresh(loop))) refuse('BLOCKED requires the handoff updated after the last work event (record the blocker and the exact next step)');
  const l = mutate(loop.loop_id, (x) => {
    x.status = 'BLOCKED'; x.stage = 'BLOCKED'; x.block_cause = cause; x.block_detail = detail; x.blocked_at = nowIso();
    x.stage_history.push({ stage: 'BLOCKED', at: x.blocked_at, session: sid, note: `${cause}: ${detail}` });
  });
  clearActive(l.loop_id);
  log(l.loop_id, { event: 'BLOCKED', cause, detail, session: sid });
  done('BLOCKED', 0, summary(l));
}

function cancel() {
  if (!argv.includes('--by-operator')) done('USAGE', 2, { reason: 'cancel --by-operator (operator command only)' });
  const id = activeLoopId();
  if (!id) refuse('no active loop');
  const l = withMutex(id, () => { const x = loadLoop(id); x.status = 'CANCELLED'; x.stage_history.push({ stage: 'CANCELLED', at: nowIso(), session: sid }); saveLoop(x); return x; });
  clearActive(id);
  log(id, { event: 'CANCELLED', session: sid });
  done('CANCELLED', 0, summary(l));
}

function status() {
  const id = arg('--loop') || activeLoopId();
  const l = loadLoop(id);
  if (!l) return done('NO_ACTIVE_LOOP', 0, { state_dir: stateDir });
  done(l.status, 0, { ...summary(l), lineage: l.lineage, stage_history: l.stage_history.slice(-8), file: loopFile(l.loop_id) });
}

const isEntry = !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase().endsWith(`${path.sep}finish.mjs`);
if (isEntry) {
  const table = { start, status, stage, 'require-test': requireTest, test, recheck,blocker, note, 'jev-adopt': jevAdopt, complete, block, cancel };
  if (!table[cmd]) done('USAGE', 2, { commands: Object.keys(table) });
  try { table[cmd](); } catch (e) { done('ERROR', 3, { error: String(e.message || e) }); }
}
// exported for jev-diff.mjs
export { TERMINAL, writeJson };
