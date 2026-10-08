# Gera o ZIP de transporte (NAO_IMPORTAR) de cada cliente a partir de entregas\<CLIENTE>\_conteudo_entrega e o da OLIVER a partir do pack BASELINE.
# '/' como separador; roundtrip byte a byte; nunca sobrescreve.
param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$OliverPack)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$sh = New-Object Security.Cryptography.SHA256Managed
function Sha([byte[]]$b) { [BitConverter]::ToString($sh.ComputeHash($b)).Replace('-', '').ToLowerInvariant() }
function EntryBytes($x) { $ms = New-Object IO.MemoryStream; $st = $x.Open(); $st.CopyTo($ms); $st.Dispose(); , $ms.ToArray() }
function Pack($out, $pairs) {   # pairs: @(@(caminhoOrigem, nomeNaEntrada), ...)
  if (Test-Path -LiteralPath $out) { throw "JA EXISTE: $out" }
  $fs = [IO.File]::Open($out, 'CreateNew'); $a = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
  foreach ($p in $pairs) { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($a, $p[0], $p[1], [IO.Compression.CompressionLevel]::Optimal) }
  $a.Dispose(); $fs.Dispose()
  $z = [IO.Compression.ZipFile]::OpenRead($out); $bad = 0; $map = @{}; foreach ($p in $pairs) { $map[$p[1]] = $p[0] }
  foreach ($x in $z.Entries) { if ((Sha (EntryBytes $x)) -ne (Sha ([IO.File]::ReadAllBytes($map[$x.FullName])))) { $bad++ } }
  $n = $z.Entries.Count; $z.Dispose()
  return [ordered]@{ file = $out; entries = $n; roundtrip_bad = $bad; sha256 = (Sha ([IO.File]::ReadAllBytes($out))); bytes = (Get-Item -LiteralPath $out).Length }
}
$res = @()
foreach ($d in Get-ChildItem -LiteralPath (Join-Path $Root 'entregas') -Directory | Sort-Object Name) {
  $stg = Join-Path $d.FullName '_conteudo_entrega'
  $out = Join-Path $d.FullName ("ALFA_OMEGA_" + $d.Name + "_INVICTUS_Z30X2_20261008_NAO_IMPORTAR.zip")
  $pairs = @(Get-ChildItem -LiteralPath $stg -File | Sort-Object Name | ForEach-Object { , @($_.FullName, $_.Name) })
  $r = Pack $out $pairs; $r.cliente = $d.Name; $res += $r
  "$($d.Name) entries=$($r.entries) roundtrip_bad=$($r.roundtrip_bad) sha=$($r.sha256)"
}
# OLIVER: transporte do pack BASELINE (zip + LEIA-ME + manifesto + equivalencia + 2 rollbacks). Sem a pasta de configuracao (especifica da maquina).
$od = Join-Path $Root 'entregas_oliver'; New-Item -ItemType Directory -Force $od | Out-Null
$pairs = @()
foreach ($n in 'AlfaOmega_OLIVER_INVICTUS_BASELINE_ATUAL_20261008_import.zip', 'LEIA-ME.md', 'MANIFEST_SHA256.txt', 'EQUIVALENCIA.json') { $pairs += , @((Join-Path $OliverPack $n), $n) }
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $OliverPack 'rollback_estado_anterior') -File | Sort-Object Name) { $pairs += , @($f.FullName, ('rollback_estado_anterior/' + $f.Name)) }
$r = Pack (Join-Path $od 'ALFA_OMEGA_OLIVER_MAIN_MACHINE_INVICTUS_Z30X2_BASELINE_20261008_NAO_IMPORTAR.zip') $pairs; $r.cliente = 'OLIVER_MAIN_MACHINE'; $res += $r
"OLIVER_MAIN_MACHINE entries=$($r.entries) roundtrip_bad=$($r.roundtrip_bad) sha=$($r.sha256)"
[IO.File]::WriteAllText((Join-Path $Root 'CONTEINERES_Z30X2.json'), ($res | ConvertTo-Json -Depth 4))
