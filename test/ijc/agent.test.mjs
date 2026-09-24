// AGENT GATEWAY — opcional, ADVISORY, fail-soft, sem acesso a robo/token/contas/ordens.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.IJC_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'ijc-agent-'));
const { REPO_ROOT } = await import('../../src/jev/config.mjs');
const { createRuntime } = await import('../../src/jev/engine.mjs');
const { buildPanel } = await import('../../src/jev/bridge/panel-model.mjs');
const { createProvider, PROVIDER_REGISTRY, MESSAGING_ADAPTERS } = await import('../../src/ijc/agent-gateway/providers.mjs');
const { createAgentGateway, advisoryContext } = await import('../../src/ijc/agent-gateway/gateway.mjs');
const { createAgentServer } = await import('../../src/ijc/agent-gateway/server.mjs');

const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const res = rt.run(JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures', 'jev', 'C_valid_multi_source.json'), 'utf8'))); res.snapshot_id = 'S#1';
const panel = buildPanel(res, { mode: 'REPLAY' });
const bridgeOk = async () => ({ ok: true, json: panel });
const bridgeDown = async () => ({ ok: false, error: 'OFFLINE' });
const mock = (impl) => ({ id: 'mock', status: () => ({ status: 'READY', detail: 'mock' }), advise: impl });
const servers = []; after(async () => { for (const s of servers) await s.close(); });

test('G01 sem provider: NOT_CONFIGURED e estado valido; produto segue', async () => {
  const p = createProvider({ id: 'none' });
  assert.equal(p.status().status, 'NOT_CONFIGURED');
  const g = createAgentGateway({ bridgeUrl: 'http://127.0.0.1:3590', provider: p, fetchJson: bridgeOk });
  await g.tick();
  const h = g.health();
  assert.equal(h.status, 'NO_PROVIDER'); assert.equal(h.ok, true); assert.equal(h.robot_access, 'NONE'); assert.equal(h.order_access, 'NONE'); assert.equal(h.canonical_state, false);
  assert.deepEqual(g.notes().notes, []);
});

test('G02 bridge offline e provider com erro de cota: fail-soft, sem excecao', async () => {
  const g = createAgentGateway({ bridgeUrl: 'http://127.0.0.1:3590', provider: mock(async () => { throw Object.assign(new Error('403'), { code: 'QUOTA_OR_RATE_LIMIT' }); }), fetchJson: bridgeDown });
  await g.tick(); assert.equal(g.health().status, 'DEGRADED_NO_BRIDGE');
  const g2 = createAgentGateway({ bridgeUrl: 'http://127.0.0.1:3590', provider: mock(async () => { throw Object.assign(new Error('403'), { code: 'QUOTA_OR_RATE_LIMIT' }); }), fetchJson: bridgeOk, minProviderGapMs: 0 });
  await g2.tick();
  assert.equal(g2.health().provider.last_error, 'QUOTA_OR_RATE_LIMIT');
  assert.equal(g2.health().status, 'PROVIDER_UNAVAILABLE');
});

test('G03 nota e ADVISORY, nunca canonica, ligada ao snapshot_id; so chama o provider em snapshot novo', async () => {
  let calls = 0; let seenCtx = null;
  const g = createAgentGateway({ bridgeUrl: 'http://127.0.0.1:3590', provider: mock(async (ctx) => { calls++; seenCtx = ctx; return { text: 'Estado UNKNOWN por falta de regra ativa.', model: 'm' }; }), fetchJson: bridgeOk, minProviderGapMs: 0 });
  await g.tick(); await g.tick();
  assert.equal(calls, 1);
  const n = g.notes();
  assert.equal(n.kind, 'ADVISORY'); assert.equal(n.canonical, false);
  assert.equal(n.notes[0].snapshot_id, 'S#1'); assert.match(n.notes[0].label, /ADVISORY/);
  // contexto enviado ao provider: whitelist sem contas/gates/executor
  const ctxJson = JSON.stringify(seenCtx);
  assert.ok(!/accounts|gates|executor|token|selected_account/.test(ctxJson));
  assert.deepEqual(Object.keys(advisoryContext(panel)).sort(), ['context_explanation', 'data_quality', 'dealer', 'directional_context', 'evaluated_at', 'product', 'reason_codes', 'robot', 'session', 'snapshot_id', 'spx_effects', 'unresolved_count']);
});

test('G04 agente NAO tem o token do robo nem acesso ao control plane/contas/ordens (codigo e config)', () => {
  const dir = path.join(REPO_ROOT, 'src', 'ijc', 'agent-gateway');
  for (const f of readdirSync(dir)) {
    // codigo sem comentarios; o literal /3591|token/ do cli e a propria trava que RECUSA config apontando ao control plane
    const s = readFileSync(path.join(dir, f), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '').replace(/\/3591\|token\/i/g, '');
    assert.ok(!/control-plane|auth\.mjs|token\.mjs|x-ijc-token|loadOrCreateToken|tokenPath|robot-core|3591/i.test(s), f + ' referencia o control plane');
    assert.ok(!/engine\.mjs|createRuntime/.test(s), f + ' carrega o motor (segundo cerebro)');
  }
  const cfg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'config', 'ijc-agent-gateway-v1.json'), 'utf8'));
  assert.equal(new URL(cfg.bridge_url).port, '3590');
  assert.equal(cfg.provider.id, 'none');
  assert.throws(() => createAgentGateway({ bridgeUrl: 'http://10.0.0.5:3590', provider: createProvider({}) }));
});

test('G05 servidor :3592 so GET/HEAD, loopback, CORS so para o Control Center', async () => {
  assert.throws(() => createAgentServer({ host: '0.0.0.0', port: 0, gateway: {} }));
  const g = createAgentGateway({ bridgeUrl: 'http://127.0.0.1:3590', provider: createProvider({}), fetchJson: bridgeOk });
  const s = createAgentServer({ host: '127.0.0.1', port: 0, gateway: g }); const { port } = await s.listen(); servers.push(s);
  const rq = (p, method = 'GET', origin) => new Promise((resolve) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: origin ? { origin } : {} }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, b })); }); r.end(); });
  assert.equal((await rq('/agent/v1/health')).status, 200);
  for (const m of ['POST', 'PUT', 'DELETE']) assert.equal((await rq('/agent/v1/notes', m)).status, 405);
  assert.equal((await rq('/agent/v1/health', 'GET', 'http://127.0.0.1:3590')).headers['access-control-allow-origin'], 'http://127.0.0.1:3590');
  assert.equal((await rq('/agent/v1/health', 'GET', 'http://evil.example')).headers['access-control-allow-origin'], undefined);
});

test('G06 providers plugaveis: Claude via SDK opcional (NOT_INSTALLED sem pacote), Kimi sem chave = NOT_CONFIGURED, Hermes futuro, OpenClaw so mensagem', async () => {
  const c = createProvider({ id: 'claude' });
  let installed = true; try { await import('@anthropic-ai/sdk'); } catch { installed = false; }
  if (!installed) {
    await assert.rejects(() => c.advise({}), (e) => e.code === 'NOT_INSTALLED');
    assert.equal(c.status().status, 'NOT_INSTALLED');
  }
  const saved = process.env.KIMI_API_KEY; delete process.env.KIMI_API_KEY;
  assert.equal(createProvider({ id: 'kimi' }).status().status, 'NOT_CONFIGURED');
  if (saved !== undefined) process.env.KIMI_API_KEY = saved;
  assert.equal(PROVIDER_REGISTRY.hermes.kind, 'FUTURE_PROVIDER_OPTION');
  assert.equal(createProvider({ id: 'hermes' }).status().status, 'NOT_CONFIGURED');
  assert.equal(MESSAGING_ADAPTERS.openclaw.status, 'REGISTERED_NOT_WIRED');
  assert.equal(MESSAGING_ADAPTERS.openclaw.order_access, 'NONE');
});
