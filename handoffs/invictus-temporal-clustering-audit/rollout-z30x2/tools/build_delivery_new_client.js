// Novo cliente (familia F1, pack completo): monta a pasta de entrega no MESMO padrao das 12 entregas Z30X2, a partir da entrega F1 de cliente novo
// ja existente (ANAALICEGUSTAVO = ADD). Import e rollback = copias byte a byte dos artefatos F1 aprovados. Nenhuma senha e gravada aqui.
// uso: node build_delivery_new_client.js <CLIENTE> <login>
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [CLI, LOGIN] = process.argv.slice(2); if (!CLI || !LOGIN) { console.log('uso: <CLIENTE> <login>'); process.exit(1); }
const R = path.join(__dirname, '..'), REF = 'ANAALICEGUSTAVO';
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fam = JSON.parse(fs.readFileSync(path.join(R, 'build', 'FAMILIAS_Z30X2.json'), 'utf8').replace(/^﻿/, '')).find(f => f.familia === 'F1');
const src = path.join(R, 'entregas', REF, '_conteudo_entrega'), dir = path.join(R, 'entregas_novos', CLI), stg = path.join(dir, '_conteudo_entrega');
if (fs.existsSync(dir)) { console.log('JA EXISTE (nao sobrescrever): ' + dir); process.exit(1); }
fs.mkdirSync(stg, { recursive: true });
const imp = `ALFA_OMEGA_${CLI}_INVICTUS_Z30X2_import.zip`, rb = `ALFA_OMEGA_${CLI}_INVICTUS_PGCAP_ROLLBACK_import.zip`;
fs.copyFileSync(fam.zip, path.join(stg, imp)); fs.copyFileSync(fam.base_zip, path.join(stg, rb));
if (sha(path.join(stg, imp)) !== fam.sha256 || sha(path.join(stg, rb)) !== fam.base_sha256) { console.log('COPIA DIFERENTE'); process.exit(1); }
let leia = fs.readFileSync(path.join(src, 'LEIA_PRIMEIRO.txt'), 'utf8');
const m = leia.match(/Login AlfaOmega:[^\r\n]*/); if (!m) { console.log('linha de login nao encontrada no modelo'); process.exit(1); }
leia = leia.replace(m[0], `Login AlfaOmega: ${LOGIN}  (conta NOVA deste cliente; a senha e entregue a parte pelo operador e NAO esta neste pacote)`).split(REF).join(CLI);
leia = leia.replace(/\r?\nPARA VOLTAR AO PACOTE ANTERIOR \(P-GCAP de 07\/10\)\r?\n/, '\r\nPARA VOLTAR AO PACOTE P-GCAP DE 07/10 (so se for orientado; em instalacao nova nao ha pacote anterior)\r\n');
if (leia.includes(REF) || /anaalice|gustavo/i.test(leia)) { console.log('RESIDUO DO MODELO'); process.exit(1); }
fs.writeFileSync(path.join(stg, 'LEIA_PRIMEIRO.txt'), leia);
fs.copyFileSync(path.join(src, 'AVISO_OPERACIONAL.txt'), path.join(stg, 'AVISO_OPERACIONAL.txt'));
fs.copyFileSync(path.join(src, 'ENTRIES.json'), path.join(stg, 'ENTRIES.json'));
const files = ['LEIA_PRIMEIRO.txt', 'AVISO_OPERACIONAL.txt', 'ENTRIES.json', imp, rb];
fs.writeFileSync(path.join(stg, 'SHA256SUMS.txt'), files.map(n => sha(path.join(stg, n)) + '  ' + n).join('\r\n') + '\r\n');
// isolamento: nenhum identificador de outro cliente nos textos da entrega
const IDS = /lufdutra|ranyere|marcos|airison|hamzeh|anavieira|joao[-_]?hs|wjavertjr|nelson|anaalice|gustavo|magnum|piloto-|DESKTOP-CBDFE4C/i; let vaz = 0;
for (const n of ['LEIA_PRIMEIRO.txt', 'AVISO_OPERACIONAL.txt', 'SHA256SUMS.txt']) if (IDS.test(fs.readFileSync(path.join(stg, n), 'utf8'))) vaz++;
const e = JSON.parse(fs.readFileSync(path.join(stg, 'ENTRIES.json'), 'utf8')); const entriesIguais = sha(path.join(stg, 'ENTRIES.json')) === sha(path.join(src, 'ENTRIES.json'));
fs.writeFileSync(path.join(dir, 'ENTREGA.json'), JSON.stringify({ cliente: CLI, familia: 'F1', login: LOGIN, import: imp, import_sha256: fam.sha256, rollback: rb, rollback_sha256: fam.base_sha256, arquivos: files.concat('SHA256SUMS.txt'), vazamento_outro_cliente: vaz, entries_iguais_a_referencia_f1: entriesIguais, entradas: e.entries.length }, null, 1));
console.log(CLI, 'F1 import', fam.sha256.slice(0, 12), 'rollback', fam.base_sha256.slice(0, 12), 'vazamento_outro_cliente', vaz, 'entries', e.entries.length, 'entries=ref', entriesIguais);
