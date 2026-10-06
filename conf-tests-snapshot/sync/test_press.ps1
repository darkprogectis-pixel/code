# P1S Press 2026-10-02 — PR1..PR4 (C#: AoPressSessao + AoTapeEngine do STAGING x AoTapeEngine do LIVE renomeado,
# fixture REAL do tick db) + PR5 (fiacao estrutural, node test_press_wiring.js). Sem NT8, sem conta, sem ordem.
# Uso: .\test_press.ps1            .\test_press.ps1 -SoCsharp
param([string]$Tag = "20260930", [switch]$SoCsharp)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUT = Join-Path $DIR "out"
$STGI = Join-Path $DIR "staging\Indicators\TTW_DarkProjects"
# (2026-10-05) base de comparacao = versao de 02/10 CONGELADA no backup (depois do deploy o live passa a ser == staging)
$ANTES = "C:\Users\ADM\AppData\Local\InvictusJevCode\fix-backups\account-p1s-20261005\before\Indicators\TTW_DarkProjects"
$LIVE  = Join-Path $ANTES "AoTapeEngine.cs"
$LIVEP = Join-Path $ANTES "AoPressSessao.cs"
$FX  = Join-Path $DIR "fixtures"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
if (-not (Test-Path (Join-Path $FX "press_ticks_$Tag.csv"))) { & node (Join-Path $DIR "gen_press_fixture.js"); if ($LASTEXITCODE -ne 0) { exit 2 } }
foreach ($f in @((Join-Path $STGI "AoPressSessao.cs"), (Join-Path $STGI "AoTapeEngine.cs"), $LIVE)) {
  "fonte: $f  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16) }

# controle negativo: AoTapeEngine do LIVE (somente leitura) renomeado p/ AoTapeEngineLive, sem o enum AoTick duplicado
$src = [System.IO.File]::ReadAllText($LIVE)
if ($src -notmatch 'public class AoTapeEngine\b' -or $src -notmatch 'public enum AoTick') { "LIVE com forma inesperada"; exit 2 }
$src = $src -replace 'public enum AoTick[^\r\n]*', '' -replace '\bclass AoTapeEngine\b', 'class AoTapeEngineAntes' -replace 'public AoTapeEngine\(', 'public AoTapeEngineAntes(' -replace '\bAoPressSessao\b', 'AoPressSessaoAntes'
$srcP = [System.IO.File]::ReadAllText($LIVEP)
if ($srcP -notmatch 'public class AoPressSessao\b' -or $srcP -match 'AoPressEstado') { "AoPressSessao de 02/10 com forma inesperada"; exit 2 }
$srcP = $srcP -replace '\bAoPressSessao\b', 'AoPressSessaoAntes'
$gen  = Join-Path $OUT "AoTapeEngineAntes.g.cs"
$genP = Join-Path $OUT "AoPressSessaoAntes.g.cs"
[System.IO.File]::WriteAllText($gen, $src)
[System.IO.File]::WriteAllText($genP, $srcP)

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
foreach ($f in @((Join-Path $DIR "ProgramPress.cs"), (Join-Path $STGI "AoPressSessao.cs"), (Join-Path $STGI "AoTapeEngine.cs"), $gen, $genP)) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null)) }
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("PressSim.ProgramPress").WithOptimizationLevel([Microsoft.CodeAnalysis.OptimizationLevel]::Release)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("PressTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "PressTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (PressTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 30 | ForEach-Object { "  $_" }
  exit 2
}
""
"== PR1..PR4 (C#) =="
& $exe $FX $Tag
$rcCs = $LASTEXITCODE
$rcW = 0
if (-not $SoCsharp) {
  ""
  "== PR5 (fiacao estrutural) =="
  & node (Join-Path $DIR "test_press_wiring.js")
  $rcW = $LASTEXITCODE
}
""
"TEST_PRESS: C#=" + $(if ($rcCs -eq 0) { "PASS" } else { "FAIL($rcCs)" }) + "  PR5=" + $(if ($SoCsharp) { "n/a" } elseif ($rcW -eq 0) { "PASS" } else { "FAIL($rcW)" })
exit ($rcCs + $rcW)
