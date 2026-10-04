# PROPOSAL R2 — JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE — 2026-10-04

Revision 2. Supersedes `PROPOSAL_JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE_20261004.md`, which got JEV DIFF **F INCOMPLETE_PROPOSAL** (`req_01a104ab67f17e6887d4eaa726b0b3c4`, F .37 / A .23 / E .16 / G .14). Operator authorisation for this revision: `handoffs/jarvis/OPERATOR_AUTH_JARVIS_VISUAL_VOICE_DIFF2_20261004.md`. Order: `handoffs/jarvis/OPERATOR_ORDER_JARVIS_VISUAL_VOICE_20261004.md`. Handoff: `handoffs/HANDOFF_JARVIS_VISUAL_VOICE_20261004.md`.

Material changes from R1: (1) full window spec with real classes, flags, lifecycle, exit codes, crash handling (§2); (2) exact UI/core contract, with the POST body cut down to `{state, cycle}`, no level field, no free text, SSE one-way only, and stated reconnect, heartbeat, client and timeout limits (§3); (3) concrete DSP defaults, safe ranges and clamping (§4); (4) numeric acceptance limits set before implementation (§5); (5) security/boundary map with structural evidence already collected, plus negative tests (§6); (6) test matrix of 24 tests plus E2E with TYPE, PRECONDITION, ACTION, EXPECTED, PASS and EVIDENCE fields, physical drag declared MANUAL_PHYSICAL (§7); (7) exact rollback (§8); (8) "Abrir HUD" removed so the avatar makes no Process.Start or shell call at all.

Baseline: HEAD/origin `ade771a`. JARVIS skills integration COMPLETE (JEV FINAL A `req_01a104530e39756e9863eeb65c77836b`). Measured perf baseline (ask(), 20 runs, warm): live p50 8.6 ms / p95 11.3 · knowledge p50 93.6 / p95 124.6 · cross-source p50 89.4 / p95 106.1.

## 1. Existing architecture reused (unchanged parts)
- Core `tools/jarvis/server.mjs`: one Node HTTP server on 127.0.0.1:3594. It rejects foreign Host/Origin. POST requires the 48-hex token in `var/jarvis/token`, compared with timingSafeEqual. No new server or port is added; every new route lives on :3594.
- Pipeline untouched: `/api/ask-audio` (f32le 16 kHz) → `voice.vadTrim` (Silero) → `voice.stt` (whisper-small/base) → `answer.ask` → `router.route` → `skills.retrieve` / `tools.TOOLS` (read-only) → grounded answer with provenance → `voice.synth` (sherpa-onnx, piper-faber) per sentence, cancellable → `/api/audio/<cycle>/<n>` WAV chunks. `answer.mjs`, `router.mjs`, `skills.mjs`, `tools.mjs` and `lexicon.mjs` are NOT modified.
- Browser HUD `tools/jarvis/public/index.html` keeps PTT (button/Space), rms voice barge-in, Esc/Stop, typed input and playback. Its only change is 4 fire-and-forget state posts (§3.4). The barge-in block is byte-identical to before.
- Wake word stays disabled (`config/jarvis.json input.wake_word.enabled=false`). Nothing in this proposal reads it.
- Launcher `scripts/jev-stack.mjs start|stop|status` is extended, not replaced.

## 2. AVATAR WINDOW (F-A)
### 2.1 Technology and justification
- Single C# 5 source file `tools/jarvis/avatar/JarvisAvatar.cs` plus `tools/jarvis/avatar/app.manifest`. It is compiled by the csc.exe built into Windows (`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, .NET Framework 4.8 runtime, WPF) into `var/jarvis/avatar/JarvisAvatar.exe` (git-ignored).
- Build script: `tools/jarvis/avatar/build.mjs`. It rebuilds only when sha256(cs+manifest) differs from `var/jarvis/avatar/build.json`.
- References: `WPF\PresentationFramework.dll`, `WPF\PresentationCore.dll`, `WPF\WindowsBase.dll`, `System.Xaml.dll`, `System.dll`, `System.Core.dll`, `System.Drawing.dll` (screen-capture test only), `System.Windows.Forms.dll` (NotifyIcon only), `System.Web.Extensions.dll` (JavaScriptSerializer).
- Justification: zero new dependency (no npm/NuGet, no Electron or Chromium); a native layered window with per-pixel alpha; GPU-composited WPF at render tier 2 (probed); measured probe of a transparent topmost WPF window from this machine: 635 ms. PowerShell is not used at runtime, because a compiled exe starts faster and has no script host.
### 2.2 Process and lifecycle
- One separate process, `JarvisAvatar.exe`. The core never depends on it.
- Single instance: named mutex `Local\JEV_JARVIS_AVATAR`; a second instance exits with code 3.
- Start: `node scripts/jev-stack.mjs start` builds the exe if needed, spawns it detached and writes its pid to `var/stack/avatar.pid`.
- Writes `var/jarvis/avatar/runtime.json` `{pid, hwnd, port, at}` once the window is shown.
- Stop: menu "Sair", tray "Sair", `node scripts/jev-stack.mjs stop` (taskkill /T on the pid) or `JarvisAvatar.exe --close` (PostMessage WM_CLOSE to the hwnd in runtime.json, waits ≤ 3 s).
- Exit codes: 0 normal quit · 2 usage · 3 already running · 4 fatal (crash) · 5 self-test FAIL.
- Crash handling: `AppDomain.CurrentDomain.UnhandledException` and `Application.DispatcherUnhandledException` log type, message and stack (max 2 KB) to `var/jarvis/avatar/avatar.log`, release the mutex and exit 4.
- No auto-restart loop. The core, alpha and jev-obs keep running; `stack:start` again restarts the avatar.
### 2.3 Window, flags and ex-styles (exact)
- `System.Windows.Window` with: `WindowStyle=None` (no WS_CAPTION / WS_SYSMENU / title bar), `ResizeMode=NoResize` (no WS_THICKFRAME), `AllowsTransparency=true` (WPF creates a WS_EX_LAYERED window composited with per-pixel alpha), `Background=Brushes.Transparent`, `Topmost=true` (WS_EX_TOPMOST), `ShowInTaskbar=false`, `ShowActivated=false`, `SizeToContent=Manual`, `UseLayoutRounding=true`.
- In `SourceInitialized`, `SetWindowLongPtr(GWL_EXSTYLE)` adds WS_EX_TOOLWINDOW (0x80), which hides the window from Alt+Tab, and WS_EX_NOACTIVATE (0x08000000), so a click does not steal keyboard focus from the trading platform or editor.
- If test AVATAR05-auto or AVATAR13 shows that NOACTIVATE breaks DragMove or the ContextMenu, NOACTIVATE is dropped and the result recorded. TOOLWINDOW, LAYERED and TOPMOST are mandatory.
- Content: `Grid` → `Image` (`Source=BitmapImage(assets/jarvis/jarvis-avatar.png)`, `CacheOption=OnLoad`, `DecodePixelWidth = 2×size DIP`, `Stretch=Uniform`, `RenderOptions.BitmapScalingMode=HighQuality`) with `Effect = DropShadowEffect{ShadowDepth=0, Color, BlurRadius, Opacity}`, the outer glow that follows the head silhouette.
- Missing asset ⇒ placeholder: an `Ellipse` with a purple stroke and a `TextBlock` "Ω" (no image), plus `asset_status=MISSING` logged.
- Size: 240 DIP default (menu P/M/G = 180/240/300 DIP; persisted; clamped to 160–320).
- Initial position: bottom-right of `SystemParameters.WorkArea`, margin 24 DIP.
### 2.4 Drag and persistence
- `MouseLeftButtonDown` records the point. If the pointer moves ≥ 4 DIP while the button is held, `DragMove()` starts (native move loop); otherwise `MouseLeftButtonUp` is a click (PTT toggle, §3.5).
- `LocationChanged` is debounced 500 ms → atomic write (tmp+rename) of `var/jarvis/avatar.json` `{schema:"jarvis-avatar/v1", left, top, size, muted}`.
- On start the saved position is clamped so ≥ 50 % of the window lies inside `SystemParameters.VirtualScreen*`; otherwise it falls back to the default.
### 2.5 DPI awareness
- `app.manifest` declares `<dpiAware>true/pm</dpiAware>` and `<dpiAwareness>PerMonitorV2</dpiAwareness>` (WPF 4.6.2+ per-monitor support).
- All sizes are in DIPs, so WPF scales automatically, and `DpiChanged` is handled by WPF.
- Self-test reports `VisualTreeHelper.GetDpi(window).DpiScaleX`, `GetDpiForWindow(hwnd)`, `GetWindowRect` physical px and `GetAwarenessFromDpiAwarenessContext(GetWindowDpiAwarenessContext(hwnd))`.
### 2.6 Click-through while idle
- NOT used, because the click is the PTT trigger and a click-through window could not be clicked to talk.
- Native layered-window hit testing already lets clicks on fully transparent pixels pass through to the windows below. AVATAR02b verifies this with WindowFromPoint at a transparent corner, which returns a window other than the avatar.
### 2.7 Tray and menu
- `System.Windows.Forms.NotifyIcon`: Mostrar / Esconder / Sair, so a hidden avatar can be shown again.
- Right-click `ContextMenu`: "Mudo" (checkable, persisted), "Tamanho ▸ P/M/G", "Esconder", "Sair".
- No "Abrir HUD" and no `Process.Start` anywhere. The HUD stays reachable at http://127.0.0.1:3594/ as before.
### 2.8 Asset (canonical path)
- Source: `C:\Users\ADM\Downloads\Avatar Android com Olhos Neon Roxos.png`. It is the only candidate in the bounded search. Real PNG (magic 89504E47), 1254×1254, Format32bppArgb, corners alpha 0, 57.4 % opaque, purple ≈ 19 % of opaque pixels, SHA256 `4CBB518C255B5D2A79057889D4FA08282DBF7EFA4D2289C27964391E94B07AA7`.
- Copied byte-for-byte by code (`fs.copyFileSync`) to **`assets/jarvis/jarvis-avatar.png`** and verified by SHA256 equality. No resize, recolour or regeneration.
- The exe resolves it as `<repo>/assets/jarvis/jarvis-avatar.png`; `--asset <path>` override exists for tests only.

## 3. UI/CORE CONTRACT (F-B)
Transport: HTTP/1.1 on the existing 127.0.0.1:3594. The new module is `tools/jarvis/ui-state.mjs`, with zero imports.

Enum (only allowed values): `IDLE | LISTENING | THINKING | SPEAKING | ERROR`.
### 3.1 GET /api/ui-state (snapshot; read; no token)
Response 200: `{"schema":"jarvis-ui-state/v1","state":"IDLE","seq":17,"cycle":null,"source":"core","at":"2026-10-04T02:00:00.000Z"}`. `cycle` is `jv-[a-f0-9]{8}` or null; `source` is `core` or `client`.
### 3.2 GET /api/events (SSE; server → client only; no token, same Host/Origin checks)
- Headers: `content-type: text/event-stream`, `cache-control: no-store`, `connection: keep-alive`.
- On connect: `retry: 2000`, then one `event: state` carrying the snapshot.
- `event: state` + `data: <same JSON as 3.1>` on every change.
- `event: ping` + `data: {"at":"…"}` every 15 s (heartbeat).
- No other event names. No answer text, transcript, corpus text or level is ever sent.
- Clients: max 8 concurrent; the 9th gets 503 `{"error":"too many ui clients"}`. Clients are removed on `close`.
- The request URL query is ignored; nothing the client sends on this route is read. The channel is one-way, so there are no reverse commands.
### 3.3 POST /api/ui-state (client-owned visual events; token required)
- Body ≤ 256 bytes, `content-type: application/json`, exactly `{"state":"<enum>"}` or `{"state":"<enum>","cycle":"jv-xxxxxxxx"|null}`.
- Validation in this order: token → 401; size > 256 → 413; invalid JSON or not an object → 400; any key other than `state`/`cycle` → 400; `state` not in the enum → 400; `cycle` not null and not matching `^jv-[a-f0-9]{8}$` → 400.
- Response 200 `{"ok":true,"seq":<n>}`.
- Effect, the whole handler: `uiState.set(state, {source:'client', cycle})`. That updates 5 in-memory fields (state, seq, cycle, source, at) and broadcasts to SSE clients. No forwarding, no file write, no voice/answer/tools/skills call, no shell, no tool invocation. Proven by the code block itself and by negative test UI-N (§7.4).
### 3.4 Who emits what (real events only)
| Event | Emitter | Trigger |
|---|---|---|
| THINKING | core | `/api/ask` or `/api/ask-audio` body accepted (before VAD/STT/answer) |
| IDLE | core | cycle finished and no speech will be produced (speak=0, voice unavailable, cancel intent) |
| ERROR | core | 500 in the ask handler, or TTS job ended with `job.err` (text answer is still returned) |
| LISTENING | client (avatar or HUD) | mic capture starts (avatar click / HUD PTT down) |
| SPEAKING | client that plays the audio | first WAV chunk actually starts playing |
| IDLE | client that plays the audio | last chunk ended, or playback stopped (barge-in/Esc/Stop/mute) |

Stale guards are documented safety nets, not the normal flow. THINKING or SPEAKING with no update for 30 s ⇒ core sets IDLE (source core); this covers a client that dies mid-playback. ERROR ⇒ core sets IDLE after 5 s.

HUD changes (4 calls, wrapped in try/catch, fire-and-forget): `startPTT` → LISTENING; `play()` first chunk → SPEAKING; `play()` end and `stopSpeech` → IDLE.
### 3.5 Avatar cycle (uses only existing endpoints)
1. Click → POST LISTENING, then open the mic via winmm `waveInOpen(WAVE_MAPPER, 16000 Hz, mono, 16-bit, CALLBACK_NULL)` with 100 ms buffers polled on a worker thread.
2. Second click, or 15 s (= `server.max_audio_seconds`) → stop. Under 0.25 s ⇒ POST IDLE.
3. Otherwise POST `/api/ask-audio?speak=1` (speak=0 when muted), body f32le, timeout 30 s.
4. Response with `audio` ⇒ GET `/api/audio/<cycle>/<n>` sequentially (timeout 20 s each).
   - Chunk 0 plays ⇒ POST SPEAKING; play via `System.Media.SoundPlayer(MemoryStream).PlaySync()` on the worker.
   - The glow level is computed locally from each chunk's 16-bit PCM RMS in 50 ms windows; a `DispatcherTimer` at 50 ms runs only while speaking.
   - End ⇒ POST IDLE.
5. Click while speaking = barge-in: `SoundPlayer.Stop()`, remaining chunks abandoned, POST `/api/cancel`, then step 1.
6. Answer text is not displayed and never executed.
### 3.6 Timeouts, reconnect, offline
- Avatar SSE reconnect backoff: 1 → 2 → 4 → 8 → 10 s (cap).
- After 3 consecutive failures the avatar shows the ERROR glow locally (reason `CORE_OFFLINE` in the log) and returns to the bus state on reconnect.
- POST /api/ui-state timeout 2 s, never retried (a visual event may be lost; the next event or the stale guard corrects it).
- UI offline (no avatar, no HUD): the bus with 0 clients is a no-op and core answers byte-identically, except the new routes exist. HUD posts fail silently if the core is old or down.

## 4. ROBOTIC VOICE / DSP (F-C)
### 4.1 Where it runs
- New module `tools/jarvis/voice-profile.mjs` (zero imports) exports `resolveProfile(cfg, env)`, `validateProfile(p)` and `applyProfile(samples, sampleRate, p)`.
- It is called in exactly one place, inside `voice.synth()`, on each sentence's Float32 samples after `tts.generateAsync`, so it applies to HUD and avatar alike.
- TTS speed passed to sherpa = `clamp(rate / pitch, 0.5, 2.0)`, which compensates the duration change of the pitch resampling.
- If `applyProfile` throws, the raw samples are used and `profile_error` is recorded in the cycle log (fail-safe).
### 4.2 Config (single central profile, `config/jarvis.json` → `voice`)
```json
"profile": "ROBOTIC",
"profiles": {
  "NATURAL": { "voice": "piper-faber", "rate": 1.0, "pitch": 1.0, "gain": 1.0, "robotic_effect_strength": 0, "eq": { "highpass_hz": 0, "presence_db": 0 }, "compressor": { "enabled": false } },
  "ROBOTIC": { "voice": "piper-faber", "rate": 1.0, "pitch": 0.93, "gain": 1.0, "robotic_effect_strength": 0.25,
               "eq": { "highpass_hz": 90, "presence_hz": 2500, "presence_db": 3, "presence_q": 1.0 },
               "compressor": { "enabled": true, "threshold_db": -18, "ratio": 3, "attack_ms": 5, "release_ms": 80, "makeup_db": 3 },
               "ring_hz": 60, "comb_ms": 6, "limiter_ceiling": 0.89 }
}
```
`JARVIS_VOICE_PROFILE=ROBOTIC|NATURAL` overrides `voice.profile`. An unknown profile falls back to NATURAL with a warning in `/api/status`.
### 4.3 Processing chain (order) and safe ranges (values outside are clamped and reported in `/api/status.voice.profile_warnings`)
| Stage | Parameter | Default ROBOTIC | Safe range |
|---|---|---|---|
| base voice | voice | piper-faber | piper-faber, piper-jeff, kokoro-int8 (installed models only) |
| tempo | rate | 1.00 | 0.80–1.20 |
| pitch (linear-interp resample, also lowers formants ⇒ deeper) | pitch | 0.93 (≈ −1.26 st) | 0.85–1.00 |
| high-pass (biquad 2nd-order Butterworth) | eq.highpass_hz | 90 Hz | 0 (off) or 60–150 |
| presence (biquad peaking) | eq.presence_db @ presence_hz, Q | +3 dB @ 2500 Hz, Q 1.0 | 0–4 dB, 1500–4000 Hz, Q 0.5–2 |
| metallic tint: ring modulation, wet mix = strength × 0.5 | ring_hz | 60 Hz | 30–90 Hz |
| metallic tint: feed-forward comb, mix = strength × 0.5, feedback = strength × 0.6 | comb_ms | 6 ms | 3–10 ms |
| overall effect amount | robotic_effect_strength | 0.25 | 0–0.50 (0 = no ring/comb) |
| compressor (feed-forward peak, soft knee 6 dB) | threshold/ratio/attack/release/makeup | −18 dBFS / 3:1 / 5 ms / 80 ms / +3 dB | −30…−10 / 1–4 / 1–20 / 30–300 / 0–6 |
| gain | gain | 1.0 | 0.5–1.5 |
| peak limiter (hard clip after soft-saturating tanh above ceiling) | limiter_ceiling | 0.89 (−1 dBFS) | 0.7–0.95 |
- No reverb, no strong distortion, no external process (ffmpeg/sox not used), no cloud. All O(n) single-pass on ≤ 70-char sentences.
### 4.4 NATURAL = identity
With `robotic_effect_strength=0`, pitch 1, eq off, compressor off and gain 1, `applyProfile` returns the input array unchanged (same reference) and speed = `voice.tts.speed`. This is the previous behaviour, asserted by VOICE02b.

## 5. NUMERIC ACCEPTANCE (F-D; fixed before implementation)
| Metric | Limit | How measured |
|---|---|---|
| Avatar startup (cached exe) | window shown ≤ 3.0 s from spawn | self-test READY timestamp − spawn time, 3 runs, max |
| Avatar first build | ≤ 15 s | build.mjs wall time |
| Stack start incl. avatar | ≤ 20 s to all health OK + avatar runtime.json | timed `stack:start` (existing waits up to 10 s) |
| Avatar idle CPU | ≤ 0.5 % of one core, mean over 30 s idle | Δ TotalProcessorTime / wall (Get-Process), state IDLE, no animation |
| Avatar memory | private bytes ≤ 150 MB | Get-Process PrivateMemorySize64 after 30 s |
| Core idle overhead | server idle CPU ≤ baseline + 0.2 % core | same method, with 1 SSE client attached |
| State transition (bus) | POST /api/ui-state → SSE received p95 ≤ 50 ms | 50 transitions, Node test client |
| State transition (visual) | SSE received → glow applied p95 ≤ 100 ms | avatar self-test log timestamps |
| DSP added cost | applyProfile p95 ≤ 15 ms per sentence | 30 sentences, piper-faber output |
| TTS first audio | ROBOTIC tts_first_ms p50 ≤ NATURAL p50 × 1.15 + 20 ms | 10 runs each, same sentences |
| Knowledge-query regression | ask() p50 after ≤ p50 before × 1.15 + 2 ms (live, knowledge, cross) | same machine, same run, before = git stash-free baseline numbers re-measured at HEAD ade771a code path via bench loop |
| Intelligibility | ROBOTIC keyword recall ≥ 0.85 and ≥ NATURAL − 0.05 | VOICE03 |

## 6. SECURITY / BOUNDARY MAP (E)
```
avatar process (JarvisAvatar.exe)  ──HTTP 127.0.0.1:3594 only──►  GET /api/events, GET /api/ui-state, GET /api/audio/<cycle>/<n>,
                                                                 POST /api/ui-state {state,cycle}, POST /api/ask-audio, POST /api/cancel
                                                                 ⇒ UI STATE + the existing JARVIS pipeline only
voice DSP (voice-profile.mjs, 0 imports)  ⇒ Float32 samples in → Float32 samples out (synthesized audio only)
PTT/mic (avatar waveIn / HUD getUserMedia) ⇒ f32le → existing /api/ask-audio → VAD → STT → router → answer
knowledge retrieval (skills.mjs → alpha-video ask/lib; tools.mjs → jev-obs/alpha.mjs) ⇒ read-only file reads
```
None of these components can reach order placement, broker APIs, NinjaTrader order paths, AOT/INVICTUS, account mutation, or SpotGamma/MenthorQ capture mutation.
### 6.1 Structural evidence (collected read-only at ade771a)
- JARVIS import graph, complete with non-`node:` imports:
  - server → answer, voice, voice-log
  - answer → router, tools, lexicon, skills
  - tools → `../jev-obs/alpha.mjs` (→ `src/alpha/config.mjs` stateDir only)
  - skills → `../alpha-video/lib.mjs`, `../alpha-video/ask.mjs` (exported `ask` only; its `jevReview` is CLI-only), `../alpha-video/spotgamma/{lib,ask}.mjs`
  - voice → `install-models.mjs` (`MODELS_DIR` constant only; its `execFileSync` runs only inside `install()`/CLI main, never imported into the request path) + `sherpa-onnx-node`
- No JARVIS module imports `src/jev` runtime order code, `nt8/`, IJC/INVICTUS, robo-trade, AOT, capture tools, `http.request`, `https`, `net`, or `fetch`.
- `tools.mjs` exposes only read functions (get_specialist_state, get_field, get_levels, get_history, compare_sources, get_fusion_state, explain_fusion, get_market_snapshot, get_source_health); there are no action tools.
- New modules: `ui-state.mjs` and `voice-profile.mjs` import nothing. The avatar C# references only the assemblies in §2.1. Its only network target is a constant `http://127.0.0.1:` + port (config/env); no `Process.Start`, `System.Diagnostics.Process` (except `GetCurrentProcess`), registry, file writes other than `var/jarvis/avatar.json`, `var/jarvis/avatar/{runtime.json,avatar.log}` and self-test outputs.
### 6.2 Route allowlist after the change (anything else → 404 / 405)
- GET: `/`, `/api/health`, `/api/status`, `/api/cycles`, `/api/audio/jv-xxxxxxxx/<n>`, **`/api/ui-state`**, **`/api/events`**
- POST (token): `/api/ask`, `/api/ask-audio`, `/api/cancel`, **`/api/ui-state`**
- No route names or bodies contain order/trade/account semantics. The avatar is allowed to run 24/7, RTH included, because it is informational only.
### 6.3 Negative tests (part of test/jarvis/ui-state.test.mjs)
- SEC1: static scan of the new and modified JARVIS files and the C# for the forbidden imports/identifiers (`child_process` outside install-models, `https`, `net`, `fetch(` to non-127.0.0.1, `nt8`, `ijc`, `invictus`, `aot`, `robo`, `order`, `broker`, `Process.Start`, `Registry`). PASS = 0 hits (allowlisted exceptions listed by file:line in the test).
- SEC2: POST/GET to `/api/order`, `/api/trade`, `/api/exec`, `/api/nt8`, `/api/account`, `/api/ui-state/../ask` → 404. PUT/DELETE → 405.
- SEC3 (UI-N): POST /api/ui-state variants `{state:"BUY"}`, `{state:"ORDER"}`, `{state:""}`, `{state:"IDLE",cmd:"x"}`, `{state:"IDLE",cycle:"rm -rf"}`, 300-byte body, non-JSON, array, missing token → 400/400/400/400/400/413/400/400/401.
  - A valid post changes only `uiState.seq/state/cycle/source/at`.
  - The voice stub records 0 calls; `jobs.size` is unchanged; the `var/jarvis` directory listing and mtimes are unchanged; ask memory is unchanged.
- SEC4: the SSE stream contains only `retry`, `state` and `ping` lines; after a knowledge ask with corpus text in the answer, the stream bytes contain no substring of `answer_text` or `transcript`.
- SEC5: `package.json` dependencies/devDependencies identical to ade771a (no new dependency).

## 7. TEST MATRIX (G)
Files:
- `test/jarvis/avatar.test.mjs`: builds the exe, runs `JarvisAvatar.exe --selftest <out.json> [opts]` against a real JARVIS server on a test port with a voice stub, and asserts the JSON.
- `test/jarvis/voice-profile.test.mjs`: real sherpa models when installed; otherwise a skip with the reason (they are installed on this machine).
- `test/jarvis/ui-state.test.mjs`: contract + security.

Self-tests open a real window briefly on the operator desktop; no mouse or keyboard input is synthesized.

### 7.1 AVATAR01–14
| ID | TYPE | PRECONDITION | ACTION | EXPECTED | PASS CRITERION | EVIDENCE |
|---|---|---|---|---|---|---|
| AVATAR01 asset load | AUTOMATED | asset copied | Node: sha256 + PNG header; exe: BitmapImage load | same hash as source; PixelFormat Bgra32/Pbgra32; 1254×1254 | hash equal AND alpha channel present AND decode OK | test log: hash, format, size |
| AVATAR02 transparent | AUTOMATED | window shown at known pos | RenderTargetBitmap of window; `Graphics.CopyFromScreen` of a 24×24 px region at a transparent corner with window visible vs hidden; and of the head centre | corner rendered alpha = 0; screen corner unchanged; centre changed | rendered corner alpha max = 0 AND corner mean abs diff ≤ 2/255 AND centre mean abs diff ≥ 20/255 | selftest JSON `transparency{}` |
| AVATAR02b pass-through | AUTOMATED | same | `WindowFromPoint` at transparent corner vs opaque centre | corner ≠ avatar hwnd; centre = avatar hwnd | both conditions | selftest JSON |
| AVATAR03 frameless | AUTOMATED | window shown | `GetWindowLong(GWL_STYLE)`; `GetWindowRect` vs `GetClientRect` | no WS_CAPTION (0xC00000), no WS_THICKFRAME (0x40000), no WS_SYSMENU; window rect = client rect | all flags absent AND rect equality ±1 px | selftest JSON `style` hex |
| AVATAR04 topmost | AUTOMATED | window shown | `GetWindowLong(GWL_EXSTYLE)` | WS_EX_TOPMOST (0x8), WS_EX_LAYERED (0x80000), WS_EX_TOOLWINDOW (0x80) set | all three set | selftest JSON `exstyle` hex |
| AVATAR05 drag | MANUAL_PHYSICAL (+ automated wiring check) | stack running | operator drags the head with the mouse | window follows; new position persisted | operator confirms + `avatar.json` shows new left/top. Automated part: handler wiring (DragMove call reachable from MouseMove when ≥ 4 DIP) and LocationChanged → persist, verified by programmatic Left/Top change | handoff note; selftest `drag_wiring` |
| AVATAR06 persistence | AUTOMATED | clean `avatar.json` | run 1: selftest moves the window to (200,150) DIP via the same persist path, exits; run 2: reads position | restored position | abs(Δleft), abs(Δtop) ≤ 2 DIP; off-screen saved position falls back to default | two selftest JSONs |
| AVATAR07 DPI | AUTOMATED (current scale) + MANUAL_PHYSICAL (other scales) | window shown | read DpiScale, GetDpiForWindow, GetWindowRect, awareness | awareness = PER_MONITOR (2); physical size = round(DIP × scale) | ±2 px AND awareness 2. Other scales (125/150 %) operator-optional, not claimed | selftest JSON `dpi{}` |
| AVATAR08 IDLE | INTEGRATION | avatar connected to the test server SSE | Node POST `{state:"IDLE"}` | glow purple #8A2BE2, opacity 0.25, blur 12; no animation clock running | applied params equal AND `animating=false` AND latency ≤ 100 ms | selftest state log |
| AVATAR09 LISTENING | INTEGRATION | same | POST LISTENING | purple #B44CFF, opacity 0.95, blur 30 | params equal, latency ≤ 100 ms | state log |
| AVATAR10 THINKING | INTEGRATION | same | POST THINKING; also core-emitted THINKING via /api/ask | pulse storyboard (opacity 0.35↔0.85, 1.2 s, DesiredFrameRate 20) running | `animating=true`, frame rate 20; both triggers seen | state log |
| AVATAR11 SPEAKING | INTEGRATION | same | POST SPEAKING; plus avatar-own playback with envelope | envelope timer active; opacity follows level in [0.3, 1.0] | ≥ 2 distinct opacity samples while speaking; timer stops on IDLE | state log |
| AVATAR12 ERROR | INTEGRATION | same | POST ERROR; and stop the server (CORE_OFFLINE) | amber #E0A040, opacity 0.6; never red; IDLE look after 5 s or reconnect | params equal; no colour with R>200 and G<80 | state log |
| AVATAR13 close/reopen | INTEGRATION | avatar running (normal mode) | `--close` → wait; relaunch; `--close` again | exit 0 ≤ 3 s; mutex free; relaunch OK; second instance while running exits 3 | exit codes AND `tasklist` count of JarvisAvatar.exe = 0 at the end (no orphan) | test log |
| AVATAR14 missing asset | INTEGRATION | server running | selftest `--asset <nonexistent>` | placeholder Ω shown; exit 0; `asset_status=MISSING`; server `/api/health` 200 before/after; an ask still answers | all three | selftest JSON + health |

### 7.2 VOICE01–10
| ID | TYPE | PRECONDITION | ACTION | EXPECTED | PASS CRITERION | EVIDENCE |
|---|---|---|---|---|---|---|
| VOICE01 TTS works | AUTOMATED | sherpa + piper-faber installed | `voice.synth(12 fixed sentences)` with ROBOTIC | ≥ 1 chunk each, finite samples | all finite AND peak ≤ 0.95 AND duration ≥ 0.4 s per sentence | test log |
| VOICE02 profile applied | AUTOMATED | same | synth NATURAL vs ROBOTIC of the same sentence; autocorrelation f0 median on voiced frames | f0 ratio ≈ pitch; signals differ | f0 ratio within 0.93 ± 0.03 AND correlation(NATURAL resampled, ROBOTIC) < 0.98; VOICE02b: NATURAL returns the identical array | numbers in log |
| VOICE03 intelligibility | AUTOMATED (objective) + complementary listening sample | whisper-small installed | 12 fixed pt-BR answer-style sentences (incl. Call Wall, Put Wall, gamma, Volatility Trigger, MenthorQ) → synth NATURAL / ROBOTIC → resample 16 kHz → local Whisper STT → normalizeTranscript → folded keyword recall | recall per profile | ROBOTIC mean recall ≥ 0.85 AND ≥ NATURAL − 0.05 | per-sentence table in RESULT; WAV sample saved under `var/jarvis/voice-samples/` (not committed) |
| VOICE04 rate | AUTOMATED | same | duration at rate 1.10 vs 1.00 | ≈ 1/1.10 | ratio within 0.909 ± 8 % | log |
| VOICE05 pitch | AUTOMATED | same | f0 at pitch 0.88 vs 1.00 (same rate) | f0 ratio ≈ 0.88 and duration ratio ≈ 1 (compensated) | f0 ratio 0.88 ± 0.03 AND duration ratio 1 ± 10 % | log |
| VOICE06 mute | INTEGRATION | avatar selftest `--mute --inject-audio` | one avatar cycle | request has speak=0; response `audio=null`; no `/api/audio` GET; state THINKING → IDLE (core) | all | server cycle log + state log |
| VOICE07 barge-in | INTEGRATION | real synth of a 4-sentence answer | (a) server: `/api/cancel` after first chunk; (b) avatar: simulated click handler during SPEAKING; (c) HUD barge-in block unchanged | (a) synth stops: chunks < parts, `barge_in=true` in cycle log; (b) playback stopped ≤ 150 ms, POST cancel seen, state → LISTENING; (c) byte-identical code block | all three | logs + diff check |
| VOICE08 SPEAKING real events | INTEGRATION | avatar inject cycle with real TTS | record server audio-chunk-served times and SSE timeline | SPEAKING arrives after chunk 0 is served and before the last chunk ends; IDLE after the last chunk is served | ordering holds, no SPEAKING without a served chunk | SSE timeline |
| VOICE09 failure fallback | AUTOMATED | voice stub whose synth throws; separately applyProfile forced to throw | /api/ask?speak=1 | HTTP 200 with `answer_text`; bus ERROR; DSP throw ⇒ raw audio + `profile_error` logged | all | test log |
| VOICE10 no cloud | AUTOMATED | — | static scan (SEC1/SEC5) + runtime: the test server with avatar runs with no outbound socket other than 127.0.0.1 (check `server` and avatar connect targets via the code paths) | no new dependency, no external host | 0 hits AND deps identical | test log |

### 7.3 E2E (INTEGRATION, real models)
- Precondition: JARVIS server on a test port with real voice and the real corpora.
- Action: `JarvisAvatar.exe --selftest e2e.json --inject-audio q.f32`, where `q.f32` is piper-faber NATURAL TTS of "o que é a call wall segundo a SpotGamma" resampled to 16 kHz. The click handler path is used, and only the mic source is replaced. A Node SSE observer records the timeline.
- Expected: SSE `LISTENING(client) → THINKING(core) → SPEAKING(client) → IDLE(client)`; response intent `KNOWLEDGE_QUERY`; `knowledge.per_source` SPOTGAMMA `ANSWERED` with citation (course, lesson, timestamp); answer starts "Segundo SpotGamma"; audio played to the end.
- MenthorQ: typed `/api/ask` "o que é gamma segundo a MenthorQ" → `ANSWERED` with video-title provenance; core THINKING → IDLE.
- Pass: exact state order, provenance fields present, no ERROR.
- Evidence: e2e JSON + SSE timeline in RESULT.

### 7.4 Contract tests (ui-state.test.mjs)
- UI1: snapshot schema.
- UI2: SSE first event = snapshot, then changes, ping ≤ 16 s (ping interval injectable for the test).
- UI3: 9th client → 503.
- UI4: core THINKING/IDLE emitted by /api/ask speak=0.
- UI5: stale guard (injectable 30 s → test 300 ms).
- UI-N / SEC1–SEC5: as in §6.3.

### 7.5 Regressions (unchanged commands; pre-existing failures reported separately; no test weakened)
`npm run test:jarvis` (core 8, skills SK1–SK11, voice-server, plus new files) · `npm run test:alpha` · `npm run test:alpha-video` (incl. spotgamma-course tests in the same glob as recorded in the previous loop) · `npm run test:rotation` · `npm run test:jev-finish` · `npm run test:jev-obs` · JEV runtime `node --test test/jev/*.test.mjs` (I03 pre-existing excluded as before) · `npm run smoke`.

## 8. ROLLBACK (exact)
- Added files:
  - `assets/jarvis/jarvis-avatar.png`
  - `tools/jarvis/avatar/JarvisAvatar.cs`
  - `tools/jarvis/avatar/app.manifest`
  - `tools/jarvis/avatar/build.mjs`
  - `tools/jarvis/ui-state.mjs`
  - `tools/jarvis/voice-profile.mjs`
  - `test/jarvis/avatar.test.mjs`
  - `test/jarvis/voice-profile.test.mjs`
  - `test/jarvis/ui-state.test.mjs`
  - handoff/RESULT docs
- Modified files:
  - `tools/jarvis/server.mjs`: bus routes and emits
  - `tools/jarvis/voice.mjs`: profile call in synth plus speed formula
  - `tools/jarvis/public/index.html`: 4 posts
  - `config/jarvis.json`: `voice.profile`, `voice.profiles`, `avatar {enabled, size}`
  - `scripts/jev-stack.mjs`: avatar service
  - `package.json`: scripts `jarvis:start` = `node scripts/jev-stack.mjs start`, `jarvis:avatar` = `node tools/jarvis/avatar/build.mjs --run`; no dependency change
- Disable avatar: `config/jarvis.json avatar.enabled=false` or env `JARVIS_AVATAR=0` (jev-stack skips it); stop now: menu Sair, or `npm run stack:stop`.
- Disable ROBOTIC: `voice.profile="NATURAL"` or `JARVIS_VOICE_PROFILE=NATURAL`. Output is byte-identical to before (§4.4, VOICE02b).
- Return to the ade771a JARVIS: `git revert` the implementation commits (avatar, voice, tests). Skills, corpora and the core answer path (answer/router/skills/tools/lexicon) are never modified, so they are unaffected. Delete `var/jarvis/avatar/`, `var/jarvis/avatar.json` and `var/jarvis/voice-samples/` (untracked runtime files).

## 9. Minimal scope (confirmed)
- No Electron, no parallel project, no new server or port, no voice-pipeline rewrite (VAD/STT/router/retrieval/answer untouched; one DSP call added after TTS), no skills/corpora change, no trading/AOT/INVICTUS/NT8/capture change, no cloud.
- TRADING_MUTATIONS = 0.

## 10. Commits (after FINAL = A)
1. floating avatar: asset, avatar/*, ui-state.mjs, server bus routes, HUD posts, jev-stack, package.json, config avatar block
2. robotic voice integration: voice-profile.mjs, voice.mjs, config voice profiles
3. tests: three new test files
4. handoff/result

Explicit paths only; unrelated working-tree changes are preserved. Push if allowed; otherwise PUSH_PENDING_OPERATOR.
