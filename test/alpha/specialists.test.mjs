// Per-API specialist tests on real fixtures: valid, incomplete, stale, offline, HTTP 500, invalid JSON, flip, contradiction, determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cfg, payloads, mkFetch, FRESH_NOW, STALE_NOW } from './helpers.mjs';
import { runSpecialist, SPECIALISTS } from '../../src/alpha/pipeline.mjs';
import { validateSpecialist } from '../../src/alpha/contracts.mjs';
import * as quant from '../../src/alpha/specialists/quant.mjs';
import * as gamma from '../../src/alpha/specialists/gamma.mjs';
import * as data from '../../src/alpha/specialists/data.mjs';
import * as bot from '../../src/alpha/specialists/bot.mjs';
import * as q from '../../src/alpha/specialists/q.mjs';

const C = cfg();
const run = (m, P, now = FRESH_NOW, ov = {}) => runSpecialist(m, { cfg: C, cycle_id: 'ac-test', now, dir: null, fetchImpl: mkFetch(C, P, ov) });
const req = (m) => C.endpoints[m.source][m.required[0]];
const opt = (m) => Object.entries(C.endpoints[m.source]).find(([k]) => !m.required.includes(k))?.[1];

for (const m of SPECIALISTS) {
  test(`${m.source}: valid fresh payload ⇒ valid envelope, fresh, own endpoints only`, async () => {
    const f = mkFetch(C, payloads());
    const e = await runSpecialist(m, { cfg: C, cycle_id: 'ac-test', now: FRESH_NOW, dir: null, fetchImpl: f });
    assert.deepEqual(validateSpecialist(e), []);
    assert.equal(e.fresh, true); assert.ok(['OK', 'PARTIAL'].includes(e.health));
    assert.ok(f.calls.every((c) => Object.values(C.endpoints[m.source]).includes(c.url) && c.method === 'GET'), 'reads only its own API with GET');
    assert.equal(e.rules_version, C.rules_version); assert.equal(e.calibration, 'UNCALIBRATED');
    assert.ok(e.raw_ref.endpoints.length >= 1);
  });
  test(`${m.source}: stale ⇒ STALE/UNKNOWN/confidence 0`, async () => {
    const P = payloads({ fresh: false, now: STALE_NOW });
    const e = await run(m, P, m.source === 'data' ? STALE_NOW + 3600000 : STALE_NOW);
    assert.equal(e.fresh, false); assert.equal(e.health, 'STALE'); assert.equal(e.direction, 'UNKNOWN'); assert.equal(e.confidence, 0); assert.equal(e.strength, 0);
    assert.deepEqual(validateSpecialist(e), []);
  });
  for (const [kind, v] of [['offline (ECONNREFUSED)', 'OFFLINE'], ['HTTP 500', { status: 500 }], ['invalid JSON', 'BADJSON'], ['timeout', 'TIMEOUT']]) {
    test(`${m.source}: required endpoint ${kind} ⇒ ERROR/UNKNOWN`, async () => {
      const e = await run(m, payloads(), FRESH_NOW, { [req(m)]: v });
      assert.equal(e.health, 'ERROR'); assert.equal(e.direction, 'UNKNOWN'); assert.equal(e.confidence, 0);
      assert.match(e.warnings[0], /^(OFFLINE|HTTP|PARSE|TIMEOUT)/);
      assert.deepEqual(validateSpecialist(e), []);
    });
  }
  if (opt(m)) test(`${m.source}: optional endpoint offline ⇒ PARTIAL (not ERROR), warning recorded`, async () => {
    const e = await run(m, payloads(), FRESH_NOW, { [opt(m)]: 'OFFLINE' });
    assert.notEqual(e.health, 'ERROR'); assert.ok(e.warnings.some((w) => w.startsWith('OFFLINE')));
  });
  test(`${m.source}: deterministic (same snapshots + now ⇒ same envelope)`, () => {
    const P = payloads();
    const h = () => crypto.createHash('sha256').update(JSON.stringify(m.evaluate({ payloads: structuredClone(P[m.source]), refs: [], now: FRESH_NOW, cycle_id: 'x', cfg: C, metrics: {} }))).digest('hex');
    assert.equal(h(), h());
  });
}

test('quant: published BULLISH 70 ⇒ BUY, confidence = 0.7 × coverage × 0.6; flip to BEARISH ⇒ SELL', async () => {
  const P = payloads(); Object.assign(P.quant.consolidated, { direction: 'BULLISH', confidence: 70, tier: 'B', state: 'ACTIVE' });
  const e = await run(quant, P);
  assert.equal(e.direction, 'BUY'); assert.equal(e.strength, 0.7); assert.equal(e.confidence, 0.42);
  assert.deepEqual(e.formula.inputs, { source_conf: 0.7, coverage: 1, validation_cap: 0.6 });
  P.quant.consolidated.direction = 'BEARISH';
  assert.equal((await run(quant, P)).direction, 'SELL');
});
test('quant: Consolidator freshness ≠ LIVE ⇒ STALE even with recent asof', async () => {
  const P = payloads(); P.quant.signal.freshness = 'STALE'; P.quant.consolidated.direction = 'BULLISH'; P.quant.consolidated.confidence = 80;
  const e = await run(quant, P);
  assert.equal(e.health, 'STALE'); assert.equal(e.direction, 'UNKNOWN');
});
test('quant: unknown label ⇒ UNKNOWN with warning (no invented meaning)', async () => {
  const P = payloads(); P.quant.consolidated.direction = 'MAYBE_UP';
  const e = await run(quant, P);
  assert.equal(e.direction, 'UNKNOWN'); assert.ok(e.warnings.some((w) => w.includes('unknown direction label')));
});
test('data: incomplete components (S2,S3 null) ⇒ PARTIAL, coverage 0.5, missing_fields listed', async () => {
  const e = await run(data, payloads());
  assert.equal(e.health, 'PARTIAL'); assert.equal(e.formula.inputs.coverage, 0.5);
  assert.deepEqual(e.missing_fields, ['components.primary.S2', 'components.primary.S3']);
});
test('data: BEARISH score -0.4 conf 50 full coverage ⇒ SELL 0.4, confidence 0.3', async () => {
  const P = payloads(); Object.assign(P.data.signal, { direction: 'BEARISH', score: -0.4, confidence: 50 }); Object.assign(P.data.signal.components.primary, { S2: -0.3, S3: -0.2 });
  const e = await run(data, P);
  assert.equal(e.direction, 'SELL'); assert.equal(e.strength, 0.4); assert.equal(e.confidence, 0.3); assert.equal(e.health, 'OK');
});
test('gamma: real HIRO replay ⇒ fresh directional-pressure reading, cap 0.3, SPX-origin levels', async () => {
  const e = await run(gamma, payloads());
  assert.equal(e.role, 'DIRECTIONAL_PRESSURE'); assert.ok(e.confidence <= 0.3 + 1e-9);
  assert.ok(['BUY', 'SELL', 'NEUTRAL'].includes(e.direction));
  const lv = Object.values(e.levels); assert.ok(lv.length > 0); assert.ok(lv.every((l) => l.market_origin === 'SPX'), 'never ES_NATIVE');
});
test('gamma: HIRO flip — positive 15 min slope ⇒ BUY, negative ⇒ SELL', async () => {
  const P = payloads(); const t = P.gamma.hiro.tail; const last = t[t.length - 1][0];
  for (const c of t) c[4] = c[0] > last - 900000 ? 5e6 : (c[0] % 10000 ? 1e5 : -1e5);
  assert.equal((await run(gamma, P)).direction, 'BUY');
  for (const c of t) if (c[0] > last - 900000) c[4] = -5e6;
  assert.equal((await run(gamma, P)).direction, 'SELL');
});
test('bot and q: NON_DIRECTIONAL ⇒ always UNKNOWN even when fresh (GEX never becomes a side; MenthorQ SIDE_ORIGIN=FALSE)', async () => {
  for (const m of [bot, q]) { const e = await run(m, payloads()); assert.equal(e.fresh, true); assert.equal(e.direction, 'UNKNOWN'); assert.equal(e.confidence, 0); assert.ok(Object.keys(e.levels).length > 0); }
});
test('bot: relay _relay.stale=true ⇒ STALE', async () => {
  const P = payloads(); P.bot.orderflow._relay.stale = true;
  assert.equal((await run(bot, P)).health, 'STALE');
});
