// Gera alt2.js a partir de alt.js (mesmo nucleo validado) para fechar a lacuna do JEV SELECT T1 (suficiencia = B):
// mais sessoes (47 = contratos 09-26 + 12-26), grade maior de parametros do ZSCORE, PnL COM stops do motor, sensibilidade de theta.
const fs = require('fs'), path = require('path');
let s = fs.readFileSync(path.join(__dirname, 'alt.js'), 'utf8');
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISSING', a.slice(0, 70)); process.exit(1); } s = s.replace(a, b); };
const repRe = (re, b) => { if (!re.test(s)) { console.log('MISSING RE', String(re).slice(0, 70)); process.exit(1); } s = s.replace(re, b); };
repRe(/const DAYS = \[[^\]]*\];/, "const SJ = JSON.parse(fs.readFileSync('C:/Users/ADM/Desktop/Handof TTW/HANDOFF/conf-tests/pack-native-20261006/press-recalibration-20261007/data/sessions.json', 'utf8'));\nconst DAYS = SJ.filter(r => r.status === 'COMPLETE').map(r => r.date).sort();\nconst ROLL = Date.parse('2026-09-11T22:00:00Z'), NCAL = 16;");
rep("  const dir = path.join(NT, sym + ' ' + CT);\n", "");
rep("  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.Last.ncd')).sort().filter(f => f.slice(0, 8) >= lo && f.slice(0, 8) <= hi)) {",
  "  for (const ct of ['09-26', '12-26']) { const dir = path.join(NT, sym + ' ' + ct); if (!fs.existsSync(dir)) continue;\n  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.Last.ncd')).sort().filter(f => f.slice(0, 8) >= lo && f.slice(0, 8) <= hi && (ct === '09-26' ? f.slice(0, 8) <= '20260912' : f.slice(0, 8) >= '20260910'))) {");
rep("const ms = Number((x.t + H3 - T0) / 10000n), s = lado(x), vol = x.vol;\n      if (E.last)", "const ms = Number((x.t + H3 - T0) / 10000n), s = lado(x), vol = x.vol;\n      if ((ms >= ROLL) !== (ct === '12-26')) continue;\n      if (E.last)");
rep("  flush(GN);\n  for (let i = 0; i < GN; i++) { o.PD", "  }\n  flush(GN);\n  for (let i = 0; i < GN; i++) { o.PD");
rep("for (const H of [600, 1800])", "for (const H of [300, 600, 1200, 1800, 3600])");
repRe(/const CAND = \[[\s\S]*?\n\];\nfunction measure/, `const CAND = [
  ['BASE_PRTH1 (sess |Press|>=0.03)', sess, 0.03], ['PGCAP (LimiarForca atual)', gcapR, 0.03],
  ['ZSCORE janela 10min', zRoll(600), null], ['ZSCORE janela 15min', zRoll(900), null], ['ZSCORE janela 30min', zRoll(1800), null], ['ZSCORE janela 60min', zRoll(3600), null], ['ZSCORE janela 120min', zRoll(7200), null],
  ['ZSCORE EMA 5min', zEma(300), null], ['ZSCORE EMA 10min', zEma(600), null], ['ZSCORE EMA 20min', zEma(1200), null], ['ZSCORE EMA 30min', zEma(1800), null], ['ZSCORE EMA 60min', zEma(3600), null],
  ['EMA_RAZAO meia-vida 30min', ema(1800), null], ['RAZAO_LOCAL ult. 10k contratos ES', volWin(10000), null],
];
function measure`);
rep("/RAZAO_LOCAL ult. 10k|JANELA_MOVEL 30min|EMA meia-vida 30min|ZSCORE EMA 30min|ZSCORE janela 30min/", "/ZSCORE|EMA_RAZAO|RAZAO_LOCAL/");
// motor com stops (hard -1000 por perna; trailing: BE a partir de +500, sobe 250 a cada +250; saida por trailing com 4/4 = reentrada imediata)
repRe(/function emu\(M, th, sel, signed\) \{[\s\S]*?\n(?=function calib)/, `function emu(M, th, sel, signed) { const E = []; for (let k = 0; k < steps.length; k++) { if (sel && !sel(k)) continue; const st = steps[k], { m, sg } = M[k]; let side = 0, armed = true, cool = 0, eEs = 0, eNq = 0, cur = null, pkE = 0, pkN = 0;
  for (let i = 0; i < NSTEP; i++) { const c = st.cat[i], g = st.g0 + i * STEP; if (!st.s4[i]) armed = true;
    if (side) { const pe = side * (S.ES.px[g] - eEs) * 50, pn = side * (S.NQ.px[g] - eNq) * 20; if (pe > pkE) pkE = pe; if (pn > pkN) pkN = pn;
      const trE = pkE >= 500 ? Math.floor((pkE - 500) / 250) * 250 : null, trN = pkN >= 500 ? Math.floor((pkN - 500) / 250) * 250 : null;
      let why = null; if (c === 3) why = 'anchor'; else if (pe <= -1000 || pn <= -1000) why = 'hard'; else if ((trE !== null && pe <= trE) || (trN !== null && pn <= trN)) why = 'trail'; else if (i === NSTEP - 1) why = 'eos';
      if (why) { cur.pnl = pe + pn; cur.dur = (i - cur.i) * STEP; cur.why = why; side = 0; if (why === 'trail' && st.s4[i]) { cool = i; armed = true; } else { cool = i + 3; armed = false; } } }
    if (!side && c === 4 && m[i] >= th && (!signed || sg[i]) && i >= cool && armed && i < NSTEP - 1) { side = st.dir[i]; armed = false; eEs = S.ES.px[g]; eNq = S.NQ.px[g]; pkE = 0; pkN = 0; cur = { t: st.t0 + i * STEP * 1000, i, k, sg: sg[i], dir: side, pnl: 0, dur: 0 }; E.push(cur); } } } return E; }
`);
rep("const calSel = k => k < 9, oosSel = k => k >= 9;", "const calSel = k => k < NCAL, oosSel = k => k >= NCAL;");
rep("tCal = Math.round(TARGET_PER_SESS * 9)", "tCal = Math.round(TARGET_PER_SESS * NCAL)");
rep("const all = metrics(emu(M, th, null, signed), 18), oos = metrics(emu(M, th, oosSel, signed), 9), cal = metrics(emu(M, th, calSel, signed), 9);",
  "const all = metrics(emu(M, th, null, signed), DAYS.length), oos = metrics(emu(M, th, oosSel, signed), DAYS.length - NCAL), cal = metrics(emu(M, th, calSel, signed), NCAL); const sens = [emu(M, th * 0.8, null, signed).length, emu(M, th * 1.25, null, signed).length];\n  const half = Math.floor(DAYS.length / 2), h1 = metrics(emu(M, th, k => k < half, signed), half), h2 = metrics(emu(M, th, k => k >= half, signed), DAYS.length - half);");
rep("res.push({ name, theta: th, signed: !!signed, note, all, oos, cal,", "res.push({ name, theta: th, signed: !!signed, note, all, oos, cal, sens, h1, h2,");
rep("'theta calibrado em 9 sessoes p/ '", "'theta calibrado nas ' + NCAL + ' primeiras sessoes p/ '");
rep("'alt_results.json'", "'alt2_results.json'");
s += `
console.log('\\nROBUSTEZ — theta x0.8 / x1.25 (N total) | metade 1 x metade 2 das sessoes: N/sess, 18-20h, hourCV, pnl/trade, win');
for (const r of res) console.log(r.name.padEnd(45), String(r.sens[0]).padStart(6), String(r.sens[1]).padStart(6), ' |', String(r.h1.perSess).padStart(6), (100 * r.h1.sh1820).toFixed(0).padStart(4) + '%', String(r.h1.hourCV).padStart(5), r.h1.pnlPerTrade.toFixed(1).padStart(8), (100 * r.h1.win).toFixed(0).padStart(4) + '%', ' x', String(r.h2.perSess).padStart(6), (100 * r.h2.sh1820).toFixed(0).padStart(4) + '%', String(r.h2.hourCV).padStart(5), r.h2.pnlPerTrade.toFixed(1).padStart(8), (100 * r.h2.win).toFixed(0).padStart(4) + '%');
console.log('sessions', DAYS.length, DAYS[0], '..', DAYS[DAYS.length - 1], '| calibration sessions', NCAL);
`;
fs.writeFileSync(path.join(__dirname, 'alt2.js'), s); console.log('alt2.js written');
