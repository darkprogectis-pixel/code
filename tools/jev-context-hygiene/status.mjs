#!/usr/bin/env node
// JEV Token Hygiene V1 — short per-session summary of the tool-output ledger.
//   node tools/jev-token-hygiene/status.mjs [session-id-prefix]   (default: most recent session)
import fs from 'node:fs';
import path from 'node:path';
import { baseDir, CFG } from './hook.mjs';

const dir = path.join(baseDir(), 'ledger');
let files = [];
try {
  files = fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson'))
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
} catch { /* no ledger yet */ }
const want = process.argv[2];
const pick = want ? files.find((x) => x.f.startsWith(want)) : files[0];
if (!pick) { console.log(JSON.stringify({ token_hygiene: 'NO_LEDGER', dir })); process.exit(0); }
const rows = fs.readFileSync(path.join(dir, pick.f), 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const by = {};
for (const r of rows) {
  const b = (by[r.tool] ||= { calls: 0, chars: 0, returned_chars: 0, capped: 0 });
  b.calls++; b.chars += r.chars; b.returned_chars += r.returned_chars ?? r.chars;
  if (r.action === 'CAPPED') b.capped++;
}
console.log(JSON.stringify({
  token_hygiene: 'OK',
  session: pick.f.replace('.ndjson', ''),
  cap_chars: CFG.output_cap_chars,
  tool_calls: rows.length,
  raw_chars: rows.reduce((a, r) => a + r.chars, 0),
  returned_chars: rows.reduce((a, r) => a + (r.returned_chars ?? r.chars), 0),
  capped: rows.filter((r) => r.action === 'CAPPED').length,
  max_returned_chars: rows.reduce((a, r) => Math.max(a, r.returned_chars ?? r.chars), 0),
  by_tool: by,
}, null, 1));
