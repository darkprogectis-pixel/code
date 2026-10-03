// Read-only HTTP for Alpha: GET only, 127.0.0.1 only, allowlisted ports only. Never sends a body.
export class AlphaHttpError extends Error {
  constructor(kind, msg, extra = {}) { super(msg); this.kind = kind; Object.assign(this, extra); }
}
export function assertAllowed(url, allow) {
  const u = new URL(url);
  if (u.protocol !== 'http:' || u.hostname !== allow.host || !allow.ports.includes(Number(u.port)))
    throw new AlphaHttpError('FORBIDDEN', `alpha http: ${u.origin} not in allowlist`);
  if (allow.method !== 'GET') throw new AlphaHttpError('FORBIDDEN', 'alpha http: only GET is allowed');
  return u;
}
// Returns { status, ms, text, json }. Throws AlphaHttpError(TIMEOUT|OFFLINE|HTTP|PARSE|FORBIDDEN).
export async function getJson(url, { allow, timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  assertAllowed(url, allow);
  const t0 = performance.now();
  let r, text;
  try {
    r = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    text = await r.text();
  } catch (e) {
    const ms = performance.now() - t0;
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new AlphaHttpError(timeout ? 'TIMEOUT' : 'OFFLINE', `${timeout ? 'timeout' : 'offline'}: ${String(e?.cause?.code || e?.message || e).slice(0, 120)}`, { ms });
  }
  const ms = performance.now() - t0;
  if (r.status !== 200) throw new AlphaHttpError('HTTP', `http ${r.status}`, { ms, status: r.status });
  let json;
  try { json = JSON.parse(text); } catch { throw new AlphaHttpError('PARSE', 'invalid JSON', { ms, status: r.status }); }
  return { status: r.status, ms, text, json };
}
