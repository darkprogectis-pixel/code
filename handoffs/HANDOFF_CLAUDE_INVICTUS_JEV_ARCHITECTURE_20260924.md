# HANDOFF — INVICTUS JEV CODE · FRENTE B · ARQUITETURA FINAL (24/09/2026)

| | |
|---|---|
| FRENTE | B (arquitetura), assumida pelo Claude Code após o Kimi K3 bater o limite de 5 h |
| PRODUTO | **INVICTUS JEV CODE** |
| STATUS | **COMPLETE**, somente arquitetura |
| IMPLEMENTAÇÃO | **NOT STARTED**: aguarda a consolidação com o handoff do Codex (Frente A), que **já existe** (`HANDOFF_CODEX_INVICTUS_JEV_UI_20260924.md`) e foi lido para alinhar as interfaces |
| PARTIDA | commit `bf09de6`: Runtime V1, Live Input Adapter, Bridge `:3590`, Control Center web, AddOn source |
| EXECUÇÃO REAL | não habilitada nesta fase; nada instalado no NT8; sem F5; produção intocada |

**Evidência lida (read-only):**
- repositório JEV (`src/jev`, `nt8`, `config`, `test`, `handoffs`);
- Invictus: `Downloads/AlfaOmega-INVICTUS-Standalone/` (README, MANIFESTOs), `NinjaTrader/AlfaOmega_INVICTUS_import_20260916.zip`, extraído só no scratchpad (51 fontes; li cabeçalhos de todos e trechos-alvo de `AlfaOmegaRobo`, `AlfaOmegaTrader`, `AoTraderCore`, `AoRoboGuard`, `AlfaOmegaRoboPositions`, `AlfaOmegaRoboOrderState`, `AlfaOmegaRoboDedup`, `AlfaOmegaRoboRelay`, `AlfaOmegaRoboAudit`, `AoControlCenter`);
- `Downloads/AlfaOmega-INVICTUS/` tem só zips antigos/backup (não lidos além do manifesto);
- `Documents/New project/invictus-p01-20260915/` é relatório de instalação (não necessário).

Nada do Invictus foi copiado, instalado ou alterado.

---

## 1. Princípios (invariantes do produto)

1. **Um cérebro.** O JEV Shared Engine (`src/jev/engine.mjs`) é o único produtor de análise. O Analyzer **exibe** o snapshot; o Robot **consome** o mesmo snapshot (mesmo `snapshot_id`). Nenhuma UI, agente ou executor recalcula contexto.
2. **Separação de camadas:** ANALYSIS (engine) → DECISION (política do robô) → RISK (pré-trade + hard guards) → EXECUTION (NT8). Cada camada só lê a anterior.
3. **O executor no NT8 é "burro":** executa uma intenção já decidida e aplica as travas finais. A política fica fora do NT8 (mudar política ≠ F5). Padrão Invictus: `AlfaOmegaTrader` é "BURRO e SÍNCRONO".
4. **Fail-closed para abrir risco; fail-soft para análise.** Falta de dado ⇒ análise UNKNOWN/DEGRADED (segue rodando); para o robô ⇒ nenhuma entrada nova. Saídas de proteção nunca dependem de dado de análise.
5. **Robô OFF por padrão, e nunca restaurado ON** após restart, F5 ou restore de workspace.
6. **Agente externo é opcional:** advisory / explanation / memory / enrichment, fora do caminho crítico.
7. **Sem estratégia inventada.** A arquitetura define o encanamento; regras de entrada e parâmetros de risco exigem pré-registro e ordem do operador. Enquanto não existirem, o robô **não consegue** ligar.

## 2. Diagrama

```
  REAL MARKET DATA (relay GammaGex 127.0.0.1:3457 /gexbot/*, read-only)
        │
        ▼
 ┌───────────────────────── P1 · ijc-engine (Node, processo único) ─────────────────────────┐
 │ LIVE INPUT ADAPTER ─► JEV SHARED ENGINE ─► JEV STATE (snapshot_id, output, audit)         │
 │                                              │                                             │
 │                    ┌─────────────────────────┴──────────────┐                              │
 │                    ▼                                        ▼                              │
 │         BRIDGE :3590 (GET/HEAD)                 ROBOT CORE (Node)                          │
 │         /jev/v1/{state,output,audit,            DECISION ─► RISK(pré-trade) ─► INTENT QUEUE │
 │          health,robot}                                      │                              │
 │                                               CONTROL PLANE :3591 (loopback + token,       │
 │                                               só executor; pull de intents + reports)      │
 └────────────┬──────────────────────────────────────────────┬─────────────────────────────┘
              │ GET (poll)                                    │ GET intents / POST reports (token)
              ▼                                               ▼
 ┌──────────────────────── P2 · NinjaTrader 8 (AddOn InvictusJevCode) ─────────────────────────┐
 │ CONTROL CENTER window (NTWindow): Analyzer · Robot · Details · Settings · Logs              │
 │ ROBOT EXECUTOR (thread dedicada): hard guards ─► CreateOrder/Submit ─► OrderState ─► Ledger  │
 │ NT8 events (OrderUpdate/ExecutionUpdate/ConnectionStatusUpdate) ─► fila ─► executor          │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
              ▲ GET (opcional)
 ┌──────── P3 · ijc-agent-gateway (Node, OPCIONAL) ────────┐
 │ lê :3590 (GET) → LLM/providers/canais → notas advisory   │   nunca fala com :3591, nunca vê conta/ordem
 │ expõe :3592 GET /agent/v1/{health,notes}                 │
 └──────────────────────────────────────────────────────────┘
```

## 3. Componentes, namespaces e localização

| Componente | Onde | Namespace / módulo | Existe hoje? |
|---|---|---|---|
| **InvictusJevCode.Engine** | P1 | `src/jev/engine.mjs` + `ingest/normalize/quality/rules/native/spx/output` (nomes canônicos JEV **mantidos**) | sim (Runtime V1) |
| **InvictusJevCode.Bridge** | P1 | `src/jev/adapters/*` (live input) + `src/jev/bridge/*` (`:3590`) | sim |
| **InvictusJevCode.Robot** (core) | P1 | `src/ijc/robot/{decision,risk,state-machine,intents,control-plane,ledger}.mjs` | não |
| **InvictusJevCode.Robot** (executor) | P2 | `NinjaTrader.NinjaScript.AddOns.InvictusJevCode.IjcExecutor` + peças puras `IjcOrderState`, `IjcDedup`, `IjcGuard` | não |
| **InvictusJevCode.AddOn** | P2 | `NinjaTrader.NinjaScript.AddOns.InvictusJevCode.IjcAddOn : AddOnBase` | preliminar (`nt8/AddOns/JevControlCenter.cs`) |
| **InvictusJevCode.ControlCenter** | P2 (+ web P1) | `IjcControlCenterWindow : NTWindow` (tabs) · web `src/jev/bridge/control-center.html` | preliminar |
| **InvictusJevCode.Analyzer** | P2/P1 | renderer das abas Analyzer/Details sobre `jev-panel/v1` (`panel-model.mjs`) | sim (modelo), UI a consolidar |
| **InvictusJevCode.AgentGateway** | P3 | `src/ijc/agent-gateway/*` (sidecar) | não |

**Regras de namespace/diretório (evitam mistura com o Invictus):**
- **C#:** tudo em `NinjaTrader.NinjaScript.AddOns.InvictusJevCode`, prefixo de tipo `Ijc`. Nenhum tipo `Ao*`/`AlfaOmega*`, nenhuma dependência de `AlfaOmegaSharedState`. Sub-namespace a confirmar no compile-check (fallback: prefixo `Ijc` direto em `...AddOns`).
- **Instalação futura:** `bin\Custom\AddOns\InvictusJevCode\`.
- **Dados do NT8:** `UserDataDir\invictus-jev-code\{config,state,logs}`; **nunca** em `bin\Custom` (padrão Invictus).
- **orderName do robô:** prefixo **`IJC|`** (com pipe; comparação `Ordinal`). É distinto de `AO|` do Invictus: um produto nunca reconhece a ordem do outro como sua.
- **Portas:** `:3590` bridge (existe), `:3591` control plane, `:3592` agent gateway. Nenhuma coincide com `:3457`, `:3500`, `:3530`, `:5151` ou `:5152` do ecossistema atual.

## 4. Interfaces

| Interface | Direção | Transporte | Contrato |
|---|---|---|---|
| Live input | relay → P1 | HTTP GET loopback | `jev-input/v1` (existe) |
| Engine output | P1 interno | memória | `jev-output/v1` + `audit` (existe) |
| **State bus** | P1 → P2/P3/web | `:3590` GET/HEAD | `jev-panel/v1` (existe). **Adições aditivas propostas:** `snapshot_id`, `robot.{execution,strategy,position,executor_heartbeat}` (hoje `NOT_REPORTED`), `agent.status` (hoje `NOT_REPORTED`) |
| **Robot control plane** | P2 ⇄ P1 | `:3591` loopback, header `X-IJC-Token` (arquivo gerado no 1º boot em `UserDataDir`, ACL do usuário) | `GET /robot/v1/intents?after=<seq>` · `POST /robot/v1/report` (heartbeat, estado do executor, order/fill events, posição reconciliada) · `POST /robot/v1/enable-request` · `POST /robot/v1/disable` · `POST /robot/v1/emergency` |
| Agent | P3 → P1 | `:3590` GET | só leitura do state bus |
| Agent status/notes | P2 → P3 | `:3592` GET | `agent-status/v1`, `agent-notes/v1` (advisory, rotulado) |

**Por que "pull" do executor e não um listener no NT8** (difere do `:5152` do Invictus): um listener dentro do NT8 já causou sockets em CLOSE_WAIT e threads presas no boot (incidente Invictus 03/08, mitigado depois com ready-gate). No pull, o NT8 só abre conexões de saída curtas (`HttpWebRequest` por chamada, `Proxy=null`), controla a própria cadência e não expõe porta que outro processo local possa usar para disparar ordem.

## 5. Processos, threads e isolamento (J)

**P1 · ijc-engine (Node, single process):**
- o laço live (existente) e o Robot Core rodam no mesmo event loop;
- o Robot Core consome o **objeto do snapshot recém-produzido** (sem segunda leitura);
- os servidores `:3590` e `:3591` escutam só em loopback;
- nenhuma operação síncrona longa; a escrita de audit é bufferizada.

**P2 · NT8 (AddOn):**

| Thread | Faz | Nunca faz |
|---|---|---|
| UI (Dispatcher da janela) | renderiza o último snapshot imutável | I/O de rede, `lock(Account.All)`, ordem |
| `Ijc.StatePoll` (background, `IsBackground=true`) | GET `:3590/jev/v1/state` com timeout de 2 s, depois `Dispatcher.InvokeAsync(render)` | tocar conta/ordem |
| `Ijc.Executor` (thread dedicada, nunca `Timer`, padrão Invictus) | ciclo: ready-gate → poll de intents → travas → submit → processar a fila de eventos → report | UI/Dispatcher |
| threads de evento do NT8 (`OrderUpdate`, `ExecutionUpdate`, `ConnectionStatusUpdate`) | copiam **primitivos** para uma `ConcurrentQueue` | lógica, lock longo, I/O |

**Regras do NT8 (Invictus, medidas):**
- `lock(Account.All)` no máximo **uma vez por ciclo** e só para copiar (medido 10–22 s de contenção quando abusado);
- ready-gate por latch `Account.All.Count` lido **sem lock**;
- `Terminated` para as threads e faz flush do audit (F5 descarrega o assembly).

**P3 · agent gateway:** processo separado. Se travar ou cair, nada em P1 ou P2 espera por ele.

## 6. Ciclo de vida (A, B, O)

**A · AddOn:** `IjcAddOn.OnStateChange(SetDefaults)` só define nome e descrição, sem I/O.

**B · Control Center:** `OnWindowCreated(ControlCenter)` adiciona **New → INVICTUS JEV CODE** e chama `IjcRuntime.Start()`, que é idempotente (guarda `_running`; dispara uma vez por janela) e segue o padrão `AlfaOmegaRobo.Start`. `OnWindowDestroyed` remove o menu. `State.Terminated` chama `Stop()`:
1. sinaliza as threads;
2. join com timeout;
3. flush do audit;
4. robô ⇒ OFF (persistido OFF).

**O · Startup (ordem fixa):**
1. P1: carrega a config; artefatos com invariantes FATAL (existente); robô = OFF; sobe `:3590`; sobe `:3591` (gera o token se ausente); inicia o laço live.
2. P2: `Start()`; carrega a config/estado de `UserDataDir`; robô **sempre OFF**; inicia StatePoll. O Executor espera o ready-gate e depois faz a **reconciliação** (§11) antes do primeiro report `EXECUTOR_READY`.
3. P3 (opcional): sobe e se registra só pelo próprio `/agent/v1/health`.

**O · Shutdown:**
- **P2:** executor para de puxar intents; ordens de proteção **ficam no broker** (não se cancela stop ao fechar o NT8); flush.
- **P1:** robô OFF; fecha servidores.

Fechar a janela do Control Center encerra só o poll da janela; engine, bridge e executor seguem.

## 7. Analyzer e Control Center (C, B)

A especificação visual é a do Codex, que prevalece sobre qualquer outra: NTWindow 480×960 (mín. 400×640); status ENGINE / LIVE DATA / JEV AGENT / ROBOT; abas Analyzer / Robot / Details / Settings / Logs; card Robot fixo `[OFF | ON]` com ON travado; sem BUY/SELL, sem probabilidade.

**Arquitetura do renderer:**
- **Um snapshot por render.** O poll entrega `jev-panel/v1` imutável e todas as áreas renderizam do mesmo objeto (nunca misturar ciclos).
- **Três eixos independentes:** transporte (bridge OK/OFFLINE), qualidade (VALID/DEGRADED/DATA_INVALID) e contexto (enum). Em OFFLINE, mostra o **último conhecido atenuado + timestamp**; nunca apresenta UNKNOWN falso.
- **Fallback honesto:** campo ausente ⇒ "—" / NOT_REPORTED. Nada inferido: o agente não aparece ONLINE só porque o ENGINE está vivo.
- **Painel principal limpo** (invariante Invictus `AoControlCenter`): telemetria técnica em Details/Logs, e alarmes só enquanto a falha existe.

**Web Control Center:** mesmo `jev-panel/v1`, somente leitura. **Não tem** controle de robô (a autoridade de ON é só a janela do NT8; ver §9).

**Correções obrigatórias no AddOn preliminar antes de qualquer instalação:**
1. trocar o `HttpClient` estático por `HttpWebRequest` por chamada com `Proxy=null`, padrão `AoRoboRelay`/`AoExecClient` (o Invictus registra um incidente de socket preso com `HttpClient` estático no NT8);
2. adotar o parse numérico invariante de cultura (lição `AoJsonNum`, máquina pt-BR);
3. renomear para INVICTUS JEV CODE e aplicar o layout do Codex;
4. registrar exceções de render em arquivo com limite de taxa (padrão `AoDiag`), porque `Print` não persiste.

## 8. Integração com o Shared Engine (D) e Live Bridge (E)

- **D:** o Robot Core registra um callback no `onCycle` do laço live (o mesmo que atualiza a bridge). Recebe `{snapshot_id, output, audit}` e **não pode** chamar o engine nem ler `/state`. O engine não conhece o robô.
- **`snapshot_id`:** `<evaluated_at>#<cycle>`, que já é derivável e passaria a ser publicado no panel. Toda intenção carrega o `snapshot_id` de origem e é auditável até o input.
- **E:** o Live Input Adapter é mantido como está (read-only, 15 rotas, fail-soft, FROZEN). A bridge `:3590` continua **GET/HEAD-only**, e o control plane é um servidor separado (princípio de isolamento de privilégio do Invictus: porta e arquivo separados para leitura e para ordem).

## 9. Robot (F, G, R, S)

### 9.1 Camadas

| Camada | Onde | Entrada → saída | V1 |
|---|---|---|---|
| ANALYSIS | engine | market data → `jev-output/v1` | existe |
| DECISION | `src/ijc/robot/decision` | snapshot → `Intent{intent_id, snapshot_id, action ∈ {ENTER_LONG, ENTER_SHORT, EXIT_OWNED, NONE}, instrument, qty, reason_codes, expires_at}` | **só `NONE`**: não há regra de lado ativa nem política de execução pré-registrada. LONG_CONTEXT **não** implica entrada: exige política própria |
| RISK (pré-trade) | `src/ijc/robot/risk` | intent + estado do executor + config → aprovada / recusada com motivo | implementado como verificador; recusa tudo enquanto parâmetros UNSET |
| EXECUTION | NT8 `IjcExecutor` | intent aprovada → ordens reais + eventos → reports | encanamento sem caminho de submit habilitado até a fase de execução |

### 9.2 Máquina de estados do robô (R)

```
OFF ──(ON no NT8)──► ENABLE_REQUESTED ──(prechecks OK)──► ARMED ──(safeguard)──► HALTED
 ▲                        │ (qualquer precheck falha)        │ (OFF operador)       │ (só operador)
 └────────────────────────┴──────────────────────────────────┴──────────────────────┘
EMERGENCY_STOPPED: alcançável de qualquer estado; saída só por OFF explícito + nova habilitação
```

- **Posição é um eixo separado do modo:** `FLAT | ENTRY_PENDING | IN_POSITION | EXIT_PENDING | UNKNOWN_RECONCILING`.
- **Nunca "ON otimista":** a UI só mostra ON quando o executor reporta `ARMED` confirmado pelo core (spec Codex).
- **HALTED nunca re-arma sozinho.**

### 9.3 Sequência de habilitação

Todos os passos são obrigatórios; qualquer falha ⇒ OFF com motivo exibido. Só a janela do NT8 pode pedir ON: nunca web, agente, API ou restore de workspace.

1. **L0 build:** `JEV_CAN_SEND_ORDER` é **constante**; no V1 vale `false` ⇒ ON impossível. Mudá-la exige editar código, revisar e obter ordem.
2. **L1 kill file:** `config/robot.kill` ausente, verificado em P1 **e** P2.
3. **Política de execução pré-registrada presente** (regra(s) de lado ativas + mapeamento contexto→ação). Hoje há 0 ⇒ ON impossível.
4. **Parâmetros de risco todos definidos** (§10). Qualquer `UNSET` ⇒ recusa.
5. **Conta com `Account.Provider ∈ {Simulator, Playback}`** (trava hard-coded, §10.1). Conta live exige fase e decisão próprias.
6. **Executor:** ready-gate OK, conexão `Connected`, reconciliação concluída sem órfãs pendentes, heartbeat recente.
7. **Engine:** último ciclo < 2× intervalo; `data_quality ≠ DATA_INVALID`; fonte FR_ROOT_ORDERFLOW não FROZEN/STALE; sessão permitida (RTH por padrão).
8. **Confirmação explícita do operador** no diálogo (conta, instrumento, qty máxima, modo sim).

Só então: `ARMED`.

### 9.4 Desabilitação e emergência (S)

- **OFF (operador):**
  - para de aceitar intents novas, com efeito imediato no core e no executor;
  - intents ainda não submetidas são descartadas;
  - **posição aberta não é fechada automaticamente**; o stop de proteção permanece (padrão Invictus: STOP só inibe entradas);
  - fechar posição é um comando separado.
- **EMERGENCY (botão distinto e o kill file):**
  1. OFF;
  2. cancela ordens de **entrada** working com prefixo `IJC|`;
  3. mantém as ordens de proteção.
  O **flatten de posição própria por propriedade** é uma **opção configurada antes da habilitação** (`emergency_flatten_owned: true|false`, sem default ⇒ bloqueia o enable). Nunca `Account.Flatten`, nunca fecha ordem ou posição manual.
- **Kill file:** criar `config/robot.kill` (P1 ou P2) produz o mesmo efeito de EMERGENCY no próximo ciclo (≤ 1 s no executor).

## 10. Risk safeguards (H)

**Pré-trade (core) e hard guard (executor): as duas camadas checam.**

| Salvaguarda | Regra | Origem do padrão |
|---|---|---|
| Conta de simulação | ordem `IJC|` só em `Provider ∈ {Simulator, Playback}`, **hard-coded e não configurável**; cascata fail-closed (conta nula ou exceção ⇒ recusa); JSON só como 2ª checagem | `AoRoboGuard` (versão original de 18/08; **não** a versão reduzida de 03/09) |
| Propriedade de ordem | orderName `IJC|<intent_id>`, `StartsWith("IJC|", Ordinal)` | `AoRoboOrderState` (armadilha `AO` × `AoBoleta`) |
| Propriedade de posição | ledger persistido `{conta, instrumento, lado, qty, intent_id, order_ids}`; o robô só fecha o que abriu | `AlfaOmegaRoboSaida` |
| Duplicidade | `intent_id` determinístico (`snapshot_id + policy_rule + instrument + action`); dedup **persistido** por sessão ET; `clientOrderId` único ⇒ 409 no reenvio | `AlfaOmegaRoboDedup`, `AlfaOmegaTrader` |
| JEV stale | intent expira (`expires_at` ≤ 2 ciclos); o executor recusa intent vencida; ciclo do engine atrasado ⇒ HALTED | novo (TTL de intent) |
| Data quality | DECISION só roda com `data_quality ≠ DATA_INVALID`; DEGRADED na dimensão exigida pela política ⇒ `NONE`; a fonte FROZEN bloqueia entrada | `AlfaOmegaRoboFontes` (SOURCE_READINESS: bloqueia **só entradas**) |
| Sessão | RTH por padrão (`session_policy` exigido); `session_close_owned: flatten|keep` **sem default** | `AlfaOmegaRoboTurno` |
| Máximos | `max_position_contracts` por instrumento, `max_open_positions`, `max_orders_per_session`, `max_entries_per_session`, `max_daily_loss_usd`: **todos obrigatórios, sem default** | `requireFlat` / `maxPositions` do `AlfaOmegaTrader` |
| Proteção pós-fill | proteger a **qty executada** após fill real; parcial ⇒ ajustar a qty das pernas via `Account.Change`, nunca empilhar bracket; OCO por `intent_id`. Os **valores** de stop/alvo vêm da política pré-registrada | `AoProtecaoFill` (padrão; valores **não** reutilizados) |
| Stop de infraestrutura | toda entrada nasce com StopMarket broker-side, para o NT8 cair protegido | padrão Invictus |
| Órfãs | ordem `IJC|` sem registro no ledger ⇒ **órfã**: entrada ⇒ cancelar; proteção ⇒ manter + alerta; posição sem ordem de proteção ⇒ HALTED + alerta | `AlfaOmegaRobo` (órfãs) |
| Ponto único de submissão | `IjcExecutor.Submit` é o **único** caminho até `CreateOrder` (verificado por teste de busca no código) | `AoTraderCore` |

## 11. Sincronização de estado, reconexão, persistência, saúde e falhas (I, K, L, M, N, P, Q)

**I · Donos do estado (um dono por fato):**

| Fato | Dono | Outros só leem |
|---|---|---|
| contexto / qualidade / razões | engine (P1) | UI, robô, agente |
| intent, modo do robô | Robot Core (P1) | UI (via panel), executor (pull) |
| ordens, fills, posição real | **NT8 / broker via executor (P2)** | core (via report), UI |
| ledger de propriedade | executor (P2, persistido) | core (espelho via report) |
| notas de agente | gateway (P3) | UI (rotulado advisory) |

- O core nunca "acredita" em posição própria: usa a última posição **reportada e reconciliada**.
- Divergência entre core e executor ⇒ `UNKNOWN_RECONCILING` ⇒ HALTED.

**L · Reconexão:**

| Evento | Reação |
|---|---|
| `ConnectionStatusUpdate ≠ Connected` | executor: HALTED_DISCONNECTED, nenhuma submissão |
| Volta da conexão | **reconciliação obrigatória**: ler ordens e posições `IJC|` → comparar com o ledger → classificar órfãs → report. Só então aceita re-arme, feito **pelo operador** |
| Relay offline | engine DATA_INVALID/UNKNOWN (existente) ⇒ DECISION `NONE`; as proteções ficam no broker |
| `:3591` inacessível | executor não recebe intents (seguro); o core marca o executor sem heartbeat ⇒ HALTED |
| `:3590` inacessível | UI OFFLINE com último conhecido; o executor **não** depende do `:3590` |

**K · Modos de falha:**

| Falha | Resultado |
|---|---|
| P1 cai | sem intents; ordens de proteção no broker; UI OFFLINE; robô reinicia OFF |
| P2/NT8 cai ou F5 | threads param; o ledger está em disco; ao voltar: OFF + reconciliação (dedup persistido impede reabrir intent executada) |
| P3 cai | JEV AGENT = NOT REPORTED; nada mais muda |
| Internet cai | relay/vendor param ⇒ análise DEGRADED/INVALID ⇒ `NONE`; agentes remotos param; o produto segue |
| Relógio / ts inválido | freshness UNKNOWN (existente) ⇒ `NONE` |
| Disco cheio | audit descarta o mais antigo e conta (`Dropped`); nunca bloqueia decisão (padrão `AoRoboAudit`) |
| Exceção no executor | registrada; o ciclo continua; 3 exceções seguidas ⇒ HALTED |

**M · Log / audit:**
- **P1:** audit por ciclo (existe) + `robot-audit-YYYY-MM.jsonl` (intents, decisões de risco, mudanças de modo).
- **P2:** `executor-audit-YYYY-MM.jsonl`: bufferizado, **flush imediato** para eventos de ordem, fila limitada, rotação mensal (padrão `AoRoboAudit`).
- **Correlação:** `snapshot_id → intent_id → clientOrderId → OrderId → ExecutionId`.
- **Nunca logar:** tokens, credenciais do vendor, cookies, payload bruto do vendor.

**N · Configuração:**
- **P1:** `config/jev-runtime-v1.json`, `jev-live-input-v1.json`, `jev-bridge-v1.json` (existem) + `config/ijc-robot-v1.json` (política referenciada por hash do pré-registro; parâmetros de risco; conta/instrumento **allowlist**).
- **P2:** `UserDataDir\invictus-jev-code\config\ijc-nt8.json` (endereços loopback, poll).
- **Travas não vêm de config:** L0 e sim-only são constantes em código. Config não pode ligar o robô.

**P · Persistência:**

| Persiste | Nunca persiste |
|---|---|
| ledger de propriedade, dedup por sessão, audit, preferências visuais e geometria da janela | robô ON, token em log, senha, estado de agente no caminho crítico |

**Q · Saúde:**

| Componente | Sinal | Exibição |
|---|---|---|
| engine | `/jev/v1/health` (cycles, last_cycle_at) | ENGINE |
| live data | `bridge.mode` + rotas OK | LIVE DATA |
| executor | heartbeat no `:3591` (≤ 2 s) | ROBOT / Details |
| agente | `:3592/agent/v1/health` | JEV AGENT (ausente ⇒ NOT REPORTED) |

## 12. Agent Gateway (T)

**Avaliação com a evidência local:**
- **OpenClaw:** instalado, `openclaw 2026.2.21-2`, pacote npm "Multi-channel AI gateway with extensible messaging integrations", MIT, `~/.openclaw` com `agents/` e `identity/` de fev/2026. É um gateway de **canais de mensagem**: útil para **entregar** explicações e alertas (chat), não para ser o motor.
- **Hermes:** **não instalado nem encontrado** nesta máquina ou repo; não foi possível avaliar.
- **Provider LLM:** já existe o cliente Kimi (frente de outra sessão, `JEV_KIMI_PROVIDER_20260924.md`, OpenAI-compatible, chave só em env), e há a API Claude.

**RECOMENDAÇÃO (uma arquitetura):** sidecar próprio **`InvictusJevCode.AgentGateway`**, processo Node separado (P3), com adaptadores plugáveis:
- **entrada:** só `GET :3590` (panel/output/audit), que já é público em loopback;
- **raciocínio:** interface `ReasoningProvider` (Kimi / Claude / outro), chamada **assíncrona** com timeout de 20 s e no máximo 1 requisição em voo;
- **saída:** notas advisory em `:3592 GET /agent/v1/notes` (rotuladas `ADVISORY — não é sinal`) e, opcionalmente, **OpenClaw como adaptador de canal** para mensagens ao operador;
- **memória:** arquivo próprio em `state/agent/` (resumos de sessão), sem dados de conta.

**Permissões e fronteiras:**

| Pode | Não pode |
|---|---|
| ler o snapshot, razões, qualidade e o audit sanitizado | token `:3591`, contas, ordens, posições, P&L, credenciais do vendor/relay, payload bruto do vendor |
| escrever notas advisory e mensagens de canal | alterar config, regras, modo do robô ou intents; chamar o engine |

- **Health:** `/agent/v1/health {status, provider, last_ok_at, last_error}`; a UI lê com timeout de 1 s.
- **Fail-soft:** timeout, 403 de cota (caso Kimi de hoje), internet fora ⇒ nota `UNAVAILABLE`; P1 e P2 não percebem.
- **Segurança:** a chave do provider vive só no env do P3; bind em loopback; prompts contêm só o snapshot sanitizado.

## 13. Reuso do Invictus (explícito)

| Item Invictus | Classe | Uso no INVICTUS JEV CODE |
|---|---|---|
| `AlfaOmegaRobo.Start/Stop` (idempotente em `OnWindowCreated`, stop + flush em `Terminated`) | **REUSE_PATTERN** | `IjcRuntime.Start/Stop` |
| `AlfaOmegaTrader.IsNt8Ready` (latch `Account.All.Count` sem lock) | **REUSE_PATTERN** | ready-gate do executor |
| thread dedicada `IsBackground`, nunca `Timer`, sem Dispatcher em worker | **REUSE_PATTERN** | `Ijc.Executor`, `Ijc.StatePoll` |
| `AoRoboPositions` (1 leitura de `Account.All` por ciclo, copiar dentro do lock, TTL) | **REUSE_PATTERN** | leitura de posições/ordens no executor |
| `AoRoboRelay` / `AoExecClient` (`HttpWebRequest` por chamada, `Proxy=null`, erro explícito, nunca objeto vazio) | **REUSE_PATTERN** | StatePoll e cliente do control plane (corrige o AddOn preliminar) |
| `AoRoboGuard` **versão original** (sim-only por `Account.Provider`, fail-closed, prefixo com pipe, const única) | **REUSE_CODE_CANDIDATE** (lógica; tipos renomeados `IjcGuard`, prefixo `IJC|`) | trava de conta |
| `AlfaOmegaRoboOrderState` (peça pura; R1 monotônico, R2 terminal imutável, R3 fill acumula por ExecutionId; 85 testes offline) | **REUSE_CODE_CANDIDATE** | `IjcOrderState` |
| `AlfaOmegaRoboDedup` (dedup persistido por sessão ET, caminho injetado, nunca `bin\Custom`) | **REUSE_CODE_CANDIDATE** | `IjcDedup` |
| `AlfaOmegaRoboAudit` (JSONL bufferizado, flush imediato de decisões, fila limitada, rotação mensal) | **REUSE_CODE_CANDIDATE** | audit do executor |
| `AoJsonNum` (parse numérico invariante de cultura) | **REUSE_CODE_CANDIDATE** | parse JSON no NT8 |
| `AoTraderCore` (ponto único de submissão; travas não contornáveis) | **REUSE_PATTERN** | `IjcExecutor.Submit` único |
| `AlfaOmegaTrader` idempotência `clientOrderId` + `requireFlat` / `maxPositions` server-side | **REUSE_PATTERN** | hard guards |
| `AoProtecaoFill` (proteger qty executada, ajuste por `Account.Change`, OCO) | **REUSE_PATTERN** | proteção pós-fill (valores vêm da política JEV) |
| `AlfaOmegaRoboSaida` (fechar só o próprio, nunca `Account.Flatten`, cancelar só o próprio stop) | **REUSE_PATTERN** | EXIT_OWNED / emergência |
| `AlfaOmegaRoboFontes` (SOURCE_READINESS bloqueia só entradas; saídas livres) | **REUSE_PATTERN** | gate de DQ do robô |
| `AlfaOmegaRoboTurno` (RTH-only, fechamento de sessão por propriedade) | **REUSE_PATTERN** | `session_policy` |
| `AlfaOmegaRoboOperacional` (STOP inibe só entradas, default STOP) | **REUSE_PATTERN**, mais estrito: ON nunca é restaurado | modo do robô |
| `AoDiag` (erros de render em arquivo, limite de taxa) | **REUSE_PATTERN** | diagnóstico da UI |
| `AoControlCenter` invariante "painel principal limpo" | **REUSE_PATTERN** | coerente com o Codex |
| staging fora de `bin\Custom` até autorização | **REUSE_PATTERN** | `nt8/` no repo (já é assim) |
| `AlfaOmegaRoboMotor`, `AoGate.EsNq`, `AoRoboEntry` / `EntryMq` / `Stack` / `Confluencia` / `Aot` | **DO_NOT_REUSE** | seria um **segundo cérebro** (motor AOT) |
| `AlfaOmegaSharedState`, `AoTapeEngine`, `AoMarketDataPublisher` | **DO_NOT_REUSE** | outro barramento e outras fontes; acoplaria ao Invictus |
| `AoControlCenter` (Indicator SharpDX com boleta BUY/SELL) | **DO_NOT_REUSE** | a UI é NTWindow sem BUY/SELL (Codex) |
| listener `:5152` (TcpListener no NT8), rotas `/positions/flatten-all`, `/killswitch` | **DO_NOT_REUSE** | pull model; nunca flatten-all |
| `AoRoboGuard` reduzido a identificação (03/09), kill switch e shadow removidos | **DO_NOT_REUSE** | o JEV mantém as travas |
| parâmetros de estratégia (HardStop US$ 1000, trailing 500/250, Take RR 3:1, 60/150 pt) | **DO_NOT_REUSE** | a estratégia JEV exige pré-registro próprio |
| Ledger com `preregistrado:false` (seleção pós-hoc) | **DO_NOT_REUSE** | contraria o método JEV |
| Copy Engine (`CopyMaster` / `Contas` / `Core`), licença (`AoLogin` / `AoLicenca`) | **DO_NOT_REUSE** (fora de escopo) | o copy multiplica ordens (`AoCopyStatus`); a licença é decisão de produto separada |

## 14. Ordem de implementação (após consolidar com o Codex)

Cada etapa tem autorização e commit próprios; nenhuma etapa antes da 5 contém caminho de submissão de ordem.

1. **UI consolidada (Codex) sobre o existente:**
   - `jev-panel/v1` aditivo (`snapshot_id`, `robot.*`/`agent.*` = NOT_REPORTED);
   - web Control Center no layout do Codex;
   - AddOn renomeado `IjcAddOn` + `IjcControlCenterWindow` (abas, status, Robot card travado), `HttpWebRequest`, parse invariante, `AoDiag`-like;
   - compile-check fora do NT8;
   - testes de estados (5 contextos + NO_TRADE, DQ, OFFLINE last-known, 400×640).
2. **Robot Core (Node), sem execução:** state machine, DECISION = `NONE`, RISK com parâmetros UNSET ⇒ recusa, control plane `:3591` com token, audit do robô. Testes provam que ON é impossível (L0, política ausente, UNSET).
3. **Executor NT8 read-only:** ready-gate, reconciliação (lê ordens/posições `IJC|`, ledger), heartbeat/report, fila de eventos; **sem referência a `CreateOrder` / `Submit` / `Change` / `Cancel` no código** (teste de busca). Compile-check.
4. **Agent Gateway (P3):** sidecar read-only + providers + adaptador OpenClaw opcional + JEV AGENT status. Testes de queda (cota 403, timeout, offline).
5. **(Fase separada, exige pré-registro de política de execução + regra de lado ativa + ordem explícita)** caminho de submissão sim-only:
   - `IjcGuard`, `IjcOrderState`, `IjcDedup`, pós-fill, EXIT_OWNED, emergência;
   - testes offline das peças puras;
   - instalação no NT8 e F5 **pelo operador**.

## 15. Acceptance criteria

**Arquitetura (esta entrega):** um motor; camadas separadas; robô OFF por padrão e impossível de ligar sem L0 + política + risco + sim + reconciliação; agente fora do caminho crítico; reuso classificado; nada instalado.

**Por etapa:**
- **E1:**
  - UI renderiza os estados do checklist do Codex (5 contextos + NO_TRADE, VALID/DEGRADED/DATA_INVALID, OFFLINE last-known, STALE/FROZEN/MARKET_CLOSED distintos);
  - nenhum dado inventado;
  - ON inalcançável por clique, teclado ou restore;
  - AddOn sem `HttpClient` estático;
  - compile-check OK;
  - testes existentes (46) seguem verdes.
- **E2:**
  - com `JEV_CAN_SEND_ORDER=false` ou política ausente ou parâmetro UNSET, `enable-request` ⇒ OFF + motivo;
  - `:3591` recusa sem token e fora de loopback;
  - `:3590` continua GET-only;
  - DECISION nunca emite ação ≠ `NONE` no V1.
- **E3:**
  - executor reconcilia e reporta sem nenhuma API de ordem no binário (busca estática);
  - ConnectionLost ⇒ HALTED;
  - F5 ⇒ OFF + ledger recarregado.
- **E4:** P3 derrubado, sem internet ou com 403 de cota ⇒ P1/P2 inalterados; o agente nunca acessa `:3591`; notas rotuladas ADVISORY.
- **E5 (futuro):**
  - ordem só em Simulator/Playback;
  - dedup sobrevive a F5;
  - fill parcial não empilha bracket;
  - EXIT fecha só o próprio;
  - emergência cancela entradas e preserva proteções;
  - órfãs tratadas;
  - trilha `snapshot_id → ExecutionId` completa.

---

```
FRONT B: COMPLETE
PRODUCT: INVICTUS JEV CODE
IMPLEMENTATION: NOT STARTED — handoff do Codex já disponível; aguardando ordem de consolidação
```
