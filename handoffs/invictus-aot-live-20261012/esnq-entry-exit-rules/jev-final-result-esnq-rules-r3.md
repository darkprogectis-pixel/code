# JEV FINAL — ES/NQ ordem R3: Gate OPEN 4/4 obrigatório + integração BFF (STAGING) — loop jf-20261014203453-6f74f6

## Objetivo
Decisão definitiva do operador (14/10/2026): Gate OPEN 4/4 obrigatório para todas as entradas; 70/50 só filtros adicionais; integração BFF de bull_pct/bear_pct/HIRO/RTH em staging; testes integrados; LIVE/C#/NT8/contas/ordens intocados; sem deploy.

## Entregue (somente em handoffs/.../esnq-entry-exit-rules/)
- `candidate/aot-sim.js` (SHA256 60aed804…): `requireGateOpen:true`, entrada exige `gateOpen === true` após o anchor 4/4 legado e antes do filtro % (`gate_nao_open`); export puro `simEntryInputs`. R7/R8/R9 sem mudança.
- `candidate/bff/aot-bff.js` (SHA256 db797149…, base produção 3ec88e91…): 2 pontos (import + chamada do tick com simIn). Sem fetch novo, sem ordem, sem NT8.
- `esnq-rules-r3.diff`, `jev-diff-proposal-esnq-rules-r3.md`.
- JEV DIFF: A 0,92, `req_01a13c207133787aa8cb84ce19e8f605` (proposal sha e6568e8e9b749361).

## Testes (pelo CLI do loop; recheck PASS)
- `esnq-rules-r3` (`node --test tests/esnq-rules.test.cjs`): 23/23 PASS — inclui Gate OPEN obrigatório (gateOpen ausente/false/null/'true'/1 bloqueia com 98/98 + HIRO + 4/4), Gate fechado nunca abre (5000 ticks aleatórios, 0 OPEN), filtros continuam após Gate OPEN, saídas independem do Gate, paridade com a base (3000 ticks) com requireGateOpen:false.
- `esnq-bff-integration-r3` (`node --test tests/esnq-bff-integration.test.cjs`): 6/6 PASS — fixture real do relay :3457 + adapter HIRO de produção; RTH sem HIRO bloqueia, fora RTH abre, Gate fechado bloqueia, HIRO convergente nos dois abre, HIRO parcial bloqueia, direção oposta bloqueia, payload ausente/erro fail-closed, ligação estática + node --check, diff BFF = 2 linhas.

## Não feito (por ordem)
Deploy no BFF/motor de produção; C#/NT8; push.

## Riscos
Entradas mais raras (Gate OPEN inclui online/ready/tapeLive) — intencional. HIRO N/A fora do horário do fornecedor ⇒ 50% em RTH bloqueia (fail-closed). Deploy exige ordem separada e script do operador.
