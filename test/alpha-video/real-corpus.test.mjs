// RC1–RC10 — validations over the REAL ingested corpus (knowledge/video). Read-only: nothing is copied from the course into
// the tests; assertions are structural (provenance, timestamps, attribution rules, retrieval, quarantine, originals intact).
// Skipped when the corpus or its local raw layers (gitignored: frames/transcripts/segments/sources) are absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../../tools/alpha-video/lib.mjs';
import { ask } from '../../tools/alpha-video/ask.mjs';

const cfg = L.loadConfig();
const ROOT = path.join(L.REPO, cfg.corpus_dir), P = L.corpusPaths(ROOT);
const manifest = L.readJson(P.manifest), inv = L.readJson(path.join(P.indexes, 'inventory.json')), aud = L.readJson(path.join(P.indexes, 'audit.json'));
const live = (manifest?.videos || []).filter((v) => !v.superseded_by && v.processing_status === 'INGESTED');
const local = live.length && fs.existsSync(P.transcripts) && fs.existsSync(P.segments);
const skip = !inv || !aud || !local ? 'real corpus not ingested on this machine (knowledge/video raw layers are local-only)' : false;
const items = skip ? [] : live.flatMap((v) => L.readJson(path.join(P.evidence, `${v.video_id}.items.json`)).items);
const segs = skip ? new Map() : new Map(live.flatMap((v) => L.readJson(path.join(P.segments, `${v.video_id}.json`)).segments.map((s) => [s.segment_id, s])));
const vmap = new Map(live.map((v) => [v.video_id, v]));

test('RC1 every inventoried video is processed; originals exist, unchanged (sha256) and were never copied', { skip }, () => {
  const vids = inv.files.filter((f) => f.kind === 'video');
  assert.ok(vids.length >= 1);
  assert.equal(aud.VIDEOS_DISCOVERED, vids.length); assert.equal(aud.VIDEOS_PROCESSED, vids.length, JSON.stringify(aud.failures));
  for (const f of vids) {
    const abs = path.join(inv.source_folder, f.path);
    assert.ok(fs.existsSync(abs), abs);
    assert.equal(fs.statSync(abs).size, f.bytes, abs);
    assert.ok(live.some((v) => v.sha256 === f.sha256 && path.resolve(v.source) === path.resolve(abs)), `not in corpus: ${f.path}`);
  }
  for (const v of live) {
    assert.equal(L.sha256File(v.source), v.sha256, `original changed: ${v.source}`);
    assert.equal(L.readJson(path.join(P.sources, `${v.video_id}.json`)).original_copied, false);
  }
  const big = fs.readdirSync(ROOT, { recursive: true }).filter((f) => /\.(mp4|mkv|mov|webm|avi|m4v|wav|mp3|m4a)$/i.test(String(f)));
  assert.deepEqual(big, [], 'no video/audio copied into the corpus');
});

test('RC2 transcripts: valid monotonic timestamps inside the video, one locked language per STT video, raw kept beside corrections', { skip }, () => {
  for (const v of live) {
    const tr = L.readJson(path.join(P.transcripts, `${v.video_id}.json`)), dur = v.duration_s * 1000 + 1000;
    assert.ok(tr.cues.length >= 1, `no transcript: ${v.title}`);
    let prev = -1;
    for (const c of tr.cues) { assert.ok(Number.isInteger(c.start_ms) && c.start_ms >= 0 && c.end_ms >= c.start_ms && c.end_ms <= dur, `${v.video_id} ${c.start_ms}`); assert.ok(c.start_ms >= prev); prev = c.start_ms; assert.ok(c.text.trim()); if (c.raw) assert.notEqual(c.raw.toLowerCase(), c.text.toLowerCase(), 'case-only change is not a correction'); }
    if (v.transcription_method.startsWith('stt-local')) { assert.ok(v.language_lock?.lang, v.video_id); assert.equal(v.language, v.language_lock.lang); }
  }
});

test('RC3 every knowledge item passes the quality gate against stored segments and frames (no orphan claims)', { skip }, () => {
  const ctx = { videos: vmap, segments: segs, frameExists: (r) => fs.existsSync(path.join(ROOT, r)) };
  assert.ok(items.length >= 1);
  const bad = items.map((it) => [it.id, L.validateItem(it, ctx)]).filter(([, e]) => e.length);
  assert.deepEqual(bad.slice(0, 5), []);
  for (const it of items) {
    const s = segs.get(it.segment_id);
    assert.ok(it.start_ms >= s.start_ms - 2500 && it.end_ms <= s.end_ms + 2500 || it.evidence.text_source === 'ocr', `${it.id} outside its segment`);
    assert.ok(it.source_kind === 'SOURCE_VIDEO' && it.uncalibrated === true && it.deterministic_rule === false);
  }
});

test('RC4 indexes reference only live items; aggregators keep provenance; stats agree with the items', { skip }, () => {
  const ids = new Set(items.map((i) => i.id)), inverted = L.readJson(P.inverted);
  assert.deepEqual(Object.keys(inverted.docs).filter((id) => !ids.has(id)), []);
  assert.equal(inverted.n, items.length);
  let n = 0;
  for (const api of [...L.APIS, 'cross-api', 'unknown']) {
    const agg = L.readJson(path.join(P.indexes, `alpha-${api}-video-knowledge.json`));
    for (const it of [...agg.factual, ...agg.needs_review, ...agg.quarantined]) { n++; assert.ok(ids.has(it.id)); assert.ok(vmap.has(it.provenance.video_id) && segs.has(it.provenance.segment_id) && Number.isInteger(it.provenance.start_ms)); }
    assert.ok(agg.factual.every((i) => i.attribution === 'API_CONFIRMED'));
  }
  assert.equal(n, items.length);
  const st = L.readJson(P.stats);
  assert.equal(st.items, items.length); assert.equal(st.videos, live.length);
  assert.equal(aud.KNOWLEDGE_ITEMS, items.length);
});

test('RC5 attribution rules hold on real data (no branding/correction-only confirmations)', { skip }, () => {
  for (const it of items) {
    if (it.attribution === 'API_CONFIRMED') {
      assert.ok(L.vendorsIn(it.statement, cfg).includes(it.api), `${it.id}: CONFIRMED without the vendor in the statement`);
      if (it.evidence.raw_cue_text) assert.ok(L.vendorsIn(it.evidence.raw_cue_text, cfg).includes(it.api), `${it.id}: vendor only from STT correction`);
    }
    if (it.attribution === 'API_PROBABLE' && /^SOURCE_VIDEO/.test(it.attribution_basis)) assert.ok(L.vendorsIn(segs.get(it.segment_id).transcript, cfg).includes(it.api), `${it.id}: PROBABLE from on-screen text only`);
    if (/on screen/.test(it.attribution_basis)) assert.equal(it.attribution, 'API_UNKNOWN');
    if (it.attribution === 'API_UNKNOWN') assert.equal(it.api, 'unknown');
  }
});

test('RC6 retrieval on the real corpus: cited answers for taught concepts, no invented answers for absent ones', { skip }, () => {
  const cat = L.readJson(path.join(P.concepts, 'catalog.json')).concepts, taught = new Set(cat.map((c) => c.concept));
  const top = [...cat].sort((a, b) => b.items - a.items)[0];
  const r = ask(`onde o material fala de ${top.concept}?`, { root: ROOT, cfg });
  assert.equal(r.status, 'ANSWERED_WITH_EVIDENCE');
  for (const x of r.results) { assert.equal(x.concept, top.concept); assert.ok(vmap.has(x.citation.video_id) && x.citation.segment_id && /^\d\d:\d\d:\d\d\.\d{3}–/.test(x.citation.timestamp)); }
  assert.ok(JSON.stringify(r).length < 20000, 'small evidence, never transcripts');
  for (const c of Object.keys(cfg.concepts).filter((c) => !taught.has(c))) {
    const a = ask(`há ${c}?`, { root: ROOT, cfg });
    assert.ok(['NO_EVIDENCE', 'NO_EVIDENCE_FOR_CONCEPT'].includes(a.status), `${c}: ${a.status}`); assert.equal(a.results.length, 0);
  }
});

test('RC7 untrusted content stays inert: flagged items quarantined and not retrievable; URLs defanged', { skip }, () => {
  for (const it of items.filter((i) => i.untrusted_flags.length)) assert.equal(it.review_status, 'QUARANTINED', it.id);
  for (const it of items) assert.doesNotMatch(it.statement, /\bhttps?:\/\//i);
  for (const v of live) assert.doesNotMatch(fs.readFileSync(path.join(P.transcripts, `${v.video_id}.json`), 'utf8'), /\bhttps?:\/\//i);
  const q = items.find((i) => i.review_status === 'QUARANTINED');
  if (q) assert.ok(!ask(q.statement, { root: ROOT, cfg }).results.some((r) => r.item_id === q.id));
});

test('RC8 contradictions are UNRESOLVED, cross-video, with both evidences', { skip }, () => {
  const c = L.readJson(P.contradictions);
  assert.equal(c.policy, 'NEVER_AUTO_RESOLVED'); assert.equal(aud.CONTRADICTIONS, c.contradictions.length);
  const ids = new Set(items.map((i) => i.id));
  for (const x of c.contradictions) {
    assert.equal(x.status, 'UNRESOLVED'); assert.equal(x.resolution, null); assert.notEqual(x.evidence_a.video_id, x.evidence_b.video_id);
    for (const ev of [x.evidence_a, x.evidence_b]) assert.ok(ids.has(ev.item_id) && Number.isInteger(ev.start_ms) && ev.quote);
  }
});

test('RC9 knowledge classes and evidence types are real enums; opinions are never API facts', { skip }, () => {
  for (const it of items) {
    assert.ok(L.KNOWLEDGE_CLASSES.includes(it.knowledge_class) && L.EVIDENCE_TYPES.includes(it.evidence_type));
    if (it.evidence_type === 'OPINION') assert.notEqual(it.knowledge_class, 'API_FIELD_MEANING');
    if (it.knowledge_class === 'API_FIELD_MEANING') assert.equal(it.attribution, 'API_CONFIRMED');
  }
});

test('RC10 quality audit is complete and consistent; JARVIS lexicon candidates carry provenance', { skip }, () => {
  for (const k of ['VIDEOS_DISCOVERED', 'VIDEOS_PROCESSED', 'VIDEOS_SKIPPED', 'TOTAL_HOURS', 'SEGMENTS', 'KNOWLEDGE_ITEMS', 'CONCEPTS', 'API_CONFIRMED', 'API_PROBABLE', 'API_UNKNOWN', 'CONTRADICTIONS', 'TRANSCRIPTION_FAILURES', 'OCR_FAILURES', 'DUPLICATES', 'UNSUPPORTED_FILES']) assert.ok(k in aud, k);
  assert.equal(aud.TRANSCRIPTION_FAILURES, 0); assert.equal(aud.VIDEOS_SKIPPED, 0);
  assert.equal(aud.API_CONFIRMED + aud.API_PROBABLE + aud.CROSS_API + aud.API_UNKNOWN, aud.KNOWLEDGE_ITEMS);
  const lex = L.readJson(path.join(P.concepts, 'jarvis-lexicon-candidates.json'));
  for (const t of lex.terms.filter((x) => x.status !== 'UNKNOWN_TERM')) { assert.ok(t.origin_timestamps.length >= 1); for (const o of t.origin_timestamps) assert.ok(vmap.has(o.video_id)); if (!t.pronunciation_pt_br) assert.equal(t.pronunciation_basis, 'not inferable safely'); }
});
