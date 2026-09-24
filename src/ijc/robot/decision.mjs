// DECISION: mapeia o snapshot canonico do JEV numa acao. NAO recalcula o JEV; so le o snapshot recebido.
// V1: ACTIVE SIDE RULES = 0 e EXECUTION POLICY nao pre-registrada => acao SEMPRE 'NONE'.
// LONG_CONTEXT/SHORT_CONTEXT, se um dia existirem, NAO implicam entrada: exigem politica de execucao propria.
import { EXECUTION_POLICY } from './constants.mjs';

export function decide(snapshot, { activeSideRules = [] } = {}) {
  const sid = snapshot ? snapshot.snapshot_id : null;
  const reasons = [];
  if (!snapshot) reasons.push('RC_ROBOT_NO_SNAPSHOT');
  if (activeSideRules.length === 0) reasons.push('RC_ROBOT_NO_ACTIVE_SIDE_RULE');
  if (EXECUTION_POLICY === null) reasons.push('RC_ROBOT_NO_EXECUTION_POLICY');
  if (snapshot && snapshot.output.data_quality.status === 'DATA_INVALID') reasons.push('RC_ROBOT_DATA_INVALID');
  return {
    snapshot_id: sid,
    jev_directional_context: snapshot ? snapshot.output.jev_directional_context : null,
    action: 'NONE', // unico valor produzivel neste build
    reason_codes: reasons.length ? reasons : ['RC_ROBOT_NONE'],
  };
}
