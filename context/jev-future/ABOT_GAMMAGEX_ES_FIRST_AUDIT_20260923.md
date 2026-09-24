# JEV FUTURE — A-BOT/GammaGex · auditoria dos 4 indicadores (ES-first)

**Sessão:** 507b9f4b · 23–24/09/2026 · READ-ONLY. Brief: `PHASE_BRIEF_JEV_ABOT_4IND_AUDIT_20260923.md`.

**Complementa** `ABOT_GAMMAGEX_JEV_FUTURE_AUDIT_20260923.md` (A1–A8, lado da fonte).

**Dados:** `data/abot-gammagex-audit/`
- 11 JSONs;
- `probe-4ind-out.json`, `basis-classic-vs-nt8.json`, `graphify-crossfile.json`;
- `scripts/`.

**Graphify:** `graphify update` (AST, sem LLM) rodou sobre uma cópia dos 5 `.cs` no scratchpad e gerou 588 nós e 1211 arestas. A única dependência real entre os 4 é o `AoAlfaBot` (relay). `AoJson`, `AoWebClient` e `AoAuth` vêm do `AlfaOmegaHiro.cs`.

## NETGEX0DTE (`AlfaOmegaNetGex0DTE.cs`)
- **Endpoint:** `GET /` (raiz composta) → `instruments.<ES|NQ|…>.gex.net_0dte` e `net_next` (`:267-274`). Poll de 30 s.
- **Exibe:** histograma bruto do net GEX 0DTE. Rotula >0 como **COMPRA** e <0 como **VENDA**, o que atribui lado a GEX.
  - No contrato Jev, GEX = REGIME e direction 0.
  - O valor é idêntico ao `gamma_condition`.
- **RAW:** sim (escalar do vendor). Só a cor e o rótulo são derivados.
- **0DTE:** sim (`zgr`), só o valor atual; não há série. O histograma nasce no boot do NT8.
- **Freshness:** pela chegada (`DateTime.Now`); não lê o timestamp do vendor. **FAIL-OPEN**: uma raiz congelada conta como fresca.
- **Efeito colateral:** escreve `AlfaOmegaSharedState.NetGex0DTE`, que o `AlfaOmegaFlowOne.cs` consome.

## DEXGEXFLOW (`AlfaOmegaDexGexFlow.cs`)
- **Endpoint:** `GET /` (raiz composta), poll de 30 s (`:635-693`).
- **Campos lidos:**
  - `gamma_condition`, `spot`;
  - `classic.{zero_gamma, major_pos/neg_vol, major_pos/neg_oi}`;
  - `gex.net_0dte/net_next`, `dex.net_0dte`, `vanna.net_0dte`, `charm.net_0dte`;
  - 10 `levels.*`;
  - `conversion`.
- **Exibe:** 15 linhas e o "rastro", um heatmap de permanência derivado no próprio indicador.
- **Medido em 24/09:**
  - 7 linhas estão **null**: Call Wall, Put Wall, HVL, Long Gamma 0DTE, Gamma Wall 0DTE, Call Res 0DTE e Put Sup 0DTE. São os quinFields MenthorQ, com `_menthorq_source=null`.
  - Next Exp OI lê um campo que não existe.
  - Desenham: Zero Gamma, 4 majors (classic/zero), Short Gamma 0DTE (= `z_msgamma`) e Short Gamma Next.
- **Conversão:** só quando `native=spot`. ES/NQ não convertem, e isso está correto.
- **Freshness:** pela chegada, FAIL-OPEN.

## CLASSIC (`AlfaOmegaClassic.cs`)
- **Endpoint:** `/gexbot/classic/{T}/{full|zero|one}` (`:523`). O default é **NDX / full (agregado 90d)**, ou seja, não é ES-first.
- **Campos:** o parse é completo (`:2769-2839`).
  - `spot`, `zero_gamma`, majors vol/oi, `sum_gex_vol/oi`, `min_dte`, `sec_min_dte`, `delta_risk_reversal`, `timestamp`;
  - `strikes` [108 × strike, gex_vol, gex_oi, 5 priors];
  - `max_priors`, `conversion`.
- **Freshness:** pelo timestamp do vendor; STALE se passar de 5 min.
- 🟢 **ACHADO NOVO — histórico local:** `PersistCache=true` grava `Documents\NinjaTrader 8\bin\Custom\AoClassicCache\aoclassic_<SYM>_<cat>_<ymd>.jsonl`, com 20 dias de retenção.
  - Há 16 arquivos: SPX `full` desde 03/09 e NDX `full` em 4 dias.
  - O conteúdo é só agregado (`t`, `sp`, `zg`, 4 majors, `sv`, `so`, `cm`, `ca`), **sem strikes**.
  - 51–100 % das linhas são duplicadas: grava a cada poll mesmo com o `t` do vendor igual.
  - Só existe enquanto o gráfico está aberto.
  - Pós-ponte: **7 pregões parciais** (11, 16, 17, 18, 21, 22 e 23/09), com ~430–790 pontos únicos por dia.
  - Tem a mesma limitação do teto de 10k do vendor, mas **já está em disco**.

## STATE (`AlfaOmegaState.cs`)
- **Endpoint:** `/gexbot/state/{T}/{gex_zero|gex_one|gex_full|delta|gamma|vanna|charm _zero|_one}`. O default é **SPX / gex_zero**.
- **GexProfile:**
  - `strikes`;
  - `zero_gamma=0` e `gex_oi=0` (degenerados);
  - `sum_gex_vol` = imbalance, que é **≈ `gex.net_0dte`** (22.400,69 contra 22.406,11).
- **OptionsProfile:**
  - `mini_contracts` [strike, call_ivol, put_ivol, grega, 3 priors, 0, null];
  - `major_long/short_gamma`.
- **É o único com gregas POR STRIKE**, insumo do ΔDelta_dealer.
- **Conversão:** `multiplier/additive/future_contract` estão ausentes, então a escala é crua (já em ES). O comentário "+16,38" (22/08) está **obsoleto**.

## A-BOT / GAMMAGEX SOURCE
- **Cadeia:** vendor → GammaGex :3530 → relay :3457 (`/gexbot/*`, TTL 20 s, `_relay`) → indicadores.
- **Endpoint:** resolvido pelo `AoAlfaBot` (Property > config > `live.murklogic.site`), com AUTH V2 `bot.read`.
- **Raiz `/` = documento composto,** sem `_relay`.
- **2 dos 4 indicadores (NetGex0DTE e DexGexFlow) leem a raiz.** O Jev nunca lê a raiz, só `/gexbot/*` ou o :3530.

## ZERO-DTE LEVELS
Identidades medidas (24/09, 00:26Z, 1 instante; confirmar em RTH):

| Nível | Igual a | Valor |
|---|---|---|
| classic/zero `major_pos_vol` | `zero_mcall` | 7770,32 |
| state/gex_zero `major_neg_vol` | `zero_mput` | 7776,52 |
| state/grega `major_long_gamma` | `z_mlgamma` | 7776,03 |
| state/grega `major_short_gamma` | `z_msgamma` = `levels.short_gamma_0dte` | 7769,61 |

- O classic `major_neg_vol` (7775,32) **≠** `zero_mput`: o lado put tem dois construtos.
- `next_exp_hvl/call_res/put_sup` estão vivos e nenhum dos 4 os lê.

## DEX/GEX DATA
- **Vivos:**
  - `gex` (`net`, `cvr`, `oflow` × 0dte/next);
  - `dex` (14 campos);
  - `vanna` e `charm` (0dte/next);
  - `orderflow` (`cvr_oflow` e 4 majors).
- **Os 4 indicadores usam só:** `gex.net_0dte/net_next`, `dex.net_0dte`, `vanna.net_0dte` e `charm.net_0dte` (texto).
- **Unidades:** UNKNOWN ($MM presumido). No state, o charm vem em $MM/h.

## SPX/SPY -> ES
- **Veredito: (A).** O `ES_SPX` do GammaGex já vem em **preço do ES front**.
  - **Medição:** `sp` do AoClassicCache contra o NT8 `ES 12-26` (`.ncd`, relógio UTC−3 confirmado).
  - **Resultado:** diferença mediana de 0,02–0,12 pt, p10/p90 ≈ ±1,3 pt, em 5 pregões (n 427–789 por dia).
- **Roll do vendor:** o `ES_SPX` seguia o ESU6 em 11/09 e o ESZ6 já em 16/09. O roll aconteceu antes do vencimento (18/09); a data exata é UNKNOWN.
- **Antes da ponte (≤ 04/09):** `sp` = SPX cru, com `conversion` additive 6–10 ⇒ **a série do cache muda de escala por volta de 09–10/09.** Nunca misturar.
- **Strikes:** grade SPX mais o basis embutido (fração .32). O basis não é exposto (`conversion=null`).
- **SPY:** escala SPY (767,54), sem conversão. SPY→ES exige basis vivo.
- **Referência SpotGamma** (outra fonte): `futuresDiff` do SPX em 23/09 ≈ 21–24.

## RAW VS DERIVED
- **RAW:** `gex`, `dex`, `vanna`, `charm`, `orderflow`, `classic`, `strikes`, `mini_contracts`.
- **Derivado no sync:** `gamma_condition` = sign(`net_0dte`); `pc_oi` (é DEX, rótulo errado); aliases de `levels`.
- **Derivado no indicador:**
  - COMPRA/VENDA (NetGex0DTE);
  - rastro (DexGexFlow);
  - conversão só quando `native=spot`;
  - `Conv()` do State (inerte hoje).

## FRESHNESS
- **Classic e State:** timestamp do vendor (correto).
- **NetGex0DTE e DexGexFlow:** chegada (FAIL-OPEN).
- **`_relay.stale`:** mede o cache do relay, não a idade do dado. Às 00:26Z a idade do vendor era de ~16.000 s com `stale=false` (pós-fechamento).
- **Regra Jev:** freshness = `now − vendor timestamp`, com estados AVAILABLE/STALE/OFFLINE/UNKNOWN explícitos.

## UNUSED DATA
Nenhum dos 4 usa:
- `gex.cvr_*` e `oflow*`;
- `dex` agregado, call/put e oflow;
- `orderflow.cvr_oflow*` e os majors pelo nome próprio;
- `vanna/charm.net_next`;
- `next_exp_*`;
- `pc_oi`.

`delta_risk_reversal` só aparece no Classic. **Não usar:** `extended_zone`, `spotgamma.*`, `qscore`, `iv30d`, `dark_pool_analysis` e quinFields MenthorQ.

## ES_ONLY_HIGH_VALUE
1. ES_SPX já em preço ESZ6.
2. State: charm/vanna/delta por strike (ΔDelta_dealer).
3. Regime por spot × `classic.zero_gamma`: `zg==sp` em ~0 % no RTH, não degenera.
4. SPY classic/state.
5. Priors e `max_priors` (mudança intradia).
6. AoClassicCache SPX (único histórico local de classic intradia).

## DOUBLE COUNTING
- **NetGex0DTE (cor) ≡ DexGexFlow `gamma_condition` ≡ State gex_zero imbalance:** contam como **1** evidência.
- **Majors do DexGexFlow, do State e do orderflow:** mesmos números com nomes diferentes.
- **Classic ES_SPX × raiz ES:** mesmo vendor e mesmo instante.
- **Futuro MenthorQ:** voltaria na mesma chave `levels.*`. Rotular por origem.
- **A-BOT × SpotGamma:** mesma família upstream (trades de opções SPX), então não são independentes sem medição.

## ES PATTERN CANDIDATES (UNTESTED)
| ID | Hipótese | Papel |
|---|---|---|
| P1 | spot cruza `zero_gamma` | REGIME |
| P2 | distância a `z_msgamma` / `z_mlgamma` | LOCATION |
| P3 | ΔDelta_dealer por strike na última hora | convenção de sinal UNKNOWN |
| P4 | DEX 0DTE × regime como conflito com o lado de futuros | CONFIRMATION/INVALIDATION |
| P5 | migração de majors (priors) | POSITIONING_CHANGE |
| P6 | divergência de `zero_gamma` SPY × SPX | CONFIRMATION |

Detalhes em `es-pattern-candidates.json`.

## RESEARCH NEXT (cada item exige ordem do operador)
1. **Captura aditiva própria** em `alfaomega-jev-future/`:
   - GammaGex orderflow ES_SPX (1 s);
   - classic SPX/SPY zero **com strikes**;
   - state SPX gex_zero e charm/vanna/delta _zero;
   - sempre gravando o timestamp do vendor.
2. **Congelar agora uma cópia** do AoClassicCache (a retenção de 20 dias apaga 03/09 por volta de 23/09+20).
3. **Confirmar em RTH** as identidades de majors e a convenção de sinal de charm/vanna.
4. **Pré-registro:** não depende de pregões acumulados. 20–40 pregões = alvo de evidência da validação futura (VALIDATION_HISTORY_TARGET: NON_BLOCKING; correção de governança 23/09).

---
**CURRENT PROJECT CHANGED: NO · CODE CHANGED: NO · NT8 CHANGED: NO · F5: NO**

Os únicos arquivos escritos estão nesta pasta. A cópia para o graphify ficou no scratchpad.
