# Regressao UNIVERSAL (D1+D2) — roda as 12 suites no sync real, uma por vez, cabecalho "===== nome =====" + RC (formato da regressao-final3).
$ErrorActionPreference = 'Continue'
$env:PATH = "C:\Program Files\nodejs;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;$env:PATH"
$S = "C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\sync"
$LOG = Join-Path $S "out\regressao-universal-20261006.txt"
Set-Location $S
"REGRESSAO UNIVERSAL inicio " + (Get-Date).ToString("o") | Set-Content $LOG -Encoding utf8
$suites = @(
  @{ n = "build_sync.ps1";          c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\build_sync.ps1 } },
  @{ n = "test_account.ps1";        c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\test_account.ps1 } },
  @{ n = "node test_account.js";    c = { & node .\test_account.js } },
  @{ n = "test_account_agnostic.ps1"; c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\test_account_agnostic.ps1 } },
  @{ n = "test_entrada.ps1";        c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\test_entrada.ps1 } },
  @{ n = "test_rec.ps1";            c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\test_rec.ps1 } },
  @{ n = "test_real_flow.ps1";      c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\test_real_flow.ps1 } },
  @{ n = "test_copy.ps1";           c = { & powershell -NoProfile -ExecutionPolicy Bypass -File .\test_copy.ps1 } }
)
foreach ($s in $suites) {
  "===== " + $s.n + " =====" | Add-Content $LOG -Encoding utf8
  $o = & $s.c 2>&1 | Out-String
  $o | Add-Content $LOG -Encoding utf8
  "RC[" + $s.n + "]=" + $LASTEXITCODE | Add-Content $LOG -Encoding utf8
}
"REGRESSAO UNIVERSAL fim " + (Get-Date).ToString("o") | Add-Content $LOG -Encoding utf8
