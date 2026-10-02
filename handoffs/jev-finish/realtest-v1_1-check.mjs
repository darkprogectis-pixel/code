#!/usr/bin/env node
// /jev-finish V1.1 — real test check (live session). Read-only over the artifact and the loop state.
//   node handoffs/jev-finish/realtest-v1_1-check.mjs <artifact> <loop_id>
// PASS: artifact exists and cites the loop; the loop is ACTIVE, owned by this session; the PostToolUse hook recorded the write.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [artifact, loopId] = process.argv.slice(2);
const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'jev-finish', 'loops');
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); };
let text = '';
try { text = fs.readFileSync(artifact, 'utf8'); } catch (e) { errs.push(`artifact unreadable: ${e.message}`); }
ok(text.includes(`loop: ${loopId}`), 'artifact does not cite the loop');
const loop = JSON.parse(fs.readFileSync(path.join(dir, `${loopId}.json`), 'utf8'));
const sid = process.env.CLAUDE_CODE_SESSION_ID;
ok(loop.status === 'ACTIVE', `status ${loop.status}`);
ok(sid && loop.owner_session === sid, `owner ${loop.owner_session} != ${sid}`);
const base = path.basename(artifact).toLowerCase();
ok(loop.files_modified.some((f) => path.basename(f.path).toLowerCase() === base && f.allowlisted && f.session === sid), 'PostToolUse hook did not record the artifact write');
console.log(errs.length ? `REALTEST_V1_1 FAIL\n- ${errs.join('\n- ')}` : 'REALTEST_V1_1 PASS');
process.exit(errs.length ? 1 : 0);
