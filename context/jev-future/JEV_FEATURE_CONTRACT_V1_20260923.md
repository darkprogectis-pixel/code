# JEV FEATURE CONTRACT V1 (23/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | DEFINITION ONLY — contrato de entrada |
| IMPLEMENTATION | NONE |
| PRODUCTION | OUT OF SCOPE / UNCHANGED |
| F5 | NOT PERFORMED |
| Regido por | `JEV_DEALER_CONTEXT_CONTRACT_20260923.md` · `PROJECT_SCOPE_JEV_FUTURE_20260923.md` |
| Máquina | `data/jev-feature-contract-v1.json` · `data/jev-double-counting-groups-v1.json` |
| Gerador | `scripts/build-jev-feature-contract-v1.js` (determinístico; valida campos obrigatórios, ids únicos, SPX no final context e cobertura do schema) |

## 1. Resumo

- **Campos:** 190 no total.
  - Quatro fontes A-Bot: 174.
  - `spx_final_context.*`: 16 (TRACE 9, VolSignals 7).
- **Descartes:** 0 campos descartados. Chaves do schema auditado sem feature: 0.
- **Templates:** cada `feature_id` é um campo. Ticker × categoria são `instances`, resolvidos na ingestão como `<feature_id>@<ticker>/<categoria>`.
  - Tickers: SPX PRIMARY; SPY SUPPORTING (`market_origin=SPY`); NDX/QQQ SECONDARY_OPTIONAL.
  - Categorias: classic `zero|one|full`, state `gex_*` e `<greek>_zero|one`.
- **jev_role (rótulo, não peso):** PRIMARY_CONTEXT 1 · SUPPORTING_CONTEXT 35 · LOCATION_CONTEXT 27 · REGIME_CONTEXT 6 · STRUCTURE_CONTEXT 26 · CONFIRMATION_CONTEXT 1 · FINAL_DECISION_CONTEXT 15 · DIAGNOSTIC_ONLY 69 · UNKNOWN 10.
- **Fora das 4 fontes (não é descarte):** as chaves do envelope do relay composto (`trading_enabled, desk_status, date, source, dark_pool, flow_hiro, signals, narrative, macro_news, llm_news_alert`). Elas pertencem a outros sistemas.

## 2. Regras

1. **Quatro fontes completas.** Nenhum campo documentado sai do contrato, nem os redundantes, degenerados, stale, null, UNKNOWN ou não usados. Esses ficam marcados em `quality_state`, `availability` e `jev_role`.
2. **`jev_role` não é peso, prioridade nem lado.** Não há score, conviction, LONG/SHORT nem gate.
3. **`market_origin` preserva a origem real.** As 4 fontes A-Bot têm `market_origin=SPX` (opções SPX), com `underlying=ES_SPX` como mapeamento do vendor. O mapeamento não muda a identidade: o inventário anterior dizia "ES_DIRECT", e isso descreve a **escala**, não a origem. SPY é `market_origin=SPY`.
4. **`spx_final_context.*` entra depois das quatro fontes.**
   - TRACE (`SpotGamma_TRACE`) e VolSignals (`VolSignals`) têm `market_origin=SPX`, nunca ES_NATIVE. São namespaces separados e não se fundem.
   - Gamma: PARTIAL_ANALOG. Os outros 6 campos: INSUFFICIENT_INFORMATION.
   - Unidades VolSignals: UNKNOWN ⇒ `numeric_equivalence_allowed=false`.
   - `deltaExposureDiff`: int64, 3678/3678 = 0, função UNKNOWN.
5. **Double counting:** 1 evidência por grupo (§5). Membro SUSPECTED conta junto até que uma medição prove independência.
6. **Quebra de 09/09** (GexBot→GammaGex; SPX cru → ESZ6): nunca misturar sem ajuste.

## 3. Freshness (por fonte)

- **Princípio.** `freshness_basis = vendor_timestamp` sempre que existir.
  - `arrival_timestamp` **nunca** é base: com ela, uma fonte congelada parece fresca, que é o FAIL-OPEN atual de NetGex0DTE/DexGexFlow.
  - `transport_timestamp` (`_relay.served`) descreve o cache do relay (ttl 20 s), não o dado.
  - Todo registro de ingestão carrega `arrival_timestamp`, `route`, `http_status` e `payload_sha256`.
- **Estados:** FRESH · STALE · FROZEN · FROZEN_VALUES · MARKET_CLOSED · UNKNOWN.

| regra | vendor_timestamp | transport_timestamp | freshness_basis | limiar | nota |
|---|---|---|---|---|---|
| FR_ROOT_ORDERFLOW | instruments.<I>.timestamp | NENHUM (raiz nao tem _relay) | VENDOR_TIMESTAMP | 60 s (PROVISIONAL) | fora do RTH (09:30-16:00 ET) o estado e MARKET_CLOSED, nao STALE |
| FR_ROOT_CLASSIC_COPY | instruments.<I>.classic.timestamp | NENHUM | VENDOR_TIMESTAMP | 300 s (PROVISIONAL) | fora do RTH (09:30-16:00 ET) o estado e MARKET_CLOSED, nao STALE |
| FR_MENTHORQ_MERGE | levels._asof | NENHUM | VENDOR_TIMESTAMP (asof do merge) | — | _menthorq_source null ou valor null => quality NULL; nunca herdar freshness do orderflow |
| FR_CLASSIC | timestamp | _relay.served | VENDOR_TIMESTAMP | 300 s (PROVISIONAL) | timestamp ausente => UNKNOWN (o indicador atual usa idade 0: proibido); _relay.stale/age_ms = cache (ttl 20 s), nao dado |
| FR_STATE | timestamp | _relay.served | VENDOR_TIMESTAMP | 300 s (PROVISIONAL) | checar _relay.ticker == ticker pedido; _relay.tem_majors nao e confiavel |
| FR_CACHE_HISTORY | t | NENHUM | VENDOR_TIMESTAMP (historico) | — | historico: freshness nao se aplica; deduplicar por t; recortar pregao por t, nunca pelo nome do arquivo; dias com distinct_t = 1 sao estado de fechamento, nao pregao |
| FR_FROZEN_BLOCK | — | — | VALUE_CONSTANCY | — | blocos congelados (iv30d 14,47 desde julho; blocos 22/06) => FROZEN_VALUES independentemente de timestamp |
| FR_INDICATOR_DERIVED | — | — | HERDADO do campo de origem | — | nunca mais fresco que a origem |
| FR_TRACE | instante do grid (raw/TRACE_TIMESTAMPS) | resposta REST/JSON do vendor | VENDOR_TIMESTAMP | — | anti-lookahead: bin i so disponivel em t[i+1]; dados BACKFILL = PENDING_REVISION_AUDIT; LIVE ≠ EOD ate a auditoria de revisao classificar |
| FR_VOLSIGNALS | UNKNOWN (eixo timestamp do grid) | protobuf/RPC (UNKNOWN) | UNKNOWN | — | sem basis definida => quality UNKNOWN; nunca FRESH por default |

Os limiares PROVISIONAL são só um ponto de partida e precisam ser calibrados na captura própria.

## 4. Campos

### 4.1 ROOT — bloco instruments.<ES|NQ> (NetGex0DTE, DexGexFlow) (73)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `abot.root.spot` | spot | preco do subjacente servido (ES_SPX = ESZ6 front ±1,3 pt vs NT8) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_SPOT_PRICE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.timestamp` | timestamp | vendor timestamp do bloco | RAW | n/a (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.root.gamma_condition` | gamma_condition | regime gamma 0DTE = sign(gex.net_0dte) | DERIVED | n/a (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_GEX0_SIGN | LIVE | OK | REGIME_CONTEXT |
| `abot.root.pc_oi` | pc_oi | razao \|dex.net_put_0dte\| / \|dex.net_call_0dte\| (NAO e OI) | DERIVED | razao adimensional (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE_UNUSED | MISLABELED | SUPPORTING_CONTEXT |
| `abot.root.gex.net_0dte` | gex.net_0dte | GEX liquido 0DTE (zgr) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_GEX0_SIGN | LIVE | OK | PRIMARY_CONTEXT |
| `abot.root.gex.net_next` | gex.net_next | GEX liquido next expiry (ogr) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_GEX_NEXT | LIVE | OK | REGIME_CONTEXT |
| `abot.root.gex.cvr_0dte` | gex.cvr_0dte | cvr 0DTE | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.gex.cvr_next` | gex.cvr_next | cvr next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.gex.oflow` | gex.oflow | oflow GEX 0DTE | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.gex.oflow_next` | gex.oflow_next | oflow GEX next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.dex.net_0dte` | dex.net_0dte | DEX liquido 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE | OK | CONFIRMATION_CONTEXT |
| `abot.root.dex.agg_0dte` | dex.agg_0dte | DEX agregado 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.net_call_0dte` | dex.net_call_0dte | DEX liquido calls 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.net_put_0dte` | dex.net_put_0dte | DEX liquido puts 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.agg_call_0dte` | dex.agg_call_0dte | DEX agregado calls 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.agg_put_0dte` | dex.agg_put_0dte | DEX agregado puts 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_0DTE | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.net_next` | dex.net_next | DEX liquido next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.agg_next` | dex.agg_next | DEX agregado next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.net_call_next` | dex.net_call_next | DEX liquido calls next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.net_put_next` | dex.net_put_next | DEX liquido puts next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.agg_call_next` | dex.agg_call_next | DEX agregado calls next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.agg_put_next` | dex.agg_put_next | DEX agregado puts next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_DEX_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.dex.oflow` | dex.oflow | oflow DEX 0DTE | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.dex.oflow_next` | dex.oflow_next | oflow DEX next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.vanna.net_0dte` | vanna.net_0dte | vanna liquido 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_VANNA_0DTE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.vanna.net_next` | vanna.net_next | vanna liquido next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_VANNA_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.charm.net_0dte` | charm.net_0dte | charm liquido 0dte | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_CHARM_0DTE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.charm.net_next` | charm.net_next | charm liquido next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_CHARM_NEXT | LIVE_UNUSED | OK | SUPPORTING_CONTEXT |
| `abot.root.orderflow.cvr_oflow` | orderflow.cvr_oflow | cvr_oflow 0DTE | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.orderflow.cvr_oflow_next` | orderflow.cvr_oflow_next | cvr_oflow next | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_OFLOW_CVR_UNKNOWN | LIVE_UNUSED | UNKNOWN_SEMANTICS | UNKNOWN |
| `abot.root.orderflow.zero_mcall` | orderflow.zero_mcall | major call 0DTE (≡ classic/zero.major_pos_vol) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_0DTE | LIVE_UNUSED | OK | LOCATION_CONTEXT |
| `abot.root.orderflow.zero_mput` | orderflow.zero_mput | major put 0DTE (≡ state/gex_zero.major_neg_vol) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_0DTE | LIVE_UNUSED | UNKNOWN_SEMANTICS | LOCATION_CONTEXT |
| `abot.root.orderflow.z_mlgamma` | orderflow.z_mlgamma | major long gamma 0DTE (≡ state greek major_long_gamma) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_0DTE | LIVE_UNUSED | OK | LOCATION_CONTEXT |
| `abot.root.orderflow.z_msgamma` | orderflow.z_msgamma | major short gamma 0DTE (≡ state major_short_gamma ≡ levels.short_gamma_0dte) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_0DTE | LIVE_UNUSED | OK | LOCATION_CONTEXT |
| `abot.root.levels.hvl` | levels.hvl | nivel hvl (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.call_resistance` | levels.call_resistance | nivel call_resistance (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.put_support` | levels.put_support | nivel put_support (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.gamma_wall_0dte` | levels.gamma_wall_0dte | nivel gamma_wall_0dte (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.put_support_0dte` | levels.put_support_0dte | nivel put_support_0dte (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.hvl_0dte` | levels.hvl_0dte | nivel hvl_0dte (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.call_resistance_0dte` | levels.call_resistance_0dte | nivel call_resistance_0dte (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.day_min` | levels.day_min | nivel day_min (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.day_max` | levels.day_max | nivel day_max (quinField MenthorQ) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels.distance_to_hvl_pct` | levels.distance_to_hvl_pct | distancia % ao HVL | DERIVED | percentual (INFERRED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_MENTHORQ_LEVELS | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels._menthorq_source` | levels._menthorq_source | origem do merge MenthorQ | RAW | n/a (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_NON_EVIDENCE_META | NULL_AT_SOURCE | NULL | DIAGNOSTIC_ONLY |
| `abot.root.levels._asof` | levels._asof | asof do bloco levels | RAW | n/a (CONFIRMED) | FR_MENTHORQ_MERGE | LG_MENTHORQ_MERGE | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.root.levels.short_gamma_0dte` | levels.short_gamma_0dte | alias de orderflow.z_msgamma | DERIVED | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_0DTE | LIVE | OK | LOCATION_CONTEXT |
| `abot.root.levels.short_gamma_next` | levels.short_gamma_next | short gamma next expiry | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_NEXT | LIVE | OK | LOCATION_CONTEXT |
| `abot.root.levels.next_exp_hvl` | levels.next_exp_hvl | next_exp_hvl (orderflow next) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_NEXT | LIVE_UNUSED | OK | LOCATION_CONTEXT |
| `abot.root.levels.next_exp_call_res` | levels.next_exp_call_res | next_exp_call_res (orderflow next) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_NEXT | LIVE_UNUSED | OK | LOCATION_CONTEXT |
| `abot.root.levels.next_exp_put_sup` | levels.next_exp_put_sup | next_exp_put_sup (orderflow next) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_ORDERFLOW | LG_ORDERFLOW_SPX | DC_MAJORS_NEXT | LIVE_UNUSED | OK | LOCATION_CONTEXT |
| `abot.root.classic.zero_gamma` | classic.zero_gamma | zero gamma 0DTE (copia raiz) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_ZERO_GAMMA_0DTE | LIVE | OK | REGIME_CONTEXT |
| `abot.root.classic.major_pos_vol` | classic.major_pos_vol | major positivo por volume 0DTE | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_MAJORS_0DTE | LIVE | OK | LOCATION_CONTEXT |
| `abot.root.classic.major_neg_vol` | classic.major_neg_vol | major negativo por volume 0DTE | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_MAJORS_0DTE | LIVE | OK | LOCATION_CONTEXT |
| `abot.root.classic.major_pos_oi` | classic.major_pos_oi | major positivo por OI 0DTE | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_MAJORS_0DTE | LIVE | OK | LOCATION_CONTEXT |
| `abot.root.classic.major_neg_oi` | classic.major_neg_oi | major negativo por OI 0DTE | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_MAJORS_0DTE | LIVE | OK | LOCATION_CONTEXT |
| `abot.root.classic.sum_gex_vol` | classic.sum_gex_vol | soma GEX por volume 0DTE | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE_ZERO | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.root.classic.sum_gex_oi` | classic.sum_gex_oi | soma GEX por OI 0DTE | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE_ZERO | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.root.classic.delta_risk_reversal` | classic.delta_risk_reversal | delta risk reversal | RAW | UNKNOWN (UNKNOWN) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_RISK_REVERSAL | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.classic.min_dte` | classic.min_dte | menor DTE da serie | RAW | dias (INFERRED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.classic.sec_min_dte` | classic.sec_min_dte | segundo menor DTE | RAW | dias (INFERRED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.classic.spot` | classic.spot | spot do classic (copia raiz) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_SPOT_PRICE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.root.classic.timestamp` | classic.timestamp | vendor timestamp do classic (copia raiz) | RAW | n/a (CONFIRMED) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.root.classic.strikes` | classic.strikes | perfil por strike [strike,gex_vol,gex_oi,[5 priors]] (copia raiz) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE_ZERO | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.root.classic.max_priors` | classic.max_priors | max_priors[6] (copia raiz) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_ROOT_CLASSIC_COPY | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE_ZERO | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.root.iv30d` | iv30d | bloco iv30d da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | FROZEN | DIAGNOSTIC_ONLY |
| `abot.root.extended_zone` | extended_zone | bloco extended_zone da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | STALE | DIAGNOSTIC_ONLY |
| `abot.root.spotgamma` | spotgamma | bloco spotgamma da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | STALE | DIAGNOSTIC_ONLY |
| `abot.root.qscore` | qscore | bloco qscore da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | STALE | DIAGNOSTIC_ONLY |
| `abot.root.dark_pool_analysis` | dark_pool_analysis | bloco dark_pool_analysis da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | STALE | DIAGNOSTIC_ONLY |
| `abot.root.blind_spots` | blind_spots | bloco blind_spots da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | UNKNOWN | DIAGNOSTIC_ONLY |
| `abot.root.bl_scores` | bl_scores | bloco bl_scores da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | UNKNOWN | DIAGNOSTIC_ONLY |
| `abot.root.implied_vol` | implied_vol | bloco implied_vol da raiz | UNKNOWN | UNKNOWN (UNKNOWN) | FR_FROZEN_BLOCK | LG_ROOT_LEGACY_BLOCKS | DC_ROOT_LEGACY_BLOCKS | LIVE_UNUSED | UNKNOWN | DIAGNOSTIC_ONLY |


### 4.2 Derivados dentro dos indicadores (2)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `abot.ind.netgex0dte.label_color` | cor/rotulo COMPRA\|VENDA do histograma | sign(net_0dte) exibido como lado | DERIVED | n/a (CONFIRMED) | FR_INDICATOR_DERIVED | LG_ORDERFLOW_SPX | DC_GEX0_SIGN | INDICATOR_ONLY | SEMANTIC_CONFLICT | DIAGNOSTIC_ONLY |
| `abot.ind.dexgexflow.heat_trail` | rastro heat (permanencia de niveis) | heatmap de permanencia dos niveis desenhados | DERIVED | UNKNOWN (UNKNOWN) | FR_INDICATOR_DERIVED | LG_ORDERFLOW_SPX | DC_MAJORS_0DTE | INDICATOR_ONLY | OK | DIAGNOSTIC_ONLY |


### 4.3 CLASSIC /gexbot/classic/{T}/{zero|one|full} (26)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `abot.classic.timestamp` | timestamp | vendor timestamp | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic.ticker` | ticker | ticker servido | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic.min_dte` | min_dte | menor DTE | RAW | dias (INFERRED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.classic.sec_min_dte` | sec_min_dte | segundo menor DTE | RAW | dias (INFERRED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.classic.spot` | spot | spot | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_SPOT_PRICE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.classic.zero_gamma` | zero_gamma | zero gamma | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_ZERO_GAMMA::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | REGIME_CONTEXT |
| `abot.classic.major_pos_vol` | major_pos_vol | major positivo (volume) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_MAJORS::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | LOCATION_CONTEXT |
| `abot.classic.major_pos_oi` | major_pos_oi | major positivo (OI) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_MAJORS::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | LOCATION_CONTEXT |
| `abot.classic.major_neg_vol` | major_neg_vol | major negativo (volume) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_MAJORS::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | LOCATION_CONTEXT |
| `abot.classic.major_neg_oi` | major_neg_oi | major negativo (OI) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_MAJORS::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | LOCATION_CONTEXT |
| `abot.classic.strikes[].strike` | strikes[].strike | strike (escala ES_SPX) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.strikes[].gex_vol` | strikes[].gex_vol | GEX por strike (volume) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.strikes[].gex_oi` | strikes[].gex_oi | GEX por strike (OI) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.strikes[].priors[0..4]` | strikes[].priors[0..4] | 5 valores anteriores de gex_vol no strike | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.sum_gex_vol` | sum_gex_vol | soma GEX (volume) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.sum_gex_oi` | sum_gex_oi | soma GEX (OI) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.delta_risk_reversal` | delta_risk_reversal | delta risk reversal | RAW | UNKNOWN (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_RISK_REVERSAL | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.classic.max_priors[0..5]` | max_priors[0..5] | max_priors (6 valores) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CLASSIC | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE::{zero->0DTE\|one->NEXT\|full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.classic.conversion` | conversion | bloco de conversao | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.ticker` | _relay.ticker | relay ticker | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.cat` | _relay.cat | relay cat | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.cached` | _relay.cached | relay cached | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.stale` | _relay.stale | relay stale | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.age_ms` | _relay.age_ms | relay age_ms | RAW | ms (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.ttl_ms` | _relay.ttl_ms | relay ttl_ms | RAW | ms (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.classic._relay.served` | _relay.served | relay served | RAW | n/a (CONFIRMED) | FR_CLASSIC | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |


### 4.4 AoClassicCache (histórico local) (11)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `abot.cache.t` | t | vendor timestamp (epoch s UTC) (espelho de classic.timestamp) | RAW | epoch s UTC (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | HISTORY_LOCAL | OK | DIAGNOSTIC_ONLY |
| `abot.cache.sp` | sp | spot (espelho de classic.spot) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_SPOT_PRICE | HISTORY_LOCAL | OK | SUPPORTING_CONTEXT |
| `abot.cache.zg` | zg | zero gamma (espelho de classic.zero_gamma) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_ZERO_GAMMA_FULL | HISTORY_LOCAL | OK | REGIME_CONTEXT |
| `abot.cache.mpv` | mpv | major positivo (volume) (espelho de classic.major_pos_vol) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_MAJORS_FULL | HISTORY_LOCAL | OK | LOCATION_CONTEXT |
| `abot.cache.mnv` | mnv | major negativo (volume) (espelho de classic.major_neg_vol) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_MAJORS_FULL | HISTORY_LOCAL | OK | LOCATION_CONTEXT |
| `abot.cache.mpo` | mpo | major positivo (OI) (espelho de classic.major_pos_oi) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_MAJORS_FULL | HISTORY_LOCAL | OK | LOCATION_CONTEXT |
| `abot.cache.mno` | mno | major negativo (OI) (espelho de classic.major_neg_oi) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_MAJORS_FULL | HISTORY_LOCAL | OK | LOCATION_CONTEXT |
| `abot.cache.sv` | sv | soma GEX (volume) (espelho de classic.sum_gex_vol) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE_FULL | HISTORY_LOCAL | OK | STRUCTURE_CONTEXT |
| `abot.cache.so` | so | soma GEX (OI) (espelho de classic.sum_gex_oi) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_CLASSIC_GEX_PROFILE_FULL | HISTORY_LOCAL | OK | STRUCTURE_CONTEXT |
| `abot.cache.cm` | cm | multiplicador de conversao aplicado (espelho de classic.ConvMul) | RAW | n/a (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | HISTORY_LOCAL | OK | DIAGNOSTIC_ONLY |
| `abot.cache.ca` | ca | aditivo de conversao aplicado (espelho de classic.ConvAdd) | RAW | n/a (CONFIRMED) | FR_CACHE_HISTORY | LG_CLASSIC_SPX | DC_NON_EVIDENCE_META | HISTORY_LOCAL | OK | DIAGNOSTIC_ONLY |


### 4.5 STATE GexProfile gex_{zero|one|full} (29)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `abot.state_gex.timestamp` | timestamp | vendor timestamp | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex.ticker` | ticker | ticker | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex.min_dte` | min_dte | menor DTE | RAW | dias (INFERRED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_gex.sec_min_dte` | sec_min_dte | segundo menor DTE | RAW | dias (INFERRED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_gex.spot` | spot | spot | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_SPOT_PRICE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_gex.zero_gamma` | zero_gamma | zero gamma (DEGENERADO = 0 no state) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | DEGENERATE | DIAGNOSTIC_ONLY |
| `abot.state_gex.major_pos_vol` | major_pos_vol | major positivo (volume) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | LOCATION_CONTEXT |
| `abot.state_gex.major_pos_oi` | major_pos_oi | major positivo (OI) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | DEGENERATE | DIAGNOSTIC_ONLY |
| `abot.state_gex.major_neg_vol` | major_neg_vol | major negativo (volume) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | LOCATION_CONTEXT |
| `abot.state_gex.major_neg_oi` | major_neg_oi | major negativo (OI) | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | DEGENERATE | DIAGNOSTIC_ONLY |
| `abot.state_gex.strikes[].strike` | strikes[].strike | strike | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_STATE_GEX_PROFILE::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_gex.strikes[].gex_vol` | strikes[].gex_vol | GEX por strike (volume) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_STATE_GEX_PROFILE::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_gex.strikes[].gex_oi` | strikes[].gex_oi | GEX por strike (OI) — sempre 0 | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | DEGENERATE | DIAGNOSTIC_ONLY |
| `abot.state_gex.strikes[].priors[0..4]` | strikes[].priors[0..4] | 5 valores anteriores de gex_vol | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_STATE_GEX_PROFILE::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_gex.sum_gex_vol` | sum_gex_vol | imbalance GEX (soma volume) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_STATE_GEX_PROFILE::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | REGIME_CONTEXT |
| `abot.state_gex.sum_gex_oi` | sum_gex_oi | soma GEX (OI) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | DEGENERATE | DIAGNOSTIC_ONLY |
| `abot.state_gex.delta_risk_reversal` | delta_risk_reversal | delta risk reversal | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_RISK_REVERSAL | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_gex.max_priors[0..5]` | max_priors[0..5] | max_priors (6) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_STATE_GEX_PROFILE::{gex_zero->0DTE\|gex_one->NEXT\|gex_full->FULL} | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_gex.conversion` | conversion | conversao (multiplier/additive/future_contract ausentes) | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.ticker` | _relay.ticker | relay ticker | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.cat` | _relay.cat | relay cat | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.cached` | _relay.cached | relay cached | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.stale` | _relay.stale | relay stale | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.age_ms` | _relay.age_ms | relay age_ms | RAW | ms (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.ttl_ms` | _relay.ttl_ms | relay ttl_ms | RAW | ms (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.served` | _relay.served | relay served | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.grade` | _relay.grade | relay grade | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.n` | _relay.n | relay n | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_gex._relay.tem_majors` | _relay.tem_majors | relay tem_majors | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |


### 4.6 STATE OptionsProfile {delta|gamma|vanna|charm}_{zero|one} (33)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `abot.state_greek.timestamp` | timestamp | vendor timestamp | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek.ticker` | ticker | ticker | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek.spot` | spot | spot | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_SPOT_PRICE | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_greek.min_dte` | min_dte | menor DTE | RAW | dias (INFERRED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_greek.sec_min_dte` | sec_min_dte | segundo menor DTE | RAW | dias (INFERRED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_greek.major_positive` | major_positive | major positivo da grega | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{*_zero->0DTE\|*_one->NEXT} | LIVE | OK | LOCATION_CONTEXT |
| `abot.state_greek.major_negative` | major_negative | major negativo da grega | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{*_zero->0DTE\|*_one->NEXT} | LIVE | OK | LOCATION_CONTEXT |
| `abot.state_greek.major_long_gamma` | major_long_gamma | major long gamma | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{*_zero->0DTE\|*_one->NEXT} | LIVE | OK | LOCATION_CONTEXT |
| `abot.state_greek.major_short_gamma` | major_short_gamma | major short gamma | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_MAJORS::{*_zero->0DTE\|*_one->NEXT} | LIVE | OK | LOCATION_CONTEXT |
| `abot.state_greek.mini_contracts[].strike` | mini_contracts[].strike | strike | RAW | indice em pontos, escala ES_SPX (ESZ6); SPX cru antes de 09/09 (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.mini_contracts[].call_ivol` | mini_contracts[].call_ivol | IV/volume call no strike (col 1) | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_STATE_IVOL::{*_zero->0DTE\|*_one->NEXT} | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_greek.mini_contracts[].put_ivol` | mini_contracts[].put_ivol | IV/volume put no strike (col 2) | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_STATE_IVOL::{*_zero->0DTE\|*_one->NEXT} | LIVE | OK | SUPPORTING_CONTEXT |
| `abot.state_greek.mini_contracts[].col5` | mini_contracts[].col5 | coluna 5 (0 na amostra) | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_UNKNOWN_COLUMNS | LIVE | OK | UNKNOWN |
| `abot.state_greek.mini_contracts[].col6` | mini_contracts[].col6 | coluna 6 (null na amostra) | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_UNKNOWN_COLUMNS | LIVE | OK | UNKNOWN |
| `abot.state_greek.conversion` | conversion | conversao | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek.delta.mini_contracts[].greek_value` | mini_contracts[][3] | delta do dealer por strike (col 3; categorias delta_zero\|delta_one) | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_DEX::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED: delta por strike vs dex agregado) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.delta.mini_contracts[].priors[0..2]` | mini_contracts[][4] | 3 valores anteriores de delta no strike | RAW | UNKNOWN (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_DEX::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED: delta por strike vs dex agregado) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.gamma.mini_contracts[].greek_value` | mini_contracts[][3] | gamma do dealer por strike (col 3; categorias gamma_zero\|gamma_one) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_GEX_SIGN::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.gamma.mini_contracts[].priors[0..2]` | mini_contracts[][4] | 3 valores anteriores de gamma no strike | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_GEX_SIGN::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.vanna.mini_contracts[].greek_value` | mini_contracts[][3] | vanna do dealer por strike (col 3; categorias vanna_zero\|vanna_one) | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_VANNA::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.vanna.mini_contracts[].priors[0..2]` | mini_contracts[][4] | 3 valores anteriores de vanna no strike | RAW | UNKNOWN ($MM presumido, sem doc) (UNKNOWN) | FR_STATE | LG_STATE_SPX | DC_VANNA::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.charm.mini_contracts[].greek_value` | mini_contracts[][3] | charm do dealer por strike (col 3; categorias charm_zero\|charm_one) | RAW | $MM/hr (tooltip do vendor) (INFERRED) | FR_STATE | LG_STATE_SPX | DC_CHARM::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek.charm.mini_contracts[].priors[0..2]` | mini_contracts[][4] | 3 valores anteriores de charm no strike | RAW | $MM/hr (tooltip do vendor) (INFERRED) | FR_STATE | LG_STATE_SPX | DC_CHARM::{*_zero->0DTE\|*_one->NEXT} (SUSPECTED) | LIVE | OK | STRUCTURE_CONTEXT |
| `abot.state_greek._relay.ticker` | _relay.ticker | relay ticker | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.cat` | _relay.cat | relay cat | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.cached` | _relay.cached | relay cached | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.stale` | _relay.stale | relay stale | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.age_ms` | _relay.age_ms | relay age_ms | RAW | ms (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.ttl_ms` | _relay.ttl_ms | relay ttl_ms | RAW | ms (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.served` | _relay.served | relay served | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.grade` | _relay.grade | relay grade | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.n` | _relay.n | relay n | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |
| `abot.state_greek._relay.tem_majors` | _relay.tem_majors | relay tem_majors | RAW | n/a (CONFIRMED) | FR_STATE | LG_STATE_SPX | DC_NON_EVIDENCE_META | LIVE | OK | DIAGNOSTIC_ONLY |


### 4.7 spx_final_context.trace.* (SpotGamma_TRACE, market_origin=SPX) (9)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `spx_final_context.trace.gamma_mm` | mm_gamma[_0] (parquet TRACE; menu "Gamma", mkt_actor=mm) | TRACE gamma do market maker (timestamp × preco) | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_FINAL_GAMMA | CAPTURED_1D | PENDING_REVISION_AUDIT | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.gamma_cust` | cust_gamma[_0] (parquet TRACE) | TRACE gamma do participante cust | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_TRACE_PARTICIPANTS | CAPTURED_1D | PENDING_REVISION_AUDIT | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.gamma_procust` | procust_gamma[_0] (parquet TRACE) | TRACE gamma do participante procust | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_TRACE_PARTICIPANTS | CAPTURED_1D | PENDING_REVISION_AUDIT | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.gamma_firm` | firm_gamma[_0] (parquet TRACE) | TRACE gamma do participante firm | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_TRACE_PARTICIPANTS | CAPTURED_1D | PENDING_REVISION_AUDIT | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.gamma_bd` | bd_gamma[_0] (parquet TRACE) | TRACE gamma do participante bd | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_TRACE_PARTICIPANTS | CAPTURED_1D | PENDING_REVISION_AUDIT | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.delta_pressure` | menu "Delta Pressure" (/cloud spot/delta; endpoint real nao vinculado) | TRACE Delta Pressure | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_TRACE_DELTA | NOT_CAPTURED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.charm_pressure` | menu "Charm Pressure" | TRACE Charm Pressure | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_TRACE_CHARM | NOT_CAPTURED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.stats` | raw/TRACE_STATS | TRACE stats/percentis | RAW | UNKNOWN (UNKNOWN) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_SPX_FINAL_GAMMA | CAPTURED_1D | PENDING_REVISION_AUDIT | FINAL_DECISION_CONTEXT |
| `spx_final_context.trace.timestamps` | raw/TRACE_TIMESTAMPS | instantes disponiveis do grid | RAW | n/a (CONFIRMED) | FR_TRACE | LG_SPX_OPTIONS_TRADES_SPOTGAMMA | DC_NON_EVIDENCE_META | CAPTURED_1D | PENDING_REVISION_AUDIT | DIAGNOSTIC_ONLY |


### 4.8 spx_final_context.volsignals.* (VolSignals, market_origin=SPX) (7)

| feature_id | source_field | semantic_name | raw/der | unit (conf) | freshness | lineage | double_counting_group | avail | quality | jev_role |
|---|---|---|---|---|---|---|---|---|---|---|
| `spx_final_context.volsignals.gammaExposure` | gammaExposure | VolSignals gamma exposure ("Simulated") | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_FINAL_GAMMA | PIPELINE_IDENTIFIED | PARTIAL_ANALOG | FINAL_DECISION_CONTEXT |
| `spx_final_context.volsignals.charmExposure` | charmExposure | VolSignals charmExposure | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_VOLSIGNALS_CHARM | PIPELINE_IDENTIFIED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.volsignals.deltaChangeExposure` | deltaChangeExposure | VolSignals deltaChangeExposure | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_VOLSIGNALS_DELTACHANGE | PIPELINE_IDENTIFIED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.volsignals.deltaTotalExposure` | deltaTotalExposure | VolSignals deltaTotalExposure | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_VOLSIGNALS_DELTATOTAL | PIPELINE_IDENTIFIED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.volsignals.vannaExposure` | vannaExposure | VolSignals vannaExposure | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_VOLSIGNALS_VANNA | PIPELINE_IDENTIFIED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.volsignals.volgaExposure` | volgaExposure | VolSignals volgaExposure | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_VOLSIGNALS_VOLGA | PIPELINE_IDENTIFIED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |
| `spx_final_context.volsignals.deltaExposureDiff` | deltaExposureDiff | VolSignals deltaExposureDiff | RAW | UNKNOWN (UNKNOWN) | FR_VOLSIGNALS | LG_SPX_OPTIONS_VOLSIGNALS | DC_SPX_VOLSIGNALS_DELTADIFF | PIPELINE_IDENTIFIED | INSUFFICIENT_INFORMATION | FINAL_DECISION_CONTEXT |


Notas por campo, instâncias e analogias TRACE × VolSignals: `data/jev-feature-contract-v1.json`.

## 5. Double counting

36 grupos em `data/jev-double-counting-groups-v1.json`. Os que já têm evidência:

- **DC_GEX0_SIGN:** `gex.net_0dte` ≡ `gamma_condition` ≡ `state gex_zero.sum_gex_vol` (e o perfil por strike) ≡ cor/rótulo NetGex0DTE ⇒ **1**.
- **DC_MAJORS_0DTE / _NEXT / _FULL:** majors repetidos entre orderflow, levels, classic, state e cache ⇒ 1 por vencimento.
- **DC_DEX_0DTE / _NEXT:** `dex.net_*`, decomposição call/put e `pc_oi` ⇒ 1. O delta por strike do state é SUSPECTED.
- **DC_CLASSIC_GEX_PROFILE_*:** o agregado `sum_gex_*` e o perfil por strike são a mesma informação. A cópia do classic na raiz é o mesmo payload da rota `/gexbot/classic/SPX/zero`.
- **DC_VANNA_* / DC_CHARM_*:** o agregado e o por strike da mesma grega ficam juntos (SUSPECTED). Isto refina o cluster SECOND_ORDER.
- **DC_SPX_FINAL_GAMMA:** TRACE `gamma_mm` + stats + VolSignals `gammaExposure` ⇒ 1. É PARTIAL_ANALOG: não se fundem nem se normalizam.
- **Relações entre grupos:**
  - SPX × SPY: medir antes de somar.
  - GammaGex × SpotGamma/TRACE: mesmo upstream `SPX_OPTIONS_TRADES`, independência UNKNOWN.
  - GammaGex × VolSignals: independência UNKNOWN.
  - ZERO_GAMMA × GEX0_SIGN: 1 família.
  - Antes × depois de 09/09: não misturar.
- **Sem contagem (count_as 0):** preço, metadados, colunas UNKNOWN e blocos legados.

## 6. Pendências que NÃO bloqueiam

- Semântica de `cvr`/`oflow`, `zero_mput`, `max_priors`, colunas 5 e 6 de `mini_contracts` e `delta_risk_reversal`: continuam UNKNOWN e ficam preservadas.
- Convenção de sinal das gregas por strike: UNKNOWN.
- Identidades dos majors: medidas num único instante pós-fechamento; confirmar em RTH na captura futura.
- OPTIONAL_EVIDENCE_GAP: body de `/v2/open_interest/intraday_delta` e o vínculo do TRACE Delta Pressure ao endpoint real.
- A captura própria de 20–40 pregões **não** começa aqui.
