// ROBOT CORE (Node, mesmo processo do motor). Consome o snapshot canonico (onSnapshot) — nunca chama o motor.
// Camadas: ANALYSIS (motor, externo) -> DECISION -> RISK/gates -> EXECUTION (NT8, pull; HARD_DISABLED neste build).
// Modo SEMPRE nasce OFF (nunca restaura ON). Posicao vem SO do executor (reconciliacao), nunca e presumida.
import { transition } from './state-machine.mjs';
import { evaluateGates } from './gates.mjs';
import { decide } from './decision.mjs';
import { createDedupStore, createIntentQueue, defaultDedupFile } from './intents.mjs';
import { SAFETY, ORDER_PATH, POSITION_STATES, isEligibleProvider, isRobotOrderName } from './constants.mjs';

const str = (v, n = 120) => (typeof v === 'string' ? v.slice(0, n) : null);

// sanitiza e valida o report do executor (NT8). Nada de token/segredo passa daqui.
export function sanitizeReport(r) {
  if (!r || typeof r !== 'object') return null;
  const accounts = Array.isArray(r.accounts) ? r.accounts.slice(0, 100).map((a) => ({
    name: str(a && a.name, 80), provider: str(a && a.provider, 40), connection: str(a && a.connection, 40),
    eligible: isEligibleProvider(a && a.provider), // decidido AQUI tambem (defesa em profundidade), nao so pelo NT8
  })) : [];
  const owned = (arr, f) => (Array.isArray(arr) ? arr.slice(0, 200).map(f) : []);
  return {
    executor_state: str(r.executor_state, 40) || 'UNKNOWN',
    nt8_ready: r.nt8_ready === true,
    order_path: str(r.order_path, 40),
    selected_account: str(r.selected_account, 80),
    accounts,
    orders_owned: owned(r.orders_owned, (o) => ({ name: str(o && o.name, 60), state: str(o && o.state, 30), instrument: str(o && o.instrument, 40), quantity: Number.isFinite(o && o.quantity) ? o.quantity : null, robot_owned: isRobotOrderName(o && o.name) })),
    positions_owned: owned(r.positions_owned, (p) => ({ account: str(p && p.account, 80), instrument: str(p && p.instrument, 40), market_position: str(p && p.market_position, 20), quantity: Number.isFinite(p && p.quantity) ? p.quantity : null })),
    reconciliation: r.reconciliation && typeof r.reconciliation === 'object' ? { status: str(r.reconciliation.status, 30) || 'UNKNOWN', orphans: Number.isFinite(r.reconciliation.orphans) ? r.reconciliation.orphans : null, completed_at: str(r.reconciliation.completed_at, 40) } : { status: 'UNKNOWN', orphans: null },
    position_state: POSITION_STATES.includes(r.position_state) ? r.position_state : 'NOT_REPORTED',
    rejected_intents: Number.isFinite(r.rejected_intents) ? r.rejected_intents : 0,
  };
}

export function createRobotCore({ config, stateDir, logger = null, now = () => Date.now(), activeSideRules = [] }) {
  const log = (event, f) => { if (logger) logger.log(event, f); };
  const dedup = createDedupStore(defaultDedupFile(stateDir));
  const queue = createIntentQueue({ dedup });
  const st = { mode: 'OFF', mode_since: new Date(now()).toISOString(), last_transition: null, snapshot: null, decision: null, executor: null, last_gates: null };
  log('robot_start', { state: 'OFF', reason: 'restart => OFF (ON nunca e restaurado)', order_path: ORDER_PATH.state });

  function setMode(tr, extra = {}) {
    st.last_transition = { ...tr, at: new Date(now()).toISOString() };
    if (tr.to !== st.mode) { st.mode = tr.to; st.mode_since = st.last_transition.at; }
    log('robot_mode', { state: st.mode, reason: tr.why || tr.event, snapshot_id: st.snapshot && st.snapshot.snapshot_id, ...extra });
  }
  const gates = () => (st.last_gates = evaluateGates({ snapshot: st.snapshot, executor: st.executor, config, now: now(), activeSideRules }));

  return {
    dedup, queue,
    onSnapshot(result) {
      if (!result || !result.output) return;
      st.snapshot = { snapshot_id: result.snapshot_id || null, output: result.output, received_at: now() };
      st.decision = decide(st.snapshot, { activeSideRules });
      log('robot_decision', { snapshot_id: st.decision.snapshot_id, state: st.mode, reason: st.decision.reason_codes.join(','), action: st.decision.action });
      if (st.mode === 'ARMED') { const g = gates(); if (!g.can_arm) setMode(transition('ARMED', 'SAFEGUARD'), { failed: g.failed }); } // inalcancavel neste build
    },
    report(r) {
      const s = sanitizeReport(r);
      if (!s) return { ok: false, reason: 'REPORT_INVALID' };
      st.executor = { ...s, received_at: now() };
      if (st.mode === 'ARMED' && (s.reconciliation.status !== 'COMPLETE' || !s.nt8_ready)) setMode(transition('ARMED', 'SAFEGUARD'));
      return { ok: true };
    },
    requestEnable({ origin } = {}) {
      // Autoridade de ON: so a janela do NT8 (origin=NT8_WINDOW) via control plane com token. Web/agente nao tem rota nem token.
      if (origin !== 'NT8_WINDOW') { log('robot_enable_denied', { state: st.mode, reason: 'ORIGIN_NOT_ALLOWED', origin: str(origin, 30) }); return { accepted: false, mode: st.mode, reason: 'ORIGIN_NOT_ALLOWED' }; }
      if (st.mode !== 'OFF') return { accepted: false, mode: st.mode, reason: 'MODE_NOT_OFF' };
      setMode(transition('OFF', 'ENABLE_REQUEST'));
      const g = gates();
      setMode(transition('ENABLE_REQUESTED', g.can_arm ? 'PRECHECK_PASS' : 'PRECHECK_FAIL', { canArm: g.can_arm }), { failed: g.failed });
      return { accepted: st.mode === 'ARMED', mode: st.mode, failed_gates: g.failed };
    },
    disable() { setMode(transition(st.mode, 'DISABLE')); return { mode: st.mode }; },
    emergency() {
      setMode(transition(st.mode, 'EMERGENCY'), { reason: 'EMERGENCY: bloqueia entradas; cancelar entradas pendentes proprias; manter protecao broker (neste build nao existe ordem)' });
      return { mode: st.mode, orders_to_cancel: 0, note: 'nenhuma ordem existe neste build (ORDER_PATH HARD_DISABLED)' };
    },
    intentsAfter(seq) { return queue.after(seq); },
    status() {
      const g = gates();
      const ex = st.executor;
      return {
        mode: st.mode, mode_since: st.mode_since, can_arm: g.can_arm, failed_gates: g.failed, gates: g.gates,
        execution: 'DISABLED', order_path: ORDER_PATH.state, order_path_reason: ORDER_PATH.reason, safety: { ...SAFETY },
        strategy: 'NONE (NOT AVAILABLE)', decision: st.decision,
        position: { state: ex ? ex.position_state : 'NOT_REPORTED', owned_positions: ex ? ex.positions_owned.length : null, source: ex ? 'EXECUTOR_RECONCILIATION' : 'NOT_REPORTED' },
        executor: ex ? { state: ex.executor_state, nt8_ready: ex.nt8_ready, heartbeat_age_ms: now() - ex.received_at, reconciliation: ex.reconciliation, selected_account: ex.selected_account,
          accounts: ex.accounts, orders_owned: ex.orders_owned.length, rejected_intents: ex.rejected_intents } : { state: 'NOT_REPORTED' },
        dedup: { entries: dedup.size(), load_error: dedup.loadError },
      };
    },
    // Visao PUBLICA (bridge :3590 / web / agente): sem nomes de conta, sem ordens, sem token.
    publicStatus() {
      const s = this.status();
      const ex = st.executor;
      return {
        state: s.mode, mode_since: s.mode_since, can_enable: false, can_arm: s.can_arm,
        locked_reason: 'Executor ainda não operacional — JEV_CAN_SEND_ORDER=false; ORDER_PATH=HARD_DISABLED (sem regra de lado ativa e sem política de execução pré-registrada)',
        execution: 'DISABLED', order_path: s.order_path, strategy: s.strategy, safety: s.safety,
        decision: s.decision ? { snapshot_id: s.decision.snapshot_id, action: s.decision.action, reason_codes: s.decision.reason_codes } : null,
        position: { state: s.position.state, source: s.position.source },
        executor: ex ? { state: ex.executor_state, nt8_ready: ex.nt8_ready, heartbeat_age_ms: s.executor.heartbeat_age_ms, reconciliation: ex.reconciliation,
          accounts_reported: ex.accounts.length, accounts_eligible: ex.accounts.filter((a) => a.eligible).length } : { state: 'NOT_REPORTED' },
        gates: s.gates.map((x) => ({ id: x.id, pass: x.pass, detail: x.detail })), failed_gates: s.failed_gates,
      };
    },
  };
}
