// LIVE_DQ_HISTORY_ONLY_POLICY (24/09/2026): familia cujos membros sao TODOS availability=HISTORY_LOCAL
// e HISTORICAL_ONLY / NON_LIVE para a DQ em runtime LIVE: nao conta como familia ativa nao utilizavel (R_S10).
// Replay/historico: semantica NAO decidida nesta etapa (comportamento anterior preservado sem runMode LIVE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../../src/jev/engine.mjs';
import { assessQuality } from '../../src/jev/quality.mjs';
import { REPO_ROOT } from '../../src/jev/config.mjs';

const FX = path.join(REPO_ROOT, 'fixtures', 'jev');
const fx = (n) => JSON.parse(readFileSync(path.join(FX, n), 'utf8'));
const DATA = path.join(REPO_ROOT, 'context', 'jev-future', 'data');
const data = (n) => JSON.parse(readFileSync(path.join(DATA, n), 'utf8'));
const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const HIST_FAMS = ['EF_DC_ZERO_GAMMA_FULL__abot.cache.zg', 'EF_DC_CLASSIC_GEX_PROFILE_FULL__abot.cache.so', 'EF_DC_CLASSIC_GEX_PROFILE_FULL__abot.cache.sv'];

// cenario minimo: DC_G lido por regra SUPPORTED_SEMANTIC nativa; uma familia live e uma so-historica no mesmo grupo;
// spot e outra familia live numa fonte separada (FR_B) para que FR_A stale nao vire DATA_INVALID
function scenario({ liveFresh = true, cachePresent = false } = {}) {
  const art = {
    feature_contract: {
      freshness_rules: { FR_A: { freshness_basis: 'VENDOR_TIMESTAMP', stale_after_sec: { value: 60 } }, FR_B: { freshness_basis: 'VENDOR_TIMESTAMP', stale_after_sec: { value: 60 } }, FR_CACHE_HISTORY: { freshness_basis: 'VENDOR_TIMESTAMP (historico)' } },
      fields: [
        { feature_id: 'x.live', freshness_rule: 'FR_A', availability: 'LIVE' },
        { feature_id: 'x.spot', freshness_rule: 'FR_B', availability: 'LIVE' },
        { feature_id: 'x.other', freshness_rule: 'FR_B', availability: 'LIVE' },
        { feature_id: 'x.cache', freshness_rule: 'FR_CACHE_HISTORY', availability: 'HISTORY_LOCAL' },
      ],
    },
    evidence_families: { families: [
      { family_id: 'F_LIVE', dc_group: 'DC_G', kind: 'SEPARATE_UNVERIFIED', dimension: 'GAMMA_REGIME', members: ['x.live'] },
      { family_id: 'F_HIST', dc_group: 'DC_G', kind: 'SEPARATE_UNVERIFIED', dimension: 'GAMMA_REGIME', members: ['x.cache'] },
      { family_id: 'F_OTHER', dc_group: 'DC_O', kind: 'SEPARATE_UNVERIFIED', dimension: 'DELTA_POSITIONING', members: ['x.other'] },
      { family_id: 'F_SPOT', dc_group: 'DC_SPOT_PRICE', kind: 'NON_EVIDENCE', dimension: 'PRICE_REFERENCE', members: ['x.spot'] },
    ] },
    rules: { rules: [{ status: 'SUPPORTED_SEMANTIC', stage: 'NATIVE_DEALER_STATE', input_families: ['DC_G'] }] },
  };
  const f = (fr, present = true) => ({ instances: { p: { present } }, primary_instance: 'p', quality_state: 'OK', freshness_rule: fr });
  const norm = { byId: { 'x.live': f('FR_A'), 'x.spot': f('FR_B'), 'x.other': f('FR_B'), 'x.cache': f('FR_CACHE_HISTORY', cachePresent) } };
  const ing = { sources: { FR_A: { vendor_timestamp: liveFresh ? 1000 : 900, observed_frozen: false }, FR_B: { vendor_timestamp: 1000, observed_frozen: false } }, evaluated_at: 1010, session: 'RTH' };
  const cfg = { primary_ticker: 'SPX', provisional_stale_after_sec_overrides: {} };
  return { ing, norm, art, cfg };
}
const aq = (s, opts) => assessQuality(s.ing, s.norm, s.art, s.cfg, opts);

test('H1 LIVE: familia HISTORY_LOCAL-only nao utilizavel NAO degrada a DQ', () => {
  const q = aq(scenario(), { runMode: 'LIVE' });
  assert.deepEqual(q.degradation, []);
  assert.equal(q.status, 'VALID');
  assert.deepEqual(q.dimensions.gamma_regime.history_only_families, ['F_HIST']);
  assert.deepEqual(q.dimensions.gamma_regime.active_reading_families_unusable, []);
});

test('H1 LIVE (fixture real): zg/so/sv nao aparecem em nenhuma degradacao e sao expostos como history_only', () => {
  const { output } = rt.run(fx('C_valid_multi_source.json'), { runMode: 'LIVE' });
  const dq = output.data_quality;
  for (const d of dq.degradation) for (const f of d.families || []) assert.ok(!HIST_FAMS.includes(f), `${f} degradou a DQ LIVE`);
  assert.deepEqual(dq.dimensions.gamma_regime.history_only_families, ['EF_DC_ZERO_GAMMA_FULL__abot.cache.zg']);
  assert.deepEqual([...dq.dimensions.structure_location.history_only_families].sort(), HIST_FAMS.slice(1).sort());
});

test('H2 LIVE: familia live ativa nao utilizavel continua DEGRADED', () => {
  const q = aq(scenario({ liveFresh: false }), { runMode: 'LIVE' });
  assert.equal(q.status, 'DEGRADED');
  assert.ok(q.degradation.some((d) => d.code === 'RC_DQ_FAMILY_UNUSABLE' && d.families.includes('F_LIVE')));
  assert.ok(q.degradation.every((d) => !(d.families || []).includes('F_HIST')));
  assert.ok(q.degradation.some((d) => d.code === 'RC_DQ_SOURCE_STALE'));
});

test('H3 familia history-only nunca passa a contar como utilizavel (mesmo presente)', () => {
  for (const cachePresent of [false, true]) {
    const q = aq(scenario({ cachePresent }), { runMode: 'LIVE' });
    assert.equal(q._families.F_HIST.usable, false);
    assert.ok(!q.dimensions.gamma_regime.usable_families.includes('F_HIST'));
    assert.equal(q.per_source.FR_CACHE_HISTORY.freshness_state, 'UNKNOWN');
  }
  const { output } = rt.run(fx('C_valid_multi_source.json'), { runMode: 'LIVE' });
  for (const d of Object.values(output.data_quality.dimensions)) for (const f of HIST_FAMS) assert.ok(!d.usable_families.includes(f));
});

test('H4 zg/so/sv continuam no contrato, no lineage, nas familias e nas rotas (SOURCE_NOT_AVAILABLE ao vivo)', () => {
  const fc = data('jev-feature-contract-v1.json');
  const routes = data('jev-analysis-routes-v1.json').routes;
  const fams = data('jev-evidence-families-v1.json').families;
  const map = data('jev-live-relay-mapping-v1.json');
  const mapRows = map.rows || map.mappings || map.fields || Object.values(map).find(Array.isArray);
  for (const id of ['abot.cache.zg', 'abot.cache.so', 'abot.cache.sv']) {
    const f = fc.fields.find((x) => x.feature_id === id);
    assert.ok(f, id);
    assert.equal(f.availability, 'HISTORY_LOCAL');
    assert.equal(f.freshness_rule, 'FR_CACHE_HISTORY');
    assert.ok(f.lineage_group || f.lineage || JSON.stringify(f).includes('LG_CLASSIC_SPX'), `${id} sem lineage`);
    assert.ok(routes.some((r) => r.feature_id === id), `${id} sem rota`);
    assert.ok(fams.some((x) => x.members.includes(id)), `${id} sem familia`);
    assert.equal(mapRows.find((r) => r.feature_id === id).mapping_status, 'SOURCE_NOT_AVAILABLE');
  }
});

test('H5 Feature Contract 190/190 roteado', () => {
  assert.equal(data('jev-feature-contract-v1.json').fields.length, 190);
  assert.equal(data('jev-analysis-routes-v1.json').routes.length, 190);
  assert.equal(new Set(data('jev-analysis-routes-v1.json').routes.map((r) => r.feature_id)).size, 190);
});

test('H6 decisao/regras/votos identicos entre LIVE e default; so a DQ muda', () => {
  for (const name of ['C_valid_multi_source.json', 'B_partial_native.json', 'G_market_closed.json']) {
    const a = rt.run(fx(name)).output;
    const b = rt.run(fx(name), { runMode: 'LIVE' }).output;
    for (const k of ['jev_directional_context', 'native_directional_context', 'native_dealer_state', 'jev_market_state', 'spx_final_context', 'evidence_families', 'conflicts', 'conviction', 'menthorq', 'core_comparison'])
      assert.deepEqual(b[k], a[k], `${name}: ${k} mudou`);
    assert.deepEqual(b.reason_codes.filter((c) => c !== 'RC_DQ_DEGRADED'), a.reason_codes.filter((c) => c !== 'RC_DQ_DEGRADED'));
  }
  assert.equal(rt.engine.activeSideRules.length, 0);
});

test('H7 sem runMode LIVE (replay/--input): comportamento anterior preservado (semantica historica NAO decidida)', () => {
  const q = aq(scenario());
  assert.equal(q.status, 'DEGRADED');
  assert.ok(q.degradation.some((d) => d.families && d.families.includes('F_HIST')));
  const { output } = rt.run(fx('C_valid_multi_source.json'));
  assert.ok(output.data_quality.degradation.some((d) => (d.families || []).includes('EF_DC_ZERO_GAMMA_FULL__abot.cache.zg')));
});
