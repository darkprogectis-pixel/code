// Gera os artefatos de maquina do PRE-REGISTRO DESIGN V1 do Jev (classificacao propria; sem teste, sem runtime):
//   data/jev-preregistered-rules-v1.json          — regras (7 campos obrigatorios + status) e cobertura 190/190
//   data/jev-classification-state-machine-v1.json — ordem interna e maquina de estados do jev_directional_context
//   data/jev-hypotheses-register-v1.json          — hipoteses a testar + caminhos de desbloqueio
//   data/jev-provisional-mappings-v1.json         — dimension -> possible_contribution_areas (PROVISIONAL_DESIGN_MAPPING)
// Deterministico. Falha se: cobertura != 190/190; regra sem campo obrigatorio ou com status fora do enum;
// regra ATIVA emitindo lado; regra ATIVA com pre-condicao semantica nao atendida; familia DC inexistente;
// campo do estagio C com origem != SPX; contagem simples em regra; mapeamento provisorio divergente das rotas.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const wr = (f, o) => fs.writeFileSync(path.join(ROOT, 'data', f), JSON.stringify(o, null, 2) + '\n');
const fc = rd('jev-feature-contract-v1.json');
const dc = rd('jev-double-counting-groups-v1.json');
const rt = rd('jev-analysis-routes-v1.json');
const META = {
  project: 'ALFA OMEGA JEV FUTURE', version: 'v1', date: '2026-09-23', status: 'PREREGISTRATION DESIGN — NOT A TEST',
  doc: 'JEV_PREREGISTRATION_DESIGN_V1_20260923.md', implementation: 'NONE', runtime: 'NONE', data_collection: 'NONE',
  validation: 'NOT STARTED', validation_history_target: 'NON_BLOCKING (20-40 pregoes = alvo de evidencia futura; nao e gate nem condicao de fase)',
  production: 'UNCHANGED', f5: 'NOT PERFORMED', core_vs_jev_fusion: 'UNDEFINED', core_vs_jev_conflict: 'UNDEFINED', precedence: 'NOT_DEFINED',
};

const STATUS = ['CANONICAL_STRUCTURAL', 'SUPPORTED_SEMANTIC', 'HYPOTHESIS_TO_TEST', 'BLOCKED_BY_UNKNOWN_SEMANTICS', 'DIAGNOSTIC_ONLY'];
const ACTIVE = new Set(['CANONICAL_STRUCTURAL', 'SUPPORTED_SEMANTIC']);
const REQ = ['rule_id', 'description', 'input_families', 'required_quality', 'semantic_preconditions', 'output_effect', 'status'];

// ---- pre-condicoes semanticas (estado atual; MET so com evidencia ja registrada nos contratos/auditorias) ----
const SP = {
  SP_GEX_SIGN_IS_REGIME: { state: 'MET', evidence: 'vendor: GEX = regime, nao direcao; gamma_condition ≡ sign(gex.net_0dte) 100% desde 13/07 (auditoria A-BOT)' },
  SP_ZERO_GAMMA_LEVEL: { state: 'MET', evidence: 'zero_gamma unit CONFIRMED (escala ES_SPX)' },
  SP_LEVEL_SCALE_ES_SPX: { state: 'MET', evidence: 'ES_SPX = ESZ6 front ±1,3 pt vs NT8 .ncd; so pos-09/09' },
  SP_MAJORS_UNITS: { state: 'MET', evidence: 'majors 0DTE/next/full unit CONFIRMED' },
  SP_MAJORS_IDENTITY_RTH: { state: 'PARTIAL', evidence: 'identidades medidas so pos-fechamento (24/09); confirmar em RTH' },
  SP_ZERO_MPUT_SEMANTICS: { state: 'UNMET', evidence: '"put support" acima do spot 67% de 23/09' },
  SP_DEX_SIGN_CONVENTION: { state: 'UNMET', evidence: 'unit UNKNOWN; perspectiva dealer x cliente nao documentada; so pc_oi (razao) confirmado' },
  SP_GREEK_SIGN_CONVENTION: { state: 'UNMET', evidence: 'feature contract §6: convencao de sinal das gregas (vanna/charm/state por strike) UNKNOWN' },
  SP_PRIORS_SPACING: { state: 'UNMET', evidence: 'priors/max_priors: espacamento temporal e semantica UNKNOWN' },
  SP_CVR_OFLOW_SEMANTICS: { state: 'UNMET', evidence: 'cvr/oflow sem documentacao do vendor' },
  SP_RISK_REVERSAL_SEMANTICS: { state: 'UNMET', evidence: 'delta_risk_reversal / ivol: semantica e unidade UNKNOWN' },
  SP_TRACE_MM_GAMMA_SIGN: { state: 'MET', evidence: 'SpotGamma TRACE User Guide: gamma do market maker por preco' },
  SP_TRACE_DELTA_PRESSURE_LINK: { state: 'UNMET', evidence: 'OPTIONAL_EVIDENCE_GAP: vinculo ao endpoint real nao capturado' },
  SP_VOLSIGNALS_UNITS: { state: 'UNMET', evidence: '7 unidades UNKNOWN => numeric_equivalence_allowed=false' },
  SP_VOLSIGNALS_GAMMA_SIGN: { state: 'UNMET', evidence: 'gammaExposure "Simulated": convencao de sinal nao documentada' },
  SP_MENTHORQ_ALIGNMENT_DEF: { state: 'UNMET', evidence: 'como niveis MenthorQ definem "alinhado" a um contexto do Jev nao esta definido' },
  SP_SPY_INDEPENDENCE: { state: 'UNMET', evidence: 'SPX x SPY: medir antes de somar' },
  SP_NO_TRADE_CRITERIA: { state: 'UNDEFINED', evidence: 'sem criterio conceitual defensavel registrado' },
};

// ---- regras ----
// origin: CANON_EXISTING = ja decidido em contrato/decisao anterior; THIS_DESIGN = proposto aqui, estrutural, vale ao ser aprovado.
const R = [];
const rule = o => R.push(o);
const ALLQ = 'qualquer (a regra trata a propria qualidade)';

// ===== CANONICAL_STRUCTURAL =====
rule({ rule_id: 'R_S01_STAGE_ORDER', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'ALL', emits_side: false,
  description: 'Ordem interna fixa: DATA QUALITY -> 4-SOURCE NATIVE DEALER ANALYSIS -> EVIDENCE FAMILIES/LINEAGE -> NATIVE DEALER STATE -> SPX FINAL CONTEXT (TRACE + VolSignals) -> JEV DIRECTIONAL CONTEXT; MenthorQ = overlay separado depois do contexto.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'define a sequencia; nenhuma etapa le saida de etapa posterior' });
rule({ rule_id: 'R_S02_FULL_COVERAGE_NOT_VOTES', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'B+C', emits_side: false,
  description: '190/190 campos analisados (174 das 4 fontes + 16 SPX final context); nenhum descartado; 190 campos != 190 votos (is_vote=false).',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'todo campo tem rota e familia; nenhum campo vira voto' });
rule({ rule_id: 'R_S03_FAMILY_LINEAGE', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'EVIDENCE_FAMILIES', emits_side: false,
  description: 'Leituras sao atribuidas a evidence families: CONFIRMED/BY_CONSTRUCTION consolidam em 1; SUSPECTED, UNVERIFIED e PARTIAL_ANALOG ficam separadas com overlap_risk; leituras concordantes de familias com overlap_risk nunca se reforcam; count_as 0 = NON_EVIDENCE.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'evidence_families[] com kind e overlap_risk' });
rule({ rule_id: 'R_S04_NO_SIMPLE_COUNTING', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'ALL', emits_side: false,
  description: 'Proibido como decisao: majority vote, X/9, suporte > contradicao, quantidade bruta de campos ou de familias. A classificacao respeita papel semantico, lineage, qualidade, independencia, market origin e semantica UNKNOWN.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'nenhuma contagem entra em reason_codes como justificativa' });
rule({ rule_id: 'R_S05_MARKET_ORIGIN', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'B+C', emits_side: false,
  description: 'As 4 fontes A-Bot e TRACE/VolSignals tem market_origin=SPX (ES_SPX e so a escala do vendor); nunca ES_NATIVE. SPY = market_origin SPY, instancia separada, sem soma com SPX antes de medir independencia.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'market_origin preservado em source_contributions' });
rule({ rule_id: 'R_S06_NO_NUMERIC_EQUIVALENCE', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'C', emits_side: false,
  description: 'TRACE e VolSignals sao namespaces separados; gamma = PARTIAL_ANALOG; os outros 6 = INSUFFICIENT_INFORMATION; unidade UNKNOWN => equivalencia numerica NOT ALLOWED; sem fusao, sem normalizacao.',
  input_families: ['DC_SPX_FINAL_GAMMA', 'DC_SPX_TRACE_PARTICIPANTS', 'DC_SPX_TRACE_DELTA', 'DC_SPX_TRACE_CHARM', 'DC_SPX_VOLSIGNALS_CHARM', 'DC_SPX_VOLSIGNALS_DELTACHANGE', 'DC_SPX_VOLSIGNALS_DELTATOTAL', 'DC_SPX_VOLSIGNALS_VANNA', 'DC_SPX_VOLSIGNALS_VOLGA', 'DC_SPX_VOLSIGNALS_DELTADIFF'],
  required_quality: ALLQ, semantic_preconditions: [], output_effect: 'spx_final_context.numeric_equivalence_allowed=false' });
rule({ rule_id: 'R_S07_BREAK_0909', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'ALL', emits_side: false,
  description: 'Quebra de 09/09 (GexBot->GammaGex; SPX cru -> ESZ6): leituras, historicos e comparacoes nunca misturam antes x depois.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'dado pre-09/09 fora de qualquer comparacao com pos-09/09' });
rule({ rule_id: 'R_S08_FRESHNESS_BASIS', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'DATA_QUALITY', emits_side: false,
  description: 'Freshness pelo vendor timestamp; arrival nunca e base; limiares 60 s (orderflow) e 300 s (classic/state) = PROVISIONAL, nao finais; FROZEN_VALUES (ex.: iv30d) fora da leitura. Freshness e RTH = CLASSIFICATION INPUT, nao gate de trade.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'data_quality.per_source.freshness_state (FRESH|STALE|FROZEN|FROZEN_VALUES|MARKET_CLOSED|UNKNOWN)' });
rule({ rule_id: 'R_S09_DATA_INVALID_TO_UNKNOWN', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'DATA_QUALITY', emits_side: false,
  description: 'data_quality.status = DATA_INVALID => jev_directional_context = UNKNOWN com reason DATA_INVALID (nunca NO_TRADE_CONTEXT).',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'UNKNOWN + RC_DATA_INVALID' });
rule({ rule_id: 'R_S10_DQ_STATUS_DEFINITION', status: 'CANONICAL_STRUCTURAL', origin: 'THIS_DESIGN', stage: 'DATA_QUALITY', emits_side: false,
  description: 'DATA_INVALID: sem referencia de preco utilizavel OU nenhum membro da familia de regime 0DTE (DC_GEX0_SIGN / DC_ZERO_GAMMA_0DTE) com freshness FRESH ou MARKET_CLOSED. DEGRADED: dado valido, mas alguma familia com leitura ativa esta STALE/UNKNOWN/PENDING_REVISION_AUDIT ou so parcial. VALID: demais casos. Sem threshold numerico novo (usa os PROVISIONAL de R_S08).',
  input_families: ['DC_SPOT_PRICE', 'DC_GEX0_SIGN', 'DC_ZERO_GAMMA_0DTE'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'data_quality.status VALID|DEGRADED|DATA_INVALID' });
rule({ rule_id: 'R_S11_SESSION_INFORMATIONAL', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'DATA_QUALITY', emits_side: false,
  description: 'Sessao RTH / OUTSIDE_RTH so informativa; fora do RTH o estado de freshness e MARKET_CLOSED, nao STALE; nenhuma regra automatica deriva de sessao.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'data_quality.session' });
rule({ rule_id: 'R_S12_REGIME_IS_NOT_SIDE', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Regime e regime: POSITIVE_GAMMA nao implica LONG, NEGATIVE_GAMMA nao implica SHORT. GEX/zero gamma nunca viram BUY/SELL por sinal.',
  input_families: ['DC_GEX0_SIGN', 'DC_GEX_NEXT', 'DC_ZERO_GAMMA_0DTE', 'DC_ZERO_GAMMA_NEXT', 'DC_ZERO_GAMMA_FULL', 'DC_SPX_FINAL_GAMMA'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'leituras de regime com direction = 0' });
rule({ rule_id: 'R_S13_LOCATION_IS_NOT_SIDE', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Distancia/posicao do preco relativa a niveis nunca vira LONG/SHORT automaticamente.',
  input_families: ['DC_MAJORS_0DTE', 'DC_MAJORS_NEXT', 'DC_MAJORS_FULL', 'DC_ZERO_GAMMA_0DTE', 'DC_ZERO_GAMMA_NEXT', 'DC_ZERO_GAMMA_FULL', 'DC_CLASSIC_GEX_PROFILE_ZERO', 'DC_CLASSIC_GEX_PROFILE_NEXT', 'DC_CLASSIC_GEX_PROFILE_FULL', 'DC_STATE_GEX_PROFILE_FULL', 'DC_MENTHORQ_LEVELS'],
  required_quality: ALLQ, semantic_preconditions: [], output_effect: 'leituras de location com direction = 0' });
rule({ rule_id: 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Campo/familia com semantica, unidade ou convencao de sinal UNKNOWN nao produz lado: leitura UNRESOLVED, campo listado em unresolved_fields. Nao inventar polaridade.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'UNRESOLVED + unresolved_fields[]' });
rule({ rule_id: 'R_S15_ACTIVE_RULES_ONLY', status: 'CANONICAL_STRUCTURAL', origin: 'THIS_DESIGN', stage: 'NATIVE+FINAL_CONTEXT', emits_side: false,
  description: 'So regras com status CANONICAL_STRUCTURAL ou SUPPORTED_SEMANTIC entram no jev_directional_context de registro. HYPOTHESIS_TO_TEST so pode ser avaliada num braco de pesquisa rotulado, fora do contexto de registro, e so vira ativa por pre-registro de validacao + decisao do operador. BLOCKED e DIAGNOSTIC nunca entram.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'conjunto de regras ativas do contexto' });
rule({ rule_id: 'R_S16_CONTEXT_STATE_DEFINITIONS', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'NATIVE+FINAL_CONTEXT', emits_side: false,
  description: 'Definicoes do output contract, aplicadas so sobre leituras de lado de regras ativas: CONFLICTED_CONTEXT = familias com leituras opostas; LONG/SHORT_CONTEXT = todas as leituras de lado ativas no mesmo sentido (consistencia, nao contagem); NEUTRAL_CONTEXT = regras de lado avaliaveis sem inclinacao; UNKNOWN = dado valido sem regra de lado avaliavel; NO_TRADE_CONTEXT so por criterio pre-registrado (hoje UNDEFINED => nunca emitido).',
  input_families: ['ALL'], required_quality: 'data_quality.status != DATA_INVALID', semantic_preconditions: [], output_effect: 'native_directional_context e jev_directional_context' });
rule({ rule_id: 'R_S17_C_AFTER_B_NO_FUSION', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'SPX_FINAL_CONTEXT', emits_side: false,
  description: 'TRACE/VolSignals entram so depois do native dealer state. Nao ha regra de fusao B x C: jev_directional_context = native_directional_context, e o efeito de C fica registrado em spx_final_context.effect_on_native (CONFIRMS|CONTRADICTS|ENRICHES|NO_EFFECT|UNAVAILABLE), sem pesos.',
  input_families: ['DC_SPX_FINAL_GAMMA', 'DC_SPX_TRACE_PARTICIPANTS', 'DC_SPX_TRACE_DELTA', 'DC_SPX_TRACE_CHARM', 'DC_SPX_VOLSIGNALS_CHARM', 'DC_SPX_VOLSIGNALS_DELTACHANGE', 'DC_SPX_VOLSIGNALS_DELTATOTAL', 'DC_SPX_VOLSIGNALS_VANNA', 'DC_SPX_VOLSIGNALS_VOLGA', 'DC_SPX_VOLSIGNALS_DELTADIFF'],
  required_quality: ALLQ, semantic_preconditions: [], output_effect: 'spx_final_context.effect_on_native' });
rule({ rule_id: 'R_S18_EFFECT_LABEL_SELECTION', status: 'CANONICAL_STRUCTURAL', origin: 'THIS_DESIGN', stage: 'SPX_FINAL_CONTEXT', emits_side: false,
  description: 'Rotulo unico de effect_on_native: UNAVAILABLE se nenhuma leitura C utilizavel; senao CONTRADICTS se alguma leitura C comparavel contraria a leitura B da mesma dimensao; senao CONFIRMS se alguma concorda; senao ENRICHES se C so acrescenta informacao descritiva; senao NO_EFFECT. Comparavel = mesma dimensao e semantica MET; PARTIAL_ANALOG compara so sinal/posicao, nunca magnitude. A dimensao comparada vai em reason_codes.',
  input_families: ['DC_SPX_FINAL_GAMMA', 'DC_SPX_TRACE_PARTICIPANTS'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'effect_on_native + RC_SPX_<dimensao>_<efeito>' });
rule({ rule_id: 'R_S19_MENTHORQ_OVERLAY', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'MENTHORQ_OVERLAY', emits_side: false,
  description: 'MenthorQ = POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING: alinhado => POSITIVE; desalinhado, neutro, stale, offline, null => ZERO. Nunca origina lado, veta, gera NO_TRADE nem reduz conviction; nao altera jev_directional_context. Enquanto SP_MENTHORQ_ALIGNMENT_DEF = UNMET, confirmation = ZERO.',
  input_families: ['DC_MENTHORQ_LEVELS'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'menthorq.confirmation POSITIVE|ZERO' });
rule({ rule_id: 'R_S20_EXPLAINABILITY', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'OUTPUT', emits_side: false,
  description: 'Toda classificacao cita evidence_families, source_contributions e reason_codes; conviction = UNCALIBRATED.',
  input_families: ['ALL'], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'campos de explicacao do output contract' });
rule({ rule_id: 'R_S21_CORE_SEPARATE', status: 'CANONICAL_STRUCTURAL', origin: 'CANON_EXISTING', stage: 'OUTPUT', emits_side: false,
  description: 'Core e Jev separados: o lado do Core nao entra em nenhuma etapa da classificacao; so em core_comparison apos o contexto final. CORE_vs_JEV_FUSION_POLICY / CONFLICT_POLICY = UNDEFINED; PRECEDENCE = NOT_DEFINED.',
  input_families: [], required_quality: ALLQ, semantic_preconditions: [], output_effect: 'core_comparison (so comparacao)' });

// ===== SUPPORTED_SEMANTIC =====
rule({ rule_id: 'R_M01_REGIME_0DTE', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Regime 0DTE a partir da familia unica GEX0_SIGN x ZERO_GAMMA (1 familia, 2 leituras): (a) sinal de gex.net_0dte (≡ gamma_condition ≡ state sum_gex_vol) e (b) spot acima/abaixo de zero_gamma. (a) e (b) concordam => POSITIVE_GAMMA ou NEGATIVE_GAMMA; discordam => AMBIGUOUS; so uma utilizavel => essa, com DEGRADED; nenhuma => UNKNOWN. Sem banda perto de zero (threshold nao calibrado => nao aplicado).',
  input_families: ['DC_GEX0_SIGN', 'DC_ZERO_GAMMA_0DTE', 'DC_SPOT_PRICE'], required_quality: 'freshness FRESH ou MARKET_CLOSED; pos-09/09',
  semantic_preconditions: ['SP_GEX_SIGN_IS_REGIME', 'SP_ZERO_GAMMA_LEVEL', 'SP_LEVEL_SCALE_ES_SPX'], output_effect: 'native_dealer_state.gamma_regime = POSITIVE_GAMMA|NEGATIVE_GAMMA|AMBIGUOUS|UNKNOWN (direction 0)' });
rule({ rule_id: 'R_M02_REGIME_NEXT_FULL', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Mesma leitura para next expiry (gex.net_next, zero_gamma next) e full (zero_gamma full), cada uma em familia propria, reportadas lado a lado com o 0DTE; nunca fundidas nem somadas ao regime 0DTE.',
  input_families: ['DC_GEX_NEXT', 'DC_ZERO_GAMMA_NEXT', 'DC_ZERO_GAMMA_FULL', 'DC_SPOT_PRICE'], required_quality: 'freshness FRESH ou MARKET_CLOSED; pos-09/09',
  semantic_preconditions: ['SP_GEX_SIGN_IS_REGIME', 'SP_ZERO_GAMMA_LEVEL'], output_effect: 'native_dealer_state.gamma_regime.by_expiry {zero,next,full}' });
rule({ rule_id: 'R_M03_LOCATION_DESCRIPTORS', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Para cada nivel com unidade CONFIRMED (zero gamma, majors 0DTE/next/full de orderflow/classic/state, majors long/short gamma, next_exp_*): lado relativo ao spot (ABOVE|BELOW), distancia assinada em pontos e em %, ordenacao dos niveis, nivel mais proximo acima/abaixo e intervalo que contem o spot (BETWEEN a,b). zero_mput: descrito, marcado SEMANTIC_ANOMALY (ver B05). Sem tolerancia de "AT" (threshold nao calibrado).',
  input_families: ['DC_MAJORS_0DTE', 'DC_MAJORS_NEXT', 'DC_MAJORS_FULL', 'DC_ZERO_GAMMA_0DTE', 'DC_ZERO_GAMMA_NEXT', 'DC_ZERO_GAMMA_FULL', 'DC_SPOT_PRICE'],
  required_quality: 'freshness do nivel FRESH ou MARKET_CLOSED; mesma escala (pos-09/09)', semantic_preconditions: ['SP_MAJORS_UNITS', 'SP_LEVEL_SCALE_ES_SPX'],
  output_effect: 'native_dealer_state.structure_location (direction 0; identidades de majors PARTIAL => DC colapsa, sem reforco)' });
rule({ rule_id: 'R_M04_STRIKE_STRUCTURE', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Perfil por strike (classic strikes gex_vol/gex_oi, state gex_vol) descrito como estrutura: strike de maior |GEX| acima e abaixo do spot e sinal do GEX nesses strikes. O perfil e o agregado sum_gex_* sao a mesma familia. Classic x state no mesmo strike = construtos distintos, lidos separados.',
  input_families: ['DC_CLASSIC_GEX_PROFILE_ZERO', 'DC_CLASSIC_GEX_PROFILE_NEXT', 'DC_CLASSIC_GEX_PROFILE_FULL', 'DC_STATE_GEX_PROFILE_FULL', 'DC_GEX0_SIGN', 'DC_GEX_NEXT'],
  required_quality: 'freshness FRESH ou MARKET_CLOSED', semantic_preconditions: ['SP_GEX_SIGN_IS_REGIME', 'SP_LEVEL_SCALE_ES_SPX'],
  output_effect: 'native_dealer_state.structure_location.strike_structure (direction 0)' });
rule({ rule_id: 'R_M05_REGIME_TRANSITION', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'TRANSITION de regime por evento discreto entre snapshots consecutivos validos: troca de sinal de gex.net_0dte, ou spot cruzando zero_gamma, ou mudanca do rotulo R_M01. Sem threshold de magnitude.',
  input_families: ['DC_GEX0_SIGN', 'DC_ZERO_GAMMA_0DTE', 'DC_GEX_NEXT'], required_quality: 'os dois snapshots validos, mesmo lado de 09/09',
  semantic_preconditions: ['SP_GEX_SIGN_IS_REGIME', 'SP_ZERO_GAMMA_LEVEL'], output_effect: 'native_dealer_state.change_transition += REGIME_TRANSITION{from,to}; RC_REGIME_TRANSITION (direction 0)' });
rule({ rule_id: 'R_M06_LEVEL_TRANSITION', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'TRANSITION de estrutura por evento discreto: um nivel (major/zero gamma) muda de strike entre snapshots consecutivos da mesma categoria, ou a ordenacao dos niveis muda. Registra sentido da migracao (UP|DOWN) como descritor, nao como lado.',
  input_families: ['DC_MAJORS_0DTE', 'DC_MAJORS_NEXT', 'DC_MAJORS_FULL', 'DC_ZERO_GAMMA_0DTE', 'DC_ZERO_GAMMA_NEXT', 'DC_ZERO_GAMMA_FULL'],
  required_quality: 'os dois snapshots validos, mesmo lado de 09/09', semantic_preconditions: ['SP_MAJORS_UNITS', 'SP_LEVEL_SCALE_ES_SPX'],
  output_effect: 'native_dealer_state.change_transition += LEVEL_MIGRATION{level,from,to,UP|DOWN}; RC_LEVEL_MIGRATION (direction 0)' });
rule({ rule_id: 'R_M07_NET_SIGN_CHANGE_OBSERVED', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Troca de sinal observada em net values com semantica ainda UNKNOWN (dex.net_*, vanna/charm net_*) e registrada como CHANGE aritmetico; a interpretacao fica UNRESOLVED (ver HT01, B01).',
  input_families: ['DC_DEX_0DTE', 'DC_DEX_NEXT', 'DC_VANNA_0DTE', 'DC_VANNA_NEXT', 'DC_CHARM_0DTE', 'DC_CHARM_NEXT'], required_quality: 'os dois snapshots validos',
  semantic_preconditions: [], output_effect: 'native_dealer_state.change_transition += SIGN_CHANGE_OBSERVED{field} com interpretation UNRESOLVED' });
rule({ rule_id: 'R_M08_DEX_PUT_CALL_RATIO', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'pc_oi lido como |dex.net_put_0dte| / |dex.net_call_0dte| (razao de DEX, confirmada), nunca como OI; descritor de composicao, sem lado.',
  input_families: ['DC_DEX_0DTE'], required_quality: 'freshness FRESH ou MARKET_CLOSED', semantic_preconditions: [], output_effect: 'native_dealer_state.delta_positioning.put_call_dex_ratio (direction 0)' });
rule({ rule_id: 'R_M09_TRACE_REGIME_COMPARE', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'SPX_FINAL_CONTEXT', emits_side: false,
  description: 'TRACE gamma_mm no preco do spot (SPX; bin i so em t[i+1]) da o sinal do gamma do market maker; comparado so em SINAL com o regime nativo R_M01 => CONFIRMS/CONTRADICTS na dimensao GAMMA_REGIME. Nao altera o regime nativo nem produz lado. VolSignals gammaExposure fica fora (B09).',
  input_families: ['DC_SPX_FINAL_GAMMA'], required_quality: 'TRACE PENDING_REVISION_AUDIT => leitura DEGRADED ate a auditoria de revisao classificar; anti-lookahead do grid',
  semantic_preconditions: ['SP_TRACE_MM_GAMMA_SIGN'], output_effect: 'spx_final_context.trace.regime_reading + effect_on_native (dimensao GAMMA_REGIME)' });
rule({ rule_id: 'R_M10_TRACE_PARTICIPANTS_ENRICH', status: 'SUPPORTED_SEMANTIC', origin: 'THIS_DESIGN', stage: 'SPX_FINAL_CONTEXT', emits_side: false,
  description: 'TRACE gamma por participante (cust, procust, firm, bd) descrito como contexto; sem analogo nativo nem VolSignals => efeito ENRICHES; sem lado.',
  input_families: ['DC_SPX_TRACE_PARTICIPANTS'], required_quality: 'TRACE PENDING_REVISION_AUDIT => DEGRADED', semantic_preconditions: ['SP_TRACE_MM_GAMMA_SIGN'],
  output_effect: 'spx_final_context.trace.participants; effect ENRICHES' });

// ===== HYPOTHESIS_TO_TEST =====
const H = (o) => rule({ status: 'HYPOTHESIS_TO_TEST', origin: 'THIS_DESIGN', ...o });
H({ rule_id: 'HT01_DEX_DIRECTION_BY_REGIME', stage: 'NATIVE_DEALER_STATE', emits_side: true,
  description: 'DEX_DIRECTION_RULE: o sinal de dex.net_0dte, condicionado ao regime R_M01 (nao AMBIGUOUS), indica o lado do fluxo de hedge do dealer.',
  input_families: ['DC_DEX_0DTE', 'DC_GEX0_SIGN'], required_quality: 'FRESH; regime nao AMBIGUOUS', semantic_preconditions: ['SP_DEX_SIGN_CONVENTION', 'SP_GEX_SIGN_IS_REGIME'],
  output_effect: 'braco de pesquisa: leitura de lado LONG|SHORT da familia DEX; no registro: UNRESOLVED' });
H({ rule_id: 'HT02_POSITIVE_GAMMA_LEVEL_REVERSION', stage: 'NATIVE_DEALER_STATE', emits_side: true,
  description: 'Em POSITIVE_GAMMA, preco afastado do major/long-gamma 0DTE tende a voltar em direcao a ele (lado = sentido do nivel).',
  input_families: ['DC_MAJORS_0DTE', 'DC_ZERO_GAMMA_0DTE', 'DC_GEX0_SIGN', 'DC_SPOT_PRICE'], required_quality: 'FRESH; regime POSITIVE_GAMMA', semantic_preconditions: ['SP_MAJORS_IDENTITY_RTH', 'SP_MAJORS_UNITS'],
  output_effect: 'braco de pesquisa: leitura de lado da familia MAJORS_0DTE' });
H({ rule_id: 'HT03_NEGATIVE_GAMMA_LEVEL_CONTINUATION', stage: 'NATIVE_DEALER_STATE', emits_side: true,
  description: 'Em NEGATIVE_GAMMA, preco que atravessa o major short-gamma 0DTE tende a continuar no sentido do cruzamento.',
  input_families: ['DC_MAJORS_0DTE', 'DC_GEX0_SIGN', 'DC_SPOT_PRICE'], required_quality: 'FRESH; regime NEGATIVE_GAMMA', semantic_preconditions: ['SP_MAJORS_IDENTITY_RTH', 'SP_MAJORS_UNITS'],
  output_effect: 'braco de pesquisa: leitura de lado da familia MAJORS_0DTE' });
H({ rule_id: 'HT04_LEVEL_MIGRATION_SIDE', stage: 'NATIVE_DEALER_STATE', emits_side: true,
  description: 'LEVEL_MIGRATION intradia (R_M06) dos majors 0DTE no sentido UP/DOWN antecede movimento do ES no mesmo sentido.',
  input_families: ['DC_MAJORS_0DTE'], required_quality: 'snapshots validos consecutivos', semantic_preconditions: ['SP_MAJORS_IDENTITY_RTH'],
  output_effect: 'braco de pesquisa: leitura de lado da familia MAJORS_0DTE' });
H({ rule_id: 'HT05_REGIME_AMPLITUDE', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'O regime R_M01 prediz amplitude (|retorno|), nao lado: NEGATIVE_GAMMA > POSITIVE_GAMMA.',
  input_families: ['DC_GEX0_SIGN', 'DC_ZERO_GAMMA_0DTE'], required_quality: 'FRESH', semantic_preconditions: ['SP_GEX_SIGN_IS_REGIME'],
  output_effect: 'contexto de amplitude; nenhum efeito em lado' });
H({ rule_id: 'HT06_SPX_CONTRADICTS_EFFECT', stage: 'SPX_FINAL_CONTEXT', emits_side: false,
  description: 'Se effect_on_native = CONTRADICTS numa dimensao que sustenta uma leitura de lado, o contexto final deveria ser (V_A) CONFLICTED_CONTEXT ou (V_B) mantido com anotacao. Hoje: nenhuma, por R_S17.',
  input_families: ['DC_SPX_FINAL_GAMMA', 'DC_SPX_TRACE_PARTICIPANTS'], required_quality: 'TRACE com auditoria de revisao classificada', semantic_preconditions: ['SP_TRACE_MM_GAMMA_SIGN'],
  output_effect: 'braco de pesquisa: variantes V_A/V_B do jev_directional_context' });
H({ rule_id: 'HT07_TRACE_REGIME_AGREEMENT_RELIABILITY', stage: 'SPX_FINAL_CONTEXT', emits_side: false,
  description: 'Quando o regime nativo e o TRACE concordam (R_M09 CONFIRMS), a leitura de regime e mais informativa para amplitude do que quando discordam.',
  input_families: ['DC_SPX_FINAL_GAMMA', 'DC_GEX0_SIGN'], required_quality: 'TRACE com auditoria de revisao classificada', semantic_preconditions: ['SP_TRACE_MM_GAMMA_SIGN', 'SP_GEX_SIGN_IS_REGIME'],
  output_effect: 'contexto de amplitude; nenhum efeito em lado' });
H({ rule_id: 'HT08_EXPIRY_REGIME_DIVERGENCE', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Regime 0DTE e regime next em sinais opostos (R_M02) caracteriza estado AMBIGUOUS mais amplo do que o 0DTE sozinho.',
  input_families: ['DC_GEX0_SIGN', 'DC_GEX_NEXT'], required_quality: 'FRESH', semantic_preconditions: ['SP_GEX_SIGN_IS_REGIME'],
  output_effect: 'braco de pesquisa: variante do rotulo de regime' });
H({ rule_id: 'HT09_MENTHORQ_ALIGNMENT_DEFINITION', stage: 'MENTHORQ_OVERLAY', emits_side: false,
  description: 'Definicao de "alinhado" entre niveis MenthorQ e um jev_directional_context LONG/SHORT (efeito so POSITIVE|ZERO).',
  input_families: ['DC_MENTHORQ_LEVELS'], required_quality: 'MenthorQ nao null (hoje 401 => null)', semantic_preconditions: ['SP_MENTHORQ_ALIGNMENT_DEF'],
  output_effect: 'menthorq.confirmation POSITIVE|ZERO (nunca negativo)' });
H({ rule_id: 'HT10_SPY_INSTANCE_ROLE', stage: 'NATIVE_DEALER_STATE', emits_side: false,
  description: 'Instancias SPY (market_origin SPY) trazem informacao independente das SPX; so depois de medido podem formar familia propria.',
  input_families: ['DC_MAJORS_0DTE', 'DC_CLASSIC_GEX_PROFILE_ZERO'], required_quality: 'SPY classic capturado', semantic_preconditions: ['SP_SPY_INDEPENDENCE'],
  output_effect: 'lineage SPY x SPX' });

// ===== BLOCKED_BY_UNKNOWN_SEMANTICS =====
const B = (o) => rule({ status: 'BLOCKED_BY_UNKNOWN_SEMANTICS', origin: 'THIS_DESIGN', emits_side: false, required_quality: ALLQ, ...o });
B({ rule_id: 'B01_SECOND_ORDER_DIRECTION', stage: 'NATIVE_DEALER_STATE', description: 'Vanna/charm (net 0DTE/next e state por strike) como lado: convencao de sinal UNKNOWN.',
  input_families: ['DC_VANNA_0DTE', 'DC_VANNA_NEXT', 'DC_CHARM_0DTE', 'DC_CHARM_NEXT'], semantic_preconditions: ['SP_GREEK_SIGN_CONVENTION'], output_effect: 'second_order_flows = UNRESOLVED; unresolved_fields' });
B({ rule_id: 'B02_STATE_GREEK_PER_STRIKE_DIRECTION', stage: 'NATIVE_DEALER_STATE', description: 'Gamma/delta por strike do state (mini_contracts greek_value) como lado ou ΔDelta_dealer: sinal UNKNOWN.',
  input_families: ['DC_GEX0_SIGN', 'DC_DEX_0DTE'], semantic_preconditions: ['SP_GREEK_SIGN_CONVENTION'], output_effect: 'UNRESOLVED; unresolved_fields' });
B({ rule_id: 'B03_CVR_OFLOW', stage: 'NATIVE_DEALER_STATE', description: 'cvr/oflow (8 campos): semantica nao documentada.',
  input_families: ['DC_OFLOW_CVR_UNKNOWN'], semantic_preconditions: ['SP_CVR_OFLOW_SEMANTICS'], output_effect: 'flow_unknown_semantics = UNRESOLVED' });
B({ rule_id: 'B04_PRIORS_TIME_INTERPRETATION', stage: 'NATIVE_DEALER_STATE', description: 'priors[] e max_priors[] como serie temporal (mudanca, velocidade, TRANSITION): espacamento e semantica UNKNOWN; so "valor difere" e descritivo.',
  input_families: ['DC_CLASSIC_GEX_PROFILE_ZERO', 'DC_CLASSIC_GEX_PROFILE_NEXT', 'DC_CLASSIC_GEX_PROFILE_FULL', 'DC_STATE_GEX_PROFILE_FULL', 'DC_GEX0_SIGN'], semantic_preconditions: ['SP_PRIORS_SPACING'], output_effect: 'change_transition.priors = UNRESOLVED' });
B({ rule_id: 'B05_ZERO_MPUT_SEMANTICS', stage: 'NATIVE_DEALER_STATE', description: 'zero_mput ("put support") como suporte: acima do spot 67% de 23/09 => so LOCATION neutra com SEMANTIC_ANOMALY.',
  input_families: ['DC_MAJORS_0DTE'], semantic_preconditions: ['SP_ZERO_MPUT_SEMANTICS'], output_effect: 'zero_mput sem papel de suporte/resistencia' });
B({ rule_id: 'B06_VOL_SKEW_DIRECTION', stage: 'NATIVE_DEALER_STATE', description: 'delta_risk_reversal e call/put ivol como lado ou regime de vol: semantica/unidade UNKNOWN.',
  input_families: ['DC_RISK_REVERSAL', 'DC_STATE_IVOL'], semantic_preconditions: ['SP_RISK_REVERSAL_SEMANTICS'], output_effect: 'vol_skew = UNRESOLVED' });
B({ rule_id: 'B07_TRACE_DELTA_CHARM_PRESSURE', stage: 'SPX_FINAL_CONTEXT', description: 'TRACE Delta/Charm Pressure: vendor diz que Delta Pressure so tem lado com regime definido, mas o vinculo ao endpoint real e body/formula/unidade nao foram capturados (INSUFFICIENT_INFORMATION).',
  input_families: ['DC_SPX_TRACE_DELTA', 'DC_SPX_TRACE_CHARM'], semantic_preconditions: ['SP_TRACE_DELTA_PRESSURE_LINK'], output_effect: 'effect UNAVAILABLE para essas familias' });
B({ rule_id: 'B08_VOLSIGNALS_EXPOSURES', stage: 'SPX_FINAL_CONTEXT', description: 'VolSignals charm/deltaChange/deltaTotal/vanna/volga/deltaExposureDiff: INSUFFICIENT_INFORMATION; unidade UNKNOWN; deltaExposureDiff = 0 em 3678/3678, funcao UNKNOWN.',
  input_families: ['DC_SPX_VOLSIGNALS_CHARM', 'DC_SPX_VOLSIGNALS_DELTACHANGE', 'DC_SPX_VOLSIGNALS_DELTATOTAL', 'DC_SPX_VOLSIGNALS_VANNA', 'DC_SPX_VOLSIGNALS_VOLGA', 'DC_SPX_VOLSIGNALS_DELTADIFF'], semantic_preconditions: ['SP_VOLSIGNALS_UNITS'], output_effect: 'effect UNAVAILABLE ou ENRICHES (so presenca), nunca CONFIRMS/CONTRADICTS' });
B({ rule_id: 'B09_VOLSIGNALS_GAMMA_REGIME', stage: 'SPX_FINAL_CONTEXT', description: 'VolSignals gammaExposure ("Simulated") como leitura de regime: convencao de sinal nao documentada; PARTIAL_ANALOG do TRACE.',
  input_families: ['DC_SPX_FINAL_GAMMA'], semantic_preconditions: ['SP_VOLSIGNALS_GAMMA_SIGN'], output_effect: 'volsignals.regime_reading = UNRESOLVED' });
B({ rule_id: 'B10_STAGE_C_SIDE_ORIGIN', stage: 'SPX_FINAL_CONTEXT', description: 'Estagio C originar lado quando B e UNKNOWN/NEUTRAL: nenhum campo C tem semantica de lado definida (Delta Pressure bloqueado em B07); a politica tambem nao esta definida.',
  input_families: ['DC_SPX_TRACE_DELTA', 'DC_SPX_FINAL_GAMMA'], semantic_preconditions: ['SP_TRACE_DELTA_PRESSURE_LINK'], output_effect: 'C nao origina lado' });

// ===== DIAGNOSTIC_ONLY =====
const D = (o) => rule({ status: 'DIAGNOSTIC_ONLY', origin: 'THIS_DESIGN', emits_side: false, required_quality: ALLQ, semantic_preconditions: [], ...o });
D({ rule_id: 'D01_METADATA', stage: 'DATA_QUALITY', description: 'Metadados (timestamps, ticker, categoria, _relay, status HTTP etc.): alimentam freshness/lineage, nunca evidencia.', input_families: ['DC_NON_EVIDENCE_META'], output_effect: 'data_quality / versions' });
D({ rule_id: 'D02_LEGACY_FROZEN_UNKNOWN_BLOCKS', stage: 'DATA_QUALITY', description: 'iv30d (FROZEN), extended_zone/spotgamma/qscore/dark_pool_analysis (STALE desde 22/06), blind_spots/bl_scores/implied_vol (nao auditados), mini_contracts col5/col6: preservados, nunca evidencia.', input_families: ['DC_ROOT_LEGACY_BLOCKS', 'DC_UNKNOWN_COLUMNS'], output_effect: 'unresolved_fields / data_quality' });
D({ rule_id: 'D03_LABEL_COLOR_AS_SIDE', stage: 'NATIVE_DEALER_STATE', description: 'NetGex0DTE label_color exibe sign(net_0dte) como lado (SEMANTIC_CONFLICT): mesmo dado da familia de regime; nunca lado.', input_families: ['DC_GEX0_SIGN'], output_effect: 'diagnostico de consistencia' });
D({ rule_id: 'D04_HEAT_TRAIL', stage: 'NATIVE_DEALER_STATE', description: 'DexGexFlow heat_trail: derivado dos mesmos niveis; nunca evidencia independente.', input_families: ['DC_MAJORS_0DTE'], output_effect: 'diagnostico' });
D({ rule_id: 'D05_DEGENERATE_STATE_OI', stage: 'NATIVE_DEALER_STATE', description: 'state_gex major_pos_oi/major_neg_oi: gex_oi = 0 no state => DEGENERATE.', input_families: ['DC_MAJORS_0DTE'], output_effect: 'diagnostico' });
D({ rule_id: 'D06_PRICE_REFERENCE', stage: 'DATA_QUALITY', description: 'spot (6 copias, count_as 0): referencia de preco para R_M03 e consistencia entre fontes; nao e evidencia dealer.', input_families: ['DC_SPOT_PRICE'], output_effect: 'referencia + checagem de consistencia' });
D({ rule_id: 'D07_MENTHORQ_NULL', stage: 'MENTHORQ_OVERLAY', description: 'Niveis MenthorQ null (401) ou distance_to_hvl_pct sem hvl: overlay = ZERO, registrado em data_quality.', input_families: ['DC_MENTHORQ_LEVELS'], output_effect: 'menthorq.confirmation = ZERO' });

// ---- validacoes das regras ----
const DCG = new Set(Object.keys(dc.groups));
const byId = {};
for (const r of R) {
  for (const k of REQ) if (!(k in r)) throw new Error(`regra ${r.rule_id} sem campo ${k}`);
  if (!STATUS.includes(r.status)) throw new Error(`status invalido ${r.rule_id}`);
  if (byId[r.rule_id]) throw new Error('rule_id duplicado ' + r.rule_id);
  byId[r.rule_id] = r;
  for (const f of r.input_families) if (f !== 'ALL' && !DCG.has(f)) throw new Error(`familia inexistente ${f} em ${r.rule_id}`);
  for (const s of r.semantic_preconditions) if (!SP[s]) throw new Error(`pre-condicao inexistente ${s} em ${r.rule_id}`);
  if (ACTIVE.has(r.status) && r.emits_side) throw new Error(`regra ATIVA emitindo lado: ${r.rule_id}`);
  if (ACTIVE.has(r.status)) for (const s of r.semantic_preconditions)
    if (!['MET', 'PARTIAL'].includes(SP[s].state)) throw new Error(`regra ATIVA com pre-condicao ${SP[s].state}: ${r.rule_id}/${s}`);
  if ((r.status === 'BLOCKED_BY_UNKNOWN_SEMANTICS' || r.status === 'DIAGNOSTIC_ONLY') && r.emits_side) throw new Error('bloqueada/diagnostica com lado ' + r.rule_id);
  if (r.status === 'BLOCKED_BY_UNKNOWN_SEMANTICS' && !r.semantic_preconditions.some(s => SP[s].state === 'UNMET')) throw new Error('BLOCKED sem pre-condicao UNMET ' + r.rule_id);
  if (r.rule_id !== 'R_S04_NO_SIMPLE_COUNTING' && /majority|n_support|n_contradict|\bX\/9\b|maioria/i.test(r.description + r.output_effect)) throw new Error('contagem simples em ' + r.rule_id);
}

// ---- cobertura campo -> regras (190/190) ----
const OVERRIDE = [
  [/label_color/, ['D03_LABEL_COLOR_AS_SIDE', 'R_S12_REGIME_IS_NOT_SIDE'], 'replace'],
  [/heat_trail/, ['D04_HEAT_TRAIL', 'R_S13_LOCATION_IS_NOT_SIDE'], 'replace'],
  [/state_gex\.major_(pos|neg)_oi$/, ['D05_DEGENERATE_STATE_OI', 'R_S13_LOCATION_IS_NOT_SIDE'], 'replace'],
  [/zero_mput$/, ['R_M03_LOCATION_DESCRIPTORS', 'B05_ZERO_MPUT_SEMANTICS']],
  [/pc_oi$/, ['R_M08_DEX_PUT_CALL_RATIO']],
  [/priors/, ['B04_PRIORS_TIME_INTERPRETATION', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE']],
  [/state_greek\.(gamma|delta)\.mini_contracts\[\]\.(greek_value|priors)/, ['B02_STATE_GREEK_PER_STRIKE_DIRECTION', 'B04_PRIORS_TIME_INTERPRETATION', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE'], 'replace'],
  [/levels\.distance_to_hvl_pct$/, ['D07_MENTHORQ_NULL', 'R_S19_MENTHORQ_OVERLAY']],
  [/state_gex\.strikes\[\]\.(strike|gex_vol)$|sum_gex_vol$|classic\.strikes|sum_gex_oi|cache\.s[vo]$/, ['R_M04_STRIKE_STRUCTURE']],
  [/gamma_mm$|trace\.stats$/, ['R_M09_TRACE_REGIME_COMPARE', 'HT06_SPX_CONTRADICTS_EFFECT', 'HT07_TRACE_REGIME_AGREEMENT_RELIABILITY']],
  [/volsignals\.gammaExposure$/, ['B09_VOLSIGNALS_GAMMA_REGIME', 'R_S06_NO_NUMERIC_EQUIVALENCE']],
  [/trace\.gamma_(cust|procust|firm|bd)$/, ['R_M10_TRACE_PARTICIPANTS_ENRICH']],
  [/trace\.(delta|charm)_pressure$/, ['B07_TRACE_DELTA_CHARM_PRESSURE', 'B10_STAGE_C_SIDE_ORIGIN']],
];
const BY_DIM = {
  PRICE_REFERENCE: ['D06_PRICE_REFERENCE', 'R_M03_LOCATION_DESCRIPTORS', 'R_S10_DQ_STATUS_DEFINITION'],
  METADATA: ['D01_METADATA', 'R_S08_FRESHNESS_BASIS'],
  GAMMA_REGIME: ['R_M01_REGIME_0DTE', 'R_M02_REGIME_NEXT_FULL', 'R_M05_REGIME_TRANSITION', 'R_S12_REGIME_IS_NOT_SIDE', 'HT05_REGIME_AMPLITUDE', 'HT08_EXPIRY_REGIME_DIVERGENCE'],
  STRUCTURE_LOCATION: ['R_M03_LOCATION_DESCRIPTORS', 'R_M06_LEVEL_TRANSITION', 'R_S13_LOCATION_IS_NOT_SIDE', 'HT02_POSITIVE_GAMMA_LEVEL_REVERSION', 'HT03_NEGATIVE_GAMMA_LEVEL_CONTINUATION', 'HT04_LEVEL_MIGRATION_SIDE'],
  DELTA_POSITIONING: ['HT01_DEX_DIRECTION_BY_REGIME', 'R_M07_NET_SIGN_CHANGE_OBSERVED', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE'],
  FLOW_UNKNOWN_SEMANTICS: ['B03_CVR_OFLOW', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE'],
  SECOND_ORDER_FLOWS: ['B01_SECOND_ORDER_DIRECTION', 'R_M07_NET_SIGN_CHANGE_OBSERVED', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE'],
  MENTHORQ_CONFIRMATION_LEVELS: ['R_S19_MENTHORQ_OVERLAY', 'HT09_MENTHORQ_ALIGNMENT_DEFINITION', 'D07_MENTHORQ_NULL'],
  VOL_SKEW: ['B06_VOL_SKEW_DIRECTION', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE'],
  DIAGNOSTIC_UNRESOLVED: ['D02_LEGACY_FROZEN_UNKNOWN_BLOCKS'],
  SPX_FINAL_GAMMA: ['R_S06_NO_NUMERIC_EQUIVALENCE', 'R_S17_C_AFTER_B_NO_FUSION'],
  SPX_FINAL_TRACE: ['R_S17_C_AFTER_B_NO_FUSION', 'R_S18_EFFECT_LABEL_SELECTION'],
  SPX_FINAL_VOLSIGNALS: ['B08_VOLSIGNALS_EXPOSURES', 'R_S06_NO_NUMERIC_EQUIVALENCE', 'R_S17_C_AFTER_B_NO_FUSION'],
};
const fieldById = Object.fromEntries(fc.fields.map(f => [f.feature_id, f]));
const coverage = rt.routes.map(r => {
  const f = fieldById[r.feature_id];
  if (!f) throw new Error('rota sem campo ' + r.feature_id);
  if (r.stage === 'C_SPX_FINAL_CONTEXT' && f.market_origin !== 'SPX') throw new Error('C com origem != SPX ' + r.feature_id);
  // override 'replace' (campos diagnosticos/bloqueados) substitui os defaults da dimensao; demais acrescentam
  const rep = OVERRIDE.filter(([re, , mode]) => mode === 'replace' && re.test(r.feature_id));
  const ids = new Set(rep.length ? [] : (BY_DIM[r.dimension] || []));
  for (const [re, add] of OVERRIDE) if (re.test(r.feature_id)) add.forEach(x => ids.add(x));
  ['R_S02_FULL_COVERAGE_NOT_VOTES', 'R_S03_FAMILY_LINEAGE', 'R_S05_MARKET_ORIGIN'].forEach(x => ids.add(x));
  for (const id of ids) if (!byId[id]) throw new Error('regra inexistente na cobertura ' + id);
  const st = [...ids].map(id => byId[id].status);
  const substantive = st.filter(s => s !== 'CANONICAL_STRUCTURAL');
  if (!substantive.length) throw new Error('campo so com regras estruturais genericas: ' + r.feature_id);
  return { feature_id: r.feature_id, stage: r.stage, dimension: r.dimension, market_origin: f.market_origin, rule_ids: [...ids].sort(),
    side_capable_in_record: false, side_capable_in_research_arm: [...ids].some(id => byId[id].emits_side) };
});
if (coverage.length !== 190 || new Set(coverage.map(c => c.feature_id)).size !== 190) throw new Error('cobertura != 190/190');
const byStatus = {}; for (const r of R) (byStatus[r.status] = byStatus[r.status] || []).push(r.rule_id);
const covSummary = {
  fields_total: 190, fields_covered: coverage.length, stage_B: coverage.filter(c => c.stage.startsWith('B_')).length, stage_C: coverage.filter(c => c.stage.startsWith('C_')).length,
  fields_side_capable_in_record: 0, fields_side_capable_in_research_arm: coverage.filter(c => c.side_capable_in_research_arm).length,
  note: 'nenhuma regra ativa emite lado => nenhum campo produz lado no contexto de registro nesta versao',
};

wr('jev-preregistered-rules-v1.json', {
  _meta: { ...META, schema: 'jev-future/preregistered-rules/v1', required_rule_fields: REQ, status_enum: STATUS,
    active_statuses: [...ACTIVE], origin_enum: { CANON_EXISTING: 'ja decidido em contrato/decisao anterior', THIS_DESIGN: 'proposto neste design; estrutural ou semantico; vale ao ser aprovado pelo operador' } },
  summary: { rules_total: R.length, by_status: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length])), coverage: covSummary },
  semantic_preconditions: SP,
  rules: R,
  rule_ids_by_status: byStatus,
  field_coverage: coverage,
});

// ---- maquina de estados ----
const sm = {
  _meta: { ...META, schema: 'jev-future/classification-state-machine/v1', nature: 'CLASSIFICACAO DE ESTADO/CONFLUENCIA — nao e ordem de trade' },
  pipeline: [
    { step: 1, id: 'DATA_QUALITY', rules: ['R_S08_FRESHNESS_BASIS', 'R_S10_DQ_STATUS_DEFINITION', 'R_S11_SESSION_INFORMATIONAL', 'D01_METADATA', 'D02_LEGACY_FROZEN_UNKNOWN_BLOCKS', 'D06_PRICE_REFERENCE'], output: 'data_quality' },
    { step: 2, id: 'FOUR_SOURCE_NATIVE_DEALER_ANALYSIS', sources: ['AlfaOmegaNetGex0DTE', 'AlfaOmegaDexGexFlow', 'AlfaOmegaClassic', 'AlfaOmegaState'], fields: 174, rules: ['R_S02_FULL_COVERAGE_NOT_VOTES', 'R_S05_MARKET_ORIGIN', 'R_S07_BREAK_0909'], output: 'leituras por campo' },
    { step: 3, id: 'EVIDENCE_FAMILIES_LINEAGE', rules: ['R_S03_FAMILY_LINEAGE', 'R_S04_NO_SIMPLE_COUNTING'], output: 'evidence_families' },
    { step: 4, id: 'NATIVE_DEALER_STATE', rules: ['R_M01_REGIME_0DTE', 'R_M02_REGIME_NEXT_FULL', 'R_M03_LOCATION_DESCRIPTORS', 'R_M04_STRIKE_STRUCTURE', 'R_M05_REGIME_TRANSITION', 'R_M06_LEVEL_TRANSITION', 'R_M07_NET_SIGN_CHANGE_OBSERVED', 'R_M08_DEX_PUT_CALL_RATIO', 'R_S12_REGIME_IS_NOT_SIDE', 'R_S13_LOCATION_IS_NOT_SIDE', 'R_S14_UNKNOWN_SEMANTICS_NO_SIDE'],
      output: 'native_dealer_state {gamma_regime, structure_location, delta_positioning, second_order_flows, vol_skew, flow_unknown_semantics, change_transition}' },
    { step: 5, id: 'NATIVE_DIRECTIONAL_CONTEXT', rules: ['R_S09_DATA_INVALID_TO_UNKNOWN', 'R_S15_ACTIVE_RULES_ONLY', 'R_S16_CONTEXT_STATE_DEFINITIONS'], output: 'native_directional_context' },
    { step: 6, id: 'SPX_FINAL_CONTEXT', sources: ['SpotGamma TRACE', 'VolSignals'], market_origin: 'SPX', fields: 16, rules: ['R_S06_NO_NUMERIC_EQUIVALENCE', 'R_S17_C_AFTER_B_NO_FUSION', 'R_S18_EFFECT_LABEL_SELECTION', 'R_M09_TRACE_REGIME_COMPARE', 'R_M10_TRACE_PARTICIPANTS_ENRICH'], output: 'spx_final_context' },
    { step: 7, id: 'JEV_DIRECTIONAL_CONTEXT', rules: ['R_S17_C_AFTER_B_NO_FUSION', 'R_S20_EXPLAINABILITY'], output: 'jev_directional_context = native_directional_context (efeito de C so registrado)' },
    { step: 8, id: 'MENTHORQ_OVERLAY', rules: ['R_S19_MENTHORQ_OVERLAY', 'D07_MENTHORQ_NULL'], output: 'menthorq (nao altera o contexto)' },
    { step: 9, id: 'CORE_COMPARISON', rules: ['R_S21_CORE_SEPARATE'], output: 'core_comparison (so comparacao; fusao UNDEFINED)' },
  ],
  sub_states: {
    gamma_regime: ['POSITIVE_GAMMA', 'NEGATIVE_GAMMA', 'AMBIGUOUS', 'UNKNOWN'],
    location_descriptor: ['ABOVE', 'BELOW', 'BETWEEN', 'SEMANTIC_ANOMALY', 'UNKNOWN'],
    change_transition: ['REGIME_TRANSITION', 'LEVEL_MIGRATION', 'SIGN_CHANGE_OBSERVED', 'NONE', 'UNRESOLVED'],
    unresolved_dimension_reading: 'UNRESOLVED',
    spx_effect_on_native: ['CONFIRMS', 'CONTRADICTS', 'ENRICHES', 'NO_EFFECT', 'UNAVAILABLE'],
  },
  context_decision: {
    applies_to: ['native_directional_context', 'jev_directional_context'],
    side_readings_source: 'so regras ativas (R_S15) com emits_side=true — nesta versao: nenhuma',
    ordered_steps: [
      { if: 'data_quality.status == DATA_INVALID', then: 'UNKNOWN', reason: 'RC_DATA_INVALID', rule: 'R_S09_DATA_INVALID_TO_UNKNOWN' },
      { if: 'nenhuma regra ativa de lado avaliavel', then: 'UNKNOWN', reason: 'RC_NO_ACTIVE_DIRECTIONAL_RULE', rule: 'R_S15_ACTIVE_RULES_ONLY' },
      { if: 'criterio NO_TRADE_CONTEXT pre-registrado e atendido', then: 'NO_TRADE_CONTEXT', reason: 'RC_NO_TRADE_CRITERIA_MET', rule: 'R_S16_CONTEXT_STATE_DEFINITIONS', status: 'INACTIVE — NO_TRADE_CONTEXT_CRITERIA UNDEFINED; posicao desta etapa na ordem tambem a pre-registrar com o criterio' },
      { if: 'leituras de lado de familias distintas em sentidos opostos', then: 'CONFLICTED_CONTEXT', reason: 'RC_OPPOSITE_FAMILY_READINGS', rule: 'R_S16_CONTEXT_STATE_DEFINITIONS' },
      { if: 'todas as leituras de lado no mesmo sentido', then: 'LONG_CONTEXT | SHORT_CONTEXT', reason: 'RC_CONSISTENT_SIDE_READINGS', rule: 'R_S16_CONTEXT_STATE_DEFINITIONS', note: 'consistencia entre familias, nao contagem; familias com overlap_risk concordantes nao reforcam' },
      { if: 'regras de lado avaliaveis sem inclinacao', then: 'NEUTRAL_CONTEXT', reason: 'RC_NO_INCLINATION', rule: 'R_S16_CONTEXT_STATE_DEFINITIONS' },
    ],
  },
  states: {
    LONG_CONTEXT: { defined: true, reachable_in_record_v1: false, reachable_in_research_arm: true, via: ['HT01', 'HT02', 'HT03', 'HT04'] },
    SHORT_CONTEXT: { defined: true, reachable_in_record_v1: false, reachable_in_research_arm: true, via: ['HT01', 'HT02', 'HT03', 'HT04'] },
    NEUTRAL_CONTEXT: { defined: true, reachable_in_record_v1: false, reachable_in_research_arm: true },
    CONFLICTED_CONTEXT: { defined: true, reachable_in_record_v1: false, reachable_in_research_arm: true, via: ['HT06 V_A'] },
    NO_TRADE_CONTEXT: { defined: true, reachable_in_record_v1: false, reachable_in_research_arm: false, criteria: 'UNDEFINED' },
    UNKNOWN: { defined: true, reachable_in_record_v1: true, reasons: ['RC_DATA_INVALID', 'RC_NO_ACTIVE_DIRECTIONAL_RULE'] },
  },
  classification_states_status: 'INCOMPLETE — 6 estados definidos; no registro V1 so UNKNOWN e alcancavel (nenhuma regra de lado ativa); LONG/SHORT/NEUTRAL/CONFLICTED so no braco de pesquisa; NO_TRADE_CONTEXT sem criterio',
  no_trade_context_criteria: 'UNDEFINED',
  research_arm: { label: 'JEV_RESEARCH_ARM_V1', rule: 'avalia HYPOTHESIS_TO_TEST offline, fora do contexto de registro; resultado nunca promovido sem pre-registro de validacao + decisao do operador', status: 'NOT IMPLEMENTED' },
};
wr('jev-classification-state-machine-v1.json', sm);

// ---- registro de hipoteses ----
const PRIOR = {
  HT02_POSITIVE_GAMMA_LEVEL_REVERSION: 'NEGATIVE_RESULTS 1C: distancia/posicao a CW/PW/ZG (SpotGamma) falhou como direcao. Reabertura so pela regra 1 (dataset diferente: majors 0DTE GammaGex) e declarada antes do teste.',
  HT03_NEGATIVE_GAMMA_LEVEL_CONTINUATION: 'NEGATIVE_RESULTS 1C: cruzamento do ZG e posicao entre walls (SpotGamma) falharam como direcao. Reabertura so pela regra 1 (dataset diferente).',
  HT04_LEVEL_MIGRATION_SIDE: 'NEGATIVE_RESULTS 1C: shift overnight de walls (SpotGamma) falhou como direcao. Esta hipotese e intradia e em outro dataset (regras 1 e 3).',
  HT05_REGIME_AMPLITUDE: 'Apoio indireto: 1C aprovou Δγ dealer (PROVISIONAL) e ΔVIX so como AMPLITUDE.',
  HT01_DEX_DIRECTION_BY_REGIME: 'Sem teste anterior no projeto para DEX GammaGex. HIRO (outra fonte) como lado foi REPROVADO — nao transferir.',
};
const hyps = R.filter(r => r.status === 'HYPOTHESIS_TO_TEST').map(r => ({
  hypothesis_id: r.rule_id, statement: r.description, emits_side: r.emits_side, input_families: r.input_families,
  semantic_preconditions: r.semantic_preconditions.map(s => ({ id: s, state: SP[s].state })),
  testable_now: false,
  why_not_testable_now: [
    ...r.semantic_preconditions.filter(s => SP[s].state !== 'MET').map(s => `${s} ${SP[s].state}`),
    'sem historico de captura propria (captura so com ordem explicita)',
  ],
  prior_project_evidence: PRIOR[r.rule_id] || 'nenhuma registrada',
  would_affect: r.output_effect,
  status: 'HYPOTHESIS_TO_TEST', validation: 'NOT STARTED',
}));
const unblock = R.filter(r => r.status === 'BLOCKED_BY_UNKNOWN_SEMANTICS').map(r => ({
  blocked_rule: r.rule_id, needs: r.semantic_preconditions.map(s => ({ id: s, state: SP[s].state, evidence: SP[s].evidence })),
  path: 'resolver a semantica (documentacao do vendor ou medicao) => so entao formular hipotese; nunca inventar polaridade',
}));
wr('jev-hypotheses-register-v1.json', {
  _meta: { ...META, schema: 'jev-future/hypotheses-register/v1' },
  validation: 'NOT STARTED',
  validation_history_target: { value: '20-40 pregoes', status: 'NON_BLOCKING_VALIDATION_TARGET', not_a_condition_for: ['continuar arquitetura', 'concluir pre-registro', 'abrir proximas fases de design'], capture: 'qualquer captura futura exige ordem explicita do operador' },
  future_validation_method_invariants: ['pre-registro de validacao congelado antes do holdout (regra 9)', 'split temporal por pregao; holdout tocado 1 vez', 'dayScore causal; nunca IC Spearman intradia', 'placebos: passeio aleatorio e vazamento proposital', 'Bonferroni/FDR sobre o numero real de testes', 'VERDICT = rotulo formal exato', 'resultados negativos permanentes; reabertura so pelas 4 regras'],
  hypotheses: hyps,
  blocked_unblock_paths: unblock,
  no_trade_context: { criteria: 'UNDEFINED', candidates_registered: 0, note: 'sem criterio conceitual defensavel; nao inventado. DATA_INVALID nunca vira NO_TRADE_CONTEXT (R_S09).' },
});

// ---- mapeamentos provisorios ----
const MAP = {
  GAMMA_REGIME: { areas: ['REGIME'], rationale: 'GEX liquido e zero gamma descrevem o regime de hedge do dealer (vendor: regime, nao direcao)', semantic_confidence: 'HIGH' },
  STRUCTURE_LOCATION: { areas: ['LOCATION', 'STRUCTURE'], rationale: 'majors, zero gamma e perfil por strike sao niveis e forma do posicionamento', semantic_confidence: 'HIGH (unidades CONFIRMED); zero_mput LOW' },
  DELTA_POSITIONING: { areas: ['FLOW', 'SENSITIVITY'], rationale: 'DEX descreve exposicao de delta; se e fluxo de hedge depende da convencao de sinal', semantic_confidence: 'LOW (unit e convencao UNKNOWN)' },
  SECOND_ORDER_FLOWS: { areas: ['SENSITIVITY', 'CHANGE'], rationale: 'vanna/charm descrevem sensibilidade do delta a vol/tempo', semantic_confidence: 'LOW (sinal UNKNOWN)' },
  VOL_SKEW: { areas: ['SENSITIVITY', 'CONTEXT'], rationale: 'risk reversal/ivol descrevem skew e vol', semantic_confidence: 'LOW (semantica UNKNOWN)' },
  FLOW_UNKNOWN_SEMANTICS: { areas: ['FLOW', 'UNRESOLVED'], rationale: 'nomes sugerem fluxo, sem documentacao', semantic_confidence: 'NONE' },
  MENTHORQ_CONFIRMATION_LEVELS: { areas: ['LOCATION'], rationale: 'niveis MenthorQ; papel so de confirmacao positiva', semantic_confidence: 'MEDIUM (hoje null)' },
  PRICE_REFERENCE: { areas: ['CONTEXT'], rationale: 'referencia de preco para descritores de location', semantic_confidence: 'HIGH' },
  METADATA: { areas: ['DIAGNOSTIC'], rationale: 'freshness, lineage e versoes', semantic_confidence: 'HIGH' },
  DIAGNOSTIC_UNRESOLVED: { areas: ['DIAGNOSTIC', 'UNRESOLVED'], rationale: 'blocos congelados, stale ou nao auditados', semantic_confidence: 'NONE' },
  SPX_FINAL_GAMMA: { areas: ['REGIME', 'CONTEXT'], rationale: 'gamma do MM (TRACE) e analogo parcial (VolSignals) contextualizam o regime nativo', semantic_confidence: 'MEDIUM (TRACE); LOW (VolSignals)' },
  SPX_FINAL_TRACE: { areas: ['CONTEXT'], rationale: 'gamma por participante e pressures como contexto SPX', semantic_confidence: 'MEDIUM (participantes); NONE (pressures)' },
  SPX_FINAL_VOLSIGNALS: { areas: ['CONTEXT'], rationale: 'exposicoes VolSignals como contexto SPX', semantic_confidence: 'NONE (INSUFFICIENT_INFORMATION)' },
};
const COND = [
  { condition: 'feature_id contem "prior"', adds: 'CHANGE', rationale: 'priors sao defasagens do mesmo campo', semantic_confidence: 'LOW (espacamento UNKNOWN)' },
  { condition: 'quality_state em {UNKNOWN_SEMANTICS, UNKNOWN, SEMANTIC_CONFLICT, INSUFFICIENT_INFORMATION, MISLABELED, PENDING_REVISION_AUDIT} ou unit_confidence UNKNOWN (fora de METADATA)', adds: 'UNRESOLVED', rationale: 'sinaliza que a contribuicao depende de semantica ainda nao resolvida', semantic_confidence: 'N/A' },
];
const usedBy = dim => [...new Set(BY_DIM[dim] || [])];
const byDim = {}; for (const r of rt.routes) (byDim[r.dimension] = byDim[r.dimension] || []).push(r);
for (const [dim, rs] of Object.entries(byDim)) {
  if (!MAP[dim]) throw new Error('dimensao sem mapeamento provisorio ' + dim);
  for (const r of rs) for (const a of r.possible_contribution_areas)
    if (!MAP[dim].areas.includes(a) && !['CHANGE', 'UNRESOLVED'].includes(a)) throw new Error(`area ${a} fora do mapeamento ${dim}`);
  for (const r of rs) if (r.possible_contribution_areas_status !== 'PROVISIONAL_DESIGN_MAPPING') throw new Error('rota sem status provisorio ' + r.feature_id);
}
wr('jev-provisional-mappings-v1.json', {
  _meta: { ...META, schema: 'jev-future/provisional-mappings/v1' },
  status: 'PROVISIONAL_DESIGN_MAPPING',
  provenance: 'associacao dimension -> possible_contribution_areas proposta pelo Claude Code (Decision Logic V1, 23/09); NAO e regra empirica validada',
  usage_rule: 'estrutura inicial do pre-registro; qualquer uso para classificacao direcional precisa ser pre-registrado explicitamente',
  mappings: Object.entries(MAP).map(([dim, m]) => ({
    source_dimension: dim, proposed_contribution_areas: m.areas, rationale: m.rationale, semantic_confidence: m.semantic_confidence,
    fields: (byDim[dim] || []).length, rules_that_reference_dimension: usedBy(dim),
    directional_use: 'NOT_ALLOWED_WITHOUT_PREREGISTRATION', status: 'PROVISIONAL_DESIGN_MAPPING',
  })),
  conditional_additions: COND.map(c => ({ ...c, status: 'PROVISIONAL_DESIGN_MAPPING' })),
});

console.log(JSON.stringify({ rules: R.length, by_status: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length])), coverage: covSummary, hypotheses: hyps.length, blocked: unblock.length, mappings: Object.keys(MAP).length }));
