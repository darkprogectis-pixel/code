// AGENT_DATA — α Data = QuantData (:3490). Reads ONLY its own API. Skill: .claude/skills/skill-alpha-data.
// Role SOURCE_CLASSIFICATION: maps the classification published by quantdata-signal.js (score = 0.70·primary + 0.30·mag7,
// neutral band 0.15). Its confidence already embeds MenthorQ/GL/RTY confluence ⇒ depends_on q (no double counting in Fusion).
import { makeEnvelope } from '../contracts.mjs';
import { LABEL_DIR, effectOf, num, tsOf, ev, lvl, compactLevels } from './common.mjs';

export const source = 'data';
export const role = 'SOURCE_CLASSIFICATION';
export const depends_on = ['q', 'gl_3470'];
export const independence_group = 'G_QUANT_DATA';
export const endpoints = (cfg) => cfg.endpoints.data;
export const required = ['signal'];

export function evaluate({ payloads, refs, now, cycle_id, cfg, metrics }) {
  const s = payloads.signal, x = payloads.exposure;
  const warnings = [], contradictions = [], missing = [];
  const sourceTs = tsOf(s?.asof);
  const fresh = sourceTs != null && now - sourceTs <= cfg.stale_ms.data;
  const direction = LABEL_DIR[s?.direction] || 'UNKNOWN';
  if (s && !LABEL_DIR[s.direction]) warnings.push(`unknown direction label ${JSON.stringify(s.direction)}`);
  const score = num(s?.score), conf = num(s?.confidence);
  const P = s?.components?.primary || {};
  const subs = ['S1', 'S2', 'S3', 'S4'];
  const present = subs.filter((k) => num(P[k]) != null);
  for (const k of subs) if (num(P[k]) == null) missing.push(`components.primary.${k}`);
  const cov = present.length / subs.length;
  const mag = num(s?.components?.mag7?.score), prim = num(P.score);
  if (prim != null && mag != null && Math.abs(prim) >= 0.15 && Math.abs(mag) >= 0.15 && Math.sign(prim) !== Math.sign(mag))
    contradictions.push({ kind: 'INTERNAL', detail: `primary ${prim} vs mag7 ${mag}`, material: false });
  const cap = cfg.validation_cap[role];
  const V = 'VENDOR_SEMANTICS';
  const evidence = [
    ev('direction', s?.direction ?? null, { meaning: 'classificação publicada pelo motor QuantData (banda neutra 0.15)', effect: effectOf(direction), role, validation: V }),
    ev('score', score, { unit: '[-1,1]', meaning: '0.70·primário + 0.30·mag7', effect: effectOf(direction), role, validation: V }),
    ev('confidence', conf, { unit: '0-100', meaning: 'confiança publicada (inclui confluência MenthorQ/GL/RTY)', role, validation: V }),
    ...present.map((k) => ev(`primary.${k}`, P[k], { unit: '[-1,1]', meaning: { S1: 'agressão trade-side', S2: 'fluxo de prêmio net-flow', S3: 'tilt de volume', S4: 'gamma/walls exposure-strike' }[k], effect: P[k] > 0 ? 'BULLISH' : P[k] < 0 ? 'BEARISH' : 'NEUTRAL', role: 'SUBSIGNAL', validation: V })),
    ev('mag7.score', mag, { unit: '[-1,1]', meaning: 'Mag7 ponderado', role: 'SUBSIGNAL', validation: V }),
    ev('components.menthorq.cond', s?.components?.menthorq?.cond ?? null, { meaning: 'confluência MenthorQ usada pelo QD (dependência de α Q)', role: 'DEPENDENCY', validation: V }),
  ].filter((e) => e.value != null);
  const origin = `QuantData ${x?.index_component || 'SPX'} em escala ES (beta, ~1:1; at ${x?.at || '?'})`;
  const levels = compactLevels({
    'Zero Gamma (QuantData)': lvl(num(x?.zero_gamma), 'pontos ES', origin),
    'Call Wall (QuantData)': lvl(num(x?.call_wall ?? s?.gamma?.call_wall), 'pontos ES', origin),
    'Put Wall (QuantData)': lvl(num(x?.put_wall ?? s?.gamma?.put_wall), 'pontos ES', origin),
  });
  return makeEnvelope({
    source, cycle_id, now, source_ts: sourceTs, fresh, health: fresh ? (cov === 1 ? 'OK' : 'PARTIAL') : 'STALE', role,
    direction, strength: score == null ? 0 : Math.abs(score), confidence: (conf == null ? 0 : conf / 100) * cov * cap,
    formula: { expr: 'confidence = source_conf × coverage(S1..S4 present) × validation_cap', inputs: { source_conf: conf == null ? 0 : conf / 100, coverage: cov, validation_cap: cap }, strength: '|score|' },
    evidence, contradictions, missing_fields: missing, warnings, levels, depends_on, independence_group,
    rules_version: cfg.rules_version, raw_refs: refs, metrics, snapshot_id: refs[0]?.snapshot_id,
  });
}
