// read-only: runtime funnel from motor ticks (audit) — gate outcome by ET hour, time-weighted
const fs = require('fs'), path = require('path');
const D = __dirname;
const ET = ms => new Date(ms - 4 * 3600e3);
let T = [];
for (const tag of ['sep', 'oct']) { const L = fs.readFileSync(path.join(D, 'ticks_' + tag + '.csv'), 'utf8').split('\n').slice(1); for (const l of L) { if (!l) continue; const c = l.split(','); T.push({ t: Date.parse(c[0]), dir: c[1], st: +c[2], why: c[3], side: c[4], abriu: c[5] === '1', fechou: c[6] === '1', armed: c[8], cd: c[9] ? Date.parse(c[9]) : 0, eb: c[10] === '1', ebm: c[11], es: c[12], nq: c[13] }); } }
T.sort((a, b) => a.t - b.t);
const cat = x => x.dir === 'LONG' || x.dir === 'SHORT' ? (x.st === 4 ? 'OK_4of4' : 'DIR_st<4') : /^sem tape/.test(x.why) ? '1_TAPE' : /indefinid/.test(x.why) ? '2_UNDEFINED' : /divergentes/.test(x.why) ? '3_DIVERGENT' : /^forca fraca/.test(x.why) ? '4_FORCE' : 'OTHER:' + x.why;
// time weights: dt to next tick, capped 90 s (beyond = no coverage)
const CAP = 90e3; let cov = 0, uncov = 0;
for (let i = 0; i < T.length; i++) { const dt = i + 1 < T.length ? T[i + 1].t - T[i].t : 20e3; T[i].w = Math.min(dt, CAP) / 1000; cov += T[i].w; if (dt > CAP) uncov += (dt - CAP) / 1000; T[i].c = cat(T[i]); }
console.log('ticks', T.length, 'first', new Date(T[0].t).toISOString(), 'last', new Date(T[T.length - 1].t).toISOString(), 'covered h', (cov / 3600).toFixed(1), 'uncovered h (tick gaps > 90 s)', (uncov / 3600).toFixed(1));
const dts = []; for (let i = 1; i < T.length; i++) dts.push((T[i].t - T[i - 1].t) / 1000); const h = {}; dts.forEach(d => { const k = d < 25 ? '~20s' : d < 70 ? '~60s' : d < 600 ? '<10m' : '>10m'; h[k] = (h[k] || 0) + 1; }); console.log('tick spacing', JSON.stringify(h));
function table(name, rows, keyFn, keys) {
  const cats = ['1_TAPE', '2_UNDEFINED', '3_DIVERGENT', '4_FORCE', 'OK_4of4']; const M = {};
  for (const x of rows) { const k = keyFn(x); if (k == null) continue; const m = M[k] = M[k] || { tot: 0 }; m.tot += x.w; m[x.c] = (m[x.c] || 0) + x.w; }
  console.log('\n' + name + '  (share of covered time; hours covered)'); console.log('key'.padEnd(14), 'hrs'.padStart(7), cats.map(c => c.padStart(12)).join(''), ' other');
  for (const k of (keys || Object.keys(M).sort())) { const m = M[k]; if (!m) continue; const oth = m.tot - cats.reduce((s, c) => s + (m[c] || 0), 0); console.log(String(k).padEnd(14), (m.tot / 3600).toFixed(1).padStart(7), cats.map(c => (100 * (m[c] || 0) / m.tot).toFixed(1).padStart(11) + '%').join(''), (100 * oth / m.tot).toFixed(1).padStart(5) + '%'); }
  return M;
}
const FLAT = T.filter(x => x.side === 'FLAT');
table('ALL (FLAT ticks) by month', FLAT, x => new Date(x.t).toISOString().slice(0, 7));
table('FLAT ticks by ET hour (Sep+Oct)', FLAT, x => String(ET(x.t).getUTCHours()).padStart(2, '0') + 'h', [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(h => String(h).padStart(2, '0') + 'h'));
table('FLAT ticks by minutes since 18:00 ET session start', FLAT, x => { const d = ET(x.t); let m = (d.getUTCHours() - 18) * 60 + d.getUTCMinutes(); if (m < 0) m += 1440; const b = m < 5 ? '000-005m' : m < 15 ? '005-015m' : m < 30 ? '015-030m' : m < 60 ? '030-060m' : m < 120 ? '060-120m' : m < 240 ? '120-240m' : m < 480 ? '240-480m' : m < 780 ? '480-780m' : m < 930 ? '780-930m(pre)' : m < 1320 ? '930-1320(RTH)' : '1320+'; return b; });
table('FLAT ticks by ET date', FLAT, x => ET(x.t).toISOString().slice(0, 10));
// when forca fraca: which symbol(s)
const ff = {}; FLAT.filter(x => x.c === '4_FORCE').forEach(x => { ff[x.why] = (ff[x.why] || 0) + x.w; }); console.log('\nFORCE detail (h):', Object.entries(ff).map(([k, v]) => k + '=' + (v / 3600).toFixed(1)).join(' | '));
const un = {}; FLAT.filter(x => x.c === '2_UNDEFINED').forEach(x => { un[x.why] = (un[x.why] || 0) + x.w; }); console.log('UNDEFINED detail (h):', Object.entries(un).map(([k, v]) => k + '=' + (v / 3600).toFixed(1)).join(' | '));
// OK_4of4 while FLAT but no open: blocked reasons
const okNo = FLAT.filter(x => x.c === 'OK_4of4' && !x.abriu); const r = {}; okNo.forEach(x => { const k = x.eb ? 'EXEC_BLOCK:' + x.ebm.slice(0, 60) : (x.cd && x.t < x.cd) ? 'COOLDOWN' : x.armed === '0' ? 'NOT_ARMED(hysteresis)' : 'UNEXPLAINED_IN_TICK'; r[k] = (r[k] || 0) + 1; });
console.log('\nticks OK_4of4 & FLAT:', FLAT.filter(x => x.c === 'OK_4of4').length, '| of which opened:', FLAT.filter(x => x.c === 'OK_4of4' && x.abriu).length + T.filter(x => x.abriu && x.side !== 'FLAT').length, '| abriu total', T.filter(x => x.abriu).length); console.log('OK_4of4 FLAT not opened, reason:', JSON.stringify(r));
console.log('exec_bloqueia_entrada ticks', T.filter(x => x.eb).length, JSON.stringify(T.filter(x => x.eb).reduce((h, x) => (h[x.ebm.slice(0, 80)] = (h[x.ebm.slice(0, 80)] || 0) + 1, h), {})));
fs.writeFileSync(path.join(D, 'ticks_all.json'), JSON.stringify(T.map(x => [x.t, x.c, x.side === 'FLAT' ? 0 : 1, x.abriu ? 1 : 0, x.why, x.w, x.es, x.nq, x.st])));
