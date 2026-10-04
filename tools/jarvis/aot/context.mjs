// AOT raw snapshots → compact JARVIS observation per area (pure; no I/O).
// Item: {key,label,value,prev,delta,unit,state,data_state,provenance,source,endpoint,source_ts,age_ms,threshold,related[]}
// Rules (mission §19): null/absent ⇒ MISSING with value null (never 0); unknown freshness ⇒ UNKNOWN (never FAIL);
// a source/vendor timestamp is preferred — arrival time alone never makes a value LIVE.
// Account names/ids (robo execucao.conta, nt8_account) are never copied into an observation.
import { areaById } from './areas.mjs';

export const DATA_STATES = Object.freeze(['LIVE', 'DELAYED', 'STALE', 'MISSING', 'NOT_SUPPORTED', 'ERROR', 'UNKNOWN']);
export const PROVENANCE = Object.freeze(['LIVE_DATA', 'DERIVED_CALCULATION', 'AOT_STATE', 'HISTORICAL_RECORD', 'SPOTGAMMA_KNOWLEDGE', 'MENTHORQ_KNOWLEDGE', 'ALPHA_SKILL', 'CROSS_SOURCE_INTERPRETATION']);
export const DELAYED_MAX_MS = 300000; // provisional (documented in JARVIS_AOT_INTEGRATION.md)

// Same alias table as the production presentation layer (consolidator-engine\alfabot-signal.js ALIAS_RULES): no vendor names in UI text.
const ALIAS = [[/consolidator/gi, 'α Quant'], [/spotgamma/gi, 'α Gamma'], [/gexbot/gi, 'α Bot'], [/menthorq/gi, 'α Q'], [/quantdata/gi, 'α Data']];
export const alias = (s) => ALIAS.reduce((t, [re, to]) => t.replace(re, to), String(s ?? ''));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const tsMs = (t) => { if (t == null || t === '') return null; if (isNum(t)) return t > 1e12 ? t : t * 1000; const n = Date.parse(t); return Number.isNaN(n) ? null : n; };

// historical=true (HISTORY area): a record has no freshness ⇒ NOT_SUPPORTED (never LIVE); MISSING/ERROR still apply.
export function dataState({ value, source_ts, now, live_ms, fetch_error, historical = false }) {
  if (fetch_error) return 'ERROR';
  if (value === null || value === undefined || value === '') return 'MISSING';
  if (historical) return 'NOT_SUPPORTED';
  const t = tsMs(source_ts);
  if (t == null) return 'UNKNOWN';
  const age = now - t;
  if (age <= live_ms) return 'LIVE';
  return age <= DELAYED_MAX_MS ? 'DELAYED' : 'STALE';
}

function mk(ctx, { key, label, value, unit = null, state = null, provenance = 'AOT_STATE', source, endpoint, source_ts = null, threshold = null, related = [], live_ms, historical = false }) {
  const v = value === undefined ? null : value;
  const t = tsMs(source_ts);
  return {
    key, label, value: v, prev: null, delta: null, unit, state: state ?? null,
    data_state: dataState({ value: v, source_ts, now: ctx.now, live_ms: live_ms ?? ctx.live_ms, fetch_error: ctx.errors[endpoint], historical }),
    provenance, source: alias(source), endpoint, source_ts: t == null ? null : new Date(t).toISOString(), age_ms: t == null ? null : ctx.now - t, threshold, related,
  };
}

const SRC_KEYS = ['consolidator', 'spotgamma', 'gexbot', 'menthorq', 'quantdata', 'alfaomega'];

function command(ctx, st) {
  const E = '/state', ts = st?.asof, out = [];
  const g = st?.gate || {};
  out.push(mk(ctx, { key: 'session', label: 'Sessão', value: st?.session, source: 'AOT BFF', endpoint: E, source_ts: ts }));
  out.push(mk(ctx, { key: 'stack_mode', label: 'Modo do stack', value: st?.stackMode, source: 'AOT BFF', endpoint: E, source_ts: ts }));
  out.push(mk(ctx, { key: 'gate.state', label: 'Gate 1 ES×NQ (radar)', value: g.state, state: g.open ? 'OPEN' : 'CLOSED', source: 'AO bridge :5151', endpoint: E, source_ts: ts, related: ['gate.anchor', 'tape'] }));
  out.push(mk(ctx, { key: 'gate.anchor', label: 'Âncora ES×NQ', value: g.anchor ? `${g.anchor.dir ?? '—'} ${g.anchor.strength ?? '—'}/4` : null, state: g.anchor?.why || g.reason || null, source: 'AO bridge :5151', endpoint: E, source_ts: ts, threshold: 'strength === 4 e dir ≠ NEUTRO' }));
  out.push(mk(ctx, { key: 'tape', label: 'Tape AO (fluxo agressor)', value: g.tapeLive == null ? null : (g.tapeLive ? 'LIVE' : 'PARADO'), source: 'AO bridge :5151', endpoint: E, source_ts: st?.tapeFreshness?.asof }));
  const cf = st?.confluence || {};
  out.push(mk(ctx, { key: 'confluence', label: 'Confluência ES/NQ', value: cf.label ?? null, state: cf.confirmed ? 'CONFIRMADA' : 'NÃO CONFIRMADA', source: 'AOT BFF', endpoint: E, source_ts: ts, provenance: 'DERIVED_CALCULATION' }));
  for (const k of SRC_KEYS) {
    const s = st?.sources?.[k]; if (!s) continue;
    out.push(mk(ctx, { key: `source.${k}`, label: `Fonte ${alias(k)}`, value: s.status ?? null, state: s.data_state ?? null, source: k, endpoint: E, source_ts: s.updated_at, live_ms: (s.stale_after_s ?? 120) * 1000 }));
  }
  const h = st?.health || {};
  out.push(mk(ctx, { key: 'health', label: 'Saúde declarativa', value: h.severity ?? null, state: h.counts ? `${h.counts.ok}/${h.counts.total} ok · ${h.counts.degraded} degradado · ${h.counts.down} down` : null, source: 'AOT BFF', endpoint: E, source_ts: h.at }));
  for (const a of (h.alerts || []).slice(0, 5)) out.push(mk(ctx, { key: `alert.${a.id}`, label: `Alerta: ${a.label}`, value: a.status, state: a.why ?? null, source: 'AOT BFF', endpoint: E, source_ts: h.at }));
  return out;
}

function deepDive(ctx, st, ind) {
  const E = '/state', I = '/api/indicators', ts = st?.asof, its = ind?.asof, out = [];
  const w = ind?.walls;
  if (w) for (const [k, l] of [['callWall', 'Call wall'], ['putWall', 'Put wall'], ['zeroGamma', 'Zero gamma'], ['hedgeWall', 'Hedge wall'], ['keyGamma', 'Key gamma']]) out.push(mk(ctx, { key: `walls.${k}`, label: `${l} (ES)`, value: isNum(w[k]) ? w[k] : null, unit: 'pt ES', source: 'spotgamma', endpoint: I, source_ts: its, provenance: 'LIVE_DATA' }));
  else out.push(mk(ctx, { key: 'walls', label: 'Walls (ES)', value: null, source: 'spotgamma', endpoint: I, source_ts: its }));
  const gp = ind?.gammaPressure;
  out.push(mk(ctx, { key: 'gammaPressure', label: 'Pressão de gamma (regime)', value: gp?.ok ? gp.regime : null, state: gp?.ok ? `P=${gp.P}` : gp?.note ?? null, source: 'spotgamma', endpoint: I, source_ts: its, provenance: 'DERIVED_CALCULATION' }));
  out.push(mk(ctx, { key: 'hiroRegime', label: 'Regime HIRO', value: ind?.hiroRegime?.ok ? ind.hiroRegime.regime ?? 'OK' : null, state: ind?.hiroRegime?.note ?? null, source: 'spotgamma', endpoint: I, source_ts: its }));
  const ho = st?.hiroOpra;
  for (const s of ['es', 'nq']) out.push(mk(ctx, { key: `hiroOpra.${s}`, label: `HIRO OPRA (DEX-flow) ${s.toUpperCase()}`, value: ho?.[s]?.dir ?? null, state: isNum(ho?.[s]?.value) ? String(ho[s].value) : null, source: 'gexbot', endpoint: E, source_ts: ho?.ts, provenance: 'LIVE_DATA' }));
  const zg = st?.zeroGamma0dte;
  out.push(mk(ctx, { key: 'zeroGamma0dte', label: 'Zero gamma 0DTE vs estrutura', value: zg?.ok ? zg.regimePor0dte : null, state: zg?.ok ? `0DTE ${zg.zeroGamma0dteFut} · full ${zg.zeroGammaFullFut} · gap ${zg.gapPt} pt` : null, source: 'quantdata', endpoint: E, source_ts: ts, provenance: 'DERIVED_CALCULATION' }));
  const dg = st?.dexGexFlow;
  for (const s of ['ES', 'NQ']) out.push(mk(ctx, { key: `dexGexFlow.${s}`, label: `Gamma condition ${s}`, value: dg?.[s]?.ok ? dg[s].gamma_condition : null, state: dg?.[s]?.ok ? `net GEX 0DTE ${dg[s].net_gex_0dte} · DEX flow ${dg[s].dexoflow}` : null, source: 'gexbot', endpoint: E, source_ts: ts, provenance: 'LIVE_DATA' }));
  const tc = st?.traceCloud;
  out.push(mk(ctx, { key: 'traceCloud', label: 'Banda de pin (gamma dealer)', value: tc?.where ?? null, state: tc?.band ? `${tc.band.lo}–${tc.band.hi} · ${tc.band.trend}` : null, source: 'spotgamma', endpoint: E, source_ts: tc?.asof, provenance: 'DERIVED_CALCULATION' }));
  out.push(mk(ctx, { key: 'vix', label: 'VIX', value: st?.vixLine?.ok ? st.vixLine.value : null, state: st?.vixLine?.trend ?? null, source: 'spotgamma', endpoint: E, source_ts: st?.vixLine?.asof, provenance: 'LIVE_DATA' }));
  const mq = st?.menthorqStrategies?.ES;
  out.push(mk(ctx, { key: 'menthorq.activGate', label: 'α Q ActivGate (ES)', value: mq?.activGate ? (mq.activGate.pass ? 'PASS' : 'FAIL') : null, state: mq?.activGate?.reason ?? null, source: 'menthorq', endpoint: E, source_ts: st?.menthorqStrategies?.asof, provenance: 'DERIVED_CALCULATION' }));
  const v2 = st?.v2?.es;
  out.push(mk(ctx, { key: 'v2.c1', label: 'Stack v2 C1 (radar)', value: v2?.c1 ? v2.c1.dir : null, state: v2?.c1?.note ?? null, source: 'AOT BFF', endpoint: E, source_ts: ts, provenance: 'DERIVED_CALCULATION' }));
  return out;
}

function automation(ctx, st) {
  const E = '/state', ts = st?.asof, sim = st?.sim || {}, out = [];
  out.push(mk(ctx, { key: 'sim.mode', label: 'Modo da automação', value: sim.mode ?? null, source: 'AOT sim', endpoint: E, source_ts: ts }));
  out.push(mk(ctx, { key: 'sim.side', label: 'Posição simulada', value: sim.side ?? null, source: 'AOT sim', endpoint: E, source_ts: ts }));
  out.push(mk(ctx, { key: 'sim.anchor', label: 'Âncora vista pela automação', value: sim.anchor ? `${sim.anchor.dir} ${sim.anchor.strength ?? '—'}/4` : null, state: sim.anchor?.why ?? null, source: 'AO bridge :5151', endpoint: E, source_ts: ts, threshold: 'abre só com 4/4 e dir LONG/SHORT' }));
  const cd = tsMs(sim.cooldownUntil); const left = cd == null ? null : Math.max(0, Math.round((cd - ctx.now) / 1000));
  out.push(mk(ctx, { key: 'sim.cooldown', label: 'Cooldown restante', value: left, unit: 's', state: left ? 'ATIVO' : 'LIVRE', source: 'AOT sim', endpoint: E, source_ts: ts, threshold: sim.params?.cooldownSec != null ? `${sim.params.cooldownSec} s` : null, provenance: 'DERIVED_CALCULATION' }));
  out.push(mk(ctx, { key: 'sim.entry_blocked', label: 'Entrada bloqueada', value: sim.exec ? String(!!sim.exec.entry_blocked) : null, source: 'AOT sim', endpoint: E, source_ts: ts }));
  out.push(mk(ctx, { key: 'sim.requireFresh', label: 'Exige 4/4 fresco', value: sim.params ? String(!!sim.params.requireFreshFourOfFour) : null, source: 'AOT sim', endpoint: E, source_ts: ts }));
  // awaited / satisfied / missing conditions, derived only from published fields
  const g = st?.gate || {};
  const conds = [['bridge online', g.online], ['tape live', g.tapeLive], ['âncora 4/4', g.anchor?.strength === 4], ['direção definida', ['LONG', 'SHORT'].includes(g.anchor?.dir)], ['cooldown livre', left == null ? null : left === 0]];
  for (const [n, v] of conds) out.push(mk(ctx, { key: `cond.${n}`, label: `Condição: ${n}`, value: v == null ? null : (v ? 'SATISFEITA' : 'FALTANDO'), source: 'AOT BFF', endpoint: E, source_ts: ts, provenance: 'DERIVED_CALCULATION' }));
  return out;
}

function robot(ctx, raws) {
  const out = [];
  for (const sym of ['ES', 'NQ']) {
    const E = `/robo/state?sym=${sym}`, r = raws[E]; if (!r) continue;
    const re = r.reactor || {}, es = r.estrategia || {}, de = r.decisao || {};
    out.push(mk(ctx, { key: `${sym}.reactor`, label: `${sym} reator`, value: isNum(re.percentual) ? re.percentual : null, unit: '%', state: re.direcao ?? null, source: 'signal-engine reactor R2', endpoint: E, source_ts: re.timestamp_iso, live_ms: (re.stale_limite_s ?? 90) * 1000, threshold: re.threshold != null ? `> ${re.threshold}` : null, provenance: 'LIVE_DATA', related: [`${sym}.decisao`] }));
    out.push(mk(ctx, { key: `${sym}.estrategia`, label: `${sym} direção da estratégia`, value: es.direcao_final ?? null, state: es.status ?? null, source: 'AOT robo', endpoint: E, source_ts: r.ts, provenance: 'DERIVED_CALCULATION' }));
    out.push(mk(ctx, { key: `${sym}.decisao`, label: `${sym} decisão do robô`, value: de.estado ?? null, state: de.motivo ? alias(de.motivo).slice(0, 160) : null, source: 'AOT robo', endpoint: E, source_ts: r.ts }));
    out.push(mk(ctx, { key: `${sym}.mesa`, label: `${sym} mesa (somente exibição)`, value: r.mesa ? (r.mesa.trading_enabled ? 'HABILITADA' : 'DESABILITADA') : null, state: r.mesa?.motivo ?? null, source: 'AOT robo', endpoint: E, source_ts: r.ts }));
    out.push(mk(ctx, { key: `${sym}.gaps`, label: `${sym} lacunas declaradas`, value: Array.isArray(r.gaps) ? r.gaps.length : null, source: 'AOT robo', endpoint: E, source_ts: r.ts }));
  }
  return out;
}

const fmtUsd = (v) => (isNum(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)} USD` : null);
function history(ctx, h) {
  const E = '/history?days=2', out = [];
  const ki = h?.kpisInvictus, ka = h?.kpis;
  // Historical records have no freshness; they are dated by their own trade timestamps (source_ts = newest record).
  const newest = (h?.trades || []).map((t) => t.closedAt || t.openedAt).filter(Boolean).sort().pop() ?? null;
  out.push(mk(ctx, { key: 'kpis.invictus', label: 'INVICTUS (registro histórico, 2 dias)', value: ki ? `${ki.n} trades · ${ki.wins}W/${ki.losses}L` : null, state: ki ? fmtUsd(ki.totalUsd) : null, source: 'NT8 ledger (via AOT)', endpoint: E, source_ts: newest, provenance: 'HISTORICAL_RECORD', historical: true }));
  out.push(mk(ctx, { key: 'kpis.aot', label: 'AOT SIM (registro histórico, 2 dias)', value: ka ? `${ka.n} trades · ${ka.wins}W/${ka.losses}L` : null, state: ka ? fmtUsd(ka.totalUsd) : null, source: 'AOT history', endpoint: E, source_ts: newest, provenance: 'HISTORICAL_RECORD', historical: true }));
  for (const t of (h?.trades || []).slice(-8)) {
    const id = String(t.id || t.trade_id || '').slice(-8);
    out.push(mk(ctx, { key: `trade.${id}`, label: `Trade ${t.side ?? '—'} ${t.closedAt ? new Date(t.closedAt).toISOString().slice(5, 16).replace('T', ' ') + 'Z' : ''}`, value: fmtUsd(t.totalUsd), state: t.reason ?? null, source: t.engine === 'invictus' ? 'NT8 ledger (via AOT)' : 'AOT history', endpoint: E, source_ts: t.closedAt, provenance: 'HISTORICAL_RECORD', historical: true }));
  }
  out.push(mk(ctx, { key: 'integrity', label: 'Integridade do histórico', value: h?.integrity ? (h.integrity.appendOnly ? 'append-only' : 'NÃO append-only') : null, state: h?.integrity ? `${h.integrity.totalLines} linhas · ${h.integrity.invalidos} inválidos` : null, source: 'AOT history', endpoint: E, source_ts: newest, provenance: 'HISTORICAL_RECORD', historical: true }));
  return out;
}

// extract(areaId, raws, {now}) — raws = {path: adapterResult}
export function extract(areaId, raws, { now = Date.now() } = {}) {
  const a = areaById(areaId); if (!a) throw new Error(`unknown area ${areaId}`);
  const errors = {}; const body = {};
  for (const [p, r] of Object.entries(raws || {})) { errors[p] = r?.ok ? null : (r?.error || 'unavailable'); body[p] = r?.ok ? r.body : null; }
  const ctx = { now, errors, live_ms: a.cadence_ms * 3 };
  let items;
  if (a.id === 'COMMAND') items = command(ctx, body['/state']);
  else if (a.id === 'DEEP_DIVE') items = deepDive(ctx, body['/state'], body['/api/indicators']);
  else if (a.id === 'AUTOMATION') items = automation(ctx, body['/state']);
  else if (a.id === 'ROBOT') items = robot(ctx, body);
  else if (a.id === 'HISTORY') items = history(ctx, body['/history?days=2']);
  else items = [];
  const failed = Object.entries(errors).filter(([, e]) => e).map(([p, e]) => ({ endpoint: p, error: e }));
  return { schema: 'jarvis-aot-observation/v1', area: a.id, label: a.label, at: new Date(now).toISOString(), aot_available: failed.length < a.endpoints.length, failed, items };
}

// prev/delta from a previous observation of the same area.
export function withPrev(obs, prevObs) {
  const pm = new Map((prevObs?.items || []).map((i) => [i.key, i]));
  for (const i of obs.items) { const p = pm.get(i.key); if (!p) continue; i.prev = p.value; i.delta = isNum(i.value) && isNum(p.value) ? Math.round((i.value - p.value) * 100) / 100 : null; }
  return obs;
}
