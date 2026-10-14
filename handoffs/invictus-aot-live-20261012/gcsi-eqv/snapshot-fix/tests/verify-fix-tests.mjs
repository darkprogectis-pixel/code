// Testes do verify() do apply-bff-snapshot.sh: extrai o código node -e REAL do script e o executa como processo filho.
// Sucesso: GET somente leitura no :3600 de produção. Falhas: servidor HTTP local de teste (porta efêmera) com payloads
// que violam cada condição, e porta fechada. Nenhum shim de processo, nenhuma escrita em produção, nada de --apply.
// Uso: node verify-fix-tests.mjs <script-original> <script-corrigido>
import fs from 'node:fs'; import http from 'node:http'; import { spawnSync, spawn } from 'node:child_process';
const [orig, fixed] = process.argv.slice(2);
const code = (f) => { const s = fs.readFileSync(f, 'utf8'); const m = s.match(/verify\(\) \{ node -e "\n([\s\S]*?)"; \}/); if (!m) throw new Error('verify() não encontrado em ' + f); return m[1]; };
const run = (src, base) => new Promise((res) => {
  const p = spawn(process.execPath, ['-e', base ? src.replaceAll('http://127.0.0.1:3600', base) : src], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
  const t = setTimeout(() => p.kill(), 30000);
  p.on('close', (c) => { clearTimeout(t); res({ code: c, out: out.trim(), crash: /Assertion failed/.test(err), err: err.trim().slice(0, 160) }); });
});
let n = 0, fail = 0; const check = (name, ok, d = '') => { n++; if (ok) console.log('PASS ' + name); else { fail++; console.log('FAIL ' + name + ' :: ' + d); } };
const vOrig = code(orig), vFix = code(fixed);

// causa: versão original contra produção (somente GET)
let crashes = 0, exits = [];
for (let i = 0; i < 5; i++) { const r = await run(vOrig); if (r.crash) crashes++; exits.push(r.code); }
console.log(`INFO original x5: exits=${exits.join(',')} crashes=${crashes}`);
// sucesso: versão corrigida contra produção
crashes = 0; exits = []; let lastOut = '';
for (let i = 0; i < 10; i++) { const r = await run(vFix); if (r.crash) crashes++; exits.push(r.code); lastOut = r.out; }
check('V01 corrigido x10 contra :3600 (todas as condições true) => exit 0, sem assertion libuv', exits.every((c) => c === 0) && crashes === 0, `exits=${exits.join(',')} crashes=${crashes}`);
check('V02 saída JSON da verificação preservada', /"health":true/.test(lastOut) && /"gcsiSimProd":false/.test(lastOut), lastOut);

// falhas reais: servidor local de teste
const good = await (await fetch('http://127.0.0.1:3600/state')).json();
const cases = {
  'V03 health ok:false': { health: { ok: false } },
  'V04 /gcsi/sim enabled:true (sim ligado)': { sim: { enabled: true } },
  'V05 flowRussell ausente': { state: Object.assign({}, good, { flowRussell: null }) },
  'V06 gate ES/NQ ausente': { state: Object.assign({}, good, { gate: null }) },
  'V07 flowGcSi._err': { state: Object.assign({}, good, { flowGcSi: Object.assign({}, good.flowGcSi, { _err: 'x' }) }) },
  'V08 simGcSi presente no /state': { state: Object.assign({}, good, { simGcSi: { side: 'FLAT' } }) },
  'V09 HTTP 500 com corpo inválido': { raw: true },
};
for (const [name, c] of Object.entries(cases)) {
  const srv = http.createServer((req, res) => {
    if (c.raw) { res.writeHead(500); return res.end('erro'); }
    const body = req.url === '/health' ? (c.health || { ok: true }) : req.url === '/gcsi/sim' ? (c.sim || { enabled: false }) : (c.state || good);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const r = await run(vFix, 'http://127.0.0.1:' + srv.address().port);
  srv.close();
  check(name + ' => exit != 0, sem assertion', r.code !== 0 && !r.crash, JSON.stringify(r));
}
// controle: servidor local com payload bom => exit 0
{ const srv = http.createServer((req, res) => { const body = req.url === '/health' ? { ok: true } : req.url === '/gcsi/sim' ? { enabled: false } : good; res.writeHead(200); res.end(JSON.stringify(body)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const r = await run(vFix, 'http://127.0.0.1:' + srv.address().port); srv.close();
  check('V10 controle: servidor local com payload bom => exit 0', r.code === 0 && !r.crash, JSON.stringify(r)); }
// porta fechada
{ const srv = http.createServer(); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port; srv.close();
  const r = await run(vFix, 'http://127.0.0.1:' + port);
  check('V11 BFF fora do ar (porta fechada) => exit != 0 (catch), sem assertion', r.code !== 0 && !r.crash, JSON.stringify(r)); }
// diff restrito
const a = fs.readFileSync(orig, 'utf8').split('\n'), b = fs.readFileSync(fixed, 'utf8').split('\n');
const changed = a.map((l, i) => (l !== b[i] ? i + 1 : 0)).filter(Boolean);
check('V12 só as linhas 29-30 (verify) mudaram; precheck/backup/rollback/restart idênticos', a.length === b.length && changed.join(',') === '29,30', changed.join(','));
check('V13 nenhum process.exit( restante no script corrigido', !/process\.exit\(/.test(fs.readFileSync(fixed, 'utf8')));
console.log(`\n${n - fail}/${n} PASS`); process.exit(fail ? 1 : 0);
