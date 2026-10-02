#!/usr/bin/env node
// Probe overhead + decision-neutrality bench (Phase 1). Each run uses a fresh temp state dir (test mode, dry spawn),
// executed WITH the probe (JEV_OBS_DIR=<tmp>) and WITHOUT (JEV_OBS_PROBE=0). stdout (normalized for temp paths and
// timestamps) and exit code must be identical; latency is reported. Never touches real hook state.
//   node tools/jev-obs/bench-hooks.mjs [--n 30] [--out <json>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { quantile } from './aggregate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = { 'jev-rotation': path.join(ROOT, 'tools', 'jev-rotation', 'hook.mjs'), 'jev-finish': path.join(ROOT, 'tools', 'jev-finish', 'hook.mjs') };
export const SCENARIOS = [
  { name: 'rotation:PreToolUse:below', hook: 'jev-rotation', event: 'PreToolUse', tokens: 10, extra: { tool_name: 'Bash', tool_input: { command: 'ls' } } },
  { name: 'rotation:Stop:warning', hook: 'jev-rotation', event: 'Stop', tokens: 2500, extra: {} },
  { name: 'finish:PreToolUse:Edit:noloop', hook: 'jev-finish', event: 'PreToolUse', tokens: 10, extra: { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } } },
  { name: 'finish:Stop:noloop', hook: 'jev-finish', event: 'Stop', tokens: 10, extra: {} },
];

function runOnce(sc, probe) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-obs-bench-'));
  try {
    const repo = path.join(t, 'repo'); fs.mkdirSync(path.join(repo, 'handoffs'), { recursive: true }); fs.mkdirSync(path.join(t, 'cfg'), { recursive: true }); fs.mkdirSync(path.join(t, 'live'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'handoffs', 'HANDOFF_CANON.md'), '# canon\n');
    const sid = 'bbbbbbbb-0000-4000-8000-' + '0'.repeat(12);
    const tp = path.join(t, `${sid}.jsonl`);
    fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', uuid: crypto.randomUUID(), message: { usage: { input_tokens: 1, cache_read_input_tokens: Math.max(0, sc.tokens - 1), output_tokens: 0 } } }) + '\n');
    const env = { ...process.env, JEV_FINISH_TEST: '1', JEV_FINISH_STATE_DIR: path.join(t, 'fin'), JEV_FINISH_REPO_ROOT: repo, JEV_FINISH_FORBIDDEN: path.join(t, 'live'),
      JEV_ROTATION_TEST: '1', JEV_ROTATION_STATE_DIR: path.join(t, 'rot'), JEV_ROTATION_REPO_ROOT: repo, JEV_ROTATION_SPAWN: 'dry', JEV_ROTATION_WATCHDOG: 'off',
      CLAUDE_CONFIG_DIR: path.join(t, 'cfg'), JEV_ROTATION_THRESHOLDS: '1000,2000,3000,4000,5000' };
    delete env.CLAUDE_CODE_SESSION_ID;
    if (probe) { env.JEV_OBS_DIR = path.join(t, 'obs'); delete env.JEV_OBS_PROBE; } else { env.JEV_OBS_PROBE = '0'; delete env.JEV_OBS_DIR; }
    const input = JSON.stringify({ session_id: sid, hook_event_name: sc.event, transcript_path: tp, cwd: repo, ...sc.extra });
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [HOOKS[sc.hook]], { input, env, encoding: 'utf8', cwd: repo });
    const wall = Number(process.hrtime.bigint() - t0) / 1e6;
    const norm = (s) => String(s || '').split(t).join('<T>').split(t.replace(/\\/g, '/')).join('<T>').split(JSON.stringify(t).slice(1, -1)).join('<T>').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<TS>');
    let probeRec = null;
    try { probeRec = JSON.parse(fs.readFileSync(path.join(t, 'obs', 'hook-metrics.ndjson'), 'utf8').trim().split('\n').pop()); } catch { /* none */ }
    return { code: r.status, stdout: norm(r.stdout), wall, probeRec };
  } finally { try { fs.rmSync(t, { recursive: true, force: true }); } catch { /* ignore */ } }
}

// Direct cost of the probe itself, in one isolated child with a warm ESM loader (as inside a hook): dynamic import time + exit-handler time (200 calls, temp dir).
// Process wall-time deltas above are reported too, but they are dominated by spawn noise (baseline p95 swings > 100 ms).
export function probeInProcess(calls = 200) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-obs-probe-'));
  try {
    const url = new URL('./hook-probe.mjs', import.meta.url).href;
    const warmFile = path.join(t, 'warm.mjs'); fs.writeFileSync(warmFile, 'export default 1;\n'); // a hook has already loaded its own local modules
    const warm = pathToFileURL(warmFile).href;
    const code = `const {performance:P}=await import('node:perf_hooks');process.argv[1]='x/jev-finish/hook.mjs';await import('node:fs');await import('node:path');await import(${JSON.stringify(warm)});const t0=P.now();await import(${JSON.stringify(url)});const imp=P.now()-t0;
const fn=process.listeners('exit').at(-1);const d=[];for(let i=0;i<${calls};i++){const a=P.now();fn(0);d.push(P.now()-a);}d.sort((x,y)=>x-y);
process.stderr.write(JSON.stringify({import_ms:imp,exit_p50:d[Math.floor(d.length*0.5)],exit_p95:d[Math.ceil(d.length*0.95)-1],exit_max:d.at(-1)}));process.removeAllListeners('exit');`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, JEV_OBS_DIR: t, JEV_OBS_PROBE: '1', JEV_ROTATION_TEST: '', JEV_FINISH_TEST: '' }, encoding: 'utf8' });
    const m = JSON.parse(r.stderr); const lines = fs.readFileSync(path.join(t, 'hook-metrics.ndjson'), 'utf8').trim().split(/\r?\n/).length;
    const f = (x) => +x.toFixed(2);
    return { import_ms: f(m.import_ms), exit_handler_ms: { p50: f(m.exit_p50), p95: f(m.exit_p95), max: f(m.exit_max) }, records_written: lines, total_p95_ms: f(m.import_ms + m.exit_p95) };
  } finally { try { fs.rmSync(t, { recursive: true, force: true }); } catch { /* ignore */ } }
}

export function bench(n = 30, scenarios = SCENARIOS) {
  const rows = [];
  for (const sc of scenarios) {
    const on = [], off = []; let mismatches = 0, probeRecords = 0; const sample = {};
    for (let i = 0; i < n; i++) {
      const a = runOnce(sc, false), b = runOnce(sc, true);
      off.push(a.wall); on.push(b.wall);
      if (a.code !== b.code || a.stdout !== b.stdout) { mismatches++; sample.off ??= { code: a.code, stdout: a.stdout.slice(0, 300) }; sample.on ??= { code: b.code, stdout: b.stdout.slice(0, 300) }; }
      if (b.probeRec) { probeRecords++; sample.probe ??= b.probeRec; }
    }
    const st = (x) => ({ p50: +quantile(x, 0.5).toFixed(1), p95: +quantile(x, 0.95).toFixed(1), mean: +(x.reduce((s, v) => s + v, 0) / x.length).toFixed(1) });
    const S_on = st(on), S_off = st(off);
    rows.push({ scenario: sc.name, n, mismatches, probe_records: probeRecords, wall_ms_without_probe: S_off, wall_ms_with_probe: S_on,
      overhead_ms: { p50: +(S_on.p50 - S_off.p50).toFixed(1), p95: +(S_on.p95 - S_off.p95).toFixed(1), mean: +(S_on.mean - S_off.mean).toFixed(1) }, sample });
  }
  const inproc = probeInProcess();
  return { at: new Date().toISOString(), node: process.version, n, decision_neutral: rows.every((r) => r.mismatches === 0), probe_recorded_every_run: rows.every((r) => r.probe_records === n),
    probe_inprocess: inproc, wall_delta_p95_ms_noisy: Math.max(...rows.map((r) => r.overhead_ms.p95)), wall_delta_p50_ms: Math.max(...rows.map((r) => r.overhead_ms.p50)),
    threshold_ms: 10, probe_default: inproc.total_p95_ms > 10 ? 'OFF_RECOMMENDED' : 'ON', rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv; const ni = a.indexOf('--n'); const oi = a.indexOf('--out');
  const R = bench(ni > 0 ? Number(a[ni + 1]) : 30);
  if (oi > 0) fs.writeFileSync(a[oi + 1], JSON.stringify(R, null, 2) + '\n');
  console.log(JSON.stringify({ ...R, rows: R.rows.map(({ sample, ...r }) => r) }, null, 2));
  process.exit(R.decision_neutral && R.probe_recorded_every_run ? 0 : 1);
}
