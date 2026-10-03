// Control-plane ALPHA tab: GET /api/alpha/{latest,history,metrics} read var/alpha; POST ⇒ 405; foreign Host ⇒ 403; no secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { cfg, payloads, mkFetch, tmpDir, cleanupTmp, FRESH_NOW } from './helpers.mjs';
import { runCycle } from '../../src/alpha/pipeline.mjs';
import { newMetrics } from '../../src/alpha/stats.mjs';
import { createServer } from '../../tools/jev-obs/server.mjs';
import { paths } from '../../tools/jev-obs/sources.mjs';

const C = cfg();
function req(port, p, { method = 'GET', host = '127.0.0.1' } = {}) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host } }, (x) => { let b = ''; x.on('data', (d) => (b += d)); x.on('end', () => res({ status: x.statusCode, body: b })); });
    r.on('error', rej); r.end();
  });
}

test('panel routes serve the Alpha state read-only', async () => {
  const dir = tmpDir('panel'), empty = tmpDir('panel-empty');
  const P = payloads(); Object.assign(P.quant.consolidated, { direction: 'BULLISH', confidence: 80 });
  const metrics = newMetrics();
  const ask = async () => ({ meta: { request_id: 'req_panel' }, answers: { Q10: { choice: 'BUY', confidence: 0.7, probabilities: { BUY: 0.7, INDETERMINATE: 0.3 } } } });
  for (let i = 0; i < 2; i++) await runCycle({ cfg: C, dir, metrics, jevState: {}, ask, fetchImpl: mkFetch(C, P), now: FRESH_NOW + i * 30000 });
  const srv = createServer({ ...paths(), alphaDir: dir }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const srvEmpty = createServer({ ...paths(), alphaDir: empty }); await new Promise((r) => srvEmpty.listen(0, '127.0.0.1', r));
  try {
    const port = srv.address().port;
    const L = JSON.parse((await req(port, '/api/alpha/latest')).body);
    assert.equal(L.status, 'OK'); assert.equal(L.envelopes.length, 5); assert.equal(L.fusion.schema, 'alpha-fusion/v1');
    assert.equal(L.fusion.jev.questions.Q10.winner, 'BUY', 'JEV questions are not omitted by the redactor');
    const H = JSON.parse((await req(port, '/api/alpha/history?limit=1')).body);
    assert.equal(H.rows.length, 1);
    const M = JSON.parse((await req(port, '/api/alpha/metrics')).body);
    assert.equal(M.metrics.cycles, 2);
    assert.equal((await req(port, '/api/alpha/latest', { method: 'POST' })).status, 405);
    assert.equal((await req(port, '/api/alpha/latest', { method: 'PUT' })).status, 405);
    assert.equal((await req(port, '/api/alpha/latest', { host: 'evil.example' })).status, 403);
    assert.equal((await req(port, '/api/alpha/nope')).status, 404);
    assert.equal(JSON.parse((await req(srvEmpty.address().port, '/api/alpha/latest')).body).status, 'NO_DATA');
    const html = (await req(port, '/app.js')).body;
    assert.match(html, /ALPHA SIGNAL INTELLIGENCE/);
  } finally { srv.close(); srvEmpty.close(); cleanupTmp(); }
});
