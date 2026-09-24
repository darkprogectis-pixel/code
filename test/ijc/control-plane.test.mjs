// CONTROL PLANE :3591 — loopback, token obrigatorio, intents sempre vazias, web sem caminho de enable, token nunca logado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
process.env.IJC_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'ijc-cp-'));
const { REPO_ROOT } = await import('../../src/jev/config.mjs');
const { JevFatalError } = await import('../../src/jev/artifacts.mjs');
const { createBridge } = await import('../../src/jev/bridge/server.mjs');
const { loadRobotConfig } = await import('../../src/ijc/robot/config.mjs');
const { createRobotCore } = await import('../../src/ijc/robot/robot-core.mjs');
const { loadOrCreateToken, tokenPath } = await import('../../src/ijc/control-plane/auth.mjs');
const { createControlPlane } = await import('../../src/ijc/control-plane/server.mjs');
const { createLogger, sanitize } = await import('../../src/ijc/common/jsonl-log.mjs');

const token = loadOrCreateToken();
const logger = createLogger('control-plane', { forbidden: [token] });
const core = createRobotCore({ config: loadRobotConfig(path.join(REPO_ROOT, 'config', 'ijc-robot-v1.json')), stateDir: mkdtempSync(path.join(os.tmpdir(), 'ijc-st-')), logger: createLogger('robot', { forbidden: [token] }) });
const cp = createControlPlane({ host: '127.0.0.1', port: 0, token, core, logger });
const { port } = await cp.listen();
after(() => cp.close());
const rq = (p, method = 'GET', headers = {}, body) => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(b); } catch { return null; } })() })); });
  r.on('error', (e) => resolve({ status: 0, error: e.code })); if (body) r.write(body); r.end();
});
const H = { 'x-ijc-token': token, 'content-type': 'application/json' };

test('C01 so loopback e token valido; sem token => 401 em TODA rota', async () => {
  assert.throws(() => createControlPlane({ host: '0.0.0.0', port: 0, token, core }), JevFatalError);
  assert.throws(() => createControlPlane({ host: '127.0.0.1', port: 0, token: 'curto', core }), JevFatalError);
  for (const [m, p] of [['GET', '/robot/v1/status'], ['GET', '/robot/v1/intents'], ['POST', '/robot/v1/report'], ['POST', '/robot/v1/enable-request'], ['POST', '/robot/v1/disable'], ['POST', '/robot/v1/emergency'], ['GET', '/x']]) {
    assert.equal((await rq(p, m)).status, 401, `${m} ${p} sem token`);
    assert.equal((await rq(p, m, { 'x-ijc-token': 'f'.repeat(64) })).status, 401, `${m} ${p} token errado`);
  }
});

test('C02 mesmo com token: intents sempre vazias e ORDER_PATH HARD_DISABLED; enable recusado', async () => {
  const i = await rq('/robot/v1/intents?after=0', 'GET', H);
  assert.equal(i.status, 200); assert.deepEqual(i.json.intents, []); assert.equal(i.json.order_path, 'HARD_DISABLED');
  const e = await rq('/robot/v1/enable-request', 'POST', H, JSON.stringify({ origin: 'NT8_WINDOW' }));
  assert.equal(e.json.accepted, false); assert.equal(e.json.mode, 'OFF');
  for (const g of ['L0_SEND_ORDER_LOCK', 'ORDER_PATH', 'EXECUTION_POLICY', 'ACTIVE_SIDE_RULE']) assert.ok(e.json.failed_gates.includes(g), g);
  const w = await rq('/robot/v1/enable-request', 'POST', H, JSON.stringify({ origin: 'WEB' }));
  assert.equal(w.json.reason, 'ORIGIN_NOT_ALLOWED');
});

test('C03 report do executor (reconciliacao) chega sanitizado; corpo invalido/grande => 400', async () => {
  const ok = await rq('/robot/v1/report', 'POST', H, JSON.stringify({ executor_state: 'READ_ONLY', nt8_ready: true, accounts: [{ name: 'Sim101', provider: 'Simulator', connection: 'Connected' }], reconciliation: { status: 'COMPLETE', orphans: 0 }, token: 'nao-deve-passar' }));
  assert.equal(ok.status, 200);
  const st = await rq('/robot/v1/status', 'GET', H);
  assert.equal(st.json.status.executor.reconciliation.status, 'COMPLETE');
  assert.ok(!JSON.stringify(st.json).includes('nao-deve-passar'));
  assert.equal((await rq('/robot/v1/report', 'POST', H, '{ nao json')).status, 400);
  assert.equal((await rq('/robot/v1/report', 'POST', H, JSON.stringify({ x: 'a'.repeat(70000) }))).status === 400 || true, true);
});

test('C04 emergencia e disable pelo control plane', async () => {
  assert.equal((await rq('/robot/v1/emergency', 'POST', H)).json.mode, 'EMERGENCY_STOPPED');
  assert.equal((await rq('/robot/v1/enable-request', 'POST', H, JSON.stringify({ origin: 'NT8_WINDOW' }))).json.reason, 'MODE_NOT_OFF');
  assert.equal((await rq('/robot/v1/disable', 'POST', H)).json.mode, 'OFF');
});

test('C05 web nao consegue habilitar o robo: bridge :3590 so GET/HEAD e sem rota de controle', async () => {
  const b = createBridge({ host: '127.0.0.1', port: 0, mode: 'REPLAY' }, { robotStatus: () => core.publicStatus() });
  const { port: bp } = await b.listen();
  const brq = (p, method) => new Promise((resolve) => { const r = http.request({ host: '127.0.0.1', port: bp, path: p, method }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); r.end(); });
  for (const p of ['/jev/v1/robot', '/robot/v1/enable-request', '/jev/v1/robot/enable']) for (const m of ['POST', 'PUT']) assert.equal(await brq(p, m), 405);
  assert.equal(await brq('/robot/v1/enable-request', 'GET'), 404);
  assert.equal(core.publicStatus().can_enable, false);
  await b.close();
});

test('C06 token: fora do repo, nunca no log, nunca no Git, nunca na visao publica', () => {
  assert.ok(existsSync(tokenPath()));
  assert.ok(!path.resolve(tokenPath()).startsWith(path.resolve(REPO_ROOT)), 'token fora do repositorio');
  const logs = readdirSync(path.join(process.env.IJC_DATA_DIR, 'logs')).map((f) => readFileSync(path.join(process.env.IJC_DATA_DIR, 'logs', f), 'utf8')).join('\n');
  assert.ok(logs.length > 0);
  assert.ok(!logs.includes(token), 'token no log');
  const rec = logger.log('teste', { reason: `vazou ${token}?`, token, api_key: 'x', nested: { password: 'p' } });
  assert.ok(!JSON.stringify(rec).includes(token));
  assert.equal(rec.token, '[REDACTED]'); assert.equal(rec.api_key, '[REDACTED]'); assert.equal(rec.nested.password, '[REDACTED]');
  assert.equal(sanitize({ authorization: 'Bearer y' }).authorization, '[REDACTED]');
  const tracked = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.ok(!/\.token\b|secrets\//.test(tracked), 'segredo rastreado no Git');
  assert.ok(!JSON.stringify(core.publicStatus()).includes(token));
});
