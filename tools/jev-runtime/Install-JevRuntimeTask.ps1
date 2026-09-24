<#
.SYNOPSIS
  Registra (ou remove) a tarefa agendada INVICTUS_JEV_RUNTIME que mantem o supervisor
  Start-JevRuntime.ps1 vivo. Toca SOMENTE essa tarefa (pasta \InvictusJev\); nenhuma outra tarefa,
  PM2 ou projeto e alterado.

  Tarefa:
    - principal: usuario atual, Interactive, RunLevel Limited (sem admin; roda enquanto o usuario estiver logado);
    - gatilhos: AtLogOn do usuario + watchdog a cada 5 min (repeticao indefinida);
    - MultipleInstances IgnoreNew (nunca dois supervisores via scheduler) + mutex no proprio launcher;
    - RestartOnFailure 999x a cada 1 min; ExecutionTimeLimit ilimitado; nao para em bateria/idle;
    - acao: conhost --headless powershell -File Start-JevRuntime.ps1 (sem janela, sem depender de terminal).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\jev-runtime\Install-JevRuntimeTask.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\jev-runtime\Install-JevRuntimeTask.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'INVICTUS_JEV_RUNTIME',
  [string]$TaskPath = '\InvictusJev\',
  [string]$RepoRoot = 'C:\Users\ADM\Claude-JEV\code',
  [switch]$Uninstall,
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'

$existing = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
if ($Uninstall) {
  if ($existing) { Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false; "REMOVED $TaskPath$TaskName" }
  else { "NOT_PRESENT $TaskPath$TaskName" }
  return
}

$launcher = Join-Path $RepoRoot 'tools\jev-runtime\Start-JevRuntime.ps1'
if (-not (Test-Path -LiteralPath $launcher)) { throw "launcher ausente: $launcher" }
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute $conhost `
  -Argument "--headless `"$ps`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" -RepoRoot `"$RepoRoot`"" `
  -WorkingDirectory $RepoRoot

$tLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$tWatch = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)

$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -DontStopOnIdleEnd -Priority 6

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$task = New-ScheduledTask -Action $action -Trigger @($tLogon, $tWatch) -Settings $settings -Principal $principal `
  -Description 'INVICTUS JEV CODE: supervisor persistente do runtime JEV read-only (:3590 bridge, :3591 control plane). Single-instance, auto-restart. Nao envia ordens, nao toca NT8/producao.'

Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -InputObject $task -Force | Out-Null
"REGISTERED $TaskPath$TaskName (user=$user, launcher=$launcher)"

if (-not $NoStart) { Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath; "STARTED $TaskPath$TaskName" }
