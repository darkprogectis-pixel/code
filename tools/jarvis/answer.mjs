// JARVIS answer engine: route → read-only tools → grounded claims → pt-BR NLG → jarvis-answer/v1. No LLM in the numeric path.
// Grounding rule: every sentence is built from a tool fact; no fact ⇒ "Não tenho evidência suficiente para responder."
// Memory: EPHEMERAL_CONVERSATION only (last intent/slots, TTL); market values are ALWAYS re-read, never served from memory.
import crypto from 'node:crypto';
import { route } from './router.mjs';
import { TOOLS, NAME, SOURCES, loadState } from './tools.mjs';
import { toSpeech, fmt } from './lexicon.mjs';
import { selectSkills, retrieve, compareSources, loadRegistry, SOURCE_NAME, INSUFFICIENT } from './skills.mjs';

export const SCHEMA = 'jarvis-answer/v1';
export const NO_EVIDENCE = 'Não tenho evidência suficiente para responder.';
const DIR = { BUY: 'compradora', SELL: 'vendedora', NEUTRAL: 'neutra', UNKNOWN: 'sem leitura direcional' };
const SIG = { BUY: 'BUY (leitura analítica de compra)', SELL: 'SELL (leitura analítica de venda)', NO_SIGNAL: 'NO_SIGNAL' };
const age = (ms) => (ms == null ? 'idade desconhecida' : ms < 120000 ? `há ${Math.round(ms / 1000)} segundos` : ms < 7200000 ? `há ${Math.round(ms / 60000)} minutos` : `há ${fmt(ms / 3600000, 1)} horas`);
const val = (v) => (typeof v === 'number' ? fmt(v, 2) : String(v));

export function createMemory(ttlMs = 300000) {
  let last = null;
  return { get(now = Date.now()) { return last && now - last.at <= ttlMs ? last : null; }, set(x, now = Date.now()) { last = { ...x, at: now }; }, clear() { last = null; } };
}

function specialistLine(f, s) {
  const v = f.value;
  const notLive = (v.warnings || []).some((w) => /SOURCE_FRESHNESS|DATA PROBLEM/.test(w)) ? ', a fonte reporta dados não ao vivo' : '';
  if (!f.fresh) return `${NAME[s]} está ${v.health === 'ERROR' ? 'com erro' : 'desatualizado'} (${age(f.age_ms)}${notLive}); sem leitura direcional válida.`;
  if (v.role === 'NON_DIRECTIONAL') return `${NAME[s]} está ${v.health === 'OK' ? 'ok' : 'parcial'}, mas é não direcional: publica contexto e níveis, nunca lado.`;
  return `${NAME[s]} está com leitura ${DIR[v.direction]}, força ${fmt(v.strength, 2)} e confiança ${fmt(v.confidence, 2)} (${age(f.age_ms)}).`;
}

// Builds claims [{text, facts:[...]}] for an intent. Each claim must carry ≥1 fact (grounding).
function claimsFor(r, S, warnings, unsupported) {
  const C = [], add = (text, ...facts) => C.push({ text, facts: facts.flat().filter(Boolean) });
  const srcs = r.slots.sources.length ? r.slots.sources : [];
  if (r.slots.markets.some((m) => m !== 'ES')) unsupported.push(`mercado ${r.slots.markets.filter((m) => m !== 'ES').join('/')} não é coberto pelos agentes Alpha (somente ES)`);
  switch (r.intent) {
    case 'LEVEL_QUERY': {
      const lv = TOOLS.get_levels(S, { level: r.slots.level, source: srcs.find((s) => s !== 'fusion') || null });
      for (const f of lv.slice(0, 4)) add(`${f.name} em ${val(f.value)} ${f.unit || ''} segundo ${NAME[f.source]}${f.market_origin === 'SPX' ? ' (origem SPX convertida para ES)' : ''}.`.replace(/ +\./, '.'), f);
      break;
    }
    case 'DIRECT_FIELD': {
      const fd = r.slots.field; const f = fd && TOOLS.get_field(S, { source: fd.source, field: fd.field });
      if (f) add(`${fd.field} de ${NAME[fd.source]} = ${val(f.value)}${f.unit ? ` (${f.unit})` : ''}; ${f.fresh ? 'leitura atual' : `desatualizado, ${age(f.age_ms)}`}.`, f);
      else if (fd) unsupported.push(`${fd.field} de ${NAME[fd.source]} indisponível no ciclo atual`);
      break;
    }
    case 'PRESSURE_QUERY': case 'FOLLOW_UP': case 'SOURCE_STATUS': {
      const list = srcs.length ? srcs : r.intent === 'SOURCE_STATUS' ? SOURCES : ['fusion'];
      for (const s of list) {
        if (s === 'fusion') { const f = TOOLS.get_fusion_state(S); if (f) add(`O Fusion está em ${SIG[f.value.signal]}, confiança ${fmt(f.value.confidence, 2)}, ${f.value.fresh_count} de 5 fontes frescas.`, f); continue; }
        if (r.intent === 'SOURCE_STATUS') { const [h] = TOOLS.get_source_health(S, { source: s }); if (h) add(`${NAME[s]}: ${h.value.health}${h.fresh ? '' : `, ${age(h.age_ms)}`}${h.value.missing.length ? `; faltando ${h.value.missing.slice(0, 2).join(', ')}` : ''}.`, h); }
        else { const f = TOOLS.get_specialist_state(S, { source: s }); if (f) add(specialistLine(f, s), f); }
      }
      break;
    }
    case 'COMPARISON': {
      for (const f of TOOLS.compare_sources(S, { sources: srcs.length ? srcs : [] })) add(f.source === 'fusion' ? `Fusion: ${SIG[f.value.signal]}.` : specialistLine(f, f.source), f);
      break;
    }
    case 'FUSION_EXPLANATION': {
      const f = TOOLS.explain_fusion(S); if (!f) break;
      add(`O Fusion está em ${SIG[f.value.signal]}. ${String(f.value.reasoning).replace(/^(NO_SIGNAL|BUY|SELL):\s*/, '')}`, f);
      if (f.value.ignored.length) add(`Fontes ignoradas: ${f.value.ignored.map((x) => `${NAME[x.source]} (${x.reason.split(' ')[0].toLowerCase()})`).join(', ')}.`, f);
      if (f.value.contradictions.length) add(`Contradições: ${f.value.contradictions.map((c) => c.detail).join('; ')}.`, f);
      if (f.value.jev.status) add(`Revisão JEV: ${f.value.jev.status}${f.value.jev.q10 ? `, direção agregada ${f.value.jev.q10} com margem ${fmt(f.value.jev.margin, 2)}` : ''}; o JEV nunca altera o sinal.`, f);
      break;
    }
    case 'CHANGE_QUERY': case 'HISTORICAL_QUERY': {
      const h = S.H.rows; if (!h.length) break;
      const fl = S.H.flips, s = srcs.find((x) => x !== 'fusion');
      const facts = h.slice(-1).map((x) => ({ value: x.signal, source: 'history', source_timestamp: x.at, fresh: true, raw_ref: x.cycle_id }));
      if (s) {
        const seq = h.map((x) => x.sources?.[s]?.d).filter(Boolean); let ch = 0; for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) ch++;
        add(`${NAME[s]} mudou de direção ${ch} vez(es) nos últimos ${h.length} ciclos; agora ${DIR[seq[seq.length - 1]] || 'sem leitura'}.`, facts);
      } else add(`O Fusion teve ${fl.length} mudança(s) de sinal nos últimos ${h.length} ciclos${fl.length ? `; a última foi de ${fl[fl.length - 1].from} para ${fl[fl.length - 1].to}` : ''}.`, facts);
      break;
    }
    case 'MARKET_SUMMARY': {
      const m = TOOLS.get_market_snapshot(S); if (!m) break;
      if (m.fusion) add(`Fusion em ${SIG[m.fusion.value.signal]}, ${m.fusion.value.fresh_count} de 5 fontes frescas.`, m.fusion);
      for (const f of m.specialists) add(specialistLine(f, f.source), f);
      break;
    }
    default: break;
  }
  return C;
}

// Knowledge questions (KNOWLEDGE_QUERY / CROSS_SOURCE): selected skills answer separately ("Segundo SpotGamma…", "Segundo MenthorQ…"),
// each statement quoted from its corpus with lesson/video + timestamp + uncalibrated confidence. No evidence ⇒ INSUFFICIENT_EVIDENCE.
const VERDICT_PT = { AGREEMENT: 'as fontes concordam neste eixo', DIFFERENCE: 'as fontes diferem', CONTEXT_DEPENDENT: 'depende do contexto/regime', [INSUFFICIENT]: 'evidência insuficiente para comparar' };
export function knowledgeAnswer(r, { registry } = {}) {
  const t0 = performance.now();
  const reg = registry || loadRegistry();
  let skills = selectSkills(r.text, reg);
  if (r.intent === 'CROSS_SOURCE' && skills.length < 2) skills = reg.skills.filter((s) => s.enabled && s.default_knowledge);
  const per = skills.map((s) => retrieve(s, r.text));
  const comparison = r.intent === 'CROSS_SOURCE' ? compareSources(per) : null;
  const parts = [], speech = [], facts = [];
  for (const p of per) {
    const who = SOURCE_NAME[p.source] || p.source, via = p.skill === 'skill-alpha-gamma' || p.skill === 'skill-alpha-q' ? '' : ` (via ${p.skill})`;
    if (p.status !== 'ANSWERED') { parts.push(`${who}${via}: evidência insuficiente${p.concepts.length ? ` para ${p.concepts.join(', ')}` : ''}.`); continue; }
    const [a, b] = p.rows;
    const at = (x) => `${x.course}, ${x.lesson}${x.timestamp ? `, ${String(x.timestamp).split(/[–-]/)[0].replace(/\.\d+$/, '')}` : ''}`;
    parts.push(`Segundo ${who}${via}, sobre ${[...new Set(p.rows.map((x) => x.concept))].join(', ')} (${at(a)}): "${a.statement}"${b ? ` Também: "${b.statement}"` : ''} Confiança ${fmt(p.confidence, 2)}, não calibrada.`);
    speech.push(`Segundo ${who}: ${a.statement}`);
    for (const x of p.rows) facts.push({ source: x.source, skill: x.skill, concept: x.concept, value: x.statement, unit: null, lesson: x.lesson, lesson_id: x.lesson_id, video_id: x.video_id,
      timestamp: x.timestamp, timestamp_null_reason: x.timestamp_null_reason, text_source: x.text_source, api_attribution: x.api_attribution, confidence: x.confidence, fresh: true, raw_ref: x.knowledge_id, source_timestamp: null, age_ms: null });
  }
  if (comparison) parts.push(`Comparação: ${comparison.verdict} (${VERDICT_PT[comparison.verdict]}).`);
  const hit = per.filter((p) => p.status === 'ANSWERED');
  const unresolved = hit.reduce((n, p) => n + p.rows.filter((x) => x.contradictions > 0).length, 0);
  const obs = { intent: r.intent, selected_skills: skills.map((s) => s.skill_id), sources: per.map((p) => p.source), hit: hit.length > 0, per_source: per.map((p) => ({ source: p.source, skill: p.skill, status: p.status, evidence_count: p.rows.length, ms: p.ms })),
    evidence_count: facts.length, confidence: hit.length ? Math.min(r.confidence, ...hit.map((p) => p.confidence)) : 0, verdict: comparison?.verdict ?? null, retrieval_ms: Math.round((performance.now() - t0) * 10) / 10 };
  return { status: hit.length ? 'ANSWERED' : INSUFFICIENT, text: hit.length ? parts.join(' ') : `${NO_EVIDENCE} ${parts.join(' ')}`, tts: hit.length ? speech.join(' ') + (comparison ? ` Comparação: ${VERDICT_PT[comparison.verdict]}.` : '') : null,
    facts, per_source: per.map(({ all_rows, ...p }) => p), comparison, warnings: unresolved ? [`${unresolved} item(ns) com contradição registrada não resolvida no corpus`] : [], obs };
}

// ask(text, {state?, memory?, now?}) → jarvis-answer/v1. Never throws.
export function ask(text, { state, memory, now = Date.now(), voice_cycle_id = null, dir, registry } = {}) {
  const t0 = performance.now();
  const id = voice_cycle_id || `jv-${crypto.randomBytes(4).toString('hex')}`;
  const warnings = [], unsupported = [];
  let r = route(text, { last: memory?.get(now) });
  if (r.intent === 'FOLLOW_UP' && r.follow) r = { ...r, intent: r.follow };
  const out = (answer, claims = [], extra = {}) => {
    const facts = claims.flatMap((c) => c.facts);
    const fresh = facts.length > 0 && facts.every((f) => f.fresh !== false);
    if (facts.some((f) => f.fresh === false)) warnings.push('parte da evidência está desatualizada');
    return { schema: SCHEMA, voice_cycle_id: id, intent: r.intent, intent_confidence: r.confidence, slots: { sources: r.slots.sources, level: r.slots.level, field: r.slots.field?.field ?? null, markets: r.slots.markets },
      answer_text: answer, tts_text: toSpeech(answer), sources: [...new Set(facts.map((f) => f.source))], evidence: facts.map((f) => ({ source: f.source, value: f.value, unit: f.unit ?? null, source_timestamp: f.source_timestamp ?? null, age_ms: f.age_ms ?? null, fresh: f.fresh, raw_ref: f.raw_ref ?? null })),
      confidence: facts.length ? Math.round(Math.min(r.confidence, ...facts.map((f) => (typeof f.confidence === 'number' && f.confidence > 0 ? Math.max(f.confidence, 0.5) : 0.5))) * 100) / 100 : 0,
      fresh, warnings, unsupported_claims: unsupported, fixture: !!state?.fixture, mode: 'SHADOW_READ_ONLY', latency_ms: Math.round((performance.now() - t0) * 100) / 100, ...extra };
  };
  if (r.intent === 'CANCEL') return out('Ok, parei.', [], { cancel: true });
  if (r.intent === 'KNOWLEDGE_QUERY' || r.intent === 'CROSS_SOURCE') {
    let k;
    try { k = knowledgeAnswer(r, { registry }); } catch (e) { warnings.push(`registro de skills ilegível: ${String(e.message).slice(0, 120)}`); return out(NO_EVIDENCE, [], { knowledge: { status: INSUFFICIENT } }); }
    warnings.push(...k.warnings); memory?.set({ intent: r.intent, slots: r.slots }, now);
    const res = out(k.text, [{ facts: k.facts }], { knowledge: { status: k.status, selected_skills: k.obs.selected_skills, per_source: k.per_source, comparison: k.comparison, obs: k.obs } });
    if (k.tts) res.tts_text = toSpeech(k.tts);
    res.evidence = k.facts.map(({ fresh, age_ms, source_timestamp, unit, ...x }) => x);
    return res;
  }
  let S;
  try { S = state || loadState({ dir }); } catch (e) { warnings.push(`estado Alpha ilegível: ${e.message}`); return out(NO_EVIDENCE); }
  if (!S.ok) { warnings.push('sem estado Alpha (serviço Alpha parado?)'); return out(NO_EVIDENCE); }
  if (r.intent === 'UNKNOWN') return out(`${NO_EVIDENCE} Posso falar de níveis, pressão, status das fontes, Fusion, mudanças e histórico.`);
  const claims = claimsFor(r, S, warnings, unsupported).filter((c) => c.facts.length > 0); // grounding: drop unsupported sentences
  memory?.set({ intent: r.intent, slots: r.slots }, now);
  if (!claims.length) return out(NO_EVIDENCE + (unsupported.length ? ` Sem evidência para: ${unsupported.join('; ')}.` : ''));
  return out(claims.map((c) => c.text).join(' ') + (unsupported.length ? ` Sem evidência para: ${unsupported.join('; ')}.` : ''), claims);
}
