// PASSIVE read-only collector: GET http://127.0.0.1:5151/state every 20 s -> data/bridge_5151.csv (runtime Press / anchor). No writes to NT8.
const http = require('http'), fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'bridge_5151.csv');
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, 'ts,dir,strength,why,block,esMe,esMvi,esPress,esState,nqMe,nqMvi,nqPress,nqState,minForce\n');
function once() {
  const rq = http.get('http://127.0.0.1:5151/state', { timeout: 5000 }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const j = JSON.parse(b), a = j.anchor || {}, e = j.es || {}, n = j.nq || {};
    fs.appendFileSync(OUT, [new Date(j.ts).toISOString(), a.dir, a.strength, (a.why || '').replace(/,/g, ';'), a.block || '', e.me, e.mvi, e.press, e.pressState, n.me, n.mvi, n.press, n.pressState, (j.gateParams || {}).minForce].join(',') + '\n'); } catch (x) { } }); });
  rq.on('error', () => { }); rq.on('timeout', () => rq.destroy());
}
once(); setInterval(once, 20000);
