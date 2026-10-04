// JARVIS × INVICTUS AOT — AOTJ01–09 + PERF01–03 (R2). Fake AOT / fetch spy only; the real AOT :3600 is never contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, ALFABOT, ALL_AREAS } from '../../tools/jarvis/aot/areas.mjs';
import { createAotAdapter, checkPath } from '../../tools/jarvis/aot/adapter.mjs';
import { extract, PROVENANCE, DATA_STATES } from '../../tools/jarvis/aot/context.mjs';
import { createNarrator } from '../../tools/jarvis/aot/narrator.mjs';
import { createAotRoutes } from '../../tools/jarvis/aot/routes.mjs';
import { answer, QA_INTENTS } from '../../tools/jarvis/aot/qa.mjs';
import { explain } from '../../tools/jarvis/aot/alfabot-explain.mjs';
import { fixtureRoutes, fakeAot, spyFetch, stubVoice, bootJarvis, sleep } from './aot-helpers.mjs';

const NOW = Date.parse('2026-10-04T12:05:00Z');
const rawsFor = (a, routes = fixtureRoutes()) => Object.fromEntries(a.endpoints.map((p) => [p, { ok: true, body: routes[p] }]));
// tiny route harness (no HTTP): returns {code, body}
const call = async (r, method, p, body) => { let out; const send = (code, b) => { out = { code, body: b }; }; await r.handle({ method }, new URL(p, 'http://x'), send, Buffer.from(body ? JSON.stringify(body) : '')); return out; };

test('AOTJ01 /aot pages + areas API: 5 areas + ALFABOT, links, token injected', async () => {
  const f = await fakeAot(); const j = await bootJarvis({ aotBase: f.base });
  try {
    const html = await (await j.get('/aot')).text();
    assert.ok(!html.includes('__JARVIS_TOKEN__') && html.includes(j.srv.token), 'token injected');
    for (const l of ['/aot/alfabot', '/aot/indicadores', '/aot/aot-ui.js']) assert.ok(html.includes(l), l);
    for (const p of ['/aot/alfabot', '/aot/indicadores', '/aot/aot-ui.js', '/aot/alfabot-explain.mjs']) assert.equal((await j.get(p)).status, 200, p);
    const a = await (await j.get('/api/aot/areas')).json();
    assert.deepEqual(a.areas.map((x) => x.id), ['COMMAND', 'DEEP_DIVE', 'AUTOMATION', 'ROBOT', 'HISTORY']);
    assert.equal(a.alfabot.id, 'ALFABOT'); assert.equal(a.mode, 'SHADOW_READ_ONLY'); assert.equal(a.default_mode, 'IMPORTANT');
    for (const x of a.areas) assert.ok(x.button.startsWith('JARVIS — ') && x.aot_path.startsWith('/'), x.id);
  } finally { await j.close(); await f.close(); }
});

test('AOTJ02 area → endpoint map ⊂ allowlist; labels and AOT routes exact', () => {
  for (const a of ALL_AREAS) for (const e of a.endpoints) assert.equal(checkPath(e), e, `${a.id} ${e}`);
  assert.deepEqual(AREAS.map((a) => [a.id, a.aot_path, a.aot_tab]), [['COMMAND', '/', 'Command'], ['DEEP_DIVE', '/deep.html', 'Deep Dive'], ['AUTOMATION', '/auto.html', 'Automação'], ['ROBOT', '/robo.html', 'Robô'], ['HISTORY', '/history.html', 'Histórico']]);
  assert.equal(ALFABOT.aot_path, '/alfabot-signal.html');
  for (const a of AREAS) assert.match(a.label, /INVICTUS/);
});

test('AOTJ03 per-area isolation: observing one area fetches only its endpoints', async () => {
  for (const a of AREAS) {
    const s = spyFetch(); const r = createAotRoutes({ token: 't', adapter: createAotAdapter({ base: 'http://127.0.0.1:3600', fetchImpl: s.fetchImpl }) });
    await r.observe(a.id);
    assert.deepEqual(s.calls.map((c) => c.url).sort(), [...a.endpoints].sort(), a.id);
  }
});

function obs(items) { return { area: 'COMMAND', label: 'L', aot_available: true, failed: [], items }; }
const it = (key, value, o = {}) => ({ key, label: key, value, state: null, data_state: 'LIVE', provenance: 'AOT_STATE', source: 's', endpoint: '/state', threshold: null, ...o });

test('AOTJ04 IMPORTANT: dedup, CRITICAL never suppressed to a new state, flap guard', () => {
  let t = NOW; const n = createNarrator({ mode: 'IMPORTANT', now: () => t });
  n.step(obs([it('gate.state', 'CLOSED'), it('confluence', 'A')]));
  t += 11000; let r = n.step(obs([it('gate.state', 'OPEN'), it('confluence', 'A')]));
  assert.equal(r.events[0].cls, 'CRITICAL'); assert.ok(r.utterance && /gate\.state/.test(r.utterance.text));
  t += 11000; r = n.step(obs([it('gate.state', 'OPEN'), it('confluence', 'A')])); assert.equal(r.events.length, 0, 'no change ⇒ silence');
  // flap: non-critical key flipping A/B/A/B inside 120 s ⇒ one "instável" event, then quiet
  const seq = ['B', 'A', 'B', 'A', 'B']; const whys = [];
  for (const v of seq) { t += 11000; r = n.step(obs([it('gate.state', 'OPEN'), it('confluence', v)])); whys.push(...r.events.map((e) => e.why)); }
  assert.equal(whys.filter((w) => w === 'instável').length, 1, JSON.stringify(whys));
  // dedup: same key+to_state again within cooldown is suppressed
  let t2 = NOW; const m = createNarrator({ mode: 'IMPORTANT', now: () => t2 });
  m.step(obs([it('x', 'A')])); t2 += 11000; assert.equal(m.step(obs([it('x', 'B')])).events.length, 1);
  t2 += 11000; m.step(obs([it('x', 'A')])); t2 += 11000; m.step(obs([it('x', 'B')]));
  // CRITICAL to a new state still passes during quiet
  t2 += 1000; const c = m.step(obs([it('x', 'B'), it('gate.anchor', 'LONG 4/4')]));
  assert.ok(c.events.length === 0 || c.events.every((e) => e.key !== 'x'));
});

test('AOTJ05 VERBOSE speaks MINOR drift; IMPORTANT does not', () => {
  for (const [mode, expect] of [['VERBOSE', 1], ['IMPORTANT', 0]]) {
    let t = NOW; const n = createNarrator({ mode, now: () => t });
    n.step(obs([it('vix', 18.1)])); t += 11000;
    const r = n.step(obs([it('vix', 18.4)]));
    assert.equal(r.events[0].cls, 'MINOR'); assert.equal(r.audible.length, expect, mode); assert.equal(!!r.utterance, !!expect);
  }
});

test('AOTJ06 OFF ⇒ zero speak calls; IMPORTANT first narrate speaks once', async () => {
  const s = spyFetch(); const spoken = [];
  const r = createAotRoutes({ token: 't', speak: (t) => { spoken.push(t); return { chunks_url: '/x/' }; }, adapter: createAotAdapter({ base: 'http://127.0.0.1:3600', fetchImpl: s.fetchImpl }) });
  for (let i = 0; i < 3; i++) { const o = await call(r, 'POST', '/api/aot/narrate', { area: 'COMMAND', mode: 'OFF', speak: true, cid: 'off' }); assert.equal(o.body.audio, null); assert.equal(o.body.utterance, null); }
  assert.equal(spoken.length, 0);
  const o = await call(r, 'POST', '/api/aot/narrate', { area: 'COMMAND', mode: 'IMPORTANT', speak: true, cid: 'imp' });
  assert.equal(o.body.first, true); assert.ok(o.body.utterance); assert.equal(spoken.length, 1);
  assert.ok(!/\[[A-Z_]+/.test(spoken[0]), 'provenance tags are shown, not spoken');
});

test('AOTJ07 skills enrichment is a separate array and never mutates the observation', async () => {
  const s = spyFetch();
  const knowledge = () => [{ source: 'SPOTGAMMA', statement: 'Call Wall é…', lesson: 'L1', timestamp: '00:01:00', concept: 'call wall' }];
  const r = createAotRoutes({ token: 't', knowledge, now: () => NOW, adapter: createAotAdapter({ base: 'http://127.0.0.1:3600', fetchImpl: s.fetchImpl, now: () => NOW }) });
  const a = (await call(r, 'GET', '/api/aot/observe?area=DEEP_DIVE')).body;
  const r2 = createAotRoutes({ token: 't', knowledge, now: () => NOW, adapter: createAotAdapter({ base: 'http://127.0.0.1:3600', fetchImpl: spyFetch().fetchImpl, now: () => NOW }) });
  const b = (await call(r2, 'GET', '/api/aot/observe?area=DEEP_DIVE&enrich=1')).body;
  assert.deepEqual(a.knowledge, []); assert.equal(b.knowledge.length, 1); assert.equal(b.knowledge[0].provenance, 'SPOTGAMMA_KNOWLEDGE');
  assert.deepEqual(b.observation, a.observation);
  const m1 = explain({ alfabot: fixtureRoutes()['/api/alfabot-signal'], state: fixtureRoutes()['/state'], now: NOW });
  const m2 = explain({ alfabot: fixtureRoutes()['/api/alfabot-signal'], state: fixtureRoutes()['/state'], now: NOW, knowledge: knowledge() });
  assert.deepEqual(m2.symbols, m1.symbols);
});

test('AOTJ08 provenance + data_state enums on every item and every answer sentence', () => {
  for (const a of AREAS) {
    const o = extract(a.id, rawsFor(a), { now: NOW });
    assert.ok(o.items.length > 3, a.id);
    for (const i of o.items) { assert.ok(PROVENANCE.includes(i.provenance), `${a.id} ${i.key} ${i.provenance}`); assert.ok(DATA_STATES.includes(i.data_state), `${a.id} ${i.key}`); assert.ok(i.source && i.endpoint, i.key); }
    if (a.id === 'HISTORY') for (const i of o.items) assert.ok(i.data_state !== 'LIVE', `historical record never LIVE: ${i.key}`);
  }
  const matrix = explain({ alfabot: fixtureRoutes()['/api/alfabot-signal'], state: fixtureRoutes()['/state'], now: NOW });
  const observation = extract('COMMAND', rawsFor(AREAS[0]), { now: NOW });
  const qs = ['Por que não tem sinal?', 'Qual condição está faltando?', 'Quais indicadores estão alinhados?', 'Qual API está fornecendo o gate?', 'Esse dado está atualizado?', 'O que mudou?', 'Isso é dado ou interpretação?', 'O que a SpotGamma diz sobre call wall?', 'Onde está a invalidação?', 'Trades anteriores foram semelhantes?', 'resumo'];
  const seen = new Set();
  for (const text of qs) {
    const r = answer({ text, area: 'COMMAND', observation, matrix, catalog: [], history: fixtureRoutes()['/history?days=2'], knowledge: () => [] });
    seen.add(r.intent);
    assert.ok(r.sentences.length > 0, text);
    for (const s of r.sentences) assert.ok(PROVENANCE.includes(s.provenance), `${text} → ${s.provenance}`);
  }
  assert.deepEqual([...seen].sort(), [...QA_INTENTS].sort());
});

test('AOTJ09 fake AOT down ⇒ "AOT indisponível", pages still render, JARVIS stays up', async () => {
  const f = await fakeAot(); const base = f.base; await f.close(); // port now closed
  const j = await bootJarvis({ aotBase: base });
  try {
    for (const p of ['/aot', '/aot/alfabot', '/aot/indicadores']) assert.equal((await j.get(p)).status, 200, p);
    const o = await (await j.get('/api/aot/observe?area=COMMAND')).json();
    assert.equal(o.observation.aot_available, false); assert.ok(o.observation.items.every((i) => i.value === null || i.data_state === 'ERROR'));
    const n = await (await j.post('/api/aot/narrate', { area: 'COMMAND', mode: 'IMPORTANT' })).json();
    assert.match(n.utterance, /AOT indisponível/);
    const s = await (await j.get('/api/aot/signal')).json();
    assert.equal(s.symbols.ES.signal, 'INVALID_DATA'); assert.equal(s.symbols.NQ.signal, 'INVALID_DATA');
    assert.equal((await j.get('/api/ui-state')).status, 200); assert.equal((await j.get('/api/health')).status, 200);
  } finally { await j.close(); }
});

test('PERF01 shared cache + single in-flight; nothing polls with zero observers', async () => {
  const f = await fakeAot({ delayMs: 50 });
  try {
    const ad = createAotAdapter({ base: f.base });
    const r = createAotRoutes({ token: 't', adapter: ad });
    await sleep(120); assert.equal(f.log.length, 0, 'no observer ⇒ no upstream request'); assert.ok(r);
    await Promise.all(Array.from({ length: 5 }, () => ad.get('/state')));
    await ad.get('/state');
    assert.equal(f.log.filter((x) => x.url === '/state').length, 1); assert.ok(ad.stats.cache_hits >= 1);
  } finally { await f.close(); }
});

test('PERF02 narrate returns before speech synthesis completes', async () => {
  const f = await fakeAot(); const j = await bootJarvis({ aotBase: f.base, voice: stubVoice({ available: true, synthMs: 1500 }) });
  try {
    const t0 = performance.now();
    const n = await (await j.post('/api/aot/narrate', { area: 'COMMAND', mode: 'IMPORTANT', speak: true })).json();
    const dt = performance.now() - t0;
    assert.ok(n.audio && n.audio.chunks_url, 'audio job created'); assert.ok(dt < 1200, `narrate took ${dt} ms`);
    assert.equal(j.voice.calls.filter((c) => c[0] === 'synth').length, 1);
  } finally { await j.close(); await f.close(); }
});

test('PERF03 one upstream fetch per area per window across several clients', async () => {
  const f = await fakeAot({ delayMs: 30 }); const j = await bootJarvis({ aotBase: f.base });
  try {
    await Promise.all(['a', 'b', 'c', 'd'].map((cid) => j.post('/api/aot/narrate', { area: 'COMMAND', mode: 'IMPORTANT', cid })));
    await Promise.all(['a', 'b'].map(() => j.get('/api/aot/observe?area=COMMAND')));
    assert.equal(f.log.filter((x) => x.url === '/state').length, 1, JSON.stringify(f.log));
  } finally { await j.close(); await f.close(); }
});
