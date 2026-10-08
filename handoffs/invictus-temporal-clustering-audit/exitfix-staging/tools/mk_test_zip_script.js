// Deriva build_exitfix_test_zips.ps1 do build_z30_zips.ps1 (mesma mecanica de zip/roundtrip), trocando arquivos, pastas e nomes.
const fs = require('fs'), path = require('path');
let s = fs.readFileSync(path.join(__dirname, 'build_z30_zips.ps1'), 'utf8');
const R = [
 [/^# OLIVER FORCA_JANELA_30[^\n]*\n# \+ zip de IMPORT[^\n]*\n/, "# EXIT_LAYER_FIX X2 - zip de TESTE (NAO OFICIAL; JEV DIFF T1 = B, pacote OLIVER nao gerado) + rollback.\n# Preparado por decisao JEV DIFF T2 (req_01a11c9547347b71a7a90e58c67dc8fd), SEM importar. NAO escreve no NT8 (so le os 3 instalados para o backup).\n"],
 [/^\$files = [^\n]*/m, "$files = @('AddOns\\AlfaOmegaRobo.cs', 'AddOns\\AlfaOmegaRoboFechamento.cs', 'AddOns\\AlfaOmegaRoboSaida.cs')"],
 ["'staging\\after'", "'staging_exit\\after'"], ["'staging\\before'", "'staging_exit\\before'"],
 ['"backup\\$ts"', '"backup_exit_test\\$ts"'], ["Join-Path $W 'build'", "Join-Path $W 'build_test'"],
 ['AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_import.zip', 'AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_import.zip'],
 ['AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_ROLLBACK_import.zip', 'AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_ROLLBACK_import.zip'],
 ['tests\\BUILD_Z30_ZIPS.json', 'tests\\BUILD_EXITFIX_TEST_ZIPS.json'],
];
for (const [a, b] of R) { const n = typeof a === 'string' ? s.split(a).length - 1 : (a.test(s) ? 1 : 0); if (n !== 1) { console.log('ANCHOR x' + n + ' ' + a); process.exit(1); } s = s.replace(a, () => b); }
fs.writeFileSync(path.join(__dirname, 'build_exitfix_test_zips.ps1'), s); console.log('ok');
