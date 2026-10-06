# invictus/exec v1 2026-10-02 — (1) C#: ProgramExec.cs X1–X12 sobre AoExecReport + G12 do STAGING (gera out\exec-fixture.jsonl)
# (2) JS: test_exec.js X1–X13 aplicando a fixture no aot-sim.js + bloco EXEC DE VOLTA do aot-bff.js (copias em .\aot). Sem NT8, sem conta, sem ordem.
# Uso: .\test_exec.ps1    (modelo: run_sync.ps1)
#      .\test_exec.ps1 -EventoAot <AlfaOmegaRoboEventoAot.cs> -SoCsharp   (controle contra outra fonte, ex.: backup anterior a um fix)
param([string]$EventoAot = "", [switch]$SoCsharp)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$CUS = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STG = Join-Path $DIR "staging\AddOns"
$OUT = Join-Path $DIR "out"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
if (-not $EventoAot) { $EventoAot = Join-Path $STG "AlfaOmegaRoboEventoAot.cs" }

$onResolve = [System.ResolveEventHandler]{
  param($snd, $e)
  try { $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name
        foreach ($d in @($NT, $CUS)) { $p = Join-Path $d ($n + ".dll"); if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) } } } catch {}
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

"== 1) C# · AoExecReport + G12 (STAGING) =="
$files = @((Join-Path $DIR "ProgramExec.cs"), $EventoAot, (Join-Path $STG "AlfaOmegaRoboFechamento.cs"),
           (Join-Path $STG "AlfaOmegaRoboMotor.cs"), (Join-Path $CUS "AddOns\AlfaOmegaRoboHistorico.cs"), (Join-Path $CUS "AddOns\AoJsonNum.cs"))
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $files) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
  "fonte: " + $f.Replace($DIR, '.') + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16)
}
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramExec")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("ExecTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "ExecTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (ExecTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 30 | ForEach-Object { "  $_" }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $OUT "Newtonsoft.Json.dll") -Force
& $exe $OUT
$rcCs = $LASTEXITCODE
if ($SoCsharp) { ""; "EXEC: C#=" + $(if ($rcCs -eq 0) { "PASS" } else { "FAIL($rcCs)" }) + "  JS=n/a"; exit $rcCs }

""
"== 2) JS · aot-sim.js + EXEC DE VOLTA do aot-bff.js (copias) =="
& node (Join-Path $DIR "test_exec.js") (Join-Path $OUT "exec-fixture.jsonl")
$rcJs = $LASTEXITCODE

""
"EXEC: C#=" + $(if ($rcCs -eq 0) { "PASS" } else { "FAIL($rcCs)" }) + "  JS=" + $(if ($rcJs -eq 0) { "PASS" } else { "FAIL($rcJs)" })
exit ($rcCs + $rcJs)
