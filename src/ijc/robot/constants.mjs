// INVICTUS JEV CODE — constantes do ROBOT. Nada aqui e configuravel: mudar exige editar codigo, revisao e ordem do operador.
import { SAFETY } from '../../jev/config.mjs';

export { SAFETY }; // JEV_CAN_SEND_ORDER / EXECUTE_TRADE / MODIFY_NT8 / OVERRIDE_CORE = false (Object.freeze)

// Caminho de ordens deste build. Nao existe codigo de submissao; este marcador e verificado em runtime e em teste.
export const ORDER_PATH = Object.freeze({ state: 'HARD_DISABLED', reason: 'ACTIVE_SIDE_RULES=0; EXECUTION_POLICY=NOT_PREREGISTERED; JEV_CAN_SEND_ORDER=false' });

// Politica de execucao pre-registrada: inexistente neste build.
export const EXECUTION_POLICY = null;

export const ROBOT_MODES = Object.freeze(['OFF', 'ENABLE_REQUESTED', 'ARMED', 'HALTED', 'EMERGENCY_STOPPED']);
export const POSITION_STATES = Object.freeze(['NOT_REPORTED', 'FLAT', 'ENTRY_PENDING', 'IN_POSITION', 'EXIT_PENDING', 'UNKNOWN_RECONCILING']);
export const DECISION_ACTIONS = Object.freeze(['NONE', 'ENTER_LONG', 'ENTER_SHORT', 'EXIT_OWNED']);

// Padrao forte do Invictus (AoRoboGuard original, 18/08): so contas que o PROPRIO NT8 classifica como simuladas.
export const ELIGIBLE_PROVIDERS = Object.freeze(['Simulator', 'Playback']);
// Origem e prefixos de propriedade (com pipe; comparacao Ordinal). Distintos de "AO|" do Invictus.
// Manual NUNCA entra como robot-owned: "IJC-MANUAL|" nao comeca com "IJC-ROBOT|".
export const ORIGIN = Object.freeze({ MANUAL: 'MANUAL_OPERATOR', ROBOT: 'JEV_ROBOT' });
export const ORDER_PREFIX = 'IJC-ROBOT|';
export const MANUAL_PREFIX = 'IJC-MANUAL|';

export const isEligibleProvider = (provider) => typeof provider === 'string' && ELIGIBLE_PROVIDERS.includes(provider); // case-sensitive de proposito
export const isRobotOrderName = (name) => typeof name === 'string' && name.startsWith(ORDER_PREFIX);
export const isManualOrderName = (name) => typeof name === 'string' && name.startsWith(MANUAL_PREFIX);
export const orderOwner = (name) => (isRobotOrderName(name) ? ORIGIN.ROBOT : isManualOrderName(name) ? ORIGIN.MANUAL : 'FOREIGN');
// Tipo da conta so para EXIBICAO (Provider real do NT8, nunca o nome).
export const accountKind = (provider) => (typeof provider !== 'string' || provider === '' ? 'UNKNOWN' : ELIGIBLE_PROVIDERS.includes(provider) ? 'SIM' : 'LIVE');
