#!/usr/bin/env node
// Prints the rotation state of the last JEV session (or --session <id>) and its lineage.
// Exit code: 0 OK · 5 PREPARE · 10 WARNING · 20 SOFT_STOP · 30 HARD_ROTATION · 40 CEILING_BREACH · 2 no state.
// A rotated session (successor spawned automatically) prints ROTATED_READ_ONLY and its successor.
import fs from 'node:fs';
import path from 'node:path';

const EXIT = { OK: 0, PREPARE: 5, WARNING: 10, SOFT_STOP: 20, HARD_ROTATION: 30, CEILING_BREACH: 40 };
const args = process.argv.slice(2);
const dir = process.env.JEV_ROTATION_STATE_DIR
  || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.claude'), 'jev-rotation');
const si = args.indexOf('--session');
const file = si >= 0 ? path.join(dir, 'state', `${args[si + 1]}.json`) : path.join(dir, 'last-session.json');
let st;
try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.log(`JEV_ROTATION: no state (${file})`); process.exit(2); }
let lock = null;
try { lock = JSON.parse(fs.readFileSync(path.join(dir, 'rotation', `${st.session_id}.lock`), 'utf8')); } catch { /* not rotated */ }
console.log(`JEV_ROTATION session=${st.session_id} level=${st.level} last_tokens=${st.last_tokens ?? 'UNKNOWN'} max_tokens=${st.max_tokens} `
  + `rotation_required=${st.rotation_required} handoff_fresh=${st.handoff_fresh}${st.snapshot ? ` snapshot=${st.snapshot}` : ''}`);
if (st.predecessor) console.log(`PREDECESSOR ${st.predecessor.from} (rotation #${st.predecessor.depth}, root ${st.predecessor.root}) started_at=${st.predecessor.started_at || 'NOT_STARTED'}`);
if (lock) {
  console.log(`ROTATED_READ_ONLY successor=${lock.successor} trigger=${lock.trigger} spawn=${lock.spawn?.mode || '?'} `
    + `successor_started=${lock.successor_started_at || 'PENDING'}${lock.brief ? ` brief=${lock.brief}` : ''}`);
} else if (st.rotation_required) {
  console.log('ROTATE_SESSION_NOW (automatic spawn not confirmed — see lineage.jsonl)');
}
process.exit(EXIT[st.level] ?? 0);
