# START HERE — JEV FUTURE

1. Open this repository in Claude Code.
2. Claude must read `CLAUDE.md`.
3. History document: `context/jev-future/HANDOFF_JEV_FUTURE_20260923.md`.
   Latest phase handoffs: `handoffs/` (newest: `HANDOFF_JEV_LIVE_INPUT_V1_20260924.md`).
4. Completed:
   - Decision Logic V1 (closed);
   - Preregistration Design V1 (reviewed / structurally consolidated, `e152d3d`);
   - **JEV Runtime V1 — IMPLEMENTED / OPERATIONAL** (`jev-runtime/v1.0.0`, `774b198`; tests 21/21, smoke PASS, end-to-end PASS).
5. Current phase: **JEV LIVE INPUT ADAPTER V1** (read-only). Next: JEV NT8 AGENT / BOT CONTROL CENTER V1.
6. Always: trade execution DISABLED · current production UNCHANGED · no F5 · Core×JEV fusion UNDEFINED ·
   20–40 trading days = FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING.

Run: `npm test` · `npm run smoke` · `node src/jev/cli.mjs --input fixtures/jev/C_valid_multi_source.json`
