// Alpha video knowledge — pure core: corpus paths, ids, untrusted-content flags, concept detection, segmentation,
// deterministic extraction (video-knowledge/v1), API attribution, quality gate, contradictions, indexes and retrieval.
// Everything read from a video is UNTRUSTED_EVIDENCE: it is stored, classified and quoted, never executed or followed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA = 'video-knowledge/v1';
export const APIS = ['quant', 'gamma', 'bot', 'q', 'data'];
export const API_VALUES = [...APIS, 'cross_api', 'unknown'];
export const ATTRIBUTION = ['API_CONFIRMED', 'API_PROBABLE', 'CROSS_API', 'API_UNKNOWN'];
export const EVIDENCE_TYPES = ['EXPLICIT_STATEMENT', 'VISUAL_DEMONSTRATION', 'EXAMPLE', 'DEFINITION', 'PROCEDURE', 'OPINION', 'INFERENCE'];
export const KNOWLEDGE_CLASSES = ['DEFINITION', 'API_FIELD_MEANING', 'FORMULA', 'RULE', 'HEURISTIC', 'TRADING_INTERPRETATION', 'EXAMPLE', 'OPINION'];
export const SOURCE_KINDS = ['SOURCE_API_DOCS', 'SOURCE_CODE', 'SOURCE_VIDEO', 'SOURCE_INFERENCE'];
const DIRECTION_CONCEPTS = new Set(['BUY', 'SELL', 'NEUTRAL']);

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha16 = (s) => sha256(String(s)).slice(0, 16);
export const nowIso = () => new Date().toISOString();
export const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export function writeJson(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(t, f); }
export function sha256File(file) {
  const h = crypto.createHash('sha256'); const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(1 << 20);
  try { let n; while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
export const fmtTs = (ms) => { const t = Math.max(0, Math.round(ms)); const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, x = t % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`; };

export function loadConfig(file = path.join(REPO, 'config', 'alpha-video.json')) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

export function corpusPaths(root) {
  const d = (...x) => path.join(root, ...x);
  return { root, manifest: d('manifest.json'), sources: d('sources'), transcripts: d('transcripts'), frames: d('frames'), segments: d('segments'), evidence: d('evidence'), concepts: d('concepts'), indexes: d('indexes'),
    contradictions: d('evidence', 'contradictions.json'), rejected: d('evidence', 'rejected.jsonl'), jev: d('evidence', 'jev-decisions.jsonl'), inverted: d('indexes', 'inverted.json'), stats: d('indexes', 'stats.json') };
}
export function ensureCorpus(root) {
  const p = corpusPaths(root);
  for (const k of ['sources', 'transcripts', 'frames', 'segments', 'evidence', 'concepts', 'indexes']) fs.mkdirSync(p[k], { recursive: true });
  if (!fs.existsSync(p.manifest)) writeJson(p.manifest, { schema: 'alpha-video-manifest/v1', content_trust: 'UNTRUSTED_EVIDENCE', videos: [] });
  return p;
}

// ---- text normalization / untrusted content ----
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (syn) => new RegExp(`(?<![a-z0-9])${esc(fold(syn)).replace(/\s+/g, '\\s+')}(?![a-z0-9])`, 'g');

export function untrustedFlags(text, cfg) {
  const t = fold(text), flags = [];
  for (const [flag, pats] of Object.entries(cfg.untrusted_patterns || {})) if (pats.some((p) => new RegExp(p, 'i').test(t))) flags.push(flag);
  return flags;
}
// URLs are stored disarmed so nothing downstream can follow them by accident.
export const defang = (s) => String(s || '')
  .replace(/\bhttp(s?):\/\//gi, 'hxxp$1://')
  .replace(/\b((?:[a-z0-9-]+\.)+)(com|net|org|io|xyz|ru|br|dev|app|info)\b/gi, (m, a, b) => `${a.slice(0, -1)}[.]${b}`);

// ---- concepts ----
export function conceptMatchers(cfg) {
  const list = [];
  for (const [concept, syns] of Object.entries(cfg.concepts)) for (const s of syns) list.push({ concept, syn: s, re: wordRe(s), len: fold(s).length });
  return list.sort((a, b) => b.len - a.len);
}
// Longest synonym first; a consumed span cannot match a shorter synonym (so "Gamma Exposure" is not also "Gamma").
export function detectConcepts(text, matchers) {
  const t = fold(text), used = [], found = [];
  for (const m of matchers) {
    m.re.lastIndex = 0; let r;
    while ((r = m.re.exec(t))) {
      const a = r.index, b = a + r[0].length;
      if (used.some(([x, y]) => a < y && b > x)) continue;
      used.push([a, b]); found.push({ concept: m.concept, surface: String(text).slice(a, b), index: a });
    }
  }
  return found.sort((x, y) => x.index - y.index);
}
const KNOWN_UPPER = new Set(['ES', 'NQ', 'SPX', 'SPY', 'QQQ', 'MES', 'MNQ', 'VIX', 'RTH', 'ETF', 'OK', 'API', 'USA', 'US', 'PM', 'AM', 'CEO', 'TV', 'PDF', 'URL', 'HTTP', 'HTTPS', 'WWW', 'EUA', 'JSON', 'CSV', 'EST', 'ET', 'UTC']);
// Candidate unknown jargon: acronyms (2–6 caps) and CamelCase tokens not covered by the glossary. Original spelling preserved.
// Ordinary words written in caps on slides (OCR) are not domain terms.
const COMMON_CAPS = new Set('THE AND FOR WITH FROM THIS THAT WHAT WHEN YOU YOUR ARE NOT BUT ALL CAN HOW WHY OUT OUR NEW TOP LOW HIGH LONG SHORT RECAP VS SS OF TO IN ON AT BY OR IS IT AS BE DE DA DO EM NO NA OS AS UM UMA COM SEM QUE'.split(' '));
export function unknownTerms(text, matchers) {
  const known = new Set(matchers.map((m) => fold(m.syn)));
  const out = new Set();
  for (const m of String(text).matchAll(/\b([A-Z]{2,6}|[A-Z][a-z]+[A-Z][A-Za-z]+)\b/g)) {
    const w = m[1]; if (KNOWN_UPPER.has(w) || COMMON_CAPS.has(w) || known.has(fold(w))) continue; out.add(w);
  }
  return [...out];
}

// Word-level diff raw ⇒ corrected (LCS): the spans the STT correction layer changed, case-only changes ignored.
export function correctionPairs(raw, corrected) {
  const a = String(raw || '').split(/\s+/).filter(Boolean), b = String(corrected || '').split(/\s+/).filter(Boolean);
  const eq = (x, y) => fold(x).replace(/[^a-z0-9-]/g, '') === fold(y).replace(/[^a-z0-9-]/g, '');
  const n = a.length, m = b.length, T = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = eq(a[i], b[j]) ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
  const out = []; let i = 0, j = 0, ha = [], hb = [];
  const flush = () => { if (ha.length || hb.length) out.push({ heard: ha.join(' '), corrected: hb.join(' ') }); ha = []; hb = []; };
  while (i < n || j < m) {
    if (i < n && j < m && eq(a[i], b[j])) { flush(); i++; j++; }
    else if (j < m && (i >= n || T[i][j + 1] >= T[i + 1][j])) hb.push(b[j++]);
    else ha.push(a[i++]);
  }
  flush();
  return out.filter((p) => p.heard && p.corrected);
}

// ---- captions (sidecar .vtt/.srt or embedded stream exported as WebVTT) ----
const tsMs = (s) => { const m = String(s).trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/); if (!m) return null; return ((+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 + Math.round(+(`0.${m[4] || '0'}`) * 1000); };
export function parseCaptions(text) {
  const cues = []; const lines = String(text).replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/); if (!m) continue;
    const a = tsMs(m[1]), b = tsMs(m[2]); const body = [];
    for (i++; i < lines.length && lines[i].trim() !== ''; i++) body.push(lines[i].replace(/<[^>]+>/g, '').trim());
    const t = body.join(' ').replace(/\s+/g, ' ').trim();
    if (a != null && b != null && t && !(cues.length && cues.at(-1).text === t && cues.at(-1).end_ms >= a)) cues.push({ start_ms: a, end_ms: b, text: t });
  }
  return cues;
}

// ---- segmentation ----
// cues [{start_ms,end_ms,text}] + frames [{ref, t_ms, ocr}] ⇒ segments. Deterministic: pause / max length / topic shift.
export function segmentize(video, cues, frames, cfg, matchers) {
  const S = cfg.segmentation, segs = [];
  const conceptsOf = (t) => new Set(detectConcepts(t, matchers).map((c) => c.concept));
  let cur = null;
  const close = () => { if (cur) segs.push(cur); cur = null; };
  for (const c of [...cues].sort((a, b) => a.start_ms - b.start_ms)) {
    const cc = conceptsOf(c.text);
    if (cur) {
      const dur = cur.end_ms - cur.start_ms, gap = c.start_ms - cur.end_ms;
      const shift = cc.size && cur._c.size && ![...cc].some((x) => cur._c.has(x));
      if ((gap >= S.pause_ms && dur >= S.min_ms) || c.end_ms - cur.start_ms > S.max_ms || (shift && dur >= S.min_ms)) close();
    }
    if (!cur) cur = { start_ms: c.start_ms, end_ms: c.end_ms, cues: [], _c: new Set() };
    cur.cues.push(c); cur.end_ms = Math.max(cur.end_ms, c.end_ms); for (const x of cc) cur._c.add(x);
  }
  close();
  if (!segs.length && frames.length) { // no speech: windows over the visual timeline
    let w = null;
    for (const f of [...frames].sort((a, b) => a.t_ms - b.t_ms)) {
      if (w && f.t_ms - w.start_ms >= S.max_ms) { segs.push(w); w = null; }
      if (!w) w = { start_ms: f.t_ms, end_ms: f.t_ms, cues: [], _c: new Set() };
      w.end_ms = f.t_ms;
    }
    if (w) segs.push(w);
    for (let i = 0; i < segs.length; i++) segs[i].end_ms = i + 1 < segs.length ? segs[i + 1].start_ms : Math.max(segs[i].end_ms, Math.round(video.duration_s * 1000));
  }
  // frames ⇒ segment whose [start, next start) contains them (first segment also owns earlier frames)
  const out = segs.map((s, i) => ({ s, lo: i === 0 ? -Infinity : s.start_ms, hi: i + 1 < segs.length ? segs[i + 1].start_ms : Infinity, frames: [] }));
  for (const f of frames) { const o = out.find((x) => f.t_ms >= x.lo && f.t_ms < x.hi); if (o) o.frames.push(f); }
  return out.map(({ s, frames: fr }, i) => {
    const transcript = s.cues.map((c) => c.text).join(' ');
    const ocr = fr.filter((f) => f.ocr).map((f) => ({ frame_ref: f.ref, t_ms: f.t_ms, text: f.ocr }));
    const concepts = detectConcepts([transcript, ...ocr.map((o) => o.text)].join('\n'), matchers);
    const counts = {}; for (const c of concepts) counts[c.concept] = (counts[c.concept] || 0) + 1;
    const topic = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || (transcript ? 'UNSPECIFIED' : 'VISUAL_ONLY');
    const vendors = vendorsIn([transcript, ...ocr.map((o) => o.text)].join('\n'), cfg);
    return {
      segment_id: `${video.video_id}_s${String(i + 1).padStart(4, '0')}`, video_id: video.video_id, start_ms: s.start_ms, end_ms: s.end_ms,
      transcript, transcript_source: video.transcription_method, cues: s.cues, ocr, frame_refs: fr.map((f) => f.ref), speaker: null, topic,
      api_candidate: vendors.length === 1 ? vendors[0] : vendors.length > 1 ? 'cross_api' : 'unknown',
      concept_candidates: Object.keys(counts), confidence: s.cues.length ? 0.5 : 0.3, review_status: 'PENDING_REVIEW',
    };
  });
}

// ---- attribution ----
export function vendorsIn(text, cfg) {
  const t = fold(text);
  return APIS.filter((api) => (cfg.apis[api]?.vendor_patterns || []).some((p) => wordRe(p).test(t)));
}
// Segment-level attribution only counts vendors named in speech: a vendor seen only on screen (logo/watermark/slide) is
// branding, not a statement that the concept belongs to that API.
export function attribute(sentence, segmentText, concept, cfg, segmentSpeech = segmentText) {
  const s = vendorsIn(sentence, cfg), g = vendorsIn(segmentSpeech, cfg), onScreen = vendorsIn(segmentText, cfg);
  if (s.length > 1) return { api: 'cross_api', attribution: 'CROSS_API', basis: 'SOURCE_VIDEO: several vendors named in the same sentence', vendors: s };
  if (s.length === 1) return { api: s[0], attribution: 'API_CONFIRMED', basis: 'SOURCE_VIDEO: vendor named in the same sentence', vendors: s };
  if (g.length > 1) return { api: 'cross_api', attribution: 'CROSS_API', basis: 'SOURCE_VIDEO: several vendors named in the segment', vendors: g };
  if (g.length === 1) return { api: g[0], attribution: 'API_PROBABLE', basis: 'SOURCE_VIDEO: vendor named in the segment, not in the sentence', vendors: g };
  const hint = cfg.concept_hints?.[concept];
  if (hint) return { api: hint.api, attribution: 'API_PROBABLE', basis: `SOURCE_INFERENCE: ${hint.basis}`, vendors: [] };
  if (onScreen.length) return { api: 'unknown', attribution: 'API_UNKNOWN', basis: 'SOURCE_VIDEO: vendor only visible on screen in the segment (branding), not stated', vendors: onScreen };
  return { api: 'unknown', attribution: 'API_UNKNOWN', basis: 'no vendor/API named', vendors: [] };
}

// ---- classification ----
const RX = {
  opinion: /\b(i think|i believe|in my opinion|i feel|my view|eu acho|na minha opiniao|acredito que|me parece|pessoalmente)\b/,
  example: /\b(for example|for instance|e\.g\.|por exemplo|como exemplo|um exemplo|an example|example)\b/,
  procedure: /\b(first|then|next|step|primeiro|depois|em seguida|passo|clique|click|abra|open the)\b/,
  formula: /(=|\bequals\b|\bigual a\b|\bsum of\b|\bsoma d|\bmultiplied\b|\bmultiplicad|\bdividid|\bdivided\b|\bvezes\b|\btimes the\b)/,
  rule: /\b(if|when|whenever|se|quando|sempre que)\b.{3,}?(\bthen\b|\bentao\b|,)/,
  trade: /\b(bullish|bearish|buy|sell|buying|selling|compra|venda|comprar|vender|compradora|vendedora|long|short|entrada|stop|alvo|target|alta|baixa)\b/,
  field: /\b(field|endpoint|column|campo|coluna|api|json|valor do|value of)\b/,
  number: /\d/, unit: /(%|\bpoints?\b|\bpontos?\b|\bbillion|\bbilh|\bmillion|\bmilh|\$|\bdollars?\b|\bdolares\b|\bcontracts?\b|\bcontratos?\b|\bstrike)/,
};
export function evidenceTypeOf(sentence, concept, source) {
  if (source === 'ocr') return 'VISUAL_DEMONSTRATION';
  const t = fold(sentence);
  if (RX.opinion.test(t)) return 'OPINION';
  if (RX.example.test(t)) return 'EXAMPLE';
  const c = esc(fold(concept)).replace(/\s+/g, '\\s+');
  if (new RegExp(`(${c}[^.]{0,30}\\b(is|are|means|refers to|e|sao|significa|representa|se refere)\\b)|((what is|o que e|o que sao)\\b[^.]{0,20}${c})`).test(t)) return 'DEFINITION';
  if (RX.procedure.test(t)) return 'PROCEDURE';
  return 'EXPLICIT_STATEMENT';
}
export function knowledgeClassOf(sentence, evidenceType, attribution) {
  const t = fold(sentence);
  if (evidenceType === 'OPINION') return 'OPINION';
  if (evidenceType === 'EXAMPLE') return 'EXAMPLE';
  if (RX.formula.test(t)) return 'FORMULA';
  if (evidenceType === 'DEFINITION') return attribution === 'API_CONFIRMED' && RX.field.test(t) ? 'API_FIELD_MEANING' : 'DEFINITION';
  if (RX.rule.test(t)) return 'RULE';
  if (RX.trade.test(t)) return 'TRADING_INTERPRETATION';
  return 'HEURISTIC';
}
const BASE_CONF = { DEFINITION: 0.7, EXPLICIT_STATEMENT: 0.6, EXAMPLE: 0.55, PROCEDURE: 0.5, VISUAL_DEMONSTRATION: 0.5, OPINION: 0.3, INFERENCE: 0.2 };
export function confidenceOf(evidenceType, source, flags, cfg) {
  let c = BASE_CONF[evidenceType] ?? 0.3;
  if (source === 'stt') c = Math.min(c * 0.85, cfg.extraction.confidence_cap_stt);
  if (source === 'ocr') c = Math.min(c, cfg.extraction.confidence_cap_ocr);
  if (flags.length) c *= 0.5;
  return Math.round(c * 100) / 100;
}
export const splitSentences = (t) => String(t).split(/(?<=[.!?;])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean);

// ---- extraction: one item per (sentence|ocr line, concept) — only what the material says ----
export function extractItems(video, seg, cfg, matchers) {
  const items = [], unknown = [];
  const segText = [seg.transcript, ...seg.ocr.map((o) => o.text)].join('\n');
  const units = [];
  for (const c of seg.cues) for (const s of splitSentences(c.text)) units.push({ text: s, raw: c.raw || null, start_ms: c.start_ms, end_ms: c.end_ms, source: seg.transcript_source === 'captions' ? 'captions' : 'stt', frame_refs: nearFrames(seg, c.start_ms, c.end_ms) });
  for (const o of seg.ocr) for (const line of o.text.split('\n')) units.push({ text: line, start_ms: o.t_ms, end_ms: o.t_ms, source: 'ocr', frame_refs: [o.frame_ref] });
  for (const u of units) {
    const flags = untrustedFlags(u.text, cfg);
    for (const term of unknownTerms(u.text, matchers)) unknown.push({ term, context: defang(u.text).slice(0, 200), video_id: video.video_id, segment_id: seg.segment_id, start_ms: u.start_ms, end_ms: u.end_ms, source: u.source });
    const seen = new Set();
    for (const { concept, surface } of detectConcepts(u.text, matchers)) {
      if (seen.has(concept)) continue; seen.add(concept);
      const a = attribute(u.text, segText, concept, cfg, seg.transcript);
      // A vendor name produced only by the STT correction layer is not a confirmation.
      if (a.attribution === 'API_CONFIRMED' && u.raw && !vendorsIn(u.raw, cfg).includes(a.api)) Object.assign(a, { attribution: 'API_PROBABLE', basis: 'SOURCE_INFERENCE: vendor name restored by STT correction, not in raw transcript' });
      const evidence_type = evidenceTypeOf(u.text, surface, u.source);
      const knowledge_class = knowledgeClassOf(u.text, evidence_type, a.attribution);
      const quote = defang(u.text).slice(0, cfg.extraction.statement_max_chars);
      const unknowns = [];
      if (a.attribution !== 'API_CONFIRMED') unknowns.push('api_not_stated');
      if (RX.number.test(u.text) && !RX.unit.test(fold(u.text))) unknowns.push('unit_not_stated');
      if (u.source !== 'captions') unknowns.push(u.source === 'ocr' ? 'ocr_text_unverified' : 'stt_text_unverified');
      const quarantined = flags.length > 0;
      items.push({
        schema: SCHEMA, id: `vk_${sha16([video.video_id, seg.segment_id, u.start_ms, concept, u.text].join('|'))}`,
        video_id: video.video_id, segment_id: seg.segment_id, start_ms: u.start_ms, end_ms: u.end_ms,
        api: a.api, attribution: a.attribution, attribution_basis: a.basis,
        concept, surface, statement: quote,
        evidence: { transcript_quote_or_paraphrase: quote, quote_kind: u.raw ? 'STT_NORMALIZED' : 'VERBATIM', ...(u.raw ? { raw_cue_text: defang(u.raw).slice(0, 400) } : {}), frame_refs: u.frame_refs, timestamps: [{ start_ms: u.start_ms, end_ms: u.end_ms, start: fmtTs(u.start_ms), end: fmtTs(u.end_ms) }], text_source: u.source },
        evidence_type, knowledge_class, confidence: confidenceOf(evidence_type, u.source, flags, cfg), uncalibrated: true,
        contradictions: [], unknowns, tags: [...new Set([fold(concept).replace(/\s+/g, '_'), u.source, ...flags.map((f) => `untrusted:${f}`)])],
        source_kind: 'SOURCE_VIDEO', untrusted_flags: flags, review_status: quarantined ? 'QUARANTINED' : 'PENDING_REVIEW',
        deterministic_rule: false,
      });
    }
  }
  return { items, unknown };
}
function nearFrames(seg, a, b) {
  const refs = seg.ocr.length || seg.frame_refs.length ? seg.frame_refs : [];
  const ts = (r) => Number((r.match(/@(\d+)ms/) || [])[1]);
  const near = refs.filter((r) => { const t = ts(r); return Number.isFinite(t) && t >= a - 2000 && t <= b + 2000; });
  return near.length ? near : refs.slice(0, 1);
}

// ---- quality gate (§23): no claim without provenance ----
export function validateItem(it, ctx) {
  const e = [];
  if (it.schema !== SCHEMA) e.push('schema');
  const v = ctx.videos.get(it.video_id); if (!v) e.push('source_missing');
  const s = ctx.segments.get(it.segment_id); if (!s || s.video_id !== it.video_id) e.push('segment_missing');
  if (!Number.isInteger(it.start_ms) || !Number.isInteger(it.end_ms) || it.start_ms < 0 || it.end_ms < it.start_ms) e.push('timestamp_invalid');
  else if (v && v.duration_s > 0 && it.end_ms > v.duration_s * 1000 + 1000) e.push('timestamp_out_of_video');
  if (!it.evidence || !String(it.evidence.transcript_quote_or_paraphrase || '').trim() || !Array.isArray(it.evidence.timestamps) || !it.evidence.timestamps.length) e.push('evidence_empty');
  if (!Array.isArray(it.evidence?.frame_refs)) e.push('frame_refs_invalid');
  else if (ctx.frameExists) for (const r of it.evidence.frame_refs) if (!ctx.frameExists(r)) e.push(`frame_missing:${r}`);
  if (it.evidence?.text_source === 'ocr' && !(it.evidence.frame_refs || []).length) e.push('visual_without_frame');
  if (!API_VALUES.includes(it.api)) e.push('api_invalid');
  if (!ATTRIBUTION.includes(it.attribution)) e.push('attribution_invalid');
  if (it.attribution === 'API_CONFIRMED' && !APIS.includes(it.api)) e.push('attribution_api_mismatch');
  if (typeof it.confidence !== 'number' || !(it.confidence >= 0 && it.confidence <= 1)) e.push('confidence_invalid');
  if (!EVIDENCE_TYPES.includes(it.evidence_type)) e.push('evidence_type_invalid');
  if (!KNOWLEDGE_CLASSES.includes(it.knowledge_class)) e.push('knowledge_class_invalid');
  if (!SOURCE_KINDS.includes(it.source_kind)) e.push('source_kind_invalid');
  if (!it.concept || !it.statement) e.push('concept_or_statement_missing');
  return e;
}

// ---- contradictions (§12): opposite polarity on the same concept across different videos; never resolved here ----
export function findContradictions(items, cfg, sourceOf) {
  const out = [], by = new Map();
  // Only spoken claims (OCR slide fragments are not claims); quarantined/superseded/direction words never take part.
  for (const it of items) { if (it.review_status === 'QUARANTINED' || it.superseded || DIRECTION_CONCEPTS.has(it.concept) || it.evidence?.text_source === 'ocr') continue; (by.get(it.concept) || by.set(it.concept, []).get(it.concept)).push(it); }
  // A polarity word glued to the concept ("positive gamma", "gamma negative") names a regime; it is not a predicate.
  const poles = [...new Set(cfg.polarity_pairs.flat())].map((w) => esc(fold(w))).join('|');
  const unglue = (f, concept) => (cfg.concepts[concept] || [concept]).reduce((x, syn) => { const s = esc(fold(syn)).replace(/\s+/g, '\\s+'); return x.replace(new RegExp(`(?<![a-z0-9])(?:(?:${poles})\\s+${s}|${s}\\s+(?:${poles}))(?![a-z0-9])`, 'g'), ' '); }, f);
  const pol = (t, concept) => { const f = unglue(fold(t), concept); return cfg.polarity_pairs.map(([p, n]) => (wordRe(p).test(f) ? 1 : 0) - (wordRe(n).test(f) ? 1 : 0)); };
  for (const [concept, list] of by) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (sourceOf(a.video_id) === sourceOf(b.video_id)) continue;
      const pa = pol(a.statement, concept), pb = pol(b.statement, concept);
      const k = pa.findIndex((x, q) => x !== 0 && pb[q] === -x); if (k < 0) continue;
      const ev = (x) => ({ item_id: x.id, video_id: x.video_id, segment_id: x.segment_id, start_ms: x.start_ms, end_ms: x.end_ms, quote: x.statement, frame_refs: x.evidence.frame_refs });
      out.push({ contradiction_id: `vc_${sha16([concept, a.id, b.id].sort().join('|'))}`, concept, axis: cfg.polarity_pairs[k].join('/'), claim_a: a.statement, evidence_a: ev(a), claim_b: b.statement, evidence_b: ev(b), status: 'UNRESOLVED', resolution: null });
    }
  }
  return out;
}

// ---- retrieval: BM25 over statement + concept + glossary synonyms; returns small cited evidence only ----
const STOP = new Set('a o os as de da do das dos e em no na nos nas um uma uns umas que para por com sem se como qual quais onde o que the of and or to in on at is are be for with what which where how does do did video videos material explica explain explains sobre dizem say says deve ser interpretado interpreted existem exist there any me about'.split(' '));
export const tokens = (t) => fold(t).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
export function buildInverted(items, cfg) {
  const docs = {}, df = {}; let total = 0;
  for (const it of items) {
    const syn = cfg.concepts[it.concept] || [];
    const tf = {}; for (const w of [...tokens(it.statement), ...tokens(it.concept), ...syn.flatMap(tokens)]) tf[w] = (tf[w] || 0) + 1;
    const len = Object.values(tf).reduce((a, b) => a + b, 0); total += len; docs[it.id] = { tf, len };
    for (const w of Object.keys(tf)) df[w] = (df[w] || 0) + 1;
  }
  return { schema: 'alpha-video-inverted/v1', n: items.length, avgdl: items.length ? total / items.length : 0, df, docs };
}
export function search(query, { inv, items, cfg, matchers, api = null, k = 5, includeQuarantined = false }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const qConcepts = detectConcepts(query, matchers).map((c) => c.concept);
  const q = [...new Set([...tokens(query), ...qConcepts.flatMap((c) => tokens(c))])];
  const fq = fold(query), wantExample = /exemplo|example/.test(fq), wantDef = /explica|explain|o que e|what is|defin|interpret|significa|means/.test(fq);
  const k1 = 1.2, b = 0.75, scored = [];
  for (const [id, d] of Object.entries(inv.docs)) {
    const it = byId.get(id); if (!it || it.superseded) continue;
    if (!includeQuarantined && it.review_status === 'QUARANTINED') continue;
    if (api && it.api !== api) continue;
    let s = 0;
    for (const w of q) { const f = d.tf[w]; if (!f) continue; const idf = Math.log(1 + (inv.n - (inv.df[w] || 0) + 0.5) / ((inv.df[w] || 0) + 0.5)); s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (inv.avgdl || 1))); }
    if (!s) continue;
    if (qConcepts.includes(it.concept)) s *= 1.5;
    if (wantExample && it.evidence_type === 'EXAMPLE') s *= 1.4;
    if (wantDef && (it.evidence_type === 'DEFINITION' || it.knowledge_class === 'TRADING_INTERPRETATION')) s *= 1.3;
    scored.push([s, it]);
  }
  return { query, concepts: qConcepts, results: scored.sort((a, b2) => b2[0] - a[0]).slice(0, k).map(([score, it]) => ({ score: Math.round(score * 1000) / 1000, item: it })) };
}
