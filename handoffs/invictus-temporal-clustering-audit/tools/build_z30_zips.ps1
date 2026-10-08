# OLIVER FORCA_JANELA_30 (JEV DIFF A req_01a11b953e517b13b2bab1bad0b833f1): backup versionado dos 3 instalados + zip ROLLBACK (3 originais)
# + zip de IMPORT (3 arquivos do staging\after). NAO escreve no NT8 (so le os 3 instalados para o backup). Info.xml = o do import OLIVER P-GCAP.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$W = Split-Path $PSScriptRoot
$files = @('Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs', 'Indicators\TTW_DarkProjects\AoTapeEngine.cs', 'Indicators\TTW_DarkProjects\AoMarketDataPublisher.cs')
$inst = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"
$after = Join-Path $W 'staging\after'; $before = Join-Path $W 'staging\before'
$ref = 'C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\oliver-main-pgcap-20261007\build\AlfaOmega_OLIVER_INVICTUS_PGCAP_import.zip'
$h = { param($p) (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() }
$sha = [System.Security.Cryptography.SHA256]::Create()
$hb = { param([byte[]]$b) ([BitConverter]::ToString($sha.ComputeHash($b)) -replace '-', '').ToLower() }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $W "backup\$ts"; New-Item -ItemType Directory -Force $bk | Out-Null
$sums = @()
foreach ($f in $files) {
  $i = Join-Path $inst $f
  if ((& $h (Join-Path $before $f)) -ne (& $h $i)) { throw "staging\before != instalado agora: $f" }
  $d = Join-Path $bk $f; New-Item -ItemType Directory -Force (Split-Path $d) | Out-Null; Copy-Item -LiteralPath $i $d
  $sums += "$(& $h $d)  $f"
}
[IO.File]::WriteAllLines((Join-Path $bk 'SHA256SUMS.txt'), $sums)
# Info.xml do import OLIVER anterior (mesmo formato aceito pelo NT8)
$zr0 = [System.IO.Compression.ZipFile]::OpenRead($ref); $ie = $zr0.GetEntry('Info.xml'); $s = $ie.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $info = $ms.ToArray(); $refEntries = @($zr0.Entries | ForEach-Object { $_.FullName }); $zr0.Dispose()
$out = Join-Path $W 'build'; New-Item -ItemType Directory -Force $out | Out-Null
function MkZip($zipPath, $srcRoot) {
  if (Test-Path -LiteralPath $zipPath) { throw "ja existe: $zipPath" }
  $z = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
  $e = $z.CreateEntry('Info.xml'); $st = $e.Open(); $st.Write($info, 0, $info.Length); $st.Close()
  foreach ($f in $files) { [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, (Join-Path $srcRoot $f), $f.Replace('\', '/')) }
  $z.Dispose()
}
$zi = Join-Path $out 'AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_import.zip'; MkZip $zi $after
$zb = Join-Path $out 'AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_ROLLBACK_import.zip'; MkZip $zb $bk
$res = [ordered]@{ backup = $bk; backup_files = $sums; info_xml_sha256 = (& $hb $info); ref_zip_entries = $refEntries; zips = @() }
foreach ($p in @(@($zi, $after), @($zb, $bk))) {
  $a = [System.IO.Compression.ZipFile]::OpenRead($p[0]); $ent = @()
  foreach ($e in $a.Entries) { $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $eh = & $hb $ms.ToArray()
    if ($e.FullName -eq 'Info.xml') { $exp = & $hb $info } else { $exp = & $h (Join-Path $p[1] $e.FullName.Replace('/', '\')) }
    $ent += [ordered]@{ entry = $e.FullName; bytes = $ms.Length; sha256 = $eh; match = ($eh -eq $exp) } }
  $a.Dispose()
  $bad = @($ent | Where-Object { $_.entry -match '(?i)auth|login|licenc|senha|device|\.dll$|\.json$|\.cfg$' })
  $res.zips += [ordered]@{ zip = $p[0]; sha256 = (& $h $p[0]); entries = $ent; n_entries = $ent.Count; all_match = (@($ent | Where-Object { -not $_.match }).Count -eq 0); forbidden_entries = $bad.Count }
}
# rollback == instalado agora (3/3) e import == staging\after (3/3)
$res.rollback_equals_installed = (@($files | Where-Object { (& $h (Join-Path $bk $_)) -ne (& $h (Join-Path $inst $_)) }).Count -eq 0)
[IO.File]::WriteAllText((Join-Path $W 'tests\BUILD_Z30_ZIPS.json'), ($res | ConvertTo-Json -Depth 6))
foreach ($z in $res.zips) { "{0}  {1}  entries={2} all_match={3} forbidden={4}" -f $z.sha256, (Split-Path $z.zip -Leaf), $z.n_entries, $z.all_match, $z.forbidden_entries }
"backup=$bk rollback_equals_installed=$($res.rollback_equals_installed) ref_entries=$($refEntries -join ' | ')"
