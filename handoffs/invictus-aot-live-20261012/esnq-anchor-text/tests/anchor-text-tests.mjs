// Testes A–E da correção do texto do card ÂNCORA ALFA OMEGA (ES/NQ) (só apresentação). node tests/anchor-text-tests.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')), '..');
const fnSrc = (html, name) => { const i = html.indexOf('function '+name+'('); if (i<0) throw new Error('sem '+name);
  let d=0, j=html.indexOf('{', i); for (let k=j; k<html.length; k++){ if(html[k]==='{')d++; else if(html[k]==='}'){ d--; if(!d) return html.slice(i,k+1);} } };
const load = (file, name) => { const html = fs.readFileSync(path.join(D, file), 'utf8'); const el = { className:'', innerHTML:'' };
  const ctx = { document:{ getElementById:()=>el }, esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])), dirClass:()=>'neutral', aocDirClass:()=>'neutral' };
  vm.createContext(ctx); vm.runInContext(fnSrc(html, name), ctx); return g => { el.innerHTML=''; el.className=''; ctx[name](g); return { html: el.innerHTML, cls: el.className }; }; };
const ABS = 'sem radar, nenhum veredito é emitido', WAIT = 'radar 4/4 atendido · gate não liberou direção';
// fixtures = saída real de buildGate (aot-bff.js L838–891, inalterado) para cada ramo de reason
const fx = {
  waiting: { source:'alfaomega', online:true, ready:true, tapeLive:true, strength:4, anchor:{dir:'NEUTRO',strength:4,why:'forca fraca ES/NQ'}, open:false, state:'CLOSED', dir:'NEUTRO', reason:'Radar 4/4 FECHADO (os 4 ME/MVI concordam), mas o gate não liberou direção — forca fraca ES/NQ. Confluência existe; o que falta é intensidade de fluxo. Nenhum veredito é emitido.', why:'forca fraca ES/NQ' },
  incompleto: { online:true, ready:true, tapeLive:true, strength:2, anchor:{dir:'NEUTRO',strength:2,why:'ES indefinido'}, open:false, state:'CLOSED', dir:'NEUTRO', reason:'Radar ES+NQ incompleto (2/4) — ES indefinido. Sistema esperando confirmação de fluxo agressor até fechar 4/4.', why:'ES indefinido' },
  zero: { online:true, ready:true, tapeLive:true, strength:0, open:false, state:'CLOSED', dir:'NEUTRO', reason:'Radar ES+NQ incompleto (0/4)' },
  stale: { online:true, ready:true, tapeLive:false, strength:4, open:false, state:'CLOSED', dir:'NEUTRO', reason:'Tape parado (fora de pregão / sem movimento) — o radar não valida' },
  staleDir: { online:true, ready:true, tapeLive:false, strength:4, open:false, state:'CLOSED', dir:'SHORT', reason:'Tape sem atualização de preço há 2min DURANTE o pregão' },
  nullStrength: { online:true, ready:true, tapeLive:true, strength:null, open:false, state:'CLOSED', dir:'NEUTRO', reason:'Radar ES+NQ incompleto (?/4)' },
  offline: { online:false, ready:false, tapeLive:false, strength:null, open:false, state:'OFFLINE', dir:'NEUTRO', reason:'Ponte Alfa Omega :5151 fora do ar' },
  open: { online:true, ready:true, tapeLive:true, strength:4, open:true, state:'OPEN', dir:'SHORT', reason:'Radar formado 4/4 · tape ao vivo · direção SHORT. Gate aberto — vereditos liberados.' },
  empty: {},
};
let pass=0, fail=0; const t=(n,c,info='')=>{ c?pass++:fail++; console.log((c?'PASS':'FAIL')+' '+n+(info?' — '+info:'')); };
for (const [file, name] of [['index.html','renderGate'],['auto.html','aocRenderGate']]) {
  const base = load('base/'+file, name), cand = load('candidate/'+file, name);
  const w = cand(fx.waiting);
  t(`A ${file} radar 4/4 fechado sem direção: texto contraditório ausente`, !w.html.includes(ABS));
  t(`A ${file} 4/4 sem direção: consequência coerente (radar 4/4 atendido, nenhum veredito)`, w.html.includes(WAIT) && w.html.includes('nenhum veredito é emitido'));
  t(`A ${file} base reproduz o defeito`, base(fx.waiting).html.includes(ABS));
  for (const k of ['incompleto','zero','stale','offline'])
    t(`B ${file} radar ausente (${k}): mensagem de ausência aparece`, cand(fx[k]).html.includes(ABS) && !cand(fx[k]).html.includes(WAIT));
  t(`C ${file} 4/4 sem direção: badge ESPERANDO CONFIRMAÇÃO, classe e reason do BFF preservados`, w.html.includes('ESPERANDO CONFIRMAÇÃO') && w.cls===base(fx.waiting).cls && w.html.includes(fx.waiting.reason.slice(0,40)));
  for (const k of ['stale','staleDir','nullStrength','offline','empty'])
    t(`D ${file} dado ausente/stale (${k}): nenhuma confirmação falsa`, !cand(fx[k]).html.includes(WAIT) && !cand(fx[k]).html.includes('GATE ABERTO'));
  for (const k of Object.keys(fx).filter(k=>k!=='waiting'))
    t(`E ${file} regressão (${k}): saída idêntica à base`, JSON.stringify(cand(fx[k]))===JSON.stringify(base(fx[k])));
  const bl=fs.readFileSync(path.join(D,'base',file),'utf8').split('\n'), cl=fs.readFileSync(path.join(D,'candidate',file),'utf8').split('\n');
  let i=0; while(i<bl.length&&bl[i]===cl[i]) i++; let jb=bl.length-1, jc=cl.length-1; while(jb>=i&&bl[jb]===cl[jc]){jb--;jc--;}
  const removed=bl.slice(i,jb+1), added=cl.slice(i,jc+1);
  t(`E ${file} diff restrito ao conseq do ES/NQ (−${removed.length}/+${added.length} linhas, linha ${i+1})`,
    removed.length===1 && added.length===2 && removed[0].includes('nenhum veredito é emitido') && added.every(l=>l.includes('g-consequence')) && fnSrc(bl.join('\n'),name).includes(removed[0].trim()));
}
console.log(`\n${pass}/${pass+fail} PASS`); process.exitCode = fail ? 1 : 0;
