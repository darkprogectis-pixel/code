// Configuracao do runtime. As travas de seguranca sao constantes e nao podem ser ligadas por config.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JevFatalError } from './artifacts.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RUNTIME_VERSION = 'jev-runtime/v1.0.0';
export const INPUT_SCHEMA = 'jev-input/v1';
export const OUTPUT_SCHEMA = 'jev-output/v1';

export const SAFETY = Object.freeze({
  JEV_CAN_SEND_ORDER: false,
  JEV_CAN_EXECUTE_TRADE: false,
  JEV_CAN_MODIFY_NT8: false,
  JEV_CAN_OVERRIDE_CORE: false,
});

const DEFAULTS = {
  schema: 'jev-runtime-config/v1',
  artifacts_dir: 'context/jev-future/data',
  target: 'ES',
  primary_ticker: 'SPX',
  // Limiar operador-fornecido para fontes cujo contrato nao define stale_after_sec (ex.: FR_TRACE, FR_MENTHORQ_MERGE).
  // Vazio = sem limiar => freshness UNKNOWN (nunca FRESH por default). Todo valor aqui e PROVISIONAL e sai no audit.
  provisional_stale_after_sec_overrides: {},
};

export function loadConfig(configPath) {
  let user = {};
  if (configPath) {
    try { user = JSON.parse(readFileSync(configPath, 'utf8')); } catch (e) { throw new JevFatalError(`config ilegivel ou invalida: ${configPath} (${e.code || e.message})`); }
  }
  const cfg = { ...DEFAULTS, ...user, provisional_stale_after_sec_overrides: { ...DEFAULTS.provisional_stale_after_sec_overrides, ...(user.provisional_stale_after_sec_overrides || {}) } };
  if (cfg.schema !== DEFAULTS.schema) throw new JevFatalError('config schema desconhecido: ' + cfg.schema);
  if (cfg.target !== 'ES') throw new JevFatalError('target V1 = ES (NQ nao ativo)');
  if (cfg.primary_ticker !== 'SPX') throw new JevFatalError('primary_ticker V1 = SPX');
  // qualquer tentativa de ligar execucao e erro estrutural
  for (const k of Object.keys(SAFETY)) if (k in user && user[k] !== false) throw new JevFatalError(`${k} nao pode ser habilitado no JEV V1`);
  if (user.safety) throw new JevFatalError('bloco safety nao e configuravel no JEV V1');
  for (const [k, v] of Object.entries(cfg.provisional_stale_after_sec_overrides)) {
    if (!/^FR_[A-Z_]+$/.test(k) || !(Number.isFinite(v) && v > 0)) throw new JevFatalError(`override de freshness invalido: ${k}=${v}`);
  }
  cfg.artifacts_dir_abs = path.resolve(REPO_ROOT, cfg.artifacts_dir);
  cfg.config_path = configPath || null;
  return cfg;
}
