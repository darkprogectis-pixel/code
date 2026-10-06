# P1S STARTUP NO MEIO DA SESSAO 2026-10-05 — P1S01..P1S12 (C#: AoPressSessao + AoTapeEngine do STAGING, fixture REAL do tick db).
# Sem NT8, sem conta, sem ordem. Uso: .\test_press_p1s.ps1
param([string]$Tag = "20260930")
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUT = Join-Path $DIR "out"
$STGI = Join-Path $DIR "staging\Indicators\TTW_DarkProjects"
$FX  = Join-Path $DIR "fixtures"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
if (-not (Test-Path (Join-Path $FX "press_ticks_$Tag.csv"))) { & node (Join-Path $DIR "gen_press_fixture.js"); if ($LASTEXITCODE -ne 0) { exit 2 } }
$fontes = @((Join-Path $DIR "ProgramPressP1S.cs"), (Join-Path $STGI "AoPressSessao.cs"), (Join-Path $STGI "AoTapeEngine.cs"))
foreach ($f in $fontes) { "fonte: $f  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16) }

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
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $fontes) { $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null)) }
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("PressSim.ProgramPressP1S").WithOptimizationLevel([Microsoft.CodeAnalysis.OptimizationLevel]::Release)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("PressP1STest", $trees, $refs, $opt)
$exe = Join-Path $OUT "PressP1STest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (PressP1STest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 30 | ForEach-Object { "  $_" }
  exit 2
}
""
"== P1S01..P1S12 (C#) =="
& $exe $FX $Tag
$rc = $LASTEXITCODE
""
"TEST_PRESS_P1S: " + $(if ($rc -eq 0) { "PASS" } else { "FAIL($rc)" })
exit $rc
