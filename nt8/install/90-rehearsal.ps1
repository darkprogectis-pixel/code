# INVICTUS JEV CODE — 90 ENSAIO COMPLETO EM SANDBOX (nao escreve no NT8 real).
# Copia (leitura) do bin\Custom real SO o conjunto de backup (csproj, DLL/PDB/XML, .cs compilados) para uma sandbox,
# e roda la: precheck -> backup -> install(WhatIf) -> recusas -> install -> verify PreF5 -> F5 SIMULADO -> verify PostF5
# -> rollback -> prova byte a byte de que a sandbox voltou ao estado original.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nt8\install\90-rehearsal.ps1 -Sandbox <dir vazio fora do NT8>
param([Parameter(Mandatory = $true)][string]$Sandbox)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$realCustom = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'NinjaTrader 8\bin\Custom'
$sb = [IO.Path]::GetFullPath($Sandbox)
if ($sb.StartsWith((Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'NinjaTrader 8'), [StringComparison]::OrdinalIgnoreCase)) { throw 'sandbox nao pode ficar dentro de Documents\NinjaTrader 8' }
if (Test-Path -LiteralPath $sb) { throw "sandbox ja existe: $sb" }

$ud = Join-Path $sb 'NinjaTrader 8'
$custom = Join-Path $ud 'bin\Custom'
New-Item -ItemType Directory -Path $custom -Force | Out-Null
$env:IJC_NT8_CUSTOM = $realCustom
. (Join-Path $here 'Ijc-Nt8Common.ps1')
$set = @(Get-IjcBackupSet)          # conjunto lido do NT8 real (somente leitura)
foreach ($r in $set) {
    $dst = Join-Path $custom $r
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $realCustom $r) -Destination $dst
}
$env:IJC_REHEARSAL = '1'
$env:IJC_NT8_CUSTOM = $custom
$env:IJC_NT8_USERDATA = $ud
$env:IJC_BACKUP_ROOT = Join-Path $sb 'backups'
. (Join-Path $here 'Ijc-Nt8Common.ps1')
$orig = @{}; foreach ($r in $set) { $orig[$r] = Get-IjcSha256 (Join-Path $custom $r) }

$ps = (Get-Process -Id $PID).Path
$steps = @()
function Run([string]$name, [string]$script, [string[]]$a, [int]$expectExit) {
    $out = & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here $script) @a 2>&1 | Out-String
    $code = $LASTEXITCODE
    $script:steps += [pscustomobject]@{ step = $name; exit = $code; expected = $expectExit; ok = ($code -eq $expectExit) }
    if ($code -ne $expectExit) { Write-Host "---- $name (exit $code, esperado $expectExit)"; Write-Host $out }
    return $out
}

Run 'precheck(ForInstall)' '01-precheck.ps1' @('-ForInstall') 0 | Out-Null
$bo = Run 'backup' '02-backup.ps1' @() 0
$id = ([regex]::Match($bo, '"backup_id":\s*"([^"]+)"')).Groups[1].Value
Run 'install -WhatIf' '03-install.ps1' @('-BackupId', $id, '-WhatIf') 0 | Out-Null
Run 'install sem -Confirm => RECUSA' '03-install.ps1' @('-BackupId', $id) 1 | Out-Null
Run 'install backup inexistente => RECUSA' '03-install.ps1' @('-BackupId', 'nao-existe', '-Confirm', 'INSTALL-IJC') 1 | Out-Null
$noTargetYet = -not (Test-Path -LiteralPath $IjcTarget)
Run 'install' '03-install.ps1' @('-BackupId', $id, '-Confirm', 'INSTALL-IJC') 0 | Out-Null
Run 'install repetido => RECUSA (bin\Custom mudou)' '03-install.ps1' @('-BackupId', $id, '-Confirm', 'INSTALL-IJC') 1 | Out-Null
Run 'verify PreF5' '04-verify.ps1' @('-BackupId', $id, '-Stage', 'PreF5') 0 | Out-Null
Run 'verify PostF5 sem F5 => FAIL' '04-verify.ps1' @('-BackupId', $id, '-Stage', 'PostF5') 1 | Out-Null

# F5 SIMULADO: nova DLL contendo os tipos IJC + log de start do AddOn
$dll = Join-Path $custom 'NinjaTrader.Custom.dll'
[IO.File]::AppendAllText($dll, 'IjcAddOn IjcControlCenterWindow IjcExecutor')
foreach ($sat in @($IjcBuildOutputs | Where-Object { $_ -like '*\NinjaTrader.Custom.resources.dll' })) { [IO.File]::AppendAllText((Join-Path $custom $sat), 'F5') }
[IO.File]::AppendAllText($IjcCsproj, "`r`n<!-- F5 simulado: NT8 reescreve o csproj -->`r`n")
$logDir = Join-Path $ud 'invictus-jev-code\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $logDir 'nt8-2026-09.jsonl'), '{"ts":"2026-09-24T00:00:00Z","component":"nt8-addon","event":"addon_start","severity":"info","state":"OFF"}' + "`n")
Run 'verify PostF5' '04-verify.ps1' @('-BackupId', $id, '-Stage', 'PostF5') 0 | Out-Null

Run 'rollback -WhatIf' '05-rollback.ps1' @('-BackupId', $id, '-WhatIf') 0 | Out-Null
Run 'rollback sem -Confirm => RECUSA' '05-rollback.ps1' @('-BackupId', $id) 1 | Out-Null
Run 'rollback' '05-rollback.ps1' @('-BackupId', $id, '-Confirm', 'ROLLBACK-IJC') 0 | Out-Null

$diff = @(); foreach ($r in $set) { $p = Join-Path $custom $r; if (-not (Test-Path -LiteralPath $p) -or (Get-IjcSha256 $p) -ne $orig[$r]) { $diff += $r } }
$now = @(Get-ChildItem -LiteralPath $custom -Recurse -File | ForEach-Object { $_.FullName.Substring($custom.Length + 1) })
$extra = @($now | Where-Object { $set -notcontains $_ })
$exact = ($diff.Count -eq 0) -and ($extra.Count -eq 0) -and $noTargetYet -and -not (Test-Path -LiteralPath $IjcTarget)
$allOk = (@($steps | Where-Object { -not $_.ok }).Count -eq 0) -and $exact
[pscustomobject]@{ step = '90-rehearsal'; verdict = $(if ($allOk) { 'PASS' } else { 'FAIL' }); sandbox = $sb; files_in_set = $set.Count; steps = $steps; rollback_exact = $exact; diff_after_rollback = $diff; extra_after_rollback = $extra } | ConvertTo-Json -Depth 5
if (-not $allOk) { exit 1 }
