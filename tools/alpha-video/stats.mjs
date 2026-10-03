#!/usr/bin/env node
// alpha-video-stats — corpus statistics (read-only; `--rebuild` regenerates the indexes first).
// `--audit <source folder>` adds a read-only inventory of the source folder (every file: size, sha256, ffprobe duration,
// kind) and the corpus quality audit ⇒ indexes/inventory.json + indexes/audit.json. Originals are only read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { rebuild, probe } from './ingest.mjs';
import { ocrFrame } from './ocr.mjs';

const VIDEO = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v']), CAPTION = new Set(['.vtt', '.srt', '.ass', '.sub']);
const kindOf = (ext) => (VIDEO.has(ext) ? 'video' : CAPTION.has(ext) ? 'caption' : ['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext) ? 'document' : ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? 'image' : 'other');

export function stats(root, { refresh = false, cfg = L.loadConfig() } = {}) {
  const paths = L.corpusPaths(root);
  if (refresh) { L.ensureCorpus(root); return rebuild(paths, cfg); }
  return L.readJson(paths.stats) || { schema: 'alpha-video-stats/v1', status: 'EMPTY_CORPUS', videos: 0, items: 0 };
}

export function inventory(folder) {
  const base = path.resolve(folder), files = [], dirs = new Set();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { dirs.add(path.relative(base, f)); walk(f); } else files.push(f); } };
  walk(base);
  const out = files.sort().map((f) => {
    const ext = path.extname(f).toLowerCase(), kind = kindOf(ext), st = fs.statSync(f);
    const info = kind === 'video' ? probe(f) : null, v = info?.streams?.find((s) => s.codec_type === 'video'), a = info?.streams?.find((s) => s.codec_type === 'audio');
    return { path: path.relative(base, f), ext, kind, bytes: st.size, mtime: st.mtime.toISOString(), sha256: L.sha256File(f),
      ...(kind === 'video' ? { duration_s: info ? Math.round(Number(info.format?.duration || 0) * 1000) / 1000 : null, probe_ok: !!info, video_codec: v?.codec_name || null, width: v?.width || null, height: v?.height || null, audio_codec: a?.codec_name || null, subtitle_streams: (info?.streams || []).filter((s) => s.codec_type === 'subtitle').length } : {}) };
  });
  const bySha = {}; for (const f of out) (bySha[f.sha256] ||= []).push(f.path);
  return { schema: 'alpha-video-inventory/v1', source_folder: base, at: L.nowIso(), access: 'READ_ONLY', subfolders: [...dirs].sort(), files: out,
    totals: { files: out.length, bytes: out.reduce((s, f) => s + f.bytes, 0), by_kind: Object.fromEntries(['video', 'caption', 'document', 'image', 'other'].map((k) => [k, out.filter((f) => f.kind === k).length])), video_hours: Math.round(out.filter((f) => f.kind === 'video').reduce((s, f) => s + (f.duration_s || 0), 0) / 36) / 100 },
    duplicates: Object.values(bySha).filter((g) => g.length > 1) };
}

export async function audit(root, folder, { cfg = L.loadConfig() } = {}) {
  const paths = L.corpusPaths(root), inv = inventory(folder), st = rebuild(paths, cfg);
  const manifest = L.readJson(paths.manifest, { videos: [] }), cur = manifest.videos.filter((v) => !v.superseded_by);
  const bySha = new Map(cur.filter((v) => v.processing_status === 'INGESTED').map((v) => [v.sha256, v]));
  const vids = inv.files.filter((f) => f.kind === 'video'), perFile = [];
  let ocrEmpty = 0, ocrFail = 0, frames = 0;
  for (const f of vids) {
    const v = bySha.get(f.sha256), r = { path: f.path, sha256: f.sha256, duration_s: f.duration_s, status: v ? 'PROCESSED' : 'NOT_PROCESSED', video_id: v?.video_id || null, problems: [] };
    if (v) {
      if (v.transcription_method === 'none' || !v.counts?.cues) r.problems.push('TRANSCRIPTION_FAILURE');
      if (v.transcription_method.startsWith('stt-local') && !v.language_lock?.lang) r.problems.push('LANGUAGE_LOCK_MISSING');
      const fi = L.readJson(path.join(paths.frames, v.video_id, 'index.json'), { frames: [] });
      for (const fr of fi.frames) { // empty OCR is normal for frames without text; a re-run decides whether tesseract actually failed
        frames++; if (fr.ocr) continue; ocrEmpty++;
        const o = await ocrFrame(path.join(paths.root, fr.ref), { bin: cfg.ocr.bin, lang: cfg.ocr.lang });
        if (o.error) { ocrFail++; r.problems.push(`OCR_FAILURE:${fr.ref}`); }
      }
      Object.assign(r, { method: v.transcription_method, language: v.language, language_lock: v.language_lock || null, ...v.counts });
    }
    perFile.push(r);
  }
  const live = cur.filter((v) => v.processing_status === 'INGESTED');
  const out = { schema: 'alpha-video-audit/v1', at: L.nowIso(), source_folder: inv.source_folder, corpus: paths.root,
    VIDEOS_DISCOVERED: vids.length, VIDEOS_PROCESSED: perFile.filter((r) => r.status === 'PROCESSED').length, VIDEOS_SKIPPED: perFile.filter((r) => r.status !== 'PROCESSED').length,
    TOTAL_HOURS: Math.round(perFile.filter((r) => r.status === 'PROCESSED').reduce((s, r) => s + (r.duration_s || 0), 0) / 36) / 100,
    SEGMENTS: st.segments, FRAMES: frames, KNOWLEDGE_ITEMS: st.items, CONCEPTS: st.concepts,
    API_CONFIRMED: st.attribution.API_CONFIRMED, API_PROBABLE: st.attribution.API_PROBABLE, CROSS_API: st.attribution.CROSS_API, API_UNKNOWN: st.attribution.API_UNKNOWN,
    CONTRADICTIONS: st.contradictions, QUARANTINED: st.quarantined,
    TRANSCRIPTION_FAILURES: perFile.filter((r) => r.problems.includes('TRANSCRIPTION_FAILURE')).length, OCR_EMPTY_FRAMES: ocrEmpty, OCR_FAILURES: ocrFail,
    DUPLICATES: inv.duplicates.length, UNSUPPORTED_FILES: inv.files.filter((f) => f.kind !== 'video').map((f) => ({ path: f.path, kind: f.kind, reason: 'not a video: outside the video pipeline (not processed)' })),
    corpus_videos_not_in_folder: live.filter((v) => !vids.some((f) => f.sha256 === v.sha256)).map((v) => v.video_id),
    per_file: perFile, failures: perFile.filter((r) => r.problems.length || r.status !== 'PROCESSED') };
  L.writeJson(path.join(paths.indexes, 'inventory.json'), inv);
  L.writeJson(path.join(paths.indexes, 'audit.json'), out);
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const cfg = L.loadConfig();
  const root = path.resolve(arg('--corpus') || path.join(L.REPO, cfg.corpus_dir));
  if (arg('--audit')) { const a = await audit(root, arg('--audit'), { cfg }); const { per_file, ...head } = a; console.log(JSON.stringify(head, null, 2)); return a.failures.length ? 1 : 0; }
  console.log(JSON.stringify({ corpus: root, ...stats(root, { refresh: argv.includes('--rebuild'), cfg }) }, null, 2));
  return 0;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
