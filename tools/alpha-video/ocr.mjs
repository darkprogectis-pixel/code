// Alpha video knowledge: on-screen text from extracted frames via the already installed Tesseract (explicit path, args array,
// no shell). OCR text is UNTRUSTED visual evidence: it is stored and classified, never executed or followed.
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export const TESSERACT_DEFAULT = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';

export function ocrStatus(bin = TESSERACT_DEFAULT) { return { available: fs.existsSync(bin), bin }; }

export function ocrFrame(image, { bin = TESSERACT_DEFAULT, lang = 'eng', timeout_ms = 30000 } = {}) {
  return new Promise((resolve) => {
    if (!fs.existsSync(bin)) return resolve({ text: '', error: 'OCR_UNAVAILABLE' });
    const p = spawn(bin, [image, 'stdout', '-l', lang, '--psm', '6'], { shell: false, windowsHide: true });
    let out = '', err = ''; const t = setTimeout(() => p.kill(), timeout_ms);
    p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => { clearTimeout(t); resolve({ text: '', error: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve(code === 0 ? { text: out.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l.length >= 3).join('\n') } : { text: '', error: `tesseract exit ${code}: ${err.slice(0, 200)}` }); });
  });
}
