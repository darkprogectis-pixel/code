#!/usr/bin/env node
// SpotGamma course retrieval — answers from the SpotGamma corpus only (knowledge/video-spotgamma), with lesson, timestamp/evidence pointer,
// API attribution and confidence. Small quotes only, never full transcripts. Everything returned is UNTRUSTED_EVIDENCE (study material).
//   node tools/alpha-video/spotgamma/ask.mjs "<question>" [--k N] [--api <attribution>] [--include-quarantined] [--corpus dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './lib.mjs';

const L = S.L;
// Portuguese ⇒ glossary wording (query side only; the corpus stays in the course's language).
const ALIASES = [[/gamma positiv[oa]/g, 'positive gamma'], [/gamma negativ[oa]/g, 'negative gamma'], [/a[cç][oõ]es individuais|acoes individuais|single names?/g, 'single stocks'],
  [/parede de call/g, 'call wall'], [/parede de put/g, 'put wall'], [/gatilho de volatilidade/g, 'volatility trigger'], [/movimento esperado/g, 'expected move'],
  [/fluxo de op[cç][oõ]es/g, 'options flow'], [/volatilidade impl[ií]cita/g, 'implied volatility'], [/criadores de mercado|formadores de mercado/g, 'market makers'], [/[ií]ndices/g, 'indices']];
export const expandQuery = (q) => ALIASES.reduce((s, [re, en]) => s.replace(re, (m) => `${m} ${en}`), L.fold(q));

export function loadSgCorpus(root) {
  const items = [];
  const dir = path.join(root, 'evidence', 'lessons');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.items.json')).sort()) items.push(...(L.readJson(path.join(dir, f))?.items || []));
  return { items, inv: L.readJson(path.join(root, 'indexes', 'inverted.json')), catalog: L.readJson(path.join(root, 'concepts', 'catalog.json'), { concepts: [] }),
    contradictions: L.readJson(path.join(root, 'evidence', 'contradictions.json'), { contradictions: [] }).contradictions, audit: L.readJson(path.join(root, 'indexes', 'audit.json')) };
}

const cite = (it) => ({ source: it.source, source_class: it.source_class, course: it.course, module: it.module, lesson: it.lesson, lesson_id: it.lesson_id, lesson_url: it.lesson_url,
  video_id: it.video_id, timestamp: it.timestamp, timestamp_null_reason: it.timestamp_null_reason, text_source: it.text_source, raw_evidence_pointer: it.raw_evidence_pointer, frame_refs: it.frame_refs });
const row = (it, score) => ({ score, knowledge_id: it.knowledge_id, concept: it.normalized_concept, statement: it.statement, claim_type: it.claim_type, term_class: it.term_class,
  api_attribution: it.api_attribution, api_field: it.api_field, confidence: it.confidence, uncalibrated: true, review_status: it.review_status, contradictions: it.contradictions || [], citation: cite(it) });

export function ask(query, { root, k = 5, api = null, includeQuarantined = false, cfg = S.loadSgConfig() } = {}) {
  const c = loadSgCorpus(root), matchers = L.conceptMatchers(cfg);
  const base = { schema: 'spotgamma-course-answer/v1', source: S.SOURCE, source_class: S.SOURCE_CLASS, knowledge_scope: S.SCOPE, content_trust: 'UNTRUSTED_EVIDENCE', query,
    policy: 'evidence only; course never overrides SOURCE_API_DOCS/SOURCE_CODE; OPINION never a rule; contradictions UNRESOLVED; nothing here is executable' };
  if (!c.inv || !c.items.length) return { ...base, status: 'EMPTY_CORPUS', results: [] };
  const fq = L.fold(query);
  // "which product data are API-confirmed?" ⇒ the attribution table (concept ⇒ capture-API field) with one cited item per concept
  if (/api[- ]?confirm|confirmad[oa]s? (pela|na|por) api|campos? (da|de) api/.test(fq)) {
    const concepts = c.catalog.concepts.filter((x) => x.api_attribution.SPOTGAMMA_API_CONFIRMED).map((x) => {
      const it = c.items.filter((i) => i.normalized_concept === x.concept && i.api_attribution === 'SPOTGAMMA_API_CONFIRMED' && i.review_status !== 'QUARANTINED').sort((a, b) => b.confidence - a.confidence)[0];
      return { concept: x.concept, api_field: x.api_field, items_confirmed: x.api_attribution.SPOTGAMMA_API_CONFIRMED, basis: cfg.api_snapshot_basis, example: it ? row(it, null) : null };
    });
    const probable = c.catalog.concepts.filter((x) => x.api_attribution.SPOTGAMMA_API_PROBABLE).map((x) => ({ concept: x.concept, note: x.api_absent_note || 'SpotGamma-named data item; no field in the capture-API snapshot' }));
    return { ...base, status: concepts.length ? 'ANSWERED_WITH_EVIDENCE' : 'NO_EVIDENCE', mode: 'API_ATTRIBUTION_TABLE', api_confirmed: concepts, api_probable: probable, results: concepts.map((x) => x.example).filter(Boolean) };
  }
  const xq = expandQuery(query);
  const adapt = c.items.map((it) => ({ id: it.knowledge_id, concept: it.normalized_concept, statement: it.statement, evidence_type: it.claim_type === 'DEFINITION' ? 'DEFINITION' : it.evidence_type, knowledge_class: it.claim_type, review_status: it.review_status, api: null }));
  const found = L.search(xq, { inv: c.inv, items: adapt, cfg, matchers, k: 400, includeQuarantined });
  const byId = new Map(c.items.map((i) => [i.knowledge_id, i]));
  // a question naming glossary concepts is answered only by items of those concepts (word overlap is not evidence)
  const strict = found.concepts.length > 0;
  let hits = found.results.map((r) => ({ score: r.score, it: byId.get(r.item.id) })).filter((r) => (!strict || found.concepts.includes(r.it.normalized_concept)) && (!api || r.it.api_attribution === api));
  const regime = /positive gamma|negative gamma/.exec(xq)?.[0];
  if (regime) hits = hits.map((r) => ({ ...r, score: r.score * (L.fold(r.it.statement).includes(regime) ? 2 : 1) })).sort((a, b) => b.score - a.score);
  // prefer first-party text over OCR, and one item per statement
  const seen = new Set(), results = [];
  for (const r of hits.sort((a, b) => b.score * (b.it.text_source === 'ocr' ? 0.5 : 1) - a.score * (a.it.text_source === 'ocr' ? 0.5 : 1))) { const key = L.fold(r.it.statement); if (seen.has(key)) continue; seen.add(key); results.push(row(r.it, r.score)); if (results.length >= k) break; }
  const top = results.find((r) => r.claim_type === 'DEFINITION') || results[0];
  const concept_summary = found.concepts.map((q) => { const x = c.catalog.concepts.find((y) => y.concept === q); return x ? { concept: q, term_class: x.term_class, items: x.items, lessons: x.lessons.length, dominant_api_attribution: x.dominant_api_attribution, api_field: x.api_field, api_absent_note: x.api_absent_note } : { concept: q, items: 0, note: 'NOT_TAUGHT_IN_COURSE_CORPUS' }; });
  const status = results.length ? 'ANSWERED_WITH_EVIDENCE' : strict ? 'NO_EVIDENCE_FOR_CONCEPT' : 'NO_EVIDENCE';
  return { ...base, status, expanded_query: xq !== fq ? xq : undefined, concepts: found.concepts, concept_summary, answer: top ? { statement: top.statement, lesson: top.citation.lesson, timestamp: top.citation.timestamp, confidence: top.confidence, api_attribution: top.api_attribution } : null, results };
}

export async function main(argv = process.argv.slice(2)) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const VAL = new Set(['--corpus', '--k', '--api']);
  const query = argv.filter((a, i) => !a.startsWith('--') && !VAL.has(argv[i - 1])).join(' ').trim();
  if (!query) { console.log(JSON.stringify({ spotgamma_course: 'USAGE', usage: 'sg-course-ask "<question>" [--k N] [--api SPOTGAMMA_API_CONFIRMED|...] [--include-quarantined] [--corpus dir]' })); return 2; }
  const api = arg('--api') || null; if (api && !S.API_ATTR.includes(api)) { console.log(JSON.stringify({ spotgamma_course: 'BAD_API', allowed: S.API_ATTR })); return 2; }
  const cfg = S.loadSgConfig(), root = path.resolve(arg('--corpus') || path.join(L.REPO, cfg.corpus_dir));
  console.log(JSON.stringify(ask(query, { root, k: Number(arg('--k') || 5), api, includeQuarantined: argv.includes('--include-quarantined'), cfg }), null, 2));
  return 0;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
