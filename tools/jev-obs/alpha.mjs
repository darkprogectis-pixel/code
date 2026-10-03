// ALPHA SIGNAL INTELLIGENCE read model for the control plane: reads var/alpha files written by src/alpha/service.mjs.
// Read-only, never calls the specialists, the APIs or the JEV.
import fs from 'node:fs';
import path from 'node:path';
import { stateDir } from '../../src/alpha/config.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
function tailLines(f, n) {
  let s; try { s = fs.readFileSync(f, 'utf8'); } catch { return []; }
  const out = [];
  for (const l of s.trim().split('\n').slice(-n)) { try { out.push(JSON.parse(l)); } catch { /* partial line */ } }
  return out;
}

export function alphaLatest(dir = stateDir()) {
  const l = readJson(path.join(dir, 'latest.json'));
  if (!l) return { status: 'NO_DATA', dir: path.basename(dir) };
  const svc = readJson(path.join(dir, 'service.json'));
  return { status: 'OK', ...l, age_ms: Date.now() - Date.parse(l.at), service: svc };
}

export function alphaHistory(dir = stateDir(), limit = 200) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^history-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort() : [];
  let rows = [];
  for (let i = files.length - 1; i >= 0 && rows.length < limit; i--) rows = tailLines(path.join(dir, files[i]), limit - rows.length).concat(rows);
  const outcomes = tailLines(path.join(dir, 'outcomes.ndjson'), 500);
  const byCycle = Object.fromEntries(outcomes.map((o) => [o.cycle_id, o]));
  const flips = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].signal !== rows[i - 1].signal) flips.push({ at: rows[i].at, from: rows[i - 1].signal, to: rows[i].signal });
  return { rows: rows.map((r) => ({ ...r, outcome: byCycle[r.cycle_id] ? { label: byCycle[r.cycle_id].label, horizons: byCycle[r.cycle_id].horizons } : null })), flips, files: files.length };
}

export function alphaMetrics(dir = stateDir()) {
  const pending = readJson(path.join(dir, 'outcomes-pending.json')) || [];
  const labeled = tailLines(path.join(dir, 'outcomes.ndjson'), 100000);
  return { metrics: readJson(path.join(dir, 'metrics.json')), service: readJson(path.join(dir, 'service.json')), jev_state: readJson(path.join(dir, 'jev-state.json')),
    outcomes: { LABEL_PENDING: pending.length, LABELED: labeled.length } };
}

// Returns a JSON-able body for /api/alpha/* or null when the path is not an alpha route.
export function alphaRoute(u, dir = stateDir()) {
  if (u.pathname === '/api/alpha/latest') return alphaLatest(dir);
  if (u.pathname === '/api/alpha/history') return alphaHistory(dir, Math.max(1, Math.min(2000, Number(u.searchParams.get('limit')) || 200)));
  if (u.pathname === '/api/alpha/metrics') return alphaMetrics(dir);
  return null;
}
