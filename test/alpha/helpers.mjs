// Test helpers: real fixtures (fixtures/alpha) rebased onto a fixed `now`, and a fake fetch for the GET allowlist.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, loadConfig } from '../../src/alpha/config.mjs';

export const cfg = () => loadConfig(path.join(REPO, 'config', 'alpha.json'));
const FX = path.join(REPO, 'fixtures', 'alpha');
export const fx = (name) => JSON.parse(fs.readFileSync(path.join(FX, name), 'utf8'));
// Real HIRO replay ends at 20:59:50Z (last 5 s candle) ⇒ FRESH_NOW is 5 s later. STALE_NOW = capture time (off-RTH).
export const FRESH_NOW = Date.parse('2026-10-02T20:59:55Z');
export const STALE_NOW = Date.parse('2026-10-02T23:05:00Z');
const iso = (t) => new Date(t).toISOString();

// Payloads per specialist, keyed like cfg.endpoints. fresh=true rewrites only the timestamps (and Consolidator freshness flag).
export function payloads({ fresh = true, now = FRESH_NOW } = {}) {
  const P = {
    quant: { consolidated: fx('quant.consolidated.json'), signal: fx('quant.signal.json') },
    gamma: { hiro: fx('gamma.hiro.replay60m.json'), levels: fx('gamma.levels.json'), health: fx('gamma.health.json') },
    bot: { orderflow: fx('bot.orderflow.json'), classic: fx('bot.classic.json') },
    q: { exposure: fx('q.exposure.json'), levels: fx('q.levels.json'), spot: fx('q.spot.json') },
    data: { signal: fx('data.signal.json'), exposure: fx('data.exposure.json') },
  };
  if (fresh) {
    P.quant.consolidated.asof = iso(now - 10000); P.quant.signal.freshness = 'LIVE'; P.quant.signal.ts = iso(now - 10000);
    P.bot.orderflow.timestamp = Math.floor((now - 10000) / 1000);
    P.q.exposure.asof = iso(now - 60000);
    P.data.signal.asof = iso(now - 30000);
  } else P.gamma.hiro = fx('gamma.hiro.empty.json');
  return P;
}

// Fake fetch: url → payload object | {status} | 'OFFLINE' | 'TIMEOUT' | 'BADJSON' | {delay, body}.
export function mkFetch(cfgObj, P, overrides = {}) {
  const byUrl = {};
  for (const [src, eps] of Object.entries(cfgObj.endpoints)) for (const [k, url] of Object.entries(eps)) byUrl[url] = P[src]?.[k] ?? { status: 404 };
  Object.assign(byUrl, overrides);
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method });
    let v = byUrl[url];
    if (v === undefined) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (v && v.delay) { await new Promise((res, rej) => { const t = setTimeout(res, v.delay); opts.signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' })); }); }); v = v.body; }
    if (v === 'OFFLINE') throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (v === 'TIMEOUT') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    if (v === 'BADJSON') return { status: 200, text: async () => '{not json' };
    if (v && typeof v.status === 'number' && Object.keys(v).length === 1) return { status: v.status, text: async () => '' };
    return { status: 200, text: async () => JSON.stringify(v) };
  };
  fn.calls = calls;
  return fn;
}

// Per-process root so parallel test files never delete each other's dirs.
const TMP_ROOT = path.join(REPO, 'var', 'test-alpha', String(process.pid));
export function tmpDir(tag) { const d = path.join(TMP_ROOT, `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`); fs.mkdirSync(d, { recursive: true }); return d; }
export function cleanupTmp() { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); }
