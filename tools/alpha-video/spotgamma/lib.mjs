// SpotGamma course knowledge — pure core on top of the alpha-video core (../lib.mjs, imported read-only; JEV req_01a103d036a5770f986230e2e6ead2ff).
// Schema spotgamma-course-knowledge/v1: SOURCE=SPOTGAMMA, SOURCE_CLASS=FIRST_PARTY_COURSE, KNOWLEDGE_SCOPE=SPOTGAMMA_ONLY.
// Course content is UNTRUSTED_EVIDENCE: classified and quoted (short), never executed or followed.
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../lib.mjs';

export { L };
export const SCHEMA = 'spotgamma-course-knowledge/v1';
export const SOURCE = 'SPOTGAMMA', SOURCE_CLASS = 'FIRST_PARTY_COURSE', SCOPE = 'SPOTGAMMA_ONLY';
export const CLAIM_TYPES = ['DEFINITION', 'PLATFORM_FEATURE', 'INDICATOR', 'METRIC', 'API_FIELD', 'FORMULA', 'RULE', 'HEURISTIC', 'MARKET_STRUCTURE', 'GAMMA_CONCEPT', 'DEALER_POSITIONING', 'VOLATILITY_CONCEPT', 'LEVEL_INTERPRETATION', 'WORKFLOW', 'TRADING_INTERPRETATION', 'EXAMPLE', 'LIMITATION', 'WARNING', 'OPINION'];
export const API_ATTR = ['SPOTGAMMA_API_CONFIRMED', 'SPOTGAMMA_API_PROBABLE', 'SPOTGAMMA_PLATFORM_ONLY', 'SPOTGAMMA_CONCEPTUAL', 'GENERAL_MARKET_KNOWLEDGE', 'UNKNOWN'];
export const TERM_CLASSES = ['SPOTGAMMA_PROPRIETARY_TERM', 'SPOTGAMMA_PRODUCT_TERM', 'GENERAL_OPTIONS_CONCEPT', 'GENERAL_MARKET_CONCEPT', 'UNCLASSIFIED'];
export const CONTRA_CATS = ['TRUE_CONTRADICTION', 'REGIME_DEPENDENT', 'CONTEXT_DEPENDENT', 'TIME_HORIZON_DIFFERENCE', 'INSTRUMENT_DIFFERENCE', 'WORDING_ONLY', 'POSSIBLE_DETECTOR_FALSE_POSITIVE', 'UNRESOLVED'];
export const TEXT_SOURCES = ['page_transcript', 'captions_asr', 'captions_manual', 'stt_local', 'page_text', 'ocr'];
const GAMMA_C = new Set(['Gamma', 'GEX', 'Zero Gamma', 'Gamma Flip', 'Absolute Gamma', 'Large Gamma', 'Market Regime']);
const VOL_C = new Set(['Volatility', 'Implied Volatility', 'Volatility Risk Premium', 'Skew', 'Term Structure', 'Tail Risk', 'Vega', 'Expected Move']);
const LEVEL_C = new Set(['Call Wall', 'Put Wall', 'Volatility Trigger', 'Hedge Wall', 'Key Gamma Strike', 'Key Delta Strike', 'Zero Gamma', 'Large Gamma', 'Combo Strike', 'Support', 'Resistance', 'Pin']);
const DEALER_C = new Set(['Market Maker', 'Dealer Positioning', 'Delta Hedging', 'Delta']);
const MARKET_C = new Set(['Open Interest', 'Synthetic OI', 'Options Flow', 'Liquidity', 'Calls', 'Puts', 'Put/Call Ratio', 'OPEX', '0DTE']);

export function loadSgConfig(repo = L.REPO) { return JSON.parse(fs.readFileSync(path.join(repo, 'config', 'alpha-video-spotgamma.json'), 'utf8')); }
export const fold = L.fold;

// The lesson page holds an optional first-party transcript after a "Transcript:" marker; everything else is page body text.
export function splitPageText(text) {
  const t = String(text || '').replace(/\r/g, ''), i = t.search(/(^|\n)\s*Transcript:\s*\n/);
  const clean = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean).join('\n');
  if (i < 0) return { body: clean(t), transcript: '' };
  const after = t.slice(i).replace(/^\s*Transcript:\s*/, '');
  // a "Trader Tip:" paragraph after the transcript is page text, not narration
  const tip = after.search(/\n\s*Trader Tip:/);
  return { body: clean(t.slice(0, i) + (tip >= 0 ? '\n' + after.slice(tip) : '')), transcript: clean(tip >= 0 ? after.slice(0, tip) : after) };
}
export const sentences = (t) => String(t || '').split('\n').flatMap((p) => L.splitSentences(p)).map((s) => s.trim()).filter((s) => s.length >= 12);

// json3 caption events ⇒ cues (newline-only events dropped; "[music]" kept as non-speech marker but excluded from text alignment).
export function eventsToCues(events) {
  return (events || []).map((e) => ({ start_ms: e.t, end_ms: e.t + (e.d || 0), text: String(e.text || '').replace(/\s+/g, ' ').trim() }))
    .filter((c) => c.text && !/^\[[a-z ]+\]$/i.test(c.text)).map((c, i, a) => ({ ...c, end_ms: c.end_ms > c.start_ms ? c.end_ms : (a[i + 1]?.start_ms ?? c.start_ms + 2000) }));
}

// Monotonic alignment of first-party transcript sentences to timed ASR cues by token overlap. Unaligned ⇒ timestamps null (never guessed).
const toks = (s) => L.fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
export function alignSentences(sents, cues, minScore = 0.35) {
  const ct = cues.map((c) => toks(c.text)); let ptr = 0; const out = [];
  for (const s of sents) {
    const st = toks(s), S = new Set(st); let best = null;
    if (st.length) for (let a = Math.max(0, ptr - 2); a < Math.min(cues.length, ptr + 25); a++) {
      const bag = []; for (let b = a; b < Math.min(cues.length, a + 12); b++) {
        bag.push(...ct[b]); const B = new Set(bag); let inter = 0; for (const w of S) if (B.has(w)) inter++;
        const p = inter / B.size, r = inter / S.size, f = p + r ? (2 * p * r) / (p + r) : 0;
        if (!best || f > best.score) best = { a, b, score: f };
        if (bag.length > st.length * 2.2) break;
      }
    }
    if (best && best.score >= minScore) { out.push({ text: s, start_ms: cues[best.a].start_ms, end_ms: cues[best.b].end_ms, score: Math.round(best.score * 100) / 100, cues: [best.a, best.b] }); ptr = best.b + 1; }
    else out.push({ text: s, start_ms: null, end_ms: null, score: best ? Math.round(best.score * 100) / 100 : 0, cues: null });
  }
  return out;
}

export function termClassOf(concept, cfg) { for (const [k, list] of Object.entries(cfg.term_classes)) if (list.includes(concept)) return k; return 'UNCLASSIFIED'; }

const RX = {
  opinion: /\b(i think|i believe|in my opinion|i feel|my view|we think|we believe|personally)\b/,
  example: /\b(for example|for instance|e\.g\.|case study|trader tip|trade example|in this example|on (january|february|march|april|may|june|july|august|september|october|november|december) \d)/,
  warning: /\b(be careful|caution|warning|beware|risk of|don't|do not|avoid|never)\b/,
  limitation: /\b(not a guarantee|no guarantee|doesn't guarantee|does not guarantee|not always|isn't always|is not always|can't predict|cannot predict|not predictive|not a signal|limitations?|may not|doesn't mean|does not mean)\b/,
  workflow: /\b(step \d|first,|next,|then,|start by|begin by|checklist|workflow|pre-market|each morning|click|select|toggle|open the|navigate|filter by|set up|settings)\b/,
  formula: /(\bequals\b|\bcalculated as\b|\bsum of\b|\bmultiplied by\b|\bdivided by\b|\bratio of\b|\bformula\b| = )/,
  rule: /\b(if|when|whenever|once)\b.{3,}?(\bthen\b|,)/,
  trade: /\b(bullish|bearish|buy|sell|long|short|entry|entries|exit|stop|target|trade|trades|trading|position|spread|reward|risk)\b/,
  metric: /\b(measures?|measured|metric|reading|value|percent|percentage|ratio|score|notional|\d+%)\b/,
  platform: /\b(tool|dashboard|chart|table|tab|page|scanner|filter|setting|toggle|alert|alerts|feature|view|panel|platform|subscription|tier|discord|webinar|support center|user guide|integration)\b/,
  definition: /\b(is|are|means|refers to|represents|shows|tells you|measures|is defined as)\b/,
  structure: /\b(open interest|liquidity|flows?|positioning|hedging|market structure|supply|demand)\b/,
  dealer: /\b(market makers?|dealers?|hedg\w*)\b/,
};
export function claimTypeOf(sentence, concept, evidenceType, apiAttr, source) {
  const t = L.fold(sentence), c = String(concept);
  if (evidenceType === 'OPINION' || RX.opinion.test(t)) return 'OPINION';
  if (source === 'ocr') return termIsProduct(c) ? 'PLATFORM_FEATURE' : 'EXAMPLE';
  if (RX.example.test(t)) return 'EXAMPLE';
  if (RX.limitation.test(t)) return 'LIMITATION';
  if (RX.warning.test(t)) return 'WARNING';
  if (RX.formula.test(t)) return 'FORMULA';
  const def = evidenceType === 'DEFINITION' || new RegExp(`${L.fold(c).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^.]{0,25}\\b(is|are|means|refers to|represents|shows|tells you|measures)\\b`).test(t);
  if (def && apiAttr === 'SPOTGAMMA_API_CONFIRMED' && /\b(level|strike|data|value|field)\b/.test(t)) return 'API_FIELD';
  if (def) return 'DEFINITION';
  if (RX.workflow.test(t)) return 'WORKFLOW';
  if (LEVEL_C.has(c)) return /\b(support|resistance|magnet|pin|acts? as|cap|floor|ceiling|above|below|break|hold)\b/.test(t) ? 'LEVEL_INTERPRETATION' : 'INDICATOR';
  if (termIsProduct(c)) return RX.platform.test(t) ? 'PLATFORM_FEATURE' : 'INDICATOR';
  if (RX.rule.test(t) && !RX.trade.test(t)) return 'RULE';
  if (RX.trade.test(t)) return 'TRADING_INTERPRETATION';
  if (GAMMA_C.has(c)) return 'GAMMA_CONCEPT';
  if (VOL_C.has(c)) return 'VOLATILITY_CONCEPT';
  if (DEALER_C.has(c) || RX.dealer.test(t)) return 'DEALER_POSITIONING';
  if (MARKET_C.has(c) || RX.structure.test(t)) return 'MARKET_STRUCTURE';
  if (RX.metric.test(t)) return 'METRIC';
  if (RX.platform.test(t)) return 'PLATFORM_FEATURE';
  return 'HEURISTIC';
}
let PRODUCT = null;
function termIsProduct(c) { return PRODUCT ? PRODUCT.has(c) : false; }
export function setProducts(cfg) { PRODUCT = new Set(cfg.term_classes.SPOTGAMMA_PRODUCT_TERM); }

// API attribution — CONFIRMED only when the concept maps to a field present in the recorded capture-API snapshot (the course names
// the SpotGamma data item; the field proves it is delivered as data). A theoretical concept is never promoted to an API field.
const NAMES_SG = /\b(spotgamma|spot gamma|our (levels?|data|tools?|models?|platform)|we (track|calculate|compute|identify|flag|show))\b/;
export function apiAttributionOf(concept, sentence, termClass, cfg) {
  const map = cfg.api_field_map[concept];
  if (map && (termClass === 'SPOTGAMMA_PROPRIETARY_TERM' || termClass === 'SPOTGAMMA_PRODUCT_TERM' || ['Zero Gamma', 'Expected Move', 'Put/Call Ratio', 'Charm'].includes(concept)))
    return { api_attribution: 'SPOTGAMMA_API_CONFIRMED', api_field: map.field, basis: `course names ${concept}; field present in capture-API snapshot (${cfg.api_snapshot_basis})` };
  if (termClass === 'SPOTGAMMA_PROPRIETARY_TERM') return { api_attribution: 'SPOTGAMMA_API_PROBABLE', api_field: null, basis: `SpotGamma-named data item taught by the course; no field in our capture-API snapshot${cfg.api_absent_notes?.[concept] ? ' — ' + cfg.api_absent_notes[concept] : ''}` };
  if (termClass === 'SPOTGAMMA_PRODUCT_TERM') return { api_attribution: 'SPOTGAMMA_PLATFORM_ONLY', api_field: null, basis: 'SpotGamma product/tool feature; not a field of our capture API' };
  if (termClass === 'GENERAL_OPTIONS_CONCEPT' || termClass === 'GENERAL_MARKET_CONCEPT') {
    if (NAMES_SG.test(L.fold(sentence))) return { api_attribution: 'SPOTGAMMA_CONCEPTUAL', api_field: null, basis: `SpotGamma's explanation of a general concept (${concept})${cfg.api_absent_notes?.[concept] ? ' — ' + cfg.api_absent_notes[concept] : ''}` };
    return { api_attribution: 'GENERAL_MARKET_KNOWLEDGE', api_field: null, basis: `general concept (${termClass})${cfg.api_absent_notes?.[concept] ? ' — ' + cfg.api_absent_notes[concept] : ''}` };
  }
  return { api_attribution: 'UNKNOWN', api_field: null, basis: 'concept not classified' };
}

const BASE = { DEFINITION: 0.75, EXPLICIT_STATEMENT: 0.65, EXAMPLE: 0.6, PROCEDURE: 0.55, VISUAL_DEMONSTRATION: 0.45, OPINION: 0.3 };
const SRC_CAP = { page_transcript: 1, page_text: 0.9, captions_manual: 0.9, captions_asr: 0.6, stt_local: 0.6, ocr: 0.45 };
export function confidenceOf(evidenceType, source, flags, aligned = true) {
  let c = Math.min(BASE[evidenceType] ?? 0.4, SRC_CAP[source] ?? 0.5);
  if (source === 'page_transcript' && !aligned) c *= 0.9;
  if (flags.length) c *= 0.5;
  return Math.round(c * 100) / 100;
}

// unit = {text, source, start_ms, end_ms, video_id, lesson, frame_refs, pointer, align_score}
export function itemsFromUnit(u, ctx) {
  const { cfg, matchers, createdAt } = ctx, out = [], flags = L.untrustedFlags(u.text, cfg), seen = new Set();
  for (const { concept, surface } of L.detectConcepts(u.text, matchers)) {
    if (seen.has(concept)) continue; seen.add(concept);
    const term_class = termClassOf(concept, cfg), a = apiAttributionOf(concept, u.text, term_class, cfg);
    const evidence_type = L.evidenceTypeOf(u.text, surface, u.source === 'ocr' ? 'ocr' : 'text');
    const claim_type = claimTypeOf(u.text, concept, evidence_type, a.api_attribution, u.source);
    const statement = L.defang(u.text).slice(0, cfg.extraction.statement_max_chars);
    const l = u.lesson;
    out.push({
      schema: SCHEMA, knowledge_id: `sgk_${L.sha16([l.lesson_id, u.source, u.start_ms, u.pointer, concept, u.text].join('|'))}`,
      source: SOURCE, source_class: SOURCE_CLASS, knowledge_scope: SCOPE, course: cfg.course.title,
      module: l.module, module_index: l.module_index, lesson: l.title, lesson_id: l.lesson_id, lesson_url: l.url, lesson_type: l.type,
      video_id: u.video_id || null, timestamp_start: u.start_ms, timestamp_end: u.end_ms,
      timestamp: u.start_ms == null ? null : `${L.fmtTs(u.start_ms)}–${L.fmtTs(u.end_ms)}`, timestamp_null_reason: u.start_ms == null ? (u.source === 'page_text' ? 'PAGE_TEXT_NOT_VIDEO' : 'TRANSCRIPT_SENTENCE_UNALIGNED') : null,
      evidence_type, text_source: u.source, raw_evidence_pointer: u.pointer, frame_refs: u.frame_refs || [], align_score: u.align_score ?? null,
      statement, quote_kind: u.source === 'captions_asr' ? 'ASR_CAPTION' : u.source === 'ocr' ? 'OCR_TEXT' : 'FIRST_PARTY_TEXT',
      normalized_concept: concept, surface, claim_type, term_class,
      api_attribution: a.api_attribution, api_field: a.api_field, api_attribution_basis: a.basis,
      confidence: confidenceOf(evidence_type, u.source, flags, u.start_ms != null), uncalibrated: true,
      untrusted_flags: flags, content_trust: 'UNTRUSTED_EVIDENCE', review_status: flags.length ? 'QUARANTINED' : 'PENDING_REVIEW',
      deterministic_rule: false, created_at: createdAt,
    });
  }
  return out;
}

export const REQUIRED = ['knowledge_id', 'source', 'source_class', 'course', 'module', 'lesson', 'lesson_url', 'evidence_type', 'raw_evidence_pointer', 'statement', 'normalized_concept', 'claim_type', 'confidence', 'api_attribution', 'created_at'];
export function validateSgItem(it, ctx) {
  const e = [];
  if (it.schema !== SCHEMA) e.push('schema');
  for (const k of REQUIRED) if (it[k] == null || it[k] === '') e.push(`missing:${k}`);
  if (it.source !== SOURCE || it.source_class !== SOURCE_CLASS) e.push('source_invalid');
  if (!CLAIM_TYPES.includes(it.claim_type)) e.push('claim_type_invalid');
  if (!API_ATTR.includes(it.api_attribution)) e.push('api_attribution_invalid');
  if (!TERM_CLASSES.includes(it.term_class)) e.push('term_class_invalid');
  if (!TEXT_SOURCES.includes(it.text_source)) e.push('text_source_invalid');
  if (it.api_attribution === 'SPOTGAMMA_API_CONFIRMED' && !(it.api_field && ctx.cfg.api_field_map[it.normalized_concept])) e.push('api_confirmed_without_field');
  if (it.timestamp_start == null) { if (it.text_source !== 'page_text' && it.text_source !== 'page_transcript') e.push('timestamp_missing'); if (!it.timestamp_null_reason) e.push('timestamp_null_reason_missing'); }
  else if (!Number.isInteger(it.timestamp_start) || !Number.isInteger(it.timestamp_end) || it.timestamp_end < it.timestamp_start) e.push('timestamp_invalid');
  else if (it.video_id && ctx.durations.get(it.video_id) && it.timestamp_end > ctx.durations.get(it.video_id) * 1000 + 2000) e.push('timestamp_out_of_video');
  if (it.timestamp_start != null && !it.video_id) e.push('timestamp_without_video');
  if (it.text_source === 'ocr' && !(it.frame_refs || []).length) e.push('visual_without_frame');
  if (ctx.pointerExists && !ctx.pointerExists(it.raw_evidence_pointer)) e.push('pointer_missing');
  if (typeof it.confidence !== 'number' || it.confidence < 0 || it.confidence > 1) e.push('confidence_invalid');
  return e;
}

// Contradictions: alpha-video detector (fix #3: glued regime names are not predicates; OCR excluded) across DIFFERENT lessons,
// then a category from explicit lexical evidence. TRUE_CONTRADICTION is never auto-assigned; nothing is resolved or deleted.
export function contradictions(items, cfg) {
  // regime names ("positive gamma", "short gamma", "above the vol trigger"…) are stripped for EVERY concept before polarity detection:
  // a regime word next to another concept (e.g. Market Maker) is not a predicate either (extends alpha-video fix #3).
  const escRe = (w) => L.fold(w).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
  const REGIME = new RegExp(`(?<![a-z0-9])(${cfg.regime_words.filter((w) => w !== 'regime').sort((x, y) => y.length - x.length).map(escRe).join('|')})(?![a-z0-9])`, 'g');
  const adapted = items.map((it) => ({ id: it.knowledge_id, concept: it.normalized_concept, statement: L.fold(it.statement).replace(REGIME, ' '), video_id: it.lesson_id, segment_id: it.raw_evidence_pointer, start_ms: it.timestamp_start, end_ms: it.timestamp_end, evidence: { text_source: it.text_source === 'ocr' ? 'ocr' : 'text', frame_refs: it.frame_refs }, review_status: it.review_status }));
  const raw = L.findContradictions(adapted, { ...cfg, polarity_pairs: cfg.polarity_pairs }, (lessonId) => lessonId);
  const byId = new Map(items.map((i) => [i.knowledge_id, i]));
  return raw.map((c) => { const a = byId.get(c.evidence_a.item_id), b = byId.get(c.evidence_b.item_id), cat = categorize(a, b, c.axis, cfg);
    return { contradiction_id: c.contradiction_id.replace(/^vc_/, 'sgc_'), concept: c.concept, axis: c.axis, category: cat.category, category_basis: cat.basis,
      claim_a: a.statement, evidence_a: { knowledge_id: a.knowledge_id, lesson: a.lesson, lesson_id: a.lesson_id, timestamp: a.timestamp, pointer: a.raw_evidence_pointer },
      claim_b: b.statement, evidence_b: { knowledge_id: b.knowledge_id, lesson: b.lesson, lesson_id: b.lesson_id, timestamp: b.timestamp, pointer: b.raw_evidence_pointer },
      status: 'UNRESOLVED', resolution: null, policy: 'NEVER_AUTO_RESOLVED' }; });
}
const has = (t, words) => words.find((w) => new RegExp(`(?<![a-z0-9])${L.fold(w).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![a-z0-9])`).test(t));
export function categorize(a, b, axis, cfg) {
  const ta = L.fold(a.statement), tb = L.fold(b.statement);
  const ra = has(ta, cfg.regime_words), rb = has(tb, cfg.regime_words);
  if (ra || rb) return { category: 'REGIME_DEPENDENT', basis: `regime wording: "${ra || ''}" / "${rb || ''}"` };
  const ia = /\b(spx|spy|qqq|index|indices|es futures|futures)\b/.test(ta), ib = /\b(spx|spy|qqq|index|indices|es futures|futures)\b/.test(tb);
  const sa = /\b(stock|stocks|single stock|equit|single names?|tsla|coin|nbis|aapl|msft)\b/.test(ta), sb = /\b(stock|stocks|single stock|equit|single names?|tsla|coin|nbis|aapl|msft)\b/.test(tb);
  if ((ia && sb && !ib) || (sa && ib && !ia)) return { category: 'INSTRUMENT_DIFFERENCE', basis: 'one claim about index/futures, the other about single stocks' };
  const ha = has(ta, cfg.horizon_words), hb = has(tb, cfg.horizon_words);
  if (ha && hb && ha !== hb) return { category: 'TIME_HORIZON_DIFFERENCE', basis: `horizons "${ha}" vs "${hb}"` };
  if (axis === 'support/resistance' || axis === 'above/below' || axis === 'higher/lower') return { category: 'CONTEXT_DEPENDENT', basis: `axis ${axis}: location words describe where price is relative to the level, not opposite definitions` };
  if (a.claim_type === 'EXAMPLE' || b.claim_type === 'EXAMPLE') return { category: 'CONTEXT_DEPENDENT', basis: 'one side is a dated example/case study' };
  const both = (t, axisStr) => axisStr.split('/').every((w) => new RegExp(`(?<![a-z0-9])${w}`).test(t));
  if (both(ta, axis) || both(tb, axis)) return { category: 'WORDING_ONLY', basis: 'one statement already contains both poles of the axis' };
  const share = (x, y) => { const X = new Set(toks(x)), Y = new Set(toks(y)); let i = 0; for (const w of X) if (Y.has(w)) i++; return i / Math.max(1, Math.min(X.size, Y.size)); };
  if (share(a.statement, b.statement) < 0.15) return { category: 'POSSIBLE_DETECTOR_FALSE_POSITIVE', basis: 'statements share almost no vocabulary beyond the concept (different subjects)' };
  return { category: 'UNRESOLVED', basis: 'polarity opposition without regime/instrument/horizon/context evidence — human review' };
}
