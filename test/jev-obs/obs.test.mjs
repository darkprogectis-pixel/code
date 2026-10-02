// JEV Observability Phase 1 — unit + integration tests (observational only; all fixtures in temp dirs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paths, readNdjson } from '../../tools/jev-obs/sources.mjs';
import { loadAll, summarize, jevUsage, makeFilter, requestType, distMetrics, noulConf, rotationAgg, hookAgg, parseTranscript, lifecycleStates, JEV_PRICE_INPUT_PER_TOKEN } from '../../tools/jev-obs/aggregate.mjs';
import { createServer, redact, HOST } from '../../tools/jev-obs/server.mjs';
import { cachedParse, cacheStats } from '../../tools/jev-obs/cache.mjs';
import { importShadow } from '../../tools/jev-obs/shadow-ledger.mjs';
import { bench, SCENARIOS } from '../../tools/jev-obs/bench-hooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = Date.parse('2026-10-02T12:00:00Z');
const nd = (rows) => rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';
const FAKE_KEY = 'sk-FAKEKEY0123456789abcdef';

function fixture({ empty = false } = {}) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-obs-test-'));
  const P = paths({ configDir: path.join(t, 'cfg'), jevLogs: path.join(t, 'logs'), repoRoot: path.join(t, 'repo'), obsDir: path.join(t, 'cfg', 'jev-obs') });
  if (empty) return { t, P };
  for (const d of [P.jevLogs, path.join(P.projects, 'proj'), path.dirname(P.lineage), P.loops, P.obsDir, P.rotationBriefs]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(P.routing, nd([
    { ts: '2026-10-02T10:00:00Z', purpose: 'context-route:x', model: 'jev-1', http: 200, request_id: 'req_1', input_tokens: 1000, output_tokens: 100, session_id: 'sessA', latency_ms: 50 },
    { ts: '2026-10-02T10:00:00Z', purpose: 'context-route:x', model: 'jev-1', http: 200, request_id: 'req_1', input_tokens: 1000, output_tokens: 100, session_id: 'sessA' }, // duplicate
    { ts: '2026-10-02T10:05:00Z', purpose: 'jev-finish-diff:L1', model: 'jev-2', http: 200, request_id: 'req_2', input_tokens: 3000, output_tokens: 0, session_id: 'sessB', questions: 1 },
    { ts: '2026-09-20T10:05:00Z', purpose: 'decision:old', model: 'jev-1', http: 200, request_id: 'req_old', input_tokens: 500, output_tokens: 0 },
    { ts: '2026-10-02T10:06:00Z', purpose: 'smoke-test', model: 'x', http: 200, request_id: null, input_tokens: 9, output_tokens: 9 }, // TEST
    { ts: '2026-10-02T10:07:00Z', purpose: `audit ${FAKE_KEY}`, model: 'jev-1', http: 500, request_id: 'req_err' },
    '{"ts":"2026-10-02T10:08:00Z", "purpose": broken', '', '{"partial":',
  ]));
  fs.writeFileSync(P.decisions, nd([
    { ts: '2026-10-02T10:01:00Z', decision_id: 'd1', request_id: 'req_1', purpose: 'decision:gate', status: 'OK', gate_open: true, state: 'PRIVATE PROMPT TEXT', api_key: FAKE_KEY,
      answers: { q1: { type: 'choice', choice: 'A', confidence: 0.4, probabilities: { A: 0.52, B: 0.48 } }, q2: { noul: 0.9 }, q3: { type: 'score', score: 7, confidence: 0.8, probabilities: { 7: 0.8, 6: 0.2 } } } },
  ]));
  const s1 = 'aaaaaaaa-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(P.projects, 'proj', `${s1}.jsonl`), nd([
    { type: 'assistant', timestamp: '2026-10-02T10:00:00Z', message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 5, output_tokens: 50 },
      content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'cat foo.md' } }, { type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: 'foo.md' } }] } },
    { type: 'assistant', timestamp: '2026-10-02T10:00:01Z', message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 5, output_tokens: 50 }, content: [] } },
    { type: 'user', timestamp: '2026-10-02T10:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'x'.repeat(25000) }, { type: 'tool_result', tool_use_id: 'tu2', content: 'y'.repeat(100) }] } },
    { type: 'system', subtype: 'stop_hook_summary', timestamp: '2026-10-02T10:00:03Z', hookInfos: [{ command: 'node tools/jev-rotation/hook.mjs', durationMs: 120 }, { command: 'node tools/jev-finish/hook.mjs', durationMs: 80 }], hookErrors: [], preventedContinuation: false },
    { type: 'attachment', timestamp: '2026-10-02T10:00:04Z', attachment: { type: 'hook_additional_context', hookName: 'SessionStart', content: 'ctx'.repeat(10) } },
    'not json',
  ]));
  fs.writeFileSync(P.lineage, nd([
    { at: '2026-10-02T09:00:00Z', event: 'ROTATION_TRIGGERED', from: 'sessA', successor: 'sessB', trigger: 'HARD_ROTATION', tokens: 240100, depth: 1 },
    { at: '2026-10-02T09:10:00Z', event: 'ROTATION_TRIGGERED', from: 'sessB', successor: 'sessC', trigger: 'HARD_ROTATION', tokens: 240200, depth: 2 },
    { at: '2026-10-02T09:11:00Z', event: 'SUCCESSOR_CONFIRMED', from: 'sessB', successor: 'sessC' },
  ]));
  fs.writeFileSync(P.rotEvents, nd([{ at: '2026-10-02T08:59:00Z', sid: 'sessA', level: 'WARNING', tokens: 221000 }, { at: '2026-10-02T09:00:00Z', sid: 'sessA', level: 'HARD_ROTATION', tokens: 240100 }]));
  fs.writeFileSync(P.hookMetrics, nd([{ at: '2026-10-02T10:00:00Z', hook: 'jev-rotation', event: 'PreToolUse', duration_ms: 70, exit_code: 0, blocked: false, injected_chars: 0 },
    { at: '2026-10-02T10:00:01Z', hook: 'jev-finish', event: 'PreToolUse', duration_ms: 16000, exit_code: 0, blocked: true, injected_chars: 40 }]));
  fs.writeFileSync(path.join(P.loops, 'jf-1.json'), JSON.stringify({ loop_id: 'jf-1', jev: { diff: { request_id: 'req_2', at: '2026-10-02T10:05:00Z', result: 'A', confidence: 0.9, probabilities: { A: 0.9, B: 0.06, C: 0.04 }, proposal_sha: 'abc' } } }));
  fs.writeFileSync(path.join(P.rotationBriefs, 'ROTATION_a_TO_b.md'), 'brief '.repeat(100));
  return { t, P };
}

test('NDJSON reader: good/corrupt/partial/empty lines counted, missing file is not fatal', () => {
  const { P } = fixture();
  const r = readNdjson(P.routing);
  assert.equal(r.rows.length, 6); assert.equal(r.status.bad_lines, 2); assert.equal(r.status.lines, 8); assert.match(r.status.sha12, /^[0-9a-f]{12}$/);
  const m = readNdjson(path.join(P.jevLogs, 'nope.ndjson'));
  assert.deepEqual(m.rows, []); assert.equal(m.status.exists, false);
});

test('JEV usage: dedupe by request_id, TEST and http≠200 separated, spend, retries NOT_RECORDED', () => {
  const { P } = fixture(); const src = loadAll(P);
  const j = jevUsage(src.routing, makeFilter({ range: 'all' }, NOW));
  assert.equal(j.requests, 3); assert.equal(j.duplicates_dropped, 1); assert.equal(j.non_production, 1); assert.equal(j.errors.length, 1);
  assert.equal(j.input_tokens, 4500); assert.equal(j.output_tokens, 100);
  assert.equal(j.spend_usd, Math.round(4500 * JEV_PRICE_INPUT_PER_TOKEN * 1e8) / 1e8);
  assert.equal(j.retries.status, 'NOT_RECORDED_BY_CLIENT');
  assert.deepEqual(j.by_model, { 'jev-1': 2, 'jev-2': 1 });
  assert.equal(j.pass2.unknown, 3);
});

test('request types by purpose', () => {
  assert.equal(requestType('context-route:abc'), 'router'); assert.equal(requestType('decision:gate'), 'decide');
  assert.equal(requestType('jev-finish-diff:L1'), 'DIFF'); assert.equal(requestType('jev-finish-final:L1'), 'FINAL');
  assert.equal(requestType('recheck-x'), 'RECHECK'); assert.equal(requestType('audit-potential'), 'audit'); assert.equal(requestType('smoke-test'), 'test'); assert.equal(requestType('misc'), 'other');
});

test('probabilities: pmax/top2/margin/ratio, Noul |2p−1|', () => {
  const d = distMetrics({ A: 0.6, B: 0.3, C: 0.1 });
  assert.equal(d.winner, 'A'); assert.equal(d.pmax, 0.6); assert.equal(d.top2, 0.3); assert.equal(d.margin, 0.3); assert.equal(d.ratio, 2); assert.equal(d.runner_up, 'B');
  assert.equal(distMetrics(null), null); assert.equal(noulConf(0.9), 0.8); assert.equal(noulConf(0.5), 0);
});

test('filters: today/7d/30d/all/session/purpose/model/type', () => {
  const { P } = fixture(); const src = loadAll(P);
  const q = (f) => jevUsage(src.routing, makeFilter(f, NOW)).requests;
  assert.equal(q({ range: 'all' }), 3); assert.equal(q({ range: '30d' }), 3); assert.equal(q({ range: '7d' }), 2); assert.equal(q({ range: 'today' }), 2);
  assert.equal(q({ session: 'sessB' }), 1); assert.equal(q({ purpose: 'context-route' }), 1); assert.equal(q({ model: 'jev-2' }), 1); assert.equal(q({ type: 'decide' }), 1);
  assert.equal(q({ until: '2026-10-01T00:00:00Z' }), 1);
});

test('decision quality: confidence, low margin, near tie, lifecycle without labels ⇒ no accuracy', () => {
  const { P } = fixture(); const S = summarize(loadAll(P), { range: 'all' }, { now: NOW });
  const q = S.decisions_quality;
  assert.ok(q.answers >= 4); assert.ok(q.below_conf_0_5 >= 1); assert.ok(q.near_tie_le_0_05 >= 1);
  assert.equal(q.lifecycle.LABELED, 0); assert.equal(q.lifecycle.accuracy_by_confidence_bucket, 'NO_LABELS_YET'); assert.equal(q.lifecycle.calibration_coverage_pct, 0);
  const L = lifecycleStates([{ request_id: 'a' }, { request_id: 'b' }, { request_id: 'c' }], [{ request_id: 'a', label: 'correct' }, { request_id: 'b', outcome: 'up' }]);
  assert.deepEqual([L.LABELED, L.OUTCOME_CAPTURED, L.LABEL_PENDING, L.OUTCOME_UNKNOWN], [1, 1, 1, 1]); assert.equal(L.accuracy_by_confidence_bucket, 'COMPUTE_FROM_LABELS');
});

test('Claude transcript: usage dedup by message.id, tool classes, >20k results, repeated reads, hooks; agents/workflows = 0 explicit', () => {
  const { P } = fixture(); const S = summarize(loadAll(P), { range: 'all' }, { now: NOW });
  const c = S.claude;
  assert.equal(c.assistant_entries, 2); assert.equal(c.responses_dedup, 1);
  assert.equal(c.usage_dedup_by_message.cache_read, 1000); assert.equal(c.usage_legacy_per_entry.cache_read, 2000);
  assert.equal(c.results_over_20k, 1);
  assert.equal(c.agents.spawned, 0); assert.ok(c.workflows !== undefined);
  const s = parseTranscript(fs.readdirSync(path.join(P.projects, 'proj')).map((f) => path.join(P.projects, 'proj', f))[0], makeFilter({}));
  assert.equal(s.bad_lines, 1); assert.equal(s.reads['foo.md'], 2); assert.ok(s.tools['Bash:read']);
});

test('hooks: probe + stop_hook_summary percentiles, timeouts, blockers', () => {
  const { P } = fixture(); const src = loadAll(P); const F = makeFilter({});
  const h = hookAgg(src.probe, src.transcripts.map((f) => parseTranscript(f, F)), F);
  assert.equal(h.probe_records, 2); assert.equal(h.transcript_stop_records, 2);
  const fin = h.table.find((r) => r.hook === 'jev-finish' && r.source === 'probe');
  assert.equal(fin.timeouts, 1); assert.equal(fin.blockers, 1); assert.equal(fin.injected_chars, 40);
  assert.ok(h.transcript_hook_injections.hook_additional_context > 0);
});

test('rotation/sessions from lineage + events + briefs', () => {
  const { P } = fixture(); const src = loadAll(P);
  const r = rotationAgg(src.lineage, src.rotEvents, src.legacy, src.briefs, makeFilter({}));
  assert.equal(r.rotations, 2); assert.equal(r.minutes_between_rotations.min, 10); assert.equal(r.levels_hook_calls.HARD_ROTATION, 1);
  assert.equal(r.sessions[0].max_tokens, 240100); assert.equal(r.briefs.count, 1);
});

test('missing sources ⇒ summary still builds, every source flagged', () => {
  const { P } = fixture({ empty: true }); const S = summarize(loadAll(P), {}, { now: NOW });
  assert.equal(S.sources.routing.exists, false); assert.equal(S.sources.transcripts.exists, false);
  assert.equal(S.jev.requests, 0); assert.equal(S.claude.agents.spawned, 0); assert.ok(Array.isArray(S.anomalies));
});

test('Claude context tokens and JEV provider tokens stay in separate namespaces', () => {
  const { P } = fixture(); const S = summarize(loadAll(P), {}, { now: NOW });
  assert.equal(S.jev.input_tokens, 4500); assert.equal(S.claude.usage_dedup_by_message.input, 10);
  assert.equal(JSON.stringify(S.claude).includes('spend_usd'), false);
});

test('redactor: secret keys/values and prompt content removed', () => {
  const r = redact({ api_key: 'x', note: `use ${FAKE_KEY} now`, state: 'PRIVATE', n: { Authorization: 'Bearer abcdefghijkl' }, tokens: 5 });
  assert.equal(r.api_key, '[REDACTED]'); assert.equal(r.note.includes(FAKE_KEY), false); assert.equal(r.state, '[OMITTED]'); assert.equal(r.n.Authorization, '[REDACTED]'); assert.equal(r.tokens, 5);
});

test('server: binds 127.0.0.1 only, GET only, Host check, health/summary/sources, no secrets in responses', async () => {
  const { P } = fixture(); const srv = createServer(P);
  await new Promise((res) => srv.listen(0, HOST, res));
  try {
    const a = srv.address(); assert.equal(a.address, '127.0.0.1');
    const base = `http://127.0.0.1:${a.port}`;
    const h = await (await fetch(`${base}/api/health`)).json(); assert.equal(h.ok, true); assert.equal(h.mode, 'OBSERVATIONAL_ONLY');
    const sres = await fetch(`${base}/api/summary?range=all`); assert.equal(sres.status, 200); const body = await sres.text();
    assert.equal(body.includes(FAKE_KEY), false); assert.equal(body.includes('PRIVATE PROMPT TEXT'), false);
    const S = JSON.parse(body); assert.equal(S.jev.requests, 3); assert.ok(S.parse_cache);
    assert.equal((await fetch(`${base}/api/summary?range=bogus`)).status, 400);
    assert.equal((await fetch(`${base}/api/sources`)).status, 200);
    assert.equal((await fetch(`${base}/api/health`, { method: 'POST' })).status, 405);
    const html = await fetch(`${base}/`); assert.equal(html.status, 200); assert.match(await html.text(), /OBSERVATIONAL ONLY/);
    assert.equal((await fetch(`${base}/..%2fserver.mjs`)).status, 404);
    const forbidden = await new Promise((res) => { const http = import('node:http'); http.then((m) => m.get({ host: '127.0.0.1', port: a.port, path: '/api/health', headers: { Host: 'evil.example' } }, (r) => { r.resume(); res(r.statusCode); })); });
    assert.equal(forbidden, 403);
    assert.ok(fs.existsSync(path.join(P.derived, 'summary.json')));
  } finally { srv.close(); }
});

test('cache: transcript parse memoized by (path,size,mtime,window)', () => {
  const { P } = fixture(); const f = loadAll(P).transcripts[0]; const F = makeFilter({});
  const h0 = cacheStats.hits; const a = cachedParse(f, F); const b = cachedParse(f, F);
  assert.equal(a, b); assert.equal(cacheStats.hits, h0 + 1);
});

test('shadow ledger: imports jev-finish DIFF/FINAL answers idempotently with derived metrics', () => {
  const { P } = fixture();
  const r1 = importShadow(P); const r2 = importShadow(P);
  assert.equal(r1.added, 1); assert.equal(r2.added, 0);
  const row = readNdjson(P.shadowLedger).rows[0];
  assert.equal(row.request_id, 'req_2'); assert.equal(row.pmax, 0.9); assert.equal(row.margin, 0.84); assert.equal(row.mode, 'SHADOW_OBSERVATIONAL');
});

test('probe is wired into both hooks only via guarded dynamic import', () => {
  const L = "try { await import('../jev-obs/hook-probe.mjs'); } catch { /* observability only — never affects the hook */ }";
  for (const h of ['jev-rotation', 'jev-finish']) {
    const src = fs.readFileSync(path.join(ROOT, 'tools', h, 'hook.mjs'), 'utf8');
    assert.equal(src.split(L).length, 2, `${h}: exactly one guarded probe import`);
  }
});

test('probe silent in hook test mode unless JEV_OBS_DIR set; JEV_OBS_PROBE=0 disables', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-obs-probe-'));
  const run = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e', `process.argv[1]='x/jev-finish/hook.mjs'; await import(${JSON.stringify(new URL('../../tools/jev-obs/hook-probe.mjs', import.meta.url).href)}); process.stdout.write('{"systemMessage":"hi"}');`],
    { env: { ...process.env, CLAUDE_CONFIG_DIR: t, JEV_OBS_DIR: '', JEV_OBS_PROBE: '', ...extra }, encoding: 'utf8' });
  const f = path.join(t, 'jev-obs', 'hook-metrics.ndjson');
  let r = run({ JEV_FINISH_TEST: '1' }); assert.equal(r.stdout, '{"systemMessage":"hi"}'); assert.equal(fs.existsSync(f), false);
  r = run({ JEV_OBS_PROBE: '0' }); assert.equal(fs.existsSync(f), false);
  r = run({}); assert.equal(r.status, 0); assert.equal(r.stdout, '{"systemMessage":"hi"}');
  const rec = JSON.parse(fs.readFileSync(f, 'utf8').trim()); assert.equal(rec.hook, 'jev-finish'); assert.equal(rec.injected_chars, 2); assert.equal(rec.stdout_chars, 22);
  assert.equal(Object.keys(rec).some((k) => /prompt|stdin|content/i.test(k)), false);
});

test('probe is decision-neutral on real hooks (stdout + exit identical with/without probe)', () => {
  const R = bench(2, SCENARIOS);
  assert.equal(R.decision_neutral, true, JSON.stringify(R.rows.map((r) => r.sample)));
  assert.equal(R.probe_recorded_every_run, true);
});
