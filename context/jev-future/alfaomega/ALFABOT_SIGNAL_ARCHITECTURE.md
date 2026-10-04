# ALFABOT SIGNAL — architecture (signal engine vs explanation engine)

Date: 2026-10-04 · loop `jf-20261004123720-84ace9` · proposal R2 (`handoffs/jarvis/PROPOSAL_R2_JARVIS_AOT_ALFAOMEGA_SIGNAL_INTEGRATION_20261004.md`, JEV DIFF A `req_01a106eb857971b1b64a92536b2629e5`)

## 1. Signal engine (production, UNCHANGED, read-only)

| Stage | Producer | Rule |
|---|---|---|
| Gate ES×NQ | NT8 `AoGate.EsNq` via AO bridge :5151 | anchor strength 4/4, direction LONG/SHORT |
| Consolidation | `consolidator-engine.js` `computeConsolidated` (60 s snapshot, no latch) | candidate per symbol, CONFLUENTE / DIVERGENTE |
| Prefilter | `consolidator-engine.js` | confidence ≥ 75 (`TG_MIN_CONF`), 30 min cooldown (flip exempt) |
| Final gate | `alfabot-signal.js` `finalSignalGate` | reactor_pct > 65 with signals ≤ 120 s (both sessions); outside RTH also needs the strategy family side equal to the direction |
| Canonical state | `alfabot-signal.js` `canonicalState` | outside RTH: valid trade plan (MenthorQ levels) is required |
| Publish | AOT BFF `GET /api/alfabot-signal` | uiState BUY / SELL / other |

`SIGNAL_ENGINE_CHANGES = 0`. No threshold was changed. The audit found no bug, no wrong field mapping and no impossible condition (see §4).

## 2. Explanation engine (new, `tools/jarvis/aot/alfabot-explain.mjs`)

This is a pure ES module. The JARVIS server uses it, and the browser loads the same file from `/aot/alfabot-explain.mjs`. It never creates a direction:

- BUY or SELL is shown only when the engine itself published BUY or SELL, and no REQUIRED condition is FAIL or UNKNOWN. This is fail-closed display.
- If the matrix disagrees with the engine, the explanation engine flags `ENGINE_MATRIX_MISMATCH` and shows WAIT. It never "corrects" the engine.
- Knowledge from skills and courses is returned in a separate `knowledge` array and cannot change any row (test SIG05).

### Condition rows (funnel order C1 → C2 → C3 → C4 → C5 → C8 → C6 → C7 → C10)

| Row | Indicator | Source | Threshold | Contribution |
|---|---|---|---|---|
| C1 | ALFABOT snapshot (α Quant) | AOT BFF `/api/alfabot-signal` | age ≤ 120 s | REQUIRED_DATA |
| C2 | AO bridge :5151 + tape | `/state.gate` | online && tapeLive | REQUIRED_DATA |
| C3 | Gate 1 anchor ES×NQ | AoGate.EsNq | strength 4/4 and direction set | REQUIRED |
| C4 | Consolidated direction | α Quant | state ≠ STAND_DOWN, direction ≠ NEUTRO | REQUIRED |
| C5 | Confidence | `/state.symbols[sym].tier0.confidence` | ≥ 75 | REQUIRED |
| C8 | Cooldown | consolidator prefilter | 30 min (flip exempt) | REQUIRED |
| C6 | Reactor | relay :3457 signals `reactor_pct` | > 65, signals ≤ 120 s | REQUIRED |
| C7 | Strategy (α Q family) | relay :3457 `signals.strategies` | single side = direction (outside RTH) | REQUIRED outside RTH |
| C10 | Trade plan | `alfabot-signal.js` plan | coherent levels | REQUIRED outside RTH, DISPLAY_ONLY in RTH |
| C11 | α Q RTH confirmation | MenthorQ | aligned ⇒ confirms, anything else ⇒ zero effect | CONFIRMATION_ONLY |
| C9 | Sampling | 60 s Consolidator vs ~20 s robot with latch | informational | NOT_APPLICABLE |

When the session is unknown, the explanation engine applies the OUTSIDE rule, which is the most restrictive.

Result values are PASS, FAIL, UNKNOWN, NOT_EVALUATED and NOT_APPLICABLE. UNKNOWN is never turned into FAIL, and missing data is never turned into zero.

### Aggregate (deterministic)

1. C1 or C2 not PASS ⇒ `INVALID_DATA`.
2. Engine published BUY/SELL ⇒ that signal if there are no blocking rows; otherwise `WAIT` with `ENGINE_MATRIX_MISMATCH`.
3. C3 or C4 FAIL ⇒ `NEUTRAL` (no candidate).
4. Otherwise ⇒ `WAIT`. `why_not` names the first blocking row in funnel order.

Status (qualitative, not a probability): `INVALID`, `DEGRADED` (some row not LIVE) or `LIVE`. The output also includes `conditions_total`, `passed`, `failed`, `unknown`, `blocking_conditions`, `confirmations`, `invalidation`, `why_now` and `why_not`.

`deadConditions(rules)` (SIG08) detects impossible thresholds, such as confidence > 100 or reactor ≥ 100. The canonical constants contain none.

## 3. UI

`/aot/alfabot` is served by JARVIS (:3594) and uses the AOT theme tokens. It shows, per symbol, the aggregate and a ✓/✕/?/·/— confluence list. It also shows the 10-column matrix (INDICATOR, SOURCE, VALUE, STATE, CONDITION, THRESHOLD, RESULT, FRESHNESS, CONTRIBUTION, EXPLANATION), why and why-not, the invalidation, and JARVIS Q&A. If `/api/aot/signal` fails, the browser runs the same explanation module locally. It shows "JARVIS e AOT indisponíveis" when the AOT is unreachable too.

## 4. Root cause — why signals rarely fire (read-only audit, MEDIUM-HIGH)

The robot and ALFABOT consume the **same** gate output. After that gate, ALFABOT adds stages the robot does not have:

- a per-leg confidence ≥ 75 (the DIVERGENTE leg is dropped);
- reactor > 65;
- outside RTH, the MenthorQ strategy side must equal the direction. This is the dominant block: 42 STRATEGY_MISMATCH;
- a 30 min cooldown;
- 60 s sampling without a latch, which misses short PASS windows.

Counts from 3 352 cycles, 160 directional legs: 95 below threshold, 42 strategy mismatch, 8 strategy unavailable, 13 reactor, 2 cooldown, 0 sent.

The four 10-02 RTH examples are TEST_RT injections that never pass through the gate.

The hypothesis "missing skill" is REJECTED as a cause. Skills only improve the explanation.
