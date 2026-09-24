// JEV Rotation Controller V2 — synthetic tests. Every case runs the REAL hook
// process (tools/jev-rotation/hook.mjs) with stdin JSON exactly as Claude Code
// sends it, against synthetic transcripts carrying API `usage` blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureTranscript, levelFor, loadConfig } from '../../tools/jev-rotation/controller.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs');
const STATUS = path.join(ROOT, 'tools', 'jev-rotation', 'status.mjs');
const TH = loadConfig({}).thresholds;

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-test-'));
  fs.mkdirSync(path.join(dir, 'handoffs'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'handoffs', 'HANDOFF_X.md'), '# handoff\n');
  fs.utimesSync(path.join(dir, 'handoffs', 'HANDOFF_X.md'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  fs.writeFileSync(path.join(dir, 'src', 'big.txt'), 'x'.repeat(100000));
  const tp = path.join(dir, 'session.jsonl');
  fs.writeFileSync(tp, '');
  const env = { ...process.env, JEV_ROTATION_STATE_DIR: path.join(dir, 'state'), JEV_ROTATION_REPO_ROOT: dir, JEV_ROTATION_TEST: '', JEV_ROTATION_THRESHOLDS: '' };
  const sb = {
    dir, tp, env, sid: 'sess-' + path.basename(dir),
    usage(tokens, extra = {}) {
      fs.appendFileSync(tp, JSON.stringify({ type: 'assistant', uuid: String(Math.random()), isSidechain: false,
        message: { model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: tokens - 1002 - 500, output_tokens: 500 } }, ...extra }) + '\n');
    },
    hook(event, fields = {}) {
      const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ session_id: sb.sid, transcript_path: tp, cwd: dir, hook_event_name: event, ...fields }), encoding: 'utf8', env });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout ? JSON.parse(r.stdout) : null;
    },
    pre(tool, input) { return sb.hook('PreToolUse', { tool_name: tool, tool_input: input }); },
    touchHandoff() { const f = path.join(dir, 'handoffs', 'HANDOFF_X.md'); fs.appendFileSync(f, 'update\n'); fs.utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000)); },
  };
  return sb;
}
const denied = (o) => o?.hookSpecificOutput?.permissionDecision === 'deny';
const reason = (o) => o?.hookSpecificOutput?.permissionDecisionReason || o?.reason || '';

test('RT01 thresholds are absolute tokens 220k/235k/240k/250k', () => {
  assert.deepEqual(TH, { warning: 220000, soft_stop: 235000, hard_rotation: 240000, ceiling: 250000 });
  assert.equal(levelFor(219999, TH), 'OK');
  assert.equal(levelFor(220000, TH), 'WARNING');
  assert.equal(levelFor(235000, TH), 'SOFT_STOP');
  assert.equal(levelFor(240000, TH), 'HARD_ROTATION');
  assert.equal(levelFor(250000, TH), 'CEILING_BREACH');
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

test('RT03 below warning: everything allowed, no output', () => {
  const sb = sandbox();
  sb.usage(150000);
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'go' }), null);
  assert.equal(sb.pre('Bash', { command: 'ls' }), null);
  assert.equal(sb.hook('Stop', { stop_hook_active: false }), null);
});

test('RT04 WARNING (>=220k): warning injected, work allowed, handoff mandatory at Stop, auto snapshot written', () => {
  const sb = sandbox();
  sb.usage(221000);
  const p = sb.hook('UserPromptSubmit', { prompt: 'go' });
  assert.match(p.systemMessage, /JEV_ROTATION_WARNING/);
  assert.match(p.hookSpecificOutput.additionalContext, /Handoff update is mandatory/);
  assert.equal(sb.pre('Bash', { command: 'npm test' }), null);
  assert.ok(denied(sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt') })), 'unbounded Read denied in warning zone');
  assert.equal(sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt'), limit: 200 }), null);
  const post = sb.hook('PostToolUse', { tool_name: 'Bash', tool_input: {} });
  assert.match(post.hookSpecificOutput.additionalContext, /update the handoff/);
  const stop = sb.hook('Stop', { stop_hook_active: false });
  assert.equal(stop.decision, 'block');
  assert.match(stop.reason, /handoff mandatory/);
  assert.equal(sb.hook('Stop', { stop_hook_active: true }), null, 'no infinite stop loop');
  sb.touchHandoff();
  assert.equal(sb.hook('Stop', { stop_hook_active: false }), null, 'handoff updated -> stop allowed');
  const snaps = fs.readdirSync(path.join(sb.dir, 'handoffs', 'rotation'));
  assert.equal(snaps.length, 1);
  assert.match(fs.readFileSync(path.join(sb.dir, 'handoffs', 'rotation', snaps[0]), 'utf8'), /level: \*\*WARNING\*\*[\s\S]*221000/);
});

test('RT05 SOFT_STOP (>=235k): new batch blocked, unbounded tools denied, handoff-only prompt allowed', () => {
  const sb = sandbox();
  sb.usage(236000);
  const p = sb.hook('UserPromptSubmit', { prompt: 'implement next feature' });
  assert.equal(p.decision, 'block');
  assert.match(p.reason, /JEV_SOFT_STOP[\s\S]*ROTATE_SESSION_NOW/);
  const ho = sb.hook('UserPromptSubmit', { prompt: 'JEV_HANDOFF_ONLY atualize o handoff' });
  assert.equal(ho.decision, undefined);
  assert.match(ho.hookSpecificOutput.additionalContext, /only update handoffs/);
  for (const t of ['Bash', 'PowerShell', 'Agent', 'WebFetch', 'Grep', 'mcp__x__y']) assert.ok(denied(sb.pre(t, {})), `${t} denied`);
  assert.ok(denied(sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt'), limit: 500 })));
  assert.equal(sb.pre('Read', { file_path: path.join(sb.dir, 'src', 'big.txt'), limit: 100 }), null);
  assert.equal(sb.pre('Edit', { file_path: path.join(sb.dir, 'src', 'a.mjs') }), null, 'finishing edits still allowed');
  assert.match(sb.hook('Stop', { stop_hook_active: false }).reason, /ROTATE_SESSION_NOW/);
});

test('RT06 HARD_ROTATION (>=240k): locked to handoff edits, ROTATE_SESSION_NOW, turn stopped after handoff, status exit 30', () => {
  const sb = sandbox();
  sb.usage(241000);
  const p = sb.hook('UserPromptSubmit', { prompt: 'continue' });
  assert.equal(p.decision, 'block');
  assert.match(p.reason, /^ROTATE_SESSION_NOW/);
  assert.ok(denied(sb.pre('Bash', { command: 'git commit' })));
  assert.match(reason(sb.pre('Bash', {})), /ROTATE_SESSION_NOW[\s\S]*Do NOT use \/clear/);
  assert.ok(denied(sb.pre('Edit', { file_path: path.join(sb.dir, 'src', 'a.mjs') })), 'non-handoff edit denied');
  assert.ok(denied(sb.pre('Write', { file_path: path.join(sb.dir, 'handoffs', 'x.txt') })), 'non-md denied');
  assert.ok(denied(sb.pre('Write', { file_path: path.join(sb.dir, 'handoffs', '..', 'src', 'x.md') })), 'path traversal denied');
  assert.equal(sb.pre('Edit', { file_path: path.join(sb.dir, 'handoffs', 'HANDOFF_X.md') }), null, 'handoff edit allowed');
  assert.equal(sb.pre('Read', { file_path: 'handoffs/HANDOFF_X.md' }), null, 'small handoff read allowed');
  const stop1 = sb.hook('Stop', { stop_hook_active: false });
  assert.equal(stop1.decision, 'block', 'must update handoff before stopping');
  sb.touchHandoff();
  const post = sb.hook('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(sb.dir, 'handoffs', 'HANDOFF_X.md') } });
  assert.equal(post.continue, false);
  assert.match(post.stopReason, /^ROTATE_SESSION_NOW/);
  const st = spawnSync(process.execPath, [STATUS], { encoding: 'utf8', env: sb.env });
  assert.equal(st.status, 30);
  assert.match(st.stdout, /level=HARD_ROTATION[\s\S]*ROTATE_SESSION_NOW/);
  const snap = fs.readFileSync(path.join(sb.dir, 'handoffs', 'rotation', `AUTO_ROTATION_${sb.sid.slice(0, 8)}.md`), 'utf8');
  assert.match(snap, /level: \*\*HARD_ROTATION\*\*/);
  assert.match(snap, /ROTATE_SESSION_NOW/);
});

test('RT07 sticky: a later drop (compaction) never unlocks a rotated session', () => {
  const sb = sandbox();
  sb.usage(241000);
  sb.hook('UserPromptSubmit', { prompt: 'x' });
  sb.usage(40000);
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'continue' }).decision, 'block');
  assert.ok(denied(sb.pre('Bash', {})));
});

test('RT08 measurement unavailable: degraded state is visible, last known sticky level still enforced', () => {
  const sb = sandbox();
  sb.usage(241000);
  sb.hook('UserPromptSubmit', { prompt: 'x' });
  fs.rmSync(sb.tp);
  assert.ok(denied(sb.pre('Bash', {})));
  const sb2 = sandbox();
  fs.rmSync(sb2.tp);
  fs.mkdirSync(sb2.tp); // unreadable as a file
  assert.match(sb2.pre('Bash', {}).systemMessage, /MEASUREMENT_UNAVAILABLE/);
});

test('RT09 250K GUARD: simulated worst-case session never reaches 250k', () => {
  // Agent that always tries to keep working. Worst bounded growth per allowed step:
  // 10k tool result (Bash output cap 30k chars) + 3k model output = 13k. Denied step = 300.
  // When told ROTATE_SESSION_NOW it writes the handoff (+3k).
  for (const start of [200000, 225000, 234999, 237000, 239999, 245999]) {
    const sb = sandbox();
    const hp = path.join(sb.dir, 'handoffs', 'HANDOFF_X.md');
    let tokens = start, maxSeen = start, stopped = false, steps = 0;
    sb.usage(tokens);
    while (!stopped && steps++ < 200) {
      const o = sb.pre('Bash', { command: 'work' });
      if (o?.continue === false) { stopped = true; break; }
      if (!denied(o)) {
        tokens += 13000;
      } else {
        tokens += 300;
        if (/ROTATE_SESSION_NOW/.test(reason(o))) {
          const e = sb.pre('Edit', { file_path: hp });
          if (e?.continue === false) { stopped = true; } else {
            assert.ok(!denied(e), 'handoff edit allowed outside the reserve');
            tokens += 3000; sb.touchHandoff(); sb.usage(tokens);
            stopped = sb.hook('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: hp } })?.continue === false;
          }
        }
      }
      sb.usage(tokens);
      maxSeen = Math.max(maxSeen, tokens);
    }
    assert.ok(stopped, `start ${start}: session stopped by controller`);
    assert.ok(maxSeen < TH.ceiling, `start ${start}: max ${maxSeen} < ${TH.ceiling}`);
    assert.equal(sb.hook('UserPromptSubmit', { prompt: 'next batch' }).decision, 'block', 'no new batch after stop');
  }
});

test('RT10 reserve zone (>= ceiling-4k): even handoff edits stop the turn; auto snapshot is the handoff', () => {
  const sb = sandbox();
  sb.usage(246500);
  const e = sb.pre('Edit', { file_path: path.join(sb.dir, 'handoffs', 'HANDOFF_X.md') });
  assert.equal(e.continue, false);
  assert.match(e.stopReason, /^ROTATE_SESSION_NOW/);
  assert.equal(sb.hook('UserPromptSubmit', { prompt: 'JEV_HANDOFF_ONLY x' }).decision, 'block');
  assert.ok(fs.existsSync(path.join(sb.dir, 'handoffs', 'rotation', `AUTO_ROTATION_${sb.sid.slice(0, 8)}.md`)));
});
