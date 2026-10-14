// ─────────────────────────────────────────────────────────────────────────────
// AOT — Simulador de Automação (aot-sim.js)  —  motor de estados, SEM execução real.
//
// Base para o robô real. A cada poll do BFF (~20s) recebe o anchor da Camada 1
// (gate.anchor: {dir, strength}) + spot de ES/NQ (gexbot) e roda a máquina:
//   FLAT → (strength 4/4 + dir LONG|SHORT) → abre 1 ES + 1 NQ juntos →
//          trailing (em DÓLARES, por instrumento) →
//          EXIT quando anchor.dir=NEUTRO (confluência direcional colapsa)
//                 ou quando o trailing stop é atingido (fecha a cesta inteira).
//
// Regras (confirmadas com o operador 2026-07-18):
//   • Entrada: SÓ com strength===4 e dir LONG|SHORT. Sempre 1 ES + 1 NQ (nunca um só).
//   • Saída:   fecha quando anchor.dir vira NEUTRO POR QUEBRA DE CONFLUÊNCIA
//              ("ES x NQ divergentes" / "... indefinido(s)" no `why` do gate).
//              NEUTRO transitório — "forca fraca" (pressão cruzou 0.03 num instante,
//              4 canais ainda alinhados) ou "sem tape" (frescor/infra) — NÃO fecha:
//              mantém a posição; trailing/hard stop seguem valendo. 2026-09-03.
//              Enquanto dir seguir LONG|SHORT (mesmo strength caindo 4→3→2) MANTÉM.
//   • P&L e trailing em DÓLARES, separados por instrumento (ES $50/pt, NQ $20/pt) + total.
//   • Trailing: a partir de $beAtProfit de lucro → stop a breakeven; a cada +$step de
//               lucro → stop sobe $step (em $, traduzido p/ pontos por multiplicador).
//   • Histerese/cooldown: após sair, exige a força deixar o 4/4 e um cooldown antes de reabrir.
//
// Persistência em disco: posição aberta + trailing sobrevivem a restart do BFF (watchdog).
// Marca de "simulação" fica em meta.simulated (o Deep Dive exibe; o Command mostra como real).
// Isolado: sem imports de outros projetos, sem I/O de rede. Ligado só com AOT_SIM=on.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PARAMS = {
  contractsEs: 1, contractsNq: 1,
  multEs: 50, multNq: 20,               // $ por ponto (ES E-mini S&P / NQ E-mini Nasdaq)
  hardStopUsd: 500,                     // STOP FIXO de proteção por ativo (US$) — rede de segurança
                                        //   por baixo. NÃO substitui trailing/anchor-neutro; é limite
                                        //   de perda máxima. (= 10pt ES / 25pt NQ)
                                        //   (2026-10-14 R9: 1000 -> 500 por ativo; só reduz risco — R10)
  basketStopUsd: 1000,                  // (2026-10-14 R9) perda máxima da CESTA (ES+NQ, US$). 0/null = desligado.
  neutroPositiveProtect: true,          // (2026-10-14 R7/R8) NEUTRO com cesta > 0 => PROTECTED (piso da cesta em 0)
                                        //   em vez de fechar; cesta <= 0 ou desconhecida => fecha (R8). false = legado.
  pctRules: true,                       // (2026-10-14 R1–R5) filtro de entrada por bull_pct/bear_pct (relay :3457
                                        //   signals.ES/NQ), ADICIONAL ao anchor 4/4 — nunca abre mais do que o legado.
  pctStrongMin: 70,                     // R1/R2: os dois ativos >= 70 na direção => entra sem exigir HIRO
  pctMin: 50,                           // R4/R5: os dois ativos >= 50 na direção => RTH exige HIRO CONFIRMA nos dois
  pctStaleSec: 90,                      // idade máx. do sinal (= ROBO_CFG.STALE_MS / AlfaOmegaRobo.cs:310)
  requireGateOpen: true,                // (2026-10-14 decisão do operador) entrada exige Gate OPEN (buildGate.open:
                                        //   online ∧ ready ∧ tapeLive ∧ 4/4 ∧ dir) ALÉM do anchor 4/4; ausente = fechado.
  beAtProfitUsd: 500,                   // lucro (US$) p/ mover o stop até breakeven  (= 10pt ES)
  stepProfitUsd: 250,                   // a cada +US$ deste passo de lucro...           (= 5pt ES)
  stepStopUsd: 250,                     // ...o stop sobe US$ deste tanto (em pontos/mult)
  cooldownSec: 60,                      // após sair, espera antes de poder reabrir
  requireFreshFourOfFour: true,         // histerese: exige strength cair <4 e voltar a 4
};

function r2(x) { return (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100; }
// (2026-09-16) INVARIANTE DE PRECO: um preco fundamental (spot/entry/exit) so e valido se for numero finito e > 0.
// Origem: no F5 do NT8 de 15/09 22:55Z a ponte :5151 publicou "lastPrice":0 (assembly recarregada, SharedState
// zerado), o BFF aceitou 0 como spot e este motor calculou legPnl = (0 − 7663.75) × 50 = −383.187,50 ⇒
// "hard_stop_es" com exit 0 (−$968.682,50 falsos; id 2026-09-15T22:56:19.188Z-crzom). O porte C# (INVICTUS)
// nunca viu o 0 porque PrecoOuNulo() ja o transformava em null. Aqui: 0/NaN/Infinity/negativo = null =
// "sem preco" (legPnl 0, sem stop, sem entrada — o MESMO caminho de spot ausente que os dois motores ja tinham).
const validPx = (x) => typeof x === 'number' && isFinite(x) && x > 0;
const pxOrNull = (x) => validPx(x) ? x : null;
// Registro fechado com preco invalido em alguma perna presente: PnL NAO e calculado (null), nunca 0 fabricado.
function recPrecoInvalido(rec) {
  if (!rec) return true;
  for (const k of ['es', 'nq']) { const l = rec[k]; if (!l) continue; if (!validPx(l.entry) || !validPx(l.exit)) return true; }
  return false;
}

function createSimEngine({ persistPath, historyDir, params, emitEvent } = {}) {
  const P = Object.assign({}, DEFAULT_PARAMS, params || {});
  // (2026-10-01, sync total) EVENTO CANONICO: a decisao OPEN/CLOSE deste motor e publicada UMA vez via
  // emitEvent(evt) -> {seq, event_id} (log append-only do BFF). O INVICTUS consome o MESMO evento.
  // A maquina de estados NAO muda; sem emitEvent (harness de paridade) os campos de identidade ficam null.
  // (2026-10-01, pre-instalacao B3 AOT_EMIT_BEFORE_SAVE) OUTBOX PERSISTENTE: o event_id e gerado AQUI, o evento entra em
  // st.pendingEvents JUNTO com a transicao de estado e o state e salvo ATOMICAMENTE (tmp + fsync + rename) ANTES do append.
  // Depois flushPending() emite na ordem; o BFF e idempotente por event_id (reemissao devolve o seq ORIGINAL, sem append).
  // Crash em qualquer ponto => no boot o pendente e reemitido com o MESMO event_id: nunca evento duplicado nem perdido.
  const outboxOn = typeof emitEvent === 'function';
  function novoEventId() { return crypto.randomUUID(); }
  function enfileirar(evt, rec) {
    st.pendingEvents = Array.isArray(st.pendingEvents) ? st.pendingEvents : [];
    st.pendingEvents.push(rec ? { evt, rec } : { evt });
  }
  // Emite os pendentes na ordem. Falha de emissao => lanca (o tick falha alto; o pendente fica no disco p/ a proxima tentativa).
  function flushPending() {
    if (!outboxOn || !Array.isArray(st.pendingEvents) || !st.pendingEvents.length) return;
    while (st.pendingEvents.length) {
      const p = st.pendingEvents[0];
      const r = emitEvent(Object.assign({ schema: 'aot-sim/event v1', source: 'AOT_CANONICAL' }, p.evt));
      const seq = r && r.seq != null ? r.seq : null;
      if (p.evt.action === 'OPEN') {
        if (st.trade && st.trade.trade_id === p.evt.trade_id) st.trade.seq_open = seq;
        for (const q of st.pendingEvents) if (q.rec && q.rec.trade_id === p.evt.trade_id) q.rec.seq_open = seq;
        for (const h of st.history || []) if (h && h.trade_id === p.evt.trade_id && h.seq_open == null) h.seq_open = seq;
      } else if (p.evt.action === 'CLOSE' && p.rec) {
        p.rec.seq_close = seq;
        for (const h of st.history || []) if (h && h.id === p.rec.id) h.seq_close = seq;
        appendHistoryOnce(p.rec);       // trades-log: idempotente por id (crash entre o append e o save abaixo)
      }
      st.pendingEvents.shift();
      save();
    }
  }
  let st = load() || freshState();
  // (2026-09-16) cache do /state saneado no boot: registro fechado com preco invalido sai da visao publica
  // (o ledger JSONL fica intacto; o /history o retira por regra + manifesto de IDs).
  try { if (Array.isArray(st.history)) st.history = st.history.filter(h => !recPrecoInvalido(h)); } catch { }
  // B3: no boot, reemite o outbox (MESMO event_id) antes de qualquer tick. Falha aqui não derruba o boot:
  // o pendente fica no disco e o 1º tick tenta de novo (e lança se ainda falhar).
  try { flushPending(); } catch (e) { try { console.error('[aot-sim] flushPending no boot falhou:', e && e.message); } catch { } }

  function freshState() {
    return {
      side: 'FLAT',                       // FLAT | LONG | SHORT
      legs: { es: null, nq: null },       // cada: {entry, stop, active, pnlUsd}
      openedAt: null, closedAt: null,
      cooldownUntil: null,
      armed: true,                        // pronta p/ nova entrada (força já deixou o 4/4?)
      history: [],                        // trades fechados (mais recente primeiro) — CACHE do /state
      lastAnchor: null,
      openAnchor: null, openMeta: null,   // anchor + contexto (priceSource/replay) da ABERTURA, p/ o log
    };
  }

  function load() { try { if (persistPath && fs.existsSync(persistPath)) return JSON.parse(fs.readFileSync(persistPath, 'utf8')); } catch { } return null; }
  // Save ATOMICO (2026-10-01 B3): tmp + fsync + rename — o state no disco e sempre o antigo OU o novo, nunca truncado.
  function saveStrict() {
    if (!persistPath) return;
    const tmp = persistPath + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, JSON.stringify(st)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, persistPath);
  }
  function save() { try { saveStrict(); } catch { } }
  // Transicao + evento pendente persistidos JUNTOS antes do append. Falha do save => lanca SEM emitir (fail-closed).
  function commitEEmitir() { saveStrict(); flushPending(); }

  // Log APPEND-ONLY (JSONL, particionado por mês) — FONTE DE VERDADE do histórico.
  // Nunca reescreve linhas anteriores: trade fechado é imutável. Independente do state (reset/
  // corrupção/restart não afetam). Crash-safe: só a última linha pode ficar torta; leitor a ignora.
  function appendHistory(rec) {
    try {
      if (!historyDir) return;
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
      const month = String(rec.closedAt || new Date().toISOString()).slice(0, 7);  // YYYY-MM
      fs.appendFileSync(path.join(historyDir, 'trades-' + month + '.jsonl'), JSON.stringify(rec) + '\n');
    } catch { }
  }
  // Reaplicacao a partir do outbox: so anexa se o id ainda nao esta no arquivo do mes.
  function appendHistoryOnce(rec) {
    try {
      if (!historyDir) return;
      const month = String(rec.closedAt || new Date().toISOString()).slice(0, 7);
      const f = path.join(historyDir, 'trades-' + month + '.jsonl');
      if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').indexOf('"id":' + JSON.stringify(rec.id)) >= 0) return;
    } catch { }
    appendHistory(rec);
  }
  function etDateOf(iso) {
    try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch { return null; }
  }

  function openLeg(entry) { return { entry: r2(entry), stop: null, active: false, pnlUsd: 0 }; }

  function legPnl(leg, side, spot, mult) {
    if (!leg || leg.entry == null || spot == null) return 0;
    const dirMul = side === 'LONG' ? 1 : -1;
    return r2((spot - leg.entry) * dirMul * mult);
  }

  // Preço do stop fixo de proteção ($hardStopUsd de perda) de uma perna.
  function hardStopPrice(entry, side, mult) {
    if (entry == null) return null;
    return r2(entry + (side === 'LONG' ? -1 : 1) * (P.hardStopUsd / mult));
  }

  // Atualiza o trailing (em dólares) de uma perna aberta.
  function updateTrail(leg, side, spot, mult) {
    if (!leg || leg.entry == null || spot == null) return;
    const dirMul = side === 'LONG' ? 1 : -1;
    const profitUsd = (spot - leg.entry) * dirMul * mult;
    leg.pnlUsd = r2(profitUsd);
    if (profitUsd >= P.beAtProfitUsd) {
      const steps = Math.floor((profitUsd - P.beAtProfitUsd) / P.stepProfitUsd);   // 0,1,2,...
      const moveUsd = steps * P.stepStopUsd;                                        // $ acima do entry
      const desiredStop = leg.entry + dirMul * (moveUsd / mult);                    // vira preço
      leg.active = true;
      if (leg.stop == null) leg.stop = leg.entry;                                   // 1º gatilho = breakeven
      leg.stop = side === 'LONG' ? Math.max(leg.stop, desiredStop) : Math.min(leg.stop, desiredStop);
      leg.stop = r2(leg.stop);
    }
  }

  function stopHit(leg, side, spot) {
    if (!leg || !leg.active || leg.stop == null || spot == null) return false;
    return side === 'LONG' ? spot <= leg.stop : spot >= leg.stop;
  }

  function closePosition(reason, esSpot, nqSpot, nowIso, strength) {
    const side = st.side, legs = st.legs;
    // (2026-09-16) saida sem preco valido: a perna NAO recebe PnL (null) e o total fica null — nunca 0 fabricado.
    const esOk = !legs.es || (validPx(legs.es.entry) && validPx(esSpot));
    const nqOk = !legs.nq || (validPx(legs.nq.entry) && validPx(nqSpot));
    const esPnl = esOk ? legPnl(legs.es, side, esSpot, P.multEs) : null;
    const nqPnl = nqOk ? legPnl(legs.nq, side, nqSpot, P.multNq) : null;
    const pnlOk = esOk && nqOk;
    const durationSec = st.openedAt ? Math.round((Date.parse(nowIso) - Date.parse(st.openedAt)) / 1000) : null;
    const tr = st.trade || {};
    const evC = outboxOn ? { action: 'CLOSE', trade_id: tr.trade_id || null, created_at: nowIso, direction: side,
      strength: strength == null ? null : strength, reason, es_price: validPx(esSpot) ? r2(esSpot) : null,
      nq_price: validPx(nqSpot) ? r2(nqSpot) : null, replay: st.openMeta ? !!st.openMeta.replay : false,
      event_id: novoEventId() } : null;
    const rec = {
      id: nowIso + '-' + Math.random().toString(36).slice(2, 7),
      schema: 1,
      openedAt: st.openedAt, closedAt: nowIso, durationSec,
      side, reason,
      es: legs.es ? { entry: legs.es.entry, exit: validPx(esSpot) ? r2(esSpot) : null, pnlUsd: esPnl } : null,
      nq: legs.nq ? { entry: legs.nq.entry, exit: validPx(nqSpot) ? r2(nqSpot) : null, pnlUsd: nqPnl } : null,
      totalUsd: pnlOk ? r2((esPnl || 0) + (nqPnl || 0)) : null,
      pnlStatus: pnlOk ? 'ok' : 'exit_desconhecido',   // (2026-09-16) sem exit valida: resultado NAO calculado
      anchorAtEntry: st.openAnchor || null,
      anchorAtExit: { dir: (st.lastAnchor && st.lastAnchor.dir) || null, strength: (st.lastAnchor && st.lastAnchor.strength) || 0,
        why: (st.lastAnchor && st.lastAnchor.why) || null },   // 2026-09-03: causa do NEUTRO gravada — sem isto o defeito não é auditável
      priceSource: st.openMeta ? st.openMeta.priceSource : null,
      replay: st.openMeta ? !!st.openMeta.replay : false,
      sessionDate: etDateOf(nowIso),
      params: { beAtProfitUsd: P.beAtProfitUsd, stepProfitUsd: P.stepProfitUsd, stepStopUsd: P.stepStopUsd, hardStopUsd: P.hardStopUsd, basketStopUsd: P.basketStopUsd },
      simulated: true,
      trade_id: tr.trade_id || null, event_id_open: tr.event_id_open || null, seq_open: tr.seq_open == null ? null : tr.seq_open,
      event_id_close: evC ? evC.event_id : null, seq_close: null,
    };
    // B3: com outbox, o trades-log e anexado no flush (com seq_close ja conhecido); sem emissor (harness), direto.
    if (evC) enfileirar(evC, rec); else appendHistory(rec);   // LOG APPEND-ONLY (fonte de verdade — imutável)
    st.history.unshift(Object.assign({}, rec));   // cache p/ o /state (últimos N)
    if (st.history.length > 50) st.history.length = 50;
    st.side = 'FLAT'; st.legs = { es: null, nq: null }; st.openedAt = null; st.closedAt = nowIso; st.openAnchor = null; st.openMeta = null; st.trade = null;
    st.protected = false;

    // REENTRADA IMEDIATA — só quando a saída foi por TRAILING STOP e a força AINDA é 4/4:
    // NÃO ergue a barreira (cooldown/histerese), então a entrada reabre já neste mesmo tick.
    // Saída por anchor NEUTRO ou por HARD STOP mantém a histerese/cooldown normais.
    const immediateReentry = reason.indexOf('trailing_stop') === 0 && strength === 4;
    if (immediateReentry) {
      st.cooldownUntil = null;
      st.armed = true;
    } else {
      st.cooldownUntil = P.cooldownSec ? new Date(Date.parse(nowIso) + P.cooldownSec * 1000).toISOString() : null;
      st.armed = false;                  // exige força voltar a <4 e depois 4 de novo (histerese)
    }
    if (evC) commitEEmitir();            // transição FLAT + pendente no disco ANTES do append do CLOSE
  }

  // (2026-10-14 R1–R5) Filtro de entrada por bull_pct/bear_pct — fail-closed. Devolve null (ok) ou o motivo do bloqueio.
  //  pct  = { ts, es: { bull_pct, bear_pct, direction }, nq: {...} }  (relay :3457 /v1/latest -> signals; escala 0–100)
  //  hiro = { es: 'CONFIRMA'|'NEUTRO'|'DIVERGE'|'N/A', nq: ... }      (v2.<sym>.c2.confirm)
  //  rth  = true|false; ausente => tratado como RTH (exige HIRO — o caminho mais restritivo)
  function pctEntryBlock(side, pct, hiro, rth, now) {
    if (!P.pctRules) return null;
    if (!pct || typeof pct.ts !== 'number') return 'pct_ausente';
    const ageSec = (Date.parse(now) - pct.ts) / 1000;
    if (!(ageSec >= 0) || ageSec > P.pctStaleSec) return 'pct_stale';
    const key = side === 'LONG' ? 'bull_pct' : 'bear_pct';
    const v = {};
    for (const a of ['es', 'nq']) {
      const s = pct[a];
      if (!s || typeof s[key] !== 'number' || !isFinite(s[key]) || s[key] < 0 || s[key] > 100) return 'pct_invalido_' + a;
      if (s.direction !== side) return (s.direction === 'NEUTRO' ? 'pct_neutro_' : 'pct_divergente_') + a;   // R3 + item 9
      v[a] = s[key];
    }
    if (v.es >= P.pctStrongMin && v.nq >= P.pctStrongMin) return null;                                    // R1/R2
    if (v.es < P.pctMin || v.nq < P.pctMin) return 'pct_abaixo_min';
    if (rth === false) return null;                                                                       // R5
    const ok = (x) => x === 'CONFIRMA';
    return (hiro && ok(hiro.es) && ok(hiro.nq)) ? null : 'pct_rth_sem_hiro';                              // R4
  }

  // 1 passo do motor (chamado a cada poll do BFF).
  function tick({ anchor, esSpot, nqSpot, nowIso, priceSource, replay, pct, hiro, rth, gateOpen }) {
    flushPending();   // B3: nenhuma decisão nova por cima de evento ainda não emitido (falha => o tick lança)
    esSpot = pxOrNull(esSpot); nqSpot = pxOrNull(nqSpot);   // (2026-09-16) preco invalido = ausente (nunca 0)
    const dir = anchor && anchor.dir ? anchor.dir : 'NEUTRO';
    const strength = anchor && typeof anchor.strength === 'number' ? anchor.strength : 0;
    const why = anchor && typeof anchor.why === 'string' ? anchor.why : null;   // motivo do gate (chega pronto no anchor)
    const now = nowIso || new Date().toISOString();
    st.lastAnchor = { dir, strength, why };

    if (strength < 4) st.armed = true;   // rearmar histerese quando a força deixa o 4/4

    // ── posição aberta: trailing + saídas. Ordem: anchor NEUTRO (primária) → hard stop
    //    (rede de segurança) → trailing stop. A 1ª perna a disparar fecha a cesta (1+1). ──
    if (st.side !== 'FLAT') {
      updateTrail(st.legs.es, st.side, esSpot, P.multEs);
      updateTrail(st.legs.nq, st.side, nqSpot, P.multNq);
      const esPnl = legPnl(st.legs.es, st.side, esSpot, P.multEs);
      const nqPnl = legPnl(st.legs.nq, st.side, nqSpot, P.multNq);

      // 2026-09-03 — NEUTRO não é uma coisa só. `AoGate.EsNq()` reprova em 4 etapas e diz
      // em `why` qual zerou o dir. "forca fraca" (pressão de tape cruzou o limiar 0.03 num
      // instante, com os 4 canais ME/MVI AINDA alinhados — medido: 222/780 trades fechados
      // com strength=4 na saída, P&L médio +$51) e "sem tape" (frescor/infra, não é leitura
      // de mercado) são PERDA TRANSITÓRIA de confirmação — fechar aqui zerava a posição no
      // poll seguinte à entrada (567/780 trades em $0). Só fecha quando a CONFLUÊNCIA
      // DIRECIONAL quebrou de fato ("divergentes"/"indefinido") ou quando o motivo é
      // desconhecido (anchor ausente — comportamento legado preservado, fail-visible).
      // 2026-09-03 (2ª rodada) — "indefinido" TAMBÉM é perda transitória de leitura, não
      // quebra direcional. O classificador canônico do projeto já dizia isso e o patch
      // anterior o contrariava: `AoGate.WhyEhInfra()` (AlfaOmegaSharedState.cs) marca como
      // INFRA justamente "sem tape ..." E "... indefinid(o|os)" — passos 1-2 do EsNq(), com
      // o comentário de origem: INFRA = "algo quebrado, há o que consertar"; MERCADO =
      // "leitura legítima". `esDir` vira 0 quando ME e MVI do MESMO símbolo discordam ou um
      // deles está mudo: é AUSÊNCIA de leitura, não reversão. Fechar posição real por isso é
      // fechar porque perdemos o sinal, não porque o mercado virou.
      // MEDIDO: o único trade pós-restart (17:12:58→17:15:45Z) fechou com why="ES indefinido",
      // strength 4→2. Sobra fechando por "ES x NQ divergentes" — o único `why` em que AMBOS
      // os símbolos têm leitura válida e apontam para lados OPOSTOS — além de hard stop e
      // trailing stop, que seguem intactos.
      // ⚠️ `indexOf(...) >= 0`, não `=== 0`: as strings são "ES indefinido", "NQ indefinido",
      //    "ES e NQ indefinidos" — "indefinid" nunca está na posição 0. Mesma forma do C#.
      const neutroTransitorio = typeof why === 'string'
        && (why.indexOf('forca fraca') === 0
         || why.indexOf('sem tape') === 0
         || why.indexOf('indefinid') >= 0);
      // (2026-10-14 R7–R10) precedência: limites protetivos (ativo > cesta) > NEUTRO com cesta <= 0 (R8) >
      // piso do PROTECTED > trailing > NEUTRO com cesta > 0 (R7: vira PROTECTED, não fecha). 1 fechamento por tick;
      // depois do close side=FLAT, então ticks repetidos não geram 2º CLOSE. Cesta medida no spot atual, nunca
      // presumida em zero; perna sem preço => cesta desconhecida => trata como não positiva (fecha, fail-safe).
      const neutroQuebra = dir === 'NEUTRO' && !neutroTransitorio;
      const basketKnown = esSpot != null && nqSpot != null;
      const basketPnl = basketKnown ? r2(esPnl + nqPnl) : null;
      const protectOn = !!P.neutroPositiveProtect;
      if (esPnl <= -P.hardStopUsd || nqPnl <= -P.hardStopUsd) {
        closePosition(esPnl <= -P.hardStopUsd ? 'hard_stop_es' : 'hard_stop_nq', esSpot, nqSpot, now, strength); save();
      } else if (P.basketStopUsd && basketPnl != null && basketPnl <= -P.basketStopUsd) {
        closePosition('basket_stop', esSpot, nqSpot, now, strength); save();
      } else if (neutroQuebra && !st.protected && (!protectOn || basketPnl == null || basketPnl <= 0)) {
        closePosition(protectOn ? 'anchor_neutro_negativo' : 'anchor_neutro', esSpot, nqSpot, now, strength); save();
      } else if (st.protected && (basketPnl == null ? neutroQuebra : basketPnl <= 0)) {
        closePosition('protected_floor', esSpot, nqSpot, now, strength); save();
      } else {
        const esHit = stopHit(st.legs.es, st.side, esSpot);
        const nqHit = stopHit(st.legs.nq, st.side, nqSpot);
        if (esHit || nqHit) { closePosition(esHit ? 'trailing_stop_es' : 'trailing_stop_nq', esSpot, nqSpot, now, strength); save(); }
        else if (neutroQuebra && !st.protected) { st.protected = true; st.protectedAt = now; save(); }   // R7 (monotônico)
      }
    }

    // ── entrada: roda quando FLAT — inclusive logo APÓS um fechamento neste mesmo tick, o que
    //    dá a reentrada imediata quando a saída foi por trailing stop com 4/4 (barreira não erguida). ──
    // (2026-10-02, invictus/exec v1 — D5) espelho: nenhuma entrada enquanto um trade executado no NT8 está saindo
    // (EXIT_PENDING) ou divergente. Sem registros de execução (execTrades vazio) a regra é idêntica à de antes (X13).
    if (st.side === 'FLAT' && !execBloqueiaEntrada()) {
      const cooldownOk = !st.cooldownUntil || Date.parse(now) >= Date.parse(st.cooldownUntil);
      const freshOk = !P.requireFreshFourOfFour || st.armed;
      const gateOk = strength === 4 && (dir === 'LONG' || dir === 'SHORT') && cooldownOk && freshOk && esSpot != null && nqSpot != null;
      st.lastEntryBlock = !gateOk ? null : (P.requireGateOpen && gateOpen !== true) ? 'gate_nao_open' : pctEntryBlock(dir, pct, hiro, rth, now);
      if (gateOk && !st.lastEntryBlock) {
        st.side = dir;
        st.legs.es = openLeg(esSpot);
        st.legs.nq = openLeg(nqSpot);
        st.openedAt = now; st.closedAt = null; st.armed = false;
        st.openAnchor = { dir, strength };
        st.openMeta = { priceSource: priceSource || null, replay: !!replay };
        if (outboxOn) {
          const idO = novoEventId();     // trade_id = event_id do OPEN (pré-gerado — B3)
          st.trade = { trade_id: idO, event_id_open: idO, seq_open: null };
          enfileirar({ action: 'OPEN', trade_id: idO, created_at: now, direction: dir, strength, reason: 'anchor_4_4',
            es_price: r2(esSpot), nq_price: r2(nqSpot), replay: !!replay, event_id: idO });
          commitEEmitir();               // transição + pendente no disco ANTES do append do OPEN
        } else {
          st.trade = { trade_id: null, event_id_open: null, seq_open: null };
          save();
        }
      }
    }
    return getState(esSpot, nqSpot);
  }

  // Snapshot do estado p/ o /state. meta.simulated = marca que SÓ o Deep Dive exibe.
  function getState(esSpot, nqSpot) {
    const side = st.side;
    const esPnl = legPnl(st.legs.es, side, esSpot, P.multEs);
    const nqPnl = legPnl(st.legs.nq, side, nqSpot, P.multNq);
    return {
      mode: 'simulation',
      meta: { simulated: true, note: 'Modo SIMULAÇÃO — sem execução real. Posição e P&L fictícios para validar a lógica do robô. (Marca visível só no Deep Dive.)' },
      side,
      position: side === 'FLAT' ? null : {
        es: st.legs.es ? { contracts: P.contractsEs, entry: st.legs.es.entry, stop: st.legs.es.stop, stopActive: !!st.legs.es.active, hardStop: hardStopPrice(st.legs.es.entry, side, P.multEs), pnlUsd: esPnl } : null,
        nq: st.legs.nq ? { contracts: P.contractsNq, entry: st.legs.nq.entry, stop: st.legs.nq.stop, stopActive: !!st.legs.nq.active, hardStop: hardStopPrice(st.legs.nq.entry, side, P.multNq), pnlUsd: nqPnl } : null,
      },
      pnl: { esUsd: esPnl, nqUsd: nqPnl, totalUsd: r2((esPnl || 0) + (nqPnl || 0)) },
      marks: { esSpot: r2(esSpot), nqSpot: r2(nqSpot) },
      openedAt: st.openedAt, closedAt: st.closedAt, cooldownUntil: st.cooldownUntil,
      protected: !!st.protected, entryBlock: st.lastEntryBlock || null,
      trade: st.trade || null,
      anchor: st.lastAnchor,
      params: P,
      history: st.history.slice(0, 20),
      ...(execOn() ? { exec: { trade: st.trade && st.execTrades[st.trade.trade_id] ? Object.assign({}, st.execTrades[st.trade.trade_id]) : null,
        last_seq: st.execLastSeq || 0, entry_blocked: execBloqueiaEntrada() } } : {}),
    };
  }

  // ── (2026-10-02) invictus/exec v1 — canal de volta NT8 → AOT por trade_id ─────────────────────────────────
  // O registro diz o que o NT8 EXECUTOU (sem preço/qty/conta — D2). O AOT continua o decisor único de OPEN/CLOSE:
  //  · OPEN_BLOCKED do trade aberto ⇒ NOT_EXECUTED e FLAT SEM evento (o seguidor do robô já desfez a abertura; nada a fechar);
  //    o trade não entra no trades-log (não foi executado); histerese mantida (sem reabertura em laço sobre o mesmo bloqueio).
  //  · CLOSED do trade aberto (saída originada no NT8: stop/take/proteção/sessão/manual) ⇒ o AOT DECIDE espelhar: closePosition
  //    com motivo exec_closed_<origem> — CLOSE canônico emitido (o seguidor do robô fecha; JaFechada, nenhuma ordem — no-op).
  //  · EXIT_PENDING / EXIT_FAILED_RETRY ⇒ EXIT_PENDING (nenhuma entrada nova até o CLOSED) · DIVERGENT/RECONCILED ⇒ flag.
  // Idempotente por exec_seq (<= last ⇒ ignorado). replay=true e trade desconhecido ⇒ ignorados (o seq avança).
  function execOn() { return !!(st.execTrades && Object.keys(st.execTrades).length) || !!st.execLastSeq; }
  function execBloqueiaEntrada() {
    if (!st.execTrades) return false;
    for (const tid of Object.keys(st.execTrades)) {
      const x = st.execTrades[tid];
      if (x && (x.exec_state === 'EXIT_PENDING' || (x.divergent && x.exec_state !== 'FLAT' && x.exec_state !== 'NOT_EXECUTED'))) return true;
    }
    return false;
  }
  function tradeConhecido(tid) {
    if (!tid) return false;
    if (st.trade && st.trade.trade_id === tid) return true;
    if (st.execTrades && st.execTrades[tid]) return true;
    return (st.history || []).some(h => h && h.trade_id === tid);
  }
  function applyExec(rec, ctx) {
    ctx = ctx || {};
    if (!rec || rec.schema !== 'invictus/exec v1' || typeof rec.exec_seq !== 'number' || !isFinite(rec.exec_seq)) return { applied: false, result: 'invalid' };
    st.execTrades = st.execTrades || {};
    const last = st.execLastSeq || 0;
    if (rec.exec_seq <= last) return { applied: false, result: 'duplicate' };
    const avancar = (result) => { st.execLastSeq = rec.exec_seq; save(); return { applied: result === 'applied', result }; };
    if (rec.replay === true) return avancar('replay_ignored');
    const tid = rec.trade_id;
    if (!tradeConhecido(tid)) return avancar('unknown_trade');
    const now = ctx.nowIso || rec.at || new Date().toISOString();
    const x = st.execTrades[tid] = st.execTrades[tid] || { exec_state: 'OPEN_PENDING_EXEC', exit_origin: null, divergent: false, reason: null, at: null };
    const aberto = st.side !== 'FLAT' && st.trade && st.trade.trade_id === tid;
    x.at = now;
    switch (rec.status) {
      case 'OPEN_EXECUTED':
        if (x.exec_state === 'OPEN_PENDING_EXEC') x.exec_state = 'EXECUTED';
        break;
      case 'OPEN_BLOCKED':
        x.exec_state = 'NOT_EXECUTED'; x.reason = rec.reason || null;
        if (aberto) {
          st.side = 'FLAT'; st.legs = { es: null, nq: null }; st.openedAt = null; st.closedAt = now; st.openAnchor = null; st.openMeta = null; st.trade = null;
        }
        break;
      case 'EXIT_PENDING':
      case 'EXIT_FAILED_RETRY':
        if (x.exec_state !== 'FLAT' && x.exec_state !== 'NOT_EXECUTED') { x.exec_state = 'EXIT_PENDING'; if (!x.exit_origin) x.exit_origin = rec.origin || null; }
        break;
      case 'CLOSED':
        if (!x.exit_origin) x.exit_origin = rec.origin || null;
        x.exec_state = 'FLAT'; x.divergent = false;
        if (aberto) {
          const sp = (k) => pxOrNull(ctx[k]);
          closePosition('exec_closed_' + (x.exit_origin || 'unknown'), sp('esSpot'), sp('nqSpot'), now, st.lastAnchor ? st.lastAnchor.strength : null);
        }
        break;
      case 'DIVERGENT': x.divergent = true; break;
      case 'RECONCILED': x.divergent = false; break;
      default: return avancar('invalid_status');
    }
    // poda: só os 200 trades mais recentes do espelho
    const ks = Object.keys(st.execTrades);
    if (ks.length > 200) ks.sort((a, b) => String(st.execTrades[a].at).localeCompare(String(st.execTrades[b].at))).slice(0, ks.length - 200).forEach(k => delete st.execTrades[k]);
    return avancar('applied');
  }

  function reset() { st = freshState(); save(); return getState(null, null); }

  return { tick, getState, reset, applyExec, params: P };
}

// (2026-10-14 R1–R5) Entradas do filtro a partir do payload que o BFF JÁ lê (gexbot :3457 '/', oi-latest.json):
// signals.{ts,ES,NQ}.{bull_pct,bear_pct,direction} + HIRO convergente medido contra a direção do Gate
// (hiroFor(sym, dir) = c2ForSym(...).confirm no BFF). Puro; payload ausente/erro => pct null (o motor bloqueia).
function simEntryInputs({ gex, gate, rth, hiroFor }) {
  const sig = gex && !gex._err && gex.signals && typeof gex.signals === 'object' ? gex.signals : null;
  const pick = (s) => s && typeof s === 'object' ? { bull_pct: s.bull_pct, bear_pct: s.bear_pct, direction: s.direction || null } : null;
  const pct = sig ? { ts: typeof sig.ts === 'number' ? sig.ts : null, es: pick(sig.ES), nq: pick(sig.NQ) } : null;
  const dir = gate && gate.anchor ? gate.anchor.dir : null;
  let hiro = null;
  if ((dir === 'LONG' || dir === 'SHORT') && typeof hiroFor === 'function') {
    const conf = (sym) => { try { return hiroFor(sym, dir) || 'N/A'; } catch { return 'N/A'; } };
    hiro = { es: conf('ES'), nq: conf('NQ') };
  }
  return { pct, hiro, rth: typeof rth === 'boolean' ? rth : undefined, gateOpen: !!(gate && gate.open === true) };
}

module.exports = { validPx, pxOrNull, recPrecoInvalido, createSimEngine, DEFAULT_PARAMS, simEntryInputs };
