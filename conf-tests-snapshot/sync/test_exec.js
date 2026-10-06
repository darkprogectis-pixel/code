// invictus/exec v1 (2026-10-02) — X1–X13 lado AOT: aot-sim.js (copia) + blocos VERBATIM do aot-bff.js (copia): EVENTO CANONICO,
// EXEC DE VOLTA (execRead/cursor/simExecIngest) e a rota GET /sim/exec. Entrada = out/exec-fixture.jsonl gerado pelo ProgramExec.cs
// (o MESMO arquivo que o robo escreve). Cada cenario troca o trade_id "X<n>" da fixture pelo trade_id real do aot-sim.
// X13 = paridade com o aot-sim.js LIVE (somente leitura) sem registros de execucao. Sem rede, sem BFF vivo, sem NT8.
// Uso: node test_exec.js [fixture]   → exit 0 = tudo PASS.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const AOT = process.env.AOT_DIR || path.join(__dirname, 'aot');
const AOT_LIVE = 'C:/Users/ADM/.claude/aot';
const FIX = process.argv[2] || path.join(__dirname, 'out', 'exec-fixture.jsonl');
const { createSimEngine } = require(path.join(AOT, 'aot-sim.js'));
const BFF_SRC = fs.readFileSync(path.join(AOT, 'aot-bff.js'), 'utf8');
function bloco(src, ini, fim) { const i0 = src.indexOf(ini), i1 = src.indexOf(fim, i0 + 1); if (i0 < 0 || i1 < i0) { console.log('FAIL bloco nao encontrado: ' + ini); process.exit(1); } return src.slice(i0, i1); }
const B_EVT = bloco(BFF_SRC, '// ── EVENTO CANONICO', 'const simEngine = ');
const B_EXEC = bloco(BFF_SRC, '// ── EXEC DE VOLTA (2026-10-02', '// Fonte do PREÇO do simulador');
const B_ROTA = bloco(BFF_SRC, "  if (p === '/sim/exec') {", '  // ── MIGRAÇÃO DOS NÍVEIS');
if (!fs.existsSync(FIX)) { console.log('FAIL fixture ausente: ' + FIX + ' (rode o test_exec.ps1, que gera a fixture pelo ProgramExec.cs)'); process.exit(1); }
const FIXTURE = fs.readFileSync(FIX, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const doTrade = (x) => FIXTURE.filter(r => r.trade_id === x);

let pass = 0, fail = 0;
function ok(c, what, det) { if (c) { pass++; console.log('PASS ' + what); } else { fail++; console.log('FAIL ' + what + (det ? '  -> ' + det : '')); } }

function bootEvt(dir) {
  return new Function('fs', 'path', 'crypto', 'SIM_HISTORY_DIR', 'SIM_ON', B_EVT + '\nreturn { simEmitEvent, simEventsRead, lastSeq: () => simEventSeq };')(fs, path, crypto, dir, true);
}
function bootExec(hist, roboDir, simEngine) {
  return new Function('fs', 'path', 'SIM_HISTORY_DIR', 'ROBO_CFG', 'simEngine', B_EXEC + '\nreturn { execRead, execCursorLer, simExecIngest, SIM_EXEC_CURSOR };')(fs, path, hist, { roboDir }, simEngine);
}
const rota = new Function('p', 'req', 'res', 'u', 'sendJson', 'execRead', 'execCursorLer', 'SIM_ON', B_ROTA + '\nreturn null;');

// ── cenario: diretorio isolado = 1 BFF + 1 robo ──
function Cenario(nome, mod) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aot-exec-' + nome + '-'));
  const c = { tmp, hist: path.join(tmp, 'history'), robo: path.join(tmp, 'robo'), persist: path.join(tmp, 'sim-state.json'), t: Date.parse('2026-10-02T14:00:00.000Z'), map: {} };
  c.stateDir = path.join(c.robo, 'state'); fs.mkdirSync(c.stateDir, { recursive: true });
  c.log = path.join(c.stateDir, 'aot-exec-2026-10.jsonl');
  c.boot = () => {
    c.bff = bootEvt(c.hist);
    c.sim = (mod || createSimEngine)({ persistPath: c.persist, historyDir: c.hist, emitEvent: c.bff.simEmitEvent });
    c.exec = bootExec(c.hist, c.robo, c.sim);
  };
  c.boot();
  c.iso = () => new Date(c.t).toISOString();
  c.tick = (dir, strength, secs, why) => { c.t += (secs || 20) * 1000; c.es = 6000 + (c.t % 7); c.nq = 21000 + (c.t % 11);
    return c.sim.tick({ anchor: { dir, strength, why: why || null }, esSpot: c.es, nqSpot: c.nq, nowIso: c.iso(), priceSource: 'gexbot', replay: false }); };
  c.ingest = () => c.exec.simExecIngest({ esSpot: c.es, nqSpot: c.nq, nowIso: c.iso() });
  c.evs = () => c.bff.simEventsRead(0, 1000).events;
  c.abrir = (x) => { c.tick('NEUTRO', 2, 70); c.tick('LONG', 4); const s = c.sim.getState(c.es, c.nq); if (x) c.map[x] = s.trade && s.trade.trade_id; return s.trade && s.trade.trade_id; };
  // escreve registros da fixture (trade_id trocado) no log do robo e roda o ingest do BFF (= 1 poll)
  c.feed = (recs, extra) => { fs.appendFileSync(c.log, recs.map(r => JSON.stringify(Object.assign({}, r, { trade_id: c.map[r.trade_id] || r.trade_id }))).join('\n') + '\n' + (extra || '')); return c.ingest(); };
  c.st = () => c.sim.getState(c.es, c.nq);
  return c;
}
function execTrade(c, x) { const tid = c.map[x]; const raw = JSON.parse(fs.readFileSync(c.persist, 'utf8')); return raw.execTrades ? raw.execTrades[tid] || null : null; }
const closes = (c) => c.evs().filter(e => e.action === 'CLOSE');
const opens = (c) => c.evs().filter(e => e.action === 'OPEN');

// ── X1–X5: saida originada no NT8 ⇒ EXIT_PENDING (posicao mantida, sem entrada) ⇒ CLOSED: AOT FLAT com exit_origin; CLOSE canonico 1x; CLOSE do AOT depois = no-op ──
for (const [x, origem] of [['X1', 'broker_stop'], ['X2', 'broker_take'], ['X3', 'protection_mandatory'], ['X4', 'session_end'], ['X5', 'manual_leg']]) {
  const c = Cenario(x);
  const tid = c.abrir(x);
  const recs = doTrade(x), fim = recs[recs.length - 1], meio = recs.slice(0, -1);
  const r1 = c.feed(meio);
  const pend = meio.some(r => r.status === 'EXIT_PENDING');
  const s1 = c.st(), x1 = execTrade(c, x);
  const okMeio = r1.applied === meio.length && s1.side === 'LONG' && (!pend || (x1.exec_state === 'EXIT_PENDING' && s1.exec.entry_blocked === true));
  const r2 = c.feed([fim]);
  const s2 = c.st(), x2 = execTrade(c, x), cl = closes(c);
  const okFim = r2.applied === 1 && s2.side === 'FLAT' && x2.exec_state === 'FLAT' && x2.exit_origin === origem && cl.length === 1 && cl[0].trade_id === tid
    && cl[0].reason === 'exec_closed_' + origem && s2.history[0] && s2.history[0].trade_id === tid;
  c.tick('NEUTRO', 2);                                   // decisao do AOT de fechar o MESMO trade depois: nada a fechar
  const okNoop = closes(c).length === 1 && c.st().side === 'FLAT';
  ok(okMeio && okFim && okNoop, x + ' ' + origem + ': ' + (pend ? 'EXIT_PENDING mantem a posicao e bloqueia entrada; ' : '') + 'CLOSED ⇒ FLAT exit_origin=' + origem + ', 1 CLOSE canonico (exec_closed_' + origem + '); CLOSE do AOT depois = no-op',
    JSON.stringify({ r1, side1: s1.side, x1, r2, side2: s2.side, x2, closes: cl.map(e => e.reason) }));
}

// ── X6 OPEN_BLOCKED ⇒ NOT_EXECUTED, FLAT sem evento novo; trade fora do historico; proxima entrada permitida ──
{
  const c = Cenario('X6');
  const tid = c.abrir('X6');
  const nEv = c.evs().length;
  const r = c.feed(doTrade('X6'));
  const s = c.st(), x = execTrade(c, 'X6');
  const tid2 = c.abrir();
  ok(r.applied === 1 && s.side === 'FLAT' && c.evs().length === nEv + 1 && x.exec_state === 'NOT_EXECUTED' && x.reason === 'stale' && !s.history.some(h => h.trade_id === tid)
    && tid2 && tid2 !== tid && opens(c).length === 2 && c.st().side === 'LONG',
    'X6 OPEN_BLOCKED ⇒ NOT_EXECUTED (reason stale), FLAT sem evento, fora do historico; proximo OPEN permitido', JSON.stringify({ r, side: s.side, x, tid2, opens: opens(c).length }));
}

// ── X7 parcial/3 pernas: EXECUTED ⇒ EXIT_PENDING (posicao mantida) ⇒ FLAT so no CLOSED ──
{
  const c = Cenario('X7');
  c.abrir('X7');
  const [o, p, f] = doTrade('X7');
  c.feed([o]); const e1 = execTrade(c, 'X7').exec_state, s1 = c.st().side;
  c.feed([p]); const e2 = execTrade(c, 'X7').exec_state, s2 = c.st().side;
  c.tick('LONG', 4); const s2b = c.st().side;            // AOT nao decide nada novo enquanto sai
  c.feed([f]); const e3 = execTrade(c, 'X7').exec_state, s3 = c.st().side;
  ok(e1 === 'EXECUTED' && s1 === 'LONG' && e2 === 'EXIT_PENDING' && s2 === 'LONG' && s2b === 'LONG' && e3 === 'FLAT' && s3 === 'FLAT' && closes(c).length === 1,
    'X7 OPEN_EXECUTED ⇒ EXECUTED; EXIT_PENDING mantem LONG; FLAT so no CLOSED', [e1, s1, e2, s2, s2b, e3, s3].join(' '));
}

// ── X8 CLOSE do AOT rejeitado no NT8 ⇒ EXIT_PENDING/EXIT_FAILED_RETRY: AOT nao abre nada ate o CLOSED ──
{
  const c = Cenario('X8');
  c.abrir('X8');
  const [o, p, fr, f] = doTrade('X8');
  c.feed([o]);
  c.tick('NEUTRO', 2, 20, 'ES x NQ divergentes');        // AOT decide o CLOSE (canonico)
  c.feed([p, fr]);
  const x1 = execTrade(c, 'X8'), bloq = c.st().exec.entry_blocked;
  c.tick('NEUTRO', 2, 70); c.tick('LONG', 4); c.tick('LONG', 4);
  const abriuDuranteRetry = opens(c).length > 1;
  c.feed([f]);
  const x2 = execTrade(c, 'X8');
  c.tick('NEUTRO', 2, 70); c.tick('LONG', 4);
  ok(x1.exec_state === 'EXIT_PENDING' && x1.exit_origin === 'aot_close' && bloq === true && !abriuDuranteRetry && x2.exec_state === 'FLAT' && opens(c).length === 2 && closes(c).length === 1,
    'X8 CLOSE rejeitado ⇒ EXIT_PENDING (entrada bloqueada, 0 OPEN novo) ⇒ CLOSED libera a entrada', JSON.stringify({ x1, bloq, abriuDuranteRetry, x2, opens: opens(c).length }));
}

// ── X9 DIVERGENT (G12) ⇒ flag; com o trade fechado pelo AOT e ainda divergente: nenhuma entrada; RECONCILED limpa ──
{
  const c = Cenario('X9');
  c.abrir('X9');
  const [o, d, r] = doTrade('X9');
  c.feed([o, d]);
  const x1 = execTrade(c, 'X9'), side1 = c.st().side;
  c.tick('NEUTRO', 2, 20, 'ES x NQ divergentes');
  c.tick('NEUTRO', 2, 70); c.tick('LONG', 4);
  const bloqueou = opens(c).length === 1 && c.st().exec.entry_blocked === true;
  c.feed([r]);
  const x2 = execTrade(c, 'X9');
  c.tick('LONG', 4);
  ok(x1.divergent === true && side1 === 'LONG' && bloqueou && x2.divergent === false && opens(c).length === 2,
    'X9 DIVERGENT = so flag (posicao mantida); divergente aberto bloqueia entrada; RECONCILED limpa e libera', JSON.stringify({ x1, side1, bloqueou, x2, opens: opens(c).length }));
}

// ── X10 registro sem correlacao (trade desconhecido) ⇒ ignorado, cursor avanca, AOT intocado ──
{
  const c = Cenario('X10');
  c.abrir('X10');
  const antes = JSON.stringify((({ side, trade, legs }) => ({ side, trade, legs }))(c.st()));
  const nEv = c.evs().length;
  const r = c.feed(doTrade('X9alt'));                     // trade_id que o AOT nunca emitiu
  const depois = JSON.stringify((({ side, trade, legs }) => ({ side, trade, legs }))(c.st()));
  const raw = JSON.parse(fs.readFileSync(c.persist, 'utf8'));
  ok(r.applied === 3 && antes === depois && c.evs().length === nEv && Object.keys(raw.execTrades || {}).length === 0 && c.exec.execCursorLer() === 28 && raw.execLastSeq === 28,
    'X10 trade sem correlacao ⇒ ignorado (unknown_trade), cursor avanca, estado/eventos do AOT intocados', JSON.stringify({ r, execTrades: raw.execTrades, cursor: c.exec.execCursorLer() }));
}

// ── X11 idempotencia: linha duplicada, linha torta, restart do BFF/motor, applyExec repetido, replay ignorado ──
{
  const c = Cenario('X11');
  c.abrir('X1'); c.map.XR = c.map.X1;
  const recs = doTrade('X1');
  const r1 = c.feed([recs[0], recs[0], recs[1]], '{"schema":"invictus/exec v1","exec_seq":3');   // duplicada + torta no fim
  const lido = c.exec.execRead(0, 0);
  const cur1 = c.exec.execCursorLer();
  c.boot();                                                 // restart do BFF: motor relido do disco + bloco novo
  const r2 = c.ingest();
  const dup = c.sim.applyExec(Object.assign({}, recs[1], { trade_id: c.map.X1 }), { nowIso: c.iso() });
  fs.appendFileSync(c.log, '\n');                           // a linha torta termina (o robo quebra a linha antes do proximo append)
  const r3 = c.feed([recs[2]]);
  const r4 = c.feed(doTrade('XR').map(x => Object.assign({}, x, { exec_seq: 30 })));
  const x = execTrade(c, 'X1');
  const raw = JSON.parse(fs.readFileSync(c.persist, 'utf8'));
  ok(r1.applied === 2 && lido.bad_lines === 1 && lido.records.length === 2 && cur1 === 2 && r2.applied === 0 && dup.result === 'duplicate'
    && r3.applied === 1 && r4.applied === 1 && x.exec_state === 'FLAT' && closes(c).length === 1 && raw.execLastSeq === 30 && c.exec.execCursorLer() === 30,
    'X11 duplicada/torta/restart/applyExec repetido/replay ⇒ cada registro aplicado exatamente 1x; replay so avanca o seq',
    JSON.stringify({ r1, bad: lido.bad_lines, cur1, r2, dup, r3, r4, x, last: raw.execLastSeq }));
  // cursor so avanca DEPOIS do apply: apply que lanca ⇒ cursor parado, o proximo poll retoma
  const c2 = Cenario('X11b'); c2.abrir('X1');
  const real = c2.sim.applyExec; let falhar = true;
  c2.sim.applyExec = (rec, ctx) => { if (falhar && rec.exec_seq === 2) throw new Error('falha simulada'); return real(rec, ctx); };
  let lancou = false; try { c2.feed(recs); } catch { lancou = true; }
  const curA = c2.exec.execCursorLer();
  falhar = false; const rB = c2.ingest();
  ok(lancou && curA === 1 && rB.applied === 2 && c2.exec.execCursorLer() === 3 && c2.st().side === 'FLAT',
    'X11c apply que falha ⇒ cursor fica no ultimo aplicado (ACK apos aplicar); o poll seguinte retoma sem perder nem repetir', JSON.stringify({ lancou, curA, rB }));
}

// ── X12 privacidade: GET /sim/exec e o bloco exec do /state sem preco/qty/conta/PnL ──
{
  const c = Cenario('X12');
  c.abrir('X1');
  c.feed(doTrade('X1'));
  let resp = null; rota('/sim/exec', { method: 'GET' }, null, new URL('http://127.0.0.1/sim/exec?after=0'), (res, code, body) => { resp = { code, body }; }, c.exec.execRead, c.exec.execCursorLer, true);
  let r405 = null; rota('/sim/exec', { method: 'POST' }, null, new URL('http://127.0.0.1/sim/exec'), (res, code, body) => { r405 = code; }, c.exec.execRead, c.exec.execCursorLer, true);
  const topo = ['schema', 'enabled', 'after', 'limit', 'cursor', 'last_exec_seq', 'server_time', 'more', 'bad_lines', 'records'];
  const campos = ['schema', 'exec_seq', 'trade_id', 'event_id', 'status', 'origin', 'at', 'reason', 'replay'];
  const recsOk = resp && resp.body.records.length === 3 && resp.body.records.every(r => Object.keys(r).every(k => campos.includes(k)));
  const proibido = /price|qty|quant|account|conta|pnl|fill|exit_px|usd/i;
  const execBloco = c.st().exec;
  const semVazamento = !proibido.test(JSON.stringify(resp && resp.body.records)) && !proibido.test(JSON.stringify(execBloco));
  ok(resp && resp.code === 200 && JSON.stringify(Object.keys(resp.body).sort()) === JSON.stringify(topo.slice().sort()) && resp.body.cursor === 3 && resp.body.last_exec_seq === 3
    && recsOk && semVazamento && r405 === 405 && FIXTURE.every(r => Object.keys(r).every(k => campos.includes(k))),
    'X12 GET /sim/exec (so leitura, 405 a nao-GET) e /state.exec: so os campos do contrato; nenhum preco/qty/conta/PnL', JSON.stringify({ code: resp && resp.code, keys: resp && Object.keys(resp.body), r405, execBloco }));
}

// ── X13 paridade: sem registros de execucao, a copia decide IGUAL ao aot-sim.js LIVE (somente leitura), passo a passo ──
{
  const live = require(path.join(AOT_LIVE, 'aot-sim.js'));
  const a = Cenario('X13copia'), b = Cenario('X13live', live.createSimEngine);
  let seed = 20261002; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const whys = [null, 'ES x NQ divergentes', 'forca fraca', 'sem tape ES', 'ES indefinido'];
  const tira = (s) => { const o = JSON.parse(JSON.stringify(s)); delete o.exec; (o.history || []).forEach(h => { delete h.id; delete h.trade_id; delete h.event_id_open; delete h.event_id_close; delete h.seq_open; delete h.seq_close; });
    if (o.trade) { delete o.trade.trade_id; delete o.trade.event_id_open; } return o; };
  const evN = (c) => c.evs().map(e => [e.seq, e.action, e.direction, e.strength, e.reason, e.es_price, e.nq_price].join('|'));
  let difs = 0, prim = null, ingeridos = 0;
  for (let i = 0; i < 1500; i++) {
    const u = rnd(), dir = u < 0.45 ? 'LONG' : u < 0.8 ? 'SHORT' : 'NEUTRO', strength = rnd() < 0.5 ? 4 : Math.floor(rnd() * 4), why = dir === 'NEUTRO' ? whys[Math.floor(rnd() * whys.length)] : null;
    const secs = 5 + Math.floor(rnd() * 60), es = 6000 + (rnd() - 0.5) * 40, nq = 21000 + (rnd() - 0.5) * 160;
    for (const c of [a, b]) { c.t += secs * 1000; c.es = es; c.nq = nq; }
    ingeridos += a.ingest().applied;                         // copia: poll do BFF com o ingest (sem arquivo de exec)
    const sa = a.sim.tick({ anchor: { dir, strength, why }, esSpot: es, nqSpot: nq, nowIso: a.iso(), priceSource: 'gexbot', replay: false });
    const sb = b.sim.tick({ anchor: { dir, strength, why }, esSpot: es, nqSpot: nq, nowIso: b.iso(), priceSource: 'gexbot', replay: false });
    if (JSON.stringify(tira(sa)) !== JSON.stringify(tira(sb))) { difs++; if (!prim) prim = i; }
  }
  const ea = evN(a), eb = evN(b);
  ok(difs === 0 && ingeridos === 0 && ea.length > 20 && JSON.stringify(ea) === JSON.stringify(eb) && !('exec' in a.st()),
    'X13 paridade: 1500 ticks sem registros de exec ⇒ estado e eventos da copia identicos ao aot-sim.js live (' + ea.length + ' eventos); /state sem bloco exec',
    JSON.stringify({ difs, prim, ingeridos, eventos: [ea.length, eb.length] }));
}

console.log('');
console.log('RESULTADO exec JS: pass=' + pass + ' fail=' + fail + '  (fixture ' + FIXTURE.length + ' registros)');
process.exit(fail ? 1 : 0);
