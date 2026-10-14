// Testes SÓ dos componentes novos GC/SI = ES/NQ (staging gcsi-eqv): buildFlowGcSi com anchorGcSi, gcsiSimInput,
// simulador GC/SI independente (aot-gcsi-sim.js), canal isolado e histórico exclusivo. Fixtures SINTÉTICAS (não é dado
// real). Nada de rede, nada no AOT live, nada no NT8, zero ordens. Exit 0 = PASS.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { createRequire } from 'node:module';
const here = import.meta.dirname, root = path.resolve(here, '..'), require = createRequire(import.meta.url);
const bff = require(path.join(root, 'testrt', 'aot-bff.js'));
const { createGcSiSim } = require(path.join(root, 'testrt', 'aot-gcsi-sim.js'));
let n = 0, fail = 0;
const check = (name, cond, detail = '') => { n++; if (cond) console.log('PASS ' + name); else { fail++; console.log('FAIL ' + name + ' :: ' + detail); } };

const leg = (me, mvi, px) => ({ me, mvi, conf: me === mvi ? me : 0, meComb: me, mviComb: mvi, lastPrice: px, ageMs: 1000, priceAgeMs: 2000, press: 0 });
const ao = (gcDir, siDir, anchorGcSi) => Object.assign({ ts: Date.now(), gateParams: { freshSec: 90 },
  gc: leg(gcDir, gcDir, 4191.4), si: leg(siDir, siDir, 60.585) }, anchorGcSi === undefined ? {} : { anchorGcSi });
const A = (ok, dir, why) => ({ dir: ok ? dir : 0, strength: 4, why, ok, source: 'AoGate.GcSi' });

// ── BFF: gate GC/SI ──
let f = bff.buildFlowGcSi(ao(1, 1), null, null);
check('N01 radar 4/4 LONG sem anchorGcSi => ESPERANDO_CONFIRMACAO, open=false, dir NEUTRO, força não aplicada',
  !f.gate.open && f.gate.phase === 'ESPERANDO_CONFIRMACAO' && f.gate.dir === 'NEUTRO' && f.gate.radarDir === 'LONG' && f.gate.forceStep.applied === false && f.gate.reason.startsWith('ESPERANDO CONFIRMAÇÃO'), JSON.stringify(f.gate));
f = bff.buildFlowGcSi(ao(1, 1, A(false, 0, 'forca fraca GC/SI')), null, null);
check('N02 radar 4/4 + anchorGcSi força fraca => ESPERANDO CONFIRMAÇÃO (exemplo obrigatório), forceStep WEAK, sem direção',
  !f.gate.open && f.gate.state === 'CLOSED' && f.gate.phase === 'ESPERANDO_CONFIRMACAO' && f.gate.dir === 'NEUTRO' && f.gate.anchor.dir === 'NEUTRO' && f.gate.forceStep.status === 'WEAK' && f.gate.why === 'forca fraca GC/SI', JSON.stringify(f.gate));
f = bff.buildFlowGcSi(ao(1, 1, A(true, 1, '')), null, null);
check('N03 radar 4/4 + anchorGcSi ok LONG => OPEN/CONFIRMADO, dir LONG, forceStep PASS',
  f.gate.open && f.gate.state === 'OPEN' && f.gate.phase === 'CONFIRMADO' && f.gate.dir === 'LONG' && f.gate.forceStep.status === 'PASS', JSON.stringify(f.gate));
f = bff.buildFlowGcSi(ao(-1, -1, A(true, -1, '')), null, null);
check('N04 SHORT confirmado => OPEN SHORT', f.gate.open && f.gate.dir === 'SHORT', JSON.stringify(f.gate));
f = bff.buildFlowGcSi(ao(1, 1, A(true, -1, '')), null, null);
check('N05 anchorGcSi em direção oposta ao radar => não abre (ESPERANDO_CONFIRMACAO)', !f.gate.open && f.gate.phase === 'ESPERANDO_CONFIRMACAO', JSON.stringify(f.gate));
f = bff.buildFlowGcSi(ao(1, -1, A(false, 0, 'GC x SI divergentes')), null, null);
check('N06 GC x SI divergentes => SEM_SINAL, não ESPERANDO', !f.gate.open && f.gate.phase === 'SEM_SINAL' && f.gate.why === 'GC x SI divergentes', JSON.stringify(f.gate));
f = bff.buildFlowGcSi(ao(1, 1, { dir: 1, strength: 4, why: '', ok: true }), null, null);
check('N07 anchorGcSi sem source AoGate.GcSi = inválido => fail-closed', !f.gate.open && f.gate.forceStep.applied === false, JSON.stringify(f.gate.forceStep));
check('N08 operated continua false (FLOW GC·SI nunca opera conta)', f.operated === false);

// ── entrada do sim derivada do gate ──
let inp = bff.gcsiSimInput(bff.buildFlowGcSi(ao(1, 1, A(false, 0, 'forca fraca GC/SI')), null, null));
check('N09 gcsiSimInput com força fraca => anchor NEUTRO, why "forca fraca GC/SI", strength 4', inp.anchor.dir === 'NEUTRO' && inp.anchor.why === 'forca fraca GC/SI' && inp.anchor.strength === 4 && inp.gcSpot === 4191.4 && inp.siSpot === 60.585, JSON.stringify(inp));
inp = bff.gcsiSimInput(bff.buildFlowGcSi(ao(1, 1, A(true, 1, '')), null, null));
check('N10 gcsiSimInput confirmado => anchor LONG 4/4', inp.anchor.dir === 'LONG' && inp.anchor.strength === 4, JSON.stringify(inp));
inp = bff.gcsiSimInput(bff.buildFlowGcSi(ao(1, 1), null, null));
check('N11 gcsiSimInput sem anchorGcSi => NEUTRO e why null (fail-visible)', inp.anchor.dir === 'NEUTRO' && inp.anchor.why === null, JSON.stringify(inp));

// ── simulador GC/SI independente ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsi-eqv-sim-'));
const esNqHistory = path.join(root, 'testrt', 'history');   // o diretório do ES/NQ NUNCA pode ser criado/tocado
let sim = createGcSiSim({ dir });
let t0 = Date.parse('2026-10-14T15:00:00Z'); const at = (s) => new Date(t0 + s * 1000).toISOString();
const weak = { dir: 'NEUTRO', strength: 4, why: 'forca fraca GC/SI' }, conf = (d) => ({ dir: d, strength: 4, why: null });
for (let i = 0; i < 5; i++) sim.tick({ anchor: weak, gcSpot: 4191.4, siSpot: 60.585, nowIso: at(i * 20) });
let st = sim.getState();
const evFiles = () => fs.readdirSync(dir).filter(x => x.startsWith('gcsi-events-'));
check('S01 4/4 + força fraca por 5 ticks => FLAT, zero eventos (sem ordem)', st.side === 'FLAT' && evFiles().length === 0, st.side);
sim.tick({ anchor: { dir: 'NEUTRO', strength: 2, why: 'GC indefinido' }, gcSpot: 4191.4, siSpot: 60.585, nowIso: at(120) });   // histerese
st = sim.tick({ anchor: conf('LONG'), gcSpot: 4191.4, siSpot: 60.585, nowIso: at(140) });
check('S02 confirmado LONG => abre 1 GC + 1 SI (simulado)', st.side === 'LONG' && st.position.gc.entry === 4191.4 && st.position.gc.contracts === 1 && st.position.si.contracts === 1, JSON.stringify(st.position));
check('S03 SI na escala real e no grid de 0,005 (60.585), hard stop SI = 0,20 / GC = 10 pt', st.position.si.entry === 60.585 && st.position.si.hardStop === 60.385 && st.position.gc.hardStop === 4181.4, JSON.stringify(st.position));
let evs = sim.readEvents(0, 50).events;
check('S04 evento OPEN no canal ISOLADO (schema/source próprios, gc/si price, orders NONE)', evs.length === 1 && evs[0].action === 'OPEN' && evs[0].schema === 'aot-gcsi-sim/event v1' && evs[0].source === 'AOT_GCSI_SIM_ISOLATED' && evs[0].gc_price === 4191.4 && evs[0].si_price === 60.585 && evs[0].orders === 'NONE' && !('es_price' in evs[0]), JSON.stringify(evs[0]));
check('S05 nada em history/ do ES/NQ nem events-*.jsonl canônico', !fs.existsSync(esNqHistory) && fs.readdirSync(dir).every(x => !/^events-/.test(x)), fs.readdirSync(dir).join(','));
st = sim.tick({ anchor: weak, gcSpot: 4192.0, siSpot: 60.6, nowIso: at(160) });
check('S06 posição aberta + força fraca => MANTÉM (NEUTRO transitório, igual ES/NQ)', st.side === 'LONG', st.side);
st = sim.tick({ anchor: weak, gcSpot: 4197.4, siSpot: 60.6, nowIso: at(180) });
check('S07 GC +6 pt (US$600) => breakeven armado no GC', st.position.gc.stopActive === true && st.position.gc.stop === 4191.4, JSON.stringify(st.position.gc));
// reinício: estado e seq persistem
sim = createGcSiSim({ dir });
check('S08 restart: posição e seq preservados', sim.getState().side === 'LONG' && sim.readEvents(0, 50).last_seq === 1);
st = sim.tick({ anchor: { dir: 'NEUTRO', strength: 0, why: 'GC x SI divergentes' }, gcSpot: 4195.4, siSpot: 60.585, nowIso: at(200) });
check('S09 "GC x SI divergentes" => fecha (anchor_neutro), igual ES/NQ', st.side === 'FLAT', st.side);
const h = sim.readHistory(30, false);
check('S10 histórico EXCLUSIVO GC/SI: 1 trade, pernas gc/si, P&L em US$ correto (GC +400, SI 0)', h.exclusive && h.count === 1 && h.trades[0].gc.pnlUsd === 400 && h.trades[0].si.pnlUsd === 0 && h.trades[0].si.entry === 60.585 && h.trades[0].book === 'GCSI_SIM' && h.summary.totalUsd === 400, JSON.stringify(h.trades[0]));
evs = sim.readEvents(0, 50).events;
check('S11 CLOSE no canal isolado com seq 2', evs.length === 2 && evs[1].action === 'CLOSE' && evs[1].seq === 2 && evs[1].trade_id === evs[0].trade_id, JSON.stringify(evs[1]));
// hard stop SI: queda de 0,20 = US$1000
sim.tick({ anchor: { dir: 'NEUTRO', strength: 1, why: 'SI indefinido' }, gcSpot: 4195.4, siSpot: 60.585, nowIso: at(400) });
st = sim.tick({ anchor: conf('LONG'), gcSpot: 4195.4, siSpot: 60.585, nowIso: at(420) });
st = sim.tick({ anchor: conf('LONG'), gcSpot: 4195.4, siSpot: 60.385, nowIso: at(440) });
const h2 = sim.readHistory(30, false).trades[0];
check('S12 SI cai 0,20 => hard_stop_si, SI −US$1000 exatos', st.side === 'FLAT' && h2.reason === 'hard_stop_si' && h2.si.pnlUsd === -1000, JSON.stringify(h2));
fs.rmSync(dir, { recursive: true, force: true });

// ── isolamento no código-fonte ──
const src = fs.readFileSync(path.join(root, 'candidate', 'aot-gcsi-sim.js'), 'utf8').replace(/\/\/[^\n]*/g, '');   // só código, sem comentários
const bsrc = fs.readFileSync(path.join(root, 'candidate', 'aot-bff.js'), 'utf8'), cur = fs.readFileSync(path.join(root, 'current', 'aot-bff.js'), 'utf8');
check('I01 sim GC/SI não referencia simEmitEvent, /sim/events, events-*.jsonl canônico nem rede', !/simEmitEvent|\/sim\/events|'events-'|require\('https?'\)|fetch\(/.test(src));
check('I02 AOT_GCSI_SIM off por padrão; rotas /gcsi/* só GET', /AOT_GCSI_SIM \|\| 'off'/.test(bsrc) && /\/gcsi\/history'\) \{\s*\n\s*if \(req.method !== 'GET'\) return sendJson\(res, 405/.test(bsrc));
const fnText = (s, name) => { const i = s.indexOf('function ' + name + '('); if (i < 0) return null; let d = 0, j = s.indexOf('{', i); for (let k = j; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return s.slice(i, k + 1); } return null; };
const same = ['buildGate', 'simEmitEvent', 'simEventsRead', 'computeConfluence', 'buildV2Stack', 'buildFlowGc', 'c1FromLeg'].filter(fn => fnText(cur, fn) !== fnText(bsrc, fn));
check('I03 funções ES/NQ intocadas (buildGate, simEmitEvent, simEventsRead, computeConfluence, buildV2Stack, buildFlowGc, c1FromLeg)', same.length === 0, same.join(','));
check('I04 tick do sim ES/NQ idêntico (anchor: gate.anchor)', bsrc.includes("STATE.sim = simEngine.tick({ anchor: gate.anchor, esSpot, nqSpot, nowIso, priceSource: SIM_PRICE_SOURCE, replay: simReplay });"));

console.log(`TOTAL ${n - fail}/${n} PASS`);
process.exit(fail ? 1 : 0);
