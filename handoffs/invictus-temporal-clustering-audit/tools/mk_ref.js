// Gera ref_z30.js a partir do nucleo de alt2.js (modelo aprovado no JEV DESIGN) para o harness C# x replay:
//  - exporta os MESMOS ticks (ms, preco, volume, lado) para <OUT>\ticks_{ES,NQ}.bin (24 bytes/registro: f64 ms, f64 px, i32 vol, i32 lado)
//  - exporta <OUT>\sessions.txt (t0 em ms das 44 sessoes) e <OUT>\ref_steps.csv (k,i,cat,dir,zES,zNQ,ok) do modelo JS, theta 3.454 com sinal
//  - exporta <OUT>\js_entries.json (entradas do motor emulado JS com a candidata)
const fs = require('fs'), path = require('path');
let s = fs.readFileSync(path.join(__dirname, 'alt2.js'), 'utf8');
const cut = s.indexOf('// ---------- PART 1'); if (cut < 0) { console.log('marker missing'); process.exit(1); }
s = s.slice(0, cut);
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISSING', a.slice(0, 60)); process.exit(1); } s = s.replace(a, b); };
rep("const S = {};", `const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const TWs = {}; function TW(sym, ms, px, vol, side) { let w = TWs[sym]; if (!w) w = TWs[sym] = { fd: fs.openSync(path.join(OUT, 'ticks_' + sym + '.bin'), 'w'), b: Buffer.alloc(24 * 1000000), n: 0, tot: 0 };
  const o = w.n * 24; w.b.writeDoubleLE(ms, o); w.b.writeDoubleLE(px, o + 8); w.b.writeInt32LE(vol, o + 16); w.b.writeInt32LE(side, o + 20); w.n++; w.tot++; if (w.n === 1000000) { fs.writeSync(w.fd, w.b, 0, w.n * 24); w.n = 0; } }
function TWclose() { for (const k of Object.keys(TWs)) { const w = TWs[k]; if (w.n) fs.writeSync(w.fd, w.b, 0, w.n * 24); fs.closeSync(w.fd); console.log('ticks', k, w.tot); } }
const S = {};`);
rep("if ((ms >= ROLL) !== (ct === '12-26')) continue;", "if ((ms >= ROLL) !== (ct === '12-26')) continue;\n      TW(sym, ms, x.pxT * r.tick, vol, s);");
s += `
TWclose();
const TH = 3.454, zf = zRoll(1800);
fs.writeFileSync(path.join(OUT, 'sessions.txt'), steps.map(st => st.t0).join('\\n') + '\\n');
const fd = fs.openSync(path.join(OUT, 'ref_steps.csv'), 'w'); let buf = [];
const M = steps.map(st => { const m = new Float32Array(NSTEP), sg = new Int8Array(NSTEP); return { m, sg }; });
steps.forEach((st, k) => { for (let i = 0; i < NSTEP; i++) { const a = zf('ES', st, i), b = zf('NQ', st, i), c = st.cat[i], d = st.dir[i];
    const okE = c === 4 && (d > 0 ? a >= TH : a <= -TH), okN = c === 4 && (d > 0 ? b >= TH : b <= -TH), ok = okE && okN;
    if (c === 4) { M[k].m[i] = ok ? 1e9 : 0; M[k].sg[i] = 1; }
    buf.push(k + ',' + i + ',' + c + ',' + d + ',' + a + ',' + b + ',' + (ok ? 1 : 0) + ',' + (okE ? 1 : 0) + ',' + (okN ? 1 : 0)); if (buf.length >= 50000) { fs.writeSync(fd, buf.join('\\n') + '\\n'); buf = []; } } });
if (buf.length) fs.writeSync(fd, buf.join('\\n') + '\\n'); fs.closeSync(fd);
const E = emu(M, 1, null, false), mt = metrics(E, DAYS.length);
fs.writeFileSync(path.join(OUT, 'js_entries.json'), JSON.stringify({ theta: TH, sessions: DAYS, t0: steps.map(st => st.t0), entries: E.map(e => [e.t, e.dir, e.pnl, e.why || '']), metrics: mt }));
console.log('JS Z30 theta', TH, 'entries', mt.n, 'perSess', mt.perSess, 'p90', mt.p90, '>4h', mt.g4, '>8h', mt.g8, '18-20', mt.sh1820.toFixed(3), 'rth', mt.rth, 'hourCV', mt.hourCV);
`;
fs.writeFileSync(path.join(__dirname, 'ref_z30.js'), s); console.log('ref_z30.js written');
