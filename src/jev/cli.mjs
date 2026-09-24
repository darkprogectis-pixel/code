#!/usr/bin/env node
// JEV Runtime V1 — CLI.
//   node src/jev/cli.mjs --input fixtures/jev/C_valid_multi_source.json [--previous prev.json] [--config config/jev-runtime-v1.json] [--out result.json] [--output-only]
// Exit 0 = output produzido (inclusive UNKNOWN, que e estado operacional seguro). Exit 2 = FATAL (config/artefato/invariante). Exit 64 = uso.
// Nunca envia ordem, nunca executa trade, nunca toca NT8/producao.
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntime } from './engine.mjs';
import { JevFatalError } from './artifacts.mjs';
import { REPO_ROOT } from './config.mjs';

function parseArgs(argv) {
  const a = { input: null, previous: null, config: path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'), out: null, outputOnly: false,
    live: false, liveConfig: path.join(REPO_ROOT, 'config', 'jev-live-input-v1.json'), cycles: Infinity, intervalMs: null, print: false, reportOut: null,
    serve: false, bridgeConfig: path.join(REPO_ROOT, 'config', 'jev-bridge-v1.json'), replay: null, port: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--live') a.live = true;
    else if (k === '--serve') a.serve = true;
    else if (k === '--bridge-config') a.bridgeConfig = argv[++i];
    else if (k === '--replay') a.replay = argv[++i];
    else if (k === '--port') a.port = Number(argv[++i]);
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
  + '  node src/jev/cli.mjs --serve [--replay <jev-input.json>] [--bridge-config config/jev-bridge-v1.json] [--port N] [--live-config ...] [--interval-ms MS] [--cycles N]\n'
  + '  (--live = SOMENTE LEITURA do relay; --serve = live/replay + JEV Bridge local read-only + Control Center em http://127.0.0.1:<porta>/; Ctrl+C para parar; nenhuma ordem e enviada)\n';
const args = parseArgs(process.argv.slice(2));
const modes = [args.input && 'input', args.live && 'live', args.serve && 'serve'].filter(Boolean);
if (args.help || args.bad || modes.length !== 1) {
  process.stderr.write((args.bad ? `argumento desconhecido: ${args.bad}\n` : '') + USAGE);
  process.exit(args.help ? 0 : 64);
}
if (args.serve) {
  const { loadLiveConfig, createLiveRelayAdapter } = await import('./adapters/live-relay-adapter.mjs');
  const { runLive } = await import('./adapters/live-loop.mjs');
  const { createBridge } = await import('./bridge/server.mjs');
  const { readInputFile } = await import('./ingest.mjs');
  try {
    let bcfg;
    try { bcfg = JSON.parse(readFileSync(args.bridgeConfig, 'utf8')); } catch (e) { throw new JevFatalError(`bridge config ilegivel: ${args.bridgeConfig}`); }
    if (bcfg.schema !== 'jev-bridge-config/v1') throw new JevFatalError('bridge config schema desconhecido');
    const lc = args.replay ? null : loadLiveConfig(args.liveConfig);
    const rt = createRuntime(lc ? lc.runtime_config_abs : args.config, lc ? lc.runtime_config_overrides || null : null);
    // replay: re-le o mesmo jev-input/v1 a cada ciclo (demo/teste sem relay); live: adapter read-only
    const adapter = args.replay
      ? { buildInput: async () => { const r = readInputFile(args.replay); return { input: r.input, report: { mode: 'REPLAY', replay: path.basename(args.replay), issues: r.issues } }; } }
      : createLiveRelayAdapter(lc, { featureContract: rt.art.feature_contract });
    const bridge = createBridge({ host: bcfg.host, port: args.port ?? bcfg.port, mode: args.replay ? 'REPLAY' : 'LIVE' });
    const addr = await bridge.listen();
    const ac = new AbortController();
    process.on('SIGINT', () => { process.stderr.write('\n[jev] Ctrl+C: parando\n'); ac.abort(); });
    process.stderr.write(`[jev] BRIDGE read-only em http://${addr.address}:${addr.port}/ (Control Center) · modo ${args.replay ? 'REPLAY' : 'LIVE'} · ordens: DESABILITADAS · robo: OFF (travado)\n`);
    const interval = Math.max(args.replay ? 1000 : 5000, args.intervalMs || (lc ? lc.poll_interval_ms : 3000));
    const n = await runLive({ adapter, runtime: rt, intervalMs: interval, cycles: args.cycles, signal: ac.signal,
      onCycle: ({ cycle, result, report }) => {
        bridge.update({ result, report, error: result ? null : report && report.error });
        if (result) process.stderr.write(`[jev] ciclo ${cycle} · ${result.output.jev_directional_context} · dq=${result.output.data_quality.status} · orders=0\n`);
      } });
    if (args.cycles !== Infinity && !ac.signal.aborted) {
      // execucao limitada (smoke): mantem a bridge no ar ate Ctrl+C ou por --interval-ms apos o ultimo ciclo
      await new Promise((resolve) => { const t = setTimeout(resolve, interval); ac.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });
    }
    await bridge.close();
    process.stderr.write(`[jev] bridge encerrada apos ${n} ciclo(s)\n`);
    process.exit(0);
  } catch (e) {
    if (e instanceof JevFatalError) { process.stderr.write(`[jev] FATAL: ${e.message}\n`); process.exit(2); }
    if (e && e.code === 'EADDRINUSE') { process.stderr.write(`[jev] FATAL: porta da bridge em uso\n`); process.exit(2); }
    throw e;
  }
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
