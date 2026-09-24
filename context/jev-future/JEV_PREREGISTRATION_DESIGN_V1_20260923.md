# JEV FUTURE — PRÉ-REGISTRO DA CLASSIFICAÇÃO PRÓPRIA: DESIGN V1 (23/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | **PREREGISTRATION DESIGN — CREATED** (lógica interna do Jev definida antes de qualquer teste) |
| NATUREZA | CLASSIFICAÇÃO DE ESTADO / CONFLUÊNCIA — **não é ordem de trade** |
| ESCOPO | só a lógica interna do Jev: `native_dealer_state` + `spx_final_context` → `jev_directional_context` |
| CORE × JEV | FUSION_POLICY **UNDEFINED** · CONFLICT_POLICY **UNDEFINED** · PRECEDENCE **NOT_DEFINED** (fase separada) |
| VALIDATION | **NOT STARTED** |
| 20–40 PREGÕES | **NON_BLOCKING_VALIDATION_TARGET** |
| IMPLEMENTATION / RUNTIME | NONE |
| DATA COLLECTION | NONE |
| PRODUCTION | UNCHANGED · F5 NOT PERFORMED |
| Regido por | `PROJECT_SCOPE_JEV_FUTURE_20260923.md` · `JEV_DEALER_CONTEXT_CONTRACT_20260923.md` · `JEV_FEATURE_CONTRACT_V1_20260923.md` · `JEV_DECISION_LOGIC_V1_20260923.md` |
| Máquina | `data/jev-preregistered-rules-v1.json` · `data/jev-classification-state-machine-v1.json` · `data/jev-hypotheses-register-v1.json` · `data/jev-provisional-mappings-v1.json` |
| Gerador | `scripts/build-jev-preregistration-design-v1.js` |

O gerador é determinístico e **falha** em qualquer um destes casos:
- cobertura ≠ 190/190;
- regra sem um dos 7 campos obrigatórios, ou com status fora do enum;
- regra ativa emitindo lado;
- regra ativa com pré-condição semântica UNMET;
- família DC inexistente;
- campo do estágio C com origem ≠ SPX;
- contagem simples numa regra;
- rota sem `possible_contribution_areas_status = PROVISIONAL_DESIGN_MAPPING`.

_Substitui o rascunho anterior deste mesmo arquivo (sessão aaa9a1de, 1º turno). Aquele rascunho tratava 20/40 pregões como pré-condição e já foi removido junto com o `data/jev-preregistration-design-v1.json`._

---

## 0. Correções de governança aplicadas (antes desta fase)

| | Correção | Onde |
|---|---|---|
| A | `possible_contribution_areas` = **PROVISIONAL_DESIGN_MAPPING**. A associação foi proposta pelo Claude Code e não é regra empírica. Serve de estrutura inicial; o uso direcional exige pré-registro explícito. | Decision Logic V1 §3 (nota) · gerador `build-jev-decision-logic-v1.js` (comentário, campo `possible_contribution_areas_status` em cada rota, política `POSSIBLE_CONTRIBUTION_AREAS`) · artefatos regenerados (guard PASS, 190/190) · detalhe em `data/jev-provisional-mappings-v1.json` |
| B | **VALIDATION_HISTORY_TARGET: NON_BLOCKING.** 20–40 pregões são alvo de evidência futura; não são gate de arquitetura, blocker de design, requisito para continuar nem condição de fechamento de fase. | Decision Logic V1 §8 · política `VALIDATION_HISTORY_TARGET` · `ABOT_GAMMAGEX_JEV_FUTURE_AUDIT` (A4 e §6.3) · `ABOT_GAMMAGEX_ES_FIRST_AUDIT` (item 4) · `gammagex-jev-candidates.json` e `es-pattern-candidates.json`, com seus geradores |

Nenhuma coleta começa sem ordem explícita do operador.

## 1. Ordem interna do Jev (pré-registrada)

```
DATA QUALITY                                   R_S08 R_S10 R_S11 · D01 D02 D06
    ↓
4-SOURCE NATIVE DEALER ANALYSIS (174/174)      R_S02 R_S05 R_S07
    ↓
EVIDENCE FAMILIES / LINEAGE                    R_S03 R_S04
    ↓
NATIVE DEALER STATE                            R_M01–R_M08 · R_S12 R_S13 R_S14
    ↓  → native_directional_context            R_S09 R_S15 R_S16
SPX FINAL CONTEXT  TRACE + VolSignals (16/16)  R_S06 R_S17 R_S18 · R_M09 R_M10
    ↓
JEV DIRECTIONAL CONTEXT                        R_S17 R_S20
    ·
MenthorQ overlay (separado)                    R_S19 · D07  → POSITIVE | ZERO
core_comparison (só comparação)                R_S21
```

Nenhuma etapa lê a saída de uma etapa posterior. O lado do Core não entra em nenhuma etapa (R_S21).

## 2. Os cinco status de regra (não se misturam)

| Status | Significado | Entra no contexto de registro? |
|---|---|---|
| CANONICAL_STRUCTURAL | estrutura: ordem, lineage, qualidade, origem, proibições | sim |
| SUPPORTED_SEMANTIC | leitura descritiva com semântica estabelecida (vendor + identidade medida); **nunca emite lado** | sim |
| HYPOTHESIS_TO_TEST | depende de evidência não comprovada; pode emitir lado | **não**: só no braço de pesquisa |
| BLOCKED_BY_UNKNOWN_SEMANTICS | semântica, unidade ou convenção de sinal UNKNOWN | não; a leitura é UNRESOLVED |
| DIAGNOSTIC_ONLY | consistência, metadado, bloco congelado | não |

Cada regra tem `rule_id`, `description`, `input_families`, `required_quality`, `semantic_preconditions`, `output_effect` e `status`. O campo extra `origin` separa dois casos:
- **CANON_EXISTING:** já decidido em contrato ou decisão anterior;
- **THIS_DESIGN:** proposto aqui; vale depois de aprovado.

As pré-condições semânticas (18) têm estado MET, PARTIAL, UNMET ou UNDEFINED e estão em `semantic_preconditions` do JSON de regras.

**Total: 58 regras.**

| Status | Regras |
|---|---|
| CANONICAL_STRUCTURAL | 21 |
| SUPPORTED_SEMANTIC | 10 |
| HYPOTHESIS_TO_TEST | 10 |
| BLOCKED_BY_UNKNOWN_SEMANTICS | 10 |
| DIAGNOSTIC_ONLY | 7 |

## 3. Regras estruturais ativas (CANONICAL_STRUCTURAL)

| ID | Regra | Origem |
|---|---|---|
| R_S01_STAGE_ORDER | ordem interna do §1 | canon |
| R_S02_FULL_COVERAGE_NOT_VOTES | 190/190, nenhum descarte, 190 campos ≠ 190 votos | canon |
| R_S03_FAMILY_LINEAGE | CONFIRMED/BY_CONSTRUCTION consolidam. SUSPECTED, UNVERIFIED e PARTIAL_ANALOG ficam separadas com `overlap_risk`. Famílias com overlap concordantes **não se reforçam** | canon |
| R_S04_NO_SIMPLE_COUNTING | proibidos como decisão: majority vote, X/9, suporte > contradição, contagem bruta de campos ou famílias | canon (ordem 23/09) |
| R_S05_MARKET_ORIGIN | A-Bot, TRACE e VolSignals = SPX (ES_SPX é escala), nunca ES_NATIVE. SPY é instância separada | canon |
| R_S06_NO_NUMERIC_EQUIVALENCE | TRACE × VolSignals: gamma PARTIAL_ANALOG, os outros 6 INSUFFICIENT_INFORMATION, sem equivalência numérica | canon |
| R_S07_BREAK_0909 | nunca misturar antes × depois de 09/09 | canon |
| R_S08_FRESHNESS_BASIS | vendor ts; **60 s / 300 s = PROVISIONAL**, não finais; FROZEN_VALUES fora da leitura; freshness e RTH = CLASSIFICATION INPUT, não gate de trade | canon |
| R_S09_DATA_INVALID_TO_UNKNOWN | DATA_INVALID ⇒ UNKNOWN + `RC_DATA_INVALID`, nunca NO_TRADE_CONTEXT | canon |
| R_S10_DQ_STATUS_DEFINITION | **DATA_INVALID:** sem preço utilizável, ou nenhum membro da família de regime 0DTE FRESH/MARKET_CLOSED. **DEGRADED:** família ativa STALE, UNKNOWN, PENDING_REVISION_AUDIT ou parcial. **VALID:** demais casos. Nenhum threshold novo | este design |
| R_S11_SESSION_INFORMATIONAL | RTH/OUTSIDE_RTH só informativo; fora do RTH é MARKET_CLOSED | canon |
| R_S12_REGIME_IS_NOT_SIDE | POSITIVE_GAMMA ≠ LONG; NEGATIVE_GAMMA ≠ SHORT | canon |
| R_S13_LOCATION_IS_NOT_SIDE | distância ou posição nunca vira lado automaticamente | canon |
| R_S14_UNKNOWN_SEMANTICS_NO_SIDE | semântica, unidade ou sinal UNKNOWN ⇒ UNRESOLVED + `unresolved_fields` | canon |
| R_S15_ACTIVE_RULES_ONLY | só CANONICAL e SUPPORTED entram no contexto de registro. HYPOTHESIS só no braço de pesquisa e só é promovida por pré-registro de validação + decisão do operador | este design |
| R_S16_CONTEXT_STATE_DEFINITIONS | definições do §6 (output contract), aplicadas só a regras ativas | canon |
| R_S17_C_AFTER_B_NO_FUSION | C entra depois de B; sem fusão B × C; o efeito fica em `effect_on_native`, sem pesos | canon |
| R_S18_EFFECT_LABEL_SELECTION | escolha do rótulo único de `effect_on_native` (§5) | este design |
| R_S19_MENTHORQ_OVERLAY | POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING; enquanto "alinhado" não estiver definido, ZERO | canon |
| R_S20_EXPLAINABILITY | toda classificação cita famílias, contribuições e reason codes; conviction UNCALIBRATED | canon |
| R_S21_CORE_SEPARATE | o Core só aparece em `core_comparison`; fusão, conflito e precedência não definidos | canon |

## 4. Native dealer state — leituras por área

### A. REGIME (SUPPORTED_SEMANTIC, sem lado)

- **R_M01_REGIME_0DTE.** DC_GEX0_SIGN × DC_ZERO_GAMMA_0DTE são **1 família**, com 2 leituras:
  - (a) sinal de `gex.net_0dte`, que é o mesmo dado de `gamma_condition` e do `sum_gex_vol` do state;
  - (b) spot acima ou abaixo do `zero_gamma`.

  | Situação | Regime |
  |---|---|
  | (a) e (b) concordam | POSITIVE_GAMMA ou NEGATIVE_GAMMA |
  | discordam (medido: concordância de 44–100 % por dia) | AMBIGUOUS |
  | só uma utilizável | essa, com DEGRADED |
  | nenhuma | UNKNOWN |

  Não há banda "perto de zero": o threshold não está calibrado e não se aplica.
- **R_M02_REGIME_NEXT_FULL.** next e full, cada um em família própria, reportados lado a lado com o 0DTE; nunca fundidos.
- **D03_LABEL_COLOR_AS_SIDE.** A cor do NetGex0DTE mostra sinal de GEX como lado: DIAGNOSTIC_ONLY.
- **HT05 (amplitude) e HT08 (divergência entre vencimentos):** hipóteses, sem lado.

### B. LOCATION / STRUCTURE (SUPPORTED_SEMANTIC, sem lado)

- **R_M03_LOCATION_DESCRIPTORS.** Vale para zero gamma, majors 0DTE/next/full (orderflow, classic, state), majors long/short gamma e `next_exp_*`. Para cada nível:
  - ABOVE ou BELOW do spot;
  - distância assinada em pontos e em %;
  - ordenação dos níveis;
  - nível mais próximo acima e abaixo;
  - BETWEEN a,b.

  Não existe tolerância de "AT", porque não há threshold. `zero_mput` é descrito com a marca SEMANTIC_ANOMALY (B05).
- **R_M04_STRIKE_STRUCTURE.** Strike de maior |GEX| acima e abaixo do spot e o sinal nesses strikes. O perfil e o `sum_gex_*` são a mesma família. Classic × state no mesmo strike são construtos distintos.
- **priors / max_priors:** o espaçamento temporal é UNKNOWN ⇒ **B04**; só "valor difere" é descritivo.
- **Proibido:** transformar distância em LONG/SHORT (R_S13). As hipóteses de lado com níveis estão em HT02–HT04.

### C. FLOW / DELTA POSITIONING

- **R_M08_DEX_PUT_CALL_RATIO** (SUPPORTED): `pc_oi` = |put DEX| / |call DEX|, nunca OI.
- **HT01_DEX_DIRECTION_BY_REGIME = DEX_DIRECTION_RULE: HYPOTHESIS_TO_TEST.** Pré-condição `SP_DEX_SIGN_CONVENTION` = UNMET (unidade UNKNOWN; perspectiva dealer × cliente não documentada). No registro, a leitura é **UNRESOLVED**.
- **cvr / oflow (8 campos):** B03 BLOCKED.

### D. SECOND-ORDER FLOWS

- Vanna e charm (net 0DTE/next e por strike) e as gregas por strike do state: **B01 / B02 BLOCKED**, com `SP_GREEK_SIGN_CONVENTION` = UNMET.
- Volga só existe no VolSignals, e aí é B08.
- Sinal desconhecido ⇒ nenhum lado.
- **R_M07** registra troca de sinal observada como CHANGE aritmético, com `interpretation = UNRESOLVED`.

### E. CHANGE / TRANSITION (só eventos discretos, sem threshold numérico)

| Regra | Evento | Registro |
|---|---|---|
| R_M05_REGIME_TRANSITION | troca de sinal de `net_0dte`, spot cruzando o zero gamma ou troca do rótulo R_M01 entre snapshots consecutivos válidos | `REGIME_TRANSITION{from,to}` |
| R_M06_LEVEL_TRANSITION | major ou zero gamma muda de strike, ou a ordenação muda | `LEVEL_MIGRATION{level,from,to,UP|DOWN}`: descritor, não lado |
| R_M07_NET_SIGN_CHANGE_OBSERVED | troca de sinal em DEX, vanna ou charm net | `SIGN_CHANGE_OBSERVED`, interpretação UNRESOLVED |
| B04_PRIORS_TIME_INTERPRETATION | priors/max_priors como série temporal | BLOCKED (espaçamento UNKNOWN) |

Os eventos ficam em `native_dealer_state.change_transition` e em `reason_codes`. Os dois snapshots precisam estar do mesmo lado de 09/09.

### VOL / SKEW

`delta_risk_reversal` e call/put ivol: **B06 BLOCKED** (semântica e unidade UNKNOWN).

## 5. SPX final context (TRACE + VolSignals, market_origin = SPX)

Entra **somente depois** do native dealer state (R_S17). O `jev_directional_context` é igual ao `native_directional_context`; o efeito de C só fica registrado.

| Regra | Status | Efeito possível |
|---|---|---|
| R_M09_TRACE_REGIME_COMPARE | SUPPORTED | TRACE `gamma_mm` no spot comparado **só em sinal** com R_M01 ⇒ CONFIRMS ou CONTRADICTS na dimensão GAMMA_REGIME. Não muda o regime nativo e não dá lado. Fica DEGRADED até a auditoria de revisão do TRACE |
| R_M10_TRACE_PARTICIPANTS_ENRICH | SUPPORTED | gamma de cust, procust, firm e bd ⇒ ENRICHES |
| B07_TRACE_DELTA_CHARM_PRESSURE | BLOCKED | UNAVAILABLE (vínculo ao endpoint não capturado) |
| B08_VOLSIGNALS_EXPOSURES (6) | BLOCKED | UNAVAILABLE, ou ENRICHES só por presença; nunca CONFIRMS/CONTRADICTS |
| B09_VOLSIGNALS_GAMMA_REGIME | BLOCKED | convenção de sinal do "Simulated" UNKNOWN ⇒ UNRESOLVED |
| B10_STAGE_C_SIDE_ORIGIN | BLOCKED | C não origina lado |
| HT06_SPX_CONTRADICTS_EFFECT | HYPOTHESIS | CONTRADICTS sobre uma leitura de lado ⇒ (V_A) CONFLICTED ou (V_B) só anotação |
| HT07_TRACE_REGIME_AGREEMENT_RELIABILITY | HYPOTHESIS | a concordância TRACE × nativo torna o regime mais informativo para amplitude |

- **Rótulo único (R_S18):** o primeiro que se aplicar, na ordem UNAVAILABLE → CONTRADICTS → CONFIRMS → ENRICHES → NO_EFFECT.
- **Comparável** = mesma dimensão e semântica MET.
- **PARTIAL_ANALOG** compara só sinal ou posição, nunca magnitude.
- **Sem pesos.** Equivalência numérica NOT ALLOWED.

## 6. Máquina de estados do `jev_directional_context`

Vale igual para `native_directional_context` e `jev_directional_context` (`data/jev-classification-state-machine-v1.json`):

| # | Condição | Estado | Reason |
|---|---|---|---|
| 1 | `data_quality.status = DATA_INVALID` | UNKNOWN | RC_DATA_INVALID |
| 2 | nenhuma regra **ativa** de lado avaliável | UNKNOWN | RC_NO_ACTIVE_DIRECTIONAL_RULE |
| 3 | critério NO_TRADE pré-registrado e atendido | NO_TRADE_CONTEXT | **INATIVO**: critério UNDEFINED, e a posição desta etapa se define junto com o critério |
| 4 | leituras de lado de famílias distintas em sentidos opostos | CONFLICTED_CONTEXT | RC_OPPOSITE_FAMILY_READINGS |
| 5 | todas as leituras de lado no mesmo sentido | LONG_CONTEXT / SHORT_CONTEXT | RC_CONSISTENT_SIDE_READINGS |
| 6 | regras de lado avaliáveis, sem inclinação | NEUTRAL_CONTEXT | RC_NO_INCLINATION |

O passo 5 exige **consistência** entre famílias, não contagem. Famílias com `overlap_risk` que concordam não somam, e nada compara "quantas a favor × quantas contra" (R_S04).

**Consequência honesta desta V1.** Nenhuma regra ativa emite lado. Todas as leituras de lado possíveis (HT01–HT04) dependem de evidência não comprovada.

| Estado | Registro V1 | Braço de pesquisa |
|---|---|---|
| UNKNOWN | **alcançável** | sim |
| LONG_CONTEXT / SHORT_CONTEXT | não | sim (HT01–HT04) |
| NEUTRAL_CONTEXT | não | sim |
| CONFLICTED_CONTEXT | não | sim (inclui HT06 V_A) |
| NO_TRADE_CONTEXT | não | não (critério UNDEFINED) |

⇒ **JEV CLASSIFICATION STATES: INCOMPLETE.** Os 6 estados e as transições estão definidos, mas LONG/SHORT ainda não têm regra ativa. Isso é consequência da regra "não inventar polaridade", não uma lacuna de desenho.

O braço de pesquisa (`JEV_RESEARCH_ARM_V1`) avalia as hipóteses offline, fora do contexto de registro. NOT IMPLEMENTED.

## 7. NO_TRADE_CONTEXT

**NO_TRADE_CONTEXT_CRITERIA: UNDEFINED.**
- Não há critério conceitual defensável com a evidência atual, e nenhum candidato foi registrado para não inventar.
- NO_TRADE_CONTEXT continua sendo uma classificação do Jev, não uma ordem.
- DATA_INVALID nunca vira NO_TRADE_CONTEXT (R_S09).
- Sessão e freshness não geram NO_TRADE (R_S08, R_S11).
- As regras de NO_TRADE por L0/RTH do Core V0 **não** são importadas.

## 8. Hipóteses a testar (`data/jev-hypotheses-register-v1.json`)

| ID | Lado? | Pré-condição pendente | Evidência anterior |
|---|---|---|---|
| HT01_DEX_DIRECTION_BY_REGIME | sim | SP_DEX_SIGN_CONVENTION UNMET | nenhuma para DEX GammaGex; HIRO como lado foi REPROVADO (não transferir) |
| HT02_POSITIVE_GAMMA_LEVEL_REVERSION | sim | SP_MAJORS_IDENTITY_RTH PARTIAL | 1C: distância/posição a walls/ZG (SpotGamma) falhou. Reabertura só pela regra 1 (dataset diferente) |
| HT03_NEGATIVE_GAMMA_LEVEL_CONTINUATION | sim | SP_MAJORS_IDENTITY_RTH PARTIAL | 1C: cruzamento do ZG falhou. Reabertura pela regra 1 |
| HT04_LEVEL_MIGRATION_SIDE | sim | SP_MAJORS_IDENTITY_RTH PARTIAL | 1C: shift overnight de walls falhou. Esta é intradia e em outro dataset (regras 1 e 3) |
| HT05_REGIME_AMPLITUDE | não | — | 1C aprovou Δγ dealer (PROVISIONAL) e ΔVIX só como amplitude |
| HT06_SPX_CONTRADICTS_EFFECT | não (modula) | revisão do TRACE | — |
| HT07_TRACE_REGIME_AGREEMENT_RELIABILITY | não | revisão do TRACE | — |
| HT08_EXPIRY_REGIME_DIVERGENCE | não | — | — |
| HT09_MENTHORQ_ALIGNMENT_DEFINITION | não (+/0) | SP_MENTHORQ_ALIGNMENT_DEF UNMET; MenthorQ null (401) | — |
| HT10_SPY_INSTANCE_ROLE | não | SP_SPY_INDEPENDENCE UNMET | — |

- Todas estão `testable_now = false` e `validation = NOT STARTED`.
- Os 10 bloqueios têm caminho de desbloqueio registrado: primeiro resolver a semântica (documentação do vendor ou medição), só então formular hipótese.

## 9. Bloqueados por semântica desconhecida

| ID | O que fica bloqueado |
|---|---|
| B01_SECOND_ORDER_DIRECTION | vanna e charm como lado |
| B02_STATE_GREEK_PER_STRIKE_DIRECTION | gregas por strike do state |
| B03_CVR_OFLOW | cvr e oflow |
| B04_PRIORS_TIME_INTERPRETATION | priors como série temporal |
| B05_ZERO_MPUT_SEMANTICS | `zero_mput` como suporte |
| B06_VOL_SKEW_DIRECTION | risk reversal e ivol |
| B07_TRACE_DELTA_CHARM_PRESSURE | TRACE Delta/Charm Pressure |
| B08_VOLSIGNALS_EXPOSURES | as 6 exposições VolSignals |
| B09_VOLSIGNALS_GAMMA_REGIME | gammaExposure como regime |
| B10_STAGE_C_SIDE_ORIGIN | estágio C originando lado |

**DIAGNOSTIC_ONLY:** D01 metadados · D02 blocos legados/congelados, col5/col6 · D03 `label_color` · D04 `heat_trail` · D05 OI degenerado do state · D06 referência de preço · D07 MenthorQ null.

## 10. Mapeamentos provisórios (PROVISIONAL_DESIGN_MAPPING)

Todos com `directional_use = NOT_ALLOWED_WITHOUT_PREREGISTRATION`. Detalhe em `data/jev-provisional-mappings-v1.json`.

| Dimensão de origem | Área proposta | Razão | Confiança semântica |
|---|---|---|---|
| GAMMA_REGIME | REGIME | GEX líquido e zero gamma = regime de hedge | HIGH |
| STRUCTURE_LOCATION | LOCATION, STRUCTURE | níveis e perfil por strike | HIGH (zero_mput LOW) |
| DELTA_POSITIONING | FLOW, SENSITIVITY | exposição de delta; fluxo depende do sinal | LOW |
| SECOND_ORDER_FLOWS | SENSITIVITY, CHANGE | sensibilidade do delta a vol/tempo | LOW |
| VOL_SKEW | SENSITIVITY, CONTEXT | skew/vol | LOW |
| FLOW_UNKNOWN_SEMANTICS | FLOW, UNRESOLVED | nome sugere fluxo, sem documentação | NONE |
| MENTHORQ_CONFIRMATION_LEVELS | LOCATION | níveis; papel só de confirmação | MEDIUM (hoje null) |
| PRICE_REFERENCE | CONTEXT | referência de preço | HIGH |
| METADATA | DIAGNOSTIC | freshness, lineage | HIGH |
| DIAGNOSTIC_UNRESOLVED | DIAGNOSTIC, UNRESOLVED | blocos congelados ou não auditados | NONE |
| SPX_FINAL_GAMMA | REGIME, CONTEXT | gamma MM (TRACE) e análogo parcial | MEDIUM / LOW |
| SPX_FINAL_TRACE | CONTEXT | participantes e pressures | MEDIUM / NONE |
| SPX_FINAL_VOLSIGNALS | CONTEXT | exposições | NONE |

Há duas adições condicionais, também PROVISIONAL:
- `prior` no nome ⇒ CHANGE;
- qualidade ou unidade UNKNOWN ⇒ UNRESOLVED.

O gerador confere que as áreas das 190 rotas batem com este mapeamento.

## 11. Cobertura

| | |
|---|---|
| Campos cobertos | **190/190** (B 174 · C 16) |
| Com lado no contexto de registro | 0 |
| Com lado possível só no braço de pesquisa | 53 (via HT01–HT04) |
| Campos descartados | 0 |

Cada campo tem as suas regras em `field_coverage`, com pelo menos uma regra não genérica.

## 12. Validação futura

- **VALIDATION: NOT STARTED.**
- **20–40 pregões = NON_BLOCKING_VALIDATION_TARGET.** Não é condição para continuar a arquitetura, concluir este pré-registro nem abrir as próximas fases de design.
- Qualquer captura futura exige ordem explícita do operador.
- **Invariantes do método**, para quando houver ordem de validar:
  - pré-registro de validação congelado antes do holdout;
  - split temporal por pregão, com o holdout usado 1 vez;
  - `dayScore` causal, nunca IC Spearman intradia;
  - placebos: passeio aleatório e vazamento proposital;
  - Bonferroni/FDR sobre o nº real de testes;
  - VERDICT = rótulo formal exato;
  - resultados negativos permanentes.

## 13. Fora desta fase

- Fusão, conflito e precedência Core × Jev (fase separada).
- Pesos, conviction, probabilidade.
- Thresholds calibrados.
- Runtime, captura, teste.
- NQ.
- Qualquer sistema atual.
