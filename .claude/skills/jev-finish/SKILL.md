---
name: jev-finish
description: Loop autônomo governado do projeto JEV — uma única ordem do operador leva a etapa até COMPLETE verificado ou BLOCKED real, com JEV obrigatório, handoff canônico e Rotation Controller V3 (a sucessora continua o mesmo objetivo sozinha).
argument-hint: "\"<objetivo>\""
disable-model-invocation: true
---

# /jev-finish — loop governado até COMPLETE ou BLOCKED real

Objetivo do operador (verbatim): $ARGUMENTS

Esta é UMA ordem completa do operador. Não peça confirmações intermediárias quando o handoff, a KB ou o JEV já resolvem a decisão. O hook `tools/jev-finish/hook.mjs` reinjeta o objetivo a cada fim de turno até `complete` ou `block`. Rotação, sucessora e READ_ONLY são do Rotation Controller V3, não deste loop.

CLI: `node tools/jev-finish/finish.mjs <cmd>` (rode da raiz do repo; a saída é JSON).

## 1. INIT / LOAD_HANDOFF
1. `node tools/jev-finish/finish.mjs start --objective "<objetivo verbatim>"`.
   - Opcional: `--require-test <nome>` (repetível), `--max-iterations N`, `--handoff <md>`, `--jev-final forbidden_by_handoff`. Use este último só quando o handoff proibir JEV FINAL nesta etapa.
   - Se a resposta for `ALREADY_ACTIVE` ou `ADOPTED`, é o MESMO loop: continue do `stage` informado, sem reiniciar.
2. Leia (com leituras limitadas) o handoff indicado em `handoff`, o `CLAUDE.md` e, se esta sessão for sucessora, o brief de rotação.
   - Tire dali: o estado, o próximo passo exato, o que exige ordem do operador e os testes canônicos da etapa.
   - Registre cada teste canônico com `require-test --name <nome>`.

## 2. JEV_PRECHECK / PLAN
- Regra permanente do projeto: handoff primeiro, matriz antes × agora, JEV DIFF antes de qualquer edição real.
- Edição em `handoffs/**`, no scratchpad ou no estado do jev-finish não exige JEV. Qualquer outra edição exige.
- Antes de editar código ou config:
  1. escreva a PROPOSTA DE DIFF completa em `handoffs/**` ou no scratchpad;
  2. rode `node tools/jev-finish/jev-diff.mjs --kind diff --proposal <arquivo>` UMA vez (não repita se já houver JEV registrado para a mesma proposta).
- Se o handoff já registra um JEV A para exatamente este plano, adote com `finish.mjs jev-adopt --kind diff --request-id <req_…> --result A`. O CLI só aceita se o id estiver escrito no handoff.
- JEV ≠ A ⇒ o loop vira BLOCKED (JEV_REJECTED) sozinho: PARE, não edite nada.
- Avance com `finish.mjs stage PLAN`, depois `finish.mjs stage EXECUTE`. EXECUTE é recusado sem JEV A.

## 3. EXECUTE / TEST / FIX / RECHECK
- Implemente só o que a proposta aprovada e o handoff autorizam. Registre os estágios com `finish.mjs stage <ESTÁGIO> --note "..."`.
- Rode TODO teste/build pelo CLI, para o resultado ser registrado de verdade:
  - `finish.mjs test --name <nome> --shell powershell|bash|cmd --cmd "<comando>"`;
  - PASS só com exit 0.
- FAIL ⇒ `stage FIX` ⇒ diagnostique, corrija, `stage TEST` e rerode. Nunca marque PASS à mão, nunca pule teste.
- Blocker da etapa: `finish.mjs blocker add --text "..."`; ao resolver, `blocker resolve --index i`.
- Atualize o handoff canônico de forma incremental: estado, arquivos, SHAs, testes, próximo passo exato.
  - A sessão pode ser rotacionada a qualquer momento pelo controller;
  - a sucessora continua deste loop automaticamente.

## 4. RECHECK / JEV_FINAL / COMPLETE (V1.1 — o CLI prova a conclusão, o agente não a declara)
1. Com tudo PASS, rode `finish.mjs recheck`. O CLI re-executa TODOS os testes registrados e grava o resultado e um snapshot do repo.
   - `stage RECHECK` é recusado.
   - FAIL ⇒ o estágio vira FIX: corrija, rode `test` de novo e depois `recheck` de novo.
2. Se houve edição real, faça `stage JEV_FINAL`. Escreva o resultado com as evidências (objetivo, arquivos, testes, SHAs, riscos) e rode `jev-diff.mjs --kind final --proposal <arquivo>`, salvo `--jev-final forbidden_by_handoff`.
3. Atualize o handoff CANÔNICO do loop com o resultado VERIFICADO do recheck, citando o `loop_id`.
   - Escreva "RECHECK PASS — aguardando complete".
   - NÃO escreva COMPLETE/PASS final antes de o CLI aceitar.
4. `finish.mjs complete --evidence "<resumo verificável>"`, numa chamada PRÓPRIA, nunca encadeada com outro comando. O CLI recusa se:
   - houver teste FAIL ou pendente;
   - houver blocker aberto;
   - faltar JEV A;
   - não houver `recheck` com tudo PASS;
   - tiver havido trabalho (teste, edição, delta do git) depois do recheck;
   - o handoff canônico não tiver sido atualizado depois do recheck, ou não citar o `loop_id`.
   Recusa ⇒ corrija e continue.
5. Só depois do COMPLETE aceito, registre no handoff "COMPLETE" (edição só em `handoffs/**`).

## 5. BLOCKED (somente real)
Atualize o handoff com o bloqueio e o próximo passo, depois rode `finish.mjs block --cause <CAUSA> --detail "<causa precisa, evidência, o que desbloqueia>"`. Causas:
- `EXTERNAL_DEPENDENCY`: dependência externa;
- `HUMAN_DECISION_MISSING`: decisão que a documentação realmente não resolve;
- `RUNTIME_DENIED`: negação de permissão/classifier sem precedente documentado permitido;
- `JEV_REJECTED`.

O hook também bloqueia sozinho por `MAX_ITERATIONS` ou `NO_PROGRESS`.

## Proibido dentro do /jev-finish
- Tocar live/produção, F5, ordens ou install-package fora do que o handoff autoriza. O hook nega escrita nos caminhos live da config.
- Mudar Auto Mode, permissions, policy ou classifier; editar `settings*.json`; mudar thresholds ou o Rotation Controller.
- Contornar qualquer negação (outra ferramenta, outro caminho, pedaços menores). Negação ⇒ `block --cause RUNTIME_DENIED`.
- Ignorar o JEV ou o handoff, pular testes, declarar COMPLETE sem verificação, usar `cancel` (comando só do operador), `/clear` ou `/exit`.
