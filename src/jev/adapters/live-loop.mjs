// Laco LIVE DRY-RUN: adapter -> jev-input/v1 -> MESMO motor (runtime.run) -> jev-output/v1, em intervalo configuravel.
// Sem escrita em disco aqui (quem grava e a CLI via onCycle). Nunca envia ordem. Parada limpa por AbortSignal.
// snapshot_id canonico: identifica UM ciclo do motor; toda leitura (bridge, robo, agente) referencia o mesmo id.
const RUN_TAG = Date.now().toString(36);
export const makeSnapshotId = (output, cycle, runTag = RUN_TAG) => `${(output && output.evaluated_at) || 'NA'}#${runTag}-${cycle}`;

// runMode: 'LIVE' so quando o adapter e o relay ao vivo (afeta so a DQ: LIVE_DQ_HISTORY_ONLY_POLICY); replay/testes omitem.
export async function runLive({ adapter, runtime, intervalMs, cycles = Infinity, signal, onCycle, runMode }) {
  let previousInput;
  let n = 0;
  while (!(signal && signal.aborted) && n < cycles) {
    n++;
    let result; let report;
    try {
      const built = await adapter.buildInput();
      report = built.report;
      result = runtime.run(built.input, { ...(previousInput === undefined ? {} : { previousInput }), ...(runMode ? { runMode } : {}) });
      result.snapshot_id = makeSnapshotId(result.output, n);
      previousInput = built.input;
    } catch (e) {
      // FATAL estrutural (artefato/config) sobe; qualquer outra falha do ciclo e registrada e o laco continua
      if (e && e.name === 'JevFatalError') throw e;
      result = null; report = { cycle: n, error: String(e && e.message) };
    }
    await onCycle({ cycle: n, result, report });
    if (n >= cycles || (signal && signal.aborted)) break;
    await new Promise((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
  return n;
}
