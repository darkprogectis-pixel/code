# JEV FINAL — ES/NQ R1–R10 em STAGING (loop jf-20261014202204-c3b423)

## Objetivo (ordem R2 do operador, 14/10/2026)
Fazer, nesta ordem, sem tocar produção, BFF, Gate, C#, NT8, LIVE nem ordens:
- escrever o DESIGN.md;
- verificar bull_pct/bear_pct;
- pedir o JEV DIFF;
- implementar em staging, numa cópia isolada de aot-sim.js, R7/R8/R9 e o filtro R1–R5;
- escrever testes determinísticos por cenário;
- atualizar o handoff;
- fazer o commit sem push.

## Entregue
- **`DESIGN.md`:**
  - métrica verificada: origem signal-engine.js L304–323, escala 0–100, um valor para ES e outro para NQ, ts único, frescor de 90 s;
  - amostra viva: ES 24/76, NQ 37/63, idade de 22 s;
  - a métrica é um escore não calibrado: 50 equivale a score ≥ 0;
  - estados FLAT/OPEN/PROTECTED/EXITING/COOLDOWN, precedência e idempotência;
  - 6 lacunas documentadas.
- **`candidate/aot-sim.js`** (SHA256 com prefixo 626a2055) é uma cópia da produção guardada em `base/` (e4133438). Mudanças:
  - R9: hard stop de 500 por ativo e `basketStopUsd` de 1000;
  - R7/R8: `neutroPositiveProtect`, com piso da cesta em 0 e fechamento no spot real;
  - R1–R5: `pctEntryBlock`, filtro somado ao anchor 4/4 e fail-closed;
  - estado `protected` e `entryBlock`.
- O diff está em `esnq-rules.diff`.
- JEV DIFF: A 0,81, `req_01a13c1460817f4f8cf613001e0e1fe4`, sobre `jev-diff-proposal-esnq-rules.md`.

## Testes
`esnq-rules-r1-r10` (`node --test tests/esnq-rules.test.cjs`): 19/19 PASS. O recheck do CLI também deu PASS (exit 0).

Cenários cobertos:
- entrada: 70/70 LONG e SHORT; 50/50 no RTH com e sem HIRO; 50/50 fora do RTH;
- bloqueio de entrada: divergência, NEUTRO, sinal stale, ausente ou inválido;
- R7 com cesta positiva e gap;
- R8 com cesta negativa, zerada e sem preço;
- NEUTRO transitório;
- limites: $500 por ativo, $1000 de cesta, gap sem clamp e precedência entre eles;
- trailing com reentrada;
- P&L bruto;
- 1 OPEN e 1 CLOSE com o Gate oscilando;
- paridade de 3000 ticks com os parâmetros legados;
- API inalterada.

## Segurança e escopo
- O motor de produção não foi alterado: o SHA256 continua e4133438…, igual ao de `base/`.
- BFF, Gate, C#, NT8, conta e ordens não foram tocados. Não houve deploy.
- Com `pctRules:true`, o candidato bloqueia toda entrada se o BFF não passar `pct`. Por isso a aplicação exige uma fase própria: ligação no BFF, porte para o C# e autorização do operador.

## Riscos residuais
- Não há take-profit.
- Custos e slippage não são considerados.
- A calibração 50/70 não foi validada.
- Ainda falta decidir se o gatilho é o anchor 4/4 ou o %.
- Uma virada do Gate para a direção oposta não fecha a posição (é o comportamento atual).
- A cópia do produtor de bull_pct lida aqui foi a de `dist/`. O processo vivo não foi identificado, mas os valores vivos batem com a fórmula.
