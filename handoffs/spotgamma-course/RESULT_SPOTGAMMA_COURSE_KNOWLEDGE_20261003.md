# RESULT — SPOTGAMMA OFFICIAL COURSE → KNOWLEDGE → SPOTGAMMA SKILL — 2026-10-03

Loop `jf-20261003220802-7d4414` · order `handoffs/spotgamma-course/OPERATOR_ORDER_SPOTGAMMA_COURSE_20261003.md` · handoff `handoffs/HANDOFF_SPOTGAMMA_COURSE_KNOWLEDGE_20261003.md` · proposal `handoffs/spotgamma-course/PROPOSAL_SPOTGAMMA_COURSE_INGESTION_20261003.md`.
JEV DIFF **A** SAFE_TO_APPLY conf 0.50 `req_01a103d036a5770f986230e2e6ead2ff` (A .56 / F .16 / E .12 / G .05 / D .05 / C .03 / B .01 / H .01).

## Source / login
- URL https://spotgamma.spotcloud.online/courses/how-to-use-spotgamma/ · course "How to Use SpotGamma" · SOURCE=SPOTGAMMA · SOURCE_CLASS=FIRST_PARTY_COURSE · KNOWLEDGE_SCOPE=SPOTGAMMA_ONLY.
- LOGIN = ALREADY_AUTHENTICATED (central browser, profile `C:\Users\ADM\.claude\pw-profiles\spotcloud-sso`, CDP :9222). No password/cookie/token read. One extra course tab; capture tab and live capture processes untouched (no restart).

## Inventory (`knowledge/video-spotgamma/inventory.json`)
- 12 modules: Key Levels 10 · Market Overview 6 · Founder's Note 12 · Options Calculator 8 · Indices 7 · Equity Hub 17 · Scanners 8 · Tape 9 · HIRO 8 · Volatility Dashboard 10 · TRACE 11 · Conclusion 1 = **107 lessons**, all ACCESSIBLE.
- 76 unique YouTube videos (2.27 h); 75 pages carry a first-party transcript; 11 quizzes inventoried (never started or submitted, answer key NOT_REVEALED); 9 Typeform feedback embeds (not content); images = tier banners only (no slides/diagrams in page); downloads/PDFs: see inventory `counts` (file links 4, no PDF course material); 44 resource links (support docs + platform links, defanged, not followed).

## Capture method
- `tools/alpha-video/spotgamma/capture.mjs`: raw CDP on the existing browser, DOM read only, no clicks/forms/POST. Captions from the embedded YouTube player of the logged-in page (`captionTracks`, YouTube ASR en, json3, ms timestamps); signed caption URL used in-page, never stored. Anonymous yt-dlp returns 429/bot check ⇒ not bypassed, no cookies. Frames: seek + `Page.captureScreenshot` clipped to the iframe (every 30 s, 2–12 per video).
- 107/107 pages, 11/11 quizzes, 76/76 videos captured, 0 failed.

## Corpus (`knowledge/video-spotgamma/`, separate from MenthorQ `knowledge/video/`)
- Build `tools/alpha-video/spotgamma/build.mjs` (reuses `../lib.mjs` concept detection, segmentation, defang, untrusted flags, contradiction core with fix #3, BM25; `../ocr.mjs` Tesseract). First-party transcript sentences aligned monotonically to the ASR cues (575/594 aligned; unaligned ones keep null timestamps with a reason, never guessed). ASR windows are used only for the 1 video without a page transcript.
- Versioned: manifest, inventory, `evidence/lessons/*.items.json`, `evidence/contradictions.json`, `concepts/`, `indexes/`. Local only (gitignored): raw/, sources/, transcripts/, segments/, frames/, evidence/rejected.json.

## Audit (`indexes/audit.json`) — STATUS PASS
COURSE_MODULES 12 · LESSONS_TOTAL 107 · LESSONS_PROCESSED 107 · VIDEOS_TOTAL 76 · VIDEOS_PROCESSED 76 · VIDEO_HOURS 2.27 · TRANSCRIPT_CUES 3143 · SEGMENTS 437 · FRAMES 228 (OCR lines kept 932 / noise dropped 858) · KNOWLEDGE_ITEMS 1582 · CONCEPTS 55 · SPOTGAMMA_API_CONFIRMED 301 · SPOTGAMMA_API_PROBABLE 26 · PLATFORM_ONLY 233 · SPOTGAMMA_CONCEPTUAL 103 · GENERAL_KNOWLEDGE 919 · UNKNOWN 0 · CONTRADICTIONS 94 · REJECTED 53 (BOILERPLATE_REPEATED) · QUARANTINED 0 · SILENT_FAILURES 0 · FATAL_FAILURES 0.
Text sources: page_transcript 626 · page_text 504 · captions_asr 101 · ocr 351.

## Concepts / term classes / API attribution
- Proprietary (course says Call Wall, Put Wall and Volatility Trigger were "coined by SpotGamma"): Call Wall, Put Wall, Volatility Trigger, Hedge Wall, Key Gamma Strike, Key Delta Strike, Large Gamma, Combo Strike. Product terms: HIRO, TRACE, Tape, Equity Hub, Compass, Squeeze Scanner, Scanners, Founder's Note, Options Calculator, Volatility Dashboard, Synthetic OI, Delta Pressure.
- API_CONFIRMED only when the concept maps to a field in the recorded capture-API snapshot (`config/alpha-video-spotgamma.json api_field_map`): Call Wall, Put Wall, Key Gamma Strike, Hedge Wall, Large Gamma, Combo Strike, Expected Move, HIRO, Tape, TRACE, Charm (distribution only). PROBABLE: Volatility Trigger, Key Delta Strike. Vanna is never CONFIRMED.
- Not taught in the course: Zero Gamma, Gamma Flip, Vanna, Tail Risk ⇒ ask returns NO_EVIDENCE_FOR_CONCEPT.

## Contradictions (94, all UNRESOLVED, never auto-resolved)
TRUE_CONTRADICTION 0 · REGIME_DEPENDENT 16 · CONTEXT_DEPENDENT 72 · INSTRUMENT_DIFFERENCE 2 · WORDING_ONLY 2 · POSSIBLE_DETECTOR_FALSE_POSITIVE 1 · UNRESOLVED 1. Detector extension: regime names (positive/negative/long/short gamma, above/below the vol trigger) are stripped for every concept before polarity detection. This removed 65 regime-only pairs, e.g. Market Maker statements with "negative gamma" vs "positive gamma".

## Skill
- `.claude/skills/skill-alpha-gamma/SKILL.md`: append-only section `## SPOTGAMMA_COURSE_KNOWLEDGE` (terminology, definitions, indicator semantics, relations/workflows, API attribution table, limitations, retrieval). Existing items 1–18 + VIDEO_DERIVED_KNOWLEDGE are byte-identical (first 45 lines sha256 c25cb17b…). Precedence unchanged (API docs/code > course > inference). OTHER_SKILLS_MODIFIED = 0.

## Retrieval
`npm run sg-course-ask -- "<q>"` (PT aliases; API attribution table mode). All 6 order questions return status + source SPOTGAMMA + lesson + timestamp or null reason + pointer + confidence. Zero Gamma ⇒ NO_EVIDENCE_FOR_CONCEPT (honest: not in the course).

## JARVIS
`concepts/jarvis-lexicon-candidates.json`: 48 CANDIDATES_ONLY from ASR vs first-party transcript, e.g. "Hero"→HIRO ×8, "vault"→Vol, "EquityHub"→Equity Hub, "zero DTE"→0DTE. `tools/jarvis` untouched.

## Tests (finish.mjs recorded)
spotgamma-course 18/18 (SG-U1..U8 + SGRC1–SGRC10) · alpha-video · alpha · jarvis · jev-finish · jev-obs · rotation · smoke: PASS. JEV runtime: 104/105. I03 is a pre-existing failure on clean HEAD since `f250faf` (`src/alpha/specialists/quant.mjs`, already documented in the MenthorQ RESULT), so it is excluded from the recorded run. This mission touched nothing under src/, test/jev, test/ijc.

## Isolation / safety
- MenthorQ corpus `knowledge/video/` + `config/alpha-video.json` + the 4 other skills: `git status` empty (SGRC6).
- Course content is UNTRUSTED_EVIDENCE: no exec/eval in the SG tools, URLs defanged, untrusted patterns lead to quarantine (0 hit). ORIGINAL_SITE_CONTENT_MODIFIED = NO. TRADING_MUTATIONS = 0. No production/NT8/F5/live-capture change.

## Known gaps
- Captions are YouTube ASR (no manual track); the page transcript is the primary text, so timestamps come from alignment (19 sentences unaligned ⇒ null timestamp).
- OCR of paused player frames is noisy (player chrome); OCR items carry low confidence and are excluded from the contradiction detector.
- Linked support.spotgamma.com docs are inventoried, not crawled (outside the course URL).
- Claim-type classification is lexical (UNCALIBRATED); vendor statistics are not validated by the project.
- I03 pre-existing (not in scope).
