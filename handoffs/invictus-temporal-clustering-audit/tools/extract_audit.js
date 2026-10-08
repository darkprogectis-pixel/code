// read-only: audit jsonl -> compact motor ticks (ticks_<tag>.csv) + sparse events (events_<tag>.jsonl)
const fs = require('fs'), rl = require('readline'), path = require('path');
const [f, tag] = process.argv.slice(2);
const OUT = __dirname;
const tk = fs.createWriteStream(path.join(OUT, 'ticks_' + tag + '.csv'));
const ev = fs.createWriteStream(path.join(OUT, 'events_' + tag + '.jsonl'));
tk.write('ts,dir,strength,why,side,abriu,fechou,motivo,armed,cooldownUntil,execBloq,execMotivo,esC1,nqC1,permit\n');
const KEEP = new Set(['robo_play', 'robo_stop', 'engine_start', 'engine_stop', 'source_readiness_blocked', 'source_readiness_ready', 'source_readiness_change',
  'session_start', 'exec_block_entrada', 'entrada_sem_execucao', 'motor_abriu', 'motor_fechou', 'gate_check', 'motor_abertura_desfeita', 'nt8_ready',
  'connection_status', 'robo_alerta', 'aot_stream_offline', 'aot_stream_online', 'robo_symbol_disable', 'robo_symbol_enable', 'trade_closed']);
const g = (l, re) => { const m = re.exec(l); return m ? m[1] : ''; };
let n = 0, nt = 0, keysSample = null;
const r = rl.createInterface({ input: fs.createReadStream(f) });
r.on('line', l => {
  n++;
  const e = g(l, /"event":"([^"]+)"/); if (!e) return;
  if (e === 'motor_tick') {
    nt++;
    let o; try { o = JSON.parse(l); } catch (x) { return; }
    const p = o.payload || {}; const a = p.anchor || {}; const st = p.estado || {}; const sl = p.stack_local || {};
    if (!keysSample) keysSample = Object.keys(p).join('|');
    const c1 = x => (x && x.c1 && x.c1.dir) || '';
    tk.write([o.ts, a.dir || '', a.strength == null ? '' : a.strength, (a.why || '').replace(/,/g, ';'), p.side || '', p.abriu ? 1 : 0, p.fechou ? 1 : 0, p.motivo_saida || '',
      st.armed === undefined ? '' : (st.armed ? 1 : 0), st.cooldownUntil || '', p.exec_bloqueia_entrada ? 1 : 0, (p.exec_bloqueio_motivo || '').replace(/,/g, ';'),
      c1(sl.es), c1(sl.nq), p.permitir_entrada === undefined ? '' : (p.permitir_entrada ? 1 : 0)].join(',') + '\n');
  } else if (KEEP.has(e)) {
    ev.write((l.length > 6000 ? l.slice(0, 6000) : l) + '\n');
  }
});
r.on('close', () => { tk.end(); ev.end(); console.log(tag, 'lines', n, 'motor_ticks', nt, 'payload keys:', keysSample); });
