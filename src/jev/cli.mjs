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
  const a = { input: null, previous: null, config: path.join(REPO_ROOT, 'config', 'jev-runtime-v1.json'), out: null, outputOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--input') a.input = argv[++i];
    else if (k === '--previous') a.previous = argv[++i];
    else if (k === '--config') a.config = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--output-only') a.outputOnly = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else { a.bad = k; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args.bad || !args.input) {
  process.stderr.write((args.bad ? `argumento desconhecido: ${args.bad}\n` : '') + 'uso: node src/jev/cli.mjs --input <jev-input.json> [--previous <json>] [--config <json>] [--out <arquivo>] [--output-only]\n');
  process.exit(args.help ? 0 : 64);
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
