// Mapeamento REAL SOURCE PATH -> feature_id do Feature Contract V1 (190 campos). Puro: sem I/O.
// Evidencia: discovery read-only de 24/09 (handoffs/HANDOFF_JEV_LIVE_INPUT_V1_20260924.md §A).
//  - orderflow: nomes do contrato (derivados da raiz composta) <- chaves cruas de /gexbot/orderflow/ES_SPX,
//    verificados por IDENTIDADE DE VALOR (36/36 numericos + timestamp, mesmo vendor ts). A raiz nunca e lida pelo adapter.
//  - classic/state: mesmos nomes do payload (rotas /gexbot/classic, /gexbot/state); mini_contracts posicional conforme o contrato.
// Nenhum valor e inventado: campo sem rota permitida fica NOT_PRESENT_IN_CURRENT_RELAY ou SOURCE_NOT_AVAILABLE.

export const MAPPING_VERSION = 'jev-live-relay-mapping/v1';

// feature_id do contrato -> chave crua em /gexbot/orderflow/ES_SPX (identidade de valor verificada)
export const ORDERFLOW_IDENTITY = {
  'abot.root.spot': 'spot', 'abot.root.timestamp': 'timestamp',
  'abot.root.gex.net_0dte': 'zgr', 'abot.root.gex.net_next': 'ogr', 'abot.root.gex.cvr_0dte': 'zcvr', 'abot.root.gex.cvr_next': 'ocvr',
  'abot.root.gex.oflow': 'gexoflow', 'abot.root.gex.oflow_next': 'one_gexoflow',
  'abot.root.dex.net_0dte': 'net_dex', 'abot.root.dex.net_next': 'one_net_dex', 'abot.root.dex.agg_0dte': 'agg_dex', 'abot.root.dex.agg_next': 'one_agg_dex',
  'abot.root.dex.net_call_0dte': 'net_call_dex', 'abot.root.dex.net_put_0dte': 'net_put_dex', 'abot.root.dex.net_call_next': 'one_net_call_dex', 'abot.root.dex.net_put_next': 'one_net_put_dex',
  'abot.root.dex.agg_call_0dte': 'agg_call_dex', 'abot.root.dex.agg_put_0dte': 'agg_put_dex', 'abot.root.dex.agg_call_next': 'one_agg_call_dex', 'abot.root.dex.agg_put_next': 'one_agg_put_dex',
  'abot.root.dex.oflow': 'dexoflow', 'abot.root.dex.oflow_next': 'one_dexoflow',
  'abot.root.vanna.net_0dte': 'zvanna', 'abot.root.vanna.net_next': 'ovanna', 'abot.root.charm.net_0dte': 'zcharm', 'abot.root.charm.net_next': 'ocharm',
  'abot.root.orderflow.cvr_oflow': 'cvroflow', 'abot.root.orderflow.cvr_oflow_next': 'one_cvroflow',
  'abot.root.orderflow.zero_mcall': 'zero_mcall', 'abot.root.orderflow.zero_mput': 'zero_mput', 'abot.root.orderflow.z_mlgamma': 'z_mlgamma', 'abot.root.orderflow.z_msgamma': 'z_msgamma',
  // aliases da raiz (mesmo valor, mesma familia DC_MAJORS_*): a raiz os expoe em levels.*
  'abot.root.levels.short_gamma_0dte': 'z_msgamma', 'abot.root.levels.short_gamma_next': 'o_msgamma', 'abot.root.levels.next_exp_hvl': 'o_mlgamma',
  'abot.root.levels.next_exp_call_res': 'one_mcall', 'abot.root.levels.next_exp_put_sup': 'one_mput',
};
// derivacoes CONFIRMADAS pela auditoria (identidade medida), usadas sem arredondar
export const ORDERFLOW_DERIVED = {
  'abot.root.pc_oi': { from: ['net_put_dex', 'net_call_dex'], fn: (p) => (typeof p.net_put_dex === 'number' && typeof p.net_call_dex === 'number' && p.net_call_dex !== 0 ? Math.abs(p.net_put_dex) / Math.abs(p.net_call_dex) : undefined),
    transformation: '|net_put_dex| / |net_call_dex| (identidade CONFIRMED: 3.6202 vs 3.62)' },
};

export const MINI_CONTRACT_COLUMNS = { strike: 0, call_ivol: 1, put_ivol: 2, greek_value: 3, priors: 4, col5: 5, col6: 6 }; // posicional conforme o feature contract

const ROOT_ONLY = 'NOT_PRESENT_IN_CURRENT_RELAY';
export function buildMappingTable(featureContract) {
  const rows = [];
  for (const f of featureContract.fields) {
    const id = f.feature_id;
    const base = { feature_id: id, market_origin: f.market_origin, freshness_rule: f.freshness_rule, contract_quality_state: f.quality_state };
    let m;
    if (ORDERFLOW_IDENTITY[id]) {
      m = { mapping_status: 'MAPPED', route: 'orderflow', source_path: `GET /gexbot/orderflow/ES_SPX :: ${ORDERFLOW_IDENTITY[id]}`, timestamp_basis: 'payload.timestamp (vendor, epoch s)', instance: 'ES_SPX (SPX options, escala ES)', transformation: /levels\./.test(id) ? 'ALIAS_BY_VALUE_IDENTITY (raiz expoe em levels.*)' : 'RENAME_BY_VALUE_IDENTITY', freshness_basis_rule: 'FR_ROOT_ORDERFLOW' };
    } else if (ORDERFLOW_DERIVED[id]) {
      m = { mapping_status: 'MAPPED', route: 'orderflow', source_path: `GET /gexbot/orderflow/ES_SPX :: ${ORDERFLOW_DERIVED[id].from.join(',')}`, timestamp_basis: 'payload.timestamp', instance: 'ES_SPX', transformation: 'DERIVED_CONFIRMED_IDENTITY: ' + ORDERFLOW_DERIVED[id].transformation, freshness_basis_rule: 'FR_ROOT_ORDERFLOW' };
    } else if (id.startsWith('abot.classic.')) {
      m = { mapping_status: 'MAPPED', route: 'classic', source_path: `GET /gexbot/classic/SPX/{zero|one|full} :: ${id.slice('abot.classic.'.length)}`, timestamp_basis: 'payload.timestamp (vendor)', instance: 'SPX/<categoria>', transformation: id.includes('strikes[]') ? 'ROW [strike, gex_vol, gex_oi, priors[5]] -> objeto' : 'IDENTITY', freshness_basis_rule: 'FR_CLASSIC' };
    } else if (id.startsWith('abot.state_gex.')) {
      m = { mapping_status: 'MAPPED', route: 'state_gex', source_path: `GET /gexbot/state/SPX/gex_{zero|one|full} :: ${id.slice('abot.state_gex.'.length)}`, timestamp_basis: 'payload.timestamp (vendor)', instance: 'SPX/gex_<cat>', transformation: id.includes('strikes[]') ? 'ROW [strike, gex_vol, gex_oi, priors[5]] -> objeto' : 'IDENTITY', freshness_basis_rule: 'FR_STATE' };
    } else if (id.startsWith('abot.state_greek.')) {
      m = { mapping_status: 'MAPPED', route: 'state_greek', source_path: `GET /gexbot/state/SPX/{delta|gamma|vanna|charm}_{zero|one} :: ${id.slice('abot.state_greek.'.length)}`, timestamp_basis: 'payload.timestamp (vendor)', instance: 'SPX/<greek>_<cat>', transformation: id.includes('mini_contracts[]') ? 'POSITIONAL_PER_CONTRACT mini_contracts [strike,call_ivol,put_ivol,greek_value,priors[3],col5,col6]' : 'IDENTITY', freshness_basis_rule: 'FR_STATE' };
    } else if (id.startsWith('abot.root.')) {
      const why = f.freshness_rule === 'FR_MENTHORQ_MERGE' ? 'bloco levels (MenthorQ) so existe na raiz composta, que o Jev nunca le'
        : f.freshness_rule === 'FR_ROOT_CLASSIC_COPY' ? 'copia da raiz = mesmo payload de /gexbot/classic/SPX/zero, ja mapeado em abot.classic.*@SPX/zero (nao duplicado)'
        : f.freshness_rule === 'FR_FROZEN_BLOCK' ? 'bloco legado congelado, so na raiz'
        : id === 'abot.root.gamma_condition' ? 'derivacao da raiz (≡ sign(zgr)); nao recriada: mesma familia de abot.root.gex.net_0dte, ja mapeado'
        : 'so na raiz composta';
      m = { mapping_status: ROOT_ONLY, route: null, source_path: null, transformation: null, notes: why };
    } else if (id.startsWith('abot.ind.')) {
      m = { mapping_status: 'SOURCE_NOT_AVAILABLE', route: null, source_path: null, notes: 'derivado dentro do indicador NT8 (nao vem da API); NT8 nao e tocado' };
    } else if (id.startsWith('abot.cache.')) {
      m = { mapping_status: 'SOURCE_NOT_AVAILABLE', route: null, source_path: null, notes: 'historico local AoClassicCache (pasta do NT8): nao e fonte ao vivo e nao e lido' };
    } else if (id.startsWith('spx_final_context.trace.')) {
      m = { mapping_status: 'SOURCE_NOT_AVAILABLE', route: null, source_path: null, notes: 'SpotGamma TRACE nao e servido pelo relay; so captura 1D fora deste adapter (market_origin SPX preservado)' };
    } else if (id.startsWith('spx_final_context.volsignals.')) {
      m = { mapping_status: 'SOURCE_NOT_AVAILABLE', route: null, source_path: null, notes: 'VolSignals nao e servido pelo relay (pipeline so identificado; auditoria ENCERRADA)' };
    } else {
      m = { mapping_status: 'SOURCE_NOT_AVAILABLE', route: null, source_path: null, notes: 'sem fonte identificada' };
    }
    rows.push({ ...base, ...m, notes: m.notes || notesFor(f) });
  }
  return rows;
}
function notesFor(f) {
  if (['UNKNOWN_SEMANTICS', 'INSUFFICIENT_INFORMATION', 'SEMANTIC_CONFLICT'].includes(f.quality_state)) return 'semantica UNKNOWN no contrato: valor passado cru, leitura UNRESOLVED no runtime';
  if (f.quality_state === 'DEGENERATE') return 'DEGENERATE no contrato (gex_oi = 0 no state): passado cru, nunca utilizavel';
  return null;
}

// classificacao AO VIVO de um campo (apos uma leitura)
export const LIVE_STATUS = ['MAPPED_AVAILABLE', 'MAPPED_CURRENTLY_NULL', 'SOURCE_NOT_AVAILABLE', 'SEMANTICALLY_UNRESOLVED', 'NOT_PRESENT_IN_CURRENT_RELAY'];
const UNRESOLVED_Q = new Set(['UNKNOWN_SEMANTICS', 'INSUFFICIENT_INFORMATION', 'SEMANTIC_CONFLICT']);
export function liveStatus(row, observed) {
  if (row.mapping_status !== 'MAPPED') return row.mapping_status;
  if (observed === 'NULL' || observed === 'ABSENT') return 'MAPPED_CURRENTLY_NULL';
  if (UNRESOLVED_Q.has(row.contract_quality_state)) return 'SEMANTICALLY_UNRESOLVED';
  return 'MAPPED_AVAILABLE';
}
