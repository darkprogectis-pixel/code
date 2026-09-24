// INTENTS + DEDUP persistente. Neste build a fila NUNCA aceita intencao (ORDER_PATH = HARD_DISABLED),
// mas o contrato e a deduplicacao ja existem e sao testados semanticamente (sem enviar ordem).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { ORDER_PATH, SAFETY, DECISION_ACTIONS } from './constants.mjs';

// id deterministico: o mesmo snapshot + regra + instrumento + acao sempre gera o mesmo intent_id
export function makeIntentId({ snapshot_id, policy_rule, instrument, action }) {
  const h = createHash('sha256').update([snapshot_id, policy_rule, instrument, action].join('|')).digest('hex').slice(0, 16);
  return `ijc-${h}`;
}

// sessao em ET (America/New_York) para poda do dedup
export function sessionEt(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Registro PERSISTIDO de intencoes consumidas: (intent_id, snapshot_id) consumido nunca executa de novo,
// mesmo apos reconnect, restart ou F5 futuro (licao Invictus: estado so em memoria "da a impressao de proteger").
export function createDedupStore(file, { keepSessions = 5 } = {}) {
  let db = { schema: 'ijc-dedup/v1', sessions: {} };
  let loadError = null;
  try { db = JSON.parse(readFileSync(file, 'utf8')); if (!db.sessions) throw new Error('shape'); } catch (e) { if (e.code !== 'ENOENT') loadError = e.code || e.message; db = { schema: 'ijc-dedup/v1', sessions: {} }; }
  const key = (intent_id, snapshot_id) => `${intent_id}|${snapshot_id}`;
  const save = () => { const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(db)); renameSync(tmp, file); };
  return {
    file, loadError,
    isConsumed(intent_id, snapshot_id) { const k = key(intent_id, snapshot_id); return Object.values(db.sessions).some((s) => s[k]); },
    markConsumed(intent_id, snapshot_id, at = new Date()) {
      if (this.isConsumed(intent_id, snapshot_id)) return { ok: false, reason: 'DUPLICATE_INTENT' };
      const s = sessionEt(at); (db.sessions[s] = db.sessions[s] || {})[key(intent_id, snapshot_id)] = at.toISOString();
      const keep = Object.keys(db.sessions).sort().slice(-keepSessions); for (const k of Object.keys(db.sessions)) if (!keep.includes(k)) delete db.sessions[k];
      save(); return { ok: true };
    },
    size() { return Object.values(db.sessions).reduce((n, s) => n + Object.keys(s).length, 0); },
  };
}

// Fila de intencoes exposta ao executor (pull). Neste build: sempre vazia; enqueue e recusado com HARD_DISABLED.
export function createIntentQueue({ dedup }) {
  let seq = 0; const items = [];
  return {
    enqueue(intent) {
      if (!intent || !DECISION_ACTIONS.includes(intent.action) || intent.action === 'NONE') return { ok: false, reason: 'NO_ACTIONABLE_INTENT' };
      if (ORDER_PATH.state === 'HARD_DISABLED' || SAFETY.JEV_CAN_SEND_ORDER !== true) return { ok: false, reason: 'HARD_DISABLED' };
      /* inalcancavel neste build: nao existe politica que produza acao != NONE e o caminho e HARD_DISABLED */
      if (dedup.isConsumed(intent.intent_id, intent.snapshot_id)) return { ok: false, reason: 'DUPLICATE_INTENT' };
      items.push({ ...intent, seq: ++seq }); return { ok: true, seq };
    },
    after(s = 0) { return items.filter((i) => i.seq > s); },
    size: () => items.length,
  };
}
export const defaultDedupFile = (stateDir) => path.join(stateDir, 'ijc-dedup-intents.json');
