// Alpha video knowledge: local speech-to-text for videos without captions.
// Reuses the JARVIS models (%LOCALAPPDATA%\jev-jarvis\models: Silero VAD + Whisper) and sherpa-onnx-node in THIS process;
// JARVIS code, config and running server are untouched. ffmpeg decodes audio to 16 kHz mono PCM (args array, no shell).
// Output segments carry exact sample-derived times. Zero network, zero cost.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { modelPaths, modelAvailable, normalizeTranscript } from '../jarvis/voice.mjs';

// STT correction layer: the JARVIS jargon fixes (read-only reuse) + vendor names; the raw text is always kept beside it.
const W = (p) => new RegExp(String.raw`(?<![\p{L}\d])(?:${p})(?![\p{L}\d])`, 'giu');
const VIDEO_FIX = [[W('k[aá]l+u[aá]|c[aá]l+u[aá]l?'), 'Call Wall'], [W('o[ií]ro|ai?ro'), 'HIRO'],[W('e?sp?ot+i? ?gam+a|spot gamma'), 'SpotGamma'], [W('g[eé]x ?b[oó]ti?|gex bot'), 'GexBot'], [W('quanti? ?data|quant data'), 'QuantData'], [W('d[ií]?l+ers?|delers|dilers'), 'dealers'],
  [W('jacks|jax'), 'GEX'], [W('data([- ])hedg(e|es|ed|ing)'), 'delta$1hedg$2'], [W('(buy|buying|sell|selling|short|long) a coal'), '$1 a call'], [W('q[- ]?mod[eo]rs?|rq models'), 'Q-Models']];
// A change of letter case only (the JARVIS normalizer lowercases) is not a correction: keep the original text.
const fixAll = (t) => VIDEO_FIX.reduce((x, [re, r]) => x.replace(re, r), normalizeTranscript(t));
export const correctTranscript = (t) => { const x = fixAll(t); return x.toLowerCase() === String(t).toLowerCase() ? t : x; };
const langOf = (r) => String(r.lang || '').replace(/[<|>]/g, '').trim() || null;
// Majority language of the first decoded segments; whisper auto-detect per short segment hallucinates other languages.
export function majorityLang(langs) { const n = {}; for (const l of langs) if (l) n[l] = (n[l] || 0) + 1; const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; return top ? { lang: top[0], votes: n } : { lang: null, votes: n }; }

const require = createRequire(import.meta.url);
let sherpa = null, loadErr = null;
try { sherpa = require('sherpa-onnx-node'); } catch (e) { loadErr = e.message.split('\n')[0]; }
const SR = 16000;

export function sttStatus(model = 'whisper-small') {
  const vad = modelAvailable('silero-vad'), stt = modelAvailable(model);
  return { available: !!sherpa && vad && stt, runtime: sherpa ? `sherpa-onnx ${sherpa.version}` : `unavailable: ${loadErr}`, vad, model, model_available: stt };
}

// ffmpeg ⇒ Float32Array 16 kHz mono for [start_s, end_s) (null = whole file).
export function decodeAudio(file, { start_s = null, end_s = null } = {}) {
  const args = ['-v', 'error', '-nostdin'];
  if (start_s != null) args.push('-ss', String(start_s));
  if (end_s != null) args.push('-to', String(end_s));
  args.push('-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1');
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { shell: false, windowsHide: true }); const chunks = []; let err = '';
    p.stdout.on('data', (c) => chunks.push(c)); p.stderr.on('data', (c) => { err += c; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg audio decode failed (${code}): ${err.slice(0, 300)}`));
      const buf = Buffer.concat(chunks); const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      resolve(Float32Array.from(f));
    });
  });
}

// samples ⇒ [{start_ms, end_ms, text, lang}] via Silero VAD segments + Whisper (language '' = auto-detect).
export async function transcribe(samples, { model = 'whisper-small', language = '', threads = 2, offset_ms = 0, vad = {} } = {}) {
  if (!sherpa) throw new Error(`STT_UNAVAILABLE(sherpa-onnx-node: ${loadErr})`);
  if (!modelAvailable('silero-vad') || !modelAvailable(model)) throw new Error(`STT_UNAVAILABLE(model missing: silero-vad/${model})`);
  const [enc, dec, tok] = modelPaths(model).files;
  const mk = (lang) => sherpa.OfflineRecognizer.createAsync({ featConfig: { sampleRate: SR, featureDim: 80 }, modelConfig: { whisper: { encoder: enc, decoder: dec, language: lang, task: 'transcribe', tailPaddings: -1 }, tokens: tok, numThreads: threads, provider: 'cpu', debug: 0 } });
  const v = new sherpa.Vad({ sileroVad: { model: modelPaths('silero-vad').files[0], threshold: vad.threshold ?? 0.5, minSilenceDuration: vad.min_silence_s ?? 0.5, minSpeechDuration: vad.min_speech_s ?? 0.25, maxSpeechDuration: vad.max_speech_s ?? 20, windowSize: 512 }, sampleRate: SR, numThreads: 1, debug: false }, 60);
  const raw = [];
  const drain = () => { while (!v.isEmpty()) { const s = v.front(false); raw.push({ start: s.start, samples: Float32Array.from(s.samples) }); v.pop(); } };
  for (let i = 0; i < samples.length; i += 512) { v.acceptWaveform(samples.subarray(i, i + 512)); drain(); }
  v.flush(); drain();
  let lock = language ? { lang: language, votes: null, forced: true } : null;
  if (!lock) { // language lock: vote on the first segments, then decode everything in that language
    const auto = await mk(''); const langs = [];
    for (const seg of raw.slice(0, 6)) { const st = auto.createStream(); st.acceptWaveform({ sampleRate: SR, samples: seg.samples }); await auto.decodeAsync(st); langs.push(langOf(auto.getResult(st))); }
    lock = { ...majorityLang(langs), forced: false };
  }
  const rec = await mk(lock.lang || '');
  const out = [];
  out.language_lock = lock;
  for (const seg of raw) {
    const s = rec.createStream(); s.acceptWaveform({ sampleRate: SR, samples: seg.samples });
    await rec.decodeAsync(s); const r = rec.getResult(s); const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const fixed = correctTranscript(text);
    out.push({ start_ms: offset_ms + Math.round((seg.start / SR) * 1000), end_ms: offset_ms + Math.round(((seg.start + seg.samples.length) / SR) * 1000), text: fixed, ...(fixed !== text ? { raw: text } : {}), lang: lock.lang || langOf(r) });
  }
  return out;
}
