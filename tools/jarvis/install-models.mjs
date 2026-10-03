// JARVIS model installer: downloads ONLY the selected models from the official k2-fsa/sherpa-onnx GitHub releases into
// %LOCALAPPDATA%\jev-jarvis\models (outside the repo), verifies the publisher SHA-256 when the release publishes one,
// records url/version/sha256/license/attribution in models/manifest.json and mirrors it to config/jarvis-models.lock.json.
// Usage: node tools/jarvis/install-models.mjs [--only id,id] [--check]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MODELS_DIR = process.env.JEV_JARVIS_MODELS || path.join(process.env.LOCALAPPDATA || path.join(REPO, 'var'), 'jev-jarvis', 'models');
const REL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

// sha256 = publisher digest from the GitHub release asset API (null ⇒ not published; computed digest is recorded as TOFU).
export const CATALOG = [
  { id: 'silero-vad', kind: 'vad', url: `${REL}/asr-models/silero_vad.onnx`, file: 'silero_vad.onnx', sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
    license: 'MIT (snakers4/silero-vad)', commercial: true, attribution: 'Silero Team' },
  { id: 'whisper-small', kind: 'stt', url: `${REL}/asr-models/sherpa-onnx-whisper-small.tar.bz2`, dir: 'sherpa-onnx-whisper-small', sha256: null,
    license: 'MIT (openai/whisper code and weights)', commercial: true, attribution: 'OpenAI Whisper' },
  { id: 'whisper-base', kind: 'stt', url: `${REL}/asr-models/sherpa-onnx-whisper-base.tar.bz2`, dir: 'sherpa-onnx-whisper-base', sha256: null,
    license: 'MIT (openai/whisper code and weights)', commercial: true, attribution: 'OpenAI Whisper' },
  { id: 'piper-faber', kind: 'tts', url: `${REL}/tts-models/vits-piper-pt_BR-faber-medium.tar.bz2`, dir: 'vits-piper-pt_BR-faber-medium', sha256: '7add3f923ad6bc25ca8a192805fd1a64d1b3893e4611c4a9719545a825039a83',
    license: 'see MODEL_CARD (piper voice); runtime sherpa-onnx Apache-2.0; espeak-ng-data GPL-3.0 (local use, not redistributed)', commercial: 'PER_MODEL_CARD', attribution: 'Piper voice pt_BR faber' },
  { id: 'piper-jeff', kind: 'tts', url: `${REL}/tts-models/vits-piper-pt_BR-jeff-medium.tar.bz2`, dir: 'vits-piper-pt_BR-jeff-medium', sha256: 'da4c870fc7b20600c74261b3e1dd1c816da2ce063e18c46e1f2cd86dea88f3f0',
    license: 'see MODEL_CARD (piper voice); espeak-ng-data GPL-3.0 (local use)', commercial: 'PER_MODEL_CARD', attribution: 'Piper voice pt_BR jeff' },
  { id: 'kokoro-int8', kind: 'tts', url: `${REL}/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2`, dir: 'kokoro-int8-multi-lang-v1_0', sha256: '4c3052abaa60943a341f193888cf6abd68787dae6ab8ae5c925a706caa247e4e',
    license: 'Apache-2.0 (hexgrad/Kokoro-82M weights); espeak-ng-data GPL-3.0 (local use, not redistributed)', commercial: true, attribution: 'hexgrad Kokoro-82M' },
];

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const h = crypto.createHash('sha256'), out = fs.createWriteStream(dest + '.part');
  for await (const chunk of res.body) { h.update(chunk); if (!out.write(chunk)) await new Promise((r) => out.once('drain', r)); }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  fs.renameSync(dest + '.part', dest);
  return h.digest('hex');
}
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const fileSha = (p) => new Promise((r, j) => { const h = crypto.createHash('sha256'); fs.createReadStream(p).on('data', (c) => h.update(c)).on('end', () => r(h.digest('hex'))).on('error', j); });
const readCard = (d) => { for (const n of ['MODEL_CARD', 'README.md', 'LICENSE']) { const p = path.join(d, n); if (fs.existsSync(p)) return { file: n, text: fs.readFileSync(p, 'utf8').slice(0, 4000) }; } return null; };

export async function install({ only = null, log = console.log } = {}) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const mfPath = path.join(MODELS_DIR, 'manifest.json');
  const mf = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath, 'utf8')) : { schema: 'jarvis-models/v1', models: {} };
  for (const m of CATALOG) {
    if (only && !only.includes(m.id)) continue;
    const target = path.join(MODELS_DIR, m.file || m.dir);
    if (mf.models[m.id]?.installed && fs.existsSync(target)) { log(`skip ${m.id} (installed)`); continue; }
    const name = path.basename(new URL(m.url).pathname), tmp = path.join(MODELS_DIR, name);
    log(`download ${m.id} ${m.url}`);
    const sha = fs.existsSync(tmp) ? await fileSha(tmp) : await download(m.url, tmp);
    if (m.sha256 && sha !== m.sha256) { fs.rmSync(tmp, { force: true }); throw new Error(`SHA-256 mismatch ${m.id}: ${sha} ≠ ${m.sha256}`); }
    if (name.endsWith('.tar.bz2')) { execFileSync(TAR, ['-xjf', tmp, '-C', MODELS_DIR], { stdio: 'ignore' }); fs.rmSync(tmp, { force: true }); }
    const card = m.dir ? readCard(target) : null;
    mf.models[m.id] = { id: m.id, kind: m.kind, url: m.url, path: path.relative(MODELS_DIR, target), sha256: sha, sha256_source: m.sha256 ? 'PUBLISHER_VERIFIED' : 'TOFU_COMPUTED',
      license: m.license, commercial: m.commercial, attribution: m.attribution, model_card: card ? { file: card.file, license_line: (card.text.match(/licen[sc]e[^\n]*\n?[^\n]*/i) || [null])[0] } : null,
      installed: true, installed_at: new Date().toISOString() };
    fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2));
    log(`ok ${m.id} sha256=${sha} (${mf.models[m.id].sha256_source})`);
  }
  const lock = { schema: 'jarvis-models-lock/v1', models_dir: '%LOCALAPPDATA%\\jev-jarvis\\models', runtime: 'sherpa-onnx-node (Apache-2.0)', models: Object.values(mf.models).map(({ installed_at, ...x }) => x) };
  fs.writeFileSync(path.join(REPO, 'config', 'jarvis-models.lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return mf;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--only');
  install({ only: i > 0 ? process.argv[i + 1].split(',') : null }).then(() => console.log('done', MODELS_DIR), (e) => { console.error(e.message); process.exit(1); });
}
