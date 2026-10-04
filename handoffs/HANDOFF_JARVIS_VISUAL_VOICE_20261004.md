# HANDOFF — JARVIS VISUAL (floating avatar) + ROBOTIC VOICE — 2026-10-04

Order (verbatim, saved by session 2be92cfb): `handoffs/jarvis/OPERATOR_ORDER_JARVIS_VISUAL_VOICE_20261004.md`.
Proposal: `handoffs/jarvis/PROPOSAL_JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE_20261004.md` (to write). RESULT: `handoffs/jarvis/RESULT_JARVIS_VISUAL_VOICE_20261004.md` (at the end).
Scope: JARVIS UI/voice layer only; read-only; zero trading; skills/corpora/capture/AOT/INVICTUS untouched; no cloud/TTS service.
Lineage: 2be92cfb (order received, rotated) → ab190ac4 (discovery, rotated at CEILING_BREACH caused by an image Read) → 95e94057 (this).
**WARNING for successors: never Read the avatar PNG (or screenshots) with the Read tool — the base64 image blew the rotation projection. Verify images by pixel code only.**

## Baseline
- HEAD/origin = ade771a (JARVIS skills integration COMPLETE, JEV FINAL A req_01a104530e39756e9863eeb65c77836b).
- Perf baseline: live p50 8.6 ms · knowledge p50 93.6 ms · cross-source p50 89.4 ms.

## State log
### 1. Discovery (done, read-only)
- Architecture: Node server `tools/jarvis/server.mjs` (127.0.0.1:3594, token `var/jarvis/token`, routes GET / (HUD), /api/health, /api/status, /api/cycles, /api/audio/<cycle>/<n>; POST /api/ask, /api/ask-audio (f32le 16 kHz), /api/cancel). HUD `tools/jarvis/public/index.html` (browser: mic getUserMedia, PTT button/Space, rms barge-in, chunk playback, Esc stop).
- Voice: `tools/jarvis/voice.mjs` sherpa-onnx-node — VAD silero (server vadTrim), STT whisper-small/base, TTS piper-faber (default) / piper-jeff / kokoro-int8 sid 42; per-sentence streaming synth with cancel(). Models in %LOCALAPPDATA%\jev-jarvis\models (all 7 installed).
- Config `config/jarvis.json` (input PTT, wake_word disabled). Launcher exists: `scripts/jev-stack.mjs start|stop|status` (jev-obs :3593, alpha service, jarvis :3594). npm: `jarvis`, `test:jarvis`.
- No desktop UI exists. ffmpeg present (winget), sox absent. .NET Framework WPF available via PowerShell 5.1.
- Avatar: exactly one candidate `C:\Users\ADM\Downloads\Avatar Android com Olhos Neon Roxos.png` — real PNG 1254×1254 Format32bppArgb, corners alpha 0, opaque 57.4 %, purple ≈ 19 % of opaque, bbox (102,30)-(1146,1236), SHA256 4CBB518C255B5D2A79057889D4FA08282DBF7EFA4D2289C27964391E94B07AA7. (Visually confirmed by ab190ac4 as the chosen robotic head.)

### 2. Proposal + JEV DIFF (done)
- Proposal written: `handoffs/jarvis/PROPOSAL_JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE_20261004.md` (sha16 8430e8a2be5a6d3c): WPF avatar compiled by built-in .NET Fx csc (no Electron/npm), SSE state bus on the existing server, pure-JS ROBOTIC DSP profile over piper-faber inside voice.synth, avatar service in scripts/jev-stack.mjs, tests AVATAR01–14 / VOICE01–10 / E2E.
- Loop `jf-20261004020818-3397a3` started (jev-diff required).
- **JEV DIFF = F INCOMPLETE_PROPOSAL** conf 0.26 `req_01a104ab67f17e6887d4eaa726b0b3c4` (jev-1.13.0, 2026-10-04T02:08:24Z) — F .37 / A .23 / E .16 (SCOPE_OR_LIVE_SAFETY_VIOLATION) / G .14 (TEST_COVERAGE_INCOMPLETE) / C .05 / D .03 / B .01 / H .01. Not to be repeated.
- Loop auto-BLOCKED (JEV_REJECTED). Per jev-finish rule (JEV ≠ A ⇒ stop, edit nothing): NO code written, asset NOT copied yet, zero project files modified besides this handoff and the proposal.

### 3. BLOCKED — awaiting operator
- Unblock options (operator decision): (a) authorise a revised proposal + a new JEV DIFF (address F: likely more detail on the C# window code/ex-styles, SSE contract, DSP parameters and numeric acceptance thresholds, exact test assertions; E: show that the new POST /api/ui-state and the avatar mic/playback cannot touch trading/order paths and that the avatar does not run during RTH-critical windows unless started; G: list per-test acceptance criteria and which ones are simulated, e.g. physical drag); (b) cancel the mission.
- Successor: do NOT re-run the JEV DIFF on the same proposal and do NOT edit code without operator order.

### 4. Operator authorisation → R2 → JEV DIFF_2 = A
- Authorisation (verbatim): `handoffs/jarvis/OPERATOR_AUTH_JARVIS_VISUAL_VOICE_DIFF2_20261004.md` (revise + ONE new DIFF; if A continue to the end without returning).
- Proposal R2 (canonical, implement THIS): `handoffs/jarvis/PROPOSAL_JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE_R2_20261004.md` (sha16 526350230f9740f4).
- New loop `jf-20261004021740-263ae5` (old 3397a3 terminal BLOCKED).
- **JEV DIFF_2 = A SAFE_TO_APPLY** conf 0.65 `req_01a104b3e6477538a60ec9c35b3efe81` (jev-1.13.0, 2026-10-04T02:17:41Z) — A .69 / F .08 / E .08 / G .05 / D .04 / B .02 / C .02 / H .02. Not to be repeated.
- Mitigation for F/E residue: implement exactly R2 §2–§8; SEC1–SEC5 negative tests mandatory.

### 5. EXECUTE (in progress, loop jf-20261004021740-263ae5 stage EXECUTE) — NOTHING committed yet
Done (uncommitted):
- `assets/jarvis/jarvis-avatar.png` copied, SHA256 equal (4CBB518C…B07AA7).
- NEW `tools/jarvis/ui-state.mjs` (enum, parseUiPost, createUiState with stale 30 s / error 5 s guards).
- `tools/jarvis/server.mjs`: imports ui-state; options `ui, sseMax=8, pingMs=15000`; GET /api/ui-state, GET /api/events (SSE retry/state/ping); POST /api/ui-state (256 B limit, parseUiPost, set only); THINKING on ask/ask-audio accept, IDLE when no speech, ERROR on 500 / TTS err; `job.served[]` chunk timestamps; rec.voice_profile/profile_error; srv.ui, srv.sse; srv.close ends SSE. Import OK; voice-server.test 8/8 (one run hit the pre-existing real-voice flake, then 8/8 twice).
- NEW `tools/jarvis/voice-profile.mjs` (validate/resolve/applyProfile/ttsSpeed/isIdentity); DSP p95 6 ms for 4 s audio. `tools/jarvis/voice.mjs`: profile resolved in createVoice (opt `env`), status().profile/profile_warnings, synth(text,{engine,profile}), speed=ttsSpeed, applyProfile per chunk with fallback, chunk fields profile/dsp_ms/profile_error. Smoke: ROBOTIC VOICE_READY piper-faber, peak 0.705.
- `config/jarvis.json`: voice.profile=ROBOTIC + profiles NATURAL/ROBOTIC (R2 §4.2) + `avatar {enabled,size_dip:240,asset}`.
- `tools/jarvis/public/index.html`: uiState() helper + LISTENING (startPTT), SPEAKING (first chunk start), IDLE (play end, stopSpeech, too short). Barge-in block untouched.
- NEW `tools/jarvis/avatar/app.manifest` (PerMonitorV2) and `tools/jarvis/avatar/JarvisAvatar.cs` (written, NOT yet compiled).
NEXT EXACT:
1. Write `tools/jarvis/avatar/build.mjs` (csc Framework64 v4.0.30319, /target:winexe /win32manifest, refs WPF\PresentationFramework/PresentationCore/WindowsBase, System.Xaml, System.Drawing, System.Windows.Forms, System.Web.Extensions; out var/jarvis/avatar/JarvisAvatar.exe; hash cache build.json; `--run` spawns). Compile, fix errors.
2. `scripts/jev-stack.mjs`: avatar service (cmd = exe, skip if config avatar.enabled=false or JARVIS_AVATAR=0; build first); package.json scripts jarvis:start / jarvis:avatar.
3. Tests: test/jarvis/ui-state.test.mjs (UI1–5, SEC1–5), voice-profile.test.mjs (VOICE01–05,09,10), avatar.test.mjs (AVATAR01–14, VOICE06–08, E2E with --inject-audio). Selftest CLI: `--selftest out.json --var <dir> --port N --hold-ms N --pos x,y --asset p --inject-audio f.f32 --exit-after-cycle --barge-in-after-ms N --mute --backoff-ms N`; `--close`.
4. Perf, regressions, recheck, RESULT, JEV FINAL, commits (R2 §10), push.
- 5.2 (session 95e94057 soft-stop): `scripts/jev-stack.mjs` avatar service DONE (native entry, avatarEnabled(), build+spawn fail-safe, stop via `--close` then taskkill); package.json `jarvis:start`, `jarvis:avatar` DONE. NEW `test/jarvis/ui-state.test.mjs` (UI1–UI5, SEC1–SEC5): last run 8/10 PASS (bus p95 18 ms); two fixes applied after it (SEC2 path `/api/ui-state/x` instead of a fetch-normalised `..` path; SEC1 strips `//` comment lines of the C# before scanning) — RE-RUN NEEDED: `node --test test/jarvis/ui-state.test.mjs`.
- NEXT: voice-profile.test.mjs (VOICE01–05, 09, 10; VOICE03 whisper round trip, 12 sentences, recall ≥ 0.85 and ≥ NATURAL−0.05), avatar.test.mjs (AVATAR01–14 + VOICE06–08 + E2E; see the smoke script pattern: createJarvisServer port 0, spawn exe `--selftest out --var dir --port N --hold-ms`, wait for `<dir>/avatar/runtime.json`, POST states, parse JSON), then perf/regressions/recheck/RESULT/FINAL/commits.
- 5.1 avatar compiled (build.mjs written), smoke selftest PASS all flags/transparency/dpi/states (latency ≤ 8 ms); WS_SYSMENU now stripped. Next: jev-stack + package.json, then the 3 test files.
- 5.3 (session aea29aeb): ui-state.test 10/10. NEW `test/jarvis/voice-profile.test.mjs` (VOICE00,01,02,02b,03a,03b-todo,04,05,09,10) all pass except VOICE03b = preregistered absolute recall 0.85 NOT met (ROBOTIC 0.743, NATURAL baseline 0.778 with whisper-small; relative criterion PASS) — kept as visible `todo`, DEVIATION for RESULT. NEW `test/jarvis/avatar.test.mjs` (AVATAR00–14, 12b, startup, E2E+VOICE08, VOICE06, 07a, 07, MenthorQ E2E) all pass. Product fix: avatar playback PlaySync→Play+ManualResetEvent wait (SoundPlayer.Stop blocked 2.4 s; barge stop now 8–15 ms). DEVIATION: E2E injected question = "o que é o HIRO segundo a SpotGamma" (synthetic "Call Wall" not recovered by whisper). Cycle mode for avatar audio = `ptt`. NEXT: perf (R2 §5: idle CPU/mem/core overhead/TTS first audio/knowledge regression), regressions §7.5, recheck, RESULT, JEV FINAL, commits, push.
- 5.4 (aea29aeb, PREPARE 200k): avatar.test 24/24 (full file). Perf R2 §5 ALL PASS (script scratchpad perf.mjs; baseline worktree `<scratchpad>/base-ade771a` — remove with `git worktree remove` before commit): avatar idle CPU 0 %, 106 MB; core+SSE 0 % (base 0.31); TTS first ROBOTIC 140.1 vs NATURAL 141.8 ms; ask p50 live/knowledge/cross 1.50/66.11/109.66 vs base 1.57/66.98/110.32. Stack-start live NOT measured: running stack (jarvis pid 80376, old code, /api/ui-state 404) — restart needs operator order. FIXED `scripts/jev-stack.mjs` literal-newline syntax error (predecessor). RESULT drafted `handoffs/jarvis/RESULT_JARVIS_VISUAL_VOICE_20261004.md` (placeholders REGRESSIONS_PLACEHOLDER, JEV_PLACEHOLDER). Regressions running: test:jarvis 70 pass + 1 todo, test:alpha 83/83, rest pending. NEXT: fill regressions → finish.mjs test registrations + recheck → stage JEV_FINAL → ONE jev-diff --kind final --proposal RESULT → commits (R2 §10, explicit paths) → push → finish complete.
- 5.5 (aea29aeb, WARNING 221k): regressions background task output `C:/Users/ADM/AppData/Local/Temp/claude/C--Users-ADM-Claude-JEV-code/aea29aeb-7ac8-4853-b31b-7e6f97697532/tasks/bb56eqd60.output` (test:jarvis 71 = 70 pass + 1 todo VOICE03b, 0 fail; test:alpha 83/83; alpha-video/rotation/jev-finish/jev-obs/jev runtime/smoke still running — if the file is incomplete, re-run those). Loop jf-20261004021740-263ae5 still stage EXECUTE, no tests registered yet. Successor: register with `node tools/jev-finish/finish.mjs test --name <N> --cmd "<cmd>"` (ui-state, voice-profile, avatar, test:jarvis, test:alpha, test:alpha-video, test:rotation, test:jev-finish, test:jev-obs, jev runtime excl. I03, smoke) → fill RESULT REGRESSIONS_PLACEHOLDER → recheck → stage JEV_FINAL → ONE `node tools/jev-finish/jev-diff.mjs --kind final --proposal handoffs/jarvis/RESULT_JARVIS_VISUAL_VOICE_20261004.md` → fill JEV_PLACEHOLDER → `git worktree remove --force <scratchpad>/base-ade771a` → commits R2 §10 (explicit paths; include scripts/jev-stack.mjs, package.json in commit 1) → push → complete.

### 6. RECHECK / JEV FINAL / COMMITS (session d3960349, loop jf-20261004021740-263ae5)
- Tests registered in loop `jf-20261004021740-263ae5`: jarvis-visual-voice (`node --test --test-concurrency=1 --test-skip-pattern="real voice models" "test/jarvis/*.test.mjs"`, 69 pass + 1 todo VOICE03b), regress-alpha 83, regress-alpha-video-excl-AV22-worktree 55, regress-rotation 22, regress-jev-finish 29, regress-jev-obs 18, regress-jev-runtime 60, smoke PASS.
- Fixes found while testing, all in test measurement (thresholds unchanged): (1) the JARVIS files run serially, because VOICE02b DSP p95 measured 22.7 ms under CPU contention from parallel test files (10.2 ms in isolation); (2) piper output is stochastic, so VOICE02/03a/04/05 now compare means of 3 syntheses per arm (before, VOICE03a failed once at 0.722 vs 0.819 and VOICE05 once at a duration ratio of 1.111); (3) the pre-existing `real voice models` flake has the same rate on both profiles (NATURAL 1/12, ROBOTIC 1/12), so it is skipped as earlier loops did.
- **JEV RECHECK = PASS** (`finish.mjs recheck`, all 8 suites).
- **JEV FINAL = A COMPLETE_AND_VERIFIED** `req_01a10664e4ab7bf1b1d6a7079f2ab885` conf 0.17. Probabilities: A .27 / C .24 / F .20 / G .11 / H .09 / B .05 / D .03 / E .01 (narrow margin, recorded as is; single run).
- Baseline worktree `base-ade771a` removed.
- Commits: `55b5819` avatar · `8d6cb88` voice · `ec8aaa6` tests · docs commit. After the commits, AV22 PASS (alpha-video 56/56).
- Push: PUSH_RESULT_PLACEHOLDER
- Not done (operator order needed): restart of the running stack (jarvis pid 80376, old code) to measure live stack start and to give the live :3594 the state bus. Command: `npm run stack:stop && npm run jarvis:start`.
- State: RECHECK PASS, waiting for `finish.mjs complete`.
