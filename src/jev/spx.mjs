// Estagio C (SPX final context): TRACE e VolSignals, market_origin SPX, depois do nativo, sem fusao (R_S06, R_S17, R_S18).
import { num } from './normalize.mjs';

// valor de gamma_mm no spot: numero ou {at_spot: numero}. Anti-lookahead e responsabilidade do produtor do input (bin i so em t[i+1]).
function gammaAtSpot(v) { if (num(v) !== undefined) return v; if (v && num(v.at_spot) !== undefined) return v.at_spot; return undefined; }

export function R_M09(ctx) {
  const v = gammaAtSpot(ctx.rd.get('spx_final_context.trace.gamma_mm'));
  if (v === undefined) return { effect: 'UNAVAILABLE', why: 'gamma_mm TRACE ausente ou sem freshness utilizavel' };
  const trace = v > 0 ? 'POSITIVE_GAMMA' : v < 0 ? 'NEGATIVE_GAMMA' : null;
  const native = ctx.results.R_M01.label;
  const base = { trace_regime_reading: trace || 'ZERO', degraded: 'PENDING_REVISION_AUDIT', compare: 'so SINAL (PARTIAL_ANALOG nunca compara magnitude)' };
  if (!trace) return { ...base, effect: 'NO_EFFECT', why: 'gamma_mm = 0 exato' };
  if (native !== 'POSITIVE_GAMMA' && native !== 'NEGATIVE_GAMMA') return { ...base, effect: 'NO_EFFECT', why: `regime nativo ${native}: sem leitura B comparavel` };
  return { ...base, effect: trace === native ? 'CONFIRMS' : 'CONTRADICTS', native_regime: native };
}

export function R_M10(ctx) {
  const parts = ['gamma_cust', 'gamma_procust', 'gamma_firm', 'gamma_bd'].filter((p) => ctx.rd.usable(`spx_final_context.trace.${p}`));
  return parts.length ? { effect: 'ENRICHES', participants: parts } : { effect: 'UNAVAILABLE', why: 'nenhum participante TRACE utilizavel' };
}

// pares (fonte, dimensao) do R_S18. Pares cobertos so por regra BLOCKED ficam UNAVAILABLE no registro.
export function spxEffects(ctx) {
  const m09 = ctx.results.R_M09; const m10 = ctx.results.R_M10;
  return [
    { source: 'TRACE', dimension: 'GAMMA_REGIME', effect: m09.effect, rule: 'R_M09_TRACE_REGIME_COMPARE', why: m09.why || null },
    { source: 'TRACE', dimension: 'TRACE_PARTICIPANTS', effect: m10.effect, rule: 'R_M10_TRACE_PARTICIPANTS_ENRICH', why: m10.why || null },
    { source: 'TRACE', dimension: 'TRACE_PRESSURES', effect: 'UNAVAILABLE', rule: 'B07_TRACE_DELTA_CHARM_PRESSURE', why: 'BLOCKED_BY_UNKNOWN_SEMANTICS (fora do registro)' },
    { source: 'VOLSIGNALS', dimension: 'GAMMA_REGIME', effect: 'UNAVAILABLE', rule: 'B09_VOLSIGNALS_GAMMA_REGIME', why: 'BLOCKED_BY_UNKNOWN_SEMANTICS; freshness_basis UNKNOWN' },
    { source: 'VOLSIGNALS', dimension: 'VOLSIGNALS_EXPOSURES', effect: 'UNAVAILABLE', rule: 'B08_VOLSIGNALS_EXPOSURES', why: 'BLOCKED_BY_UNKNOWN_SEMANTICS; unidades UNKNOWN; freshness_basis UNKNOWN' },
  ].map((e) => ({ ...e, market_origin: 'SPX', reason_code: `RC_SPX_${e.source}_${e.dimension}_${e.effect}` }));
}

// escalar so quando derivavel sem perda (R_S18); caso contrario null + RC_SPX_EFFECT_NOT_DERIVED
export function scalarEffect(effects) {
  const usable = effects.filter((e) => e.effect !== 'UNAVAILABLE');
  if (!usable.length) return { value: 'UNAVAILABLE', derived: true };
  const set = new Set(usable.map((e) => e.effect));
  return set.size === 1 ? { value: [...set][0], derived: true } : { value: null, derived: false, reason: 'RC_SPX_EFFECT_NOT_DERIVED' };
}
