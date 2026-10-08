# Oraculo de compilacao NT8 (Roslyn do proprio NT8, em memoria, sem Emit) â€” variante JSON.
# Mesmo conjunto de refs do compile.ps1 da 0bed206c; grava erros + tipos top-level declarados por arquivo.
param([Parameter(Mandatory)][string]$Tree, [Parameter(Mandatory)][string]$Out, [switch]$Types)
$ErrorActionPreference = 'Stop'
$NT = "C:\Users\ADM\AppData\Local\Temp\claude\C--Users-ADM-Claude-JEV-code\055414e1-6c3e-41eb-a017-35d059c35544\scratchpad\nt8_official_8182\PFiles64\NinjaTrader 8\bin"   # bin OFICIAL extraido
[System.AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler]{ param($s, $e)
  try { $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name; $p = Join-Path $NT ($n + ".dll"); if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) } } catch {}
  return $null })
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.dll"))
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.CSharp.dll"))
$fw = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory(); $wpf = Join-Path $fw "WPF"
$nw = Join-Path $Tree "Newtonsoft.Json.dll"
$rp = @('mscorlib','System','System.Core','System.Net.Http','System.Xml','System.Xml.Linq','System.Xaml','System.Drawing','System.Windows.Forms','System.ComponentModel.DataAnnotations','System.Data','System.Runtime.Serialization','System.Web','System.Web.Extensions','Microsoft.CSharp','System.Numerics','System.ServiceModel') | ForEach-Object { Join-Path $fw "$_.dll" }
$rp += @('PresentationCore','PresentationFramework','WindowsBase','UIAutomationProvider','UIAutomationTypes') | ForEach-Object { Join-Path $wpf "$_.dll" }
$rp += @('SharpDX','SharpDX.Direct2D1','SharpDX.DXGI','SharpDX.DirectWrite','NinjaTrader.Core','NinjaTrader.Gui','InfragisticsWPF.DataPresenter','Infralution.Localization.Wpf','ActiproSoftware.Controls.WPF.SyntaxEditor.Addons.DotNet','System.ComponentModel.Annotations','UIAutomationProvider','UIAutomationTypes') | ForEach-Object { Join-Path $NT "$_.dll" }
if (Test-Path $nw) { $rp += $nw }
$rp = $rp | Where-Object { Test-Path $_ }
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
$src = Get-ChildItem -Recurse -File $Tree -Filter *.cs
foreach ($f in $src) { $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($f.FullName), $po, $f.FullName.Substring($Tree.Length + 1).Replace('\','/'), $null)) }
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in $rp) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$opt = (New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary)).WithAllowUnsafe($true)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("NinjaTrader.Custom", $trees, $refs, $opt)
$errs = @($comp.GetDiagnostics() | Where-Object { $_.Severity.ToString() -eq 'Error' })
$el = New-Object System.Collections.ArrayList
foreach ($e in $errs) {
  $fp = ''; $ln = 0; if ($e.Location.SourceTree) { $fp = $e.Location.SourceTree.FilePath; $ln = $e.Location.GetLineSpan().StartLinePosition.Line + 1 }
  $ax = @($e.AdditionalLocations | Where-Object { $_.SourceTree } | ForEach-Object { $_.SourceTree.FilePath })
  [void]$el.Add([ordered]@{ id = $e.Id; file = $fp; line = $ln; also = $ax; msg = $e.GetMessage() })
}
$ty = [ordered]@{}
if ($Types) {
  foreach ($t in $trees) {
    $l = New-Object System.Collections.ArrayList
    foreach ($n in $t.GetRoot().DescendantNodes()) {
      if ($n -is [Microsoft.CodeAnalysis.CSharp.Syntax.BaseTypeDeclarationSyntax]) {
        $p = $n.Parent; $ns = ''
        if ($p -is [Microsoft.CodeAnalysis.CSharp.Syntax.NamespaceDeclarationSyntax]) { $ns = $p.Name.ToString() } elseif (-not ($p -is [Microsoft.CodeAnalysis.CSharp.Syntax.CompilationUnitSyntax])) { continue }
        $partial = ($n.Modifiers | Where-Object { $_.Text -eq 'partial' }).Count -gt 0
        [void]$l.Add(($ns + '.' + $n.Identifier.Text) + $(if ($partial) { '|partial' } else { '' }))
      }
    }
    $ty[$t.FilePath] = $l
  }
}
$o = [ordered]@{ cs = $src.Count; newtonsoft = (Test-Path $nw); errors = $errs.Count; list = $el; types = $ty }
[IO.File]::WriteAllText($Out, ($o | ConvertTo-Json -Depth 6 -Compress))
"COMPILE cs=$($src.Count) newtonsoft=$(Test-Path $nw) erros=$($errs.Count)"
