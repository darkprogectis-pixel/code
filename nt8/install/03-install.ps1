# INVICTUS JEV CODE — 03 COPIA CONTROLADA para bin\Custom\AddOns\InvictusJevCode + 4 linhas <Compile> no csproj.
# SO EXECUTAR COM ORDEM EXPLICITA DO OPERADOR. NAO faz F5, NAO abre/reinicia o NT8.
# Pre-condicoes (todas obrigatorias, senao recusa sem escrever nada):
#   - NinjaTrader FECHADO (o NT8 observa bin\Custom; copiar com ele aberto pode disparar compilacao fora do F5 unico);
#   - backup VERIFIED (02-backup.ps1) cujo manifesto ainda bate com o estado atual de bin\Custom;
#   - payload do repositorio == ijc-payload-manifest.json;
#   - pasta alvo ausente (ou -ReplaceExisting, com a pasta anterior ja inventariada no backup).
# Qualquer falha apos a primeira escrita dispara 05-rollback.ps1 automaticamente.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nt8\install\03-install.ps1 -BackupId <id> -Confirm INSTALL-IJC [-WhatIf]
param(
    [Parameter(Mandatory = $true)][string]$BackupId,
    [string]$Confirm = '',
    [switch]$ReplaceExisting,
    [switch]$WhatIf
)
. (Join-Path $PSScriptRoot 'Ijc-Nt8Common.ps1')

$plan = @()
$refuse = @()
if (Test-IjcNt8Running) { $refuse += 'NinjaTrader esta ABERTO: feche o NT8 antes da copia' }
$B = $null
try { $B = Get-IjcBackup $BackupId } catch { $refuse += $_.Exception.Message }
if ($B) {
    $bi = @(Test-IjcBackupIntact $B); if ($bi.Count) { $refuse += ('backup corrompido: ' + ($bi -join ', ')) }
    $lv = @(Compare-IjcLive $B); if ($lv.Count) { $refuse += ('bin\Custom mudou desde o backup (refaca 02-backup): ' + (($lv | ForEach-Object { $_.path + '=' + $_.state }) -join ', ')) }
}
$m = Get-IjcPayload
foreach ($f in $m.files) {
    $p = Join-Path $IjcPayloadDir $f.name
    if (-not (Test-Path -LiteralPath $p) -or (Get-IjcSha256 $p) -ne $f.sha256) { $refuse += "payload difere do manifesto: $($f.name)" }
    foreach ($pat in $IjcForbidden) { if (Select-String -LiteralPath $p -Pattern $pat -Quiet) { $refuse += "payload contem API de ordem ($pat): $($f.name)" } }
}
if ((Test-Path -LiteralPath $IjcTarget) -and -not $ReplaceExisting) { $refuse += "pasta alvo ja existe: $IjcTarget (use -ReplaceExisting apos inventario)" }
$cs = Get-IjcCsprojLines
$entries = @(Get-IjcCsprojEntries)
$present = @($entries | Where-Object { $cs.Text.Contains($_.Trim()) })
if ($present.Count -ne 0 -and $present.Count -ne $entries.Count) { $refuse += 'csproj com entradas IJC PARCIAIS: estado inconsistente, revisar manualmente' }
if (-not $WhatIf -and $Confirm -ne 'INSTALL-IJC') { $refuse += 'falta -Confirm INSTALL-IJC (ordem explicita do operador)' }

foreach ($f in $m.files) { $plan += "COPY $($f.name) -> $IjcTargetRel\$($f.name) (sha256 $($f.sha256))" }
if ($present.Count -eq 0) { $plan += "CSPROJ +$($entries.Count) linhas <Compile Include=`"$IjcTargetRel\...`"> apos o ultimo <Compile> (BOM=$($cs.Bom), EOL preservado)" } else { $plan += 'CSPROJ entradas IJC ja presentes: sem alteracao' }

if ($refuse.Count) { Write-IjcResult '03-install' $false ([pscustomobject]@{ refused = $refuse; plan = $plan; written = 0 }) }
if ($WhatIf) { Write-IjcResult '03-install(WhatIf)' $true ([pscustomobject]@{ plan = $plan; written = 0 }); exit 0 }

$written = @()
try {
    New-Item -ItemType Directory -Path $IjcTarget -Force | Out-Null
    foreach ($f in $m.files) {
        $dst = Join-Path $IjcTarget $f.name
        Copy-Item -LiteralPath (Join-Path $IjcPayloadDir $f.name) -Destination $dst -Force
        $written += "$IjcTargetRel\$($f.name)"
        if ((Get-IjcSha256 $dst) -ne $f.sha256) { throw "hash pos-copia divergente: $($f.name)" }
    }
    if ($present.Count -eq 0) {
        $eol = $cs.Eol
        $lines = [regex]::Split($cs.Text, '\r?\n')
        $last = -1
        for ($i = 0; $i -lt $lines.Length; $i++) { if ($lines[$i] -match '^\s*<Compile Include=') { $last = $i } }
        if ($last -lt 0) { throw 'csproj sem <Compile Include>: layout inesperado' }
        $new = @($lines[0..$last]) + $entries + @($lines[($last + 1)..($lines.Length - 1)])
        $text = ($new -join $eol)
        $null = [xml]$text   # tem que continuar XML valido
        $enc = New-Object Text.UTF8Encoding($cs.Bom)
        [IO.File]::WriteAllText($IjcCsproj, $text, $enc)
        $written += 'NinjaTrader.Custom.csproj'
        $after = (Get-IjcCsprojLines).Text
        foreach ($e in $entries) { if (([regex]::Matches($after, [regex]::Escape($e.Trim()))).Count -ne 1) { throw "entrada csproj nao unica: $e" } }
    }
} catch {
    $err = $_.Exception.Message
    & (Join-Path $PSScriptRoot '05-rollback.ps1') -BackupId $BackupId -Confirm 'ROLLBACK-IJC' | Out-Host
    Write-IjcResult '03-install' $false ([pscustomobject]@{ error = $err; written = $written; auto_rollback = 'EXECUTED' })
}

$rec = [pscustomobject]@{ schema = 'ijc-nt8-install/v1'; backup_id = $BackupId; installed_utc = (Get-Date).ToUniversalTime().ToString('o'); payload_manifest_sha256 = (Get-IjcSha256 $IjcManifest); written = $written; csproj_entries = $entries; f5 = 'NOT_PERFORMED_BY_SCRIPT' }
Write-IjcJson $rec (Join-Path $B.Dir 'install-record.json')
Write-IjcResult '03-install' $true ([pscustomobject]@{ written = $written; next = "04-verify.ps1 -BackupId $BackupId -Stage PreF5" })
