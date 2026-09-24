#!/usr/bin/env node
// Smoke test do JEV Runtime V1: inicia o processo real (CLI) sobre as fixtures e verifica os 7 checks obrigatorios.
//   node test/jev/smoke.mjs  (ou: npm run smoke)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '../../src/jev/config.mjs';
import { createRuntime } from '../../src/jev/engine.mjs';
import { validateOutput } from '../../src/jev/output.mjs';

const FX = path.join(REPO_ROOT, 'fixtures', 'jev');
const CLI = path.join(REPO_ROOT, 'src', 'jev', 'cli.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'jev-smoke-'));
const checks = {};
const set = (k, ok, why) => { checks[k] = checks[k] === false ? false : !!ok; if (!ok) console.error(`  ✖ ${k}: ${why}`); };

let art;
try { art = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json')).art; } catch (e) { console.error('FATAL no arranque: ' + e.message); process.exit(2); }

const runs = readdirSync(FX).filter((f) => /^[A-H]_.*\.json$/.test(f)).map((f) => ({ input: path.join(FX, f) }));
runs.push({ input: path.join(FX, 'C_valid_multi_source.json'), previous: path.join(FX, 'C_previous_snapshot.json'), config: path.join(FX, 'config-fixture-trace-provisional.json') });
for (const r of runs) {
  const out = path.join(tmp, path.basename(r.input) + '.result.json');
  const args = [CLI, '--input', r.input, '--out', out];
  if (r.previous) args.push('--previous', r.previous);
  if (r.config) args.push('--config', r.config);
  const p = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const name = path.basename(r.input) + (r.previous ? ' (+previous, trace provisional)' : '');
  set('PROCESS_START', p.status === 0, `${name} exit ${p.status} ${p.stderr}`);
  if (p.status !== 0) continue;
  let res; try { res = JSON.parse(readFileSync(out, 'utf8')); set('INPUT_LOAD', true); } catch { set('INPUT_LOAD', false, name + ' output ilegivel'); continue; }
  const o = res.output; const a = res.audit;
  set('INPUT_LOAD', a.inputs.received_count + a.inputs.missing_count === 190, name + ' cobertura');
  set('CLASSIFIER', ['UNKNOWN'].includes(o.jev_directional_context) && a.state_machine_trace.length > 0 && a.rules.errors.length === 0, name + ' classificador');
  const errs = validateOutput(o, art);
  set('OUTPUT', errs.length === 0, name + ' ' + errs.join('; '));
  set('AUDIT', Array.isArray(a.inputs.received) && Array.isArray(a.rules.dispositions) && a.rules.dispositions.length === art.rules.rules.length && a.versions && a.versions.artifact_sha256, name + ' audit incompleto');
  set('SAFE_UNKNOWN', o.jev_directional_context === 'UNKNOWN' && (o.reason_codes.includes('RC_NO_ACTIVE_DIRECTIONAL_RULE') || o.reason_codes.includes('RC_DATA_INVALID')), name + ' safe unknown');
  set('NO_ORDER', a.guarantees.orders_emitted === 0 && a.guarantees.trades_executed === 0 && Object.values(a.safety).every((v) => v === false), name + ' ordem');
  console.log(`  · ${name}: ${o.jev_directional_context} · dq=${o.data_quality.status} · spx=${o.spx_final_context.effect_on_native} · reasons=${o.reason_codes.length}`);
}
console.log('');
for (const k of ['PROCESS_START', 'INPUT_LOAD', 'CLASSIFIER', 'OUTPUT', 'AUDIT', 'SAFE_UNKNOWN', 'NO_ORDER']) console.log(`${k.padEnd(14)} ${checks[k] ? 'PASS' : 'FAIL'}`);
process.exit(Object.values(checks).every(Boolean) && Object.keys(checks).length === 7 ? 0 : 1);
