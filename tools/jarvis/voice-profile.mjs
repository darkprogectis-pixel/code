// JARVIS voice profile (local DSP, pure JS, no imports, no I/O). Applied per synthesized sentence inside voice.synth():
// Float32 samples in ⇒ Float32 samples out. ROBOTIC = pitch-down resample (duration compensated via TTS speed) → high-pass →
// presence peak → subtle ring modulation + short comb (metallic tint) → soft-knee compressor → gain → soft limiter.
// NATURAL (identity) returns the input array untouched. Defaults/ranges: PROPOSAL R2 §4.
export const VOICES = ['piper-faber', 'piper-jeff', 'kokoro-int8'];
export const NATURAL = Object.freeze({ name: 'NATURAL', voice: 'piper-faber', rate: 1.0, pitch: 1.0, gain: 1.0, robotic_effect_strength: 0, eq: { highpass_hz: 0, presence_db: 0 }, compressor: { enabled: false } });

const RANGES = {
  rate: [0.8, 1.2], pitch: [0.85, 1.0], gain: [0.5, 1.5], robotic_effect_strength: [0, 0.5], ring_hz: [30, 90], comb_ms: [3, 10], limiter_ceiling: [0.7, 0.95],
  'eq.highpass_hz': [60, 150], 'eq.presence_db': [0, 4], 'eq.presence_hz': [1500, 4000], 'eq.presence_q': [0.5, 2],
  'compressor.threshold_db': [-30, -10], 'compressor.ratio': [1, 4], 'compressor.attack_ms': [1, 20], 'compressor.release_ms': [30, 300], 'compressor.makeup_db': [0, 6],
};
const DEF = { ring_hz: 60, comb_ms: 6, limiter_ceiling: 0.89, eq: { highpass_hz: 0, presence_hz: 2500, presence_db: 0, presence_q: 1.0 }, compressor: { enabled: false, threshold_db: -18, ratio: 3, attack_ms: 5, release_ms: 80, makeup_db: 3 } };

// Clamps every parameter into its safe range. ⇒ {profile, warnings[]}
export function validateProfile(p0 = {}) {
  const warnings = [];
  const p = { ...NATURAL, ...DEF, ...p0, eq: { ...DEF.eq, ...(p0.eq || {}) }, compressor: { ...DEF.compressor, ...(p0.compressor || {}) } };
  const get = (k) => k.split('.').reduce((o, x) => o?.[x], p);
  const put = (k, v) => { const ks = k.split('.'); if (ks.length === 1) p[k] = v; else p[ks[0]][ks[1]] = v; };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    let v = Number(get(k));
    if (k === 'eq.highpass_hz' && v === 0) continue; // 0 = off
    if (!Number.isFinite(v)) { warnings.push(`${k} invalid ⇒ default`); v = k.includes('.') ? DEF[k.split('.')[0]][k.split('.')[1]] : (DEF[k] ?? NATURAL[k]); }
    if (v < lo || v > hi) { warnings.push(`${k}=${v} clamped to [${lo}, ${hi}]`); v = Math.min(hi, Math.max(lo, v)); }
    put(k, v);
  }
  if (!VOICES.includes(p.voice)) { warnings.push(`voice ${p.voice} unknown ⇒ piper-faber`); p.voice = 'piper-faber'; }
  return { profile: p, warnings };
}

// name: env JARVIS_VOICE_PROFILE > cfg.voice.profile > NATURAL. Unknown ⇒ NATURAL + warning.
export function resolveProfile(cfg = {}, env = {}) {
  const V = cfg.voice || {}, name = String(env.JARVIS_VOICE_PROFILE || V.profile || 'NATURAL').toUpperCase();
  const all = V.profiles || {};
  if (name !== 'NATURAL' && !all[name]) { const r = validateProfile(all.NATURAL || NATURAL); return { profile: { ...r.profile, name: 'NATURAL' }, warnings: [`profile ${name} not found ⇒ NATURAL`, ...r.warnings] }; }
  const r = validateProfile(all[name] || NATURAL); return { profile: { ...r.profile, name }, warnings: r.warnings };
}

export const isIdentity = (p) => !p || (p.pitch === 1 && p.gain === 1 && !(p.robotic_effect_strength > 0) && !(p.eq?.highpass_hz > 0) && !(p.eq?.presence_db > 0) && !p.compressor?.enabled);
// TTS speed handed to sherpa: rate / pitch compensates the duration stretch of the pitch resample.
export const ttsSpeed = (p, base = 1.0) => (isIdentity(p) ? base : Math.min(2, Math.max(0.5, p.rate / p.pitch)));

function biquad(x, b0, b1, b2, a0, a1, a2) { // RBJ direct form I, in place
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = B0 * v + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
}
function highpass(x, sr, f) { const w = 2 * Math.PI * f / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2); biquad(x, (1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al); }
function peaking(x, sr, f, db, q) { const A = 10 ** (db / 40), w = 2 * Math.PI * f / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q); biquad(x, 1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A); }

export function applyProfile(input, sr, p) {
  if (isIdentity(p)) return input;
  // 1. pitch: read the input slower (ratio p.pitch < 1) ⇒ lower pitch and formants; length grows by 1/pitch.
  let x;
  if (p.pitch !== 1) { const n = Math.floor(input.length / p.pitch); x = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i * p.pitch, k = Math.floor(t), f = t - k; x[i] = (input[k] ?? 0) * (1 - f) + (input[k + 1] ?? input[k] ?? 0) * f; } }
  else x = Float32Array.from(input);
  // 2–3. EQ
  if (p.eq.highpass_hz > 0) highpass(x, sr, p.eq.highpass_hz);
  if (p.eq.presence_db > 0) peaking(x, sr, p.eq.presence_hz, p.eq.presence_db, p.eq.presence_q);
  // 4. metallic tint (subtle): ring modulation + IIR comb
  const s = p.robotic_effect_strength;
  if (s > 0) {
    const wet = s * 0.5, w = 2 * Math.PI * p.ring_hz / sr;
    let sn = 0, cs = 1; const cw = Math.cos(w), sw = Math.sin(w); // rotating phasor instead of Math.sin per sample
    for (let i = 0; i < x.length; i++) { x[i] = x[i] * (1 - wet) + x[i] * sn * wet; const t = sn * cw + cs * sw; cs = cs * cw - sn * sw; sn = t; }
    const d = Math.max(1, Math.round(p.comb_ms * sr / 1000)), fb = s * 0.6, mix = s * 0.5, c = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) { c[i] = x[i] + (i >= d ? fb * c[i - d] : 0); x[i] = x[i] * (1 - mix) + c[i] * mix * (1 - fb); }
  }
  // 5. compressor (feed-forward peak detector, 6 dB soft knee)
  const C = p.compressor;
  if (C.enabled) {
    const at = Math.exp(-1 / (sr * C.attack_ms / 1000)), rl = Math.exp(-1 / (sr * C.release_ms / 1000)), T = C.threshold_db, R = C.ratio, K = 6, mk = 10 ** (C.makeup_db / 20);
    let env = 0, gain = mk;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]); env = a > env ? at * env + (1 - at) * a : rl * env + (1 - rl) * a;
      if ((i & 7) === 0) { // gain computed every 8 samples (≤ 0.4 ms at 22 kHz)
        const o = 20 * Math.log10(env + 1e-9) - T;
        const gr = o <= -K / 2 ? 0 : o >= K / 2 ? o * (1 - 1 / R) : ((o + K / 2) ** 2 / (2 * K)) * (1 - 1 / R);
        gain = Math.exp(-gr * 0.11512925464970229) * mk; // 10^(-gr/20)
      }
      x[i] *= gain;
    }
  }
  // 6–7. gain + soft limiter (never exceeds the ceiling)
  const g = p.gain, cl = p.limiter_ceiling;
  for (let i = 0; i < x.length; i++) x[i] = cl * Math.tanh((x[i] * g) / cl);
  return x;
}
