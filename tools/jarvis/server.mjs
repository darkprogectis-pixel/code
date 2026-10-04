#!/usr/bin/env node
// JARVIS server — SHADOW / READ-ONLY voice+text assistant over the Alpha state.
//   node tools/jarvis/server.mjs [--port 3594]      stop: Ctrl+C
// Binds ONLY 127.0.0.1; rejects foreign Host/Origin. The only POSTs are "ask" (text/audio) and "cancel" (stops speech);
// both require the local token (var/jarvis/token) and neither changes market, trading, AOT, INVICTUS or NT8 state.
// Visual state bus (avatar/HUD): GET /api/ui-state, GET /api/events (SSE, one-way), POST /api/ui-state {state, cycle?} (token) —
// the POST only sets the in-memory visual state (tools/jarvis/ui-state.mjs); nothing is forwarded or executed.
// There are no order routes and no order tools. Raw audio is never stored.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ask, createMemory } from './answer.mjs';
import { createVoice, wav } from './voice.mjs';
import { createVoiceLog, readCycles } from './voice-log.mjs';
import { createUiState, parseUiPost } from './ui-state.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
export const HOST = '127.0.0.1';
export const loadJarvisConfig = (f = path.join(REPO, 'config', 'jarvis.json')) => JSON.parse(fs.readFileSync(f, 'utf8'));
const abs = (p) => (path.isAbsolute(p) ? p : path.join(REPO, p));

export function ensureToken(dir) {
  const f = path.join(dir, 'token'); fs.mkdirSync(dir, { recursive: true });
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (/^[a-f0-9]{48}$/.test(t)) return t; } catch { /* create */ }
  const t = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(f, t, { mode: 0o600 }); return t;
}

export function createJarvisServer({ cfg = loadJarvisConfig(), alphaDir, jarvisDir, voice, port = cfg.server.port, ui, sseMax = 8, pingMs = 15000 } = {}) {
  alphaDir = alphaDir || abs(cfg.alpha_dir); jarvisDir = jarvisDir || abs(cfg.jarvis_dir);
  const token = ensureToken(jarvisDir);
  voice = voice || createVoice(cfg);
  const log = createVoiceLog(jarvisDir, { storeTranscript: cfg.privacy?.store_transcript !== false });
  const memory = createMemory(cfg.memory?.ephemeral_ttl_ms ?? 300000);
  const jobs = new Map(); // voice_cycle_id ⇒ {chunks, done, err, synth, waiters, rec, t0, at}
  const okOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const HUD = fs.readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
  const maxBody = cfg.server.max_body_bytes ?? 2000000;
  ui = ui || createUiState();
  const sse = new Set(); // open SSE responses (≤ sseMax)
  const sseWrite = (res, ev, data) => { try { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ } };
  ui.subscribe((st) => { for (const r of sse) sseWrite(r, 'state', st); });
  const ping = setInterval(() => { const at = new Date().toISOString(); for (const r of sse) sseWrite(r, 'ping', { at }); }, pingMs); ping.unref?.();

  function finish(job) {
    if (job.logged) return; job.logged = true;
    const L = job.rec.latency; if (job.tts_first_ms != null) { L.tts_first_ms = job.tts_first_ms; L.first_audio_ms = Math.round(job.first_audio_at - job.t0); }
    L.total_ms = Math.round(performance.now() - job.t0); job.rec.barge_in = !!job.cancelled; job.rec.tts_engine = job.synth?.engine ?? null;
    if (job.err) job.rec.errors.push(job.err);
    log.write(job.rec);
  }
  function startSpeech(job, text) {
    try { job.synth = voice.synth(text); } catch (e) { job.err = String(e.message); job.done = true; ui.set('ERROR', { cycle: job.rec.voice_cycle_id }); return finish(job); }
    (async () => {
      try {
        for await (const c of job.synth) {
          if (job.tts_first_ms == null) { job.tts_first_ms = c.ms; job.first_audio_at = performance.now(); job.rec.voice_profile = c.profile ?? null; }
          if (c.profile_error) job.rec.profile_error = c.profile_error;
          job.chunks.push(wav(c.samples, c.sampleRate)); job.wake();
        }
      } catch (e) { job.err = String(e.message).slice(0, 200); }
      job.done = true; job.wake(); finish(job);
      if (job.err && !job.cancelled) ui.set('ERROR', { cycle: job.rec.voice_cycle_id });
    })();
  }
  function cycle({ text, transcript = null, stt = null, speak, mode, t0 }) {
    const a = ask(text, { memory, dir: alphaDir });
    const rec = { voice_cycle_id: a.voice_cycle_id, mode, transcript: transcript ?? text, intent: a.intent, agent_sources: a.sources, confidence: a.confidence, fresh: a.fresh,
      unsupported_n: a.unsupported_claims.length, no_evidence: /^Não tenho evidência suficiente/.test(a.answer_text), answer_text: a.answer_text, stt,
      latency: { stt_ms: stt?.ms ?? null, answer_ms: a.latency_ms }, errors: [],
      knowledge: a.knowledge?.obs ?? null }; // skill retrieval: intent, selected_skills, sources, hit, evidence_count, confidence, retrieval_ms (no corpus text)
    const job = { chunks: [], done: false, waiters: [], served: [], rec, t0, at: Date.now(), wake() { for (const w of job.waiters.splice(0)) w(); } };
    jobs.set(a.voice_cycle_id, job);
    for (const [k, j] of jobs) if (Date.now() - j.at > 120000) { j.synth?.cancel(); jobs.delete(k); }
    const canSpeak = speak && voice.status().available && !a.cancel;
    if (a.cancel) for (const [k, j] of jobs) if (k !== a.voice_cycle_id && !j.done) { j.cancelled = true; j.synth?.cancel(); }
    if (canSpeak) startSpeech(job, a.tts_text); else { job.done = true; finish(job); ui.set('IDLE', { cycle: a.voice_cycle_id }); } // with speech: the player posts SPEAKING/IDLE
    return { ...a, stt, audio: canSpeak ? { chunks_url: `/api/audio/${a.voice_cycle_id}/`, parts: job.synth?.parts.length ?? 0, engine: job.synth?.engine ?? null } : null };
  }

  const srv = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    try {
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!['127.0.0.1', 'localhost'].includes(host)) return send(403, { error: 'forbidden host' });
      if (req.headers.origin && !okOrigins.has(req.headers.origin)) return send(403, { error: 'forbidden origin' });
      const u = new URL(req.url, `http://${HOST}`);
      if (req.method === 'GET') {
        if (u.pathname === '/') return send(200, HUD.replace('__JARVIS_TOKEN__', token), 'text/html; charset=utf-8');
        if (u.pathname === '/api/health') return send(200, { ok: true, mode: 'SHADOW_READ_ONLY', bind: HOST, pid: process.pid, voice: voice.status().status, at: new Date().toISOString() });
        if (u.pathname === '/api/status') return send(200, { mode: 'SHADOW_READ_ONLY', voice: voice.status(), input: cfg.input, privacy: cfg.privacy, alpha_dir: path.relative(REPO, alphaDir) });
        if (u.pathname === '/api/ui-state') return send(200, ui.get());
        if (u.pathname === '/api/events') {
          if (sse.size >= sseMax) return send(503, { error: 'too many ui clients' });
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
          res.write('retry: 2000\n\n'); sseWrite(res, 'state', ui.get()); sse.add(res);
          req.on('close', () => sse.delete(res)); return;
        }
        if (u.pathname === '/api/cycles') return send(200, readCycles(jarvisDir, Math.max(1, Math.min(2000, Number(u.searchParams.get('limit')) || 100))));
        const m = u.pathname.match(/^\/api\/audio\/(jv-[a-f0-9]{8})\/(\d{1,3})$/);
        if (m) {
          const job = jobs.get(m[1]); if (!job) return send(404, { error: 'no such cycle' });
          const n = Number(m[2]), dl = Date.now() + 15000;
          while (job.chunks.length <= n && !job.done && Date.now() < dl) await new Promise((r) => { job.waiters.push(r); setTimeout(r, 1000); });
          if (job.chunks[n]) { job.served.push({ n, at: Date.now() }); return send(200, job.chunks[n], 'audio/wav'); }
          return job.done ? send(204, '') : send(504, { error: 'tts timeout' });
        }
        return send(404, { error: 'not found' });
      }
      if (req.method !== 'POST') return send(405, { error: 'GET/POST only' });
      if (!['/api/ask', '/api/ask-audio', '/api/cancel', '/api/ui-state'].includes(u.pathname)) return send(404, { error: 'not found' });
      const tk = String(req.headers['x-jarvis-token'] || '');
      if (tk.length !== token.length || !crypto.timingSafeEqual(Buffer.from(tk), Buffer.from(token))) return send(401, { error: 'token required' });
      const chunks = []; let size = 0; const limit = u.pathname === '/api/ui-state' ? 256 : maxBody;
      for await (const c of req) { size += c.length; if (size > limit) return send(413, { error: 'body too large' }); chunks.push(c); }
      const body = Buffer.concat(chunks), t0 = performance.now(), speak = u.searchParams.get('speak') === '1';
      if (u.pathname === '/api/ui-state') { // visual state only: validated enum + cycle id, nothing else is read or forwarded
        const p = parseUiPost(body.toString('utf8'));
        if (!p.ok) return send(p.code, { error: p.error });
        return send(200, { ok: true, seq: ui.set(p.state, { source: 'client', cycle: p.cycle }).seq });
      }
      if (u.pathname === '/api/cancel') {
        let n = 0; for (const j of jobs.values()) if (!j.done) { j.cancelled = true; j.synth?.cancel(); n++; }
        return send(200, { cancelled: n });
      }
      if (u.pathname === '/api/ask') {
        let text; try { text = String(JSON.parse(body.toString('utf8')).text || '').slice(0, 500); } catch { return send(400, { error: 'json {text}' }); }
        ui.set('THINKING');
        return send(200, cycle({ text, speak, mode: 'text', t0 }));
      }
      // /api/ask-audio: raw Float32 little-endian mono 16 kHz
      if (body.length % 4 || body.length < 1600 * 4) return send(400, { error: 'f32le 16 kHz mono, ≥ 0.1 s' });
      if (body.length / 4 / 16000 > (cfg.server.max_audio_seconds ?? 15)) return send(413, { error: 'audio too long' });
      const st = voice.status(); if (!st.available) return send(503, { error: st.status });
      ui.set('THINKING');
      const samples = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
      const v = await voice.vadTrim(samples);
      const r = await voice.stt(v.samples);
      return send(200, cycle({ text: r.text, transcript: r.text, stt: { ...r, vad_segments: v.segments }, speak, mode: u.searchParams.get('mode') === 'wake' ? 'wake' : 'ptt', t0 }));
    } catch (e) { ui.set('ERROR'); return send(500, { error: 'internal', detail: String(e.message || e).slice(0, 200) }); }
  });
  srv.token = token; srv.voice = voice; srv.jobs = jobs; srv.ui = ui; srv.sse = sse;
  const close0 = srv.close.bind(srv);
  srv.close = (cb) => { clearInterval(ping); for (const r of sse) { try { r.end(); } catch { /* gone */ } } sse.clear(); return close0(cb); };
  srv.on('close', () => { voice.close?.(); ui.close?.(); });
  return srv;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadJarvisConfig(); const i = process.argv.indexOf('--port'); const port = i > 0 ? Number(process.argv[i + 1]) : Number(process.env.JARVIS_PORT || cfg.server.port);
  const srv = createJarvisServer({ cfg, port }); const dir = abs(cfg.jarvis_dir);
  const beat = () => fs.writeFileSync(path.join(dir, 'server.json'), JSON.stringify({ pid: process.pid, port, at: new Date().toISOString(), voice: srv.voice.status().status, mode: 'SHADOW_READ_ONLY' }));
  srv.listen(port, HOST, () => { beat(); setInterval(beat, 15000).unref(); console.log(`JARVIS (SHADOW_READ_ONLY) http://${HOST}:${port}/ — voz: ${srv.voice.status().status} — Ctrl+C para parar`); });
  const stop = () => { srv.close(); process.exit(0); }; process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
