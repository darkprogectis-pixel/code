// Testes A–E da correção do texto do card ÂNCORA GC·SI (só apresentação). node tests/anchor-text-tests.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')), '..');
const fnSrc = (html, name) => { const i = html.indexOf('function '+name+'('); if (i<0) throw new Error('sem '+name);
  let d=0, j=html.indexOf('{', i); for (let k=j; k<html.length; k++){ if(html[k]==='{')d++; else if(html[k]==='}'){ d--; if(!d) return html.slice(i,k+1);} } };
const load = (file, name) => { const html = fs.readFileSync(path.join(D, file), 'utf8'); const el = { className:'', innerHTML:'' };
  const ctx = { document:{ getElementById:()=>el }, esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])), dirClass:()=>'neutral', aocDirClass:()=>'neutral' };
  vm.createContext(ctx); vm.runInContext(fnSrc(html, name), ctx); return g => { el.innerHTML=''; el.className=''; ctx[name](g); return { html: el.innerHTML, cls: el.className }; }; };
const ABS = 'sem radar, sem leitura de confluência GC·SI', WAIT = 'radar 4/4 atendido · força insuficiente';
const fx = {
  waiting: { online:true, ready:true, tapeLive:true, strength:4, open:false, state:'CLOSED', phase:'ESPERANDO_CONFIRMACAO', dir:'NEUTRO', radarDir:'SHORT', radarOpen:true, reason:'ESPERANDO CONFIRMAÇÃO — Radar 4/4 SHORT · tape ao vivo · força insuficiente (forca fraca GC/SI). Sem direção, sem ordem.', forceStep:{applied:true,status:'WEAK'} },
  semSinal: { online:true, ready:true, tapeLive:true, strength:2, open:false, state:'CLOSED', phase:'SEM_SINAL', dir:'NEUTRO', radarDir:'NEUTRO', radarOpen:false, reason:'sem sinal', forceStep:{applied:false,status:'NOT_REACHED'} },
  stale: { online:true, ready:true, tapeLive:false, strength:4, open:false, state:'CLOSED', phase:'SEM_SINAL', dir:'NEUTRO', radarDir:'SHORT', radarOpen:false, reason:'tape parado' },
  noPhase: { online:true, tapeLive:true, strength:4, open:false, state:'CLOSED', dir:'NEUTRO', reason:'x' },
  offline: { online:false, tapeLive:false, strength:0, open:false, state:'OFFLINE', phase:'OFFLINE', dir:'NEUTRO', reason:'ponte fora' },
  unavailable: { state:'UNAVAILABLE', phase:'UNAVAILABLE', reason:'sem pernas' },
  confirmed: { online:true, tapeLive:true, strength:4, open:true, state:'OPEN', phase:'CONFIRMADO', dir:'SHORT', radarDir:'SHORT', radarOpen:true, reason:'ok', forceStep:{applied:true,status:'OK'} },
  openNoForce: { online:true, tapeLive:true, strength:4, open:true, state:'OPEN', phase:'CONFIRMADO', dir:'SHORT', reason:'ok' },
  nul: null,
};
let pass=0, fail=0; const t=(n,c,info='')=>{ c?pass++:fail++; console.log((c?'PASS':'FAIL')+' '+n+(info?' — '+info:'')); };
for (const [file, name] of [['index.html','gcsiGate'],['auto.html','aocGcsiGate']]) {
  const base = load('base/'+file, name), cand = load('candidate/'+file, name);
  const w = cand(fx.waiting);
  t(`A ${file} radar 4/4 + ESPERANDO_CONFIRMACAO: texto contraditório ausente`, !w.html.includes(ABS));
  t(`A ${file} ESPERANDO_CONFIRMACAO: consequência coerente (radar 4/4 atendido, sem ordem)`, w.html.includes(WAIT) && w.html.includes('sem ordem'));
  t(`A ${file} base reproduz o defeito`, base(fx.waiting).html.includes(ABS));
  for (const k of ['semSinal','stale','offline'])
    t(`B ${file} radar ausente (${k}): mensagem de ausência aparece`, cand(fx[k]).html.includes(ABS) && !cand(fx[k]).html.includes(WAIT));
  t(`C ${file} força fraca: badge ESPERANDO CONFIRMAÇÃO, classe e reason do BFF preservados`, w.html.includes('ESPERANDO CONFIRMAÇÃO') && w.cls===base(fx.waiting).cls && w.html.includes(fx.waiting.reason) && w.html.includes('4/4'));
  for (const k of ['stale','noPhase','unavailable','nul','offline'])
    t(`D ${file} dado ausente/stale (${k}): nenhuma confirmação falsa`, !cand(fx[k]).html.includes(WAIT) && !cand(fx[k]).html.includes('CONFIRMADO'));
  for (const k of Object.keys(fx).filter(k=>k!=='waiting'))
    t(`E ${file} regressão (${k}): saída idêntica à base`, JSON.stringify(cand(fx[k]))===JSON.stringify(base(fx[k])));
  const bl=fs.readFileSync(path.join(D,'base',file),'utf8').split('\n'), cl=fs.readFileSync(path.join(D,'candidate',file),'utf8').split('\n');
  let i=0; while(i<bl.length&&bl[i]===cl[i]) i++; let jb=bl.length-1, jc=cl.length-1; while(jb>=i&&bl[jb]===cl[jc]){jb--;jc--;}
  const removed=bl.slice(i,jb+1), added=cl.slice(i,jc+1);
  t(`E ${file} diff restrito ao conseq do GC·SI (−${removed.length}/+${added.length} linhas, linha ${i+1})`,
    removed.length===1 && added.length===2 && removed[0].includes('sem leitura de confluência GC·SI') && added.every(l=>l.includes('g-consequence')) && fnSrc(bl.join('\n'),name).includes(removed[0].trim()));
}
console.log(`\n${pass}/${pass+fail} PASS`); process.exitCode = fail ? 1 : 0;

