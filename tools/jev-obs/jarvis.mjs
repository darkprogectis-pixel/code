// JARVIS read model for the control plane: reads var/jarvis files written by tools/jarvis/server.mjs and bench.mjs.
// Read-only, never calls the JARVIS server, the voice models or the JEV. Raw audio does not exist in these files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCycles, readStatus } from '../jarvis/voice-log.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const jarvisDir = () => path.join(REPO, 'var', 'jarvis');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function jarvisStatus(dir = jarvisDir()) {
  const s = readStatus(dir), age = s.at ? Date.now() - Date.parse(s.at) : null;
  return { ...s, heartbeat_age_ms: age, alive: age != null && age < 60000, url: s.port ? `http://127.0.0.1:${s.port}/` : null };
}
export function jarvisBench(dir = jarvisDir()) {
  const b = readJson(path.join(dir, 'bench-latest.json'));
  if (!b) return { status: 'NO_DATA' };
  for (const s of Object.values(b.stt || {})) delete s.samples;
  return { status: 'OK', ...b };
}
// Returns a JSON-able body for /api/jarvis/* or null when the path is not a jarvis route.
export function jarvisRoute(u, dir = jarvisDir()) {
  if (u.pathname === '/api/jarvis/status') return jarvisStatus(dir);
  if (u.pathname === '/api/jarvis/cycles') return readCycles(dir, Math.max(1, Math.min(2000, Number(u.searchParams.get('limit')) || 100)));
  if (u.pathname === '/api/jarvis/bench') return jarvisBench(dir);
  return null;
}
