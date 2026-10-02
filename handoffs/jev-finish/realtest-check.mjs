#!/usr/bin/env node
// /jev-finish V1 — real test checks (Fase 6). Read-only over the loop state.
//   node handoffs/jev-finish/realtest-check.mjs persistence <loop_id> <origin_sid>
//   node handoffs/jev-finish/realtest-check.mjs successor  <loop_id> <origin_sid>   (run inside the successor)
// Exit 0 = PASS, 1 = FAIL (reasons printed).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [mode, loopId, origin] = process.argv.slice(2);
const cfgDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const dir = path.join(cfgDir, 'jev-finish', 'loops');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const loop = read(path.join(dir, `${loopId}.json`));
const events = fs.readFileSync(path.join(dir, `${loopId}.log.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); };

if (mode === 'persistence') {
  ok(loop.status === 'ACTIVE', `status ${loop.status}`);
  ok(loop.objective && loop.objective.includes('jev-finish-realtest.txt'), 'objective not persisted');
  ok(loop.tests['artifact-exists']?.result === 'PASS', 'artifact-exists PASS not persisted');
  ok(loop.files_modified.some((f) => /jev-finish-realtest\.txt$/.test(f.path) && f.session === origin), 'PostToolUse hook did not persist the artifact write');
  ok(events.some((e) => e.event === 'START' && e.session === origin), 'START event missing');
  ok(fs.existsSync(path.join(dir, `${loopId}.json.prev`)), 'no .prev snapshot');
  const ptr = read(path.join(cfgDir, 'jev-finish', 'active.json'));
  ok(ptr.loop_id === loopId, `active.json -> ${ptr.loop_id}`);
} else if (mode === 'successor') {
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  ok(sid && sid !== origin, `not running in a successor (sid ${sid})`);
  ok(loop.status === 'ACTIVE', `status ${loop.status}`);
  ok(loop.owner_session === sid, `owner ${loop.owner_session} != ${sid}`);
  ok(loop.lineage.some((x) => x.session === sid && x.via === 'rotation' && x.from === origin), `lineage lacks rotation ${origin} -> ${sid}: ${JSON.stringify(loop.lineage)}`);
  ok(loop.tests['artifact-exists']?.result === 'PASS' && loop.tests['persistence']?.result === 'PASS', 'predecessor tests not carried over');
  ok(events.some((e) => e.event === 'CONTEXT_INJECTED' && e.session === sid), 'SessionStart hook did not inject the loop into the successor');
  const lock = read(path.join(cfgDir, 'jev-rotation', 'rotation', `${origin}.lock`));
  ok(lock.successor === sid, `rotation lock successor ${lock.successor} != ${sid}`);
} else { console.error('usage: persistence|successor <loop_id> <origin_sid>'); process.exit(2); }

console.log(errs.length ? `REALTEST_${mode.toUpperCase()} FAIL\n- ${errs.join('\n- ')}` : `REALTEST_${mode.toUpperCase()} PASS`);
process.exit(errs.length ? 1 : 0);
