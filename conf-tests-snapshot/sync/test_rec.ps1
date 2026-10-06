# RECONCILIATION test_rec 2026-10-05 — EXECUTA, com DUAS contas, o caminho real do AlfaOmegaRobo.cs do STAGING:
# abertura → fill de entrada (AoRoboOrderWatch real → OnFillEntrada/ProtegerFill reais) → desvio/reconciliacao (Reconciliar real) →
# saida (ExecutarSaida real) → fill de saida (OnExecucao real → AlfaOmegaRoboLedger real: PnL por conta) → restart
# (CarregarExecucoes / ReconciliarPernas / GarantiaBoot reais). Stub so de NT8/broker (out\RecStubs.g.cs). Sem NT8, sem conta, sem ordem.
# Uso: .\test_rec.ps1
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$LIV = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AddOns"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STG = Join-Path $DIR "staging\AddOns"
$OUT = Join-Path $DIR "out"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }

$gen = Join-Path $OUT "RecHarness.g.cs"
& node (Join-Path $DIR "gen_rec_harness.js") (Join-Path $STG "AlfaOmegaRobo.cs") $gen
if ($LASTEXITCODE -ne 0) { exit 2 }
& node (Join-Path $DIR "gen_rec_stubs.js")
if ($LASTEXITCODE -ne 0) { exit 2 }
$stubs = Join-Path $OUT "RecStubs.g.cs"

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

$files = @((Join-Path $DIR "ProgramRec.cs"), $stubs, $gen,
           (Join-Path $STG "AlfaOmegaRoboAtivos.cs"), (Join-Path $STG "AlfaOmegaRoboOrderWatch.cs"), (Join-Path $STG "AlfaOmegaRoboLedger.cs"),
           (Join-Path $STG "AlfaOmegaRoboEventoAot.cs"), (Join-Path $STG "AlfaOmegaRoboFechamento.cs"), (Join-Path $STG "AlfaOmegaRoboSaida.cs"), (Join-Path $STG "AlfaOmegaRoboMotor.cs"),
           (Join-Path $LIV "AlfaOmegaRoboGates.cs"), (Join-Path $STG "AlfaOmegaRoboPermissao.cs"), (Join-Path $LIV "AlfaOmegaRoboDedup.cs"),
           (Join-Path $LIV "AlfaOmegaRoboTurno.cs"), (Join-Path $LIV "AlfaOmegaRoboFontes.cs"), (Join-Path $LIV "AlfaOmegaRoboOperacional.cs"),
           (Join-Path $LIV "AlfaOmegaRoboOrderState.cs"), (Join-Path $LIV "AlfaOmegaRoboEntry.cs"),
           (Join-Path $LIV "AlfaOmegaRoboProtecao.cs"), (Join-Path $LIV "AlfaOmegaRoboHistorico.cs"), (Join-Path $LIV "AoJsonNum.cs"), (Join-Path $STG "AoRoboGuard.cs"))
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $files) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
  "fonte: " + $f + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16)
}
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramRec")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("RecTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "RecTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (RecTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 60 | ForEach-Object { "  " + $_.Id + " " + [System.IO.Path]::GetFileName($_.Location.SourceTree.FilePath) + ":" + ($_.Location.GetLineSpan().StartLinePosition.Line + 1) + " " + $_.GetMessage() }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $OUT "Newtonsoft.Json.dll") -Force
""
"== test_rec (fill / saida / reconciliacao / restart REAIS do staging, duas contas) =="
& $exe
$rc = $LASTEXITCODE
""
"TEST_REC: rc=$rc"
exit $rc
