// Alpha realtime SHADOW pipeline: API → immutable snapshot → specialist → alpha-specialist/v1 → Fusion → JEV → alpha-fusion/v1 → history.
// Read-only (GET loopback allowlist). Writes only under stateDir (var/alpha). Never sends orders.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getJson } from './http.mjs';
import { writeSnapshot } from './snapshots.mjs';
import { errorEnvelope, validateSpecialist, validateFusion } from './contracts.mjs';
import { fuse } from './fusion.mjs';
import { reviewFusion } from './jev-fusion.mjs';
import { recordCycle, recordJev, summarizeMetrics } from './stats.mjs';
import * as quant from './specialists/quant.mjs';
import * as gamma from './specialists/gamma.mjs';
import * as bot from './specialists/bot.mjs';
import * as q from './specialists/q.mjs';
import * as data from './specialists/data.mjs';

export const SPECIALISTS = [quant, gamma, bot, q, data];

export function writeAtomic(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, typeof obj === 'string' ? obj : JSON.stringify(obj));
  fs.renameSync(tmp, f);
}

// One specialist: fetch its own endpoints in parallel (each with timeout), snapshot, evaluate. Never throws.
export async function runSpecialist(mod, { cfg, cycle_id, now, dir, fetchImpl }) {
  const eps = mod.endpoints(cfg);
  const t0 = performance.now();
  const results = await Promise.allSettled(Object.entries(eps).map(async ([key, url]) => {
    const r = await getJson(url, { allow: cfg.allow, timeoutMs: cfg.specialist_timeout_ms, fetchImpl });
    const snap = dir ? writeSnapshot(dir, { source: mod.source, key, url, text: r.text, fetchedAt: new Date(now).toISOString() }) : { id: null, sha: null };
    return { key, url, json: r.json, ms: r.ms, snap };
  }));
  const fetch_ms = Math.round(performance.now() - t0);
  const payloads = {}, refs = [], errors = [];
  Object.keys(eps).forEach((key, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') { payloads[key] = r.value.json; refs.push({ key, url: r.value.url, snapshot_id: r.value.snap.id, sha: r.value.snap.sha, ms: Math.round(r.value.ms) }); }
    else { errors.push({ key, kind: r.reason?.kind || 'ERROR', message: r.reason?.message || String(r.reason) }); refs.push({ key, url: eps[key], snapshot_id: null, error: r.reason?.kind || 'ERROR' }); }
  });
  const metrics = { fetch_ms, endpoint_errors: errors.length };
  const base = { source: mod.source, cycle_id, now, role: mod.role, rules_version: cfg.rules_version, raw_refs: refs, metrics, depends_on: mod.depends_on, independence_group: mod.independence_group };
  const missingReq = mod.required.filter((k) => !payloads[k]);
  if (missingReq.length) {
    const e = errors.find((x) => missingReq.includes(x.key)) || { kind: 'ERROR', message: 'required endpoint missing' };
    return errorEnvelope({ ...base, error: e });
  }
  const t1 = performance.now();
  try {
    const env = mod.evaluate({ payloads, refs, now, cycle_id, cfg, metrics });
    for (const e of errors) env.warnings.push(`${e.kind}: ${e.key} ${e.message}`.slice(0, 200));
    if (errors.length && env.health === 'OK') env.health = 'PARTIAL';
    env.metrics.eval_ms = Math.round((performance.now() - t1) * 100) / 100;
    return env;
  } catch (e) {
    return errorEnvelope({ ...base, error: { kind: 'EVAL', message: e.message } });
  }
}

export function newCycleId(now) { return `ac-${new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`; }

// Full cycle. ctx: {cfg, dir, metrics, jevState, ask?, fetchImpl?, now?}. Returns {envs, fusion, stages}.
export async function runCycle(ctx) {
  const now = ctx.now ?? Date.now();
  const cycle_id = newCycleId(now);
  const t0 = performance.now();
  const envs = await Promise.all(SPECIALISTS.map((m) => runSpecialist(m, { cfg: ctx.cfg, cycle_id, now, dir: ctx.dir, fetchImpl: ctx.fetchImpl })));
  const tSpec = performance.now();
  for (const e of envs) { const errs = validateSpecialist(e); if (errs.length) e.warnings.push(`CONTRACT: ${errs.join(',')}`); }
  const fusion = fuse(envs, { cfg: ctx.cfg, cycle_id, now });
  const tFus = performance.now();
  fusion.jev = await reviewFusion(envs, fusion, { cfg: ctx.cfg, now, st: ctx.jevState, ask: ctx.ask });
  if (fusion.jev.status === 'OK' && fusion.jev.agrees_with_signal === false) fusion.contradictions.push({ kind: 'JEV_DISAGREES', detail: `JEV Q10=${fusion.jev.questions?.Q10?.winner} × signal ${fusion.signal}`, material: false });
  const tJev = performance.now();
  const ferrs = validateFusion(fusion);
  if (ferrs.length) fusion.contract_errors = ferrs;
  const stages = { specialists: Math.round(tSpec - t0), fusion: Math.round((tFus - tSpec) * 100) / 100, jev: Math.round(tJev - tFus), ...Object.fromEntries(envs.map((e) => [`fetch_${e.source}`, e.metrics.fetch_ms])) };
  fusion.stages_ms = stages;
  if (ctx.dir) {
    const tP = performance.now();
    const rec = { cycle_id, at: fusion.timestamp, envelopes: envs, fusion };
    writeAtomic(path.join(ctx.dir, 'latest.json'), rec);
    fs.appendFileSync(path.join(ctx.dir, `history-${fusion.timestamp.slice(0, 10)}.ndjson`), JSON.stringify({ cycle_id, at: fusion.timestamp, signal: fusion.signal, confidence: fusion.confidence, agreement: fusion.agreement, score: fusion.score,
      sources: Object.fromEntries(envs.map((e) => [e.source, { d: e.direction, c: e.confidence, s: e.strength, f: e.fresh, h: e.health, snap: e.snapshot_id }])), jev: { status: fusion.jev.status, request_id: fusion.jev.request_id ?? null, q10: fusion.jev.questions?.Q10?.winner ?? null, q10_margin: fusion.jev.questions?.Q10?.margin ?? null }, stages_ms: stages }) + '\n');
    stages.persist = Math.round(performance.now() - tP);
  }
  stages.total = Math.round(performance.now() - t0);
  if (ctx.metrics) {
    recordCycle(ctx.metrics, envs, fusion, stages); recordJev(ctx.metrics, fusion.jev);
    if (ctx.dir) { writeAtomic(path.join(ctx.dir, 'metrics.json'), summarizeMetrics(ctx.metrics)); writeAtomic(path.join(ctx.dir, 'jev-state.json'), ctx.jevState); }
  }
  return { envs, fusion, stages };
}
