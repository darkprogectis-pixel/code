# Provas adicionais do pack baseline (somente leitura): (1) varredura do zip por segredos/identificadores; (2) comparacao entrada a entrada com a referencia aceita.
param([Parameter(Mandatory)][string]$Zip, [Parameter(Mandatory)][string]$Ref, [Parameter(Mandatory)][string]$Out)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$sha = [System.Security.Cryptography.SHA256]::Create()
function Load($p) { $h = @{}; $t = @{}; $z = [System.IO.Compression.ZipFile]::OpenRead($p); foreach ($e in $z.Entries) { if ($e.FullName.EndsWith('/')) { continue }; $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $b = $ms.ToArray(); $h[$e.FullName] = ([BitConverter]::ToString($sha.ComputeHash($b)) -replace '-', '').ToLower(); if ($e.FullName -notmatch '\.dll$') { $t[$e.FullName] = [Text.Encoding]::UTF8.GetString($b) } }; $z.Dispose(); return @($h, $t) }
$a = Load $Zip; $r = Load $Ref
$pat = [ordered]@{
  conta_corretora = 'TAKEPROFIT\d{4,}'
  chave_privada = '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  bearer_literal = '(?i)bearer\s+[A-Za-z0-9\-_\.]{20,}'
  atribuicao_segredo_literal = '(?i)\b(password|passwd|senha|secret|api[_-]?key|apikey|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*"[^"\s]{8,}"'
  jwt = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  aws = 'AKIA[0-9A-Z]{16}'
}
$hits = @()
foreach ($k in $a[1].Keys) { foreach ($n in $pat.Keys) { $m = [regex]::Matches($a[1][$k], $pat[$n]); if ($m.Count -gt 0) { $hits += [ordered]@{ entry = $k; padrao = $n; ocorrencias = $m.Count; amostra_mascarada = ($m[0].Value.Substring(0, [Math]::Min(14, $m[0].Value.Length)) + '...') } } } }
$iguais = @(); $dif = @(); $so_pack = @(); $so_ref = @()
foreach ($k in $a[0].Keys) { if (-not $r[0].ContainsKey($k)) { $so_pack += $k } elseif ($a[0][$k] -eq $r[0][$k]) { $iguais += $k } else { $dif += $k } }
foreach ($k in $r[0].Keys) { if (-not $a[0].ContainsKey($k)) { $so_ref += $k } }
$esperados = @('AddOns/AlfaOmegaRobo.cs', 'AddOns/AlfaOmegaRoboFechamento.cs', 'AddOns/AlfaOmegaRoboSaida.cs', 'Indicators/TTW_DarkProjects/AlfaOmegaSharedState.cs', 'Indicators/TTW_DarkProjects/AoTapeEngine.cs', 'Indicators/TTW_DarkProjects/AoMarketDataPublisher.cs')
$res = [ordered]@{ zip = $Zip; referencia = $Ref; varredura_segredos = [ordered]@{ padroes = @($pat.Keys); entradas_texto = $a[1].Count; achados = $hits }
  comparacao_referencia = [ordered]@{ iguais = $iguais.Count; diferentes = ($dif | Sort-Object); so_no_pack = $so_pack; so_na_referencia = $so_ref; diferentes_esperados = ($esperados | Sort-Object); diferencas_inesperadas = @($dif | Where-Object { $esperados -notcontains $_ }); esperadas_ausentes = @($esperados | Where-Object { $dif -notcontains $_ }) } }
[IO.File]::WriteAllText($Out, ($res | ConvertTo-Json -Depth 6))
"segredos: entradas_texto=$($a[1].Count) achados=$($hits.Count)"; foreach ($x in $hits) { "   $($x.entry) :: $($x.padrao) x$($x.ocorrencias) :: $($x.amostra_mascarada)" }
"referencia: iguais=$($iguais.Count) diferentes=$($dif.Count) so_pack=$($so_pack.Count) so_ref=$($so_ref.Count) inesperadas=$(@($res.comparacao_referencia.diferencas_inesperadas).Count) esperadas_ausentes=$(@($res.comparacao_referencia.esperadas_ausentes).Count)"
