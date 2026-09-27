$ErrorActionPreference = "Stop"

# JEV Claude launcher with JEV Rotation Controller V3 (external hook enforcement + automatic successor).
# Flow: PREPARE 200k (incremental handoff) -> SOFT_STOP 235k (finish atomic unit) -> HARD 240k ->
# hook opens the successor automatically -> old instance ROTATED_READ_ONLY. Never /clear, no /exit needed.

$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-darkprogectis-jev"
# Test-only threshold overrides must never reach a real session.
Remove-Item Env:JEV_ROTATION_TEST, Env:JEV_ROTATION_THRESHOLDS, Env:JEV_ROTATION_STATE_DIR, Env:JEV_ROTATION_REPO_ROOT, Env:JEV_ROTATION_SPAWN, Env:JEV_ROTATION_CLAUDE_BIN -ErrorAction SilentlyContinue

Set-Location "$HOME\Claude-JEV\code"

Write-Host "=== JEV CLAUDE ISOLADO ===" -ForegroundColor Cyan
Write-Host "Repo: $PWD"
Write-Host "Config: $env:CLAUDE_CONFIG_DIR"

# 1. Install (idempotent) + verify the rotation hooks. No verified enforcement => no session.
node tools/jev-rotation/install-hooks.mjs --config-dir "$env:CLAUDE_CONFIG_DIR"
if ($LASTEXITCODE -ne 0) { throw "JEV Rotation Controller V3: install FAILED - session not started" }
node tools/jev-rotation/install-hooks.mjs --config-dir "$env:CLAUDE_CONFIG_DIR" --verify
if ($LASTEXITCODE -ne 0) { throw "JEV Rotation Controller V3: verify FAILED - session not started" }

claude auth status --text

# 2. Single instance. Rotation (V3) is automatic: at soft stop / hard rotation the hook itself
#    opens the successor session in a NEW window (same config dir, same cwd, lineage + brief)
#    and this instance becomes ROTATED_READ_ONLY. This script never relaunches (that would be a
#    second successor).
Write-Host "`nAbrindo Claude JEV..." -ForegroundColor Green
claude

node tools/jev-rotation/status.mjs
