# JEV DECISION LOGIC V1 (23/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | DEFINITION ONLY: papel, rotas, famílias de evidência e contrato de saída do Jev |
| IMPLEMENTATION | NONE |
| PRODUCTION | OUT OF SCOPE / UNCHANGED |
| F5 | NOT PERFORMED |
| NATUREZA | classificação de estado/confluência; **não é ordem de trade** |
| FINAL TRADE DIRECTION | **NOT DEFINED** |
| Regido por | `PROJECT_SCOPE_JEV_FUTURE_20260923.md` · `JEV_DEALER_CONTEXT_CONTRACT_20260923.md` · `JEV_FEATURE_CONTRACT_V1_20260923.md` |
| Máquina | `data/jev-decision-logic-v1.json` · `data/jev-analysis-routes-v1.json` · `data/jev-evidence-families-v1.json` · `data/jev-output-contract-v1.json` |
| Gerador | `scripts/build-jev-decision-logic-v1.js` |

O gerador é determinístico e falha em qualquer um destes casos:
- total ≠ 190;
- campo sem rota;
- família sem grupo DC;
- SPX final context com origem ≠ SPX;
- output shape fora do contrato;
- resíduo de regra superada nos artefatos ou neste documento.

_Previous draft superseded; non-canonical Core-dominant rules removed._

---

## 1. Papéis

| Componente | Papel |
|---|---|
| FUTURES CORE | SEPARATE_DETERMINISTIC_SYSTEM. O Jev pode receber o resultado dele só para `core_comparison`. |
| JEV FUTURE | MARKET-STATE / CONFLUENCE CLASSIFIER, com classificação própria. |
| SpotGamma TRACE | FINAL_DECISION_CONTEXT_LAYER, `market_origin = SPX` |
| VolSignals | FINAL_DECISION_CONTEXT_LAYER, `market_origin = SPX` |
| MenthorQ | POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING |

| Política | Estado |
|---|---|
| CORE_vs_JEV_FUSION_POLICY | UNDEFINED / TO_BE_PREREGISTERED |
| CORE_vs_JEV_CONFLICT_POLICY | UNDEFINED / TO_BE_PREREGISTERED |
| PRECEDENCE | NOT_DEFINED |
| NO_TRADE_POLICY | não fixada |
| CONVICTION | UNCALIBRATED |
| JEV_CLASSIFICATION_CRITERIA | TO_BE_PREREGISTERED |
| MenthorQ | POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING (única política funcional definida) |

Nenhuma lógica passa do Core para o Jev nem do Jev para o Core. Esta V1 não produz direção final de trade.

## 2. Estágios de análise

| Estágio | Conteúdo | Campos | Saída |
|---|---|---|---|
| A. FUTURES CORE | sistema determinístico separado, fora do Jev | 0 | resultado do Core, usado só em `core_comparison` |
| B. JEV NATIVE DEALER ANALYSIS | AlfaOmegaNetGex0DTE, AlfaOmegaDexGexFlow, AlfaOmegaClassic e AlfaOmegaState completos: raw e derived, com lineage e double counting | 174/174 | `native_dealer_state`, `native_directional_context` |
| C. SPX FINAL CONTEXT | TRACE (9) e VolSignals (7), depois de B; refinam e contextualizam a leitura do Jev | 16/16 | `spx_final_context`, `jev_directional_context` |
| D. MENTHORQ | overlay de política sobre os 12 campos MenthorQ do bloco `levels` (roteados em B) | overlay | `menthorq` |

TRACE e VolSignals seguem estas regras:
- são namespaces separados e não se fundem;
- Gamma é PARTIAL_ANALOG;
- os outros 6 campos são INSUFFICIENT_INFORMATION;
- não há equivalência numérica (NOT ALLOWED).

Não existe regra de fusão entre os estágios B e C. O efeito de C sobre B só fica registrado em `spx_final_context.effect_on_native`.

## 3. Rotas (`data/jev-analysis-routes-v1.json`)

| | |
|---|---|
| TOTAL INPUT FIELDS | 190 |
| FIELDS ROUTED | 190 (quatro fontes 174/174 · SPX final context 16/16) |
| UNASSIGNED | 0 |
| Votos | nenhum: `is_vote=false` em todos (190 campos ≠ 190 votos) |

Cada rota carrega:
- origem: `feature_id`, `source_system`, `source_component`, `market_origin`;
- análise: `stage`, `analysis_use = ANALYZED_IN_FULL`, `dimension`, `possible_contribution_areas`;
- rótulo e qualidade: `jev_role_label`, `quality_state`, `availability`, `freshness_rule`;
- lineage: `lineage_group`, `double_counting_group`, `evidence_families[]`;
- `policy_overlay` (só MenthorQ).

`possible_contribution_areas` usa este vocabulário: REGIME · LOCATION · FLOW · STRUCTURE · SENSITIVITY · CHANGE · CONTEXT · DIAGNOSTIC · UNRESOLVED. Ele diz **para o que** o campo pode contribuir na análise. Não define veto, lado, NO_TRADE, conviction nem precedência.

> **STATUS: PROVISIONAL_DESIGN_MAPPING** (correção de governança, 23/09). A associação dimensão → área foi **proposta pelo Claude Code**, não é regra empírica validada. Pode servir de estrutura inicial do pré-registro, mas qualquer uso dela para classificação direcional precisa ser pré-registrado explicitamente. Cada rota traz `possible_contribution_areas_status = PROVISIONAL_DESIGN_MAPPING`. Detalhe por mapeamento: `data/jev-provisional-mappings-v1.json`.

## 4. Famílias de evidência (`data/jev-evidence-families-v1.json`)

| Lineage | Tratamento |
|---|---|
| CONFIRMED / BY_CONSTRUCTION | podem consolidar em 1 família |
| SUSPECTED | separados, com `overlap_risk` |
| sem status medido (UNVERIFIED) | separados, com `overlap_risk` |
| PARTIAL_ANALOG | separados; sem fusão, sem normalização |
| `count_as 0` | família NON_EVIDENCE |

Contagem: 102 famílias.

| Tipo | Famílias |
|---|---|
| CONSOLIDATED | 8 |
| SEPARATE_SUSPECTED_OVERLAP | 16 |
| SEPARATE_SUSPECTED | 8 |
| SEPARATE_UNVERIFIED | 62 |
| SEPARATE_PARTIAL_ANALOG | 3 |
| NON_EVIDENCE | 5 |

As relações entre grupos continuam valendo:
- SPX × SPY: medir antes de somar.
- GammaGex × TRACE e GammaGex × VolSignals: independência UNKNOWN.
- ZERO_GAMMA × GEX0_SIGN: 1 família.
- Antes × depois de 09/09: nunca misturar.

Lineage desconhecida não é independência. As famílias organizam a análise; **a contagem de famílias não é decisão operacional**.

## 5. Data quality (entrada de classificação)

RTH, freshness, missing, stale e frozen existem **só** como DATA QUALITY / CLASSIFICATION INPUT. Nesta fase não há gate operacional nem regra automática.

- **Status:** VALID · DEGRADED · DATA_INVALID.
- **Freshness por fonte:** FRESH · STALE · FROZEN · FROZEN_VALUES · MARKET_CLOSED · UNKNOWN. A base é o vendor timestamp (feature contract §3).
- **Sessão:** RTH / fora do RTH, só informativo.

## 6. Contrato de saída (`data/jev-output-contract-v1.json`)

```
jev_market_state            target, evaluated_at e estado por dimensão
jev_directional_context     LONG_CONTEXT | SHORT_CONTEXT | NEUTRAL_CONTEXT |
                            CONFLICTED_CONTEXT | NO_TRADE_CONTEXT | UNKNOWN
native_dealer_state         leitura por dimensão das 4 fontes (famílias, freshness, notas)
native_directional_context  mesma escala de jev_directional_context, só com o estágio B
spx_final_context           trace{market_origin:SPX} · volsignals{market_origin:SPX} ·
                            numeric_equivalence_allowed:false ·
                            effect_on_native: CONFIRMS|CONTRADICTS|ENRICHES|NO_EFFECT|UNAVAILABLE
evidence_families           famílias usadas na leitura, com kind e overlap_risk
conflicts                   famílias com leituras opostas
data_quality                status + sessão + freshness por fonte
reason_codes                códigos que justificam a classificação
source_contributions        o que cada componente contribuiu
unresolved_fields           campos com semântica, unidade ou sinal UNKNOWN
menthorq                    confirmation POSITIVE|ZERO · policy POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING
conviction                  UNCALIBRATED
core_comparison             ALIGNED | CONTRARY | MIXED | UNKNOWN | NOT_AVAILABLE
core_comparison_pair        { futures_core_side, jev_directional_context }
versions                    decision_logic, feature_contract, dc_groups, evidence_families
```

- **`jev_directional_context` é classificação, não ordem de trade.** Nenhum desses estados se converte automaticamente em LONG, SHORT ou NO_TRADE operacional.
- **Estados distintos:**

| Estado | Significado |
|---|---|
| DATA_INVALID | dado insuficiente ou inválido. Fica em `data_quality.status`; o contexto sai UNKNOWN com reason `DATA_INVALID` |
| UNKNOWN | dado válido, mas o Jev não consegue classificar |
| NEUTRAL_CONTEXT | dado válido, sem inclinação |
| CONFLICTED_CONTEXT | dado válido, com famílias em leituras opostas |
| NO_TRADE_CONTEXT | dado válido; o Jev classifica o estado como desfavorável à exposição direcional. Os critérios são TO_BE_PREREGISTERED |

- **`core_comparison` é só comparação.**
  - Mesmo lado ⇒ ALIGNED.
  - Lado oposto ⇒ CONTRARY.
  - CONFLICTED_CONTEXT ⇒ MIXED.
  - NEUTRAL, NO_TRADE_CONTEXT ou UNKNOWN ⇒ UNKNOWN, com o par preservado.
  - Core sem lado ou ausente ⇒ NOT_AVAILABLE.
- **Classificação:** toda classificação cita `evidence_families`, `source_contributions` e `reason_codes`.

## 7. MenthorQ

POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING:

| Situação | Efeito |
|---|---|
| alinhado | confirmação positiva |
| desalinhado | zero |
| neutro | zero |
| stale ou offline | zero |

Sem veto, sem origem de lado e sem redução de conviction. As 9 estratégias contam como 1 família. A regra não se estende a TRACE, VolSignals nem às 4 fontes dealer.

## 8. Fora desta V1

Implementação · direção final de trade · fusão ou precedência Core × Jev · gates operacionais · pesos · probabilidade · regra de conviction · thresholds calibrados · NQ · integração com NT8 ou qualquer sistema atual · captura e validação (captura exige ordem explícita do operador; validação exige pré-registro).

**VALIDATION_HISTORY_TARGET: NON_BLOCKING** (correção de governança, 23/09). 20–40 pregões são alvo de evidência futura; **não** são gate de arquitetura, blocker de design, requisito para continuar nem condição para fechar fase. Nenhuma coleta começa sem ordem explícita.
