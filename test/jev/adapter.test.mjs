// Testes do LIVE INPUT ADAPTER V1 contra um relay FALSO local (payloads sinteticos no formato descoberto; nenhum dado do vendor).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../../src/jev/engine.mjs';
import { REPO_ROOT } from '../../src/jev/config.mjs';
import { validateOutput } from '../../src/jev/output.mjs';
import { createLiveRelayAdapter, loadLiveConfig, sessionAt } from '../../src/jev/adapters/live-relay-adapter.mjs';
import { buildMappingTable } from '../../src/jev/adapters/relay-mapping.mjs';
import { runLive } from '../../src/jev/adapters/live-loop.mjs';

const NOW = new Date('2026-09-24T15:00:00Z'); // quinta 11:00 ET => RTH
const TS = NOW.getTime() / 1000 - 5;
const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const FC = rt.art.feature_contract;

// ---- payloads sinteticos (numeros arbitrarios; so estrutura) ----
const orderflow = (o = {}) => ({ timestamp: TS, ticker: 'ES_SPX', spot: 6601.5, z_mlgamma: 6597.3, z_msgamma: 6583.6, o_mlgamma: 6590.1, o_msgamma: 6570.2, zero_mcall: 6612.4, zero_mput: 6607.9,
  one_mcall: 6620.1, one_mput: 6580.4, zcvr: 3.3, ocvr: 1.1, zgr: 1200.5, ogr: -80.25, zvanna: 12.5, ovanna: -2.5, zcharm: -4.2, ocharm: 0.7, agg_dex: -10, one_agg_dex: -2,
  agg_call_dex: 5, one_agg_call_dex: 1, agg_put_dex: -15, one_agg_put_dex: -3, net_dex: -300.1, one_net_dex: 90, net_call_dex: 250, one_net_call_dex: 20, net_put_dex: -350,
  one_net_put_dex: -40, dexoflow: 1.1, gexoflow: 2.2, cvroflow: 3.3, one_dexoflow: 0.1, one_gexoflow: 0.2, one_cvroflow: 0.3, _relay: { ticker: 'ES_SPX', cached: false, stale: false, age_ms: 0 }, ...o });
const strikes = [[6590, 40, 5, [1, 2, 3, 4, 5]], [6600, -15, 4, [1, 2, 3, 4, 5]], [6610, 60, 6, [1, 2, 3, 4, 5]]];
const classic = (cat, o = {}) => ({ timestamp: TS - 20, ticker: 'ES_SPX', min_dte: 0, sec_min_dte: 1, spot: 6601.5, zero_gamma: 6590, major_pos_vol: 6610, major_pos_oi: 6620, major_neg_vol: 6590, major_neg_oi: 6580,
  strikes, sum_gex_vol: 85, sum_gex_oi: 15, delta_risk_reversal: 0.1, max_priors: [[6610, 1], [6600, 2]], conversion: null, _relay: { ticker: 'SPX', cat, cached: false, stale: false, age_ms: 0, ttl_ms: 20000, served: NOW.toISOString() }, ...o });
const greek = (cat) => ({ timestamp: TS - 20, ticker: 'ES_SPX', spot: 6601.5, min_dte: 0, sec_min_dte: 1, major_positive: 6610, major_negative: 6590, major_long_gamma: 6605, major_short_gamma: 6585,
  mini_contracts: [[6600, 0.2, 0.25, 7.5, [1, 2, 3], 0, null], [6610, 0.21, 0.24, -2.5, [1, 2, 3], 0, null]], conversion: null,
  _relay: { ticker: 'SPX', cat, grade: 'mini_contracts', n: 2, tem_majors: false, cached: false, stale: false, age_ms: 0, ttl_ms: 20000, served: NOW.toISOString() } });

let server; let port; let routes; const methods = [];
const defaultRoutes = () => {
  const r = { '/gexbot/orderflow/ES_SPX': () => orderflow() };
  for (const c of ['zero', 'one', 'full']) r[`/gexbot/classic/SPX/${c}`] = () => classic(c);
  for (const c of ['gex_zero', 'gex_one', 'gex_full']) r[`/gexbot/state/SPX/${c}`] = () => classic(c);
  for (const g of ['delta', 'gamma', 'vanna', 'charm']) for (const s of ['zero', 'one']) r[`/gexbot/state/SPX/${g}_${s}`] = () => greek(`${g}_${s}`);
  return r;
};
before(async () => {
  server = http.createServer((req, res) => {
    methods.push(req.method);
    const h = routes[req.url];
    if (!h) { res.writeHead(404); return res.end('{}'); }
    const v = h();
    if (v && v.__raw !== undefined) { res.writeHead(v.status || 200, { 'content-type': 'application/json' }); return res.end(v.__raw); }
    if (v && v.__delay) return setTimeout(() => { res.end(JSON.stringify(orderflow())); }, v.__delay);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

const baseCfg = (o = {}) => ({ ...loadLiveConfig(path.join(REPO_ROOT, 'config', 'jev-live-input-v1.json')), relay: { host: '127.0.0.1', port, base_path: '/gexbot' }, timeouts: { request_ms: 300 }, ...o });
const make = (cfg = baseCfg(), now = () => NOW) => createLiveRelayAdapter(cfg, { featureContract: FC, now });
const codes = (input) => input.adapter_issues.map((i) => i.code);

test('A01 relay disponivel: 15 rotas OK, jev-input/v1 valido, output valido e UNKNOWN', async () => {
  routes = defaultRoutes();
  const { input, report } = await make().buildInput();
  assert.equal(input.schema, 'jev-input/v1');
  assert.equal(report.routes.filter((r) => r.result === 'OK').length, 15);
  const { output, audit } = rt.run(input);
  assert.deepEqual(validateOutput(output, rt.art), []);
  assert.equal(output.jev_directional_context, 'UNKNOWN');
  assert.equal(output.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state, 'FRESH');
  assert.ok(audit.inputs.received_count >= 100);
  assert.deepEqual(audit.inputs.unrecognized, []);
});

test('A02 relay offline: continua, UNKNOWN + RC_RELAY_OFFLINE, sem crash', async () => {
  const cfg = baseCfg({ relay: { host: '127.0.0.1', port: 1, base_path: '/gexbot' } });
  const { input } = await make(cfg).buildInput();
  assert.ok(codes(input).includes('RC_RELAY_OFFLINE'));
  const { output } = rt.run(input);
  assert.equal(output.data_quality.status, 'DATA_INVALID');
  assert.equal(output.jev_directional_context, 'UNKNOWN');
  assert.ok(output.reason_codes.includes('RC_RELAY_OFFLINE'));
});

test('A03 timeout: RC_RELAY_TIMEOUT e o resto segue', async () => {
  routes = defaultRoutes(); routes['/gexbot/orderflow/ES_SPX'] = () => ({ __delay: 1500 });
  const { input } = await make().buildInput();
  assert.ok(codes(input).includes('RC_RELAY_TIMEOUT'));
  const { output } = rt.run(input);
  assert.notEqual(output.data_quality.status, 'DATA_INVALID'); // classic/state seguem
  assert.equal(output.jev_directional_context, 'UNKNOWN');
});

test('A04 JSON malformado: RC_RELAY_MALFORMED', async () => {
  routes = defaultRoutes(); routes['/gexbot/classic/SPX/zero'] = () => ({ __raw: '{ nao json' });
  const { input } = await make().buildInput();
  assert.ok(codes(input).includes('RC_RELAY_MALFORMED'));
  assert.equal(input.fields['abot.classic.zero_gamma']['SPX/zero'], undefined);
  assert.equal(input.fields['abot.classic.zero_gamma']['SPX/one'], 6590);
});

test('A05 payload parcial / HTTP erro: so as dimensoes dependentes caem', async () => {
  routes = { '/gexbot/orderflow/ES_SPX': () => orderflow() };
  const { input } = await make().buildInput();
  assert.ok(codes(input).includes('RC_RELAY_HTTP_ERROR'));
  const { output } = rt.run(input);
  assert.equal(output.data_quality.status, 'DEGRADED');
  assert.equal(output.native_dealer_state.gamma_regime.reading.zero, 'POSITIVE_GAMMA');
});

test('A06 timestamp ausente: RC_SOURCE_TIMESTAMP_MISSING e freshness UNKNOWN (arrival nunca prova freshness)', async () => {
  routes = defaultRoutes(); routes['/gexbot/orderflow/ES_SPX'] = () => { const p = orderflow(); delete p.timestamp; return p; };
  const { input } = await make().buildInput();
  assert.ok(codes(input).includes('RC_SOURCE_TIMESTAMP_MISSING'));
  assert.equal(input.sources.FR_ROOT_ORDERFLOW.vendor_timestamp, null);
  assert.equal(rt.run(input).output.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state, 'UNKNOWN');
});

test('A07 timestamp repetido em RTH: candidato FROZEN apos N leituras; fora do RTH nunca', async () => {
  routes = defaultRoutes();
  let t = NOW.getTime();
  const ad = make(baseCfg(), () => new Date((t += 30000)));
  let last;
  for (let i = 0; i < 3; i++) last = await ad.buildInput();
  assert.equal(last.input.sources.FR_ROOT_ORDERFLOW.observed_frozen, true);
  assert.ok(codes(last.input).includes('RC_SOURCE_FROZEN_CANDIDATE'));
  const o = rt.run(last.input).output;
  assert.equal(o.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state, 'FROZEN');
  assert.ok(o.reason_codes.includes('RC_SOURCE_FROZEN_CANDIDATE'));
  // fora do RTH (sabado)
  let s = new Date('2026-09-26T15:00:00Z').getTime();
  const ad2 = make(baseCfg(), () => new Date((s += 30000)));
  for (let i = 0; i < 3; i++) last = await ad2.buildInput();
  assert.notEqual(last.input.sources.FR_ROOT_ORDERFLOW.observed_frozen, true);
  assert.equal(sessionAt(new Date('2026-09-26T15:00:00Z'), baseCfg()), 'OUTSIDE_RTH');
});

test('A08 campos desconhecidos no payload: auditados, nao entram no input', async () => {
  routes = defaultRoutes(); routes['/gexbot/orderflow/ES_SPX'] = () => orderflow({ novo_campo_vendor: 42 });
  const { input, report } = await make().buildInput();
  assert.deepEqual(report.routes.find((r) => r.kind === 'orderflow').unmapped_payload_keys, ['novo_campo_vendor']);
  assert.ok(!JSON.stringify(input.fields).includes('novo_campo_vendor'));
});

test('A09 fonte extra ignorada/auditada; payload da raiz rejeitado', async () => {
  routes = defaultRoutes(); routes['/gexbot/misterio'] = () => ({ timestamp: TS }); routes['/gexbot/classic/SPX/one'] = () => ({ trading_enabled: true, instruments: {} });
  const { input } = await make(baseCfg({ extra_routes: [{ kind: 'misterio', path: '/misterio' }] })).buildInput();
  assert.ok(codes(input).includes('RC_ADAPTER_UNKNOWN_SOURCE_IGNORED'));
  assert.ok(codes(input).includes('RC_RELAY_ROOT_PAYLOAD_REJECTED'));
  assert.equal(input.fields['abot.classic.zero_gamma']['SPX/one'], undefined);
});

test('A10 mapeamento correto para feature_id', async () => {
  routes = defaultRoutes();
  const { input } = await make().buildInput();
  const f = input.fields;
  assert.equal(f['abot.root.gex.net_0dte'], 1200.5); // zgr
  assert.equal(f['abot.root.dex.net_0dte'], -300.1); // net_dex
  assert.equal(f['abot.root.levels.short_gamma_next'], 6570.2); // o_msgamma
  assert.equal(f['abot.root.pc_oi'], 350 / 250); // derivado confirmado
  assert.equal(f['abot.root.gamma_condition'], undefined); // nao recriado
  assert.equal(f['abot.root.classic.zero_gamma'], undefined); // raiz nunca lida: classic vai em abot.classic.*
  assert.deepEqual(f['abot.classic.strikes[]']['SPX/zero'][0], { strike: 6590, gex_vol: 40, gex_oi: 5, priors: [1, 2, 3, 4, 5] });
  assert.deepEqual(f['abot.state_greek.gamma.mini_contracts[]']['SPX/gamma_zero'][0], { greek_value: 7.5, priors: [1, 2, 3] });
  assert.deepEqual(f['abot.state_greek.mini_contracts[]']['SPX/delta_zero'][0], { strike: 6600, call_ivol: 0.2, put_ivol: 0.25, col5: 0, col6: null });
  assert.equal(f['abot.state_gex._relay.grade'], undefined);
  assert.equal(f['abot.classic._relay.cat']['SPX/full'], 'full');
  const table = buildMappingTable(FC);
  assert.equal(table.length, 190);
  assert.equal(new Set(table.map((r) => r.feature_id)).size, 190);
});

test('A11 market_origin preservado', async () => {
  routes = defaultRoutes();
  const table = buildMappingTable(FC);
  const byId = Object.fromEntries(FC.fields.map((f) => [f.feature_id, f.market_origin]));
  for (const r of table) assert.equal(r.market_origin, byId[r.feature_id]);
  const { output } = rt.run((await make().buildInput()).input);
  for (const c of output.source_contributions) assert.ok(c.market_origin.every((m) => m !== 'ES_NATIVE'));
});

test('A12/A13 TRACE e VolSignals nunca viram ES_NATIVE nem sao lidos do relay', async () => {
  const table = buildMappingTable(FC);
  for (const r of table.filter((r) => r.feature_id.startsWith('spx_final_context.'))) {
    assert.equal(r.market_origin, 'SPX');
    assert.equal(r.mapping_status, 'SOURCE_NOT_AVAILABLE');
  }
  routes = defaultRoutes();
  const { output } = rt.run((await make().buildInput()).input);
  assert.equal(output.spx_final_context.trace.market_origin, 'SPX');
  assert.equal(output.spx_final_context.volsignals.market_origin, 'SPX');
});

test('A14 nenhuma hipotese ativada no caminho live', async () => {
  routes = defaultRoutes();
  const { output, audit } = rt.run((await make().buildInput()).input);
  assert.deepEqual(audit.rules.active_side_rules, []);
  for (const d of audit.rules.dispositions) if (/^(HT|B)\d/.test(d.rule_id)) assert.equal(d.disposition, 'EXCLUDED');
  assert.equal(output.jev_directional_context, 'UNKNOWN');
});

test('A15 nenhuma ordem emitida; so GET no relay; laco live continua com relay caindo e para por abort', async () => {
  routes = defaultRoutes(); methods.length = 0;
  const ac = new AbortController(); const seen = [];
  const ad = make();
  let k = 0;
  const n = await runLive({ adapter: ad, runtime: rt, intervalMs: 10, cycles: 3, signal: ac.signal, onCycle: ({ cycle, result }) => {
    seen.push(result.output.jev_directional_context);
    assert.deepEqual(result.audit.guarantees, { orders_emitted: 0, trades_executed: 0, nt8_modified: false, core_overridden: false, production_touched: false });
    if (++k === 1) routes = {}; // relay "cai" depois do 1o ciclo
    if (cycle === 2) ac.abort();
  } });
  assert.equal(n, 2);
  assert.deepEqual(seen, ['UNKNOWN', 'UNKNOWN']);
  assert.ok(methods.length > 0 && methods.every((m) => m === 'GET'));
  const client = readFileSync(path.join(REPO_ROOT, 'src', 'jev', 'adapters', 'relay-client.mjs'), 'utf8');
  assert.ok(/method: 'GET'/.test(client) && !/method: '(POST|PUT|PATCH|DELETE)'/.test(client) && !/\.write\(/.test(client));
});

test('A16 config live invalida e FATAL estrutural; rota sem ticker proibida', () => {
  const bad = { ...baseCfg(), tickers: { orderflow: '', classic_state: 'SPX' } };
  assert.equal(make(bad).routesToRead()[0].ticker, '');
  assert.throws(() => loadLiveConfig(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json')), /live config schema/);
});
