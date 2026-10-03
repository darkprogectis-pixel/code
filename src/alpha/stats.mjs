// Small rolling metrics for the Alpha pipeline (no I/O).
export function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10;
}
export function newMetrics() {
  return { started_at: new Date().toISOString(), cycles: 0, agents: {}, fusion: { BUY: 0, SELL: 0, NO_SIGNAL: 0, flips: 0, last_signal: null, agreement: [], confidence: [] }, jev: { calls: 0, ok: 0, errors: 0, skipped: {}, latency_ms: [] }, cycle_ms: [] };
}
const push = (a, v, n = 500) => { a.push(v); if (a.length > n) a.shift(); };
export function recordCycle(m, envs, fusion, stages) {
  m.cycles++;
  push(m.cycle_ms, stages.total);
  for (const e of envs) {
    const a = (m.agents[e.source] ||= { calls: 0, errors: 0, timeouts: 0, stale: 0, BUY: 0, SELL: 0, NEUTRAL: 0, UNKNOWN: 0, contradictions: 0, fetch_ms: [], eval_ms: [], confidence: [] });
    a.calls++;
    if (e.health === 'ERROR') a.errors++;
    if (e.warnings.some((w) => w.startsWith('TIMEOUT'))) a.timeouts++;
    if (e.health === 'STALE') a.stale++;
    a[e.direction]++;
    a.contradictions += e.contradictions.length;
    if (e.metrics?.fetch_ms != null) push(a.fetch_ms, e.metrics.fetch_ms);
    if (e.metrics?.eval_ms != null) push(a.eval_ms, e.metrics.eval_ms);
    push(a.confidence, e.confidence);
  }
  const f = m.fusion;
  f[fusion.signal]++;
  if (f.last_signal && f.last_signal !== fusion.signal) f.flips++;
  f.last_signal = fusion.signal;
  push(f.agreement, fusion.agreement); push(f.confidence, fusion.confidence);
}
export function recordJev(m, jev) {
  if (jev.status === 'OK') { m.jev.calls++; m.jev.ok++; push(m.jev.latency_ms, jev.latency_ms); }
  else if (jev.status === 'ERROR') { m.jev.calls++; m.jev.errors++; }
  else m.jev.skipped[jev.status] = (m.jev.skipped[jev.status] || 0) + 1;
}
export function summarizeMetrics(m) {
  const agents = Object.fromEntries(Object.entries(m.agents).map(([k, a]) => [k, { calls: a.calls, errors: a.errors, timeouts: a.timeouts, stale: a.stale, BUY: a.BUY, SELL: a.SELL, NEUTRAL: a.NEUTRAL, UNKNOWN: a.UNKNOWN, contradictions: a.contradictions,
    fetch_p50: pct(a.fetch_ms, 50), fetch_p95: pct(a.fetch_ms, 95), eval_p50: pct(a.eval_ms, 50), eval_p95: pct(a.eval_ms, 95), confidence_p50: pct(a.confidence, 50), tokens: 0 }]));
  const f = m.fusion;
  return { started_at: m.started_at, cycles: m.cycles, cycle_p50: pct(m.cycle_ms, 50), cycle_p95: pct(m.cycle_ms, 95), agents,
    fusion: { BUY: f.BUY, SELL: f.SELL, NO_SIGNAL: f.NO_SIGNAL, flips: f.flips, agreement_p50: pct(f.agreement, 50), confidence_p50: pct(f.confidence, 50) },
    jev: { calls: m.jev.calls, ok: m.jev.ok, errors: m.jev.errors, skipped: m.jev.skipped, latency_p50: pct(m.jev.latency_ms, 50), latency_p95: pct(m.jev.latency_ms, 95) } };
}
