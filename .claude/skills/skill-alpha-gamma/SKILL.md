---
name: skill-alpha-gamma
description: Conhecimento canônico de α Gamma (SpotGamma capture :3500) para AGENT_GAMMA / JARVIS — HIRO, níveis SPX→ES, freshness, regras de evidência e confidence. Leitura SHADOW, nunca ordem.
---

# skill-alpha-gamma — AGENT_GAMMA (α Gamma = SpotGamma)

rules_version: alpha-rules/1
module: src/alpha/specialists/gamma.mjs
contract: alpha-specialist/v1 (src/alpha/contracts.mjs)

1. **Identidade**: α Gamma = SpotGamma capture, `sg-capture-api.js`, 127.0.0.1:3500.
2. **Finalidade**: pressão de hedge do dealer (HIRO) como DIRECTIONAL_PRESSURE e níveis de gamma (Call Wall, Put Wall, Zero Gamma, Hedge Wall, Key Gamma Strike) como LOCATION/REGIME.
3. **Endpoints** (GET only): `/hiro/SPX` (obrigatório) · `/levels/SPX` · `/health`. NÃO usados: `/tape/*`, `/divergence/*` (deltaDollar = BLOCKED_SEMANTICS).
4. **Schemas**: `/hiro/SPX` → `{sym, at, candlesCount, latest, tail:[[ts,f1,f2,f3,f4,f5],…]}`; `/levels/SPX` → `{asof, tradeDate, futuresDiff, indexLevels{}, futureLevels{}, labels{}, …}`; `/health` → `{ok, stale[], rth, …}`.
5. **Dicionário consumido**: candle `ts` (ms UTC) e `f4` (net do candle); `futureLevels.{callwallstrike, putwallstrike, zero_g_strike, max_g_strike, topabs_strike, L1..L4, C1..C4}`, `labels.*`, `futuresDiff`, `health.rth`.
6. **Unidades**: HIRO em unidade do vendor (Σf4); níveis em pontos ES = índice SPX + `futuresDiff`.
7. **Frequência**: candles de 5 s em RTH; níveis D−1 (`tradeDate`).
8. **Freshness**: último candle ≤ 60 s (`stale_ms.gamma_hiro`). Fora do RTH `tail=[]` ⇒ STALE.
9. **Missing/stale/error**: `/hiro` erro ⇒ ERROR; sem candles ⇒ STALE + `missing_fields: hiro.tail`; `/levels` ausente ⇒ PARTIAL; tail parcial ⇒ HIRO cumulativo indisponível (warning).
10. **Significado documentado**: vendor — HIRO positivo = pressão de hedge compradora, negativo = vendedora. Walls/ZG não têm lado.
11. **Relações**: vendor distinto de α Bot; sem dependências ⇒ `independence_group=G_GAMMA`. `market_origin=SPX` sempre; nunca ES_NATIVE.
12. **Padrões históricos**: HIRO como preditor = `PROJECT_TESTED_REJECTED` (holdout 0/66) ⇒ cap baixo (0.3).
13. **Extraível**: slope 15 min do HIRO, banda neutra = p50 das janelas de 15 min do dia, níveis. **Não inferível**: lado a partir de walls/ZG/GEX; significado de f1/f2/f3/f5; deltaDollar.
14. **Exemplo sanitizado**: `fixtures/alpha/gamma.hiro.replay60m.json` (últimos 60 min reais de 2026-10-02) ⇒ leitura fresca com `now` = último candle + 5 s.
15. **Regras de evidência**: `hiro.slope_15m` (efeito BULLISH/BEARISH/NEUTRAL), `hiro.p50_abs_15m`, `hiro.cumulative`; validação `PROJECT_TESTED_REJECTED`.
16. **Regras de confidence**: `slope = Σf4` dos candles nos últimos 15 min; `|slope| < p50` ⇒ NEUTRAL; `strength = |s| / (|s| + p50)`; `confidence = 1 × coverage(candles presentes/180) × validation_cap(DIRECTIONAL_PRESSURE=0.3)`.
17. **Contrato de output**: `alpha-specialist/v1`, `role=DIRECTIONAL_PRESSURE`, `levels{nome:{value,unit,origin,index_value,market_origin:'SPX',asof}}`.
18. **Limites**: somente GET loopback; nunca ordem/AOT/INVICTUS. BUY/SELL = leitura analítica UNCALIBRATED.
