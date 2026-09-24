// Montagem e validacao do output jev-output/v1 (chaves do output contract V1 + envelope schema/versao/tempo).
import { OUTPUT_SCHEMA, RUNTIME_VERSION } from './config.mjs';

export const CONTRACT_KEYS = ['jev_market_state', 'jev_directional_context', 'native_dealer_state', 'native_directional_context', 'spx_final_context',
  'evidence_families', 'conflicts', 'data_quality', 'reason_codes', 'source_contributions', 'unresolved_fields', 'menthorq',
  'conviction', 'core_comparison', 'core_comparison_pair', 'versions'];
export const ENVELOPE_KEYS = ['schema', 'runtime_version', 'evaluated_at', 'generated_at'];

export function coreComparison(coreSide, ctxState) {
  if (!coreSide || coreSide === 'NONE') return 'NOT_AVAILABLE';
  if (ctxState === 'LONG_CONTEXT' || ctxState === 'SHORT_CONTEXT') return (ctxState === 'LONG_CONTEXT') === (coreSide === 'LONG') ? 'ALIGNED' : 'CONTRARY';
  if (ctxState === 'CONFLICTED_CONTEXT') return 'MIXED';
  return 'UNKNOWN';
}

// Validacao estrutural do output contra o contrato (usada por testes e smoke). Retorna lista de erros.
export function validateOutput(out, art) {
  const e = [];
  const en = art.output_contract.enums;
  const keys = Object.keys(out);
  for (const k of [...ENVELOPE_KEYS, ...CONTRACT_KEYS]) if (!(k in out)) e.push('chave ausente: ' + k);
  for (const k of keys) if (![...ENVELOPE_KEYS, ...CONTRACT_KEYS].includes(k)) e.push('chave fora do contrato: ' + k);
  if (out.schema !== OUTPUT_SCHEMA) e.push('schema');
  if (out.runtime_version !== RUNTIME_VERSION) e.push('runtime_version');
  if (!en.jev_directional_context.includes(out.jev_directional_context)) e.push('jev_directional_context fora do enum');
  if (!en.jev_directional_context.includes(out.native_directional_context)) e.push('native_directional_context fora do enum');
  if (out.jev_directional_context !== out.native_directional_context) e.push('R_S17: jev != native');
  if (!en.data_quality_status.includes(out.data_quality.status)) e.push('data_quality.status fora do enum');
  if (out.data_quality.status === 'DATA_INVALID' && out.jev_directional_context !== 'UNKNOWN') e.push('R_S09 violado');
  if (out.jev_directional_context === 'NO_TRADE_CONTEXT') e.push('NO_TRADE_CONTEXT sem criterio (UNDEFINED)');
  if (!en.conviction.includes(out.conviction)) e.push('conviction');
  if (!en.core_comparison.includes(out.core_comparison)) e.push('core_comparison fora do enum');
  if (!en.menthorq_confirmation.includes(out.menthorq.confirmation)) e.push('menthorq fora do enum');
  const s = out.spx_final_context;
  if (!s || s.numeric_equivalence_allowed !== false) e.push('numeric_equivalence_allowed');
  if (s && (s.trace.market_origin !== 'SPX' || s.volsignals.market_origin !== 'SPX')) e.push('origem C != SPX');
  if (s && s.effect_on_native !== null && !en.spx_effect_on_native.includes(s.effect_on_native)) e.push('effect_on_native fora do enum');
  for (const c of out.source_contributions) if (c.spx_effect && !en.spx_effect_on_native.includes(c.spx_effect.effect)) e.push('efeito granular fora do enum');
  if (!Array.isArray(out.reason_codes) || !out.reason_codes.length) e.push('reason_codes vazio');
  for (const f of out.evidence_families) if (f.counted_as_vote !== false) e.push('familia contada como voto ' + f.family_id);
  const txt = JSON.stringify(out);
  if (/"(order|orders|trade_order|send_order|execute|position_size|final_direction|conviction_band)"\s*:/.test(txt)) e.push('campo de ordem/execucao no output');
  return e;
}
