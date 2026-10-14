# JEV DIFF — GC/SI snapshot /gcsi/sim (staging snapshot-fix, 14/10/2026)

## Objetivo (ordem do operador)
Corrigir SOMENTE a representação do estado do simulador GC/SI em `GET /gcsi/sim`, sem alterar o motor. Aplicar primeiro só na instância isolada `:3611`. NÃO aplicar no BFF de produção `:3600`. `AOT_GCSI_SIM=off` em produção.

## Causa provada
- `aot-bff.js:3299` → `gcsiSim.getState()` → `aot-gcsi-sim.js:141` `engine.getState()` sem `esSpot/nqSpot` → `aot-sim.js getState(esSpot,nqSpot)`: `marks = r2(undefined) = null`, `legPnl(spot undefined) = 0`.
- O snapshot correto (preços do tick) é o retorno de `gcsiSim.tick(...)`, gravado em `STATE.simGcSi` (`aot-bff.js:2339`) e nunca exposto.
- Reproduzido no teste S07; confirmado no teste S05/S06 que o tick traz marks e PnL coerentes.

## Diff completo (base = produção 65a76459 → candidato 3ec88e91)
```diff
--- base-aot-bff.js	2026-10-14 13:49:04.228200400 -0300
+++ candidate/aot-bff.js	2026-10-14 13:49:15.176359400 -0300
@@ -1091,6 +1091,7 @@
 //   HIRO                                  → SpotGamma GLD/SLV = ETF, PROXY do futuro (rotulado em c2.proxy).
 // Enquanto o :5151 em execução não publicar `gc`/`si` (ponte anterior), tudo sai state='UNAVAILABLE'.
 const GCSI_PRICE_LIVE_MS = 15000;    // = AlfaOmegaBridge.cs (tapeLive)
+const GCSI_SNAPSHOT_MAX_AGE_MS = 2 * POLL_MS + 5000;   // (2026-10-14) idade máx. do snapshot do tick servido em GET /gcsi/sim
 const GCSI_FRESH_SEC_DEFAULT = 90;   // = AoGate.DefaultFreshSec; só vale se o :5151 não publicar gateParams.freshSec
 const GCSI_NO_MULTI = 'sem fonte: o GexBot/OPRA só publica ES e NQ (charm/vol/vanna de ouro/prata não existem)';
 const GCSI_NO_EDGE = 'sem fonte: o consolidator :3495 (Tier/confiança) só cobre ES e NQ';
@@ -2336,7 +2337,7 @@
   if (GCSI_SIM_ON && gcsiSim) {
     try {
       const fg = (flowGcSi && !flowGcSi._err) ? flowGcSi : null;
-      STATE.simGcSi = gcsiSim.tick(Object.assign(gcsiSimInput(fg), { nowIso, replay: !!REPLAY || !!(ao && ao.isReplay) }));
+      STATE.simGcSi = Object.assign(gcsiSim.tick(Object.assign(gcsiSimInput(fg), { nowIso, replay: !!REPLAY || !!(ao && ao.isReplay) })), { snapshotAt: nowIso });
     } catch (e) { STATE.simGcSi = { _err: (e && e.message) || 'gcsi sim err' }; }
   }
   // Modo replay/demo — ADITIVO: só entra no /state com AOT_REPLAY_DATE setada (produção não tem a chave).
@@ -3296,7 +3297,16 @@
   if (p === '/gcsi/sim' || p === '/gcsi/events' || p === '/gcsi/history') {
     if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });
     if (!gcsiSim) return sendJson(res, 200, { enabled: false, note: 'AOT_GCSI_SIM=off (padrão)' });
-    if (p === '/gcsi/sim') return sendJson(res, 200, Object.assign({ enabled: true }, gcsiSim.getState()));
+    // (2026-10-14) snapshot do último tick (marks/PnL com os preços daquele tick). Ausente, com erro ou mais velho que
+    // GCSI_SNAPSHOT_MAX_AGE_MS ⇒ estado do motor SEM preço (marks null, PnL 0), marcado stale — nunca preço antigo como atual.
+    if (p === '/gcsi/sim') {
+      const snap = STATE && STATE.simGcSi;
+      const at = (snap && !snap._err && snap.snapshotAt) ? snap.snapshotAt : null;
+      const ageMs = at ? Date.now() - Date.parse(at) : null;
+      const fresh = ageMs != null && ageMs >= 0 && ageMs <= GCSI_SNAPSHOT_MAX_AGE_MS;
+      return sendJson(res, 200, Object.assign({ enabled: true }, fresh ? snap : gcsiSim.getState(),
+        { snapshot: { source: fresh ? 'tick' : 'engine (sem preço)', at, ageMs, maxAgeMs: GCSI_SNAPSHOT_MAX_AGE_MS, stale: !fresh } }));
+    }
     if (p === '/gcsi/events') {
       const after = Math.max(0, parseInt(u.searchParams.get('after') || '0', 10) || 0);
       const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit') || '200', 10) || 200));
```

## Garantias
- Motor (`aot-sim.js`, `aot-gcsi-sim.js` 42d0c8fd): sem alteração (S00). Regras OPEN/CLOSE, stops, trailing, thresholds: intactos (S17, regressão 27/27).
- Contrato da API: todos os campos anteriores mantidos; só aditivos `snapshot{source,at,ageMs,maxAgeMs,stale}` e `snapshotAt` (S09).
- Snapshot ausente, com `_err`, mais velho que `2*POLL_MS+5000` (45 s) ou com relógio no futuro ⇒ estado do motor com `marks` null / PnL 0 e `snapshot.stale=true` — nunca preço antigo como atual (S10–S14). Tick sem preço válido repassa null (S15–S16); não inventa preço.
- ES/NQ: `STATE.sim`, `simEngine.tick`, `/sim/events`, `buildGate`, `simEmitEvent`, `simEventsRead`, `computeConfluence`, `buildV2Stack`, `buildFlowGc`, `c1FromLeg` idênticos (S21, I03).
- Produção `:3600` não recebe o patch nesta ordem; `C:/Users/ADM/.claude/aot/` não é escrito.

## Testes
- `snapshot-fix/tests/snapshot-fix-tests.mjs`: 22/22 PASS (`evidence-snapshot-tests.txt`).
- Regressão `gcsi-eqv-node` contra o candidato: 27/27 PASS (`evidence-regress-27.txt`).

## Aplicação (só :3611) e rollback
- `bash snapshot-fix/run-gcsi-homolog-fix.sh --start`: confere SHA de produção (65a76459/42d0c8fd) e do candidato (3ec88e91), copia para `C:/Users/ADM/.claude/aot-gcsi-homolog`, sobe `:3611` com `AOT_GCSI_SIM=on`, `AOT_SIM=off`, exec/robo em pastas vazias. Lê `:5151` só por GET. Sem ordens (`orders:'NONE'`).
- `--stop` encerra; `--rollback` encerra e devolve o `aot-bff.js` da instância ao de produção.
- Janela com feed real só com autorização específica do operador; nenhum sinal fabricado nem fechamento forçado.
