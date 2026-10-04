// Grounded Q&A over the CURRENT observation of an area (+ ALFABOT matrix + catalog + optional course knowledge).
// Deterministic; every sentence carries a provenance tag. Course/skill text is UNTRUSTED_EVIDENCE: quoted, never parsed or executed.
import { norm } from '../router.mjs';
import { summarize } from './narrator.mjs';

export const QA_INTENTS = Object.freeze(['WHY_NO_SIGNAL', 'MISSING_CONDITION', 'ALIGNED', 'SOURCE_API', 'FRESHNESS', 'CHANGES', 'DATA_OR_INTERPRETATION', 'KNOWLEDGE', 'INVALIDATION', 'SIMILAR_HISTORY', 'AREA_SUMMARY']);
const RULES = [
  ['WHY_NO_SIGNAL', /por ?que (nao|não) (tem|ha|há|saiu|apareceu)|sem sinal|why not/],
  ['MISSING_CONDITION', /condic\w* (esta |está )?falt|o que falta|falta(ndo)?\b|bloque/],
  ['ALIGNED', /alinhad|concord|a favor/],
  ['SOURCE_API', /qual (api|fonte)|de onde vem|quem fornece|fornecendo/],
  ['FRESHNESS', /atualizad|fresco|stale|velho|atrasad|frescor/],
  ['CHANGES', /o que mudou|mudou desde|mudanc/],
  ['DATA_OR_INTERPRETATION', /dado ou interpret|e dado|é dado|interpretac/],
  ['KNOWLEDGE', /spotgamma|menthorq|conceito|curso|aula/],
  ['INVALIDATION', /invalid/],
  ['SIMILAR_HISTORY', /anterior\w* (foram )?semelhant|parecid|historic\w* semelhant|ja aconteceu|já aconteceu/],
];
export const qaIntent = (text) => { const t = norm(text); for (const [id, re] of RULES) if (re.test(t)) return id; return 'AREA_SUMMARY'; };

const S = (text, provenance) => ({ text, provenance });
const show = (v) => (v === null || v === undefined ? 'sem dado' : String(v));

// answer({text, area, observation, matrix, catalog, history, knowledge}) — knowledge: (text) ⇒ [{source, statement, lesson, timestamp}] | throws
export function answer({ text, area, observation, matrix = null, catalog = [], history = null, knowledge = null }) {
  const intent = qaIntent(text); const out = [];
  const syms = matrix ? Object.values(matrix.symbols) : [];
  const items = observation?.items || [];
  switch (intent) {
    case 'WHY_NO_SIGNAL':
      if (!syms.length) { out.push(S('Sem matriz ALFABOT disponível nesta área; selecione o ALFABOT SIGNAL.', 'AOT_STATE')); break; }
      for (const m of syms) out.push(S(m.why_not ? `${m.symbol}: ${m.signal} — ${m.why_not}.` : `${m.symbol}: ${m.signal} — ${m.why_now}.`, 'DERIVED_CALCULATION'));
      break;
    case 'MISSING_CONDITION':
      if (syms.length) for (const m of syms) out.push(S(m.blocking_conditions.length ? `${m.symbol} falta: ${m.blocking_conditions.map((b) => `${b.id} ${b.indicator} (${b.result}: ${b.explanation})`).join('; ')}.` : `${m.symbol}: nenhuma condição exigida falhando.`, 'DERIVED_CALCULATION'));
      else for (const i of items.filter((x) => x.value === 'FALTANDO' || ['MISSING', 'STALE', 'ERROR'].includes(x.data_state))) out.push(S(`${i.label}: ${i.value === 'FALTANDO' ? 'faltando' : i.data_state}.`, i.provenance));
      if (!out.length) out.push(S('Nenhuma condição faltante publicada nesta área.', 'AOT_STATE'));
      break;
    case 'ALIGNED':
      if (syms.length) for (const m of syms) { const p = m.rows.filter((r) => r.result === 'PASS'); out.push(S(`${m.symbol} alinhados: ${p.length ? p.map((r) => r.indicator).join(', ') : 'nenhum'}.`, 'DERIVED_CALCULATION')); }
      else out.push(S(`Itens com dado ao vivo: ${items.filter((i) => i.data_state === 'LIVE').map((i) => `${i.label} ${show(i.value)}`).join('; ') || 'nenhum'}.`, 'AOT_STATE'));
      break;
    case 'SOURCE_API': {
      const t = norm(text);
      const hit = [...items.map((i) => ({ n: i.label, src: i.source, ep: i.endpoint, prov: i.provenance })), ...syms.flatMap((m) => m.rows.map((r) => ({ n: r.indicator, src: r.source, ep: '/api/alfabot-signal', prov: 'AOT_STATE' }))), ...catalog.filter((c) => c.data_role === 'DATA').map((c) => ({ n: c.name, src: [c.source_class, ...(c.source_alias || [])].join(' · '), ep: c.apis?.length ? c.apis.join(' ') : `${c.owner_file}:${c.owner_line}`, prov: 'AOT_STATE' }))]
        .filter((x) => x.n && norm(x.n).split(' ').filter((w) => w.length > 3).some((w) => t.includes(w)));
      if (hit.length) for (const h of hit.slice(0, 4)) out.push(S(`${h.n}: fonte ${h.src || 'UNKNOWN'} via ${h.ep || 'UNKNOWN'}.`, h.prov));
      else out.push(S(`Fontes desta área: ${[...new Set(items.map((i) => `${i.source} (${i.endpoint})`))].join('; ') || 'nenhuma'}. Diga o nome do indicador para a fonte exata.`, 'AOT_STATE'));
      break;
    }
    case 'FRESHNESS': {
      const by = {}; for (const i of items) (by[i.data_state] ||= []).push(i.label);
      for (const m of syms) (by[m.freshness] ||= []).push(`snapshot ALFABOT ${m.symbol}`);
      out.push(S(Object.entries(by).map(([k, v]) => `${k}: ${v.slice(0, 6).join(', ')}${v.length > 6 ? ` +${v.length - 6}` : ''}`).join(' · ') + '.', 'AOT_STATE'));
      out.push(S('Frescor usa o timestamp da fonte; só a hora de chegada nunca prova dado ao vivo.', 'DERIVED_CALCULATION'));
      break;
    }
    case 'CHANGES': {
      const ch = items.filter((i) => i.prev !== null && (i.prev !== i.value));
      out.push(S(ch.length ? ch.slice(0, 8).map((i) => `${i.label}: ${show(i.prev)} → ${show(i.value)}`).join('; ') + '.' : 'Nada mudou desde a observação anterior (ou esta é a primeira).', 'AOT_STATE'));
      break;
    }
    case 'DATA_OR_INTERPRETATION': {
      const by = {}; for (const i of items) (by[i.provenance] ||= []).push(i.label);
      out.push(S(Object.entries(by).map(([k, v]) => `${k}: ${v.slice(0, 5).join(', ')}`).join(' · ') + '.', 'AOT_STATE'));
      out.push(S('LIVE_DATA = valor da fonte; DERIVED_CALCULATION = cálculo do AOT/JARVIS sobre esses valores; HISTORICAL_RECORD = registro passado; conhecimento de curso nunca é dado de mercado.', 'DERIVED_CALCULATION'));
      break;
    }
    case 'KNOWLEDGE': {
      let rows = [];
      try { rows = knowledge ? knowledge(text) : []; } catch (e) { out.push(S(`Busca nas skills falhou (${String(e.message).slice(0, 80)}); seguem só os dados.`, 'AOT_STATE')); }
      for (const r of rows.slice(0, 3)) out.push(S(`${r.source === 'MENTHORQ' ? 'Curso α Q' : 'Curso α Gamma'} — ${r.lesson}${r.timestamp ? ` @${r.timestamp}` : ''}: “${String(r.statement).slice(0, 280)}”`, r.source === 'MENTHORQ' ? 'MENTHORQ_KNOWLEDGE' : 'SPOTGAMMA_KNOWLEDGE'));
      if (!rows.length && !out.length) out.push(S('Não encontrei conceito relacionado nas skills para esta pergunta (nomeie o conceito, ex.: gamma flip, call wall).', 'ALPHA_SKILL'));
      out.push(S('Isto é conhecimento educacional, não dado de mercado nem regra de sinal.', 'CROSS_SOURCE_INTERPRETATION'));
      break;
    }
    case 'INVALIDATION':
      if (syms.length) for (const m of syms) out.push(S(`${m.symbol}: ${typeof m.invalidation === 'string' ? `invalidação ${m.invalidation}` : `invalidação ${m.invalidation.price} (${m.invalidation.source})`}.`, 'AOT_STATE'));
      else out.push(S('Invalidação só é publicada pelo motor ALFABOT; esta área não a publica.', 'AOT_STATE'));
      break;
    case 'SIMILAR_HISTORY': {
      const tr = (history?.trades || []).slice(-5);
      out.push(S(tr.length ? `Registros históricos recentes: ${tr.map((t) => `${t.side} ${t.reason} ${typeof t.totalUsd === 'number' ? t.totalUsd.toFixed(0) + ' USD' : 'pnl sem dado'}`).join('; ')}.` : 'Sem registros históricos no período.', 'HISTORICAL_RECORD'));
      out.push(S('Semelhança não implica causa: é registro histórico, não previsão.', 'DERIVED_CALCULATION'));
      break;
    }
    default:
      out.push(S(observation ? summarize(observation) : 'Sem observação da área.', 'AOT_STATE'));
  }
  return { schema: 'jarvis-aot-answer/v1', area, intent, sentences: out, answer_text: out.map((s) => `${s.text} [${s.provenance}]`).join(' ') };
}
