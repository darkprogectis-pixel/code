// Observation builder — ALFA_OMEGA_INDICATOR_OBSERVATION_V1 (context/jev-future/alfaomega/ALFA_OMEGA_REALTIME_OBSERVATION_SCHEMA.md).
// Only documented fields are read (α skills §4–§10, src/alpha/outcomes.mjs). Deterministic mapping only:
// fresh sign → BULLISH/BEARISH/NEUTRAL; STALE/DELAYED → STALE; missing/unknown → UNKNOWN; error → INVALID. Never NEUTRAL by default.
// Missing raw values stay null (never 0). Observations are frozen: skills may add context, never change raw/state/freshness (SEM04).
import { INDICATORS, EMITTABLE_LIFECYCLE } from './registry.mjs';

export const SCHEMA = 'alfa-omega-observation/v1';
export const DIRECTIONAL_STATES = Object.freeze(['BULLISH', 'BEARISH', 'NEUTRAL']);
// Static quality flags (audit D2/D3): surfaced, never "fixed" — NT8 is not touched.
export const QUALITY = Object.freeze({
  ME_FALLBACK_TO_VECTOR_POSSIBLE: 'D2: GetMeDir() returns VectorDir when ME is stale (SharedState:461); raw ME freshness not exposed on :5151',
  DUPLICATE_WRITER: 'D3: FlowOne and AoTapeEngine+AoMarketDataPublisher both write the tape bus; one capability counts once',
  FIELD_NOT_DOCUMENTED_ON_5151: 'ME/MVI/CONF are not documented fields of :5151 /state; not read',
  NO_DOCUMENTED_DIRECTION: 'source publishes levels/regime only; no direction field is documented',
});

const iso = (ms) => new Date(ms).toISOString();
const toMs = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
export function freshness(tsMs, limitS, nowMs) {
  if (tsMs == null) return { freshness: 'UNKNOWN', age_s: null };
  const age = Math.max(0, (nowMs - tsMs) / 1000);
  return { freshness: age <= limitS ? 'LIVE' : age <= 2 * limitS ? 'DELAYED' : 'STALE', age_s: Math.round(age) };
}
const LABEL = { BULLISH: 'BULLISH', BEARISH: 'BEARISH', NEUTRO: 'NEUTRAL', NEUTRAL: 'NEUTRAL' };
export function stateOf(label, fr) {
  if (fr === 'ERROR') return 'INVALID';
  if (fr === 'STALE' || fr === 'DELAYED') return 'STALE';
  if (fr !== 'LIVE') return 'UNKNOWN';
  return LABEL[String(label ?? '').toUpperCase()] || 'UNKNOWN';
}
const sign = (x) => (x > 0 ? 'BULLISH' : x < 0 ? 'BEARISH' : 'NEUTRAL');

// Session = opening date with the 18:00 ET roll (AoConfig.SessionDate rule).
export function sessionDate(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)); if (+p.hour >= 18) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function obs(ctx, o) {
  const ind = INDICATORS.find((x) => x.id === o.indicator_id);
  const lifecycle = o.indicator_id.startsWith('src:') ? 'SOURCE_PUBLISHED' : ctx.lifecycleOf(o.indicator_id);
  if (!EMITTABLE_LIFECYCLE.includes(lifecycle)) return null; // merged gen-1 / support / control UI are never emitted (LIFE02/LIFE05)
  const state = o.state;
  return Object.freeze({
    schema: SCHEMA, cycle_id: ctx.cycle_id, timestamp: ctx.timestamp, instrument: 'ES', timeframe: 'snapshot', session: ctx.session,
    indicator_id: o.indicator_id, capability_id: o.capability_id, lifecycle_status: lifecycle, source: o.source, vendor_class: ctx.vendorClass(o.source),
    raw_value: o.raw_value ?? null, normalized_value: null, state, direction: DIRECTIONAL_STATES.includes(state) ? state : 'NONE',
    role: o.role ?? ind?.role ?? 'UNKNOWN', policy: ind?.policy ?? null, group: ctx.groupOf(o.source), confidence_type: o.confidence_type ?? 'NOT_AVAILABLE',
    freshness: o.freshness, age_s: o.age_s ?? null, ts_source: o.ts_source ?? 'none', regime: o.regime ?? null,
    quality: Object.freeze([...(o.quality || [])]), dependencies: Object.freeze([...(o.dependencies || [])]),
    supporting_evidence: Object.freeze([]), contradicting_evidence: Object.freeze([]), skill_context: Object.freeze([]),
  });
}

// snapshot: collector output. lineage: config/alfaomega-lineage.curated.json content. sources: registry SOURCES.
export function buildObservations(snapshot, { lineage, sources, now = Date.now() } = {}) {
  const byId = new Map((lineage?.entries || []).map((e) => [e.id, e]));
  const nowMs = typeof now === 'function' ? now() : now;
  const ctx = {
    cycle_id: snapshot.cycle_id, timestamp: snapshot.timestamp, session: sessionDate(Date.parse(snapshot.timestamp) || nowMs),
    lifecycleOf: (id) => byId.get(id)?.lifecycle_status ?? 'UNKNOWN',
    vendorClass: (s) => sources.find((x) => x.id === s)?.vendor_class ?? 'UNKNOWN', groupOf: (s) => sources.find((x) => x.id === s)?.group ?? s,
  };
  const S = snapshot.sources || {};
  const body = (sid, p) => S[sid]?.bodies?.[p] ?? null;
  const err = (sid, p) => !!S[sid]?.errors?.[p];
  const out = [];
  const push = (o) => { const r = obs(ctx, o); if (r) out.push(r); };
  // freshness for one documented endpoint: ERROR when the GET failed, MISSING when the body/field is absent.
  const fr = (sid, p, tsMs, limitS, present = true) => (err(sid, p) ? { freshness: 'ERROR', age_s: null } : !body(sid, p) || !present ? { freshness: 'MISSING', age_s: null } : freshness(tsMs, limitS, nowMs));

  { // α Quant /consolidated/ES — published direction (Tier 0); asof ≤ 120 s.
    const b = body('ALFA_QUANT', '/consolidated/ES'); const f = fr('ALFA_QUANT', '/consolidated/ES', toMs(b?.asof), 120, b?.direction != null);
    push({ indicator_id: 'src:ALFA_QUANT', capability_id: 'consolidated.direction', source: 'ALFA_QUANT', role: 'DIRECTION', raw_value: b?.direction ?? null,
      state: stateOf(b?.direction, f.freshness), ...f, ts_source: 'engine_cycle', confidence_type: 'DETERMINISTIC_SCORE', dependencies: ['ALFA_DATA', 'ALFA_Q', 'NT8_CME', 'ALFA_BOT'] });
  }
  { // α Data /signal/ES — QD classification; asof ≤ 600 s. CONTEXT: counts once with α Quant (G_QUANT_DATA).
    const b = body('ALFA_DATA', '/signal/ES'); const f = fr('ALFA_DATA', '/signal/ES', toMs(b?.asof), 600, b?.direction != null);
    push({ indicator_id: 'nt8:QuantDataEngine', capability_id: 'signal.direction', source: 'ALFA_DATA', raw_value: b?.direction ?? null,
      state: stateOf(b?.direction, f.freshness), ...f, ts_source: 'vendor', confidence_type: 'DETERMINISTIC_SCORE', dependencies: ['ALFA_Q'] });
  }
  { // α Gamma /hiro/SPX — sign of Σf4 over the served tail; last candle ≤ 60 s. Off-RTH tail=[] ⇒ STALE/MISSING.
    const b = body('ALFA_GAMMA', '/hiro/SPX'); const tail = Array.isArray(b?.tail) ? b.tail : [];
    const sum = tail.length ? tail.reduce((a, c) => a + (Number(c?.[4]) || 0), 0) : null;
    const f = fr('ALFA_GAMMA', '/hiro/SPX', tail.length ? toMs(tail[tail.length - 1][0]) : null, 60, tail.length > 0);
    push({ indicator_id: 'nt8:AlfaOmegaHiro', capability_id: 'hiro.sign', source: 'ALFA_GAMMA', raw_value: sum,
      state: f.freshness === 'LIVE' && sum != null ? sign(sum) : stateOf(null, f.freshness), ...f, ts_source: 'vendor', confidence_type: 'QUALITATIVE' });
  }
  { // α Q /exposure/ES — levels only; asof ≤ 15 min. No documented direction ⇒ NOT_APPLICABLE (positive-confirmation policy kept).
    const b = body('ALFA_Q', '/exposure/ES'); const f = fr('ALFA_Q', '/exposure/ES', toMs(b?.asof), 900, !!b?.levels);
    push({ indicator_id: 'nt8:MenthorQGammaEngine', capability_id: 'exposure.levels', source: 'ALFA_Q', raw_value: b?.levels ?? null,
      state: f.freshness === 'LIVE' ? 'NOT_APPLICABLE' : stateOf(null, f.freshness), ...f, ts_source: 'vendor', quality: ['NO_DOCUMENTED_DIRECTION'] });
  }
  { // α Bot /gexbot/orderflow/ES_SPX — gamma_condition = zgr ≥ 0 ? POSITIVE : NEGATIVE (no side); vendor ts ≤ 180 s and !_relay.stale.
    const b = body('ALFA_BOT', '/gexbot/orderflow/ES_SPX'); const zgr = typeof b?.zgr === 'number' ? b.zgr : null;
    let f = fr('ALFA_BOT', '/gexbot/orderflow/ES_SPX', toMs(b?.timestamp), 180, zgr != null);
    if (f.freshness === 'LIVE' && b?._relay?.stale === true) f = { ...f, freshness: 'STALE' };
    push({ indicator_id: 'src:ALFA_BOT', capability_id: 'gamma.condition', source: 'ALFA_BOT', role: 'REGIME', raw_value: zgr,
      state: f.freshness === 'LIVE' ? 'NOT_APPLICABLE' : stateOf(null, f.freshness), regime: f.freshness === 'LIVE' ? (zgr >= 0 ? 'POSITIVE_GAMMA' : 'NEGATIVE_GAMMA') : null, ...f, ts_source: 'vendor' });
  }
  { // NT8 bridge :5151 /state — only es.lastPrice/es.priceAgeMs are documented (src/alpha/outcomes.mjs). FlowOne ME/MVI/CONF are not.
    const b = body('NT8_CME', '/state'); const age = typeof b?.es?.priceAgeMs === 'number' ? b.es.priceAgeMs : null;
    const f = fr('NT8_CME', '/state', age == null ? null : nowMs - age, 60, b?.es?.lastPrice != null);
    push({ indicator_id: 'src:NT8_CME', capability_id: 'es.price', source: 'NT8_CME', role: 'CONTEXT', raw_value: b?.es?.lastPrice ?? null,
      state: f.freshness === 'LIVE' ? 'NOT_APPLICABLE' : stateOf(null, f.freshness), ...f, ts_source: 'bridge' });
    const bridge = err('NT8_CME', '/state') ? 'ERROR' : b ? 'NOT_SUPPORTED' : 'MISSING';
    push({ indicator_id: 'nt8:AlfaOmegaFlowOne', capability_id: 'flowone:ME|MVI|CONF', source: 'NT8_CME', role: 'DIRECTION', raw_value: null,
      state: stateOf(null, bridge), freshness: bridge, quality: ['FIELD_NOT_DOCUMENTED_ON_5151', 'ME_FALLBACK_TO_VECTOR_POSSIBLE', 'DUPLICATE_WRITER'] });
  }
  return out;
}

// Skills may only attach context (SEM04): returns a new frozen observation; raw_value/state/freshness are copied unchanged.
export function withSkillContext(o, note) {
  return Object.freeze({ ...o, skill_context: Object.freeze([...o.skill_context, String(note).slice(0, 500)]) });
}
