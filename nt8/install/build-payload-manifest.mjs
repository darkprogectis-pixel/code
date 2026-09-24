// Gera nt8/install/ijc-payload-manifest.json: SHA256 dos arquivos do AddOn que serao copiados para o NT8.
// Os scripts de instalacao recusam copiar qualquer arquivo cujo hash nao bata com este manifesto.
// Uso: node nt8/install/build-payload-manifest.mjs   (rodar apos QUALQUER alteracao em nt8/AddOns/InvictusJevCode)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'AddOns', 'InvictusJevCode');
// Lote RTH atual (24/09/2026): a boleta manual fica no repositorio mas NAO e instalada (MANUAL_ORDER_INSTALLATION = DEFERRED).
const DEFERRED = ['IjcManualOrders.cs'];
const files = readdirSync(DIR).filter(f => f.endsWith('.cs') && !DEFERRED.includes(f)).sort().map(name => {
  const buf = readFileSync(join(DIR, name));
  return { name, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
});
const manifest = {
  schema: 'ijc-nt8-payload/v1',
  product: 'INVICTUS JEV CODE',
  source_dir: 'nt8/AddOns/InvictusJevCode',
  install_dir: 'Documents\\NinjaTrader 8\\bin\\Custom\\AddOns\\InvictusJevCode',
  jev_can_send_order: false,
  order_path: 'HARD_DISABLED',
  install_lot: 'RTH_TEST_READ_ONLY_NO_MANUAL_ORDER_EXECUTION',
  deferred_not_installed: DEFERRED,
  files,
};
writeFileSync(join(HERE, 'ijc-payload-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
