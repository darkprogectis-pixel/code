# HANDOFF — ALFA OMEGA JEV FUTURE (23/09/2026)

Sessão de origem: `aaa9a1de-6fbd-4ea3-8364-de3bd6dbac7b`, encerrada em ROTATE (227k). Este arquivo é autocontido: a próxima sessão **não** precisa reconstruir conversas anteriores.

> ## ⚠️ LEIA PRIMEIRO — divergência de estado (fato verificado em disco)
> O pedido de handoff do operador diz que a próxima fase é o PREREGISTRATION DESIGN V1 e que ela "ainda não começou". **Os artefatos dessa fase, porém, já foram criados nesta mesma sessão (aaa9a1de), por ordem explícita do operador no 3º turno.**
>
> | Artefato | Estado |
> |---|---|
> | `JEV_PREREGISTRATION_DESIGN_V1_20260923.md` | criado |
> | `data\jev-preregistered-rules-v1.json` | criado |
> | `data\jev-classification-state-machine-v1.json` | criado |
> | `data\jev-hypotheses-register-v1.json` | criado |
> | `data\jev-provisional-mappings-v1.json` | criado |
> | `scripts\build-jev-preregistration-design-v1.js` | criado |
> | Gerador | roda sem erro; cobertura 190/190 |
>
> **Estado real:**
> - DECISION LOGIC V1 = CLOSED.
> - PREREGISTRATION DESIGN V1 = CREATED, **aguardando revisão/aceite do operador**.
>
> A próxima sessão deve **revisar e conferir** esses artefatos contra o roteiro do §22. Não deve recriá-los do zero, e só os altera com ordem. Se o operador preferir refazer, a decisão é dele. O resumo do que já existe está no §21.

---

## 1. Estado global

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | RESEARCH / DESIGN ONLY |
| PRIMARY MARKET | ES FUTURES |
| PRIMARY OPTIONS / DEALER ECOSYSTEM | SPX / SPY |
| NQ | SECONDARY / OPTIONAL — NOT ACTIVE IN V1 |
| IMPLEMENTATION | NONE |
| PRODUCTION | OUT OF SCOPE / UNCHANGED |
| F5 | NOT PERFORMED |
| CURRENT PRODUCTION SYSTEM | FROZEN / OUT OF SCOPE / DO NOT MODIFY |
| WORKSPACE | `C:\Users\ADM\.claude\alfaomega-jev-future\` (documentos novos só aqui) |

**Nunca misturar com** (nem auditar, corrigir, abrir backlog de remediação ou reinterpretar):
- AOT atual, robo-trade, Consolidator atual, DarkFlow atual, Copilot atual;
- Directional Core V0, FlowOne atual;
- GammaGex/GexBot produção, NT8 atual, signal-engine atual;
- gate ES×NQ atual, Conviction atual.

O código atual pode ser **lido** só para aprender como uma fonte do Jev funciona. Não existe fase `MENTHORQ_CONFIRMATION_ONLY_REMEDIATION`.

## 2. Objetivo arquitetural

| | |
|---|---|
| JEV ROLE | SEPARATE MARKET-STATE / CONFLUENCE CLASSIFIER. Produz leitura própria do estado dealer/options e não é subordinado automaticamente ao Futures Core |
| FUTURES CORE | SEPARATE DETERMINISTIC SYSTEM |
| CORE_vs_JEV_FUSION_POLICY | UNDEFINED / TO_BE_PREREGISTERED |
| CORE_vs_JEV_CONFLICT_POLICY | UNDEFINED / TO_BE_PREREGISTERED |
| PRECEDENCE | NOT_DEFINED |
| FINAL TRADE DIRECTION | NOT_DEFINED |
| Uso do resultado do Core pelo Jev | **somente** `core_comparison`, nesta etapa |

## 3. Regra das quatro fontes (CANÔNICA)

O Jev analisa **integralmente** o conteúdo útil e documentado das quatro fontes:
1. AlfaOmegaNetGex0DTE
2. AlfaOmegaDexGexFlow
3. AlfaOmegaClassic
4. AlfaOmegaState

Não há pré-redução a poucas features. Todos os campos documentados ficam disponíveis; o contrato marca relevância, redundância, double counting, freshness e qualidade, mas não descarta.

| Feature Contract V1 | |
|---|---|
| TOTAL | 190 |
| 4-SOURCE | 174 |
| SPX FINAL CONTEXT | 16 (TRACE 9 + VolSignals 7) |
| FIELDS ROUTED | 190/190 |
| UNASSIGNED | 0 |
| FIELDS DROPPED | 0 |

- **190 campos ≠ 190 votos** (`is_vote=false` em todos).
- Lineage e double counting são obrigatórios.
- **`market_origin`:** as 4 fontes A-Bot têm `market_origin=SPX`. `underlying=ES_SPX` é só o mapeamento/escala do vendor, e "ES_DIRECT" descrevia a escala, não a origem. SPY = `market_origin=SPY`.

## 4. TRACE + VolSignals

| | |
|---|---|
| SpotGamma TRACE | `market_origin = SPX` |
| VolSignals | `market_origin = SPX` |
| Nunca | ES_NATIVE |
| Papel | FINAL_DECISION_CONTEXT_LAYER, **depois** da análise das 4 fontes dealer |
| Função | contextualizar, confirmar, contradizer semanticamente, enriquecer e interpretar o estado dealer/options |
| Fusão TRACE × VolSignals | proibida: namespaces separados |
| Gamma | PARTIAL_ANALOG (VolSignals "Simulated" × TRACE mm; protobuf × REST) |
| Outros 6 | INSUFFICIENT_INFORMATION |
| VolSignals units | UNKNOWN |
| numeric_equivalence_allowed | false |
| deltaExposureDiff | 3678/3678 = 0 · função UNKNOWN |
| Evidência faltante | `/v2/open_interest/intraday_delta` e vínculo do TRACE Delta Pressure = OPTIONAL_EVIDENCE_GAP (não bloqueia) |

## 5. Proveniência TRACE × VolSignals

| | |
|---|---|
| ANALYSIS AUTHOR | Claude Code, outra instância anterior |
| TRANSFER | HANDOFF |
| OPERATOR ROLE | só transportou o handoff entre instâncias. **Nunca** registrar como "operator-provided analysis" |

- **Artefatos originais** (READ-ONLY, se necessários; existência verificada em 23/09):
  - `C:\Users\ADM\.claude\volsignals-audit\VOLSIGNALS_VS_SPOTGAMMA_TRACE_COMPARISON.md`
  - `C:\Users\ADM\.claude\volsignals-audit\data\trace-comparison-map.json`
- **Projeto VolSignals:** ENCERRADO. Não reabrir aquela auditoria.

## 6. Auditoria das 4 fontes — achados relevantes

Relatórios:
- `ABOT_GAMMAGEX_ES_FIRST_AUDIT_20260923.md` (auditoria dos 4 indicadores);
- `ABOT_GAMMAGEX_JEV_FUTURE_AUDIT_20260923.md` (histórico, séries e majors).

**NetGex0DTE**
- Usa `net_0dte`.
- O rótulo visual BUY/SELL (cor) é derivado e **não** é verdade semântica: atribui lado a GEX (SEMANTIC_CONFLICT → DIAGNOSTIC_ONLY).
- Freshness pela chegada: FAIL-OPEN, pode enganar se o relay congelar. O indicador lê a raiz.

**DexGexFlow**
- Usa `gamma_condition`, spot, `zero_gamma`, majors, gex/dex/vanna/charm e levels.
- Vários níveis MenthorQ estavam null (MenthorQ 401) ou com rótulo errado: 7 das 15 linhas null.
- O heat trail é derivado no próprio indicador.
- Freshness pela chegada (FAIL-OPEN).

**Classic**
- Rotas `/gexbot/classic/{T}/{zero|one|full}`. O payload traz strikes, priors e max_priors.
- O default antigo NDX/90-day não pode ser confundido com SPX.
- A cópia do classic na raiz é o mesmo payload da rota `/gexbot/classic/SPX/zero`.
- O AoClassicCache existe e foi congelado (§7).

**State**
- É o único dos quatro com gregas por strike (`mini_contracts`: delta, gamma, vanna, charm) e perfil GEX do state.
- `sum_gex_vol` ≈ `net_0dte` observado (22.400,69 × 22.406,11).
- A convenção de sinal das gregas **não está resolvida**.
- `gex_oi = 0` no state ⇒ `major_*_oi` DEGENERATE.

**Outros achados**
- `ES_SPX` = preço do ESZ6 front (diff ≈ 0 ± 1,3 pt contra o NT8 `.ncd`). O roll do vendor foi entre 11 e 16/09.
- Antes de 09/09 era SPX cru, com quebra de fonte GexBot→GammaGex. **Nunca misturar antes × depois de 09/09.**
- Majors 0DTE do orderflow coincidem com os majors do classic em ≤ 7,7 %: são construtos distintos.
- `zero_mput` ("put support") ficou acima do spot 67 % de 23/09 ⇒ semântica UNKNOWN, só LOCATION neutra.
- `gamma_condition` ≡ sign(`gex0`) em 100 % desde 13/07. A concordância com spot × `zero_gamma` vai de 44 a 100 % por dia.
- Histórico do vendor capado em 10.000 linhas: ≈ 4 h de orderflow e ≈ 5 pregões de classic. O state não tem histórico.
- `gex-series` (30 s, desde 13/07) é a única série longa, só com agregados, e quebra em 09/09.
- `iv30d` = 14,47 congelado desde julho ⇒ UNUSABLE.
- O Jev lê `/gexbot/*` ou o :3530, nunca a raiz `/`.

**Double counting (1 família de origem):**
- `net_0dte` ≡ `gamma_condition` ≡ State imbalance (`sum_gex_vol` gex_zero) ≡ cor do NetGex0DTE.
- `ZERO_GAMMA` × `GEX0_SIGN` também = 1 família.

**Outros overlaps documentados:**
- majors repetidos entre orderflow, levels, classic, state e cache (1 por vencimento);
- `dex.net_*` × `pc_oi` (`pc_oi` = |put DEX| / |call DEX|, **não** é OI);
- classic raiz × rota `/gexbot/classic`;
- agregados × por strike (GEX, vanna, charm);
- GammaGex × TRACE (mesmo upstream `SPX_OPTIONS_TRADES`, independência UNKNOWN);
- GammaGex × VolSignals (independência UNKNOWN);
- SPX × SPY (medir antes de somar).

## 7. AoClassicCache

| | |
|---|---|
| CANONICAL SNAPSHOT | `C:\Users\ADM\.claude\alfaomega-jev-future\data\aoclassiccache-frozen\20260923\` |
| SOURCE | `C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AoClassicCache\` |
| FILES | 16 `.jsonl` (SPX full 03, 04, 05, 11, 16–23/09; NDX full 03, 04, 22, 23/09) + `MANIFEST.json` + `README.md` |
| SIZE | 6,453,452 bytes |
| DATE RANGE | 2026-09-02T19:59:59Z → 2026-09-23T19:59:58Z |
| AGGREGATE SHA256 | `992462a431e3800871e6ac2870ce564d5637a4af0a6ace2bdee91c68874df6d7` (conferido no MANIFEST) |
| INTEGRITY | PASS |
| READ_ONLY SNAPSHOT | YES |
| Redundant old copy | DELETED (`aoclassiccache-freeze-20260924T005055Z/`) |
| Source NT8 | UNCHANGED |

- **Uso:** só evidência para pesquisa futura; não é histórico suficiente para validação e não tem strikes.
- **Cuidados de leitura:** há linhas duplicadas (usar `distinct_t`); `file_date` ≠ pregão (recortar pelo `t`); SPX 05, 19 e 20/09 trazem só o estado de fechamento.
- **Novo congelamento:** só com ordem (`scripts/freeze-aoclassiccache.js`).

## 8. Feature Contract V1

**Arquivos:**
- `JEV_FEATURE_CONTRACT_V1_20260923.md`
- `data\jev-feature-contract-v1.json`
- `data\jev-double-counting-groups-v1.json`
- `scripts\build-jev-feature-contract-v1.js` (regenera)

| | |
|---|---|
| TOTAL FIELDS | 190 (4-source 174 · SPX final context 16) |
| Double counting groups | 36 |
| Fields dropped | 0 |
| Freshness rules | definidas; `freshness_basis = vendor_timestamp` |
| 60 s / 300 s | **PROVISIONAL**: nunca tratar como thresholds finais sem pré-registro |

Cada campo carrega 13 campos de lineage (contrato §6). Os templates ticker × categoria são `instances` (`<feature_id>@<ticker>/<categoria>`).

## 9. Decision Logic V1 — estado final corrigido

A primeira versão ficou contaminada por regras Core-dominant:
- "veredito = lado do Core";
- "NO_TRADE só por L0";
- "contexto nunca veta";
- "Jev sem efeito";
- conviction ±1.

O operador corrigiu, e a versão atual é a limpa.

**Artefatos canônicos atuais:**
- `JEV_DECISION_LOGIC_V1_20260923.md`
- `data\jev-decision-logic-v1.json`
- `data\jev-analysis-routes-v1.json`
- `data\jev-evidence-families-v1.json`
- `data\jev-output-contract-v1.json`
- `scripts\build-jev-decision-logic-v1.js`

| | |
|---|---|
| OLD CORE-DOMINANT RULES REMOVED | YES |
| FINAL_DIRECTION FIELD | ABSENT |
| CONVICTION_BAND | ABSENT |
| CORE-CAUSED NO_TRADE RULES | ABSENT |
| JEV OWN DIRECTIONAL CONTEXT | DEFINED |
| CORE_vs_JEV FUSION | UNDEFINED |
| FIELDS ROUTED | 190/190 |
| GENERATOR RESIDUAL GUARD | PASS (21 padrões, 5 arquivos; rerodado em 23/09 depois das correções de governança) |
| IMPLEMENTATION | NONE |
| PRODUCTION CHANGED | NO |
| F5 | NOT PERFORMED |

**Estágios:**

| Estágio | Conteúdo |
|---|---|
| A | Futures Core, externo; só `core_comparison` |
| B | as 4 fontes (174): `native_dealer_state` e `native_directional_context` |
| C | TRACE + VolSignals (16), depois de B: `spx_final_context` e `jev_directional_context` |
| D | overlay MenthorQ |

Não existe fusão B × C: o efeito de C fica em `spx_final_context.effect_on_native`.

## 10. Saída própria do Jev

`jev_directional_context`:
- LONG_CONTEXT
- SHORT_CONTEXT
- NEUTRAL_CONTEXT
- CONFLICTED_CONTEXT
- NO_TRADE_CONTEXT
- UNKNOWN

- **Isso é classificação, não ordem de trade.** NO_TRADE_CONTEXT não significa automaticamente NO_TRADE operacional.
- **Distinções:**

| Estado | Significado |
|---|---|
| DATA_INVALID | vive em `data_quality.status`; o contexto sai UNKNOWN com reason DATA_INVALID |
| UNKNOWN | dado válido, mas não classificável |
| NEUTRAL_CONTEXT | dado válido, sem inclinação |
| CONFLICTED_CONTEXT | famílias com leituras opostas |
| NO_TRADE_CONTEXT | estado desfavorável à exposição direcional; critérios a pré-registrar |

## 11. Output contract (`data\jev-output-contract-v1.json`)

Campos finais:
- `jev_market_state`
- `jev_directional_context`
- `native_dealer_state`
- `native_directional_context`
- `spx_final_context`
- `evidence_families`
- `conflicts`
- `data_quality`
- `reason_codes`
- `source_contributions`
- `unresolved_fields`
- `menthorq`
- `conviction`
- `core_comparison`
- `core_comparison_pair`
- `versions`

- **`conviction`:** UNCALIBRATED.
- **Não existe:** `final_direction`, `conviction_band`, score, probabilidade, peso, gate operacional.
- **`core_comparison`** (só comparação):

| Core × Jev | Resultado |
|---|---|
| mesmo lado | ALIGNED |
| lado oposto | CONTRARY |
| CONFLICTED_CONTEXT | MIXED |
| NEUTRAL, NO_TRADE_CONTEXT ou UNKNOWN | UNKNOWN (par preservado) |
| Core sem lado ou ausente | NOT_AVAILABLE |

## 12. Double counting / evidence families

| Lineage | Tratamento |
|---|---|
| CONFIRMED | pode consolidar |
| BY_CONSTRUCTION | pode consolidar |
| SUSPECTED | não consolidar automaticamente; separado com `overlap_risk` (substitui o feature contract §2.5) |
| UNVERIFIED | separado |
| PARTIAL_ANALOG | separado; sem normalização |
| count_as 0 | NON_EVIDENCE |

- **Lineage desconhecida ≠ independência.**
- **Famílias atuais: 102.**

| Tipo | Famílias |
|---|---|
| CONSOLIDATED | 8 |
| SEPARATE_SUSPECTED_OVERLAP | 16 |
| SEPARATE_SUSPECTED | 8 |
| SEPARATE_UNVERIFIED | 62 |
| SEPARATE_PARTIAL_ANALOG | 3 |
| NON_EVIDENCE | 5 |

- **A contagem de famílias não é decisão operacional.**

## 13. MenthorQ (regra imutável)

**MENTHORQ = POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING**

| Situação | Efeito |
|---|---|
| aligned | confirmação positiva |
| misaligned | zero |
| neutral | zero |
| stale | zero |
| offline | zero |
| unknown | zero |

| Pode? | |
|---|---|
| originar lado | NO |
| vetar | NO |
| bloquear | NO |
| reduzir conviction | NO |

- As 9 estratégias contam como **1 família de confirmação**.
- **Não** extrapolar para TRACE, VolSignals nem para as 4 fontes dealer.
- Decisão: `alfaomega-directional/DECISION_MENTHORQ_CONFIRMATION_ONLY_20260923.md`. Vale só no Jev Future, nunca retroativamente.

## 14. Data quality

- **Entradas:** RTH, freshness, missing, stale, frozen e market_closed são **DATA QUALITY / CLASSIFICATION INPUT**, não gates operacionais nesta fase.
- **Status:** VALID · DEGRADED · DATA_INVALID.
- **Freshness:** FRESH · STALE · FROZEN · FROZEN_VALUES · MARKET_CLOSED · UNKNOWN.
- **Base:** o vendor timestamp é preferido. Só o arrival timestamp nunca prova freshness; `_relay.served` descreve o cache (ttl 20 s), não o dado.
- **Fora do RTH:** MARKET_CLOSED, não STALE.

## 15. `possible_contribution_areas`

REGIME · LOCATION · FLOW · STRUCTURE · SENSITIVITY · CHANGE · CONTEXT · DIAGNOSTIC · UNRESOLVED

- **Origem:** associação proposta pelo **Claude Code** durante o design.
- **STATUS: PROVISIONAL_DESIGN_MAPPING.** Não é evidência empírica nem regra direcional validada. Precisa ser pré-registrada explicitamente antes de uso classificatório.
- **Aplicado em 23/09:**
  - gerador `build-jev-decision-logic-v1.js`: comentário, campo `possible_contribution_areas_status` em cada rota e política `POSSIBLE_CONTRIBUTION_AREAS`;
  - nota no §3 do doc da Decision Logic;
  - detalhe por mapeamento em `data\jev-provisional-mappings-v1.json`.

## 16. 20–40 pregões (correção de governança obrigatória)

**20–40 pregões de histórico futuro = NON_BLOCKING_VALIDATION_TARGET.**

Não são:
- gate do projeto;
- blocker de design;
- condição para avançar;
- condição para fechar fase arquitetural;
- condição para continuar hoje.

Qualquer coleta futura exige **ordem explícita do operador**. Nunca transformar "20–40 dias" em blocker.

**Corrigido em 23/09:**
- Decision Logic §8 e política `VALIDATION_HISTORY_TARGET`;
- `ABOT_GAMMAGEX_JEV_FUTURE_AUDIT` (A4 e §6.3);
- `ABOT_GAMMAGEX_ES_FIRST_AUDIT` (item 4);
- `gammagex-jev-candidates.json` e `abot-gammagex-audit/es-pattern-candidates.json`, com seus geradores;
- memórias.

## 17. Artefatos canônicos (paths relativos a `C:\Users\ADM\.claude\alfaomega-jev-future\`)

| Tipo | Arquivo |
|---|---|
| Escopo | `PROJECT_SCOPE_JEV_FUTURE_20260923.md` |
| Contrato dealer | `JEV_DEALER_CONTEXT_CONTRACT_20260923.md` |
| Auditoria | `ABOT_GAMMAGEX_JEV_FUTURE_AUDIT_20260923.md` |
| Auditoria 4 indicadores | `ABOT_GAMMAGEX_ES_FIRST_AUDIT_20260923.md` (medições em `data\abot-gammagex-audit\` **deste workspace**) |
| Feature contract | `JEV_FEATURE_CONTRACT_V1_20260923.md` |
| Decision logic | `JEV_DECISION_LOGIC_V1_20260923.md` |
| Lineage GammaGex | `data\gammagex-source-lineage.json` · `data\gammagex-field-inventory.json` · `data\gammagex-double-counting-map.json` · `data\gammagex-jev-candidates.json` |
| Contrato (máquina) | `data\jev-feature-contract-v1.json` · `data\jev-double-counting-groups-v1.json` |
| Decision logic (máquina) | `data\jev-decision-logic-v1.json` · `data\jev-analysis-routes-v1.json` · `data\jev-evidence-families-v1.json` · `data\jev-output-contract-v1.json` |
| Snapshot | `data\aoclassiccache-frozen\20260923\MANIFEST.json` · `README.md` |
| Geradores | `scripts\build-jev-feature-contract-v1.js` · `scripts\build-jev-decision-logic-v1.js` |
| **Pré-registro (já criado, em revisão; §21)** | `JEV_PREREGISTRATION_DESIGN_V1_20260923.md` · `data\jev-preregistered-rules-v1.json` · `data\jev-classification-state-machine-v1.json` · `data\jev-hypotheses-register-v1.json` · `data\jev-provisional-mappings-v1.json` · `scripts\build-jev-preregistration-design-v1.js` |

## 18. Arquivos errados / não usar

Os artefatos da P2 em `C:\Users\ADM\.claude\alfaomega-directional\` são **WRONG-SCOPE · HISTORICAL ONLY · CANCELLED**:
- `ABOT_GAMMAGEX_DIRECTIONAL_AUDIT_P2_20260923.md`;
- `C:\Users\ADM\.claude\alfaomega-directional\data\abot-gammagex-audit\`.

Não usar como spec nem como backlog, e não reabrir.

⚠️ **Não confundir** com `C:\Users\ADM\.claude\alfaomega-jev-future\data\abot-gammagex-audit\`, o diretório homônimo **deste** workspace: esse contém as medições da auditoria dos 4 indicadores (§6) e é válido.

Também não usar:
- `data\jev-preregistration-design-v1.json`: rascunho do 1º turno que tratava 20/40 como pré-condição. **Apagado.**
- A 1ª versão Core-dominant da Decision Logic, já superada (§9).

## 19. Último estado confirmado

| Fase | Estado |
|---|---|
| DECISION LOGIC V1 | **CLOSED:** defined, cleaned, 190/190 routed; no implementation, no production change, no F5 |
| Correções de governança A e B (§15, §16) | **APLICADAS** |
| PREREGISTRATION DESIGN V1 | **CREATED nesta sessão; aguardando revisão/aceite do operador** (ver aviso no topo e §21) |

## 20. Próxima fase

**NEXT PHASE: JEV FUTURE — PREREGISTRATION DESIGN V1**: revisão, conferência e aceite dos artefatos já criados; ajustes só com ordem.

- Desenha só a lógica interna do Jev.
- Não implementar, não coletar dados, não validar.
- Não definir a fusão Core × Jev.

## 21. O que já existe do PREREGISTRATION DESIGN V1 (para a revisão)

- **Regenerar e conferir:**
  ```
  node C:\Users\ADM\.claude\alfaomega-jev-future\scripts\build-jev-preregistration-design-v1.js
  ```
  O gerador falha se: cobertura ≠ 190/190; regra sem um dos 7 campos; status fora do enum; regra ativa emitindo lado; regra ativa com pré-condição UNMET; família DC inexistente; C com origem ≠ SPX; contagem simples; rota sem o status provisório.

- **58 regras.** Cada uma tem os 7 campos obrigatórios, mais `origin` (CANON_EXISTING | THIS_DESIGN) e `emits_side`.

  | Status | Regras |
  |---|---|
  | CANONICAL_STRUCTURAL | 21: R_S01–R_S21 |
  | SUPPORTED_SEMANTIC | 10: R_M01 regime 0DTE · R_M02 next/full · R_M03 location · R_M04 strike structure · R_M05 regime transition · R_M06 level transition · R_M07 net sign change · R_M08 DEX put/call ratio · R_M09 TRACE regime compare · R_M10 TRACE participants. **Nenhuma emite lado** |
  | HYPOTHESIS_TO_TEST | 10: HT01 DEX direction by regime · HT02–HT04 níveis (citam os negativos da 1C) · HT05 amplitude · HT06 efeito do CONTRADICTS · HT07 · HT08 · HT09 alinhamento MenthorQ · HT10 SPY |
  | BLOCKED_BY_UNKNOWN_SEMANTICS | 10: B01 vanna/charm · B02 gregas do state · B03 cvr/oflow · B04 priors · B05 zero_mput · B06 skew · B07 TRACE pressures · B08 VolSignals · B09 VolSignals gamma · B10 C originando lado |
  | DIAGNOSTIC_ONLY | 7: D01–D07 |

- **Consequência:** nenhuma regra ativa emite lado ⇒ no registro V1 só **UNKNOWN** é alcançável. LONG/SHORT/NEUTRAL/CONFLICTED só no braço de pesquisa (offline, NOT IMPLEMENTED).
- **JEV CLASSIFICATION STATES:** INCOMPLETE.
- **NO_TRADE_CONTEXT_CRITERIA:** UNDEFINED (nenhum candidato inventado).
- **Três regras estruturais "THIS_DESIGN"** que pedem aceite explícito do operador:
  - R_S10: definição de DATA_INVALID, DEGRADED e VALID;
  - R_S15: só regras ativas no registro;
  - R_S18: rótulo único de `effect_on_native`.

## 22. Roteiro da próxima sessão (ordem exata)

A coluna "Estado" diz o que já foi feito nesta sessão, e a próxima sessão **confere** isso em vez de refazer.

| Step | Ação | Estado |
|---|---|---|
| 1 | Ler só o contexto mínimo: este HANDOFF · `PROJECT_SCOPE_JEV_FUTURE_20260923.md` · `JEV_DEALER_CONTEXT_CONTRACT_20260923.md` · `JEV_FEATURE_CONTRACT_V1_20260923.md` · `JEV_DECISION_LOGIC_V1_20260923.md` · `data\jev-feature-contract-v1.json` · `data\jev-analysis-routes-v1.json` · `data\jev-evidence-families-v1.json` · `data\jev-output-contract-v1.json` (os JSONs grandes só por trecho ou script). Evitar reler histórico amplo | a fazer |
| 2 | Confirmar os invariantes: 190/190 routed · 174 das 4 fontes · 16 SPX final context · 0 unassigned · 0 dropped | a fazer (rodar os geradores) |
| 3 | Marcar `possible_contribution_areas` = PROVISIONAL_DESIGN_MAPPING | **feito**: conferir |
| 4 | Marcar 20–40 pregões = NON_BLOCKING_VALIDATION_TARGET | **feito**: conferir |
| 5 | Regras para REGIME, LOCATION, STRUCTURE, FLOW, DELTA POSITIONING, SENSITIVITY, SECOND-ORDER FLOWS, CHANGE/TRANSITION e SPX FINAL CONTEXT | **feito**: revisar |
| 6 | Cada regra com `rule_id`, `description`, `input_families`, `required_quality`, `semantic_preconditions`, `output_effect` e `status` ∈ {CANONICAL_STRUCTURAL, SUPPORTED_SEMANTIC, HYPOTHESIS_TO_TEST, BLOCKED_BY_UNKNOWN_SEMANTICS, DIAGNOSTIC_ONLY} | **feito** (o gerador impõe) |
| 7 | Não inventar polaridade: sinal UNKNOWN ⇒ BLOCKED_BY_UNKNOWN_SEMANTICS (vanna, charm, volga, gregas do State; DEX sem regra comprovada) | **feito**: DEX = HT01 com pré-condição UNMET ⇒ UNRESOLVED no registro |
| 8 | Como `native_dealer_state` + SPX final context produzem os 6 estados, sem virar ordem | **feito**: máquina de estados |
| 9 | Não usar majority vote, X/9, `n_support > n_contradict`, contagem de campos ou de famílias como decisão | **feito** (R_S04; o gerador bloqueia) |
| 10 | TRACE/VolSignals: SPX only, FINAL_DECISION_CONTEXT_LAYER, depois do nativo, sem normalização numérica nem equivalência forçada | **feito** (R_S06, R_S17, R_S18) |
| 11 | MenthorQ exatamente POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING | **feito** (R_S19, HT09) |
| 12 | Os 5 artefatos (MD + 4 JSONs) | **feito**: revisar e aceitar ou ajustar, só com ordem |
| 13 | Não começar coleta nem validação; não implementar runtime; não tocar o NT8; não dar F5 | vale sempre |

## 23. NEXT SESSION STARTER PROMPT

```
Projeto ALFA OMEGA JEV FUTURE (C:\Users\ADM\.claude\alfaomega-jev-future\). Leia PRIMEIRO
HANDOFF_JEV_FUTURE_20260923.md, inclusive o aviso do topo. Decision Logic V1 está FECHADA; não reabra
auditorias (A-Bot, TRACE×VolSignals, P2). Execute apenas a fase PREREGISTRATION DESIGN V1: os artefatos
já existem (MD + 4 JSONs + gerador) — regenere, confira contra o roteiro do §22 e apresente ao
operador para aceite; altere só com ordem. Regras: 190/190 campos (174 + 16), nenhum descarte,
190 campos != 190 votos; TRACE/VolSignals = market_origin SPX, FINAL_DECISION_CONTEXT_LAYER, sem
fusão nem equivalência numérica; MenthorQ = POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING; fusão/conflito/
precedência Core×Jev = UNDEFINED; possible_contribution_areas = PROVISIONAL_DESIGN_MAPPING; 20–40
pregões = NON_BLOCKING_VALIDATION_TARGET; não inventar polaridade; sem contagem de votos. Sem
implementação, sem coleta, sem validação, sem mudança de produção, sem F5.
```

## 24. Comando para abrir a próxima sessão

```
node "C:\Users\ADM\.claude\alfaomega-context\scripts\start-alfaomega-session.js" --task "jev-future-preregistration-design-v1" --profile research-directional --mode interactive
```

## 25. Não fazer nesta sessão (aaa9a1de)

Depois deste handoff, nada mais foi iniciado: nenhuma pesquisa, nenhum artefato novo, nenhuma mudança de produção, nenhum F5.
