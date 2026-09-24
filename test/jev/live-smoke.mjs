#!/usr/bin/env node
// LIVE SMOKE (read-only): roda o processo real `cli.mjs --live` contra o relay configurado por poucos ciclos,
// depois contra uma porta morta (fail-soft), e grava UM resumo sanitizado (sem valores de mercado) como evidencia.
//   node test/jev/live-smoke.mjs [--cycles 3] [--no-evidence]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '../../src/jev/config.mjs';
import { createRuntime } from '../../src/jev/engine.mjs';
import { validateOutput } from '../../src/jev/output.mjs';

const argv = process.argv.slice(2);
const cycles = Number(argv[argv.indexOf('--cycles') + 1]) || 3;
const writeEvidence = !argv.includes('--no-evidence');
const CLI = path.join(REPO_ROOT, 'src', 'jev', 'cli.mjs');
const LIVE_CFG = path.join(REPO_ROOT, 'config', 'jev-live-input-v1.json');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'jev-live-smoke-'));
const art = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json')).art;
const checks = {}; const set = (k, ok, why) => { checks[k] = checks[k] === false ? false : !!ok; if (!ok) console.error(`  ✖ ${k}: ${why}`); };

// 1) relay real
const out = path.join(tmp, 'live.json');
const p = spawnSync(process.execPath, [CLI, '--live', '--cycles', String(cycles), '--interval-ms', '5000', '--out', out], { encoding: 'utf8', timeout: 180000 });
process.stderr.write(p.stderr);
let res = null;
try { res = JSON.parse(readFileSync(out, 'utf8')); } catch { /* sem output */ }
const rep = res && res.adapter_report;
const relayOk = !!(rep && rep.routes.some((r) => r.result === 'OK'));
set('RELAY_CONNECT', p.status === 0 && relayOk, `exit ${p.status}; rotas OK: ${rep ? rep.routes.filter((r) => r.result === 'OK').length : 0}`);
set('INPUT_BUILD', !!(rep && rep.sources_present.length && res.audit.inputs.received_count > 0), 'input vazio');
set('JEV_PIPELINE', !!(res && res.audit.state_machine_trace.length && res.audit.rules.errors.length === 0), 'pipeline');
const errs = res ? validateOutput(res.output, art) : ['sem output'];
set('OUTPUT', errs.length === 0, errs.join('; '));
set('AUDIT', !!(res && res.audit.rules.dispositions.length === art.rules.rules.length && res.audit.versions.artifact_sha256), 'audit');
set('NO_ORDER', !!(res && res.audit.guarantees.orders_emitted === 0 && Object.values(res.audit.safety).every((v) => v === false)) && !/orders=[1-9]/.test(p.stderr), 'ordem');
const cyclesDone = (p.stderr.match(/\[jev\] ciclo \d+/g) || []).length;

// 2) fail-soft: porta morta
const deadCfg = path.join(tmp, 'dead.json');
writeFileSync(deadCfg, JSON.stringify({ ...JSON.parse(readFileSync(LIVE_CFG, 'utf8')), relay: { host: '127.0.0.1', port: 1, base_path: '/gexbot' } }));
const deadOut = path.join(tmp, 'dead-out.json');
const d = spawnSync(process.execPath, [CLI, '--live', '--live-config', deadCfg, '--cycles', '1', '--out', deadOut], { encoding: 'utf8', timeout: 60000 });
let dres = null; try { dres = JSON.parse(readFileSync(deadOut, 'utf8')); } catch { /* */ }
set('FAIL_SOFT', d.status === 0 && dres && dres.output.jev_directional_context === 'UNKNOWN' && dres.output.reason_codes.includes('RC_RELAY_OFFLINE'), `exit ${d.status}`);

const summary = ['RELAY_CONNECT', 'INPUT_BUILD', 'JEV_PIPELINE', 'OUTPUT', 'AUDIT', 'FAIL_SOFT', 'NO_ORDER'].map((k) => [k, checks[k] ? 'PASS' : 'FAIL']);
console.log('');
for (const [k, v] of summary) console.log(`${k.padEnd(14)} ${v}`);

if (writeEvidence && res) {
  const o = res.output;
  const ev = {
    _note: 'EVIDENCIA SANITIZADA do live smoke read-only: so estados, contagens e codigos; nenhum valor de mercado, nenhum segredo',
    evaluated_at: o.evaluated_at, session: rep.session, cycles_run: cyclesDone, relay: rep.relay, read_only: rep.read_only,
    routes: rep.routes.map((r) => ({ path: r.path, result: r.result, http_status: r.status, relay_cached: r.relay ? r.relay.cached : null, unmapped_payload_keys: r.unmapped_payload_keys || [] })),
    sources_present: rep.sources_present,
    fields: { received: res.audit.inputs.received_count, missing: res.audit.inputs.missing_count, contract_total: 190, live_status_counts: rep.live_status_counts },
    data_quality: { status: o.data_quality.status, per_source: Object.fromEntries(Object.entries(o.data_quality.per_source).map(([k, v]) => [k, v.freshness_state])),
      dimensions: Object.fromEntries(Object.entries(o.data_quality.dimensions).map(([k, v]) => [k, v.availability])), degradation_codes: [...new Set(o.data_quality.degradation.map((x) => x.code))] },
    jev_directional_context: o.jev_directional_context, reason_codes: o.reason_codes, unresolved_fields_count: o.unresolved_fields.length,
    frozen_observation: Object.fromEntries(Object.entries(rep.frozen_observation).map(([k, v]) => [k, { consecutive_identical_vendor_ts: v.count }])),
    guarantees: res.audit.guarantees, smoke: Object.fromEntries(summary), versions: { runtime: o.runtime_version, mapping: rep.mapping_version },
  };
  const evPath = path.join(REPO_ROOT, 'context', 'jev-future', 'runtime-examples', 'jev-live-smoke-evidence-v1.json');
  writeFileSync(evPath, JSON.stringify(ev, null, 2) + '\n');
  console.log('\nevidencia sanitizada: ' + path.relative(REPO_ROOT, evPath));
}
process.exit(summary.every(([, v]) => v === 'PASS') ? 0 : 1);
