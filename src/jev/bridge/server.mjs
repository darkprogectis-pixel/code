// JEV BRIDGE V1: servidor HTTP local SOMENTE LEITURA que publica o estado do MESMO motor para consumidores
// (Control Center web, NT8 AddOn, agentes externos opcionais/assincronos). Sem rota de escrita; so GET/HEAD.
// Nao envia ordem, nao altera o robo (sempre OFF), nao escreve em disco, so escuta em loopback.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JevFatalError } from '../artifacts.mjs';
import { buildPanel, robotStatus } from './panel-model.mjs';

const HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), 'control-center.html');
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

// providers.robotStatus: () => Robot Core publicStatus() (opcional). Sem ele, robo = OFF/travado padrao.
export function createBridge(cfg, providers = {}) {
  if (!LOOPBACK.has(cfg.host)) throw new JevFatalError('bridge so pode escutar em loopback (127.0.0.1/::1): ' + cfg.host);
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) throw new JevFatalError('porta da bridge invalida');
  const robotPublic = () => { try { return providers.robotStatus ? providers.robotStatus() : robotStatus(); } catch { return robotStatus(); } };
  const state = { result: null, report: null, meta: { mode: cfg.mode || 'UNKNOWN', started_at: new Date().toISOString(), cycles: 0, last_cycle_at: null, last_cycle_error: null, relay: null } };
  let html = null;
  const send = (res, code, body, type = 'application/json; charset=utf-8', head = false) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-jev-read-only': 'true' });
    res.end(head ? undefined : body);
  };
  const json = (res, code, obj, head) => send(res, code, JSON.stringify(obj), undefined, head);

  const server = http.createServer((req, res) => {
    const head = req.method === 'HEAD';
    if (req.method !== 'GET' && !head) { res.setHeader('allow', 'GET, HEAD'); return json(res, 405, { ok: false, error: 'somente leitura: apenas GET/HEAD' }); }
    const url = (req.url || '/').split('?')[0];
    if (url === '/' || url === '/control-center') {
      try { html = html || readFileSync(HTML, 'utf8'); } catch { return json(res, 500, { ok: false, error: 'ui indisponivel' }, head); }
      return send(res, 200, html, 'text/html; charset=utf-8', head);
    }
    if (url === '/jev/v1/health') return json(res, 200, { ok: true, status: state.result ? 'RUNNING' : 'STARTING', mode: state.meta.mode, cycles: state.meta.cycles, last_cycle_at: state.meta.last_cycle_at, last_cycle_error: state.meta.last_cycle_error, read_only: true, orders_enabled: false }, head);
    if (url === '/jev/v1/state') return json(res, 200, buildPanel(state.result, state.meta, { robot: robotPublic() }), head);
    if (url === '/jev/v1/output') return state.result ? json(res, 200, state.result.output, head) : json(res, 503, { ok: false, status: 'STARTING' }, head);
    if (url === '/jev/v1/audit') return state.result ? json(res, 200, { ...state.result.audit, adapter_report: state.report }, head) : json(res, 503, { ok: false, status: 'STARTING' }, head);
    if (url === '/jev/v1/robot') return json(res, 200, robotPublic(), head);
    return json(res, 404, { ok: false, error: 'rota desconhecida', routes: ['/', '/jev/v1/health', '/jev/v1/state', '/jev/v1/output', '/jev/v1/audit', '/jev/v1/robot'] }, head);
  });

  return {
    server, state,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(cfg.port, cfg.host, () => resolve(server.address())); }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    // chamado a cada ciclo do laco live/replay
    update: ({ result, report, error }) => {
      state.meta.cycles++;
      state.meta.last_cycle_at = new Date().toISOString();
      state.meta.last_cycle_error = error || null;
      if (report && report.routes) state.meta.relay = { ok_routes: report.routes.filter((r) => r.result === 'OK').length, total_routes: report.routes.length, relay: report.relay };
      if (result) { state.result = result; state.report = report || null; }
    },
  };
}
