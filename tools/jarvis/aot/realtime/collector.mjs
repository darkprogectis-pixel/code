// Real-time collector — ONE snapshot per source per cycle (order §18–§19, RT01/RT02/RT04).
// - method is always GET; every URL passes checkUrl() before I/O (:5152/:5153/control plane denied).
// - within a cycle each URL is fetched once; concurrent cycles share in-flight requests (no duplicate polling).
// - cadence OFF (default) never polls; ON_DEMAND only on collect(); 60–300 s runs a timer.
// It never writes, never POSTs and never touches orders, NT8, the AOT or the Consolidator.
import { SOURCES, CADENCES, checkUrl } from './registry.mjs';

export function createCollector({ fetchImpl = globalThis.fetch, now = () => Date.now(), host = '127.0.0.1', sources = SOURCES, timeoutMs = 4000,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, onCycle = null } = {}) {
  let cadence = 'OFF'; let timer = null; let seq = 0;
  const inflight = new Map();
  const stats = { cycles: 0, upstream: 0, shared: 0, errors: 0 };
  const snapshots = { previous: null, current: null };

  async function get(rawUrl) {
    const { url } = checkUrl(rawUrl);
    if (inflight.has(url)) { stats.shared++; return inflight.get(url); }
    const job = (async () => {
      stats.upstream++;
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: ctl.signal });
        return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : null, error: res.ok ? null : `HTTP ${res.status}` };
      } catch (e) {
        stats.errors++;
        return { ok: false, status: 0, body: null, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e).slice(0, 160) };
      } finally { clearTimeout(t); inflight.delete(url); }
    })();
    inflight.set(url, job);
    return job;
  }

  async function collect() {
    const started = now(); const cycle_id = `rt-${started}-${++seq}`;
    const out = {};
    await Promise.all(sources.map(async (s) => {
      const urls = [...new Set(s.paths.map((p) => `http://${host}:${s.port}${p}`))];
      const res = await Promise.all(urls.map(get));
      const bodies = {}; const errors = {};
      urls.forEach((u, i) => { const p = new URL(u).pathname; bodies[p] = res[i].body; if (!res[i].ok) errors[p] = res[i].error; });
      out[s.id] = { source: s.id, port: s.port, vendor_class: s.vendor_class, ok: res.every((r) => r.ok), any_ok: res.some((r) => r.ok), bodies, errors, fetched_at: new Date(now()).toISOString() };
    }));
    stats.cycles++;
    const snap = Object.freeze({ cycle_id, started_at: new Date(started).toISOString(), timestamp: new Date(now()).toISOString(), sources: out });
    snapshots.previous = snapshots.current; snapshots.current = snap;
    if (onCycle) await onCycle(snap, snapshots.previous);
    return snap;
  }

  function stop() { if (timer) clearIntervalImpl(timer); timer = null; }
  function setCadence(c) {
    if (!CADENCES.includes(c)) throw new Error(`cadence not allowed: ${c}`);
    stop(); cadence = c;
    if (typeof c === 'number') timer = setIntervalImpl(() => { collect().catch(() => { stats.errors++; }); }, c * 1000);
    return cadence;
  }

  return { collect, setCadence, stop, get cadence() { return cadence; }, get running() { return !!timer; }, stats, snapshots };
}
