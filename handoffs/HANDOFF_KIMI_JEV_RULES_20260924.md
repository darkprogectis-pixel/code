# HANDOFF — FRENTE A: JEV FUTURE / SEMANTIC RULE REVIEW (24/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| CWD | `C:\Users\ADM\Claude-JEV\code` |
| AUTOR DESTA REVISÃO | Kimi (modelo K3), sessão read-only |
| ESCOPO | Revisão semântica das regras pendentes R_S10, R_S15, R_S18 do PREREGISTRATION DESIGN V1 |
| CANONICAL FILES CHANGED | **NO** |
| IMPLEMENTATION | NONE |
| DATA COLLECTION | NONE |
| PRODUCTION | UNCHANGED |
| F5 | NOT PERFORMED |
| CORE_vs_JEV FUSION | continua UNDEFINED (não tocado) |
| MENTHORQ | continua POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING (não tocado) |
| 20–40 PREGÕES | continua NON_BLOCKING_VALIDATION_TARGET (não tocado) |

Este handoff é autocontido. Nenhum arquivo canônico do JEV foi alterado, nenhum gerador foi executado, nenhum commit/push foi feito.

---

## 1. Arquivos lidos

- `CLAUDE.md`
- `context/jev-future/HANDOFF_JEV_FUTURE_20260923.md`
- `context/jev-future/PROJECT_SCOPE_JEV_FUTURE_20260923.md`
- `context/jev-future/JEV_DEALER_CONTEXT_CONTRACT_20260923.md`
- `context/jev-future/JEV_FEATURE_CONTRACT_V1_20260923.md`
- `context/jev-future/JEV_DECISION_LOGIC_V1_20260923.md`
- `context/jev-future/JEV_PREREGISTRATION_DESIGN_V1_20260923.md`
- `context/jev-future/data/jev-preregistered-rules-v1.json` (parse read-only; R_S10/R_S15/R_S18 extraídas verbatim; 58 regras, distribuição 21/10/10/10/7 confirmada; 18 pré-condições semânticas; field_coverage 190/190, B=174, C=16; 0 regras ativas com `emits_side=true`)
- `context/jev-future/data/jev-classification-state-machine-v1.json` (UNKNOWN é o único estado alcançável no registro V1; NO_TRADE_CONTEXT UNDEFINED/INACTIVE)
- `context/jev-future/data/jev-hypotheses-register-v1.json`
- `context/jev-future/data/jev-provisional-mappings-v1.json`

## 2. Decisão R_S15 — ACCEPT

**Regra (verbatim, `jev-preregistered-rules-v1.json`):**
> Só regras com status CANONICAL_STRUCTURAL ou SUPPORTED_SEMANTIC entram no `jev_directional_context` de registro. HYPOTHESIS_TO_TEST só pode ser avaliada num braço de pesquisa rotulado, fora do contexto de registro, e só vira ativa por pré-registro de validação + decisão do operador. BLOCKED e DIAGNOSTIC nunca entram.

**Racional:**
- É a regra de governança que materializa a separação registro × braço de pesquisa já prevista na Decision Logic V1 e no design (§2, §6).
- É a condição que sustenta o passo 2 da máquina de estados (`RC_NO_ACTIVE_DIRECTIONAL_RULE`) e a consequência honesta da V1: só UNKNOWN alcançável no registro.
- Sem ela, hipóteses não testadas (HT01–HT04 emitem lado) poderiam contaminar o contexto de registro.
- Coerente com: proibição de inventar polaridade (R_S14), ausência de contagem de votos (R_S04), promoção de hipótese só por pré-registro de validação + decisão do operador.
- Nenhum efeito colateral encontrado; nenhum contrato anterior a contradiz.

**Veredito: ACCEPT.** Pronta para ser marcada como aceita pelo operador (a alteração do artefato em si exige ordem e regeneração — não feita aqui).

## 3. Decisão R_S10 — REVISE

**Regra atual (verbatim):**
> DATA_INVALID: sem referência de preço utilizável OU nenhum membro da família de regime 0DTE (DC_GEX0_SIGN / DC_ZERO_GAMMA_0DTE) com freshness FRESH ou MARKET_CLOSED. DEGRADED: dado válido, mas alguma família com leitura ativa está STALE/UNKNOWN/PENDING_REVISION_AUDIT ou só parcial. VALID: demais casos. Sem threshold numérico novo (usa os PROVISIONAL de R_S08).

**Respostas às 5 questões:**

1. **Contrato canônico anterior exigindo essa família como requisito absoluto? NÃO.**
   - DEALER_CONTEXT_CONTRACT: não define DATA_INVALID nem hierarquia entre famílias.
   - FEATURE_CONTRACT_V1: define freshness por fonte (§3), sem gate.
   - DECISION_LOGIC_V1 §5–§6: lista VALID/DEGRADED/DATA_INVALID apenas como nomes de status; §6 diz que DATA_INVALID vive em `data_quality.status` e o contexto sai UNKNOWN com reason DATA_INVALID — sem definir qual família é obrigatória.
2. **Nasceu somente em THIS_DESIGN? SIM.** R_S10 tem `origin: THIS_DESIGN`; é a primeira vez que DC_GEX0_SIGN/DC_ZERO_GAMMA_0DTE vira condição de validade global.
3. **Outras famílias dealer produziriam native_dealer_state útil sem essa família? SIM.** O `native_dealer_state` é por dimensão (gamma_regime, structure_location, delta_positioning, second_order_flows, vol_skew, flow_unknown_semantics, change_transition). A indisponibilidade da família de regime 0DTE derruba apenas a dimensão GAMMA_REGIME, que já possui sub-estado UNKNOWN próprio na máquina de estados. Majors (DC_MAJORS_*), perfis por strike (DC_CLASSIC_GEX_PROFILE_*, DC_STATE_GEX_PROFILE_*), DEX (DC_DEX_*) etc. têm famílias próprias e continuam produzindo leituras LOCATION/STRUCTURE/FLOW válidas. Nenhum contrato faz uma dimensão depender de outra.
4. **Cria HARD GATE não autorizado? SIM.** A cláusula transforma uma família específica em condição de DATA_INVALID global, derrubando a classificação inteira (via R_S09, DATA_INVALID ⇒ UNKNOWN) mesmo com todas as demais famílias válidas. Isso contradiz o desenho por dimensões e o princípio canônico de que data quality é CLASSIFICATION INPUT, não gate (Decision Logic §5; R_S08).
5. **Definição mínima correta:** ver texto normativo abaixo — sem pesos, sem scores, sem majority vote; a indisponibilidade de uma família específica passa a ser tratada no nível da dimensão (UNKNOWN/DEGRADED local), e DATA_INVALID fica reservado a falha global.

**Texto normativo proposto para R_S10 (substituição da `description`):**

> DATA_INVALID: sem referência de preço utilizável E nenhuma família de evidência ativa com leitura utilizável (FRESH ou MARKET_CLOSED) em qualquer dimensão do estágio B. DEGRADED: dado válido, mas alguma família com leitura ativa está STALE/UNKNOWN/PENDING_REVISION_AUDIT ou só parcial — incluindo o caso de a família de regime 0DTE (DC_GEX0_SIGN / DC_ZERO_GAMMA_0DTE) estar indisponível enquanto outras famílias estão válidas; nesse caso a dimensão GAMMA_REGIME sai UNKNOWN, sem derrubar o status global. VALID: demais casos. Sem threshold numérico novo (usa os PROVISIONAL de R_S08). Nenhuma família específica é condição de validade global.

**Notas de impacto da revisão:**
- Mantém intactos: R_S09 (DATA_INVALID ⇒ UNKNOWN + RC_DATA_INVALID), R_S08 (freshness basis), o passo 1 da máquina de estados.
- A exigência conjuntiva (sem preço E nenhuma família utilizável) torna DATA_INVALID um estado genuinamente global; a parte "sem referência de preço utilizável" sozinha continua relevante porque os descritores de LOCATION (R_M03) dependem de spot — mas passa a degradar LOCATION, não a invalidar tudo. Se o operador quiser ainda mais mínimo, pode-se dropar a cláusula de preço do DATA_INVALID global e tratá-la só como DEGRADED da dimensão LOCATION/CONTEXT. Decisão do operador.

## 4. Decisão R_S18 — REVISE

**Regra atual (verbatim):**
> Rótulo único de effect_on_native: UNAVAILABLE se nenhuma leitura C utilizável; senão CONTRADICTS se alguma leitura C comparável contraria a leitura B da mesma dimensão; senão CONFIRMS se alguma concorda; senão ENRICHES se C só acrescenta informação descritiva; senão NO_EFFECT. Comparável = mesma dimensão e semântica MET; PARTIAL_ANALOG compara só sinal/posição, nunca magnitude. A dimensão comparada vai em reason_codes.

**Respostas às 4 questões:**

1. **effect_on_native deve existir primeiro POR SOURCE/DIMENSION? SIM.** TRACE e VolSignals não são fundidos (R_S06/R_S17) e as dimensões são independentes. O registro primário correto é por (fonte, dimensão). O output contract já comporta o detalhe (`source_contributions`, `evidence_families`, `conflicts`, `reason_codes`), mas hoje a redução a rótulo único ocorre **antes**, destruindo a granularidade.
2. **Resumo agregado precisa suportar MIXED/CONFLICTED? SIM**, se um rótulo único for mantido. A coexistência de ≥1 CONTRADICTS e ≥1 CONFIRMS em dimensões comparáveis é um fato observacional, não contagem de votos — não viola R_S04 (que proíbe comparar "quantos a favor × quantos contra", não registrar existência).
3. **A precedência atual é destrutiva? SIM.** Exemplo concreto: R_M09 (TRACE gamma_mm × regime nativo) CONTRADICTS na dimensão GAMMA_REGIME + R_M10 (participantes) ENRICHES + uma leitura VolSignals (se um dia desbloqueada) CONFIRMS — a saída atual é apenas CONTRADICTS; a confirmação e o enriquecimento desaparecem do campo estrutural.
4. **Menor correção estrutural:** registro primário por (fonte, dimensão) + rótulo agregado derivado com estado MIXED, sem pesos/scores/X-of-N.

**Texto normativo proposto para R_S18 (substituição da `description`):**

> Efeito primário por (fonte, dimensão): cada leitura C utilizável registra o próprio efeito em `spx_final_context.effects[]` = {source: TRACE|VOLSIGNALS, dimension, effect: CONFIRMS|CONTRADICTS|ENRICHES}, com reason_code RC_SPX_<dimensão>_<efeito>. Comparável = mesma dimensão e semântica MET; PARTIAL_ANALOG compara só sinal/posição, nunca magnitude. Não há fusão entre fontes nem entre dimensões. Rótulo agregado `effect_on_native` (derivado, sem pesos e sem contagem): UNAVAILABLE se nenhuma leitura C utilizável; MIXED se existir ao menos um CONTRADICTS e ao menos um CONFIRMS em dimensões comparáveis; CONTRADICTS se só há contradições; CONFIRMS se só há confirmações; ENRICHES se C só acrescenta informação descritiva; NO_EFFECT caso contrário. MIXED é constatação de coexistência, não voto nem soma (R_S04 preservada).

**Dependência da revisão:** o enum de `effect_on_native` no output contract (`data/jev-output-contract-v1.json` e Decision Logic §6) hoje é `CONFIRMS|CONTRADICTS|ENRICHES|NO_EFFECT|UNAVAILABLE`. Aplicar a revisão exige adicionar MIXED a esse enum e acrescentar `effects[]` ao shape de `spx_final_context`. **Não feito aqui** — exige ordem do operador e regeneração com guard.

## 5. Riscos

- **Se R_S10 for aceita como está:** gate implícito da família de regime 0DTE derruba toda a classificação em dias com falha parcial de ingestão dessa família, produzindo UNKNOWN global mesmo com 100+ famílias válidas — viés de indisponibilidade não pré-registrado.
- **Se R_S18 for aceita como está:** perda silenciosa de informação de confirmação/enriquecimento sempre que houver uma contradição; o campo `conflicts` do output contract ficaria subutilizado e auditorias futuras não conseguiriam reconstruir o quadro completo a partir do rótulo.
- **Se as revisões forem aplicadas sem regeneração do gerador:** dessincronia MD × JSON. Toda aplicação deve passar pelo gerador determinístico com guard (190/190, enums, resíduos).
- **MIXED pode ser mal lido como "voto empatado":** mitigado no texto proposto ("não voto nem soma"), mas o integrador deve preservar essa nota.

## 6. Questões ainda não resolvidas

- Aceite formal do operador das três decisões (R_S15 ACCEPT; R_S10 REVISE; R_S18 REVISE).
- Variante mínima alternativa de R_S10 (cláusula de preço como DEGRADED de LOCATION em vez de parte do DATA_INVALID global) — deixada à escolha do operador.
- Posição da etapa NO_TRADE_CONTEXT na máquina de estados: continua UNDEFINED junto com o critério (fora desta frente).
- HT06 (efeito de CONTRADICTS sobre leitura de lado: V_A CONFLICTED × V_B anotação) permanece hipótese — MIXED em `effect_on_native` **não** resolve HT06 nem altera o contexto; é só registro.

## 7. Instruções exatas para o Claude integrador

1. Ler este handoff + `JEV_PREREGISTRATION_DESIGN_V1_20260923.md` §3 e §5.
2. Obter ordem explícita do operador para aplicar: R_S15 = ACCEPT; R_S10 = texto normativo do §3 deste handoff; R_S18 = texto normativo do §4 deste handoff.
3. Somente com a ordem:
   a. Atualizar `description` de R_S10 e R_S18 no gerador `scripts/build-jev-preregistration-design-v1.js` (fonte única) e marcar o aceite das três regras THIS_DESIGN.
   b. Estender o enum de `effect_on_native` com MIXED e o shape de `spx_final_context` com `effects[]` no gerador da Decision Logic (`scripts/build-jev-decision-logic-v1.js`) / output contract — mantendo `numeric_equivalence_allowed:false` e a proibição de fusão TRACE × VolSignals.
   c. Regenerar todos os artefatos e confirmar: guard PASS, 190/190, 58 regras, 0 regra ativa emitindo lado, C com origem = SPX.
   d. Atualizar os MDs correspondentes (Preregistration §3/§5; Decision Logic §6) para refletir os novos textos.
4. Registrar o aceite no handoff seguinte e em PROJECT_SCOPE (estado da fase).
5. **Não** tocar: CORE×JEV fusion/conflict/precedence (UNDEFINED), MenthorQ (POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING), 20–40 pregões (NON_BLOCKING), NO_TRADE_CONTEXT criteria (UNDEFINED), produção, NT8. Sem coleta, sem validação, sem F5.

## 8. Confirmações

| | |
|---|---|
| CANONICAL FILES CHANGED | **NO** |
| IMPLEMENTATION | NONE |
| DATA COLLECTION | NONE |
| PRODUCTION | UNCHANGED |
| F5 | NOT PERFORMED |
| COMMIT / PUSH | NONE |
| GERADORES EXECUTADOS | NENHUM (parse read-only do JSON apenas) |
