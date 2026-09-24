# FRONT B — JEV Future / Classification State Machine Audit
Data: 2026-09-24
Repositório auditado: C:\Users\ADM\Claude-JEV\code
Natureza: auditoria estática de design. Não é validação de mercado nem execução da máquina.
Resultado: FRONT B COMPLETE; STATE MACHINE STRUCTURAL_GAPS_FOUND.

## 1. Conclusão principal

UNKNOWN é o único estado alcançável no registro V1 por construção, e isso é apropriado enquanto nenhuma regra direcional estiver autorizada. Não se deve liberar LONG/SHORT inventando sinal de GEX, DEX, gregas ou níveis.

Contudo, a afirmação do pré-registro §6 de que a incompletude não envolve lacuna de desenho é excessiva: há lacunas verificáveis de formalização para neutralidade, conflito, elegibilidade por campo e evolução do registro. Elas não provam emissão incorreta hoje: o segundo passo da máquina impede alcançar esses ramos, e runtime não existe.

NO_TRADE_CONTEXT deve continuar com critérios UNDEFINED. Não foi encontrado candidato suficientemente sustentado pelos contratos. Não confundir a conclusão da auditoria com conclusão/ativação do classificador.

## 2. Escopo e evidência

Lidos os 12 arquivos solicitados: CLAUDE.md; handoff, Dealer Context, Feature Contract, Decision Logic e Preregistration Design; os seis JSON de regras, máquina, hipóteses, mapeamentos provisórios, rotas e famílias. Todos os 190 IDs da tabela Feature Contract foram confrontados com as rotas; leitura integral dos JSON em memória e inspeção de seus registros relevantes, sem imprimir os arquivos grandes integralmente.

Duas leituras adicionais justificadas:
- data/jev-output-contract-v1.json: verificar enums, distinções, estrutura de reading/conflicts e ausência de um contrato tipado de leitura direcional.
- scripts/build-jev-preregistration-design-v1.js: somente trechos de guards e cálculo de cobertura, para verificar promoção de regras e flags de pesquisa. NÃO executado.

Todos esses caminhos estão sob context/jev-future/, salvo CLAUDE.md. O workspace externo antigo citado no handoff não foi usado nem alterado. A ordem atual read-only prevalece sobre instruções históricas de regenerar artefatos.

Checagens estáticas efetuadas, sem geradores:
- 58 regras: 21 CANONICAL_STRUCTURAL; 10 SUPPORTED_SEMANTIC; 10 HYPOTHESIS_TO_TEST; 10 BLOCKED_BY_UNKNOWN_SEMANTICS; 7 DIAGNOSTIC_ONLY.
- 31 regras nominalmente elegíveis pelos status ativos; zero emits_side=true entre elas.
- Só HT01–HT04 têm emits_side=true; todas HYPOTHESIS_TO_TEST.
- 18 pré-condições: 5 MET, 1 PARTIAL, 11 UNMET, 1 UNDEFINED. As pré-condições explicitamente listadas pelas 31 regras ativas estão MET.
- 190/190 IDs únicos em tabela, rotas e cobertura; 174 B + 16 C; nenhum ID ausente entre tabela e rotas; is_vote=false em todas; todas as rotas PROVISIONAL_DESIGN_MAPPING.
- Referências rota→família, regra→DC e cobertura→regra resolvem. Isso verifica integridade referencial, NÃO suficiência semântica.
- 102 famílias: 8 CONSOLIDATED, 16 SEPARATE_SUSPECTED_OVERLAP, 8 SEPARATE_SUSPECTED, 62 SEPARATE_UNVERIFIED, 3 SEPARATE_PARTIAL_ANALOG, 5 NON_EVIDENCE.
- 53 campos marcados side_capable_in_research_arm; zero no registro. Nenhuma das 10 hipóteses tem testable_now=true.
- Resultado por raciocínio estático, sem executar um classificador, sem fixtures de mercado e sem coletar dados.

## 3. Prova de alcançabilidade

Seja A o conjunto de regras CANONICAL_STRUCTURAL ou SUPPORTED_SEMANTIC e S o subconjunto de A com emits_side=true. No artefato atual, |A|=31 e S é vazio.

A máquina, context_decision.ordered_steps:
1. DATA_INVALID → UNKNOWN / RC_DATA_INVALID.
2. Nenhuma regra ativa de lado avaliável → UNKNOWN / RC_NO_ACTIVE_DIRECTIONAL_RULE.
3. NO_TRADE_CONTEXT inativo: critério e posição na ordem ainda não pré-registrados.
4–6. CONFLICTED, LONG/SHORT e NEUTRAL não são alcançados porque o passo 2 já encerrou.

R_M01–R_M10 descrevem regime, localização, estrutura, mudança aritmética, composição DEX ou contexto TRACE, nunca lado. POSITIVE_GAMMA não é LONG, NEGATIVE_GAMMA não é SHORT; direction=0 de um descritor não é evidência de NEUTRAL_CONTEXT.

R_S17 mantém jev_directional_context = native_directional_context. C pode anotar efeito de regime sem converter UNKNOWN em lado. R_S19 não deixa MenthorQ originar contexto; alinhamento não definido mantém ZERO. R_S21 deixa Core somente na comparação. Não há caminho alternativo legítimo.

O guard do gerador, linha 255, rejeita qualquer regra ativa que emita lado. Isso reforça deliberadamente o congelamento V1; não é um erro a remover agora.

## 4. Matriz dos seis estados

CAN_DEFINE_NOW abaixo significa fechar critério suficiente para emissão no registro atual, não apenas nomear um estado. Os DC indicam agrupamentos de entrada; resolver para EF e instância elegíveis, nunca tratar DC ou EF como voto.

| STATE | CURRENT_REACHABILITY | CAN_DEFINE_NOW | REQUIRED_FAMILIES | BLOCKERS | REQUIRED_RULE_STATUS | MINIMUM_MISSING_EVIDENCE | RECOMMENDED_ACTION |
|---|---|---|---|---|---|---|---|
| LONG_CONTEXT | false no registro; pesquisa declarada true, mas condicional e não implementada | Não para emissão; esqueleto estrutural já descrito | Caminho HT01: DC_DEX_0DTE + regime DC_GEX0_SIGN; HT02/03: DC_MAJORS_0DTE + regime, zero gamma quando requerido, e DC_SPOT_PRICE como referência; HT04: majors e snapshots | DEX sinal/unidade/perspectiva UNMET; majors identidade RTH PARTIAL; hipóteses não validadas; nenhum lado ativo | R_S03/04/12–16 estruturais; R_M01/03/06/08 descritivas; HT01–04 REQUIRES_VALIDATION; dimensões UNKNOWN SEMANTICALLY_BLOCKED | Ao menos um caminho direcional pré-registrado com semântica resolvida, resultado de validação e promoção autorizada; não é necessário resolver todas as 190 unidades | Manter bloqueado; fechar somente o contrato abstrato de elegibilidade, sem inventar polaridade |
| SHORT_CONTEXT | false no registro; pesquisa apenas potencial | Não para emissão; esqueleto já descrito | Mesmas alternativas de LONG, sem assumir que convenção de sinal seja simétrica | Mesmos blockers; ausência de mapeamento documentado para SHORT | Mesmos status e regras de LONG | Evidência para a regra e o sentido SHORT específicos, com promoção autorizada | Manter bloqueado; não traduzir GEX negativo em SHORT |
| NEUTRAL_CONTEXT | false no registro; pesquisa declarada true sem produtor neutro explícito | Não como predicado completo; distinção UNKNOWN/NEUTRAL pode ser fechada agora | Famílias de regras direcionais futuras efetivamente avaliáveis; nenhuma combinação fixa legitimada; referência de preço não é evidência neutra | Ausência de regra ativa; sem resultado explícito NEUTRAL distinguível de NOT_APPLICABLE/UNRESOLVED; composição neutro+lado não definida | R_S15/16 estruturais; um produtor validado de leitura sem inclinação ainda falta; R_M direction=0 não serve | Critério positivo de ausência de inclinação em dados suficientes, domínio/qualidade e resultados da avaliação especificados | Não usar falta de informação, nenhuma regra disparada ou cancelamento de votos como neutralidade |
| CONFLICTED_CONTEXT | false no registro; pesquisa aponta HT06 V_A, não executável hoje | Conceito de conflito pode ser fechado; emissão não | Leituras direcionais de famílias segregadas e semanticamente comparáveis; exemplo potencial DEX vs MAJORS, sem presumir independência; C exige HT06 validada separadamente | Nenhum lado ativo; independência/lineage não demonstrada; IDs EF distintos não bastam; não há redutor explícito de conflito intra/interfamília | R_S03/04/16 estruturais; HT01–04 para lados; HT06 só hipótese; B01–B10 não podem fornecer lado | Leituras opostas elegíveis no mesmo alvo/horizonte/escala, relação de lineage explícita e política para overlap; C requer sua própria política | Preservar divergência descritiva; não promover AMBIGUOUS ou CONTRADICTS de regime automaticamente a conflito direcional |
| NO_TRADE_CONTEXT | false no registro e na pesquisa | Não; somente nome/distinção estão definidos | UNDEFINED; nenhuma família ou combinação autorizada para esse fim | SP_NO_TRADE_CRITERIA UNDEFINED; candidates_registered=0; prioridade também pendente | R_S09/16 proíbem atalhos; nenhum critério substantivo ativo, semântico ou hipótese registrada | Definição conceitual sustentada e critério pré-registrado em dados válidos, incluindo precedência; sem inventá-los nesta auditoria | Manter UNDEFINED; missing/stale/DATA_INVALID não geram esse estado |
| UNKNOWN | true; único estado alcançável | Sim, como fallback conservador nesta V1 | Nenhuma evidência direcional obrigatória; DQ usa DC_SPOT_PRICE e regime GEX0/ZERO_GAMMA; D01/02/06 ajudam qualidade, não votação | Nenhum para preservar o fallback; detalhes de R_S10 requerem aceite/precisão | R_S09, R_S15, R_S16, R_S20 CANONICAL_STRUCTURAL, respeitando origem THIS_DESIGN | Nenhuma polaridade nova necessária; explicitar reason e preservar unresolved_fields | Fechar a conclusão de alcance atual: UNKNOWN por DATA_INVALID ou nenhuma regra ativa avaliável |

## 5. Relações e regras por estado

### LONG / SHORT
STRUCTURALLY_DEFINABLE_NOW: separação de estágios, origem, lineage, não votação, auditabilidade e condição abstrata de concordância. Não equivale a regra direcional ativa.

SUPPORTED_SEMANTIC contribuinte: R_M01/02 regime; R_M03/04 localização/estrutura; R_M05/06 transições; R_M07 apenas evento aritmético com interpretação UNRESOLVED; R_M08 razão DEX; R_M09/10 contexto de regime/participantes TRACE. Nenhuma fornece polaridade.

REQUIRES_VALIDATION: HT01 DEX condicionado ao regime; HT02 reversão em regime positivo; HT03 continuação em regime negativo; HT04 migração de nível. HT05/07 amplitude, HT08 divergência de vencimentos e HT10 SPY não criam um quinto caminho de lado. HT09 só overlay MenthorQ.

SEMANTICALLY_BLOCKED: B01 gregas net vanna/charm; B02 gregas por strike do State; B03 cvr/oflow; B04 priors; B05 zero_mput como suporte; B06 skew/ivol; B07 pressures TRACE; B08 seis exposições VolSignals; B09 gamma VolSignals; B10 C originando lado. HT01 continua HYPOTHESIS_TO_TEST no arquivo, mas seu uso é também BLOCKED_BY_UNKNOWN_SEMANTICS por SP_DEX_SIGN_CONVENTION UNMET. Não alterar seu status automaticamente nesta auditoria.

DIAGNOSTIC_ONLY: D01 metadados, D02 congelados/legados/colunas desconhecidas, D03 cor BUY/SELL, D04 heat trail, D05 OI degenerado, D06 preço de referência e D07 null MenthorQ. Apoiar qualidade/descrição não é emitir lado.

### NEUTRAL
Ausência de evidência não é evidência de neutralidade. No estado atual, até dados válidos e regime perfeitamente descritível resultam UNKNOWN, pois não existe regra direcional elegível. Nada autoriza somar votos LONG/SHORT e chamar o empate de NEUTRAL. Não criar banda arbitrária em torno de zero.

### CONFLICTED
R_S03/04 exigem lineage e proíbem reforço por contagem. EF_DC_GEX0_SIGN e EF_DC_ZERO_GAMMA_0DTE são IDs diferentes, mas cross_group_relations determina uma família de independência. Uma discordância entre suas leituras pertence a R_M01 AMBIGUOUS, não a duas fontes direcionais opostas.

DC_DEX_0DTE tem uma EF consolidada e duas EF SUSPECTED por strike/priors. Estarem separadas preserva a incerteza, não prova independência. O mesmo vale para as 62 EF UNVERIFIED e para GammaGex × TRACE/VolSignals, cuja independência permanece UNKNOWN. Não afirmar que existem 102 evidências independentes.

HT06 V_A confronta uma contradição de contexto C com a sustentação de um lado; é outra política, ainda hipótese. R_S17 vigente conserva B. R_M09 CONTRADICTS em GAMMA_REGIME pode coexistir com jev_directional_context UNKNOWN; isso não é inconsistência.

### NO_TRADE / DATA_INVALID
DATA_INVALID é qualidade, não um sétimo contexto, e gera UNKNOWN com reason específico. UNKNOWN também cobre dado válido não classificável. NO_TRADE_CONTEXT requer dado válido e critério substantivo desfavorável à exposição direcional, não uma decisão operacional.

Nenhum suporte encontrado para candidatos baseados apenas em missing, stale, frozen, RTH, dado incompleto, AMBIGUOUS, conflito, Core oposto, MenthorQ desalinhado ou quantidade de campos. HT05 trata amplitude e não fundamenta NO_TRADE. Manter UNDEFINED e não promover regra de qualidade a decisão de exposição.

## 6. Lacunas estruturais, inconsistências e limites

### G1 — Contrato de leitura e redutor não totalizados (estrutura, latente)
Evidência: máquina /context_decision/ordered_steps, linhas 178–207; output contract /shape/evidence_families/reading = "..."; R_S16.

Há condição abstrata de neutralidade, mas nenhum contrato diferencia resultado neutro, não aplicável, sem dado e semântica irresolvida. Também não está definido o resultado de uma leitura LONG junto de uma leitura neutra; ou regras ativas existentes cujas condições não disparam. O passo "todas as leituras de lado no mesmo sentido" pode ser interpretado sobre conjunto filtrado ou sobre todas as avaliações. Não existe fallback final explícito para casos mistos.

Isso não quebra o registro atual porque S é vazio. Proposta mínima: especificar domínio de resultados e casos exaustivos/disjuntos, incluindo conjunto vazio e mistos; se não houver base decisória, preservar UNKNOWN com reason. Não escolher polaridades nem thresholds. Zero exato de GEX e spot exatamente no nível também não têm tratamento explícito em R_M01/03; igualdade exata não exige inventar uma banda.

### G2 — Famílias distintas não bastam para conflito (estrutura, latente)
Evidência: máquina linha 191; R_S03/04; famílias /cross_group_relations. As proibições globais existem, mas o predicado de transição não explicita a resolução dos grupos relacionados nem como tratar leituras opostas com overlap/lineage UNKNOWN. A nota do passo de concordância cobre "não reforçar" concordância, não o caso oposto.

Proposta mínima: formalizar elegibilidade do par para conflito, separando conflito de qualidade/duplicação, divergência descritiva e conflito direcional. Segregação documental não deve ser promovida a independência. Política pendente => registrar divergência, sem atalho para CONFLICTED.

### G3 — Cobertura por dimensão não demonstra elegibilidade por regra (verificável)
Evidência: /field_coverage em regras; gerador linhas 295–309. side_capable_in_research_arm é calculado pela existência de qualquer regra associada com emits_side, sem avaliar qualidade/precondições.

Exemplos:
- abot.root.orderflow.zero_mput: UNKNOWN_SEMANTICS; B05 e HT02–04 simultâneos; flag de pesquisa true.
- abot.root.classic.max_priors e abot.classic.strikes[].priors[0..4]: B04 coexistindo com HT02–04; flag true.
- Contraprova útil: cor, heat_trail, majors OI degenerados e priors delta do State têm overrides e não ficam side-capable. Portanto não é correto alegar que todo diagnóstico vazou.

Não se prova execução indevida (não há runtime e registro=false). Mas 53 significa associação potencial, não 53 entradas liberadas para pesquisa. Falta precedência explícita de blockers e seleção de membros elegíveis por regra/instância, sobretudo quando um DC inclui membros válidos, diagnósticos e semanticamente bloqueados. Não descartar os campos: preservar análise e restringir apenas o uso não sustentado.

### G4 — Evolução do status direcional e pesquisa só potencial (governança)
R_S15 prevê promover hipóteses; pré-registro §2 define SUPPORTED_SEMANTIC como nunca emitindo lado; guard linha 255 rejeita todo lado ativo. Logo uma simples troca de status de HT01–04 não pode habilitar a máquina V1. A promoção futura exigirá revisão versionada do contrato/guard, além de evidência e aceite, não só um booleano.

states.*.reachable_in_research_arm=true é capacidade pretendida, não prontidão atual: research_arm=NOT IMPLEMENTED; 10/10 hipóteses testable_now=false; neutralidade sem produtor formal; HT06 ainda V_A/V_B. Propor qualificar esses indicadores como condicionais, sem executar pesquisa.

THIS_DESIGN depende de aprovação (§2). R_S10, R_S15 e R_S18 têm essa origem, assim como regras semânticas propostas. Status ativo é seleção nominal do snapshot, não comprovante de aceite. Handoff diz "aguardando revisão/aceite". Não promover proposta a fato já aprovado.

### G5 — R_S10 precisa separar critérios de qualidade e ordem de avaliação
R_S10 decide DATA_INVALID por ausência de preço utilizável ou de qualquer membro GEX0/ZERO_GAMMA com FRESH/MARKET_CLOSED. Não define formalmente "utilizável" nem restringe esse quantificador a membros aptos à leitura de regime. A família contém strike, priors e cor diagnóstica além do net/sum. Freshness sozinha não prova aptidão semântica.

DEGRADED depende de "família com leitura ativa", mas DATA_QUALITY vem antes de seleção/leituras, e R_M01 também marca DEGRADED quando apenas uma leitura é utilizável. É necessário explicitar se existe elegibilidade preliminar e como o diagnóstico local compõe o global, sem leitura circular de etapa futura. "Fora do RTH => MARKET_CLOSED" não deve apagar missing, timestamp inválido ou FROZEN_VALUES; a precedência desses fatos não está totalizada.

Propostas de formalização, não conclusão de FAIL-OPEN em runtime inexistente. Não importar gates de trading.

### I1 — PARTIAL dos majors e colapso declarado
SP_MAJORS_IDENTITY_RTH=PARTIAL, enquanto R_M03.output_effect diz "identidades de majors PARTIAL => DC colapsa". EF_DC_MAJORS_0DTE tem lineage_basis=CONFIRMED; NEXT/FULL BY_CONSTRUCTION. Handoff §6 também descreve orderflow/classic majors como construtos distintos com baixa coincidência, e §8/Feature Contract §6 limitam identidades medidas ao pós-fechamento.

Risco: interpretar o colapso de controle de double counting como identidade semântica plena de todos os membros/instâncias. A auditoria não revoga identidades específicas medidas. Integrador deve delimitar quais relações estão comprovadas e qual o domínio, separando deduplicação conservadora de equivalência semântica; as parciais não podem virar confirmação extra.

### I2 — Documentação anterior superada explicitamente
Feature Contract §2.5 e §5 dizem agrupar SUSPECTED; Decision Logic §4 e handoff §12 substituem isso por separação com overlap_risk. Não é autorização para editar ou reabrir produção: precedência já está documentada. Registrar a divergência para leitores, sem contar suspeitos como independentes.

### I3 — R_M09/10 e R_S14: uso descritivo não é liberação direcional
R_M09 compara apenas sinal TRACE, com SP_TRACE_MM_GAMMA_SIGN MET e PENDING_REVISION_AUDIT => DEGRADED; R_M10 descreve participantes. Unidades UNKNOWN não são resolvidas por isso. Não identifiquei regra ativa emitindo polaridade de trade nem normalização numérica indevida. O uso aceito é estritamente o descritor especificado; não pode herdar status para pressures ou VolSignals.

B08 permitir ENRICHES "só presença" não libera sua semântica no classificador; R_S15 exclui BLOCKED do contexto. Convém explicitar que isso é anotação de disponibilidade, para não contradizer a elegibilidade declarada.

## 7. Respostas A–D e propostas mínimas

A. Fechar agora:
- UNKNOWN como único contexto alcançável no registro V1 e suas duas razões.
- As distinções conceituais dos seis nomes, reconhecendo que defined=true não prova critério suficiente.
- Invariantes de não votação, origem, segregação, qualidade separada da decisão operacional, Core separado e overlay MenthorQ.
- Especificações estruturais faltantes G1/G2/G3/G5 podem ser propostas sem inventar sinal; não estão aprovadas nem alteradas nesta frente.

B. Continuar bloqueados:
LONG_CONTEXT e SHORT_CONTEXT (sem regra ativa e sem validação); NEUTRAL_CONTEXT (sem produtor neutro definido); CONFLICTED_CONTEXT (sem lados ativos e elegibilidade de conflito incompleta); NO_TRADE_CONTEXT (critério UNDEFINED). Manter B01–B10 nos respectivos bloqueios, HT01–HT10 em hipótese e D01–D07 diagnósticos.

C. Regras estruturais ausentes/incompletas:
Contrato de leitura elegível e redução total; resolução de equivalência/overlap para conflitos; precedência blocker→regra/instância; condições de neutralidade positiva; composição DQ local/global; protocolo versionado para futura promoção. Não propor pesos, votos ou limiares.

D. Além da evidência:
Não há lado ativo indevido demonstrado. São excessivos se lidos literalmente: "pesquisa alcançável agora", "53 campos aptos", colapso de majors PARTIAL como identidade plena e afirmação de inexistência de qualquer lacuna estrutural. Corrigir a precisão documental no futuro mediante autorização, sem remover os bloqueios atuais.

## 8. Não resolvível hoje e instrução exata ao Claude integrador

Não resolvível nesta frente: polaridade/unidade/perspectiva DEX e gregas; semântica cvr/oflow, priors e zero_mput; vínculo TRACE pressures; unidades/sinal VolSignals; validação de HT01–HT10; independência não medida; alinhamento MenthorQ; critérios NO_TRADE; fusão/precedência Core×Jev. Não transformar 20–40 pregões em gate: é alvo não bloqueante, e coleta continua não autorizada.

Instrução ao integrador:
1. Leia este handoff como auditoria, não como patch aprovado. Preserve os canônicos e a alcançabilidade UNKNOWN-only.
2. Apresente G1–G5 e I1–I3 para revisão de design; obtenha decisão sobre propostas THIS_DESIGN e sobre o contrato de leitura/eligibilidade.
3. Se e somente se uma futura ordem autorizar mudanças, faça ajuste versionado mínimo, preservando 190/190 campos, proibições de voto e semânticas UNKNOWN; não execute geradores sob a autorização atual.
4. Mantenha NO_TRADE_CONTEXT_CRITERIA=UNDEFINED e candidates_registered=0. Não converta DATA_INVALID/missing/stale em NO_TRADE, UNKNOWN em NEUTRAL ou regime contraditório em lado.
5. Não ative hipóteses nem remova o guard V1 para obter estados por conveniência. Promoção futura exige evidência, contrato compatível e aceite.
6. Próximo passo exato: revisão documental dos predicados de elegibilidade e da redução UNKNOWN/NEUTRAL/CONFLICTED, sem coleta, runtime, F5, commits ou mudanças de produção.

## 9. Integridade e arquivos auditados

Única escrita autorizada desta frente: este handoff. Nenhum comando de geração, teste de mercado, coleta, implementação, commit/push ou F5 foi executado. Scripts em memória apenas leram documentos/JSON e verificaram referências.

O repositório já possuía não rastreados START_JEV_CLAUDE.ps1, config/, scripts/ e context/jev-future/JEV_KIMI_PROVIDER_20260924.md. handoffs/ apareceu durante a auditoria antes de nossa primeira escrita; não atribuir seus outros arquivos a esta frente. Nenhum desses conteúdos foi alterado.

SHA-256 dos 14 arquivos auditados, calculados antes da única escrita para conferência posterior:

| Arquivo relativo ao repositório | SHA-256 |
|---|---|
| `CLAUDE.md` | `9fdcf179de6116767aa0dc21c66bfef622ebabe8b61567136b9d3b47062d3595` |
| `context/jev-future/HANDOFF_JEV_FUTURE_20260923.md` | `5fab1775a57de4e87e2966a95065d771dcd381eff3b66b64d7eb77e27b46e00d` |
| `context/jev-future/JEV_DEALER_CONTEXT_CONTRACT_20260923.md` | `973a8aa0d7dcbab0ed6fdd9012aa69c11208db1d0c34d035f9ed53be01c59871` |
| `context/jev-future/JEV_FEATURE_CONTRACT_V1_20260923.md` | `6b46fc47b643cd3a3b84d089a72e96f92f063efad485c2c273193b105ac12dfd` |
| `context/jev-future/JEV_DECISION_LOGIC_V1_20260923.md` | `1e563a63ec6a3447ccc9e345c66cd569e9e8edb63cd072e593a8d8238254113b` |
| `context/jev-future/JEV_PREREGISTRATION_DESIGN_V1_20260923.md` | `d1a1b7e9569f50696d7e9964cf372895b7517dc74c61689f54c64e784952d11c` |
| `context/jev-future/data/jev-preregistered-rules-v1.json` | `beb7d1c777c3217e4127c1ce14efe6052810bf3efbefa0a78a03dc227bd48662` |
| `context/jev-future/data/jev-classification-state-machine-v1.json` | `66166efae44d66274aa57f5af6bda5171771e48a5e0c947421e668c0a2abd209` |
| `context/jev-future/data/jev-hypotheses-register-v1.json` | `d3582047fb9a2dbde61beba7a297153af2f7fab4d6844f7c9ce1a5797fc3ee4e` |
| `context/jev-future/data/jev-provisional-mappings-v1.json` | `d34435f03eaf39186c9f2fbadd15b7af3561f1052169a0eb8dcb37aeb681d629` |
| `context/jev-future/data/jev-analysis-routes-v1.json` | `e432aaf0a203834a05f034e622ab0ab0079837b9b82e6ebc593d99909c47d413` |
| `context/jev-future/data/jev-evidence-families-v1.json` | `3e5bac6f7e63b7f4efdc06f7703a37c56200c549549ce564cbb40d4ffd9ea9cf` |
| `context/jev-future/data/jev-output-contract-v1.json` | `84a12cf954c0430b4d3a5b106a56870942c344c551a605664180229965b1a2d8` |
| `context/jev-future/scripts/build-jev-preregistration-design-v1.js` | `9c0134b2723e61eaf1e71bcd0b39dd4e77fed765dc28e22df0c8c4cd11ac438b` |

FRONT B: COMPLETE
STATE MACHINE: STRUCTURAL_GAPS_FOUND
STATES DEFINABLE NOW: UNKNOWN (emissão V1); demais apenas definições conceituais/estruturais parciais
STATES BLOCKED: LONG_CONTEXT, SHORT_CONTEXT, NEUTRAL_CONTEXT, CONFLICTED_CONTEXT, NO_TRADE_CONTEXT
NO_TRADE_CONTEXT: UNDEFINED; 0 candidatos sustentados
CANONICAL FILES CHANGED: NO
IMPLEMENTATION: NONE
DATA COLLECTION: NONE
PRODUCTION: UNCHANGED
F5: NOT PERFORMED
