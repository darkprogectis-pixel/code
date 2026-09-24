// Gera data/jev-live-relay-mapping-v1.json a partir de src/jev/adapters/relay-mapping.mjs (fonte unica do mapeamento).
// Deterministico. Falha se: != 190 linhas; feature_id faltando/duplicado; campo C (TRACE/VolSignals) com origem != SPX
// ou mapeado para o relay; algum campo mapeado para a raiz "/"; ES_NATIVE em qualquer linha.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMappingTable, MAPPING_VERSION, ORDERFLOW_IDENTITY } from '../../../src/jev/adapters/relay-mapping.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fc = JSON.parse(readFileSync(path.join(ROOT, 'data', 'jev-feature-contract-v1.json'), 'utf8'));
const rows = buildMappingTable(fc);
const fail = (m) => { console.error('MAPPING GUARD FAIL: ' + m); process.exit(2); };
if (rows.length !== 190) fail('linhas != 190');
const ids = new Set(rows.map((r) => r.feature_id));
if (ids.size !== 190) fail('feature_id duplicado');
for (const f of fc.fields) if (!ids.has(f.feature_id)) fail('faltando ' + f.feature_id);
for (const r of rows) {
  if (r.market_origin === 'ES_NATIVE') fail('ES_NATIVE ' + r.feature_id);
  if (r.feature_id.startsWith('spx_final_context.') && (r.market_origin !== 'SPX' || r.mapping_status === 'MAPPED')) fail('campo C mapeado ao relay ou origem != SPX ' + r.feature_id);
  if (r.source_path && !/^GET \/gexbot\/(orderflow\/ES_SPX|classic\/|state\/)/.test(r.source_path)) fail('rota nao permitida ' + r.feature_id + ' ' + r.source_path);
}
const count = (k) => rows.reduce((o, r) => ((o[r[k]] = (o[r[k]] || 0) + 1), o), {});
writeFileSync(path.join(ROOT, 'data', 'jev-live-relay-mapping-v1.json'), JSON.stringify({
  _meta: { project: 'ALFA OMEGA JEV FUTURE', schema: MAPPING_VERSION, date: '2026-09-24', source: 'src/jev/adapters/relay-mapping.mjs', read_only: true,
    evidence: 'handoffs/HANDOFF_JEV_LIVE_INPUT_V1_20260924.md §A (discovery read-only; identidade de valor 36/36 numericos + timestamp, raw orderflow x raiz, mesmo vendor ts)',
    rule: 'nenhum valor inventado; raiz "/" nunca lida; campos sem rota permitida ficam NOT_PRESENT_IN_CURRENT_RELAY ou SOURCE_NOT_AVAILABLE',
    live_statuses: ['MAPPED_AVAILABLE', 'MAPPED_CURRENTLY_NULL', 'SOURCE_NOT_AVAILABLE', 'SEMANTICALLY_UNRESOLVED', 'NOT_PRESENT_IN_CURRENT_RELAY'] },
  summary: { fields: rows.length, by_mapping_status: count('mapping_status'), by_route: count('route'), orderflow_identities_verified: Object.keys(ORDERFLOW_IDENTITY).length },
  rows,
}, null, 2) + '\n');
console.log('MAPPING GUARD PASS', JSON.stringify(count('mapping_status')));
