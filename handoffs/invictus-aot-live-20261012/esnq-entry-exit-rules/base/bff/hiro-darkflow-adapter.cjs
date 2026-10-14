'use strict';
// ADAPTADOR EM STAGING — HIRO proprietário do Darkflow para a camada C2 (confirmação) do AOT. NÃO instalado.
//
// Entrada: o bloco `flow_hiro` que o relay :3457 já publica (oi-latest.json), montado por
//   darkcode-by-opra/darkcode-sync.js (l.527–555) a partir de data/hiro-latest.json, escrito por hiro-engine.js.
//   Contrato existente, sem campo novo: hiro_<sym>, hiro_ratio_<sym>, direction_<sym>, windows.<SYM>.{windows,api_ts,last_poll}.
// Saída: o MESMO formato de `hiroConfirm` do aot-bff.js ({confirm, value} ou {confirm:'N/A', reason}), mais rótulos de origem.
//
// O que este número é: soma, na janela de 5 min, das leituras de `dexoflow` do orderflow GammaGex (ES_SPX, NQ_NDX),
// uma leitura a cada 10 s. NÃO é o HIRO da SpotGamma. Unidade do fornecedor: desconhecida. Só o SINAL é usado.
//
// O que o adaptador acrescenta ao que o BFF faz hoje com `flow_hiro`: frescor pelo relógio do FORNECEDOR (api_ts).
// Hoje `flow_hiro.stale` usa `received_at`, que o hiro-engine regrava a cada 10 s mesmo com o fornecedor parado.
// Os três limites abaixo são PROVISÓRIOS, não calibrados.
const DEFAULTS = { window: '5m', maxVendorAgeMs: 120000, maxPollAgeMs: 60000, minSamples: 6 };
const SOURCE = 'darkflow hiro-engine (GammaGex orderflow · dexoflow)';
const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
const toMs = (t) => { const n = num(t); return n == null ? null : (n < 1e12 ? n * 1000 : n); };   // api_ts vem em segundos

function darkflowHiro(sym, flowHiro, nowMs, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {}), now = num(nowMs) != null ? nowMs : Date.now();
  const base = { available: false, sym, source: SOURCE, methodology: 'DARKFLOW_DEXOFLOW_SUM_5M', is_spotgamma_hiro: false, unit: 'UNKNOWN', window: o.window };
  const no = (reason, extra) => Object.assign(base, extra || {}, { reason });
  if (sym !== 'ES' && sym !== 'NQ') return no('símbolo sem HIRO Darkflow (só ES e NQ)');
  // Pregão regular de opções: o relógio é o de quem chama (no BFF, etState().rth). Sem a opção, só o frescor decide.
  if (o.rth === false) return no('fora de RTH (pregão de opções 09:30–16:00 ET)');
  if (!flowHiro || typeof flowHiro !== 'object') return no('flow_hiro ausente no relay');
  const blk = flowHiro.windows && flowHiro.windows[sym];
  if (!blk || !blk.windows || !blk.windows[o.window]) return no('flow_hiro sem o bloco de janelas de ' + sym);
  const w = blk.windows[o.window], value = num(w.hiro), ratio = num(w.ratio), samples = num(w.samples) || 0;
  const vendorTsMs = toMs(blk.api_ts), pollTsMs = toMs(blk.last_poll);
  const vendorAgeMs = vendorTsMs == null ? null : now - vendorTsMs, pollAgeMs = pollTsMs == null ? null : now - pollTsMs;
  const meta = { value, ratio, samples, vendorTsMs, vendorAgeMs, pollAgeMs };
  if (value == null) return no('janela sem valor', meta);
  if (vendorAgeMs == null) return no('sem timestamp do fornecedor (api_ts)', meta);
  if (vendorAgeMs > o.maxVendorAgeMs) return no('fornecedor parado há ' + Math.round(vendorAgeMs / 1000) + ' s (limite ' + o.maxVendorAgeMs / 1000 + ' s)', meta);
  if (pollAgeMs == null || pollAgeMs > o.maxPollAgeMs) return no('hiro-engine sem leitura recente', meta);
  if (samples < o.minSamples) return no('janela com ' + samples + ' leituras (mínimo ' + o.minSamples + ')', meta);
  return Object.assign(base, meta, { available: true, dir: value > 0 ? 'COMPRADOR' : value < 0 ? 'VENDEDOR' : 'NEUTRO' });
}

// Mesma regra de `hiroConfirm`/`confirmVs` do aot-bff.js: sinal do fluxo de 5 min contra a direção do tape (C1).
function hiroConfirmDarkflow(dir, sym, flowHiro, nowMs, opts) {
  const h = darkflowHiro(sym, flowHiro, nowMs, opts);
  if (!h.available) return { confirm: 'N/A', reason: h.reason, source: SOURCE, is_spotgamma_hiro: false, vendorAgeMs: h.vendorAgeMs == null ? null : h.vendorAgeMs };
  const sH = Math.sign(h.value), sD = dir === 'LONG' ? 1 : dir === 'SHORT' ? -1 : 0;
  const confirm = sD === 0 ? 'NEUTRO' : (sH === sD ? 'CONFIRMA' : (sH === 0 ? 'NEUTRO' : 'DIVERGE'));
  return { confirm, value: Math.round(h.value * 100) / 100, dir: h.dir, source: SOURCE, is_spotgamma_hiro: false, vendorAgeMs: h.vendorAgeMs };
}

module.exports = { darkflowHiro, hiroConfirmDarkflow, DEFAULTS, SOURCE };
