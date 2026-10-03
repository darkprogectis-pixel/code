# PROPOSTA — ALPHA SIGNAL INTELLIGENCE (5 especialistas + Fusion) — SHADOW / READ-ONLY

Loop `/jev-finish` `jf-20261002230017-ced0d2` · sessão 2918b740 · 2026-10-02 ~23:10Z.
Origem: `handoffs/ORDER_ALPHA_AGENTS_QUEUED_20261002.md` + `handoffs/ORDER_MISSION_ALPHA_JARVIS_FINAL_20261002.md`.
Escopo: código NOVO em `src/alpha/**`, `.claude/skills/skill-alpha-*/`, `test/alpha/**`, aba no `tools/jev-obs/**`. Nada em produção (AOT, Consolidator, DarkFlow, GexBot, NT8, signal-engine, INVICTUS) é alterado; todas as APIs são lidas por GET em loopback; zero ordens.

## 1. AUDITORIA FACTUAL (FASE 0) — evidência real, 2026-10-02 23:03–23:05Z (fora do RTH, sexta)

### 1.1 Identidade α ↔ vendor (evidência: `~/.claude/consolidator-engine/alfabot-signal.js:60-64` aoAlias; `AoControlCenter.cs` mesmo mapa)
| α | vendor/serviço | processo (pid) | bind:porta | auth loopback |
|---|---|---|---|---|
| α Quant | Alfa Omega **Consolidator** | `consolidator-engine.js` (11592) | 0.0.0.0:3495 | interno (Auth V2 `consolidator.read` só túnel/LAN) |
| α Gamma | **SpotGamma** capture | `sg-capture-api.js` (48024) | 0.0.0.0:3500 | interno (Auth V2 `gamma.read`) |
| α Bot | **GexBot/GammaGex** via relay | relay WSL 127.0.0.1:3457 `/gexbot/*` (upstream `gammagex-api.js` :3530 exige Bearer ⇒ 401 sem chave; NÃO usado) | 127.0.0.1:3457 | aberto em loopback (o JEV Live Adapter V1 já lê) |
| α Q | **MenthorQ** | `menthorq-api.js` (2292) | 0.0.0.0:3480 | interno (`q.read`) |
| α Data | **QuantData** | `quantdata-api.js` (2820) + `quantdata-signal.js` (motor 300 s) | 0.0.0.0:3490 | interno (`data.read`) |

### 1.2 CURRENT_ENDPOINTS usados (todos GET; lista completa de rotas de cada serviço em `GET /`)
| α | endpoint | bytes | lat. medida | atualização (evidência) | timestamp |
|---|---|---|---|---|---|
| Quant | `/consolidated/ES` | 463 | 52 ms | ciclo 60 s (`TICK_MS=60000`) | `asof` (ISO, do ciclo — NÃO do vendor) |
| Quant | `/api/alfabot-signal` | 34,8 kB | 5 ms | idem; `staleAfterMs=120000` | `ts`, `freshness` LIVE/STALE/DATA PROBLEM, `structuralTradePlan.vendor_ts` |
| Gamma | `/levels/SPX` | 5,4 kB | 52 ms | keyLevels D−1 (`tradeDate`) | `asof`, `tradeDate` |
| Gamma | `/hiro/SPX` (`?date=` replay) | 136 B fora RTH / 1,18 MB replay do dia | 5 ms | candles 5 s em RTH | `at`; candle `ts` ms UTC |
| Gamma | `/tape/ES/summary`, `/divergence/es-spx-vix` | ~1 kB | 4–11 ms | poll ~30 s | `at` |
| Gamma | `/health` | 3,1 kB | 2 ms | — | `lastPoll[feed].okAt`, `stale[]`, `rth` |
| Bot | `/gexbot/orderflow/ES_SPX` | 859 B | 296 ms | relay TTL 20 s; vendor ts→relay 90–100 s (P2 §15) | `timestamp` (epoch s, VENDOR), `_relay.{stale,age_ms,served}` |
| Bot | `/gexbot/classic/SPX/zero` | 7,0 kB | 272 ms | idem | `timestamp` (vendor) |
| Q | `/levels/ES` | 3,5 kB | 52 ms | EOD (`date` D−1) | `at`, `date` |
| Q | `/exposure/ES`, `/intraday/ES` | 7,6 / 26 kB | 11–24 ms | matriz 5 min em RTH | `asof` (Z) / `matrix.timestamp` **sem TZ (UNSPECIFIED)** |
| Q | `/spot/ES` | 265 B | 11 ms | preço vendor | `at` |
| Data | `/signal/ES` | 856 B | 5 ms | motor 300 s; só recalcula com input < 6 min (`FRESH_MAX_MS`) | `asof` (do cálculo) |
| Data | `/snapshot/ES`, `/flow/ES`, `/exposure/ES`, `/dex/ES` | 1,6–28 kB | 2–44 ms | camada fast ~120 s | `asof` / `at` / `ts` (ms) |
(`/daily/ES` do Q = 1,25 MB ⇒ NÃO consumido no ciclo.)

### 1.3 CURRENT_SCHEMAS / FIELD_DICTIONARY
- Dicionário mecânico completo (20 endpoints, todas as folhas, tipo e amostra): `handoffs/assets/ALPHA_FIELD_DICTIONARY_20261002.json`.
- Tabela semântica dos campos CONSUMIDOS (API · FIELD · TYPE · UNIT · MEANING · STALE_AFTER · SIGNAL_RELEVANCE · EVIDENCE):

| API | FIELD | TYPE | UNIT | MEANING (documentado) | STALE_AFTER | SIGNAL_RELEVANCE | EVIDENCE |
|---|---|---|---|---|---|---|---|
| Quant | `direction` BULLISH/BEARISH/NEUTRO | enum | — | classificação PUBLICADA pelo Consolidator (gate1 radar AO + gate2 MenthorQ SIT_ON_HANDS; QD/MQ só refinam confiança) | 120 s (`staleAfterMs`) | SOURCE_CLASSIFICATION | consolidator-engine.js:1-9,128-264 |
| Quant | `confidence` | int | 0–100 | confiança publicada pela fonte | idem | escala da fonte | :264 |
| Quant | `state`, `tier`, `reason`, `degraded.*` | enum/str | — | STAND_DOWN etc.; tier por confiança | idem | DATA_QUALITY/estado | payload |
| Quant | `freshness` (alfabot-signal) | enum | — | LIVE/STALE/DATA PROBLEM | — | DATA_QUALITY | consolidator-engine.js:100 |
| Gamma | `futureLevels.callwallstrike/putwallstrike/zero_g_strike/max_g_strike/topabs_strike` | num | pontos ES (= índice + `futuresDiff`) | Call Wall, Put Wall, Zero Gamma, Hedge Wall, Key Gamma Strike — **LOCATION/REGIME, sem lado** | D−1 (tradeDate) | LOCATION | `labels.*`; directional-semantics.md §1/§2.5 |
| Gamma | `hiro` candle `[ts,f1,f2,f3,f4,f5]` | array | f4 = net do candle (Σf4 = HIRO cumulativo, baseline 09:30 ET) | **DIRECTIONAL_PRESSURE** (vendor: HIRO negativo = pressão de hedge vendedora); projeto: `PROJECT_TESTED_REJECTED` como preditor | 60 s (RTH) | DIRECTIONAL_PRESSURE (cap baixo) | hiro-deep-dive.md; directional-semantics.md §2.1 |
| Gamma | tape `netDeltaDollar`, divergence | num | US$ | sinal do deltaDollar **BLOCKED_SEMANTICS** (§BI) | — | NÃO USAR como lado | NEGATIVE_RESULTS_REGISTRY not_testable |
| Bot | `spot`, `zero_gamma`, `major_pos_vol/oi`, `major_neg_vol/oi` | num | pontos ES_SPX | níveis de gamma (LOCATION) | vendor ts > 180 s | LOCATION | relay-mapping.mjs; P2 §9-§10 |
| Bot | `zgr` (net GEX 0DTE), `gamma_condition = zgr>=0` | num | **UNKNOWN** (unidade vendor não documentada) | REGIME (positivo amortece / negativo amplifica) — GEX NUNCA vira BUY/SELL | idem | REGIME | feature-contract.v1 principles; P2 §9 |
| Bot | `zcharm`, `ocharm`, `zvanna`, `ovanna`, `net_dex`, `agg_dex`, `*_call/put_dex` | num | UNKNOWN | exposições do vendor; sem semântica direcional documentada | idem | CONTEXT (sem lado) | P2 §9 "unidade UNKNOWN; sinal cru" |
| Bot | `dexoflow`, `gexoflow`, `cvroflow` | num | UNKNOWN | "variação curta, semântica UNKNOWN" | idem | UNKNOWN_FIELD | P2 §9 |
| Q | `levels.call_resistance(_0dte)`, `put_support(_0dte)`, `hvl(_0dte)`, `gamma_wall_0dte`, `day_max/min` | num | pontos ES | níveis MenthorQ (LOCATION) | `asof` > 15 min em RTH | LOCATION | payload `/exposure/ES` |
| Q | `matrix.totals.net_gex/net_dex`, `expirations[].gex_change_1h` | num | vendor | exposição agregada (REGIME) | idem | REGIME | payload |
| Q | (política) | — | — | **MENTHORQ_CONFIRMATION_ONLY_NON_BLOCKING; SIDE_ORIGIN = FALSE** | — | só confirmação positiva | DECISION_MENTHORQ_CONFIRMATION_ONLY_20260923.md; CLAUDE.md |
| Data | `direction` BULLISH/BEARISH/NEUTRO, `score` [-1,1], `confidence` 0–100 | enum/num | — | classificação PUBLICADA pelo motor QD: primário 0.40·S1+0.25·S2+0.15·S3+0.20·S4, score = 0.70·prim + 0.30·mag7, banda neutra 0.15; MenthorQ/GL/RTY ajustam confiança; gate MenthorQ pode VETAR | 600 s (2 ciclos de 300 s) | SOURCE_CLASSIFICATION | quantdata-signal.js:1-45 |
| Data | `components.primary.S1..S4`, `components.agreement`, `gamma.call_wall/put_wall` | num | adim. / pontos | sub-sinais e walls do QD | idem | evidência interna | idem |

### 1.4 UNKNOWN_FIELDS (não recebem significado)
Bot: unidades de `zgr/zcvr/zcharm/zvanna/*dex*`, semântica de `*oflow`, colunas 5–6 de `mini_contracts`. Gamma: HIRO `f1` (sempre 0), `f2/f3` (prováveis máx/mín, não confirmado), `latestHiro.gamma_signal/vega_signal`. Q: fuso de `matrix.timestamp` (sem TZ). Data: `S2/S3` vêm `null` fora do RTH (motivo não documentado no payload). Quant: `reactor_pct` (semântica não documentada no payload).

### 1.5 Dependências entre fontes (crítico para independência)
- **α Quant ⊃ {α Data (/signal), α Q (/levels, SIT_ON_HANDS), AO bridge :5151 tape, relay :3457}** (consolidator-engine.js:1-9, 17-19, 92).
- **α Data ⊃ {α Q (confiança + veto de sessão), GL :3470, RTY}** (quantdata-signal.js:10-16; `/signal/ES.components.menthorq`).
- α Gamma (SpotGamma) e α Bot (GexBot) são vendors distintos; α Bot é a origem de `gamma.condition` usada no payload do Quant (display).
- ⇒ Quant e Data NÃO são independentes; Q entra dentro dos dois; contar Quant+Data como duas confirmações = dupla contagem.

### 1.6 Validação histórica que limita a inferência (NÃO reabrir)
`~/.claude/alfaomega-directional/NEGATIVE_RESULTS_REGISTRY.json`: holdout K=66, **directional_pass = 0** (amplitude_pass = 14). Contract principle: "NENHUMA feature é sinal validado sem pré-registro + teste aprovado". ⇒ toda direção produzida aqui é **leitura analítica UNCALIBRATED**, nunca sinal validado; `calibration: "UNCALIBRATED"` em todo envelope.

### 1.7 Freshness no momento da auditoria (fora do RTH)
Quant `freshness = DATA PROBLEM`, state STAND_DOWN; Gamma HIRO vazio (`candlesCount 0`), levels D−1; Bot vendor ts 19:59:57Z (age ≈ 3 h); Q `asof` 20:55Z; Data `asof` /signal 23:01Z mas inputs 19:55Z. ⇒ resultado esperado AGORA = UNKNOWN/STALE em todas (correto).

## 2. PROPOSED_AGENT_CONTRACT — `alpha-specialist/v1`
```
{ schema:"alpha-specialist/v1", source:"quant|gamma|bot|q|data", agent:"AGENT_QUANT|…", cycle_id, snapshot_id,
  timestamp (ISO, avaliação), source_timestamp (ISO|null, vendor preferido), age_ms|null, fresh:boolean,
  health:"OK|PARTIAL|STALE|ERROR", market:"ES", timeframe:"intraday",
  direction:"BUY|SELL|NEUTRAL|UNKNOWN", strength:0..1, confidence:0..1, calibration:"UNCALIBRATED",
  role:"SOURCE_CLASSIFICATION|DIRECTIONAL_PRESSURE|NON_DIRECTIONAL",
  evidence:[{field,value,unit,meaning,effect:"BULLISH|BEARISH|NEUTRAL",role,validation}],
  contradictions:[], missing_fields:[], warnings:[], levels:{name:{value,unit,origin}},
  depends_on:[…], independence_group, rules_version, formula,
  raw_ref:{endpoints:[{url,snapshot_id,sha}]}, metrics:{fetch_ms,eval_ms} }
```
Regras invariantes (validadas por teste):
1. `fresh=false` ⇒ `direction=UNKNOWN`, `strength=0`, `confidence=0`, `health=STALE`.
2. erro/timeout/payload inválido ⇒ `health=ERROR`, `direction=UNKNOWN`, confidence 0.
3. `confidence` só pela fórmula declarada: `confidence = source_conf × coverage × validation_cap` (componentes gravados em `formula.inputs`); `validation_cap` = constante PROVISÓRIA por papel: SOURCE_CLASSIFICATION 0.6 · DIRECTIONAL_PRESSURE (PROJECT_TESTED_REJECTED) 0.3 · NON_DIRECTIONAL 0.
4. NEUTRAL = há leitura direcional válida e ela está dentro da banda neutra; UNKNOWN = não há leitura direcional válida.
5. Determinístico: mesma entrada (snapshots + `now`) ⇒ mesmo envelope (teste de reprodutibilidade).
6. Payload bruto só por referência (`raw_ref` → snapshot imutável content-addressed).

## 3. PROPOSED_SKILLS (mecanismo oficial: `.claude/skills/<nome>/SKILL.md`, igual a `jev-finish`)
`skill-alpha-quant`, `skill-alpha-gamma`, `skill-alpha-bot`, `skill-alpha-q`, `skill-alpha-data` — cada uma com os 18 itens da ordem (identidade, finalidade, endpoints, schemas, dicionário, unidade, frequência, freshness, missing/stale/error, significado documentado, relações, padrões históricos, sinais extraíveis × não inferíveis, exemplos sanitizados, regras de evidência, regras de confidence, contrato de output) + `rules_version` idêntico ao do módulo de código (teste de consistência skill↔código). Mais `context/jev-future/ALPHA_FUSION_V1.md` (doc do Fusion; não é skill de API).

## 4. Regras por especialista (rules_version `alpha-rules/1`)
| agente | lê só | direção | strength | source_conf | notas |
|---|---|---|---|---|---|
| AGENT_QUANT | :3495 `/consolidated/ES` + `/api/alfabot-signal` | BULLISH→BUY, BEARISH→SELL, NEUTRO→NEUTRAL; `freshness≠LIVE` ou `asof` > 120 s ⇒ STALE | confidence/100 | confidence/100 | role SOURCE_CLASSIFICATION; depends_on [data,q,ao_tape]; group `G_QUANT_DATA` |
| AGENT_GAMMA | :3500 `/hiro/SPX`, `/levels/SPX`, `/health` | HIRO slope15 = Σf4 dos candles dos últimos 15 min; > 0 BUY, < 0 SELL, \|slope\| < p50 das janelas 15 min do dia ⇒ NEUTRAL; último candle > 60 s ⇒ STALE | \|s\| / (\|s\| + mediana\|janelas\|) | 1 (coverage = fração de candles presentes nos 15 min) | role DIRECTIONAL_PRESSURE, validation PROJECT_TESTED_REJECTED ⇒ cap 0.3; walls/ZG como `levels` (origin SPX→ES via futuresDiff; nunca ES_NATIVE); tape/divergence NÃO usados (BLOCKED) |
| AGENT_BOT | relay :3457 `/gexbot/orderflow/ES_SPX`, `/gexbot/classic/SPX/zero` | **UNKNOWN sempre** (nenhum campo com papel direcional documentado; GEX nunca vira lado) | 0 | — | role NON_DIRECTIONAL; publica regime (`gamma_condition`), níveis (zero_gamma, majors, mcall/mput), charm/vanna/dex como evidência NEUTRAL com unit UNKNOWN; STALE se vendor `timestamp` > 180 s |
| AGENT_Q | :3480 `/exposure/ES`, `/levels/ES`, `/spot/ES` | **UNKNOWN sempre** (SIDE_ORIGIN = FALSE) | 0 | — | role NON_DIRECTIONAL; levels (Call Resistance, Put Support, HVL, Gamma Wall 0DTE), regime net_gex; STALE se `asof` > 15 min |
| AGENT_DATA | :3490 `/signal/ES` (+ `/exposure/ES` p/ walls) | BULLISH→BUY, BEARISH→SELL, NEUTRO→NEUTRAL; `asof` > 600 s ⇒ STALE | \|score\| (clip 1) | confidence/100 | role SOURCE_CLASSIFICATION; depends_on [q, gl]; group `G_QUANT_DATA` |
Timeout por especialista 4 s (`Promise.allSettled`); um não bloqueia os outros.

## 5. PROPOSED_FUSION_CONTRACT — `alpha-fusion/v1` (determinístico + JEV advisory)
```
{ schema:"alpha-fusion/v1", cycle_id, timestamp, market:"ES", signal:"BUY|SELL|NO_SIGNAL", confidence, agreement,
  score, evidence_mass, sources:{quant,gamma,bot,q,data:{direction,confidence,strength,fresh,health,used,reason}},
  bullish_sources, bearish_sources, neutral_sources, ignored_sources:[{source,reason}],
  groups:[{id,members,representative,direction,mass}], contradictions:[], freshness_ok, fresh_count,
  q_confirmation:"ALIGNED|NONE", reasoning_summary, rules_version, calibration:"UNCALIBRATED",
  jev:{status,request_id,questions:{Q1..Q12:{winner,pmax,top1,top2,margin,ratio,confidence,probabilities}},agrees_with_signal} }
```
Algoritmo (sem votação 3×2):
1. Elegível p/ direção: `fresh && health∈{OK,PARTIAL} && direction∈{BUY,SELL,NEUTRAL} && role≠NON_DIRECTIONAL`. Demais ⇒ `ignored_sources` com motivo (STALE, ERROR, NON_DIRECTIONAL, Q_CONFIRMATION_ONLY).
2. Grupos de independência (§1.5): `G_QUANT_DATA={quant,data}` conta como 1 (representante = maior confidence; o outro vira `redundant`); `G_GAMMA={gamma}`. Bot e Q nunca originam lado.
3. massa do grupo m_g = conf_g × strength_g; sinal s_g ∈ {+1,−1,0}. `score = Σ s_g·m_g`, `evidence_mass = Σ m_g`, `agreement = |score|/evidence_mass` (0 se massa 0).
4. Contradição material: dois grupos de sinais opostos com m_g ≥ 0.10 cada; também `quant` × `data` opostos dentro do grupo (registrada, não somada).
5. `signal = BUY/SELL` sse `agreement ≥ 0.60` E `|score| ≥ 0.10` E sem contradição material E `freshness_ok` (≥ 2 fontes frescas de quaisquer papéis); senão NO_SIGNAL.
6. `confidence = agreement × min(1, |score|/0.30) × (n_grupos_direcionais ≥ 2 ? 1 : 0.6)`; α Q ALIGNED (MenthorQ só como confirmação positiva: Q não tem lado próprio ⇒ ALIGNED só se o regime/nível Q documentado concordar — como Q é NON_DIRECTIONAL, `q_confirmation` fica NONE nesta versão; efeito 0). Nunca reduz nem veta.
7. Número de campos não entra em nada (uma fonte = um envelope).
8. Constantes (0.60, 0.10, 0.30, 0.6, caps) = PROVISÓRIAS/UNCALIBRATED em `config/alpha.json`.
9. JEV não altera `signal` (reprodutibilidade); discordância JEV×signal entra em `contradictions` como `JEV_DISAGREES`.

## 6. JEV decomposto (FASE 5)
Uma chamada `jevAsk` (cliente canônico `~/.claude/alfaomega-context/scripts/lib.js`, `sanitize`, purpose `alpha-fusion-<cycle_id>`), 12 perguntas `choice`:
Q1–Q5 direção por fonte {BUY,SELL,NEUTRAL,UNKNOWN}; Q6 frescor suficiente {YES,NO}; Q7 contradição material {YES,NO}; Q8 independência suficiente {YES,NO}; Q9 evidência suficiente {YES,NO}; Q10 direção agregada {BUY,SELL,INDETERMINATE}; Q11 qualidade {HIGH,MEDIUM,LOW}; Q12 risco de falso consenso {HIGH,MEDIUM,LOW}.
State = os 5 envelopes compactos + mapa de dependências + regras (sem payload bruto, sem segredos).
Persistir por pergunta: probabilities, winner, pmax, top1, top2, margin = p1−p2, ratio = p1/p2, confidence; + request_id, model, latency, timestamp, cycle_id.
**Throttle de custo**: chama só se ≥ 1 fonte direcional fresca E (hash de estado mudou E ≥ 120 s desde a última) ou heartbeat 15 min; teto diário `jev_daily_cap = 300`; fora disso `jev.status = SKIPPED_<motivo>`. Falha do JEV ⇒ `jev.status = ERROR`, Fusion segue (teste "JEV failure").

## 7. DATA_FLOW / pipeline realtime (FASE 6)
```
timer 30 s ─▶ cycle_id ─▶ 5 especialistas em paralelo (cada um: GET próprio → snapshot imutável sha256 → evaluate puro → alpha-specialist/v1)
          ─▶ fusion (puro) ─▶ jev (throttled, async; não bloqueia o ciclo além de 20 s) ─▶ alpha-fusion/v1
          ─▶ var/alpha/latest.json (atômico) + var/alpha/history-YYYY-MM-DD.ndjson + var/alpha/metrics.json
          ─▶ outcomes (FASE 8) ─▶ dashboard :3593 (GET lê var/alpha) ─▶ JARVIS (lê latest/history)
```
- Snapshots: `var/alpha/snapshots/YYYY-MM-DD/<source>-<sha16>.json`, dedupe por conteúdo, retenção 3 dias.
- Por ciclo: `stages_ms {fetch_<src>, eval_<src>, fusion, jev, persist, total}`.
- Processo: `node src/alpha/service.mjs` (127.0.0.1 only; sem servidor HTTP próprio — o painel lê arquivos). Start/stop pelo comando único da missão (`scripts/jev-stack.mjs start|stop|status`, a definir na fase JARVIS).

## 8. FEEDBACK (FASE 8)
`src/alpha/outcomes.mjs`: preço = AO bridge `GET 127.0.0.1:5151/state` `es.lastPrice` só se `priceAgeMs ≤ 10 000` (somente leitura; já consumido pelo Consolidator). Para cada `alpha-fusion` com signal ≠ NO_SIGNAL: registra `p0`, agenda +1/+5/+15/+30/+60 min; cada horizonte ⇒ `OUTCOME_CAPTURED` (preço válido no instante ± 30 s) ou `OUTCOME_UNKNOWN`; label `LABEL_PENDING` até todos os horizontes resolvidos, então `LABELED` (ret por horizonte + acerto de sinal). Sem preço ⇒ OUTCOME_UNKNOWN (nada inventado). Sem auto-otimização. Arquivo `var/alpha/outcomes.ndjson`.

## 9. PAINEL (FASE 7) — aba "ALPHA SIGNAL INTELLIGENCE" em `tools/jev-obs`
`server.mjs` ganha `GET /api/alpha/latest`, `/api/alpha/history?limit=`, `/api/alpha/metrics` (lê `var/alpha`, redigido, GET only, loopback). `public/` ganha a aba: 5 linhas (direção, strength, confidence, age, health) → FUSION (sinal, confidence, agreement, JEV Q1–Q12 com margem top1−top2), evidências, contradições, ignoradas, timeline/flips, latência por estágio, histórico com outcome.

## 10. OBSERVABILIDADE (FASE 11)
`var/alpha/metrics.json`: por agente calls, errors, timeouts, latência p50/p95 (fetch e eval), contagem BUY/SELL/NEUTRAL/UNKNOWN, histograma de confidence, falhas de freshness, contradições; Fusion BUY/SELL/NO_SIGNAL, distribuição de agreement/confidence, flips, fontes usadas/ignoradas; JEV requests, erros, latência, skips. Tokens = 0 (especialistas determinísticos; só o JEV consome tokens, registrado no `jev-routing.ndjson` canônico e espelhado no ledger `jev-obs`).

## 11. FILES_TO_CREATE
- `src/alpha/contracts.mjs` (builders + validadores dos 2 schemas), `src/alpha/http.mjs` (GET loopback com allowlist de host/porta/método, timeout), `src/alpha/snapshots.mjs`, `src/alpha/stats.mjs`
- `src/alpha/specialists/{quant,gamma,bot,q,data}.mjs` (endpoints + `evaluate()` puro)
- `src/alpha/fusion.mjs`, `src/alpha/jev-fusion.mjs`, `src/alpha/pipeline.mjs`, `src/alpha/outcomes.mjs`, `src/alpha/service.mjs`, `src/alpha/config.mjs`
- `config/alpha.json` (constantes PROVISÓRIAS, endpoints, throttle)
- `.claude/skills/skill-alpha-{quant,gamma,bot,q,data}/SKILL.md`, `context/jev-future/ALPHA_FUSION_V1.md`
- `test/alpha/*.test.mjs` + `fixtures/alpha/*.json` (payloads reais sanitizados desta auditoria, com variantes fresh/stale/erro)
- `handoffs/HANDOFF_ALPHA_AGENTS_20261002.md`

## 12. FILES_TO_MODIFY
- `tools/jev-obs/server.mjs` (+3 rotas GET), `tools/jev-obs/public/{index.html,app.js,style.css}` (aba ALPHA)
- `package.json` (+ scripts `test:alpha`, `alpha`; incluir `test/alpha` no `npm test`) — hunk isolado, sem tocar nas mudanças pré-existentes não relacionadas
- `.gitignore` (+ `var/`)

## 13. RISKS
- Fora do RTH tudo fica STALE/UNKNOWN (correto; o teste live de hoje valida o caminho STALE, e fixtures cobrem o caminho fresco).
- Quant/Data dependentes ⇒ mitigado pelo grupo de independência; Bot/Q sem lado ⇒ Fusion efetivamente tem ≤ 2 grupos direcionais (limitação factual, registrada).
- HIRO live só em RTH; formato do `tail` live não verificado hoje (verificado no replay) ⇒ parser tolera e registra `warnings`.
- Custo JEV ⇒ throttle + teto diário.
- Carga nas APIs de produção: ≤ 9 GETs/30 s em loopback, payloads ≤ 35 kB, nunca `/daily` (1,25 MB) ⇒ desprezível; nenhum write.
- Constantes não calibradas ⇒ marcadas UNCALIBRATED; nenhuma é tratada como validada.

## 14. TEST_PLAN (`node --test test/alpha/*.test.mjs`)
Por API: payload válido, incompleto (missing), stale, offline (ECONNREFUSED), erro HTTP 500, JSON inválido, mudança rápida (flip), campos contraditórios (Quant × Data opostos).
Fusion: 5 OK, 1 offline, 2 offline, todos neutros, consenso, conflito 3×2 (não vira maioria simples), fonte forte × 4 fracas, stale não vota, Q nunca origina/veta, redundância Quant+Data conta 1, reprodutibilidade (mesma entrada ⇒ mesmo hash).
JEV: mock A/B, falha (erro/timeout) não derruba o ciclo, throttle (estado igual ⇒ SKIPPED), parse Q1–Q12 (margin/ratio).
Pipeline: timeout de 1 especialista não atrasa os demais além de 4 s; persistência atômica; histórico; métricas.
Painel: rotas GET retornam o latest; POST/PUT ⇒ 405; Host estranho ⇒ 403.
Segurança: allowlist HTTP só GET em 127.0.0.1 nas portas {3495,3500,3457,3480,3490,5151}; varredura estática do `src/alpha` sem `method: 'POST'`, sem rotas de ordem, sem escrita fora de `var/`; consistência skill↔código (`rules_version`).
Live (read-only): 1 ciclo real contra as 5 APIs ⇒ 5 envelopes válidos pelo schema + 1 fusion válido (hoje: STALE/UNKNOWN/NO_SIGNAL esperado).

## 15. SHADOW
Lê, interpreta, registra, mostra. Nunca ordem, robô, posição, risco, conta, INVICTUS, AOT. BUY/SELL = informação analítica UNCALIBRATED.
