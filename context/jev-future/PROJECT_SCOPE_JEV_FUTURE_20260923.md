# PROJECT SCOPE — ALFA OMEGA JEV FUTURE (23/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | RESEARCH / DESIGN ONLY |
| CURRENT PRODUCTION PROJECT | OUT OF SCOPE / UNCHANGED |
| PRIMARY MARKET | ES FUTURES |
| PRIMARY OPTIONS/DEALER ECOSYSTEM | SPX / SPY |
| NQ | SECONDARY / OPTIONAL |
| JEV ROLE | FUTURE MARKET-STATE / CONFLUENCE CLASSIFIER |
| MENTHORQ ROLE | POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING |
| A-BOT ROLE | FUTURE DEALER / 0DTE / DEX-GEX CONTEXT SOURCE |
| IMPLEMENTATION | NONE |
| CURRENT SYSTEM CHANGES | NONE |

## Regras de escopo
- **Fora de escopo, e sem alteração, auditoria para remediação ou reinterpretação:**
  - AOT, robo-trade, Consolidator, DarkFlow e signal-engine;
  - Copilot, Directional Core V0 e FlowOne;
  - GammaGex, GexBot e NT8;
  - gate ES×NQ e Conviction atuais.
- **As regras abaixo valem só para este projeto futuro e nunca retroativamente ao sistema pronto:**
  - ES-first;
  - SPX/SPY como ecossistema principal e NQ secundário;
  - A-BOT como fonte de contexto;
  - níveis 0DTE, DEX/GEX, dealer state e padrões ES;
  - Jev como classificador;
  - MenthorQ só como confirmação positiva.
- **Código atual:** só como referência de leitura, quando for explicitamente para aprender como uma fonte do projeto Jev funciona. Nunca autoriza editar, corrigir, refatorar ou mudar comportamento.
- **Sem fase ou backlog de remediação** do sistema atual. Em especial, não existe `MENTHORQ_CONFIRMATION_ONLY_REMEDIATION`.
- **Os achados da P2 de 23/09 sobre sistemas atuais** (robo-trade, Consolidator, AOT, DarkFlow, Copilot, V0) foram erro de escopo. Ficam só como histórico da sessão 32d77912 e não geram ação.

## Pesquisa permitida (design do novo sistema)
- dados A-BOT/GammaGex existentes;
- níveis 0DTE úteis ao ES;
- campos DEX/GEX;
- mapeamento SPX/SPY→ES;
- causalidade das features e freshness;
- source lineage e double counting;
- padrões candidatos ES;
- contrato de entrada compacto para o Jev;
- contrato de saída LONG/SHORT/NO_TRADE;
- arquitetura shadow.

Documentos novos desta arquitetura ficam **só** nesta pasta (`C:\Users\ADM\.claude\alfaomega-jev-future\`).

## Regras arquiteturais — camada dealer/options (23/09, canônicas)
Contrato completo: `JEV_DEALER_CONTEXT_CONTRACT_20260923.md`.

- **Quatro fontes completas.** NetGex0DTE, DexGexFlow, Classic e State são analisadas por inteiro, raw e derived, com lineage. Nada de pré-redução a poucas features: o feature contract marca relevância, redundância, double counting, freshness e qualidade, mas não descarta.
- **Papel da camada.** DEALER / OPTIONS / MARKET-STATE CONTEXT. Não é originador obrigatório, nem veto, nem gate, nem substituto do Futures Core.
- **Origem de TRACE e VolSignals.** `market_origin = SPX`, nunca ES_NATIVE. Papel: **FINAL_DECISION_CONTEXT_LAYER**, depois das quatro fontes nativas.
- **TRACE × VolSignals.**
  - Gamma é PARTIAL_ANALOG.
  - Os outros 6 campos são INSUFFICIENT_INFORMATION.
  - Unidades VolSignals UNKNOWN ⇒ sem equivalência numérica.
  - `deltaExposureDiff`: função UNKNOWN.
- **Evidência faltante** (`/v2/open_interest/intraday_delta`, vínculo com o Delta Pressure) = OPTIONAL_EVIDENCE_GAP, sem bloqueio.
- **Lineage** mínimo por campo e **double counting** por grupo são obrigatórios.

## Estado (não altera o escopo)
- **AoClassicCache snapshot: FROZEN** (23/09, sessão 4f178371).
  - Path: `data\aoclassiccache-frozen\20260923\` (16 arquivos, 6.453.452 bytes, sha256 agregado `992462a4…`).
  - Integrity: PASS.
  - Purpose: só evidência para pesquisa futura. Não é histórico suficiente para validação; qualquer uso exige nova ordem.
- **Feature contract V1: CREATED** (23/09).
  - Arquivos: `JEV_FEATURE_CONTRACT_V1_20260923.md`, `data/jev-feature-contract-v1.json` e `data/jev-double-counting-groups-v1.json`.
  - Gerador: `scripts/build-jev-feature-contract-v1.js`.
  - Conteúdo: 190 campos (174 das 4 fontes + 16 `spx_final_context`), 36 grupos de double counting, 0 campos descartados.
  - Sem implementação, score, pesos nem lado.
- **Decision logic V1: DEFINED** (23/09, sessão 87127a25). Design only, SHADOW ONLY, UNTESTED.
  - Arquivos: `JEV_DECISION_LOGIC_V1_20260923.md` e `data/jev-{decision-logic,analysis-routes,evidence-families,output-contract}-v1.json`. Gerador: `scripts/build-jev-decision-logic-v1.js`.
  - Previous draft superseded; non-canonical Core-dominant rules removed. Gerador com guarda de resíduos: PASS. FINAL TRADE DIRECTION: NOT DEFINED.
  - **Papéis separados:**
    - Futures Core: SEPARATE DETERMINISTIC SYSTEM.
    - Jev: SEPARATE MARKET-STATE / CONFLUENCE CLASSIFIER, com leitura própria (LONG/SHORT/NEUTRAL/CONFLICTED/NO_TRADE_CONTEXT/UNKNOWN).
    - Fusão, conflito e precedência Core × Jev: UNDEFINED / TO_BE_PREREGISTERED.
    - NO_TRADE: não fixado. Conviction: UNCALIBRATED.
  - **Rotas:** 190/190 (B 174 · C 16), 0 unassigned, `is_vote=false`.
  - **Famílias:** 102. CONFIRMED/BY_CONSTRUCTION consolidam (8); SUSPECTED, UNVERIFIED e PARTIAL_ANALOG ficam separados com `overlap_risk`.
- **Governança (23/09, ordem do operador):**
  - `possible_contribution_areas` = PROVISIONAL_DESIGN_MAPPING (proposto pelo Claude Code, não empírico).
  - VALIDATION_HISTORY_TARGET (20–40 pregões) = NON_BLOCKING: não é gate nem condição de fase.
  - Nenhuma coleta sem ordem.
- **Preregistration design V1: CREATED** (23/09, sessão aaa9a1de). Só a lógica interna do Jev; fusão Core × Jev UNDEFINED.
  - Arquivos: `JEV_PREREGISTRATION_DESIGN_V1_20260923.md` e `data/jev-{preregistered-rules,classification-state-machine,hypotheses-register,provisional-mappings}-v1.json`. Gerador: `scripts/build-jev-preregistration-design-v1.js`.
  - 58 regras: 21 CANONICAL_STRUCTURAL, 10 SUPPORTED_SEMANTIC, 10 HYPOTHESIS_TO_TEST, 10 BLOCKED, 7 DIAGNOSTIC. Cobertura 190/190.
  - Nenhuma regra ativa emite lado ⇒ no registro V1 só UNKNOWN é alcançável. Classification states: INCOMPLETE. NO_TRADE_CONTEXT_CRITERIA: UNDEFINED.
  - VALIDATION: NOT STARTED.
- **CURRENT PHASE: HANDOFF COMPLETE** (sessão aaa9a1de). Handoff em `HANDOFF_JEV_FUTURE_20260923.md`.
  - NEXT PHASE: JEV FUTURE PREREGISTRATION DESIGN V1, para revisar e aceitar os artefatos já criados.
