// Shared helpers for the JARVIS × AOT suites: sanitized fixtures, an in-process FAKE AOT BFF on an ephemeral loopback port
// (never the real :3600), a fetch spy and a JARVIS boot with a stub voice. Nothing here talks to production.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createJarvisServer, loadJarvisConfig } from '../../tools/jarvis/server.mjs';
import { createAotAdapter } from '../../tools/jarvis/aot/adapter.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIX = path.join(REPO, 'fixtures', 'jarvis-aot');
export const fixture = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `${n}.json`), 'utf8'));
export const tmp = (p = 'jarvis-aot-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// path → fixture body (robo fixture serves both symbols, with the symbol rewritten)
export function fixtureRoutes() {
  const robo = fixture('robo');
  return {
    '/state': fixture('state'), '/api/indicators': fixture('indicators'), '/history?days=2': fixture('history'), '/api/alfabot-signal': fixture('alfabot'), '/health': fixture('health'),
    '/robo/state?sym=ES': { ...robo, symbol: 'ES' }, '/robo/state?sym=NQ': { ...robo, symbol: 'NQ' },
  };
}

// Fake AOT BFF: records every request {method, url}; delayMs simulates a slow upstream.
export async function fakeAot({ routes = fixtureRoutes(), delayMs = 0 } = {}) {
  const log = [];
  const srv = http.createServer(async (req, res) => {
    log.push({ method: req.method, url: req.url });
    if (delayMs) await sleep(delayMs);
    const body = routes[req.url];
    if (req.method !== 'GET' || body === undefined) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { log, base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

// fetch spy over the fixtures (no network at all)
export function spyFetch(routes = fixtureRoutes()) {
  const calls = [];
  const fetchImpl = async (url, opt = {}) => {
    const u = new URL(url); const key = u.pathname + u.search;
    calls.push({ method: opt.method || 'GET', url: key, origin: u.origin });
    const body = routes[key];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => structuredClone(body) };
  };
  return { calls, fetchImpl };
}

export const stubVoice = ({ available = false, synthMs = 0 } = {}) => {
  const calls = [];
  return {
    calls, status: () => ({ available, status: available ? 'STUB' : 'VOICE_UNAVAILABLE(stub)' }),
    synth(t) { calls.push(['synth', t]); if (!available) throw new Error('stub'); return { parts: [t], async *[Symbol.asyncIterator]() { await sleep(synthMs); yield { samples: new Float32Array(160), sampleRate: 16000, ms: synthMs }; } }; },
    vadTrim() {}, stt() {}, close() {},
  };
};

export async function bootJarvis({ aotBase, voice = stubVoice(), adapter, knowledge = () => [] } = {}) {
  const dir = tmp('jarvis-aot-srv-');
  const aotAdapter = adapter || createAotAdapter({ base: aotBase || 'http://127.0.0.1:9' });
  const srv = createJarvisServer({ cfg: loadJarvisConfig(), alphaDir: dir, jarvisDir: dir, voice, port: 0, aotAdapter, aotKnowledgeFn: knowledge });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = (p, headers = {}) => fetch(base + p, { headers });
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-token': srv.token, ...headers }, body: JSON.stringify(body) });
  return { srv, base, get, post, voice, close: () => new Promise((r) => srv.close(r)) };
}
