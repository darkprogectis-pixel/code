# Import NT8 SIMULADO (sandbox): extrai os .cs do import por cima de bin\Custom (sobrescreve) e a Newtonsoft so se ausente.
# Info.xml / AdditionalReferences.txt nao sao modelados (o NT8 os consome no import; nao viram arquivo de codigo em bin\Custom).
param([Parameter(Mandatory)][string]$Zip, [Parameter(Mandatory)][string]$Bin)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$n = 0; $nw = 'skip'
$z = [IO.Compression.ZipFile]::OpenRead($Zip)
try {
  foreach ($e in $z.Entries) {
    $rel = $e.FullName -replace '/', '\'
    $t = Join-Path $Bin $rel
    if ($rel -like '*.cs') { New-Item -ItemType Directory -Force (Split-Path $t -Parent) | Out-Null; [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $t, $true); $n++ }
    elseif ($rel -eq 'Newtonsoft.Json.dll') { if (-not (Test-Path $t)) { [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $t, $false); $nw = 'added' } else { $nw = 'kept' } }
  }
} finally { $z.Dispose() }
"IMPORT cs=$n newtonsoft=$nw"
