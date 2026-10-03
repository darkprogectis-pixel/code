// JEV Observability dashboard — vanilla JS + SVG, no CDN, read-only GET /api/summary.
'use strict';
const TABS = ['ALPHA', 'JARVIS', 'OVERVIEW', 'JEV', 'CLAUDE', 'CONTEXT', 'HOOKS', 'SESSIONS', 'DECISIONS', 'CALIBRATION', 'MODELS', 'AGENTS', 'WORKFLOWS', 'COST', 'ANOMALIES'];
let S = null, A = null, J = null, tab = (location.hash || '#OVERVIEW').slice(1);
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
const M = (v) => (v == null ? '—' : v >= 1e6 ? n(v / 1e6, 2) + 'M' : v >= 1e3 ? n(v / 1e3, 1) + 'k' : n(v));
const card = (label, value, sub = '') => `<div class="card"><span>${esc(label)}</span><b>${value}</b><span>${esc(sub)}</span></div>`;
const panel = (title, body) => `<div class="panel"><h3>${esc(title)}</h3>${body}</div>`;
const table = (rows, cols) => !rows || !rows.length ? '<p class="zero">0 registros</p>' :
  `<table><tr>${cols.map((c) => `<th>${esc(c[1] || c[0])}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[2] ? c[2](r[c[0]], r) : esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</table>`;
const kv = (o, f = (x) => n(x, 4)) => table(Object.entries(o || {}).map(([k, v]) => ({ k, v })), [['k', 'chave'], ['v', 'valor', f]]);

function bars(obj, color = 'var(--a)', fmt = M) {
  const e = Object.entries(obj || {}); if (!e.length) return '<p class="zero">0 registros</p>';
  const max = Math.max(...e.map(([, v]) => v), 1), h = 18 * e.length + 4;
  return `<svg viewBox="0 0 400 ${h}">${e.map(([k, v], i) => `<text x="0" y="${i * 18 + 13}">${esc(String(k).slice(0, 24))}</text><rect x="150" y="${i * 18 + 3}" width="${(200 * v) / max}" height="12" fill="${color}"/><text x="${155 + (200 * v) / max}" y="${i * 18 + 13}">${fmt(v)}</text>`).join('')}</svg>`;
}
function line(points, color = 'var(--a)', fmt = M) {
  if (!points || points.length < 2) return '<p class="zero">dados insuficientes</p>';
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1, y1 = Math.max(...ys, 1);
  const X = (x) => 40 + (350 * (x - x0)) / (x1 - x0 || 1), Y = (y) => 150 - (140 * y) / y1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 400 170"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/><text x="0" y="14">${fmt(y1)}</text><text x="0" y="150">0</text>
  <text x="40" y="166">${esc(new Date(x0).toISOString().slice(5, 16))}</text><text x="300" y="166">${esc(new Date(x1).toISOString().slice(5, 16))}</text></svg>`;
}
const series = (obj) => Object.entries(obj || {}).map(([k, v]) => [Date.parse(k.length === 10 ? k + 'T00:00:00Z' : k), v]).filter((p) => p[0]).sort((a, b) => a[0] - b[0]);

const DIRC = { BUY: 'var(--c)', SELL: 'var(--w)', NEUTRAL: 'var(--info)', UNKNOWN: 'var(--mut)', NO_SIGNAL: 'var(--mut)' };
const dir = (d) => `<span class="lv" style="background:${DIRC[d] || 'var(--mut)'};color:#111">${esc(d)}</span>`;
const ms = (v) => (v == null ? '—' : v >= 3600000 ? n(v / 3600000, 1) + ' h' : v >= 60000 ? n(v / 60000, 1) + ' min' : n(v / 1000, 1) + ' s');
const ALPHA_V = () => {
  const L = A.latest, H = A.history, Mx = A.metrics;
  if (!L || L.status !== 'OK') return panel('ALPHA SIGNAL INTELLIGENCE', '<p class="zero">sem dados — inicie: node src/alpha/service.mjs (SHADOW / READ-ONLY)</p>');
  const f = L.fusion, j = f.jev || {}, m = Mx.metrics || {};
  const rows = L.envelopes.map((e) => ({ agent: e.agent, direction: e.direction, strength: e.strength, confidence: e.confidence, age: e.age_ms, health: e.health, role: e.role, used: f.sources[e.source]?.used ? 'sim' : (f.sources[e.source]?.reason || '—'), warn: e.warnings.slice(0, 2).join(' | ') }));
  const qs = Object.entries(j.questions || {}).map(([k, q]) => ({ k, ...q }));
  const ev = L.envelopes.flatMap((e) => e.evidence.slice(0, 6).map((x) => ({ src: e.source, ...x, value: typeof x.value === 'object' ? JSON.stringify(x.value) : x.value })));
  const lv = L.envelopes.flatMap((e) => Object.entries(e.levels || {}).map(([k, v]) => ({ src: e.source, k, value: v.value, origin: v.origin })));
  return `<div class="cards">${card('FUSION', dir(f.signal), 'SHADOW · UNCALIBRATED · zero ordens')}${card('confidence', n(f.confidence, 3))}${card('agreement', n(f.agreement, 3), `score ${n(f.score, 3)} · massa ${n(f.evidence_mass, 3)}`)}${card('fontes frescas', n(f.fresh_count) + '/5', f.freshness_ok ? 'freshness OK' : 'freshness insuficiente')}
    ${card('JEV', esc(j.status), j.request_id ? esc(j.request_id.slice(0, 16)) : '')}${card('ciclo', esc(L.cycle_id), `há ${ms(L.age_ms)}`)}${card('latência ciclo', n(f.stages_ms?.total) + ' ms', `p95 ${n(m.cycle_p95)} ms`)}${card('ciclos', n(m.cycles), `flips ${n(m.fusion?.flips)}`)}${card('outcomes', n(Mx.outcomes?.LABELED), `pendentes ${n(Mx.outcomes?.LABEL_PENDING)}`)}</div>
  <div class="grid">${panel('5 especialistas', table(rows, [['agent'], ['direction', 'direção', dir], ['strength', 'str', (v) => n(v, 3)], ['confidence', 'conf', (v) => n(v, 3)], ['age', 'idade', ms], ['health'], ['role'], ['used', 'usado no Fusion'], ['warn', 'avisos']]))}
  ${panel('FUSION — raciocínio', `<p>${esc(f.reasoning_summary)}</p>` + table(f.groups, [['id', 'grupo'], ['representative', 'repr.'], ['direction', 'dir', dir], ['mass', 'massa', (v) => n(v, 4)]]) + table(f.ignored_sources, [['source', 'ignorada'], ['reason', 'motivo']]))}
  ${panel('contradições', table(f.contradictions, [['kind'], ['detail'], ['material']]))}
  ${panel('JEV Q1–Q12 (advisory, não altera o sinal)', table(qs, [['k', 'Q'], ['winner'], ['pmax', 'p1', (v) => n(v, 3)], ['top2'], ['margin', 'margem', (v) => n(v, 3)], ['ratio'], ['confidence', 'conf', (v) => n(v, 2)]]))}
  ${panel('latência por estágio (ms)', bars(f.stages_ms || {}, 'var(--b)', n))}
  ${panel('métricas por agente', table(Object.entries(m.agents || {}).map(([k, a]) => ({ k, ...a })), [['k', 'agente'], ['calls'], ['errors'], ['timeouts'], ['stale'], ['BUY'], ['SELL'], ['NEUTRAL'], ['UNKNOWN'], ['fetch_p50', 'fetch p50'], ['fetch_p95', 'p95'], ['eval_p95', 'eval p95'], ['tokens']]))}
  ${panel('evidências', table(ev, [['src'], ['field'], ['value'], ['unit'], ['effect'], ['role'], ['validation']]))}
  ${panel('níveis (origem declarada)', table(lv, [['src'], ['k', 'nível'], ['value'], ['origin']]))}
  ${panel('timeline do sinal', line(H.rows.map((r) => [Date.parse(r.at), r.signal === 'BUY' ? 2 : r.signal === 'SELL' ? 0 : 1]), 'var(--a)', (v) => (v >= 2 ? 'BUY' : v <= 0 ? 'SELL' : 'NO_SIGNAL')))}
  ${panel('flips', table(H.flips.slice(-30).reverse(), [['at'], ['from'], ['to']]))}
  ${panel('histórico (últimos 60)', table(H.rows.slice(-60).reverse().map((r) => ({ ...r, js: r.jev?.status, oc: r.outcome?.label || '—' })), [['at'], ['signal', 'sinal', dir], ['confidence', 'conf', (v) => n(v, 3)], ['agreement', 'agr', (v) => n(v, 3)], ['js', 'JEV'], ['oc', 'outcome']]))}</div>`;
};

const JARVIS_V = () => {
  const st = J.status, cy = J.cycles, b = J.bench, sel = b.selected || {}, cl = b.classification || {};
  const stg = Object.entries(cy.stages || {}).map(([k, v]) => ({ k, ...v }));
  const stt = Object.entries(b.stt || {}).map(([k, v]) => ({ k, ...v, p50: v.latency_ms?.p50, p95: v.latency_ms?.p95 }));
  const tts = Object.entries(b.tts || {}).map(([k, v]) => ({ k, ...v, p50: v.ttfa_ms?.p50, p95: v.ttfa_ms?.p95, rtf50: v.rtf?.p50 }));
  return `<div class="cards">${card('JARVIS', st.alive ? 'ONLINE' : 'OFFLINE', st.alive ? 'SHADOW · READ-ONLY · zero ordens' : 'inicie: node scripts/jev-stack.mjs start')}${card('voz', esc(st.voice || '—'), 'PTT · wake word OFF (licença)')}${card('falar', st.url ? `<a href="${esc(st.url)}" target="_blank">abrir HUD</a>` : '—', 'mic só na HUD 3594')}${card('ciclos', n(cy.rows?.length), `barge-ins ${n(cy.barge_ins)}`)}${card('sem evidência', cy.unsupported_rate == null ? '—' : n(cy.unsupported_rate * 100, 1) + '%')}${card('STT', esc(sel.stt ? sel.stt.model + '@' + sel.stt.threads + 't' : '—'), esc(cl.stt_final || ''))}${card('TTS', esc(sel.tts || '—'), esc(cl.tts_first || ''))}${card('voz→1º áudio p50', n(b.e2e?.speech_end_to_first_audio_ms?.p50) + ' ms', esc(cl.voice_first_audio || ''))}</div>
  <div class="grid">${panel('latência por etapa (ciclos reais)', table(stg, [['k', 'etapa'], ['n'], ['p50'], ['p95'], ['p99']]))}
  ${panel('intents', bars(cy.intents || {}, 'var(--b)', n))}
  ${panel('bench STT (round-trip sintético TTS→STT)', table(stt, [['k', 'modelo'], ['p50', 'p50 ms'], ['p95', 'p95 ms'], ['wer_mean', 'WER'], ['glossary_hit_rate', 'glossário'], ['intent_preserved', 'intent'], ['intent_preserved_raw_no_normalizer', 'intent bruto'], ['rss_peak_mb', 'RSS MB'], ['class']]))}
  ${panel('bench TTS', table(tts, [['k', 'voz'], ['p50', 'TTFA p50'], ['p95', 'TTFA p95'], ['rtf50', 'RTF'], ['rss_peak_mb', 'RSS MB'], ['class']]))}
  ${panel('classificação §16', kv(cl, esc))}
  ${panel('ciclos recentes', table((cy.rows || []).slice(-40).reverse().map((r) => ({ ...r, st: r.latency?.stt_ms, fa: r.latency?.first_audio_ms })), [['at'], ['mode'], ['intent'], ['transcript', 'transcrição'], ['st', 'STT ms'], ['fa', '1º áudio ms'], ['confidence', 'conf', (v) => n(v, 2)], ['fresh'], ['barge_in']]))}</div>`;
};

const V = {
  OVERVIEW() {
    const j = S.jev, c = S.claude, q = S.decisions_quality, h = S.hooks;
    return `<div class="cards">${[
      card('JEV Requests', n(j.requests), `${j.non_production} não-produção excluídos`), card('JEV Input Tokens', M(j.input_tokens), 'provider tokens'), card('JEV Output Tokens', M(j.output_tokens), 'provider tokens'),
      card('JEV Spend', '$' + n(j.spend_usd, 6), '$0.042/MTok input · output grátis'), card('Claude Cache Read', M(c.usage_dedup_by_message.cache_read), `legacy por entrada ${M(c.usage_legacy_per_entry.cache_read)}`),
      card('Claude Output', M(c.usage_dedup_by_message.output), `legacy ${M(c.usage_legacy_per_entry.output)}`), card('Current Context', M(c.current_context), 'último turno medido'),
      card('Sessions', n(c.sessions), `${S.rotation.sessions.length} com eventos de rotação`), card('Rotations', n(S.rotation.rotations), `${S.rotation.confirmed_successors} sucessoras confirmadas`),
      card('JEV Decisions', n(q.lifecycle.decisions), `${n(q.answers)} respostas`), card('Average Confidence', n(q.avg_confidence, 3), 'todas as respostas'),
      card('Low-Margin Decisions', n(q.low_margin_le_0_1), `margem ≤ 0.1 · ${q.near_tie_le_0_05} ≤ 0.05`), card('Hook p95', h.p95 == null ? '—' : n(h.p95) + ' ms', `${h.probe_records} probe · ${h.transcript_stop_records} Stop`),
      card('Subagents', n(c.agents.spawned), 'ZERO explícito'), card('Calibration Coverage', n(q.lifecycle.calibration_coverage_pct, 1) + '%', `${q.lifecycle.LABELED} rotuladas`)].join('')}</div>
    <div class="grid">${panel('JEV tokens / dia', line(series(j.tokens_by_day)))}${panel('JEV spend / dia (US$)', line(series(j.spend_by_day), 'var(--b)', (v) => n(v, 5)))}
    ${panel('JEV requests / dia', line(series(j.by_day), 'var(--c)'))}${panel('Contexto Claude / tempo', line(c.context_series.map((p) => [Date.parse(p.ts), p.context])))}
    ${panel('Rotações / hora', bars(S.rotation.rotations_by_hour, 'var(--b)', n))}${panel('Distribuição de confidence', bars(q.confidence_buckets, 'var(--a)', n))}
    ${panel('Margem top1−top2', bars(q.margin_buckets, 'var(--w)', n))}${panel('Request types', bars(j.by_type, 'var(--c)', n))}
    ${panel('Contribuição ao contexto por ferramenta (chars)', bars(c.tool_family_chars))}${panel('Uso de modelo (respostas Claude)', bars(c.models_dedup, 'var(--a)', n))}
    ${panel('Latência de hooks p95 (ms)', bars(Object.fromEntries(h.table.map((t) => [`${t.hook}/${t.event}/${t.source}`, t.p95 || 0])), 'var(--w)', n))}</div>`;
  },
  JEV() { const j = S.jev; return `<div class="cards">${card('requests', n(j.requests))}${card('tokens/request', n(j.tokens_per_request))}${card('custo/request', '$' + n(j.cost_per_request, 8))}${card('latência p50/p95', `${n(j.latency_ms.p50)}/${n(j.latency_ms.p95)} ms`)}${card('primeiro', esc((j.first || '').slice(0, 16)))}${card('último', esc((j.last || '').slice(0, 16)))}${card('retries', 'NOT_RECORDED', 'lib.js loga só a tentativa final')}${card('pass2 usado', n(j.pass2.used), `não ${j.pass2.not_used} · desconhecido ${j.pass2.unknown}`)}</div>
    <div class="grid">${panel('por tipo', bars(j.by_type, 'var(--c)', n))}${panel('perguntas/request por tipo', kv(j.multi_question.questions_per_request_by_type, (v) => n(v, 2)))}${panel('HTTP', bars(j.by_http, 'var(--b)', n))}${panel('modelo JEV', bars(j.by_model, 'var(--a)', n))}
    ${panel('requests por hora', line(series(j.by_hour), 'var(--c)', n))}${panel('top sessões', bars(Object.fromEntries(Object.entries(j.by_session).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k.slice(0, 8), v])), 'var(--a)', n))}
    ${panel('erros (HTTP ≠ 200)', table(j.errors, [['ts'], ['http'], ['purpose'], ['request_id']]))}</div>`; },
  CLAUDE() { const c = S.claude; return `<div class="cards">${card('sessões', n(c.sessions))}${card('respostas (dedupe)', n(c.responses_dedup), `${n(c.assistant_entries)} entradas`)}${['input', 'cache_read', 'cache_creation', 'output'].map((k) => card(k, M(c.usage_dedup_by_message[k]), `legacy ${M(c.usage_legacy_per_entry[k])}`)).join('')}${card('CACHE_READ / OUTPUT', n(c.cache_read_over_output) + '×')}${card('resultados > 20k', n(c.results_over_20k))}</div>
    <div class="grid">${panel('por ferramenta', table(c.tools, [['tool'], ['calls'], ['chars', 'chars', M], ['pct', '%'], ['avg'], ['p50'], ['p95'], ['over_20k', '>20k']]))}${panel('TOP 20 maiores retornos ao contexto', table(c.top20_results, [['chars', 'chars', M], ['tool'], ['session'], ['ts']]))}</div>`; },
  CONTEXT() { const c = S.claude, a = c.attachments; const pick = (k) => (a[k] ? a[k].chars : 0);
    const src = { 'Bash read': (c.tools.find((t) => t.tool === 'Bash:read') || {}).chars || 0, 'Read': (c.tools.find((t) => t.tool === 'Read') || {}).chars || 0, prompt_snapshot: pick('prompt_snapshot'), total_tokens_reminder: pick('total_tokens_reminder'),
      skill_listing: pick('skill_listing'), 'instructions (CLAUDE.md)': pick('instructions'), deferred_tools: pick('deferred_tools_delta') + pick('deferred_tools_record'), hook_additional_context: pick('hook_additional_context'), 'briefs de rotação (bytes)': S.rotation.briefs.total_bytes };
    return `<div class="cards">${card('CACHE_READ / OUTPUT', n(c.cache_read_over_output) + '×')}${card('cache_read', M(c.usage_dedup_by_message.cache_read))}${card('output', M(c.usage_dedup_by_message.output))}</div><div class="grid">${panel('fontes de contexto (chars)', bars(src))}
    ${panel('crescimento por sessão', table(c.session_rows.slice(-25).reverse(), [['session_id', 'sessão', (v) => esc(v.slice(0, 8))], ['peak_context', 'pico', M], ['growth_per_hour', '/hora', M], ['growth_per_action', '/ação', M], ['tool_calls', 'ações']]))}
    ${panel('TOOL_RESULT_CHARS / TOOL', bars(c.tool_family_chars))}${panel('fontes repetidas (lidas > 1×)', table(c.repeated_reads, [['path'], ['reads']]))}${panel('anexos / system', table(Object.entries(a).map(([k, v]) => ({ k, ...v })).sort((x, y) => y.chars - x.chars), [['k', 'tipo'], ['n'], ['chars', 'chars', M]]))}</div>`; },
  HOOKS() { const h = S.hooks; return `<div class="cards">${card('p50', n(h.p50) + ' ms')}${card('p95', n(h.p95) + ' ms')}${card('p99', n(h.p99) + ' ms')}${card('probe', n(h.probe_records))}${card('Stop (transcript)', n(h.transcript_stop_records))}${card('blocking errors', n(h.transcript_hook_blocking_errors))}</div>
    <div class="grid">${panel('por hook/evento', table(h.table, [['hook'], ['event'], ['source'], ['calls'], ['p50'], ['p95'], ['p99'], ['wall_ms'], ['failures'], ['timeouts'], ['blockers'], ['injected_chars', 'injetado']]))}${panel('contexto injetado (transcripts)', bars(h.transcript_hook_injections))}${panel('últimas execuções (probe)', table(h.recent.slice().reverse(), [['at'], ['hook'], ['event'], ['duration_ms', 'ms'], ['exit_code', 'exit'], ['blocked'], ['injected_chars', 'inj']]))}</div>`; },
  SESSIONS() { const r = S.rotation; return `<div class="cards">${card('rotações', n(r.rotations))}${card('sucessoras confirmadas', n(r.confirmed_successors))}${card('briefs', n(r.briefs.count), `${M(r.briefs.total_bytes)} bytes ≈ ${M(r.briefs.est_tokens_reinjected)} tokens`)}${card('min entre rotações', n(r.minutes_between_rotations.min) + ' min', `p50 ${n(r.minutes_between_rotations.p50)} min`)}</div>
    <div class="grid">${panel('níveis (chamadas de hook)', bars(r.levels_hook_calls, 'var(--b)', n))}${panel('eventos de lineage', bars(r.lineage_events, 'var(--a)', n))}${panel('timeline de rotações', line(r.triggers.map((t, i) => [Date.parse(t.at), t.tokens || 0]), 'var(--w)'))}
    ${panel('rotações', table(r.triggers.slice().reverse(), [['at'], ['from'], ['successor'], ['trigger'], ['tokens', 'tokens', M], ['depth']]))}${panel('sessões (controller)', table(r.sessions.slice(-30).reverse(), [['sid', 'sessão', (v) => esc(String(v).slice(0, 8))], ['first'], ['last'], ['max_tokens', 'máx', M], ['levels', 'níveis', (v) => esc(JSON.stringify(v))]]))}
    ${panel('sessões (transcripts)', table(S.claude.session_rows.slice().reverse(), [['session_id', 'sessão', (v) => esc(v.slice(0, 8))], ['first'], ['duration_h', 'h'], ['responses', 'resp.'], ['peak_context', 'pico', M]]))}${panel('briefs recentes', table(r.briefs.recent, [['file'], ['bytes'], ['est_tokens']]))}${panel('legado rotation-events.ndjson', bars(r.legacy_rotation_events, 'var(--a)', n))}</div>`; },
  DECISIONS() { const q = S.decisions_quality; return `<div class="cards">${card('respostas', n(q.answers))}${card('confidence média', n(q.avg_confidence, 3))}${card('< 0.5', n(q.below_conf_0_5))}${card('margem ≤ 0.1', n(q.low_margin_le_0_1))}${card('quase empate ≤ 0.05', n(q.near_tie_le_0_05))}</div>
    <div class="grid">${panel('por tipo de pergunta', bars(q.by_kind, 'var(--a)', n))}${panel('confidence', bars(q.confidence_buckets, 'var(--a)', n))}${panel('margem', bars(q.margin_buckets, 'var(--w)', n))}</div>
    ${panel('lifecycle (últimas 300 respostas)', table(S.decisions.slice().reverse(), [['ts'], ['source'], ['request_id'], ['purpose'], ['question'], ['kind'], ['winner'], ['p_winner', 'p', (v) => n(v, 2)], ['top2', 'top2', (v) => n(v, 2)], ['margin', 'margem', (v) => n(v, 3)], ['ratio'], ['confidence', 'conf', (v) => n(v, 2)], ['score'], ['noul'], ['action']]))}`; },
  CALIBRATION() { const l = S.decisions_quality.lifecycle; return `<div class="cards">${card('decisões', n(l.decisions))}${card('com outcome', n(l.with_outcome))}${card('sem outcome', n(l.without_outcome))}${card('rotuladas', n(l.LABELED))}${card('não rotuladas', n(l.unlabeled))}${card('coverage', n(l.calibration_coverage_pct, 1) + '%')}${card('rótulos do router (legado)', n(S.router_feedback_labels))}</div>
    <div class="grid">${panel('estados', bars({ OUTCOME_UNKNOWN: l.OUTCOME_UNKNOWN, OUTCOME_CAPTURED: l.OUTCOME_CAPTURED, LABEL_PENDING: l.LABEL_PENDING, LABELED: l.LABELED }, 'var(--b)', n))}${panel('confidence bucket × accuracy', `<p class="zero">${esc(l.accuracy_by_confidence_bucket)} — accuracy não é calculada sem labels (Phase 1)</p>`)}${panel('probability bucket × outcome observado', '<p class="zero">NO_LABELS_YET — estrutura pronta em jev-obs/outcomes.ndjson</p>')}</div>`; },
  MODELS() { const c = S.claude; return `<div class="cards">${Object.entries(c.model_family_percent).map(([k, v]) => card(k, n(v, 1) + '%', `por entrada ${n(c.model_family_percent_entries[k], 1)}%`)).join('')}</div><div class="grid">${panel('respostas por modelo (dedupe)', bars(c.models_dedup, 'var(--a)', n))}${panel('entradas por modelo (legacy)', bars(c.models_per_entry, 'var(--b)', n))}${panel('modelo por sessão', table(c.session_rows.slice().reverse(), [['session_id', 'sessão', (v) => esc(v.slice(0, 8))], ['models', 'modelos', (v) => esc(JSON.stringify(v))], ['usage', 'tokens', (v) => esc(`out ${M(v.output)} · cr ${M(v.cache_read)}`)]]))}${panel('JEV por modelo', bars(S.jev.by_model, 'var(--c)', n))}</div>`; },
  AGENTS() { const a = S.claude.agents; return `<div class="cards">${card('agents spawned', n(a.spawned), 'ZERO explícito')}${card('transcripts sidechain', n(a.sidechain_transcripts))}</div>${panel('chamadas', table(a.calls, [['parent'], ['type'], ['model'], ['background']]))}${panel('campos medidos quando houver', `<p class="zero">${esc(a.fields.join(' · '))}</p>`)}`; },
  WORKFLOWS() { const w = S.claude.workflows; return `<div class="cards">${card('workflow runs', n(w.runs), 'ZERO explícito')}</div>${panel('runs', table(w.calls, [['parent'], ['name']]))}${panel('campos medidos quando houver', `<p class="zero">${esc(w.fields.join(' · '))}</p>`)}`; },
  COST() { const j = S.jev, c = S.claude.usage_dedup_by_message; return `<div class="cards">${card('JEV spend', '$' + n(j.spend_usd, 6))}${card('JEV custo/request', '$' + n(j.cost_per_request, 8))}${card('Claude', 'assinatura', 'custo $ não estimado (plano); tokens abaixo')}${card('Claude cache_read', M(c.cache_read))}${card('Claude output', M(c.output))}</div><div class="grid">${panel('JEV spend / dia', line(series(j.spend_by_day), 'var(--b)', (v) => n(v, 5)))}${panel('JEV spend por dia', kv(j.spend_by_day, (v) => '$' + n(v, 6)))}</div>`; },
  ANOMALIES() { return panel('análise determinística (nunca bloqueia)', table(S.anomalies, [['level', 'nível', (v) => `<span class="lv ${esc(v)}">${esc(v)}</span>`], ['code'], ['msg', 'detalhe'], ['value']])) + panel('fontes', table(Object.entries(S.sources).map(([k, v]) => ({ k, ...v })), [['k', 'fonte'], ['exists'], ['lines'], ['bad_lines'], ['bytes'], ['files'], ['sha12'], ['mtime']])); },
};

async function loadAlpha() {
  try { const [latest, history, metrics] = await Promise.all(['latest', 'history?limit=300', 'metrics'].map((p) => fetch('/api/alpha/' + p).then((r) => r.json()))); A = { latest, history, metrics }; }
  catch (e) { A = { latest: { status: 'ERROR' }, history: { rows: [], flips: [] }, metrics: {} }; }
}
async function loadJarvis() {
  try { const [status, cycles, bench] = await Promise.all(['status', 'cycles?limit=300', 'bench'].map((p) => fetch('/api/jarvis/' + p).then((r) => r.json()))); J = { status, cycles, bench }; }
  catch (e) { J = { status: { status: 'ERROR' }, cycles: { rows: [] }, bench: {} }; }
}
setInterval(async () => { if (tab === 'JARVIS') { await loadJarvis(); render(); } }, 10000);
setInterval(async () => { if (tab === 'ALPHA') { await loadAlpha(); render(); } }, 10000);
function render() {
  $('#tabs').innerHTML = TABS.map((t) => `<a href="#${t}" class="${t === tab ? 'on' : ''}">${t}</a>`).join('');
  if (tab === 'ALPHA') { if (!A) { loadAlpha().then(render); return; } try { $('#view').innerHTML = ALPHA_V(); } catch (e) { $('#view').innerHTML = `<p class="zero">erro ALPHA: ${esc(e.message)}</p>`; } return; }
  if (tab === 'JARVIS') { if (!J) { loadJarvis().then(render); return; } try { $('#view').innerHTML = JARVIS_V(); } catch (e) { $('#view').innerHTML = `<p class="zero">erro JARVIS: ${esc(e.message)}</p>`; } return; }
  if (!S) return;
  try { $('#view').innerHTML = (V[tab] || V.OVERVIEW)(); } catch (e) { $('#view').innerHTML = `<p class="zero">erro ao renderizar ${esc(tab)}: ${esc(e.message)}</p>`; }
}
async function load() {
  const p = new URLSearchParams(new FormData($('#filters'))); for (const [k, v] of [...p]) if (!v) p.delete(k);
  $('#status').textContent = 'carregando…';
  try { const r = await fetch('/api/summary?' + p); S = await r.json(); $('#status').textContent = `gerado ${S.generated_at?.slice(11, 19)}Z · ${S.compute_ms} ms`; }
  catch (e) { $('#status').textContent = 'erro: ' + e.message; }
  render();
}
window.addEventListener('hashchange', () => { tab = location.hash.slice(1) || 'OVERVIEW'; render(); });
$('#filters').addEventListener('submit', (e) => { e.preventDefault(); load(); });
render(); load();
