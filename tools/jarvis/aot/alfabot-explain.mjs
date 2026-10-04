// ALFABOT SIGNAL — EXPLANATION ENGINE (pure ES module; used by JARVIS server AND served as-is to the browser at /aot/alfabot-explain.mjs).
// It explains the canonical engine (consolidator-engine.js prefilter + alfabot-signal.js finalSignalGate/canonicalState); it is NOT a signal engine:
//  - BUY/SELL appear only when the engine itself published uiState BUY/SELL and no REQUIRED condition fails/unknown (fail-closed display);
//  - the matrix never creates a direction; disagreement is flagged ENGINE_MATRIX_MISMATCH, never "corrected";
//  - knowledge/skills are returned in a separate array and cannot change any field (callers pass them through `knowledge`).
// Thresholds mirror production constants (read-only; test SIG07 compares them with the production source).
export const THRESHOLDS = Object.freeze({ TG_MIN_CONF: 75, REACTOR_MIN: 65, SIGNALS_FRESH_MS: 120000, TG_COOLDOWN_MS: 30 * 60 * 1000, SNAPSHOT_STALE_MS: 120000 });
export const RESULTS = Object.freeze(['PASS', 'FAIL', 'UNKNOWN', 'NOT_EVALUATED', 'NOT_APPLICABLE']);
export const AGGREGATES = Object.freeze(['BUY', 'SELL', 'NEUTRAL', 'WAIT', 'INVALID_DATA']);
export const COLUMNS = Object.freeze(['INDICATOR', 'SOURCE', 'VALUE', 'STATE', 'CONDITION', 'THRESHOLD', 'RESULT', 'FRESHNESS', 'CONTRIBUTION', 'EXPLANATION']);
// funnel order of the real engine: transport → bridge → gate ES×NQ → direction → confidence → cooldown → reactor → strategy (outside RTH) → plan (outside RTH)
export const FUNNEL = Object.freeze(['C1', 'C2', 'C3', 'C4', 'C5', 'C8', 'C6', 'C7', 'C10']);

const BLOCK = { REACTOR: 'SIGNAL_BLOCKED_REACTOR', MISMATCH: 'SIGNAL_BLOCKED_STRATEGY_MISMATCH', UNAVAIL: 'SIGNAL_BLOCKED_STRATEGY_UNAVAILABLE', RTH_LV: 'SIGNAL_BLOCKED_MISSING_RTH_LEVELS', MQ_LV: 'SIGNAL_BLOCKED_MISSING_MENTHORQ_LEVELS', PLAN: 'SIGNAL_BLOCKED_INVALID_TRADE_PLAN' };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ms = (t) => (t == null ? null : isNum(t) ? (t > 1e12 ? t : t * 1000) : (Number.isNaN(Date.parse(t)) ? null : Date.parse(t)));
const fr = (ok, stale) => (ok == null ? 'UNKNOWN' : ok ? 'LIVE' : stale || 'STALE');
const sideOf = (d) => (d === 'BULLISH' || d === 'LONG' ? 'BULLISH' : d === 'BEARISH' || d === 'SHORT' ? 'BEARISH' : null);

function row(id, o) { return { id, indicator: o.indicator, source: o.source, value: o.value ?? null, state: o.state ?? null, condition: o.condition, threshold: o.threshold ?? null, result: o.result, freshness: o.freshness ?? 'UNKNOWN', contribution: o.contribution, explanation: o.explanation }; }

// explainSymbol(sym, {alfabot, state, now, alfabotError, stateError})
export function explainSymbol(sym, { alfabot = null, state = null, now = Date.now(), alfabotError = null, stateError = null } = {}) {
  const s = alfabot?.symbols?.[sym] || null;
  const session = s?.sessionMode || alfabot?.session || null;
  const rth = session === 'RTH'; // unknown session ⇒ OUTSIDE rule (the engine's most restrictive rule)
  const g = state?.gate || null;
  const blockReason = s?.blockReason ?? null;
  const evaluated = s ? s.gate !== 'NOT_EVALUATED' : false;
  const rows = [];

  // C1 transport (BFF snapshot of the Consolidator)
  const snapAt = ms(alfabot?.updatedAt || alfabot?.ts); const snapAge = snapAt == null ? null : now - snapAt;
  rows.push(row('C1', { indicator: 'Snapshot ALFABOT (α Quant)', source: 'AOT BFF /api/alfabot-signal', value: snapAge == null ? null : Math.round(snapAge / 1000), state: alfabotError ? 'ERROR' : alfabot?.transport?.status ?? null, condition: 'snapshot fresco', threshold: `≤ ${THRESHOLDS.SNAPSHOT_STALE_MS / 1000} s`,
    result: alfabotError || !s ? 'UNKNOWN' : snapAge == null ? 'UNKNOWN' : snapAge <= (alfabot.staleAfterMs ?? THRESHOLDS.SNAPSHOT_STALE_MS) ? 'PASS' : 'FAIL',
    freshness: alfabotError ? 'ERROR' : !s ? 'MISSING' : fr(snapAge == null ? null : snapAge <= (alfabot.staleAfterMs ?? THRESHOLDS.SNAPSHOT_STALE_MS)), contribution: 'REQUIRED_DATA',
    explanation: alfabotError ? `fonte indisponível: ${alfabotError}` : !s ? `símbolo ${sym} ausente no snapshot` : snapAge == null ? 'snapshot sem timestamp — frescor desconhecido' : `snapshot com ${Math.round(snapAge / 1000)} s` }));
  // C2 bridge / tape
  const c2ok = g ? !!(g.online && g.tapeLive) : null;
  rows.push(row('C2', { indicator: 'Ponte AO :5151 + tape', source: 'AO bridge :5151 (NT8 AoGate.EsNq)', value: g ? `${g.online ? 'online' : 'offline'} · tape ${g.tapeLive ? 'live' : 'parado'}` : null, state: g?.state ?? null, condition: 'ponte online e tape ao vivo', threshold: 'online && tapeLive',
    result: stateError || !g ? 'UNKNOWN' : c2ok ? 'PASS' : 'FAIL', freshness: stateError ? 'ERROR' : !g ? 'MISSING' : fr(c2ok), contribution: 'REQUIRED_DATA',
    explanation: stateError ? `estado do AOT indisponível: ${stateError}` : !g ? 'estado do gate não publicado' : c2ok ? 'radar ES×NQ recebendo fluxo' : (g.reason || 'tape parado — sem confirmação de fluxo agressor') }));
  // C3 gate ES×NQ
  const an = g?.anchor || null; const c3 = an ? an.strength === 4 && (an.dir === 'LONG' || an.dir === 'SHORT') : null;
  rows.push(row('C3', { indicator: 'Gate 1 âncora ES×NQ', source: 'AO bridge :5151 → consolidator-engine.js computeConsolidated', value: an ? `${an.dir ?? '—'} ${an.strength ?? '—'}/4` : null, state: an?.why ?? g?.reason ?? null, condition: 'força 4/4 e direção definida', threshold: 'strength === 4 && dir ≠ NEUTRO',
    result: !an ? 'UNKNOWN' : c3 ? 'PASS' : 'FAIL', freshness: !an ? 'MISSING' : fr(c2ok), contribution: 'REQUIRED',
    explanation: !an ? 'âncora não publicada' : c3 ? `ES e NQ concordam ${an.dir} com força 4/4` : `gate fechado: ${an.why || g?.reason || 'força/direção insuficiente'}` }));
  // C4 consolidated direction
  const c4 = s ? s.state !== 'STAND_DOWN' && s.direction && s.direction !== 'NEUTRO' : null;
  const tier0 = state?.symbols?.[sym]?.tier0 || null;
  rows.push(row('C4', { indicator: `Direção consolidada ${sym}`, source: 'α Quant (consolidator)', value: s?.direction ?? null, state: s?.state ?? null, condition: 'candidato direcional', threshold: 'state ≠ STAND_DOWN && direction ≠ NEUTRO',
    result: !s ? 'UNKNOWN' : c4 ? 'PASS' : 'FAIL', freshness: alfabot?.sourceStatus?.candidate || s?.sourceStatus?.candidate || 'UNKNOWN', contribution: 'REQUIRED',
    explanation: !s ? 'sem dado' : c4 ? `candidato ${s.direction}` : `sem candidato (${s.state}${tier0?.reason ? ` — ${tier0.reason}` : ''})` }));
  // C5 confidence ≥ 75 (prefilter)
  const conf = isNum(tier0?.confidence) ? tier0.confidence : null;
  const c5 = conf != null ? conf >= THRESHOLDS.TG_MIN_CONF : (c4 && s?.prefilterReason === 'abaixo-limiar' ? false : null);
  rows.push(row('C5', { indicator: `Confiança ${sym}`, source: 'α Quant (consolidator tier0)', value: conf, state: s?.prefilterReason ?? null, condition: 'confiança mínima do prefiltro', threshold: `≥ ${THRESHOLDS.TG_MIN_CONF}`,
    result: c5 == null ? 'UNKNOWN' : c5 ? 'PASS' : 'FAIL', freshness: conf == null && c5 == null ? 'MISSING' : (s?.sourceStatus?.candidate || 'UNKNOWN'), contribution: 'REQUIRED',
    explanation: c5 == null ? 'confiança não publicada' : c5 ? `confiança ${conf ?? '≥ limiar'}` : `confiança ${conf ?? 'abaixo do limiar'} < ${THRESHOLDS.TG_MIN_CONF} (prefiltro "abaixo-limiar")` }));
  // C8 cooldown 30 min (after confidence, before the final gate)
  const cd = s?.prefilterReason === 'cooldown';
  rows.push(row('C8', { indicator: `Cooldown ${sym}`, source: 'α Quant (consolidator prefilter)', value: s?.prefilterReason ?? null, state: null, condition: 'sem envio nos últimos 30 min (ou flip)', threshold: '30 min',
    result: !s ? 'UNKNOWN' : cd ? 'FAIL' : evaluated ? 'PASS' : 'NOT_EVALUATED', freshness: s ? 'LIVE' : 'MISSING', contribution: 'REQUIRED',
    explanation: cd ? 'cooldown de 30 min ativo' : evaluated ? 'cooldown livre' : 'não avaliado — bloqueado antes no funil' }));
  // C6 reactor (final gate, both sessions)
  const rp = isNum(s?.reactor_pct) ? s.reactor_pct : null; const sigLive = s?.sourceStatus?.signals ?? alfabot?.sourceStatus?.signals ?? null;
  let c6 = rp == null ? null : sigLive && sigLive !== 'LIVE' ? false : rp > THRESHOLDS.REACTOR_MIN;
  if (blockReason === BLOCK.REACTOR) c6 = false;
  rows.push(row('C6', { indicator: `Reator ${sym}`, source: 'relay :3457 signals (reactor_pct)', value: rp, state: sigLive, condition: 'força do reator (gate final)', threshold: `> ${THRESHOLDS.REACTOR_MIN} e signals ≤ 120 s`,
    result: c6 == null ? 'UNKNOWN' : c6 ? 'PASS' : 'FAIL', freshness: sigLive || (rp == null ? 'MISSING' : 'UNKNOWN'), contribution: 'REQUIRED',
    explanation: c6 == null ? 'reator não publicado' : sigLive && sigLive !== 'LIVE' ? `signals ${sigLive} — o motor bloqueia (fail-closed)` : c6 ? `reator ${rp}% > ${THRESHOLDS.REACTOR_MIN}` : `reator ${rp}% ≤ ${THRESHOLDS.REACTOR_MIN}` }));
  // C7 strategy alignment (OUTSIDE_RTH only)
  const sd = s?.strategy_direction ?? null; const dir = sideOf(s?.direction);
  let c7 = rth ? 'NOT_APPLICABLE' : !dir ? 'NOT_EVALUATED' : !sd ? 'UNKNOWN' : sideOf(sd) === dir ? 'PASS' : 'FAIL';
  if (!rth && (blockReason === BLOCK.MISMATCH || blockReason === BLOCK.UNAVAIL)) c7 = 'FAIL';
  rows.push(row('C7', { indicator: `Estratégia ${sym} (família α Q)`, source: 'relay :3457 signals.strategies', value: sd, state: rth ? 'RTH' : session || 'sessão desconhecida ⇒ regra OUTSIDE', condition: 'lado único da estratégia = direção', threshold: 'OUTSIDE_RTH: strategy == direction',
    result: c7, freshness: rth ? 'NOT_SUPPORTED' : (s?.sourceStatus?.menthorq || alfabot?.sourceStatus?.menthorq || 'UNKNOWN'), contribution: rth ? 'NOT_APPLICABLE (RTH)' : 'REQUIRED (OUTSIDE_RTH)',
    explanation: rth ? 'em RTH a estratégia não participa do gate' : c7 === 'NOT_EVALUATED' ? 'sem direção para comparar' : c7 === 'PASS' ? `estratégia ${sd} alinhada` : sd === 'INDISPONÍVEL' || blockReason === BLOCK.UNAVAIL ? 'nenhuma estratégia LONG/SHORT disponível' : sd === 'CONFLITO' ? 'estratégias conflitantes LONG+SHORT' : `estratégia ${sd ?? '—'} ≠ sinal ${s?.direction ?? '—'}` }));
  // C10 trade plan (OUTSIDE_RTH engine rule; RTH display only)
  const planFail = [BLOCK.PLAN, BLOCK.MQ_LV, BLOCK.RTH_LV].includes(blockReason);
  const c10 = rth ? 'NOT_APPLICABLE' : planFail ? 'FAIL' : s?.tradePlan ? 'PASS' : evaluated && s?.gate === 'PASS' ? 'FAIL' : 'NOT_EVALUATED';
  rows.push(row('C10', { indicator: `Plano de trade ${sym}`, source: 'α Quant (alfabot-signal.js plan)', value: s?.tradePlan ? 'presente' : null, state: blockReason && planFail ? blockReason : null, condition: 'plano com níveis coerentes', threshold: 'OUTSIDE_RTH: 2 níveis à frente + 1 atrás',
    result: c10, freshness: s?.structuralTradePlan?.freshness_state || 'UNKNOWN', contribution: rth ? 'DISPLAY_ONLY (RTH)' : 'REQUIRED (OUTSIDE_RTH)',
    explanation: rth ? 'em RTH o plano estrutural nunca bloqueia' : planFail ? `plano bloqueado: ${blockReason}` : c10 === 'PASS' ? 'plano válido publicado' : 'não avaliado — bloqueado antes no funil' }));
  // C11 α Q positive confirmation (RTH, confirmation only — never blocks)
  const mqc = s?.menthorq_positive_confirmation;
  rows.push(row('C11', { indicator: 'Confirmação α Q (RTH)', source: 'α Q (menthorq)', value: mqc == null ? null : String(mqc), state: null, condition: 'confirmação positiva', threshold: 'aligned ⇒ confirma; outro ⇒ efeito zero',
    result: !rth ? 'NOT_APPLICABLE' : mqc === true ? 'PASS' : 'NOT_APPLICABLE', freshness: rth ? (mqc == null ? 'MISSING' : 'LIVE') : 'NOT_SUPPORTED', contribution: 'CONFIRMATION_ONLY',
    explanation: !rth ? 'só publicada em RTH' : mqc === true ? 'α Q confirma a direção' : 'sem confirmação — efeito zero (nunca bloqueia)' }));
  // C9 sampling note (display only)
  rows.push(row('C9', { indicator: 'Amostragem', source: 'consolidator-engine.js (60 s) vs aot-sim.js (~20 s, com latch)', value: '60 s', state: null, condition: 'informativo', threshold: null, result: 'NOT_APPLICABLE', freshness: 'NOT_SUPPORTED', contribution: 'DISPLAY_ONLY',
    explanation: 'o ALFABOT lê um snapshot a cada 60 s sem latch; o robô AOT avalia ~20 s e segura a posição em leituras fracas transitórias — por isso podem divergir' }));

  return aggregate(sym, rows, { engine: s?.uiState ?? null, session, blockReason, s });
}

function aggregate(sym, rows, { engine, session, blockReason, s }) {
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const required = rows.filter((r) => /^REQUIRED/.test(r.contribution));
  const counts = { conditions_total: required.length, conditions_passed: 0, conditions_failed: 0, conditions_unknown: 0, conditions_not_evaluated: 0 };
  for (const r of required) { if (r.result === 'PASS') counts.conditions_passed++; else if (r.result === 'FAIL') counts.conditions_failed++; else if (r.result === 'UNKNOWN') counts.conditions_unknown++; else counts.conditions_not_evaluated++; }
  const blocking = FUNNEL.map((id) => by[id]).filter((r) => r && /^REQUIRED/.test(r.contribution) && (r.result === 'FAIL' || r.result === 'UNKNOWN'));
  const flags = [];
  let signal;
  if (by.C1.result !== 'PASS' || by.C2.result !== 'PASS') signal = 'INVALID_DATA';
  else if (engine === 'BUY' || engine === 'SELL') {
    if (blocking.length) { signal = 'WAIT'; flags.push('ENGINE_MATRIX_MISMATCH'); } else signal = engine;
  } else if (by.C3.result === 'FAIL' || by.C4.result === 'FAIL') signal = 'NEUTRAL';
  else { signal = 'WAIT'; if (!blocking.length) flags.push('ENGINE_MATRIX_MISMATCH'); }
  const first = blocking[0] || null;
  const notLive = required.filter((r) => r.result !== 'NOT_APPLICABLE' && r.freshness !== 'LIVE');
  const status = signal === 'INVALID_DATA' ? 'INVALID' : notLive.length ? 'DEGRADED' : 'LIVE';
  const passed = required.filter((r) => r.result === 'PASS');
  const inv = s?.tradePlan?.stop ?? s?.structuralTradePlan?.stop?.price ?? null;
  return {
    schema: 'alfabot-explain/v1', symbol: sym, session: session ?? 'UNKNOWN', engine_ui_state: engine, engine_block_reason: blockReason ?? null,
    signal, flags, status, ...counts,
    blocking_conditions: blocking.map((r) => ({ id: r.id, indicator: r.indicator, result: r.result, explanation: r.explanation })),
    confirmations: rows.filter((r) => r.contribution === 'CONFIRMATION_ONLY' && r.result === 'PASS').map((r) => r.id),
    invalidation: isNum(inv) ? { price: inv, source: 'engine trade plan' } : 'não publicada pelo motor',
    data_quality: { not_live: notLive.map((r) => `${r.id}:${r.freshness}`) },
    freshness: by.C1.freshness,
    why_now: signal === 'BUY' || signal === 'SELL' ? `${signal}: ${passed.map((r) => `${r.id} ${r.indicator}`).join(' · ')} — publicado pelo motor` : null,
    why_not: signal === 'BUY' || signal === 'SELL' ? null : first ? `bloqueio em ${first.id} (${first.indicator}): ${first.explanation}` : signal === 'WAIT' ? 'todas as condições exigidas passam, mas o motor não publicou BUY/SELL (ENGINE_MATRIX_MISMATCH)' : 'sem candidato',
    summary_line: `${counts.conditions_passed}/${counts.conditions_total} condições exigidas passam${first ? `; bloqueio: ${first.id} ${first.explanation}` : ''}`,
    rows, columns: COLUMNS,
  };
}

// explain({alfabot, state, now, alfabotError, stateError, knowledge}) → {ES, NQ, knowledge}
export function explain(input = {}) {
  const out = { schema: 'alfabot-explain/v1', at: new Date(input.now ?? Date.now()).toISOString(), symbols: {} };
  for (const sym of ['ES', 'NQ']) out.symbols[sym] = explainSymbol(sym, input);
  out.knowledge = Array.isArray(input.knowledge) ? input.knowledge : []; // separate; never read by the matrix
  return out;
}

// SIG08: dead / impossible condition detection over a rule set (canonical constants ⇒ none).
export function deadConditions(rules = {}) {
  const r = { conf_min: THRESHOLDS.TG_MIN_CONF, conf_max: 100, reactor_min: THRESHOLDS.REACTOR_MIN, reactor_max: 100, strategy_required_in_rth: false, signals_fresh_ms: THRESHOLDS.SIGNALS_FRESH_MS, sample_ms: 60000, ...rules };
  const out = [];
  if (!(r.conf_min <= r.conf_max)) out.push({ id: 'C5', finding: 'DEAD', why: `confiança ≥ ${r.conf_min} impossível (máx ${r.conf_max})` });
  if (!(r.reactor_min < r.reactor_max)) out.push({ id: 'C6', finding: 'DEAD', why: `reator > ${r.reactor_min} impossível (máx ${r.reactor_max})` });
  if (r.strategy_required_in_rth) out.push({ id: 'C7', finding: 'CONFLICT', why: 'estratégia exigida em RTH contradiz a regra RTH do motor (estratégia não participa)' });
  if (r.signals_fresh_ms <= 0) out.push({ id: 'C6', finding: 'DEAD', why: 'janela de frescor ≤ 0 — nenhum signals seria fresco' });
  if (r.cooldown_ms != null && r.cooldown_ms < 0) out.push({ id: 'C8', finding: 'DEAD', why: 'cooldown negativo' });
  return out;
}
