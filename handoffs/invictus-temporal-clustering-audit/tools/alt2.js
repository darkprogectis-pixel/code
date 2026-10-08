// READ-ONLY ANALYSIS (nothing touches NT8): historical milestones + step-4 alternatives on the same real ticks.
// Same tick decoder / side rule / ME-MVI engine / gate steps 1-3 / motor entry rule as replay.js. Only step 4 varies.
// Each alternative has ONE free scale (theta) calibrated on the first 9 sessions to the same turnover target, then measured on all 18
// and out-of-sample on the last 9. Output: tests/09_milestones.txt (stdout part 1) + tests/alt_results.json.
const fs = require('fs'), path = require('path');
const { decode } = require('C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/close-divergence-20261001/press-policy/tools/ncd_decode.js');
const NT = 'C:/Users/ADM/Documents/NinjaTrader 8/db/tick', CT = '12-26';
const T0 = 621355968000000000n, H3 = 3n * 3600n * 10000000n;
function lado(r) { if (r.code < 6) return (r.code & 1) ? 1 : -1; const b = r.ex[0], a = r.ex[1]; if (a === 0 && b !== 0) return 1; if (b === 0 && a !== 0) return -1; return 0; }
const sessStart = d => Date.parse(d + 'T00:00:00Z') - 2 * 3600e3;
const SJ = JSON.parse(fs.readFileSync('C:/Users/ADM/Desktop/Handof TTW/HANDOFF/conf-tests/pack-native-20261006/press-recalibration-20261007/data/sessions.json', 'utf8'));
const DAYS = SJ.filter(r => r.status === 'COMPLETE').map(r => r.date).sort();
const ROLL = Date.parse('2026-09-11T22:00:00Z'), NCAL = 16;
const NS = 82800, STEP = 20, MF = 0.03, FRESH = 90;
const G0 = sessStart(DAYS[0]) - 3 * 86400e3, GN = Math.floor((sessStart(DAYS[DAYS.length - 1]) + NS * 1000 - G0) / 1000) + 2;
const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fm = s => s >= 3600 ? (s / 3600).toFixed(1) + 'h' : (s / 60).toFixed(0) + 'm';
const ET = ms => new Date(ms - 4 * 3600e3);
function openSec(a, b) { let s = 0; for (let t = a; t < b; t += 60e3) { const d = ET(t), h = d.getUTCHours(), wd = d.getUTCDay(); if (!(h === 17 || wd === 6 || (wd === 5 && h >= 17) || (wd === 0 && h < 18))) s += 60; } return s; }
// ---------- global per-second state ----------
const S = {};
for (const sym of ['ES', 'NQ']) {
  const o = S[sym] = { PD: new Float64Array(GN + 1), PV: new Float64Array(GN + 1), PQ: new Float64Array(GN + 1), me: new Int8Array(GN), mvi: new Int8Array(GN), age: new Float32Array(GN), px: new Float32Array(GN) };
  const d = new Float64Array(GN), v = new Float64Array(GN), q = new Float64Array(GN);
  const E = { eff: sym === 'NQ' ? 30 : 45, v: 0, ve: 0, last: 0, mvi: 0, me: 0, ma: true, mea: true };
  let ptr = 0, lastTick = 0, px = 0;
  const flush = upto => { for (; ptr < upto && ptr < GN; ptr++) { o.me[ptr] = E.me; o.mvi[ptr] = E.mvi; o.age[ptr] = lastTick ? (G0 + ptr * 1000 + 999 - lastTick) / 1000 : 1e9; o.px[ptr] = px; } };
  const lo = new Date(G0 - 86400e3).toISOString().slice(0, 10).replace(/-/g, ''), hi = '20261008';
  for (const ct of ['09-26', '12-26']) { const dir = path.join(NT, sym + ' ' + ct); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.Last.ncd')).sort().filter(f => f.slice(0, 8) >= lo && f.slice(0, 8) <= hi && (ct === '09-26' ? f.slice(0, 8) <= '20260912' : f.slice(0, 8) >= '20260910'))) {
    const r = decode(path.join(dir, f));
    for (const x of r.recs) {
      const ms = Number((x.t + H3 - T0) / 10000n), s = lado(x), vol = x.vol;
      if ((ms >= ROLL) !== (ct === '12-26')) continue;
      if (E.last) { const dt = (ms - E.last) / 1000; if (dt > 0) { E.v *= Math.exp(-dt * Math.LN2 / 28); E.ve *= Math.exp(-dt * Math.LN2 / 60); } }
      E.last = ms; const g = Math.floor((ms - G0) / 1000);
      if (g >= 0) flush(g);
      E.v += s * vol; E.ve += s * vol;
      let m = Math.abs(E.v); if (!E.ma && m < E.eff * 0.9) E.ma = true; if (E.ma && m >= E.eff) { E.ma = false; E.mvi = Math.sign(E.v); }
      m = Math.abs(E.ve); if (!E.mea && m < E.eff * 0.9) E.mea = true; if (E.mea && m >= E.eff) { E.mea = false; E.me = Math.sign(E.ve); }
      if (g >= 0 && g < GN) { d[g] += s * vol; v[g] += vol; q[g] += vol * vol; lastTick = ms; px = x.pxT * r.tick; }
    }
  }
  }
  flush(GN);
  for (let i = 0; i < GN; i++) { o.PD[i + 1] = o.PD[i] + d[i]; o.PV[i + 1] = o.PV[i] + v[i]; o.PQ[i + 1] = o.PQ[i] + q[i]; }
  // EMA (half-life H s) of delta and volume, sampled every second
  o.ema = {}; for (const H of [300, 600, 1200, 1800, 3600]) { const k = Math.exp(-Math.LN2 / H), a = new Float32Array(GN), b = new Float32Array(GN); const c = new Float32Array(GN); let ed = 0, ev = 0, eq = 0; for (let i = 0; i < GN; i++) { ed = ed * k + d[i]; ev = ev * k + v[i]; eq = eq * k + q[i]; a[i] = ed; b[i] = ev; c[i] = eq; } o.ema[H] = [a, b, c]; }
  console.error(sym, 'loaded; total vol', o.PV[GN]);
}
const C = 0.3985, AL = { ES: 0.6935, NQ: 0.6390 }, VB = { ES: 1383035, NQ: 520328 };
const lim = (sym, vol) => { if (!(vol > 0)) return MF; const f = C * Math.pow(vol / VB[sym], -(1 - AL[sym])); return f < 1 ? MF * f : MF; };
// ---------- step table: per session, per 20 s step ----------
const NSTEP = NS / STEP, steps = [];
for (const d of DAYS) {
  const t0 = sessStart(d), g0 = Math.floor((t0 - G0) / 1000);
  const st = { d, t0, g0, cat: new Int8Array(NSTEP), dir: new Int8Array(NSTEP), s4: new Int8Array(NSTEP) };
  for (let i = 0; i < NSTEP; i++) { const g = g0 + i * STEP, e = S.ES, n = S.NQ;
    const fe = e.age[g] < FRESH, fn = n.age[g] < FRESH, ed = (e.me[g] !== 0 && e.me[g] === e.mvi[g]) ? e.me[g] : 0, nd = (n.me[g] !== 0 && n.me[g] === n.mvi[g]) ? n.me[g] : 0;
    st.s4[i] = Math.abs(e.me[g] + e.mvi[g] + n.me[g] + n.mvi[g]) >= 4 ? 1 : 0;
    st.cat[i] = (!fe || !fn) ? 1 : (!ed || !nd) ? 2 : ed !== nd ? 3 : 4; st.dir[i] = st.cat[i] === 4 ? ed : 0; }
  steps.push(st);
}
// ---------- force measures: F(sym, st, i) -> signed ratio r (pass iff |r| >= theta) ----------
const sess = (sym, st, i) => { const g = st.g0 + i * STEP + 1, o = S[sym], v = o.PV[g] - o.PV[st.g0]; return v > 0 ? (o.PD[g] - o.PD[st.g0]) / v : 0; };
const sessVol = (sym, st, i) => S[sym].PV[st.g0 + i * STEP + 1] - S[sym].PV[st.g0];
const roll = W => (sym, st, i) => { const g = st.g0 + i * STEP + 1, o = S[sym], a = Math.max(0, g - W), v = o.PV[g] - o.PV[a]; return v > 0 ? (o.PD[g] - o.PD[a]) / v : 0; };
const ema = H => (sym, st, i) => { const g = st.g0 + i * STEP, [a, b] = S[sym].ema[H]; return b[g] > 0 ? a[g] / b[g] : 0; };
const periodic = P => (sym, st, i) => { const s = i * STEP, a = st.g0 + Math.floor(s / P) * P, g = st.g0 + s + 1, o = S[sym], v = o.PV[g] - o.PV[a]; return v > 0 ? (o.PD[g] - o.PD[a]) / v : 0; };
const volWin = N => { const ptr = {}; return (sym, st, i) => { const n = sym === 'ES' ? N : Math.round(N * VB.NQ / VB.ES), g = st.g0 + i * STEP + 1, o = S[sym]; const key = sym + st.d; let j = (ptr[key] !== undefined && i > 0) ? ptr[key] : Math.max(0, g - 86400 * 3); while (j + 1 < g && o.PV[g] - o.PV[j + 1] >= n) j++; ptr[key] = j; const v = o.PV[g] - o.PV[j]; return v >= n * 0.5 ? (o.PD[g] - o.PD[j]) / v : 0; }; };
const volReset = V => (sym, st, i) => { const n = sym === 'ES' ? V : Math.round(V * VB.NQ / VB.ES), g = st.g0 + i * STEP + 1, o = S[sym]; const cv = o.PV[g] - o.PV[st.g0], k = Math.floor(cv / n) * n; let lo = st.g0, hi = g; while (lo < hi) { const m = (lo + hi) >> 1; if (o.PV[m] - o.PV[st.g0] < k) lo = m + 1; else hi = m; } const v = o.PV[g] - o.PV[lo]; return v > 0 ? (o.PD[g] - o.PD[lo]) / v : 0; };
const zSess = (sym, st, i) => { const g = st.g0 + i * STEP + 1, o = S[sym], qq = o.PQ[g] - o.PQ[st.g0]; return qq > 0 ? (o.PD[g] - o.PD[st.g0]) / Math.sqrt(qq) : 0; };
const zRoll = Wn => (sym, st, i) => { const g = st.g0 + i * STEP + 1, o = S[sym], a = Math.max(0, g - Wn), qq = o.PQ[g] - o.PQ[a]; return qq > 0 ? (o.PD[g] - o.PD[a]) / Math.sqrt(qq) : 0; };
const zEma = H => (sym, st, i) => { const g = st.g0 + i * STEP, e = S[sym].ema[H]; return e[2][g] > 0 ? e[0][g] / Math.sqrt(e[2][g]) : 0; };
const dyn = (sym, st, i) => { const v = sessVol(sym, st, i); return v > 0 ? sess(sym, st, i) / Math.pow(v / VB[sym], -(1 - AL[sym])) : 0; }; // |cd|/cv^alpha, uncapped
const gcapR = (sym, st, i) => sess(sym, st, i) / (lim(sym, sessVol(sym, st, i)) / MF); // pass iff >= 0.03
const CAND = [
  ['BASE_PRTH1 (sess |Press|>=0.03)', sess, 0.03], ['PGCAP (LimiarForca atual)', gcapR, 0.03],
  ['ZSCORE janela 10min', zRoll(600), null], ['ZSCORE janela 15min', zRoll(900), null], ['ZSCORE janela 30min', zRoll(1800), null], ['ZSCORE janela 60min', zRoll(3600), null], ['ZSCORE janela 120min', zRoll(7200), null],
  ['ZSCORE EMA 5min', zEma(300), null], ['ZSCORE EMA 10min', zEma(600), null], ['ZSCORE EMA 20min', zEma(1200), null], ['ZSCORE EMA 30min', zEma(1800), null], ['ZSCORE EMA 60min', zEma(3600), null],
  ['EMA_RAZAO meia-vida 30min', ema(1800), null], ['RAZAO_LOCAL ult. 10k contratos ES', volWin(10000), null],
];
function measure(F) { return steps.map(st => { const m = new Float32Array(NSTEP), sg = new Int8Array(NSTEP); for (let i = 0; i < NSTEP; i++) { if (st.cat[i] !== 4) continue; const a = F('ES', st, i), b = F('NQ', st, i); m[i] = Math.min(Math.abs(a), Math.abs(b)); sg[i] = (Math.sign(a) === st.dir[i] && Math.sign(b) === st.dir[i]) ? 1 : 0; } return { m, sg }; }); }
function emu(M, th, sel, signed) { const E = []; for (let k = 0; k < steps.length; k++) { if (sel && !sel(k)) continue; const st = steps[k], { m, sg } = M[k]; let side = 0, armed = true, cool = 0, eEs = 0, eNq = 0, cur = null, pkE = 0, pkN = 0;
  for (let i = 0; i < NSTEP; i++) { const c = st.cat[i], g = st.g0 + i * STEP; if (!st.s4[i]) armed = true;
    if (side) { const pe = side * (S.ES.px[g] - eEs) * 50, pn = side * (S.NQ.px[g] - eNq) * 20; if (pe > pkE) pkE = pe; if (pn > pkN) pkN = pn;
      const trE = pkE >= 500 ? Math.floor((pkE - 500) / 250) * 250 : null, trN = pkN >= 500 ? Math.floor((pkN - 500) / 250) * 250 : null;
      let why = null; if (c === 3) why = 'anchor'; else if (pe <= -1000 || pn <= -1000) why = 'hard'; else if ((trE !== null && pe <= trE) || (trN !== null && pn <= trN)) why = 'trail'; else if (i === NSTEP - 1) why = 'eos';
      if (why) { cur.pnl = pe + pn; cur.dur = (i - cur.i) * STEP; cur.why = why; side = 0; if (why === 'trail' && st.s4[i]) { cool = i; armed = true; } else { cool = i + 3; armed = false; } } }
    if (!side && c === 4 && m[i] >= th && (!signed || sg[i]) && i >= cool && armed && i < NSTEP - 1) { side = st.dir[i]; armed = false; eEs = S.ES.px[g]; eNq = S.NQ.px[g]; pkE = 0; pkN = 0; cur = { t: st.t0 + i * STEP * 1000, i, k, sg: sg[i], dir: side, pnl: 0, dur: 0 }; E.push(cur); } } } return E; }
function calib(M, target, sel, signed) { let lo = Math.log(1e-5), hi = Math.log(500); for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (emu(M, Math.exp(mid), sel, signed).length > target) lo = mid; else hi = mid; } return Math.exp((lo + hi) / 2); }
function metrics(E, nSess) { const t = E.map(e => e.t), g = []; for (let i = 1; i < t.length; i++) g.push(openSec(t[i - 1], t[i])); const hh = new Array(24).fill(0); t.forEach(x => hh[ET(x).getUTCHours()]++);
  let cl = t.length ? 1 : 0; g.forEach(x => { if (x >= 43 * 60) cl++; }); const rth = t.filter(x => { const d = ET(x), h = d.getUTCHours() + d.getUTCMinutes() / 60; return h >= 9.5 && h < 16; }).length;
  const hrs = hh.filter((_, i) => i !== 17), mu = hrs.reduce((a, b) => a + b, 0) / 23, cv = Math.sqrt(hrs.reduce((a, b) => a + (b - mu) ** 2, 0) / 23) / (mu || 1);
  const pn = E.map(e => e.pnl); const tot = pn.reduce((a, b) => a + b, 0);
  return { n: t.length, perSess: +(t.length / nSess).toFixed(1), clusters: cl, medGap: pct(g, .5), p90: pct(g, .9), max: g.length ? Math.max(...g) : 0, g2: g.filter(x => x > 7200).length, g4: g.filter(x => x > 14400).length, g8: g.filter(x => x > 28800).length, rth, overnight: t.length - rth, sh1820: t.length ? (hh[18] + hh[19] + hh[20]) / t.length : 0, hourCV: +cv.toFixed(2), zeroHours: hrs.filter(x => x === 0).length, hh,
    dirCons: E.length ? E.filter(e => e.sg).length / E.length : 0, pnlPerTrade: E.length ? tot / E.length : 0, pnlTotal: tot, win: E.length ? pn.filter(x => x > 0).length / E.length : 0, medDur: pct(E.map(e => e.dur), .5) }; }
// ---------- PART 1: historical milestones (18 sessions, +-5 min windows) ----------
const MS = [['RESET 0-2min', 0, 2], ['+15min', 10, 20], ['+30min', 25, 35], ['+60min', 55, 65], ['+120min', 115, 125], ['OVERNIGHT +6h (00:00 ET)', 355, 365], ['PRE-RTH 08:30 ET', 865, 875], ['RTH 10:30 ET', 985, 995], ['TARDE 14:00 ET', 1195, 1205]];
console.log('PART 1 — HISTORICAL MILESTONES (18 real sessions 09-14..10-07, tick db; values = median across sessions/steps in the window; rates = share of 20 s steps with live tape)');
console.log('milestone                 |Press|ES  |Press|NQ   volES   volNQ  limGCAP_ES limGCAP_NQ | gate0.03 ES  NQ | gateGCAP ES  NQ | dirES_def dirNQ_def aligned | P(force|aligned) 0.03 GCAP | anchorOK 0.03  GCAP  (= ENTRY_ELIGIBLE before cooldown/hysteresis)');
const msOut = [];
for (const [nm, a, b] of MS) { const pe = [], pn = [], ve = [], vn = [], le = [], ln = []; let n = 0, gE = 0, gN = 0, hE = 0, hN = 0, dE = 0, dN = 0, al = 0, okB = 0, okG = 0;
  for (const st of steps) for (let i = a * 3; i < b * 3; i++) { if (st.cat[i] === 1) continue; n++; const g = st.g0 + i * STEP, e = S.ES, q = S.NQ; const x = Math.abs(sess('ES', st, i)), y = Math.abs(sess('NQ', st, i)), v1 = sessVol('ES', st, i), v2 = sessVol('NQ', st, i), l1 = lim('ES', v1), l2 = lim('NQ', v2);
    pe.push(x); pn.push(y); ve.push(v1); vn.push(v2); le.push(l1); ln.push(l2); if (x >= MF) gE++; if (y >= MF) gN++; if (x >= l1) hE++; if (y >= l2) hN++;
    if (e.me[g] !== 0 && e.me[g] === e.mvi[g]) dE++; if (q.me[g] !== 0 && q.me[g] === q.mvi[g]) dN++; if (st.cat[i] === 4) { al++; if (x >= MF && y >= MF) okB++; if (x >= l1 && y >= l2) okG++; } }
  const P = v => (100 * v / n).toFixed(1).padStart(5);
  const row = { nm, pressES: pct(pe, .5), pressNQ: pct(pn, .5), volES: pct(ve, .5), volNQ: pct(vn, .5), limES: pct(le, .5), limNQ: pct(ln, .5), gateES: gE / n, gateNQ: gN / n, gcapES: hE / n, gcapNQ: hN / n, dirES: dE / n, dirNQ: dN / n, aligned: al / n, fB: okB / Math.max(1, al), fG: okG / Math.max(1, al), okB: okB / n, okG: okG / n }; msOut.push(row);
  console.log(nm.padEnd(25), row.pressES.toFixed(4).padStart(8), row.pressNQ.toFixed(4).padStart(10), String(Math.round(row.volES)).padStart(8), String(Math.round(row.volNQ)).padStart(7), row.limES.toFixed(4).padStart(9), row.limNQ.toFixed(4).padStart(10), ' |', P(gE), P(gN), ' |', P(hE), P(hN), ' |', P(dE), P(dN).padStart(9), P(al).padStart(8), ' |', (100 * row.fB).toFixed(1).padStart(8), (100 * row.fG).toFixed(1).padStart(6), '        |', (100 * row.okB).toFixed(2).padStart(6), (100 * row.okG).toFixed(2).padStart(6)); }
// ---------- PART 2: alternatives ----------
const calSel = k => k < NCAL, oosSel = k => k >= NCAL;
const TARGET_PER_SESS = 17.5, tCal = Math.round(TARGET_PER_SESS * NCAL);
const noF = steps.map(st => ({ m: Float32Array.from(st.cat, c => c === 4 ? 1 : 0), sg: new Int8Array(NSTEP).fill(1) }));
const res = [];
const add = (name, M, th, signed, note) => { const all = metrics(emu(M, th, null, signed), DAYS.length), oos = metrics(emu(M, th, oosSel, signed), DAYS.length - NCAL), cal = metrics(emu(M, th, calSel, signed), NCAL); const sens = [emu(M, th * 0.8, null, signed).length, emu(M, th * 1.25, null, signed).length];
  const half = Math.floor(DAYS.length / 2), h1 = metrics(emu(M, th, k => k < half, signed), half), h2 = metrics(emu(M, th, k => k >= half, signed), DAYS.length - half);
  // P(force|aligned) per session bucket -> temporal flatness
  const B = [[0, 60], [60, 240], [240, 480], [480, 780], [780, 930], [930, 1125], [1125, 1320]]; const pr = B.map(([a, b]) => { let al = 0, ok = 0; steps.forEach((st, k) => { for (let i = a * 3; i < b * 3; i++) if (st.cat[i] === 4) { al++; if (M[k].m[i] >= th && (!signed || M[k].sg[i])) ok++; } }); return ok / Math.max(1, al); });
  res.push({ name, theta: th, signed: !!signed, note, all, oos, cal, sens, h1, h2, passByBucket: pr.map(x => +x.toFixed(4)), passMaxMin: +(Math.max(...pr) / Math.max(1e-6, Math.min(...pr))).toFixed(1) }); };
add('SEM_FORCE (so passos 1-3)', noF, 0.5, false, 'contrafactual, gate de forca desligado');
for (const [name, F, fixed] of CAND) { const M = measure(F); if (fixed != null) add(name, M, fixed, false, 'limiar vigente, sem calibracao'); else { add(name, M, calib(M, tCal, calSel, false), false, 'theta calibrado nas ' + NCAL + ' primeiras sessoes p/ ' + TARGET_PER_SESS + ' entradas/sessao'); } if (/ZSCORE|EMA_RAZAO|RAZAO_LOCAL/.test(name)) add(name + ' + SINAL=direcao', M, calib(M, tCal, calSel, true), true, 'exige sinal da razao igual a direcao; theta calibrado'); }
console.log('\nPART 2 — STEP-4 ALTERNATIVES on the same ticks (18 sessions; theta calibrated on first 9 to ' + TARGET_PER_SESS + ' entries/session; OOS = last 9). PnL = descriptive, exit only on divergence (no stops), ES x50 + NQ x20');
console.log('alternative                                   theta    N  /sess clus medGap  p90   max  >2h >4h >8h  ovn  RTH 18-20h hourCV 0h-hours passMax/Min dirCons  pnl/trade  win  | OOS: N p90 >4h 18-20h hourCV pnl/trade');
for (const r of res) { const a = r.all, o = r.oos; console.log(r.name.padEnd(45), r.theta.toFixed(5).padStart(8), String(a.n).padStart(5), String(a.perSess).padStart(5), String(a.clusters).padStart(4), fm(a.medGap).padStart(6), fm(a.p90).padStart(6), fm(a.max).padStart(6), String(a.g2).padStart(4), String(a.g4).padStart(3), String(a.g8).padStart(3), String(a.overnight).padStart(5), String(a.rth).padStart(4), (100 * a.sh1820).toFixed(0).padStart(5) + '%', String(a.hourCV).padStart(6), String(a.zeroHours).padStart(5), String(r.passMaxMin).padStart(11), (100 * a.dirCons).toFixed(0).padStart(7) + '%', a.pnlPerTrade.toFixed(1).padStart(9), (100 * a.win).toFixed(0).padStart(4) + '%', ' |', String(o.n).padStart(4), fm(o.p90).padStart(6), String(o.g4).padStart(3), (100 * o.sh1820).toFixed(0).padStart(4) + '%', String(o.hourCV).padStart(5), o.pnlPerTrade.toFixed(1).padStart(8)); }
console.log('\nENTRIES BY ET HOUR (0..23):'); for (const r of res) console.log(r.name.padEnd(45), r.all.hh.join(' '));
console.log('\nP(force pass | aligned) by session bucket [0-1h, 1-4h, 4-8h, 8-13h, 13-15.5h, RTH1, RTH2]:'); for (const r of res) console.log(r.name.padEnd(45), r.passByBucket.map(x => (100 * x).toFixed(1).padStart(6)).join(''));
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'alt2_results.json'), JSON.stringify({ milestones: msOut, target: TARGET_PER_SESS, res }, null, 1));

console.log('\nROBUSTEZ — theta x0.8 / x1.25 (N total) | metade 1 x metade 2 das sessoes: N/sess, 18-20h, hourCV, pnl/trade, win');
for (const r of res) console.log(r.name.padEnd(45), String(r.sens[0]).padStart(6), String(r.sens[1]).padStart(6), ' |', String(r.h1.perSess).padStart(6), (100 * r.h1.sh1820).toFixed(0).padStart(4) + '%', String(r.h1.hourCV).padStart(5), r.h1.pnlPerTrade.toFixed(1).padStart(8), (100 * r.h1.win).toFixed(0).padStart(4) + '%', ' x', String(r.h2.perSess).padStart(6), (100 * r.h2.sh1820).toFixed(0).padStart(4) + '%', String(r.h2.hourCV).padStart(5), r.h2.pnlPerTrade.toFixed(1).padStart(8), (100 * r.h2.win).toFixed(0).padStart(4) + '%');
console.log('sessions', DAYS.length, DAYS[0], '..', DAYS[DAYS.length - 1], '| calibration sessions', NCAL);
