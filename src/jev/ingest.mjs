// Leitura do input jev-input/v1. Fail-soft: input ausente/ilegivel/malformado vira problema registrado, nunca crash.
import { readFileSync } from 'node:fs';
import { INPUT_SCHEMA } from './config.mjs';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function readInputFile(p) {
  const issues = [];
  let raw;
  try { raw = readFileSync(p, 'utf8'); } catch (e) { issues.push({ code: 'RC_INPUT_UNREADABLE', detail: e.code || 'read error' }); return { input: null, issues }; }
  try { return { input: JSON.parse(raw), issues }; } catch { issues.push({ code: 'RC_INPUT_UNPARSEABLE', detail: 'JSON invalido' }); return { input: null, issues }; }
}

// Converte vendor timestamp: numero = epoch em SEGUNDOS (contrato do vendor); string = ISO-8601. Outro formato => null.
export function toEpochSec(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 && v < 1e11 ? v : null; // >1e11 seria ms: nao adivinhar
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t / 1000 : null; }
  return null;
}

export function ingest(input, issues = []) {
  const out = { schema_ok: false, evaluated_at: null, session: 'UNKNOWN', sources: {}, fields: {}, core: null, issues: [...issues] };
  if (!isObj(input)) { if (!issues.length) out.issues.push({ code: 'RC_INPUT_EMPTY', detail: 'input ausente ou nao-objeto' }); return out; }
  if (input.schema !== INPUT_SCHEMA) out.issues.push({ code: 'RC_INPUT_SCHEMA_MISMATCH', detail: `esperado ${INPUT_SCHEMA}, recebido ${input.schema}` });
  else out.schema_ok = true;
  const ev = toEpochSec(input.evaluated_at);
  if (ev === null) out.issues.push({ code: 'RC_EVALUATED_AT_INVALID', detail: 'evaluated_at ausente/invalido => freshness UNKNOWN em todas as fontes' });
  out.evaluated_at = ev;
  if (input.session === 'RTH' || input.session === 'OUTSIDE_RTH') out.session = input.session;
  else if (input.session !== undefined) out.issues.push({ code: 'RC_SESSION_INVALID', detail: String(input.session) });
  if (isObj(input.sources)) {
    for (const [k, v] of Object.entries(input.sources)) {
      if (!/^FR_[A-Z_]+$/.test(k) || !isObj(v)) { out.issues.push({ code: 'RC_SOURCE_BLOCK_INVALID', detail: k }); continue; }
      // observed_frozen: observacao OPCIONAL do produtor (adapter): vendor ts repetido em leituras consecutivas enquanto a chegada avanca
      out.sources[k] = { vendor_timestamp: toEpochSec(v.vendor_timestamp), vendor_timestamp_raw: v.vendor_timestamp ?? null, observed_frozen: v.observed_frozen === true };
    }
  } else if (input.sources !== undefined) out.issues.push({ code: 'RC_SOURCES_INVALID', detail: 'sources nao e objeto' });
  // problemas de coleta relatados pelo adapter (relay offline, timeout, JSON malformado...) viram reason codes, nunca crash
  if (Array.isArray(input.adapter_issues)) {
    for (const i of input.adapter_issues) if (isObj(i) && /^RC_[A-Z0-9_]+$/.test(String(i.code))) out.issues.push({ code: i.code, detail: String(i.detail ?? '').slice(0, 300) });
  }
  if (isObj(input.fields)) out.fields = input.fields;
  else if (input.fields !== undefined) out.issues.push({ code: 'RC_FIELDS_INVALID', detail: 'fields nao e objeto' });
  if (isObj(input.core)) out.core = { side: ['LONG', 'SHORT', 'NONE'].includes(input.core.side) ? input.core.side : null };
  return out;
}
