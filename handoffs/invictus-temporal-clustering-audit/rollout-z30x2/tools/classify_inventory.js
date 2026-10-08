// Classifica TODOS os zips do inventario (tests/PACK_INVENTORY_RAW.json) que contem a camada de saida. UNKNOWN deve ser 0.
// Classes: AFFECTED (import de familia/entrega P-GCAP -> atualizado pelo Z30X2 da familia) · ALREADY_CURRENT (ja contem o nucleo novo)
//          NOT_APPLICABLE (linhagem OLIVER coberta pelo pack baseline, ou pacote historico substituido por uma entrega de familia).
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..'), W = path.join(R, '..');
const inv = JSON.parse(fs.readFileSync(path.join(W, 'tests', 'PACK_INVENTORY_RAW.json'), 'utf8').replace(/^\uFEFF/, ''));
const fam = JSON.parse(fs.readFileSync(path.join(R, 'build', 'FAMILIAS_Z30X2.json'), 'utf8').replace(/^\uFEFF/, ''));
const baseSha = {}; for (const f of fam) baseSha[f.base_sha256] = f.familia;
const h8 = (x, n) => { const k = Object.keys(x.alvo).find(k => k.endsWith('/' + n) || k === n); return k ? x.alvo[k].slice(0, 8) : '-'; };
const out = []; const tot = {};
for (const x of [].concat(inv.itens)) {
  if (x.erro) { out.push({ zip: x.zip, classe: 'UNKNOWN', motivo: 'erro de leitura: ' + x.erro }); continue; }
  const robo = h8(x, 'AlfaOmegaRobo.cs'), fe = h8(x, 'AlfaOmegaRoboFechamento.cs'), sa = h8(x, 'AlfaOmegaRoboSaida.cs'); const nome = x.zip.split('\\').pop();
  let classe, motivo, familia = null;
  if ((robo === 'f678d200' || robo === '0ec04daf') && fe === 'a1fc99a8' && sa === '90e0020a') { classe = 'ALREADY_CURRENT'; motivo = 'ja contem EXIT_LAYER_FIX X2 (zip de teste/baseline/Z30X2)'; }
  else if (robo === 'dc6d45c4' && fe === 'c061880c' && sa === 'ca59088d') {
    classe = 'AFFECTED'; familia = baseSha[x.sha256] || null;
    motivo = familia ? 'import P-GCAP da familia ' + familia + ' (ou copia byte a byte em entrega de cliente) -> substituido pelo Z30X2 da familia' : 'variante de cliente P-GCAP (conteiner de entrega ou copia intermediaria) -> coberta pelos imports Z30X2 das familias';
  }
  else if (robo === '32c84685' && fe === 'c061880c' && sa === 'ca59088d') { classe = 'NOT_APPLICABLE'; motivo = 'linhagem OLIVER/instalacao limpa pre-correcao: OLIVER coberta pelo pack BASELINE 975b5955; pacotes de instalacao limpa anteriores substituidos pelo CANON'; }
  else if (sa === 'bbd3030a' && fe === '-') { classe = 'NOT_APPLICABLE'; motivo = 'pacote historico de setembro (INVICTUS antigo, sem AlfaOmegaRoboFechamento): base historica substituida pela entrega de familia; upgrade sobre ele compilado nos cenarios F1_over_*'; }
  else { classe = 'UNKNOWN'; motivo = 'combinacao de hashes nao prevista: ' + robo + '/' + fe + '/' + sa; }
  tot[classe] = (tot[classe] || 0) + 1;
  out.push({ zip: x.zip, nome, mtime: x.mtime, sha256: x.sha256, robo, fechamento: fe, saida: sa, classe, familia, motivo });
}
fs.writeFileSync(path.join(R, 'CLASSIFICACAO_INVENTARIO.json'), JSON.stringify({ zips_varridos: inv.zips_varridos, com_camada_de_saida: out.length, totais: tot, itens: out }, null, 1));
console.log('com camada de saida', out.length, JSON.stringify(tot));
const antigos = out.filter(o => o.saida === 'bbd3030a'); console.log('antigos de setembro', antigos.length); for (const o of antigos) console.log('  ', o.classe, o.mtime, o.robo, o.zip.split('\\').slice(3).join('/').slice(-110));
const unk = out.filter(o => o.classe === 'UNKNOWN'); for (const o of unk) console.log('UNKNOWN', o.zip, o.motivo);
const semFam = out.filter(o => o.classe === 'AFFECTED' && !o.familia); const nomes = {}; for (const o of semFam) nomes[o.nome] = (nomes[o.nome] || 0) + 1;
console.log('AFFECTED com familia direta', out.filter(o => o.familia).length, '| sem familia direta', semFam.length); console.log(Object.entries(nomes).map(([k, v]) => v + 'x ' + k).join('\n').slice(0, 2500));
