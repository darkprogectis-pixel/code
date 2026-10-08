# Testes offline por familia sobre a arvore sandbox (stock NT8 + import Z30X2): harness da saida, bancada do executor real, harness de API do P-GCAP.
param([Parameter(Mandatory)][string]$Sandbox, [Parameter(Mandatory)][string]$RigDouble, [Parameter(Mandatory)][string]$OfficialBin, [Parameter(Mandatory)][string]$OutDir, [Parameter(Mandatory)][string]$Tmp)
$ErrorActionPreference = 'Continue'
$T = $PSScriptRoot; $W = Split-Path (Split-Path $T); $P = Split-Path $W
$drv = Join-Path $W 'harness\ExitDriver.cs'; $rt = Join-Path $T 'run_exit_tree.ps1'; $h = Join-Path $P 'oliver-main-pgcap-20261007\tools\run_harness_ob.ps1'
foreach ($f in 'F1', 'F2', 'F3', 'F4', 'CANON') {
  $tree = Join-Path $Sandbox ($f + '_clean')
  $a = powershell -NoProfile -ExecutionPolicy Bypass -File $rt -Tree $tree -Driver $drv -OfficialBin $OfficialBin -Out (Join-Path $OutDir "exit_harness_$f.json") -TmpDir $Tmp -Define STAGING | Select-Object -Last 1
  $rig = Join-Path $Sandbox ($f + '_rig_' + [guid]::NewGuid().ToString('N').Substring(0, 6)); Copy-Item $tree $rig -Recurse
  $tc = (Get-ChildItem $rig -Recurse -Filter AoTraderCore.cs | Select-Object -First 1).FullName; Copy-Item $RigDouble $tc -Force
  $pf = (Get-ChildItem $rig -Recurse -Filter AlfaOmegaRoboPositions.cs | Select-Object -First 1).FullName; $p = [IO.File]::ReadAllText($pf)
  $a1 = 'public static bool DryRun = false;'; $a2 = 'if (want.Count == 0) return 0;'
  $p = $p.Replace($a1, $a1 + "`n`t`tpublic static Func<string, AoPositionState> RigHook;").Replace($a2, $a2 + "`n`t`t`tif (RigHook != null) { lock (_gate) { foreach (string a in want) _cache[a] = RigHook(a); _lastRefreshUtc = nowUtc; } return want.Count; }"); [IO.File]::WriteAllText($pf, $p)
  $b = powershell -NoProfile -ExecutionPolicy Bypass -File $rt -Tree $rig -Driver $drv -OfficialBin $OfficialBin -Out (Join-Path $OutDir "exit_bench_$f.json") -TmpDir $Tmp -Define "STAGING,RIG" | Select-Object -Last 1
  $fo = (Get-ChildItem $tree -Recurse -Filter AlfaOmegaRoboFontes.cs | Select-Object -First 1).FullName
  $c = powershell -NoProfile -ExecutionPolicy Bypass -File $h -Source $fo -Driver (Join-Path $P 'global-rth-api-independence-20261007\harness\Driver.cs') -Type HarnessDriver -NT $OfficialBin -Out (Join-Path $OutDir "pgcap_api_$f.json") | Select-Object -Last 1
  "$f | harness: $a | bancada: $b | api: $c | api_hash=" + (Get-FileHash (Join-Path $OutDir "pgcap_api_$f.json")).Hash.Substring(0, 12)
}
