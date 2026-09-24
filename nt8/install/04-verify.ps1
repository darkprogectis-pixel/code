# INVICTUS JEV CODE — 04 VERIFICACAO (SOMENTE LEITURA).
# -Stage PreF5 : apos a copia e ANTES do F5. Exige: payload instalado == manifesto, csproj == backup + exatamente as
#                linhas IJC, e nenhum outro arquivo do conjunto de backup alterado (inclusive DLL/PDB/XML).
# -Stage PostF5: apos o F5 unico. Exige: payload intacto, entradas IJC unicas no csproj, .cs de producao intactos,
#                NinjaTrader.Custom.dll recompilado contendo os tipos IJC, e logs IJC sem severidade error.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nt8\install\04-verify.ps1 -BackupId <id> -Stage PreF5|PostF5
param(
    [Parameter(Mandatory = $true)][string]$BackupId,
    [ValidateSet('PreF5', 'PostF5')][string]$Stage = 'PreF5'
)
. (Join-Path $PSScriptRoot 'Ijc-Nt8Common.ps1')

$B = Get-IjcBackup $BackupId
$m = Get-IjcPayload
$fail = @(); $info = [ordered]@{}

# payload instalado
$inst = @()
foreach ($f in $m.files) {
    $p = Join-Path $IjcTarget $f.name
    $ok = (Test-Path -LiteralPath $p) -and ((Get-IjcSha256 $p) -eq $f.sha256)
    $inst += [pscustomobject]@{ file = $f.name; ok = $ok }
    if (-not $ok) { $fail += "payload_instalado:$($f.name)" }
}
$extra = @()
if (Test-Path -LiteralPath $IjcTarget) {
    $names = @($m.files | ForEach-Object { $_.name })
    $extra = @(Get-ChildItem -LiteralPath $IjcTarget -Recurse -File | Where-Object { $names -notcontains $_.Name } | ForEach-Object { $_.FullName.Substring($IjcCustom.Length + 1) })
}
if ($B.Manifest.target_pre_state -eq 'ABSENT' -and $extra.Count) { $fail += 'arquivos_extras_na_pasta_alvo' }
$info.installed = $inst; $info.extra_in_target = $extra

# csproj
$entries = @(Get-IjcCsprojEntries)
$cur = (Get-IjcCsprojLines).Text
foreach ($e in $entries) { if (([regex]::Matches($cur, [regex]::Escape($e.Trim()))).Count -ne 1) { $fail += "csproj_entrada:$($e.Trim())" } }
$bakCs = [IO.File]::ReadAllText((Join-Path $B.Files 'NinjaTrader.Custom.csproj'), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
$stripped = $cur
foreach ($e in $entries) { $stripped = $stripped.Replace($e + "`r`n", '').Replace($e + "`n", '') }
$restIdentical = ($stripped -eq $bakCs)
$info.csproj_rest_identical_to_backup = $restIdentical
if ($Stage -eq 'PreF5' -and -not $restIdentical) { $fail += 'csproj_difere_do_backup_alem_das_linhas_IJC' }

# demais arquivos do conjunto de backup
$diff = @(Compare-IjcLive $B | Where-Object { $_.path -ne 'NinjaTrader.Custom.csproj' -and -not $_.path.StartsWith($IjcTargetRel + '\') })
$outputs = @($diff | Where-Object { $IjcBuildOutputs -contains $_.path })
$sources = @($diff | Where-Object { $IjcBuildOutputs -notcontains $_.path })
$info.changed_build_outputs = $outputs; $info.changed_production_sources = $sources
if ($sources.Count) { $fail += 'fontes_de_producao_alteradas' }
if ($Stage -eq 'PreF5' -and $outputs.Count) { $fail += 'saidas_de_build_alteradas_antes_do_F5 (compilacao ja ocorreu?)' }

if ($Stage -eq 'PostF5') {
    $dll = Join-Path $IjcCustom 'NinjaTrader.Custom.dll'
    $recompiled = @($outputs | Where-Object { $_.path -eq 'NinjaTrader.Custom.dll' }).Count -eq 1
    $bytes = [IO.File]::ReadAllBytes($dll)
    $ascii = [Text.Encoding]::ASCII.GetString($bytes)
    $hasIjc = $ascii.Contains('IjcAddOn') -and $ascii.Contains('IjcControlCenterWindow') -and $ascii.Contains('IjcExecutor')
    $info.custom_dll_recompiled = $recompiled; $info.custom_dll_contains_ijc_types = $hasIjc
    if (-not $recompiled) { $fail += 'NinjaTrader.Custom.dll_nao_recompilado (F5 nao ocorreu ou falhou)' }
    if (-not $hasIjc) { $fail += 'tipos_IJC_ausentes_no_NinjaTrader.Custom.dll' }
    $errs = @(); $starts = 0
    if (Test-Path -LiteralPath $IjcLogDir) {
        foreach ($lf in Get-ChildItem -LiteralPath $IjcLogDir -File -Filter 'nt8-*.jsonl') {
            foreach ($ln in Get-Content -LiteralPath $lf.FullName -Encoding UTF8) {
                if (-not $ln.Trim()) { continue }
                $r = $ln | ConvertFrom-Json
                if ($r.event -eq 'addon_start') { $starts++ }
                if ($r.severity -eq 'error') { $errs += $ln }
            }
        }
    }
    $info.log_dir = $IjcLogDir; $info.addon_start_events = $starts; $info.log_errors = $errs
    if ($errs.Count) { $fail += 'log_IJC_com_severity_error' }
    if ($starts -eq 0) { $info.note = 'addon_start ausente: o NT8 ainda nao carregou o AddOn (abrir/reiniciar e rodar de novo)' }
}

Write-IjcResult ('04-verify-' + $Stage) ($fail.Count -eq 0) ([pscustomobject]@{ backup_id = $BackupId; failed = $fail; info = $info })
