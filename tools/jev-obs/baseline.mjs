#!/usr/bin/env node
// BASELINE (handoff numbers, before Phase 1) × RECONCILE (recomputed from the sources with the same windows).
//   node tools/jev-obs/baseline.mjs [--out-dir handoffs/assets]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, summarize, jevUsage, makeFilter } from './aggregate.mjs';
import { paths } from './sources.mjs';

export const BASELINE = {
  source: 'HANDOFF_JEV_USAGE_AUDIT_20261002.md + HANDOFF_JEV_POTENTIAL_AUDIT_20261002.md (commit ce6c0fe)',
  jev_cutoff: '2026-10-02T21:06:43Z', claude_cutoff: '2026-10-02T21:56:51Z',
  jev: { requests: 1297, input_tokens: 5529326, output_tokens: 811330, spend_usd: 0.23223169 },
  claude: { sessions: 41, assistant_entries: 6030, opus_entries: 6030, subagents: 0, bash_read_pct: 71.3, read_pct: 14.3, results_over_20k: 29, cache_read_approx: 841.7e6, output_approx: 7.26e6 },
  decisions: { outcome_labels: 0, router_labels: 25, jev_density: '0.05–0.09 (manual, Edit/Write × consultas avulsas)', diff_final_questions_per_req: 1.11 },
};

export function reconcile(src) {
  const j = jevUsage(src.routing, makeFilter({ range: 'all', until: BASELINE.jev_cutoff }));
  const S = summarize(src, { range: 'all', until: BASELINE.claude_cutoff });
  const c = S.claude; const pctOf = (k) => (c.tools.find((t) => t.tool === k) || {}).pct;
  const rows = [];
  const eq = (name, base, now, tol = 0, kind = 'EXACT') => rows.push({ metric: name, baseline: base, recomputed: now, diff: typeof base === 'number' && typeof now === 'number' ? Math.round((now - base) * 1e8) / 1e8 : null, tolerance: tol, kind, pass: typeof base === 'number' ? Math.abs(now - base) <= tol : base === now });
  eq('jev.requests', BASELINE.jev.requests, j.requests); eq('jev.input_tokens', BASELINE.jev.input_tokens, j.input_tokens); eq('jev.output_tokens', BASELINE.jev.output_tokens, j.output_tokens);
  eq('jev.spend_usd', BASELINE.jev.spend_usd, j.spend_usd, 1e-8);
  eq('claude.sessions (main transcripts with in-window events)', BASELINE.claude.sessions, c.sessions);
  eq('claude.assistant_entries', BASELINE.claude.assistant_entries, c.assistant_entries); eq('claude.opus_entries', BASELINE.claude.opus_entries, Object.entries(c.models_per_entry).filter(([m]) => /opus/i.test(m)).reduce((a, [, v]) => a + v, 0));
  eq('claude.subagents', BASELINE.claude.subagents, c.agents.spawned); eq('claude.results_over_20k', BASELINE.claude.results_over_20k, c.results_over_20k);
  eq('claude.bash_read_pct (1 decimal)', BASELINE.claude.bash_read_pct, pctOf('Bash:read'), 0, 'ROUNDED_1DP'); eq('claude.read_pct (1 decimal)', BASELINE.claude.read_pct, pctOf('Read'), 0, 'ROUNDED_1DP');
  eq('claude.cache_read legacy per-entry (0.1M)', BASELINE.claude.cache_read_approx, Math.round(c.usage_legacy_per_entry.cache_read / 1e5) * 1e5, 0, 'ROUNDED_0.1M');
  eq('claude.output legacy per-entry (0.01M)', BASELINE.claude.output_approx, Math.round(c.usage_legacy_per_entry.output / 1e4) * 1e4, 0, 'ROUNDED_0.01M');
  eq('decisions.labeled', BASELINE.decisions.outcome_labels, S.decisions_quality.lifecycle.LABELED); eq('router_feedback.labels', BASELINE.decisions.router_labels, S.router_feedback_labels);
  eq('jev.DIFF+FINAL questions/request (ad-hoc, 2dp)', BASELINE.decisions.diff_final_questions_per_req, (() => { const q = j.multi_question.questions_per_request_by_type; const rs = src.routing.filter((r) => /^(DIFF|FINAL)$/.test(r.__t)); return null; })() ?? BASELINE.decisions.diff_final_questions_per_req, 0, 'NOT_RECOMPUTED_SEE_NOTE');
  rows[rows.length - 1].pass = null;
  return { rows, pass: rows.filter((r) => r.pass === true).length, fail: rows.filter((r) => r.pass === false).length, not_recomputed: rows.filter((r) => r.pass === null).length,
    exact_values: { claude_usage_legacy_per_entry: c.usage_legacy_per_entry, claude_usage_dedup_by_message: c.usage_dedup_by_message, responses_dedup: c.responses_dedup, jev_by_type_to_cutoff: j.by_type },
    notes: ['Claude usage legacy = soma por entrada do transcript (método do benchmark 1131cf45); cada message.id aparece em várias entradas (1 por bloco). Valor correto = usage_dedup_by_message.',
      'DIFF/FINAL 1,11 pergunta/req veio de classificação manual de 57 consultas avulsas (Fase 3); o painel mostra perguntas/request por tipo regex (by type), não a mesma amostra.',
      'Densidade JEV 0,05–0,09 depende da contagem manual de shells mutáveis; não recalculada automaticamente nesta fase.'] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out-dir'); const dir = i > 0 ? process.argv[i + 1] : path.join(paths().repoRoot, 'handoffs', 'assets');
  const R = reconcile(loadAll());
  fs.writeFileSync(path.join(dir, 'JEV_OBS_PHASE1_baseline_20261002.json'), JSON.stringify(BASELINE, null, 2));
  fs.writeFileSync(path.join(dir, 'JEV_OBS_PHASE1_reconcile_20261002.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify({ pass: R.pass, fail: R.fail, not_recomputed: R.not_recomputed, failed: R.rows.filter((r) => r.pass === false) }, null, 2));
  process.exit(R.fail ? 1 : 0);
}
