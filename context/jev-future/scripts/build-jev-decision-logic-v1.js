// Gera os 4 artefatos da Decision Logic V1 (Jev Future) a partir do feature contract V1 e dos grupos DC V1:
//   data/jev-analysis-routes-v1.json    — rota de cada um dos 190 campos (nenhum descartado)
//   data/jev-evidence-families-v1.json  — familias de evidencia (CONFIRMED/BY_CONSTRUCTION consolidam; resto fica separado com risco)
//   data/jev-output-contract-v1.json    — contrato de saida do Jev
//   data/jev-decision-logic-v1.json     — estagios, politicas UNDEFINED e resumo
// Deterministico. Falha se: total != 190, campo sem rota, familia sem grupo DC, SPX final context com origem != SPX.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const wr = (f, o) => fs.writeFileSync(path.join(ROOT, 'data', f), JSON.stringify(o, null, 2) + '\n');
const fc = rd('jev-feature-contract-v1.json');
const dc = rd('jev-double-counting-groups-v1.json');
const F = fc.fields;
const G = dc.groups;
const META = { project: 'ALFA OMEGA JEV FUTURE', version: 'v1', date: '2026-09-23', status: 'DEFINITION ONLY', implementation: 'NONE', production: 'UNCHANGED', f5: 'NOT PERFORMED', doc: 'JEV_DECISION_LOGIC_V1_20260923.md' };

// ---- familias de evidencia a partir dos grupos DC ----
// Consolidam: lineage compartilhada CONFIRMED (medida) ou BY_CONSTRUCTION (mesmo payload/derivacao).
// Nao consolidam: SUSPECTED, sem status (UNVERIFIED), PARTIAL_ANALOG.
function basisOf(g) {
  const s = String(g.status || '');
  if (/^CONFIRMED_BY_CONSTRUCTION|^BY_CONSTRUCTION/.test(s)) return 'BY_CONSTRUCTION';
  if (/^CONFIRMED/.test(s)) return 'CONFIRMED';
  if (/^SUSPECTED/.test(s)) return 'SUSPECTED';
  if (/^PARTIAL_ANALOG/.test(s)) return 'PARTIAL_ANALOG';
  return 'UNVERIFIED';
}
const CONSOLIDATE = new Set(['CONFIRMED', 'BY_CONSTRUCTION']);

// aliases de resolucao de template (instance -> grupo existente), conforme notas do proprio arquivo DC
const ALIAS = {
  DC_CLASSIC_GEX_PROFILE_0DTE: 'DC_CLASSIC_GEX_PROFILE_ZERO',
  DC_STATE_GEX_PROFILE_0DTE: 'DC_GEX0_SIGN', DC_STATE_GEX_PROFILE_NEXT: 'DC_GEX_NEXT',
  DC_GEX_SIGN_0DTE: 'DC_GEX0_SIGN', DC_GEX_SIGN_NEXT: 'DC_GEX_NEXT',
  DC_STATE_IVOL_0DTE: 'DC_STATE_IVOL', DC_STATE_IVOL_NEXT: 'DC_STATE_IVOL',
};
function resolve(dcg) {
  // retorna [{category, group, suspected_member}]
  const m = /^([A-Z0-9_]+)::\{([^}]+)\}(.*)$/.exec(dcg);
  if (!m) return [{ category: null, group: dcg, suspected_member: false }];
  const suspected = /SUSPECTED/.test(m[3]);
  return m[2].split('|').map(p => {
    const [cat, suf] = p.split('->');
    const raw = m[1] + '_' + suf;
    return { category: cat, group: ALIAS[raw] || raw, suspected_member: suspected };
  });
}

const DIM = [
  [/^DC_(GEX0_SIGN|GEX_NEXT|ZERO_GAMMA_|STATE_GEX_PROFILE_)/, 'GAMMA_REGIME'],
  [/^DC_(MAJORS_|CLASSIC_GEX_PROFILE_)/, 'STRUCTURE_LOCATION'],
  [/^DC_DEX_/, 'DELTA_POSITIONING'],
  [/^DC_(VANNA|CHARM)_/, 'SECOND_ORDER_FLOWS'],
  [/^DC_(STATE_IVOL|RISK_REVERSAL)$/, 'VOL_SKEW'],
  [/^DC_OFLOW_CVR_UNKNOWN$/, 'FLOW_UNKNOWN_SEMANTICS'],
  [/^DC_MENTHORQ_LEVELS$/, 'MENTHORQ_CONFIRMATION_LEVELS'],
  [/^DC_SPOT_PRICE$/, 'PRICE_REFERENCE'],
  [/^DC_NON_EVIDENCE_META$/, 'METADATA'],
  [/^DC_(ROOT_LEGACY_BLOCKS|UNKNOWN_COLUMNS)$/, 'DIAGNOSTIC_UNRESOLVED'],
  [/^DC_SPX_FINAL_GAMMA$/, 'SPX_FINAL_GAMMA'],
  [/^DC_SPX_TRACE_/, 'SPX_FINAL_TRACE'],
  [/^DC_SPX_VOLSIGNALS_/, 'SPX_FINAL_VOLSIGNALS'],
];
const dimOf = g => { for (const [re, d] of DIM) if (re.test(g)) return d; throw new Error('grupo sem dimensao: ' + g); };

// areas para as quais o campo PODE contribuir na analise do Jev.
// STATUS: PROVISIONAL_DESIGN_MAPPING — associacao dimension->area proposta pelo Claude Code (23/09), NAO regra empirica validada.
// Pode servir de estrutura inicial do pre-registro; qualquer uso para classificacao direcional precisa ser pre-registrado explicitamente.
const AREAS = {
  GAMMA_REGIME: ['REGIME'], STRUCTURE_LOCATION: ['LOCATION', 'STRUCTURE'], DELTA_POSITIONING: ['FLOW', 'SENSITIVITY'],
  SECOND_ORDER_FLOWS: ['SENSITIVITY', 'CHANGE'], VOL_SKEW: ['SENSITIVITY', 'CONTEXT'], FLOW_UNKNOWN_SEMANTICS: ['FLOW', 'UNRESOLVED'],
  MENTHORQ_CONFIRMATION_LEVELS: ['LOCATION'], PRICE_REFERENCE: ['CONTEXT'], METADATA: ['DIAGNOSTIC'],
  DIAGNOSTIC_UNRESOLVED: ['DIAGNOSTIC', 'UNRESOLVED'], SPX_FINAL_GAMMA: ['REGIME', 'CONTEXT'],
  SPX_FINAL_TRACE: ['CONTEXT'], SPX_FINAL_VOLSIGNALS: ['CONTEXT'],
};
const UNRESOLVED_Q = new Set(['UNKNOWN_SEMANTICS', 'UNKNOWN', 'SEMANTIC_CONFLICT', 'INSUFFICIENT_INFORMATION', 'MISLABELED', 'PENDING_REVISION_AUDIT']);
function areasOf(x, dim) {
  const a = new Set(AREAS[dim]);
  if (!a.size) throw new Error('dimensao sem area: ' + dim);
  if (/prior/i.test(x.feature_id)) a.add('CHANGE');
  if (UNRESOLVED_Q.has(x.quality_state) || x.unit_confidence === 'UNKNOWN' && dim !== 'METADATA') a.add('UNRESOLVED');
  return [...a];
}

const families = {};
function familyFor(fieldId, r) {
  const g = G[r.group];
  if (!g) throw new Error('grupo DC inexistente: ' + r.group + ' (campo ' + fieldId + ')');
  const basis = basisOf(g);
  const inst = r.category ? '@' + r.category : '';
  let id, kind;
  if (g.count_as === 0) { id = 'EF_' + r.group; kind = 'NON_EVIDENCE'; }
  else if (r.suspected_member) { id = 'EF_' + r.group + '__SUSPECTED__' + fieldId + inst; kind = 'SEPARATE_SUSPECTED_OVERLAP'; }
  else if (CONSOLIDATE.has(basis)) { id = 'EF_' + r.group; kind = 'CONSOLIDATED'; }
  else { id = 'EF_' + r.group + '__' + fieldId + inst; kind = 'SEPARATE_' + basis; }
  if (!families[id]) families[id] = {
    family_id: id, dc_group: r.group, kind, lineage_basis: g.count_as === 0 ? 'N/A' : (r.suspected_member ? 'SUSPECTED' : basis),
    dimension: dimOf(r.group), stage: r.group.startsWith('DC_SPX_') ? 'C_SPX_FINAL_CONTEXT' : 'B_JEV_NATIVE_DEALER_ANALYSIS',
    overlap_risk: kind === 'CONSOLIDATED' || kind === 'NON_EVIDENCE' ? null
      : { with_group: r.group, level: g.risk || 'UNKNOWN', rule: 'preservar separado; independencia UNKNOWN ate medicao' },
    numeric_equivalence_allowed: g.numeric_equivalence_allowed === false ? false : undefined,
    members: [],
  };
  families[id].members.push(fieldId + inst);
  return id;
}

// ---- rotas por campo ----
const STAGE_OF = x => /^spx_final_context\./.test(x.feature_id) ? 'C_SPX_FINAL_CONTEXT' : 'B_JEV_NATIVE_DEALER_ANALYSIS';
const routes = F.map(x => {
  const stage = STAGE_OF(x);
  if (stage === 'C_SPX_FINAL_CONTEXT' && x.market_origin !== 'SPX') throw new Error('SPX final context com origem != SPX: ' + x.feature_id);
  const res = resolve(x.double_counting_group);
  const fams = res.map(r => familyFor(x.feature_id, r));
  const isMQ = /^MenthorQ/.test(x.source_system);
  return {
    feature_id: x.feature_id,
    source_system: x.source_system,
    source_component: x.source_component,
    market_origin: x.market_origin,
    stage,
    analysis_use: 'ANALYZED_IN_FULL',
    dimension: dimOf(res[0].group),
    possible_contribution_areas: areasOf(x, dimOf(res[0].group)),
    possible_contribution_areas_status: 'PROVISIONAL_DESIGN_MAPPING',
    jev_role_label: x.jev_role,
    quality_state: x.quality_state,
    availability: x.availability,
    freshness_rule: x.freshness_rule,
    lineage_group: x.lineage_group,
    double_counting_group: x.double_counting_group,
    evidence_families: fams,
    policy_overlay: isMQ ? 'MENTHORQ_POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING' : null,
    is_vote: false,
  };
});
const nB = routes.filter(r => r.stage === 'B_JEV_NATIVE_DEALER_ANALYSIS').length;
const nC = routes.filter(r => r.stage === 'C_SPX_FINAL_CONTEXT').length;
if (F.length !== 190 || nB !== 174 || nC !== 16) throw new Error(`contagem inesperada: total ${F.length} B ${nB} C ${nC}`);
if (new Set(routes.map(r => r.feature_id)).size !== 190) throw new Error('feature_id duplicado');
const unassigned = routes.filter(r => !r.evidence_families.length).length;
if (unassigned) throw new Error('campos sem familia: ' + unassigned);

const famList = Object.values(families).sort((a, b) => a.family_id.localeCompare(b.family_id));
const famKinds = {}; for (const f of famList) famKinds[f.kind] = (famKinds[f.kind] || 0) + 1;
const countBy = k => { const o = {}; for (const r of routes) o[r[k]] = (o[r[k]] || 0) + 1; return o; };
const summary = {
  total_input_fields: F.length, fields_routed: routes.length, unassigned,
  by_stage: countBy('stage'), by_dimension: countBy('dimension'),
  menthorq_overlay_fields: routes.filter(r => r.policy_overlay).length,
  evidence_families_total: famList.length, evidence_families_by_kind: famKinds,
  note: '190 campos analisados != 190 votos; is_vote=false em todos',
};

wr('jev-analysis-routes-v1.json', { _meta: { ...META, source: ['jev-feature-contract-v1.json', 'jev-double-counting-groups-v1.json'] }, summary, routes });
wr('jev-evidence-families-v1.json', {
  _meta: { ...META, rule: 'CONFIRMED ou BY_CONSTRUCTION => consolida em 1 familia; SUSPECTED, UNVERIFIED (sem status) e PARTIAL_ANALOG => membros separados com overlap_risk; count_as 0 => NON_EVIDENCE',
    rule_change_vs_feature_contract: 'feature contract §2.5 ("SUSPECTED conta junto") trocado por ordem do operador 23/09: preservar separado e marcar risco',
    usage: 'familias organizam a analise; contagem de familias NAO e decisao operacional' },
  cross_group_relations: dc.cross_group_relations,
  summary: { total: famList.length, by_kind: famKinds },
  families: famList,
});

const DIRECTIONAL_CONTEXT = ['LONG_CONTEXT', 'SHORT_CONTEXT', 'NEUTRAL_CONTEXT', 'CONFLICTED_CONTEXT', 'NO_TRADE_CONTEXT', 'UNKNOWN'];
const output = {
  _meta: { ...META, schema: 'jev-future/output/v1', nature: 'CLASSIFICACAO DE ESTADO/CONFLUENCIA — nao e ordem de trade' },
  enums: {
    jev_directional_context: DIRECTIONAL_CONTEXT,
    state_distinctions: {
      DATA_INVALID: 'dados insuficientes/invalidos para classificar (vive em data_quality.status; jev_directional_context = UNKNOWN com reason DATA_INVALID)',
      UNKNOWN: 'dados validos, mas o Jev nao consegue classificar (semantica/lineage insuficiente)',
      NEUTRAL_CONTEXT: 'dados validos, sem inclinacao direcional',
      CONFLICTED_CONTEXT: 'dados validos, familias com leituras opostas',
      NO_TRADE_CONTEXT: 'dados validos; o Jev classifica o estado como desfavoravel a exposicao direcional (criterios TO_BE_PREREGISTERED)',
    },
    data_quality_status: ['VALID', 'DEGRADED', 'DATA_INVALID'],
    freshness_state: ['FRESH', 'STALE', 'FROZEN', 'FROZEN_VALUES', 'MARKET_CLOSED', 'UNKNOWN'],
    spx_effect_on_native: ['CONFIRMS', 'CONTRADICTS', 'ENRICHES', 'NO_EFFECT', 'UNAVAILABLE'],
    core_comparison: ['ALIGNED', 'CONTRARY', 'MIXED', 'UNKNOWN', 'NOT_AVAILABLE'],
    conviction: ['UNCALIBRATED'],
    menthorq_confirmation: ['POSITIVE', 'ZERO'],
  },
  shape: {
    jev_market_state: { target: 'ES', evaluated_at: '<ts de avaliacao>', gamma_regime: '...', structure_location: '...', delta_positioning: '...', second_order_flows: '...', vol_skew: '...', flow_unknown_semantics: '...' },
    native_directional_context: 'jev_directional_context (so estagio B, antes do SPX final context)',
    jev_directional_context: 'jev_directional_context (apos estagio C)',
    native_dealer_state: { '<dimension>': { reading: '...', families: ['EF_*'], freshness_state: '...', notes: [] } },
    spx_final_context: {
      trace: { market_origin: 'SPX', reading: '...', families: ['EF_*'], freshness_state: '...' },
      volsignals: { market_origin: 'SPX', reading: '...', families: ['EF_*'], freshness_state: '...' },
      numeric_equivalence_allowed: false,
      effect_on_native: 'CONFIRMS|CONTRADICTS|ENRICHES|NO_EFFECT|UNAVAILABLE',
    },
    evidence_families: [{ family_id: 'EF_*', kind: '...', reading: '...', overlap_risk: '...' }],
    conflicts: [{ between: ['EF_*', 'EF_*'], description: '...' }],
    data_quality: { role: 'DATA QUALITY / CLASSIFICATION INPUT (sem gate operacional)', status: 'VALID|DEGRADED|DATA_INVALID', session: 'RTH|OUTSIDE_RTH (informativo)', per_source: { '<source_component>': { freshness_state: '...', basis: 'VENDOR_TIMESTAMP' } } },
    reason_codes: [],
    source_contributions: [{ source_component: '...', families: ['EF_*'], role_in_this_reading: '...' }],
    unresolved_fields: [{ feature_id: '...', why: 'UNKNOWN_SEMANTICS|UNKNOWN_UNIT|SIGN_CONVENTION_UNKNOWN|...' }],
    menthorq: { confirmation: 'POSITIVE|ZERO', policy: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING' },
    conviction: 'UNCALIBRATED',
    core_comparison: 'ALIGNED|CONTRARY|MIXED|UNKNOWN|NOT_AVAILABLE',
    core_comparison_pair: { futures_core_side: 'LONG|SHORT|NONE|null', jev_directional_context: '...' },
    versions: { decision_logic: 'v1', feature_contract: 'v1', dc_groups: 'v1', evidence_families: 'v1' },
  },
  core_comparison_mapping: {
    note: 'COMPARACAO, nao regra operacional',
    'core LONG  x LONG_CONTEXT': 'ALIGNED', 'core SHORT x SHORT_CONTEXT': 'ALIGNED',
    'core LONG  x SHORT_CONTEXT': 'CONTRARY', 'core SHORT x LONG_CONTEXT': 'CONTRARY',
    'core LONG|SHORT x CONFLICTED_CONTEXT': 'MIXED',
    'core LONG|SHORT x NEUTRAL_CONTEXT|NO_TRADE_CONTEXT|UNKNOWN': 'UNKNOWN (par preservado em core_comparison_pair)',
    'core NONE ou ausente': 'NOT_AVAILABLE',
  },
  not_in_v1: ['direcao final de trade', 'precedencia Core x Jev', 'pesos', 'regra de conviction', 'probabilidade', 'gate operacional'],
};
const ALLOWED_OUT = ['jev_market_state', 'jev_directional_context', 'native_dealer_state', 'native_directional_context', 'spx_final_context',
  'evidence_families', 'conflicts', 'data_quality', 'reason_codes', 'source_contributions', 'unresolved_fields', 'menthorq',
  'conviction', 'core_comparison', 'core_comparison_pair', 'versions'];
const extra = Object.keys(output.shape).filter(k => !ALLOWED_OUT.includes(k));
const missing = ALLOWED_OUT.filter(k => !(k in output.shape));
if (extra.length || missing.length) throw new Error('output shape fora do contrato: extra=' + extra + ' missing=' + missing);
wr('jev-output-contract-v1.json', output);

wr('jev-decision-logic-v1.json', {
  _meta: { ...META, schema: 'jev-future/decision-logic/v1', history: 'Previous draft superseded; non-canonical Core-dominant rules removed.' },
  roles: {
    FUTURES_CORE: 'SEPARATE_DETERMINISTIC_SYSTEM (nao substituido nem reimplementado pelo Jev)',
    JEV: 'SEPARATE_MARKET_STATE_CONFLUENCE_CLASSIFIER',
    MENTHORQ: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING (excecao explicita; nao se estende a outras fontes)',
    TRACE: 'FINAL_DECISION_CONTEXT_LAYER, market_origin=SPX', VOLSIGNALS: 'FINAL_DECISION_CONTEXT_LAYER, market_origin=SPX',
  },
  stages: [
    { id: 'A_FUTURES_CORE', owner: 'Futures Core (externo)', fields: 0, output_to_jev: 'nenhum; o Jev so recebe o lado do Core para core_comparison' },
    { id: 'B_JEV_NATIVE_DEALER_ANALYSIS', sources: ['AlfaOmegaNetGex0DTE', 'AlfaOmegaDexGexFlow', 'AlfaOmegaClassic', 'AlfaOmegaState'], fields: nB, output: ['native_dealer_state', 'native_directional_context'] },
    { id: 'C_SPX_FINAL_CONTEXT', sources: ['SpotGamma TRACE', 'VolSignals'], market_origin: 'SPX', fields: nC, after: 'B', output: ['spx_final_context', 'jev_directional_context'] },
    { id: 'D_MENTHORQ', policy: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING', fields_overlay: summary.menthorq_overlay_fields, note: 'campos MenthorQ vem no bloco levels da raiz; sao roteados em B com overlay de politica' },
  ],
  final_trade_direction: 'NOT_DEFINED',
  policies: {
    MENTHORQ: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING (unica politica funcional definida)',
    DATA_QUALITY: 'CLASSIFICATION INPUT; sem regra operacional automatica',
    CORE_vs_JEV_FUSION_POLICY: 'UNDEFINED / TO_BE_PREREGISTERED',
    CORE_vs_JEV_CONFLICT_POLICY: 'UNDEFINED / TO_BE_PREREGISTERED',
    PRECEDENCE: 'NOT_DEFINED',
    NO_TRADE_POLICY: 'NOT_PREMATURELY_FIXED (regra operacional futura, pre-registro proprio)',
    CONVICTION: 'UNCALIBRATED (sem pesos, incrementos ou decrementos)',
    JEV_CLASSIFICATION_CRITERIA: 'TO_BE_PREREGISTERED',
    POSSIBLE_CONTRIBUTION_AREAS: 'PROVISIONAL_DESIGN_MAPPING (proposto pelo Claude Code; nao validado; uso para classificacao direcional so com pre-registro explicito)',
    VALIDATION_HISTORY_TARGET: 'NON_BLOCKING (20-40 pregoes = alvo de evidencia futura; nao e gate de arquitetura, blocker de design nem condicao de fechamento de fase; coleta so com ordem explicita)',
  },
  summary,
});

// ---- guarda de residuos da versao superada (artefatos gerados + documento) ----
const RESIDUE = [/final_direction/, /conviction_band/, /\+1 n[ií]vel/, /-1 n[ií]vel/, /−1 n[ií]vel/, /FUTURES_NO_SIDE/,
  /OUTSIDE_RTH\s*->\s*NO_TRADE/, /FUTURES_CORE_ABSENT\s*->\s*NO_TRADE/, /FUTURES_CORE_STALE\s*->\s*NO_TRADE/,
  /futures_side/, /can_originate_side/, /can_veto/, /\bWEAK\b/, /\bSTRONG\b/, /n_support/, /n_contradict/,
  /JEV_AGREES/, /JEV_SIDE_DISAGREEMENT/, /H_CONTEXT_CONFLICT_NO_TRADE/, /context_alignment/, /só L1/];
const SCAN = ['data/jev-decision-logic-v1.json', 'data/jev-analysis-routes-v1.json', 'data/jev-evidence-families-v1.json',
  'data/jev-output-contract-v1.json', 'JEV_DECISION_LOGIC_V1_20260923.md'];
const hits = [];
for (const f of SCAN) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const re of RESIDUE) if (re.test(t)) hits.push(f + ' :: ' + re);
}
if (hits.length) { console.error('RESIDUAL GUARD FAIL\n' + hits.join('\n')); process.exit(2); }
console.log('RESIDUAL GUARD PASS (' + SCAN.length + ' arquivos, ' + RESIDUE.length + ' padroes)');
console.log(JSON.stringify(summary));
