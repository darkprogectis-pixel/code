'use strict';
// ES/NQ ordem R3 — integração BFF (staging): simEntryInputs com a fixture REAL do relay :3457 + adapter HIRO de produção,
// ligação estática no BFF candidato e escopo do diff do BFF. Sem rede, sem disco além de leitura.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'candidate', 'aot-sim.js'));
const hiroDarkflow = require(path.join(ROOT, 'base', 'bff', 'hiro-darkflow-adapter.cjs'));
const gex = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'relay-3457-snapshot.json'), 'utf8'));

// mesmo cálculo do BFF: c2ForSym(sym, dir, flow_hiro, rth).confirm = hiroConfirmDarkflow(...).confirm
const hiroForAt = (nowMs, rth) => (sym, d) => hiroDarkflow.hiroConfirmDarkflow(d, sym, gex.flow_hiro, nowMs, { rth: rth === true }).confirm;
const GATE = (open, dir = 'SHORT') => ({ open, anchor: { dir, strength: 4, why: null } });
const NOW = gex.signals.ts + 10000;
const nowIso = new Date(NOW).toISOString();

test('fixture real: simEntryInputs extrai signals ES/NQ (bull_pct/bear_pct/direction, ts) e HIRO vs direção do Gate', () => {
  const r = C.simEntryInputs({ gex, gate: GATE(true), rth: true, hiroFor: hiroForAt(NOW, true) });
  assert.equal(r.gateOpen, true);
  assert.equal(r.rth, true);
  assert.equal(r.pct.ts, gex.signals.ts);
  assert.deepEqual(r.pct.es, { bull_pct: 24, bear_pct: 76, direction: 'SHORT' });
  assert.deepEqual(r.pct.nq, { bull_pct: 37, bear_pct: 63, direction: 'SHORT' });
  assert.deepEqual(r.hiro, { es: 'N/A', nq: 'N/A' });   // fornecedor HIRO parado na captura (pós-fechamento) => N/A real
});

test('fixture real no motor: ES 76 / NQ 63 SHORT (faixa 50) => RTH sem HIRO bloqueia; fora RTH abre; Gate fechado bloqueia', () => {
  const run = (rth, open, hiroFor) => {
    const inp = C.simEntryInputs({ gex, gate: GATE(open), rth, hiroFor: hiroFor || hiroForAt(NOW, rth) });
    return C.createSimEngine().tick(Object.assign({ anchor: GATE(open).anchor, esSpot: 6000, nqSpot: 21000, nowIso }, inp));
  };
  let r = run(true, true);  assert.equal(r.side, 'FLAT'); assert.equal(r.entryBlock, 'pct_rth_sem_hiro');
  r = run(false, true);     assert.equal(r.side, 'SHORT');
  r = run(false, false);    assert.equal(r.side, 'FLAT'); assert.equal(r.entryBlock, 'gate_nao_open');
  r = run(true, true, () => 'CONFIRMA');   assert.equal(r.side, 'SHORT');      // HIRO convergente nos dois => 50 em RTH abre
  r = run(true, true, (s) => s === 'ES' ? 'CONFIRMA' : 'DIVERGE'); assert.equal(r.entryBlock, 'pct_rth_sem_hiro');
  r = run(true, false, () => 'CONFIRMA');  assert.equal(r.entryBlock, 'gate_nao_open');
});

test('Gate LONG contra signals SHORT reais => divergente (direção não confirmada)', () => {
  const inp = C.simEntryInputs({ gex, gate: GATE(true, 'LONG'), rth: false, hiroFor: () => 'CONFIRMA' });
  const r = C.createSimEngine().tick(Object.assign({ anchor: { dir: 'LONG', strength: 4 }, esSpot: 6000, nqSpot: 21000, nowIso }, inp));
  assert.equal(r.side, 'FLAT'); assert.equal(r.entryBlock, 'pct_divergente_es');
});

test('payload ausente/erro/sem direção => fail-closed', () => {
  for (const g of [null, undefined, { _err: 'offline' }, {}, { signals: 'x' }]) {
    const r = C.simEntryInputs({ gex: g, gate: GATE(true), rth: false, hiroFor: () => 'CONFIRMA' });
    assert.equal(r.pct, null);
  }
  assert.equal(C.simEntryInputs({ gex, gate: { open: true, anchor: { dir: 'NEUTRO' } }, rth: true, hiroFor: () => 'CONFIRMA' }).hiro, null);
  assert.equal(C.simEntryInputs({ gex, gate: null, rth: 'x' }).gateOpen, false);
  assert.equal(C.simEntryInputs({ gex, gate: { open: 'true' } }).rth, undefined);
  assert.equal(C.simEntryInputs({ gex, gate: { open: 'true' } }).gateOpen, false);
  const thrower = C.simEntryInputs({ gex, gate: GATE(true), rth: true, hiroFor: () => { throw new Error('x'); } });
  assert.deepEqual(thrower.hiro, { es: 'N/A', nq: 'N/A' });
  const stale = C.simEntryInputs({ gex, gate: GATE(true), rth: false, hiroFor: () => 'CONFIRMA' });
  const r = C.createSimEngine().tick(Object.assign({ anchor: GATE(true).anchor, esSpot: 6000, nqSpot: 21000, nowIso: new Date(gex.signals.ts + 91000).toISOString() }, stale));
  assert.equal(r.entryBlock, 'pct_stale');
});

test('BFF candidato: ligação estática (import + chamada com gex/gate/t.rth/c2ForSym) e sintaxe válida', () => {
  const src = fs.readFileSync(path.join(ROOT, 'candidate', 'bff', 'aot-bff.js'), 'utf8');
  assert.match(src, /const \{ createSimEngine, simEntryInputs \} = require\('\.\/aot-sim'\);/);
  assert.match(src, /simEntryInputs\(\{ gex, gate, rth: t\.rth, hiroFor: \(sym, d\) => c2ForSym\(sym, d, gex && !gex\._err \? gex\.flow_hiro : null, t\.rth\)\.confirm \}\)/);
  assert.match(src, /simEngine\.tick\(Object\.assign\(\{ anchor: gate\.anchor, esSpot, nqSpot, nowIso, priceSource: SIM_PRICE_SOURCE, replay: simReplay \}, simIn\)\)/);
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'candidate', 'bff', 'aot-bff.js')]);
});

test('diff do BFF: só as 2 mudanças (import + chamada do tick); nada de ordem/NT8/fetch novo', () => {
  const a = fs.readFileSync(path.join(ROOT, 'base', 'bff', 'aot-bff.js'), 'utf8').split(/\r?\n/);
  const b = fs.readFileSync(path.join(ROOT, 'candidate', 'bff', 'aot-bff.js'), 'utf8').split(/\r?\n/);
  assert.equal(b.length, a.length + 2);
  const removed = a.filter((l, i) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));
  assert.equal(removed.length, 2);
  assert.match(removed[0], /require\('\.\/aot-sim'\)/);
  assert.match(removed[1], /simEngine\.tick\(\{ anchor: gate\.anchor/);
  assert.equal(added.length, 4);
  for (const l of added) assert.doesNotMatch(l, /fetch\(|http|order|5151|writeFile|spawn/i);
});
