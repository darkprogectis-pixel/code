# Notas brutas — GLOBAL BENCHMARK WEB VERIFIED (2026-10-02, sessão 1131cf45)

## Busca 1 — OFFICIAL (code.claude.com / docs.anthropic.com), tópicos A/B
- https://code.claude.com/docs/en/sub-agents
  - cada subagente tem contexto próprio; só a mensagem final volta ao pai;
  - campo `model`: sonnet/opus/haiku/fable/ID completo/inherit; `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` ignora o model;
  - `isolation: worktree`;
  - boas práticas: manter exploração fora do principal, limitar ferramentas, rotear para modelos mais baratos (Haiku).
- https://code.claude.com/docs/en/best-practices: "use subagents to investigate X" para manter o principal limpo.
- Outras páginas oficiais encontradas, ainda não lidas:
  - /agents (agentes em paralelo);
  - /workflows ("Orchestrate subagents at scale with dynamic workflows");
  - /skills;
  - /agent-sdk/subagents;
  - PDF "Claude Code Advanced Patterns: Subagents, MCP, and Scaling".

## Busca 2 — ISSUES github.com/anthropics/claude-code, tópicos B/C
- #97076 (set/2026, Windows 11): subagente default nasce com ~60k tokens herdados (system prompt, schemas, skills, saída de hook); 60.236 cache_creation num caso simples. Subagentes de workflow recebem a última linha do chat como instrução.
- #68619: recursão infinita de subagentes (50+ níveis), ignorando `CLAUDE_CODE_FORK_SUBAGENT=0`.
- #72566: 5 agentes planejados viraram 361+ agentes em background; esgotou a quota de 5 h.
- #95816: Workflow tool sem teto (547 agentes planejados, ~180 rodando, ~36,6M tokens, ~US$ 606 em 4 h 15).
- #94240, #82434, #79735: spawn ignora restrições e escopo.
- #97955: filhos continuam rodando após o pai terminar.
- #43198 (Windows): statusline-setup com subagentes aninhados consumiu 30 % da quota.
- #27645: subagente gasta tokens em tarefa que deveria ser direta.
- Classe = ISSUE (bugs relatados; a gravidade varia por versão; não reproduzidos aqui).
- **Relevância local:**
  - spawn em Windows custa ~60k de overhead, o que corrói o ganho de delegar leituras pequenas (nossa média de Bash read é 2,9k chars);
  - delegar só faz sentido para leituras grandes (29 resultados > 20k) ou auditorias inteiras.

## Busca 3 — OFFICIAL hooks/context (code.claude.com/docs/en/hooks, hooks-guide, best-practices)
- Hooks `"async": true` rodam em background; a saída chega no turno seguinte; `asyncRewake` (exit 2) acorda a sessão.
- `additionalContext` tem teto de 10.000 chars: acima disso vira arquivo + preview de 2.000 chars. É injetado como system reminder.
- Hooks não custam contexto, salvo a saída injetada.
- CLAUDE.md: recomendação de < 200 linhas; o material de referência vai para skills (carregadas sob demanda); CLAUDE.md muito especificado faz regras se perderem.
- **Relevância local:**
  - nossos hooks são todos síncronos (5+4 aqui, 27 no padrão); B1 (medir latência) continua válido;
  - candidatos a async: os observacionais (activity, context-monitor); bloqueantes (gates, rotação) não podem ser async;
  - CLAUDE.md do repo ≈ 409k chars em 41 sessões ≈ 10k chars por sessão; contar as linhas e comparar com < 200.

## Busca 4 — COMMUNITY (reddit/HN): reddit.com **bloqueado** para o user agent da WebSearch (HTTP 400). r/ClaudeCode e r/ClaudeWorkflows = UNAVAILABLE. Tentar HN e GitHub de configs públicas separadamente.

## Busca 5–6 (sessão 1131cf45; registradas só na seção PARCIAL do handoff): HN community + OTel monitoring-usage.

## Busca 7 — OFFICIAL páginas abertas (sessão 4ac35a75, 2026-10-02)
- https://code.claude.com/docs/en/workflows (dynamic workflows):
  - script JS (`agent()`, `pipeline()`, `parallel()`, `phase()`, `schema` JSON) executado pelo runtime; o plano fica no script e só a resposta final entra no contexto do Claude;
  - limites: 16 agentes concorrentes (env `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`), 4.096 itens/pipeline, **1.000 agentes/run**; aviso "Large workflow" > 25 agentes ou > 1,5M tokens projetados é **só advisory**; `workflowSizeGuideline` small/medium/large é **conselho, não teto**; `ultracode` desliga aviso e limite de subagentes concorrentes;
  - modelo por estágio = per-invocation model; sem model ⇒ modelo da sessão;
  - `/workflows` mostra tokens, agentes e tempo por fase (observabilidade nativa); runs resumíveis; script salvo em `.claude/workflows/`;
  - padrão oficial "adversarially verify each finding" (generate → review independente);
  - `disableWorkflows: true` / `CLAUDE_CODE_DISABLE_WORKFLOWS=1` desligam.
- https://code.claude.com/docs/en/costs:
  - "Sonnet handles most coding tasks… Reserve Opus for complex architectural decisions"; `model: haiku` para subagentes simples;
  - CLAUDE.md < 200 linhas, instruções especializadas → skills sob demanda;
  - hooks de pré-processamento (filtrar saída de teste/log) "tens of thousands → hundreds" de tokens;
  - delegar operações verbosas (testes, logs, docs) a subagentes;
  - agent teams ≈ **7× tokens** em plan mode; usar Sonnet para teammates, times pequenos;
  - "Why usage climbs in a long session": contexto longo relido a cada request (= nosso cache_read 841,7M); `/usage` mostra "Prompt cache (main)" com misses e causa provável; `/insights` relatório de fricção; attribution por skill/subagente/MCP;
  - OTel = única via de métricas por usuário em tempo quase real.
- https://code.claude.com/docs/en/agents: subagents (side task que inundaria o contexto) × agent view × agent teams (**experimental, desligado por padrão**, sem isolamento por worktree) × workflows × projects; "running several sessions or subagents multiplies token usage".

## Busca 8 — OFFICIAL agent-teams (code.claude.com/docs/en/agent-teams)
- experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; com teams ligado, subagente **nomeado** vira teammate sem confirmação;
- usar quando: pesquisa/review paralelo, hipóteses concorrentes, módulos independentes; não usar: tarefas sequenciais, mesmo arquivo, muitas dependências;
- sem worktree por teammate (conflito de arquivo = overwrite); 3–5 teammates; custo linear;
- hooks TeammateIdle / TaskCreated / TaskCompleted (exit 2 = gate);
- limitações: sem resume de teammates in-process, status de task atrasa, um time por sessão, sem times aninhados, lead fixo; **split panes não suportado em Windows Terminal** (só in-process); permissões de teammates sobem ao lead; cache de teammate 5 min por padrão (`subagentPromptCacheTtl`).

## Busca 9 — COMMUNITY evals/feedback (tópico G)
- tabnews.com.br (andersonlimadev) "Evals para Agents no Claude Code": dataset de tarefas representativas + graders determinísticos/modelo/humano + inspeção de trajetória + calibração humana + threshold em CI; registrar por tentativa: versão do agente, commit, task ID, modelo, ferramentas; outcome = estado final do ambiente, não a frase do agente.
- dzone "vibe coding to production claude evals loop"; mindstudio "skill learnings loop" (aprender com falhas → atualizar skill). COMMUNITY, sem medição pública.
- github shanraisshan/claude-code-best-practice: CLAUDE.md para preferências, **hooks para regras que nunca podem quebrar**; arquitetura Command/Agent/Skill em 3 camadas.

## Busca 10 — ISSUES hooks/Windows
- claudeissues.com (digests 2026): latência de hooks no Windows vem do custo de criar processo; "even minimal hooks noticeably slower on Windows"; equipe trabalhando nisso.
- PreToolUse `permissionDecision: "allow"` com erro intermitente "H.includes"; `"defer"` em Bash ⇒ "[Tool result missing due to internal error]".
- Relevância: nosso rotation hook roda 2× por ferramenta em Windows ⇒ B1 (medir latência) ganha prioridade.
