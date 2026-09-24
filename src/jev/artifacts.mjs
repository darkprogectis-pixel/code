// Carrega os artefatos canonicos do Jev (read-only) e verifica os invariantes estruturais.
// Qualquer violacao aqui e FATAL: artefato ilegivel, schema corrompido ou invariante quebrado.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export class JevFatalError extends Error {
  constructor(message) { super(message); this.name = 'JevFatalError'; }
}
const fatal = (msg) => { throw new JevFatalError(msg); };

export const ARTIFACT_FILES = {
  feature_contract: 'jev-feature-contract-v1.json',
  dc_groups: 'jev-double-counting-groups-v1.json',
  routes: 'jev-analysis-routes-v1.json',
  evidence_families: 'jev-evidence-families-v1.json',
  output_contract: 'jev-output-contract-v1.json',
  decision_logic: 'jev-decision-logic-v1.json',
  rules: 'jev-preregistered-rules-v1.json',
  state_machine: 'jev-classification-state-machine-v1.json',
  hypotheses: 'jev-hypotheses-register-v1.json',
  provisional_mappings: 'jev-provisional-mappings-v1.json',
};

export const ACTIVE_STATUSES = ['CANONICAL_STRUCTURAL', 'SUPPORTED_SEMANTIC'];
export const INACTIVE_STATUSES = ['HYPOTHESIS_TO_TEST', 'BLOCKED_BY_UNKNOWN_SEMANTICS', 'DIAGNOSTIC_ONLY'];

function readJson(dir, file) {
  const p = path.join(dir, file);
  let raw;
  try { raw = readFileSync(p); } catch (e) { fatal(`artefato obrigatorio ilegivel: ${p} (${e.code || e.message})`); }
  let obj;
  try { obj = JSON.parse(raw.toString('utf8')); } catch (e) { fatal(`artefato corrompido (JSON invalido): ${p}`); }
  return { obj, sha256: createHash('sha256').update(raw).digest('hex') };
}

export function loadArtifacts(artifactsDir) {
  const a = {}; const sha256 = {};
  for (const [k, f] of Object.entries(ARTIFACT_FILES)) { const r = readJson(artifactsDir, f); a[k] = r.obj; sha256[f] = r.sha256; }
  verifyInvariants(a);
  return { ...a, sha256, dir: artifactsDir };
}

export function verifyInvariants(a) {
  const F = a.feature_contract.fields;
  if (!Array.isArray(F) || F.length !== 190) fatal(`feature contract != 190 campos (${F && F.length})`);
  const ids = new Set(F.map((f) => f.feature_id));
  if (ids.size !== 190) fatal('feature_id duplicado no feature contract');
  const R = a.routes.routes;
  if (!Array.isArray(R) || R.length !== 190) fatal('rotas != 190');
  const nB = R.filter((r) => r.stage === 'B_JEV_NATIVE_DEALER_ANALYSIS').length;
  const nC = R.filter((r) => r.stage === 'C_SPX_FINAL_CONTEXT').length;
  if (nB !== 174 || nC !== 16) fatal(`rotas B/C != 174/16 (${nB}/${nC})`);
  for (const r of R) {
    if (!ids.has(r.feature_id)) fatal('rota sem campo ' + r.feature_id);
    if (r.is_vote !== false) fatal('is_vote != false em ' + r.feature_id);
    if (r.possible_contribution_areas_status !== 'PROVISIONAL_DESIGN_MAPPING') fatal('rota sem PROVISIONAL_DESIGN_MAPPING ' + r.feature_id);
    if (r.stage === 'C_SPX_FINAL_CONTEXT' && r.market_origin !== 'SPX') fatal('campo C com origem != SPX ' + r.feature_id);
    if (r.market_origin === 'ES_NATIVE') fatal('ES_NATIVE proibido ' + r.feature_id);
  }
  const fams = a.evidence_families.families;
  if (!Array.isArray(fams) || !fams.length) fatal('evidence families vazias');
  for (const f of fams) {
    if (['SUSPECTED', 'UNVERIFIED', 'PARTIAL_ANALOG'].includes(f.lineage_basis) && f.kind === 'CONSOLIDATED') fatal('familia de lineage nao comprovada consolidada: ' + f.family_id);
    if (f.kind !== 'CONSOLIDATED' && f.kind !== 'NON_EVIDENCE' && !(f.overlap_risk && f.overlap_risk.rule)) fatal('familia separada sem overlap_risk: ' + f.family_id);
  }
  const rules = a.rules.rules;
  const enumS = a.rules._meta.status_enum;
  if (JSON.stringify([...a.rules._meta.active_statuses].sort()) !== JSON.stringify([...ACTIVE_STATUSES].sort())) fatal('active_statuses divergentes do runtime');
  for (const r of rules) {
    if (!enumS.includes(r.status)) fatal('status fora do enum ' + r.rule_id);
    if (ACTIVE_STATUSES.includes(r.status) && r.emits_side) fatal('regra ATIVA emitindo lado: ' + r.rule_id + ' (runtime V1 nao tem avaliador de lado)');
  }
  const oc = a.output_contract;
  if (JSON.stringify(oc.enums.menthorq_confirmation) !== '["POSITIVE","ZERO"]') fatal('enum MenthorQ alterado');
  if (oc.enums.spx_effect_on_native.includes('MIXED')) fatal('enum MIXED nao pertence ao contrato V1');
  const st = a.state_machine.states;
  for (const [k, v] of Object.entries(st)) if (v.reachable_in_record_v1 && k !== 'UNKNOWN') fatal('estado alcancavel no registro V1 alem de UNKNOWN: ' + k);
  if (a.state_machine.no_trade_context_criteria !== 'UNDEFINED') fatal('NO_TRADE criteria mudou; runtime V1 nao tem avaliador');
  if (a.provisional_mappings.status !== 'PROVISIONAL_DESIGN_MAPPING') fatal('mapeamentos provisorios sem status provisorio');
  for (const m of a.provisional_mappings.mappings) if (m.directional_use !== 'NOT_ALLOWED_WITHOUT_PREREGISTRATION') fatal('mapeamento com uso direcional ' + m.source_dimension);
  const dl = a.decision_logic.policies;
  if (!/^UNDEFINED/.test(dl.CORE_vs_JEV_FUSION_POLICY) || !/^UNDEFINED/.test(dl.CORE_vs_JEV_CONFLICT_POLICY)) fatal('politica Core x Jev deixou de ser UNDEFINED; runtime V1 nao a implementa');
}
