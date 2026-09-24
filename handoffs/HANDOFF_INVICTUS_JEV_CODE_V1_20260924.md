# HANDOFF — INVICTUS JEV CODE V1 (24/09/2026)

Autocontido. Consolida Front A (Codex, UI) · Front B (Claude, arquitetura) · Front C (Claude, implementação).
Partida: `bf09de6`. Documento do produto: `context/jev-future/INVICTUS_JEV_CODE_V1_20260924.md`.

| | |
|---|---|
| PRODUCT | **INVICTUS JEV CODE** |
| FRONT A (Codex) | COMPLETE: `handoffs/HANDOFF_CODEX_INVICTUS_JEV_UI_20260924.md` + `handoffs/assets/INVICTUS_JEV_CODE_DASHBOARD_20260924.png` |
| FRONT B (arquitetura) | COMPLETE: `handoffs/HANDOFF_CLAUDE_INVICTUS_JEV_ARCHITECTURE_20260924.md` |
| FRONT C (implementação) | **COMPLETE** |
| Decisões do operador | implementação AUTORIZADA (etapas 1–4 num lote) · robô SOMENTE Simulator/Playback · PULL aprovado · etapa 5 (ordens) NÃO habilitada |

| Etapa | Estado |
|---|---|
| 1. UI consolidada | **DONE**: web Control Center e janela NT8 no layout do Codex |
| 2. Robot Core sem execução | **DONE**: `src/ijc/robot/*` |
| 3. Control plane + NT8 Executor read-only | **DONE**: `src/ijc/control-plane/*`, `nt8/AddOns/InvictusJevCode/IjcExecutor.cs` |
| 4. Agent Gateway | **DONE**: `src/ijc/agent-gateway/*` |
| 5. Execução de ordens (simulada) | **NÃO habilitada**: ACTIVE SIDE RULES = 0; EXECUTION POLICY não pré-registrada |

## 1. Estado final

| Item | Estado |
|---|---|
| UI | IMPLEMENTED (web `:3590/` + NTWindow) |
| JEV Shared Engine | REUSED / SINGLE SOURCE OF TRUTH (`src/jev/engine.mjs` intocado) |
| Analyzer | OPERATIONAL |
| Robot Core | IMPLEMENTED |
| Robot execution | **HARD DISABLED** (`JEV_CAN_SEND_ORDER=false` const Node + C#; `ORDER_PATH=HARD_DISABLED`) |
| Control plane | IMPLEMENTED (`127.0.0.1:3591`, token, pull) |
| NT8 executor | READ-ONLY (source only) |
| Agent Gateway | IMPLEMENTED / FAIL-SOFT / OPTIONAL |
| Web Control Center | READ-ONLY |
| Sim/Playback restriction | HARD ENFORCED (Node `isEligibleProvider` + C# `IjcGuard`, Ordinal, fail-closed) |
| Real account | REJECTED |
| No second brain | PASS (teste I02) |
| No live order path | PASS (teste I01 + 50 testes C#) |
| Tests | Node 75/75 · C# 50/50 · compile-check 0 erros / 0 avisos · smokes 7/7, 7/7, 8/8 |
| Production | UNCHANGED |
| F5 | NOT PERFORMED |
| NT8 compile dentro do NT8 | PENDING_FINAL_NT8_COMPILE (compila fora contra os DLLs reais; descoberta/carga no NT8 só com instalação) |

## 2. Implementação (Front C)

- **Snapshot:** o laço live/replay anexa `snapshot_id = <evaluated_at>#<run>-<ciclo>`. O panel, o Robot Core, a decisão e o agente referenciam o mesmo id.
- **Robot Core (Node, mesmo processo do motor, só consome o snapshot):**
  - `constants.mjs`: travas congeladas, providers elegíveis, prefixo `IJC|`;
  - `config.mjs`: limites de risco UNSET por padrão; chaves que tentam ligar execução são FATAL;
  - `state-machine.mjs`: OFF / ENABLE_REQUESTED / ARMED / HALTED / EMERGENCY_STOPPED;
  - `gates.mjs`: 20 gates;
  - `decision.mjs`: sempre NONE;
  - `intents.mjs`: `intent_id` determinístico, dedup persistido por sessão ET, fila HARD_DISABLED;
  - `robot-core.mjs`: `onSnapshot`, `report` (sanitizado), `requestEnable` (só `NT8_WINDOW`), `disable`, `emergency`, `status`, `publicStatus` (sem contas/ordens).
- **Control plane:** `src/ijc/control-plane/{server,auth}.mjs`. Token de 32 bytes em `%LOCALAPPDATA%\InvictusJevCode\secrets\`; `timingSafeEqual`; 401 sem token; loopback obrigatório.
- **Bridge/panel:** `jev-panel/v1` ganhou `product`, `snapshot_id`, robô público (execution, order_path, strategy, position, executor, gates) e `agent: NOT_REPORTED`. `/jev/v1/robot` usa o Robot Core.
- **CLI `--serve`:** motor + bridge + Robot Core + control plane + logs JSONL por componente (`--robot-config`, `--cp-port`).
- **Web Control Center:** reescrito no layout do Codex:
  - identidade IJ, status ENGINE / LIVE DATA / JEV AGENT / ROBOT, 5 abas;
  - Robot card fixo `[OFF | 🔒 ON]` com ON desabilitado;
  - MenthorQ em subárea separada;
  - OFFLINE ⇒ último conhecido esmaecido;
  - JEV AGENT lido de `:3592` com timeout de 1 s (NOT REPORTED se ausente);
  - sem BUY/SELL, sem probabilidade.
- **NT8 AddOn** (`nt8/AddOns/InvictusJevCode/`), substitui o preliminar `JevControlCenter.cs`, com as 4 correções:
  1. `HttpWebRequest` por chamada, `Proxy=null`, `KeepAlive=false`;
  2. parse invariante (`DateParseHandling.None`, `InvariantCulture`);
  3. branding INVICTUS JEV CODE;
  4. erros em JSONL no `UserDataDir\invictus-jev-code\logs`.

  O executor read-only faz ready-gate, varredura com cópia dentro do lock, elegibilidade, ordens `IJC|`, órfãs, reconciliação na reconexão, pull e report. Intents recebidas vão para o stub `HARD_DISABLED`.
- **Agent Gateway:** `src/ijc/agent-gateway/{providers,gateway,server,cli}.mjs`, `config/ijc-agent-gateway-v1.json`.
  - Providers: `none` (padrão), `claude` (SDK oficial opcional ⇒ NOT_INSTALLED hoje), `kimi` / `openai-compatible` (chave por env), `hermes` (FUTURE_PROVIDER_OPTION).
  - OpenClaw: REGISTERED_NOT_WIRED, só mensagens.
- **Testes novos:** `test/ijc/{robot,control-plane,agent,invariants}.test.mjs`, `test/jev/ui-addon.test.mjs`, `nt8/check/IjcPureTests/`; `test/jev/bridge-smoke.mjs` ampliado (control plane 401).

## 3. Testes exigidos → cobertura

| Exigido | Teste |
|---|---|
| UI/backend contract | B03, B06, B10, R09 |
| robot state machine | R01 |
| restart ⇒ OFF | R02 |
| side rules zero ⇒ NONE | R03 |
| real account rejected / Simulator / Playback | R04 + C# (50) |
| missing risk limit ⇒ cannot arm | R06 |
| stale / frozen / non-RTH ⇒ cannot arm | R07 |
| duplicate intention rejected | R08 + C# |
| snapshot_id propagation | R09 |
| reconnect reconciliation | R10 + C# |
| bridge offline fail-soft | B07, B10, A02 |
| agent unavailable fail-soft | G01, G02 |
| agent has no robot token | G04 |
| web cannot enable robot | C05, B06 |
| NT8 executor read-only / no order API reachable | B09, I01, C# |
| JEV_CAN_SEND_ORDER immutable false | R11, I01, C# |
| UNKNOWN operational | 18, I04 |
| production untouched | 20, I03 |
| NO LIVE ORDER PATH EXISTS IN THIS BUILD | **I01** |

## 4. Não feito (pendências explícitas)

- Instalação e F5 do AddOn no NT8 (PENDING_FINAL_NT8_COMPILE): exige ordem do operador.
- Seleção de conta na janela NT8: `selected_account` é sempre null na V1, então o gate de conta fica FAIL. É intencional até a fase de execução.
- Execução simulada (etapa 5); provider LLM configurado; fiação do OpenClaw; POST_LAUNCH_REFINEMENT_BACKLOG (R2, R6, G1/G2, E1–E7).

## 5. Próximo passo mínimo para, no futuro, habilitar execução SIMULADA com segurança

Sem reabrir nada do que foi feito, nesta ordem:
1. **Pré-registrar a política de execução** (regra de lado ativa + mapeamento contexto→ação + stop/alvo). É a única pendência de pesquisa, e o gate `EXECUTION_POLICY` + `ACTIVE_SIDE_RULE` já está pronto para recebê-la.
2. Operador preenche `config/ijc-robot-v1.json` (4 limites + 2 políticas).
3. Instalar o AddOn e fazer F5 pelo operador (valida PENDING_FINAL_NT8_COMPILE); conferir a reconciliação ao vivo numa conta Simulator.
4. Fase própria de execução sim-only:
   - trocar os stubs `IjcExecutionStub` por submissão real **só** para `Provider ∈ {Simulator, Playback}`;
   - proteção pós-fill;
   - só então rever `JEV_CAN_SEND_ORDER` / `ORDER_PATH` em código, com revisão e ordem explícita.

## 6. V2 (24/09/2026) — EM ANDAMENTO

Estado, recusa do ambiente (ROBOT ORDER BINDING isolado) e próximo passo exato: `handoffs/HANDOFF_INVICTUS_JEV_NT8_INSTALL_20260924.md` §11. Caminho MANUAL implementado (`IjcManualOrders.cs`); UI V2 Full/Compact implementada; nada commitado; F5 NOT PERFORMED.

## 7. Lote de instalação RTH (24/09/2026)

Lote atual: READ_ONLY / NO MANUAL ORDER EXECUTION, payload de 4 arquivos. MANUAL ORDER CODE = IMPLEMENTED, fora deste lote (INSTALLATION DEFERRED). ROBOT SUBMIT = PENDING_ENVIRONMENT_REFUSAL. Detalhes, checks e estado da cópia/F5: `handoffs/HANDOFF_INVICTUS_JEV_NT8_INSTALL_20260924.md` §12–§13.
