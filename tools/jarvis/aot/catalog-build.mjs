// ALFA OMEGA indicator catalog + API map builder (R2 §6). Read-only scan; writes ONLY under the repo
// context/jev-future/alfaomega/ (or an os.tmpdir() target, for tests). Never writes to NT8, the AOT dir or the Consolidator.
// Sources: NT8 indicator code (AlfaOmega*.cs, Ao*.cs, AO_*.cs), AOT BFF block modules, AOT API samples (/state,
// /api/indicators, /health.wiring: sanitized fixtures by default), JARVIS skills registry (knowledge sources).
// Every row has OWNER_FILE + line evidence. Semantic fields (category/signal_role/unit/instruments) come ONLY from
// config/alfaomega-indicators.curated.json entries whose evidence the builder can resolve; otherwise UNKNOWN / NOT_VERIFIED.
// The builder FAILS on curated evidence it cannot resolve, a curated id it did not discover, or a curated API not discovered.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..', '..');
const HOME = os.homedir();
export const DEFAULTS = Object.freeze({
  nt8Dirs: [path.join(HOME, 'Documents', 'NinjaTrader 8', 'bin', 'Custom', 'Indicators', 'TTW_DarkProjects'), path.join(HOME, 'Documents', 'NinjaTrader 8', 'bin', 'Custom', 'Indicators')],
  aotDir: path.join(HOME, '.claude', 'aot'),
  consoDir: path.join(HOME, '.claude', 'consolidator-engine'),
  apiDir: path.join(REPO, 'fixtures', 'jarvis-aot'),
  curated: path.join(REPO, 'config', 'alfaomega-indicators.curated.json'),
  lineage: path.join(REPO, 'config', 'alfaomega-lineage.curated.json'),
  histDir: path.join(HOME, 'Desktop', 'Handof TTW'),
  pkgDir: path.join(HOME, 'Downloads', 'AlfaOmega_pacote_20260825'),
  skills: path.join(REPO, 'config', 'jarvis-skills.json'),
  out: path.join(REPO, 'context', 'jev-future', 'alfaomega'),
});

export const SOURCE_CLASSES = Object.freeze(['SPOTGAMMA', 'GEXBOT', 'MENTHORQ', 'QUANTDATA', 'CONSOLIDATOR', 'AO_BRIDGE', 'AOT_BFF', 'NT8_NATIVE', 'INTERNAL', 'KNOWLEDGE_SOURCE', 'UNKNOWN']);
export const KINDS = Object.freeze(['NT8_INDICATOR', 'NT8_SUPPORT', 'AOT_BLOCK', 'KNOWLEDGE_SOURCE']);
const PORT_CLASS = { 3500: 'SPOTGAMMA', 3457: 'GEXBOT', 3480: 'MENTHORQ', 3490: 'QUANTDATA', 3495: 'CONSOLIDATOR', 5151: 'AO_BRIDGE', 5152: 'AO_BRIDGE', 3600: 'AOT_BFF' };
const ALPHA = { SPOTGAMMA: 'α Gamma', GEXBOT: 'α Bot', MENTHORQ: 'α Q', QUANTDATA: 'α Data', CONSOLIDATOR: 'α Quant' };
const AOT_MODULES = ['aot-indicators.js', 'aot-gamma-blocks.js', 'aot-menthorq-strategies.js', 'aot-health.js', 'aot-alfabot-signal.js', 'aot-bff.js'];
const META_KEYS = new Set(['ok', 'asof', 'session', 'rth', 'stackMode', 'meta', 'sym', '_esOnly', '_fixture']);
// JARVIS areas that read each AOT block (from tools/jarvis/aot/context.mjs extractors; JARVIS-own wiring, not AOT semantics).
const JARVIS_AREAS = {
  '/state': { gate: ['COMMAND', 'AUTOMATION', 'ALFABOT'], tapeFreshness: ['COMMAND'], sources: ['COMMAND'], confluence: ['COMMAND'], health: ['COMMAND'], symbols: ['ALFABOT'],
    hiroOpra: ['DEEP_DIVE'], zeroGamma0dte: ['DEEP_DIVE'], dexGexFlow: ['DEEP_DIVE'], traceCloud: ['DEEP_DIVE'], vixLine: ['DEEP_DIVE'], menthorqStrategies: ['DEEP_DIVE'], v2: ['DEEP_DIVE'], sim: ['AUTOMATION'] },
  '/api/indicators': { walls: ['DEEP_DIVE'], gammaPressure: ['DEEP_DIVE'], hiroRegime: ['DEEP_DIVE'] },
};
const ORDER_RE = /SubmitOrderUnmanaged|\.CreateOrder\(|\.Submit\(|EnterLong\(|EnterShort\(|ExitLong\(|ExitShort\(|\.Cancel\(|CancelAllOrders|\.Flatten\(/g;

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const rel = (f) => { for (const [k, d] of [['repo', REPO], ['home', HOME]]) { const r = path.relative(d, f); if (!r.startsWith('..') && !path.isAbsolute(r)) return `${k}:${r.split(path.sep).join('/')}`; } return f; };

// One NT8 .cs file → catalog row (pure on text).
export function scanCs(file, text) {
  const base = path.basename(file, '.cs');
  const all = [...text.matchAll(/public\s+(?:partial\s+)?(?:static\s+)?(?:sealed\s+)?class\s+(\w+)\s*(?::\s*(\w+))?/g)];
  const cls = all.find((m) => m[2] === 'Indicator') || all.find((m) => m[1] === base) || all[0] || null;
  const isInd = !!cls && cls[2] === 'Indicator';
  const desc = /(?:^|\n)\s*Description\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/.exec(text);
  const plots = []; for (const m of text.matchAll(/AddPlot\(([^;]*)\)\s*;/g)) { const s = [...m[1].matchAll(/"([^"]+)"/g)].pop(); if (s) plots.push({ name: s[1], line: lineOf(text, m.index) }); }
  const ports = new Map(); for (const m of text.matchAll(/:(3457|3480|3490|3495|3500|3600|5151|5152)\b/g)) if (!ports.has(m[1])) ports.set(m[1], lineOf(text, m.index));
  const classes = [...new Set([...ports.keys()].map((p) => PORT_CLASS[p]))];
  const orderRefs = [...text.matchAll(ORDER_RE)].map((m) => lineOf(text, m.index));
  const name = base;
  const source_class = classes.length === 1 ? classes[0] : classes.length > 1 ? classes.join('+') : (/OnBarUpdate|OnMarketData/.test(text) ? 'NT8_NATIVE' : 'INTERNAL');
  return {
    id: `nt8:${name}`, name, class_name: cls ? cls[1] : null, classes: all.length, kind: isInd ? 'NT8_INDICATOR' : 'NT8_SUPPORT', module: 'NT8', owner_file: rel(file), owner_line: cls ? lineOf(text, cls.index) : 1,
    description: desc ? desc[1].replace(/\\"/g, '"') : null, description_line: desc ? lineOf(text, desc.index + desc[0].indexOf('Description')) : null,
    plots, source_class, source_alias: classes.map((c) => ALPHA[c]).filter(Boolean), source_ports: [...ports].map(([p, l]) => ({ port: Number(p), line: l })),
    apis: [], instruments: 'UNKNOWN', category: 'UNKNOWN', signal_role: 'UNKNOWN', unit: 'UNKNOWN', semantic_status: 'NOT_VERIFIED',
    order_api_refs: orderRefs.length, order_api_lines: orderRefs.slice(0, 5), data_role: 'DATA', jarvis_areas: [], freshness_field: 'UNKNOWN', sample_state: 'NOT_SAMPLED',
    evidence: [`${rel(file)}:${cls ? lineOf(text, cls.index) : 1}`],
  };
}

// Owner = first match, in order: object-literal key in the block modules; for /state also STATE.key =, the STATE = {…} literal,
// a const/let declaration, then any assignment in aot-bff.js. No match ⇒ UNKNOWN (never guessed).
function findOwner(aotDir, key, api) {
  const k = key.replace(/\W/g, '');
  const pats = [new RegExp(String.raw`^\s*${k}\s*[:,]`, 'm')];
  if (api === '/state') pats.push(new RegExp(String.raw`STATE\.${k}\s*=`), new RegExp(String.raw`STATE\s*=\s*\{[^\n]*\b${k}\b`), new RegExp(String.raw`(?:const|let|var)\s+[^\n=]*\b${k}\s*=`), new RegExp(String.raw`\b${k}\s*=[^=]`));
  for (const re of pats) for (const m of (re === pats[0] ? AOT_MODULES : ['aot-bff.js'])) {
    const f = path.join(aotDir, m); if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8'); const r = re.exec(t);
    if (r) return { file: f, line: lineOf(t, r.index) };
  }
  return null;
}
const TS_KEYS = ['asof', 'ts', 'updated_at', 'at', 'timestamp_iso'];
function sampleState(v) { if (v == null) return 'MISSING'; if (typeof v === 'object' && v.ok === false) return 'NOT_OK'; return 'PRESENT'; }
function instrumentsOf(api, v, sample) {
  if (v && typeof v === 'object' && !Array.isArray(v)) { const k = Object.keys(v).map((x) => x.toUpperCase()).filter((x) => ['ES', 'NQ', 'GC', 'RTY'].includes(x)); if (k.length) return [...new Set(k)]; }
  if (api === '/api/indicators' && sample?.sym) return [String(sample.sym).toUpperCase()];
  return 'UNKNOWN';
}

// AOT BFF blocks discovered in the API samples → rows (owner located in the AOT modules; read-only).
export function scanAotBlocks({ aotDir, samples }) {
  const rows = [];
  for (const [api, sample] of Object.entries(samples)) {
    if (!sample || !['/state', '/api/indicators'].includes(api)) continue;
    for (const [key, v] of Object.entries(sample)) {
      if (META_KEYS.has(key)) continue;
      const o = findOwner(aotDir, key, api);
      const tsk = v && typeof v === 'object' ? TS_KEYS.find((k) => k in v) : null;
      rows.push({
        id: `aot:${api}#${key}`, name: key, kind: 'AOT_BLOCK', module: 'AOT_BFF', owner_file: o ? rel(o.file) : 'UNKNOWN', owner_line: o ? o.line : null,
        description: null, description_line: null, plots: [], source_class: 'AOT_BFF', source_alias: [], source_ports: [{ port: 3600, line: null }],
        apis: [api], instruments: instrumentsOf(api, v, sample), category: 'UNKNOWN', signal_role: 'UNKNOWN', unit: 'UNKNOWN', semantic_status: 'NOT_VERIFIED',
        order_api_refs: 0, order_api_lines: [], data_role: 'DATA', jarvis_areas: JARVIS_AREAS[api]?.[key] || [], freshness_field: tsk ? `${key}.${tsk}` : 'UNKNOWN', sample_state: sampleState(v),
        evidence: o ? [`${rel(o.file)}:${o.line}`] : [],
      });
    }
  }
  return rows;
}

// Courses + Alpha skills = KNOWLEDGE_SOURCE (never DATA), from the JARVIS skills registry.
export function scanKnowledge(registryFile) {
  if (!fs.existsSync(registryFile)) return [];
  const reg = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  return (reg.skills || []).map((s) => ({
    id: `knowledge:${s.skill_id}`, name: s.name || s.skill_id, kind: 'KNOWLEDGE_SOURCE', module: 'JARVIS_SKILLS', owner_file: `repo:${s.path}`, owner_line: 1,
    description: s.domain ?? null, description_line: null, plots: [], source_class: 'KNOWLEDGE_SOURCE', source_alias: [], source_ports: [],
    apis: [], instruments: 'UNKNOWN', category: 'KNOWLEDGE', signal_role: 'NONE', unit: 'NOT_APPLICABLE', semantic_status: 'VERIFIED',
    order_api_refs: 0, order_api_lines: [], data_role: 'KNOWLEDGE', jarvis_areas: [], freshness_field: 'NOT_APPLICABLE', sample_state: 'NOT_SAMPLED',
    corpus: s.corpus_path ?? null, knowledge_origin: s.source ?? null, evidence: [`repo:${s.path}:1`, `repo:config/jarvis-skills.json`],
  }));
}

// Suite files outside the AlfaOmega/Ao naming (lineage audit 2026-10-05): ULTIMATE, Quant AO Engine, ULTIMATE entry core.
const NAMED_CS = ['MenthorQGammaEngine.cs', 'QuantDataEngine.cs', 'MenthorQGammaEntryCore.cs'];
const ROOTS = (o) => ({ repo: REPO, nt8: o.nt8Dirs[0], nt8root: o.nt8Dirs[1], aot: o.aotDir, conso: o.consoDir, hist: o.histDir, pkg: o.pkgDir });
// evidence {file:"<root>:<relpath>", match:"literal"} → "file:line" or throws.
export function resolveEvidence(ev, roots) {
  const [root, ...rest] = String(ev.file).split(':'); const base = roots[root];
  if (!base || !rest.length) throw new Error(`curated evidence root unknown: ${ev.file}`);
  const f = path.join(base, rest.join(':'));
  if (!fs.existsSync(f)) throw new Error(`curated evidence file not found: ${ev.file}`);
  const t = fs.readFileSync(f, 'utf8'); const i = t.indexOf(ev.match ?? '\u0000');
  if (!ev.match || i < 0) throw new Error(`curated evidence match not found in ${ev.file}: ${ev.match}`);
  return `${ev.file}:${lineOf(t, i)}`;
}

export function applyCurated(rows, curated, roots) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const apis = new Set(rows.flatMap((r) => r.apis));
  for (const e of curated.entries || []) {
    const r = byId.get(e.id); if (!r) throw new Error(`curated id not discovered: ${e.id}`);
    if (!Array.isArray(e.evidence) || !e.evidence.length) throw new Error(`curated entry without evidence: ${e.id}`);
    const ev = e.evidence.map((x) => resolveEvidence(x, roots));
    for (const a of e.fields?.apis || []) if (!apis.has(a)) throw new Error(`curated api not discovered: ${a} (${e.id})`);
    Object.assign(r, e.fields || {}); r.semantic_status = 'VERIFIED'; r.evidence = [...r.evidence, ...ev]; if (e.note) r.note = e.note;
  }
  return rows;
}

const loadJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export function build(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cs = [];
  for (const d of o.nt8Dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((n) => /^(AlfaOmega|Ao|AO_)\w*\.cs$/.test(n) || NAMED_CS.includes(n)).sort()) cs.push(scanCs(path.join(d, f), fs.readFileSync(path.join(d, f), 'utf8')));
  }
  const samples = { '/state': loadJson(path.join(o.apiDir, 'state.json')), '/api/indicators': loadJson(path.join(o.apiDir, 'indicators.json')) };
  const health = loadJson(path.join(o.apiDir, 'health.json'));
  const rows = [...cs, ...scanAotBlocks({ aotDir: o.aotDir, samples }), ...scanKnowledge(o.skills)];
  const ids = new Set(); for (const r of rows) { if (ids.has(r.id)) throw new Error(`duplicate id ${r.id}`); ids.add(r.id); }
  const curated = loadJson(o.curated) || { entries: [] };
  applyCurated(rows, curated, ROOTS(o));
  const wiring = Object.entries(health?.wiring || {}).map(([k, v]) => ({ source: k, alias: ALPHA[k.toUpperCase()] || null, url: v.url, keyed: !!v.keyed }));
  const apiMap = rows.filter((r) => r.kind === 'AOT_BLOCK').map((r) => ({ api: r.apis[0], field: r.name, owner_file: r.owner_file, owner_line: r.owner_line, jarvis_areas: r.jarvis_areas.join('|'), sample_state: r.sample_state, freshness_field: r.freshness_field, upstream: r.upstream || 'UNKNOWN' }));
  for (const [api, owner, areas] of [['/robo/state', 'aot-bff.js', 'ROBOT'], ['/history', 'aot-bff.js', 'HISTORY'], ['/api/alfabot-signal', 'aot-alfabot-signal.js', 'ALFABOT'], ['/health', 'aot-bff.js', '']]) {
    const f = path.join(o.aotDir, owner); let line = null;
    if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); const i = t.indexOf(`'${api}'`) >= 0 ? t.indexOf(`'${api}'`) : t.indexOf(`"${api}"`); line = i >= 0 ? lineOf(t, i) : null; }
    apiMap.push({ api, field: '*', owner_file: rel(f), owner_line: line, jarvis_areas: areas, sample_state: 'ENDPOINT', freshness_field: 'UNKNOWN', upstream: 'UNKNOWN' });
  }
  const counts = {}; for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
  return {
    catalog: { schema: 'alfa-omega-indicator-catalog/v1', status: 'BUILT', built_from: { nt8: o.nt8Dirs.map(rel), aot: rel(o.aotDir), api_samples: rel(o.apiDir), curated: rel(o.curated) },
      rule: 'semantic fields only from curated entries with resolvable evidence; otherwise UNKNOWN / NOT_VERIFIED. Knowledge sources are never DATA.',
      counts, verified: rows.filter((r) => r.semantic_status === 'VERIFIED').length, wiring, indicators: rows },
    apiMap,
  };
}

const CSV_COLS = ['id', 'name', 'kind', 'lineage_class', 'module', 'source_class', 'apis', 'instruments', 'category', 'signal_role', 'unit', 'semantic_status', 'data_role', 'sample_state', 'freshness_field', 'jarvis_areas', 'order_api_refs', 'owner_file', 'owner_line', 'evidence'];
const cell = (v) => { const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';

// Path guard: only the repo catalog dir or a dir under os.tmpdir() (tests).
export function guardOut(out) {
  const p = path.resolve(out);
  const tmp = path.resolve(os.tmpdir());
  const ok = p === path.resolve(DEFAULTS.out) || (p.startsWith(tmp + path.sep) && !path.relative(tmp, p).startsWith('..'));
  if (!ok) throw new Error(`catalog output not allowed: ${p}`);
  return p;
}
export function write(result, out = DEFAULTS.out) {
  const dir = guardOut(out); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ALFA_OMEGA_INDICATOR_CATALOG.json'), JSON.stringify(result.catalog, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'ALFA_OMEGA_INDICATOR_CATALOG.csv'), toCsv(result.catalog.indicators, CSV_COLS));
  fs.writeFileSync(path.join(dir, 'ALFA_OMEGA_INDICATOR_API_MAP.csv'), toCsv(result.apiMap, ['api', 'field', 'owner_file', 'owner_line', 'jarvis_areas', 'sample_state', 'freshness_field', 'upstream']));
  return dir;
}

// Lineage (proposal §2.2): curated lifecycle per component; every evidence resolved fail-closed by resolveEvidence.
const LINEAGE_CLASS = { MERGED_INTO_FLOWONE: 'LEGACY_MERGED_INTO_FLOWONE', FLOWONE_HYBRID: 'HYBRID', SUPERSEDED: 'LEGACY_SUPERSEDED', ACTIVE_STANDALONE: 'NT8_INDICATOR_ACTIVE', ACTIVE_AGGREGATOR: 'NT8_INDICATOR_AGGREGATOR', CONTROL_UI: 'CONTROL_UI', SUPPORT_COMPONENT: 'NT8_SUPPORT', UNKNOWN: 'UNKNOWN' };
export function buildLineage(opts = {}) {
  const o = { ...DEFAULTS, ...opts }; const L = loadJson(o.lineage);
  if (!L || !Array.isArray(L.entries) || !Array.isArray(L.lifecycle_enum)) throw new Error(`lineage file missing or invalid: ${o.lineage}`);
  const roots = ROOTS(o); const ids = new Set(); const counts = {};
  const entries = L.entries.map((e) => {
    if (ids.has(e.id)) throw new Error(`duplicate lineage id ${e.id}`); ids.add(e.id);
    if (e.lifecycle_status != null && !L.lifecycle_enum.includes(e.lifecycle_status)) throw new Error(`lineage status not in enum: ${e.lifecycle_status} (${e.id})`);
    if (!Array.isArray(e.evidence) || !e.evidence.length) throw new Error(`lineage entry without evidence: ${e.id}`);
    const key = e.lifecycle_status || e.kind; counts[key] = (counts[key] || 0) + 1;
    return { ...e, evidence_resolved: e.evidence.map((x) => resolveEvidence(x, roots)) };
  });
  return { schema: 'alfa-omega-indicator-lineage/v1', status: 'BUILT', built_from: rel(o.lineage), rule: L.rule, generations: L.generations, lifecycle_enum: L.lifecycle_enum, counts,
    evidence_resolved: entries.reduce((n, e) => n + e.evidence_resolved.length, 0), entries };
}
// Catalog reclassification column (order §22): AOT blocks / knowledge keep their class; NT8 rows take the lineage class.
export function applyLineage(result, lineage) {
  const byId = new Map(lineage.entries.map((e) => [e.id, e]));
  for (const r of result.catalog.indicators) {
    const e = byId.get(r.id);
    r.lineage_class = r.kind === 'AOT_BLOCK' ? 'AOT_CALCULATED' : r.kind === 'KNOWLEDGE_SOURCE' ? 'KNOWLEDGE_SOURCE' : !e ? 'UNKNOWN'
      : e.kind === 'SEPARATE_PROJECT_B3' ? 'OUT_OF_SCOPE_B3' : e.kind !== 'COMPONENT' ? e.kind : LINEAGE_CLASS[e.lifecycle_status] || 'UNKNOWN';
  }
  const c = {}; for (const r of result.catalog.indicators) c[r.lineage_class] = (c[r.lineage_class] || 0) + 1;
  result.catalog.lineage_counts = c; return result;
}
function lineageMd(L) {
  const gens = Object.entries(L.generations || {}).map(([k, v]) => `- **${k}**: ${v}`).join('\n');
  const counts = Object.entries(L.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const rows = L.entries.map((e) => `| \`${e.id}\` | ${e.kind} | ${e.lifecycle_status ?? ''} | ${e.generation ?? ''} | ${e.successor ?? ''} | ${e.evidence_resolved.join('<br>')} |`).join('\n');
  return `# ALFA OMEGA — INDICATOR LINEAGE (generated)

Built by \`tools/jarvis/aot/catalog-build.mjs\` from \`config/alfaomega-lineage.curated.json\`. Every lifecycle claim cites evidence resolved to file:line; unresolvable evidence fails the build. UNKNOWN is kept where unproven; nothing is declared DEPRECATED. Documentation only: no NT8 file is changed.

Rule: ${L.rule}

## Generations

${gens}

## Counts (lifecycle_status; kind for non-components)

| status | entries |
|---|---|
${counts}
| **total** | ${L.entries.length} (evidence resolved: ${L.evidence_resolved}) |

## Entries

| id | kind | lifecycle | generation | successor | evidence |
|---|---|---|---|---|---|
${rows}
`;
}
export function writeLineage(lineage, out = DEFAULTS.out) {
  const dir = guardOut(out); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ALFA_OMEGA_INDICATOR_LINEAGE.json'), JSON.stringify(lineage, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'ALFA_OMEGA_INDICATOR_LINEAGE.md'), lineageMd(lineage));
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const r = build({ ...(arg('--api-dir') ? { apiDir: path.resolve(arg('--api-dir')) } : {}) });
  const L = buildLineage(); applyLineage(r, L);
  const sum = { counts: r.catalog.counts, verified: r.catalog.verified, api_rows: r.apiMap.length, lineage_entries: L.entries.length, lineage_evidence: L.evidence_resolved, lineage_counts: r.catalog.lineage_counts };
  if (process.argv.includes('--check')) { console.log(JSON.stringify(sum)); }
  else { const out = arg('--out') || DEFAULTS.out; const d = write(r, out); writeLineage(L, out); console.log(JSON.stringify({ out: d, ...sum })); }
}
