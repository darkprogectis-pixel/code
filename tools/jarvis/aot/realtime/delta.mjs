// Delta engine (order §19, RT03): PREVIOUS vs CURRENT cycle ⇒ what changed. Mainly deltas go to Claude/JEV.
const key = (o) => `${o.indicator_id}#${o.capability_id}`;
const diffSet = (a, b) => b.filter((x) => !a.includes(x));

// prev/curr: { observations, view } (prev may be null on the first cycle).
export function diffCycles(prev, curr) {
  const before = new Map((prev?.observations || []).map((o) => [key(o), o]));
  const state_changes = []; const freshness_changes = []; const regime_changes = [];
  for (const o of curr.observations) {
    const p = before.get(key(o)); if (!p) continue;
    if (p.state !== o.state) state_changes.push({ id: key(o), previous_state: p.state, state: o.state });
    if (p.freshness !== o.freshness) freshness_changes.push({ id: key(o), previous: p.freshness, current: o.freshness });
    if (p.regime !== o.regime && (p.regime || o.regime)) regime_changes.push({ id: key(o), previous: p.regime, current: o.regime });
  }
  const pv = prev?.view; const cv = curr.view;
  return Object.freeze({
    schema: 'alfa-omega-delta/v1', first_cycle: !prev,
    previous_cycle: prev?.observations?.[0]?.cycle_id ?? null, cycle: curr.observations[0]?.cycle_id ?? null,
    view_change: pv && pv.market_view !== cv.market_view ? { previous: pv.market_view, current: cv.market_view } : null,
    state_changes, freshness_changes, regime_changes,
    new_confluences: diffSet(pv?.supporting_indicators || [], cv.supporting_indicators), lost_confluences: pv ? diffSet(cv.supporting_indicators, pv.supporting_indicators) : [],
    new_blockers: diffSet(pv?.blockers || [], cv.blockers), removed_blockers: pv ? diffSet(cv.blockers, pv.blockers) : [],
  });
}
