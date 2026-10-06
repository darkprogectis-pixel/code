# ACCOUNT-AGNOSTIC 2026-10-05 — EXECUTA AlfaOmegaRoboConfig.cs REAL (live, fora do lote; so leitura) + AlfaOmegaRoboAtivos.cs REAL do
# STAGING com nomes de conta arbitrarios (fixtures do ProgramAgnostic.cs). Stub so de Cbi.Account/Provider + audit (AgnosticStubs.cs).
# Sem NT8, sem conta, sem ordem. Uso: .\test_account_agnostic.ps1
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$LIV = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AddOns"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STG = Join-Path $DIR "staging\AddOns"
$OUT = Join-Path $DIR "out"
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
foreach ($r in @((Join-Path $fw "mscorlib.dll"), (Join-Path $fw "System.dll"), (Join-Path $fw "System.Core.dll"), (Join-Path $NT "Newtonsoft.Json.dll"))) {
  $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)

# (2026-10-06 UNIVERSAL) Config do STAGING por padrao (o fix D1/D2 esta nele); `-live` = MUTACAO: Config do live antigo (AG04/AG07/AG09/AG10 devem falhar).
$cfgReal = if ($args -contains '-live') { Join-Path $LIV "AlfaOmegaRoboConfig.cs" } else { Join-Path $STG "AlfaOmegaRoboConfig.cs" }
$atvReal = Join-Path $STG "AlfaOmegaRoboAtivos.cs"
$files = @((Join-Path $DIR "ProgramAgnostic.cs"), (Join-Path $DIR "AgnosticStubs.cs"), $cfgReal, $atvReal)
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $files) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
  "fonte: " + $f + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16)
}
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramAgnostic")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("AgnosticTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "AgnosticTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (AgnosticTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 60 | ForEach-Object { "  " + $_.Id + " " + [System.IO.Path]::GetFileName($_.Location.SourceTree.FilePath) + ":" + ($_.Location.GetLineSpan().StartLinePosition.Line + 1) + " " + $_.GetMessage() }
  exit 2
}
Copy-Item (Join-Path $NT "Newtonsoft.Json.dll") (Join-Path $OUT "Newtonsoft.Json.dll") -Force
""
"== test_account_agnostic (Config REAL " + $(if ($args -contains '-live') { "do LIVE (mutacao)" } else { "do staging" }) + " + Ativos REAL do staging, nomes arbitrarios) =="
& $exe $cfgReal $atvReal $STG
$rc = $LASTEXITCODE
""
"TEST_ACCOUNT_AGNOSTIC: rc=$rc"
exit $rc
