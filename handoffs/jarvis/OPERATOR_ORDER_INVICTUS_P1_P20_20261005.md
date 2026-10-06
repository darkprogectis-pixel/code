# OPERATOR ORDER — INVICTUS P1–P20 (recebida pela sessao e81ce814 em 2026-10-05, contexto 221k => NAO INICIADA; a sucessora executa)

Texto integral, verbatim, extraido do transcript:



<pasted_content id="08a1">
MISSÃO ÚNICA E URGENTE — INVICTUS 不可征服者
CORRIGIR TODOS OS PROBLEMAS CONHECIDOS DO ROBÔ NT8 E DEIXÁ-LO PRONTO PARA OPERAR EM QUALQUER CONTA NT8 EXPLICITAMENTE SELECIONADA

TRABALHAR END-TO-END ATÉ:
COMPLETE
OU BLOQUEIO EXTERNO/JEV REAL.

NÃO RETORNAR APÓS CADA ETAPA.
NÃO REFAZER AUDITORIAS JÁ FECHADAS.
USAR OS HANDOFFS COMO FONTE CANÔNICA.

==================================================
0. OBJETIVO FINAL DO OPERADOR
==================================================

O INVICTUS deve:

1. NÃO depender de Sim101.
2. NÃO possuir fallback silencioso para Sim101.
3. permitir que o operador selecione explicitamente qualquer conta NT8 suportada:
   - Sim
   - firm/prop
   - real
4. propagar essa conta corretamente ponta a ponta.
5. manter posição, fills, reconciliação, PnL e guards isolados por conta.
6. poder iniciar/reiniciar em qualquer momento da sessão.
7. NÃO ficar o restante do dia sem operar porque perdeu a virada das 18:00 ET.
8. preservar todos os guards legítimos de segurança.
9. ficar pronto para tratar o PRÓXIMO sinal real normalmente na conta escolhida.

NÃO enviar ordem real/prop como teste.
Validar roteamento por harness/dry-run/simulação e validação live read-only.

==================================================
1. LER PRIMEIRO
==================================================

Ler integralmente:

handoffs/HANDOFF_INVICTUS_NO_TRADES_20261005.md

principalmente:
§13
§15

Ler também o handoff canônico mais recente do INVICTUS e somente as partes relevantes de:

HANDOFF_AOT_INVICTUS_CLOSE_DIVERGENCE_20261001.md

Recuperar estado atual antes de escrever:

CURRENT_HEAD =
CURRENT_LIVE_HASHES =
CURRENT_STAGING_HASHES =
CURRENT_PACKAGE =
CURRENT_CONFIG =
CURRENT_PLAY_STATE =

==================================================
2. MAPA CANÔNICO DOS PROBLEMAS
==================================================

Tratar estes grupos como o defect ledger da missão.

--------------------------------------------------
P1 — ACCOUNT BINDING DIVERGENTE
--------------------------------------------------

EVIDÊNCIA VISUAL DO OPERADOR:

Nos seis gráficos:

ES
NQ
MES
MNQ
NES
NNQ

Propriedade "Conta" do indicador:
conta firm/real terminando em "001".

Chart Trader:
mesma conta "001".

Control Center INVICTUS:
Sim101 nas seis linhas.

ativos.json v151:
Sim101 nos seis ativos.

Conclusão já levantada:

existem dois seletores independentes:
A) conta do indicador/Chart Trader;
B) conta de ATIVOS/ativos.json usada pelo robô.

O robô atualmente lê B.

PROBLEMA:
o operador pode acreditar estar usando "001" enquanto o robô continua configurado em Sim101.

REQUISITO:
não pode existir divergência silenciosa.

--------------------------------------------------
P2 — FALLBACK SILENCIOSO SIM101
--------------------------------------------------

Achado confirmado:

AlfaOmegaRoboAtivos.cs
ContaPadrao="Sim101"

Há uso runtime associado.

REQUISITO FINAL:

RUNTIME_SIM101_FALLBACK = 0

Se a conta configurada estiver ausente/desconectada:

ACCOUNT_NOT_AVAILABLE

Nunca:
→ substituir silenciosamente por Sim101.

--------------------------------------------------
P3 — ACCOUNT HOOKS REGISTRADOS SOMENTE NO BOOT
--------------------------------------------------

Achado confirmado:

acompanhamento/hooks de ordens/execuções é registrado apenas no boot.

Isso pode deixar novas contas selecionadas depois sem acompanhamento correto.

REQUISITO:

hooks precisam acompanhar dinamicamente as contas efetivamente usadas pelo robô.

Sem duplicar handlers.
Sem perder fills.
Sem exigir restart para mudar conta.

--------------------------------------------------
P4 — POSITION GUARD / CONTAMINAÇÃO ENTRE CONTAS
--------------------------------------------------

Problema histórico comprovado:

positions sem tag após fechamento / exec_desvio / fills de saída não observados
podiam bloquear entradas posteriores.

Código histórico de position_guard permaneceu presente.

CURRENT_RECURRENCE no dia 05/10:
NOT_PROVEN.

Não presumir que esse bug é a causa atual,
mas corrigir qualquer escopo incorreto encontrado.

REGRA:

position_guard deve operar por:

ACCOUNT + INSTRUMENT

e, quando necessário:

ACCOUNT + INSTRUMENT + ROBOT/ORDER ID

Uma posição em Sim101 NÃO pode bloquear "001".

Uma posição em "001" NÃO pode bloquear Sim101.

--------------------------------------------------
P5 — RECONCILIAÇÃO / FILLS
--------------------------------------------------

Garantir isolamento completo:

fill conta A
não altera
estado conta B.

Auditar:

tagged positions
untagged positions
manual positions
entry fills
exit fills
exec_desvio
close
reverse
restart recovery

Chave mínima:

ACCOUNT + INSTRUMENT

e, quando aplicável:

ACCOUNT + INSTRUMENT + ROBOT/ORDER ID

--------------------------------------------------
P6 — P1S / PRESS ZERADO APÓS STARTUP MID-SESSION
--------------------------------------------------

Causa comprovada de 05/10:

NT8 iniciado às ~09:48 ET
sem ter observado a virada real de sessão
→ AoPressSessao não tinha baseline válido
→ Press ES/NQ = 0
→ AoGate.EsNq fechou em "força fraca ES/NQ"
→ nenhum OPEN.

Isso é incompatível com operação normal.

REQUISITO:

MID_SESSION_STARTUP = SUPPORTED

--------------------------------------------------
P7 — P1S LEAK
--------------------------------------------------

Achado:

Press != 0 apenas ~22 segundos após carga no meio da sessão.

P1S_LEAK = YES como observação.

Mecanismo provável levantado:
primeiro tick live sendo interpretado indevidamente como virada.

Confirmar mecanismo no código/teste.

Regra proposta:

virada válida somente dentro da janela correta em torno do início real da sessão,
não simplesmente no primeiro tick recebido após carregar indicador.

--------------------------------------------------
P8 — ESTADO DO PRESS MAL REPRESENTADO
--------------------------------------------------

Hoje Press=0 mistura:

- força genuinamente zero
com
- baseline inexistente
com
- warmup
com
- dado indisponível.

Isso precisa desaparecer.

Estados obrigatórios:

PRESS_WARMUP
PRESS_VALID
PRESS_UNAVAILABLE

Press numérico só pode entrar no gate quando válido.

Não fabricar Press.

--------------------------------------------------
P9 — STARTUP / RESTART / F5
--------------------------------------------------

Hoje reload/restart pode zerar estado e bloquear operação até a próxima virada.

REQUISITO:

startup antes da sessão = OK
startup depois da virada = OK
startup durante RTH = OK
restart durante RTH = OK

Sem depender de F5 como mecanismo operacional.

--------------------------------------------------
P10 — STOP/PLAY PERSISTENCE
--------------------------------------------------

Em 05/10:

robô permaneceu STOP desde 02/10 até PLAY 14:06:42Z.

O único candidato inicial foi bloqueado enquanto engine_play estava STOP.

Auditar:

- persistência STOP/PLAY;
- estado esperado no boot;
- origem do STOP;
- exibição correta no Control Center;
- nenhuma divergência entre UI e motor.

NÃO mudar política arbitrariamente.

Garantir apenas que o estado real seja inequívoco e consistente.

--------------------------------------------------
P11 — CONTROL CENTER ACCOUNT UX
--------------------------------------------------

O painel central hoje mostra Sim101 mesmo com conta "001"
visível nos gráficos.

Definir UX inequívoca.

A fonte de verdade do ROBÔ deve continuar explícita.

Se ATIVOS for mantido como fonte canônica:
o operador deve conseguir selecionar ali qualquer conta NT8 suportada,
e essa seleção deve ser persistida e propagada corretamente.

A UI não pode induzir a entender que Chart Trader automaticamente controla o robô se não controla.

Ideal:
mostrar claramente:

ROBOT_ACCOUNT =
CHART_ACCOUNT =

e alertar ACCOUNT_MISMATCH quando divergirem.

Se a arquitetura já tiver mecanismo melhor documentado,
usar o desenho canônico existente.

--------------------------------------------------
P12 — ATIVOS.JSON / PERSISTÊNCIA
--------------------------------------------------

Auditar:

- gravação;
- leitura;
- versionamento;
- mudança de conta;
- restart;
- atomicidade;
- seis ativos;
- stale config.

Conta alterada precisa chegar ao runtime sem ficar presa numa versão anterior.

--------------------------------------------------
P13 — COPY ENGINE
--------------------------------------------------

Nos prints:
COPY = ON.

Auditar end-to-end:

leader account
follower account(s)
fill replication
account mapping
instrument mapping
duplicate prevention
position isolation

COPY não pode:

- transformar conta selecionada em Sim101;
- contaminar position_guard;
- duplicar ordens;
- cruzar contas sem configuração explícita.

--------------------------------------------------
P14 — PNL / TELEMETRIA POR CONTA
--------------------------------------------------

Control Center mostra PnL $0 enquanto há divergência de conta.

Auditar se:

PnL
posição
aberto
realizado
telemetria

estão associados à conta correta.

Todos devem carregar ACCOUNT explicitamente.

--------------------------------------------------
P15 — ACCOUNT AVAILABILITY
--------------------------------------------------

Quando uma conta configurada:

- não existe;
- está desconectada;
- não está habilitada;

deve ocorrer:

ACCOUNT_NOT_AVAILABLE

fail-closed.

Nunca fallback silencioso.

--------------------------------------------------
P16 — EXECUTION ADAPTER
--------------------------------------------------

Provar finalmente:

selected account
→ execution adapter
→ AlfaOmegaTrader :5152
→ submit account

Auditar:

requireFlat
maxPositions
account lookup
order naming
submit
cancel
close
reverse

A conta do submit deve ser exatamente a conta configurada para a perna.

--------------------------------------------------
P17 — EVENT ACCOUNT PROPAGATION
--------------------------------------------------

Auditar:

ativos.json
→ EventoAot
→ BFF
→ Robo
→ Gate
→ execution

ACCOUNT precisa acompanhar o evento quando a arquitetura exigir.

Nenhuma etapa pode reintroduzir Sim101.

--------------------------------------------------
P18 — 6 LEGS
--------------------------------------------------

Validar individualmente:

ES
NQ
MES
MNQ
NES
NNQ

Não aceitar teste apenas com ES/NQ.

Para cada:

CONFIG_ACCOUNT =
RUNTIME_ACCOUNT =
GUARD_ACCOUNT =
EXEC_ACCOUNT =

todos devem coincidir.

--------------------------------------------------
P19 — SOURCE / DATA READINESS
--------------------------------------------------

A causa de 05/10 não foi desconexão global,
mas validar que o robô diferencia:

SOURCE_CONNECTED
SOURCE_STALE
SOURCE_EXPECTED_SILENCE
SOURCE_UNAVAILABLE

Fontes devem permanecer conectadas 24h conforme regra canônica.

Ausência esperada fora do horário de publicação não deve provocar desconexão automática.

--------------------------------------------------
P20 — OBSERVABILIDADE
--------------------------------------------------

Depois da correção, /state/logs devem permitir responder sem ambiguidade:

ROBOT_ACCOUNT =
ACCOUNT_SOURCE =
ACCOUNT_AVAILABLE =
PRESS_STATE =
PRESS_VALUE =
GATE_RESULT =
BLOCK_REASON =
PLAY_STATE =
POSITION_GUARD_RESULT =
EXECUTION_READY =

Sem precisar inferir do log bruto.

==================================================
3. PRIMEIRA ETAPA — CONFIRMAR O MAPA NO CÓDIGO
==================================================

Não repetir auditoria ampla.

Só preencher lacunas necessárias para implementar P1–P20.

Produzir matriz:

ISSUE =
STATUS = CONFIRMED / HISTORICAL / NOT_REPRODUCED / NOT_A_DEFECT
FILE =
LINE =
FIX_REQUIRED = YES/NO

Não patchar algo que a evidência mostrar como não defeito.

==================================================
4. ARQUITETURA FINAL DE CONTA
==================================================

Resultado obrigatório:

ROBOT ACCOUNT SOURCE =
seleção explícita do operador para cada ativo no mecanismo canônico do Control Center/ATIVOS.

Nenhuma conta escolhida por:

- ordem de enumeração;
- "primeira conectada";
- hardcode;
- fallback Sim101.

Qualquer conta suportada pelo NT8 deve poder ser selecionada explicitamente.

Mudança deve funcionar sem recompilar.

==================================================
5. P1S — SOLUÇÃO
==================================================

Usar a proposta já investigada:

reconstruir Press da sessão corrente usando ticks históricos reais
com bid/ask/lado agressor.

Medição já levantada:

dados sem lado:
ES ~0,018% do volume
NQ ~0,015%

limite proposto no estudo:
1%.

ANTES de implementar:
confirmar isso no estudo/handoff §15.

Preservar:

fórmula Press
reset
minForce 0.03
AoGate thresholds

NÃO alterar esses elementos.

==================================================
6. JEV — UMA MISSÃO END-TO-END
==================================================

Antes do patch:

1. backups;
2. proposta concreta PROPOSED_account_p1s.txt;
3. JEV aplicável;
4. ONE JEV DIFF.

Se DIFF = A:
CONTINUE AUTOMATICAMENTE.

Não retornar ao operador.

Se != A:
parar por bloqueio real e retornar evidência.

==================================================
7. IMPLEMENTAÇÃO STAGING
==================================================

Corrigir todos os issues P1–P20 que forem CONFIRMED e FIX_REQUIRED.

Incluindo no mínimo:

- remover ContaPadrao Sim101 runtime;
- account selection explícita;
- account propagation;
- hooks dinâmicos;
- position guard por conta;
- reconciliation por conta;
- execution por conta;
- account availability;
- account mismatch observability;
- COPY account isolation;
- PnL/telemetria account scoped;
- P1S historical reconstruction;
- PRESS states;
- fix P1S leak;
- restart/startup resiliente.

Não tocar estratégia além do necessário.

==================================================
8. TESTES ACCOUNT
==================================================

ACC01 conta A + posição conta B → B não bloqueia A
ACC02 Sim101 com posição + firm selecionada → não bloqueia
ACC03 firm com posição + Sim101 selecionada → não bloqueia
ACC04 conta chega idêntica ao adapter
ACC05 zero fallback Sim101
ACC06 conta ausente → ACCOUNT_NOT_AVAILABLE
ACC07 reconciliation account scoped
ACC08 fill B não altera A
ACC09 restart mantém binding
ACC10 seis legs corretas
ACC11 UI/Control Center mostra conta real do robô
ACC12 mudança de conta persiste
ACC13 hooks acompanham mudança
ACC14 sem handlers duplicados
ACC15 Chart Account != Robot Account gera sinalização explícita

==================================================
9. TESTES POSITION/RECONCILIATION
==================================================

POS01 untagged em outra conta não bloqueia
POS02 untagged na mesma conta segue política
POS03 exit fill limpa estado correto
POS04 exec_desvio não contamina outra conta
POS05 restart reconcilia somente account/instrument correto
POS06 close/reverse isolados por conta

==================================================
10. TESTES P1S
==================================================

P1S01 startup pré-sessão
P1S02 startup pós-virada
P1S03 startup RTH
P1S04 restart RTH
P1S05 reload não deixa zero permanente
P1S06 historical reconstruction válida
P1S07 WARMUP explícito
P1S08 UNAVAILABLE explícito
P1S09 zero genuíno continua possível quando VALID
P1S10 minForce permanece 0.03
P1S11 fórmula inalterada
P1S12 false session-start/leak eliminado

==================================================
11. TESTES COPY / EXECUTION
==================================================

COPY01 leader/follower account mapping correto
COPY02 sem cross-account não configurado
COPY03 sem duplicação

EXEC01 signal → gate → OPEN → selected account
EXEC02 nenhuma ordem para conta errada
EXEC03 account mismatch fail-closed
EXEC04 six legs account-correct
EXEC05 STOP bloqueia corretamente
EXEC06 PLAY permite pipeline normalmente
EXEC07 requireFlat account scoped
EXEC08 maxPositions account scoped

NENHUM teste deve enviar ordem real/prop.

Usar mocks/harness/dry-run/Sim controlada.

==================================================
12. REGRESSÃO COMPLETA
==================================================

Rodar suítes relevantes:

INVICTUS
AOT
Robo
Control Center
event stream
execution
position guard
reconciliation
copy
PnL
AoPressSessao
AoGate
startup/restart

ZERO regressão nova.

==================================================
13. JEV FINAL
==================================================

Após implementação e testes:

JEV FINAL obrigatório.

Se aprovado:
CONTINUAR para deploy.

==================================================
14. DEPLOY
==================================================

Seguir procedimento canônico existente:

backup live
hash antes
pacote
deploy
hash depois
rollback pronto

NÃO fazer alteração manual avulsa.

==================================================
15. ÚNICA PARADA PERMITIDA PARA OPERADOR
==================================================

Se depois do deploy for tecnicamente necessário:

F5/reload NT8
ou
selecionar conta "001" nos ATIVOS

PARAR SOMENTE NESSE MOMENTO.

Retornar exatamente a ação física necessária.

Depois do operador confirmar:
CONTINUAR a missão.

==================================================
16. VALIDAÇÃO LIVE READ-ONLY
==================================================

Sem disparar ordem como teste.

Validar:

CONTROL_CENTER_ACCOUNT =
ATIVOS_JSON_ACCOUNT =
ROBOT_ACCOUNT =
POSITION_GUARD_ACCOUNT =
EXECUTION_ACCOUNT =
COPY_ACCOUNT_MAPPING =
PNL_ACCOUNT =
PRESS_STATE =
PRESS_VALUE =
GATE_STATE =
PLAY_STATE =
EXECUTION_READY =

Testar também mudança entre duas contas usando apenas configuração/harness,
sem enviar ordem financeira real.

==================================================
17. CRITÉRIO 100% CONCLUÍDO
==================================================

Só marcar COMPLETE quando:

SIM101_RUNTIME_FALLBACK = 0
HARDCODE_EXECUTION_SIM101 = 0
ACCOUNT_SELECTION = EXPLICIT
ACCOUNT_BINDING_END_TO_END = PASS
ACCOUNT_CHANGE_WITHOUT_RESTART = PASS
OTHER_ACCOUNT_POSITION_BLOCK = NO
POSITION_GUARD_ACCOUNT_SCOPE = PASS
RECONCILIATION_ACCOUNT_SCOPE = PASS
COPY_ACCOUNT_SCOPE = PASS
PNL_ACCOUNT_SCOPE = PASS
ACCOUNT_NOT_AVAILABLE = PASS
P1S_MID_SESSION_STARTUP = PASS
P1S_RESTART = PASS
P1S_LEAK = FIXED
PRESS_STATE_MODEL = PASS
STOP_PLAY_STATE = PASS
SIX_LEGS = PASS
TESTS = PASS
REGRESSION = PASS
JEV_FINAL = APPROVED
DEPLOY = PASS
LIVE_VALIDATION = PASS

O robô deve terminar:

READY_FOR_NEXT_REAL_SIGNAL = YES

na conta explicitamente escolhida pelo operador.

==================================================
18. NÃO ALTERAR
==================================================

Não alterar sem evidência:

- estratégia direcional;
- thresholds;
- minForce 0.03;
- stops;
- targets;
- sizing;
- signal semantics;
- JARVIS;
- InvestLab;
- APIs de outras fontes.

==================================================
19. HANDOFF
==================================================

Atualizar continuamente:

handoffs/HANDOFF_INVICTUS_NO_TRADES_20261005.md

com:

defect ledger
antes/depois
arquivos
linhas
JEV IDs
testes
commits
hashes
deploy
rollback
live validation
estado 100%

==================================================
20. RETORNO FINAL
==================================================

Não retornar parcial salvo bloqueio externo real ou ação física obrigatória.

Terminar com:

```text
PARA COLAR NO CHATGPT

STATUS =
PROBLEMAS_MAPEADOS =
PROBLEMAS_CONFIRMADOS =
PROBLEMAS_CORRIGIDOS =
ACCOUNT_SOURCE_FINAL =
SIM101_RUNTIME_FALLBACK =
ACCOUNT_BINDING =
POSITION_GUARD =
RECONCILIATION =
COPY_ENGINE =
PNL_TELEMETRIA =
P1S_STARTUP =
P1S_LEAK =
STOP_PLAY =
JEV_DIFF =
IMPLEMENTACAO =
TESTES =
REGRESSAO =
JEV_FINAL =
DEPLOY =
LIVE_VALIDATION =
READY_FOR_NEXT_REAL_SIGNAL =
COMMITS =
PUSH =
HANDOFF =
ESTADO_ATUAL =
PROXIMO_PASSO_EXATO =
</pasted_content id="08a1">

