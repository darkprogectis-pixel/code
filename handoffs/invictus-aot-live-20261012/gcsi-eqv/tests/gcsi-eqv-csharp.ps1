# Teste do candidato GC/SI = ES/NQ (fora do NT8): carrega o NinjaTrader.Custom do shadow compile gcsi-eqv e exercita
# AoGate.GcSi (4 passos), a publicacao da forca GC/SI pelo publicador nativo e o anchorGcSi da ponte. Dados SINTETICOS
# (fixture, nao e dado real). Nada e escrito no NT8, nenhuma assinatura e feita. Exit 0 = PASS.
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP 'gcsi-eqv-shadow-compile'
$nt = 'C:\Program Files\NinjaTrader 8\bin'
$custom = Join-Path $env:USERPROFILE 'Documents\NinjaTrader 8\bin\Custom'
$script:fail = 0; $script:n = 0
function Check($name, $cond, $detail) { $script:n++; if ($cond) { Write-Output "PASS $name" } else { $script:fail++; Write-Output "FAIL $name :: $detail" } }

[AppDomain]::CurrentDomain.add_AssemblyResolve({ param($s, $e)
  $n = (New-Object Reflection.AssemblyName $e.Name).Name
  foreach ($d in @($nt, $custom)) { $p = Join-Path $d ($n + '.dll'); if (($n -ne 'NinjaTrader.Custom') -and (Test-Path $p)) { return [Reflection.Assembly]::LoadFrom($p) } }
  return $null })

$A = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $root 'candidate\bin\Release\NinjaTrader.Custom.dll')))
$B = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $root 'baseline\bin\Release\NinjaTrader.Custom.dll')))
$ss = $A.GetType('NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState', $true)
$gate = $A.GetType('NinjaTrader.NinjaScript.Indicators.AoGate', $true)
$fj = $A.GetType('NinjaTrader.NinjaScript.Indicators.AoForcaJanela', $true)
$pub = $A.GetType('NinjaTrader.NinjaScript.AddOns.AoGcSiNativePublisher', $true)
$gen = $A.GetType('NinjaTrader.NinjaScript.AddOns.AoGcSiGen', $true)
$br = $A.GetType('NinjaTrader.NinjaScript.AddOns.AlfaOmegaBridge', $true)
$tk = $A.GetType('NinjaTrader.NinjaScript.Indicators.AoTick', $true)
$Last = [Enum]::Parse($tk, 'Last'); $Bid = [Enum]::Parse($tk, 'Bid'); $Ask = [Enum]::Parse($tk, 'Ask')
$NP = [Reflection.BindingFlags]'NonPublic,Static'

Check 'T00 baseline NAO tem AoGate.GcSi; candidato tem' (($null -eq $B.GetType('NinjaTrader.NinjaScript.Indicators.AoGate').GetMethod('GcSi', [Type[]]@())) -and ($null -ne $gate.GetMethod('GcSi', [Type[]]@()))) ''

function S($name, $v) { $ss.GetProperty($name).SetValue($null, $v, $null) }
function G($name) { $ss.GetProperty($name).GetValue($null, $null) }
function GcSi($now) { $gate.GetMethod('GcSi', [Type[]]@([double], [DateTime])).Invoke($null, @([double]90, [DateTime]$now)) }
# janela de forca coberta (1900 s de negocios) com lado fixo (forte) ou alternado (fraca)
function Janela($side, $alternado, $now) {
  $f = [Activator]::CreateInstance($fj)
  for ($i = 1900; $i -ge 0; $i--) { $sd = if ($alternado) { if ($i % 2) { 1 } else { -1 } } else { $side }; $f.Tick([int]$sd, [long]1, $now.AddSeconds(-$i)) }
  $f.MarcarLocal($now); return $f }
function Legs($gcMe, $gcMvi, $siMe, $siMvi, $now) {
  S 'MeDirection_GC' ([int]$gcMe); S 'MviDirection_GC' ([int]$gcMvi); S 'MeDirection_SI' ([int]$siMe); S 'MviDirection_SI' ([int]$siMvi)
  S 'LastUpdate_GC' ([DateTime]$now); S 'LastUpdate_SI' ([DateTime]$now) }

$now = [DateTime]::Now
# ES/NQ: estado de referencia para provar que o EsNq nao muda
S 'MeDirection_ES' ([int]1); S 'MviDirection_ES' ([int]1); S 'MeDirection_NQ' ([int]1); S 'MviDirection_NQ' ([int]1)
S 'LastUpdate_ES' ([DateTime]$now); S 'LastUpdate_NQ' ([DateTime]$now)
$esNqAntes = $gate.GetMethod('EsNq', [Type[]]@([double], [double], [DateTime])).Invoke($null, @([double]0.03, [double]90, [DateTime]$now))

# 1) sem tape
S 'LastUpdate_GC' ([DateTime]::MinValue); S 'LastUpdate_SI' ([DateTime]::MinValue)
$r = GcSi $now; Check 'T01 sem tape => NEUTRO "sem tape GC/SI"' ((-not $r.Ok) -and $r.Dir -eq 0 -and $r.Why -eq 'sem tape GC/SI') "$($r.Why)"
# 2) indefinido
Legs 1 -1 1 1 $now; $r = GcSi $now; Check 'T02 GC ME!=MVI => "GC indefinido"' ((-not $r.Ok) -and $r.Why -eq 'GC indefinido') "$($r.Why)"
# 3) divergentes
Legs 1 1 -1 -1 $now; $r = GcSi $now; Check 'T03 GC LONG x SI SHORT => "GC x SI divergentes"' ((-not $r.Ok) -and $r.Why -eq 'GC x SI divergentes') "$($r.Why)"
# 4a) 4/4 sem publicador de forca
Legs 1 1 1 1 $now; S 'Forca_GC' $null; S 'Forca_SI' $null
$r = GcSi $now; Check 'T04 4/4 LONG sem forca publicada => NEUTRO "forca fraca GC/SI", strength 4' ((-not $r.Ok) -and $r.Dir -eq 0 -and $r.Strength -eq 4 -and $r.Why -eq 'forca fraca GC/SI') "$($r.Ok) $($r.Dir) $($r.Strength) $($r.Why)"
# 4b) 4/4 com forca FRACA (fluxo alternado, z ~ 0) — exemplo obrigatorio do operador
S 'Forca_GC' (Janela 1 $true $now); S 'Forca_SI' (Janela 1 $true $now)
$r = GcSi $now; Check 'T05 4/4 LONG + forca fraca => ESPERANDO CONFIRMACAO (Ok=false, dir 0)' ((-not $r.Ok) -and $r.Dir -eq 0 -and $r.Strength -eq 4 -and $r.Why -eq 'forca fraca GC/SI') "$($r.Why)"
# 4c) so GC forte
S 'Forca_GC' (Janela 1 $false $now)
$r = GcSi $now; Check 'T06 GC forte, SI fraca => "forca fraca SI"' ((-not $r.Ok) -and $r.Why -eq 'forca fraca SI') "$($r.Why)"
# 4d) forca contra a direcao
S 'Forca_SI' (Janela -1 $false $now)
$r = GcSi $now; Check 'T07 SI com z contra a direcao => "forca fraca SI"' ((-not $r.Ok) -and $r.Why -eq 'forca fraca SI') "$($r.Why)"
# 5) aprovado LONG e SHORT
S 'Forca_SI' (Janela 1 $false $now)
$r = GcSi $now; Check 'T08 4/4 LONG + forca nos dois => Ok, dir +1' ($r.Ok -and $r.Dir -eq 1 -and $r.Why -eq '') "$($r.Why)"
Legs -1 -1 -1 -1 $now; S 'Forca_GC' (Janela -1 $false $now); S 'Forca_SI' (Janela -1 $false $now)
$r = GcSi $now; Check 'T09 4/4 SHORT + forca nos dois => Ok, dir -1' ($r.Ok -and $r.Dir -eq -1) "$($r.Why)"
# janela nao coberta (< 30 min de cobertura) => reprova
$f = [Activator]::CreateInstance($fj); for ($i = 600; $i -ge 0; $i--) { $f.Tick([int]-1, [long]1, $now.AddSeconds(-$i)) }; $f.MarcarLocal($now); S 'Forca_GC' $f
$r = GcSi $now; Check 'T10 janela GC nao coberta (10 min) => "forca fraca GC"' ((-not $r.Ok) -and $r.Why -eq 'forca fraca GC') "$($r.Why)"
# WhyEhInfra classifica igual ao ES/NQ
$infra = $gate.GetMethod('WhyEhInfra')
Check 'T11 WhyEhInfra: sem tape/indefinido = INFRA; divergentes/forca = MERCADO' (($infra.Invoke($null, @('sem tape GC'))) -and ($infra.Invoke($null, @('SI indefinido'))) -and -not ($infra.Invoke($null, @('GC x SI divergentes'))) -and -not ($infra.Invoke($null, @('forca fraca GC/SI')))) ''
# EsNq inalterado pelas chamadas GC/SI
$esNqDepois = $gate.GetMethod('EsNq', [Type[]]@([double], [double], [DateTime])).Invoke($null, @([double]0.03, [double]90, [DateTime]$now))
Check 'T12 EsNq identico antes/depois (GC/SI nao interfere)' ($esNqAntes.Ok -eq $esNqDepois.Ok -and $esNqAntes.Dir -eq $esNqDepois.Dir -and $esNqAntes.Why -eq $esNqDepois.Why -and $esNqAntes.Strength -eq $esNqDepois.Strength) "$($esNqAntes.Why) / $($esNqDepois.Why)"

# Publicador nativo: negocio (Last) publica Forca_GC; cotacao nao
S 'Forca_GC' $null; S 'Forca_SI' $null
$mGC = $pub.GetMethod('NovoMotor').Invoke($null, @('GC'))
$tick = $pub.GetMethod('Tick')
$tick.Invoke($null, @('GC', $mGC, $Bid, [double]4190.0, [double]4190.0, [double]4190.1, [long]0, [DateTime]$now)) | Out-Null
$tick.Invoke($null, @('GC', $mGC, $Ask, [double]4190.1, [double]4190.0, [double]4190.1, [long]0, [DateTime]$now)) | Out-Null
Check 'T13 cotacao (Bid/Ask) nao publica Forca_GC' ($null -eq (G 'Forca_GC')) ''
$tick.Invoke($null, @('GC', $mGC, $Last, [double]4190.1, [double]4190.0, [double]4190.1, [long]3, [DateTime]$now)) | Out-Null
Check 'T14 negocio (Last) publica Forca_GC = janela do MESMO motor' ([object]::ReferenceEquals((G 'Forca_GC'), $mGC.Forca)) ''
$mSI = $pub.GetMethod('NovoMotor').Invoke($null, @('SI'))
$tick.Invoke($null, @('SI', $mSI, $Last, [double]60.58, [double]60.575, [double]60.58, [long]2, [DateTime]$now)) | Out-Null
Check 'T15 negocio de SI publica Forca_SI' ([object]::ReferenceEquals((G 'Forca_SI'), $mSI.Forca)) ''

# anchorGcSi: JSON e /state local
Legs 1 1 1 1 $now; S 'Forca_GC' (Janela 1 $true $now); S 'Forca_SI' (Janela 1 $true $now)
$j = $gen.GetMethod('Anchor').Invoke($null, @($ss))
Check 'T16 anchorGcSi forca fraca => dir 0, strength 4, why "forca fraca GC/SI", ok false' ($j -eq '{"dir":0,"strength":4,"why":"forca fraca GC/SI","ok":false,"source":"AoGate.GcSi"}') "$j"
$state = $br.GetMethod('BuildStateLocal', $NP).Invoke($null, @())
$o = $state | ConvertFrom-Json
Check 'T17 /state local publica anchorGcSi e mantem anchor/gc/si/auxGcSi' (($null -ne $o.anchorGcSi) -and ($null -ne $o.anchor) -and ($null -ne $o.gc) -and ($null -ne $o.si) -and ($null -ne $o.auxGcSi) -and $o.anchorGcSi.source -eq 'AoGate.GcSi') ''
$m = $gen.GetMethod('Put').Invoke($null, @('{"a":1,"auxGcSi":{"dir":0,"strength":0}}', 'anchorGcSi', $j))
Check 'T18 Put insere anchorGcSi no JSON delegado antes de auxGcSi' ($m -eq ('{"a":1,"anchorGcSi":' + $j + ',"auxGcSi":{"dir":0,"strength":0}}')) "$m"
S 'Forca_GC' (Janela 1 $false $now); S 'Forca_SI' (Janela 1 $false $now)
$j2 = $gen.GetMethod('Anchor').Invoke($null, @($ss))
Check 'T19 anchorGcSi aprovado => dir 1 ok true' ($j2 -eq '{"dir":1,"strength":4,"why":"","ok":true,"source":"AoGate.GcSi"}') "$j2"

Write-Output "TOTAL $($script:n - $script:fail)/$($script:n) PASS"
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
