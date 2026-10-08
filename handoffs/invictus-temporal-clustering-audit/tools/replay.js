// READ-ONLY tick replay of AoGate.EsNq + AoMotorCanonico entry rule (state builder copied from press-recalibration backtest.js).
// Variants of step-4 threshold: BASE (0.03 fixed = OLIVER_BASE and P-RTH1, identical gate) and GCAP (LimiarForca).
// Press = cumDelta/cumVol since 18:00 ET (session seen whole). Output: replay_out.json + stdout report.
const fs = require('fs'), path = require('path');
const { decode } = require('C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/close-divergence-20261001/press-policy/tools/ncd_decode.js');
const NT = 'C:/Users/ADM/Documents/NinjaTrader 8/db/tick';
const D = __dirname;
const NS = 82800, MF = 0.03, FRESH = 90;
const T0 = 621355968000000000n, H3 = 3n * 3600n * 10000000n;
function lado(r) { if (r.code < 6) return (r.code & 1) ? 1 : -1; const bidOff = r.ex[0], askOff = r.ex[1]; if (askOff === 0 && bidOff !== 0) return 1; if (bidOff === 0 && askOff !== 0) return -1; return 0; }
const sessStart = d => Date.parse(d + 'T00:00:00Z') - 2 * 3600e3;
const FROM = process.argv[2] || '2026-09-14', TO = process.argv[3] || '2026-10-08';
const CT = '12-26';
const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const S = {};
for (const sym of ['ES', 'NQ']) {
  S[sym] = {};
  const E = { eff: sym === 'NQ' ? 30 : 45, v: 0, ve: 0, last: 0, mvi: 0, me: 0, ma: true, mea: true };
  let cur = null, curD = null, ptr = 0, cv = 0, cd = 0, lastTick = 0;
  const flush = upto => { if (!cur) return; for (; ptr < upto && ptr < NS; ptr++) { cur.cv[ptr] = cv; cur.cd[ptr] = cd; cur.me[ptr] = E.me; cur.mvi[ptr] = E.mvi; cur.last[ptr] = lastTick; } };
  const dir = path.join(NT, sym + ' ' + CT);
  const lo = FROM.replace(/-/g, ''), hi = TO.replace(/-/g, '');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.Last.ncd')).sort().filter(f => f.slice(0, 8) >= String(+lo - 3) && f.slice(0, 8) <= hi);
  for (const f of files) {
    const r = decode(path.join(dir, f));
    for (const x of r.recs) {
      const ms = Number((x.t + H3 - T0) / 10000n), s = lado(x), vol = x.vol;
      if (E.last) { const dt = (ms - E.last) / 1000; if (dt > 0) { E.v *= Math.exp(-dt * Math.LN2 / 28); E.ve *= Math.exp(-dt * Math.LN2 / 60); } }
      E.last = ms;
      const sd = new Date(ms + 2 * 3600e3).toISOString().slice(0, 10);
      const sec = Math.floor((ms - sessStart(sd)) / 1000);
      if (sd !== curD) { flush(NS); curD = sd; cur = null; ptr = 0; cv = 0; cd = 0; if (sd >= FROM && sd <= TO) cur = S[sym][sd] = { cv: new Float64Array(NS), cd: new Float64Array(NS), me: new Int8Array(NS), mvi: new Int8Array(NS), last: new Float64Array(NS), ticks: 0 }; }
      flush(sec);
      E.v += s * vol; E.ve += s * vol;
      let m = Math.abs(E.v); if (!E.ma && m < E.eff * 0.9) E.ma = true; if (E.ma && m >= E.eff) { E.ma = false; E.mvi = Math.sign(E.v); }
      m = Math.abs(E.ve); if (!E.mea && m < E.eff * 0.9) E.mea = true; if (E.mea && m >= E.eff) { E.mea = false; E.me = Math.sign(E.ve); }
      if (sec >= 0 && sec < NS) { cv += vol; cd += s * vol; lastTick = ms; if (cur) cur.ticks++; }
    }
  }
  flush(NS);
  console.error(sym, 'sessions', Object.keys(S[sym]).length);
}
const days = Object.keys(S.ES).filter(d => S.NQ[d]).sort();
const C = 0.3985, AES = 0.6935, ANQ = 0.6390, VES = 1383035, VNQ = 520328;
const lim = (vol, a, vb) => { if (!(vol > 0)) return MF; const f = C * Math.pow(vol / vb, -(1 - a)); return f < 1 ? MF * f : MF; };
// per-second category: 1 TAPE, 2 UNDEFINED, 3 DIVERGENT, 4 FORCE, 5 OK ; computed for BASE and GCAP
const BUCK = [[0, 5], [5, 15], [15, 30], [30, 60], [60, 120], [120, 240], [240, 480], [480, 780], [780, 930], [930, 1050], [1050, 1200], [1200, 1320], [1320, 1380]];
const bname = b => String(b[0]).padStart(4, '0') + '-' + String(b[1]).padStart(4, '0');
const agg = BUCK.map(() => ({ n: 0, c: [0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0], pEs: [], pNq: [], lEs: [], lNq: [], cvEs: [], align: 0, def: 0, st4: 0 }));
const out = { days: {}, entries: { BASE: [], GCAP: [] } };
const coverage = {};
for (const d of days) {
  const es = S.ES[d], nq = S.NQ[d], t0 = sessStart(d);
  const catB = new Int8Array(NS), catG = new Int8Array(NS), st4 = new Int8Array(NS), dirA = new Int8Array(NS);
  let secsWithData = 0;
  for (let s = 0; s < NS; s++) {
    const now = t0 + s * 1000 + 999;
    const fe = es.last[s] > 0 && (now - es.last[s]) / 1000 < FRESH, fn = nq.last[s] > 0 && (now - nq.last[s]) / 1000 < FRESH;
    const ed = (es.me[s] !== 0 && es.me[s] === es.mvi[s]) ? es.me[s] : 0, nd = (nq.me[s] !== 0 && nq.me[s] === nq.mvi[s]) ? nq.me[s] : 0;
    st4[s] = Math.abs(es.me[s] + es.mvi[s] + nq.me[s] + nq.mvi[s]) >= 4 ? 1 : 0;
    const pe = es.cv[s] > 0 ? Math.abs(es.cd[s] / es.cv[s]) : 0, pn = nq.cv[s] > 0 ? Math.abs(nq.cd[s] / nq.cv[s]) : 0;
    let cb, cg;
    if (!fe || !fn) cb = cg = 1; else if (!ed || !nd) cb = cg = 2; else if (ed !== nd) cb = cg = 3; else {
      cb = (pe < MF || pn < MF) ? 4 : 5;
      cg = (pe < lim(es.cv[s], AES, VES) || pn < lim(nq.cv[s], ANQ, VNQ)) ? 4 : 5;
      dirA[s] = ed;
    }
    catB[s] = cb; catG[s] = cg; if (fe && fn) secsWithData++;
    const bi = BUCK.findIndex(b => s >= b[0] * 60 && s < b[1] * 60); const a = agg[bi];
    if (cb !== 1) { a.n++; a.c[cb]++; a.g[cg]++; if (s % 30 === 0) { a.pEs.push(pe); a.pNq.push(pn); a.lEs.push(lim(es.cv[s], AES, VES)); a.lNq.push(lim(nq.cv[s], ANQ, VNQ)); a.cvEs.push(es.cv[s]); } }
  }
  coverage[d] = secsWithData / NS;
  // motor emulation at 20 s cadence (entry: ok & strength4 & cooldown & armed; exit: NEUTRO non-transient = DIVERGENT)
  for (const [vn, cat] of [['BASE', catB], ['GCAP', catG]]) {
    let side = 0, armed = true, cool = 0;
    for (let s = 0; s < NS; s += 20) {
      const c = cat[s]; if (!st4[s]) armed = true;
      if (side !== 0 && c === 3) { side = 0; cool = s + 60; armed = false; }
      if (side === 0 && c === 5 && s >= cool && armed) { side = dirA[s]; armed = false; out.entries[vn].push(t0 + s * 1000); }
    }
  }
  // compact per-minute series for windows: first-fail-category shares + press
  const M = []; for (let m = 0; m < 1380; m++) { const s = m * 60 + 59; let k = [0, 0, 0, 0, 0, 0], kg = 0; for (let q = m * 60; q < m * 60 + 60; q++) { k[catB[q]]++; if (catG[q] === 5) kg++; }
    M.push([k[1], k[2], k[3], k[4], k[5], kg, +(es.cv[s] > 0 ? es.cd[s] / es.cv[s] : 0).toFixed(5), +(nq.cv[s] > 0 ? nq.cd[s] / nq.cv[s] : 0).toFixed(5), es.cv[s], nq.cv[s], es.cd[s], nq.cd[s], es.me[s], es.mvi[s], nq.me[s], nq.mvi[s]]); }
  out.days[d] = { t0, M };
  // per-second category kept for runtime comparison
  out.days[d].catB = Buffer.from(catB.buffer).toString('base64');
}
console.log('sessions replayed:', days.length, days[0], '..', days[days.length - 1]);
console.log('coverage (share of 23h with fresh tape both):', days.map(d => d.slice(5) + ':' + (100 * coverage[d]).toFixed(0)).join(' '));
console.log('\nREPLAY FUNNEL by minutes since 18:00 ET (tape-fresh seconds only). shares = first failing step');
console.log('bucket(min)   UNDEF  DIVERG  FORCE   OK_BASE | OK_GCAP | P(def) P(align|def) P(force|align)BASE GCAP | med|Press|ES  NQ   | med limiarGCAP ES NQ | med cumVolES');
agg.forEach((a, i) => { const n = a.n || 1; const def = (a.c[3] + a.c[4] + a.c[5]) / n, al = (a.c[4] + a.c[5]) / Math.max(1, a.c[3] + a.c[4] + a.c[5]);
  console.log(bname(BUCK[i]).padEnd(12), (100 * a.c[2] / n).toFixed(1).padStart(6), (100 * a.c[3] / n).toFixed(1).padStart(7), (100 * a.c[4] / n).toFixed(1).padStart(6), (100 * a.c[5] / n).toFixed(2).padStart(8), '|', (100 * a.g[5] / n).toFixed(2).padStart(7), '|', (100 * def).toFixed(1).padStart(5), (100 * al).toFixed(1).padStart(8), (100 * a.c[5] / Math.max(1, a.c[4] + a.c[5])).toFixed(2).padStart(12), (100 * a.g[5] / Math.max(1, a.g[4] + a.g[5])).toFixed(2).padStart(6), '|', pct(a.pEs, .5).toFixed(4), pct(a.pNq, .5).toFixed(4), '|', pct(a.lEs, .5).toFixed(4), pct(a.lNq, .5).toFixed(4), '|', Math.round(pct(a.cvEs, .5))); });
for (const vn of ['BASE', 'GCAP']) { const e = out.entries[vn]; const hh = new Array(24).fill(0); e.forEach(t => hh[new Date(t - 4 * 3600e3).getUTCHours()]++);
  console.log('\nREPLAY ' + vn + ' motor entries:', e.length, '| by ET hour:', hh.map((v, i) => i + 'h=' + v).join(' ')); }
fs.writeFileSync(path.join(D, 'replay_out.json'), JSON.stringify(out));
