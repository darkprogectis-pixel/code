// READ-ONLY: auditoria do runtime real desde o PLAY da FORCA_JANELA_30. Uso: node rt_audit.js <audit_slice.jsonl> <trades-2026-10.jsonl> <PLAY_ISO>
const fs = require('fs'), rl = require('readline');
const [SL, HIST, PLAY] = process.argv.slice(2); const tPlay = Date.parse(PLAY);
const ET = ms => new Date(ms - 4 * 3600e3); const etS = ms => ET(ms).toISOString().slice(11, 19);
const M = s => String(s).replace(/TAKEPROFIT\d+(\d{3})/g, 'TAKEPROFIT***$1');
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fm = s => s >= 3600 ? (s / 3600).toFixed(2) + 'h' : (s / 60).toFixed(1) + 'min';
const ticks = [], ev = {}, evL = [];
const r = rl.createInterface({ input: fs.createReadStream(SL) });
r.on('line', l => { let o; try { o = JSON.parse(l); } catch (e) { return; } const t = Date.parse(o.ts); ev[o.event] = (ev[o.event] || 0) + 1;
  if (o.event === 'motor_tick') { const p = o.payload || {}, a = p.anchor || {}, st = p.estado || {}; ticks.push({ t, dir: a.dir, s: a.strength, why: a.why || '', side: p.side, abriu: !!p.abriu, fechou: !!p.fechou, ms: p.motivo_saida || '', eb: !!p.exec_bloqueia_entrada, ebm: p.exec_bloqueio_motivo || '', armed: st.armed, cd: st.cooldownUntil ? Date.parse(st.cooldownUntil) : 0 }); }
  else if (/gate_check|robo_(play|stop|alerta)|engine_|session_start|source_readiness_(blocked|ready)|connection_status|place_fail|flatten_fail|take_escort_fail|protecao_reprotegida|entrada_sem_execucao|motor_abertura_desfeita|motor_abriu|motor_fechou|trade_ledger_closed|nt8_ready|exec_block_entrada/.test(o.event)) evL.push(o); });
r.on('close', () => {
  ticks.sort((a, b) => a.t - b.t); const uniq = []; let last = 0; for (const x of ticks) { if (x.t === last && uniq.length && !x.abriu) continue; uniq.push(x); last = x.t; }
  const T = uniq.filter(x => x.t >= tPlay); const tEnd = T[T.length - 1].t;
  console.log('WINDOW play', PLAY, '-> last tick', new Date(tEnd).toISOString(), '=', fm((tEnd - tPlay) / 1000), '| ET', etS(tPlay), '->', etS(tEnd), '| ticks', T.length);
  // coverage + categories (time-weighted, dt cap 90 s)
  const cat = x => (x.dir === 'LONG' || x.dir === 'SHORT') ? 'OK_4of4' : /^sem tape/.test(x.why) ? 'TAPE' : /indefinid/.test(x.why) ? 'UNDEFINED' : /divergentes/.test(x.why) ? 'DIVERGENT' : /^forca fraca ES\/NQ/.test(x.why) ? 'FORCE_BOTH' : /^forca fraca ES/.test(x.why) ? 'FORCE_ES_only(NQ pass)' : /^forca fraca NQ/.test(x.why) ? 'FORCE_NQ_only(ES pass)' : 'OTHER:' + x.why;
  const W = {}, C = {}; let cov = 0, unc = 0, maxGap = 0;
  for (let i = 0; i < T.length; i++) { const dt = i + 1 < T.length ? (T[i + 1].t - T[i].t) / 1000 : 20; const w = Math.min(dt, 90); cov += w; if (dt > 90) unc += dt - 90; if (dt > maxGap) maxGap = dt; const k = cat(T[i]); W[k] = (W[k] || 0) + w; C[k] = (C[k] || 0) + 1; T[i].w = w; T[i].c = k; }
  console.log('COVERAGE covered', fm(cov), 'uncovered(tick gaps>90s)', fm(unc), 'max tick gap', maxGap.toFixed(0) + 's');
  console.log('GATE first-fail (ticks | time share):'); for (const k of Object.keys(W).sort()) console.log('  ' + k.padEnd(26), String(C[k]).padStart(5), (100 * W[k] / cov).toFixed(1).padStart(6) + '%');
  const s123 = (C['FORCE_BOTH'] || 0) + (C['FORCE_ES_only(NQ pass)'] || 0) + (C['FORCE_NQ_only(ES pass)'] || 0) + (C['OK_4of4'] || 0);
  const nqP = (C['FORCE_ES_only(NQ pass)'] || 0) + (C['OK_4of4'] || 0), esP = (C['FORCE_NQ_only(ES pass)'] || 0) + (C['OK_4of4'] || 0);
  console.log('STEP4: cycles reaching step 4 =', s123, '| ES pass', esP, '(' + (100 * esP / s123).toFixed(1) + '%)', '| NQ pass', nqP, '(' + (100 * nqP / s123).toFixed(1) + '%)', '| both', C['OK_4of4'] || 0, '(' + (100 * (C['OK_4of4'] || 0) / s123).toFixed(1) + '%)', '| both fail', C['FORCE_BOTH'] || 0);
  // anchors OK: episodes and what happened
  const okT = T.filter(x => x.c === 'OK_4of4'); let ep = 0, prev = false; const why = {}; for (const x of T) { const ok = x.c === 'OK_4of4'; if (ok && !prev) ep++; prev = ok; }
  for (const x of okT) { const k = x.abriu ? 'OPENED' : x.side !== 'FLAT' ? 'ALREADY_IN_POSITION' : x.eb ? 'EXEC_BLOCK:' + x.ebm : (x.cd && x.t < x.cd) ? 'COOLDOWN' : x.armed === false ? 'HYSTERESIS(not re-armed)' : 'UNEXPLAINED'; why[k] = (why[k] || 0) + 1; }
  console.log('ANCHORS 4/4: ticks', okT.length, '| episodes', ep, '| outcome per OK tick', JSON.stringify(why), '| dir', JSON.stringify(okT.reduce((h, x) => (h[x.dir] = (h[x.dir] || 0) + 1, h), {})));
  // by ET hour
  const H = {}; for (const x of T) { const h = String(ET(x.t).getUTCHours()).padStart(2, '0'); const o = H[h] = H[h] || { w: 0, s123: 0, ok: 0, tape: 0, undef: 0, div: 0, n: 0 }; o.w += x.w; o.n++; if (/FORCE|OK/.test(x.c)) o.s123 += x.w; if (x.c === 'OK_4of4') o.ok += x.w; if (x.c === 'TAPE') o.tape += x.w; if (x.c === 'UNDEFINED') o.undef += x.w; if (x.c === 'DIVERGENT') o.div += x.w; }
  console.log('BY ET HOUR: hour covered | TAPE UNDEF DIVERG aligned(steps1-3) OK | P(ok|aligned)'); for (const h of Object.keys(H).sort()) { const o = H[h]; console.log('  ' + h + 'h', fm(o.w).padStart(8), '|', (100 * o.tape / o.w).toFixed(0).padStart(3) + '%', (100 * o.undef / o.w).toFixed(0).padStart(3) + '%', (100 * o.div / o.w).toFixed(0).padStart(3) + '%', (100 * o.s123 / o.w).toFixed(0).padStart(3) + '%', (100 * o.ok / o.w).toFixed(1).padStart(5) + '%', '|', (100 * o.ok / Math.max(1, o.s123)).toFixed(1) + '%'); }
  // trades (history file)
  const tr = fs.readFileSync(HIST, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)).filter(t => Date.parse(t.openedAt) >= tPlay - 1000);
  console.log('\nTRADES since PLAY (history file):', tr.length);
  const ent = []; for (const t of tr) { const o = Date.parse(t.openedAt); ent.push(o); const d = ET(o), hh = d.getUTCHours() + d.getUTCMinutes() / 60, rth = hh >= 9.5 && hh < 16;
    console.log(' ', t.openedAt.slice(11, 19) + 'Z', etS(o) + 'ET', t.side, rth ? 'RTH' : 'OUTSIDE', 'dur', t.durationSec + 's', 'exit', t.reason, 'decisao', t.es && t.es.entry, '/', t.nq && t.nq.entry, 'pnlExec', t.totalUsd, 'status', t.pnl_status || t.pnlStatus || '', 'replay', t.replay, 'sim', t.simulated, 'src', t.priceSource, '| legs', (t.execucoes || []).map(e => e.ativo + 'x' + e.qty + '@' + M(e.conta || e.nt8_account || '')).join(' ')); }
  const abr = T.filter(x => x.abriu).map(x => x.t); const abrU = [...new Set(abr)];
  console.log('motor_abriu ticks (distinct ts):', abrU.length, abrU.map(t => etS(t)).join(' '));
  const E = abrU.length >= ent.length ? abrU : ent; const g = []; for (let i = 1; i < E.length; i++) g.push((E[i] - E[i - 1]) / 1000);
  if (g.length) console.log('GAPS between entries: n', g.length, 'median', fm(pct(g, .5)), 'p90', fm(pct(g, .9)), 'max', fm(Math.max(...g)), '| list min:', g.map(x => (x / 60).toFixed(0)).join(' '));
  console.log('time PLAY->first entry', fm((E[0] - tPlay) / 1000), '| last entry->now', fm((tEnd - E[E.length - 1]) / 1000));
  let cl = E.length ? 1 : 0; g.forEach(x => { if (x >= 43 * 60) cl++; }); console.log('clusters (43 min break):', cl);
  const hh = {}; E.forEach(t => { const h = ET(t).getUTCHours(); hh[h] = (hh[h] || 0) + 1; }); console.log('entries by ET hour', JSON.stringify(hh));
  // events
  console.log('\nEVENT COUNTS', JSON.stringify(ev));
  const gc = evL.filter(o => o.event === 'gate_check' && Date.parse(o.ts) >= tPlay); console.log('gate_check since PLAY:', gc.length, JSON.stringify(gc.reduce((h, o) => (h[o.result] = (h[o.result] || 0) + 1, h), {})), '| api_ecosystem_ready at entry:', JSON.stringify(gc.reduce((h, o) => { const f = (o.payload || {}).fontes || {}; const k = 'local=' + f.local_market_data_ready + ' api=' + f.api_ecosystem_ready; h[k] = (h[k] || 0) + 1; return h; }, {})));
  for (const o of evL.filter(o => /robo_(play|stop|alerta)|engine_|session_start|source_readiness_(blocked|ready)|nt8_ready|place_fail|flatten_fail|entrada_sem|desfeita/.test(o.event) && Date.parse(o.ts) >= tPlay - 400e3)) console.log(' ', o.event, o.ts.slice(11, 23), M(o.account || ''), o.result, M(JSON.stringify(o.payload || {})).slice(0, 150));
  const te = evL.filter(o => o.event === 'take_escort_fail' && Date.parse(o.ts) >= tPlay); console.log('take_escort_fail since PLAY', te.length, JSON.stringify(te.reduce((h, o) => { const k = M(o.account) + ' ' + o.instrument + ' ' + (((o.payload || {}).response || {}).error || {}).code; h[k] = (h[k] || 0) + 1; return h; }, {})));
  const rp = evL.filter(o => o.event === 'protecao_reprotegida' && Date.parse(o.ts) >= tPlay); console.log('protecao_reprotegida since PLAY', rp.length);
  const eb = evL.filter(o => o.event === 'exec_block_entrada' && Date.parse(o.ts) >= tPlay); let bl = 0, on = null; for (const o of eb) { const b = (o.payload || {}).bloqueia; if (b && on == null) on = Date.parse(o.ts); if (!b && on != null) { bl += Date.parse(o.ts) - on; on = null; } } console.log('exec_block (exit_pending) total', fm(bl / 1000), 'events', eb.length);
  const cs = evL.filter(o => o.event === 'connection_status' && Date.parse(o.ts) >= tPlay); console.log('connection_status', cs.length, JSON.stringify(cs.reduce((h, o) => (h[o.result] = (h[o.result] || 0) + 1, h), {})));
});
