// JARVIS read-only tool registry over the Alpha state (var/alpha via tools/jev-obs/alpha.mjs). No filesystem/shell exposure,
// no network, no action tools. Every fact carries provenance: {value, unit, source, source_timestamp, age_ms, fresh, confidence, evidence, raw_ref}.
import { alphaLatest, alphaHistory } from '../jev-obs/alpha.mjs';

export const SOURCES = ['quant', 'gamma', 'bot', 'q', 'data'];
export const NAME = { quant: 'α Quant', gamma: 'α Gamma', bot: 'α Bot', q: 'α Q', data: 'α Data', fusion: 'Fusion' };

export function loadState({ dir, latest, history } = {}) {
  const L = latest || alphaLatest(dir);
  const H = history || (L.status === 'OK' ? alphaHistory(dir, 300) : { rows: [], flips: [] });
  return { L, H, ok: L.status === 'OK', fixture: !!L.fixture };
}
const env = (S, s) => (S.ok ? S.L.envelopes.find((e) => e.source === s) || null : null);
const fact = (e, value, extra = {}) => ({ value, unit: null, source: e.source, source_timestamp: e.source_timestamp, age_ms: e.age_ms, fresh: e.fresh, confidence: e.confidence, evidence: [], raw_ref: e.raw_ref?.endpoints?.[0]?.snapshot_id ?? null, ...extra });

export const TOOLS = {
  get_specialist_state(S, { source }) {
    const e = env(S, source); if (!e) return null;
    return fact(e, { direction: e.direction, strength: e.strength, confidence: e.confidence, health: e.health, role: e.role, warnings: e.warnings.slice(0, 3) }, { evidence: e.evidence.slice(0, 4).map((x) => `${x.field}=${JSON.stringify(x.value)}`) });
  },
  get_field(S, { source, field }) {
    const e = env(S, source); const x = e?.evidence.find((v) => v.field === field);
    return x && x.value != null ? fact(e, x.value, { unit: x.unit, evidence: [`${x.field}: ${x.meaning}`], validation: x.validation, effect: x.effect }) : null;
  },
  get_levels(S, { level = null, source = null } = {}) {
    if (!S.ok) return [];
    const out = [];
    for (const e of S.L.envelopes) if (!source || e.source === source) for (const [k, v] of Object.entries(e.levels || {})) if (!level || k.toLowerCase().startsWith(level.toLowerCase()) || k.toLowerCase().includes(level.toLowerCase()))
      out.push(fact(e, v.value, { name: k, unit: v.unit, evidence: [v.origin], market_origin: v.market_origin || null }));
    return out;
  },
  get_history(S, { limit = 60 } = {}) { return S.H.rows.slice(-limit).map((r) => ({ at: r.at, signal: r.signal, confidence: r.confidence, sources: r.sources })); },
  compare_sources(S, { sources }) { return sources.map((s) => (s === 'fusion' ? TOOLS.get_fusion_state(S) : TOOLS.get_specialist_state(S, { source: s }))).filter(Boolean); },
  get_fusion_state(S) {
    if (!S.ok) return null; const f = S.L.fusion;
    return { value: { signal: f.signal, confidence: f.confidence, agreement: f.agreement, fresh_count: f.fresh_count }, unit: null, source: 'fusion', source_timestamp: f.timestamp, age_ms: S.L.age_ms, fresh: f.freshness_ok, confidence: f.confidence, evidence: [f.reasoning_summary], raw_ref: f.cycle_id };
  },
  explain_fusion(S) {
    const b = TOOLS.get_fusion_state(S); if (!b) return null; const f = S.L.fusion;
    return { ...b, value: { ...b.value, reasoning: f.reasoning_summary, groups: f.groups, ignored: f.ignored_sources, contradictions: f.contradictions, jev: { status: f.jev?.status, q10: f.jev?.questions?.Q10?.winner ?? null, margin: f.jev?.questions?.Q10?.margin ?? null } } };
  },
  get_market_snapshot(S) { return S.ok ? { fusion: TOOLS.get_fusion_state(S), specialists: SOURCES.map((s) => TOOLS.get_specialist_state(S, { source: s })).filter(Boolean) } : null; },
  get_source_health(S, { source = null } = {}) {
    if (!S.ok) return [];
    return S.L.envelopes.filter((e) => !source || e.source === source).map((e) => fact(e, { health: e.health, fresh: e.fresh, age_ms: e.age_ms, warnings: e.warnings.slice(0, 2), missing: e.missing_fields.slice(0, 4) }));
  },
};
export const TOOL_NAMES = Object.keys(TOOLS);
