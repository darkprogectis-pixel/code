#!/usr/bin/env node
// Alpha SHADOW service: runs the realtime pipeline every cfg.cycle_ms. Read-only (GET loopback allowlist), no HTTP server,
// writes only under var/alpha. Never sends orders.   node src/alpha/service.mjs [--once] [--no-jev]   stop: Ctrl+C / SIGTERM
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, stateDir } from './config.mjs';
import { runCycle, writeAtomic } from './pipeline.mjs';
import { pruneSnapshots } from './snapshots.mjs';
import { newMetrics } from './stats.mjs';
import { createOutcomes, readPrice } from './outcomes.mjs';

export function createService({ cfg = loadConfig(), dir = stateDir(), ask, fetchImpl, log = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  let jevState = {};
  try { jevState = JSON.parse(fs.readFileSync(path.join(dir, 'jev-state.json'), 'utf8')); } catch { jevState = {}; }
  const metrics = newMetrics();
  const outcomes = createOutcomes({ cfg, dir });
  let lastPrune = 0, timer = null, running = false, stopped = false;
  async function cycle() {
    if (running) return null; // never overlap cycles
    running = true;
    try {
      const now = Date.now();
      const r = await runCycle({ cfg, dir, metrics, jevState, ask, fetchImpl, now });
      const price = await readPrice(cfg, { fetchImpl });
      r.outcomes = outcomes.step(r.fusion, price, Date.now());
      if (now - lastPrune > 3600000) { pruneSnapshots(dir, cfg.snapshots.retention_days, now); lastPrune = now; }
      writeAtomic(path.join(dir, 'service.json'), { pid: process.pid, mode: 'SHADOW_READ_ONLY', orders: 'NEVER', cycle_ms: cfg.cycle_ms, last_cycle_id: r.fusion.cycle_id, last_at: r.fusion.timestamp, last_signal: r.fusion.signal, cycles: metrics.cycles, outcomes: r.outcomes, heartbeat: new Date().toISOString() });
      log(`${r.fusion.cycle_id} ${r.fusion.signal} conf=${r.fusion.confidence} jev=${r.fusion.jev.status} total=${r.stages.total}ms`);
      return r;
    } catch (e) { log(`cycle error: ${e.message}`); return null; } finally { running = false; }
  }
  return {
    cycle, metrics,
    start() { const loop = async () => { if (stopped) return; await cycle(); if (!stopped) timer = setTimeout(loop, cfg.cycle_ms); }; loop(); },
    stop() { stopped = true; if (timer) clearTimeout(timer); },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  if (process.argv.includes('--no-jev')) cfg.jev.enabled = false;
  const svc = createService({ cfg, log: (m) => console.log(`[alpha ${new Date().toISOString()}] ${m}`) });
  if (process.argv.includes('--once')) { const r = await svc.cycle(); process.exit(r ? 0 : 1); }
  console.log(`[alpha] SHADOW / READ-ONLY service started pid=${process.pid} cycle=${cfg.cycle_ms}ms state=${stateDir()} — zero orders`);
  svc.start();
  const bye = () => { svc.stop(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
