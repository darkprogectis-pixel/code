// JARVIS knowledge-skill registry + retrieval adapter (read-only). Registry = config/jarvis-skills.json; each skill stays the canonical
// source of its own domain and JARVIS only selects, queries and cites it. Retrieval reuses the existing corpus ask() functions
// (SpotGamma course: tools/alpha-video/spotgamma/ask.mjs · MenthorQ course: tools/alpha-video/ask.mjs). No copy of corpus content,
// no subprocess, no network, no writes. Corpus text is UNTRUSTED_EVIDENCE: it is quoted, never executed.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, loadConfig, conceptMatchers, detectConcepts, fold } from '../alpha-video/lib.mjs';
import { loadSgConfig } from '../alpha-video/spotgamma/lib.mjs';
import { ask as askMenthorQ } from '../alpha-video/ask.mjs';
import { ask as askSpotGamma, expandQuery } from '../alpha-video/spotgamma/ask.mjs';

export const REGISTRY_FILE = path.join(REPO, 'config', 'jarvis-skills.json');
export const INSUFFICIENT = 'INSUFFICIENT_EVIDENCE';
export const VERDICTS = ['AGREEMENT', 'DIFFERENCE', 'CONTEXT_DEPENDENT', INSUFFICIENT];
export const SOURCE_NAME = { SPOTGAMMA: 'SpotGamma', MENTHORQ: 'MenthorQ' };
const RETRIEVERS = { 'spotgamma-course-ask': askSpotGamma, 'alpha-video-ask': askMenthorQ };
const CORPUS_MARKER = { 'spotgamma-course-ask': 'indexes/inverted.json', 'alpha-video-ask': 'manifest.json' };

// Glossary of every registered corpus. When another glossary recognises a longer phrase containing a concept (e.g. "Volatility Trigger"
// ⊃ "Volatility", "positive gamma" ⊃ "gamma"), that concept's items count only if their statement contains the longer phrase.
let GLOSS = null;
const glossaries = () => (GLOSS ||= { 'spotgamma-course-ask': conceptMatchers(loadSgConfig()), 'alpha-video-ask': conceptMatchers(loadConfig()) });
export function eclipsedConcepts(question, method) {
  const q = expandQuery(question), G = glossaries(), out = new Map();
  const mine = detectConcepts(q, G[method]), others = Object.entries(G).filter(([m]) => m !== method).flatMap(([, M]) => detectConcepts(q, M));
  for (const c of mine) for (const o of others) if (fold(o.surface).length > fold(c.surface).length && fold(o.surface).includes(fold(c.surface))) (out.get(c.concept) || out.set(c.concept, []).get(c.concept)).push(fold(o.surface));
  return out;
}

export function loadRegistry(file = REGISTRY_FILE) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

// Structural validation: unique ids/paths, real skill files, corpus present, known retrieval method, source set. [] = valid.
export function validateRegistry(reg, repo = REPO) {
  const errs = [], ids = new Set(), paths = new Set();
  for (const s of reg.skills || []) {
    const id = s.skill_id;
    if (!id || ids.has(id)) errs.push(`duplicate_or_missing_id:${id}`); ids.add(id);
    if (paths.has(s.path)) errs.push(`duplicate_path:${s.path}`); paths.add(s.path);
    for (const k of ['name', 'domain', 'path', 'source', 'retrieval_method', 'confidence_policy']) if (!s[k]) errs.push(`${id}:missing_${k}`);
    if (typeof s.enabled !== 'boolean' || typeof s.priority !== 'number') errs.push(`${id}:enabled_priority`);
    if (!fs.existsSync(path.join(repo, s.path))) errs.push(`${id}:path_not_found`);
    if (!RETRIEVERS[s.retrieval_method]) errs.push(`${id}:unknown_retrieval_method`);
    else if (!s.corpus_path || !fs.existsSync(path.join(repo, s.corpus_path, CORPUS_MARKER[s.retrieval_method]))) errs.push(`${id}:corpus_not_found`);
    if (s.deprecated && s.enabled) errs.push(`${id}:deprecated_enabled`);
  }
  for (const n of reg.not_for_jarvis || []) if (ids.has(n.skill_id)) errs.push(`${n.skill_id}:listed_as_not_for_jarvis`);
  return errs;
}

// Vendor / α names that select a knowledge skill. The word "gamma" alone is a concept, never the SpotGamma source.
const PICK = [
  ['skill-alpha-gamma', /(^| )(spot ?gamm?a|alfa gamm?a|alpha gamm?a)( |$)/],
  ['skill-alpha-q', /(^| )(menth?or ?q|mentor que|menthor|alfa q|alpha q)( |$)/],
  ['skill-alpha-quant', /(^| )(alfa quant|alpha quant|consolidator|consolidador)( |$)/],
  ['skill-alpha-bot', /(^| )(alfa bot|alpha bot|gex ?bot|gammagex)( |$)/],
  ['skill-alpha-data', /(^| )(alfa data|alpha data|quant ?data)( |$)/],
];
export const namedSkills = (t) => PICK.filter(([, re]) => re.test(t)).map(([id]) => id);

// Named skills win; otherwise every enabled default knowledge skill (each answers separately).
export function selectSkills(t, reg = loadRegistry()) {
  const on = reg.skills.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority);
  const named = namedSkills(t).map((id) => on.find((s) => s.skill_id === id)).filter(Boolean);
  return named.length ? named : on.filter((s) => s.default_knowledge);
}

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const ts0 = (ts) => (ts ? String(ts).split(/[–-]/)[0].replace(/\.\d+$/, '') : null);
function rowsOf(skill, a) {
  if (a.schema === 'spotgamma-course-answer/v1') return a.results.map((r) => ({ source: 'SPOTGAMMA', skill: skill.skill_id, concept: r.concept, statement: r.statement, claim_type: r.claim_type,
    course: r.citation.course, lesson: `${r.citation.module} › ${r.citation.lesson}`, lesson_id: r.citation.lesson_id, video_id: r.citation.video_id, timestamp: r.citation.timestamp,
    timestamp_null_reason: r.citation.timestamp_null_reason ?? null, text_source: r.citation.text_source, api_attribution: r.api_attribution, confidence: r.confidence, knowledge_id: r.knowledge_id, contradictions: r.contradictions.length }));
  // MenthorQ citation.source is a local file path: only the video title is exposed.
  return a.results.map((r) => ({ source: 'MENTHORQ', skill: skill.skill_id, concept: r.concept, statement: r.statement, claim_type: r.knowledge_class,
    course: 'MenthorQ course', lesson: r.citation.title, lesson_id: r.citation.segment_id, video_id: r.citation.video_id, timestamp: r.citation.timestamp, timestamp_null_reason: null,
    text_source: r.citation.text_source, api_attribution: `${r.api}/${r.attribution}`, confidence: r.confidence, knowledge_id: r.item_id, contradictions: r.contradictions.length }));
}

// retrieve(skill, question) → {source, skill, status: ANSWERED | INSUFFICIENT_EVIDENCE, concepts, rows[], confidence, ms}
// Strict: only items whose concept is named by the question count; no concept named ⇒ INSUFFICIENT_EVIDENCE (word overlap is not evidence).
// Spoken/first-party text is preferred over OCR; fragments under 5 words are dropped.
export function retrieve(skill, question, { k = 3, repo = REPO } = {}) {
  const t0 = performance.now();
  const base = { source: skill.source, skill: skill.skill_id, domain: skill.domain };
  let a;
  try { a = RETRIEVERS[skill.retrieval_method](expandQuery(question), { root: path.join(repo, skill.corpus_path), k: 25, api: skill.api_filter }); }
  catch (e) { return { ...base, status: INSUFFICIENT, reason: `retrieval_error: ${String(e.message).slice(0, 120)}`, concepts: [], rows: [], confidence: 0, ms: Math.round(performance.now() - t0) }; }
  const eclipsed = eclipsedConcepts(question, skill.retrieval_method);
  const concepts = a.concepts || [];
  let rows = concepts.length ? rowsOf(skill, a).filter((r) => concepts.includes(r.concept) && words(r.statement) >= 5 && (!eclipsed.has(r.concept) || eclipsed.get(r.concept).some((x) => fold(r.statement).includes(x)))) : [];
  if (rows.some((r) => r.text_source !== 'ocr')) rows = rows.filter((r) => r.text_source !== 'ocr');
  rows = rows.map((r, i) => [r, i]).sort((a, b) => (a[0].claim_type === 'DEFINITION' ? 0 : 1) - (b[0].claim_type === 'DEFINITION' ? 0 : 1) || a[1] - b[1]).map(([r]) => r); // definitions first, corpus order otherwise
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  if (!rows.length) return { ...base, status: INSUFFICIENT, reason: concepts.length && concepts.every((c) => eclipsed.has(c)) ? `no evidence for ${[...eclipsed.values()].flat().join(', ')} (only the shorter concept ${[...eclipsed.keys()].join(', ')})` : !concepts.length ? 'no glossary concept in question' : `no evidence for ${concepts.join(', ')}`, corpus_status: a.status, concepts, rows: [], all_rows: [], confidence: 0, ms };
  return { ...base, status: 'ANSWERED', corpus_status: a.status, concepts, rows: rows.slice(0, k), all_rows: rows, confidence: Math.max(...rows.slice(0, k).map((r) => r.confidence)), ms };
}

// Deterministic cross-source verdict over the retrieved statements (lexical, UNCALIBRATED). Never invents consensus:
// no shared axis signal ⇒ INSUFFICIENT_EVIDENCE.
const AXES = {
  volatility: { dampen: /stabili[sz]|dampen|suppress|lower (realized )?vol|less volatil|mean[- ]?revert|\bpin|calm|(reduc|decreas)\w* (the )?volatility|sell (into )?rall|buy (the )?dips?/, amplify: /amplif|accelerat|exacerbat|higher (realized )?vol|more volatil|(increas|expand)\w* (the )?volatility|trend|chase|fuel/ },
  level: { support: /\bsupport/, resistance: /\bresist/ },
  direction: { up: /bullish|upside|higher prices|\brall(y|ies)\b/, down: /bearish|downside|sell[- ]?off|lower prices/ },
};
export function poles(statements) {
  const out = {};
  for (const [axis, P] of Object.entries(AXES)) {
    const n = Object.fromEntries(Object.entries(P).map(([p, re]) => [p, statements.filter((s) => re.test(String(s).toLowerCase())).length]));
    const [a, b] = Object.keys(P);
    out[axis] = !n[a] && !n[b] ? null : n[a] && n[b] ? 'both' : n[a] ? a : b;
  }
  return out;
}
export function compareSources(results) {
  const hit = results.filter((r) => r.status === 'ANSWERED');
  if (results.length < 2 || hit.length < results.length) return { verdict: INSUFFICIENT, basis: hit.length ? `evidence only from ${hit.map((r) => r.source).join(', ')}` : 'no evidence in any source', axes: {} };
  const [pa, pb] = hit.map((r) => poles(r.all_rows.map((x) => x.statement)));
  const axes = {}; let v = null;
  for (const axis of Object.keys(AXES)) {
    if (!pa[axis] || !pb[axis]) continue;
    const r = pa[axis] === 'both' || pb[axis] === 'both' ? 'CONTEXT_DEPENDENT' : pa[axis] === pb[axis] ? 'AGREEMENT' : 'DIFFERENCE';
    axes[axis] = { [hit[0].source]: pa[axis], [hit[1].source]: pb[axis], result: r };
    v = r === 'DIFFERENCE' || v === 'DIFFERENCE' ? 'DIFFERENCE' : r === 'CONTEXT_DEPENDENT' || v === 'CONTEXT_DEPENDENT' ? 'CONTEXT_DEPENDENT' : 'AGREEMENT';
  }
  return v ? { verdict: v, basis: 'lexical axis comparison of retrieved statements (UNCALIBRATED)', axes } : { verdict: INSUFFICIENT, basis: 'both sources have evidence but no comparable axis', axes };
}
