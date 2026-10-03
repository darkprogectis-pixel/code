// Shared helpers for the 5 specialists (pure; no I/O).
export const LABEL_DIR = { BULLISH: 'BUY', BEARISH: 'SELL', NEUTRO: 'NEUTRAL', NEUTRAL: 'NEUTRAL' };
export const effectOf = (d) => (d === 'BUY' ? 'BULLISH' : d === 'SELL' ? 'BEARISH' : 'NEUTRAL');
export const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
export const tsOf = (s) => { const t = typeof s === 'number' ? s : Date.parse(s); return Number.isFinite(t) ? t : null; };
export function ev(field, value, { unit = null, meaning, effect = 'NEUTRAL', role, validation }) {
  return { field, value, unit, meaning, effect, role, validation };
}
export function lvl(value, unit, origin, extra = {}) { return value == null ? null : { value, unit, origin, ...extra }; }
export function compactLevels(obj) { return Object.fromEntries(Object.entries(obj).filter(([, v]) => v && v.value != null)); }
// Fraction of the listed paths that are present (non-null) in obj.
export function coverage(obj, paths) {
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const missing = paths.filter((p) => get(obj, p) == null);
  return { coverage: paths.length ? (paths.length - missing.length) / paths.length : 1, missing };
}
