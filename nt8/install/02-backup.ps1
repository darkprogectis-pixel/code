# INVICTUS JEV CODE — 02 BACKUP + MANIFESTO SHA256 PRE-INSTALACAO.
# Le bin\Custom (somente leitura) e grava a copia em %LOCALAPPDATA%\InvictusJevCode\install-backups\<id>\ (fora do NT8).
# Conjunto salvo: NinjaTrader.Custom.csproj, NinjaTrader.Custom.dll/.pdb/.xml, todos os .cs compilados, e a pasta
# AddOns\InvictusJevCode (se existir). Cada copia e re-hasheada; backup so e VERIFIED se 100% dos hashes batem.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nt8\install\02-backup.ps1
. (Join-Path $PSScriptRoot 'Ijc-Nt8Common.ps1')

$id = (Get-Date).ToString('yyyyMMdd-HHmmss')
$dir = Join-Path $IjcBackupRoot $id
$files = Join-Path $dir 'files'
New-Item -ItemType Directory -Path $files -Force | Out-Null

$rel = @(Get-IjcBackupSet)
$pre = @(New-IjcManifestEntries $IjcCustom $rel)
foreach ($e in $pre) {
    $dst = Join-Path $files $e.path
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $IjcCustom $e.path) -Destination $dst -Force
}
$mismatch = @()
foreach ($e in $pre) { if ((Get-IjcSha256 (Join-Path $files $e.path)) -ne $e.sha256) { $mismatch += $e.path } }

$targetState = $(if (Test-Path -LiteralPath $IjcTarget) { 'PRESENT' } else { 'ABSENT' })
$manifest = [pscustomobject]@{
    schema          = 'ijc-nt8-backup/v1'
    backup_id       = $id
    created_utc     = (Get-Date).ToUniversalTime().ToString('o')
    custom_dir      = $IjcCustom
    target_rel      = $IjcTargetRel
    target_pre_state = $targetState          # ABSENT => rollback remove (para quarentena) a pasta inteira
    nt8_running_at_backup = (Test-IjcNt8Running)
    file_count      = $pre.Count
    verified        = ($mismatch.Count -eq 0)
    mismatched      = $mismatch
    files           = $pre
}
Write-IjcJson $manifest (Join-Path $dir 'pre-manifest.json')
Write-IjcResult '02-backup' ($mismatch.Count -eq 0) ([pscustomobject]@{ backup_id = $id; backup_dir = $dir; files = $pre.Count; target_pre_state = $targetState; verified = ($mismatch.Count -eq 0) })
