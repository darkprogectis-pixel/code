#!/usr/bin/env node
// JEV Rotation Controller V3 — Claude Code hook entry point.
// Registered in $CLAUDE_CONFIG_DIR/settings.json by install-hooks.mjs for:
// SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop.
// State is sticky per session: once a level is reached it never goes down
// (a later compaction cannot unlock a session that hit the hard threshold).
//
// V3: at rotation the HOOK itself opens the successor session (no /exit, no
// operator). Exactly-once via an O_EXCL lock per predecessor; lineage persisted;
// the predecessor becomes ROTATED_READ_ONLY for good.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  HERE, LEVELS, rank, maxLevel, ROTATE, ROTATED, loadConfig, levelFor, measureTranscript, estimatePending, shouldRotate, decide,
} from './controller.mjs';

export const env = process.env;
// Per-session markers Claude Code injects into every hook/tool process (claude.exe 2.1.283:
// CLAUDECODE, CLAUDE_CODE_SESSION_ID, CLAUDE_CODE_CHILD_SESSION, CLAUDE_CODE_SESSION_ATTENDED,
// CLAUDE_PID, CLAUDE_EFFORT, TRACEPARENT, AI_AGENT, CLAUDE_PROJECT_DIR) plus the parent's own
// process markers. A successor inheriting them is not a canonical session: with
// CLAUDE_CODE_CHILD_SESSION an interactive claude turns transcript saving OFF (48909bd5).
// A session started by START_JEV_CLAUDE.ps1 from a plain terminal has none of them.
export const CLAUDE_SESSION_ENV = [
  'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_PID',
  'CLAUDE_EFFORT', 'TRACEPARENT', 'AI_AGENT', 'CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
];
export const TEST_MODE = env.JEV_ROTATION_TEST === '1';
const TEST = env.JEV_ROTATION_TEST === '1';
export const repoRoot = env.JEV_ROTATION_REPO_ROOT || path.resolve(HERE, '..', '..');
export const stateDir = env.JEV_ROTATION_STATE_DIR
  || path.join(env.CLAUDE_CONFIG_DIR || path.join(env.USERPROFILE || env.HOME || '.', '.claude'), 'jev-rotation');
const rotDir = path.join(stateDir, 'rotation');
const lineageFile = path.join(stateDir, 'lineage.jsonl');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}
function fileSize(p) {
  try { return fs.statSync(path.isAbsolute(p) ? p : path.join(repoRoot, p)).size; } catch { return null; }
}
function git(args) {
  try { return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'UNAVAILABLE'; }
}
function handoffFiles() {
  try {
    const dir = path.join(repoRoot, 'handoffs');
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
      .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}
const latestHandoffMtime = () => handoffFiles()[0]?.mtime || 0;
export const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export const lockFile = (sid) => path.join(rotDir, `${sid}.lock`);
export const lineage = (rec) => fs.appendFileSync(lineageFile, JSON.stringify({ at: new Date().toISOString(), ...rec }) + '\n');

export function writeAutoSnapshot(sid, level, tokens, input, st) {
  const dir = path.join(repoRoot, 'handoffs', 'rotation');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `AUTO_ROTATION_${sid.slice(0, 8)}.md`);
  const body = [
    `# AUTO ROTATION SNAPSHOT — session ${sid}`, '',
    'Written mechanically by the JEV Rotation Controller V3 hook (not by the model).',
    'The narrative handoff is the most recent handoffs/HANDOFF_*.md; this file is the mechanical fallback.', '',
    `- level: **${level}** (crossings: ${st.crossings.map((c) => `${c.level}@${c.tokens}`).join(', ')})`,
    `- context tokens (API usage, last assistant message): **${tokens}**`,
    `- written at: ${new Date().toISOString()}`,
    `- transcript: \`${input.transcript_path || 'UNKNOWN'}\``,
    `- git HEAD: \`${git(['log', '-1', '--format=%h %s'])}\``, '',
    '## git status --short', '', '```', git(['status', '--short']) || '(clean)', '```', '',
    '## Rotation flow', '',
    `PREPARE (incremental handoff) → SOFT_STOP (finish the atomic unit) → HARD_ROTATION → the controller opens the successor session automatically; this one becomes ${ROTATED}. ${rank(level) >= rank('HARD_ROTATION') ? ROTATE : ''}`, '',
  ].join('\n');
  fs.writeFileSync(file, body);
  return file;
}

// Last main-chain assistant texts + last real operator prompt, from the transcript tail.
function transcriptTail(tp, cfg) {
  const res = { assistant: [], lastPrompt: null };
  if (!tp) return res;
  try {
    const size = fs.statSync(tp).size;
    const len = Math.min(size, 2 * 1024 * 1024);
    const fd = fs.openSync(tp, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const max = cfg.rotation?.carry_text_max_chars || 2500;
    const clip = (s) => (s.length > max ? `${s.slice(0, max)} …[truncated]` : s);
    for (const line of buf.toString('utf8').split('\n').reverse()) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.isSidechain) continue;
      const c = o.message?.content;
      if (o.type === 'assistant' && Array.isArray(c) && res.assistant.length < (cfg.rotation?.carry_last_assistant_texts || 4)) {
        const txt = c.filter((x) => x.type === 'text').map((x) => x.text).join('\n').trim();
        if (txt) res.assistant.unshift(clip(txt));
      } else if (o.type === 'user' && !res.lastPrompt && !o.isMeta) {
        const txt = typeof c === 'string' ? c : Array.isArray(c) && !c.some((x) => x.type === 'tool_result')
          ? c.filter((x) => x.type === 'text').map((x) => x.text).join('\n') : '';
        if (txt.trim()) res.lastPrompt = clip(txt.trim());
      }
      if (res.lastPrompt && res.assistant.length >= (cfg.rotation?.carry_last_assistant_texts || 4)) break;
    }
  } catch { /* brief degrades to handoff only */ }
  return res;
}

export function writeBrief(rec, st, input, cfg, carriedPrompt) {
  const dir = path.join(repoRoot, 'handoffs', 'rotation');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ROTATION_${rec.from.slice(0, 8)}_TO_${rec.successor.slice(0, 8)}.md`);
  const hs = handoffFiles().filter((h) => !h.file.includes(`${path.sep}rotation${path.sep}`));
  const since = st.first_seen_ms || 0;
  const touched = hs.filter((h) => h.mtime >= since);
  const tail = transcriptTail(input.transcript_path, cfg);
  const rel = (f) => path.relative(repoRoot, f).replace(/\\/g, '/');
  const quote = (s) => s.split('\n').map((l) => `> ${l}`).join('\n');
  const body = [
    `# JEV ROTATION BRIEF — ${rec.from} → ${rec.successor}`, '',
    'Generated mechanically by the JEV Rotation Controller V3 hook at rotation time — not written by a model, not by the operator.', '',
    `- predecessor session: \`${rec.from}\` — now **${ROTATED}** (blocked by the controller; do not use it)`,
    `- this session: \`${rec.successor}\` · rotation #${rec.depth} · lineage root \`${rec.root}\``,
    `- trigger: ${rec.trigger} at level **${rec.level}** · measured ${rec.tokens} tokens · projected ${rec.projected} (hard ${cfg.thresholds.hard_rotation}, ceiling ${cfg.thresholds.ceiling})`,
    `- cwd: \`${repoRoot}\` · CLAUDE_CONFIG_DIR: \`${rec.config_dir}\``,
    `- predecessor transcript: \`${input.transcript_path || 'UNKNOWN'}\``,
    `- git HEAD: \`${git(['log', '-1', '--format=%h %s'])}\``, '',
    '## git status --short', '', '```', git(['status', '--short']) || '(clean)', '```', '',
    '## Handoff to read first', '',
    hs[0] ? `- most recent narrative handoff: \`${rel(hs[0].file)}\` (${new Date(hs[0].mtime).toISOString()})` : '- no narrative handoff found',
    ...(touched.length ? ['- handoffs modified during the predecessor session:', ...touched.map((h) => `  - \`${rel(h.file)}\``)] : ['- no handoff was modified during the predecessor session']),
    `- mechanical snapshot: \`handoffs/rotation/AUTO_ROTATION_${rec.from.slice(0, 8)}.md\``, '',
    '## Pending operator message', '',
    carriedPrompt
      ? ['The operator submitted this message to the predecessor; the controller blocked it there ONLY because of the rotation. It is the operator\'s own request, verbatim — carry it out here:', '', quote(carriedPrompt)].join('\n')
      : 'None. The predecessor was rotated at a turn boundary / tool step.',
    '',
    '## Last operator message seen in the predecessor (context)', '',
    tail.lastPrompt ? quote(tail.lastPrompt) : '(none found)', '',
    '## Last predecessor assistant messages (oldest first, truncated)', '',
    ...(tail.assistant.length ? tail.assistant.flatMap((t, i) => [`### ${i + 1}`, '', quote(t), '']) : ['(none found)', '']),
    '## Continuation rules', '',
    '1. Read the handoff(s) above (bounded reads) and CLAUDE.md rules; do not repeat completed phases; never /clear.',
    '2. If a pending operator message exists, carry it out.',
    '3. Otherwise continue the exact next step recorded in the handoff — unless that step requires an explicit operator order (F5, install, order paths, production), in which case report the recovered state and wait.',
    '',
  ].join('\n');
  fs.writeFileSync(file, body);
  return file;
}

export function writeLauncher(rec, briefFile) {
  const dir = path.join(rotDir, rec.successor);
  fs.mkdirSync(dir, { recursive: true });
  const bin = (TEST && env.JEV_ROTATION_CLAUDE_BIN) || 'claude';
  const name = `JEV rot${rec.depth} ${rec.successor.slice(0, 8)}`;
  const boot = `[JEV ROTATION CONTROLLER V3 - mensagem automatica gerada pelo controller, NAO pelo operador] `
    + `Continuacao automatica da sessao ${rec.from.slice(0, 8)} (rotacao #${rec.depth}, ${rec.tokens} tokens, ${rec.level}). `
    + `Siga o JEV ROTATION BRIEF anexado ao system prompt (arquivo ${briefFile.replace(/\\/g, '/')}): leia o handoff indicado e continue conforme as regras do brief.`;
  const bootFile = path.join(dir, 'boot.txt');
  fs.writeFileSync(bootFile, boot);
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  // The successor must start as a canonical session (as from START_JEV_CLAUDE.ps1): no test
  // overrides and none of the parent's Claude Code session markers (see CLAUDE_SESSION_ENV).
  const strip = ['JEV_ROTATION_TEST', 'JEV_ROTATION_THRESHOLDS', 'JEV_ROTATION_STATE_DIR', 'JEV_ROTATION_REPO_ROOT', 'JEV_ROTATION_CLAUDE_BIN', 'JEV_ROTATION_SPAWN', ...CLAUDE_SESSION_ENV];
  const ps = [
    '# JEV Rotation Controller V3 - successor launcher (generated by hook.mjs; do not edit)',
    `$env:CLAUDE_CONFIG_DIR = ${q(rec.config_dir)}`,
    `foreach ($v in ${strip.map(q).join(',')}) { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }`,
    `Set-Location -LiteralPath ${q(repoRoot)}`,
    `$Host.UI.RawUI.WindowTitle = ${q(name)}`,
    `Write-Host ${q(`=== JEV ROTATION #${rec.depth}: ${rec.from} -> ${rec.successor} ===`)} -ForegroundColor Cyan`,
    `node ${q(path.join(HERE, 'install-hooks.mjs'))} --config-dir $env:CLAUDE_CONFIG_DIR --verify`,
    'if ($LASTEXITCODE -ne 0) {',
    `  Add-Content -LiteralPath ${q(lineageFile)} -Value ('{"event":"SUCCESSOR_VERIFY_FAILED","successor":"${rec.successor}","at":"' + (Get-Date).ToUniversalTime().ToString('o') + '"}')`,
    "  Write-Host 'JEV Rotation: hook verify FAILED - successor NOT started (no verified enforcement => no session)' -ForegroundColor Red",
    '  return',
    '}',
    `$boot = Get-Content -Raw -Encoding UTF8 -LiteralPath ${q(bootFile)}`,
    `& ${q(bin)} --session-id ${q(rec.successor)} -n ${q(name)} --append-system-prompt-file ${q(briefFile)} $boot`,
    '',
  ].join('\r\n');
  const launch = path.join(dir, 'launch.ps1');
  fs.writeFileSync(launch, ps);
  return launch;
}

function spawnDetached(cmd, args, verbatim = false) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: verbatim }); } catch (e) { resolve({ ok: false, error: String(e.message || e) }); return; }
    child.once('error', (e) => resolve({ ok: false, error: String(e.message || e) }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true, pid: child.pid }); });
  });
}

// Opens a NEW terminal window running launch.ps1. Windows Terminal first (the window is
// owned by the WT process, not by this hook's process tree); classic console as fallback.
export async function openWindow(launch, title) {
  const psArgs = ['powershell.exe', '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launch];
  const errors = [];
  const wt = path.join(env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe');
  // wt.exe is an App Execution Alias (reparse point): stat/existsSync fail on it, lstat works.
  let hasWt = false;
  try { fs.lstatSync(wt); hasWt = true; } catch { /* not installed */ }
  if (process.platform === 'win32' && hasWt) {
    const r = await spawnDetached(wt, ['-w', 'new', '--title', title, ...psArgs]);
    if (r.ok) return { ...r, mode: 'wt' };
    errors.push(`wt: ${r.error}`);
  }
  const line = `start "${title}" powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "${launch}"`;
  const r = await spawnDetached(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], true);
  if (r.ok) return { ...r, mode: 'console' };
  errors.push(`start: ${r.error}`);
  return { ok: false, error: errors.join('; ') };
}

// Also the entry point of force.mjs (manual immediate rotation): one rotation path only.
export async function rotate(sid, st, input, event, level, tokens, projected, cfg) {
  fs.mkdirSync(rotDir, { recursive: true });
  let fd;
  try { fd = fs.openSync(lockFile(sid), 'wx'); } catch (e) {
    if (e.code === 'EEXIST') return readJson(lockFile(sid)) || { status: 'SPAWNING', from: sid, successor: 'UNKNOWN (lock being written)' };
    throw e;
  }
  const pre = st.predecessor;
  const configDir = env.CLAUDE_CONFIG_DIR;
  const rec = {
    from: sid, successor: crypto.randomUUID(), depth: (pre?.depth || 0) + 1, root: pre?.root || sid,
    level, tokens, projected, trigger: event, config_dir: configDir || null, cwd: repoRoot,
    carried_prompt: event === 'UserPromptSubmit', carried_prompt_text: event === 'UserPromptSubmit' ? String(input.prompt || '') : null,
    transcript_path: input.transcript_path || null, hook_parent_pid: process.ppid, at: new Date().toISOString(),
  };
  const fail = (error) => {
    fs.closeSync(fd);
    fs.rmSync(lockFile(sid), { force: true }); // allow a retry on a later event
    st.spawn_attempts = (st.spawn_attempts || 0) + 1;
    lineage({ event: 'SPAWN_FAILED', from: sid, successor: rec.successor, attempt: st.spawn_attempts, error });
    return { ...rec, status: 'SPAWN_FAILED', error };
  };
  // Never open a successor with the default ~/.claude (no JEV hooks there).
  if (!configDir) return fail('CLAUDE_CONFIG_DIR not set in hook environment');
  try {
    rec.brief = writeBrief(rec, st, input, cfg, rec.carried_prompt_text);
    rec.launch = writeLauncher(rec, rec.brief);
    fs.mkdirSync(path.join(stateDir, 'state'), { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'state', `${rec.successor}.json`), JSON.stringify({
      session_id: rec.successor, max_level: 'OK', max_tokens: 0, crossings: [],
      predecessor: { from: sid, depth: rec.depth, root: rec.root, brief: rec.brief, at: rec.at },
    }, null, 2));
    lineage({ event: 'ROTATION_TRIGGERED', ...rec });
    if (TEST && env.JEV_ROTATION_SPAWN === 'dry') {
      Object.assign(rec, { status: 'SPAWNED', spawn: { mode: 'dry-run' } });
    } else {
      const r = await openWindow(rec.launch, `JEV rot${rec.depth} ${rec.successor.slice(0, 8)}`);
      if (!r.ok) return fail(r.error);
      Object.assign(rec, { status: 'SPAWNED', spawn: { mode: r.mode, pid: r.pid } });
    }
  } catch (e) {
    return fail(String(e.message || e));
  }
  fs.writeSync(fd, JSON.stringify(rec, null, 2));
  fs.closeSync(fd);
  lineage({ event: 'SUCCESSOR_SPAWNED', from: sid, successor: rec.successor, spawn: rec.spawn });
  // Detached watchdog: "spawned" is not "alive" — it waits for the successor's SessionStart
  // and re-opens ONE replacement if it never comes (the stale one is then superseded).
  if (!(TEST && env.JEV_ROTATION_WATCHDOG === 'off')) try {
    spawn(process.execPath, [path.join(HERE, 'watchdog.mjs'), sid], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
  } catch (e) { lineage({ event: 'WATCHDOG_SPAWN_FAILED', from: sid, error: String(e.message || e) }); }
  return rec;
}

async function main() {
  const raw = readStdin();
  const input = raw ? JSON.parse(raw) : {};
  const event = input.hook_event_name || process.argv[2] || 'unknown';
  const sid = String(input.session_id || 'unknown-session');
  const cfg = loadConfig(env);
  const th = cfg.thresholds;

  fs.mkdirSync(path.join(stateDir, 'state'), { recursive: true });
  const stateFile = path.join(stateDir, 'state', `${sid}.json`);
  let st = readJson(stateFile) || { session_id: sid, max_level: 'OK', max_tokens: 0, crossings: [] };
  const now = Date.now();
  if (!st.first_seen_ms) st.first_seen_ms = now;

  const m = measureTranscript(input.transcript_path);
  const pending = m.tokens === null ? 0 : estimatePending(event, input, cfg);
  const projected = m.tokens === null ? null : m.tokens + pending;
  const measured = projected === null ? 'OK' : levelFor(projected, th);
  if (rank(measured) > rank(st.max_level)) {
    for (let i = rank(st.max_level) + 1; i <= rank(measured); i++) {
      st.crossings.push({ level: LEVELS[i], tokens: projected, measured: m.tokens, event, at: new Date(now).toISOString(), at_ms: now });
    }
    st.max_level = measured;
    st.snapshot = writeAutoSnapshot(sid, measured, m.tokens, input, st);
  }
  const level = maxLevel(measured, st.max_level);
  const tokens = m.tokens ?? st.last_tokens ?? null;
  if (m.tokens !== null) { st.last_tokens = m.tokens; st.max_tokens = Math.max(st.max_tokens, m.tokens); }

  // "Handoff fresh" = some handoffs/*.md modified after the crossing of the current
  // reference level (PREPARE, then WARNING, then HARD_ROTATION).
  const refLevel = rank(level) >= rank('HARD_ROTATION') ? 'HARD_ROTATION' : rank(level) >= rank('WARNING') ? 'WARNING' : 'PREPARE';
  const ref = st.crossings.find((c) => c.level === refLevel);
  const handoffFresh = ref ? latestHandoffMtime() > ref.at_ms : true;

  let nag = false;
  if (event === 'PostToolUse' && rank(level) >= rank('PREPARE') && !handoffFresh) {
    if (st.last_nag_tokens === undefined || (tokens ?? 0) - st.last_nag_tokens >= cfg.handoff_nag_every_tokens) {
      nag = true; st.last_nag_tokens = tokens ?? 0;
    }
  }
  // Incremental mechanical state from PREPARE on: refreshed at every turn end.
  if (event === 'Stop' && rank(level) >= rank('PREPARE')) st.snapshot = writeAutoSnapshot(sid, level, tokens, input, st);

  // Successor bookkeeping (first SessionStart of a spawned successor).
  if (event === 'SessionStart' && st.predecessor && !st.predecessor.started_at) {
    st.predecessor.started_at = new Date(now).toISOString();
    lineage({ event: 'SUCCESSOR_STARTED', from: st.predecessor.from, successor: sid, source: input.source, cwd: input.cwd, config_dir: env.CLAUDE_CONFIG_DIR || null, hook_parent_pid: process.ppid });
    const pl = readJson(lockFile(st.predecessor.from));
    if (pl && pl.successor === sid) {
      const tmp = `${lockFile(st.predecessor.from)}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...pl, successor_started_at: st.predecessor.started_at }, null, 2));
      fs.renameSync(tmp, lockFile(st.predecessor.from));
    }
  }

  // A successor replaced by the watchdog (it started too late) is read-only too.
  const predLock = st.predecessor ? readJson(lockFile(st.predecessor.from)) : null;
  const superseded = predLock && predLock.successor !== sid
    ? { successor: predLock.successor, brief: predLock.brief, tokens: 0, level: 'SUPERSEDED', trigger: 'superseded by the watchdog respawn' } : null;
  if (superseded && !st.superseded) { st.superseded = true; lineage({ event: 'SUCCESSOR_SUPERSEDED_STARTED', session: sid, active_successor: predLock.successor }); }

  // Rotation: the lock file is the source of truth (survives concurrent hooks clobbering state).
  let rotation = superseded || readJson(lockFile(sid)) || (fs.existsSync(lockFile(sid)) ? { status: 'SPAWNING', from: sid, successor: 'UNKNOWN (lock being written)' } : null);
  let spawnError = null;
  const retryLeft = (st.spawn_attempts || 0) < (cfg.rotation?.spawn_retry_max ?? 3);
  if (!rotation && retryLeft && shouldRotate(event, input, level, { cfg, handoffFresh })) {
    const rec = await rotate(sid, st, input, event, level, tokens, projected, cfg);
    if (rec.status === 'SPAWN_FAILED') spawnError = rec.error; else rotation = rec;
  } else if (!rotation && !retryLeft && rank(level) >= rank('SOFT_STOP')) {
    spawnError = `automatic spawn gave up after ${st.spawn_attempts} attempts (see lineage.jsonl)`;
  }

  const res = decide(event, input, { level, tokens, cfg, repoRoot, fileSize, handoffFresh, nag, measurement: m, rotation, spawnError, predecessor: st.predecessor });
  st.level = level;
  st.rotation_required = rank(level) >= rank('SOFT_STOP') && !rotation;
  st.rotation = rotation ? { status: ROTATED, successor: rotation.successor, brief: rotation.brief, at: rotation.at } : undefined;
  st.handoff_fresh = handoffFresh;
  st.updated_at = new Date(now).toISOString();
  st.transcript_path = input.transcript_path;
  fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
  fs.writeFileSync(path.join(stateDir, 'last-session.json'), JSON.stringify(st, null, 2));
  fs.appendFileSync(path.join(stateDir, 'events.jsonl'), JSON.stringify({
    at: st.updated_at, sid, event, tool: input.tool_name, tokens, projected, measurement: m.status, level,
    rotated: rotation ? rotation.successor : undefined,
    action: res.output?.hookSpecificOutput?.permissionDecision || res.output?.decision || (res.output?.continue === false ? 'stop' : 'allow'),
  }) + '\n');

  if (res.output) process.stdout.write(JSON.stringify(res.output));
  process.exit(res.exitCode);
}

const isEntry = !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isEntry) { try { await import('../jev-obs/hook-probe.mjs'); } catch { /* observability only — never affects the hook */ } }
if (isEntry) main().catch((e) => {
  // Internal error: visible, logged, non-blocking (a controller bug must not brick the session silently).
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(path.join(stateDir, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), error: String(e.stack || e) }) + '\n');
  } catch { /* ignore */ }
  process.stdout.write(JSON.stringify({ systemMessage: `JEV_ROTATION_CONTROLLER_ERROR: ${e.message} — enforcement degraded, check ${stateDir}/events.jsonl` }));
  process.exit(0);
});
