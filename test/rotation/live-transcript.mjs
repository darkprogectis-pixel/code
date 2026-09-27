#!/usr/bin/env node
// JEV Rotation Controller V3 — LIVE test ROTATED_SUCCESSOR_TRANSCRIPT_PERSISTENCE
// (manual: `npm run test:rotation:transcript` / `npm run test:rotation:real`).
//
// Regression (session 48909bd5): the automatic successor inherited the parent's
// CLAUDE_CODE_CHILD_SESSION marker (injected by Claude Code into every hook process) and
// started with "Transcript saving is off". live-spawn.mjs did not catch it: its successor
// ran `claude -p`, and Claude Code only drops persistence for INTERACTIVE child sessions.
//
// Here the successor is a real INTERACTIVE `claude` in the real new window opened by the
// real hook through the generated launch.ps1. The only substitution is a wrapper binary that
// records env/pid/cwd/args and then runs the real interactive claude with the same arguments
// (haiku, write/exec tools disabled so the continuation can only read). The test proves:
// marker not inherited, transcript file created, transcript grows after the interaction,
// config/cwd/lineage/controller correct, exactly one successor. Then it closes the window.
//
// Predecessor modes:
//   (default)       synthetic transcript at 241k hits the real hook (real thresholds);
//   --real-parent   a REAL `claude -p` parent session runs in the isolated config with reduced
//                   thresholds (JEV_ROTATION_TEST=1): its own PreToolUse hook rotates it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../tools/jev-rotation/controller.mjs';
import { CLAUDE_SESSION_ENV } from '../../tools/jev-rotation/hook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs');
const CFG = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude-darkprogectis-jev');
const STATE = path.join(CFG, 'jev-rotation');
const PROJECTS = path.join(CFG, 'projects', 'C--Users-ADM-Claude-JEV-code');
const REAL_PARENT = process.argv.includes('--real-parent');
const th = loadConfig({}).thresholds;
const sleep = (ms) => spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);
const lineage = () => fs.readFileSync(path.join(STATE, 'lineage.jsonl'), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const size = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-transcript-'));
const record = path.join(tmp, 'successor-record.json');
const wrapper = path.join(tmp, 'claude-wrapper.ps1');
const watched = [...CLAUDE_SESSION_ENV, 'CLAUDE_CODE_FORCE_SESSION_PERSISTENCE', 'CLAUDE_CONFIG_DIR', 'JEV_ROTATION_TEST', 'JEV_ROTATION_THRESHOLDS', 'JEV_ROTATION_STATE_DIR'];
fs.writeFileSync(wrapper, [
  `$e = [ordered]@{}; foreach ($n in @(${watched.map((n) => `'${n}'`).join(',')})) { $e[$n] = [Environment]::GetEnvironmentVariable($n) }`,
  `@{ args = $args; cwd = (Get-Location).Path; pid = $PID; env = $e } | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath '${record}'`,
  `& claude @args --model claude-haiku-4-5-20251001 --disallowedTools Bash Edit Write NotebookEdit Agent WebFetch WebSearch`,
].join('\r\n'));

const baseEnv = { ...process.env };
// Whoever runs this test (possibly a Claude Code Bash tool) must not leak its own markers into
// the parent: the parent/hook must get them from Claude Code itself, exactly as in production.
for (const k of CLAUDE_SESSION_ENV) delete baseEnv[k];
delete baseEnv.JEV_ROTATION_SPAWN; delete baseEnv.JEV_ROTATION_STATE_DIR; delete baseEnv.JEV_ROTATION_REPO_ROOT;
Object.assign(baseEnv, { CLAUDE_CONFIG_DIR: CFG, JEV_ROTATION_TEST: '1', JEV_ROTATION_CLAUDE_BIN: wrapper });

let parent, parentInfo;
if (REAL_PARENT) {
  parent = crypto.randomUUID();
  // Reduced thresholds: the first API response of the parent is already past hard rotation.
  const env = { ...baseEnv, JEV_ROTATION_THRESHOLDS: '1000,2000,3000,4000,900000' };
  const r = spawnSync('claude', ['-p', 'Use the Bash tool to run exactly: echo jev-rotation-probe', '--session-id', parent,
    '--model', 'claude-haiku-4-5-20251001', '--allowedTools', 'Bash', '--max-turns', '3'], { cwd: ROOT, env, encoding: 'utf8', shell: true, timeout: 180000 });
  parentInfo = { exit: r.status, stdout: (r.stdout || '').slice(0, 600), stderr: (r.stderr || '').slice(0, 600), transcript: path.join(PROJECTS, `${parent}.jsonl`) };
} else {
  parent = `e2e-transcript-${Date.now()}`;
  const tp = path.join(tmp, 'pred.jsonl');
  fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', uuid: 'u1', message: { model: 'synthetic-e2e', usage: { input_tokens: 1, cache_read_input_tokens: 240999, output_tokens: 0 },
    content: [{ type: 'text', text: 'E2E synthetic predecessor: last assistant message before rotation.' }] } }) + '\n');
  // A hook process receives Claude Code's session markers; reproduce that exactly.
  const env = { ...baseEnv, JEV_ROTATION_THRESHOLDS: [th.prepare, th.warning, th.soft_stop, th.hard_rotation, th.ceiling].join(','),
    CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_SESSION_ID: parent, CLAUDE_CODE_SESSION_ATTENDED: '1', CLAUDE_PID: String(process.pid), CLAUDE_EFFORT: 'medium' };
  const r = spawnSync(process.execPath, [HOOK], { encoding: 'utf8', env,
    input: JSON.stringify({ session_id: parent, transcript_path: tp, cwd: ROOT, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'work' } }) });
  parentInfo = { hook_exit: r.status, hook_out: JSON.parse(r.stdout || 'null') };
}

const lockFile = path.join(STATE, 'rotation', `${parent}.lock`);
const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : null;
console.log(`PARENT_SESSION = ${parent}`);
console.log(`parent: ${JSON.stringify(parentInfo)}`);
console.log(`lock: ${lock ? `status=${lock.status} successor=${lock.successor} spawn=${JSON.stringify(lock.spawn)} trigger=${lock.trigger} tokens=${lock.tokens}` : 'NONE'}`);
if (!lock) { console.log('ROTATED_SUCCESSOR_TRANSCRIPT_PERSISTENCE: FAIL (no rotation)'); process.exit(1); }

const transcript = path.join(PROJECTS, `${lock.successor}.jsonl`);
const deadline = Date.now() + 240000;
let firstSize = -1, grown = false, started = null, confirmed = false;
while (Date.now() < deadline) {
  const s = size(transcript);
  if (s > 0 && firstSize < 0) firstSize = s;
  if (firstSize > 0 && s > firstSize && fs.readFileSync(transcript, 'utf8').includes('"type":"assistant"')) grown = true;
  started = lineage().find((e) => e.event === 'SUCCESSOR_STARTED' && e.successor === lock.successor) || null;
  confirmed = lineage().some((e) => e.event === 'SUCCESSOR_CONFIRMED' && e.from === parent && e.successor === lock.successor);
  if (grown && started && confirmed && fs.existsSync(record)) break;
  sleep(2000);
}
const rec = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8').replace(/^﻿/, '')) : null;
const finalSize = size(transcript);
const argv = rec ? [].concat(rec.args) : [];
let firstUser = '';
try { firstUser = fs.readFileSync(transcript, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.type === 'user')?.message?.content; } catch { /* no transcript */ }
firstUser = typeof firstUser === 'string' ? firstUser : JSON.stringify(firstUser || '');

// Close the successor window (wrapper $PID = the window's PowerShell; /T takes claude with it).
if (rec?.pid) spawnSync('taskkill', ['/PID', String(rec.pid), '/T', '/F'], { encoding: 'utf8' });

const inherited = rec ? Object.fromEntries(CLAUDE_SESSION_ENV.map((k) => [k, rec.env?.[k] ?? null])) : null;
const checks = {
  spawned_via_window: lock.status === 'SPAWNED' && ['wt', 'console'].includes(lock.spawn?.mode),
  successor_process_ran: !!rec,
  child_session_marker_not_inherited: !!rec && !rec.env?.CLAUDE_CODE_CHILD_SESSION,
  no_parent_session_env_inherited: !!rec && CLAUDE_SESSION_ENV.every((k) => !rec.env?.[k]),
  persistence_not_forced: !!rec && !rec.env?.CLAUDE_CODE_FORCE_SESSION_PERSISTENCE,
  config_dir: rec?.env?.CLAUDE_CONFIG_DIR?.toLowerCase() === CFG.toLowerCase(),
  cwd: rec?.cwd?.toLowerCase() === ROOT.toLowerCase(),
  test_env_not_leaked: !!rec && !rec.env?.JEV_ROTATION_TEST && !rec.env?.JEV_ROTATION_THRESHOLDS && !rec.env?.JEV_ROTATION_STATE_DIR,
  session_id_preassigned: argv.includes('--session-id') && argv[argv.indexOf('--session-id') + 1] === lock.successor,
  brief_as_system_prompt: argv.includes('--append-system-prompt-file') && argv[argv.indexOf('--append-system-prompt-file') + 1] === lock.brief,
  interactive_successor: !!rec && !argv.includes('-p') && !argv.includes('--print'),
  transcript_created: firstSize > 0,
  transcript_grows_after_interaction: grown,
  bootstrap_in_transcript: firstUser.includes('JEV ROTATION CONTROLLER V3'),
  controller_active_in_successor: !!started && started.config_dir?.toLowerCase() === CFG.toLowerCase(),
  lineage_confirmed: confirmed,
  exactly_one_successor: lineage().filter((e) => e.event === 'ROTATION_TRIGGERED' && e.from === parent).length === 1
    && !lineage().some((e) => e.event === 'SUCCESSOR_RESPAWNED' && e.from === parent),
};
console.log(JSON.stringify({ successor: lock.successor, child_process: rec?.pid, inherited_session_env: inherited, transcript, transcript_size: { first: firstSize, final: finalSize }, started, checks }, null, 2));
console.log(`CHILD_SESSION = ${lock.successor}`);
console.log(`CHILD_PROCESS = ${rec?.pid ?? 'UNKNOWN'}`);
console.log(`CHILD_SESSION_MARKER_INHERITED = ${rec ? (rec.env?.CLAUDE_CODE_CHILD_SESSION ? 'YES' : 'NO') : 'UNKNOWN'}`);
console.log(`TRANSCRIPT_SAVING = ${firstSize > 0 ? 'ON' : 'OFF'}`);
const pass = Object.values(checks).every(Boolean);
console.log(pass ? 'ROTATED_SUCCESSOR_TRANSCRIPT_PERSISTENCE: PASS' : 'ROTATED_SUCCESSOR_TRANSCRIPT_PERSISTENCE: FAIL');
process.exit(pass ? 0 : 1);
