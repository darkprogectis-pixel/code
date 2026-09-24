// Testes da JEV Bridge / Control Center / NT8 AddOn (source) — somente leitura, robo travado, sem ordens.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../../src/jev/engine.mjs';
import { REPO_ROOT } from '../../src/jev/config.mjs';
import { JevFatalError } from '../../src/jev/artifacts.mjs';
import { createBridge } from '../../src/jev/bridge/server.mjs';
import { buildPanel } from '../../src/jev/bridge/panel-model.mjs';
import { runLive } from '../../src/jev/adapters/live-loop.mjs';

const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const FX = path.join(REPO_ROOT, 'fixtures', 'jev');
const fx = (n) => JSON.parse(readFileSync(path.join(FX, n), 'utf8'));
const req = (port, p, method = 'GET') => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); });
  r.on('error', (e) => resolve({ error: e.code })); r.end();
});
const bridges = [];
async function start(mode = 'REPLAY') { const b = createBridge({ host: '127.0.0.1', port: 0, mode }); const a = await b.listen(); bridges.push(b); return { b, port: a.port }; }
after(async () => { for (const b of bridges) await b.close(); });

test('B01 bridge so escuta em loopback', () => {
  assert.throws(() => createBridge({ host: '0.0.0.0', port: 0 }), JevFatalError);
  assert.throws(() => createBridge({ host: '192.168.0.10', port: 0 }), JevFatalError);
});

test('B02 antes do 1o ciclo: STARTING, UNKNOWN, robo OFF; output 503', async () => {
  const { port } = await start();
  const s = JSON.parse((await req(port, '/jev/v1/state')).body);
  assert.equal(s.status, 'STARTING'); assert.equal(s.jev.directional_context, 'UNKNOWN'); assert.equal(s.robot.state, 'OFF');
  assert.equal((await req(port, '/jev/v1/output')).status, 503);
  const h = JSON.parse((await req(port, '/jev/v1/health')).body);
  assert.equal(h.read_only, true); assert.equal(h.orders_enabled, false);
});

test('B03 depois de um ciclo: painel RUNNING, UNKNOWN seguro, sem probabilidade', async () => {
  const { b, port } = await start();
  b.update({ result: rt.run(fx('C_valid_multi_source.json')), report: { mode: 'REPLAY' } });
  const s = JSON.parse((await req(port, '/jev/v1/state')).body);
  assert.equal(s.status, 'RUNNING');
  assert.equal(s.jev.directional_context, 'UNKNOWN');
  assert.equal(s.jev.context_reason, 'RC_NO_ACTIVE_DIRECTIONAL_RULE');
  assert.equal(s.conviction, 'UNCALIBRATED');
  assert.match(s.probability_display, /NOT_SHOWN/);
  assert.ok(!/"(probability|prob_long|prob_short|p_long|p_short|confidence)"\s*:/.test(JSON.stringify(s)));
  assert.equal(s.dealer_context.dex_direction, 'UNRESOLVED');
  assert.equal(s.spx_context.market_origin, 'SPX');
  const o = JSON.parse((await req(port, '/jev/v1/output')).body);
  assert.equal(o.schema, 'jev-output/v1');
});

test('B04 somente GET/HEAD: qualquer escrita => 405 em todas as rotas', async () => {
  const { port } = await start();
  for (const p of ['/', '/jev/v1/state', '/jev/v1/output', '/jev/v1/audit', '/jev/v1/robot', '/jev/v1/health', '/x']) {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await req(port, p, m);
      assert.equal(r.status, 405, `${m} ${p}`);
      assert.equal(r.headers.allow, 'GET, HEAD');
    }
  }
  const h = await req(port, '/jev/v1/state', 'HEAD');
  assert.equal(h.status, 200); assert.equal(h.body, '');
});

test('B05 robo sempre OFF e nao habilitavel; travas todas false', async () => {
  const { b, port } = await start();
  b.update({ result: rt.run(fx('C_valid_multi_source.json')) });
  const r = JSON.parse((await req(port, '/jev/v1/robot')).body);
  assert.equal(r.state, 'OFF'); assert.equal(r.can_enable, false);
  assert.ok(Object.values(r.safety).every((v) => v === false));
  const src = readFileSync(path.join(REPO_ROOT, 'src', 'jev', 'bridge', 'server.mjs'), 'utf8');
  assert.ok(!/robot.*=\s*['"]ON|can_enable:\s*true/.test(src));
});

test('B07 bridge continua servindo com relay offline (UNKNOWN / DATA_INVALID)', async () => {
  const { b, port } = await start('LIVE');
  const offlineAdapter = { buildInput: async () => ({ input: { schema: 'jev-input/v1', evaluated_at: new Date().toISOString(), session: 'RTH', sources: {}, fields: {}, adapter_issues: [{ code: 'RC_RELAY_OFFLINE', detail: 'teste' }] }, report: { routes: [{ result: 'OFFLINE' }], relay: 'x' } }) };
  await runLive({ adapter: offlineAdapter, runtime: rt, intervalMs: 5, cycles: 2, onCycle: (c) => b.update(c) });
  const s = JSON.parse((await req(port, '/jev/v1/state')).body);
  assert.equal(s.status, 'RUNNING_NO_USABLE_DATA');
  assert.equal(s.jev.directional_context, 'UNKNOWN');
  assert.ok(s.reason_codes.some((r) => r.code === 'RC_RELAY_OFFLINE'));
  assert.equal(s.bridge.relay.ok_routes, 0);
});

test('B08 painel construido para todas as fixtures sem erro', () => {
  for (const f of readdirSync(FX).filter((x) => /^[A-H]_.*\.json$/.test(x))) {
    const p = buildPanel(rt.run(fx(f)), { mode: 'REPLAY' });
    assert.equal(p.robot.state, 'OFF');
    assert.equal(p.jev.directional_context, 'UNKNOWN');
  }
});

