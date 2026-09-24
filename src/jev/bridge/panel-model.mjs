// Modelo do painel (Analyzer / Control Center) derivado do jev-output/v1. Puro: nao recalcula nada, so apresenta.
// Nunca exibe probabilidade LONG/SHORT (conviction = UNCALIBRATED). O robo e sempre OFF e travado no V1.
import { SAFETY, RUNTIME_VERSION } from '../config.mjs';

export const PANEL_SCHEMA = 'jev-panel/v1';

const LABELS = {
  RC_NO_ACTIVE_DIRECTIONAL_RULE: 'Nenhuma regra direcional ativa — UNKNOWN é estado seguro, não falha',
  RC_DATA_INVALID: 'Nenhuma dimensão dealer utilizável (DATA_INVALID) — UNKNOWN',
  RC_DQ_DEGRADED: 'Qualidade de dados degradada (dimensões parciais)',
  RC_MENTHORQ_ZERO: 'MenthorQ = ZERO (alinhamento indefinido; nunca bloqueia)',
  RC_SPX_EFFECT_NOT_DERIVED: 'Efeitos SPX distintos preservados por fonte/dimensão (sem escalar)',
  RC_REGIME_AMBIGUOUS: 'Regime 0DTE ambíguo (leituras da mesma família divergem)',
  RC_REGIME_TRANSITION: 'Transição de regime observada (descritor, sem lado)',
  RC_LEVEL_MIGRATION: 'Migração de nível na grade (descritor, sem lado)',
  RC_LEVEL_ORDER_CHANGED: 'Ordem dos níveis mudou (descritor)',
  RC_LEVEL_MIGRATION_UNAVAILABLE_PENDING_DECISION: 'Migração de nível interpolado indisponível (R2 pendente)',
  RC_SIGN_CHANGE_OBSERVED: 'Troca de sinal observada (interpretação UNRESOLVED)',
  RC_RELAY_OFFLINE: 'Relay offline', RC_RELAY_TIMEOUT: 'Relay timeout', RC_RELAY_MALFORMED: 'Relay: JSON malformado',
  RC_RELAY_HTTP_ERROR: 'Relay: erro HTTP', RC_SOURCE_TIMESTAMP_MISSING: 'Fonte sem vendor timestamp',
  RC_SOURCE_FROZEN_CANDIDATE: 'Fonte possivelmente congelada (vendor ts repetido no RTH)',
  RC_RELAY_ROOT_PAYLOAD_REJECTED: 'Payload da raiz rejeitado (o Jev nunca lê a raiz)',
};
const label = (code) => LABELS[code] || (/^RC_SPX_/.test(code) ? 'Efeito SPX por fonte/dimensão' : code);

export function robotStatus() {
  return {
    state: 'OFF', can_enable: false,
    locked_reason: 'JEV_CAN_SEND_ORDER=false — o Robot Executor exige fase própria, pré-registro e ordem explícita do operador',
    safety: { ...SAFETY },
  };
}

export function buildPanel(result, meta = {}) {
  const base = {
    schema: PANEL_SCHEMA, runtime_version: RUNTIME_VERSION, generated_at: new Date().toISOString(),
    bridge: { mode: meta.mode || 'UNKNOWN', started_at: meta.started_at || null, cycles: meta.cycles || 0, last_cycle_at: meta.last_cycle_at || null,
      last_cycle_error: meta.last_cycle_error || null, relay: meta.relay || null },
    robot: robotStatus(),
    conviction: 'UNCALIBRATED', probability_display: 'NOT_SHOWN (sem probabilidade calibrada)',
  };
  if (!result) return { ...base, status: 'STARTING', jev: { directional_context: 'UNKNOWN', context_reason: null, context_explanation: 'Aguardando o primeiro ciclo do motor' } };
  const o = result.output;
  const ctxReason = o.reason_codes.find((c) => c === 'RC_DATA_INVALID' || c === 'RC_NO_ACTIVE_DIRECTIONAL_RULE') || null;
  const loc = o.native_dealer_state.structure_location.reading;
  const levelView = (name) => { if (!name || !loc || !loc.location || !loc.location.levels) return null; const l = loc.location.levels.find((x) => x.level === name); return l ? { level: l.level, distance_pts: l.distance_pts, flag: l.semantic_flag } : null; };
  const g = o.native_dealer_state.gamma_regime.reading;
  const effects = o.source_contributions.filter((c) => c.spx_effect).map((c) => ({ source: c.spx_effect.source, dimension: c.spx_effect.dimension, effect: c.spx_effect.effect }));
  return {
    ...base,
    status: o.data_quality.status === 'DATA_INVALID' ? 'RUNNING_NO_USABLE_DATA' : 'RUNNING',
    jev: { directional_context: o.jev_directional_context, native_directional_context: o.native_directional_context, context_reason: ctxReason,
      context_explanation: label(ctxReason), evaluated_at: o.evaluated_at, session: o.data_quality.session },
    market_state: o.jev_market_state,
    data_quality: { status: o.data_quality.status,
      per_source: Object.fromEntries(Object.entries(o.data_quality.per_source).map(([k, v]) => [k, v.freshness_state])),
      dimensions: Object.fromEntries(Object.entries(o.data_quality.dimensions).map(([k, v]) => [k, v.availability])),
      degradation_codes: [...new Set(o.data_quality.degradation.map((d) => d.code))] },
    dealer_context: {
      gamma_regime: typeof g === 'object' ? { zero: g.zero, next: g.by_expiry && g.by_expiry.next ? g.by_expiry.next.label : null, full: g.by_expiry && g.by_expiry.full ? g.by_expiry.full.label : null, readings: g.readings } : g,
      nearest_above: levelView(loc && loc.location && loc.location.nearest_above), nearest_below: levelView(loc && loc.location && loc.location.nearest_below),
      put_call_dex_ratio: typeof o.native_dealer_state.delta_positioning.reading === 'object' ? o.native_dealer_state.delta_positioning.reading.put_call_dex_ratio : null,
      dex_direction: 'UNRESOLVED', second_order_flows: 'UNRESOLVED', vol_skew: 'UNRESOLVED', flow_unknown_semantics: 'UNRESOLVED',
      change_transition: o.native_dealer_state.change_transition.reading,
      note: 'Descritores: regime e níveis nunca viram lado (R_S12/R_S13)',
    },
    spx_context: { market_origin: 'SPX', effect_on_native: o.spx_final_context.effect_on_native, effects,
      trace_freshness: o.spx_final_context.trace.freshness_state, volsignals_freshness: o.spx_final_context.volsignals.freshness_state },
    reason_codes: o.reason_codes.map((c) => ({ code: c, label: label(c) })),
    unresolved: { count: o.unresolved_fields.length, sample: o.unresolved_fields.slice(0, 12).map((u) => u.feature_id) },
    menthorq: { confirmation: o.menthorq.confirmation, policy: o.menthorq.policy },
    core_comparison: o.core_comparison,
    guarantees: result.audit.guarantees,
  };
}
