# RESIDUAL test_residual 2026-10-06 — R01-R09: AlfaOmegaCopyEngineContas.cs + AoAccountNames.cs REAIS do STAGING (ou LIVE com -live = mutacao)
# + metodos de conta extraidos verbatim (gen_residual_harness.js). Sem NT8, sem conta, sem ordem.
# Uso: .	est_residual.ps1 [-live]
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$LIV = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AddOns"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUT = Join-Path $DIR "out"
$isLive = $args -contains '-live'
$ROOT = if ($isLive) { "C:/Users/ADM/Documents/NinjaTrader 8/bin/Custom" } else { Join-Path $DIR "staging" }
$genArgs = @((Join-Path $DIR "gen_residual_harness.js")); if ($isLive) { $genArgs += "-live" }
& node @genArgs
$scanRc = $LASTEXITCODE
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }

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
foreach ($r in @((Join-Path $fw "mscorlib.dll"), (Join-Path $fw "System.dll"), (Join-Path $fw "System.Core.dll"))) {
  $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)

$files = @((Join-Path $DIR "ProgramResidual.cs"), (Join-Path $OUT "ResidualExtracted.cs"), (Join-Path $ROOT "AddOns/AlfaOmegaCopyEngineContas.cs"), (Join-Path $ROOT "Indicators/TTW_DarkProjects/AoAccountNames.cs"))
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $files) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
  "fonte: " + $f + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16)
}
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramResidual")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("ResidualTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "ResidualTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (ResidualTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 40 | ForEach-Object { "  " + $_.Id + " " + [System.IO.Path]::GetFileName($_.Location.SourceTree.FilePath) + ":" + ($_.Location.GetLineSpan().StartLinePosition.Line + 1) + " " + $_.GetMessage() }
  exit 2
}
""
"== test_residual (" + $(if ($isLive) { "LIVE/mutacao" } else { "STAGING" }) + ") =="
& $exe
$rc = $LASTEXITCODE
""
if ($scanRc -ne 0 -and $rc -eq 0) { $rc = 1 }
"TEST_RESIDUAL: rc=$rc (scan=$scanRc)"
exit $rc
