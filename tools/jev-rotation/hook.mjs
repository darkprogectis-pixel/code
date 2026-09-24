#!/usr/bin/env node
// JEV Rotation Controller V2 — Claude Code hook entry point.
// Registered in $CLAUDE_CONFIG_DIR/settings.json by install-hooks.mjs for:
// SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop.
// State is sticky per session: once a level is reached it never goes down
// (a later compaction cannot unlock a session that hit the hard threshold).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HERE, LEVELS, rank, maxLevel, ROTATE, loadConfig, levelFor, measureTranscript, decide } from './controller.mjs';

const env = process.env;
const repoRoot = env.JEV_ROTATION_REPO_ROOT || path.resolve(HERE, '..', '..');
const stateDir = env.JEV_ROTATION_STATE_DIR
  || path.join(env.CLAUDE_CONFIG_DIR || path.join(env.USERPROFILE || env.HOME || '.', '.claude'), 'jev-rotation');

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
function latestHandoffMtime() {
  let max = 0;
  try {
    for (const f of fs.readdirSync(path.join(repoRoot, 'handoffs'))) {
      if (!f.endsWith('.md')) continue;
      max = Math.max(max, fs.statSync(path.join(repoRoot, 'handoffs', f)).mtimeMs);
    }
  } catch { /* no handoffs dir */ }
  return max;
}

function writeAutoSnapshot(sid, level, tokens, input, st) {
  const dir = path.join(repoRoot, 'handoffs', 'rotation');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `AUTO_ROTATION_${sid.slice(0, 8)}.md`);
  const body = [
    `# AUTO ROTATION SNAPSHOT — session ${sid}`, '',
    'Written mechanically by the JEV Rotation Controller V2 hook (not by the model).',
    'The narrative handoff is the most recent handoffs/HANDOFF_*.md; this file is the mechanical fallback.', '',
    `- level: **${level}** (crossings: ${st.crossings.map((c) => `${c.level}@${c.tokens}`).join(', ')})`,
    `- context tokens (API usage, last assistant message): **${tokens}**`,
    `- written at: ${new Date().toISOString()}`,
    `- transcript: \`${input.transcript_path || 'UNKNOWN'}\``,
    `- git HEAD: \`${git(['log', '-1', '--format=%h %s'])}\``, '',
    '## git status --short', '', '```', git(['status', '--short']) || '(clean)', '```', '',
    '## Rotation flow', '',
    `handoff → /exit this instance → START_JEV_CLAUDE.ps1 opens a new instance → read handoff → continue. ${rank(level) >= rank('HARD_ROTATION') ? ROTATE : ''}`, '',
  ].join('\n');
  fs.writeFileSync(file, body);
  return file;
}

function main() {
  const raw = readStdin();
  const input = raw ? JSON.parse(raw) : {};
  const event = input.hook_event_name || process.argv[2] || 'unknown';
  const sid = String(input.session_id || 'unknown-session');
  const cfg = loadConfig(env);
  const th = cfg.thresholds;

  fs.mkdirSync(path.join(stateDir, 'state'), { recursive: true });
  const stateFile = path.join(stateDir, 'state', `${sid}.json`);
  let st;
  try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { st = { session_id: sid, max_level: 'OK', max_tokens: 0, crossings: [] }; }

  const m = measureTranscript(input.transcript_path);
  const measured = m.tokens === null ? 'OK' : levelFor(m.tokens, th);
  const now = Date.now();
  if (rank(measured) > rank(st.max_level)) {
    for (let i = rank(st.max_level) + 1; i <= rank(measured); i++) {
      st.crossings.push({ level: LEVELS[i], tokens: m.tokens, at: new Date(now).toISOString(), at_ms: now });
    }
    st.max_level = measured;
    st.snapshot = writeAutoSnapshot(sid, measured, m.tokens, input, st);
  }
  const level = maxLevel(measured, st.max_level);
  const tokens = m.tokens ?? st.last_tokens ?? null;
  if (m.tokens !== null) { st.last_tokens = m.tokens; st.max_tokens = Math.max(st.max_tokens, m.tokens); }

  // "Handoff fresh" = some handoffs/*.md modified after the WARNING crossing
  // (or after the HARD_ROTATION crossing once that level is reached).
  const refLevel = rank(level) >= rank('HARD_ROTATION') ? 'HARD_ROTATION' : 'WARNING';
  const ref = st.crossings.find((c) => c.level === refLevel);
  const handoffFresh = ref ? latestHandoffMtime() > ref.at_ms : true;

  let nag = false;
  if (event === 'PostToolUse' && rank(level) >= rank('WARNING') && !handoffFresh) {
    if (st.last_nag_tokens === undefined || (tokens ?? 0) - st.last_nag_tokens >= cfg.handoff_nag_every_tokens) {
      nag = true; st.last_nag_tokens = tokens ?? 0;
    }
  }

  const res = decide(event, input, { level, tokens, cfg, repoRoot, fileSize, handoffFresh, nag, measurement: m });
  st.level = level;
  st.rotation_required = rank(level) >= rank('SOFT_STOP');
  st.handoff_fresh = handoffFresh;
  st.updated_at = new Date(now).toISOString();
  st.transcript_path = input.transcript_path;
  fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
  fs.writeFileSync(path.join(stateDir, 'last-session.json'), JSON.stringify(st, null, 2));
  fs.appendFileSync(path.join(stateDir, 'events.jsonl'), JSON.stringify({
    at: st.updated_at, sid, event, tool: input.tool_name, tokens, measurement: m.status, level,
    action: res.output?.hookSpecificOutput?.permissionDecision || res.output?.decision || (res.output?.continue === false ? 'stop' : 'allow'),
  }) + '\n');

  if (res.output) process.stdout.write(JSON.stringify(res.output));
  process.exit(res.exitCode);
}

try {
  main();
} catch (e) {
  // Internal error: visible, logged, non-blocking (a controller bug must not brick the session silently).
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(path.join(stateDir, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), error: String(e.stack || e) }) + '\n');
  } catch { /* ignore */ }
  process.stdout.write(JSON.stringify({ systemMessage: `JEV_ROTATION_CONTROLLER_ERROR: ${e.message} — enforcement degraded, check ${stateDir}/events.jsonl` }));
  process.exit(0);
}
