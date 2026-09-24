// JEV Rotation Controller V2 — pure logic (no I/O except measureTranscript).
// Measurement source: the Anthropic API `usage` block that Claude Code writes on
// every assistant message of the session transcript (JSONL). Context occupied
// after a response = input_tokens + cache_creation_input_tokens
//                   + cache_read_input_tokens + output_tokens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEVELS = ['OK', 'WARNING', 'SOFT_STOP', 'HARD_ROTATION', 'CEILING_BREACH'];
export const rank = (l) => Math.max(0, LEVELS.indexOf(l));
export const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);
export const ROTATE = 'ROTATE_SESSION_NOW';

export function loadConfig(env = process.env) {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
  let th = { ...cfg.thresholds };
  // Test-only override, ignored unless JEV_ROTATION_TEST=1 (the launcher clears both).
  if (env.JEV_ROTATION_TEST === '1' && env.JEV_ROTATION_THRESHOLDS) {
    const [warning, soft_stop, hard_rotation, ceiling] = env.JEV_ROTATION_THRESHOLDS.split(',').map(Number);
    th = { warning, soft_stop, hard_rotation, ceiling };
  }
  const ok = [th.warning, th.soft_stop, th.hard_rotation, th.ceiling].every((n) => Number.isFinite(n) && n > 0)
    && th.warning < th.soft_stop && th.soft_stop < th.hard_rotation && th.hard_rotation < th.ceiling;
  if (!ok) throw new Error(`invalid thresholds ${JSON.stringify(th)}`);
  return { ...cfg, thresholds: th };
}

export function levelFor(tokens, th) {
  if (tokens >= th.ceiling) return 'CEILING_BREACH';
  if (tokens >= th.hard_rotation) return 'HARD_ROTATION';
  if (tokens >= th.soft_stop) return 'SOFT_STOP';
  if (tokens >= th.warning) return 'WARNING';
  return 'OK';
}

export function usageTotal(u) {
  return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
}

// Returns { status: 'MEASURED'|'NO_USAGE_YET'|'UNAVAILABLE', tokens, ... }.
// Reads only the tail of the file first (transcripts reach several MB).
export function measureTranscript(transcriptPath) {
  if (!transcriptPath) return { status: 'UNAVAILABLE', tokens: null, error: 'no transcript_path' };
  let fd;
  try {
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) return { status: 'UNAVAILABLE', tokens: null, error: 'transcript is not a file' };
    const size = stat.size;
    fd = fs.openSync(transcriptPath, 'r');
    for (const chunk of [2 * 1024 * 1024, size]) {
      const len = Math.min(chunk, size);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      if (len < size) lines.shift(); // first line may be partial
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"usage"')) continue;
        let o;
        try { o = JSON.parse(lines[i]); } catch { continue; }
        if (o.type !== 'assistant' || o.isSidechain || !o.message?.usage) continue;
        const tokens = usageTotal(o.message.usage);
        if (tokens <= 0) continue; // synthetic/error messages carry zero usage
        return { status: 'MEASURED', tokens, uuid: o.uuid, model: o.message.model, at: o.timestamp };
      }
      if (len === size) break;
    }
    return { status: 'NO_USAGE_YET', tokens: 0 };
  } catch (e) {
    // A brand-new session has no transcript file until its first message.
    if (e.code === 'ENOENT') return { status: 'NO_USAGE_YET', tokens: 0 };
    return { status: 'UNAVAILABLE', tokens: null, error: String(e.message || e) };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

export function isHandoffPath(filePath, repoRoot) {
  if (!filePath) return false;
  const dir = norm(path.join(repoRoot, 'handoffs')) + '/';
  const p = norm(path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath));
  return p.startsWith(dir) && p.endsWith('.md');
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const SOFT_ALLOWED = new Set(['Read', 'Glob', 'Write', 'Edit', 'MultiEdit', 'TodoWrite']);

function readBounded(input, cfg, fileSize, zone = 'soft_stop') {
  const lim = Number(input.limit);
  if (Number.isFinite(lim) && lim > 0 && lim <= cfg[`${zone}_read_max_lines`]) return true;
  const size = fileSize(input.file_path);
  return size !== null && size <= cfg[`${zone}_read_max_bytes`];
}

export function isHandoffOp(tool, input, ctx) {
  if (WRITE_TOOLS.has(tool)) return isHandoffPath(input.file_path, ctx.repoRoot);
  if (tool === 'Read') return isHandoffPath(input.file_path, ctx.repoRoot) && readBounded(input, ctx.cfg, ctx.fileSize);
  return false;
}

function tokStr(n) { return n === null || n === undefined ? 'UNKNOWN' : `${n}`; }

// ctx: { level, tokens, cfg, repoRoot, fileSize(p)->bytes|null, handoffFresh:boolean, nag:boolean, measurement }
// Returns { output: object|null, exitCode: 0 }.
export function decide(event, input, ctx) {
  const th = ctx.cfg.thresholds;
  const t = tokStr(ctx.tokens);
  const lvl = ctx.level;
  const r = rank(lvl);
  const handoffOnly = ctx.cfg.handoff_only_prompt_token;
  const rotateMsg = `${ROTATE} — JEV context ${t} tokens (level ${lvl}; hard ${th.hard_rotation}, ceiling ${th.ceiling}). `
    + `This instance is locked: only handoff edits (handoffs/*.md) are allowed. Update the handoff, then /exit and `
    + `start a new instance with START_JEV_CLAUDE.ps1. Do NOT use /clear.`;
  const out = (o) => ({ output: o, exitCode: 0 });
  // Inside the reserve below the ceiling not even handoff edits run: the turn is
  // stopped and the mechanical AUTO_ROTATION snapshot is the handoff.
  const inReserve = r >= rank('HARD_ROTATION') && (ctx.tokens ?? th.ceiling) >= th.ceiling - ctx.cfg.handoff_reserve_tokens;
  const reserveStop = { continue: false, stopReason: `${ROTATE} — context ${t} tokens within ${ctx.cfg.handoff_reserve_tokens} of the ${th.ceiling} ceiling: `
    + `session stopped by the controller; handoffs/rotation/AUTO_ROTATION_*.md is the handoff. /exit and start a new instance.` };
  const degraded = ctx.measurement?.status === 'UNAVAILABLE'
    ? `JEV_ROTATION_MEASUREMENT_UNAVAILABLE (${ctx.measurement.error}) — enforcement uses last known level ${lvl}.` : null;

  switch (event) {
    case 'SessionStart':
      return out({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext:
        `JEV Rotation Controller V2 active (external hook). Absolute thresholds: warning ${th.warning}, soft stop ${th.soft_stop}, `
        + `hard rotation ${th.hard_rotation}, ceiling ${th.ceiling} tokens. Blocking is enforced by hooks, not by the model.` } });

    case 'UserPromptSubmit': {
      const prompt = String(input.prompt || '');
      if (inReserve) return out({ decision: 'block', reason: reserveStop.stopReason });
      if (r >= rank('SOFT_STOP')) {
        if (prompt.includes(handoffOnly)) {
          return out({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext:
            `${handoffOnly} mode at ${t} tokens (${lvl}): only update handoffs/*.md, then stop and report ${ROTATE}.` } });
        }
        const reason = r >= rank('HARD_ROTATION') ? rotateMsg
          : `JEV_SOFT_STOP — context ${t} tokens >= ${th.soft_stop}: new batch blocked. Send a prompt containing `
            + `${handoffOnly} to update the handoff, then /exit and rotate. ${ROTATE}`;
        return out({ decision: 'block', reason });
      }
      if (r >= rank('WARNING')) {
        const msg = `JEV_ROTATION_WARNING — context ${t} tokens >= ${th.warning}. Handoff update is mandatory now; `
          + `new batches are blocked at ${th.soft_stop}, rotation forced at ${th.hard_rotation}.`;
        return out({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: msg } });
      }
      return out(degraded ? { systemMessage: degraded } : null);
    }

    case 'PreToolUse': {
      const tool = input.tool_name;
      const ti = input.tool_input || {};
      const deny = (reason) => out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
      if (inReserve) return out({ ...reserveStop, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reserveStop.stopReason } });
      if (r >= rank('HARD_ROTATION')) {
        return isHandoffOp(tool, ti, ctx) ? out(null) : deny(rotateMsg);
      }
      if (r >= rank('SOFT_STOP')) {
        if (!SOFT_ALLOWED.has(tool)) return deny(`JEV_SOFT_STOP — context ${t} tokens >= ${th.soft_stop}: tool ${tool} blocked (unbounded output). Finish, update the handoff and rotate. ${ROTATE}`);
        if (tool === 'Read' && !readBounded(ti, ctx.cfg, ctx.fileSize)) {
          return deny(`JEV_SOFT_STOP — Read must use limit <= ${ctx.cfg.soft_stop_read_max_lines} lines (or file <= ${ctx.cfg.soft_stop_read_max_bytes} bytes).`);
        }
        return out(null);
      }
      if (r >= rank('WARNING') && tool === 'Read' && !readBounded(ti, ctx.cfg, ctx.fileSize, 'warning')) {
        return deny(`JEV_ROTATION_WARNING — context ${t} tokens: Read must use limit <= ${ctx.cfg.warning_read_max_lines} lines (or file <= ${ctx.cfg.warning_read_max_bytes} bytes) to protect the ${th.ceiling} ceiling.`);
      }
      return out(degraded ? { systemMessage: degraded } : null);
    }

    case 'PostToolUse': {
      if (r >= rank('HARD_ROTATION') && isHandoffOp(input.tool_name, input.tool_input || {}, ctx) && WRITE_TOOLS.has(input.tool_name)) {
        return out({ continue: false, stopReason: `${ROTATE} — handoff updated at ${t} tokens. /exit this instance and start a new one with START_JEV_CLAUDE.ps1.` });
      }
      if (r >= rank('WARNING') && ctx.nag) {
        const msg = r >= rank('SOFT_STOP')
          ? `JEV_SOFT_STOP active (${t} tokens). Wrap up now: update the handoff and report ${ROTATE}.`
          : `JEV_ROTATION_WARNING (${t} tokens >= ${th.warning}): update the handoff before starting anything new.`;
        return out({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } });
      }
      return out(null);
    }

    case 'Stop': {
      if (r >= rank('WARNING') && !ctx.handoffFresh && !input.stop_hook_active && !inReserve) {
        return out({ decision: 'block', reason:
          `JEV handoff mandatory: context ${t} tokens (${lvl}) and no handoffs/*.md was updated since the threshold was crossed. `
          + `Update the current handoff now (exact state, modified/untracked files, tests run, uncommitted changes, exact next step)`
          + (r >= rank('SOFT_STOP') ? `, then report ${ROTATE}.` : '.') });
      }
      if (r >= rank('SOFT_STOP')) return out({ systemMessage: rotateMsg });
      return out(null);
    }

    default:
      return out(null);
  }
}
