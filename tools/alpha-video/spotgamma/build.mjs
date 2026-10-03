#!/usr/bin/env node
// SpotGamma course corpus build — raw capture ⇒ inventory, sources, transcripts, segments, OCR, knowledge items, contradictions,
// concepts, indexes, audit (JEV req_01a103d036a5770f986230e2e6ead2ff). Pure transformation of local files: no network, no
// browser, nothing from the course is executed or followed (UNTRUSTED_EVIDENCE). The MenthorQ corpus (knowledge/video/) is never read
// for writing. Every inventory entry ends with a terminal status (0 silent failures).
//   node tools/alpha-video/spotgamma/build.mjs [--corpus <dir>] [--no-ocr]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './lib.mjs';
import { ocrFrame, ocrStatus } from '../ocr.mjs';

const L = S.L;
const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');
const PROMO = /\b(subscribe|upgrade (to|your)|discount|coupon|promo code|free trial|limited time|sign up (now|today)|join (us|our) (on )?discord|typeform|leave (us )?(your )?feedback|rate this (lesson|course)|share your feedback)\b/;
const NAV = /^(previous|next|mark complete|start quiz|back to course|complete lesson|lesson \d+|module \d+)$/i;

export function lessonType(p) { return p.youtube_ids?.length ? 'VIDEO' : /^mission\b/i.test(p.title || '') ? 'MISSION' : 'TEXT'; }

// OCR lines from a YouTube frame: keep lines that read as words (UI chrome / noise dropped, counted).
export function ocrLines(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter((l) => {
    const words = l.match(/[A-Za-z]{3,}/g) || []; const alpha = (l.match(/[A-Za-z]/g) || []).length;
    return words.length >= 2 && alpha / Math.max(1, l.replace(/\s/g, '').length) >= 0.6 && !/youtube|watch later|copy link|more videos|tap to unmute/i.test(l);
  });
}

// ASR cues grouped into ~word-bounded windows (ASR has no punctuation ⇒ sentence split is meaningless).
export function cueWindows(cues, words = 28) {
  const out = []; let cur = null;
  for (const [i, c] of cues.entries()) { if (!cur) cur = { start_ms: c.start_ms, end_ms: c.end_ms, text: '', idx: [] }; cur.text += (cur.text ? ' ' : '') + c.text; cur.end_ms = c.end_ms; cur.idx.push(i);
    if (cur.text.split(/\s+/).length >= words) { out.push(cur); cur = null; } }
  if (cur) out.push(cur);
  return out;
}

export async function build({ root, noOcr = false, log = () => {} } = {}) {
  const cfg = S.loadSgConfig(); S.setProducts(cfg);
  const raw = path.join(root, 'raw'), now = L.nowIso();
  const P = { sources: path.join(root, 'sources'), transcripts: path.join(root, 'transcripts'), segments: path.join(root, 'segments'), frames: path.join(root, 'frames'),
    evidence: path.join(root, 'evidence'), lessons: path.join(root, 'evidence', 'lessons'), concepts: path.join(root, 'concepts'), indexes: path.join(root, 'indexes') };
  for (const d of Object.values(P)) fs.mkdirSync(d, { recursive: true });
  const structure = L.readJson(path.join(raw, 'structure.json')); if (!structure) throw new Error('RAW_STRUCTURE_MISSING');
  const matchers = L.conceptMatchers(cfg);
  const prev = new Map(); for (const f of fs.readdirSync(P.lessons).filter((x) => x.endsWith('.items.json'))) for (const it of L.readJson(path.join(P.lessons, f))?.items || []) prev.set(it.knowledge_id, it.created_at);
  const ocrOk = !noOcr && cfg.ocr.enabled && ocrStatus(cfg.ocr.bin).available;

  // ---- inventory ----
  const lessons = [], videos = new Map(), failures = [];
  for (const m of structure.modules) for (const l of m.lessons) {
    const page = L.readJson(path.join(raw, 'pages', `${l.wp_id}.json`));
    if (!page) { lessons.push({ lesson_id: l.wp_id, module: m.module, module_index: m.module_index, lesson_index: l.lesson_index, title: l.title, url: l.url, access_status: 'NOT_CAPTURED', processing_status: 'FAILED', failure: 'PAGE_NOT_CAPTURED' }); failures.push({ lesson_id: l.wp_id, failure: 'PAGE_NOT_CAPTURED' }); continue; }
    const type = lessonType(page), split = S.splitPageText(page.text);
    const vids = (page.youtube_ids || []).map((y) => {
      const cap = L.readJson(path.join(raw, 'captions', `${y}.json`)), failed = L.readJson(path.join(raw, 'captions', `${y}.failed.json`)), fr = L.readJson(path.join(raw, 'frames', y, 'index.json'));
      const v = { video_id: y, provider: 'youtube', duration_s: cap?.duration_s ?? null, title: cap?.title ?? null, caption_track: cap?.track ?? null, caption_events: cap?.events?.length ?? 0, frames: fr?.frames?.length ?? 0, capture_status: cap ? (cap.events?.length ? 'CAPTIONS_CAPTURED' : 'NO_CAPTION_TRACK') : failed ? 'CAPTURE_FAILED' : 'NOT_CAPTURED', capture_error: failed?.error || null };
      if (!videos.has(y)) videos.set(y, { ...v, lessons: [l.wp_id], _cap: cap, _frames: fr?.frames || [] }); else videos.get(y).lessons.push(l.wp_id);
      return v;
    });
    const links = (page.links || []).map((x) => ({ text: x.text, href: L.defang(x.href), kind: /support\.spotgamma\.com/.test(x.href) ? 'SUPPORT_DOC' : /spotcloud\.online/.test(x.href) ? 'PLATFORM_LINK' : 'EXTERNAL' }));
    lessons.push({ lesson_id: l.wp_id, module: m.module, module_index: m.module_index, lesson_index: l.lesson_index, title: l.title, url: l.url, type, access_status: page.access_status,
      video_provider: vids.length ? 'youtube' : null, videos: vids, duration_s: vids.reduce((a, v) => a + (v.duration_s || 0), 0) || null,
      has_first_party_transcript: !!split.transcript, body_chars: split.body.length, transcript_chars: split.transcript.length,
      resource_links: links, files: (page.files || []).map((f) => ({ text: f.text, href: L.defang(f.href) })), images: page.images || [], tables: (page.tables || []).length,
      other_embeds: (page.other_embeds || []).map((u) => ({ host: (u.match(/^https?:\/\/([^/]+)/) || [])[1] || null, kind: /typeform/.test(u) ? 'FEEDBACK_FORM' : 'OTHER' })), _page: page, _split: split });
  }
  const quizzes = structure.quizzes.map((q) => {
    const slug = q.url.split('/quizzes/')[1].replace(/\/$/, ''), d = L.readJson(path.join(raw, 'quizzes', `${slug}.json`));
    const questions = d ? (d.text.match(/(^|\n)\s*(?:Question\s*\d+|\d+\.)[^\n]{5,}/g) || []).length : 0;
    return { slug, title: q.title, url: q.url, module: d?.module || null, access_status: d ? d.access_status : 'NOT_CAPTURED', interaction: 'NONE', answer_key: 'NOT_REVEALED', question_markers: questions, processing_status: d ? 'INVENTORIED_NO_CLAIMS' : 'FAILED' };
  });
  for (const q of quizzes) if (q.processing_status === 'FAILED') failures.push({ quiz: q.slug, failure: 'QUIZ_NOT_CAPTURED' });

  // ---- per video: cues, OCR, segments ----
  const ocrCache = L.readJson(path.join(P.frames, 'ocr-cache.json'), {}); let ocrRuns = 0, ocrLinesKept = 0, ocrLinesDropped = 0;
  for (const [y, v] of videos) {
    const cues = S.eventsToCues(v._cap?.events || []); v._cues = cues;
    const frames = [];
    for (const f of v._frames) {
      const abs = path.join(raw, f.ref.replace(/^raw\//, ''));
      if (!fs.existsSync(abs)) { failures.push({ video_id: y, failure: `FRAME_FILE_MISSING ${f.ref}` }); continue; }
      let text = ocrCache[f.ref];
      if (text == null && ocrOk) { const r = await ocrFrame(abs, { bin: cfg.ocr.bin, lang: cfg.ocr.lang }); ocrRuns++; text = r.error ? '' : r.text; if (r.error) failures.push({ video_id: y, failure: `OCR_ERROR ${f.ref} ${r.error}`, non_fatal: true }); ocrCache[f.ref] = text; }
      const kept = ocrLines(text || ''); ocrLinesKept += kept.length; ocrLinesDropped += String(text || '').split('\n').filter(Boolean).length - kept.length;
      frames.push({ ref: f.ref, t_ms: f.t_ms, ocr: kept.join('\n') });
    }
    v._framesOcr = frames;
    const segs = L.segmentize({ video_id: y, duration_s: v.duration_s || 0, transcription_method: v.caption_track?.kind === 'asr' ? 'captions_asr' : 'captions' }, cues, frames, cfg, matchers);
    v._segments = segs;
    L.writeJson(path.join(P.transcripts, `${y}.json`), { video_id: y, content_trust: 'UNTRUSTED_EVIDENCE', local_only: true, track: v.caption_track, cues });
    L.writeJson(path.join(P.segments, `${y}.json`), { video_id: y, content_trust: 'UNTRUSTED_EVIDENCE', local_only: true, segments: segs });
    log(`video ${y} cues=${cues.length} frames=${frames.length} segs=${segs.length}`);
  }
  L.writeJson(path.join(P.frames, 'ocr-cache.json'), ocrCache);

  // ---- units ⇒ items ----
  const items = [], rejected = [], lexicon = new Map(), unknown = new Map(); let boiler = new Map();
  for (const l of lessons.filter((x) => x._page)) for (const s of S.sentences(l._split.body)) boiler.set(L.fold(s), (boiler.get(L.fold(s)) || 0) + 1);
  const ctxItem = { cfg, matchers, createdAt: now };
  const lessonCtx = (l) => ({ lesson_id: l.lesson_id, module: l.module, module_index: l.module_index, title: l.title, url: l.url, type: l.type });
  for (const l of lessons) {
    if (!l._page) continue;
    const srcFile = path.join(P.sources, `${l.lesson_id}.json`);
    const tSents = S.sentences(l._split.transcript), bSents = S.sentences(l._split.body);
    L.writeJson(srcFile, { lesson_id: l.lesson_id, title: l.title, url: l.url, content_trust: 'UNTRUSTED_EVIDENCE', local_only: true, body: bSents, transcript: tSents });
    const units = [], v = l.videos[0] ? videos.get(l.videos[0].video_id) : null;
    // 1) first-party transcript, aligned to the ASR cues of the lesson video
    const aligned = v && v._cues.length ? S.alignSentences(tSents, v._cues, cfg.extraction.align_min_score) : tSents.map((t) => ({ text: t, start_ms: null, end_ms: null, score: 0, cues: null }));
    const covered = new Set();
    aligned.forEach((a, i) => {
      if (a.cues) { for (let k = a.cues[0]; k <= a.cues[1]; k++) covered.add(k);
        const heard = v._cues.slice(a.cues[0], a.cues[1] + 1).map((c) => c.text).join(' ');
        for (const p of L.correctionPairs(heard, a.text)) { if (!L.detectConcepts(p.corrected, matchers).length || p.heard.split(' ').length > 6) continue;
          const key = `${L.fold(p.heard)}=>${p.corrected}`; const e = lexicon.get(key) || { heard: p.heard, expected: p.corrected, concepts: [...new Set(L.detectConcepts(p.corrected, matchers).map((c) => c.concept))], count: 0, evidence: [] };
          e.count++; if (e.evidence.length < 5) e.evidence.push({ video_id: v.video_id, lesson_id: l.lesson_id, timestamp: `${L.fmtTs(a.start_ms)}–${L.fmtTs(a.end_ms)}` }); lexicon.set(key, e); } }
      units.push({ text: a.text, source: 'page_transcript', start_ms: a.start_ms, end_ms: a.end_ms, video_id: v?.video_id || null, lesson: lessonCtx(l), pointer: `sources/${l.lesson_id}.json#transcript[${i}]`, align_score: a.score,
        frame_refs: v && a.start_ms != null ? v._framesOcr.filter((f) => f.t_ms >= a.start_ms - 2000 && f.t_ms <= a.end_ms + 2000).map((f) => f.ref) : [] });
    });
    // 2) ASR narration not covered by a first-party transcript (videos without the page transcript)
    if (v && v._cues.length && !tSents.length) cueWindows(v._cues).forEach((w, i) => units.push({ text: w.text, source: v.caption_track?.kind === 'asr' ? 'captions_asr' : 'captions_manual', start_ms: w.start_ms, end_ms: w.end_ms, video_id: v.video_id, lesson: lessonCtx(l),
      pointer: `transcripts/${v.video_id}.json#cues[${w.idx[0]}]`, frame_refs: v._framesOcr.filter((f) => f.t_ms >= w.start_ms - 2000 && f.t_ms <= w.end_ms + 2000).map((f) => f.ref) }));
    l.asr_cues = v ? v._cues.length : 0; l.asr_cues_aligned = covered.size; l.transcript_sentences = tSents.length; l.transcript_aligned = aligned.filter((a) => a.cues).length;
    // 3) page body text (welcome / mission / tips / resources) — promo, navigation and cross-lesson boilerplate rejected with a reason
    bSents.forEach((t, i) => {
      const pointer = `sources/${l.lesson_id}.json#body[${i}]`;
      if (NAV.test(t)) return;
      if (PROMO.test(L.fold(t))) { rejected.push({ lesson_id: l.lesson_id, pointer, reason: 'PROMOTIONAL', text: L.defang(t).slice(0, 160) }); return; }
      if ((boiler.get(L.fold(t)) || 0) >= 5) { rejected.push({ lesson_id: l.lesson_id, pointer, reason: 'BOILERPLATE_REPEATED', text: L.defang(t).slice(0, 160) }); return; }
      units.push({ text: t, source: 'page_text', start_ms: null, end_ms: null, video_id: null, lesson: lessonCtx(l), pointer, frame_refs: [] });
    });
    // 4) on-screen text (visual evidence, low confidence)
    if (v) for (const f of v._framesOcr) for (const [k, line] of f.ocr.split('\n').filter(Boolean).entries())
      units.push({ text: line, source: 'ocr', start_ms: f.t_ms, end_ms: f.t_ms, video_id: v.video_id, lesson: lessonCtx(l), pointer: `frames/ocr-cache.json#${f.ref}[${k}]`, frame_refs: [f.ref] });
    for (const u of units) {
      for (const term of L.unknownTerms(u.text, matchers)) { if (u.source === 'ocr') continue; const e = unknown.get(term) || { term, count: 0, lessons: new Set() }; e.count++; e.lessons.add(l.lesson_id); unknown.set(term, e); }
      for (const it of S.itemsFromUnit(u, ctxItem)) { if (prev.has(it.knowledge_id)) it.created_at = prev.get(it.knowledge_id); items.push(it); }
    }
    l.units = units.length;
  }

  // ---- quality gate ----
  const durations = new Map([...videos].map(([y, v]) => [y, v.duration_s]));
  const ocrCacheKeys = new Set(Object.keys(ocrCache));
  const pointerExists = (p) => { const [file, frag] = p.split('#'); if (file === 'frames/ocr-cache.json') return ocrCacheKeys.has(frag.replace(/\[\d+\]$/, '')); return fs.existsSync(path.join(root, file)); };
  const kept = [];
  for (const it of items) { const e = S.validateSgItem(it, { cfg, durations, pointerExists }); if (e.length) rejected.push({ knowledge_id: it.knowledge_id, lesson_id: it.lesson_id, pointer: it.raw_evidence_pointer, reason: 'QUALITY_GATE', errors: e }); else kept.push(it); }
  const contradictions = S.contradictions(kept, cfg);
  const byItem = new Map(); for (const c of contradictions) for (const id of [c.evidence_a.knowledge_id, c.evidence_b.knowledge_id]) (byItem.get(id) || byItem.set(id, []).get(id)).push(c.contradiction_id);
  for (const it of kept) it.contradictions = byItem.get(it.knowledge_id) || [];

  // ---- write evidence ----
  for (const f of fs.readdirSync(P.lessons)) fs.unlinkSync(path.join(P.lessons, f));
  const byLesson = new Map(); for (const it of kept) (byLesson.get(it.lesson_id) || byLesson.set(it.lesson_id, []).get(it.lesson_id)).push(it);
  for (const [id, list] of byLesson) L.writeJson(path.join(P.lessons, `${id}.items.json`), { schema: S.SCHEMA, lesson_id: id, content_trust: 'UNTRUSTED_EVIDENCE', items: list });
  L.writeJson(path.join(P.evidence, 'rejected.json'), { schema: 'spotgamma-rejected/v1', rejected });
  L.writeJson(path.join(P.evidence, 'contradictions.json'), { schema: 'spotgamma-contradictions/v1', policy: 'NEVER_AUTO_RESOLVED; TRUE_CONTRADICTION never auto-assigned', contradictions });

  // ---- concepts ----
  const catalog = {};
  for (const it of kept) {
    const c = catalog[it.normalized_concept] ||= { concept: it.normalized_concept, term_class: it.term_class, term_class_basis: cfg.term_class_basis[it.term_class] || null, items: 0, quarantined: 0, lessons: new Set(), modules: new Set(), api_attribution: {}, claim_types: {}, api_field: cfg.api_field_map[it.normalized_concept]?.field || null, api_absent_note: cfg.api_absent_notes?.[it.normalized_concept] || null, top_definitions: [] };
    c.items++; if (it.review_status === 'QUARANTINED') c.quarantined++; c.lessons.add(it.lesson_id); c.modules.add(it.module);
    c.api_attribution[it.api_attribution] = (c.api_attribution[it.api_attribution] || 0) + 1; c.claim_types[it.claim_type] = (c.claim_types[it.claim_type] || 0) + 1;
  }
  const rank = (it) => (it.claim_type === 'DEFINITION' ? 2 : it.claim_type === 'LEVEL_INTERPRETATION' || it.claim_type === 'API_FIELD' ? 1.5 : 0) + it.confidence + (it.text_source === 'page_transcript' ? 0.3 : 0);
  for (const c of Object.values(catalog)) {
    c.top_definitions = kept.filter((it) => it.normalized_concept === c.concept && it.review_status !== 'QUARANTINED' && it.text_source !== 'ocr').sort((a, b) => rank(b) - rank(a)).slice(0, 4)
      .map((it) => ({ knowledge_id: it.knowledge_id, statement: it.statement, claim_type: it.claim_type, lesson: it.lesson, timestamp: it.timestamp, confidence: it.confidence }));
    c.lessons = [...c.lessons].sort(); c.modules = [...c.modules]; c.dominant_api_attribution = Object.entries(c.api_attribution).sort((a, b) => b[1] - a[1])[0][0];
  }
  const glossaryNotTaught = Object.keys(cfg.concepts).filter((k) => !catalog[k]);
  L.writeJson(path.join(P.concepts, 'catalog.json'), { schema: 'spotgamma-concepts/v1', source: S.SOURCE, concepts: Object.values(catalog).sort((a, b) => b.items - a.items), glossary_concepts_not_found_in_course: glossaryNotTaught });
  L.writeJson(path.join(P.concepts, 'term-classes.json'), { schema: 'spotgamma-term-classes/v1', basis: cfg.term_class_basis, classes: Object.fromEntries(S.TERM_CLASSES.map((k) => [k, Object.values(catalog).filter((c) => c.term_class === k).map((c) => c.concept)])) });
  L.writeJson(path.join(P.concepts, 'jarvis-lexicon-candidates.json'), { schema: 'spotgamma-jarvis-lexicon/v1', status: 'CANDIDATES_ONLY', policy: 'evidence = YouTube ASR vs first-party transcript of the same sentence; tools/jarvis untouched; applying requires its own approved flow + JEV',
    candidates: [...lexicon.values()].filter((e) => L.fold(e.heard) !== L.fold(e.expected)).sort((a, b) => b.count - a.count) });
  L.writeJson(path.join(P.concepts, 'unknown-terms.json'), { schema: 'spotgamma-unknown-terms/v1', note: 'acronyms/CamelCase not in the SpotGamma glossary (spoken/page text only)', terms: [...unknown.values()].map((e) => ({ term: e.term, count: e.count, lessons: [...e.lessons] })).sort((a, b) => b.count - a.count) });

  // ---- indexes ----
  const adapt = kept.map((it) => ({ id: it.knowledge_id, concept: it.normalized_concept, statement: it.statement, evidence_type: it.evidence_type, knowledge_class: it.claim_type, review_status: it.review_status }));
  L.writeJson(path.join(P.indexes, 'inverted.json'), L.buildInverted(adapt, cfg));
  const group = (key) => { const o = {}; for (const it of kept) (o[it[key]] ||= []).push(it.knowledge_id); return o; };
  L.writeJson(path.join(P.indexes, 'by-concept.json'), group('normalized_concept'));
  L.writeJson(path.join(P.indexes, 'by-api-attribution.json'), group('api_attribution'));
  L.writeJson(path.join(P.indexes, 'by-lesson.json'), group('lesson_id'));
  L.writeJson(path.join(P.indexes, 'by-claim-type.json'), group('claim_type'));

  // ---- inventory + manifest ----
  const strip = ({ _page, _split, ...x }) => x;
  const allVideos = [...videos.values()].map(({ _cap, _frames, _cues, _framesOcr, _segments, ...x }) => ({ ...x, cues: _cues.length, segments: _segments.length, frames_ocr_lines: _framesOcr.reduce((a, f) => a + (f.ocr ? f.ocr.split('\n').length : 0), 0) }));
  for (const v of allVideos) if (v.capture_status !== 'CAPTIONS_CAPTURED') failures.push({ video_id: v.video_id, failure: v.capture_status, error: v.capture_error });
  for (const l of lessons) if (l._page) {
    const vfail = l.videos.some((v) => videos.get(v.video_id)?.capture_status !== 'CAPTIONS_CAPTURED' && !l.has_first_party_transcript);
    l.items = byLesson.get(l.lesson_id)?.length || 0;
    l.processing_status = l.access_status !== 'ACCESSIBLE' ? 'FAILED' : vfail ? 'PARTIAL' : 'PROCESSED';
    l.processing_note = l.items ? null : 'no glossary concept stated on this page (processed; nothing to extract)';
    if (l.processing_status !== 'PROCESSED') failures.push({ lesson_id: l.lesson_id, failure: l.processing_status });
  }
  const files = lessons.flatMap((l) => l.files || []), links = lessons.flatMap((l) => l.resource_links || []);
  const inventory = { schema: 'spotgamma-course-inventory/v1', source: S.SOURCE, source_class: S.SOURCE_CLASS, knowledge_scope: S.SCOPE, content_trust: 'UNTRUSTED_EVIDENCE',
    course_title: cfg.course.title, course_url: cfg.course.url, captured_at: structure.captured_at, built_at: now,
    structure: structure.modules.map((m) => ({ module_index: m.module_index, module: m.module, lessons: m.lessons.length })),
    counts: { modules: structure.modules.length, lessons: lessons.length, video_lessons: lessons.filter((l) => l.type === 'VIDEO').length, text_lessons: lessons.filter((l) => l.type === 'TEXT').length, mission_lessons: lessons.filter((l) => l.type === 'MISSION').length,
      videos: videos.size, pdfs: files.filter((f) => /\.pdf/i.test(f.href)).length, downloads: files.length, slides: files.filter((f) => /\.pptx?/i.test(f.href)).length,
      images: lessons.reduce((a, l) => a + (l.images?.length || 0), 0), embeds: lessons.reduce((a, l) => a + (l.videos?.length || 0) + (l.other_embeds?.length || 0), 0), feedback_forms: lessons.reduce((a, l) => a + (l.other_embeds || []).filter((e) => e.kind === 'FEEDBACK_FORM').length, 0),
      quizzes: quizzes.length, resource_links: links.length, support_docs: links.filter((x) => x.kind === 'SUPPORT_DOC').length, platform_links: links.filter((x) => x.kind === 'PLATFORM_LINK').length, first_party_transcripts: lessons.filter((l) => l.has_first_party_transcript).length },
    lessons: lessons.map(strip), videos: allVideos, quizzes };
  L.writeJson(path.join(root, 'inventory.json'), inventory);
  L.writeJson(path.join(root, 'manifest.json'), { schema: 'spotgamma-course-manifest/v1', source: S.SOURCE, source_class: S.SOURCE_CLASS, knowledge_scope: S.SCOPE, content_trust: 'UNTRUSTED_EVIDENCE', item_schema: S.SCHEMA, jev_diff: cfg.jev_diff,
    course: cfg.course, built_at: now, local_only: ['raw/', 'sources/', 'transcripts/', 'segments/', 'frames/'], versioned: ['manifest.json', 'inventory.json', 'evidence/', 'concepts/', 'indexes/'],
    isolation: 'separate corpus from MenthorQ knowledge/video/; never merged automatically' });

  // ---- audit (§20) ----
  const n = (f) => kept.filter(f).length, fatal = failures.filter((f) => !f.non_fatal);
  const audit = { schema: 'spotgamma-course-audit/v1', at: now,
    COURSE_MODULES: structure.modules.length, LESSONS_TOTAL: lessons.length, LESSONS_PROCESSED: lessons.filter((l) => l.processing_status === 'PROCESSED').length,
    VIDEOS_TOTAL: videos.size, VIDEOS_PROCESSED: allVideos.filter((v) => v.capture_status === 'CAPTIONS_CAPTURED').length,
    VIDEO_HOURS: Math.round((allVideos.reduce((a, v) => a + (v.duration_s || 0), 0) / 3600) * 100) / 100,
    TRANSCRIPT_CUES: allVideos.reduce((a, v) => a + v.cues, 0), FIRST_PARTY_TRANSCRIPT_SENTENCES: lessons.reduce((a, l) => a + (l.transcript_sentences || 0), 0),
    TRANSCRIPT_SENTENCES_ALIGNED: lessons.reduce((a, l) => a + (l.transcript_aligned || 0), 0),
    SEGMENTS: allVideos.reduce((a, v) => a + v.segments, 0), FRAMES: allVideos.reduce((a, v) => a + v.frames, 0), OCR_RUNS_THIS_BUILD: ocrRuns, OCR_LINES_KEPT: ocrLinesKept, OCR_LINES_DROPPED_NOISE: ocrLinesDropped, OCR_AVAILABLE: ocrOk,
    KNOWLEDGE_ITEMS: kept.length, CONCEPTS: Object.keys(catalog).length,
    SPOTGAMMA_API_CONFIRMED: n((i) => i.api_attribution === 'SPOTGAMMA_API_CONFIRMED'), SPOTGAMMA_API_PROBABLE: n((i) => i.api_attribution === 'SPOTGAMMA_API_PROBABLE'),
    PLATFORM_ONLY: n((i) => i.api_attribution === 'SPOTGAMMA_PLATFORM_ONLY'), SPOTGAMMA_CONCEPTUAL: n((i) => i.api_attribution === 'SPOTGAMMA_CONCEPTUAL'),
    GENERAL_KNOWLEDGE: n((i) => i.api_attribution === 'GENERAL_MARKET_KNOWLEDGE'), UNKNOWN: n((i) => i.api_attribution === 'UNKNOWN'),
    CONTRADICTIONS: contradictions.length, CONTRADICTIONS_BY_CATEGORY: Object.fromEntries(S.CONTRA_CATS.map((k) => [k, contradictions.filter((c) => c.category === k).length])),
    REJECTED_ITEMS: rejected.length, REJECTED_BY_REASON: rejected.reduce((o, r) => ({ ...o, [r.reason]: (o[r.reason] || 0) + 1 }), {}),
    QUARANTINED_ITEMS: n((i) => i.review_status === 'QUARANTINED'), CLAIM_TYPES: Object.fromEntries(S.CLAIM_TYPES.map((k) => [k, n((i) => i.claim_type === k)])),
    TEXT_SOURCES: Object.fromEntries(S.TEXT_SOURCES.map((k) => [k, n((i) => i.text_source === k)])), QUIZZES: quizzes.length, QUIZZES_INVENTORIED: quizzes.filter((q) => q.processing_status === 'INVENTORIED_NO_CLAIMS').length,
    JARVIS_LEXICON_CANDIDATES: [...lexicon.values()].filter((e) => L.fold(e.heard) !== L.fold(e.expected)).length,
    FAILURES: failures, FATAL_FAILURES: fatal.length, SILENT_FAILURES: lessons.filter((l) => !['PROCESSED', 'PARTIAL', 'FAILED'].includes(l.processing_status)).length + quizzes.filter((q) => !['INVENTORIED_NO_CLAIMS', 'FAILED'].includes(q.processing_status)).length };
  audit.STATUS = audit.SILENT_FAILURES === 0 && audit.FATAL_FAILURES === 0 && audit.LESSONS_PROCESSED === audit.LESSONS_TOTAL && audit.VIDEOS_PROCESSED === audit.VIDEOS_TOTAL ? 'PASS' : 'FAIL';
  L.writeJson(path.join(P.indexes, 'audit.json'), audit);
  return audit;
}

export async function main(argv = process.argv.slice(2)) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const cfg = S.loadSgConfig(), root = path.resolve(arg('--corpus') || path.join(L.REPO, cfg.corpus_dir));
  const a = await build({ root, noOcr: argv.includes('--no-ocr'), log: argv.includes('--verbose') ? console.error : () => {} });
  const { FAILURES, ...summary } = a; console.log(JSON.stringify({ ...summary, FAILURES: FAILURES.slice(0, 20) }, null, 1));
  return a.STATUS === 'PASS' ? 0 : 1;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
