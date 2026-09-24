// INVICTUS JEV CODE V2 — produto final antes do F5 unico: UI V2 (Full/Compact, ALFA OMEGA), conta do operador, PNL,
// boleta manual (MARKET/LIMIT, BUY/SELL por clique), separacao manual x robot, robot OFF/NONE, web/agente sem ordem.
// Nenhum teste envia ordem: as provas do caminho manual sao estaticas (fonte C#) + C# puro (npm run test:nt8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.IJC_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'ijc-v2-'));
const { REPO_ROOT } = await import('../../src/jev/config.mjs');
const { createRuntime } = await import('../../src/jev/engine.mjs');
const { loadRobotConfig } = await import('../../src/ijc/robot/config.mjs');
const { createRobotCore, sanitizeReport } = await import('../../src/ijc/robot/robot-core.mjs');
const { decide } = await import('../../src/ijc/robot/decision.mjs');
const C = await import('../../src/ijc/robot/constants.mjs');

const DIR = path.join(REPO_ROOT, 'nt8', 'AddOns', 'InvictusJevCode');
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
const cs = (f) => strip(readFileSync(path.join(DIR, f), 'utf8'));
const WIN = cs('IjcControlCenterWindow.cs'), MAN = cs('IjcManualOrders.cs'), PURE = cs('IjcPure.cs'), EXE = cs('IjcExecutor.cs');
// leitura de conta/PNL/posicao (somente leitura) vive em IjcExecutor.cs desde o lote RTH de 4 arquivos (boleta adiada)
const ACC = EXE.slice(EXE.indexOf('public class IjcAccountInfo'));
const body = (src, sig, next) => { const i = src.indexOf(sig); assert.ok(i >= 0, sig); const j = src.indexOf(next, i + sig.length); return src.slice(i, j < 0 ? undefined : j); };
const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const out = rt.run(JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures', 'jev', 'C_valid_multi_source.json'), 'utf8'))).output;
const CFG = loadRobotConfig(path.join(REPO_ROOT, 'config', 'ijc-robot-v1.json'));
const FULL = { ...CFG, risk: { max_position_contracts: 1, max_open_positions: 1, max_orders_per_session: 4, daily_loss_limit_usd: 500 }, policies: { session_policy: 'RTH', emergency_flatten_owned: false, session_close_owned: 'keep' }, execution_policy_ref: 'hash-hipotetico' };
const core = (config = CFG) => createRobotCore({ config, stateDir: mkdtempSync(path.join(os.tmpdir(), 'ijc-v2s-')) });

test('V01 UI V2: FULL 1440x1000 (min 1100x760) e COMPACT 440x900 (min 400x760) na MESMA janela; toggle so muda apresentacao', () => {
  assert.match(WIN, /if \(compact\) \{ MinWidth = 400; MinHeight = 760; Width = 440; Height = 900; \}/);
  assert.match(WIN, /else \{ MinWidth = 1100; MinHeight = 760; Width = 1440; Height = 1000; \}/);
  const toggle = body(WIN, 'modeBtn.Click +=', ';\n');
  assert.match(toggle, /compact = !compact; ApplyGeometry\(\); BuildLayout\(\);/);
  assert.doesNotMatch(toggle, /draft|IjcSession|manual|RobotControl/);           // nao muda conta, boleta, robo nem cria comando
  assert.match(WIN, /compact \? CompactMain\(\) : FullMain\(\)/);
  for (const t of ['"Analyzer"', '"Robot"', '"Details"', '"Settings"', '"Logs"']) assert.ok(WIN.includes(`Tab(${t}`), t);
  // Full: faixa prioritaria contexto 30% | boleta 40% | PNL 30%; Compact: contexto -> PNL -> boleta; dealer/SPX recolhidos
  assert.match(body(WIN, 'private UIElement FullMain()', 'private UIElement CompactMain()'), /GridLength\(3, GridUnitType\.Star\)[\s\S]*GridLength\(4, GridUnitType\.Star\)[\s\S]*GridLength\(3, GridUnitType\.Star\)[\s\S]*ContextCard\(\)[\s\S]*TicketCard\(\)[\s\S]*PnlCard\(\)/);
  const cm = body(WIN, 'private UIElement CompactMain()', 'private Border ContextCard()');
  assert.ok(cm.indexOf('ContextCard()') < cm.indexOf('PnlCard()') && cm.indexOf('PnlCard()') < cm.indexOf('TicketCard()'));
  assert.match(cm, /recolhidos/);
  for (const g of ['JEV Native Dealer', 'SPX Final Context', 'Analysis', 'Market', 'Directional context', 'MENTHORQ · CONFIRMATION OVERLAY']) assert.ok(WIN.includes(g), g);
  assert.doesNotMatch(WIN, /probabilit|%\s*(long|short)/i);
});

test('V02 ALFA OMEGA: INVICTUS JEV CODE + "by ALFA OMEGA" + marca Alfa/Omega vetorial + ONE SHARED ENGINE', () => {
  assert.match(PURE, /public const string ProductName = "INVICTUS JEV CODE";/);
  assert.match(PURE, /public const string Brand = "by ALFA OMEGA";/);
  const mark = body(WIN, 'private static FrameworkElement BrandMark', 'private void BuildLayout()');
  assert.match(mark, /"Ω"/); assert.match(mark, /"α"/); assert.match(mark, /Rectangle/); assert.match(mark, /Polyline/);
  assert.match(WIN, /BrandMark\(compact \? 26 : 40\)/);                          // 24–28 Compact, 36–44 Full
  assert.match(WIN, /ONE SHARED ENGINE/);
  assert.match(WIN, /SIGNAL ≠ ORDER · JEV CONTEXT ≠ AUTO EXECUTION/);
});

test('V03 ACCOUNT SELECTOR: conta OPERATOR_SELECTED, nunca autoescolhida/persistida, unica para PNL/posicao/boleta/robot', () => {
  assert.match(WIN, /new IjcTicketDraft \{ Account = null, Instrument = null/);
  assert.match(WIN, /new ComboBoxItem \{ Content = "Selecione conta", Tag = null \}/);
  const setters = WIN.match(/IjcSession\.SelectedAccount = /g) || [];
  assert.equal(setters.length, 1);
  const sel = body(WIN, 'accountBox.SelectionChanged +=', 'sp.Children.Add(Field("ACCOUNT"');
  assert.match(sel, /draft\.Account = name; IjcSession\.SelectedAccount = name;/);
  assert.match(sel, /acct = null; lastGoodPnl = null;/);                         // troca => LOADING, sem vazamento da conta anterior
  assert.match(EXE, /\{ "selected_account", IjcSession\.SelectedAccount \}/);     // o robo reporta a MESMA conta
  assert.match(WIN, /snap = acc == null \? null : IjcAccounts\.Read\(acc, ins\);/);
  assert.match(WIN, /if \(snap != null && acc == draft\.Account && ins == draft\.Instrument\) acct = snap;/);
  assert.doesNotMatch(WIN + MAN + ACC, /Registry|IsolatedStorage|File\.|Settings\.Default|IWorkspacePersistence/);
  assert.match(ACC, /i\.Kind = IjcGuard\.AccountKind\(i\.Provider\);/);         // SIM/LIVE do Provider real, nao do nome
  assert.doesNotMatch(ACC, /IsEligibleProvider/);                                  // boleta nao restringe provider
});

test('V04 PNL / REALIZED / OPEN: vem da conta NT8 (AccountItem), nunca do motor JEV; ausente => NOT_REPORTED', () => {
  assert.match(ACC, /Item\(a, AccountItem\.RealizedProfitLoss, cur\)/);
  assert.match(ACC, /Item\(a, AccountItem\.UnrealizedProfitLoss, cur\)/);
  assert.match(ACC, /cur = a\.Denomination;/);
  assert.match(ACC, /double\.IsNaN\(v\) \|\| double\.IsInfinity\(v\) \? \(double\?\)null : v/);
  assert.match(PURE, /v\.Pnl = realized\.HasValue && unrealized\.HasValue \? realized\.Value \+ unrealized\.Value : \(double\?\)null;/);
  assert.match(PURE, /if \(!v\.HasValue\) return "NOT_REPORTED";/);
  const pc = body(WIN, 'private Border PnlCard()', 'private Border TicketCard()');
  for (const l of ['"PNL"', '"REALIZADO"', '"ABERTO"']) assert.ok(pc.includes(l), l);
  assert.match(pc, /FontSize = compact \? 40 : 50/);                              // PNL 44–56 Full
  const ra = body(WIN, 'private void RenderAccount()', 'private void RenderTicket()');
  assert.doesNotMatch(ra, /SelectToken\("(pnl|account|position)/);                 // nada de conta no jev-panel/v1
  assert.match(ra, /Último conhecido/);
  assert.match(ra, /AccountItem\.RealizedProfitLoss/);                             // origem documentada em Details
});

test('V05 POSITION / SIZE / AVG PRICE / OPEN PNL da posicao conta+instrumento; FLAT so com leitura valida', () => {
  assert.match(ACC, /lock \(a\.Positions\) \{ positions = a\.Positions\.ToArray\(\); \}/);
  assert.match(ACC, /p\.GetUnrealizedProfitLoss\(PerformanceUnit\.Currency, double\.MinValue\)/);
  assert.match(ACC, /IjcPositionView\.From\(true, p\.MarketPosition\.ToString\(\), p\.Quantity, p\.AveragePrice, open\)/);
  assert.match(ACC, /IjcPositionView\.Unknown\("DISCONNECTED"\)/);
  for (const k of ['"POSITION"', '"SIZE"', '"AVG PRICE"', '"OPEN PNL (posição)"']) assert.ok(WIN.includes(k), k);
});

test('V06 MANUAL ORDER TICKET: campos, MARKET/LIMIT, BUY/SELL por clique explicito, sem popup, sem atalho de teclado', () => {
  const tk = body(WIN, 'private Border TicketCard()', 'private void FillAccountBox()');
  for (const f of ['"ACCOUNT"', '"INSTRUMENT"', '"QUANTITY"', '"ORDER TYPE"', '"LIMIT PRICE"', '"MARKET"', '"LIMIT"', '"BUY"', '"SELL"']) assert.ok(tk.includes(f), f);
  assert.match(tk, /buyBtn = new Button \{ Content = "BUY", Height = 46[^}]*Focusable = false, IsDefault = false/);
  assert.match(tk, /sellBtn = new Button \{ Content = "SELL", Height = 46[^}]*Focusable = false, IsDefault = false/);
  assert.match(tk, /priceBox\.TextChanged/);
  assert.doesNotMatch(WIN + MAN, /MessageBox|ShowDialog|KeyBinding|InputBinding|KeyDown|PreviewKey/);
  assert.match(body(WIN, 'private void RenderTicket()', 'private static Brush CtxBrush'), /buyBtn\.IsEnabled = ok; sellBtn\.IsEnabled = ok;/);
});

test('V07 contrato MARKET/LIMIT/BUY/SELL -> Account.CreateOrder (assinatura confirmada) na conta selecionada; validacao antes', () => {
  const click = body(MAN, 'public string Click(string side, IjcTicketDraft d)', 'private static Account Find');
  const iVal = click.indexOf('IjcTicketValidator.Validate(input)'), iGate = click.indexOf('gate.TryBegin('), iCreate = click.indexOf('.CreateOrder('), iSubmit = click.indexOf('a.Submit(');
  assert.ok(iVal > 0 && iVal < iGate && iGate < iCreate && iCreate < iSubmit, 'validar -> anti-double-submit -> criar -> enviar');
  assert.match(click, /Account a = Find\(d == null \? null : d\.Account\);/);   // conta = a escolhida na boleta (IjcSession)
  assert.match(click, /OrderAction action = side == IjcTicketValidator\.Buy \? OrderAction\.Buy : OrderAction\.Sell;/);
  assert.match(click, /OrderType type = input\.OrderType == IjcTicketValidator\.Limit \? OrderType\.Limit : OrderType\.Market;/);
  assert.match(click, /double limit = type == OrderType\.Limit \? input\.LimitPrice\.Value : 0;/);
  assert.match(click, /a\.CreateOrder\(ins, action, type, OrderEntry\.Manual, TimeInForce\.Day, input\.Quantity, limit, 0, null, name, NinjaTrader\.Core\.Globals\.MaxDate, null\)/);
  assert.match(click, /a\.Submit\(new\[\] \{ o \}\);/);
  assert.match(click, /return Set\("PENDING"/);                                 // pendente ate evento real; fill nunca presumido
  assert.match(ACC, /Instrument\.GetInstrument\(fullName\.Trim\(\), false\)/);   // nunca cria instrumento
  // validacoes tecnicas exigidas
  for (const code of ['NO_ACCOUNT', 'ACCOUNT_NOT_FOUND', 'ACCOUNT_DISCONNECTED', 'INSTRUMENT_INVALID', 'QUANTITY_INVALID', 'ORDER_TYPE_INVALID', 'LIMIT_PRICE_REQUIRED', 'LIMIT_PRICE_OFF_TICK']) assert.ok(PURE.includes(`"${code}"`), code);
});

test('V08 anti-double-submit: 1 ordem em voo; libera so por evento real do NT8; sem reenvio automatico', () => {
  assert.match(PURE, /public const int MinIntervalMs = 750;/);
  assert.match(PURE, /if \(orderState == null \|\| orderState == "Initialized"\) return;/);
  const click = body(MAN, 'public string Click(string side, IjcTicketDraft d)', 'private static Account Find');
  assert.match(click, /if \(!gate\.TryBegin\(now, out why\)\) return Set\("DOUBLE_SUBMIT_BLOCKED"/);
  assert.doesNotMatch(MAN, /while|for \(|Retry|retry|Resubmit/);                    // nenhum laco de reenvio
  assert.match(MAN, /gate\.OnOrderState\(st\);/);
  assert.match(body(WIN, 'private void RenderTicket()', 'private static Brush CtxBrush'), /bool ok = errs\.Count == 0 && !inFlight;/);
});

test('V09 separacao MANUAL x ROBOT e ownership: IJC-MANUAL| (MANUAL_OPERATOR) nunca e robot-owned', () => {
  assert.equal(C.ORDER_PREFIX, 'IJC-ROBOT|'); assert.equal(C.MANUAL_PREFIX, 'IJC-MANUAL|');
  assert.match(PURE, /public const string ManualPrefix = "IJC-MANUAL\|";/);
  assert.match(PURE, /public const string RobotPrefix = "IJC-ROBOT\|";/);
  assert.equal(C.orderOwner('IJC-MANUAL|a'), 'MANUAL_OPERATOR'); assert.equal(C.orderOwner('IJC-ROBOT|a'), 'JEV_ROBOT'); assert.equal(C.orderOwner('AO|x'), 'FOREIGN');
  assert.equal(C.isRobotOrderName('IJC-MANUAL|a'), false); assert.equal(C.isRobotOrderName('IJC|old'), false);
  const s = sanitizeReport({ orders_owned: [{ name: 'IJC-MANUAL|a' }, { name: 'IJC-ROBOT|b' }] });
  assert.deepEqual(s.orders_owned.map((o) => o.robot_owned), [false, true]);
  assert.doesNotMatch(MAN, /IjcExecutor|RobotPrefix|IJC-ROBOT|OrderEntry\.Automated/);
  assert.doesNotMatch(EXE, /IjcManualOrderController|ManualPrefix|\.CreateOrder\(|\.Submit\(/);
  assert.match(EXE, /IjcExecutionStub\.SubmitIntent/);                             // robot binding isolado
  assert.match(MAN, /IjcDiag\.LogOrder\("manual_order_" \+ status\.ToLowerInvariant\(\)[^;]*IjcOrigin\.Manual/); // logging com origem
  assert.match(MAN, /IjcDiag\.LogOrder\("manual_order_update"[^;]*IjcOrigin\.Manual/);
});

test('V10 ROBOT: restart => OFF; OFF => sem acao; ON pedido + decisao NONE => sem acao (nenhum sinal inventado)', () => {
  const c = core(FULL);
  assert.equal(c.status().mode, 'OFF');
  const longOut = { ...out, jev_directional_context: 'LONG_CONTEXT' };             // mesmo com contexto LONG: decisao NONE
  c.onSnapshot({ output: longOut, snapshot_id: 'v2#1' });
  assert.equal(c.status().decision.action, 'NONE');
  assert.deepEqual(c.intentsAfter(0), []);
  c.report({ executor_state: 'READ_ONLY', nt8_ready: true, selected_account: 'Conta-Operador', accounts: [{ name: 'Conta-Operador', provider: 'Simulator', connection: 'Connected' }], reconciliation: { status: 'COMPLETE', orphans: 0 } });
  const r = c.requestEnable({ origin: 'NT8_WINDOW' });
  assert.equal(r.accepted, false); assert.equal(r.mode, 'OFF');
  assert.ok(r.failed_gates.includes('ACTIVE_SIDE_RULE') && r.failed_gates.includes('EXECUTION_POLICY'));
  c.onSnapshot({ output: longOut, snapshot_id: 'v2#2' });
  assert.deepEqual(c.intentsAfter(0), []);
  assert.equal(decide({ snapshot_id: 'x', output: { ...out, jev_directional_context: 'SHORT_CONTEXT' } }).action, 'NONE');
  assert.equal(core().status().mode, 'OFF');                                     // novo processo = OFF (ON nunca restaurado)
  assert.match(WIN, /off\.Click \+= \(s, e\) => RobotControl\("disable"\);/);
  assert.match(WIN, /on\.Click \+= \(s, e\) => RobotControl\("enable"\);/);
  assert.match(EXE, /"\{\\"origin\\":\\"NT8_WINDOW\\"\}"/);
});

test('V11 bridge offline: boleta e PNL nao dependem do bridge nem mudam de semantica', () => {
  const rtk = body(WIN, 'private void RenderTicket()', 'private static Brush CtxBrush');
  assert.doesNotMatch(rtk, /bridgeOffline|\blast\b|SelectToken|jev\.|robot\./);
  const al = body(WIN, 'private async Task AccountLoop', 'private void Safe(');
  assert.doesNotMatch(al, /StateUrl|AgentUrl|IjcHttp|bridge/);
  assert.doesNotMatch(MAN, /JObject|IjcJson|directional|CONTEXT/);                  // sem sinal JEV no caminho manual
  assert.match(WIN, /Conta, PNL e boleta manual não dependem do bridge/);
});

test('V12 WEB read-only e AGENTE advisory: nenhum dos dois dispara BUY/SELL', () => {
  const html = readFileSync(path.join(REPO_ROOT, 'src', 'jev', 'bridge', 'control-center.html'), 'utf8');
  assert.doesNotMatch(html, /method:\s*['"](POST|PUT|DELETE|PATCH)/i);
  assert.doesNotMatch(html, /\b(BUY|SELL)\b|3591|x-ijc-token/i);
  const srv = readFileSync(path.join(REPO_ROOT, 'src', 'jev', 'bridge', 'server.mjs'), 'utf8');
  assert.match(srv, /if \(req\.method !== 'GET' && !head\)/);
  const agentDir = path.join(REPO_ROOT, 'src', 'ijc', 'agent-gateway');
  for (const f of readdirSync(agentDir)) {
    const s = strip(readFileSync(path.join(agentDir, f), 'utf8'));
    assert.doesNotMatch(s, /x-ijc-token|\/robot\/v1\/|enable-request|IJC-MANUAL|IJC-ROBOT|\b(BUY|SELL)\b/, f);
  }
});
