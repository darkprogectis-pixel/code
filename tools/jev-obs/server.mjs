#!/usr/bin/env node
// JEV Observability Control Plane — local dashboard server (Phase 1, observational only).
//   node tools/jev-obs/server.mjs [--port 3593]      stop: Ctrl+C
// Binds ONLY 127.0.0.1, GET only, rejects foreign Host headers, redacts every response. Never calls the JEV.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, summarize } from './aggregate.mjs';
import { paths, statOf } from './sources.mjs';
import { cachedParse, writeDerived, cacheStats } from './cache.mjs';
import { alphaRoute } from './alpha.mjs';
import { jarvisRoute } from './jarvis.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HOST = '127.0.0.1';
const PUB = path.join(HERE, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const SECRET_KEY = /(api[_-]?key|secret|password|authorization|bearer|credential|cookie|private[_-]?key)/i;
const SECRET_VAL = /(sk-[A-Za-z0-9_-]{8,}|ts_[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const CONTENT_KEY = /^(state|questions|instructions|criteria|prompt|carried_prompt_text|stdin|content|text)$/i;
// omitContent=false keeps analytical text (Alpha/JARVIS records hold no prompts) but still strips secrets.
export function redact(v, depth = 0, omitContent = true) {
  if (depth > 12) return '[depth]';
  if (typeof v === 'string') return v.replace(SECRET_VAL, '[REDACTED]');
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1, omitContent));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = SECRET_KEY.test(k) ? '[REDACTED]' : omitContent && CONTENT_KEY.test(k) && typeof x !== 'number' ? '[OMITTED]' : redact(x, depth + 1, omitContent);
    return o;
  }
  return v;
}

// Cache keyed by source fingerprint (size+mtime of every source) + filter.
let cache = { key: null, src: null }; const sumCache = new Map();
function fingerprint(P) {
  const files = [P.routing, P.decisions, P.models, P.coverage, P.legacyRotation, P.rotEvents, P.lineage, P.hookMetrics, P.outcomes, P.shadowLedger, P.loops, P.projects, P.rotationBriefs];
  return files.map((f) => { const s = statOf(f); return `${s.bytes}:${s.mtimeMs}`; }).join('|');
}
export function getSummary(filter, P = paths()) {
  const fp = fingerprint(P);
  if (cache.key !== fp) { cache = { key: fp, src: loadAll(P) }; sumCache.clear(); }
  const k = JSON.stringify(filter);
  if (!sumCache.has(k)) { const t0 = Date.now(); const S = summarize(cache.src, filter, { parse: cachedParse }); S.compute_ms = Date.now() - t0; S.parse_cache = { ...cacheStats }; const R = redact(S); sumCache.set(k, R); if (k === '{}' || k === '{"range":"all"}') writeDerived(P, R); if (sumCache.size > 40) sumCache.delete(sumCache.keys().next().value); }
  return sumCache.get(k);
}

export function createServer(P = paths()) {
  return http.createServer((req, res) => {
    const send = (code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(body); };
    try {
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!['127.0.0.1', 'localhost'].includes(host)) return send(403, JSON.stringify({ error: 'forbidden host' }));
      if (req.method !== 'GET') return send(405, JSON.stringify({ error: 'GET only' }));
      const u = new URL(req.url, `http://${HOST}`);
      if (u.pathname === '/api/health') return send(200, JSON.stringify({ ok: true, mode: 'OBSERVATIONAL_ONLY', bind: HOST, pid: process.pid, at: new Date().toISOString() }));
      if (u.pathname.startsWith('/api/alpha/')) { const b = alphaRoute(u, P.alphaDir); return b ? send(200, JSON.stringify(redact(b, 0, false))) : send(404, JSON.stringify({ error: 'not found' })); }
      if (u.pathname.startsWith('/api/jarvis/')) { const b = jarvisRoute(u, P.jarvisDir); return b ? send(200, JSON.stringify(redact(b, 0, false))) : send(404, JSON.stringify({ error: 'not found' })); }
      if (u.pathname === '/api/sources') return send(200, JSON.stringify(redact(loadAll(P).sources)));
      if (u.pathname === '/api/summary') {
        const f = {}; for (const k of ['range', 'session', 'purpose', 'model', 'type', 'until']) { const v = u.searchParams.get(k); if (v) f[k] = v.slice(0, 120); }
        if (f.range && !['today', '7d', '30d', 'all'].includes(f.range)) return send(400, JSON.stringify({ error: 'range must be today|7d|30d|all' }));
        return send(200, JSON.stringify(getSummary(f, P)));
      }
      const file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
      if (!/^[a-z0-9._-]+$/i.test(file)) return send(404, JSON.stringify({ error: 'not found' }));
      const p = path.join(PUB, file);
      if (!fs.existsSync(p)) return send(404, JSON.stringify({ error: 'not found' }));
      return send(200, fs.readFileSync(p), MIME[path.extname(p)] || 'application/octet-stream');
    } catch (e) { return send(500, JSON.stringify({ error: 'internal', detail: String(e.message || e).slice(0, 200) })); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port'); const port = i > 0 ? Number(process.argv[i + 1]) : Number(process.env.JEV_OBS_PORT || 3593);
  const srv = createServer();
  srv.listen(port, HOST, () => console.log(`JEV Observability (OBSERVATIONAL_ONLY) http://${HOST}:${srv.address().port}/  — Ctrl+C para parar`));
  process.on('SIGINT', () => { srv.close(); process.exit(0); });
}
