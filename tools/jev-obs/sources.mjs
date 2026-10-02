// JEV Observability — source resolution + tolerant read-only readers. Never writes to a source of truth.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const env = process.env;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = env.USERPROFILE || env.HOME || '.';

export function paths(over = {}) {
  const configDir = over.configDir || env.JEV_OBS_CONFIG_DIR || env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude-darkprogectis');
  const jevLogs = over.jevLogs || env.JEV_OBS_JEV_LOGS || path.join(HOME, '.claude', 'alfaomega-context', 'logs');
  const repoRoot = over.repoRoot || env.JEV_OBS_REPO_ROOT || path.resolve(HERE, '..', '..');
  const obsDir = over.obsDir || env.JEV_OBS_DIR || path.join(configDir, 'jev-obs');
  return {
    configDir, jevLogs, repoRoot, obsDir,
    projects: path.join(configDir, 'projects'),
    routing: path.join(jevLogs, 'jev-routing.ndjson'),
    decisions: path.join(jevLogs, 'jev-decisions.ndjson'),
    models: path.join(jevLogs, 'jev-models.ndjson'),
    coverage: path.join(jevLogs, 'jev-coverage-tests.ndjson'),
    legacyRotation: path.join(jevLogs, 'rotation-events.ndjson'),
    routerFeedback: path.join(jevLogs, 'router-feedback.ndjson'),
    rotEvents: path.join(configDir, 'jev-rotation', 'events.jsonl'),
    lineage: path.join(configDir, 'jev-rotation', 'lineage.jsonl'),
    loops: path.join(configDir, 'jev-finish', 'loops'),
    rotationBriefs: path.join(repoRoot, 'handoffs', 'rotation'),
    auditResults: path.join(repoRoot, 'handoffs', 'assets', 'JEV_POTENTIAL_AUDIT_20261002_results.json'),
    hookMetrics: path.join(obsDir, 'hook-metrics.ndjson'),
    outcomes: path.join(obsDir, 'outcomes.ndjson'),
    shadowLedger: path.join(obsDir, 'jev-shadow-ledger.ndjson'),
    derived: path.join(obsDir, 'derived'),
  };
}

export function statOf(p) {
  try { const s = fs.statSync(p); return { exists: true, bytes: s.size, mtime: s.mtime.toISOString(), mtimeMs: s.mtimeMs }; }
  catch { return { exists: false, bytes: 0, mtime: null, mtimeMs: 0 }; }
}

export function sha12(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12); }

// Tolerant NDJSON/JSONL reader: corrupt/partial lines are counted, never fatal; missing file => empty + exists:false.
export function readNdjson(p) {
  const st = statOf(p);
  const status = { path: p, ...st, lines: 0, bad_lines: 0, sha12: null };
  if (!st.exists) return { rows: [], status };
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { return { rows: [], status: { ...status, exists: false, error: e.code || String(e) } }; }
  status.sha12 = sha12(buf);
  const rows = [];
  for (const line of buf.toString('utf8').split('\n')) {
    const l = line.trim();
    if (!l) continue;
    status.lines++;
    try { const o = JSON.parse(l); if (o && typeof o === 'object') rows.push(o); else status.bad_lines++; } catch { status.bad_lines++; }
  }
  return { rows, status };
}

export function readJsonFile(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function listFiles(dir, filter = () => true, recursive = false) {
  let out = [];
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (recursive) out = out.concat(listFiles(p, filter, true)); }
    else if (filter(p)) out.push(p);
  }
  return out;
}
