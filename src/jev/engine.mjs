// Pipeline do JEV Runtime V1: ingest -> normalize -> quality -> evidence -> nativo (B) -> contexto -> SPX (C) -> MenthorQ -> core_comparison -> output + audit.
// FAIL-SOFT: dado ausente/invalido degrada localmente. FATAL (JevFatalError) so para config/artefato/invariante.
// Nunca emite ordem, nunca inventa lado.
import { loadConfig, SAFETY, RUNTIME_VERSION, INPUT_SCHEMA, OUTPUT_SCHEMA } from './config.mjs';
import { loadArtifacts, JevFatalError } from './artifacts.mjs';
import { ingest, readInputFile } from './ingest.mjs';
import { normalize } from './normalize.mjs';
import { assessQuality, DEALER_DIMENSIONS } from './quality.mjs';
import { makeReader } from './native.mjs';
import { spxEffects, scalarEffect } from './spx.mjs';
import { buildRuleEngine, EVALUATORS, STAGE_B_ORDER, STAGE_C_ORDER } from './rules.mjs';
import { coreComparison } from './output.mjs';

const iso = (sec) => (sec === null || sec === undefined ? null : new Date(sec * 1000).toISOString());

export function createRuntime(configPath) {
  const cfg = loadConfig(configPath);
  const art = loadArtifacts(cfg.artifacts_dir_abs);
  const engine = buildRuleEngine(art);
  const known = (art.state_machine.known_lineage_overrides || []).map((o, i) => ({ ...o, id: `KLO_${i + 1}` }));
  const runtime = {
    cfg, art, engine, safety: SAFETY,
    run: (input, opts = {}) => run(runtime, input, opts),
    runFile: (p, opts = {}) => { const r = readInputFile(p); let prev = null; if (opts.previousPath) prev = readInputFile(opts.previousPath); return run(runtime, r.input, { ...opts, issues: r.issues, previousInput: prev ? prev.input : undefined, previousIssues: prev ? prev.issues : [] }); },
    known_lineage_overrides: known,
  };
  return runtime;
}

// estagios B/qualidade para um snapshot (usado tambem para o snapshot anterior das transicoes)
function evaluateSnapshot(rt, input, issues, previous) {
  const { cfg, art } = rt;
  const ing = ingest(input, issues);
  const norm = normalize(ing, art, cfg);
  const q = assessQuality(ing, norm, art, cfg);
  const rd = makeReader(norm, q, cfg.primary_ticker);
  const ctx = { rd, results: {}, previous, evaluated_at: ing.evaluated_at, errors: [] };
  for (const id of STAGE_B_ORDER) {
    try { ctx.results[id.slice(0, 5)] = EVALUATORS[id](ctx); } catch (e) { ctx.results[id.slice(0, 5)] = { error: true }; ctx.errors.push({ rule_id: id, error: String(e && e.message) }); }
  }
  return { ing, norm, q, rd, ctx };
}

function run(rt, input, opts) {
  const { cfg, art, engine } = rt;
  const t0 = Date.now();
  let previous = null;
  if (opts.previousInput !== undefined) {
    const p = evaluateSnapshot(rt, opts.previousInput, opts.previousIssues || [], null);
    previous = { evaluated_at: p.ing.evaluated_at, results: p.ctx.results, rd: p.rd, data_quality_status: p.q.status };
  }
  const { ing, norm, q, rd, ctx } = evaluateSnapshot(rt, input, opts.issues || [], previous);
  const R = ctx.results;
  const reasons = [];

  // ---- evidence families (R_S03): nenhuma familia e voto; separadas nao sao independencia ----
  const klo = rt.known_lineage_overrides;
  const kloOf = (fam) => klo.find((o) => o.members.some((m) => fam.members.some((x) => x === m || m.startsWith(x + '@'))));
  const evidence = art.evidence_families.families.filter((f) => q._families[f.family_id].present).map((f) => {
    const s = q._families[f.family_id]; const o = kloOf(f);
    return {
      family_id: f.family_id, dc_group: f.dc_group, kind: f.kind, lineage_basis: f.lineage_basis, dimension: f.dimension, stage: f.stage,
      reading: s.usable ? 'USABLE' : 'PRESENT_NOT_USABLE', usable_members: s.usable_members, overlap_risk: f.overlap_risk,
      independence: f.kind === 'CONSOLIDATED' ? 'SINGLE_EVIDENCE (lineage ' + f.lineage_basis + ')' : f.kind === 'NON_EVIDENCE' ? 'NON_EVIDENCE' : 'NOT_PRESUMED (lineage ' + f.lineage_basis + '; unknown lineage != independence)',
      lineage_override: o ? { id: o.id, lineage: o.lineage, rule: o.rule, materialized_in_evidence_families: o.materialized_in_evidence_families } : null,
      counted_as_vote: false,
    };
  });

  // ---- contexto direcional: maquina de estados carregada do artefato (R_S09, R_S15, R_S16) ----
  let context = null; let ctxReason = null; const stepsTrace = [];
  for (const step of art.state_machine.context_decision.ordered_steps) {
    if (step.status && /^INACTIVE/.test(step.status)) { stepsTrace.push({ rule: step.rule, then: step.then, result: 'SKIPPED_INACTIVE' }); continue; }
    if (step.rule === 'R_S09_DATA_INVALID_TO_UNKNOWN') {
      const hit = q.status === 'DATA_INVALID'; stepsTrace.push({ rule: step.rule, then: step.then, result: hit ? 'MATCH' : 'NO_MATCH' });
      if (hit) { context = 'UNKNOWN'; ctxReason = step.reason; break; } continue;
    }
    if (step.rule === 'R_S15_ACTIVE_RULES_ONLY') {
      const hit = engine.activeSideRules.length === 0; stepsTrace.push({ rule: step.rule, then: step.then, result: hit ? 'MATCH' : 'NO_MATCH' });
      if (hit) { context = 'UNKNOWN'; ctxReason = step.reason; break; } continue;
    }
    // passos de lado so sao alcancaveis com regra de lado ativa, que o loader ja proibe no V1
    throw new JevFatalError('invariante: passo direcional alcancado sem avaliador de lado V1: ' + step.then);
  }
  if (!context) throw new JevFatalError('invariante: maquina de estados sem desfecho');
  reasons.push(ctxReason);

  // ---- estagio C (depois do nativo; R_S17) ----
  for (const id of STAGE_C_ORDER) {
    try { R[id.slice(0, 5)] = EVALUATORS[id](ctx); } catch (e) { R[id.slice(0, 5)] = { effect: 'UNAVAILABLE', why: 'erro interno do avaliador' }; ctx.errors.push({ rule_id: id, error: String(e && e.message) }); }
  }
  const effects = spxEffects(ctx);
  const scalar = scalarEffect(effects);
  for (const e of effects) reasons.push(e.reason_code);
  if (!scalar.derived) reasons.push(scalar.reason);
  const conflicts = effects.filter((e) => e.effect === 'CONTRADICTS').map((e) => ({
    between: ['EF_DC_SPX_FINAL_GAMMA__spx_final_context.trace.gamma_mm', 'EF_DC_GEX0_SIGN'], kind: 'DESCRIPTIVE_C_VS_B',
    description: `${e.source} contradiz a leitura nativa na dimensao ${e.dimension}; divergencia descritiva, NAO conflito direcional (nao gera CONFLICTED_CONTEXT)`,
  }));
  if (R.R_M01.label === 'AMBIGUOUS') reasons.push('RC_REGIME_AMBIGUOUS');

  // ---- nativo: transicoes ----
  const transitions = [];
  for (const k of ['R_M05', 'R_M06', 'R_M07']) { const r = R[k]; if (r && r.events) for (const ev of r.events) { transitions.push(ev); reasons.push(ev.reason); } }
  const transUnresolved = ['R_M05', 'R_M06', 'R_M07'].map((k) => R[k] && R[k].unresolved).filter(Boolean);
  if (R.R_M06 && R.R_M06.unresolved && R.R_M06.unresolved.reason) reasons.push(R.R_M06.unresolved.reason);

  // ---- data quality ----
  if (q.status === 'DEGRADED') reasons.push('RC_DQ_DEGRADED');
  for (const i of ing.issues) reasons.push(i.code);
  if (ctx.errors.length) reasons.push('RC_RULE_EVALUATION_ERROR');

  // ---- MenthorQ overlay (R_S19): so POSITIVE|ZERO; alinhamento indefinido => ZERO; nunca bloqueia ----
  const mqAvail = art.evidence_families.families.some((f) => f.dc_group === 'DC_MENTHORQ_LEVELS' && q._families[f.family_id].usable);
  const menthorq = { confirmation: 'ZERO', policy: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING', levels_available: mqAvail,
    why: 'SP_MENTHORQ_ALIGNMENT_DEF UNMET (HT09 BLOCKED_PENDING) => ZERO' + (mqAvail ? '' : '; niveis ausentes/null (D07)'), effect_on_context: 'NONE' };
  reasons.push('RC_MENTHORQ_ZERO');

  // ---- native_dealer_state ----
  const dimOut = (key, reading, notes = []) => {
    const d = q.dimensions[key];
    return { reading: d.availability === 'UNAVAILABLE' ? 'UNAVAILABLE' : reading, availability: d.availability, families: d.usable_families, notes };
  };
  const native = {
    gamma_regime: dimOut('gamma_regime', { zero: R.R_M01.label, readings: R.R_M01.readings, sources: R.R_M01.sources, by_expiry: { zero: R.R_M01.label, next: R.R_M02.next, full: R.R_M02.full }, direction: 0 }, R.R_M01.degraded ? ['so uma leitura utilizavel (DEGRADED)'] : []),
    structure_location: dimOut('structure_location', { location: R.R_M03, strike_structure: R.R_M04, direction: 0 }, ['HT02/HT03/HT04 fora do registro']),
    delta_positioning: dimOut('delta_positioning', { put_call_dex_ratio: R.R_M08.put_call_dex_ratio, dex_direction: 'UNRESOLVED', direction: 0 }, ['HT01: convencao de sinal DEX UNMET']),
    second_order_flows: dimOut('second_order_flows', 'UNRESOLVED', ['B01/B02: convencao de sinal UNKNOWN']),
    vol_skew: dimOut('vol_skew', 'UNRESOLVED', ['B06: semantica/unidade UNKNOWN']),
    flow_unknown_semantics: dimOut('flow_unknown_semantics', 'UNRESOLVED', ['B03: semantica nao documentada']),
    change_transition: { reading: transitions.length ? transitions : (transUnresolved.length ? 'UNRESOLVED' : 'NONE'), unresolved: transUnresolved },
  };

  // ---- unresolved_fields (R_S14): presentes com regra BLOCKED ou pre-condicao semantica UNMET ----
  const cov = Object.fromEntries(art.rules.field_coverage.map((c) => [c.feature_id, c]));
  const unresolved = [];
  for (const fid of norm.present) {
    const c = cov[fid]; if (!c) continue;
    const why = new Set();
    for (const id of c.rule_ids) {
      const r = engine.byId[id];
      if (r.status === 'BLOCKED_BY_UNKNOWN_SEMANTICS' || (r.status === 'HYPOTHESIS_TO_TEST' && r.emits_side)) for (const s of r.semantic_preconditions) if (art.rules.semantic_preconditions[s].state !== 'MET') why.add(s);
    }
    if (why.size) unresolved.push({ feature_id: fid, why: [...why].sort() });
  }
  for (const fid of norm.present) { const nx = norm.byId[fid]; if (nx.freshness_rule === 'FR_FROZEN_BLOCK') unresolved.push({ feature_id: fid, why: ['FROZEN_VALUES'] }); }

  // ---- source_contributions ----
  const bySrc = {};
  for (const fid of norm.present) {
    const nx = norm.byId[fid]; const k = nx.source_component;
    bySrc[k] = bySrc[k] || { source_component: k, market_origin: new Set(), freshness_rule: nx.freshness_rule, fields_present: 0, families: new Set() };
    bySrc[k].fields_present++; bySrc[k].market_origin.add(nx.market_origin);
  }
  for (const f of evidence) for (const m of f.usable_members) { const nx = norm.byId[m.split('@')[0]]; if (nx && bySrc[nx.source_component]) bySrc[nx.source_component].families.add(f.family_id); }
  const contributions = Object.values(bySrc).map((s) => ({ source_component: s.source_component, market_origin: [...s.market_origin], freshness_state: q.per_source[s.freshness_rule] ? q.per_source[s.freshness_rule].freshness_state : 'UNKNOWN', fields_present: s.fields_present, families: [...s.families], role_in_this_reading: 'CONTEXT_EVIDENCE (nao voto)' }));
  for (const e of effects) contributions.push({ source_component: e.source === 'TRACE' ? 'SpotGamma TRACE' : 'VolSignals', market_origin: ['SPX'], role_in_this_reading: `SPX_EFFECT:${e.dimension}:${e.effect}`, spx_effect: { source: e.source, dimension: e.dimension, effect: e.effect, rule: e.rule, why: e.why } });

  const traceFr = q.per_source.FR_TRACE; const vsFr = q.per_source.FR_VOLSIGNALS;
  const famIn = (re) => evidence.filter((f) => re.test(f.family_id)).map((f) => f.family_id);
  const spx = {
    trace: { market_origin: 'SPX', reading: { gamma_regime_compare: R.R_M09, participants: R.R_M10 }, families: famIn(/spx_final_context\.trace\./), freshness_state: traceFr ? traceFr.freshness_state : 'UNKNOWN' },
    volsignals: { market_origin: 'SPX', reading: 'UNRESOLVED (B08/B09 BLOCKED; unidades e convencao UNKNOWN)', families: famIn(/spx_final_context\.volsignals\./), freshness_state: vsFr ? vsFr.freshness_state : 'UNKNOWN' },
    numeric_equivalence_allowed: false,
    effect_on_native: scalar.derived ? scalar.value : null,
  };

  const coreSide = ing.core ? ing.core.side : null;
  const dq = { role: q.role, status: q.status, session: q.session, per_source: q.per_source, dimensions: q.dimensions, price_reference_usable: q.price_reference_usable, degradation: q.degradation, input_issues: ing.issues };
  const output = {
    schema: OUTPUT_SCHEMA, runtime_version: RUNTIME_VERSION, evaluated_at: iso(ing.evaluated_at), generated_at: new Date().toISOString(),
    jev_market_state: { target: cfg.target, evaluated_at: iso(ing.evaluated_at), gamma_regime: q.dimensions.gamma_regime.availability === 'UNAVAILABLE' ? 'UNAVAILABLE' : R.R_M01.label,
      structure_location: R.R_M03.available ? { nearest_above: R.R_M03.nearest_above, nearest_below: R.R_M03.nearest_below } : 'UNAVAILABLE',
      delta_positioning: R.R_M08.available ? 'PUT_CALL_DEX_RATIO_ONLY (direcao UNRESOLVED)' : 'UNAVAILABLE',
      second_order_flows: 'UNRESOLVED', vol_skew: 'UNRESOLVED', flow_unknown_semantics: 'UNRESOLVED' },
    jev_directional_context: context,
    native_dealer_state: native,
    native_directional_context: context,
    spx_final_context: spx,
    evidence_families: evidence,
    conflicts,
    data_quality: dq,
    reason_codes: [...new Set(reasons.filter(Boolean))],
    source_contributions: contributions,
    unresolved_fields: unresolved,
    menthorq,
    conviction: 'UNCALIBRATED',
    core_comparison: coreComparison(coreSide, context),
    core_comparison_pair: { futures_core_side: coreSide, jev_directional_context: context, note: 'so comparacao; CORE_vs_JEV fusion/conflict UNDEFINED; sem efeito operacional' },
    versions: { runtime: RUNTIME_VERSION, input_schema: INPUT_SCHEMA, output_schema: OUTPUT_SCHEMA, decision_logic: 'v1', feature_contract: 'v1', dc_groups: 'v1', evidence_families: 'v1',
      preregistration: 'v1 — ' + String(art.rules._meta.review_status || '').split(' (')[0], artifact_sha256: art.sha256 },
  };

  const audit = {
    runtime_version: RUNTIME_VERSION, config_path: cfg.config_path, safety: SAFETY,
    duration_ms: Date.now() - t0,
    inputs: { schema_ok: ing.schema_ok, received: norm.present, received_count: norm.present.length, missing_count: norm.missing.length, missing: norm.missing, null_at_source: norm.nulls, unrecognized: norm.unrecognized, non_primary_tickers: norm.non_primary_tickers, issues: ing.issues, previous_snapshot: previous ? 'PROVIDED' : 'NONE' },
    families: { present: evidence.length, usable: evidence.filter((f) => f.reading === 'USABLE').map((f) => f.family_id), known_lineage_overrides: rt.known_lineage_overrides },
    rules: { dispositions: engine.dispositions, evaluated: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v && v.error ? 'ERROR' : 'OK'])), errors: ctx.errors, active_side_rules: engine.activeSideRules },
    state_machine_trace: stepsTrace,
    reason_codes: output.reason_codes, conflicts: conflicts.length, unresolved_fields: unresolved.length,
    thresholds: Object.fromEntries(Object.entries(q.per_source).map(([k, v]) => [k, { stale_after_sec: v.stale_after_sec, origin: v.threshold_origin }])),
    versions: output.versions,
    guarantees: { orders_emitted: 0, trades_executed: 0, nt8_modified: false, core_overridden: false, production_touched: false },
  };
  return { output, audit };
}

export { DEALER_DIMENSIONS };
