// Diretorio de dados do INVICTUS JEV CODE (fora do repositorio e fora de qualquer pasta do NT8).
// IJC_DATA_DIR sobrescreve (testes usam diretorio temporario).
import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

export function dataDir() {
  return process.env.IJC_DATA_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'InvictusJevCode');
}
export function subDir(name) {
  const d = path.join(dataDir(), name);
  try { mkdirSync(d, { recursive: true }); } catch { /* fail-soft: logger/estado degradam, nunca derrubam */ }
  return d;
}
