// Servidor do AGENT GATEWAY: 127.0.0.1:3592, GET/HEAD apenas. CORS so para o Control Center web (:3590).
import http from 'node:http';

const LOOPBACK = new Set(['127.0.0.1', '::1']);

export function createAgentServer({ host = '127.0.0.1', port = 3592, gateway, allowOrigins = ['http://127.0.0.1:3590', 'http://localhost:3590'] }) {
  if (!LOOPBACK.has(host)) throw new Error('agent gateway so pode escutar em loopback');
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-ijc-advisory': 'true' };
    if (origin && allowOrigins.includes(origin)) headers['access-control-allow-origin'] = origin;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...headers, allow: 'GET, HEAD' }); return res.end(JSON.stringify({ ok: false, error: 'somente leitura' })); }
    const p = (req.url || '/').split('?')[0];
    const body = p === '/agent/v1/health' ? gateway.health() : p === '/agent/v1/notes' ? gateway.notes() : null;
    res.writeHead(body ? 200 : 404, headers);
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body || { ok: false, error: 'rota desconhecida' }));
  });
  return {
    server,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server.address())); }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
