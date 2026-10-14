// Aplica o patch GC/SI = ES/NQ sobre uma CÓPIA do aot-bff.js (staging). Uso: node patch-bff-eqv.cjs <arquivo>
// Cada substituição exige âncora única; qualquer divergência aborta sem gravar.
const fs = require('fs');
const f = process.argv[2]; if (!f) { console.error('uso: node patch-bff-eqv.cjs <aot-bff.js>'); process.exit(2); }
let s = fs.readFileSync(f, 'utf8'); const nl = s.includes('\r\n') ? '\r\n' : '\n';
const rep = (a, b) => { const A = a.replace(/\n/g, nl), B = b.replace(/\n/g, nl); if (s.split(A).length !== 2) throw new Error('âncora não única: ' + a.slice(0, 70)); s = s.replace(A, B); };

// (1) 2ª instância do sim (GC/SI), isolada, off por padrão
rep(`const simEngine = SIM_ON ? createSimEngine({ persistPath: SIM_STATE_FILE, historyDir: SIM_HISTORY_DIR, emitEvent: simEmitEvent }) : null;
`, `const simEngine = SIM_ON ? createSimEngine({ persistPath: SIM_STATE_FILE, historyDir: SIM_HISTORY_DIR, emitEvent: simEmitEvent }) : null;
// ── (2026-10-14) SIMULADOR GC/SI INDEPENDENTE — GC/SI = ES/NQ (decisão do operador). off por padrão (AOT_GCSI_SIM=on liga).
// 2ª instância do MESMO motor (aot-gcsi-sim.js → createSimEngine) com estado, histórico e canal de eventos PRÓPRIOS em
// history-gcsi/. NUNCA usa simEmitEvent nem /sim/events (consumidos pelo executor INVICTUS): zero ordem, zero conta.
const GCSI_SIM_ON = String(process.env.AOT_GCSI_SIM || 'off').toLowerCase() === 'on';
const GCSI_SIM_DIR = process.env.AOT_GCSI_SIM_DIR || path.join(__dirname, 'history-gcsi');
let gcsiSim = null;
if (GCSI_SIM_ON) { try { gcsiSim = require('./aot-gcsi-sim').createGcSiSim({ dir: GCSI_SIM_DIR }); } catch (e) { console.warn('[gcsi-sim] off:', (e && e.message) || e); gcsiSim = null; } }
`);

// (2) âncora GC/SI da ponte (passo 4)
rep(`const GCSI_NO_FORCE = 'etapa de força não aplicada: AoForcaJanela (passo 4 do AoGate.EsNq) só tem publicador para ES e NQ';
`, `const GCSI_NO_FORCE = 'etapa de força não aplicada: AoForcaJanela (passo 4 do AoGate.EsNq) só tem publicador para ES e NQ';
// (2026-10-14) GC/SI = ES/NQ: a ponte publica \`anchorGcSi\` = AoGate.GcSi() (4 passos, força incluída). Presente ⇒ o passo 4
// é APLICADO a partir dele (o gate não é reimplementado em JS). Ausente/inválido ⇒ força NÃO comprovada ⇒ fail-closed:
// open=false e fase ESPERANDO_CONFIRMACAO mesmo com radar 4/4 (exemplo obrigatório do operador). Nunca libera ordem.
const GCSI_WAIT = 'ESPERANDO CONFIRMAÇÃO';
function gcsiAnchorOf(ao) {
  const a = (ao && !ao._err) ? ao.anchorGcSi : null;
  if (!a || typeof a !== 'object' || a.source !== 'AoGate.GcSi' || typeof a.ok !== 'boolean') return null;
  const d = sgn(numOrNull(a.dir) || 0);
  return { ok: a.ok === true && d !== 0, dir: (a.ok === true && d !== 0) ? dirWord(d) : 'NEUTRO', strength: numOrNull(a.strength), why: (typeof a.why === 'string' && a.why) ? a.why : null };
}
`);

// (3) gate GC/SI: força aplicada; 4/4 sem força ⇒ ESPERANDO CONFIRMAÇÃO
rep(`  const temDirecao = (dir === 'LONG' || dir === 'SHORT');
  const open = !!(hasLegs && ready && tapeLive && strength === 4 && temDirecao);
  const state = !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : open ? 'OPEN' : 'CLOSED';
`, `  const temDirecao = (dir === 'LONG' || dir === 'SHORT');
  const radarDir = dir;                                            // passos 1–3 (radar), antes da força
  const radarOpen = !!(hasLegs && ready && tapeLive && strength === 4 && temDirecao);
  const ga = gcsiAnchorOf(ao);                                     // passo 4 (AoGate.GcSi na ponte)
  const forceOk = !!(ga && ga.ok && ga.dir === radarDir);
  const open = radarOpen && forceOk;
  const waiting = radarOpen && !forceOk;                           // 4/4 + força insuficiente/não comprovada
  if (waiting) { dir = 'NEUTRO'; why = (ga && ga.why) || 'forca fraca GC/SI (anchorGcSi ausente)'; }
  const state = !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : open ? 'OPEN' : 'CLOSED';
  const phase = !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : open ? 'CONFIRMADO' : waiting ? 'ESPERANDO_CONFIRMACAO' : 'SEM_SINAL';
  const forceStep = ga
    ? { applied: true, status: forceOk ? 'PASS' : ((ga.why && ga.why.indexOf('forca fraca') === 0) ? 'WEAK' : 'NOT_REACHED'), source: 'anchorGcSi (AoGate.GcSi, ponte :5151)', why: ga.why, anchorDir: ga.dir }
    : { applied: false, status: 'UNAVAILABLE', source: null, note: 'anchorGcSi ausente na ponte :5151 — força não comprovada ⇒ fail-closed (' + GCSI_WAIT + ' com radar 4/4)' };
`);
rep(`  else reason = 'Radar formado 4/4 · tape ao vivo · direção ' + dir + '. Passos 1–3 do gate confirmados; ' + GCSI_NO_FORCE + '. Contexto — nunca operado.';
`, `  else if (waiting) reason = GCSI_WAIT + ' — Radar 4/4 ' + radarDir + ' · tape ao vivo · ' + (ga ? 'força insuficiente (' + (ga.why || 'AoGate.GcSi reprovou') + ')' : 'força não comprovada (anchorGcSi ausente na ponte)') + '. Sem direção, sem ordem.';
  else reason = 'Gate GC×SI CONFIRMADO 4/4 · tape ao vivo · força aprovada (AoGate.GcSi) · direção ' + dir + '. Sem ordem real (simulação apenas).';
`);
rep(`      anchor: { dir, strength, why }, open, state, dir, reason, why,
      forceStep: { applied: false, status: 'UNAVAILABLE', note: GCSI_NO_FORCE } },
`, `      anchor: { dir, strength, why }, open, state, phase, dir, radarDir, radarOpen, reason, why,
      forceStep },
`);
rep(`gateSteps: 'AoGate.EsNq passos 1–3', forceStep: 'UNAVAILABLE', multi:`, `gateSteps: 'AoGate.EsNq passos 1–3 (radar) + passo 4 via anchorGcSi (AoGate.GcSi)', forceStep: forceStep.status, multi:`);

// (4) tick do sim GC/SI no poll (depois do sim ES/NQ, try próprio)
rep(`  // Modo replay/demo — ADITIVO: só entra no /state com AOT_REPLAY_DATE setada (produção não tem a chave).
`, `  // (2026-10-14) SIMULADOR GC/SI independente — try próprio; só com AOT_GCSI_SIM=on. Âncora = gate GC/SI (força via
  // anchorGcSi); preço = lastPrice das pernas gc/si do :5151 só com perna LIVE. Canal isolado; nunca toca STATE.sim.
  if (GCSI_SIM_ON && gcsiSim) {
    try {
      const fg = (flowGcSi && !flowGcSi._err) ? flowGcSi : null;
      STATE.simGcSi = gcsiSim.tick(Object.assign(gcsiSimInput(fg), { nowIso, replay: !!REPLAY || !!(ao && ao.isReplay) }));
    } catch (e) { STATE.simGcSi = { _err: (e && e.message) || 'gcsi sim err' }; }
  }
  // Modo replay/demo — ADITIVO: só entra no /state com AOT_REPLAY_DATE setada (produção não tem a chave).
`);
rep(`// Confluência ES×NQ com FONTE por horário (P2 / Camada 1). Extraída p/ TESTE ISOLADO.
`, `// (2026-10-14) flowGcSi → entrada do sim GC/SI. Âncora operável SÓ com gate CONFIRMADO (força aprovada); o \`why\` só passa
// quando a força foi aplicada (sem anchorGcSi o motor recebe why=null = fechamento fail-visible, como o anchor ES/NQ ausente).
function gcsiSimInput(fg) {
  const g = fg ? fg.gate : null;
  const anchor = g ? { dir: g.open ? g.dir : 'NEUTRO', strength: typeof g.strength === 'number' ? g.strength : 0,
    why: (g.forceStep && g.forceStep.applied) ? (g.why || null) : null } : null;
  const px = (leg) => (leg && leg.state === 'LIVE') ? spotOrNull(leg.lastPrice) : null;
  return { anchor, gcSpot: fg ? px(fg.gc) : null, siSpot: fg ? px(fg.si) : null };
}

// Confluência ES×NQ com FONTE por horário (P2 / Camada 1). Extraída p/ TESTE ISOLADO.
`);

// (5) rotas somente leitura
rep(`  // ── STREAM CANONICO DE EVENTOS (sync total) — GET /sim/events?after=<seq>&limit=<n> ──
`, `  // ── (2026-10-14) GC/SI — rotas SOMENTE LEITURA do simulador independente (canal isolado; nunca /sim/events) ──
  if (p === '/gcsi/sim' || p === '/gcsi/events' || p === '/gcsi/history') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });
    if (!gcsiSim) return sendJson(res, 200, { enabled: false, note: 'AOT_GCSI_SIM=off (padrão)' });
    if (p === '/gcsi/sim') return sendJson(res, 200, Object.assign({ enabled: true }, gcsiSim.getState()));
    if (p === '/gcsi/events') {
      const after = Math.max(0, parseInt(u.searchParams.get('after') || '0', 10) || 0);
      const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit') || '200', 10) || 200));
      return sendJson(res, 200, Object.assign({ schema: 'aot-gcsi-sim/events v1', enabled: true, source: 'AOT_GCSI_SIM_ISOLATED', after, limit }, gcsiSim.readEvents(after, limit)));
    }
    const days = Math.min(180, Math.max(1, parseInt(u.searchParams.get('days') || '30', 10) || 30));
    return sendJson(res, 200, Object.assign({ enabled: true }, gcsiSim.readHistory(days, u.searchParams.get('includeReplay') === '1')));
  }
  // ── STREAM CANONICO DE EVENTOS (sync total) — GET /sim/events?after=<seq>&limit=<n> ──
`);

// (6) export p/ teste isolado
rep(`  module.exports = { computeConfluence, c1FromLeg, buildFlowGcSi,`, `  module.exports = { computeConfluence, c1FromLeg, buildFlowGcSi, gcsiAnchorOf, gcsiSimInput,`);

fs.writeFileSync(f, s); console.log('patched', f);
