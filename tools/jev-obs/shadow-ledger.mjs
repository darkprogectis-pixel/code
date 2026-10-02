#!/usr/bin/env node
// Q2/Q3 SHADOW ledger (observational): imports every JEV DIFF/FINAL answer already recorded by jev-finish loops into
// <obsDir>/jev-shadow-ledger.ndjson with derived pmax/top2/margin/ratio. Idempotent by request_id. Changes no decision.
//   node tools/jev-obs/shadow-ledger.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, readNdjson } from './sources.mjs';
import { loadLoopJev, distMetrics } from './aggregate.mjs';

export function importShadow(P = paths()) {
  const have = new Set(readNdjson(P.shadowLedger).rows.map((r) => r.request_id));
  const add = [];
  for (const r of loadLoopJev(P.loops)) {
    if (!r.request_id || have.has(r.request_id)) continue;
    have.add(r.request_id);
    const d = distMetrics(r.probabilities) || {};
    add.push({ at: r.at || null, imported_at: new Date().toISOString(), source: 'jev-finish', loop_id: r.loop_id, kind: r.kind, purpose: `jev-finish-${r.kind}:${r.loop_id}`,
      spec_path: r.proposal_path || null, spec_sha: r.proposal_sha || null, request_id: r.request_id, model: r.model || null, result: r.result, label: r.label || null,
      confidence: r.confidence ?? null, probabilities: r.probabilities, pmax: d.pmax ?? null, top2: d.top2 ?? null, runner_up: d.runner_up ?? null, margin: d.margin ?? null, ratio: d.ratio ?? null,
      mode: 'SHADOW_OBSERVATIONAL' });
  }
  if (add.length) { fs.mkdirSync(path.dirname(P.shadowLedger), { recursive: true }); fs.appendFileSync(P.shadowLedger, add.map((r) => JSON.stringify(r)).join('\n') + '\n'); }
  return { added: add.length, total: have.size, file: P.shadowLedger };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(importShadow(), null, 2));
