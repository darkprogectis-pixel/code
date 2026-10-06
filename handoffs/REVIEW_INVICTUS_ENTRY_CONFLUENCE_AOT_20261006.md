# INVICTUS — Entry Confluence & AOT Performance Review
Data: 2026-10-06 · Sessão 525eba2d (sucessora de 8c8b71c5, rotação #12) · READ-ONLY

> **STATUS = DONE_WITH_UNKNOWNS.** Investigação feita só com leitura. Nada foi alterado: código, config, PLAY, ATIVOS, contas, ordens, F5, commit e push ficaram intocados. Este é o único arquivo escrito. Script de métricas (só leitura, fora do repo): `scratchpad 525eba2d\aot_audit.js` (`node aot_audit.js basic|daily|weekly|eras <ISO,...>|reasons`). Cada número AOT abaixo é reproduzível com ele.

## 0. Missão
Ordem do operador de 2026-10-06 (texto completo na sessão 8c8b71c5). Pede o review forense das confluências e gatilhos de entrada do INVICTUS e da evolução do AOT SIM, sem inferência. Prioridade das fontes: código → runtime → handoffs → git → execução → AOT → testes.

## 1. Executive Summary
- **O INVICTUS não decide a entrada.** Ele SEGUE o evento canônico `OPEN` do AOT SIM (`aot-sim.js`, publicado em `:3600/sim/events`). O robô só pode **impedir** a execução (gates operacionais e de conta). Nunca cria um sinal.
- **O sinal tem uma única origem:** o anchor 4/4 de `AoGate.EsNq()`. São 4 canais (ME e MVI de ES e de NQ), todos no mesmo lado, com tape fresco (<90 s) e pressão de sessão |Press| ≥ 0.03 em ES **e** em NQ. A esse anchor o AOT SIM soma histerese (rearme), cooldown de 60 s, spot ES/NQ válido e, desde 2026-10-02, nenhum trade em EXIT_PENDING ou divergente.
- **Regra-núcleo do AOT SIM inalterada desde o baseline git** (`566693a`, 2026-07-20): `strength===4 && dir∈{LONG,SHORT} && cooldownOk && freshOk && esSpot && nqSpot`. As mudanças funcionais que afetam a entrada estão **a montante** (limiar de força 0.05→0.03 e política P1S do Press) ou são **uma condição nova** (`!execBloqueiaEntrada()`, 2026-10-02).
- **AOT SIM (oficial, 566 trades, de 2026-08-03 a 2026-10-06):** WR 52.7 % · líquido +$44,642.60 · PF 1.80 · max DD $5,467.50.
- **Acerto e PF caíram ao longo do projeto:** de 66.7 % / PF 4.37 (era 1) para 45.7 % / PF 1.34 (era 4). A queda coincide no tempo com 2026-09-03, quando três mudanças entraram no mesmo dia: regra de saída, fonte de preço gexbot→nt8 e limpeza do ledger. Esse confundimento impede atribuir a causa a qualquer uma delas.
- **Duas quebras de dataset:**
  - Em 2026-09-04, 571 trades $0 foram removidos do ledger de agosto/setembro. A remoção não está documentada e infla o WR "com BE" das eras iniciais.
  - Desde o exec v1 (2026-10-02), um OPEN bloqueado pelo robô some do ledger AOT. Duas ocorrências em 2026-10-05, ambas por `operational_stop`.

## 2. Current Entry Decision Tree
```
[FlowOne / AoMarketDataPublisher (AoTapeEngine)] → SharedState Me/MviDirection_ES/NQ, Press_ES/NQ, LastUpdate_ES/NQ
   → AoGate.EsNq() (AlfaOmegaSharedState.cs:812) → AlfaOmegaBridge :5151 (anchor {dir,strength,why})
   → aot-bff.js buildGate (:829) → gate.anchor → aot-sim.js tick (:247) → entrada (:307-327) → OPEN event (seq) em events-YYYY-MM.jsonl
   → INVICTUS ConsumirEventosAot (AlfaOmegaRobo.cs:683) → Classificar → ProcessarOpen (EventoAot.cs:297: replay/stale 90 s/active_position)
   → ExecutarEntrada (Robo.cs:960): gate global engine_play [BLOQUEIA]; turno/source_readiness/licença [SÓ CONFIRMAÇÃO]
   → por família ES,NQ → por ATIVO habilitado: conta configurada → symbols → nt8_reachable → propfirm_guard → conta observável → já registrada
   → ExecutarAlvo (Robo.cs:1132): proteção pré-trade (stop+take) → AoPermissao (instrumento/qty/max_contracts/position_guard/dedup) → contrato válido
   → ExecutarOrdem (Robo.cs:2410): stop presente → order_name válido → PlaceCore(market, guards requireFlat+maxPositions)
```

## 3. Current Entry Requirements
| ID | Nome | Arquivo:linha | Tipo | Regra | Obrig. | Falha |
|---|---|---|---|---|---|---|
| S1 | ME/MVI ES concordam | SharedState.cs:833-835 | SIGNAL_TRIGGER | esMe≠0 && esMe==esMvi | sim | CLOSED/"ES indefinido" |
| S2 | ME/MVI NQ concordam | idem | SIGNAL_TRIGGER | nqMe≠0 && nqMe==nqMvi | sim | CLOSED |
| C1 | ES×NQ mesmo lado | SharedState.cs:842 | CONFLUENCE | esDir==nqDir | sim | "divergentes" |
| C2 | Força mínima | SharedState.cs:845-851 | CONFLUENCE | \|Press_ES\|≥0.03 && \|Press_NQ\|≥0.03 (MinForce publicado; FlowOne em todos os workspaces = 0.03) | sim | "forca fraca" |
| C3 | Política P1S do Press | AoPressSessao.cs (2026-10-02 / rev 2026-10-05) | DATA_HEALTH (fail-closed sobre C2) | Press só ≠0 com a sessão inteira coberta (ao vivo ou reconstruída), gap ≤300 s | sim | Press=0 ⇒ C2 falha |
| D1 | Tape fresco | SharedState.cs:823-830 | DATA_HEALTH_GATE | LastUpdate ES e NQ <90 s | sim | "sem tape" |
| A1 | strength 4 + dir | aot-sim.js:310 | SIGNAL_TRIGGER | strength===4 && dir LONG/SHORT (redundante com Ok: Ok ⇒ 4 canais iguais) | sim | sem OPEN |
| A2 | Cooldown | aot-sim.js:308 | COOLDOWN | 60 s após a saída (exceto trailing com 4/4) | sim | sem OPEN |
| A3 | Histerese | aot-sim.js:256,309 | DUPLICATE_PROTECTION | strength precisa cair <4 e voltar a 4 (exceto reentrada imediata após trailing) | sim | sem OPEN |
| A4 | Spot válido | aot-sim.js:249,310 | PRICE_FILTER | esSpot e nqSpot finitos >0 (fonte nt8 desde 2026-09-03 22:57Z) | sim | sem OPEN |
| A5 | AOT FLAT | aot-sim.js:307 | POSITION_GATE | side==='FLAT' | sim | sem OPEN |
| A6 | Espelho de execução | aot-sim.js:307,366 | POSITION_GATE (novo, 2026-10-02) | nenhum trade EXIT_PENDING ou divergente | sim | sem OPEN |
| R1 | Evento válido/novo | EventoAot.cs:241 | EXECUTION_READINESS | contrato v1, seq > cursor | sim | ack noop |
| R2 | Não replay | EventoAot.cs:304 | SESSION_GATE | replay=false | sim | OPEN_BLOCKED |
| R3 | Frescor do OPEN | EventoAot.cs:305-307,355 | DATA_HEALTH | idade ≤90 s | sim | OPEN_BLOCKED stale |
| R4 | engine_play | Robo.cs:993,3130 | RISK_GATE | PLAY (fail-closed) | sim | OPEN_BLOCKED operational_stop |
| R5 | ativos | Robo.cs:1035 | ACCOUNT_GATE | ≥1 instrumento da família habilitado | por família | perna pulada |
| R6 | conta configurada + symbols | Robo.cs:1050-1070 | ACCOUNT_GATE | conta do ativo em accounts.json; família autorizada | por perna | account_skip |
| R7 | nt8_reachable | Gates.cs:285 | ACCOUNT_GATE | posições in-process frescas | por perna | account_skip |
| R8 | propfirm_guard | Robo.cs:1092; Gates.cs:364 | RISK_GATE | equity−min(peak−1500, 25000) ≥0; sem contraposição ES/MES ou NQ/MNQ | por perna | account_skip |
| R9 | conta observável | Robo.cs:1110 | EXECUTION_READINESS | hooks de Execution e Order na conta | por perna | account_skip |
| R10 | proteção pré-trade | Robo.cs:1142 | RISK_GATE | stop_level e take_pt válidos | por perna | exec_abort |
| R11 | AoPermissao | Permissao.cs:100-147 | POSITION_GATE / DUPLICATE_PROTECTION | instrumento, qty>0, qty≤max_contracts, position_guard (sem posição/reversão), dedup | por perna | account_skip |
| R12 | contrato válido | Robo.cs:1177 | SESSION_GATE | contrato não vencido | por perna | account_skip |
| R13 | order_name | Robo.cs:2437 (2026-10-06) | EXECUTION_READINESS | ≤50 caracteres, sem colisão de conta | por perna | exec_abort |
| R14 | PlaceCore guards | Robo.cs:2479 | POSITION_GATE | requireFlat, maxPositions = ATIVOS da conta | por perna | place_fail |

Contagem: **sinal/confluência = 7** (S1, S2, C1, C2, C3, D1, A1) · **gates de entrada do AOT = 5** (A2–A6) · **gates de execução do robô = 14** (R1–R14).

## 4. Long Entry
`LONG = esMe=+1 ∧ esMvi=+1 ∧ nqMe=+1 ∧ nqMvi=+1 ∧ fresh(ES,NQ)<90s ∧ |Press_ES|≥0.03 ∧ |Press_NQ|≥0.03 ∧ AOT FLAT ∧ cooldown ∧ armed ∧ spots válidos ∧ ¬execBloqueia` → OPEN LONG → robô: R1–R14 por perna (buy market).
Nota: C2 exige |Press|, não o sinal de Press. Uma pressão de sessão negativa com 4 canais +1 **passa** (CODE_TRUTH, SharedState.cs:845-846).

## 5. Short Entry
Simétrica, com os 4 canais = −1 (sell market). Não existe regra específica de SHORT: o mesmo código serve aos dois lados.

## 6. Sources and Confluences
| Condição | Produtor | Campo | Consumidor | Ausente/stale |
|---|---|---|---|---|
| ME/MVI/Press/LastUpdate | FlowOne.PublishDirBySymbol (FlowOne.cs:4664-4699) **ou** AoMarketDataPublisher/AoTapeEngine (eleição AoPublisher, menor id vence) | AlfaOmegaSharedState.* | AoGate.EsNq | LastUpdate velho ⇒ "sem tape" (fail-closed) |
| MinForce/FreshSec | publicador eleito (FlowOne property 0.03 em todos os workspaces / default 0.03) | AoGate.PublishedMinForce | AoGate.EsNq() | default 0.03/90 |
| anchor | AlfaOmegaBridge.cs:202 (:5151) | anchor.dir/strength/why | aot-bff buildGate | bridge offline ⇒ anchor null ⇒ NEUTRO/0 |
| spot | `:5151` lastPrice (AOT_SIM_PRICE_SOURCE=nt8) | ao.es/nq.lastPrice | aot-sim | 0/NaN ⇒ null ⇒ sem entrada |
| evento | aot-sim outbox → simEmitEvent | events-*.jsonl | INVICTUS | stream offline ⇒ sem abertura |

Nota: Nexus.cs:909 e Pulse.cs:540 também escrevem MeDirection e MviDirection (código legado). Se algum deles está carregado no runtime de hoje é **UNKNOWN**: estado do NT8 não verificado.

## 7. What Does NOT Trigger an Entry
- **Só confirmação:** turno, source_readiness e licença (Robo.cs:1004-1007, `GatesConfirmacao`, OPERATOR_OVERRIDE de 2026-09-30).
- **Só telemetria:** max_risk_usd (Permissao.cs:146), stack_local, aot_referencia, provider_nt8, payload `risco`.
- **Fora da entrada:** a sombra AoGateLocal/motor local (`motor_sombra`, "NAO executada", Robo.cs:643). Também não participam CopilotUnificado (MinForce próprio de 0.05 em alguns workspaces, só painel), gate.open, tapeLive/ready do BFF (o sim usa só o anchor), MenthorQ, TRACE, VolSignals, GexBot e Consolidator.
- **DOCUMENTATION_DRIFT:** o payload diz "anchor 4/4 ES×NQ (AoGate.EsNq) — regra de entrada do aot-sim.js", correto quanto à origem. Já o cabeçalho de aot-sim.js:5 diz "spot de ES/NQ (gexbot)", mas o runtime usa nt8 desde 2026-09-03 22:57Z (prova no ledger: `priceSource`).

## 8. Initial Version
- **INITIAL_ENTRY_BASELINE (código):** `566693a` (aot repo, 2026-07-20 16:39 −03), `aot-sim.js` com a mesma linha de entrada de hoje (L186 ⇔ L310 atual) e os mesmos parâmetros (hardStop 1000, BE 500, step 250/250, cooldown 60, requireFreshFourOfFour).
- **Anchor:** `AoGate.EsNq` com o passo de força foi criado em 2026-07-27 (comentário do FlowOne.cs:1068) com MinForce 0.05.
- **Baseline efetivo dos trades:** o primeiro trade registrado é de 2026-08-03 14:54Z. Antes disso, um bug de tipo de `dir` impedia qualquer abertura (aot-bff.js:850-857, "zero trades gravados" entre 10 e 31/07). Até 2026-08-16 valia MinForce 0.05.

## 9. Entry Logic Change History (funcionais)
| ID | Data efetiva | Evidência | Antes → Depois | Lados |
|---|---|---|---|---|
| CH1 | 2026-07-27 (antes de qualquer trade) | FlowOne.cs:1068; SharedState.cs:812 | anchor do Copilot → AoGate.EsNq 4 passos com força 0.05 | ambos |
| CH2 | 2026-08-16 (data no código; horário exato do F5 UNKNOWN; nenhum trade não-replay entre 08-14 e 08-17) | SharedState.cs:765-772 "era 0.05 ate 2026-08-16" | MinForce 0.05 → **0.03** ("PERMISSIVO", "NAO MEDIDO") | ambos |
| CH3 | 2026-10-02 15:24:03Z (F5 do pacote P1S, CLOSE_DIVERGENCE §AE) · revisão 2026-10-05 (horário UNKNOWN) | AoPressSessao.cs; handoff CLOSE_DIVERGENCE §AB/§AE | Press forward-only desde a carga → **0 salvo sessão inteira coberta** (rev 10-05: reconstrução por histórico) | ambos |
| CH4 | 2026-10-02 (exec v1 JS/BFF; horário exato do restart UNKNOWN; primeiro exec_seq=1 = TEST-RT de 2026-10-02) | aot-sim.js:305-307,366-373 (ausente em bak-prefix-20261001) | nova condição `!execBloqueiaEntrada()` | ambos |

**TOTAL_FUNCTIONAL_ENTRY_CHANGES = 4** (3 depois do primeiro trade). FIRST = 2026-07-27 · LAST = 2026-10-05 (rev. CH3).
**Saída (não é entrada, mas afeta reentrada e performance):**
- EX1, 2026-09-03 ~15:57Z (`bak-anchorneutro-20260903-125717`): NEUTRO "forca fraca" e "sem tape" deixam de fechar.
- EX2, 2026-09-03 ~17:49Z (`bak-indefinido-…144920`): "indefinido" também deixa de fechar.

## 10. Initial vs Current Matrix
| Requisito | Início (08-03) | Hoje | Igual? | Quando mudou |
|---|---|---|---|---|
| 4 canais ME/MVI alinhados | sim | sim | SIM | — |
| frescor 90 s | sim | sim | SIM | — |
| força mínima | 0.05 | 0.03 | NÃO | CH2 08-16 |
| validade do Press | forward-only desde a carga | P1S sessão completa | NÃO | CH3 10-02/10-05 |
| strength 4 + dir / cooldown 60 / histerese / spot válido | sim | sim | SIM | — |
| fonte do spot | gexbot | nt8 | NÃO (fonte de dado) | 09-03 22:57Z |
| bloqueio por execução | não existia | `execBloqueiaEntrada` | NÃO | CH4 10-02 |
| robô executa | (robô com motor local; INVICTUS seguidor canônico só a partir de 10-01) | seguidor do evento AOT | NÃO (arquitetura) | 2026-10-01 sync total |

**ENTRY_LOGIC_SAME_AS_INITIAL = NO.**

## 11. Technical Fixes That Did NOT Change Entry Logic
- **BUG_FIX:** tipo de `dir` (07-31) — habilitou entradas sem mudar a regra; validPx/preço 0 (09-16).
- **DATA_PIPELINE:** AoPublisher publicador único (08-19); price source gexbot→nt8 (09-03); Fita ES/NQ AoTapeGen (§50); Press warmup/tape (handoff §50).
- **OBSERVABILITY:** `open` exigindo direção (08-18, sem efeito no sim) e `why` exposto (08-18).
- **ACCOUNT / ORDER_NAME / UI / HEALTH:** CONTA≠ROBÔ (§42–49), ORDER_NAME (10-06), contas universais, Control Center.
- **ROBÔ (gates de execução, não de sinal):** RTH_ONLY (2026-09-14) revogado e turno/readiness/licença viram confirmação (2026-09-30); EQUITY_GUARD (10-02); canonical sync (10-01).

## 12. AOT SIM Dataset Audit
- **Fonte e cobertura:** `C:\Users\ADM\.claude\aot\history\trades-2026-0{8,9}.jsonl`, `trades-2026-10.jsonl`. São 610 linhas, schema 1, 0 linhas tortas, 0 ids duplicados. Primeira abertura 2026-08-03T14:54:03Z, último fechamento 2026-10-06T12:57:19Z.
- **Exclusões (regra do BFF):** 2 replay; 12 com preço inválido (regra + manifesto de 7); 31 da sessão overnight de 13/09 (manifesto). **Oficial = 566. Válido incluindo overnight = 596.**
- **Fonte de preço:** gexbot (216) até 2026-09-03 22:57Z; depois nt8 (394).
- **Parâmetros:** iguais nos 610 registros.
- **LEDGER MUTATION (não documentada):** `_backups/trades-2026-0{8,9}.jsonl.bak-pre-limpeza-20260904-154559` tinha 801 linhas, das quais **571 foram removidas**. Todas eram anchor_neutro $0 (gexbot), de 08-03 a 09-03, com líquido removido $0.00. Nenhum handoff ou registro explica a limpeza. O WR "com BE" das eras 1 e 2 cai a ~18.6 % e ~16.6 % se esses BE forem contados. P&L e WR sem BE não mudam.
- **LOGIC BREAK (exec v1):** um OPEN com OPEN_BLOCKED volta a FLAT **sem trade no ledger** (aot-sim.js:398-402). Em 10-05, 13:50:30Z e 23:46:49Z, houve 2 OPEN SHORT bloqueados por `operational_stop` (exec_seq 15 e 32), ausentes do ledger. Desde 2026-10-02, o AOT SIM deixou de ser independente do PLAY do robô.
- **Eventos de teste:** 6 OPEN/CLOSE `TEST_RT_VALIDATION_SIM101` em 10-02 no log canônico, fora do ledger de trades.
- **Dias úteis sem trade:** 08-12, 08-21, 08-26, 08-29, 10-02, entre outros. O ledger de saúde guarda transições, não uptime, então não dá para distinguir "zero sinal" de "BFF/NT8 parado": **UNKNOWN**.

## 13. AOT SIM Lifetime Performance (oficial, n=566)
- **Resultado:** W 298 · L 267 · BE 1 · WR 52.7 % (loss 47.2 %).
- **Fluxo:** bruto +$100,156.00 / −$55,513.40 · líquido **+$44,642.60** · média $78.87.
- **Por trade:** avg win $336.09 / avg loss −$207.92 · PF **1.80** · max win $4,050 / max loss −$1,877.50.
- **Sequências e drawdown:** consecutivos 14 W / 6 L · **max DD $5,467.50** · pico = final = $44,642.60.
- **LONG** (342): WR 54.5 % · +$33,483.10 · PF 2.04.
- **SHORT** (224): WR 50.0 % · +$11,159.50 · PF 1.48 · DD $6,692.50.
- **Pernas:** ES +$9,545.00 · NQ +$35,097.60. AOT é sempre a cesta 1 ES + 1 NQ; MES, MNQ, NES e NNQ não existem no AOT SIM.
- **Saídas:** anchor_neutro 598 · trailing_nq 8 · hard_stop_nq 3 · hard_stop_es 1 (linhas brutas).
- **Com overnight 13/09** (n=596): WR 51.4 % · +$43,577.60 · PF 1.70 · DD $6,412.50.

## 14. AOT SIM Performance Timeline
Diário completo: `node aot_audit.js daily` (44 sessões). Acumulado:
| Data | Acumulado |
|---|---|
| 08-05 | +11,441 |
| 08-20 | +25,003 |
| 08-28 | +29,486 |
| 09-09 | +29,648 |
| 09-16 | +32,325 |
| 09-24 | +41,333 |
| 09-29 | +39,013 |
| 10-01 | +44,073 |
| 10-06 | +44,643 |

O ganho se concentra em 08-04 a 08-20 (+$25,003 em 12 sessões). Depois de 09-03 o crescimento é mais lento e mais volátil: o pior DD diário é $5,467.50 em 09-29.

## 15. Performance by Entry-Logic Era (fronteiras = ativação efetiva)
| Era | Janela | n | WR (sem BE) | Líquido | PF | Avg | DD | Duração média |
|---|---|---|---|---|---|---|---|---|
| E1 MinForce 0.05 | 08-03 → 08-16 | 90 | 66.7 % | +18,354.70 | 4.37 | 203.94 | 696.70 | 55 s |
| E2 MinForce 0.03 | 08-16 → 09-03 15:57Z | 120 | 63.3 % | +11,595.30 | 2.60 | 96.63 | 1,620.90 | 82 s |
| E2b | 09-03 15:57Z → 22:57Z (EX1/EX2, gexbot) | 1 | 0 % | −19.90 | — | — | — | — |
| E3 saída nova + spot nt8 | 09-03 22:57Z → 10-02 15:24Z | 340 | 45.7 % | +14,142.50 | 1.34 | 41.60 | 5,467.50 | 298 s |
| E4 P1S + exec v1 | 10-02 15:24Z → fim | 15 | 46.7 % | +570.00 | 1.44 | 38.00 | 665.00 | 480 s |

## 16. Accuracy Evolution
**WIN_RATE_EVOLUTION = REGRESSION:** 66.7 → 63.3 → 45.7 → 46.7 %, sem BE. Contando os BE removidos na limpeza, o WR de E1 e E2 seria ~18.6 % e ~16.6 %, o que inverte a leitura. Por isso o WR das eras iniciais **não é comparável** com o de E3 e E4 sem essa ressalva.

## 17. Profitability Evolution
**PNL_EVOLUTION = POSITIVE_BUT_DECELERATING:**
- **Expectativa por trade:** cai $203.94 → $96.63 → $41.60 → $38.00.
- **PF:** cai 4.37 → 2.60 → 1.34 → 1.44.
- **Drawdown:** sobe $697 → $1,621 → $5,468.

O acumulado continua positivo em todas as eras. **WIN_RATE_AND_PNL_AGREE = YES** (ambos pioram), com o acumulado ainda crescendo.

## 18. Before/After Entry Changes (correlação ≠ causa)
| Mudança | Antes → depois | TEMPORAL_ASSOCIATION |
|---|---|---|
| CH2 (0.03) | n 90 → 120 · WR 66.7 → 63.3 · avg 204 → 97 · PF 4.37 → 2.60 | NEGATIVE_AFTER_CHANGE (amostra modesta; mercado diferente) |
| EX1/EX2 + spot nt8 (09-03, mesmo dia, confundidos) | WR 63.3 → 45.7 · PF 2.60 → 1.34 · duração 82 → 298 s | NEGATIVE_AFTER_CHANGE, sem atribuição possível: a saída nova, a fonte de preço nova e a limpeza do ledger coincidem |
| CH3 + CH4 (10-02) | n 15 · WR 46.7 · PF 1.44 | INSUFFICIENT_SAMPLE. Além disso, o ledger da era passou a excluir OPENs bloqueados |

## 19. Findings
1. **CURRENT_CODE_TRUTH:** sinal = AoGate.EsNq 4/4 + força 0.03, com Press P1S. O AOT SIM acrescenta cooldown, histerese, spot válido e o espelho de execução. O INVICTUS só segue o OPEN e executa sob 14 gates. Hoje, só `engine_play` bloqueia globalmente.
2. **DOC_CODE_MISMATCHES:**
   - (a) cabeçalho do aot-sim diz preço gexbot; o runtime é nt8;
   - (b) o comentário de 09-03 cita "780 trades / 567 em $0", mas o ledger atual tem 201 em agosto, por causa da limpeza não documentada;
   - (c) aot-sim.js:4 "~20s/poll" não foi verificado;
   - (d) o cabeçalho de 07-18 diz "Saída quando anchor.dir=NEUTRO", superado pelo EX1/EX2 (o próprio arquivo documenta).
3. **AOT_SCHEMA_OR_LOGIC_BREAKS:** limpeza de 2026-09-04 (−571 linhas $0); price source 09-03; exec v1 (OPEN_BLOCKED some do ledger); trade_id só a partir de 2026-10-01 17:48Z.
4. **UNKNOWN_PERIODS:** antes de 08-03 (0 trades por bug); dias úteis sem trade; horário exato do F5 do CH2, do restart do BFF (CH4) e da rev. 10-05 do CH3; qual publicador estava eleito em cada período; se Nexus ou Pulse estavam carregados.
5. **Leituras negadas:** nenhuma nesta sessão. Estado vivo do NT8 (gráficos carregados, publicador eleito) não foi consultado: UNKNOWN.

## 20. Final Verdict
- **Lógica e evolução:** a lógica de entrada mudou 4 vezes em termos funcionais (CH1–CH4); a linha do aot-sim é a mesma desde 07-20. A performance do AOT SIM regrediu em acerto e expectativa a partir de 08-16 e sobretudo de 09-03, mas segue com P&L acumulado positivo.
- **Atribuição:** a queda de 09-03 coincide com 3 mudanças simultâneas (saída, fonte de preço, mutação do ledger), então não é atribuível a nenhuma delas isoladamente.
- **Força da evidência:** **EVIDENCE_STRENGTH = MEDIUM**. Código e ledger são fortes; a ativação horária e as mutações do dataset são fracas.

## 21. Session State (525eba2d, rotation handoff)
- Mission state: review COMPLETE (sections 1–20). Only this file was written; it is untracked and not committed.
- Modified/untracked files: same as the rotation brief's git status. No code, config, PLAY, ATIVOS or account changes; 0 orders; no F5; no commit; no push.
- Tests run: none (read-only review). Metrics script: scratchpad 525eba2d `aot_audit.js` (read-only).
- Exact next step: wait for the operator's next explicit order (e.g. commit/push this review, or investigate the UNKNOWN items in §19.4).
