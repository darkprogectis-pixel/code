# ALFA_OMEGA_SOURCE_INDICATOR_MAP (order §5–§6, 2026-10-05)

> Status: PROMOTED 2026-10-05 from `handoffs/alfaomega-audit/` (proposal ALFA_OMEGA_INDICATORS_AS_JARVIS_REALTIME_BASE §2.3, JEV DIFF A `req_01a10d1a79b377a89322928e6201f604`). Lineage ids: `config/alfaomega-lineage.curated.json` → `ALFA_OMEGA_INDICATOR_LINEAGE.{json,md}`. Documentation only; no NT8/AOT/production change.

Evidence: the α relay headers in `TTW_DarkProjects/AlfaOmegaAlfa{Gamma,Bot,Q,Data,Consolidator}Relay.cs` and `AlfaOmegaRelayEndpoint.cs` (the "QUEM USA" sections), the port scan `NT8_CS_SCAN_20261005.txt`, `HANDOFF_COMPLETO_ALFA_OMEGA_20260911.md` §1.1 (ports verified live on 09-11), and `LEVANTAMENTO_11_INDICADORES_OPCOES_AOT_20260722.md` (endpoints).
A port appearing in a file is not proof of a runtime call: it can come from a comment. The "SWEET consumer" lists below are the authoritative ones, because each relay header declares them.

## 1. The five sources (operator "α" naming) — verdict

The operator's base is the five α families. Each has its own NT8 relay/auth file with the same pattern ("Mesmo padrao do AoAlfaBot / AoAlfaGamma / AoAlfaQ / AoAlfaData", `AlfaOmegaAlfaConsolidatorRelay.cs:3`) and its own JARVIS skill (skill-alpha-gamma/bot/q/data/quant). **Relay ≠ provider:** four of them front an external vendor; α Quant is an internal calculation engine.

| SOURCE_ID | SOURCE_NAME | TYPE | HOST/PORT | Upstream | Auth | SWEET consumers (relay header) |
|---|---|---|---|---|---|---|
| ALFA_GAMMA | SpotGamma capture (`sg-capture-api.js`) | INTERNAL_RELAY over EXTERNAL_DATA_SOURCE (SpotGamma) | :3500 (tunnel gamma.murklogic.site) | api.spotgamma.com | AUTH V2 gamma.read since 2026-09-18 | **12:** Hiro · Trace · TraceCloud · GammaPressure · GexByStrike · VixLine · VolDashboard · OpenFlow · OptionsFlowHiro · DivergenceESX · FlowOneHybrid · CallPutClassing (gamma side) |
| ALFA_BOT | GexBot / GammaGex relay | INTERNAL_RELAY over EXTERNAL_DATA_SOURCE (GexBot) | :3457 (public https://live.murklogic.site) | GammaGex Windows :3530 `/raw` (`AlfaOmegaAlfaBotRelay.cs:27`) | AUTH V2 bot.read | DexGexFlow · NetGex0DTE · Classic · State · Orderflow · ULTIMATE AO mirror (AO_DataLayer) · AoControlCenter (by :3457 literal; confirm per file) |
| ALFA_Q | MenthorQ API | INTERNAL_RELAY over EXTERNAL_DATA_SOURCE (MenthorQ) | :3480 | MenthorQ | AUTH V2 q.read | **1:** MenthorQGammaEngine (ULTIMATE) — /intraday /exposure /daily /levels |
| ALFA_DATA | QuantData API | INTERNAL_RELAY over EXTERNAL_DATA_SOURCE (QuantData) | :3490 | QuantData | AUTH V2 | **3:** QuantDataEngine (/signal /snapshot /exposure /flow) · NetDrift (/flow /dex) · CallPutClassing (/exposure/SPX, data side) |
| ALFA_QUANT | consolidator-engine | CALCULATION_ENGINE (internal; fuses AO tape + QuantData + MenthorQ; "Tier 0 · direção" on 09-11) | :3495 | :5151 tape, :3480, :3490 | AUTH V2 consolidator.read | **1:** Copilot Unificado (/consolidated/ES, /consolidated/NQ) |

Sixth, non-α base: **NT8 / CME market data**, an EXTERNAL_DATA_SOURCE through the broker connection. It reaches NT8 through OnMarketData (tape) and OnMarketDepth (L2/DOM), and is republished by `AlfaOmegaBridge` :5151 (NT8 → HTTP). Consumers: FlowOne (principal), the gen-1 tape/DOM files, Vector/VectorPro/SMC (price only), and the standalone package (AoTapeEngine, AoMarketDataPublisher).

Internal, not sources: AOT BFF :3600 (UI_CONSUMER plus NORMALIZER; it also computes `/api/indicators`), :3601 AOT aux, :3510 aot-replay, :5152 AlfaOmegaTrader/Boleta (EXECUTION, excluded), :5153 CopyEngine (never ran), :3470 GL pipeline (off on purpose).

## 2. SOURCE → ENDPOINT → INDICATOR (active set)

| Indicator (display) | PRIMARY_SOURCE | Endpoint(s) | SECONDARY | Notes |
|---|---|---|---|---|
| FlowOne | CME (NT8) | OnMarketData / OnMarketDepth | SharedState options fields (hybrid verdict, opt-in) | DOM not replayable |
| FlowOne HYBRID | ALFA_GAMMA | one deduplicated :3500 poller | — | 7 layers mirror standalones |
| Copilot Unificado | ALFA_QUANT | :3495 /consolidated/ES, /NQ | SharedState (14 refs) | aggregator / UI |
| ULTIMATE (MenthorQGammaEngine) | ALFA_Q | :3480 /intraday /exposure /daily /levels | ALFA_BOT (AO mirror, ShowAoMirror default false) | |
| Quant AO Engine (QuantDataEngine) | ALFA_DATA | :3490 /signal /snapshot /exposure /flow | — | |
| Net Drift | ALFA_DATA | :3490 /flow /dex | — | |
| Call-Put Classing | ALFA_DATA + ALFA_GAMMA | :3490 /exposure/SPX + :3500 | — | two tokens/scopes |
| Orderflow | ALFA_BOT | :3457 | — | GexBot options orderflow, NOT CME tape |
| Hiro | ALFA_GAMMA | :3500 /hiro/{sym}, /alerts/:sym (HIRO Flow event), /levels/:sym (gammaCurve) | — | the alert rule is vendor-side and UNKNOWN; never reconstruct it |
| OptionsFlow HIRO | ALFA_GAMMA | :3500 /tape/{sym}/options?scope=session, /flow/:sym?type=sweep | — | `FlowSymbol` property |
| GammaPressure | ALFA_GAMMA | :3500 /gseries + /grid/ES?participant=dealer | — | ES hardcoded (07-28); only formula approved in backtest (07-22) |
| GexByStrike | ALFA_GAMMA | :3500 /grid/ES?metric=gex&participant=dealer | — | refuses ≠ ES (07-28) |
| OpenFlow | ALFA_GAMMA | :3500 /gseries/ES + /hiro/SPX | — | |
| Trace | ALFA_GAMMA | :3500 /grid/ES?metric= + /levels/ES | — | ES hardcoded |
| TraceCloud | ALFA_GAMMA | :3500 /cloud/ES?mode=strike&metric=gamma&participant=dealer | — | full matrix stays server-side |
| VixLine | ALFA_GAMMA | :3500 /vix/series | — | |
| VolDashboard | ALFA_GAMMA | :3500 /levels/all + /equities/historical?days=20 | — | feeds AOT narrator marketContext |
| Divergence ESX | ALFA_GAMMA | :3500 /divergence/es-spx-vix | — | StaleSeconds 120 mandatory |
| DexGexFlow | ALFA_BOT | :3457 classic.zero_gamma + levels.* | — | JEV four-source input |
| NetGex0DTE | ALFA_BOT | :3457 instruments.<sym>.gex.net_0dte | — | series built locally (warm-start) · JEV four-source input |
| Classic | ALFA_BOT | :3457 | — | JEV four-source input |
| State | ALFA_BOT | :3457 | — | JEV four-source input |
| Vector Pro | CME (NT8 price) | — | Vector (`TaFilterFactor`, `VectorDir_*`) | |
| Control Center | :3457 / :3500 / :3600 / :5152 | — | — | CONTROL_UI, order-capable; observational states only |

Field-level REQUIRED/OPTIONAL/DERIVED/UNITS/CADENCE per indicator are still UNKNOWN in this map. They come from `ALFA_OMEGA_API_MAP` (45 rows, commit cf4be1f) plus the α skills. Do not invent them.

## 3. Real-time layer implication (order §18)
One snapshot per SOURCE per cycle: :3500, :3457, :3480, :3490, :3495 and the NT8 bridge :5151. Every indicator state above is derived from those six snapshots, never from per-indicator polling. JARVIS never calls :5152.
