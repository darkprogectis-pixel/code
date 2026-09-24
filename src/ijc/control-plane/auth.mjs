// Token local do control plane. Gerado no 1o boot em <dataDir>/secrets (fora do Git, fora do repo).
// Nunca impresso, logado, exibido na UI nem entregue ao Agent Gateway.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { subDir } from '../common/paths.mjs';

export const tokenPath = () => path.join(subDir('secrets'), 'control-plane.token');

export function loadOrCreateToken(p = tokenPath()) {
  if (existsSync(p)) {
    const t = readFileSync(p, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(t)) return t;
  }
  const t = randomBytes(32).toString('hex');
  writeFileSync(p, t, { mode: 0o600 });
  return t;
}

export function tokenMatches(expected, got) {
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
