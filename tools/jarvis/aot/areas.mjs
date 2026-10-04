// JARVIS × INVICTUS AOT — the AOT areas JARVIS can observe (R2: read-only, served by JARVIS, AOT untouched).
// Labels are the real AOT page titles/brands (aot\public\*.html); paths are the real AOT routes (navigation links only).
// endpoints ⊂ ALLOWLIST (adapter.mjs); cadence_ms = the polling cadence of the real AOT page (data never refreshed faster).
export const AOT_BASE_DEFAULT = 'http://127.0.0.1:3600';

export const AREAS = Object.freeze([
  { id: 'COMMAND', button: 'JARVIS — COMMAND', label: '◆ INVICTUS 不可征服者AOT · Command', aot_path: '/', aot_tab: 'Command', endpoints: ['/state'], cadence_ms: 10000 },
  { id: 'DEEP_DIVE', button: 'JARVIS — DEEP DIVE', label: '◆ INVICTUS 不可征服者AOT · Deep Dive', aot_path: '/deep.html', aot_tab: 'Deep Dive', endpoints: ['/state', '/api/indicators'], cadence_ms: 10000 },
  { id: 'AUTOMATION', button: 'JARVIS — AUTOMAÇÃO', label: '◆ INVICTUS 不可征服者AOT · Automação', aot_path: '/auto.html', aot_tab: 'Automação', endpoints: ['/state'], cadence_ms: 10000 },
  { id: 'ROBOT', button: 'JARVIS — ROBÔ / ALFA OMEGA INVICTUS', label: 'INVICTUS 不可征服者AOTRobô · Alfa Omega INVICTUS 不可征服者', aot_path: '/robo.html', aot_tab: 'Robô', endpoints: ['/robo/state?sym=ES', '/robo/state?sym=NQ'], cadence_ms: 5000 },
  { id: 'HISTORY', button: 'JARVIS — HISTÓRICO', label: '◆ INVICTUS 不可征服者AOT · Histórico', aot_path: '/history.html', aot_tab: 'Histórico', endpoints: ['/history?days=2'], cadence_ms: 15000 },
]);
// ALFABOT SIGNAL is a sixth AOT page but not one of the five operator areas: it has its own JARVIS page (/aot/alfabot).
export const ALFABOT = Object.freeze({ id: 'ALFABOT', button: 'JARVIS — ALFABOT SIGNAL', label: 'INVICTUS AOT · ALFABOT SIGNAL', aot_path: '/alfabot-signal.html', aot_tab: 'ALFABOT SIGNAL', endpoints: ['/api/alfabot-signal', '/state'], cadence_ms: 5000 });

export const ALL_AREAS = Object.freeze([...AREAS, ALFABOT]);
export const areaById = (id) => ALL_AREAS.find((a) => a.id === String(id || '').toUpperCase()) || null;
