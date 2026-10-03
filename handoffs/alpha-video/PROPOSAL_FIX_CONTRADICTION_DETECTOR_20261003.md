# PROPOSAL — contradiction detector produces noise on the real corpus (loop jf-20261003142710-cd58c7)

Scope: `tools/alpha-video/lib.mjs` `findContradictions` + one test. No trading/runtime/JARVIS/NT8 file. Contradiction policy unchanged (UNRESOLVED, never auto-resolved, both evidences kept).

## BEFORE × NOW (evidence)
Real corpus (23 videos, 3.35 h, 2158 items) ⇒ 770 "contradictions". Top axes: Gamma positive/negative 193, GEX positive/negative 106, Moneyness increases/decreases 85, GEX bullish/bearish 76, Theta positive/negative 71, Volatility positive/negative 55.
Example pair: A "In the chart, positive gamma is the green section above the high-volve level." × B "The gamma of a short position is always negative…". These are not divergent claims: the course teaches two named regimes (positive gamma / negative gamma) and both polarities of a Greek. The detector compares any polarity word anywhere in two sentences about the same concept, so a compound name ("positive gamma", "negative GEX") or a sentence that mentions both poles counts as a claim.

## Diff
1. In polarity scoring, ignore a polarity word that forms a compound with the concept surface (polarity word immediately before or after the concept's synonym, e.g. "positive gamma", "gamma negative", "negative GEX regime") — that is a name, not a predicate.
2. A statement that contains both poles of an axis (e.g. "positive … negative") is not one-sided on that axis ⇒ cannot contradict on it (already scored 0 by the current pos−neg sum; kept).
3. Only items whose text_source is speech/captions take part (OCR slide fragments are not claims).
4. Test AV28: compound names across videos ⇒ no contradiction; the AV12 support/resistance case still produces an UNRESOLVED contradiction.

## Not changed
Status UNRESOLVED, resolution null, both evidences, cross-video only, quarantine exclusion, item schema. The real corpus is re-indexed by `ingest.mjs --reextract` (no STT).
