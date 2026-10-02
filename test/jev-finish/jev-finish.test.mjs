// /jev-finish V1 — JF1–JF18 + extras. Every case runs the REAL processes (tools/jev-finish/{finish,hook,jev-diff}.mjs and,
// for rotation, tools/jev-rotation/hook.mjs in dry-run spawn) against temporary dirs. Nothing live is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIN = path.join(ROOT, 'tools', 'jev-finish');
const ROT_HOOK = path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs');
const LIVE_SENTINELS = ['C:/Users/ADM/.claude/aot/aot-sim.js', 'C:/Users/ADM/.claude/aot/aot-bff.js'];
const liveMtimes = () => LIVE_SENTINELS.map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } });
const LIVE_BEFORE = liveMtimes();
const sha = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
const GUARDED = [path.join(ROOT, '.claude', 'settings.local.json'), path.join(ROOT, '.claude', 'settings.json'), path.join(ROOT, 'tools', 'jev-rotation', 'config.json'),
  ...(process.env.CLAUDE_CONFIG_DIR ? [path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')] : [])];
const GUARDED_BEFORE = GUARDED.map(sha);

function sandbox(opts = {}) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'jf-test-'));
  const repo = path.join(t, 'repo');
  fs.mkdirSync(path.join(repo, 'handoffs'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(t, 'live'), { recursive: true });
  fs.mkdirSync(path.join(t, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(t, 'cfg', 'settings.json'), JSON.stringify({ permissions: { allow: ['Read'] }, hooks: {} }));
  const old = path.join(repo, 'handoffs', 'HANDOFF_OLD.md');
  fs.writeFileSync(old, '# old\n');
  const past = new Date(Date.now() - 3600e3); fs.utimesSync(old, past, past);
  fs.writeFileSync(path.join(repo, 'handoffs', 'HANDOFF_CANON.md'), '# canon\nJEV req_documented_123 result A\n');
  const env = { ...process.env, JEV_FINISH_TEST: '1', JEV_FINISH_STATE_DIR: path.join(t, 'fin'), JEV_FINISH_REPO_ROOT: repo, JEV_FINISH_FORBIDDEN: path.join(t, 'live'),
    JEV_ROTATION_TEST: '1', JEV_ROTATION_STATE_DIR: path.join(t, 'rot'), JEV_ROTATION_REPO_ROOT: repo, JEV_ROTATION_SPAWN: 'dry', JEV_ROTATION_WATCHDOG: 'off',
    CLAUDE_CONFIG_DIR: path.join(t, 'cfg'), JEV_ROTATION_THRESHOLDS: opts.thresholds || '1000,2000,3000,4000,5000' };
  delete env.CLAUDE_CODE_SESSION_ID;
  const tp = (sid, tokens) => { const f = path.join(t, `${sid}.jsonl`); fs.writeFileSync(f, JSON.stringify({ type: 'assistant', uuid: crypto.randomUUID(), message: { usage: { input_tokens: 1, cache_read_input_tokens: Math.max(0, tokens - 1), output_tokens: 0 } } }) + '\n'); return f; };
  const parse = (s) => { const i = s.lastIndexOf('{\n  "jev_finish"'); try { return JSON.parse(s.slice(i)); } catch { return null; } };
  const cli = (sid, ...a) => { const r = spawnSync(process.execPath, [path.join(FIN, 'finish.mjs'), ...a, ...(sid ? ['--session', sid] : [])], { env, encoding: 'utf8', cwd: repo }); return { code: r.status, out: parse(r.stdout), raw: r.stdout + r.stderr }; };
  const jev = (sid, kind, choice, extra = {}) => {
    const mock = path.join(t, `mock-${crypto.randomUUID()}.json`);
    fs.writeFileSync(mock, JSON.stringify({ choice, confidence: 0.9, probabilities: { [choice]: 0.9 }, request_id: `req_mock_${choice}`, ...extra }));
    const prop = path.join(repo, 'handoffs', `prop-${kind}.txt`); fs.writeFileSync(prop, 'PROPOSAL '.repeat(40));
    const r = spawnSync(process.execPath, [path.join(FIN, 'jev-diff.mjs'), '--kind', kind, '--proposal', prop, '--session', sid], { env: { ...env, JEV_FINISH_JEV_MOCK: mock }, encoding: 'utf8', cwd: repo });
    return { code: r.status, out: parse(r.stdout), raw: r.stdout + r.stderr };
  };
  const hookIn = (sid, event, extra = {}, tokens = 10) => ({ session_id: sid, hook_event_name: event, transcript_path: tp(sid, tokens), cwd: repo, ...extra });
  const hook = (input, file = path.join(FIN, 'hook.mjs'), e = env) => { const r = spawnSync(process.execPath, [file], { input: JSON.stringify(input), env: e, encoding: 'utf8' }); return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr }; };
  const hookAsync = (input, file = path.join(FIN, 'hook.mjs')) => new Promise((res) => {
    const c = spawn(process.execPath, [file], { env }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('close', (code) => res({ code, out: o ? JSON.parse(o) : null })); c.stdin.end(JSON.stringify(input));
  });
  const cliAsync = (sid, ...a) => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(FIN, 'finish.mjs'), ...a, '--session', sid], { env, cwd: repo }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('close', (code) => res({ code, out: parse(o) }));
  });
  const loop = () => { const a = JSON.parse(fs.readFileSync(path.join(t, 'fin', 'active.json'), 'utf8')); return JSON.parse(fs.readFileSync(path.join(t, 'fin', 'loops', `${a.loop_id}.json`), 'utf8')); };
  const loopById = (id) => JSON.parse(fs.readFileSync(path.join(t, 'fin', 'loops', `${id}.json`), 'utf8'));
  const logOf = (id) => fs.readFileSync(path.join(t, 'fin', 'loops', `${id}.log.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const touchHandoff = (text = '', name = 'HANDOFF_CANON.md') => { const f = path.join(repo, 'handoffs', name); fs.appendFileSync(f, `\nupdate ${Date.now()} ${text}\n`); const d = new Date(Date.now() + 2000); fs.utimesSync(f, d, d); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  return { t, repo, env, tp, cli, jev, hook, hookIn, hookAsync, cliAsync, loop, loopById, logOf, touchHandoff, wait };
}
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const C3 = 'cccccccc-0000-4000-8000-000000000003';

test('JF1 — command accepts an objective (and refuses an empty one)', () => {
  const s = sandbox();
  const r = s.cli(A, 'start', '--objective', 'concluir a etapa atual');
  assert.equal(r.code, 0, r.raw); assert.equal(r.out.jev_finish, 'STARTED');
  const l = s.loop();
  assert.equal(l.objective, 'concluir a etapa atual'); assert.equal(l.status, 'ACTIVE'); assert.equal(l.owner_session, A);
  assert.deepEqual(l.stage_history.map((x) => x.stage), ['INIT', 'LOAD_HANDOFF']);
  const s2 = sandbox();
  assert.equal(s2.cli(A, 'start', '--objective', '   ').code, 2);
  assert.equal(s2.cli(A, 'start').code, 2);
});

test('JF2 — loads the canonical handoff (most recent handoffs/*.md; override; missing => refused)', () => {
  const s = sandbox();
  assert.equal(s.cli(A, 'start', '--objective', 'x').code, 0);
  const l = s.loop();
  assert.equal(l.handoff.path, 'handoffs/HANDOFF_CANON.md');
  assert.equal(l.handoff.sha_at_start, crypto.createHash('sha256').update(fs.readFileSync(path.join(s.repo, l.handoff.path), 'utf8')).digest('hex').slice(0, 16));
  const s2 = sandbox();
  assert.equal(s2.cli(A, 'start', '--objective', 'x', '--handoff', 'handoffs/HANDOFF_OLD.md').code, 0);
  assert.equal(s2.loop().handoff.path, 'handoffs/HANDOFF_OLD.md');
  const s3 = sandbox();
  assert.equal(s3.cli(A, 'start', '--objective', 'x', '--handoff', 'handoffs/NOPE.md').code, 3);
});

test('JF3 — JEV required before a real Edit (handoff/scratch edits allowed; EXECUTE refused)', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const real = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } }));
  assert.equal(real.out?.hookSpecificOutput?.permissionDecision, 'deny'); assert.match(real.out.hookSpecificOutput.permissionDecisionReason, /JEV_GATE/);
  const ho = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(s.repo, 'handoffs', 'p.md') } }));
  assert.equal(ho.out, null);
  const scratch = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(os.tmpdir(), 'claude', 'x', 'scratchpad', 'f.txt') } }));
  assert.equal(scratch.out, null);
  assert.equal(s.cli(A, 'stage', 'PLAN').code, 0);
  const ex = s.cli(A, 'stage', 'EXECUTE'); assert.equal(ex.code, 3); assert.match(ex.out.reason, /JEV DIFF = A/);
});

test('JF4 — JEV != A blocks implementation (loop BLOCKED JEV_REJECTED, edits stay denied)', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const id = s.loop().loop_id;
  const r = s.jev(A, 'diff', 'G');
  assert.equal(r.code, 1, r.raw);
  const l = s.loopById(id);
  assert.equal(l.status, 'BLOCKED'); assert.equal(l.block_cause, 'JEV_REJECTED'); assert.equal(l.jev.diff.request_id, 'req_mock_G');
  assert.equal(fs.existsSync(path.join(s.t, 'fin', 'active.json')), false);
  const e = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } }));
  assert.equal(e.out?.hookSpecificOutput?.permissionDecision, 'deny'); assert.match(e.out.hookSpecificOutput.permissionDecisionReason, /JEV_REJECTED/);
  assert.equal(s.cli(A, 'stage', 'EXECUTE').code, 3);
  assert.equal(s.hook(s.hookIn(A, 'Stop')).out, null, 'stop allowed after BLOCKED');
});

test('JF5 — JEV A allows automatic continuation', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  assert.equal(s.jev(A, 'diff', 'A').code, 0);
  assert.equal(s.cli(A, 'stage', 'PLAN').code, 0);
  assert.equal(s.cli(A, 'stage', 'EXECUTE').code, 0);
  const e = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } }));
  assert.equal(e.out, null);
  const st = s.hook(s.hookIn(A, 'Stop'));
  assert.equal(st.out.decision, 'block'); assert.match(st.out.reason, /NÃO do operador/); assert.match(st.out.reason, /Objetivo \(original, do operador\): "x"/);
});

test('JF6 — test FAIL => new iteration, never COMPLETE', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const r = s.cli(A, 'test', '--name', 'unit', '--cmd', 'node -e "process.exit(3)"');
  assert.equal(r.code, 1); assert.equal(r.out.jev_finish, 'TEST_FAIL');
  assert.equal(s.loop().tests.unit.result, 'FAIL');
  s.touchHandoff();
  const c = s.cli(A, 'complete', '--evidence', 'tentativa');
  assert.equal(c.code, 3); assert.ok(c.out.errors.some((e) => /unit/.test(e)));
  const st = s.hook(s.hookIn(A, 'Stop'));
  assert.equal(st.out.decision, 'block'); assert.match(st.out.reason, /testes FAIL: unit/);
  assert.equal(s.loop().iteration, 1); assert.equal(s.loop().status, 'ACTIVE');
});

test('JF7 — test PASS lets the loop advance', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--require-test', 'unit');
  s.jev(A, 'diff', 'A'); s.cli(A, 'stage', 'PLAN'); s.cli(A, 'stage', 'EXECUTE'); s.cli(A, 'stage', 'TEST');
  assert.equal(s.cli(A, 'test', '--name', 'unit', '--cmd', 'node -e "process.exit(1)"').code, 1);
  assert.equal(s.cli(A, 'stage', 'FIX').code, 0); assert.equal(s.cli(A, 'stage', 'TEST').code, 0);
  const r = s.cli(A, 'test', '--name', 'unit', '--cmd', 'node -e "process.exit(0)"');
  assert.equal(r.code, 0); assert.equal(s.loop().tests.unit.result, 'PASS');
  assert.equal(s.cli(A, 'recheck').code, 0); assert.equal(s.loop().stage, 'RECHECK');
  assert.equal(s.cli(A, 'stage', 'COMPLETE').code, 3, 'COMPLETE only via complete');
});

test('JF8 — handoff must be updated before COMPLETE/BLOCKED and before Stop at WARNING', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  assert.equal(s.cli(A, 'test', '--name', 'u', '--cmd', 'node -e "0"').code, 0);
  const c1 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c1.code, 3); assert.ok(c1.out.errors.some((e) => /handoff not updated/.test(e)));
  assert.equal(s.cli(A, 'block', '--cause', 'EXTERNAL_DEPENDENCY', '--detail', 'servidor externo fora').code, 3);
  // WARNING crossed (rotation hook, test thresholds) and handoff stale => continuation demands the handoff first
  s.hook(s.hookIn(A, 'UserPromptSubmit', { prompt: 'x' }, 2500), ROT_HOOK);
  const st = s.hook(s.hookIn(A, 'Stop', {}, 2500));
  assert.equal(st.out.decision, 'block'); assert.match(st.out.reason, /PRIMEIRO atualize o handoff/);
  assert.equal(s.cli(A, 'recheck').code, 0);
  s.touchHandoff(s.loop().loop_id);
  const c2 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c2.code, 0, JSON.stringify(c2.out)); assert.equal(c2.out.jev_finish, 'COMPLETE');
});

test('JF9 — at the rotation condition the Rotation Controller V3 alone rotates (jev-finish yields, exactly one lock)', async () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const id = s.loop().loop_id;
  const input = s.hookIn(A, 'Stop', { stop_hook_active: true }, 3500); // SOFT_STOP with test thresholds
  const [jf, rot] = await Promise.all([s.hookAsync(input), s.hookAsync(input, ROT_HOOK)]);
  assert.notEqual(jf.out?.decision, 'block'); assert.match(jf.out.systemMessage, /cede o Stop ao Rotation Controller V3/);
  assert.notEqual(rot.out?.decision, 'block');
  const locks = fs.readdirSync(path.join(s.t, 'rot', 'rotation')).filter((f) => f.endsWith('.lock'));
  assert.deepEqual(locks, [`${A}.lock`]);
  const lin = fs.readFileSync(path.join(s.t, 'rot', 'lineage.jsonl'), 'utf8').split('\n').filter((l) => l.includes('ROTATION_TRIGGERED'));
  assert.equal(lin.length, 1);
  assert.ok(s.loopById(id).rotation_yield); assert.ok(s.logOf(id).some((e) => e.event === 'YIELD_TO_ROTATION'));
  // jev-finish source never writes rotation state
  const src = ['hook.mjs', 'lib.mjs', 'finish.mjs', 'jev-diff.mjs'].map((f) => fs.readFileSync(path.join(FIN, f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /\brotate\(|openWindow|writeLauncher|writeBrief|lineage\(/);
});

function rotateA(s, tokens = 4500) { // HARD rotation of A by the REAL rotation hook (dry spawn)
  s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }, tokens), ROT_HOOK);
  return JSON.parse(fs.readFileSync(path.join(s.t, 'rot', 'rotation', `${A}.lock`), 'utf8'));
}

test('JF10 — the successor receives and continues the SAME objective automatically', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'objetivo original');
  const id = s.loop().loop_id;
  const lock = rotateA(s);
  const B = lock.successor;
  const ss = s.hook(s.hookIn(B, 'SessionStart', { source: 'startup' }));
  assert.match(ss.out.hookSpecificOutput.additionalContext, /objetivo original/);
  assert.match(ss.out.hookSpecificOutput.additionalContext, /Continue AUTOMATICAMENTE o MESMO loop/);
  const l = s.loopById(id);
  assert.equal(l.owner_session, B); assert.equal(l.lineage.at(-1).via, 'rotation'); assert.equal(l.lineage.at(-1).from, A);
  const st = s.hook(s.hookIn(B, 'Stop'));
  assert.equal(st.out.decision, 'block'); assert.match(st.out.reason, /objetivo original/);
  assert.equal(s.cli(B, 'stage', 'PLAN').code, 0);
});

test('JF11 — the predecessor is READ_ONLY and does not keep working', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const id = s.loop().loop_id;
  rotateA(s);
  assert.equal(s.hook(s.hookIn(A, 'Stop')).out, null);
  assert.equal(s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } })).out, null);
  const r = s.cli(A, 'stage', 'PLAN'); assert.equal(r.code, 3); assert.match(r.out.reason, /ROTATED_READ_ONLY|not the owner/);
  assert.equal(s.cli(A, 'start', '--objective', 'x').code, 3);
  assert.equal(s.loopById(id).iteration, 0, 'no iteration from the predecessor');
  const rot = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'x' } }), ROT_HOOK);
  assert.equal(rot.out.hookSpecificOutput.permissionDecision, 'deny'); // controller keeps owning READ_ONLY
});

test('JF12 — concurrent continuations => exactly one valid execution', async () => {
  const s = sandbox();
  const starts = await Promise.all(Array.from({ length: 8 }, (_, i) => s.cliAsync(`sess-${i}`, 'start', '--objective', 'x')));
  assert.equal(starts.filter((r) => r.out?.jev_finish === 'STARTED').length, 1, JSON.stringify(starts.map((r) => r.out)));
  assert.equal(fs.readdirSync(path.join(s.t, 'fin', 'loops')).filter((f) => /^jf-[^.]+\.json$/.test(f)).length, 1);
  // rotation: legit successor B vs an impostor C, concurrent SessionStart + Stop
  const s2 = sandbox();
  s2.cli(A, 'start', '--objective', 'x');
  const id = s2.loop().loop_id;
  const B = rotateA(s2).successor;
  const res = await Promise.all([
    ...Array.from({ length: 4 }, () => s2.hookAsync(s2.hookIn(B, 'SessionStart', { source: 'startup' }))),
    ...Array.from({ length: 4 }, () => s2.hookAsync(s2.hookIn(C3, 'SessionStart', { source: 'startup' }))),
  ]);
  assert.equal(res.slice(4).filter((r) => r.out).length, 0, 'impostor gets nothing');
  const l = s2.loopById(id);
  assert.equal(l.owner_session, B);
  assert.equal(s2.logOf(id).filter((e) => e.event === 'CLAIMED').length, 1);
  const stops = await Promise.all([s2.hookAsync(s2.hookIn(C3, 'Stop')), s2.hookAsync(s2.hookIn(A, 'Stop')), s2.hookAsync(s2.hookIn(B, 'Stop'))]);
  assert.deepEqual(stops.map((r) => r.out?.decision || null), [null, null, 'block']);
});

test('JF13 — restart/crash recovers the persisted state', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  s.cli(A, 'stage', 'PLAN');
  const id = s.loop().loop_id;
  const lf = path.join(s.t, 'fin', 'loops', `${id}.json`);
  // crash while holding the mutex + a half-written tmp file
  const mutex = path.join(s.t, 'fin', 'loops', `${id}.mutex`);
  fs.writeFileSync(mutex, '99999'); const old = new Date(Date.now() - 60e3); fs.utimesSync(mutex, old, old);
  fs.writeFileSync(`${lf}.123.tmp`, '{"broken":');
  assert.equal(s.cli(A, 'note', '--text', 'after crash').code, 0);
  assert.equal(s.loop().stage, 'PLAN');
  // corrupted main file => falls back to .prev
  fs.writeFileSync(lf, '{corrupt');
  assert.equal(s.cli(A, 'status').out.stage, 'PLAN');
  // resume of the same owner session re-injects the loop
  const ss = s.hook(s.hookIn(A, 'SessionStart', { source: 'resume' }));
  assert.match(ss.out.hookSpecificOutput.additionalContext, /ATIVO nesta sessão/);
  // a new session adopts only when the owner heartbeat is stale
  assert.equal(s.cli(B2, 'start', '--objective', 'x').code, 3);
  const hb = path.join(s.t, 'fin', 'loops', `${id}.hb.json`);
  fs.writeFileSync(hb, JSON.stringify({ session: A, at_ms: Date.now() - 3600e3 }));
  const ad = s.cli(B2, 'start', '--objective', 'continuar');
  assert.equal(ad.out.jev_finish, 'ADOPTED'); assert.equal(s.loop().owner_session, B2); assert.equal(s.loop().objective, 'x');
});

test('JF14 — true completion condition ends the loop', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--require-test', 'u');
  const id = s.loop().loop_id;
  s.jev(A, 'diff', 'A'); s.cli(A, 'stage', 'PLAN'); s.cli(A, 'stage', 'EXECUTE');
  fs.writeFileSync(path.join(s.repo, 'src', 'a.js'), '1');
  s.hook(s.hookIn(A, 'PostToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } }));
  s.cli(A, 'stage', 'TEST'); s.cli(A, 'test', '--name', 'u', '--cmd', 'node -e "0"');
  s.touchHandoff();
  const c0 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c0.code, 3); assert.ok(c0.out.errors.some((e) => /JEV FINAL/.test(e)), 'real edit => JEV FINAL required');
  assert.equal(s.cli(A, 'recheck').code, 0); assert.equal(s.cli(A, 'stage', 'JEV_FINAL').code, 0);
  assert.equal(s.jev(A, 'final', 'A').code, 0);
  s.touchHandoff(id);
  const c = s.cli(A, 'complete', '--evidence', 'objetivo cumprido, u PASS');
  assert.equal(c.code, 0, JSON.stringify(c.out)); assert.equal(c.out.jev_finish, 'COMPLETE');
  assert.equal(s.loopById(id).status, 'COMPLETE'); assert.equal(s.loopById(id).evidence.verified.all_pass, true);
  assert.equal(s.hook(s.hookIn(A, 'Stop')).out, null);
});

test('JF15 — max iterations prevents an infinite loop (and NO_PROGRESS stall guard)', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--max-iterations', '2');
  const id = s.loop().loop_id;
  assert.equal(s.hook(s.hookIn(A, 'Stop')).out.decision, 'block');
  s.cli(A, 'note', '--text', 'p1');
  assert.equal(s.hook(s.hookIn(A, 'Stop', { stop_hook_active: true })).out.decision, 'block');
  s.cli(A, 'note', '--text', 'p2');
  const third = s.hook(s.hookIn(A, 'Stop', { stop_hook_active: true }));
  assert.notEqual(third.out?.decision, 'block'); assert.match(third.out.systemMessage, /MAX_ITERATIONS/);
  assert.equal(s.loopById(id).status, 'BLOCKED'); assert.equal(s.loopById(id).block_cause, 'MAX_ITERATIONS');
  const s2 = sandbox();
  s2.cli(A, 'start', '--objective', 'x');
  const id2 = s2.loop().loop_id;
  const outs = Array.from({ length: 8 }, () => s2.hook(s2.hookIn(A, 'Stop', { stop_hook_active: true })).out);
  assert.equal(outs.filter((o) => o?.decision === 'block').length, 6);
  assert.equal(s2.loopById(id2).block_cause, 'NO_PROGRESS');
  assert.ok(s2.logOf(id2).filter((e) => e.event === 'ITERATION').every((e) => typeof e.reason === 'string'));
});

test('JF16 — external blocker => BLOCKED with the precise cause', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const id = s.loop().loop_id;
  assert.equal(s.cli(A, 'block', '--cause', 'BECAUSE', '--detail', 'xxxxxxxxxxxx').code, 2);
  assert.equal(s.cli(A, 'block', '--cause', 'EXTERNAL_DEPENDENCY', '--detail', 'x').code, 2);
  s.touchHandoff();
  const r = s.cli(A, 'block', '--cause', 'EXTERNAL_DEPENDENCY', '--detail', 'API TypeSafe HTTP 503 há 30 min; desbloqueia quando voltar');
  assert.equal(r.code, 0); assert.equal(r.out.jev_finish, 'BLOCKED');
  const l = s.loopById(id);
  assert.equal(l.block_cause, 'EXTERNAL_DEPENDENCY'); assert.match(l.block_detail, /HTTP 503/);
  assert.equal(s.hook(s.hookIn(A, 'Stop')).out, null);
});

test('JF17 — no change to Auto Mode / permissions / policy / settings', () => {
  const s = sandbox();
  const cfgSettings = path.join(s.t, 'cfg', 'settings.json');
  const before = fs.readFileSync(cfgSettings, 'utf8');
  s.cli(A, 'start', '--objective', 'x'); s.jev(A, 'diff', 'A'); s.cli(A, 'stage', 'PLAN');
  s.hook(s.hookIn(A, 'Stop')); s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } }));
  assert.equal(fs.readFileSync(cfgSettings, 'utf8'), before);
  const code = ['hook.mjs', 'lib.mjs', 'finish.mjs', 'jev-diff.mjs'].map((f) => fs.readFileSync(path.join(FIN, f), 'utf8')).join('\n')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /settings(\.local)?\.json|defaultMode|permissions\s*[:=]|\bpermission-mode\b|classifier/i);
  const proj = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(Object.keys(proj), ['hooks']);
  for (const groups of Object.values(proj.hooks)) for (const g of groups) for (const h of g.hooks) {
    assert.match(h.command, /tools\/jev-finish\/hook\.mjs" # jev-finish-v1$/);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'jev-finish', 'hook.mjs')));
});

test('JF18 — no effect on live/F5/orders (live guard + untouched live files)', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x'); s.jev(A, 'diff', 'A');
  const live = path.join(s.t, 'live', 'AlfaOmegaRobo.cs');
  const w = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: live } }));
  assert.equal(w.out.hookSpecificOutput.permissionDecision, 'deny'); assert.match(w.out.hookSpecificOutput.permissionDecisionReason, /LIVE_GUARD/);
  const cp = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: `cp x.cs "${live.replace(/\\/g, '/')}"` } }));
  assert.equal(cp.out?.hookSpecificOutput?.permissionDecision, 'deny');
  const ps = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'PowerShell', tool_input: { command: `Copy-Item x.cs "${live}"` } }));
  assert.equal(ps.out?.hookSpecificOutput?.permissionDecision, 'deny');
  const rd = s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: `ls "${path.dirname(live)}"` } }));
  assert.equal(rd.out, null, 'reads are not blocked');
  assert.equal(fs.readdirSync(path.join(s.t, 'live')).length, 0);
  assert.deepEqual(liveMtimes(), LIVE_BEFORE, 'live AOT files untouched');
  const cfgLive = JSON.parse(fs.readFileSync(path.join(FIN, 'config.json'), 'utf8')).forbidden_write_prefixes;
  assert.ok(cfgLive.some((p) => /\.claude\/aot\//.test(p)) && cfgLive.some((p) => /NinjaTrader 8/.test(p)));
});

test('X1 — no active loop: hooks are inert', () => {
  const s = sandbox();
  for (const ev of ['SessionStart', 'Stop']) assert.equal(s.hook(s.hookIn(A, ev)).out, null);
  assert.equal(s.hook(s.hookIn(A, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(s.repo, 'src', 'a.js') } })).out, null);
});

test('X2 — hook internal error is visible and non-blocking', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  const id = s.loop().loop_id;
  fs.mkdirSync(path.join(s.t, 'fin', 'loops', `${id}.mutex`)); // un-removable mutex => error path
  const r = s.hook(s.hookIn(A, 'Stop'));
  assert.equal(r.code, 0); assert.notEqual(r.out?.decision, 'block'); assert.match(r.out.systemMessage, /JEV_FINISH_HOOK_ERROR/);
});

test('X3 — jev-adopt accepts only JEV results documented in a handoff', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x');
  assert.equal(s.cli(A, 'jev-adopt', '--kind', 'diff', '--request-id', 'req_invented', '--result', 'A').code, 3);
  const r = s.cli(A, 'jev-adopt', '--kind', 'diff', '--request-id', 'req_documented_123', '--result', 'A');
  assert.equal(r.code, 0); assert.equal(s.loop().jev.diff.adopted, true);
});

test('X4 — shell edits in the repo are detected (git delta) and require JEV + tests', () => {
  const s = sandbox();
  execFileSync('git', ['init', '-q'], { cwd: s.repo });
  fs.writeFileSync(path.join(s.repo, 'src', 'b.js'), 'a');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: s.repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'i'], { cwd: s.repo });
  s.cli(A, 'start', '--objective', 'x');
  fs.writeFileSync(path.join(s.repo, 'src', 'b.js'), 'changed by shell');
  s.touchHandoff();
  const c = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c.code, 3); assert.ok(c.out.errors.some((e) => /without any recorded test|JEV DIFF/.test(e)));
});

test('X5 — Stop hooks never ping-pong: rotation handoff block + jev-finish combine into one continuation, bounded', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--max-iterations', '3');
  s.hook(s.hookIn(A, 'UserPromptSubmit', { prompt: 'x' }, 2500), ROT_HOOK); // WARNING crossed
  let blocks = 0;
  for (let i = 0; i < 10; i++) {
    const a = s.hook(s.hookIn(A, 'Stop', { stop_hook_active: i > 0 }, 2500)).out;
    const b = s.hook(s.hookIn(A, 'Stop', { stop_hook_active: i > 0 }, 2500), ROT_HOOK).out;
    if (a?.decision === 'block' || b?.decision === 'block') blocks++;
    s.cli(A, 'note', '--text', `p${i}`);
  }
  assert.ok(blocks <= 4, `bounded (${blocks})`);
  assert.equal(s.loopById(JSON.parse(fs.readFileSync(path.join(s.t, 'fin', 'last.json'), 'utf8')).loop_id).block_cause, 'MAX_ITERATIONS');
});

test('X7 — RECHECK cannot be declared (stage RECHECK refused); complete without recheck refused', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--require-test', 'u');
  s.jev(A, 'diff', 'A'); s.cli(A, 'stage', 'PLAN'); s.cli(A, 'stage', 'EXECUTE'); s.cli(A, 'stage', 'TEST');
  assert.equal(s.cli(A, 'recheck').code, 3, 'required test never run => recheck refused');
  s.cli(A, 'test', '--name', 'u', '--cmd', 'node -e "0"');
  const st = s.cli(A, 'stage', 'RECHECK');
  assert.equal(st.code, 3); assert.match(st.out.reason, /only via recheck/);
  s.touchHandoff(s.loop().loop_id);
  const c = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c.code, 3); assert.ok(c.out.errors.some((e) => /recheck required/.test(e)));
  assert.equal(s.loop().status, 'ACTIVE');
});

test('X8 — recheck really re-executes the recorded tests (changed outcome => FAIL, stage FIX, complete refused)', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--require-test', 'u');
  fs.writeFileSync(path.join(s.repo, 'probe.js'), "process.exit(require('fs').existsSync('flag') ? 1 : 0);\n");
  assert.equal(s.cli(A, 'test', '--name', 'u', '--cmd', 'node probe.js').code, 0);
  fs.writeFileSync(path.join(s.repo, 'flag'), '1');
  const r = s.cli(A, 'recheck');
  assert.equal(r.code, 1); assert.equal(r.out.jev_finish, 'RECHECK_FAIL');
  assert.equal(s.loop().stage, 'FIX'); assert.equal(s.loop().tests.u.result, 'FAIL'); assert.equal(s.loop().recheck.all_pass, false);
  s.touchHandoff(s.loop().loop_id);
  const c = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c.code, 3); assert.ok(c.out.errors.some((e) => /tests not PASS: u/.test(e)) && c.out.errors.some((e) => /recheck required/.test(e)));
  fs.rmSync(path.join(s.repo, 'flag'));
  assert.equal(s.cli(A, 'recheck').code, 0); assert.equal(s.loop().stage, 'RECHECK');
});

test('X9 — work after recheck (test, shell edit via git delta) => recheck stale', () => {
  const s = sandbox();
  execFileSync('git', ['init', '-q'], { cwd: s.repo });
  fs.writeFileSync(path.join(s.repo, 'src', 'b.js'), 'a');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: s.repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'i'], { cwd: s.repo });
  s.cli(A, 'start', '--objective', 'x', '--require-test', 'u');
  s.cli(A, 'test', '--name', 'u', '--cmd', 'node -e "0"');
  assert.equal(s.cli(A, 'recheck').code, 0);
  s.cli(A, 'test', '--name', 'u', '--cmd', 'node -e "0"');
  s.touchHandoff(s.loop().loop_id);
  const c1 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c1.code, 3); assert.ok(c1.out.errors.some((e) => /recheck stale/.test(e)), 'test after recheck');
  assert.equal(s.cli(A, 'recheck').code, 0);
  fs.writeFileSync(path.join(s.repo, 'src', 'b.js'), 'changed by shell after recheck');
  s.touchHandoff(s.loop().loop_id);
  const c2 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c2.code, 3); assert.ok(c2.out.errors.some((e) => /recheck stale/.test(e)), 'shell edit after recheck');
  assert.equal(s.loop().status, 'ACTIVE');
});

test('X10 — complete needs the CANONICAL handoff, updated after recheck and citing the loop_id', () => {
  const s = sandbox();
  s.cli(A, 'start', '--objective', 'x', '--handoff', 'handoffs/HANDOFF_CANON.md', '--require-test', 'u');
  const id = s.loop().loop_id;
  s.cli(A, 'test', '--name', 'u', '--cmd', 'node -e "0"');
  assert.equal(s.cli(A, 'recheck').code, 0);
  s.touchHandoff(id, 'HANDOFF_OTHER.md');
  const c1 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c1.code, 3); assert.ok(c1.out.errors.some((e) => /canonical handoff handoffs\/HANDOFF_CANON\.md/.test(e)), 'other handoff does not count');
  s.touchHandoff('sem id');
  const c2 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c2.code, 3); assert.ok(c2.out.errors.some((e) => /reference/.test(e)), 'canonical without loop_id');
  s.touchHandoff(id);
  const c3 = s.cli(A, 'complete', '--evidence', 'ok');
  assert.equal(c3.code, 0, JSON.stringify(c3.out)); assert.equal(s.loopById(id).status, 'COMPLETE');
  assert.equal(s.loopById(id).evidence.text, 'ok'); assert.equal(s.loopById(id).evidence.verified.results.u.result, 'PASS');
});

test('X11 — V1.1 instructions: hook and skill point to recheck + isolated complete, no classifier/settings tokens', () => {
  const hook = fs.readFileSync(path.join(FIN, 'hook.mjs'), 'utf8');
  assert.match(hook, /recheck\\` \(o CLI re-executa os testes\)/);
  assert.doesNotMatch(hook, /classifier/i);
  const skill = fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'jev-finish', 'SKILL.md'), 'utf8');
  assert.match(skill, /`finish\.mjs recheck`/); assert.match(skill, /chamada PRÓPRIA/);
});

test('X6 — guarded files are byte-identical after the whole suite', () => {
  assert.deepEqual(GUARDED.map(sha), GUARDED_BEFORE);
  assert.deepEqual(liveMtimes(), LIVE_BEFORE);
});
