// JEV decomposed review of a Fusion cycle (Q1–Q12, one call). Advisory only: never changes fusion.signal, never trades.
// Throttled for cost: needs ≥1 fresh directional source, and (state changed ∧ ≥ min_interval) or heartbeat; daily cap.
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { SOURCES, LABEL } from './config.mjs';

const D4 = { BUY: 'evidência da fonte indica pressão compradora', SELL: 'evidência da fonte indica pressão vendedora', NEUTRAL: 'leitura direcional válida dentro da banda neutra', UNKNOWN: 'sem leitura direcional válida (stale, erro ou fonte não direcional)' };
const YN = (y, n) => ({ YES: y, NO: n });
export const QUESTIONS = {
  ...Object.fromEntries(SOURCES.map((s, i) => [`Q${i + 1}`, { type: 'choice', instructions: `Direção sustentada pela evidência de ${LABEL[s]} (${s}) neste ciclo.`, criteria: D4 }])),
  Q6: { type: 'choice', instructions: 'O frescor das fontes é suficiente para uma leitura agregada?', criteria: YN('frescor suficiente', 'frescor insuficiente') },
  Q7: { type: 'choice', instructions: 'Há contradição material entre fontes independentes?', criteria: YN('há contradição material', 'não há contradição material') },
  Q8: { type: 'choice', instructions: 'As fontes que concordam são suficientemente independentes (considere depends_on e independence_group)?', criteria: YN('independência suficiente', 'independência insuficiente') },
  Q9: { type: 'choice', instructions: 'A evidência total é suficiente para uma direção agregada?', criteria: YN('evidência suficiente', 'evidência insuficiente') },
  Q10: { type: 'choice', instructions: 'Direção agregada sustentada pelo conjunto.', criteria: { BUY: 'compradora', SELL: 'vendedora', INDETERMINATE: 'indeterminada' } },
  Q11: { type: 'choice', instructions: 'Qualidade da evidência do ciclo.', criteria: { HIGH: 'alta', MEDIUM: 'média', LOW: 'baixa' } },
  Q12: { type: 'choice', instructions: 'Risco de falso consenso (fontes dependentes ou mesma origem contadas como confirmação).', criteria: { HIGH: 'alto', MEDIUM: 'médio', LOW: 'baixo' } },
};

export function compactState(envs, fusion) {
  return {
    task: 'Revisão analítica SHADOW de um ciclo de fusão de 5 fontes de mercado (ES). Nenhuma ordem é enviada; BUY/SELL é só leitura analítica UNCALIBRATED.',
    envelopes: envs.map((e) => ({ source: e.source, label: LABEL[e.source], role: e.role, fresh: e.fresh, health: e.health, age_ms: e.age_ms, direction: e.direction, strength: e.strength, confidence: e.confidence,
      depends_on: e.depends_on, independence_group: e.independence_group, evidence: e.evidence.slice(0, 8).map((x) => ({ field: x.field, value: x.value, effect: x.effect, role: x.role, validation: x.validation })), contradictions: e.contradictions, warnings: e.warnings.slice(0, 4) })),
    fusion: { signal: fusion.signal, agreement: fusion.agreement, score: fusion.score, groups: fusion.groups, contradictions: fusion.contradictions, freshness_ok: fusion.freshness_ok, ignored: fusion.ignored_sources },
    rules: ['Stale/erro não gera direção.', 'GEX/gamma nunca vira BUY/SELL.', 'MenthorQ (α Q) só confirma; nunca origina lado nem veta.', 'α Quant consome α Data e α Q: não são independentes.', 'Holdout direcional do projeto = 0/66: nenhuma feature é sinal validado.'],
  };
}

export function summarize(answers) {
  const out = {};
  for (const [k, a] of Object.entries(answers || {})) {
    const p = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]);
    const p1 = p[0]?.[1] ?? null, p2 = p[1]?.[1] ?? 0;
    out[k] = { winner: a.choice, confidence: a.confidence, pmax: p1, top1: p[0]?.[0] ?? null, top2: p[1]?.[0] ?? null, margin: p1 == null ? null : Math.round((p1 - p2) * 1e4) / 1e4, ratio: p1 == null ? null : p2 > 0 ? Math.round((p1 / p2) * 100) / 100 : null, probabilities: a.probabilities };
  }
  return out;
}

export const stateHash = (envs, fusion) => crypto.createHash('sha256').update(JSON.stringify([envs.map((e) => [e.source, e.fresh, e.direction, e.strength, e.confidence]), fusion.signal, fusion.agreement])).digest('hex').slice(0, 16);

export function decide(envs, fusion, st, cfg, now) {
  const J = cfg.jev;
  if (!J.enabled) return 'SKIPPED_DISABLED';
  if (!envs.some((e) => e.fresh && e.role !== 'NON_DIRECTIONAL' && e.direction !== 'UNKNOWN')) return 'SKIPPED_NO_FRESH_EVIDENCE';
  const day = new Date(now).toISOString().slice(0, 10);
  if (st.day === day && st.count >= J.daily_cap) return 'SKIPPED_DAILY_CAP';
  const h = stateHash(envs, fusion);
  const since = st.lastAt ? now - st.lastAt : Infinity;
  if (h === st.lastHash && since < J.heartbeat_ms) return 'SKIPPED_UNCHANGED';
  if (since < J.min_interval_ms) return 'SKIPPED_MIN_INTERVAL';
  return 'CALL';
}

let libCache = null;
function defaultAsk() {
  if (!libCache) libCache = createRequire(import.meta.url)(path.join(os.homedir(), '.claude', 'alfaomega-context', 'scripts', 'lib.js'));
  return (args) => libCache.jevAsk({ ...args, state: libCache.sanitize(JSON.stringify(args.state)) });
}

// st: mutable throttle state {day,count,lastAt,lastHash}. Returns the jev block for alpha-fusion/v1.
export async function reviewFusion(envs, fusion, { cfg, now, st, ask = null }) {
  const status = decide(envs, fusion, st, cfg, now);
  if (status !== 'CALL') return { status, at: new Date(now).toISOString() };
  const day = new Date(now).toISOString().slice(0, 10);
  if (st.day !== day) { st.day = day; st.count = 0; }
  st.count++; st.lastAt = now; st.lastHash = stateHash(envs, fusion);
  const t0 = Date.now();
  try {
    const fn = ask || defaultAsk();
    let timer;
    const res = await Promise.race([
      fn({ state: compactState(envs, fusion), questions: QUESTIONS, purpose: `alpha-fusion-${fusion.cycle_id}` }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('JEV timeout')), cfg.jev.timeout_ms); }),
    ]).finally(() => clearTimeout(timer));
    const q = summarize(res.answers);
    const agg = q.Q10?.winner;
    return { status: 'OK', request_id: res.meta?.request_id ?? null, model: res.meta?.model ?? res.response?.model ?? null, latency_ms: Date.now() - t0, at: new Date(now).toISOString(), cycle_id: fusion.cycle_id, questions: q,
      agrees_with_signal: fusion.signal === 'NO_SIGNAL' ? agg === 'INDETERMINATE' : agg === fusion.signal };
  } catch (e) {
    return { status: 'ERROR', error: String(e.message || e).slice(0, 200), latency_ms: Date.now() - t0, at: new Date(now).toISOString() };
  }
}
