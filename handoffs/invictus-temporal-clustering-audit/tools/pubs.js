// read-only: timeline of the elected tape publisher instance id (ES/NQ) from audit events
const fs=require('fs'),rl=require('readline'),path=require('path');
const out=[];let n=0;
(async()=>{for(const tag of ['sep','oct']){const r=rl.createInterface({input:fs.createReadStream(path.join(__dirname,'events_'+tag+'.jsonl'))});
 for await(const l of r){const ts=l.slice(7,31);const es=/LastUpdate_ES \((publicador #(\d+)|nenhum publicador eleito)\)/.exec(l),nq=/LastUpdate_NQ \((publicador #(\d+)|nenhum publicador eleito)\)/.exec(l);if(!es&&!nq)continue;n++;out.push([Date.parse(ts),es?(es[2]?+es[2]:0):-1,nq?(nq[2]?+nq[2]:0):-1]);}}
 out.sort((a,b)=>a[0]-b[0]);const ch=[];let pe=null,pn=null;for(const o of out){if(o[1]!==pe||o[2]!==pn){ch.push(o);pe=o[1];pn=o[2];}}
 console.log('samples',n,'changes',ch.length,'first',new Date(out[0][0]).toISOString(),'last',new Date(out[out.length-1][0]).toISOString());
 // sampling density
 const g=[];for(let i=1;i<out.length;i++)g.push((out[i][0]-out[i-1][0])/60000);g.sort((a,b)=>a-b);console.log('sample gap min: median',g[g.length>>1].toFixed(1),'p90',g[Math.floor(g.length*.9)].toFixed(1),'max',g[g.length-1].toFixed(0));
 fs.writeFileSync(path.join(__dirname,'pubs.json'),JSON.stringify({samples:out,changes:ch}));
 console.log(ch.map(o=>new Date(o[0]-4*3600e3).toISOString().slice(5,16)+' ES#'+o[1]+' NQ#'+o[2]).join('\n'));})();
