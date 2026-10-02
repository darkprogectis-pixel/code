// JEV Observability — memoized transcript parsing keyed by (path, size, mtime, window) + derived snapshot.
// The derived snapshot lives in <obsDir>/derived/ (separate from every source of truth).
import fs from 'node:fs';
import path from 'node:path';
import { parseTranscript } from './aggregate.mjs';
import { statOf } from './sources.mjs';

const memo = new Map();
export const cacheStats = { hits: 0, misses: 0 };

export function cachedParse(file, F) {
  const st = statOf(file);
  const key = `${file}|${st.bytes}|${st.mtimeMs}|${F.from}|${F.until}`;
  if (memo.has(key)) { cacheStats.hits++; return memo.get(key); }
  cacheStats.misses++;
  const r = parseTranscript(file, F);
  memo.set(key, r);
  if (memo.size > 2000) memo.delete(memo.keys().next().value);
  return r;
}

export function writeDerived(P, summary) {
  try {
    fs.mkdirSync(P.derived, { recursive: true });
    const f = path.join(P.derived, 'summary.json');
    fs.writeFileSync(f + '.tmp', JSON.stringify(summary));
    fs.renameSync(f + '.tmp', f);
    return f;
  } catch { return null; }
}
