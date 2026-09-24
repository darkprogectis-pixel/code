$ErrorActionPreference = "Stop"

# JEV Claude launcher with JEV Rotation Controller V2 (external hook enforcement).
# Flow: handoff -> instance ends (/exit) -> new instance -> reads handoff -> continues. Never /clear.

$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-darkprogectis-jev"
# Test-only threshold overrides must never reach a real session.
Remove-Item Env:JEV_ROTATION_TEST, Env:JEV_ROTATION_THRESHOLDS, Env:JEV_ROTATION_STATE_DIR, Env:JEV_ROTATION_REPO_ROOT -ErrorAction SilentlyContinue

Set-Location "$HOME\Claude-JEV\code"

Write-Host "=== JEV CLAUDE ISOLADO ===" -ForegroundColor Cyan
Write-Host "Repo: $PWD"
Write-Host "Config: $env:CLAUDE_CONFIG_DIR"

# 1. Install (idempotent) + verify the rotation hooks. No verified enforcement => no session.
node tools/jev-rotation/install-hooks.mjs --config-dir "$env:CLAUDE_CONFIG_DIR"
if ($LASTEXITCODE -ne 0) { throw "JEV Rotation Controller V2: install FAILED - session not started" }
node tools/jev-rotation/install-hooks.mjs --config-dir "$env:CLAUDE_CONFIG_DIR" --verify
if ($LASTEXITCODE -ne 0) { throw "JEV Rotation Controller V2: verify FAILED - session not started" }

claude auth status --text

$bootstrap = "CONTINUE O INVICTUS JEV CODE PELO HANDOFF MAIS RECENTE. Leia o handoff mais recente em handoffs/ " +
  "(e handoffs/rotation/AUTO_ROTATION_*.md mais recente, se existir) e recupere o estado sem repetir fases concluidas. " +
  "Reporte: estado recuperado, commit atual, trabalho pendente exato. Aguarde ordem do operador."

$first = $true
do {
  if ($first) {
    Write-Host "`nAbrindo Claude JEV..." -ForegroundColor Green
    claude
  } else {
    Write-Host "`nAbrindo NOVA instancia Claude JEV (rotacao)..." -ForegroundColor Green
    claude $bootstrap
  }
  $first = $false

  node tools/jev-rotation/status.mjs
  $level = $LASTEXITCODE
  $again = $false
  if ($level -ge 20) {
    Write-Host "`nROTATE_SESSION_NOW - a instancia anterior atingiu o limite de rotacao." -ForegroundColor Yellow
    $ans = Read-Host "Abrir nova instancia JEV que le o handoff? [S/n]"
    $again = ($ans -eq "" -or $ans -match "^[sSyY]")
  } elseif ($level -eq 10) {
    Write-Host "`nJEV_ROTATION_WARNING na ultima instancia (>= 220k tokens)." -ForegroundColor Yellow
  }
} while ($again)
