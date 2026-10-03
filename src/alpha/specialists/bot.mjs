// AGENT_BOT — α Bot = GexBot/GammaGex via read-only relay 127.0.0.1:3457 /gexbot/*. Skill: .claude/skills/skill-alpha-bot.
// NON_DIRECTIONAL: no field has a documented directional role; GEX never becomes BUY/SELL. Units of the vendor exposures are UNKNOWN.
// Publishes regime (gamma_condition = zgr >= 0, the only documented threshold) and gamma levels as context.
import { makeEnvelope } from '../contracts.mjs';
import { num, ev, lvl, compactLevels } from './common.mjs';

export const source = 'bot';
export const role = 'NON_DIRECTIONAL';
export const depends_on = [];
export const independence_group = 'G_BOT';
export const endpoints = (cfg) => cfg.endpoints.bot;
export const required = ['orderflow'];

export function evaluate({ payloads, refs, now, cycle_id, cfg, metrics }) {
  const o = payloads.orderflow, c = payloads.classic;
  const warnings = [], missing = [];
  const sourceTs = num(o?.timestamp) != null ? o.timestamp * 1000 : null;
  if (o?._relay?.stale) warnings.push('relay _relay.stale=true');
  const fresh = sourceTs != null && now - sourceTs <= cfg.stale_ms.bot && !o?._relay?.stale;
  if (!c) { missing.push('classic'); warnings.push('PARTIAL: classic indisponível'); }
  const zgr = num(o?.zgr);
  const regime = zgr == null ? null : zgr >= 0 ? 'POSITIVE' : 'NEGATIVE';
  const V = 'VENDOR_SEMANTICS', U = 'UNKNOWN (unidade do vendor não documentada)';
  const evidence = [
    ev('gamma_condition', regime, { meaning: 'regime de gamma 0DTE (zgr ≥ 0 ⇒ POSITIVE amortece; NEGATIVE amplifica) — sem lado', role: 'REGIME', validation: V }),
    ev('zgr', zgr, { unit: U, meaning: 'net GEX 0DTE do vendor', role: 'REGIME', validation: V }),
    ev('ogr', num(o?.ogr), { unit: U, meaning: 'net GEX próximo vencimento', role: 'REGIME', validation: V }),
    ev('zcharm', num(o?.zcharm), { unit: U, meaning: 'charm 0DTE do vendor (sem semântica direcional documentada)', role: 'CONTEXT', validation: 'UNTESTED' }),
    ev('ocharm', num(o?.ocharm), { unit: U, meaning: 'charm próximo vencimento', role: 'CONTEXT', validation: 'UNTESTED' }),
    ev('zvanna', num(o?.zvanna), { unit: U, meaning: 'vanna 0DTE do vendor', role: 'CONTEXT', validation: 'UNTESTED' }),
    ev('net_dex', num(o?.net_dex), { unit: U, meaning: 'net DEX 0DTE do vendor', role: 'CONTEXT', validation: 'UNTESTED' }),
    ev('agg_dex', num(o?.agg_dex), { unit: U, meaning: 'DEX agregado 0DTE', role: 'CONTEXT', validation: 'UNTESTED' }),
    ev('dexoflow', num(o?.dexoflow), { unit: U, meaning: 'variação curta — semântica UNKNOWN', role: 'UNKNOWN_FIELD', validation: 'UNTESTED' }),
  ].filter((x) => x.value != null);
  for (const k of ['zgr', 'spot', 'timestamp']) if (num(o?.[k]) == null) missing.push(`orderflow.${k}`);
  const origin = 'ES_SPX (opções SPX em escala ES; vendor GexBot)';
  const levels = compactLevels({
    'Zero Gamma (GexBot)': lvl(num(c?.zero_gamma), 'pontos ES', origin),
    'Major Positive Vol': lvl(num(c?.major_pos_vol), 'pontos ES', origin),
    'Major Positive OI': lvl(num(c?.major_pos_oi), 'pontos ES', origin),
    'Major Negative Vol': lvl(num(c?.major_neg_vol), 'pontos ES', origin),
    'Major Negative OI': lvl(num(c?.major_neg_oi), 'pontos ES', origin),
    'Zero Major Call': lvl(num(o?.zero_mcall), 'pontos ES', origin),
    'Zero Major Put': lvl(num(o?.zero_mput), 'pontos ES', origin),
    'Spot (GexBot)': lvl(num(o?.spot), 'pontos ES', origin),
  });
  return makeEnvelope({
    source, cycle_id, now, source_ts: sourceTs, fresh, health: fresh ? (c ? 'OK' : 'PARTIAL') : 'STALE', role,
    direction: 'UNKNOWN', strength: 0, confidence: 0,
    formula: { expr: 'NON_DIRECTIONAL ⇒ direction UNKNOWN, confidence 0', inputs: { validation_cap: cfg.validation_cap[role] } },
    evidence, contradictions: [], missing_fields: missing, warnings, levels, depends_on, independence_group,
    rules_version: cfg.rules_version, raw_refs: refs, metrics, snapshot_id: refs[0]?.snapshot_id,
  });
}
