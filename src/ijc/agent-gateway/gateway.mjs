// AGENT GATEWAY (processo separado, opcional, assincrono). Le SO a bridge :3590 (GET) e publica notas ADVISORY em :3592.
// Nunca: token do robo (:3591), contas, ordens, credenciais de broker, APIs de execucao. Nunca substitui o estado canonico.
import { httpGetJson } from '../../jev/adapters/relay-client.mjs';

// contexto enviado ao provider: WHITELIST do painel (sem conta, sem ordem, sem nada do control plane)
export function advisoryContext(panel) {
  if (!panel || panel.schema !== 'jev-panel/v1') return null;
  const dc = panel.dealer_context || {};
  return {
    product: panel.product || 'INVICTUS JEV CODE', snapshot_id: panel.snapshot_id || null,
    directional_context: panel.jev && panel.jev.directional_context, context_explanation: panel.jev && panel.jev.context_explanation,
    session: panel.jev && panel.jev.session, evaluated_at: panel.jev && panel.jev.evaluated_at,
    data_quality: panel.data_quality ? { status: panel.data_quality.status, dimensions: panel.data_quality.dimensions } : null,
    dealer: { gamma_regime: dc.gamma_regime || null, put_call_dex_ratio: dc.put_call_dex_ratio ?? null, dex_direction: dc.dex_direction || null },
    spx_effects: panel.spx_context ? panel.spx_context.effects : null,
    reason_codes: (panel.reason_codes || []).map((r) => r.code),
    unresolved_count: panel.unresolved ? panel.unresolved.count : null,
    robot: panel.robot ? { state: panel.robot.state, execution: panel.robot.execution } : null,
  };
}

export function createAgentGateway({ bridgeUrl, provider, pollMs = 15000, minProviderGapMs = 60000, timeoutMs = 20000, fetchJson = httpGetJson, logger = null, now = () => Date.now() }) {
  const u = new URL(bridgeUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('agent gateway so le a bridge em loopback');
  const log = (e, f) => { if (logger) logger.log(e, f); };
  const st = { started_at: new Date(now()).toISOString(), bridge: { reachable: null, last_snapshot_id: null, last_error: null, last_ok_at: null },
    provider: { last_ok_at: null, last_error: null, in_flight: false, last_call_at: 0 }, notes: [] };

  async function tick() {
    const r = await fetchJson(`${u.origin}/jev/v1/state`, 3000);
    if (!r.ok) { st.bridge.reachable = false; st.bridge.last_error = r.error; log('bridge_unreachable', { severity: 'warn', reason: r.error }); return; }
    st.bridge.reachable = true; st.bridge.last_ok_at = new Date(now()).toISOString(); st.bridge.last_error = null;
    const ctx = advisoryContext(r.json);
    if (!ctx || !ctx.snapshot_id || ctx.snapshot_id === st.bridge.last_snapshot_id) return;
    st.bridge.last_snapshot_id = ctx.snapshot_id;
    const ps = provider.status();
    if (ps.status !== 'READY' && ps.status !== 'NOT_CHECKED') return; // sem provider: nada a fazer (estado valido)
    if (st.provider.in_flight || now() - st.provider.last_call_at < minProviderGapMs) return;
    st.provider.in_flight = true; st.provider.last_call_at = now();
    try {
      const out = await provider.advise(ctx, { timeoutMs });
      st.provider.last_ok_at = new Date(now()).toISOString(); st.provider.last_error = null;
      if (out && out.text) {
        st.notes.unshift({ kind: 'ADVISORY', canonical: false, label: 'ADVISORY — não é sinal nem estado canônico do JEV', snapshot_id: ctx.snapshot_id, provider: provider.id, model: out.model || null, created_at: new Date(now()).toISOString(), text: out.text.slice(0, 4000) });
        st.notes.length = Math.min(st.notes.length, 20);
      }
      log('advisory_note', { snapshot_id: ctx.snapshot_id, state: out && out.refused ? 'REFUSED' : 'OK', reason: provider.id });
    } catch (e) {
      st.provider.last_error = e.code || 'ERROR';
      log('provider_error', { severity: 'warn', snapshot_id: ctx.snapshot_id, reason: st.provider.last_error });
    } finally { st.provider.in_flight = false; }
  }

  return {
    tick,
    health() {
      const ps = provider.status();
      const status = st.bridge.reachable === false ? 'DEGRADED_NO_BRIDGE' : (ps.status === 'READY' && !st.provider.last_error ? 'ONLINE' : (ps.status === 'READY' ? 'PROVIDER_UNAVAILABLE' : ps.status === 'NOT_CHECKED' ? 'ONLINE' : 'NO_PROVIDER'));
      return { ok: true, service: 'InvictusJevCode.AgentGateway', status, advisory_only: true, robot_access: 'NONE', order_access: 'NONE', canonical_state: false,
        provider: { id: provider.id, status: ps.status, detail: ps.detail, last_ok_at: st.provider.last_ok_at, last_error: st.provider.last_error },
        bridge: { ...st.bridge }, started_at: st.started_at };
    },
    notes: () => ({ kind: 'ADVISORY', canonical: false, notes: st.notes }),
    start() { const loop = async () => { try { await tick(); } catch (e) { log('tick_error', { severity: 'error', reason: String(e && e.message) }); } }; loop(); return setInterval(loop, pollMs); },
  };
}
