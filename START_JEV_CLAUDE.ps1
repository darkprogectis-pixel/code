param([switch]$Mwapi)
$ErrorActionPreference = "Stop"

# JEV Claude launcher with JEV Rotation Controller V3 (external hook enforcement + automatic successor).
# Flow: PREPARE 200k (incremental handoff) -> SOFT_STOP 235k (finish atomic unit) -> HARD 240k ->
# hook opens the successor automatically -> old instance ROTATED_READ_ONLY. Never /clear, no /exit needed.

# Canonical JEV profile: ALWAYS this isolated config dir + account. An inherited CLAUDE_CONFIG_DIR is
# ignored on purpose (another profile = another account). Never the default ~/.claude.
$jevProfile = Join-Path $HOME ".claude-gomesgomestrader"
$jevAccount = "gomesgomestrader@gmail.com"
if ($env:CLAUDE_CONFIG_DIR -and $env:CLAUDE_CONFIG_DIR -ne $jevProfile) {
  Write-Host "CLAUDE_CONFIG_DIR herdado ignorado: $env:CLAUDE_CONFIG_DIR" -ForegroundColor Yellow
}
if (-not (Test-Path -LiteralPath $jevProfile -PathType Container)) { throw "JEV profile not found: $jevProfile - session not started" }
$env:CLAUDE_CONFIG_DIR = $jevProfile
# Test-only threshold overrides must never reach a real session.
Remove-Item Env:JEV_ROTATION_TEST, Env:JEV_ROTATION_THRESHOLDS, Env:JEV_ROTATION_STATE_DIR, Env:JEV_ROTATION_REPO_ROOT, Env:JEV_ROTATION_SPAWN, Env:JEV_ROTATION_CLAUDE_BIN -ErrorAction SilentlyContinue

Set-Location "$HOME\Claude-JEV\code"

Write-Host "=== JEV CLAUDE ISOLADO ===" -ForegroundColor Cyan
Write-Host "Repo: $PWD"
Write-Host "Config: $env:CLAUDE_CONFIG_DIR"

# 1. Verify the rotation hooks. They are declared once, in the project .claude/settings.json (loaded by
#    every session of this repo); nothing is written to the profile. No verified enforcement => no session.
node tools/jev-rotation/install-hooks.mjs --config-dir "$env:CLAUDE_CONFIG_DIR" --verify
if ($LASTEXITCODE -ne 0) { throw "JEV Rotation Controller V3: verify FAILED - session not started" }

# 2. Provider + identity gate. Two explicit modes; any other state => no session.
#    OAuth (default): no provider override in the environment and the profile logged in with the
#    canonical account. Wrong/absent account => no session.
#    -Mwapi: MWAPI Anthropic-compatible endpoint for THIS process only (nothing is written to the user
#    environment). The token is only checked for presence - never printed, logged or compared.
$jevMwapiBase = "https://api.mwapi.dev"
if ($Mwapi) {
  if (-not $env:ANTHROPIC_AUTH_TOKEN -and $env:MWAPI_AUTH_TOKEN) { $env:ANTHROPIC_AUTH_TOKEN = $env:MWAPI_AUTH_TOKEN }
  if (-not $env:ANTHROPIC_AUTH_TOKEN) { throw "JEV MWAPI mode: token variable absent (MWAPI_AUTH_TOKEN or ANTHROPIC_AUTH_TOKEN) - session not started" }
  if ($env:ANTHROPIC_BASE_URL -and $env:ANTHROPIC_BASE_URL -ne $jevMwapiBase) { throw "JEV MWAPI mode: unexpected ANTHROPIC_BASE_URL - session not started" }
  $env:ANTHROPIC_BASE_URL = $jevMwapiBase
  Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
  Write-Host "Provedor: MWAPI ($jevMwapiBase)"
} else {
  if ($env:ANTHROPIC_BASE_URL -or $env:ANTHROPIC_AUTH_TOKEN) { throw "JEV OAuth mode: provider override present in the environment (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN) - session not started (use -Mwapi explicitly)" }
  $auth = (claude auth status --json | Out-String | ConvertFrom-Json)
  if (-not ($auth.loggedIn -eq $true -and $auth.authMethod -eq 'claude.ai' -and $auth.email -eq $jevAccount)) { throw "JEV profile account mismatch (expected $jevAccount via claude.ai, got method '$($auth.authMethod)', email '$($auth.email)') - session not started" }
  Write-Host "Conta: $($auth.email) ($($auth.subscriptionType))"
}

# 3. Single instance. Rotation (V3) is automatic: at soft stop / hard rotation the hook itself
#    opens the successor session in a NEW window (same config dir, same cwd, lineage + brief)
#    and this instance becomes ROTATED_READ_ONLY. This script never relaunches (that would be a
#    second successor). Optional arguments are passed through to claude.
Write-Host "`nAbrindo Claude JEV..." -ForegroundColor Green
claude @args

node tools/jev-rotation/status.mjs
