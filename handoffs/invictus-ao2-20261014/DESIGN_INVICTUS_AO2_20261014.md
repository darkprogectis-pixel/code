# INVICTUS AO 2.0 — decisão, regras, arquitetura paralela e plano (DESIGN; sem patch) — 14/10/2026

Sessão e6ce8ee4. Etapa só de documentação.
- Não houve código, deploy, F5 nem ordens.
- V1 intocada: motor `C:\Users\ADM\.claude\aot\aot-sim.js`, BFF `aot-bff.js` :3600, C#/NT8 e ledgers.
- Base técnica reaproveitada: staging R1–R10 + R3 (`handoffs/invictus-aot-live-20261012/esnq-entry-exit-rules/`, commit 0c3e1ba), auditoria histórica de 14/10 (`.../audit-historica-20261014/`).

## 1. Decisão do operador (registrada)
- Criar a INVICTUS AO 2.0, independente da V1.
- Observação comparativa por 30 pregões consecutivos no terminal AOT.
- A AO 2.0 NÃO substitui nem altera a V1.

## 2. Regras canônicas da AO 2.0 (texto do operador, sem interpretação)
1. Gate OPEN 4/4 obrigatório em TODAS as entradas.
2. Fonte Gamma = GEXBot via GammaGEX. Identificar contrato, sinal, timestamp, disponibilidade e atualização efetiva. Não presumir convenção de sinal da API.
3. GAMMA POSITIVO: LONG ou SHORT conforme a direção do Gate; ES e NQ alinhados.
   - sem HIRO: ambos ≥ 45% na direção;
   - com HIRO convergente: ambos > 25% na direção.
4. GAMMA NEGATIVO / SHORT: Gate OPEN 4/4 SHORT + HIRO confirmando venda; sem percentual mínimo de ES/NQ.
5. GAMMA NEGATIVO / LONG: Gate OPEN 4/4 LONG + ES e NQ ≥ 50% bullish; sem flexibilização por gamma negativo.
6. Base R7–R10 preservada:
   - NEUTRO lucrativo ⇒ protege a posição;
   - NEUTRO com prejuízo ⇒ encerra;
   - stop de US$ 500 por instrumento e limite de US$ 1000 da cesta;
   - precedência de proteção.
   O comportamento deve ser validado nos dois motores.

## 3. Fonte Gamma — integração existente (levantada só por leitura, 14/10 ~21:12Z)
| Item | Evidência |
|---|---|
| Serviço | `C:\Users\ADM\.claude\gammagex-capture\gammagex-api.js`, porta :3530. Repasse fino do upstream `https://gammagex.online`, sem mapear para o esquema GexBot e sem fallback. `/health`: token válido, `tickers_ok` = ES_SPX, NQ_NDX, SPX, NDX, SPY, QQQ, … Rotas autenticadas: `/classic/:ticker/{full,zero,one}`, `/classic/:ticker/history`, `/state/:ticker/:metric`, `/orderflow/:ticker[/history]`. |
| Contratos | `ES_SPX` e `NQ_NDX`. Segundo `aot-replay-api.js`, já vêm cotados em FUTURO (não somar futuresDiff). |
| Caminho até o AOT | darkcode-sync (WSL) → `oi-latest.json` → relay :3457 `/` (`source = gammagex_orderflow_api`) → `instruments.{ES,NQ}`. O BFF lê em `gexContext()` (`aot-bff.js` ~L506). |
| Campo de regime | `instruments.<sym>.gamma_condition` ∈ {POSITIVE, NEGATIVE}, DERIVADO de spot × zero_gamma (`classic.zero_gamma`, ou `levels.hvl`). Ele NÃO é o sinal bruto de gamma. Há ainda `signals.<sym>.regime` (GAMMA_POS/…) e `gamma_sign`, do signal-engine, que é outra derivação. |
| Defeito conhecido (S6) | Quando zero_gamma == spot (o vendor não achou cruzamento), o regime é INDETERMINADO. O BFF zera para null, mas o relay publica mesmo assim. Fixture real de 14/10 20:31Z: **ES spot = zero_gamma = 7770,81 com `gamma_condition` POSITIVE e `signals.ES.regime` GAMMA_POS** ⇒ regime publicado sem medição. NQ: spot 30192,17 × zg 30189,35 ⇒ NEGATIVE, coerente com a derivação, mas com o NQ ACIMA do zg. A convenção "acima do zg = positivo" NÃO vale aqui: precisa de verificação. |
| Timestamp | `instruments.<sym>.timestamp` em epoch **segundos** (vendor), separado de `signals.ts` (epoch ms, produção do signal-engine). Atualização efetiva: `gex-series` faz dedupe por avanço do vendor (`vts`); a cadência do vendor não foi medida aqui. |
| Valores de gamma | `gex.net_0dte`, `gex.net_next`, `gex.oflow` (com sinal). A unidade e a convenção de sinal do vendor NÃO estão documentadas (memória do projeto: unidade UNKNOWN). |

**Conclusão:** existe fonte de gamma (GammaGEX via relay). A convenção de sinal e o regime publicado NÃO estão homologados, então a regra AO 2.0 não pode depender de `gamma_condition` sem a lacuna L3 resolvida.

## 4. Arquitetura paralela (isolamento V1/V2)
**Escolha:** processo SHADOW separado. A V1 (BFF :3600 e motor) não é modificada para a AO 2.0 existir.
- **Processo `aot-ao2`** (novo; staging → porta própria proposta :3610; diretório próprio `C:\Users\ADM\.claude\aot-ao2\`).
  - Polling SOMENTE LEITURA do mesmo snapshot que a V1 usa: `GET :3600/state`, que já traz `gate.open`, `gate.anchor`, `rth`, `asof`, `v2.es/nq.c2` (HIRO) e os spots.
  - Também lê `GET :3457/` (signals bull/bear/direction + instruments gamma).
  - Mesma linha temporal: cada decisão AO 2.0 grava o `asof` do `/state` da V1 que a originou, o `signals.ts` e o `instruments.timestamp`.
- **Motor AO 2.0** = módulo próprio `aot-sim-ao2.js`, derivado do candidato R3 (R7–R10 + Gate OPEN + `simEntryInputs`), com a política de entrada AO 2.0 (§2.3–2.5) no lugar do filtro 70/50.
  - Estado próprio: `aot-ao2/state.json`.
  - Ledger próprio, append-only: `aot-ao2/history/trades-YYYY-MM.jsonl`.
  - Trade IDs com prefixo `ao2-`.
  - Campo `engine: "ao2"` e `fonte: "ao2_shadow"`.
- **Logger de decisão por tick** (fecha a lacuna da auditoria de 14/10): `aot-ao2/decisions/YYYY-MM-DD.ndjson`. A cada tick grava:
  - `asof`, `gate.open`, `gate.anchor`, `rth`;
  - `signals.ts` e ES/NQ `{bull_pct, bear_pct, direction}`;
  - gamma ES/NQ `{gamma_condition, zero_gamma, spot, timestamp, degenerado}` e HIRO ES/NQ;
  - decisão AO 2.0 e motivo; side/posição da V1 (lido do `/state.sim`) e da AO 2.0.
  - Isso viabiliza o replay causal das DUAS versões depois.
- **Terminal AOT:** uma página/painel próprio "INVICTUS AO 2.0 (SHADOW)", lado a lado com a V1, lendo `:3610`.
  - Rótulos, cores e KPIs separados; nunca somados aos da V1.
  - Selo permanente "SHADOW — sem execução" e "P&L simulado ≠ fills".
  - A integração na UI da V1 (auto.html) é uma fase própria, com JEV DIFF.

## 5. Isolamento de ordens
- A AO 2.0 NÃO tem `emitEvent`. Ela não escreve em `aot/history/events-*.jsonl` (canal AOT_CANONICAL que o executor INVICTUS consome), não chama `simExecIngest`, não fala com :5151/NT8 nem com o bridge de execução.
- Constante de código `AO2_ORDER_PATH = 'HARD_DISABLED'`; teste estático garante a ausência de fetch/escrita nos caminhos de execução.
- O hook do jev-finish (LIVE_GUARD) continua negando escrita nos caminhos live.
- Sem duplicação de eventos: a AO 2.0 nunca gera OPEN/CLOSE no canal da V1. O ledger dela é outro arquivo, em outro diretório.

## 6. Lacunas — DEFINIR ANTES DO PATCH (não inventadas)
- **L1. Semântica de % < 50 "na direção" × NEUTRO do signal-engine.**
  - `bear_pct = 100 − bull_pct`. A `direction` é LONG só com bull ≥ 58 e SHORT só com bull ≤ 42; entre 43 e 57 é NEUTRO.
  - Logo "ambos ≥ 45% na direção" (LONG) aceita bull 45–57, que o produtor classifica como NEUTRO. A regra R3 bloqueia NEUTRO.
  - "> 25% na direção" (LONG) aceita bull 26–42, que o produtor classifica como SHORT, ou seja, a direção oposta à entrada.
  - Decisão necessária: o critério de alinhamento é o % na direção (ignora `direction`) ou é o `direction` do produtor (os limiares 45/25 viram letra morta)?
- **L2. HIRO por ativo ou agregado** (regras 3 e 4): CONFIRMA em ES E NQ, ou num agregado? Hoje o HIRO do Gate é Darkflow por ativo (`c2.confirm`). Fora do RTH ele é sempre N/A ("pregão de opções 09:30–16:00"). Assim a regra 4 (gamma negativo SHORT) nunca entra fora do RTH, e a regra 3 com HIRO só vale no RTH. Isso precisa ser confirmado.
- **L3. Gamma: convenção e casos-limite.**
  - Qual campo define o regime: `instruments.gamma_condition`, `signals.regime` ou o sinal de `gex.net_0dte`?
  - Convenção de sinal do vendor; tratamento de gamma neutro, ausente, inválido, degenerado (zg == spot) e desatualizado (limite em segundos sobre `instruments.timestamp`).
  - Regime POR ATIVO: ES e NQ podem divergir (14/10: ES POS, NQ NEG). Qual regra vale então? Proposta conservadora a decidir: bloquear.
- **L4. RTH e horários:** fonte do RTH (`/state.rth` da V1?), entradas overnight, horário de corte e fechamento de sessão.
- **L5. Preço, custos e execução:** fonte de preço da simulação (gexbot :3457 × NT8 :5151; a V1 usa `SIM_PRICE_SOURCE`), comissão e slippage (o motor é bruto) e equivalência com fills reais (o shadow nunca tem fill).
- **L6. Cooldown/histerese da AO 2.0:** os mesmos parâmetros da V1 (`cooldown`, `armed`)? Assumido igual até decisão em contrário.

## 7. Critérios de homologação (antes de iniciar a contagem dos 30 pregões)
1. L1–L5 decididas pelo operador e registradas.
2. JEV DIFF A para cada patch e JEV FINAL A por fase.
3. Testes determinísticos do motor AO 2.0, um caso por regra e por lacuna decidida:
   - regras 3/4/5 e gamma ausente/degenerado/stale ⇒ bloqueia;
   - Gate fechado nunca abre (aleatório ≥ 5000 ticks);
   - R7–R10 com paridade frente ao candidato R3;
   - ausência de canal de ordem (teste estático).
4. Teste integrado com fixtures reais do `/state` e do :3457.
5. Shadow rodando ≥ 1 pregão completo de RTH em staging, com:
   - decisões gravadas a cada tick (cobertura ≥ 95% dos ticks);
   - zero eventos no canal da V1;
   - zero diferença nos arquivos da V1 (SHA dos ledgers/eventos antes e depois só cresce pela própria V1);
   - painel exibindo as duas versões separadas.
6. Ordem explícita do operador para "homologado" e data D0 do início.

## 8. Rollback
Parar o processo `aot-ao2` e remover a página/painel da AO 2.0. A V1 não depende de nada da AO 2.0.
- Os dados ficam (`aot-ao2/`, append-only).
- Gatilhos de rollback imediato:
  - qualquer escrita da AO 2.0 fora de `aot-ao2/`;
  - qualquer evento no canal da V1 atribuível à AO 2.0;
  - latência do `/state` da V1 degradada além de +10% (o polling do shadow não pode pesar no BFF).

## 9. Plano dos 30 pregões
- Início só após a homologação (§7).
  - Pregão válido = RTH completo com `/state` e :3457 disponíveis em ≥ 95% dos ticks.
  - Pregão inválido: registrado e não conta.
  - A sequência é de 30 pregões VÁLIDOS consecutivos. Uma interrupção é registrada com a causa; a regra de "consecutivo × reinício da contagem" é decisão do operador.
- Métricas por versão, nunca misturadas:
  - trades, LONG/SHORT, RTH/fora;
  - P&L bruto simulado, win rate, profit factor, máximo drawdown, maior perda;
  - perdas por stop de ativo e de cesta, tempo em posição;
  - custos estimados (quando L5 for decidida);
  - entradas só na V1, só na AO 2.0 e em ambas, com o motivo de cada bloqueio.
- Rótulos fixos:
  - V1 = AOT SIM (já simulado; os fills reais são do INVICTUS, em ledger separado);
  - AO 2.0 = SHADOW.
  - P&L shadow nunca é apresentado como fill real.
- Relatório diário automático (ndjson → resumo) e relatório final no dia 30.

## 10. Implementação em fases (JEV DIFF antes de cada patch; tudo em staging até ordem)
- **F0 (esta etapa):** decisão, regras, arquitetura, lacunas, homologação, rollback e plano. Sem patch.
- **F1:** respostas do operador a L1–L6.
- **F2:** `aot-sim-ao2.js` + testes (staging em `handoffs/invictus-ao2-20261014/`) → JEV DIFF → testes → JEV FINAL.
- **F3:** processo shadow `aot-ao2` + logger por tick + teste integrado com fixtures (staging, sem rodar contra produção) → JEV DIFF.
- **F4:** painel AO 2.0 no terminal AOT (página própria; tocar auto.html só com JEV DIFF próprio).
- **F5:** ativação do shadow na máquina, sem ordens (exige ordem do operador; o deploy pode ser bloqueado pelo classifier ⇒ script do operador).
- **F6:** pregão de homologação → ordem "homologado" → D0 → 30 pregões.
