# HANDOFF — AUDITORIA PROFUNDA: POTENCIAL NÃO UTILIZADO DO JEV / SYSTEM ONE (2026-10-02)

Sessão `1131cf45` (rotação #12). Somente leitura + 12 consultas JEV de classificação (Fase 6). Nada implementado; produção, hooks, settings e config intocados.
Escritas: este handoff + `handoffs/assets/JEV_POTENTIAL_AUDIT_20261002_{results,candidates}.json`.

## Fase 0 — Snapshot
- Início: **2026-10-02T21:24:31Z**. Consultas da auditoria: 21:31:38Z, purpose `audit-potential-20261002:<id>` (12 requests, input 11.648, output 2.892, ≈ US$ 0,00049). Fim: 21:32:08Z.
- Modelo: `jev-1.13.0` (alias `jev-latest`, fallback `jev-preview`, **não pinado**). API: `POST https://api.typesafe.ai/v1/systemone` + `GET /v1/models` (OpenAPI 0.2.0). Cliente próprio: fetch cru em `~/.claude/alfaomega-context/scripts/lib.js` (sem SDK oficial).
- Uso histórico até o início: 1297 requests de produção · input 5.529.326 · output 811.330 (ver `HANDOFF_JEV_USAGE_AUDIT_20261002.md`). Painel informado pelo operador: US$ 0,2333 · 6.369.114 tokens · 1.306 requests.
- Integração (sha256[:16], **idênticos ao handoff de 01/10 ⇒ código não mudou**): lib.js 9b570b1f7b400445 · jev-decide.js a7aca30b81ae05a2 · jev-context-router.js 27d04be40153d919 · jev-ledger 352bf0be43a78058 · gates edit f394460626eb9905 / action 595b2b0229039060 / shell 9995cb272c512e96 / stop 1b6f3b5ff9ad7fe8 · config `jev.json` (todos os gates `enforce`, `min_noul 0.6`).
- Hooks: só no perfil padrão `C:\Users\ADM\.claude\settings.json`, junto com o plugin `typesafe@typesafe-ai` habilitado. A config isolada desta linha (`.claude-darkprogectis`) **não tem nenhum gate JEV**; o JEV entra aqui só por scripts avulsos (DIFF/FINAL).

## Fase 1 — Documentação oficial (docs.typesafe.ai, baixada hoje: 111 páginas)
- Índice `llms.txt`: **mesmas 111 URLs** de 27/09 (nenhuma página nova ou removida).
- Mudanças de conteúdo contra o cache de 27/09 (scratchpad 48909bd5/docs; 18 páginas comparadas). Quase tudo é reformatação de tabela. As mudanças substantivas são:
  1. `/confidence` ganhou a seção **"How confidence is calculated"**, com as fórmulas exatas:
     - Noul: `|2p−1|`;
     - Choice: `(pmax−1/n)/(1−1/n)`;
     - Score: `1 − Σp·|i−m| / MAD_unif`.
     - Recomenda também **pmax** e a **razão top1/top2**.
     - Reforça: três faixas (agir / cautela / não agir) e thresholds proporcionais ao risco.
  2. `/models`: rate limit passou de 250k tok/s · 1.200 req/min para **100K tok/s · 40 req/s**. Preço inalterado: US$ 0,042/Mtok de input, output grátis. Limite de contexto inalterado: 64k.
  3. SDKs oficiais: JS `@typesafe-ai/sdk` v0.6.0 (15/09; `Score.criteria` agora é lista ordenada) e Python v0.7.2 (26/09; http2, pydantic). Ambos têm `RetryPolicy` e respeitam `retry-after`.

## Fase 2 — Inventário (49 capacidades oficiais)
Contagem: **ACTIVE 13 · PARTIAL 10 · NOT_USED 15 · MISUSED 1 · N/A 9 · UNKNOWN 1**.

| # | Capacidade | Status | Evidência (local) |
|---|---|---|---|
| 1 | Choice | ACTIVE | router 687 req (24 q/req); decide 1050 respostas; avulsas 59 |
| 2 | Score | PARTIAL ↑(era NOT_USED) | decide 713 respostas registradas; **nenhuma entra em gate** (`jev-decide.js:128-137`); 0 nas avulsas |
| 3 | Noul | ACTIVE ↑(era NOT_USED) | decide 708; gates `noul ≥ 0.6` (`jev-decide.js:128-135`) |
| 4 | Multi-question | ACTIVE | router 24/req, decide 4,49/req; **avulsas DIFF/FINAL 1,11/req (54/57 com 1 pergunta)** |
| 5 | Parallel evaluation | ACTIVE | servidor + 4 workers no router; decide = 1 req por decisão |
| 6 | Speculative fan-out | PARTIAL ↑ | templates incluem Nouls companheiros (`info_sufficient`, `needs_more_data`, `reversible`), que não alteram o gate |
| 7 | Confidence gating | NOT_USED (confirmado) | nenhum gate lê `confidence` |
| 8 | Distribuição completa | PARTIAL | decide persiste `answers` inteiros; router não persiste; **avulsas só em scratchpad temporário** |
| 9 | Structured state | ACTIVE | decide preserva string/object/array; avulsas 30 object / 25 string |
| 10 | Structured instructions | PARTIAL ↑ | objeto em `prioritization` (`jev-decide.js:64,97`); router usa string |
| 11 | Structured criteria | PARTIAL | options aceitam object/array; rubricas são strings sem casos-limite |
| 12 | Model pinning | PARTIAL | `jev-latest` + `jev-preview`; `model` é logado |
| 13 | Semantic classification | ACTIVE | router ESSENTIAL/USEFUL/IRRELEVANT |
| 14 | Hierarchical classification | N/A (reclass.) | taxonomias planas |
| 15 | Intent routing | NOT_USED | perfil por regex (`profiles.js detectProfile`) |
| 16 | Model routing (det./LLM/humano) | NOT_USED | — |
| 17 | Function/tool selection | N/A | Claude Code escolhe as ferramentas |
| 18 | Skill selection | N/A (reclass.) | Claude Code escolhe as skills |
| 19 | Semantic search | PARTIAL | só sobre a shortlist BM25 |
| 20 | Reranking | ACTIVE | BM25 ⇒ Jev ⇒ ordenação |
| 21 | RAG filtering | ACTIVE | SESSION_PACK |
| 22 | Citation verification | NOT_USED | — |
| 23 | Verificação da saída do LLM (review/conclusion/FINAL) | **MISUSED** ↑ | `jev-stop-gate.js:26-29` exige só a **existência** da decisão. Passaram: review `reject` 13/66, conclusion `ready<0.6` 31/68 |
| 24 | Guardrails (screening de conteúdo) | NOT_USED | segredos via regex fail-closed (correto) |
| 25 | Prompt-injection detection | NOT_USED | — |
| 26 | Entity matching | N/A | — |
| 27 | Entity alignment | N/A | — |
| 28 | Structured extraction | NOT_USED | — |
| 29 | Semantic linting / contradição | NOT_USED | regra manual STALE_STATE_FRONTS |
| 30 | Escalation gating | NOT_USED | só escalonamento por indisponibilidade (JEV_REQUIRED_BUT_UNAVAILABLE) |
| 31 | Self-consistency | NOT_USED | — |
| 32 | Composite scoring | PARTIAL | router `P_E+0,5·P_U`; gate = conjunção de atômicas |
| 33 | Feature extraction | N/A | trading proibido (backtest NQ −US$ 128k) |
| 34 | Feature discovery | N/A | idem |
| 35 | Knowledge-graph decisions | N/A | — |
| 36 | Retrieval decisions | ACTIVE | KEEP/OPTIONAL/DROP |
| 37 | Confidence-based fallback | NOT_USED | router dá `throw` em erro de API |
| 38 | Batch decisions | ACTIVE | 25/req |
| 39 | Decision auditing/logging | ACTIVE | `jev-decisions.ndjson` com respostas completas; avulsas sem respostas |
| 40 | Second opinion / cascade | NOT_USED | — |
| 41 | SDK oficial (JS/Python) | NOT_USED (novo) | fetch cru |
| 42 | RetryPolicy / retry-after | PARTIAL (novo) | `lib.js:167-175`: backoff fixo 1,5 s·tentativa, ignora `retry-after`, loga só a tentativa final |
| 43 | Medidas alternativas (pmax, top1/top2) | PARTIAL (novo) | `derived.runner_up` registrado, nunca usado |
| 44 | Thresholds escalados por risco | NOT_USED (novo) | um único `min_noul` 0.6 para todas as ações |
| 45 | Abstenção / "I don't know" | NOT_USED (novo) | Nouls `needs_more_data`/`info_sufficient` existem, mas não abstêm |
| 46 | Agent skill (plugin typesafe) | UNKNOWN | habilitado no perfil padrão; uso não medido |
| 47 | Usage/token accounting | ACTIVE | por request em `jev-routing.ndjson` |
| 48 | Structure recovery (autoformat) | N/A | — |
| 49 | Permission/risk gate (edit/action/shell) | ACTIVE | gates `enforce` com bundle MIXED; 337 shells bloqueados (`jev-activity`) |

Revalidação dos achados históricos (27/09: ACTIVE 10 / PARTIAL 5 / NOT_USED 22 / N/A 3, em 40 capacidades):
- **Os 10 ACTIVE continuam ACTIVE.** O router rodou 19× desde 01/10, a última vez em 02/10 03:27Z.
- **Saíram de NOT_USED:**
  - Noul ⇒ ACTIVE;
  - Score, fan-out e structured instructions ⇒ PARTIAL;
  - verificação de saída ⇒ MISUSED.
- **pass2 OFF:** confirmado (`pass2=false`, `jev-context-router.js:47`).
- **Confidence fora da decisão:** confirmado. Nenhum gate lê confidence, e 99 gates abriram com pelo menos uma Choice de confidence < 0.5.
- **Overrides:** 188 OVERRIDE (25,5 % dos 738 eventos de gate), todos entre 28 e 30/09, com citação de ordem do operador. Por kind: modify_file 76, substantive_action 70, implementation_strategy 16, conclusion 10, review 9, test_evaluation 7.
- **Rótulos para calibração:** continuam 25 (`router-feedback.ndjson`, 22/09). Nenhum rótulo existe para a decision layer.

## Fase 3 — Profundidade
- **Checkpoints na era dos gates** (28/09 12:24Z → 01/10 19:37Z, perfil padrão): 550 decisões Jev para 557 ações mutáveis (234 edits + 323 shell_write). Mais 337 shells bloqueados, 33 bloqueios do stop gate e 2 VIOLATION.
- **Checkpoints na linha atual** (01/10 19:37Z → início desta auditoria, config isolada, 41 transcripts):
  - Edit 227, Write 103, shells mutáveis ≈ 283 (heurística por regex);
  - 30 consultas JEV avulsas;
  - o resto é decisão do Claude (regra fixa: rotation controller; humano: F5/instalação/PLAY).
- **Distribuição ignorada:**
  - gates: decidem por limiar de Noul + classe vencedora;
  - avulsas: Claude lê só a vencedora (ex. FINAL `A=0.66/B=0.21`, confidence 0.61);
  - gating nouls (588): 116 < 0.5 · 69 em [0.5, 0.6) bloqueados · **96 em [0.6, 0.7) liberados com margem ≤ 0.1** · 307 ≥ 0.7.
- **Pergunta grande × várias:** DIFF/FINAL = 1 Choice de 6–7 opções cobrindo vários critérios ao mesmo tempo. A doc (`/primitives`) diz que perguntas extras na mesma chamada são "close to free".
- **Papéis do Jev:**
  - em uso: router/classifier/reranker (router); permission/risk gate (gates); reviewer (review, superficial, ver #23);
  - não usados: verifier de citação, contradiction detector, regression detector, evidence-quality scorer com efeito (o Score existe mas não decide), confidence gate.
- **Paralelismo seguro:** as consultas desta Fase 6 rodaram 12 em `Promise.all`, todas HTTP 200, latência normal. As consultas DIFF/FINAL atuais são sequenciais, com 1 pergunta cada.

## Fase 4 — Economia (números do painel como referência)
- Por request: input ≈ 4.253 tokens (US$ 0,2333 ÷ 0,042e-6 ÷ 1306) · total ≈ 4.877 tokens · ≈ US$ 0,000179.
- Requests por hora:
  - 5,10/h pelo wall-clock (256,1 h);
  - 66,4/h pelo tempo ativo heurístico (19,7 h, intervalos ≤ 15 min; não comprovado).
- Painel × log local: +9 requests (1306 × 1297) e +28.458 tokens (6.369.114 × 6.340.656). A origem não pode ser verificada localmente; o horário da captura do painel é desconhecido.
- **Densidade JEV:**
  - era dos gates: 0,99 decisão por ação mutável (forçada por hook);
  - **linha atual: 0,091 por Edit/Write (30/330), ≈ 0,049 contando os shells mutáveis.**
- Por etapa do workflow avulso: DIFF 12 · FINAL 7 · RECHECK 2 · ≈ 1,1 pergunta por etapa.
- Custo baixo **não** significa uso adequado. Decompor DIFF/FINAL em ~8 perguntas custaria ≈ +2–4k tokens por consulta (≈ US$ 0,0001).

## Fase 5 — Gap matrix (A–E)
- **A. Já usamos bem:** Choice, multi-question e batch no router; rerank; filtro RAG; state estruturado; logging com respostas completas (decide); permission gate fail-closed.
- **B. Usamos superficialmente:**
  - Score (registrado, sem efeito);
  - distribuição completa (não usada nas decisões; não persistida nas avulsas);
  - verificação de saída (stop gate só por presença);
  - DIFF/FINAL com 1 pergunta;
  - pinning;
  - retry;
  - structured criteria;
  - composite.
- **C. Não usamos:** confidence gating; thresholds por risco; abstenção; escalonamento por confidence; citation/contradiction check; self-consistency; second opinion; SDK oficial; intent routing.
- **D. Não faz sentido aqui:** feature extraction/discovery (trading), entity matching/alignment, KG, hierarchical classification, tool/skill selection, autoformat.
- **E. Merece experimento:** Q1–Q7 e A1–A5 abaixo.

| Candidato | Gap | Valor potencial | Risco | Custo em tokens | Complexidade | Teste isolado |
|---|---|---|---|---|---|---|
| Q1 stop gate outcome-aware (shadow) | #23 | alto (13+31 casos medidos) | desprezível em shadow | 0 | baixa | sim |
| Q2 shadow de pmax/top2/confidence de Score/\|2p−1\| | #7, #43 | alto (pré-requisito de A1) | desprezível | 0 (cálculo local) | baixa | sim |
| Q3 ledger das respostas avulsas | #8, #39 | alto (habilita calibração) | baixo | 0 | baixa | sim |
| Q4 decompor DIFF/FINAL (mesma chamada) | #4, #2 | médio-alto | baixo (advisory) | +2–4k/consulta | baixa | sim (A/B lado a lado) |
| Q5 pinar jev-1.13.0 | #12 | médio (estabilidade de gates enforce) | baixo | 0 | trivial | sim |
| Q6 conjunto rotulado (~50) | #7, #44 | alto | nenhum | 0 | baixa (tempo do operador) | sim |
| Q7 pass2 shadow para margem baixa | P/#6 | médio | conteúdo sai sem ZDR | ≈ 53–83k por rota | média | sim |
| A1 roteamento por faixas de confidence | #7, #30, #44 | alto | médio | ≈ 0 | média | depois de Q2+Q6 |
| A2 decision layer advisory na config isolada | densidade 0,05–0,09 | alto | médio (interação com o rotation controller) | + ~1 req/ação | média-alta | fase própria |
| A3 citation/contradiction check em handoff | #22, #29 | médio | baixo (advisory) | baixo | média | sim |
| A4 self-consistency em FINAL de alto risco | #31, #40 | médio | baixo-médio | +1–2 perguntas | baixa-média | sim |
| A5 SDK oficial / log por tentativa | #41, #42 | médio (retries invisíveis) | médio (cliente único dos gates) | 0 | média | parcial |

## Fase 6 — JEV sobre os próprios gaps (12 requests, `jev-1.13.0`, todas HTTP 200)
Cada candidato foi avaliado em 1 chamada MIXED com 11 perguntas independentes: 8 Nouls, 2 Scores (risco 0–3, qualidade da evidência 0–3) e 1 Choice (run / defer / reject).
- Resultados completos: `handoffs/assets/JEV_POTENTIAL_AUDIT_20261002_results.json` (sha 65aa66f7d281).
- Candidatos enviados: `..._candidates.json`.

| Candidato | request_id | P(run/defer/rej) | conf | autonomia | erro↓ | operador↓ | tokens↓ | observ. | evid. suf. | reversível | isolável | risco (conf) | qual. evid. (conf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q1 | req_01a0fe87b1a77ac89823df98ce5e36d0 | 0.88/0.09/0.03 | 0.82 | 0.47 | 0.52 | 0.28 | 0.22 | 0.92 | 0.42 | 0.92 | 0.89 | 0.27 (0.73) | 1.79 (0.67) |
| Q2 | req_01a0fe87b1aa7dbbb44c802613d14b0b | 0.99/0.01/0.00 | 0.98 | 0.24 | 0.54 | 0.17 | 0.12 | 0.94 | 0.64 | 0.94 | 0.93 | 0.12 (0.88) | 2.25 (0.62) |
| Q3 | req_01a0fe87b1b3767c84690bf047744e3a | 0.95/0.04/0.01 | 0.93 | 0.32 | 0.69 | 0.26 | 0.18 | 0.93 | 0.68 | 0.82 | 0.83 | 0.89 (0.68) | 2.14 (0.74) |
| Q4 | req_01a0fe87b1a679f39f26b4c0d074b314 | 0.99/0.01/0.00 | 0.97 | 0.50 | 0.73 | 0.30 | 0.54 | 0.85 | 0.52 | 0.88 | 0.85 | 0.50 (0.50) | 1.87 (0.67) |
| Q5 | req_01a0fe87b1857c5da479fdf2941d0a4b | 0.97/0.03/0.00 | 0.95 | 0.39 | 0.74 | 0.25 | 0.19 | 0.30 | 0.66 | 0.94 | 0.83 | 0.57 (0.53) | 1.75 (0.72) |
| Q6 | req_01a0fe87b1ae7d839bce89829f17f6d5 | 0.83/0.17/0.00 | 0.74 | 0.55 | 0.71 | 0.30 | 0.21 | 0.84 | 0.55 | 0.87 | 0.89 | 0.41 (0.59) | 1.64 (0.61) |
| Q7 | req_01a0fe87b1bb7192b8fb2f478b6a4e11 | 0.96/0.04/0.00 | 0.94 | 0.36 | 0.62 | 0.20 | 0.56 | 0.78 | 0.51 | 0.90 | 0.87 | 0.35 (0.65) | 1.83 (0.73) |
| A1 | req_01a0fe87b1ab7c929055be454b570118 | 0.90/0.10/0.00 | 0.85 | 0.70 | 0.77 | 0.42 | 0.36 | 0.68 | 0.53 | 0.77 | 0.77 | 1.06 (0.64) | 1.53 (0.51) |
| A2 | req_01a0fe87b1b27453b690bc47e254ed34 | 0.98/0.02/0.00 | 0.97 | 0.21 | 0.70 | 0.19 | 0.30 | 0.78 | 0.40 | 0.86 | 0.83 | 0.74 (0.65) | 2.08 (0.72) |
| A3 | req_01a0fe87b1a77f91967d4c4bd30edd12 | 0.92/0.07/0.01 | 0.89 | 0.50 | 0.74 | 0.50 | 0.25 | 0.75 | 0.47 | 0.87 | 0.84 | 0.49 (0.51) | 1.24 (0.74) |
| A4 | req_01a0fe87b1a373d7b04119237f37d84e | 0.95/0.03/0.02 | 0.92 | 0.38 | 0.80 | 0.23 | 0.16 | 0.71 | 0.43 | 0.74 | 0.74 | 1.03 (0.53) | 1.31 (0.67) |
| A5 | req_01a0fe87b1b57f1d8daa4a63de969246 | 0.88/0.11/0.01 | 0.82 | 0.45 | 0.66 | 0.23 | 0.23 | 0.65 | 0.61 | 0.78 | 0.56 | 1.58 (0.39) | 1.96 (0.86) |

Leitura:
- O **veredito agregado não discrimina**: run_experiment ganhou em 12/12. As perguntas decompostas discriminam. Este é o próprio argumento da auditoria a favor da decomposição.
- Sinais consistentes:
  - "reduz dependência do operador" < 0.5 em todos (máximo A3 0.50);
  - "evidência suficiente" moderada (0.40–0.68);
  - risco mais alto em A5 (1.58, confidence 0.39), A1 (1.06) e A4 (1.03);
  - risco mais baixo e mais certo em Q2 (0.12, confidence 0.88).
- Viés: um único avaliador e enquadramento escrito por Claude.

## Fase 7 — Resultado
- JEV_OFFICIAL_CAPABILITIES = 49 · ACTIVE 13 · PARTIAL 10 · NOT_USED 15 · MISUSED 1 · N/A 9 · UNKNOWN 1.
- CURRENT_JEV_DENSITY:
  - linha atual: 0,091 por Edit/Write (≈ 0,049 contando os shells mutáveis);
  - era dos gates: 0,99.
- CURRENT_PROBABILITY_USAGE:
  - decide persiste a distribuição completa, mas os gates usam só limiar de Noul + classe vencedora;
  - router usa P_E/P_U num score manual;
  - nas avulsas a distribuição não é persistida centralmente nem usada.
- CURRENT_CONFIDENCE_USAGE: zero efeito em qualquer decisão. É só registrada.
- MULTI_QUESTION_USAGE: router 24/req; decide 4,49/req; DIFF/FINAL 1,11/req.
- PARALLEL_USAGE: router com 4 workers; decide sequencial; avulsas sequenciais.
- Próximo passo: nenhum sem ordem do operador. Se aprovado, o primeiro bloco de menor risco é Q2 + Q3 + Q1 (shadow, custo 0, sem mudança de comportamento), seguido de Q5 e Q6.

---

## GLOBAL CLAUDE CODE BENCHMARK (sessão 1131cf45, 2026-10-02 21:56Z → 22:05Z) — somente leitura, nada implementado

Escopo medido: config isolada `C:\Users\ADM\.claude-darkprogectis` (Claude Code 2.1.288), 41 transcripts principais de 01/10 00:07Z a 02/10 21:56Z, mais o perfil padrão `C:\Users\ADM\.claude` (só config). Script: scratchpad 1131cf45 `ctx.js`. Não houve WebSearch: a coluna "o que usuários avançados fazem" vem de conhecimento geral das práticas documentadas do Claude Code e não foi reverificada hoje.

### Fatos medidos
- **Subagentes:**
  - config isolada: **0 chamadas Agent/Task e 0 transcripts de subagente** em 41 sessões; nenhum diretório agents/ (nem `.claude-darkprogectis/agents` nem `.claude/agents` do repo);
  - perfil padrão: 35 agentes gsd-*, **nenhum declara model:**; eles não carregam nesta config.
- **Modelo:** 6030/6030 mensagens assistant = claude-opus-5-5. Nenhum model em settings. Não existe roteamento de modelo.
- **Uso da API (soma das chamadas):** cache_read 841,7M · cache_write 18,8M · input 12k · output 7,26M tokens. O contexto acumulado é relido a cada passo; daí as 12 rotações desta linha.
- **Retorno ao contexto principal** (tool_results: 6,88M chars):
  - **Bash de leitura (cat/sed/grep/head) 71,3 %** (1708 chamadas, média 2,9k);
  - Read 14,3 % (179, média 5,5k);
  - PowerShell 6 %; Grep 1,4 %; testes 0,8 %; JEV 0,4 %; Edit/Write 1,5 %;
  - 29 resultados > 20k chars somam 744k chars (os maiores são Reads de 25–46k).
  - Overhead fixo por sessão (attachments): prompt_snapshot 6,44M chars em 82 eventos (brief + system prompt a cada sessão e rotação), skill_listing 600k, CLAUDE.md 409k, total_tokens_reminder 2692× (245k), deferred tools 204k, agent listing 117k.
- **Worktrees:** só main (git worktree list); nenhum uso. Não há agentes concorrentes, logo não há colisão hoje.
- **Hooks:**
  - **config isolada:** rotation controller V3, 5 eventos (SessionStart, UserPromptSubmit, PreToolUse *, PostToolUse *, Stop), todos síncronos com timeout 15 s, chamado em toda ferramenta (2× por ferramenta). Sem LLM e sem JEV. Injeta texto no contexto só em PREPARE/WARNING/rotação (o brief).
  - **Projeto (.claude/settings.json):** jev-finish-v1 em 4 eventos (Pre em Write/Edit/Bash/PowerShell, Post em Write/Edit, Stop, SessionStart), síncrono, 15 s. É uma state machine determinística (stage/test/blocker/recheck/complete); 16 loops registrados. No Stop pode injetar uma continuação (texto).
  - **Perfil padrão:** 27 entradas (JEV gates edit/action/shell/stop, auto-rotate pre/post em * com timeout 90 s, 12 hooks gsd-*). Todas síncronas; os gates JEV e o stop gate bloqueiam.
  - Duração real por hook: UNKNOWN (nenhum hook registra latência).
- **Orquestração:**
  - **determinística:** rotação (hook + watchdog), jev-finish (estágios + recheck que reroda os testes), gates JEV (perfil padrão);
  - **depende do Claude:** escolher a próxima ação, montar o spec das consultas DIFF/FINAL (30 consultas avulsas, 1 pergunta cada), decidir o que ler (1708 leituras via Bash), escrever handoffs.
- **Persistência fora do contexto:**
  - ATIVO: handoffs .md, jev-routing/jev-decisions ndjson, rotation events.jsonl/lineage.jsonl, loops do jev-finish em JSON;
  - não usados: SQLite, task board, mailboxes;
  - artifacts não usados para resultados de agentes.
- **Feedback loop:**
  - os elos decision → execution existem (decision_id ↔ request_id ↔ activity edit);
  - **outcome → label não existe**: só 25 rótulos (router, 22/09) e nenhum desfecho registrado para gate, DIFF ou FINAL.
- **Observabilidade:**
  - reconstruíveis: tokens/duração por sessão (transcripts), decisões JEV com distribuição completa (perfil padrão), arquivos modificados (Edit/Write nos transcripts), testes (jev-finish);
  - não reconstruíveis: árvore de agentes (não há); retries JEV (ocultos, lib.js); latência dos hooks; resultado final por decisão.

### Matriz
| Pattern | Status | Evidência local | Usuários avançados | Nosso gap | Benefício mensurável | Risco | Reduz contexto principal | Pode usar JEV | Experimento |
|---|---|---|---|---|---|---|---|---|---|
| Subagentes especializados | NOT_USED (config isolada) · PARTIAL (35 gsd no perfil padrão, uso não medido) | 0 Agent calls/41 sessões | delegam leitura pesada e revisão a subagentes com contexto próprio | toda leitura volta ao principal | parte dos 85,6 % (Bash read + Read) sairia do principal | resumo pode omitir evidência; spawn frio; classifier pode negar | YES | YES (validar a saída) | YES |
| Isolamento de contexto | PARTIAL | rotação limita o teto; 71 % do retorno vem de leituras via Bash | leituras grandes em subagente/arquivo; outputs filtrados | 29 resultados > 20k; brief reinjetado a cada rotação | menos rotações (12 nesta linha) | perder detalhe necessário | YES | NO | YES |
| Worktrees | NOT_USED | só main | uma árvore por agente paralelo | sem escrita paralela, logo sem necessidade hoje | ~0 no workflow atual | alvos NT8/staging/AddOns ficam fora do repo (worktree não isola); confusão de caminhos | NO | NO | NO |
| Orquestração determinística | PARTIAL | rotação, jev-finish e gates em código; próximo passo decidido pelo Claude | workflows em script/headless, DAG, hooks | DIFF/FINAL montados à mão; releitura de handoff a cada sessão | menos raciocínio repetido | rigidez; scripts envelhecem | YES | YES | YES |
| Hooks | ACTIVE (5+4 aqui, 27 no padrão) | todos síncronos; sem medida de duração | poucos hooks, rápidos, observacionais; async quando possível | 2 processos node por ferramenta aqui; 90 s de timeout no padrão; sem métrica | latência por ferramenta (UNKNOWN) | hook lento ou quebrado trava a sessão | NO | NO | YES (só medir) |
| Model routing | NOT_USED | 100 % Opus 5.5; agentes sem model: | modelo menor para busca/leitura, maior para decisão | tarefas mecânicas no modelo maior | custo por tarefa | qualidade menor em leitura crítica | NO | YES | YES |
| Multi-agent / reviewer independente | NOT_USED | 0 subagentes; paralelismo só em ferramentas e na Fase 6 JEV | reviewer independente + agentes em background | review = o próprio Claude + JEV | detectar erro que o autor não vê | spawn descontrolado; custo | YES | YES | YES |
| Persistência fora do contexto | ACTIVE (arquivos/ndjson) · NOT_USED (SQLite/task board/mailbox) | handoffs, logs, loops | arquivos/task board como canal entre agentes | respostas JEV avulsas em scratchpad volátil | habilita calibração | proliferação de arquivos | YES | YES | NO (Q3 cobre) |
| Feedback loop decision→outcome→label | NOT_USED (outcome/label) | 25 rótulos; zero desfecho | eval sets, rótulos por desfecho | não dá para saber se uma decisão estava certa | calibrar min_noul/confidence | trabalho do operador | NO | YES | YES (Q6) |
| Observabilidade | PARTIAL | transcripts + ndjson; sem retries nem latência | telemetria/custo por sessão | retries ocultos; sem ligação decisão↔resultado | diagnóstico | baixo | NO | NO | YES (A5/Q3) |

### Entregáveis
- **OUR_EXISTING_ADVANTAGES:**
  - rotação automática determinística com brief e handoff (sem /clear);
  - jev-finish (state machine com recheck que reroda os testes);
  - gates JEV fail-closed com ledger completo (perfil padrão);
  - handoffs canônicos com hashes;
  - fronteiras rígidas de produção/F5;
  - logs ndjson com request_id.
- **OUR_CONFIRMED_GAPS:**
  - zero subagentes e zero reviewer independente;
  - zero model routing;
  - sem desfecho/rótulo;
  - latência dos hooks não medida;
  - retries JEV invisíveis;
  - respostas JEV avulsas voláteis;
  - stop gate por presença (#23).
- **CONTEXT_WASTE_SOURCES:**
  - leituras via Bash, 71,3 % dos tool_results (4,9M chars);
  - Read 14,3 % (29 resultados > 20k = 744k);
  - reinjeção de prompt/brief (6,44M chars em 82 eventos);
  - skill listing 600k e CLAUDE.md 409k;
  - 2692 total_tokens_reminder (245k).
  - O cache read soma 841,7M tokens: o custo dominante é reler o contexto acumulado (output 7,26M).
- **JEV_UNDERUSED_DECISION_POINTS:**
  - próximo passo na config isolada (0 gates aqui; densidade 0,05–0,09);
  - DIFF/FINAL com 1 pergunta;
  - validar se a saída de um subagente sustenta a conclusão;
  - rota de modelo;
  - "a leitura X é necessária?" antes de ler;
  - contradição em handoffs na rotação (A3).
- **CLAUDE_UNNECESSARY_REASONING_POINTS:**
  - reler handoffs e brief inteiros a cada rotação;
  - montar à mão o spec de DIFF/FINAL;
  - leituras exploratórias repetidas dos mesmos logs entre sessões;
  - reconciliações refeitas por script ad hoc em cada auditoria;
  - formatar relatórios recorrentes.
- **PARALLELIZATION_OPPORTUNITIES:**
  - consultas JEV independentes em Promise.all (provado na Fase 6: 12 em paralelo, todas HTTP 200; limite oficial 40 req/s);
  - auditorias somente leitura em subagentes Explore paralelos, devolvendo só a conclusão;
  - reviewer independente em paralelo à implementação.
  - Escrita paralela: **não** (alvos únicos: staging/NT8/handoff).
- **THINGS_WE_SHOULD_NOT_ADOPT (agora):**
  - worktrees;
  - agent teams/muitos agentes concorrentes;
  - mais hooks síncronos em *;
  - JEV/subagentes no caminho crítico de ordem/NT8/F5;
  - modelo menor em diagnóstico de incidente;
  - decisão de rotação por LLM.
- **SMALLEST_SAFE_EXPERIMENTS** (shadow/medição, reversíveis, só com ordem):
  - **B1** registrar a latência de cada hook;
  - **B2** numa auditoria somente leitura, delegar a coleta a 1 subagente Explore e comparar tokens do principal e qualidade com a execução inline;
  - **B3** regra de leitura limitada (head/filtro, sem cat inteiro em log) e medir a queda dos 71 %;
  - **B4** template fixo de DIFF/FINAL decomposto, gerado por script (= Q4);
  - **B5** reviewer independente (subagente) em 1 FINAL de baixo risco, lado a lado com o JEV FINAL;
  - **B6** medir o tamanho do brief/prompt_snapshot por rotação (sem mexer no controller).
- **Cruzamento com a auditoria JEV:**
  - B4 = Q4; feedback loop = Q3 + Q6; observabilidade = A5 + Q3;
  - A2 atacaria a densidade 0,05–0,09 e os próximos passos decididos só pelo Claude;
  - a prioridade de menor risco continua Q2 + Q3 + Q1; do benchmark, B1 e B3 custam zero.

## ESTADO EXATO NA SAÍDA (sessão 1131cf45, contexto ≈ 215k, WARNING)
- Concluídos: auditoria de uso (`HANDOFF_JEV_USAGE_AUDIT_20261002.md`, seção CONCLUSÃO), auditoria de potencial JEV (Fases 0–7) e GLOBAL CLAUDE CODE BENCHMARK. Nada implementado.
- Arquivos criados ou alterados nesta sessão (todos **não commitados**):
  - `handoffs/HANDOFF_JEV_USAGE_AUDIT_20261002.md` (untracked; recebeu a seção CONCLUSÃO);
  - `handoffs/HANDOFF_JEV_POTENTIAL_AUDIT_20261002.md` (novo, untracked);
  - `handoffs/assets/JEV_POTENTIAL_AUDIT_20261002_results.json` e `..._candidates.json` (novos, untracked).
- Pendências do git anteriores a esta sessão: inalteradas (ver o brief de rotação: START_JEV_CLAUDE.ps1, hook.mjs, testes de rotação, handoffs untracked etc.).
- Testes: nenhum executado (auditoria somente leitura). Código, hooks, settings e config: intocados. JEV: 12 consultas `audit-potential-20261002:*` (21:31:38Z), todas HTTP 200.
- Scripts no scratchpad 1131cf45: `sep.js`, `t.js`, `dec.js`, `tools.js`, `ctx.js`, `gap_ask.js`.
- **Próximo passo exato:** nenhum sem ordem explícita do operador. Opções a decidir:
  - (a) aprovar o bloco shadow Q2 + Q3 + Q1 (+ B1/B3);
  - (b) commitar os handoffs/assets desta sessão;
  - (c) fornecer um export do painel TypeSafe para fechar os números exatos da auditoria de uso.

## PASSO 3 (ordem do operador, 2026-10-02 ~22:10Z) — CONCLUÍDO em 4ac35a75 (ver seção COMPLETA no fim): "GLOBAL BENCHMARK — WEB VERIFIED"
- Ordem: pesquisa externa REAL (WebSearch) cobrindo:
  - fontes: docs oficiais Claude Code/Anthropic, issues de anthropics/claude-code, r/ClaudeCode, r/ClaudeWorkflows, HN, repositórios públicos de config;
  - tópicos A–H: subagentes/isolamento, model routing, agent teams, hooks, context engineering, orquestração, feedback/evals, observabilidade.
- Para cada padrão registrar: SOURCE/DATE/tipo (OFFICIAL, COMMUNITY ou ISSUE)/CLAIM/EVIDENCE/MATURITY/KNOWN_FAILURES/LOCAL_EQUIVALENT/OUR_STATUS/POTENTIAL_FIT/DO_NOT_ADOPT_REASON.
- Cruzar com os números locais do benchmark acima.
- Adicionar a seção `## GLOBAL BENCHMARK — WEB VERIFIED` com: CONFIRMED_BY_OFFICIAL_DOCS / REPEATED_COMMUNITY_PATTERNS / KNOWN_CURRENT_FAILURES / OUR_MEASURED_GAPS_CONFIRMED_EXTERNALLY / PRACTICES_NOT_SUITABLE_FOR_US / CANDIDATES_FOR_CONTROLLED_EXPERIMENT.
- Retornar APENAS: WEB_RESEARCH, SOURCES_CHECKED, OFFICIAL_SOURCES, COMMUNITY_SOURCES, ISSUES_CHECKED, LOCAL_GAPS_EXTERNALLY_CONFIRMED, NEW_CAPABILITIES_FOUND, CONTRADICTIONS_WITH_PREVIOUS_BENCHMARK.
- Proibido: implementar, alterar hooks/settings/config, criar agentes, ativar Agent Teams, mudar roteamento de modelos. Se não houver WebSearch: WEB_RESEARCH_UNAVAILABLE e parar.
- Progresso: as notas brutas vão em `handoffs/assets/JEV_WEB_BENCHMARK_NOTES_20261002.md` (append a cada busca). **Sucessora: ler esse arquivo, continuar pelos tópicos ainda sem nota, escrever a seção final e parar.**

## GLOBAL BENCHMARK — WEB VERIFIED (PARCIAL — sessão 1131cf45, ~22:15Z) — SUPERADA pela seção COMPLETA abaixo
- **Status: PARTIAL.**
  - 6 WebSearch feitas (5 com resultado; reddit.com bloqueado para o user agent, HTTP 400 ⇒ r/ClaudeCode e r/ClaudeWorkflows UNAVAILABLE).
  - Paradas pelo limite de contexto desta sessão (~230k).
  - Só snippets de busca; páginas não foram abertas.
  - Notas: `handoffs/assets/JEV_WEB_BENCHMARK_NOTES_20261002.md`.
- **CONFIRMED_BY_OFFICIAL_DOCS** (code.claude.com, set–out/2026):
  - sub-agents: contexto próprio, só a mensagem final volta; `model` por agente; `isolation: worktree`; recomenda exploração fora do principal e modelo mais barato para tarefas simples;
  - best-practices: CLAUDE.md < 200 linhas, referência em skills sob demanda;
  - hooks: `async: true` em background; `additionalContext` com teto de 10k chars (acima vira arquivo + preview de 2k); hook não custa contexto salvo a saída injetada;
  - monitoring-usage: OpenTelemetry exporta custo, tokens (inclusive cache_read/cache_creation), tempo ativo, decisões de permissão e traces;
  - páginas novas encontradas e não lidas: /workflows ("orchestrate subagents at scale with dynamic workflows"), /agents (paralelo), /prompt-caching, /costs, /plugins/measure.
- **REPEATED_COMMUNITY_PATTERNS** (HN, 2025–2026; relatos, não consenso medido):
  - principal como orquestrador, com trabalho pesado em subagentes de contexto novo;
  - "gestão agressiva de contexto";
  - kanban + worktree por agente para evitar colisão;
  - task system/mailbox para times (itens 46902368, 46990733, 47602986, 45587910, 46040630).
- **KNOWN_CURRENT_FAILURES** (issues de anthropics/claude-code):
  - #97076 (set/2026, Windows 11): subagente default herda ~60k tokens (60.236 cache_creation num caso simples);
  - #72566: 5 agentes viraram 361+ e esgotaram a quota de 5 h;
  - #95816: Workflow sem teto, ~36,6M tokens / ~US$ 606;
  - #68619: recursão 50+ níveis ignorando `CLAUDE_CODE_FORK_SUBAGENT=0`;
  - #97955: filhos continuam após o pai;
  - #94240/#82434/#79735: spawn ignora escopo e restrições;
  - #43198 (Windows): subagentes aninhados, 30 % da quota;
  - #27645: subagente em tarefa trivial.
- **OUR_MEASURED_GAPS_CONFIRMED_EXTERNALLY (5):**
  1. 0 subagentes com 85,6 % do retorno vindo de leituras (a doc oficial recomenda isolar exploração);
  2. 6030/6030 respostas Opus sem `model` por tarefa (a doc oficial recomenda modelo mais barato para tarefa simples);
  3. hooks 100 % síncronos sem medida (async oficial disponível para os observacionais);
  4. observabilidade sem tokens/custo por fluxo (OTel oficial cobre isso, inclusive cache_read, nosso custo dominante de 841,7M);
  5. contexto fixo grande (CLAUDE.md ≈ 10k chars por sessão × recomendação de < 200 linhas; prompt_snapshot 6,44M).
  - Não confirmados externamente nesta rodada: outcome→label, densidade JEV, DIFF/FINAL com 1 pergunta (são específicos do JEV; sem fonte buscada).
- **PRACTICES_NOT_SUITABLE_FOR_US:**
  - agent teams/swarms e workflows de muitos agentes: issues mostram explosão de custo, recursão e filhos órfãos, inclusive em Windows (nossa plataforma);
  - worktree por agente: nossos alvos (NT8/staging) ficam fora do repo e não há escrita paralela;
  - subagente para leitura pequena: ~60k de overhead (#97076) contra a média de 2,9k da nossa leitura via Bash ⇒ prejuízo.
- **CANDIDATES_FOR_CONTROLLED_EXPERIMENT** (nada implementado):
  - B2 (1 subagente Explore numa auditoria somente leitura, com `model` explícito, teto de 1 agente, medir cache_creation contra o ganho no principal; só para leituras > 20k);
  - B1 (latência dos hooks) e async só para hooks observacionais;
  - OTel local (só medir; a config não foi alterada);
  - B3 (leitura limitada);
  - B6 + medir CLAUDE.md contra < 200 linhas.
- **Contradições com o benchmark anterior: 1 (parcial).**
  - O anterior tratava subagentes como redutor claro do contexto principal.
  - A issue #97076 mostra ~60k de overhead por spawn em Windows, então o ganho só existe para leituras grandes.
  - "Usuários avançados fazem X" está agora verificado para subagentes, model, hooks async e OTel.
- **Próximo passo (sucessora, se o operador pedir COMPLETE):**
  - abrir as páginas oficiais /workflows, /agents, /prompt-caching e /costs;
  - buscar repositórios públicos de config no GitHub e evals/feedback (tópico G);
  - completar a tabela por padrão (SOURCE/DATE/…/DO_NOT_ADOPT_REASON).

## GLOBAL BENCHMARK — WEB VERIFIED (COMPLETO — sessão 4ac35a75, 2026-10-02) — somente leitura, nada implementado
- Base: 10 buscas/aberturas acumuladas (6 em 1131cf45 + 4 WebSearch e 4 páginas oficiais abertas integralmente nesta sessão). Notas brutas: `handoffs/assets/JEV_WEB_BENCHMARK_NOTES_20261002.md` (Buscas 1–10).
- Limitações: reddit.com bloqueado para a WebSearch (HTTP 400) ⇒ r/ClaudeCode e r/ClaudeWorkflows UNAVAILABLE. Comunidade = HN, GitHub e blogs. Issues lidas via snippet/digest; não reproduzidas aqui.
- Nenhuma config, hook, setting, agente ou roteamento alterado. Agent Teams não ativado.

### Tabela por padrão
| # | Padrão | SOURCE / DATE | Tipo | CLAIM / EVIDENCE | MATURITY | KNOWN_FAILURES | LOCAL_EQUIVALENT / OUR_STATUS | POTENTIAL_FIT | DO_NOT_ADOPT_REASON |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Subagente para leitura pesada (só o resumo volta) | code.claude.com sub-agents, costs ("Delegate verbose operations"), agents (2026) | OFFICIAL | resultado verboso fica no contexto do subagente | GA | #97076 ~60k overhead/spawn (Win11), #27645 | 0 subagentes; 85,6 % do retorno = leituras; 29 resultados > 20k · NOT_USED | ALTO só para leituras > 20k ou auditorias inteiras | leitura pequena (média 2,9k) custa mais que o overhead |
| A2 | Subagente especializado com `tools` e `model` restritos | sub-agents (2026); shanraisshan/claude-code-best-practice | OFFICIAL + COMMUNITY | definição reutilizável, ferramentas limitadas | GA | #94240/#82434/#79735 spawn ignora escopo | 35 `gsd-*` só no perfil padrão, nenhum com `model` · NOT_USED aqui | MÉDIO (1 Explore read-only) | — |
| B1 | Model routing por tarefa | costs ("Sonnet handles most coding tasks… reserve Opus"; `model: haiku` p/ subagente simples), workflows (model por estágio), agent-teams (ordem de escolha do model) | OFFICIAL | custo cai com o model certo por etapa | GA | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` sobrepõe; allowlist substitui | 6030/6030 respostas Opus · NOT_USED | MÉDIO (só em subagente experimental) | decisões JEV/F5/ordem continuam no modelo mais forte |
| B2 | Teto de agentes/custo | workflows: 16 concorrentes, 1.000/run, aviso > 25 agentes ou > 1,5M tokens **advisory**, `workflowSizeGuideline` = conselho; `--max-budget-usd`; `disableWorkflows` | OFFICIAL | caps de runtime + aviso | GA | #72566 (5→361 agentes), #95816 (~36,6M tokens/~US$ 606), #68619 recursão 50+, #97955 órfãos | sem subagentes ⇒ sem risco hoje | ALTO como pré-requisito de A1 | `ultracode` desliga aviso e limite: nunca usar |
| C1 | Agent Teams | agent-teams, costs (≈ 7× tokens em plan mode) (2026) | OFFICIAL | bom para review/hipóteses paralelas independentes | EXPERIMENTAL, off por padrão | sem resume, task status atrasa, sem worktree por teammate, split panes não suportado em Windows Terminal, subagente nomeado vira teammate sem confirmação | NOT_USED | BAIXO | Windows + custo 7× + trabalho nosso é sequencial e com gates; proibido nesta fase |
| C2 | Worktree por agente | agents, workflows (isolated copy), HN (kanban+worktree) | OFFICIAL + COMMUNITY | evita colisão em escrita paralela | GA | — | só `main`; alvos NT8 fora do repo · NOT_USED | BAIXO | sem escrita paralela |
| D1 | Hooks determinísticos como guardrail | hooks docs; shanraisshan ("hooks para regras que nunca podem quebrar") | OFFICIAL + COMMUNITY | hook garante execução, CLAUDE.md não | GA | PreToolUse "allow" erro intermitente H.includes; "defer" em Bash ⇒ tool result missing | rotation + jev-finish gates · ACTIVE | — (já adotado) | — |
| D2 | Hooks async para observação | hooks (`"async": true`, `asyncRewake`) | OFFICIAL | sai do caminho crítico | GA | — | 100 % síncronos, sem medida · NOT_USED | MÉDIO (só observacionais) | gates/rotação NÃO podem ser async |
| D3 | Custo de hook no Windows | claudeissues digests 2026 | ISSUE | criar processo no Windows deixa até hooks mínimos lentos | known issue | idem | rotation hook roda 2× por ferramenta · sem medida | ALTO para medir (B1 local) | — |
| D4 | Hook que pré-filtra saída (PreToolUse `updatedInput`) | costs (filtro de teste "tens of thousands → hundreds") | OFFICIAL | reduz o que entra no contexto | GA | regressões de PreToolUse acima | NOT_USED; leituras via Bash 71,3 % do retorno | MÉDIO (= B3 leitura limitada) | tocar hooks exige ordem |
| E1 | CLAUDE.md < 200 linhas + skills sob demanda | best-practices, costs | OFFICIAL | contexto fixo menor; regras não se perdem | GA | — | CLAUDE.md ≈ 10k chars/sessão; brief+system 6,44M chars · PARTIAL | MÉDIO (B6) | não mover regras canônicas sem ordem |
| E2 | additionalContext com teto | hooks (10k chars; acima vira arquivo + preview 2k) | OFFICIAL | limita injeção | GA | — | brief de rotação injetado no system prompt | MÉDIO (medir tamanho do brief) | — |
| E3 | Estado durável fora do contexto | best-practices; HN (task system/mailbox) | OFFICIAL + COMMUNITY | handoffs/arquivos > chat | GA | — | handoffs, ndjson, jev-finish JSON · ACTIVE | — | — |
| E4 | Cache/contexto longo como custo dominante | costs ("Why usage climbs in a long session"), `/usage` linha "Prompt cache (main)" com misses e causa provável | OFFICIAL | contexto relido a cada request | GA | — | 841,7M cache_read × 7,26M output · CONFIRMADO | ALTO (medir com `/usage`, sem custo) | — |
| F1 | Orquestração por script (dynamic workflows) | workflows (2026) | OFFICIAL | o plano vive no script; só o resultado volta; `schema` JSON; adversarial verify; resumível | GA (paid) | #95816 sem teto, #97076 workflow recebe última linha do chat como instrução | `jev-finish` máquina de estados própria · PARTIAL | BAIXO–MÉDIO (só auditoria read-only com size small) | custo/explosão; ultracode proibido |
| F2 | generate → review independente | workflows ("adversarially verify"), agent-teams (hipóteses concorrentes) | OFFICIAL | reduz ancoragem | GA | custo multiplicado | DIFF/FINAL decididos pelo próprio Claude · NOT_USED | MÉDIO (1 reviewer read-only) | — |
| G1 | Evals: dataset + graders + trajetória + outcome | tabnews/andersonlimadev, dzone, mindstudio (2026) | COMMUNITY | outcome = estado final, não a frase do agente; registrar versão/commit/model por tentativa | relatos, sem medição pública | — | 25 rótulos, nenhum outcome registrado · NOT_USED | ALTO (= Q3+Q6) | — |
| H1 | Observabilidade OTel | monitoring-usage, costs ("only option that streams per-user token and cost") | OFFICIAL | tokens (inclusive cache_read), custo, tempo, decisões de permissão, traces | GA | — | nada exportado · NOT_USED | ALTO (só medir, local) | exige config ⇒ ordem |
| H2 | `/usage` attribution + `/insights` + `/workflows` view | costs, workflows | OFFICIAL | atribuição por skill/subagente/MCP; relatório de fricção; tokens por fase | GA | locais; não cobrem outros dispositivos | não usados · NOT_USED | ALTO (custo zero, só leitura) | — |

### CONFIRMED_BY_OFFICIAL_DOCS
- A1, A2, B1, B2, C1 (experimental), D1, D2, D4, E1, E2, E4, F1, F2, H1, H2: todos na tabela acima.
### REPEATED_COMMUNITY_PATTERNS
- Principal como orquestrador com workers de contexto novo (HN).
- Hooks para regras invioláveis × CLAUDE.md para preferências (GitHub best-practice).
- Kanban + worktree por agente (HN).
- Evals com outcome real + calibração humana (blogs 2026). Não é consenso medido.
### KNOWN_CURRENT_FAILURES
- #97076, #72566, #95816, #68619, #97955, #94240/#82434/#79735, #43198, #27645 (ver PARCIAL acima).
- Hooks no Windows lentos por custo de criar processo; PreToolUse allow/defer com erros intermitentes.
- Agent Teams: sem resume, task status atrasa, split panes não suportado em Windows Terminal.
### OUR_MEASURED_GAPS_CONFIRMED_EXTERNALLY (7)
1. 0 subagentes com leituras dominando o retorno (A1).
2. 100 % Opus sem routing (B1; a doc oficial de custos diz literalmente "reserve Opus").
3. Hooks síncronos sem medida (D2), agravado no Windows (D3).
4. Sem observabilidade de tokens/custo (H1/H2).
5. Contexto fixo grande (E1).
6. Releitura do contexto como custo dominante (E4: a doc oficial descreve exatamente o nosso 841,7M de cache_read).
7. Sem outcome → label (G1; só comunidade).
### PRACTICES_NOT_SUITABLE_FOR_US
- Agent Teams (C1), ultracode e workflows sem size small (F1/B2), worktree por agente (C2).
- Subagente para leitura pequena (A1); async em hooks bloqueantes (D2).
### CANDIDATES_FOR_CONTROLLED_EXPERIMENT (nada implementado; cada um exige ordem)
- Custo zero, só leitura:
  - rodar `/usage` (linha Prompt cache + attribution) e `/insights` numa sessão;
  - B1, medir a latência dos hooks (prioridade subiu por D3).
- Shadow:
  - Q2 + Q3 + Q1 (outcome → label = G1);
  - OTel local, só medir.
- Experimento único:
  - B2 (1 subagente Explore read-only, `model` explícito, teto de 1, só leitura > 20k, medir cache_creation contra o ganho);
  - F2 (1 reviewer independente read-only).
- Depois: B3/D4 (leitura limitada) e B6/E1 (CLAUDE.md enxuto).
### CONTRADICTIONS_WITH_PREVIOUS_BENCHMARK (2)
1. Subagente não é redutor universal: ~60k de overhead por spawn em Windows (#97076); só compensa em leitura > 20k.
2. O benchmark local marcava a orquestração determinística como lacuna sem via oficial. Existe via oficial (dynamic workflows, GA, com script, schema e verify), mas os caps são advisory e há issues de explosão de custo. Logo, "adotar workflow" não é ganho automático; no máximo um experimento size small.
- Nenhum achado local foi refutado; todos os NOT_USED/PARTIAL continuam válidos.

### Próximo passo exato
- Nenhum sem ordem do operador. Opções:
  - (a) bloco de custo zero (`/usage`, `/insights`, B1);
  - (b) shadow Q2 + Q3 + Q1;
  - (c) commit dos handoffs e assets das sessões 1131cf45 e 4ac35a75 (`HANDOFF_JEV_USAGE_AUDIT_20261002.md`, `HANDOFF_JEV_POTENTIAL_AUDIT_20261002.md`, `assets/JEV_POTENTIAL_AUDIT_20261002_*.json`, `assets/JEV_WEB_BENCHMARK_NOTES_20261002.md`).
