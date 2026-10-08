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


---

## INCIDENTE 2026-10-08 — ZERO ROTAÇÃO (registro de proteção pós-compactação)

Estado gravado ANTES de qualquer correção. Nada foi alterado por causa do incidente até aqui.

| Item | Valor |
|---|---|
| ZERO_ROTATION | **CONFIRMADO** nesta sessão |
| Sessão atual | `6b86565f-0ed1-474b-85ff-2c43e1c80f48` |
| Processo | `claude.exe` PID 37468, início 2026-10-08 00:39:03 (local) |
| Ancestrais | `powershell.exe` PID 42620 (interativo, início 00:37:41) ← `explorer.exe` |
| CLAUDE_CONFIG_DIR efetivo | `C:\Users\ADM\.claude-gomesgomestrader` (só no ambiente do processo; nenhuma variável persistente de usuário/máquina) |
| cwd | `C:\Users\ADM\Claude-JEV\code` |
| Hooks neste perfil | `install-hooks.mjs --config-dir C:\Users\ADM\.claude-gomesgomestrader --verify` ⇒ PreToolUse / PostToolUse / Stop = **missing** (settings.json do perfil nasceu só com `theme`) |
| Estado do controlador neste perfil | pasta `jev-rotation` **inexistente** ⇒ `rotation:status` = "no state"; `rotation:force` = REFUSED (exit 3) |
| Launcher atual | `C:\Users\ADM\Claude-JEV\code\START_JEV_CLAUDE.ps1` (o caminho `C:\Users\ADM\Claude-JEV\START_JEV_CLAUDE.ps1` **não existe**). Cópia de trabalho tem alteração NÃO commitada de 2026-09-30: respeita `CLAUDE_CONFIG_DIR` já definido; padrão `.claude-darkprogectis`. HEAD fixa `.claude-darkprogectis-jev`. |
| Perfil canônico | `C:\Users\ADM\.claude-darkprogectis`: 5 hooks presentes, `--verify` PASS, estado com 128 sessões; última rotação automática real 2026-10-08 03:07:01Z (41f1f360 → 19ed00ed, wt, confirmada em ~4 s) |
| Histórico do PowerShell (linhas 4636–4645) | `.\START_JEV_CLAUDE.ps1` → `$env:CLAUDE_CONFIG_DIR="C:\Users\ADM\.claude-gomesgomestrader"` → `New-Item -ItemType Directory -Force $env:CLAUDE_CONFIG_DIR` → `claude` (direto) → … → `.\START_JEV_CLAUDE.ps1` |
| Hipótese | **AINDA NÃO FECHADA**: a sessão teria sido aberta por `claude` direto num perfil recém-criado, sem passar pelo launcher (que é quem instala/verifica os hooks) |
| Próximo passo | provar a origem do desencontro de perfil (qual comando abriu o PID 37468; se o launcher alguma vez rodou com este perfil; por que os hooks dependem do perfil) e só então JEV DESIGN → JEV DIFF → patch mínimo |

Thresholds: não alterados. Mods: todos desligados nos dois perfis.

### INCIDENTE 2026-10-08 — CAUSA RAIZ, CORREÇÃO E PROVAS

**Cadeia (primeiro desvio = passo 1)**

| Passo | Esperado | Real | | Evidência |
|---|---|---|---|---|
| 1 Abertura | `START_JEV_CLAUDE.ps1` (instala + verifica hooks no perfil, depois `claude`) | `claude` direto, após `$env:CLAUDE_CONFIG_DIR=...\.claude-gomesgomestrader` + `New-Item` | **FAIL** | histórico do PowerShell l.4637–4640; `settings.json` do perfil nasceu 00:39 só com `theme` (se o launcher tivesse aberto, o instalador teria gravado os hooks antes) |
| 2 env | perfil JEV com hooks | `.claude-gomesgomestrader` (só no processo; sem variável persistente) | FAIL (consequência) | ambiente do PID 37468; pai PowerShell 42620 ← explorer |
| 3 settings | 5 hooks do controlador | nenhum hook no perfil | FAIL (consequência) | `install-hooks --verify` = missing |
| 4 SessionStart / registro | `state/<sid>.json` | pasta `jev-rotation` inexistente | FAIL (consequência) | listagem do perfil |
| 5 status / force | reconhece a sessão | "no state" / REFUSED exit 3 | FAIL (consequência) | saída dos comandos |

- O launcher **não** colocou a sessão no perfil errado; ele não foi usado nesta abertura. Ele funciona: abriu `a51db1fa` no perfil canônico às 12:54:28Z do mesmo dia (PID 37248), registrada. Última rotação automática real no canônico: 03:07:01Z (41f1f360 → 19ed00ed, ~4 s).
- **Causa raiz**: a imposição da rotação existia só no `settings.json` de cada perfil e era gravada só pelo launcher. Qualquer sessão aberta no repositório por outro caminho (troca de conta/perfil feita à mão) ficava sem controlador, em silêncio. Mods não participam (instalados ~17 h depois, desligados).
- LAST_KNOWN_GOOD: rotação automática 2026-10-08 03:07:01Z no perfil canônico; `rotation:force` versionado em `20ff022`. Nenhum arquivo do controlador mudou desde então. `auto-rotate-session.js` / `start-alfaomega-session.js` não fazem parte do Controller V3 deste repositório (arquivos reais: `tools/jev-rotation/*`).
- O caminho `C:\Users\ADM\Claude-JEV\START_JEV_CLAUDE.ps1` não existe; o launcher é `C:\Users\ADM\Claude-JEV\code\START_JEV_CLAUDE.ps1` (alteração de 09-30 continua NÃO commitada; não foi tocada).

**Decisões JEV**: DESIGN T1 `req_01a11dd93e6c7d118160c0cce9fad4db` (causa provada SIM 0,79; correção P1 0,94; duplicidade ⇒ SO_PROJETO; perfil padrão fora do escopo) · DIFF T1 `req_01a11dd9cbd7759fb6e26289d4bd44ae` (A 0,64; alinhar o verificador já) · FINAL T1 `req_01a11dddeef17a81a55a3623d852010b` (B; medir duplicidade no canônico) · FINAL T2 `req_01a11ddf0e21752e90be7e8789877219` (**B**; a medição com controle não basta, medir no próprio perfil canônico). Dossiês: `handoffs/rotation-incident-20261008/`.

**Patch (3 arquivos; limiares, hook, controller, force, status, watchdog e launcher intocados)**
1. `.claude/settings.json` — 5 hooks do controlador (mesma linha do instalador) junto dos hooks do jev-finish. Toda sessão aberta neste repositório carrega o controlador em qualquer perfil; estado continua por perfil.
2. `tools/jev-rotation/install-hooks.mjs` — `--verify` aceita os hooks declarados no perfil OU no projeto.
3. `test/rotation/project-hooks.test.mjs` — PH1–PH4.

Reversão: `git checkout` dos 2 primeiros arquivos + apagar o teste.

**Provas medidas**
- `npm run test:rotation` 26/26.
- A sessão do incidente passou a ser registrada sem reinício e sem instalação manual: `rotation:status` ⇒ `session=6b86565f… level=OK`; `force.mjs --check` ⇒ CHECK_OK (antes REFUSED 3); `--verify` PASS no perfil sem gravar hooks nele.
- Rotação automática real (`npm run test:rotation:live`, perfil do incidente, janela wt real, sucessor real): 3 execuções com linhagem completa (TRIGGERED → SPAWNED → STARTED no mesmo perfil/cwd → CONFIRMED em 3–4 s, um sucessor). Resultado do script: 1ª = 11/12 (checagem do transcript rodou antes de o arquivo existir; o arquivo existe), 2ª = linha de resultado não capturada (erro meu de filtro), 3ª = **12/12 PASS**.
- Duplicidade: mesma linha em duas fontes de ajustes ⇒ 1 execução por evento; controle com linha diferente ⇒ 2. (Medido com projeto + arquivo `--settings`, não com o perfil canônico.)

**Pendente**
- JEV FINAL = B: medir a duplicidade **no perfil canônico**. Minha execução do teste ao vivo naquele perfil foi negada pelo classificador de segurança do ambiente (não contornado). Como medir: abrir uma sessão pelo launcher no perfil canônico e, após uma chamada de ferramenta, conferir em `…\.claude-darkprogectis\jev-rotation\events.jsonl` se há 1 linha por evento (PreToolUse/PostToolUse). Se houver 2 ⇒ aplicar SO_PROJETO (novo JEV DIFF). Depois reenviar o JEV FINAL.
- `rotation:force` real desta sessão: último ato (resultado registrado abaixo pelo sucessor).
- Mods: continuam desligados até JEV FINAL = A da rotação.
