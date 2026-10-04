// ALFA OMEGA indicator catalog — IND01–06 (synthetic dirs in os.tmpdir(); the real NT8/AOT dirs only read, when present).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build, write, guardOut, scanCs, SOURCE_CLASSES, DEFAULTS } from '../../tools/jarvis/aot/catalog-build.mjs';
import { ALLOWLIST } from '../../tools/jarvis/aot/adapter.mjs';
import { dataState } from '../../tools/jarvis/aot/context.mjs';
import { tmp, REPO } from './aot-helpers.mjs';

function synth({ curated = { entries: [] } } = {}) {
  const d = tmp('jarvis-aot-cat-'); const nt8 = path.join(d, 'nt8'), aot = path.join(d, 'aot'), api = path.join(d, 'api');
  for (const x of [nt8, aot, api]) fs.mkdirSync(x);
  fs.writeFileSync(path.join(nt8, 'AlfaOmegaFoo.cs'), 'class H {}\npublic class AoHelper { }\npublic class AlfaOmegaFoo : Indicator {\n void S(){\n Description = "Foo de gamma. Consome :3500";\n AddPlot(Brushes.Red, "FooLine");\n }\n}\n');
  fs.writeFileSync(path.join(nt8, 'AoBar.cs'), 'public static class AoBar { }\n');
  fs.writeFileSync(path.join(nt8, 'Other.cs'), 'public class Other : Indicator {}\n');
  fs.writeFileSync(path.join(aot, 'aot-bff.js'), "let STATE = { ok: false };\nSTATE = { ok: true, gate, vixLine };\n");
  fs.writeFileSync(path.join(aot, 'aot-indicators.js'), 'return {\n    walls: w,\n};\n');
  fs.writeFileSync(path.join(api, 'state.json'), JSON.stringify({ ok: true, asof: 'x', gate: { anchor: null }, vixLine: { asof: 'y', value: null }, nobody: 1 }));
  fs.writeFileSync(path.join(api, 'indicators.json'), JSON.stringify({ sym: 'ES', walls: { callWall: 1 } }));
  fs.writeFileSync(path.join(api, 'health.json'), JSON.stringify({ wiring: { spotgamma: { url: 'http://localhost:3500', keyed: true } } }));
  const cur = path.join(d, 'curated.json'); fs.writeFileSync(cur, JSON.stringify(curated));
  return { d, opts: { nt8Dirs: [nt8, path.join(d, 'none')], aotDir: aot, consoDir: d, apiDir: api, curated: cur, skills: path.join(REPO, 'config', 'jarvis-skills.json') } };
}

test('IND01 completeness: every NT8 file and every sampled AOT block is catalogued with owner evidence', () => {
  const { opts } = synth(); const r = build(opts); const ids = r.catalog.indicators.map((x) => x.id);
  for (const id of ['nt8:AlfaOmegaFoo', 'nt8:AoBar', 'aot:/state#gate', 'aot:/state#vixLine', 'aot:/state#nobody', 'aot:/api/indicators#walls']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('nt8:Other'), 'only AlfaOmega*/Ao*/AO_* files');
  const foo = r.catalog.indicators.find((x) => x.id === 'nt8:AlfaOmegaFoo');
  assert.equal(foo.kind, 'NT8_INDICATOR'); assert.equal(foo.class_name, 'AlfaOmegaFoo'); assert.equal(foo.source_class, 'SPOTGAMMA'); assert.deepEqual(foo.plots.map((p) => p.name), ['FooLine']); assert.equal(foo.description_line, 5);
  assert.match(r.catalog.indicators.find((x) => x.id === 'aot:/state#gate').evidence[0], /aot-bff\.js:2$/);
  assert.equal(r.catalog.indicators.find((x) => x.id === 'aot:/state#nobody').owner_file, 'UNKNOWN', 'unknown owner is never guessed');
  for (const x of r.catalog.indicators.filter((x) => x.owner_file !== 'UNKNOWN')) assert.ok(x.evidence.length > 0, x.id);
  if (fs.existsSync(DEFAULTS.nt8Dirs[0]) && fs.existsSync(DEFAULTS.aotDir)) {
    const real = build(); assert.ok(real.catalog.indicators.length > 100);
    for (const x of real.catalog.indicators) assert.ok(x.evidence.length > 0, `real ${x.id} has evidence`);
  }
});

test('IND02 source class enum; knowledge sources are never DATA', () => {
  const r = build(synth().opts);
  for (const x of r.catalog.indicators) for (const c of x.source_class.split('+')) assert.ok(SOURCE_CLASSES.includes(c), `${x.id}: ${c}`);
  const k = r.catalog.indicators.filter((x) => x.kind === 'KNOWLEDGE_SOURCE'); assert.equal(k.length, 5);
  for (const x of k) { assert.equal(x.data_role, 'KNOWLEDGE'); assert.equal(x.source_class, 'KNOWLEDGE_SOURCE'); }
  for (const x of r.catalog.indicators.filter((x) => x.data_role === 'DATA')) assert.notEqual(x.source_class, 'KNOWLEDGE_SOURCE');
});

test('IND03 no invented API / semantics: curated must resolve evidence, id and api', () => {
  const ok = build(synth({ curated: { entries: [{ id: 'nt8:AlfaOmegaFoo', fields: { category: 'GAMMA' }, evidence: [{ file: 'nt8:AlfaOmegaFoo.cs', match: 'Foo de gamma' }] }] } }).opts);
  const foo = ok.catalog.indicators.find((x) => x.id === 'nt8:AlfaOmegaFoo'); assert.equal(foo.semantic_status, 'VERIFIED'); assert.ok(foo.evidence.some((e) => /AlfaOmegaFoo\.cs:5$/.test(e)));
  assert.equal(ok.catalog.indicators.find((x) => x.id === 'nt8:AoBar').category, 'UNKNOWN');
  const bad = [
    [{ id: 'nt8:AlfaOmegaFoo', fields: { category: 'X' }, evidence: [{ file: 'nt8:AlfaOmegaFoo.cs', match: 'texto que não existe' }] }, /match not found/],
    [{ id: 'nt8:AlfaOmegaFoo', fields: { category: 'X' }, evidence: [] }, /without evidence/],
    [{ id: 'nt8:Inventado', fields: {}, evidence: [{ file: 'nt8:AlfaOmegaFoo.cs', match: 'Foo' }] }, /not discovered/],
    [{ id: 'nt8:AlfaOmegaFoo', fields: { apis: ['/api/inventada'] }, evidence: [{ file: 'nt8:AlfaOmegaFoo.cs', match: 'Foo' }] }, /api not discovered/],
  ];
  for (const [e, re] of bad) assert.throws(() => build(synth({ curated: { entries: [e] } }).opts), re);
  const real = JSON.parse(fs.readFileSync(path.join(REPO, 'context', 'jev-future', 'alfaomega', 'ALFA_OMEGA_INDICATOR_CATALOG.json'), 'utf8'));
  for (const x of real.indicators) for (const a of x.apis) assert.ok(ALLOWLIST.includes(a), `${x.id} api ${a}`);
});

test('IND04 null ⇒ MISSING with value null (never 0)', () => {
  assert.equal(dataState({ value: null, source_ts: Date.now(), now: Date.now(), live_ms: 30000 }), 'MISSING');
  assert.equal(dataState({ value: 0, source_ts: Date.now(), now: Date.now(), live_ms: 30000 }), 'LIVE', 'a real 0 stays a value');
  const r = build(synth().opts); assert.equal(r.catalog.indicators.find((x) => x.id === 'aot:/state#gate').sample_state, 'PRESENT');
});

test('IND05 old source timestamp ⇒ STALE; mid ⇒ DELAYED', () => {
  const now = Date.now();
  assert.equal(dataState({ value: 1, source_ts: now - 3600000, now, live_ms: 30000 }), 'STALE');
  assert.equal(dataState({ value: 1, source_ts: now - 60000, now, live_ms: 30000 }), 'DELAYED');
});

test('IND06 missing timestamp ⇒ UNKNOWN (never FAIL); historical ⇒ NOT_SUPPORTED; output path guarded', () => {
  assert.equal(dataState({ value: 1, source_ts: null, now: Date.now(), live_ms: 30000 }), 'UNKNOWN');
  assert.equal(dataState({ value: 1, source_ts: Date.now(), now: Date.now(), live_ms: 30000, historical: true }), 'NOT_SUPPORTED');
  const r = build(synth().opts); assert.equal(r.catalog.indicators.find((x) => x.id === 'aot:/state#gate').freshness_field, 'UNKNOWN');
  assert.equal(r.catalog.indicators.find((x) => x.id === 'aot:/state#vixLine').freshness_field, 'vixLine.asof');
  for (const bad of [DEFAULTS.aotDir, path.join(DEFAULTS.nt8Dirs[0]), path.join(REPO, 'src')]) assert.throws(() => guardOut(bad), /not allowed/);
  const out = path.join(tmp('jarvis-aot-out-'), 'cat'); write(r, out);
  for (const f of ['ALFA_OMEGA_INDICATOR_CATALOG.json', 'ALFA_OMEGA_INDICATOR_CATALOG.csv', 'ALFA_OMEGA_INDICATOR_API_MAP.csv']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.equal(scanCs('x/AoZ.cs', 'public class AoZ : Indicator { void a(){ Account.Flatten(); } }').order_api_refs, 1, 'order-capable calls are counted (catalog display only)');
});
