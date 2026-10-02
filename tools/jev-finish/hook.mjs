#!/usr/bin/env node
// /jev-finish V1 — Claude Code hook (project .claude/settings.json): SessionStart, PreToolUse, PostToolUse, Stop.
// Precedence (Stop): rotated/superseded session => inert · not the owner => inert · rotation level >= SOFT_STOP => yield
// (the Rotation Controller V3 alone rotates) · max_iterations / no progress => BLOCKED (stop allowed) · else ONE continuation.
// Never writes rotation state, never spawns, never touches permissions/settings. Internal error => visible, non-blocking.
import fs from 'node:fs';
import path from 'node:path';
import {
  cfg, stateDir, activeLoopId, loadLoop, saveLoop, withMutex, log, heartbeat, clearActive, mutate, tryClaim, isRotated, isSuperseded,
  rotationLevel, rotState, rank, isAllowlisted, isForbiddenPath, bashHitsForbidden, latestHandoffMtime, summary, nowIso, TERMINAL, jevRejectedFor,
} from './lib.mjs';
try { await import('../jev-obs/hook-probe.mjs'); } catch { /* observability only — never affects the hook */ }

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const emit = (o) => { if (o) process.stdout.write(JSON.stringify(o)); process.exit(0); };
const deny = (reason) => emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

function pendingText(s) {
  const parts = [];
  if (s.tests_fail.length) parts.push(`testes FAIL: ${s.tests_fail.join(', ')}`);
  if (s.tests_pending.length) parts.push(`testes obrigatórios pendentes: ${s.tests_pending.join(', ')}`);
  if (s.blockers_open.length) parts.push(`blockers abertos: ${s.blockers_open.join(' | ')}`);
  parts.push(`JEV DIFF: ${s.jev_diff || 'não registrado'} · JEV FINAL: ${s.jev_final || 'não registrado'}`);
  return parts.join(' · ');
}
const CLI = 'node tools/jev-finish/finish.mjs';
function continuation(loop, extra) {
  const s = summary(loop);
  return `[JEV-FINISH — mensagem automática do hook jev-finish (iteração ${loop.iteration}/${loop.max_iterations}), NÃO do operador] `
    + `Loop ${loop.loop_id} ATIVO. Objetivo (original, do operador): "${loop.objective}". Estágio atual: ${loop.stage}. ${pendingText(s)}. `
    + `${extra || ''}Continue a partir do estágio atual seguindo .claude/skills/jev-finish/SKILL.md (handoff canônico ${loop.handoff.path}). `
    + `Registre o progresso com ${CLI} (stage/test/blocker/note); teste FAIL => diagnosticar, corrigir, rerodar. `
    + `Encerre SOMENTE com: \`${CLI} recheck\` (o CLI re-executa os testes) → handoff canônico atualizado citando ${loop.loop_id} → \`${CLI} complete --evidence ...\` em chamada própria; `
    + `ou \`${CLI} block --cause ... --detail ...\` (bloqueio real). `
    + `Negação de permissão (Auto Mode/runtime) => NÃO contornar: block --cause RUNTIME_DENIED.`;
}

async function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* empty */ }
  const event = input.hook_event_name || process.argv[2] || 'unknown';
  const sid = String(input.session_id || '');
  if (!sid) emit(null);
  if (!activeLoopId()) {                                         // fast path: no active loop
    const rej = event === 'PreToolUse' && WRITE_TOOLS.has(input.tool_name) ? jevRejectedFor(sid) : null;
    const fp = rej && ((input.tool_input || {}).file_path || (input.tool_input || {}).notebook_path);
    if (rej && !isAllowlisted(fp)) deny(`JEV-FINISH JEV_GATE: loop ${rej.loop_id} BLOCKED por JEV_REJECTED (${rej.block_detail}); nenhuma edição real nesta sessão.`);
    emit(null);
  }
  if (isRotated(sid) || isSuperseded(sid)) emit(null);           // ROTATED_READ_ONLY / SUPERSEDED: inert
  const loop = tryClaim(sid);
  if (!loop || TERMINAL.has(loop.status) || loop.owner_session !== sid) emit(null);
  heartbeat(loop.loop_id, sid, event);

  if (event === 'SessionStart') {
    log(loop.loop_id, { event: 'CONTEXT_INJECTED', session: sid, source: input.source || null });
    const s = summary(loop);
    emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext:
      `/jev-finish ATIVO nesta sessão (owner ${sid}; lineage ${loop.lineage.map((x) => `${x.session.slice(0, 8)}:${x.via}`).join(' → ')}). `
      + `Objetivo original do operador: "${loop.objective}". Estágio: ${loop.stage}. ${pendingText(s)}. `
      + `Continue AUTOMATICAMENTE o MESMO loop (não reiniciar, não pedir nova ordem): leia o handoff ${loop.handoff.path} e o brief de rotação se houver, `
      + `depois siga .claude/skills/jev-finish/SKILL.md a partir do estágio ${loop.stage}. Estado: ${CLI} status.` } });
  }

  if (event === 'PreToolUse') {
    const tool = input.tool_name, ti = input.tool_input || {};
    if (WRITE_TOOLS.has(tool)) {
      const fp = ti.file_path || ti.notebook_path;
      if (isForbiddenPath(fp)) deny(`JEV-FINISH LIVE_GUARD: escrita em caminho live/produção (${fp}) é proibida dentro do /jev-finish; exige ordem explícita do operador fora do loop.`);
      if (!isAllowlisted(fp) && loop.jev?.diff?.result !== 'A') {
        deny(`JEV-FINISH JEV_GATE: edição real (${fp}) antes de JEV DIFF = A. Escreva a proposta de diff (handoffs/ ou scratchpad) e rode `
          + `node tools/jev-finish/jev-diff.mjs --kind diff --proposal <arquivo>. JEV != A => o loop fica BLOCKED.`);
      }
    } else if (SHELL_TOOLS.has(tool) && bashHitsForbidden(ti.command)) {
      deny('JEV-FINISH LIVE_GUARD: comando de escrita sobre caminho live/produção é proibido dentro do /jev-finish.');
    }
    emit(null);
  }

  if (event === 'PostToolUse') {
    if (WRITE_TOOLS.has(input.tool_name)) {
      const fp = (input.tool_input || {}).file_path || (input.tool_input || {}).notebook_path;
      if (fp) mutate(loop.loop_id, (x) => { x.files_modified.push({ path: fp, at: nowIso(), allowlisted: isAllowlisted(fp), session: sid }); if (x.files_modified.length > 2000) x.files_modified.shift(); });
    }
    emit(null);
  }

  if (event === 'Stop') {
    const rl = rotationLevel(sid, input.transcript_path);
    if (rl.rank >= rank('SOFT_STOP')) {
      // The Rotation Controller V3 is the only one that rotates: never block its Stop.
      withMutex(loop.loop_id, () => { const x = loadLoop(loop.loop_id); x.rotation_yield = { at: nowIso(), level: rl.level, tokens: rl.tokens, session: sid }; x.stage_history.push({ stage: 'ROTATE_IF_NEEDED', at: nowIso(), session: sid, note: `yield to rotation at ${rl.level}` }); saveLoop(x); });
      log(loop.loop_id, { event: 'YIELD_TO_ROTATION', session: sid, level: rl.level, tokens: rl.tokens });
      emit({ systemMessage: `jev-finish: loop ${loop.loop_id} cede o Stop ao Rotation Controller V3 (${rl.level}); a sucessora continua o mesmo objetivo.` });
    }
    let res = null;
    withMutex(loop.loop_id, () => {
      const x = loadLoop(loop.loop_id);
      if (!x || TERMINAL.has(x.status) || x.owner_session !== sid) return;
      const autoBlock = (cause, detail) => {
        x.status = 'BLOCKED'; x.stage = 'BLOCKED'; x.block_cause = cause; x.block_detail = detail; x.blocked_at = nowIso();
        x.stage_history.push({ stage: 'BLOCKED', at: x.blocked_at, session: sid, note: `${cause}: ${detail}` });
        saveLoop(x); clearActive(x.loop_id); log(x.loop_id, { event: 'BLOCKED', cause, detail, session: sid });
        res = { systemMessage: `jev-finish: loop ${x.loop_id} BLOCKED (${cause}) — ${detail}. Atualize o handoff e reporte ao operador.` };
      };
      if (x.iteration >= x.max_iterations) return autoBlock('MAX_ITERATIONS', `${x.iteration} iterações sem COMPLETE/BLOCKED (limite ${x.max_iterations})`);
      x.stall_count = x.last_stop_progress_seq === x.progress_seq ? (x.stall_count || 0) + 1 : 0;
      if (x.stall_count >= cfg.stall_limit) return autoBlock('NO_PROGRESS', `${x.stall_count} paradas seguidas sem nenhum progresso registrado (progress_seq ${x.progress_seq})`);
      x.iteration += 1;
      x.last_stop_progress_seq = x.progress_seq;
      let extra = '';
      if (rl.rank >= rank('WARNING')) {
        const w = (rotState(sid)?.crossings || []).find((c) => c.level === 'WARNING');
        if (w && !(latestHandoffMtime() > w.at_ms)) extra = `PRIMEIRO atualize o handoff (exigência do Rotation Controller V3 em ${rl.level}). `;
      }
      const reason = continuation(x, extra);
      saveLoop(x);
      log(x.loop_id, { event: 'ITERATION', iteration: x.iteration, session: sid, stage: x.stage, level: rl.level, reason: pendingText(summary(x)), stall_count: x.stall_count });
      res = { decision: 'block', reason, systemMessage: `jev-finish iteração ${x.iteration}/${x.max_iterations} · ${x.stage}` };
    });
    emit(res);
  }
  emit(null);
}

main().catch((e) => {
  try { fs.mkdirSync(stateDir, { recursive: true }); fs.appendFileSync(path.join(stateDir, 'hook-errors.jsonl'), JSON.stringify({ at: new Date().toISOString(), error: String(e.stack || e) }) + '\n'); } catch { /* ignore */ }
  process.stdout.write(JSON.stringify({ systemMessage: `JEV_FINISH_HOOK_ERROR: ${e.message} — loop não continuado automaticamente neste evento (ver ${stateDir}/hook-errors.jsonl)` }));
  process.exit(0);
});
