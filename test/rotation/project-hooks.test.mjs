// JEV Rotation Controller V3 — enforcement is declared in the PROJECT settings (versioned), so a session
// opened in this repo outside START_JEV_CLAUDE.ps1 / in a profile without hooks is still registered.
// Incident 2026-10-08 (JEV ROT DESIGN req_01a11dd93e6c7d118160c0cce9fad4db, DIFF req_01a11dd9cbd7759fb6e26289d4bd44ae).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROT = path.join(ROOT, 'tools', 'jev-rotation');
const MARK = 'jev-rotation-controller-v2';
const command = `node "${path.join(ROT, 'hook.mjs').replace(/\\/g, '/')}" # ${MARK}`;
const EVENTS = { SessionStart: null, UserPromptSubmit: null, PreToolUse: '*', PostToolUse: '*', Stop: null };
const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));

// Clean env: no test overrides, real thresholds, state under the given (empty) profile.
function cleanEnv(configDir) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  for (const k of Object.keys(env)) if (k.startsWith('JEV_ROTATION_') || k === 'CLAUDE_CODE_SESSION_ID') delete env[k];
  return env;
}

test('PH1 project settings declare the 5 controller hooks with the exact installer command', () => {
  for (const [ev, matcher] of Object.entries(EVENTS)) {
    const ours = (settings.hooks[ev] || []).filter((g) => (g.hooks || []).some((h) => h.command === command));
    assert.equal(ours.length, 1, `${ev}: controller hook must be declared exactly once`);
    assert.equal(ours[0].matcher || null, matcher, `${ev}: matcher`);
    assert.equal(ours[0].hooks.find((h) => h.command === command).timeout, 15);
  }
});

test('PH2 jev-finish hooks are still declared and hooks are not globally disabled', () => {
  for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']) {
    assert.ok((settings.hooks[ev] || []).some((g) => (g.hooks || []).some((h) => /jev-finish-v1/.test(h.command))), `${ev}: jev-finish missing`);
  }
  assert.notEqual(settings.disableAllHooks, true);
});

test('PH3 a session in a profile WITHOUT profile hooks is registered by the hook and accepted by force --check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-ph3-'));
  try {
    const sid = '00000000-0000-4000-8000-0000000000f3';
    const transcript = path.join(dir, `${sid}.jsonl`);
    fs.writeFileSync(transcript, JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } }) + '\n');
    const env = cleanEnv(dir);
    assert.ok(!fs.existsSync(path.join(dir, 'settings.json')), 'profile has no settings at all');
    const h = spawnSync(process.execPath, [path.join(ROT, 'hook.mjs')], { encoding: 'utf8', env, input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: sid, transcript_path: transcript, cwd: ROOT, source: 'startup' }) });
    assert.equal(h.status, 0, h.stderr);
    const st = JSON.parse(fs.readFileSync(path.join(dir, 'jev-rotation', 'state', `${sid}.json`), 'utf8'));
    assert.equal(st.session_id, sid);
    const f = spawnSync(process.execPath, [path.join(ROT, 'force.mjs'), '--session', sid, '--config-dir', dir, '--check'], { encoding: 'utf8', env });
    assert.match(f.stdout, /JEV_ROTATION_FORCE CHECK_OK/, f.stdout + f.stderr);
    assert.equal(f.status, 0);
    assert.ok(!fs.existsSync(path.join(dir, 'jev-rotation', 'rotation', `${sid}.lock`)), '--check must not rotate');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PH4 install-hooks --verify passes for a profile whose hooks come from the project settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-rot-ph4-'));
  try {
    const v = spawnSync(process.execPath, [path.join(ROT, 'install-hooks.mjs'), '--config-dir', dir, '--verify'], { encoding: 'utf8', env: cleanEnv(dir) });
    assert.equal(v.status, 0, v.stdout + v.stderr);
    assert.match(v.stdout, /VERIFY: PASS/);
    assert.ok(!fs.existsSync(path.join(dir, 'settings.json')), '--verify must not write hooks into the profile');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
