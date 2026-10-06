// P1S Press (2026-10-02) — gera a fixture REAL do test_press a partir do tick db do NT8 (SOMENTE LEITURA).
// Decodificador validado (handoff AOT_INVICTUS_CLOSE_DIVERGENCE §AB): UTC = ncd + 3 h; lado = mapa B.
// Saida: fixtures/press_ticks_<data>.csv  (utcTicks,sym,price,bid,ask,vol)  bid/ask sinteticos coerentes com o lado
//        fixtures/press_ref_<data>.csv    (idx,cumDelta,sessVolume,press) referencia JS P1 por simbolo, checkpoints
//        fixtures/press_meta_<data>.json  (virada por simbolo = indice do 1o tick da sessao, contagens, sha)
// Uso: node gen_press_fixture.js [YYYY-MM-DD da virada 22Z]   (default 2026-09-30)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { decode } = require('C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/close-divergence-20261001/press-policy/tools/ncd_decode.js');
const NT = 'C:/Users/ADM/Documents/NinjaTrader 8/db/tick';
const DIA = process.argv[2] || '2026-09-30';
const VIRADA_NOM = Date.parse(DIA + 'T22:00:00Z');
const INI = VIRADA_NOM - 6 * 3600e3, FIM = VIRADA_NOM + 8 * 3600e3;
const T0 = 621355968000000000n, H3 = 3n * 3600n * 10000000n;
const OUT = path.join(__dirname, 'fixtures'); fs.mkdirSync(OUT, { recursive: true });
const tag = DIA.replace(/-/g, '');

function lado(r) { if (r.code < 6) return (r.code & 1) ? 1 : -1; const bidOff = r.ex[0], askOff = r.ex[1]; if (askOff === 0 && bidOff !== 0) return 1; if (bidOff === 0 && askOff !== 0) return -1; return 0; }
function ticks(sym) {
  const dir = path.join(NT, sym + ' 12-26'), out = [];
  const d0 = new Date(INI - 24 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''), d1 = new Date(FIM + 24 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.Last.ncd') && f.slice(0, 8) >= d0 && f.slice(0, 8) <= d1).sort()) {
    const r = decode(path.join(dir, f));
    for (const x of r.recs) {
      const ut = x.t + H3, ms = Number((ut - T0) / 10000n);
      if (ms < INI || ms >= FIM) continue;
      const px = +(x.pxT * r.tick).toFixed(4), s = lado(x), tk = r.tick;
      const bid = s > 0 ? px - tk : px, ask = s < 0 ? px + tk : (s > 0 ? px : px + tk);
      out.push({ ut, ms, sym, px, bid: s === 0 ? px - tk : bid, ask, vol: x.vol, s });
    }
  }
  out.sort((a, b) => (a.ut < b.ut ? -1 : a.ut > b.ut ? 1 : 0));
  return out;
}
const all = [];
const meta = { dia: DIA, ini: new Date(INI).toISOString(), fim: new Date(FIM).toISOString(), simbolos: {} };
for (const sym of ['ES', 'NQ']) {
  const t = ticks(sym);
  if (!t.length) throw new Error('sem ticks ' + sym);
  // virada = 1o tick apos >= 30 min sem trade (fronteira real, nao calendario)
  let iv = -1; for (let i = 1; i < t.length; i++) if (t[i].ms - t[i - 1].ms >= 30 * 60e3) { iv = i; break; }
  if (iv < 0) throw new Error('virada nao encontrada ' + sym);
  let maxGap = 0; for (let i = iv + 1; i < t.length; i++) maxGap = Math.max(maxGap, t[i].ms - t[i - 1].ms);
  meta.simbolos[sym] = { n: t.length, viradaUtc: new Date(t[iv].ms).toISOString(), viradaTicks: t[iv].ut.toString(), maxGapPosViradaSeg: maxGap / 1000 };
  for (const x of t) all.push(x);
}
all.sort((a, b) => (a.ut < b.ut ? -1 : a.ut > b.ut ? 1 : (a.sym < b.sym ? -1 : 1)));
// referencia JS P1: acumula desde a virada (inclusive) por simbolo; checkpoints a cada 500 ticks do simbolo + ultimo
const lines = ['utcTicks,sym,price,bid,ask,vol'], ref = ['idx,sym,cumDelta,sessVolume,press'];
const acc = { ES: { c: 0, v: 0, n: 0, on: false }, NQ: { c: 0, v: 0, n: 0, on: false } };
all.forEach((x, i) => {
  lines.push(`${x.ut},${x.sym},${x.px},${x.bid},${x.ask},${x.vol}`);
  const a = acc[x.sym];
  if (!a.on && x.ut.toString() === meta.simbolos[x.sym].viradaTicks) a.on = true;
  if (!a.on) return;
  a.c += x.s * x.vol; a.v += x.vol; a.n++;
  if (a.n % 500 === 0) ref.push(`${i},${x.sym},${a.c},${a.v},${(a.c / a.v).toPrecision(17)}`);
  a.last = `${i},${x.sym},${a.c},${a.v},${(a.c / a.v).toPrecision(17)}`;
});
for (const s of ['ES', 'NQ']) ref.push(acc[s].last);
const fT = path.join(OUT, `press_ticks_${tag}.csv`), fR = path.join(OUT, `press_ref_${tag}.csv`);
fs.writeFileSync(fT, lines.join('\n') + '\n'); fs.writeFileSync(fR, ref.join('\n') + '\n');
meta.ticks = all.length; meta.refCheckpoints = ref.length - 1;
meta.sha256 = { ticks: crypto.createHash('sha256').update(fs.readFileSync(fT)).digest('hex'), ref: crypto.createHash('sha256').update(fs.readFileSync(fR)).digest('hex') };
fs.writeFileSync(path.join(OUT, `press_meta_${tag}.json`), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
