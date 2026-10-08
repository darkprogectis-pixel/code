// Resume tests/PACK_INVENTORY_RAW.json agrupando os zips pelos hashes dos 3 fontes da camada de saida.
const fs = require('fs'), path = require('path');
const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'PACK_INVENTORY_RAW.json'), 'utf8').replace(/^\uFEFF/, ''));
console.log('varridos', j.zips_varridos, 'com alvo', j.com_alvo);
const it = [].concat(j.itens || []); const g = {};
for (const x of it) {
  if (x.erro) { console.log('ERRO', x.zip.slice(-90), String(x.erro).slice(0, 60)); continue; }
  const hs = Object.entries(x.alvo).map(([k, v]) => k.split('/').pop().replace('AlfaOmega', '').replace('.cs', '') + ':' + v.slice(0, 8)).sort().join(' ');
  (g[hs] = g[hs] || []).push(x);
}
const max = +(process.argv[2] || 6);
for (const [k, v] of Object.entries(g).sort((a, b) => b[1].length - a[1].length)) {
  console.log('\n[' + v.length + '] ' + k + '  cls=' + v[0].cls);
  v.sort((a, b) => a.mtime < b.mtime ? 1 : -1);
  for (const x of v.slice(0, max)) console.log('   ' + x.mtime + ' ' + x.zip.split('\\').slice(3).join('/').slice(-150));
  if (v.length > max) console.log('   ... +' + (v.length - max));
}
