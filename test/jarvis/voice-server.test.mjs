// JARVIS voice layer + server 3594 + control-plane JARVIS tab + stack script: security boundary, contracts, observability.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { normalizeTranscript, sentences, wav, resample, createVoice, modelAvailable } from '../../tools/jarvis/voice.mjs';
import { route } from '../../tools/jarvis/router.mjs';
import { createJarvisServer, loadJarvisConfig } from '../../tools/jarvis/server.mjs';
import { readCycles } from '../../tools/jarvis/voice-log.mjs';
import { createServer as createObs } from '../../tools/jev-obs/server.mjs';
import { paths } from '../../tools/jev-obs/sources.mjs';
import { wer, classify, PHRASES_ORDER } from '../../tools/jarvis/bench.mjs';
import { SERVICES } from '../../scripts/jev-stack.mjs';
import { toSpeech } from '../../tools/jarvis/lexicon.mjs';

const TMP = path.join('var', 'test-jarvis', String(process.pid));
const tmp = (t) => { const d = path.join(TMP, `${t}-${Math.random().toString(36).slice(2, 7)}`); fs.mkdirSync(d, { recursive: true }); return d; };
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function req(port, p, { method = 'GET', host = '127.0.0.1', headers = {}, body = null } = {}) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...headers } }, (x) => { const c = []; x.on('data', (d) => c.push(d)); x.on('end', () => { const b = Buffer.concat(c); res({ status: x.statusCode, type: x.headers['content-type'], buf: b, body: b.toString('utf8') }); }); });
    r.on('error', rej); if (body) r.write(body); r.end();
  });
}
// Fake voice: deterministic STT/TTS so the server contract is tested without models.
function fakeVoice({ available = true, transcript = 'onde está a call wall?', delay = 5 } = {}) {
  return {
    status: () => ({ available, status: available ? 'VOICE_READY' : 'VOICE_UNAVAILABLE(test)', stt: 'fake', tts: 'fake' }),
    async vadTrim(s) { return { samples: s, segments: 1 }; },
    async stt(s) { return { text: transcript, raw: transcript, ms: 12, audio_s: s.length / 16000, rtf: 0.01, model: 'fake' }; },
    synth(text) {
      let cancelled = false; const parts = sentences(text);
      return { engine: 'fake', parts, cancel() { cancelled = true; }, async *[Symbol.asyncIterator]() { for (let i = 0; i < parts.length && !cancelled; i++) { await new Promise((r) => setTimeout(r, delay)); if (cancelled) return; yield { i, samples: new Float32Array(160), sampleRate: 16000, ms: delay }; } } };
    },
    close() {},
  };
}
async function withServer(opts, fn) {
  const cfg = { ...loadJarvisConfig(), ...(opts.cfg || {}) };
  const srv = createJarvisServer({ cfg, alphaDir: opts.alphaDir || tmp('alpha-empty'), jarvisDir: opts.jarvisDir || tmp('jarvis'), voice: opts.voice || fakeVoice(), port: 0 });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try { return await fn(srv.address().port, srv); } finally { srv.close(); }
}
const json = (o) => JSON.stringify(o);

test('STT normalizer maps jargon variants to glossary terms and the 8 order phrases keep their intent', () => {
  assert.equal(normalizeTranscript('Onde está a colual?'), 'Onde está a Call Wall?');
  assert.equal(normalizeTranscript('Qual o reiro?'), 'Qual o HIRO?');
  assert.equal(normalizeTranscript('o NK está mais forte que o S.'), 'o NQ está mais forte que o ES.');
  assert.equal(normalizeTranscript('O bote está parcial.'), 'O bot está parcial.');
  assert.equal(normalizeTranscript('quanto custa'), 'quanto custa', 'common words untouched');
  for (const p of PHRASES_ORDER) assert.equal(route(normalizeTranscript(p)).intent, route(p).intent, p);
});
test('sentence splitter keeps decimals, splits long sentences for TTFA; wav/resample helpers', () => {
  assert.deepEqual(sentences('Call Wall em 7.800,25. Put Wall em 7.700.'), ['Call Wall em 7.800,25.', 'Put Wall em 7.700.']);
  const long = sentences('α Quant está desatualizado, há 10 minutos, a fonte reporta dados não ao vivo, sem leitura direcional válida e outras coisas.');
  assert.ok(long.length >= 2 && long.every((s) => s.length <= 80), JSON.stringify(long));
  const w = wav(new Float32Array([0, 0.5, -0.5]), 16000); assert.equal(w.toString('ascii', 0, 4), 'RIFF'); assert.equal(w.length, 44 + 6);
  assert.equal(resample(new Float32Array(22050), 22050, 16000).length, 16000);
  assert.equal(wer('qual o hiro', 'qual o hiro'), 0); assert.equal(wer('qual o hiro', 'qual o'), 1 / 3);
  assert.equal(classify('first_audio', 700), 'EXCELLENT'); assert.equal(classify('first_audio', 1600), 'TOO_SLOW');
});
test('voice layer degrades to VOICE_UNAVAILABLE (never false PASS) when models are missing', async () => {
  const v = createVoice(loadJarvisConfig(), { dir: tmp('no-models') });
  const st = v.status(); assert.equal(st.available, false); assert.match(st.status, /^VOICE_UNAVAILABLE\(/);
  await assert.rejects(() => v.stt(new Float32Array(16000)), /VOICE_UNAVAILABLE/); v.close();
});
test('server: localhost only, Host/Origin checks, token on every POST, zero order routes, no raw audio stored', async () => {
  const jd = tmp('jarvis');
  await withServer({ jarvisDir: jd }, async (port, srv) => {
    assert.equal((await req(port, '/api/health', { host: 'evil.example' })).status, 403);
    assert.equal((await req(port, '/api/health', { headers: { origin: 'http://evil.example' } })).status, 403);
    assert.equal((await req(port, '/api/health')).status, 200);
    const hud = await req(port, '/'); assert.equal(hud.status, 200); assert.ok(hud.body.includes(srv.token), 'HUD is same-origin with the token'); assert.ok(!hud.body.includes('__JARVIS_TOKEN__'));
    assert.equal((await req(port, '/api/ask', { method: 'POST', body: json({ text: 'resumo' }) })).status, 401);
    assert.equal((await req(port, '/api/ask', { method: 'POST', headers: { 'x-jarvis-token': 'x'.repeat(48) }, body: json({ text: 'resumo' }) })).status, 401);
    for (const p of ['/api/order', '/api/orders', '/api/trade', '/api/execute', '/api/send', '/api/nt8']) {
      assert.equal((await req(port, p, { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: '{}' })).status, 404, p);
      assert.equal((await req(port, p)).status, 404, p);
    }
    assert.equal((await req(port, '/api/ask', { method: 'PUT' })).status, 405); assert.equal((await req(port, '/api/ask', { method: 'DELETE' })).status, 405);
    const a = JSON.parse((await req(port, '/api/ask', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: json({ text: 'qual o HIRO?' }) })).body);
    assert.equal(a.schema, 'jarvis-answer/v1'); assert.equal(a.answer_text, 'Não tenho evidência suficiente para responder.'); assert.equal(a.mode, 'SHADOW_READ_ONLY');
    const pcm = Buffer.from(new Float32Array(16000).buffer);
    const b = JSON.parse((await req(port, '/api/ask-audio?speak=1', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: pcm })).body);
    assert.equal(b.stt.text, 'onde está a call wall?'); assert.equal(b.intent, 'LEVEL_QUERY');
    assert.equal((await req(port, '/api/ask-audio', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: Buffer.alloc(3) })).status, 400);
    assert.equal((await req(port, '/api/ask-audio', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: Buffer.alloc(16000 * 4 * 20) })).status, 413);
    const cy = readCycles(jd); assert.equal(cy.rows.length, 2);
    for (const r of cy.rows) { assert.ok(!('audio' in r) && !('samples' in r)); assert.equal(r.schema, 'jarvis-voice-cycle/v1'); }
    const files = fs.readdirSync(jd); assert.ok(!files.some((f) => /\.(wav|pcm|raw|f32)$/i.test(f)), files.join());
  });
});
test('server speech: sentence chunks stream as WAV; cancel (barge-in) stops synthesis and is logged; voice unavailable ⇒ 503 audio, text still works', async () => {
  const fx = path.join('var', 'alpha'); // live state when present; otherwise NO_EVIDENCE answers still produce speech
  await withServer({ alphaDir: fx, voice: fakeVoice({ delay: 30 }) }, async (port, srv) => {
    const a = JSON.parse((await req(port, '/api/ask?speak=1', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: json({ text: 'resumo do mercado' }) })).body);
    assert.ok(a.audio && a.audio.parts >= 1, JSON.stringify(a.audio));
    const c0 = await req(port, a.audio.chunks_url + '0'); assert.equal(c0.status, 200); assert.equal(c0.type, 'audio/wav'); assert.equal(c0.buf.toString('ascii', 0, 4), 'RIFF');
    const x = JSON.parse((await req(port, '/api/cancel', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: '{}' })).body);
    assert.ok(x.cancelled >= 0);
    const last = await req(port, a.audio.chunks_url + '99'); assert.equal(last.status, 204);
    const p = JSON.parse((await req(port, '/api/ask?speak=1', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: json({ text: 'pare' }) })).body);
    assert.equal(p.cancel, true); assert.equal(p.audio, null);
  });
  await withServer({ voice: fakeVoice({ available: false }) }, async (port, srv) => {
    assert.equal((await req(port, '/api/ask-audio', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: Buffer.from(new Float32Array(16000).buffer) })).status, 503);
    const t = JSON.parse((await req(port, '/api/ask?speak=1', { method: 'POST', headers: { 'x-jarvis-token': srv.token }, body: json({ text: 'resumo' }) })).body);
    assert.equal(t.audio, null); assert.equal(t.schema, 'jarvis-answer/v1');
  });
});
test('control plane JARVIS tab: GET /api/jarvis/{status,cycles,bench} read var/jarvis; POST 405; foreign Host 403', async () => {
  const jd = tmp('obs');
  fs.writeFileSync(path.join(jd, 'server.json'), json({ pid: 1, port: 3594, at: new Date().toISOString(), voice: 'VOICE_READY', mode: 'SHADOW_READ_ONLY' }));
  fs.writeFileSync(path.join(jd, `voice-cycles-${new Date().toISOString().slice(0, 10)}.ndjson`), json({ schema: 'jarvis-voice-cycle/v1', at: new Date().toISOString(), intent: 'LEVEL_QUERY', latency: { stt_ms: 300, first_audio_ms: 700 } }) + '\n');
  fs.writeFileSync(path.join(jd, 'bench-latest.json'), json({ schema: 'jarvis-bench/v1', selected: { stt: { model: 'whisper-base', threads: 2 }, tts: 'piper-faber' }, stt: { a: { samples: [1] } } }));
  const srv = createObs({ ...paths(), jarvisDir: jd }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const port = srv.address().port;
    const s = JSON.parse((await req(port, '/api/jarvis/status')).body); assert.equal(s.alive, true); assert.equal(s.url, 'http://127.0.0.1:3594/');
    const c = JSON.parse((await req(port, '/api/jarvis/cycles')).body); assert.equal(c.rows.length, 1); assert.equal(c.stages.stt_ms.p50, 300);
    const b = JSON.parse((await req(port, '/api/jarvis/bench')).body); assert.equal(b.selected.tts, 'piper-faber'); assert.ok(!b.stt.a.samples);
    assert.equal((await req(port, '/api/jarvis/status', { method: 'POST' })).status, 405);
    assert.equal((await req(port, '/api/jarvis/status', { host: 'evil.example' })).status, 403);
    assert.equal((await req(port, '/api/jarvis/nope')).status, 404);
    const app = fs.readFileSync(path.join('tools', 'jev-obs', 'public', 'app.js'), 'utf8'); assert.match(app, /'JARVIS'/); assert.doesNotMatch(app, /method:\s*'POST'/);
  } finally { srv.close(); }
});
test('security: jarvis code has no order paths, no shell in the request path, binds 127.0.0.1; stack script is loopback-only and never touches NT8/AOT/INVICTUS', () => {
  for (const f of ['server.mjs', 'voice.mjs', 'answer.mjs', 'tools.mjs', 'router.mjs', 'voice-log.mjs']) {
    const s = fs.readFileSync(path.join('tools', 'jarvis', f), 'utf8');
    assert.doesNotMatch(s, /child_process|execSync|execFile|spawn\(/, f);
    assert.doesNotMatch(s, /JEV_CAN_SEND_ORDER\s*=\s*true|placeOrder|submitOrder|\/api\/order/i, f);
  }
  const srv = fs.readFileSync(path.join('tools', 'jarvis', 'server.mjs'), 'utf8'); assert.match(srv, /HOST = '127\.0\.0\.1'/); assert.doesNotMatch(srv, /0\.0\.0\.0/);
  for (const s of SERVICES) { assert.ok(!s.health || s.health.startsWith('http://127.0.0.1:'), s.name); assert.ok(!s.args.join(' ').match(/nt8|aot|invictus|ijc/i), s.name); }
  const cfg = loadJarvisConfig(); assert.equal(cfg.server.host, '127.0.0.1'); assert.equal(cfg.privacy.store_raw_audio, false); assert.equal(cfg.input.wake_word.enabled, false);
  assert.match(toSpeech('Fusion BUY'), /compra/);
});
test('real voice models (when installed): VAD + Whisper + Piper round trip on one order phrase', { skip: !modelAvailable('piper-faber') || !modelAvailable('whisper-base') }, async () => {
  const cfg = loadJarvisConfig(); const v = createVoice(cfg);
  try {
    const ch = []; let sr = 0; for await (const c of v.synth(toSpeech('o quant está comprador?'), { engine: 'piper-faber' })) { ch.push(c.samples); sr = c.sampleRate; }
    const n = ch.reduce((a, x) => a + x.length, 0), x = new Float32Array(n); let o = 0; for (const c of ch) { x.set(c, o); o += c.length; }
    const t = await v.vadTrim(resample(x, sr, 16000)); assert.ok(t.segments >= 1);
    const r = await v.stt(t.samples, { model: 'whisper-base' }); assert.ok(r.text.length > 0); assert.equal(r.model, 'whisper-base');
    assert.match(r.text.toLowerCase(), /comprador/);
  } finally { v.close(); }
});
