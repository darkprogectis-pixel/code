#!/usr/bin/env node
// JARVIS automatic benchmark (no human action): TTS (TTFA, RTF, duration, CPU/RAM) per engine; STT by TTS→STT round trip
// over the 8 phrases of the order + 12 general (latency, RTF, WER, glossary hit rate, intent preservation) per model/threads;
// barge-in (cancel → silence); E2E text and audio cycles (p50/p95/p99) classified against the proposal §16 budget.
//   node tools/jarvis/bench.mjs [--quick] [--out var/jarvis/bench-<ts>.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice, resample } from './voice.mjs';
import { toSpeech } from './lexicon.mjs';
import { route, norm } from './router.mjs';
import { ask } from './answer.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PHRASES_ORDER = ['onde está a call wall?', 'qual o HIRO?', 'como está a pressão de charm?', 'o gamma virou?', 'o quant está comprador?', 'o bot está parcial?', 'qual é o sinal do fusion?', 'o NQ está mais forte que o ES?'];
export const PHRASES_GENERAL = ['onde fica a put wall?', 'qual o zero gamma?', 'status das fontes', 'resumo do mercado', 'por que o fusion está sem sinal?', 'o data está vendedor?', 'histórico do sinal', 'o menthorq está online?', 'compare o quant com o gamma', 'qual o regime de gamma?', 'o sinal mudou?', 'pare'];
const GLOSSARY = ['call wall', 'put wall', 'hiro', 'charm', 'gamma', 'quant', 'bot', 'fusion', 'nq', 'es', 'menthorq', 'data', 'zero gamma'];
// §16 budget (ms): [EXCELLENT ≤, ACCEPTABLE ≤]
export const BUDGET = { stt_final: [400, 900], tts_first: [150, 400], route: [5, 20], answer: [10, 50], first_audio: [800, 1500], barge_in: [100, 250] };
export const classify = (k, ms) => (ms == null ? 'N/A' : ms <= BUDGET[k][0] ? 'EXCELLENT' : ms <= BUDGET[k][1] ? 'ACCEPTABLE' : 'TOO_SLOW');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const pct = (a) => ({ n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), p99: q(a, 0.99), max: a.length ? Math.max(...a) : null });
// Word error rate (Levenshtein on normalized words).
export function wer(ref, hyp) {
  const r = norm(ref).split(' ').filter(Boolean), h = norm(hyp).split(' ').filter(Boolean);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]); for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}
const cat = (chunks) => { const n = chunks.reduce((a, x) => a + x.length, 0), x = new Float32Array(n); let o = 0; for (const c of chunks) { x.set(c, o); o += c.length; } return x; };
function meter() { const c0 = process.cpuUsage(), t0 = performance.now(); let rss = process.memoryUsage().rss; const iv = setInterval(() => { rss = Math.max(rss, process.memoryUsage().rss); }, 50);
  return () => { clearInterval(iv); const c = process.cpuUsage(c0), wall = performance.now() - t0; return { cpu_pct_of_one_core: Math.round(((c.user + c.system) / 1000 / wall) * 100), rss_peak_mb: Math.round(rss / 1048576) }; }; }

async function synthAll(v, text, engine) {
  const t0 = performance.now(); let first = null; const chunks = []; let sr = 0;
  for await (const c of v.synth(text, { engine })) { first ??= performance.now() - t0; chunks.push(c.samples); sr = c.sampleRate; }
  const x = cat(chunks); return { samples: x, sampleRate: sr, first_ms: Math.round(first), total_ms: Math.round(performance.now() - t0), dur_s: x.length / sr };
}

export async function runBench({ quick = false, cfg, log = console.log } = {}) {
  cfg = cfg || JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'jarvis.json'), 'utf8'));
  const phrases = quick ? PHRASES_ORDER : [...PHRASES_ORDER, ...PHRASES_GENERAL];
  const out = { schema: 'jarvis-bench/v1', at: new Date().toISOString(), host: { cpus: (await import('node:os')).cpus().length, cpu: (await import('node:os')).cpus()[0].model, provider: 'cpu', vram_used_by_jarvis: 0 }, tts: {}, stt: {}, barge_in: null, e2e: {}, classification: {} };
  // TTS: warm-up once per engine, then per-phrase TTFA on the spoken form of real answers.
  const answers = phrases.map((p) => ask(p, { dir: path.join(REPO, cfg.alpha_dir) }).tts_text);
  const refAudio = {};
  for (const eng of quick ? ['piper-faber', 'kokoro-int8'] : ['piper-faber', 'piper-jeff', 'kokoro-int8']) {
    const v = createVoice({ ...cfg, voice: { ...cfg.voice, num_threads: cfg.voice.num_threads } });
    try {
      const tl = performance.now(); await synthAll(v, 'ok.', eng); const load_ms = Math.round(performance.now() - tl);
      const m = meter(), first = [], rtf = [];
      for (const a of answers) { const r = await synthAll(v, a, eng); first.push(r.first_ms); rtf.push(r.total_ms / 1000 / r.dur_s); }
      // Spoken prompts for the STT round trip (the question itself, as a user would say it).
      refAudio[eng] = []; for (const p of phrases) { const r = await synthAll(v, toSpeech(p), eng); refAudio[eng].push(resample(r.samples, r.sampleRate, 16000)); }
      out.tts[eng] = { load_ms, ttfa_ms: pct(first), rtf: pct(rtf.map((x) => Math.round(x * 1000) / 1000)), ...m(), class: classify('tts_first', q(first, 0.5)) };
      log(`TTS ${eng}`, JSON.stringify(out.tts[eng]));
    } catch (e) { out.tts[eng] = { error: e.message }; log(`TTS ${eng} ERR ${e.message}`); }
    v.close();
  }
  // STT: each model × threads on Kokoro- and Piper-voiced prompts.
  const voices = Object.keys(refAudio);
  for (const model of quick ? ['whisper-base', 'whisper-small'] : ['whisper-base', 'whisper-small']) for (const th of [2, 4]) {
    const v = createVoice({ ...cfg, voice: { ...cfg.voice, num_threads: th } }), key = `${model}@${th}t`;
    try {
      await v.stt(refAudio[voices[0]][0], { model });
      const m = meter(), lat = [], rtf = [], W = [], gl = { hit: 0, n: 0 }, intentOk = [], intentRaw = []; const samples = [];
      for (const vo of voices) for (let i = 0; i < phrases.length; i++) {
        const a = await v.vadTrim(refAudio[vo][i]); const r = await v.stt(a.samples, { model });
        lat.push(r.ms); rtf.push(r.rtf); W.push(wer(phrases[i], r.text));
        for (const g of GLOSSARY) if (new RegExp(`(^| )${g}( |$)`).test(norm(phrases[i]))) { gl.n++; if (new RegExp(`(^| )${g}( |$)`).test(norm(r.text))) gl.hit++; }
        intentOk.push(route(r.text).intent === route(phrases[i]).intent); intentRaw.push(route(r.raw).intent === route(phrases[i]).intent); if (samples.length < 40) samples.push({ voice: vo, ref: phrases[i], hyp: r.text, raw: r.raw, ms: r.ms });
      }
      out.stt[key] = { model, threads: th, latency_ms: pct(lat), rtf: pct(rtf), wer_mean: Math.round((W.reduce((a, b) => a + b, 0) / W.length) * 1000) / 1000, glossary_hit_rate: gl.n ? Math.round((gl.hit / gl.n) * 1000) / 1000 : null,
        intent_preserved: Math.round((intentOk.filter(Boolean).length / intentOk.length) * 1000) / 1000, intent_preserved_raw_no_normalizer: Math.round((intentRaw.filter(Boolean).length / intentRaw.length) * 1000) / 1000, note: 'normalizer variants were derived from this same synthetic phrase set ⇒ intent_preserved is optimistic; raw is the unbiased figure', ...m(), class: classify('stt_final', q(lat, 0.5)), samples };
      log(`STT ${key}`, JSON.stringify({ ...out.stt[key], samples: undefined }));
    } catch (e) { out.stt[key] = { error: e.message }; log(`STT ${key} ERR ${e.message}`); }
    v.close();
  }
  // Pick defaults: STT = best intent preservation, then lowest p50; TTS = Kokoro if its glossary round trip is best, else fastest.
  const sttBest = Object.entries(out.stt).filter(([, s]) => !s.error).sort((a, b) => b[1].intent_preserved - a[1].intent_preserved || a[1].latency_ms.p50 - b[1].latency_ms.p50)[0];
  const ttsByStt = {}; // glossary hit per TTS voice using the chosen STT
  if (sttBest) {
    const v = createVoice({ ...cfg, voice: { ...cfg.voice, num_threads: sttBest[1].threads } });
    for (const vo of voices) { let ok = 0; for (let i = 0; i < phrases.length; i++) { const r = await v.stt((await v.vadTrim(refAudio[vo][i])).samples, { model: sttBest[1].model }); if (route(r.text).intent === route(phrases[i]).intent) ok++; } ttsByStt[vo] = Math.round((ok / phrases.length) * 1000) / 1000; }
    v.close();
  }
  out.tts_intelligibility_intent_preserved = ttsByStt;
  out.selected = { stt: sttBest ? { model: sttBest[1].model, threads: sttBest[1].threads } : null,
    tts: Object.entries(out.tts).filter(([, t]) => !t.error && t.class !== 'TOO_SLOW').sort((a, b) => (ttsByStt[b[0]] ?? 0) - (ttsByStt[a[0]] ?? 0) || a[1].ttfa_ms.p50 - b[1].ttfa_ms.p50)[0]?.[0] ?? null };
  // Barge-in: cancel after the first chunk of a long answer ⇒ time until the synthesis loop stops (server side); HUD stops playback locally.
  if (out.selected.tts) {
    const v = createVoice(cfg), times = []; const long = toSpeech(ask('resumo do mercado', { dir: path.join(REPO, cfg.alpha_dir) }).answer_text + ' ' + PHRASES_GENERAL.join('. '));
    await synthAll(v, 'ok.', out.selected.tts);
    for (let k = 0; k < (quick ? 3 : 10); k++) { const s = v.synth(long, { engine: out.selected.tts }); let t; for await (const c of s) { void c; t = performance.now(); s.cancel(); } times.push(Math.round(performance.now() - t)); }
    out.barge_in = { server_cancel_ms: pct(times), class: classify('barge_in', q(times, 0.95)), note: 'browser playback stop is local (AudioBufferSourceNode.stop) and does not wait for the server' };
    // E2E text cycle: route+tools+NLG then first TTS chunk; audio cycle adds VAD+STT with the selected model.
    const route_ms = [], answer_ms = [], first_text = [], first_audio = [];
    const vs = createVoice({ ...cfg, voice: { ...cfg.voice, num_threads: out.selected.stt?.threads ?? 2 } });
    for (let rep = 0; rep < (quick ? 1 : 3); rep++) for (let i = 0; i < phrases.length; i++) {
      const t0 = performance.now(); const r0 = performance.now(); route(phrases[i]); route_ms.push(performance.now() - r0);
      const a = ask(phrases[i], { dir: path.join(REPO, cfg.alpha_dir) }); answer_ms.push(a.latency_ms);
      if (a.cancel) continue;
      const s = v.synth(a.tts_text, { engine: out.selected.tts }); for await (const c of s) { void c; s.cancel(); } first_text.push(Math.round(performance.now() - t0));
      if (rep === 0 && out.selected.stt) {
        const ta = performance.now(); const tr = await vs.vadTrim(refAudio[out.selected.tts][i]); const st = await vs.stt(tr.samples, { model: out.selected.stt.model });
        const b = ask(st.text, { dir: path.join(REPO, cfg.alpha_dir) }); const s2 = v.synth(b.tts_text, { engine: out.selected.tts }); for await (const c of s2) { void c; s2.cancel(); }
        first_audio.push(Math.round(performance.now() - ta));
      }
    }
    v.close(); vs.close();
    out.e2e = { route_ms: pct(route_ms.map((x) => Math.round(x * 100) / 100)), answer_ms: pct(answer_ms), text_to_first_audio_ms: pct(first_text), speech_end_to_first_audio_ms: pct(first_audio) };
    out.classification = { route: classify('route', out.e2e.route_ms.p95), answer: classify('answer', out.e2e.answer_ms.p95), tts_first: classify('tts_first', out.tts[out.selected.tts].ttfa_ms.p50),
      stt_final: sttBest ? classify('stt_final', sttBest[1].latency_ms.p50) : 'N/A', text_first_audio: classify('first_audio', out.e2e.text_to_first_audio_ms.p50), voice_first_audio: classify('first_audio', out.e2e.speech_end_to_first_audio_ms.p50), barge_in: out.barge_in.class };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quick = process.argv.includes('--quick'), i = process.argv.indexOf('--out');
  const file = i > 0 ? process.argv[i + 1] : path.join(REPO, 'var', 'jarvis', `bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  runBench({ quick }).then((r) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(r, null, 2)); fs.writeFileSync(path.join(path.dirname(file), 'bench-latest.json'), JSON.stringify(r, null, 2));
    console.log('selected', JSON.stringify(r.selected), 'classification', JSON.stringify(r.classification), '\n', file); }, (e) => { console.error(e); process.exit(1); });
}
