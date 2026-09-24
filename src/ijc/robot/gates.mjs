// Gates de habilitacao do ROBOT. Todos obrigatorios; ARMED so e possivel com TODOS em PASS.
// Neste build: L0 (JEV_CAN_SEND_ORDER=false), politica de execucao ausente e regra de lado ausente => ARMED IMPOSSIVEL.
import { existsSync } from 'node:fs';
import { SAFETY, ORDER_PATH, EXECUTION_POLICY, isEligibleProvider } from './constants.mjs';
import { RISK_KEYS } from './config.mjs';

export function evaluateGates({ snapshot, executor, config, now = Date.now(), activeSideRules = [] }) {
  const g = [];
  const add = (id, pass, detail) => g.push({ id, pass: !!pass, detail });
  const o = snapshot && snapshot.output;

  add('L0_SEND_ORDER_LOCK', SAFETY.JEV_CAN_SEND_ORDER === true, SAFETY.JEV_CAN_SEND_ORDER ? 'liberado' : 'JEV_CAN_SEND_ORDER=false (constante do build)');
  add('ORDER_PATH', ORDER_PATH.state !== 'HARD_DISABLED', ORDER_PATH.state === 'HARD_DISABLED' ? 'caminho de ordens HARD_DISABLED neste build' : 'ok');
  add('KILL_FILE_ABSENT', !(config.kill_file && existsSync(config.kill_file)), config.kill_file && existsSync(config.kill_file) ? 'kill file presente' : 'ok');
  add('EXECUTION_POLICY', EXECUTION_POLICY !== null && config.execution_policy_ref !== null, 'politica de execucao pre-registrada: ' + (EXECUTION_POLICY ? 'presente' : 'AUSENTE'));
  add('ACTIVE_SIDE_RULE', activeSideRules.length > 0, `regras de lado ativas: ${activeSideRules.length}`);
  for (const k of RISK_KEYS) add(`RISK_${k.toUpperCase()}`, config.risk[k] !== null, config.risk[k] === null ? 'UNSET' : String(config.risk[k]));
  add('POLICY_EMERGENCY_FLATTEN_OWNED', config.policies.emergency_flatten_owned !== null, config.policies.emergency_flatten_owned === null ? 'UNSET (definir ANTES de armar)' : String(config.policies.emergency_flatten_owned));
  add('POLICY_SESSION_CLOSE_OWNED', config.policies.session_close_owned !== null, config.policies.session_close_owned || 'UNSET');

  const ex = executor || null;
  const hbAge = ex && ex.received_at ? now - ex.received_at : null;
  add('EXECUTOR_HEALTHY', !!ex && hbAge !== null && hbAge <= config.executor_heartbeat_max_age_ms && ex.nt8_ready === true, !ex ? 'executor nao reportou' : `heartbeat ${hbAge} ms; nt8_ready=${ex.nt8_ready}`);
  const acct = ex && ex.selected_account ? (ex.accounts || []).find((a) => a.name === ex.selected_account) : null;
  add('ACCOUNT_SIMULATOR_OR_PLAYBACK', !!acct && isEligibleProvider(acct.provider), !acct ? 'nenhuma conta selecionada/reportada' : `provider=${acct.provider}`);
  add('ACCOUNT_CONNECTED', !!acct && acct.connection === 'Connected', acct ? `conexao=${acct.connection}` : 'sem conta');
  add('RECONCILIATION_COMPLETE', !!ex && ex.reconciliation && ex.reconciliation.status === 'COMPLETE' && (ex.reconciliation.orphans || 0) === 0, ex && ex.reconciliation ? `${ex.reconciliation.status}; orfas=${ex.reconciliation.orphans || 0}` : 'nao reconciliado');

  const age = snapshot && snapshot.received_at ? now - snapshot.received_at : null;
  add('ENGINE_FRESH', age !== null && age <= config.engine_max_age_ms, age === null ? 'sem snapshot' : `idade ${age} ms`);
  add('DATA_QUALITY_USABLE', !!o && o.data_quality.status !== 'DATA_INVALID', o ? o.data_quality.status : 'sem snapshot');
  const of = o && o.data_quality.per_source.FR_ROOT_ORDERFLOW ? o.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state : null;
  add('SOURCE_NOT_FROZEN', !!of && !['FROZEN', 'FROZEN_VALUES', 'STALE', 'UNKNOWN'].includes(of), `FR_ROOT_ORDERFLOW=${of || 'n/a'}`);
  add('SESSION_RTH', config.policies.session_policy === 'RTH' && !!o && o.data_quality.session === 'RTH', o ? `sessao=${o.data_quality.session}` : 'sem snapshot');

  const failed = g.filter((x) => !x.pass).map((x) => x.id);
  return { gates: g, failed, can_arm: failed.length === 0 };
}
