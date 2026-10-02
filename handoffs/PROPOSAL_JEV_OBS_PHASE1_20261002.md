# PROPOSTA — JEV / CLAUDE OBSERVABILITY CONTROL PLANE — PHASE 1 (somente observacional)

Ordem do operador: 2026-10-02 (sessão 4ac35a75). Base: `HANDOFF_JEV_USAGE_AUDIT_20261002.md`, `HANDOFF_JEV_POTENTIAL_AUDIT_20261002.md` (commit ce6c0fe), assets `JEV_POTENTIAL_AUDIT_20261002_*.json`, `JEV_WEB_BENCHMARK_NOTES_20261002.md`.

## 0. Garantias (invariantes testados)
- Nenhuma mudança no comportamento decisório: JEV runtime (`src/jev/**`), gates, thresholds, trading/NT8, model, settings*.json, permissões, Agent Teams, subagentes, worktrees, async hooks — INTOCADOS.
- Fontes de verdade só são LIDAS (abertas read-only). Nenhum log histórico é modificado. Agregação derivada fica separada em `<CLAUDE_CONFIG_DIR>/jev-obs/`.
- Servidor HTTP bind exclusivo `127.0.0.1:3593` (porta livre; 3590–3592 já usadas pelo IJC). Nenhuma telemetria externa. Nenhum pacote npm novo (Node 22 stdlib + HTML/CSS/JS/SVG sem CDN).
- Nenhuma chamada ao JEV pelo painel; o painel funciona com JEV/provider offline e com qualquer arquivo ausente (status MISSING por fonte).
- Saída da API passa por redator: nunca expõe prompts, `state`, `questions` texto, API keys, headers, env; só métricas, ids e `purpose`.
- Context tokens (Claude, de `message.usage` dos transcripts) e provider tokens (JEV, `input_tokens/output_tokens` do jev-routing) ficam em namespaces separados (`claude.*` × `jev.*`).

## 1. Arquivos novos (todos dentro do repo existente)
- `tools/jev-obs/sources.mjs` — resolução de caminhos (env `JEV_OBS_*` para testes), leitura tolerante de NDJSON/JSONL (linhas corrompidas contadas, não fatais), status por fonte {path, exists, bytes, lines, bad_lines, sha12, mtime}.
- `tools/jev-obs/aggregate.mjs` — funções puras:
  - JEV usage: dedupe por `request_id` (null ⇒ chave ts+purpose); produção = `model` jev-* e http 200; `model==='x'`/`request_id null` = TEST (separado); spend = input×0.042/1e6 (output grátis, preço do `/models`); por dia/hora/sessão/model/http; tokens/request; custo/request; erros.
  - Request types por `purpose`: router (`context-route*`), decide (`decision:*`), DIFF, FINAL, RECHECK, audit (`audit*`), test, other.
  - Probabilidades: de `jev-decisions.answers` (Choice/Score/Noul), loops jev-finish (`jev.diff/final`), `JEV_POTENTIAL_AUDIT_*_results.json` e do ledger shadow: winner, pmax, confidence, top1, top2, margin, top1/top2, distribuição; Noul `|2p−1|`; Score média/confidence.
  - Qualidade: retries = `NOT_RECORDED_BY_CLIENT` (lib.js loga só a tentativa final — mostrado explicitamente, não inventado); http≠200; JEV_REQUIRED_BUT_UNAVAILABLE; confidence < 0.5; margin ≤ 0.1; quase-empate margin ≤ 0.05. pass2 = contagem de `features.pass2` quando presente, senão UNKNOWN.
  - Decision lifecycle: request_id, decision_id, purpose, ts, probabilities, confidence, ação (status/gate_open), outcome/label ⇒ estados OUTCOME_UNKNOWN / OUTCOME_CAPTURED / LABEL_PENDING / LABELED a partir de `jev-obs/outcomes.ndjson` (vazio nesta fase; nada é auto-rotulado). Calibration coverage % = labeled/total. Gráficos bucket×accuracy mostram "SEM LABELS" (não inventa accuracy).
  - Claude: por transcript principal + sidechains: usage por resposta (dedupe por `message.id`), input/output/cache_read/cache_creation, model por mensagem/sessão, contexto por turno (input+cache_read+cache_creation), crescimento/hora e /ação, duração, tool calls por ferramenta, chars de tool_result (média, p50, p95, top 20, >20k), Bash classificado como leitura (cat/sed/head/tail/grep/rg/type/Get-Content), anexos (prompt_snapshot, total_tokens_reminder, skill_listing, deferred_tools, hook_additional_context, instructions/CLAUDE.md) em chars, fontes repetidas (mesmo path lido N vezes).
  - Hooks: (a) passivo: `system/stop_hook_summary.hookInfos[].durationMs`, `hook_blocking_error`, `hook_additional_context`, `hook_system_message` dos transcripts; (b) ativo: `jev-obs/hook-metrics.ndjson` do probe (§2). p50/p95/p99, wall total, falhas, timeouts (duração ≥ timeout 15 s ou erro), bloqueios, chars injetados.
  - Rotation/session: `jev-rotation/lineage.jsonl` + `events.jsonl` (níveis PREPARE/WARNING/SOFT_STOP/HARD_ROTATION por sessão, tokens na rotação), `handoffs/rotation/ROTATION_*.md` (tamanho do brief), legado `alfaomega-context/logs/rotation-events.ndjson`.
  - Agents/workflows: tool_use `Agent`/`Task`/`Workflow` e transcripts `subagents/`/sidechain ⇒ hoje ZERO explícito com todos os campos (spawned, parent, type, model, duração, tokens, tool calls, result chars, status, concurrency, custo).
  - Anomalias determinísticas INFO/WATCH/WARNING (nunca bloqueiam): contexto crescendo rápido, tool output > 20k, leitura repetida, hook p95 alto / timeout, http≠200 alto, baixa confidence, margem baixa, concentração de modelo > 95 %, 0 labels, request JEV sem request_id/tokens, rotação muito frequente (< 30 min).
- `tools/jev-obs/cache.mjs` — memo por (path, size, mtime) e parse incremental de transcripts; snapshot derivado em `<CLAUDE_CONFIG_DIR>/jev-obs/derived/summary.json`.
- `tools/jev-obs/server.mjs` — node:http, `listen(3593, '127.0.0.1')`; rejeita Host ≠ 127.0.0.1/localhost; GET only; endpoints `/api/health`, `/api/summary?range=today|7d|30d|all&session=&purpose=&model=&type=`, `/api/sources`, `/` estático. Redator aplicado a toda resposta.
- `tools/jev-obs/public/{index.html,app.js,style.css}` — tabs OVERVIEW, JEV, CLAUDE, CONTEXT, HOOKS, SESSIONS, DECISIONS, CALIBRATION, MODELS, AGENTS, WORKFLOWS, COST, ANOMALIES; cards e gráficos SVG (tokens/time, spend/time, requests/time, context/time, rotations/time, confidence dist., margin, request types, tool contribution, model usage, hook latency); filtros.
- `tools/jev-obs/hook-probe.mjs` — probe de medição (§2).
- `tools/jev-obs/shadow-ledger.mjs` — Q2/Q3 SHADOW: importa (idempotente, por request_id) as consultas JEV DIFF/FINAL dos loops jev-finish e dos results JSON para `jev-obs/jev-shadow-ledger.ndjson` com spec_sha, request_id, probabilities, confidence, pmax/top2/margin/ratio/Noul derivado. Não altera `jev-diff.mjs` nem nenhuma decisão.
- `tools/jev-obs/baseline.mjs` — grava BASELINE (números do handoff) e RECONCILE (recalculado das fontes, mesma janela) em `handoffs/assets/JEV_OBS_PHASE1_{baseline,reconcile}_20261002.json`.
- `tools/jev-obs/bench-hooks.mjs` — mede overhead do probe: roda cada hook N=30× com payload fixture em state dir temporário (`JEV_ROTATION_STATE_DIR`/`JEV_FINISH_STATE_DIR` + modo teste), com e sem probe (`JEV_OBS_PROBE=0`), compara stdout+exit (devem ser idênticos) e latência.
- `tools/jev-obs/README.md` — como iniciar/parar.
- `test/jev-obs/*.test.mjs` — testes (§4). Executados por `node --test "test/jev-obs/*.test.mjs"` (package.json, que já tem pendência pré-existente do operador, NÃO é alterado nesta fase).

## 2. Única alteração em arquivo existente: probe de medição nos 2 hooks
Inserir no início do corpo de `tools/jev-rotation/hook.mjs` e `tools/jev-finish/hook.mjs` (após os imports):
```js
try { await import('../jev-obs/hook-probe.mjs'); } catch { /* observability only — never affects the hook */ }
```
- Import dinâmico em try/catch: arquivo ausente/erro ⇒ hook segue idêntico.
- O probe só: (1) envolve `process.stdout.write` em passthrough que conta chars e inspeciona (sem alterar) o JSON emitido para detectar `decision: block`, `permissionDecision: deny`, `continue:false`, `additionalContext`/`systemMessage` (chars injetados); (2) em `process.on('exit', code)` faz 1 `appendFileSync` em try/catch de {at, hook, event, tool, session prefix 8, duration_ms = performance.now() (desde o início do processo node), exit_code, blocked, injected_chars, stdout_chars, error}. Nenhum conteúdo de prompt/stdin é gravado.
- `JEV_OBS_PROBE=0` desliga. Não muda exit code, stdout, stderr, ordem ou timing de decisão (prova: bench com stdout+exit idênticos e suites existentes `test:rotation` e `test:jev-finish` PASS).
- Settings/config/commands dos hooks: INALTERADOS (installer `--verify` continua válido).
- Nota: `tools/jev-rotation/hook.mjs` já tem modificações pré-existentes não commitadas do operador; a inserção é 1 linha isolada, registrada no handoff para commit separado.

## 3. Baseline (antes) — a reproduzir no painel
0 subagentes · 6030/6030 respostas Opus · Bash-read 71,3 % e Read 14,3 % do retorno ao contexto · 29 resultados > 20k chars · cache_read ≈ 841,7M · output ≈ 7,26M (41 transcripts 01/10 00:07Z → 02/10 21:56Z, config isolada) · 0 outcome→label (25 rótulos só do router) · densidade JEV 0,05–0,09 · DIFF/FINAL 1,11 pergunta/req (54/57 com 1) · JEV produção 1297 req, input 5.529.326, output 811.330, spend US$ 0,23223169 (até 2026-10-02T21:06:43Z).
Reconciliação: contagens das mesmas fontes na mesma janela = EXATAS (diferença 0); percentuais com 1 casa = iguais; onde a fonte cresceu depois do cutoff, comparar com janela cortada no cutoff.

## 4. Testes
parser NDJSON (linhas boas/corrompidas/parciais/vazias), dedupe por request_id, separação TEST × produção, retries NOT_RECORDED, spend, request types, confidence/probabilities/margin/ratio/Noul, filtros today/7d/30d/all/session/purpose/model/type, sessões e rotações (lineage+events), hooks (stop_hook_summary + probe), probe decision-neutral (stdout/exit idênticos), fonte ausente ⇒ painel OK, API GET /api/summary e /api/health, bind apenas 127.0.0.1 (address() e Host check), nenhuma secret (fixture com chave falsa e prompt ⇒ ausentes da resposta), agents/workflows = 0 explícito, calibration sem labels ⇒ sem accuracy. Mais as suítes existentes `npm run test:rotation` e `npm run test:jev-finish` (regressão dos hooks).

## 5. Riscos e rollback
- Risco principal: hook quebrar ⇒ mitigado por import dinâmico try/catch + suítes + bench; rollback = remover 1 linha em cada hook ou `JEV_OBS_PROBE=0`.
- Overhead esperado do probe < 5 ms por execução (medido e reportado; se > 10 ms p95, probe fica desligado por padrão e isso é registrado).
- Painel: processo separado, sob demanda (`node tools/jev-obs/server.mjs`), parado com Ctrl+C; não é serviço instalado.

## 6. Fora do escopo (não fazer)
Agent Teams, worktrees, subagentes, model routing, pass2 comportamental, confidence gates, leitura via JEV, async hooks, thresholds, auto-label, auto-calibração, alterações em src/jev, src/ijc, nt8, settings, package.json, produção.
