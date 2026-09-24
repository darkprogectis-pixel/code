// Testes do JEV Runtime V1 (node:test, sem dependencias). Rodar: node --test test/jev/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../../src/jev/engine.mjs';
import { loadArtifacts, verifyInvariants, JevFatalError } from '../../src/jev/artifacts.mjs';
import { loadConfig, REPO_ROOT, SAFETY } from '../../src/jev/config.mjs';
import { validateOutput } from '../../src/jev/output.mjs';
import { EVALUATORS } from '../../src/jev/rules.mjs';

const FX = path.join(REPO_ROOT, 'fixtures', 'jev');
const CFG = path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json');
const CFG_TRACE = path.join(FX, 'config-fixture-trace-provisional.json');
const fx = (n) => JSON.parse(readFileSync(path.join(FX, n), 'utf8'));
const rt = createRuntime(CFG);
const rtTrace = createRuntime(CFG_TRACE);
const FIXTURES = readdirSync(FX).filter((f) => /^[A-H]_.*\.json$/.test(f));
const clone = (o) => JSON.parse(JSON.stringify(o));
const artDir = path.join(REPO_ROOT, 'context', 'jev-future', 'data');
const hashDir = () => Object.fromEntries(readdirSync(artDir).filter((f) => f.endsWith('.json')).map((f) => [f, createHash('sha256').update(readFileSync(path.join(artDir, f))).digest('hex')]));

test('01 runtime inicia (config + artefatos + motor de regras)', () => {
  assert.equal(rt.cfg.target, 'ES');
  assert.equal(rt.art.feature_contract.fields.length, 190);
  assert.ok(rt.engine.dispositions.length === rt.art.rules.rules.length);
});

test('02 output valido contra o contrato em todas as fixtures (e com trace provisional)', () => {
  for (const f of FIXTURES) for (const r of [rt, rtTrace]) {
    const { output } = r.run(fx(f));
    assert.deepEqual(validateOutput(output, r.art), [], f);
  }
});

test('03 input vazio, ausente, nao-objeto ou malformado nao crasha', () => {
  for (const bad of [undefined, null, {}, [], 42, 'x', { schema: 'jev-input/v1', fields: [], sources: 'x', evaluated_at: 'nope', session: 7 },
    { schema: 'jev-input/v1', fields: { 'abot.root.spot': 'texto', 'abot.classic.strikes[]': 'nao-array', 'nao.existe': 1 }, sources: { FR_ROOT_ORDERFLOW: 5 } }]) {
    const { output } = rt.run(bad);
    assert.equal(output.jev_directional_context, 'UNKNOWN');
    assert.deepEqual(validateOutput(output, rt.art), []);
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jev-'));
  writeFileSync(path.join(tmp, 'broken.json'), '{ nao e json');
  const r1 = rt.runFile(path.join(tmp, 'broken.json'));
  assert.ok(r1.output.reason_codes.includes('RC_INPUT_UNPARSEABLE'));
  const r2 = rt.runFile(path.join(tmp, 'nao-existe.json'));
  assert.ok(r2.output.reason_codes.includes('RC_INPUT_UNREADABLE'));
  assert.equal(r2.output.jev_directional_context, 'UNKNOWN');
});

test('04 familia ausente degrada so a dimensao dependente (R_S10)', () => {
  const { output } = rt.run(fx('B_partial_native.json')); // sem classic/state
  assert.equal(output.data_quality.status, 'DEGRADED');
  assert.equal(output.native_dealer_state.gamma_regime.reading.zero, 'POSITIVE_GAMMA'); // so leitura (a)
  assert.ok(output.native_dealer_state.gamma_regime.notes.some((n) => /DEGRADED/.test(n)));
  assert.equal(output.native_dealer_state.gamma_regime.reading.readings.spot_vs_zero_gamma, 'UNAVAILABLE');
  assert.equal(output.native_dealer_state.vol_skew.availability, 'UNAVAILABLE');
  assert.notEqual(output.native_dealer_state.delta_positioning.availability, 'UNAVAILABLE');
  // sem spot: so leituras dependentes de spot caem; regime por sinal continua
  const noSpot = fx('B_partial_native.json'); delete noSpot.fields['abot.root.spot'];
  const o2 = rt.run(noSpot).output;
  assert.equal(o2.data_quality.price_reference_usable, false);
  assert.notEqual(o2.data_quality.status, 'DATA_INVALID');
  assert.equal(o2.native_dealer_state.structure_location.reading.location.available, false);
  assert.equal(o2.native_dealer_state.gamma_regime.reading.zero, 'POSITIVE_GAMMA');
  // sem familia de regime 0DTE: nao e gate global
  const noRegime = fx('B_partial_native.json'); delete noRegime.fields['abot.root.gex.net_0dte'];
  const o3 = rt.run(noRegime).output;
  assert.notEqual(o3.data_quality.status, 'DATA_INVALID');
  assert.equal(o3.native_dealer_state.gamma_regime.reading.zero, 'UNKNOWN');
});

test('05/06 DATA_INVALID => UNKNOWN + RC_DATA_INVALID, nunca NO_TRADE_CONTEXT', () => {
  for (const f of ['H_data_invalid_global.json', 'A_empty_missing.json']) {
    const { output } = rt.run(fx(f));
    assert.equal(output.data_quality.status, 'DATA_INVALID');
    assert.equal(output.jev_directional_context, 'UNKNOWN');
    assert.ok(output.reason_codes.includes('RC_DATA_INVALID'));
    assert.ok(!JSON.stringify(output.jev_directional_context).includes('NO_TRADE'));
  }
  for (const f of FIXTURES) assert.notEqual(rt.run(fx(f)).output.jev_directional_context, 'NO_TRADE_CONTEXT');
});

test('07 HYPOTHESIS_TO_TEST nunca participa do registro', () => {
  const ht = rt.art.rules.rules.filter((r) => r.status === 'HYPOTHESIS_TO_TEST');
  assert.equal(ht.length, 10);
  for (const r of ht) {
    assert.ok(!EVALUATORS[r.rule_id]);
    assert.equal(rt.engine.dispositions.find((d) => d.rule_id === r.rule_id).disposition, 'EXCLUDED');
  }
  // promover uma hipotese de lado para status ativo e rejeitado no arranque
  const a = clone(rt.art); a.rules.rules.find((r) => r.rule_id === 'HT01_DEX_DIRECTION_BY_REGIME').status = 'SUPPORTED_SEMANTIC';
  assert.throws(() => verifyInvariants(a), JevFatalError);
});

test('08 BLOCKED_BY_UNKNOWN_SEMANTICS nunca participa do registro', () => {
  const b = rt.art.rules.rules.filter((r) => r.status === 'BLOCKED_BY_UNKNOWN_SEMANTICS');
  assert.equal(b.length, 10);
  for (const r of b) { assert.ok(!EVALUATORS[r.rule_id]); assert.equal(rt.engine.dispositions.find((d) => d.rule_id === r.rule_id).disposition, 'EXCLUDED'); }
  const { output } = rtTrace.run(fx('E_trace_vs_volsignals_different.json'));
  for (const c of output.source_contributions.filter((c) => c.spx_effect && /^B0/.test(c.spx_effect.rule))) assert.equal(c.spx_effect.effect, 'UNAVAILABLE');
  assert.equal(output.native_dealer_state.second_order_flows.reading, 'UNRESOLVED');
});

test('09 DIAGNOSTIC_ONLY nunca participa da decisao', () => {
  for (const r of rt.art.rules.rules.filter((r) => r.status === 'DIAGNOSTIC_ONLY')) {
    assert.ok(!EVALUATORS[r.rule_id]);
    assert.match(rt.engine.dispositions.find((d) => d.rule_id === r.rule_id).detail, /EXCLUDED_FROM_DECISION/);
  }
  const { audit } = rt.run(fx('C_valid_multi_source.json'));
  assert.ok(audit.state_machine_trace.every((s) => ['R_S09_DATA_INVALID_TO_UNKNOWN', 'R_S15_ACTIVE_RULES_ONLY', 'R_S16_CONTEXT_STATE_DEFINITIONS'].includes(s.rule)));
});

test('10 TRACE e VolSignals permanecem SPX', () => {
  const { output } = rtTrace.run(fx('E_trace_vs_volsignals_different.json'));
  assert.equal(output.spx_final_context.trace.market_origin, 'SPX');
  assert.equal(output.spx_final_context.volsignals.market_origin, 'SPX');
  for (const c of output.source_contributions.filter((c) => c.spx_effect)) assert.deepEqual(c.market_origin, ['SPX']);
  assert.ok(!JSON.stringify(output).includes('ES_NATIVE'));
});

test('11 TRACE e VolSignals nao sao fundidos', () => {
  const { output } = rtTrace.run(fx('E_trace_vs_volsignals_different.json'));
  const s = output.spx_final_context;
  assert.equal(s.numeric_equivalence_allowed, false);
  assert.ok(s.trace.families.every((f) => /trace\./.test(f)));
  assert.ok(s.volsignals.families.every((f) => /volsignals\./.test(f)));
  const eff = output.source_contributions.filter((c) => c.spx_effect).map((c) => c.spx_effect);
  assert.ok(eff.every((e) => ['TRACE', 'VOLSIGNALS'].includes(e.source)));
  assert.ok(eff.filter((e) => e.source === 'VOLSIGNALS').every((e) => e.effect === 'UNAVAILABLE')); // valores de sinal oposto nao viram comparacao
});

test('12 efeitos SPX diferentes nao viram CONFLICTED_CONTEXT e nao sao reduzidos destrutivamente', () => {
  const { output } = rtTrace.run(fx('E_trace_vs_volsignals_different.json'));
  const eff = Object.fromEntries(output.source_contributions.filter((c) => c.spx_effect).map((c) => [`${c.spx_effect.source}:${c.spx_effect.dimension}`, c.spx_effect.effect]));
  assert.equal(eff['TRACE:GAMMA_REGIME'], 'CONTRADICTS');
  assert.equal(eff['TRACE:TRACE_PARTICIPANTS'], 'ENRICHES');
  assert.equal(output.spx_final_context.effect_on_native, null);
  assert.ok(output.reason_codes.includes('RC_SPX_EFFECT_NOT_DERIVED'));
  assert.equal(output.conflicts[0].kind, 'DESCRIPTIVE_C_VS_B');
  assert.equal(output.jev_directional_context, 'UNKNOWN');
  assert.ok(!output.reason_codes.includes('MIXED'));
  // escalar derivado quando nao ha perda
  const one = fx('E_trace_vs_volsignals_different.json'); delete one.fields['spx_final_context.trace.gamma_cust'];
  assert.equal(rtTrace.run(one).output.spx_final_context.effect_on_native, 'CONTRADICTS');
  // sem limiar de TRACE no contrato => TRACE UNKNOWN => pares UNAVAILABLE
  assert.equal(rt.run(fx('E_trace_vs_volsignals_different.json')).output.spx_final_context.effect_on_native, 'UNAVAILABLE');
});

test('13 MenthorQ ZERO nunca bloqueia nem altera o contexto', () => {
  const base = fx('C_valid_multi_source.json');
  const withMq = clone(base); withMq.fields['abot.root.levels.hvl'] = 6600; withMq.fields['abot.root.levels.call_resistance'] = 6650; withMq.fields['abot.root.levels._asof'] = base.fields['abot.root.timestamp'];
  const a = rt.run(base).output; const b = rt.run(withMq).output;
  for (const o of [a, b]) { assert.equal(o.menthorq.confirmation, 'ZERO'); assert.equal(o.menthorq.policy, 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING'); assert.equal(o.menthorq.effect_on_context, 'NONE'); }
  assert.equal(a.jev_directional_context, b.jev_directional_context);
  assert.equal(a.data_quality.status, b.data_quality.status);
});

test('14 lineage desconhecida nao conta como independencia; override BY_CONSTRUCTION aplicado', () => {
  const { output } = rt.run(fx('C_valid_multi_source.json'));
  for (const f of output.evidence_families) {
    if (f.kind.startsWith('SEPARATE')) assert.match(f.independence, /NOT_PRESUMED/);
    if (f.kind === 'CONSOLIDATED') assert.match(f.independence, /SINGLE_EVIDENCE/);
  }
  const rr = output.evidence_families.filter((f) => f.family_id.startsWith('EF_DC_RISK_REVERSAL__abot.') && !f.family_id.includes('state_gex'));
  assert.equal(rr.length, 2);
  assert.ok(rr.every((f) => f.lineage_override && f.lineage_override.lineage === 'BY_CONSTRUCTION'));
  assert.equal(rr[0].lineage_override.id, rr[1].lineage_override.id);
  // regime: 1 familia consolidada, nunca 2 confirmacoes
  assert.equal(output.native_dealer_state.gamma_regime.reading.readings.net_sign, 'POSITIVE_GAMMA');
  const gex0 = output.evidence_families.filter((f) => f.dc_group === 'DC_GEX0_SIGN' && f.kind === 'CONSOLIDATED');
  assert.equal(gex0.length, 1); // net_0dte, sum_gex_vol@gex_zero etc. = UMA evidencia
  assert.ok(gex0[0].usable_members.length >= 2);
  // membros SUSPECTED do mesmo grupo ficam separados e nao sao independencia
  for (const f of output.evidence_families.filter((f) => f.dc_group === 'DC_GEX0_SIGN' && f.kind !== 'CONSOLIDATED')) assert.match(f.independence, /NOT_PRESUMED/);
});

test('15 is_vote nunca vira votacao', () => {
  assert.ok(rt.art.routes.routes.every((r) => r.is_vote === false));
  for (const f of FIXTURES) assert.ok(rt.run(fx(f)).output.evidence_families.every((e) => e.counted_as_vote === false));
  const a = clone(rt.art); a.routes.routes[0].is_vote = true;
  assert.throws(() => verifyInvariants(a), JevFatalError);
  const txt = JSON.stringify(rt.run(fx('C_valid_multi_source.json')).output.reason_codes);
  assert.ok(!/COUNT|MAJORITY|VOTE/.test(txt));
});

test('16 contrato 190/190 continua carregavel (174 + 16)', () => {
  const a = loadArtifacts(artDir);
  assert.equal(a.routes.routes.length, 190);
  assert.equal(a.routes.routes.filter((r) => r.stage === 'B_JEV_NATIVE_DEALER_ANALYSIS').length, 174);
  assert.equal(a.routes.routes.filter((r) => r.stage === 'C_SPX_FINAL_CONTEXT').length, 16);
  const { audit } = rt.run(fx('C_valid_multi_source.json'));
  assert.equal(audit.inputs.received_count + audit.inputs.missing_count, 190);
});

test('17 nenhuma regra ativa emite lado', () => {
  assert.deepEqual(rt.engine.activeSideRules, []);
  for (const r of rt.art.rules.rules) if (['CANONICAL_STRUCTURAL', 'SUPPORTED_SEMANTIC'].includes(r.status)) assert.equal(r.emits_side, false);
  for (const f of FIXTURES) for (const r of [rt, rtTrace]) assert.ok(!/LONG_CONTEXT|SHORT_CONTEXT|NEUTRAL_CONTEXT|CONFLICTED_CONTEXT/.test(r.run(fx(f)).output.jev_directional_context));
});

test('18 UNKNOWN e output operacional valido (nao falha)', () => {
  const { output, audit } = rt.run(fx('C_valid_multi_source.json'));
  assert.equal(output.data_quality.status !== 'DATA_INVALID', true);
  assert.equal(output.jev_directional_context, 'UNKNOWN');
  assert.ok(output.reason_codes.includes('RC_NO_ACTIVE_DIRECTIONAL_RULE'));
  assert.deepEqual(audit.rules.errors, []);
  assert.equal(output.native_directional_context, output.jev_directional_context);
});

test('19 nenhuma ordem/trade e emitida; travas nao podem ser ligadas', () => {
  for (const v of Object.values(SAFETY)) assert.equal(v, false);
  assert.ok(Object.isFrozen(SAFETY));
  for (const f of FIXTURES) { const { audit } = rt.run(fx(f)); assert.deepEqual(audit.guarantees, { orders_emitted: 0, trades_executed: 0, nt8_modified: false, core_overridden: false, production_touched: false }); }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jev-'));
  const bad = path.join(tmp, 'cfg.json');
  writeFileSync(bad, JSON.stringify({ schema: 'jev-runtime-config/v1', JEV_CAN_SEND_ORDER: true }));
  assert.throws(() => loadConfig(bad), JevFatalError);
  // Core so comparacao
  const o = rt.run(fx('C_valid_multi_source.json')).output;
  assert.equal(o.core_comparison, 'UNKNOWN');
  assert.equal(o.core_comparison_pair.futures_core_side, 'LONG');
});

test('20 nenhuma producao atual e tocada: runtime nao escreve artefatos nem usa rede/processos/NT8', () => {
  const before = hashDir();
  for (const f of FIXTURES) rt.run(fx(f));
  assert.deepEqual(hashDir(), before);
  const srcDir = path.join(REPO_ROOT, 'src', 'jev');
  for (const f of readdirSync(srcDir)) {
    const s = readFileSync(path.join(srcDir, f), 'utf8');
    assert.ok(!/node:(http|https|net|dgram|child_process|worker_threads)|from 'ws'|fetch\(/.test(s), f + ' usa rede/processo');
    assert.ok(!/NinjaTrader|robo-trade|signal-engine|DarkFlow|Consolidator|Copilot|FlowOne|GexBot/i.test(s), f + ' referencia producao');
    if (f !== 'cli.mjs') assert.ok(!/writeFileSync|appendFileSync|rmSync|unlinkSync/.test(s), f + ' escreve em disco');
  }
});

test('extra: fatal apenas estrutural (config/artefato), deterministico por input', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jev-'));
  const cfg = path.join(tmp, 'cfg.json');
  writeFileSync(cfg, JSON.stringify({ schema: 'jev-runtime-config/v1', artifacts_dir: path.join(tmp, 'vazio') }));
  assert.throws(() => createRuntime(cfg), JevFatalError);
  const a = rt.run(fx('C_valid_multi_source.json')).output; const b = rt.run(fx('C_valid_multi_source.json')).output;
  delete a.generated_at; delete b.generated_at;
  assert.deepEqual(a, b);
});

test('extra: fixtures de qualidade — STALE/UNKNOWN, MARKET_CLOSED, R2 pendente', () => {
  const f = rt.run(fx('F_stale_unknown_source.json')).output;
  assert.equal(f.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state, 'STALE');
  assert.equal(f.data_quality.per_source.FR_CLASSIC.freshness_state, 'UNKNOWN');
  assert.equal(f.data_quality.per_source.FR_STATE.freshness_state, 'FRESH');
  assert.equal(f.native_dealer_state.gamma_regime.reading.zero, 'POSITIVE_GAMMA'); // via state (mesma familia)
  const g = rt.run(fx('G_market_closed.json')).output;
  assert.equal(g.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state, 'MARKET_CLOSED');
  assert.notEqual(g.data_quality.status, 'DATA_INVALID');
  assert.equal(g.data_quality.per_source.FR_VOLSIGNALS.freshness_state, 'UNKNOWN');
  const res = rt.runFile(path.join(FX, 'C_valid_multi_source.json'), { previousPath: path.join(FX, 'C_previous_snapshot.json') }).output;
  const ev = res.native_dealer_state.change_transition.reading;
  assert.ok(ev.some((e) => e.type === 'REGIME_TRANSITION'));
  assert.ok(ev.every((e) => e.direction === 0));
  assert.ok(res.reason_codes.includes('RC_LEVEL_MIGRATION_UNAVAILABLE_PENDING_DECISION'));
  // snapshots em lados opostos de 09/09 nao sao comparados (R_S07)
  const old = fx('C_previous_snapshot.json'); old.evaluated_at = '2026-09-01T15:00:00Z';
  const r2 = rt.run(fx('C_valid_multi_source.json'), { previousInput: old }).output;
  assert.equal(r2.native_dealer_state.change_transition.reading, 'UNRESOLVED');
});
