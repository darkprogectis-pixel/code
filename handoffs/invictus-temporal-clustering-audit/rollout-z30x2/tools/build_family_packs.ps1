# ROLLOUT Z30X2 (JEV ROLLOUT GATE T1 req_01a11d42365f71b592f54c95ed5c263b = preparar e RETER): gera o import de cada FAMILIA de cliente
# a partir do import P-GCAP da familia, trocando SOMENTE os 6 arquivos do nucleo (3 FORCA_JANELA_30 + 3 EXIT_LAYER_FIX X2) pelos patchados
# (delta aprovado aplicado por diff sobre a variante de cliente). Toda outra entrada e copiada byte a byte, na mesma ordem. Nao toca NT8.
param([Parameter(Mandatory)][string]$Core, [Parameter(Mandatory)][string]$OldBuild, [Parameter(Mandatory)][string]$OutDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$sha = [System.Security.Cryptography.SHA256]::Create()
function HB([byte[]]$b) { ([BitConverter]::ToString($sha.ComputeHash($b)) -replace '-', '').ToLower() }
function HF($p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() }
$novo = @{}; $velho = @{}
foreach ($n in 'AlfaOmegaSharedState.cs', 'AoTapeEngine.cs', 'AoMarketDataPublisher.cs') { $novo[$n] = [IO.File]::ReadAllBytes((Join-Path $Core "staging\after\Indicators\TTW_DarkProjects\$n")); $velho[$n] = HF (Join-Path $Core "staging\before\Indicators\TTW_DarkProjects\$n") }
foreach ($n in 'AlfaOmegaRobo.cs', 'AlfaOmegaRoboFechamento.cs', 'AlfaOmegaRoboSaida.cs') { $novo[$n] = [IO.File]::ReadAllBytes((Join-Path $Core "staging_exit\after\AddOns\$n")); $velho[$n] = HF (Join-Path $Core "staging_exit\before\AddOns\$n") }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$fam = [ordered]@{ F1 = 'AlfaOmega_F1_INVICTUS_PGCAP_import.zip'; F2 = 'AlfaOmega_F2_INVICTUS_PGCAP_import.zip'; F3 = 'AlfaOmega_F3_INVICTUS_PGCAP_import.zip'; F4 = 'AlfaOmega_F4_INVICTUS_PGCAP_import.zip'; CANON = 'AlfaOmega_INVICTUS_Native_PGCAP_import.zip' }
$res = @()
foreach ($f in $fam.Keys) {
  $old = Join-Path $OldBuild $fam[$f]; $new = Join-Path $OutDir ($fam[$f] -replace '_PGCAP_import\.zip$', '_Z30X2_import.zip')
  if (Test-Path -LiteralPath $new) { throw "ja existe: $new" }
  $zo = [System.IO.Compression.ZipFile]::OpenRead($old); $zn = [System.IO.Compression.ZipFile]::Open($new, 'Create'); $trocados = @(); $baseErr = @()
  foreach ($e in $zo.Entries) {
    if ($e.FullName.EndsWith('/')) { [void]$zn.CreateEntry($e.FullName); continue }
    $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $b = $ms.ToArray()
    if ($novo.ContainsKey($e.Name)) { if ((HB $b) -ne $velho[$e.Name]) { $baseErr += $e.FullName }; $b = $novo[$e.Name]; $trocados += $e.FullName }
    $ne = $zn.CreateEntry($e.FullName); $ne.LastWriteTime = $e.LastWriteTime; $st = $ne.Open(); $st.Write($b, 0, $b.Length); $st.Close()
  }
  $zo.Dispose(); $zn.Dispose()
  if ($baseErr.Count) { throw "$f : base diferente do esperado em $($baseErr -join ', ')" }
  # roundtrip: mesma lista/ordem; nao-alvos byte a byte; alvos = patchados
  $a = [System.IO.Compression.ZipFile]::OpenRead($old); $c = [System.IO.Compression.ZipFile]::OpenRead($new)
  $la = @($a.Entries | ForEach-Object { $_.FullName }); $lc = @($c.Entries | ForEach-Object { $_.FullName }); $inesp = @(); $alvoOk = 0; $ents = @()
  for ($i = 0; $i -lt $lc.Count; $i++) { $ec = $c.Entries[$i]; if ($ec.FullName.EndsWith('/')) { continue }
    $s = $ec.Open(); $m1 = New-Object IO.MemoryStream; $s.CopyTo($m1); $s.Close(); $hc = HB $m1.ToArray()
    $ea = $a.GetEntry($ec.FullName); $s = $ea.Open(); $m2 = New-Object IO.MemoryStream; $s.CopyTo($m2); $s.Close(); $ha = HB $m2.ToArray()
    if ($novo.ContainsKey($ec.Name)) { if ($hc -eq (HB $novo[$ec.Name])) { $alvoOk++ } else { $inesp += $ec.FullName } } elseif ($hc -ne $ha) { $inesp += $ec.FullName }
    $ents += [ordered]@{ name = $ec.FullName; sha256 = $hc; action = $(if ($novo.ContainsKey($ec.Name)) { 'Z30X2' } else { 'KEEP_PGCAP' }) } }
  $a.Dispose(); $c.Dispose()
  $r = [ordered]@{ familia = $f; base_zip = $old; base_sha256 = (HF $old); zip = $new; sha256 = (HF $new); bytes = (Get-Item -LiteralPath $new).Length; entradas = @($lc | Where-Object { -not $_.EndsWith('/') }).Count
    mesma_lista = (($la -join '|') -eq ($lc -join '|')); trocados = $trocados; alvos_ok = $alvoOk; unexpected_changed = $inesp; entries = $ents }
  $res += $r
  "{0} {1} entradas={2} trocados={3} alvos_ok={4} mesma_lista={5} inesperados={6} sha={7}" -f $f, (Split-Path $new -Leaf), $r.entradas, $trocados.Count, $alvoOk, $r.mesma_lista, $inesp.Count, $r.sha256
}
[IO.File]::WriteAllText((Join-Path $OutDir 'FAMILIAS_Z30X2.json'), ($res | ConvertTo-Json -Depth 6))
