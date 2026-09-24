# JEV FUTURE — LIVE INPUT ADAPTER V1 (24/09/2026)

| | |
|---|---|
| LIVE ADAPTER | **OPERATIONAL**, somente leitura |
| FLUXO | relay real → **adapter** → `jev-input/v1` → **motor único** (`src/jev/engine.mjs`) → `jev-output/v1` |
| ESCOPO DO ADAPTER | só mapear. Não classifica, não interpreta direção, não inventa campo, não duplica o classificador |
| TRADE EXECUTION | **DISABLED**; nenhuma ordem existe no caminho |
| PRODUÇÃO ATUAL | **intacta**: só `GET` no relay local; nunca a raiz `/`; NT8 não tocado |
| 20–40 PREGÕES | FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING |
| F5 | NOT PERFORMED |

## 1. Fontes (discovery read-only, evidência no handoff §A)

```
gammagex.online (vendor) → gammagex-api 127.0.0.1:3530 → relay 127.0.0.1:3457 /gexbot/*  (TTL 20 s, bloco _relay)
```

| Rota lida (GET) | Conteúdo | Regra de freshness |
|---|---|---|
| `/gexbot/orderflow/ES_SPX` | orderflow cru do vendor (`zgr`, `ogr`, `net_dex`, …). A whitelist do relay aceita `ES_SPX`/`NQ_NDX` | FR_ROOT_ORDERFLOW (60 s PROVISIONAL) |
| `/gexbot/classic/SPX/{zero,one,full}` | perfil classic, strikes `[strike, gex_vol, gex_oi, priors[5]]`, `max_priors` | FR_CLASSIC (300 s PROVISIONAL) |
| `/gexbot/state/SPX/gex_{zero,one,full}` | perfil state (formato classic) | FR_STATE (300 s PROVISIONAL) |
| `/gexbot/state/SPX/{delta,gamma,vanna,charm}_{zero,one}` | `mini_contracts` por strike | FR_STATE |

**Nunca lidas:**
- a raiz `/` (documento composto);
- `/gexbot/orderflow` sem ticker e `/health` do relay: ambos **devolvem a raiz**;
- `:3530`, que expõe estado de token.

Se algum payload tiver cara de raiz (`instruments`, `trading_enabled`), é rejeitado (`RC_RELAY_ROOT_PAYLOAD_REJECTED`). Ticker e categoria são conferidos contra `_relay` (`RC_RELAY_TICKER_MISMATCH`, `RC_RELAY_CATEGORY_MISMATCH`).

## 2. Mapeamento dos 190 campos

A fonte é `src/jev/adapters/relay-mapping.mjs`. O artefato é `data/jev-live-relay-mapping-v1.json`, regenerado com `npm run build:mapping` (guard: 190/190, sem ES_NATIVE, sem rota proibida). Cada linha traz caminho real, `feature_id`, `market_origin`, base de timestamp, instância, transformação e notas.

| Status estático | Campos | O quê |
|---|---|---|
| MAPPED | **126** | 38 orderflow (37 por identidade + `pc_oi` derivado) · 26 classic · 29 state_gex · 33 state_greek |
| NOT_PRESENT_IN_CURRENT_RELAY | 35 | só existem na raiz: MenthorQ `levels.*` (12), cópia classic da raiz (14; o mesmo payload já vem em `abot.classic.*@SPX/zero`, sem duplicar), blocos legados congelados (8), `gamma_condition` (derivação da raiz, mesma família do `gex.net_0dte` já mapeado) |
| SOURCE_NOT_AVAILABLE | 29 | TRACE (9) e VolSignals (7): não servidos pelo relay, `market_origin` SPX preservado · AoClassicCache (11): histórico local do NT8, não lido · 2 derivados de indicador NT8 |

**Como o orderflow foi mapeado:** os nomes do contrato vêm da raiz. Cada `feature_id` foi ligado à chave crua por **identidade de valor**: 36/36 campos numéricos mais o timestamp, no mesmo vendor timestamp, conferidos contra uma única leitura da raiz feita só como evidência de discovery. Os 5 `levels.*` de expiração (`short_gamma_*`, `next_exp_*`) são aliases da raiz para `z_msgamma`, `o_msgamma`, `o_mlgamma`, `one_mcall` e `one_mput`.

**Transformações:**
- `pc_oi = |net_put_dex| / |net_call_dex|`, identidade CONFIRMED na auditoria, sem arredondar;
- `mini_contracts` é posicional conforme o feature contract: `[strike, call_ivol, put_ivol, greek_value, priors[3], col5, col6]`;
- o resto é identidade.

**Status ao vivo** (primeiro smoke, 24/09 04:43Z, fora do RTH):

| Status | Campos |
|---|---|
| MAPPED_AVAILABLE | 113 |
| SEMANTICALLY_UNRESOLVED | 9 (cvr/oflow ×8, `zero_mput`) |
| MAPPED_CURRENTLY_NULL | 4 (`conversion` ×3, `col6`) |
| NOT_PRESENT_IN_CURRENT_RELAY | 35 |
| SOURCE_NOT_AVAILABLE | 29 |

O runtime recebeu **122/190**. Nenhum valor foi inventado para preencher buraco.

## 3. Como iniciar / parar

```
npm run live:once                                   # 1 ciclo, imprime o jev-output/v1
node src/jev/cli.mjs --live                         # contínuo (poll 30 s), resumo por ciclo no stderr
node src/jev/cli.mjs --live --out ultimo.json --report-out relatorio.json [--cycles N] [--interval-ms 30000]
npm run smoke:live                                  # live smoke read-only (3 ciclos + fail-soft), grava evidência sanitizada
```

**Parar:** Ctrl+C. O `AbortController` termina o ciclo atual e sai com exit 0.

**`--out`:** grava o último resultado, sobrescrevendo a cada ciclo.

**Mínimo de 5 s entre ciclos:** o relay é compartilhado com a produção; o padrão é 30 s, o TTL do relay é 20 s e cada ciclo faz 15 GETs sequenciais.

**Config:** `config/jev-live-input-v1.json`. Contém host, porta, `base_path`, timeouts, `poll_interval_ms`, tickers, categorias, `extra_routes`, sessão, detecção de FROZEN e `runtime_config_overrides`.
- Sem segredo.
- `read_only: true` é obrigatório.
- Host e porta nunca estão no motor.

## 4. Fail-soft

| Situação do relay | Resultado |
|---|---|
| offline | `RC_RELAY_OFFLINE` |
| timeout | `RC_RELAY_TIMEOUT` |
| JSON malformado | `RC_RELAY_MALFORMED` |
| HTTP ≠ 2xx | `RC_RELAY_HTTP_ERROR` |
| timestamp ausente | `RC_SOURCE_TIMESTAMP_MISSING` ⇒ freshness UNKNOWN |
| fonte extra desconhecida | ignorada + `RC_ADAPTER_UNKNOWN_SOURCE_IGNORED` |
| chave nova no payload | vai para `unmapped_payload_keys` no relatório |

Em todos os casos:
- o processo **continua**;
- o motor recebe o que existe;
- as dimensões dependentes ficam UNKNOWN/UNAVAILABLE e a `data_quality` degrada;
- os `reason_codes` registram o problema;
- sem nenhuma fonte ⇒ DATA_INVALID ⇒ UNKNOWN.

FATAL só para config live inválida (schema, `read_only`, tickers, `base_path`) ou artefato do motor ilegível.

## 5. Freshness e FROZEN

- **Base:** vendor timestamp do payload. A chegada nunca prova freshness.
- **Um timestamp por regra `FR_*`:** o **mais antigo** entre as rotas lidas (conservador). Se alguma rota não tem ts, a regra fica sem ts.
- **Sessão:** relógio America/New_York, RTH 09:30–16:00 em dias úteis (nota do contrato). **Feriados não conhecidos** (open item). Fora do RTH ⇒ MARKET_CLOSED.
- **TRACE / MenthorQ:** sem `stale_after_sec` no contrato ⇒ UNKNOWN por padrão. Só um limiar PROVISIONAL explícito em `runtime_config_overrides` muda isso, e o audit mostra a origem (`OPERATOR_CONFIG_PROVISIONAL`). Nada vira cânone silenciosamente. Hoje nenhuma das duas fontes passa pelo relay.
- **FROZEN (implementado):**
  - o adapter guarda o vendor ts da leitura anterior;
  - N leituras consecutivas com o mesmo vendor ts e a chegada avançando, **no RTH**, marcam `sources[FR].observed_frozen` + `RC_SOURCE_FROZEN_CANDIDATE`;
  - o motor classifica essa fonte como `FROZEN` (enum existente), ela deixa de ser utilizável e surge `RC_DQ_SOURCE_FROZEN`;
  - N = 3 e só FR_ROOT_ORDERFLOW, conforme `FR_ROOT_ORDERFLOW.frozen` do contrato.
- **FROZEN_VALUES entre pregões:** não implementado (precisa de histórico). NON_BLOCKING_OPEN_ITEM.

## 6. Garantias

- Somente `GET` (teste A15 verifica o método no servidor falso e no código do cliente).
- Nenhuma escrita além dos arquivos pedidos na CLI (`--out`, `--report-out`).
- Nenhum processo filho no runtime.
- As mesmas travas do runtime valem: `JEV_CAN_SEND_ORDER`, `EXECUTE_TRADE`, `MODIFY_NT8` e `OVERRIDE_CORE` = false.
- `audit.guarantees.orders_emitted = 0` em todo ciclo.

## 7. Open items (não bloqueantes)

- Feriados de mercado na sessão por relógio.
- FROZEN_VALUES entre pregões.
- Freshness por instância: hoje é um ts por regra, o mais antigo.
- Captura TRACE/VolSignals: fora do relay.
- MenthorQ só na raiz: continua fora.
- Instâncias SPY opcionais (`secondary_tickers`) desligadas por padrão.
