# ALFA_OMEGA_REALTIME_OBSERVATION_SCHEMA (order §14–§15, §18–§20, 2026-10-05)

> Status: PROMOTED 2026-10-05 from `handoffs/alfaomega-audit/` (proposal ALFA_OMEGA_INDICATORS_AS_JARVIS_REALTIME_BASE §2.3, JEV DIFF A `req_01a10d1a79b377a89322928e6201f604`). Lineage ids: `config/alfaomega-lineage.curated.json` → `ALFA_OMEGA_INDICATOR_LINEAGE.{json,md}`. Documentation only; no NT8/AOT/production change.

Implemented (shadow, read-only) in `tools/jarvis/aot/realtime/` — tests `test/jarvis/aot-realtime.test.mjs`. JARVIS never calls :5152 and never sends an order.


## 1. ALFA_OMEGA_INDICATOR_OBSERVATION_V1 (one record per indicator capability per cycle)

| Field | Type / domain | Rule |
|---|---|---|
| `schema` | `"alfa-omega-observation/v1"` | |
| `cycle_id`, `timestamp` | string, ISO-Z | timestamp = collection end |
| `instrument`, `timeframe`, `session` | ES/NQ/…, string, session = opening date (18:00 ET rule, `AoConfig.SessionDate`) | |
| `indicator_id`, `capability_id` | lineage ids (`nt8:…`, FlowOne capability) | merged gen-1 ids are NEVER emitted (LIFE02) |
| `lifecycle_status` | lineage enum | only ACTIVE_*, FLOWONE_INTERNAL or FLOWONE_HYBRID are emitted |
| `source` | ALFA_GAMMA · ALFA_BOT · ALFA_Q · ALFA_DATA · ALFA_QUANT · NT8_CME | relay ≠ provider (SRC02) |
| `raw_value` | as published; missing stays `null` (never 0) | |
| `normalized_value` | only when a documented normalization exists, else `null` | no TRACE↔VolSignals numeric equivalence |
| `state` | STRONG_BULLISH … STRONG_BEARISH · BLOCKED · UNKNOWN · STALE · INVALID | only the deterministic mapping from ALFA_OMEGA_INDICATOR_SEMANTICS §1; STALE/UNKNOWN never become NEUTRAL (SEM02/SEM03) |
| `direction` | BULLISH · BEARISH · NEUTRAL · NONE | NONE for STRUCTURE/CONTEXT roles |
| `role` | DIRECTION · CONFIRMATION · FILTER · REGIME · RISK · CONTEXT · STRUCTURE | from ALFA_OMEGA_INDICATOR_SEMANTICS §2 |
| `confidence_type` | DETERMINISTIC_SCORE · QUALITATIVE · NOT_AVAILABLE | never a probability (§15) |
| `freshness` | LIVE · DELAYED · STALE · MISSING · NOT_SUPPORTED · ERROR · UNKNOWN, plus `age_s` and `ts_source` (vendor/arrival) | arrival timestamp alone never proves freshness |
| `quality`, `dependencies` | flags such as `ME_FALLBACK_TO_VECTOR`, `DOM_NOT_REPLAYABLE`, `DUPLICATE_WRITER`, `SCORE_NOT_APPLICABLE_SoCmeFluxo` | |
| `supporting_evidence`, `contradicting_evidence` | indicator ids | |
| `previous_state`, `state_change` | from PREVIOUS_SNAPSHOT | |

## 2. Collection (order §18–§19)
- Cadence: OFF · 60 · 120 · 180 · 240 · 300 s · ON_DEMAND (RT01).
- One snapshot per SOURCE per cycle: :3500, :3457, :3480, :3490, :3495, :5151 (RT02). No per-indicator polling, and requests are deduplicated (RT04). Market-closed or RTH-gated sources come out as STALE/MISSING; that is correct off-hours.
- Keep PREVIOUS/CURRENT snapshots. Emit STATE_CHANGES, NEW/LOST_CONFLUENCES, NEW/REMOVED_BLOCKERS, FRESHNESS_CHANGES and REGIME_CHANGES. Mainly deltas go to Claude/JEV (RT03).

## 3. Questions JARVIS must answer (order §20) → data used
"o que o FlowOne está dizendo?" → FlowOne capability observations · "Trace ainda é usado?" / "isso foi incorporado ao FlowOne?" → lineage json · "qual fonte está stale?" → freshness per source · "quais indicadores mudaram nos últimos 5 minutos?" → STATE_CHANGES · "por que você está neutro?" → MARKET_VIEW.WHY + MISSING/STALE.

## 4. Implementation notes (V1, `tools/jarvis/aot/realtime/`)
- Modules: `registry.mjs` (sources, denied ports, cadences, active-indicator registry, `checkUrl`) · `collector.mjs` · `observation.mjs` · `confluence.mjs` · `delta.mjs` · `index.mjs` (`createRealtime`).
- Endpoints read (GET only, loopback): :3500 `/hiro/SPX` `/levels/SPX` `/health` · :3457 `/gexbot/orderflow/ES_SPX` `/gexbot/classic/SPX/zero` · :3480 `/exposure/ES` `/levels/ES` · :3490 `/signal/ES` · :3495 `/consolidated/ES` · :5151 `/state` · :3600 `/state` `/api/indicators`. Denied before I/O: :5152, :5153, :3591, :3592, :3530.
- Observations emitted per cycle: `src:ALFA_QUANT` consolidated.direction (DIRECTION) · `nt8:QuantDataEngine` signal.direction (CONTEXT) · `nt8:AlfaOmegaHiro` hiro.sign (CONFIRMATION) · `nt8:MenthorQGammaEngine` exposure.levels (CONFIRMATION, no documented direction) · `src:ALFA_BOT` gamma.condition (REGIME) · `src:NT8_CME` es.price (CONTEXT) · `nt8:AlfaOmegaFlowOne` ME|MVI|CONF (DIRECTION, see below).
- `lifecycle_status` adds `SOURCE_PUBLISHED` for `src:*` ids (a value published by a source, not an NT8 indicator). `state` adds `NOT_APPLICABLE` for direction-less roles (never NEUTRAL). `vendor_class` (EXTERNAL / INTERNAL_COMPUTE / NT8_CME) and `group` (independence group) are carried on every record.
- Freshness: age ≤ limit ⇒ LIVE · ≤ 2×limit ⇒ DELAYED · else STALE · no timestamp ⇒ UNKNOWN · GET failed ⇒ ERROR · body/field absent ⇒ MISSING. Limits come from the α skills (quant 120 s, data 600 s, HIRO 60 s, MenthorQ 900 s, GexBot 180 s); the :5151 price limit 60 s is PROVISIONAL. Only LIVE yields a direction.
- **FlowOne ME/MVI/CONF are NOT read in V1:** they are not documented fields of :5151 `/state`. The record is emitted with `raw_value=null`, `state=UNKNOWN`, `freshness=NOT_SUPPORTED` and quality flags `FIELD_NOT_DOCUMENTED_ON_5151`, `ME_FALLBACK_TO_VECTOR_POSSIBLE` (D2), `DUPLICATE_WRITER` (D3). D2/D3 are flags only; NT8 is unchanged.
- Cadence default OFF. Nothing is wired into the JARVIS server or any live process by this layer.
