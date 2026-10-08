// read-only: runtime Press markers (alfaomega_erros.log, AoPress PRESS_VALID vol/cum/press) x tick-db reconstruction at the same timestamp
const fs=require('fs'),path=require('path');
const {decode}=require('C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/close-divergence-20261001/press-policy/tools/ncd_decode.js');
const NT='C:/Users/ADM/Documents/NinjaTrader 8/db/tick',T0=621355968000000000n,H3=3n*3600n*10000000n;
function lado(r){if(r.code<6)return(r.code&1)?1:-1;const b=r.ex[0],a=r.ex[1];if(a===0&&b!==0)return 1;if(b===0&&a!==0)return -1;return 0;}
const log=fs.readFileSync('C:/Users/ADM/Documents/NinjaTrader 8/alfaomega_erros.log','latin1').split(/\r?\n/).filter(l=>l.includes('AoPress')&&l.includes('PRESS_VALID')&&!l.startsWith('2026-10-07 22:2'));
const ev=[];for(const l of log){const m=/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d).*AoPress: (ES|NQ) PRESS_VALID vol=(\d+) cum=(-?\d+).*press=(-?[\d.]+)/.exec(l);if(!m||+m[4]<1000)continue;ev.push({t:Date.parse(m[1]+'T'+m[2]+'-03:00'),sym:m[3],vol:+m[4],cum:+m[5],press:+m[6],raw:m[1]+' '+m[2]});}
const out=[];
for(const sym of ['ES','NQ']){const mine=ev.filter(e=>e.sym===sym).sort((a,b)=>a.t-b.t);if(!mine.length)continue;const dir=path.join(NT,sym+' 12-26');
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.Last.ncd')).sort().filter(f=>f.slice(0,8)>='20261004');
 const recs=[];for(const f of files){const r=decode(path.join(dir,f));for(const x of r.recs)recs.push([Number((x.t+H3-T0)/10000n),lado(x)*x.vol,x.vol]);}
 recs.sort((a,b)=>a[0]-b[0]);
 for(const e of mine){const sd=new Date(e.t+2*3600e3).toISOString().slice(0,10),s0=Date.parse(sd+'T00:00:00Z')-2*3600e3;
  // cumulative series inside session; find point (<= e.t+1s) whose volume is closest to runtime vol (the marker is written at the first realtime tick; history ends up to 300 s earlier)
  let cv=0,cd=0,best=null,atTs=null;for(const r of recs){if(r[0]<s0)continue;if(r[0]>e.t+1000)break;cv+=r[2];cd+=r[1];if(!best||Math.abs(cv-e.vol)<Math.abs(best.cv-e.vol))best={cv,cd,t:r[0]};atTs={cv,cd};}
  if(!atTs){out.push({e,missing:true});continue;}
  out.push({e,sd,minSess:Math.round((e.t-s0)/60000),db:atTs,best});}}
out.sort((a,b)=>a.e.t-b.e.t);
console.log('runtime marker (BRT)   sym  min_since_18ET | RUNTIME vol cum press | DB@ts vol cum press | vol_err% press_abs_err | DB@closest-vol: dt_s cum press press_abs_err');
const errs=[],errsB=[];let match=0,matchB=0,n=0;
for(const o of out){if(o.missing){console.log(o.e.raw,o.e.sym,'NO TICK DATA');continue;}const p=o.db.cv?o.db.cd/o.db.cv:0,pb=o.best.cv?o.best.cd/o.best.cv:0;const er=Math.abs(p-o.e.press),eb=Math.abs(pb-o.e.press);errs.push(er);errsB.push(eb);n++;if(er<=0.001)match++;if(eb<=0.001)matchB++;
 console.log(o.e.raw,o.e.sym.padEnd(3),String(o.minSess).padStart(5),'|',String(o.e.vol).padStart(8),String(o.e.cum).padStart(7),o.e.press.toFixed(5).padStart(9),'|',String(o.db.cv).padStart(8),String(o.db.cd).padStart(7),p.toFixed(5).padStart(9),'|',(100*(o.db.cv-o.e.vol)/o.e.vol).toFixed(2).padStart(6),er.toFixed(5),'|',String(Math.round((o.best.t-o.e.t)/1000)).padStart(5),String(o.best.cd).padStart(7),pb.toFixed(5).padStart(9),eb.toFixed(5));}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:NaN;};
console.log('\nN='+n,'| @timestamp: MATCH(|err|<=0.001)',match+'/'+n,'median err',med(errs).toFixed(5),'max err',Math.max(...errs).toFixed(5),'| @closest-volume: MATCH',matchB+'/'+n,'median err',med(errsB).toFixed(5),'max err',Math.max(...errsB).toFixed(5));
// same verdict vs 0.03?
console.log('step-4 side of 0.03 agrees (runtime vs DB@ts):',out.filter(o=>!o.missing&&((Math.abs(o.e.press)>=0.03)===(Math.abs(o.db.cd/o.db.cv)>=0.03))).length+'/'+n);
