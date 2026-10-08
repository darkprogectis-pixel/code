// read-only: counterfactual motor emulation (remove step 4) + dead-time decomposition + API evidence
const fs=require('fs'),path=require('path'),rl=require('readline');const D=__dirname;
const R=JSON.parse(fs.readFileSync(path.join(D,'replay_out.json'),'utf8')),EN=JSON.parse(fs.readFileSync(path.join(D,'entries.json'),'utf8'));
const TK=JSON.parse(fs.readFileSync(path.join(D,'ticks_all.json'),'utf8'));
const NS=82800,END=Date.parse('2026-10-08T00:00:00Z');
const pct=(a,p)=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
const fm=s=>s>=3600?(s/3600).toFixed(1)+'h':(s/60).toFixed(0)+'m';
const ET=ms=>new Date(ms-4*3600e3);
function openSec(a,b){let s=0;for(let t=a;t<b;t+=60e3){const d=ET(t),h=d.getUTCHours(),wd=d.getUTCDay();if(!(h===17||wd===6||(wd===5&&h>=17)||(wd===0&&h<18)))s+=60;}return s;}
const days=Object.keys(R.days).sort();
function emu(okFn){const e=[];for(const d of days){const o=R.days[d];const cat=new Int8Array(new Uint8Array(Buffer.from(o.catB,'base64')).buffer);let side=0,armed=true,cool=0;
 for(let s=0;s<NS;s+=20){const c=cat[s];if(c<4)armed=true;if(side&&c===3){side=0;cool=s+60;armed=false;}if(!side&&okFn(c)&&s>=cool&&armed){side=1;armed=false;const t=o.t0+s*1000;if(t<END)e.push(t);}}}return e;}
function stats(nm,e){const g=[];for(let i=1;i<e.length;i++)g.push(openSec(e[i-1],e[i]));const hh=new Array(24).fill(0);e.forEach(t=>hh[ET(t).getUTCHours()]++);
 const top3=hh.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,3).reduce((s,x)=>s+x[0],0);
 console.log(nm.padEnd(34),'entries',String(e.length).padStart(5),'| gap(market-open) median',fm(pct(g,.5)).padStart(5),'p90',fm(pct(g,.9)).padStart(6),'max',fm(Math.max(...g)).padStart(6),'| gaps>2h',g.filter(x=>x>7200).length,'>4h',g.filter(x=>x>14400).length,'>8h',g.filter(x=>x>28800).length,'| share in 18-20h ET',(100*(hh[18]+hh[19]+hh[20])/e.length).toFixed(0)+'%','| RTH(10-15h)',hh.slice(10,16).reduce((a,b)=>a+b,0));}
console.log('COUNTERFACTUAL (same ticks, same ME/MVI, same motor; 18 full sessions 09-14..10-07):');
stats('steps 1-3 only (no force step)',emu(c=>c>=4));stats('BASE/P-RTH1 (|Press|>=0.03)',emu(c=>c===5));stats('P-GCAP (LimiarForca)',R.entries.GCAP.filter(t=>t<END));
const real=EN.org.map(e=>e.o).filter(t=>t>=R.days[days[0]].t0&&t<END);stats('REAL runtime entries (same span)',real);
// dead-time decomposition (market-open minutes >=60 min away from any real trade)
const tr=EN.org.map(e=>[e.o,e.c]);let ti=0;const dec={NO_ENGINE_TICK:0,'1_TAPE':0,'2_UNDEFINED':0,'3_DIVERGENT':0,'4_FORCE':0,'OK_4of4':0};let tot=0;
const t0=Date.parse('2026-09-15T04:40:00Z');
for(let t=t0;t<END;t+=60e3){const d=ET(t),h=d.getUTCHours(),wd=d.getUTCDay();if(h===17||wd===6||(wd===5&&h>=17)||(wd===0&&h<18))continue;if(tr.some(x=>t>=x[0]-3600e3&&t<=x[1]+3600e3))continue;
 while(ti+1<TK.length&&TK[ti+1][0]<=t)ti++;const x=TK[ti];tot++;if(!x||t-x[0]>90e3||x[0]>t)dec.NO_ENGINE_TICK++;else dec[x[1]]=(dec[x[1]]||0)+1;}
console.log('\nDEAD TIME decomposition 09-15..10-07 (market open, >=60 min from any trade): total',(tot/60).toFixed(0)+'h');
for(const k of Object.keys(dec))console.log('  '+k.padEnd(16),(dec[k]/60).toFixed(1).padStart(7)+'h',(100*dec[k]/tot).toFixed(1).padStart(6)+'%');
const live=tot-dec.NO_ENGINE_TICK-dec['1_TAPE'];console.log('  with engine+tape live:',(live/60).toFixed(0)+'h → UNDEFINED',(100*dec['2_UNDEFINED']/live).toFixed(1)+'% DIVERGENT',(100*dec['3_DIVERGENT']/live).toFixed(1)+'% FORCE',(100*dec['4_FORCE']/live).toFixed(1)+'%');
// API evidence: gate_check on real openings
(async()=>{const h={};const api={};let n=0;for(const tag of ['sep','oct']){const r=rl.createInterface({input:fs.createReadStream(path.join(D,'events_'+tag+'.jsonl'))});
 for await(const l of r){if(l.indexOf('"event":"gate_check"')<0)continue;const f=/"fonte":"(nt8_native_decision|aot_canonical_event|[a-z_]*motor[a-z_]*)"/.exec(l);const isMotor=f||/"signal_id":"(MOTOR|NT8|AOT)-/.test(l);if(!isMotor)continue;n++;const res=(/"result":"([^"]+)"\}?$/.exec(l)||/"result":"([^"]+)"/.exec(l)||[])[1]||'?(truncated)';h[res]=(h[res]||0)+1;
  const a=/"api_ecosystem_ready":(true|false)/.exec(l),lo=/"local_market_data_ready":(true|false)/.exec(l),sr=/"estado":"([A-Z_]+)","ready":(true|false)/.exec(l);const k=(sr?'readiness='+sr[1]:'readiness=?')+' api_eco='+(a?a[1]:'n/a');api[k]=(api[k]||0)+1;}}
 console.log('\nAPI EVIDENCE — gate_check records of motor openings: n='+n);console.log('  result:',JSON.stringify(h));console.log('  readiness/api state at opening:',JSON.stringify(api));})();
