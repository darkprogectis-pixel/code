// JEV Rotation Controller V3 — synthetic tests. Every case runs the REAL hook
// process (tools/jev-rotation/hook.mjs) with stdin JSON exactly as Claude Code
// sends it, against synthetic transcripts carrying API `usage` blocks.
// Successor spawn runs in dry-run (JEV_ROTATION_SPAWN=dry): the launcher files are
// generated and checked, no window is opened. test/rotation/live-spawn.mjs opens a real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureTranscript, levelFor, loadConfig } from '../../tools/jev-rotation/controller.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs');
const STATUS = path.join(ROOT, 'tools', 'jev-rotation', 'status.mjs');
const TH = loadConfig({}).thresholds;
const REAL_TH = [TH.prepare, TH.warning, TH.soft_stop, TH.hard_rotation, TH.ceiling].join(',');

function sandbox(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-test-'));
  fs.mkdirSync(path.join(dir, 'handoffs'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'handoffs', 'HANDOFF_X.md'), '# handoff\n');
  fs.utimesSync(path.join(dir, 'handoffs', 'HANDOFF_X.md'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  fs.writeFileSync(path.join(dir, 'src', 'big.txt'), 'x'.repeat(100000));
  const tp = path.join(dir, 'session.jsonl');
  fs.writeFileSync(tp, '');
  const stateDir = path.join(dir, 'state');
  const env = { ...process.env, JEV_ROTATION_STATE_DIR: stateDir, JEV_ROTATION_REPO_ROOT: dir, JEV_ROTATION_TEST: '1',
    JEV_ROTATION_THRESHOLDS: REAL_TH, JEV_ROTATION_SPAWN: 'dry', JEV_ROTATION_WATCHDOG: 'off', CLAUDE_CONFIG_DIR: path.join(dir, 'cfg'), ...extraEnv };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  const sb = {
    dir, tp, env, stateDir, sid: 'sess-' + path.basename(dir),
    usage(tokens, extra = {}) {
      fs.appendFileSync(tp, JSON.stringify({ type: 'assistant', uuid: String(Math.random()), isSidechain: false,
        message: { model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: tokens - 1002 - 500, output_tokens: 500 },
          content: [{ type: 'text', text: `assistant says ${tokens}` }] }, ...extra }) + '\n');
    },
    input(event, fields = {}, sid = sb.sid) { return JSON.stringify({ session_id: sid, transcript_path: tp, cwd: dir, hook_event_name: event, ...fields }); },
    hook(event, fields = {}, sid = sb.sid) {
      const r = spawnSync(process.execPath, [HOOK], { input: sb.input(event, fields, sid), encoding: 'utf8', env });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout ? JSON.parse(r.stdout) : null;
    },
    pre(tool, input) { return sb.hook('PreToolUse', { tool_name: tool, tool_input: input }); },
    touchHandoff() { const f = path.join(dir, 'handoffs', 'HANDOFF_X.md'); fs.appendFileSync(f, 'update\n'); fs.utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000)); },
    lock(sid = sb.sid) { try { return JSON.parse(fs.readFileSync(path.join(stateDir, 'rotation', `${sid}.lock`), 'utf8')); } catch { return null; } },
    locks() { try { return fs.readdirSync(path.join(stateDir, 'rotation')).filter((f) => f.endsWith('.lock')); } catch { return []; } },
    lineage() { try { return fs.readFileSync(path.join(stateDir, 'lineage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } },
    status(sid) { return spawnSync(process.execPath, [STATUS, ...(sid ? ['--session', sid] : [])], { encoding: 'utf8', env }); },
  };
  return sb;
}
const denied = (o) => o?.hookSpecificOutput?.permissionDecision === 'deny';
const reason = (o) => o?.hookSpecificOutput?.permissionDecisionReason || o?.reason || '';

test('RT01 thresholds are absolute tokens 200k/220k/235k/240k/250k', () => {
  assert.deepEqual(TH, { prepare: 200000, warning: 220000, soft_stop: 235000, hard_rotation: 240000, ceiling: 250000 });
  assert.equal(levelFor(199999, TH), 'OK');
  assert.equal(levelFor(200000, TH), 'PREPARE');
  assert.equal(levelFor(220000, TH), 'WARNING');
  assert.equal(levelFor(235000, TH), 'SOFT_STOP');
  assert.equal(levelFor(240000, TH), 'HARD_ROTATION');
  assert.equal(levelFor(250000, TH), 'CEILING_BREACH');
  assert.deepEqual(loadConfig({ JEV_ROTATION_TEST: '1', JEV_ROTATION_THRESHOLDS: '1,2,3,4' }).thresholds, { prepare: 1, warning: 1, soft_stop: 2, hard_rotation: 3, ceiling: 4 });
});

test('RT02 measurement = last main-chain usage (input+cache_creation+cache_read+output); sidechain and zero-usage ignored', () => {
  const sb = sandbox();
  assert.equal(measureTranscript(sb.tp).status, 'NO_USAGE_YET');
  sb.usage(100000);
  sb.usage(300000, { isSidechain: true });
  fs.appendFileSync(sb.tp, JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } }) + '\n');
  fs.appendFileSync(sb.tp, JSON.stringify({ type: 'user', message: { content: 'x'.repeat(3 * 1024 * 1024) } }) + '\n'); // pushes usage out of the 2MB tail
  const m = measureTranscript(sb.tp);
  assert.equal(m.status, 'MEASURED');
  assert.equal(m.tokens, 100000);
  assert.equal(measureTranscript(path.join(sb.dir, 'missing.jsonl')).status, 'NO_USAGE_YET', 'new session: file not created yet');
  assert.equal(measureTranscript(sb.dir).status, 'UNAVAILABLE', 'unreadable transcript');
});

test('RT03 below prepare: everything allowed, no output', () => {
  const sb = sandbox();
  sb.usage(150000);
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'go' }), null);
  assert.equal(sb.pre('Bash', { command: 'ls' }), null);
  assert.equal(sb.hook('Stop', { stop_hook_active: false }), null);
  assert.equal(sb.locks().length, 0);
});

test('RT04 PREPARE (>=200k): incremental-handoff reminder, nothing blocked, snapshot refreshed at every Stop, no spawn', () => {
  const sb = sandbox();
  sb.usage(201000);
  const p = sb.hook('UserPromptSubmit', { prompt: 'go' });
  assert.equal(p.decision, undefined);
  assert.match(p.hookSpecificOutput.additionalContext, /JEV_ROTATION_PREPARE[\s\S]*rotates automatically/);
  assert.equal(sb.pre('Bash', { command: 'npm test' }), null);
  assert.match(sb.hook('PostToolUse', { tool_name: 'Bash', tool_input: {} }).hookSpecificOutput.additionalContext, /JEV_ROTATION_PREPARE/);
  assert.equal(sb.hook('Stop', { stop_hook_active: false }), null, 'Stop not blocked in PREPARE');
  const snap = path.join(sb.dir, 'handoffs', 'rotation', `AUTO_ROTATION_${sb.sid.slice(0, 8)}.md`);
  const t0 = fs.statSync(snap).mtimeMs;
  sb.usage(205000);
  sb.hook('Stop', { stop_hook_active: false });
  assert.match(fs.readFileSync(snap, 'utf8'), /205000/);
  assert.ok(fs.statSync(snap).mtimeMs >= t0);
  assert.equal(sb.locks().length, 0);
});

test('RT05 WARNING (>=220k): warning injected, work allowed, handoff mandatory at Stop, no spawn', () => {
  const sb = sandbox();
  sb.usage(221000);
  const p = sb.hook('UserPromptSubmit', { prompt: 'go' });
  assert.match(p.systemMessage, /JEV_ROTATION_WARNING/);
  assert.equal(sb.pre('Bash', { command: 'npm test' }), null);
  assert.ok(denied(sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt') })), 'unbounded Read denied in warning zone');
  assert.equal(sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt'), limit: 200 }), null);
  const stop = sb.hook('Stop', { stop_hook_active: false });
  assert.equal(stop.decision, 'block');
  assert.match(stop.reason, /handoff mandatory/);
  assert.equal(sb.hook('Stop', { stop_hook_active: true }), null, 'no infinite stop loop');
  sb.touchHandoff();
  assert.equal(sb.hook('Stop', { stop_hook_active: false }), null);
  assert.equal(sb.locks().length, 0);
});

test('RT06 SOFT_STOP prompt: rotation, successor spawned, prompt carried verbatim, predecessor ROTATED_READ_ONLY', () => {
  const sb = sandbox();
  sb.usage(236000);
  const prompt = 'implement next feature "X" com acentuação';
  const p = sb.hook('UserPromptSubmit', { prompt });
  assert.equal(p.decision, 'block');
  assert.match(p.reason, /ROTATED_READ_ONLY[\s\S]*forwarded to the successor/);
  const lock = sb.lock();
  assert.equal(lock.status, 'SPAWNED');
  assert.equal(lock.trigger, 'UserPromptSubmit');
  assert.equal(lock.carried_prompt, true);
  const brief = fs.readFileSync(lock.brief, 'utf8');
  assert.match(brief, /Pending operator message[\s\S]*> implement next feature "X" com acentuação/);
  assert.match(brief, /HANDOFF_X\.md/);
  // Read-only for good: tools denied and the turn stopped, prompts blocked.
  for (const t of ['Bash', 'Edit', 'Write', 'Read']) {
    const o = sb.pre(t, { file_path: path.join(sb.dir, 'handoffs', 'HANDOFF_X.md') });
    assert.ok(denied(o) && o.continue === false, `${t} denied + turn stopped`);
  }
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'again' }).decision, 'block');
  assert.match(sb.hook('Stop', { stop_hook_active: false }).systemMessage, /ROTATED_READ_ONLY/);
  assert.equal(sb.locks().length, 1, 'exactly one successor');
  assert.equal(sb.lineage().filter((e) => e.event === 'SUCCESSOR_SPAWNED').length, 1);
});

test('RT07 SOFT_STOP handoff-only prompt still allowed; soft stop rotates at the end of the atomic unit (Stop)', () => {
  const sb = sandbox();
  sb.usage(236000);
  const ho = sb.hook('UserPromptSubmit', { prompt: 'JEV_HANDOFF_ONLY atualize o handoff' });
  assert.equal(ho.decision, undefined);
  assert.equal(sb.locks().length, 0);
  assert.equal(sb.pre('Edit', { file_path: path.join(sb.dir, 'src', 'a.mjs') }), null, 'finishing the current unit is allowed');
  assert.ok(denied(sb.pre('Bash', {})), 'unbounded tools still denied in soft stop');
  const s1 = sb.hook('Stop', { stop_hook_active: false });
  assert.equal(s1.decision, 'block', 'one mandatory handoff attempt first');
  assert.equal(sb.locks().length, 0);
  sb.touchHandoff();
  const s2 = sb.hook('Stop', { stop_hook_active: true });
  assert.match(s2.systemMessage, /ROTATED_READ_ONLY/);
  assert.equal(sb.lock().trigger, 'Stop');
  assert.equal(sb.lock().carried_prompt, false);
});

test('RT08 HARD_ROTATION on any tool event: immediate rotation, turn stopped, status reports successor', () => {
  const sb = sandbox();
  sb.usage(241000);
  const o = sb.pre('Bash', { command: 'git commit' });
  assert.ok(denied(o));
  assert.equal(o.continue, false);
  assert.match(reason(o), /ROTATE_SESSION_NOW[\s\S]*ROTATED_READ_ONLY[\s\S]*Do NOT use \/clear/);
  const lock = sb.lock();
  assert.equal(lock.level, 'HARD_ROTATION');
  const st = sb.status();
  assert.equal(st.status, 30);
  assert.match(st.stdout, new RegExp(`ROTATED_READ_ONLY successor=${lock.successor}`));
  assert.match(fs.readFileSync(path.join(sb.dir, 'handoffs', 'rotation', `AUTO_ROTATION_${sb.sid.slice(0, 8)}.md`), 'utf8'), /level: \*\*HARD_ROTATION\*\*/);
});

test('RT09 REGRESSION 9f12a31f: prompt at 234 964 measured that would take the context to ~240.5k rotates BEFORE entering', () => {
  const sb = sandbox();
  sb.usage(234964);
  const prompt = 'CONTINUE EXATAMENTE A AUDITORIA. ' + 'y'.repeat(16500); // ≈ 5.5k tokens
  const p = sb.hook('UserPromptSubmit', { prompt });
  assert.equal(p.decision, 'block', 'V2 allowed this prompt (level WARNING) and the session jumped to 240 501');
  const lock = sb.lock();
  assert.equal(lock.status, 'SPAWNED');
  assert.ok(lock.projected >= TH.soft_stop && lock.tokens === 234964);
  assert.ok(fs.readFileSync(lock.brief, 'utf8').includes('CONTINUE EXATAMENTE A AUDITORIA'), 'operator prompt reaches the successor');
});

test('RT10 exactly once: concurrent hook processes at hard rotation spawn ONE successor; later events never spawn again', async () => {
  const sb = sandbox();
  sb.usage(242000);
  const run = () => new Promise((resolve) => {
    const c = spawn(process.execPath, [HOOK], { env: sb.env });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ code, out }));
    c.stdin.end(sb.input('PreToolUse', { tool_name: 'Bash', tool_input: {} }));
  });
  const rs = await Promise.all(Array.from({ length: 8 }, run));
  for (const r of rs) { assert.equal(r.code, 0); assert.ok(denied(JSON.parse(r.out))); }
  for (let i = 0; i < 5; i++) sb.hook('UserPromptSubmit', { prompt: `p${i}` });
  sb.usage(40000); // compaction: still rotated
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'after compaction' }).decision, 'block');
  assert.equal(sb.locks().length, 1);
  assert.equal(sb.lineage().filter((e) => e.event === 'ROTATION_TRIGGERED').length, 1);
  assert.equal(fs.readdirSync(path.join(sb.stateDir, 'rotation')).filter((f) => !f.endsWith('.lock')).length, 1, 'one launcher dir');
});

test('RT11 successor launcher: isolated config dir, repo cwd, pre-assigned session id, brief as system prompt, verify gate, labeled bootstrap', () => {
  const sb = sandbox();
  sb.usage(241000);
  sb.pre('Bash', {});
  const lock = sb.lock();
  const ps = fs.readFileSync(lock.launch, 'utf8');
  assert.ok(ps.includes(`$env:CLAUDE_CONFIG_DIR = '${sb.env.CLAUDE_CONFIG_DIR}'`));
  assert.ok(ps.includes(`Set-Location -LiteralPath '${sb.dir}'`));
  assert.ok(ps.includes(`--session-id '${lock.successor}'`));
  assert.ok(ps.includes(`--append-system-prompt-file '${lock.brief}'`));
  assert.match(ps, /install-hooks\.mjs' --config-dir \$env:CLAUDE_CONFIG_DIR --verify[\s\S]*if \(\$LASTEXITCODE -ne 0\)[\s\S]*return/);
  assert.match(ps, /Remove-Item "Env:\$v"/);
  assert.ok(!ps.includes('/clear'));
  const boot = fs.readFileSync(path.join(path.dirname(lock.launch), 'boot.txt'), 'utf8');
  assert.match(boot, /^\[JEV ROTATION CONTROLLER V3 - mensagem automatica gerada pelo controller, NAO pelo operador\]/);
  assert.ok(!boot.includes('"'), 'no double quotes (PS 5.1 native arg quoting)');
  assert.equal(lock.config_dir, sb.env.CLAUDE_CONFIG_DIR);
  assert.equal(lock.cwd, sb.dir);
});

test('RT12 successor handshake: SessionStart of the successor gets lineage context and confirms the start', () => {
  const sb = sandbox();
  sb.usage(241000);
  sb.pre('Bash', {});
  const { successor, brief } = sb.lock();
  const ss = sb.hook('SessionStart', { source: 'startup' }, successor);
  assert.match(ss.hookSpecificOutput.additionalContext, new RegExp(`AUTOMATIC SUCCESSOR \\(rotation #1\\) of session ${sb.sid}`));
  assert.ok(ss.hookSpecificOutput.additionalContext.includes(brief));
  assert.ok(sb.lock().successor_started_at, 'predecessor lock records successor start');
  assert.equal(sb.lineage().filter((e) => e.event === 'SUCCESSOR_STARTED').length, 1);
  sb.hook('SessionStart', { source: 'resume' }, successor);
  assert.equal(sb.lineage().filter((e) => e.event === 'SUCCESSOR_STARTED').length, 1, 'recorded once');
  assert.match(sb.status(successor).stdout, new RegExp(`PREDECESSOR ${sb.sid} \\(rotation #1`));
  // The successor is a normal session: its own chain continues (depth 2, same root).
  fs.writeFileSync(sb.tp, '');
  sb.usage(241000);
  sb.hook('PreToolUse', { tool_name: 'Bash', tool_input: {} }, successor);
  const l2 = sb.lock(successor);
  assert.equal(l2.depth, 2);
  assert.equal(l2.root, sb.sid);
});

test('RT13 spawn failure is visible, retried, and falls back to the V2 lock (no silent success)', () => {
  const sb = sandbox({ CLAUDE_CONFIG_DIR: undefined });
  sb.usage(241000);
  const o = sb.pre('Bash', {});
  assert.ok(denied(o));
  assert.match(reason(o), /AUTOMATIC SUCCESSOR SPAWN FAILED \(CLAUDE_CONFIG_DIR not set/);
  assert.equal(sb.locks().length, 0, 'failed attempt releases the lock');
  assert.equal(sb.pre('Edit', { file_path: path.join(sb.dir, 'handoffs', 'HANDOFF_X.md') }), null, 'manual fallback: handoff edit allowed');
  sb.pre('Bash', {});
  assert.match(reason(sb.pre('Bash', {})), /gave up after 3 attempts/);
  assert.equal(sb.lineage().filter((e) => e.event === 'SPAWN_FAILED').length, 3);
});

test('RT14 SessionStart never spawns (resumed exhausted session rotates on its first prompt, carried)', () => {
  const sb = sandbox();
  sb.usage(241000);
  sb.hook('SessionStart', { source: 'resume' });
  assert.equal(sb.locks().length, 0);
  sb.hook('UserPromptSubmit', { prompt: 'retomar' });
  assert.equal(sb.lock().carried_prompt, true);
});

test('RT15 measurement unavailable: degraded state visible, last known sticky level still enforced', () => {
  const sb = sandbox();
  sb.usage(221000);
  sb.hook('UserPromptSubmit', { prompt: 'x' });
  fs.rmSync(sb.tp);
  fs.mkdirSync(sb.tp);
  const o = sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt') });
  assert.ok(denied(o), 'sticky WARNING still enforced');
});

test('RT16 250K GUARD: simulated worst-case agent is stopped and a successor exists before 250k', () => {
  // Agent that always tries to keep working. Worst bounded growth per allowed step:
  // 10k tool result + 3k model output = 13k. Denied step = 300.
  for (const start of [200000, 225000, 234999, 237000, 239999, 245999, 249000]) {
    const sb = sandbox();
    let tokens = start, maxSeen = start, stopped = false, steps = 0;
    sb.usage(tokens);
    while (!stopped && steps++ < 200) {
      const o = sb.pre('Bash', { command: 'work' });
      if (o?.continue === false) { stopped = true; break; }
      tokens += denied(o) ? 300 : 13000;
      if (!denied(o)) {
        const post = sb.hook('PostToolUse', { tool_name: 'Bash', tool_input: {}, tool_response: { stdout: 'z'.repeat(30000) } });
        if (post?.continue === false) { stopped = true; }
      }
      sb.usage(tokens);
      if (!stopped) maxSeen = Math.max(maxSeen, tokens);
      if (!stopped && sb.hook('Stop', { stop_hook_active: true })?.systemMessage?.includes('ROTATED_READ_ONLY')) stopped = true;
    }
    assert.ok(stopped, `start ${start}: session stopped by controller`);
    assert.equal(sb.lock()?.status, 'SPAWNED', `start ${start}: successor exists`);
    assert.ok(sb.lock().projected < TH.ceiling || start >= TH.ceiling - 1000, `start ${start}: rotated before the ceiling (projected ${sb.lock().projected})`);
    assert.ok(maxSeen < TH.ceiling, `start ${start}: max ${maxSeen} < ${TH.ceiling}`);
    assert.equal(sb.hook('UserPromptSubmit', { prompt: 'next batch' }).decision, 'block', 'no new batch after rotation');
    assert.equal(sb.locks().length, 1);
  }
});

test('RT17 watchdog: successor never starts -> ONE replacement opened, old one SUPERSEDED (blocked) if it starts late', () => {
  const sb = sandbox({ JEV_ROTATION_CONFIRM_TIMEOUT_S: '1' });
  sb.usage(236000);
  sb.hook('UserPromptSubmit', { prompt: 'tarefa do operador' });
  const first = sb.lock().successor;
  const WD = path.join(ROOT, 'tools', 'jev-rotation', 'watchdog.mjs');
  const w = spawnSync(process.execPath, [WD, sb.sid], { env: sb.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(w.status, 0, w.stderr);
  const lock = sb.lock();
  assert.notEqual(lock.successor, first);
  assert.deepEqual(lock.superseded.slice(0, 1), [first]);
  assert.ok(lock.respawns <= 2);
  assert.match(fs.readFileSync(lock.brief, 'utf8'), /> tarefa do operador/, 'carried prompt survives the respawn');
  assert.equal(sb.lineage().filter((e) => e.event === 'SUCCESSOR_RESPAWNED').length, lock.respawns);
  assert.equal(sb.lineage().filter((e) => e.event === 'SUCCESSOR_NOT_STARTED_GAVE_UP').length, 1, 'bounded: gives up after respawn_max');
  // Late start of the superseded one: read-only, never a second active successor.
  const late = sb.hook('SessionStart', { source: 'startup' }, first);
  assert.match(late.hookSpecificOutput.additionalContext, /ROTATED_READ_ONLY/);
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'x' }, first).decision, 'block');
  assert.equal(sb.lock().successor_started_at, undefined, 'superseded start does not confirm');
  // The active one starts: confirmed, normal session.
  fs.writeFileSync(sb.tp, ''); // a fresh session has its own (empty) transcript
  sb.hook('SessionStart', { source: 'startup' }, lock.successor);
  assert.ok(sb.lock().successor_started_at);
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'x' }, lock.successor)?.decision, undefined);
});
