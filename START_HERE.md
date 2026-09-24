# START HERE — JEV FUTURE

1. Open this repository in Claude Code.
2. Claude must read `CLAUDE.md`.
3. History document: `context/jev-future/HANDOFF_JEV_FUTURE_20260923.md`.
   Latest phase handoffs: `handoffs/` (newest: `HANDOFF_INVICTUS_JEV_CODE_V1_20260924.md`).
4. Completed:
   - Decision Logic V1 (closed);
   - Preregistration Design V1 (reviewed / structurally consolidated, `e152d3d`);
   - **JEV Runtime V1 — IMPLEMENTED / OPERATIONAL** (`jev-runtime/v1.0.0`, `774b198`; tests 21/21, smoke PASS, end-to-end PASS).
5. Done: **JEV LIVE INPUT ADAPTER V1** (`6ecb18d`) and **INVICTUS JEV CODE V1** — Analyzer + Robot Core (execution HARD DISABLED) + control plane :3591 + NT8 executor read-only (source only, no F5) + optional Agent Gateway :3592. Docs: `context/jev-future/INVICTUS_JEV_CODE_V1_20260924.md`.
6. Always: trade execution DISABLED · current production UNCHANGED · no F5 · Core×JEV fusion UNDEFINED ·
   20–40 trading days = FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING.

Run: `npm test` · `npm run test:nt8` · `npm run serve` (Control Center em http://127.0.0.1:3590/) · `npm run agent` (opcional)
