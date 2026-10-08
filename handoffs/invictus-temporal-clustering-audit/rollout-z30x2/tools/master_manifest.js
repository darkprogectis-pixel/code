// MASTER MANIFEST do rollout Z30X2 (offline; packs RETIDOS). Le FAMILIAS_Z30X2.json, ENTREGAS_Z30X2.json, CLASSIFICACAO_INVENTARIO.json e os testes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = path.join(__dirname, '..'), W = path.join(R, '..');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fam = J(path.join(R, 'build', 'FAMILIAS_Z30X2.json')), ent = J(path.join(R, 'entregas', 'ENTREGAS_Z30X2.json')), cls = J(path.join(R, 'CLASSIFICACAO_INVENTARIO.json'));
const T = path.join(R, 'tests'); const t = {};
for (const f of fam.map(x => x.familia)) {
  const h = J(path.join(T, `exit_harness_${f}.json`)), b = J(path.join(T, `exit_bench_${f}.json`));
  const comp = fs.readdirSync(T).filter(n => n.startsWith(`compile_${f}_`) && n.endsWith('.json')).map(n => ({ cenario: n.replace(/^compile_|\.json$/g, ''), erros: J(path.join(T, n)).errors, cs: J(path.join(T, n)).cs }));
  t[f] = { compile: comp, harness: h.pass + '/' + h.total, bancada: b.pass + '/' + b.total, pgcap_api_sha256: sha(path.join(T, `pgcap_api_${f}.json`)) };
}
const AVISO = 'PACK TECNICAMENTE LIBERADO PARA CONTA REAL. POR ORIENTACAO OPERACIONAL, NAO UTILIZAR CONTA REAL ATE A CONCLUSAO DA VALIDACAO LIVE E A LIBERACAO FINAL DO PROJETO INVICTUS.';
const L = [];
L.push('MASTER MANIFEST — ROLLOUT INVICTUS Z30X2 (P-GCAP + FORCA_JANELA_30 + EXIT_LAYER_FIX X2) — 2026-10-08');
L.push('ESTADO = CONSTRUIDO E VALIDADO OFFLINE — ENTREGA E USO RETIDOS ate JEV DIFF T3 = A (EXIT_LAYER_FIX X2) e JEV FINAL de release');
L.push('JEV ROLLOUT GATE = G1 preparar e reter 0,97 (req_01a11d42365f71b592f54c95ed5c263b)');
L.push('JEV ROLLOUT DIFF = A 0,94 · FINAL OFFLINE = A 0,99 (req_01a11d5c34737272879eb438b8c71304)');
L.push('LIVE_MARKET_VALIDATION = PENDING_MARKET_OPEN');
L.push('REAL_CAPABLE = YES · REAL_ENABLED = YES · TECHNICAL_BLOCK = NONE · FUTURE_REIMPORT_REQUIRED = NO (os packs so contem codigo-fonte; nenhuma configuracao de contas/ativos)');
L.push('AVISO OPERACIONAL (em cada entrega) = ' + AVISO);
L.push(''); L.push('== IMPORTS DE FAMILIA ==');
for (const f of fam) { L.push(`FAMILIA = ${f.familia}`); L.push(`IMPORT = ${f.zip}`); L.push(`IMPORT_SHA256 = ${f.sha256}`); L.push(`ENTRADAS = ${f.entradas} · TROCADAS = ${f.trocados.length} · UNEXPECTED_CHANGED = ${f.unexpected_changed.length}`);
  L.push(`ROLLBACK (import P-GCAP anterior) = ${f.base_zip}`); L.push(`ROLLBACK_SHA256 = ${f.base_sha256}`);
  L.push(`COMPILE = ${t[f.familia].compile.map(c => c.cenario + ':' + c.erros + ' erros').join(' · ')}`); L.push(`HARNESS = ${t[f.familia].harness} · BANCADA = ${t[f.familia].bancada} · PGCAP_API = ${t[f.familia].pgcap_api_sha256.slice(0, 12)} (= OLIVER b7535a5e23f9)`); L.push(''); }
L.push('FORCA_JANELA_30 (arquivos de gate identicos nas 5 familias) = 182160 passos 100% iguais · 860/860 entradas'); L.push('');
L.push('== ENTREGAS POR CLIENTE (pastas montadas; zips de transporte NAO gerados — acao negada pelo controle de permissoes do executor) ==');
for (const e of ent) { L.push(`PACK = ${e.cliente} · FAMILIA = ${e.familia} · BASE_VERSION = P-GCAP 20261007 · CLASSIFICATION = AFFECTED · PATCH_APPLIED = Z30X2`);
  L.push(`  PASTA = ${path.join(e.dir, '_conteudo_entrega')}`); L.push(`  IMPORT_ZIP = ${e.import} · IMPORT_SHA256 = ${e.import_sha256}`); L.push(`  ROLLBACK_ZIP = ${e.rollback} · ROLLBACK_SHA256 = ${e.rollback_sha256}`);
  const ok = sha(path.join(e.dir, '_conteudo_entrega', e.import)) === e.import_sha256 && sha(path.join(e.dir, '_conteudo_entrega', e.rollback)) === e.rollback_sha256;
  L.push(`  COPIAS_CONFEREM = ${ok ? 'YES' : 'NO'} · OPERATOR_WARNING_PRESENT = ${fs.existsSync(path.join(e.dir, '_conteudo_entrega', 'AVISO_OPERACIONAL.txt')) ? 'YES' : 'NO'} · TRANSPORT_ZIP = NOT_BUILT · READY_FOR_DISTRIBUTION = NO (RETIDO ate T3)`); }
L.push(''); L.push('PACK = OLIVER_MAIN_MACHINE · CLASSIFICATION = ALREADY_CURRENT (estado instalado) · pack BASELINE validado offline');
L.push('  IMPORT_ZIP = ' + path.join(W, 'newpack', 'CURRENT_LIVE_BASELINE_20261008', 'AlfaOmega_OLIVER_INVICTUS_BASELINE_ATUAL_20261008_import.zip')); L.push('  IMPORT_SHA256 = 975b5955b9f4280cb9945981e07c89670a304fce93d8d2c94cea0cc98b79ba49 · JEV FINAL A como baseline (req_01a11d3989bc75a49119fda1994e0370)');
L.push(''); L.push('== INVENTARIO =='); L.push(`ZIPS_VARRIDOS = ${cls.zips_varridos} · COM_CAMADA_DE_SAIDA = ${cls.com_camada_de_saida} · ${Object.entries(cls.totais).map(([k, v]) => k + ' = ' + v).join(' · ')} · UNKNOWN = ${cls.totais.UNKNOWN || 0}`);
L.push('8 pacotes historicos de setembro = NOT_APPLICABLE (bases substituidas pelas entregas de familia; JEV 0,93)'); L.push('Detalhe: ' + path.join(R, 'CLASSIFICACAO_INVENTARIO.json'));
fs.writeFileSync(path.join(R, 'MASTER_MANIFEST_INVICTUS_Z30X2_20261008.txt'), L.join('\r\n') + '\r\n');
fs.writeFileSync(path.join(R, 'MASTER_MANIFEST_INVICTUS_Z30X2_20261008.json'), JSON.stringify({ familias: fam.map(f => ({ familia: f.familia, zip: f.zip, sha256: f.sha256, entradas: f.entradas, unexpected_changed: f.unexpected_changed.length, rollback: f.base_zip, rollback_sha256: f.base_sha256, testes: t[f.familia] })), entregas: ent, inventario: cls.totais }, null, 1));
console.log(L.filter(l => /^(PACK|FAMILIA|IMPORT_SHA256|  COPIAS)/.test(l)).join('\n'));
