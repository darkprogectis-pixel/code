# JARVIS × INVICTUS AOT — integration (R2)

Date: 2026-10-04 · loop `jf-20261004123720-84ace9` · JEV DIFF A `req_01a106eb857971b1b64a92536b2629e5` · proposal `handoffs/jarvis/PROPOSAL_R2_JARVIS_AOT_ALFAOMEGA_SIGNAL_INTEGRATION_20261004.md`

## 1. Shape

R2 extends the existing JARVIS (:3594) with AOT pages and APIs. JARVIS serves them on its own origin, so there is no CORS. The AOT BFF (:3600) is read strictly through a GET allowlist. Nothing is written under the AOT directory, and nothing is installed into AOT, NT8 or the Consolidator.

```
AOT BFF :3600 (GET allowlist) → adapter.mjs (cache = area cadence, single in-flight, no self-polling)
  → context.mjs (per-area extractors, data_state, provenance, α aliases, accounts never copied)
  → alfabot-explain.mjs (condition matrix, explanation only)
  → narrator.mjs (OFF / IMPORTANT / VERBOSE)
  → qa.mjs (grounded answers + quoted course knowledge)
  → routes.mjs → server.mjs (existing state bus, speech synth, /api/audio chunks — ROBOTIC voice)
```

## 2. Pages and routes (JARVIS :3594, token-protected like the HUD)

| Path | Purpose |
|---|---|
| `/aot` | JARVIS area of AOT: 5 buttons, narration mode, voice toggle, feed, Q&A, items table |
| `/aot/alfabot` | ALFABOT SIGNAL rebuilt as an explainable panel (see `ALFABOT_SIGNAL_ARCHITECTURE.md`) |
| `/aot/indicadores` | Indicator catalog browser, filtered by API, module, instrument, category, status, signal and freshness |
| `GET /api/aot/areas`, `/observe?area=`, `/signal`, `/catalog` | read-only data |
| `POST /api/aot/ask`, `/api/aot/narrate` | Q&A and narration. These are the only new POSTs; bodies are limited to 8 KB |

The okOrigins and host checks in `server.mjs` are unchanged. A cross-origin request, such as Origin `http://127.0.0.1:3600`, gets 403.

## 3. The five areas (real AOT pages)

| Button | Real AOT page | Endpoints |
|---|---|---|
| JARVIS — COMMAND | `◆ INVICTUS 不可征服者AOT · Command` `/` | `/state` |
| JARVIS — DEEP DIVE | `· Deep Dive` `/deep.html` | `/state`, `/api/indicators` |
| JARVIS — AUTOMAÇÃO | `· Automação` `/auto.html` | `/state` |
| JARVIS — ROBÔ / ALFA OMEGA INVICTUS | `AOTRobô` `/robo.html` | `/robo/state?sym=ES|NQ` |
| JARVIS — HISTÓRICO | `· Histórico` `/history.html` | `/history?days=2` |

The parent `◆ INVICTUS 不可征服者AOT` page is the container, not a sixth button. ALFABOT SIGNAL has its own page, `/aot/alfabot`.

KNOWN_GAP: a navigation link inside the AOT's own pages would require writing to the AOT, so it needs a separate operator order.

## 4. Data states and provenance

- `data_state` ∈ LIVE · DELAYED · STALE · MISSING · NOT_SUPPORTED · ERROR · UNKNOWN.
- DELAYED applies up to 300 s, which is PROVISIONAL.
- Historical records are always NOT_SUPPORTED for freshness, never LIVE.
- Missing data is never 0.
- `provenance` ∈ LIVE_DATA · DERIVED_CALCULATION · AOT_STATE · HISTORICAL_RECORD · SPOTGAMMA_KNOWLEDGE · MENTHORQ_KNOWLEDGE · ALPHA_SKILL · CROSS_SOURCE_INTERPRETATION.
- Course and skill knowledge is UNTRUSTED_EVIDENCE. It is quoted with course, lesson and timestamp, and it never changes a value or a signal.
- History answers describe frequency and sequence, never causality (SIG10).

## 5. Narration

- **IMPORTANT** (default) narrates CRITICAL and MATERIAL changes, with a 120 s cooldown per key.
- **VERBOSE** also narrates MINOR changes, with a 30 s cooldown.
- **OFF** produces text only and never calls TTS.
- A flap guard suppresses non-MINOR keys that flip 3 times within 120 s.
- There is a 10 s gap between spoken items. The first narrate call returns a summary.
- Speech is asynchronous through the existing synth and job path. If TTS fails, the text is still shown.

## 6. Fail-safe and performance

- If JARVIS is down, the AOT is unaffected (PERF03 / AOTJ09).
- If the AOT is down, the items show ERROR or MISSING. No substitute signal is produced.
- Data is fetched only when a client observes an area. With N clients on the same area, there is one upstream fetch per cadence window (PERF01).

## 7. Safety

The adapter rejects any non-GET method, any non-loopback base and any path outside `ALLOWLIST = /state, /api/indicators, /robo/state, /history, /api/alfabot-signal, /health`, before any I/O. Account names and values are never copied.

TRADING_MUTATIONS = 0. ORDER_API_CALLS = 0. Tests SAFE01–05 cover this.

## 8. Tests

`npm run test:jarvis-aot` runs the following, using fixtures in `fixtures/jarvis-aot/`, sanitized:

- AOTJ01–09 and PERF01–03 in `aot-core.test.mjs`;
- SIG01–10 in `aot-signal.test.mjs`;
- IND01–06 in `aot-catalog.test.mjs`;
- SAFE01–05 in `aot-safety.test.mjs`.

## 9. Rollback

To roll back, revert the R2 commits: `tools/jarvis/aot/**`, the additive hook in `tools/jarvis/server.mjs`, the `aot` block in `config/jarvis.json` and the two package scripts. Nothing outside this repository was changed.
