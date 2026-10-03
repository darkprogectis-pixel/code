# PROPOSAL — fixes found on the first REAL sample (loop jf-20261003142710-cd58c7)

Scope: `tools/alpha-video/{stt.mjs,lib.mjs,ingest.mjs}`, `config/alpha-video.json`, `test/alpha-video/alpha-video.test.mjs`. No trading/JEV/Alpha runtime/JARVIS/NT8 file touched. Video content stays UNTRUSTED_EVIDENCE.

## Evidence (sample `Section 2 How to use Option Greeks\5 - Gamma.mp4`, 491 s, English)
Corpus `knowledge/video`, video v_d32c161a3231, whisper-small, language '' (auto) decoded per VAD chunk:
- Hallucinated other languages inside the English lecture: "Kaj pa vsega vsega … je zelo v gamma" (Slovenian), "A riskászás, hogy bítók" (Hungarian), "Per esempio, i stock difensivi …" (Italian), "da rede data com a mudança da data." (Portuguese), "Relacija entre gamma in theta je več vse."
- The JARVIS normalizer changes only the case: raw "Gamma is defined…" becomes "gamma is defined…" (5 of 5 corrections in the sample were case-only).
- Domain misrecognitions: "the jacks which is the gamma exposure" (GEX), "does data hedging … isolate the data" (delta), "buying a coal" (call), "Q-Moders", "RQ models" (Q-Models).
- unknown-terms noise: WITH, SS, LONG, SHORT (common English words in OCR caps).
- Throughput: 491 s of audio took 5 min with numThreads 2 ⇒ ~2.2 h for the 3.6 h corpus.

## Diff
1. `stt.mjs` language lock: when `language === ''`, decode the first ≤ 6 VAD segments in auto mode, take the majority `lang`, then build a recognizer locked to that language and decode ALL segments with it. Export the locked language on every cue. `ingest.mjs`: chunk 1 sets the language and later chunks of the same video reuse it (`--lang` still overrides). `sources/<id>.json` records `language_lock: { detected, votes }`.
2. `stt.mjs` correction: when `correctTranscript(text)` differs from `text` only by letter case, keep `text` (no `raw`, no change). Add VIDEO_FIX entries, raw always kept: `\bjacks\b|\bjax\b` → GEX; `data[- ]hedg(e|es|ed|ing)` → `delta hedg…`; `\b(buy|buying|sell|selling|short|long) a coal\b` → `… a call`; `q[- ]?mod(e|o)rs?` and `\brq models\b` → `Q-Models`. Do not correct "high-volve / high wall" (no safe basis).
3. `lib.mjs` unknownTerms: ignore all-caps tokens that are common English/Portuguese words (WITH, AND, THE, FOR, LONG, SHORT, SS…) via a small stoplist; original spelling is still kept for real unknowns.
4. `config/alpha-video.json`: `stt.threads` 2 → 4 (i7-11370H, 8 logical CPUs; JARVIS keeps its own config).
5. Tests: new unit asserts in AV4 (case-only change ⇒ no raw; the new fixes; "data" alone untouched) + a new AV23 for the language lock (majority vote helper). The current 22 stay unchanged.

## Not changed
Attribution rules (a vendor restored by correction still never becomes API_CONFIRMED), schema video-knowledge/v1, aggregators, retrieval, skills contract.

## Plan after the fix
`node --test` alpha-video → delete `knowledge/video` (it only holds my sample, generated) → re-ingest the sample, validate → ingest the whole folder (`--recursive`) in the background.
