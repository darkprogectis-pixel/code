// JEV Observability — pure aggregation over read-only sources. Claude context tokens (claude.*) and JEV provider
// tokens (jev.*) are kept in separate namespaces and never summed together.
import fs from 'node:fs';
import path from 'node:path';
import { paths, readNdjson, readJsonFile, listFiles, statOf } from './sources.mjs';

export const JEV_PRICE_INPUT_PER_TOKEN = 0.042 / 1e6; // docs.typesafe.ai /models: $0.042/MTok input, output free
const DAY = 86400000;

// ---------- helpers ----------
export const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
export function quantile(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
const tsOf = (o) => Date.parse(o.ts || o.timestamp || o.at || '') || null;
const hourKey = (t) => new Date(t).toISOString().slice(0, 13) + ':00Z';
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const inc = (m, k, v = 1) => { m[k] = (m[k] || 0) + v; };

export function rangeStart(range, now = Date.now()) {
  if (range === 'today') { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
  if (range === '7d') return now - 7 * DAY;
  if (range === '30d') return now - 30 * DAY;
  return 0;
}
export function makeFilter(f = {}, now = Date.now()) {
  const from = rangeStart(f.range || 'all', now);
  const until = f.until ? Date.parse(f.until) : Infinity;
  return { from, until, session: f.session || null, purpose: f.purpose || null, model: f.model || null, type: f.type || null };
}
const inWindow = (t, F) => t != null && t >= F.from && t <= F.until;

// ---------- JEV ----------
export function requestType(purpose = '') {
  const p = String(purpose || '');
  if (/^context-route/i.test(p)) return 'router';
  if (/^decision:/i.test(p)) return 'decide';
  if (/recheck/i.test(p)) return 'RECHECK';
  if (/(^|[^a-z])final([^a-z]|$)|:final|-final/i.test(p)) return 'FINAL';
  if (/(^|[^a-z])diff([^a-z]|$)|:diff|-diff|plan/i.test(p)) return 'DIFF';
  if (/^audit/i.test(p)) return 'audit';
  if (/test|smoke|mock|failclosed/i.test(p)) return 'test';
  return 'other';
}
export const isProduction = (r) => r.http === 200 && typeof r.model === 'string' && /^jev-/.test(r.model) && !!r.request_id;

// Distribution metrics from a probability map {label: p}.
export function distMetrics(probs) {
  if (!probs || typeof probs !== 'object') return null;
  const e = Object.entries(probs).filter(([, v]) => typeof v === 'number').sort((a, b) => b[1] - a[1]);
  if (!e.length) return null;
  const top1 = e[0][1], top2 = e[1] ? e[1][1] : 0, n = e.length;
  return { winner: e[0][0], pmax: top1, top1, top2, runner_up: e[1] ? e[1][0] : null, margin: Math.round((top1 - top2) * 1000) / 1000,
    ratio: top2 > 0 ? Math.round((top1 / top2) * 100) / 100 : null, n,
    choice_conf_formula: n > 1 ? Math.round(((top1 - 1 / n) / (1 - 1 / n)) * 1000) / 1000 : null };
}
export const noulConf = (p) => (typeof p === 'number' ? Math.round(Math.abs(2 * p - 1) * 1000) / 1000 : null);

export function jevUsage(routingRows, F) {
  const seen = new Set(); const prod = [], test = [], errors = [], dup = [];
  for (const r of routingRows) {
    const t = tsOf(r); if (!inWindow(t, F)) continue;
    if (F.session && r.session_id !== F.session) continue;
    if (F.purpose && !String(r.purpose || '').includes(F.purpose)) continue;
    if (F.model && r.model !== F.model) continue;
    const type = requestType(r.purpose);
    if (F.type && type !== F.type) continue;
    const key = r.request_id || `${r.ts}|${r.purpose}`;
    if (seen.has(key)) { dup.push(key); continue; }
    seen.add(key);
    const rec = { t, type, ...r };
    if (isProduction(r)) prod.push(rec); else if (r.http && r.http !== 200 && r.request_id) errors.push(rec); else test.push(rec);
  }
  const sum = (a, k) => a.reduce((s, r) => s + (r[k] || 0), 0);
  const input = sum(prod, 'input_tokens'), output = sum(prod, 'output_tokens');
  const byDay = {}, byHour = {}, bySession = {}, byModel = {}, byType = {}, byHttp = {}, spendDay = {};
  for (const r of prod) {
    inc(byDay, dayKey(r.t)); inc(byHour, hourKey(r.t)); inc(bySession, r.session_id || '(sem session_id)'); inc(byModel, r.model); inc(byType, r.type);
    inc(spendDay, dayKey(r.t), (r.input_tokens || 0) * JEV_PRICE_INPUT_PER_TOKEN);
  }
  for (const r of [...prod, ...errors, ...test]) inc(byHttp, String(r.http));
  const tokensDay = {};
  for (const r of prod) inc(tokensDay, dayKey(r.t), (r.input_tokens || 0) + (r.output_tokens || 0));
  const lat = prod.map((r) => r.latency_ms).filter((x) => typeof x === 'number');
  const spend = input * JEV_PRICE_INPUT_PER_TOKEN;
  return {
    requests: prod.length, input_tokens: input, output_tokens: output, total_tokens: input + output,
    spend_usd: Math.round(spend * 1e8) / 1e8, cost_per_request: prod.length ? spend / prod.length : 0,
    tokens_per_request: prod.length ? Math.round((input + output) / prod.length) : 0,
    first: prod.length ? new Date(Math.min(...prod.map((r) => r.t))).toISOString() : null,
    last: prod.length ? new Date(Math.max(...prod.map((r) => r.t))).toISOString() : null,
    latency_ms: { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), p99: quantile(lat, 0.99) },
    by_day: byDay, by_hour: byHour, by_session: bySession, by_model: byModel, by_type: byType, by_http: byHttp, spend_by_day: spendDay, tokens_by_day: tokensDay,
    errors: errors.map((r) => ({ ts: r.ts, http: r.http, purpose: r.purpose, request_id: r.request_id })),
    non_production: test.length, duplicates_dropped: dup.length,
    retries: { status: 'NOT_RECORDED_BY_CLIENT', note: 'lib.js retries 429/5xx internally and logs only the final attempt' },
    multi_question: { questions_per_request_by_type: Object.fromEntries(Object.keys(byType).map((k) => {
      const rs = prod.filter((r) => r.type === k && typeof r.questions === 'number'); return [k, rs.length ? Math.round((100 * sum(rs, 'questions')) / rs.length) / 100 : null];
    })) },
    pass2: (() => { let used = 0, known = 0; for (const r of prod) if (Array.isArray(r.features)) { known++; if (r.features.some((f) => /pass2/i.test(f))) used++; } return { used, not_used: known - used, unknown: prod.length - known }; })(),
  };
}

// Collect every JEV answer with a distribution, from decisions, jev-finish loops, audit results and shadow ledger.
export function jevDecisions(src, F) {
  const out = [];
  for (const d of src.decisions) {
    const t = tsOf(d); if (!inWindow(t, F)) continue;
    if (F.session && d.session_id !== F.session) continue;
    const base = { source: 'jev-decisions', t, ts: d.ts || d.timestamp, request_id: d.request_id || null, decision_id: d.decision_id, purpose: d.purpose || d.kind,
      type: requestType(d.purpose || ''), status: d.status, action: d.gate_open === undefined ? d.status : (d.gate_open ? 'GATE_OPEN' : 'GATE_CLOSED') };
    if (d.answers) for (const [q, a] of Object.entries(d.answers)) out.push(answerRow(base, q, a));
    else if (d.probabilities) out.push(answerRow(base, d.kind || 'q', { type: 'choice', probabilities: d.probabilities, confidence: d.confidence, choice: d.result }));
  }
  for (const r of src.loopJev) { const t = tsOf(r); if (!inWindow(t, F)) continue;
    out.push(answerRow({ source: 'jev-finish', t, ts: r.at, request_id: r.request_id, decision_id: r.loop_id + ':' + r.kind, purpose: `jev-finish-${r.kind}`, type: r.kind === 'final' ? 'FINAL' : 'DIFF', status: 'OK', action: r.result === 'A' ? 'APPLIED' : 'BLOCKED' }, 'jev', { type: 'choice', choice: r.result, confidence: r.confidence, probabilities: r.probabilities })); }
  for (const r of src.auditAnswers) { const t = tsOf(r); if (!inWindow(t, F)) continue; out.push(r); }
  const seen = new Set();
  return out.filter((r) => { const k = `${r.request_id}|${r.decision_id}|${r.question}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .filter((r) => !F.purpose || String(r.purpose || '').includes(F.purpose)).filter((r) => !F.type || r.type === F.type);
}
export function answerRow(base, q, a = {}) {
  const kind = a.type || (a.noul !== undefined ? 'noul' : a.score !== undefined ? 'score' : 'choice');
  const dm = kind === 'noul' ? null : distMetrics(a.probabilities);
  const confidence = kind === 'noul' ? noulConf(a.noul) : (typeof a.confidence === 'number' ? a.confidence : null);
  return { ...base, question: q, kind, winner: kind === 'noul' ? (a.noul >= 0.5 ? 'yes' : 'no') : (a.choice ?? dm?.winner ?? null),
    p_winner: kind === 'noul' ? Math.max(a.noul, 1 - a.noul) : dm?.pmax ?? null, confidence, score: a.score ?? null, noul: a.noul ?? null,
    top1: dm?.top1 ?? null, top2: dm?.top2 ?? null, margin: kind === 'noul' ? noulConf(a.noul) : dm?.margin ?? null, ratio: dm?.ratio ?? null, probabilities: a.probabilities || null };
}

export function decisionQuality(rows, outcomes = []) {
  const conf = rows.map((r) => r.confidence).filter((x) => typeof x === 'number');
  const choiceRows = rows.filter((r) => r.kind !== 'noul' && typeof r.margin === 'number');
  const buckets = {}; for (const c of conf) inc(buckets, (Math.min(0.9, Math.floor(c * 10) / 10)).toFixed(1));
  const mBuckets = {}; for (const r of choiceRows) inc(mBuckets, (Math.min(0.9, Math.floor(r.margin * 10) / 10)).toFixed(1));
  const byKind = {}; for (const r of rows) inc(byKind, r.kind);
  const lifecycle = lifecycleStates(rows, outcomes);
  return {
    answers: rows.length, by_kind: byKind, avg_confidence: conf.length ? Math.round((1000 * conf.reduce((a, b) => a + b, 0)) / conf.length) / 1000 : null,
    below_conf_0_5: conf.filter((c) => c < 0.5).length, low_margin_le_0_1: choiceRows.filter((r) => r.margin <= 0.1).length,
    near_tie_le_0_05: choiceRows.filter((r) => r.margin <= 0.05).length, confidence_buckets: buckets, margin_buckets: mBuckets, lifecycle,
  };
}
export function lifecycleStates(rows, outcomes = []) {
  const ids = new Set(rows.map((r) => r.request_id || r.decision_id));
  const byId = new Map(); for (const o of outcomes) if (o && (o.request_id || o.decision_id)) byId.set(o.request_id || o.decision_id, o);
  const st = { OUTCOME_UNKNOWN: 0, OUTCOME_CAPTURED: 0, LABEL_PENDING: 0, LABELED: 0 };
  for (const id of ids) { const o = byId.get(id); if (!o) st.OUTCOME_UNKNOWN++; else if (o.label != null) st.LABELED++; else if (o.outcome != null) { st.OUTCOME_CAPTURED++; st.LABEL_PENDING++; } else st.OUTCOME_UNKNOWN++; }
  const total = ids.size;
  return { decisions: total, ...st, with_outcome: st.OUTCOME_CAPTURED + st.LABELED, without_outcome: st.OUTCOME_UNKNOWN, unlabeled: total - st.LABELED,
    calibration_coverage_pct: pct(st.LABELED, total), accuracy_by_confidence_bucket: st.LABELED ? 'COMPUTE_FROM_LABELS' : 'NO_LABELS_YET' };
}

// ---------- Claude transcripts ----------
const sz = (c) => (typeof c === 'string' ? c.length : Array.isArray(c) ? c.reduce((a, b) => a + (b.text ? b.text.length : b.content ? sz(b.content) : JSON.stringify(b).length), 0) : JSON.stringify(c || '').length);
export function toolClass(b) {
  let k = b.name;
  if (k === 'Bash' || k === 'PowerShell') {
    const c = String(b.input?.command || '');
    k += /\b(npm (run )?test|node --test|test:)/.test(c) ? ':test' : /\b(cat|sed -n|head|tail|Get-Content|grep|rg)\b/.test(c) ? ':read' : /\bgit\b/.test(c) ? ':git' : /jev_ask|jevAsk|jev-diff|finish\.mjs/.test(c) ? ':jev' : ':other';
  }
  return k;
}
const REREAD_RX = /\b(?:cat|sed -n [^ ]+|head(?: -n? ?\d+)?|tail(?: -n? ?\d+)?|Get-Content)\s+["']?([^\s"'|;]+)/;

export function parseTranscript(file, F) {
  const s = { file, session_id: path.basename(file, '.jsonl'), sidechain: /subagents/.test(file), entries: 0, bad_lines: 0, first: null, last: null,
    asst_entries: 0, models: {}, usage_entries: { input: 0, cache_read: 0, cache_creation: 0, output: 0 }, usage_dedup: { input: 0, cache_read: 0, cache_creation: 0, output: 0 },
    msg_ids: 0, context: [], tools: {}, results: [], attachments: {}, hooks: [], agent_calls: [], workflow_calls: [], reads: {}, models_dedup: {} };
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const pending = new Map(); const seenMsg = new Set();
  for (const line of text.split('\n')) {
    if (!line) continue; let o; try { o = JSON.parse(line); } catch { s.bad_lines++; continue; }
    const t = Date.parse(o.timestamp); if (t && !inWindow(t, F)) continue;
    s.entries++; if (t) { if (!s.first || t < s.first) s.first = t; if (!s.last || t > s.last) s.last = t; }
    if (o.type === 'assistant' && o.message) {
      const m = o.message.model || 'unknown'; const u = o.message.usage || {};
      s.asst_entries++; inc(s.models, m);
      s.usage_entries.input += u.input_tokens || 0; s.usage_entries.cache_read += u.cache_read_input_tokens || 0; s.usage_entries.cache_creation += u.cache_creation_input_tokens || 0; s.usage_entries.output += u.output_tokens || 0;
      const mid = o.message.id || o.requestId || o.uuid;
      if (!seenMsg.has(mid)) { seenMsg.add(mid); s.msg_ids++; inc(s.models_dedup, m);
        s.usage_dedup.input += u.input_tokens || 0; s.usage_dedup.cache_read += u.cache_read_input_tokens || 0; s.usage_dedup.cache_creation += u.cache_creation_input_tokens || 0; s.usage_dedup.output += u.output_tokens || 0;
        if (t) s.context.push([t, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)]); }
      for (const b of o.message.content || []) if (b.type === 'tool_use') {
        const k = toolClass(b); pending.set(b.id, { k, b });
        if (b.name === 'Agent' || b.name === 'Task') s.agent_calls.push({ t, type: b.input?.subagent_type || 'general-purpose', model: b.input?.model || 'inherit', background: !!b.input?.run_in_background });
        if (b.name === 'Workflow') s.workflow_calls.push({ t, name: b.input?.name || null });
        const cmd = String(b.input?.command || ''); const rm = b.name === 'Read' ? b.input?.file_path : (REREAD_RX.exec(cmd) || [])[1];
        if (rm) inc(s.reads, String(rm).replace(/\\/g, '/'));
      }
    }
    if (o.type === 'user' && o.message && Array.isArray(o.message.content)) for (const b of o.message.content) if (b.type === 'tool_result') {
      const p = pending.get(b.tool_use_id); const k = p ? p.k : '?'; const n = sz(b.content);
      (s.tools[k] = s.tools[k] || { calls: 0, chars: 0, sizes: [] }); s.tools[k].calls++; s.tools[k].chars += n; s.tools[k].sizes.push(n);
      s.results.push({ chars: n, tool: k, t });
    }
    if (o.type === 'attachment' || o.attachment) { const a = o.attachment || {}; const k = a.type || 'attachment'; (s.attachments[k] = s.attachments[k] || { n: 0, chars: 0 }); s.attachments[k].n++; s.attachments[k].chars += JSON.stringify(a).length;
      if (/^hook_/.test(k)) s.hooks.push({ t, kind: k, hook: a.hookName || a.hookEvent || null, chars: (a.content ? sz(a.content) : 0) + (a.stdout ? String(a.stdout).length : 0) }); }
    if (o.type === 'system' && o.subtype) { const k = 'system:' + o.subtype; (s.attachments[k] = s.attachments[k] || { n: 0, chars: 0 }); s.attachments[k].n++; s.attachments[k].chars += (o.content || '').length;
      if (o.subtype === 'stop_hook_summary') for (const h of o.hookInfos || []) s.hooks.push({ t, kind: 'stop_hook_duration', hook: /jev-finish/.test(h.command) ? 'jev-finish' : /jev-rotation/.test(h.command) ? 'jev-rotation' : 'other', duration_ms: h.durationMs, errors: (o.hookErrors || []).length, blocked: !!o.preventedContinuation }); }
  }
  return s;
}

export function claudeAgg(sessions) {
  const main = sessions.filter((s) => !s.sidechain && s.first);
  const sub = sessions.filter((s) => s.sidechain && s.first);
  const tot = (k, f) => main.reduce((a, s) => a + s[f][k], 0);
  const U = (f) => ({ input: tot('input', f), cache_read: tot('cache_read', f), cache_creation: tot('cache_creation', f), output: tot('output', f) });
  const tools = {}; let results = [];
  for (const s of main) { for (const [k, v] of Object.entries(s.tools)) { const T = (tools[k] = tools[k] || { calls: 0, chars: 0, sizes: [] }); T.calls += v.calls; T.chars += v.chars; T.sizes.push(...v.sizes); }
    results = results.concat(s.results.map((r) => ({ ...r, session: s.session_id.slice(0, 8) }))); }
  const totalChars = Object.values(tools).reduce((a, v) => a + v.chars, 0);
  const toolRows = Object.entries(tools).map(([k, v]) => ({ tool: k, calls: v.calls, chars: v.chars, pct: pct(v.chars, totalChars), avg: Math.round(v.chars / v.calls), p50: quantile(v.sizes, 0.5), p95: quantile(v.sizes, 0.95), over_20k: v.sizes.filter((x) => x > 20000).length })).sort((a, b) => b.chars - a.chars);
  const toolFamily = {}; for (const r of toolRows) inc(toolFamily, r.tool.split(':')[0], r.chars);
  const models = {}, modelsDedup = {}; for (const s of main) { for (const [m, n] of Object.entries(s.models)) inc(models, m, n); for (const [m, n] of Object.entries(s.models_dedup)) inc(modelsDedup, m, n); }
  const att = {}; for (const s of main) for (const [k, v] of Object.entries(s.attachments)) { const A = (att[k] = att[k] || { n: 0, chars: 0 }); A.n += v.n; A.chars += v.chars; }
  const reads = {}; for (const s of main) for (const [p, n] of Object.entries(s.reads)) inc(reads, p, n);
  const ctxPoints = main.flatMap((s) => s.context.map(([t, c]) => ({ t, c, s: s.session_id.slice(0, 8) }))).sort((a, b) => a.t - b.t);
  const sessRows = main.map((s) => { const peak = s.context.reduce((a, [, c]) => Math.max(a, c), 0); const hrs = s.first && s.last ? (s.last - s.first) / 3600000 : 0;
    const actions = Object.values(s.tools).reduce((a, v) => a + v.calls, 0);
    return { session_id: s.session_id, first: s.first ? new Date(s.first).toISOString() : null, last: s.last ? new Date(s.last).toISOString() : null, duration_h: Math.round(hrs * 100) / 100,
      responses: s.msg_ids, entries: s.asst_entries, peak_context: peak, last_context: s.context.length ? s.context[s.context.length - 1][1] : 0,
      growth_per_hour: hrs > 0 ? Math.round(peak / hrs) : null, growth_per_action: actions ? Math.round(peak / actions) : null, tool_calls: actions,
      models: s.models_dedup, usage: s.usage_dedup }; }).sort((a, b) => (a.first || '').localeCompare(b.first || ''));
  const asstEntries = main.reduce((a, s) => a + s.asst_entries, 0), responses = main.reduce((a, s) => a + s.msg_ids, 0);
  const fam = (m) => (/opus/i.test(m) ? 'OPUS' : /sonnet/i.test(m) ? 'SONNET' : /haiku/i.test(m) ? 'HAIKU' : 'OTHER');
  const famPct = (M, total) => { const f = { OPUS: 0, SONNET: 0, HAIKU: 0, OTHER: 0 }; for (const [m, n] of Object.entries(M)) if (m !== '<synthetic>') f[fam(m)] += n; const T = Object.values(f).reduce((a, b) => a + b, 0) || total; return Object.fromEntries(Object.entries(f).map(([k, v]) => [`${k}_USAGE_PERCENT`, pct(v, T)])); };
  const agents = main.flatMap((s) => s.agent_calls.map((a) => ({ ...a, parent: s.session_id }))); const workflows = main.flatMap((s) => s.workflow_calls.map((w) => ({ ...w, parent: s.session_id })));
  const usageE = U('usage_entries'), usageD = U('usage_dedup');
  return {
    sessions: main.length, sidechain_transcripts: sub.length, assistant_entries: asstEntries, responses_dedup: responses,
    usage_legacy_per_entry: usageE, usage_dedup_by_message: usageD,
    cache_read_over_output: usageD.output ? Math.round(usageD.cache_read / usageD.output) : null,
    models_per_entry: models, models_dedup: modelsDedup, model_family_percent_entries: famPct(models, asstEntries), model_family_percent: famPct(modelsDedup, responses),
    tool_result_chars_total: totalChars, tools: toolRows.map(({ sizes, ...r }) => r), tool_family_chars: toolFamily,
    results_over_20k: results.filter((r) => r.chars > 20000).length, top20_results: results.sort((a, b) => b.chars - a.chars).slice(0, 20).map((r) => ({ ...r, ts: r.t ? new Date(r.t).toISOString() : null, t: undefined })),
    attachments: att, repeated_reads: Object.entries(reads).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([p, n]) => ({ path: p.slice(-120), reads: n })),
    context_series: downsample(ctxPoints, 400).map((p) => ({ ts: new Date(p.t).toISOString(), context: p.c, session: p.s })),
    current_context: ctxPoints.length ? ctxPoints[ctxPoints.length - 1].c : 0, session_rows: sessRows,
    agents: { spawned: agents.length, sidechain_transcripts: sub.length, calls: agents, fields: ['agent_spawned', 'parent_session', 'agent_type', 'model', 'duration', 'input/output/cache tokens', 'tool_calls', 'result_chars_returned', 'status', 'retries', 'concurrency', 'total_cost', 'context_saved_added'] },
    workflows: { runs: workflows.length, calls: workflows, fields: ['workflow_id', 'stage', 'agent_count', 'concurrency', 'budget', 'duration', 'result'] },
  };
}
function downsample(a, n) { if (a.length <= n) return a; const step = a.length / n; const out = []; for (let i = 0; i < n; i++) out.push(a[Math.floor(i * step)]); out.push(a[a.length - 1]); return out; }

// ---------- hooks ----------
export function hookAgg(probeRows, sessions, F) {
  const rows = probeRows.filter((r) => inWindow(tsOf(r), F)).map((r) => ({ ...r, source: 'probe' }));
  const passive = sessions.filter((s) => !s.sidechain).flatMap((s) => s.hooks.filter((h) => h.kind === 'stop_hook_duration').map((h) => ({ hook: h.hook, event: 'Stop', duration_ms: h.duration_ms, blocked: h.blocked, source: 'transcript:stop_hook_summary', at: h.t ? new Date(h.t).toISOString() : null })));
  const inj = sessions.filter((s) => !s.sidechain).flatMap((s) => s.hooks.filter((h) => h.kind !== 'stop_hook_duration'));
  const group = {};
  for (const r of [...rows, ...passive]) { const k = `${r.hook}|${r.event || 'UNKNOWN'}|${r.source.startsWith('probe') ? 'probe' : 'transcript'}`; (group[k] = group[k] || []).push(r); }
  const table = Object.entries(group).map(([k, rs]) => { const [hook, event, src] = k.split('|'); const d = rs.map((r) => r.duration_ms).filter((x) => typeof x === 'number');
    return { hook, event, source: src, calls: rs.length, p50: quantile(d, 0.5), p95: quantile(d, 0.95), p99: quantile(d, 0.99), wall_ms: Math.round(d.reduce((a, b) => a + b, 0)),
      failures: rs.filter((r) => r.error || (r.exit_code != null && r.exit_code !== 0 && r.exit_code !== 2)).length, timeouts: rs.filter((r) => (r.duration_ms || 0) >= 15000).length,
      blockers: rs.filter((r) => r.blocked).length, injected_chars: rs.reduce((a, r) => a + (r.injected_chars || 0), 0) }; }).sort((a, b) => b.calls - a.calls);
  const all = [...rows, ...passive].map((r) => r.duration_ms).filter((x) => typeof x === 'number');
  const injByKind = {}; for (const h of inj) inc(injByKind, h.kind, h.chars || 0);
  return { probe_records: rows.length, transcript_stop_records: passive.length, p50: quantile(all, 0.5), p95: quantile(all, 0.95), p99: quantile(all, 0.99), table,
    transcript_hook_injections: injByKind, transcript_hook_blocking_errors: inj.filter((h) => h.kind === 'hook_blocking_error').length,
    recent: rows.slice(-50).map((r) => ({ at: r.at, hook: r.hook, event: r.event, duration_ms: r.duration_ms, exit_code: r.exit_code, blocked: r.blocked, injected_chars: r.injected_chars })) };
}

// ---------- rotation / sessions ----------
export function rotationAgg(lineage, events, legacy, briefFiles, F) {
  const L = lineage.filter((r) => inWindow(tsOf(r), F)), E = events.filter((r) => inWindow(tsOf(r), F));
  const byEvent = {}; for (const r of L) inc(byEvent, r.event);
  const levels = {}; const perSession = {};
  for (const r of E) { inc(levels, r.level); const S = (perSession[r.sid] = perSession[r.sid] || { sid: r.sid, first: r.at, last: r.at, max_tokens: 0, levels: {} }); S.last = r.at; S.max_tokens = Math.max(S.max_tokens, r.tokens || 0); inc(S.levels, r.level); }
  const rotations = L.filter((r) => r.event === 'SUCCESSOR_CONFIRMED' || r.event === 'ROTATED' || (r.successor && r.trigger)).filter((r, i, a) => a.findIndex((x) => x.from === r.from && x.successor === r.successor) === i);
  const triggers = L.filter((r) => r.trigger).map((r) => ({ at: r.at, from: (r.from || '').slice(0, 8), successor: (r.successor || '').slice(0, 8), trigger: r.trigger, tokens: r.tokens, projected: r.projected, depth: r.depth }));
  const briefs = briefFiles.map((f) => { const st = statOf(f); return { file: path.basename(f), bytes: st.bytes, est_tokens: Math.round(st.bytes / 3), mtime: st.mtime }; }).filter((b) => inWindow(Date.parse(b.mtime), F));
  const rotByHour = {}; for (const r of triggers) if (r.at) inc(rotByHour, hourKey(Date.parse(r.at)));
  const gaps = triggers.map((r) => Date.parse(r.at)).filter(Boolean).sort((a, b) => a - b).map((t, i, a) => (i ? (t - a[i - 1]) / 60000 : null)).filter((x) => x != null);
  const legacyF = legacy.filter((r) => inWindow(tsOf(r), F)); const legacyBy = {}; for (const r of legacyF) inc(legacyBy, r.event);
  return { lineage_events: byEvent, rotations: triggers.length, confirmed_successors: rotations.length, triggers: triggers.slice(-100), levels_hook_calls: levels,
    sessions: Object.values(perSession).sort((a, b) => a.first.localeCompare(b.first)), briefs: { count: briefs.length, total_bytes: briefs.reduce((a, b) => a + b.bytes, 0), est_tokens_reinjected: briefs.reduce((a, b) => a + b.est_tokens, 0), recent: briefs.slice(-20) },
    rotations_by_hour: rotByHour, minutes_between_rotations: { p50: quantile(gaps, 0.5), min: gaps.length ? Math.min(...gaps) : null }, legacy_rotation_events: legacyBy };
}

// ---------- anomalies (deterministic, never block) ----------
export function anomalies(S) {
  const A = []; const add = (level, code, msg, value) => A.push({ level, code, msg, value });
  const c = S.claude, j = S.jev, q = S.decisions_quality, h = S.hooks, r = S.rotation;
  const fast = (c.session_rows || []).filter((s) => s.growth_per_hour && s.growth_per_hour > 100000);
  if (fast.length) add('WATCH', 'CONTEXT_GROWING_FAST', `${fast.length} sessões com crescimento de contexto > 100k tokens/h`, fast.length);
  if (c.results_over_20k) add(c.results_over_20k > 20 ? 'WARNING' : 'WATCH', 'TOOL_OUTPUT_EXCESSIVE', `${c.results_over_20k} resultados de ferramenta > 20k chars`, c.results_over_20k);
  const rr = (c.repeated_reads || []).filter((x) => x.reads >= 5); if (rr.length) add('WATCH', 'REPEATED_READS', `${rr.length} arquivos lidos ≥ 5 vezes (máx ${rr[0].reads}× ${rr[0].path})`, rr.length);
  if (h.p95 != null && h.p95 > 1000) add('WARNING', 'HOOK_SLOW', `hook p95 ${h.p95} ms`, h.p95); else if (h.p95 != null && h.p95 > 300) add('WATCH', 'HOOK_SLOW', `hook p95 ${h.p95} ms`, h.p95);
  const to = h.table.reduce((a, t) => a + t.timeouts, 0); if (to) add('WARNING', 'HOOK_TIMEOUT', `${to} execuções de hook ≥ 15 s`, to);
  if (!h.probe_records) add('INFO', 'HOOK_PROBE_NO_DATA', 'probe de hooks ainda sem registros (só Stop via transcript)', 0);
  add('INFO', 'JEV_RETRIES_NOT_RECORDED', 'retries internos do lib.js não são logados (só a tentativa final)', null);
  if (j.errors.length) add(j.errors.length > 10 ? 'WARNING' : 'WATCH', 'JEV_HTTP_ERRORS', `${j.errors.length} requests JEV com HTTP ≠ 200`, j.errors.length);
  if (q.answers && q.below_conf_0_5 / q.answers > 0.1) add('WATCH', 'LOW_CONFIDENCE', `${q.below_conf_0_5}/${q.answers} respostas com confidence < 0.5`, q.below_conf_0_5);
  if (q.low_margin_le_0_1) add('WATCH', 'LOW_MARGIN', `${q.low_margin_le_0_1} respostas Choice/Score com margem top1−top2 ≤ 0.1 (${q.near_tie_le_0_05} quase empate ≤ 0.05)`, q.low_margin_le_0_1);
  const mf = c.model_family_percent || {}; const top = Math.max(...Object.values(mf), 0); if (top > 95) add('WATCH', 'MODEL_CONCENTRATION', `${top}% das respostas Claude em uma única família`, top);
  if (!q.lifecycle.LABELED) add('WARNING', 'NO_LABELS', `0 decisões rotuladas de ${q.lifecycle.decisions} (calibration coverage 0%)`, 0);
  if (j.non_production) add('INFO', 'JEV_NON_PRODUCTION_RECORDS', `${j.non_production} registros JEV de teste/sem request_id excluídos do uso`, j.non_production);
  if (r.minutes_between_rotations.min != null && r.minutes_between_rotations.min < 30) add('WATCH', 'ROTATION_FREQUENT', `intervalo mínimo entre rotações ${Math.round(r.minutes_between_rotations.min)} min (p50 ${Math.round(r.minutes_between_rotations.p50)} min)`, r.minutes_between_rotations.min);
  if (!c.agents.spawned) add('INFO', 'NO_SUBAGENTS', '0 subagentes / 0 workflows (Phase 1: só medição)', 0);
  return A;
}

// ---------- loaders ----------
export function loadLoopJev(dir) {
  const out = [];
  for (const f of listFiles(dir, (p) => /\.json$/.test(p) && !/\.hb\.json$/.test(p))) {
    const j = readJsonFile(f); if (!j) continue;
    const walk = (o, kind) => { if (!o || typeof o !== 'object') return; if (o.request_id && o.probabilities) { out.push({ ...o, kind: kind || o.kind || 'diff', loop_id: j.loop_id || path.basename(f, '.json') }); return; }
      for (const [k, v] of Object.entries(o)) walk(v, /final/i.test(k) ? 'final' : /diff/i.test(k) ? 'diff' : kind); };
    walk(j.jev || j, null);
  }
  return out;
}
export function loadAuditAnswers(file) {
  const j = readJsonFile(file); const out = [];
  const arr = Array.isArray(j) ? j : j && (j.results || j.candidates || Object.values(j));
  for (const r of arr || []) { if (!r || !r.answers) continue; const base = { source: 'audit-results', t: Date.parse(r.ts || r.at || '2026-10-02T21:31:38Z'), ts: r.ts || r.at || '2026-10-02T21:31:38Z', request_id: r.request_id || r.meta?.request_id || null, decision_id: r.id || r.candidate || null, purpose: r.purpose || `audit-potential-20261002:${r.id || ''}`, type: 'audit', status: 'OK', action: 'RECORDED' };
    for (const [q, a] of Object.entries(r.answers)) out.push(answerRow(base, q, a)); }
  return out;
}
export function loadAll(P = paths()) {
  const R = (k) => readNdjson(P[k]);
  const routing = R('routing'), decisions = R('decisions'), models = R('models'), coverage = R('coverage'), legacy = R('legacyRotation'), fb = R('routerFeedback');
  const rot = R('rotEvents'), lin = R('lineage'), probe = R('hookMetrics'), outc = R('outcomes'), shadow = R('shadowLedger');
  const transcripts = listFiles(P.projects, (p) => p.endsWith('.jsonl'), true);
  const briefs = listFiles(P.rotationBriefs, (p) => /ROTATION_.*\.md$/.test(p));
  const sources = { routing: routing.status, decisions: decisions.status, models: models.status, coverage: coverage.status, legacy_rotation: legacy.status, router_feedback: fb.status,
    rotation_events: rot.status, lineage: lin.status, hook_metrics: probe.status, outcomes: outc.status, shadow_ledger: shadow.status,
    transcripts: { path: P.projects, exists: transcripts.length > 0, files: transcripts.length }, rotation_briefs: { path: P.rotationBriefs, files: briefs.length },
    jev_finish_loops: { path: P.loops, ...statOf(P.loops) }, audit_results: { path: P.auditResults, ...statOf(P.auditResults) } };
  return { P, sources, routing: routing.rows, decisions: decisions.rows, models: models.rows, coverage: coverage.rows, legacy: legacy.rows, routerFeedback: fb.rows,
    rotEvents: rot.rows, lineage: lin.rows, probe: probe.rows, outcomes: outc.rows, shadow: shadow.rows, transcripts, briefs,
    loopJev: loadLoopJev(P.loops), auditAnswers: loadAuditAnswers(P.auditResults) };
}

export function summarize(src, filter = {}, opts = {}) {
  const F = makeFilter(filter, opts.now);
  const sessFiles = filter.session ? src.transcripts.filter((f) => path.basename(f).startsWith(filter.session)) : src.transcripts;
  const parsed = sessFiles.map((f) => (opts.parse || parseTranscript)(f, F)).filter(Boolean);
  const jev = jevUsage(src.routing, F);
  const dec = jevDecisions({ decisions: src.decisions, loopJev: src.loopJev, auditAnswers: [...src.auditAnswers, ...src.shadow.map((r) => answerRow({ source: 'shadow-ledger', t: tsOf(r), ts: r.at, request_id: r.request_id, decision_id: r.spec_sha, purpose: r.purpose, type: requestType(r.purpose), status: 'OK', action: r.result }, 'jev', { type: 'choice', choice: r.result, confidence: r.confidence, probabilities: r.probabilities }))] }, F);
  const claude = claudeAgg(parsed);
  const S = { generated_at: new Date().toISOString(), filter: { range: filter.range || 'all', ...filter }, sources: src.sources, jev, decisions_quality: decisionQuality(dec, src.outcomes),
    decisions: dec.slice(-300).map(({ t, ...r }) => r), claude, hooks: hookAgg(src.probe, parsed, F), rotation: rotationAgg(src.lineage, src.rotEvents, src.legacy, src.briefs, F),
    router_feedback_labels: src.routerFeedback.length, jev_models_calls: src.models.filter((r) => inWindow(tsOf(r), F)).length };
  S.anomalies = anomalies(S);
  return S;
}
