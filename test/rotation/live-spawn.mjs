#!/usr/bin/env node
// JEV Rotation Controller V3 — LIVE spawn proof (manual: `npm run test:rotation:live`).
// A synthetic predecessor at 241k tokens hits the REAL hook with the REAL isolated config dir
// and REAL state dir. The hook opens a REAL new Windows Terminal window running the generated
// launch.ps1 (verify gate included). The only substitution: the successor binary is a wrapper
// that records args/env/cwd and then runs the real `claude -p` (haiku, 1 turn) with the same
// arguments, so the successor's real SessionStart hook must confirm the lineage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../tools/jev-rotation/controller.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs');
const CFG = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude-darkprogectis-jev');
const STATE = path.join(CFG, 'jev-rotation');
const th = loadConfig({}).thresholds;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-live-'));
const sid = `e2e-live-${Date.now()}`;
const tp = path.join(tmp, 'pred.jsonl');
fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', uuid: 'u1', message: { model: 'synthetic-e2e', usage: { input_tokens: 1, cache_read_input_tokens: 240999, output_tokens: 0 },
  content: [{ type: 'text', text: 'E2E synthetic predecessor: last assistant message before rotation.' }] } }) + '\n');
const record = path.join(tmp, 'successor-record.json');
const out = path.join(tmp, 'successor-output.txt');
const wrapper = path.join(tmp, 'claude-wrapper.ps1');
fs.writeFileSync(wrapper, [
  `@{ args = $args; cwd = (Get-Location).Path; CLAUDE_CONFIG_DIR = $env:CLAUDE_CONFIG_DIR; JEV_ROTATION_TEST = $env:JEV_ROTATION_TEST; JEV_ROTATION_STATE_DIR = $env:JEV_ROTATION_STATE_DIR; pid = $PID } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath '${record}'`,
  `& claude -p @args --model claude-haiku-4-5-20251001 --max-turns 1 *> '${out}'`,
  '[Environment]::Exit(0)',
].join('\r\n'));

const env = { ...process.env, CLAUDE_CONFIG_DIR: CFG, JEV_ROTATION_TEST: '1', JEV_ROTATION_CLAUDE_BIN: wrapper,
  JEV_ROTATION_THRESHOLDS: [th.prepare, th.warning, th.soft_stop, th.hard_rotation, th.ceiling].join(',') };
delete env.JEV_ROTATION_SPAWN; delete env.JEV_ROTATION_STATE_DIR; delete env.JEV_ROTATION_REPO_ROOT;

const r = spawnSync(process.execPath, [HOOK], { encoding: 'utf8', env,
  input: JSON.stringify({ session_id: sid, transcript_path: tp, cwd: ROOT, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'work' } }) });
const hookOut = JSON.parse(r.stdout || 'null');
const lock = JSON.parse(fs.readFileSync(path.join(STATE, 'rotation', `${sid}.lock`), 'utf8'));
console.log(`predecessor ${sid}: hook exit ${r.status}, continue=${hookOut?.continue}, decision=${hookOut?.hookSpecificOutput?.permissionDecision}`);
console.log(`lock: status=${lock.status} successor=${lock.successor} spawn=${JSON.stringify(lock.spawn)}`);

const lineage = () => fs.readFileSync(path.join(STATE, 'lineage.jsonl'), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const deadline = Date.now() + 180000;
let started = null;
while (Date.now() < deadline) {
  started = lineage().find((e) => e.event === 'SUCCESSOR_STARTED' && e.successor === lock.successor);
  if (started && fs.existsSync(record) && lineage().some((e) => e.event === 'SUCCESSOR_CONFIRMED' && e.from === sid)) break;
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
}
const rec = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8').replace(/^﻿/, '')) : null;
const transcript = path.join(CFG, 'projects', 'C--Users-ADM-Claude-JEV-code', `${lock.successor}.jsonl`);
const argv = rec ? [].concat(rec.args) : [];
const checks = {
  hook_stopped_predecessor: hookOut?.continue === false && hookOut?.hookSpecificOutput?.permissionDecision === 'deny',
  spawned_via_window: lock.status === 'SPAWNED' && ['wt', 'console'].includes(lock.spawn?.mode),
  successor_process_ran: !!rec,
  config_dir: rec?.CLAUDE_CONFIG_DIR?.toLowerCase() === CFG.toLowerCase(),
  cwd: rec?.cwd?.toLowerCase() === ROOT.toLowerCase(),
  test_env_not_leaked: !rec?.JEV_ROTATION_TEST && !rec?.JEV_ROTATION_STATE_DIR,
  session_id_preassigned: argv.includes('--session-id') && argv[argv.indexOf('--session-id') + 1] === lock.successor,
  brief_as_system_prompt: argv.includes('--append-system-prompt-file') && argv[argv.indexOf('--append-system-prompt-file') + 1] === lock.brief,
  successor_sessionstart_hook: !!started && started.config_dir?.toLowerCase() === CFG.toLowerCase(),
  successor_transcript: fs.existsSync(transcript),
  detached_watchdog_confirmed: lineage().some((e) => e.event === 'SUCCESSOR_CONFIRMED' && e.from === sid && e.successor === lock.successor),
  exactly_one_successor: lineage().filter((e) => e.event === 'ROTATION_TRIGGERED' && e.from === sid).length === 1,
};
console.log(JSON.stringify({ record: rec, started, transcript, checks }, null, 2));
if (fs.existsSync(out)) console.log('--- successor output (first 1500 chars) ---\n' + fs.readFileSync(out, 'utf8').slice(0, 1500));
const pass = Object.values(checks).every(Boolean);
console.log(pass ? 'LIVE_SPAWN: PASS' : 'LIVE_SPAWN: FAIL');
process.exit(pass ? 0 : 1);
