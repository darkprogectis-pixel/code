// AGENT_GAMMA — α Gamma = SpotGamma capture (:3500). Reads ONLY its own API. Skill: .claude/skills/skill-alpha-gamma.
// Direction only from HIRO (DIRECTIONAL_PRESSURE, vendor semantics; PROJECT_TESTED_REJECTED as predictor => low cap).
// Walls / Zero Gamma are LOCATION/REGIME (no side). Market origin = SPX (translated to ES via futuresDiff), never ES_NATIVE.
// Tape deltaDollar / divergence are BLOCKED_SEMANTICS and are not read.
import { makeEnvelope } from '../contracts.mjs';
import { num, tsOf, ev, lvl, compactLevels } from './common.mjs';

export const source = 'gamma';
export const role = 'DIRECTIONAL_PRESSURE';
export const depends_on = [];
export const independence_group = 'G_GAMMA';
export const endpoints = (cfg) => cfg.endpoints.gamma;
export const required = ['hiro'];
const LEVEL_KEYS = ['callwallstrike', 'putwallstrike', 'zero_g_strike', 'max_g_strike', 'topabs_strike', 'L1', 'L2', 'L3', 'L4', 'C1', 'C2', 'C3', 'C4'];
const CANDLE_MS = 5000;

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Rolling window sums of f4 (two pointers), sampled once per minute. Pure.
export function hiroStats(candles, windowMs) {
  const c = candles.filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[4])).sort((a, b) => a[0] - b[0]);
  if (!c.length) return null;
  const last = c[c.length - 1][0];
  let j = 0, sum = 0, nextSample = c[0][0] + windowMs;
  const samples = [];
  for (let i = 0; i < c.length; i++) {
    sum += c[i][4];
    while (c[j][0] <= c[i][0] - windowMs) { sum -= c[j][4]; j++; }
    if (c[i][0] >= nextSample) { samples.push(Math.abs(sum)); nextSample = c[i][0] + 60000; }
  }
  const inWin = c.filter((x) => x[0] > last - windowMs);
  return { lastTs: last, slope: inWin.reduce((a, x) => a + x[4], 0), nWindow: inWin.length, cumulative: c.reduce((a, x) => a + x[4], 0), medianAbs: median(samples), nSamples: samples.length, n: c.length };
}

export function evaluate({ payloads, refs, now, cycle_id, cfg, metrics }) {
  const h = payloads.hiro, L = payloads.levels, H = payloads.health;
  const warnings = [], missing = [];
  const candles = Array.isArray(h?.tail) ? h.tail : Array.isArray(h?.candles) ? h.candles : [];
  const win = cfg.gamma.slope_window_ms;
  const st = hiroStats(candles, win);
  if (!st) { missing.push('hiro.tail'); warnings.push('HIRO sem candles (fora do RTH ou feed parado)'); }
  if (H && H.rth === false) warnings.push('SpotGamma /health rth=false');
  const sourceTs = st ? st.lastTs : null;
  const fresh = !!st && now - st.lastTs <= cfg.stale_ms.gamma_hiro;
  let direction = 'UNKNOWN', strength = 0;
  const cov = st ? Math.min(1, st.nWindow / (win / CANDLE_MS)) : 0;
  if (st) {
    let ref = st.medianAbs;
    if (ref == null || st.nSamples < 2) { ref = Math.abs(st.slope); warnings.push('histórico de janelas insuficiente: p50 = |slope| atual (strength 0.5)'); }
    direction = Math.abs(st.slope) < ref ? 'NEUTRAL' : st.slope > 0 ? 'BUY' : st.slope < 0 ? 'SELL' : 'NEUTRAL';
    strength = Math.abs(st.slope) + ref > 0 ? Math.abs(st.slope) / (Math.abs(st.slope) + ref) : 0;
  }
  const cumulativeComplete = st && num(h?.candlesCount) === candles.length;
  if (st && !cumulativeComplete) warnings.push('tail parcial: HIRO cumulativo do dia indisponível');
  const cap = cfg.validation_cap[role];
  const vSem = 'PROJECT_TESTED_REJECTED';
  const evidence = st ? [
    ev('hiro.slope_15m', Math.round(st.slope), { unit: 'HIRO (Σf4, unidade vendor)', meaning: 'pressão de hedge do dealer nos últimos 15 min (vendor: positivo = pressão compradora)', effect: direction === 'BUY' ? 'BULLISH' : direction === 'SELL' ? 'BEARISH' : 'NEUTRAL', role, validation: vSem }),
    ev('hiro.p50_abs_15m', st.medianAbs == null ? null : Math.round(st.medianAbs), { unit: 'HIRO', meaning: 'mediana do |slope 15 min| no dia (banda neutra)', role, validation: vSem }),
    ev('hiro.cumulative', cumulativeComplete ? Math.round(st.cumulative) : null, { unit: 'HIRO', meaning: 'HIRO cumulativo da sessão (Σf4)', role, validation: vSem }),
  ] : [];
  const fl = L?.futureLevels || {}, il = L?.indexLevels || {}, lab = L?.labels || {};
  const origin = `SPX→ES (futuresDiff ${num(L?.futuresDiff)}, tradeDate ${String(L?.tradeDate || '').slice(0, 10)})`;
  const levels = compactLevels(Object.fromEntries(LEVEL_KEYS.map((k) => [lab[k] || k, lvl(num(fl[k]), 'pontos ES', origin, { index_value: num(il[k]), market_origin: 'SPX', asof: L?.asof || null })])));
  for (const k of ['callwallstrike', 'putwallstrike', 'zero_g_strike']) if (L && fl[k] == null) missing.push(`levels.futureLevels.${k}`);
  if (!L) missing.push('levels');
  return makeEnvelope({
    source, cycle_id, now, source_ts: sourceTs, fresh, health: fresh ? (L ? 'OK' : 'PARTIAL') : 'STALE', role,
    direction, strength, confidence: 1 * cov * cap,
    formula: { expr: 'confidence = source_conf(1) × coverage × validation_cap', inputs: { source_conf: 1, coverage: Math.round(cov * 1e4) / 1e4, validation_cap: cap }, strength: '|slope15| / (|slope15| + p50|slope15|)' },
    evidence, contradictions: [], missing_fields: missing, warnings, levels, depends_on, independence_group,
    rules_version: cfg.rules_version, raw_refs: refs, metrics, snapshot_id: refs[0]?.snapshot_id,
  });
}
