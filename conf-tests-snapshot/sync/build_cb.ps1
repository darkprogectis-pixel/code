# build_cb.ps1 = copia do build_sync.ps1 + troca do Bridge (fix CopilotBadge 2026-10-06)
# SYNC TOTAL 2026-10-01 — compila o assembly completo do robo (mesmo conjunto do build_estrutural.ps1 da sessao a8aedde2)
# com os arquivos do STAGING no lugar dos de bin\Custom + AlfaOmegaRoboEventoAot.cs (novo). Nada em bin\Custom e alterado.
# Mesmo harness de sempre (check_ids.ps1). Uso: .\build_sync.ps1      Baseline (estrutural): erros=0, avisos 2182 (CS0436 do harness).
$ErrorActionPreference = 'Stop'
$H = "C:/Users/ADM/Desktop/Handof TTW/HANDOFF/conf-tests"
$C = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"
$STG = "C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\sync\staging\AddOns"
# (2026-10-02) P1S Press: overlay tambem de staging\Indicators\TTW_DarkProjects + AoPressSessao.cs (novo) e AlfaOmegaFlowOne.cs no conjunto.
$STGI = "C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\sync\staging\Indicators\TTW_DarkProjects"
$files = @(
  "$C\AddOns\AlfaOmegaRobo.cs", "$C\AddOns\AlfaOmegaRoboMotor.cs", "$C\AddOns\AlfaOmegaRoboStack.cs", "$C\AddOns\AlfaOmegaRoboPermissao.cs",
  "$C\AddOns\AlfaOmegaRoboTurno.cs", "$C\AddOns\AlfaOmegaRoboSaida.cs", "$C/AddOns/AlfaOmegaRoboFechamento.cs", "$C\AddOns\AlfaOmegaRoboFontes.cs", "$C\AddOns\AoJsonNum.cs", "$C\AddOns\AlfaOmegaRoboProtecao.cs", "$C\AddOns\AlfaOmegaRoboHistorico.cs", "$C\AddOns\AlfaOmegaBridge.cs",
  "$C\Indicators\TTW_DarkProjects\AoMarcadores.cs", "$C\Indicators\TTW_DarkProjects\AoTapeEngine.cs", "$C\Indicators\TTW_DarkProjects\AoMarketDataPublisher.cs",
  "$C\Indicators\TTW_DarkProjects\AoLicenca.cs", "$C\Indicators\TTW_DarkProjects\AoLicencaUi.cs", "$C\AddOns\AO_HistoryClient.cs", "$C\AddOns\AO_HistoryWindow.cs",
  "$C\AddOns\AlfaOmegaRoboAudit.cs", "$C\AddOns\AlfaOmegaRoboConfig.cs", "$C\AddOns\AlfaOmegaRoboGates.cs",
  "$C\AddOns\AlfaOmegaRoboEntry.cs", "$C\AddOns\AlfaOmegaRoboEntryMq.cs", "$C\AddOns\AlfaOmegaRoboAot.cs",
  "$C\AddOns\AlfaOmegaRoboConfluencia.cs", "$C\AddOns\AlfaOmegaRoboOperacional.cs", "$C\AddOns\AlfaOmegaRoboAtivos.cs",
  "$C\AddOns\AlfaOmegaCopyMaster.cs", "$C\AddOns\AlfaOmegaRoboRelay.cs", "$C\AddOns\AlfaOmegaRoboDedup.cs",
  "$C\AddOns\AlfaOmegaRoboPositions.cs", "$C\AddOns\AlfaOmegaRoboLedger.cs", "$C\AddOns\AoRoboGuard.cs",
  "$C\AddOns\AlfaOmegaRoboOrderWatch.cs", "$C\AddOns\AlfaOmegaRoboOrderState.cs",
  "$C\AddOns\AlfaOmegaTrader.cs", "$C\AddOns\AoTraderCore.cs",
  "$C\AddOns\AlfaOmegaCopyEngineMotor.cs", "$C\AddOns\AlfaOmegaCopyEngineCore.cs", "$C\AddOns\AlfaOmegaCopyEngineNet.cs",
  "$C\AddOns\AlfaOmegaCopyEngineStagger.cs", "$C\AddOns\AlfaOmegaCopyEngineUI.cs", "$C\AddOns\AlfaOmegaCopyEngineContas.cs", "$C\Indicators\TTW_DarkProjects\AoAccountNames.cs", "$C\AddOns\AoXGate.cs",
  "$C\Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs", "$C\Indicators\TTW_DarkProjects\AoControlCenter.cs",
  "$C\Indicators\TTW_DarkProjects\AoSkin.cs", "$C\Indicators\TTW_DarkProjects\AoTheme.cs", "$C\Indicators\TTW_DarkProjects\AoInput.cs"
)
if ($args -notcontains '-baseline') {
  $files = @($files | ForEach-Object { $n = [IO.Path]::GetFileName($_); $p = Join-Path $STG $n; $q = Join-Path $STGI $n; if (Test-Path $p) { $p } elseif (Test-Path $q) { $q } else { $_ } }) + @((Join-Path $STG "AlfaOmegaRoboEventoAot.cs"), (Join-Path $STGI "AoPressSessao.cs"), (Join-Path $STGI "AlfaOmegaFlowOne.cs"))
}
# (2026-10-06) build_cb: conjunto LIVE (-baseline) com SO o AlfaOmegaBridge.cs trocado por $env:CB_BRIDGE (staging do fix CopilotBadge).
if ($env:CB_BRIDGE) { $files = @($files | ForEach-Object { if ($_ -like "*AlfaOmegaBridge.cs") { $env:CB_BRIDGE } else { $_ } }); "bridge: " + $env:CB_BRIDGE }
$files | Where-Object { $_ -like "$STG*" -or $_ -like "$STGI*" } | ForEach-Object { "staging: " + $_ }
$missing = @($files | Where-Object { -not (Test-Path $_) })
if ($missing.Count -gt 0) { "FALTAM:"; $missing; exit 2 }
# (2026-10-02) exit != 0 com erro de compilacao ou tipo de aviso fora do baseline (antes so imprimia).
# Baseline medido com o build_sync anterior (build_sync.ps1.bak-press-20261002): erros=0, IDs = CS0436 (harness) + CS0649 (AoXGate.cs live).
# check_ids_sync.ps1 = check_ids.ps1 + System.Net.Http.dll (o FlowOne entra no conjunto).
$saida = @(& (Join-Path $PSScriptRoot "check_ids_sync.ps1") @files 2>&1 | ForEach-Object { "$_" })
$saida
$linha = $saida | Where-Object { $_ -match '^RESULTADO: erros=\d+' } | Select-Object -First 1
if (-not $linha) { "BUILD_SYNC: FAIL (sem linha RESULTADO)"; exit 3 }
$nErr = [int]([regex]::Match($linha, 'erros=(\d+)').Groups[1].Value)
$idsNovos = @($saida | ForEach-Object { [regex]::Match($_, '^  (CS\d+) x\d+') } | Where-Object { $_.Success } | ForEach-Object { $_.Groups[1].Value } | Where-Object { @('CS0436', 'CS0649') -notcontains $_ })
if ($nErr -gt 0) { "BUILD_SYNC: FAIL (erros=$nErr)"; exit 1 }
if ($idsNovos.Count -gt 0) { "BUILD_SYNC: FAIL (tipo de aviso novo fora do baseline CS0436/CS0649: " + ($idsNovos -join ',') + ")"; exit 1 }
"BUILD_SYNC: PASS"
