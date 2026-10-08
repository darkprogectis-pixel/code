// Acrescenta ao MASTER MANIFEST os 13 zips de transporte e copia tudo para a pasta de destino LOCAL, sem sobrescrever nada.
// Colisao de nome: preserva o existente e grava com sufixo _b<N>. Confere SHA256 origem x destino.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = path.join(__dirname, '..'), DEST = 'C:/Users/ADM/Downloads/Telegram Desktop/invictus pack 1000';
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const cont = JSON.parse(fs.readFileSync(path.join(R, 'CONTEINERES_Z30X2.json'), 'utf8').replace(/^\uFEFF/, ''));
if (!fs.existsSync(DEST)) { console.log('DESTINO AUSENTE'); process.exit(1); }
const antes = fs.readdirSync(DEST); const antesSha = {}; for (const n of antes) antesSha[n] = sha(path.join(DEST, n));
const mtxt = path.join(R, 'MASTER_MANIFEST_INVICTUS_Z30X2_20261008.txt');
let m = fs.readFileSync(mtxt, 'utf8');
if (!m.includes('== ZIPS DE TRANSPORTE ==')) {
  m = m.replace(/TRANSPORT_ZIP = NOT_BUILT/g, 'TRANSPORT_ZIP = BUILT').replace('(pastas montadas; zips de transporte NAO gerados — acao negada pelo controle de permissoes do executor)', '(pastas montadas + zips de transporte)');
  const L = ['', '== ZIPS DE TRANSPORTE == (NAO_IMPORTAR: so transportam o pacote; RETIDOS ate JEV DIFF T3 = A e JEV FINAL de release)'];
  for (const c of cont) { L.push(`CLIENT = ${c.cliente}`); L.push(`FILE = ${path.basename(c.file)}`); L.push(`SHA256 = ${c.sha256}`); L.push(`STATUS = OFFLINE_VALIDATED_RETAINED_UNTIL_T3 · REAL_CAPABLE = YES · TECHNICAL_BLOCK = NONE`); L.push(''); }
  L.push('DESTINO LOCAL = C:\\Users\\ADM\\Downloads\\Telegram Desktop\\invictus pack 1000 (copia local; NAO e envio nem distribuicao)');
  fs.writeFileSync(mtxt, m.replace(/\r?\n$/, '') + '\r\n' + L.join('\r\n') + '\r\n');
}
const itens = cont.map(c => ({ src: c.file, nome: path.basename(c.file), esperado: c.sha256, cliente: c.cliente }));
itens.push({ src: mtxt, nome: path.basename(mtxt), esperado: sha(mtxt), cliente: 'MASTER_MANIFEST' });
const res = []; let col = 0;
for (const it of itens) {
  if (sha(it.src) !== it.esperado) { console.log('ORIGEM DIFERENTE DO VALIDADO', it.nome); process.exit(1); }
  let nome = it.nome, k = 1; let ja = false;
  while (fs.existsSync(path.join(DEST, nome))) { if (sha(path.join(DEST, nome)) === it.esperado) { ja = true; break; } col++; k++; nome = it.nome.replace(/(\.[^.]+)$/, `_b${k}$1`); }
  if (!ja) fs.copyFileSync(it.src, path.join(DEST, nome), fs.constants.COPYFILE_EXCL);
  const d = sha(path.join(DEST, nome)); res.push({ cliente: it.cliente, arquivo: nome, source_sha256: it.esperado, destination_sha256: d, match: d === it.esperado, ja_existia_identico: ja });
}
const depois = fs.readdirSync(DEST); let sobrescritos = 0, sumiram = 0; for (const n of antes) { if (!depois.includes(n)) sumiram++; else if (sha(path.join(DEST, n)) !== antesSha[n]) sobrescritos++; }
fs.writeFileSync(path.join(R, 'DESTINO_FINAL_VERIFICACAO.json'), JSON.stringify({ destino: DEST, arquivos_antes: antes.length, arquivos_depois: depois.length, colisoes: col, sobrescritos, removidos: sumiram, itens: res }, null, 1));
for (const r of res) console.log((r.match ? 'MATCH ' : 'DIFF  ') + r.cliente + ' | ' + r.arquivo + ' | ' + r.destination_sha256);
console.log(`antes=${antes.length} depois=${depois.length} copiados=${res.filter(r => !r.ja_existia_identico).length} mismatch=${res.filter(r => !r.match).length} colisoes=${col} sobrescritos=${sobrescritos} removidos=${sumiram}`);
