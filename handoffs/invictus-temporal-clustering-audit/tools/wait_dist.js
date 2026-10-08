// read-only: distribuicao historica (44 sessoes, modelo aprovado) do tempo de espera ate a proxima aprovacao do passo 4 (ES, NQ, ambos), no RTH
const fs=require('fs'),rl=require('readline');const S={};
const r=rl.createInterface({input:fs.createReadStream(process.argv[2]+'/ref_steps.csv')});
r.on('line',l=>{const x=l.split(',');const k=+x[0],i=+x[1];(S[k]=S[k]||{al:new Uint8Array(4140),e:new Uint8Array(4140),n:new Uint8Array(4140),b:new Uint8Array(4140)});if(x[2]==='4'){S[k].al[i]=1;if(x[7]==='1')S[k].e[i]=1;if(x[8]==='1')S[k].n[i]=1;if(x[6]==='1')S[k].b[i]=1;}});
const pct=(a,p)=>{const s=Float64Array.from(a).sort();const i=(s.length-1)*p;return s[Math.floor(i)];};
r.on('close',()=>{const A=930*3,B=1320*3;const out={};
 for(const [nm,key] of [['ES pass','e'],['NQ pass','n'],['BOTH (ancora 4/4)','b']]){const wMin=[],wAl=[];let cens=0;
  for(const k of Object.keys(S)){const s=S[k];for(let i=A;i<B;i+=3){let j=i,al=0;while(j<B&&!s[key][j]){al+=s.al[j];j++;}if(j>=B){cens++;wMin.push((B-i)/3);wAl.push(al);}else{wMin.push((j-i)/3);wAl.push(al);}}}
  console.log(nm.padEnd(20),'espera no RTH a partir de um minuto qualquer: mediana',pct(wMin,.5).toFixed(0)+' min','p75',pct(wMin,.75).toFixed(0),'p90',pct(wMin,.9).toFixed(0),'p95',pct(wMin,.95).toFixed(0),'p99',pct(wMin,.99).toFixed(0),'| ciclos alinhados de 20 s ate la: mediana',pct(wAl,.5),'p90',pct(wAl,.9),'p95',pct(wAl,.95),'p99',pct(wAl,.99),'| censurados no fim do RTH',(100*cens/wMin.length).toFixed(1)+'%');}
 // P(zero aprovacoes ES em janela de T min com >= m ciclos alinhados amostrados a cada 60 s), e condicionado a NQ ter passado na janela
 for(const T of [12,30,60,120]){let n=0,z=0,nq=0,nqz=0;for(const k of Object.keys(S)){const s=S[k];for(let i=A;i+T*3<B;i+=3){let al=0,e=0,q=0;for(let j=i;j<i+T*3;j+=3){al+=s.al[j];e+=s.e[j];q+=s.n[j];}if(al>=Math.max(3,Math.round(T*0.3))){n++;if(!e)z++;if(q){nq++;if(!e)nqz++;}}}}
  console.log('janela de',T,'min no RTH com alinhamento em >=30% dos minutos: n',n,'| P(ES nunca aprova)',(100*z/n).toFixed(1)+'%','| dado que o NQ aprovou ao menos 1 vez: P(ES nunca aprova)',(100*nqz/Math.max(1,nq)).toFixed(1)+'%');}
 // por sessao: fracao de sessoes em que ES nunca aprova no RTH inteiro
 let ses=0,nev=0;for(const k of Object.keys(S)){ses++;let e=0;for(let j=A;j<B;j++)e+=S[k].e[j];if(!e)nev++;}console.log('sessoes',ses,'| sessoes com ES sem nenhuma aprovacao no RTH inteiro:',nev);});
