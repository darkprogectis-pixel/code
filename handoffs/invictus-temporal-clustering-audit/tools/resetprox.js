// read-only: real entries vs accumulator-reset events (session start 18:00 ET, tape publisher instance change), per-symbol load-aware Press
const fs=require('fs'),path=require('path');const D=__dirname;
const R=JSON.parse(fs.readFileSync(path.join(D,'replay_out.json'),'utf8')),EN=JSON.parse(fs.readFileSync(path.join(D,'entries.json'),'utf8')),PB=JSON.parse(fs.readFileSync(path.join(D,'pubs.json'),'utf8'));
const TK=JSON.parse(fs.readFileSync(path.join(D,'ticks_all.json'),'utf8'));
const P1S=Date.parse('2026-10-02T00:00:00Z'),MF=0.03,NS=82800;
const chg={ES:[],NQ:[]};let pe=null,pn=null;for(const o of PB.samples){if(o[1]>=0&&o[1]!==pe){if(o[1]>0)chg.ES.push(o[0]);pe=o[1];}if(o[2]>=0&&o[2]!==pn){if(o[2]>0)chg.NQ.push(o[0]);pn=o[2];}}
console.log('publisher instance changes (id>0): ES',chg.ES.length,'NQ',chg.NQ.length,'| audit publisher samples start',new Date(PB.samples[0][0]).toISOString());
const last=(a,t)=>{let r=0;for(const x of a){if(x<=t)r=x;else break;}return r;};
const dayOf=t=>{const sd=new Date(t+2*3600e3).toISOString().slice(0,10);const o=R.days[sd];if(!o)return null;const s=Math.floor((t-o.t0)/1000);return s>=0&&s<NS?{o,s,m:Math.min(1379,Math.floor(s/60))}:null;};
const pct=(a,p)=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
function st(t){const k=dayOf(t);if(!k)return null;const r=k.o.M[k.m];const res={};
 for(const [sym,iv,ic,arr] of [['ES',8,10,chg.ES],['NQ',9,11,chg.NQ]]){const L=last(arr,t);const reset=Math.max(k.o.t0,L);let p;
  if(L>k.o.t0){const b=k.o.M[Math.min(1379,Math.floor((L-k.o.t0)/60000))];const dv=r[iv]-b[iv];p=dv>0?Math.abs((r[ic]-b[ic])/dv):1;res[sym]={p,vol:dv,since:(t-reset)/60000,kind:'PUB'};}
  else res[sym]={p:r[iv]>0?Math.abs(r[ic]/r[iv]):0,vol:r[iv],since:(t-reset)/60000,kind:'SESS'};
  res[sym].full=r[iv]>0?Math.abs(r[ic]/r[iv]):0;}
 return res;}
const pre=EN.org.filter(e=>e.o>=PB.samples[0][0]&&e.o<P1S),post=EN.org.filter(e=>e.o>=P1S);
function rep(nm,E,useEmu){const rows=E.map(e=>({e,s:st(e.o)})).filter(x=>x.s);const since=rows.map(x=>useEmu?Math.max(x.s.ES.since,x.s.NQ.since)*0+Math.min(x.s.ES.since,x.s.NQ.since):Math.min(1e9,(x.e.o-dayOf(x.e.o).o.t0)/60000));
 const emuOk=rows.filter(x=>useEmu?(x.s.ES.p>=MF&&x.s.NQ.p>=MF):(x.s.ES.full>=MF&&x.s.NQ.full>=MF)).length,fullOk=rows.filter(x=>x.s.ES.full>=MF&&x.s.NQ.full>=MF).length;
 console.log('\n'+nm,'entries with tick data:',rows.length,'| RTH',rows.filter(x=>x.e.sessEntry==='RTH').length);
 console.log('  minutes since most recent accumulator reset (session start'+(useEmu?' or publisher instance change, either symbol':'')+'): median',pct(since,.5).toFixed(0),'p75',pct(since,.75).toFixed(0),'p90',pct(since,.9).toFixed(0),'| <=15m',(100*since.filter(v=>v<=15).length/since.length).toFixed(1)+'%','<=30m',(100*since.filter(v=>v<=30).length/since.length).toFixed(1)+'%','<=60m',(100*since.filter(v=>v<=60).length/since.length).toFixed(1)+'%','<=120m',(100*since.filter(v=>v<=120).length/since.length).toFixed(1)+'%');
 console.log('  step 4 at the entry minute: full-session Press passes',fullOk,'('+(100*fullOk/rows.length).toFixed(1)+'%)','| reset-aware Press passes',emuOk,'('+(100*emuOk/rows.length).toFixed(1)+'%)');
 console.log('  median accumulated volume behind Press at entry: ES',Math.round(pct(rows.map(x=>useEmu?x.s.ES.vol:x.s.ES.vol),.5)),'NQ',Math.round(pct(rows.map(x=>x.s.NQ.vol),.5)),'| median |Press| ES',pct(rows.map(x=>x.s.ES.p),.5).toFixed(4),'NQ',pct(rows.map(x=>x.s.NQ.p),.5).toFixed(4));
 const rth=rows.filter(x=>x.e.sessEntry==='RTH');if(rth.length){const s2=rth.map(x=>Math.min(x.s.ES.since,x.s.NQ.since));console.log('  RTH entries: median min since reset',pct(s2,.5).toFixed(0),'| <=60m',(100*s2.filter(v=>v<=60).length/s2.length).toFixed(1)+'%','| preceded by publisher change in-session (either sym):',rth.filter(x=>x.s.ES.kind==='PUB'||x.s.NQ.kind==='PUB').length,'/',rth.length,'| reset-aware Press passes',rth.filter(x=>x.s.ES.p>=MF&&x.s.NQ.p>=MF).length);}
 return rows;}
rep('PRE-P1S (2026-09-15..10-01), forward-only accumulators per publisher instance',pre,true);
rep('P1S ERA (>=2026-10-02), Press = full session or 0',post,false);
// baseline: share of live time within X min of a reset (pre-P1S)
{let tot=0;const c={15:0,30:0,60:0,120:0};for(const d of Object.keys(R.days)){const o=R.days[d];for(let m=0;m<1380;m+=3){const t=o.t0+m*60000;if(t<PB.samples[0][0]||t>=P1S)continue;const s=st(t);const v=Math.min(s.ES.since,s.NQ.since);tot++;for(const k of Object.keys(c))if(v<=+k)c[k]++;}}
 console.log('\nBASELINE pre-P1S: share of market time within N min of a reset:',Object.keys(c).map(k=>'<='+k+'m '+(100*c[k]/tot).toFixed(1)+'%').join(' | '));}
// cluster starts vs resets
{const cl=EN.clusters.filter(c=>c.start>=PB.samples[0][0]&&c.start<P1S&&dayOf(c.start));const v=cl.map(c=>{const s=st(c.start);return Math.min(s.ES.since,s.NQ.since);});
 console.log('CLUSTER STARTS pre-P1S n='+cl.length+': minutes since reset median',pct(v,.5).toFixed(0),'p75',pct(v,.75).toFixed(0),'| <=15m',v.filter(x=>x<=15).length,'<=30m',v.filter(x=>x<=30).length,'<=60m',v.filter(x=>x<=60).length,'>120m',v.filter(x=>x>120).length);
 const cl2=EN.clusters.filter(c=>c.start>=P1S&&dayOf(c.start));console.log('CLUSTER STARTS P1S era n='+cl2.length+': minutes since 18:00 ET session start:',cl2.map(c=>Math.round((c.start-dayOf(c.start).o.t0)/60000)).join(', '));}
// runtime tick step-4 verdict agreement using reset-aware Press (pre-P1S)
{let n=0,aF=0,aE=0,rtOk=0,eOk=0,both=0;for(const x of TK){if(x[2]||x[0]<PB.samples[0][0]||x[0]>=P1S)continue;const rc=x[1]==='4_FORCE'?4:x[1]==='OK_4of4'?5:0;if(!rc)continue;const s=st(x[0]);if(!s)continue;n++;const vE=(s.ES.p>=MF&&s.NQ.p>=MF)?5:4,vF=(s.ES.full>=MF&&s.NQ.full>=MF)?5:4;if(vE===rc)aE++;if(vF===rc)aF++;if(rc===5){rtOk++;if(vE===5)both++;}if(vE===5)eOk++;}
 console.log('\nRUNTIME step-4 verdict (pre-P1S ticks reaching step 4) n='+n+': full-session Press agrees',(100*aF/n).toFixed(1)+'%','| reset-aware agrees',(100*aE/n).toFixed(1)+'%','| runtime OK ticks',rtOk,'of which reset-aware also OK',both,'('+(100*both/Math.max(1,rtOk)).toFixed(0)+'%)');}
