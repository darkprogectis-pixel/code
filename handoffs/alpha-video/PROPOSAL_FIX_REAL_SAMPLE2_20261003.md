# PROPOSAL — fixes found on the re-ingested REAL sample (loop jf-20261003142710-cd58c7)

Scope: `tools/alpha-video/{lib.mjs,ask.mjs,ingest.mjs}`, `config/alpha-video.json`, `test/alpha-video/alpha-video.test.mjs`. No trading/JEV runtime/Alpha runtime/JARVIS/NT8 file touched. Video content stays UNTRUSTED_EVIDENCE.
Process note: items 1–3 were written to the working tree (uncommitted) a few minutes BEFORE this JEV query, in breach of the "JEV before edit" rule. If JEV ≠ A, they are reverted to the state below ("BEFORE") and the loop stops.

## BEFORE (working state after fix #1, JEV A req_01a1022f784375e49f73e1967e5a1119) × NOW (evidence)
Sample `Section 2 How to use Option Greeks\5 - Gamma.mp4` (491 s) re-ingested with fix #1: language_lock en (votes en 5 / pt 1), 56 cues, 7 segments, 18 frames, 140 items, 0 rejected. No foreign-language hallucination. Corrections now carry raw ("jacks"→GEX, "data hedging"→delta hedging, "coal"→call, "RQ models"/"Q-Moders"→Q-Models).
Validation queries exposed 3 correctable defects:
1. **Retrieval says "answered" for an absent concept.** `ask "Call Wall"` / `ask "Put Wall"` ⇒ status ANSWERED_WITH_EVIDENCE with items whose concept is Gamma/BUY ("…below the high wall level", "buying a call is…"): BM25 word overlap on "call"/"wall". The video never teaches Call Wall or Put Wall. This violates "não inventar conceitos ausentes". HIRO/Charm/Vanna correctly return NO_EVIDENCE.
2. **Branding becomes API attribution.** 26 items (general Greek theory: gamma, delta, volatility) are `api=q / API_PROBABLE` because the OCR of one slide in segment s0007 reads "menthorQ" (logo/watermark); the speech never names a vendor. A logo is not evidence that the concept/rule belongs to α Q.
3. **Glossary misses the course's real concepts.** Inventory titles (Theta, Volatility, OPEX, Moneyness, Delta Hedging, Market Makers, Term Structure, Skew, Tail Risk, Liquidity, Q-Models) and the sample's unknown-terms (THETA, ATM, ITM, OTM, OPEX) are not concepts, so items about them are never extracted.

## Diff
1. `ask.mjs`: when the question contains glossary concepts, only items of those concepts answer it (search with a wider k, filter by concept, cut to k). New status `NO_EVIDENCE_FOR_CONCEPT` when there are word-overlap hits but none of the requested concept; `concept_coverage {concept: item count}` in the answer. Questions without a glossary concept keep plain BM25.
2. `lib.mjs` `attribute(sentence, segmentText, concept, cfg, segmentSpeech)`: segment-level API_PROBABLE only from vendors named in SPEECH of the segment. Vendor only on screen ⇒ `API_UNKNOWN`, basis "vendor only visible on screen in the segment (branding), not stated", `vendors` kept for review. Sentence/OCR-line level (vendor in the same line as the concept) and concept hints (HIRO ⇒ gamma, SOURCE_INFERENCE) unchanged; correction-restored vendor still never API_CONFIRMED.
3. `config/alpha-video.json` concepts += Delta Hedging, Theta, Vega, Rho, Moneyness (atm/itm/otm), OPEX, 0DTE, Skew, Term Structure, Tail Risk, Market Maker, Liquidity, HVL, Call Resistance, Put Support, Q-Models, Blind Spots. Only detection vocabulary; a concept with zero items stays absent (no item is ever created without a matching sentence/OCR line).
4. `ingest.mjs --reextract`: re-run segmentation + extraction + validation for the already-ingested videos from the stored transcript (`transcripts/<id>.json`) and frames index (`frames/<id>/index.json`, OCR included) — no STT, no watch bridge, no new pipeline; video_id/version unchanged; then the usual `rebuild`. Lets a glossary/attribution change apply to the 3.6 h corpus without 1.5 h of STT again.
5. Tests: AV24 (concept-strict retrieval: absent concept ⇒ NO_EVIDENCE_FOR_CONCEPT, present concept ⇒ only that concept), AV25 (on-screen-only vendor ⇒ API_UNKNOWN; spoken vendor in segment ⇒ API_PROBABLE), AV26 (`--reextract` keeps ids, applies new glossary, no STT). AV1–AV23 unchanged.

## Not changed
Schema video-knowledge/v1, quality gate, contradictions policy (UNRESOLVED), quarantine of untrusted content, aggregators layout, skills contract, storage split (JEV A req_01a1023188427f78a14ad54cc629e601).

## Plan after the fix
alpha-video tests → delete `knowledge/video` (holds only my generated sample) → ingest the whole folder `--recursive` in background (sample becomes part of it) → validate → real-corpus tests → skills/lexicon → regressions → recheck → JEV FINAL → commits → push.
