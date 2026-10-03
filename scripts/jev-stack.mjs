#!/usr/bin/env node
// JEV local stack (SHADOW / READ-ONLY): JEV Observability dashboard :3593 + Alpha service (5 specialists + Fusion + JEV review)
// + JARVIS :3594. Everything binds 127.0.0.1; nothing here sends orders or touches NT8/AOT/INVICTUS.
//   node scripts/jev-stack.mjs start|stop|status
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(REPO, 'var', 'stack');
export const SERVICES = [
  { name: 'jev-obs', args: ['tools/jev-obs/server.mjs'], health: 'http://127.0.0.1:3593/api/health' },
  { name: 'alpha', args: ['src/alpha/service.mjs'], health: null },
  { name: 'jarvis', args: ['tools/jarvis/server.mjs'], health: 'http://127.0.0.1:3594/api/health' },
];
const pidFile = (n) => path.join(DIR, `${n}.pid`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readPid = (n) => { try { return Number(fs.readFileSync(pidFile(n), 'utf8')); } catch { return null; } };
const get = (url) => new Promise((res) => { const r = http.get(url, { timeout: 1500 }, (x) => { let b = ''; x.on('data', (d) => (b += d)); x.on('end', () => res({ status: x.statusCode, body: b })); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });

export async function status() {
  const out = {};
  for (const s of SERVICES) {
    const pid = readPid(s.name), up = pid && alive(pid);
    const h = s.health ? await get(s.health) : null;
    out[s.name] = { pid: up ? pid : null, running: !!up, health: s.health ? (h?.status === 200 ? 'OK' : 'DOWN') : up ? 'PROCESS_UP' : 'DOWN' };
  }
  try { const a = JSON.parse(fs.readFileSync(path.join(REPO, 'var', 'alpha', 'service.json'), 'utf8')); out.alpha.heartbeat_age_ms = Date.now() - Date.parse(a.heartbeat ?? a.last_at ?? 0); } catch { /* no heartbeat yet */ }
  return out;
}
export async function start() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const s of SERVICES) {
    const pid = readPid(s.name);
    if (pid && alive(pid)) { console.log(`${s.name}: já rodando (pid ${pid})`); continue; }
    if (s.health && (await get(s.health))?.status === 200) { console.log(`${s.name}: porta já atendida por outro processo — não iniciado`); continue; }
    if (s.name === 'alpha') { try { const a = JSON.parse(fs.readFileSync(path.join(REPO, 'var', 'alpha', 'service.json'), 'utf8')); if (alive(a.pid) && Date.now() - Date.parse(a.heartbeat) < 120000) { fs.writeFileSync(pidFile(s.name), String(a.pid)); console.log(`alpha: já rodando fora do stack (pid ${a.pid}) — adotado`); continue; } } catch { /* none */ } }
    const log = fs.openSync(path.join(DIR, `${s.name}.log`), 'a');
    const p = spawn(process.execPath, s.args, { cwd: REPO, detached: true, stdio: ['ignore', log, log], windowsHide: true });
    p.unref(); fs.writeFileSync(pidFile(s.name), String(p.pid)); console.log(`${s.name}: iniciado pid ${p.pid}`);
  }
  for (let i = 0; i < 20; i++) { const st = await status(); if (SERVICES.every((s) => !s.health || st[s.name].health === 'OK')) break; await new Promise((r) => setTimeout(r, 500)); }
  const st = await status(); console.log(JSON.stringify(st, null, 2));
  console.log('Dashboard: http://127.0.0.1:3593/#ALPHA · http://127.0.0.1:3593/#JARVIS · HUD JARVIS: http://127.0.0.1:3594/');
  return st;
}
export async function stop() {
  for (const s of SERVICES) {
    const pid = readPid(s.name);
    if (pid && alive(pid)) {
      try { if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
      console.log(`${s.name}: parado (pid ${pid})`);
    } else console.log(`${s.name}: não estava rodando`);
    fs.rmSync(pidFile(s.name), { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const run = { start, stop, status: async () => console.log(JSON.stringify(await status(), null, 2)) }[cmd];
  if (!run) { console.error('uso: node scripts/jev-stack.mjs start|stop|status'); process.exit(2); }
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
