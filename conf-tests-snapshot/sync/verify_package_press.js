// P1S 2026-10-02 — confere o pacote install-package-20261002-press: SHA256_PAYLOAD.txt == payload == staging atual.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SYNC = __dirname, PKG = path.join(SYNC, 'install-package-20261002-press');
const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
const stg = rel => rel.startsWith('aot/') ? path.join(SYNC, rel) : rel.startsWith('AddOns/') ? path.join(SYNC, 'staging', rel) : path.join(SYNC, 'staging', rel);
let ok = 0, fail = 0;
const linhas = fs.readFileSync(path.join(PKG, 'SHA256_PAYLOAD.txt'), 'utf8').trim().split('\n');
for (const l of linhas) {
  const [h, p] = l.split(/\s+/), rel = p.replace(/^payload\//, '');
  const a = sha(path.join(PKG, p)), b = sha(stg(rel));
  if (a === h && b === h) ok++; else { fail++; console.log(`FAIL ${rel} lista=${h.slice(0, 16)} pkg=${(a || '-').slice(0, 16)} staging=${(b || '-').slice(0, 16)}`); }
}
if (linhas.length !== 11) { fail++; console.log('FAIL esperado 11 arquivos, lista tem ' + linhas.length); }
if (!fs.existsSync(path.join(PKG, 'MANIFEST_INSTALL_NAO_EXECUTADO.md'))) { fail++; console.log('FAIL manifesto ausente'); }
console.log(`PACKAGE_PRESS: ok=${ok} fail=${fail} => ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
