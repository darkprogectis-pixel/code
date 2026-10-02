// /jev-finish V1 — shared state, mutex and Rotation Controller V3 integration (read-only).
// Loop state lives in $CLAUDE_CONFIG_DIR/jev-finish (same pattern as jev-rotation/).
// The rotation controller is only READ here: no lock, no window, no threshold, no brief is written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rank, maxLevel, levelFor, loadConfig as loadRotationConfig, measureTranscript } from '../jev-rotation/controller.mjs';
import { stateDir as rotStateDir, lockFile as rotLockFile } from '../jev-rotation/hook.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const env = process.env;
export const TEST = env.JEV_FINISH_TEST === '1';
export const repoRoot = (TEST && env.JEV_FINISH_REPO_ROOT) || path.resolve(HERE, '..', '..');
export const stateDir = (TEST && env.JEV_FINISH_STATE_DIR)
  || path.join(env.CLAUDE_CONFIG_DIR || path.join(env.USERPROFILE || env.HOME || '.', '.claude'), 'jev-finish');
export const loopsDir = path.join(stateDir, 'loops');
export const activeFile = path.join(stateDir, 'active.json');
export const lastFile = path.join(stateDir, 'last.json');
export const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));

export const STAGES = ['INIT', 'LOAD_HANDOFF', 'JEV_PRECHECK', 'PLAN', 'EXECUTE', 'TEST', 'FIX', 'RECHECK', 'ROTATE_IF_NEEDED', 'JEV_FINAL', 'COMPLETE', 'BLOCKED'];
// Transitions the CLI accepts for `stage`. COMPLETE/BLOCKED only through `complete`/`block`.
export const NEXT = {
  INIT: ['LOAD_HANDOFF'],
  LOAD_HANDOFF: ['JEV_PRECHECK', 'PLAN'],
  JEV_PRECHECK: ['PLAN', 'EXECUTE'],
  PLAN: ['JEV_PRECHECK', 'EXECUTE'],
  EXECUTE: ['TEST', 'PLAN', 'JEV_PRECHECK'],
  TEST: ['FIX', 'RECHECK', 'EXECUTE'],
  FIX: ['TEST'],
  RECHECK: ['JEV_FINAL', 'FIX', 'TEST', 'EXECUTE', 'PLAN'],
  JEV_FINAL: ['FIX', 'RECHECK'],
};
export const TERMINAL = new Set(['COMPLETE', 'BLOCKED', 'CANCELLED']);

export const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export const nowIso = () => new Date().toISOString();
export const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
export const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; }
      sleepMs(25);
    }
  }
}
export const writeJson = (file, obj) => writeAtomic(file, JSON.stringify(obj, null, 2));

// O_EXCL mutex per loop; a holder that died leaves a stale file, broken after mutex_stale_ms.
export function withMutex(id, fn) {
  fs.mkdirSync(loopsDir, { recursive: true });
  const m = path.join(loopsDir, `${id}.mutex`);
  const t0 = Date.now();
  let fd;
  for (;;) {
    try { fd = fs.openSync(m, 'wx'); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(m).mtimeMs > cfg.mutex_stale_ms) { fs.rmSync(m, { force: true }); continue; } } catch { continue; }
      if (Date.now() - t0 > cfg.mutex_wait_ms) throw new Error(`jev-finish mutex timeout (${m})`);
      sleepMs(15 + Math.floor(Math.random() * 20));
    }
  }
  try { fs.writeSync(fd, String(process.pid)); return fn(); } finally { fs.closeSync(fd); fs.rmSync(m, { force: true }); }
}

export const loopFile = (id) => path.join(loopsDir, `${id}.json`);
export const logFile = (id) => path.join(loopsDir, `${id}.log.jsonl`);
export const hbFile = (id) => path.join(loopsDir, `${id}.hb.json`);
// A crash between write and rename never corrupts the loop file; a damaged file falls back to .prev.
export function loadLoop(id) { return id ? (readJson(loopFile(id)) || readJson(`${loopFile(id)}.prev`)) : null; }
export function saveLoop(loop) {
  loop.updated_at = nowIso();
  const f = loopFile(loop.loop_id);
  if (fs.existsSync(f)) { try { fs.copyFileSync(f, `${f}.prev`); } catch { /* best effort */ } }
  writeJson(f, loop);
}
export function log(id, rec) {
  fs.mkdirSync(loopsDir, { recursive: true });
  fs.appendFileSync(logFile(id), JSON.stringify({ at: nowIso(), ...rec }) + '\n');
}
export function heartbeat(id, sid, event) { try { writeJson(hbFile(id), { session: sid, event, at: nowIso(), at_ms: Date.now() }); } catch { /* best effort */ } }
export const activeLoopId = () => readJson(activeFile)?.loop_id || null;
export function activeLoop() { const id = activeLoopId(); const l = loadLoop(id); return l && !TERMINAL.has(l.status) ? l : null; }
export function clearActive(id) {
  try { writeJson(lastFile, { loop_id: id, at: nowIso() }); } catch { /* best effort */ }
  if (activeLoopId() === id) fs.rmSync(activeFile, { force: true });
}
// After JEV != A the loop is terminal, but real edits stay denied for its owner session (sticky JEV gate).
export function jevRejectedFor(sid) {
  const l = loadLoop(readJson(lastFile)?.loop_id);
  return l && l.status === 'BLOCKED' && l.block_cause === 'JEV_REJECTED' && l.owner_session === sid ? l : null;
}

// Mutates under the loop mutex, always re-reading from disk (concurrent hooks / CLI / successor).
export function mutate(id, fn) {
  return withMutex(id, () => {
    const loop = loadLoop(id);
    if (!loop) throw new Error(`loop ${id} not found`);
    const r = fn(loop);
    if (r !== false) { loop.progress_seq = (loop.progress_seq || 0) + (r === 'no-progress' ? 0 : 1); saveLoop(loop); }
    return loop;
  });
}

// ---- Rotation Controller V3 (read-only) ----
export const rotState = (sid) => readJson(path.join(rotStateDir, 'state', `${sid}.json`));
export const rotLock = (sid) => readJson(rotLockFile(sid));
export const isRotated = (sid) => fs.existsSync(rotLockFile(sid));
export function isSuperseded(sid) {
  const p = rotState(sid)?.predecessor;
  if (!p) return false;
  const l = rotLock(p.from);
  return !!(l && l.successor && l.successor !== sid);
}
// Effective rotation level = max(measured from the transcript, sticky level of the controller).
export function rotationLevel(sid, transcriptPath) {
  let th;
  try { th = loadRotationConfig(env).thresholds; } catch { return { level: 'OK', tokens: null }; }
  const m = measureTranscript(transcriptPath);
  const measured = m.tokens === null ? 'OK' : levelFor(m.tokens, th);
  const sticky = rotState(sid)?.max_level || 'OK';
  return { level: maxLevel(measured, sticky), tokens: m.tokens, rank: rank(maxLevel(measured, sticky)) };
}
export { rank };

// Successor claim: sid may take the loop when its controller predecessor owned it (or owned it through a
// superseded successor of the same predecessor) and sid is the successor recorded in the predecessor lock.
export function tryClaim(sid, via = 'rotation') {
  const loop = activeLoop();
  if (!loop || loop.owner_session === sid) return loop;
  const pred = rotState(sid)?.predecessor;
  if (!pred) return loop;
  const pl = rotLock(pred.from);
  if (!pl || pl.successor !== sid) return loop;
  const ownerPred = rotState(loop.owner_session)?.predecessor;
  const ok = loop.owner_session === pred.from || (ownerPred && ownerPred.from === pred.from && loop.owner_session !== sid);
  if (!ok) return loop;
  return withMutex(loop.loop_id, () => {
    const cur = loadLoop(loop.loop_id);
    if (!cur || TERMINAL.has(cur.status) || cur.owner_session === sid) return cur;
    const ownerPred2 = rotState(cur.owner_session)?.predecessor;
    if (!(cur.owner_session === pred.from || (ownerPred2 && ownerPred2.from === pred.from))) return cur;
    const prev = cur.owner_session;
    cur.owner_session = sid;
    cur.lineage.push({ session: sid, via, from: prev, depth: pred.depth, root: pred.root, at: nowIso() });
    cur.rotation_yield = null;
    saveLoop(cur);
    log(cur.loop_id, { event: 'CLAIMED', session: sid, from: prev, via });
    return cur;
  });
}

// ---- paths ----
const tmpClaude = norm(path.join(os.tmpdir(), 'claude')) + '/';
export function isAllowlisted(p) {
  if (!p) return false;
  const n = norm(path.isAbsolute(p) ? p : path.join(repoRoot, p));
  const pre = [norm(path.join(repoRoot, 'handoffs')) + '/', tmpClaude, norm(stateDir) + '/', ...cfg.allow_write_prefixes.map((x) => norm(x) + '/')];
  return pre.some((x) => n.startsWith(x));
}
export const isHandoffMd = (p) => { const n = norm(p); const d = norm(path.join(repoRoot, 'handoffs')) + '/'; return n.startsWith(d) && n.endsWith('.md'); };
const forbidden = () => (TEST && env.JEV_FINISH_FORBIDDEN ? env.JEV_FINISH_FORBIDDEN.split('|') : cfg.forbidden_write_prefixes).map((x) => norm(x) + '/');
export function isForbiddenPath(p) { if (!p) return false; const n = norm(path.isAbsolute(p) ? p : path.join(repoRoot, p)); return forbidden().some((x) => n.startsWith(x) || `${n}/` === x); }
const WRITE_VERB = /(^|[\s;|&(])(cp|mv|rm|del|copy|move|xcopy|robocopy|tee|touch|mkdir|copy-item|move-item|remove-item|rename-item|set-content|add-content|out-file|new-item|clear-content|sed\s+-i)\b|>{1,2}/i;
export function bashHitsForbidden(command) {
  // backslashes -> '/', lower case, Git Bash /c/... -> c:/...
  const c = String(command || '').replace(/\\+/g, '/').toLowerCase().replace(/(^|[\s"'=(])\/([a-z])\//g, '$1$2:/');
  return forbidden().some((x) => c.includes(x.replace(/\/$/, ''))) && WRITE_VERB.test(c);
}

// ---- handoff / git ----
export function handoffs() {
  const dir = path.join(repoRoot, 'handoffs');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
      .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}
export const latestHandoffMtime = () => handoffs()[0]?.mtime || 0;
export function gitChanged() {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = {};
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const f = line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop();
      const abs = path.join(repoRoot, f);
      let sig = 'D'; try { const s = fs.statSync(abs); sig = `${s.size}:${s.mtimeMs}`; } catch { /* deleted */ }
      m[f] = sig;
    }
    return m;
  } catch { return null; }
}

// Last "work" instant (tests or non-handoff modifications); the handoff must be newer than it.
export function lastWorkMs(loop) {
  const t = Object.values(loop.tests || {}).map((x) => Date.parse(x.at) || 0);
  const f = (loop.files_modified || []).filter((x) => !isHandoffMd(x.path)).map((x) => Date.parse(x.at) || 0);
  return Math.max(0, ...t, ...f);
}
export const handoffFresh = (loop) => latestHandoffMtime() > lastWorkMs(loop);

// Real (non-allowlisted) modifications: tracked by PostToolUse + git delta since start (covers shell edits in the repo).
export function realModifications(loop) {
  const set = new Set((loop.files_modified || []).filter((x) => !x.allowlisted).map((x) => norm(x.path)));
  const now = gitChanged();
  if (now && loop.git_at_start) {
    for (const [f, sig] of Object.entries(now)) {
      if (loop.git_at_start[f] === sig) continue;
      const abs = path.join(repoRoot, f);
      if (!isAllowlisted(abs)) set.add(norm(abs));
    }
  }
  return [...set];
}

export function summary(loop) {
  const tests = Object.entries(loop.tests || {});
  return {
    loop_id: loop.loop_id, status: loop.status, stage: loop.stage, objective: loop.objective, owner_session: loop.owner_session,
    iteration: loop.iteration, max_iterations: loop.max_iterations, handoff: loop.handoff?.path,
    tests_fail: tests.filter(([, v]) => v.result !== 'PASS').map(([k]) => k),
    tests_pending: (loop.criteria?.tests_required || []).filter((n) => loop.tests?.[n]?.result !== 'PASS'),
    blockers_open: (loop.blockers || []).filter((b) => !b.resolved_at).map((b) => b.text),
    jev_diff: loop.jev?.diff?.result || null, jev_final: loop.jev?.final?.result || null, block_cause: loop.block_cause || null,
  };
}
