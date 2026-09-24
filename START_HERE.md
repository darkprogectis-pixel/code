# START HERE — JEV FUTURE

1. Open this repository in Claude Code.
2. Claude must read `CLAUDE.md`.
3. History document: `context/jev-future/HANDOFF_JEV_FUTURE_20260923.md`.
   Latest phase handoffs: `handoffs/` (newest: `HANDOFF_JEV_CONTROL_CENTER_V1_20260924.md`).
4. Completed:
   - Decision Logic V1 (closed);
   - Preregistration Design V1 (reviewed / structurally consolidated, `e152d3d`);
   - **JEV Runtime V1 — IMPLEMENTED / OPERATIONAL** (`jev-runtime/v1.0.0`, `774b198`; tests 21/21, smoke PASS, end-to-end PASS).
5. Done: **JEV LIVE INPUT ADAPTER V1** (read-only, `6ecb18d`). Current: **JEV NT8 AGENT / BOT CONTROL CENTER V1** — bridge + web Control Center operational; NT8 AddOn source only (not installed, no F5); robot LOCKED OFF.
6. Always: trade execution DISABLED · current production UNCHANGED · no F5 · Core×JEV fusion UNDEFINED ·
   20–40 trading days = FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING.

Run: `npm test` · `npm run smoke` · `npm run serve` (Control Center em http://127.0.0.1:3590/) · `npm run live:once`
