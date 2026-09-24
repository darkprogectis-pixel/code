# INVICTUS JEV CODE — V1 (24/09/2026)

| | |
|---|---|
| PRODUCT | **INVICTUS JEV CODE** — Market Analyzer / Robot Control Center |
| ENGINE | **ONE SHARED ENGINE**: `src/jev/engine.mjs` (JEV Runtime V1), fonte única de verdade |
| ANALYZER | **IMPLEMENTED** (web Control Center + janela NT8, layout do Codex) |
| ROBOT CORE | **IMPLEMENTED / EXECUTION DISABLED** |
| CONTROL PLANE | **IMPLEMENTED**: `127.0.0.1:3591`, token local, modelo PULL |
| NT8 EXECUTOR | **READ-ONLY** (heartbeat, contas, elegibilidade, reconciliação), código-fonte; não instalado |
| AGENT GATEWAY | **IMPLEMENTED / OPTIONAL**: `127.0.0.1:3592`, ADVISORY, processo separado |
| REAL ORDERS | **IMPOSSIBLE IN THIS BUILD** (`JEV_CAN_SEND_ORDER=false` constante; `ORDER_PATH=HARD_DISABLED`; nenhum código de ordem existe) |
| CONTAS DO ROBÔ | só **Simulator / Playback**; conta real = INELIGIBLE / HARD REJECT |
| WEB | **READ-ONLY** (não conhece o control plane) |
| PRODUCTION / NT8 atual | **UNCHANGED** · F5 **NOT PERFORMED** |
| 20–40 PREGÕES | FUTURE OBSERVATION ONLY / NON-BLOCKING |

## 1. Fluxo

```
relay GammaGex (read-only) → Live Input Adapter → JEV SHARED ENGINE → snapshot canônico (snapshot_id)
                                                      │
                          ┌───────────────────────────┴───────────────────────────┐
                    JEV ANALYZER                                             ROBOT CORE
             (bridge :3590 GET/HEAD → web e janela NT8)         DECISION (NONE) → RISK/gates → intents (sempre vazias)
                          └────────────────────── CONTROL CENTER ─────────────────┘
                                                      │ pull (token)
                                         NT8 EXECUTOR (read-only) ◄── control plane :3591
AGENT GATEWAY :3592 (opcional, assíncrono) ── só GET :3590 ── notas ADVISORY
```

## 2. Como iniciar

```
npm run serve                  # motor + live adapter + bridge :3590 + Robot Core + control plane :3591
npm run serve:replay           # idem com fixture (sem relay)
npm run agent                  # Agent Gateway :3592 (opcional; provider "none" por padrão)
abrir http://127.0.0.1:3590/   # Control Center web (somente leitura)
npm test                       # 75 testes Node
npm run test:nt8               # 50 testes C# das peças puras do AddOn (fora do NT8)
npm run check:nt8              # compila o AddOn fora do NT8 contra os DLLs instalados (não instala)
npm run smoke | smoke:live | smoke:bridge
```

- **Dados do produto:** `%LOCALAPPDATA%\InvictusJevCode\` (`logs/`, `state/`, `secrets/`), fora do repositório; `IJC_DATA_DIR` sobrescreve.
- **Dados no NT8 (futuro):** `UserDataDir\invictus-jev-code\`.

## 3. Componentes

| Componente | Local | Papel |
|---|---|---|
| Engine | `src/jev/*` (existente) | classifica; único cérebro |
| Bridge | `src/jev/bridge/server.mjs` | GET/HEAD `/jev/v1/{state,output,audit,health,robot}` |
| Panel | `src/jev/bridge/panel-model.mjs` | `jev-panel/v1` + `product`, `snapshot_id`, robô público, agente NOT_REPORTED |
| Control Center web | `src/jev/bridge/control-center.html` | layout Codex: status ENGINE / LIVE DATA / JEV AGENT / ROBOT; abas Analyzer / Robot / Details / Settings / Logs; OFFLINE ⇒ último conhecido esmaecido |
| Robot Core | `src/ijc/robot/*` | `constants` (travas), `config` (limites UNSET), `state-machine`, `gates`, `decision` (NONE), `intents` (dedup persistido, fila HARD_DISABLED), `robot-core` |
| Control plane | `src/ijc/control-plane/*` | `127.0.0.1:3591`, `X-IJC-Token`; `GET intents` / `status`, `POST report` / `enable-request` / `disable` / `emergency` |
| Logs | `src/ijc/common/jsonl-log.mjs` | JSONL por componente (engine, bridge, robot, control-plane, agent, nt8-addon); chaves sensíveis e token mascarados |
| Agent Gateway | `src/ijc/agent-gateway/*` | sidecar; providers plugáveis; notas ADVISORY |
| NT8 AddOn | `nt8/AddOns/InvictusJevCode/*.cs` | `IjcAddOn` (host), `IjcControlCenterWindow` (NTWindow), `IjcExecutor` (read-only), `IjcPure` (peças puras) |

## 4. Robot

- **Modos:** `OFF → ENABLE_REQUESTED → ARMED → HALTED`, e `EMERGENCY_STOPPED` a partir de qualquer modo. Restart ⇒ **OFF sempre**. HALTED e EMERGENCY só saem por DISABLE.
- **Posição:** eixo separado (`NOT_REPORTED | FLAT | ENTRY_PENDING | IN_POSITION | EXIT_PENDING | UNKNOWN_RECONCILING`), vindo só da reconciliação do executor.
- **Decisão V1:** sempre `NONE` (`RC_ROBOT_NO_ACTIVE_SIDE_RULE`, `RC_ROBOT_NO_EXECUTION_POLICY`). LONG_CONTEXT não implicaria entrada.
- **Gates (todos obrigatórios):**
  - travas do build: `L0_SEND_ORDER_LOCK`, `ORDER_PATH`, `KILL_FILE_ABSENT`;
  - política e regra: `EXECUTION_POLICY`, `ACTIVE_SIDE_RULE`;
  - limites e políticas (ver abaixo);
  - executor e conta: `EXECUTOR_HEALTHY`, `ACCOUNT_SIMULATOR_OR_PLAYBACK`, `ACCOUNT_CONNECTED`, `RECONCILIATION_COMPLETE`;
  - dados: `ENGINE_FRESH`, `DATA_QUALITY_USABLE`, `SOURCE_NOT_FROZEN`, `SESSION_RTH`.
  Com tudo configurado e saudável, **ARMED continua impossível** por L0 + ORDER_PATH + POLICY + SIDE RULE (teste R05).
- **Limites de risco:** `max_position_contracts`, `max_open_positions`, `max_orders_per_session` e `daily_loss_limit_usd` ficam em `config/ijc-robot-v1.json` como `null` = UNSET ⇒ não arma. Idem `emergency_flatten_owned` e `session_close_owned`.
- **Autoridade de ON:** só a janela do NT8 (`origin=NT8_WINDOW`, com token). Web, agente e API ⇒ `ORIGIN_NOT_ALLOWED`. Na V1 nem a janela arma.
- **Propriedade:** prefixo `IJC|` (Ordinal); órfã = ordem `IJC|` sem ledger (estado explícito); nunca flatten global; posição só é própria via ledger.
- **Dedup:** `(intent_id, snapshot_id)` persistido por sessão ET; sobrevive a restart e reconexão (Node e C#).
- **Proteção (futuro):** só depois do **fill real**, sobre a quantidade **executada**; stop no broker; ajuste de parcial sem empilhar bracket.
- **Emergência (futuro):**
  1. bloquear entradas;
  2. cancelar só as entradas pendentes próprias;
  3. manter a proteção no broker;
  4. zerar conforme a política definida **antes** de armar.
  Na V1 não há ordem para cancelar.

## 5. Segurança e isolamento

| Serviço | Endereço | Acesso |
|---|---|---|
| Bridge | `:3590` | só loopback; GET/HEAD; sem nomes de conta nem ordens na visão pública |
| Control plane | `:3591` | só loopback + token (32 bytes, `secrets/control-plane.token`) |
| Agent Gateway | `:3592` | só loopback; GET/HEAD; CORS só para `:3590` |

- **Token do control plane:** nunca no Git, log, UI, handoff nem Agent Gateway.
- **Agent Gateway:** lê só `:3590`; contexto por whitelist (sem contas, gates, executor, token); saída `kind: ADVISORY, canonical: false`.
- **Executor NT8:**
  - `lock(Account.All)` só para copiar, uma varredura a cada 10 s;
  - ready-gate sem lock;
  - thread dedicada;
  - HTTP por chamada (`HttpWebRequest`, `Proxy=null`, `KeepAlive=false`);
  - parse invariante de cultura;
  - log em arquivo.

## 6. Agent providers

| Provider | Estado |
|---|---|
| `none` (padrão) | NOT_CONFIGURED: estado válido, produto 100% funcional |
| `claude` | SDK oficial `@anthropic-ai/sdk`, carregado sob demanda (modelo `claude-opus-5`, fallbacks de recusa do servidor); **pacote não instalado ⇒ NOT_INSTALLED** |
| `kimi` / `openai-compatible` | chave só por env (`KIMI_API_KEY` / `key_env`); sem chave ⇒ NOT_CONFIGURED; 403 de cota ⇒ PROVIDER_UNAVAILABLE (fail-soft) |
| `hermes` | FUTURE_PROVIDER_OPTION (não instalado nem avaliado) |
| OpenClaw | só adaptador de **mensagens**, REGISTERED_NOT_WIRED; nunca cérebro, nunca ordens |

## 7. Verificação desta build

- `npm test`: **75/75** (46 JEV/UI/AddOn + 29 INVICTUS: robot 13, control plane 6, agent 6, invariantes 4).
- `npm run test:nt8`: **50/50** (conta real rejeitada, Simulator/Playback, prefixo, stubs HARD_DISABLED, parse pt-BR, máquina de ordem R1/R2/R3, dedup persistido, órfãs).
- `npm run check:nt8`: compila os 4 `.cs` contra `NinjaTrader.Core/Gui/Newtonsoft` do NT8 instalado com **0 erros e 0 avisos**. O teste de descoberta e carga dentro do NT8 fica **PENDING_FINAL_NT8_COMPILE**: exige instalação e F5 pelo operador.
- Smokes: fixture 7/7, live 7/7, bridge 8/8 (LIVE com relay 15/15 + REPLAY).
- Ponta a ponta real: relay → motor → painel → Robot Core (mesmo `snapshot_id`) → executor simulado → gates; agente como processo separado; token ausente de todos os logs.
