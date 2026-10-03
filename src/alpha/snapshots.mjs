// Immutable, content-addressed snapshots of raw API payloads (raw_ref target). Dedupe by sha256 of the body.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function snapshotId(source, key, text) { return `${source}.${key}.${sha(text).slice(0, 16)}`; }

export function writeSnapshot(dir, { source, key, url, text, fetchedAt }) {
  const id = snapshotId(source, key, text);
  const day = fetchedAt.slice(0, 10);
  const d = path.join(dir, 'snapshots', day);
  const f = path.join(d, `${id}.json`);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(d, { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ id, source, key, url, fetched_at: fetchedAt, sha256: sha(text), body: text }));
    fs.renameSync(tmp, f);
  }
  return { id, sha: sha(text).slice(0, 16), path: path.relative(dir, f).replaceAll('\\', '/') };
}

export function pruneSnapshots(dir, retentionDays, now = Date.now()) {
  const root = path.join(dir, 'snapshots');
  let removed = 0;
  for (const day of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const t = Date.parse(`${day}T00:00:00Z`);
    if (Number.isFinite(t) && now - t > (retentionDays + 1) * 86400000) { fs.rmSync(path.join(root, day), { recursive: true, force: true }); removed++; }
  }
  return removed;
}
