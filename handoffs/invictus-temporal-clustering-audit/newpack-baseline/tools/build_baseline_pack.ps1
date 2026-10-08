# NOVO PACK BASELINE (JEV NEWPACK DESIGN T1 req_01a11d3288917ba3ad718c53356754d0 = P1): reproduz o estado instalado, sem alteracao funcional.
# Fonte UNICA do conteudo: baseline capturado. Info.xml e AdditionalReferences.txt: bytes do pack OLIVER de referencia ja aceito pelo importador.
# NAO le nem escreve no NinjaTrader. Gera zip + manifesto + pasta companheira de configuracao + relatorio de equivalencia + roundtrip + arvore reconstruida.
param([Parameter(Mandatory)][string]$Baseline, [Parameter(Mandatory)][string]$Ref, [Parameter(Mandatory)][string]$OutDir, [Parameter(Mandatory)][string]$Scratch)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$sha = [System.Security.Cryptography.SHA256]::Create()
function HB([byte[]]$b) { ([BitConverter]::ToString($sha.ComputeHash($b)) -replace '-', '').ToLower() }
function HF($p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() }
$c = Join-Path $Baseline 'Custom'
if (Test-Path -LiteralPath $OutDir) { throw "ja existe: $OutDir" }
New-Item -ItemType Directory $OutDir | Out-Null
# 1. lista e metadados da referencia
$zr = [System.IO.Compression.ZipFile]::OpenRead($Ref); $meta = @{}; $lista = @()
foreach ($e in $zr.Entries) { if ($e.FullName.EndsWith('/')) { continue }; $lista += $e.FullName
  if ($e.FullName -in 'Info.xml', 'AdditionalReferences.txt') { $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $meta[$e.FullName] = $ms.ToArray() } }
$zr.Dispose()
$fontes = @($lista | Where-Object { $_ -notin 'Info.xml', 'AdditionalReferences.txt' })
$missingSrc = @($fontes | Where-Object { -not (Test-Path -LiteralPath (Join-Path $c ($_ -replace '/', '\'))) })
if ($missingSrc.Count) { throw "fontes da referencia ausentes no baseline: $($missingSrc -join ', ')" }
# 2. zip (mesma ordem de entradas da referencia)
$zipPath = Join-Path $OutDir 'AlfaOmega_OLIVER_INVICTUS_BASELINE_ATUAL_20261008_import.zip'
$z = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
foreach ($n in $lista) {
  if ($meta.ContainsKey($n)) { $e = $z.CreateEntry($n); $st = $e.Open(); $st.Write($meta[$n], 0, $meta[$n].Length); $st.Close() }
  else { [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, (Join-Path $c ($n -replace '/', '\')), $n) }
}
$z.Dispose()
# 3. pasta companheira de configuracao (referencia do estado; nao instalavel pelo importador)
$cfg = Join-Path $OutDir 'config_companheira'; Copy-Item -LiteralPath (Join-Path $Baseline 'robo-config') $cfg -Recurse
$cfgSums = @(Get-ChildItem $cfg -File | Sort-Object Name | ForEach-Object { (HF $_.FullName) + '  ' + $_.Name }); [IO.File]::WriteAllLines((Join-Path $cfg 'SHA256SUMS.txt'), $cfgSums)
# 4. equivalencia entrada a entrada + roundtrip (extrair e comparar byte a byte)
$rt = Join-Path $Scratch ('newpack_roundtrip_' + [guid]::NewGuid().ToString('N').Substring(0, 8)); [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $rt)
$za = [System.IO.Compression.ZipFile]::OpenRead($zipPath); $ent = @(); $changed = @(); $man = @()
foreach ($e in $za.Entries) { $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $h = HB $ms.ToArray(); $man += "$h  $($e.FullName)"
  $exp = if ($meta.ContainsKey($e.FullName)) { HB $meta[$e.FullName] } else { HF (Join-Path $c ($e.FullName -replace '/', '\')) }
  $rth = HF (Join-Path $rt ($e.FullName -replace '/', '\'))
  if ($h -ne $exp -or $rth -ne $exp) { $changed += $e.FullName }
  $ent += [ordered]@{ entry = $e.FullName; bytes = $ms.Length; sha256 = $h; igual_ao_baseline = ($h -eq $exp); roundtrip_igual = ($rth -eq $exp) } }
$packed = @($za.Entries | ForEach-Object { $_.FullName }); $za.Dispose()
[IO.File]::WriteAllLines((Join-Path $OutDir 'MANIFEST_SHA256.txt'), $man)
$rtFiles = @(Get-ChildItem $rt -Recurse -File | ForEach-Object { $_.FullName.Substring($rt.Length + 1).Replace('\', '/') })
$extra = @($packed | Where-Object { $lista -notcontains $_ }); $miss = @($lista | Where-Object { $packed -notcontains $_ })
$proib = @($packed | Where-Object { $_ -match '(?i)auth|login|licenc|senha|token|device|\.dll$|\.json$|\.cfg$|\.bind$' })
# 5. arvore reconstruida: copia do baseline + conteudo do zip por cima => deve ficar identica ao baseline
$tree = Join-Path $Scratch 'newpack_tree'; if (Test-Path -LiteralPath $tree) { Remove-Item -LiteralPath $tree -Recurse -Force }
Copy-Item -LiteralPath $c $tree -Recurse
foreach ($n in $fontes) { Copy-Item -LiteralPath (Join-Path $rt ($n -replace '/', '\')) (Join-Path $tree ($n -replace '/', '\')) -Force }
$treeDiff = 0; $treeN = 0
Get-ChildItem $c -Recurse -File | ForEach-Object { $treeN++; $rel = $_.FullName.Substring($c.Length + 1); if ((HF $_.FullName) -ne (HF (Join-Path $tree $rel))) { $treeDiff++ } }
$treeExtra = @(Get-ChildItem $tree -Recurse -File).Count - $treeN
# 6. criticos e identidade (hashes do baseline; identidade fica FORA do zip por desenho)
$crit = [ordered]@{}
foreach ($n in 'AddOns\AlfaOmegaRobo.cs', 'AddOns\AlfaOmegaRoboFechamento.cs', 'AddOns\AlfaOmegaRoboSaida.cs', 'AddOns\AlfaOmegaRoboMotor.cs', 'AddOns\AlfaOmegaRoboFontes.cs', 'AddOns\AlfaOmegaTrader.cs', 'Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs', 'Indicators\TTW_DarkProjects\AoTapeEngine.cs', 'Indicators\TTW_DarkProjects\AoMarketDataPublisher.cs', 'Indicators\TTW_DarkProjects\AlfaOmegaAuthV2.cs', 'Indicators\TTW_DarkProjects\AoLicenca.cs', 'Indicators\TTW_DarkProjects\AoLogin.cs') {
  $p = Join-Path $c $n; $crit[$n.Replace('\', '/')] = [ordered]@{ sha256_baseline = (HF $p); no_zip = ($packed -contains $n.Replace('\', '/')) } }
$res = [ordered]@{
  jev_design = 'req_01a11d3288917ba3ad718c53356754d0'; baseline = $Baseline; referencia = $Ref; referencia_sha256 = (HF $Ref)
  zip = $zipPath; zip_sha256 = (HF $zipPath); zip_bytes = (Get-Item -LiteralPath $zipPath).Length
  source_files_expected = $fontes.Count; source_files_packed = @($packed | Where-Object { $_ -notin 'Info.xml', 'AdditionalReferences.txt' }).Count; pack_file_count = $packed.Count
  missing = $miss; extra = $extra; unexpected_changed = $changed; entradas_proibidas = $proib
  info_xml_igual_referencia = ((HB $meta['Info.xml']) -eq ($ent | Where-Object { $_.entry -eq 'Info.xml' }).sha256)
  roundtrip = [ordered]@{ files = $rtFiles.Count; missing = @($lista | Where-Object { $rtFiles -notcontains $_ }).Count; extra = @($rtFiles | Where-Object { $lista -notcontains $_ }).Count; content_diff = @($ent | Where-Object { -not $_.roundtrip_igual }).Count }
  arvore_reconstruida = [ordered]@{ path = $tree; arquivos = $treeN; diferentes_do_baseline = $treeDiff; extras = $treeExtra }
  config_companheira = [ordered]@{ path = $cfg; arquivos = $cfgSums }
  criticos = $crit; entradas = $ent }
[IO.File]::WriteAllText((Join-Path $OutDir 'EQUIVALENCIA.json'), ($res | ConvertTo-Json -Depth 6))
Remove-Item -LiteralPath $rt -Recurse -Force
"ZIP $zipPath"; "SHA256 $($res.zip_sha256) bytes=$($res.zip_bytes) entradas=$($packed.Count)"
"expected=$($fontes.Count) packed=$($res.source_files_packed) missing=$($miss.Count) extra=$($extra.Count) changed=$($changed.Count) proibidas=$($proib.Count)"
"roundtrip files=$($res.roundtrip.files) missing=$($res.roundtrip.missing) extra=$($res.roundtrip.extra) diff=$($res.roundtrip.content_diff)"
"arvore reconstruida: arquivos=$treeN diferentes=$treeDiff extras=$treeExtra -> $tree"
