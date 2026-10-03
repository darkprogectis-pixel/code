// AGENT_Q — α Q = MenthorQ (:3480). Reads ONLY its own API. Skill: .claude/skills/skill-alpha-q.
// Canonical policy MENTHORQ_CONFIRMATION_ONLY_NON_BLOCKING: SIDE_ORIGIN = FALSE ⇒ NON_DIRECTIONAL (never BUY/SELL, never veto).
// Publishes MenthorQ levels (LOCATION) as context. matrix.timestamp has no TZ (UNSPECIFIED) ⇒ freshness uses exposure.asof (Z).
import { makeEnvelope } from '../contracts.mjs';
import { num, tsOf, ev, lvl, compactLevels } from './common.mjs';

export const source = 'q';
export const role = 'NON_DIRECTIONAL';
export const depends_on = [];
export const independence_group = 'G_Q';
export const endpoints = (cfg) => cfg.endpoints.q;
export const required = ['exposure'];
const EXPO = { call_resistance: 'Call Resistance', call_resistance_0dte: 'Call Resistance 0DTE', put_support: 'Put Support', put_support_0dte: 'Put Support 0DTE', hvl: 'HVL', hvl_0dte: 'HVL 0DTE', gamma_wall_0dte: 'Gamma Wall 0DTE', day_max: 'Day Max', day_min: 'Day Min' };

export function evaluate({ payloads, refs, now, cycle_id, cfg, metrics }) {
  const x = payloads.exposure, L = payloads.levels, S = payloads.spot;
  const warnings = [], missing = [];
  const sourceTs = tsOf(x?.asof);
  const fresh = sourceTs != null && now - sourceTs <= cfg.stale_ms.q;
  const origin = `MenthorQ ES1! (asof ${x?.asof || '?'})`;
  const levels = {};
  for (const [k, name] of Object.entries(EXPO)) { const v = lvl(num(x?.levels?.[k]), 'pontos ES', origin); if (v) levels[name] = v; else missing.push(`exposure.levels.${k}`); }
  for (const g of Array.isArray(L?.gamma_levels) ? L.gamma_levels : []) {
    if (num(g?.value) != null && g?.name && !levels[`${g.name} (EOD)`]) levels[`${g.name} (EOD)`] = lvl(g.value, 'pontos ES', `MenthorQ EOD ${L.date || '?'}`);
  }
  if (!L) warnings.push('PARTIAL: /levels indisponível');
  const ns = (x?.strikes || []).map((s) => num(s?.net_gex)).filter((v) => v != null);
  const evidence = [
    ev('spot', num(S?.price), { unit: 'pontos ES', meaning: 'preço do vendor MenthorQ', role: 'CONTEXT', validation: 'VENDOR_SEMANTICS' }),
    ev('window.net_gex_sum', ns.length ? Math.round(ns.reduce((a, b) => a + b, 0)) : null, { unit: 'vendor (sem documentação de unidade)', meaning: 'soma de net_gex dos strikes da janela publicada — contexto de regime, sem lado', role: 'REGIME', validation: 'UNTESTED' }),
    ev('policy', 'MENTHORQ_CONFIRMATION_ONLY_NON_BLOCKING', { meaning: 'MenthorQ nunca origina lado, nunca veta; só confirmação positiva', role: 'POLICY', validation: 'OPERATOR_DECISION_20260923' }),
  ].filter((e) => e.value != null);
  return makeEnvelope({
    source, cycle_id, now, source_ts: sourceTs, fresh, health: fresh ? (L ? 'OK' : 'PARTIAL') : 'STALE', role,
    direction: 'UNKNOWN', strength: 0, confidence: 0,
    formula: { expr: 'SIDE_ORIGIN = FALSE ⇒ direction UNKNOWN, confidence 0', inputs: { validation_cap: cfg.validation_cap[role] } },
    evidence, contradictions: [], missing_fields: missing, warnings, levels: compactLevels(levels), depends_on, independence_group,
    rules_version: cfg.rules_version, raw_refs: refs, metrics, snapshot_id: refs[0]?.snapshot_id,
  });
}
