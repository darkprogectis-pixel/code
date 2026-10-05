// Confluence engine V1 (context/jev-future/alfaomega/ALFA_OMEGA_CONFLUENCE_MODEL.md). Advisory, SHADOW; never an order.
// - MARKET_VIEW V1 ∈ BULLISH · NEUTRAL · BEARISH · INSUFFICIENT_DATA (STRONG_/LEAN_ grades NOT_DEFINED).
// - Only fresh DIRECTION-role states vote, each independence group once. No fresh required direction ⇒ INSUFFICIENT_DATA.
// - CONFIRMATION: aligned ⇒ supporting; opposed ⇒ contradicting — except POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING (MenthorQ):
//   aligned = confirmation, anything else = zero effect (never vetoes, never blocks, never originates a side).
// - BUY/SELL bias is NOT_DEFINED in V1: no single indicator (and no unregistered rule) produces BUY_BIAS/SELL_BIAS.
// - Core × JEV fusion stays UNDEFINED; JEV four-source dealer inputs are never re-derived here.
import { DIRECTIONAL_STATES } from './observation.mjs';

export const MARKET_VIEWS = Object.freeze(['BULLISH', 'NEUTRAL', 'BEARISH', 'INSUFFICIENT_DATA']);
export const REQUIRED_DIRECTION = Object.freeze(['src:ALFA_QUANT']);
const opposite = (d) => (d === 'BULLISH' ? 'BEARISH' : d === 'BEARISH' ? 'BULLISH' : null);

export function computeView(observations) {
  const fresh = (o) => o.freshness === 'LIVE' && DIRECTIONAL_STATES.includes(o.state);
  const seen = new Set();
  const votes = observations.filter((o) => o.role === 'DIRECTION' && fresh(o)).filter((o) => (seen.has(o.group) ? false : (seen.add(o.group), true)));
  const stale = observations.filter((o) => ['STALE', 'DELAYED'].includes(o.freshness)).map((o) => o.indicator_id);
  const missing = observations.filter((o) => ['MISSING', 'UNKNOWN', 'NOT_SUPPORTED', 'ERROR'].includes(o.freshness)).map((o) => o.indicator_id);
  const blockers = observations.filter((o) => o.freshness === 'ERROR' || o.state === 'INVALID' || o.state === 'BLOCKED').map((o) => `${o.indicator_id}: ${o.freshness === 'ERROR' ? 'source error' : o.state}`);
  const regime = observations.find((o) => o.role === 'REGIME' && o.regime)?.regime ?? 'UNKNOWN';
  const data_sources = [...new Set(observations.map((o) => o.source))];
  const requiredOk = REQUIRED_DIRECTION.every((id) => votes.some((o) => o.indicator_id === id));
  const why = [];
  let view;
  if (!requiredOk) {
    view = 'INSUFFICIENT_DATA';
    why.push(`required direction input not fresh: ${REQUIRED_DIRECTION.filter((id) => !votes.some((o) => o.indicator_id === id)).join(', ')}`);
  } else {
    const dirs = new Set(votes.map((o) => o.state));
    view = dirs.size === 1 ? [...dirs][0] : 'NEUTRAL';
    why.push(`${votes.length} fresh direction vote(s): ${votes.map((o) => `${o.indicator_id}=${o.state}`).join(', ')}`);
    if (dirs.size > 1) why.push('direction votes disagree ⇒ NEUTRAL');
  }
  const supporting = []; const contradicting = [];
  if (view === 'BULLISH' || view === 'BEARISH') {
    for (const o of votes) (o.state === view ? supporting : o.state === opposite(view) ? contradicting : []).push(o.indicator_id);
    for (const o of observations.filter((x) => x.role === 'CONFIRMATION' && fresh(x))) {
      if (o.state === view) supporting.push(o.indicator_id);
      else if (o.state === opposite(view) && o.policy !== 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING') contradicting.push(o.indicator_id);
    }
  } else if (view === 'NEUTRAL') {
    for (const o of votes) (o.state === 'NEUTRAL' ? supporting : contradicting).push(o.indicator_id);
  }
  if (stale.length) why.push(`stale: ${stale.join(', ')}`);
  if (missing.length) why.push(`missing/unsupported: ${missing.join(', ')}`);
  return Object.freeze({
    schema: 'alfa-omega-market-view/v1', market_view: view, grade: 'NOT_DEFINED', bias: 'NOT_DEFINED', advisory_only: true,
    why: Object.freeze(why), supporting_indicators: Object.freeze(supporting), contradicting_indicators: Object.freeze(contradicting),
    blockers: Object.freeze(blockers), stale: Object.freeze(stale), missing: Object.freeze(missing), regime, data_sources: Object.freeze(data_sources),
    skill_context: Object.freeze([]), core_jev_fusion: 'UNDEFINED',
  });
}
