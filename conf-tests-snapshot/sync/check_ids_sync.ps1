# (2026-10-02) Copia de ..\check_ids.ps1 para o build_sync: + System.Net.Http.dll (AlfaOmegaFlowOne usa HttpClient).
# O original em conf-tests\ NAO foi alterado.
$ErrorActionPreference = 'Stop'
$NT ="C:\Program Files\NinjaTrader 8\bin"
$CUS = "c:\Users\ADM\Documents\NinjaTrader 8\bin\Custom"

$onResolve = [System.ResolveEventHandler]{
  param($sender, $e)
  try {
    $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name
    foreach ($d in @($NT, $CUS)) {
      $p = Join-Path $d ($n + ".dll")
      if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) }
    }
  } catch {}
  return $null
}
[System.AppDomain]::CurrentDomain.add_AssemblyResolve($onResolve)
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.dll"))
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.CSharp.dll"))

$fw  = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$wpf = Join-Path $fw "WPF"

$refPaths = @(
  (Join-Path $fw "mscorlib.dll"), (Join-Path $fw "System.dll"), (Join-Path $fw "System.Core.dll"),
  (Join-Path $fw "System.Net.Http.dll"), (Join-Path $fw "System.Xml.dll"), (Join-Path $fw "System.Xml.Linq.dll"), (Join-Path $fw "System.Xaml.dll"),
  (Join-Path $fw "System.Drawing.dll"), (Join-Path $fw "System.Windows.Forms.dll"),
  (Join-Path $fw "System.ComponentModel.DataAnnotations.dll"),
  (Join-Path $wpf "PresentationCore.dll"), (Join-Path $wpf "PresentationFramework.dll"),
  (Join-Path $wpf "WindowsBase.dll"),
  (Join-Path $NT "SharpDX.dll"), (Join-Path $NT "SharpDX.Direct2D1.dll"),
  (Join-Path $NT "NinjaTrader.Core.dll"), (Join-Path $NT "NinjaTrader.Gui.dll"),
  (Join-Path $CUS "NinjaTrader.Custom.dll"), (Join-Path $NT "Newtonsoft.Json.dll")
) | Where-Object { Test-Path $_ }

"referencias: $($refPaths.Count)"
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in $refPaths) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }

$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion(
        [Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in $args) {
  $txt = [System.IO.File]::ReadAllText($f)
  $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText($txt, $po, $f, $null))
}

$opt = New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("AoRoboCheck", $trees, $refs, $opt)
$diag = $comp.GetDiagnostics()
$errs = @($diag | Where-Object { $_.Severity.ToString() -eq 'Error' })
# CS1701 e ruido do harness: as DLLs do NT8 linkam mscorlib 2.0. Nao vem do codigo.
$ruido = @($diag | Where-Object { $_.Severity.ToString() -eq 'Warning' -and $_.Id -eq 'CS1701' })
$warn  = @($diag | Where-Object { $_.Severity.ToString() -eq 'Warning' -and $_.Id -ne 'CS1701' })

""
"arquivos compilados:"
foreach ($f in $args) { "  - $([IO.Path]::GetFileName($f))" }
""
"RESULTADO: erros=$($errs.Count)  avisos=$($warn.Count)   (+$($ruido.Count) CS1701 do harness, ignorados)"
if ($errs.Count -gt 0) { "--- ERROS ---"; $errs | Select-Object -First 25 | ForEach-Object { "  $_" } }
if ($warn.Count -gt 0) { "--- IDS ---"; $warn | ForEach-Object { $_.Id } | Group-Object | ForEach-Object { "  " + $_.Name + " x" + $_.Count }; "--- NAO-CS0436 ---"; $warn | Where-Object { $_.Id -ne "CS0436" } | Select-Object -First 12 | ForEach-Object { "  $_" } }
if ($errs.Count -eq 0) { "*** COMPILA LIMPO ***" }
