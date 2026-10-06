# SYNC TOTAL 2026-10-01 — (1) JS: test_sync.js  (2) C#: ProgramSync.cs + pecas puras do STAGING
# (3) regressao: ..\estrutural\ProgramEstrutural.cs (+ test_fonte.js) recompilado contra o STAGING. Sem NT8, sem conta, sem ordem.
# Uso: .\run_sync.ps1    (modelo: ..\estrutural\run_estrutural.ps1)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$CUS = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STG = Join-Path $DIR "staging\AddOns"
$EST = Join-Path (Split-Path -Parent $DIR) "estrutural"
$OUT = Join-Path $DIR "out"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }

"== 1) JS · aot-sim.js + EVENTO CANONICO do aot-bff.js =="
& node (Join-Path $DIR "test_sync.js")
$rcJs = $LASTEXITCODE

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
$refPaths = @((Join-Path $fw "mscorlib.dll"), (Join-Path $fw "System.dll"), (Join-Path $fw "System.Core.dll"), (Join-Path $NT "Newtonsoft.Json.dll")) | Where-Object { Test-Path $_ }
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in $refPaths) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)

function Compilar($nome, $files, $exeDir) {
  $trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
  foreach ($f in $files) {
    $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
    Write-Host ("fonte: " + $f.Replace($DIR, '.') + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16))
  }
  $opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
  $comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create($nome, $trees, $refs, $opt)
  $exe = Join-Path $exeDir ($nome + ".exe")
  if (Test-Path $exe) { Remove-Item $exe -Force }
  $fsOut = [System.IO.File]::Create($exe)
  try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
  if (-not $res.Success) {
    Write-Host "--- ERROS DE COMPILACAO ($nome) ---"
    $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 30 | ForEach-Object { Write-Host "  $_" }
    return $null
  }
  Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $exeDir "Newtonsoft.Json.dll") -Force
  return $exe
}

""
"== 2) C# · consumidor + motor seguidor + correlacao (STAGING) =="
$pecas = @((Join-Path $STG "AlfaOmegaRoboMotor.cs"), (Join-Path $STG "AlfaOmegaRoboFechamento.cs"),
           (Join-Path $CUS "AddOns\AlfaOmegaRoboHistorico.cs"), (Join-Path $CUS "AddOns\AoJsonNum.cs"))
$exeS = Compilar "SyncTest" (@((Join-Path $DIR "ProgramSync.cs"), (Join-Path $STG "AlfaOmegaRoboEventoAot.cs")) + $pecas) $DIR
$rcCs = 1; if ($exeS) { & $exeS $OUT; $rcCs = $LASTEXITCODE }

""
"== 3) REGRESSAO ESTRUTURAL (ProgramEstrutural.cs contra o STAGING) =="
$OUTE = Join-Path $OUT "estrutural"; if (-not (Test-Path $OUTE)) { New-Item -ItemType Directory -Path $OUTE | Out-Null }
$exeE = Compilar "EstruturalSobreStaging" (@((Join-Path $EST "ProgramEstrutural.cs")) + $pecas) $DIR
$rcE = 1; if ($exeE) { & $exeE $OUTE; $rcE = $LASTEXITCODE }
& node (Join-Path $EST "test_fonte.js")
$rcD = $LASTEXITCODE

""
"JS rc=$rcJs - C# sync rc=$rcCs - estrutural rc=$rcE - fonte rc=$rcD"
if ($rcJs -ne 0 -or $rcCs -ne 0 -or $rcE -ne 0 -or $rcD -ne 0) { exit 1 }
exit 0
