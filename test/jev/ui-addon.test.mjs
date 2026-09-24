// UI web (Control Center) e AddOn NT8 do INVICTUS JEV CODE — contrato visual/funcional e ausencia de caminho de ordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../../src/jev/engine.mjs';
import { REPO_ROOT } from '../../src/jev/config.mjs';
import { createBridge } from '../../src/jev/bridge/server.mjs';
import { buildPanel } from '../../src/jev/bridge/panel-model.mjs';

const rt = createRuntime(path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'));
const FX = path.join(REPO_ROOT, 'fixtures', 'jev');
const fx = (n) => JSON.parse(readFileSync(path.join(FX, n), 'utf8'));
const req = (port, p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); });
});
const bridges = [];
after(async () => { for (const b of bridges) await b.close(); });

test('B06 Control Center: identidade INVICTUS JEV CODE, abas/status do Codex, so loopback, ON desabilitado, sem probabilidade/BUY/SELL', async () => {
  const b = createBridge({ host: '127.0.0.1', port: 0, mode: 'REPLAY' }); const { port } = await b.listen(); bridges.push(b);
  const r = await req(port, '/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.body, /<title>INVICTUS JEV CODE<\/title>/);
  for (const t of ['ENGINE', 'LIVE DATA', 'JEV AGENT', 'ROBOT', 'Analyzer', 'Robot', 'Details', 'Settings', 'Logs', 'JEV Native Dealer', 'SPX Final Context', 'MENTHORQ · CONFIRMATION OVERLAY', 'ONE SHARED ENGINE']) assert.ok(r.body.includes(t), t);
  assert.ok(!/(src|href)=["']https?:\/\//.test(r.body), 'recurso externo');
  const urls = r.body.match(/https?:\/\/[^'"\s)]+/g) || [];
  assert.ok(urls.every((u) => u.startsWith('http://127.0.0.1:3592/agent/v1/')), 'so o agente opcional em loopback: ' + urls.join(','));
  assert.match(r.body, /id="btn-on" disabled aria-disabled="true"/);
  assert.ok(!/method:\s*['"](POST|PUT|DELETE|PATCH)/i.test(r.body), 'web nao escreve');
  assert.ok(!/3591|x-ijc-token|enable-request/i.test(r.body), 'web nao conhece o control plane');
  assert.ok(!/\b(BUY|SELL)\b/.test(r.body), 'sem BUY/SELL');
  assert.ok(!/probability"?\s*:|chance|%\s*(long|short)/i.test(r.body), 'sem probabilidade');
});

test('B09 NT8 AddOn INVICTUS JEV CODE V2: API de ordem so no caminho manual, robo isolado, rede so loopback, HttpWebRequest por chamada', () => {
  const dir = path.join(REPO_ROOT, 'nt8', 'AddOns', 'InvictusJevCode');
  const files = readdirSync(dir).filter((f) => f.endsWith('.cs'));
  assert.deepEqual(files.sort(), ['IjcAddOn.cs', 'IjcControlCenterWindow.cs', 'IjcExecutor.cs', 'IjcManualOrders.cs', 'IjcPure.cs']);
  assert.ok(!readdirSync(path.join(REPO_ROOT, 'nt8', 'AddOns')).includes('JevControlCenter.cs'), 'AddOn preliminar substituido');
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
  const all = files.map((f) => [f, strip(readFileSync(path.join(dir, f), 'utf8'))]);
  const ORDER_API = /CreateOrder|SubmitOrder|\.Submit\(|Account\.(Change|Cancel|Flatten)|\b[a-z]\.(Change|Cancel|Submit)\(|Flatten|\bAtm[A-Z]|EnterLong|EnterShort|ExitLong|ExitShort|OrderAction\.|CancelAllOrders/;
  for (const [f, code] of all) {
    if (f !== 'IjcManualOrders.cs') assert.ok(!ORDER_API.test(code), f + ': API de ordem fora do caminho manual');
    assert.ok(!/HttpClient\b/.test(code), f + ': HttpClient');
    const urls = code.match(/https?:\/\/[^"\s]+/g) || [];
    // o prefixo literal "http://127.0.0.1:" e a propria trava de loopback do IjcHttp
    assert.ok(urls.every((u) => /^http:\/\/127\.0\.0\.1:((3590|3591|3592)(\/|$)|$)/.test(u)), f + ': URL fora de loopback ' + urls);
    assert.ok(!/Process\.Start/.test(code), f + ': processo');
    if (f !== 'IjcPure.cs') assert.ok(!/File\.(Write|Append|Delete|Move)|StreamWriter/.test(code), f + ': escrita em disco fora de IjcPure (log/dedup)');
  }
  const get = (n) => all.find(([f]) => f === n)[1];
  const pure = get('IjcPure.cs');
  assert.match(pure, /public const bool JEV_CAN_SEND_ORDER = false;/);
  assert.match(pure, /req\.Proxy = null;/);
  assert.match(pure, /req\.KeepAlive = false;/);
  assert.match(pure, /CultureInfo\.InvariantCulture/);
  assert.match(pure, /DateParseHandling\.None/);
  assert.match(pure, /"Simulator", StringComparison\.Ordinal/);
  assert.match(pure, /"Playback", StringComparison\.Ordinal/);
  const win = get('IjcControlCenterWindow.cs');
  assert.match(win, /Task\.Run\(\(\) => PollLoop/);
  assert.match(win, /Task\.Run\(\(\) => AccountLoop/);                 // conta/PNL em laco proprio, independente do bridge
  assert.match(win, /Caption = IjcSafety\.ProductName \+ " · " \+ IjcSafety\.Brand/);
  // a janela so LE bridge/agente; o control plane so e tocado via IjcExecutor.RobotControl (OFF/ON do robo), nunca pela boleta
  const winUrls = (win.match(/const string \w+Url = "[^"]+"/g) || []).join(' ');
  assert.ok(!/3591/.test(winUrls) && !/[^A-Za-z]Token\(\)|X-IJC-Token|TokenPath|IjcHttp\.Request\("POST"/.test(win), 'a janela nao faz POST direto');
  assert.equal((win.match(/IjcExecutor\.RobotControl\(/g) || []).length, 1);
  assert.match(pure, /public const string ORDER_PATH = "HARD_DISABLED";/);   // trava do ROBOT (binding isolado)
  const ex = get('IjcExecutor.cs');
  assert.match(ex, /IsBackground = true/);
  assert.match(ex, /lock \(Account\.All\) \{ snap = Account\.All\.ToArray\(\); \}/);
  assert.match(ex, /IjcExecutionStub\.SubmitIntent/);
});

test('B10 script do Control Center executa e renderiza o painel real (DOM simulado), incluindo OFFLINE last-known', async () => {
  const html = readFileSync(path.join(REPO_ROOT, 'src', 'jev', 'bridge', 'control-center.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const mk = () => {
    const els = {};
    const el = (id) => (els[id] = els[id] || { id, textContent: '', innerHTML: '', className: '', value: '', style: {}, dataset: {},
      classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle(c, on) { if (on) this.s.add(c); else this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      addEventListener() {}, setAttribute() {}, scrollIntoView() {} });
    return { els, document: { getElementById: el, querySelectorAll: () => [], documentElement: { style: { setProperty() {} } } } };
  };
  const res = rt.run(fx('E_trace_vs_volsignals_different.json')); res.snapshot_id = 'snap-test#1';
  const panel = buildPanel(res, { mode: 'REPLAY', cycles: 1 });
  const localStorage = { getItem: () => null, setItem() {} };
  const run = async (fetchImpl) => {
    const { els, document } = mk();
    new Function('document', 'fetch', 'localStorage', 'setInterval', 'clearInterval', 'AbortController', script)(document, fetchImpl, localStorage, () => 1, () => {}, AbortController);
    await new Promise((r) => setTimeout(r, 30));
    return els;
  };
  const ok = await run(async (u) => { if (u === '/jev/v1/state') return { ok: true, json: async () => panel }; throw new Error('offline'); });
  assert.equal(ok['ctx-label'].textContent, 'UNKNOWN');
  assert.match(ok.ctxwhy.textContent, /Sem regra direcional ativa/);
  assert.match(ok['robot-why'].textContent, /JEV_CAN_SEND_ORDER=false/);
  assert.match(ok['mk-dq'].innerHTML, /DEGRADED/);
  assert.match(ok.spx.innerHTML, /TRACE/);
  assert.match(ok.reasons.innerHTML, /RC_NO_ACTIVE_DIRECTIONAL_RULE/);
  assert.equal(ok['st-engine'].textContent, 'OPERATIONAL');
  assert.equal(ok['st-agent'].textContent, 'NOT REPORTED');
  assert.match(ok['footer-snap'].innerHTML, /snap-test#1/);
  assert.equal(ok.offline.style.display, 'none');
  const off = await run(async () => { throw new Error('down'); });
  assert.equal(off.offline.style.display, 'block');
  assert.equal(off['st-live'].textContent, 'OFFLINE');
  assert.ok(off.app.classList.contains('stale'));
});
