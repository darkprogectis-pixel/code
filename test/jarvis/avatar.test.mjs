// JARVIS floating avatar (AVATAR01–14), avatar voice integration (VOICE06–08) and E2E — PROPOSAL R2 §7.1–§7.3.
// Builds tools/jarvis/avatar with the built-in .NET Framework csc and runs `JarvisAvatar.exe --selftest` against a real JARVIS
// server on an ephemeral port (temp --var dir, so it never collides with an operator's running avatar). Windows only.
// Opens a real window briefly; the voice part plays audio through the speakers. No mouse/keyboard input is synthesized.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, EXE } from '../../tools/jarvis/avatar/build.mjs';
import { createJarvisServer, loadJarvisConfig } from '../../tools/jarvis/server.mjs';
import { createVoice, modelAvailable, resample } from '../../tools/jarvis/voice.mjs';
import { toSpeech } from '../../tools/jarvis/lexicon.mjs';
import { resolveProfile } from '../../tools/jarvis/voice-profile.mjs';
import { readCycles } from '../../tools/jarvis/voice-log.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WIN = process.platform === 'win32' ? false : 'Windows only';
const cfg = loadJarvisConfig();
const VOICE_SKIP = WIN || (modelAvailable('piper-faber') && modelAvailable('whisper-small') ? false : 'voice models not installed');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-av-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(25); } return false; };
const spawned = new Set();
const readyMs = [];
test.after(() => { for (const p of spawned) try { p.kill(); } catch { /* gone */ } });

const stubVoice = () => ({ status: () => ({ available: false, status: 'VOICE_UNAVAILABLE(stub)' }), synth() { throw new Error('stub'); }, close() {} });
async function boot({ voice = stubVoice(), dir = tmp() } = {}) {
  const srv = createJarvisServer({ cfg, alphaDir: dir, jarvisDir: dir, voice, port: 0 });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const post = (p, body) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-token': srv.token }, body: JSON.stringify(body) });
  return { srv, dir, port, post, close: () => new Promise((r) => srv.close(r)) };
}
function runExe(args) {
  const p = spawn(EXE, args, { stdio: 'pipe', windowsHide: false }); spawned.add(p);
  const exit = new Promise((r) => p.on('exit', (c) => { spawned.delete(p); r(c); }));
  return { p, exit, t0: Date.now() };
}
// selftest run: waits for runtime.json, runs `during(rt)`, waits for exit, returns the selftest JSON
async function selftest({ port, dir, args = [], during = async () => {} }) {
  const out = path.join(dir, `st-${crypto.randomBytes(3).toString('hex')}.json`), rt = path.join(dir, 'avatar', 'runtime.json');
  try { fs.rmSync(rt); } catch { /* none */ }
  const r = runExe(['--selftest', out, '--var', dir, '--port', String(port), ...args]);
  assert.ok(await until(() => fs.existsSync(rt), 10000), 'runtime.json (READY) within 10 s');
  await during(JSON.parse(fs.readFileSync(rt, 'utf8')));
  const code = await r.exit; assert.equal(code, 0, `selftest exit ${code}`);
  const j = JSON.parse(fs.readFileSync(out, 'utf8')); readyMs.push(j.ready_ms); return j;
}
const states = (j, why) => j.states.filter((s) => !why || String(s.why).startsWith(why));
function sse(port) {
  const events = [];
  const r = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
    res.setEncoding('utf8'); let buf = '';
    res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.+)$/m.exec(blk)?.[1], data = /^data: (.+)$/m.exec(blk)?.[1]; if (ev === 'state') events.push({ ...JSON.parse(data), t: Date.now() }); } });
  });
  r.on('error', () => {});
  return { events, close: () => r.destroy() };
}
const avatarCount = () => { try { return (execFileSync('tasklist', ['/FI', 'IMAGENAME eq JarvisAvatar.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).match(/JarvisAvatar\.exe/g) || []).length; } catch { return -1; } };
let preexisting = 0;

test('AVATAR00 build: csc compiles (first build ≤ 15 s, then cached)', { skip: WIN }, () => {
  preexisting = avatarCount();
  const r = build(); if (r.built) assert.ok(r.ms <= 15000, `build ${r.ms} ms`);
  console.log(`AVATAR00 build ${r.built ? `${r.ms} ms` : 'cached'} hash ${r.hash.slice(0, 12)}`);
  assert.ok(fs.existsSync(EXE)); assert.equal(build().built, false, 'second call cached');
});

test('AVATAR01 asset: byte-identical copy, PNG with alpha, decodes 1254×1254 in the exe', { skip: WIN }, async () => {
  const a = fs.readFileSync(path.join(REPO, 'assets', 'jarvis', 'jarvis-avatar.png'));
  assert.equal(crypto.createHash('sha256').update(a).digest('hex').toUpperCase(), '4CBB518C255B5D2A79057889D4FA08282DBF7EFA4D2289C27964391E94B07AA7');
  assert.equal(a.subarray(1, 4).toString('ascii'), 'PNG'); assert.equal(a.readUInt32BE(16), 1254); assert.equal(a.readUInt32BE(20), 1254); assert.equal(a[25], 6, 'colour type 6 = RGBA');
  const src = path.join(os.homedir(), 'Downloads', 'Avatar Android com Olhos Neon Roxos.png');
  if (fs.existsSync(src)) assert.ok(fs.readFileSync(src).equals(a), 'equal to the operator file');
});

// One selftest run against a stub-voice server covers window, transparency, DPI, persistence write and all five bus states.
let main;
test('AVATAR selftest run (stub server): states posted by Node + core-emitted THINKING/IDLE', { skip: WIN, timeout: 60000 }, async () => {
  const b = await boot();
  try {
    main = await selftest({ port: b.port, dir: b.dir, args: ['--hold-ms', '9500', '--pos', '200,150'], during: async () => {
      await sleep(1500); // phase 0/1: move + persist
      for (const s of ['LISTENING', 'THINKING', 'SPEAKING', 'IDLE']) { assert.equal((await b.post('/api/ui-state', { state: s })).status, 200); await sleep(400); }
      assert.equal((await b.post('/api/ask?speak=0', { text: 'status das fontes' })).status, 200); await sleep(400); // core THINKING → IDLE
      assert.equal((await b.post('/api/ui-state', { state: 'ERROR' })).status, 200); await sleep(6000); // error ⇒ IDLE after 5 s
    } });
    main.dir = b.dir; main.port = b.port;
  } finally { await b.close(); }
  assert.equal(main.asset_status, 'OK');
});

test('AVATAR01b exe decoded the asset with alpha', { skip: WIN }, () => {
  assert.match(main.asset_format, /Bgra32|Pbgra32/); assert.deepEqual(main.asset_size, [1254, 1254]);
});
test('AVATAR02 transparent outside the face; AVATAR02b clicks pass through the transparent corner', { skip: WIN }, () => {
  const t = main.transparency; console.log('AVATAR02', JSON.stringify(t));
  assert.equal(t.error, undefined); assert.equal(t.rendered_corner_alpha_max, 0); assert.ok(t.rendered_centre_alpha_max > 200);
  assert.ok(t.screen_corner_mean_abs_diff <= 2, `corner diff ${t.screen_corner_mean_abs_diff}`); assert.ok(t.screen_centre_mean_abs_diff >= 20, `centre diff ${t.screen_centre_mean_abs_diff}`);
  assert.equal(t.hit_corner_is_avatar, false); assert.equal(t.hit_centre_is_avatar, true);
});
test('AVATAR03 frameless (no caption/thickframe/sysmenu, window rect = client rect)', { skip: WIN }, () => {
  const f = main.flags; assert.equal(f.caption, false); assert.equal(f.thickframe, false); assert.equal(f.sysmenu, false);
  const [, , w, h] = main.rect.window, [, , cw, ch] = main.rect.client; assert.ok(Math.abs(w - cw) <= 1 && Math.abs(h - ch) <= 1, JSON.stringify(main.rect));
});
test('AVATAR04 topmost + layered + toolwindow ex-styles', { skip: WIN }, () => {
  const ex = parseInt(main.exstyle, 16); assert.ok(ex & 0x8, 'WS_EX_TOPMOST'); assert.ok(ex & 0x80000, 'WS_EX_LAYERED'); assert.ok(ex & 0x80, 'WS_EX_TOOLWINDOW');
});
test('AVATAR05 drag (automated wiring part; physical drag = MANUAL_PHYSICAL)', { skip: WIN }, () => {
  assert.equal(main.drag_wiring.handlers, true); assert.equal(main.drag_wiring.threshold_dip, 4);
  const p = main.prefs_after_move; assert.ok(p && Math.abs(p.left - 200) <= 2 && Math.abs(p.top - 150) <= 2, JSON.stringify(p));
});
test('AVATAR06 persistence: restored position; off-screen saved position falls back to default', { skip: WIN, timeout: 60000 }, async () => {
  const b = await boot({ dir: main.dir });
  try {
    const j = await selftest({ port: b.port, dir: b.dir, args: ['--hold-ms', '300'] });
    assert.ok(Math.abs(j.position_loaded[0] - 200) <= 2 && Math.abs(j.position_loaded[1] - 150) <= 2, JSON.stringify(j.position_loaded));
    const pf = path.join(b.dir, 'avatar.json'), prefs = JSON.parse(fs.readFileSync(pf, 'utf8'));
    fs.writeFileSync(pf, JSON.stringify({ ...prefs, left: -5000, top: -5000 }));
    const k = await selftest({ port: b.port, dir: b.dir, args: ['--hold-ms', '300'] });
    assert.ok(k.position_loaded[0] >= 0 && k.position_loaded[1] >= 0, JSON.stringify(k.position_loaded)); assert.ok(k.events.some((e) => /SAVED_POSITION_OFFSCREEN/.test(e)));
  } finally { await b.close(); }
});
test('AVATAR07 DPI: per-monitor aware (2), physical size = round(DIP × scale) ± 2 px', { skip: WIN }, () => {
  const d = main.dpi; console.log('AVATAR07', JSON.stringify(d));
  assert.equal(d.awareness, 2); assert.ok(Math.abs(d.physical_w - d.expected_w) <= 2); assert.ok(d.size_dip >= 220 && d.size_dip <= 300);
});
const bus = (s) => states(main, 'bus:').filter((x) => x.state === s);
test('AVATAR08 IDLE: #8A2BE2, 0.25, blur 12, no animation, latency ≤ 100 ms', { skip: WIN }, () => {
  const s = bus('IDLE'); assert.ok(s.length >= 2);
  for (const x of s) { assert.equal(x.color, '#8A2BE2'); assert.equal(x.opacity, 0.25); assert.equal(x.blur, 12); assert.equal(x.animating, false); assert.ok(x.latency_ms <= 100, `lat ${x.latency_ms}`); }
});
test('AVATAR09 LISTENING: #B44CFF, 0.95, blur 30, latency ≤ 100 ms', { skip: WIN }, () => {
  const [x] = bus('LISTENING'); assert.ok(x); assert.equal(x.color, '#B44CFF'); assert.equal(x.opacity, 0.95); assert.equal(x.blur, 30); assert.ok(x.latency_ms <= 100);
});
test('AVATAR10 THINKING: pulse at 20 fps from a client post and from the core (/api/ask)', { skip: WIN }, () => {
  const s = bus('THINKING'); assert.ok(s.some((x) => /source|client/.test(x.why) || x.why.includes('client')), 'client'); assert.ok(s.some((x) => x.why.includes('core')), 'core-emitted');
  for (const x of s) { assert.equal(x.animating, true); assert.equal(x.fps, 20); assert.ok(x.latency_ms <= 100); }
});
test('AVATAR11 SPEAKING (bus-only): animated; timer/animation stops on the next IDLE', { skip: WIN }, () => {
  const i = main.states.findIndex((x) => x.state === 'SPEAKING'); assert.ok(i >= 0); assert.equal(main.states[i].animating, true);
  assert.equal(main.states[i + 1].state, 'IDLE'); assert.equal(main.states[i + 1].animating, false);
});
test('AVATAR12 ERROR: amber, never red; IDLE look after 5 s', { skip: WIN }, () => {
  const all = main.states; const i = all.findIndex((x) => x.state === 'ERROR'); assert.ok(i >= 0);
  assert.equal(all[i].color, '#E0A040'); assert.equal(all[i].opacity, 0.6);
  for (const x of all) { const r = parseInt(x.color.slice(1, 3), 16), g = parseInt(x.color.slice(3, 5), 16); assert.ok(!(r > 200 && g < 80), `red ${x.color}`); }
  // whichever fires first: the avatar's own 5 s timer or the core's 5 s ERROR stale guard (bus IDLE from core)
  const back = all[i + 1]; assert.ok(back && back.state === 'IDLE' && (back.why === 'error-timeout' || back.why.startsWith('bus:core')) && back.t_ms - all[i].t_ms >= 4900, JSON.stringify(back));
});
test('AVATAR12b CORE_OFFLINE: core stops ⇒ local amber ERROR (reason CORE_OFFLINE)', { skip: WIN, timeout: 60000 }, async () => {
  const b = await boot(); let closed = false;
  try {
    const j = await selftest({ port: b.port, dir: b.dir, args: ['--hold-ms', '12000', '--backoff-ms', '100'], during: async () => { await sleep(1200); await b.close(); closed = true; } });
    const e = j.states.find((x) => x.why === 'CORE_OFFLINE'); assert.ok(e, JSON.stringify(j.states)); assert.equal(e.state, 'ERROR'); assert.equal(e.color, '#E0A040'); assert.equal(j.core_offline, true);
  } finally { if (!closed) await b.close(); }
});
test('AVATAR13 close/reopen: single instance (exit 3), --close ≤ 3 s, relaunch, no orphan', { skip: WIN, timeout: 60000 }, async () => {
  const b = await boot(), rt = path.join(b.dir, 'avatar', 'runtime.json'), args = ['--var', b.dir, '--port', String(b.port)];
  try {
    for (let round = 0; round < 2; round++) {
      const a = runExe(args); assert.ok(await until(() => fs.existsSync(rt), 10000), 'ready');
      assert.equal(await runExe(args).exit, 3, 'second instance exits 3');
      const t0 = Date.now(); assert.equal(await runExe(['--close', ...args]).exit, 0, '--close'); assert.equal(await a.exit, 0); assert.ok(Date.now() - t0 <= 3000, `close ${Date.now() - t0} ms`);
      assert.equal(fs.existsSync(rt), false, 'runtime.json removed');
    }
    assert.equal(spawned.size, 0, 'no orphan spawned by the test'); if (preexisting === 0) assert.equal(avatarCount(), 0, 'tasklist count 0');
  } finally { await b.close(); }
});
test('AVATAR14 missing asset: placeholder, exit 0, core unaffected', { skip: WIN, timeout: 60000 }, async () => {
  const b = await boot(); const h = () => fetch(`http://127.0.0.1:${b.port}/api/health`).then((r) => r.status);
  try {
    assert.equal(await h(), 200);
    const j = await selftest({ port: b.port, dir: b.dir, args: ['--hold-ms', '300', '--asset', path.join(b.dir, 'nope.png')] });
    assert.equal(j.asset_status, 'MISSING'); assert.equal(await h(), 200);
    const a = await (await b.post('/api/ask?speak=0', { text: 'status das fontes' })).json(); assert.ok(a.answer_text.length > 0);
  } finally { await b.close(); }
});
test('AVATAR startup: READY ≤ 3.0 s from process start (max over all runs)', { skip: WIN }, () => {
  const mx = Math.max(...readyMs); console.log(`AVATAR startup ready_ms max ${mx} over ${readyMs.length} runs`); assert.ok(readyMs.length >= 3 && mx <= 3000, `${mx}`);
});

// ---------- real voice: VOICE06–08 + E2E (R2 §7.2, §7.3) ----------
let rv; // {b, voice, q}
// R2 §7.3 named the Call Wall question; synthetic piper/kokoro speech of "Call Wall" is not recovered by local whisper-small
// ("caluar", "Caloal"), so the injected question uses HIRO, which survives TTS→STT and is answered from the SpotGamma corpus.
// Deviation recorded in RESULT_JARVIS_VISUAL_VOICE_20261004.md. The STT normalizer/router are not touched.
const E2E_Q = 'o que é o HIRO segundo a SpotGamma';
async function realServer() {
  if (rv) return rv;
  const voice = createVoice(cfg, { env: {} }), b = await boot({ voice });
  const natural = { ...resolveProfile(cfg, { JARVIS_VOICE_PROFILE: 'NATURAL' }).profile };
  const parts = []; let sr = 0; for await (const c of voice.synth(toSpeech(E2E_Q), { profile: natural })) { parts.push(c.samples); sr = c.sampleRate; }
  const all = Float32Array.from(parts.flatMap((p) => [...p])), x16 = resample(all, sr, 16000), lead = new Float32Array(4000);
  const q = path.join(b.dir, 'q.f32'); fs.writeFileSync(q, Buffer.from(Float32Array.from([...lead, ...x16, ...lead]).buffer));
  for await (const _ of voice.synth('Pronto.')) { /* warm ROBOTIC TTS */ }
  await voice.stt(new Float32Array(16000)); // warm STT
  return (rv = { b, voice, q });
}
test.after(async () => { if (rv) { await rv.b.close(); rv.voice.close(); } });

test('E2E + VOICE08: avatar cycle LISTENING(client) → THINKING(core) → SPEAKING(client) → IDLE(client); SpotGamma provenance; SPEAKING only after a served chunk', { skip: VOICE_SKIP, timeout: 180000 }, async () => {
  const { b, q } = await realServer(), obs = sse(b.port); await sleep(300); const n0 = obs.events.length;
  let j; try { j = await selftest({ port: b.port, dir: b.dir, args: ['--inject-audio', q, '--exit-after-cycle', '--hold-ms', '500'] }); } finally { obs.close(); }
  const tl = obs.events.slice(n0).map((e) => `${e.state}(${e.source})`); console.log('E2E SSE timeline', tl.join(' → ')); console.log('E2E transcript', j.last_answer?.stt?.text ?? j.last_answer?.transcript);
  assert.deepEqual(tl, ['LISTENING(client)', 'THINKING(core)', 'SPEAKING(client)', 'IDLE(client)']);
  const a = j.last_answer; assert.equal(a.intent, 'KNOWLEDGE_QUERY'); assert.match(a.answer_text, /^Segundo SpotGamma/);
  const sg = a.knowledge.per_source.find((p) => p.source === 'SPOTGAMMA'); assert.equal(sg.status, 'ANSWERED'); const row = sg.rows[0]; assert.ok(row.course && row.lesson && row.timestamp, JSON.stringify(row));
  // VOICE08: SPEAKING after chunk 0 served, before the last chunk ended; IDLE after the last chunk served
  const job = b.srv.jobs.get(a.voice_cycle_id), ev = obs.events.slice(n0), sp = ev.find((e) => e.state === 'SPEAKING'), id = ev.at(-1);
  assert.ok(job.served.length >= 1 && job.served.length === a.audio.parts, `served ${job.served.length}/${a.audio.parts}`);
  assert.ok(sp.t >= job.served[0].at, 'SPEAKING after chunk 0 served'); assert.ok(id.t >= job.served.at(-1).at, 'IDLE after last chunk served');
  assert.ok(new Set(j.speak_opacity).size >= 2, `envelope opacity samples ${j.speak_opacity.length}`); // AVATAR11 own playback
  assert.ok(!j.states.some((s) => s.state === 'ERROR'));
  const c = readCycles(b.dir).rows.find((r) => r.voice_cycle_id === a.voice_cycle_id); assert.equal(c.voice_profile, 'ROBOTIC'); assert.equal(c.mode, 'ptt');
});

test('VOICE06 mute: speak=0, audio null, no /api/audio GET, core THINKING → IDLE', { skip: VOICE_SKIP, timeout: 120000 }, async () => {
  const { b, q } = await realServer(), obs = sse(b.port); await sleep(300); const n0 = obs.events.length;
  let j; try { j = await selftest({ port: b.port, dir: b.dir, args: ['--inject-audio', q, '--exit-after-cycle', '--mute', '--hold-ms', '500'] }); } finally { obs.close(); }
  assert.equal(j.muted, true); assert.equal(j.last_answer.audio, null); assert.equal(b.srv.jobs.get(j.last_answer.voice_cycle_id).served.length, 0);
  assert.deepEqual(obs.events.slice(n0).map((e) => `${e.state}(${e.source})`), ['LISTENING(client)', 'THINKING(core)', 'IDLE(core)']);
  // restore prefs so later runs are unmuted
  const pf = path.join(b.dir, 'avatar.json'); if (fs.existsSync(pf)) fs.writeFileSync(pf, JSON.stringify({ ...JSON.parse(fs.readFileSync(pf, 'utf8')), muted: false }));
});

test('VOICE07a server barge-in: /api/cancel after chunk 0 of a multi-sentence answer stops synthesis (chunks < parts, barge_in=true)', { skip: VOICE_SKIP, timeout: 120000 }, async () => {
  const { b } = await realServer(), base = `http://127.0.0.1:${b.port}`;
  const a = await (await b.post('/api/ask?speak=1', { text: 'o que é gamma segundo a SpotGamma e a MenthorQ' })).json();
  assert.ok(a.audio && a.audio.parts >= 3, `parts ${a.audio?.parts}`);
  assert.equal((await fetch(base + a.audio.chunks_url + '0')).status, 200);
  assert.equal((await b.post('/api/cancel', {})).status, 200);
  const cid = a.voice_cycle_id; assert.ok(await until(() => readCycles(b.dir).rows.some((r) => r.voice_cycle_id === cid), 15000));
  const c = readCycles(b.dir).rows.find((r) => r.voice_cycle_id === cid), job = b.srv.jobs.get(cid);
  console.log(`VOICE07a chunks ${job.chunks.length}/${a.audio.parts}`); assert.equal(c.barge_in, true); assert.ok(job.chunks.length < a.audio.parts);
  await b.post('/api/ui-state', { state: 'IDLE' });
});

test('VOICE07 barge-in: avatar click while speaking stops playback ≤ 150 ms, cancels synthesis, → LISTENING; HUD block unchanged', { skip: VOICE_SKIP, timeout: 120000 }, async () => {
  const { b, q } = await realServer(), obs = sse(b.port); await sleep(300); const n0 = obs.events.length;
  let j; try { j = await selftest({ port: b.port, dir: b.dir, args: ['--inject-audio', q, '--exit-after-cycle', '--barge-in-after-ms', '300', '--hold-ms', '500'] }); } finally { obs.close(); }
  console.log(`VOICE07 barge_stop_ms ${j.barge_stop_ms}`); assert.ok(j.barge_stop_ms >= 0 && j.barge_stop_ms <= 150, `${j.barge_stop_ms}`);
  const tl = obs.events.slice(n0).map((e) => e.state); assert.deepEqual(tl.slice(0, 4), ['LISTENING', 'THINKING', 'SPEAKING', 'LISTENING'], tl.join(','));
  assert.ok(j.events.some((e) => /BARGE_IN/.test(e)) && !j.events.some((e) => /CANCEL_FAILED/.test(e)), 'POST /api/cancel sent');
  const cid = j.last_answer.voice_cycle_id; assert.ok(b.srv.jobs.get(cid).served.length < j.last_answer.audio.parts || j.last_answer.audio.parts === 1, 'remaining chunks abandoned');
  await b.post('/api/ui-state', { state: 'IDLE' });
  // (c) HUD voice barge-in line byte-identical to ade771a
  const line = (s) => s.split('\n').find((l) => l.includes("stopSpeech('barge-in')"));
  const before = execFileSync('git', ['show', 'ade771a:tools/jarvis/public/index.html'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(line(fs.readFileSync(path.join(REPO, 'tools/jarvis/public/index.html'), 'utf8')), line(before));
});

test('E2E MenthorQ typed ask: ANSWERED with video provenance; core THINKING → IDLE', { skip: VOICE_SKIP, timeout: 60000 }, async () => {
  const { b } = await realServer(), obs = sse(b.port); await sleep(300); const n0 = obs.events.length;
  const a = await (await b.post('/api/ask?speak=0', { text: 'o que é gamma segundo a MenthorQ' })).json(); await sleep(200); obs.close();
  const m = a.knowledge.per_source.find((p) => p.source === 'MENTHORQ'); assert.equal(m.status, 'ANSWERED'); assert.ok(m.rows[0].lesson && m.rows[0].video_id);
  assert.deepEqual(obs.events.slice(n0).map((e) => `${e.state}(${e.source})`), ['THINKING(core)', 'IDLE(core)']);
});
