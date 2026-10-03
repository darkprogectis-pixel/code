// JARVIS voice observability: one ndjson line per voice cycle in var/jarvis/voice-cycles-YYYY-MM-DD.ndjson.
// Raw audio is never written; the transcript is written only when privacy.store_transcript is true.
import fs from 'node:fs';
import path from 'node:path';

export function createVoiceLog(dir, { storeTranscript = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    dir,
    write(rec) {
      const r = { schema: 'jarvis-voice-cycle/v1', at: new Date().toISOString(), ...rec };
      if (!storeTranscript) { delete r.transcript; delete r.answer_text; }
      delete r.audio; delete r.samples;
      fs.appendFileSync(path.join(dir, `voice-cycles-${r.at.slice(0, 10)}.ndjson`), JSON.stringify(r) + '\n');
      return r;
    },
  };
}

const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
// Read model for the control plane (GET only): last N cycles + p50/p95/p99 per stage.
export function readCycles(dir, limit = 200) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^voice-cycles-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort() : [];
  let rows = [];
  for (let i = files.length - 1; i >= 0 && rows.length < limit; i--) {
    const ls = fs.readFileSync(path.join(dir, files[i]), 'utf8').trim().split('\n').filter(Boolean);
    const parsed = []; for (const l of ls) { try { parsed.push(JSON.parse(l)); } catch { /* partial */ } }
    rows = parsed.slice(-(limit - rows.length)).concat(rows);
  }
  const stages = {};
  for (const k of ['stt_ms', 'answer_ms', 'tts_first_ms', 'first_audio_ms', 'total_ms']) {
    const v = rows.map((r) => r.latency?.[k]).filter((x) => typeof x === 'number');
    stages[k] = { n: v.length, p50: q(v, 0.5), p95: q(v, 0.95), p99: q(v, 0.99) };
  }
  const intents = {}; for (const r of rows) intents[r.intent] = (intents[r.intent] || 0) + 1;
  return { rows, stages, intents, unsupported_rate: rows.length ? rows.filter((r) => r.unsupported_n > 0 || r.no_evidence).length / rows.length : null, barge_ins: rows.filter((r) => r.barge_in).length, files: files.length };
}

export function readStatus(dir) { try { return { status: 'OK', ...JSON.parse(fs.readFileSync(path.join(dir, 'server.json'), 'utf8')) }; } catch { return { status: 'NO_DATA' }; } }
