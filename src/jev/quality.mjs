// Data quality DIMENSIONAL (R_S08, R_S10 revisada, R_S11). CLASSIFICATION INPUT, nunca gate de trade.
// Avalia so freshness/disponibilidade; semantica UNKNOWN nao e qualidade (R_S14).

export const DEALER_DIMENSIONS = {
  GAMMA_REGIME: 'gamma_regime', STRUCTURE_LOCATION: 'structure_location', DELTA_POSITIONING: 'delta_positioning',
  SECOND_ORDER_FLOWS: 'second_order_flows', VOL_SKEW: 'vol_skew', FLOW_UNKNOWN_SEMANTICS: 'flow_unknown_semantics',
};
const USABLE_FRESHNESS = new Set(['FRESH', 'MARKET_CLOSED']);
// estados estaticos do contrato que tornam o dado inutilizavel para leitura independentemente do timestamp
const STATIC_UNUSABLE_QUALITY = new Set(['FROZEN', 'DEGENERATE']);

export function sourceFreshness(ing, art, cfg) {
  const rules = art.feature_contract.freshness_rules;
  const out = {};
  const frs = [...new Set(art.feature_contract.fields.map((f) => f.freshness_rule))];
  const order = frs.filter((k) => k !== 'FR_INDICATOR_DERIVED').concat(frs.includes('FR_INDICATOR_DERIVED') ? ['FR_INDICATOR_DERIVED'] : []);
  for (const fr of order) {
    const rule = rules[fr] || {};
    const src = ing.sources[fr];
    const rec = { freshness_rule: fr, basis: rule.freshness_basis || 'UNKNOWN', vendor_timestamp: src ? src.vendor_timestamp : null, age_sec: null, stale_after_sec: null, threshold_origin: null, state: 'UNKNOWN', why: null };
    if (fr === 'FR_FROZEN_BLOCK') { rec.state = 'FROZEN_VALUES'; rec.why = 'bloco congelado (contrato)'; }
    else if (fr === 'FR_CACHE_HISTORY') { rec.why = 'historico local: freshness nao se aplica a leitura ao vivo'; }
    else if (fr === 'FR_INDICATOR_DERIVED') { const o = out.FR_ROOT_ORDERFLOW; rec.state = o ? o.state : 'UNKNOWN'; rec.why = 'herdado de FR_ROOT_ORDERFLOW (nunca mais fresco que a origem)'; }
    else if (!/^VENDOR_TIMESTAMP/.test(rec.basis)) { rec.why = 'freshness_basis UNKNOWN no contrato => nunca FRESH por default'; }
    else if (!src || rec.vendor_timestamp === null) { rec.why = src ? 'vendor_timestamp invalido' : 'fonte ausente no input'; }
    else if (ing.evaluated_at === null) { rec.why = 'evaluated_at invalido'; }
    else {
      rec.age_sec = ing.evaluated_at - rec.vendor_timestamp;
      const contractThr = rule.stale_after_sec && rule.stale_after_sec.value;
      const ovr = cfg.provisional_stale_after_sec_overrides[fr];
      rec.stale_after_sec = ovr ?? contractThr ?? null;
      rec.threshold_origin = ovr !== undefined ? 'OPERATOR_CONFIG_PROVISIONAL' : (contractThr ? 'CONTRACT_PROVISIONAL' : null);
      if (rec.age_sec < 0) { rec.why = 'vendor_timestamp no futuro relativo a evaluated_at'; }
      else if (ing.session === 'OUTSIDE_RTH') { rec.state = 'MARKET_CLOSED'; rec.why = 'fora do RTH (R_S11)'; }
      else if (src.observed_frozen && ing.session === 'RTH') { rec.state = 'FROZEN'; rec.why = 'vendor_timestamp nao avanca em leituras consecutivas no RTH (observacao do adapter; contrato FR_*.frozen)'; }
      else if (rec.stale_after_sec === null) { rec.why = 'contrato nao define stale_after_sec e nao ha override do operador'; }
      else if (rec.age_sec > rec.stale_after_sec) { rec.state = 'STALE'; }
      else rec.state = 'FRESH';
    }
    rec.usable = USABLE_FRESHNESS.has(rec.state);
    out[fr] = rec;
  }
  return out;
}

export function fieldUsable(nx, instanceKey, fresh) {
  const i = nx.instances[instanceKey];
  if (!i || !i.present) return false;
  if (STATIC_UNUSABLE_QUALITY.has(nx.quality_state)) return false;
  return !!(fresh[nx.freshness_rule] && fresh[nx.freshness_rule].usable);
}

// membro de familia "feature_id@categoria" (categoria pode ser "*_zero") -> instancias do ticker primario
export function memberInstances(member, norm, ticker) {
  const at = member.indexOf('@');
  const fid = at < 0 ? member : member.slice(0, at);
  const cat = at < 0 ? null : member.slice(at + 1);
  const nx = norm.byId[fid];
  if (!nx) return { fid, keys: [] };
  if (!cat) return { fid, keys: [nx.primary_instance] };
  const re = new RegExp('^' + cat.replace(/\*/g, '[a-z]+') + '$');
  const cats = Object.keys(nx.instances).filter((k) => k.startsWith(ticker + '/') && re.test(k.split('/')[1]));
  return { fid, keys: cats.length ? cats : [`${ticker}/${cat}`] };
}

export function familyStatus(fam, norm, fresh, ticker) {
  let present = 0; let usable = 0; const usableMembers = [];
  for (const m of fam.members) {
    const { fid, keys } = memberInstances(m, norm, ticker);
    const nx = norm.byId[fid];
    if (!nx) continue;
    for (const k of keys) {
      if (nx.instances[k] && nx.instances[k].present) present++;
      if (fieldUsable(nx, k, fresh)) { usable++; usableMembers.push(m); }
    }
  }
  return { present: present > 0, usable: usable > 0, usable_members: [...new Set(usableMembers)] };
}

// opts.runMode === 'LIVE' so e passado pelo laco live (CLI --serve/--live sem --replay).
export function assessQuality(ing, norm, art, cfg, opts = {}) {
  const fresh = sourceFreshness(ing, art, cfg);
  const ticker = cfg.primary_ticker;
  const fams = art.evidence_families.families;
  const famState = {};
  for (const f of fams) famState[f.family_id] = { ...familyStatus(f, norm, fresh, ticker), dc_group: f.dc_group, dimension: f.dimension, kind: f.kind };

  // familias com leitura ATIVA = grupos DC lidos por regras SUPPORTED_SEMANTIC do estagio nativo
  const activeGroups = new Set(art.rules.rules.filter((r) => r.status === 'SUPPORTED_SEMANTIC' && r.stage === 'NATIVE_DEALER_STATE').flatMap((r) => r.input_families));
  // LIVE_DQ_HISTORY_ONLY_POLICY: familia com TODOS os membros availability=HISTORY_LOCAL e HISTORICAL_ONLY / NON_LIVE;
  // em runtime LIVE nao e familia ativa da R_S10 (nao degrada a DQ). Replay/historico: NAO decidido (comportamento anterior).
  const live = opts.runMode === 'LIVE';
  const availability = new Map(art.feature_contract.fields.map((f) => [f.feature_id, f.availability]));
  const historyOnly = (f) => f.members.length > 0 && f.members.every((m) => availability.get(m.split('@')[0]) === 'HISTORY_LOCAL');
  const dims = {};
  for (const [D, key] of Object.entries(DEALER_DIMENSIONS)) {
    const inDim = fams.filter((f) => f.dimension === D && f.kind !== 'NON_EVIDENCE');
    const usable = inDim.filter((f) => famState[f.family_id].usable);
    const activeUnusable = inDim.filter((f) => activeGroups.has(f.dc_group) && !famState[f.family_id].usable && !(live && historyOnly(f))).map((f) => f.family_id);
    dims[key] = {
      availability: !usable.length ? 'UNAVAILABLE' : (usable.length === inDim.length ? 'USABLE' : 'PARTIAL'),
      usable_families: usable.map((f) => f.family_id), active_reading_families_unusable: activeUnusable,
      ...(live ? { history_only_families: inDim.filter(historyOnly).map((f) => f.family_id) } : {}),
    };
  }
  const dcUsable = (g) => fams.some((f) => f.dc_group === g && famState[f.family_id].usable);
  const spot = dcUsable('DC_SPOT_PRICE');
  const degraded = [];
  for (const [k, d] of Object.entries(dims)) if (d.active_reading_families_unusable.length) degraded.push({ code: 'RC_DQ_FAMILY_UNUSABLE', dimension: k, families: d.active_reading_families_unusable });
  if (dcUsable('DC_GEX0_SIGN') !== dcUsable('DC_ZERO_GAMMA_0DTE')) degraded.push({ code: 'RC_DQ_REGIME_PARTIAL', detail: 'so uma das duas leituras da familia de regime 0DTE utilizavel' });
  if (!spot) degraded.push({ code: 'RC_DQ_PRICE_REFERENCE_UNAVAILABLE', detail: 'so as leituras dependentes de spot ficam UNKNOWN (R_S10 item 3)' });
  const traceUsed = fams.some((f) => f.stage === 'C_SPX_FINAL_CONTEXT' && /trace/.test(f.family_id) && famState[f.family_id].usable);
  if (traceUsed) degraded.push({ code: 'RC_DQ_TRACE_PENDING_REVISION_AUDIT', detail: 'TRACE utilizavel mas PENDING_REVISION_AUDIT' });
  for (const [fr, r] of Object.entries(fresh)) {
    if (r.state === 'STALE') degraded.push({ code: 'RC_DQ_SOURCE_STALE', freshness_rule: fr });
    if (r.state === 'FROZEN') degraded.push({ code: 'RC_DQ_SOURCE_FROZEN', freshness_rule: fr });
  }

  const anyDealer = Object.values(dims).some((d) => d.availability !== 'UNAVAILABLE');
  const status = !anyDealer ? 'DATA_INVALID' : (degraded.length ? 'DEGRADED' : 'VALID');
  return {
    role: 'DATA QUALITY / CLASSIFICATION INPUT (sem gate operacional)',
    status, session: ing.session === 'UNKNOWN' ? 'UNKNOWN' : ing.session,
    per_source: Object.fromEntries(Object.entries(fresh).map(([k, r]) => [k, { freshness_state: r.state, basis: r.basis, age_sec: r.age_sec, stale_after_sec: r.stale_after_sec, threshold_origin: r.threshold_origin, why: r.why }])),
    dimensions: dims, price_reference_usable: spot, degradation: degraded,
    _fresh: fresh, _families: famState,
  };
}
