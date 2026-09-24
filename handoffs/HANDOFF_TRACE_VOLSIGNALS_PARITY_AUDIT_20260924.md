# HANDOFF — TRACE × VolSignals: FUNCTIONAL PARITY AUDIT (NOT STARTED) — 2026-09-24

Rotation: the session hit JEV_ROTATION_WARNING (223.5k) at the start of this task. Nothing in the parity audit was executed beyond reading `volsignals-audit/data/` (file listing only).

## Done in the previous session (accepted / recorded)
- `C:\Users\ADM\.claude\volsignals-audit\SESSION_PACK_TRACE_COMPARISON_HANDOFF_V2.md` §8, plus the RTH PAREADO addendum in `VOLSIGNALS_VS_SPOTGAMMA_TRACE_COMPARISON.md`:
  - TRACE bodies for `intraday_gamma` / `intraday_delta` are parquet `(time, spot, timestamp, gamma|delta)`. Grid: forward time T→16:30 ET every 10 min × 137 hypothetical spots.
  - View mapping: Gamma / Delta Pressure (`tr_lense=5`) / Charm Pressure (`tr_lense=6`). Charm = `VIEW_COMPOSITION_OBSERVED` (delta + gamma only).
  - Pairs at 19:20Z and 19:30Z: gamma corr 0.94/0.94, deltaTotal 0.45/0.44 (sign 100%).
  - VolSignals: `deltaChange = deltaTotal − K(t)` with `K = UNKNOWN_TIME_SLICE_BASELINE`.
  - `intraday_gamma` × `strike_bars` = DIFFERENT.
  - Classifications: Gamma PARTIAL · deltaTotal PARTIAL (**new, pending operator review**) · rest unchanged.
- Run: `C:\Users\ADM\.claude\volsignals-audit\data\runs\rth-cmp-20260924T192133Z\`.
- Probes (read-only): `volsignals-audit/probe/trace-view-probe.js` (open/click/dump/close on CDP 9222, own tab `?jevcmp=1`), `trace-bodies-analyze.py`, `trace-gamma-compare.py`, `trace-vs-grid-compare.py`.
- Python with pyarrow: `C:/Users/ADM/AppData/Local/Programs/Python/Python312/python.exe` (cast timestamp to int64; tzdata is missing).
- Sessions: TRACE = SSO browser CDP 9222 (relaunched 18:39Z this session, logged in). VolSignals = CDP 9338. Recorder stopped. `CURRENT_RTH_RUN` restored to `data/runs/rth-20260924T155720Z`.

## Pending task (operator order, verbatim scope summarized)
"TRACE × VOLSIGNALS — FUNCTIONAL PARITY AUDIT". Read-only; temporary probes allowed; no JEV/adapter/binding/F5/NT8/orders.
- Inventory **everything** each platform delivers. Schema per item: NAME, VIEW, ENDPOINT, FIELDS, PRODUCT, PARTICIPANT/STRIKE/TIME/EXPIRATION dimensions, CADENCE, LIVE/HIST, RAW/DERIVED, UNIT_KNOWN, CAPTURE_AVAILABLE, EVIDENCE.
- Normalize by **function** into categories: GAMMA, DELTA, CHARM, VANNA, VOLGA, POSITIONING, STRADDLE/EXPECTED_MOVE, KEY_LEVELS, PARTICIPANTS, STRIKE_DISTRIBUTION, TIME_HEATMAP, EXPIRATION_STRUCTURE, SPOT, OPEN_INTEREST, 0DTE, HISTORICAL/REPLAY, OTHER.
- Classes: COMMON_CONFIRMED / COMMON_PARTIAL / TRACE_EXCLUSIVE_CONFIRMED / VOLSIGNALS_EXCLUSIVE_CONFIRMED / UNKNOWN. EXCLUSIVE only after a sufficient search.
- Special topics:
  - Participants: does the selector change `mkt_actor` and the payload? Does VolSignals have anything equivalent? Positions a/b/c = UNKNOWN unless proven.
  - Positions by Strike vs TRACE (`strike_bars`, OI).
  - Straddle vs "SG Implied 1d Move". Formula required; do not equate by name.
  - Dynamic Levels vs Key Levels / Hedge Wall / Call Wall / Put Wall / Zero Gamma.
  - Gamma / Delta / Charm (use §8).
  - Vanna / Volga: deep search in TRACE UI, network and bundle.
  - Cadence per metric.
  - Revision model: TRACE = MATERIAL_REVISION; VolSignals = ?
  - Historical/replay: platform capability ≠ what our capturer saves.
- Deliverables:
  - `C:\Users\ADM\.claude\volsignals-audit\TRACE_VOLSIGNALS_FUNCTIONAL_PARITY_20260924.md` (inventory, matrix, evidence, exclusives, unknowns, JEV implication);
  - a summary/link in SESSION_PACK;
  - the final RETURN block from the order: counts, FUNCTIONAL_OVERLAP = (COMMON_CONFIRMED + COMMON_PARTIAL) / classifiable, and `DUAL_INTEGRATION_HAS_PROVEN_INCREMENTAL_VALUE` YES/NO/NOT_YET_PROVEN.
- FINAL expected: `TRACE_VOLSIGNALS_FUNCTIONAL_PARITY_COMPLETE`.

## Execution plan (minimal, in order)
1. **Existing evidence (offline):**
   - `volsignals-audit/data/rpc-method-field-map.json` (keys: methods, clientDerived, derivedFormulas…), `rpc-schema-summary.json`, `raw-to-ui-map.json`, `ui-map.json`, `api-map.json`, `trace-comparison-map.json`;
   - `rth-20260924T155720Z/rth-analysis.json` (RPC list, incl. `getActiveProducts`);
   - `sg-directional-capture/spotgamma-capture-priority.json` (SpotGamma endpoint catalog) + `raw/KEYLEVELS`, `raw/OI`, `raw/TRACE_STATS` (check whether `intraday_stats` carries levels / implied move);
   - `revision-audit/summary.ndjson` (TRACE MATERIAL_REVISION).
2. **TRACE live (CDP 9222, own tab):**
   - dump the metric menu, participant selector and toggles (GEX / 0DTE / Key Levels);
   - click each participant and record whether `mkt_actor` changes (`trace-view-probe.js click "<name>"`);
   - download the TRACE JS bundle via `page.evaluate(() => performance.getEntriesByType('resource'))` → fetch `.js` inside the page → grep for `vanna|volga|vomma|charm|mkt_actor|implied|hedge|wall|zero|flip|/v2/`. Do not save the entire bundle, only matches.
3. **VolSignals:**
   - list views and menus in the `/app` tab (CDP 9338, no reload unless required);
   - search the bundle for `participant|customer|firm|broker|market maker|openInterest|zero|flip|wall|expected|implied|replay|history|expiration`;
   - list every RPC in `rpc-method-field-map.json`.
4. **Classify** and write the parity document. Cadence and revision model come from evidence already collected (VolSignals: 10-min cycle; timestamps `source_inserted_time` / `sum_processed_time`; process_history with UPDATE operations ⇒ check whether it suggests revision).

Next exact step: step 1 (offline), then step 2.

---

## UPDATE — AUDIT EXECUTED (2026-09-24, pós-RTH) — TRACE_VOLSIGNALS_FUNCTIONAL_PARITY_COMPLETE
Passos 1–4 executados. Read-only. JEV/adapter/binding/F5/NT8/ordens: NÃO tocados.
- Documento: `C:\Users\ADM\.claude\volsignals-audit\TRACE_VOLSIGNALS_FUNCTIONAL_PARITY_20260924.md`; resumo em SESSION_PACK §9; artefatos `data/runs/parity-20260924/` (scan de segredos: 0 valores).
- Probes novos: `probe/trace-parity-probe.js` (aba própria fechada), `probe/vs-parity-probe.js` (sem reload/clique), `probe/parity-charm-deltachange.py` (offline).
- Resultado: 30 funções — COMMON_CONFIRMED 4 · COMMON_PARTIAL 8 · TRACE_EXCLUSIVE 8 · VOLSIGNALS_EXCLUSIVE 4 · UNKNOWN 6; FUNCTIONAL_OVERLAP 50%.
- DUAL_INTEGRATION_HAS_PROVEN_INCREMENTAL_VALUE = YES (informacional; valor preditivo NÃO testado).
- Decisões: deltaTotal NÃO promovido (sinal trivial); charm/deltaChange = CANDIDATE_PARTIAL_ANALOG aguardando revisão do operador; gamma PARTIAL_ANALOG mantido. CLAUDE.md canônico (Gamma PARTIAL / demais INSUFFICIENT) NÃO alterado.
- Pendências: NEEDS_NEXT_RTH (mais pares charm/deltaChange; payload VS por participante ≠ MM; revisão VS mesmo dataTime); entitlement do plano VS (operador).
- Próximo passo exato: revisão do operador das decisões §5 do documento; nenhuma coleta sem ordem explícita.

---

## ARCHITECTURE DECISION — TRACE_PRIMARY_VOLSIGNALS_INCREMENTAL_DEFERRED (2026-09-24, operator)
The operator accepted the parity audit. No new capture. JEV unchanged. CODE_CHANGED=NO · JEV_CHANGED=NO · F5=NO.

**JEV V1: PRIMARY SPX CONTEXT SOURCE = TRACE.** Rationale:
- the LIVE producer/capture already exists;
- freshness_basis is already defined;
- rules R_M09/R_M10 already exist;
- participant segmentation is proven;
- 8 exclusive functions are confirmed;
- functional coverage is broad: Gamma, Delta, Charm, levels, OI and context.

**VOLSIGNALS: DEFERRED_INCREMENTAL_SOURCE.** Not discarded. Its proven exclusive justifications:
- Vanna;
- Volga;
- Positions by expiration/participant;
- ATM Straddle by expiration.

VolSignals enters the JEV runtime only when one of these gets explicit use in the contract/decision logic. It is not to be integrated just to duplicate Gamma/Delta/Charm.

**Preserved canonical parity:**
- Gamma = PARTIAL_ANALOG;
- Charm = CANDIDATE_PARTIAL_ANALOG (not promoted);
- deltaChange/Delta Pressure = CANDIDATE_PARTIAL_ANALOG (not promoted);
- deltaTotal = INSUFFICIENT_INFORMATION;
- Vanna/Volga = VOLSIGNALS_EXCLUSIVE_CONFIRMED.

CLAUDE.md does not change on Charm/deltaChange without a new explicit decision.

**Findings:**
- DUAL_INTEGRATION_HAS_PROVEN_INCREMENTAL_INFORMATION = YES.
- DUAL_INTEGRATION_HAS_PROVEN_PREDICTIVE_VALUE = NO / NOT_TESTED.

The existence of exclusive functions is NOT an automatic justification for integrating two sources in V1.

**Next work (only when authorized):**
1. Design the adapter TRACE → `spx_final_context.trace.*`.
2. Preserve anti-lookahead and MATERIAL_REVISION.
3. Integrate first only the TRACE fields already contracted.
4. Keep VolSignals out of the runtime.
5. Later, a specific experiment to measure whether Vanna/Volga/term structure/Straddle add decision information beyond TRACE.

FINAL: TRACE_PRIMARY_VOLSIGNALS_INCREMENTAL_DEFERRED
