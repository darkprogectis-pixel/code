---
name: skill-alpha-quant
description: Conhecimento canônico de α Quant (Alfa Omega Consolidator :3495) para AGENT_QUANT / JARVIS — endpoints, campos, unidades, freshness, regras de evidência e confidence. Leitura SHADOW, nunca ordem.
---

# skill-alpha-quant — AGENT_QUANT (α Quant = Alfa Omega Consolidator)

rules_version: alpha-rules/1
module: src/alpha/specialists/quant.mjs
contract: alpha-specialist/v1 (src/alpha/contracts.mjs)

1. **Identidade**: α Quant = Alfa Omega Consolidator, `consolidator-engine.js`, 127.0.0.1:3495 (bind 0.0.0.0; leitura loopback sem auth). Evidência: `~/.claude/consolidator-engine/alfabot-signal.js:60-64` (aoAlias).
2. **Finalidade**: publicar a classificação direcional que o próprio Consolidator calcula (gate1 radar AO + gate2 MenthorQ SIT_ON_HANDS; QD/MQ refinam confiança). O agente só traduz o que a fonte publica.
3. **Endpoints** (GET only): `/consolidated/ES` (obrigatório, ~460 B) · `/api/alfabot-signal` (opcional, ~35 kB; usado para `freshness`).
4. **Schemas**: `/consolidated/ES` → `{engine, sym, direction, state, tier, confidence, gateDir, asof, degraded{}, inputs{anchor,quantdata,…}, replay, reason}`; `/api/alfabot-signal` → `{schemaVersion, source, ts, session, freshness, staleAfterMs, monitoringOnly, symbols{ES{uiState,direction,tier,state,gamma{condition,…},…}}}`. Dicionário completo: `handoffs/assets/ALPHA_FIELD_DICTIONARY_20261002.json`.
5. **Dicionário consumido**: `direction` (BULLISH/BEARISH/NEUTRO), `confidence` (int), `state`, `tier`, `reason`, `asof`, `inputs.quantdata.direction` (só checagem interna), `freshness`, `symbols.ES.gamma.condition` (display, origem α Bot).
6. **Unidades**: `confidence` 0–100; `asof` ISO UTC (tempo do ciclo do Consolidator, não do vendor).
7. **Frequência**: ciclo 60 s (`TICK_MS=60000`).
8. **Freshness**: `asof` ≤ 120 s (`stale_ms.quant`, = `staleAfterMs`) **e** `freshness === 'LIVE'` quando `/api/alfabot-signal` responde.
9. **Missing/stale/error**: `/consolidated` ausente/erro/timeout/JSON inválido ⇒ `health=ERROR`, UNKNOWN; `/api/alfabot-signal` ausente ⇒ `PARTIAL` (freshness só por `asof`); stale ⇒ `STALE`, UNKNOWN, confidence 0.
10. **Significado documentado**: BULLISH→BUY, BEARISH→SELL, NEUTRO→NEUTRAL; rótulo desconhecido ⇒ UNKNOWN + warning (nada inventado). `state=STAND_DOWN` = Consolidator sem gatilho.
11. **Relações**: depende de α Data (`/signal`), α Q (níveis, SIT_ON_HANDS), AO bridge :5151 (tape) e relay :3457 ⇒ `depends_on=[data,q,ao_bridge_5151,relay_3457]`, `independence_group=G_QUANT_DATA` (conta 1 com α Data no Fusion).
12. **Padrões históricos**: holdout direcional do projeto 0/66 (`NEGATIVE_RESULTS_REGISTRY.json`) ⇒ nenhuma direção é sinal validado; `calibration=UNCALIBRATED`.
13. **Extraível**: classificação publicada, confiança publicada, estado, frescor. **Não inferível**: preço-alvo, tamanho, timing de entrada, direção própria do agente.
14. **Exemplo sanitizado** (`fixtures/alpha/quant.consolidated.json`, fora do RTH): `direction NEUTRO, state STAND_DOWN, confidence 0, freshness DATA PROBLEM` ⇒ `STALE/UNKNOWN`.
15. **Regras de evidência**: evidence = `direction`, `confidence`, `state`, `tier`, `reason`, `freshness`, `gamma.condition`; validação `VENDOR_SEMANTICS`; contradição interna Consolidator × `inputs.quantdata` registrada como não material.
16. **Regras de confidence**: `strength = confidence/100`; `confidence = source_conf × coverage(direction,confidence,asof,state) × validation_cap(SOURCE_CLASSIFICATION=0.6)` — componentes em `formula.inputs`.
17. **Contrato de output**: `alpha-specialist/v1`, `role=SOURCE_CLASSIFICATION`, `raw_ref` → snapshots imutáveis em `var/alpha/snapshots/`.
18. **Limites**: somente GET loopback; nunca POST, ordem, robô, conta, AOT/INVICTUS. BUY/SELL = leitura analítica UNCALIBRATED.
