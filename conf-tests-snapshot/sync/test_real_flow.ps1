# PROTECTION_MANDATORY test_real_flow 2026-10-02 — PM1–PM14, C1–C13, T2e sobre os metodos REAIS do AlfaOmegaRobo.cs (gen_real_flow_harness.js)
# + Fechamento/Saida/Motor da fonte escolhida + Protecao/Historico/AoJsonNum/Ativos do live (so leitura). Stub so do broker. Sem NT8, sem conta, sem ordem.
# Uso: .\test_real_flow.ps1              (STAGING)
#      .\test_real_flow.ps1 -Controle    (LIVE, somente leitura: PM4/PM5/PM10/PM12 devem FALHAR ou N/A)
param([switch]$Controle)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$CUS = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"
$LIV = Join-Path $CUS "AddOns"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STG = Join-Path $DIR "staging\AddOns"
$OUT = Join-Path $DIR "out"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
$SRC = $(if ($Controle) { $LIV } else { $STG })
$tag = $(if ($Controle) { "Controle" } else { "Staging" })

$gen = Join-Path $OUT ("RealFlowHarness." + $tag + ".g.cs")
& node (Join-Path $DIR "gen_real_flow_harness.js") (Join-Path $SRC "AlfaOmegaRobo.cs") (Join-Path $LIV "AlfaOmegaRoboAtivos.cs") $gen
if ($LASTEXITCODE -ne 0) { exit 2 }

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

$files = @((Join-Path $DIR "ProgramRealFlow.cs"), (Join-Path $DIR "RealFlowStubs.cs"), $gen,
           (Join-Path $SRC "AlfaOmegaRoboFechamento.cs"), (Join-Path $SRC "AlfaOmegaRoboSaida.cs"), (Join-Path $SRC "AoRoboGuard.cs"), (Join-Path $SRC "AlfaOmegaRoboMotor.cs"),
           (Join-Path $LIV "AlfaOmegaRoboProtecao.cs"), (Join-Path $LIV "AlfaOmegaRoboHistorico.cs"), (Join-Path $LIV "AoJsonNum.cs"))
# (2026-10-02, invictus/exec v1) AoExecReport vem do EventoAot da MESMA fonte — so quando o harness gerado o referencia (o live-controle nao tem)
if ((Get-Content $gen -Raw) -match "AoExecReport") { $files += (Join-Path $SRC "AlfaOmegaRoboEventoAot.cs") }
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $files) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
  "fonte: " + $f + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16)
}
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramRealFlow")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("RealFlow" + $tag, $trees, $refs, $opt)
$exe = Join-Path $OUT ("RealFlow" + $tag + ".exe")
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (RealFlow$tag) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 40 | ForEach-Object { "  $_" }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $OUT "Newtonsoft.Json.dll") -Force
""
"== test_real_flow ($tag) =="
if ($Controle) { & $exe controle } else { & $exe }
$rc = $LASTEXITCODE
""
"REAL_FLOW($tag): rc=$rc"
exit $rc
