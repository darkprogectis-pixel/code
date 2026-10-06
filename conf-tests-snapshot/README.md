# conf-tests snapshot (INVICTUS harness)

Cópia versionada dos scripts/testes do harness INVICTUS. A fonte de verdade continua em
`C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\sync` (fora de git); os scripts usam caminhos absolutos de lá.

Snapshot: 2026-10-06, fechamento UNIVERSAL_ACCOUNT_SUPPORT (ver `handoffs/HANDOFF_INVICTUS_NO_TRADES_20261005.md` §41).

Incluído: `sync/*.cs|*.js|*.ps1` de nível superior (sem `.bak*`) + `sync/out/regressao_*.ps1`.
Excluído: `staging/` (cópia dos .cs do NT8), `out/` (logs/gerados), `install-package-*`, `fixtures/`, `aot/`, `.exe`, `.dll`.

Regressão do lote: `powershell -NoProfile -ExecutionPolicy Bypass -File out\regressao_residual.ps1` (rodar a partir da pasta de origem).
