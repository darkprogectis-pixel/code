# HANDOFF — JEV FUTURE · NT8 AGENT / BOT CONTROL CENTER V1 (24/09/2026)

Partida: commit `6ecb18d` (Live Input Adapter V1 operacional). Autorização do operador: "você já está autorizado, pode continuar".

Escopo adotado (limites do projeto preservados):
- JEV Bridge local somente leitura (127.0.0.1), servindo o estado do MESMO motor;
- Control Center (Analyzer) — painel lateral web servido pela bridge;
- NT8 AddOn — SÓ CÓDIGO-FONTE no repo; NÃO instalado em NT8, NÃO compilado (F5 NOT PERFORMED);
- botão ROBÔ: existe, travado OFF (JEV_CAN_SEND_ORDER=false; Robot Executor exige fase própria + pré-registro + ordem);
- Agent Gateway: opcional/assíncrono, consumidor externo da bridge, fora do processo NT8.

| Etapa | Estado |
|---|---|
| A. arquitetura | **DONE**: motor único → JEV Bridge (127.0.0.1:3590, GET/HEAD) → {Control Center web, NT8 AddOn, agentes opcionais} |
| B. bridge | **DONE**: `src/jev/bridge/{server,panel-model}.mjs`, `--serve` (live/replay); live ok 15/15 rotas, POST/PUT 405 |
| C. control center UI | **DONE**: `src/jev/bridge/control-center.html` (sem recursos externos) |
| D. NT8 AddOn (source only) | **DONE**: `nt8/AddOns/JevControlCenter.cs`; compila FORA do NT8 contra os DLLs reais (`npm run check:nt8`); não instalado, sem F5 |
| E. testes | **PASS 46/46** (21 runtime + 15 adapter + 10 bridge/UI/AddOn) |
| F. smoke | **PASS**: bridge 7/7 (LIVE 15/15 rotas + REPLAY); fixture 7/7; live 7/7 |
| G. docs / handoff / commit / push | **DONE**: commit `Add JEV Control Center V1 (read-only bridge, analyzer UI, NT8 AddOn source)` |

## Entregue
- **JEV Bridge** (`src/jev/bridge/server.mjs`):
  - só loopback (host fora de loopback é FATAL) e só GET/HEAD (resto = 405);
  - rotas `/`, `/jev/v1/{health,state,output,audit,robot}`;
  - alimentada pelo mesmo laço live/replay e pelo mesmo motor.
- **Painel** `jev-panel/v1` (`panel-model.mjs`): só apresenta o `jev-output/v1`; sem probabilidade (conviction UNCALIBRATED); robô `{OFF, can_enable:false}`.
- **Control Center web** (`control-center.html`):
  - painel lateral com contexto direcional, robô travado, market state, data quality, dealer context, SPX context, reason codes, unresolved e configurações;
  - banner OFFLINE quando a bridge cai.
- **CLI:** `--serve` (LIVE ou `--replay <input>`), porta por config (`config/jev-bridge-v1.json`, 3590) ou `--port`.
- **NT8 AddOn:** `nt8/AddOns/JevControlCenter.cs`, `nt8/check/*.csproj`, `nt8/README.md`.
  - AddOnBase + NTWindow; poll em `Task` de background; sem APIs de conta/ordem; robô `IsEnabled=false`.
  - Compila fora do NT8 (net48, C# 7.3).
- **Docs:** `context/jev-future/JEV_CONTROL_CENTER_V1_20260924.md`; `CLAUDE.md` e `START_HERE.md` atualizados.
- **Runtime test 20:** só `adapters/relay-client.mjs` (cliente GET) e `bridge/server.mjs` (servidor loopback) podem usar `node:http`; nada escreve em disco fora da CLI.

## Não feito (exige ordem explícita)
- Instalar o AddOn no NT8 / F5.
- **Robot Executor:** precisa de regra direcional ativa (hoje 0), pré-registro de execução e política Core×JEV (UNDEFINED).
- Integração Hermes/OpenClaw: ficam como consumidores GET assíncronos da bridge, nunca no caminho crítico.
- Reuso do Invictus.

## Próximo passo exato
1. Operador: `npm run serve` → abrir `http://127.0.0.1:3590/` e revisar o painel, idealmente no RTH.
2. Se aprovado, ordem explícita para instalar o AddOn no NT8 (seguir `nt8/README.md`; F5 pelo operador).
3. Fases futuras separadas: Agent Gateway assíncrono e Robot Executor (pré-registro).
