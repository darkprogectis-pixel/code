// AGENT_FUSION (alpha-fusion/v1) + JEV decomposed review (Q1–Q12, throttle, failure).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cfg } from './helpers.mjs';
import { makeEnvelope, validateFusion } from '../../src/alpha/contracts.mjs';
import { fuse } from '../../src/alpha/fusion.mjs';
import { reviewFusion, summarize, decide, QUESTIONS } from '../../src/alpha/jev-fusion.mjs';

const C = cfg();
const NOW = Date.parse('2026-10-02T15:00:00Z');
const ROLE = { quant: 'SOURCE_CLASSIFICATION', data: 'SOURCE_CLASSIFICATION', gamma: 'DIRECTIONAL_PRESSURE', bot: 'NON_DIRECTIONAL', q: 'NON_DIRECTIONAL' };
const GROUP = { quant: 'G_QUANT_DATA', data: 'G_QUANT_DATA', gamma: 'G_GAMMA', bot: 'G_BOT', q: 'G_Q' };
const E = (source, direction = 'UNKNOWN', { conf = 0.4, str = 0.6, fresh = true, health = 'OK' } = {}) =>
  makeEnvelope({ source, cycle_id: 'c1', now: NOW, source_ts: NOW - 5000, fresh, health, role: ROLE[source], direction, strength: str, confidence: conf, independence_group: GROUP[source], rules_version: C.rules_version });
const base = (o = {}) => ['quant', 'gamma', 'bot', 'q', 'data'].map((s) => o[s] ?? E(s));
const F = (envs) => { const f = fuse(envs, { cfg: C, cycle_id: 'c1', now: NOW }); assert.deepEqual(validateFusion(f), []); return f; };

test('5 OK, consensus Quant+Gamma BUY ⇒ BUY with 2 directional groups', () => {
  const f = F(base({ quant: E('quant', 'BUY'), gamma: E('gamma', 'BUY', { conf: 0.25, str: 0.7 }), data: E('data', 'BUY', { conf: 0.3 }) }));
  assert.equal(f.signal, 'BUY'); assert.equal(f.groups.filter((g) => g.sign).length, 2); assert.ok(f.confidence > 0 && f.confidence <= 1);
  assert.deepEqual(f.bullish_sources, ['quant', 'gamma']);
  assert.match(f.sources.data.reason, /REDUNDANT_WITH_QUANT/);
});
test('redundancy: Quant + Data agreeing count as ONE group (no double counting)', () => {
  const a = F(base({ quant: E('quant', 'SELL', { conf: 0.5, str: 0.6 }) }));
  const b = F(base({ quant: E('quant', 'SELL', { conf: 0.5, str: 0.6 }), data: E('data', 'SELL', { conf: 0.4, str: 0.6 }) }));
  assert.equal(a.evidence_mass, b.evidence_mass); assert.equal(a.score, b.score);
});
test('single directional group ⇒ confidence × single_group_factor', () => {
  const f = F(base({ quant: E('quant', 'BUY', { conf: 0.5, str: 0.8 }) }));
  assert.equal(f.signal, 'BUY');
  assert.equal(f.confidence, Math.round(1 * Math.min(1, 0.4 / C.fusion.score_full) * C.fusion.single_group_factor * 1e4) / 1e4);
});
test('1 offline: Gamma ERROR ignored, Quant still decides', () => {
  const f = F(base({ quant: E('quant', 'BUY', { conf: 0.5, str: 0.8 }), gamma: E('gamma', 'SELL', { health: 'ERROR', fresh: false }) }));
  assert.equal(f.signal, 'BUY'); assert.ok(f.ignored_sources.some((x) => x.source === 'gamma' && x.reason === 'ERROR'));
});
test('2+ offline / insufficient freshness ⇒ NO_SIGNAL', () => {
  const dead = (s) => E(s, 'UNKNOWN', { fresh: false, health: 'ERROR' });
  const f = F([E('quant', 'BUY', { conf: 0.6, str: 0.9 }), dead('gamma'), dead('bot'), dead('q'), dead('data')]);
  assert.equal(f.signal, 'NO_SIGNAL'); assert.equal(f.freshness_ok, false); assert.match(f.reasoning_summary, /fresca/);
});
test('all neutral ⇒ NO_SIGNAL', () => {
  const f = F(base({ quant: E('quant', 'NEUTRAL'), gamma: E('gamma', 'NEUTRAL', { conf: 0.2 }) }));
  assert.equal(f.signal, 'NO_SIGNAL'); assert.deepEqual(f.neutral_sources, ['quant', 'gamma']);
});
test('stale source does not vote', () => {
  const f = F(base({ quant: E('quant', 'BUY', { fresh: false }), gamma: E('gamma', 'SELL', { conf: 0.3, str: 0.9 }) }));
  assert.equal(f.sources.quant.used, false); assert.equal(f.sources.quant.reason, 'STALE');
  assert.equal(f.signal, 'SELL');
});
test('material conflict between independent groups ⇒ NO_SIGNAL (no majority)', () => {
  const f = F(base({ quant: E('quant', 'BUY', { conf: 0.5, str: 0.6 }), gamma: E('gamma', 'SELL', { conf: 0.3, str: 0.6 }) }));
  assert.equal(f.signal, 'NO_SIGNAL'); assert.ok(f.contradictions.some((c) => c.material));
});
test('3×2 is not a simple majority: 3 BUY envelopes (2 redundant) × 1 strong SELL ⇒ NO_SIGNAL', () => {
  const f = F(base({ quant: E('quant', 'BUY', { conf: 0.3, str: 0.5 }), data: E('data', 'BUY', { conf: 0.3, str: 0.5 }), gamma: E('gamma', 'SELL', { conf: 0.3, str: 0.9 }) }));
  assert.equal(f.signal, 'NO_SIGNAL');
});
test('strong source × weak opposite (below contradiction mass) ⇒ strong side wins with agreement ≥ min', () => {
  const f = F(base({ quant: E('quant', 'BUY', { conf: 0.6, str: 0.9 }), gamma: E('gamma', 'SELL', { conf: 0.05, str: 0.5 }) }));
  assert.equal(f.contradictions.filter((c) => c.material).length, 0);
  assert.equal(f.signal, 'BUY'); assert.ok(f.agreement >= C.fusion.min_agreement);
});
test('Quant × Data opposite inside group ⇒ WITHIN_GROUP contradiction recorded (not summed)', () => {
  const f = F(base({ quant: E('quant', 'BUY', { conf: 0.5 }), data: E('data', 'SELL', { conf: 0.3 }) }));
  assert.ok(f.contradictions.some((c) => c.kind === 'WITHIN_GROUP' && !c.material));
  assert.equal(f.groups.find((g) => g.id === 'G_QUANT_DATA').representative, 'quant');
});
test('Q never originates a side nor vetoes; q_confirmation NONE; Bot never originates', () => {
  const qOnly = F(base({ q: E('q', 'BUY', { conf: 0.9, str: 0.9 }), bot: E('bot', 'SELL', { conf: 0.9, str: 0.9 }) }));
  assert.equal(qOnly.signal, 'NO_SIGNAL'); assert.equal(qOnly.q_confirmation, 'NONE');
  assert.match(qOnly.sources.q.reason, /Q_CONFIRMATION_ONLY/);
  const withQ = F(base({ quant: E('quant', 'BUY', { conf: 0.5, str: 0.8 }), q: E('q', 'SELL') }));
  const noQ = F(base({ quant: E('quant', 'BUY', { conf: 0.5, str: 0.8 }), q: E('q', 'UNKNOWN', { fresh: false }) }));
  assert.equal(withQ.signal, 'BUY'); assert.equal(withQ.confidence, noQ.confidence);
});
test('reproducible: same envelopes ⇒ same fusion hash', () => {
  const envs = base({ quant: E('quant', 'BUY'), gamma: E('gamma', 'BUY', { conf: 0.2 }) });
  const h = () => crypto.createHash('sha256').update(JSON.stringify(F(structuredClone(envs)))).digest('hex');
  assert.equal(h(), h());
});

// ---- JEV ----
const ANS = (q10 = 'BUY', p = 0.7) => ({ meta: { request_id: 'req_mock', model: 'mock' }, answers: Object.fromEntries(Object.keys(QUESTIONS).map((k) => [k, k === 'Q10'
  ? { choice: q10, confidence: p, probabilities: { [q10]: p, INDETERMINATE: Math.round((1 - p - 0.05) * 100) / 100, [q10 === 'BUY' ? 'SELL' : 'BUY']: 0.05 } }
  : { choice: 'YES', confidence: 0.6, probabilities: { YES: 0.6, NO: 0.4 } }])) });
const fresh = () => base({ quant: E('quant', 'BUY', { conf: 0.5, str: 0.8 }), gamma: E('gamma', 'BUY', { conf: 0.2, str: 0.6 }) });
test('JEV: 12 decomposed questions, mock A (agrees) ⇒ OK with winner/pmax/top1/top2/margin/ratio', async () => {
  const envs = fresh(); const f = F(envs); const st = {};
  let seen;
  const j = await reviewFusion(envs, f, { cfg: C, now: NOW, st, ask: async (a) => { seen = a; return ANS('BUY', 0.7); } });
  assert.equal(Object.keys(seen.questions).length, 12); assert.equal(seen.purpose, 'alpha-fusion-c1');
  assert.equal(j.status, 'OK'); assert.equal(j.request_id, 'req_mock'); assert.equal(j.agrees_with_signal, true);
  const { probabilities, ...q10 } = j.questions.Q10;
  assert.deepEqual(q10, { winner: 'BUY', confidence: 0.7, pmax: 0.7, top1: 'BUY', top2: 'INDETERMINATE', margin: 0.45, ratio: 2.8 });
});
test('JEV: mock B (disagrees) ⇒ agrees_with_signal=false; JEV never changes signal', async () => {
  const envs = fresh(); const f = F(envs);
  const j = await reviewFusion(envs, f, { cfg: C, now: NOW, st: {}, ask: async () => ANS('SELL', 0.8) });
  assert.equal(j.agrees_with_signal, false); assert.equal(f.signal, 'BUY');
});
test('JEV: error and timeout ⇒ status ERROR, does not throw', async () => {
  const envs = fresh(); const f = F(envs);
  assert.equal((await reviewFusion(envs, f, { cfg: C, now: NOW, st: {}, ask: async () => { throw new Error('boom'); } })).status, 'ERROR');
  const C2 = structuredClone(C); C2.jev.timeout_ms = 30;
  const j = await reviewFusion(envs, f, { cfg: C2, now: NOW, st: {}, ask: () => new Promise((r) => setTimeout(r, 500)) });
  assert.equal(j.status, 'ERROR'); assert.match(j.error, /timeout/);
});
test('JEV throttle: unchanged ⇒ SKIPPED_UNCHANGED; heartbeat; no fresh directional; daily cap; min interval', async () => {
  const envs = fresh(); const f = F(envs); const st = {};
  await reviewFusion(envs, f, { cfg: C, now: NOW, st, ask: async () => ANS() });
  assert.equal(decide(envs, f, st, C, NOW + 30000), 'SKIPPED_UNCHANGED');
  assert.equal(decide(envs, f, st, C, NOW + C.jev.heartbeat_ms + 1), 'CALL');
  const stale = base(); assert.equal(decide(stale, F(stale), {}, C, NOW), 'SKIPPED_NO_FRESH_EVIDENCE');
  assert.equal(decide(envs, f, { day: '2026-10-02', count: C.jev.daily_cap }, C, NOW), 'SKIPPED_DAILY_CAP');
  const changed = base({ quant: E('quant', 'SELL', { conf: 0.5, str: 0.8 }) });
  assert.equal(decide(changed, F(changed), st, C, NOW + 30000), 'SKIPPED_MIN_INTERVAL');
  assert.equal(decide(changed, F(changed), st, C, NOW + C.jev.min_interval_ms + 1), 'CALL');
});
test('JEV summarize: margin = p1−p2, ratio = p1/p2', () => {
  const s = summarize({ Q7: { choice: 'NO', confidence: 0.9, probabilities: { YES: 0.25, NO: 0.75 } } });
  assert.equal(s.Q7.margin, 0.5); assert.equal(s.Q7.ratio, 3); assert.equal(s.Q7.top1, 'NO');
});
