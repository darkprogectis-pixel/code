// Testes das 2 mensagens enganosas (só apresentação): #trigNote do auto.html e selo v2.confluence (auto.html + index.html).
// Executa o trecho REAL extraído de base/ e candidate/ em vm. node tests/misleading-text-tests.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const read = (v, f) => fs.readFileSync(path.join(D, v, f), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) throw new Error('sem ' + a); const j = s.indexOf(b, i); if (j < 0) throw new Error('sem ' + b); return s.slice(i, j); };
// trigNote: do "document.getElementById('trigNote')" até "// P&L herói"
const trig = v => { const src = between(read(v, 'auto.html'), "document.getElementById('trigNote').textContent", '// P&L herói');
  return (a, open) => { const el = { textContent: '' }; const aw = a.dir === 'LONG' || a.dir === 'SHORT' ? a.dir : 'NEUTRO';
    const ctx = { document: { getElementById: () => el }, a, open, aw }; vm.createContext(ctx); vm.runInContext(src, ctx); return el.textContent; }; };
// selo: do "const c=(st.stackMode" até a linha do "else { cf2.className=...'' }" inclusive
const seal = (v, f, dc) => { const s = read(v, f); const i = s.indexOf("const c=(st.stackMode!=='v1'"); const endTok = "cf2.textContent=''; }";
  const src = s.slice(i, s.indexOf(endTok, i) + endTok.length);
  return st => { const cf2 = { className: '', textContent: '' }; const ctx = { st, cf2, [dc]: d => d === 'LONG' ? 'long' : d === 'SHORT' ? 'short' : 'neutral' };
    vm.createContext(ctx); vm.runInContext(src, ctx); return { cls: cf2.className, txt: cf2.textContent }; }; };
let pass = 0, fail = 0; const t = (n, c, i = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (i ? ' — ' + i : '')); };
const ABRINDO = 'abrindo posição';
const tb = trig('base'), tc = trig('candidate');
const A = { n44: { dir: 'NEUTRO', strength: 4 }, l44: { dir: 'LONG', strength: 4 }, s44: { dir: 'SHORT', strength: 4 }, l34: { dir: 'LONG', strength: 3 }, n0: { dir: 'NEUTRO', strength: 0 }, none: { dir: 'NEUTRO', strength: 0 } };
// 1. 4/4 + NEUTRO
t('T1 4/4+NEUTRO: base reproduz "abrindo posição"', tb(A.n44, false).includes(ABRINDO));
t('T1 4/4+NEUTRO: candidato sem "abrindo posição" e diz sem abertura', !tc(A.n44, false).includes(ABRINDO) && tc(A.n44, false).includes('sem abertura'), tc(A.n44, false));
// 2. 4/4 + LONG/SHORT
for (const k of ['l44', 's44']) { const x = tc(A[k], false);
  t(`T2 4/4+${A[k].dir}: condição de entrada atendida com direção, sem afirmar ordem`, x.includes('4/4 · ' + A[k].dir) && x.includes('não é confirmação de ordem') && !x.includes(ABRINDO), x); }
// stale/ausente e regressão do trigNote
for (const k of ['l34', 'n0']) t(`T5 trigNote ${k}: idêntico à base (aguardando 4/4)`, tc(A[k], false) === tb(A[k], false));
for (const k of Object.keys(A)) t(`T5 trigNote posição aberta (${k}): idêntico à base`, tc(A[k], true) === tb(A[k], true));
// 3/4. selo
const G = s => ({ state: s });
const conf = (agree, dir, level) => ({ agree, dir, level, note: '' });
const ST = {
  closedAgreeL: { stackMode: 'v2', gate: G('CLOSED'), v2: { confluence: conf(true, 'LONG', 'CONFIRMADA') } },
  closedAgreeS: { stackMode: 'v2', gate: G('CLOSED'), v2: { confluence: conf(true, 'SHORT', 'MAXIMA') } },
  offlineAgree: { stackMode: 'v2', gate: G('OFFLINE'), v2: { confluence: conf(true, 'LONG', 'CONFIRMADA') } },
  noGateAgree: { stackMode: 'v2', v2: { confluence: conf(true, 'LONG', 'CONFIRMADA') } },
  openAgree: { stackMode: 'v2', gate: G('OPEN'), v2: { confluence: conf(true, 'LONG', 'CONFIRMADA') } },
  openAgreeMax: { stackMode: 'v2', gate: G('OPEN'), v2: { confluence: conf(true, 'SHORT', 'MAXIMA') } },
  closedNoAgree: { stackMode: 'v2', gate: G('CLOSED'), v2: { confluence: conf(false, 'NEUTRO', '—') } },
  openNoAgree: { stackMode: 'v2', gate: G('OPEN'), v2: { confluence: conf(false, 'NEUTRO', '—') } },
  v2err: { stackMode: 'v2', gate: G('CLOSED'), v2: { _err: 'x' } },
  v1: { stackMode: 'v1', gate: G('CLOSED'), v2: { confluence: conf(true, 'LONG', 'CONFIRMADA') } },
  noV2: { stackMode: 'v2', gate: G('CLOSED') },
};
for (const [f, dc] of [['auto.html', 'aocDirClass'], ['index.html', 'dirClass']]) {
  const sb = seal('base', f, dc), sc = seal('candidate', f, dc);
  t(`T3 ${f} base reproduz "CONFIRMADA" com gate CLOSED`, sb(ST.closedAgreeL).txt.includes('CONFIRMADA'));
  for (const k of ['closedAgreeL', 'closedAgreeS', 'offlineAgree', 'noGateAgree']) { const r = sc(ST[k]); const dir = ST[k].v2.confluence.dir;
    t(`T3 ${f} gate≠OPEN + confluência (${k}): informativa, sem CONFIRMADA/MAXIMA, sem cor de sinal, direção preservada`,
      r.txt.includes('Confluência de tape (informativa)') && r.txt.includes('Gate fechado, sem autorização de operação') && r.txt.includes(dir)
      && !/CONFIRMADA|MAXIMA/.test(r.txt) && !/long|short/.test(r.cls) && r.cls.includes('show'), JSON.stringify(r)); }
  for (const k of ['openAgree', 'openAgreeMax']) t(`T4 ${f} gate OPEN + confluência (${k}): idêntico à base`, JSON.stringify(sc(ST[k])) === JSON.stringify(sb(ST[k])));
  for (const k of ['closedNoAgree', 'openNoAgree', 'v2err', 'v1', 'noV2']) t(`T5 ${f} sem confluência/stale/ausente (${k}): idêntico à base, sem confirmação`, JSON.stringify(sc(ST[k])) === JSON.stringify(sb(ST[k])) && !sc(ST[k]).txt.includes('CONFIRMADA'));
}
// 6. regressão: diff restrito aos 2 trechos; resto do arquivo byte a byte
const hunks = f => { const b = read('base', f).split('\n'), c = read('candidate', f).split('\n'); const out = []; let i = 0, j = 0;
  while (i < b.length || j < c.length) { if (b[i] === c[j]) { i++; j++; continue; } const h = { rm: [], add: [] };
    const k = c.indexOf(b[i], j); if (k > j && k - j <= 3) { h.add = c.slice(j, k); j = k; } else { h.rm.push(b[i]); i++; while (c[j] !== b[i] && j < c.length) { h.add.push(c[j]); j++; } } out.push(h); } return out; };
const ha = hunks('auto.html'), hi = hunks('index.html');
t('T6 auto.html: exatamente 2 trechos alterados (trigNote, selo), −1/+2 cada', ha.length === 2 && ha.every(h => h.rm.length === 1 && h.add.length === 2) && ha[0].rm[0].includes('abrindo posição') && ha[1].rm[0].includes('Confluência dupla ES×NQ'), JSON.stringify(ha.map(h => [h.rm.length, h.add.length])));
t('T6 index.html: exatamente 1 trecho alterado (selo), −1/+2', hi.length === 1 && hi[0].rm.length === 1 && hi[0].add.length === 2 && hi[0].rm[0].includes('Confluência dupla ES×NQ'));
for (const f of ['auto.html', 'index.html']) { const c = read('candidate', f);
  for (const k of ['function renderGate(', 'function aocRenderGate(', 'function gcsiGate(', 'function aocGcsiGate(', 'aocRenderFlowRussell', 'gate não liberou direção', 'radar 4/4 atendido · força insuficiente'])
    if (read('base', f).includes(k)) t(`T6 ${f} preserva "${k}"`, c.includes(k)); }
console.log(`\n${pass}/${pass + fail} PASS`); process.exitCode = fail ? 1 : 0;
