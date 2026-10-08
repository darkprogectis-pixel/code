// Compara o harness C# REAL (cs_steps.csv, cs_entries.csv) com o modelo JS aprovado (ref_steps.csv, js_entries.json), passo a passo,
// e calcula as metricas do replay de 44 sessoes sobre as entradas do motor C# real. Uso: node cmp_z30.js <dir>
const fs = require('fs'), path = require('path'), rl = require('readline');
const D = process.argv[2];
const ET = ms => new Date(ms - 4 * 3600e3);
function openSec(a, b) { let s = 0; for (let t = a; t < b; t += 60e3) { const d = ET(t), h = d.getUTCHours(), wd = d.getUTCDay(); if (!(h === 17 || wd === 6 || (wd === 5 && h >= 17) || (wd === 0 && h < 18))) s += 60; } return s; }
const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fm = s => s >= 3600 ? (s / 3600).toFixed(1) + 'h' : (s / 60).toFixed(0) + 'm';
(async () => {
  const A = rl.createInterface({ input: fs.createReadStream(path.join(D, 'ref_steps.csv')) })[Symbol.asyncIterator]();
  const B = rl.createInterface({ input: fs.createReadStream(path.join(D, 'cs_steps.csv')) })[Symbol.asyncIterator]();
  let n = 0, catMis = 0, dirMis = 0, okMis = 0, gEmis = 0, gNmis = 0, maxE = 0, maxN = 0, sumE = 0, zN = 0, invalid = 0, near = 0, okJs = 0, okCs = 0; const ex = [], catX = {};
  for (;;) { const a = await A.next(), b = await B.next(); if (a.done || b.done) { if (a.done !== b.done) console.log('LENGTH MISMATCH'); break; }
    const x = a.value.split(','), y = b.value.split(','); if (x[0] !== y[0] || x[1] !== y[1]) { console.log('KEY MISMATCH', a.value, b.value); break; } n++;
    const cj = +x[2], cc = +y[2]; if (cj !== cc) { catMis++; const k = cj + '>' + cc; catX[k] = (catX[k] || 0) + 1; }
    if (+x[3] !== +y[3]) dirMis++;
    const zje = +x[4], zjn = +x[5], zce = +y[4], zcn = +y[5], vE = y[9] === '1', vN = y[10] === '1';
    if (!vE || !vN) invalid++;
    if (vE) { const e = Math.abs(zje - zce); if (e > maxE) maxE = e; sumE += e; zN++; } if (vN) { const e = Math.abs(zjn - zcn); if (e > maxN) maxN = e; }
    if (x[6] === '1') okJs++; if (y[6] === '1') okCs++;
    if (x[6] !== y[6]) { okMis++; if (ex.length < 12) ex.push(a.value + '  ||  ' + b.value); if (Math.min(Math.abs(Math.abs(zje) - 3.454), Math.abs(Math.abs(zjn) - 3.454)) < 1e-6) near++; }
    if (cj === 4 && cc === 4) { if (x[7] !== y[7]) gEmis++; if (x[8] !== y[8]) gNmis++; } }
  console.log('STEPS compared', n, '(44 sessions x 4140 steps of 20 s)');
  console.log('MATCH_RATE anchor', (100 * (n - okMis) / n).toFixed(6) + '%', '| steps 1-3 category', (100 * (n - catMis) / n).toFixed(6) + '%', '| direction', (100 * (n - dirMis) / n).toFixed(6) + '%');
  console.log('MAX_NUMERIC_ERROR z ES', maxE.toExponential(3), '| z NQ', maxN.toExponential(3), '| mean abs err z ES', (sumE / Math.max(1, zN)).toExponential(3));
  console.log('GATE_MISMATCH_COUNT ES', gEmis, 'NQ', gNmis, '| ANCHOR_MISMATCH_COUNT', okMis, '| CATEGORY_MISMATCH', catMis, JSON.stringify(catX), '| steps with C# window not valid', invalid);
  console.log('anchor OK steps: JS', okJs, 'C#', okCs); if (ex.length) { console.log('first mismatches (js || cs):'); ex.forEach(l => console.log('  ' + l)); }
  // entries: real C# motor vs JS emulation
  const J = JSON.parse(fs.readFileSync(path.join(D, 'js_entries.json'), 'utf8'));
  const L = fs.readFileSync(path.join(D, 'cs_entries.csv'), 'utf8').split('\n').filter(Boolean).map(l => l.split(','));
  const O = L.filter(l => l[0] === 'O').map(l => ({ t: +l[1] - 999, side: l[2] })), Cl = L.filter(l => l[0] === 'C').map(l => ({ t: +l[1], why: l[2], pnl: +l[3] }));
  const js = new Set(J.entries.map(e => e[0])), cs = new Set(O.map(e => e.t));
  const both = [...cs].filter(t => js.has(t)).length;
  console.log('\nMOTOR ENTRIES: C# real', O.length, '| JS emulation', J.entries.length, '| same timestamp', both, '| only C#', O.length - both, '| only JS', J.entries.length - both);
  const t = O.map(e => e.t), g = []; for (let i = 1; i < t.length; i++) g.push(openSec(t[i - 1], t[i])); const hh = new Array(24).fill(0); t.forEach(x => hh[ET(x).getUTCHours()]++);
  let cl = 1; g.forEach(x => { if (x >= 43 * 60) cl++; }); const rth = t.filter(x => { const d = ET(x), h = d.getUTCHours() + d.getUTCMinutes() / 60; return h >= 9.5 && h < 16; }).length;
  const hrs = hh.filter((_, i) => i !== 17), mu = hrs.reduce((a, b) => a + b, 0) / 23, cv = Math.sqrt(hrs.reduce((a, b) => a + (b - mu) ** 2, 0) / 23) / mu;
  const NS = J.sessions.length, why = {}; Cl.forEach(c => why[c.why] = (why[c.why] || 0) + 1); const pn = Cl.map(c => c.pnl);
  console.log('ZSCORE_30_IMPLEMENTADO (motor C# real, ' + NS + ' sessoes):');
  console.log('  TOTAL_ENTRIES', t.length, '| ENTRIES_PER_SESSION', (t.length / NS).toFixed(1), '| CLUSTERS', cl, '| MEDIAN_GAP', fm(pct(g, .5)), '| P90_GAP', fm(pct(g, .9)), '| MAX_GAP', fm(Math.max(...g)));
  console.log('  GAPS_GT_2H', g.filter(x => x > 7200).length, '| GAPS_GT_4H', g.filter(x => x > 14400).length, '| GAPS_GT_8H', g.filter(x => x > 28800).length, '| OVERNIGHT_ENTRIES', t.length - rth, '| RTH_ENTRIES', rth, '| 18_20_ET_SHARE', (100 * (hh[18] + hh[19] + hh[20]) / t.length).toFixed(1) + '%', '| HOURS_WITH_ZERO_ENTRIES', hrs.filter(x => x === 0).length, '| hourCV', cv.toFixed(2));
  console.log('  ENTRIES_BY_HOUR ET 0..23:', hh.join(' '));
  console.log('  DIRECTION_CONSISTENCY 100% by construction (gate requires sign(z) == direction on both symbols)');
  console.log('  closes', Cl.length, JSON.stringify(why), '| PnL descritivo (motor real, com stops): total', pn.reduce((a, b) => a + b, 0).toFixed(0), 'por trade', (pn.reduce((a, b) => a + b, 0) / Math.max(1, pn.length)).toFixed(1), 'acerto', (100 * pn.filter(x => x > 0).length / Math.max(1, pn.length)).toFixed(0) + '%');
  console.log('  JS model metrics (same theta):', JSON.stringify({ n: J.metrics.n, perSess: J.metrics.perSess, p90: fm(J.metrics.p90), g4: J.metrics.g4, g8: J.metrics.g8, sh1820: J.metrics.sh1820, rth: J.metrics.rth, hourCV: J.metrics.hourCV, pnlPerTrade: J.metrics.pnlPerTrade }));
})();
