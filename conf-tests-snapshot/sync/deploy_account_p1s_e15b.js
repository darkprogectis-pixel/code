// INVICTUS account-p1s + E15b — DEPLOY do lote (10 .cs) aprovado pelo JEV FINAL #4 = A (req_01a10dd2dd6d7071a36852c67074230c).
// Ordem do operador 2026-10-05 ("GO — JEV FINAL #4 = A. PROSSIGA SOMENTE COM O DEPLOY DO INVICTUS"): pacote FINAL com os 10 .cs,
// backup do live, SHA BEFORE, copia byte a byte SO do lote, SHA AFTER, 10/10 live == staging, ROLLBACK.ps1, config intocada, 0 ordens.
// NAO faz F5, NAO toca config/state, NAO envia ordem. Aborta ANTES de copiar se: live != before\ (drift), staging != SHA aprovado,
// perna nao-legada em motor-execucoes.json, ou pacote ja existe.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SYNC = __dirname;
const LIVE = 'C:/Users/ADM/Documents/NinjaTrader 8/bin/Custom';
const ROBO = 'C:/Users/ADM/Documents/NinjaTrader 8/alfaomega-robo';
const FIX = 'C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/account-p1s-20261005';
const PKG = path.join(SYNC, 'install-package-20261005-account-p1s-e15b');
const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const INST = path.join(FIX, 'install-' + ts);

// rel -> [staging aprovado (FINAL #4), live atual esperado (= before\)]
const LOTE = {
  'AddOns/AlfaOmegaRobo.cs': ['329de781', '14a36da7'],
  'AddOns/AlfaOmegaRoboAtivos.cs': ['9d058edc', '8ef99839'],
  'AddOns/AlfaOmegaRoboOrderWatch.cs': ['54d65747', 'a42bd090'],
  'AddOns/AlfaOmegaBridge.cs': ['df0d16ff', 'ad3ec1c7'],
  'Indicators/TTW_DarkProjects/AlfaOmegaSharedState.cs': ['7e64fc18', 'f7a65406'],
  'Indicators/TTW_DarkProjects/AoPressSessao.cs': ['097279c8', '47c2db5c'],
  'Indicators/TTW_DarkProjects/AoTapeEngine.cs': ['845700b9', 'dd32fd14'],
  'Indicators/TTW_DarkProjects/AoMarketDataPublisher.cs': ['4794f82b', '840deb64'],
  'Indicators/TTW_DarkProjects/AoControlCenter.cs': ['394f12ba', '7010a7a3'],
  'Indicators/TTW_DarkProjects/AlfaOmegaFlowOne.cs': ['0b57ee42', 'd17574ca'],
};
const CONFIG = ['config/accounts.json', 'config/ativos.json', 'state/motor-execucoes.json'].map(r => path.join(ROBO, r));
const aborta = m => { console.error('ABORTADO (nada copiado para o live): ' + m); process.exit(2); };

// ── pre-checagens (somente leitura) ──
if (fs.existsSync(PKG)) aborta('pacote ja existe: ' + PKG);
const itens = Object.entries(LOTE).map(([rel, [stg, liv]]) => ({ rel, src: path.join(SYNC, 'staging', rel), dest: path.join(LIVE, rel), before: path.join(FIX, 'before', rel), stgEsp: stg, livEsp: liv }));
for (const it of itens) {
  it.shaStg = sha(it.src); it.shaLiveBefore = sha(it.dest); it.shaBeforeDir = sha(it.before);
  if (!it.shaStg || !it.shaStg.startsWith(it.stgEsp)) aborta('staging divergente do aprovado: ' + it.rel + ' ' + it.shaStg);
  if (!it.shaLiveBefore || !it.shaLiveBefore.startsWith(it.livEsp) || it.shaLiveBefore !== it.shaBeforeDir) aborta('drift no live: ' + it.rel + ' live=' + it.shaLiveBefore + ' before=' + it.shaBeforeDir);
}
const motor = JSON.parse(fs.readFileSync(path.join(ROBO, 'state/motor-execucoes.json'), 'utf8'));
const pernas = Array.isArray(motor) ? motor : (motor.execucoes || []);
const naoLegadas = pernas.filter(p => p.gestao !== 'MANUAL_ATIVO_RETIRADO');
if (naoLegadas.length) aborta('perna nao-legada no motor-execucoes.json: ' + naoLegadas.map(p => p.instrumento).join(','));
const cfgBefore = CONFIG.map(f => ({ f, sha: sha(f) }));

// ── pacote FINAL (staging -> payload) ──
for (const it of itens) {
  const out = path.join(PKG, 'payload', it.rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(it.src, out);
  if (sha(out) !== it.shaStg) aborta('copia do pacote divergiu: ' + it.rel);
}
fs.writeFileSync(path.join(PKG, 'SHA256_PAYLOAD.txt'), itens.map(i => i.shaStg + '  payload/' + i.rel).join('\n') + '\n');

// ── backup do live + SHA BEFORE ──
for (const it of itens) {
  const b = path.join(INST, 'live-before', it.rel);
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.copyFileSync(it.dest, b);
  if (sha(b) !== it.shaLiveBefore) aborta('backup divergiu: ' + it.rel);
}
fs.writeFileSync(path.join(INST, 'SHA256_BEFORE.txt'), itens.map(i => i.shaLiveBefore + '  ' + i.rel).join('\n') + '\n');

// ── ROLLBACK.ps1 (escrito ANTES da copia) ──
const w = r => r.replace(/\//g, '\\');
const rb = ['# ROLLBACK do deploy account-p1s + E15b (' + ts + '): devolve os 10 .cs do live-before e confere o SHA. Depois: F5 no NT8.',
  "$ErrorActionPreference = 'Stop'", '$B = Join-Path $PSScriptRoot "live-before"', '$L = "C:\\Users\\ADM\\Documents\\NinjaTrader 8\\bin\\Custom"', '$fail = 0',
  ...itens.map(i => `Copy-Item -LiteralPath (Join-Path $B "${w(i.rel)}") -Destination (Join-Path $L "${w(i.rel)}") -Force; if ((Get-FileHash (Join-Path $L "${w(i.rel)}") -Algorithm SHA256).Hash.ToLower() -ne "${i.shaLiveBefore}") { $fail++; "FAIL ${i.rel}" }`),
  'if ($fail -eq 0) { "ROLLBACK OK: 10/10 iguais ao live-before. Fazer F5 no NT8." } else { "ROLLBACK COM FALHA: $fail"; exit 1 }'];
fs.writeFileSync(path.join(INST, 'ROLLBACK.ps1'), rb.join('\r\n') + '\r\n');

// ── copia byte a byte SO do lote + SHA AFTER ──
let fail = 0;
for (const it of itens) {
  fs.copyFileSync(path.join(PKG, 'payload', it.rel), it.dest);
  it.shaAfter = sha(it.dest);
  if (it.shaAfter !== it.shaStg) { fail++; console.log('FAIL destino ' + it.rel); }
}
fs.writeFileSync(path.join(INST, 'SHA256_AFTER.txt'), itens.map(i => i.shaAfter + '  ' + i.rel).join('\n') + '\n');
const cfgAfter = CONFIG.map(f => ({ f, sha: sha(f) }));
const cfgOk = cfgBefore.every((c, i) => c.sha === cfgAfter[i].sha);

const rel = {
  quando: new Date().toISOString(), jev_final4: 'req_01a10dd2dd6d7071a36852c67074230c (A, 0.61)', jev_diff_e15b: 'req_01a10dcaf3d97b8eb8a6a492186230db (A, 0.95)',
  pacote: PKG, backup: path.join(INST, 'live-before'), rollback: path.join(INST, 'ROLLBACK.ps1'),
  arquivos: itens.map(i => ({ rel: i.rel, before: i.shaLiveBefore, after: i.shaAfter, staging: i.shaStg, staging_igual_live: i.shaAfter === i.shaStg })),
  staging_igual_live: (itens.length - fail) + '/' + itens.length, config_intocada: cfgOk, config: cfgAfter.map(c => ({ f: c.f, sha: c.sha })), ordens_enviadas: 0, f5: 'NAO (acao do operador)',
};
fs.writeFileSync(path.join(INST, 'DEPLOY_REPORT.json'), JSON.stringify(rel, null, 2));
fs.writeFileSync(path.join(PKG, 'DEPLOY_REPORT.json'), JSON.stringify(rel, null, 2));
console.log(JSON.stringify({ ok: fail === 0 && cfgOk, staging_igual_live: rel.staging_igual_live, config_intocada: cfgOk, pacote: PKG, install: INST }));
process.exit(fail === 0 && cfgOk ? 0 : 1);
