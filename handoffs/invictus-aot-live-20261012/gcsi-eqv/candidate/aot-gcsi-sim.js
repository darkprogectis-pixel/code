// ─────────────────────────────────────────────────────────────────────────────
// AOT — Simulador GC/SI INDEPENDENTE (aot-gcsi-sim.js) — 2026-10-14, GC/SI = ES/NQ (decisão do operador).
//
// Reusa o MESMO motor do ES/NQ (aot-sim.js createSimEngine, sem alteração): entrada só com 4/4 + LONG|SHORT da
// âncora (AoGate.GcSi, força incluída), 1 GC + 1 SI, hard stop US$1000/ativo, breakeven com US$500, trailing de
// US$250 em US$250, cooldown 60 s, histerese 4/4, NEUTRO transitório ("forca fraca"/"sem tape"/"indefinid") mantém,
// "GC x SI divergentes" fecha. As pernas do motor se chamam es/nq; aqui elas SÃO gc/si (mapeadas na saída).
//
// ISOLAMENTO (risco do checkpoint, item 4): este motor NUNCA usa o emissor do ES/NQ nem /sim/events (consumido pelo
// executor INVICTUS no NT8). Eventos vão para um journal PRÓPRIO (<dir>/gcsi-events-YYYY-MM.jsonl, schema
// 'aot-gcsi-sim/event v1', source 'AOT_GCSI_SIM_ISOLATED'), estado em <dir>/gcsi-sim-state.json e histórico
// EXCLUSIVO GC/SI em <dir>/trades-YYYY-MM.jsonl (diretório próprio, nunca o history/ do ES/NQ). Nenhuma ordem.
//
// SI: tick 0,005 (3 casas). O motor arredonda preços a 2 casas (r2); para não deslocar a entrada do SI do grid de
// tick, o preço entra multiplicado por SI_PX_SCALE (10) e o multiplicador em $/pt é dividido pelo mesmo fator
// (5000/10 = 500): P&L em US$ idêntico, preços exatos; a saída devolve o preço do SI na escala real.
// GC: tick 0,1, US$100/pt — sem escala. Hard stop US$1000 = 10 pt GC / 0,20 SI.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSimEngine } = require('./aot-sim');

const SI_PX_SCALE = 10;
const GCSI_PARAMS = { contractsEs: 1, contractsNq: 1, multEs: 100, multNq: 5000 / SI_PX_SCALE };
const EVENTS_RE = /^gcsi-events-(\d{4})-(\d{2})\.jsonl$/;
const TRADES_RE = /^trades-(\d{4})-(\d{2})\.jsonl$/;
const EVENT_SCHEMA = 'aot-gcsi-sim/event v1';
const EVENT_SOURCE = 'AOT_GCSI_SIM_ISOLATED';

const pxOk = (x) => typeof x === 'number' && isFinite(x) && x > 0;
const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
const siOut = (x) => (x == null ? null : r3(x / SI_PX_SCALE));
const mapReason = (r) => typeof r === 'string' ? r.replace(/_es$/, '_gc').replace(/_nq$/, '_si') : r;

function readLines(dir, re) {
  const out = []; let bad = 0;
  let files = [];
  try { files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).sort() : []; } catch { files = []; }
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { bad++; }
    }
  }
  return { rows: out, bad };
}

// Registro do motor (pernas es/nq) → registro GC/SI (pernas gc/si, SI na escala real).
function mapTrade(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const leg = (l, si) => l ? { entry: si ? siOut(l.entry) : l.entry, exit: si ? siOut(l.exit) : l.exit, pnlUsd: l.pnlUsd } : null;
  const o = Object.assign({}, rec);
  delete o.es; delete o.nq;
  o.gc = leg(rec.es, false); o.si = leg(rec.nq, true);
  o.reason = mapReason(rec.reason);
  o.instruments = { gc: 'GC', si: 'SI' };
  o.book = 'GCSI_SIM';
  return o;
}

function createGcSiSim({ dir } = {}) {
  if (!dir) throw new Error('aot-gcsi-sim: dir obrigatório (diretório EXCLUSIVO GC/SI)');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // ── canal de eventos ISOLADO (idempotente por event_id, como o emissor ES/NQ; outro arquivo, outro seq) ──
  let seq = 0; const idx = new Map();
  for (const e of readLines(dir, EVENTS_RE).rows) {
    if (e && Number.isInteger(e.seq)) { if (e.seq > seq) seq = e.seq; if (typeof e.event_id === 'string') idx.set(e.event_id, e.seq); }
  }
  function emitEvent(evt) {
    if (evt && typeof evt.event_id === 'string' && idx.has(evt.event_id)) return { seq: idx.get(evt.event_id), event_id: evt.event_id, duplicate: true };
    const s = seq + 1;
    const event_id = (evt && typeof evt.event_id === 'string' && evt.event_id) || crypto.randomUUID();
    const rec = Object.assign({}, evt, { schema: EVENT_SCHEMA, source: EVENT_SOURCE, seq: s, event_id,
      gc_price: evt ? (evt.es_price == null ? null : evt.es_price) : null,
      si_price: evt ? siOut(evt.nq_price) : null,
      reason: evt ? mapReason(evt.reason) : null, instruments: { gc: 'GC', si: 'SI' }, simulated: true, orders: 'NONE' });
    delete rec.es_price; delete rec.nq_price;
    if (rec.action === 'OPEN' && !rec.trade_id) rec.trade_id = event_id;
    if (!rec.created_at) rec.created_at = new Date().toISOString();
    rec.replay = !!rec.replay;
    fs.appendFileSync(path.join(dir, 'gcsi-events-' + String(rec.created_at).slice(0, 7) + '.jsonl'), JSON.stringify(rec) + '\n');
    seq = s; idx.set(event_id, s);
    return { seq: s, event_id };
  }

  const engine = createSimEngine({ persistPath: path.join(dir, 'gcsi-sim-state.json'), historyDir: dir, params: GCSI_PARAMS, emitEvent });

  function mapState(s) {
    if (!s || typeof s !== 'object') return s;
    const pos = s.position ? {
      gc: s.position.es ? Object.assign({}, s.position.es) : null,
      si: s.position.nq ? Object.assign({}, s.position.nq, { entry: siOut(s.position.nq.entry), stop: siOut(s.position.nq.stop), hardStop: siOut(s.position.nq.hardStop) }) : null,
    } : null;
    return {
      schema: 'aot-gcsi-sim/1', mode: 'simulation', book: 'GCSI_SIM', orders: 'NONE', channel: 'ISOLATED (journal gcsi-events-*.jsonl proprio)',
      meta: { simulated: true, note: 'Simulação GC/SI independente — sem execução real, sem conta, sem ordem. Histórico exclusivo GC/SI.' },
      side: s.side, position: pos,
      pnl: s.pnl ? { gcUsd: s.pnl.esUsd, siUsd: s.pnl.nqUsd, totalUsd: s.pnl.totalUsd } : null,
      marks: s.marks ? { gcSpot: s.marks.esSpot, siSpot: siOut(s.marks.nqSpot) } : null,
      openedAt: s.openedAt, closedAt: s.closedAt, cooldownUntil: s.cooldownUntil, trade: s.trade || null,
      anchor: s.anchor,
      params: { contractsGc: 1, contractsSi: 1, multGc: 100, multSi: 5000, hardStopUsd: s.params.hardStopUsd, beAtProfitUsd: s.params.beAtProfitUsd,
        stepProfitUsd: s.params.stepProfitUsd, stepStopUsd: s.params.stepStopUsd, cooldownSec: s.params.cooldownSec, requireFreshFourOfFour: s.params.requireFreshFourOfFour,
        siPxScale: SI_PX_SCALE },
      history: Array.isArray(s.history) ? s.history.map(mapTrade) : [],
    };
  }

  // anchor = âncora do gate GC/SI já resolvida pelo BFF ({dir:'LONG'|'SHORT'|'NEUTRO', strength, why}).
  function tick({ anchor, gcSpot, siSpot, nowIso, replay }) {
    const s = engine.tick({ anchor, esSpot: pxOk(gcSpot) ? gcSpot : null, nqSpot: pxOk(siSpot) ? siSpot * SI_PX_SCALE : null,
      nowIso, priceSource: 'nt8-5151-gcsi', replay: !!replay });
    return mapState(s);
  }

  function readEvents(after, limit) {
    const rows = readLines(dir, EVENTS_RE).rows.filter(e => Number.isInteger(e.seq)).sort((a, b) => a.seq - b.seq);
    const out = rows.filter(e => e.seq > after);
    return { events: out.slice(0, limit), more: out.length > limit, last_seq: seq };
  }

  // Histórico EXCLUSIVO GC/SI: só os trades-*.jsonl deste diretório; sem replay por padrão.
  function readHistory(days, includeReplay) {
    const r = readLines(dir, TRADES_RE);
    const since = Date.now() - days * 86400000;
    const trades = r.rows.filter(t => t && t.closedAt && Date.parse(t.closedAt) >= since && (includeReplay || !t.replay)).map(mapTrade)
      .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));
    const ok = trades.filter(t => t.pnlStatus === 'ok' && typeof t.totalUsd === 'number');
    const wins = ok.filter(t => t.totalUsd > 0).length;
    const sum = ok.reduce((a, t) => a + t.totalUsd, 0);
    return { schema: 'aot-gcsi-history/1', book: 'GCSI_SIM', exclusive: true, simulated: true, days, includeReplay: !!includeReplay,
      count: trades.length, bad_lines: r.bad,
      summary: { trades: ok.length, wins, losses: ok.length - wins, totalUsd: Math.round(sum * 100) / 100, winRate: ok.length ? Math.round(wins / ok.length * 1000) / 10 : null },
      trades };
  }

  return { tick, getState: () => mapState(engine.getState()), readEvents, readHistory, dir, params: GCSI_PARAMS };
}

module.exports = { createGcSiSim, SI_PX_SCALE, GCSI_PARAMS, mapTrade, EVENT_SCHEMA, EVENT_SOURCE };
