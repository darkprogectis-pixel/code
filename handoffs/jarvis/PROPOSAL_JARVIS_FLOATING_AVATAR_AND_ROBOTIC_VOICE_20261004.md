# PROPOSAL — JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE — 2026-10-04

Order: `handoffs/jarvis/OPERATOR_ORDER_JARVIS_VISUAL_VOICE_20261004.md`. Handoff: `handoffs/HANDOFF_JARVIS_VISUAL_VOICE_20261004.md`.
Baseline: HEAD/origin ade771a (skills integration COMPLETE, JEV FINAL A req_01a104530e39756e9863eeb65c77836b).

## 1. Discovered architecture (real paths)
- Core: `tools/jarvis/server.mjs` Node http 127.0.0.1:3594 (Host/Origin checks, token `var/jarvis/token` for POST). Routes: GET `/` HUD, `/api/health`, `/api/status`, `/api/cycles`, `/api/audio/<cycle>/<n>` (WAV per sentence); POST `/api/ask` (text), `/api/ask-audio` (f32le 16 kHz → server VAD trim → STT), `/api/cancel` (stops synthesis).
- Pipeline (unchanged by this proposal): text/voice → VAD (silero, server) → STT (whisper-small, fallback base) → `router.mjs` intent → `skills.mjs` retrieval / Alpha live state → `answer.mjs` grounded answer with provenance → TTS `voice.mjs` (sherpa-onnx, piper-faber default, piper-jeff, kokoro-int8) streamed per sentence, cancellable.
- Client: browser HUD `tools/jarvis/public/index.html` owns mic (getUserMedia), PTT (button/Space), rms barge-in while speaking, Esc stop, typed input, chunk playback.
- Wake word disabled (config, licence) — stays disabled. Launcher: `scripts/jev-stack.mjs start|stop|status` (jev-obs, alpha, jarvis).
- No desktop UI exists. Available locally: .NET Framework 4.x `csc.exe` + WPF (Windows built-in), ffmpeg (not needed), no sox. All 7 voice models installed.

## 2. Asset
- Exactly one compatible candidate found (bounded search: Downloads, Desktop, Pictures, project): `Downloads\Avatar Android com Olhos Neon Roxos.png`, real PNG 1254×1254 ARGB, transparent corners (alpha 0), opaque 57 %, purple neon ≈ 19 % of opaque pixels, SHA256 4CBB518C…B07AA7.
- Copied byte-for-byte by code to `assets/jarvis/jarvis-avatar.png` (hash verified, no visual modification). Missing asset ⇒ avatar draws a neutral purple Ω placeholder and logs `AVATAR_ASSET_MISSING`; core unaffected.

## 3. UI architecture (no Electron, no new runtime, no new server)
- One C# 5 source `tools/jarvis/avatar/JarvisAvatar.cs` compiled on demand by the Windows built-in `csc.exe` (.NET Framework 4.x + WPF) into `var/jarvis/avatar/JarvisAvatar.exe` (cached by source hash; `tools/jarvis/avatar/build.mjs`). Zero npm/NuGet dependencies.
- Window: WPF `WindowStyle=None`, `AllowsTransparency=true`, transparent background (per-pixel alpha layered window; transparent pixels are click-through natively), `Topmost`, `ShowInTaskbar=false`, `ResizeMode=NoResize`. Initial size 240 DIP (WPF DIPs ⇒ Windows DPI scaling respected), bottom-right of the work area; drag (DragMove); position/size/mute persisted in `var/jarvis/avatar.json`.
- Interactions: left click (without drag) = PTT toggle (click to listen, click to send; auto-send at 15 s; click while speaking = barge-in: stop playback + `/api/cancel` + listen). Right-click menu: Mudo, Tamanho P/M/G (180/240/300 DIP), Esconder (tray icon to show again), Abrir HUD, Sair. Tray NotifyIcon (Mostrar/Sair). No dashboard.
- Click-through while idle: NOT enabled, because the click is the PTT trigger; transparent pixels already pass clicks through (documented gap).
- Audio in the avatar: mic via winmm waveIn (16 kHz mono 16-bit, P/Invoke) ⇒ POST `/api/ask-audio?speak=1` (the existing endpoint: server VAD/STT/router/retrieval/TTS untouched); playback of the existing `/api/audio/<cycle>/<n>` WAV chunks via `System.Media.SoundPlayer` (Stop() for interruption). The browser HUD keeps working unchanged in parallel (PTT, VAD, barge-in, typed input).

## 4. State machine (real events, no fictitious timers)
- New tiny module `tools/jarvis/ui-state.mjs`: states IDLE/LISTENING/THINKING/SPEAKING/ERROR + level 0..1 + seq; subscribers.
- Server: GET `/api/ui-state` (snapshot) and GET `/api/events` (SSE, state names/level/cycle id only, no corpus text, same Host/Origin checks); POST `/api/ui-state` (token) for client-owned events (LISTENING start, playback SPEAKING begin/level/end, client ERROR).
- Server-emitted: THINKING when an ask/ask-audio body is accepted; IDLE when a cycle finishes without speech; ERROR on 500/voice failure (e.g. TTS failure ⇒ ERROR then text answer still returned).
- Client-emitted (whoever plays the audio — avatar or HUD): LISTENING on capture start; SPEAKING on first chunk playback; level = per-chunk RMS envelope (≈ 20 updates/s, only while speaking); IDLE on playback end / stop. HUD gets 4 one-line `post('/api/ui-state')` calls (no behaviour change).
- Avatar visuals: outer purple glow (WPF DropShadowEffect, depth 0) on the head + opacity. IDLE: dim glow, NO animation (zero render loop; optional ultra-slow pulse OFF by default). LISTENING: intense purple. THINKING: soft pulse (storyboard, DesiredFrameRate 20). SPEAKING: glow follows the audio envelope (timer only while speaking). ERROR: discrete amber glow, back to IDLE after 4 s (no aggressive red). Identity (image) never changes.

## 5. Robotic voice (local, existing TTS)
- Base voice: existing `piper-faber` (pt-BR male, current default). No new model, no cloud.
- Single central profile in `config/jarvis.json` → `voice.profile = "ROBOTIC"` (`JARVIS_VOICE_PROFILE` env override) and `voice.profiles.{ROBOTIC,NATURAL}` with `voice, rate, pitch, gain, robotic_effect_strength` (+ `ring_hz`, `comb_ms`). NATURAL = identity (rollback by config).
- New pure-JS DSP `tools/jarvis/voice-profile.mjs` applied inside `voice.synth()` per sentence (one place for HUD and avatar): pitch lowered by resampling (ratio `pitch`, e.g. 0.92) with duration compensated through the TTS speed (`speed = rate / pitch`); high-pass ~90 Hz; subtle metallic colour = ring modulation (mix ∝ strength) + short comb (≈7 ms, low feedback); soft compressor + `gain` + peak limiter. O(n), no reverb, no heavy distortion.

## 6. Startup / stop
- `scripts/jev-stack.mjs` extended (existing launcher): new service `avatar` (built if needed, spawned detached, pid file, stopped by `stop`). ONE command: `npm run stack:start` (alias `npm run jarvis:start`) ⇒ jev-obs + alpha + JARVIS core/voice + floating avatar. Stop: avatar menu Sair (avatar only) or `npm run stack:stop` (all).
- Fail-safe: avatar build/spawn failure is logged, other services keep running; avatar retries SSE when core is down (shows ERROR glow, no crash); TTS failure ⇒ text answer still returned; asset missing ⇒ placeholder.

## 7. Security
- Avatar/voice layer have no order/trading/account/config-mutation paths; the only new POST is `/api/ui-state` (token, accepts an enum state + numeric level; anything else 400). Corpus/skill text is UNTRUSTED_EVIDENCE and never reaches a shell; the avatar executes nothing from answers. TRADING_MUTATIONS = 0.

## 8. Minimal files
NEW: `assets/jarvis/jarvis-avatar.png`, `tools/jarvis/avatar/JarvisAvatar.cs`, `tools/jarvis/avatar/build.mjs`, `tools/jarvis/ui-state.mjs`, `tools/jarvis/voice-profile.mjs`, `test/jarvis/avatar.test.mjs`, `test/jarvis/voice-profile.test.mjs`.
MODIFIED: `tools/jarvis/server.mjs` (state bus routes + emits), `tools/jarvis/voice.mjs` (profile application in synth), `tools/jarvis/public/index.html` (4 state posts), `config/jarvis.json` (profile), `scripts/jev-stack.mjs` (avatar service), `package.json` (jarvis:start, jarvis:avatar, test:jarvis unchanged glob).

## 9. Tests
- AVATAR01–14 via `JarvisAvatar.exe --selftest <json>` (real window: ex-style WS_EX_LAYERED/TOPMOST, no caption, RenderTargetBitmap corner alpha 0 / centre opaque, state transitions + latency, persistence write/reload, close/reopen, missing asset fallback, DPI report; drag via the same move/persist handler — physical mouse drag not automated on the operator desktop: reported as such).
- VOICE01–10: synth works with ROBOTIC; profile measurably applied (spectral centroid / pitch shift vs NATURAL); intelligibility objective = TTS→profile→Whisper STT round trip keyword recall ROBOTIC vs NATURAL; rate/pitch param effect on duration/pitch; mute (avatar requests speak=0); cancel mid-synthesis; SPEAKING begin/end events; TTS failure ⇒ text + ERROR; no network/cloud deps (static scan).
- E2E: server on a test port + real avatar exe with `--inject-audio` (a TTS-generated "onde fica a call wall segundo a SpotGamma" in place of the mic) ⇒ timeline LISTENING→THINKING→SPEAKING→IDLE from SSE + provenance present (SpotGamma course citation) + MenthorQ question.
- Regressions: jarvis (incl. SK1–SK11), alpha, alpha-video, spotgamma-course, rotation, jev-finish, jev-obs, jev-runtime; pre-existing failures kept separate; no test weakened.
- Perf: startup, idle CPU (avatar process CPU over 30 s idle), memory, voice latency (tts_first_ms NATURAL vs ROBOTIC), state transition latency, knowledge latency vs baseline (8.6 / 94 / 89 ms).

## 10. Rollback
- `voice.profile = "NATURAL"` restores the previous voice exactly; not starting the avatar (or removing the stack entry) restores the previous runtime; all changes are additive commits revertible with `git revert`.

## 11. Zero trading mutation
- No file outside `tools/jarvis`, `assets/jarvis`, `config/jarvis.json`, `scripts/jev-stack.mjs`, `package.json`, `test/jarvis`, handoffs. No AOT/INVICTUS/NT8/capture/skills/corpora change.
