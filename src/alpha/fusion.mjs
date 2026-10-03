// AGENT_FUSION — alpha-fusion/v1. Pure and deterministic; consumes the 5 envelopes only (never raw payloads).
// No simple 3×2 vote: eligibility → independence groups (one representative each) → mass = confidence × strength →
// agreement = |Σ s·m| / Σ m → material contradiction / freshness / min mass gates. MenthorQ (α Q) never originates or vetoes.
// JEV is advisory (attached later by jev-fusion.mjs) and never changes `signal`. Doc: context/jev-future/ALPHA_FUSION_V1.md.
import { FUSION_SCHEMA } from './contracts.mjs';
import { SOURCES, LABEL } from './config.mjs';

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const sgn = (d) => (d === 'BUY' ? 1 : d === 'SELL' ? -1 : 0);

export function fuse(envs, { cfg, cycle_id, now }) {
  const F = cfg.fusion;
  const by = Object.fromEntries(SOURCES.map((s) => [s, envs.find((e) => e?.source === s) || null]));
  const sources = {}, ignored = [], contradictions = [];
  const freshCount = SOURCES.filter((s) => by[s]?.fresh).length;
  const eligible = {};
  for (const s of SOURCES) {
    const e = by[s];
    let reason = null;
    if (!e) reason = 'MISSING';
    else if (e.health === 'ERROR') reason = 'ERROR';
    else if (!e.fresh || e.health === 'STALE') reason = 'STALE';
    else if (e.role === 'NON_DIRECTIONAL') reason = s === 'q' ? 'Q_CONFIRMATION_ONLY (SIDE_ORIGIN=FALSE)' : 'NON_DIRECTIONAL';
    else if (!['BUY', 'SELL', 'NEUTRAL'].includes(e.direction)) reason = 'NO_DIRECTIONAL_READING';
    sources[s] = { direction: e?.direction ?? 'UNKNOWN', confidence: e?.confidence ?? 0, strength: e?.strength ?? 0, fresh: !!e?.fresh, health: e?.health ?? 'ERROR', age_ms: e?.age_ms ?? null, used: !reason, reason };
    if (reason) ignored.push({ source: s, reason }); else eligible[s] = e;
  }
  // Independence groups: members of the same group count once (highest confidence is the representative).
  const groups = [];
  const seen = new Set();
  for (const [gid, members] of Object.entries(F.groups)) {
    const live = members.filter((m) => eligible[m]);
    members.forEach((m) => seen.add(m));
    if (!live.length) continue;
    const rep = [...live].sort((a, b) => eligible[b].confidence - eligible[a].confidence || a.localeCompare(b))[0];
    for (const m of live) if (m !== rep) { sources[m].used = false; sources[m].reason = `REDUNDANT_WITH_${rep.toUpperCase()} (${gid})`; ignored.push({ source: m, reason: sources[m].reason }); }
    const opp = live.filter((m) => sgn(eligible[m].direction) && sgn(eligible[rep].direction) && sgn(eligible[m].direction) !== sgn(eligible[rep].direction));
    for (const m of opp) contradictions.push({ kind: 'WITHIN_GROUP', group: gid, detail: `${LABEL[rep]} ${eligible[rep].direction} × ${LABEL[m]} ${eligible[m].direction}`, material: false });
    const e = eligible[rep];
    groups.push({ id: gid, members: live, representative: rep, direction: e.direction, sign: sgn(e.direction), mass: r4(e.confidence * e.strength) });
  }
  for (const s of Object.keys(eligible)) if (!seen.has(s)) groups.push({ id: `G_${s.toUpperCase()}`, members: [s], representative: s, direction: eligible[s].direction, sign: sgn(eligible[s].direction), mass: r4(eligible[s].confidence * eligible[s].strength) });
  const mass = groups.reduce((a, g) => a + g.mass, 0);
  const score = groups.reduce((a, g) => a + g.sign * g.mass, 0);
  const agreement = mass > 0 ? Math.abs(score) / mass : 0;
  const pos = groups.filter((g) => g.sign > 0 && g.mass >= F.contradiction_mass), neg = groups.filter((g) => g.sign < 0 && g.mass >= F.contradiction_mass);
  if (pos.length && neg.length) contradictions.push({ kind: 'MATERIAL', detail: `${pos.map((g) => g.representative).join('+')} BUY × ${neg.map((g) => g.representative).join('+')} SELL`, material: true });
  const freshness_ok = freshCount >= F.min_fresh_sources;
  const material = contradictions.some((c) => c.material);
  const dirGroups = groups.filter((g) => g.sign !== 0).length;
  let signal = 'NO_SIGNAL';
  const why = [];
  if (!freshness_ok) why.push(`só ${freshCount} fonte(s) fresca(s) (< ${F.min_fresh_sources})`);
  if (material) why.push('contradição material entre grupos independentes');
  if (Math.abs(score) < F.min_abs_score) why.push(`massa direcional |score| ${r4(Math.abs(score))} < ${F.min_abs_score}`);
  if (agreement < F.min_agreement) why.push(`agreement ${r4(agreement)} < ${F.min_agreement}`);
  if (!why.length) signal = score > 0 ? 'BUY' : 'SELL';
  const confidence = signal === 'NO_SIGNAL' ? 0 : agreement * Math.min(1, Math.abs(score) / F.score_full) * (dirGroups >= 2 ? 1 : F.single_group_factor);
  const list = (d) => SOURCES.filter((s) => sources[s].used && sources[s].direction === d);
  const reasoning_summary = signal === 'NO_SIGNAL'
    ? `NO_SIGNAL: ${why.join('; ')}.`
    : `${signal}: ${groups.filter((g) => g.sign === sgn(signal)).map((g) => `${LABEL[g.representative]} (massa ${g.mass})`).join(', ')}; agreement ${r4(agreement)}; ${dirGroups} grupo(s) direcional(is)${dirGroups < 2 ? ' — fonte única, confiança reduzida' : ''}.`;
  return {
    schema: FUSION_SCHEMA, cycle_id, timestamp: new Date(now).toISOString(), market: 'ES', signal,
    confidence: r4(confidence), agreement: r4(agreement), score: r4(score), evidence_mass: r4(mass), sources,
    bullish_sources: list('BUY'), bearish_sources: list('SELL'), neutral_sources: list('NEUTRAL'), ignored_sources: ignored,
    groups, contradictions, freshness_ok, fresh_count: freshCount, q_confirmation: 'NONE',
    reasoning_summary, rules_version: cfg.rules_version, calibration: 'UNCALIBRATED',
    jev: { status: 'PENDING' },
  };
}
