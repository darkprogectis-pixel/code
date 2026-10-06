# ORDEM DO OPERADOR — "F5 FEITO — CONTINUE ATÉ FINALIZAR A AUDITORIA UNIVERSAL DE CONTAS" (2026-10-06 ~03:14Z)

Registro condensado e fiel (sessão d5f893a0). Não retornar parcial. Sem PLAY, sem ordens, sem alterar ATIVOS/config/contas.
Trabalhar até: A) UNIVERSAL_ACCOUNT_SUPPORT = COMPLETE, ou B) novo F5 físico obrigatório após segundo deploy.

## PARTE 1 — validar D1+D2 no runtime pós-F5 (FEITO, ver handoff §40)
Itens: RUNTIME_D1_D2_LOADED; ACCOUNT_SELECTION_AUTHORITY=OPERATOR; ACCOUNT_LIST_SOURCE=NT8_DYNAMIC; CASE_INSENSITIVE_ACCOUNT_IDENTITY=0; FIRST_MATCH_ACCOUNT_FALLBACK=0; UNKNOWN_PROVIDER_SUPPORTED=YES; ACCOUNT_TYPE/IS_REAL_MONEY/PROVIDER_EXECUTION_GATE=0; ACCOUNT/PROVIDER WHITELIST/BLACKLIST=0; SIM101/ACCOUNT_001/TAKEPROFIT_SPECIAL_CASE=0; ACCOUNT_NAME_LENGTH_DEPENDENCY=0; SILENT_FALLBACK=0.
6 pernas ES NQ MES MNQ NES NNQ: ATIVOS_ACCOUNT_RAW, ROBOT_ACCOUNT_RAW (iguais sem normalizar caixa), ACCOUNT_AVAILABLE, HOOK_EXEC_READY, HOOK_ORDER_READY, ORDER_NAME_GENERATABLE, ORDER_NAME_LENGTH ≤ 50, BLOCK_REASON (OPERATIONAL_STOP aceitável).
Copilot: COPILOT_BADGE_NULL=NO, COPILOT_HEALTH=HEALTHY, AOT_DOWN=0, AOT_ALERTS=[], ASSEMBLY_SPLIT_LOGICAL=0 (sem diagnóstico grande se saudável).

## PARTE 2 — resíduos CopyEngine / AoBasicEntryBoleta.cs / AoAccountNames.cs
Classificar cada ocorrência: DISPLAY_ONLY, TELEMETRY_ONLY, MANUAL_BOLETA_ONLY, ACCOUNT_IDENTITY, ACCOUNT_RESOLUTION, EXECUTION_ROUTING, COPY_ROUTING, LEDGER/RECONCILIATION, OTHER.
OrdinalIgnoreCase só é permitido se comprovadamente não for identidade/resolução/routing de Account.Name. Se "CASE-DUP-77" puder ser tratada como "Case-Dup-77" em binding, routing, copy, boleta, lookup ou correlação operacional ⇒ DEFEITO ⇒ RAW Ordinal. Não corrigir cosmético/display sem necessidade.
Se houver defeito: proposta mínima ⇒ JEV DIFF ⇒ patch staging ⇒ testes focados ⇒ regressão mínima ⇒ JEV FINAL ⇒ deploy autorizado desta correção residual ⇒ backup/SHA/rollback. Sem retornar entre etapas.
Testes mínimos: R01 contas que diferem só por caixa permanecem distintas; R02 CopyEngine nunca redireciona para variante de caixa; R03 boleta resolve exatamente a Account RAW escolhida; R04 AoAccountNames não colapsa identidades distintas; R05 conta inexistente fail-closed; R06 provider/tipo sem gate; R07 Unicode/CJK; R08 nenhum fallback; R09 nenhuma ordem real. NEW_FAILURES=0.

## Se o segundo deploy exigir F5 — parar SOMENTE aí e retornar
STATUS = RESIDUAL_DEPLOY_DONE / F5_REQUIRED · RESIDUAL_FIX · JEV_DIFF · TESTS · REGRESSION · JEV_FINAL · DEPLOY · FILES_DEPLOYED · LIVE_HASH_MATCH · BACKUP · ROLLBACK · PLAY_STATE = STOP · ORDERS_SENT = 0 · NEXT_EXACT_ACTION = operador dá F5/Compilar NinjaScript e responde "F5 FEITO". Não validar runtime antigo.

## Critério final (após runtime validado)
ANY_CONNECTED_ACCOUNT_SUPPORTED, SIM/PROP_FIRM/REAL_MONEY/UNKNOWN_PROVIDER_SUPPORTED = YES; AUTHORITY=OPERATOR; LIST_SOURCE=NT8_DYNAMIC; ACCOUNT_IDENTITY=RAW_ORDINAL; todos os contadores de gate/whitelist/blacklist/special case/fallback/DUPLICATE_HANDLERS = 0; RESIDUAL_ACCOUNT_IDENTITY_DEFECTS=0; 6/6 LEGS_STRUCTURALLY_READY; COPILOT_BADGE_NULL=NO; AOT_DOWN=0; ASSEMBLY_SPLIT_LOGICAL=0; OPEN_POSITIONS=0; PENDING_ORDERS=0; PLAY_STATE=STOP; ORDERS_SENT=0.

## Handoff — registrar como regra CANÔNICA em handoffs/HANDOFF_INVICTUS_NO_TRADES_20261005.md
"Qualquer Account disponível/conectada no NT8 pode ser selecionada RAW pelo operador para qualquer perna do INVICTUS, independentemente de SIM, PROP, REAL, provider conhecido/desconhecido, nome, case, comprimento ou Unicode. Account.Name é identidade RAW/Ordinal. Tipo/provider são telemetria e nunca execution gate. Conta ausente falha fechada. Nunca existe fallback silencioso."

## Retorno final se tudo fechar (bloco PARA COLAR NO CHATGPT)
STATUS, RUNTIME_D1_D2_LOADED, DEFECT_D1, DEFECT_D2, RESIDUAL_COPYENGINE, RESIDUAL_BASICENTRY, RESIDUAL_ACCOUNTNAMES, RESIDUAL_ACCOUNT_IDENTITY_DEFECTS, ACCOUNT_SELECTION_AUTHORITY, ACCOUNT_LIST_SOURCE, ACCOUNT_IDENTITY, ANY_CONNECTED_ACCOUNT_SUPPORTED, SIM_SUPPORTED, PROP_FIRM_SUPPORTED, REAL_MONEY_SUPPORTED, UNKNOWN_PROVIDER_SUPPORTED, ACCOUNT_WHITELIST, ACCOUNT_BLACKLIST, PROVIDER_WHITELIST, PROVIDER_BLACKLIST, ACCOUNT_TYPE_EXECUTION_GATE, IS_REAL_MONEY_EXECUTION_GATE, PROVIDER_EXECUTION_GATE, CASE_INSENSITIVE_ACCOUNT_IDENTITY, FIRST_MATCH_ACCOUNT_FALLBACK, ACCOUNT_NAME_LENGTH_DEPENDENCY, SILENT_FALLBACK, DUPLICATE_HANDLERS, ES, NQ, MES, MNQ, NES, NNQ, COPILOT_BADGE, AOT_HEALTH, ASSEMBLY_SPLIT_LOGICAL, TESTS, REGRESSION, JEV_DIFF, JEV_FINAL, DEPLOY, OPEN_POSITIONS, PENDING_ORDERS, PLAY_STATE, ORDERS_SENT, HANDOFF, PROJECT_COMPLETE, NEXT_EXACT_ACTION.
