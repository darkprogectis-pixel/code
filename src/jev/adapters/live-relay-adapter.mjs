// LIVE INPUT ADAPTER V1: le o relay real (SOMENTE LEITURA) e monta jev-input/v1. Responsabilidade EXCLUSIVA: mapear.
// Nao classifica, nao interpreta direcao, nao inventa campo. O motor continua unico (src/jev/engine.mjs).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JevFatalError } from '../artifacts.mjs';
import { REPO_ROOT, INPUT_SCHEMA } from '../config.mjs';
import { httpGetJson } from './relay-client.mjs';
import { ORDERFLOW_IDENTITY, ORDERFLOW_DERIVED, MINI_CONTRACT_COLUMNS, MAPPING_VERSION, buildMappingTable, liveStatus } from './relay-mapping.mjs';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const GREEKS = ['delta', 'gamma', 'vanna', 'charm'];

export function loadLiveConfig(p) {
  let c;
  try { c = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new JevFatalError(`live config ilegivel: ${p} (${e.code || e.message})`); }
  if (c.schema !== 'jev-live-input-config/v1') throw new JevFatalError('live config schema desconhecido: ' + c.schema);
  if (c.read_only !== true) throw new JevFatalError('live config deve declarar read_only: true');
  const r = c.relay || {};
  if (!r.host || !Number.isInteger(r.port) || !String(r.base_path || '').startsWith('/gexbot')) throw new JevFatalError('relay.host/port/base_path invalidos (base_path deve ser /gexbot...)');
  if (!c.tickers || !c.tickers.orderflow || !c.tickers.classic_state) throw new JevFatalError('tickers.orderflow e tickers.classic_state obrigatorios (nunca a rota sem ticker: ela devolve a raiz)');
  if (!(c.poll_interval_ms >= 5000)) throw new JevFatalError('poll_interval_ms >= 5000 (relay compartilhado com producao; TTL 20 s)');
  c.runtime_config_abs = path.resolve(REPO_ROOT, c.runtime_config || 'config/jev-runtime-v1.json');
  return c;
}

// sessao pelo relogio de America/New_York (contrato: RTH 09:30-16:00 ET). Feriados NAO conhecidos (open item).
export function sessionAt(date, cfg) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date).map((p) => [p.type, p.value]));
  const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const t = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const wd = !['Sat', 'Sun'].includes(parts.weekday);
  return wd && t >= hm(cfg.session.rth_start) && t < hm(cfg.session.rth_end) ? 'RTH' : 'OUTSIDE_RTH';
}

export function createLiveRelayAdapter(cfg, deps = {}) {
  const fetchJson = deps.fetchJson || httpGetJson;
  const now = deps.now || (() => new Date());
  const featureContract = deps.featureContract || JSON.parse(readFileSync(path.join(REPO_ROOT, 'context/jev-future/data/jev-feature-contract-v1.json'), 'utf8'));
  const table = buildMappingTable(featureContract);
  const byPrefix = (pre) => featureContract.fields.map((f) => f.feature_id).filter((id) => id.startsWith(pre));
  const base = `http://${cfg.relay.host}:${cfg.relay.port}${cfg.relay.base_path}`;
  const frozenState = {}; // por regra de freshness: { vendor_ts, count, arrival }
  let cycle = 0;

  function routesToRead() {
    const t = cfg.tickers; const out = [{ kind: 'orderflow', path: `/orderflow/${t.orderflow}`, ticker: t.orderflow, cat: null }];
    const tickers = [t.classic_state, ...(cfg.secondary_tickers || [])];
    for (const tk of tickers) {
      for (const c of cfg.classic_categories || []) out.push({ kind: 'classic', path: `/classic/${tk}/${c}`, ticker: tk, cat: c });
      for (const c of cfg.state_gex_categories || []) out.push({ kind: 'state_gex', path: `/state/${tk}/${c}`, ticker: tk, cat: c });
      for (const c of cfg.state_greek_categories || []) out.push({ kind: 'state_greek', path: `/state/${tk}/${c}`, ticker: tk, cat: c });
    }
    for (const x of cfg.extra_routes || []) out.push({ kind: x.kind || 'UNKNOWN', path: x.path, ticker: x.ticker || null, cat: x.cat || null, extra: true });
    return out;
  }

  // valida que o payload e da rota pedida (nunca a raiz composta) e do ticker/categoria pedidos
  function validatePayload(rt, j) {
    if ('instruments' in j || 'trading_enabled' in j) return 'RC_RELAY_ROOT_PAYLOAD_REJECTED';
    if (rt.kind === 'orderflow') return j.ticker === rt.ticker ? null : 'RC_RELAY_TICKER_MISMATCH';
    const r = j._relay || {};
    if (r.ticker !== undefined && r.ticker !== rt.ticker) return 'RC_RELAY_TICKER_MISMATCH';
    if (r.cat !== undefined && r.cat !== rt.cat) return 'RC_RELAY_CATEGORY_MISMATCH';
    return null;
  }

  const getPath = (obj, rel) => rel.replace(/\[[^\]]*\]$/, '').split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), obj);
  function setInst(fields, id, inst, v) { if (v === undefined) return; (fields[id] = isObj(fields[id]) && !Array.isArray(fields[id]) ? fields[id] : {})[inst] = v; }

  function mapClassicLike(fields, prefix, j, inst, used) {
    for (const id of byPrefix(prefix)) {
      const rel = id.slice(prefix.length);
      if (rel.includes('[]') || GREEKS.some((g) => rel.startsWith(g + '.'))) continue;
      used.add(rel.split('.')[0].replace(/\[.*$/, ''));
      const v = getPath(j, rel);
      if (v !== undefined) setInst(fields, id, inst, v);
    }
    if (Array.isArray(j.strikes)) {
      used.add('strikes');
      const rows = j.strikes.filter(Array.isArray).map((r) => ({ strike: num(r[0]) ?? null, gex_vol: num(r[1]) ?? null, gex_oi: num(r[2]) ?? null, priors: Array.isArray(r[3]) ? r[3] : null }));
      setInst(fields, `${prefix}strikes[]`, inst, rows);
    }
  }
  function mapGreek(fields, j, inst, cat, used) {
    mapClassicLike(fields, 'abot.state_greek.', j, inst, used);
    if (!Array.isArray(j.mini_contracts)) return;
    used.add('mini_contracts');
    const C = MINI_CONTRACT_COLUMNS; const rows = j.mini_contracts.filter(Array.isArray);
    setInst(fields, 'abot.state_greek.mini_contracts[]', inst, rows.map((r) => ({ strike: r[C.strike] ?? null, call_ivol: r[C.call_ivol] ?? null, put_ivol: r[C.put_ivol] ?? null, col5: r[C.col5] ?? null, col6: r[C.col6] ?? null })));
    const g = GREEKS.find((x) => cat.startsWith(x + '_'));
    if (g) setInst(fields, `abot.state_greek.${g}.mini_contracts[]`, inst, rows.map((r) => ({ greek_value: r[C.greek_value] ?? null, priors: Array.isArray(r[C.priors]) ? r[C.priors] : null })));
  }

  async function buildInput() {
    cycle++;
    const t0 = now(); // inicio do ciclo (so para a observacao de FROZEN); NAO e o evaluated_at
    const fields = {}; const issues = []; const routes = []; const vendorTs = { FR_ROOT_ORDERFLOW: [], FR_CLASSIC: [], FR_STATE: [] };
    for (const rt of routesToRead()) {
      const rec = { kind: rt.kind, path: cfg.relay.base_path + rt.path, ticker: rt.ticker, cat: rt.cat };
      if (!['orderflow', 'classic', 'state_gex', 'state_greek'].includes(rt.kind)) { rec.result = 'IGNORED_UNKNOWN_SOURCE'; issues.push({ code: 'RC_ADAPTER_UNKNOWN_SOURCE_IGNORED', detail: rec.path }); routes.push(rec); continue; }
      if (rt.kind === 'orderflow' && !rt.ticker) { rec.result = 'REJECTED'; routes.push(rec); continue; }
      const r = await fetchJson(base + rt.path, cfg.timeouts.request_ms);
      Object.assign(rec, { status: r.status, ms: r.ms, arrival_at: r.arrival_at });
      if (!r.ok) {
        rec.result = r.error;
        const code = r.error === 'TIMEOUT' ? 'RC_RELAY_TIMEOUT' : r.error === 'OFFLINE' ? 'RC_RELAY_OFFLINE' : r.error === 'MALFORMED' || r.error === 'NOT_OBJECT' ? 'RC_RELAY_MALFORMED' : 'RC_RELAY_HTTP_ERROR';
        issues.push({ code, detail: `${rec.path} ${r.error}` }); routes.push(rec); continue;
      }
      const j = r.json; const bad = validatePayload(rt, j);
      if (bad) { rec.result = 'REJECTED'; issues.push({ code: bad, detail: rec.path }); routes.push(rec); continue; }
      rec.result = 'OK'; rec.vendor_timestamp = num(j.timestamp) ?? null;
      if (isObj(j._relay)) rec.relay = { cached: j._relay.cached, stale: j._relay.stale, age_ms: j._relay.age_ms };
      if (rec.vendor_timestamp === null) issues.push({ code: 'RC_SOURCE_TIMESTAMP_MISSING', detail: rec.path });
      const used = new Set(['timestamp', '_relay']);
      const inst = `${rt.ticker === cfg.tickers.orderflow ? cfg.tickers.classic_state : rt.ticker}/${rt.cat}`;
      if (rt.kind === 'orderflow') {
        for (const [fid, key] of Object.entries(ORDERFLOW_IDENTITY)) { used.add(key); if (key in j) fields[fid] = j[key]; }
        for (const [fid, d] of Object.entries(ORDERFLOW_DERIVED)) { d.from.forEach((k) => used.add(k)); const v = d.fn(j); if (v !== undefined) fields[fid] = v; }
        used.add('ticker');
        vendorTs.FR_ROOT_ORDERFLOW.push(rec.vendor_timestamp);
      } else if (rt.kind === 'classic') { mapClassicLike(fields, 'abot.classic.', j, inst, used); vendorTs.FR_CLASSIC.push(rec.vendor_timestamp); }
      else if (rt.kind === 'state_gex') { mapClassicLike(fields, 'abot.state_gex.', j, inst, used); vendorTs.FR_STATE.push(rec.vendor_timestamp); }
      else { mapGreek(fields, j, inst, rt.cat, used); vendorTs.FR_STATE.push(rec.vendor_timestamp); }
      rec.unmapped_payload_keys = Object.keys(j).filter((k) => !used.has(k));
      routes.push(rec);
    }
    // FRESHNESS_FIX_V1 (EVALUATED_AT_AFTER_FETCH): evaluated_at e fixado DEPOIS da ultima leitura do ciclo.
    // Antes, evaluated_at = t0 (pre-fetch) e todo vendor ts gerado durante as ~15 leituras sequenciais saia com idade
    // negativa => UNKNOWN (DATA_INVALID justamente com dado mais fresco). vendor ts, min por fonte e age<0 => UNKNOWN nao mudam.
    const tEval = now();
    const session = sessionAt(tEval, cfg);
    // um vendor ts por regra de freshness: o MAIS ANTIGO entre as rotas lidas (conservador); ts ausente em qualquer rota => ausente
    const sources = {};
    for (const [fr, list] of Object.entries(vendorTs)) {
      if (!list.length) continue;
      const vts = list.some((x) => x === null) ? null : Math.min(...list);
      sources[fr] = { vendor_timestamp: vts };
      // FROZEN (contrato FR_ROOT_ORDERFLOW.frozen: vendor ts igual em >= N leituras consecutivas no RTH, com chegada avancando)
      if (cfg.frozen_detection && cfg.frozen_detection.enabled && vts !== null) {
        const st = frozenState[fr];
        frozenState[fr] = st && st.vendor_ts === vts && t0.getTime() > st.arrival ? { vendor_ts: vts, count: st.count + 1, arrival: t0.getTime() } : { vendor_ts: vts, count: 1, arrival: t0.getTime() };
        const applies = (cfg.frozen_detection.sources || []).includes(fr);
        if (applies && session === 'RTH' && frozenState[fr].count >= cfg.frozen_detection.consecutive_identical_vendor_ts) {
          sources[fr].observed_frozen = true;
          issues.push({ code: 'RC_SOURCE_FROZEN_CANDIDATE', detail: `${fr}: vendor ts ${vts} repetido em ${frozenState[fr].count} leituras no RTH` });
        }
      }
    }
    const input = { schema: INPUT_SCHEMA, evaluated_at: tEval.toISOString(), session, sources, fields, adapter_issues: issues };
    return { input, report: makeReport(input, routes) };
  }

  function makeReport(input, routes) {
    const observed = (row) => {
      const id = row.feature_id; const ai = id.indexOf('[]');
      const v = input.fields[ai >= 0 ? id.slice(0, ai + 2) : id];
      if (v === undefined) return 'ABSENT';
      if (ai >= 0) { // sub-coluna de array: presente so se alguma linha tem valor nao-nulo (mesma regra do normalize do runtime)
        const sub = id.slice(ai + 3).replace(/\[.*\]$/, '');
        const rows = Object.values(isObj(v) ? v : {}).flatMap((x) => (Array.isArray(x) ? x : []));
        return rows.some((r) => isObj(r) && r[sub] !== null && r[sub] !== undefined) ? 'PRESENT' : 'NULL';
      }
      if (v === null) return 'NULL';
      if (isObj(v) && Object.values(v).every((x) => x === null)) return 'NULL';
      return 'PRESENT';
    };
    const per = table.map((row) => ({ feature_id: row.feature_id, live_status: liveStatus(row, observed(row)) }));
    const counts = {}; for (const p of per) counts[p.live_status] = (counts[p.live_status] || 0) + 1;
    return {
      mapping_version: MAPPING_VERSION, cycle, evaluated_at: input.evaluated_at, session: input.session, read_only: true,
      relay: `${cfg.relay.host}:${cfg.relay.port}${cfg.relay.base_path}`, routes,
      sources_present: Object.keys(input.sources), live_status_counts: counts, fields_live_status: per,
      frozen_observation: JSON.parse(JSON.stringify(frozenState)), issues: input.adapter_issues,
    };
  }

  return { buildInput, mappingTable: table, routesToRead };
}
