#!/usr/bin/env node
// SMOKE da JEV Bridge / Control Center: sobe o processo real `cli.mjs --serve` (LIVE contra o relay e REPLAY de fixture),
// consulta as rotas read-only e verifica os checks. Nao envia ordem, nao escreve em disco.
//   node test/jev/bridge-smoke.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { REPO_ROOT } from '../../src/jev/config.mjs';

const CLI = path.join(REPO_ROOT, 'src', 'jev', 'cli.mjs');
const get = (port, p, method = 'GET') => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, timeout: 4000 }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
  r.on('error', () => resolve({ status: 0, body: '' })); r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: '' }); }); r.end();
});
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
const DATA = mkdtempSync(path.join(os.tmpdir(), 'ijc-bsmoke-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = {}; const set = (k, ok, why) => { checks[k] = checks[k] === false ? false : !!ok; if (!ok) console.error(`  ✖ ${k}: ${why}`); };

async function scenario(name, port, extra) {
  const child = spawn(process.execPath, [CLI, '--serve', '--port', String(port), '--cp-port', String(port + 100), '--cycles', '2', ...extra], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, IJC_DATA_DIR: DATA } });
  let err = ''; child.stderr.on('data', (d) => (err += d));
  let state = null;
  for (let i = 0; i < 60; i++) { await sleep(500); const h = await get(port, '/jev/v1/health'); if (h.status === 200 && JSON.parse(h.body).status === 'RUNNING') { state = JSON.parse((await get(port, '/jev/v1/state')).body); break; } }
  set('PROCESS_START', !!state, `${name}: bridge nao ficou RUNNING. ${err}`);
  if (state) {
    set('BRIDGE_READ_ONLY', (await get(port, '/jev/v1/robot', 'POST')).status === 405 && (await get(port, '/jev/v1/state', 'PUT')).status === 405, name + ' escrita aceita');
    const ui = await get(port, '/');
    set('CONTROL_CENTER_UI', ui.status === 200 && /INVICTUS JEV CODE/.test(ui.body), name + ' ui');
    set('PANEL_STATE', state.schema === 'jev-panel/v1' && state.jev.directional_context === 'UNKNOWN' && state.conviction === 'UNCALIBRATED', name + ' painel');
    set('ROBOT_LOCKED_OFF', state.robot.state === 'OFF' && state.robot.can_enable === false && state.robot.execution === 'DISABLED' && state.robot.order_path === 'HARD_DISABLED' && Object.values(state.robot.safety).every((v) => v === false), name + ' robo');
    const cpNoToken = await get(port + 100, '/robot/v1/intents');
    set('CONTROL_PLANE_LOCKED', cpNoToken.status === 401, name + ' control plane sem token deveria ser 401');
    set('NO_ORDER', state.guarantees && state.guarantees.orders_emitted === 0, name + ' ordens');
    const out = await get(port, '/jev/v1/output');
    set('SAME_ENGINE_OUTPUT', out.status === 200 && JSON.parse(out.body).schema === 'jev-output/v1', name + ' output');
    console.log(`  · ${name}: ${state.status} · ${state.jev.directional_context} · dq=${state.data_quality.status} · relay=${state.bridge.relay ? state.bridge.relay.ok_routes + '/' + state.bridge.relay.total_routes : 'n/a'} · robo=${state.robot.state}`);
  }
  child.kill();
  await new Promise((r) => child.on('exit', r));
}

await scenario('LIVE', 3631, ['--interval-ms', '5000']);
await scenario('REPLAY', 3632, ['--replay', path.join(REPO_ROOT, 'fixtures', 'jev', 'C_valid_multi_source.json'), '--interval-ms', '1000']);
console.log('');
const keys = ['PROCESS_START', 'BRIDGE_READ_ONLY', 'CONTROL_CENTER_UI', 'PANEL_STATE', 'ROBOT_LOCKED_OFF', 'CONTROL_PLANE_LOCKED', 'NO_ORDER', 'SAME_ENGINE_OUTPUT'];
for (const k of keys) console.log(`${k.padEnd(20)} ${checks[k] ? 'PASS' : 'FAIL'}`);
process.exit(keys.every((k) => checks[k]) ? 0 : 1);
