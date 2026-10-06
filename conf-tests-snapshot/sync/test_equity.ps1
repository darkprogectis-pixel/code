# EQUITY_GUARD test_equity 2026-10-02 — E1–E6 sobre o codigo REAL (gen_equity_harness.js): AoRoboEquity do Fechamento STAGING,
# LerEquity + trecho do ctx de conta do Robo (STAGING ou controle) e PropfirmGuard/JsNum/JsStr do LIVE (so leitura). Stub so do NT8.
# Uso: .\test_equity.ps1              (STAGING)
#      .\test_equity.ps1 -Controle    (Robo antigo fe048080 de fix-backups\...\equity-guard\before: E3/E4/E5 devem FALHAR)
param([switch]$Controle)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$LIV = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AddOns"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STG = Join-Path $DIR "staging\AddOns"
$OUT = Join-Path $DIR "out"
$BEFORE = Join-Path $env:LOCALAPPDATA "InvictusJevCode\fix-backups\close-divergence-20261001\equity-guard\before"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
$ROBO = $(if ($Controle) { Join-Path $BEFORE "AlfaOmegaRobo.cs" } else { Join-Path $STG "AlfaOmegaRobo.cs" })
$tag = $(if ($Controle) { "Controle" } else { "Staging" })

$gen = Join-Path $OUT ("EquityHarness." + $tag + ".g.cs")
& node (Join-Path $DIR "gen_equity_harness.js") $ROBO (Join-Path $STG "AlfaOmegaRoboFechamento.cs") (Join-Path $LIV "AlfaOmegaRoboGates.cs") $gen
if ($LASTEXITCODE -ne 0) { exit 2 }

$onResolve = [System.ResolveEventHandler]{
  param($snd, $e)
  try { $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name
        $p = Join-Path $NT ($n + ".dll"); if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) } } catch {}
  return $null
}
[System.AppDomain]::CurrentDomain.add_AssemblyResolve($onResolve)
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.dll"))
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.CSharp.dll"))
$fw = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in @((Join-Path $fw "mscorlib.dll"), (Join-Path $fw "System.dll"), (Join-Path $fw "System.Core.dll"), (Join-Path $NT "Newtonsoft.Json.dll"))) {
  $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in @((Join-Path $DIR "ProgramEquity.cs"), $gen)) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, [System.Text.Encoding]::UTF8))
}
foreach ($f in @($ROBO, (Join-Path $STG "AlfaOmegaRoboFechamento.cs"), (Join-Path $LIV "AlfaOmegaRoboGates.cs"), (Join-Path $LIV "AlfaOmegaRoboEntry.cs"))) {
  "fonte: " + $f + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16) }
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramEquity")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("Equity" + $tag, $trees, $refs, $opt)
$exe = Join-Path $OUT ("Equity" + $tag + ".exe")
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (Equity$tag) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 40 | ForEach-Object { "  $_" }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $OUT "Newtonsoft.Json.dll") -Force
""
"== test_equity ($tag) =="
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($Controle) { & $exe controle } else { & $exe }
$rc = $LASTEXITCODE
""
"EQUITY($tag): rc=$rc"
exit $rc
