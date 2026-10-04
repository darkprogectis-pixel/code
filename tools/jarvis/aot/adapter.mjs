// The ONE central read-only adapter between JARVIS and the AOT BFF (R2).
// - method is always GET; only ALLOWLIST paths; base must be loopback (http://127.0.0.1 | localhost). Anything else throws BEFORE any I/O.
// - per-endpoint cache (ttl = area cadence) + single in-flight request ⇒ N clients on one area = 1 upstream fetch per window.
// - nothing polls by itself: data is fetched only when a JARVIS client asks to observe an area.
// It never writes, never POSTs, never touches /sim, /robo/cmd, orders, NT8 or the Consolidator.
import { ALL_AREAS, AOT_BASE_DEFAULT } from './areas.mjs';

export const ALLOWLIST = Object.freeze(['/state', '/api/indicators', '/robo/state', '/history', '/api/alfabot-signal', '/health']);
const QUERY_OK = { '/robo/state': /^sym=(ES|NQ)$/, '/history': /^days=([1-9]|[1-2]\d|30)$/ };

export function checkBase(base) {
  const u = new URL(base);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname) || u.pathname !== '/' || u.search) throw new Error(`aot base must be loopback http: ${base}`);
  return `${u.protocol}//${u.host}`;
}

// Returns the normalized "path?query" or throws.
export function checkPath(p) {
  const [pathname, query = ''] = String(p).split('?');
  if (!ALLOWLIST.includes(pathname)) throw new Error(`aot path not allowed: ${pathname}`);
  if (query && !(QUERY_OK[pathname] && QUERY_OK[pathname].test(query))) throw new Error(`aot query not allowed: ${p}`);
  return query ? `${pathname}?${query}` : pathname;
}

export function createAotAdapter({ base = AOT_BASE_DEFAULT, fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 4000 } = {}) {
  const origin = checkBase(base);
  const cache = new Map(); // path ⇒ {at, ok, status, body, error, fetched_at}
  const inflight = new Map();
  const stats = { upstream: 0, cache_hits: 0, errors: 0 };
  const ttlOf = (p) => Math.min(...ALL_AREAS.filter((a) => a.endpoints.includes(p)).map((a) => a.cadence_ms).concat([10000]));

  async function get(p, { maxAgeMs } = {}) {
    const path = checkPath(p);
    const ttl = maxAgeMs ?? ttlOf(path);
    const c = cache.get(path);
    if (c && now() - c.at < ttl) { stats.cache_hits++; return c; }
    if (inflight.has(path)) return inflight.get(path);
    const job = (async () => {
      stats.upstream++;
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      let r;
      try {
        const res = await fetchImpl(origin + path, { method: 'GET', headers: { accept: 'application/json' }, signal: ctl.signal });
        const body = res.ok ? await res.json() : null;
        r = { path, at: now(), fetched_at: new Date(now()).toISOString(), ok: res.ok, status: res.status, body, error: res.ok ? null : `HTTP ${res.status}` };
      } catch (e) {
        stats.errors++;
        r = { path, at: now(), fetched_at: new Date(now()).toISOString(), ok: false, status: 0, body: null, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e).slice(0, 160) };
      } finally { clearTimeout(t); inflight.delete(path); }
      cache.set(path, r);
      return r;
    })();
    inflight.set(path, job);
    return job;
  }

  // All endpoints of one area, in parallel; returns {path: result}.
  async function area(a) {
    const out = {};
    await Promise.all(a.endpoints.map(async (p) => { out[p] = await get(p); }));
    return out;
  }
  return { get, area, stats, origin };
}
