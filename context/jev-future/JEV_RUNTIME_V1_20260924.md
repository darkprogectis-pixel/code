# JEV FUTURE — RUNTIME V1 (24/09/2026)

| | |
|---|---|
| RUNTIME | **OPERATIONAL** (`jev-runtime/v1.0.0`) |
| PAPEL | classificador SEPARADO de estado de mercado / confluência. **Não é sistema de trade** |
| SAÍDA DE LANÇAMENTO | `jev_directional_context = UNKNOWN` + `RC_NO_ACTIVE_DIRECTIONAL_RULE`: **estado operacional seguro, não falha** |
| TRADE EXECUTION | **DISABLED**: `JEV_CAN_SEND_ORDER`, `JEV_CAN_EXECUTE_TRADE`, `JEV_CAN_MODIFY_NT8` e `JEV_CAN_OVERRIDE_CORE` = false (constantes; ligar por config é FATAL) |
| CORE × JEV | fusion/conflict **UNDEFINED / NOT IMPLEMENTED**. O Core só aparece em `core_comparison`, sem efeito |
| PRODUÇÃO ATUAL | **intacta**: nenhum import, caminho, rede ou escrita em AOT/robo-trade/Consolidator/DarkFlow/Copilot/Core V0/FlowOne/GexBot/NT8/signal-engine |
| 20–40 PREGÕES | **FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING**: não é gate, pré-condição nem requisito de runtime, lançamento ou fechamento |
| F5 | NOT PERFORMED |
| DEPENDÊNCIAS | nenhuma (Node ≥ 22; testado em Node 26) |

## 1. Como iniciar

```
node src/jev/cli.mjs --input fixtures/jev/C_valid_multi_source.json
node src/jev/cli.mjs --input <arquivo jev-input/v1> [--previous <snapshot anterior>] [--config config/jev-runtime-v1.json] [--out resultado.json] [--output-only]
npm test          # 21 testes automatizados (node:test)
npm run smoke     # smoke do processo real: 7 checks
npm run jev:example
```

**Saída:**
- sem `--output-only`: `{ output, audit }`;
- com `--output-only`: só `output`.

**Exit codes:**

| Código | Significado |
|---|---|
| 0 | output produzido (inclui UNKNOWN e DATA_INVALID) |
| 2 | FATAL estrutural: config inválida, artefato ilegível/corrompido, invariante quebrado |
| 64 | uso incorreto |

Problemas de input nunca dão exit ≠ 0: viram `reason_codes` e aviso no stderr.

## 2. Arquitetura

```
src/jev/
  config.mjs     config + travas de segurança (constantes)
  artifacts.mjs  carrega os 10 artefatos canônicos (read-only) + invariantes FATAL + sha256
  ingest.mjs     jev-input/v1 (fail-soft)
  normalize.mjs  190 feature_ids, instâncias ticker/categoria, lineage preservada
  quality.mjs    freshness por fonte + disponibilidade por família/dimensão (R_S08, R_S10 revisada, R_S11)
  rules.mjs      motor de regras: liga regras ATIVAS do JSON a avaliadores; exclui HT/BLOCKED/DIAGNOSTIC
  native.mjs     R_M01–R_M08 (estágio B, descritivas, direction 0)
  spx.mjs        R_M09, R_M10 + R_S18 por (fonte, dimensão) (estágio C)
  engine.mjs     pipeline + montagem do output + audit
  output.mjs     validação do output contra o output contract V1; core_comparison
  cli.mjs        entrada de linha de comando
test/jev/        runtime.test.mjs (21 testes) · smoke.mjs
fixtures/jev/    A–H + snapshot anterior + config de fixture (TRACE provisional)
config/jev-runtime-v1.json
```

**Pipeline** (R_S01):

```
ingest → normalize (190) → data quality → evidence families → native dealer state (B)
       → native_directional_context → SPX final context (C) → jev_directional_context
       → MenthorQ overlay → core_comparison → output + audit
```

**Fonte das regras:** as regras vêm de `data/jev-preregistered-rules-v1.json`, e a máquina de estados de `data/jev-classification-state-machine-v1.json`. No arranque o motor verifica:
- toda regra SUPPORTED_SEMANTIC tem avaliador;
- toda CANONICAL_STRUCTURAL tem ponto de aplicação;
- **nenhuma** regra inativa tem avaliador;
- nenhuma regra ativa emite lado.

Qualquer divergência é FATAL: uma hipótese não escapa para o registro nem por edição do JSON.

## 3. Input — `jev-input/v1`

```json
{
  "schema": "jev-input/v1",
  "evaluated_at": "2026-09-24T15:00:00Z",
  "session": "RTH | OUTSIDE_RTH",
  "sources": { "FR_ROOT_ORDERFLOW": { "vendor_timestamp": 1790262000 }, "FR_CLASSIC": { "vendor_timestamp": "2026-09-24T14:59:30Z" } },
  "fields": {
    "abot.root.gex.net_0dte": 1200.5,
    "abot.classic.zero_gamma": { "SPX/zero": 6590.0, "SPX/one": 6570.0 },
    "abot.classic.strikes[]": { "SPX/zero": [ { "strike": 6600, "gex_vol": 40, "gex_oi": 5, "priors": [1,2,3,4,5] } ] },
    "spx_final_context.trace.gamma_mm": { "at_spot": 150.0 }
  },
  "core": { "side": "LONG | SHORT | NONE" }
}
```

- **Chaves de `fields`:** `feature_id` do Feature Contract V1.
  - Campos template aceitam valor direto (= instância primária `SPX/<1ª categoria>`) ou mapa de instâncias `TICKER/categoria`.
  - Campos de array usam o prefixo `...[]` com linhas-objeto.
- **`sources`:** um vendor timestamp por regra de freshness (`FR_*`).
  - Número = epoch em **segundos**; string = ISO-8601.
  - Valor > 1e11 é tratado como inválido; ms não é adivinhado.
- **Nenhum campo é obrigatório.** Ausentes, nulos e desconhecidos são registrados no audit (`missing`, `null_at_source`, `unrecognized`) e degradam só o que depende deles.
- **`session`** é informativa e fornecida pelo produtor do input; o runtime não a deriva do relógio.
- **SPY e outros tickers** são aceitos e registrados, mas não somados a SPX (HT10 / R_S05).
- **`--previous`:** snapshot anterior (mesmo formato), usado só para transições (R_M05/06/07). Snapshots em lados opostos de 09/09 não são comparados (R_S07).
- **Anti-lookahead do TRACE** (bin i só em t[i+1]) é responsabilidade de quem monta o input.

## 4. Output — `jev-output/v1`

**Envelope:** `schema`, `runtime_version`, `evaluated_at`, `generated_at`.

**As 16 chaves do output contract V1:**
- `jev_market_state`, `jev_directional_context`, `native_dealer_state`, `native_directional_context`, `spx_final_context`;
- `evidence_families`, `conflicts`, `data_quality`, `reason_codes`, `source_contributions`, `unresolved_fields`;
- `menthorq`, `conviction` (= UNCALIBRATED), `core_comparison`, `core_comparison_pair`, `versions` (inclui sha256 dos artefatos).

Nenhuma chave nova no contrato, nenhum enum novo, **sem MIXED**. Exemplo sanitizado: `runtime-examples/jev-output-example-v1.json`.

**Detalhes relevantes:**

- **`jev_directional_context`:** no V1 só UNKNOWN é alcançável.
  - `RC_DATA_INVALID` se nenhuma dimensão dealer é utilizável;
  - senão `RC_NO_ACTIVE_DIRECTIONAL_RULE`;
  - nunca NO_TRADE_CONTEXT.
- **`native_dealer_state`:**
  - `gamma_regime`: R_M01 + by_expiry R_M02;
  - `structure_location`: R_M03 + R_M04;
  - `delta_positioning`: razão DEX; direção UNRESOLVED;
  - `second_order_flows`, `vol_skew`, `flow_unknown_semantics`: UNRESOLVED;
  - `change_transition`: R_M05/06/07.
  - Todas as leituras com `direction 0`.
- **`spx_final_context`:** escalar `effect_on_native` só quando derivável sem perda; senão `null` + `RC_SPX_EFFECT_NOT_DERIVED`.
  - Efeitos granulares por (fonte, dimensão) em `source_contributions[].spx_effect` e `RC_SPX_<SOURCE>_<DIM>_<EFEITO>`.
  - CONTRADICTS também vai para `conflicts[]` como `DESCRIPTIVE_C_VS_B`, **nunca** CONFLICTED_CONTEXT.
- **`evidence_families`:** só famílias com membro presente.
  - `independence = SINGLE_EVIDENCE` (consolidadas) ou `NOT_PRESUMED` (unknown lineage ≠ independência);
  - `lineage_override` KLO_1 para risk reversal raiz ≡ classic SPX/zero (R6);
  - `counted_as_vote: false`.
- **`menthorq`:** sempre `ZERO` no V1 (alinhamento indefinido, HT09); `effect_on_context: NONE`.

**`audit`:**
- inputs recebidos / faltantes / nulos / não reconhecidos;
- famílias utilizáveis;
- disposição de **cada uma das 58 regras** (EVALUATED / ENFORCED_STRUCTURAL / EXCLUDED + motivo);
- trace da máquina de estados, reason codes, conflitos, unresolved;
- limiares usados e origem;
- versões/hashes;
- garantias (`orders_emitted: 0`...).

Nenhum segredo é lido nem logado.

## 5. Data quality (R_S10 revisada) e fail-soft

- **Freshness por fonte**, pelo vendor timestamp, com limiares **PROVISIONAL** do contrato: 60 s orderflow; 300 s classic, state e cópia classic da raiz.
  - Ausente ou inválido, ou no futuro ⇒ UNKNOWN.
  - OUTSIDE_RTH com ts válido ⇒ MARKET_CLOSED.
  - Bloco congelado ⇒ FROZEN_VALUES.
  - Cache histórico ⇒ UNKNOWN (não é leitura ao vivo).
  - **VolSignals:** basis UNKNOWN ⇒ nunca FRESH.
- **TRACE e MenthorQ** não têm `stale_after_sec` no contrato ⇒ freshness UNKNOWN por padrão.
  - O operador pode fornecer um limiar PROVISIONAL em `provisional_stale_after_sec_overrides`; ele aparece no audit como `OPERATOR_CONFIG_PROVISIONAL`.
  - `fixtures/jev/config-fixture-trace-provisional.json` é só para fixtures.
- **Família utilizável:** ≥ 1 membro presente, fonte FRESH/MARKET_CLOSED e sem estado estático FROZEN/DEGENERATE.
- **Dimensão:** USABLE / PARTIAL / UNAVAILABLE.
  - Família ou spot ausente degrada só o dependente.
  - DATA_INVALID global só sem dimensão dealer utilizável.
- **FATAL só para:** config inválida, artefato obrigatório ilegível/corrompido e invariante interno quebrado.
- **Fail-soft:**
  - erro de avaliador vira `RC_RULE_EVALUATION_ERROR` + audit;
  - input ilegível vira `RC_INPUT_UNREADABLE` / `RC_INPUT_UNPARSEABLE` + UNKNOWN.

## 6. Estados ainda indisponíveis (esperado, não defeito)

| Estado | Situação |
|---|---|
| LONG / SHORT / NEUTRAL / CONFLICTED | BLOCKED no registro: nenhuma regra de lado ativa; hipóteses só no braço de pesquisa (não implementado) |
| NO_TRADE_CONTEXT | UNDEFINED / BLOCKED |
| UNKNOWN | único estado alcançável, e seguro |

## 7. POST_LAUNCH_REFINEMENT_BACKLOG (não bloqueia)

| Item | Comportamento no runtime V1 |
|---|---|
| R2: migração de nível interpolado | LEVEL_MIGRATION só entre valores que estão na grade de strikes do mesmo payload; o resto vai para UNAVAILABLE com `RC_LEVEL_MIGRATION_UNAVAILABLE_PENDING_DECISION` |
| R6: materialização nas evidence families | override de governança KLO_1 aplicado no output; Decision Logic V1 não reaberta |
| G1/G2: contrato de leitura / elegibilidade de par para conflito | conservador: sem regra de lado não há conflito direcional; divergências só descritivas |
| E1–E7 | não executados |
| FROZEN por vendor ts repetido (≥ 3 leituras em RTH) | não implementado (exige histórico de leituras); hoje só FROZEN_VALUES estático |
| limiar de freshness de TRACE/MenthorQ | só por override PROVISIONAL explícito do operador |
| produtor de input real (relay → jev-input/v1) | não conectado nesta fase (produção não tocada) |
| 20–40 pregões | FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING |
