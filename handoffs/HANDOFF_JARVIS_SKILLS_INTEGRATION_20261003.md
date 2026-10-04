# HANDOFF — JARVIS ← NEW KNOWLEDGE SKILLS (SpotGamma + MenthorQ/Alpha) — 2026-10-03

Order (verbatim): `handoffs/jarvis/OPERATOR_ORDER_JARVIS_SKILLS_INTEGRATION_20261003.md` (session 2be92cfb, rotation #24 lineage).
Proposal: `handoffs/jarvis/PROPOSAL_JARVIS_NEW_SKILLS_INTEGRATION_20261003.md`. RESULT (at the end): `handoffs/jarvis/RESULT_JARVIS_SKILLS_INTEGRATION_20261003.md`.
Scope: JARVIS text core only; read-only, informational; zero trading; corpora/skills/capture/voice models untouched.

## Handoff-first (read)
- `handoffs/HANDOFF_JARVIS_ALPHA_VOICE_20261002.md` + `handoffs/RESULT_JARVIS_ALPHA_FINAL_20261002.md` — JARVIS V1 baseline `539bef9`.
- `handoffs/HANDOFF_ALPHA_VIDEO_KNOWLEDGE_20261002.md` — MenthorQ corpus `knowledge/video` (2158 items, 29 concepts); HIRO/Charm/Call Wall/Put Wall = NO_EVIDENCE in MenthorQ.
- `handoffs/HANDOFF_SPOTGAMMA_COURSE_KNOWLEDGE_20261003.md` — SpotGamma corpus `knowledge/video-spotgamma` (1582 items, 55 concepts), pushed 248b5b5; Zero Gamma not taught.
- `handoffs/HANDOFF_JEV_FINISH_V1_20261002.md` — loop CLI. Never print full `finish.mjs` JSON (echoes the objective).

## State log
### 1. Discovery (done, read-only)
- Inventory + design: proposal §1–§3. JARVIS had no skill registry; knowledge questions were routed to live intents.
- Probe of both `ask()` (2026-10-03): SpotGamma ANSWERED for Call Wall, Put Wall, positive gamma, Volatility Trigger, HIRO, market makers, single stocks, Charm, Vanna (1 item); Zero Gamma NO_EVIDENCE_FOR_CONCEPT. MenthorQ ANSWERED for gamma, Volatility, Market Maker, Delta Hedging, Vanna; NO_EVIDENCE for Call Wall, Put Wall, Zero Gamma, HIRO, Charm. Latency 35–95 ms per corpus call (corpus loaded per call).
- MenthorQ attribution: unknown 2042, q PROBABLE 111, q CONFIRMED 5 ⇒ api filters quant/bot/data return 0 items (reachable, no evidence).
- MenthorQ citation.source is a local absolute path ⇒ JARVIS exposes only the video title.

### 2. Next
- Start the loop (`finish.mjs start --objective <order> --handoff <this>`), run ONE JEV DIFF on the proposal, record request id/choice/confidence/probabilities here.

### 3. JEV DIFF — A (loop jf-20261004002014-0a39f9)
- **A SAFE_TO_APPLY** conf 0.49 `req_01a104487f037beb97209f8655dab39c` (jev-1.13.0, 2026-10-04T00:20:22Z, proposal sha16 ed673c107363df8e) — A .56 / D .21 / F .10 / E .04 / G .04 / C .03 / B .01 / H .01. Not to be repeated.
- D .21 is the main runner-up ⇒ mitigation in implementation: strict evidence (no word-overlap answers), negative tests, existing intents unchanged.
- Next: stage PLAN → EXECUTE; implement proposal §3–§4.

### 4. EXECUTE — implemented (loop jf-20261004002014-0a39f9, stage EXECUTE), NOT committed yet
- NEW `config/jarvis-skills.json` (5 entries: skill-alpha-gamma=SPOTGAMMA corpus knowledge/video-spotgamma; skill-alpha-q=MENTHORQ knowledge/video; quant/bot/data = knowledge/video with api filter; jev-finish NOT_FOR_JARVIS).
- NEW `tools/jarvis/skills.mjs`: loadRegistry/validateRegistry, namedSkills/selectSkills, retrieve (reuses both corpus ask(); concept-strict; drops OCR when spoken exists, <5-word fragments; definitions first; `eclipsedConcepts`: shorter concept counts only if statement contains the longer phrase another glossary recognised, e.g. Volatility Trigger ⊃ Volatility), compareSources/poles (AGREEMENT/DIFFERENCE/CONTEXT_DEPENDENT/INSUFFICIENT_EVIDENCE, lexical).
- `tools/jarvis/router.mjs`: intents KNOWLEDGE_QUERY + CROSS_SOURCE (KNOWLEDGE_RE without LIVE_CUE_RE; after CANCEL/FUSION_EXPLANATION).
- `tools/jarvis/answer.mjs`: `knowledgeAnswer()` + branch before Alpha state load; "Segundo <Fonte>, sobre <conceito> (curso, aula, ts): "…" Confiança x, não calibrada."; `knowledge{status,selected_skills,per_source,comparison,obs}`; `ask(..., {registry})`.
- `tools/jarvis/server.mjs`: voice-cycle rec gets `knowledge: a.knowledge?.obs`.
- `test/jarvis/core.test.mjs`: CORPUS extended with KNOWLEDGE_QUERY/CROSS_SOURCE phrases (existing coverage assertion requires every intent) — 8/8 PASS.
- NEW `test/jarvis/skills.test.mjs` SK1–SK11 = **11/11 PASS**.
- Lexicon: none promoted (proposal §3.7); voice.mjs untouched.

### 5. NEXT EXACT (successor)
1. `finish.mjs require-test`/`test --name jarvis --shell bash --cmd 'node --test "test/jarvis/*.test.mjs"'` (voice-server real-model test may flake ~5–10%; previous loops used `--test-skip-pattern "real voice models"` for regress-jarvis — check the alpha-video RESULT for the exact cmd).
2. Perf numbers: `node -e` loop over ask() live vs knowledge vs cross (p50/p95) → RESULT.
3. Local commits (proposal §6, AV22): (a) `config/jarvis-skills.json tools/jarvis/skills.mjs tools/jarvis/router.mjs` registry/router; (b) `tools/jarvis/answer.mjs tools/jarvis/server.mjs` retrieval/provenance; (c) `test/jarvis/skills.test.mjs test/jarvis/core.test.mjs`; (d) handoff+`handoffs/jarvis/*` after RESULT. Explicit paths only; never the unrelated files (START_JEV_CLAUDE.ps1, test/rotation/*, other handoffs, kimi, spotgamma/alpha-video RESULT notes).
4. Register regressions: alpha `npm run test:alpha`, alpha-video `npm run test:alpha-video`, rotation, jev-finish, jev-obs, jev-runtime (I03 pre-existing excluded as before) → `finish.mjs recheck` → RESULT `handoffs/jarvis/RESULT_JARVIS_SKILLS_INTEGRATION_20261003.md` → `stage JEV_FINAL` → ONE `jev-diff.mjs --kind final --proposal <RESULT>` → push if A (if blocked: PUSH_PENDING_OPERATOR) → handoff "RECHECK PASS — aguardando complete" → `finish.mjs complete` (own call).
- Loop tests: jarvis-skills PASS (SK1–SK11); jarvis PASS 27/27 (1st loop run FAIL = pre-existing real-voice-model flake; direct run 27/27, 2nd loop run PASS).
- PERF (ask(), 20 runs, warm): live LEVEL p50 8.6/p95 11.3 ms · live SUMMARY 8.8/15.1 · knowledge SpotGamma 93.6/124.6 (retrieval 93.3) · knowledge both sources 97.7/114 · cross-source 89.4/106.1 · negative 91.4/104.2 · cold first knowledge query 150 ms. Overhead ≈ 90 ms/knowledge query (both corpora loaded per call; not optimised, by order). Live path unchanged.
- LOCAL COMMITS (no push): e0cd52b registry/router · 77fc55d answer/server · 0216337 tests. Next: regressions in loop → recheck → RESULT → JEV FINAL.

### 6. RECHECK + JEV FINAL
- `finish.mjs recheck` ⇒ RECHECK_PASS 10/10 (jarvis-skills, jarvis, alpha, alpha-video, spotgamma-course, rotation, jev-finish, jev-obs, jev-runtime, smoke).
- JEV FINAL **A** COMPLETE_AND_VERIFIED conf 0.75 `req_01a104530e39756e9863eeb65c77836b` — A .78 / F .13 / D .04 / B .02 / C .01 / G .01 / H .01 / E 0. Not to be repeated.
- Next: docs commit (handoff + handoffs/jarvis/*) → push → record → complete.
