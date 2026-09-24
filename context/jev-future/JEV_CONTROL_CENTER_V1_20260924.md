# JEV FUTURE — NT8 AGENT / BOT CONTROL CENTER V1 (24/09/2026)

| | |
|---|---|
| JEV BRIDGE | **OPERATIONAL**: local, somente leitura (GET/HEAD), só loopback `127.0.0.1:3590` |
| CONTROL CENTER (Analyzer web) | **OPERATIONAL**: `http://127.0.0.1:3590/` |
| NT8 AddOn (Analyzer) | **SOURCE ONLY**: `nt8/AddOns/JevControlCenter.cs`, compila fora do NT8 contra os DLLs reais; **NÃO instalado, NÃO compilado no NT8 (F5 NOT PERFORMED)** |
| ROBÔ | botão presente, **travado OFF** (`can_enable: false`). Não existe caminho de código para ligar |
| TRADE EXECUTION | **DISABLED** |
| PRODUÇÃO / NT8 atual | **UNCHANGED** |
| AGENT GATEWAY | **OPTIONAL / ASYNC**: agentes são consumidores externos da bridge, nunca dentro do NT8 |
| 20–40 PREGÕES | FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING |

## 1. Arquitetura

```
relay GammaGex (read-only) ─► LIVE INPUT ADAPTER ─► jev-input/v1
                                                      │
                                   JEV SHARED ENGINE (src/jev/engine.mjs — ÚNICO)
                                                      │ jev-output/v1
                                              JEV BRIDGE (127.0.0.1:3590, GET/HEAD)
                        ┌─────────────────────────────┼──────────────────────────────┐
              Control Center web            NT8 AddOn "JEV Control Center"     Agentes externos (opcional)
              (Analyzer, navegador)          (Analyzer; poll em background)     Hermes / OpenClaw / …: async,
                                                                                 fora do NT8; só GET
              JEV ROBOT EXECUTOR: NÃO construído (fase própria + pré-registro + ordem)
```

- **Um motor só.** A bridge não recalcula nada: `panel-model.mjs` apenas apresenta o `jev-output/v1`. O Analyzer e o futuro Robot Executor consomem o mesmo motor.
- **Isolamento do NT8.** O AddOn faz o polling HTTP numa `Task` de background com timeout de 2 s. Com a bridge, um agente ou a internet fora do ar, o painel mostra OFFLINE e o NT8 segue.
- **Agentes não são requisito.** O motor e a bridge funcionam sem Hermes, OpenClaw, Kimi, Claude, GPT e sem internet. A camada de agente serve para enriquecimento, explicação, memória e aconselhamento; nunca é caminho crítico.

## 2. Como iniciar

```
npm run serve                  # LIVE: relay real + bridge + Control Center em http://127.0.0.1:3590/
npm run serve:replay           # REPLAY de fixture (sem relay), mesma bridge/UI
node src/jev/cli.mjs --serve [--replay <jev-input.json>] [--port N] [--interval-ms MS] [--cycles N]
npm run smoke:bridge           # smoke: processo real em LIVE e REPLAY, 7 checks
npm run check:nt8              # compila o AddOn FORA do NT8 (verificação; não instala)
```

Para parar, Ctrl+C. Configs: `config/jev-bridge-v1.json` (host/porta; só loopback) e `config/jev-live-input-v1.json`.

## 3. API da bridge (somente leitura)

| Rota | Conteúdo |
|---|---|
| `GET /` | Control Center (HTML único, sem recursos externos) |
| `GET /jev/v1/health` | status, ciclos, último erro, `read_only: true`, `orders_enabled: false` |
| `GET /jev/v1/state` | modelo do painel `jev-panel/v1` (ver §4) |
| `GET /jev/v1/output` | `jev-output/v1` completo do último ciclo (503 antes do 1º ciclo) |
| `GET /jev/v1/audit` | audit do último ciclo + relatório do adapter |
| `GET /jev/v1/robot` | `{ state: "OFF", can_enable: false, locked_reason, safety }` |

- Qualquer outro método responde **405** (`allow: GET, HEAD`).
- Os headers incluem `cache-control: no-store` e `x-jev-read-only: true`.
- **Host fora de loopback é FATAL.**

## 4. Painel (`jev-panel/v1`)

**Conteúdo:**
- status JEV e modo (LIVE/REPLAY);
- **contexto direcional**: UNKNOWN com explicação, "estado seguro, não falha";
- **robô OFF travado**;
- market state e data quality (fontes e dimensões);
- **dealer context descritivo**: regime 0DTE/next/full, níveis mais próximos, razão DEX put/call; direção DEX, 2ª ordem e skew = UNRESOLVED;
- **SPX context**: efeitos por fonte/dimensão, escalar ou "não derivado";
- reason codes com rótulo, contagem de unresolved, MenthorQ, core_comparison;
- configurações (intervalo de atualização).

**Não mostra probabilidade LONG/SHORT:** `conviction = UNCALIBRATED`, `probability_display = NOT_SHOWN`.

## 5. NT8 AddOn (source only)

- **Arquivo:** `nt8/AddOns/JevControlCenter.cs`. `AddOnBase` adiciona o item "JEV Control Center" ao menu *New* do Control Center e abre uma `NTWindow` com o painel.
- **Verificado:**
  - `npm run check:nt8` compila com êxito (net48, C# 7.3) contra `NinjaTrader.Core.dll`, `NinjaTrader.Gui.dll` e `Newtonsoft.Json.dll` do NT8 instalado;
  - o teste B09 garante que não há API de conta/ordem, que a única URL é loopback, que só há GET em background e que o robô está travado.
- **Não feito (limites do projeto):**
  - copiar para `Documents\NinjaTrader 8\bin\Custom\AddOns`;
  - compilar no editor NinjaScript (F5);
  - abrir no NT8.
  A instalação exige ordem explícita do operador numa fase que autorize tocar o NT8 (ver `nt8/README.md`).

## 6. Testes e smoke

- `npm test`: **46/46** (21 runtime + 15 adapter + 10 bridge/Control Center/AddOn).
- `npm run smoke:bridge`: **7/7** em LIVE (relay real, 15/15 rotas) e em REPLAY.
- `npm run smoke`, `npm run smoke:live`: seguem PASS.

## 7. Fora desta fase (próximas)

- Instalação do AddOn no NT8 (F5), com ordem.
- **JEV ROBOT EXECUTOR:** exige regra direcional ativa (hoje 0), pré-registro de execução, política Core × JEV (hoje UNDEFINED) e ordem. O botão continua travado até lá.
- Integração de agentes (Hermes/OpenClaw): consumidores GET da bridge, assíncronos.
- Reuso do Invictus: não avaliado.
