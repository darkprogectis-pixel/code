// CONTROL PLANE do ROBOT — 127.0.0.1:3591, LOOPBACK ONLY, token obrigatorio em TODA rota.
// Modelo PULL: o executor NT8 busca intents (GET) e envia reports (POST). Nunca ha push do Node para o NT8.
// Mesmo com token: JEV_CAN_SEND_ORDER=false e ORDER_PATH=HARD_DISABLED continuam soberanos (intents sempre vazias).
import http from 'node:http';
import { JevFatalError } from '../../jev/artifacts.mjs';
import { tokenMatches } from './auth.mjs';
import { ORDER_PATH } from '../robot/constants.mjs';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
const LOOPBACK_REMOTE = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY = 64 * 1024;

export function createControlPlane({ host = '127.0.0.1', port = 3591, token, core, logger = null }) {
  if (!LOOPBACK_HOSTS.has(host)) throw new JevFatalError('control plane so pode escutar em loopback: ' + host);
  if (typeof token !== 'string' || token.length < 32) throw new JevFatalError('control plane sem token valido');
  const log = (event, f) => { if (logger) logger.log(event, f); };
  const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };

  const server = http.createServer((req, res) => {
    if (!LOOPBACK_REMOTE.has(req.socket.remoteAddress)) { log('cp_reject', { severity: 'warn', reason: 'NON_LOOPBACK' }); return send(res, 403, { ok: false, error: 'loopback only' }); }
    const got = req.headers['x-ijc-token'];
    if (!tokenMatches(token, typeof got === 'string' ? got : '')) { log('cp_reject', { severity: 'warn', reason: 'BAD_OR_MISSING_TOKEN', route: (req.url || '').split('?')[0] }); return send(res, 401, { ok: false, error: 'token ausente ou invalido' }); }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const route = `${req.method} ${url.pathname}`;
    const readBody = () => new Promise((resolve) => {
      let n = 0; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { req.destroy(); resolve(undefined); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { resolve(undefined); } });
      req.on('error', () => resolve(undefined));
    });
    (async () => {
      switch (route) {
        case 'GET /robot/v1/status': return send(res, 200, { ok: true, status: core.status() });
        case 'GET /robot/v1/intents': {
          const after = Number(url.searchParams.get('after') || 0) || 0;
          return send(res, 200, { ok: true, order_path: ORDER_PATH.state, mode: core.status().mode, intents: core.intentsAfter(after) });
        }
        case 'POST /robot/v1/report': {
          const b = await readBody(); if (b === undefined) return send(res, 400, { ok: false, error: 'corpo invalido' });
          const r = core.report(b);
          log('executor_report', { state: b && b.executor_state, reason: r.ok ? 'ok' : r.reason, reconciliation: b && b.reconciliation && b.reconciliation.status });
          return send(res, r.ok ? 200 : 400, { ok: r.ok, order_path: ORDER_PATH.state, mode: core.status().mode });
        }
        case 'POST /robot/v1/enable-request': {
          const b = await readBody(); if (b === undefined) return send(res, 400, { ok: false, error: 'corpo invalido' });
          const r = core.requestEnable({ origin: b.origin });
          log('enable_request', { state: r.mode, reason: r.accepted ? 'ARMED' : (r.reason || 'GATES_FAILED'), failed_gates: r.failed_gates });
          return send(res, 200, { ok: true, ...r });
        }
        case 'POST /robot/v1/disable': return send(res, 200, { ok: true, ...core.disable() });
        case 'POST /robot/v1/emergency': return send(res, 200, { ok: true, ...core.emergency() });
        default: return send(res, 404, { ok: false, error: 'rota desconhecida' });
      }
    })().catch(() => send(res, 500, { ok: false, error: 'erro interno' }));
  });
  return {
    server,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server.address())); }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
