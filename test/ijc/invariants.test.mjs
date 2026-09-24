// INVARIANTES DO BUILD INVICTUS JEV CODE V2:
//   ORDER PATHS SEPARATED (manual=clique; robot binding isolado) · NO SECOND BRAIN · PRODUCTION UNTOUCHED · UNKNOWN OPERATIONAL
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.IJC_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'ijc-inv-'));
const { REPO_ROOT, SAFETY } = await import('../../src/jev/config.mjs');
const { createRuntime } = await import('../../src/jev/engine.mjs');
const { ORDER_PATH } = await import('../../src/ijc/robot/constants.mjs');
const { loadRobotConfig } = await import('../../src/ijc/robot/config.mjs');
const { createRobotCore } = await import('../../src/ijc/robot/robot-core.mjs');

function walk(dir, exts, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (/[\\/](bin|obj|node_modules)$/.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, exts, out); else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const SRC = walk(path.join(REPO_ROOT, 'src'), ['.mjs', '.js', '.html']);
const NT8 = walk(path.join(REPO_ROOT, 'nt8'), ['.cs']);

test('I01 CAMINHOS DE ORDEM: API NT8 so no caminho MANUAL (clique); robot binding isolado; Node/web/agente sem ordem', () => {
  // estatica: API de ordem do NT8 aparece em UM arquivo so (IjcManualOrders.cs), e so criar+enviar (sem cancel/change/flatten/ATM)
  const NT8_ORDER_API = /CreateOrder|SubmitOrder|\.Submit\(|Account\.(Change|Cancel|Flatten)|\b[a-z]\.(Change|Cancel|Submit)\(|Flatten|\bAtm[A-Z]|EnterLong|EnterShort|ExitLong|ExitShort|OrderAction\.|CancelAllOrders|:5152/;
  const withApi = NT8.filter((f) => NT8_ORDER_API.test(strip(readFileSync(f, 'utf8')))).map((f) => path.basename(f));
  assert.deepEqual(withApi, ['IjcManualOrders.cs']);
  const man = strip(readFileSync(NT8.find((f) => f.endsWith('IjcManualOrders.cs')), 'utf8'));
  assert.equal((man.match(/\.CreateOrder\(/g) || []).length, 1);
  assert.equal((man.match(/\.Submit\(/g) || []).length, 1);
  assert.match(man, /OrderEntry\.Manual/);
  assert.doesNotMatch(man, /OrderEntry\.Automated|\.Cancel\(|\.Change\(|Flatten|Atm|CancelAllOrders|EnterLong|ExitLong/);
  assert.match(man, /string name = IjcOrigin\.NewManualName\(\);/);                 // origin MANUAL_OPERATOR, prefixo IJC-MANUAL|
  assert.doesNotMatch(man, /IjcHttp|IjcExecutor|127\.0\.0\.1|359[0-2]|Timer|new Thread|Task\.Run|JObject/); // independe de bridge/Node/robot/agente
  // o controlador so e chamado pelo clique BUY/SELL da janela
  const all = NT8.map((f) => [path.basename(f), strip(readFileSync(f, 'utf8'))]);
  const calls = all.flatMap(([f, s]) => (s.match(/manual\.Click\(/g) || []).map(() => f));
  assert.deepEqual(calls, ['IjcControlCenterWindow.cs']);
  const win = all.find(([f]) => f === 'IjcControlCenterWindow.cs')[1];
  assert.equal((win.match(/OnManualClick\(IjcTicketValidator\.(Buy|Sell)\)/g) || []).length, 2);
  assert.match(win, /buyBtn\.Click \+= \(s, e\) => OnManualClick\(IjcTicketValidator\.Buy\);/);
  assert.match(win, /sellBtn\.Click \+= \(s, e\) => OnManualClick\(IjcTicketValidator\.Sell\);/);
  // Node (bridge/web/robot/agente): nenhuma funcao de envio de ordem
  const NODE_ORDER_FN = /\b(sendOrder|placeOrder|submitOrder|executeTrade|createOrder|flattenAll|\/orders?\b['"`]|:5152)/i;
  for (const f of SRC) assert.ok(!NODE_ORDER_FN.test(strip(readFileSync(f, 'utf8'))), path.relative(REPO_ROOT, f));
  // ROBOT: binding de ordem isolado (recusa do ambiente, 24/09) — intents vazias, fila recusa, decisao NONE
  assert.equal(SAFETY.JEV_CAN_SEND_ORDER, false);
  assert.equal(ORDER_PATH.state, 'HARD_DISABLED');
  const cs = readFileSync(path.join(REPO_ROOT, 'nt8', 'AddOns', 'InvictusJevCode', 'IjcPure.cs'), 'utf8');
  assert.match(cs, /public const bool JEV_CAN_SEND_ORDER = false;/);
  assert.match(cs, /public const string ORDER_PATH = "HARD_DISABLED";/);
  const core = createRobotCore({ config: loadRobotConfig(path.join(REPO_ROOT, 'config', 'ijc-robot-v1.json')), stateDir: mkdtempSync(path.join(os.tmpdir(), 'ijc-s-')) });
  assert.deepEqual(core.intentsAfter(0), []);
  assert.equal(core.queue.enqueue({ intent_id: 'x', snapshot_id: 'y', action: 'ENTER_SHORT' }).reason, 'HARD_DISABLED');
});

test('I02 NO SECOND BRAIN: so src/jev/engine.mjs classifica; robo/agente/NT8 so consomem o snapshot', () => {
  const ijc = SRC.filter((f) => f.includes(path.join('src', 'ijc')));
  assert.ok(ijc.length >= 10);
  for (const f of ijc) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/engine\.mjs|createRuntime|native\.mjs|quality\.mjs|spx\.mjs|rules\.mjs/.test(s), path.relative(REPO_ROOT, f) + ' importa o motor');
  }
  for (const f of NT8) assert.ok(!/jev_directional_context\s*=|DirectionalContext\s*=\s*"(LONG|SHORT)/.test(readFileSync(f, 'utf8')), path.relative(REPO_ROOT, f) + ' classifica');
  const decision = readFileSync(path.join(REPO_ROOT, 'src', 'ijc', 'robot', 'decision.mjs'), 'utf8');
  assert.ok(!/gamma_regime|dealer_context|native_dealer_state/.test(decision), 'decisao nao reinterpreta dealer/regime');
});

test('I03 PRODUCTION UNTOUCHED: nenhuma referencia/escrita a producao ou pastas do NT8', () => {
  const PROD = /robo-trade|signal-engine|DarkFlow|Consolidator|Copilot|FlowOne|AlfaOmega(Robo|Trader|SharedState)|bin\\\\Custom|NinjaTrader 8\\\\bin|Documents\\\\NinjaTrader/;
  for (const f of [...SRC, ...NT8]) assert.ok(!PROD.test(strip(readFileSync(f, 'utf8'))), path.relative(REPO_ROOT, f));
  // o unico acesso a pasta de dados do NT8 e UserDataDir\invictus-jev-code (proprio produto)
  const addon = readFileSync(path.join(REPO_ROOT, 'nt8', 'AddOns', 'InvictusJevCode', 'IjcAddOn.cs'), 'utf8');
  assert.match(addon, /Globals\.UserDataDir, "invictus-jev-code"/);
});

test('I04 UNKNOWN e estado operacional: robo e bridge seguem com UNKNOWN (nao e falha)', () => {
  const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
  const out = rt.run(JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures', 'jev', 'C_valid_multi_source.json'), 'utf8')));
  assert.equal(out.output.jev_directional_context, 'UNKNOWN');
  const core = createRobotCore({ config: loadRobotConfig(path.join(REPO_ROOT, 'config', 'ijc-robot-v1.json')), stateDir: mkdtempSync(path.join(os.tmpdir(), 'ijc-s-')) });
  core.onSnapshot({ ...out, snapshot_id: 'u#1' });
  const pub = core.publicStatus();
  assert.equal(pub.decision.action, 'NONE');
  assert.equal(pub.state, 'OFF');
});
