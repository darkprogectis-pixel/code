# ORDEM DO OPERADOR — "CONTINUE A MISSÃO INVICTUS IMEDIATAMENTE" (resolver JEV FINAL = B) — 2026-10-05

Recebida pela sessão 4d206ccd (rotação #6) com contexto 225k ⇒ NÃO INICIADA; a sucessora executa. Texto do operador (colado), preservado por seção.

OBJETIVO: resolver o bloqueio JEV FINAL = B (MORE_TESTS_REQUIRED) e concluir o robô 100%.
NÃO DEPLOYAR enquanto JEV FINAL não aprovar. NÃO reverter staging. NÃO repetir cegamente os mesmos testes. NÃO pedir autorização intermediária ao operador.

ESTADO ATUAL (do operador): JEV_DIFF = A (0.90) · staging 10 problemas corrigidos / 10 arquivos / build 0 erros · press 95+54+85 · account 30+42 · entrada real 39/39 · regressão PASS · JEV FINAL #1 B `req_01a10d835247750bb1dcfae298265d7f` · #2 B `req_01a10d8b9c917701b8d04dd5a23717a4` · DEPLOY = NO · LIVE = INTOCADO.

## 1. AUDITAR AS DUAS DECISÕES JEV FINAL
Ler integralmente os registros/evidências das duas decisões. Extrair: FINAL1_MISSING_EVIDENCE, FINAL2_MISSING_EVIDENCE, COMMON_MISSING_EVIDENCE, WHY_B_NOT_A, WHICH_TEST_OR_PROOF_IS_REQUIRED. Não inferir se o ledger/response trouxer motivo explícito. Comparar também probabilidades e qualquer rationale disponível.

## 2. NÃO RERODAR TUDO
Usar os testes já aprovados como evidência existente. Adicionar SOMENTE os testes/provas necessários para fechar os gaps do JEV. Prioridade provável a verificar, sem assumir: A fill de saída real no harness · B restart reconciliation · C troca dinâmica de conta sem restart · D hooks sem duplicação · E account unavailable · F account mismatch · G COPY isolation · H PnL por conta · I P1S com API real do NT8 / adapter seam · J restart mid-session · K six-leg routing · L fail-closed antes do submit. Usar o JEV como autoridade: testar somente o que estiver faltando.

## 3. ELEVAR AS PROVAS ESTRUTURAIS PARA EXECUÇÃO
Onde hoje existir apenas "prova estrutural" e o JEV estiver cobrando execução, criar harness executável isolado. Especial atenção: exit fill · restart recovery · reconciliation · dynamic account switching · hook registration · COPY account isolation · PnL/telemetry account attribution. SEM enviar ordem real/prop. Usar mock / harness / fake account / Sim controlada / dry-run.

## 4. ACCOUNT BINDING — PROVA FINAL
Provar por execução: ACCOUNT A selected → ativos.json → EventoAot → Robo → position_guard → ExecutarEntrada → adapter → submit target = ACCOUNT A. E: ACCOUNT B possui posição → ACCOUNT A continua elegível. Testar pelo menos Sim101 → firm-like account e firm-like account → Sim101, e os seis: ES NQ MES MNQ NES NNQ. Confirmar RUNTIME_SIM101_FALLBACK = 0.

## 5. TROCA DE CONTA EM RUNTIME
Provar: 1 robô inicia com conta A; 2 hooks registrados uma vez; 3 conta muda para B via configuração canônica; 4 B passa a ser acompanhada; 5 A não continua controlando a nova entrada; 6 handlers não duplicam; 7 nenhuma ordem enviada durante o teste. Resultado: ACCOUNT_CHANGE_WITHOUT_RESTART = PASS · DUPLICATE_HANDLERS = 0.

## 6. RECONCILIATION / FILLS
Transformar em teste executável se ainda não existir: REC01 entrada account A · REC02 fill entrada account A · REC03 fill saída account A · REC04 estado volta FLAT · REC05 fill account B não altera A · REC06 restart reconstrói somente account+instrument correto · REC07 untagged B não bloqueia A · REC08 exec_desvio B não contamina A.

## 7. P1S — PROVA FINAL
Cobrir por execução: startup pré-sessão · pós-virada · RTH · restart RTH · historical reconstruction · insufficient history · WARMUP · VALID · UNAVAILABLE · zero genuíno quando VALID · leak eliminado · minForce 0.03 inalterado · fórmula inalterada. Se a API NT8 específica não puder ser executada offline: criar seam/harness fiel e registrar exatamente o limite. Não afirmar prova live que não existe.

## 8. TESTE DE INTEGRAÇÃO END-TO-END
Prova final sem ordem financeira real: valid signal fixture → gate PASS → OPEN → selected account → position_guard selected account → execution adapter → intercepted submit. Assert EXPECTED_ACCOUNT == ACTUAL_TARGET_ACCOUNT. Testar também wrong/missing account → ACCOUNT_NOT_AVAILABLE → zero submit.

## 9. RODAR REGRESSÃO
Depois dos testes adicionais: suítes account, position, reconciliation, P1S, execution, Control Center, event stream, copy, PnL/telemetry, build completo. NEW_FAILURES = 0.

## 10. JEV FINAL NOVAMENTE
Somente após fechar exatamente as lacunas identificadas: novo JEV FINAL. = APPROVED/A → CONTINUE AUTOMATICAMENTE. Ainda = B: não rerodar cegamente; ler a nova razão e fechar o gap novo. C/D/E/F/G: parar somente por bloqueio real e retornar evidência.

## 11. DEPLOY APÓS APROVAÇÃO
1 backup live · 2 hashes before · 3 pacote canônico · 4 deploy dos arquivos aprovados · 5 hashes after · 6 rollback pronto. Sem alterações manuais isoladas.

## 12. PARADA FÍSICA DO OPERADOR
Somente se o deploy exigir F5/reload ou seleção manual da conta: PARAR e retornar EXATAMENTE: AÇÃO_DO_OPERADOR = 1. F5/reload necessário ou não · 2. selecionar em ATIVOS a conta desejada "001" · 3. manter PLAY. Não pedir qualquer outra ação.

## 13. APÓS O OPERADOR
Continuar automaticamente com validação live READ-ONLY: CONTROL_CENTER_ACCOUNT, ATIVOS_JSON_ACCOUNT, ROBOT_ACCOUNT, POSITION_GUARD_ACCOUNT, EXECUTION_ACCOUNT, HOOK_ACCOUNT, PNL_ACCOUNT, PRESS_STATE, PRESS_VALUE, GATE_STATE, PLAY_STATE, EXECUTION_READY. Não gerar ordem real como teste.

## 14. CRITÉRIO FINAL
Só COMPLETE quando: JEV_FINAL = APPROVED · DEPLOY = PASS · SIM101_RUNTIME_FALLBACK = 0 · ACCOUNT_BINDING_END_TO_END = PASS · ACCOUNT_CHANGE_WITHOUT_RESTART = PASS · OTHER_ACCOUNT_POSITION_BLOCK = NO · HOOKS_DYNAMIC = PASS · DUPLICATE_HANDLERS = 0 · POSITION_GUARD_ACCOUNT_SCOPE = PASS · RECONCILIATION_ACCOUNT_SCOPE = PASS · COPY_ACCOUNT_SCOPE = PASS · PNL_ACCOUNT_SCOPE = PASS · P1S_MID_SESSION_STARTUP = PASS · P1S_RESTART = PASS · P1S_LEAK = FIXED · PRESS_STATE_MODEL = PASS · SIX_LEGS = PASS · LIVE_VALIDATION = PASS · READY_FOR_NEXT_REAL_SIGNAL = YES.

## 15. HANDOFF
Atualizar `handoffs/HANDOFF_INVICTUS_NO_TRADES_20261005.md` com: motivo dos dois B anteriores, testes adicionais, novo JEV FINAL, deploy, hashes, rollback, validação live, estado final.

## 16. RETORNO
Não retornar parcial salvo novo bloqueio JEV real ou ação física obrigatória do operador. Terminar obrigatoriamente com o bloco:

```text
PARA COLAR NO CHATGPT

STATUS =
JEV_B_ROOT_CAUSE =
TESTES_ADICIONAIS =
ACCOUNT_BINDING =
ACCOUNT_CHANGE_RUNTIME =
HOOKS =
POSITION_GUARD =
RECONCILIATION =
COPY_ENGINE =
PNL_TELEMETRIA =
P1S =
JEV_FINAL =
DEPLOY =
LIVE_VALIDATION =
READY_FOR_NEXT_REAL_SIGNAL =
COMMITS =
PUSH =
HANDOFF =
ESTADO_ATUAL =
PROXIMO_PASSO_EXATO =
```
