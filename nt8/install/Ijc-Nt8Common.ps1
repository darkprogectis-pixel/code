# INVICTUS JEV CODE — funcoes comuns da instalacao controlada no NT8 (dot-source; Windows PowerShell 5.1).
# Nenhuma funcao aqui escreve em bin\Custom; escrita so ocorre em 03-install.ps1 / 05-rollback.ps1.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:IjcRepo       = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:IjcPayloadDir = Join-Path $IjcRepo 'nt8\AddOns\InvictusJevCode'
$script:IjcManifest   = Join-Path $PSScriptRoot 'ijc-payload-manifest.json'
# Overrides por ambiente SO para ensaio em copia descartavel (rehearsal); em uso real ficam vazios.
$script:IjcUserData   = $(if ($env:IJC_NT8_USERDATA) { $env:IJC_NT8_USERDATA } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'NinjaTrader 8' })
$script:IjcCustom     = $(if ($env:IJC_NT8_CUSTOM) { $env:IJC_NT8_CUSTOM } else { Join-Path $IjcUserData 'bin\Custom' })
$script:IjcCsproj     = Join-Path $IjcCustom 'NinjaTrader.Custom.csproj'
$script:IjcTargetRel  = 'AddOns\InvictusJevCode'
$script:IjcTarget     = Join-Path $IjcCustom $IjcTargetRel
$script:IjcBackupRoot = $(if ($env:IJC_BACKUP_ROOT) { $env:IJC_BACKUP_ROOT } else { Join-Path $env:LOCALAPPDATA 'InvictusJevCode\install-backups' })   # FORA de bin\Custom: nunca compilado
$script:IjcLogDir     = Join-Path $IjcUserData 'invictus-jev-code\logs'   # IjcRuntime.DataDir()\logs
# saidas do F5: DLL/PDB/XML na raiz de Custom + um assembly satelite por Resource.<cultura>.resx
# (observado no F5 de 22/09 18:21-18:22: exatamente estes 11 arquivos + o proprio csproj, reescrito pelo NT8)
$script:IjcBuildOutputs = @('NinjaTrader.Custom.dll', 'NinjaTrader.Custom.pdb', 'NinjaTrader.Custom.xml')
if (Test-Path -LiteralPath $IjcCustom) {
    foreach ($rx in Get-ChildItem -LiteralPath $IjcCustom -File -Filter 'Resource.*.resx') {
        $IjcBuildOutputs += ($rx.Name -replace '^Resource\.(.+)\.resx$', '$1') + '\NinjaTrader.Custom.resources.dll'
    }
    foreach ($d in Get-ChildItem -LiteralPath $IjcCustom -Directory) {   # satelites ja existentes (uniao com os .resx)
        if (Test-Path -LiteralPath (Join-Path $d.FullName 'NinjaTrader.Custom.resources.dll')) { $IjcBuildOutputs += $d.Name + '\NinjaTrader.Custom.resources.dll' }
    }
    $IjcBuildOutputs = @($IjcBuildOutputs | Select-Object -Unique)
}
# padroes proibidos no payload (API de ordens do NT8). O Robot segue HARD_DISABLED (binding isolado).
$script:IjcForbidden = @('\.Submit\s*\(', '\bCreateOrder\s*\(', '\.Cancel\s*\(\s*[^)\s]','\.CancelAllOrders\s*\(', '\.Change\s*\(', '\.Flatten\s*\(', '\bEnterLong\w*\s*\(', '\bEnterShort\w*\s*\(', '\bExitLong\w*\s*\(', '\bExitShort\w*\s*\(', '\bSubmitOrder\w*\s*\(')
# UNICA excecao: o caminho MANUAL do operador (clique -> conta selecionada) em IjcManualOrders.cs pode ter
# CreateOrder/Submit, no maximo 1 chamada de cada em codigo (linhas de comentario // documentam a API e nao contam).
# Cancel/Change/Flatten/Enter*/Exit* continuam proibidos em TODOS os arquivos, inclusive o manual.
$script:IjcManualOrderFile = 'IjcManualOrders.cs'
$script:IjcManualAllowed   = @{ '\.Submit\s*\(' = 1; '\bCreateOrder\s*\(' = 1 }

function Get-IjcOrderApiViolations([string]$Name, [string]$Path) {
    # devolve as violacoes "<arquivo>:<linha>:<padrao>"; vazio => arquivo aceito
    $out = @()
    foreach ($pat in $IjcForbidden) {
        $hits = @(Select-String -LiteralPath $Path -Pattern $pat)
        if (-not $hits.Count) { continue }
        if ($Name -ceq $IjcManualOrderFile -and $IjcManualAllowed.ContainsKey($pat)) {
            $code = @($hits | Where-Object { -not $_.Line.TrimStart().StartsWith('//') })
            if ($code.Count -le $IjcManualAllowed[$pat]) { continue }
            $hits = $code
        }
        foreach ($h in $hits) { $out += ($Name + ':' + $h.LineNumber + ':' + $pat) }
    }
    return $out
}

function Get-IjcSha256([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

function Get-IjcPayload {
    $m = Get-Content -LiteralPath $IjcManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    return $m
}

function Test-IjcNt8Running {
    # ensaio (90-rehearsal.ps1): sandbox fora do NT8 real => o processo NT8 aberto nao importa
    $real = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'NinjaTrader 8\bin\Custom'
    if ($env:IJC_REHEARSAL -eq '1' -and $env:IJC_NT8_CUSTOM -and ((Resolve-Path -LiteralPath $env:IJC_NT8_CUSTOM).Path -ne (Resolve-Path -LiteralPath $real).Path)) { return $false }
    return [bool](Get-Process -Name 'NinjaTrader' -ErrorAction SilentlyContinue)
}

function Get-IjcCompileItems {
    # caminhos relativos listados como <Compile Include> no csproj real
    [xml]$x = Get-Content -LiteralPath $IjcCsproj -Raw -Encoding UTF8
    $items = @()
    foreach ($n in $x.SelectNodes('//*[local-name()="Compile"]')) {
        $inc = $n.GetAttribute('Include')
        if ($inc) { $items += [Uri]::UnescapeDataString($inc) }
    }
    return $items
}

function Get-IjcBackupSet {
    # conjunto EXATO que o rollback restaura: csproj + saidas do F5 + todo .cs compilado + pasta alvo (se existir)
    $rel = New-Object System.Collections.Generic.List[string]
    $rel.Add('NinjaTrader.Custom.csproj')
    foreach ($o in $IjcBuildOutputs) { if (Test-Path -LiteralPath (Join-Path $IjcCustom $o)) { $rel.Add($o) } }
    foreach ($c in Get-IjcCompileItems) { if (Test-Path -LiteralPath (Join-Path $IjcCustom $c)) { $rel.Add($c) } }
    if (Test-Path -LiteralPath $IjcTarget) {
        Get-ChildItem -LiteralPath $IjcTarget -Recurse -File | ForEach-Object { $rel.Add($_.FullName.Substring($IjcCustom.Length + 1)) }
    }
    return ($rel | Select-Object -Unique)
}

function New-IjcManifestEntries([string]$Root, [string[]]$Rel) {
    $out = @()
    foreach ($r in $Rel) {
        $p = Join-Path $Root $r
        $fi = Get-Item -LiteralPath $p
        $out += [pscustomobject]@{ path = $r; size = $fi.Length; sha256 = (Get-IjcSha256 $p); mtime_utc = $fi.LastWriteTimeUtc.ToString('o') }
    }
    return $out
}

function Get-IjcCsprojLines {
    $bytes = [IO.File]::ReadAllBytes($IjcCsproj)
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    return [pscustomobject]@{
        Bom  = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
        Eol  = $(if ($text.Contains("`r`n")) { "`r`n" } else { "`n" })
        Text = $text
    }
}

function Get-IjcCsprojEntries {
    # linhas <Compile Include> que a instalacao acrescenta (uma por arquivo do payload)
    $p = Get-IjcPayload
    return @($p.files | ForEach-Object { '    <Compile Include="' + $IjcTargetRel + '\' + $_.name + '" />' })
}

function Get-IjcBackup([string]$BackupId) {
    $dir = Join-Path $IjcBackupRoot $BackupId
    $mf = Join-Path $dir 'pre-manifest.json'
    if (-not (Test-Path -LiteralPath $mf)) { throw "backup nao encontrado: $mf" }
    $m = Get-Content -LiteralPath $mf -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $m.verified) { throw "backup $BackupId nao esta VERIFIED" }
    if ($m.custom_dir -ne $IjcCustom) { throw "backup $BackupId e de outro diretorio: $($m.custom_dir)" }
    return [pscustomobject]@{ Dir = $dir; Files = (Join-Path $dir 'files'); Manifest = $m }
}

function Test-IjcBackupIntact($B) {
    # a copia de backup ainda bate byte a byte com o manifesto pre-instalacao?
    $bad = @()
    foreach ($e in $B.Manifest.files) {
        $p = Join-Path $B.Files $e.path
        if (-not (Test-Path -LiteralPath $p) -or (Get-IjcSha256 $p) -ne $e.sha256) { $bad += $e.path }
    }
    return $bad
}

function Compare-IjcLive($B) {
    # arquivos do conjunto de backup cujo estado atual difere do pre-manifesto
    $diff = @()
    foreach ($e in $B.Manifest.files) {
        $p = Join-Path $IjcCustom $e.path
        if (-not (Test-Path -LiteralPath $p)) { $diff += [pscustomobject]@{ path = $e.path; state = 'MISSING' } }
        elseif ((Get-IjcSha256 $p) -ne $e.sha256) { $diff += [pscustomobject]@{ path = $e.path; state = 'CHANGED' } }
    }
    return $diff
}

function Write-IjcJson($Obj, [string]$Path) {
    $json = $Obj | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText($Path, $json, (New-Object Text.UTF8Encoding($false)))
}

function Write-IjcResult([string]$Step, [bool]$Pass, $Detail) {
    $r = [pscustomobject]@{ step = $Step; verdict = $(if ($Pass) { 'PASS' } else { 'FAIL' }); at = (Get-Date).ToUniversalTime().ToString('o'); detail = $Detail }
    $r | ConvertTo-Json -Depth 8
    if (-not $Pass) { exit 1 }
}
