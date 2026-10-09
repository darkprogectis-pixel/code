#!/usr/bin/env node
// JEV Token Hygiene V1 — keeps abnormally large tool output out of the conversation context.
// Separate from the Rotation Controller V3 (tools/jev-rotation/** untouched, thresholds untouched). FAIL-OPEN: any error => exit 0, no output.
//   PreToolUse  Read            no explicit limit + file > big_file_bytes  => updatedInput.limit (explicit limit always honoured)
//   PreToolUse  Grep            no explicit head_limit                     => small default head_limit
//   PreToolUse  Bash/PowerShell unbounded git diff/show/log or dump of a big file => deny with the bounded alternative (escape: marker)
//   PostToolUse Bash/PowerShell/Grep/Read/mcp__*  output > output_cap_chars => full output saved locally, model gets summary + path
// Every PostToolUse is recorded in <profile>/jev-token-hygiene/ledger/<session>.ndjson (see status.mjs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
export const baseDir = (env = process.env) =>
  env.JEV_TOKEN_HYGIENE_DIR || path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'jev-token-hygiene');
const safeId = (s) => String(s || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);

const LIMITER = /\|\s*(head|tail|wc|more|less|select(-object)?\s+-(first|last|skip)|measure(-object)?|out-file|set-content|out-null|grep\s+-(c|q|l)\b)|(^|[^0-9&>])>{1,2}\s*[^&\s|>]|-(TotalCount|Tail|First|Last|Head)\b/i;
const GIT_BOUNDED = /--(stat|name-only|name-status|shortstat|numstat|quiet|check|no-patch|summary|dirstat)\b|\s-s\b|\s--\s+\S/;
const GIT_LOG_COUNT = /\s-\d+\b|\s-n\s*\d+|--max-count[=\s]\d+/;
const SEGMENTS = /&&|\|\||;|\r?\n/;

// quoted strings and heredoc bodies are not commands
const stripLiterals = (c) => c
  .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, '""')
  .replace(/@(['"])[\s\S]*?\n\1@/g, '""')
  .replace(/'[^']*'/g, '""').replace(/"(?:[^"\\]|\\.)*"/g, '""');

const toWinPath = (p) => (process.platform === 'win32' && /^\/[a-zA-Z]\//.test(p) ? `${p[1]}:${p.slice(2)}` : p);
const fileSize = (p, cwd) => {
  try { const st = fs.statSync(path.resolve(cwd || process.cwd(), toWinPath(p.replace(/^~(?=[\\/])/, os.homedir())))); return st.isFile() ? st.size : 0; } catch { return 0; }
};

export function shellVerdict(command, cwd) {
  const cmd = String(command || '');
  if (!cmd || cmd.includes(CFG.escape_marker)) return null;
  for (const seg of stripLiterals(cmd).split(SEGMENTS)) {
    const g = seg.match(/(?:^|[\s(|&])git\s+(?:-C\s+\S+\s+|--no-pager\s+|-c\s+\S+\s+)*(diff|show|log)\b(.*)$/i);
    if (!g || LIMITER.test(seg)) continue;
    const sub = g[1].toLowerCase(), rest = g[2];
    const patch = sub !== 'log' || /\s(-p|--patch|-u)\b/.test(rest);
    if (patch && !GIT_BOUNDED.test(rest))
      return `git ${sub} sem limite. Comece por --stat / --name-only; hunks completos apenas por arquivo (git ${sub} ... -- <arquivo>) ou redirecionados para arquivo.`;
    if (!patch && !GIT_LOG_COUNT.test(rest))
      return 'git log sem limite. Use -n <N> (por exemplo: git log --oneline -n 15).';
  }
  // dump of a big file: the path is taken from the original command (quotes kept)
  for (const seg of cmd.split(SEGMENTS)) {
    const d = seg.match(/^\s*(?:cat|type|gc|Get-Content)\s+(?:-(?:Path|LiteralPath|Raw)\s+)*(?:"([^"]+)"|'([^']+)'|([^\s|;&<>]+))/i);
    if (!d || LIMITER.test(seg)) continue;
    const size = fileSize(d[1] || d[2] || d[3], cwd);
    if (size > CFG.big_file_bytes)
      return `despejo de arquivo grande (${size} bytes). Use Read com offset/limit, ou Grep, ou um limitador (| head -n N · -TotalCount N).`;
  }
  return null;
}

export function preToolUse(ev) {
  const t = ev.tool_name, input = ev.tool_input || {};
  const reply = (o) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...o } });
  if (t === 'Read') {
    if (input.limit != null || input.pages != null || !input.file_path) return null;
    if (/\.(png|jpe?g|gif|webp|bmp|pdf|ipynb)$/i.test(input.file_path)) return null;
    const size = fileSize(input.file_path, ev.cwd);
    if (size <= CFG.big_file_bytes) return null;
    return reply({
      updatedInput: { ...input, limit: CFG.read_default_limit_lines },
      additionalContext: `TOKEN_HYGIENE: ${input.file_path} tem ${size} bytes; Read sem limit foi limitado a ${CFG.read_default_limit_lines} linhas. Para mais, passe offset/limit explícitos (são respeitados).`,
    });
  }
  if (t === 'Grep') {
    if (input.head_limit != null) return null;
    const mode = input.output_mode || 'files_with_matches';
    return reply({
      updatedInput: { ...input, head_limit: mode === 'content' ? CFG.grep_head_limit_content : CFG.grep_head_limit_other },
    });
  }
  if (t === 'Bash' || t === 'PowerShell') {
    const why = shellVerdict(input.command, ev.cwd);
    if (why) return reply({
      permissionDecision: 'deny',
      permissionDecisionReason: `TOKEN_HYGIENE: ${why} Saída grande deve ir para arquivo local, com resumo/contagem na conversa. Se a saída integral for realmente necessária, inclua o marcador ${CFG.escape_marker} no comando (por exemplo, num comentário).`,
    });
  }
  return null;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
export function summarize(text, file) {
  const S = CFG.summary, lines = text.split(/\r?\n/);
  const cl = (arr, max) => clip(arr.map((l) => clip(l, S.line_max_chars)).join('\n'), max);
  const head = lines.slice(0, S.head_lines);
  const tail = lines.length > S.head_lines ? lines.slice(-Math.min(S.tail_lines, lines.length - S.head_lines)) : [];
  const errs = lines.filter((l) => /\b(error|erro|fail(ed|ure)?|exception|fatal|traceback|not ok|refused)\b/i.test(l)).slice(0, S.error_lines);
  return [
    `[TOKEN_HYGIENE: saída de ${text.length} caracteres / ${lines.length} linhas retida fora do contexto]`,
    `FULL_OUTPUT_PATH = ${file}`,
    `ERROR_LINES = ${errs.length}${errs.length ? `\n${cl(errs, S.error_max_chars)}` : ''}`,
    `--- primeiras ${head.length} linhas ---`, cl(head, S.head_max_chars),
    ...(tail.length ? [`--- últimas ${tail.length} linhas ---`, tail.map((l) => clip(l, S.line_max_chars)).join('\n').slice(-S.tail_max_chars)] : []),
    '[use Read com offset/limit ou Grep sobre FULL_OUTPUT_PATH para detalhes]',
  ].join('\n');
}

const REWRITE = (t) => ['Bash', 'PowerShell', 'Grep', 'Read'].includes(t) || /^mcp__/.test(t);
const SKIP_KEY = /^(data|base64|image|blob|signature)$/i;
export const total = (v, k = '') => typeof v === 'string' ? (SKIP_KEY.test(k) ? 0 : v.length)
  : v && typeof v === 'object' ? Object.entries(v).reduce((a, [kk, x]) => a + total(x, kk), 0) : 0;

export function postToolUse(ev, env = process.env) {
  const t = ev.tool_name, resp = ev.tool_response, sid = safeId(ev.session_id), base = baseDir(env);
  const chars = total(resp), saved = [];
  let action = 'PASS', out = null;
  const isBinaryRead = t === 'Read' && resp && typeof resp === 'object' && resp.type && resp.type !== 'text';
  if (chars > CFG.output_cap_chars && REWRITE(t) && !isBinaryRead) {
    const dir = path.join(base, 'outputs', sid);
    fs.mkdirSync(dir, { recursive: true });
    // the replacement keeps the tool's own output shape: only the oversized strings are swapped
    const walk = (v, k = '') => {
      if (typeof v === 'string') {
        if (SKIP_KEY.test(k) || v.length < CFG.rewrite_string_min_chars) return v;
        const file = path.join(dir, `${Date.now()}-${safeId(ev.tool_use_id).slice(-8)}-${safeId(t)}-${saved.length}.txt`);
        fs.writeFileSync(file, v);
        saved.push(file);
        return summarize(v, file);
      }
      if (Array.isArray(v)) return v.map((x) => walk(x, k));
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, walk(x, kk)]));
      return v;
    };
    const updated = walk(resp);
    if (saved.length) {
      action = 'CAPPED';
      out = { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: updated } };
    } else action = 'LARGE_NOT_REWRITTEN';
  } else if (chars > CFG.output_cap_chars) action = 'LARGE_NOT_REWRITTEN';
  try {
    fs.mkdirSync(path.join(base, 'ledger'), { recursive: true });
    fs.appendFileSync(path.join(base, 'ledger', `${sid}.ndjson`),
      `${JSON.stringify({ ts: new Date().toISOString(), tool: t, chars, action, returned_chars: out ? total(out.hookSpecificOutput.updatedToolOutput) : chars, saved })}\n`);
  } catch { /* ledger is best effort */ }
  return out;
}

function main() {
  const ev = JSON.parse(fs.readFileSync(0, 'utf8'));
  const res = ev.hook_event_name === 'PreToolUse' ? preToolUse(ev) : ev.hook_event_name === 'PostToolUse' ? postToolUse(ev) : null;
  if (res) process.stdout.write(JSON.stringify(res));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { /* FAIL-OPEN */ }
  process.exit(0);
}
