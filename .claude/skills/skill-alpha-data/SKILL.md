---
name: skill-alpha-data
description: Conhecimento canônico de α Data (QuantData :3490) para AGENT_DATA / JARVIS — classificação publicada pelo motor QD, sub-sinais S1–S4, walls, freshness, confidence. Leitura SHADOW, nunca ordem.
---

# skill-alpha-data — AGENT_DATA (α Data = QuantData)

rules_version: alpha-rules/1
module: src/alpha/specialists/data.mjs
contract: alpha-specialist/v1 (src/alpha/contracts.mjs)

1. **Identidade**: α Data = QuantData, `quantdata-api.js` + motor `quantdata-signal.js` (300 s), 127.0.0.1:3490.
2. **Finalidade**: publicar a classificação do motor QD (primário 0.40·S1 + 0.25·S2 + 0.15·S3 + 0.20·S4; score = 0.70·primário + 0.30·mag7; banda neutra 0.15).
3. **Endpoints** (GET only): `/signal/ES` (obrigatório) · `/exposure/ES` (walls).
4. **Schemas**: `/signal/ES` → `{sym, direction, score, confidence, asof, components{primary{score,S1..S4}, mag7{score,per{}}, rty, menthorq{dir,cond,sitOnHands}, gl, agreement}, gamma{spot,call_wall,put_wall}}`; `/exposure/ES` → `{at, spot, zero_gamma, call_wall, put_wall, strikes[], index_component, beta, …}`.
5. **Dicionário consumido**: `direction`, `score`, `confidence`, `asof`, `components.primary.S1..S4`, `components.mag7.score`, `components.menthorq.cond`; exposure `zero_gamma`, `call_wall`, `put_wall`.
6. **Unidades**: `score` e S1..S4 em [−1, 1]; `confidence` 0–100; walls em pontos ES (beta ~1:1 de SPX).
7. **Frequência**: motor 300 s; só recalcula com input < 6 min.
8. **Freshness**: `asof` ≤ 600 s (2 ciclos).
9. **Missing/stale/error**: `/signal` erro ⇒ ERROR; S1..S4 nulos ⇒ `PARTIAL` + `missing_fields` (fora do RTH S2/S3 vêm null); stale ⇒ STALE.
10. **Significado documentado**: BULLISH→BUY, BEARISH→SELL, NEUTRO→NEUTRAL (classificação da fonte).
11. **Relações**: depende de α Q (confiança + veto de sessão), GL :3470 e RTY ⇒ `depends_on=[q,gl_3470]`, `independence_group=G_QUANT_DATA` (α Quant também consome α Data ⇒ contam 1 no Fusion).
12. **Padrões históricos**: holdout direcional 0/66 ⇒ `calibration=UNCALIBRATED`.
13. **Extraível**: classificação, score, sub-sinais, walls. **Não inferível**: semântica além do publicado; motivo de S2/S3 nulos.
14. **Exemplo sanitizado**: `fixtures/alpha/data.signal.json` (`NEUTRO`, score 0.048, conf 6, S2/S3 null ⇒ PARTIAL, coverage 0.5).
15. **Regras de evidência**: `direction`, `score`, `confidence`, `primary.S*` (SUBSIGNAL), `mag7.score`, `menthorq.cond` (DEPENDENCY); contradição interna primário × mag7 (|x| ≥ 0.15, sinais opostos) registrada como não material.
16. **Regras de confidence**: `strength = |score|`; `confidence = confidence/100 × coverage(S1..S4 presentes) × validation_cap(SOURCE_CLASSIFICATION=0.6)`.
17. **Contrato de output**: `alpha-specialist/v1`, `role=SOURCE_CLASSIFICATION`, `levels` com walls/ZG da QuantData.
18. **Limites**: somente GET loopback; nunca ordem/AOT/INVICTUS. BUY/SELL = leitura analítica UNCALIBRATED.
