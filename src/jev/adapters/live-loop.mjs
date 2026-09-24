// Laco LIVE DRY-RUN: adapter -> jev-input/v1 -> MESMO motor (runtime.run) -> jev-output/v1, em intervalo configuravel.
// Sem escrita em disco aqui (quem grava e a CLI via onCycle). Nunca envia ordem. Parada limpa por AbortSignal.
export async function runLive({ adapter, runtime, intervalMs, cycles = Infinity, signal, onCycle }) {
  let previousInput;
  let n = 0;
  while (!(signal && signal.aborted) && n < cycles) {
    n++;
    let result; let report;
    try {
      const built = await adapter.buildInput();
      report = built.report;
      result = runtime.run(built.input, previousInput === undefined ? {} : { previousInput });
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
