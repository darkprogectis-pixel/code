# HANDOFF — JEV FUTURE · LIVE INPUT ADAPTER V1 (24/09/2026) — EM ANDAMENTO

Partida: commit `774b198` (JEV Runtime V1 operacional). Ordem: adapter SOMENTE LEITURA relay real → jev-input/v1 → motor único → jev-output/v1, e corrigir o bootstrap (CLAUDE.md / START_HERE.md).

| Etapa | Estado |
|---|---|
| 0. bootstrap docs | **DONE** (CLAUDE.md, START_HERE.md) |
| A. source discovery | **DONE** (ver abaixo) |
| B. mapping | **DONE**: `data/jev-live-relay-mapping-v1.json` (190 linhas: 126 MAPPED · 35 NOT_PRESENT_IN_CURRENT_RELAY · 29 SOURCE_NOT_AVAILABLE) |
| C. implementation | **DONE**: `src/jev/adapters/{relay-client,relay-mapping,live-relay-adapter,live-loop}.mjs` + `--live` na CLI; 1º ciclo real: 15/15 rotas OK, 122/190 campos, UNKNOWN, 0 ordens |
| D. tests | **PASS 36/36** (21 runtime + 15 adapter contra relay falso local) |
| E. live smoke | **PASS 7/7** contra o relay real (3 ciclos, 15/15 rotas, OUTSIDE_RTH ⇒ MARKET_CLOSED) + fail-soft (porta morta) |
| F. commit/push | commit `Connect JEV Runtime V1 to live market relay` (o que contém este arquivo), push `origin main` |

Invariantes: sem ordens, sem NT8, sem F5, produção intocada, Core×JEV UNDEFINED, 20–40 pregões = FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING.

## A. Source discovery (read-only; 24/09 ~04:35Z, mercado fechado)
- Cadeia (auditoria A-BOT + probe gravado + GET ao vivo): vendor gammagex.online → `gammagex-api` **127.0.0.1:3530** → relay **127.0.0.1:3457** (`/gexbot/*`, cache TTL 20 s, bloco `_relay`).
- Rotas usadas pelo adapter (todas GET):
  - `/gexbot/orderflow/ES_SPX` → orderflow cru do vendor (`zgr, ogr, zcvr, net_dex, …`); whitelist do relay = `ES_SPX, NQ_NDX` (`/gexbot/orderflow/SPX` → 400).
  - `/gexbot/classic/SPX/{zero,one,full}` → `ticker=ES_SPX`, strikes `[strike, gex_vol, gex_oi, [5 priors]]`, `max_priors [[strike, v]×6]`, `_relay{ticker,cat,…}`.
  - `/gexbot/state/SPX/gex_{zero,one,full}` (formato classic) e `/gexbot/state/SPX/{delta,gamma,vanna,charm}_{zero,one}` (`mini_contracts [strike,a,b,c,[x,y,z],0,null]`, `_relay.grade/n/tem_majors`).
- **Proibido/evitado:** raiz `/` (documento composto). Atenção: `/gexbot/orderflow` sem ticker e `/health` do relay **devolvem a raiz** → o adapter nunca os chama.
- `:3530/health` expõe estado de token (não logado); o adapter não usa :3530 (o relay já é a fonte canônica read-only).
- Nomes do contrato (`abot.root.gex.net_0dte` etc.) vêm da raiz; o mapeamento raw→feature foi verificado por **identidade de valor** (36/36 campos numéricos + timestamp, mesmo vendor ts) contra UMA leitura da raiz usada só como evidência de discovery. `pc_oi` = |net_put_dex|/|net_call_dex| (3.6202 vs 3.62, identidade CONFIRMED).
- Vendor ts de todas as rotas = 1790193598 (fechamento 23/09); agora fora do RTH ⇒ MARKET_CLOSED esperado.

## B–E. Resultado
- **Mapeamento:** `context/jev-future/data/jev-live-relay-mapping-v1.json` (fonte: `src/jev/adapters/relay-mapping.mjs`; `npm run build:mapping`, guard PASS, determinístico).
  - Status estático: MAPPED 126 (orderflow 38, classic 26, state_gex 29, state_greek 33) · NOT_PRESENT_IN_CURRENT_RELAY 35 · SOURCE_NOT_AVAILABLE 29.
  - Status ao vivo (24/09 04:43Z): MAPPED_AVAILABLE 113 · SEMANTICALLY_UNRESOLVED 9 · MAPPED_CURRENTLY_NULL 4 · NOT_PRESENT 35 · SOURCE_NOT_AVAILABLE 29. O runtime recebeu 122/190 (reconciliado 1:1 com o adapter).
- **Implementação:**
  - `src/jev/adapters/{relay-client,relay-mapping,live-relay-adapter,live-loop}.mjs`;
  - `--live` na CLI;
  - `config/jev-live-input-v1.json` (read_only obrigatório, host/porta fora do motor, poll 30 s, mínimo 5 s).
- **Extensões do runtime (aditivas, retrocompatíveis):**
  - `jev-input/v1.adapter_issues[]` ⇒ reason_codes;
  - `sources[FR].observed_frozen` ⇒ freshness `FROZEN` (só no RTH) + `RC_DQ_SOURCE_FROZEN`;
  - `createRuntime(cfg, overrides)` para limiares PROVISIONAL vindos da config live, com audit.
- **FROZEN:** vendor ts repetido ≥ 3 leituras consecutivas no RTH com chegada avançando (contrato `FR_ROOT_ORDERFLOW.frozen`). FROZEN_VALUES entre pregões = open item.
- **Freshness:** limiares PROVISIONAL do contrato inalterados; TRACE/MenthorQ UNKNOWN por padrão (nem passam pelo relay).
- **Evidência sanitizada:** `context/jev-future/runtime-examples/jev-live-smoke-evidence-v1.json` (estados, contagens e códigos; nenhum valor de mercado).
- **Docs:** `context/jev-future/JEV_LIVE_INPUT_ADAPTER_V1_20260924.md`; `JEV_RUNTIME_V1_20260924.md` com o backlog atualizado; `CLAUDE.md` e `START_HERE.md` corrigidos.
- **Test 20 do runtime:** agora varre `adapters/`. O motor não tem rede nem fonte específica; só `relay-client.mjs` usa `node:http`, e só GET.
- **Ctrl+C:** a parada limpa é testada via AbortController (A15). No Windows, SIGINT programático não é emulável em teste; o operador valida o Ctrl+C manual.

## Open items (NON-BLOCKING)
- Feriados na sessão por relógio.
- FROZEN_VALUES entre pregões.
- Freshness por instância.
- TRACE/VolSignals fora do relay.
- MenthorQ só na raiz.
- SPY opcional (`secondary_tickers`).
- POST_LAUNCH_REFINEMENT_BACKLOG anterior: R2, R6, G1/G2, E1–E7.

## NEXT PHASE: JEV NT8 AGENT / BOT CONTROL CENTER V1 (NÃO iniciado)

```
JEV SHARED ENGINE (src/jev/engine.mjs — único)
      ├── JEV ANALYZER        (leitura/exibição)
      └── JEV ROBOT EXECUTOR  (futuro; exige fase própria, pré-registro e ordem)
```

**UI inspirada no modelo do operador:**
- painel lateral;
- status JEV, market state, directional context, data quality, dealer context, SPX context;
- reason codes, unresolved;
- botão ROBÔ OFF/ON;
- configurações.

**Não mostrar** probabilidade LONG/SHORT enquanto não houver probabilidade calibrada (conviction = UNCALIBRATED).

**AGENT GATEWAY: OPTIONAL / ASYNC** (candidatos: Hermes, OpenClaw ou equivalente).
- Nunca dentro do thread ou processo crítico do NT8.
- O JEV Engine continua funcionando se Hermes, OpenClaw, Kimi, Claude, GPT ou a internet caírem.
- Agent layer = enrichment / explanation / memory / advisory.
- Shared JEV Engine = motor canônico de análise.

Não construído nesta fase: Control Center, Analyzer UI, botão do robô, NT8 AddOn, reuso do Invictus, Hermes, OpenClaw.

## Próximo passo exato
1. O operador roda `npm test`, `npm run smoke:live` e `npm run live:once` (idealmente também no RTH, para ver FRESH).
2. Ctrl+C manual em `node src/jev/cli.mjs --live`.
3. Com ordem explícita, abrir a fase JEV NT8 AGENT / BOT CONTROL CENTER V1.
