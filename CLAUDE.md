# ALFA OMEGA JEV FUTURE — CLAUDE CODE BOOTSTRAP

## First action in every new session

Read first:

`context/jev-future/HANDOFF_JEV_FUTURE_20260923.md` (history up to Decision Logic V1)

Then the most recent phase handoffs in `handoffs/` (newest last):

- `handoffs/HANDOFF_JEV_PREREG_INTEGRATED_20260924.md` — preregistration REVIEWED / STRUCTURALLY CONSOLIDATED
- `handoffs/HANDOFF_JEV_RUNTIME_V1_20260924.md` — JEV Runtime V1 implemented
- `handoffs/HANDOFF_JEV_LIVE_INPUT_V1_20260924.md` — live input adapter (done, `6ecb18d`)
- `handoffs/HANDOFF_JEV_CONTROL_CENTER_V1_20260924.md` — NT8 Agent / Bot Control Center V1 (current)

Then read only the minimum canonical files referenced by those handoffs.

Do not reconstruct the project from old conversations or unrelated workspaces.

---

## Project identity

PROJECT: ALFA OMEGA JEV FUTURE

STATUS: RUNTIME V1 OPERATIONAL (classification only) — design/preregistration history preserved below

PRIMARY MARKET: ES FUTURES

PRIMARY OPTIONS / DEALER ECOSYSTEM: SPX / SPY

NQ: SECONDARY / OPTIONAL — NOT ACTIVE IN V1

IMPLEMENTATION: JEV RUNTIME V1 — IMPLEMENTED / OPERATIONAL

VERSION: jev-runtime/v1.0.0 (commit 774b198)

TESTS: 21/21 PASS · SMOKE: PASS · END-TO-END: PASS

TRADE EXECUTION: DISABLED (JEV_CAN_SEND_ORDER / EXECUTE_TRADE / MODIFY_NT8 / OVERRIDE_CORE = false, constants)

REAL MARKET ADAPTER: LIVE INPUT ADAPTER V1 OPERATIONAL (read-only relay 127.0.0.1:3457 /gexbot/*, commit 6ecb18d)

CONTROL CENTER V1: JEV Bridge 127.0.0.1:3590 (GET/HEAD only) + web Analyzer; NT8 AddOn SOURCE ONLY (not installed, no F5); robot button LOCKED OFF

PRODUCTION: OUT OF SCOPE / UNCHANGED

F5: NOT PERFORMED

Runtime docs: `context/jev-future/JEV_RUNTIME_V1_20260924.md` · start: `node src/jev/cli.mjs --input <jev-input.json>` · `npm test` · `npm run smoke`

---

## Hard scope boundary

Do NOT modify, remediate, reinterpret or integrate with current production:

- AOT current
- robo-trade
- Consolidator current
- DarkFlow current
- Copilot current
- Directional Core V0
- FlowOne current
- GammaGex/GexBot production
- NinjaTrader 8 current
- signal-engine current
- current ES×NQ gate
- current Conviction

The JEV Future project is separate.

---

## JEV role

JEV FUTURE is a:

SEPARATE MARKET-STATE / CONFLUENCE CLASSIFIER

FUTURES CORE is a:

SEPARATE DETERMINISTIC SYSTEM

CORE_vs_JEV_FUSION_POLICY:
UNDEFINED / TO_BE_PREREGISTERED

CORE_vs_JEV_CONFLICT_POLICY:
UNDEFINED / TO_BE_PREREGISTERED

PRECEDENCE:
NOT_DEFINED

FINAL TRADE DIRECTION:
NOT_DEFINED

Do not invent a Core-dominant policy.

---

## Full input invariant

The JEV analyzes the complete documented content of:

1. AlfaOmegaNetGex0DTE
2. AlfaOmegaDexGexFlow
3. AlfaOmegaClassic
4. AlfaOmegaState

Current contract:

TOTAL FIELDS: 190
4-SOURCE FIELDS: 174
SPX FINAL CONTEXT: 16
ROUTED: 190/190
UNASSIGNED: 0
DROPPED: 0

190 fields != 190 votes.

Lineage and double-counting controls are mandatory.

---

## TRACE and VolSignals

SpotGamma TRACE:
market_origin = SPX

VolSignals:
market_origin = SPX

Never classify either as ES_NATIVE.

Role:

FINAL_DECISION_CONTEXT_LAYER

They enter after native four-source dealer analysis.

Known comparison:

Gamma = PARTIAL_ANALOG
Other 6 = INSUFFICIENT_INFORMATION
VolSignals units = UNKNOWN
numeric equivalence = NOT ALLOWED

Do not numerically normalize TRACE against VolSignals without new evidence.

---

## MenthorQ

Policy is fixed:

POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING

aligned = positive confirmation
misaligned = zero effect
neutral = zero effect
stale/offline/unknown = zero effect

side origin = NO
veto = NO
block = NO
reduce conviction = NO

Do not extrapolate this rule to TRACE, VolSignals or the four dealer sources.

---

## Decision Logic V1

Canonical state:

OLD CORE-DOMINANT RULES REMOVED
FINAL_DIRECTION FIELD ABSENT
CONVICTION_BAND ABSENT
CORE-CAUSED NO_TRADE RULES ABSENT
JEV OWN DIRECTIONAL CONTEXT DEFINED
CORE/JEV FUSION UNDEFINED
190/190 FIELDS ROUTED
RESIDUAL GUARD PASS

JEV directional classifications:

LONG_CONTEXT
SHORT_CONTEXT
NEUTRAL_CONTEXT
CONFLICTED_CONTEXT
NO_TRADE_CONTEXT
UNKNOWN

These are classifications, NOT trade orders.

conviction = UNCALIBRATED

---

## Data quality

RTH, freshness, stale, frozen, missing and market_closed are:

DATA QUALITY / CLASSIFICATION INPUT

They are not operational trade gates in the current design.

60s / 300s freshness values are PROVISIONAL.

Vendor timestamp is preferred.
Arrival timestamp alone never proves freshness.

---

## Validation governance

20–40 trading days is:

NON_BLOCKING_VALIDATION_TARGET

It is NOT:

- an architecture gate
- a design blocker
- a requirement to continue the project
- a condition for closing the current design phase

No collection or validation starts without explicit operator order.

---

## Completed phases (history preserved)

DECISION LOGIC V1:
CLOSED / CLEANED (implementation none at that phase; production unchanged; F5 not performed)

PREREGISTRATION DESIGN V1:
REVIEWED / STRUCTURALLY CONSOLIDATED (commit e152d3d)
R_S15 accepted · R_S10 revised (dimensional DQ) · R_S18 revised (per source/dimension, no MIXED)
validation NOT STARTED · record V1 reaches UNKNOWN only · directional states INCOMPLETE

JEV RUNTIME V1:
IMPLEMENTED / OPERATIONAL (jev-runtime/v1.0.0, commit 774b198)
launch output = UNKNOWN + RC_NO_ACTIVE_DIRECTIONAL_RULE (safe operational state, not failure)
active side rules = 0 · trade execution DISABLED · current production UNCHANGED · F5 NOT PERFORMED

POST_LAUNCH_REFINEMENT_BACKLOG (non-blocking): R2, R6 materialization, G1/G2, E1–E7.

---

## Current phase

LIVE INPUT ADAPTER V1: DONE (6ecb18d).

JEV NT8 AGENT / BOT CONTROL CENTER V1: Analyzer delivered (bridge + web Control Center + NT8 AddOn source compile-checked outside NT8).

Still NOT allowed without explicit operator order:

- installing/compiling anything inside NT8 (F5) or touching current production
- enabling the robot / any order path (JEV_CAN_SEND_ORDER=false; Robot Executor needs its own phase, preregistration and order)
- defining final Core×JEV fusion
- putting external agents (Hermes, OpenClaw, LLMs) in any critical path — they are optional async consumers of the bridge

---

## Session discipline

Prefer durable files over large chat context.

At the end of every material phase:

1. update project state;
2. update/create a handoff;
3. record artifacts and paths;
4. record decisions and unresolved points;
5. record exact next step.

Do not silently change canonical architectural rules.
