# DOSSIÊ DE DETALHE — EXIT_LAYER_FIX X2 (2026-10-08)

Somente leitura do código instalado na OLIVER (snapshot `scratch 6b86565f\oliver_post_z30\AddOns`, igual ao instalado por hash). Nada implementado. Robô STOP · conta real FLAT · PATCH_STATUS = NOT_STARTED.
Base: JEV INCIDENT T1 = A (req_01a11c682b8d719f8b4468d1fc3537c0) · desenho X2 (JEV DESIGN T3, req_01a11c71d37772f5ad4bedbf27576128) · T4 pediu este dossiê (req_01a11c72472a787eadd4d8070b61b996).

## D. Lacunas do T4

### ORDER_ID_INITIALIZED_CAUSE (provado por código + dados)
- `AlfaOmegaTrader.cs` `PlaceJson/PlaceCore` l.1110–1125: `a.CreateOrder(...)` → `a.Submit(...)` → devolve `ord.OrderId` lido naquele instante.
- `AlfaOmegaTrader.cs` `OrdersJson` l.992–1025: percorre `a.Orders` e emite o `OrderId` ATUAL de cada ordem, com `name`, `state`, `filled`, `oco`.
- Dados de 08/10: envio devolveu `orderId` `bb1b08f6…` para a ordem de nome `AO|aaa5cd|AO-20261008-aaa5cd-MES-LONG-161723|X`; o log do NT8 e o `order_state` do robô mostram a mesma ordem (mesmo nome) com id `674389781092`, Submitted → Accepted → Working → Filled. Nas contas Sim o id devolvido é o mesmo que aparece depois.
- `AlfaOmegaRobo.cs` `EsperarFilled` l.1596–1611: procura em `LerOrdens` o `orderId` inicial por até 3 s; a variável `est` guarda o último estado encontrado; depois da troca de id não há mais correspondência; devolve "Initialized".
- Caminho que recebe nomes e ids reais da corretora: `AoRoboOrderWatch.OnOrderUpdate` (`AlfaOmegaRoboOrderWatch.cs` l.229) — lê `e.Order.Name`, `e.OrderId`, `e.OrderState`, `e.Filled`; casa por nome (`AoOrigem.IntentIdDe`) e grava `order_state` — e `AlfaOmegaRobo.OnExecucao` (l.3062) — lê `e.Execution.Order.Name`, quantidade e preço; `AoRoboLedger.IntentDe(nome)`; `_fechamento.RegistrarFill(intentId, compra, qty, preco, t, nome)`.
- Não provado: o instante exato em que o NT8 troca o id (comportamento interno do NinjaTrader/adaptador da corretora).

### OTHER_DAMAGE_PATHS
| Via | Classe | Evidência |
|---|---|---|
| trailing stop 4/4 + reabertura no mesmo ciclo e lado | PROVEN (08/10) | bloqueio `BloqueiaEntrada` é lido antes de `m.Tick`; reabertura decidida dentro do mesmo `Tick` |
| reabertura no lado oposto | PROVEN sem dano (06/10) | `RevalidarClose` → BROKER_INTERNAL_DIVERGENCE, nenhuma ordem |
| `flatten_retry` com motor FLAT + posição alheia (manual/cópia) no mesmo lado | POSSIBLE (código) | `Decidir` regra 2 "nao encontrada → nova tentativa" + regra 3 fecha `min(qty, conta)` |
| reinício/recarga com perna não verificada persistida + posição no mesmo lado | POSSIBLE (código) | mesma regra; `_execucoes` é recarregado de `motor-execucoes.json` |
| anchor_neutro / saída comum seguida de nova entrada | NOT_FOUND | cooldown 60 s + `exit_pending` bloqueia entrada até CLOSED (20–40 s) |
| stop da perna executado na corretora | NOT_FOUND | `EstadoStopDaPerna` casa por OCO/nome → `JaFechada` |
| take da perna executado | NOT_FOUND | conta FLAT → duas leituras → `JaFechada`; nunca ordem |
| retry após REJECTED/CANCELLED | NOT_FOUND | `clientOrderId` por tentativa; nova ordem só com posição no mesmo lado |
| duas pernas na mesma conta/instrumento por outra origem | POSSIBLE só pelas vias acima | registro é por `intentId`; posição é por conta |

## A. Especificação em nível de código (7 alterações, 3 arquivos)

**Achado que reduz o escopo:** o saldo por perna já pode ser derivado de estado existente e persistido. `AoRoboFechamento._fills` (`AlfaOmegaRoboFechamento.cs` l.457) guarda por `intentId` a lista `{c: compra, q, p, t, n: nome da ordem}` de TODA execução com prefixo `AO|` (entrada, `|X`, `|S`, `|T`), alimentada por `OnExecucao`, gravada em `state\motor-fechamentos.json` (`Save` l.889 / `Load` l.870).

| # | FILE | FUNCTION/METHOD | CURRENT_BEHAVIOR | REQUIRED_BEHAVIOR | STATE_READ | STATE_WRITTEN | INVARIANT | COMPATIBILITY_RISK |
|---|---|---|---|---|---|---|---|---|
| C1 | AlfaOmegaRoboFechamento.cs | novo `SaldoPerna(intentId, side, qtyEntradaFallback, out bool conhecido)` (puro, sob `_gate`) | não existe; fills só usados para P&L e para "fills de saída cobrem os de entrada" | entrada = Σ q das execuções no lado da perna cujo nome NÃO termina em `|X`/`|S`/`|T`; saídas = Σ q das execuções no lado oposto; saldo = max(0, entrada − saídas); `conhecido=false` se não há nenhuma execução registrada para o intent (usa `qtyEntradaFallback`, saídas 0) | `_fills` | nada | I2, I3 | baixo: método novo, não altera `Avaliar` nem P&L |
| C2 | AlfaOmegaRoboSaida.cs | `Decidir(e, st, ordens)` → nova sobrecarga `Decidir(e, st, ordens, saldo, saldoConhecido, posDisponivel)` | regra 2 procura o fechamento por `x_order_id`; não FILLED e não ativo ⇒ "nova tentativa"; regra 3 `QtyFechar = min(qty, pos.Quantity)` | regra 2 por NOME (`NomeFechamento(order_name)`): alguma ordem com esse nome ativa ⇒ `Aguardar`; `saldoConhecido && saldo==0` ⇒ `Verificada`; fechamento já enviado (`x_enviada` presente) e última ordem com esse nome NÃO comprovadamente `Rejected`/`Cancelled` (inclui não encontrada/Initialized) ⇒ `Aguardar`, nunca reenviar; só `Rejected`/`Cancelled` comprovado e saldo > 0 ⇒ segue. Regra 3: `QtyFechar = min(saldo, posDisponivel)`; `posDisponivel <= 0` ⇒ `JaFechada` | registro da perna, `ordens`, saldo, posição disponível | nada (pura) | I1, I2, I3, I5 | médio: muda a decisão; sobrecarga antiga mantida para chamadores que não passam saldo |
| C3 | AlfaOmegaRobo.cs | `ExecutarSaida(motivo, agora, contas, retry)` l.1418 | uma leitura de posição antes do laço usada inteira por todas as pernas; verificação por `EsperarFilled(id)` | montar `disp[(nt8_account, instrumento, lado)]` a partir da leitura; por perna: `saldo = _fechamento.SaldoPerna(...)`; chamar C2 com `disp`; após `PlaceCore` 200, `disp -= QtyFechar` imediatamente; confirmação por C7; `fechada=true` quando saldo conhecido == 0 ou ordem de nome `|X` FILLED cobrindo o saldo; novo parâmetro `soPendentes` (só pernas com `x_enviada != null`) | `_execucoes`, posições, ordens, `_fills` | `x_estado`, `fechada`, `x_*`, auditoria | I1, I2, I5 | médio: núcleo da saída; coberto por T01–T26 |
| C4 | AlfaOmegaRobo.cs | `RevalidarClose` l.1541 | `qf` vem de `ClassificarBrokerNoClose(side, qty, …)` com a posição inteira | usar `min(saldo, posDisponivel)` no lugar de `qty` e da posição inteira; demais ramos (FLAT ⇒ JaFechada/Aguardar 2ª leitura; lado oposto ⇒ divergência, nenhuma ordem) inalterados | idem | nada | I1, I5 | baixo |
| C5 | AlfaOmegaRobo.cs | `MotorPasso` l.686–689 | `flatten_retry` só quando `!fechouEv && ExecucoesGerenciadas().Count > 0 && !m.TemPosicao` | manter o ramo atual; acrescentar: em todo tick, se existir perna com `x_enviada != null` e não `fechada`, `ExecutarSaida("flatten_retry", …, retry:true, soPendentes:true)` mesmo com `m.TemPosicao` — nunca toca pernas do trade aberto (sem `x_enviada`) | `_execucoes` | via C3 | I3 | médio: novo ponto de chamada; `soPendentes` é a guarda |
| C6 | AlfaOmegaRobo.cs | dentro de `ExecutarSaida` (pontos de `broker_internal_divergence` e `flatten_fail`) + verificação de prazo | só auditoria; `_alertas` (AoRoboAlertas) usado apenas por `ConexaoPasso` | `_alertas.Ativar("broker_divergence"|"flatten_fail"|"close_unconfirmed", conta, instrumento, intentId, 1, agora)`; `close_unconfirmed` quando `agora − x_enviada > 60 s` e perna não fechada; `_alertas.Limpar(...)` quando a perna resolve | `x_enviada`, decisão | `state\robo-alertas.json` | I6 | baixo: rotina existente (`Ativar`/`Limpar`, Fechamento.cs l.960–1012) |
| C7 | AlfaOmegaRobo.cs | `EsperarFilled(ntAcc, orderId, maxMs)` l.1596 | procura por `orderId` inicial | `EsperarFechamento(ntAcc, nomeX, intentId, side, maxMs)`: FILLED quando `SaldoPerna` conhecido == 0 OU ordem de nome `nomeX` em `LerOrdens` está FILLED; `Rejected`/`Cancelled` por nome; senão último estado por nome (ou null) | `_fills`, ordens por nome | nada | I3, I7 | baixo |

Não mudam: `AlfaOmegaTrader.cs` (adaptador), `AlfaOmegaRoboMotor.cs`, gate/`AlfaOmegaSharedState.cs` (FORCA_JANELA_30), entradas (`ExecutarEntrada`/`ExecutarAlvo`), proteção (`ProtegerFill`, `GarantirProtecao`), escolta do take (pacote separado), `AoRoboOrderWatch`, identidade/licença.

Para o harness usar o código real: a aritmética de C3 (posição disponível, saldo, abatimento, decisão por perna) fica numa função PURA nova em `AlfaOmegaRoboSaida.cs` — `PlanejarSaidas(pernas, posicoesPorConta, ordensPorConta, saldoDe)` → lista de decisões — e `ExecutarSaida` passa a ser o executor fino desse plano. As peças puras (`AlfaOmegaRoboSaida.cs`, `AlfaOmegaRoboFechamento.cs`) compilam fora do NT8, como já fazem os harnesses existentes.

## B. Modelo de estado da perna (mínimo)
Nenhum campo persistido novo é obrigatório.
| Campo pedido | Representação | Onde |
|---|---|---|
| trade_id / perna | `trade_id`, `intentId` | `_execucoes` (existe) |
| account / instrument / side | `nt8_account`, `instrumento`, `side` | existe |
| entry_qty_filled | Σ execuções de entrada por nome | `_fills` (existe); fallback `QtyPreenchidaDe(e)` |
| exit_qty_filled | Σ execuções `|X`/`|S`/`|T` | `_fills` (existe) |
| remaining_qty | `SaldoPerna` (calculado, não gravado) | C1 |
| close_order_name | `order_name + "|X"` (`NomeFechamento`) | derivado |
| close_order_state | estado por nome em `ordens`; espelhado em `x_estado` | existe (`x_estado`) |
| stop/take_order_name | `order_name + "|S"` / `"|T"`, grupo `oco_id` | existe |
| last_execution_time | `t` da última execução | `_fills` |
| pending_since | `x_enviada` | existe |
| reconciliation_state | evento da perna (Pendente/Falha/FlatVerificado/FlatJaFechada) + `desvio` + `broker_internal_divergence_at` | existe |
| alert_state | `AoRoboAlertas` (chave kind+conta+instrumento+intentId) | existe |
- Criação: como hoje (`RegistrarExecucao` na entrada). Atualização: `OnExecucao` → `RegistrarFill`; `ExecutarSaida` → `x_*`, `fechada`.
- Persistência/reload: `motor-execucoes.json` (`GravarExecucoes`/`CarregarExecucoes`) + `motor-fechamentos.json` (`Save`/`Load`), ambos já existentes.
- Migração: nenhuma. Registro antigo sem execuções em `_fills` ⇒ `conhecido=false` ⇒ entrada = `QtyPreenchidaDe(e)`, saídas desconhecidas ⇒ tratado como "saldo desconhecido": nunca reenvia se já houve envio; quantidade limitada por `posDisponivel`; perna encerra por duas leituras de conta FLAT.

## C. Recuperação / restart (determinístico)
| Caso | Ação |
|---|---|
| 1. reinício com perna pendente | `CarregarExecucoes` + `Load` de `_fills`; perna reavaliada em todo tick (C5) |
| 2. conta LONG (mesmo lado) | saldo conhecido 0 ⇒ perna encerrada, nenhuma ordem. Saldo > 0 e fechamento já enviado sem `Rejected`/`Cancelled` comprovado ⇒ `Aguardar`, alerta após 60 s, nenhuma ordem. Saldo > 0 e fechamento nunca enviado (motor FLAT) ⇒ fechar `min(saldo, posDisponivel)` |
| 3. conta FLAT | nunca enviar; encerrar por execução por nome OU duas leituras FLAT; cancelar só a proteção da própria perna |
| 4. conta no lado oposto | nenhuma ordem; perna em falha; entradas bloqueadas; alerta `broker_divergence` |
| 5. ordem antiga FILLED (por nome) | `Verificada`; perna encerrada |
| 6. ordem antiga não aparece | estado desconhecido ⇒ `Aguardar`, nunca reenviar; alerta após 60 s; resolve por execução ou duas leituras FLAT |
| 7. execução parcial | saldo = entrada − parcial; ordem por nome `PartFilled` ⇒ ativa ⇒ aguardar; terminal `Cancelled` com saldo > 0 ⇒ nova ordem de `min(saldo, posDisponivel)` |
| 8. stop/take executou durante indisponibilidade | sem evento ⇒ `EstadoStopDaPerna` por OCO FILLED ⇒ `JaFechada`; senão conta FLAT × 2 ⇒ encerrada; nunca ordem |
| 9. posição alheia/manual no mesmo instrumento | saldo conhecido 0 ⇒ nenhuma ordem; fechamento já enviado e não comprovado ⇒ nenhuma ordem; saldo > 0 real ⇒ no máximo o saldo da própria perna |
Nenhum ramo envia ordem com conta FLAT ou no lado oposto.

## Algoritmos
- **Reconciliação (C3):** `disp[c,i,lado]` = posição lida da conta; para cada perna pendente na ordem do registro: `saldo`; decisão C2; se `Fechar`: `q = min(saldo, disp)`; `PlaceCore(q)`; `disp -= q`. Soma dos `q` por conta/instrumento ≤ posição lida.
- **Retry (C2):** reenviar ⇔ existe ordem de nome `|X` comprovadamente `Rejected`/`Cancelled` como último estado E saldo > 0 E `disp > 0`. Caso contrário aguardar.
- **Alerta (C6):** `broker_divergence` na divergência; `flatten_fail` em falha de saída; `close_unconfirmed` com `agora − x_enviada > 60 s`; limpar ao resolver.
- **Fail-safe:** estado desconhecido não reenvia; conta FLAT nunca recebe ordem; lado oposto nunca recebe ordem e bloqueia entradas (já existente); sem STOP automático.

## E. Matriz de testes (harness com o código real do staging)
Driver C# compilado com as peças puras reais (`AlfaOmegaRoboSaida.cs`, `AlfaOmegaRoboFechamento.cs`) + corretora simulada (posições por conta, lista de ordens com troca de id opcional, eventos de execução com atraso/perda configuráveis). Cada teste verifica I1–I8 (I1/I2/I5 = posição final nunca cruza zero e soma dos fechamentos ≤ posição; I3 = perna encerrada não volta; I4 = reentrada no mesmo ciclo sem inversão; I6 = alerta gravado; I7 = mesmo resultado com e sem troca de id; I8 = hash de `AlfaOmegaSharedState.cs`, `AoTapeEngine.cs`, `AoMarketDataPublisher.cs` e 860/860 entradas do harness do gate).
T01 LONG→saída→reentrada mesmo ciclo→saída · T02 SHORT idem · T03 trailing · T04 anchor_neutro · T05 saída comum · T06 confirmação rápida · T07 atrasada > 3 s · T08 ExecutionUpdate perdido/atrasado · T09 parcial · T10 ordem não encontrada · T11 corretora FLAT · T12 lado oposto · T13 MES · T14 MNQ · T15 ids modelo real · T16 ids modelo Sim · T17 retry REJECTED · T18 retry CANCELLED · T19 UNKNOWN/ACTIVE não reenvia · T20 restart com perna pendente · T21 stop executado · T22 take executado · T23 posição alheia · T24 duas pernas mesma conta/instrumento · T25 divergência gera alerta · T26 fechamento > 60 s gera alerta · T27 FORCA_JANELA_30 idêntica.
Primeiro rodar T01 contra o código ATUAL para reproduzir a inversão (prova de que o harness enxerga o defeito), depois contra o staging.

## F. Rollout de packs (procedimento posterior; nada alterado agora)
Depois de JEV DESIGN T5 = A → staging → harness PASS → JEV DIFF = A → validação OLIVER: inventariar todos os packs distribuídos/gerados; classificar por hash/conteúdo dos arquivos da camada afetada (`AlfaOmegaRobo.cs`, `AlfaOmegaRoboSaida.cs`, `AlfaOmegaRoboFechamento.cs`) em AFFECTED / NOT_AFFECTED / ALREADY_FIXED / UNKNOWN; para AFFECTED: aplicar só o patch aprovado preservando auth/licença/device/config/branding/parâmetros, compile, testes, inesperados 0, ZIP novo + SHA256, rollback, roundtrip, matriz final. Nenhuma importação ou distribuição automática. OLIVER é a primeira validação real.
