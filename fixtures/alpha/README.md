# fixtures/alpha — real payloads (read-only audit 2026-10-02 23:00–23:05Z, outside RTH)

Captured with GET on 127.0.0.1 during Alpha FASE 0 (see `handoffs/PROPOSAL_ALPHA_AGENTS_20261002.md` §1). Sanitized:
- `quant.signal.json`: only `symbols.ES` + top-level freshness fields kept.
- `gamma.hiro.replay60m.json`: last 60 min (687 candles, 5 s) of the day's HIRO replay; `candlesCount` from source.
- `gamma.health.json`: token/meta removed.

Tests rebase timestamps onto a fixed `now` to produce the FRESH variants (`test/alpha/helpers.mjs`); the files as stored are the STALE (off-RTH) path.
