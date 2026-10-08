# Compila (Roslyn do bin OFICIAL extraido; Program Files nunca carregado) as fontes REAIS do staging + Z30Driver.cs e executa Z30Driver.Run().
# Uso: -Tree <arvore com o staging aplicado> -Driver <Z30Driver.cs> -NT <bin oficial> -Dir <pasta dos ticks/saidas> -Out <json>
param([Parameter(Mandatory)][string]$Tree, [Parameter(Mandatory)][string]$Driver, [Parameter(Mandatory)][string]$NT, [Parameter(Mandatory)][string]$Dir, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
[System.AppDomain]::CurrentDomain.add_AssemblyResolve([System.ResolveEventHandler]{ param($s, $e)
  try { $n = (New-Object System.Reflection.AssemblyName($e.Name)).Name; $p = Join-Path $NT ($n + ".dll"); if (Test-Path $p) { return [System.Reflection.Assembly]::LoadFrom($p) } } catch {}
  return $null })
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.dll"))
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT "Microsoft.CodeAnalysis.CSharp.dll"))
$fw = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::Latest)
$src = @('Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs', 'Indicators\TTW_DarkProjects\AoTapeEngine.cs', 'Indicators\TTW_DarkProjects\AoPressSessao.cs', 'AddOns\AlfaOmegaRoboMotor.cs') | ForEach-Object { Join-Path $Tree $_ }
$trees = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.SyntaxTree]'
foreach ($f in @($src + $Driver)) { $trees.Add([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($f), $po, $f, $null)) }
$refs = New-Object 'System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]'
foreach ($r in @('mscorlib','System','System.Core','Microsoft.CSharp','WindowsBase','PresentationCore','PresentationFramework','System.Xaml')) { $p = Join-Path $fw "$r.dll"; if (-not (Test-Path $p)) { $p = Join-Path "$fw\WPF" "$r.dll" }; if (Test-Path $p) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($p)) } }
foreach ($r in @('Newtonsoft.Json','NinjaTrader.Core','NinjaTrader.Gui','NinjaTrader.Custom')) { $p = Join-Path $NT "$r.dll"; if (Test-Path $p) { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($p)) } }
$opt = (New-Object Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions ([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary)).WithOptimizationLevel([Microsoft.CodeAnalysis.OptimizationLevel]::Release)
$comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("H" + [guid]::NewGuid().ToString('N'), $trees, $refs, $opt)
$ms = New-Object System.IO.MemoryStream
$res = $comp.Emit($ms)
if (-not $res.Success) { $e = @($res.Diagnostics | Where-Object { $_.Severity.ToString() -eq 'Error' } | Select-Object -First 15 | ForEach-Object { $_.ToString() }); [IO.File]::WriteAllText($Out, (@{ compile_error = $e } | ConvertTo-Json -Compress)); "COMPILE_ERROR"; $e; exit 2 }
$null = [System.Reflection.Assembly]::LoadFrom((Join-Path $NT 'Newtonsoft.Json.dll'))
$asm = [System.Reflection.Assembly]::Load($ms.ToArray())
$env:Z30_DIR = $Dir
$sw = [Diagnostics.Stopwatch]::StartNew()
$json = $asm.GetType('Z30Driver').GetMethod('Run').Invoke($null, $null)
$pf = @([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.Location -like 'C:\Program Files\NinjaTrader 8\*' }).Count
[IO.File]::WriteAllText($Out, $json); "OK Z30Driver pfModules=$pf seconds=$([int]$sw.Elapsed.TotalSeconds) $json"
