// SYNC TOTAL 2026-10-01 — lado AOT: aot-sim.js (require do disco) + bloco EVENTO CANONICO do aot-bff.js (VERBATIM,
// extraido do arquivo entre "// ── EVENTO CANONICO" e "const simEngine =") num diretorio temporario. Sem rede, sem BFF vivo.
// Uso: node test_sync.js   → exit 0 = tudo PASS. Escreve out/events-fixture.json p/ o teste C# (ProgramSync.cs).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const AOT = process.env.AOT_DIR || path.join(__dirname, 'aot');   // (2026-10-02, invictus/exec v1) copias do staging; AOT_DIR=C:/Users/ADM/.claude/aot = controle live
const { createSimEngine } = require(path.join(AOT, 'aot-sim.js'));
const BFF_SRC = fs.readFileSync(path.join(AOT, 'aot-bff.js'), 'utf8');
const i0 = BFF_SRC.indexOf('// ── EVENTO CANONICO'), i1 = BFF_SRC.indexOf('const simEngine = ');
if (i0 < 0 || i1 < i0) { console.log('FAIL bloco EVENTO CANONICO nao encontrado no aot-bff.js'); process.exit(1); }
const BLOCO = BFF_SRC.slice(i0, i1);

let pass = 0, fail = 0;
function ok(c, what, det) { if (c) { pass++; console.log('PASS ' + what); } else { fail++; console.log('FAIL ' + what + (det ? '  -> ' + det : '')); } }

// instancia o bloco verbatim num diretorio isolado (= boot do BFF)
function bootBff(dir) {
  const f = new Function('fs', 'path', 'crypto', 'SIM_HISTORY_DIR', 'SIM_ON',
    BLOCO + '\nreturn { simEmitEvent, simEventsRead, lastSeq: () => simEventSeq };');
  return f(fs, path, crypto, dir, true);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aot-sync-'));
const hist = path.join(tmp, 'history');
let bff = bootBff(hist);
let sim = createSimEngine({ persistPath: path.join(tmp, 'sim-state.json'), historyDir: hist, emitEvent: bff.simEmitEvent });

let t = Date.parse('2026-10-01T14:00:00.000Z');
const iso = () => new Date(t).toISOString();
const A = (dir, strength, why) => ({ dir, strength, why: why || null });
function tick(anchor, es, nq, secs) { t += (secs || 20) * 1000; return sim.tick({ anchor, esSpot: es, nqSpot: nq, nowIso: iso(), priceSource: 'gexbot', replay: false }); }

// ── A) OPEN → 1 evento; trade_id = event_id do OPEN; seq 1 ──
tick(A('NEUTRO', 2), 6000, 21000);
tick(A('LONG', 4), 6001, 21001);
let ev = bff.simEventsRead(0, 100).events;
ok(ev.length === 1 && ev[0].action === 'OPEN' && ev[0].seq === 1, 'A1 OPEN gera exatamente 1 evento seq=1', JSON.stringify(ev));
ok(ev[0] && ev[0].trade_id === ev[0].event_id && ev[0].source === 'AOT_CANONICAL' && ev[0].schema === 'aot-sim/event v1', 'A2 trade_id = event_id do OPEN; schema/source canonicos');
ok(ev[0] && ev[0].direction === 'LONG' && ev[0].strength === 4 && ev[0].es_price === 6001 && ev[0].nq_price === 21001 && ev[0].replay === false, 'A3 direction/strength/precos/replay no evento');
const st1 = sim.getState(6001, 21001);
ok(st1.trade && st1.trade.trade_id === ev[0].trade_id && st1.trade.seq_open === 1, 'A4 estado do SIM carrega o trade_id do evento');

// ── B) mesmo tick 3x com a posicao aberta: nenhum evento novo (o decisor emite UMA vez) ──
tick(A('LONG', 4), 6002, 21002); tick(A('LONG', 4), 6002, 21002); tick(A('LONG', 4), 6002, 21002);
ok(bff.simEventsRead(0, 100).events.length === 1, 'B1 decisao repetida nao duplica evento');

// ── G) CLOSE refere o MESMO trade_id; registro do SIM com os 2 event_id ──
tick(A('NEUTRO', 1, 'gate neutro'), 6003, 21003);
ev = bff.simEventsRead(0, 100).events;
ok(ev.length === 2 && ev[1].action === 'CLOSE' && ev[1].seq === 2 && ev[1].trade_id === ev[0].trade_id, 'G1 CLOSE seq=2 com o trade_id do OPEN');
ok(ev[1].reason === 'anchor_neutro' && ev[1].direction === 'LONG', 'G2 reason/direction do CLOSE');
const mes = iso().slice(0, 7);
const recs = fs.readFileSync(path.join(hist, 'trades-' + mes + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const r0 = recs[recs.length - 1];
ok(r0.trade_id === ev[0].trade_id && r0.event_id_open === ev[0].event_id && r0.event_id_close === ev[1].event_id && r0.seq_open === 1 && r0.seq_close === 2,
   'J1 registro do AOT SIM grava trade_id/event_id_open/event_id_close/seq', JSON.stringify(r0));

// ── C) restart do BFF: seq recuperado do log (monotonico, sem reuso) ──
bff = bootBff(hist);
ok(bff.lastSeq() === 2, 'C1 boot recupera last_seq=2 do log');
sim = createSimEngine({ persistPath: path.join(tmp, 'sim-state.json'), historyDir: hist, emitEvent: bff.simEmitEvent });
tick(A('NEUTRO', 2), 6000, 21000, 70);          // cooldown 60 s + histerese
tick(A('SHORT', 4), 5990, 20990);
ev = bff.simEventsRead(2, 100).events;
ok(ev.length === 1 && ev[0].seq === 3 && ev[0].action === 'OPEN' && ev[0].direction === 'SHORT', 'C2 apos restart: proximo evento seq=3 (after=2 devolve so ele)');
const ids = bff.simEventsRead(0, 100).events.map(e => e.event_id);
ok(new Set(ids).size === ids.length, 'C3 event_id unicos');

// ── E) gate oscilando < 20 s: so o tick do AOT decide; o log tem SO as decisoes dele (o consumidor nao re-amostra) ──
const antes = bff.simEventsRead(0, 1000).events.length;
for (let k = 0; k < 6; k++) tick(k % 2 ? A('SHORT', 4) : A('SHORT', 3, 'forca fraca 3/4'), 5989, 20989, 5);
ok(bff.simEventsRead(0, 1000).events.length === antes, 'E1 flicker 4/4↔3/4 com posicao aberta: nenhum evento (decisao unica no AOT)');
tick(A('NEUTRO', 0, 'gate neutro'), 5985, 20985);
const todos = bff.simEventsRead(0, 1000).events;
ok(todos.map(e => e.seq).join(',') === '1,2,3,4', 'E2 seq 1..4 sem lacuna, ordenado', todos.map(e => e.seq).join(','));
ok(todos[3].action === 'CLOSE' && todos[3].trade_id === todos[2].trade_id, 'E3 CLOSE do 2o trade refere o trade_id dele');

// ── D) limit/more + linha torta (crash no meio do append) ignorada e contada ──
const p1 = bff.simEventsRead(0, 2);
ok(p1.events.length === 2 && p1.more === true && p1.events[1].seq === 2, 'D1 limit=2 → more=true, ordenado por seq');
fs.appendFileSync(path.join(hist, 'events-' + mes + '.jsonl'), '{"seq":5,"event_id":"x"');   // linha incompleta
const p2 = bff.simEventsRead(0, 100);
ok(p2.events.length === 4 && p2.bad_lines === 1, 'D2 linha torta ignorada (bad_lines=1)');
ok(fs.readdirSync(hist).filter(f => /^trades-/.test(f)).length === 1, 'D3 trades-*.jsonl separado de events-*.jsonl (archive/histLerDir intactos)');

// ── replay=true marcado no evento ──
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aot-sync-r-')); const h2 = path.join(tmp2, 'history');
const b2 = bootBff(h2); const s2 = createSimEngine({ persistPath: path.join(tmp2, 's.json'), historyDir: h2, emitEvent: b2.simEmitEvent });
s2.tick({ anchor: A('LONG', 4), esSpot: 6000, nqSpot: 21000, nowIso: iso(), priceSource: 'nt8', replay: true });
const er = b2.simEventsRead(0, 10).events;
ok(er.length === 1 && er[0].replay === true, 'R1 evento de replay marcado replay=true');

// ── OB) PRE-INSTALACAO B3 AOT_EMIT_BEFORE_SAVE: OUTBOX + append idempotente. Crash = throw injetado no emissor
//    (antes/depois do append real) + "morte do processo" = descartar BFF e motor e recriar AMBOS a partir do disco. ──
function cenario(t0) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aot-ob-'));
  const c = { d, hist: path.join(d, 'history'), state: path.join(d, 'sim-state.json'), mode: null, t: Date.parse(t0) };
  c.boot = () => {
    c.bff = bootBff(c.hist);
    const em = (evt) => {
      if (c.mode === 'before') throw new Error('crash injetado antes do append');
      const r = c.bff.simEmitEvent(evt);
      if (c.mode === 'after') throw new Error('crash injetado depois do append');
      return r;
    };
    c.sim = createSimEngine({ persistPath: c.state, historyDir: c.hist, emitEvent: em });
  };
  c.tick = (anchor, es, nq, secs) => { c.t += (secs || 20) * 1000;
    return c.sim.tick({ anchor, esSpot: es, nqSpot: nq, nowIso: new Date(c.t).toISOString(), priceSource: 'gexbot', replay: false }); };
  c.crash = (anchor, es, nq, secs) => { try { c.tick(anchor, es, nq, secs); return false; } catch { return true; } };
  c.ev = () => bootBff(c.hist).simEventsRead(0, 1000).events;   // o que o INVICTUS le em /sim/events (log no disco)
  c.disk = () => JSON.parse(fs.readFileSync(c.state, 'utf8'));
  c.trades = () => fs.existsSync(c.hist) ? fs.readdirSync(c.hist).filter(f => /^trades-/.test(f))
    .flatMap(f => fs.readFileSync(path.join(c.hist, f), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) : [];
  c.boot();
  return c;
}
const pend = (c) => (c.disk().pendingEvents || []).length;
const errLog = console.error; console.error = () => { };   // silencia o aviso esperado do flush no boot com crash injetado

// OB-A1 crash ANTES de persistir a decisao (save atomico falha: diretorio do state inexistente) => nenhum estado/evento
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aot-ob1-')); const h = path.join(d, 'history');
  const sp = path.join(d, 'nao-existe', 'sim-state.json');
  let b = bootBff(h), s = createSimEngine({ persistPath: sp, historyDir: h, emitEvent: b.simEmitEvent });
  let threw = false; try { s.tick({ anchor: A('LONG', 4), esSpot: 6000, nqSpot: 21000, nowIso: '2026-10-01T14:00:00.000Z' }); } catch { threw = true; }
  b = bootBff(h); s = createSimEngine({ persistPath: sp, historyDir: h, emitEvent: b.simEmitEvent });   // restart
  ok(threw && !fs.existsSync(sp) && b.simEventsRead(0, 10).events.length === 0 && s.getState(null, null).side === 'FLAT',
    'OB-A1 crash antes de persistir a decisao => tick falha alto, nenhum estado e nenhum evento; restart FLAT');
}
// OB-A2 state + pending persistidos ANTES do append (crash antes do append) => restart publica exatamente 1 evento
const c2 = cenario('2026-10-01T14:00:00.000Z');
c2.mode = 'before';
const cr2 = c2.crash(A('LONG', 4), 6000, 21000);
const d2 = c2.disk();
ok(cr2 && d2.side === 'LONG' && pend(c2) === 1 && d2.pendingEvents[0].evt.action === 'OPEN' && c2.ev().length === 0,
  'OB-A2a crash antes do append: state LONG + 1 pendente OPEN no disco, log vazio');
c2.mode = null; c2.boot();   // restart
const e2 = c2.ev();
ok(e2.length === 1 && e2[0].action === 'OPEN' && e2[0].event_id === d2.pendingEvents[0].evt.event_id && pend(c2) === 0,
  'OB-A2b restart publica EXATAMENTE 1 evento (o pendente, mesmo event_id) e limpa o outbox');
// OB-A3 append concluido antes de limpar o pending => restart NAO duplica; mesmo event_id; mesmo seq
const c3 = cenario('2026-10-01T14:00:00.000Z');
c3.mode = 'after';
const cr3 = c3.crash(A('SHORT', 4), 6000, 21000);
const ea = c3.ev(), pa = c3.disk().pendingEvents;
ok(cr3 && ea.length === 1 && pa.length === 1 && pa[0].evt.event_id === ea[0].event_id, 'OB-A3a crash depois do append: 1 evento no log + pendente ainda no disco');
c3.mode = null; c3.boot();
const eb = c3.ev();
ok(eb.length === 1, 'OB-A3b restart NAO duplica o evento (EVENT APPEND IDEMPOTENT)');
ok(eb[0].event_id === ea[0].event_id, 'OB-A3c SAME EVENT_ID AFTER CRASH');
ok(eb[0].seq === ea[0].seq && c3.disk().trade.seq_open === ea[0].seq && pend(c3) === 0, 'OB-A3d SAME SEQ AFTER CRASH (log e state.trade.seq_open)');
// OB-A4 OPEN recovery: AOT SIM (state/trade) e INVICTUS (/sim/events) com o MESMO event_id/trade_id
const st4 = c2.disk().trade, e4 = c2.ev()[0];
ok(st4 && st4.trade_id === e4.trade_id && st4.event_id_open === e4.event_id && e4.trade_id === e4.event_id && st4.seq_open === e4.seq,
  'OB-A4 OPEN recovery: SIM.trade_id = event_id_open = evento.trade_id = evento.event_id; seq_open = seq do log');
// OB-A5 CLOSE recovery (crash antes E depois do append): mesmo trade_id, exatamente 1 CLOSE, 1 registro de trade
for (const m of ['before', 'after']) {
  const c = cenario('2026-10-01T14:00:00.000Z');
  c.tick(A('LONG', 4), 6000, 21000);
  const tid = c.disk().trade.trade_id;
  c.mode = m; const cr = c.crash(A('NEUTRO', 0, 'ES x NQ divergentes'), 6001, 21001);
  c.mode = null; c.boot(); c.boot();
  c.tick(A('NEUTRO', 0, 'ES x NQ divergentes'), 6001, 21001);   // FLAT: nada a fechar de novo
  const ev = c.ev(), cl = ev.filter(e => e.action === 'CLOSE'), tr = c.trades();
  ok(cr && cl.length === 1 && cl[0].trade_id === tid && tr.length === 1 && tr[0].trade_id === tid && tr[0].event_id_close === cl[0].event_id
    && tr[0].seq_close === cl[0].seq && c.disk().side === 'FLAT' && pend(c) === 0,
    'OB-A5' + (m === 'before' ? 'a' : 'b') + ' CLOSE recovery (crash ' + m + ' append): mesmo trade_id, 1 CLOSE, 1 trade com seq_close do log');
}
// OB-A6 multiplos restarts (crash depois do append, 5 restarts, 2 deles com o emissor falhando de novo) => sem duplicata
{
  const c = cenario('2026-10-01T14:00:00.000Z');
  c.mode = 'after'; c.crash(A('LONG', 4), 6000, 21000);
  for (let i = 0; i < 5; i++) { c.mode = (i === 1 || i === 3) ? 'before' : null; c.boot(); }
  c.mode = null; c.boot();
  c.tick(A('NEUTRO', 0, 'ES x NQ divergentes'), 6001, 21001);
  c.mode = 'after'; c.tick(A('LONG', 3), 6001, 21001, 120); c.mode = null;   // FLAT, sem decisao: nada a emitir
  for (let i = 0; i < 3; i++) c.boot();
  const ev = c.ev(), ids = new Set(ev.map(e => e.event_id)), seqs = ev.map(e => e.seq);
  ok(ev.length === 2 && ids.size === 2 && seqs.join() === '1,2' && c.trades().length === 1 && pend(c) === 0,
    'OB-A6 multiplos restarts: 2 decisoes = 2 eventos (seq 1,2), event_id unicos, 1 trade, outbox vazio');
}
// OB-A7 mudanca de mes: OPEN em 2026-10-31 (crash depois do append), restart em novembro, CLOSE em 2026-11
{
  const c = cenario('2026-10-31T23:55:00.000Z');
  c.tick(A('LONG', 4), 6000, 21000);
  c.tick(A('NEUTRO', 0, 'ES x NQ divergentes'), 6001, 21001);              // trade 1 fechado em outubro
  c.tick(A('LONG', 3), 6001, 21001, 120);                                    // rearma
  c.mode = 'after'; c.crash(A('SHORT', 4), 6000, 21000, 1);                  // OPEN ainda em 2026-10-31, crash pos-append
  const idOpen = c.disk().pendingEvents[0].evt.event_id, seqOpen = c.ev().find(e => e.event_id === idOpen).seq;
  c.mode = null; c.t = Date.parse('2026-11-01T00:05:00.000Z'); c.boot();   // restart ja em novembro
  c.tick(A('NEUTRO', 0, 'ES x NQ divergentes'), 6001, 21001);              // CLOSE em novembro
  const files = fs.readdirSync(c.hist).filter(f => /^events-/.test(f)).sort();
  const ev = c.ev(), seqs = ev.map(e => e.seq), op = ev.filter(e => e.event_id === idOpen);
  const cl = ev[ev.length - 1];
  ok(files.join() === 'events-2026-10.jsonl,events-2026-11.jsonl' && seqs.join() === '1,2,3,4'
    && op.length === 1 && op[0].seq === seqOpen && cl.action === 'CLOSE' && cl.trade_id === idOpen && cl.created_at.slice(0, 7) === '2026-11',
    'OB-A7 mudanca de mes: seq monotonico 1..4 entre events-2026-10/11, event_id do OPEN preservado, sem reset de seq',
    files.join() + ' seqs=' + seqs.join());
  c.boot();
  ok(bootBff(c.hist).lastSeq() === 4 && c.ev().length === 4, 'OB-A7b reboot apos a virada: indice/seq reconstruidos dos 2 meses (lastSeq 4)');
}
// OB-A8 BFF reinicia com pendente: o BOOT do motor (sem tick) recupera o MESMO evento automaticamente
{
  const c = cenario('2026-10-01T14:00:00.000Z');
  c.mode = 'before'; c.crash(A('LONG', 4), 6000, 21000);
  const idp = c.disk().pendingEvents[0].evt.event_id;
  c.mode = null; c.boot();   // = processo do BFF reiniciado (indice reconstruido + createSimEngine); NENHUM tick
  const ev = c.ev();
  ok(ev.length === 1 && ev[0].event_id === idp && ev[0].trade_id === idp && pend(c) === 0 && c.disk().trade.seq_open === ev[0].seq,
    'OB-A8 BFF restart com pendente: recuperado no boot, sem tick, mesmo event_id/trade_id');
}
// OB-X idempotencia direta do append do BFF (mesmo event_id 3x => 1 linha, mesmo seq) + emissor ausente (harness) inalterado
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aot-obx-')); const h = path.join(d, 'history');
  let b = bootBff(h);
  const r1 = b.simEmitEvent({ action: 'OPEN', event_id: 'ev-fixo-1', created_at: '2026-10-01T14:00:00.000Z' });
  const r2 = b.simEmitEvent({ action: 'OPEN', event_id: 'ev-fixo-1', created_at: '2026-10-01T14:00:00.000Z' });
  b = bootBff(h);
  const r3 = b.simEmitEvent({ action: 'OPEN', event_id: 'ev-fixo-1', created_at: '2026-10-01T14:00:00.000Z' });
  const linhas = fs.readFileSync(path.join(h, 'events-2026-10.jsonl'), 'utf8').trim().split('\n').length;
  ok(r1.seq === 1 && r2.seq === 1 && r2.duplicate && r3.seq === 1 && r3.duplicate && linhas === 1,
    'OB-X1 EVENT APPEND IDEMPOTENT: mesmo event_id 3x (1 reboot no meio) => 1 linha, seq original');
  const s0 = createSimEngine({ persistPath: path.join(d, 's0.json'), historyDir: path.join(d, 'h0') });
  s0.tick({ anchor: A('LONG', 4), esSpot: 6000, nqSpot: 21000, nowIso: '2026-10-01T14:00:00.000Z' });
  s0.tick({ anchor: A('NEUTRO', 0, 'ES x NQ divergentes'), esSpot: 6001, nqSpot: 21001, nowIso: '2026-10-01T14:00:20.000Z' });
  const g0 = s0.getState(null, null);
  ok(g0.side === 'FLAT' && g0.history.length === 1 && g0.history[0].event_id_close === null && !(JSON.parse(fs.readFileSync(path.join(d, 's0.json'), 'utf8')).pendingEvents || []).length,
    'OB-X2 sem emissor (harness de paridade): maquina de estados inalterada, sem outbox, identidade null');
}
console.error = errLog;

// fixture p/ o C#: o stream real produzido aqui (4 eventos) + 1 replay
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'events-fixture.json'), JSON.stringify({ events: todos, replay: er[0] }, null, 1));

console.log('\nJS sync: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
