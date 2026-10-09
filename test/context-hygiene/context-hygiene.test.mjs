// JEV Token Hygiene V1 — the hook keeps abnormally large tool output out of the context, without touching the Rotation Controller V3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CFG, preToolUse, postToolUse, shellVerdict, summarize, total } from '../../tools/jev-context-hygiene/hook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = path.join(ROOT, 'tools', 'jev-context-hygiene', 'hook.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jev-tokhyg-'));
const bigFile = (dir, bytes = CFG.big_file_bytes + 5000) => {
  const f = path.join(dir, 'big.log');
  fs.writeFileSync(f, 'x'.repeat(99).concat('\n').repeat(Math.ceil(bytes / 100)));
  return f;
};
const runHook = (ev, env = {}) => spawnSync(process.execPath, [HOOK], { input: typeof ev === 'string' ? ev : JSON.stringify(ev), encoding: 'utf8', env: { ...process.env, ...env } });

test('TH01 Read without limit on a big file gets the default limit; explicit limit and small files are untouched', () => {
  const dir = tmp(), big = bigFile(dir), small = path.join(dir, 'small.txt');
  fs.writeFileSync(small, 'ok\n');
  const r = preToolUse({ tool_name: 'Read', tool_input: { file_path: big } });
  assert.equal(r.hookSpecificOutput.updatedInput.limit, CFG.read_default_limit_lines);
  assert.equal(r.hookSpecificOutput.updatedInput.file_path, big);
  assert.equal(r.hookSpecificOutput.permissionDecision, undefined, 'the rewrite never auto-approves the tool');
  assert.match(r.hookSpecificOutput.additionalContext, /offset\/limit/);
  assert.equal(preToolUse({ tool_name: 'Read', tool_input: { file_path: big, limit: 5000 } }), null, 'explicit limit is honoured');
  assert.equal(preToolUse({ tool_name: 'Read', tool_input: { file_path: small } }), null);
  assert.equal(preToolUse({ tool_name: 'Read', tool_input: { file_path: path.join(dir, 'missing.txt') } }), null);
});

test('TH02 Grep without head_limit gets a small default; explicit head_limit is honoured', () => {
  const c = preToolUse({ tool_name: 'Grep', tool_input: { pattern: 'x', output_mode: 'content' } });
  assert.equal(c.hookSpecificOutput.updatedInput.head_limit, CFG.grep_head_limit_content);
  assert.equal(c.hookSpecificOutput.updatedInput.pattern, 'x');
  assert.equal(preToolUse({ tool_name: 'Grep', tool_input: { pattern: 'x' } }).hookSpecificOutput.updatedInput.head_limit, CFG.grep_head_limit_other);
  assert.equal(preToolUse({ tool_name: 'Grep', tool_input: { pattern: 'x', head_limit: 0 } }), null);
  assert.equal(preToolUse({ tool_name: 'Grep', tool_input: { pattern: 'x', head_limit: 500 } }), null);
});

test('TH03 git starts by status/stat/name-only: unbounded diff/show/log is denied, bounded forms pass', () => {
  for (const c of ['git diff', 'git diff HEAD~3', 'git show HEAD', 'git log -p', 'git log', 'cd x && git diff', 'git --no-pager diff', 'git -C repo show abc123', 'git status --short; git diff --cached'])
    assert.ok(shellVerdict(c), `must deny: ${c}`);
  for (const c of ['git status', 'git status --short', 'git diff --stat', 'git diff --name-only HEAD~3', 'git show --stat HEAD', 'git show -s HEAD', 'git diff -- src/a.mjs',
    'git diff HEAD~1 -- src/a.mjs', 'git diff > out/full.diff', 'git diff | head -n 80', 'git diff | Select-Object -First 40', 'git log --oneline -n 15', 'git log -5 --format=%h',
    'git log -p -n 3 -- src/a.mjs', 'git commit -m "explain git diff and git log behaviour"', 'git add -A', `git diff # ${CFG.escape_marker}`, 'node x.mjs 2>&1'])
    assert.equal(shellVerdict(c), null, `must allow: ${c}`);
  const deny = preToolUse({ tool_name: 'Bash', tool_input: { command: 'git diff' } });
  assert.equal(deny.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(deny.hookSpecificOutput.permissionDecisionReason, /--stat/);
  assert.equal(preToolUse({ tool_name: 'PowerShell', tool_input: { command: 'git show HEAD' } }).hookSpecificOutput.permissionDecision, 'deny');
});

test('TH04 dumping a big file through the shell is denied; limited or small dumps pass', () => {
  const dir = tmp(), big = bigFile(dir), small = path.join(dir, 'small.txt');
  fs.writeFileSync(small, 'ok\n');
  for (const c of [`cat "${big}"`, `Get-Content '${big}'`, `type "${big}"`, `echo a; cat "${big}"`]) assert.ok(shellVerdict(c, dir), `must deny: ${c}`);
  assert.ok(shellVerdict('cat big.log', dir), 'relative to the hook cwd');
  for (const c of [`cat "${small}"`, `cat "${big}" | head -n 20`, `Get-Content "${big}" -TotalCount 30`, `Get-Content "${big}" | Select-Object -Last 10`, `cat "${big}" > "${small}"`, `cat "${big}" | wc -l`])
    assert.equal(shellVerdict(c, dir), null, `must allow: ${c}`);
});

test('TH05 abnormal tool output (1 MB) is saved in full and replaced by a summary of at most 6 KB, same output shape', () => {
  const dir = tmp();
  const lines = Array.from({ length: 12000 }, (_, i) => (i === 7000 ? 'ERROR: boom at step 7000' : `line ${i} ${'y'.repeat(70)}`));
  const stdout = lines.join('\n');
  assert.ok(stdout.length > 900000);
  const ev = { hook_event_name: 'PostToolUse', session_id: 'sess-1', tool_use_id: 'toolu_abc', tool_name: 'Bash', tool_response: { stdout, stderr: '', interrupted: false, isImage: false } };
  const out = postToolUse(ev, { JEV_TOKEN_HYGIENE_DIR: dir });
  const upd = out.hookSpecificOutput.updatedToolOutput;
  assert.deepEqual(Object.keys(upd), ['stdout', 'stderr', 'interrupted', 'isImage'], 'shape preserved');
  assert.equal(upd.interrupted, false);
  assert.ok(upd.stdout.length <= 6000, `summary is ${upd.stdout.length} chars`);
  assert.match(upd.stdout, /ERROR: boom at step 7000/);
  assert.match(upd.stdout, /line 0 /);
  assert.match(upd.stdout, /line 11999 /);
  const file = upd.stdout.match(/FULL_OUTPUT_PATH = (.+)/)[1].trim();
  assert.equal(fs.readFileSync(file, 'utf8'), stdout, 'full output preserved on disk');
  const led = fs.readFileSync(path.join(dir, 'ledger', 'sess-1.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(led.length, 1);
  assert.equal(led[0].action, 'CAPPED');
  assert.equal(led[0].chars, stdout.length);
  assert.ok(led[0].returned_chars <= 6000);
});

test('TH06 output under the cap passes untouched and is still recorded; Write/Edit and image reads are never rewritten', () => {
  const dir = tmp(), env = { JEV_TOKEN_HYGIENE_DIR: dir };
  const base = { hook_event_name: 'PostToolUse', session_id: 's2', tool_use_id: 't' };
  assert.equal(postToolUse({ ...base, tool_name: 'Bash', tool_response: { stdout: 'a'.repeat(CFG.output_cap_chars - 10), stderr: '' } }, env), null);
  assert.equal(postToolUse({ ...base, tool_name: 'Write', tool_response: { type: 'create', content: 'z'.repeat(80000) } }, env), null);
  assert.equal(postToolUse({ ...base, tool_name: 'Read', tool_response: { type: 'image', file: { base64: 'Q'.repeat(300000), type: 'image/png' } } }, env), null);
  const rd = postToolUse({ ...base, tool_name: 'Read', tool_response: { type: 'text', file: { filePath: 'a', content: 'k'.repeat(50000), numLines: 1, startLine: 1, totalLines: 1 } } }, env);
  assert.ok(total(rd.hookSpecificOutput.updatedToolOutput) <= 6000);
  assert.equal(rd.hookSpecificOutput.updatedToolOutput.file.numLines, 1);
  const actions = fs.readFileSync(path.join(dir, 'ledger', 's2.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).action);
  assert.deepEqual(actions, ['PASS', 'LARGE_NOT_REWRITTEN', 'PASS', 'CAPPED']);
});

test('TH07 summarize is bounded for a single enormous line and for many long lines', () => {
  assert.ok(summarize('q'.repeat(2000000), 'f').length <= 6000);
  assert.ok(summarize(Array.from({ length: 5000 }, () => 'error '.repeat(200)).join('\n'), 'f').length <= 6500);
});

test('TH08 hook process: FAIL-OPEN on garbage, unknown events and unwritable store; emits valid JSON when it acts', () => {
  for (const input of ['', '{not json', JSON.stringify({ hook_event_name: 'Stop' }), JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } })]) {
    const r = runHook(input);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
  const dir = tmp(), blocker = path.join(dir, 'not-a-dir');
  fs.writeFileSync(blocker, 'x');
  const r = runHook({ hook_event_name: 'PostToolUse', session_id: 's', tool_name: 'Bash', tool_response: { stdout: 'a'.repeat(50000) } }, { JEV_TOKEN_HYGIENE_DIR: blocker });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'cannot store the full output => original output is kept');
  const d = runHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git diff' } });
  assert.equal(JSON.parse(d.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('TH09 project settings declare the hygiene hook next to the untouched rotation and jev-finish hooks', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8')).hooks;
  const cmds = (ev) => s[ev].flatMap((g) => g.hooks.map((h) => ({ m: g.matcher, c: h.command })));
  assert.ok(cmds('PreToolUse').some((x) => x.c.includes('jev-context-hygiene/hook.mjs') && /Read/.test(x.m) && /Grep/.test(x.m) && /Bash/.test(x.m) && /PowerShell/.test(x.m)));
  assert.ok(cmds('PostToolUse').some((x) => x.c.includes('jev-context-hygiene/hook.mjs') && x.m === '*'));
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'])
    assert.ok(cmds(ev).some((x) => x.c.includes('jev-rotation/hook.mjs')), `rotation hook still declared on ${ev}`);
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop'])
    assert.ok(!cmds(ev).some((x) => x.c.includes('jev-context-hygiene')), 'hygiene never runs on rotation-critical events');
});

test('TH10 rotation thresholds are unchanged and the rotation brief stays a compact brief + paths (never a transcript)', () => {
  const rc = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'jev-rotation', 'config.json'), 'utf8'));
  assert.deepEqual(rc.thresholds, { prepare: 200000, warning: 220000, soft_stop: 235000, hard_rotation: 240000, ceiling: 250000 });
  assert.ok(rc.rotation.carry_last_assistant_texts * rc.rotation.carry_text_max_chars <= CFG.rotation_carry_max_chars, 'carried assistant text budget');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs'), 'utf8');
  const brief = src.slice(src.indexOf('export function writeBrief'), src.indexOf('export function writeLauncher'));
  assert.ok(brief.includes('predecessor transcript: \\`${input.transcript_path'), 'the transcript is carried as a path');
  assert.ok(!brief.includes('readFileSync(input.transcript_path'), 'the brief never embeds the transcript');
});
