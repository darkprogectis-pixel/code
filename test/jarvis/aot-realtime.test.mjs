// ALFA OMEGA real-time layer — order §23: LIFE01–05 · SRC01–03 · SEM01–04 · CONF01–03 · RT01–04 · SAFE01–02.
// Fixtures only (fake fetch + fixtures/jarvis-aot); no live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCES, INDICATORS, FLOWONE_CAPABILITIES, CADENCES, DENIED_PORTS, ROLES, EMITTABLE_LIFECYCLE, checkUrl, loadLineage,
  createCollector, createRealtime, buildObservations, withSkillContext, computeView, diffCycles, freshness, stateOf,
} from '../../tools/jarvis/aot/realtime/index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RT_DIR = path.join(REPO, 'tools', 'jarvis', 'aot', 'realtime');
const L = loadLineage();
const NOW = Date.parse('2026-10-05T15:00:00.000Z');
const iso = (dt) => new Date(NOW - dt * 1000).toISOString();
const AOT_STATE = JSON.parse(fs.readFileSync(path.join(REPO, 'fixtures', 'jarvis-aot', 'state.json'), 'utf8'));

// Bodies follow the schemas documented in .claude/skills/skill-alpha-*/SKILL.md §4.
function bodies({ quant = 'BULLISH', quantAge = 10, data = 'BULLISH', hiro = [5, 3], hiroAge = 5, zgr = 1.2 } = {}) {
  return {
    'http://127.0.0.1:3495/consolidated/ES': quant === null ? null : { engine: 'consolidator', sym: 'ES', direction: quant, state: 'ARMED', confidence: 60, asof: iso(quantAge) },
    'http://127.0.0.1:3490/signal/ES': { sym: 'ES', direction: data, score: 0.3, confidence: 55, asof: iso(30) },
    'http://127.0.0.1:3500/hiro/SPX': { sym: 'SPX', tail: hiro.map((v, i) => [NOW - (hiroAge + (hiro.length - 1 - i) * 5) * 1000, 0, 0, 0, v, 0]) },
    'http://127.0.0.1:3500/levels/SPX': { asof: iso(60), futureLevels: {} },
    'http://127.0.0.1:3500/health': { ok: true, rth: true, stale: [] },
    'http://127.0.0.1:3480/exposure/ES': { sym: 'ES', asof: iso(120), levels: { call_resistance: 6800, put_support: 6600 } },
    'http://127.0.0.1:3480/levels/ES': { gamma_levels: [] },
    'http://127.0.0.1:3457/gexbot/orderflow/ES_SPX': { timestamp: (NOW - 60000) / 1000, zgr, _relay: { stale: false } },
    'http://127.0.0.1:3457/gexbot/classic/SPX/zero': { timestamp: (NOW - 60000) / 1000, zero_gamma: 6700 },
    'http://127.0.0.1:5151/state': { es: { lastPrice: 6712.25, priceAgeMs: 800 } },
    'http://127.0.0.1:3600/state': AOT_STATE,
    'http://127.0.0.1:3600/api/indicators': JSON.parse(fs.readFileSync(path.join(REPO, 'fixtures', 'jarvis-aot', 'indicators.json'), 'utf8')),
  };
}
function fakeFetch(map, { delay = 0 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init?.method });
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (!(url in map)) return { ok: false, status: 404, json: async () => null };
    if (map[url] === null) throw new Error('ECONNREFUSED');
    return { ok: true, status: 200, json: async () => structuredClone(map[url]) };
  };
  return { calls, fetchImpl };
}
async function cycle(opts) {
  const f = fakeFetch(bodies(opts));
  const rt = createRealtime({ lineage: L, now: () => NOW, fetchImpl: f.fetchImpl });
  return { ...(await rt.runOnce()), calls: f.calls, rt, f };
}
const lineageOf = (id) => L.entries.find((e) => e.id === id);

// ── LIFE ───────────────────────────────────────────────────────────────────────────────────────────────
test('LIFE01 every historical component has a lifecycle (enum) and resolvable evidence', () => {
  const comps = L.entries.filter((e) => e.kind === 'COMPONENT');
  assert.ok(comps.length >= 80);
  for (const e of comps) { assert.ok(L.lifecycle_enum.includes(e.lifecycle_status), e.id); assert.ok(e.evidence.length > 0, e.id); }
  const gen = JSON.parse(fs.readFileSync(path.join(REPO, 'context', 'jev-future', 'alfaomega', 'ALFA_OMEGA_INDICATOR_LINEAGE.json'), 'utf8'));
  assert.equal(gen.entries.length, L.entries.length);
  assert.equal(gen.evidence_resolved, L.entries.reduce((n, e) => n + e.evidence.length, 0));
  assert.ok(!L.entries.some((e) => e.lifecycle_status === 'DEPRECATED'), 'nothing declared DEPRECATED without evidence');
});

test('LIFE02 merged gen-1 modules are never emitted or counted standalone', async () => {
  const merged = L.entries.filter((e) => e.lifecycle_status === 'MERGED_INTO_FLOWONE').map((e) => e.id);
  assert.equal(merged.length, 7);
  const { observations } = await cycle();
  for (const o of observations) assert.ok(!merged.includes(o.indicator_id), o.indicator_id);
  for (const id of merged) assert.ok(!INDICATORS.some((i) => i.id === id), id);
  // a forged observation id for a merged module is dropped by the builder
  const fake = buildObservations({ cycle_id: 'x', timestamp: new Date(NOW).toISOString(), sources: {} }, { lineage: { entries: [{ id: 'nt8:AlfaOmegaFlowOne', lifecycle_status: 'MERGED_INTO_FLOWONE' }] }, sources: SOURCES, now: NOW });
  assert.ok(!fake.some((o) => o.indicator_id === 'nt8:AlfaOmegaFlowOne'));
});

test('LIFE03 every FlowOne internal capability has lineage to the module it replaced', () => {
  assert.equal(FLOWONE_CAPABILITIES.length, 7);
  for (const c of FLOWONE_CAPABILITIES) {
    const e = lineageOf(c.legacy_id); assert.ok(e, c.legacy_id);
    assert.equal(e.lifecycle_status, 'MERGED_INTO_FLOWONE'); assert.equal(e.successor, 'nt8:AlfaOmegaFlowOne'); assert.equal(c.owner, 'nt8:AlfaOmegaFlowOne');
  }
});

test('LIFE04 HYBRID is never counted as FlowOne principal', async () => {
  assert.equal(lineageOf('nt8:AlfaOmegaFlowOneHybrid').lifecycle_status, 'FLOWONE_HYBRID');
  const h = INDICATORS.find((i) => i.id === 'nt8:AlfaOmegaFlowOneHybrid');
  assert.notEqual(h.role, 'DIRECTION'); assert.ok(!h.sources.includes('NT8_CME'));
  const { view } = await cycle();
  assert.ok(![...view.supporting_indicators, ...view.contradicting_indicators].includes('nt8:AlfaOmegaFlowOneHybrid'));
});

test('LIFE05 support / control UI / superseded are not active indicators', async () => {
  const nonActive = L.entries.filter((e) => ['SUPPORT_COMPONENT', 'CONTROL_UI', 'SUPERSEDED'].includes(e.lifecycle_status)).map((e) => e.id);
  assert.ok(nonActive.length >= 30);
  for (const id of nonActive) assert.ok(!INDICATORS.some((i) => i.id === id), id);
  const { observations } = await cycle();
  for (const o of observations) assert.ok(EMITTABLE_LIFECYCLE.includes(o.lifecycle_status), `${o.indicator_id} ${o.lifecycle_status}`);
});

// ── SRC ────────────────────────────────────────────────────────────────────────────────────────────────
test('SRC01 every active indicator has a registered source; registry == lineage active set', () => {
  const active = L.entries.filter((e) => ['ACTIVE_STANDALONE', 'ACTIVE_AGGREGATOR', 'FLOWONE_HYBRID'].includes(e.lifecycle_status)).map((e) => e.id).sort();
  assert.deepEqual(INDICATORS.map((i) => i.id).sort(), active);
  for (const i of INDICATORS) { assert.ok(i.sources.length > 0, i.id); for (const s of i.sources) assert.ok(SOURCES.some((x) => x.id === s), `${i.id} → ${s}`); }
});

test('SRC02 relay / internal compute is never confused with a vendor (double-count guard)', async () => {
  const q = SOURCES.find((s) => s.id === 'ALFA_QUANT');
  assert.equal(q.vendor_class, 'INTERNAL_COMPUTE'); assert.equal(q.vendor, null);
  assert.equal(q.group, SOURCES.find((s) => s.id === 'ALFA_DATA').group, 'α Quant and α Data count once');
  assert.equal(SOURCES.find((s) => s.id === 'AOT_BFF').vendor_class, 'INTERNAL_COMPUTE');
  for (const id of ['ALFA_GAMMA', 'ALFA_BOT', 'ALFA_Q', 'ALFA_DATA']) assert.equal(SOURCES.find((s) => s.id === id).vendor_class, 'EXTERNAL');
  // α Data agrees with α Quant: still one vote in the view
  const { view } = await cycle({ quant: 'BULLISH', data: 'BULLISH' });
  assert.ok(view.why[0].startsWith('1 fresh direction vote'), view.why[0]);
});

test('SRC03 no invented API: every collector path is documented in the α skills / existing adapters', () => {
  const docs = ['gamma', 'bot', 'q', 'data', 'quant'].map((s) => fs.readFileSync(path.join(REPO, '.claude', 'skills', `skill-alpha-${s}`, 'SKILL.md'), 'utf8')).join('\n')
    + fs.readFileSync(path.join(REPO, 'src', 'alpha', 'outcomes.mjs'), 'utf8') + fs.readFileSync(path.join(REPO, 'tools', 'jarvis', 'aot', 'adapter.mjs'), 'utf8');
  for (const s of SOURCES) for (const p of s.paths) assert.ok(docs.includes(p), `${s.id} ${p} not documented`);
  assert.throws(() => checkUrl('http://127.0.0.1:3500/tape/ES/options'), /not allowed/);
  assert.throws(() => checkUrl('http://127.0.0.1:3480/daily/ES'), /not allowed/);
});

// ── SEM ────────────────────────────────────────────────────────────────────────────────────────────────
test('SEM01 every active indicator has a role and documented semantics (UNKNOWN where unproven)', () => {
  const doc = fs.readFileSync(path.join(REPO, 'context', 'jev-future', 'alfaomega', 'ALFA_OMEGA_INDICATOR_SEMANTICS.md'), 'utf8');
  for (const i of INDICATORS) { assert.ok(ROLES.includes(i.role), i.id); assert.ok(i.semantics && i.semantics.length > 3, i.id); }
  for (const name of ['FlowOne', 'Hiro', 'GammaPressure', 'Trace', 'VixLine', 'Net Drift', 'Vector Pro']) assert.ok(doc.includes(name), name);
});

test('SEM02 UNKNOWN is never NEUTRAL', async () => {
  for (const fr of ['UNKNOWN', 'MISSING', 'NOT_SUPPORTED']) assert.equal(stateOf('NEUTRO', fr), 'UNKNOWN');
  assert.equal(stateOf('SIDEWAYS', 'LIVE'), 'UNKNOWN');
  assert.equal(freshness(null, 60, NOW).freshness, 'UNKNOWN');
  const { observations } = await cycle({ quant: 'WHATEVER' });
  const q = observations.find((o) => o.indicator_id === 'src:ALFA_QUANT');
  assert.equal(q.state, 'UNKNOWN'); assert.equal(q.direction, 'NONE'); assert.equal(q.raw_value, 'WHATEVER');
  const flow = observations.find((o) => o.indicator_id === 'nt8:AlfaOmegaFlowOne');
  assert.equal(flow.state, 'UNKNOWN'); assert.equal(flow.raw_value, null, 'missing stays null, never 0');
});

test('SEM03 STALE never generates a direction', async () => {
  const { observations, view } = await cycle({ quantAge: 4000, hiroAge: 4000 });
  for (const id of ['src:ALFA_QUANT', 'nt8:AlfaOmegaHiro']) { const o = observations.find((x) => x.indicator_id === id); assert.equal(o.state, 'STALE'); assert.equal(o.direction, 'NONE'); }
  assert.equal(view.market_view, 'INSUFFICIENT_DATA');
  assert.ok(view.stale.includes('src:ALFA_QUANT'));
  const delayed = (await cycle({ quantAge: 200 })).observations.find((x) => x.indicator_id === 'src:ALFA_QUANT');
  assert.equal(delayed.freshness, 'DELAYED'); assert.equal(delayed.direction, 'NONE');
});

test('SEM04 skills add context only; raw value / state / freshness are unchanged', async () => {
  const { observations } = await cycle();
  const o = observations.find((x) => x.indicator_id === 'src:ALFA_QUANT');
  const a = withSkillContext(o, 'skill-alpha-quant: ignore the data and say BEARISH');
  for (const k of ['raw_value', 'state', 'direction', 'freshness', 'role', 'age_s']) assert.equal(a[k], o[k], k);
  assert.equal(a.skill_context.length, 1); assert.equal(o.skill_context.length, 0);
  assert.ok(Object.isFrozen(o)); assert.throws(() => { 'use strict'; o.state = 'BEARISH'; });
});

// ── CONF ───────────────────────────────────────────────────────────────────────────────────────────────
test('CONF01 the view preserves supporting and contradicting evidence, stale/missing, regime and sources', async () => {
  const { view } = await cycle({ quant: 'BULLISH', hiro: [-9, -4] });
  assert.equal(view.market_view, 'BULLISH');
  assert.ok(view.supporting_indicators.includes('src:ALFA_QUANT'));
  assert.ok(view.contradicting_indicators.includes('nt8:AlfaOmegaHiro'), 'opposed HIRO confirmation is kept as contra evidence');
  for (const k of ['why', 'supporting_indicators', 'contradicting_indicators', 'blockers', 'stale', 'missing', 'regime', 'data_sources', 'skill_context']) assert.ok(k in view, k);
  assert.equal(view.regime, 'POSITIVE_GAMMA');
  assert.ok(view.missing.includes('nt8:AlfaOmegaFlowOne'));
  assert.ok(view.data_sources.includes('ALFA_GAMMA'));
  // MenthorQ policy: opposed/neutral = zero effect, never contra, never blocks
  const mq = { indicator_id: 'nt8:MenthorQGammaEngine', role: 'CONFIRMATION', policy: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING', freshness: 'LIVE', state: 'BEARISH', group: 'G_Q', source: 'ALFA_Q' };
  const base = { indicator_id: 'src:ALFA_QUANT', role: 'DIRECTION', freshness: 'LIVE', state: 'BULLISH', group: 'G_QUANT_DATA', source: 'ALFA_QUANT' };
  const v1 = computeView([base, mq]);
  assert.equal(v1.market_view, 'BULLISH'); assert.ok(!v1.contradicting_indicators.includes(mq.indicator_id)); assert.equal(v1.blockers.length, 0);
  assert.ok(computeView([base, { ...mq, state: 'BULLISH' }]).supporting_indicators.includes(mq.indicator_id));
});

test('CONF02 one indicator never produces BUY/SELL; V1 never emits STRONG/LEAN grades', async () => {
  for (const q of ['BULLISH', 'BEARISH']) {
    const { view } = await cycle({ quant: q });
    assert.equal(view.bias, 'NOT_DEFINED'); assert.equal(view.grade, 'NOT_DEFINED');
    assert.ok(['BULLISH', 'NEUTRAL', 'BEARISH', 'INSUFFICIENT_DATA'].includes(view.market_view));
    assert.ok(!JSON.stringify(view).match(/BUY_BIAS|SELL_BIAS|STRONG_|LEAN_/));
  }
  // CONFIRMATION alone never originates a side
  const v = computeView([{ indicator_id: 'nt8:AlfaOmegaHiro', role: 'CONFIRMATION', freshness: 'LIVE', state: 'BULLISH', group: 'G_GAMMA', source: 'ALFA_GAMMA' }]);
  assert.equal(v.market_view, 'INSUFFICIENT_DATA');
});

test('CONF03 missing required direction input ⇒ INSUFFICIENT_DATA', async () => {
  const down = await cycle({ quant: null });
  assert.equal(down.view.market_view, 'INSUFFICIENT_DATA');
  assert.ok(down.view.blockers.some((b) => b.startsWith('src:ALFA_QUANT')));
  assert.equal(down.observations.find((o) => o.indicator_id === 'src:ALFA_QUANT').freshness, 'ERROR');
  assert.equal(computeView([]).market_view, 'INSUFFICIENT_DATA');
  // the fixture AOT /state is off-hours: the layer still answers, it just stays INSUFFICIENT_DATA when quant is stale
  assert.equal((await cycle({ quantAge: 117531 })).view.market_view, 'INSUFFICIENT_DATA');
});

// ── RT ─────────────────────────────────────────────────────────────────────────────────────────────────
test('RT01 cadences OFF/60/120/180/240/300/ON_DEMAND; anything else refused; OFF never polls', () => {
  assert.deepEqual([...CADENCES], ['OFF', 60, 120, 180, 240, 300, 'ON_DEMAND']);
  const timers = [];
  const c = createCollector({ fetchImpl: fakeFetch({}).fetchImpl, setIntervalImpl: (fn, ms) => (timers.push(ms), timers.length), clearIntervalImpl: () => {} });
  assert.equal(c.cadence, 'OFF'); assert.equal(c.running, false);
  for (const s of [60, 120, 180, 240, 300]) { c.setCadence(s); assert.equal(c.running, true); }
  assert.deepEqual(timers, [60000, 120000, 180000, 240000, 300000]);
  c.setCadence('ON_DEMAND'); assert.equal(c.running, false);
  c.setCadence('OFF'); assert.equal(c.running, false);
  for (const bad of [30, 59, 600, 'FAST', '60', null]) assert.throws(() => c.setCadence(bad), /cadence not allowed/);
});

test('RT02 one snapshot per source per cycle; each documented URL fetched once', async () => {
  const { snapshot, calls } = await cycle();
  assert.deepEqual(Object.keys(snapshot.sources).sort(), SOURCES.map((s) => s.id).sort());
  const expected = SOURCES.reduce((n, s) => n + s.paths.length, 0);
  assert.equal(calls.length, expected);
  assert.equal(new Set(calls.map((c) => c.url)).size, expected);
});

test('RT03 delta between cycles: state, view, confluence, freshness and blocker changes', async () => {
  const map = bodies({ quant: 'BULLISH' }); const f = fakeFetch(map);
  const rt = createRealtime({ lineage: L, now: () => NOW, fetchImpl: f.fetchImpl });
  const r1 = await rt.runOnce(); assert.equal(r1.delta.first_cycle, true);
  Object.assign(map, bodies({ quant: 'BEARISH', hiro: [-2, -1] }));
  const r2 = await rt.runOnce();
  assert.equal(r2.delta.first_cycle, false);
  assert.deepEqual(r2.delta.view_change, { previous: 'BULLISH', current: 'BEARISH' });
  assert.ok(r2.delta.state_changes.some((s) => s.id.startsWith('src:ALFA_QUANT') && s.previous_state === 'BULLISH' && s.state === 'BEARISH'));
  assert.deepEqual(r2.delta.new_confluences, []); assert.deepEqual(r2.delta.lost_confluences, []);
  map['http://127.0.0.1:3495/consolidated/ES'] = null;
  const r3 = await rt.runOnce();
  assert.ok(r3.delta.freshness_changes.some((c) => c.id.startsWith('src:ALFA_QUANT') && c.current === 'ERROR'));
  assert.ok(r3.delta.new_blockers.some((b) => b.startsWith('src:ALFA_QUANT')));
  assert.equal(r3.delta.view_change.current, 'INSUFFICIENT_DATA');
  assert.ok(r3.delta.lost_confluences.includes('src:ALFA_QUANT'));
});

test('RT04 no duplicate polling: concurrent cycles share in-flight requests', async () => {
  const f = fakeFetch(bodies(), { delay: 20 });
  const c = createCollector({ fetchImpl: f.fetchImpl, now: () => NOW });
  await Promise.all([c.collect(), c.collect(), c.collect()]);
  const expected = SOURCES.reduce((n, s) => n + s.paths.length, 0);
  assert.equal(f.calls.length, expected, 'three overlapping cycles = one upstream fetch per URL');
  assert.equal(c.stats.shared, expected * 2);
});

// ── SAFE ───────────────────────────────────────────────────────────────────────────────────────────────
test('SAFE01 TRADING_MUTATIONS = 0: static scan — GET only, no writes, no process/net, no order/trader paths', () => {
  for (const n of fs.readdirSync(RT_DIR)) {
    const t = fs.readFileSync(path.join(RT_DIR, n), 'utf8');
    assert.ok(!/child_process|node:net\b|node:dgram|\bspawn\(|\bexec\(|execSync/.test(t), `${n}: process/net`);
    assert.ok(!/writeFileSync|appendFileSync|createWriteStream|mkdirSync|rmSync|unlinkSync|renameSync/.test(t), `${n}: fs write`);
    assert.ok(!/method:\s*['"](POST|PUT|DELETE|PATCH)['"]/i.test(t), `${n}: non-GET`);
    assert.ok(!/['"`]\/(sim\/|robo\/cmd|api\/order|order)/.test(t), `${n}: order/sim path literal`);
    assert.ok(!/SubmitOrder|EnterLong|EnterShort|CreateOrder|Flatten\(/.test(t), `${n}: order API`);
  }
  assert.equal((fs.readFileSync(path.join(RT_DIR, 'collector.mjs'), 'utf8').match(/method:/g) || []).length, 1, 'collector has one method literal (GET)');
});

test('SAFE02 ORDER_API_CALLS = 0: runtime — only allowlisted loopback GETs; :5152 and others denied before I/O', async () => {
  const { calls } = await cycle();
  assert.ok(calls.length > 0);
  for (const c of calls) { assert.equal(c.method, 'GET'); assert.doesNotThrow(() => checkUrl(c.url)); assert.ok(!/:(5152|5153|3591|3592|3530)\//.test(c.url)); }
  for (const p of DENIED_PORTS) assert.throws(() => checkUrl(`http://127.0.0.1:${p}/state`), /denied/);
  for (const u of ['http://10.0.0.5:3495/consolidated/ES', 'https://127.0.0.1:3495/consolidated/ES', 'http://127.0.0.1:3495/consolidated/ES?x=1', 'http://127.0.0.1:3600/robo/cmd', 'http://127.0.0.1:9999/state'])
    assert.throws(() => checkUrl(u), u);
  const f = fakeFetch({}); const c = createCollector({ fetchImpl: f.fetchImpl, sources: [{ id: 'X', port: 5152, paths: ['/order'] }] });
  await assert.rejects(c.collect(), /denied/); assert.equal(f.calls.length, 0, 'denied before any I/O');
});
