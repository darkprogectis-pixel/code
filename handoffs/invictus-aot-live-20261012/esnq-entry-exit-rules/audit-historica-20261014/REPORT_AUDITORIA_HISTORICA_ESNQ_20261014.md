# AUDITORIA HISTÓRICA — novas regras de entrada ES/NQ (cenários A 70 / B 50) — 14/10/2026 — SOMENTE LEITURA

Sessão e6ce8ee4. Nada alterado: motor, BFF, Gate, C#, NT8 e LIVE. Nenhuma ordem enviada. Sem JEV DIFF, porque a missão não altera nada.
Reprodução: `node audit.cjs <history180.json> //wsl.localhost/Ubuntu-24.04/home/magnumbrokeroficial/darkflow-web/data audit-result.json`.
O `history180.json` vem de `GET 127.0.0.1:3600/history?days=180`.

## Fontes e evidência
| Fonte | O que tem | Cobertura | Uso |
|---|---|---|---|
| Ledger AOT SIM (`/history` do BFF :3600; `C:/Users/ADM/.claude/aot/history/trades-2026-08..10.jsonl`) | 687 listados, 685 contados, +US$ 38.872,60; `openedAt`, `side`, `anchorAtEntry`, `totalUsd` | 03/08/2026 14:54Z → 14/10/2026 18:50Z | base da auditoria (bate 100% com a referência) |
| Testes | 2 registros `replay:true` (16/08, P&L 0) | — | excluídos |
| Duplicidades | 2 pares com o mesmo `openedAt`, lado, preços e P&L, fechados 2× em 5–10 s (31/08 15:10:43Z e 15:21:36Z; −307,50 e −0,70) | — | excluídas ⇒ **683 operações únicas, +US$ 39.180,80** (683 + 2 dupl. = 685 / 38.872,60 ✓) |
| `bull_pct`/`bear_pct` históricos (relay :3457 / darkcode-sync, WSL `darkflow-web/data`) | **122 snapshots pontuais**. `darkcode-YYYY-MM-DD.json` é sobrescrito ao longo do dia: sobra só o ÚLTIMO estado de cada dia, mais backups `oi-latest*` | 09/06 → 14/10/2026, ~1 por dia | causal (último ts ≤ entrada, idade ≤ 90 s) |
| Série intradiária de signals | **NÃO EXISTE**. `gex-series` não traz bull_pct. O log do `signal-narrator` só tem texto de LLM, só ES, sem data. `gate-monitor/data` está vazio. `shadow-v0` e `outside-rth-capture` não guardam signals nem Gate | — | — |
| Estado histórico do Gate OPEN (online ∧ ready ∧ tapeLive ∧ 4/4 ∧ dir) | **NÃO EXISTE** em nenhum ledger ou log. O ledger só grava `anchorAtEntry` (683/683 com 4/4 na direção do trade) | — | Gate OPEN = INDETERMINADO em 683/683 |

## Resultado (683 operações únicas; HIRO excluído; Gate OPEN obrigatório)
| CENÁRIO | TRADES | LONG | SHORT | RTH | FORA RTH | APROVADOS | REJEITADOS | INDETERMINADOS | P&L HISTÓRICO |
|---|---|---|---|---|---|---|---|---|---|
| Original (AOT SIM, únicas) | 683 | 408 | 275 | 380 | 303 | — | — | — | +US$ 39.180,80 (ref. 685 c/ dupl.: +38.872,60) |
| A — Gate OPEN + ES/NQ ≥ 70 mesma direção | 0 comprováveis | 0 | 0 | 0 | 0 | 0 | 1 (LONG, fora RTH, −US$ 180) | 682 (407 L / 275 S; 380 RTH / 302 fora) | aprovados: US$ 0 (não comprovável) |
| B — Gate OPEN + ES/NQ ≥ 50 mesma direção | 0 comprováveis | 0 | 0 | 0 | 0 | 0 | 1 (LONG, fora RTH, −US$ 180) | 682 (idem) | aprovados: US$ 0 (não comprovável) |

- O único trade com snapshot causal válido: `2026-09-24T00:01:31.767Z-qhsj2`, LONG, aberto às 00:00:06Z.
  - Snapshot `darkcode-2026-09-23.json`, ts 23:59:53Z (idade 13 s): ES SHORT 32/68, NQ NEUTRO 52/48.
  - Resultado: REJEITADO nos dois cenários (ES divergente; NQ NEUTRO), independentemente do Gate.
- Nos outros 682 trades, o snapshot de % mais próximo e anterior à entrada estava a mais de 90 s (o 2º menor intervalo é 157 s). Ficam INDETERMINADOS. Não houve reconstrução.
- Nenhum trade pode ser APROVADO: o Gate OPEN histórico não existe, e o percentual histórico falta em 682/683.
- **Conclusão: a contagem A/B NÃO é comprovável com os dados existentes.** Não há estimativa.

## Replay causal (item 12)
NÃO EXECUTÁVEL. Não existe série histórica de ticks de bull_pct/bear_pct nem de estados do Gate OPEN. Um replay exigiria inventar valores.

## Para tornar a auditoria comprovável daqui em diante (exige ordem do operador)
Gravar em append-only, por tick do BFF (~20 s): `gate.open`, `gate.anchor` (dir e força), `signals.ts` e ES/NQ `{bull_pct, bear_pct, direction}`, além de `rth`.
O lugar natural é o próprio `/state` do BFF ou um logger read-only novo, como o `gate-monitor`, que existe mas nunca rodou.
Depois de N sessões gravadas, o replay causal com `candidate/aot-sim.js` (staging R3) fica possível.

## ADENDO — somente 14/10/2026 (ET), cenários A/B sem HIRO (sessão e6ce8ee4, SOMENTE LEITURA)
Reaproveita o ledger e a busca de fontes acima, sem nova auditoria. O último registro do ledger é a entrada de 14:50 ET, fechada às 14:55 ET.
- Operações AOT SIM de hoje: **9** reais, nenhum teste, nenhuma duplicata. 7 LONG e 2 SHORT; 7 no RTH e 2 fora (a primeira às 01:02 ET). P&L −US$ 1.687,50.
- Gate OPEN intradiário de hoje: inexistente. Não há log do BFF em `C:/Users/ADM/.claude/aot`, e o `gate-monitor` está vazio.
- % intradiário de hoje: o único snapshot é o `darkcode-2026-10-14.json`, com ts 20:51:00Z (16:51 ET). Ele é **posterior** a todas as 9 entradas, então foi descartado (regra causal).
- **A (≥ 70) e B (≥ 50): 0 aprovados, 0 rejeitados, 9 INDETERMINADOS.** Replay causal com o motor de staging não executável: não há série do Gate nem do %.
- Ausência de dado ≠ zero trades hipotéticos: o número de trades que a estratégia nova teria feito hoje é **desconhecido**.
