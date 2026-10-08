# Variante do harness\run_exit_full.ps1 para arvores SEM csproj (sandbox = stock NT8 + import do pack): compila TODOS os .cs da arvore
# com as mesmas referencias do compile2 (bin OFICIAL extraido; Program Files nunca carregado), emite em memoria, compila o ExitDriver.cs
# contra o assembly e executa ExitDriver.Run(). -Define STAGING | STAGING,RIG.
param([Parameter(Mandatory)][string]$Tree, [Parameter(Mandatory)][string]$Driver, [Parameter(Mandatory)][string]$OfficialBin, [Parameter(Mandatory)][string]$Out, [string]$Define = '', [string]$TmpDir = $env:TEMP)
$ErrorActionPreference = 'Stop'
$NT = $OfficialBin
[System.AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler]{ param($s, $e)
  try { $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name; $p = Join-Path $NT ($n + ".dll"); if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) } } catch {}
  return $null })
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.dll"))
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.CSharp.dll"))
$fw = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory(); $wpf = Join-Path $fw "WPF"
$nw = Join-Path $Tree "Newtonsoft.Json.dll"
$rp = @('mscorlib','System','System.Core','System.Net.Http','System.Xml','System.Xml.Linq','System.Xaml','System.Drawing','System.Windows.Forms','System.ComponentModel.DataAnnotations','System.Data','System.Runtime.Serialization','System.Web','System.Web.Extensions','Microsoft.CSharp','System.Numerics','System.ServiceModel') | ForEach-Object { Join-Path $fw "$_.dll" }
$rp += @('PresentationCore','PresentationFramework','WindowsBase','UIAutomationProvider','UIAutomationTypes') | ForEach-Object { Join-Path $wpf "$_.dll" }
$rp += @('SharpDX','SharpDX.Direct2D1','SharpDX.DXGI','SharpDX.DirectWrite','NinjaTrader.Core','NinjaTrader.Gui','InfragisticsWPF.DataPresenter','Infralution.Localization.Wpf','ActiproSoftware.Controls.WPF.SyntaxEditor.Addons.DotNet','System.ComponentModel.Annotations') | ForEach-Object { Join-Path $NT "$_.dll" }
if (Test-Path $nw) { $rp += $nw } else { $rp += (Join-Path $NT 'Newtonsoft.Json.dll') }
$rp = @($rp | Where-Object { Test-Path $_ } | Select-Object -Unique)
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
$src = @(Get-ChildItem -Recurse -File $Tree -Filter *.cs)
foreach ($f in $src) { $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($f.FullName), $po, $f.FullName.Substring($Tree.Length + 1), $null)) }
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in $rp) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($r)) }
$opt = (New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary)).WithAllowUnsafe($true)
$asmName = "AoCustomHarness" + [guid]::NewGuid().ToString('N').Substring(0, 8)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create($asmName, $trees, $refs, $opt)
$ms = New-Object System.IO.MemoryStream
$res = $comp.Emit($ms)
if (-not $res.Success) { $e = @($res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 12 | ForEach-Object { $_.ToString() }); "TREE_COMPILE_ERROR"; $e | ForEach-Object { $_.Substring(0, [Math]::Min(240, $_.Length)) }; exit 2 }
$img = $ms.ToArray()
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
if (-not $res2.Success) { $e = @($res2.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 12 | ForEach-Object { $_.ToString() }); "DRIVER_COMPILE_ERROR"; $e | ForEach-Object { $_.Substring(0, [Math]::Min(240, $_.Length)) }; exit 3 }
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT 'Newtonsoft.Json.dll'))
$custom = [System.Reflection.Assembly]::Load($img)
[System.AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler]{ param($s, $e) if ((New-Object System.Reflection.AssemblyName($e.Name)).Name -eq $asmName) { return $custom }; return $null })
$drv = [System.Reflection.Assembly]::Load($ms2.ToArray())
$env:EXIT_TMP = $TmpDir
$json = $drv.GetType('ExitDriver').GetMethod('Run').Invoke($null, $null)
$pf = @([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.Location -like 'C:\Program Files\NinjaTrader 8\*' }).Count
[IO.File]::WriteAllText($Out, $json); "OK cs=$($src.Count) pfModules=$pf define=$Define"
