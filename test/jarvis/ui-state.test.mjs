// JARVIS UI state bus contract (UI1–UI5) + security boundary (SEC1–SEC5) — PROPOSAL R2 §3, §6.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createJarvisServer, loadJarvisConfig } from '../../tools/jarvis/server.mjs';
import { createUiState, parseUiPost, UI_STATES } from '../../tools/jarvis/ui-state.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-ui-'));
const stubVoice = () => { const calls = []; return { calls, status: () => ({ available: false, status: 'VOICE_UNAVAILABLE(stub)' }), synth(t) { calls.push(['synth', t]); throw new Error('stub'); }, vadTrim() { calls.push(['vad']); }, stt() { calls.push(['stt']); }, close() {} }; };
async function boot(opts = {}) {
  const dir = tmp(), voice = opts.voice || stubVoice();
  const srv = createJarvisServer({ cfg: loadJarvisConfig(), alphaDir: dir, jarvisDir: dir, voice, port: 0, ...opts });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, base = `http://127.0.0.1:${port}`;
  const req = (method, p, body, headers = {}) => fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body });
  const post = (p, body, tk = srv.token) => req('POST', p, typeof body === 'string' ? body : JSON.stringify(body), tk ? { 'x-jarvis-token': tk } : {});
  return { srv, dir, voice, port, base, req, post, close: () => new Promise((r) => srv.close(r)) };
}
// minimal SSE reader ⇒ {events[], raw(), close()}
function sse(port) {
  const events = []; let raw = '';
  const r = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
    res.setEncoding('utf8'); let buf = '';
    res.on('data', (d) => { raw += d; buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.+)$/m.exec(blk)?.[1]; const data = /^data: (.+)$/m.exec(blk)?.[1]; if (ev) events.push({ ev, data: JSON.parse(data), at: performance.now() }); } });
  });
  r.on('error', () => {});
  return { events, raw: () => raw, close: () => r.destroy(), status: () => new Promise((ok) => r.on('response', (res) => ok(res.statusCode))) };
}
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return false; };

test('UI1 snapshot schema + enum', async () => {
  const b = await boot();
  try {
    const s = await (await b.req('GET', '/api/ui-state')).json();
    assert.deepEqual(Object.keys(s).sort(), ['at', 'cycle', 'schema', 'seq', 'source', 'state']);
    assert.equal(s.schema, 'jarvis-ui-state/v1'); assert.equal(s.state, 'IDLE'); assert.deepEqual(UI_STATES, ['IDLE', 'LISTENING', 'THINKING', 'SPEAKING', 'ERROR']);
  } finally { await b.close(); }
});

test('UI2 SSE: retry + snapshot first, then changes, ping heartbeat; bus latency p95 ≤ 50 ms', async () => {
  const b = await boot({ pingMs: 150 });
  try {
    const c = sse(b.port); await until(() => c.events.length >= 1);
    assert.match(c.raw(), /^retry: 2000\n\n/); assert.equal(c.events[0].ev, 'state'); assert.equal(c.events[0].data.state, 'IDLE');
    const lat = [];
    for (let i = 0; i < 50; i++) {
      const st = UI_STATES[i % 5], n = c.events.filter((e) => e.ev === 'state').length, t0 = performance.now();
      assert.equal((await b.post('/api/ui-state', { state: st })).status, 200);
      await until(() => c.events.filter((e) => e.ev === 'state').length > n);
      const e = c.events.filter((x) => x.ev === 'state').at(-1); assert.equal(e.data.state, st); assert.equal(e.data.source, 'client'); lat.push(e.at - t0);
    }
    lat.sort((a, z) => a - z); const p95 = lat[Math.floor(lat.length * 0.95) - 1];
    console.log(`UI2 bus latency p50 ${lat[25].toFixed(2)} ms p95 ${p95.toFixed(2)} ms`);
    assert.ok(p95 <= 50, `p95 ${p95}`);
    assert.ok(await until(() => c.events.some((e) => e.ev === 'ping'), 1000), 'ping heartbeat');
    assert.ok(c.events.every((e) => ['state', 'ping'].includes(e.ev)));
    c.close();
  } finally { await b.close(); }
});

test('UI3 SSE client cap: 9th client gets 503', async () => {
  const b = await boot({ sseMax: 8 });
  try {
    const cs = []; for (let i = 0; i < 8; i++) { const c = sse(b.port); cs.push(c); await until(() => c.events.length >= 1); }
    const r = await b.req('GET', '/api/events'); assert.equal(r.status, 503);
    cs.forEach((c) => c.close());
  } finally { await b.close(); }
});

test('UI4 core emits THINKING then IDLE for a cycle without speech', async () => {
  const b = await boot();
  try {
    const c = sse(b.port); await until(() => c.events.length >= 1);
    const r = await b.post('/api/ask', { text: 'onde está a call wall?' }); assert.equal(r.status, 200);
    await until(() => c.events.filter((e) => e.ev === 'state').length >= 3);
    assert.deepEqual(c.events.filter((e) => e.ev === 'state').slice(1).map((e) => [e.data.state, e.data.source]), [['THINKING', 'core'], ['IDLE', 'core']]);
    c.close();
  } finally { await b.close(); }
});

test('UI5 stale guards: THINKING/SPEAKING ⇒ IDLE after staleMs; ERROR ⇒ IDLE after errorMs; LISTENING/IDLE unguarded', async () => {
  const u = createUiState({ staleMs: 120, errorMs: 60 });
  u.set('THINKING'); await new Promise((r) => setTimeout(r, 200)); assert.equal(u.get().state, 'IDLE');
  u.set('SPEAKING', { source: 'client' }); u.set('SPEAKING', { source: 'client' }); await new Promise((r) => setTimeout(r, 80)); assert.equal(u.get().state, 'SPEAKING');
  await new Promise((r) => setTimeout(r, 120)); assert.equal(u.get().state, 'IDLE');
  u.set('ERROR'); await new Promise((r) => setTimeout(r, 110)); assert.equal(u.get().state, 'IDLE');
  u.set('LISTENING'); await new Promise((r) => setTimeout(r, 200)); assert.equal(u.get().state, 'LISTENING');
  assert.throws(() => u.set('BUY')); u.close();
});

test('SEC3 POST /api/ui-state accepts only the visual enum; a valid post changes only the visual state', async () => {
  const b = await boot();
  try {
    const cases = [[{ state: 'BUY' }, 400], [{ state: 'ORDER' }, 400], [{ state: '' }, 400], [{ state: 'IDLE', cmd: 'x' }, 400], [{ state: 'IDLE', cycle: 'rm -rf' }, 400],
      [JSON.stringify({ state: 'IDLE', cycle: null, pad: 'x'.repeat(300) }), 413], ['not json', 400], ['["IDLE"]', 400], ['null', 400]];
    for (const [body, code] of cases) assert.equal((await b.post('/api/ui-state', body)).status, code, JSON.stringify(body).slice(0, 60));
    assert.equal((await b.post('/api/ui-state', { state: 'IDLE' }, '')).status, 401);
    assert.equal((await b.post('/api/ui-state', { state: 'IDLE' }, 'f'.repeat(48))).status, 401);
    assert.equal(parseUiPost('{"state":"SPEAKING","cycle":"jv-0123abcd"}').ok, true);
    const ls = () => fs.readdirSync(b.dir).map((f) => [f, fs.statSync(path.join(b.dir, f)).mtimeMs].join(':')).sort().join('|');
    const before = { files: ls(), jobs: b.srv.jobs.size, calls: b.voice.calls.length, seq: b.srv.ui.get().seq };
    const r = await (await b.post('/api/ui-state', { state: 'SPEAKING', cycle: 'jv-0123abcd' })).json();
    assert.deepEqual(r, { ok: true, seq: before.seq + 1 });
    const s = b.srv.ui.get(); assert.equal(s.state, 'SPEAKING'); assert.equal(s.cycle, 'jv-0123abcd'); assert.equal(s.source, 'client');
    assert.equal(ls(), before.files, 'no file written'); assert.equal(b.srv.jobs.size, before.jobs, 'no job'); assert.equal(b.voice.calls.length, before.calls, 'no voice call');
  } finally { await b.close(); }
});

test('SEC2 route allowlist: no order/trade/exec/account routes; other methods 405', async () => {
  const b = await boot();
  try {
    for (const p of ['/api/order', '/api/trade', '/api/exec', '/api/nt8', '/api/account', '/api/ui-state/x', '/api/orders/new']) {
      assert.equal((await b.req('GET', p)).status, 404, `GET ${p}`); assert.equal((await b.post(p, {})).status, 404, `POST ${p}`);
    }
    for (const m of ['PUT', 'DELETE', 'PATCH']) assert.equal((await b.req(m, '/api/ui-state', '{}')).status, 405, m);
    const src = fs.readFileSync(path.join(REPO, 'tools/jarvis/server.mjs'), 'utf8');
    // R2 (JARVIS × AOT, JEV DIFF A): the POST allowlist adds exactly AOT_POSTS (/api/aot/ask, /api/aot/narrate), token-checked like the rest.
    const posts = /\['\/api\/ask', '\/api\/ask-audio', '\/api\/cancel', '\/api\/ui-state', \.\.\.AOT_POSTS\]\.includes\(u\.pathname\)/.test(src);
    assert.ok(posts, 'POST allowlist literal = ask, ask-audio, cancel, ui-state + AOT_POSTS');
    const { AOT_POSTS } = await import('../../tools/jarvis/aot/routes.mjs');
    assert.deepEqual(AOT_POSTS, ['/api/aot/ask', '/api/aot/narrate']);
    const gets = [...src.matchAll(/u\.pathname === '([^']+)'/g)].map((m) => m[1]).filter((p) => !['/api/ui-state', '/api/cancel', '/api/ask'].includes(p) || true);
    assert.deepEqual([...new Set(gets)].sort(), ['/', '/api/ask', '/api/cancel', '/api/cycles', '/api/events', '/api/health', '/api/status', '/api/ui-state'].sort());
  } finally { await b.close(); }
});

test('SEC4 SSE never carries answer text or transcript', async () => {
  const b = await boot();
  try {
    const c = sse(b.port); await until(() => c.events.length >= 1);
    const a = await (await b.post('/api/ask', { text: 'o que é a call wall segundo a SpotGamma' })).json();
    await until(() => c.events.filter((e) => e.ev === 'state').length >= 3);
    assert.ok(a.answer_text.length > 20);
    const raw = c.raw();
    for (const frag of [a.answer_text.slice(0, 30), 'call wall segundo', a.answer_text.slice(-25)]) assert.ok(!raw.includes(frag), frag);
    for (const line of raw.split('\n').filter(Boolean)) assert.match(line, /^(retry: 2000|event: (state|ping)|data: \{.*\})$/);
    c.close();
  } finally { await b.close(); }
});

const NEW_JS = ['tools/jarvis/ui-state.mjs', 'tools/jarvis/voice-profile.mjs', 'tools/jarvis/server.mjs', 'tools/jarvis/voice.mjs', 'tools/jarvis/avatar/build.mjs', 'tools/jarvis/public/index.html'];
test('SEC1 structural scan: no trading/order/broker/NT8/AOT/INVICTUS reach, no shell, no external network in the UI/voice layer', () => {
  const forbidden = /\b(nt8|ninja\w*|ijc|invictus|aot|robo-trade|broker|placeOrder|sendOrder|submitOrder|account mutation)\b|require\(['"](https|net)['"]\)|from ['"]node:(https|net|dgram)['"]/i;
  for (const f of NEW_JS) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8').split('\n');
    // R2 exemption (server.mjs only): the additive read-only AOT hook lines that delegate to tools/jarvis/aot/routes.mjs (covered by test/jarvis/aot-safety.test.mjs).
    const aotHook = f === 'tools/jarvis/server.mjs' ? /from '\.\/aot\/routes\.mjs'|createAotRoutes\(|isAotPath\(u\.pathname\)\) return aot\.handle\(|AOT_POSTS\.includes\(u\.pathname\)\) return aot\.handle\(|srv\.aot = aot;|mode: 'aot', transcript: null, intent, agent_sources: \['AOT'\]/ : null;
    const hits = src.map((l, i) => [i + 1, l]).filter(([, l]) => forbidden.test(l) && !/^\s*\/\//.test(l) && !(aotHook && aotHook.test(l)) && !/neither changes market, trading, AOT, INVICTUS or NT8|nothing here sends orders|no order routes/.test(l));
    assert.deepEqual(hits, [], f);
    const urls = [...src.join('\n').matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map((m) => m[1]).filter((h) => !['127.0.0.1', 'localhost'].includes(h) && !h.startsWith('${'));
    assert.deepEqual(urls, [], `${f} external hosts`);
  }
  for (const f of ['tools/jarvis/ui-state.mjs', 'tools/jarvis/voice-profile.mjs']) assert.ok(!/^\s*import /m.test(fs.readFileSync(path.join(REPO, f), 'utf8')), `${f} has zero imports`);
  // child_process only in the build script (csc) — never in the request path
  for (const f of NEW_JS.filter((x) => x !== 'tools/jarvis/avatar/build.mjs')) assert.ok(!/child_process/.test(fs.readFileSync(path.join(REPO, f), 'utf8')), f);
  // avatar C#: only 127.0.0.1, no Process.Start, no registry, no shell
  const cs = fs.readFileSync(path.join(REPO, 'tools/jarvis/avatar/JarvisAvatar.cs'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // code only (header comments name what is forbidden)
  assert.ok(!/Process\.Start|ProcessStartInfo|Microsoft\.Win32\.Registry|cmd\.exe|powershell/i.test(cs));
  assert.deepEqual([...new Set([...cs.matchAll(/"http:\/\/([^"]+?)"/g)].map((m) => m[1]))], ['127.0.0.1:']);
  const paths = [...new Set([...cs.matchAll(/"(\/api\/[a-z\-]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(paths, ['/api/ask-audio', '/api/cancel', '/api/events', '/api/ui-state'].sort());
});

test('SEC5 no new dependency vs ade771a', () => {
  let base; try { base = JSON.parse(execFileSync('git', ['show', 'ade771a:package.json'], { cwd: REPO, encoding: 'utf8' })); } catch { return; } // shallow clone: skip
  const now = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.deepEqual(now.dependencies ?? {}, base.dependencies ?? {}); assert.deepEqual(now.devDependencies ?? {}, base.devDependencies ?? {});
});
