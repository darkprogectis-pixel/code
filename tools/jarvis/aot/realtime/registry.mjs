// ALFA OMEGA real-time layer — static registry (proposal ALFA_OMEGA_INDICATORS_AS_JARVIS_REALTIME_BASE §2.4).
// SHADOW / READ-ONLY: sources are read with GET only; nothing here sends, writes or controls anything.
// Sources: the α skills (.claude/skills/skill-alpha-*/SKILL.md §3 endpoints), src/alpha/outcomes.mjs (:5151 /state),
// tools/jarvis/aot/adapter.mjs (:3600 read endpoints). Roles: context/jev-future/alfaomega/ALFA_OMEGA_INDICATOR_SEMANTICS.md §2.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const LINEAGE_FILE = path.join(REPO, 'config', 'alfaomega-lineage.curated.json');

// vendor_class separates the vendor from the port: an INTERNAL_COMPUTE source is never independent vendor evidence
// next to the EXTERNAL inputs it already contains (double-count guard). `group` = independence group (counts once).
export const SOURCES = Object.freeze([
  { id: 'ALFA_GAMMA', port: 3500, vendor: 'SpotGamma', vendor_class: 'EXTERNAL', group: 'G_GAMMA', paths: ['/hiro/SPX', '/levels/SPX', '/health'] },
  { id: 'ALFA_BOT', port: 3457, vendor: 'GexBot/GammaGex', vendor_class: 'EXTERNAL', group: 'G_BOT', paths: ['/gexbot/orderflow/ES_SPX', '/gexbot/classic/SPX/zero'] },
  { id: 'ALFA_Q', port: 3480, vendor: 'MenthorQ', vendor_class: 'EXTERNAL', group: 'G_Q', paths: ['/exposure/ES', '/levels/ES'] },
  { id: 'ALFA_DATA', port: 3490, vendor: 'QuantData', vendor_class: 'EXTERNAL', group: 'G_QUANT_DATA', paths: ['/signal/ES'] },
  { id: 'ALFA_QUANT', port: 3495, vendor: null, vendor_class: 'INTERNAL_COMPUTE', group: 'G_QUANT_DATA', derived_from: ['ALFA_DATA', 'ALFA_Q', 'NT8_CME', 'ALFA_BOT'], paths: ['/consolidated/ES'] },
  { id: 'NT8_CME', port: 5151, vendor: 'CME via NT8 (AlfaOmegaBridge)', vendor_class: 'NT8_CME', group: 'G_CME', paths: ['/state'] },
  { id: 'AOT_BFF', port: 3600, vendor: null, vendor_class: 'INTERNAL_COMPUTE', group: 'G_AOT', paths: ['/state', '/api/indicators'] },
].map((s) => Object.freeze({ ...s, paths: Object.freeze(s.paths) })));

// :5152 AlfaOmegaTrader/Boleta · :5153 CopyEngine · :3591/:3592 INVICTUS control plane / agent gateway · :3530 Bearer upstream.
export const DENIED_PORTS = Object.freeze([5152, 5153, 3591, 3592, 3530]);
export const CADENCES = Object.freeze(['OFF', 60, 120, 180, 240, 300, 'ON_DEMAND']);
export const ROLES = Object.freeze(['DIRECTION', 'CONFIRMATION', 'FILTER', 'REGIME', 'RISK', 'CONTEXT', 'STRUCTURE', 'UNKNOWN']);
export const EMITTABLE_LIFECYCLE = Object.freeze(['ACTIVE_STANDALONE', 'ACTIVE_AGGREGATOR', 'FLOWONE_INTERNAL', 'FLOWONE_HYBRID', 'SOURCE_PUBLISHED']);

// Active indicators (lineage ACTIVE_* / FLOWONE_HYBRID) → primary source + role (semantics §2, source map §2).
const I = (id, sources, role, dimension, semantics, extra = {}) => Object.freeze({ id, sources: Object.freeze(sources), role, dimension, semantics, ...extra });
export const INDICATORS = Object.freeze([
  I('nt8:AlfaOmegaFlowOne', ['NT8_CME'], 'DIRECTION', 'ORDER_FLOW', 'sign of ME/MVI/CONF when fresh (SharedState :176–179)'),
  I('nt8:AlfaOmegaFlowOneHybrid', ['ALFA_GAMMA'], 'CONTEXT', 'OPTIONS_FLOW', 'render layers mirror standalones; never FlowOne principal'),
  I('nt8:AlfaOmegaCopilotUnificado', ['ALFA_QUANT'], 'CONTEXT', 'CONFIRMATION', 'mirrors the :3495 verdict; never re-derived', { mirror_of: 'src:ALFA_QUANT' }),
  I('nt8:MenthorQGammaEngine', ['ALFA_Q'], 'CONFIRMATION', 'DEALER_POSITIONING', 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING', { policy: 'POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING' }),
  I('nt8:QuantDataEngine', ['ALFA_DATA'], 'CONTEXT', 'MOMENTUM', 'as published by the QD engine (consolidator impulso input)'),
  I('nt8:AlfaOmegaNetDrift', ['ALFA_DATA'], 'UNKNOWN', 'OPTIONS_FLOW', 'UNKNOWN (render code not read)'),
  I('nt8:AlfaOmegaCallPutClassing', ['ALFA_DATA', 'ALFA_GAMMA'], 'UNKNOWN', 'OPTIONS_FLOW', 'UNKNOWN'),
  I('nt8:AlfaOmegaOrderflow', ['ALFA_BOT'], 'UNKNOWN', 'OPTIONS_FLOW', 'UNKNOWN (GexBot options orderflow, not CME tape)'),
  I('nt8:AlfaOmegaHiro', ['ALFA_GAMMA'], 'CONFIRMATION', 'OPTIONS_FLOW', 'sign of Σf4 (HIRO positive = buying hedge pressure), fresh only'),
  I('nt8:AlfaOmegaOptionsFlowHiro', ['ALFA_GAMMA'], 'CONTEXT', 'OPTIONS_FLOW', 'OfhNet+OfhSweep = one vote inside FlowOne OptionsScore'),
  I('nt8:AlfaOmegaGammaPressure', ['ALFA_GAMMA'], 'REGIME', 'GAMMA', 'regime mapping NOT_DEFINED'),
  I('nt8:AlfaOmegaOpenFlow', ['ALFA_GAMMA'], 'CONTEXT', 'OPTIONS_FLOW', 'none'),
  I('nt8:AlfaOmegaDivergenceESX', ['ALFA_GAMMA'], 'CONTEXT', 'DIVERGENCE', 'as published; StaleSeconds 120'),
  I('nt8:AlfaOmegaTrace', ['ALFA_GAMMA'], 'STRUCTURE', 'DEALER_POSITIONING', 'levels, no direction'),
  I('nt8:AlfaOmegaTraceCloud', ['ALFA_GAMMA'], 'STRUCTURE', 'GAMMA', 'levels, no direction'),
  I('nt8:AlfaOmegaGexByStrike', ['ALFA_GAMMA'], 'STRUCTURE', 'GEX', 'levels, no direction'),
  I('nt8:AlfaOmegaVixLine', ['ALFA_GAMMA'], 'CONTEXT', 'VOLATILITY', 'none'),
  I('nt8:AlfaOmegaVolDashboard', ['ALFA_GAMMA'], 'CONTEXT', 'VOLATILITY', 'none'),
  I('nt8:AlfaOmegaDexGexFlow', ['ALFA_BOT'], 'CONTEXT', 'DEX', 'JEV four-source input; JARVIS never re-derives', { jev_four_source: true }),
  I('nt8:AlfaOmegaNetGex0DTE', ['ALFA_BOT'], 'CONTEXT', 'GEX', 'JEV four-source input; JARVIS never re-derives', { jev_four_source: true }),
  I('nt8:AlfaOmegaClassic', ['ALFA_BOT'], 'CONTEXT', 'DEALER_POSITIONING', 'JEV four-source input; JARVIS never re-derives', { jev_four_source: true }),
  I('nt8:AlfaOmegaState', ['ALFA_BOT'], 'CONTEXT', 'DEALER_POSITIONING', 'JEV four-source input; JARVIS never re-derives', { jev_four_source: true }),
  I('nt8:AlfaOmegaVectorPro', ['NT8_CME'], 'CONTEXT', 'TREND', 'UNKNOWN (no documented mapping)'),
]);

// FlowOne internal capabilities ← the gen-1 module each one replaced (FLOWONE_CAPABILITY_LINEAGE §2). Never counted twice.
export const FLOWONE_CAPABILITIES = Object.freeze([
  ['flowone:ME', 'nt8:AlfaOmegaNexus'], ['flowone:MVI', 'nt8:AlfaOmegaPulse'], ['flowone:CONF', 'nt8:AlfaOmegaFusion'],
  ['flowone:Marker', 'nt8:AlfaOmegaMarker'], ['flowone:Pressure', 'nt8:AlfaOmegaPressure'], ['flowone:Depth', 'nt8:AlfaOmegaDepth'], ['flowone:Velocity', 'nt8:AlfaOmegaVelocity'],
].map(([capability_id, legacy_id]) => Object.freeze({ capability_id, legacy_id, owner: 'nt8:AlfaOmegaFlowOne' })));

export const loadLineage = (file = LINEAGE_FILE) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const sourceById = (id) => SOURCES.find((s) => s.id === id) || null;

// Returns {source, url} or throws BEFORE any I/O: loopback http only, denied ports, registry paths only, no query.
export function checkUrl(url) {
  const u = new URL(url);
  const port = Number(u.port);
  if (DENIED_PORTS.includes(port)) throw new Error(`realtime port denied: ${port}`);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error(`realtime url must be loopback http: ${url}`);
  const source = SOURCES.find((s) => s.port === port);
  if (!source) throw new Error(`realtime port not in registry: ${port}`);
  if (u.search || u.hash || !source.paths.includes(u.pathname)) throw new Error(`realtime path not allowed: ${u.pathname}${u.search}`);
  return { source, url: `http://${u.host}${u.pathname}` };
}
