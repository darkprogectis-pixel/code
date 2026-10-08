// Integridade e politica dos Mods do Claude-JEV (JEV MODS DESIGN req_01a11dba02127c88bfbdaabd77a1cafd; regras R1, R5, R6, R8).
// Somente leitura: confere hashes dos arquivos fixados em mods/INTEGRITY.json e a validacao estatica oficial de cada mod.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODS = path.join(ROOT, 'mods');
const INT = JSON.parse(fs.readFileSync(path.join(MODS, 'INTEGRITY.json'), 'utf8'));
const walk = (d, r = '') => fs.readdirSync(path.join(d, r), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d, path.posix.join(r, e.name)) : [path.posix.join(r, e.name)]));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Chamadas que NENHUM mod instalado pode fazer (R1, R8) e a lista fechada por mod (R5, R6).
const PROIBIDAS = ['tool.check', 'prompt.submit', 'prompt.fill', 'prompt.suggest', 'session.append', 'session.send', 'env.set', 'model.complete', 'model.fork', 'mcp.call', 'command.run', 'fs.write', 'process.spawn'];
const PERMITIDAS = {
  jev: ['env.get', 'http.fetch'],
  'jev-policy': ['command.register', 'fs.read', 'jev.ask', 'process.run', 'session.cwd', 'store.get', 'store.set', 'ui.log'],
  'token-weather': ['session.usage', 'ui.invalidate', 'ui.resolve'],
  'replay-theater': ['clock.sleep', 'command.register', 'fs.exists', 'fs.read', 'session.cwd', 'ui.close', 'ui.invalidate', 'ui.open', 'ui.resolve'],
  'blast-radius': ['clock.now', 'process.run', 'session.cwd', 'ui.close', 'ui.invalidate', 'ui.open', 'ui.resolve', 'ui.toast'],
};
const REDE = { jev: true };   // so o mod jev pode fazer rede

function validate(mod) {
  const out = execFileSync('claude', ['plugin', 'validate', path.join(MODS, mod)], { encoding: 'utf8', shell: process.platform === 'win32' });
  const calls = [...out.matchAll(/calls: ([^\n]+)/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/^\$\./, '').replace(/\s*\(via [^)]*\)/, ''))).filter(Boolean);
  const hooks = [...out.matchAll(/hooks: ([^\n]+)/g)].map((m) => m[1].trim()).filter((h) => !/hooks\.json$/.test(h)).join(', ');
  return { out, calls: [...new Set(calls)].sort(), hooks, ok: /Validation passed/.test(out) };
}

test('MI1 todo arquivo dos mods confere com o hash fixado; nenhum arquivo a mais ou a menos', () => {
  const atuais = walk(MODS).filter((f) => f !== 'INTEGRITY.json').sort();
  assert.deepEqual(atuais, Object.keys(INT.files).sort(), 'conjunto de arquivos mudou: nova auditoria + JEV antes de atualizar INTEGRITY.json');
  for (const f of atuais) assert.equal(sha(path.join(MODS, f)), INT.files[f], 'hash mudou: ' + f);
});

for (const mod of Object.keys(PERMITIDAS)) {
  test(`MI2 ${mod}: validacao oficial passa e as chamadas estao na lista fechada`, () => {
    const v = validate(mod);
    assert.ok(v.ok, 'claude plugin validate falhou para ' + mod);
    for (const c of v.calls) {
      assert.ok(!PROIBIDAS.includes(c), `${mod} usa chamada proibida: ${c}`);
      assert.ok(PERMITIDAS[mod].includes(c), `${mod} usa chamada fora da lista fechada: ${c}`);
      if (c === 'http.fetch') assert.ok(REDE[mod], `${mod} nao pode fazer rede`);
    }
    assert.ok(!/tool\.check/.test(v.hooks), `${mod} registra o evento de checagem de permissao`);
  });
}

test('MI3 o mod jev so fala com o provedor: nenhum outro destino de rede no codigo', () => {
  const src = fs.readFileSync(path.join(MODS, 'jev', 'hooks', 'providers.ts'), 'utf8');
  const hosts = [...new Set([...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()))].sort();
  assert.deepEqual(hosts, ['ai-gateway.vercel.sh', 'api.cloudflare.com', 'api.typesafe.ai', 'openrouter.ai']);
  for (const m of ['jev-policy', 'token-weather', 'replay-theater', 'blast-radius']) {
    const code = walk(path.join(MODS, m)).filter((f) => /\.(mjs|js|ts|tsx)$/.test(f) && !/tests?\//.test(f)).map((f) => fs.readFileSync(path.join(MODS, m, f), 'utf8')).join('\n');
    assert.ok(!/https?:\/\/(?!code\.claude\.com|github\.com)/i.test(code.replace(/\/\/[^\n]*/g, '')), m + ' contem URL de rede no codigo');
  }
});

test('MI4 o mod local nunca aprova, nega ou responde no lugar da ferramenta', () => {
  const src = fs.readFileSync(path.join(MODS, 'jev-policy', 'hooks', 'register.mjs'), 'utf8');
  const hook = src.slice(src.indexOf("on('tool.call'"), src.indexOf("on('command.run', { command: 'jev-ledger' }"));
  assert.ok(!/\bdeny\b|result\s*:|\ballow\b|ui\.ask/.test(hook), 'o hook de tool.call do jev-policy deve apenas repassar');
  assert.ok((hook.match(/next\(e\)/g) || []).length >= 3, 'todo caminho do hook repassa com next(e)');
});

test('MI5 sem Dolphin/Ollama e sem chave gravada nos mods', () => {
  for (const f of walk(MODS)) {
    if (/\.(png|gif|jpg)$/i.test(f)) continue;
    const t = fs.readFileSync(path.join(MODS, f), 'utf8');
    assert.ok(!/\b(ollama|dolphin)\b/i.test(t), 'referencia a Dolphin/Ollama em ' + f);
    assert.ok(!/\bts-[A-Za-z0-9]{16,}\b|\bsk-[A-Za-z0-9_-]{20,}\b/.test(t), 'possivel chave em ' + f);
  }
});

test('MI6 os hooks do projeto (rotacao e gate do JEV) continuam declarados e a chave global de hooks nao esta desligada', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
  for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']) assert.ok(Array.isArray(s.hooks[ev]) && s.hooks[ev].length > 0, 'hook ausente: ' + ev);
  assert.notEqual(s.disableAllHooks, true);
});
