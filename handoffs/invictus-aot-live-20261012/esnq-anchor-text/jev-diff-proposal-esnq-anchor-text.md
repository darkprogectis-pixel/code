# JEV DIFF — card ÂNCORA ALFA OMEGA (ES/NQ): texto "sem radar" exibido com Radar 4/4 fechado (só apresentação)

## Defeito
Ordem do operador (14/10/2026): "corrija também o card ES/NQ com o mesmo padrão". Este é o mesmo padrão que o GC·SI já corrigido (`gcsi-anchor-text`, aplicado 18:14Z). O card ÂNCORA ALFA OMEGA mostra "→ sem radar, nenhum veredito é emitido" para TODO estado != open. Isso inclui o caso em que o BFF publica reason "Radar 4/4 FECHADO (os 4 ME/MVI concordam), mas o gate não liberou direção — forca fraca ES/NQ…".

## Causa provada
- `public/index.html` `renderGate()` L737 e `public/auto.html` `aocRenderGate()` L622 têm `conseq = open ? '' : '→ sem radar, nenhum veredito é emitido'`.
- No contrato do BFF `buildGate()` (`aot-bff.js` L838–891, inalterado, sem campo `phase`), esse ramo de reason é exatamente: `online ∧ tapeLive ∧ strength===4 ∧ ¬(dir∈{LONG,SHORT})`, com `state=CLOSED`. O texto de ausência de radar é falso nesse caso.
- Reproduzido em teste: a base gera o texto com o fixture desse ramo.

## Diff completo (staging; produção intocada)
```diff
--- base/index.html	2026-10-14 15:17:07.775690000 -0300
+++ candidate/index.html	2026-10-14 15:17:08.006882000 -0300
@@ -734,7 +734,8 @@
   const segs = [0,1,2,3].map(i=>`<span class="${i<str?'on':'off'}"></span>`).join('');
   const tapeOn = !!g.tapeLive;
   const dirTxt = open ? `<span class="g-dir">direção <b class="num" style="color:var(--long)">${esc(g.dir||'—')}</b></span>` : '';
-  const conseq = open ? '' : `<div class="g-consequence">→ sem radar, nenhum veredito é emitido</div>`;
+  const conseq = open ? '' : (g.tapeLive && g.strength===4 && g.dir!=='LONG' && g.dir!=='SHORT') ? `<div class="g-consequence">→ radar 4/4 atendido · gate não liberou direção · nenhum veredito é emitido</div>`
+    : `<div class="g-consequence">→ sem radar, nenhum veredito é emitido</div>`;
   el.className = 'gate '+state;
   el.innerHTML = `
     <div class="g-head">
--- base/auto.html	2026-10-14 15:17:07.748370800 -0300
+++ candidate/auto.html	2026-10-14 15:17:08.007882100 -0300
@@ -619,7 +619,8 @@
   const segs = [0,1,2,3].map(i=>`<span class="${i<str?'on':'off'}"></span>`).join('');
   const tapeOn = !!g.tapeLive;
   const dirTxt = open ? `<span class="aoc-g-dir">direção <b class="num" style="color:var(--long)">${esc(g.dir||'—')}</b></span>` : '';
-  const conseq = open ? '' : `<div class="aoc-g-consequence">→ sem radar, nenhum veredito é emitido</div>`;
+  const conseq = open ? '' : (g.tapeLive && g.strength===4 && g.dir!=='LONG' && g.dir!=='SHORT') ? `<div class="aoc-g-consequence">→ radar 4/4 atendido · gate não liberou direção · nenhum veredito é emitido</div>`
+    : `<div class="aoc-g-consequence">→ sem radar, nenhum veredito é emitido</div>`;
   el.className = 'aoc-gate '+(open?'open':state==='closed'?'closed':'offline');
   el.innerHTML = `
     <div class="aoc-g-head">
```
- Só a linha `conseq` muda (−1/+2 por arquivo). A condição usa apenas campos já publicados por `buildGate` (`tapeLive`, `strength`, `dir`) e espelha o ramo de reason do próprio BFF; não cria lógica de gate nova.
- `!open` com `tapeLive=true` implica `online` (o BFF zera tapeLive quando offline).
- Tape parado/stale, radar < 4/4, strength null e offline continuam com a mensagem de ausência.
- Badge, classe CSS, barra de força, `reason`, direção e todo o restante do card ficam idênticos.
- Não são tocados: GC·SI (já corrigido), Russell, HIRO, sim, histórico, executor, `aot-bff.js` e o motor.
- Base = produção atual (index `e7819fd1…`, auto `d4860131…`, conferidos servidos pelo :3600 após o apply GC·SI). Candidato: index `4d5cb196…`, auto `a2c342db…`.

## Testes
- `tests/anchor-text-tests.mjs` **44/44 PASS**: funções reais extraídas dos HTML, rodadas em vm com fixtures = saída de buildGate por ramo.
  - A: 4/4 sem direção ⇒ texto contraditório ausente e consequência coerente; a base reproduz o defeito.
  - B: incompleto 2/4, 0/4, stale e offline ⇒ ausência mantida.
  - C: badge ESPERANDO CONFIRMAÇÃO, classe e reason preservados.
  - D: stale (inclusive com dir SHORT), strength null, offline e {} ⇒ nunca há confirmação falsa nem GATE ABERTO.
  - E: saída byte a byte igual à base em todos os outros estados; diff restrito.
- `tests/apply-script-tests.mjs` **7/7 PASS**: sandbox S1–S6; em produção só checagem (P1).

## Deploy (precisa de autorização do operador)
`bash handoffs/invictus-aot-live-20261012/esnq-anchor-text/apply-anchor-text.sh --apply`. SHA conferido, backup em `_backups/esnq-anchor-text-20261014`, sem reinício (o BFF lê `public/` a cada requisição), restauração automática se o :3600 não servir o candidato. Rollback: `--rollback`.
