# RESULT — JEV / CLAUDE OBSERVABILITY CONTROL PLANE — PHASE 1 (for JEV FINAL)

Loop: `jf-20261002221926-59e158` · proposal `handoffs/PROPOSAL_JEV_OBS_PHASE1_20261002.md` (JEV DIFF = A) · sessions 4ac35a75 → c205d615 (rotation #14).

## Objective
Observational-only control plane: local dashboard on 127.0.0.1 over the JEV, Claude Code, context, hooks, sessions, rotations, cost, decisions, confidence, probabilities, retries, workflows and subagents, with no change to decision behavior.

## Delivered (all new, inside the repo)
| file | sha256[:12] |
|---|---|
| tools/jev-obs/sources.mjs | e983635db89b |
| tools/jev-obs/aggregate.mjs | f60cf452ee54 |
| tools/jev-obs/cache.mjs | 45b0d7fbb5d0 |
| tools/jev-obs/server.mjs | be80bb714511 |
| tools/jev-obs/hook-probe.mjs | a0e120f52f31 |
| tools/jev-obs/shadow-ledger.mjs | 7b5fec9404ec |
| tools/jev-obs/baseline.mjs | 2c73dddcd635 |
| tools/jev-obs/bench-hooks.mjs | bc3023a3fe8d |
| tools/jev-obs/public/{index.html,app.js,style.css} | 9549aa27ba45 / 666f07006706 / f6113ad404dc |
| tools/jev-obs/README.md | 44e8359c69e7 |
| test/jev-obs/obs.test.mjs | def0ab09031c |

Only existing files touched: one guarded line in each hook, as in the proposal §2:
- `tools/jev-finish/hook.mjs:12` `try { await import('../jev-obs/hook-probe.mjs'); } catch { … }`
- `tools/jev-rotation/hook.mjs:372` the same line, inside `if (isEntry) { … }`. This keeps `import { CLAUDE_SESSION_ENV }` from tests probe-free. The file has pre-existing uncommitted operator changes, so commit it separately.

Untouched: src/jev, src/ijc, nt8, settings*.json, package.json, thresholds, model, permissions, production. No npm packages. No external telemetry.

## Tests (registered and run via finish.mjs; recheck re-ran all of them: RECHECK_PASS 4/4)
- obs-unit: `node --test test/jev-obs/obs.test.mjs` passes 18/18. Coverage:
  - NDJSON tolerance;
  - request_id dedupe;
  - TEST vs production split;
  - http≠200;
  - spend;
  - retries NOT_RECORDED;
  - request types;
  - pmax, margin, ratio and Noul;
  - every filter;
  - decision quality and lifecycle (no labels ⇒ NO_LABELS_YET);
  - transcript usage dedupe and tool classes;
  - hooks;
  - rotation;
  - missing sources;
  - namespace separation;
  - redactor;
  - server (127.0.0.1 bind, GET only, Host 403, no secrets);
  - cache;
  - shadow idempotence;
  - probe wiring;
  - probe test-mode silence;
  - probe decision-neutrality.
- rotation-suite: `npm run test:rotation` PASS.
- jev-finish-suite: `npm run test:jev-finish` PASS.
- hook-bench: `node tools/jev-obs/bench-hooks.mjs --n 30` PASS. Result: `handoffs/assets/JEV_OBS_PHASE1_hookbench_20261002.json`.
  - 4 scenarios × 30 paired runs: stdout and exit were identical with and without the probe (decision_neutral = true), and the probe recorded every run.
  - Probe's own cost in-process: import ≈ 3 ms plus exit handler p95 0.7 ms, so total p95 ≈ 3.7 ms.
  - Wall-time delta p50 is 4–6 ms. Process wall p95 is dominated by spawn noise: the baseline without the probe already swings above 100 ms.
  - The 10 ms threshold is not exceeded, so the probe default is ON.

## Reconciliation
`baseline.mjs` gives 15 PASS, 0 FAIL, 1 not recomputed. Output: `handoffs/assets/JEV_OBS_PHASE1_{baseline,reconcile}_20261002.json`.

## Live smoke
`node tools/jev-obs/server.mjs` listens on 127.0.0.1:3593 only (netstat).
- /api/health returns OBSERVATIONAL_ONLY.
- /api/summary?range=all returns 200, 237 kB, in 0.66 s. Contents: JEV 1310 production requests, US$ 0.23287916; 43 Claude sessions; 94 probe records; 41 rotations; 13 anomaly codes.
- 0 secret patterns in the response. A foreign Host gets 403.
- Shadow ledger: 5 jev-finish answers imported into `<CLAUDE_CONFIG_DIR>/jev-obs/jev-shadow-ledger.ndjson`.

## Risks / limitations
- A probe "allow" run with no stdout is recorded with event=null, because the probe never reads stdin.
- JEV retries are not logged by the client (shown as NOT_RECORDED_BY_CLIENT).
- No outcome labels exist yet, so calibration shows NO_LABELS_YET.
- The UI was not visually verified in a browser (only HTTP/HTML smoke).
- Rollback: `JEV_OBS_PROBE=0`, or remove the single line in each hook.
