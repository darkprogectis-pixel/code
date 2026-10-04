// JARVIS voice layer (optional): VAD (Silero) + STT (Whisper) + TTS (Piper/Kokoro) via sherpa-onnx-node, CPU, loaded on demand,
// unloaded after idle. If the dependency or a model is missing the layer reports VOICE_UNAVAILABLE(<reason>) and the text core
// keeps working. Models live outside the repo (tools/jarvis/install-models.mjs ⇒ %LOCALAPPDATA%\jev-jarvis\models).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MODELS_DIR } from './install-models.mjs';
import { resolveProfile, applyProfile, ttsSpeed, isIdentity } from './voice-profile.mjs';

const require = createRequire(import.meta.url);
let sherpa = null, loadErr = null;
try { sherpa = require('sherpa-onnx-node'); } catch (e) { loadErr = e.message.split('\n')[0]; }

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
// Model id ⇒ sherpa config builder (paths relative to MODELS_DIR).
export function modelPaths(id, dir = MODELS_DIR) {
  const d = (x) => path.join(dir, x);
  switch (id) {
    case 'silero-vad': return { files: [d('silero_vad.onnx')] };
    case 'whisper-small': case 'whisper-base': case 'whisper-tiny': {
      const n = id.split('-')[1], b = d(`sherpa-onnx-whisper-${n}`);
      return { files: [path.join(b, `${n}-encoder.int8.onnx`), path.join(b, `${n}-decoder.int8.onnx`), path.join(b, `${n}-tokens.txt`)] };
    }
    case 'piper-faber': case 'piper-jeff': {
      const b = d(`vits-piper-pt_BR-${id.split('-')[1]}-medium`);
      return { files: [path.join(b, `pt_BR-${id.split('-')[1]}-medium.onnx`), path.join(b, 'tokens.txt'), path.join(b, 'espeak-ng-data')] };
    }
    case 'kokoro-int8': { const b = d('kokoro-int8-multi-lang-v1_0'); return { files: [path.join(b, 'model.int8.onnx'), path.join(b, 'voices.bin'), path.join(b, 'tokens.txt'), path.join(b, 'espeak-ng-data')] }; }
    default: return { files: [] };
  }
}
export function modelAvailable(id, dir) { const p = modelPaths(id, dir); return p.files.length > 0 && p.files.every(exists); }

function sttConfig(id, threads, language, dir) {
  const [enc, dec, tok] = modelPaths(id, dir).files;
  return { featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig: { whisper: { encoder: enc, decoder: dec, language, task: 'transcribe', tailPaddings: -1 }, tokens: tok, numThreads: threads, provider: 'cpu', debug: 0 } };
}
function ttsConfig(id, threads, dir) {
  const f = modelPaths(id, dir).files;
  if (id.startsWith('piper')) return { model: { vits: { model: f[0], tokens: f[1], dataDir: f[2] }, numThreads: threads, provider: 'cpu', debug: false }, maxNumSentences: 1 };
  return { model: { kokoro: { model: f[0], voices: f[1], tokens: f[2], dataDir: f[3], lang: 'pt-br' }, numThreads: threads, provider: 'cpu', debug: false }, maxNumSentences: 1 };
}

// pt-BR sentence split for streaming synthesis (keeps decimals like "7,5" together).
// Long sentences are further split at ", " so the first audio chunk stays short (TTFA).
export const sentences = (t, max = 70) => String(t).split(/(?<=[.;!?])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean).flatMap((s) => {
  if (s.length <= max) return [s];
  const out = []; let cur = '';
  for (const p of s.split(/(?<=,)\s+/)) { if (cur && (cur + ' ' + p).length > max) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p; }
  if (cur) out.push(cur); return out;
});
// Float32 mono ⇒ 16-bit PCM WAV buffer.
export function wav(samples, sampleRate) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}
// Linear resampler (TTS 22.05/24 kHz ⇒ 16 kHz for the round-trip bench; browser input is already 16 kHz).
export function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor(x.length * to / from), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f; }
  return y;
}

// Post-STT glossary normalizer: frequent Whisper spellings of the jargon ⇒ canonical terms (restricted list, no free fuzzy).
// Variants observed in the synthetic TTS→STT bench (Whisper base/small, Piper/Kokoro voices) + phonetic spellings of the lexicon.
// Unicode-aware word boundaries (\b does not handle accented letters).
const W = (alts, flags = 'giu') => new RegExp(`(?<![\\p{L}\\d])(?:${alts})(?![\\p{L}\\d])`, flags);
const STT_FIX = [
  [W('c[oó]l+ ?(?:u|w)?[oó]l+|colual|col[oô]|cold? wall|call ?w[oa]l+|cool wall|gest[aá]culo wal|wal'), 'Call Wall'],
  [W('p[uú]t+i? ?(?:u|w)[oó]l+|put ?w[oa]l+|pute wall|p[uú]ti? ?[oó]l'), 'Put Wall'],
  [W('r[aá]i?r[oó]u?|h[aá]i?r[oó]u?|hiru|hiro|hero|hyrule|rairo|airo|hado|haido|reiro|r[eé]iro'), 'HIRO'],
  [W('tch?arm|charme|xarm|char|tcharam|tch[aá]rmi?'), 'charm'],
  [W('gamavir(?:os|oz|ou)|gama viro[sz]|programa v'), 'gamma virou'], [W('gama|gamma'), 'gamma'],
  [W('fi[uú]j?[oõ]n|fus[aã]o|fusion|f[ií](?=\\s*[.?!]?$)'), 'fusion'], [W('cu[oó]nt|quanti?|quante'), 'quant'],
  [W('b[oó]ti?|bote|botista'), 'bot'], [W('ene qu[eê]|n ?q|nk|enrique|winnie kiss'), 'NQ'], [W('[eé] [eé]ss?e'), 'ES'], [/(?<![\p{L}\d])(do|no|o|que o) S(?![\p{L}\d])/gu, '$1 ES'],
  [W('mentor ?q|menthor ?q|mentor que'), 'MenthorQ'],
];
export const normalizeTranscript = (t) => STT_FIX.reduce((s, [re, r]) => s.replace(re, r), String(t || '')).replace(/\s+/g, ' ').trim();

export function createVoice(cfg = {}, { dir = MODELS_DIR, now = () => Date.now(), env = process.env } = {}) {
  const V = cfg.voice || {}, threads = V.num_threads ?? 2, idle = V.unload_after_idle_ms ?? 600000;
  const prof = resolveProfile(cfg, env); // single central voice profile (config voice.profile / JARVIS_VOICE_PROFILE)
  const cache = new Map(); // id ⇒ {obj, used}
  const gc = setInterval(() => { for (const [k, v] of cache) if (now() - v.used > idle) cache.delete(k); }, Math.min(idle, 60000)); gc.unref?.();
  const reason = () => (!sherpa ? `sherpa-onnx-node: ${loadErr}` : null);
  async function get(id, make) {
    let c = cache.get(id); if (c) { c.used = now(); return c.obj; }
    if (!sherpa) throw new Error(`VOICE_UNAVAILABLE(${reason()})`);
    if (!modelAvailable(id, dir)) throw new Error(`VOICE_UNAVAILABLE(model ${id} not installed)`);
    const obj = await make(); cache.set(id, { obj, used: now() }); return obj;
  }
  const self = {
    status() {
      const ids = ['silero-vad', V.stt?.model, V.stt?.fallback, V.tts?.engine, ...(V.tts?.alternatives || [])].filter(Boolean);
      const models = Object.fromEntries(ids.map((i) => [i, modelAvailable(i, dir)]));
      const stt = [V.stt?.model, V.stt?.fallback].find((i) => models[i]) || null, tts = [V.tts?.engine, ...(V.tts?.alternatives || [])].find((i) => models[i]) || null;
      const ok = !!sherpa && V.enabled !== false && !!stt && !!tts;
      return { profile: prof.profile.name, profile_warnings: prof.warnings, available: ok, status: ok ? 'VOICE_READY' : `VOICE_UNAVAILABLE(${reason() || (V.enabled === false ? 'disabled' : !stt ? 'no STT model' : 'no TTS model')})`, runtime: sherpa ? `sherpa-onnx ${sherpa.version}` : null, stt, tts, models, loaded: [...cache.keys()], models_dir: dir };
    },
    // samples: Float32Array 16 kHz mono ⇒ {text, raw, ms, audio_s, rtf, model}
    async stt(samples, { model } = {}) {
      const id = model || self.status().stt; if (!id) throw new Error(`VOICE_UNAVAILABLE(no STT model)`);
      const rec = await get(id, () => sherpa.OfflineRecognizer.createAsync(sttConfig(id, threads, V.stt?.language || 'pt', dir)));
      const t0 = performance.now(), s = rec.createStream(); s.acceptWaveform({ sampleRate: 16000, samples });
      await rec.decodeAsync(s); const raw = rec.getResult(s).text.trim(), ms = performance.now() - t0, audio_s = samples.length / 16000;
      return { text: normalizeTranscript(raw), raw, ms: Math.round(ms), audio_s: Math.round(audio_s * 100) / 100, rtf: audio_s ? Math.round((ms / 1000 / audio_s) * 1000) / 1000 : null, model: id };
    },
    // Trims leading/trailing silence with Silero; returns the speech-only samples (or the input if VAD finds nothing).
    async vadTrim(samples) {
      const vcfg = { sileroVad: { model: modelPaths('silero-vad', dir).files[0], threshold: V.vad?.threshold ?? 0.5, minSilenceDuration: V.vad?.min_silence_s ?? 0.4, minSpeechDuration: V.vad?.min_speech_s ?? 0.2, windowSize: 512 }, sampleRate: 16000, numThreads: 1, debug: false };
      if (!sherpa || !modelAvailable('silero-vad', dir)) return { samples, segments: null };
      const vad = new sherpa.Vad(vcfg, 30), segs = [];
      for (let i = 0; i < samples.length; i += 512) { vad.acceptWaveform(samples.subarray(i, i + 512)); while (!vad.isEmpty()) { segs.push(vad.front(false)); vad.pop(); } }
      vad.flush(); while (!vad.isEmpty()) { segs.push(vad.front(false)); vad.pop(); }
      if (!segs.length) return { samples, segments: 0 };
      const total = segs.reduce((a, s) => a + s.samples.length, 0), out = new Float32Array(total); let o = 0; for (const s of segs) { out.set(s.samples, o); o += s.samples.length; }
      return { samples: out, segments: segs.length };
    },
    // text ⇒ async iterator of per-sentence chunks {i, samples, sampleRate, ms}; cancel() aborts between/within sentences.
    // profile: ROBOTIC/NATURAL (voice-profile.mjs) applied per sentence; a DSP failure falls back to the raw TTS samples.
    synth(text, { engine, profile } = {}) {
      const p = profile || prof.profile;
      const id = engine || (!isIdentity(p) && modelAvailable(p.voice, dir) ? p.voice : self.status().tts); let cancelled = false;
      const parts = sentences(text);
      async function* run() {
        if (!id) throw new Error('VOICE_UNAVAILABLE(no TTS model)');
        const tts = await get(id, () => sherpa.OfflineTts.createAsync(ttsConfig(id, threads, dir)));
        for (let i = 0; i < parts.length && !cancelled; i++) {
          const t0 = performance.now();
          const a = await tts.generateAsync({ text: parts[i], sid: id === 'kokoro-int8' ? (V.tts?.kokoro_sid ?? 0) : 0, speed: ttsSpeed(p, V.tts?.speed ?? 1.0), onProgress: () => (cancelled ? 0 : 1) });
          if (cancelled) return;
          const ms = Math.round(performance.now() - t0), d0 = performance.now(); let samples = a.samples, profile_error = null;
          try { samples = applyProfile(a.samples, a.sampleRate, p); } catch (e) { profile_error = String(e.message).slice(0, 120); }
          yield { i, n: parts.length, samples, sampleRate: a.sampleRate, ms, engine: id, profile: p.name, dsp_ms: Math.round((performance.now() - d0) * 10) / 10, profile_error };
        }
      }
      return { engine: id, parts, cancel() { cancelled = true; }, get cancelled() { return cancelled; }, [Symbol.asyncIterator]: run };
    },
    unload() { cache.clear(); },
    close() { clearInterval(gc); cache.clear(); },
  };
  return self;
}
