// alpha-specialist/v1 and alpha-fusion/v1: builders enforce the invariants, validators check any envelope.
import { AGENT } from './config.mjs';

export const SPECIALIST_SCHEMA = 'alpha-specialist/v1';
export const FUSION_SCHEMA = 'alpha-fusion/v1';
export const DIRECTIONS = ['BUY', 'SELL', 'NEUTRAL', 'UNKNOWN'];
export const HEALTH = ['OK', 'PARTIAL', 'STALE', 'ERROR'];
export const ROLES = ['SOURCE_CLASSIFICATION', 'DIRECTIONAL_PRESSURE', 'NON_DIRECTIONAL'];
export const EFFECTS = ['BULLISH', 'BEARISH', 'NEUTRAL'];
export const SIGNALS = ['BUY', 'SELL', 'NO_SIGNAL'];

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const iso = (t) => (t == null ? null : new Date(t).toISOString());

// Builds an envelope. Invariants: stale/error => UNKNOWN with zero strength/confidence; NON_DIRECTIONAL => UNKNOWN.
export function makeEnvelope(p) {
  const fresh = !!p.fresh && p.health !== 'ERROR' && p.health !== 'STALE';
  let direction = DIRECTIONS.includes(p.direction) ? p.direction : 'UNKNOWN';
  let strength = clamp01(p.strength), confidence = clamp01(p.confidence);
  const health = !fresh && p.health !== 'ERROR' ? 'STALE' : p.health;
  if (!fresh || p.role === 'NON_DIRECTIONAL') direction = 'UNKNOWN';
  if (direction === 'UNKNOWN') { strength = 0; confidence = 0; }
  return {
    schema: SPECIALIST_SCHEMA, source: p.source, agent: AGENT[p.source], cycle_id: p.cycle_id, snapshot_id: p.snapshot_id ?? null,
    timestamp: iso(p.now), source_timestamp: iso(p.source_ts), age_ms: p.source_ts == null ? null : Math.max(0, p.now - p.source_ts),
    fresh, health, market: 'ES', timeframe: 'intraday',
    direction, strength: r4(strength), confidence: r4(confidence), calibration: 'UNCALIBRATED', role: p.role,
    evidence: p.evidence || [], contradictions: p.contradictions || [], missing_fields: p.missing_fields || [], warnings: p.warnings || [],
    levels: p.levels || {}, depends_on: p.depends_on || [], independence_group: p.independence_group || null,
    rules_version: p.rules_version, formula: p.formula || null, raw_ref: { endpoints: p.raw_refs || [] }, metrics: p.metrics || {},
  };
}

export function errorEnvelope({ source, cycle_id, now, error, role, rules_version, raw_refs, metrics, depends_on, independence_group }) {
  return makeEnvelope({ source, cycle_id, now, fresh: false, health: 'ERROR', role, rules_version, raw_refs, metrics, depends_on, independence_group,
    warnings: [`${error.kind || 'ERROR'}: ${String(error.message || error).slice(0, 160)}`] });
}

export function validateSpecialist(e) {
  const errs = [];
  const need = (c, m) => { if (!c) errs.push(m); };
  need(e && e.schema === SPECIALIST_SCHEMA, 'schema');
  need(Object.keys(AGENT).includes(e?.source), 'source');
  need(typeof e?.cycle_id === 'string', 'cycle_id');
  need(typeof e?.timestamp === 'string', 'timestamp');
  need(typeof e?.fresh === 'boolean', 'fresh');
  need(HEALTH.includes(e?.health), 'health');
  need(DIRECTIONS.includes(e?.direction), 'direction');
  need(ROLES.includes(e?.role), 'role');
  for (const k of ['strength', 'confidence']) need(typeof e?.[k] === 'number' && e[k] >= 0 && e[k] <= 1, k);
  for (const k of ['evidence', 'contradictions', 'missing_fields', 'warnings']) need(Array.isArray(e?.[k]), k);
  need(e?.raw_ref && Array.isArray(e.raw_ref.endpoints), 'raw_ref');
  if (e && (!e.fresh || e.health === 'STALE' || e.health === 'ERROR')) need(e.direction === 'UNKNOWN' && e.confidence === 0, 'stale/error must be UNKNOWN with confidence 0');
  if (e?.role === 'NON_DIRECTIONAL') need(e.direction === 'UNKNOWN', 'NON_DIRECTIONAL must be UNKNOWN');
  for (const ev of e?.evidence || []) need(EFFECTS.includes(ev.effect) && typeof ev.field === 'string', 'evidence item');
  return errs;
}

export function validateFusion(f) {
  const errs = [];
  const need = (c, m) => { if (!c) errs.push(m); };
  need(f && f.schema === FUSION_SCHEMA, 'schema');
  need(SIGNALS.includes(f?.signal), 'signal');
  for (const k of ['confidence', 'agreement']) need(typeof f?.[k] === 'number' && f[k] >= 0 && f[k] <= 1, k);
  need(f?.sources && Object.keys(AGENT).every((s) => f.sources[s]), 'sources');
  for (const k of ['bullish_sources', 'bearish_sources', 'neutral_sources', 'ignored_sources', 'contradictions']) need(Array.isArray(f?.[k]), k);
  need(typeof f?.freshness_ok === 'boolean', 'freshness_ok');
  need(typeof f?.reasoning_summary === 'string', 'reasoning_summary');
  need(f?.jev && typeof f.jev.status === 'string', 'jev');
  if (f?.signal !== 'NO_SIGNAL') need(f.freshness_ok && f.contradictions.filter((c) => c.material).length === 0, 'active signal requires freshness and no material contradiction');
  return errs;
}
