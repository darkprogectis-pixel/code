# Somente leitura: escopo do pack baseline. Lista os fontes nao-padrao (sem @) do baseline que ficam FORA do conjunto do pack de referencia OLIVER
# e mostra Info.xml / AdditionalReferences.txt da referencia.
param([string]$Baseline, [string]$Ref, [string]$Out)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$c = Join-Path $Baseline 'Custom'
$z = [System.IO.Compression.ZipFile]::OpenRead($Ref)
$lista = @($z.Entries | Where-Object { -not $_.FullName.EndsWith('/') } | ForEach-Object { $_.FullName })
$txt = @{}
foreach ($n in 'Info.xml', 'AdditionalReferences.txt') { $e = $z.GetEntry($n); if ($e) { $sr = New-Object IO.StreamReader($e.Open()); $txt[$n] = $sr.ReadToEnd(); $sr.Close() } }
$z.Dispose()
$set = @{}; foreach ($l in $lista) { $set[$l.ToLower()] = 1 }
$ours = @(Get-ChildItem $c -Recurse -File -Filter *.cs | Where-Object { -not $_.Name.StartsWith('@') } | ForEach-Object { $_.FullName.Substring($c.Length + 1).Replace('\', '/') })
$fora = @($ours | Where-Object { -not $set.ContainsKey($_.ToLower()) })
$ao = @($fora | Where-Object { (Split-Path $_ -Leaf) -match '^(AlfaOmega|Ao|Invictus|TTW)' -or $_ -match 'TTW_DarkProjects' })
[IO.File]::WriteAllText($Out, (@{ ref = $Ref; ref_entries = $lista; baseline_nao_padrao = $ours.Count; fora_do_pack = $fora; fora_com_nome_do_produto = $ao; info_xml = $txt['Info.xml']; additional_references = $txt['AdditionalReferences.txt'] } | ConvertTo-Json -Depth 4))
"ref_entries=$($lista.Count) baseline_nao_padrao=$($ours.Count) fora_do_pack=$($fora.Count) fora_com_nome_do_produto=$($ao.Count)"
"--- fora com nome do produto:"; $ao
"--- demais fora (primeiros 40):"; $fora | Where-Object { $ao -notcontains $_ } | Select-Object -First 40
"--- Info.xml:"; $txt['Info.xml']
"--- AdditionalReferences.txt:"; $txt['AdditionalReferences.txt']
