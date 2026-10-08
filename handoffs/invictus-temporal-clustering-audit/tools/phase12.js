// read-only analysis: entries, gaps, clusters, dead zones (history jsonl) -> entries.json + report
const fs = require('fs'), path = require('path');
const H = 'C:/Users/ADM/Documents/NinjaTrader 8/alfaomega-robo/history';
const ET = ms => new Date(ms - 4 * 3600e3); // EDT in whole window
const etStr = ms => ET(ms).toISOString().slice(0, 16).replace('T', ' ');
const etHour = ms => ET(ms).getUTCHours() + ET(ms).getUTCMinutes() / 60;
const sess = ms => { const d = ET(ms), h = d.getUTCHours() + d.getUTCMinutes() / 60, wd = d.getUTCDay(); return (wd >= 1 && wd <= 5 && h >= 9.5 && h < 16) ? 'RTH' : 'OUTSIDE_RTH'; };
// market-open seconds between two instants (CME: closed daily 17-18 ET, Fri 17 ET -> Sun 18 ET)
function openSec(a, b) { let s = 0; for (let t = a; t < b; t += 60e3) { const d = ET(t), h = d.getUTCHours(), wd = d.getUTCDay(); const closed = h === 17 || wd === 6 || (wd === 5 && h >= 17) || (wd === 0 && h < 18); if (!closed) s += 60; } return s; }
let rows = [];
for (const f of ['trades-2026-09.jsonl', 'trades-2026-10.jsonl']) for (const l of fs.readFileSync(H + '/' + f, 'utf8').split(/\r?\n/)) if (l.trim()) rows.push(JSON.parse(l));
const test = rows.filter(r => /TEST/.test(r.reason));
let org = rows.filter(r => !/TEST/.test(r.reason) && r.replay === false && r.simulated === false && r.engine === 'invictus');
org.forEach(r => { r.o = Date.parse(r.openedAt); r.c = Date.parse(r.closedAt); r.recon = r.c - r.durationSec * 1000; });
org.sort((a, b) => a.o - b.o);
// dedupe identical openedAt
const seen = new Set(); const dup = []; org = org.filter(r => { if (seen.has(r.openedAt)) { dup.push(r.openedAt); return false; } seen.add(r.openedAt); return true; });
const maxReconErr = Math.max(...org.map(r => Math.abs(r.recon - r.o)));
console.log('rows', rows.length, 'test_excluded', test.length, 'organic', org.length, 'dups_removed', dup.length, 'max |CLOSE-DURATION - openedAt| s', (maxReconErr / 1000).toFixed(1));
console.log('priceSource', JSON.stringify(org.reduce((h, r) => (h[r.priceSource] = (h[r.priceSource] || 0) + 1, h), {})));
console.log('session of entry', JSON.stringify(org.reduce((h, r) => (h[sess(r.o)] = (h[sess(r.o)] || 0) + 1, h), {})));
console.log('exit reason', JSON.stringify(org.reduce((h, r) => (h[r.reason] = (h[r.reason] || 0) + 1, h), {})));
// gaps
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fm = s => s >= 3600 ? (s / 3600).toFixed(2) + 'h' : (s / 60).toFixed(1) + 'min';
const gaps = [], gapsOpen = [];
for (let i = 1; i < org.length; i++) { org[i].gap = (org[i].o - org[i - 1].o) / 1000; org[i].gapOpen = openSec(org[i - 1].o, org[i].o); org[i].flatGap = (org[i].o - org[i - 1].c) / 1000; gaps.push(org[i].gap); gapsOpen.push(org[i].gapOpen); }
for (const [n, g] of [['GAP_wallclock', gaps], ['GAP_market_open_time', gapsOpen]]) console.log(n, 'n', g.length, 'median', fm(pct(g, .5)), 'p75', fm(pct(g, .75)), 'p90', fm(pct(g, .9)), 'p95', fm(pct(g, .95)), 'max', fm(Math.max(...g)));
const dur = org.map(r => r.durationSec); console.log('DURATION median', fm(pct(dur, .5)), 'p75', fm(pct(dur, .75)), 'p90', fm(pct(dur, .9)), 'max', fm(Math.max(...dur)));
// Otsu on log10(market-open gap) => data-driven cluster break
const lg = gapsOpen.map(g => Math.log10(Math.max(g, 30)));
let best = null; const cand = [...new Set(lg)].sort((a, b) => a - b);
for (let i = 1; i < cand.length; i++) { const th = (cand[i - 1] + cand[i]) / 2; const A = lg.filter(x => x < th), B = lg.filter(x => x >= th); const m = a => a.reduce((x, y) => x + y, 0) / a.length; const v = A.length * B.length * (m(A) - m(B)) ** 2; if (!best || v > best.v) best = { v, th }; }
const TH = Math.pow(10, best.th);
console.log('OTSU cluster break (market-open gap):', fm(TH), '| gaps below', gapsOpen.filter(g => g < TH).length, 'above', gapsOpen.filter(g => g >= TH).length);
// histogram of log gaps
const bins = [60, 120, 300, 600, 1200, 1800, 3600, 7200, 14400, 28800, 57600, 1e9]; const hb = bins.map(() => 0); gapsOpen.forEach(g => { hb[bins.findIndex(b => g < b)]++; });
console.log('gapOpen histogram', bins.map((b, i) => '<' + (b >= 1e9 ? 'inf' : fm(b)) + ':' + hb[i]).join(' '));
// clusters
const clusters = []; let cur = null;
for (const r of org) { if (!cur || r.gapOpen >= TH) { cur = { trades: [] }; clusters.push(cur); } cur.trades.push(r); }
clusters.forEach(c => { c.start = c.trades[0].o; c.lastEntry = c.trades[c.trades.length - 1].o; c.end = c.trades[c.trades.length - 1].c; c.n = c.trades.length; });
const cn = clusters.map(c => c.n), cd = clusters.map(c => (c.lastEntry - c.start) / 1000);
console.log('CLUSTERS', clusters.length, '| trades/cluster median', pct(cn, .5), 'mean', (org.length / clusters.length).toFixed(2), 'max', Math.max(...cn), '| singletons', cn.filter(x => x === 1).length, '| cluster span median', fm(pct(cd, .5)), 'p90', fm(pct(cd, .9)));
const inter = []; for (let i = 1; i < clusters.length; i++) inter.push(openSec(clusters[i - 1].end, clusters[i].start));
console.log('INTER-CLUSTER dead (market-open, end->next start) median', fm(pct(inter, .5)), 'p75', fm(pct(inter, .75)), 'p90', fm(pct(inter, .9)), 'max', fm(Math.max(...inter)));
// hour-of-day distribution (ET) entries + clusters starts
const hh = new Array(24).fill(0), ch = new Array(24).fill(0), days = new Set(org.map(r => r.sessionDate));
org.forEach(r => hh[Math.floor(etHour(r.o))]++); clusters.forEach(c => ch[Math.floor(etHour(c.start))]++);
console.log('ENTRIES by ET hour:', hh.map((v, i) => i + 'h=' + v).join(' '));
console.log('CLUSTER STARTS by ET hour:', ch.map((v, i) => i + 'h=' + v).join(' '));
const top = hh.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 6); console.log('top hours', top.map(x => x[1] + 'h ET: ' + x[0] + ' (' + (100 * x[0] / org.length).toFixed(1) + '%)').join(' | '));
// per-day table
const byDay = {}; org.forEach(r => { const d = ET(r.o).toISOString().slice(0, 10); (byDay[d] = byDay[d] || []).push(r); });
console.log('\nPER ET-DAY: date n | entry times ET');
for (const d of Object.keys(byDay).sort()) console.log(d, byDay[d].length, '|', byDay[d].map(r => ET(r.o).toISOString().slice(11, 16) + (r.side === 'LONG' ? 'L' : 'S') + (r.priceSource === 'aot_canonical_event' ? '*' : '')).join(' '));
// top dead zones
const dz = []; for (let i = 1; i < org.length; i++) dz.push({ from: org[i - 1].c, to: org[i].o, open: openSec(org[i - 1].c, org[i].o) });
dz.sort((a, b) => b.open - a.open);
console.log('\nTOP 15 DEAD ZONES (market-open time, last exit -> next entry):'); dz.slice(0, 15).forEach(z => console.log(' ', etStr(z.from), '->', etStr(z.to), 'ET open', fm(z.open)));
console.log('\nCLUSTERS (Oct):'); clusters.filter(c => c.start >= Date.parse('2026-10-01T00:00:00Z')).forEach(c => console.log(' ', etStr(c.start), '->', etStr(c.end), 'n', c.n, 'span', fm((c.lastEntry - c.start) / 1000), c.trades.map(t => t.side[0]).join('')));
fs.writeFileSync(path.join(__dirname, 'entries.json'), JSON.stringify({ TH, org: org.map(r => ({ o: r.o, c: r.c, side: r.side, reason: r.reason, dur: r.durationSec, ps: r.priceSource, gapOpen: r.gapOpen, veic: r.veiculos, sessEntry: sess(r.o) })), clusters: clusters.map(c => ({ start: c.start, lastEntry: c.lastEntry, end: c.end, n: c.n })) }));
