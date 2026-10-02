# PROPOSTA — /jev-finish V1.1: RECHECK verificado pelo CLI + COMPLETE vinculado ao loop (2026-10-02)

Origem: HANDOFF_JEV_FINISH_V1_20261002.md. O loop jf-20261002070916-ff77a5 terminou BLOCKED/RUNTIME_DENIED. O Auto Mode negou o encerramento como "Auto-Mode Bypass".
Ordem do operador (sessão 0a982750): resolver o bloqueio do Auto Mode no encerramento final do /jev-finish.
- Proibido: contornar o classifier, alterar permissions/policy/Auto Mode ou enfraquecer gates.
- Diff mínimo, para o /jev-finish concluir legitimamente em COMPLETE.

## 1. Auditoria (evidência: transcript 809291e0, linhas 55–109)

Sequência da sessão 809291e0, sucessora da rotação #27:
1. `test successor-resumed` (PASS) e `test artifact-exists` (PASS) foram executados pelo CLI e PERMITIDOS.
2. O agente editou o handoff ANTES do gate. O cabeçalho passou a dizer "TESTE REAL PASS" e a seção "PRÓXIMO PASSO" passou a dizer "/jev-finish está READY_TO_USE" (Edit x3, permitidos).
3. Uma única chamada Bash encadeou duas operações e foi NEGADA ([Auto-Mode Bypass]):
   - `finish.mjs stage RECHECK --note "successor-resumed + artifact-exists + persistence PASS"`
   - `finish.mjs complete --evidence "real test PASS: ...; handoff updated"`
4. `finish.mjs block --cause RUNTIME_DENIED ...` foi PERMITIDO.

Conclusão: o classifier não proíbe encerrar o loop. O `block` passou e os testes passaram. Foi negada apenas a AUTO-CERTIFICAÇÃO de sucesso. Como o código V1 está hoje, o modelo consegue liberar sozinho o Stop hook que o supervisiona, só declarando estados:

- D1 — `stage RECHECK` é uma DECLARAÇÃO. O CLI registra o estágio sem re-executar nada. "RECHECK" significa re-verificar, mas nada foi re-verificado. Isso foi encadeado no mesmo comando com `complete`.
- D2 — `complete --evidence "<texto livre>"`: a evidência é escrita pelo próprio modelo e não é vinculada ao que o CLI mediu.
- D3 — o gate de handoff (`latestHandoffMtime() > lastWork`) aceita QUALQUER `handoffs/*.md` tocado, sem vínculo com o loop. O próprio agente o satisfaz (passo 2 acima, escrito ANTES do gate, já declarando o sucesso).
- D4 — nenhum snapshot liga o que foi testado ao estado em que se declara COMPLETE. Uma mudança feita depois do último teste não invalida nada, exceto via `files_modified`, que não cobre a git delta.

Quem vê a sequência enxerga um agente afrouxando o próprio gate de supervisão por asserção ("Auto-Mode Bypass"). O tratamento correto não é pedir permissão. É eliminar a auto-certificação: o CLI passa a provar a conclusão por conta própria, e o modelo só pede a verificação.

## 2. Diff mínimo proposto (gates só ficam MAIS estritos; nenhum removido)

### tools/jev-finish/finish.mjs
1. Novo comando `recheck` (RECHECK verificado pelo CLI, não declarado):
   - re-executa TODOS os testes registrados em `loop.tests` com o `cmd`/`shell` gravados, mesma função do `test`;
   - exige que todo `tests_required` tenha sido executado ao menos uma vez (senão REFUSED);
   - grava `loop.recheck = { at, at_ms, session, results{name: PASS|FAIL, exit}, all_pass, git: gitChanged() }` e atualiza `loop.tests[...]`;
   - all_pass ⇒ stage RECHECK, exit 0;
   - qualquer FAIL ⇒ stage FIX, exit 1. O loop continua e o hook reinjeta.
2. `stage RECHECK` passa a ser RECUSADO ("RECHECK only via recheck (CLI re-runs the tests)"). Não dá mais para declarar o estágio.
3. `complete` mantém TODAS as verificações atuais e acrescenta três:
   - a) existe `loop.recheck` com `all_pass` (senão "recheck required");
   - b) o recheck está fresco:
     - nenhum `tests[*].at` e nenhum `files_modified` não-handoff depois de `recheck.at_ms`;
     - a git delta atual, filtrada a paths não allowlisted, é igual à de `recheck.git`;
     - senão "recheck stale: work after recheck — run recheck again";
   - c) o handoff CANÔNICO do loop (`loop.handoff.path`, não qualquer handoff):
     - tem mtime > `recheck.at_ms`;
     - contém o `loop_id`;
     - senão "canonical handoff <path> must be updated after recheck and reference <loop_id>".
   - A evidência gravada vira `{ text: --evidence, verified: loop.recheck }`. `--evidence` continua obrigatório.
4. `block`, `test`, `start`, `jev-adopt`, `cancel` e `status`: sem mudança.

### tools/jev-finish/hook.mjs
- Só o texto da continuação muda: "encerre SOMENTE com `recheck` (o CLI re-executa os testes) → atualizar o handoff canônico citando o loop_id → `complete --evidence`".
- Nenhuma mudança de decisão/precedência.

### .claude/skills/jev-finish/SKILL.md
- §4: `finish.mjs recheck` (nunca `stage RECHECK`), seguido de JEV_FINAL quando exigido.
- Depois atualizar o handoff com o resultado VERIFICADO (citando loop_id e o resultado do recheck), em chamada separada.
- `complete` em chamada própria, nunca encadeado com outro comando.
- Proibido escrever COMPLETE/PASS final no handoff antes de o CLI aceitar `complete`. Antes disso, escrever "RECHECK PASS — aguardando complete".

### test/jev-finish/jev-finish.test.mjs
- JF7 e JF14: `stage RECHECK` → `recheck`. O assert de COMPLETE-only-via-complete continua.
- JF8: o handoff tocado precisa citar o loop_id. `touchHandoff(text)` passa a aceitar texto. Antes do complete: recheck.
- Novos X7–X11:
  - X7: `stage RECHECK` é recusado;
  - X8: o recheck re-executa de verdade (o comando muda de resultado ⇒ FAIL ⇒ stage FIX, complete recusado);
  - X9: complete sem recheck é recusado;
  - X10: teste/edição (incluindo shell edit via git delta) depois do recheck ⇒ "recheck stale";
  - X11: handoff não canônico, ou canônico sem o loop_id ⇒ recusado; canônico com loop_id ⇒ COMPLETE.
- O guard JF17 (sem mudança de settings/permissions) segue igual.

## 3. Fora de escopo / invariantes
- Sem mudança em `.claude/settings*.json`, permissions, Auto Mode, policy, classifier, Rotation Controller ou thresholds.
- Sem live, F5, ordens ou NT8.
- O loop antigo jf-20261002070916-ff77a5 continua BLOCKED/RUNTIME_DENIED (histórico). Ele NÃO é reaberto nem completado por outro caminho.
- Estado runtime antigo compatível: os campos novos são opcionais. Um loop sem `recheck` só não consegue `complete` até rodar `recheck`.

## 4. Testes / validação
1. `node --test test/jev-finish/jev-finish.test.mjs`: JF1–JF18 + X1–X11, todos PASS.
2. `npm test` (jev + ijc + rotation + jev-finish): zero regressão.
3. `node tools/jev-rotation/install-hooks.mjs --verify`: PASS.
4. Teste real controlado nesta sessão JEV viva (0a982750), sob o loop /jev-finish desta própria ordem:
   - artefato só no scratchpad;
   - `recheck` pelo CLI;
   - handoff canônico atualizado com o loop_id;
   - `complete` em chamada isolada.
   - Critério: STATUS = COMPLETE aceito pelo runtime.
   - Se o Auto Mode negar de novo: NÃO contornar ⇒ `block --cause RUNTIME_DENIED` + handoff, e devolver ao operador.

## 5. Riscos
- R1: o `recheck` re-executa comandos já gravados pelo próprio CLI (mesmo vetor do `test`, sem novo poder).
- R2: o custo do recheck (npm test leva ~1–2 min) é aceitável.
- R3: o classifier pode continuar negando por outro motivo. Isso é BLOCKED real, documentado, sem workaround.

Rollback: `git checkout` / restaurar as versões V1 de finish.mjs, hook.mjs, SKILL.md e jev-finish.test.mjs (os SHAs V1 estão no handoff).
