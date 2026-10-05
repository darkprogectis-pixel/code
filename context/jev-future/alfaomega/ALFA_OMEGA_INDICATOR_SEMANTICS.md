# ALFA_OMEGA_INDICATOR_SEMANTICS (order §7–§10, 2026-10-05)

> Status: PROMOTED 2026-10-05 from `handoffs/alfaomega-audit/` (proposal ALFA_OMEGA_INDICATORS_AS_JARVIS_REALTIME_BASE §2.3, JEV DIFF A `req_01a10d1a79b377a89322928e6201f604`). Lineage ids: `config/alfaomega-lineage.curated.json` → `ALFA_OMEGA_INDICATOR_LINEAGE.{json,md}`. Documentation only; no NT8/AOT/production change.

Rule: FUNCTION/ROLE and the state mapping are written ONLY where code or a handoff proves them. Everything else stays UNKNOWN. UNKNOWN ≠ NEUTRAL. STALE never produces a direction. Base: `context/jev-future/alfaomega/ALFA_OMEGA_SIGNAL_SEMANTICS.md` (18 VERIFIED rows), the lineage, the source map, and the `HANDOFF_COMPLETO_ALFA_OMEGA_20260911.md` rule 10 ("no indicator becomes an entry criterion without preregistration + approved test — it is structure, never signal").

## 1. Native direction fields that exist in code (the only deterministic directional raw values)

| Field (AlfaOmegaSharedState.cs) | Values | Writer | Evidence |
|---|---|---|---|
| `MeDirection[_sym]` | +1 compra · −1 venda · 0 neutro | FlowOne (ex-Nexus) | :176 |
| `MviDirection[_sym]`, `MviIsReversal` | int sign, bool | FlowOne (ex-Pulse) | :177–179 |
| `HiroDir` | +1/−1/0 = recent slope of the cumulative HIRO | Hiro / OptionsFlowHiro chain | :320 |
| `OfhNet`, `OfhSweep` | double (sign = side) — ONE source | OptionsFlowHiro / FlowOneHybrid | :335–336 |
| `Press_ES/NQ/GC/SI` | double (sign = side, minForce 0.03 in AoGate.EsNq) | FlowOne (P1S validity: AoPressSessao) | :525, :846 |
| `VectorDir_ES/NQ/GC` | int | Vector | :568 |

⚠️ **Hidden substitution:** `GetMeDir()` (:461) returns `VectorDir_ES` (trend) when `MeDirection_ES` is stale (`FallbackSec_ES`). The real-time layer must read the raw fields and tag the result `ME_FALLBACK_TO_VECTOR`, so a trend direction is never reported as order flow.

Deterministic state mapping allowed today: sign(+1) → BULLISH, sign(−1) → BEARISH, 0 → NEUTRAL, but ONLY when the field is FRESH. STRONG_/LEAN_ grades have no documented thresholds, so they are NOT_DEFINED. Stale or missing → STALE / UNKNOWN, never NEUTRAL.

## 2. Role per active indicator

| Indicator | ROLE | MARKET_DIMENSION | Evidence | State mapping |
|---|---|---|---|---|
| FlowOne | DIRECTION (classification only) | ORDER_FLOW, AGGRESSION, ABSORPTION, EXHAUSTION, LIQUIDITY | ME/MVI/CONF publishers (§1); verdict mode SoCmeFluxo | sign of ME/MVI/CONF (fresh) |
| FlowOne HYBRID | CONTEXT | OPTIONS_FLOW, GAMMA | layers mirror standalones (LIFE04) | none (render layers) |
| Copilot Unificado | AGGREGATOR / UI_CONSUMER of the ALFA_QUANT direction | CONFIRMATION | header: consumer of :3495, LONG/SHORT/NEUTRO palette | mirrors the :3495 verdict; never re-derives it |
| ALFA_QUANT consolidator (:3495) | DIRECTION ("Tier 0 · direção") | — | 09-11 §1.1/§5.1 | as published |
| Hiro | CONFIRMATION | OPTIONS_FLOW, DELTA | AOT C2 `hiroConfirm` (09-11 §5.1); `HiroDir` | sign of HiroDir (fresh). The HIRO Flow alert is a vendor event, outside conviction |
| OptionsFlow HIRO | CONTEXT | OPTIONS_FLOW | catalog VERIFIED CONTEXT_NOT_SIGNAL; sweep side by rule §BH | OfhNet+OfhSweep = one vote (FlowOne OptionsScore) |
| GammaPressure | REGIME | GAMMA, REGIME | catalog VERIFIED GAMMA_REGIME; only formula approved in backtest (07-22) | regime mapping NOT_DEFINED |
| OpenFlow | CONTEXT | OPTIONS_FLOW | catalog VERIFIED CONTEXT_NOT_SIGNAL | none |
| Divergence ESX | CONTEXT | DIVERGENCE, VOLATILITY | catalog VERIFIED CONTEXT_NOT_SIGNAL; service returns the verdict | as published; StaleSeconds 120 |
| Trace | STRUCTURE | DEALER_POSITIONING, GAMMA (walls per participant) | survey 07-22 #8 | levels, no direction |
| TraceCloud | STRUCTURE | GAMMA | survey 07-22 #9 (derived summary) | levels, no direction |
| GexByStrike | STRUCTURE | GEX | survey 07-22 #4 | levels, no direction |
| VixLine | CONTEXT | VOLATILITY | survey 07-22 #10 | none |
| VolDashboard | CONTEXT | VOLATILITY | survey 07-22 #11 (narrator marketContext) | none |
| DexGexFlow · NetGex0DTE · Classic · State | CONTEXT (JEV_FOUR_SOURCE_INPUT) | DEX, GEX, DEALER_POSITIONING | catalog VERIFIED; CLAUDE.md full input invariant | owned by JEV (190 fields); JARVIS never re-derives |
| ULTIMATE (MenthorQ) | CONFIRMATION — POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING | DEALER_POSITIONING, STRUCTURE | CLAUDE.md MenthorQ policy; skill-alpha-q | aligned = +confirmation; anything else = zero effect |
| Quant AO Engine (QuantData) | CONTEXT (consolidator "impulso" input) | MOMENTUM, OPTIONS_FLOW | Unificado header ("QuantData impulso"); skill-alpha-data | as published by the QD engine |
| Net Drift | UNKNOWN | OPTIONS_FLOW | header (calls/puts/underlying lines + delta_lean) | UNKNOWN |
| Call-Put Classing | UNKNOWN | OPTIONS_FLOW | — | UNKNOWN |
| Orderflow (GexBot) | UNKNOWN | OPTIONS_FLOW (not CME tape) | header | UNKNOWN |
| Vector Pro | CONTEXT (trend) | TREND | runbook "trend core + 2 sets ATR" | UNKNOWN (no documented mapping) |
| Control Center | CONTROL_UI | — | order-capable | observational states only; never a signal |

## 3. Skills (order §10)
After the deterministic state: skill-alpha-{gamma,bot,q,data,quant} plus the SpotGamma/MenthorQ corpora may explain, relate, compare and contextualize. They never change raw_value, state, thresholds or freshness, and never turn FAIL into PASS (SEM04).

## 4. Gaps
STRONG/LEAN thresholds: none documented. GammaPressure regime levels: not read. Field units: mostly UNKNOWN (catalog). Roles for NetDrift, CallPutClassing, Orderflow, VectorPro: UNKNOWN until their render/publish code is read.
