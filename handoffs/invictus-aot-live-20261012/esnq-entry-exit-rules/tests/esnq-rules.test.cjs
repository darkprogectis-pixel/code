'use strict';
// ES/NQ R1–R10 — testes determinísticos do candidato (staging). Sem rede, sem disco (sem persistPath/historyDir).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require(path.join(__dirname, '..', 'candidate', 'aot-sim.js'));
const B = require(path.join(__dirname, '..', 'base', 'aot-sim.js'));

const T0 = Date.parse('2026-10-14T14:00:00.000Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();
const A = (dir, strength = 4, why = null) => ({ dir, strength, why });
const sig = (bull, dir) => ({ bull_pct: bull, bear_pct: 100 - bull, direction: dir });
const pct = (es, nq, s = 0, ageSec = 10) => ({ ts: T0 + (s - ageSec) * 1000, es, nq });
const L70 = (s) => pct(sig(75, 'LONG'), sig(72, 'LONG'), s);
const CONF = { es: 'CONFIRMA', nq: 'CONFIRMA' };

function eng(params, emitEvent) { return C.createSimEngine({ params, emitEvent }); }
function openLong(e, s = 0, es = 6000, nq = 21000) {
  const r = e.tick({ anchor: A('LONG'), esSpot: es, nqSpot: nq, nowIso: iso(s), pct: L70(s), rth: true });
  assert.equal(r.side, 'LONG'); return r;
}

// ── ENTRADAS ─────────────────────────────────────────────────────────────────
test('R1 70/70 LONG abre (RTH, sem HIRO)', () => { openLong(eng()); });
test('R2 70/70 SHORT abre por bear_pct', () => {
  const r = eng().tick({ anchor: A('SHORT'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: pct(sig(20, 'SHORT'), sig(28, 'SHORT')), rth: true });
  assert.equal(r.side, 'SHORT');
});
test('R4 50/50 RTH sem HIRO bloqueia; HIRO só num ativo bloqueia; HIRO nos dois abre', () => {
  const p = pct(sig(60, 'LONG'), sig(55, 'LONG'));
  let r = eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p, rth: true });
  assert.equal(r.side, 'FLAT'); assert.equal(r.entryBlock, 'pct_rth_sem_hiro');
  r = eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p, rth: true, hiro: { es: 'CONFIRMA', nq: 'N/A' } });
  assert.equal(r.side, 'FLAT');
  r = eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p, rth: true, hiro: CONF });
  assert.equal(r.side, 'LONG');
});
test('R5 50/50 fora do RTH abre sem HIRO; rth ausente = RTH (exige HIRO)', () => {
  const p = pct(sig(60, 'LONG'), sig(55, 'LONG'));
  assert.equal(eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p, rth: false }).side, 'LONG');
  assert.equal(eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p }).entryBlock, 'pct_rth_sem_hiro');
});
test('R3/item 9: NEUTRO num ativo, divergência ES/NQ, abaixo de 50 bloqueiam', () => {
  const t = (p) => eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p, rth: false });
  assert.equal(t(pct(sig(75, 'LONG'), sig(50, 'NEUTRO'))).entryBlock, 'pct_neutro_nq');
  assert.equal(t(pct(sig(75, 'LONG'), sig(30, 'SHORT'))).entryBlock, 'pct_divergente_nq');
  assert.equal(t(pct(sig(49, 'LONG'), sig(80, 'LONG'))).entryBlock, 'pct_abaixo_min');
});
test('dados stale / ausentes / inválidos bloqueiam (fail-closed)', () => {
  const t = (p) => eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: p, rth: false });
  assert.equal(t(pct(sig(80, 'LONG'), sig(80, 'LONG'), 0, 91)).entryBlock, 'pct_stale');
  assert.equal(t(pct(sig(80, 'LONG'), sig(80, 'LONG'), 0, -5)).entryBlock, 'pct_stale');   // timestamp no futuro
  assert.equal(t(undefined).entryBlock, 'pct_ausente');
  assert.equal(t(pct(sig(80, 'LONG'), { bull_pct: null, bear_pct: null, direction: 'LONG' })).entryBlock, 'pct_invalido_nq');
  assert.equal(t(pct(sig(80, 'LONG'), { bull_pct: 0.8, bear_pct: 0.2, direction: 'LONG' })).entryBlock, 'pct_abaixo_min');   // escala 0–1 não passa
});
test('item 10: 70/70 sem anchor 4/4 NÃO abre (filtro adicional, nunca abre mais que o legado)', () => {
  for (const a of [A('LONG', 3), A('NEUTRO', 4), A('SHORT', 4)]) {
    assert.equal(eng().tick({ anchor: a, esSpot: 6000, nqSpot: 21000, nowIso: iso(0), pct: L70(0), rth: false }).side, 'FLAT');
  }
});
test('R6: entrada sempre conjunta; sem spot de uma perna não abre', () => {
  const r = eng().tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: null, nowIso: iso(0), pct: L70(0), rth: false });
  assert.equal(r.side, 'FLAT');
  const o = openLong(eng()); assert.ok(o.position.es && o.position.nq);
});

// ── SAÍDAS ───────────────────────────────────────────────────────────────────
const DIVERG = A('NEUTRO', 2, 'ES x NQ divergentes');
test('R7 NEUTRO com cesta positiva: mantém, PROTECTED; depois cai e fecha no piso com P&L REAL (gap, não zero)', () => {
  const e = eng(); openLong(e);
  let r = e.tick({ anchor: DIVERG, esSpot: 6004, nqSpot: 21000, nowIso: iso(5) });   // +$200
  assert.equal(r.side, 'LONG'); assert.equal(r.protected, true);
  r = e.tick({ anchor: A('LONG'), esSpot: 6003, nqSpot: 21000, nowIso: iso(6) });     // gate volta: segue PROTECTED
  assert.equal(r.protected, true);
  r = e.tick({ anchor: DIVERG, esSpot: 5998, nqSpot: 20990, nowIso: iso(7) });        // gap: -$100 -$200
  assert.equal(r.side, 'FLAT'); assert.equal(r.history[0].reason, 'protected_floor');
  assert.equal(r.history[0].totalUsd, -300);
});
test('R8 NEUTRO com cesta negativa fecha já; cesta = 0 fecha; preço ausente fecha (exit_desconhecido)', () => {
  let e = eng(); openLong(e);
  let r = e.tick({ anchor: DIVERG, esSpot: 5999, nqSpot: 21001, nowIso: iso(5) });   // -50 +20 = -30
  assert.equal(r.side, 'FLAT'); assert.equal(r.history[0].reason, 'anchor_neutro_negativo'); assert.equal(r.history[0].totalUsd, -30);
  e = eng(); openLong(e);
  r = e.tick({ anchor: DIVERG, esSpot: 6000, nqSpot: 21000, nowIso: iso(5) });
  assert.equal(r.history[0].reason, 'anchor_neutro_negativo');
  e = eng(); openLong(e);
  r = e.tick({ anchor: DIVERG, esSpot: 6010, nqSpot: null, nowIso: iso(5) });
  assert.equal(r.side, 'FLAT'); assert.equal(r.history[0].pnlStatus, 'exit_desconhecido');
});
test('NEUTRO transitório (forca fraca / sem tape / indefinido) não fecha nem protege', () => {
  const e = eng(); openLong(e);
  for (const why of ['forca fraca ES/NQ', 'sem tape', 'ES indefinido']) {
    const r = e.tick({ anchor: A('NEUTRO', 4, why), esSpot: 5995, nqSpot: 21000, nowIso: iso(5) });
    assert.equal(r.side, 'LONG'); assert.equal(r.protected, false);
  }
});
test('R9 $500 por ativo (ES 10pt / NQ 25pt); abaixo disso não fecha', () => {
  let e = eng(); openLong(e);
  assert.equal(e.tick({ anchor: A('LONG'), esSpot: 5990.25, nqSpot: 21000, nowIso: iso(5) }).side, 'LONG');   // -487.5
  let r = e.tick({ anchor: A('LONG'), esSpot: 5990, nqSpot: 21000, nowIso: iso(6) });
  assert.equal(r.history[0].reason, 'hard_stop_es');
  e = eng(); openLong(e);
  r = e.tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 20975, nowIso: iso(5) });
  assert.equal(r.history[0].reason, 'hard_stop_nq');
  assert.equal(r.position, null);
  assert.equal(C.createSimEngine().getState(6000, 21000).params.hardStopUsd, 500);
});
test('R9 cesta $1000 (isolada com limite por ativo maior) e gap além do stop registrado sem clamp', () => {
  let e = eng({ hardStopUsd: 2000 }); openLong(e);
  let r = e.tick({ anchor: A('LONG'), esSpot: 5988, nqSpot: 20980, nowIso: iso(5) });   // -600 -400
  assert.equal(r.history[0].reason, 'basket_stop'); assert.equal(r.history[0].totalUsd, -1000);
  e = eng(); openLong(e);
  r = e.tick({ anchor: A('LONG'), esSpot: 5970, nqSpot: 21000, nowIso: iso(5) });       // gap -30pt
  assert.equal(r.history[0].reason, 'hard_stop_es'); assert.equal(r.history[0].totalUsd, -1500);
});
test('R10 precedência: limite protetivo vence NEUTRO no mesmo tick', () => {
  const e = eng(); openLong(e);
  const r = e.tick({ anchor: DIVERG, esSpot: 5989, nqSpot: 21000, nowIso: iso(5) });
  assert.equal(r.history[0].reason, 'hard_stop_es');
});
test('trailing preservado (BE em +$500, degrau $250) e reentrada imediata só com 4/4', () => {
  const e = eng(); openLong(e);
  e.tick({ anchor: A('LONG'), esSpot: 6015, nqSpot: 21000, nowIso: iso(5) });            // +750 ES => stop 6005
  const r = e.tick({ anchor: A('LONG'), esSpot: 6005, nqSpot: 21000, nowIso: iso(6), pct: L70(6), rth: false });
  assert.equal(r.history[0].reason, 'trailing_stop_es'); assert.equal(r.history[0].totalUsd, 250);
  assert.equal(r.side, 'LONG');   // reentrada imediata (filtro % atendido)
});
test('custos: P&L bruto (sem comissão/slippage no motor — lacuna documentada)', () => {
  const e = eng(); openLong(e);
  const r = e.tick({ anchor: DIVERG, esSpot: 5999.75, nqSpot: 21000, nowIso: iso(5) });
  assert.equal(r.history[0].totalUsd, -12.5);
});

// ── IDEMPOTÊNCIA ─────────────────────────────────────────────────────────────
test('eventos: 1 OPEN e 1 CLOSE por trade_id mesmo com ticks repetidos e mudança rápida do Gate', () => {
  const evs = []; let seq = 0;
  const e = eng({}, (ev) => { evs.push(ev); return { seq: ++seq }; });
  for (let i = 0; i < 3; i++) e.tick({ anchor: A('LONG'), esSpot: 6000, nqSpot: 21000, nowIso: iso(i), pct: L70(i), rth: false });
  for (let i = 3; i < 8; i++) e.tick({ anchor: i % 2 ? DIVERG : A('LONG'), esSpot: 5998, nqSpot: 21000, nowIso: iso(i) });
  const open = evs.filter(x => x.action === 'OPEN'), close = evs.filter(x => x.action === 'CLOSE');
  assert.equal(open.length, 1); assert.equal(close.length, 1);
  assert.equal(close[0].trade_id, open[0].trade_id); assert.equal(close[0].reason, 'anchor_neutro_negativo');
});

// ── PARIDADE / OUTROS FLOWS ──────────────────────────────────────────────────
test('paridade: com params legados o candidato reproduz a base (sequência pseudo-aleatória 3000 ticks)', () => {
  const LEG = { hardStopUsd: 1000, basketStopUsd: 0, neutroPositiveProtect: false, pctRules: false };
  const b = B.createSimEngine(), c = C.createSimEngine({ params: LEG });
  let x = 12345; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  let es = 6000, nq = 21000;
  const whys = [null, 'ES x NQ divergentes', 'forca fraca ES', 'sem tape', 'ES indefinido'];
  for (let i = 0; i < 3000; i++) {
    es = Math.round((es + (rnd() - 0.5) * 6) * 4) / 4; nq = Math.round((nq + (rnd() - 0.5) * 15) * 4) / 4;
    const k = rnd(); const dir = k < 0.4 ? 'LONG' : k < 0.7 ? 'SHORT' : 'NEUTRO';
    const a = { dir, strength: Math.floor(rnd() * 5), why: dir === 'NEUTRO' ? whys[Math.floor(rnd() * whys.length)] : null };
    const inp = { anchor: a, esSpot: rnd() < 0.02 ? null : es, nqSpot: nq, nowIso: iso(i * 7) };
    const rb = b.tick(inp), rc = c.tick(inp);
    assert.equal(rc.side, rb.side, 'tick ' + i);
    assert.deepEqual(rc.pnl, rb.pnl, 'tick ' + i);
    assert.deepEqual(rc.history.map(h => [h.reason, h.totalUsd]), rb.history.map(h => [h.reason, h.totalUsd]), 'tick ' + i);
  }
});
test('API do módulo inalterada (BFF e porte C# não quebram)', () => {
  assert.deepEqual(Object.keys(C).sort(), Object.keys(B).sort());
  assert.deepEqual(Object.keys(C.createSimEngine()).sort(), Object.keys(B.createSimEngine()).sort());
});
