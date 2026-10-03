# ALPHA FUSION V1 — AGENT_FUSION (`alpha-fusion/v1`) — SHADOW / READ-ONLY

rules_version: alpha-rules/1 · module: `src/alpha/fusion.mjs` (pure) + `src/alpha/jev-fusion.mjs` (JEV advisory) · config: `config/alpha.json` (all constants PROVISIONAL / UNCALIBRATED).
Approved plan: `handoffs/PROPOSAL_ALPHA_AGENTS_20261002.md` §5–§6 (JEV DIFF A `req_01a0fee466a07af785c15e7e72e854e7`).

## Inputs
Only the 5 `alpha-specialist/v1` envelopes (never raw payloads). One source = one envelope; number of fields never adds weight.

## Algorithm (no 3×2 vote)
1. **Eligible** for direction: `fresh ∧ health ∈ {OK, PARTIAL} ∧ direction ∈ {BUY, SELL, NEUTRAL} ∧ role ≠ NON_DIRECTIONAL`. Others go to `ignored_sources` with a reason (MISSING, ERROR, STALE, NON_DIRECTIONAL, Q_CONFIRMATION_ONLY, NO_DIRECTIONAL_READING).
2. **Independence groups**: `G_QUANT_DATA = {quant, data}` counts once (representative = highest confidence; the other is `REDUNDANT_WITH_*`); `G_GAMMA = {gamma}`. α Bot and α Q never originate a side.
3. Group mass `m = confidence × strength`, sign `s ∈ {+1, −1, 0}`; `score = Σ s·m`, `evidence_mass = Σ m`, `agreement = |score| / evidence_mass`.
4. **Material contradiction**: opposite-sign groups each with `m ≥ 0.10`. Quant × Data opposite inside the group is recorded as `WITHIN_GROUP` (not material, not summed).
5. `signal = BUY/SELL` iff `agreement ≥ 0.60 ∧ |score| ≥ 0.10 ∧ no material contradiction ∧ freshness_ok (≥ 2 fresh sources)`; else `NO_SIGNAL` with the reasons in `reasoning_summary`.
6. `confidence = agreement × min(1, |score| / 0.30) × (directional groups ≥ 2 ? 1 : 0.6)`.
7. MenthorQ (α Q): CONFIRMATION_ONLY_NON_BLOCKING; Q has no own side ⇒ `q_confirmation = NONE` in V1 (effect 0; never reduces, never vetoes).

## JEV (advisory, decomposed)
One `jevAsk` call (canonical client, sanitized state, purpose `alpha-fusion-<cycle_id>`) with Q1–Q5 per-source direction, Q6 freshness, Q7 contradiction, Q8 independence, Q9 evidence sufficiency, Q10 aggregate direction, Q11 quality, Q12 false-consensus risk. Persisted per question: winner, confidence, pmax, top1, top2, margin (p1−p2), ratio (p1/p2), probabilities; plus request_id, model, latency, cycle_id.
Throttle: needs ≥ 1 fresh directional reading; state hash changed ∧ ≥ 120 s, or 15 min heartbeat; daily cap 300; else `SKIPPED_*`. JEV failure ⇒ `jev.status = ERROR`, cycle continues. JEV **never changes `signal`**; disagreement ⇒ contradiction `JEV_DISAGREES` (not material).

## Known limitations (factual)
- Only 2 directional groups exist (G_QUANT_DATA, G_GAMMA) — Bot/Q are NON_DIRECTIONAL by evidence/policy.
- Project holdout directional_pass = 0/66 ⇒ every BUY/SELL is an analytical reading, `calibration = UNCALIBRATED`, never an order.
- Off-RTH every source is STALE ⇒ NO_SIGNAL is the correct output.

## Tests
`test/alpha/fusion.test.mjs` (consensus, redundancy, single group, offline, freshness, neutral, stale, material conflict, 3×2, strong×weak, within-group, Q/Bot never originate, reproducibility, JEV A/B/error/timeout/throttle/summarize).
