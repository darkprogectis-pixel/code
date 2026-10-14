// ─────────────────────────────────────────────────────────────────────────────
// AOT — Alfa Omega Terminal · BFF (backend-for-frontend)  —  porta :3600
// Agrega 6 fontes read-only via HTTP, aplica o Conviction Stack (Tier 0/1/2),
// mantém cache + degradação graciosa, e serve o frontend estático (public/).
//
// Fontes (todas HTTP, read-only — NADA é alterado nelas):
//   Tier 0  consolidator :3495/consolidated/:sym  (CONSO_API_KEY)  → DIREÇÃO ES/NQ
//   Tier 1  SpotGamma    :3500/divergence, /hiro   (sem auth)       → confirma/diverge CONVICÇÃO
//   Tier 2  GexBot       :3457/  (oi-latest.json)  (sem auth)       → regime/greeks (contexto)
//   Deep    MenthorQ     :3480/intraday/:sym (MQ_API_KEY), QuantData :3490/signal/:sym (QD_API_KEY),
//           AlfaOmega    :5151/state  — já dentro do consolidator; expostos crus p/ Deep Dive.
//
// Keys: lidas em RUNTIME das .env canônicas (mesmo padrão do consolidator — sem duplicar segredo).
// Isolamento: pasta/porta próprias, http nativo, ZERO import de outros projetos. Singleton + heartbeat.
// Arquitetura: ARCHITECTURE_AOT.md. Marca: ALFA OMEGA (nada "Dark").
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const http = require('http');
const nativeAutomation = require('./native-automation.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');   // Fase 1 (19/08): verificacao RS256 do JWT do Cloudflare Access
// #6 (2026-07-24): sinais do Consolidator (:3495) — os MESMOS que saem no Telegram (gate strength===4) —
// expostos no /state p/ o AOT web mostrar. Lê os arquivos locais (barato, sem acoplar porta).
const CONSO_SIGNAL_DIR = 'C:/Users/ADM/.claude/consolidator-engine/signal';
// ── CORRECAO 2026-08-19 — DADO VELHO COM CARA DE ATUAL ──────────────────────────────────
// Esta funcao le um ARQUIVO EM DISCO e repassava `asof` sem nunca compara-lo com o relogio.
// Se o consolidator morre (ou so para de escrever), o BFF continua servindo o ultimo sinal
// INDEFINIDAMENTE, e o card do deep.html o mostra como se fosse de agora. Foi exatamente
// essa confusao em 18/08: a ponte :5151 caiu, o painel seguiu exibindo `anchor.strength=2`
// e o operador leu como leitura ao vivo.
// ⚠️ Nao ha decisao aqui — so leitura para exibicao. O limite de 900s e o MESMO ja usado em
//    `sources.consolidator.stale_after_s`, para as duas superficies concordarem.
const CONSO_STALE_AFTER_S = 900;
function readConsolidated() {
  const out = {};
  for (const sym of ['ES', 'NQ']) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(CONSO_SIGNAL_DIR, 'latest-' + sym + '.json'), 'utf8'));
      const t = Date.parse(j.asof);
      const ageS = isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null;
      const stale = (ageS == null) || (ageS > CONSO_STALE_AFTER_S);
      let reason = j.reason || null;
      if (stale) {
        const hhmm = isFinite(t) ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '??:??';
        const min = ageS == null ? '?' : Math.round(ageS / 60);
        reason = '\u26A0\uFE0F ULTIMA LEITURA ' + hhmm + ' (' + min + ' min atras)' + (reason ? ' \u2014 ' + reason : '');
      }
      out[sym] = { direction: j.direction, state: j.state, tier: j.tier, confidence: j.confidence,
                   asof: j.asof, age_s: ageS, stale: stale, stale_after_s: CONSO_STALE_AFTER_S,
                   reason: reason, context: j.context || null };   // context aninhado (o render le c.context.target/invalidation/flow_divergence)
    } catch (e) { out[sym] = null; }
  }
  return out;
}
const indicators = require('./aot-indicators');   // recálculo dos .cs Alfa Omega (NT8 fechado)
const { createSimEngine } = require('./aot-sim');  // Simulador de Automação (motor de estados; off por padrão)
const gblocks = require('./aot-gamma-blocks');     // blocos de gamma por strike/região (07/08/2026)
const mqStrat = require('./aot-menthorq-strategies');  // 11 estrategias de nivel + confirmacao por hedge (18/08/2026)
const { passThroughAlfabot } = require('./aot-alfabot-signal');
const health = require('./aot-health');            // manifesto de saúde + alerta (17/08/2026) — anti-falha-silenciosa
const hiroDarkflow = require('./hiro-darkflow-adapter.cjs');   // HIRO proprietário Darkflow (GammaGex) — fonte única do HIRO do Gate (13/10/2026)

// ── Config ───────────────────────────────────────────────────────────────────
const BASE = __dirname;
const CLAUDE = path.join(BASE, '..');                 // C:\Users\ADM\.claude
const PORT = parseInt(process.env.AOT_PORT || '3600', 10);
// Default SEGURO: só loopback (mesmo padrão do SG_BIND do :3500). Expor = subir com
// AOT_BIND=0.0.0.0 + regra de firewall p/ a sub-rede do WSL + Cloudflare Access na frente.
const BIND = process.env.AOT_BIND || '127.0.0.1';
const PUBLIC = path.join(BASE, 'public');
const LOG_FILE = path.join(BASE, 'logs', 'aot-bff.log');
// lock/status por PORTA: duas portas são duas instâncias. Com nome fixo, uma instância de
// TESTE noutra porta era morta pelo lock da de produção — impedindo justamente o smoke-test
// isolado que o guarda-corpo exige antes de qualquer deploy.
const SFX = PORT === 3600 ? '' : '.' + PORT;
const STATUS_FILE = path.join(BASE, 'aot-bff-status' + SFX + '.txt');
const LOCK_FILE = path.join(BASE, 'aot-bff' + SFX + '.lock');
const POLL_MS = parseInt(process.env.AOT_POLL_MS || '20000', 10);
const STALE_S = parseInt(process.env.AOT_STALE_S || '900', 10);   // >15min = stale (fontes ~300s)
// Detector de FRESCOR do tape (reset-based) — OBSERVACIONAL. Num feed atrasado (L1/L2 c/ delay
// ~10min) o ageMs absoluto é péssimo sinal (fica alto por natureza). O sinal robusto é se o ageMs
// RESETA (caiu = evento novo chegou → vivo) ou só cresce monotônico por >> que o delay (= travado).
// Agnóstico ao delay. Enquanto OFF: só popula STATE.tapeFreshness (ninguém consome) + loga transição.
const TAPE_RESET_STALE_MS = parseInt(process.env.AOT_TAPE_RESET_STALE_MS || '1200000', 10); // 20min sem reset = travado
// ── Selo de ATENÇÃO por wall (display-only, NUNCA entra no Conviction Stack) ──
// Distância (pts ES) p/ marcar uma wall como "near" (o preço se aproximando). Só marca `near`;
// o dado é sempre calculado. Design (a) conservador: força geométrica (VBPI) + γ dealer por-strike
// (/grid) + contexto de fluxo AGREGADO do instrumento — SEM veredito de reversão/squeeze.
const WALL_NEAR_PT = parseInt(process.env.AOT_WALL_NEAR_PT || '10', 10);
// ── Feature flag da NOVA hierarquia por trilhas (Camadas 1/2/3 + confluência) ──
// v1 (DEFAULT) = sistema atual intacto, /state NÃO ganha o bloco v2 (zero mudança em produção).
// v2  = expõe o bloco v2 (trilhas ES/NQ paralelas). both = expõe v2 ao lado do v1 p/ comparar.
// A composição v2 é ADITIVA: nunca remove/desliga o Conviction Stack atual (gate/symbols/confluence).
const STACK_MODE = (() => { const v = String(process.env.AOT_STACK || 'v1').toLowerCase(); return (v === 'v2' || v === 'both') ? v : 'v1'; })();

// ── Feature flag do SIMULADOR de Automação (base do robô real) ──
// off (DEFAULT) = /state NÃO ganha o bloco STATE.sim; motor nem roda (zero mudança em produção).
// on            = motor de estados avalia a cada poll (entrada 4/4 → trailing $ → saída anchor NEUTRO)
//                 e expõe STATE.sim. ADITIVO — nada do Conviction Stack/gate é tocado.
// Marca de "simulação" fica em STATE.sim.meta.simulated: o Deep Dive exibe; o Command mostra como real.
const SIM_ON = String(process.env.AOT_SIM || 'off').toLowerCase() === 'on';
const SIM_STATE_FILE = path.join(__dirname, 'aot-sim-state.json');   // posição/trailing sobrevivem a restart
const SIM_HISTORY_DIR = path.join(__dirname, 'history');             // log append-only JSONL (trades-YYYY-MM.jsonl)
// ── EVENTO CANONICO (2026-10-01, sync total AOT x INVICTUS) ──
// O AOT e o DECISOR UNICO: cada OPEN/CLOSE do motor vira UM evento imutavel em history/events-YYYY-MM.jsonl
// (append-only, seq monotonico, event_id unico). A linha e gravada (appendFileSync) ANTES de o motor seguir,
// logo antes de aparecer no /state. O INVICTUS le GET /sim/events?after=<seq> e executa o MESMO evento.
// Nunca reescreve nem apaga; simHistoryArchive/histLerDir so tocam trades-*.jsonl.
const SIM_EVENTS_RE = /^events-(\d{4})-(\d{2})\.jsonl$/;
function simEventsFiles() {
  try { return fs.existsSync(SIM_HISTORY_DIR) ? fs.readdirSync(SIM_HISTORY_DIR).filter(f => SIM_EVENTS_RE.test(f)).sort() : []; } catch { return []; }
}
// Leitura ordenada por seq (> after), limitada. Read-only. Linha torta (crash no meio do append) = ignorada e contada.
function simEventsRead(after, limit) {
  const out = []; let bad = 0, last = 0;
  for (const f of simEventsFiles()) {
    let txt = ''; try { txt = fs.readFileSync(path.join(SIM_HISTORY_DIR, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch { bad++; continue; }
      if (!Number.isInteger(e.seq)) { bad++; continue; }
      if (e.seq > last) last = e.seq;
      if (e.seq > after) out.push(e);
    }
  }
  out.sort((a, b) => a.seq - b.seq);
  return { events: out.slice(0, limit), more: out.length > limit, bad_lines: bad, last_seq: last };
}
let simEventSeq = SIM_ON ? simEventsRead(Number.MAX_SAFE_INTEGER, 1).last_seq : 0;   // seq recuperado do log no boot
// (2026-10-01, pre-instalacao B3 AOT_EMIT_BEFORE_SAVE) indice event_id -> seq reconstruido no boot de TODOS os events-*.jsonl
// (linhas tortas ignoradas). O aot-sim grava o evento no OUTBOX (state, com event_id pre-gerado) ANTES do append; no boot ele
// reemite o pendente com o MESMO event_id: se ja esta no log, devolve o seq ORIGINAL sem novo append (idempotente).
const simEventIdx = new Map();
if (SIM_ON) for (const f of simEventsFiles()) {
  let txt = ''; try { txt = fs.readFileSync(path.join(SIM_HISTORY_DIR, f), 'utf8'); } catch { continue; }
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e && typeof e.event_id === 'string' && Number.isInteger(e.seq)) simEventIdx.set(e.event_id, e.seq);
  }
}
// Contrato com aot-sim.js: SINCRONO, devolve {seq, event_id}; OPEN sem trade_id => trade_id = event_id.
// evt.event_id (pre-gerado pelo outbox do aot-sim) e respeitado; event_id ja no log => {seq original, duplicate:true}, sem append.
// Falha de disco => lanca (o tick falha alto em vez de expor uma decisao sem evento persistido).
function simEmitEvent(evt) {
  if (evt && typeof evt.event_id === 'string' && simEventIdx.has(evt.event_id))
    return { seq: simEventIdx.get(evt.event_id), event_id: evt.event_id, duplicate: true };
  const seq = simEventSeq + 1;
  const event_id = (evt && typeof evt.event_id === 'string' && evt.event_id) || crypto.randomUUID();
  const rec = Object.assign({}, evt, { schema: 'aot-sim/event v1', source: 'AOT_CANONICAL', seq, event_id });
  if (rec.action === 'OPEN' && !rec.trade_id) rec.trade_id = event_id;
  if (!rec.created_at) rec.created_at = new Date().toISOString();
  rec.replay = !!rec.replay;
  if (!fs.existsSync(SIM_HISTORY_DIR)) fs.mkdirSync(SIM_HISTORY_DIR, { recursive: true });
  fs.appendFileSync(path.join(SIM_HISTORY_DIR, 'events-' + String(rec.created_at).slice(0, 7) + '.jsonl'), JSON.stringify(rec) + '\n');
  simEventSeq = seq;
  simEventIdx.set(event_id, seq);
  return { seq, event_id };
}
const simEngine = SIM_ON ? createSimEngine({ persistPath: SIM_STATE_FILE, historyDir: SIM_HISTORY_DIR, emitEvent: simEmitEvent }) : null;
// ── EXEC DE VOLTA (2026-10-02, invictus/exec v1) ──
// O robo (unico escritor) grava em <roboDir>\state\aot-exec-YYYY-MM.jsonl o que o NT8 EXECUTOU por trade_id (sem preco/qty/conta).
// O BFF so LE: execRead(after) tolerante a linha torta; ingestao no poll ANTES do tick, em ordem de exec_seq; o cursor
// history/aot-exec-cursor.json so avanca DEPOIS do simEngine.applyExec (ACK apos aplicar). Dedup por exec_seq (o motor tambem
// ignora exec_seq <= ultimo). GET /sim/exec?after= e so leitura (auditoria). Sem arquivo de exec = comportamento de antes.
const SIM_EXEC_RE = /^aot-exec-(\d{4})-(\d{2})\.jsonl$/;
const SIM_EXEC_CURSOR = path.join(SIM_HISTORY_DIR, 'aot-exec-cursor.json');
function execDir() {
  if (process.env.AOT_EXEC_DIR) return process.env.AOT_EXEC_DIR;
  try { return path.join(ROBO_CFG.roboDir, 'state'); } catch { return null; }
}
function execRead(after, limit) {
  const out = []; let bad = 0, last = 0; const dir = execDir();
  let files = []; try { files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => SIM_EXEC_RE.test(f)).sort() : []; } catch { files = []; }
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch { bad++; continue; }
      if (!e || e.schema !== 'invictus/exec v1' || !Number.isInteger(e.exec_seq)) { bad++; continue; }
      if (e.exec_seq > last) last = e.exec_seq;
      if (e.exec_seq > after) out.push(e);
    }
  }
  out.sort((a, b) => a.exec_seq - b.exec_seq);
  const seen = new Set(), uniq = [];
  for (const e of out) { if (seen.has(e.exec_seq)) continue; seen.add(e.exec_seq); uniq.push(e); }
  const lim = limit || uniq.length;
  return { records: uniq.slice(0, lim), more: uniq.length > lim, bad_lines: bad, last_exec_seq: last };
}
function execCursorLer() { try { const o = JSON.parse(fs.readFileSync(SIM_EXEC_CURSOR, 'utf8')); return Number.isInteger(o.exec_seq) ? o.exec_seq : 0; } catch { return 0; } }
function execCursorGravar(seq) {
  try {
    if (!fs.existsSync(SIM_HISTORY_DIR)) fs.mkdirSync(SIM_HISTORY_DIR, { recursive: true });
    const tmp = SIM_EXEC_CURSOR + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ exec_seq: seq, updated_at: new Date().toISOString() }));
    fs.renameSync(tmp, SIM_EXEC_CURSOR);
  } catch { }
}
// Aplica os registros novos (ordem de exec_seq). Falha no apply => para (o cursor fica no ultimo aplicado; o proximo poll retoma).
function simExecIngest(ctx) {
  if (!simEngine || typeof simEngine.applyExec !== 'function') return { applied: 0 };
  let cur = execCursorLer(), n = 0;
  const r = execRead(cur, 500);
  for (const rec of r.records) {
    simEngine.applyExec(rec, ctx);     // lanca => sai sem avancar o cursor
    cur = rec.exec_seq; execCursorGravar(cur); n++;
  }
  return { applied: n, cursor: cur, bad_lines: r.bad_lines };
}
// Fonte do PREÇO do simulador (P&L/trailing/hard-stop). Alternável, DEFAULT gexbot:
//   gexbot (:3457) = operação REAL ao vivo (padrão sempre).
//   nt8    (:5151) = ao.es/nq.lastPrice — SEGUE o Market Replay do NT8 (p/ testar P&L/trailing no Replay).
// Aditivo: não muda o gatilho (sempre gate.anchor do :5151); só de onde vem o preço p/ marcar a posição.
const SIM_PRICE_SOURCE = String(process.env.AOT_SIM_PRICE_SOURCE || 'gexbot').toLowerCase() === 'nt8' ? 'nt8' : 'gexbot';

// ── Origem das fontes ────────────────────────────────────────────────────────
// O BFF nascia grudado em `localhost`. Dois problemas: (a) prende o serviço a esta máquina,
// (b) — pior — o loopback é ISENTO de chave nos serviços, então o caminho AUTENTICADO nunca
// era exercitado aqui. Um bug de chave só apareceria nos escritórios 2..N, nunca no 1.
// Agora: URL por fonte + **chave SEMPRE enviada** (Bearer), qualquer que seja o transporte.
//   AOT_ORIGIN=local  (default) → localhost, mas já com Bearer em TODA requisição
//   AOT_ORIGIN=remote           → hostnames públicos via Cloudflare (gamma./mq./qd./live.)
// `remote` é o modo de VERIFICAÇÃO do caminho dos escritórios 2..N (e o degrau da Fase 2);
// não é o destino: quando BFF e fontes forem colocados na VPS, voltam a se falar em privado.
// consolidator (:3495) e alfaomega (:5151) NÃO têm hostname — e não devem ter: só o BFF os
// consome, e ele é colocado com eles. Ficam locais sempre (superfície de ataque a menos).
const ORIGIN = String(process.env.AOT_ORIGIN || 'local').toLowerCase() === 'remote' ? 'remote' : 'local';

const URL_LOCAL = {
  consolidator: 'http://localhost:3495',
  spotgamma:    'http://localhost:3500',
  gexbot:       'http://localhost:3457',
  menthorq:     'http://localhost:3480',
  quantdata:    'http://localhost:3490',
  alfaomega:    'http://127.0.0.1:5151',
};
const URL_REMOTE = {
  spotgamma:    'https://gamma.murklogic.site',
  gexbot:       'https://live.murklogic.site',
  menthorq:     'https://mq.murklogic.site',
  quantdata:    'https://qd.murklogic.site',
};

// Narrador (:3601) roda SEMPRE na mesma máquina do BFF → localhost resolve daqui, mesmo
// quando o cliente é remoto (celular/outro escritório). Por isso o front NÃO fala com :3601
// direto (o antigo `NARR='http://localhost:3601'` só funcionava no navegador da máquina Windows):
// ele bate em /narrator/* NESTA origem (aot.murklogic.site via túnel) e o BFF repassa. Sem rota
// nova de túnel p/ :3601, sem CORS. Ver handoff §BP.3 (bug do painel de texto do narrador).
const NARR_URL = process.env.NARR_URL || 'http://localhost:3601';

// keys lidas das .env canônicas em RUNTIME (sem hardcode, sem duplicar segredo).
// O relay :3457 vive no WSL → lemos a .env dele por UNC, em vez de copiar a chave p/ cá.
function envOf(file, key) { try { const m = fs.readFileSync(file, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; } catch { return null; } }
const RELAY_ENV = process.env.RELAY_ENV || '\\\\wsl.localhost\\Ubuntu-24.04\\home\\magnumbrokeroficial\\darkflow-web\\.env';
const KEYS = {
  consolidator: envOf(path.join(CLAUDE, 'consolidator-engine', '.env'), 'CONSO_API_KEY'),
  quantdata:    envOf(path.join(CLAUDE, 'quantdata-capture', '.env'), 'QD_API_KEY'),
  menthorq:     envOf(path.join(CLAUDE, 'menthorq-api', '.env'), 'MQ_API_KEY'),
  spotgamma:    envOf(path.join(CLAUDE, 'spotgamma-api', '.env'), 'SG_API_KEY'),
  gexbot:       envOf(RELAY_ENV, 'RELAY_KEY'),
  alfaomega:    null,   // :5151 não tem auth — nunca sai do loopback, por desenho (GATE 1)
};

// URL final por fonte: override explícito (env) > origem escolhida > local
const ENV_URL = { consolidator: 'CONSO_URL', spotgamma: 'SG_URL', gexbot: 'GEX_URL', menthorq: 'MQ_URL', quantdata: 'QD_URL', alfaomega: 'AO_URL' };
const SRC = {};
for (const k of Object.keys(URL_LOCAL)) SRC[k] = process.env[ENV_URL[k]] || (ORIGIN === 'remote' ? URL_REMOTE[k] : null) || URL_LOCAL[k];
const isRemote = (u) => /^https:/i.test(u);

function log(m) { const l = new Date().toISOString() + '  ' + m; try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); fs.appendFileSync(LOG_FILE, l + '\n'); } catch {} console.log(m); }
function heartbeat(s) { try { fs.writeFileSync(STATUS_FILE, new Date().toISOString() + '  ' + s + '\n'); } catch {} }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin2 = (x) => (typeof x === 'number' && isFinite(x));
const r2 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;

// ── Relógio efetivo: real, ou SIMULADO em modo replay/demo (ADITIVO) ──────────
// Sem AOT_REPLAY_DATE → produção 100% intacta (relógio real).
// Com AOT_REPLAY_DATE=YYYY-MM-DDTHH:MM (hora de INÍCIO do replay, ET) → o "agora" que
// governa SESSÃO/RTH e a DATA do dado histórico passa a ser um relógio SIMULADO: âncora
// na data/hora informada, avançando pelo tempo real decorrido × AOT_REPLAY_SPEED (default 1).
// ⚠️ Escopo: só o relógio de sessão/data. Timestamps de fetch e cálculo de STALENESS
// continuam no relógio REAL (medem quando o dado foi buscado de verdade).
// converte uma hora-de-parede ET (DST-aware) → epoch UTC ms (método do offset, 1 passo).
function etWallToUtcMs(y, mo, d, hh, mm, ss) {
  const asUtc = Date.UTC(y, mo - 1, d, hh, mm, ss || 0);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(asUtc));
  const g = (t) => +f.find(x => x.type === t).value;
  const shownAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUtc - (shownAsUtc - asUtc);   // corrige a "chute-UTC" pelo offset ET no instante
}
const REPLAY = (() => {
  const raw = String(process.env.AOT_REPLAY_DATE || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) { console.log('⚠️  AOT_REPLAY_DATE inválida: "' + raw + '" (use YYYY-MM-DD ou YYYY-MM-DDTHH:MM) — IGNORADA, seguindo em relógio real'); return null; }
  const [, Y, Mo, D, hh, mm, ss] = m;
  const speed = Math.max(0, parseFloat(process.env.AOT_REPLAY_SPEED || '1') || 1);
  const anchorUtcMs = etWallToUtcMs(+Y, +Mo, +D, hh != null ? +hh : 9, mm != null ? +mm : 30, ss != null ? +ss : 0);
  return { raw, speed, anchorUtcMs, bootMs: Date.now(), hadTime: hh != null };
})();
// "agora" efetivo — Date real, ou simulado (âncora + decorrido × speed) em replay.
function effectiveNow() { return REPLAY ? new Date(REPLAY.anchorUtcMs + (Date.now() - REPLAY.bootMs) * REPLAY.speed) : new Date(); }
function etPretty(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) + ' ET'; }

// ── Sessão ET (DST-aware) ────────────────────────────────────────────────────
function etState() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(effectiveNow());
  const h = +p.find(x => x.type === 'hour').value % 24, m = +p.find(x => x.type === 'minute').value;
  const dow = p.find(x => x.type === 'weekday').value;
  const min = h * 60 + m, weekend = dow === 'Sat' || dow === 'Sun';
  let session = 'CLOSED';
  if (!weekend) { if (min >= 15 * 60 + 30 && min < 16 * 60) session = 'POWER_HOUR'; else if (min >= 9 * 60 + 30 && min < 16 * 60) session = 'REGULAR'; }
  return { session, rth: session !== 'CLOSED', min, weekend };
}
// data de SESSÃO em ET (YYYY-MM-DD) — para /gseries e /hiro?date. en-CA já dá o formato ISO.
function etDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(effectiveNow()); }

// ── Fetch util (timeout, nunca lança) ────────────────────────────────────────
// A chave vai SEMPRE por header `Authorization: Bearer` — canal aceito pelos 5 serviços
// (:3457, :3480, :3490, :3495, :3500 — verificado no código de cada um). Header e não `?key=`
// para a chave não vazar em log de acesso / histórico de URL.
async function getJson(url, ms, key) {
  try {
    const headers = { 'accept': 'application/json' };
    if (key) headers['authorization'] = 'Bearer ' + key;
    const r = await fetch(url, { signal: AbortSignal.timeout(ms || 6000), headers });
    if (!r.ok) return { _err: 'HTTP ' + r.status };
    const ct = r.headers.get('content-type') || '';
    if (/json/.test(ct)) return await r.json();
    const t = await r.text();
    try { return JSON.parse(t); } catch { return { _err: 'non-json', _raw: t.slice(0, 200) }; }
  } catch (e) { return { _err: e.name === 'TimeoutError' ? 'timeout' : (e.message || 'neterr') }; }
}

// Busca numa fonte pelo NOME: resolve URL + chave + timeout de uma vez.
// Timeout maior quando remoto: loopback ~1ms, mas o túnel CF anda em 50–300ms (e pode ter
// cold start). Apertar o timeout no remoto seria fabricar "fonte offline" que não existe.
// ── W3 · ROTEAMENTO DE REPLAY (2026-08-07) ──────────────────────────────────────
// PROBLEMA QUE ISTO FECHA: com AOT_REPLAY_DATE ativo, o `effectiveNow()` já deslocava o relógio
// e o SpotGamma já era buscado por `?date=` (o `etDate()` acima usa o relógio simulado). Mas
// GexBot, QuantData e MenthorQ continuavam sendo lidas AO VIVO — o terminal misturava passado e
// presente no mesmo /state, sem aviso. É a divergência silenciosa que a disciplina da casa proíbe.
//
// Agora, em replay, as três passam a servir o histórico do instante simulado:
//   gexbot     -> :3510/compat/gexbot  (o vendor não tem histórico; o player reconstrói o
//                 formato do instrumento do oi-latest.json a partir da série do gex-series)
//   quantdata  -> :3490 + ?date=&at=   (W1 — a própria API, pelo seu próprio caminho de código)
//   menthorq   -> :3480 + ?date=&at=   (W2 — idem)
//
// 📌 O `at` é o INSTANTE simulado, não o fim do dia: cada fonte devolve o último registro com
//    t <= at. Sem isso o replay teria look-ahead — mostraria às 10:00 o que só se soube às 16:00.
const REPLAY_API = process.env.AOT_REPLAY_API || 'http://127.0.0.1:3510';
// ⚠️ `spotgamma` ENTRA aqui (2026-08-07): eu havia assumido que ele já era buscado por `?date=`
// no poll porque o `etDate()` usa o relógio simulado — ERRADO. O poll chama
// `from('spotgamma','/hiro/SPX')` SEM date, e o `?date=` só era usado noutros pontos. Sintoma
// que denunciou: `age_s` NEGATIVO (−111.655 s) no BFF em replay = dado com carimbo POSTERIOR ao
// instante simulado, isto é, look-ahead. Idade negativa é a assinatura desse defeito.
const REPLAY_SRCS = new Set(['gexbot', 'menthorq', 'quantdata', 'spotgamma']);
// Rotas que NÃO honram `?date=` (medido: devolvem o vivo, sem o campo `replay`). Ficam ao vivo
// e são DECLARADAS no /state — em vez de eu fingir que o replay é total.
const REPLAY_ROTAS_VIVAS = ['/divergence/'];

function fromReplay(name, pathq, ms) {
  const d = etDate();                                   // já derivado de effectiveNow()
  const at = encodeURIComponent(effectiveNow().toISOString());
  if (name === 'gexbot') {
    // O consumidor (gexContext) espera o oi-latest.json inteiro, cuja raiz é `instruments`.
    // O /compat/gexbot devolve exatamente essa forma — por isso nada a jusante muda.
    return getJson(REPLAY_API + '/compat/gexbot?sym=ES,NQ&date=' + d + '&at=' + at, ms);
  }
  const sep = pathq.indexOf('?') >= 0 ? '&' : '?';
  return getJson(SRC[name] + pathq + sep + 'date=' + d + '&at=' + at, ms, KEYS[name]);
}

function from(name, pathq, baseMs) {
  const url = SRC[name];
  const ms = isRemote(url) ? Math.max(baseMs || 4000, 9000) : (baseMs || 4000);
  if (REPLAY && REPLAY_SRCS.has(name) && !REPLAY_ROTAS_VIVAS.some(p => pathq.indexOf(p) >= 0)) {
    return fromReplay(name, pathq, ms);
  }
  return getJson(url + pathq, ms, KEYS[name]);
}
// W3 (2026-08-07): a idade passa a ser medida contra o relógio EFETIVO.
// Em produção `effectiveNow()` é `new Date()` — comportamento IDÊNTICO, é no-op.
// Em replay, sem isto, um dado historicamente correto de 3 dias atrás aparecia com 5 h de idade
// e TODAS as fontes pintavam de velhas na tela, apesar de estarem certas para o instante
// simulado. A idade que importa é a distância até o `at`, não até o relógio de parede — mesma
// regra que o player (:3510) aplica no `ageS` e que o W1/W2 aplicam em cada API.
const ageSec = (iso) => { const t = Date.parse(iso); return isFinite(t) ? Math.round((effectiveNow().getTime() - t) / 1000) : null; };
// Limiar de "stale" POR FONTE. O default (STALE_S) assume cadência rápida — vale p/ quem
// atualiza a cada poll. Fonte com cadência própria precisa do seu próprio limiar, senão o
// BFF a marca como stale só por ela ainda não ter chegado no próximo bloco.
//   menthorq: publica em blocos de ~15-20 min (medido 2026-07-30: `updatedAt` em horários
//   redondos, ex. 13:20:00). Com o default, a idade cruzava o limiar VÁRIAS VEZES AO DIA e
//   pintava "desatualizado" um dado que estava perfeitamente no ritmo dele. 1500s = 25 min
//   dá folga de um bloco inteiro; acima disso é atraso de verdade.
//   AJUSTE 2026-09-11: medido ao vivo 1500s ainda era curto. `updatedAt` ficou parado em
//   10:25:00Z enquanto o NOSSO coletor seguia saudável (ciclo 27→32, ok=13 fail=0, a cada
//   ~15min) — quando o /health do BFF foi lido às 10:54:56Z a idade real já era 1796s
//   (~30min), cruzando 1500s por só 296s SEM nenhuma falha de captura do nosso lado. É o
//   bloco do PRÓPRIO VENDOR variando além do "~15-20min" nominal, não um travamento nosso.
//   1800s = 30 min cobre essa variação observada com folga mínima; continua bem abaixo do
//   default (900s) que geraria falso-stale ainda mais cedo.
const STALE_BY_SRC = { menthorq: 1800 };

// (2026-09-28) CONNECTION_STATE x DATA_STATE (politica ALL_SOURCES_ALWAYS_CONNECTED_24_7).
// Aditivo: `status`/`ok` seguem identicos. connection_state = CONNECTED | AUTH_REQUIRED | ERROR;
// data_state = FRESH | NO_NEW_DATA_EXPECTED | STALE. Dado velho com mercado fechado (CME:
// sab, sex >= 17:00 ET, dom < 18:00 ET, pausa diaria 17-18 ET) = NO_NEW_DATA_EXPECTED, nao STALE.
function cmeDeliveryOpen(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  const h = parseInt(p.hour, 10) % 24, m = h * 60 + parseInt(p.minute, 10);
  if (p.weekday === 'Sat') return false;
  if (p.weekday === 'Sun') return m >= 18 * 60;
  if (p.weekday === 'Fri') return m < 17 * 60;
  return m < 17 * 60 || m >= 18 * 60;
}
// (2026-09-28, UI_SOURCE_COLOR_POLICY) COR do badge = connection_state (CONNECTED azul; AUTH_REQUIRED /
// DISCONNECTED / ERROR amarelo). data_state (FRESH | PARTIAL | NO_NEW_DATA_EXPECTED | STALE) vira TEXTO,
// nunca cor. Nenhum horario/fim de semana rebaixa connection_state. `reason` e `updated_at` alimentam o tooltip.
// NEEDS_LOGIN.txt do capturador local = sessao expirada servindo cache -> AUTH_REQUIRED, mas so se o flag for
// MAIS NOVO que o ultimo dado (flag velho, anterior a dado novo, e resto de um login ja resolvido).
const LOGIN_FLAG_DIR = { spotgamma: 'spotgamma-api', quantdata: 'quantdata-capture', menthorq: 'menthorq-capture' };
function loginFlagAfter(srcName, asofMs) {
  const d = LOGIN_FLAG_DIR[srcName];
  if (!d || REPLAY) return null;
  try {
    const st = fs.statSync(path.join(__dirname, '..', d, 'NEEDS_LOGIN.txt'));
    if (asofMs == null || st.mtimeMs > asofMs) return new Date(st.mtimeMs).toISOString();
  } catch { /* sem flag */ }
  return null;
}
function connOfErr(err) {
  const s = String(err || '');
  if (/\b(401|403|302)\b|auth|login|session|forbidden/i.test(s)) return 'AUTH_REQUIRED';
  if (!s || /timeout|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|socket|neterr|network|abort/i.test(s)) return 'DISCONNECTED';
  return 'ERROR';
}
function srcStatus(data, asof, srcName) {
  if (!data || data._err) {
    const err = data && data._err;
    return { ok: false, status: 'offline', detail: err, connection_state: connOfErr(err), data_state: 'STALE', updated_at: null, reason: err || 'sem resposta' };
  }
  const age = asof != null ? ageSec(asof) : null;
  const tAsof = asof != null ? Date.parse(asof) : NaN;
  const updated_at = isFinite(tAsof) ? new Date(tAsof).toISOString() : null;
  const limit = (srcName && STALE_BY_SRC[srcName]) || STALE_S;
  const flag = loginFlagAfter(srcName, isFinite(tAsof) ? tAsof : null);
  const conn = flag ? 'AUTH_REQUIRED' : 'CONNECTED';
  const connWhy = flag ? 'NEEDS_LOGIN.txt ' + flag + ' — sessao expirada, servindo cache' : null;
  if (age != null && age > limit) {
    const open = cmeDeliveryOpen(effectiveNow());
    return { ok: true, status: 'stale', age_s: age, stale_after_s: limit, connection_state: conn, data_state: open ? 'STALE' : 'NO_NEW_DATA_EXPECTED', updated_at,
      reason: connWhy || (open ? 'sem dado novo ha mais de ' + limit + 's com CME aberto' : 'CME fechado/pausa — vendor sem entrega nova') };
  }
  return { ok: true, status: 'live', age_s: age, stale_after_s: limit, connection_state: conn, data_state: 'FRESH', updated_at,
    reason: connWhy || (age == null ? 'respondendo (fonte sem timestamp de dado)' : 'dado dentro de ' + limit + 's') };
}

// ── Estado em memória ────────────────────────────────────────────────────────
let STATE = { ok: false, asof: null, booting: true };
const meta = { startedAt: new Date().toISOString(), polls: 0, errors: 0 };

// ── Conviction Stack ─────────────────────────────────────────────────────────
const CONV_BY_TIER = { A: 'ALTA', B: 'MEDIA', C: 'BAIXA' };
const CONV_ORDER = ['BAIXA', 'MEDIA', 'ALTA'];
function downgrade(level) { const i = CONV_ORDER.indexOf(level); return i <= 0 ? 'BAIXA' : CONV_ORDER[i - 1]; }

// vanna tag / regime vega / charm — thresholds da skill gamma-methodology
function vannaTag(sym, v) { if (v == null) return null; const a = Math.abs(v); const hi = sym === 'ES' ? 500 : 150, mid = sym === 'ES' ? 150 : 60; return a > hi ? 'ALTA' : a > mid ? 'MODERADA' : 'BAIXA'; }
function vegaRegime(sym, gammaCond, netGex0) { if (gammaCond === 'NEGATIVE') return 'EXPANSIVA'; const L = sym === 'ES' ? 200 : 50; if (netGex0 != null && Math.abs(netGex0) < L) return 'NEUTRA'; return 'COMPRESSIVA'; }
function charmDrift(sym, charm0) { if (charm0 == null) return null; const D = sym === 'ES' ? 4000 : 1500; return Math.round(clamp(50 + charm0 / D * 50, 15, 88)); }


// ── S6 (2026-08-07) · ZERO GAMMA DEGENERADO — guarda de I4 ────────────────────
// MEDIDO em 06/08 nos 4 tickers do vendor:
//     SPX 7723,11 x 7729,49  -> distintos  ✅
//     NDX 29483,27 x 29483,27 -> IGUAIS    🔴   (e NQ_NDX idem)
// Causa: na escada de strikes do NDX o gamma é negativo em praticamente toda a faixa,
// SEM cruzamento de sinal. Quando não há cruzamento, o vendor devolve `zero_gamma = spot`
// como fallback. Ou seja: o campo está dizendo "NÃO ACHEI", não "o flip é aqui".
//
// 🔴 O DEFEITO: `gamma_condition` é derivado de spot vs zero_gamma. Com os dois IGUAIS o
// regime é INDETERMINADO — e mesmo assim o relay publicava `γ=NEGATIVE` para o NQ. Qualquer
// motor que leia esse campo herda um regime que nunca foi medido, e a regra I1 inverte a
// leitura de TODO fluxo com base nele.
//
// I4 é explícito: dado ausente ⇒ **reportar vazio, não inferir**. Então aqui o regime vira
// null e o motivo sai publicado, em vez de um lado inventado.
function zeroGammaDegenerado(spot, zg) {
  if (spot == null || zg == null || !isFinite(spot) || !isFinite(zg)) return false;
  // tolerância mínima: o vendor devolve o spot exato, mas arredondamentos podem deslocar
  return Math.abs(zg - spot) < Math.max(0.01, Math.abs(spot) * 1e-6);
}

// GexBot: extrai contexto Tier 2 do instrumento do oi-latest.json
function gexContext(sym, inst) {
  if (!inst || inst._err) return null;
  const g = inst.gex || {}, dex = inst.dex || {}, vanna = inst.vanna || {}, charm = inst.charm || {}, lv = inst.levels || {}, cl = inst.classic || {};
  let gammaCond = inst.gamma_condition || null;                   // 'POSITIVE'|'NEGATIVE'
  // S6 — se o zero gamma veio degenerado (== spot), o regime NÃO foi medido: I4 manda
  // reportar vazio em vez de inferir. Sem isso o NQ publicava NEGATIVE sem base.
  const zgRaw = (cl.zero_gamma != null) ? cl.zero_gamma : lv.hvl;
  const zgDegen = zeroGammaDegenerado(inst.spot, zgRaw);
  if (zgDegen) gammaCond = null;
  return {
    gamma_condition: gammaCond,
    zero_gamma_degenerado: zgDegen || undefined,
    zero_gamma_nota: zgDegen
      ? 'zero_gamma == spot: o vendor não achou cruzamento de sinal na escada de strikes. '
        + 'Regime INDETERMINADO — não inferido (I4). Não usar para inverter leitura de fluxo (I1).'
      : undefined,
    regime_vega: vegaRegime(sym, gammaCond, g.net_0dte),
    vanna: { value: r2(vanna.net_0dte), tag: vannaTag(sym, vanna.net_0dte) },
    charm: { value: r2(charm.net_0dte), driftPct: charmDrift(sym, charm.net_0dte) },
    dexoflow: r2(dex.oflow), gexoflow: r2(g.oflow), cvr_oflow: r2((inst.orderflow || {}).cvr_oflow),
    net_gex_0dte: r2(g.net_0dte), net_dex_0dte: r2(dex.net_0dte),
    levels: {
      spot: r2(inst.spot),
      zero_gamma: r2(cl.zero_gamma != null ? cl.zero_gamma : lv.hvl),
      call_wall: r2(lv.call_resistance), put_wall: r2(lv.put_support),
      gamma_wall_0dte: r2(lv.gamma_wall_0dte), max_g_strike: r2(cl.max_g_strike),
    },
  };
}

// ── DEX/GEX FLOW — campo com NOME PRÓPRIO (espelha AlfaOmegaDexGexFlow.cs) ──
// Lote 2 (2026-07-22): os campos já existiam soltos em symbols.<sym>.tier2_regime (mesmo
// gexContext() usado pelo Tier 2, relay :3457) — aqui só empacotados com identidade própria,
// ES+NQ, a pedido do operador. NÃO remove/renomeia tier2_regime (mantém compatibilidade).
function buildDexGexFlow(symbols) {
  const pick = (sym) => {
    const r = symbols[sym] && symbols[sym].tier2_regime;
    if (!r) return { ok: false, note: 'GexBot :3457 indisponível para ' + sym };
    const lv = r.levels || {};
    return {
      ok: true, sym,
      dexoflow: r.dexoflow, gexoflow: r.gexoflow, cvr_oflow: r.cvr_oflow,
      net_gex_0dte: r.net_gex_0dte, net_dex_0dte: r.net_dex_0dte,
      zero_gamma: lv.zero_gamma, call_wall: lv.call_wall, put_wall: lv.put_wall, gamma_wall_0dte: lv.gamma_wall_0dte,
      gamma_condition: r.gamma_condition,
    };
  };
  return {
    ES: pick('ES'), NQ: pick('NQ'),
    _note: 'DEX/GEX flow (relay :3457, MESMOS campos do AlfaOmegaDexGexFlow.cs) — espelha symbols.<sym>.tier2_regime com nome próprio.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELO DE ATENÇÃO POR WALL — display-only, ADITIVO, fora do Conviction Stack.
// Aprovado (desenho "a" conservador): combina 3 fatos SEM cravar reversão/squeeze.
//   1) FORÇA (VBPI geométrico, POR-WALL)     — força_do_nível × proximidade_ao_spot
//   2) γ DO DEALER NO STRIKE (/grid, POR-STRIKE) — sinal do GEX dealer no strike da wall
//   3) FLUXO AGREGADO (HIRO + DEX/GEX oflow, INSTRUMENTO INTEIRO — rotulado como tal)
// ⚠️ Granularidades diferentes NÃO são fundidas: (1)(2) são por-strike e ficam por-wall;
//    (3) é agregado e entra UMA vez, marcado "não medido nesta wall". Nunca vira direção.
// ═══════════════════════════════════════════════════════════════════════════════
// Porte fiel de computeVbpiLevels (darkflow-web/signal-engine.js:114) — geometria pura.
function vbpiLevels(inst) {
  const spot = inst && inst.spot;
  if (!spot || !isFinite(spot)) return [];
  const L = inst.levels || {}, E = inst.extended_zone || {}, cl = inst.classic || {};
  const cat = [
    [E.call_wall, 'Call Wall', 100, 'wall'], [E.put_wall, 'Put Wall', 100, 'wall'],
    [E.zero_gamma, 'Zero Gamma', 90, 'pivot'], [E.vol_trigger, 'Vol Trigger', 70, 'pivot'],
    [E.hedge_wall, 'Hedge Wall', 75, 'pivot'], [L.hvl, 'HVL', 65, 'pivot'],
    [L.call_resistance, 'Call Resistance', 80, 'wall'], [L.put_support, 'Put Support', 80, 'wall'],
    [L.gamma_wall_0dte, 'Gamma Wall 0DTE', 70, 'pivot'], [L.short_gamma_0dte, 'Short Gamma 0DTE', 65, 'pivot'],
    [cl.major_pos_vol, 'Major Pos Vol (Long Γ)', 80, 'wall'], [cl.major_neg_vol, 'Major Neg Vol (Short Γ)', 80, 'wall'],
    [cl.major_pos_oi, 'Major Pos OI', 90, 'wall'], [cl.major_neg_oi, 'Major Neg OI', 90, 'wall'],
    [L.call_resistance_0dte, 'CW0 · Call Wall 0DTE', 85, 'wall'], [L.put_support_0dte, 'PW0 · Put Wall 0DTE', 85, 'wall'],
    [L.hvl_0dte, 'HVL0', 60, 'pivot'],
  ];
  const span = (E.call_wall && E.put_wall && E.call_wall > E.put_wall) ? (E.call_wall - E.put_wall)
             : (L.day_max && L.day_min && L.day_max > L.day_min) ? (L.day_max - L.day_min) : spot * 0.02;
  const out = [];
  for (const [preco, nome, forca, classe] of cat) {
    if (typeof preco !== 'number' || !isFinite(preco) || preco <= 0) continue;
    const proximity = clamp(1 - Math.abs(preco - spot) / span, 0, 1);
    const score = Math.round(clamp(forca * proximity, 0, 100));
    const tipo = classe === 'pivot' ? 'pivot' : (preco >= spot ? 'resistencia' : 'suporte');
    out.push({ nome, preco: r2(preco), tipo, score, dist_pt: r2(preco - spot) });
  }
  out.sort((a, b) => Math.abs(a.dist_pt) - Math.abs(b.dist_pt));
  return out;
}
// γ do dealer no strike da wall (POR-STRIKE), a partir das rows do /grid (participant=dealer).
// futK = strike em termos de FUTUROS (ES), casável com o preço da wall. Guard: se o strike da grade
// mais próximo estiver > 10pt da wall, NÃO inventa — retorna 'sem cobertura de grade'.
function dealerGammaAt(rows, price) {
  if (!Array.isArray(rows) || !rows.length || price == null) return { sign: null, mech: 'sem grade' };
  let best = null, bestD = Infinity;
  for (const r of rows) { if (!r || !isFinite(r.futK) || !isFinite(r.v)) continue; const d = Math.abs(r.futK - price); if (d < bestD) { bestD = d; best = r; } }
  if (!best || bestD > 10) return { sign: null, mech: 'sem cobertura de grade próxima', matchPt: best ? r2(bestD) : null };
  const v = best.v;
  return {
    sign: v > 0 ? 'LONG' : v < 0 ? 'SHORT' : 'FLAT', gex: r2(v), matchPt: r2(bestD),
    mech: v > 0 ? 'dealer long γ → hedge tende a ABSORVER (mecânico, não previsão)'
        : v < 0 ? 'dealer short γ → hedge tende a AMPLIFICAR (mecânico, não previsão)' : 'neutro',
  };
}
// Contexto de fluxo AGREGADO do instrumento (HIRO + DEX/GEX oflow). NÃO é por-wall.
function instrumentFlowContext(inst, flowHiro) {
  const dex = (inst && inst.dex) || {}, gex = (inst && inst.gex) || {};
  const hiroVal = flowHiro ? numOrNull(flowHiro.hiro_es) : null;
  const hiroDir = hiroVal == null ? 'N/A' : hiroVal > 0 ? 'COMPRADOR' : hiroVal < 0 ? 'VENDEDOR' : 'NEUTRO';
  const dexS = sgn(numOrNull(dex.oflow)), gexS = sgn(numOrNull(gex.oflow));
  const hS = hiroVal == null ? 0 : Math.sign(hiroVal);
  const votes = [hS, dexS].filter(x => x !== 0);
  const net = votes.length === 0 ? 'NEUTRO' : votes.every(v => v > 0) ? 'COMPRADOR' : votes.every(v => v < 0) ? 'VENDEDOR' : 'MISTO';
  return {
    scope: 'instrumento inteiro — NÃO medido nesta wall',
    hiro: { dir: hiroDir, value: r2(hiroVal) },
    dexOflow: { sign: dexS, value: r2(numOrNull(dex.oflow)) },
    gexOflow: { sign: gexS, value: r2(numOrNull(gex.oflow)) },
    net,
  };
}
const wallTag = (score) => score >= 70 ? 'FORTE' : score >= 40 ? 'MÉDIA' : 'FRACA';
// Monta o selo por-wall (ES-only: VBPI-levels e /grid são SPX/ES). Display-only.
function buildWallAttention(inst, gridGexRows, flowHiro) {
  if (!inst || inst._err || !inst.spot) return null;
  const levels = vbpiLevels(inst);
  if (!levels.length) return null;
  const walls = levels.map(l => {
    const dg = dealerGammaAt(gridGexRows, l.preco);
    return {
      name: l.nome, price: l.preco, tipo: l.tipo, distPt: l.dist_pt,
      near: Math.abs(l.dist_pt) <= WALL_NEAR_PT,
      strength: { score: l.score, tag: wallTag(l.score) },   // VBPI geométrico (força × proximidade)
      dealerGammaHere: dg,                                     // por-strike (/grid)
    };
  });
  return {
    sym: 'ES', spot: r2(inst.spot), nearPt: WALL_NEAR_PT,
    instrumentFlow: instrumentFlowContext(inst, flowHiro),    // AGREGADO — uma vez, rotulado
    walls,
    _note: 'ATENÇÃO/contexto, display-only. NÃO é sinal de compra/venda, NÃO é veredito de reversão/squeeze, NÃO entra no Conviction Stack. Força=geométrica (VBPI); γ dealer=por-strike (/grid); fluxo=agregado do instrumento.',
  };
}

// HIRO do SpotGamma → confirma/diverge a direção Tier 0
// ⚠️ FIX 2026-07-29: lia latest[2] (=call+), que é ESTRUTURALMENTE POSITIVO — medido em 400
// candles: [2] positivo em 89% das amostras vs [4] em 54% (um net equilibrado, como deve ser);
// os dois só concordam em 66%. Com [2], Math.sign() dava ~sempre +1, então o confirmador
// respondia CONFIRMA para todo LONG e DIVERGE para todo SHORT quase independente do fluxo real.
// O HIRO net é o índice 4 (ver gamma-methodology/references/hiro-walls-flow.md §1).
//
// ⚠️ FIX 2026-07-31: mesmo com [4] certo, comparar contra 1 candle ISOLADA ainda é ruído — o
// candle nativo do /hiro é de 5s, e [4] troca de sinal em ~metade das amostras (medido acima).
// O operador viu o card "HIRO cumulativo" (Σ da sessão inteira, igual ao NT8) marcando
// +$2,14B — bem positivo — ao lado do chip "HIRO DIVERGE", parecendo contradição. Não é bug de
// índice/direção (dir já é o Tape correto): é comparar o Tape contra um número de escala
// completamente diferente (1 print de 5s vs a soma do dia inteiro). Fix: usar a soma dos
// ÚLTIMOS 5 MINUTOS (indicators.hiroNet5m, ~60 candles de 5s) — estável o bastante p/ não ser
// ruído puro, mas sensível o bastante p/ realmente poder divergir do Tape (ao contrário do
// cumulativo do dia, que é lento demais p/ isso). Ver hiroRegime.net5m (mesma função, mesmo
// cálculo) exibido no card ao lado como "HIRO Net $" — os dois usam a MESMA janela agora.
function hiroConfirm(dir, hiroData) {
  if (!hiroData || hiroData._err) return { confirm: 'N/A', reason: 'SpotGamma offline' };
  const flow = indicators.hiroNet5m(hiroData);
  if (flow == null) return { confirm: 'N/A', reason: 'sem HIRO (janela de 5min vazia)' };
  const sHiro = Math.sign(flow), sDir = dir === 'LONG' ? 1 : dir === 'SHORT' ? -1 : 0;
  if (sDir === 0) return { confirm: 'NEUTRO', value: r2(flow) };
  return { confirm: sHiro === sDir ? 'CONFIRMA' : (sHiro === 0 ? 'NEUTRO' : 'DIVERGE'), value: r2(flow) };
}

// ── VIX LINE (:3500 /vix/series) — resumo p/ Command; série completa vai p/ Deep Dive ──
// Reusa EXATAMENTE a rota que o indicador AlfaOmegaVixLine.cs consome no NT8. Como é :3500,
// independe do NT8 estar aberto (mesmo padrão dos demais indicadores recalculados pelo BFF).
function buildVixLine(vixSeries) {
  if (!vixSeries || vixSeries._err || !Array.isArray(vixSeries.series) || !vixSeries.series.length)
    return { ok: false, note: 'VIX série indisponível (:3500 /vix/series)' };
  const s = vixSeries.series;
  const value = numOrNull(s[s.length - 1] && s[s.length - 1].vix);
  const back = s.length > 10 ? s[s.length - 11] : s[0];     // ~10 amostras atrás = tendência recente
  const prev = numOrNull(back && back.vix);
  let trend = 'ESTÁVEL', deltaPts = 0;
  if (value != null && prev != null) { deltaPts = r2(value - prev); trend = deltaPts > 0.05 ? 'SUBINDO' : deltaPts < -0.05 ? 'CAINDO' : 'ESTÁVEL'; }
  return { ok: true, sym: 'VIX', value: r2(value), trend, deltaPts, points: s.length, maxCapacity: vixSeries.maxCapacity || null, asof: vixSeries.at,
    _note: 'VIX spot acumulado (:3500 /vix/series, ring buffer ~24h RTH). MESMA fonte do indicador AlfaOmegaVixLine no NT8. Série completa no Deep Dive (deep.spotgamma.vix_series).' };
}

// ── GEX BY STRIKE (:3500 /grid/ES) — campo com NOME PRÓPRIO (espelha AlfaOmegaGexByStrike.cs) ──
// A pedido do operador: campo separado e sem ambiguidade. FONTE IDÊNTICA ao indicators.dexGex
// (/grid/ES?metric=gex&participant=dealer). Retorna resumo (Command) + snapshot (Deep Dive). ES-only.
function buildGexByStrike(gridGex) {
  if (!gridGex || gridGex._err || !Array.isArray(gridGex.rows) || !gridGex.rows.length)
    return { ok: false, note: 'grade GEX-by-strike indisponível (:3500 /grid/ES)' };
  const rows = gridGex.rows.filter(r => r && isFinite(r.v));
  let net = 0, maxPos = null, maxNeg = null;
  for (const r of rows) {
    net += r.v;
    if (r.v > 0 && (!maxPos || r.v > maxPos.gex)) maxPos = { k: r.k, futK: r.futK, gex: r2(r.v) };
    if (r.v < 0 && (!maxNeg || r.v < maxNeg.gex)) maxNeg = { k: r.k, futK: r.futK, gex: r2(r.v) };
  }
  return {
    ok: true, sym: 'ES', strikes: rows.length,
    summary: { netGex: r2(net), netDir: net > 0 ? 'POSITIVO' : net < 0 ? 'NEGATIVO' : 'FLAT', topPos: maxPos, topNeg: maxNeg },
    snapshot: rows.map(r => ({ k: r.k, futK: r.futK, gex: r2(r.v) })),
    asof: gridGex.at || null,
    _note: 'GEX-by-strike do dealer (:3500 /grid/ES?metric=gex&participant=dealer). MESMA fonte de dado do indicators.dexGex — exposto com nome próprio p/ casar o indicador AlfaOmegaGexByStrike do NT8. ES-only (só SPX/ES têm grade real).',
  };
}

// ── ESTRUTURA (contexto) — GexByStrike × HIRO ────────────────────────────────
// Porte da camada "Estrutura" do AlfaOmegaHiro.cs. Cruza a trava de gamma do DEALER
// (grid por strike) com o que o hedge está FAZENDO (HIRO). São duas vistas do MESMO
// sistema de hedge, não duas estimativas do mesmo número — por isso se complementam.
//
// ⚠️ ESCALA: aqui usa-se `k` (strike do ÍNDICE), porque a série de preço vem de
//    /prices/SPX (índice). O AlfaOmegaHiro.cs usa `futK` porque compara com o preço do
//    FUTURO no gráfico. Misturar as duas escalas daria distância errada em ~33 pts.
// ⚠️ SEM ESTADO: inclinação e Δpreço saem do payload de cada poll (soma de f4 por metade
//    de janela). Nada acumulado → imune aos reinícios do BFF.
// ⚠️ ES/SPX-only: o grid só existe em escala SPX/ES; /prices/ só tem SPX.
function buildStructure(gridGex, hiroFull, pricesSpx, opts) {
  const windowMin = (opts && opts.windowMin) || 30;
  const nearPct = (opts && opts.nearPct) || 0.15;
  const out = { ok: false, windowMin, nearPct,
    _note: 'Estrutura = grid do dealer × HIRO. Estado mecânico observado (Pinagem/Compressão/Cascata/Exaustão). Escala de ÍNDICE (k + /prices/SPX). Limiares não calibrados.' };

  if (!gridGex || gridGex._err || !Array.isArray(gridGex.rows) || !gridGex.rows.length) {
    out.note = 'grid do dealer indisponível (:3500 /grid/ES)'; return out;
  }
  // 1) walls do dealer = picos de gamma por strike
  let wallCall = null, wallPut = null, bestPos = 0, bestNeg = 0, gridPos = 0, gridNeg = 0;
  for (const r of gridGex.rows) {
    const k = Number(r.k), v = Number(r.v);
    if (!isFinite(k) || k <= 0 || !isFinite(v)) continue;
    if (v > 0) gridPos++; else if (v < 0) gridNeg++;
    if (v > bestPos) { bestPos = v; wallCall = k; }
    if (v < bestNeg) { bestNeg = v; wallPut = k; }
  }
  out.wallCall = wallCall; out.wallPut = wallPut;
  out.gridPos = gridPos; out.gridNeg = gridNeg; out.strikes = gridPos + gridNeg;
  // regime unilateral: todo o grid de um lado é leitura de regime por si (invariante I1)
  out.unilateral = (out.strikes > 0 && gridNeg === out.strikes) ? 'DEALER_SHORT'
                 : (out.strikes > 0 && gridPos === out.strikes) ? 'DEALER_LONG' : null;

  // 2) inclinação do HIRO: f4 é POR CANDLE (verificado: oscila) → somar por metade de janela
  const tail = (hiroFull && !hiroFull._err && Array.isArray(hiroFull.tail)) ? hiroFull.tail : null;
  if (!tail || tail.length < 6) { out.note = 'série HIRO insuficiente'; return out; }
  const tEnd = Number(tail[tail.length - 1][0]);
  const tIni = tEnd - windowMin * 60000, tMid = tEnd - (windowMin / 2) * 60000;
  let h1 = 0, h2 = 0, n1 = 0, n2 = 0;
  for (const c of tail) {
    const ts = Number(c[0]), f4 = Number(c[4]);
    if (!isFinite(ts) || !isFinite(f4) || ts < tIni) continue;
    if (ts < tMid) { h1 += f4; n1++; } else { h2 += f4; n2++; }
  }
  if (n1 < 2 || n2 < 2) { out.note = 'janela HIRO incompleta (aguardando amostras)'; return out; }
  out.hiroFirstHalf = r2(h1); out.hiroSecondHalf = r2(h2);

  // 3) Δpreço na mesma janela, pelo close real de /prices/SPX
  const pt = (pricesSpx && !pricesSpx._err && Array.isArray(pricesSpx.tail)) ? pricesSpx.tail : null;
  if (!pt || !pt.length) { out.note = 'série de preço indisponível (:3500 /prices/SPX)'; return out; }
  let spot = null, pIni = null;
  for (const c of pt) {
    const ts = Number(c[0]), close = Number(c[4]);
    if (!isFinite(ts) || !isFinite(close)) continue;
    if (ts >= tIni && pIni === null) pIni = close;
    spot = close;
  }
  if (spot === null || pIni === null) { out.note = 'preço fora da janela'; return out; }
  const dp = spot - pIni;
  out.spot = r2(spot); out.priceDelta = r2(dp);

  // 4) classificação — MESMA ordem de precedência do AlfaOmegaHiro.cs
  const near = spot * (nearPct / 100);
  const contido = Math.abs(dp) < near;
  const acumula = Math.abs(h2) > Math.abs(h1);
  const achata = Math.abs(h2) < Math.abs(h1) * 0.5;

  let state = null, detail = null;
  if (wallPut !== null && spot < wallPut && h2 < 0 && acumula) {
    state = 'CASCATA'; detail = 'abaixo da put wall do dealer · hedge acelerando junto';
  } else if (wallCall !== null && Math.abs(spot - wallCall) <= near && h2 < 0 && dp >= 0) {
    state = 'PINAGEM'; detail = 'junto da call wall do dealer · hedge em contra-fluxo';
  } else if (!contido && achata) {
    state = 'EXAUSTAO'; detail = 'preço estendendo · HIRO achatando (divergência)';
  } else if (contido && acumula) {
    state = 'COMPRESSAO'; detail = 'HIRO acumulando · preço contido';
  }
  out.ok = true; out.state = state; out.detail = detail;
  out.asof = (hiroFull && hiroFull.at) || null;
  return out;
}

// ── HIRO-OPRA (flow_hiro do gexbot :3457) — campo próprio e VISÍVEL, lado a lado com HIRO SpotGamma ──
// A pedido do operador: o HIRO via OPRA (DEX-flow, ES+NQ) sai de dentro do wallAttention e ganha
// identidade própria, comparável com o HIRO oficial SpotGamma (SPX proxy, só ES) no mesmo objeto.
function buildHiroOpra(flowHiro, hES) {
  const out = { source: 'gexbot/OPRA (DEX-flow)', _note: 'HIRO derivado do DEX-flow OPRA (gexbot) — ES e NQ. DIFERENTE do HIRO oficial SpotGamma (campo spotgamma abaixo: SPX proxy, só ES).' };
  if (!flowHiro) { out.ok = false; out.note = 'flow_hiro indisponível (gexbot offline)'; }
  else {
    out.ok = true; out.ts = flowHiro.ts || null;
    const esInst = flowHiro.windows && flowHiro.windows.ES ? numOrNull(flowHiro.windows.ES.instant) : null;
    const nqInst = flowHiro.windows && flowHiro.windows.NQ ? numOrNull(flowHiro.windows.NQ.instant) : null;
    out.es = { value: r2(numOrNull(flowHiro.hiro_es)), dir: flowHiro.direction_es || null, instant: r2(esInst) };
    out.nq = { value: r2(numOrNull(flowHiro.hiro_nq)), dir: flowHiro.direction_nq || null, instant: r2(nqInst) };
  }
  // HIRO oficial SpotGamma (só ES/SPX) lado a lado, p/ o operador comparar as duas leituras
  // ⚠️ FIX 2026-07-29 (mesmo bug do confirmador Tier 1, ver buildHiroConfirm): lia latest[2],
  // que é `call+` e portanto estruturalmente positivo (89% das amostras em 400 candles). Isso
  // fazia este card rotular COMPRADOR quase sempre. O HIRO net é o índice 4.
  let sgVal = null;
  if (hES && !hES._err) {
    if (Array.isArray(hES.latest) && hES.latest.length >= 5) sgVal = hES.latest[4];
    else if (typeof hES.cumulative === 'number') sgVal = hES.cumulative;
  }
  out.spotgamma = { scope: 'ES/SPX (oficial)', value: sgVal != null ? r2(sgVal) : null,
    dir: sgVal == null ? 'N/A' : sgVal > 0 ? 'COMPRADOR' : sgVal < 0 ? 'VENDEDOR' : 'NEUTRO',
    note: hES && hES._err ? 'SpotGamma offline' : (sgVal == null ? 'sem HIRO (fora de RTH?)' : null) };
  return out;
}

// Normaliza a direção da âncora p/ STRING canônica ('LONG'|'SHORT'|'NEUTRO').
// Aceita o INTEIRO que o bridge emite (-1/0/+1) e também string (defensivo, caso o
// bridge mude). Mesmo idioma já usado em public/deep.html L278 e narrator/narrator.js L80,
// que sempre foram tolerantes aos dois formatos. ⚠️ NÃO confundir com `dirWord` (L~661),
// que é numérico-only e serve às camadas flowGc/flowRussell (entrada via sgn()).
const dirCanon = (d) => (d === 'LONG' || d === 1) ? 'LONG' : (d === 'SHORT' || d === -1) ? 'SHORT' : 'NEUTRO';

// ── GATE 1 (Alfa Omega) — radar que TRAVA a direção do sistema inteiro ───────
// Sem radar 4/4 + tape vivo, o consolidador inteiro esperando confirmação de fluxo agressor (não importa as
// outras 5 fontes). Por isso o gate é um objeto de topo do /state, não "mais uma fonte".
function buildGate(ao, rth) {
  const online = !!(ao && !ao._err);
  const anchor = (online && ao.anchor) ? ao.anchor : null;
  const strength = (anchor && typeof anchor.strength === 'number') ? anchor.strength : null;
  // ── CORRECAO 2026-08-18 — o painel escondia o motivo real ────────────────────
  // `AoGate.EsNq` (AlfaOmegaSharedState.cs:663) reprova em QUATRO etapas e diz em `why`
  // qual delas barrou: 'sem tape ES/NQ', 'ES indefinido', 'NQ indefinido',
  // 'ES x NQ divergentes', 'forca fraca ES/NQ'. O bridge sempre publicou esse campo e o
  // BFF simplesmente o ignorava — toda reprovacao virava 'precisa 4' na tela.
  // MEDIDO em 18/08 15:51:25 e 15:51:30: strength=4 (os quatro ME/MVI em -1, unanimidade
  // real) e mesmo assim dir=0, porque `why='forca fraca ES/NQ'`. O operador via '4/4 nao
  // fechou' quando o 4/4 tinha fechado e a reprovacao era de FORCA.
  // ⚠️ Isto NAO altera strength nem dir — so deixa de esconder a razao que o bridge ja dava.
  const why = (anchor && typeof anchor.why === 'string' && anchor.why.trim()) ? anchor.why.trim() : null;
  const tapeLive = online ? !!ao.tapeLive : false;
  const ready = online ? !!ao.ready : false;
  // ⚠️ FIX 2026-07-31 — TIPO DE `dir`, ponto ÚNICO de normalização.
  // A linha antiga era `(anchor && anchor.dir) ? anchor.dir : 'NEUTRO'`: repassava o
  // INTEIRO cru do bridge (AlfaOmegaBridge.cs L216 emite `"dir":1`) para ±1 e só convertia
  // o 0 em 'NEUTRO' — um tipo HÍBRIDO (number|string). Como aot-sim.js L186 testa
  // `dir === 'LONG' || dir === 'SHORT'`, e `1 === 'LONG'` é sempre false, a automação
  // NUNCA abria posição, mesmo com o gate em 4/4 e `open:true` (1.641 gatilhos perfeitos
  // perdidos entre 10 e 31/07; zero trades gravados). Normalizar AQUI conserta os 3
  // consumidores de uma vez (sim, auto.html, deep.html) sem remendo em cada um.
  const dir = dirCanon(anchor ? anchor.dir : null);
  // ── CORRECAO 2026-08-18 — `open` nao checava direcao ─────────────────────────
  // A linha antiga era `open = online && ready && tapeLive && strength === 4`, avaliada
  // ANTES desta e sem olhar `dir`. Como `strength` e |soma| dos 4 ME/MVI e `dir` so vira
  // LONG/SHORT depois da etapa de FORCA do gate, existe estado real (medido 15:51:25) em
  // que strength=4 e dir=NEUTRO — e o gate se dizia ABERTO sem direcao para entregar.
  // Agora `open` exige as duas coisas. Continua sem MUDAR quem calcula strength ou dir:
  // apenas para de afirmar 'aberto' quando nao ha lado. `aot-sim.js` ja exigia
  // `dir === 'LONG' || dir === 'SHORT'` por conta propria, entao a automacao nao muda.
  const temDirecao = (dir === 'LONG' || dir === 'SHORT');
  const open = !!(online && ready && tapeLive && strength === 4 && temDirecao);
  const state = !online ? 'OFFLINE' : open ? 'OPEN' : 'CLOSED';
  // idade do preço (bridge expõe priceAgeMs por leg) — p/ a mensagem dizer HÁ QUANTO o preço não muda
  const pAge = online ? Math.min(
    (ao.es && isFinite(ao.es.priceAgeMs)) ? ao.es.priceAgeMs : Infinity,
    (ao.nq && isFinite(ao.nq.priceAgeMs)) ? ao.nq.priceAgeMs : Infinity) : Infinity;
  const pAgeTxt = isFinite(pAge) ? (pAge >= 60000 ? Math.round(pAge / 60000) + 'min' : Math.round(pAge / 1000) + 's') : '?';
  let reason;
  if (!online) reason = 'Ponte Alfa Omega :5151 fora do ar (NT8 fechado ou bridge down). Sem radar, o sistema inteiro fica esperando confirmação de fluxo agressor — nenhum veredito é emitido.';
  // §CA: a mensagem antiga dizia "fora de pregão" p/ QUALQUER !tapeLive, mesmo em pleno RTH
  // (mentia a causa). Agora separa: em RTH, tape parado = feed/escritor de preço com problema.
  else if (!tapeLive && rth) reason = `Tape sem atualização de preço há ${pAgeTxt} DURANTE o pregão (tapeLive exige <15s) — provável escritor de preço parado no NT8 (Nexus/Copilot no gráfico). O radar não valida; sistema esperando confirmação de fluxo agressor.`;
  else if (!tapeLive) reason = 'Tape parado (fora de pregão / sem movimento) — o radar não valida, sistema esperando confirmação de fluxo agressor.';
  else if (strength !== 4) reason = `Radar ES+NQ incompleto (${strength == null ? '?' : strength}/4)` +
    (why ? ` — ${why}.` : ' — os 4 ME/MVI de ES+NQ ainda não concordam.') +
    ' Sistema esperando confirmação de fluxo agressor até fechar 4/4.';
  // 4/4 fechado e AINDA ASSIM sem direção: a reprovação veio de outra etapa do gate
  // (força mínima, quase sempre). Antes este caso caía no `else` e a tela mentia
  // dizendo 'Gate aberto', ou era lido como 'faltou 4/4'. Agora diz o que de fato houve.
  else if (!temDirecao) reason = `Radar 4/4 FECHADO (os 4 ME/MVI concordam), mas o gate não liberou direção` +
    (why ? ` — ${why}.` : '.') +
    ' Confluência existe; o que falta é intensidade de fluxo. Nenhum veredito é emitido.';
  else reason = `Radar formado 4/4 · tape ao vivo · direção ${dir}. Gate aberto — vereditos liberados.`;
  // `why` sobe para o /state para a tela poder mostrar a causa sem reinterpretar numero.
  return { source: 'alfaomega', role: 'GATE 1 — radar ES+NQ (mercado futuro real)', online, ready, tapeLive, strength, anchor: { dir, strength, why }, open, state, dir, reason, why };
}

// ── FRESCOR do tape (reset-based) — OBSERVACIONAL, não alimenta gate/narrador ────────────────
// Rastreia, por símbolo, se o ageMs das legs ME/MVI reseta (caiu = chegou evento → fluxo vivo) ou
// só cresce (travado). Verdict 'flowing'|'STALLED'|'unknown'|'offline'. Warm-start assume reset no
// boot (evita STALLED falso nos 1ºs 20min). Loga só na TRANSIÇÃO p/ não poluir (poll de 20s).
// ── CORREÇÃO 2026-08-17: o reset deixa de ser medido pela QUEDA do ageMs ────────────────────
// DEFEITO MEDIDO: a regra antiga (`age + 1500 < prevAge`) só reconhece vida quando o ageMs CAI
// mais de 1,5 s. Isso pressupõe um feed ATRASADO, onde o ageMs sobe a dezenas de segundos e
// despenca a cada evento. O bridge :5151 é TEMPO REAL: 25 amostras deram ageMs entre 3 e
// 1748 ms (média ES 337, NQ 204) e **0 quedas > 1500 ms em 24 transições por perna**. Ou seja,
// a condição era ESTRUTURALMENTE inalcançável: `lastResetAt` congelava no warm-start,
// `sinceResetMs` crescia monotônico e o veredito virava STALLED aos 20 min com o feed perfeito.
// Assinatura do defeito no log: `ES flowing->STALLED ageMs=6` — perna fresquíssima, dita travada.
//
// AGORA: vida = a perna MUDOU (lastPrice/me/mvi), que é o que de fato acontece quando chega
// evento novo. A regra antiga fica como sinal ADICIONAL (união, não substituição): ela continua
// correta para um feed atrasado, e não pode gerar falso "vivo" — durante travamento genuíno o
// ageMs só cresce, então ela nunca dispara sozinha.
//
// ⚠️ O caso REAL que isto tem de continuar pegando: 17/08, perna NQ com ageMs=13.889.280
// (231 min) e me/mvi/lastPrice CONGELADOS. Sem mudança de assinatura e sem queda de ageMs,
// nenhum dos dois sinais dispara → STALLED, corretamente. Coberto por teste sintético.
const tapeTrk = { es: { prevAge: null, prevSig: null, lastResetAt: null, verdict: null }, nq: { prevAge: null, prevSig: null, lastResetAt: null, verdict: null } };
function trackTapeFreshness(ao) {
  const now = Date.now();
  const out = { asof: new Date(now).toISOString(), thresholdMs: TAPE_RESET_STALE_MS, active: false, es: { verdict: 'offline' }, nq: { verdict: 'offline' } };
  if (!ao || ao._err) {
    tapeTrk.es.prevAge = tapeTrk.nq.prevAge = null;
    tapeTrk.es.prevSig = tapeTrk.nq.prevSig = null;
    return out;
  }
  for (const sym of ['es', 'nq']) {
    const leg = ao[sym], t = tapeTrk[sym];
    if (!leg || typeof leg.ageMs !== 'number') { out[sym] = { verdict: 'unknown' }; continue; }
    const age = leg.ageMs;
    // Assinatura de VIDA: o que muda quando um evento novo entra na perna.
    const sig = String(leg.lastPrice) + '|' + String(leg.me) + '|' + String(leg.mvi);
    const mudou = t.prevSig != null && sig !== t.prevSig;          // sinal primário (feed rápido)
    const caiu = t.prevAge != null && age + 1500 < t.prevAge;      // sinal legado (feed atrasado)
    if (mudou || caiu) t.lastResetAt = now;
    if (t.lastResetAt == null) t.lastResetAt = now;                // warm-start
    t.prevAge = age; t.prevSig = sig;
    const sinceResetMs = now - t.lastResetAt;
    const verdict = sinceResetMs > TAPE_RESET_STALE_MS ? 'STALLED' : 'flowing';
    const resetPor = mudou ? 'mudanca' : caiu ? 'queda-ageMs' : null;   // diagnóstico: qual sinal viu vida
    if (verdict !== t.verdict) { console.log(`[tape-freshness] ${sym.toUpperCase()} ${t.verdict || 'init'}->${verdict} ageMs=${age} sinceResetMs=${sinceResetMs} me=${leg.me} mvi=${leg.mvi} resetPor=${resetPor || '-'}`); t.verdict = verdict; }
    out[sym] = { ageMs: age, sinceResetMs, lastResetAt: new Date(t.lastResetAt).toISOString(), verdict, resetPor, me: leg.me, mvi: leg.mvi };
  }
  return out;
}

// HIRO do Gate (13/10/2026, decisão do operador): exclusivamente o HIRO Darkflow (flow_hiro do relay :3457),
// em ES e NQ. SpotGamma não é fonte nem fallback aqui. Frescor pelo timestamp do FORNECEDOR (api_ts), nunca
// pelo polling; fora do pregão de opções (rth !== true) ou com dado parado ⇒ N/A com motivo.
// Devolve as MESMAS chaves de hiroConfirm: {confirm, value} ou {confirm:'N/A', reason}.
function hiroConfirmGate(dir, sym, flowHiro, rth) {
  const d = hiroDarkflow.hiroConfirmDarkflow(dir, sym, flowHiro, Date.now(), { rth: rth === true });
  return d.confirm === 'N/A' ? { confirm: 'N/A', reason: d.reason } : { confirm: d.confirm, value: d.value };
}

function computeSymbol(sym, tier0, sgDiv, flowHiro, gexInst, rth) {
  const t0 = (!tier0 || tier0._err) ? null : tier0;
  const dir = t0 ? t0.direction : 'NEUTRO';
  const state = t0 ? t0.state : 'OFFLINE';
  const tier = t0 ? t0.tier : null;

  // Tier 1 — confirmadores (modulam convicção, nunca votam)
  const hc = hiroConfirmGate(dir, sym, flowHiro, rth);
  const divSig = (sgDiv && !sgDiv._err && sgDiv.divergence) ? sgDiv.divergence.signal : null;
  const vixCallHeavy = (() => { try { const v = sgDiv.symbols.VIX.tape.putCall.split('/').map(Number); return v[1] > v[0]; } catch { return null; } })();
  const tier1 = {
    hiro: hc,
    divergence: { signal: divSig || (sgDiv && sgDiv._err ? 'N/A' : null), vixCallHeavy },
  };

  // Convicção: base pelo tier do Tier0, rebaixa por divergência/contradição
  let level = state === 'STAND_DOWN' || dir === 'NEUTRO' || !t0 ? '—' : (CONV_BY_TIER[tier] || 'BAIXA');
  const modulators = [];
  if (level !== '—') {
    if (divSig && divSig.startsWith('DIVERGENCIA')) { level = downgrade(level); modulators.push({ t: 'Divergência ES/SPX/VIX', effect: 'rebaixa', kind: 'alert' }); }
    if (hc.confirm === 'DIVERGE') { level = downgrade(level); modulators.push({ t: 'HIRO contradiz', effect: 'rebaixa', kind: 'alert' }); }
    if (hc.confirm === 'CONFIRMA') modulators.push({ t: 'HIRO confirma', effect: 'mantém', kind: 'ok' });
    if (!divSig || !divSig.startsWith('DIVERGENCIA')) modulators.push({ t: 'VIX sem alerta', effect: 'mantém', kind: 'ok' });
  }

  // Tier 2 — regime GexBot
  const regime = gexContext(sym, gexInst);
  if (regime && regime.gamma_condition) modulators.push({ t: 'Regime γ ' + (regime.gamma_condition === 'POSITIVE' ? '⊕' : '⊖'), effect: 'contexto', kind: regime.gamma_condition === 'POSITIVE' ? 'ok' : 'neu' });

  // Níveis p/ o mapa (prefere GexBot classic; MQ entra no deep)
  const levels = regime ? regime.levels : {};
  const spot = (regime && regime.levels.spot) || (t0 && t0.gamma && t0.gamma.spot) || null;

  return {
    spot,
    tier0: t0 ? { direction: dir, tier, confidence: t0.confidence, state, reason: t0.reason || null, asof: t0.asof, degraded: t0.degraded || {} } : { direction: 'NEUTRO', state: 'OFFLINE', reason: 'consolidator offline' },
    conviction: { level, base: tier ? CONV_BY_TIER[tier] : '—', modulators },
    tier1,
    tier2_regime: regime,
    levels,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOVA HIERARQUIA POR TRILHAS (v2) — ADITIVA, atrás da flag AOT_STACK.
// ES e NQ são DUAS trilhas independentes; "confluência dupla" é DERIVADA da comparação.
// Camada 1 (tape :5151) = direção primária · Camada 2 (HIRO) = confirmação ·
// Camada 3 (charm/vol/vanna OPRA) = convicção. Métricas SpotGamma-nativas são SPX-only:
// entram só no ES (proxy do SPX) e ficam "N/A" explícito no NQ (sem substituto artificial).
// ⚠️ v0: thresholds/alinhamento herdados da skill; CALIBRAR com dado real de pregão (RTH).
// ═══════════════════════════════════════════════════════════════════════════════
const numOrNull = (x) => (typeof x === 'number' && isFinite(x)) ? x : (x != null && isFinite(+x) ? +x : null);
// (2026-09-16) PRECO valido = finito e > 0. A ponte :5151 publicava "lastPrice":0 logo apos um F5 do NT8 (SharedState
// zerado) e numOrNull(0) = 0 entrava no simulador como spot ⇒ hard stop falso com exit 0 (−$968.682,50). 0/NaN/neg = null.
const spotOrNull = (x) => { const n = numOrNull(x); return (n != null && n > 0) ? n : null; };
// Registro fechado (ledger) com preco invalido numa perna presente — fora do historico oficial e dos KPIs.
const histPrecoInvalido = (r) => { if (!r) return true; for (const k of ['es', 'nq']) { const l = r[k]; if (!l) continue; if (!(typeof l.entry === 'number' && isFinite(l.entry) && l.entry > 0) || !(typeof l.exit === 'number' && isFinite(l.exit) && l.exit > 0)) return true; } return r.pnlStatus != null && r.pnlStatus !== 'ok'; };
const dirWord = (n) => n > 0 ? 'LONG' : n < 0 ? 'SHORT' : 'NEUTRO';
const sgn = (n) => n == null ? 0 : Math.sign(n);

// CAMADA 1 — tape por símbolo, a partir da leg es/nq do :5151 (AlfaOmegaBridge).
// dir/confStrength DERIVADOS aqui no BFF (Fase 1: sem tocar o AlfaOmegaBridge.cs / sem F5).
function c1FromLeg(leg) {
  if (!leg || leg._err) return { available: false, dir: 'NEUTRO', signal: false, confStrength: 0, note: 'ponte :5151 offline (NT8 fechado?)' };
  const me = numOrNull(leg.me), mvi = numOrNull(leg.mvi);
  const meC = leg.meComb != null ? numOrNull(leg.meComb) : me;   // combinado tem fallback do Vector
  const mviC = leg.mviComb != null ? numOrNull(leg.mviComb) : mvi;
  const sMe = sgn(meC), sMvi = sgn(mviC);
  const agree = sMe !== 0 && sMe === sMvi;                        // ME e MVI concordam na MESMA direção
  const dir = agree ? dirWord(sMe) : (sMe !== 0 ? dirWord(sMe) : 'NEUTRO');
  const confStrength = (sMe !== 0 ? 1 : 0) + (sMvi !== 0 ? 1 : 0); // 0..2 por ativo
  return { available: true, me, mvi, meComb: meC, mviComb: mviC, dir, agree, signal: agree, confStrength };
}

// #21 — FLOW GC: confluência auxiliar GC×SI (perna de TAPE do :5151.auxGcSi + perna de HIRO
// GLD/SLV do marketContext). NUNCA operada — display/contexto (decisão do operador). "FORTE" só
// com tape E HIRO alinhados nos DOIS metais na MESMA direção. GC/SI não entram no gate/stack.
// Degrada gracioso pré-F5 (o :5151 vivo ainda não expõe auxGcSi → strength '—').
function buildFlowGc(ao, mc) {
  const aoOk = ao && !ao._err;
  const aux = (aoOk && ao.auxGcSi) ? ao.auxGcSi : null;
  const tapeSg = aux ? sgn(aux.dir) : 0;
  const gcH = (mc && mc.GC && mc.GC.hiro) ? mc.GC.hiro.dir : 'N/A';
  const siH = (mc && mc.SI && mc.SI.hiro) ? mc.SI.hiro.dir : 'N/A';
  const hSg = (d) => d === 'COMPRADOR' ? 1 : d === 'VENDEDOR' ? -1 : 0;
  const hiroSg = (hSg(gcH) !== 0 && hSg(gcH) === hSg(siH)) ? hSg(gcH) : 0;
  const tapeAgree = tapeSg !== 0, hiroAgree = hiroSg !== 0;
  let strength, dir;
  if (tapeAgree && hiroAgree && tapeSg === hiroSg) { strength = 'FORTE'; dir = dirWord(tapeSg); }
  else if (tapeAgree && hiroAgree) { strength = 'DIVERGENTE'; dir = 'NEUTRO'; }
  else if (tapeAgree || hiroAgree) { strength = 'FRACA'; dir = dirWord(tapeSg || hiroSg); }
  else { strength = '—'; dir = 'NEUTRO'; }
  return {
    strength, dir,
    tape: { dir: dirWord(tapeSg), strength: aux ? (aux.strength || 0) : 0, agree: tapeAgree },
    hiro: { gc: gcH, si: siH, agree: hiroAgree },
    _note: 'confluência auxiliar GC×SI — contexto, NUNCA operada. FORTE = tape (GC×SI) e HIRO (GLD/SLV) alinhados na mesma direção.',
  };
}

// #21 — FLOW RUSSELL: autorização visual do RTY ("carona" gated ES×NQ). MANUAL (não Strategy).
// RTY autorizado = leg RTY tem sinal (ME∧MVI concordam) E == direção da âncora ES×NQ E pregão (P2) aberto.
function buildFlowRussell(ao, rth, mc) {
  const aoOk = ao && !ao._err;
  const c1 = c1FromLeg(aoOk ? ao.rty : null);
  const anchorSg = (aoOk && ao.anchor) ? sgn(ao.anchor.dir) : 0;
  const rtySg = c1.signal ? (c1.dir === 'LONG' ? 1 : c1.dir === 'SHORT' ? -1 : 0) : 0;
  const aligned = rtySg !== 0 && rtySg === anchorSg;
  const authorized = aligned && !!rth;
  let reason;
  if (!c1.available) reason = 'ponte :5151 offline (gráfico RTY sem Nexus+Pulse?)';
  else if (!rth) reason = 'fora do pregão de opções US — RTY aguarda janela';
  else if (rtySg === 0) reason = 'tape RTY sem confluência (ME∧MVI)';
  else if (!aligned) reason = 'RTY ≠ âncora ES×NQ — aguarda alinhamento';
  else reason = 'RTY alinhado com a âncora ES×NQ no pregão';
  return {
    authorized, dir: authorized ? c1.dir : 'NEUTRO',
    rty: c1, anchor: { dir: dirWord(anchorSg) },
    hiro: (mc && mc.RTY && mc.RTY.hiro) ? mc.RTY.hiro : null,
    reason,
    _note: 'autorização visual (manual) — NÃO executa ordem. Fora do simulador/histórico (só ES/NQ).',
  };
}

// ── FLOW GC·SI (2026-10-12) — radar e confluência GC×SI POR ATIVO, espelho da lógica do FLOW ES·NQ ──────────
// ADITIVO e ISOLADO: chave nova `flowGcSi` no /state. NUNCA operado (display/contexto). Não lê nem escreve
// gate / confluence / v2 / sim / flowGc / flowRussell. Reusa as MESMAS funções do ES·NQ — c1FromLeg (TAPE),
// hiroConfirm (HIRO) e convOfSym (convicção) — e repete os passos 1–3 do AoGate.EsNq (AlfaOmegaSharedState.cs)
// sobre as pernas `gc`/`si` do :5151, com o MESMO freshSec publicado em gateParams e a MESMA regra de tapeLive
// (preço mudou nos últimos 15 s). O que NÃO existe para ouro/prata sai UNAVAILABLE com o motivo; nada é inventado:
//   passo 4 (força, AoForcaJanela)        → sem publicador para GC/SI ⇒ não aplicado, declarado em gate.forceStep;
//   MULTI (charm/vol/vanna do GexBot)     → o vendor só publica ES e NQ;
//   EDGE / Tier (consolidator :3495)      → só ES e NQ;
//   HIRO                                  → SpotGamma GLD/SLV = ETF, PROXY do futuro (rotulado em c2.proxy).
// Enquanto o :5151 em execução não publicar `gc`/`si` (ponte anterior), tudo sai state='UNAVAILABLE'.
const GCSI_PRICE_LIVE_MS = 15000;    // = AlfaOmegaBridge.cs (tapeLive)
const GCSI_FRESH_SEC_DEFAULT = 90;   // = AoGate.DefaultFreshSec; só vale se o :5151 não publicar gateParams.freshSec
const GCSI_NO_MULTI = 'sem fonte: o GexBot/OPRA só publica ES e NQ (charm/vol/vanna de ouro/prata não existem)';
const GCSI_NO_EDGE = 'sem fonte: o consolidator :3495 (Tier/confiança) só cobre ES e NQ';
const GCSI_NO_FORCE = 'etapa de força não aplicada: AoForcaJanela (passo 4 do AoGate.EsNq) só tem publicador para ES e NQ';
function buildFlowGcSi(ao, hGLD, hSLV) {
  const online = !!(ao && !ao._err);
  const hasLegs = !!(online && ao.gc && ao.si);
  const fsPub = (online && ao.gateParams) ? numOrNull(ao.gateParams.freshSec) : null;
  const freshSec = (fsPub != null && fsPub > 0) ? fsPub : GCSI_FRESH_SEC_DEFAULT;
  const bridgeTs = online ? numOrNull(ao.ts) : null;
  const semPerna = (sym) => !online ? 'ponte :5151 offline (NT8 fechado?)' : 'a ponte :5151 em execução ainda não publica a perna ' + sym + ' (recarga do NT8 pendente)';
  const mkLeg = (sym, etf, name, leg, hiro) => {
    const src = hasLegs ? leg : null;
    const c1 = c1FromLeg(src);                                     // MESMA Camada 1 do ES·NQ
    if (!c1.available) c1.note = semPerna(sym);
    const sg = hiroConfirm(c1.dir, hiro);                          // MESMA regra de HIRO do ES (Net $ dos últimos 5 min)
    const c2 = { spotgamma: sg, opra: 'N/A', confirm: (sg && sg.confirm) || 'N/A', proxy: etf,
      proxyNote: 'HIRO de ' + etf + ' (ETF) — proxy do futuro ' + sym + ', não é o futuro' };
    const c3 = { available: false, note: GCSI_NO_MULTI };
    const ageMs = src ? numOrNull(src.ageMs) : null, priceAgeMs = src ? numOrNull(src.priceAgeMs) : null;
    const fresh = ageMs != null && ageMs < freshSec * 1000;        // passo 1 do AoGate (frescor do TAPE)
    const priceLive = priceAgeMs != null && priceAgeMs < GCSI_PRICE_LIVE_MS;
    const me = src ? (numOrNull(src.me) || 0) : 0, mvi = src ? (numOrNull(src.mvi) || 0) : 0;
    const rawDir = (me !== 0 && me === mvi) ? sgn(me) : 0;         // passo 2 do AoGate (campos crus, como no NT8)
    return {
      instrument: sym, name, state: !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : !fresh ? 'STALE' : 'LIVE',
      dir: c1.dir, rawDir, me, mvi, lastPrice: src ? spotOrNull(src.lastPrice) : null,
      press: src ? numOrNull(src.press) : null, ageMs, priceAgeMs, fresh, priceLive,
      sourceTs: (bridgeTs != null && ageMs != null && ageMs < 86400000) ? new Date(bridgeTs - ageMs).toISOString() : null,
      c1, c2, c3, conv: convOfSym(c1, c2, c3),                     // MESMA convicção do ES·NQ
      edge: { available: false, note: GCSI_NO_EDGE },
    };
  };
  const gc = mkLeg('GC', 'GLD', 'Gold Futures', online ? ao.gc : null, hGLD);
  const si = mkLeg('SI', 'SLV', 'Silver Futures', online ? ao.si : null, hSLV);
  // Radar do par — passos 1–3 do AoGate.EsNq aplicados a GC/SI; termômetro idêntico (|soma dos 4 ME/MVI|, teto 4).
  let strength = null, why = null, dir = 'NEUTRO', ready = false, tapeLive = false, pAgeMin = Infinity;
  if (hasLegs) {
    strength = Math.min(4, Math.abs(gc.me + gc.mvi + si.me + si.mvi));
    ready = gc.lastPrice != null || si.lastPrice != null;
    pAgeMin = Math.min(gc.priceAgeMs != null ? gc.priceAgeMs : Infinity, si.priceAgeMs != null ? si.priceAgeMs : Infinity);
    tapeLive = ready && pAgeMin < GCSI_PRICE_LIVE_MS;
    if (!gc.fresh || !si.fresh) why = (!gc.fresh && !si.fresh) ? 'sem tape GC/SI' : (!gc.fresh ? 'sem tape GC' : 'sem tape SI');
    else if (gc.rawDir === 0 || si.rawDir === 0) why = (gc.rawDir === 0 && si.rawDir === 0) ? 'GC e SI indefinidos' : (gc.rawDir === 0 ? 'GC indefinido' : 'SI indefinido');
    else if (gc.rawDir !== si.rawDir) why = 'GC x SI divergentes';
    else dir = dirWord(gc.rawDir);
  }
  const temDirecao = (dir === 'LONG' || dir === 'SHORT');
  const open = !!(hasLegs && ready && tapeLive && strength === 4 && temDirecao);
  const state = !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : open ? 'OPEN' : 'CLOSED';
  const pAgeTxt = isFinite(pAgeMin) ? (pAgeMin >= 60000 ? Math.round(pAgeMin / 60000) + 'min' : Math.round(pAgeMin / 1000) + 's') : '?';
  let reason;
  if (!online) reason = 'Ponte Alfa Omega :5151 fora do ar (NT8 fechado ou bridge down). Radar GC·SI sem dado.';
  else if (!hasLegs) reason = 'A ponte :5151 em execução ainda não publica as pernas individuais de GC e SI (recarga do NT8 pendente). Radar GC·SI indisponível — nenhum valor é inventado.';
  else if (why && why.indexOf('sem tape') === 0) reason = 'Radar GC+SI sem dado vivo — ' + why + ' (sem evento de tape há mais de ' + freshSec + 's: falta FlowOne no gráfico ou o mercado está parado).';
  else if (!tapeLive) reason = 'Tape GC/SI sem atualização de preço há ' + pAgeTxt + ' (tapeLive exige <15s) — o radar não valida.';
  else if (!temDirecao) reason = 'Radar GC+SI incompleto (' + strength + '/4)' + (why ? ' — ' + why + '.' : '.');
  else reason = 'Radar formado 4/4 · tape ao vivo · direção ' + dir + '. Passos 1–3 do gate confirmados; ' + GCSI_NO_FORCE + '. Contexto — nunca operado.';
  // Confluência do par — MESMA regra do buildV2Stack (ES×NQ).
  const agree = gc.c1.signal && si.c1.signal && gc.c1.dir === si.c1.dir && gc.c1.dir !== 'NEUTRO';
  const bothMax = gc.conv.level === 'MAXIMA' && si.conv.level === 'MAXIMA';
  const aux = (online && ao.auxGcSi) ? { dir: dirWord(sgn(ao.auxGcSi.dir)), strength: numOrNull(ao.auxGcSi.strength) } : null;
  return {
    schema: 'aot-flow-gcsi/1', asof: new Date().toISOString(), operated: false, available: hasLegs,
    gate: { source: 'alfaomega', role: 'radar GC+SI (mercado futuro real) — contexto, nunca operado', online, ready, tapeLive, strength,
      anchor: { dir, strength, why }, open, state, dir, reason, why,
      forceStep: { applied: false, status: 'UNAVAILABLE', note: GCSI_NO_FORCE } },
    gc, si,
    confluence: { agree, live: gc.state === 'LIVE' && si.state === 'LIVE', dir: agree ? gc.c1.dir : 'NEUTRO', level: agree ? (bothMax ? 'MAXIMA' : 'CONFIRMADA') : '—',
      note: agree ? 'GC e SI imprimindo tape na mesma direção — reforço cross-asset' : 'trilhas independentes (sem confluência dupla)' },
    auxNt8: aux,
    params: { freshSec, freshSecSource: (fsPub != null && fsPub > 0) ? 'ponte :5151 gateParams.freshSec' : 'padrão AoGate.DefaultFreshSec',
      priceLiveMs: GCSI_PRICE_LIVE_MS, tape: 'c1FromLeg (ME∧MVI)', hiro: 'hiroConfirm (Net $ 5 min) sobre GLD/SLV (ETF proxy)',
      conviction: 'convOfSym', pair: 'regra do buildV2Stack', gateSteps: 'AoGate.EsNq passos 1–3', forceStep: 'UNAVAILABLE', multi: 'UNAVAILABLE', edge: 'UNAVAILABLE' },
    _note: 'FLOW GC·SI — mesma lógica do FLOW ES·NQ aplicada às pernas gc/si do :5151. Contexto, NUNCA operado. Convicção máxima alcançável = CONFIRMADA (MULTI sem fonte). HIRO = ETF (GLD/SLV), proxy.',
  };
}

// Confluência ES×NQ com FONTE por horário (P2 / Camada 1). Extraída p/ TESTE ISOLADO.
//   rth (pregão de OPÇÕES US 09:30–16:00 ET) → stack completo (consolidator, mistura as camadas).
//   fora do pregão → SÓ tape ES∧NQ (c1FromLeg do :5151) + tapeLive obrigatório; ignora C2/C3.
//   NT8 fechado / preço parado → "AGUARDANDO TAPE" explícito (nunca mudo sem explicação).
function computeConfluence(rth, ao, cES, cNQ) {
  // ── UNIFICAÇÃO 2026-08-19 (A2) — um critério só, nos dois horários ───────────────────────
  // ANTES esta função media DUAS COISAS DIFERENTES conforme a hora:
  //   • em RTH  → concordância das DIREÇÕES DO CONSOLIDATOR (Tier 0)
  //   • fora    → `ao.anchor.dir` (o gate ES×NQ do NT8)
  // São perguntas distintas. O Tier 0 já embute o corte MenthorQ/QuantData e o limiar de
  // confiança — então em pregão o rótulo virava 'SEM CONFLUÊNCIA' mesmo com ES e NQ
  // perfeitamente alinhados no tape, e sem dizer por quê (o `why` só existia no ramo de fora
  // do pregão). Era a origem do 'NEUTRO permanente' que o operador via justamente no horário
  // que importa.
  // AGORA: `confluence` responde SEMPRE a mesma pergunta — "ES e NQ concordam no tape,
  // com força e frescor?" — que é exatamente o que `anchor` já decide, com os mesmos limiares
  // que o operador configura no FlowOne. O veredito EMITÍVEL continua sendo do Tier 0
  // (consolidator), que soma estrutura e impulso; ele não foi tocado.
  // ⚠️ MUDANÇA SEMÂNTICA: em RTH, `confluence.es`/`.nq` passam a ser a direção do TAPE por
  //    símbolo (c1FromLeg), não mais a direção do consolidator. `mode` continua distinguindo
  //    a sessão para quem precisar do contexto.
  const aoOk = ao && !ao._err;
  const tapeLive = aoOk && !!ao.tapeLive;
  const c1ES = c1FromLeg(aoOk ? ao.es : null);
  const c1NQ = c1FromLeg(aoOk ? ao.nq : null);
  // Gate ES×NQ (força mínima + frescor do TAPE, não do preço) já vem PRONTO em `ao.anchor`:
  // é o mesmo AoGate.EsNq() que o NT8 roda (Bridge chama-o ao montar /state), com os MESMOS
  // limiares que o operador configura na Property do FlowOne (EsNqMinForce/EsNqFreshSec) —
  // `anchor.dir` já sai fail-closed (0) se força ou frescor não passarem. NÃO reimplementar
  // aqui: a versão antiga (c1ES/c1NQ crus + só tapeLive de preço<15s) ignorava a força mínima
  // e usava frescor de PREÇO em vez do frescor do TAPE (Xs configurado no NT8) — foi a causa
  // real da dessincronia Gate ES×NQ reportada 2026-07-31 entre o NT8 e a confluência fora do
  // pregão do AOT. c1ES/c1NQ seguem servindo só de DISPLAY (direção por símbolo na tela).
  const anchor = aoOk ? ao.anchor : null;
  const gateOk = !!(anchor && anchor.dir);
  const confirmed = gateOk && tapeLive;
  let lbl, col;
  if (!aoOk)          { lbl = 'AGUARDANDO TAPE (NT8 fechado)';         col = 'neutral'; }
  else if (!tapeLive) { lbl = 'AGUARDANDO TAPE (preço parado)';        col = 'neutral'; }
  else if (confirmed) { lbl = anchor.dir > 0 ? 'CONFLUÊNCIA COMPRA (tape)' : 'CONFLUÊNCIA VENDA (tape)';
                        col = anchor.dir > 0 ? 'long' : 'short'; }
  else                { lbl = 'SEM CONFLUÊNCIA (' + (anchor && anchor.why ? anchor.why : 'gate ES×NQ não confirmado') + ')'; col = 'neutral'; }
  return { es: c1ES.dir, nq: c1NQ.dir, label: lbl, color: col, mode: rth ? 'pregao-tape' : 'offhours-tape', tapeLive, confirmed, why: (anchor && anchor.why) ? anchor.why : null };
}

// CAMADA 2 — HIRO como CONFIRMAÇÃO da direção do tape (C1).
//   ES e NQ: SÓ HIRO Darkflow (DEX-flow GammaGex, hiro_es / hiro_nq) — ver hiroConfirmGate.
//   SpotGamma HIRO NÃO entra no Gate (13/10/2026); a chave `spotgamma` fica N/A só p/ manter o contrato.
function confirmVs(dir, flowVal) {
  const sO = sgn(flowVal), sD = dir === 'LONG' ? 1 : dir === 'SHORT' ? -1 : 0;
  if (flowVal == null) return 'N/A';
  if (sD === 0) return 'NEUTRO';
  return sO === sD ? 'CONFIRMA' : (sO === 0 ? 'NEUTRO' : 'DIVERGE');
}
function c2ForSym(sym, c1dir, flowHiro, rth) {
  const lc = sym.toLowerCase();
  const d = hiroDarkflow.hiroConfirmDarkflow(c1dir, sym, flowHiro, Date.now(), { rth: rth === true });
  const ok = d.confirm !== 'N/A';
  const opraDir = flowHiro ? (flowHiro['direction_' + lc] || null) : null;
  const opra = ok ? { value: d.value, dir: opraDir, confirm: d.confirm } : 'N/A';
  // SpotGamma fora do HIRO do Gate: N/A fixo, no MESMO formato de antes (objeto no ES, texto no NQ).
  const sg = sym === 'ES' ? { confirm: 'N/A', reason: 'não usado no Gate (HIRO = Darkflow)' } : 'N/A';
  return { spotgamma: sg, opra, confirm: ok ? d.confirm : 'N/A',
    hiro: { source: d.source, reason: ok ? null : d.reason, vendorAgeMs: d.vendorAgeMs == null ? null : d.vendorAgeMs } };
}

// CAMADA 3 — charm + vol + vanna (OPRA, ambos ES e NQ). Alinhamento vs a direção do tape.
// Cada greve dá um voto direcional (regime-aware); aligned = todos concordam com C1.
function c3ForSym(sym, c1dir, gexInst) {
  const regime = gexContext(sym, gexInst);          // reusa o Tier 2 já existente
  if (!regime) return { available: false, note: 'GexBot/OPRA offline' };
  const sD = c1dir === 'LONG' ? 1 : c1dir === 'SHORT' ? -1 : 0;
  const neg = regime.gamma_condition === 'NEGATIVE';
  // votos direcionais (regime-aware I1: em gama NEG o sinal do fluxo inverte)
  const volVote = (() => { const s = sgn(regime.net_gex_0dte); return neg ? -s : s; })();     // vol/gamma
  const charmVote = sgn(regime.charm && regime.charm.value);                                   // drift
  const vannaVote = (() => { const s = sgn(regime.vanna && regime.vanna.value); return neg ? -s : s; })();
  const votes = { vol: volVote, charm: charmVote, vanna: vannaVote };
  const aligned = sD !== 0 && volVote === sD && charmVote === sD && vannaVote === sD;
  const alignedCount = [volVote, charmVote, vannaVote].filter(v => v !== 0 && v === sD).length; // 0..3
  return {
    available: true, aligned, alignedCount, votes,
    vanna: regime.vanna, charm: regime.charm, regime_vega: regime.regime_vega,
    gamma_condition: regime.gamma_condition, net_gex_0dte: regime.net_gex_0dte,
  };
}

// Convicção por ativo: escalona C1 (base) → C2 (confirma) → C3 (empilha).
function convOfSym(c1, c2, c3) {
  if (!c1.signal || c1.dir === 'NEUTRO') return { level: '—', reason: 'sem sinal de tape (C1)' };
  if (c2.confirm === 'DIVERGE') return { level: 'REBAIXADA', reason: 'HIRO diverge do tape' };
  const confirmed = c2.confirm === 'CONFIRMA';
  const stacked = c3.available && c3.aligned;
  if (confirmed && stacked) return { level: 'MAXIMA', reason: 'tape + HIRO + charm/vol/vanna alinhados' };
  if (confirmed) return { level: 'CONFIRMADA', reason: 'tape confirmado por HIRO' };
  return { level: 'BASE', reason: 'sinal de tape válido (sozinho)' };
}

// Monta o bloco v2 completo: es/nq paralelos + confluência DERIVADA da comparação.
function buildV2Stack(ao, gexInst, hES, flowHiro, rth) {   // hES: mantido na assinatura, NÃO usado no C2
  const build = (sym, leg, gInst) => {
    const c1 = c1FromLeg(leg);
    const c2 = c2ForSym(sym, c1.dir, flowHiro, rth);
    const c3 = c3ForSym(sym, c1.dir, gInst);
    return { c1, c2, c3, conv: convOfSym(c1, c2, c3) };
  };
  const es = build('ES', ao && !ao._err ? ao.es : null, gexInst.ES);
  const nq = build('NQ', ao && !ao._err ? ao.nq : null, gexInst.NQ);
  // Confluência ES×NQ — DERIVADA (não fundida na fonte): os dois tapes concordando.
  const agree = es.c1.signal && nq.c1.signal && es.c1.dir === nq.c1.dir && es.c1.dir !== 'NEUTRO';
  const bothMax = es.conv.level === 'MAXIMA' && nq.conv.level === 'MAXIMA';
  const confluence = {
    agree, dir: agree ? es.c1.dir : 'NEUTRO',
    level: agree ? (bothMax ? 'MAXIMA' : 'CONFIRMADA') : '—',
    note: agree ? 'ES e NQ imprimindo tape na mesma direção — reforço cross-asset' : 'trilhas independentes (sem confluência dupla)',
  };
  return { schema: 'aot-stack/2', note: 'v0 heurístico — calibrar thresholds/alinhamento em RTH', es, nq, confluence };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFLUÊNCIA ADICIONAL (2026-09-11) — HIRO Flow + Options Sweep · SOMENTE LEITURA
// Determinação do operador [OPERADOR]: os dois NÃO entram na convicção, NÃO geram direção,
// NÃO geram BUY/SELL, NÃO aumentam/reduzem/invertem nada. O bloco fica A JUSANTE do
// convOfSym: LÊ c1.dir e conv.level já calculados; não escreve em v2, C1, C2, C3 nem conv.
// Por isso vive em STATE.confluenciaAdicional (FORA do objeto v2): o v2 sai byte-idêntico.
//   Regra:        skills/gamma-methodology/references/confluencia-adicional-aot.md
//   Arquitetura:  Desktop/Handof TTW/DECISAO_CONFLUENCIA_ADICIONAL_AOT_20260911.md
//
// Nesta fase o bloco expõe só FATOS (último evento, hora, idade, lado do próprio evento).
// NÃO calcula "a favor/contra" da direção — vocabulário, I1 e validade temporal estão
// pendentes do operador, e a skill trata isto como confluência MANUAL (hiro-walls-flow.md §3).
//
// Estados por perna — I4, nunca fundir:
//   'evento'        há evento na janela
//   'sem_evento'    fonte OK e lista vazia — resposta VÁLIDA, não é falha
//   'indisponivel'  fonte com erro, ou janela da fonte fora do instante efetivo
//   'na'            o ativo não tem fonte (NQ: vendor sem alerta p/ Nasdaq; fita só SPX)
//
// CAUSAL: todo evento com ts > agora efetivo é descartado. Em replay, /alerts?date= devolve a
// sessão inteira e /options?date= devolve o FIM do dia — sem este corte haveria look-ahead,
// o mesmo defeito que o W3 (fromReplay, 'at' = instante simulado) existe para impedir.
// ═══════════════════════════════════════════════════════════════════════════════

// Sweeps com lado — regra JÁ EXISTENTE do AlfaOmegaOptionsFlowHiro.cs (NT8), sem nada novo:
//   lado §BH: call comprada → +, put comprada → −, venda → sem lado (não vira marcador);
//   FlowMinPremium default 0 (sem filtro de prêmio) · prêmio 0 → d = 0 → fora (isSw && d != 0);
//   dedup POR SEGUNDO mantendo o maior prêmio (perTsSweep do NT8).
// FONTE OFICIAL DO SWEEP (2026-09-11): /flow/SPX?type=sweep — o filtro SERVER-SIDE do vendor
// (tns_feed is_sweep=true) que o :3500 captura. NÃO é mais o /options: lá o `is_sweep` vinha do
// decode de bitmask e media 0 em 51 arquivos de acumulador (20/07→11/09).
// O resto da regra é a JÁ EXISTENTE do AlfaOmegaOptionsFlowHiro.cs (NT8), sem nada novo:
//   lado §BH: call comprada → +, put comprada → −, venda → sem lado (não vira marcador);
//   sem filtro de prêmio (o FlowMinPremium do NT8 é 0) · prêmio 0 → sem lado;
//   dedup POR SEGUNDO mantendo o maior prêmio (perTsSweep do NT8).
function caExtractSweeps(eventos, nowMs) {
  const out = { eventos: [], janela: { deTs: null, ateTs: null, eventos: 0, recebidos: Array.isArray(eventos) ? eventos.length : 0 } };
  if (!Array.isArray(eventos) || !eventos.length) return out;
  const porSeg = new Map();
  for (const e of eventos) {
    const ts = numOrNull(e && e.ts);
    if (ts == null || ts <= 0 || ts > nowMs) continue;                       // causal (W3)
    const j = out.janela; j.eventos++;
    if (j.deTs == null || ts < j.deTs) j.deTs = ts;
    if (j.ateTs == null || ts > j.ateTs) j.ateTs = ts;
    if (e.buySell !== 'BUY' || (e.cp !== 'C' && e.cp !== 'P')) continue;     // §BH: sem lado → fora
    const premio = Math.abs(numOrNull(e.premium) || 0);
    if (!(premio > 0)) continue;
    const seg = Math.floor(ts / 1000), ex = porSeg.get(seg);
    if (!ex || premio > ex.premio) porSeg.set(seg, {
      ts, cp: e.cp, lado: e.cp === 'C' ? 'call comprada' : 'put comprada',
      strike: numOrNull(e.strike), premio: r2(premio),
    });
  }
  out.eventos = [...porSeg.values()].sort((a, b) => a.ts - b.ts);
  return out;
}

function caHiroFlowLeg(resp, nowMs) {
  const base = { unidade: 'delta$ de hedge', fonte: 'SpotGamma /v1/alerts · :3500 /alerts/SPX' };
  if (!resp || resp._err) return Object.assign(base, { estado: 'indisponivel', why: ':3500 /alerts indisponível' + (resp && resp._err ? ' (' + resp._err + ')' : ''), ultimo: null, eventos: [] });
  if (!Array.isArray(resp.events)) return Object.assign(base, { estado: 'indisponivel', why: 'resposta do /alerts sem lista de eventos', ultimo: null, eventos: [] });
  const eventos = resp.events
    .filter(e => e && (e.category === 8 || e.category === 4) && isFinite(e.ts) && e.ts > 0 && e.ts <= nowMs)   // só o evento HIRO Flow · causal
    .map(e => ({ ts: e.ts, label: e.category === 8 ? 'FLOW +' : 'FLOW -', category: e.category, cumulDelta: numOrNull(e.cumulDelta), id: e.id != null ? String(e.id) : null }))
    .sort((a, b) => a.ts - b.ts);
  const u = eventos.length ? eventos[eventos.length - 1] : null;
  return Object.assign(base, {
    estado: u ? 'evento' : 'sem_evento',
    why: u ? null : 'nenhum evento HIRO Flow publicado pelo vendor nesta sessão até agora',
    sessao: resp.date || null, vendorKey: resp.vendorKey || null,
    ultimo: u ? Object.assign({}, u, { idadeS: Math.round((nowMs - u.ts) / 1000) }) : null,
    eventos,
  });
}

function caSweepLeg(sw, optErr, nowMs) {
  const base = { unidade: 'prêmio', fonte: ':3500 /flow/SPX?type=sweep (filtro do vendor) · lado pela regra §BH' };
  if (optErr || !sw) return Object.assign(base, { estado: 'indisponivel', why: ':3500 /flow/SPX?type=sweep indisponível' + (optErr ? ' (' + optErr + ')' : ''), ultimo: null, eventos: [], janela: null });
  const j = sw.janela;
  // A fonte respondeu com trades, mas NENHUM cabe no instante efetivo: a janela dela é posterior
  // (replay no meio do dia × /options?date= = fim do dia). Isso é indisponibilidade, não "sem evento".
  if (j.recebidos > 0 && j.eventos === 0) return Object.assign(base, { estado: 'indisponivel', why: 'todos os sweeps da fonte são posteriores ao instante efetivo (replay) — sem evento para este instante', ultimo: null, eventos: [], janela: j });
  const u = sw.eventos.length ? sw.eventos[sw.eventos.length - 1] : null;
  return Object.assign(base, {
    estado: u ? 'evento' : 'sem_evento',
    why: u ? null : (!j.eventos ? 'nenhum sweep publicado pelo vendor nesta sessão até agora'
      : 'nenhum dos ' + j.eventos + ' sweeps da sessão tem lado §BH (todos venda)'),
    ultimo: u ? Object.assign({}, u, { idadeS: Math.round((nowMs - u.ts) / 1000) }) : null,
    eventos: sw.eventos, janela: j,
  });
}

// Monta o bloco a partir do v2 JÁ CALCULADO. Não recebe, não devolve e não altera nada do v2:
// só copia c1.dir e conv.level (primitivos) para a 'referencia'.
function buildConfluenciaAdicional(v2, alertsResp, sweeps, optErr, nowMs) {
  const hf = caHiroFlowLeg(alertsResp, nowMs);
  const sp = caSweepLeg(sweeps, optErr, nowMs);
  const naLeg = (leg, why) => ({ unidade: leg.unidade, fonte: leg.fonte, estado: 'na', why, ultimo: null, eventos: [] });
  const v2ok = !!(v2 && !v2._err);
  const porAtivo = (leg, hiroFlow, sweep) => {
    const lvl = leg && leg.conv ? leg.conv.level : null;
    return {
      referencia: { dir: leg && leg.c1 ? leg.c1.dir : null, conv: lvl },                  // LIDO — nunca escrito
      estado: !leg ? 'sem_v2' : (lvl != null && lvl !== '—' ? 'conviccao_existente' : 'aguardando_conviccao'),
      hiroFlow, sweep,
    };
  };
  return {
    schema: 'aot-confluencia-adicional/1',
    somenteLeitura: true,
    asof: new Date(nowMs).toISOString(),
    es: porAtivo(v2ok ? v2.es : null, hf, sp),
    nq: porAtivo(v2ok ? v2.nq : null,
      naLeg(hf, 'sem fonte para NQ — o vendor não publica HIRO Flow para Nasdaq'),
      naLeg(sp, 'sem fonte para NQ — a fita de opções capturada é só SPX')),
    _note: 'contexto a jusante da convicção — não entra no cálculo, não gera direção. Fatos do evento; a leitura contra a direção é manual.',
  };
}

// ── TRACE CLOUD → resumo NARRÁVEL (não a matriz) ─────────────────────────────
// O /cloud do :3500 devolve a grade (55-207 KB). Jogar isso no /state seria absurdo:
// o narrador polla a cada 5s e o frontend a cada 10s. Aqui o BFF DERIVA ~10 números —
// o que dá pra NARRAR — e só isso entra no /state.
//
// O que importa para narrar (e para ANTECIPAR):
//   · banda (lo/hi) = a zona onde a massa de gamma vive → "zona de pin"
//   · largura e se está ABRINDO ou FECHANDO → compressão = risco de rompimento
//   · onde o spot está: dentro / na borda / fora → o gatilho antecipatório
//   · net (soma BRUTA) = a exposição FÍSICA: "trava ou vai"
// ⚠️ Sem inventar: se o /cloud falhar, o campo vem null — o narrador cala sobre isso.
function bandOfRow(y, row, pct) {
  if (!Array.isArray(y) || !Array.isArray(row)) return null;
  let total = 0;
  for (const v of row) total += Math.abs(v || 0);
  if (total <= 0) return null;
  const idx = row.map((v, j) => j).filter(j => row[j]);
  idx.sort((a, b) => Math.abs(row[b]) - Math.abs(row[a]));
  const want = total * (pct / 100), lim = { lo: Infinity, hi: -Infinity };
  let acc = 0;
  for (const j of idx) {
    acc += Math.abs(row[j]);
    if (y[j] < lim.lo) lim.lo = y[j];
    if (y[j] > lim.hi) lim.hi = y[j];
    if (acc >= want) break;
  }
  return lim.lo <= lim.hi ? lim : null;
}

function cloudSummary(cloud, spot) {
  if (!cloud || cloud._err || !Array.isArray(cloud.t) || !Array.isArray(cloud.y)) return null;
  const z = cloud.z;
  if (!Array.isArray(z) || z.length === 0) return null;          // modo AOT (dict) não entra aqui
  const last = z.length - 1, prev = Math.max(0, z.length - 6);   // ~5 fatias atrás p/ a tendência
  const bNow = bandOfRow(cloud.y, z[last], 68);
  const bPrev = bandOfRow(cloud.y, z[prev], 68);
  if (!bNow) return null;

  const width = r2(bNow.hi - bNow.lo);
  const wPrev = bPrev ? (bPrev.hi - bPrev.lo) : null;
  // ⭐ o sinal ANTECIPATÓRIO: banda fechando = compressão; abrindo = expansão
  const trend = (wPrev == null || wPrev <= 0) ? null
    : (width < wPrev * 0.9 ? 'FECHANDO' : width > wPrev * 1.1 ? 'ABRINDO' : 'ESTÁVEL');

  // exposição física líquida da fatia atual (soma BRUTA = "trava ou vai")
  let net = 0; for (const v of z[last]) net += (v || 0);

  let where = null, distEdge = null;
  if (spot != null && isFinite(spot)) {
    if (spot < bNow.lo) { where = 'ABAIXO'; distEdge = r2(bNow.lo - spot); }
    else if (spot > bNow.hi) { where = 'ACIMA'; distEdge = r2(spot - bNow.hi); }
    else {
      where = 'DENTRO';
      distEdge = r2(Math.min(spot - bNow.lo, bNow.hi - spot));   // distância da borda mais próxima
    }
  }
  return {
    axisY: cloud.axisY, metric: cloud.metric, participant: cloud.participant,
    band: { lo: r2(bNow.lo), hi: r2(bNow.hi), width, trend },
    spot: r2(spot), where, distToEdge: distEdge,
    net: r2(net), netDir: net > 0 ? 'POSITIVO' : net < 0 ? 'NEGATIVO' : 'NEUTRO',
    asof: cloud.date || null,
    _note: cloud.axisY === 'strike_real'
      ? 'banda = faixa de STRIKE que concentra 68% da massa de |gamma| (zona de pin).'
      : 'banda em SPOT HIPOTÉTICO (exposição SE o preço estivesse ali) — não é strike.',
  };
}

// ── marketContext (Notas Fase 1 · C2 · 2026-07-20) — MAPA ESTRUTURAL mecânico ──
// Consolida, numérico, o que a nota do vendor mostra como IMAGEM: HIRO (dir/regime
// recente) por símbolo + walls (keyLevels, onde existem: ES/NQ). Fonte = feeds JÁ
// capturados + os HIRO novos NDX/RUT/GLD/SLV/VIX (Frente 3). DISPLAY-ONLY: NÃO é
// gatilho do narrador (a significance engine não o compara). Candle HIRO = [ts,f1,f2,
// f3,f4,count]; índice 4 = net HIRO $ (doc hiro-walls-flow.md). dir = sinal do Σ recente.
function hiroRead(h) {
  if (!h || h._err || !Array.isArray(h.tail) || !h.tail.length) return null;
  let cum = 0, last = null;
  for (const c of h.tail) { if (Array.isArray(c) && c.length >= 5) { const v = numOrNull(c[4]); if (v != null) { cum += v; last = v; } } }
  return { last: r2(last), cumTail: r2(cum), dir: cum > 0 ? 'COMPRADOR' : cum < 0 ? 'VENDEDOR' : 'NEUTRO', window: h.tail.length };
}
function wallsRead(levels) {
  if (!levels || levels._err) return null;
  const fl = levels.futureLevels || levels.indexLevels || null;
  if (!fl) return null;
  return { callWall: r2(numOrNull(fl.callwallstrike)), putWall: r2(numOrNull(fl.putwallstrike)),
    zeroGamma: r2(numOrNull(fl.zero_g_strike)), hedgeWall: r2(numOrNull(fl.max_g_strike)),
    keyGamma: r2(numOrNull(fl.topabs_strike)), scale: levels.futureLevels ? 'future' : 'index' };
}
// Volatility Dashboard (§BU) — rr/gamma_not/implied-move/OI/volume por índice·ETF.
// Vinha do keyLevels JÁ capturado (Processo A) e do .vol que /levels/:sym já calculava —
// só nunca tinha sido lido/exposto. ZERO chamada nova ao vendor. CONTEXTO, não sinal:
// mesma cautela do §BI (deltaDollar/gamma_not não interpretam direção sozinhos).
// Curadoria da série diária (§BW/§BX): só os campos relevantes de contexto/gráfico, por
// dia·símbolo — evita inchar o /state com os ~60 campos brutos do equitiesBySyms × 6 × 20.
// NOMES BRUTOS do vendor mantidos p/ gamma_ratio/delta_ratio (candidatos a "Gamma Tilt" —
// NÃO confirmado por rótulo de UI ainda, ver §BX; não renomear até confirmar de verdade).
function curateEquitiesRow(row) {
  if (!row) return null;
  return {
    upx: numOrNull(row.upx), callWall: numOrNull(row.cws), putWall: numOrNull(row.pws),
    keyGamma: numOrNull(row.keyg), maxGammaStrike: numOrNull(row.maxfs),
    totalDelta: numOrNull(row.totaldelta), gamma_ratio: numOrNull(row.gamma_ratio), delta_ratio: numOrNull(row.delta_ratio),
    putCallRatio: numOrNull(row.put_call_ratio), impliedMove: numOrNull(row.options_implied_move),
  };
}
function buildEquitiesHistory(eqHist) {
  if (!eqHist || eqHist._err || !Array.isArray(eqHist.rows)) return null;
  return {
    days: eqHist.count || eqHist.rows.length,
    series: eqHist.rows.map(r => {
      const out = { date: r.date };
      for (const [sym, row] of Object.entries(r.symbols || {})) {
        if (sym === '_at' || sym === '_date') continue;   // metadata do cache, não é símbolo
        out[sym] = curateEquitiesRow(row);
      }
      return out;
    }),
    _note: 'gamma_ratio/delta_ratio = NOMES BRUTOS do vendor — candidatos a "Gamma Tilt", NÃO confirmado por rótulo de UI (§BX). CONTEXTO, não sinal.',
  };
}
function buildVolatilityDashboard(levelsAll, eqHist) {
  if (!levelsAll || levelsAll._err || !levelsAll.symbols) return null;
  const out = { asof: levelsAll.asof || null };
  for (const [sym, row] of Object.entries(levelsAll.symbols)) {
    const v = row.vol || {};
    out[sym] = {
      tradeDate: row.tradeDate, lastClose: row.lastClose,
      riskReversal25d: numOrNull(v.rr), gammaNotional: numOrNull(v.gamma_not),
      impliedMove1d: numOrNull(v.sig), impliedMove5d: numOrNull(v.sig5),
      callOI: numOrNull(v.calls_OI), putOI: numOrNull(v.puts_OI),
      callVolume: numOrNull(v.calls_vol), putVolume: numOrNull(v.puts_vol),
      putCallOI: numOrNull(v.pc_oi), putCallVolume: numOrNull(v.pc_vol),
      callWall: numOrNull((row.levels || {}).callwallstrike), putWall: numOrNull((row.levels || {}).putwallstrike),
      zeroGamma: numOrNull((row.levels || {}).zero_g_strike), volTrigger: numOrNull((row.levels || {}).max_g_strike),
    };
  }
  out.history = buildEquitiesHistory(eqHist);
  out._note = 'CONTEXTO · display-only · NÃO gatilho do narrador · escala ÍNDICE (não futuro) · rr/gamma_not/gamma_ratio/delta_ratio NÃO interpretam direção sozinhos (§BI)';
  return out;
}
function buildMarketContext(p) {
  const mk = (hiro, walls, note) => { const o = { hiro: hiroRead(hiro), walls: walls || null }; if (note) o._note = note; return o; };
  const wallsFase2 = 'só HIRO (walls via QuantData = fase 2)';
  return {
    asof: new Date().toISOString(),
    ES:  mk(p.hSPX, wallsRead(p.levelsES)),
    NQ:  mk(p.hNDX, wallsRead(p.levelsNQ)),
    GC:  mk(p.hGLD, null, wallsFase2),
    SI:  mk(p.hSLV, null, 'só HIRO'),
    RTY: mk(p.hRUT, null, wallsFase2),
    VIX: mk(p.hVIX, null),
    WTI: mk(p.hWTI, null, 'só HIRO (petróleo/CL — sem walls)'),
    volatilityDashboard: buildVolatilityDashboard(p.levelsAll, p.eqHist),
    _note: 'MAPA ESTRUTURAL mecânico · display-only, NÃO gatilho do narrador · HIRO=Σ janela recente (idx4), walls=keyLevels (ES/NQ) · perfil GEX/net = v1.1',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRAÇÃO DOS NÍVEIS (2026-07-29) — 3ª peça do desenho de integração
// ═══════════════════════════════════════════════════════════════════════════════
// Porte da camada "Migração dos níveis" do AlfaOmegaHiro.cs (ShowLevelTrails), com a
// limitação que o próprio .cs declara na Description RESOLVIDA aqui: lá o rastro é SÓ
// MEMÓRIA (F5, recarga de gráfico ou troca de workspace zeram); aqui a série é
// APPEND-ONLY EM DISCO — o BFF reinicia (e reinicia com frequência) sem perder o dia.
//
// FONTE: /levels/{ES|NQ} do :3500 — keyLevels do SpotGamma (estrutura COMPLETA de
//   expiração).  callwallstrike → Call Wall · zero_g_strike → Zero Gamma ·
//   putwallstrike → Put Wall  (nomes confirmados no payload vivo, não no handoff).
//
// ⚠️ TRÊS FONTES DE "WALL" CONVIVEM NO BFF E NÃO SE MISTURAM:
//    (1) ESTA — /levels/, nível NOMEADO pelo vendor, estrutura completa de expiração;
//    (2) buildStructure() — picos da DISTRIBUIÇÃO por strike do dealer (/grid?participant=dealer);
//    (3) dexGexFlow/tier2_regime — walls do GexBot :3457 (0DTE nomeado).
//    Fundir as três é erro de categoria. Em particular, o pré-registro congelado em
//    .claude/openflow/PRE-REGISTRO-MIGRACAO-WALL.md fixou (2) como fonte do teste de
//    velocidade — esta camada NÃO computa aquele estatístico e NÃO serve de amostra
//    para ele. O que sai daqui é descritivo.
//
// ⚠️ ESCALA: grava as DUAS — `cw/zg/pw` = futureLevels (casável com o gráfico do NT8 e
//    com aot-indicators) e `cwIdx/zgIdx/pwIdx` = indexLevels. Nada de converter na
//    leitura: o erro de ~33 pts (futuresDiff) já mordeu a Estrutura uma vez.
//
// ⚠️ DEGRAUS, não interpolação: entre duas amostras não se sabe por onde o nível passou.
//    O patamar antigo vale até o registro seguinte — mesma convenção do DrawOneLvlTrail.
//
// ⚠️ CONTEXTO, nunca sinal: descritivo (para onde o nível vem se movendo). Sem backtest.
// ───────────────────────────────────────────────────────────────────────────────
// AOT_LVLMIG_DIR existe p/ o TESTE poder escrever num diretório temporário — produção nunca
// seta a variável e cai no default. Sem isso, testar a persistência sujaria a série real.
const LVLMIG_DIR = process.env.AOT_LVLMIG_DIR || path.join(__dirname, 'history', 'levels');   // levels-<SYM>-YYYY-MM.jsonl
const LVLMIG_SYMS = ['ES', 'NQ'];
// Heartbeat de COBERTURA: mesmo sem mudança, grava 1 registro a cada 15 min. Sem isto, um
// buraco no log (BFF fora do ar, fonte muda) seria indistinguível de "o nível ficou parado".
const LVLMIG_HOLD_MS = parseInt(process.env.AOT_LVLMIG_HOLD_MS || '900000', 10);
const LVLMIG_RECENT_MS = 48 * 3600000;   // janela quente em memória (o resumo do /state sai daqui)
const LVLMIG_KEYS = [['cw', 'callwallstrike', 'Call Wall'], ['zg', 'zero_g_strike', 'Zero Gamma'], ['pw', 'putwallstrike', 'Put Wall']];

const lvlMigLast = {};     // sym → último registro GRAVADO (base da detecção de mudança)
const lvlMigRecent = {};   // sym → janela quente (48h), reidratada do disco no boot

function lvlMigFile(sym, atIso) { return path.join(LVLMIG_DIR, 'levels-' + sym + '-' + String(atIso).slice(0, 7) + '.jsonl'); }
function lvlMigRe(sym) { return new RegExp('^levels-' + sym + '-\\d{4}-\\d{2}\\.jsonl$'); }

function lvlMigPush(sym, rec) {
  const a = lvlMigRecent[sym] || (lvlMigRecent[sym] = []);
  a.push(rec);
  const cut = Date.parse(rec.at) - LVLMIG_RECENT_MS;
  while (a.length && Date.parse(a[0].at) < cut) a.shift();
  lvlMigLast[sym] = rec;
}

// Boot: reidrata a janela quente do disco. Sem isto, TODO restart do BFF gravaria um 'open'
// espúrio e o resumo nasceria sem passado — exatamente o que a persistência existe p/ evitar.
function lvlMigHydrate() {
  try {
    if (!fs.existsSync(LVLMIG_DIR)) return;
    const cut = Date.now() - LVLMIG_RECENT_MS;
    const names = fs.readdirSync(LVLMIG_DIR);
    for (const sym of LVLMIG_SYMS) {
      const re = lvlMigRe(sym);
      const files = names.filter(f => re.test(f)).sort().slice(-2);   // mês corrente + anterior
      const acc = [];
      for (const f of files) {
        let txt = ''; try { txt = fs.readFileSync(path.join(LVLMIG_DIR, f), 'utf8'); } catch { continue; }
        for (const line of txt.split('\n')) {
          if (!line.trim()) continue;
          let r; try { r = JSON.parse(line); } catch { continue; }   // linha torta (crash) = ignorada
          if (r && r.at && Date.parse(r.at) >= cut) acc.push(r);
        }
      }
      acc.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      if (acc.length) { lvlMigRecent[sym] = acc; lvlMigLast[sym] = acc[acc.length - 1]; }
    }
    const n = LVLMIG_SYMS.map(s => s + '=' + ((lvlMigRecent[s] || []).length)).join(' ');
    log('migração dos níveis: janela quente reidratada do disco (' + n + ')');
  } catch { }
}

// Retenção 180d — ARQUIVA (move, NUNCA apaga), idêntico ao simHistoryArchive. Duplicado de
// propósito: o /history é o caminho crítico do simulador e não se mexe nele por estética.
function lvlMigArchive() {
  try {
    if (!fs.existsSync(LVLMIG_DIR)) return;
    const archDir = path.join(LVLMIG_DIR, 'archive');
    const cutoff = new Date(Date.now() - 180 * 86400000);
    for (const f of fs.readdirSync(LVLMIG_DIR)) {
      const m = f.match(/^levels-[A-Z]{1,4}-(\d{4})-(\d{2})\.jsonl$/);
      if (!m) continue;
      const monthEnd = new Date(Date.UTC(+m[1], +m[2], 0, 23, 59, 59));   // último dia do mês
      if (monthEnd < cutoff) {
        if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });
        try { fs.renameSync(path.join(LVLMIG_DIR, f), path.join(archDir, f)); log('migração dos níveis: arquivado ' + f); } catch { }
      }
    }
  } catch { }
}

// Amostra do poll. Grava só quando há MUDANÇA (a série é uma escada — guardar transições é
// lossless) ou quando o heartbeat de cobertura vence. Retorna o registro gravado, ou null.
function lvlMigSample(sym, levels) {
  // REPLAY (AOT_REPLAY_DATE): o relógio de sessão é SIMULADO. Gravar aqui carimbaria o log
  // append-only com tempo falso e contaminaria a série real — mesma guarda do simulador.
  if (REPLAY) return null;
  if (!levels || levels._err) return null;
  const fut = levels.futureLevels || {}, idx = levels.indexLevels || {};
  const cur = {};
  for (const [k, field] of LVLMIG_KEYS) { cur[k] = r2(numOrNull(fut[field])); cur[k + 'Idx'] = r2(numOrNull(idx[field])); }
  if (cur.cw == null && cur.zg == null && cur.pw == null) return null;   // payload sem os 3 níveis

  const at = new Date().toISOString();   // relógio REAL (o `at` mede quando NÓS observamos)
  const prev = lvlMigLast[sym] || null;
  const tradeDate = levels.tradeDate ? String(levels.tradeDate).slice(0, 10) : null;

  const changed = [];
  if (prev) for (const [k] of LVLMIG_KEYS) if (cur[k] !== prev[k]) changed.push(k);

  let kind;
  if (!prev) kind = 'open';                                                                // 1ª amostra (disco vazio)
  else if (tradeDate && prev.tradeDate && tradeDate !== prev.tradeDate) kind = 'open';     // virada de sessão: âncora do dia
  else if (changed.length) kind = 'chg';
  else if (Date.parse(at) - Date.parse(prev.at) >= LVLMIG_HOLD_MS) kind = 'hold';
  else return null;                                                                        // parado e heartbeat não venceu

  const rec = {
    at, sym, kind, tradeDate,
    asof: levels.asof || null,                                    // carimbo do VENDOR (≠ do nosso `at`)
    futuresDiff: r2(numOrNull(levels.futuresDiff)),
    cw: cur.cw, zg: cur.zg, pw: cur.pw,                           // escala de FUTURO
    cwIdx: cur.cwIdx, zgIdx: cur.zgIdx, pwIdx: cur.pwIdx,         // escala de ÍNDICE
    changed, src: '/levels/' + sym,
  };
  try {
    if (!fs.existsSync(LVLMIG_DIR)) fs.mkdirSync(LVLMIG_DIR, { recursive: true });
    fs.appendFileSync(lvlMigFile(sym, at), JSON.stringify(rec) + '\n');
  } catch (e) { return null; }   // não gravou → a memória NÃO avança (nada de fingir que persistiu)
  lvlMigPush(sym, rec);
  return rec;
}

// Valor VIGENTE em t (função escada): último registro com at <= t. Não interpola.
function lvlMigValueAt(arr, tMs, k) {
  let v = null;
  for (const r of arr) { if (Date.parse(r.at) > tMs) break; if (r[k] != null) v = r[k]; }
  return v;
}
const lvlMigDelta = (now, then) => (now == null || then == null) ? null : r2(now - then);

// Resumo p/ o /state (sai da janela quente em memória; o disco só é lido em /levels-migration).
function buildLevelsMigration(sym) {
  const arr = lvlMigRecent[sym] || [];
  const out = { sym, ok: false, persisted: true, holdMin: Math.round(LVLMIG_HOLD_MS / 60000),
    _note: 'Migração dos níveis — rastro em degraus de Call Wall / Zero Gamma / Put Wall (/levels/' + sym + ', keyLevels do vendor). Preço de FUTURO; *Idx = índice. Descritivo, sem edge medido. NÃO são as walls do grid do dealer nem as 0DTE do :3457.' };
  if (REPLAY) { out.note = 'replay ativo — amostragem suspensa p/ não carimbar o log com relógio simulado'; return out; }
  if (!arr.length) { out.note = 'sem amostras ainda (a série nasce no 1º poll e vive em disco)'; return out; }

  const last = arr[arr.length - 1];
  const nowMs = Date.parse(last.at);
  out.ok = true;
  out.at = last.at; out.asof = last.asof; out.tradeDate = last.tradeDate;
  out.current = { callWall: last.cw, zeroGamma: last.zg, putWall: last.pw };
  out.currentIdx = { callWall: last.cwIdx, zeroGamma: last.zgIdx, putWall: last.pwIdx };

  // Δ por janela — só reportado se a janela está COBERTA pela série (senão seria Δ contra o
  // início do rastro, que parece "nível parado" quando na verdade é "não observamos".
  const firstMs = Date.parse(arr[0].at);
  // Dois pares de escala. `delta` = FUTURO (compatibilidade), `deltaIdx` = ÍNDICE.
  // ⚠️ O painel usa o de ÍNDICE. O de futuro embute o basis, que anda sozinho: em
  // 2026-07-30 o cw foi de 7733,45 p/ 7732,68 (−0,77) com o strike PARADO em 7700.
  // Um Δ de futuro anunciaria migração onde só houve drift de basis — sinal falso.
  out.delta = {}; out.deltaIdx = {};
  for (const mins of [30, 60, 120]) {
    const t = nowMs - mins * 60000;
    if (firstMs > t) { out.delta['m' + mins] = null; out.deltaIdx['m' + mins] = null; continue; }
    out.delta['m' + mins] = {
      callWall: lvlMigDelta(last.cw, lvlMigValueAt(arr, t, 'cw')),
      zeroGamma: lvlMigDelta(last.zg, lvlMigValueAt(arr, t, 'zg')),
      putWall: lvlMigDelta(last.pw, lvlMigValueAt(arr, t, 'pw')),
    };
    out.deltaIdx['m' + mins] = {
      callWall: lvlMigDelta(last.cwIdx, lvlMigValueAt(arr, t, 'cwIdx')),
      zeroGamma: lvlMigDelta(last.zgIdx, lvlMigValueAt(arr, t, 'zgIdx')),
      putWall: lvlMigDelta(last.pwIdx, lvlMigValueAt(arr, t, 'pwIdx')),
    };
  }
  // Desde a abertura da sessão corrente (1º registro do mesmo tradeDate na janela quente).
  const sameDay = last.tradeDate ? arr.filter(r => r.tradeDate === last.tradeDate) : [];
  if (sameDay.length) {
    const o = sameDay[0];
    // partial=true: a janela quente começa NO MEIO da sessão (não vimos a abertura) → o Δ
    // "desde a abertura" é, na verdade, "desde a 1ª amostra que temos". Dito, não escondido.
    out.session = { tradeDate: last.tradeDate, since: o.at, partial: o.kind !== 'open',
      callWall: lvlMigDelta(last.cw, o.cw), zeroGamma: lvlMigDelta(last.zg, o.zg), putWall: lvlMigDelta(last.pw, o.pw) };
    out.sessionIdx = { callWall: lvlMigDelta(last.cwIdx, o.cwIdx),   // escala de ÍNDICE (a que o painel usa)
      zeroGamma: lvlMigDelta(last.zgIdx, o.zgIdx), putWall: lvlMigDelta(last.pwIdx, o.pwIdx) };
    // ⚠️ Contar por `changed`, NUNCA por `kind === 'chg'`. Na virada de sessão o registro sai
    // como `kind:'open'` (a âncora do dia vence, lvlMigSample L1103) mesmo quando o nível TAMBÉM
    // mudou naquele instante — e aí ele carrega `changed` preenchido. Contando por `kind`, o
    // painel mostrava "0 mudanças" ao lado de "Zero Gamma: 1" (caso real de 2026-07-30T07:52:57Z,
    // tradeDate 07-28→07-29 com changed:['zg']). Por `changed`, total e por-nível saem do MESMO
    // conjunto por construção: max(por-nível) <= total <= soma(por-nível).
    const chgRecs = sameDay.filter(r => (r.changed || []).length);
    out.changes = { total: chgRecs.length,
      callWall: chgRecs.filter(r => r.changed.includes('cw')).length,
      zeroGamma: chgRecs.filter(r => r.changed.includes('zg')).length,
      putWall: chgRecs.filter(r => r.changed.includes('pw')).length };
    const lastChg = chgRecs[chgRecs.length - 1];
    out.lastChange = lastChg ? { at: lastChg.at, changed: lastChg.changed } : null;
  }
  // COBERTURA — buracos na série são fato observável, não detalhe interno: um Δ de 30 min
  // sobre uma janela furada é mentira silenciosa. Buraco = intervalo > 2× o heartbeat.
  let maxGapMs = 0, gaps = 0;
  for (let i = 1; i < arr.length; i++) {
    const g = Date.parse(arr[i].at) - Date.parse(arr[i - 1].at);
    if (g > maxGapMs) maxGapMs = g;
    if (g > LVLMIG_HOLD_MS * 2) gaps++;
  }
  out.coverage = { samples: arr.length, sinceAt: arr[0].at, maxGapMin: Math.round(maxGapMs / 60000), gaps,
    note: gaps ? gaps + ' buraco(s) na janela — BFF fora do ar ou fonte muda' : 'sem buracos na janela' };
  return out;
}

// Trail compacto p/ o Deep Dive — mesmo split do gexByStrike (resumo no Command, série no deep).
function lvlMigTrail(sym, hours, cap) {
  const arr = lvlMigRecent[sym] || [];
  if (!arr.length) return [];
  const cut = Date.parse(arr[arr.length - 1].at) - (hours || 8) * 3600000;
  const w = arr.filter(r => Date.parse(r.at) >= cut);
  const slice = w.length > (cap || 400) ? w.slice(-(cap || 400)) : w;
  // ESCALA DE ÍNDICE, não de futuro — decisão do desenho (MCP Design, 2026-07-30): o preço de
  // futuro carrega o basis, que se move sozinho e pintaria degrau onde o nível não andou. O
  // futuro continua em current/currentIdx e nos steps do /levels-migration.
  return slice.map(r => [r.at, r.cwIdx, r.zgIdx, r.pwIdx, r.kind]);   // compacto: array, não objeto
}

// Leitura do DISCO (fonte de verdade). NUNCA escreve — mesmo contrato do simHistoryRead.
function lvlMigRead(sym, days) {
  const out = { sym, steps: [], integrity: { appendOnly: true, totalLines: 0, since: null, archivedMonths: 0,
    note: 'append-only · nada reescrito (meses >180d são arquivados, não apagados)' } };
  try { const ad = path.join(LVLMIG_DIR, 'archive'); if (fs.existsSync(ad)) out.integrity.archivedMonths = fs.readdirSync(ad).filter(f => lvlMigRe(sym).test(f)).length; } catch { }
  try {
    if (!fs.existsSync(LVLMIG_DIR)) return out;
    const cutoff = Date.now() - days * 86400000;
    const files = fs.readdirSync(LVLMIG_DIR).filter(f => lvlMigRe(sym).test(f)).sort();
    const all = [];
    for (const f of files) {
      let txt = ''; try { txt = fs.readFileSync(path.join(LVLMIG_DIR, f), 'utf8'); } catch { continue; }
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }   // linha torta (crash) = ignorada
        out.integrity.totalLines++;
        if (!out.integrity.since || (r.at && r.at < out.integrity.since)) out.integrity.since = r.at;
        if (r.at && Date.parse(r.at) >= cutoff) all.push(r);
      }
    }
    all.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));   // cronológico (é uma escada)
    out.steps = all;
  } catch { }
  return out;
}

// ── Poll: busca todas as fontes e monta o STATE ──────────────────────────────
async function poll() {
  const t = etState();

  const [cES, cNQ, sgDiv, hES, gex, mqES, mqNQ, qdES, qdNQ, qdDpES, qdDpNQ, qdRawSPX, ao] = await Promise.all([
    from('consolidator', '/consolidated/ES', 6000),
    from('consolidator', '/consolidated/NQ', 6000),
    from('spotgamma', '/divergence/es-spx-vix', 6000),
    from('spotgamma', '/hiro/SPX', 6000),
    from('gexbot', '/', 9000),                                              // oi-latest.json inteiro
    from('menthorq', '/intraday/ES', 8000), from('menthorq', '/intraday/NQ', 8000),
    from('quantdata', '/signal/ES', 8000), from('quantdata', '/signal/NQ', 8000),
    from('quantdata', '/darkpool/ES', 8000), from('quantdata', '/darkpool/NQ', 8000),
    from('quantdata', '/flow/SPX', 8000),    // 2026-09-11: camada BRUTA (fast) — ver bloco rawDataFresh abaixo
    from('alfaomega', '/state', 2500),
  ]);

  const gexInst = (gex && gex.instruments) ? gex.instruments : {};
  const nowIso = new Date().toISOString();

  // asof por fonte: GexBot=ver abaixo; MenthorQ=updatedAt; demais=asof/timestamp
  //
  // 🔴 FALSO ÂMBAR DO GEXBOT — corrigido 2026-08-04.
  // ANTES: a idade saía SÓ de `instruments.ES.timestamp`. Esse campo é o carimbo da SESSÃO DE
  // OPÇÕES e CONGELA no sino — medido na terça 04/08 às 09:09 ET (pré-abertura):
  //     instruments.ES.timestamp = 1785787200 = 03/08 20:00 UTC = 16:00 ET seg  -> 17,4 h
  //     flow_hiro.ts             = 2026-08-04T13:22:32Z                         ->    37 s
  //     signals.ts               = 1785849762823 (unix ms)                      ->    26 s
  // Mesmo payload, 17 h de divergência. O relay estava VIVO e o painel pintava a fonte de
  // parada — o operador perde confiança numa fonte que está funcionando.
  // É o espelho do "falso verde" (lá, dado velho parecia novo; aqui, dado novo parece velho).
  //
  // AGORA: usa o MAIS RECENTE entre os campos que pulsam, com o antigo como último recurso.
  // Escolher o máximo (e não um campo fixo) degrada com segurança: se o vendor parar de mandar
  // flow_hiro/signals, volta sozinho ao comportamento anterior em vez de quebrar.
  const gexAsof = (() => {
    const cand = [];
    const push = (v, mult) => {                     // mult: 1000 p/ unix(s), 1 p/ unix(ms)
      if (v == null) return;
      const ms = (typeof v === 'number') ? v * mult : Date.parse(v);
      if (Number.isFinite(ms) && ms > 0) cand.push(ms);
    };
    push(gex && gex.flow_hiro && gex.flow_hiro.ts, 1);        // ISO -> Date.parse
    push(gex && gex.signals && gex.signals.ts, 1);            // unix MILISSEGUNDOS (13 dígitos)
    push(gexInst.ES && gexInst.ES.timestamp, 1000);           // unix SEGUNDOS (10) — o que congela
    return cand.length ? new Date(Math.max(...cand)).toISOString() : null;
  })();
  const sources = {
    consolidator: srcStatus(cES, cES && cES.asof, 'consolidator'),
    spotgamma: srcStatus(sgDiv, sgDiv && sgDiv.at, 'spotgamma'),
    gexbot: srcStatus(gex, gexAsof, 'gexbot'),
    menthorq: srcStatus(mqES, mqES && (mqES.updatedAt || mqES.asof || mqES.timestamp), 'menthorq'),
    alfaomega: srcStatus(ao, null, 'alfaomega'),
    quantdata: srcStatus(qdES, qdES && (qdES.asof || qdES.timestamp), 'quantdata'),
  };


  // ── FRESCOR REAL DO PREÇO GexBot (2026-09-03) — ADITIVO, DIAGNÓSTICO ────────
  // Separa duas coisas que estavam coladas num número só:
  //   `age_s`      = idade do ENVELOPE. `gexAsof` (L1474) faz Math.max entre flow_hiro.ts,
  //                  signals.ts e ES.timestamp; os dois primeiros pulsam a cada ciclo do
  //                  darkcode-sync, então o máximo quase sempre vem deles.
  //   `price_age_s`= idade do PREÇO de fato usado no bloco GexBot.
  // MEDIDO em 03/09: age_s=4s enquanto ES.timestamp marcava 20:00:01Z (16:00:01 ET, o
  // fechamento OPRA) — 187 min de idade real. O dado não estava quebrado: a sessão de
  // opções tinha encerrado. O que faltava era enxergar isso.
  // ⚠️ NÃO altera age_s/status/stale_after_s nem toca em gexAsof. Só ACRESCENTA campos.
  // ⚠️ instruments.<sym>.timestamp vem em unix SEGUNDOS (10 dígitos) — daí o *1000.
  // Par: vale a componente MAIS VELHA (o par só está fresco até onde a perna pior estiver).
  // Ausente: null naquele componente, e o par usa o que sobrou. Nunca inventa timestamp.
  try {
    const pAge = (inst) => {
      const t = inst && inst.timestamp;
      if (typeof t !== 'number' || !isFinite(t) || t <= 0) return { age: null, iso: null };
      const ms = t * 1000;                                   // unix SEGUNDOS -> ms
      return { age: Math.round((effectiveNow().getTime() - ms) / 1000), iso: new Date(ms).toISOString() };
    };
    const pEs = pAge(gexInst.ES);
    const pNq = pAge(gexInst.NQ);
    const idades = [pEs.age, pNq.age].filter((v) => v != null);
    sources.gexbot.price_age_s      = idades.length ? Math.max(...idades) : null;   // mais VELHA das duas
    sources.gexbot.price_age_es_s   = pEs.age;
    sources.gexbot.price_age_nq_s   = pNq.age;
    sources.gexbot.price_timestamp_es = pEs.iso;
    sources.gexbot.price_timestamp_nq = pNq.iso;
    // (2026-09-28) envelope pulsando + preco parado = PARTIAL (so data_state; cor segue a conexao).
    const g = sources.gexbot;
    if (g.data_state === 'FRESH' && g.price_age_s != null && g.price_age_s > (g.stale_after_s || STALE_S)) {
      g.data_state = 'PARTIAL';
      if (g.connection_state === 'CONNECTED') g.reason = 'envelope vivo; preco ES/NQ parado ha ' + g.price_age_s + 's (sessao de opcoes fechada)';
    }
  } catch (e) { /* diagnóstico nunca derruba o poll que ele existe para observar */ }

  // ── FRESCOR DA CAMADA BRUTA do QuantData (2026-09-11) — ADITIVO, DIAGNÓSTICO ──
  // /signal/ES só é recalculado 09:30-16:00 ET (RTH) — fora dessa janela ele CONGELA por
  // DESENHO (diagnóstico 2026-09-11: `asof` parado exatamente no último ciclo antes do
  // "fim RTH — encerrando" de ontem), não por falha. `sources.quantdata.status` fica
  // "stale" o dia inteiro fora do RTH mesmo com o vendor 100% saudável — sem visibilidade
  // extra, o operador não tinha como distinguir "sem sinal por pré-mercado" de "sem sinal
  // porque quebrou". Mesma classe do falso-verde do GexBot acima, espelhada: aqui dado vivo
  // parece morto por olhar só o campo errado.
  // A camada BRUTA (net-drift/net-flow/trade-side — layer `fast` do coletor) roda
  // 00:00-16:30 ET, bem mais ampla que o RTH do sinal. É a MESMA família de métrica que
  // quantdata-token.js já usa pra provar sessão válida (net-flow/SPX) — daí SPX aqui, não
  // o combo ES: símbolo RAW tem um único campo `at` no topo, sem aninhar em `components`.
  // ⚠️ NÃO toca sources.quantdata.status/age_s/stale_after_s — o gate do /signal continua
  // exatamente como estava. Só ACRESCENTA campos, mesmo padrão do bloco price_age_s do
  // GexBot logo acima. Limiar = STALE_S (900s, default) de propósito: a cadência real da
  // camada fast é ~2min, então 900s já dá folga generosa sem inventar limiar novo.
  try {
    const rawAt = qdRawSPX && typeof qdRawSPX.at === 'string' ? qdRawSPX.at : null;
    const rawAge = rawAt ? ageSec(rawAt) : null;
    sources.quantdata.rawDataAt = rawAt;
    sources.quantdata.rawDataAgeS = rawAge;
    sources.quantdata.rawDataFresh = rawAge != null ? (rawAge <= STALE_S) : false;
    // (2026-09-28) /signal congelado fora do RTH mas camada bruta viva = PARTIAL (so data_state).
    const q = sources.quantdata;
    if (q.rawDataFresh && (q.data_state === 'STALE' || q.data_state === 'NO_NEW_DATA_EXPECTED')) {
      q.data_state = 'PARTIAL';
      if (q.connection_state === 'CONNECTED') q.reason = '/signal parado (so RTH); camada bruta viva, ' + rawAge + 's';
    }
  } catch (e) { /* diagnóstico nunca derruba o poll que ele existe para observar */ }

  const symbols = {
    ES: computeSymbol('ES', cES, sgDiv, gex && !gex._err ? gex.flow_hiro : null, gexInst.ES, t.rth),
    NQ: computeSymbol('NQ', cNQ, sgDiv, gex && !gex._err ? gex.flow_hiro : null, gexInst.NQ, t.rth),
  };

  // Deep Dive — dados crus (só o que respondeu; erros viram null)
  const clean = (x) => (x && !x._err) ? x : null;
  const deep = {
    consolidator: { ES: clean(cES), NQ: clean(cNQ) },
    spotgamma: { divergence: clean(sgDiv), hiro_spx: clean(hES) },
    gexbot: { ES: clean(gexInst.ES), NQ: clean(gexInst.NQ) },
    menthorq: { ES: clean(mqES), NQ: clean(mqNQ) },
    quantdata: { ES: clean(qdES), NQ: clean(qdNQ), darkpool: { ES: clean(qdDpES), NQ: clean(qdDpNQ) } },
    alfaomega: clean(ao),
  };

  // ── Indicadores Alfa Omega recalculados (ES-only; /levels,/hiro,/gseries,/grid) ──
  // Engenharia: reproduz os .cs do NT8 a partir das MESMAS fontes :3500 → funciona
  // com o NT8 fechado. Fontes SpotGamma só têm grade de ES (SPX) — por isso ES-only.
  let indi = null, ohlc = null, traceCloud = null, wallAtt = null, structure = null;
  // blocos de gamma por strike/regiao (2026-08-07)
  let callPutClassing = null, hedgeByStrike = null, stopTakeHedge = null, darkPoolLevels = null, zeroGamma0dte = null, fallback1Dte = null;
  let menthorqStrategies = null;   // ESTRUTURA, nao sinal — ver cabecalho do modulo
  // Campos novos (VixLine / GexByStrike): montados a partir das MESMAS rotas :3500 dos indicadores NT8.
  let vixLine = null, gexByStrike = null, vixSer = null;
  let levelsEsPoll = null;   // /levels/ES desta rodada — reusado pela Migração dos Níveis como fallback
  try {
    const d = etDate();
    const [levels, hiroFull, gseries, gridAll, gridGex, cloud, vixSeries] = await Promise.all([
      from('spotgamma', '/levels/ES', 12000),
      from('spotgamma', '/hiro/SPX?n=100000', 9000),
      from('spotgamma', '/gseries/ES?date=' + d, 12000),
      from('spotgamma', '/grid/ES?metric=gex&participant=all&dte=all', 12000),
      // &flow=1 (2026-08-05): traz o fluxo TRANSACIONADO por strike (call/put × comprada/
      // vendida) junto com a posição. Alimenta indicators.flowByStrike e .hedgeDirection —
      // mesmo motor do tooltip do NT8. Sem o parâmetro o payload é o de sempre.
      from('spotgamma', '/grid/ES?metric=gex&participant=dealer&dte=all&flow=1', 8000),
      // TRACE CLOUD (dealer = mm+bd): entra no /state só como RESUMO derivado (~10 números).
      // bins=40 chega e sobra p/ a banda + tendência; a matriz nunca sai daqui.
      from('spotgamma', '/cloud/ES?mode=strike&metric=gamma&participant=dealer&bins=40&date=' + d, 12000),
      from('spotgamma', '/vix/series', 12000),   // VixLine — mesma rota do AlfaOmegaVixLine.cs
    ]);
    vixSer = vixSeries;
    levelsEsPoll = levels;
    indi = indicators.buildIndicators({ levels, hiroFull, gseries, gridAll, gridGex, gexInst: gexInst.ES });
    // VixLine (resumo p/ Command; série completa fica no Deep Dive) + GexByStrike (nome próprio).
    vixLine = buildVixLine(vixSeries);
    gexByStrike = buildGexByStrike(gridGex);
    // resumo narrável do TraceCloud (a matriz NÃO entra no /state)
    try {
      const spotEs = (gexInst.ES && gexInst.ES.spot) || null;
      traceCloud = cloudSummary(cloud, spotEs);
    } catch (e) { traceCloud = null; }
    // Selo de ATENÇÃO por wall (ES-only) — display-only, fora do Conviction Stack.
    // Reusa as rows do /grid dealer (γ por-strike) + oi-latest.json (VBPI + fluxo agregado).
    try { wallAtt = buildWallAttention(gexInst.ES, (gridGex && gridGex.rows) || [], gex && !gex._err ? gex.flow_hiro : null); }
    catch (e) { wallAtt = null; }
    // OHLC: NÃO fabricar. O bloco anterior (Bug #3) montava 90 candles com
    // Math.random() em torno de um strike de gama (topabs_strike, nem é preço),
    // fallback 7500, e o index.html os rotulava "● ao vivo / dados SpotGamma
    // /gseries real" — dado falso apresentado como real no painel principal.
    // Não há feed de OHLC real do ES no pipeline (só /prices/SPX = close do
    // índice, não candles). Com ohlc=null o index.html cai no placeholder já
    // rotulado ("● ilustrativo · conectar no handoff de dev"), sem alegar real.
    // Ligar a uma fonte real é decisão de produto (ver handoff), não fabricar aqui.
    ohlc = null;

    // ── ESTRUTURA (2026-07-29) — isolada em try próprio: é um EXTRA. Se /prices/SPX
    //    ou o grid falharem, todo o resto do bloco de indicadores segue funcionando.
    try {
      const pricesSpx = await from('spotgamma', '/prices/SPX?n=400', 6000);
      structure = buildStructure(gridGex, hiroFull, pricesSpx, { windowMin: 30, nearPct: 0.15 });
    } catch (e) { structure = { ok: false, note: 'estrutura indisponível' }; }

    // ── BLOCOS DE GAMMA POR STRIKE/REGIÃO (2026-08-07) — try próprio ────────────
    // São EXTRAS: se qualquer fonte falhar, o resto do /state segue intacto. Mesmo
    // critério do bloco `structure` acima.
    // Fontes: :3500 /grid?participant=all (bloco `hedge` canônico + dealer/client),
    //         :3500 /grid?metric=netoi&split=1 (o eixo comprada×vendida, LÍQUIDO),
    //         QuantData /exposure (tipo call/put por strike + zero gamma do 0DTE).
    try {
      // ⚠️ ESCOPO: o gridAll acima é dte=all, então o split TEM de ser dte=all também —
      // senão o eixo comprada×vendida viria de um universo de expiração diferente do
      // dealer/client e das obrigações. O QuantData é 0DTE por natureza (expiração
      // corrente): essa diferença é REAL e sai declarada no bloco, não escondida.
      const dte = 'all';
      const [qdExp, splitNet] = await Promise.all([
        from('quantdata', '/exposure/SPX', 9000),
        from('spotgamma', '/grid/ES?metric=netoi&participant=dealer&dte=' + dte + '&split=1', 8000),
      ]);
      const hedgeBlk = (gridAll && !gridAll._err) ? gridAll.hedge : null;
      const fdiff = (gridAll && fin2(gridAll.futuresDiff)) ? gridAll.futuresDiff : null;
      const spotEs2 = (gexInst.ES && fin2(gexInst.ES.spot)) ? gexInst.ES.spot : null;
      const zgF = (hedgeBlk && hedgeBlk.regime && fin2(hedgeBlk.regime.zeroGammaFut)) ? hedgeBlk.regime.zeroGammaFut : null;
      // ── ZERO GAMMA QUE GOVERNA O REGIME = o do 0DTE (decisao do operador, 07/08/2026) ──
      // Medido no mesmo dia: ZG 0DTE 7763,09 x ZG estrutura completa 7576,93 (gap 186 pt) davam
      // regimes OPOSTOS com o spot em 7756,48. Como I1 inverte a leitura de TODO fluxo conforme
      // o regime, o escopo errado troca o significado de tudo. Fallback p/ a estrutura completa
      // so quando o 0DTE nao estiver disponivel — e a fonte usada sai publicada no bloco.
      //
      // ⚠️ REVERTIDO em 17/08/2026 (decisao do operador). Entre 16 e 17/08 este bloco governou
      // pelo GexBot (classic.zero_gamma, sem futuresDiff), justificado por FRESCOR. Revertido
      // porque governar por outro vendor quebra a coerencia do regimeConflict (L415 do
      // aot-gamma-blocks.js): ele compara posicao(zgGov) x net(reg.byNet, SpotGamma), e so faz
      // sentido quando os dois lados saem do MESMO vendor — que e o caso no fallback zgF.
      // O GexBot passa a ser CAMADA DE CONFIRMACAO (comparar contra classic.zero_gamma),
      // nunca fonte que governa. Ver SKILL gamma-methodology, invariante I2b.
      let zgGov = null;
      try {
        if (qdExp && !qdExp._err && fin2(qdExp.zero_gamma) && fin2(fdiff)) zgGov = qdExp.zero_gamma + fdiff;
      } catch (e) { zgGov = null; }
      if (zgGov == null) zgGov = zgF;
      const negNow = (spotEs2 != null && zgGov != null) ? (spotEs2 < zgGov) : null;

      // banda de ruído (piso do STOP) — mesma fonte que o AlfaOmegaTrace usa
      let band = null;
      try {
        const im = levelsEsPoll && levelsEsPoll.impliedMove;
        if (im) band = { hi: fin2(im.hiSkew) ? im.hiSkew : im.hi, lo: fin2(im.loSkew) ? im.loSkew : im.lo };
      } catch (e) { band = null; }

      callPutClassing = gblocks.buildCallPutClassing(qdExp, gridAll, splitNet, fdiff, spotEs2, negNow);
      hedgeByStrike = gblocks.buildHedgeByStrike(gridAll, hedgeBlk, spotEs2, fdiff,
        (structure && fin2(structure.hiroSecondHalf)) ? structure.hiroSecondHalf : null, zgGov);
      stopTakeHedge = gblocks.buildStopTakeHedge(hedgeBlk, spotEs2, band, { minDistPt: 10 }, zgGov);
      zeroGamma0dte = gblocks.buildZeroGamma0dte(qdExp, hedgeBlk, spotEs2, fdiff);

      // F1 — FALLBACK 1DTE (GexBot). Fica SEMPRE calculado, e marca ativo=true quando o 0DTE
      // do SpotGamma morre (16:00 ET, colunas _0 zeradas). Assim a tela nao fica muda no
      // pos-fechamento: perde a granularidade por strike, mas mantem niveis e regime do 1DTE.
      // ── 11 ESTRATEGIAS DE NIVEL + CONFIRMACAO POR HEDGE (18/08/2026) ─────
      // ESTRUTURA OBSERVADA, nao sinal: nao alimenta gate, Conviction Stack, narrador
      // nem aot-sim. Direcao sai como OBRIGACAO MECANICA do dealer. Promocao a sinal
      // depende do GATE3 (congelado). Ver o cabecalho do aot-menthorq-strategies.js.
      try {
        menthorqStrategies = mqStrat.buildMenthorqStrategies({
          now: new Date(),
          gexbotES: gexInst.ES,
          strikes: (gridGex && !gridGex._err && Array.isArray(gridGex.rows)) ? gridGex.rows : null,
          trace: (hedgeByStrike && hedgeByStrike.levels) ? hedgeByStrike.levels : null,
          hiroNet5m: (indi && indi.hiroRegime && indi.hiroRegime.ok) ? indi.hiroRegime.net5m : null,
          gammaPressureP: (indi && indi.gammaPressure && indi.gammaPressure.ok) ? indi.gammaPressure.P : null,
          zgGov: zgGov,
        });
      } catch (e) { menthorqStrategies = { ok: false, note: 'falha ao avaliar: ' + (e && e.message) }; }

      fallback1Dte = gblocks.build1DteFallback(gexInst.ES);
      try {
        const gateOff = !(hedgeBlk && hedgeBlk.activGate && hedgeBlk.activGate.pass);
        const semNivel = !(hedgeBlk && (hedgeBlk.levels || []).length);
        if (fallback1Dte && fallback1Dte.ok) fallback1Dte.ativo = (gateOff || semNivel);
      } catch (e) { /* fallback segue publicado, so sem o flag */ }

      // ── UNIFICACAO DO REGIME (2026-08-07) ────────────────────────────────────
      // O indicators.hiroRegime nascia com o ZG da ESTRUTURA COMPLETA (walls.zeroGamma,
      // do keyLevels). Com a decisao do operador, quem governa e o ZG do 0DTE — entao ele
      // e RECOMPUTADO aqui com a MESMA funcao exportada (indicators.hiroRegime), nunca com
      // uma copia da regra: duas definicoes do mesmo regime foi o defeito que esta sessao
      // passou inteira corrigindo.
      //
      // MAPEADO ANTES DE MUDAR (07/08): a variavel zg no aot-indicators (linha ~340) alimenta
      // SOMENTE o hiroRegime — o bloco walls publica o seu proprio zeroGamma, que fica
      // INTOCADO (ele e nivel de estrutura completa, e e isso mesmo que ele deve ser).
      // O narrator (narrator.js:511) le .cumHiro e .dir, e NAO
      // o .regime; o index.html usa .regime so no badge de exibicao. Nenhum consumidor usa o
      // regime para LOGICA — logo a troca de fonte nao inverte nada em cascata.
      try {
        if (indi && indi.hiroRegime && indi.hiroRegime.ok && zgGov != null) {
          indi.hiroRegime = indicators.hiroRegime(
            indi.hiroRegime.cumHiro, spotEs2, zgGov, indi.hiroRegime.net5m, "0DTE");
        }
      } catch (e) { /* mantem o hiroRegime original: perder o bloco seria pior que a fonte antiga */ }

      // níveis de referência p/ casar o dark pool: walls do /levels + os do hedge
      const refs = [];
      try {
        const fl = (levelsEsPoll && levelsEsPoll.futureLevels) || {};
        const lb = (levelsEsPoll && levelsEsPoll.labels) || {};
        for (const kk of Object.keys(fl)) if (fin2(fl[kk])) refs.push({ price: fl[kk], label: lb[kk] || kk });
      } catch (e) { /* sem walls: o dark pool ainda sai sem matches */ }
      for (const l of ((hedgeBlk && hedgeBlk.levels) || [])) if (fin2(l.futK)) refs.push({ price: l.futK, label: 'hedge #' + l.rank });
      darkPoolLevels = gblocks.buildDarkPoolLevels(qdDpES, refs, 5);
    } catch (e) {
      const msg = (e && e.message) || 'blocos de gamma indisponíveis';
      callPutClassing = { ok: false, note: msg };
      hedgeByStrike = { ok: false, note: msg };
      stopTakeHedge = { ok: false, note: msg };
      darkPoolLevels = { ok: false, note: msg };
      zeroGamma0dte = { ok: false, note: msg };
    }
  } catch (e) { indi = { _err: (e && e.message) || 'indicators err' }; }

  // ── Confluência ES×NQ — FONTE por horário (P2 / Camada 1, 2026-07-19) ──────────
  // Lógica em computeConfluence() (pura, testável). Pregão → stack; fora → tape ES∧NQ + tapeLive.
  const confluence = computeConfluence(t.rth, ao, cES, cNQ);

  const gate = buildGate(ao, t.rth);
  const tapeFreshness = trackTapeFreshness(ao);   // OBSERVACIONAL — campo novo, não consumido pelo gate/narrador

  // ── HIRO-OPRA (campo próprio, visível) + split Command/Deep Dive dos campos novos ──
  const hiroOpra = buildHiroOpra(gex && !gex._err ? gex.flow_hiro : null, hES);
  // GexByStrike: Command recebe só o resumo; a grade de 137 strikes vai p/ o Deep Dive.
  let gexByStrikeCmd = gexByStrike;
  if (gexByStrike && gexByStrike.ok) {
    gexByStrikeCmd = { ok: true, sym: gexByStrike.sym, strikes: gexByStrike.strikes, summary: gexByStrike.summary, asof: gexByStrike.asof, _note: gexByStrike._note };
    deep.gexByStrike = { snapshot: gexByStrike.snapshot, strikes: gexByStrike.strikes, asof: gexByStrike.asof, _note: gexByStrike._note };
  }
  // VixLine: resumo já é enxuto (Command); série completa → Deep Dive.
  deep.spotgamma.vix_series = (vixSer && !vixSer._err) ? vixSer : null;

  // Fluxo de opções (tape SPX · sessão) — CONTEXTO, não sinal (mesma leitura do
  // AlfaOmegaOptionsFlowHiro.cs no NT8; sinal do deltaDollar é BLOQUEADOR §BI).
  // Isolado: falha aqui não afeta indicadores/confluência.
  // Lote 2 (2026-07-22): mode=agg foi removido — o vendor devolve `agg` (sessão INTEIRA,
  // confirmado por conteúdo: agg.count bate com `matched`) INDEPENDENTE de mode=agg; o
  // parâmetro só controla se `trades[]` vem junto. `trades[]` é sempre CAPADO em 2000 pelo
  // vendor (confirmado: limit=25000 ainda devolve 2000) — não dá pra pegar a sessão inteira
  // trade-a-trade num request só. `netAccumulated` abaixo = NET direcional (fórmula exata do
  // .cs: cp=C&BUY→+premium, cp=P&BUY→−premium) sobre essa janela de ~2000 trades mais recentes
  // — NÃO é o acumulado da sessão inteira (isso exigiria um cursor/dedupe persistente entre
  // polls, fora do escopo de "ajuste de parâmetro" — ver handoff Lote 2/3). `trades[]` bruto
  // é descartado após o cálculo (não sai no /state) — mantém o payload leve como antes.
  function computeOptionsFlowNet(trades) {
    if (!Array.isArray(trades) || !trades.length) return null;
    let net = 0;
    for (const t of trades) {
      if (t.cp === 'C' && t.buySell === 'BUY') net += (t.premium || 0);
      else if (t.cp === 'P' && t.buySell === 'BUY') net -= (t.premium || 0);
    }
    return { net: r2(net), windowTrades: trades.length, firstTs: trades[0].ts, lastTs: trades[trades.length - 1].ts,
      note: 'NET = Σ(call comprada agressiva)−Σ(put comprada agressiva), janela ~' + trades.length + ' trades mais recentes (vendor capa trades[] em 2000, sessão tem mais). NÃO é acumulado da sessão inteira.' };
  }
  try {
    const optFlow = await from('spotgamma', '/tape/SPX/options?scope=session&limit=2000', 8000);
    if (optFlow && !optFlow._err) {
      optFlow.netAccumulated = computeOptionsFlowNet(optFlow.trades);
      delete optFlow.trades;   // payload leve — só o resumo (agg+topStrikes+netAccumulated) sai no /state
      deep.spotgamma.optionsFlow = optFlow;
    } else deep.spotgamma.optionsFlow = null;
  } catch (e) { deep.spotgamma.optionsFlow = null; }
  // CONFLUÊNCIA ADICIONAL · SWEEP — fonte OFICIAL: /flow?type=sweep (filtro do vendor no :3500).
  // Fetch próprio e isolado; em replay o W3 acrescenta ?date=&at= sozinho (o corte causal é no builder).
  let caSweeps = null, caSweepErr = 'não buscado';
  try {
    const fl = await from('spotgamma', '/flow/SPX?type=sweep', 8000);
    if (fl && !fl._err && Array.isArray(fl.events)) { caSweeps = caExtractSweeps(fl.events, effectiveNow().getTime()); caSweepErr = null; }
    else caSweepErr = (fl && fl._err) || 'resposta sem lista de eventos';
  } catch (e) { caSweepErr = (e && e.message) || 'erro'; }
  // CONFLUÊNCIA ADICIONAL — HIRO Flow (evento do vendor). Fetch NOVO e isolado; from() tem
  // timeout e nunca lança; em replay o W3 acrescenta ?date=&at= sozinho (o corte causal é no builder).
  let caAlerts = null;
  try { caAlerts = await from('spotgamma', '/alerts/SPX', 6000); } catch (e) { caAlerts = { _err: (e && e.message) || 'erro' }; }

  // ── marketContext (Fase 1 · C2): HIRO multi-símbolo (Frente 3 ①) + walls ES/NQ ──
  // ADITIVO: chave nova no /state. Fetches próprios (isolados — falha aqui não afeta o resto).
  let marketContext = null;
  // hoisted: a Migração dos Níveis reusa ESTES /levels (ES+NQ) em vez de refazer 2 chamadas
  // ao vendor por poll. Ficam fora do try p/ sobreviver a uma falha parcial do marketContext.
  let mcLvES = null, mcLvNQ = null;
  const gcsiHiro = { GLD: null, SLV: null };   // (2026-10-12) HIRO cru GLD/SLV p/ o FLOW GC·SI (as mesmas 2 chamadas de sempre; nenhuma chamada nova)
  try {
    const [hNDX, hRUT, hGLD, hSLV, hVIX, hWTI, mcLevelsES, mcLevelsNQ, mcLevelsAll, mcEqHist] = await Promise.all([
      from('spotgamma', '/hiro/NDX', 6000), from('spotgamma', '/hiro/RUT', 6000),
      from('spotgamma', '/hiro/GLD', 6000), from('spotgamma', '/hiro/SLV', 6000),
      from('spotgamma', '/hiro/VIX', 6000), from('spotgamma', '/hiro/WTI', 6000),   // WTI (petróleo, §CI) — HIRO só, sem walls
      from('spotgamma', '/levels/ES', 6000), from('spotgamma', '/levels/NQ', 6000),
      from('spotgamma', '/levels/all', 6000),   // Volatility Dashboard (§BU) — 6 símbolos, zero chamada nova ao vendor
      from('spotgamma', '/equities/historical?days=20', 15000),   // série diária (§BW/§BX) — cache em disco no :3500, leitura normal é rápida
    ]);
    mcLvES = mcLevelsES; mcLvNQ = mcLevelsNQ;
    gcsiHiro.GLD = hGLD; gcsiHiro.SLV = hSLV;
    marketContext = buildMarketContext({ hSPX: hES, hNDX, hRUT, hGLD, hSLV, hVIX, hWTI, levelsES: mcLevelsES, levelsNQ: mcLevelsNQ, levelsAll: mcLevelsAll, eqHist: mcEqHist });
  } catch (e) { marketContext = { _err: (e && e.message) || 'marketContext err' }; }

  // ── MIGRAÇÃO DOS NÍVEIS (2026-07-29) — amostra + resumo. Try próprio: é um EXTRA e,
  //    ao contrário do resto do /state, ESCREVE em disco. Falha aqui não derruba o poll.
  //    Se o /levels de um símbolo falhou, aquele símbolo simplesmente não amostra nesta
  //    rodada — a escada continua no patamar anterior (é o que "degrau" significa).
  let levelsMigration = null;
  try {
    lvlMigSample('ES', mcLvES && !mcLvES._err ? mcLvES : (levelsEsPoll && !levelsEsPoll._err ? levelsEsPoll : null));
    lvlMigSample('NQ', mcLvNQ && !mcLvNQ._err ? mcLvNQ : null);
    levelsMigration = { ES: buildLevelsMigration('ES'), NQ: buildLevelsMigration('NQ'),
      _note: 'Rastro persistido em disco (JSONL append-only, history/levels/) — sobrevive a restart do BFF. Série completa em GET /levels-migration?sym=ES&days=5.' };
    deep.levelsMigration = { ES: lvlMigTrail('ES', 24, 600), NQ: lvlMigTrail('NQ', 24, 600),
      _format: '[at, callWall, zeroGamma, putWall, kind] — strike do ÍNDICE · kind: open|chg|hold',
      _note: 'Últimas 24h da janela quente. Histórico completo (até 180d) em GET /levels-migration. ' +
        'ÍNDICE de propósito: o preço de futuro carrega o basis, que anda sozinho e desenharia migração ' +
        'fantasma (real em 2026-07-30: cwIdx 7700→7700 enquanto cw 7733,45→7732,68). O futuro segue ' +
        'disponível em current/currentIdx do /state e nos steps do /levels-migration.' };
  } catch (e) { levelsMigration = { _err: (e && e.message) || 'levelsMigration err' }; }

  // ── analystNote (Notas Fase 1 · C3 · 2026-07-20) — PROSA/opinião em QUARENTENA ──
  // ADITIVO e ISOLADO: lê notes-latest.json (escrito pelo poller SEPARADO). Display-only +
  // pista CERCADA no narrador. NUNCA é sinal/mecânico, nunca entra na significance engine.
  // Falha/ausência aqui não afeta o resto do /state.
  let analystNote = null;
  try {
    const n = JSON.parse(fs.readFileSync(path.join(__dirname, 'notes', 'notes-latest.json'), 'utf8'));
    const prosa = String(n.prosa || '');
    analystNote = {
      id: n.id, title: n.title || '', date: n.date || '',
      source: 'SpotGamma Founders Notes', kind: 'opinion',   // opinião externa de analista, NÃO mecânico
      prosa: prosa.length > 2000 ? prosa.slice(0, 2000) + ' […]' : prosa,
      chars: n.chars || prosa.length, fetchedAt: n.fetchedAt || null,
    };
  } catch { analystNote = null; }   // sem nota ainda = ausente (não quebra)

  // #21 — FLOW GC (confluência auxiliar GC×SI) + FLOW RUSSELL (autorização RTY). ADITIVOS, isolados.
  // Degradam gracioso pré-F5 (o :5151 vivo ainda não expõe auxGcSi/rty). Nunca tocam gate/confluence/sim.
  const flowGc = buildFlowGc(ao, marketContext);
  const flowRussell = buildFlowRussell(ao, t.rth, marketContext);
  // (2026-10-12) FLOW GC·SI por ativo — ADITIVO, em try próprio: falha aqui não afeta o resto do /state.
  let flowGcSi = null;
  try { flowGcSi = buildFlowGcSi(ao, gcsiHiro.GLD, gcsiHiro.SLV); } catch (e) { flowGcSi = { _err: (e && e.message) || 'flowGcSi err' }; }

  try { deep.consolidator = readConsolidated(); } catch (e) { deep.consolidator = null; }   // #6: sinais do :3495 (espelho Telegram) p/ o card do deep.html
  STATE = { ok: true, asof: nowIso, session: t.session, rth: t.rth, stackMode: STACK_MODE, gate, tapeFreshness, sources, symbols, confluence, flowGc, flowRussell, flowGcSi, traceCloud, wallAttention: wallAtt, vixLine, gexByStrike: gexByStrikeCmd, structure, levelsMigration, callPutClassing, hedgeByStrike, stopTakeHedge, darkPoolLevels, zeroGamma0dte, fallback1Dte, menthorqStrategies, dexGexFlow: buildDexGexFlow(symbols), hiroOpra, ohlc, indicators: indi, marketContext, analystNote, copilotBadge: (ao && !ao._err && ao.copilotBadge) ? ao.copilotBadge : null, deep, meta: { startedAt: meta.startedAt, polls: meta.polls } };
  // NOVA hierarquia por trilhas — ADITIVA: só entra no /state fora do modo v1 (produção default = sem v2).
  if (STACK_MODE !== 'v1') {
    try { STATE.v2 = buildV2Stack(ao, gexInst, hES, gex && !gex._err ? gex.flow_hiro : null, t.rth); }
    catch (e) { STATE.v2 = { _err: (e && e.message) || 'v2 err' }; }
    // CONFLUÊNCIA ADICIONAL — DEPOIS do v2 pronto; só lê. try próprio: nunca derruba o v2.
    try { STATE.confluenciaAdicional = buildConfluenciaAdicional(STATE.v2, caAlerts, caSweeps, caSweepErr, effectiveNow().getTime()); }
    catch (e) { STATE.confluenciaAdicional = { _err: (e && e.message) || 'confluência adicional err' }; }
  }
  // SIMULADOR de Automação — ADITIVO: só entra no /state com AOT_SIM=on. Avalia a máquina de
  // estados na cadência do poll (~20s), usando o anchor da Camada 1 + spot ES/NQ (gexbot).
  if (SIM_ON && simEngine) {
    try {
      let esSpot, nqSpot;
      if (SIM_PRICE_SOURCE === 'nt8') {              // preço do NT8 (:5151) — segue o Market Replay
        esSpot = (ao && ao.es && !ao._err) ? spotOrNull(ao.es.lastPrice) : null;   // (2026-09-16) 0/NaN = sem preco
        nqSpot = (ao && ao.nq && !ao._err) ? spotOrNull(ao.nq.lastPrice) : null;
      } else {                                       // gexbot (:3457) — operação real ao vivo (default)
        esSpot = spotOrNull(gexInst.ES && gexInst.ES.spot);
        nqSpot = spotOrNull(gexInst.NQ && gexInst.NQ.spot);
      }
      const simReplay = !!REPLAY || !!(ao && ao.isReplay);
      // (2026-10-02, invictus/exec v1) aplica o que o NT8 executou ANTES do tick — try proprio: falha na ingestao nunca derruba o tick
      try { simExecIngest({ esSpot, nqSpot, nowIso }); } catch (e) { console.warn('[sim] exec ingest:', (e && e.message) || e); }
      STATE.sim = simEngine.tick({ anchor: gate.anchor, esSpot, nqSpot, nowIso, priceSource: SIM_PRICE_SOURCE, replay: simReplay });   // FASE 0: tag replay tb do bridge (NT8 Market Replay) -> trade não contamina histórico real
      // rótulo da fonte de preço ativa — p/ o painel/Deep Dive nunca confundir P&L teste vs real
      // (2026-10-01) forReplay = MESMO flag de replay passado ao tick (antes: constante SIM_PRICE_SOURCE==='nt8')
      STATE.sim.priceSource = { id: SIM_PRICE_SOURCE,
        label: SIM_PRICE_SOURCE === 'nt8' ? (simReplay ? 'NT8 (:5151 · Replay)' : 'NT8 (:5151 · ao vivo)') : 'gexbot (:3457 · mercado real)',
        forReplay: simReplay };
    } catch (e) { STATE.sim = { _err: (e && e.message) || 'sim err' }; }
  }
  // Modo replay/demo — ADITIVO: só entra no /state com AOT_REPLAY_DATE setada (produção não tem a chave).
  if (REPLAY) STATE.replay = { active: true, source: 'env', anchorET: etPretty(new Date(REPLAY.anchorUtcMs)), simNowET: etPretty(effectiveNow()), simNowUtc: effectiveNow().toISOString(), speed: REPLAY.speed, session: t.session, rth: t.rth,
    // W3: declara EXATAMENTE quais fontes estão no passado e quais não. Sem isto, o operador
    // não tem como saber se o que está na tela é histórico coerente ou mistura.
    fontesHistoricas: ['spotgamma (:3500 ?date=)', 'gexbot (:3510/compat)', 'quantdata (:3490 ?date=)', 'menthorq (:3480 ?date=)'],
    fontesAoVivo: ['consolidator', 'alfaomega (:5151 — segue o NT8; use o Market Replay do NT8 p/ casar)',
                   'spotgamma /divergence/* (a rota não honra ?date= — medido)'],
    _idadeNegativa: 'age_s NEGATIVO significa carimbo POSTERIOR ao instante simulado. Numa fonte de ' +
                    '`fontesHistoricas` isso é LOOK-AHEAD e é DEFEITO — foi assim que se descobriram ' +
                    'as duas lacunas de 07/08 (o /signal do QuantData e o SpotGamma sem ?date= no poll). ' +
                    'Nas de `fontesAoVivo` é ESPERADO: elas são o presente por decisão declarada. ' +
                    '⚠️ O age_s do spotgamma vem do asof de /divergence (rota viva), então ele fica ' +
                    'negativo mesmo com o /hiro já histórico — é artefato de indicador, não de dado.',
    _limites: 'QuantData: exposure-strike/oi-strike/heat-map/dark-pool/vol-skew NÃO têm corpo gravado — ' +
              'rotas que dependem delas não são replayáveis. MenthorQ: o net-gex do ES1! é truncado pela ' +
              'captura (JSON inválido), o mesmo defeito que já derruba /exposure/ES ao vivo.' };
  else if (ao && ao.isReplay) STATE.replay = { active: true, source: 'bridge', note: 'NT8 Market Replay (bridge.isReplay) — FASE 0: narrador/Telegram suprimidos. Relógio do terminal segue na FASE 1.', session: t.session, rth: t.rth };   // FASE 0: expõe replay do bridge -> guarda do narrador ativa
  // ── SAÚDE DOS INDICADORES (2026-08-17) ──────────────────────────────────────
  // Roda por ÚLTIMO, de propósito: precisa enxergar v2/sim/replay já anexados,
  // senão as entradas `flagged-off` avaliariam um STATE incompleto e acusariam
  // falha onde há flag desligada. Try/catch porque o medidor de saúde nunca pode
  // ser o que derruba o poll que ele existe para vigiar.
  try { STATE.health = health.evaluate(STATE); }
  catch (e) { STATE.health = { ok: false, severity: 'erro', _err: (e && e.message) || 'health err', alerts: [], batches: [], items: [] }; }
  meta.polls++;
  const live = Object.values(sources).filter(s => s.status === 'live').length;
  const hAl = (STATE.health && STATE.health.alerts) ? STATE.health.alerts.length : 0;
  heartbeat(`ok session=${t.session} live=${live}/6 polls=${meta.polls}${hAl ? ' ALERTAS=' + hAl : ''}`);
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function sendJson(res, code, obj) { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(b); }

// ── Retenção 180 dias: ARQUIVA (move, NUNCA apaga) os meses cujo último dia já passou de 180d. ──
// Move history/trades-YYYY-MM.jsonl → history/archive/. Roda 1x no boot. O /history lê só o ativo
// (janela máx 180d), então meses arquivados saem naturalmente da consulta sem nada ser perdido.
function simHistoryArchive() {
  try {
    if (!fs.existsSync(SIM_HISTORY_DIR)) return;
    const archDir = path.join(SIM_HISTORY_DIR, 'archive');
    const cutoff = new Date(Date.now() - 180 * 86400000);
    for (const f of fs.readdirSync(SIM_HISTORY_DIR)) {
      const m = f.match(/^trades-(\d{4})-(\d{2})\.jsonl$/);
      if (!m) continue;
      const monthEnd = new Date(Date.UTC(+m[1], +m[2], 0, 23, 59, 59));   // último dia do mês
      if (monthEnd < cutoff) {
        if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });
        try { fs.renameSync(path.join(SIM_HISTORY_DIR, f), path.join(archDir, f)); log('history: arquivado ' + f); } catch { }
      }
    }
  } catch { }
}

// ── PARES DO HISTORICO (etapa 6, 2026-09-13) — UMA classificacao, usada pelo AOT (history.html) e pelo NT8
// (AO_HistoryWindow, que consome este endpoint). Registro com `execucoes[]` (ledger do INVICTUS) entra nos pares
// dos instrumentos REALMENTE executados, com P&L por par = soma do pnlUsd das execucoes daquele par. Registro
// sem execucoes (simulador do AOT, ou abertura logica sem ordem) = cesta canonica ES×NQ → par ES_NQ, P&L = totalUsd.
const HIST_PARES = {
  ES_NQ:   { rotulo: 'ES E NQ',   ativos: ['ES', 'NQ'] },
  MES_MNQ: { rotulo: 'MNQ E MES', ativos: ['MES', 'MNQ'] },
  NES_NNQ: { rotulo: 'NES E NNQ', ativos: ['NES', 'NNQ'] },
};
function histParDoAtivo(a) { const u = String(a || '').toUpperCase(); for (const k of Object.keys(HIST_PARES)) if (HIST_PARES[k].ativos.includes(u)) return k; return null; }
function histClassificar(r) {
  const ex = Array.isArray(r.execucoes) ? r.execucoes : [];
  const pnlPorPar = {}; const pares = [];
  for (const e of ex) {
    const k = histParDoAtivo(e && e.ativo); if (!k) continue;
    if (!pares.includes(k)) pares.push(k);
    pnlPorPar[k] = r2((pnlPorPar[k] || 0) + (typeof e.pnlUsd === 'number' ? e.pnlUsd : 0));
  }
  if (!pares.length) { pares.push('ES_NQ'); pnlPorPar.ES_NQ = r2(r.totalUsd || 0); }
  return { pares, pnlPorPar, executado: ex.length > 0 };
}
// KPIs (mesma formula de sempre) sobre um conjunto ja CONTADO, com o P&L dado por pnlOf(r)
function histKpis(counted, pnlOf) {
  let wins = 0, losses = 0, sumWin = 0, sumLoss = 0, total = 0, best = null, worst = null;
  const byReason = {}; const equity = []; let cum = 0, peak = 0, maxDD = 0;
  const chrono = counted.slice().sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
  for (const r of chrono) {
    const p = pnlOf(r) || 0; total += p; cum += p; equity.push({ at: r.closedAt, cum: r2(cum) });
    if (cum > peak) peak = cum; if (peak - cum > maxDD) maxDD = peak - cum;
    if (p > 0) { wins++; sumWin += p; } else if (p < 0) { losses++; sumLoss += p; }
    if (best == null || p > best) best = p; if (worst == null || p < worst) worst = p;
    const rk = (r.reason || '').replace(/_(es|nq)$/, '');   // agrupa es/nq
    byReason[rk] = byReason[rk] || { n: 0, pnl: 0 }; byReason[rk].n++; byReason[rk].pnl = r2(byReason[rk].pnl + p);
  }
  const n = counted.length;
  return { n, wins, losses, winRate: n ? r2(wins / n * 100) : 0, totalUsd: r2(total), avgUsd: n ? r2(total / n) : 0,
           bestUsd: best, worstUsd: worst, maxDrawdownUsd: r2(maxDD),
           profitFactor: sumLoss ? r2(sumWin / Math.abs(sumLoss)) : (sumWin > 0 ? null : 0), byReason, equity };
}
// (2026-09-30, correcao estrutural — defeito 3) ORIGEM da linha, so apresentacao (dado historico intacto):
// simulated:true ou engine 'aot' = SIMULADOR do AOT — nunca execucao, nao e espelho do INVICTUS (amostragem propria);
// engine 'invictus' = executor real. Registro sintetico nunca leva o nome do executor.
function histFonte(r) {
  if (r && (r.simulated === true || r.engine === 'aot')) return { fonte: 'aot_sim', rotulo: 'AOT SIM · SEM EXECUÇÃO' };
  if (r && r.engine === 'invictus') return { fonte: 'invictus', rotulo: 'INVICTUS' };
  return { fonte: 'desconhecida', rotulo: '—' };
}
// le um diretorio de ledger (trades-YYYY-MM.jsonl) — NUNCA escreve
function histLerDir(dir, engineDefault, integ, cutoff, all) {
  if (!dir || !fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => /^trades-\d{4}-\d{2}\.jsonl$/.test(f)).sort();
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }   // linha torta (crash) = ignorada
      integ.totalLines++;
      if (!r.engine) r.engine = engineDefault;
      if (!integ.since || (r.closedAt && r.closedAt < integ.since)) integ.since = r.closedAt;
      if (r.engine === 'invictus' && r.openedAt && (!integ.invictusDesde || r.openedAt < integ.invictusDesde)) integ.invictusDesde = r.openedAt;
      if (r.closedAt && Date.parse(r.closedAt) >= cutoff) all.push(r);
    }
  }
}

// ── RETIRADAS DO HISTORICO OFICIAL (2026-09-14, decisao do operador — handoff §31) ──
// EXCLUSIVAMENTE a ultima sessao OVERNIGHT do INVICTUS antes do RTH ONLY (13/09 18:00 ET → 14/09 09:30 ET): 31 registros
// listados POR ID CANONICO em history-retiradas/invictus-sessao-overnight-20260913.json (derivado dos manifestos imutaveis
// de .claude/backups/rthonly-20260914). Nao e filtro por sessao/turno: qualquer outro registro — inclusive overnight de
// outra sessao — continua. O ledger fisico NUNCA e alterado. Manifesto ilegivel/inconsistente = nada retirado (visivel).
// (2026-09-14, §33) mesmo mecanismo para o AOT: history-retiradas/aot-sessao-overnight-20260913.json (engine aot, 31 ids, mesma sessao).
function histRetiradas(nome) {
  const arquivo = path.join(__dirname, 'history-retiradas', nome || 'invictus-sessao-overnight-20260913.json');
  try {
    const m = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (Array.isArray(m.ids) && m.ids.length === m.total && new Set(m.ids).size === m.total) return { ok: true, arquivo, ids: new Set(m.ids), total: m.total };
  } catch { }
  return { ok: false, arquivo, ids: new Set(), total: 0 };
}

// ── HISTÓRICO de operações (lê os JSONL append-only; NUNCA escreve). Fonte de verdade = os arquivos. ──
// (etapa 6) DUAS fontes, UM historico: o ledger do simulador do AOT (aot/history) + o ledger do executor
// INVICTUS (alfaomega-robo/history, ROBO_CFG.roboDir — mesma config ja usada pela pagina Robô). Cada registro
// leva engine ('aot' | 'invictus'), pares[], pnlPorPar{} e contado (= replay:false, a semantica de SEMPRE).
// KPIs SEPARADOS POR FONTE, nunca somados: `kpis` = AOT SIM (exatamente o de antes), `kpisInvictus` = INVICTUS REAL;
// por par, `porPar[k].aot` e `porPar[k].invictus`. Nenhuma fonte deixa de contar por causa da outra
// (correcao 2026-09-13: a supressao "AOT sim para de contar apos o 1º trade do INVICTUS" foi REMOVIDA — nao autorizada).
// A LISTA sempre devolve tudo (com engine/replay) — transparência total, nada é filtrado do log.
function simHistoryRead(days, includeReplay) {
  const out = { trades: [], kpis: null, porPar: null, pares: HIST_PARES,
                integrity: { appendOnly: true, totalLines: 0, since: null, archivedMonths: 0, invictusLines: 0, invictusDesde: null, invictusDir: null,
                             note: 'append-only · nada removido (meses >180d são arquivados, não apagados) · 2 ledgers (AOT SIM = simulacao sem execucao, nao e espelho do executor + INVICTUS = executor real), 1 historico' } };
  try { const ad = path.join(SIM_HISTORY_DIR, 'archive'); if (fs.existsSync(ad)) out.integrity.archivedMonths = fs.readdirSync(ad).filter(f => /^trades-\d{4}-\d{2}\.jsonl$/.test(f)).length; } catch { }
  try {
    const cutoff = Date.now() - days * 86400000;
    const all = [];
    const igA = { totalLines: 0, since: null, invictusDesde: null };
    const igI = { totalLines: 0, since: null, invictusDesde: null };
    histLerDir(SIM_HISTORY_DIR, 'aot', igA, cutoff, all);
    let invDir = null; try { invDir = path.join(ROBO_CFG.roboDir, 'history'); } catch { invDir = null; }
    try { histLerDir(invDir, 'invictus', igI, cutoff, all); } catch { }
    out.integrity.totalLines = igA.totalLines + igI.totalLines;
    out.integrity.since = [igA.since, igI.since].filter(Boolean).sort()[0] || null;
    out.integrity.invictusLines = igI.totalLines; out.integrity.invictusDesde = igI.invictusDesde; out.integrity.invictusDir = invDir;
    for (const r of all) {
      const c = histClassificar(r);
      r.pares = c.pares; r.pnlPorPar = c.pnlPorPar; r.executado = c.executado;
      r.contado = includeReplay || !r.replay;                       // semantica de sempre; nenhuma supressao por fonte
      const fo = histFonte(r); r.fonte = fo.fonte; r.fonteRotulo = fo.rotulo;   // (2026-09-30) origem inequivoca AOT SIM x INVICTUS
    }
    all.sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));   // mais recente primeiro
    // retirada do OFICIAL so pelos manifestos de IDs, CADA UM restrito a sua fonte (engine) — nunca cruza AOT × INVICTUS
    const ret = histRetiradas(), retA = histRetiradas('aot-sessao-overnight-20260913.json');
    // (2026-09-16) REGISTROS INVALIDOS — preco fundamental ausente/0/NaN numa perna (ex.: exit 0 apos F5 do NT8,
    // id 2026-09-15T22:56:19.188Z-crzom, −$968.682,50 falsos): fora do oficial e dos KPIs por REGRA (histPrecoInvalido)
    // e tambem por manifesto de IDs (history-retiradas/aot-registros-invalidos.json). Ledger fisico intacto.
    const retInv = histRetiradas('aot-registros-invalidos.json');
    const ehInvalido = (r) => histPrecoInvalido(r) || retInv.ids.has(r.id);
    const invalidos = all.filter(ehInvalido);
    const ehRetirada = (r) => ehInvalido(r) || (r.engine === 'invictus' && ret.ids.has(r.id)) || (r.engine === 'aot' && retA.ids.has(r.id));
    const retiradas = all.filter(r => r.engine === 'invictus' && ret.ids.has(r.id)), retiradasAot = all.filter(r => r.engine === 'aot' && retA.ids.has(r.id));
    const vis = all.filter(r => !ehRetirada(r));
    out.trades = vis;
    out.retiradas = { rotulo: 'INVICTUS · ultima sessao OVERNIGHT antes do RTH ONLY (13/09 18:00 ET → 14/09 09:30 ET) — fora dos KPIs e da listagem oficial; ledger intacto',
                      manifestoOk: ret.ok, manifesto: ret.arquivo, manifestoTotal: ret.total, noPeriodo: retiradas.length, trades: retiradas };
    out.retiradasAot = { rotulo: 'AOT SIM · ultima sessao (13/09 18:00 ET → 14/09 09:30 ET) — fora dos KPIs e da listagem oficial; ledger intacto',
                         manifestoOk: retA.ok, manifesto: retA.arquivo, manifestoTotal: retA.total, noPeriodo: retiradasAot.length, trades: retiradasAot };
    out.invalidos = { rotulo: 'registros com preco de entrada/saida invalido (0/NaN/ausente) — fora dos KPIs e da listagem oficial; ledger intacto; resultado NAO calculado',
                      manifestoOk: retInv.ok, manifesto: retInv.arquivo, manifestoTotal: retInv.total, noPeriodo: invalidos.length,
                      trades: invalidos.map(r => Object.assign({}, r, { totalUsd: null, es: r.es ? Object.assign({}, r.es, { pnlUsd: null }) : null, nq: r.nq ? Object.assign({}, r.nq, { pnlUsd: null }) : null, pnlStatus: r.pnlStatus && r.pnlStatus !== 'ok' ? r.pnlStatus : 'exit_desconhecido', contado: false, invalido: true })) };
    out.integrity.invalidos = invalidos.length;
    out.integrity.note += ' · ' + invalidos.length + ' registro(s) com preco invalido fora do oficial (regra + manifesto); resultado nao calculado';
    out.integrity.aotLines = igA.totalLines;
    out.integrity.aotRetiradas = retiradasAot.length;
    out.integrity.aotExibidas = vis.filter(r => r.engine === 'aot').length;
    out.integrity.note += ' · ' + retiradasAot.length + ' AOT retiradas do oficial por manifesto de IDs (mesma sessao 13→14/09)';
    out.integrity.invictusLedgerDesde = igI.invictusDesde;
    out.integrity.invictusRetiradas = retiradas.length;
    out.integrity.invictusExibidas = vis.filter(r => r.engine === 'invictus').length;
    out.integrity.invictusDesde = vis.filter(r => r.engine === 'invictus' && r.openedAt).map(r => r.openedAt).sort()[0] || null;
    out.integrity.note += ' · ' + retiradas.length + ' INVICTUS retiradas do oficial por manifesto de IDs (sessao overnight 13→14/09); ledger fisico intacto';
    const basis = includeReplay ? 'real+replay' : 'somente real (replay:false)';
    const aot = vis.filter(r => r.engine === 'aot'), inv = vis.filter(r => r.engine === 'invictus');
    const cnt = (arr) => arr.filter(r => r.contado);
    // `kpis` = AOT SIM, exatamente como o endpoint sempre devolveu (compatibilidade); INVICTUS REAL em separado
    out.kpis = Object.assign({ fonte: 'aot', countedBasis: basis + ' · AOT SIM' }, histKpis(cnt(aot), r => r.totalUsd), {
      replayCount: aot.filter(r => r.replay).length, realCount: aot.filter(r => !r.replay).length,
      aotCount: aot.length, invictusCount: inv.length,
    });
    out.kpisInvictus = Object.assign({ fonte: 'invictus', countedBasis: basis + ' · INVICTUS REAL' }, histKpis(cnt(inv), r => r.totalUsd), {
      replayCount: inv.filter(r => r.replay).length, realCount: inv.filter(r => !r.replay).length,
    });
    out.porPar = {};
    for (const k of Object.keys(HIST_PARES)) {
      const pnlPar = (r) => (r.pnlPorPar && typeof r.pnlPorPar[k] === 'number') ? r.pnlPorPar[k] : 0;
      const subA = aot.filter(r => r.pares.includes(k)), subI = inv.filter(r => r.pares.includes(k));
      out.porPar[k] = { rotulo: HIST_PARES[k].rotulo, ativos: HIST_PARES[k].ativos,
                        listados: subA.length + subI.length, listadosAot: subA.length, listadosInvictus: subI.length,
                        aot:      Object.assign({ fonte: 'aot',      countedBasis: basis + ' · AOT SIM' },      histKpis(cnt(subA), pnlPar)),
                        invictus: Object.assign({ fonte: 'invictus', countedBasis: basis + ' · INVICTUS REAL' }, histKpis(cnt(subI), pnlPar)) };
    }
  } catch { }
  return out;
}
function serveStatic(res, rel) {
  let clean = decodeURIComponent(rel.split('?')[0]);
  if (clean === '/' || clean === '') clean = 'index.html';
  clean = clean.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');   // tira barras iniciais + traversal
  const file = path.join(PUBLIC, clean);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404 — ' + clean); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════
//  PERFIL DE ACESSO (2026-08-19) — autorizacao, NAO autenticacao.
//
//  QUEM AUTENTICA e o Cloudflare Access, na borda: `aot.murklogic.site` responde 302 para
//  o SSO em TODA rota (verificado 19/08, inclusive /state e /health). Nao ha, e nao deve
//  haver, login/senha/sessao aqui dentro — seria duplicar com menos seguranca o que a
//  infraestrutura ja entrega. Ver o comentario do ingress em ~/.cloudflared/config.yml:
//  "chave no JS de pagina servida e seguranca de mentira".
//
//  O QUE FALTAVA e o que este bloco resolve: o Access diz QUEM entrou, nao O QUE pode fazer.
//  Sem isto, qualquer pessoa que passe pelo SSO alcancava o POST /narrator/config.
//
//  ⚠️ FAIL-CLOSED: sem o header, o perfil e 'operador'. Nunca o contrario. Acesso que nao
//     passou pelo Access (loopback, WSL) jamais recebe admin por omissao.
//
//  ⚠️ LIMITE CONHECIDO E DECLARADO: este gate le um HEADER, e header e forjavel por quem
//     alcanca o :3600 diretamente. Hoje isso e so a propria maquina e a sub-rede do WSL
//     (firewall "AOT BFF 3600 (WSL only)" = 172.25.144.0/20, conferido 19/08). Ou seja:
//     protege contra acesso administrativo ACIDENTAL, nao contra forja deliberada de quem
//     ja esta dentro da maquina. O fechamento rigoroso exige validar a assinatura do JWT
//     `Cf-Access-Jwt-Assertion` contra as chaves publicas do Access — nao implementado.
// ═══════════════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════════════
//  VALIDACAO DA ASSINATURA DO ACCESS (Fase 1, 2026-08-19)
//
//  ANTES: o perfil saia do header `Cf-Access-Authenticated-User-Email` CRU. Isso e forjavel
//  por qualquer processo que alcance o :3600 direto (esta maquina + sub-rede do WSL). Enquanto
//  o gate so protegia o idioma da narracao, o risco era aceitavel e ficou declarado. Ao passar
//  a proteger QUEM ENTRA NO SISTEMA (/admin/access/*), deixou de ser.
//
//  A diretriz ja existia no projeto desde 13/07 (HANDOFF_SESSAO_2026-07-13.md §0.5):
//    "Nunca confiar no header Cf-Access-Authenticated-User-Email cru — validar a ASSINATURA."
//
//  AGORA: le `Cf-Access-Jwt-Assertion`, verifica RS256 contra as chaves publicas do Access,
//  confere `aud` e a validade temporal, e so entao usa o e-mail — tirado do PAYLOAD do token,
//  nunca do header.
//
//  ⚠️ FAIL-CLOSED EM TODAS AS ETAPAS: sem JWT, kid desconhecido, assinatura invalida, aud
//     errado ou expirado => 'operador'. Nunca admin. Falha ao BUSCAR as chaves tambem nega.
//  ⚠️ CONSEQUENCIA ACEITA PELO OPERADOR: acesso local (curl/loopback/WSL) NAO consegue mais
//     ser admin de forma alguma. Administrar exige entrar por https://aot.murklogic.site.
// ═══════════════════════════════════════════════════════════════════════════════════════
const CF_TEAM = 'black-fire-8d32.cloudflareaccess.com';
const CF_AUD  = 'a021fae020a875b1ebc6b796f910950288b451bd3b02e4bae6be4fc3bebbd642';
const CF_CERTS_URL = 'https://' + CF_TEAM + '/cdn-cgi/access/certs';
const CF_CERTS_TTL = 3600 * 1000;   // 1h — as chaves do Access giram raramente
let _cfCerts = { at: 0, porKid: new Map(), erro: null };

async function certsAccess(forcar) {
  if (!forcar && _cfCerts.porKid.size && (Date.now() - _cfCerts.at) < CF_CERTS_TTL) return _cfCerts;
  try {
    const r = await fetch(CF_CERTS_URL, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const m = new Map();
    for (const k of (j.keys || [])) {
      if (!k.kid || k.kty !== 'RSA') continue;
      try { m.set(k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })); } catch (e) { /* chave malformada: ignora */ }
    }
    if (!m.size) throw new Error('nenhuma chave RSA utilizavel');
    _cfCerts = { at: Date.now(), porKid: m, erro: null };
  } catch (e) {
    // NAO zera o cache anterior: chaves boas em memoria continuam validando durante uma
    // indisponibilidade curta da Cloudflare. Sem cache algum => ninguem e admin.
    _cfCerts.erro = e.message || String(e);
  }
  return _cfCerts;
}

const b64url = (x) => Buffer.from(String(x).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Verifica o JWT do Access. Devolve { ok, email, motivo }. Fail-closed em tudo. */
async function verificarJwtAccess(tok) {
  if (!tok || typeof tok !== 'string') return { ok: false, motivo: 'sem Cf-Access-Jwt-Assertion' };
  const p = tok.split('.');
  if (p.length !== 3) return { ok: false, motivo: 'JWT malformado' };
  let cab;
  try { cab = JSON.parse(b64url(p[0]).toString('utf8')); } catch { return { ok: false, motivo: 'cabecalho ilegivel' }; }
  if (cab.alg !== 'RS256') return { ok: false, motivo: 'alg inesperado: ' + cab.alg };   // barra alg=none e HS*

  let cs = await certsAccess(false);
  let chave = cs.porKid.get(cab.kid);
  if (!chave) { cs = await certsAccess(true); chave = cs.porKid.get(cab.kid); }          // kid novo => recarrega uma vez
  if (!chave) return { ok: false, motivo: 'kid desconhecido' + (cs.erro ? ' (falha ao buscar chaves: ' + cs.erro + ')' : '') };

  const okSig = crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), chave, b64url(p[2]));
  if (!okSig) return { ok: false, motivo: 'assinatura invalida' };

  let pl;
  try { pl = JSON.parse(b64url(p[1]).toString('utf8')); } catch { return { ok: false, motivo: 'payload ilegivel' }; }

  const auds = Array.isArray(pl.aud) ? pl.aud : (pl.aud ? [pl.aud] : []);
  if (auds.indexOf(CF_AUD) < 0) return { ok: false, motivo: 'aud nao confere (token de outra aplicacao)' };

  const agora = Math.floor(Date.now() / 1000), folga = 60;
  if (pl.exp && agora > pl.exp + folga) return { ok: false, motivo: 'token expirado' };
  if (pl.nbf && agora + folga < pl.nbf) return { ok: false, motivo: 'token ainda nao valido' };
  if (pl.iss && pl.iss.indexOf(CF_TEAM) < 0) return { ok: false, motivo: 'issuer inesperado' };

  const email = String(pl.email || '').trim().toLowerCase();
  if (!email) return { ok: false, motivo: 'JWT valido mas sem e-mail' };
  return { ok: true, email, motivo: null };
}

const ADMINS_FILE = path.join(BASE, 'auth', 'admins.json');
let _admins = { lista: [], mtime: 0, erro: null };
function carregarAdmins() {
  try {
    const st = fs.statSync(ADMINS_FILE);
    if (st.mtimeMs === _admins.mtime) return _admins;          // cache por mtime: sem I/O por request
    const j = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
    const lista = Array.isArray(j.admins) ? j.admins.filter(x => typeof x === 'string' && x.includes('@')).map(x => x.trim().toLowerCase()) : [];
    _admins = { lista, mtime: st.mtimeMs, erro: null };
  } catch (e) {
    // Arquivo ausente/ilegivel => NINGUEM e admin. Fail-closed tambem na configuracao.
    _admins = { lista: [], mtime: 0, erro: e.code === 'ENOENT' ? 'admins.json ausente' : (e.message || 'ilegivel') };
  }
  return _admins;
}
// ⚠️ ASSINCRONA desde a Fase 1: a verificacao do JWT pode precisar buscar as chaves.
//    O e-mail vem do PAYLOAD ASSINADO. O header cru so e exposto como `emailHeader` para
//    diagnostico — NUNCA para decidir perfil.
async function perfilDe(req) {
  const h = req.headers || {};
  const emailHeader = String(h['cf-access-authenticated-user-email'] || '').trim().toLowerCase() || null;
  const v = await verificarJwtAccess(h['cf-access-jwt-assertion']);
  const a = carregarAdmins();
  const admin = v.ok && a.lista.indexOf(v.email) >= 0;
  return {
    email: v.ok ? v.email : null,
    emailHeader,
    viaAccess: v.ok,
    jwtMotivo: v.motivo,
    perfil: admin ? 'admin' : 'operador',
    adminsErro: a.erro,
  };
}
async function exigirAdmin(req, res) {
  const q = await perfilDe(req);
  if (q.perfil === 'admin') return null;
  sendJson(res, 403, {
    error: 'requer perfil admin',
    perfil: q.perfil,
    via_access: q.viaAccess,
    motivo: !q.viaAccess
      ? 'JWT do Cloudflare Access ausente ou invalido: ' + (q.jwtMotivo || '?') + ' — negado por fail-closed'
      : 'e-mail autenticado nao consta em auth/admins.json',
    email: q.email,
    email_header: q.emailHeader,   // so diagnostico: header cru NAO decide nada
    admins_erro: q.adminsErro,
  });
  return q;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
//  GESTAO DE ACESSO (Fase 2, 2026-08-19) — o operador libera/revoga e-mails pelo painel,
//  sem entrar no dashboard da Cloudflare e sem pedir a ninguem.
//
//  ⚠️ Toda rota daqui exige `await exigirAdmin()`, que desde a Fase 1 valida a ASSINATURA do
//     JWT do Access. Header cru nao entra. Acesso local nao administra.
//  ⚠️ O token da API NUNCA sai do servidor: lido do .env por chamada, nunca em /state, nunca
//     no /whoami, nunca numa resposta. O navegador so ve e-mails.
// ═══════════════════════════════════════════════════════════════════════════════════════
const CF_ACCOUNT = 'a86a3dc644d3c33e4afee99958275aac';
const CF_APP     = 'a8db7d11-1b53-4109-a9c0-63d8c825b95d';   // "Alfa Omega — Terminal e Painel"
const CF_POLICY  = '5856f3e3-04d2-4f45-99ee-c61ec661cd15';   // "Allow — operador"
// ⚠️ HARD-CODED DE PROPOSITO (decisao do operador, 19/08): e-mail de reserva que garante que a
//    lista nunca fica vazia. Uma lista vazia tranca TODO MUNDO para fora do painel, e a
//    recuperacao so pelo dashboard da Cloudflare — exatamente o que esta tela existe p/ evitar.
//    Nao vira config editavel: config editavel pode ser esvaziada pelo mesmo engano.
const CF_EMAIL_PERMANENTE = 'magnumbrokeroficial@gmail.com';
// mesmo padrao ja usado p/ o RELAY_ENV (linha ~146): .env do WSL por caminho UNC
const CF_ENV_FILE = process.env.CF_ACCESS_ENV || '\\\\wsl.localhost\\Ubuntu-24.04\\home\\magnumbrokeroficial\\.cf-access.env';
const ACCESS_AUDIT = path.join(BASE, 'auth', 'access-audit.jsonl');
const CF_API = 'https://api.cloudflare.com/client/v4';

const emailValido = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
// Lido por chamada (nao em cache de modulo): trocar o token no arquivo tem efeito imediato,
// e o valor nao fica residente mais do que o necessario.
const cfToken = () => envOf(CF_ENV_FILE, 'CF_ACCESS_ADMIN_TOKEN');

function auditarAcesso(reg) {
  try {
    fs.mkdirSync(path.dirname(ACCESS_AUDIT), { recursive: true });
    fs.appendFileSync(ACCESS_AUDIT, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, reg)) + '\n');
  } catch (e) { log('audit de acesso falhou: ' + (e.message || e)); }
}

async function cfPolicy(metodo, corpo) {
  const tok = cfToken();
  if (!tok) return { ok: false, erro: 'CF_ACCESS_ADMIN_TOKEN ausente em ' + CF_ENV_FILE, http: 0 };
  const url = CF_API + '/accounts/' + CF_ACCOUNT + '/access/apps/' + CF_APP + '/policies/' + CF_POLICY;
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: Object.assign({ authorization: 'Bearer ' + tok }, corpo ? { 'content-type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.success) {
      // devolve o texto REAL da Cloudflare — o operador precisa saber se foi token expirado,
      // e-mail invalido ou permissao faltando, nao um "erro generico".
      const msg = (j && j.errors || []).map(e => (e.code ? '[' + e.code + '] ' : '') + e.message).join(' · ');
      return { ok: false, http: r.status, erro: msg || ('HTTP ' + r.status) };
    }
    return { ok: true, http: r.status, result: j.result };
  } catch (e) {
    return { ok: false, http: 0, erro: e.name === 'TimeoutError' ? 'timeout falando com a Cloudflare' : (e.message || 'erro de rede') };
  }
}

const emailsDe = (inc) => (inc || []).filter(i => i && i.email && i.email.email).map(i => String(i.email.email).trim().toLowerCase());

function lerCorpo(req, limite) {
  return new Promise((resolve) => {
    let b = ''; let estourou = false;
    req.on('data', c => { b += c; if (b.length > (limite || 4096)) { estourou = true; req.destroy(); } });
    req.on('end', () => { if (estourou) return resolve(null); try { resolve(JSON.parse(b || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

/** grant|revoke com read-modify-write. `dry` devolve antes/depois sem escrever. */
async function mudarAcesso(acao, emailBruto, quem, dry) {
  const email = String(emailBruto || '').trim().toLowerCase();
  const base = { acao, email_alvo: email || null, por: quem.email, via_access: quem.viaAccess, dry: !!dry };

  if (!emailValido(email)) {
    auditarAcesso(Object.assign({}, base, { resultado: 'recusado', motivo: 'e-mail invalido' }));
    return { code: 400, body: { ok: false, erro: 'e-mail invalido: ' + (emailBruto || '(vazio)') } };
  }
  if (acao === 'revoke' && email === CF_EMAIL_PERMANENTE) {
    auditarAcesso(Object.assign({}, base, { resultado: 'recusado', motivo: 'e-mail permanente' }));
    return { code: 403, body: { ok: false, erro: 'PERMANENTE: ' + CF_EMAIL_PERMANENTE + ' nao pode ser revogado por esta interface. ' +
      'Ele existe para a lista nunca ficar vazia — lista vazia tranca todos para fora do painel. ' +
      'Se precisar mesmo remove-lo, so pelo dashboard da Cloudflare, com consciencia do risco.' } };
  }

  const g = await cfPolicy('GET');
  if (!g.ok) {
    auditarAcesso(Object.assign({}, base, { resultado: 'erro', motivo: 'GET: ' + g.erro }));
    return { code: 502, body: { ok: false, erro: 'nao consegui LER a politica: ' + g.erro, http: g.http } };
  }
  const pol = g.result || {};
  const antes = emailsDe(pol.include);

  if (acao === 'grant' && antes.indexOf(email) >= 0) {
    auditarAcesso(Object.assign({}, base, { resultado: 'nada-a-fazer', include_antes: antes.length, include_depois: antes.length }));
    return { code: 200, body: { ok: true, nada_a_fazer: true, mensagem: email + ' ja estava liberado', emails: antes } };
  }
  if (acao === 'revoke' && antes.indexOf(email) < 0) {
    auditarAcesso(Object.assign({}, base, { resultado: 'nada-a-fazer', include_antes: antes.length, include_depois: antes.length }));
    return { code: 200, body: { ok: true, nada_a_fazer: true, mensagem: email + ' nao estava na lista', emails: antes } };
  }

  const incNovo = acao === 'grant'
    ? (pol.include || []).concat([{ email: { email } }])
    : (pol.include || []).filter(i => !(i && i.email && String(i.email.email).trim().toLowerCase() === email));
  const depois = emailsDe(incNovo);

  // read-modify-write: SO o include muda. name/decision/precedence/session_duration voltam
  // exatamente como vieram — nunca montar a politica do zero.
  const corpo = {
    name: pol.name, decision: pol.decision, precedence: pol.precedence,
    include: incNovo, exclude: pol.exclude || [], require: pol.require || [],
    session_duration: pol.session_duration,
  };

  if (dry) {
    auditarAcesso(Object.assign({}, base, { resultado: 'dry-run', include_antes: antes.length, include_depois: depois.length }));
    return { code: 200, body: { ok: true, dry_run: true, antes, depois, payload: corpo } };
  }

  const put = await cfPolicy('PUT', corpo);
  if (!put.ok) {
    auditarAcesso(Object.assign({}, base, { resultado: 'erro', motivo: 'PUT: ' + put.erro, include_antes: antes.length }));
    return { code: 502, body: { ok: false, erro: 'nao consegui GRAVAR a politica: ' + put.erro, http: put.http, antes } };
  }
  const conf = await cfPolicy('GET');
  const final = conf.ok ? emailsDe((conf.result || {}).include) : depois;
  auditarAcesso(Object.assign({}, base, { resultado: 'ok', include_antes: antes.length, include_depois: final.length }));
  return { code: 200, body: { ok: true, acao, email, antes, depois: final } };
}


// ══════════════════════════════════════════════════════════════════════════════════════
//  ABA ROBÔ — agregador READ-ONLY (2026-08-31)
//  Origem de cada campo documentada em HANDOFF_CONTINUACAO_FINAL.md §22 (mapeamento) e
//  §21/§23 (proveniência do Reactor). Regras que este bloco NÃO pode violar:
//   1. NUNCA chamar o :5152 (§12.7) — nem GET. Posição/ordens saem UNAVAILABLE com motivo.
//   2. NUNCA inventar campo. O que não existe na fonte vira { gap: true, origem: '...' }.
//   3. NUNCA rotular stop como "protegido" (§9): não há transporte de stop; é plano/projeção.
//   4. O ledger tem centenas de MB — ler SÓ o tail por byte-offset, nunca o arquivo inteiro.
//   5. Distinguir "fonte caiu" de "mercado não deu sinal" — são estados diferentes.
// ══════════════════════════════════════════════════════════════════════════════════════
const ROBO_CFG = {
  relay:      process.env.AOT_ROBO_RELAY || 'http://127.0.0.1:3457/v1/latest',
  roboDir:    process.env.AOT_ROBO_DIR   || 'C:\\Users\\ADM\\Documents\\NinjaTrader 8\\alfaomega-robo',
  aodiag:     process.env.AOT_ROBO_DIAG  || 'C:\\Users\\ADM\\Documents\\NinjaTrader 8\\alfaomega_erros.log',
  nt8cfg:     process.env.AOT_ROBO_NT8CFG || '\\\\wsl.localhost\\Ubuntu-24.04\\home\\magnumbrokeroficial\\darkflow-web\\robo-trade\\config\\nt8.json',
  REACTOR_MIN: 65,      // AlfaOmegaRoboEntry.cs:51 (ReactorMin) — e robo-trade/src/signal-engine.js:69
  STALE_MS:    90000,   // AlfaOmegaRobo.cs:310 — StaleGuard(snap, agora, 90)
  POLL_MS:     2000,    // AlfaOmegaRobo.cs:238 — AoRoboConfig.PollMs
  PRODUCAO_MS: 30000,   // darkcode-sync.js:516 — --watch, refreshMin 0.5
  TIMEOUT_MS:  4000,
  nt8log: process.env.AOT_ROBO_NT8LOG || 'C:\\Users\\ADM\\Documents\\NinjaTrader 8\\log',
};
// multiplicador por instrumento — robo-trade/config/nt8.json (MES $5/pt, MNQ $2/pt)
const ROBO_MULT = { ES: 5, NQ: 2 };
const ROBO_INSTR = { ES: 'MES 09-26', NQ: 'MNQ 09-26' };
const GAP = (origem) => ({ gap: true, origem });

/** Lê os últimos `n` bytes de um arquivo sem carregá-lo inteiro (ledger tem centenas de MB). */
function roboTail(file, n) {
  let fd = null;
  try {
    const st = fs.statSync(file);
    const len = Math.min(n, st.size);
    const buf = Buffer.alloc(len);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, len, Math.max(0, st.size - len));
    return { ok: true, texto: buf.toString('utf8'), bytes: st.size, mtime: st.mtimeMs };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} } }
}

/** Ledger do mês corrente: alfaomega-robo/logs/audit-YYYY-MM.jsonl */
function roboLedgerPath() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return path.join(ROBO_CFG.roboDir, 'logs', `audit-${d.getFullYear()}-${mm}.jsonl`);
}

/** Último evento do ledger (última linha JSON completa do tail). */
function roboUltimoEvento() {
  const f = roboLedgerPath();
  const t = roboTail(f, 65536);
  if (!t.ok) return { disponivel: false, motivo: 'ledger ilegivel: ' + t.erro, arquivo: f };
  const linhas = t.texto.split('\n').filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]);
      return { disponivel: true, arquivo: f, bytes: t.bytes, ts: j.ts || null,
        evento: j.event || null, symbol: j.symbol || null, resultado: j.result || null,
        motivo: (j.payload && j.payload.reason) || null };
    } catch { /* linha cortada pelo corte do tail — tenta a anterior */ }
  }
  return { disponivel: false, motivo: 'nenhuma linha JSON completa no tail', arquivo: f, bytes: t.bytes };
}

/** Último marco e última RECUSA do AoDiag (AoBasicEntryBoleta.cs:1647 é o único que grava RECUSA). */
function roboAoDiag() {
  const t = roboTail(ROBO_CFG.aodiag, 32768);
  if (!t.ok) return { disponivel: false, motivo: 'AoDiag ilegivel: ' + t.erro, arquivo: ROBO_CFG.aodiag };
  const linhas = t.texto.split('\n').filter(Boolean);
  const recusas = linhas.filter(l => l.indexOf('RECUSA') >= 0);
  return {
    disponivel: true, arquivo: ROBO_CFG.aodiag, bytes: t.bytes,
    ultimo_marco: linhas.length ? linhas[linhas.length - 1].slice(0, 300) : null,
    ultima_recusa: recusas.length ? recusas[recusas.length - 1].slice(0, 300) : null,
    recusas_no_tail: recusas.length,
    _nota: recusas.length ? null
      : 'nenhuma RECUSA no tail — esperado: so a boleta grava (AoBasicEntryBoleta.cs:1647), exige clique do operador',
  };
}

/** Contenção do AddOn C#: kill.flag + shadow. Fail-closed na leitura. */
function roboContencao() {
  const kf = path.join(ROBO_CFG.roboDir, 'config', 'kill.flag');
  const rt = path.join(ROBO_CFG.roboDir, 'config', 'runtime.json');
  let kill = { ativo: null, motivo: 'nao verificado' };
  try {
    const st = fs.statSync(kf);
    kill = { ativo: true, arquivo: kf, bytes: st.size, mtime: new Date(st.mtimeMs).toISOString() };
  } catch (e) {
    kill = (e && e.code === 'ENOENT')
      ? { ativo: false, arquivo: kf, _nota: 'kill.flag ausente — o AddOn NAO esta contido por este nivel' }
      : { ativo: null, arquivo: kf, motivo: 'ilegivel: ' + e.message };
  }
  let shadow = { valor: null, motivo: 'nao verificado' };
  try {
    const j = JSON.parse(fs.readFileSync(rt, 'utf8'));
    shadow = { valor: (typeof j.shadow === 'boolean' ? j.shadow : null), arquivo: rt,
      _nota: typeof j.shadow === 'boolean' ? null : 'campo shadow ausente ou nao-booleano' };
  } catch (e) { shadow = { valor: null, arquivo: rt, motivo: 'ilegivel: ' + e.message }; }
  return { kill_switch: kill, shadow };
}

/**
 * Estado da CONEXÃO do NinjaTrader, lido do log do próprio NT8 (arquivo local, read-only).
 * 🔴 NÃO chama o :5152 — §12.7. A fonte é o log que o NT8 já escreve.
 *
 * Por que este bloco existe (2026-08-31): as duas pernas da conexão caem de forma
 * INDEPENDENTE e cada uma quebra uma coisa diferente:
 *   · "alimentação de preço" (price feed) — sem ela o motor de SIMULAÇÃO rejeita toda ordem
 *     ("Não há nenhum dados de mercado disponíveis..."), que foi a causa das rejeições de
 *     C2/C3/C4 no HANDOFF §7/§17.
 *   · "conexão primária" (order routing) — sem ela a ordem NÃO ROTEIA, independente de dado.
 * Medido em 31/08: 03:45 preço caiu com primária ok; 05:41 preço voltou e a PRIMÁRIA caiu.
 * Mostrar só uma das duas daria falsa confiança.
 */
function roboConexaoNT8() {
  const dir = ROBO_CFG.nt8log;
  let arquivo = null;
  try {
    const d = new Date();
    const dia = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    // pega o log do dia mais recente por mtime (o NT8 pode ter varios .00000/.00001)
    const cands = fs.readdirSync(dir)
      .filter(f => f.indexOf('log.' + dia + '.') === 0 && f.slice(-7) === '.pt.txt')
      .map(f => { const p = path.join(dir, f); return { p, m: fs.statSync(p).mtimeMs }; })
      .sort((a, b) => b.m - a.m);
    if (!cands.length) return { disponivel: false, motivo: 'nenhum log do NT8 para hoje em ' + dir, dia };
    arquivo = cands[0].p;
  } catch (e) {
    return { disponivel: false, motivo: 'pasta de log do NT8 ilegivel: ' + e.message, arquivo: dir };
  }
  const t = roboTail(arquivo, 65536);
  if (!t.ok) return { disponivel: false, motivo: 'log do NT8 ilegivel: ' + t.erro, arquivo };

  const linhas = t.texto.split('\n').filter(l => l.indexOf('alimentação de preço') >= 0);
  if (!linhas.length) {
    return { disponivel: true, arquivo, sem_evento: true,
      _nota: 'nenhum evento de conexao no log de hoje — o NT8 so escreve quando o estado MUDA. Ausencia de evento significa "nao mudou desde ontem", nao "conectado".' };
  }
  const ult = linhas[linhas.length - 1];
  const mNome = ult.match(/\|\d\|\d\|([^:]+):/);
  const mPri  = ult.match(/conexão primária = ([^,]+)/);
  const mPre  = ult.match(/alimentação de preço = (.+?)\s*$/);
  const mTs   = ult.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const ts    = mTs ? mTs[1] : null;
  const tsMs  = ts ? Date.parse(ts.replace(' ', 'T')) : null;
  const pri   = mPri ? mPri[1].trim() : null;
  const pre   = mPre ? mPre[1].trim() : null;
  const okPri = pri === 'Conectado';
  const okPre = pre === 'Conectado';

  const impede = [];
  if (!okPri) impede.push('conexao primaria "' + pri + '" — a ordem NAO ROTEIA (canal de ordens/conta)');
  if (!okPre) impede.push('alimentacao de preco "' + pre + '" — sem dado de mercado o motor de simulacao REJEITA toda ordem (HANDOFF §7/§17)');

  return {
    disponivel: true, arquivo,
    conexao: mNome ? mNome[1].trim() : null,
    primaria: pri, preco: pre,
    ok_primaria: okPri, ok_preco: okPre,
    operavel: okPri && okPre,
    ts, idade_min: tsMs ? Math.round((Date.now() - tsMs) / 60000) : null,
    impede,
    _nota: 'lido do log do NT8 (arquivo local). O NT8 so escreve quando o estado MUDA — este e o ULTIMO estado registrado, nao um heartbeat.',
    _regra_l2: 'HANDOFF §25.3: a regra fixa do projeto manda confirmar magnoramos.mrv (L2). Se a conexao acima nao for essa, o L2 NAO esta confirmado — verificar antes de qualquer validacao.',
  };
}

/** dry_run do 2º motor (robo-trade Node, WSL). UNC pode falhar — nunca derruba a rota. */
function roboSegundoMotor() {
  try {
    const j = JSON.parse(fs.readFileSync(ROBO_CFG.nt8cfg, 'utf8'));
    return { disponivel: true, dry_run: (typeof j.dry_run === 'boolean' ? j.dry_run : null),
      base_url: j.base_url || null, arquivo: ROBO_CFG.nt8cfg,
      _nota: 'robo-trade (Node/WSL) le o MESMO relay e mira a MESMA conta. dry_run=true bloqueia PLACE/BRACKET antes do POST (nt8-client.js:229,278). Kill switch dele e OUTRO arquivo — o kill.flag do NT8 nao o contem.' };
  } catch (e) {
    return { disponivel: false, motivo: 'config do robo-trade ilegivel (WSL/UNC): ' + e.message, arquivo: ROBO_CFG.nt8cfg };
  }
}

/** GET no relay :3457. Fail-closed: qualquer falha devolve ok:false COM MOTIVO (nunca objeto vazio). */
async function roboRelay() {
  try {
    const r = await fetch(ROBO_CFG.relay, { headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(ROBO_CFG.TIMEOUT_MS) });
    if (!r.ok) return { ok: false, fonte: 'http', motivo: 'relay HTTP ' + r.status };
    return { ok: true, fonte: 'live', data: await r.json() };
  } catch (e) {
    return { ok: false, fonte: e.name === 'TimeoutError' ? 'timeout' : 'neterr',
      motivo: 'relay :3457 inacessivel (' + (e.message || e.name) + ')' };
  }
}

/** Estado completo da aba ROBÔ para um símbolo. */
async function roboState(sym) {
  const agora = Date.now();
  const rr = await roboRelay();
  const cont = roboContencao();
  const base = {
    ok: true, ts: new Date(agora).toISOString(), symbol: sym,
    _fonte_reactor: 'R2 — darkflow-web/signal-engine.js:502 (reactorProb 3 args), via oi-latest.json -> relay :3457. NAO e o Reactor do Telegram (R1, bot-sinal.js:87) nem o do painel DarkFlow (R1-linha, index.html:955). Ver HANDOFF §21/§23.',
  };

  // ── EXECUÇÃO (independe do relay) ───────────────────────────────────────────────────
  const execucao = {
    posicao_atual:  { unavailable: true, motivo: 'leitura do :5152 nao autorizada (HANDOFF §12.7) — GET /positions' },
    ordens_abertas: { unavailable: true, motivo: 'leitura do :5152 nao autorizada (HANDOFF §12.7) — GET /orders' },
    estado_da_ordem:{ unavailable: true, motivo: 'leitura do :5152 nao autorizada (HANDOFF §12.7) — GET /orders' },
    guards: {
      _nota: 'NAO ha endpoint que reporte os guards em vigor. A politica e declarada PELO CONSUMIDOR a cada POST (S1/E2, HANDOFF §9). Abaixo: politica declarada, nao estado lido do servidor.',
      politica_por_acao: {
        'LONG · SHORT':                      { requireFlat: true,  maxPositions: 1, rota: '/orders/place' },
        'ADD1-4 · PARCIAL1-3 · REVERTER':    { requireFlat: false, maxPositions: 2, rota: '/orders/place' },
        'ZERAR':                             { requireFlat: null,  maxPositions: null, rota: '/positions/flatten', obs: 'nao le guards' },
        'AoControlCenter':                   { requireFlat: true,  maxPositions: 1, obs: 'passa 6 args -> defaults' },
      },
    },
    kill_switch: cont.kill_switch,
    shadow: cont.shadow,
    conta:       { valor: 'Sim101', origem: 'robo-trade/config/runtime.json (config do motor Node)', _nota: 'o AddOn C# recebe a conta no POST; nao publica a sua' },
    instrumento: { valor: ROBO_INSTR[sym] || null, origem: 'robo-trade/config/nt8.json', _nota: 'atualizar no rollover 09-26 -> 12-26' },
    ultimo_evento: roboUltimoEvento(),
    aodiag: roboAoDiag(),
    segundo_motor: roboSegundoMotor(),
    conexao_nt8: roboConexaoNT8(),
  };

  // ── relay fora do ar → UNAVAILABLE explícito, jamais "sem sinal" ─────────────────────
  if (!rr.ok) {
    return Object.assign(base, {
      reactor: { unavailable: true, motivo: rr.motivo, fonte_falha: rr.fonte },
      estrategia: { unavailable: true, motivo: rr.motivo },
      trade: { unavailable: true, motivo: rr.motivo },
      execucao,
      decisao: { estado: 'UNAVAILABLE', motivo: rr.motivo,
        _nota: 'relay indisponivel NAO e "sem sinal" — sao estados diferentes (AlfaOmegaRoboRelay.cs:20-24)' },
      gaps: roboGaps(),
    });
  }

  const d = rr.data || {};
  const sig = (d.signals || {})[sym] || null;
  const ins = (d.instruments || {})[sym] || null;
  const relayTs = (d.signals || {}).ts || null;
  const idade = relayTs ? (agora - relayTs) : null;
  const stale = idade === null ? true : idade > ROBO_CFG.STALE_MS;

  if (!sig || !ins) {
    return Object.assign(base, {
      reactor: { unavailable: true, motivo: 'relay respondeu mas sem bloco signals/instruments para ' + sym },
      estrategia: { unavailable: true, motivo: 'idem' }, trade: { unavailable: true, motivo: 'idem' },
      execucao,
      decisao: { estado: 'UNAVAILABLE', motivo: 'relay sem signals/instruments para ' + sym },
      gaps: roboGaps(),
    });
  }

  const pct = (typeof sig.reactor_pct === 'number') ? sig.reactor_pct : null;
  const dir = (sig.reactor_dir === 'ALTA' || sig.reactor_dir === 'BAIXA') ? sig.reactor_dir : null;
  const comp = sig.componentes || null;

  const avisos = [];
  if (comp && comp.hiro === null) avisos.push(
    'HIRO fora da conta (peso 25% renormalizado). CAUSA RAIZ: darkcode-sync.js calcula os signals na linha 423, mas so preenche flow_hiro na linha 456 — o Reactor nunca ve o HIRO. Medido em 100% de 9.181 observacoes (HANDOFF §23.6). Atencao: hiro_stale=false aqui significa "nao consultado", nao "fresco".');
  if (comp && typeof comp.s === 'number' && Math.abs(comp.s) >= 1)
    avisos.push('modelo SATURADO (|s|=1, no clamp) — perde poder discriminante (HANDOFF §23.5)');
  if (comp && typeof comp.dex === 'number' && Math.abs(comp.dex) >= 1)
    avisos.push('componente DEX no clamp — escala de normalizacao pequena demais (HANDOFF §23.5)');
  if (comp && typeof comp.cvr === 'number' && Math.abs(comp.cvr) >= 1)
    avisos.push('componente CVR no clamp — idem');

  const reactor = {
    fonte: 'relay :3457 /v1/latest -> signals.' + sym,
    implementacao: 'R2 (reactorProb 3 args) — darkflow-web/signal-engine.js:502',
    direcao: dir, percentual: pct,
    threshold: ROBO_CFG.REACTOR_MIN,
    timestamp: relayTs, timestamp_iso: relayTs ? new Date(relayTs).toISOString() : null,
    idade_ms: idade, idade_s: idade === null ? null : Math.round(idade / 1000),
    fresh: !stale, stale,
    stale_limite_s: ROBO_CFG.STALE_MS / 1000,
    cadencia: { producao_s: ROBO_CFG.PRODUCAO_MS / 1000, poll_motor_s: ROBO_CFG.POLL_MS / 1000,
      _nota: 'o motor rele ~15x o MESMO numero entre atualizacoes; a idade real varia de 0 a 30 s' },
    componentes: comp, avisos,
  };

  const direcaoFinal = sig.direction || null;
  const divergencia = (dir && direcaoFinal &&
    ((dir === 'ALTA' && /SHORT|SELL|BAIXA/.test(direcaoFinal)) ||
     (dir === 'BAIXA' && /LONG|BUY|ALTA/.test(direcaoFinal))))
    ? `reactor_dir=${dir} mas direction=${direcaoFinal}` : null;

  const estrategia = {
    estrategias_ativas: sig.estrategias_ativas || [],
    estrategias_inativas: sig.estrategias_inativas || [],
    menthorq: GAP('MenthorQ nao vem no relay :3457; fonte candidata = menthorq-api :3480 (AlfaOmegaRoboEntryMq.cs)'),
    confluencias: sig.confluence || null,
    activegate: { ativo: (typeof sig.activegate === 'boolean' ? sig.activegate : null), motivo: sig.activegate_reason || null },
    gamma: { regime: sig.regime || null, sinal: sig.gamma_sign || null,
      zero_gamma: (typeof sig.zero_gamma === 'number' ? sig.zero_gamma : null),
      conflito: (typeof sig.regime_conflict === 'boolean' ? sig.regime_conflict : null),
      condition: ins.gamma_condition || null },
    gates: { _nota: 'os gates do AddOn C# nao sao publicados por endpoint; o ultimo veredito observavel esta em execucao.ultimo_evento (ledger). Os gates do robo-trade Node sao market_window -> stale -> news -> risk -> nt8_reachable -> propfirm -> position -> dedup.' },
    direcao_final: direcaoFinal,
    score: { confidence: sig.confidence ?? null, bull_pct: sig.bull_pct ?? null,
      bear_pct: sig.bear_pct ?? null, confluence_score: (sig.confluence || {}).score ?? null },
    motivo_da_decisao: sig.reasons || [],
    status: sig.status || null,
    sessao: sig.session_time || null,
    divergencia,
  };

  // ── TRADE PROJETADO — projeção, NUNCA proteção ativa ────────────────────────────────
  const mult = ROBO_MULT[sym] || null;
  const contratos = 1;   // robo-trade/config/runtime.json -> sizing.fixed
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  const entry = num(sig.entry), stop = num(sig.stop), t1 = num(sig.target1), t2 = num(sig.target2);
  const usd = (a, b) => (a !== null && b !== null && mult) ? Math.round(Math.abs(a - b) * mult * contratos * 100) / 100 : null;
  const trade = {
    _semantica: 'PROJECAO/PLANO. NAO existe stop transportado: Submit monta orderType:"market" fixo e nenhuma ordem de stop chega ao broker (HANDOFF §9). Rotulos: "stop lim." / "stop estrat." — NUNCA "stop protegido".',
    entrada: entry, stop, alvo1: t1, alvo2: t2,
    alvo3: GAP('nao produzido pelo motor — signal-engine.js so gera target1/target2. Origem candidata: 3o nivel de vbpi_levels[] ou nova saida do motor'),
    rr: num(sig.rr),
    quantidade: contratos, contratos,
    multiplicador: mult,
    risco_usd: usd(entry, stop),
    lucro_presumido_usd: { alvo1: usd(t1, entry), alvo2: usd(t2, entry), alvo3: null },
    prejuizo_presumido_usd: usd(entry, stop),
    max_risk_usd: { valor: 150, origem: 'robo-trade/config/runtime.json' },
    _calculo: '|preco - entrada| x multiplicador x contratos (MES $5/pt, MNQ $2/pt) — derivado nesta rota, nao vem pronto de nenhuma fonte',
    distancia_dos_niveis: sig.vbpi_levels || [],
    suporte: sig.support || null, resistencia: sig.resistance || null,
    stop_sanity: sig.stop_sanity || null,
    spot: num(sig.spot) ?? num(ins.spot),
  };

  // ── DECISÃO — fail-closed, primeiro que casar vence ─────────────────────────────────
  const cadeia = [];
  let estado = null, motivo = null;
  const marca = (e, m) => { cadeia.push({ estado: e, motivo: m }); if (!estado) { estado = e; motivo = m; } };

  if (cont.kill_switch.ativo === true)
    marca('KILL SWITCH', 'kill.flag existe (' + cont.kill_switch.arquivo + ')');
  if (cont.shadow.valor === true)
    marca('SHADOW', 'runtime.json shadow=true — o AddOn nao envia ordem real');
  if (d.trading_enabled !== true)
    marca('ENTRADA BLOQUEADA', 'interruptor de mesa: trading_enabled=' + JSON.stringify(d.trading_enabled) +
      ((d.desk_status && d.desk_status.reason) ? ' (' + d.desk_status.reason + ')' : ''));
  // conexao do NT8 — as duas pernas caem separadas e cada uma quebra uma coisa diferente
  if (execucao.conexao_nt8 && execucao.conexao_nt8.disponivel && execucao.conexao_nt8.impede && execucao.conexao_nt8.impede.length)
    marca('ENTRADA BLOQUEADA', 'NT8: ' + execucao.conexao_nt8.impede.join(' · '));
  if (stale)
    marca('STALE', 'sinal com ' + (idade === null ? '?' : Math.round(idade / 1000)) + 's (limite ' + (ROBO_CFG.STALE_MS / 1000) + 's)');
  if (pct === null || dir === null)
    marca('SEM SINAL', 'reactor_pct/reactor_dir ausente ou indefinido');
  if (sig.status === 'SIT_ON_HANDS')
    marca('AGUARDANDO CONDIÇÃO', 'status=SIT_ON_HANDS');
  if (pct !== null && pct < ROBO_CFG.REACTOR_MIN)
    marca('AGUARDANDO CONDIÇÃO', 'reactor ' + pct + '% < threshold ' + ROBO_CFG.REACTOR_MIN + '%');
  if (divergencia)
    marca('AGUARDANDO CONDIÇÃO', 'divergencia: ' + divergencia);
  if (!estado) {
    estado = 'ENTRADA AUTORIZADA';
    motivo = 'reactor ' + pct + '% ' + dir + ' >= ' + ROBO_CFG.REACTOR_MIN + '%, sinal fresco (' +
      Math.round(idade / 1000) + 's), sem bloqueio nesta camada';
    cadeia.push({ estado, motivo });
  }

  const decisao = {
    estado, motivo, cadeia,
    _escopo: 'Esta decisao reflete SOMENTE o que e observavel sem chamar o :5152. Os guards do servidor (requireFlat/maxPositions) e a posicao real NAO estao incluidos — logo "ENTRADA AUTORIZADA" aqui significa "nada nesta camada bloqueia", NAO "a ordem passaria".',
  };

  return Object.assign(base, {
    reactor, estrategia, trade, execucao, decisao,
    mesa: { trading_enabled: d.trading_enabled ?? null, motivo: (d.desk_status || {}).reason || null },
    gaps: roboGaps(),
  });
}

/** GAPs conhecidos — HANDOFF §22.7. Declarados sempre, para a UI nunca fingir completude. */
function roboGaps() {
  return [
    { id: 'GAP-1', campo: 'alvo 3', origem: 'nao produzido pelo motor (signal-engine.js gera so target1/target2)' },
    { id: 'GAP-2', campo: 'quantidade/contratos do AddOn C#', origem: 'so existe a config do motor Node; o AddOn recebe qty no POST' },
    { id: 'GAP-3', campo: 'guards em vigor', origem: 'sem endpoint — politica declarada pelo consumidor (HANDOFF §9)' },
    { id: 'GAP-4', campo: 'RECUSA no AoDiag', origem: 'AoBasicEntryBoleta.cs:1647 — exige NT8 aberto + boleta + 1 clique do operador' },
    { id: 'GAP-5', campo: 'ProbFinalES/NQ (NT8)', origem: 'declarados e lidos mas NUNCA escritos => valem sempre 0. NAO usar como fonte (HANDOFF §21.6)' },
    { id: 'GAP-6', campo: 'risco/lucro em USD', origem: 'derivado nesta rota a partir de entry/stop/target x multiplicador — nao vem pronto' },
    { id: 'GAP-7', campo: 'estrategias MenthorQ', origem: 'nao vem no relay :3457; candidata = menthorq-api :3480' },
    { id: 'GAP-8', campo: 'posicao/ordens/estado da ordem', origem: ':5152 — leitura nao autorizada (HANDOFF §12.7)' },
  ];
}

const server = http.createServer(async (req, res) => {
  let u; try { u = new URL(req.url, 'http://localhost'); } catch { return sendJson(res, 400, { error: 'bad url' }); }
  const p = u.pathname;

  if (p === '/health') {
    const live = STATE.sources ? Object.entries(STATE.sources).filter(([, s]) => s.status === 'live').map(([k]) => k) : [];
    // wiring: p/ diagnosticar de fora QUAL origem e QUAIS chaves estão ativas — sem expor segredo
    const wiring = {}; for (const k of Object.keys(SRC)) wiring[k] = { url: SRC[k], keyed: !!KEYS[k] };
    const replay = REPLAY ? { active: true, anchorET: etPretty(new Date(REPLAY.anchorUtcMs)), simNowET: etPretty(effectiveNow()), speed: REPLAY.speed, rth: etState().rth } : null;
    return sendJson(res, 200, { ok: true, service: 'aot-bff', port: PORT, bind: BIND, origin: ORIGIN, stackMode: STACK_MODE, replay, session: (STATE.session || etState().session), asof: STATE.asof, polls: meta.polls, sources_live: live, sources: STATE.sources || null, wiring });
  }
  // A UI le isto p/ mostrar/esconder controles administrativos. NAO e trava de seguranca —
  // a trava e o exigirAdmin() na rota; esconder botao e conveniencia, nao protecao.
  // ── ADMIN · gestao de acesso ────────────────────────────────────────────────
  if (p === '/admin/access/list') {
    if (await exigirAdmin(req, res)) return;
    const g = await cfPolicy('GET');
    if (!g.ok) return sendJson(res, 502, { ok: false, erro: g.erro, http: g.http });
    const emails = emailsDe((g.result || {}).include);
    return sendJson(res, 200, { ok: true, emails, permanente: CF_EMAIL_PERMANENTE,
      politica: { nome: (g.result || {}).name, id: CF_POLICY }, total: emails.length });
  }
  if ((p === '/admin/access/grant' || p === '/admin/access/revoke') && req.method === 'POST') {
    const quem = await perfilDe(req);
    if (quem.perfil !== 'admin') { if (await exigirAdmin(req, res)) return; }
    const corpo = await lerCorpo(req, 2048);
    if (!corpo) return sendJson(res, 400, { ok: false, erro: 'corpo JSON invalido ou grande demais' });
    const acao = p.endsWith('/grant') ? 'grant' : 'revoke';
    const dry = u.searchParams.get('dry') === '1';
    const r = await mudarAcesso(acao, corpo.email, quem, dry);
    return sendJson(res, r.code, r.body);
  }

  if (p === '/whoami') { const q = await perfilDe(req); return sendJson(res, 200, { email: q.email, perfil: q.perfil, via_access: q.viaAccess, jwt_motivo: q.jwtMotivo, email_header: q.emailHeader, admins_erro: q.adminsErro }); }
  if (p === '/state') return sendJson(res, 200, STATE);
  if (p === '/raw') { const src = u.searchParams.get('src'); if (src && STATE.deep && STATE.deep[src]) return sendJson(res, 200, STATE.deep[src]); return sendJson(res, 404, { error: 'fonte desconhecida', have: STATE.deep ? Object.keys(STATE.deep) : [] }); }
  if (p === '/history') {
    const days = Math.min(180, Math.max(1, parseInt(u.searchParams.get('days') || '30', 10) || 30));
    const includeReplay = u.searchParams.get('includeReplay') === '1';
    return sendJson(res, 200, Object.assign({ days, includeReplay, enabled: SIM_ON }, simHistoryRead(days, includeReplay)));
  }
  // ── STREAM CANONICO DE EVENTOS (sync total) — GET /sim/events?after=<seq>&limit=<n> ──
  // Read-only, ordenado por seq. O consumidor (INVICTUS) recupera o que perdeu apos restart pelo cursor.
  if (p === '/sim/events') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });
    const after = Math.max(0, parseInt(u.searchParams.get('after') || '0', 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit') || '200', 10) || 200));
    const r = simEventsRead(after, limit);
    return sendJson(res, 200, { schema: 'aot-sim/events v1', enabled: SIM_ON, source: 'AOT_CANONICAL', after, limit,
      last_seq: simEventSeq, server_time: new Date().toISOString(), more: r.more, bad_lines: r.bad_lines, events: r.events });
  }
  // ── EXEC DE VOLTA (auditoria) — GET /sim/exec?after=<exec_seq>&limit=<n> ── só leitura; nunca avança o cursor.
  if (p === '/sim/exec') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });
    const after = Math.max(0, parseInt(u.searchParams.get('after') || '0', 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit') || '200', 10) || 200));
    const r = execRead(after, limit);
    return sendJson(res, 200, { schema: 'invictus/exec v1', enabled: SIM_ON, after, limit, cursor: execCursorLer(),
      last_exec_seq: r.last_exec_seq, server_time: new Date().toISOString(), more: r.more, bad_lines: r.bad_lines, records: r.records });
  }
  // ── MIGRAÇÃO DOS NÍVEIS — série completa do DISCO (fonte de verdade, append-only) ──
  // ?sym=ES|NQ|all (default ES) · ?days=1..180 (default 5). Só LÊ; nunca escreve.
  if (p === '/levels-migration') {
    const days = Math.min(180, Math.max(1, parseInt(u.searchParams.get('days') || '5', 10) || 5));
    const want = String(u.searchParams.get('sym') || 'ES').toUpperCase();
    const syms = want === 'ALL' ? LVLMIG_SYMS : (LVLMIG_SYMS.includes(want) ? [want] : []);
    if (!syms.length) return sendJson(res, 400, { error: 'sym desconhecido', have: LVLMIG_SYMS.concat(['all']) });
    const body = { days, holdMin: Math.round(LVLMIG_HOLD_MS / 60000), dir: 'history/levels',
      _note: 'Rastro em DEGRAUS: o patamar vale até o registro seguinte (não interpolar). cw/zg/pw = preço de FUTURO; *Idx = índice. kind: open (âncora de sessão) · chg (nível mudou) · hold (heartbeat de cobertura). Fonte /levels/ (keyLevels do vendor) — NÃO são as walls do grid do dealer nem as 0DTE do :3457.' };
    for (const s of syms) body[s] = lvlMigRead(s, days);
    return sendJson(res, 200, body);
  }
  if (p === '/api/alfabot-signal') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });
    const canonical = await from('consolidator', '/api/alfabot-signal', 4000);
    try { return sendJson(res, 200, passThroughAlfabot(canonical, Date.now())); }
    catch { return sendJson(res, 503, { error: 'canonical state unavailable or invalid', transport: { status: 'DATA PROBLEM' } }); }
  }
  if (p === '/api/deep') return sendJson(res, 200, STATE.deep || {});
  if (p === '/api/indicators') return sendJson(res, 200, STATE.indicators || { _err: 'ainda não computado' });

  // ── PROXY do NARRADOR (:3601) — mesma-origem p/ funcionar no mobile/remoto (§BP.3) ──
  // GET /narrator/events?… e /narrator/health repassam ao narrador local; POST /narrator/config
  // troca o idioma. Degrada suave: se o narrador estiver fora, devolve 200 {ok:false,offline:true}
  // pro front mostrar "offline" SEM erro de rede (o comportamento antigo do card).
  if (p === '/narrator/events' || p === '/narrator/health') {
    const sub = p.slice('/narrator'.length);           // '/events' | '/health'
    const qs = u.search || '';
    const data = await getJson(NARR_URL + sub + qs, 3500);
    if (data && data._err) return sendJson(res, 200, { ok: false, offline: true, _err: data._err });
    return sendJson(res, 200, data);
  }
  // #23 — Camada Técnica: repassa GET /narrator/explica?sym=&lang= ao narrador (:3601). É chamada
  // LLM (educacional, PROÍBE comprar/vender) → timeout folgado. Isolado; degrada suave se offline.
  if (p === '/narrator/explica') {
    const qs = u.search || '';
    const data = await getJson(NARR_URL + '/explica' + qs, 22000);
    if (data && data._err) return sendJson(res, 200, { ok: false, offline: true, _err: data._err });
    return sendJson(res, 200, data);
  }
  if (p === '/narrator/config' && req.method === 'POST') {
    // ⚠️ UNICA rota de escrita do BFF hoje. Antes de 19/08 era alcancavel por qualquer um que
    //    passasse pelo Access — e por qualquer coisa em loopback/WSL. Agora exige admin.
    if (await exigirAdmin(req, res)) return;
    let body = ''; req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', async () => {
      try {
        const r = await fetch(NARR_URL + '/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body || '{}', signal: AbortSignal.timeout(3500) });
        const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
        return sendJson(res, r.ok ? 200 : 502, j);
      } catch (e) { return sendJson(res, 200, { ok: false, offline: true, _err: e.name === 'TimeoutError' ? 'timeout' : (e.message || 'neterr') }); }
    });
    return;
  }

  // ── ABA ROBÔ (2026-08-31) — agregador READ-ONLY do estado do robô AlfaOmega ──────────
  // Fontes: F1 relay :3457 (HTTP GET) · F3 kill.flag/runtime.json · F4 ledger + AoDiag ·
  // F5 constantes do código C#. 🔴 NÃO chama o :5152 — §12.7 do HANDOFF proíbe sem
  // autorização, inclusive GET. Os campos de posição/ordem saem como UNAVAILABLE com motivo.
  // Fail-closed: nada é inventado; o que não existe sai marcado como GAP.
  if (p === '/automation/native') return nativeAutomation.respond(req, res, { roboDir: ROBO_CFG.roboDir, historyRecords: simHistoryRead(180, false).trades });

  if (p === '/robo/state') {
    const sym = (u.searchParams.get('sym') || 'ES').toUpperCase();
    return sendJson(res, 200, await roboState(sym));
  }

  // estático (frontend)
  return serveStatic(res, p);
});

// ── Singleton ────────────────────────────────────────────────────────────────
// 2026-09-03 — FAIL-CLOSED no lock. Bug medido: PID 8872 (bind=127.0.0.1) e PID 52560
// (bind=0.0.0.0) coexistiram no :3600 por ~4h. Duas falhas somadas:
//   1) `process.kill(pid,0)` lanca EPERM quando o processo EXISTE mas esta em nivel de
//      integridade acima do nosso. O catch antigo engolia TUDO e deixava alive=false —
//      ou seja, "nao consigo verificar" era lido como "esta morto". Fail-OPEN.
//   2) o guarda de bind nao pega: no Windows 0.0.0.0:3600 e 127.0.0.1:3600 sao endpoints
//      DISTINTOS, entao a 2a instancia sobe sem EADDRINUSE.
// Agora: ESRCH (nao existe) => pode subir. EPERM (existe, sem permissao) => NAO sobe.
// Qualquer outro erro de leitura do lock tambem NAO libera — ausencia de informacao nao
// e permissao. Unico caso que libera sem prova: o arquivo nao existir.
function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      const pid = parseInt(raw, 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        log('lock ilegivel ("' + raw.slice(0, 40) + '") — assumindo ocupado, NAO subindo');
        return false;
      }
      if (pid !== process.pid) {
        let ocupado = false;
        try { process.kill(pid, 0); ocupado = true; }              // existe e alcancavel
        catch (e) {
          if (e && e.code === 'ESRCH') ocupado = false;            // morto de fato -> libera
          else { ocupado = true; log('lock: pid ' + pid + ' inverificavel (' + ((e && e.code) || e) + ') — tratando como VIVO'); }
        }
        if (ocupado) return false;
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (e) {
    log('lock: falha ao adquirir (' + ((e && e.message) || e) + ') — NAO subindo');
    return false;
  }
}
function releaseLock() { try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {} }

async function loop() { while (true) { try { await poll(); } catch (e) { meta.errors++; log('poll err ' + (e && e.message)); } await new Promise(r => setTimeout(r, POLL_MS)); } }

// Boot só quando executado DIRETO (node aot-bff.js). REQUERIDO por um teste → NÃO sobe
// servidor/lock/loops — expõe a lógica pura p/ teste isolado (computeConfluence).
if (require.main === module) {
(async () => {
  if (!acquireLock()) { log('já existe instância (lock). Saindo.'); process.exit(0); }
  process.on('exit', releaseLock); process.on('SIGINT', () => { releaseLock(); process.exit(0); }); process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
  // Fail-loud: erro não-tratado = morre (não vira zumbi vivo-mas-quebrado que o watchdog não detecta).
  process.on('uncaughtException', (e) => { log('FATAL uncaught ' + ((e && e.stack) || e)); try { releaseLock(); } catch {} process.exit(1); });
  process.on('unhandledRejection', (e) => { log('FATAL unhandledRejection ' + ((e && e.stack) || e)); try { releaseLock(); } catch {} process.exit(1); });
  simHistoryArchive();   // retenção 180d: arquiva meses antigos no boot (move, nunca apaga)
  lvlMigArchive();       // idem p/ a Migração dos Níveis (history/levels/)
  lvlMigHydrate();       // reidrata a janela quente do disco ANTES do 1º poll (senão grava 'open' espúrio)
  const missing = Object.keys(SRC).filter(k => k !== 'alfaomega' && !KEYS[k]);
  log('INICIO aot-bff (AOT) :' + PORT + ' bind=' + BIND + ' origin=' + ORIGIN);
  if (REPLAY) log('🕒 REPLAY MODE ligado — âncora ' + etPretty(new Date(REPLAY.anchorUtcMs)) + ' · speed ' + REPLAY.speed + 'x · sessão/RTH e data do dado histórico seguem o relógio SIMULADO (staleness segue o real)');
  for (const k of Object.keys(SRC)) log('  fonte ' + k.padEnd(13) + SRC[k] + (KEYS[k] ? '  [chave ok]' : (k === 'alfaomega' ? '  [sem auth, loopback]' : '  [SEM CHAVE]')));
  // Fail-LOUD: em remote, fonte sem chave = 401 garantido. Melhor gritar no boot do que
  // o operador descobrir por um card "offline" que parece problema de rede.
  if (missing.length) log('⚠️  SEM CHAVE: ' + missing.join(', ') + (ORIGIN === 'remote' ? '  → vai dar 401 (origin=remote)' : '  → passa só pela isenção de loopback'));
  await poll().catch(e => log('boot poll err ' + e.message));
  // FAIL-LOUD no bind: sem isto, EADDRINUSE (porta ainda presa do restart anterior) deixava o processo
  // VIVO (poll loop) com a porta MORTA — e, pior, o heartbeat abaixo continuava fresco, então o watchdog
  // achava que estava saudável e nunca consertava (zumbi permanente). Agora: falha de bind = morre.
  server.on('error', (e) => { log('FATAL listen ' + ((e && e.code) || (e && e.message) || e)); try { releaseLock(); } catch {} process.exit(1); });
  // heartbeat + poll loop SÓ começam quando a porta está de fato aceitando conexões. Assim, uma instância
  // que não conseguiu subir o servidor fica STALE (não escreve heartbeat) → o watchdog detecta e resobe.
  server.listen(PORT, BIND, () => { log('BFF ouvindo http://' + BIND + ':' + PORT); heartbeat('boot'); loop(); });
})().catch(e => { log('FATAL ' + (e && e.stack || e)); releaseLock(); process.exit(1); });
} else {
  module.exports = { computeConfluence, c1FromLeg, buildFlowGcSi, buildFlowGc, buildGate, buildV2Stack, computeSymbol,
    // Aba ROBÔ — exposta p/ teste isolado da agregação (mesma razão do computeConfluence).
    roboState, roboGaps, roboContencao, roboUltimoEvento, roboAoDiag, roboConexaoNT8,
    // Migração dos Níveis — exposta p/ teste isolado da persistência (mesma razão do computeConfluence).
    lvlMigSample, lvlMigRead, lvlMigHydrate, lvlMigArchive, buildLevelsMigration, lvlMigTrail, lvlMigValueAt };
}
