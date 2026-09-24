// Normaliza o input para os 190 feature_ids do contrato, preservando lineage e instancias (ticker/categoria).
// Convencoes do jev-input/v1:
//  - campo simples: fields["<feature_id>"] = valor
//  - campo template (tem instances): valor direto (= instancia primaria SPX/<1a categoria>) ou mapa {"SPX/zero": v, "SPY/zero": v, ...}
//  - campo de array ("...[]..."): fields["<prefixo>[]"] = [ {<subcampo>: v, ...}, ... ] (ou mapa de instancias de arrays);
//    ex.: fields["abot.classic.strikes[]"] = [{strike, gex_vol, gex_oi, priors}]
//  - valor null => presente-mas-null (NULL_AT_SOURCE), tratado como ausente para leitura.
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const INSTANCE_KEY = /^[A-Z]{2,5}\/[a-z_]+$/;

function arrayParts(featureId) {
  const i = featureId.indexOf('[]');
  if (i < 0) return null;
  const parent = featureId.slice(0, i + 2);
  const sub = featureId.slice(i + 3).replace(/\[.*\]$/, ''); // "priors[0..4]" -> "priors"
  return { parent, sub };
}

export function primaryInstance(field, ticker) {
  if (!field.instances) return null;
  return `${ticker}/${String(field.instances.categories[0]).split(' ')[0]}`;
}

function asInstanceMap(field, raw, ticker) {
  if (raw === undefined) return null;
  if (field.instances && isObj(raw) && Object.keys(raw).length && Object.keys(raw).every((k) => INSTANCE_KEY.test(k))) return raw;
  return { [primaryInstance(field, ticker) || `${ticker}/-`]: raw };
}

export function normalize(ing, art, cfg) {
  const ticker = cfg.primary_ticker;
  const F = art.feature_contract.fields;
  const known = new Set();
  const byId = {};
  for (const f of F) {
    const ap = arrayParts(f.feature_id);
    const key = ap ? ap.parent : f.feature_id;
    known.add(key);
    const inst = asInstanceMap(f, ing.fields[key], ticker);
    const instances = {};
    if (inst) for (const [ik, v] of Object.entries(inst)) {
      if (ap) {
        const rows = Array.isArray(v) ? v : null;
        const has = rows ? rows.some((r) => isObj(r) && r[ap.sub] !== undefined && r[ap.sub] !== null) : false;
        instances[ik] = { present: has, null_at_source: v === null, value: has ? rows : undefined };
      } else instances[ik] = { present: v !== null && v !== undefined, null_at_source: v === null, value: v ?? undefined };
    }
    const primary = primaryInstance(f, ticker) || `${ticker}/-`;
    byId[f.feature_id] = {
      feature_id: f.feature_id, source_component: f.source_component, freshness_rule: f.freshness_rule, market_origin: f.market_origin,
      quality_state: f.quality_state, lineage_group: f.lineage_group, double_counting_group: f.double_counting_group,
      array_sub: ap ? ap.sub : null, primary_instance: primary, instances,
      present: Object.values(instances).some((x) => x.present),
      present_primary: !!(instances[primary] && instances[primary].present),
    };
  }
  const unrecognized = Object.keys(ing.fields).filter((k) => !known.has(k));
  const present = Object.values(byId).filter((x) => x.present).map((x) => x.feature_id);
  const nulls = Object.values(byId).filter((x) => !x.present && Object.values(x.instances).some((i) => i.null_at_source)).map((x) => x.feature_id);
  const missing = Object.values(byId).filter((x) => !x.present).map((x) => x.feature_id);
  const nonPrimaryTickers = [...new Set(Object.values(byId).flatMap((x) => Object.keys(x.instances)).map((k) => k.split('/')[0]).filter((t) => t !== ticker))];
  return { byId, present, missing, nulls, unrecognized, non_primary_tickers: nonPrimaryTickers };
}

// valor primario (SPX, 1a categoria) ou de uma categoria especifica
export function val(norm, featureId, category) {
  const x = norm.byId[featureId];
  if (!x) return undefined;
  const key = category ? `${x.primary_instance.split('/')[0]}/${category}` : x.primary_instance;
  const i = x.instances[key];
  return i && i.present ? i.value : undefined;
}
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
