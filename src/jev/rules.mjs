// Motor de regras: o conjunto de regras vem de data/jev-preregistered-rules-v1.json (nao e hardcoded aqui).
// Este modulo so liga cada regra ATIVA ao seu avaliador (SUPPORTED_SEMANTIC) ou ao ponto de aplicacao (CANONICAL_STRUCTURAL)
// e verifica, no arranque, que nenhuma regra inativa tem avaliador e que toda regra ativa tem um.
import { JevFatalError, ACTIVE_STATUSES } from './artifacts.mjs';
import * as N from './native.mjs';
import * as C from './spx.mjs';

// ordem de avaliacao respeita R_S01: nativo antes de C; transicoes depois dos descritores
export const EVALUATORS = {
  R_M01_REGIME_0DTE: N.R_M01, R_M02_REGIME_NEXT_FULL: N.R_M02, R_M03_LOCATION_DESCRIPTORS: N.R_M03, R_M04_STRIKE_STRUCTURE: N.R_M04,
  R_M08_DEX_PUT_CALL_RATIO: N.R_M08, R_M05_REGIME_TRANSITION: N.R_M05, R_M06_LEVEL_TRANSITION: N.R_M06, R_M07_NET_SIGN_CHANGE_OBSERVED: N.R_M07,
  R_M09_TRACE_REGIME_COMPARE: C.R_M09, R_M10_TRACE_PARTICIPANTS_ENRICH: C.R_M10,
};
export const STAGE_B_ORDER = ['R_M01_REGIME_0DTE', 'R_M02_REGIME_NEXT_FULL', 'R_M03_LOCATION_DESCRIPTORS', 'R_M04_STRIKE_STRUCTURE', 'R_M08_DEX_PUT_CALL_RATIO', 'R_M05_REGIME_TRANSITION', 'R_M06_LEVEL_TRANSITION', 'R_M07_NET_SIGN_CHANGE_OBSERVED'];
export const STAGE_C_ORDER = ['R_M09_TRACE_REGIME_COMPARE', 'R_M10_TRACE_PARTICIPANTS_ENRICH'];

// onde cada regra estrutural e aplicada no runtime
export const STRUCTURAL_ENFORCEMENT = {
  R_S01_STAGE_ORDER: 'engine: DQ -> normalize -> familias -> nativo (B) -> contexto nativo -> SPX (C) -> contexto Jev -> MenthorQ -> core_comparison',
  R_S02_FULL_COVERAGE_NOT_VOTES: 'artifacts: 190 campos/rotas, is_vote=false; normalize cobre os 190; nenhuma contagem vira decisao',
  R_S03_FAMILY_LINEAGE: 'evidence: CONSOLIDATED = 1 evidencia; separadas = independencia NAO presumida; concordancia nao reforca',
  R_S04_NO_SIMPLE_COUNTING: 'classifier: nenhuma contagem de campos/familias entra na decisao nem em reason_codes',
  R_S05_MARKET_ORIGIN: 'artifacts + output: origem preservada; SPY nao soma com SPX; nunca ES_NATIVE',
  R_S06_NO_NUMERIC_EQUIVALENCE: 'spx: TRACE x VolSignals separados; numeric_equivalence_allowed=false',
  R_S07_BREAK_0909: 'native: transicoes so entre snapshots do mesmo lado de 09/09',
  R_S08_FRESHNESS_BASIS: 'quality: vendor timestamp; limiares PROVISIONAL do contrato; FROZEN_VALUES fora',
  R_S09_DATA_INVALID_TO_UNKNOWN: 'classifier: DATA_INVALID => UNKNOWN + RC_DATA_INVALID (nunca NO_TRADE_CONTEXT)',
  R_S10_DQ_STATUS_DEFINITION: 'quality: disponibilidade por dimensao; DATA_INVALID so sem dimensao dealer utilizavel',
  R_S11_SESSION_INFORMATIONAL: 'quality: OUTSIDE_RTH => MARKET_CLOSED; nenhuma regra deriva de sessao',
  R_S12_REGIME_IS_NOT_SIDE: 'native: regime com direction 0',
  R_S13_LOCATION_IS_NOT_SIDE: 'native: location com direction 0',
  R_S14_UNKNOWN_SEMANTICS_NO_SIDE: 'output: campos semantica UNKNOWN => unresolved_fields',
  R_S15_ACTIVE_RULES_ONLY: 'rules: so CANONICAL_STRUCTURAL/SUPPORTED_SEMANTIC tem avaliador; HT/BLOCKED/DIAGNOSTIC excluidas',
  R_S16_CONTEXT_STATE_DEFINITIONS: 'classifier: maquina de estados carregada do artefato',
  R_S17_C_AFTER_B_NO_FUSION: 'classifier: jev_directional_context = native_directional_context; efeito de C so registrado',
  R_S18_EFFECT_LABEL_SELECTION: 'spx: efeito por (fonte, dimensao); escalar so sem perda; sem MIXED; misto nunca vira CONFLICTED',
  R_S19_MENTHORQ_OVERLAY: 'overlay: POSITIVE|ZERO; alinhamento indefinido => ZERO; nunca bloqueia',
  R_S20_EXPLAINABILITY: 'output: evidence_families, source_contributions, reason_codes; conviction UNCALIBRATED',
  R_S21_CORE_SEPARATE: 'output: Core so em core_comparison, sem efeito operacional',
};

const EXCLUSION = {
  HYPOTHESIS_TO_TEST: 'EXCLUDED_FROM_RECORD: HYPOTHESIS_TO_TEST so no braco de pesquisa (NOT IMPLEMENTED) (R_S15)',
  BLOCKED_BY_UNKNOWN_SEMANTICS: 'EXCLUDED: BLOCKED_BY_UNKNOWN_SEMANTICS; leitura UNRESOLVED (R_S14/R_S15)',
  DIAGNOSTIC_ONLY: 'EXCLUDED_FROM_DECISION: DIAGNOSTIC_ONLY (so qualidade/diagnostico)',
};

export function buildRuleEngine(art) {
  const rules = art.rules.rules;
  const byId = Object.fromEntries(rules.map((r) => [r.rule_id, r]));
  for (const id of [...Object.keys(EVALUATORS), ...Object.keys(STRUCTURAL_ENFORCEMENT)]) {
    const r = byId[id];
    if (!r) throw new JevFatalError('avaliador para regra inexistente: ' + id);
    if (!ACTIVE_STATUSES.includes(r.status)) throw new JevFatalError(`avaliador ligado a regra inativa ${id} (${r.status})`);
  }
  for (const r of rules) {
    if (r.status === 'SUPPORTED_SEMANTIC' && !EVALUATORS[r.rule_id]) throw new JevFatalError('regra SUPPORTED sem avaliador: ' + r.rule_id);
    if (r.status === 'CANONICAL_STRUCTURAL' && !STRUCTURAL_ENFORCEMENT[r.rule_id]) throw new JevFatalError('regra estrutural sem ponto de aplicacao: ' + r.rule_id);
    if (EVALUATORS[r.rule_id] && r.emits_side) throw new JevFatalError('avaliador de regra que emite lado: ' + r.rule_id);
  }
  const activeSideRules = rules.filter((r) => ACTIVE_STATUSES.includes(r.status) && r.emits_side).map((r) => r.rule_id);
  const dispositions = rules.map((r) => ({
    rule_id: r.rule_id, status: r.status,
    disposition: EVALUATORS[r.rule_id] ? 'EVALUATED' : STRUCTURAL_ENFORCEMENT[r.rule_id] ? 'ENFORCED_STRUCTURAL' : 'EXCLUDED',
    detail: EVALUATORS[r.rule_id] ? 'SUPPORTED_SEMANTIC (descritiva; direction 0)' : STRUCTURAL_ENFORCEMENT[r.rule_id] || EXCLUSION[r.status],
  }));
  return { byId, activeSideRules, dispositions };
}
