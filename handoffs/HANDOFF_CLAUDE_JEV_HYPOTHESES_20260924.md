# HANDOFF — FRENTE C: HYPOTHESES + UNKNOWN SEMANTICS TRIAGE (24/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| FRENTE | C — triagem de 10 HYPOTHESIS_TO_TEST + 10 BLOCKED_BY_UNKNOWN_SEMANTICS |
| PAPEL | auditor (não integrador final) |
| STATUS | COMPLETE |
| CANONICAL FILES CHANGED | **NO** |
| IMPLEMENTATION | NONE |
| DATA COLLECTION | NONE |
| PRODUCTION | UNCHANGED |
| F5 | NOT PERFORMED |
| CORE×JEV FUSION | não definida (continua UNDEFINED) |
| INTERNET | não usada |

## 0. Base de evidência (só artefatos existentes)

Lidos (cópias do repo `context/jev-future/`, **byte-idênticas** ao workspace canônico `C:\Users\ADM\.claude\alfaomega-jev-future\`, conferido por `cmp` em 8 arquivos):

- `HANDOFF_JEV_FUTURE_20260923.md`
- `JEV_PREREGISTRATION_DESIGN_V1_20260923.md` §4–§12
- `data/jev-preregistered-rules-v1.json` (sha256 `beb7d1c777c3217e…`)
- `data/jev-hypotheses-register-v1.json` (sha256 `d3582047fb9a2dbd…`)
- `data/jev-evidence-families-v1.json` (sha256 `3e5bac6f7e63b7f4…`)
- `data/jev-classification-state-machine-v1.json`, `jev-provisional-mappings-v1.json`, `jev-analysis-routes-v1.json`, `jev-feature-contract-v1.json`, `jev-output-contract-v1.json`
- `ABOT_GAMMAGEX_JEV_FUTURE_AUDIT_20260923.md` (A1–A8, adendo 24/09), `ABOT_GAMMAGEX_ES_FIRST_AUDIT_20260923.md`, `JEV_DEALER_CONTEXT_CONTRACT_20260923.md` §5
- READ-ONLY, só grep: `C:\Users\ADM\.claude\volsignals-audit\VOLSIGNALS_VS_SPOTGAMMA_TRACE_COMPARISON.md` (nenhuma evidência nova de sinal/unidade; confirma `unitFrozen`, `explicitUnit: NOT_FOUND`)

O gerador `build-jev-preregistration-design-v1.js` **não** foi rodado (reescreveria artefatos canônicos). A auditoria de invariantes foi feita por script próprio, somente leitura, fora do repo (scratchpad da sessão `audit-front-c.js`).

---

## 1. Auditoria de invariantes

| Invariante | Resultado | Evidência |
|---|---|---|
| Nenhuma HT vaza para o registro V1 | **PASS** | pipeline da state machine (passos 1–9) não referencia nenhum `HT*`/`B*`; `states.*.reachable_in_record_v1` = true só para UNKNOWN; R_S15; `fields_side_capable_in_record = 0`; 0 rotas referenciam HT/B |
| Nenhuma BLOCKED emite lado | **PASS** | 10/10 `emits_side=false` |
| Nenhuma regra ativa emite lado | **PASS** | 31 ativas (21 CANONICAL + 10 SUPPORTED), 0 com `emits_side=true` |
| `possible_contribution_areas` = PROVISIONAL_DESIGN_MAPPING | **PASS** | 190/190 rotas com `possible_contribution_areas_status`; 13/13 mapeamentos com `directional_use = NOT_ALLOWED_WITHOUT_PREREGISTRATION` |
| Lineage desconhecida ≠ independência | **PASS (estrutural)**, com 3 observações (§1.1) | 0 famílias UNVERIFIED/SUSPECTED/PARTIAL_ANALOG consolidadas; todas carregam `overlap_risk`; state machine passo 5: famílias com overlap que concordam não somam |
| 190 campos ≠ 190 votos | **PASS** | 190/190 rotas `is_vote=false` (o flag vive em `jev-analysis-routes-v1.json`, não no feature contract); R_S04 proíbe contagem |
| MenthorQ positive-only / non-blocking | **PASS** | R_S19 literal; enum `menthorq_confirmation = [POSITIVE, ZERO]`; HT09 `emits_side=false`, "nunca negativo"; D07 null ⇒ ZERO |
| C nunca ES_NATIVE | **PASS** | 16/16 campos C com `market_origin=SPX`; nenhum campo `ES_NATIVE` (170 SPX + 20 UNKNOWN = MenthorQ levels + blocos legados) |
| NO_TRADE sem candidato importado | **PASS** | `no_trade_context.criteria = UNDEFINED`, 0 candidatos |
| Sem `final_direction` / `conviction_band` | **PASS** | ausentes do `shape` do output contract |

### 1.1 Observações (não são falhas de invariante; não corrigidas)

- **OBS-1 · risk reversal contado em 2 famílias apesar de lineage conhecida.** `abot.root.classic.delta_risk_reversal` e `abot.classic.delta_risk_reversal` estão como duas famílias `SEPARATE_UNVERIFIED`. Mas o próprio feature contract diz que a raiz é "mesmo payload e instante que /gexbot/classic/SPX/zero ⇒ nunca evidência separada", e o handoff §6 confirma a cópia raiz = rota. A lineage é BY_CONSTRUCTION (ao menos para a instância `@zero`). Hoje é inofensivo porque B06 bloqueia, mas é lineage conhecida tratada como UNVERIFIED.
- **OBS-2 · risco inverso: conflito inflado.** O passo 4 da máquina ("famílias distintas em sentidos opostos ⇒ CONFLICTED") pode produzir CONFLICTED a partir de famílias separadas só por lineage desconhecida (ex.: DEX agregado × delta por strike do state, SUSPECTED/HIGH). Vale só no braço de pesquisa hoje. Registrar antes de qualquer promoção.
- **OBS-3 · divergência histórica de agrupamento.** A auditoria A-BOT (§3) agrupa "DEX, CVR, vanna, charm, state delta/vanna/charm" como **1** família `ABOT_DEALER_DELTA`; as evidence families V1 mantêm separado (UNVERIFIED/SUSPECTED). É compatível **só** porque famílias separadas não somam. Se alguma vez somarem, a divergência vira double counting.
- **OBS-4 · ESF4 da auditoria A-BOT** ("DEALER_HEDGE_CONFLICT: hedge esperado × lado dos futuros ⇒ NO_TRADE_CONTEXT") é um critério NO_TRADE causado pelo Core, logo política Core×JEV. Não está importado (PASS acima). **Nunca** importar como candidato NO_TRADE do Jev.

---

## 2. As 10 HYPOTHESIS_TO_TEST

Legenda das classes: **A** DOCUMENTATION_RESOLVABLE · **B** REQUIRES_EMPIRICAL_VALIDATION · **C** REQUIRES_VENDOR_SEMANTICS · **D** NOT_DIRECTIONAL · **E** REDUNDANT_OR_BY_CONSTRUCTION. A classe primária vem primeiro; a secundária entre parênteses. **Nenhuma hipótese foi promovida.**

### 2.1 Tabela-resumo

| rule_id | lado? | classe | afeta registro V1 hoje? | validação histórica? |
|---|---|---|---|---|
| HT01_DEX_DIRECTION_BY_REGIME | sim | **C** (→ B) | não (UNRESOLVED) | sim, depois de C |
| HT02_POSITIVE_GAMMA_LEVEL_REVERSION | sim | **B** (+ correção A de escopo) | não | sim |
| HT03_NEGATIVE_GAMMA_LEVEL_CONTINUATION | sim | **B** (+ correção A de escopo) | não | sim |
| HT04_LEVEL_MIGRATION_SIDE | sim | **B** (+ lacuna A em R_M06) | não | sim |
| HT05_REGIME_AMPLITUDE | não | **D** (→ B) | não | sim (amplitude) |
| HT06_SPX_CONTRADICTS_EFFECT | não (modula) | **D** (dormente) | não | só depois que existir regra de lado ativa |
| HT07_TRACE_REGIME_AGREEMENT_RELIABILITY | não | **D** (→ B; risco E) | não | sim (amplitude) |
| HT08_EXPIRY_REGIME_DIVERGENCE | não | **E** (resto → B) | não | só o resíduo |
| HT09_MENTHORQ_ALIGNMENT_DEFINITION | não (+/0) | **A** (dependência C) | não (ZERO de qualquer forma) | não é hipótese empírica |
| HT10_SPY_INSTANCE_ROLE | não | **D** (→ B, medição de lineage) | não | medição curta, não validação de retorno |

### 2.2 Ficha por hipótese

**HT01_DEX_DIRECTION_BY_REGIME**
- **Claim:** o sinal de `dex.net_0dte`, condicionado ao regime R_M01 (não AMBIGUOUS), indica o lado do fluxo de hedge do dealer.
- **Famílias:** `EF_DC_DEX_0DTE` (CONSOLIDATED/CONFIRMED: `dex.net/agg/call/put_0dte` + `pc_oi`) · `EF_DC_GEX0_SIGN` (condicionante, não evidência extra) · SUSPECTED/HIGH: `state_greek.delta` por strike (greek_value e priors).
- **Contribuição possível (PROVISIONAL):** FLOW, SENSITIVITY (DELTA_POSITIONING, confiança LOW).
- **Premissas semânticas:** (1) sinal do DEX em perspectiva do dealer, `SP_DEX_SIGN_CONVENTION` = **UNMET**; (2) unidade UNKNOWN ("$MM presumido, sem doc"); (3) modelo de inversão de hedge por regime (regra "I1" citada na auditoria A-BOT): teórico, não documentado como validado nos artefatos.
- **Lineage:** `LG_ORDERFLOW_SPX`; quebra de fonte em 09/09 (dex0 mediana 1.166→1.627; `pc_oi` 0,94→1,54).
- **Risco DC:** alto. `pc_oi` é razão do mesmo DEX (BY_CONSTRUCTION). O delta por strike do state é SUSPECTED/HIGH e não pode confirmar o agregado. O regime entra como condição, nunca como segunda confirmação.
- **market_origin:** SPX.
- **Falsificaria:** com a convenção fixada por documentação, o teste pré-registrado (split por pregão, holdout único, dayScore causal, placebos, FDR) não mostra efeito, ou o sinal do efeito inverte entre pré e pós-09/09.
- **Suportaria:** documentação do vendor fixando a perspectiva + efeito no holdout acima dos placebos, estável no pós-09/09.
- **Validação histórica:** sim, **depois** da semântica. A evidência anterior do projeto (HIRO como lado, REPROVADO) não se transfere.
- **Afeta o registro V1 hoje:** não. A leitura fica UNRESOLVED (R_S14/R_S15).
- **Classe:** **C** primária; B só depois de C.

**HT02_POSITIVE_GAMMA_LEVEL_REVERSION**
- **Claim:** em POSITIVE_GAMMA, o preço afastado do major/long-gamma 0DTE tende a voltar em direção a ele.
- **Famílias:** `EF_DC_MAJORS_0DTE` (CONSOLIDATED, 22 membros) · `EF_DC_ZERO_GAMMA_0DTE` · `EF_DC_GEX0_SIGN` · `DC_SPOT_PRICE` (NON_EVIDENCE).
- **Contribuição:** LOCATION/STRUCTURE (HIGH), mas R_S13 proíbe location ⇒ lado sem pré-registro.
- **Premissas:** `SP_MAJORS_UNITS` MET; `SP_MAJORS_IDENTITY_RTH` **PARTIAL** (identidades medidas só pós-fechamento). A1: majors 0DTE do orderflow ≠ majors do classic (≤ 7,7 % de coincidência) ⇒ o "major" do claim precisa ser nomeado.
- **⚠ Achado de escopo:** a família `DC_MAJORS_0DTE` inclui `zero_mcall`/`zero_mput`, cuja semântica é UNKNOWN (A2, B05). Como está escrita, a hipótese deixa B05 vazar para o braço de pesquisa. O input precisa ser restringido explicitamente (ex.: só `z_mlgamma`) — correção A, **só com ordem do operador**.
- **Lineage:** orderflow SPX em escala ES_SPX; só pós-09/09; níveis interpolados (não strikes da grade).
- **Risco DC:** majors repetidos em orderflow/levels/classic/state/cache (1 por vencimento); zero gamma e sinal do GEX = 1 família (A3).
- **market_origin:** SPX.
- **Falsificaria:** nenhuma reversão condicionada acima dos placebos no holdout; ou efeito indistinguível do resultado negativo 1C (walls SpotGamma).
- **Suportaria:** reversão pré-registrada, significativa após FDR, declarada como reabertura pela regra 1 (dataset diferente) **antes** do teste.
- **Validação histórica:** sim. Precondição curta: 1 sessão RTH para `SP_MAJORS_IDENTITY_RTH`.
- **Afeta o registro V1:** não.
- **Classe:** **B** (+ correção A de escopo).

**HT03_NEGATIVE_GAMMA_LEVEL_CONTINUATION**
- **Claim:** em NEGATIVE_GAMMA, o preço que atravessa o major short-gamma 0DTE tende a continuar no sentido do cruzamento.
- **Famílias:** MAJORS_0DTE, GEX0_SIGN, SPOT.
- **Premissas, lineage, DC e origin:** iguais a HT02, com o mesmo achado de escopo (restringir a `z_msgamma`).
- **Premissa extra:** "atravessar" exige definir o cruzamento de um nível interpolado sem tolerância (não há threshold calibrado).
- **Falsificaria:** continuação pós-cruzamento não distinta de placebo; 1C já reprovou cruzamento do ZG (SpotGamma).
- **Suportaria:** continuação pré-registrada no holdout, com reabertura regra 1.
- **Validação histórica:** sim.
- **Afeta o registro V1:** não.
- **Classe:** **B** (+ correção A).

**HT04_LEVEL_MIGRATION_SIDE**
- **Claim:** `LEVEL_MIGRATION` intradia (R_M06) dos majors 0DTE UP/DOWN antecede movimento do ES no mesmo sentido.
- **Famílias:** MAJORS_0DTE.
- **Premissas:** `SP_MAJORS_IDENTITY_RTH` PARTIAL.
- **⚠ Lacuna de documentação em R_M06 (regra ATIVA):** R_M06 define migração como "nível muda de strike", mas A2 registra que os majors 0DTE são **interpolados** (fração mod 5 variável), não strikes da grade. Sem uma definição discreta, quase todo snapshot vira "migração". Não é resolvível por inferência: é decisão de design do operador (discretização sem threshold calibrado, ou restringir a níveis na grade).
- **Lineage/DC:** como HT02. Os dois snapshots devem estar do mesmo lado de 09/09.
- **market_origin:** SPX.
- **Falsificaria:** migração não antecede o ES acima de placebo; 1C reprovou o shift overnight de walls (esta é intradia e outro dataset: regras 1 e 3).
- **Suportaria:** efeito intradia pré-registrado no holdout.
- **Validação histórica:** sim.
- **Afeta o registro V1:** não. R_M06 registra só o descritor, com direction 0.
- **Classe:** **B** (+ lacuna A em R_M06).

**HT05_REGIME_AMPLITUDE**
- **Claim:** o regime R_M01 prediz amplitude |retorno|: NEGATIVE_GAMMA > POSITIVE_GAMMA.
- **Famílias:** GEX0_SIGN + ZERO_GAMMA_0DTE (**1 família**, 2 leituras: FLOW_REGIME × STRUCTURAL_REGIME, A3).
- **Contribuição:** REGIME/CONTEXT, sem lado.
- **Premissas:** `SP_GEX_SIGN_IS_REGIME` **MET**.
- **Lineage:** CONFIRMED. A concordância diária entre as duas leituras varia de 44 a 100 % ⇒ o teste deve fixar o rótulo R_M01 (incl. AMBIGUOUS), não escolher a leitura depois.
- **Risco DC:** baixo, desde que as 2 leituras não contem como 2 evidências.
- **market_origin:** SPX.
- **Falsificaria:** |retorno| em NEGATIVE ≤ POSITIVE no holdout.
- **Suportaria:** diferença de amplitude pré-registrada (apoio indireto: 1C aprovou Δγ dealer e ΔVIX só como amplitude, PROVISIONAL).
- **Validação histórica:** sim. É a candidata **mais madura**: nenhuma precondição semântica pendente, só dados. O `gex-series` tem ~10 pregões pós-09/09.
- **Afeta o registro V1:** não. Mesmo aprovada, não emite lado.
- **Classe:** **D** (→ B).

**HT06_SPX_CONTRADICTS_EFFECT**
- **Claim:** se `effect_on_native = CONTRADICTS` numa dimensão que sustenta leitura de lado, o contexto deveria ser (V_A) CONFLICTED ou (V_B) mantido com anotação.
- **Famílias:** SPX_FINAL_GAMMA (PARTIAL_ANALOG), SPX_TRACE_PARTICIPANTS (UNVERIFIED).
- **Premissas:** `SP_TRACE_MM_GAMMA_SIGN` MET. Qualidade TRACE = `PENDING_REVISION_AUDIT`, `CAPTURED_1D`.
- **Lineage:** GammaGex × TRACE com o mesmo upstream `SPX_OPTIONS_TRADES`; independência UNKNOWN.
- **Risco DC:** um CONTRADICTS/CONFIRMS pode ser parcialmente por construção.
- **market_origin:** SPX.
- **Natureza:** é mais uma **escolha de política** B×C do que um claim empírico. V_A muda o efeito de C sobre o contexto, e R_S17 hoje diz "sem fusão".
- **Estado:** **dormente**. Só tem objeto quando existir uma regra de lado ativa (hoje 0).
- **Falsificaria / suportaria:** V_A vs V_B comparados no braço de pesquisa por qualidade de classificação; critério ainda não pré-registrado.
- **Afeta o registro V1:** não.
- **Classe:** **D**. Não resolver por inferência: a escolha V_A/V_B é do operador.

**HT07_TRACE_REGIME_AGREEMENT_RELIABILITY**
- **Claim:** quando regime nativo e TRACE concordam (R_M09 CONFIRMS), o regime é mais informativo para amplitude.
- **Famílias:** SPX_FINAL_GAMMA + GEX0_SIGN.
- **Premissas:** ambas MET. TRACE ainda em `PENDING_REVISION_AUDIT`.
- **Lineage:** mesmo upstream SPX options trades, independência UNKNOWN ⇒ **risco E**: a concordância pode ser, em parte, artefato de insumo comum, não confirmação independente.
- **market_origin:** SPX (ambos).
- **Falsificaria:** nenhuma diferença de amplitude entre CONFIRMS e CONTRADICTS; ou a diferença some ao controlar por magnitude do GEX.
- **Suportaria:** diferença pré-registrada que persiste com o controle.
- **Validação histórica:** sim, e precisa de série TRACE (hoje 1 dia).
- **Afeta o registro V1:** não.
- **Classe:** **D** (→ B; risco E).

**HT08_EXPIRY_REGIME_DIVERGENCE**
- **Claim:** regime 0DTE e next em sinais opostos caracterizam um AMBIGUOUS mais amplo.
- **Famílias:** GEX0_SIGN + GEX_NEXT (BY_CONSTRUCTION com o `state gex_one`).
- **Premissas:** MET.
- **Achado:** a parte **descritiva** já está no registro por R_M02, que reporta 0DTE/next/full lado a lado, nunca fundidos. A divergência é derivável por leitura direta ⇒ **E**.
- **Resíduo:** reclassificar o rótulo R_M01 a partir do next seria fundir vencimentos, o que R_M02 proíbe. Só testável como variante de pesquisa.
- **market_origin:** SPX.
- **Falsificaria:** a variante não muda a qualidade de classificação / amplitude.
- **Validação histórica:** só para o resíduo.
- **Afeta o registro V1:** não.
- **Classe:** **E** (resíduo → B).

**HT09_MENTHORQ_ALIGNMENT_DEFINITION**
- **Claim:** definição de "alinhado" entre níveis MenthorQ e um contexto LONG/SHORT (efeito só POSITIVE|ZERO).
- **Famílias:** 10 famílias `DC_MENTHORQ_LEVELS` (UNVERIFIED; `market_origin` UNKNOWN), que contam como **1** família de confirmação.
- **Premissas:** `SP_MENTHORQ_ALIGNMENT_DEF` UNMET.
- **Natureza:** é uma **definição**, não um claim empírico. Pode ser escrita por documentação/decisão do operador, sem dados.
- **Dependência C:** o papel de cada nível (hvl, call_resistance, put_support…) é semântica do vendor MenthorQ, não documentada nos artefatos.
- **Risco DC:** baixo (1 família, positive-only).
- **Estado:** hoje os níveis são null (401) ⇒ D07 ⇒ ZERO. Também não há LONG/SHORT no registro ⇒ "alinhado" nunca é avaliável.
- **Falsificaria/suportaria:** não se aplica. Qualquer definição mantém o invariante positive-only/non-blocking.
- **Afeta o registro V1:** não (ZERO de qualquer forma).
- **Classe:** **A** (dependência C).

**HT10_SPY_INSTANCE_ROLE**
- **Claim:** instâncias SPY trazem informação independente das SPX; só depois de medidas podem formar família própria.
- **Famílias:** MAJORS_0DTE, CLASSIC_GEX_PROFILE_ZERO (instâncias `@SPY`, `SUPPORTING`).
- **Premissas:** `SP_SPY_INDEPENDENCE` UNMET; SPY vem cru (sem escala ES_SPX).
- **Natureza:** é uma **medição de lineage**, não uma hipótese de retorno.
- **market_origin:** SPY.
- **Falsificaria:** níveis/perfil SPY escalados reproduzem os SPX (overlap alto) ⇒ mesma família.
- **Suportaria:** divergência estrutural persistente.
- **Validação:** medição curta de overlap, não os 20–40 pregões. Exige captura SPY classic (só com ordem).
- **Afeta o registro V1:** não. Até medir, SPY não soma a SPX.
- **Classe:** **D** (→ B).

---

## 3. As 10 BLOCKED_BY_UNKNOWN_SEMANTICS

### 3.1 Matriz de desconhecidos (✗ = bloqueia · ~ = parcial · — = não se aplica ou conhecido)

| rule_id | sinal | unidade | magnitude | direção | cálculo | timestamp | upstream lineage | market mapping | vendor semantics |
|---|---|---|---|---|---|---|---|---|---|
| B01 vanna/charm | ✗ | ✗ (charm do state $MM/h INFERRED) | ✗ (escala ~2× em 09/09) | ✗ | ~ | — (vendor ts) | ✗ agg × por strike SUSPECTED | — (SPX→ES_SPX CONFIRMED) | ✗ |
| B02 gregas do state por strike | ✗ | ✗ | ✗ | ✗ | ✗ layout `mini_contracts` [a,b,c,[x,y,z],0,null] UNKNOWN (A8) | ~ priors | ✗ SUSPECTED/HIGH × agregados | — | ✗ |
| B03 cvr/oflow (8) | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✗ SUSPECTED | — | ✗ |
| B04 priors/max_priors | — | ✗ | — | — | ✗ o que `max_priors` guarda | ✗ espaçamento (código local supõe 1/5/10/15/30 min, sem doc) | ~ (BY_CONSTRUCTION com o valor corrente) | — | ✗ |
| B05 zero_mput | — | — (pontos ES_SPX CONFIRMED) | — | ✗ papel suporte/resistência | ~ identidade medida `zero_mput ≡ state gex_zero major_neg_vol` (pós-fechamento) | — | ~ PARTIAL (RTH) | — | ✗ rótulo "put support" contrariado por A2 |
| B06 risk reversal / ivol | ✗ convenção call−put vs put−call | ✗ | ✗ | ✗ | ✗ deltas/vencimento do RR; "ivol" = IV ou volume? (feature contract diz "IV/volume") | — | ~ root ≡ rota @zero BY_CONSTRUCTION (OBS-1) | — | ✗ |
| B07 TRACE Delta/Charm Pressure | ✗ | ✗ | ✗ | ✗ (vendor: só com regime definido) | ✗ body/fórmula | ✗ NOT_CAPTURED | ✗ vínculo endpoint ↔ view | — (SPX) | ✗ |
| B08 VolSignals 6 exposições | ✗ | ✗ (`unitFrozen`, `explicitUnit: NOT_FOUND`) | ✗ | ✗ | ✗ grid "Simulated" | ✗ eixo do grid UNKNOWN | ✗ independência × GammaGex UNKNOWN | — (SPX) | ✗ · `deltaExposureDiff` = 0 em 3678/3678 |
| B09 VolSignals gamma regime | ✗ convenção do "Simulated" | ✗ | ✗ (equivalência numérica proibida) | — (regime ≠ lado) | ✗ Simulated × mm | ✗ | ✗ | — (SPX) | ✗ |
| B10 estágio C originando lado | ✗ (herda B07) | ✗ | — | ✗ | — | — | — | — | ✗ **+ política B×C não definida** |

### 3.2 Resolução

| rule_id | Resolução | Uso direcional |
|---|---|---|
| B01 | **EXTERNAL_DOCUMENTATION_REQUIRED** (convenção de sinal e unidade GammaGex) → depois vira HYPOTHESIS (B) | CANNOT até doc + validação |
| B02 | **EXTERNAL_DOCUMENTATION_REQUIRED** + **EMPIRICAL** curto: 1 snapshot RTH para testar Σ gamma por strike ≈ GEX agregado (ancoraria a convenção do gamma no sinal de GEX, que é MET); vanna/charm/delta não têm âncora | CANNOT até doc |
| B03 | **EXTERNAL_DOCUMENTATION_REQUIRED**. O rótulo "CONVEXIDADE (Hedging Direction)" na auditoria A-BOT é rótulo, não semântica, e **não** deve ser usado por inferência | CANNOT |
| B04 | **EMPIRICAL** curto (comparar `priors[k]` com snapshots consecutivos reais do mesmo strike; o AoClassicCache e o histórico do vendor **não** têm strikes/max_priors) **ou** EXTERNAL doc | não direcional por natureza; bloqueia só CHANGE |
| B05 | **RESOLVABLE_FROM_EXISTING_ARTIFACTS** (parcial): o cálculo é conhecido por identidade (`≡ state/gex_zero.major_neg_vol`, medida pós-fechamento), e o rótulo "put support" é refutado por A2. Falta confirmar a identidade em RTH (junto com `SP_MAJORS_IDENTITY_RTH`) | **CANNOT_BE_USED_DIRECTIONALLY**: mesmo resolvido, R_S13 (location ≠ lado); só via HT preregistrada |
| B06 | **EXTERNAL_DOCUMENTATION_REQUIRED** (definição do RR e do "ivol") | CANNOT |
| B07 | **EXTERNAL_DOCUMENTATION_REQUIRED** (vínculo Delta Pressure ↔ `/v2/open_interest/intraday_delta`, body, unidade), = OPTIONAL_EVIDENCE_GAP, **não bloqueia o design** | CANNOT |
| B08 | **EXTERNAL_DOCUMENTATION_REQUIRED**. Projeto VolSignals ENCERRADO: não reabrir sem ordem. `deltaExposureDiff` = NON_EVIDENCE | **CANNOT_BE_USED_DIRECTIONALLY** |
| B09 | **EXTERNAL_DOCUMENTATION_REQUIRED**. Concordância empírica com TRACE **não** estabelece a convenção (upstream possivelmente comum) | CANNOT (e regime ≠ lado, R_S12) |
| B10 | **CANNOT_BE_USED_DIRECTIONALLY** sob o cânone atual (R_S17). Exige **decisão arquitetural do operador** + B07. Não é resolvível por documentação de vendor sozinha | CANNOT |

---

## 4. Itens resolvíveis agora (só documentação existente; aplicação **só com ordem**)

| # | Item | Tipo | O que mudaria |
|---|---|---|---|
| R1 | HT02/HT03: restringir o input a `z_mlgamma`/`z_msgamma` (excluir `zero_mcall`/`zero_mput`) | correção de escopo | impede o vazamento de B05 no braço de pesquisa |
| R2 | R_M06 × níveis interpolados: definir o evento discreto de "migração" | decisão de design do operador | torna HT04 e o descritor R_M06 bem definidos |
| R3 | HT08: registrar a parte descritiva como coberta por R_M02 (E) | reclassificação | reduz o register a um resíduo de pesquisa |
| R4 | HT09: escrever a definição formal de "alinhado" (positive-only) | definição | efeito continua ZERO até existir LONG/SHORT no registro e MenthorQ ≠ null |
| R5 | B05: rotular `zero_mput` pela identidade medida, sem "suporte" | re-rotulagem | mantém o SEMANTIC_ANOMALY até a confirmação em RTH |
| R6 | OBS-1: risk reversal raiz × rota `@zero` ⇒ BY_CONSTRUCTION | correção de lineage | elimina família duplicada |
| R7 | OBS-2 / OBS-4: anotar o risco de conflito inflado e a proibição do ESF4 | nota de governança | nenhuma mudança de comportamento |

## 5. Itens que **NÃO** devem ser resolvidos por inferência

- A convenção de sinal de DEX, vanna, charm e das gregas por strike (HT01, B01, B02), inclusive "pelo que faria sentido economicamente".
- O significado de `cvr`/`oflow` a partir de nomes ou rótulos de UI (B03).
- O espaçamento dos `priors` a partir do código local (1/5/10/15/30 min) (B04).
- `zero_mput` como suporte/resistência (B05).
- A direção do `delta_risk_reversal`; se "ivol" é IV ou volume (B06).
- TRACE Delta Pressure ↔ endpoint; unidades VolSignals a partir do fator 1/288 ou de "$ Notional" (B07, B08).
- A convenção do gamma "Simulated" por concordância com o TRACE (B09).
- V_A vs V_B (HT06) e o estágio C originando lado (B10): são política, do operador.
- Critérios de NO_TRADE_CONTEXT, incluindo o ESF4 (Core×JEV).
- Independência SPX × SPY (HT10) e GammaGex × TRACE/VolSignals.

## 6. Backlog mínimo de evidência futura

Nenhum item abaixo é blocker de arquitetura. **20–40 pregões = NON_BLOCKING_VALIDATION_TARGET.** Toda captura exige ordem explícita do operador. **Nada foi iniciado.**

| Pri | Evidência | Tipo | Desbloqueia | Coleta de dados? |
|---|---|---|---|---|
| E1 | Documentação GammaGex/A-Bot: convenção de sinal (DEX, vanna, charm, state greeks), unidades, `cvr`/`oflow`, `priors`/`max_priors`, layout de `mini_contracts`, `delta_risk_reversal`, semântica dos majors 0DTE | externa, 1 pedido | HT01, B01, B02, B03, B04, B05, B06 | não |
| E2 | Snapshot RTH de 1 sessão: identidades de majors (`SP_MAJORS_IDENTITY_RTH`), `zero_mput ≡ major_neg_vol`, Σ gamma por strike × GEX, `priors` × snapshots consecutivos | medição curta | HT02–HT04 (precondição), B02 (gamma), B04, B05 | **sim**: exige ordem |
| E3 | Auditoria de revisão do TRACE (já pendente: `PENDING_REVISION_AUDIT`) | revisão de artefato | HT06, HT07, R_M09 sair de DEGRADED | não (sobre o capturado) |
| E4 | Captura SPY classic | medição de lineage | HT10 | **sim**: exige ordem |
| E5 | TRACE Delta Pressure ↔ endpoint (OPTIONAL_EVIDENCE_GAP) | externa | B07, parte de B10 | não |
| E6 | VolSignals: unidades e convenção | externa; projeto ENCERRADO | B08, B09 | **não reabrir sem ordem** |
| E7 | Histórico próprio para validação (alvo 20–40 pregões) | validação | HT05 (mais madura), HT07, HT02–HT04, HT01 (após E1), resíduo HT08 | **sim**: exige ordem; NON_BLOCKING |

## 7. Sequência proposta após o fechamento do preregistration

1. Operador aceita (ou ajusta) o PREREGISTRATION DESIGN V1, incluindo R_S10, R_S15 e R_S18 (THIS_DESIGN).
2. Se ordenado, aplicar R1–R7 (documentação) e regenerar pelo gerador canônico.
3. E1 (pedido de documentação do vendor; sem coleta) e E3 (revisão do TRACE sobre o já capturado).
4. Re-triagem dos BLOCKED com E1/E3 em mãos: os resolvidos viram HYPOTHESIS_TO_TEST com novo pré-registro, **nunca** direto para ativos.
5. Pré-registro de validação por hipótese (congelado antes do holdout), começando por HT05.
6. Só com ordem explícita: E2 (1 sessão), E4, e depois E7 (captura).
7. Braço de pesquisa `JEV_RESEARCH_ARM_V1` offline; promoção só por pré-registro de validação + decisão do operador (R_S15).
8. Fusão/conflito Core×JEV continua fora, até fase própria.

## 8. Confirmação

- **Arquivos canônicos alterados:** NENHUM. `git status` antes e depois só mostra os untracked pré-existentes (`START_JEV_CLAUDE.ps1`, `config/`, `scripts/`, `context/jev-future/JEV_KIMI_PROVIDER_20260924.md`) e este handoff.
- **Único arquivo criado no repo:** `handoffs/HANDOFF_CLAUDE_JEV_HYPOTHESES_20260924.md`.
- Nenhuma hipótese promovida. Nenhum status alterado. Gerador não executado.
- Implementation NONE · Data collection NONE · Production UNCHANGED · F5 NOT PERFORMED · Core×JEV fusion UNDEFINED.

## 9. Próximo passo exato

Operador revisa este triage e decide: (a) aceitar o PREREGISTRATION DESIGN V1; (b) ordenar ou não R1–R7; (c) autorizar ou não E1. Nada começa sem essa ordem.
