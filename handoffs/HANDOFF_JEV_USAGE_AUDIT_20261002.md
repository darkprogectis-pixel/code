# HANDOFF — AUDITORIA FORENSE DE USO DO JEV (2026-10-02) — EM ANDAMENTO (sessão 5744bf01, SOFT_STOP 235k)

Ordem do operador: auditoria SOMENTE LEITURA para reconstruir Spend / Tokens / Requests do painel (nota "*Estimated at $0.042/MTok input · Free output"), horas, ciclos, sessões. Não usar a imagem. Nenhum JEV chamado nesta auditoria.

## AUDIT_CUTOFF
2026-10-02T21:06:43Z (18:06:43 -0300). post_cutoff_records = 0 em todos os logs (lido ~21:08Z).

## Fontes encontradas (somente leitura)
- Cliente: `C:\Users\ADM\.claude\alfaomega-context\scripts\lib.js` (193 linhas). `jevAsk` = POST `https://api.typesafe.ai/v1/systemone`; grava 1 registro por chamada em `logs\jev-routing.ndjson` (ts, session_id, purpose, http, model, input_tokens, output_tokens, latency_ms, request_id = header `x-typesafe-request-id`). **Retries (429/5xx até 4 tentativas, exceção de rede até 3) ficam DENTRO de um único registro — só a tentativa final é logada** ⇒ requests de retry NÃO são recuperáveis do log local. `GET /models` (resolveModel) logado em `logs\jev-models.ndjson` (sem tokens).
- Logs `C:\Users\ADM\.claude\alfaomega-context\logs\` (sha256[:12] / linhas): jev-routing da7b0a0b846a / 1307 · jev-decisions 6649b398b2b9 / 1768 · jev-models 881bfbea432b / 90 · jev-coverage-tests d9d52b81eb2f / 10 · jev-activity c5a153bd0861 / 1144 (sem tokens) · rotation-events f9eb8befb3b8 / 159 · jev-session-start 8124cc594218 / 84.
- Script/resultado: scratchpad 5744bf01 `usage_audit.js` → `usage_audit.json`.

## Números parciais (até o cutoff)
- jev-routing: 1300 registros · 1298 request_id únicos · http 200 ×1299, 400 ×1 · input 5.529.328 · output 811.332 · 1º 2026-09-22T03:57:34.251Z · último 2026-10-02T20:06:21.917Z · 103 session_ids · modelos `jev-1.13.0` e `x` (**`x` = provável TEST_BASE/mock — NÃO separado ainda**).
- jev-decisions: 1552 registros, 550 request_id únicos, TODOS também em jev-routing (overlap 550) ⇒ não somar. jev-coverage-tests: 10 ids (3 também em routing), 422 ×1. jev-models: 90 GET sem tokens.
- União de request_id (routing+decisions+coverage+models) = 1395 · input 5.529.326 · output 811.330 · input × $0.042/MTok = **$0.23223169** (PROVISÓRIO: inclui registros modelo `x` e GET /models).
- Classes por purpose (regex, PROVISÓRIO): other 1202 · FINAL 55 · DIFF/plan 42 · RECHECK 1.

## Pendente (próxima sessão — exato próximo passo)
1. Rodar (saída limitada) a separação: registros `model==='x'` / sem model / http≠200 × produção `jev-1.13.0` http 200; contar ids únicos e somar input/output só de produção ⇒ Spend = input_prod × 0.042/1e6 (output grátis pela nota).
2. Procurar a definição do painel (fonte provider-side): `grep -ril "0.042\|MTok\|usage" C:\Users\ADM\.claude\alfaomega-context\{scripts,config}` e docs TypeSafe (`openapi.json`), e endpoint de usage com credencial já existente. Sem fonte provider ⇒ Requests/Tokens/Spend do painel = NOT_EXACTLY_RECOVERABLE (retries invisíveis localmente; timezone/período do painel desconhecidos), reportar números locais como PARTIALLY_EXACT.
3. Tempo/sessões: primeiro/último evento (routing), sessões = session_ids distintos, rotações = `rotation-events.ndjson` + `handoffs/rotation/ROTATION_*.md`; tempo ativo só se houver eventos contíguos (senão NOT_EXACTLY_RECOVERABLE).
4. Entregar o relatório no formato pedido pelo operador. Nada foi alterado em logs/código; único arquivo novo = este handoff.

## CONCLUSÃO (sessão 1131cf45, rotação #12) — relatório entregue
Hashes dos logs inalterados desde o cutoff (routing da7b0a0b846a, decisions 6649b398b2b9, models 881bfbea432b, coverage d9d52b81eb2f, rotation f9eb8befb3b8) ⇒ 0 registros pós-cutoff.
- Produção (model jev-1.13.0, http 200): 1297 registros = 1297 request_id únicos (0 duplicados) · input 5.529.326 · output 811.330 · total 6.340.656 · Spend = input×0.042/1e6 = $0.23223169 · 22/09 03:57:34Z → 02/10 20:06:21Z.
- Não-produção em jev-routing: 1× HTTP 400 (provider, req id, 0 tokens) · 7× HTTP 503 + 2× model `x` (session failclosed-test, request_id null ⇒ mock/TEST_BASE, excluídos).
- Coverage-tests: 3 POST já em routing, 1 POST 422 (provider, fora de routing), 6 GET /models variantes. jev-models: 90 GET /v1/models.
- HTTP com request_id visíveis ao provider: POST 1299 (1297+400+422) · GET 96 · total 1395. Retries internos de lib.js: NOT_EXACTLY_RECOVERABLE.
- Painel: OpenAPI público (api.typesafe.ai/openapi.json v0.2.0) só tem /v1/systemone e /v1/models — nenhum endpoint de usage/billing; nenhuma definição local de "Tokens/Requests/Spend" do painel ⇒ valores do painel NOT_EXACTLY_RECOVERABLE (candidatos locais acima).
- Classes (purpose, soma 1297): context-route 687 (54 lotes) · gate decision:* 550 · ad-hoc DIFF 12 · ad-hoc FINAL 7 · RECHECK 2 · ad-hoc outros 33 · testes 6 (soma com "final" no nome = 54, inclui projeto "final-enforcement-closure").
- jev-decisions: 1768 decisões (OK 1552, OVERRIDE 188, MARK 14, JEV_REQUIRED_BUT_UNAVAILABLE 14).
- Tempo: wall-clock 256h 8m 48s; ativo NOT_EXACTLY_RECOVERABLE (heurística gap≤15min = 19h39m25s, só indicativa); hoje 43 requests 03:27:26Z→20:06:21Z (16h38m56s).
- Sessões: 103 session_ids em routing (674 registros sem session_id, cliente antigo context-route); rotation-events: ROTATED 75 / ROTATING 77 / FAILED 2 / HARD_STOP 3; 52 ROTATION_*.md neste repo.
- Pendente / não verificado: clientes fora de lib.js (ex. `C:\Users\ADM\typesafe-dolphin-lab`) — inspeção bloqueada pelo classificador (credenciais); se chamarem a API direto, o painel terá mais que o log local.
