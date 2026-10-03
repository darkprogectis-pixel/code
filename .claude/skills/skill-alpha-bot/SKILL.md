---
name: skill-alpha-bot
description: Conhecimento canônico de α Bot (GexBot/GammaGex via relay read-only :3457) para AGENT_BOT / JARVIS — regime de gamma, níveis, campos com unidade UNKNOWN. NON_DIRECTIONAL; leitura SHADOW, nunca ordem.
---

# skill-alpha-bot — AGENT_BOT (α Bot = GexBot/GammaGex)

rules_version: alpha-rules/1
module: src/alpha/specialists/bot.mjs
contract: alpha-specialist/v1 (src/alpha/contracts.mjs)

1. **Identidade**: α Bot = GexBot/GammaGex, lido pelo relay read-only 127.0.0.1:3457 `/gexbot/*` (o upstream `gammagex-api.js` :3530 exige Bearer ⇒ NÃO usado).
2. **Finalidade**: regime de gamma 0DTE e níveis de gamma (LOCATION/REGIME). Nenhum campo tem papel direcional documentado.
3. **Endpoints** (GET only): `/gexbot/orderflow/ES_SPX` (obrigatório) · `/gexbot/classic/SPX/zero`.
4. **Schemas**: orderflow → `{timestamp (epoch s), ticker, spot, z_mlgamma, zero_mcall, zero_mput, zgr, ogr, zcharm, ocharm, zvanna, ovanna, net_dex, agg_dex, *_call/put_dex, dexoflow, gexoflow, cvroflow, _relay{stale,age_ms,served}}`; classic → `{timestamp, spot, zero_gamma, major_pos_vol, major_pos_oi, major_neg_vol, major_neg_oi, …}`.
5. **Dicionário consumido**: `zgr`, `ogr`, `zcharm`, `ocharm`, `zvanna`, `net_dex`, `agg_dex`, `dexoflow`, `zero_mcall`, `zero_mput`, `spot`, `timestamp`, `_relay.stale`; classic `zero_gamma`, `major_*`.
6. **Unidades**: níveis em pontos ES_SPX; exposições (`zgr`, charm, vanna, dex) **UNKNOWN** (unidade do vendor não documentada).
7. **Frequência**: relay TTL 20 s; vendor ts → relay 90–100 s.
8. **Freshness**: vendor `timestamp` ≤ 180 s e `_relay.stale=false`.
9. **Missing/stale/error**: orderflow erro ⇒ ERROR; classic ausente ⇒ PARTIAL; stale ⇒ STALE.
10. **Significado documentado**: `gamma_condition = zgr ≥ 0 ? POSITIVE : NEGATIVE` (positivo amortece, negativo amplifica) — sem lado.
11. **Relações**: vendor distinto de α Gamma; é a origem de `gamma.condition` exibido por α Quant ⇒ `independence_group=G_BOT`.
12. **Padrões históricos**: GEX nunca virou sinal validado (holdout 0/66; princípio do feature-contract).
13. **Extraível**: regime, níveis, exposições como contexto. **Não inferível**: BUY/SELL de GEX/charm/vanna/DEX; semântica de `*oflow`.
14. **Exemplo sanitizado**: `fixtures/alpha/bot.orderflow.json` (zgr 8384.22 ⇒ POSITIVE; spot 7775.77).
15. **Regras de evidência**: `gamma_condition`/`zgr`/`ogr` (REGIME), charm/vanna/dex (CONTEXT, `UNTESTED`), `dexoflow` (UNKNOWN_FIELD); efeito sempre NEUTRAL.
16. **Regras de confidence**: NON_DIRECTIONAL ⇒ `direction=UNKNOWN`, `strength=0`, `confidence=0` (validation_cap 0).
17. **Contrato de output**: `alpha-specialist/v1`, `role=NON_DIRECTIONAL`; Fusion ignora com motivo `NON_DIRECTIONAL`.
18. **Limites**: somente GET loopback; nunca ordem/AOT/INVICTUS.
