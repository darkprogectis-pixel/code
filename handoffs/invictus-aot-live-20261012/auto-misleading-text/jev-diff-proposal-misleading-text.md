# JEV DIFF — 2 mensagens enganosas ES/NQ (auto.html #trigNote + selo v2.confluence auto/index) — só apresentação

## Diagnóstico (commits f8fc778, eea4f75; só leitura)
- **D1** `auto.html` L472–473 (`renderSim`, `#trigNote`) mostra "Confluência máxima — abrindo posição." quando `sim.anchor.strength===4`, inclusive com `dir=NEUTRO`. O motor `aot-sim.js` L310 só abre com 4/4 ∧ dir LONG|SHORT (+cooldown/frescor/histerese).
  - Histórico: 727 trades do sim + 378 do robô + 106 DECISION_OPEN, todos 4/LONG|SHORT, zero com NEUTRO.
  - Às 18:29Z o painel exibia "abrindo posição" com 4/4 NEUTRO, sem nenhum evento de exec.
- **D2** `auto.html` L799 e `index.html` L933 mostram `st.v2.confluence` ("◆ Confluência dupla ES×NQ · LONG · CONFIRMADA") com o Gate CLOSED/NEUTRO.
  - `v2.confluence` (`aot-bff.js` `buildV2Stack` L1303–1320) é confluência informativa de tape, sem a etapa de força do Gate.
  - O `level` 'CONFIRMADA' vale para `agree ∧ ¬bothMax`.
  - Nenhum consumidor de ordens a lê.

## Diff completo (staging; produção intocada)
```diff
--- base/index.html	2026-10-14 15:44:13.009673100 -0300
+++ candidate/index.html	2026-10-14 15:44:26.647696700 -0300
@@ -930,7 +930,8 @@
     const cf2=document.getElementById('confluence2');
     if(cf2){
       const c=(st.stackMode!=='v1' && st.v2 && !st.v2._err) ? st.v2.confluence : null;
-      if(c && c.agree){ cf2.className='confluence2 show '+dirClass(c.dir); cf2.textContent='◆ Confluência dupla ES×NQ · '+c.dir+' · '+(c.level||''); }
+      if(c && c.agree && !(st.gate && st.gate.state==='OPEN')){ cf2.className='confluence2 show'; cf2.textContent='◆ Confluência de tape (informativa) ES×NQ · '+c.dir+' — Gate fechado, sem autorização de operação'; }
+      else if(c && c.agree){ cf2.className='confluence2 show '+dirClass(c.dir); cf2.textContent='◆ Confluência dupla ES×NQ · '+c.dir+' · '+(c.level||''); }
       else if(c){ cf2.className='confluence2 show'; cf2.textContent='trilhas independentes — sem confluência dupla'; }
       else { cf2.className='confluence2'; cf2.textContent=''; }
     }
--- base/auto.html	2026-10-14 15:44:12.985359200 -0300
+++ candidate/auto.html	2026-10-14 15:44:26.647696700 -0300
@@ -470,7 +470,8 @@
   ts.textContent = aw==='LONG'?'▲ Long':aw==='SHORT'?'▼ Short':'● Neutro';
   document.getElementById('trigNote').textContent = open
     ? 'Posição aberta e mantida enquanto a direção não virar neutra.'
-    : (a.strength===4?'Confluência máxima — abrindo posição.':'Aguardando confluência máxima (4/4) do radar ES + NQ.');
+    : (a.strength===4 && (aw==='LONG'||aw==='SHORT') ? 'Confluência máxima 4/4 · '+aw+' — condição de entrada atendida; abertura a cargo do motor (não é confirmação de ordem).'
+      : a.strength===4 ? 'Radar 4/4 sem direção liberada pelo gate — sem abertura.' : 'Aguardando confluência máxima (4/4) do radar ES + NQ.');
 
   // P&L herói
   const pnl=sim.pnl||{}; const tot=pnl.totalUsd||0;
@@ -796,7 +797,8 @@
   heroesEl.innerHTML = aocHeroCard('ES · S&amp;P 500', st.symbols.ES, aocV2Row('ES', st) + aocConfAdicionalRow('ES', st)) + aocHeroCard('NQ · Nasdaq 100', st.symbols.NQ, aocV2Row('NQ', st) + aocConfAdicionalRow('NQ', st));
   const cf2=document.getElementById('aocConfluence2');
   const c=(st.stackMode!=='v1' && st.v2 && !st.v2._err) ? st.v2.confluence : null;
-  if(c && c.agree){ cf2.className='aoc-confluence2 show '+aocDirClass(c.dir); cf2.textContent='◆ Confluência dupla ES×NQ · '+c.dir+' · '+(c.level||''); }
+  if(c && c.agree && !(st.gate && st.gate.state==='OPEN')){ cf2.className='aoc-confluence2 show'; cf2.textContent='◆ Confluência de tape (informativa) ES×NQ · '+c.dir+' — Gate fechado, sem autorização de operação'; }
+  else if(c && c.agree){ cf2.className='aoc-confluence2 show '+aocDirClass(c.dir); cf2.textContent='◆ Confluência dupla ES×NQ · '+c.dir+' · '+(c.level||''); }
   else if(c){ cf2.className='aoc-confluence2 show'; cf2.textContent='trilhas independentes — sem confluência dupla'; }
   else { cf2.className='aoc-confluence2'; cf2.textContent=''; }
   const cf=document.getElementById('aocConfluence');
```
- **D1:** usa `a.strength` e `aw` (= `dirWord(a.dir)`), já existentes no mesmo bloco. Não afirma ordem enviada/executada. Com posição aberta (`open`) e fora de 4/4, o texto fica idêntico.
- **D2:** usa `st.gate.state` (contrato `buildGate` existente). Gate ausente/CLOSED/OFFLINE ⇒ texto informativo, sem `level` e sem classe de cor direcional; a direção da confluência continua exibida (significado informativo preservado). Gate OPEN ⇒ idêntico ao atual. Sem confluência, `v2._err`, `stackMode v1` ou `v2` ausente ⇒ idêntico.
- Não tocados: `aot-bff.js`, `aot-sim.js`, motor, executor/robô, Gate, thresholds, estratégias, stops, trailing, contas, ordens, os cards ÂNCORA ES/NQ e GC·SI (já corrigidos), FLOW GC/SI, Russell, HIRO.

## Testes
- `tests/misleading-text-tests.mjs` **47/47 PASS**. Executa em vm o trecho REAL extraído de base e candidato.
  - T1: 4/4+NEUTRO; a base reproduz o defeito; o candidato diz "sem abertura".
  - T2: 4/4+LONG/SHORT mostra condição atendida + "não é confirmação de ordem".
  - T3: Gate CLOSED/OFFLINE/ausente + confluência LONG/SHORT mostra a frase informativa; sem CONFIRMADA/MAXIMA; sem cor; direção preservada.
  - T4: Gate OPEN + confluência fica idêntico à base.
  - T5: stale/ausente/sem confluência/v1/v2 err e posição aberta ficam idênticos e sem confirmação.
  - T6: diff restrito (auto 2 trechos −1/+2, index 1 trecho −1/+2); cards ÂNCORA/GC·SI/Russell preservados.
- `tests/apply-script-tests.mjs` **7/7 PASS** (sandbox S1–S6; P1 produção só checagem, preimagens conferidas).

## Deploy (aprovação manual do operador)
- `bash handoffs/invictus-aot-live-20261012/auto-misleading-text/apply-misleading-text.sh --apply`.
- SHA conferido: preimagens index `4d5cb196…`, auto `a2c342db…`; candidatos index `e3f1e038…`, auto `c26286a9…`.
- Backup em `_backups/auto-misleading-text-20261014`. Sem reinício do BFF (`serveStatic` lê do disco). Restauração automática se o :3600 não servir o candidato. Rollback: `--rollback`.
- Não interfere em posições abertas: só HTML estático.
