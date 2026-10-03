// Realtime SHADOW pipeline: isolation/timeouts, atomic persistence, history, metrics, snapshots, outcomes scaffold, service.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cfg, payloads, mkFetch, tmpDir, cleanupTmp, FRESH_NOW } from './helpers.mjs';
import { runCycle } from '../../src/alpha/pipeline.mjs';
import { validateSpecialist, validateFusion } from '../../src/alpha/contracts.mjs';
import { newMetrics, summarizeMetrics } from '../../src/alpha/stats.mjs';
import { pruneSnapshots } from '../../src/alpha/snapshots.mjs';
import { register, tick, readPrice, createOutcomes } from '../../src/alpha/outcomes.mjs';
import { createService } from '../../src/alpha/service.mjs';

const C = cfg();
const noJev = async () => { throw new Error('jev disabled in test'); };

test('full cycle on fixtures: 5 valid envelopes + valid fusion, persisted atomically with history and metrics', async () => {
  const dir = tmpDir('cycle');
  const metrics = newMetrics(), jevState = {};
  const r = await runCycle({ cfg: C, dir, metrics, jevState, ask: noJev, fetchImpl: mkFetch(C, payloads()), now: FRESH_NOW });
  assert.equal(r.envs.length, 5);
  for (const e of r.envs) assert.deepEqual(validateSpecialist(e), [], e.source);
  assert.deepEqual(validateFusion(r.fusion), []);
  const latest = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'));
  assert.equal(latest.cycle_id, r.fusion.cycle_id);
  const hist = fs.readFileSync(path.join(dir, `history-${r.fusion.timestamp.slice(0, 10)}.ndjson`), 'utf8').trim().split('\n');
  assert.equal(hist.length, 1); assert.equal(JSON.parse(hist[0]).cycle_id, r.fusion.cycle_id);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
  assert.equal(m.cycles, 1); assert.deepEqual(Object.keys(m.agents).sort(), ['bot', 'data', 'gamma', 'q', 'quant']);
  assert.ok(['total', 'specialists', 'fusion', 'jev', 'persist', 'fetch_quant'].every((k) => k in r.stages));
  assert.ok(fs.readdirSync(dir).every((f) => !f.endsWith('.tmp')), 'no temp files left');
  // snapshots: content-addressed and referenced from raw_ref
  const ref = r.envs[0].raw_ref.endpoints[0];
  const day = fs.readdirSync(path.join(dir, 'snapshots'))[0];
  assert.ok(fs.existsSync(path.join(dir, 'snapshots', day, `${ref.snapshot_id}.json`)));
  // second identical cycle ⇒ dedupe (no new snapshot files)
  const n1 = fs.readdirSync(path.join(dir, 'snapshots', day)).length;
  await runCycle({ cfg: C, dir, metrics, jevState, ask: noJev, fetchImpl: mkFetch(C, payloads()), now: FRESH_NOW });
  assert.equal(fs.readdirSync(path.join(dir, 'snapshots', day)).length, n1);
  assert.equal(summarizeMetrics(metrics).cycles, 2);
});

test('one specialist timing out does not delay the others beyond the timeout', async () => {
  const C2 = structuredClone(C); C2.specialist_timeout_ms = 300;
  const slow = { delay: 5000, body: payloads().gamma.hiro };
  const t0 = performance.now();
  const r = await runCycle({ cfg: C2, dir: null, metrics: null, jevState: {}, ask: noJev, fetchImpl: mkFetch(C2, payloads(), { [C2.endpoints.gamma.hiro]: slow }), now: FRESH_NOW });
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `cycle took ${ms} ms`);
  const g = r.envs.find((e) => e.source === 'gamma');
  assert.equal(g.health, 'ERROR'); assert.match(g.warnings[0], /^TIMEOUT/);
  assert.ok(r.envs.filter((e) => e.source !== 'gamma').every((e) => e.health !== 'ERROR'));
});

test('all APIs offline ⇒ 5 ERROR envelopes, NO_SIGNAL, cycle still persists', async () => {
  const dir = tmpDir('offline');
  const r = await runCycle({ cfg: C, dir, metrics: newMetrics(), jevState: {}, ask: noJev, fetchImpl: mkFetch(C, {}, Object.fromEntries(Object.values(C.endpoints).flatMap((e) => Object.values(e)).map((u) => [u, 'OFFLINE']))), now: FRESH_NOW });
  assert.ok(r.envs.every((e) => e.health === 'ERROR')); assert.equal(r.fusion.signal, 'NO_SIGNAL');
  assert.equal(r.fusion.jev.status, 'SKIPPED_NO_FRESH_EVIDENCE');
  assert.ok(fs.existsSync(path.join(dir, 'latest.json')));
});

test('JEV failure inside a live cycle does not break the cycle', async () => {
  const P = payloads(); Object.assign(P.quant.consolidated, { direction: 'BULLISH', confidence: 80 });
  const r = await runCycle({ cfg: C, dir: null, metrics: null, jevState: {}, ask: noJev, fetchImpl: mkFetch(C, P), now: FRESH_NOW });
  assert.equal(r.fusion.jev.status, 'ERROR'); assert.deepEqual(validateFusion(r.fusion), []);
});

test('snapshot retention prunes days older than retention', () => {
  const dir = tmpDir('prune');
  for (const d of ['2026-09-20', '2026-10-02']) fs.mkdirSync(path.join(dir, 'snapshots', d), { recursive: true });
  assert.equal(pruneSnapshots(dir, 3, Date.parse('2026-10-02T12:00:00Z')), 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'snapshots')), ['2026-10-02']);
});

// ---- outcomes (feedback scaffold) ----
const fusion = (signal, at = FRESH_NOW) => ({ cycle_id: 'ac-x', timestamp: new Date(at).toISOString(), signal, confidence: 0.5, agreement: 1 });
test('outcomes: NO_SIGNAL not registered; BUY captures horizons with valid price, else OUTCOME_UNKNOWN; LABELED when all resolved', () => {
  const pend = [];
  assert.equal(register(pend, fusion('NO_SIGNAL'), { price: 100, at: FRESH_NOW }, C), null);
  register(pend, fusion('BUY'), { price: 100, at: FRESH_NOW }, C);
  assert.equal(pend[0].label, 'LABEL_PENDING'); assert.equal(pend[0].p0, 100);
  tick(pend, { price: 101, at: FRESH_NOW + 60000 }, FRESH_NOW + 60000, C);
  assert.equal(pend[0].horizons['1m'].status, 'OUTCOME_CAPTURED'); assert.equal(pend[0].horizons['1m'].hit, true); assert.equal(pend[0].horizons['1m'].ret, 0.01);
  let done = tick(pend, null, FRESH_NOW + 61 * 60000, C); // no valid price later ⇒ remaining horizons UNKNOWN
  assert.equal(done.length, 1); assert.equal(done[0].label, 'LABELED');
  assert.ok(['5m', '15m', '30m', '60m'].every((k) => done[0].horizons[k].status === 'OUTCOME_UNKNOWN' && done[0].horizons[k].price === null));
  assert.equal(pend.length, 0);
});
test('outcomes: no p0 ⇒ p0_status OUTCOME_UNKNOWN and no invented return', () => {
  const pend = []; register(pend, fusion('SELL'), null, C);
  tick(pend, { price: 99, at: FRESH_NOW + 60000 }, FRESH_NOW + 60000, C);
  assert.equal(pend[0].p0_status, 'OUTCOME_UNKNOWN'); assert.equal(pend[0].horizons['1m'].ret, null); assert.equal(pend[0].horizons['1m'].hit, null);
});
test('outcomes: price only from AO bridge es.lastPrice with priceAgeMs ≤ max; stale/offline ⇒ null', async () => {
  const at = (es) => mkFetch(C, {}, { [C.endpoints.price.bridge]: { schema: 'alfaomega-bridge/1', es } });
  assert.deepEqual(await readPrice(C, { fetchImpl: at({ lastPrice: 7800.25, priceAgeMs: 500 }), now: 1000000 }), { price: 7800.25, at: 999500 });
  assert.equal(await readPrice(C, { fetchImpl: at({ lastPrice: null, priceAgeMs: 86400000 }) }), null);
  assert.equal(await readPrice(C, { fetchImpl: at({ lastPrice: 7800, priceAgeMs: 60000 }) }), null);
  assert.equal(await readPrice(C, { fetchImpl: mkFetch(C, {}, { [C.endpoints.price.bridge]: 'OFFLINE' }) }), null);
});
test('outcomes file store: pending persisted, labeled appended to outcomes.ndjson', () => {
  const dir = tmpDir('outc');
  const o = createOutcomes({ cfg: C, dir });
  o.step(fusion('BUY'), { price: 100, at: FRESH_NOW }, FRESH_NOW);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'outcomes-pending.json'), 'utf8')).length, 1);
  o.step(fusion('NO_SIGNAL', FRESH_NOW + 2 * 3600000), null, FRESH_NOW + 2 * 3600000);
  assert.equal(fs.readFileSync(path.join(dir, 'outcomes.ndjson'), 'utf8').trim().split('\n').length, 1);
});

test('service: one cycle writes service.json heartbeat (SHADOW, orders NEVER) and never overlaps', async () => {
  const dir = tmpDir('svc');
  const svc = createService({ cfg: C, dir, ask: noJev, fetchImpl: mkFetch(C, payloads()) });
  const [a, b] = await Promise.all([svc.cycle(), svc.cycle()]);
  assert.ok(a); assert.equal(b, null, 'second concurrent cycle is skipped');
  const s = JSON.parse(fs.readFileSync(path.join(dir, 'service.json'), 'utf8'));
  assert.equal(s.mode, 'SHADOW_READ_ONLY'); assert.equal(s.orders, 'NEVER'); assert.equal(s.cycles, 1);
});

test.after(cleanupTmp);
