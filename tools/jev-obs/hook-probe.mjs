// JEV Observability — decision-neutral hook timing probe (Phase 1, observational only).
// Loaded by the hooks via `try { await import('../jev-obs/hook-probe.mjs'); } catch {}`.
// It never changes stdout bytes, exit code, stderr or control flow: stdout.write is a pure passthrough that
// only counts/inspects; on 'exit' it appends ONE metrics line (try/catch). No prompt/stdin content is stored.
// Disable with JEV_OBS_PROBE=0. Hook test suites (JEV_ROTATION_TEST/JEV_FINISH_TEST=1) record nothing unless JEV_OBS_DIR is set.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const env = process.env;
const testRun = (env.JEV_ROTATION_TEST === '1' || env.JEV_FINISH_TEST === '1') && !env.JEV_OBS_DIR;
if (env.JEV_OBS_PROBE !== '0' && !testRun && !globalThis.__jevObsProbe) {
  globalThis.__jevObsProbe = true;
  const hook = /jev-finish/i.test(process.argv[1] || '') ? 'jev-finish' : /jev-rotation/i.test(process.argv[1] || '') ? 'jev-rotation' : path.basename(path.dirname(process.argv[1] || '?'));
  const obsDir = env.JEV_OBS_DIR || path.join(env.CLAUDE_CONFIG_DIR || path.join(env.USERPROFILE || env.HOME || '.', '.claude'), 'jev-obs');
  let out = '';
  const orig = process.stdout.write;
  process.stdout.write = function (chunk, ...rest) {
    try { if (out.length < 200000) out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'); } catch { /* ignore */ }
    return orig.call(this, chunk, ...rest);
  };
  // stdin belongs to the hook (never read here): `event` is known only when the hook prints hookSpecificOutput;
  // silent "allow" runs are recorded with event=null (documented limitation, Phase 1).
  process.on('exit', (code) => {
    try {
      let blocked = false, injected = 0, event = null, parsed = null, error = null;
      try { parsed = out ? JSON.parse(out) : null; } catch { parsed = null; }
      if (parsed) {
        const h = parsed.hookSpecificOutput || {};
        event = h.hookEventName || null;
        blocked = parsed.decision === 'block' || parsed.continue === false || h.permissionDecision === 'deny';
        injected = (h.additionalContext ? String(h.additionalContext).length : 0) + (parsed.systemMessage ? String(parsed.systemMessage).length : 0)
          + (parsed.reason && parsed.decision === 'block' ? String(parsed.reason).length : 0);
        if (parsed.systemMessage && /_ERROR:/.test(parsed.systemMessage)) error = 'HOOK_REPORTED_ERROR';
      }
      if (code === 2) blocked = true;
      const rec = { at: new Date().toISOString(), hook, event, duration_ms: Math.round(performance.now() * 10) / 10, exit_code: code,
        blocked, injected_chars: injected, stdout_chars: out.length, error, pid: process.pid };
      fs.mkdirSync(obsDir, { recursive: true });
      fs.appendFileSync(path.join(obsDir, 'hook-metrics.ndjson'), JSON.stringify(rec) + '\n');
    } catch { /* observability only */ }
  });
}
