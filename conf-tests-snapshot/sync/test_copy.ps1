# COPY test_copy 2026-10-05 — EXECUTA a peca pura REAL do Copy Engine (AlfaOmegaCopyEngineContas.cs do LIVE, somente leitura, fora do lote):
# AoCeInventario.Reconciliar + AoCePnl.Somar. Sem NT8, sem conta, sem ordem.
# Uso: .\test_copy.ps1
$ErrorActionPreference = 'Stop'
$NT  = "C:\Program Files\NinjaTrader 8\bin"
$LIV = "C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AddOns"
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
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
foreach ($r in @((Join-Path $fw "mscorlib.dll"), (Join-Path $fw "System.dll"), (Join-Path $fw "System.Core.dll"))) {
  $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)

$files = @((Join-Path $DIR "ProgramCopy.cs"), (Join-Path (Join-Path $DIR "staging/AddOns") "AlfaOmegaCopyEngineContas.cs"))
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $files) {
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([System.IO.File]::ReadAllText($f), $po, $f, $null))
  "fonte: " + $f + "  sha16=" + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower().Substring(0,16)
}
$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
$opt = $opt.WithMainTypeName("ProgramCopy")
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("CopyTest", $trees, $refs, $opt)
$exe = Join-Path $OUT "CopyTest.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
$fsOut = [System.IO.File]::Create($exe)
try { $res = $comp.Emit($fsOut) } finally { $fsOut.Dispose() }
if (-not $res.Success) {
  "--- ERROS DE COMPILACAO (CopyTest) ---"
  $res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 40 | ForEach-Object { "  " + $_.Id + " " + [System.IO.Path]::GetFileName($_.Location.SourceTree.FilePath) + ":" + ($_.Location.GetLineSpan().StartLinePosition.Line + 1) + " " + $_.GetMessage() }
  exit 2
}
""
"== test_copy (AoCeInventario.Reconciliar + AoCePnl.Somar REAIS do live) =="
& $exe
$rc = $LASTEXITCODE
""
"TEST_COPY: rc=$rc"
exit $rc
