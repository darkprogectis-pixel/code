// Shadow compile (somente leitura no NT8): compila o NinjaTrader.Custom real fora do NT8 duas vezes —
// BASELINE (codigo atual) e CANDIDATE (igual, trocando so AddOns\AlfaOmegaBridge.cs pelo candidato).
// PASS = candidato compila com exit 0, 0 erros, e nenhum erro/aviso novo em relacao ao baseline.
// Mesmo metodo de nt8/install/shadow-compile.mjs. Nada e escrito em bin\Custom.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const CUSTOM = join(process.env.USERPROFILE || '', 'Documents', 'NinjaTrader 8', 'bin', 'Custom');
const CAND = resolve(here, '..', 'candidate', 'AlfaOmegaBridge.cs'), CAND_SS = resolve(here, '..', 'candidate', 'AlfaOmegaSharedState.cs');
const OUT = join(tmpdir(), 'gcsi-eqv-shadow-compile');
if (!existsSync(CUSTOM) || !existsSync(CAND) || !existsSync(CAND_SS)) { console.error('missing dir/file'); process.exit(2); }
const src = readFileSync(join(CUSTOM, 'NinjaTrader.Custom.csproj'), 'utf8').replace(/^﻿/, '');
function build(name, swap) {
  const dir = join(OUT, name); mkdirSync(dir, { recursive: true });
  let swapped = 0;
  let xml = src.replace(/<Compile Include="([^"]+)"/g, (_, p) => {
    const rel = decodeURIComponent(p);
    if (swap && /^AddOns[\\/]AlfaOmegaBridge\.cs$/i.test(rel)) { swapped++; return `<Compile Include="${CAND}"`; }
    if (swap && /^Indicators[\\/]TTW_DarkProjects[\\/]AlfaOmegaSharedState\.cs$/i.test(rel)) { swapped++; return `<Compile Include="${CAND_SS}"`; }
    return `<Compile Include="${join(CUSTOM, rel)}"`;
  }).replace(/<DocumentationFile>[^<]*<\/DocumentationFile>/, '<DocumentationFile>$(OutDir)NinjaTrader.Custom.xml</DocumentationFile>');
  xml = xml.replace(/<LangVersion>[^<]*<\/LangVersion>/, '<LangVersion>latest</LangVersion>');
  xml = xml.replace('<GenerateAssemblyInfo>false</GenerateAssemblyInfo>', '<GenerateAssemblyInfo>false</GenerateAssemblyInfo>\n    <GenerateTargetFrameworkAttribute>false</GenerateTargetFrameworkAttribute>');
  xml = xml.replace(/<PackageReference Include="ActiproSoftware[^>]*\/>/, '');
  writeFileSync(join(dir, 'NinjaTrader.Custom.csproj'), xml);
  const r = spawnSync('dotnet', ['build', join(dir, 'NinjaTrader.Custom.csproj'), '-nologo', '-c', 'Release', '-p:Platform=x64', '-clp:NoSummary', '-v', 'q'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const lines = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/);
  const norm = l => l.replace(/\s*\[[^\]]*\.csproj\]\s*$/, '').split(dir).join('<OUT>').split(CAND).join(join(CUSTOM, 'AddOns', 'AlfaOmegaBridge.cs')).split(CAND_SS).join(join(CUSTOM, 'Indicators', 'TTW_DarkProjects', 'AlfaOmegaSharedState.cs')).replace(/\(\d+,\d+\)/, '(L)').trim();
  const pick = re => [...new Set(lines.filter(l => re.test(l)).map(norm))];
  return { name, exit: r.status, swapped, errors: pick(/: error /), warnings: pick(/: warning /), spawnError: r.error ? String(r.error) : null };
}
const base = build('baseline', false), cand = build('candidate', true);
const newErr = cand.errors.filter(e => !base.errors.includes(e)), newWarn = cand.warnings.filter(w => !base.warnings.includes(w));
const verdict = base.exit === 0 && cand.exit === 0 && cand.swapped === 2 && cand.errors.length === 0 && newErr.length === 0 && newWarn.length === 0 ? 'PASS' : 'FAIL';
console.log(JSON.stringify({ custom_dir: CUSTOM, candidate: CAND, baseline: { exit: base.exit, errors: base.errors.length, warnings: base.warnings.length, spawnError: base.spawnError }, candidate_build: { exit: cand.exit, swapped: cand.swapped, errors: cand.errors.slice(0, 20), warnings: cand.warnings.length }, new_errors: newErr.slice(0, 20), new_warnings: newWarn.slice(0, 20), verdict }, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
