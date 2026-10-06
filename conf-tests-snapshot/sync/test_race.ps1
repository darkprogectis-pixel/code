# RACE_EXECUCOES 2026-10-01 — T1/T2 (C#, metodos reais extraidos do STAGING) + T3 (estrutural, node). Sem NT8, sem conta, sem ordem.
# Uso: .\test_race.ps1                      (staging)
#      .\test_race.ps1 -Fonte <AlfaOmegaRobo.cs> -SoCsharp   (controle contra outra fonte, ex.: backup anterior ao fix)
param([string]$Fonte = "", [int]$N = 600, [switch]$SoCsharp)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUT = Join-Path $DIR "out"
if (-not $Fonte) { $Fonte = Join-Path $DIR "staging\AddOns\AlfaOmegaRobo.cs" }
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
"fonte: $Fonte  sha16=" + (Get-FileHash $Fonte -Algorithm SHA256).Hash.ToLower().Substring(0,16)

$gen = Join-Path $OUT "RaceHarness.g.cs"
& node (Join-Path $DIR "gen_race_harness.js") $Fonte $gen
if ($LASTEXITCODE -ne 0) { exit 2 }

$CUS = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"
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
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in @((Join-Path $DIR "ProgramRace.cs"), $gen)) { $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null)) }
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("RaceSim.ProgramRace")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("RaceTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "RaceTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (RaceTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 30 | ForEach-Object { "  $_" }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $OUT "Newtonsoft.Json.dll") -Force
""
"== T1/T2 (C#) =="
& $exe $N
$rcCs = $LASTEXITCODE
$rcT3 = 0
if (-not $SoCsharp) {
  ""
  "== T3 (estrutural) =="
  & node (Join-Path $DIR "test_race_estrutural.js") $Fonte
  $rcT3 = $LASTEXITCODE
}
""
"RACE: C#=" + $(if ($rcCs -eq 0) { "PASS" } else { "FAIL($rcCs)" }) + "  T3=" + $(if ($SoCsharp) { "n/a" } elseif ($rcT3 -eq 0) { "PASS" } else { "FAIL($rcT3)" })
exit ($rcCs + $rcT3)
