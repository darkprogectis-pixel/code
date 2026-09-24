# JEV DEALER CONTEXT CONTRACT (23/09/2026)

| | |
|---|---|
| PROJECT | ALFA OMEGA JEV FUTURE |
| STATUS | ARCHITECTURAL DEFINITION ONLY |
| IMPLEMENTATION | NONE |
| PRODUCTION | OUT OF SCOPE / UNCHANGED |
| F5 | NOT PERFORMED |
| ORIGEM DESTA DEFINIÇÃO | ordem canônica do operador (sessão 4f178371) |

Este contrato é só definição arquitetural: não traz modelo, score, pesos, LONG/SHORT, gate nem integração com o NT8. O `feature-contract.v1.json` do projeto direcional é referência de forma, não de escopo.

---

## 1. Regra principal — quatro fontes completas (OBRIGATÓRIA)

O Jev Future analisa o **conteúdo completo** de:

1. AlfaOmegaNetGex0DTE
2. AlfaOmegaDexGexFlow
3. AlfaOmegaClassic
4. AlfaOmegaState

- **Proibido reduzir antes da análise.** Estas fontes não viram um conjunto pequeno de features antes de o Jev as ver.
- **A ingestão preserva** todos os campos úteis e documentados disponíveis, raw e derived, com lineage explícito (§6).
- **O feature contract futuro pode marcar** relevância, redundância, double counting, freshness e qualidade. **Não pode** descartar a maior parte da informação antes da análise.
- **Inventário de partida (só leitura, já existente):**
  - `data/gammagex-field-inventory.json`
  - `data/gammagex-source-lineage.json`
  - `data/gammagex-double-counting-map.json`
  - `data/gammagex-jev-candidates.json`
  - `ABOT_GAMMAGEX_ES_FIRST_AUDIT_20260923.md`

## 2. Papel da camada

A família das quatro fontes é **DEALER / OPTIONS / MARKET-STATE CONTEXT** e participa da leitura completa do contexto.

Isoladamente, ela **NÃO** é:
- originador obrigatório de LONG/SHORT;
- veto automático;
- gate independente;
- substituto do Futures Core.

## 3. TRACE e VolSignals — origem SPX (OBRIGATÓRIA)

| Fonte | MARKET_ORIGIN | Identidade do dado |
|---|---|---|
| SpotGamma TRACE | **SPX** | SPX DEALER / OPTIONS CONTEXT |
| VolSignals | **SPX** | SPX DEALER / OPTIONS CONTEXT |

- **Nunca `ES_NATIVE`.** Vale mesmo quando o gráfico acompanha o ES visualmente, quando há hedge mapping ou transformação para o produto futuro, ou quando há proximidade de tempo ou preço.
- **Mapear não muda a identidade.** Um mapeamento SPX→ES pode existir como `derivation`, mas `market_origin` continua SPX.

## 4. Papel de TRACE e VolSignals — FINAL_DECISION_CONTEXT_LAYER

Depois que o Jev analisou os dados nativos das quatro fontes (§1), TRACE e VolSignals entram como informação adicional de alto nível para:
- contextualizar;
- confirmar;
- contradizer semanticamente;
- enriquecer o estado dealer/options;
- ajudar a interpretar o contexto SPX relevante ao ES.

`SOURCE_ORIGIN = SPX` é preservado sempre. TRACE e VolSignals não são convertidos conceitualmente em ES.

## 5. Resultado canônico — TRACE × VolSignals

**Proveniência.**
- Autoria: auditoria técnica executada por uma instância anterior do Claude Code.
- Transferência: chegou a este projeto por handoff. O operador só transportou o handoff entre as instâncias.
- Nesta sessão: o resultado foi incorporado ao contrato arquitetural e não foi reexecutado.
- O artefato original da auditoria não está neste workspace.

**7 campos VolSignals auditados.**

### 5.1 Gamma = PARTIAL_ANALOG (não é DIRECT_ANALOG)

| Aspecto | VolSignals | TRACE |
|---|---|---|
| Conceito | grade timestamp × preço → exposição | grade timestamp × preço → exposição (**compartilhado**) |
| Metodologia | "Simulated" | `mkt_actor=mm` (**divergente**) |
| Transporte | protobuf / RPC | REST / JSON (**divergente**) |

### 5.2 Outros 6 campos = INSUFFICIENT_INFORMATION

- **VolSignals:** o pipeline está identificado.
- **TRACE:** o menu só expôs Gamma, Delta Pressure e Charm Pressure.
- **O que falta:** evidência capturada do corpo da resposta, do raw field, da fórmula e da unidade.
- **Consequência:** a equivalência não está estabelecida. **As lacunas não são preenchidas por inferência.**

### 5.3 Unidades VolSignals

| Campo | Unidade |
|---|---|
| gammaExposure | UNKNOWN |
| charmExposure | UNKNOWN |
| deltaChangeExposure | UNKNOWN |
| deltaTotalExposure | UNKNOWN |
| deltaExposureDiff | UNKNOWN |
| vannaExposure | UNKNOWN |
| volgaExposure | UNKNOWN |

**Regra:**
- `UNKNOWN UNIT ⇒ NO NUMERIC EQUIVALENCE`.
- TRACE e VolSignals **nunca** são normalizados numericamente entre si sem evidência explícita de unidades compatíveis.

### 5.4 deltaExposureDiff

| | |
|---|---|
| TYPE | int64 |
| OBSERVED | 3678 / 3678 = 0 |
| FUNCTION | UNKNOWN |
| 3 hipóteses anteriores | EXCLUDED |

Não se atribui significado até surgir evidência nova.

### 5.5 Evidência faltante = OPTIONAL_EVIDENCE_GAP (não bloqueia o Jev)

- body de resposta de `/v2/open_interest/intraday_delta`;
- screenshot ou evidência que vincule o TRACE "Delta Pressure" ao endpoint real correspondente.

**Nenhuma evidência faltante bloqueia o design do Jev.**

## 6. Lineage obrigatório (metadata mínima por campo)

| Campo | Conteúdo |
|---|---|
| `source_system` | ex.: GammaGex/A-Bot, SpotGamma, VolSignals |
| `source_component` | ex.: AlfaOmegaNetGex0DTE, AlfaOmegaState, TRACE |
| `market_origin` | origem real do dado (TRACE = SPX; VolSignals = SPX; A-Bot/GammaGex = origem real **por campo**) |
| `underlying` | subjacente do cálculo |
| `raw_or_derived` | RAW / DERIVED |
| `source_field` | nome original no vendor ou no componente |
| `derivation` | transformação aplicada (incluindo mapeamento para ES) ou NONE |
| `timestamp` | timestamp **do dado**, não da chegada |
| `freshness` | idade no momento da leitura |
| `unit` | unidade ou UNKNOWN |
| `unit_confidence` | CONFIRMED / INFERRED / UNKNOWN |
| `lineage_group` | cadeia de origem compartilhada |
| `double_counting_group` | fenômeno único que várias leituras representam |

**Cuidado conhecido de A-Bot/GammaGex:** `ES_SPX` é o preço do ESZ6 desde 09/09 e era SPX cru antes disso (`ABOT_GAMMAGEX_ES_FIRST_AUDIT_20260923.md`). O `market_origin` e o `unit` desses campos precisam refletir essa quebra.

## 7. Double counting (OBRIGATÓRIO)

- **Um fenômeno, uma evidência.** Nunca contam como quatro evidências independentes:
  - `net_0dte`;
  - `gamma_condition`;
  - State imbalance (`gex_zero`);
  - cor do NetGex0DTE.
- **Base medida:** `net_0dte ≡ gamma_condition ≡ imbalance do State` e `gamma_condition ≡ sign(gex0)` em 100 % desde 13/07 (ABOT audits).
- **A mesma regra vale entre TRACE, VolSignals, GammaGex e SpotGamma** sempre que a lineage mostrar origem ou construção compartilhada.
- **Lineage desconhecida não é independência.** Enquanto a lineage for UNKNOWN, a independência também é UNKNOWN.
- **Contagem:** as confirmações contam por `double_counting_group`, não por campo.

## 8. Fora deste contrato

Programar o Jev · modelo · score · pesos · LONG/SHORT · gate · integração com o NT8 · alteração de produção · validação de 20–40 pregões.
