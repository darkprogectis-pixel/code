// INVICTUS JEV CODE — SHADOW COMPILE (somente leitura no NT8).
// Reproduz FORA do NT8 a compilacao do NinjaTrader.Custom: le o NinjaTrader.Custom.csproj real,
// referencia cada .cs existente pelo caminho absoluto (nada e copiado nem escrito em bin\Custom)
// e compila duas vezes numa pasta temporaria:
//   BASELINE = codigo atual do NT8
//   WITH_IJC = codigo atual do NT8 + nt8/AddOns/InvictusJevCode/*.cs
// Qualquer erro/aviso novo em WITH_IJC (delta) = colisao ou risco de compilacao do F5.
// Uso: node nt8/install/shadow-compile.mjs [--custom <dir>] [--out <dir>] [--as-is]
// --as-is: compila o csproj de --custom EXATAMENTE como esta (ex.: sandbox pos-03-install, que ja lista os arquivos IJC).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CUSTOM = resolve(opt('--custom', join(process.env.USERPROFILE || '', 'Documents', 'NinjaTrader 8', 'bin', 'Custom')));
const OUT = resolve(opt('--out', join(tmpdir(), 'ijc-shadow-compile')));
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IJC_DIR = join(REPO, 'nt8', 'AddOns', 'InvictusJevCode');

const src = readFileSync(join(CUSTOM, 'NinjaTrader.Custom.csproj'), 'utf8').replace(/^﻿/, '');
// payload = exatamente os arquivos do manifesto (arquivos adiados, ex. a boleta manual, nao entram)
const ijcFiles = JSON.parse(readFileSync(join(REPO, 'nt8', 'install', 'ijc-payload-manifest.json'), 'utf8')).files.map(f => join(IJC_DIR, f.name));

function build(name, extra) {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  let xml = src
    // Compile Include relativo -> absoluto em bin\Custom (somente leitura)
    .replace(/<Compile Include="([^"]+)"/g, (_, p) => `<Compile Include="${join(CUSTOM, decodeURIComponent(p))}"`)
    // saidas SEMPRE na pasta temporaria
    .replace(/<DocumentationFile>[^<]*<\/DocumentationFile>/, '<DocumentationFile>$(OutDir)NinjaTrader.Custom.xml</DocumentationFile>');
  // dotnet SDK 8 aceita ate C# 12; o NT8 usa o proprio Roslyn (13.0). O codigo IJC e C# 7.3 (check.csproj).
  xml = xml.replace(/<LangVersion>[^<]*<\/LangVersion>/, '<LangVersion>latest</LangVersion>');
  // AssemblyInfo.cs do NT8 ja fornece os atributos de assembly; o SDK nao deve gerar TargetFrameworkAttribute
  xml = xml.replace('<GenerateAssemblyInfo>false</GenerateAssemblyInfo>', '<GenerateAssemblyInfo>false</GenerateAssemblyInfo>\n    <GenerateTargetFrameworkAttribute>false</GenerateTargetFrameworkAttribute>');
  // o pacote Actipro so serve ao editor do NT8; nao e necessario para compilar o codigo do usuario
  xml = xml.replace(/<PackageReference Include="ActiproSoftware[^>]*\/>/, '');
  const add = extra.map(f => `    <Compile Include="${f}" />`).join('\n');
  xml = xml.replace(/<\/Project>\s*$/, `  <ItemGroup>\n${add}\n  </ItemGroup>\n</Project>\n`);
  writeFileSync(join(dir, 'NinjaTrader.Custom.csproj'), xml);
  const r = spawnSync('dotnet', ['build', join(dir, 'NinjaTrader.Custom.csproj'), '-nologo', '-c', 'Release', '-p:Platform=x64', '-clp:NoSummary', '-v', 'q'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const lines = (r.stdout + r.stderr).split(/\r?\n/);
  const norm = l => l.replace(/\s*\[[^\]]*\.csproj\]\s*$/, '').split(dir).join('<OUT>').trim();
  const pick = re => [...new Set(lines.filter(l => re.test(l)).map(norm))];
  return { name, exit: r.status, errors: pick(/: error /), warnings: pick(/: warning /) };
}

if (!existsSync(CUSTOM)) { console.error('Custom dir nao encontrado: ' + CUSTOM); process.exit(2); }
if (args.includes('--as-is')) {
  const r = build('as_is', []);
  const ijc = [...r.errors, ...r.warnings].filter(l => /InvictusJevCode/i.test(l));
  const listed = (src.match(/<Compile Include="AddOns\\InvictusJevCode\\[^"]+"/g) || []).length;
  const verdict = r.exit === 0 && r.errors.length === 0 && ijc.length === 0 && listed > 0 ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ custom_dir: CUSTOM, mode: 'as-is', ijc_entries_in_csproj: listed, exit: r.exit, errors: r.errors, warnings: r.warnings.length, ijc_diagnostics: ijc, verdict }, null, 2));
  process.exit(verdict === 'PASS' ? 0 : 1);
}
const base = build('baseline', []);
const withIjc = build('with_ijc', ijcFiles);
const newErr = withIjc.errors.filter(e => !base.errors.includes(e));
const newWarn = withIjc.warnings.filter(w => !base.warnings.includes(w));
const ijcWarn = withIjc.warnings.filter(w => /InvictusJevCode/i.test(w));
const report = {
  custom_dir: CUSTOM, out_dir: OUT, ijc_files: ijcFiles.length,
  baseline: { exit: base.exit, errors: base.errors.length, warnings: base.warnings.length },
  with_ijc: { exit: withIjc.exit, errors: withIjc.errors.length, warnings: withIjc.warnings.length },
  delta_errors: newErr, delta_warnings: newWarn, ijc_file_warnings: ijcWarn,
  verdict: base.exit === 0 && withIjc.exit === 0 && newErr.length === 0 && newWarn.length === 0 && ijcWarn.length === 0 ? 'PASS' : 'FAIL',
};
if (base.exit !== 0) report.baseline_errors = base.errors.slice(0, 30);
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
