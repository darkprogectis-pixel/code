# Somente leitura: lista as entradas dos packs de referencia e compara com o baseline capturado (nome e hash).
param([string]$Baseline, [string]$Out)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$P = 'C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006'
$refs = @(Get-ChildItem $P -Recurse -File -Include 'AlfaOmega_OLIVER_INVICTUS_PGCAP_RECOVERY_import.zip', 'AlfaOmega_OLIVER_INVICTUS_PGCAP_import.zip', 'AlfaOmega_INVICTUS_Native_PGCAP_import.zip', 'IMPORTAR_ESTE_NO_NINJATRADER.zip', 'AlfaOmega_INVICTUS_Native_import.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Group-Object Name | ForEach-Object { $_.Group[0] })
$sha = [System.Security.Cryptography.SHA256]::Create()
$res = @()
foreach ($r in $refs) {
  $z = [System.IO.Compression.ZipFile]::OpenRead($r.FullName); $n = 0; $same = 0; $dif = @(); $nob = @(); $ents = @()
  foreach ($e in $z.Entries) { if ($e.FullName.EndsWith('/')) { continue }; $n++; $ents += $e.FullName
    $bp = Join-Path (Join-Path $Baseline 'Custom') ($e.FullName -replace '/', '\')
    if (Test-Path -LiteralPath $bp) { $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $h = ([BitConverter]::ToString($sha.ComputeHash($ms.ToArray())) -replace '-', '').ToLower()
      if ($h -eq (Get-FileHash -LiteralPath $bp).Hash.ToLower()) { $same++ } else { $dif += $e.FullName } } else { $nob += $e.FullName } }
  $z.Dispose()
  $res += [ordered]@{ zip = $r.FullName; bytes = $r.Length; mtime = $r.LastWriteTime.ToString('s'); entries = $n; iguais_ao_baseline = $same; diferentes = $dif; fora_do_baseline = $nob; lista = $ents }
}
[IO.File]::WriteAllText($Out, ($res | ConvertTo-Json -Depth 5))
foreach ($x in $res) { "{0} | entries={1} iguais={2} dif={3} fora={4} | {5}" -f (Split-Path $x.zip -Leaf), $x.entries, $x.iguais_ao_baseline, @($x.diferentes).Count, @($x.fora_do_baseline).Count, $x.mtime; "   fora: " + ((@($x.fora_do_baseline) | Select-Object -First 12) -join ', '); "   dif: " + ((@($x.diferentes) | Select-Object -First 14) -join ', ') }
