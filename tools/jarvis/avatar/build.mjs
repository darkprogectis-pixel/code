#!/usr/bin/env node
// Builds the JARVIS floating avatar with the Windows built-in .NET Framework csc (no SDK, no npm/NuGet dependency).
//   node tools/jarvis/avatar/build.mjs [--force] [--run]      ⇒ var/jarvis/avatar/JarvisAvatar.exe (rebuilt only when the source hash changes)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
export const SRC = [path.join(HERE, 'JarvisAvatar.cs'), path.join(HERE, 'app.manifest')];
export const OUT_DIR = path.join(REPO, 'var', 'jarvis', 'avatar');
export const EXE = path.join(OUT_DIR, 'JarvisAvatar.exe');
const FW = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
export const CSC = path.join(FW, 'csc.exe');
const REFS = ['WPF\\PresentationFramework.dll', 'WPF\\PresentationCore.dll', 'WPF\\WindowsBase.dll', 'System.Xaml.dll', 'System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll'];

export const sourceHash = () => crypto.createHash('sha256').update(Buffer.concat(SRC.map((f) => fs.readFileSync(f)))).digest('hex');

// ⇒ {exe, built:boolean, ms, hash}
export function build({ force = false } = {}) {
  if (process.platform !== 'win32') throw new Error('AVATAR_UNSUPPORTED_PLATFORM (Windows only)');
  if (!fs.existsSync(CSC)) throw new Error(`AVATAR_BUILD_UNAVAILABLE (csc not found: ${CSC})`);
  const hash = sourceHash(), meta = path.join(OUT_DIR, 'build.json');
  try { const m = JSON.parse(fs.readFileSync(meta, 'utf8')); if (!force && m.hash === hash && fs.existsSync(EXE)) return { exe: EXE, built: false, ms: 0, hash }; } catch { /* rebuild */ }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();
  const args = ['/nologo', '/target:winexe', '/optimize+', '/platform:anycpu', `/win32manifest:${SRC[1]}`, `/out:${EXE}`, ...REFS.map((r) => `/reference:${path.join(FW, r)}`), SRC[0]];
  try { execFileSync(CSC, args, { stdio: 'pipe', windowsHide: true }); }
  catch (e) { throw new Error(`AVATAR_BUILD_FAILED\n${String(e.stdout || '')}${String(e.stderr || '')}`.slice(0, 4000)); }
  const ms = Date.now() - t0;
  fs.writeFileSync(meta, JSON.stringify({ hash, at: new Date().toISOString(), ms }));
  return { exe: EXE, built: true, ms, hash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = build({ force: process.argv.includes('--force') });
    console.log(JSON.stringify(r));
    if (process.argv.includes('--run')) spawn(r.exe, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  } catch (e) { console.error(e.message); process.exit(1); }
}
