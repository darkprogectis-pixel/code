# JEV DIFF — card ÂNCORA GC·SI: texto contraditório "sem radar" com radar 4/4 (só apresentação)

## Defeito (observado no Chrome 14/10 17:58Z, commit 0a41d48)
O card ÂNCORA GC·SI mostrava "→ sem radar, sem leitura de confluência GC·SI" junto de "Radar 4/4 SHORT · tape ao vivo · força insuficiente".

## Causa provada
`public/index.html` `gcsiGate()` (L1022–1023) e `public/auto.html` `aocGcsiGate()` (L696) exibem essa consequência para QUALQUER estado != 'open'.
Pelo contrato do BFF (`aot-bff.js` L1153–1161, inalterado), `phase` vale:
- `ESPERANDO_CONFIRMACAO`, quando `radarOpen` (legs ∧ ready ∧ tapeLive ∧ strength==4 ∧ direção) ∧ ¬forceOk;
- `SEM_SINAL`, `OFFLINE` ou `UNAVAILABLE` nos outros casos.
No estado de espera o gate é `state=CLOSED`, então a UI caía no texto de ausência de radar, o que é falso.
Reproduzido em teste: a base gera o texto com o fixture ESPERANDO_CONFIRMACAO.

## Diff completo (staging; produção intocada)
```diff
--- base/index.html	2026-10-14 15:05:16.773497100 -0300
+++ candidate/index.html	2026-10-14 15:05:16.971873600 -0300
@@ -1020,7 +1020,8 @@
   const tapeOn=!!g.tapeLive;
   const dirTxt = open ? '<span class="g-dir">'+(semForca?'direção do tape':'direção')+' <b class="num" style="color:var(--'+dirClass(g.dir)+')">'+esc(g.dir||'—')+'</b></span>' : '';
   const conseq = semForca ? '<div class="g-consequence">→ passos 1–3 do radar atendidos · etapa de força sem fonte para GC/SI · gate não declarado aberto</div>'
-    : open ? '' : '<div class="g-consequence">→ sem radar, sem leitura de confluência GC·SI</div>';
+    : open ? '' : g.phase==='ESPERANDO_CONFIRMACAO' ? '<div class="g-consequence">→ radar 4/4 atendido · força insuficiente · gate fechado, sem direção e sem ordem</div>'
+    : '<div class="g-consequence">→ sem radar, sem leitura de confluência GC·SI</div>';
   el.className='gate '+(semForca?'closed':open?'open':state==='closed'?'closed':'offline');
   el.innerHTML=head(badge)
     +'<div class="g-body"><div class="g-strength"><div class="ss">'+segs+'</div>'
--- base/auto.html	2026-10-14 15:05:16.803149100 -0300
+++ candidate/auto.html	2026-10-14 15:05:16.973380600 -0300
@@ -693,7 +693,8 @@
   const segs=[0,1,2,3].map(i=>'<span class="'+(i<str?'on':'off')+'"></span>').join('');
   const tapeOn=!!g.tapeLive;
   const dirTxt = open ? '<span class="aoc-g-dir">direção <b class="num" style="color:var(--'+aocDirClass(g.dir)+')">'+esc(g.dir||'—')+'</b></span>' : '';
-  const conseq = open ? '' : '<div class="aoc-g-consequence">→ sem radar, sem leitura de confluência GC·SI</div>';
+  const conseq = open ? '' : g.phase==='ESPERANDO_CONFIRMACAO' ? '<div class="aoc-g-consequence">→ radar 4/4 atendido · força insuficiente · gate fechado, sem direção e sem ordem</div>'
+    : '<div class="aoc-g-consequence">→ sem radar, sem leitura de confluência GC·SI</div>';
   el.className='aoc-gate '+(open?'open':state==='closed'?'closed':'offline');
   el.innerHTML=head(badge)
     +'<div class="aoc-g-body"><div class="aoc-g-strength"><div class="aoc-ss">'+segs+'</div>'
```
Só a linha `conseq` muda: lê `g.phase`, campo já publicado pelo BFF. Nenhuma lógica nova de gate ou confluência. Badge, classe CSS, barra de força, `reason`, direção e cards GC/SI ficam idênticos. ES/NQ (L737), Russell, HIRO, sim, histórico e executor não são tocados. `aot-bff.js` e o motor também não.

## Testes
- `tests/anchor-text-tests.mjs` **42/42 PASS**. Extrai as funções reais dos HTML base e candidato e roda em vm com fixtures:
  - A. 4/4 + ESPERANDO_CONFIRMACAO: o texto contraditório some e aparece "radar 4/4 atendido · força insuficiente · gate fechado, sem direção e sem ordem". A base reproduz o defeito.
  - B. SEM_SINAL, stale e offline: a mensagem de ausência continua.
  - C. Força fraca: badge ESPERANDO CONFIRMAÇÃO, classe e reason preservados.
  - D. Dado stale, sem phase, UNAVAILABLE, null ou offline: nunca há confirmação falsa.
  - E. Saída byte a byte igual à base em todos os outros estados (semSinal, stale, noPhase, offline, unavailable, confirmed, openNoForce, null). Diff restrito a −1/+2 linhas por arquivo.
- `tests/apply-script-tests.mjs` **7/7 PASS**. Sandbox: checagem, apply, reaplicar, rollback, conflito sem escrita, falha do servidor com restauração automática. Em produção só o modo checagem, com as preimagens conferidas.
- Chrome, via preview GET-only `:3613` (candidato + dados reais do `:3600`): com radar 2/4 (SEM_SINAL) a mensagem de ausência aparece corretamente.

## Deploy (NÃO executado; precisa de autorização do operador)
`bash handoffs/invictus-aot-live-20261012/gcsi-anchor-text/apply-anchor-text.sh --apply`. Copia os 2 HTML com SHA conferido e backup em `_backups/gcsi-anchor-text-20261014`. O BFF lê `public/` do disco a cada requisição (`serveStatic` → `fs.readFile`), então **não há reinício**. Rollback: `--rollback`.
Preimagens: index `b6ac8094…`, auto `5e8441eb…`. Candidatos: index `e7819fd1…`, auto `d4860131…`.
