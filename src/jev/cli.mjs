#!/usr/bin/env node
// JEV Runtime V1 — CLI.
//   node src/jev/cli.mjs --input fixtures/jev/C_valid_multi_source.json [--previous prev.json] [--config config/jev-runtime-v1.json] [--out result.json] [--output-only]
// Exit 0 = output produzido (inclusive UNKNOWN, que e estado operacional seguro). Exit 2 = FATAL (config/artefato/invariante). Exit 64 = uso.
// Nunca envia ordem, nunca executa trade, nunca toca NT8/producao.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntime } from './engine.mjs';
import { JevFatalError } from './artifacts.mjs';
import { REPO_ROOT } from './config.mjs';

function parseArgs(argv) {
  const a = { input: null, previous: null, config: path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'), out: null, outputOnly: false,
    live: false, liveConfig: path.join(REPO_ROOT, 'config', 'jev-live-input-v1.json'), cycles: Infinity, intervalMs: null, print: false, reportOut: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--live') a.live = true;
    else if (k === '--live-config') a.liveConfig = argv[++i];
    else if (k === '--cycles') a.cycles = Number(argv[++i]);
    else if (k === '--interval-ms') a.intervalMs = Number(argv[++i]);
    else if (k === '--print') a.print = true;
    else if (k === '--report-out') a.reportOut = argv[++i];
    else if (k === '--input') a.input = argv[++i];
    else if (k === '--previous') a.previous = argv[++i];
    else if (k === '--config') a.config = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--output-only') a.outputOnly = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else { a.bad = k; }
  }
  return a;
}

const USAGE = 'uso:\n  node src/jev/cli.mjs --input <jev-input.json> [--previous <json>] [--config <json>] [--out <arquivo>] [--output-only]\n'
  + '  node src/jev/cli.mjs --live [--live-config config/jev-live-input-v1.json] [--cycles N] [--interval-ms MS] [--out ultimo-resultado.json] [--report-out relatorio.json] [--output-only] [--print]\n'
  + '  (--live = SOMENTE LEITURA do relay; Ctrl+C para parar; nenhuma ordem e enviada)\n';
const args = parseArgs(process.argv.slice(2));
if (args.help || args.bad || (!args.input && !args.live) || (args.live && args.input)) {
  process.stderr.write((args.bad ? `argumento desconhecido: ${args.bad}\n` : '') + USAGE);
  process.exit(args.help ? 0 : 64);
}
if (args.live) {
  const { loadLiveConfig, createLiveRelayAdapter } = await import('./adapters/live-relay-adapter.mjs');
  const { runLive } = await import('./adapters/live-loop.mjs');
  try {
    const lc = loadLiveConfig(args.liveConfig);
    if (!lc.enabled) { process.stderr.write('[jev] live desabilitado na config (enabled=false)\n'); process.exit(0); }
    const rt = createRuntime(args.config === path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json') ? lc.runtime_config_abs : args.config, lc.runtime_config_overrides || null);
    const adapter = createLiveRelayAdapter(lc, { featureContract: rt.art.feature_contract });
    const ac = new AbortController();
    process.on('SIGINT', () => { process.stderr.write('\n[jev] Ctrl+C: parando apos o ciclo atual\n'); ac.abort(); });
    process.stderr.write(`[jev] LIVE read-only · relay ${lc.relay.host}:${lc.relay.port}${lc.relay.base_path} · intervalo ${args.intervalMs || lc.poll_interval_ms} ms · ordens: DESABILITADAS\n`);
    const n = await runLive({ adapter, runtime: rt, intervalMs: Math.max(5000, args.intervalMs || lc.poll_interval_ms), cycles: args.cycles, signal: ac.signal,
      onCycle: ({ cycle, result, report }) => {
        if (!result) { process.stderr.write(`[jev] ciclo ${cycle}: erro de ciclo (continua): ${report.error}\n`); return; }
        const o = result.output;
        if (args.out) writeFileSync(args.out, JSON.stringify(args.outputOnly ? o : { ...result, adapter_report: report }, null, 2) + '\n');
        if (args.reportOut) writeFileSync(args.reportOut, JSON.stringify(report, null, 2) + '\n');
        if (args.print) process.stdout.write(JSON.stringify(args.outputOnly ? o : { ...result, adapter_report: report }) + '\n');
        const bad = report.routes.filter((r) => r.result !== 'OK').length;
        process.stderr.write(`[jev] ciclo ${cycle} · ${o.jev_directional_context} · dq=${o.data_quality.status} · sessao=${report.session} · rotas ok=${report.routes.length - bad}/${report.routes.length} · campos=${result.audit.inputs.received_count}/190 · orders=0\n`);
      } });
    process.stderr.write(`[jev] live encerrado apos ${n} ciclo(s)\n`);
    process.exit(0);
  } catch (e) {
    if (e instanceof JevFatalError) { process.stderr.write(`[jev] FATAL: ${e.message}\n`); process.exit(2); }
    throw e;
  }
}
try {
  const rt = createRuntime(args.config);
  const res = rt.runFile(args.input, { previousPath: args.previous });
  for (const i of res.output.data_quality.input_issues) process.stderr.write(`[jev] aviso de input: ${i.code} ${i.detail || ''}\n`);
  const body = JSON.stringify(args.outputOnly ? res.output : res, null, 2) + '\n';
  if (args.out) writeFileSync(args.out, body); else process.stdout.write(body);
  process.stderr.write(`[jev] ${res.output.jev_directional_context} · dq=${res.output.data_quality.status} · reasons=${res.output.reason_codes.slice(0, 3).join(',')}… · orders=0\n`);
  process.exit(0);
} catch (e) {
  if (e instanceof JevFatalError) { process.stderr.write(`[jev] FATAL: ${e.message}\n`); process.exit(2); }
  throw e;
}
