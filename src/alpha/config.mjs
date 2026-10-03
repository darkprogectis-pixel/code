// Alpha config + state paths. Everything derived lives under var/alpha (gitignored); overridable for tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function loadConfig(file = process.env.ALPHA_CONFIG || path.join(REPO, 'config', 'alpha.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export const stateDir = () => process.env.ALPHA_STATE_DIR || path.join(REPO, 'var', 'alpha');
export const SOURCES = ['quant', 'gamma', 'bot', 'q', 'data'];
export const AGENT = { quant: 'AGENT_QUANT', gamma: 'AGENT_GAMMA', bot: 'AGENT_BOT', q: 'AGENT_Q', data: 'AGENT_DATA' };
export const LABEL = { quant: 'α Quant', gamma: 'α Gamma', bot: 'α Bot', q: 'α Q', data: 'α Data' };
