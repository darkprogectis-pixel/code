// Auditoria histórica SOMENTE LEITURA — ES/NQ cenários A (70) e B (50), HIRO excluído, Gate OPEN 4/4 obrigatório.
const fs=require('fs'),path=require('path');
const [histFile,dataDir,outFile]=process.argv.slice(2);
const H=JSON.parse(fs.readFileSync(histFile,'utf8'));
const all=H.trades.filter(x=>x.fonte==='aot_sim');
const tests=all.filter(x=>x.replay===true);
let real=all.filter(x=>x.replay===false);
// duplicidades: mesmo id ou mesmo (openedAt, side)
const seen=new Set(),dups=[];
real=real.filter(x=>{const k=x.id;const k2=x.openedAt+'|'+x.side;if(seen.has(k)||seen.has(k2)){dups.push(x.id);return false}seen.add(k);seen.add(k2);return true});
// snapshots históricos de signals (relay :3457 / darkcode-sync) que existem em disco
const snaps=[];const srcFiles=[];
for(const f of fs.readdirSync(dataDir)){
  if(!/^(darkcode-.*\.json|oi-.*\.json.*|signal\.json|gl-latest\.json|qd-latest\.json)$/.test(f))continue;
  let o;try{o=JSON.parse(fs.readFileSync(path.join(dataDir,f),'utf8'))}catch{continue}
  const s=o&&o.signals;if(!s||typeof s.ts!=='number')continue;
  snaps.push({file:f,ts:s.ts,ES:s.ES||null,NQ:s.NQ||null});srcFiles.push(f);
}
snaps.sort((a,b)=>a.ts-b.ts);
const ET=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
function rth(iso){const p={};for(const x of ET.formatToParts(new Date(iso)))p[x.type]=x.value;const m=(+p.hour%24)*60+ +p.minute;return !['Sat','Sun'].includes(p.weekday)&&m>=570&&m<960}
function classify(tr,min){
  const t=Date.parse(tr.openedAt);
  // causal: último snapshot com ts <= t, idade <= 90 s
  let s=null;for(const x of snaps){if(x.ts<=t)s=x;else break}
  if(!s||(t-s.ts)/1000>90)return {cls:'INDETERMINADO',why:'sem_snapshot_pct_<=90s',gate:'SEM_HISTORICO'};
  const key=tr.side==='LONG'?'bull_pct':'bear_pct';
  for(const a of ['ES','NQ']){const v=s[a];
    if(!v||typeof v[key]!=='number')return {cls:'INDETERMINADO',why:'pct_ausente_'+a,snap:s.file};
    if(v.direction!==tr.side)return {cls:'REJEITADO',why:(v.direction==='NEUTRO'?'neutro_':'divergente_')+a,snap:s.file};
    if(v[key]<min)return {cls:'REJEITADO',why:'abaixo_'+min+'_'+a,snap:s.file};}
  return {cls:'INDETERMINADO',why:'pct_ok_gate_open_sem_historico',snap:s.file};
}
const r2=v=>Math.round(v*100)/100;
const out={fonte:{ledger:'GET 127.0.0.1:3600/history?days=180 (BFF somente leitura; ledgers C:/Users/ADM/.claude/aot/history/trades-2026-08..10.jsonl)',snapshots:dataDir},
  listados:all.length,testes:tests.length,duplicidades:dups.length,reais:real.length,pnlReais:r2(real.reduce((a,x)=>a+(x.totalUsd||0),0)),
  cobertura:{primeira:real.map(x=>x.openedAt).sort()[0],ultima:real.map(x=>x.openedAt).sort().pop()},
  snapshotsPct:{n:snaps.length,arquivos:srcFiles.length,ts:snaps.map(s=>[s.file,new Date(s.ts).toISOString()])},
  anchor4:real.filter(x=>x.anchorAtEntry&&x.anchorAtEntry.strength===4&&x.anchorAtEntry.dir===x.side).length,
  cenarios:{}};
for(const [nome,min] of [['A_70',70],['B_50',50]]){
  const rows=real.map(tr=>({tr,c:classify(tr,min),rth:rth(tr.openedAt)}));
  const agg=(f)=>{const z=rows.filter(f);return {n:z.length,long:z.filter(r=>r.tr.side==='LONG').length,short:z.filter(r=>r.tr.side==='SHORT').length,rth:z.filter(r=>r.rth).length,foraRth:z.filter(r=>!r.rth).length,pnl:r2(z.reduce((a,r)=>a+(r.tr.totalUsd||0),0))}};
  const motivos={};for(const r of rows)motivos[r.c.why]=(motivos[r.c.why]||0)+1;
  out.cenarios[nome]={aprovados:agg(r=>r.c.cls==='APROVADO'),rejeitados:agg(r=>r.c.cls==='REJEITADO'),indeterminados:agg(r=>r.c.cls==='INDETERMINADO'),total:agg(()=>true),motivos,
    comSnapshot:rows.filter(r=>r.c.snap).map(r=>({id:r.tr.id,openedAt:r.tr.openedAt,side:r.tr.side,snap:r.c.snap,cls:r.c.cls,why:r.c.why,pnl:r.tr.totalUsd}))};
}
fs.writeFileSync(outFile,JSON.stringify(out,null,1));
const sum=JSON.parse(JSON.stringify(out));sum.snapshotsPct.ts=sum.snapshotsPct.ts.length+' (ver arquivo)';console.log(JSON.stringify(sum,null,1));
