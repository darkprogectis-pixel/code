// Alpha security/consistency: GET-only loopback allowlist, static scan (no write verbs, no order paths, writes only in var/),
// skill ↔ code consistency (rules_version, module, role).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../../src/alpha/config.mjs';
import { cfg, mkFetch } from './helpers.mjs';
import { assertAllowed, getJson } from '../../src/alpha/http.mjs';
import { SPECIALISTS } from '../../src/alpha/pipeline.mjs';

const C = cfg();
const files = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.mjs') ? [path.join(d, e.name)] : []));
const SRC = files(path.join(REPO, 'src', 'alpha'));

test('allowlist: only http://127.0.0.1 on {3495,3500,3457,3480,3490,5151}, GET only', async () => {
  assert.deepEqual([...C.allow.ports].sort(), [3457, 3480, 3490, 3495, 3500, 5151]);
  assert.equal(C.allow.method, 'GET'); assert.equal(C.allow.host, '127.0.0.1');
  for (const u of ['http://127.0.0.1:3530/x', 'http://localhost:3495/x', 'http://10.0.0.5:3495/x', 'https://127.0.0.1:3495/x', 'http://127.0.0.1:5000/order'])
    assert.throws(() => assertAllowed(u, C.allow), /allowlist/);
  await assert.rejects(getJson('http://127.0.0.1:3530/gex', { allow: C.allow, fetchImpl: mkFetch(C, {}) }), /allowlist/);
  assert.throws(() => assertAllowed('http://127.0.0.1:3495/x', { ...C.allow, method: 'POST' }), /only GET/);
  for (const eps of Object.values(C.endpoints)) for (const u of Object.values(eps)) assert.doesNotThrow(() => assertAllowed(u, C.allow), u);
});

test('static scan: no write HTTP verbs, no order/execution paths in src/alpha', () => {
  for (const f of SRC) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i, f);
    assert.doesNotMatch(s, /\b(submitOrder|placeOrder|sendOrder|EXECUTE_TRADE\s*=\s*true|JEV_CAN_SEND_ORDER\s*=\s*true)\b/, f);
    assert.doesNotMatch(s, /child_process|execSync|spawn\(/, `${f}: no shell`);
  }
});

test('static scan: filesystem writes only via state dir (var/alpha) helpers', () => {
  const writers = SRC.filter((f) => /fs\.(writeFileSync|appendFileSync|renameSync|rmSync|mkdirSync)/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f)).sort();
  assert.deepEqual(writers, ['outcomes.mjs', 'pipeline.mjs', 'service.mjs', 'snapshots.mjs']);
  const conf = fs.readFileSync(path.join(REPO, 'src', 'alpha', 'config.mjs'), 'utf8');
  assert.match(conf, /path\.join\(REPO, 'var', 'alpha'\)/);
  assert.match(fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8'), /^var\/$/m);
});

test('skill ↔ code consistency: each specialist has its skill with the same rules_version, module and role', () => {
  for (const m of SPECIALISTS) {
    const f = path.join(REPO, '.claude', 'skills', `skill-alpha-${m.source}`, 'SKILL.md');
    assert.ok(fs.existsSync(f), f);
    const s = fs.readFileSync(f, 'utf8');
    assert.match(s, new RegExp(`^name: skill-alpha-${m.source}$`, 'm'));
    assert.match(s, new RegExp(`^rules_version: ${C.rules_version}$`, 'm'));
    assert.match(s, new RegExp(`^module: src/alpha/specialists/${m.source}\\.mjs$`, 'm'));
    assert.ok(s.includes(`role=${m.role}`), `${m.source} role ${m.role}`);
    for (const url of Object.values(C.endpoints[m.source])) assert.ok(s.includes(new URL(url).pathname), `${m.source} documents ${url}`);
    assert.equal((s.match(/^\d+\. \*\*/gm) || []).length, 18, `${m.source}: 18 items`);
  }
  assert.ok(fs.existsSync(path.join(REPO, 'context', 'jev-future', 'ALPHA_FUSION_V1.md')));
});

test('every envelope/fusion is labeled UNCALIBRATED and constants are marked provisional', () => {
  assert.equal(C.calibration, 'UNCALIBRATED'); assert.match(C._note, /PROVISIONAL/);
});
