// Alpha feedback scaffold (FASE 8). For every alpha-fusion with signal ≠ NO_SIGNAL: record p0 and capture the ES price
// at +1/+5/+15/+30/+60 min. Price = AO bridge GET 127.0.0.1:5151/state `es.lastPrice`, only if `es.priceAgeMs` ≤ price_max_age_ms.
// No valid price ⇒ OUTCOME_UNKNOWN (nothing invented). No auto-optimization: outcomes are recorded, never fed back into rules.
import fs from 'node:fs';
import path from 'node:path';
import { getJson } from './http.mjs';

// Reads a trustworthy ES price or null. Never throws.
export async function readPrice(cfg, { fetchImpl, now = Date.now() } = {}) {
  try {
    const r = await getJson(cfg.endpoints.price.bridge, { allow: cfg.allow, timeoutMs: 2000, fetchImpl });
    const es = r.json?.es;
    const p = es?.lastPrice, age = es?.priceAgeMs;
    if (typeof p !== 'number' || !Number.isFinite(p) || typeof age !== 'number' || age > cfg.outcomes.price_max_age_ms) return null;
    return { price: p, at: now - age };
  } catch { return null; }
}

export function register(pending, fusion, price, cfg) {
  if (fusion.signal === 'NO_SIGNAL') return null;
  const t0 = Date.parse(fusion.timestamp);
  const rec = {
    cycle_id: fusion.cycle_id, at: fusion.timestamp, signal: fusion.signal, confidence: fusion.confidence, agreement: fusion.agreement,
    p0: price?.price ?? null, p0_status: price ? 'OUTCOME_CAPTURED' : 'OUTCOME_UNKNOWN', label: 'LABEL_PENDING',
    horizons: Object.fromEntries(cfg.outcomes.horizons_min.map((m) => [`${m}m`, { due: t0 + m * 60000, status: 'PENDING', price: null, ret: null, hit: null }])),
  };
  pending.push(rec);
  return rec;
}

// Resolves due horizons. Returns the records that became LABELED (removed from pending).
export function tick(pending, price, now, cfg) {
  const tol = cfg.outcomes.capture_tolerance_ms;
  const done = [];
  for (const rec of pending) {
    for (const h of Object.values(rec.horizons)) {
      if (h.status !== 'PENDING' || now < h.due) continue;
      if (price && Math.abs(price.at - h.due) <= tol) {
        h.status = 'OUTCOME_CAPTURED'; h.price = price.price;
        if (rec.p0 != null) { h.ret = Math.round(((h.price - rec.p0) / rec.p0) * 1e6) / 1e6; h.hit = h.ret === 0 ? null : (h.ret > 0) === (rec.signal === 'BUY'); }
      } else if (now - h.due > tol) h.status = 'OUTCOME_UNKNOWN';
    }
    if (Object.values(rec.horizons).every((h) => h.status !== 'PENDING')) { rec.label = 'LABELED'; rec.labeled_at = new Date(now).toISOString(); done.push(rec); }
  }
  for (const r of done) pending.splice(pending.indexOf(r), 1);
  return done;
}

// File-backed wrapper used by the service: pending in outcomes-pending.json, labeled records appended to outcomes.ndjson.
export function createOutcomes({ cfg, dir }) {
  const fPending = path.join(dir, 'outcomes-pending.json'), fOut = path.join(dir, 'outcomes.ndjson');
  let pending = [];
  try { pending = JSON.parse(fs.readFileSync(fPending, 'utf8')); } catch { pending = []; }
  const save = () => { fs.mkdirSync(dir, { recursive: true }); const tmp = `${fPending}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(pending)); fs.renameSync(tmp, fPending); };
  return {
    get pending() { return pending; },
    step(fusion, price, now) {
      const added = register(pending, fusion, price, cfg);
      const labeled = tick(pending, price, now, cfg);
      for (const r of labeled) fs.appendFileSync(fOut, JSON.stringify(r) + '\n');
      if (added || labeled.length || pending.length) save();
      return { added: !!added, labeled: labeled.length, pending: pending.length };
    },
  };
}
