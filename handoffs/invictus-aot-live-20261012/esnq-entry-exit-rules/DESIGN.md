# ES/NQ R1–R10 — DESIGN (staging; sessão fb698be1, 14/10/2026)

Escopo: só a cópia isolada `candidate/aot-sim.js` (base = produção `C:\Users\ADM\.claude\aot\aot-sim.js`, SHA256 `e4133438…1503`, copiada sem alteração em `base/`). Produção, BFF, Gate, C#/NT8, conta e ordens: intocados.

## 1. Métrica do "%" — verificação técnica de bull_pct/bear_pct (decisão do operador)
- **Origem:** `signal-engine.js` L304–323 (pipeline darkcode-sync → relay :3457 `/v1/latest` → `signals.ES` / `signals.NQ`; o BFF só repassa em `aot-bff.js` L3165).
- **Fórmula:** `flowScore` = média ponderada de 8 componentes de fluxo normalizados (dexoflow, net_dex, cvroflow, zcvr, gexoflow, skew call/put, vanna, charm) ∈ [−1,1]; `posScore` = posição do spot na faixa suporte/resistência ∈ [−1,1]. `bull_score = 0.80·flow + 0.20·pos` (GAMMA_NEG) ou `0.45·flow + 0.55·pos` (outros regimes). `bull_pct = round(clamp(50 + 50·bull_score, 2, 98))`; **`bear_pct = 100 − bull_pct`**; `direction = LONG se bull ≥ 58, SHORT se ≤ 42, senão NEUTRO` (pode ser sobrescrita depois por `finalDirection`, L391).
- **Escala:** inteiro 0–100 (faixa efetiva 2–98). **Por ativo:** sim, ES e NQ separados. **Atualização:** `signals.ts` único para o bloco; produção ~30 s (`ROBO_CFG.PRODUCAO_MS`); limite de frescor do robô = 90 s (`ROBO_CFG.STALE_MS`, `AlfaOmegaRobo.cs:310`).
- **Amostra viva (relay, idade 22 s):** ES bull 24 / bear 76 / dir SHORT; NQ bull 37 / bear 63 / dir SHORT.
- **Comparação com "convicção direcional 50%/70%":** bull_pct é um **escore direcional linear, determinístico e não calibrado**; não é probabilidade nem convicção. Consequências, sem inventar nada: `≥70` ⇔ `bull_score ≥ 0,40`; `≥50` ⇔ `bull_score ≥ 0` — inclui leituras que o próprio produtor classifica como NEUTRO (43–57). Com R3 (NEUTRO bloqueia, medido pelo `direction` do mesmo sinal), o limiar 50 só passa a valer de fato a partir de 58. Calibração 50/70 ↔ taxa de acerto = **não validada** (fica como lacuna).
- **Ressalva:** a cópia do produtor lida é `alfaomega-copy-engine/dist/.../signal-engine.js`. A linha de comando do processo vivo não foi identificada; os valores vivos são coerentes com a fórmula (bear = 100 − bull; direção coerente com as faixas).

## 2. Como as regras entram no motor
- **R1–R5 = FILTRO ADICIONAL ao anchor 4/4 existente** (`pctRules`). A entrada só acontece se o legado já abriria (4/4, LONG/SHORT, cooldown, histerese, dois spots) **e** o filtro passar. Assim nada abre mais do que hoje (item 10: 4/4 nunca vira 70% automaticamente). Trocar o anchor pelo % como gatilho seria decisão de arquitetura: **não implementado**, fica pendente do operador.
- **Filtro (fail-closed), na ordem:** sinal ausente → `pct_ausente`; idade > 90 s ou timestamp no futuro → `pct_stale`; valor não numérico ou fora de 0–100 → `pct_invalido_<ativo>`; `direction` do ativo ≠ lado (NEUTRO → `pct_neutro_<ativo>`, oposto → `pct_divergente_<ativo>`, cumprindo R3 e o item 9); os dois ≥ 70 → abre (R1/R2); algum < 50 → `pct_abaixo_min`; fora do RTH → abre (R5); no RTH exige `c2.confirm === 'CONFIRMA'` em ES **e** NQ (R4). `rth` ausente = RTH (caminho mais restritivo).
- **R6:** já garantido (abertura conjunta, exige os dois spots).

## 3. Estados e precedência de saída
| Estado | No motor |
|---|---|
| FLAT | `side='FLAT'`, armado, sem cooldown |
| OPEN | `side∈{LONG,SHORT}`, `protected=false` |
| PROTECTED | `protected=true` (monotônico até fechar; a volta do Gate para a direção não desprotege) |
| EXITING | CLOSE no outbox ainda não emitido (`pendingEvents`) ou exec `EXIT_PENDING` → entrada bloqueada (mecanismo existente B3/D5) |
| COOLDOWN | `cooldownUntil` + histerese `armed=false` (existente) |

**Precedência por tick (um único fechamento; depois do close `side=FLAT`, então ticks repetidos não geram um 2º CLOSE):**
1. Perda por ativo ≤ −$500 → `hard_stop_es` / `hard_stop_nq` (R9/R10).
2. Cesta ≤ −$1000 → `basket_stop` (R9). Com $500 por ativo ele só dispara sozinho se o limite por ativo for maior; fica como defesa em profundidade.
3. NEUTRO não transitório com cesta ≤ 0 ou desconhecida (perna sem preço) → `anchor_neutro_negativo` (R8, fecha já).
4. PROTECTED e cesta ≤ 0 (ou desconhecida com NEUTRO) → `protected_floor`.
5. Trailing por perna (BE em +$500, degraus de $250) → `trailing_stop_*` (inalterado).
6. NEUTRO não transitório com cesta > 0 → passa a PROTECTED **sem fechar** (R7).
- NEUTRO transitório ("forca fraca", "sem tape", "indefinid") continua sem efeito, como hoje.
- **"Proteger a entrada" = piso da CESTA em $0**, não um stop em BE por perna. Com uma perna negativa e a cesta positiva, um BE por perna dispararia na hora. O fechamento usa o spot real: em um gap o resultado registrado é negativo, **não se presume fill no zero** (item 8).
- **Cesta:** `esUsd + nqUsd` no spot atual, sem custos.

## 4. Lacunas documentadas (não inventadas)
1. **Take-profit não existe** no motor. Em R7, "buscar take" = a posição segue com trailing, piso e limites, sem alvo fixo. Um alvo exige um número definido pelo operador.
2. **Comissão e slippage não são modelados** (P&L bruto no spot). Os limites de $500/$1000 são sobre o spot; numa execução real a perda pode passar disso em gaps.
3. **Calibração 50/70** de bull_pct = não validada (escore, não probabilidade).
4. **Anchor × % como gatilho:** implementado só como filtro adicional. A substituição fica a decidir.
5. **Direção oposta do Gate** (LONG→SHORT sem passar por NEUTRO): o motor atual não fecha. Fica fora do escopo e inalterado.
6. **Ligação no BFF** (passar `pct`/`hiro`/`rth` ao `tick`) e **porte para o C#/robô NT8**: fases separadas. Sem o BFF passar `pct`, o candidato com `pctRules:true` **bloqueia toda entrada** (fail-closed). Por isso não pode ir à produção sozinho.

## 5. Paridade e rollback
- Com `{hardStopUsd:1000, basketStopUsd:0, neutroPositiveProtect:false, pctRules:false}`, o candidato reproduz a base tick a tick (teste com 3000 ticks, 128 fechamentos: anchor_neutro e hard_stop). A API do módulo não muda.
- Rollback = não aplicar; a produção não foi tocada.
