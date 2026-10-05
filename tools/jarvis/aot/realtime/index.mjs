// ALFA OMEGA real-time layer for JARVIS — SHADOW / READ-ONLY / ADVISORY (proposal §2.4).
// cycle = collect (one GET snapshot per source) → observations v1 → market view V1 → delta vs previous cycle.
// TRADING_MUTATIONS = 0 · ORDER_API_CALLS = 0: no order path exists in this module tree.
import { SOURCES, loadLineage } from './registry.mjs';
import { createCollector } from './collector.mjs';
import { buildObservations } from './observation.mjs';
import { computeView } from './confluence.mjs';
import { diffCycles } from './delta.mjs';

export * from './registry.mjs';
export { createCollector } from './collector.mjs';
export { buildObservations, withSkillContext, freshness, stateOf, sessionDate, QUALITY, SCHEMA } from './observation.mjs';
export { computeView, MARKET_VIEWS, REQUIRED_DIRECTION } from './confluence.mjs';
export { diffCycles } from './delta.mjs';

export function createRealtime({ lineage = loadLineage(), now = () => Date.now(), onResult = null, ...collectorOpts } = {}) {
  let last = null;
  const evaluate = (snap) => {
    const observations = buildObservations(snap, { lineage, sources: SOURCES, now });
    const view = computeView(observations);
    const result = { snapshot: snap, observations, view };
    const delta = diffCycles(last, result);
    last = result;
    return { ...result, delta };
  };
  let latest = null;
  const collector = createCollector({ now, ...collectorOpts, onCycle: async (snap) => { latest = evaluate(snap); if (onResult) await onResult(latest); } });
  return {
    collector, evaluate,
    setCadence: (c) => collector.setCadence(c), stop: () => collector.stop(),
    async runOnce() { await collector.collect(); return latest; },
    get latest() { return latest; },
  };
}
