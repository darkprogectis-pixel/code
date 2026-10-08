// Observacao PASSIVA do teste Sim do EXIT_LAYER_FIX: le (somente leitura) o audit do robo e o log do NinjaTrader e emite 1 linha por evento relevante.
const fs = require('fs');
const N = 'C:/Users/ADM/Documents/NinjaTrader 8';
const AUD = N + '/alfaomega-robo/logs/audit-2026-10.jsonl';
const mask = s => String(s).replace(/TAKEPROFIT\d+/g, 'TAKEPROFIT***').replace(/\d{9,}/g, m => '*' + m.slice(-4));
const RE = /^(flatten_|exec_|trade_lifecycle|broker_internal|protec|desvio|robo_play|robo_stop|robo_alerta|alert|ordem|order_|entrada|entry|saida|engine_stop|kill|close_)/;
let posA = fs.statSync(AUD).size, bufA = '';
function ntLog() { const d = N + '/log'; const f = fs.readdirSync(d).filter(x => /^log\.\d{8}\.\d{5}\.txt$/.test(x)).sort().pop(); return d + '/' + f; }
let LF = ntLog(), posL = fs.statSync(LF).size, bufL = '';
function readNew(f, pos) { const sz = fs.statSync(f).size; if (sz <= pos) return ['', sz < pos ? sz : pos]; const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(sz - pos); fs.readSync(fd, b, 0, b.length, pos); fs.closeSync(fd); return [b, sz]; }
function tick() {
  try {
    let [b, p] = readNew(AUD, posA); posA = p; if (b) { bufA += b.toString('utf8'); const ls = bufA.split('\n'); bufA = ls.pop();
      for (const l of ls) { let j; try { j = JSON.parse(l); } catch (e) { continue; } const ev = j.event || j.evento || ''; const pl = j.payload || {};
        if (ev === 'motor_tick') { if (pl.abriu || pl.fechou) console.log(`AUD ${j.ts} motor_tick abriu=${pl.abriu} fechou=${pl.fechou} side ${pl.side_antes}->${pl.side} motivo_saida=${pl.motivo_saida} trade=${pl.trade_id} anchor=${JSON.stringify(pl.anchor)}`); continue; }
        if (RE.test(ev)) console.log(mask(`AUD ${j.ts} ${ev} sym=${j.symbol || ''} ` + JSON.stringify({ intent: j.signal_id || j.intentId || j.intent_id, conta: j.conta || j.account, instr: j.instrumento || j.instrument, acao: j.acao || j.action, qty: j.qty, oid: j.order_id || j.orderId, res: j.resultado || j.result || j.status, motivo: pl.motivo, dec: pl.decisao && { a: pl.decisao.acao, q: pl.decisao.qty_fechar, m: pl.decisao.motivo }, x_estado: pl.execucao && pl.execucao.x_estado })).slice(0, 520)); }
    }
    const nf = ntLog(); if (nf !== LF) { LF = nf; posL = 0; bufL = ''; console.log('NT8 novo arquivo de log ' + nf.split('/').pop()); }
    [b, p] = readNew(LF, posL); posL = p; if (b) { bufL += b.toString('latin1'); const ls = bufL.split('\n'); bufL = ls.pop();
      for (const l of ls) { if (/TAKEPROFIT/.test(l)) { console.log('!!! CONTA REAL NO LOG: ' + mask(l).slice(0, 300)); continue; }
        if (/Order='/.test(l) && /New state='(Filled|Rejected|Cancelled|Part filled)'/.test(l)) console.log('NT8 ' + mask(l).replace(/Limit price=.*?Type=/, 'Type=').replace(/ Time in force.*?Filled=/, ' Filled=').slice(0, 330));
        else if (/^.{24}\|\d+\|8\|Execution=/.test(l) || /Market position=/.test(l) && /Operation=/.test(l)) console.log('NT8 ' + mask(l).slice(0, 300));
        else if (/connection=|Connection lost/i.test(l)) console.log('NT8 ' + l.slice(0, 200)); }
    }
  } catch (e) { console.log('WATCH_ERR ' + e.message); }
}
setInterval(tick, 2000);
// batimento a cada 10 min para distinguir silencio de travamento
setInterval(() => { try { const p = JSON.parse(fs.readFileSync(N + '/alfaomega-robo/state/robo-prontidao.json', 'utf8')); const a = fs.readFileSync(N + '/alfaomega-robo/state/robo-alertas.json', 'utf8'); console.log(`HB ${new Date().toISOString()} play=${p.play_state} alertas=${(JSON.parse(a).alerts || []).length}`); } catch (e) { console.log('HB_ERR ' + e.message); } }, 600000);
