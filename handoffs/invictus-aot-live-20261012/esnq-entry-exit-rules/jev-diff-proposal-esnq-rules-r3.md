# JEV DIFF — ES/NQ ordem R3: Gate OPEN 4/4 obrigatório + integração BFF (STAGING; sem deploy)

## Objetivo (decisão definitiva do operador, 14/10/2026)
- Gate OPEN 4/4 é OBRIGATÓRIO para TODAS as entradas. Percentuais 70/50 são filtros ADICIONAIS; nunca substituem nem enfraquecem o Gate.
- ES e NQ na mesma direção; 70% nos dois = regra normal; 50% nos dois só com: RTH ⇒ HIRO convergente nos dois; fora RTH ⇒ HIRO não obrigatório.
- Bloquear NEUTRO, divergência, stale, campos ausentes, direção não confirmada.
- R7/R8/R9 (commit adeb1a4, JEV DIFF/FINAL A) preservados sem mudança.
- Escopo: somente cópias em `handoffs/.../esnq-entry-exit-rules/` (candidate/aot-sim.js e candidate/bff/aot-bff.js). Produção (BFF/motor), C#, NT8, contas e ordens LIVE: intocados. Sem deploy.

## Mudanças
1. `candidate/aot-sim.js` (motor, staging):
   - param `requireGateOpen: true`; `tick` aceita `gateOpen`. Entrada só se `gateOpen === true` (estrito; ausente/false/'true'/1 ⇒ `gate_nao_open`), avaliado DEPOIS do anchor 4/4 legado e ANTES do filtro %. Saídas não mudam (Gate só restringe entrada).
   - novo export puro `simEntryInputs({gex,gate,rth,hiroFor})`: lê `signals.{ts,ES,NQ}.{bull_pct,bear_pct,direction}` do payload que o BFF JÁ busca (gexbot :3457 '/'), HIRO por ativo medido contra a direção do Gate (`hiroFor` lança ⇒ 'N/A'), `rth` só se boolean, `gateOpen = gate.open === true`. Payload ausente/_err ⇒ pct null ⇒ motor bloqueia (fail-closed).
2. `candidate/bff/aot-bff.js` (cópia da produção SHA 3ec88e91): só 2 pontos — import de `simEntryInputs` e, no bloco SIM, `simIn = simEntryInputs({ gex, gate, rth: t.rth, hiroFor: c2ForSym(...).confirm })` mesclado ao `tick`. Sem fetch novo, sem rota de ordem, sem NT8. Bloco já dentro do `try` do SIM (falha não derruba /state); SIM continua off por padrão (AOT_SIM).

## Ordem de avaliação da entrada (fail-closed)
anchor 4/4 LONG/SHORT ∧ cooldown ∧ frescor ∧ spots ES/NQ (legado) → Gate OPEN (novo) → % (stale 90 s, inválido, NEUTRO, divergente, <50) → 70/70 entra · 50–69 fora RTH entra · 50–69 RTH só com HIRO CONFIRMA nos dois. RTH ausente = RTH (mais restritivo).

## Testes (29/29 PASS)
- `tests/esnq-rules.test.cjs` 23/23: os 19 anteriores (rodando com gateOpen:true; paridade com base usando requireGateOpen:false) + Gate OPEN obrigatório (98/98 + HIRO + 4/4 com gateOpen ausente/false/null/'true'/1 ⇒ bloqueia) + Gate fechado nunca abre (5000 ticks aleatórios, 0 OPEN) + Gate OPEN não dispensa filtros + Gate só afeta entrada.
- `tests/esnq-bff-integration.test.cjs` 6/6: fixture REAL do relay (ES 24/76, NQ 37/63 SHORT) + adapter HIRO de produção (N/A real: fornecedor parado) ⇒ RTH bloqueia `pct_rth_sem_hiro`, fora RTH abre, Gate fechado bloqueia, HIRO convergente abre, HIRO parcial bloqueia; Gate LONG × signals SHORT ⇒ divergente; payload ausente/erro ⇒ fail-closed; ligação estática no BFF + `node --check`; diff do BFF = exatamente 2 linhas trocadas, sem fetch/ordem/5151.

## Riscos residuais
- Gate OPEN (`buildGate().open`) inclui online/ready/tapeLive; entradas ficam mais raras que só anchor 4/4 — intencional (decisão do operador).
- HIRO pós-fechamento é N/A ⇒ 50% em RTH nunca passa sem fornecedor vivo (fail-closed).
- Deploy no BFF de produção exige ordem separada do operador (script do operador; classifier nega no auto mode).

## Diff completo (aot-sim.js vs adeb1a4; BFF vs produção 3ec88e91)
```diff
diff --git a/handoffs/invictus-aot-live-20261012/esnq-entry-exit-rules/candidate/aot-sim.js b/handoffs/invictus-aot-live-20261012/esnq-entry-exit-rules/candidate/aot-sim.js
index 0b4b6a4..0f68811 100644
--- a/handoffs/invictus-aot-live-20261012/esnq-entry-exit-rules/candidate/aot-sim.js
+++ b/handoffs/invictus-aot-live-20261012/esnq-entry-exit-rules/candidate/aot-sim.js
@@ -45,6 +45,8 @@ const DEFAULT_PARAMS = {
   pctStrongMin: 70,                     // R1/R2: os dois ativos >= 70 na direção => entra sem exigir HIRO
   pctMin: 50,                           // R4/R5: os dois ativos >= 50 na direção => RTH exige HIRO CONFIRMA nos dois
   pctStaleSec: 90,                      // idade máx. do sinal (= ROBO_CFG.STALE_MS / AlfaOmegaRobo.cs:310)
+  requireGateOpen: true,                // (2026-10-14 decisão do operador) entrada exige Gate OPEN (buildGate.open:
+                                        //   online ∧ ready ∧ tapeLive ∧ 4/4 ∧ dir) ALÉM do anchor 4/4; ausente = fechado.
   beAtProfitUsd: 500,                   // lucro (US$) p/ mover o stop até breakeven  (= 10pt ES)
   stepProfitUsd: 250,                   // a cada +US$ deste passo de lucro...           (= 5pt ES)
   stepStopUsd: 250,                     // ...o stop sobe US$ deste tanto (em pontos/mult)
@@ -278,7 +280,7 @@ function createSimEngine({ persistPath, historyDir, params, emitEvent } = {}) {
   }
 
   // 1 passo do motor (chamado a cada poll do BFF).
-  function tick({ anchor, esSpot, nqSpot, nowIso, priceSource, replay, pct, hiro, rth }) {
+  function tick({ anchor, esSpot, nqSpot, nowIso, priceSource, replay, pct, hiro, rth, gateOpen }) {
     flushPending();   // B3: nenhuma decisão nova por cima de evento ainda não emitido (falha => o tick lança)
     esSpot = pxOrNull(esSpot); nqSpot = pxOrNull(nqSpot);   // (2026-09-16) preco invalido = ausente (nunca 0)
     const dir = anchor && anchor.dir ? anchor.dir : 'NEUTRO';
@@ -355,7 +357,7 @@ function createSimEngine({ persistPath, historyDir, params, emitEvent } = {}) {
       const cooldownOk = !st.cooldownUntil || Date.parse(now) >= Date.parse(st.cooldownUntil);
       const freshOk = !P.requireFreshFourOfFour || st.armed;
       const gateOk = strength === 4 && (dir === 'LONG' || dir === 'SHORT') && cooldownOk && freshOk && esSpot != null && nqSpot != null;
-      st.lastEntryBlock = gateOk ? pctEntryBlock(dir, pct, hiro, rth, now) : null;
+      st.lastEntryBlock = !gateOk ? null : (P.requireGateOpen && gateOpen !== true) ? 'gate_nao_open' : pctEntryBlock(dir, pct, hiro, rth, now);
       if (gateOk && !st.lastEntryBlock) {
         st.side = dir;
         st.legs.es = openLeg(esSpot);
@@ -478,4 +480,20 @@ function createSimEngine({ persistPath, historyDir, params, emitEvent } = {}) {
   return { tick, getState, reset, applyExec, params: P };
 }
 
-module.exports = { validPx, pxOrNull, recPrecoInvalido, createSimEngine, DEFAULT_PARAMS };
+// (2026-10-14 R1–R5) Entradas do filtro a partir do payload que o BFF JÁ lê (gexbot :3457 '/', oi-latest.json):
+// signals.{ts,ES,NQ}.{bull_pct,bear_pct,direction} + HIRO convergente medido contra a direção do Gate
+// (hiroFor(sym, dir) = c2ForSym(...).confirm no BFF). Puro; payload ausente/erro => pct null (o motor bloqueia).
+function simEntryInputs({ gex, gate, rth, hiroFor }) {
+  const sig = gex && !gex._err && gex.signals && typeof gex.signals === 'object' ? gex.signals : null;
+  const pick = (s) => s && typeof s === 'object' ? { bull_pct: s.bull_pct, bear_pct: s.bear_pct, direction: s.direction || null } : null;
+  const pct = sig ? { ts: typeof sig.ts === 'number' ? sig.ts : null, es: pick(sig.ES), nq: pick(sig.NQ) } : null;
+  const dir = gate && gate.anchor ? gate.anchor.dir : null;
+  let hiro = null;
+  if ((dir === 'LONG' || dir === 'SHORT') && typeof hiroFor === 'function') {
+    const conf = (sym) => { try { return hiroFor(sym, dir) || 'N/A'; } catch { return 'N/A'; } };
+    hiro = { es: conf('ES'), nq: conf('NQ') };
+  }
+  return { pct, hiro, rth: typeof rth === 'boolean' ? rth : undefined, gateOpen: !!(gate && gate.open === true) };
+}
+
+module.exports = { validPx, pxOrNull, recPrecoInvalido, createSimEngine, DEFAULT_PARAMS, simEntryInputs };
--- base/bff/aot-bff.js
+++ candidate/bff/aot-bff.js
@@ -54,7 +54,7 @@
   return out;
 }
 const indicators = require('./aot-indicators');   // recálculo dos .cs Alfa Omega (NT8 fechado)
-const { createSimEngine } = require('./aot-sim');  // Simulador de Automação (motor de estados; off por padrão)
+const { createSimEngine, simEntryInputs } = require('./aot-sim');  // Simulador de Automação (motor de estados; off por padrão)
 const gblocks = require('./aot-gamma-blocks');     // blocos de gamma por strike/região (07/08/2026)
 const mqStrat = require('./aot-menthorq-strategies');  // 11 estrategias de nivel + confirmacao por hedge (18/08/2026)
 const { passThroughAlfabot } = require('./aot-alfabot-signal');
@@ -2324,7 +2324,9 @@
       const simReplay = !!REPLAY || !!(ao && ao.isReplay);
       // (2026-10-02, invictus/exec v1) aplica o que o NT8 executou ANTES do tick — try proprio: falha na ingestao nunca derruba o tick
       try { simExecIngest({ esSpot, nqSpot, nowIso }); } catch (e) { console.warn('[sim] exec ingest:', (e && e.message) || e); }
-      STATE.sim = simEngine.tick({ anchor: gate.anchor, esSpot, nqSpot, nowIso, priceSource: SIM_PRICE_SOURCE, replay: simReplay });   // FASE 0: tag replay tb do bridge (NT8 Market Replay) -> trade não contamina histórico real
+      // (2026-10-14 R1–R5) filtro bull_pct/bear_pct + HIRO + RTH + Gate OPEN — só restringe a entrada (Gate 4/4 obrigatório).
+      const simIn = simEntryInputs({ gex, gate, rth: t.rth, hiroFor: (sym, d) => c2ForSym(sym, d, gex && !gex._err ? gex.flow_hiro : null, t.rth).confirm });
+      STATE.sim = simEngine.tick(Object.assign({ anchor: gate.anchor, esSpot, nqSpot, nowIso, priceSource: SIM_PRICE_SOURCE, replay: simReplay }, simIn));   // FASE 0: tag replay tb do bridge (NT8 Market Replay) -> trade não contamina histórico real
       // rótulo da fonte de preço ativa — p/ o painel/Deep Dive nunca confundir P&L teste vs real
       // (2026-10-01) forReplay = MESMO flag de replay passado ao tick (antes: constante SIM_PRICE_SOURCE==='nt8')
       STATE.sim.priceSource = { id: SIM_PRICE_SOURCE,
```
