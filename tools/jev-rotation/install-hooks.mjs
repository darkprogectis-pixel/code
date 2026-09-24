#!/usr/bin/env node
// Installs / verifies the JEV Rotation Controller V2 hooks in the ISOLATED JEV
// Claude config dir (never the default ~/.claude).
//   node tools/jev-rotation/install-hooks.mjs --config-dir <dir> [--verify] [--uninstall]
// --verify: hooks present + pointing to this hook.mjs + live self-test of the hook
//           process (warning / soft stop / hard rotation). Exit 0 = PASS, 1 = FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HERE } from './controller.mjs';

const MARK = 'jev-rotation-controller-v2';
const EVENTS = { SessionStart: null, UserPromptSubmit: null, PreToolUse: '*', PostToolUse: '*', Stop: null };
const hookPath = path.join(HERE, 'hook.mjs').replace(/\\/g, '/');
const command = `node "${hookPath}" # ${MARK}`;

const args = process.argv.slice(2);
const ci = args.indexOf('--config-dir');
const configDir = ci >= 0 ? args[ci + 1] : null;
if (!configDir) { console.error('FAIL: --config-dir <isolated JEV config dir> is required'); process.exit(1); }
if (path.resolve(configDir).toLowerCase() === path.join(os.homedir(), '.claude').toLowerCase()) {
  console.error('FAIL: refusing to touch the default ~/.claude; use the isolated JEV CLAUDE_CONFIG_DIR'); process.exit(1);
}
const settingsFile = path.join(configDir, 'settings.json');

function load() { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; } }
const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARK);

function strip(settings) {
  const hooks = settings.hooks || {};
  for (const ev of Object.keys(hooks)) {
    hooks[ev] = hooks[ev].map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) })).filter((g) => g.hooks.length);
    if (!hooks[ev].length) delete hooks[ev];
  }
  settings.hooks = hooks;
  if (!Object.keys(hooks).length) delete settings.hooks;
  return settings;
}

function install() {
  const before = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : null;
  const s = strip(load());
  s.hooks = s.hooks || {};
  for (const [ev, matcher] of Object.entries(EVENTS)) {
    const group = { hooks: [{ type: 'command', command, timeout: 15 }] };
    if (matcher) group.matcher = matcher;
    (s.hooks[ev] = s.hooks[ev] || []).push(group);
  }
  const after = JSON.stringify(s, null, 2) + '\n';
  if (before === after) { console.log(`INSTALL: unchanged (${settingsFile})`); return; }
  if (before !== null) fs.writeFileSync(`${settingsFile}.bak-${Date.now()}`, before);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(settingsFile, after);
  console.log(`INSTALL: hooks written to ${settingsFile}`);
}

function runHook(input, env) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'hook.mjs')], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null };
}

function verify() {
  const s = load();
  const problems = [];
  for (const [ev, matcher] of Object.entries(EVENTS)) {
    const g = (s.hooks?.[ev] || []).find((x) => (x.hooks || []).some(isOurs));
    if (!g) { problems.push(`${ev}: missing`); continue; }
    if ((g.matcher || null) !== matcher && !(matcher === '*' && !g.matcher)) problems.push(`${ev}: matcher ${g.matcher}`);
    if (!g.hooks.find(isOurs).command.includes(hookPath)) problems.push(`${ev}: points to another hook.mjs`);
  }
  if (!fs.existsSync(path.join(HERE, 'hook.mjs'))) problems.push('hook.mjs missing');

  // Live self-test against synthetic transcripts with the REAL thresholds.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-verify-'));
  fs.mkdirSync(path.join(tmp, 'handoffs'));
  const env = { JEV_ROTATION_STATE_DIR: path.join(tmp, 'state'), JEV_ROTATION_REPO_ROOT: tmp, JEV_ROTATION_TEST: '', JEV_ROTATION_THRESHOLDS: '' };
  const case_ = (tokens, i) => {
    const tp = path.join(tmp, `t${i}.jsonl`);
    fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', uuid: `u${i}`, message: { usage: { input_tokens: 1, cache_read_input_tokens: tokens - 1, output_tokens: 0 } } }) + '\n');
    return { session_id: `verify-${i}`, transcript_path: tp, cwd: tmp };
  };
  const w = runHook({ ...case_(221000, 1), hook_event_name: 'UserPromptSubmit', prompt: 'x' }, env);
  if (!/JEV_ROTATION_WARNING/.test(w.out?.systemMessage || '')) problems.push('self-test WARNING failed');
  const sp = runHook({ ...case_(236000, 2), hook_event_name: 'UserPromptSubmit', prompt: 'x' }, env);
  if (sp.out?.decision !== 'block') problems.push('self-test SOFT_STOP failed');
  const h = runHook({ ...case_(241000, 3), hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, env);
  if (h.out?.hookSpecificOutput?.permissionDecision !== 'deny' || !/ROTATE_SESSION_NOW/.test(h.out.hookSpecificOutput.permissionDecisionReason)) problems.push('self-test HARD_ROTATION failed');
  fs.rmSync(tmp, { recursive: true, force: true });

  if (problems.length) { console.error(`VERIFY: FAIL\n - ${problems.join('\n - ')}`); process.exit(1); }
  console.log(`VERIFY: PASS (5 hooks in ${settingsFile}; self-test warning/soft-stop/hard-rotation PASS)`);
}

if (args.includes('--uninstall')) {
  fs.writeFileSync(settingsFile, JSON.stringify(strip(load()), null, 2) + '\n');
  console.log('UNINSTALL: done');
} else if (args.includes('--verify')) {
  verify();
} else {
  install();
}
