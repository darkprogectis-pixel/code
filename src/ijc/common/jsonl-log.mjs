// Log estruturado JSONL por componente (engine, bridge, robot, control-plane, agent), rotacao mensal.
// Campos: ts, component, event, severity, snapshot_id, intention_id, state, reason (+ extras sanitizados).
// NUNCA grava token/credencial/segredo: chaves sensiveis sao removidas e valores proibidos (ex.: o token) sao mascarados.
// Falha de escrita nunca propaga (conta em failures): log que derruba o sistema e pior que log ausente.
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { subDir } from './paths.mjs';

const SENSITIVE_KEY = /token|secret|password|passwd|credential|authorization|api[_-]?key|cookie/i;
const SEVERITIES = new Set(['debug', 'info', 'warn', 'error', 'critical']);

export function sanitize(value, forbidden = [], depth = 0) {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') { let s = value; for (const f of forbidden) if (f && s.includes(f)) s = s.split(f).join('[REDACTED]'); return s.slice(0, 2000); }
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitize(v, forbidden, depth + 1));
  if (value && typeof value === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : sanitize(v, forbidden, depth + 1);
    return o;
  }
  return value;
}

export function createLogger(component, opts = {}) {
  const dir = opts.dir || subDir('logs');
  const forbidden = opts.forbidden || [];
  const state = { written: 0, failures: 0, last_error: null };
  const file = (d) => path.join(dir, `${component}-${d.toISOString().slice(0, 7)}.jsonl`);
  function log(event, fields = {}) {
    const now = new Date();
    const sev = SEVERITIES.has(fields.severity) ? fields.severity : 'info';
    const { severity, snapshot_id, intention_id, state: st, reason, ...extra } = fields;
    const rec = sanitize({ ts: now.toISOString(), component, event, severity: sev, snapshot_id: snapshot_id ?? null, intention_id: intention_id ?? null, state: st ?? null, reason: reason ?? null, ...extra }, forbidden);
    try { appendFileSync(file(now), JSON.stringify(rec) + '\n'); state.written++; } catch (e) { state.failures++; state.last_error = e.code || 'write_error'; }
    return rec;
  }
  return { log, stats: () => ({ ...state, dir }), addForbidden: (v) => { if (v) forbidden.push(v); } };
}
