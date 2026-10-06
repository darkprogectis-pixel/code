# ACCOUNT BINDING 2026-10-05 — ACC/POS/EXEC/COPY. (1) C#: AlfaOmegaRoboAtivos.cs REAL do STAGING + stubs de config/audit
# (ProgramAccount.cs); (2) node test_account.js: fiacao estrutural de Robo/OrderWatch/Gates/Positions/Trader/CopyEngine.
# Sem NT8, sem conta, sem ordem. Uso: .\test_account.ps1      .\test_account.ps1 -SoCsharp
param([switch]$SoCsharp)
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUT = Join-Path $DIR "out"
$ATV = Join-Path $DIR "staging\AddOns\AlfaOmegaRoboAtivos.cs"
if (-not (Test-Path $OUT)) { New-Item -ItemType Directory -Path $OUT | Out-Null }
"fonte: $ATV  sha16=" + (Get-FileHash $ATV -Algorithm SHA256).Hash.ToLower().Substring(0,16)

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
foreach ($f in @((Join-Path $DIR "ProgramAccount.cs"), $ATV)) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null)) }
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("AccountSim.ProgramAccount")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("AccountTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "AccountTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (AccountTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 30 | ForEach-Object { "  $_" }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") $OUT -Force
""
"== ACC (C#, AoRoboAtivos real) =="
& $exe
$rcCs = $LASTEXITCODE
$rcW = 0
if (-not $SoCsharp) {
  ""
  "== ACC/POS/EXEC/COPY (fiacao estrutural) =="
  & node (Join-Path $DIR "test_account.js")
  $rcW = $LASTEXITCODE
}
""
"TEST_ACCOUNT: C#=" + $(if ($rcCs -eq 0) { "PASS" } else { "FAIL($rcCs)" }) + "  estrutural=" + $(if ($SoCsharp) { "n/a" } elseif ($rcW -eq 0) { "PASS" } else { "FAIL($rcW)" })
exit ($rcCs + $rcW)
