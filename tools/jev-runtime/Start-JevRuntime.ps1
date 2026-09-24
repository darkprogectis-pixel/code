<#
.SYNOPSIS
  INVICTUS JEV CODE - supervisor persistente do runtime JEV (bridge :3590 + control plane :3591).

.DESCRIPTION
  Executado pela tarefa agendada INVICTUS_JEV_RUNTIME (ou manualmente). Nao altera logica JEV:
  sobe exatamente o mesmo comando de `npm run serve` (node src/jev/cli.mjs --serve), sem npm/cmd/bash no meio.

  Single-instance:
    - mutex Local\INVICTUS_JEV_RUNTIME_SUPERVISOR: um segundo supervisor sai com NO_SECOND_INSTANCE (exit 0);
    - :3590 saudavel e pertencente ao JEV => o supervisor ADOTA o PID existente (nao cria segunda instancia).

  Recuperacao controlada:
    - processo JEV morreu              => registra exit code, backoff, sobe de novo;
    - JEV nao saudavel N vezes seguidas => mata SOMENTE aquele node JEV (cli.mjs --serve) e sobe de novo;
    - porta ocupada por processo NAO-JEV => PORT_CONFLICT_FOREIGN, nada e morto, exit 3.

  Nunca toca NT8, PM2, producao ou ordens (o runtime e read-only; ORDER_PATH HARD_DISABLED no codigo).

  Exit codes: 0 = NO_SECOND_INSTANCE / parada normal (-Once) · 3 = PORT_CONFLICT_FOREIGN · 4 = node.exe/repo ausente.
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = 'C:\Users\ADM\Claude-JEV\code',
  [string]$NodeExe = 'C:\Program Files\nodejs\node.exe',
  [string]$LogDir = (Join-Path $env:LOCALAPPDATA 'InvictusJevCode\runtime'),
  [int]$BridgePort = 3590,
  [int]$ControlPort = 3591,
  [int]$ProbeIntervalSec = 15,
  [int]$UnhealthyThreshold = 4,       # probes seguidos ruins antes de reciclar (~60 s)
  [int]$StaleCycleSec = 300,          # last_cycle_at mais velho que isso = travado
  [int]$StartupGraceSec = 90,         # tolerancia apos subir o node
  [int]$KeepNodeLogs = 40,
  [switch]$Once                       # so garante o estado (adota/sobe) e sai; nao supervisiona
)

$ErrorActionPreference = 'Stop'
$script:SupervisorLog = $null

function Write-Log([string]$Event, [string]$Detail = '') {
  $line = '{0} [{1}] {2} {3}' -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ'), $PID, $Event, $Detail
  try {
    $f = Join-Path $LogDir ('supervisor-{0}.log' -f (Get-Date).ToString('yyyyMMdd'))
    Add-Content -LiteralPath $f -Value $line -Encoding UTF8
  } catch { }
  Write-Host $line
}

function Get-ListenerPid([int]$Port) {
  $c = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return [int]$c.OwningProcess } else { return $null }
}

function Get-ProcCommandLine([int]$ProcId) {
  try { return (Get-CimInstance Win32_Process -Filter "ProcessId=$ProcId" -ErrorAction Stop) }
  catch { Write-Log 'CIM_ERROR' "pid=$ProcId $($_.Exception.Message)"; return $null }
}

function Test-JevProcess([int]$ProcId) {
  $p = Get-ProcCommandLine $ProcId
  if (-not $p) { return $false }
  if ([string]::IsNullOrEmpty($p.CommandLine)) {
    # CommandLine ilegivel (processo criado em outro contexto de token, ex.: sandbox da sessao Claude).
    # Identidade pela API: node.exe dono de :3590 respondendo o schema de health do JEV em modo LIVE.
    if ($p.Name -ine 'node.exe' -or (Get-ListenerPid $BridgePort) -ne $ProcId) { return $false }
    try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:$BridgePort/jev/v1/health" -TimeoutSec 5 -UseBasicParsing } catch { return $false }
    $keys = @($h.PSObject.Properties.Name)
    $ok = (@('ok', 'status', 'mode', 'cycles', 'read_only', 'orders_enabled') | Where-Object { $keys -notcontains $_ }).Count -eq 0 -and $h.mode -eq 'LIVE'
    if ($ok) { Write-Log 'IDENTITY_VIA_HEALTH_API' "pid=$ProcId (CommandLine ilegivel)" }
    return $ok
  }
  return ($p.Name -ieq 'node.exe') -and ($p.CommandLine -match 'src[\\/]jev[\\/]cli\.mjs') -and ($p.CommandLine -match '--serve') -and ($p.CommandLine -notmatch '--replay')
}

# Retorna: HEALTHY | UNHEALTHY:<motivo> | DOWN
function Get-JevHealth {
  $h = $null
  try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:$BridgePort/jev/v1/health" -TimeoutSec 5 -UseBasicParsing }
  catch {
    if (-not (Get-ListenerPid $BridgePort)) { return 'DOWN' }
    return 'UNHEALTHY:health_request_failed'
  }
  if ($h.ok -ne $true) { return 'UNHEALTHY:ok_false' }
  if ($h.mode -ne 'LIVE') { return "UNHEALTHY:mode_$($h.mode)" }
  if ($h.read_only -ne $true -or $h.orders_enabled -ne $false) { return 'UNHEALTHY:guarantee_violation' }
  if (-not (Get-ListenerPid $ControlPort)) { return 'UNHEALTHY:control_plane_down' }
  if ($h.last_cycle_at) {
    $age = ((Get-Date).ToUniversalTime() - ([datetime]::Parse($h.last_cycle_at)).ToUniversalTime()).TotalSeconds
    if ($age -gt $StaleCycleSec) { return ('UNHEALTHY:cycle_stale_{0:N0}s' -f $age) }
  }
  return 'HEALTHY'
}

function Remove-OldNodeLogs {
  try {
    Get-ChildItem -LiteralPath $LogDir -Filter 'node-*.log' | Sort-Object LastWriteTime -Descending |
      Select-Object -Skip ($KeepNodeLogs * 2) | Remove-Item -Force -ErrorAction SilentlyContinue
  } catch { }
}

function Start-JevNode {
  Remove-OldNodeLogs
  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $out = Join-Path $LogDir "node-$stamp.out.log"
  $err = Join-Path $LogDir "node-$stamp.err.log"
  # Console proprio e oculto (NAO -NoNewWindow): o node nao pode prender o conhost da tarefa, senao o
  # Task Scheduler segue vendo a tarefa "Running" com o supervisor morto e o watchdog e ignorado (IgnoreNew).
  $p = Start-Process -FilePath $NodeExe -ArgumentList @('src/jev/cli.mjs', '--serve') -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
  Write-Log 'NODE_STARTED' "pid=$($p.Id) cmd=`"$NodeExe src/jev/cli.mjs --serve`" cwd=$RepoRoot stdout=$out stderr=$err"
  return $p.Id
}

function Stop-JevNode([int]$ProcId, [string]$Why) {
  if (-not (Test-JevProcess $ProcId)) { Write-Log 'STOP_REFUSED_NOT_JEV' "pid=$ProcId reason=$Why"; return $false }
  Write-Log 'NODE_KILL_CONTROLLED' "pid=$ProcId reason=$Why"
  Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20 -and (Get-Process -Id $ProcId -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  return $true
}

# ---------- pre-condicoes ----------
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if (-not (Test-Path -LiteralPath $NodeExe)) { $NodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (-not $NodeExe -or -not (Test-Path -LiteralPath (Join-Path $RepoRoot 'src\jev\cli.mjs'))) {
  Write-Log 'FATAL_MISSING' "node=$NodeExe repo=$RepoRoot"; exit 4
}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\INVICTUS_JEV_RUNTIME_SUPERVISOR', [ref]$createdNew)
if (-not $createdNew) {
  Write-Log 'NO_SECOND_INSTANCE' 'outro supervisor ja ativo; saindo sem subir nada'
  exit 0
}

Write-Log 'SUPERVISOR_START' "repo=$RepoRoot node=$NodeExe ports=$BridgePort/$ControlPort once=$([bool]$Once) logdir=$LogDir"

$jevPid = $null
$bad = 0
$backoff = 5
$startedAt = [datetime]::MinValue

try {
  while ($true) {
    # 1) processo acompanhado morreu?
    if ($jevPid -and -not (Get-Process -Id $jevPid -ErrorAction SilentlyContinue)) {
      Write-Log 'NODE_EXITED' "pid=$jevPid"
      $jevPid = $null; $bad = 0
      Start-Sleep -Seconds $backoff
      $backoff = [Math]::Min($backoff * 2, 60)
    }

    # 2) quem ocupa :3590?
    $listener = Get-ListenerPid $BridgePort
    if ($listener -and $listener -ne $jevPid) {
      if (Test-JevProcess $listener) {
        $jevPid = $listener; $bad = 0; $startedAt = (Get-Date)
        Write-Log 'ADOPTED_EXISTING' "pid=$listener (runtime JEV ja rodando; sem segunda instancia)"
      } else {
        $pi = Get-ProcCommandLine $listener
        Write-Log 'PORT_CONFLICT_FOREIGN' "port=$BridgePort pid=$listener name=$($pi.Name) cmd=[$($pi.CommandLine)] (nada foi morto)"
        exit 3
      }
    }

    # 3) ninguem rodando => subir
    if (-not $jevPid) {
      $cpl = Get-ListenerPid $ControlPort
      if ($cpl -and -not (Test-JevProcess $cpl)) {
        Write-Log 'PORT_CONFLICT_FOREIGN' "port=$ControlPort pid=$cpl (nada foi morto)"; exit 3
      }
      $jevPid = Start-JevNode; $bad = 0; $startedAt = (Get-Date)
    }

    # 4) saude
    Start-Sleep -Seconds $ProbeIntervalSec
    if (-not (Get-Process -Id $jevPid -ErrorAction SilentlyContinue)) { continue }
    $st = Get-JevHealth
    if ($st -eq 'HEALTHY') {
      if ($bad -gt 0) { Write-Log 'HEALTH_RECOVERED' "pid=$jevPid" }
      $bad = 0; $backoff = 5
      if ($Once) { Write-Log 'ONCE_OK' "pid=$jevPid healthy"; break }
    } elseif (((Get-Date) - $startedAt).TotalSeconds -lt $StartupGraceSec) {
      # ainda subindo
    } else {
      $bad++
      Write-Log 'HEALTH_BAD' "pid=$jevPid status=$st count=$bad/$UnhealthyThreshold"
      if ($bad -ge $UnhealthyThreshold) {
        [void](Stop-JevNode $jevPid "unhealthy:$st")
        $jevPid = $null; $bad = 0
        Start-Sleep -Seconds $backoff
        $backoff = [Math]::Min($backoff * 2, 60)
      }
    }
  }
} finally {
  Write-Log 'SUPERVISOR_STOP' "tracked_pid=$jevPid"
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
exit 0
