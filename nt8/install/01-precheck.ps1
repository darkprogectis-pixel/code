# INVICTUS JEV CODE — 01 PRE-CHECK (SOMENTE LEITURA). Nao escreve nada em lugar nenhum.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nt8\install\01-precheck.ps1 [-ForInstall]
# -ForInstall: exige tambem NinjaTrader FECHADO (condicao da copia e do rollback).
param([switch]$ForInstall)
. (Join-Path $PSScriptRoot 'Ijc-Nt8Common.ps1')

$checks = [ordered]@{}
$fail = @()
function Add-Check([string]$k, [bool]$ok, $v) { $checks[$k] = [pscustomobject]@{ ok = $ok; value = $v }; if (-not $ok) { $script:fail += $k } }

Add-Check 'custom_dir_exists' (Test-Path -LiteralPath $IjcCustom) $IjcCustom
Add-Check 'csproj_exists' (Test-Path -LiteralPath $IjcCsproj) $IjcCsproj
Add-Check 'custom_dll_exists' (Test-Path -LiteralPath (Join-Path $IjcCustom 'NinjaTrader.Custom.dll')) 'NinjaTrader.Custom.dll'

# alvo: ABSENT e o estado esperado na primeira instalacao; PRESENT e inventariado (e sera salvo pelo backup)
$targetState = 'ABSENT'; $targetInv = @()
if (Test-Path -LiteralPath $IjcTarget) {
    $targetState = 'PRESENT'
    $targetInv = @(Get-ChildItem -LiteralPath $IjcTarget -Recurse -File | ForEach-Object { [pscustomobject]@{ path = $_.FullName.Substring($IjcCustom.Length + 1); sha256 = (Get-IjcSha256 $_.FullName) } })
}
Add-Check 'target_folder' $true ([pscustomobject]@{ path = $IjcTarget; state = $targetState; files = $targetInv })

# csproj: entradas IJC ja presentes? (primeira instalacao: 0)
$csText = (Get-IjcCsprojLines).Text
$ijcEntries = @([regex]::Matches($csText, '<Compile Include="AddOns\\InvictusJevCode\\[^"]+"') | ForEach-Object { $_.Value })
Add-Check 'csproj_ijc_entries' $true ([pscustomobject]@{ count = $ijcEntries.Count; entries = $ijcEntries })

# AddOn preliminar antigo (JevControlCenter.cs) nao pode existir em bin\Custom
$old = @(Get-ChildItem -LiteralPath $IjcCustom -Recurse -File -Filter 'JevControlCenter*.cs' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
Add-Check 'old_jev_addon_absent' ($old.Count -eq 0) $old

# colisao de nome: namespace/tipos IJC em .cs de producao (fora da pasta alvo)
$prodHits = @()
foreach ($c in Get-IjcCompileItems) {
    if ($c.StartsWith($IjcTargetRel + '\')) { continue }
    $p = Join-Path $IjcCustom $c
    if ((Test-Path -LiteralPath $p) -and (Select-String -LiteralPath $p -Pattern 'InvictusJevCode|\bIjc[A-Z]\w*' -Quiet)) { $prodHits += $c }
}
Add-Check 'no_ijc_names_in_production' ($prodHits.Count -eq 0) $prodHits

# payload do repositorio == manifesto (hash) e sem API de ordem
$m = Get-IjcPayload
$bad = @(); $orderHits = @()
foreach ($f in $m.files) {
    $p = Join-Path $IjcPayloadDir $f.name
    if (-not (Test-Path -LiteralPath $p) -or (Get-IjcSha256 $p) -ne $f.sha256) { $bad += $f.name; continue }
    foreach ($pat in $IjcForbidden) { $hit = Select-String -LiteralPath $p -Pattern $pat; if ($hit) { $orderHits += ($f.name + ':' + $hit[0].LineNumber) } }
}
$extra = @(Get-ChildItem -LiteralPath $IjcPayloadDir -File -Filter '*.cs' | Where-Object { (@($m.files | ForEach-Object { $_.name }) -notcontains $_.Name) -and (@($m.deferred_not_installed) -notcontains $_.Name) } | ForEach-Object { $_.Name })
Add-Check 'payload_hash_match' (($bad.Count -eq 0) -and ($extra.Count -eq 0)) ([pscustomobject]@{ mismatched = $bad; not_in_manifest = $extra; files = $m.files.Count; deferred_not_installed = @($m.deferred_not_installed) })
Add-Check 'payload_no_order_api' ($orderHits.Count -eq 0) $orderHits
$pure = Get-Content -LiteralPath (Join-Path $IjcPayloadDir 'IjcPure.cs') -Raw
Add-Check 'jev_can_send_order_false' ($pure -match 'public const bool JEV_CAN_SEND_ORDER = false;') 'IjcSafety.JEV_CAN_SEND_ORDER'
Add-Check 'order_path_hard_disabled' ($pure -match 'public const string ORDER_PATH = "HARD_DISABLED";') 'IjcSafety.ORDER_PATH'
Add-Check 'sim_playback_only' (($pure -match '"Simulator", StringComparison\.Ordinal') -and ($pure -match '"Playback", StringComparison\.Ordinal')) 'IjcGuard.IsEligibleProvider'

$running = Test-IjcNt8Running
Add-Check 'nt8_process' ((-not $ForInstall) -or (-not $running)) ([pscustomobject]@{ running = $running; required_closed = [bool]$ForInstall })

$drive = (Get-Item -LiteralPath $IjcCustom).PSDrive
Add-Check 'free_disk_gt_1GB' ($drive.Free -gt 1GB) ([math]::Round($drive.Free / 1GB, 1))

Write-IjcResult '01-precheck' ($fail.Count -eq 0) ([pscustomobject]@{ failed = $fail; checks = $checks })
