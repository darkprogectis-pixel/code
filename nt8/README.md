# nt8/ — INVICTUS JEV CODE AddOn (SOURCE ONLY)

**Estado:** Instalação controlada preparada em `install/`; o estado exato da instalação está no handoff `handoffs/HANDOFF_INVICTUS_JEV_NT8_INSTALL_20260924.md`.

**Lote de instalação atual (RTH test):** READ_ONLY / NO MANUAL ORDER EXECUTION. O payload tem **4 arquivos** (`install/ijc-payload-manifest.json`, `deferred_not_installed = [IjcManualOrders.cs]`).
- MANUAL_ORDER_CODE = IMPLEMENTED (`IjcManualOrders.cs`, no repositório) · MANUAL_ORDER_INSTALLATION = DEFERRED (sem `IJC_MANUAL_ORDERS` a janela usa `IjcManualOrdersDeferred`, que nunca envia).
- ROBOT_ORDER_INFRASTRUCTURE = PARTIAL · ROBOT_SUBMIT_BINDING = PENDING_ENVIRONMENT_REFUSAL (Robot: `JEV_CAN_SEND_ORDER=false`, `ORDER_PATH=HARD_DISABLED`, default OFF, decisão NONE).
- WEB = READ_ONLY · AGENT = ADVISORY_ONLY.

Não é a versão final do produto; é o lote operacional para testar o JEV no RTH.

| Arquivo | Papel |
|---|---|
| `AddOns/InvictusJevCode/IjcAddOn.cs` | host (`AddOnBase`): menu Control Center → New → **INVICTUS JEV CODE**; start/stop idempotente |
| `AddOns/InvictusJevCode/IjcControlCenterWindow.cs` | NTWindow V2 FULL 1440×1000 / COMPACT 440×900; analyzer (`:3590`, `:3592`), seletor de conta, PNL/realizado/aberto, posição, Robot OFF/ON (gates) |
| `AddOns/InvictusJevCode/IjcExecutor.cs` | leitura de conta/PNL/posição (`IjcAccounts`) + executor do Robot sem envio: heartbeat, contas, elegibilidade Simulator/Playback, ordens `IJC|`, reconciliação na reconexão, pull de intents (sempre vazias) e report ao control plane `:3591` com o token local |
| `AddOns/InvictusJevCode/IjcPure.cs` | peças puras: travas, guarda de conta, prefixo, HTTP por chamada, JSON invariante, log JSONL, máquina de ordem, dedup, reconciliação, stubs HARD_DISABLED |
| `check/InvictusJevCode.check.csproj` | compila o AddOn **fora** do NT8 (`npm run check:nt8`) |
| `AddOns/InvictusJevCode/IjcManualOrders.cs` | boleta MANUAL (CreateOrder/Submit por clique). **Fora do payload do lote atual (DEFERRED)** |
| `check/IjcPureTests/` | 103 testes das peças puras (`npm run test:nt8`) |

## Instalação controlada (PREPARADA, NÃO executada; exige ordem explícita do operador)

Use SOMENTE os scripts de `nt8/install/` (backup SHA256, cópia verificada, rollback integral). Não copie a pasta à mão.
Plano, checklist do F5 único e rollback: `handoffs/HANDOFF_INVICTUS_JEV_NT8_INSTALL_20260924.md`.

Resumo: NT8 fechado → `01-precheck -ForInstall` → `02-backup` → `03-install -Confirm INSTALL-IJC` → `04-verify -Stage PreF5` → `npm run serve` → abrir NT8 e **um único F5** → `04-verify -Stage PostF5`. Falha ⇒ NT8 fechado → `05-rollback -Confirm ROLLBACK-IJC` (sem F5 depois).

Após qualquer edição em `AddOns/InvictusJevCode/`: `npm run nt8:manifest` e `npm run nt8:shadow`.

O executor lê o token do control plane em `%LOCALAPPDATA%\InvictusJevCode\secrets\control-plane.token`, criado pelo `npm run serve`. Os logs do AddOn ficam em `UserDataDir\invictus-jev-code\logs`. O AddOn não cria ordens, não altera posições e não interage com contas além de lê-las.
