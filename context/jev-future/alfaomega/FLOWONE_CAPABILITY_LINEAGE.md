# FLOWONE_CAPABILITY_LINEAGE (order §11, 2026-10-05)

> Status: PROMOTED 2026-10-05 from `handoffs/alfaomega-audit/` (proposal ALFA_OMEGA_INDICATORS_AS_JARVIS_REALTIME_BASE §2.3, JEV DIFF A `req_01a10d1a79b377a89322928e6201f604`). Lineage ids: `config/alfaomega-lineage.curated.json` → `ALFA_OMEGA_INDICATOR_LINEAGE.{json,md}`. Documentation only; no NT8/AOT/production change.

Code base: `~/Documents/NinjaTrader 8/bin/Custom/Indicators/TTW_DarkProjects/AlfaOmegaFlowOne.cs` (4739 lines, mtime 2026-10-02; 4259 lines on 2026-09-11) and `AlfaOmegaFlowOneHybrid.cs` (3464 lines, 2026-09-18).
Line numbers refer to the files on 2026-10-05. Lineage ids are in `config/alfaomega-lineage.curated.json`.

## 1. FLOWONE PRINCIPAL vs FLOWONE HYBRID (proven separation)

| | FlowOne PRINCIPAL (`AlfaOmegaFlowOne.cs`) | FlowOne HYBRID (`AlfaOmegaFlowOneHybrid.cs`) |
|---|---|---|
| Identity | "peça única de order flow" (:24) | "variante ISOLADA … camadas de OPÇÕES/GEX" (header L1–30) |
| Market data | CME tape + DOM via NT8 (OnMarketData / OnMarketDepth :1481) | :3500 SpotGamma only (one deduplicated poller) |
| Options | none by default; opt-in hybrid VERDICT reads options state from SharedState (consumer) | 7 drawing layers: VixLine, OptionsFlow (HIRO), OpenFlow, TraceCloud, GexByStrike, HiroLayer, Trace (toggles L412–430) |
| Counting rule | capabilities below = FLOWONE_INTERNAL | its layers = FLOWONE_HYBRID; each also exists standalone (PARITY rule 2026-08-02) ⇒ count the capability ONCE |

GammaPressure and NetGex0DTE stay standalone (operator decision, IsOverlay=false). DexGexFlow is "prevista" in Hybrid without a toggle ⇒ not a Hybrid layer.

## 2. Capability lineage (PRINCIPAL)

| Capability | Original component (gen-1) | Current module in FlowOne | Raw input | Lifecycle | Evidence |
|---|---|---|---|---|---|
| Footprint engine (bid/ask per price) | none (new 2026-07-22) | BLOCO 1 | CME tape (NT8) | FLOWONE_INTERNAL | :42 |
| MVI direction | AlfaOmegaPulse | BLOCO 1 → `MviDirection[_ES/_NQ/_GC/_RTY/_CL/_SI]`, `MviIsReversal` | CME tape | FLOWONE_INTERNAL (Pulse MERGED) | :501, :4619 |
| ME direction | AlfaOmegaNexus | BLOCO 1/3 → `MeDirection[_sym]` | CME tape | FLOWONE_INTERNAL (Nexus MERGED) | :501, :4619 |
| CONF (ME × MVI) | AlfaOmegaFusion | `EnableConf = true` default | ME + MVI | FLOWONE_INTERNAL (Fusion MERGED) | :501, :1034 |
| ICE (iceberg) | AlfaOmegaPhantom (overlap) | BLOCO 1, Hub event ICE | CME tape | FLOWONE_INTERNAL; Phantom standalone lifecycle UNKNOWN | :26, :732 |
| STOP (stop-run) | AlfaOmegaStops (overlap) | BLOCO 1, Hub event STOP | CME tape | FLOWONE_INTERNAL; Stops standalone lifecycle UNKNOWN | :26, :732 |
| Pressure/Depth (DOM imbalance) | AlfaOmegaPressure, AlfaOmegaDepth | BLOCO 2 overlay/HUD; `Press_ES/NQ/GC/SI` | DOM L2 | FLOWONE_INTERNAL (both MERGED) | :44, :302, :1479–1498 |
| Velocity (pace + speed) | AlfaOmegaVelocity | BLOCO 2 | CME tape | FLOWONE_INTERNAL (MERGED) | :44, :308, :1430 |
| Marker (DOM top-N + spikes) | AlfaOmegaMarker | BLOCO 3 | DOM L2 | FLOWONE_INTERNAL (MERGED) | :45, :399 |
| Tape markers Sweep/Absorption/Reversal/Exhaustion | AlfaOmegaNexus | BLOCO 3 | CME tape | FLOWONE_INTERNAL | :46, :1777 |
| Imbalance/POC/value area (Lote A) | none — semantic reconstruction (OFTrader config numbers only) | BLOCO 4 | footprint | FLOWONE_INTERNAL | :418, :867 |
| Delta stacks/breakout/surge/tails (Lote B) | reconstruction | BLOCO 4 | footprint | FLOWONE_INTERNAL | :431, :906 |
| Naked POC (Lote C) | reconstruction | BLOCO 4 | footprint | FLOWONE_INTERNAL | :443, :956 |
| Auction / exhaustion (Lote D) | reconstruction | BLOCO 4 | footprint | FLOWONE_INTERNAL | :982 |
| SharedState publish (price/tape/direction bus) | AlfaOmegaNexus/Pulse publishers (retired) | `LastPrice[_sym]`, `LastUpdate_*`, `TapeDeltaUsd`, `TapeVolumeUsd`, `TapeUpdate`, `LastEvent`, `LastSignalTime`, `Raio*` | — | FLOWONE_INTERNAL | write scan (29 targets) |
| Hub tape publish (AoTapeStyle) | Phantom/Stops/Gravity/Pressure/Nexus/Pulse feeders | events SWP/STOP/ICE/EXH/ABS/REV | — | FLOWONE_INTERNAL; turn off if standalones on chart (double count) | :732 |
| LLM reading | none | BLOCO 1 (`FoLlmProvider` DeepSeek/OpenAI/Groq/Custom) | FlowOne state | FLOWONE_INTERNAL (narration, not a signal) | :25, :49 |
| Hybrid VERDICT mode | none (2026-08-05) | `AoVeredictoModo { SoCmeFluxo (default), Hibrido }`; `OptionsScore()` | SharedState `HiroDir`, `OfhNet`+`OfhSweep` (ONE source), Ω Pressão | FLOWONE_INTERNAL, opt-in; CONSUMER of options state, does not produce it | :65, :3488–3512 |

Excluded on purpose: Vision ("SEM Vision", :39). Not covered: Gravity, TrackerPro.

## 3. Rules the JARVIS real-time layer must keep

1. Never count a merged gen-1 module next to its FlowOne capability (LIFE02).
2. Hybrid layers are not FlowOne principal (LIFE04). Each one maps to its standalone indicator.
3. In `SoCmeFluxo` (default) the options score does not exist (it is not zero-weighted). Report it as NOT_APPLICABLE, not NEUTRAL.
4. In `OptionsScore()`, `OfhNet` and `OfhSweep` are ONE source (same endpoint response).
5. Ω Pressão is directional despite the open §BI ambiguity (~19–22.7% of trades diverge). Operator directive 2026-08-05: lower weight; it modulates and never decides alone.
6. Options freshness inside the verdict is 120 s (`fr`, :3504). Treat it as a code fact, not a JEV threshold.
7. Under Tick Replay, the DOM capabilities (Marker/Pressure/Depth) and the hybrid sub-panel do not reconstruct (:1197). Mark them UNAVAILABLE in replay.
8. **Two writers of the same bus:** `AoTapeEngine.cs` is a verbatim port of the FlowOne core for the standalone package, and `AoMarketDataPublisher.cs` publishes ES/NQ tape/spot to SharedState. Take one writer and flag the other as a duplicate.

## 4. Open points (need evidence)
- The +480 lines between 09-11 and 10-02: is HANDOFF_FLOWONE_EXHAUSTION_V1_E1_20260923 the cause? Not read yet.
- Which instruments publish in practice (ES/NQ certain; GC/RTY/CL/SI fields exist).
- Ω Pressão producer (GammaPressure? FlowOneHybrid?): check the writer of the SharedState field read at :3512+.
