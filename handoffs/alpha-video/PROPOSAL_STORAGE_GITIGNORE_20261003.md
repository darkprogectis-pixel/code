# PROPOSAL — knowledge/video storage split (loop jf-20261003142710-cd58c7)

Change: append to `.gitignore` (nothing else):

```
# alpha video corpus: derived raw material of third-party paid course videos stays local
knowledge/video/frames/
knowledge/video/transcripts/
knowledge/video/segments/
knowledge/video/sources/
knowledge/video/evidence/rejected.jsonl
knowledge/video/evidence/jev-decisions.jsonl
```

## Versioned (git)
`knowledge/video/manifest.json` (ids, hashes, durations, status), `indexes/*.json` (per-API aggregators, inverted, stats), `concepts/*.json` (catalog, unknown terms, JARVIS lexicon candidates), `evidence/*.items.json` + `evidence/contradictions.json`. They are the structured knowledge the 5 skills and `ask.mjs` read (`ask.mjs` loads manifest + items + contradictions + inverted). Quotes are short (≤ 300 chars per item), each with provenance.

## Not versioned (local only), and why
- **frames/** (JPEG, MB scale; screenshots of a paid course) — size + copyright.
- **transcripts/** and **segments/** (full lecture text) — they reproduce the whole course; sensitive and regenerable from the originals with `alpha-video-ingest` (deterministic pipeline, same hash ⇒ same ids).
- **sources/** (ffprobe dumps, local absolute paths) — machine-specific.
- **rejected.jsonl / jev-decisions.jsonl** — run logs.
- Original videos, audio and temp work dirs are never inside the repo (originals stay read-only in the source folder; the work dir is under %TEMP% and deleted).

## Reproducibility
`npm run alpha-video-ingest -- "<source folder>" --recursive` rebuilds the ignored parts. item `frame_refs` keep pointing at `frames/<video_id>/f_NNNN@<ms>ms.jpg`, and the real-corpus test skips frame-existence checks when frames are absent.

## Risk
A fresh clone answers `ask.mjs` queries (items present) but cannot open frames until it re-ingests. No runtime/trading file is touched.
