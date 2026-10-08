# Inventario SOMENTE LEITURA dos packs: todo .zip nas arvores do projeto que contenha um dos 3 fontes da camada de saida.
# Para cada zip: caminho, tamanho, data, sha256 do zip e sha256 de cada um dos 3 fontes + classificacao por hash.
param([string]$Out)
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$roots = @('C:\Users\ADM\Desktop\Handof TTW', 'C:\Users\ADM\Downloads\Club gamma', 'C:\Users\ADM\Claude-JEV\code', 'C:\Users\ADM\Downloads', 'C:\Users\ADM\Desktop')
$alvo = @('AlfaOmegaRobo.cs', 'AlfaOmegaRoboFechamento.cs', 'AlfaOmegaRoboSaida.cs')
$base = @{ 'AlfaOmegaRobo.cs' = '32c84685d1381e6bfd8d10156dea9de38f01acdd002aa5ab4ace3128c69060c6'; 'AlfaOmegaRoboFechamento.cs' = 'c061880c962cfbaa1b563f983ed24bd1ad4622c523993228c46ad10506b30163'; 'AlfaOmegaRoboSaida.cs' = 'ca59088d38c798544f9fe69cf92ed815db520cc1a17892b98c9718d48f574470' }
$fix = @{ 'AlfaOmegaRobo.cs' = 'f678d200fe4ca7e9b8f6211d6436eb86dac2838f4422cee23d8791b79041298e'; 'AlfaOmegaRoboFechamento.cs' = 'a1fc99a8cce2bbbcbe1428b545ec2efc15355c571919e23f1843945347d7774d'; 'AlfaOmegaRoboSaida.cs' = '90e0020ad3187f6a360a5a661ade4e610ea16a101ff44e3538757032518eacf9' }
$sha = [System.Security.Cryptography.SHA256]::Create()
$seen = @{}; $res = @(); $nzip = 0
foreach ($r in $roots) {
  if (-not (Test-Path -LiteralPath $r)) { continue }
  $depth = if ($r -in 'C:\Users\ADM\Downloads', 'C:\Users\ADM\Desktop') { 2 } else { 12 }
  Get-ChildItem -LiteralPath $r -Recurse -Depth $depth -Filter *.zip -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($seen.ContainsKey($_.FullName)) { return }; $seen[$_.FullName] = 1; $nzip++
    try {
      $z = [System.IO.Compression.ZipFile]::OpenRead($_.FullName)
      $hit = @($z.Entries | Where-Object { $alvo -contains $_.Name })
      if ($hit.Count -gt 0) {
        $h = [ordered]@{}; $cls = @()
        foreach ($e in $hit) { $s = $e.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close(); $x = ([BitConverter]::ToString($sha.ComputeHash($ms.ToArray())) -replace '-', '').ToLower(); $h[$e.FullName] = $x
          $cls += if ($x -eq $fix[$e.Name]) { 'FIX' } elseif ($x -eq $base[$e.Name]) { 'BASE' } else { 'OUTRO' } }
        $res += [ordered]@{ zip = $_.FullName; bytes = $_.Length; mtime = $_.LastWriteTime.ToString('s'); sha256 = (Get-FileHash -LiteralPath $_.FullName).Hash.ToLower(); entries = $z.Entries.Count; alvo = $h; cls = ($cls -join ',') }
      }
      $z.Dispose()
    } catch { $res += [ordered]@{ zip = $_.FullName; erro = $_.Exception.Message } }
  }
}
[IO.File]::WriteAllText($Out, (@{ zips_varridos = $nzip; com_alvo = $res.Count; itens = $res } | ConvertTo-Json -Depth 6))
"zips_varridos=$nzip com_alvo=$($res.Count)"
