# Harness da camada de saida sobre o ASSEMBLY COMPLETO: compila os 464 itens do csproj da arvore (-Tree) com o Roslyn do bin OFICIAL extraido
# (Program Files nunca carregado), emite em memoria, compila o ExitDriver.cs contra esse assembly e executa ExitDriver.Run().
# -Define STAGING para a arvore corrigida (API nova); vazio para a arvore base (codigo instalado).
param([Parameter(Mandatory)][string]$Tree, [Parameter(Mandatory)][string]$Driver, [Parameter(Mandatory)][string]$OfficialBin, [Parameter(Mandatory)][string]$Out, [string]$Define = '', [string]$TmpDir = $env:TEMP)
$ErrorActionPreference = 'Stop'
$NT = $OfficialBin
[System.AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler]{ param($s, $e)
  try { $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name; $p = Join-Path $NT ($n + ".dll"); if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) } } catch {}
  return $null })
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.dll"))
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.CSharp.dll"))
[xml]$pj = Get-Content -Raw (Join-Path $Tree "NinjaTrader.Custom.csproj")
$ns = New-Object System.Xml.XmlNamespaceManager($pj.NameTable); $ns.AddNamespace('m', $pj.DocumentElement.NamespaceURI)
$items = @($pj.SelectNodes("//m:Compile", $ns) | ForEach-Object { [Uri]::UnescapeDataString($_.Include) })
$fw = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$rp = @()
foreach ($r in $pj.SelectNodes('//m:Reference', $ns)) {
  $h = $r.HintPath; $name = ($r.Include -split ',')[0]
  if ($h) {
    if ($h -like 'C:\Program Files\NinjaTrader 8\bin\*') { $h = Join-Path $NT (Split-Path $h -Leaf) }
    elseif ($h -like 'C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\*') { $h = Join-Path $Tree (Split-Path $h -Leaf) }
  } else { $h = Join-Path $fw "$name.dll"; if (-not (Test-Path $h)) { $h = Join-Path (Join-Path $fw 'WPF') "$name.dll" } }
  $rp += $h
}
$rp += @('System.Drawing','System.Data','System.Runtime.Serialization','System.Web','System.Numerics','System.ServiceModel','System.ComponentModel.DataAnnotations') | ForEach-Object { Join-Path $fw "$_.dll" }
$rp += @('SharpDX.DXGI','SharpDX.DirectWrite','ActiproSoftware.Controls.WPF.SyntaxEditor.Addons.DotNet','System.ComponentModel.Annotations','UIAutomationTypes') | ForEach-Object { Join-Path $NT "$_.dll" }
$rp += Join-Path (Join-Path $fw 'WPF') 'UIAutomationTypes.dll'
$rp = @($rp | Where-Object { Test-Path $_ } | Select-Object -Unique)
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
$missing = 0
foreach ($i in $items) { $f = Join-Path $Tree $i; if (-not (Test-Path -LiteralPath $f)) { $missing++; continue }; $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($f), $po, $i, $null)) }
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in $rp) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$opt = (New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary)).WithAllowUnsafe($true)
$asmName = "AoCustomHarness" + [guid]::NewGuid().ToString('N').Substring(0, 8)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create($asmName, $trees, $refs, $opt)
$ms = New-Object System.IO.MemoryStream
$res = $comp.Emit($ms)
if (-not $res.Success) { $e = @($res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 15 | ForEach-Object { $_.ToString() }); "TREE_COMPILE_ERROR"; $e | ForEach-Object { $_.Substring(0, [Math]::Min(240, $_.Length)) }; exit 2 }
$img = $ms.ToArray()
# driver contra o assembly emitido
$po2 = $po; if ($Define) { $po2 = $po.WithPreprocessorSymbols([string[]]($Define -split ',')) }
$dt = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
$dt.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($Driver), $po2, $Driver, $null))
$refs2 = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in @('mscorlib','System','System.Core','Microsoft.CSharp')) { $refs2.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile((Join-Path $fw "$r.dll"))) }
$refs2.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile((Join-Path $NT 'Newtonsoft.Json.dll')))
$refs2.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromImage($img))
$comp2 = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("D" + [guid]::NewGuid().ToString('N').Substring(0, 8), $dt, $refs2, (New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary)))
$ms2 = New-Object System.IO.MemoryStream
$res2 = $comp2.Emit($ms2)
if (-not $res2.Success) { $e = @($res2.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 25 | ForEach-Object { $_.ToString() }); "DRIVER_COMPILE_ERROR"; $e | ForEach-Object { $_.Substring([Math]::Max(0, $_.IndexOf('): ') ), [Math]::Min(230, $_.Length - [Math]::Max(0, $_.IndexOf('): ')))) }; exit 3 }
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT 'Newtonsoft.Json.dll'))
$custom = [System.Reflection.Assembly]::Load($img)
[System.AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler]{ param($s, $e) if ((New-Object System.Reflection.AssemblyName($e.Name)).Name -eq $asmName) { return $custom }; return $null })
$drv = [System.Reflection.Assembly]::Load($ms2.ToArray())
$env:EXIT_TMP = $TmpDir
$json = $drv.GetType('ExitDriver').GetMethod('Run').Invoke($null, $null)
$pf = @([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.Location -like 'C:\Program Files\NinjaTrader 8\*' }).Count
[IO.File]::WriteAllText($Out, $json); "OK items=$($items.Count) parsed=$($trees.Count) missingSrc=$missing pfModules=$pf define=$Define"
