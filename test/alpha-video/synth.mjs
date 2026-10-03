// Synthetic study videos for the alpha-video tests: ffmpeg lavfi (color + drawtext) + pt-BR speech from the JARVIS Piper voice.
// script: [{ say?: 'text', show?: 'screen text', at_s?: start, dur_s?: min duration }]; returns { file, cues:[{start_ms,end_ms,text}] }.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createVoice, wav } from '../../tools/jarvis/voice.mjs';

const FONT = 'C\\:/Windows/Fonts/arial.ttf';
let voice = null;
async function speak(text) {
  voice ||= createVoice({ voice: { enabled: true, num_threads: 2, tts: { engine: 'piper-faber' }, stt: { model: 'whisper-small' } } });
  const parts = []; let sr = 22050;
  for await (const c of voice.synth(text, { engine: 'piper-faber' })) { parts.push(c.samples); sr = c.sampleRate; }
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Float32Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return { samples: out, sr };
}
const escText = (t) => String(t).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%').replace(/,/g, '\\,');

export async function makeVideo(file, script, { total_s = null, captions = null, embedSubs = false, noAudio = false, color = 'navy' } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const SR = 22050; let t = 0; const cues = [], chunks = [], shows = [];
  for (const s of script) {
    if (s.at_s != null && s.at_s > t) { chunks.push(new Float32Array(Math.round((s.at_s - t) * SR))); t = s.at_s; }
    const start = t; let dur = s.dur_s || 0;
    if (s.say && !noAudio) { const a = await speak(s.say); chunks.push(a.samples); dur = Math.max(dur, a.samples.length / a.sr); }
    if (dur > a0(s.dur_s)) { /* speech defines duration */ }
    if (s.dur_s && s.say && !noAudio && s.dur_s > dur) chunks.push(new Float32Array(Math.round((s.dur_s - dur) * SR)));
    dur = Math.max(dur, s.dur_s || 0) || 2;
    if (noAudio || !s.say) chunks.push(new Float32Array(Math.round(dur * SR)));
    if (s.say) cues.push({ start_ms: Math.round(start * 1000), end_ms: Math.round((start + dur) * 1000), text: s.say });
    if (s.show) shows.push({ a: start, b: start + dur, text: s.show });
    t = start + dur;
    chunks.push(new Float32Array(Math.round(0.8 * SR))); t += 0.8;
  }
  const total = Math.max(total_s || 0, t);
  const n = Math.round(total * SR), pcm = new Float32Array(n); let o = 0; for (const c of chunks) { pcm.set(c.subarray(0, Math.max(0, n - o)), o); o += c.length; if (o >= n) break; }
  const wavFile = `${file}.wav`; fs.writeFileSync(wavFile, wav(pcm, SR));
  const draw = shows.map((s) => `drawtext=fontfile='${FONT}':text='${escText(s.text)}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${s.a.toFixed(2)},${s.b.toFixed(2)})'`);
  const vf = [`drawtext=fontfile='${FONT}':text='t=%{pts\\:hms}':fontcolor=yellow:fontsize=18:x=10:y=10`, ...draw].join(',');
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=10:d=${total.toFixed(2)}`];
  if (!noAudio) args.push('-i', wavFile);
  let srt = null;
  if (embedSubs) { srt = `${file}.embed.srt`; fs.writeFileSync(srt, toSrt(captions || cues)); args.push('-i', srt); }
  args.push('-vf', vf, '-map', '0:v');
  if (!noAudio) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '64k');
  if (embedSubs) args.push('-map', `${noAudio ? 1 : 2}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=por');
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-g', '50', '-pix_fmt', 'yuv420p', '-t', total.toFixed(2), file);
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', shell: false, windowsHide: true });
  fs.rmSync(wavFile, { force: true }); if (srt) fs.rmSync(srt, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg synth failed: ${r.stderr.slice(0, 500)}`);
  if (captions === true || Array.isArray(captions) && !embedSubs) fs.writeFileSync(file.replace(/\.[^.]+$/, '.vtt'), toVtt(Array.isArray(captions) ? captions : cues));
  return { file, cues, duration_s: total };
}
const a0 = (x) => x || 0;
const ts = (ms, sep) => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, x = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(x).padStart(3, '0')}`; };
export const toVtt = (cues) => `WEBVTT\n\n${cues.map((c) => `${ts(c.start_ms, '.')} --> ${ts(c.end_ms, '.')}\n${c.text}\n`).join('\n')}`;
export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${ts(c.start_ms, ',')} --> ${ts(c.end_ms, ',')}\n${c.text}\n`).join('\n');
export function closeVoice() { voice?.close(); voice = null; }
