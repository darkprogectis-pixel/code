// Gera o JEV FEATURE CONTRACT V1 (so definicao; nenhum dado de mercado lido, nenhuma implementacao).
// Fontes: data/gammagex-*.json + data/abot-gammagex-audit/{source-fields,unused-fields,freshness-map,classic-state-map,
// dex-gex-flow,zero-dte-levels,probe-4ind-out}.json + JEV_DEALER_CONTEXT_CONTRACT_20260923.md.
// Saida: data/jev-feature-contract-v1.json, data/jev-double-counting-groups-v1.json, JEV_FEATURE_CONTRACT_V1_20260923.md
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'data', 'jev-feature-contract-v1.json');
const OUT_DC = path.join(ROOT, 'data', 'jev-double-counting-groups-v1.json');
const OUT_MD = path.join(ROOT, 'JEV_FEATURE_CONTRACT_V1_20260923.md');

// ---------- constantes ----------
const ABOT = 'A-Bot/GammaGex (GexBot vendor -> GammaGex :3530 -> relay :3457)';
const UND_ES = 'ES_SPX (mapeamento do vendor: opcoes SPX -> ES front; ESZ6 desde o roll 11-16/09; SPX cru antes de 09/09)';
const UND_SPY = 'SPY (sem mapping servido; escala SPY)';
const PTS = ['indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09', 'CONFIRMED'];
const EXPO = ['UNKNOWN ($MM presumido, sem doc)', 'UNKNOWN'];
const NONE = ['n/a', 'CONFIRMED'];
const CMP_ROOT = 'ROOT / (bloco instruments.<ES|NQ>) — lido por AlfaOmegaNetGex0DTE e AlfaOmegaDexGexFlow';
const CMP_CL = 'CLASSIC /gexbot/classic/{T}/{zero|one|full} — AlfaOmegaClassic';
const CMP_CACHE = 'AoClassicCache (PersistCache do AlfaOmegaClassic) — historico local';
const CMP_SG = 'STATE /gexbot/state/{T}/gex_{zero|one|full} (GexProfile) — AlfaOmegaState';
const CMP_SK = 'STATE /gexbot/state/{T}/{delta|gamma|vanna|charm}_{zero|one} (OptionsProfile) — AlfaOmegaState';
const CMP_IND = 'derivado DENTRO do indicador (nao vem da API)';

const fields = [];
function F(o) {
  const d = {
    source_system: ABOT, market_origin: 'SPX', underlying: UND_ES, raw_or_derived: 'RAW',
    data_type: 'number', unit: EXPO[0], unit_confidence: EXPO[1], availability: 'LIVE',
    quality_state: 'OK', jev_role: 'SUPPORTING_CONTEXT', notes: '',
  };
  const f = { ...d, ...o };
  if (o.u) { f.unit = o.u[0]; f.unit_confidence = o.u[1]; delete f.u; }
  fields.push(f);
}

// ---------- 1. ROOT (bloco ES/NQ) ----------
const R = { source_component: CMP_ROOT, timestamp_field: 'instruments.<I>.timestamp', freshness_rule: 'FR_ROOT_ORDERFLOW', lineage_group: 'LG_ORDERFLOW_SPX' };
F({ ...R, feature_id: 'abot.root.spot', source_field: 'spot', semantic_name: 'preco do subjacente servido (ES_SPX = ESZ6 front ±1,3 pt vs NT8)', u: PTS, double_counting_group: 'DC_SPOT_PRICE', jev_role: 'SUPPORTING_CONTEXT', notes: 'preco, nao evidencia dealer; quebra de escala em 09/09' });
F({ ...R, feature_id: 'abot.root.timestamp', source_field: 'timestamp', semantic_name: 'vendor timestamp do bloco', data_type: 'timestamp', u: NONE, double_counting_group: 'DC_NON_EVIDENCE_META', jev_role: 'DIAGNOSTIC_ONLY', notes: 'base do freshness FR_ROOT_ORDERFLOW' });
F({ ...R, feature_id: 'abot.root.gamma_condition', raw_or_derived: 'DERIVED', source_field: 'gamma_condition', semantic_name: 'regime gamma 0DTE = sign(gex.net_0dte)', data_type: 'enum(POSITIVE|NEGATIVE)', u: NONE, double_counting_group: 'DC_GEX0_SIGN', lineage_group: 'LG_ORDERFLOW_SPX', jev_role: 'REGIME_CONTEXT', notes: 'derivacao darkcode-sync:184; ≡ sign(gex0) 100% desde 13/07; duplicata de net_0dte' });
F({ ...R, feature_id: 'abot.root.pc_oi', raw_or_derived: 'DERIVED', source_field: 'pc_oi', semantic_name: 'razao |dex.net_put_0dte| / |dex.net_call_0dte| (NAO e OI)', u: ['razao adimensional', 'CONFIRMED'], double_counting_group: 'DC_DEX_0DTE', jev_role: 'SUPPORTING_CONTEXT', quality_state: 'MISLABELED', availability: 'LIVE_UNUSED', notes: 'rotulo errado confirmado 3,62 = 3,6202; nenhum dos 4 indicadores le' });

const gexK = { net_0dte: ['GEX liquido 0DTE (zgr)', 'DC_GEX0_SIGN', 'PRIMARY_CONTEXT', 'OK', 'LIVE', 'representante do cluster GEX0_SIGN; GEX = REGIME, sem lado'],
  net_next: ['GEX liquido next expiry (ogr)', 'DC_GEX_NEXT', 'REGIME_CONTEXT', 'OK', 'LIVE', ''],
  cvr_0dte: ['cvr 0DTE', 'DC_OFLOW_CVR_UNKNOWN', 'UNKNOWN', 'UNKNOWN_SEMANTICS', 'LIVE_UNUSED', 'semantica vendor nao documentada'],
  cvr_next: ['cvr next', 'DC_OFLOW_CVR_UNKNOWN', 'UNKNOWN', 'UNKNOWN_SEMANTICS', 'LIVE_UNUSED', 'semantica vendor nao documentada'],
  oflow: ['oflow GEX 0DTE', 'DC_OFLOW_CVR_UNKNOWN', 'UNKNOWN', 'UNKNOWN_SEMANTICS', 'LIVE_UNUSED', 'semantica vendor nao documentada'],
  oflow_next: ['oflow GEX next', 'DC_OFLOW_CVR_UNKNOWN', 'UNKNOWN', 'UNKNOWN_SEMANTICS', 'LIVE_UNUSED', 'semantica vendor nao documentada'] };
for (const [k, [s, dc, role, q, av, n]] of Object.entries(gexK)) F({ ...R, feature_id: `abot.root.gex.${k}`, source_field: `gex.${k}`, semantic_name: s, double_counting_group: dc, jev_role: role, quality_state: q, availability: av, notes: n });

for (const exp of ['0dte', 'next']) {
  const dc = exp === '0dte' ? 'DC_DEX_0DTE' : 'DC_DEX_NEXT';
  for (const [k, s] of [['net', 'DEX liquido'], ['agg', 'DEX agregado'], ['net_call', 'DEX liquido calls'], ['net_put', 'DEX liquido puts'], ['agg_call', 'DEX agregado calls'], ['agg_put', 'DEX agregado puts']]) {
    const main = k === 'net' && exp === '0dte';
    F({ ...R, feature_id: `abot.root.dex.${k}_${exp}`, source_field: `dex.${k}_${exp}`, semantic_name: `${s} ${exp}`, double_counting_group: dc,
      jev_role: main ? 'CONFIRMATION_CONTEXT' : 'SUPPORTING_CONTEXT', availability: main ? 'LIVE' : 'LIVE_UNUSED',
      notes: main ? 'hedge direction so condicionado ao regime; DexGexFlow exibe em texto' : 'decomposicao call/put; recebido e nao usado pelos 4' });
  }
}
for (const k of ['oflow', 'oflow_next']) F({ ...R, feature_id: `abot.root.dex.${k}`, source_field: `dex.${k}`, semantic_name: `oflow DEX ${k === 'oflow' ? '0DTE' : 'next'}`, double_counting_group: 'DC_OFLOW_CVR_UNKNOWN', jev_role: 'UNKNOWN', quality_state: 'UNKNOWN_SEMANTICS', availability: 'LIVE_UNUSED', notes: 'semantica vendor nao documentada' });
for (const g of ['vanna', 'charm']) for (const exp of ['0dte', 'next']) F({ ...R, feature_id: `abot.root.${g}.net_${exp}`, source_field: `${g}.net_${exp}`, semantic_name: `${g} liquido ${exp}`, double_counting_group: `DC_${g.toUpperCase()}_${exp.toUpperCase()}`, availability: exp === '0dte' ? 'LIVE' : 'LIVE_UNUSED', notes: exp === '0dte' ? 'DexGexFlow exibe em texto; sobreposicao suspeita com state por strike' : 'recebido e nao usado pelos 4' });
for (const [k, s, dc, role, q, n] of [
  ['cvr_oflow', 'cvr_oflow 0DTE', 'DC_OFLOW_CVR_UNKNOWN', 'UNKNOWN', 'UNKNOWN_SEMANTICS', 'semantica nao documentada'],
  ['cvr_oflow_next', 'cvr_oflow next', 'DC_OFLOW_CVR_UNKNOWN', 'UNKNOWN', 'UNKNOWN_SEMANTICS', 'semantica nao documentada'],
  ['zero_mcall', 'major call 0DTE (≡ classic/zero.major_pos_vol)', 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT', 'OK', 'coincide com classic ≤7,7% em janela longa; identidade pontual em 24/09'],
  ['zero_mput', 'major put 0DTE (≡ state/gex_zero.major_neg_vol)', 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT', 'UNKNOWN_SEMANTICS', '"put support" acima do spot 67% de 23/09 => LOCATION neutra, semantica UNKNOWN'],
  ['z_mlgamma', 'major long gamma 0DTE (≡ state greek major_long_gamma)', 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT', 'OK', ''],
  ['z_msgamma', 'major short gamma 0DTE (≡ state major_short_gamma ≡ levels.short_gamma_0dte)', 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT', 'OK', ''],
]) F({ ...R, feature_id: `abot.root.orderflow.${k}`, source_field: `orderflow.${k}`, semantic_name: s, double_counting_group: dc, jev_role: role, quality_state: q, availability: 'LIVE_UNUSED', u: k.startsWith('cvr') ? EXPO : PTS, notes: n });

// levels (parseToDF; parte GexBot, parte merge MenthorQ)
const MQ = { source_system: 'MenthorQ (merge anti-stale dentro do bloco levels do relay)', market_origin: 'UNKNOWN', underlying: 'UNKNOWN', lineage_group: 'LG_MENTHORQ_MERGE', double_counting_group: 'DC_MENTHORQ_LEVELS', freshness_rule: 'FR_MENTHORQ_MERGE', timestamp_field: 'levels._asof', jev_role: 'DIAGNOSTIC_ONLY', availability: 'NULL_AT_SOURCE', quality_state: 'NULL', u: PTS };
for (const k of ['hvl', 'call_resistance', 'put_support', 'gamma_wall_0dte', 'put_support_0dte', 'hvl_0dte', 'call_resistance_0dte', 'day_min', 'day_max'])
  F({ ...R, ...MQ, feature_id: `abot.root.levels.${k}`, source_field: `levels.${k}`, semantic_name: `nivel ${k} (quinField MenthorQ)`, notes: 'null em 24/09 (MenthorQ 401); familia MenthorQ = POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING; rotulo GexBot enganoso' });
F({ ...R, ...MQ, feature_id: 'abot.root.levels.distance_to_hvl_pct', raw_or_derived: 'DERIVED', source_field: 'levels.distance_to_hvl_pct', semantic_name: 'distancia % ao HVL', u: ['percentual', 'INFERRED'], notes: 'depende do hvl MenthorQ (null)' });
F({ ...R, ...MQ, feature_id: 'abot.root.levels._menthorq_source', source_field: 'levels._menthorq_source', semantic_name: 'origem do merge MenthorQ', data_type: 'string|null', u: NONE, double_counting_group: 'DC_NON_EVIDENCE_META', notes: 'null em 24/09' });
F({ ...R, ...MQ, feature_id: 'abot.root.levels._asof', source_field: 'levels._asof', semantic_name: 'asof do bloco levels', data_type: 'timestamp', u: NONE, double_counting_group: 'DC_NON_EVIDENCE_META', availability: 'LIVE', quality_state: 'OK', notes: 'base do FR_MENTHORQ_MERGE' });
F({ ...R, feature_id: 'abot.root.levels.short_gamma_0dte', raw_or_derived: 'DERIVED', source_field: 'levels.short_gamma_0dte', semantic_name: 'alias de orderflow.z_msgamma', u: PTS, double_counting_group: 'DC_MAJORS_0DTE', jev_role: 'LOCATION_CONTEXT', notes: 'alias parseToDF; DexGexFlow desenha' });
F({ ...R, feature_id: 'abot.root.levels.short_gamma_next', source_field: 'levels.short_gamma_next', semantic_name: 'short gamma next expiry', u: PTS, double_counting_group: 'DC_MAJORS_NEXT', jev_role: 'LOCATION_CONTEXT', notes: 'DexGexFlow desenha' });
for (const k of ['next_exp_hvl', 'next_exp_call_res', 'next_exp_put_sup'])
  F({ ...R, feature_id: `abot.root.levels.${k}`, source_field: `levels.${k}`, semantic_name: `${k} (orderflow next)`, u: PTS, double_counting_group: 'DC_MAJORS_NEXT', jev_role: 'LOCATION_CONTEXT', availability: 'LIVE_UNUSED', notes: 'recebido e nao usado; next_exp_oi NAO existe no payload' });

// copia do classic dentro da raiz (mesmo payload que /gexbot/classic/SPX/zero)
const RC = { ...R, timestamp_field: 'instruments.<I>.classic.timestamp', freshness_rule: 'FR_ROOT_CLASSIC_COPY', lineage_group: 'LG_CLASSIC_SPX' };
const rootClassic = [
  ['zero_gamma', 'zero gamma 0DTE (copia raiz)', PTS, 'DC_ZERO_GAMMA_0DTE', 'REGIME_CONTEXT'],
  ['major_pos_vol', 'major positivo por volume 0DTE', PTS, 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT'],
  ['major_neg_vol', 'major negativo por volume 0DTE', PTS, 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT'],
  ['major_pos_oi', 'major positivo por OI 0DTE', PTS, 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT'],
  ['major_neg_oi', 'major negativo por OI 0DTE', PTS, 'DC_MAJORS_0DTE', 'LOCATION_CONTEXT'],
  ['sum_gex_vol', 'soma GEX por volume 0DTE', EXPO, 'DC_CLASSIC_GEX_PROFILE_ZERO', 'STRUCTURE_CONTEXT'],
  ['sum_gex_oi', 'soma GEX por OI 0DTE', EXPO, 'DC_CLASSIC_GEX_PROFILE_ZERO', 'STRUCTURE_CONTEXT'],
  ['delta_risk_reversal', 'delta risk reversal', ['UNKNOWN', 'UNKNOWN'], 'DC_RISK_REVERSAL', 'SUPPORTING_CONTEXT'],
  ['min_dte', 'menor DTE da serie', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT'],
  ['sec_min_dte', 'segundo menor DTE', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT'],
  ['spot', 'spot do classic (copia raiz)', PTS, 'DC_SPOT_PRICE', 'SUPPORTING_CONTEXT'],
  ['timestamp', 'vendor timestamp do classic (copia raiz)', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY'],
  ['strikes', 'perfil por strike [strike,gex_vol,gex_oi,[5 priors]] (copia raiz)', EXPO, 'DC_CLASSIC_GEX_PROFILE_ZERO', 'STRUCTURE_CONTEXT'],
  ['max_priors', 'max_priors[6] (copia raiz)', EXPO, 'DC_CLASSIC_GEX_PROFILE_ZERO', 'STRUCTURE_CONTEXT'],
];
for (const [k, s, u, dc, role] of rootClassic)
  F({ ...RC, feature_id: `abot.root.classic.${k}`, source_field: `classic.${k}`, semantic_name: s, u, double_counting_group: dc, jev_role: role,
    data_type: k === 'timestamp' ? 'timestamp' : k === 'strikes' ? 'array<[number,number,number,number[5]]>' : k === 'max_priors' ? 'number[6]' : 'number',
    notes: 'mesmo payload e instante que /gexbot/classic/SPX/zero => nunca evidencia separada (DC com a rota)' });

// blocos da raiz fora do pacote (preservados como DIAGNOSTIC_ONLY)
for (const [k, q, n] of [
  ['iv30d', 'FROZEN', '14,47 constante desde julho => UNUSABLE'],
  ['extended_zone', 'STALE', 'congelado 22/06'], ['spotgamma', 'STALE', 'bloco spotgamma congelado 22/06'],
  ['qscore', 'STALE', 'congelado 22/06'], ['dark_pool_analysis', 'STALE', 'congelado 22/06'],
  ['blind_spots', 'UNKNOWN', 'nao auditado'], ['bl_scores', 'UNKNOWN', 'nao auditado'], ['implied_vol', 'UNKNOWN', 'nao auditado'],
]) F({ ...R, feature_id: `abot.root.${k}`, source_field: k, semantic_name: `bloco ${k} da raiz`, raw_or_derived: 'UNKNOWN', data_type: 'object|number', market_origin: 'UNKNOWN', underlying: 'UNKNOWN', u: ['UNKNOWN', 'UNKNOWN'], lineage_group: 'LG_ROOT_LEGACY_BLOCKS', double_counting_group: 'DC_ROOT_LEGACY_BLOCKS', freshness_rule: 'FR_FROZEN_BLOCK', jev_role: 'DIAGNOSTIC_ONLY', quality_state: q, availability: 'LIVE_UNUSED', notes: n + '; preservado, nao usar como evidencia' });

// derivados dentro dos indicadores
F({ source_component: CMP_IND + ' — AlfaOmegaNetGex0DTE', feature_id: 'abot.ind.netgex0dte.label_color', raw_or_derived: 'DERIVED', source_field: 'cor/rotulo COMPRA|VENDA do histograma', semantic_name: 'sign(net_0dte) exibido como lado', data_type: 'enum', u: NONE, timestamp_field: 'herda instruments.<I>.timestamp', freshness_rule: 'FR_INDICATOR_DERIVED', lineage_group: 'LG_ORDERFLOW_SPX', double_counting_group: 'DC_GEX0_SIGN', jev_role: 'DIAGNOSTIC_ONLY', quality_state: 'SEMANTIC_CONFLICT', availability: 'INDICATOR_ONLY', notes: 'atribui lado a GEX; no contrato GEX = REGIME, sem lado' });
F({ source_component: CMP_IND + ' — AlfaOmegaDexGexFlow', feature_id: 'abot.ind.dexgexflow.heat_trail', raw_or_derived: 'DERIVED', source_field: 'rastro heat (permanencia de niveis)', semantic_name: 'heatmap de permanencia dos niveis desenhados', data_type: 'grid', u: ['UNKNOWN', 'UNKNOWN'], timestamp_field: 'herda instruments.<I>.timestamp', freshness_rule: 'FR_INDICATOR_DERIVED', lineage_group: 'LG_ORDERFLOW_SPX', double_counting_group: 'DC_MAJORS_0DTE', jev_role: 'DIAGNOSTIC_ONLY', availability: 'INDICATOR_ONLY', notes: 'derivado dos mesmos niveis; nunca evidencia independente' });

// ---------- 2. CLASSIC route ----------
const C = { source_component: CMP_CL, timestamp_field: 'timestamp', freshness_rule: 'FR_CLASSIC', lineage_group: 'LG_CLASSIC_SPX', instances: { tickers: { SPX: 'PRIMARY', SPY: 'SUPPORTING (market_origin=SPY)', NDX: 'SECONDARY_OPTIONAL', QQQ: 'SECONDARY_OPTIONAL' }, categories: ['zero', 'one', 'full'] } };
const catDC = (base) => `${base}::{zero->0DTE|one->NEXT|full->FULL}`;
const clF = [
  ['timestamp', 'vendor timestamp', 'timestamp', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'base do FR_CLASSIC; ausente => UNKNOWN (indicador atual trata como idade 0: proibido aqui)'],
  ['ticker', 'ticker servido', 'string', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'checagem de identidade'],
  ['min_dte', 'menor DTE', 'integer', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT', 'confirma 0DTE'],
  ['sec_min_dte', 'segundo menor DTE', 'integer', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT', ''],
  ['spot', 'spot', 'number', PTS, 'DC_SPOT_PRICE', 'SUPPORTING_CONTEXT', ''],
  ['zero_gamma', 'zero gamma', 'number', PTS, catDC('DC_ZERO_GAMMA'), 'REGIME_CONTEXT', 'regime por posicao spot×zg; 2 campos × gamma_condition mas 1 familia (concordancia 44-100%/dia)'],
  ['major_pos_vol', 'major positivo (volume)', 'number', PTS, catDC('DC_MAJORS'), 'LOCATION_CONTEXT', 'zero: ≡ orderflow.zero_mcall'],
  ['major_pos_oi', 'major positivo (OI)', 'number', PTS, catDC('DC_MAJORS'), 'LOCATION_CONTEXT', ''],
  ['major_neg_vol', 'major negativo (volume)', 'number', PTS, catDC('DC_MAJORS'), 'LOCATION_CONTEXT', 'zero: DIFERE de zero_mput (construto distinto do state/orderflow)'],
  ['major_neg_oi', 'major negativo (OI)', 'number', PTS, catDC('DC_MAJORS'), 'LOCATION_CONTEXT', ''],
  ['strikes[].strike', 'strike (escala ES_SPX)', 'number', PTS, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', '108 linhas por snapshot'],
  ['strikes[].gex_vol', 'GEX por strike (volume)', 'number', EXPO, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'agregado sum_gex_vol = mesma informacao'],
  ['strikes[].gex_oi', 'GEX por strike (OI)', 'number', EXPO, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', ''],
  ['strikes[].priors[0..4]', '5 valores anteriores de gex_vol no strike', 'number[5]', EXPO, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'POSITIONING_CHANGE; defasagens do mesmo campo (nao evidencia separada); espacamento temporal UNKNOWN'],
  ['sum_gex_vol', 'soma GEX (volume)', 'number', EXPO, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', ''],
  ['sum_gex_oi', 'soma GEX (OI)', 'number', EXPO, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', ''],
  ['delta_risk_reversal', 'delta risk reversal', 'number', ['UNKNOWN', 'UNKNOWN'], 'DC_RISK_REVERSAL', 'SUPPORTING_CONTEXT', 'so o Classic usa; semantica vendor nao documentada'],
  ['max_priors[0..5]', 'max_priors (6 valores)', 'number[6]', EXPO, catDC('DC_CLASSIC_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'semantica exata UNKNOWN'],
  ['conversion', 'bloco de conversao', 'object|null', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'null desde a ponte'],
];
for (const [k, s, t, u, dc, role, n] of clF) F({ ...C, feature_id: `abot.classic.${k}`, source_field: k, semantic_name: s, data_type: t, u, double_counting_group: dc, jev_role: role, notes: n });
const relayK = [['ticker', 'string'], ['cat', 'string'], ['cached', 'boolean'], ['stale', 'boolean'], ['age_ms', 'integer'], ['ttl_ms', 'integer'], ['served', 'timestamp']];
for (const [k, t] of relayK) F({ ...C, feature_id: `abot.classic._relay.${k}`, source_field: `_relay.${k}`, semantic_name: `relay ${k}`, data_type: t, u: k.endsWith('ms') ? ['ms', 'CONFIRMED'] : NONE, timestamp_field: '_relay.served', double_counting_group: 'DC_NON_EVIDENCE_META', jev_role: 'DIAGNOSTIC_ONLY', notes: k === 'served' ? 'transport_timestamp' : '_relay.stale descreve o CACHE do relay, nao o dado' });

// ---------- 3. AoClassicCache ----------
const K = { source_component: CMP_CACHE, timestamp_field: 't', freshness_rule: 'FR_CACHE_HISTORY', lineage_group: 'LG_CLASSIC_SPX', availability: 'HISTORY_LOCAL', market_origin: 'SPX', underlying: 'SPX cru ate 09/09; ES_SPX (ESZ6) depois', instances: { tickers: { SPX: 'PRIMARY', NDX: 'SECONDARY_OPTIONAL' }, categories: ['full (arquivos atuais)'] } };
for (const [k, map, s, t, u, dc, role] of [
  ['t', 'timestamp', 'vendor timestamp (epoch s UTC)', 'integer', ['epoch s UTC', 'CONFIRMED'], 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY'],
  ['sp', 'spot', 'spot', 'number', PTS, 'DC_SPOT_PRICE', 'SUPPORTING_CONTEXT'],
  ['zg', 'zero_gamma', 'zero gamma', 'number', PTS, 'DC_ZERO_GAMMA_FULL', 'REGIME_CONTEXT'],
  ['mpv', 'major_pos_vol', 'major positivo (volume)', 'number', PTS, 'DC_MAJORS_FULL', 'LOCATION_CONTEXT'],
  ['mnv', 'major_neg_vol', 'major negativo (volume)', 'number', PTS, 'DC_MAJORS_FULL', 'LOCATION_CONTEXT'],
  ['mpo', 'major_pos_oi', 'major positivo (OI)', 'number', PTS, 'DC_MAJORS_FULL', 'LOCATION_CONTEXT'],
  ['mno', 'major_neg_oi', 'major negativo (OI)', 'number', PTS, 'DC_MAJORS_FULL', 'LOCATION_CONTEXT'],
  ['sv', 'sum_gex_vol', 'soma GEX (volume)', 'number', EXPO, 'DC_CLASSIC_GEX_PROFILE_FULL', 'STRUCTURE_CONTEXT'],
  ['so', 'sum_gex_oi', 'soma GEX (OI)', 'number', EXPO, 'DC_CLASSIC_GEX_PROFILE_FULL', 'STRUCTURE_CONTEXT'],
  ['cm', 'ConvMul', 'multiplicador de conversao aplicado', 'number', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY'],
  ['ca', 'ConvAdd', 'aditivo de conversao aplicado', 'number', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY'],
]) F({ ...K, feature_id: `abot.cache.${k}`, source_field: k, semantic_name: `${s} (espelho de classic.${map})`, data_type: t, u, double_counting_group: dc, jev_role: role,
  notes: (k === 'cm' || k === 'ca' ? 'AlfaOmegaClassic.cs:2882-2883 (1/0 = identidade observada); ' : 'mapeamento pela serializacao AlfaOmegaClassic.cs ~2870-2900; ') + 'sem strikes; linhas duplicadas: deduplicar por t; snapshot congelado em data/aoclassiccache-frozen/20260923/' });

// ---------- 4. STATE GexProfile ----------
const S = { source_component: CMP_SG, timestamp_field: 'timestamp', freshness_rule: 'FR_STATE', lineage_group: 'LG_STATE_SPX', instances: { tickers: { SPX: 'PRIMARY', SPY: 'SUPPORTING (market_origin=SPY)', NDX: 'SECONDARY_OPTIONAL', QQQ: 'SECONDARY_OPTIONAL' }, categories: ['gex_zero', 'gex_one', 'gex_full'] } };
const sgDC = (base) => `${base}::{gex_zero->0DTE|gex_one->NEXT|gex_full->FULL}`;
const sgF = [
  ['timestamp', 'vendor timestamp', 'timestamp', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'OK', 'base do FR_STATE'],
  ['ticker', 'ticker', 'string', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'OK', ''],
  ['min_dte', 'menor DTE', 'integer', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT', 'OK', ''],
  ['sec_min_dte', 'segundo menor DTE', 'integer', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT', 'OK', ''],
  ['spot', 'spot', 'number', PTS, 'DC_SPOT_PRICE', 'SUPPORTING_CONTEXT', 'OK', ''],
  ['zero_gamma', 'zero gamma (DEGENERADO = 0 no state)', 'number', PTS, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'DEGENERATE', 'sempre 0 no state gex; preservado'],
  ['major_pos_vol', 'major positivo (volume)', 'number', PTS, sgDC('DC_MAJORS'), 'LOCATION_CONTEXT', 'OK', ''],
  ['major_pos_oi', 'major positivo (OI)', 'number', PTS, sgDC('DC_MAJORS'), 'DIAGNOSTIC_ONLY', 'DEGENERATE', 'gex_oi = 0 no state => major_*_oi sem conteudo provado'],
  ['major_neg_vol', 'major negativo (volume)', 'number', PTS, sgDC('DC_MAJORS'), 'LOCATION_CONTEXT', 'OK', 'gex_zero: ≡ orderflow.zero_mput'],
  ['major_neg_oi', 'major negativo (OI)', 'number', PTS, sgDC('DC_MAJORS'), 'DIAGNOSTIC_ONLY', 'DEGENERATE', 'idem'],
  ['strikes[].strike', 'strike', 'number', PTS, sgDC('DC_STATE_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'OK', '108 linhas; gex_zero: agregado ≈ net_0dte => DC_GEX0_SIGN'],
  ['strikes[].gex_vol', 'GEX por strike (volume)', 'number', EXPO, sgDC('DC_STATE_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'OK', 'valores DIFEREM do classic no mesmo strike (construto distinto)'],
  ['strikes[].gex_oi', 'GEX por strike (OI) — sempre 0', 'number', EXPO, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'DEGENERATE', ''],
  ['strikes[].priors[0..4]', '5 valores anteriores de gex_vol', 'number[5]', EXPO, sgDC('DC_STATE_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'OK', 'POSITIONING_CHANGE; espacamento UNKNOWN'],
  ['sum_gex_vol', 'imbalance GEX (soma volume)', 'number', EXPO, sgDC('DC_STATE_GEX_PROFILE'), 'REGIME_CONTEXT', 'OK', 'gex_zero: ≈ gex.net_0dte (22.400,69 vs 22.406,11) => DC_GEX0_SIGN; gex_one => DC_GEX_NEXT'],
  ['sum_gex_oi', 'soma GEX (OI)', 'number', EXPO, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'DEGENERATE', 'gex_oi = 0; nao usado pelo State'],
  ['delta_risk_reversal', 'delta risk reversal', 'number', ['UNKNOWN', 'UNKNOWN'], 'DC_RISK_REVERSAL', 'SUPPORTING_CONTEXT', 'OK', 'nao usado pelo State'],
  ['max_priors[0..5]', 'max_priors (6)', 'number[6]', EXPO, sgDC('DC_STATE_GEX_PROFILE'), 'STRUCTURE_CONTEXT', 'OK', 'semantica UNKNOWN'],
  ['conversion', 'conversao (multiplier/additive/future_contract ausentes)', 'object|null', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'OK', 'escala crua ja ES; comentario additive 16,38 obsoleto'],
];
for (const [k, s, t, u, dc, role, q, n] of sgF) F({ ...S, feature_id: `abot.state_gex.${k}`, source_field: k, semantic_name: s, data_type: t, u, double_counting_group: dc, jev_role: role, quality_state: q, notes: n });
const relayS = [...relayK, ['grade', 'string'], ['n', 'integer'], ['tem_majors', 'boolean']];
for (const [k, t] of relayS) F({ ...S, feature_id: `abot.state_gex._relay.${k}`, source_field: `_relay.${k}`, semantic_name: `relay ${k}`, data_type: t, u: k.endsWith('ms') ? ['ms', 'CONFIRMED'] : NONE, timestamp_field: '_relay.served', double_counting_group: 'DC_NON_EVIDENCE_META', jev_role: 'DIAGNOSTIC_ONLY', notes: k === 'served' ? 'transport_timestamp' : 'metadado do relay (cache), nao do dado' });

// ---------- 5. STATE OptionsProfile ----------
const G = { source_component: CMP_SK, timestamp_field: 'timestamp', freshness_rule: 'FR_STATE', lineage_group: 'LG_STATE_SPX', instances: { tickers: { SPX: 'PRIMARY', SPY: 'SUPPORTING (market_origin=SPY)', NDX: 'SECONDARY_OPTIONAL', QQQ: 'SECONDARY_OPTIONAL' }, categories: ['delta_zero', 'delta_one', 'gamma_zero', 'gamma_one', 'vanna_zero', 'vanna_one', 'charm_zero', 'charm_one'] } };
const skDC = (base) => `${base}::{*_zero->0DTE|*_one->NEXT}`;
for (const [k, s, t, u, dc, role, n] of [
  ['timestamp', 'vendor timestamp', 'timestamp', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', 'base do FR_STATE'],
  ['ticker', 'ticker', 'string', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', ''],
  ['spot', 'spot', 'number', PTS, 'DC_SPOT_PRICE', 'SUPPORTING_CONTEXT', ''],
  ['min_dte', 'menor DTE', 'integer', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT', ''],
  ['sec_min_dte', 'segundo menor DTE', 'integer', ['dias', 'INFERRED'], 'DC_NON_EVIDENCE_META', 'SUPPORTING_CONTEXT', ''],
  ['major_positive', 'major positivo da grega', 'number', PTS, skDC('DC_MAJORS'), 'LOCATION_CONTEXT', 'nao usado pelo State'],
  ['major_negative', 'major negativo da grega', 'number', PTS, skDC('DC_MAJORS'), 'LOCATION_CONTEXT', 'nao usado pelo State'],
  ['major_long_gamma', 'major long gamma', 'number', PTS, skDC('DC_MAJORS'), 'LOCATION_CONTEXT', '*_zero: ≡ orderflow.z_mlgamma'],
  ['major_short_gamma', 'major short gamma', 'number', PTS, skDC('DC_MAJORS'), 'LOCATION_CONTEXT', '*_zero: ≡ z_msgamma ≡ levels.short_gamma_0dte'],
  ['mini_contracts[].strike', 'strike', 'number', PTS, 'DC_NON_EVIDENCE_META', 'STRUCTURE_CONTEXT', '108 linhas'],
  ['mini_contracts[].call_ivol', 'IV/volume call no strike (col 1)', 'number', ['UNKNOWN', 'UNKNOWN'], skDC('DC_STATE_IVOL'), 'SUPPORTING_CONTEXT', 'nome pela auditoria; semantica exata UNKNOWN (0 na amostra)'],
  ['mini_contracts[].put_ivol', 'IV/volume put no strike (col 2)', 'number', ['UNKNOWN', 'UNKNOWN'], skDC('DC_STATE_IVOL'), 'SUPPORTING_CONTEXT', 'idem'],
  ['mini_contracts[].col5', 'coluna 5 (0 na amostra)', 'number', ['UNKNOWN', 'UNKNOWN'], 'DC_UNKNOWN_COLUMNS', 'UNKNOWN', 'semantica UNKNOWN; preservada'],
  ['mini_contracts[].col6', 'coluna 6 (null na amostra)', 'null|number', ['UNKNOWN', 'UNKNOWN'], 'DC_UNKNOWN_COLUMNS', 'UNKNOWN', 'semantica UNKNOWN; preservada'],
  ['conversion', 'conversao', 'object|null', NONE, 'DC_NON_EVIDENCE_META', 'DIAGNOSTIC_ONLY', ''],
]) F({ ...G, feature_id: `abot.state_greek.${k}`, source_field: k, semantic_name: s, data_type: t, u, double_counting_group: dc, jev_role: role, notes: n });
const greekU = { delta: ['UNKNOWN', 'UNKNOWN'], gamma: EXPO, vanna: EXPO, charm: ['$MM/hr (tooltip do vendor)', 'INFERRED'] };
const greekDC = { delta: skDC('DC_DEX') + ' (SUSPECTED: delta por strike vs dex agregado)', gamma: skDC('DC_GEX_SIGN') + ' (SUSPECTED)', vanna: skDC('DC_VANNA') + ' (SUSPECTED)', charm: skDC('DC_CHARM') + ' (SUSPECTED)' };
for (const g of ['delta', 'gamma', 'vanna', 'charm']) {
  F({ ...G, feature_id: `abot.state_greek.${g}.mini_contracts[].greek_value`, source_field: 'mini_contracts[][3]', semantic_name: `${g} do dealer por strike (col 3; categorias ${g}_zero|${g}_one)`, u: greekU[g], double_counting_group: greekDC[g], jev_role: 'STRUCTURE_CONTEXT', notes: `unico com gregas POR STRIKE; insumo hipotetico de ΔDelta_dealer; convencao de SINAL UNKNOWN${g === 'delta' ? '' : ''}` });
  F({ ...G, feature_id: `abot.state_greek.${g}.mini_contracts[].priors[0..2]`, source_field: 'mini_contracts[][4]', semantic_name: `3 valores anteriores de ${g} no strike`, data_type: 'number[3]', u: greekU[g], double_counting_group: greekDC[g], jev_role: 'STRUCTURE_CONTEXT', notes: 'POSITIONING_CHANGE; defasagens do mesmo campo; espacamento UNKNOWN' });
}
for (const [k, t] of relayS) F({ ...G, feature_id: `abot.state_greek._relay.${k}`, source_field: `_relay.${k}`, semantic_name: `relay ${k}`, data_type: t, u: k.endsWith('ms') ? ['ms', 'CONFIRMED'] : NONE, timestamp_field: '_relay.served', double_counting_group: 'DC_NON_EVIDENCE_META', jev_role: 'DIAGNOSTIC_ONLY', notes: k === 'served' ? 'transport_timestamp' : k === 'tem_majors' ? 'false em delta_zero mesmo com majors presentes: nao usar como checagem' : 'metadado do relay (cache)' });

const abotCount = fields.length;

// ---------- 6. spx_final_context.* ----------
const TR = { source_system: 'SpotGamma_TRACE', market_origin: 'SPX', underlying: 'SPX (opcoes SPX; nunca ES_NATIVE)', source_component: 'SpotGamma TRACE (vendor; captura aditiva 1D em ~/.claude/sg-directional-capture/raw/TRACE*)', timestamp_field: 'instante do grid TRACE (raw/TRACE_TIMESTAMPS)', freshness_rule: 'FR_TRACE', lineage_group: 'LG_SPX_OPTIONS_TRADES_SPOTGAMMA', jev_role: 'FINAL_DECISION_CONTEXT', data_type: 'grid(timestamp × strike)', u: ['UNKNOWN', 'UNKNOWN'], availability: 'CAPTURED_1D', quality_state: 'PENDING_REVISION_AUDIT' };
F({ ...TR, feature_id: 'spx_final_context.trace.gamma_mm', source_field: 'mm_gamma[_0] (parquet TRACE; menu "Gamma", mkt_actor=mm)', semantic_name: 'TRACE gamma do market maker (timestamp × preco)', double_counting_group: 'DC_SPX_FINAL_GAMMA', analog: { volsignals: 'gammaExposure', classification: 'PARTIAL_ANALOG', numeric_equivalence_allowed: false }, notes: 'variantes all / _0 (0DTE); Δ15 do gamma dealer = PROVISIONAL na 1C' });
for (const p of ['cust', 'procust', 'firm', 'bd'])
  F({ ...TR, feature_id: `spx_final_context.trace.gamma_${p}`, source_field: `${p}_gamma[_0] (parquet TRACE)`, semantic_name: `TRACE gamma do participante ${p}`, double_counting_group: 'DC_SPX_TRACE_PARTICIPANTS', notes: 'mesmo grid/instante do mm; sem analogo VolSignals' });
F({ ...TR, feature_id: 'spx_final_context.trace.delta_pressure', source_field: 'menu "Delta Pressure" (/cloud spot/delta; endpoint real nao vinculado)', semantic_name: 'TRACE Delta Pressure', double_counting_group: 'DC_SPX_TRACE_DELTA', availability: 'NOT_CAPTURED', quality_state: 'INSUFFICIENT_INFORMATION', analog: { classification: 'INSUFFICIENT_INFORMATION', numeric_equivalence_allowed: false }, notes: 'so com regime definido (vendor); OPTIONAL_EVIDENCE_GAP: vinculo ao endpoint real' });
F({ ...TR, feature_id: 'spx_final_context.trace.charm_pressure', source_field: 'menu "Charm Pressure"', semantic_name: 'TRACE Charm Pressure', double_counting_group: 'DC_SPX_TRACE_CHARM', availability: 'NOT_CAPTURED', quality_state: 'INSUFFICIENT_INFORMATION', analog: { classification: 'INSUFFICIENT_INFORMATION', numeric_equivalence_allowed: false }, notes: 'body/raw/formula/unidade nao capturados' });
F({ ...TR, feature_id: 'spx_final_context.trace.stats', source_field: 'raw/TRACE_STATS', semantic_name: 'TRACE stats/percentis', data_type: 'object', double_counting_group: 'DC_SPX_FINAL_GAMMA', notes: 'derivado do mesmo grid; nunca evidencia separada do gamma' });
F({ ...TR, feature_id: 'spx_final_context.trace.timestamps', source_field: 'raw/TRACE_TIMESTAMPS', semantic_name: 'instantes disponiveis do grid', data_type: 'timestamp[]', u: NONE, double_counting_group: 'DC_NON_EVIDENCE_META', jev_role: 'DIAGNOSTIC_ONLY', notes: 'base do FR_TRACE' });

const VS = { source_system: 'VolSignals', market_origin: 'SPX', underlying: 'SPX (nunca ES_NATIVE)', source_component: 'VolSignals (protobuf/RPC; pipeline identificado)', timestamp_field: 'UNKNOWN (eixo timestamp do grid)', freshness_rule: 'FR_VOLSIGNALS', lineage_group: 'LG_SPX_OPTIONS_VOLSIGNALS', jev_role: 'FINAL_DECISION_CONTEXT', data_type: 'grid(timestamp × preco)', u: ['UNKNOWN', 'UNKNOWN'], availability: 'PIPELINE_IDENTIFIED', quality_state: 'INSUFFICIENT_INFORMATION' };
F({ ...VS, feature_id: 'spx_final_context.volsignals.gammaExposure', source_field: 'gammaExposure', semantic_name: 'VolSignals gamma exposure ("Simulated")', double_counting_group: 'DC_SPX_FINAL_GAMMA', quality_state: 'PARTIAL_ANALOG', analog: { trace: 'gamma_mm', classification: 'PARTIAL_ANALOG', numeric_equivalence_allowed: false, reason: 'conceito compartilhado (timestamp×preco->exposicao); metodologia Simulated vs mkt_actor=mm; transporte protobuf/RPC vs REST/JSON' }, notes: 'nao fundir com TRACE' });
for (const [k, n] of [['charmExposure', ''], ['deltaChangeExposure', ''], ['deltaTotalExposure', ''], ['vannaExposure', ''], ['volgaExposure', ''],
  ['deltaExposureDiff', 'int64; observado 3678/3678 = 0; FUNCTION UNKNOWN; 3 hipoteses anteriores EXCLUDED; sem significado ate evidencia nova']])
  F({ ...VS, feature_id: `spx_final_context.volsignals.${k}`, source_field: k, semantic_name: `VolSignals ${k}`, data_type: k === 'deltaExposureDiff' ? 'int64' : 'grid(timestamp × preco)', double_counting_group: `DC_SPX_VOLSIGNALS_${k.replace('Exposure', '').toUpperCase()}`, analog: { classification: 'INSUFFICIENT_INFORMATION', numeric_equivalence_allowed: false }, notes: n || 'equivalencia com TRACE nao estabelecida (sem body/raw/formula/unidade)' });

// ---------- freshness ----------
const RTH = 'fora do RTH (09:30-16:00 ET) o estado e MARKET_CLOSED, nao STALE';
const freshness_rules = {
  _principle: 'freshness_basis = vendor_timestamp sempre que existir; arrival_timestamp NUNCA e base (fonte congelada pareceria fresca: FAIL-OPEN atual de NetGex0DTE/DexGexFlow). transport_timestamp (relay) descreve cache, nao dado. Limiares marcados PROVISIONAL sao so ponto de partida e exigem calibracao na captura propria.',
  _ingestion_envelope: { arrival_timestamp: 'relogio local da ingestao do Jev (obrigatorio em todo registro)', route: 'rota HTTP', http_status: 'status', payload_sha256: 'hash do payload bruto (detecta FROZEN_VALUES)' },
  _states: ['FRESH', 'STALE', 'FROZEN (vendor_timestamp nao avanca em RTH)', 'FROZEN_VALUES (valor constante entre pregoes)', 'MARKET_CLOSED', 'UNKNOWN (sem timestamp valido)'],
  FR_ROOT_ORDERFLOW: { vendor_timestamp: 'instruments.<I>.timestamp', transport_timestamp: 'NENHUM (raiz nao tem _relay)', arrival_timestamp: 'ingestao', freshness_basis: 'VENDOR_TIMESTAMP', age: 'arrival - vendor', stale_after_sec: { value: 60, status: 'PROVISIONAL', reason: 'orderflow ~1 s de cadencia' }, frozen: 'vendor_timestamp igual em >= 3 leituras consecutivas no RTH', notes: RTH },
  FR_ROOT_CLASSIC_COPY: { vendor_timestamp: 'instruments.<I>.classic.timestamp', transport_timestamp: 'NENHUM', arrival_timestamp: 'ingestao', freshness_basis: 'VENDOR_TIMESTAMP', stale_after_sec: { value: 300, status: 'PROVISIONAL', reason: '= StaleLimitMin 5 do AlfaOmegaClassic (unico limiar do projeto)' }, notes: RTH },
  FR_MENTHORQ_MERGE: { vendor_timestamp: 'levels._asof', transport_timestamp: 'NENHUM', arrival_timestamp: 'ingestao', freshness_basis: 'VENDOR_TIMESTAMP (asof do merge)', rule: '_menthorq_source null ou valor null => quality NULL; nunca herdar freshness do orderflow', notes: 'familia MenthorQ = so confirmacao positiva, nao bloqueante' },
  FR_CLASSIC: { vendor_timestamp: 'timestamp', transport_timestamp: '_relay.served', arrival_timestamp: 'ingestao', freshness_basis: 'VENDOR_TIMESTAMP', stale_after_sec: { value: 300, status: 'PROVISIONAL', reason: 'StaleLimitMin 5 do indicador' }, rule: 'timestamp ausente => UNKNOWN (o indicador atual usa idade 0: proibido); _relay.stale/age_ms = cache (ttl 20 s), nao dado', notes: RTH },
  FR_STATE: { vendor_timestamp: 'timestamp', transport_timestamp: '_relay.served', arrival_timestamp: 'ingestao', freshness_basis: 'VENDOR_TIMESTAMP', stale_after_sec: { value: 300, status: 'PROVISIONAL', reason: 'mesma cadencia de rota do classic' }, rule: 'checar _relay.ticker == ticker pedido; _relay.tem_majors nao e confiavel', notes: RTH },
  FR_CACHE_HISTORY: { vendor_timestamp: 't', transport_timestamp: 'NENHUM', arrival_timestamp: 'mtime do arquivo (so diagnostico)', freshness_basis: 'VENDOR_TIMESTAMP (historico)', rule: 'historico: freshness nao se aplica; deduplicar por t; recortar pregao por t, nunca pelo nome do arquivo; dias com distinct_t = 1 sao estado de fechamento, nao pregao' },
  FR_FROZEN_BLOCK: { freshness_basis: 'VALUE_CONSTANCY', rule: 'blocos congelados (iv30d 14,47 desde julho; blocos 22/06) => FROZEN_VALUES independentemente de timestamp' },
  FR_INDICATOR_DERIVED: { freshness_basis: 'HERDADO do campo de origem', rule: 'nunca mais fresco que a origem' },
  FR_TRACE: { vendor_timestamp: 'instante do grid (raw/TRACE_TIMESTAMPS)', transport_timestamp: 'resposta REST/JSON do vendor', arrival_timestamp: 'tag de captura (LIVE_hhmm / EOD / BACKFILL)', freshness_basis: 'VENDOR_TIMESTAMP', rule: 'anti-lookahead: bin i so disponivel em t[i+1]; dados BACKFILL = PENDING_REVISION_AUDIT; LIVE ≠ EOD ate a auditoria de revisao classificar' },
  FR_VOLSIGNALS: { vendor_timestamp: 'UNKNOWN (eixo timestamp do grid)', transport_timestamp: 'protobuf/RPC (UNKNOWN)', arrival_timestamp: 'ingestao', freshness_basis: 'UNKNOWN', rule: 'sem basis definida => quality UNKNOWN; nunca FRESH por default' },
};

// ---------- double counting groups ----------
const dcGroups = {
  _meta: { project: 'ALFA OMEGA JEV FUTURE', version: 'v1', date: '2026-09-23', implementation: 'NONE', rule: 'uma evidencia por grupo (count_as 1); membro SUSPECTED conta junto ate medicao provar independencia; lineage UNKNOWN => independencia UNKNOWN', instance_notation: 'grupos com ::{cat->SUFIXO} resolvem por categoria: DC_MAJORS::{zero->0DTE} => DC_MAJORS_0DTE' },
  groups: {
    DC_GEX0_SIGN: { count_as: 1, risk: 'HIGH', status: 'CONFIRMED', members: ['abot.root.gex.net_0dte', 'abot.root.gamma_condition', 'abot.state_gex.sum_gex_vol@gex_zero', 'abot.state_gex.strikes[].gex_vol@gex_zero (agregado vs por strike)', 'abot.ind.netgex0dte.label_color'], suspected: ['abot.state_greek.gamma.mini_contracts[].greek_value@gamma_zero'], evidence: 'darkcode-sync:184; 22.400,69 ≈ 22.406,11; sign(gex0) 100% desde 13/07' },
    DC_GEX_NEXT: { count_as: 1, risk: 'MEDIUM', status: 'CONFIRMED_BY_CONSTRUCTION', members: ['abot.root.gex.net_next', 'abot.state_gex.sum_gex_vol@gex_one', 'abot.state_gex.strikes[].gex_vol@gex_one'], suspected: ['abot.state_greek.gamma.mini_contracts[].greek_value@gamma_one'] },
    DC_MAJORS_0DTE: { count_as: 1, risk: 'HIGH', status: 'CONFIRMED (identidades pontuais 24/09; confirmar em RTH)', members: ['abot.root.orderflow.zero_mcall', 'abot.root.orderflow.zero_mput', 'abot.root.orderflow.z_mlgamma', 'abot.root.orderflow.z_msgamma', 'abot.root.levels.short_gamma_0dte', 'abot.root.classic.major_*', 'abot.classic.major_*@zero', 'abot.state_gex.major_*@gex_zero', 'abot.state_greek.major_*@*_zero', 'abot.ind.dexgexflow.heat_trail'], note: 'classic/zero.major_neg_vol ≠ zero_mput (construto distinto), mas mesma familia de posicionamento => mesmo grupo' },
    DC_MAJORS_NEXT: { count_as: 1, risk: 'MEDIUM', status: 'BY_CONSTRUCTION', members: ['abot.root.levels.short_gamma_next', 'abot.root.levels.next_exp_hvl', 'abot.root.levels.next_exp_call_res', 'abot.root.levels.next_exp_put_sup', 'abot.classic.major_*@one', 'abot.state_gex.major_*@gex_one', 'abot.state_greek.major_*@*_one'] },
    DC_MAJORS_FULL: { count_as: 1, risk: 'MEDIUM', status: 'BY_CONSTRUCTION', members: ['abot.classic.major_*@full', 'abot.state_gex.major_*@gex_full', 'abot.cache.mpv', 'abot.cache.mnv', 'abot.cache.mpo', 'abot.cache.mno'], note: 'cache = persistencia do mesmo classic' },
    DC_ZERO_GAMMA_0DTE: { count_as: 1, risk: 'HIGH', status: 'CONFIRMED (mesmo payload)', members: ['abot.classic.zero_gamma@zero', 'abot.root.classic.zero_gamma'], relation: { DC_GEX0_SIGN: 'mesma familia de regime (concordancia 44-100%/dia): 2 campos, 1 familia de independencia' } },
    DC_ZERO_GAMMA_NEXT: { count_as: 1, members: ['abot.classic.zero_gamma@one'] },
    DC_ZERO_GAMMA_FULL: { count_as: 1, members: ['abot.classic.zero_gamma@full', 'abot.cache.zg'] },
    DC_CLASSIC_GEX_PROFILE_ZERO: { count_as: 1, risk: 'HIGH', status: 'CONFIRMED (agregado vs por strike + copia raiz)', members: ['abot.classic.strikes[]*@zero', 'abot.classic.sum_gex_*@zero', 'abot.classic.max_priors@zero', 'abot.root.classic.strikes', 'abot.root.classic.sum_gex_vol', 'abot.root.classic.sum_gex_oi', 'abot.root.classic.max_priors'] },
    DC_CLASSIC_GEX_PROFILE_NEXT: { count_as: 1, members: ['abot.classic.strikes[]*@one', 'abot.classic.sum_gex_*@one', 'abot.classic.max_priors@one'] },
    DC_CLASSIC_GEX_PROFILE_FULL: { count_as: 1, members: ['abot.classic.strikes[]*@full', 'abot.classic.sum_gex_*@full', 'abot.classic.max_priors@full', 'abot.cache.sv', 'abot.cache.so'] },
    DC_STATE_GEX_PROFILE_FULL: { count_as: 1, members: ['abot.state_gex.strikes[]*@gex_full', 'abot.state_gex.sum_gex_vol@gex_full', 'abot.state_gex.max_priors@gex_full'], note: 'gex_zero e gex_one caem em DC_GEX0_SIGN / DC_GEX_NEXT' },
    DC_DEX_0DTE: { count_as: 1, risk: 'HIGH', status: 'CONFIRMED (pc_oi medido)', members: ['abot.root.dex.net_0dte', 'abot.root.dex.agg_0dte', 'abot.root.dex.net_call_0dte', 'abot.root.dex.net_put_0dte', 'abot.root.dex.agg_call_0dte', 'abot.root.dex.agg_put_0dte', 'abot.root.pc_oi'], suspected: ['abot.state_greek.delta.mini_contracts[]*@delta_zero'] },
    DC_DEX_NEXT: { count_as: 1, members: ['abot.root.dex.*_next'], suspected: ['abot.state_greek.delta.mini_contracts[]*@delta_one'] },
    DC_VANNA_0DTE: { count_as: 1, members: ['abot.root.vanna.net_0dte'], suspected: ['abot.state_greek.vanna.mini_contracts[]*@vanna_zero'], note: 'refina o cluster SECOND_ORDER anterior: vanna e charm sao gregas distintas, mas agregado e por strike da mesma grega sao o mesmo grupo' },
    DC_VANNA_NEXT: { count_as: 1, members: ['abot.root.vanna.net_next'], suspected: ['abot.state_greek.vanna.mini_contracts[]*@vanna_one'] },
    DC_CHARM_0DTE: { count_as: 1, members: ['abot.root.charm.net_0dte'], suspected: ['abot.state_greek.charm.mini_contracts[]*@charm_zero'] },
    DC_CHARM_NEXT: { count_as: 1, members: ['abot.root.charm.net_next'], suspected: ['abot.state_greek.charm.mini_contracts[]*@charm_one'] },
    DC_OFLOW_CVR_UNKNOWN: { count_as: 1, status: 'SUSPECTED (semantica UNKNOWN, mesma origem orderflow)', members: ['abot.root.gex.cvr_0dte', 'abot.root.gex.cvr_next', 'abot.root.gex.oflow', 'abot.root.gex.oflow_next', 'abot.root.dex.oflow', 'abot.root.dex.oflow_next', 'abot.root.orderflow.cvr_oflow', 'abot.root.orderflow.cvr_oflow_next'] },
    DC_STATE_IVOL: { count_as: 1, members: ['abot.state_greek.mini_contracts[].call_ivol', 'abot.state_greek.mini_contracts[].put_ivol'] },
    DC_RISK_REVERSAL: { count_as: 1, members: ['abot.classic.delta_risk_reversal', 'abot.root.classic.delta_risk_reversal', 'abot.state_gex.delta_risk_reversal'], note: 'relacao classic x state nao medida' },
    DC_SPOT_PRICE: { count_as: 0, note: 'preco, nao evidencia dealer', members: ['abot.root.spot', 'abot.root.classic.spot', 'abot.classic.spot', 'abot.state_gex.spot', 'abot.state_greek.spot', 'abot.cache.sp'] },
    DC_MENTHORQ_LEVELS: { count_as: 1, family: 'MenthorQ (POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING)', members: ['abot.root.levels.{hvl,call_resistance,put_support,gamma_wall_0dte,put_support_0dte,hvl_0dte,call_resistance_0dte,day_min,day_max,distance_to_hvl_pct}'] },
    DC_ROOT_LEGACY_BLOCKS: { count_as: 0, note: 'diagnostico; congelados/nao auditados', members: ['abot.root.{iv30d,extended_zone,spotgamma,qscore,dark_pool_analysis,blind_spots,bl_scores,implied_vol}'] },
    DC_UNKNOWN_COLUMNS: { count_as: 0, members: ['abot.state_greek.mini_contracts[].col5', 'abot.state_greek.mini_contracts[].col6'] },
    DC_NON_EVIDENCE_META: { count_as: 0, note: 'timestamps, ticker, dte, conversion, relay, cm/ca, strike: metadado, nunca evidencia', members: ['*.timestamp', '*.ticker', '*.min_dte', '*.sec_min_dte', '*.conversion', '*._relay.*', 'abot.cache.{t,cm,ca}', 'abot.state_gex.{zero_gamma,strikes[].gex_oi,sum_gex_oi}', 'abot.state_greek.mini_contracts[].strike', 'spx_final_context.trace.timestamps'] },
    DC_SPX_FINAL_GAMMA: { count_as: 1, layer: 'FINAL_DECISION_CONTEXT', status: 'PARTIAL_ANALOG', members: ['spx_final_context.trace.gamma_mm', 'spx_final_context.trace.stats', 'spx_final_context.volsignals.gammaExposure'], numeric_equivalence_allowed: false, note: 'mesmo conceito; nao fundir, nao normalizar; confirmam juntos como 1' },
    DC_SPX_TRACE_PARTICIPANTS: { count_as: 1, members: ['spx_final_context.trace.gamma_{cust,procust,firm,bd}'] },
    DC_SPX_TRACE_DELTA: { count_as: 1, members: ['spx_final_context.trace.delta_pressure'], relation: { 'DC_SPX_VOLSIGNALS_DELTACHANGE / DELTATOTAL': 'INSUFFICIENT_INFORMATION' } },
    DC_SPX_TRACE_CHARM: { count_as: 1, members: ['spx_final_context.trace.charm_pressure'], relation: { DC_SPX_VOLSIGNALS_CHARM: 'INSUFFICIENT_INFORMATION' } },
    DC_SPX_VOLSIGNALS_CHARM: { count_as: 1, members: ['spx_final_context.volsignals.charmExposure'] },
    DC_SPX_VOLSIGNALS_DELTACHANGE: { count_as: 1, members: ['spx_final_context.volsignals.deltaChangeExposure'] },
    DC_SPX_VOLSIGNALS_DELTATOTAL: { count_as: 1, members: ['spx_final_context.volsignals.deltaTotalExposure'] },
    DC_SPX_VOLSIGNALS_VANNA: { count_as: 1, members: ['spx_final_context.volsignals.vannaExposure'] },
    DC_SPX_VOLSIGNALS_VOLGA: { count_as: 1, members: ['spx_final_context.volsignals.volgaExposure'] },
    DC_SPX_VOLSIGNALS_DELTADIFF: { count_as: 0, members: ['spx_final_context.volsignals.deltaExposureDiff'], note: '3678/3678 = 0; FUNCTION UNKNOWN' },
  },
  cross_group_relations: [
    { a: 'instancias SPX', b: 'instancias SPY', relation: 'ECOSSISTEMAS CORRELATOS (MEDIUM)', rule: 'medir antes de somar; SPY market_origin=SPY' },
    { a: 'abot.* (GammaGex)', b: 'SpotGamma :3500 / spx_final_context.trace.*', relation: 'MESMO UPSTREAM SPX_OPTIONS_TRADES (MEDIUM)', rule: 'independencia UNKNOWN; nao contar como confirmacoes independentes sem medir lineage' },
    { a: 'abot.* (GammaGex gamma/vanna/charm)', b: 'spx_final_context.volsignals.*', relation: 'UPSTREAM SPX PROVAVEL; metodologia distinta (Simulated)', rule: 'independencia UNKNOWN' },
    { a: 'DC_ZERO_GAMMA_0DTE', b: 'DC_GEX0_SIGN', relation: 'mesma familia de regime', rule: '1 familia de independencia' },
    { a: 'abot.* antes de 09/09', b: 'abot.* depois de 09/09', relation: 'QUEBRA DE FONTE/ESCALA (GexBot->GammaGex; SPX cru -> ESZ6)', rule: 'nunca misturar sem ajuste' },
  ],
};

// ---------- montagem ----------
const REQ = ['feature_id', 'source_system', 'source_component', 'market_origin', 'underlying', 'raw_or_derived', 'source_field', 'semantic_name', 'data_type', 'unit', 'unit_confidence', 'timestamp_field', 'freshness_rule', 'lineage_group', 'double_counting_group', 'availability', 'quality_state', 'jev_role', 'notes'];
const missing = fields.flatMap((f) => REQ.filter((k) => f[k] === undefined || f[k] === null).map((k) => `${f.feature_id}:${k}`));
const ids = fields.map((f) => f.feature_id);
const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
const esNative = fields.filter((f) => f.feature_id.startsWith('spx_final_context') && f.market_origin !== 'SPX');
const ROLES = ['PRIMARY_CONTEXT', 'SUPPORTING_CONTEXT', 'LOCATION_CONTEXT', 'REGIME_CONTEXT', 'STRUCTURE_CONTEXT', 'CONFIRMATION_CONTEXT', 'FINAL_DECISION_CONTEXT', 'DIAGNOSTIC_ONLY', 'UNKNOWN'];
const badRole = fields.filter((f) => !ROLES.includes(f.jev_role)).map((f) => f.feature_id);
if (missing.length || dupIds.length || esNative.length || badRole.length) { console.error(JSON.stringify({ missing, dupIds, esNative: esNative.map((f) => f.feature_id), badRole })); process.exit(2); }

// cobertura: toda chave do schema auditado (probe/source-fields) tem feature
const schemaKeys = {
  root_ES: ['gamma_condition', 'spot', 'pc_oi', 'levels', 'gex', 'dex', 'vanna', 'charm', 'orderflow', 'timestamp', 'classic', 'dark_pool_analysis', 'extended_zone', 'qscore', 'iv30d', 'blind_spots', 'bl_scores', 'spotgamma', 'implied_vol'],
  gex: ['net_0dte', 'net_next', 'cvr_0dte', 'cvr_next', 'oflow', 'oflow_next'],
  dex: ['net_0dte', 'net_next', 'agg_0dte', 'agg_next', 'net_call_0dte', 'net_put_0dte', 'net_call_next', 'net_put_next', 'agg_call_0dte', 'agg_put_0dte', 'agg_call_next', 'agg_put_next', 'oflow', 'oflow_next'],
  orderflow: ['cvr_oflow', 'cvr_oflow_next', 'zero_mcall', 'zero_mput', 'z_mlgamma', 'z_msgamma'],
  levels: ['hvl', 'call_resistance', 'put_support', 'gamma_wall_0dte', 'put_support_0dte', 'hvl_0dte', 'short_gamma_0dte', 'short_gamma_next', 'next_exp_hvl', 'next_exp_call_res', 'next_exp_put_sup', 'call_resistance_0dte', 'day_min', 'day_max', 'distance_to_hvl_pct', '_menthorq_source', '_asof'],
  root_classic: ['zero_gamma', 'major_pos_vol', 'major_neg_vol', 'major_pos_oi', 'major_neg_oi', 'sum_gex_vol', 'sum_gex_oi', 'delta_risk_reversal', 'min_dte', 'sec_min_dte', 'spot', 'timestamp', 'strikes', 'max_priors'],
  classic_route: ['timestamp', 'ticker', 'min_dte', 'sec_min_dte', 'spot', 'zero_gamma', 'major_pos_vol', 'major_pos_oi', 'major_neg_vol', 'major_neg_oi', 'strikes', 'sum_gex_vol', 'sum_gex_oi', 'delta_risk_reversal', 'max_priors', 'conversion', '_relay'],
  state_greek: ['timestamp', 'ticker', 'spot', 'min_dte', 'sec_min_dte', 'major_positive', 'major_negative', 'major_long_gamma', 'major_short_gamma', 'mini_contracts', 'conversion', '_relay'],
  cache: ['t', 'sp', 'zg', 'mpv', 'mnv', 'mpo', 'mno', 'sv', 'so', 'cm', 'ca'],
};
const has = (prefix, k) => ids.some((id) => id === prefix + k || id.startsWith(prefix + k + '.') || id.startsWith(prefix + k + '[') || id.startsWith(prefix + k + '_'));
const hasG = (prefix, k) => has(prefix, k) || ids.some((id) => id.startsWith(prefix) && id.includes('.' + k));
const uncovered = [
  ...schemaKeys.root_ES.filter((k) => !has('abot.root.', k)).map((k) => 'root.' + k),
  ...schemaKeys.gex.filter((k) => !has('abot.root.gex.', k)).map((k) => 'gex.' + k),
  ...schemaKeys.dex.filter((k) => !has('abot.root.dex.', k)).map((k) => 'dex.' + k),
  ...schemaKeys.orderflow.filter((k) => !has('abot.root.orderflow.', k)).map((k) => 'orderflow.' + k),
  ...schemaKeys.levels.filter((k) => !has('abot.root.levels.', k)).map((k) => 'levels.' + k),
  ...schemaKeys.root_classic.filter((k) => !has('abot.root.classic.', k)).map((k) => 'root.classic.' + k),
  ...schemaKeys.classic_route.filter((k) => !has('abot.classic.', k)).map((k) => 'classic.' + k),
  ...schemaKeys.classic_route.filter((k) => !has('abot.state_gex.', k)).map((k) => 'state_gex.' + k),
  ...schemaKeys.state_greek.filter((k) => !hasG('abot.state_greek.', k)).map((k) => 'state_greek.' + k),
  ...schemaKeys.cache.filter((k) => !has('abot.cache.', k)).map((k) => 'cache.' + k),
];

const byNs = (p) => fields.filter((f) => f.feature_id.startsWith(p)).length;
const contract = {
  $id: 'alfaomega-jev-future/feature-contract/v1',
  title: 'JEV FUTURE — contrato oficial de entrada V1',
  version: '1.0.0', date: '2026-09-23', status: 'DEFINITION ONLY', implementation: 'NONE', production: 'OUT OF SCOPE / UNCHANGED',
  governed_by: ['JEV_DEALER_CONTEXT_CONTRACT_20260923.md', 'PROJECT_SCOPE_JEV_FUTURE_20260923.md'],
  principles: [
    'Quatro fontes COMPLETAS (NetGex0DTE, DexGexFlow, Classic, State): nenhum campo documentado descartado; o contrato marca papel/redundancia/double counting/freshness/qualidade, nao filtra.',
    'jev_role e rotulo semantico, NAO peso, NAO prioridade, NAO lado. Sem score, conviction, LONG/SHORT ou gate.',
    'Camada dealer/options = contexto; nunca originador obrigatorio, veto, gate ou substituto do Futures Core.',
    'spx_final_context.* (TRACE, VolSignals) entra DEPOIS das quatro fontes, market_origin = SPX, nunca ES_NATIVE; TRACE e VolSignals nao sao fundidos.',
    'UNKNOWN unit => numeric_equivalence_allowed = false.',
    'Templates com instances (ticker × categoria) sao 1 feature_id por campo; a instancia e resolvida na ingestao como <feature_id>@<ticker>/<categoria>.',
  ],
  enums: {
    jev_role: ROLES,
    availability: ['LIVE', 'LIVE_UNUSED', 'INDICATOR_ONLY', 'HISTORY_LOCAL', 'NULL_AT_SOURCE', 'CAPTURED_1D', 'NOT_CAPTURED', 'PIPELINE_IDENTIFIED'],
    quality_state: ['OK', 'UNKNOWN_SEMANTICS', 'MISLABELED', 'DEGENERATE', 'NULL', 'STALE', 'FROZEN', 'UNKNOWN', 'SEMANTIC_CONFLICT', 'PENDING_REVISION_AUDIT', 'PARTIAL_ANALOG', 'INSUFFICIENT_INFORMATION'],
    unit_confidence: ['CONFIRMED', 'INFERRED', 'UNKNOWN'],
    raw_or_derived: ['RAW', 'DERIVED', 'UNKNOWN'],
  },
  counts: { total_fields: fields.length, abot_four_sources: abotCount, spx_final_context: fields.length - abotCount, trace: byNs('spx_final_context.trace.'), volsignals: byNs('spx_final_context.volsignals.'), fields_dropped: 0, schema_keys_uncovered: uncovered },
  excluded_not_in_four_sources: {
    root_envelope_keys: ['trading_enabled', 'desk_status', 'date', 'source', 'instruments(container)', 'dark_pool', 'flow_hiro', 'signals', 'narrative', 'macro_news', 'llm_news_alert'],
    reason: 'envelope do relay composto (outros sistemas), nao conteudo das 4 fontes A-Bot; NAO e descarte de campo das fontes',
  },
  freshness_rules,
  fields,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(contract, null, 1));
fs.writeFileSync(OUT_DC, JSON.stringify(dcGroups, null, 1));

// ---------- markdown ----------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const sect = (title, pred) => {
  const rows = fields.filter(pred);
  return `\n### ${title} (${rows.length})\n\n| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |\n|---|---|---|---|---|---|---|---|---|---|---|\n` +
    rows.map((f) => `| \`${esc(f.feature_id)}\` | ${esc(f.source_field)} | ${esc(f.semantic_name)} | ${f.raw_or_derived} | ${esc(f.unit)} (${f.unit_confidence}) | ${f.freshness_rule} | ${f.lineage_group} | ${esc(f.double_counting_group)} | ${f.availability} | ${f.quality_state} | ${f.jev_role} |`).join('\n') + '\n';
};
const roleCount = ROLES.map((r) => `${r} ${fields.filter((f) => f.jev_role === r).length}`).join(' · ');
const md = `# JEV FEATURE CONTRACT V1 (23/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | DEFINITION ONLY — contrato de entrada |
| IMPLEMENTATION | NONE |
| PRODUCTION | OUT OF SCOPE / UNCHANGED |
| F5 | NOT PERFORMED |
| Regido por | \`JEV_DEALER_CONTEXT_CONTRACT_20260923.md\` · \`PROJECT_SCOPE_JEV_FUTURE_20260923.md\` |
| Máquina | \`data/jev-feature-contract-v1.json\` · \`data/jev-double-counting-groups-v1.json\` |
| Gerador | \`scripts/build-jev-feature-contract-v1.js\` (determinístico; valida campos obrigatórios, ids únicos, SPX no final context e cobertura do schema) |

## 1. Resumo

- **Campos:** ${fields.length} no total.
  - Quatro fontes A-Bot: ${abotCount}.
  - \`spx_final_context.*\`: ${fields.length - abotCount} (TRACE ${byNs('spx_final_context.trace.')}, VolSignals ${byNs('spx_final_context.volsignals.')}).
- **Descartes:** 0 campos descartados. Chaves do schema auditado sem feature: ${uncovered.length}.
- **Templates:** cada \`feature_id\` é um campo. Ticker × categoria são \`instances\`, resolvidos na ingestão como \`<feature_id>@<ticker>/<categoria>\`.
  - Tickers: SPX PRIMARY; SPY SUPPORTING (\`market_origin=SPY\`); NDX/QQQ SECONDARY_OPTIONAL.
  - Categorias: classic \`zero|one|full\`, state \`gex_*\` e \`<greek>_zero|one\`.
- **jev_role (rótulo, não peso):** ${roleCount}.
- **Fora das 4 fontes (não é descarte):** as chaves do envelope do relay composto (\`trading_enabled, desk_status, date, source, dark_pool, flow_hiro, signals, narrative, macro_news, llm_news_alert\`). Elas pertencem a outros sistemas.

## 2. Regras

1. **Quatro fontes completas.** Nenhum campo documentado sai do contrato, nem os redundantes, degenerados, stale, null, UNKNOWN ou não usados. Esses ficam marcados em \`quality_state\`, \`availability\` e \`jev_role\`.
2. **\`jev_role\` não é peso, prioridade nem lado.** Não há score, conviction, LONG/SHORT nem gate.
3. **\`market_origin\` preserva a origem real.** As 4 fontes A-Bot têm \`market_origin=SPX\` (opções SPX), com \`underlying=ES_SPX\` como mapeamento do vendor. O mapeamento não muda a identidade: o inventário anterior dizia "ES_DIRECT", e isso descreve a **escala**, não a origem. SPY é \`market_origin=SPY\`.
4. **\`spx_final_context.*\` entra depois das quatro fontes.**
   - TRACE (\`SpotGamma_TRACE\`) e VolSignals (\`VolSignals\`) têm \`market_origin=SPX\`, nunca ES_NATIVE. São namespaces separados e não se fundem.
   - Gamma: PARTIAL_ANALOG. Os outros 6 campos: INSUFFICIENT_INFORMATION.
   - Unidades VolSignals: UNKNOWN ⇒ \`numeric_equivalence_allowed=false\`.
   - \`deltaExposureDiff\`: int64, 3678/3678 = 0, função UNKNOWN.
5. **Double counting:** 1 evidência por grupo (§5). Membro SUSPECTED conta junto até que uma medição prove independência.
6. **Quebra de 09/09** (GexBot→GammaGex; SPX cru → ESZ6): nunca misturar sem ajuste.

## 3. Freshness (por fonte)

- **Princípio.** \`freshness_basis = vendor_timestamp\` sempre que existir.
  - \`arrival_timestamp\` **nunca** é base: com ela, uma fonte congelada parece fresca, que é o FAIL-OPEN atual de NetGex0DTE/DexGexFlow.
  - \`transport_timestamp\` (\`_relay.served\`) descreve o cache do relay (ttl 20 s), não o dado.
  - Todo registro de ingestão carrega \`arrival_timestamp\`, \`route\`, \`http_status\` e \`payload_sha256\`.
- **Estados:** FRESH · STALE · FROZEN · FROZEN_VALUES · MARKET_CLOSED · UNKNOWN.

| regra | vendor_timestamp | transport_timestamp | freshness_basis | limiar | nota |
|---|---|---|---|---|---|
${Object.entries(freshness_rules).filter(([k]) => k.startsWith('FR_')).map(([k, r]) => `| ${k} | ${esc(r.vendor_timestamp ?? '—')} | ${esc(r.transport_timestamp ?? '—')} | ${esc(r.freshness_basis)} | ${r.stale_after_sec ? `${r.stale_after_sec.value} s (${r.stale_after_sec.status})` : '—'} | ${esc(r.rule ?? r.notes ?? r.frozen ?? '')} |`).join('\n')}

Os limiares PROVISIONAL são só um ponto de partida e precisam ser calibrados na captura própria.

## 4. Campos
${sect('4.1 ROOT — bloco instruments.<ES|NQ> (NetGex0DTE, DexGexFlow)', (f) => f.feature_id.startsWith('abot.root.'))}
${sect('4.2 Derivados dentro dos indicadores', (f) => f.feature_id.startsWith('abot.ind.'))}
${sect('4.3 CLASSIC /gexbot/classic/{T}/{zero|one|full}', (f) => f.feature_id.startsWith('abot.classic.'))}
${sect('4.4 AoClassicCache (histórico local)', (f) => f.feature_id.startsWith('abot.cache.'))}
${sect('4.5 STATE GexProfile gex_{zero|one|full}', (f) => f.feature_id.startsWith('abot.state_gex.'))}
${sect('4.6 STATE OptionsProfile {delta|gamma|vanna|charm}_{zero|one}', (f) => f.feature_id.startsWith('abot.state_greek.'))}
${sect('4.7 spx_final_context.trace.* (SpotGamma_TRACE, market_origin=SPX)', (f) => f.feature_id.startsWith('spx_final_context.trace.'))}
${sect('4.8 spx_final_context.volsignals.* (VolSignals, market_origin=SPX)', (f) => f.feature_id.startsWith('spx_final_context.volsignals.'))}

Notas por campo, instâncias e analogias TRACE × VolSignals: \`data/jev-feature-contract-v1.json\`.

## 5. Double counting

${Object.keys(dcGroups.groups).length} grupos em \`data/jev-double-counting-groups-v1.json\`. Os que já têm evidência:

- **DC_GEX0_SIGN:** \`gex.net_0dte\` ≡ \`gamma_condition\` ≡ \`state gex_zero.sum_gex_vol\` (e o perfil por strike) ≡ cor/rótulo NetGex0DTE ⇒ **1**.
- **DC_MAJORS_0DTE / _NEXT / _FULL:** majors repetidos entre orderflow, levels, classic, state e cache ⇒ 1 por vencimento.
- **DC_DEX_0DTE / _NEXT:** \`dex.net_*\`, decomposição call/put e \`pc_oi\` ⇒ 1. O delta por strike do state é SUSPECTED.
- **DC_CLASSIC_GEX_PROFILE_*:** o agregado \`sum_gex_*\` e o perfil por strike são a mesma informação. A cópia do classic na raiz é o mesmo payload da rota \`/gexbot/classic/SPX/zero\`.
- **DC_VANNA_* / DC_CHARM_*:** o agregado e o por strike da mesma grega ficam juntos (SUSPECTED). Isto refina o cluster SECOND_ORDER.
- **DC_SPX_FINAL_GAMMA:** TRACE \`gamma_mm\` + stats + VolSignals \`gammaExposure\` ⇒ 1. É PARTIAL_ANALOG: não se fundem nem se normalizam.
- **Relações entre grupos:**
  - SPX × SPY: medir antes de somar.
  - GammaGex × SpotGamma/TRACE: mesmo upstream \`SPX_OPTIONS_TRADES\`, independência UNKNOWN.
  - GammaGex × VolSignals: independência UNKNOWN.
  - ZERO_GAMMA × GEX0_SIGN: 1 família.
  - Antes × depois de 09/09: não misturar.
- **Sem contagem (count_as 0):** preço, metadados, colunas UNKNOWN e blocos legados.

## 6. Pendências que NÃO bloqueiam

- Semântica de \`cvr\`/\`oflow\`, \`zero_mput\`, \`max_priors\`, colunas 5 e 6 de \`mini_contracts\` e \`delta_risk_reversal\`: continuam UNKNOWN e ficam preservadas.
- Convenção de sinal das gregas por strike: UNKNOWN.
- Identidades dos majors: medidas num único instante pós-fechamento; confirmar em RTH na captura futura.
- OPTIONAL_EVIDENCE_GAP: body de \`/v2/open_interest/intraday_delta\` e o vínculo do TRACE Delta Pressure ao endpoint real.
- A captura própria de 20–40 pregões **não** começa aqui.
`;
fs.writeFileSync(OUT_MD, md);
console.log(JSON.stringify({ total: fields.length, abot: abotCount, trace: byNs('spx_final_context.trace.'), volsignals: byNs('spx_final_context.volsignals.'), dc_groups: Object.keys(dcGroups.groups).length, uncovered, roles: roleCount, md_bytes: md.length }, null, 1));
