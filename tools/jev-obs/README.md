# JEV / Claude Observability Control Plane — Phase 1 (OBSERVATIONAL ONLY)

Local dashboard over the existing sources of truth. Reads only; never calls the JEV; changes no decision, gate, threshold, model or setting.

## Start / stop

```
node tools/jev-obs/server.mjs            # http://127.0.0.1:3593/   (Ctrl+C stops it)
node tools/jev-obs/server.mjs --port 3600
```

Not an installed service. Binds `127.0.0.1` only, GET only, rejects foreign `Host` headers, redacts every response (keys, tokens, prompt/state text).

API: `/api/health` · `/api/sources` · `/api/summary?range=today|7d|30d|all&session=&purpose=&model=&type=&until=`

## Sources (read-only)

| source | path |
|---|---|
| JEV routing / decisions / models / coverage / legacy rotation / router feedback | `~/.claude/alfaomega-context/logs/*.ndjson` |
| Claude transcripts (main + subagents) | `<CLAUDE_CONFIG_DIR>/projects/**/*.jsonl` |
| rotation lineage / level events | `<CLAUDE_CONFIG_DIR>/jev-rotation/{lineage,events}.jsonl` |
| jev-finish loops (JEV DIFF/FINAL) | `<CLAUDE_CONFIG_DIR>/jev-finish/loops/*.json` |
| rotation briefs | `handoffs/rotation/ROTATION_*.md` |
| audit results | `handoffs/assets/JEV_POTENTIAL_AUDIT_20261002_results.json` |

Derived data (never a source of truth) lives in `<CLAUDE_CONFIG_DIR>/jev-obs/`:
`hook-metrics.ndjson` (probe), `jev-shadow-ledger.ndjson`, `outcomes.ndjson` (empty in Phase 1; nothing is auto-labeled), `derived/summary.json`.

Path overrides for tests: `JEV_OBS_CONFIG_DIR`, `JEV_OBS_JEV_LOGS`, `JEV_OBS_REPO_ROOT`, `JEV_OBS_DIR`.

## Hook probe

`hook-probe.mjs` is loaded by `tools/jev-rotation/hook.mjs` and `tools/jev-finish/hook.mjs` through one guarded line:
`try { await import('../jev-obs/hook-probe.mjs'); } catch { … }`.
It passes stdout through unchanged and appends one metrics line on exit (duration, exit code, blocked, injected chars). No stdin/prompt content is stored.

- Disable: `JEV_OBS_PROBE=0`. Rollback: delete that line in each hook.
- Hook test suites (`JEV_ROTATION_TEST=1` / `JEV_FINISH_TEST=1`) record nothing unless `JEV_OBS_DIR` is set.
- Known limitation: silent "allow" runs have `event=null` (the probe never reads the hook's stdin).

## Tools

```
node tools/jev-obs/shadow-ledger.mjs      # import jev-finish DIFF/FINAL answers into the shadow ledger (idempotent)
node tools/jev-obs/baseline.mjs           # BASELINE × RECONCILE → handoffs/assets/JEV_OBS_PHASE1_*.json
node tools/jev-obs/bench-hooks.mjs --n 30 # probe overhead + decision-neutrality (exit 1 if stdout/exit differ)
node --test "test/jev-obs/*.test.mjs"     # unit/integration tests
```
