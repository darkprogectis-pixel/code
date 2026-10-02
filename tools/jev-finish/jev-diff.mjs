#!/usr/bin/env node
// /jev-finish V1 — one JEV query over a proposal (kind diff) or over the final result (kind final), recorded in the loop.
//   node tools/jev-finish/jev-diff.mjs --kind diff|final --proposal <file> [--purpose <p>] [--session <id>]
// Uses the canonical client ~/.claude/alfaomega-context/scripts/lib.js (sanitize + jevAsk, TYPESAFE_API_KEY).
// diff != A => loop BLOCKED (JEV_REJECTED) and real edits stay denied. Exit: 0 A · 1 not A · 2 usage · 3 refused/error.
// Test-only: JEV_FINISH_TEST=1 + JEV_FINISH_JEV_MOCK=<json {choice,confidence,probabilities,request_id}> skips the network.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { env, TEST, sha16, nowIso, tryClaim, isRotated, summary } from './lib.mjs';
import { recordJev } from './finish.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const out = (status, code, extra = {}) => { console.log(JSON.stringify({ jev_finish: status, ...extra }, null, 2)); process.exit(code); };
const kind = arg('--kind'), proposal = arg('--proposal');
if (!['diff', 'final'].includes(kind) || !proposal) out('USAGE', 2, { reason: '--kind diff|final --proposal <file>' });
const sid = arg('--session') || env.CLAUDE_CODE_SESSION_ID;
if (!sid) out('REFUSED', 3, { reason: 'no session id' });
const loop = tryClaim(sid);
if (!loop || loop.owner_session !== sid || isRotated(sid)) out('REFUSED', 3, { reason: 'no active /jev-finish loop owned by this session' });
let text;
try { text = fs.readFileSync(path.resolve(proposal), 'utf8'); } catch (e) { out('REFUSED', 3, { reason: `proposal unreadable: ${e.message}` }); }
if (text.trim().length < 200) out('REFUSED', 3, { reason: 'proposal too short to be a complete diff/result (< 200 chars)' });

const CRIT = kind === 'diff'
  ? { A: 'SAFE_TO_APPLY', B: 'WRONG_OR_UNPROVEN_ROOT_CAUSE', C: 'ARCHITECTURE_OR_RULE_CHANGE_NOT_AUTHORIZED', D: 'REGRESSION_RISK', E: 'SCOPE_OR_LIVE_SAFETY_VIOLATION', F: 'INCOMPLETE_PROPOSAL', G: 'TEST_COVERAGE_INCOMPLETE', H: 'OTHER' }
  : { A: 'COMPLETE_AND_VERIFIED', B: 'OBJECTIVE_NOT_MET', C: 'TESTS_INSUFFICIENT_OR_FAILING', D: 'REGRESSION_DETECTED', E: 'SCOPE_OR_LIVE_SAFETY_VIOLATION', F: 'HANDOFF_INCOMPLETE', G: 'EVIDENCE_INSUFFICIENT', H: 'OTHER' };
const instructions = kind === 'diff'
  ? 'A proposta de diff abaixo é segura para aplicar no escopo autorizado (causa provada, mudança mínima, sem violar regras canônicas do projeto, sem tocar sistemas live/produção, com testes suficientes)?'
  : 'O resultado abaixo cumpre o objetivo declarado, com testes/build PASS, sem regressão, dentro do escopo autorizado e com handoff atualizado?';
const ctx = `CONTEXT: autonomous engineering loop (/jev-finish) for a governed project. Objective: ${loop.objective}\nStage: ${loop.stage}. Below is the ${kind === 'diff' ? 'complete proposed diff (not applied)' : 'final result with evidence'}.\n\n`;

let r;
try {
  if (TEST && env.JEV_FINISH_JEV_MOCK) {
    const m = JSON.parse(fs.readFileSync(env.JEV_FINISH_JEV_MOCK, 'utf8'));
    r = { choice: m.choice, confidence: m.confidence, probabilities: m.probabilities || null, request_id: m.request_id || 'mock', model: 'mock' };
  } else {
    const require = createRequire(import.meta.url);
    const lib = require(path.join(os.homedir(), '.claude', 'alfaomega-context', 'scripts', 'lib.js'));
    const res = await lib.jevAsk({ state: lib.sanitize(ctx + text), questions: { jev: { type: 'choice', instructions, criteria: CRIT } }, purpose: arg('--purpose') || `jev-finish-${kind}-${loop.loop_id}` });
    const a = res.answers.jev;
    r = { choice: a.choice, confidence: a.confidence, probabilities: a.probabilities, request_id: res.meta.request_id, model: res.meta.model };
  }
} catch (e) {
  out('JEV_UNAVAILABLE', 3, { reason: String(e.message || e), next: 'JEV_REQUIRED_BUT_UNAVAILABLE: retry later; if persistent, block --cause EXTERNAL_DEPENDENCY' });
}
const rec = { result: r.choice, label: CRIT[r.choice] || null, confidence: r.confidence, probabilities: r.probabilities, request_id: r.request_id, model: r.model,
  proposal_path: path.resolve(proposal), proposal_sha: sha16(text), at: nowIso() };
const l = recordJev(loop.loop_id, kind, rec);
out(r.choice === 'A' ? 'JEV_A' : `JEV_${r.choice}`, r.choice === 'A' ? 0 : 1, { jev: rec, loop: summary(l) });
