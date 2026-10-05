# ALFA_OMEGA_CONFLUENCE_MODEL (order §16–§17, 2026-10-05)

> Status: PROMOTED 2026-10-05 from `handoffs/alfaomega-audit/` (proposal ALFA_OMEGA_INDICATORS_AS_JARVIS_REALTIME_BASE §2.3, JEV DIFF A `req_01a10d1a79b377a89322928e6201f604`). Lineage ids: `config/alfaomega-lineage.curated.json` → `ALFA_OMEGA_INDICATOR_LINEAGE.{json,md}`. Documentation only; no NT8/AOT/production change.

Implemented (shadow, read-only) in `tools/jarvis/aot/realtime/` — tests `test/jarvis/aot-realtime.test.mjs`. JARVIS never calls :5152 and never sends an order.

## 1. Model

Pipeline: observations → group by role → bullish evidence / bearish evidence → confirmations → contradictions → blockers → stale/missing → regime → MARKET_VIEW.

1. Only DIRECTION-role, FRESH, deterministic states contribute direction: FlowOne ME/MVI/CONF signs and the published ALFA_QUANT direction. Each capability counts ONCE (FlowOne vs AoTapeEngine duplicate writer → one).
2. CONFIRMATION: HIRO (HiroDir) and MenthorQ. MenthorQ is POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING: misaligned, neutral or stale has zero effect, and it never originates a side and never blocks.
3. CONTEXT/STRUCTURE/REGIME (GammaPressure, Trace, GexByStrike, VixLine, VolDashboard, DivergenceESX, the four JEV dealer sources) explain the view but never vote. The four dealer sources belong to the JEV 190-field contract, so JARVIS shows the JEV classification and does not re-derive it.
4. MARKET_VIEW ∈ STRONG_BULLISH … STRONG_BEARISH · INSUFFICIENT_DATA. STRONG_/LEAN_ grades stay NOT_DEFINED until thresholds are preregistered, so V1 emits at most BULLISH/NEUTRAL/BEARISH/INSUFFICIENT_DATA. A missing required direction input gives INSUFFICIENT_DATA (CONF03).
5. Every view carries WHY, SUPPORTING_INDICATORS, CONTRADICTING_INDICATORS, BLOCKERS, STALE, MISSING, REGIME, DATA_SOURCES and SKILL_CONTEXT (CONF01).
6. BUY/SELL: final interpretation only, as BUY_BIAS · SELL_BIAS · WAIT · NEUTRAL · INSUFFICIENT_DATA. It is never produced from one indicator (CONF02) unless an explicit documented rule exists; today the only such rule is the ALFABOT engine's published signal, which is shown and not recomputed. Rule 10 of 09-11 applies: structure, never an entry criterion without preregistration.
7. Core × JEV fusion stays UNDEFINED (CLAUDE.md). The JARVIS view is advisory and separate from the JEV classification.


## 2. Implementation notes (V1, `tools/jarvis/aot/realtime/confluence.mjs`)
- Required direction input: `src:ALFA_QUANT` (fresh). Without it ⇒ INSUFFICIENT_DATA. FlowOne ME/MVI/CONF do not vote in V1 (not readable; see the observation schema §4).
- Votes are deduplicated by independence group (`G_QUANT_DATA` = α Quant + α Data ⇒ one vote).
- `grade` = NOT_DEFINED and `bias` = NOT_DEFINED always: V1 never emits STRONG_/LEAN_ or BUY_BIAS/SELL_BIAS. The ALFABOT published signal is shown elsewhere and is not recomputed here.
- `blockers` are data-quality items (source ERROR / INVALID), not trade gates.
- Output `alfa-omega-market-view/v1` is advisory only; `core_jev_fusion` = UNDEFINED.
