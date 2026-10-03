---
name: skill-alpha-q
description: Conhecimento canônico de α Q (MenthorQ :3480) para AGENT_Q / JARVIS — níveis MenthorQ, regime, política CONFIRMATION_ONLY_NON_BLOCKING (SIDE_ORIGIN=FALSE). Leitura SHADOW, nunca ordem.
---

# skill-alpha-q — AGENT_Q (α Q = MenthorQ)

rules_version: alpha-rules/1
module: src/alpha/specialists/q.mjs
contract: alpha-specialist/v1 (src/alpha/contracts.mjs)

1. **Identidade**: α Q = MenthorQ, `menthorq-api.js`, 127.0.0.1:3480.
2. **Finalidade**: níveis MenthorQ (Call Resistance, Put Support, HVL, Gamma Wall 0DTE, Day Max/Min) e regime de exposição como contexto.
3. **Endpoints** (GET only): `/exposure/ES` (obrigatório) · `/levels/ES` · `/spot/ES`. NÃO usado: `/daily/ES` (1,25 MB).
4. **Schemas**: `/exposure/ES` → `{sym, spot, asof, sourceFile, window, strikes[{strike,net_gex,…}], levels{call_resistance, call_resistance_0dte, put_support, put_support_0dte, hvl, hvl_0dte, gamma_wall_0dte, day_max, day_min}, scale, dte_0_5}`; `/levels/ES` → `{date, gamma_levels[{name,value}], …}`; `/spot/ES` → `{price, at, prices{…}}`.
5. **Dicionário consumido**: `asof`, `levels.*`, `strikes[].net_gex`, `gamma_levels[]`, `spot.price`.
6. **Unidades**: níveis/preço em pontos ES; `net_gex` em unidade do vendor (não documentada).
7. **Frequência**: matriz 5 min em RTH; `/levels` EOD (D−1).
8. **Freshness**: `exposure.asof` ≤ 15 min. `matrix.timestamp` não tem fuso (UNSPECIFIED) ⇒ não usado para frescor.
9. **Missing/stale/error**: `/exposure` erro ⇒ ERROR; `/levels` ausente ⇒ PARTIAL; stale ⇒ STALE.
10. **Significado documentado**: política canônica `MENTHORQ_CONFIRMATION_ONLY_NON_BLOCKING` — alinhado = confirmação positiva; desalinhado/neutro/stale = efeito zero; nunca origina lado, nunca veta, nunca reduz convicção.
11. **Relações**: α Q entra dentro de α Quant e α Data (confiança/veto deles) ⇒ nunca é confirmação independente desses dois. `independence_group=G_Q`.
12. **Padrões históricos**: decisão do operador 2026-09-23 (`DECISION_MENTHORQ_CONFIRMATION_ONLY_20260923.md`).
13. **Extraível**: níveis, regime (soma de net_gex da janela, unidade vendor), spot. **Não inferível**: lado, veto.
14. **Exemplo sanitizado**: `fixtures/alpha/q.exposure.json` (asof 2026-10-02T20:55Z).
15. **Regras de evidência**: `spot` (CONTEXT), `window.net_gex_sum` (REGIME, `UNTESTED`), `policy` (POLICY); efeito sempre NEUTRAL.
16. **Regras de confidence**: SIDE_ORIGIN=FALSE ⇒ `direction=UNKNOWN`, `confidence=0`. No Fusion `q_confirmation=NONE` nesta versão (Q sem lado próprio ⇒ efeito 0).
17. **Contrato de output**: `alpha-specialist/v1`, `role=NON_DIRECTIONAL`; Fusion ignora com motivo `Q_CONFIRMATION_ONLY (SIDE_ORIGIN=FALSE)`.
18. **Limites**: somente GET loopback; nunca ordem/AOT/INVICTUS.
