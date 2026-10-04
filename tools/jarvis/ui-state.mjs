// JARVIS UI state bus (visual only). States: IDLE | LISTENING | THINKING | SPEAKING | ERROR.
// Holds 5 in-memory fields and broadcasts them to SSE subscribers (avatar / HUD). No imports, no I/O, no forwarding:
// nothing here can reach the answer pipeline, tools, files, shell, orders or trading. Contract: PROPOSAL R2 §3.
export const UI_STATES = Object.freeze(['IDLE', 'LISTENING', 'THINKING', 'SPEAKING', 'ERROR']);
export const CYCLE_RE = /^jv-[a-f0-9]{8}$/;

// Validates a client POST body (string). ⇒ {ok:true, state, cycle} | {ok:false, code, error}
export function parseUiPost(text, maxBytes = 256) {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return { ok: false, code: 413, error: 'body too large' };
  let b; try { b = JSON.parse(text); } catch { return { ok: false, code: 400, error: 'json {state, cycle?}' }; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, code: 400, error: 'json object required' };
  for (const k of Object.keys(b)) if (k !== 'state' && k !== 'cycle') return { ok: false, code: 400, error: 'only state, cycle allowed' };
  if (!UI_STATES.includes(b.state)) return { ok: false, code: 400, error: `state must be one of ${UI_STATES.join('|')}` };
  const cycle = b.cycle ?? null;
  if (cycle !== null && !(typeof cycle === 'string' && CYCLE_RE.test(cycle))) return { ok: false, code: 400, error: 'cycle must be jv-xxxxxxxx or null' };
  return { ok: true, state: b.state, cycle };
}

// staleMs: THINKING/SPEAKING without update ⇒ IDLE (client died mid-cycle); errorMs: ERROR ⇒ IDLE. Safety nets only.
export function createUiState({ staleMs = 30000, errorMs = 5000, now = () => Date.now() } = {}) {
  let cur = { state: 'IDLE', seq: 0, cycle: null, source: 'core', at: new Date(now()).toISOString() };
  const subs = new Set();
  let guard = null;
  const snapshot = () => ({ schema: 'jarvis-ui-state/v1', ...cur });
  function arm() {
    if (guard) { clearTimeout(guard); guard = null; }
    const ms = cur.state === 'ERROR' ? errorMs : (cur.state === 'THINKING' || cur.state === 'SPEAKING') ? staleMs : 0;
    if (ms > 0) { const seq = cur.seq; guard = setTimeout(() => { if (cur.seq === seq) set('IDLE', { source: 'core', cycle: cur.cycle }); }, ms); guard.unref?.(); }
  }
  function set(state, { source = 'core', cycle = null } = {}) {
    if (!UI_STATES.includes(state)) throw new Error(`invalid ui state ${state}`);
    cur = { state, seq: cur.seq + 1, cycle: cycle ?? null, source: source === 'client' ? 'client' : 'core', at: new Date(now()).toISOString() };
    arm();
    const s = snapshot();
    for (const fn of subs) { try { fn(s); } catch { /* subscriber errors never affect the core */ } }
    return s;
  }
  return {
    get: snapshot, set,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    get clients() { return subs.size; },
    close() { if (guard) clearTimeout(guard); subs.clear(); },
  };
}
