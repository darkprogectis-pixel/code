// ROBOT CORE (Node): maquina de estados, gates, decisao NONE, dedup, snapshot_id, reconciliacao, travas imutaveis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.IJC_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'ijc-robot-'));
const { createRuntime } = await import('../../src/jev/engine.mjs');
const { REPO_ROOT } = await import('../../src/jev/config.mjs');
const { JevFatalError } = await import('../../src/jev/artifacts.mjs');
const { runLive } = await import('../../src/jev/adapters/live-loop.mjs');
const { createBridge } = await import('../../src/jev/bridge/server.mjs');
const { transition } = await import('../../src/ijc/robot/state-machine.mjs');
const { evaluateGates } = await import('../../src/ijc/robot/gates.mjs');
const { decide } = await import('../../src/ijc/robot/decision.mjs');
const { loadRobotConfig } = await import('../../src/ijc/robot/config.mjs');
const { createRobotCore, sanitizeReport } = await import('../../src/ijc/robot/robot-core.mjs');
const { createDedupStore, createIntentQueue, makeIntentId } = await import('../../src/ijc/robot/intents.mjs');
const { SAFETY, ORDER_PATH, EXECUTION_POLICY, isEligibleProvider } = await import('../../src/ijc/robot/constants.mjs');

const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const FX = path.join(REPO_ROOT, 'fixtures', 'jev');
const fx = (n) => JSON.parse(readFileSync(path.join(FX, n), 'utf8'));
const CFG = loadRobotConfig(path.join(REPO_ROOT, 'config', 'ijc-robot-v1.json'));
const FULL = { ...CFG, risk: { max_position_contracts: 1, max_open_positions: 1, max_orders_per_session: 4, daily_loss_limit_usd: 500 }, policies: { session_policy: 'RTH', emergency_flatten_owned: false, session_close_owned: 'keep' }, execution_policy_ref: 'hash-hipotetico' };
const tmpDir = () => mkdtempSync(path.join(os.tmpdir(), 'ijc-state-'));
const snap = (n = 'C_valid_multi_source.json', extra = {}) => ({ snapshot_id: 'S#' + n, output: rt.run(fx(n)).output, received_at: Date.now(), ...extra });
const exec = (over = {}) => ({ received_at: Date.now(), nt8_ready: true, executor_state: 'READ_ONLY', selected_account: 'Sim101', accounts: [{ name: 'Sim101', provider: 'Simulator', connection: 'Connected', eligible: true }], reconciliation: { status: 'COMPLETE', orphans: 0 }, ...over });
const failed = (g) => g.failed.slice().sort();

test('R01 maquina de estados: OFF->ENABLE_REQUESTED->OFF sem gates; ARMED so com canArm; HALTED/EMERGENCY so saem por DISABLE', () => {
  assert.equal(transition('OFF', 'ENABLE_REQUEST').to, 'ENABLE_REQUESTED');
  assert.equal(transition('ENABLE_REQUESTED', 'PRECHECK_PASS', { canArm: false }).to, 'OFF');
  assert.equal(transition('ENABLE_REQUESTED', 'PRECHECK_FAIL').to, 'OFF');
  assert.equal(transition('ENABLE_REQUESTED', 'PRECHECK_PASS', { canArm: true }).to, 'ARMED');
  assert.equal(transition('ARMED', 'SAFEGUARD').to, 'HALTED');
  assert.equal(transition('HALTED', 'ENABLE_REQUEST').to, 'HALTED');
  assert.equal(transition('HALTED', 'PRECHECK_PASS', { canArm: true }).to, 'HALTED');
  for (const m of ['OFF', 'ENABLE_REQUESTED', 'ARMED', 'HALTED']) assert.equal(transition(m, 'EMERGENCY').to, 'EMERGENCY_STOPPED');
  assert.equal(transition('EMERGENCY_STOPPED', 'ENABLE_REQUEST').to, 'EMERGENCY_STOPPED');
  for (const m of ['ENABLE_REQUESTED', 'ARMED', 'HALTED', 'EMERGENCY_STOPPED']) assert.equal(transition(m, 'DISABLE').to, 'OFF');
  assert.equal(transition('OFF', 'PRECHECK_PASS', { canArm: true }).to, 'OFF');
});

test('R02 restart => OFF sempre (ON nunca restaurado; nenhum modo persistido)', () => {
  const dir = tmpDir();
  const a = createRobotCore({ config: FULL, stateDir: dir });
  a.onSnapshot({ snapshot_id: 's1', output: rt.run(fx('C_valid_multi_source.json')).output });
  a.requestEnable({ origin: 'NT8_WINDOW' });
  const b = createRobotCore({ config: FULL, stateDir: dir });
  assert.equal(b.status().mode, 'OFF');
  assert.equal(b.publicStatus().state, 'OFF');
});

test('R03 ACTIVE SIDE RULES = 0 => decisao NONE para todas as fixtures (nenhuma intencao LONG/SHORT)', () => {
  assert.deepEqual(rt.engine.activeSideRules, []);
  assert.equal(EXECUTION_POLICY, null);
  for (const n of ['A_empty_missing.json', 'B_partial_native.json', 'C_valid_multi_source.json', 'E_trace_vs_volsignals_different.json', 'G_market_closed.json', 'H_data_invalid_global.json']) {
    const d = decide({ snapshot_id: n, output: rt.run(fx(n)).output }, { activeSideRules: rt.engine.activeSideRules });
    assert.equal(d.action, 'NONE', n);
    assert.ok(d.reason_codes.includes('RC_ROBOT_NO_ACTIVE_SIDE_RULE'));
  }
  // mesmo que o motor dissesse LONG_CONTEXT, a decisao V1 continua NONE
  const fake = { snapshot_id: 'x', output: { ...rt.run(fx('C_valid_multi_source.json')).output, jev_directional_context: 'LONG_CONTEXT' } };
  assert.equal(decide(fake, { activeSideRules: ['X'] }).action, 'NONE');
});

test('R04 conta real REJEITADA; Simulator e Playback aceitos estruturalmente', () => {
  for (const p of ['Rithmic', 'Tradovate', 'CQG', 'simulator', 'SIMULATOR', 'Sim', '', null, undefined, 'Playback ']) assert.equal(isEligibleProvider(p), false, String(p));
  assert.equal(isEligibleProvider('Simulator'), true);
  assert.equal(isEligibleProvider('Playback'), true);
  const r = sanitizeReport({ accounts: [{ name: 'Live1', provider: 'Rithmic', connection: 'Connected', eligible: true }] }); // "eligible: true" mentiroso do cliente e ignorado
  assert.equal(r.accounts[0].eligible, false);
  const gate = (prov) => evaluateGates({ snapshot: snap(), executor: exec({ accounts: [{ name: 'Sim101', provider: prov, connection: 'Connected' }] }), config: FULL }).gates.find((g) => g.id === 'ACCOUNT_SIMULATOR_OR_PLAYBACK').pass;
  assert.equal(gate('Rithmic'), false);
  assert.equal(gate('Simulator'), true);
  assert.equal(gate('Playback'), true);
});

test('R05 com TUDO configurado e saudavel, so as travas do build impedem ARMED (L0, ORDER_PATH, POLICY, SIDE RULE)', () => {
  const g = evaluateGates({ snapshot: snap(), executor: exec(), config: FULL, activeSideRules: [] });
  assert.equal(g.can_arm, false);
  assert.deepEqual(failed(g), ['ACTIVE_SIDE_RULE', 'EXECUTION_POLICY', 'L0_SEND_ORDER_LOCK', 'ORDER_PATH']);
  const core = createRobotCore({ config: FULL, stateDir: tmpDir() });
  core.onSnapshot({ snapshot_id: 'z', output: rt.run(fx('C_valid_multi_source.json')).output }); core.report(exec());
  const r = core.requestEnable({ origin: 'NT8_WINDOW' });
  assert.equal(r.accepted, false); assert.equal(r.mode, 'OFF');
});

test('R06 limite de risco/politica ausente => nao arma', () => {
  const g = evaluateGates({ snapshot: snap(), executor: exec(), config: CFG });
  for (const id of ['RISK_MAX_POSITION_CONTRACTS', 'RISK_MAX_OPEN_POSITIONS', 'RISK_MAX_ORDERS_PER_SESSION', 'RISK_DAILY_LOSS_LIMIT_USD', 'POLICY_EMERGENCY_FLATTEN_OWNED', 'POLICY_SESSION_CLOSE_OWNED']) assert.ok(g.failed.includes(id), id);
});

test('R07 estado velho, fonte FROZEN, fora do RTH, DATA_INVALID, executor sem heartbeat => nao arma', () => {
  const fail = (s, e = exec()) => evaluateGates({ snapshot: s, executor: e, config: FULL }).failed;
  assert.ok(fail(snap('C_valid_multi_source.json', { received_at: Date.now() - 10 * 60 * 1000 })).includes('ENGINE_FRESH'));
  const frozen = snap(); frozen.output = JSON.parse(JSON.stringify(frozen.output)); frozen.output.data_quality.per_source.FR_ROOT_ORDERFLOW.freshness_state = 'FROZEN';
  assert.ok(fail(frozen).includes('SOURCE_NOT_FROZEN'));
  assert.ok(fail(snap('G_market_closed.json')).includes('SESSION_RTH'));
  assert.ok(fail(snap('H_data_invalid_global.json')).includes('DATA_QUALITY_USABLE'));
  assert.ok(fail(snap(), exec({ received_at: Date.now() - 60000 })).includes('EXECUTOR_HEALTHY'));
  assert.ok(fail(snap(), exec({ nt8_ready: false })).includes('EXECUTOR_HEALTHY'));
  assert.ok(fail(snap(), null).includes('EXECUTOR_HEALTHY'));
});

test('R08 intencao duplicada recusada, persistida entre reinicios; fila HARD_DISABLED nunca aceita', () => {
  const dir = tmpDir(); const file = path.join(dir, 'd.json');
  const d1 = createDedupStore(file);
  const id = makeIntentId({ snapshot_id: 'S1', policy_rule: 'P', instrument: 'ES', action: 'ENTER_LONG' });
  assert.equal(id, makeIntentId({ snapshot_id: 'S1', policy_rule: 'P', instrument: 'ES', action: 'ENTER_LONG' }), 'id deterministico');
  assert.deepEqual(d1.markConsumed(id, 'S1'), { ok: true });
  assert.deepEqual(d1.markConsumed(id, 'S1'), { ok: false, reason: 'DUPLICATE_INTENT' });
  const d2 = createDedupStore(file); // restart / reconnect
  assert.equal(d2.isConsumed(id, 'S1'), true);
  assert.equal(d2.markConsumed(id, 'S1').reason, 'DUPLICATE_INTENT');
  assert.equal(d2.markConsumed(id, 'S2').ok, true, 'outro snapshot = outra intencao');
  const q = createIntentQueue({ dedup: d2 });
  assert.equal(q.enqueue({ intent_id: id, snapshot_id: 'S3', action: 'ENTER_LONG' }).reason, 'HARD_DISABLED');
  assert.equal(q.enqueue({ intent_id: id, snapshot_id: 'S3', action: 'NONE' }).reason, 'NO_ACTIONABLE_INTENT');
  assert.deepEqual(q.after(0), []);
});

test('R09 snapshot_id propaga: laco -> bridge -> robot core -> decisao', async () => {
  const core = createRobotCore({ config: CFG, stateDir: tmpDir(), activeSideRules: rt.engine.activeSideRules });
  const bridge = createBridge({ host: '127.0.0.1', port: 0, mode: 'REPLAY' }, { robotStatus: () => core.publicStatus() });
  const adapter = { buildInput: async () => ({ input: fx('C_valid_multi_source.json'), report: {} }) };
  let seen = null;
  await runLive({ adapter, runtime: rt, intervalMs: 1, cycles: 2, onCycle: ({ result }) => { bridge.update({ result }); core.onSnapshot(result); seen = result.snapshot_id; } });
  assert.match(seen, /^2026-09-24T15:00:00\.000Z#[a-z0-9]+-2$/);
  const { buildPanel } = await import('../../src/jev/bridge/panel-model.mjs');
  const p = buildPanel(bridge.state.result, bridge.state.meta, { robot: core.publicStatus() });
  assert.equal(p.snapshot_id, seen);
  assert.equal(p.robot.decision.snapshot_id, seen);
  assert.equal(core.status().decision.snapshot_id, seen);
});

test('R10 reconciliacao na reconexao: RECONCILING ou orfas bloqueiam; COMPLETE sem orfas libera o gate', () => {
  const g = (rec) => evaluateGates({ snapshot: snap(), executor: exec({ reconciliation: rec }), config: FULL }).gates.find((x) => x.id === 'RECONCILIATION_COMPLETE').pass;
  assert.equal(g({ status: 'RECONCILING', orphans: 0 }), false);
  assert.equal(g({ status: 'PENDING_NT8', orphans: 0 }), false);
  assert.equal(g({ status: 'COMPLETE', orphans: 1 }), false);
  assert.equal(g({ status: 'COMPLETE', orphans: 0 }), true);
});

test('R11 JEV_CAN_SEND_ORDER imutavel false; config nao liga execucao; so a janela NT8 pede ON', () => {
  assert.equal(SAFETY.JEV_CAN_SEND_ORDER, false);
  assert.ok(Object.isFrozen(SAFETY) && Object.isFrozen(ORDER_PATH));
  assert.throws(() => { SAFETY.JEV_CAN_SEND_ORDER = true; }, TypeError);
  assert.equal(SAFETY.JEV_CAN_SEND_ORDER, false);
  const dir = tmpDir();
  for (const bad of [{ JEV_CAN_SEND_ORDER: true }, { robot: { execution_enabled: true } }, { live_orders: true }]) {
    const f = path.join(dir, 'c.json');
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(path.join(REPO_ROOT, 'config', 'ijc-robot-v1.json'), 'utf8')), ...bad }));
    assert.throws(() => loadRobotConfig(f), JevFatalError);
  }
  const core = createRobotCore({ config: FULL, stateDir: tmpDir() });
  for (const origin of ['WEB', 'AGENT', undefined, 'API']) assert.equal(core.requestEnable({ origin }).reason, 'ORIGIN_NOT_ALLOWED');
  assert.equal(core.publicStatus().can_enable, false);
});

test('R12 emergencia: bloqueia, nenhuma ordem para cancelar neste build; sai so por DISABLE', () => {
  const core = createRobotCore({ config: FULL, stateDir: tmpDir() });
  const e = core.emergency();
  assert.equal(e.mode, 'EMERGENCY_STOPPED'); assert.equal(e.orders_to_cancel, 0);
  assert.equal(core.requestEnable({ origin: 'NT8_WINDOW' }).reason, 'MODE_NOT_OFF');
  assert.equal(core.disable().mode, 'OFF');
});

test('R13 visao publica sem nomes de conta nem ordens (agente/web nao veem contas)', () => {
  const core = createRobotCore({ config: FULL, stateDir: tmpDir() });
  core.report(exec({ accounts: [{ name: 'MinhaContaSecreta', provider: 'Simulator', connection: 'Connected' }], orders_owned: [{ name: 'IJC-ROBOT|x' }] }));
  const pub = JSON.stringify(core.publicStatus());
  assert.ok(!pub.includes('MinhaContaSecreta'));
  assert.ok(!pub.includes('IJC-ROBOT|x'));
});
