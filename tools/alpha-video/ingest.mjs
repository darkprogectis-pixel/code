#!/usr/bin/env node
// alpha-video-ingest — single command: discover → watch (plugin bridge) → captions/STT → frames+OCR → segment → extract →
// classify → validate → index → update knowledge. Idempotent (same source + same hash ⇒ SKIP; changed ⇒ new version).
//   node tools/alpha-video/ingest.mjs <file|folder|url|manifest.json|urls.txt> [--corpus <dir>] [--detail transcript|efficient|balanced]
//        [--start T] [--end T] [--max-frames N] [--timestamps T1,T2] [--lang <code>] [--allow-token-burner] [--recursive] [--no-ocr]
//   node tools/alpha-video/ingest.mjs --reextract [--corpus <dir>]   (re-run extraction from stored transcripts/frames; no STT)
// Study material only: no trading/orders/AOT/INVICTUS. Video content is UNTRUSTED_EVIDENCE: never executed, its URLs never fetched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { decodeAudio, transcribe, sttStatus } from './stt.mjs';
import { ocrFrame } from './ocr.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v']);
const isUrl = (s) => /^https?:\/\/[^\s/]+/i.test(String(s));

export function watchScriptsDir(env = process.env) {
  if (env.ALPHA_VIDEO_WATCH_DIR) return env.ALPHA_VIDEO_WATCH_DIR;
  const cfgDir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude-darkprogectis');
  const base = path.join(cfgDir, 'plugins', 'cache', 'claude-video', 'watch');
  const vers = fs.existsSync(base) ? fs.readdirSync(base).sort() : [];
  if (!vers.length) throw new Error(`WATCH_NOT_INSTALLED: ${base} (claude plugin install watch@claude-video)`);
  return path.join(base, vers.at(-1), 'skills', 'watch', 'scripts');
}
function childEnv() {
  const links = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links');
  // Local engine and no speech fallback, regardless of ~/.config/watch/.env: no Gemini, no cloud ASR.
  return { ...process.env, PATH: `${links}${path.delimiter}${process.env.PATH || ''}`, WATCH_ENGINE: 'local', WATCH_WHISPER_BACKEND: 'none', GEMINI_API_KEY: '', GROQ_API_KEY: '', OPENAI_API_KEY: '', PYTHONIOENCODING: 'utf-8' };
}
function run(cmd, args, { timeout = 3600000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false, windowsHide: true, env: childEnv() }); let out = '', err = '';
    const t = setTimeout(() => p.kill(), timeout);
    p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}
export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8', shell: false, windowsHide: true, env: childEnv() });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// ---- discovery ----
export function discover(input, { recursive = false } = {}) {
  if (isUrl(input)) return [{ kind: 'url', source: input }];
  const p = path.resolve(input);
  if (!fs.existsSync(p)) throw new Error(`SOURCE_NOT_FOUND: ${p}`);
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    const out = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (recursive) walk(f); } else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) out.push({ kind: 'local', source: f }); } };
    walk(p); return out.sort((a, b) => a.source.localeCompare(b.source));
  }
  const ext = path.extname(p).toLowerCase();
  if (VIDEO_EXT.has(ext)) return [{ kind: 'local', source: p }];
  if (ext === '.json') { const j = JSON.parse(fs.readFileSync(p, 'utf8')); const list = Array.isArray(j) ? j : j.urls || j.sources || []; return list.map((x) => (typeof x === 'string' ? x : x.url || x.source)).filter(Boolean).flatMap((s) => (isUrl(s) ? [{ kind: 'url', source: s }] : discover(path.resolve(path.dirname(p), s)))); }
  if (ext === '.txt') return fs.readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && isUrl(l)).map((s) => ({ kind: 'url', source: s }));
  throw new Error(`UNSUPPORTED_SOURCE: ${p} (video ${[...VIDEO_EXT].join(' ')}, folder, manifest .json, url list .txt, or URL)`);
}
export const sourceKey = (d) => (d.kind === 'url' ? `url:${d.source.trim()}` : `file:${path.resolve(d.source).toLowerCase()}`);

// ---- local captions: sidecar .vtt/.srt next to the file, else the first embedded subtitle stream ----
function localCaptions(file, info) {
  const stem = file.slice(0, -path.extname(file).length);
  for (const ext of ['.vtt', '.srt']) { const f = [`${stem}${ext}`, ...fs.readdirSync(path.dirname(file)).filter((n) => n.startsWith(path.basename(stem) + '.') && n.endsWith(ext)).map((n) => path.join(path.dirname(file), n))].find((x) => fs.existsSync(x)); if (f) { const cues = L.parseCaptions(fs.readFileSync(f, 'utf8')); if (cues.length) return { cues, track: { kind: 'sidecar', file: path.basename(f) } }; } }
  const sub = (info?.streams || []).find((s) => s.codec_type === 'subtitle');
  if (sub) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', `0:${sub.index}`, '-f', 'webvtt', 'pipe:1'], { encoding: 'utf8', shell: false, windowsHide: true, env: childEnv(), maxBuffer: 64 << 20 });
    if (r.status === 0) { const cues = L.parseCaptions(r.stdout); if (cues.length) return { cues, track: { kind: 'embedded', stream: sub.index, language: sub.tags?.language || null } }; }
  }
  return null;
}

// ---- one source ----
export async function ingestOne(d, opts, cfg, paths, manifest, log = () => {}) {
  const key = sourceKey(d), detailOpt = opts.detail || null;
  if (detailOpt === 'token-burner' && !opts.allowTokenBurner && !cfg.watch.allow_token_burner) throw new Error('TOKEN_BURNER_DISABLED: pass --allow-token-burner explicitly');
  let sha = null, localInfo = null, duration = 0;
  if (d.kind === 'local') {
    sha = L.sha256File(d.source);
    const dup = manifest.videos.find((v) => v.sha256 === sha && v.processing_status === 'INGESTED');
    if (dup) return { status: 'SKIPPED_DUPLICATE', video_id: dup.video_id, source: d.source, reason: dup.source_key === key ? 'same source and hash' : `same hash as ${dup.source}` };
    localInfo = probe(d.source); duration = Number(localInfo?.format?.duration || 0);
  }
  const detail = detailOpt || (d.kind === 'local' && duration > cfg.watch.short_max_s ? cfg.watch.long_detail : cfg.watch.short_detail);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-video-'));
  try {
    const args = [path.join(HERE, 'watch_bridge.py'), '--watch-dir', watchScriptsDir(), '--source', d.source, '--work', work, '--detail', detail, '--resolution', String(cfg.watch.resolution)];
    for (const [k, v] of [['--start', opts.start], ['--end', opts.end], ['--max-frames', opts.maxFrames], ['--timestamps', opts.timestamps]]) if (v != null) args.push(k, String(v));
    log(`watch bridge (${detail}) ${d.source}`);
    let r = await run('py', ['-3', ...args]);
    let bridge; try { bridge = JSON.parse(r.out.trim().split('\n').at(-1)); } catch { throw new Error(`WATCH_BRIDGE_FAILED (${r.code}): ${r.err.slice(-400)}`); }
    if (bridge.fatal) throw new Error(`WATCH_BRIDGE_FAILED: ${bridge.fatal}`);
    const media = bridge.video_path;
    if (d.kind === 'url') {
      duration = Number(bridge.meta?.duration_seconds || bridge.info?.duration || 0);
      sha = media && fs.existsSync(media) ? L.sha256File(media) : L.sha256(JSON.stringify(bridge.captions.segments));
      const dup = manifest.videos.find((v) => v.sha256 === sha && v.processing_status === 'INGESTED');
      if (dup) return { status: 'SKIPPED_DUPLICATE', video_id: dup.video_id, source: d.source, reason: 'same content hash' };
      if (!detailOpt && duration > cfg.watch.short_max_s && media) { // long URL video: re-select frames efficiently on the downloaded copy
        r = await run('py', ['-3', ...args.map((a, i) => (args[i - 1] === '--detail' ? cfg.watch.long_detail : args[i - 1] === '--source' ? media : a))]);
        try { const b2 = JSON.parse(r.out.trim().split('\n').at(-1)); if (!b2.fatal) bridge.frames = b2.frames; } catch { /* keep balanced frames */ }
      }
    } else duration = Number(bridge.meta?.duration_seconds || duration);
    const prior = manifest.videos.filter((v) => v.source_key === key);
    const base = `v_${L.sha16(key).slice(0, 12)}`;
    const video_id = prior.length ? `${base}-v${prior.length + 1}` : base;

    // transcript: captions first, then local STT (JARVIS models), never cloud
    let cues = [], method = 'none', language = null, track = null, languageLock = null;
    if (bridge.captions.segments.length) { cues = bridge.captions.segments.map((s) => ({ start_ms: Math.round(s.start * 1000), end_ms: Math.round(s.end * 1000), text: s.text })); method = 'captions'; track = bridge.captions.track; language = track?.language || null; }
    else if (d.kind === 'local') { const lc = localCaptions(d.source, localInfo); if (lc) { cues = lc.cues; method = 'captions'; track = lc.track; language = lc.track.language || null; } }
    const hasAudio = !!bridge.meta?.has_audio;
    if (!cues.length && hasAudio && media) {
      const st = sttStatus(cfg.stt.model), model = st.available ? cfg.stt.model : cfg.stt.fallback;
      log(`local STT ${model}`);
      const lo = opts.start != null ? parseT(opts.start) : 0, hi = opts.end != null ? Math.min(parseT(opts.end), duration) : duration;
      let lang = opts.lang ?? cfg.stt.language;
      for (let a = lo; a < hi; a += cfg.stt.chunk_s) {
        const b = Math.min(hi, a + cfg.stt.chunk_s);
        const pcm = await decodeAudio(media, { start_s: a, end_s: b });
        const part = await transcribe(pcm, { model, language: lang, threads: cfg.stt.threads, offset_ms: Math.round(a * 1000) });
        if (!languageLock && part.language_lock) { languageLock = part.language_lock; if (!lang && languageLock.lang) lang = languageLock.lang; } // later chunks reuse the video language
        cues.push(...part);
      }
      method = `stt-local:${model}`; language = cues.find((c) => c.lang)?.lang || (opts.lang || null);
      cues = cues.map(({ lang, ...c }) => c);
    }
    if (opts.start != null || opts.end != null) { const lo = opts.start != null ? parseT(opts.start) * 1000 : -1, hi = opts.end != null ? parseT(opts.end) * 1000 : Infinity; cues = cues.filter((c) => c.end_ms >= lo && c.start_ms <= hi); }

    // frames: persisted in the corpus (derived evidence, small JPEGs) + OCR
    const fdir = path.join(paths.frames, video_id); fs.mkdirSync(fdir, { recursive: true });
    const frames = [];
    for (const [i, f] of bridge.frames.entries()) {
      const t_ms = Math.round(f.timestamp_seconds * 1000), name = `f_${String(i + 1).padStart(4, '0')}@${t_ms}ms.jpg`;
      fs.copyFileSync(f.path, path.join(fdir, name));
      const ref = `frames/${video_id}/${name}`;
      const o = cfg.ocr.enabled && !opts.noOcr ? await ocrFrame(path.join(fdir, name), { bin: cfg.ocr.bin, lang: cfg.ocr.lang }) : { text: '' };
      frames.push({ ref, t_ms, reason: f.reason, ocr: o.text || '' });
    }
    L.writeJson(path.join(fdir, 'index.json'), { video_id, frames });

    const title = bridge.info?.title || path.basename(d.source);
    const video = { video_id, version: prior.length + 1, source_key: key, source_type: d.kind, source: d.kind === 'local' ? path.resolve(d.source) : d.source, sha256: sha, sha256_scope: d.kind === 'local' ? 'source_file' : (media ? 'downloaded_media' : 'captions'), title, duration_s: Math.round(duration * 1000) / 1000, ingested_at: L.nowIso(), language, transcription_method: method, ...(languageLock ? { language_lock: languageLock } : {}), caption_track: track, watch_version: bridge.watch_version, detail, frame_count: frames.length, processing_status: 'PROCESSING', content_trust: 'UNTRUSTED_EVIDENCE' };
    const matchers = L.conceptMatchers(cfg);
    const segments = L.segmentize(video, cues, frames, cfg, matchers);
    const items = [], unknown = [];
    for (const s of segments) { const x = L.extractItems(video, s, cfg, matchers); items.push(...x.items); unknown.push(...x.unknown); }
    const ctx = { videos: new Map([[video_id, video]]), segments: new Map(segments.map((s) => [s.segment_id, s])), frameExists: (r) => fs.existsSync(path.join(paths.root, r)) };
    const accepted = [], rejected = [];
    for (const it of items) { const e = L.validateItem(it, ctx); (e.length ? rejected : accepted).push(e.length ? { at: L.nowIso(), item: it, errors: e } : it); }
    for (const rj of rejected) fs.appendFileSync(paths.rejected, JSON.stringify(rj) + '\n');

    L.writeJson(path.join(paths.sources, `${video_id}.json`), { ...video, ffprobe: localInfo ? { format: localInfo.format, streams: localInfo.streams?.map((s) => ({ index: s.index, codec_type: s.codec_type, codec_name: s.codec_name, width: s.width, height: s.height, duration: s.duration, language: s.tags?.language })) } : null, watch_bridge: { info: bridge.info, frame_meta: bridge.frame_meta, errors: bridge.errors }, original_copied: false });
    L.writeJson(path.join(paths.transcripts, `${video_id}.json`), { video_id, method, language, content_trust: 'UNTRUSTED_EVIDENCE', cues: cues.map((c) => ({ ...c, text: L.defang(c.text) })) });
    L.writeJson(path.join(paths.segments, `${video_id}.json`), { video_id, segments: segments.map((s) => ({ ...s, transcript: L.defang(s.transcript), cues: s.cues.map((c) => ({ ...c, text: L.defang(c.text) })), ocr: s.ocr.map((o) => ({ ...o, text: L.defang(o.text) })) })) });
    L.writeJson(path.join(paths.evidence, `${video_id}.items.json`), { video_id, schema: L.SCHEMA, items: accepted });
    L.writeJson(path.join(paths.concepts, `${video_id}.unknown-terms.json`), { video_id, terms: unknown });
    for (const p of prior) if (!p.superseded_by) p.superseded_by = video_id;
    Object.assign(video, { processing_status: 'INGESTED', counts: { cues: cues.length, segments: segments.length, frames: frames.length, items: accepted.length, rejected: rejected.length, quarantined: accepted.filter((i) => i.review_status === 'QUARANTINED').length } });
    manifest.videos.push(video);
    return { status: 'INGESTED', video_id, source: d.source, detail, transcription_method: method, ...video.counts };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
const parseT = (t) => { const p = String(t).split(':').map(Number); return p.reduce((a, x) => a * 60 + x, 0); };

// ---- corpus-wide indexes (cheap; ingestion itself stays incremental) ----
export function rebuild(paths, cfg) {
  const manifest = L.readJson(paths.manifest, { videos: [] });
  const vids = new Map(manifest.videos.map((v) => [v.video_id, v]));
  const items = [];
  for (const v of manifest.videos) { const f = L.readJson(path.join(paths.evidence, `${v.video_id}.items.json`)); for (const it of f?.items || []) items.push({ ...it, superseded: !!v.superseded_by }); }
  const contradictions = L.findContradictions(items, cfg, (id) => vids.get(id)?.source_key || id);
  const byItem = new Map(); for (const c of contradictions) for (const id of [c.evidence_a.item_id, c.evidence_b.item_id]) (byItem.get(id) || byItem.set(id, []).get(id)).push(c.contradiction_id);
  for (const it of items) it.contradictions = byItem.get(it.id) || [];
  L.writeJson(paths.contradictions, { schema: 'alpha-video-contradictions/v1', policy: 'NEVER_AUTO_RESOLVED', contradictions });
  const prov = (it) => ({ id: it.id, concept: it.concept, statement: it.statement, knowledge_class: it.knowledge_class, evidence_type: it.evidence_type, attribution: it.attribution, attribution_basis: it.attribution_basis, confidence: it.confidence, uncalibrated: true, review_status: it.review_status, untrusted_flags: it.untrusted_flags, contradictions: it.contradictions, unknowns: it.unknowns,
    provenance: { video_id: it.video_id, title: vids.get(it.video_id)?.title, source: vids.get(it.video_id)?.source, segment_id: it.segment_id, start_ms: it.start_ms, end_ms: it.end_ms, timestamp: `${L.fmtTs(it.start_ms)}–${L.fmtTs(it.end_ms)}`, text_source: it.evidence.text_source, frame_refs: it.evidence.frame_refs }, source_kind: 'SOURCE_VIDEO' });
  const live = items.filter((i) => !i.superseded);
  for (const api of [...L.APIS, 'cross_api', 'unknown']) {
    const mine = live.filter((i) => i.api === api);
    const name = L.APIS.includes(api) ? `alpha-${api}-video-knowledge` : `alpha-${api.replace('_', '-')}-video-knowledge`;
    L.writeJson(path.join(paths.indexes, `${name}.json`), {
      schema: 'alpha-video-knowledge/v1', name, api, layer: 'VIDEO_DERIVED_KNOWLEDGE', source_kind: 'SOURCE_VIDEO', content_trust: 'UNTRUSTED_EVIDENCE',
      policy: 'factual = API_CONFIRMED and not quarantined; everything else needs review; video never overrides SOURCE_API_DOCS/SOURCE_CODE; contradictions stay UNRESOLVED',
      factual: mine.filter((i) => i.attribution === 'API_CONFIRMED' && i.review_status !== 'QUARANTINED').map(prov),
      needs_review: mine.filter((i) => i.attribution !== 'API_CONFIRMED' && i.review_status !== 'QUARANTINED').map(prov),
      quarantined: mine.filter((i) => i.review_status === 'QUARANTINED').map(prov),
      contradictions: contradictions.filter((c) => mine.some((i) => i.id === c.evidence_a.item_id || i.id === c.evidence_b.item_id)),
    });
  }
  L.writeJson(paths.inverted, L.buildInverted(live, cfg));
  // concept catalog + unknown terms + JARVIS lexicon candidates
  const catalog = {};
  for (const it of live) { const c = catalog[it.concept] ||= { concept: it.concept, surfaces: new Set(), items: 0, apis: {}, evidence_types: {}, first: [] }; c.surfaces.add(it.surface); c.items++; c.apis[`${it.api}:${it.attribution}`] = (c.apis[`${it.api}:${it.attribution}`] || 0) + 1; c.evidence_types[it.evidence_type] = (c.evidence_types[it.evidence_type] || 0) + 1; if (c.first.length < 5) c.first.push({ video_id: it.video_id, segment_id: it.segment_id, start_ms: it.start_ms, item_id: it.id }); }
  const cat = Object.values(catalog).map((c) => ({ ...c, surfaces: [...c.surfaces] }));
  L.writeJson(path.join(paths.concepts, 'catalog.json'), { schema: 'alpha-video-concepts/v1', concepts: cat });
  const unknown = []; for (const v of manifest.videos) if (!v.superseded_by) unknown.push(...(L.readJson(path.join(paths.concepts, `${v.video_id}.unknown-terms.json`))?.terms || []));
  L.writeJson(path.join(paths.concepts, 'unknown-terms.json'), { schema: 'alpha-video-unknown-terms/v1', note: 'original spelling preserved; not in glossary; needs review', terms: unknown });
  let lex = []; try { lex = fs.readFileSync(path.join(L.REPO, 'tools', 'jarvis', 'lexicon.mjs'), 'utf8'); } catch { lex = ''; }
  const pron = (term) => { const m = String(lex).match(new RegExp(`\\[/\\\\b${term.replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\\\b/gi?, '([^']+)'\\]`, 'i')); return m ? m[1] : null; };
  // STT misrecognitions observed in the real transcripts (raw ⇒ corrected, with provenance), grouped by corrected form
  const mis = {}, matchers = L.conceptMatchers(cfg);
  for (const v of manifest.videos) if (!v.superseded_by) for (const c of L.readJson(path.join(paths.transcripts, `${v.video_id}.json`))?.cues || []) if (c.raw)
    for (const p of L.correctionPairs(c.raw, c.text)) { const k = p.corrected.replace(/[.,;:!?]+$/, ''); const e = mis[k] ||= { corrected: k, concepts: [...new Set(L.detectConcepts(k, matchers).map((x) => x.concept))], heard: {}, count: 0, examples: [] }; const h = p.heard.replace(/[.,;:!?]+$/, ''); e.heard[h] = (e.heard[h] || 0) + 1; e.count++; if (e.examples.length < 3) e.examples.push({ video_id: v.video_id, start_ms: c.start_ms, end_ms: c.end_ms, heard: h }); }
  const misList = Object.values(mis).sort((a, b) => b.count - a.count);
  const uniq = {}; for (const u of unknown) { const e = uniq[u.term] ||= { term: u.term, count: 0, origin_timestamps: [] }; e.count++; if (e.origin_timestamps.length < 3) e.origin_timestamps.push({ video_id: u.video_id, segment_id: u.segment_id, start_ms: u.start_ms, source: u.source }); }
  L.writeJson(path.join(paths.concepts, 'jarvis-lexicon-candidates.json'), {
    schema: 'alpha-video-jarvis-lexicon/v1', status: 'VIDEO_DERIVED_LEXICON_LAYER — reviewed candidates for JARVIS; tools/jarvis/lexicon.mjs and voice.mjs are not modified by ingestion',
    policy: 'pronunciation only from the existing JARVIS lexicon (never inferred); related_api only when API_CONFIRMED; misrecognitions = raw STT ⇒ corrected text actually observed, with timestamps',
    terms: cat.map((c) => { const defs = live.filter((i) => i.concept === c.concept && i.evidence_type === 'DEFINITION' && i.review_status !== 'QUARANTINED'); const p = pron(c.concept);
      return { term: c.concept, spellings_seen: c.surfaces, variations: cfg.concepts[c.concept] || [], pronunciation_pt_br: p, pronunciation_basis: p ? 'existing JARVIS lexicon' : 'not inferable safely',
        related_api: [...new Set(live.filter((i) => i.concept === c.concept && i.attribution === 'API_CONFIRMED').map((i) => i.api))], api_attribution_counts: c.apis, items: c.items,
        stt_misrecognitions: misList.filter((m) => m.concepts.includes(c.concept)).map((m) => ({ heard: m.heard, count: m.count, examples: m.examples })),
        definition: defs[0] ? { statement: defs[0].statement, item_id: defs[0].id, video_id: defs[0].video_id, start_ms: defs[0].start_ms } : null, origin_timestamps: c.first }; })
      .concat(Object.values(uniq).sort((a, b) => b.count - a.count).map((u) => ({ term: u.term, spellings_seen: [u.term], count: u.count, variations: [], pronunciation_pt_br: null, pronunciation_basis: 'unknown term', related_api: [], definition: null, origin_timestamps: u.origin_timestamps, status: 'UNKNOWN_TERM' }))),
    stt_corrections: misList,
  });
  const cur = manifest.videos.filter((v) => !v.superseded_by);
  const stats = { schema: 'alpha-video-stats/v1', at: L.nowIso(), videos: cur.length, versions_total: manifest.videos.length, hours_ingested: Math.round(cur.reduce((a, v) => a + (v.duration_s || 0), 0) / 36) / 100,
    segments: cur.reduce((a, v) => a + (v.counts?.segments || 0), 0), transcripts: cur.filter((v) => v.counts?.cues).length, frames: cur.reduce((a, v) => a + (v.counts?.frames || 0), 0), concepts: cat.length,
    items: live.length, attribution: Object.fromEntries(L.ATTRIBUTION.map((a) => [a, live.filter((i) => i.attribution === a).length])), unknown_terms: unknown.length, contradictions: contradictions.length, quarantined: live.filter((i) => i.review_status === 'QUARANTINED').length,
    processing_status: Object.fromEntries([...new Set(manifest.videos.map((v) => v.processing_status))].map((s) => [s, manifest.videos.filter((v) => v.processing_status === s).length])),
    per_api: Object.fromEntries([...L.APIS, 'cross_api', 'unknown'].map((a) => [a, { items: live.filter((i) => i.api === a).length, factual: live.filter((i) => i.api === a && i.attribution === 'API_CONFIRMED' && i.review_status !== 'QUARANTINED').length }])) };
  L.writeJson(paths.stats, stats);
  return stats;
}

// ---- re-extraction: glossary/attribution changes applied to ingested videos from stored transcript + frames (no STT, no bridge) ----
export function reextract(paths, cfg) {
  const manifest = L.readJson(paths.manifest, { videos: [] }), matchers = L.conceptMatchers(cfg), out = [];
  for (const v of manifest.videos) {
    if (v.superseded_by || v.processing_status !== 'INGESTED') continue;
    const tr = L.readJson(path.join(paths.transcripts, `${v.video_id}.json`)), fi = L.readJson(path.join(paths.frames, v.video_id, 'index.json'));
    if (!tr || !fi) { out.push({ status: 'REEXTRACT_SKIPPED', video_id: v.video_id, reason: 'stored transcript or frames index missing' }); continue; }
    const segments = L.segmentize(v, tr.cues, fi.frames, cfg, matchers);
    const items = [], unknown = [];
    for (const sg of segments) { const x = L.extractItems(v, sg, cfg, matchers); items.push(...x.items); unknown.push(...x.unknown); }
    const ctx = { videos: new Map([[v.video_id, v]]), segments: new Map(segments.map((sg) => [sg.segment_id, sg])), frameExists: (r) => fs.existsSync(path.join(paths.root, r)) };
    const accepted = [], rejected = [];
    for (const it of items) { const e = L.validateItem(it, ctx); (e.length ? rejected : accepted).push(e.length ? { at: L.nowIso(), item: it, errors: e } : it); }
    for (const rj of rejected) fs.appendFileSync(paths.rejected, JSON.stringify(rj) + '\n');
    L.writeJson(path.join(paths.segments, `${v.video_id}.json`), { video_id: v.video_id, segments });
    L.writeJson(path.join(paths.evidence, `${v.video_id}.items.json`), { video_id: v.video_id, schema: L.SCHEMA, items: accepted });
    L.writeJson(path.join(paths.concepts, `${v.video_id}.unknown-terms.json`), { video_id: v.video_id, terms: unknown });
    v.counts = { ...v.counts, segments: segments.length, items: accepted.length, rejected: rejected.length, quarantined: accepted.filter((i) => i.review_status === 'QUARANTINED').length };
    v.reextracted_at = L.nowIso();
    out.push({ status: 'REEXTRACTED', video_id: v.video_id, ...v.counts });
  }
  L.writeJson(paths.manifest, manifest);
  return out;
}

export async function main(argv = process.argv.slice(2), log = (m) => process.stderr.write(`[alpha-video] ${m}\n`)) {
  const flag = (n) => argv.includes(n), arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const VAL = new Set(['--corpus', '--detail', '--start', '--end', '--max-frames', '--timestamps', '--lang']);
  const input = argv.find((a, i) => !a.startsWith('--') && !VAL.has(argv[i - 1]));
  if (flag('--reextract')) {
    const cfg = L.loadConfig(), paths = L.ensureCorpus(path.resolve(arg('--corpus') || path.join(L.REPO, cfg.corpus_dir)));
    const results = reextract(paths, cfg), stats = rebuild(paths, cfg);
    console.log(JSON.stringify({ alpha_video: 'REEXTRACTED', corpus: paths.root, results, stats }, null, 2));
    return 0;
  }
  if (!input) { console.log(JSON.stringify({ alpha_video: 'USAGE', usage: 'alpha-video-ingest <file|folder|url|manifest.json|urls.txt> [--detail ...] [--start T --end T] [--max-frames N] [--timestamps ...] [--lang xx] [--corpus dir]' })); return 2; }
  const cfg = L.loadConfig();
  const paths = L.ensureCorpus(path.resolve(arg('--corpus') || path.join(L.REPO, cfg.corpus_dir)));
  const opts = { detail: arg('--detail'), start: arg('--start'), end: arg('--end'), maxFrames: arg('--max-frames') ? Number(arg('--max-frames')) : null, timestamps: arg('--timestamps'), lang: arg('--lang'), allowTokenBurner: flag('--allow-token-burner'), noOcr: flag('--no-ocr') };
  let found;
  try { found = discover(input, { recursive: flag('--recursive') }); }
  catch (e) { console.log(JSON.stringify({ alpha_video: 'SOURCE_ERROR', input, error: String(e.message || e) })); return 2; }
  const results = [];
  for (const d of found) {
    const manifest = L.readJson(paths.manifest);
    try { results.push(await ingestOne(d, opts, cfg, paths, manifest, log)); }
    catch (e) { results.push({ status: 'FAILED', source: d.source, error: String(e.message || e) }); }
    L.writeJson(paths.manifest, manifest);
  }
  const stats = rebuild(paths, cfg);
  console.log(JSON.stringify({ alpha_video: found.length ? 'DONE' : 'NO_VIDEOS_FOUND', input, corpus: paths.root, discovered: found.length, results, stats }, null, 2));
  return results.some((r) => r.status === 'FAILED') ? 1 : 0;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
