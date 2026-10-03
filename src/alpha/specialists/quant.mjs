// AGENT_QUANT — α Quant = Alfa Omega Consolidator (:3495). Reads ONLY its own API. Skill: .claude/skills/skill-alpha-quant.
// Role SOURCE_CLASSIFICATION: maps the classification the Consolidator itself publishes; adds no market meaning.
import { makeEnvelope } from '../contracts.mjs';
import { LABEL_DIR, effectOf, num, tsOf, ev, coverage } from './common.mjs';

export const source = 'quant';
export const role = 'SOURCE_CLASSIFICATION';
export const depends_on = ['data', 'q', 'ao_bridge_5151', 'relay_3457'];
export const independence_group = 'G_QUANT_DATA';
export const endpoints = (cfg) => cfg.endpoints.quant;
export const required = ['consolidated'];

export function evaluate({ payloads, refs, now, cycle_id, cfg, metrics }) {
  const c = payloads.consolidated, s = payloads.signal?.symbols?.ES ?? null, sig = payloads.signal ?? null;
  const warnings = [], contradictions = [];
  const sourceTs = tsOf(c?.asof);
  const age = sourceTs == null ? Infinity : now - sourceTs;
  const feedLive = sig ? sig.freshness === 'LIVE' : null;
  if (!sig) warnings.push('PARTIAL: /api/alfabot-signal unavailable; freshness from /consolidated asof only');
  if (sig && !feedLive) warnings.push(`SOURCE_FRESHNESS=${sig.freshness} (Consolidator says inputs not live)`);
  const fresh = age <= cfg.stale_ms.quant && feedLive !== false;
  const direction = LABEL_DIR[c?.direction] || 'UNKNOWN';
  if (!LABEL_DIR[c?.direction]) warnings.push(`unknown direction label ${JSON.stringify(c?.direction)}`);
  const conf = num(c?.confidence);
  const cov = coverage(c, ['direction', 'confidence', 'asof', 'state']);
  const sourceConf = conf == null ? 0 : conf / 100;
  const cap = cfg.validation_cap[role];
  const qd = c?.inputs?.quantdata;
  if (qd?.direction && LABEL_DIR[qd.direction] && LABEL_DIR[qd.direction] !== 'NEUTRAL' && direction !== 'NEUTRAL' && LABEL_DIR[qd.direction] !== direction)
    contradictions.push({ kind: 'INTERNAL', detail: `Consolidator ${direction} vs its own quantdata input ${qd.direction}`, material: false });
  const v = 'VENDOR_SEMANTICS';
  const evidence = [
    ev('direction', c?.direction ?? null, { meaning: 'classificação publicada pelo Consolidator (gate1 radar AO + gate2 MenthorQ; QD/MQ refinam confiança)', effect: effectOf(direction), role, validation: v }),
    ev('confidence', conf, { unit: '0-100', meaning: 'confiança publicada pela fonte', role, validation: v }),
    ev('state', c?.state ?? null, { meaning: 'estado do Consolidator (ex.: STAND_DOWN)', role: 'DATA_QUALITY', validation: v }),
    ev('tier', c?.tier ?? null, { meaning: 'tier por confiança', role, validation: v }),
    ev('reason', c?.reason ?? null, { meaning: 'motivo textual da fonte', role: 'DATA_QUALITY', validation: v }),
  ];
  if (sig) evidence.push(ev('freshness', sig.freshness, { meaning: 'LIVE/STALE/DATA PROBLEM do Consolidator', role: 'DATA_QUALITY', validation: v }));
  if (s?.gamma?.condition) evidence.push(ev('gamma.condition', s.gamma.condition, { meaning: 'regime de gamma (origem α Bot; display no Consolidator)', role: 'REGIME', validation: 'VENDOR_SEMANTICS' }));
  return makeEnvelope({
    source, cycle_id, now, source_ts: sourceTs, fresh, health: fresh ? (sig ? 'OK' : 'PARTIAL') : 'STALE', role,
    direction, strength: sourceConf, confidence: sourceConf * cov.coverage * cap,
    formula: { expr: 'confidence = source_conf × coverage × validation_cap', inputs: { source_conf: sourceConf, coverage: cov.coverage, validation_cap: cap }, strength: 'source confidence/100' },
    evidence, contradictions, missing_fields: cov.missing, warnings, levels: {}, depends_on, independence_group,
    rules_version: cfg.rules_version, raw_refs: refs, metrics, snapshot_id: refs[0]?.snapshot_id,
  });
}
