#!/usr/bin/env node
// InvictusJevCode.AgentGateway — processo SEPARADO e OPCIONAL.  node src/ijc/agent-gateway/cli.mjs [--config config/ijc-agent-gateway-v1.json]
// Se este processo nao existir ou cair, o INVICTUS JEV CODE (motor, bridge, robot core, NT8) continua 100% funcional.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider } from './providers.mjs';
import { createAgentGateway } from './gateway.mjs';
import { createAgentServer } from './server.mjs';
import { createLogger } from '../common/jsonl-log.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const cfgPath = argv.includes('--config') ? argv[argv.indexOf('--config') + 1] : path.join(ROOT, 'config', 'ijc-agent-gateway-v1.json');
let cfg;
try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch (e) { process.stderr.write(`[agent] config ilegivel: ${cfgPath}\n`); process.exit(2); }
if (cfg.schema !== 'ijc-agent-gateway-config/v1') { process.stderr.write('[agent] schema de config desconhecido\n'); process.exit(2); }
if (/3591|token/i.test(JSON.stringify({ bridge_url: cfg.bridge_url, provider: cfg.provider }))) { process.stderr.write('[agent] config nao pode referenciar o control plane do robo\n'); process.exit(2); }

const logger = createLogger('agent');
const provider = createProvider(cfg.provider || {});
const gateway = createAgentGateway({ bridgeUrl: cfg.bridge_url, provider, pollMs: cfg.poll_interval_ms || 15000, minProviderGapMs: cfg.min_provider_gap_ms || 60000, timeoutMs: cfg.provider_timeout_ms || 20000, logger });
const srv = createAgentServer({ host: cfg.host || '127.0.0.1', port: cfg.port || 3592, gateway });
const addr = await srv.listen();
const timer = gateway.start();
logger.log('agent_start', { state: 'LISTENING', reason: `${addr.address}:${addr.port}; provider=${provider.id}/${provider.status().status}` });
process.stderr.write(`[agent] INVICTUS JEV CODE AgentGateway (ADVISORY) em http://${addr.address}:${addr.port} · provider ${provider.id} (${provider.status().status}) · acesso a robo/ordens: NENHUM\n`);
process.on('SIGINT', async () => { clearInterval(timer); await srv.close(); logger.log('agent_stop', { state: 'STOPPED' }); process.exit(0); });
