# JEV FINAL — card ÂNCORA ALFA OMEGA (ES/NQ): texto coerente com Radar 4/4 sem direção (loop jf-20261014181649-fcc3eb)

## Objetivo
Corrigir no card ES/NQ o mesmo padrão já corrigido no GC·SI. O texto "→ sem radar, nenhum veredito é emitido" aparecia quando o BFF dizia "Radar 4/4 FECHADO … gate não liberou direção". Só apresentação, contrato `buildGate` existente, produção intocada até autorização.

## Resultado
- Staging `handoffs/invictus-aot-live-20261012/esnq-anchor-text/` (base, candidate, esnq-anchor-text.diff, apply-anchor-text.sh, tests).
- Mudança só na linha `conseq`, −1/+2 por arquivo:
  - `public/index.html` `renderGate()` L737;
  - `public/auto.html` `aocRenderGate()` L622.
- Com `tapeLive ∧ strength===4 ∧ dir∉{LONG,SHORT}` (o ramo de reason do próprio `buildGate`), o texto passa a ser "→ radar 4/4 atendido · gate não liberou direção · nenhum veredito é emitido". Os outros estados ficam byte a byte iguais.
- SHA: index `e7819fd1…` → `4d5cb19651d098eb…`; auto `d4860131…` → `a2c342db2a8fd932…`.
- JEV DIFF A 0.91 `req_01a13ba3346c7f26b168f03e8927d2ab`.

## Testes (recheck do CLI: all_pass=true)
- `esnq-anchor-text-A-E` 44/44 PASS: A defeito eliminado (a base reproduz), B ausência mantida, C badge/classe/reason preservados, D sem confirmação falsa (stale, null, offline, vazio), E regressão idêntica e diff restrito.
- `esnq-apply-script-sandbox` 7/7 PASS: S1–S6 sandbox; P1 produção só checagem, preimagens conferidas.

## Riscos
- Baixo: só texto de UI, sem efeito em gate, sim, ordens ou dados. Caso residual inalterado: `!ready` com 4/4 e direção continua com o texto antigo (o BFF não publica esse ramo como 4/4 sem direção).
- Produção NÃO alterada. Deploy só com autorização do operador (`apply-anchor-text.sh --apply`, sem reinício, rollback `--rollback`).
