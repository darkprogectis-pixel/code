# HANDOFF — JEV FUTURE · RUNTIME V1 (24/09/2026)

Autocontido. A ordem do operador foi implementar o JEV Runtime V1 operacional, separado da produção e sem execução de trade.
Partida: commit `e152d3d` (preregistration REVIEWED / STRUCTURALLY CONSOLIDATED). Documento operacional: `context/jev-future/JEV_RUNTIME_V1_20260924.md`.

| Etapa | Estado |
|---|---|
| A. architecture | **DONE**: `src/jev/` com 10 módulos, sem dependências, Node ≥ 22 |
| B. implementation | **DONE** |
| C. tests | **PASS 21/21** (`npm test`) |
| D. smoke | **PASS 7/7** (`npm run smoke`) |
| E. end-to-end | **PASS**: fixture C + snapshot anterior + TRACE provisional ⇒ UNKNOWN, 10 regras SUPPORTED avaliadas, 0 ordens |
| F. commit/push | commit `Implement JEV Future runtime V1` (o que contém este arquivo), push para `origin main` |

## 1. Estado

| | |
|---|---|
| RUNTIME | OPERATIONAL (`jev-runtime/v1.0.0`) |
| Saída de lançamento | `UNKNOWN` + `RC_NO_ACTIVE_DIRECTIONAL_RULE` (ou `RC_DATA_INVALID`). Estado seguro, não falha |
| ACTIVE SIDE RULES | 0 |
| TRADE EXECUTION | DISABLED: 4 travas constantes; ligar por config é FATAL |
| CORE × JEV | UNDEFINED / NOT IMPLEMENTED (só `core_comparison`) |
| Produção atual | UNCHANGED: nenhum código de produção lido, importado ou escrito; o teste 20 impede rede/processos/escrita/referências |
| Artefatos canônicos | UNCHANGED (hash dos JSONs idêntico antes/depois das execuções; teste 20) |
| 20–40 pregões | FUTURE VALIDATION OBSERVATION ONLY / NON-BLOCKING |
| F5 | NOT PERFORMED |

## 2. Arquivos criados

| Arquivo | Papel |
|---|---|
| `src/jev/{config,artifacts,ingest,normalize,quality,rules,native,spx,engine,output,cli}.mjs` | runtime |
| `test/jev/runtime.test.mjs` | 21 testes (os 20 obrigatórios + 2 extras; o item 5/6 é um teste só) |
| `test/jev/smoke.mjs` | smoke do processo real via CLI |
| `fixtures/jev/A–H_*.json`, `C_previous_snapshot.json`, `config-fixture-trace-provisional.json` | fixtures sintéticas estruturais |
| `config/jev-runtime-v1.json` | config padrão |
| `package.json` | scripts `jev`, `jev:example`, `test`, `smoke`, `build:prereg`. Sem `"type"`, para não quebrar os geradores CommonJS |
| `context/jev-future/JEV_RUNTIME_V1_20260924.md` | documentação operacional |
| `context/jev-future/runtime-examples/jev-output-example-v1.json` | exemplo sanitizado (sintético) |

## 3. Decisões de implementação

1. **Regras vêm do JSON.** O motor só liga regras ATIVAS a avaliadores e falha no arranque se:
   - alguma SUPPORTED não tem avaliador;
   - alguma estrutural não tem ponto de aplicação;
   - alguma regra inativa tem avaliador;
   - alguma ativa emite lado.
   HYPOTHESIS, BLOCKED e DIAGNOSTIC saem no audit como EXCLUDED, com motivo.
2. **Máquina de estados lida do artefato.** Os passos de lado são inalcançáveis; se um fosse alcançado, é FATAL (invariante), nunca um lado inventado.
3. **R_S10 dimensional:**
   - família ou spot ausente degrada só o dependente;
   - DATA_INVALID só sem dimensão dealer utilizável;
   - DEGRADED é frequente e honesto: famílias de leitura ativa ausentes, TRACE PENDING_REVISION_AUDIT.
4. **Freshness:**
   - limiares PROVISIONAL do contrato (60 s / 300 s);
   - TRACE/MenthorQ sem limiar no contrato ⇒ UNKNOWN por padrão; override PROVISIONAL só por config explícita, registrada no audit;
   - VolSignals: basis UNKNOWN ⇒ nunca FRESH.
5. **R_S18:**
   - 5 pares (fonte, dimensão) no enum existente;
   - escalar só sem perda, senão `null` + `RC_SPX_EFFECT_NOT_DERIVED`;
   - CONTRADICTS ⇒ `conflicts[]` DESCRIPTIVE_C_VS_B, nunca CONFLICTED.
6. **R2:** LEVEL_MIGRATION só entre valores presentes na grade de strikes do mesmo payload; os demais níveis ficam UNAVAILABLE com `RC_LEVEL_MIGRATION_UNAVAILABLE_PENDING_DECISION`.
7. **R6:** override KLO_1 (lido da máquina de estados) marca as duas famílias de risk reversal como uma evidência.
8. **Output:** as 16 chaves do contrato + envelope; nenhum enum ou chave nova no contrato.

## 4. POST_LAUNCH_REFINEMENT_BACKLOG (não bloqueia)

- R2: definir o critério de migração de nível interpolado;
- R6: materializar nas evidence families (reabre FC/DL V1);
- G1/G2: contrato de leitura e elegibilidade de conflito;
- E1–E7: não executados;
- FROZEN por vendor ts repetido: exige histórico de leituras;
- limiar de freshness TRACE/MenthorQ;
- produtor real de `jev-input/v1` a partir do relay (sem tocar produção);
- regras de lado: só por pré-registro de validação + decisão do operador, com revisão versionada do contrato/guard;
- 20–40 pregões: observação futura, NON-BLOCKING.

## 5. Observação para o operador

`CLAUDE.md` e `START_HERE.md` ainda dizem "IMPLEMENTATION: NONE" / "Next phase: Preregistration Design V1". Não os alterei nesta fase porque são texto canônico de bootstrap. Recomendo atualizá-los com ordem, para que a próxima sessão não trate o runtime como fora de escopo.

## 6. Próximo passo exato

Operador executa `npm test`, `npm run smoke` e `node src/jev/cli.mjs --input fixtures/jev/C_valid_multi_source.json` e revisa a saída. Depois disso, a próxima fase candidata é o **adaptador de input read-only** (relay GammaGex/:3530 → `jev-input/v1`), sem tocar produção e com ordem explícita. As refinações do backlog seguem em paralelo, não bloqueantes.
