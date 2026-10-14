// Preview SOMENTE LEITURA do candidato: serve candidate/index.html e candidate/auto.html e repassa todo o resto por GET ao :3600.
// Qualquer metodo != GET/HEAD => 405 (nada chega ao BFF de producao). node tests/preview-server.mjs [porta=3613]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 3613), UP = 'http://127.0.0.1:3600';
const LOCAL = { '/': 'index.html', '/index.html': 'index.html', '/auto.html': 'auto.html' };
http.createServer(async (q, r) => {
  if (q.method !== 'GET' && q.method !== 'HEAD') { r.writeHead(405); return r.end('preview somente leitura'); }
  const p = q.url.split('?')[0];
  if (LOCAL[p]) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return r.end(fs.readFileSync(path.join(D, 'candidate', LOCAL[p]))); }
  try {
    const u = await fetch(UP + q.url, { signal: AbortSignal.timeout(15000) });
    const h = {}; for (const [k, v] of u.headers) if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) h[k] = v;
    r.writeHead(u.status, h); r.end(Buffer.from(await u.arrayBuffer()));
  } catch (e) { r.writeHead(502); r.end(String(e.message)); }
}).listen(PORT, '127.0.0.1', () => console.log('preview candidato em http://127.0.0.1:' + PORT + ' (GET-only -> :3600)'));
