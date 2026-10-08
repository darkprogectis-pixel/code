// read-only: runtime (audit ticks + real entries) vs tick replay; cluster windows; active vs dead
const fs = require('fs'), path = require('path');
const D = __dirname;
const R = JSON.parse(fs.readFileSync(path.join(D, 'replay_out.json'), 'utf8'));
const EN = JSON.parse(fs.readFileSync(path.join(D, 'entries.json'), 'utf8'));
const TK = JSON.parse(fs.readFileSync(path.join(D, 'ticks_all.json'), 'utf8')); // [t,cat,inPos,abriu,why,w,es,nq,st]
const loads = fs.readFileSync(path.join(D, 'ev_small.txt'), 'utf8').split('\n').filter(l => / nt8_ready$| engine_start$/.test(l)).map(l => Date.parse(l.split(' ')[0])).sort((a, b) => a - b);
const days = Object.keys(R.days).sort();
for (const d of days) R.days[d].cat = new Int8Array(new Uint8Array(Buffer.from(R.days[d].catB, 'base64')).buffer);
const MF = 0.03, NS = 82800;
const dayOf = t => { const sd = new Date(t + 2 * 3600e3).toISOString().slice(0, 10); const o = R.days[sd]; if (!o) return null; const s = Math.floor((t - o.t0) / 1000); return s >= 0 && s < NS ? { sd, o, s, m: Math.floor(s / 60) } : null; };
const lastLoad = t => { let lo = 0, hi = loads.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (loads[mid] <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r < 0 ? 0 : loads[r]; };
const P1S = Date.parse('2026-10-02T00:00:00Z'), BACKFILL = Date.parse('2026-10-05T16:00:00Z');
// press (abs) ES/NQ at minute m: full-session and runtime-emulated (accumulators from last load when load is inside the session)
function press(k, t) {
  const M = k.o.M, r = M[Math.min(k.m, 1379)], full = [Math.abs(r[6]), Math.abs(r[7])];
  const L = lastLoad(t); let emu = full, mode = 'FULL', sinceLoad = (t - L) / 60000;
  if (L > k.o.t0) {
    if (L < P1S) { const lm = Math.min(1379, Math.floor((L - k.o.t0) / 60000)), b = M[lm]; const dvE = r[8] - b[8], dvN = r[9] - b[9]; emu = [dvE > 0 ? Math.abs((r[10] - b[10]) / dvE) : 0, dvN > 0 ? Math.abs((r[11] - b[11]) / dvN) : 0]; mode = 'PARTIAL_FROM_LOAD'; }
    else if (L < BACKFILL) { emu = [0, 0]; mode = 'P1S_ZERO'; }
  }
  return { full, emu, mode, sinceLoad, sinceSess: k.s / 60, cvEs: r[8], cvNq: r[9] };
}
const fm = s => s >= 3600 ? (s / 3600).toFixed(1) + 'h' : (s / 60).toFixed(0) + 'm';
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const CN = { '1_TAPE': 1, '2_UNDEFINED': 2, '3_DIVERGENT': 3, '4_FORCE': 4, 'OK_4of4': 5 };

// ---- A. runtime tick category vs replay BASE (full session) at the same second ----
console.log('A. RUNTIME (audit motor ticks, FLAT) x REPLAY full-session, same second. rows=runtime, cols=replay [TAPE UNDEF DIVERG FORCE OK]');
for (const [nm, f] of [['pre-P1S (<10-02)', t => t < P1S], ['P1S era (>=10-02)', t => t >= P1S]]) {
  const X = [0, 1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0, 0]); let n = 0;
  for (const x of TK) { if (x[2] || !f(x[0])) continue; const k = dayOf(x[0]); if (!k) continue; const rc = CN[x[1]]; if (!rc) continue; X[rc][k.o.cat[k.s]]++; n++; }
  console.log(' ' + nm, 'n=' + n); for (let i = 1; i <= 5; i++) console.log('   rt ' + Object.keys(CN)[i - 1].padEnd(12), X[i].slice(1).map(v => String(v).padStart(7)).join(''));
  const s123 = X[4][4] + X[4][5] + X[5][4] + X[5][5]; console.log('   both pass steps 1-3: n=' + s123, '| force verdict agrees', (100 * (X[4][4] + X[5][5]) / Math.max(1, s123)).toFixed(1) + '%', '| rt OK & replay FORCE:', X[5][4], '| rt FORCE & replay OK:', X[4][5]);
}
// ---- B. force verdict: runtime vs FULL vs EMU press (minute resolution), ticks where runtime passed steps 1-3 ----
console.log('\nB. STEP-4 verdict on runtime ticks that reached step 4 (runtime cat FORCE or OK): agreement of two Press models');
for (const [nm, f] of [['pre-P1S', t => t < P1S], ['P1S era', t => t >= P1S]]) {
  let n = 0, aF = 0, aE = 0; const byMode = {};
  for (const x of TK) { if (x[2] || !f(x[0])) continue; const rc = CN[x[1]]; if (rc !== 4 && rc !== 5) continue; const k = dayOf(x[0]); if (!k) continue; const p = press(k, x[0]);
    const vF = (p.full[0] >= MF && p.full[1] >= MF) ? 5 : 4, vE = (p.emu[0] >= MF && p.emu[1] >= MF) ? 5 : 4; n++; if (vF === rc) aF++; if (vE === rc) aE++;
    const b = byMode[p.mode] = byMode[p.mode] || { n: 0, ok: 0, rtOk: 0, w: 0 }; b.n++; b.w += x[5]; if (vE === rc) b.ok++; if (rc === 5) b.rtOk++; }
  console.log(' ' + nm, 'n=' + n, '| FULL-session Press agrees', (100 * aF / n).toFixed(1) + '%', '| runtime-emulated (load-aware) Press agrees', (100 * aE / n).toFixed(1) + '%');
  for (const m of Object.keys(byMode)) console.log('    mode', m.padEnd(18), 'ticks', byMode[m].n, 'hours', (byMode[m].w / 3600).toFixed(1), 'emu agrees', (100 * byMode[m].ok / byMode[m].n).toFixed(1) + '%', '| runtime OK share', (100 * byMode[m].rtOk / byMode[m].n).toFixed(2) + '%');
}
// ---- C. every real entry: what made step 4 pass ----
console.log('\nC. REAL ENTRIES classified by the accumulator origin that makes step 4 pass');
const cls = {}; const rows = [];
for (const e of EN.org) { const k = dayOf(e.o); if (!k) { cls.NO_TICK_DATA = (cls.NO_TICK_DATA || 0) + 1; continue; } const p = press(k, e.o);
  const fullOk = p.full[0] >= MF && p.full[1] >= MF, emuOk = p.emu[0] >= MF && p.emu[1] >= MF;
  let c = fullOk ? 'FULL_SESSION_PRESS_OK' : (p.mode === 'PARTIAL_FROM_LOAD' && emuOk) ? 'LOAD_RESET_PRESS_OK' : p.mode === 'PARTIAL_FROM_LOAD' ? 'LOAD_RESET_but_emu_fails' : 'UNEXPLAINED(full fails; no logged load in session)';
  cls[c] = (cls[c] || 0) + 1; rows.push({ e, p, c, sess: e.sessEntry }); }
console.log(' ', JSON.stringify(cls));
for (const c of Object.keys(cls)) { const r = rows.filter(x => x.c === c); if (!r.length) continue; console.log('  ' + c.padEnd(48), 'n', r.length, '| RTH', r.filter(x => x.sess === 'RTH').length, '| median min since session start', pct(r.map(x => x.p.sinceSess), .5).toFixed(0), '| median min since last load', pct(r.map(x => x.p.sinceLoad), .5).toFixed(0), '| median cumVolES', Math.round(pct(r.map(x => x.p.cvEs), .5))); }
const sinceReset = rows.map(x => Math.min(x.p.sinceSess, x.p.mode === 'PARTIAL_FROM_LOAD' ? x.p.sinceLoad : 1e9));
console.log('  minutes since last accumulator reset (session start or logged load) at entry: median', pct(sinceReset, .5).toFixed(0), 'p75', pct(sinceReset, .75).toFixed(0), 'p90', pct(sinceReset, .9).toFixed(0), '| share within 120 min:', (100 * sinceReset.filter(x => x <= 120).length / sinceReset.length).toFixed(1) + '%', 'within 240:', (100 * sinceReset.filter(x => x <= 240).length / sinceReset.length).toFixed(1) + '%');
const era = (nm, f) => { const r = rows.filter(x => f(x.e.o)); const h = {}; r.forEach(x => h[x.c] = (h[x.c] || 0) + 1); console.log('  ' + nm, 'n', r.length, JSON.stringify(h)); };
era('entries pre-P1S', t => t < P1S); era('entries P1S era', t => t >= P1S);
// baseline: what share of market time is within 120 min of a reset?
{ let tot = 0, near = 0; for (const d of days) { const o = R.days[d]; for (let m = 0; m < 1380; m += 5) { const t = o.t0 + m * 60000; if (t > Date.parse('2026-10-08T00:00:00Z')) continue; const L = lastLoad(t); const sr = Math.min(m, (L > o.t0 && L < P1S) ? (t - L) / 60000 : 1e9); tot++; if (sr <= 120) near++; } } console.log('  baseline: share of session time within 120 min of a reset:', (100 * near / tot).toFixed(1) + '%'); }

// ---- D. cluster windows: state before / during / after (replay full-session vars + true runtime categories) ----
function win(t0, t1) { // replay vars over [t0,t1)
  let c = [0, 0, 0, 0, 0, 0], g = 0, n = 0; const pe = [], pn = [], cv = [];
  for (let t = t0; t < t1; t += 60000) { const k = dayOf(t); if (!k) continue; const r = k.o.M[Math.min(k.m, 1379)]; for (let i = 1; i <= 5; i++) c[i] += r[i - 1]; g += r[5]; n++; const p = press(k, t); pe.push(p.emu[0]); pn.push(p.emu[1]); cv.push(r[8]); }
  const s = c[1] + c[2] + c[3] + c[4] + c[5] || 1; const live = s - c[1] || 1;
  return { n, pDef: (c[3] + c[4] + c[5]) / live, pAl: (c[4] + c[5]) / Math.max(1, c[3] + c[4] + c[5]), pFo: c[5] / Math.max(1, c[4] + c[5]), pFoG: g / Math.max(1, c[4] + c[5]), okB: c[5] / live, pe: pct(pe, .5), pn: pct(pn, .5), cv: pct(cv, .5) };
}
function rtwin(t0, t1) { const h = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let w = 0; for (const x of TK) { if (x[0] < t0) continue; if (x[0] >= t1) break; const rc = CN[x[1]]; if (!rc) continue; h[rc] += x[5]; w += x[5]; } return { w, h }; }
const OFF = [['A -30..0', -30, 0], ['B during', null, null], ['C +0..15', 0, 15], ['D +15..45', 15, 45], ['E +45..75', 45, 75], ['F +105..135', 105, 135]];
const accW = OFF.map(() => ({ pDef: [], pAl: [], pFo: [], pFoG: [], okB: [], pe: [], pn: [], cv: [], rt: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, rtw: 0 }));
const big = EN.clusters.filter(c => c.n >= 2 && dayOf(c.start));
for (const c of big) OFF.forEach((o, i) => { const a = o[1] == null ? c.start : (i === 0 ? c.start : c.lastEntry) + o[1] * 60000, b = o[1] == null ? c.lastEntry + 60000 : (i === 0 ? c.start : c.lastEntry) + o[2] * 60000; const w = win(a, b); if (!w.n) return; for (const k of ['pDef', 'pAl', 'pFo', 'pFoG', 'okB', 'pe', 'pn', 'cv']) if (!isNaN(w[k])) accW[i][k].push(w[k]); const r = rtwin(a, b); for (const q of [1, 2, 3, 4, 5]) accW[i].rt[q] += r.h[q]; accW[i].rtw += r.w; });
console.log('\nD. CLUSTER WINDOWS (clusters with >=2 entries and tick data: ' + big.length + '). means across clusters; Press = runtime-emulated |Press|');
console.log('window        P(def)  P(align|def)  P(force|align)BASE  ..GCAP  OKshare  med|Press|ES   NQ    cumVolES | RUNTIME shares(reached step: TAPE UNDEF DIVERG FORCE OK)  rt P(force|align)');
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
OFF.forEach((o, i) => { const a = accW[i], r = a.rt, w = a.rtw || 1; console.log(o[0].padEnd(13), (100 * mean(a.pDef)).toFixed(1).padStart(5), (100 * mean(a.pAl)).toFixed(1).padStart(10), (100 * mean(a.pFo)).toFixed(1).padStart(15), (100 * mean(a.pFoG)).toFixed(1).padStart(10), (100 * mean(a.okB)).toFixed(1).padStart(8), mean(a.pe).toFixed(4).padStart(12), mean(a.pn).toFixed(4).padStart(8), String(Math.round(mean(a.cv))).padStart(9), '|', [1, 2, 3, 4, 5].map(q => (100 * r[q] / w).toFixed(1).padStart(6)).join(''), '   ', (100 * r[5] / Math.max(1, r[4] + r[5])).toFixed(1)); });

// ---- E. ACTIVE vs DEAD (runtime ticks + replay vars) ----
const tr = EN.org.map(e => [e.o, e.c]).sort((a, b) => a[0] - b[0]);
const inCluster = t => EN.clusters.some(c => c.n >= 2 && t >= c.start && t <= c.lastEntry + 60000);
const nearTrade = (t, m) => tr.some(x => t >= x[0] - m * 60000 && t <= x[1] + m * 60000);
const G = { ACTIVE: { h: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, w: 0, pe: [], pn: [], cv: [], sr: [], st4: 0 }, DEAD: { h: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, w: 0, pe: [], pn: [], cv: [], sr: [], st4: 0 } };
let i = 0; for (const x of TK) { const k = dayOf(x[0]); if (!k) continue; const rc = CN[x[1]]; if (!rc || rc === 1) continue; const g = inCluster(x[0]) ? G.ACTIVE : (!nearTrade(x[0], 60) ? G.DEAD : null); if (!g) continue; g.h[rc] += x[5]; g.w += x[5]; if (x[8] === 4) g.st4 += x[5]; if ((i++ % 3) === 0) { const p = press(k, x[0]); g.pe.push(p.emu[0]); g.pn.push(p.emu[1]); g.cv.push(p.cvEs); g.sr.push(Math.min(p.sinceSess, p.mode === 'PARTIAL_FROM_LOAD' ? p.sinceLoad : 1e9)); } }
console.log('\nE. ACTIVE (inside clusters) vs DEAD (>=60 min from any trade), runtime ticks with tape live');
console.log('variable                         ACTIVE      DEAD     DELTA');
const row = (n, a, d, f) => console.log(n.padEnd(30), f(a).padStart(9), f(d).padStart(9), f(a - d).padStart(9));
const A = G.ACTIVE, Dd = G.DEAD, P = v => (100 * v).toFixed(1) + '%', N4 = v => v.toFixed(4), N0 = v => String(Math.round(v));
console.log('hours'.padEnd(30), (A.w / 3600).toFixed(1).padStart(9), (Dd.w / 3600).toFixed(1).padStart(9));
row('P(defined) both symbols', (A.w - A.h[2]) / A.w, (Dd.w - Dd.h[2]) / Dd.w, P);
row('P(aligned | defined)', (A.h[4] + A.h[5]) / (A.h[3] + A.h[4] + A.h[5]), (Dd.h[4] + Dd.h[5]) / (Dd.h[3] + Dd.h[4] + Dd.h[5]), P);
row('P(force pass | aligned)', A.h[5] / (A.h[4] + A.h[5]), Dd.h[5] / (Dd.h[4] + Dd.h[5]), P);
row('strength==4 share', A.st4 / A.w, Dd.st4 / Dd.w, P);
row('median |Press| ES (rt-emulated)', pct(A.pe, .5), pct(Dd.pe, .5), N4);
row('median |Press| NQ (rt-emulated)', pct(A.pn, .5), pct(Dd.pn, .5), N4);
row('median cumVol ES (session)', pct(A.cv, .5), pct(Dd.cv, .5), N0);
row('median min since acc. reset', pct(A.sr, .5), pct(Dd.sr, .5), N0);
row('share |Press|ES >= 0.03', A.pe.filter(v => v >= MF).length / A.pe.length, Dd.pe.filter(v => v >= MF).length / Dd.pe.length, P);
row('share |Press|NQ >= 0.03', A.pn.filter(v => v >= MF).length / A.pn.length, Dd.pn.filter(v => v >= MF).length / Dd.pn.length, P);
// ---- F. dead-zone attribution: in DEAD time with tape live, which step is the first to fail ----
console.log('\nF. DEAD-time first-failing step (runtime, tape live): UNDEFINED', P(Dd.h[2] / Dd.w), 'DIVERGENT', P(Dd.h[3] / Dd.w), 'FORCE', P(Dd.h[4] / Dd.w), 'OK(no entry: cooldown/hysteresis)', P(Dd.h[5] / Dd.w));
// counterfactual on replay: seconds where steps 1-3 pass (aligned) per day vs OK
let al = 0, ok = 0, okg = 0, tot = 0; for (const d of days) for (const r of R.days[d].M) { al += r[3] + r[4]; ok += r[4]; okg += r[5]; tot += r[1] + r[2] + r[3] + r[4]; }
console.log('   replay all sessions: aligned(steps1-3 pass) share of live time', P(al / tot), '| OK BASE', P(ok / tot), '| OK GCAP', P(okg / tot), '=> step 4 removes', P(1 - ok / al), 'of aligned time (BASE),', P(1 - okg / al), '(GCAP)');
// replay cluster stats for the versions
for (const vn of ['BASE', 'GCAP']) { const e = R.entries[vn].filter(t => t < Date.parse('2026-10-08T00:00:00Z')); const gaps = []; for (let j = 1; j < e.length; j++) gaps.push((e[j] - e[j - 1]) / 1000); let ncl = 1; gaps.forEach(g => { if (g >= EN.TH) ncl++; });
  const rth = e.filter(t => { const d = new Date(t - 4 * 3600e3), h = d.getUTCHours() + d.getUTCMinutes() / 60; return h >= 9.5 && h < 16; }).length;
  console.log('   replay', vn, 'entries', e.length, '(RTH ' + rth + ')', '| gap median', fm(pct(gaps, .5)), 'p90', fm(pct(gaps, .9)), 'max', fm(Math.max(...gaps)), '| clusters(same ' + fm(EN.TH) + ' break)', ncl, '| gaps>4h', gaps.filter(g => g > 14400).length, '| gaps>8h', gaps.filter(g => g > 28800).length); }
