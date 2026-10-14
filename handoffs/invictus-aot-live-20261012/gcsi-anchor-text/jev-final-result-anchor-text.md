# JEV FINAL — card ÂNCORA GC·SI: texto contraditório (loop jf-20261014180508-aa2211)

## Objetivo
Eliminar só a contradição "→ sem radar, sem leitura de confluência GC·SI" exibida com radar 4/4 / ESPERANDO_CONFIRMACAO. Só apresentação, contrato BFF existente, sem tocar gate/lógica. Deploy de produção só com autorização específica do operador.

## Resultado
- Causa: em `public/index.html` (`gcsiGate`, L1023) e `public/auto.html` (`aocGcsiGate`, L696), a consequência de ausência saía para todo estado != open. No contrato do BFF (L1153–1161), ESPERANDO_CONFIRMACAO = radarOpen ∧ ¬força, com state=CLOSED.
- Correção (staging, `gcsi-anchor-text/candidate/`): só a linha `conseq`, −1/+2 por arquivo. Lê `g.phase === 'ESPERANDO_CONFIRMACAO'` e mostra "→ radar 4/4 atendido · força insuficiente · gate fechado, sem direção e sem ordem". Os outros estados ficam idênticos.
- SHA: index `b6ac8094…` → `e7819fd1…`; auto `5e8441eb…` → `d4860131…`.
- JEV DIFF A 0,87 `req_01a13b99c90370e59113b3a26a5901f1`. JEV modify_file `jd_mv8fbcmy927029` (`req_01a13b9a1a89759bada8652b3ef04503`), gate_open=true, minimal_edit 1,0.

## Testes (recheck do CLI: PASS)
- anchor-text-A-E: 42/42 PASS. A defeito eliminado e base reproduz. B ausência mantida em SEM_SINAL/stale/offline. C ESPERANDO preservado. D sem confirmação falsa em stale/sem phase/unavailable/null/offline. E saídas idênticas à base nos demais estados e diff restrito.
- apply-script-sandbox: 7/7 PASS. Checagem, apply, idempotência, rollback, conflito sem escrita, falha com restauração. Produção só em modo checagem.
- Chrome (preview GET-only :3613 = candidato + dados reais do :3600, sem POST):
  - Caso B ao vivo: radar 2/4 SEM_SINAL, mensagem de ausência correta.
  - Caso A: `gcsiGate()` real do candidato com fixture 4/4 ESPERANDO_CONFIRMACAO mostra a nova consequência; o texto contraditório some.
  - Console sem erros. Evidência em `gcsi-anchor-text/evidence/`.

## Escopo preservado
`aot-bff.js` 3ec88e91 e o motor 42d0c8fd intocados. Gate GC/SI, radar, força, ME/MVI, preços, freshness, ES/NQ (L737), Russell, HIRO, sim, histórico, executor e contas não foram tocados. AOT_GCSI_SIM=off. Produção NÃO alterada.

## Pendente (operador)
Autorizar `bash handoffs/invictus-aot-live-20261012/gcsi-anchor-text/apply-anchor-text.sh --apply`: cópia com SHA conferido, backup `_backups/gcsi-anchor-text-20261014`, sem reinício (o BFF lê public/ a cada requisição). Rollback: `--rollback`.
