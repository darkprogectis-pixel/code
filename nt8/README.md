# nt8/ — INVICTUS JEV CODE AddOn (SOURCE ONLY)

**Estado:** código-fonte no repositório. **NÃO instalado no NinjaTrader 8 e NÃO compilado no NT8 (F5 NOT PERFORMED).** Nenhum caminho de ordem existe: `JEV_CAN_SEND_ORDER=false` (constante) e `ORDER_PATH=HARD_DISABLED`.

| Arquivo | Papel |
|---|---|
| `AddOns/InvictusJevCode/IjcAddOn.cs` | host (`AddOnBase`): menu Control Center → New → **INVICTUS JEV CODE**; start/stop idempotente |
| `AddOns/InvictusJevCode/IjcControlCenterWindow.cs` | NTWindow 480×960 (layout do Codex); só lê `:3590` e `:3592`; ON desabilitado |
| `AddOns/InvictusJevCode/IjcExecutor.cs` | executor **read-only**: heartbeat, contas, elegibilidade Simulator/Playback, ordens `IJC|`, reconciliação na reconexão, pull de intents (sempre vazias) e report ao control plane `:3591` com o token local |
| `AddOns/InvictusJevCode/IjcPure.cs` | peças puras: travas, guarda de conta, prefixo, HTTP por chamada, JSON invariante, log JSONL, máquina de ordem, dedup, reconciliação, stubs HARD_DISABLED |
| `check/InvictusJevCode.check.csproj` | compila o AddOn **fora** do NT8 (`npm run check:nt8`) |
| `check/IjcPureTests/` | 50 testes das peças puras (`npm run test:nt8`) |

## Instalação futura (NÃO executada; exige ordem explícita do operador)

1. Copiar a pasta `AddOns/InvictusJevCode/` para `Documents\NinjaTrader 8\bin\Custom\AddOns\InvictusJevCode\`.
2. No NinjaScript Editor, compilar (F5), feito pelo operador.
3. Iniciar `npm run serve` (e, se quiser, `npm run agent`).
4. No NT8: Control Center → New → **INVICTUS JEV CODE**.

O executor lê o token do control plane em `%LOCALAPPDATA%\InvictusJevCode\secrets\control-plane.token`, criado pelo `npm run serve`. Os logs do AddOn ficam em `UserDataDir\invictus-jev-code\logs`.

Para remover: apagar a pasta de `bin\Custom\AddOns` e recompilar. O AddOn não cria ordens, não altera posições e não interage com contas além de lê-las.
