// Testes do apply-misleading-text.sh em SANDBOX (AOT_DIR temporario + servidor estatico local). Producao: so o modo checagem.
//   node tests/apply-script-tests.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { execFile } from 'node:child_process'; import { promisify } from 'node:util';
const run = promisify(execFile);
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const SCRIPT = path.join(D, 'apply-misleading-text.sh').replace(/\\/g, '/');
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'misleading-sb-')).replace(/\\/g, '/');
const PUB = path.join(SB, 'public');
const reset = () => { fs.rmSync(SB, { recursive: true, force: true }); fs.mkdirSync(PUB, { recursive: true });
  for (const f of ['index.html', 'auto.html']) fs.copyFileSync(path.join(D, 'base', f), path.join(PUB, f)); };
const srv = http.createServer((q, r) => fs.readFile(path.join(PUB, q.url === '/' ? 'index.html' : q.url.slice(1)), (e, b) => { r.writeHead(e ? 404 : 200); r.end(e ? '' : b); }));
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const env = { ...process.env, AOT_DIR: SB, BFF_URL: 'http://127.0.0.1:' + srv.address().port };
const sh = async (args, e = env) => { try { const { stdout } = await run('bash', [SCRIPT, ...args], { env: e }); return { code: 0, out: stdout.trim() }; }
  catch (x) { return { code: x.code, out: String(x.stdout || '').trim() }; } };
const same = (a, b) => fs.readFileSync(a).equals(fs.readFileSync(b));
let pass = 0, fail = 0; const t = (n, c, i = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (i ? ' — ' + i : '')); };
try {
  reset(); let r = await sh([]);
  t('S1 checagem na preimagem: exit 0, nada alterado', r.code === 0 && /CHECAGEM OK/.test(r.out) && same(path.join(PUB, 'index.html'), path.join(D, 'base/index.html')), r.out);
  r = await sh(['--apply']);
  t('S2 --apply: exit 0, os 2 arquivos = candidato, backup = preimagem', r.code === 0 && /APLICADO/.test(r.out)
    && ['index.html', 'auto.html'].every(f => same(path.join(PUB, f), path.join(D, 'candidate', f)) && same(path.join(SB, '_backups/auto-misleading-text-20261014', f), path.join(D, 'base', f))), r.out);
  r = await sh(['--apply']); t('S3 reaplicar: JA APLICADO, exit 0', r.code === 0 && /JA APLICADO/.test(r.out), r.out);
  r = await sh(['--rollback']);
  t('S4 --rollback: os 2 arquivos = preimagem', r.code === 0 && ['index.html', 'auto.html'].every(f => same(path.join(PUB, f), path.join(D, 'base', f))), r.out);
  reset(); fs.appendFileSync(path.join(PUB, 'auto.html'), '\n<!-- alteracao concorrente -->');
  const before = fs.readFileSync(path.join(PUB, 'index.html'));
  r = await sh(['--apply']);
  t('S5 conflito (auto.html diferente): exit != 0, nada alterado', r.code !== 0 && /CONFLITO/.test(r.out) && fs.readFileSync(path.join(PUB, 'index.html')).equals(before), r.out);
  reset(); r = await sh(['--apply'], { ...env, BFF_URL: 'http://127.0.0.1:1' });
  t('S6 servidor nao serve o candidato: exit != 0 e restauracao automatica', r.code !== 0 && /restaurando/.test(r.out)
    && ['index.html', 'auto.html'].every(f => same(path.join(PUB, f), path.join(D, 'base', f))), r.out);
  fs.rmSync(SB, { recursive: true, force: true });
  r = await sh([], { ...process.env });   // producao: SO checagem (sem --apply)
  t('P1 producao, modo checagem: preimagens conferidas, nada alterado', r.code === 0 && /CHECAGEM OK|JA APLICADO/.test(r.out), r.out);
} finally { srv.close(); }
console.log(`\n${pass}/${pass + fail} PASS`); process.exitCode = fail ? 1 : 0;
