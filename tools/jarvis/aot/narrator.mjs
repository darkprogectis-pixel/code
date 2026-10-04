// Narration over successive observations of ONE area (pure state machine; no I/O, no TTS — the server decides to speak).
// NARRATION_MODE: OFF (nothing spoken) · IMPORTANT (default: CRITICAL + MATERIAL) · VERBOSE (all, incl. MINOR drift).
// Dedup: same key+to_state inside the mode cooldown is suppressed; a CRITICAL change to a NEW state is never suppressed.
// Flap guard: ≥ 3 flips of one key in 120 s ⇒ a single "instável" event, then that key is quiet for 120 s (CRITICAL to a new state still passes).
// Rate limit: ≤ 1 utterance per 10 s per area; events in between are collapsed (latest per key) into the next utterance.
export const MODES = Object.freeze(['OFF', 'IMPORTANT', 'VERBOSE']);
export const COOLDOWN_MS = Object.freeze({ IMPORTANT: 120000, VERBOSE: 30000 });
export const FLAP_WINDOW_MS = 120000, FLAP_FLIPS = 3, SPEAK_GAP_MS = 10000;

const BAD = new Set(['STALE', 'MISSING', 'ERROR']);
const CRITICAL_KEY = /^(gate\.|sim\.(mode|side)$|sim\.entry_blocked$|(ES|NQ)\.decisao$|signal\.|matrix\.(ES|NQ)\.aggregate$)/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const show = (v) => (v === null || v === undefined ? 'sem dado' : String(v));
const thr = (t) => { const m = /^>\s*(-?\d+(\.\d+)?)/.exec(String(t || '')); return m ? Number(m[1]) : null; };

export function classify(p, n) {
  if (!p) return n.provenance === 'HISTORICAL_RECORD' && n.key.startsWith('trade.') ? { cls: 'MATERIAL', why: 'novo registro histórico' } : null;
  if (p.data_state !== n.data_state) {
    if (BAD.has(n.data_state)) return { cls: 'CRITICAL', why: `dado ${n.data_state}` };
    if (BAD.has(p.data_state)) return { cls: 'MATERIAL', why: `dado voltou (${n.data_state})` };
  }
  const changed = p.value !== n.value || p.state !== n.state;
  if (!changed) return null;
  if (CRITICAL_KEY.test(n.key)) return { cls: 'CRITICAL', why: 'mudança de estado' };
  const t = thr(n.threshold);
  if (t != null && isNum(p.value) && isNum(n.value) && (p.value > t) !== (n.value > t)) return { cls: 'MATERIAL', why: `cruzou ${n.threshold}` };
  if (isNum(n.value) && isNum(p.value) && p.state === n.state) return { cls: 'MINOR', why: 'variação' };
  return { cls: 'MATERIAL', why: 'mudança' };
}

export function eventText(e) {
  const tag = `[${e.provenance}${e.data_state && e.data_state !== 'LIVE' ? ` · ${e.data_state}` : ''}]`;
  if (e.why === 'instável') return `${e.label} está instável (${e.flips} mudanças em 2 min). ${tag}`;
  if (e.why === 'novo registro histórico') return `Novo registro histórico: ${e.label}, ${show(e.to)}${e.state ? `, motivo ${e.state}` : ''}. ${tag}`;
  return `${e.label}: ${show(e.from)} → ${show(e.to)}${e.state ? ` (${e.state})` : ''}${e.why.startsWith('dado') || e.why.startsWith('cruzou') ? ` — ${e.why}` : ''}. ${tag}`;
}

export function createNarrator({ mode = 'IMPORTANT', now = () => Date.now() } = {}) {
  if (!MODES.includes(mode)) throw new Error(`mode ${mode}`);
  let prev = null, lastSpoken = -Infinity;
  const seen = new Map(), flips = new Map(), quietUntil = new Map(), pending = new Map();
  const st = { get mode() { return mode; }, setMode(m) { if (!MODES.includes(m)) throw new Error(`mode ${m}`); mode = m; } };

  st.step = (obs) => {
    const t = now(); const events = [];
    const pm = new Map((prev?.items || []).map((i) => [i.key, i]));
    if (prev) for (const n of obs.items) {
      const p = pm.get(n.key); const c = classify(p, n); if (!c) continue;
      const to = `${n.value}|${n.state}|${n.data_state}`;
      // flap guard
      const fl = (flips.get(n.key) || []).filter((x) => t - x < FLAP_WINDOW_MS); if (c.cls !== 'MINOR') fl.push(t); flips.set(n.key, fl); // numeric drift is not a flip
      const newState = !seen.has(`${n.key}|${to}`);
      if ((quietUntil.get(n.key) || 0) > t && !(c.cls === 'CRITICAL' && newState)) continue;
      const base = { key: n.key, label: n.label, from: p ? p.value : null, to: n.value, state: n.state, data_state: n.data_state, provenance: n.provenance, source: n.source, at: new Date(t).toISOString() };
      if (fl.length >= FLAP_FLIPS && c.cls !== 'CRITICAL') { quietUntil.set(n.key, t + FLAP_WINDOW_MS); events.push({ ...base, cls: 'MATERIAL', why: 'instável', flips: fl.length }); continue; }
      const cd = COOLDOWN_MS[mode] ?? COOLDOWN_MS.IMPORTANT;
      const last = seen.get(`${n.key}|${to}`);
      if (last != null && t - last < cd) continue;
      seen.set(`${n.key}|${to}`, t);
      events.push({ ...base, cls: c.cls, why: c.why });
    }
    prev = obs;
    for (const e of events) e.text = eventText(e);
    const audible = mode === 'OFF' ? [] : events.filter((e) => mode === 'VERBOSE' || e.cls !== 'MINOR');
    for (const e of audible) pending.set(e.key, e);
    let utterance = null;
    if (pending.size && t - lastSpoken >= SPEAK_GAP_MS) {
      const list = [...pending.values()].sort((a, b) => (a.cls === 'CRITICAL' ? 0 : 1) - (b.cls === 'CRITICAL' ? 0 : 1));
      utterance = { text: list.map((e) => e.text).join(' '), events: list.map((e) => e.key) };
      pending.clear(); lastSpoken = t;
    }
    return { mode, events, audible: audible.map((e) => e.key), utterance };
  };
  return st;
}

// One-shot description of the current state of an area (used when a button is first selected and for "o que está acontecendo").
export function summarize(obs, { max = 8 } = {}) {
  if (!obs.aot_available) return `AOT indisponível para ${obs.label}: ${obs.failed.map((f) => `${f.endpoint} (${f.error})`).join(', ')}. Nada é inventado. [AOT_STATE · ERROR]`;
  const bad = obs.items.filter((i) => BAD.has(i.data_state));
  const head = obs.items.filter((i) => !BAD.has(i.data_state)).slice(0, max).map((i) => `${i.label}: ${show(i.value)}${i.state ? ` (${i.state})` : ''} [${i.provenance}${i.data_state !== 'LIVE' ? ` · ${i.data_state}` : ''}]`);
  const tail = bad.length ? ` Sem dado válido em: ${bad.slice(0, 6).map((i) => `${i.label} (${i.data_state})`).join(', ')}.` : '';
  return `${obs.label}. ${head.join('; ')}.${tail}`;
}
