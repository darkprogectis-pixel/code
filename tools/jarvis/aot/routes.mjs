// JARVIS /aot pages and /api/aot/* routes (R2). Mounted by tools/jarvis/server.mjs; same origin as JARVIS (no CORS, loopback only).
// GET  /aot · /aot/alfabot · /aot/indicadores (token-injected pages) · /aot/aot-ui.js · /aot/alfabot-explain.mjs
// GET  /api/aot/areas · /api/aot/observe?area=&enrich=1 · /api/aot/signal · /api/aot/catalog
// POST /api/aot/ask {area,text,speak} · /api/aot/narrate {area,mode,speak,cid}   (token checked by the server before calling post())
// Reads AOT only through the GET-allowlist adapter; nothing here writes to AOT, the Consolidator, NT8 or any order path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, ALFABOT, areaById } from './areas.mjs';
import { createAotAdapter } from './adapter.mjs';
import { extract, withPrev } from './context.mjs';
import { createNarrator, summarize, MODES } from './narrator.mjs';
import { explain } from './alfabot-explain.mjs';
import { answer } from './qa.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
export const CATALOG_JSON = path.join(REPO, 'context', 'jev-future', 'alfaomega', 'ALFA_OMEGA_INDICATOR_CATALOG.json');
const PAGES = { '/aot': 'aot.html', '/aot/alfabot': 'alfabot.html', '/aot/indicadores': 'indicadores.html' };
const ASSETS = { '/aot/aot-ui.js': [path.join(HERE, 'public', 'aot-ui.js'), 'text/javascript; charset=utf-8'], '/aot/alfabot-explain.mjs': [path.join(HERE, 'alfabot-explain.mjs'), 'text/javascript; charset=utf-8'] };
export const spoken = (t) => String(t).replace(/\s*\[[A-Z_ ·]+\]/g, '').replace(/\s+/g, ' ').trim(); // provenance tags are shown, not spoken

export function createAotRoutes({ cfg = {}, token, adapter, speak = () => null, knowledge = null, catalogFile = CATALOG_JSON, now = () => Date.now(), maxNarrators = 32 } = {}) {
  adapter = adapter || createAotAdapter({ base: cfg.aot?.base, now });
  const narrators = new Map(); const lastObs = new Map();
  const page = (f) => fs.readFileSync(path.join(HERE, 'public', f), 'utf8').replace(/__JARVIS_TOKEN__/g, token);
  const catalog = () => { try { return JSON.parse(fs.readFileSync(catalogFile, 'utf8')); } catch { return { schema: 'alfa-omega-indicator-catalog/v1', status: 'NOT_BUILT', indicators: [] }; } };

  async function observe(areaId) {
    const a = areaById(areaId); if (!a || a.id === 'ALFABOT') throw Object.assign(new Error('area'), { code: 400 });
    const raws = await adapter.area(a);
    const obs = withPrev(extract(a.id, raws, { now: now() }), lastObs.get(a.id));
    lastObs.set(a.id, obs);
    return { obs, raws };
  }
  async function signal() {
    const [al, st] = await Promise.all([adapter.get('/api/alfabot-signal'), adapter.get('/state')]);
    return explain({ alfabot: al.ok ? al.body : null, state: st.ok ? st.body : null, alfabotError: al.ok ? null : al.error, stateError: st.ok ? null : st.error, now: now() });
  }
  // skills enrichment: separate array; never mutates the observation (AOTJ07)
  function enrich(obs) {
    if (!knowledge) return [];
    const words = obs.items.map((i) => i.label).join(' ');
    try { return knowledge(words).slice(0, 4).map((r) => ({ ...r, provenance: r.source === 'MENTHORQ' ? 'MENTHORQ_KNOWLEDGE' : 'SPOTGAMMA_KNOWLEDGE' })); } catch { return []; }
  }

  async function get(u, send) {
    const p = u.pathname;
    if (PAGES[p]) return send(200, page(PAGES[p]), 'text/html; charset=utf-8');
    if (ASSETS[p]) return send(200, fs.readFileSync(ASSETS[p][0], 'utf8'), ASSETS[p][1]);
    if (p === '/api/aot/areas') return send(200, { areas: AREAS, alfabot: ALFABOT, modes: MODES, default_mode: cfg.aot?.narration_mode || 'IMPORTANT', aot_origin: adapter.origin, mode: 'SHADOW_READ_ONLY' });
    if (p === '/api/aot/observe') {
      const { obs } = await observe(u.searchParams.get('area'));
      return send(200, { observation: obs, knowledge: u.searchParams.get('enrich') === '1' ? enrich(obs) : [] });
    }
    if (p === '/api/aot/signal') return send(200, await signal());
    if (p === '/api/aot/catalog') return send(200, catalog());
    return send(404, { error: 'not found' });
  }

  async function post(u, body, send) {
    let b; try { b = JSON.parse(body.toString('utf8') || '{}'); } catch { return send(400, { error: 'json' }); }
    const area = String(b.area || '').toUpperCase();
    if (u.pathname === '/api/aot/ask') {
      const text = String(b.text || '').slice(0, 500); if (!text) return send(400, { error: 'text' });
      let obs = null, matrix = null, history = null;
      if (area === 'ALFABOT') matrix = await signal();
      else if (areaById(area)) { const r = await observe(area); obs = r.obs; if (area === 'HISTORY') history = r.raws['/history?days=2']?.body ?? null; }
      if (!matrix && /sinal|signal|alfabot|invalid|condic|falt/.test(text.toLowerCase())) matrix = await signal().catch(() => null);
      const a = answer({ text, area: area || null, observation: obs, matrix, catalog: catalog().indicators || [], history, knowledge });
      return send(200, { ...a, audio: b.speak ? speak(spoken(a.answer_text), { intent: `AOT_${a.intent}` }) : null });
    }
    if (u.pathname === '/api/aot/narrate') {
      const mode = MODES.includes(b.mode) ? b.mode : (cfg.aot?.narration_mode || 'IMPORTANT');
      const key = `${area}|${String(b.cid || 'default').slice(0, 32)}`;
      let n = narrators.get(key); const first = !n;
      if (!n) { if (narrators.size >= maxNarrators) narrators.delete(narrators.keys().next().value); n = createNarrator({ mode, now }); narrators.set(key, n); }
      n.setMode(mode);
      let step, text = null;
      if (area === 'ALFABOT') {
        const m = await signal();
        const obs = { area: 'ALFABOT', label: ALFABOT.label, aot_available: true, failed: [], items: Object.values(m.symbols).map((s) => ({ key: `matrix.${s.symbol}.aggregate`, label: `ALFABOT ${s.symbol}`, value: s.signal, state: s.blocking_conditions[0]?.id ?? null, data_state: s.freshness, provenance: 'DERIVED_CALCULATION', source: 'α Quant', endpoint: '/api/alfabot-signal' })) };
        step = n.step(obs); if (first && mode !== 'OFF') text = Object.values(m.symbols).map((s) => `ALFABOT ${s.symbol}: ${s.signal}. ${s.why_not || s.why_now}`).join(' ');
      } else {
        const { obs } = await observe(area); step = n.step(obs);
        if (first && mode !== 'OFF') text = summarize(obs);
      }
      if (!text && step.utterance) text = step.utterance.text;
      const audio = b.speak && text && mode !== 'OFF' ? speak(spoken(text), { intent: `AOT_NARRATE_${area}` }) : null;
      return send(200, { area, mode, first, events: step.events, utterance: text, audio });
    }
    return send(404, { error: 'not found' });
  }

  async function handle(req, u, send, body) {
    try { return req.method === 'GET' ? await get(u, send) : await post(u, body, send); }
    catch (e) { return send(e.code === 400 ? 400 : 502, { error: e.code === 400 ? 'unknown area' : 'aot unavailable', detail: String(e.message).slice(0, 160) }); }
  }
  return { handle, adapter, observe, signal };
}

export const isAotPath = (p) => p === '/aot' || p.startsWith('/aot/') || p.startsWith('/api/aot/');
export const AOT_POSTS = ['/api/aot/ask', '/api/aot/narrate'];
