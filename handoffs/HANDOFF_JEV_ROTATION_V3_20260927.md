# HANDOFF — JEV ROTATION CONTROLLER V3 (automatic successor) — 27/09/2026

Supersedes the rotation flow of `HANDOFF_JEV_ROTATION_V2_20260924.md` (measurement/blocking kept; manual `/exit` + relaunch removed).

| | |
|---|---|
| JEV_ROTATION_V3 | **IMPLEMENTED — automatic successor, no operator action** |
| Thresholds (absolute tokens) | PREPARE 200 000 · WARNING 220 000 · SOFT_STOP 235 000 · HARD_ROTATION 240 000 · CEILING 250 000 |
| Tests | `npm run test:rotation` **17/17** · `npm test` **122/122** · `install-hooks --verify` **PASS** |
| Live E2E (real window) | `npm run test:rotation:live` **PASS 12/12** · real `claude -p` predecessor → hook → wt window → successor **PASS** |
| Uncommitted | yes (see §6) |

## 1. Root cause of the failure (proved)

Session `9f12a31f-24e6-43f9-8df5-1998dfff90e7` (claude.exe PID 46652, parent powershell 20896, config `C:\Users\ADM\.claude-darkprogectis-jev`, cwd repo). Evidence: `jev-rotation/events.jsonl`, `state/9f12a31f….json`, transcript `projects/C--Users-ADM-Claude-JEV-code/9f12a31f….jsonl`.

1. **V2 had no spawn code at all.** `controller.mjs`/`hook.mjs` only measured, blocked and told the model to "/exit and start START_JEV_CLAUDE.ps1". The launcher relaunched only after `claude` exited, and still asked `Read-Host [S/n]`. So rotation always depended on the operator.
2. **Blind spot in the measurement.** The value measured is the last API call; the prompt being submitted was not counted. 04:52:52 prompt at 234 964 → allowed (WARNING) → the prompt itself moved the session to 240 501, crossing SOFT_STOP and HARD in **one** event (crossings `SOFT_STOP@240501, HARD_ROTATION@240501`).
3. 04:53:03 `PostToolUse` → `continue:false`; 04:54:59 the next operator prompt → `block`. The session stayed locked forever (all prompts blocked), with no successor. That was the "hang".
- Hooks were registered and firing (98 events). No hook error. Documented path `~/.claude-darkprogectis-jev/tools/jev-rotation` does not exist: the code is in `code/tools/jev-rotation/`.

## 2. V3 flow (hook-enforced, model-independent)

- **PREPARE ≥200k**: non-blocking reminder (keep handoff incremental), mechanical snapshot `handoffs/rotation/AUTO_ROTATION_<sid8>.md` refreshed at every Stop.
- **WARNING ≥220k**: as V2 (Stop blocked once until a `handoffs/*.md` changes).
- **SOFT_STOP ≥235k**: new operator prompt ⇒ rotation, the prompt **carried verbatim** to the successor; otherwise the current atomic unit (turn) finishes, then rotation at `Stop`.
- **HARD ≥240k**: rotation on any hook event.
- **Projection**: levels use `measured + pending` (prompt chars/3, tool_response chars/3). This closes the 9f12a31f blind spot (RT09).
- **Rotation** (`hook.mjs rotate()`):
  - exactly-once lock `jev-rotation/rotation/<sid>.lock` (O_EXCL);
  - pre-assigned successor UUID;
  - brief `handoffs/rotation/ROTATION_<A8>_TO_<B8>.md` (lineage, git, handoffs to read, pending operator prompt, last assistant texts, rules);
  - `jev-rotation/rotation/<B>/launch.ps1` (sets `CLAUDE_CONFIG_DIR`, clears test/CLAUDECODE env, `Set-Location` repo, **hook verify gate**, `claude --session-id <B> -n "JEV rotN" --append-system-prompt-file <brief> <boot>`);
  - opened in a **new Windows Terminal window** (`wt -w new`, fallback `cmd start`);
  - `lineage.jsonl`.
- **Predecessor ⇒ ROTATED_READ_ONLY**: every tool denied + `continue:false`, every prompt blocked (message names the successor). Sticky: survives compaction and resume.
- **Successor**: SessionStart hook injects lineage context, records `SUCCESSOR_STARTED`, stamps `successor_started_at` in the predecessor lock.
- **Watchdog** (`watchdog.mjs`, detached): waits 90 s for `successor_started_at`. If it does not arrive, it opens ONE replacement (max 2), and a late start of the old one is `SUPERSEDED` (blocked). At any time there is exactly one active successor.
- Bootstrap user turn is explicitly labeled `[JEV ROTATION CONTROLLER V3 - mensagem automatica gerada pelo controller, NAO pelo operador]`. The brief itself goes in the system prompt. No message is attributed to the operator.
- Spawn failure: visible in the deny reason, the lock is released, retried (max 3), then falls back to the V2 manual lock. It is never silent.
- `SessionStart` never spawns (a resumed exhausted session rotates on its first prompt, which is carried).
- `START_JEV_CLAUDE.ps1`: relaunch loop **removed** (it would create a second successor).

## 3. Proofs

- Synthetic RT01–RT17, all using the real hook process:
  - RT09: regression 9f12a31f;
  - RT10: 8 concurrent hooks ⇒ 1 successor;
  - RT12: handshake / depth-2 chain;
  - RT13: spawn failure;
  - RT16: 250k guard, starts 200k…249k;
  - RT17: watchdog respawn + supersede.
- Live `test/rotation/live-spawn.mjs`: real wt window, real config/state. Successor ran with config=isolated, cwd=repo, session-id pre-assigned, brief as system prompt, test env not leaked, real SessionStart handshake, detached watchdog `SUCCESSOR_CONFIRMED`, exactly one.
- Real Claude chain: `claude -p` (haiku) predecessor `8a525e67` with test thresholds. 05:14:39.578 `PostToolUse` HARD ⇒ ROTATION_TRIGGERED ⇒ wt spawn ⇒ successor `da1d0f15` SessionStart 05:14:41.795 ⇒ `SUCCESSOR_CONFIRMED` 05:14:41.830. This proves the watchdog survives as a child of a hook run by claude.exe.
- The first live run FAILED; it led to 2 fixes:
  - `fs.existsSync` is false on the `wt.exe` App Execution Alias ⇒ `lstat`;
  - `cmd start` title quoting ⇒ verbatim args.
  - That run's orphan lock `e2e-live-1790485642281` (successor `8583c26f` never started, pre-watchdog) is left as evidence.
- Evidence files: `handoffs/rotation/e2e-evidence-20260927/`.

## 4. Operational state

- Old session `9f12a31f` (PID 46652) **left alive** as evidence. Lock written retroactively: successor = `b933268a` (this session, opened manually by the operator), trigger `MANUAL_OPERATOR_PRE_V3`. The V3 hook will never spawn a second successor for it; its prompts are blocked as ROTATED_READ_ONLY.
- PID 37248 (session `259f64bc`, `waiting: dialog open` since 26/09 21:08): unrelated to rotation, untouched.
- Hooks are live from the repo path (`code/tools/jev-rotation/hook.mjs`), so every session in the isolated config already runs V3.

## 5. Honest limits

- A single model response (text + thinking + Write content) still grows before any hook runs. Rotation happens at the next hook event, and projection covers prompts and tool results only.
- `chars/3` is a conservative estimate, not a tokenizer.
- Windows only (wt / cmd start). The successor window stays open after the session ends (`-NoExit`).
- Not yet observed: a natural 240k rotation of a long interactive session. It is covered by the E2E with test thresholds (same code path).

## 6. Files (uncommitted)

M `START_JEV_CLAUDE.ps1`, `package.json` (+`test:rotation:live`), `tools/jev-rotation/{config.json,controller.mjs,hook.mjs,install-hooks.mjs,status.mjs}`, `test/rotation/rotation.test.mjs` · new `tools/jev-rotation/watchdog.mjs`, `test/rotation/live-spawn.mjs`, this handoff. Runtime state (outside repo): `C:\Users\ADM\.claude-darkprogectis-jev\jev-rotation\{rotation/,lineage.jsonl}`.

## 7. Exact next step

Operator: review, then commit (`Add JEV Rotation Controller V3: automatic successor session`). Optional: `npm run rotation:status`. Then resume the TypeSafe/Jev audit from `handoffs/HANDOFF_TYPESAFE_JEV_AUDIT_20260927.md` (unchanged by this phase).

## 8. Regression fix 27/09: successor transcript persistence

- **Sintoma** (sucessora automática 48909bd5): "Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker". Nenhum `48909bd5….jsonl` foi gravado.
- **Causa:**
  - O Claude Code 2.1.283 injeta em todo processo de hook/ferramenta: `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION=1`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_PID`, `CLAUDE_EFFORT` (+ `TRACEPARENT`/`AI_AGENT`/`CLAUDE_PROJECT_DIR`).
  - O hook abre a sucessora via wt ⇒ `launch.ps1`, e o ambiente é herdado.
  - O `launch.ps1` removia só `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`/`CLAUDE_CODE_SSE_PORT`.
  - Um `claude` **interativo** com `CLAUDE_CODE_CHILD_SESSION` desliga a persistência do transcript.
- **Por que a V3 passou:** o `live-spawn.mjs` rodava a sucessora com `claude -p`, que é não interativo e persiste mesmo com o marcador.
- **Fix:**
  - `hook.mjs` exporta `CLAUDE_SESSION_ENV`;
  - o `launch.ps1` remove essa lista junto com as variáveis de teste;
  - `CLAUDE_CONFIG_DIR`, cwd, `--session-id`, brief e o verify gate ficam inalterados;
  - `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE` **não** é usado: a sessão fica canônica, como se aberta pelo `START_JEV_CLAUDE.ps1`.
- **Testes:**
  - RT18 (unit): executa o `launch.ps1` gerado e confirma os marcadores ausentes; falha no código anterior;
  - `npm run test:rotation:transcript` (ROTATED_SUCCESSOR_TRANSCRIPT_PERSISTENCE): sucessora interativa real;
  - `npm run test:rotation:real`: pai `claude` real com thresholds reduzidos.
- **Resultados:**
  - RED antes do fix: marcador herdado, transcript OFF;
  - GREEN depois: marcador ausente, transcript criado e crescendo, exatamente uma sucessora;
  - rotation 18/18; suíte completa 123/123; live-spawn PASS.
