# INVICTUS JEV CODE — 05 ROLLBACK INTEGRAL para o estado exato do backup.
# NinjaTrader FECHADO (a DLL em uso nao pode ser substituida). Nada e apagado: tudo que sai de bin\Custom vai para
# <backup>\quarantine-<ts>\ (pasta IJC criada pela instalacao, versoes pos-F5 de csproj/DLL/PDB/XML, extras).
# Depois restaura cada arquivo do pre-manifesto a partir do backup e verifica 100% dos SHA256.
# Nao toca bin\Custom\obj (intermediarios do build; nao carregados pelo NT8) nem os logs IJC em UserDataDir.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nt8\install\05-rollback.ps1 -BackupId <id> -Confirm ROLLBACK-IJC [-WhatIf]
param(
    [Parameter(Mandatory = $true)][string]$BackupId,
    [string]$Confirm = '',
    [switch]$WhatIf
)
. (Join-Path $PSScriptRoot 'Ijc-Nt8Common.ps1')

$B = Get-IjcBackup $BackupId
$refuse = @()
if (Test-IjcNt8Running) { $refuse += 'NinjaTrader esta ABERTO: feche o NT8 antes do rollback' }
$bi = @(Test-IjcBackupIntact $B); if ($bi.Count) { $refuse += ('backup corrompido, rollback abortado: ' + ($bi -join ', ')) }
if (-not $WhatIf -and $Confirm -ne 'ROLLBACK-IJC') { $refuse += 'falta -Confirm ROLLBACK-IJC' }

$preRel = @($B.Manifest.files | ForEach-Object { $_.path })
$plan = @()
if (Test-Path -LiteralPath $IjcTarget) {
    if ($B.Manifest.target_pre_state -eq 'ABSENT') { $plan += "QUARANTINE pasta $IjcTargetRel (nao existia antes)" }
    else {
        Get-ChildItem -LiteralPath $IjcTarget -Recurse -File | ForEach-Object {
            $r = $_.FullName.Substring($IjcCustom.Length + 1); if ($preRel -notcontains $r) { $plan += "QUARANTINE $r (extra)" }
        }
    }
}
foreach ($o in $IjcBuildOutputs) { if (($preRel -notcontains $o) -and (Test-Path -LiteralPath (Join-Path $IjcCustom $o))) { $plan += "QUARANTINE $o (nao existia antes)" } }
foreach ($d in @(Compare-IjcLive $B)) { $plan += "RESTORE $($d.path) ($($d.state))" }

if ($refuse.Count) { Write-IjcResult '05-rollback' $false ([pscustomobject]@{ refused = $refuse; plan = $plan }) }
if ($WhatIf) { Write-IjcResult '05-rollback(WhatIf)' $true ([pscustomobject]@{ plan = $plan }); exit 0 }

$q = Join-Path $B.Dir ('quarantine-' + (Get-Date).ToString('yyyyMMdd-HHmmss'))
function Move-ToQuarantine([string]$rel) {
    $src = Join-Path $IjcCustom $rel
    $dst = Join-Path $q $rel
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
    Move-Item -LiteralPath $src -Destination $dst -Force
}
$done = @()
if (Test-Path -LiteralPath $IjcTarget) {
    if ($B.Manifest.target_pre_state -eq 'ABSENT') { Move-ToQuarantine $IjcTargetRel; $done += "quarantined $IjcTargetRel" }
    else {
        Get-ChildItem -LiteralPath $IjcTarget -Recurse -File | ForEach-Object {
            $r = $_.FullName.Substring($IjcCustom.Length + 1); if ($preRel -notcontains $r) { Move-ToQuarantine $r; $done += "quarantined $r" }
        }
    }
}
foreach ($o in $IjcBuildOutputs) { if (($preRel -notcontains $o) -and (Test-Path -LiteralPath (Join-Path $IjcCustom $o))) { Move-ToQuarantine $o; $done += "quarantined $o" } }
foreach ($d in @(Compare-IjcLive $B)) {
    if ($d.state -eq 'CHANGED') { Move-ToQuarantine $d.path }
    $dst = Join-Path $IjcCustom $d.path
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $B.Files $d.path) -Destination $dst -Force
    $done += "restored $($d.path)"
}

$remaining = @(Compare-IjcLive $B)
$targetOk = ($B.Manifest.target_pre_state -eq 'PRESENT') -or -not (Test-Path -LiteralPath $IjcTarget)
$ok = ($remaining.Count -eq 0) -and $targetOk
$rec = [pscustomobject]@{ schema = 'ijc-nt8-rollback/v1'; backup_id = $BackupId; at_utc = (Get-Date).ToUniversalTime().ToString('o'); quarantine = $q; actions = $done; remaining_diff = $remaining; target_state_restored = $targetOk; verified = $ok }
Write-IjcJson $rec (Join-Path $B.Dir ('rollback-record-' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.json'))
Write-IjcResult '05-rollback' $ok $rec
