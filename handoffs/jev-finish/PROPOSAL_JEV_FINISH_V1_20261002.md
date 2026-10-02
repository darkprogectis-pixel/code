# PROPOSTA DE DIFF — `/jev-finish` V1 (2026-10-02, sessão 9bc26171) — NÃO APLICADA ATÉ JEV DIFF = A

## 0. Arquitetura real confirmada (Fase 1/2)

- Config isolado: `CLAUDE_CONFIG_DIR=C:\Users\ADM\.claude-darkprogectis`. O `settings.json` dele tem só os 5 hooks do Rotation Controller V3, todos com `hook.mjs # jev-rotation-controller-v2`: SessionStart, UserPromptSubmit, PreToolUse `*`, PostToolUse `*`, Stop.
  - Os gates `jev-stop-gate/jev-edit-gate/...` de `~/.claude/alfaomega-context` estão só no config default `~/.claude`. NÃO rodam neste config.
  - Não há skill/plugin de projeto (`.claude/` do repo = só `settings.local.json`, com permissões do operador).
- Rotation V3:
  - Thresholds 200k/220k/235k/240k/250k.
  - No Stop, bloqueia "handoff mandatory" (≥ WARNING com handoff velho).
  - Rotaciona em SOFT_STOP (Stop/prompt) e em HARD (qualquer evento).
  - Lock O_EXCL `jev-rotation/rotation/<sid>.lock` dá o exactly-once.
  - A sucessora recebe estado `state/<succ>.json` com `predecessor{from,depth,root,brief}`; a predecessora fica ROTATED_READ_ONLY.
  - O watchdog abre substituta (SUPERSEDED) se a sucessora não sobe em 90 s.
- JEV: `~/.claude/alfaomega-context/scripts/lib.js` → `sanitize` + `jevAsk({state, questions, purpose})` (POST /v1/systemone, TYPESAFE_API_KEY, log `jev-routing.ndjson`). Padrão de pergunta: choice A..H (A = SAFE_TO_APPLY).
- Ralph Loop oficial (`claude-plugins-official/ralph-loop`, só referência, NÃO instalado):
  - Stop hook lê `.claude/ralph-loop.local.md` (frontmatter iteration/max_iterations/completion_promise/session_id).
  - Sem `<promise>` igual ⇒ `{"decision":"block","reason":<prompt original>}` e iteration++. Max atingido ⇒ apaga o estado e libera.
  - Conflitos com o JEV se instalado cru:
    - (R1) `session_id` fixo ⇒ a sucessora da rotação NÃO continua (o loop morre na rotação);
    - (R2) bloqueia o Stop mesmo em SOFT_STOP/HARD ⇒ briga com a rotação (a predecessora continuaria trabalhando contra o READ_ONLY);
    - (R3) completion = texto `<promise>` autodeclarado ⇒ FAIL pode virar COMPLETE (mascaramento);
    - (R4) sem gate de JEV antes de Edit;
    - (R5) estado no cwd sem mutex ⇒ duas sessões no mesmo repo competem;
    - (R6) sem handoff obrigatório antes de encerrar.
  - Aproveitado: Stop hook + estado persistente + max_iterations + reinjeção do objetivo.

## A. Comando

`/jev-finish "<objetivo>"` = skill de projeto `.claude/skills/jev-finish/SKILL.md` (`disable-model-invocation: true`, `argument-hint: "<objetivo>"`). O SKILL instrui:

1. `node tools/jev-finish/finish.mjs start --objective "$ARGUMENTS"`, que carrega o handoff canônico e cria/adota o loop;
2. seguir a máquina de estados registrando cada passo no CLI;
3. terminar só com `finish.mjs complete` ou `finish.mjs block`.

Objetivo vazio ⇒ recusado.

## B. Máquina de estados (persistida; transições validadas pelo CLI)

INIT → LOAD_HANDOFF → JEV_PRECHECK → PLAN → EXECUTE → TEST → (FIX → TEST)* → RECHECK → JEV_FINAL → COMPLETE.

- **Saídas e estágios especiais:**
  - qualquer estágio → BLOCKED;
  - ROTATE_IF_NEEDED é marcado só pelo hook quando cede o Stop à rotação; a sucessora retoma o estágio anterior.
- **EXECUTE** exige `jev.diff.result == 'A'` se o loop vai editar fora da allowlist. Allowlist = `handoffs/**`, scratchpad/tmp, estado do jev-finish.
- **COMPLETE** (`finish.mjs complete`) é recusado salvo se TODOS valem:
  - (1) nenhum teste registrado em FAIL ou pendente (`tests_required` ⊆ PASS);
  - (2) build PASS quando `build` está em `tests_required`;
  - (3) nenhum blocker aberto;
  - (4) handoff canônico com mtime > último evento de trabalho (último teste/arquivo modificado);
  - (5) `jev.final.result == 'A'` quando JEV FINAL é exigido. Exigido = arquivos fora da allowlist modificados e `jev_final` ≠ `forbidden_by_handoff`;
  - (6) `jev.diff == 'A'` quando houve edição fora da allowlist.
- **BLOCKED** (`finish.mjs block --cause <C> --detail "..."`) só com `C ∈ {EXTERNAL_DEPENDENCY, HUMAN_DECISION_MISSING, RUNTIME_DENIED, JEV_REJECTED}` (+ automáticos MAX_ITERATIONS, NO_PROGRESS). Exige handoff atualizado depois do último evento, salvo os automáticos. `JEV_REJECTED` é gravado automaticamente quando o `jev-diff` devolve ≠ A.

## C. Persistência

`$CLAUDE_CONFIG_DIR/jev-finish/` (mesmo padrão do `jev-rotation/`; override de teste `JEV_FINISH_STATE_DIR` só com `JEV_FINISH_TEST=1`):

- `active.json` (`loop_id`).
- `loops/<loop_id>.json`:
  - objective, objective_sha, created_at;
  - handoff {path, sha_at_start};
  - stage, stage_history[];
  - criteria {tests_required[], jev_final};
  - tests{name: {result, cmd, exit, at, tail}}, tests_pending;
  - files_modified[{path, at, allowlisted}];
  - blockers[];
  - owner_session, lineage[{session, at, via}], root;
  - iteration, max_iterations, progress_seq, stall_count;
  - jev {diff: {result, confidence, probabilities, request_id, proposal_path, proposal_sha}, final: {...}};
  - status ACTIVE|COMPLETE|BLOCKED, block_cause.
- `loops/<loop_id>.log.jsonl`: heartbeat/progresso; um registro por iteração com o motivo; claims/yields.
- Gravação atômica (tmp + rename) sob mutex O_EXCL `loops/<id>.mutex` (stale > 10 s ⇒ quebrado). Releitura sempre do disco ⇒ crash/restart recupera o estado.

## D. Integração com o Rotation Controller V3 (sem segunda lógica de rotação)

- jev-finish NUNCA cria lock de rotação, nunca abre janela, nunca mexe em thresholds/config/brief do controller. Só LÊ, pelos exports de `tools/jev-rotation/hook.mjs` e `controller.mjs`: `stateDir`, `lockFile`, `readJson`, `measureTranscript`, `levelFor`, `rank`, `maxLevel`, `loadConfig`.
- Nível efetivo = max(nível medido do transcript, `max_level` sticky do estado da rotação).
- Sucessora — `tryClaim(sid)` em qualquer evento, idempotente:
  - lê `state/<sid>.json.predecessor.from = P`; exige `lock(P).successor == sid` (não superseded);
  - exige `loop.owner_session == P`, ou owner superseded do mesmo P;
  - sob o mutex, owner = sid, lineage += {sid, via: 'rotation'}.
  - No SessionStart injeta `additionalContext` com o objetivo, o estágio, as pendências e a ordem de continuar o MESMO loop. Somado ao brief da rotação, a sucessora segue sozinha.
- Predecessora: lock(sid) existe ⇒ jev-finish inerte (não bloqueia Stop, não grava), coerente com ROTATED_READ_ONLY.
- Usa o handoff/brief/AUTO_ROTATION existentes; nenhum arquivo novo de transferência além do estado do loop.

## E. Hooks e precedência

- Registro em `.claude/settings.json` do PROJETO, só a chave `hooks`, comando `node "<repo>/tools/jev-finish/hook.mjs" # jev-finish-v1`:
  - SessionStart;
  - PreToolUse (matcher `Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell`);
  - PostToolUse (matcher `Write|Edit|MultiEdit|NotebookEdit`);
  - Stop.
- Não toca `permissions`, `defaultMode`, `settings.local.json` nem o `settings.json` do config dir. Os hooks da rotação ficam intactos.
- Precedência no Stop (o hook só bloqueia se TODAS valem, em ordem):
  1. sessão rotacionada/superseded ⇒ inerte;
  2. sem loop ACTIVE ou sid ≠ owner ⇒ inerte;
  3. nível ≥ SOFT_STOP ⇒ NÃO bloqueia: marca ROTATE_IF_NEEDED e deixa a rotação decidir (a rotação continua o único responsável);
  4. iteration ≥ max ⇒ BLOCKED MAX_ITERATIONS, não bloqueia;
  5. `stall_count ≥ stall_limit` (progress_seq parado) ⇒ BLOCKED NO_PROGRESS, não bloqueia;
  6. senão iteration++ e `decision:block` com o prompt de continuação (rotulado "mensagem automática do hook jev-finish, NÃO do operador").
     - Em ≥ WARNING com handoff velho, a razão manda atualizar o handoff ANTES de continuar. Mesma exigência do controller, então os dois blocks combinados geram UMA continuação.
- Sem loop infinito entre Stop hooks: o controller só bloqueia o Stop uma vez por cruzamento (`stop_hook_active`), e a partir de SOFT_STOP o jev-finish cede. O jev-finish é limitado por max_iterations + stall_limit.
- Exatamente uma continuação válida: só o owner bloqueia; o claim é sob mutex; a iteração é incrementada sob mutex.
- PreToolUse (owner, loop ACTIVE): deny de write-tool fora da allowlist enquanto JEV DIFF ≠ A.
  - Deny SEMPRE (qualquer estágio) de escrita em caminhos LIVE proibidos, por config:
    - `C:\Users\ADM\.claude\aot\`
    - `Documents\NinjaTrader 8\`
    - `C:\Users\ADM\Desktop\Handof TTW\HANDOFF\install-package\`
  - Deny de Bash/PowerShell que cite esses caminhos com verbo de escrita.
  - Para isso exige ordem do operador fora do `/jev-finish`.
- PostToolUse: registra o arquivo modificado + heartbeat + progress_seq.

## F/G. Parada e falhas

- COMPLETE/BLOCKED são as únicas saídas do loop.
- Teste: `finish.mjs test --name N -- <cmd>` executa e grava PASS só com exit 0. FAIL ⇒ o Stop continua com "teste N FAIL" na razão (iteração FIX). Build idem.
- Crash ⇒ o estado fica em disco; o resume da mesma sessão ou um novo `/jev-finish` ADOTA o loop ativo, desde que o owner esteja rotacionado ou sem heartbeat > `stale_owner_s`. Owner vivo ⇒ recusa (exactly-once).
- Replay/duplicação: claim e iteração idempotentes; `start` com loop ativo não duplica.
- Nunca COMPLETE com FAIL: o CLI recusa.

## H. Limites

`tools/jev-finish/config.json`: `max_iterations` 40 (por loop; override `--max-iterations`), `stall_limit` 6, `stale_owner_s` 900, `mutex_stale_ms` 10000, allowlist e caminhos proibidos. Heartbeat em cada evento do owner; o log registra o motivo de cada iteração.

## Arquivos

- novos: `.claude/skills/jev-finish/SKILL.md`, `.claude/settings.json` (só hooks), `tools/jev-finish/{config.json,lib.mjs,finish.mjs,hook.mjs,jev-diff.mjs}`, `test/jev-finish/jev-finish.test.mjs` (JF1–JF18), `handoffs/HANDOFF_JEV_FINISH_V1_20261002.md`;
- alterado: `package.json` (+`test/jev-finish` no `npm test`, +`test:jev-finish`).

O Rotation Controller (`tools/jev-rotation/*`) e os thresholds ficam INALTERADOS. Rollback = remover `.claude/settings.json` (ou só a chave hooks), `.claude/skills/jev-finish`, `tools/jev-finish`, `test/jev-finish` e reverter o `package.json`.

## Testes

JF1–JF18 conforme a ordem do operador, todos pelo processo REAL do hook/CLI com diretórios temporários; rotação simulada pelo hook real da rotação em dry-run. Mais `npm run test:rotation`, `npm test`, `install-hooks --verify` e o teste real controlado (`claude -p` + `/jev-finish` com tarefa só no scratchpad; continuação entre sessões via `rotation:force`, mecanismo documentado, sem mudar thresholds).
