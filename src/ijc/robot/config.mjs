// Config do ROBOT (config/ijc-robot-v1.json). Limites de risco sem default: null = UNSET = impede armar.
// Nenhuma chave de config liga execucao: chaves desse tipo sao ERRO estrutural.
import { readFileSync } from 'node:fs';
import { JevFatalError } from '../../jev/artifacts.mjs';

const FORBIDDEN_KEYS = /JEV_CAN_|execution_enabled|enable_orders|send_orders|live_orders|allow_real|order_path/i;
const RISK_KEYS = ['max_position_contracts', 'max_open_positions', 'max_orders_per_session', 'daily_loss_limit_usd'];

function scanForbidden(obj, where = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.test(k)) throw new JevFatalError(`config do robo nao pode conter "${where}${k}" (execucao so por codigo + ordem do operador)`);
    scanForbidden(v, `${where}${k}.`);
  }
}

export function loadRobotConfig(p) {
  let c;
  try { c = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new JevFatalError(`config do robo ilegivel: ${p} (${e.code || e.message})`); }
  if (c.schema !== 'ijc-robot-config/v1') throw new JevFatalError('config do robo: schema desconhecido');
  scanForbidden(c);
  const risk = c.risk || {};
  for (const k of RISK_KEYS) if (!(k in risk)) throw new JevFatalError(`config do robo: risk.${k} ausente (use null para UNSET)`);
  for (const k of RISK_KEYS) if (risk[k] !== null && !(Number.isFinite(risk[k]) && risk[k] > 0)) throw new JevFatalError(`config do robo: risk.${k} deve ser null (UNSET) ou numero > 0`);
  const pol = c.policies || {};
  return {
    risk: Object.fromEntries(RISK_KEYS.map((k) => [k, risk[k]])),
    policies: {
      session_policy: pol.session_policy === 'RTH' ? 'RTH' : null,
      emergency_flatten_owned: typeof pol.emergency_flatten_owned === 'boolean' ? pol.emergency_flatten_owned : null,
      session_close_owned: ['flatten', 'keep'].includes(pol.session_close_owned) ? pol.session_close_owned : null,
    },
    execution_policy_ref: c.execution_policy_ref ?? null,
    engine_max_age_ms: Number.isFinite(c.engine_max_age_ms) ? c.engine_max_age_ms : 90000,
    executor_heartbeat_max_age_ms: Number.isFinite(c.executor_heartbeat_max_age_ms) ? c.executor_heartbeat_max_age_ms : 5000,
    kill_file: typeof c.kill_file === 'string' ? c.kill_file : null,
  };
}
export { RISK_KEYS };
