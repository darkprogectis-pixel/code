# JEV FUTURE — AUDITORIA A-BOT / GAMMAGEX (0DTE · DEX/GEX · CLASSIC · STATE) ES-FIRST

23/09/2026 · sessão 8009bed8 · **RESEARCH / DESIGN ONLY** (escopo: `PROJECT_SCOPE_JEV_FUTURE_20260923.md`).
Nenhum código, processo, NT8, V0 ou sistema atual alterado. Sem F5. Nenhum achado aqui gera remediação do sistema atual:
o código atual foi lido **só** para entender a fonte.
Medições: `data/abot-audit-20260923/*.json` · scripts: `data/abot-audit-20260923/scripts/` · payloads crus (sem credencial) no scratchpad da sessão (efêmero).
Base anterior reaproveitada (só a parte de FONTE): `alfaomega-directional/ABOT_GAMMAGEX_DIRECTIONAL_AUDIT_20260923.md` (P1) e `…_P2_20260923.md` §4, §7–§11, §15. As tabelas V1–V15 da P2 são histórico fora de escopo.

## 1. Cadeia da fonte (o que o Jev futuro leria)

`gammagex.online` (vendor, JWT) → `gammagex-capture/gammagex-api.js` **:3530** (passthrough fino) → relay **:3457** (`live-server.js`, rotas `/gexbot/{classic,state,orderflow}`, cache TTL 20 s, `_relay{stale,age_ms}`) e raiz `/` (`oi-latest.json` composto por `darkcode-sync.js`, que mistura MenthorQ e SpotGamma de junho).
**Para o Jev: ler as rotas `/gexbot/*` ou o :3530, nunca a raiz `/`.** A raiz tem rótulos que escondem outras fontes (quinFields = MenthorQ, null desde ~18/09) e não traz `_relay`.

| Vendor ticker | orderflow | classic zero/one/full | state 11 cats (+ `volume_zero` no vendor) | history no vendor |
|---|---|---|---|---|
| **ES_SPX** (alias do relay p/ SPX; já em preço ES) | ✔ 1 s | ✔ | ✔ | orderflow ✔ · classic ✔ (compact, sem strikes) |
| **SPY** | ✘ `Unsupported ticker` **no vendor** (não é só o whitelist do relay) | ✔ | ✔ | classic: `[]` |
| NQ_NDX (secundário) | ✔ | ✔ | ✔ | ✔ |

## 2. Achados novos desta fase (medidos)

**A1. Os majors 0DTE do orderflow NÃO são os majors do classic.** Cruzamento de 1.366 pares (±2 s) do histórico do vendor em 23/09 15:35–19:43Z: `zero_mcall`, `zero_mput`, `z_mlgamma` e `z_msgamma` coincidem com `major_pos_vol`, `major_neg_vol`, `major_pos_oi`, `major_neg_oi` ou `zero_gamma` do classic em **≤ 7,7 %** dos pares. São construtos distintos do mesmo vendor e dos mesmos trades ⇒ PARTIALLY_OVERLAPPING, não a mesma feature.

**A2. Os rótulos "call resistance / put support" dos majors 0DTE não se sustentam por posição.** Em 23/09 o `zero_mput` ("put support") esteve **acima** do spot em 67 % do dia, e o `zero_mcall` em 86 %. Já os majors do next expiry e do classic se comportam como walls: `one_mcall` acima do spot em 100 %, `one_mput` abaixo em 96 %, `major_pos_vol` acima em 100 % e `major_neg_vol` abaixo em 96 %. ⇒ a semântica de `zero_mcall/zero_mput` é **UNKNOWN**; ela entra no Jev como LOCATION neutra (nível), nunca como "suporte/resistência". Os níveis são interpolados (fração mod 5 variável), não strikes da grade.

**A3. Dois regimes distintos, nunca intercambiáveis:**
- `FLOW_REGIME` = sign(`zgr`/`gex.net_0dte`). O `gamma_condition` do relay = esse sinal em **100 %** dos registros RTH, todo dia, de 13/07 a 23/09.
- `STRUCTURAL_REGIME` = spot × `classic.zero_gamma`.
- Concordância diária: 44–100 %, tipicamente 67–90 %. Em 23/09 foi de 97–99 %; em 18/08, de 44 %.
- ⇒ No contrato Jev ficam **dois campos**. Contam como UMA família de independência (A-BOT gamma), não como duas confirmações.

**A4. O histórico do vendor é raso:** o teto é **10.000 linhas** por chamada.
- orderflow em 1 s: ≈ 4 h (só o pregão corrente);
- classic compact em ~11 s: ≈ 5 pregões (17–23/09), **sem** `strikes`/`max_priors`;
- state: sem histórico.
⇒ Um backfill do vendor não produz os 20–40 pregões do alvo de validação (VALIDATION_HISTORY_TARGET: NON_BLOCKING — alvo de evidência futura, não gate).

**A5. A única série longa local é `darkflow-web/data/gex-series/`**, gravada por `gex-series.js` a cada 30 s, com dedup por `vts` do vendor, ES e NQ.
- **Tem:** `gex0/gexn/gexof/cvr0/cvrof/dex0/dexof/vanna0/n/charm0/n/zg_gb/sum_gex_oi/pc_oi/rr` + `t` (chegada) e `vts` (vendor).
- **Não tem:** majors 0DTE, strikes, state nem SPY.
- **Cobertura RTH ES:**
  - 13/07–21/07: 6 pregões;
  - **22/07–30/07: buraco** (sem dado A-BOT);
  - 31/07–04/09: ≈ 25 pregões;
  - 09/09–23/09: ≈ 10 pregões, com 09/09 e 11/09 parciais.
- Atraso mediano `t − vts`: 6–32 s.
- 🔴 **Quebra de fonte em 09/09** (GexBot → GammaGex).
  - As medianas |x| ficam na mesma ordem de grandeza (gex0 2.642 → 2.601; dex0 1.166 → 1.627; charm0 121 → 228).
  - Mas **`pc_oi` sobe de 0,94 para 1,54**, e a escala de charm e vanna quase dobra.
  - ⇒ Não concatenar pré e pós 09/09 sem tratar a quebra como variável ou por split. O pós-09/09 sozinho tem ~10 pregões: **insuficiente**.

**A6. `iv30` na raiz é constante (14,47) em todos os registros desde julho: congelado, UNUSABLE.** Some-se a `extended_zone`, `spotgamma.*`, `qscore`, `dark_pool` e quinFields (P1/P2).

**A7. Frescor.** Em 19:38Z o classic, o state e o orderflow chegaram com 0–42 s de idade do vendor (a P2 mediu 90–100 s às 18:42Z: varia). O orderflow atualiza em 1 s (o `zgr` mudou em 100 % das linhas).
- `timestamp` é **epoch em segundos do vendor**, e é essa a referência causal.
- A idade do relay (`_relay.age_ms`) é outra coisa; o Jev precisa das duas.

**A8. `state/volume_zero`** existe no vendor (`levels[{p,v,v2}]`), mas não é servido pelo relay: RECEIVED_NOT_CAPTURED, semântica UNKNOWN. `mini_contracts` (state, 7 posições: `[strike, a, b, c, [x,y,z], 0, null]`) continua UNKNOWN. `strikes[i][3]` (5 priors) e `max_priors[6]` também: UNKNOWN (o código local supõe 1/5/10/15/30 min, sem documentação do vendor).

## 3. Inventário ES-first por papel (contrato `feature-contract.v1`)

| Campo (vendor, ES_SPX) | Papel | Direção | Série longa? | Status Jev |
|---|---|---|---|---|
| spot × classic `zero_gamma` | REGIME (estrutural) | 0 | gex-series `zg_gb`+`spot` (desde 13/07) | TIER 1 |
| sign(`zgr`) = `gex.net_0dte` | REGIME (fluxo 0DTE) | 0 | gex-series `gex0` | TIER 1 · mesma família de A3 |
| `ogr`, `gexoflow`, `one_gexoflow` | REGIME / POSITIONING_CHANGE | 0 | `gexn`, `gexof` | TIER 2 · `oflow` = UNKNOWN |
| `net_dex`, `net_call_dex`, `net_put_dex`, `agg_*`, `one_*` | DEALER STATE (entrada do hedge esperado) | **só via regra de hedge I1, nunca cru** | `dex0`, `dexof` | TIER 1 (net) / 2 (call/put, agg) |
| `zcvr`, `ocvr`, `cvroflow` | CONVEXIDADE (Hedging Direction) | idem | `cvr0`, `cvrof` | TIER 2 · semântica do vendor UNKNOWN |
| `zvanna`, `zcharm`, `o*` | DEALER STATE 2ª ordem | idem (sinal do vendor a verificar) | `vanna0/n`, `charm0/n` | TIER 2 · escala muda em 09/09 |
| `z_mlgamma`, `z_msgamma` | LOCATION 0DTE | 0 | **não** | TIER 1 · sem histórico |
| `zero_mcall`, `zero_mput` | LOCATION 0DTE (**semântica UNKNOWN**, A2) | 0 | **não** | TIER 2 |
| `one_mcall`, `one_mput`, `o_mlgamma`, `o_msgamma` | LOCATION next expiry | 0 | **não** | TIER 2 |
| classic `major_pos/neg_vol/oi`, `strikes`, `sum_gex_*`, `delta_risk_reversal` | LOCATION / REGIME | 0 | só classic history 5 pregões (sem strikes) | TIER 1 (majors) / 2 |
| state gregas por strike (delta/gamma/vanna/charm × zero/one) | DEALER STATE por strike (base do ΔDelta_dealer) | 0 | **não** | TIER 2 · único lugar com gregas por strike |
| SPY classic/state | CONFIRMATION SPX/SPY | 0 | **não** | TIER 2 · sem basis servido (ES/SPY instantâneo ≈ 10,12) |
| `pc_oi` da raiz | = \|net_put_dex\|/\|net_call_dex\| (**não é OI**) | 0 | `pc_oi` | TIER 3 · renomear `dex_put_call_ratio` |
| raiz: quinFields, `iv30`, `extended_zone`, `spotgamma.*`, `qscore`, `dark_pool`, `/api/gamma dealer_positioning` | — | — | — | **UNUSABLE** |

Perda por paridade NQ: **0** (reconfirmado; o SPY fica fora do orderflow por limitação do vendor).

## 4. Independência (para o Jev contar confirmações)

- **Família `ABOT_GAMMA`, que conta como 1:** regime estrutural, regime de fluxo, `gamma_condition`, `gexoflow`, majors 0DTE, majors classic e state gamma.
- **Família `ABOT_DEALER_DELTA`, que conta como 1:** DEX, CVR, vanna, charm e state delta, vanna e charm. É a entrada do EXPECTED_HEDGE: não é voto próprio, entra via a regra I1 de inversão por regime.
- **Sobreposição com as outras fontes:**
  - SPY classic ⊂ mesma família (mesmo vendor e metodologia);
  - MenthorQ confirmation-only é **outra** linhagem, mas as "9 estratégias" usam ZG e `gamma_condition` do A-BOT ⇒ **DOUBLE_COUNTING_RISK HIGH** (a P2 já tinha registrado isso; vale como regra de desenho);
  - QuantData zgGov e SpotGamma são outros vendors: SAME_CONCEPT, DIFFERENT_SOURCE.

## 5. Contrato de entrada compacto proposto (Jev, SHADOW, RASCUNHO — não implementado)

```
abot: {
  vendor_ts, relay_age_s, stale:bool,                     // causal = vendor_ts
  structural_regime: POS|NEG|UNKNOWN, dist_to_zg_pts,     // spot - classic.zero_gamma
  flow_regime: POS|NEG, gex0dte_pctl,                     // sign(zgr); percentil próprio rolling
  regime_agree: bool,                                     // A3
  dex0dte_net, dex_call, dex_put, cvr0dte, vanna0, charm0 // brutos + percentil; lado SÓ via I1
  levels_0dte: {mlgamma, msgamma, mcall, mput},           // distâncias ao spot; semântica UNKNOWN
  levels_next: {mlgamma, msgamma, mcall, mput},
  classic: {major_pos_vol, major_neg_vol, major_pos_oi, major_neg_oi},
  spy_confirm: {structural_regime} | null,
  quality: {fresh, complete, source_break_flag}
}
```
Regras que já valem (não re-derivar): futuros originam o lado; A-BOT nunca origina nem veta o lado sozinho; gamma → amplitude/leitura; o Jev é SHADOW_ONLY até existir pré-registro e teste.

## 6. Bloqueio de pesquisa (o que impede testar hoje)

1. **Não há histórico dos majors 0DTE/next, dos strikes nem do state**, nem local nem no vendor além de ~4 h / 5 pregões.
2. O `gex-series` tem agregados, mas cruza a quebra de 09/09 e tem o buraco de 22–30/07.
3. **Pré-requisito para qualquer estudo ES-first com níveis:** captura aditiva própria do orderflow ES_SPX (1 s, ou amostrada em 5–10 s), do classic zero/one com strikes e do state (delta/gamma/vanna/charm zero) e SPY classic, em armazenamento novo **dentro de `alfaomega-jev-future/`**, sem tocar no relay nem nos consumidores. 20–40 pregões são alvo de evidência para a validação futura (VALIDATION_HISTORY_TARGET: NON_BLOCKING); não bloqueiam o design nem o congelamento do pré-registro (correção de governança 23/09).
   - **NÃO iniciado:** exige ordem explícita do operador.

## 7. Candidatos de padrão ES (RESEARCH_HYPOTHESIS, sem threshold, exigem pré-registro)

- **ESF1 (REGIME_DISAGREEMENT):** `structural_regime ≠ flow_regime` ⇒ amplitude/instabilidade. Testável já no `gex-series` pré-09/09 (≈ 30 pregões) como amplitude, nunca como lado.
- **ESF2 (LEVEL_INTERACTION 0DTE):** toque/cruzamento de `z_msgamma` e `z_mlgamma` × reação do ES. Exige a captura do §6.
- **ESF3 (NEXT_EXPIRY_WALLS):** `one_mcall`/`one_mput` como barreira. Exige a captura do §6.
- **ESF4 (DEALER_HEDGE_CONFLICT):** hedge esperado (I1 sobre `dex0`/`cvr0`) contra o lado dos futuros ⇒ NO_TRADE_CONTEXT. Agregados disponíveis no `gex-series`, com quebra de fonte.
- **ESF5 (CHARM_LAST_HOUR):** `charm0` × drift da última hora. Depende de verificar o sinal do vendor.

---
PRIMARY MARKET: ES · OPTIONS ECOSYSTEM: SPX (ES_SPX) / SPY · NQ: SECONDARY
A-BOT ROLE: DEALER / 0DTE / DEX-GEX CONTEXT — NEVER SIDE ORIGIN
HISTORY SUFFICIENT FOR TEST: NO (levels/state) · PARTIAL (aggregates, source break 09/09)
FIELDS LOST TO NQ PARITY: 0 · CURRENT SYSTEM CHANGED: NO · IMPLEMENTATION: NONE · F5: NO

---
## ADENDO 24/09 (sessão 507b9f4b): pacote dos 4 indicadores (NetGex0DTE, DexGexFlow, Classic, State)

**Status:** 4/4 COMPLETE. Nada foi alterado.
- **Detalhe por indicador:** `ABOT_GAMMAGEX_ES_FIRST_AUDIT_20260923.md`.
- **Matriz campo × classe Jev:** `data/gammagex-field-inventory.json` (25 linhas).
- **Lineage:** `data/gammagex-source-lineage.json`.
- **Clusters de double counting:** `data/gammagex-double-counting-map.json`.
- **Candidatos:** `data/gammagex-jev-candidates.json`.

**Pistas históricas revalidadas:**
- `gamma_condition` = sign(`net_0dte`): **CONFIRMADO**.
- `pc_oi` = |`dex.net_put_0dte`| / |`dex.net_call_0dte`|, com 3,62 medido contra 3,6202 calculado. **CONFIRMADO: é DEX, não OI.**
- `/api/gamma` `dealer_positioning` = SHORT_GAMMA, contra POSITIVE e `net_0dte` +22.406: **stale PROVÁVEL.**
- Perda ES por paridade NQ nos 4: **NÃO COMPROVADA.**

**SPX→ES:** o ES_SPX = preço do ESZ6 front (±1,3 pt contra o NT8). O SPY vem cru.
