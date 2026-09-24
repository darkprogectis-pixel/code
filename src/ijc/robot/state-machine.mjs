// Maquina de estados do ROBOT (pura). Modo e eixo separado da posicao.
//   OFF ──ENABLE_REQUEST──► ENABLE_REQUESTED ──PRECHECK_PASS──► ARMED ──SAFEGUARD──► HALTED
//    ▲                         │ PRECHECK_FAIL                   │ DISABLE             │ DISABLE (so operador)
//    └─────────────────────────┴─────────────────────────────────┴─────────────────────┘
//   EMERGENCY de qualquer estado ► EMERGENCY_STOPPED; saida so por DISABLE explicito.
// Regras: ARMED exige canArm === true (todos os gates); HALTED nunca re-arma sozinho; restart = OFF.
export function transition(mode, event, { canArm = false } = {}) {
  const r = (to, ok = true, why = null) => ({ from: mode, event, to, ok, why });
  if (event === 'EMERGENCY') return r('EMERGENCY_STOPPED');
  if (event === 'DISABLE') return r('OFF');
  switch (mode) {
    case 'OFF':
      return event === 'ENABLE_REQUEST' ? r('ENABLE_REQUESTED') : r('OFF', false, 'evento invalido em OFF');
    case 'ENABLE_REQUESTED':
      if (event === 'PRECHECK_PASS') return canArm ? r('ARMED') : r('OFF', false, 'gates nao satisfeitos');
      if (event === 'PRECHECK_FAIL') return r('OFF', false, 'gates nao satisfeitos');
      return r(mode, false, 'evento invalido em ENABLE_REQUESTED');
    case 'ARMED':
      if (event === 'SAFEGUARD') return r('HALTED');
      return r(mode, false, 'evento invalido em ARMED');
    case 'HALTED':
      return r('HALTED', false, 'HALTED so sai por DISABLE do operador');
    case 'EMERGENCY_STOPPED':
      return r('EMERGENCY_STOPPED', false, 'EMERGENCY_STOPPED so sai por DISABLE explicito');
    default:
      return r('OFF', false, 'modo desconhecido => OFF');
  }
}
