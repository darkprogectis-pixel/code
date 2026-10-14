// Testes do patch SNAPSHOT /gcsi/sim (staging snapshot-fix). Fixtures SINTÉTICAS offline (não é sinal real, nada de rede,
// nada no AOT live/NT8, zero ordens). Motor aot-gcsi-sim.js/aot-sim.js sem alteração (SHA conferido). Exit 0 = PASS.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const here = import.meta.dirname, root = path.resolve(here, '..'), require = createRequire(import.meta.url);
const rt = path.join(root, 'testrt');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let n = 0, fail = 0;
const check = (name, cond, detail = '') => { n++; if (cond) console.log('PASS ' + name); else { fail++; console.log('FAIL ' + name + ' :: ' + detail); } };

check('S00 motor inalterado: aot-gcsi-sim.js 42d0c8fd e aot-sim.js = produção',
  sha(path.join(rt, 'aot-gcsi-sim.js')).startsWith('42d0c8fd') && sha(path.join(rt, 'aot-sim.js')) === sha('C:/Users/ADM/.claude/aot/aot-sim.js'));
const bff = require(path.join(rt, 'aot-bff.js'));
check('S01 candidato carrega (exports intactos)', typeof bff.buildFlowGcSi === 'function');

// ── rota real (texto do candidato) avaliada com STATE/gcsiSim/sendJson mockados ──
const src = fs.readFileSync(path.join(rt, 'aot-bff.js'), 'utf8');
const base = fs.readFileSync(path.join(root, 'base-aot-bff.js'), 'utf8');
const m = src.match(/    if \(p === '\/gcsi\/sim'\) \{\r?\n[\s\S]*?\r?\n    \}\r?\n/);
check('S02 bloco da rota /gcsi/sim encontrado no candidato', !!m);
const MAXAGE = 2 * 20000 + 5000;
check('S03 GCSI_SNAPSHOT_MAX_AGE_MS = 2*POLL_MS+5000', /const GCSI_SNAPSHOT_MAX_AGE_MS = 2 \* POLL_MS \+ 5000;/.test(src));
const route = new Function('res', 'p', 'STATE', 'gcsiSim', 'sendJson', 'GCSI_SNAPSHOT_MAX_AGE_MS', m[0] + 'return null;');
const call = (STATE, sim) => { let out = null; route(null, '/gcsi/sim', STATE, sim, (res, code, body) => (out = { code, body }), MAXAGE); return out; };

// ── motor GC/SI real em diretório temporário ──
const { createGcSiSim } = require(path.join(rt, 'aot-gcsi-sim.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsi-snapfix-'));
const sim = createGcSiSim({ dir });
const t0 = Date.parse('2026-10-14T16:00:00.000Z'); const at = (s) => new Date(t0 + s * 1000).toISOString();
const conf = (d) => ({ dir: d, strength: 4, why: '' });
const snapOf = (st, iso) => Object.assign(st, { snapshotAt: iso });   // = o que o poll do candidato grava em STATE.simGcSi
sim.tick({ anchor: { dir: 'NEUTRO', strength: 2, why: 'GC indefinido' }, gcSpot: 4101.3, siSpot: 55.87, nowIso: at(0) });   // arma (histerese)
let st = sim.tick({ anchor: conf('SHORT'), gcSpot: 4101.3, siSpot: 55.87, nowIso: at(20) });
check('S04 OPEN SHORT GC 4101.3 / SI 55.87', st.side === 'SHORT' && st.position.gc.entry === 4101.3 && st.position.si.entry === 55.87, JSON.stringify(st.position));
st = sim.tick({ anchor: conf('SHORT'), gcSpot: 4098.3, siSpot: 55.82, nowIso: at(40) });
const pnlGc = Math.round((4101.3 - 4098.3) * 100 * 100) / 100, pnlSi = Math.round((55.87 - 55.82) * 5000 * 100) / 100;
check('S05 tick: marks do tick (GC 4098.3, SI 55.82)', st.marks && st.marks.gcSpot === 4098.3 && st.marks.siSpot === 55.82, JSON.stringify(st.marks));
check('S06 tick: PnL coerente com o preço do tick (GC +300, SI +250, total +550)',
  st.pnl.gcUsd === pnlGc && st.pnl.siUsd === pnlSi && st.pnl.totalUsd === Math.round((pnlGc + pnlSi) * 100) / 100, JSON.stringify(st.pnl));
const eng = sim.getState();
check('S07 causa reproduzida: getState() sem spots => marks null, PnL 0', eng.marks.gcSpot === null && eng.marks.siSpot === null && eng.pnl.totalUsd === 0, JSON.stringify(eng.marks));

// rota com snapshot fresco
const nowIso = new Date().toISOString();
let r = call({ simGcSi: snapOf(Object.assign({}, st), nowIso) }, sim);
check('S08 rota: snapshot fresco => marks/PnL do tick, snapshot.source=tick, stale=false',
  r.code === 200 && r.body.enabled === true && r.body.marks.gcSpot === 4098.3 && r.body.pnl.totalUsd === 550 && r.body.snapshot.source === 'tick' && r.body.snapshot.stale === false, JSON.stringify(r.body.snapshot));
const keysOld = Object.keys(Object.assign({ enabled: true }, eng));
check('S09 contrato: todos os campos antigos presentes (só aditivos snapshot/snapshotAt)', keysOld.every(k => k in r.body), keysOld.filter(k => !(k in r.body)).join(','));
r = call({ simGcSi: snapOf(Object.assign({}, st), new Date(Date.now() - MAXAGE - 1000).toISOString()) }, sim);
check('S10 rota: snapshot velho => NÃO apresenta preço antigo (marks null, PnL 0), stale=true, ageMs informado',
  r.body.marks.gcSpot === null && r.body.marks.siSpot === null && r.body.pnl.totalUsd === 0 && r.body.snapshot.stale === true && r.body.snapshot.ageMs > MAXAGE, JSON.stringify(r.body.snapshot));
check('S11 rota: posição continua visível no fallback (estado do motor)', r.body.side === 'SHORT' && r.body.position.gc.entry === 4101.3);
r = call({ ok: true }, sim);
check('S12 rota: snapshot ausente => fallback stale, at null', r.body.snapshot.stale === true && r.body.snapshot.at === null && r.body.marks.gcSpot === null);
r = call({ simGcSi: { _err: 'gcsi sim err', snapshotAt: nowIso } }, sim);
check('S13 rota: snapshot com _err => fallback stale (erro não vira cotação)', r.body.snapshot.stale === true && r.body.side === 'SHORT' && !('_err' in r.body));
r = call({ simGcSi: snapOf(Object.assign({}, st), new Date(Date.now() + 60000).toISOString()) }, sim);
check('S14 rota: snapshot com relógio no futuro => stale (ageMs < 0)', r.body.snapshot.stale === true);

// sem preço válido no tick: não inventa preço
st = sim.tick({ anchor: conf('SHORT'), gcSpot: null, siSpot: 55.80, nowIso: at(60) });
check('S15 tick sem preço GC (perna não LIVE) => marks.gcSpot null, PnL GC 0, SI marcado', st.marks.gcSpot === null && st.pnl.gcUsd === 0 && st.marks.siSpot === 55.8 && st.side === 'SHORT', JSON.stringify(st.marks));
r = call({ simGcSi: snapOf(Object.assign({}, st), new Date().toISOString()) }, sim);
check('S16 rota repassa o null do tick (não preenche com preço anterior)', r.body.marks.gcSpot === null && r.body.snapshot.source === 'tick');

// OPEN → CLOSE (regras do motor, inalteradas) + histórico exclusivo
st = sim.tick({ anchor: conf('SHORT'), gcSpot: 4111.4, siSpot: 55.87, nowIso: at(80) });   // GC -1010 => hard stop
check('S17 CLOSE por hard_stop_gc (regra existente)', st.side === 'FLAT' && st.history.length === 1 && st.history[0].reason === 'hard_stop_gc', JSON.stringify(st.history[0] || st.side));
const h = sim.readHistory(3650, false);
check('S18 histórico GC/SI persistido (count 1, trades-*.jsonl no dir próprio)', h.count === 1 && fs.readdirSync(dir).some(f => /^trades-\d{4}-\d{2}\.jsonl$/.test(f)), JSON.stringify(h.summary));
const ev = sim.readEvents(0, 50).events;
check('S19 journal próprio: OPEN + CLOSE, source AOT_GCSI_SIM_ISOLATED, orders NONE',
  ev.length === 2 && ev[0].action === 'OPEN' && ev[1].action === 'CLOSE' && ev.every(e => e.source === 'AOT_GCSI_SIM_ISOLATED' && e.orders === 'NONE'), JSON.stringify(ev.map(e => [e.action, e.source, e.orders])));
check('S20 nenhum arquivo ES/NQ no dir GC/SI', fs.readdirSync(dir).every(f => /^(gcsi-|trades-)/.test(f)), fs.readdirSync(dir).join(','));
check('S21 diff restrito: STATE.sim = simEngine.tick e /sim/events idênticos à base',
  ['STATE.sim = simEngine.tick', "'/sim/events'"].every(k => src.split(k).length === base.split(k).length));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${n - fail}/${n} PASS`); process.exit(fail ? 1 : 0);
