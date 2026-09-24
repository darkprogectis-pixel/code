// Avaliadores das regras SUPPORTED_SEMANTIC do estagio nativo (R_M01-R_M08). Todas descritivas: direction 0, nunca lado.
import { val, num } from './normalize.mjs';
import { fieldUsable } from './quality.mjs';

const BREAK_0909 = Date.parse('2026-09-09T00:00:00Z') / 1000; // R_S07: nunca misturar antes x depois

export function makeReader(norm, q, ticker) {
  const fresh = q._fresh;
  const usable = (fid, cat) => {
    const nx = norm.byId[fid]; if (!nx) return false;
    const key = cat ? `${ticker}/${cat}` : nx.primary_instance;
    return fieldUsable(nx, key, fresh);
  };
  const get = (fid, cat) => (usable(fid, cat) ? val(norm, fid, cat) : undefined);
  const getNum = (fid, cat) => num(get(fid, cat));
  const firstNum = (list) => { for (const [fid, cat] of list) { const v = getNum(fid, cat); if (v !== undefined) return { value: v, source: cat ? `${fid}@${ticker}/${cat}` : fid }; } return null; };
  return { usable, get, getNum, firstNum };
}

const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const regimeOf = (s) => (s > 0 ? 'POSITIVE_GAMMA' : s < 0 ? 'NEGATIVE_GAMMA' : null);

function spotRef(rd) {
  return rd.firstNum([['abot.root.spot'], ['abot.root.classic.spot'], ['abot.classic.spot', 'zero'], ['abot.state_gex.spot', 'gex_zero'], ['abot.state_greek.spot', 'gamma_zero']]);
}

// tabela do R_M01 aplicada a qualquer vencimento
function regimeFrom(a, b) {
  const ra = a ? regimeOf(sign(a.value)) : null;
  const rb = b ? b.regime : null;
  if (ra && rb) return { label: ra === rb ? ra : 'AMBIGUOUS', degraded: false, readings: { net_sign: ra, spot_vs_zero_gamma: rb } };
  if (ra || rb) return { label: ra || rb, degraded: true, readings: { net_sign: ra || 'UNAVAILABLE', spot_vs_zero_gamma: rb || 'UNAVAILABLE' } };
  return { label: 'UNKNOWN', degraded: false, readings: { net_sign: 'UNAVAILABLE', spot_vs_zero_gamma: 'UNAVAILABLE' } };
}
function spotVsZg(rd, zgList, spot) {
  const zg = rd.firstNum(zgList);
  if (!zg || !spot || spot.value === zg.value) return null; // igualdade exata: sem banda => nao classificavel
  return { regime: spot.value > zg.value ? 'POSITIVE_GAMMA' : 'NEGATIVE_GAMMA', zero_gamma: zg, spot: spot.value };
}

export function R_M01(ctx) {
  const { rd } = ctx; const spot = spotRef(rd);
  // familia unica GEX0_SIGN: 1a leitura utilizavel; nunca duas confirmacoes
  const a = rd.firstNum([['abot.root.gex.net_0dte'], ['abot.state_gex.sum_gex_vol', 'gex_zero']]);
  const b = spotVsZg(rd, [['abot.root.classic.zero_gamma'], ['abot.classic.zero_gamma', 'zero']], spot);
  const r = regimeFrom(a, b);
  return { label: r.label, degraded: r.degraded, readings: r.readings, sources: { net_sign: a && a.source, zero_gamma: b && b.zero_gamma.source }, direction: 0 };
}

export function R_M02(ctx) {
  const { rd } = ctx; const spot = spotRef(rd);
  const next = regimeFrom(rd.firstNum([['abot.root.gex.net_next'], ['abot.state_gex.sum_gex_vol', 'gex_one']]), spotVsZg(rd, [['abot.classic.zero_gamma', 'one']], spot));
  const full = regimeFrom(null, spotVsZg(rd, [['abot.classic.zero_gamma', 'full']], spot));
  return { next: { label: next.label, readings: next.readings }, full: { label: full.label, readings: full.readings }, note: 'reportados lado a lado; nunca fundidos ao 0DTE', direction: 0 };
}

export const LEVELS = [
  // [label, candidatos (mesma construcao => 1 entrada; 1o utilizavel)]
  ['zero_gamma_0dte', [['abot.root.classic.zero_gamma'], ['abot.classic.zero_gamma', 'zero']], 'CLASSIC_ZERO'],
  ['zero_gamma_next', [['abot.classic.zero_gamma', 'one']], 'CLASSIC_ONE'],
  ['zero_gamma_full', [['abot.classic.zero_gamma', 'full']], 'CLASSIC_FULL'],
  ['of_zero_mcall', [['abot.root.orderflow.zero_mcall']], 'INTERPOLATED'],
  ['of_zero_mput', [['abot.root.orderflow.zero_mput']], 'INTERPOLATED'],
  ['of_z_mlgamma', [['abot.root.orderflow.z_mlgamma']], 'INTERPOLATED'],
  ['of_z_msgamma', [['abot.root.orderflow.z_msgamma']], 'INTERPOLATED'],
  ['lv_short_gamma_0dte', [['abot.root.levels.short_gamma_0dte']], 'UNPROVEN_GRID'],
  ['lv_short_gamma_next', [['abot.root.levels.short_gamma_next']], 'UNPROVEN_GRID'],
  ['lv_next_exp_hvl', [['abot.root.levels.next_exp_hvl']], 'UNPROVEN_GRID'],
  ['lv_next_exp_call_res', [['abot.root.levels.next_exp_call_res']], 'UNPROVEN_GRID'],
  ['lv_next_exp_put_sup', [['abot.root.levels.next_exp_put_sup']], 'UNPROVEN_GRID'],
  ...['major_pos_vol', 'major_neg_vol', 'major_pos_oi', 'major_neg_oi'].flatMap((m) => [
    [`classic_zero_${m}`, [[`abot.root.classic.${m}`], [`abot.classic.${m}`, 'zero']], 'CLASSIC_ZERO'],
    [`classic_one_${m}`, [[`abot.classic.${m}`, 'one']], 'CLASSIC_ONE'],
    [`classic_full_${m}`, [[`abot.classic.${m}`, 'full']], 'CLASSIC_FULL'],
  ]),
  ...['major_pos_vol', 'major_neg_vol'].flatMap((m) => ['gex_zero', 'gex_one', 'gex_full'].map((c) => [`state_${c}_${m}`, [[`abot.state_gex.${m}`, c]], 'STATE_' + c.toUpperCase()])),
  ...['major_positive', 'major_negative', 'major_long_gamma', 'major_short_gamma'].flatMap((m) => ['gamma_zero', 'gamma_one'].map((c) => [`greek_${c}_${m}`, [[`abot.state_greek.${m}`, c]], 'UNPROVEN_GRID'])),
];

export function R_M03(ctx) {
  const { rd } = ctx; const spot = spotRef(rd);
  if (!spot) return { available: false, why: 'referencia de preco indisponivel (R_S10 item 3)', levels: [], direction: 0 };
  const levels = [];
  for (const [label, cands, grid] of LEVELS) {
    const v = rd.firstNum(cands); if (!v) continue;
    const d = v.value - spot.value;
    levels.push({ level: label, value: v.value, source: v.source, grid,
      position: d > 0 ? 'ABOVE' : d < 0 ? 'BELOW' : 'UNKNOWN', distance_pts: d, distance_pct: spot.value ? (d / spot.value) * 100 : null,
      semantic_flag: label === 'of_zero_mput' ? 'SEMANTIC_ANOMALY' : null });
  }
  const sorted = [...levels].filter((l) => l.position !== 'UNKNOWN').sort((a, b) => a.value - b.value);
  const above = sorted.filter((l) => l.position === 'ABOVE'); const below = sorted.filter((l) => l.position === 'BELOW');
  const nb = below.length ? below[below.length - 1] : null; const na = above.length ? above[0] : null;
  return { available: true, spot: spot.value, spot_source: spot.source, levels, ordering: sorted.map((l) => l.level),
    nearest_above: na && na.level, nearest_below: nb && nb.level, between: na && nb ? [nb.level, na.level] : null,
    note: 'descritores (R_S13: location nunca vira lado); identidades de majors PARTIAL => sem reforco', direction: 0 };
}

function profileRows(ctx, fid, cat, raw) {
  const v = raw ? ctx.rd.get(fid) : ctx.rd.get(fid, cat);
  if (!Array.isArray(v)) return null;
  const rows = raw ? v.map((r) => (Array.isArray(r) ? { strike: r[0], gex_vol: r[1] } : null)) : v;
  return rows.filter((r) => r && num(r.strike) !== undefined && num(r.gex_vol) !== undefined);
}
export function R_M04(ctx) {
  const spot = spotRef(ctx.rd);
  const out = {};
  const profiles = {
    classic_zero: profileRows(ctx, 'abot.classic.strikes[].gex_vol', 'zero') || profileRows(ctx, 'abot.root.classic.strikes', null, true),
    classic_one: profileRows(ctx, 'abot.classic.strikes[].gex_vol', 'one'),
    classic_full: profileRows(ctx, 'abot.classic.strikes[].gex_vol', 'full'),
    state_gex_zero: profileRows(ctx, 'abot.state_gex.strikes[].gex_vol', 'gex_zero'),
  };
  for (const [k, rows] of Object.entries(profiles)) {
    if (!rows || !rows.length) { out[k] = { available: false }; continue; }
    if (!spot) { out[k] = { available: false, why: 'sem referencia de preco' }; continue; }
    const pick = (arr) => arr.reduce((m, r) => (!m || Math.abs(r.gex_vol) > Math.abs(m.gex_vol) ? r : m), null);
    const up = pick(rows.filter((r) => r.strike > spot.value)); const dn = pick(rows.filter((r) => r.strike < spot.value));
    out[k] = { available: true, max_abs_gex_above: up && { strike: up.strike, gex_sign: sign(up.gex_vol) }, max_abs_gex_below: dn && { strike: dn.strike, gex_sign: sign(dn.gex_vol) }, grid: rows.map((r) => r.strike) };
  }
  return { profiles: out, note: 'estrutura; classic x state no mesmo strike = construtos distintos', direction: 0 };
}

export function R_M08(ctx) {
  const v = ctx.rd.firstNum([['abot.root.pc_oi']]);
  return { put_call_dex_ratio: v ? v.value : null, available: !!v, note: 'pc_oi = |DEX put| / |DEX call|, nunca OI; descritor sem lado', direction: 0 };
}

// ---- transicoes (R_M05/06/07): exigem snapshot anterior valido do mesmo lado de 09/09 ----
export function transitionGuard(ctx) {
  const p = ctx.previous;
  if (!p) return 'sem snapshot anterior';
  if (ctx.evaluated_at === null || p.evaluated_at === null) return 'evaluated_at invalido em um dos snapshots';
  if ((ctx.evaluated_at >= BREAK_0909) !== (p.evaluated_at >= BREAK_0909)) return 'snapshots em lados opostos da quebra de 09/09 (R_S07)';
  if (p.data_quality_status === 'DATA_INVALID') return 'snapshot anterior DATA_INVALID';
  return null;
}
export function R_M05(ctx) {
  const why = transitionGuard(ctx); if (why) return { events: [], unresolved: why };
  const now = ctx.results.R_M01; const prev = ctx.previous.results.R_M01;
  const ev = [];
  if (now.label !== prev.label && now.label !== 'UNKNOWN' && prev.label !== 'UNKNOWN') ev.push({ type: 'REGIME_TRANSITION', from: prev.label, to: now.label, reason: 'RC_REGIME_TRANSITION', direction: 0 });
  return { events: ev, unresolved: null };
}
export function R_M06(ctx) {
  const why = transitionGuard(ctx); if (why) return { events: [], unresolved: why };
  const now = ctx.results.R_M03; const prev = ctx.previous.results.R_M03;
  if (!now.available || !prev.available) return { events: [], unresolved: 'descritores de location indisponiveis' };
  const grids = { now: ctx.results.R_M04.profiles, prev: ctx.previous.results.R_M04.profiles };
  const gridFor = (res, g) => { const k = { CLASSIC_ZERO: 'classic_zero', CLASSIC_ONE: 'classic_one', CLASSIC_FULL: 'classic_full', STATE_GEX_ZERO: 'state_gex_zero' }[g]; return k && res[k] && res[k].available ? res[k].grid : null; };
  const pm = Object.fromEntries(prev.levels.map((l) => [l.level, l]));
  const ev = []; const pending = [];
  for (const l of now.levels) {
    const p = pm[l.level]; if (!p || p.value === l.value) continue;
    const gN = gridFor(grids.now, l.grid); const gP = gridFor(grids.prev, l.grid);
    if (gN && gP && gN.includes(l.value) && gP.includes(p.value)) ev.push({ type: 'LEVEL_MIGRATION', level: l.level, from: p.value, to: l.value, sense: l.value > p.value ? 'UP' : 'DOWN', reason: 'RC_LEVEL_MIGRATION', direction: 0 });
    else pending.push(l.level);
  }
  const common = now.ordering.filter((x) => prev.ordering.includes(x));
  const prevCommon = prev.ordering.filter((x) => common.includes(x));
  if (common.join('|') !== prevCommon.join('|')) ev.push({ type: 'LEVEL_MIGRATION', level: 'ORDERING', from: prevCommon, to: common, reason: 'RC_LEVEL_ORDER_CHANGED', direction: 0 });
  return { events: ev, unresolved: pending.length ? { levels: pending, why: 'POD_R_M06_INTERPOLATED_LEVEL_MIGRATION: nivel fora da grade de strikes provada => evento UNAVAILABLE (R2)', reason: 'RC_LEVEL_MIGRATION_UNAVAILABLE_PENDING_DECISION' } : null };
}
const NET_SIGN_FIELDS = ['abot.root.dex.net_0dte', 'abot.root.dex.net_next', 'abot.root.vanna.net_0dte', 'abot.root.vanna.net_next', 'abot.root.charm.net_0dte', 'abot.root.charm.net_next'];
export function R_M07(ctx) {
  const why = transitionGuard(ctx); if (why) return { events: [], unresolved: why };
  const ev = [];
  for (const f of NET_SIGN_FIELDS) {
    const a = ctx.rd.getNum(f); const b = ctx.previous.rd.getNum(f);
    if (a === undefined || b === undefined) continue;
    if (sign(a) !== sign(b) && sign(a) !== 0 && sign(b) !== 0) ev.push({ type: 'SIGN_CHANGE_OBSERVED', field: f, interpretation: 'UNRESOLVED', reason: 'RC_SIGN_CHANGE_OBSERVED', direction: 0 });
  }
  return { events: ev, unresolved: null };
}
