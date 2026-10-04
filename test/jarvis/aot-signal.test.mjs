// ALFABOT explanation matrix — SIG01–10 (explanation only; never a signal engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { explain, explainSymbol, deadConditions, THRESHOLDS, AGGREGATES, RESULTS, COLUMNS } from '../../tools/jarvis/aot/alfabot-explain.mjs';
import { fixture } from './aot-helpers.mjs';

const NOW = Date.parse('2026-10-05T15:00:00Z');
function mk(o = {}) {
  const { session = 'RTH', dir = 'LONG', strength = 4, why = null, online = true, tapeLive = true, uiState = 'NEUTRAL', direction = 'BULLISH', state = 'CONFLUENTE', conf = 85, prefilter = null, reactor = 80, signals = 'LIVE', strategy = 'BULLISH', blockReason = null, gate = 'PASS', tradePlan = { stop: 5000 }, age = 10000 } = o;
  const sym = { uiState, direction, state, reactor_pct: reactor, gate, blockReason, prefilterReason: prefilter, sessionMode: session, tradePlan, strategy_direction: strategy, sourceStatus: { signals, candidate: 'LIVE', menthorq: 'LIVE' } };
  return { alfabot: { updatedAt: new Date(NOW - age).toISOString(), session, staleAfterMs: 120000, symbols: { ES: sym, NQ: { ...sym } } },
    state: { gate: { online, tapeLive, state: 'x', anchor: { dir, strength, why } }, symbols: { ES: { tier0: { confidence: conf } }, NQ: { tier0: { confidence: conf } } } }, now: NOW };
}
const es = (o) => explainSymbol('ES', mk(o));

test('SIG01 matrix shape: 11 rows × 10 columns, enums, counts', () => {
  const m = es();
  assert.deepEqual(m.rows.map((r) => r.id), ['C1', 'C2', 'C3', 'C4', 'C5', 'C8', 'C6', 'C7', 'C10', 'C11', 'C9']);
  assert.equal(COLUMNS.length, 10);
  for (const r of m.rows) { for (const k of ['indicator', 'source', 'value', 'state', 'condition', 'threshold', 'result', 'freshness', 'contribution', 'explanation']) assert.ok(k in r, `${r.id}.${k}`); assert.ok(RESULTS.includes(r.result), r.id); }
  assert.ok(AGGREGATES.includes(m.signal));
  assert.equal(m.conditions_total, m.conditions_passed + m.conditions_failed + m.conditions_unknown + m.conditions_not_evaluated);
});

test('SIG02 gate fail ⇒ C3 first blocking with the gate "why"', () => {
  const m = es({ strength: 3, why: 'forca fraca ES/NQ', direction: 'NEUTRO', state: 'STAND_DOWN', gate: 'NOT_EVALUATED', prefilter: 'abaixo-limiar' });
  assert.equal(m.blocking_conditions[0].id, 'C3'); assert.match(m.why_not, /forca fraca/); assert.equal(m.signal, 'NEUTRAL');
});

test('SIG03 confidence < 75 ⇒ C5 blocks (prefilter abaixo-limiar)', () => {
  const m = es({ conf: 45, prefilter: 'abaixo-limiar', gate: 'NOT_EVALUATED' });
  assert.equal(m.blocking_conditions[0].id, 'C5'); assert.equal(m.signal, 'WAIT'); assert.match(m.why_not, /45 < 75/);
});

test('SIG04 OUTSIDE_RTH strategy mismatch ⇒ C7 blocks', () => {
  const m = es({ session: 'OUTSIDE_RTH', strategy: 'BEARISH', blockReason: 'SIGNAL_BLOCKED_STRATEGY_MISMATCH', gate: 'BLOCKED' });
  assert.equal(m.blocking_conditions[0].id, 'C7'); assert.match(m.why_not, /BEARISH ≠ sinal BULLISH/);
  assert.equal(es({ session: 'RTH', strategy: 'BEARISH' }).rows.find((r) => r.id === 'C7').result, 'NOT_APPLICABLE');
});

test('SIG05 RTH reactor ≤ 65 ⇒ C6 blocks; 65.0 exactly does not pass', () => {
  const m = es({ reactor: 60, blockReason: 'SIGNAL_BLOCKED_REACTOR', gate: 'BLOCKED' });
  assert.equal(m.blocking_conditions[0].id, 'C6');
  assert.equal(es({ reactor: 65 }).rows.find((r) => r.id === 'C6').result, 'FAIL');
  assert.equal(es({ reactor: 80, signals: 'STALE' }).rows.find((r) => r.id === 'C6').result, 'FAIL');
});

test('SIG06 cooldown ⇒ C8 blocks', () => {
  const m = es({ prefilter: 'cooldown', gate: 'NOT_EVALUATED' });
  assert.equal(m.blocking_conditions[0].id, 'C8');
});

test('SIG07 engine BUY: stale ⇒ INVALID_DATA; failing condition ⇒ WAIT + ENGINE_MATRIX_MISMATCH; all pass ⇒ BUY', () => {
  assert.equal(es({ uiState: 'BUY', age: 600000 }).signal, 'INVALID_DATA');
  const w = es({ uiState: 'BUY', conf: 45 }); assert.equal(w.signal, 'WAIT'); assert.ok(w.flags.includes('ENGINE_MATRIX_MISMATCH'));
  const b = es({ uiState: 'BUY' }); assert.equal(b.signal, 'BUY'); assert.ok(b.why_now);
  const n = es({ uiState: 'NEUTRAL' }); assert.notEqual(n.signal, 'BUY', 'matrix never creates a direction');
  assert.equal(es({ tapeLive: false, uiState: 'BUY' }).signal, 'INVALID_DATA');
});

test('SIG08 determinism + dead-condition detection', () => {
  assert.deepEqual(explain(mk()), explain(mk()));
  assert.deepEqual(deadConditions(), []);
  assert.equal(deadConditions({ conf_min: 101 })[0].id, 'C5');
  assert.equal(deadConditions({ strategy_required_in_rth: true })[0].finding, 'CONFLICT');
});

test('SIG09 knowledge cannot change the aggregate or any row', () => {
  const k = [{ source: 'SPOTGAMMA', statement: 'BUY NOW', lesson: 'x' }];
  const a = explain(mk({ conf: 45 })), b = explain({ ...mk({ conf: 45 }), knowledge: k });
  assert.deepEqual(b.symbols, a.symbols); assert.deepEqual(b.knowledge, k);
});

test('SIG10 thresholds match production source (read-only) + real fixture explains without crash', (t) => {
  const conso = path.join(os.homedir(), '.claude', 'consolidator-engine');
  const ce = path.join(conso, 'consolidator-engine.js'), as = path.join(conso, 'alfabot-signal.js');
  if (fs.existsSync(ce) && fs.existsSync(as)) {
    const a = fs.readFileSync(ce, 'utf8'), b = fs.readFileSync(as, 'utf8');
    assert.equal(Number(/TG_MIN_CONF\s*=\s*(\d+)/.exec(a)[1]), THRESHOLDS.TG_MIN_CONF);
    assert.equal(eval(/TG_COOLDOWN_MS\s*=\s*([\d\s*]+)[;,]/.exec(a)[1]), THRESHOLDS.TG_COOLDOWN_MS); // digits and * only
    assert.equal(Number(/REACTOR_MIN\s*=\s*(\d+)/.exec(b)[1]), THRESHOLDS.REACTOR_MIN);
  } else t.diagnostic('SKIP production constants: consolidator-engine source not readable on this machine');
  const m = explain({ alfabot: fixture('alfabot'), state: fixture('state'), now: Date.parse('2026-10-04T12:05:00Z') });
  for (const s of ['ES', 'NQ']) { assert.equal(m.symbols[s].signal, 'INVALID_DATA'); assert.equal(m.symbols[s].rows.find((r) => r.id === 'C1').result, 'FAIL'); }
});
