// Cliente HTTP SOMENTE LEITURA (GET) para o relay. Nunca POST/PUT/DELETE, nunca corpo de requisicao, nunca credenciais.
// Nunca lanca: devolve { ok, status, json, error } com error em OFFLINE | TIMEOUT | MALFORMED | HTTP_<status> | NOT_OBJECT.
import http from 'node:http';

export function httpGetJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve({ ms: Date.now() - t0, arrival_at: new Date().toISOString(), ...r }); } };
    let req;
    try {
      req = http.request(url, { method: 'GET', timeout: timeoutMs, headers: { accept: 'application/json' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) return finish({ ok: false, status: res.statusCode, error: `HTTP_${res.statusCode}` });
          let json;
          try { json = JSON.parse(body); } catch { return finish({ ok: false, status: res.statusCode, error: 'MALFORMED' }); }
          if (!json || typeof json !== 'object' || Array.isArray(json)) return finish({ ok: false, status: res.statusCode, error: 'NOT_OBJECT' });
          finish({ ok: true, status: res.statusCode, json });
        });
        res.on('error', () => finish({ ok: false, status: res.statusCode, error: 'OFFLINE' }));
      });
    } catch { return finish({ ok: false, status: null, error: 'OFFLINE' }); }
    req.on('timeout', () => { req.destroy(); finish({ ok: false, status: null, error: 'TIMEOUT' }); });
    req.on('error', () => finish({ ok: false, status: null, error: 'OFFLINE' }));
    req.end();
  });
}
