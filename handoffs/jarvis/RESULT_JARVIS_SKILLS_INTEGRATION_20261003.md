# RESULT — JARVIS ← NEW KNOWLEDGE SKILLS (SpotGamma + MenthorQ/Alpha) — 2026-10-03/04

Loop `jf-20261004002014-0a39f9` · order `handoffs/jarvis/OPERATOR_ORDER_JARVIS_SKILLS_INTEGRATION_20261003.md` · proposal `handoffs/jarvis/PROPOSAL_JARVIS_NEW_SKILLS_INTEGRATION_20261003.md` · handoff `handoffs/HANDOFF_JARVIS_SKILLS_INTEGRATION_20261003.md`.
JEV DIFF **A** SAFE_TO_APPLY conf 0.49 `req_01a104487f037beb97209f8655dab39c` (A .56 / D .21 / F .10 / E .04 / G .04 / C .03 / B .01 / H .01).

## Baseline
JARVIS V1 `539bef9` (JEV FINAL A `req_01a0ff15790679648c971960055b011f`): deterministic text core, 12 intents, 9 read-only tools over the live Alpha state only. No skill registry, no knowledge retrieval. "O que é Call Wall?" was routed to LEVEL_QUERY (live value).

## Skills discovered (real paths) → status
| skill_id | path | source / corpus | before | after |
|---|---|---|---|---|
| skill-alpha-gamma (canonical SpotGamma skill) | `.claude/skills/skill-alpha-gamma/SKILL.md` | SPOTGAMMA · `knowledge/video-spotgamma` (1582 items) | live only | live + course knowledge INTEGRATED |
| skill-alpha-q | `.claude/skills/skill-alpha-q/SKILL.md` | MENTHORQ · `knowledge/video` (2158 items) | live only | live + course knowledge INTEGRATED |
| skill-alpha-quant / -bot / -data | `.claude/skills/skill-alpha-{quant,bot,data}/SKILL.md` | MenthorQ corpus filtered by api quant/bot/data (0 items today) | live only | live + reachable via registry (honest INSUFFICIENT_EVIDENCE) |
| jev-finish | `.claude/skills/jev-finish/SKILL.md` | — | — | NOT_FOR_JARVIS |
SKILLS_DISCOVERED 6 (5 eligible + 1 not for JARVIS); ALREADY_CONNECTED 5 (live state); NEW knowledge integrations 2 corpora / 5 skills. No new skill created; no skill file modified (OTHER_SKILLS_MODIFIED = 0).

## Implementation (commits, local)
- `e0cd52b` feat(jarvis): registry `config/jarvis-skills.json` + `tools/jarvis/skills.mjs` + router intents KNOWLEDGE_QUERY / CROSS_SOURCE.
- `77fc55d` feat(jarvis): `answer.mjs` knowledgeAnswer branch (before the Alpha state load) + `server.mjs` knowledge obs field.
- `0216337` test(jarvis): `test/jarvis/skills.test.mjs` SK1–SK11 + router corpus phrases for the 2 new intents in `core.test.mjs`.
- Docs commit (this RESULT + handoff + order + proposal) after JEV FINAL.

## How it works
Question → `route()` (definitional phrasing without live cues ⇒ KNOWLEDGE_QUERY; + both vendors or compar/diferença ⇒ CROSS_SOURCE; existing intents first for CANCEL/FUSION_EXPLANATION, unchanged otherwise) → `selectSkills` (named vendor/α skill wins; else both default course skills, each answered separately; "gamma" alone is a concept, not the source) → `retrieve` = existing corpus `ask()` (import, no subprocess/network) → evidence rows → "Segundo SpotGamma, sobre Call Wall (How to Use SpotGamma, Key Levels › Call Wall, 00:00:07): "…" Confiança 0,75, não calibrada." → TTS (unchanged pipeline).
Evidence rules: concept-strict (word overlap never counts); a concept named only as part of a longer concept from another glossary counts only if the statement contains the longer phrase (Volatility Trigger ≠ Volatility; MenthorQ positive-gamma statements kept); spoken/first-party text over OCR; fragments < 5 words dropped; definitions first. MenthorQ local file paths never exposed (video title only). No evidence ⇒ `INSUFFICIENT_EVIDENCE` + "Não tenho evidência suficiente para responder." and zero evidence rows.
Cross-source: per-source answers always separate; verdict AGREEMENT / DIFFERENCE / CONTEXT_DEPENDENT / INSUFFICIENT_EVIDENCE from a lexical axis comparison (volatility dampen×amplify, level support×resistance, direction up×down) of the retrieved statements; missing in one or both ⇒ INSUFFICIENT_EVIDENCE; no comparable axis ⇒ INSUFFICIENT_EVIDENCE (no artificial consensus). Unresolved corpus contradictions surface as warnings.

## Real answers (verified)
SpotGamma ANSWERED: Call Wall, Put Wall, Volatility Trigger, HIRO ("HIRO is SpotGamma's real time indicator of options hedging pressure."), positive gamma (Market Regime), Market Maker, Dealer Positioning, Single Stocks. MenthorQ ANSWERED: Gamma, Delta Hedging, Market Maker, positive gamma. INSUFFICIENT_EVIDENCE: Zero Gamma (both corpora), HIRO / Call Wall / Volatility Trigger in MenthorQ (MenthorQ handoff records HIRO/Call Wall as not taught), invented term "zorblax", α Bot charm (no MenthorQ items attributed to bot). Cross-source "Como SpotGamma e MenthorQ explicam positive gamma?" ⇒ both answered separately, verdict CONTEXT_DEPENDENT.

## Lexicon
Candidates reviewed, LEXICON_PROMOTED = 0. MenthorQ pairs jacks→GEX, Q-Moders→Q-Models, data→delta, coal→call come from English ASR of an English course, not the operator's pt-BR mic; "data" is the α Data alias and "coal/call" would rewrite valid speech. Mentor Q→MenthorQ and SpotGamma Hero→HIRO were already live in `voice.mjs STT_FIX`. 48 SpotGamma + MenthorQ candidates stay candidates. `voice.mjs`, models, VAD, PTT, wake OFF, barge-in unchanged (VOICE_PIPELINE_CHANGED = NO).

## Observability
Each voice/text cycle record (`var/jarvis/voice-cycles-*.ndjson`) gains `knowledge: {intent, selected_skills, sources, hit, per_source[{source, skill, status, evidence_count, ms}], evidence_count, confidence, verdict, retrieval_ms}`; no corpus text in it (SK11). Transcript policy unchanged.

## Performance (ask(), 20 warm runs)
live LEVEL p50 8.6 / p95 11.3 ms · live SUMMARY 8.8 / 15.1 · knowledge SpotGamma 93.6 / 124.6 · knowledge both 97.7 / 114 · cross-source 89.4 / 106.1 · negative 91.4 / 104.2 · cold first knowledge 150 ms. Retrieval overhead ≈ 90 ms (corpora loaded per call; not optimised by order). Live path unchanged; text→first audio stays inside the previous ACCEPTABLE band (+≈0.1 s for knowledge questions only). First answer token = whole answer (non-streaming).

## Tests (finish.mjs, RECHECK_PASS 10/10)
jarvis-skills SK1–SK11 PASS · jarvis 27/27 PASS (first loop run hit the pre-existing real-voice-model flake, direct run 27/27, re-run PASS) · alpha PASS · alpha-video PASS (incl. AV22, after the local commits) · spotgamma-course PASS · rotation PASS · jev-finish PASS · jev-obs PASS · jev-runtime PASS (I03 skipped: pre-existing failure since f250faf, unchanged) · smoke PASS.
SK coverage: registry (valid, unique, real paths, corpora, no deprecated, broken entries detected), discovery (every `.claude/skills` folder registered or NOT_FOR_JARVIS; one SpotGamma skill), routing table (SPOTGAMMA / MENTHORQ-ALPHA / GENERAL_JARVIS / CROSS_SOURCE + ambiguous pairs), retrieval with provenance, 5 Alpha skills reachable, negatives, cross-source (separate provenance, one/none present, verdict units incl. conflict preserved), live intents unchanged, security, observability + latency.

## Safety
READ-ONLY / INFORMATIONAL. skills.mjs: no child_process/fetch/writes (SK10); no new HTTP route; no order/account/config tool; course text quoted as UNTRUSTED_EVIDENCE, never executed. Corpora, `tools/alpha-video/**`, `.claude/skills/**`, capture, src/**, AOT/INVICTUS/NT8 untouched. TRADING_MUTATIONS = 0.

## Process notes (not hidden)
- `test/jarvis/core.test.mjs` asserts every intent has router phrases; 8 phrases were added for the 2 new intents (no assertion changed or removed).
- AV22 checks `git status -- tools/jarvis`; per proposal §6 the 3 code commits were made locally before the regressions/recheck; push only after JEV FINAL = A.

## Known gaps
Cross-source verdict is lexical and UNCALIBRATED; statements are quoted in the course language (English) inside pt-BR answers; quant/bot/data have no MenthorQ-attributed items (INSUFFICIENT by design); MenthorQ ASR wording errors stay in quotes (corpus not rebuilt); SKILL.md text itself is not retrieved (corpora are the retrieval layer); real-mic validation of knowledge questions pending; ~90 ms retrieval per knowledge question.

## Remaining steps
JEV FINAL (one) → if A: docs commit + push (if blocked ⇒ PUSH_PENDING_OPERATOR) → handoff "RECHECK PASS — aguardando complete" → `finish.mjs complete`.

## JEV FINAL
**A COMPLETE_AND_VERIFIED** conf 0.75 `req_01a104530e39756e9863eeb65c77836b` (jev-1.13.0, 2026-10-04T00:31:54Z, RESULT sha16 293bfe6e8c9a0869) — A .78 / F .13 / D .04 / B .02 / C .01 / G .01 / H .01 / E 0. Single consultation.
