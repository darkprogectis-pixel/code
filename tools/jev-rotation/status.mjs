#!/usr/bin/env node
// Prints the rotation state of the last JEV session (or --session <id>).
// Exit code: 0 OK · 10 WARNING · 20 SOFT_STOP · 30 HARD_ROTATION · 40 CEILING_BREACH · 2 no state.
import fs from 'node:fs';
import path from 'node:path';
import { rank } from './controller.mjs';

const args = process.argv.slice(2);
const dir = process.env.JEV_ROTATION_STATE_DIR
  || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.claude'), 'jev-rotation');
const si = args.indexOf('--session');
const file = si >= 0 ? path.join(dir, 'state', `${args[si + 1]}.json`) : path.join(dir, 'last-session.json');
let st;
try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.log(`JEV_ROTATION: no state (${file})`); process.exit(2); }
console.log(`JEV_ROTATION session=${st.session_id} level=${st.level} last_tokens=${st.last_tokens ?? 'UNKNOWN'} max_tokens=${st.max_tokens} `
  + `rotation_required=${st.rotation_required} handoff_fresh=${st.handoff_fresh}${st.snapshot ? ` snapshot=${st.snapshot}` : ''}`);
if (st.rotation_required) console.log('ROTATE_SESSION_NOW');
process.exit(rank(st.level) * 10);
