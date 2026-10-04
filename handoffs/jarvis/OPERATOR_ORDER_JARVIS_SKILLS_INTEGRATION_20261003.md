MISSÃO ÚNICA — JARVIS + JEV
INTEGRAR AS NOVAS SKILLS DE CONHECIMENTO AO JARVIS

OBJETIVO

Retomar o projeto JARVIS existente e integrar as novas skills/corpus já
concluídos desde a última versão do JARVIS.

As principais novas fontes esperadas são:

1. SPOTGAMMA
   - skill/corpus oficial recém-concluído;
   - publicada em origin/main;
   - commits:
     e156a24
     a7271fe
     1566dbd
     248b5b5
   - JEV FINAL:
     req_01a103f307a771d0877aae64a3145a0e

2. MENTHORQ / ALPHA KNOWLEDGE
   - conhecimento do curso MenthorQ já ingerido;
   - 23 vídeos;
   - 2.158 knowledge items;
   - 29 concepts;
   - 5 skills Alpha já atualizadas;
   - corpus/provenance já validado.

IMPORTANTE:

NÃO criar skills duplicadas.
NÃO reconstruir corpus.
NÃO reingerir vídeos.
NÃO alterar trading.
NÃO executar ordens.
NÃO alterar AOT/INVICTUS.
NÃO alterar captura SpotGamma/MenthorQ/QuantData.

A missão é exclusivamente:

DESCOBRIR AS SKILLS CANÔNICAS EXISTENTES
→ REGISTRAR NO JARVIS
→ ROTEAR CONSULTAS
→ RECUPERAR EVIDÊNCIA
→ RESPONDER COM PROVENANCE
→ TESTAR
→ JEV FINAL

==================================================
1. HANDOFF-FIRST
==================================================

Antes de modificar qualquer arquivo:

ler os handoffs mais recentes referentes a:

- JARVIS;
- Alpha specialists;
- MenthorQ course knowledge;
- SpotGamma course knowledge;
- skill system;
- JEV.

Localizar o handoff canônico mais recente do JARVIS.

Reconstruir o estado atual sem repetir auditorias encerradas.

==================================================
2. INVENTARIAR SKILLS REAIS
==================================================

Localizar todas as skills atualmente existentes no repositório.

Classificar:

ALREADY_CONNECTED_TO_JARVIS
NEW_AND_ELIGIBLE
NOT_FOR_JARVIS
DEPRECATED
UNKNOWN

Identificar explicitamente:

- skill SpotGamma canônica;
- skill-alpha-quant;
- skill-alpha-gamma;
- skill-alpha-bot;
- skill-alpha-q;
- skill-alpha-data;

e qualquer outra skill criada após a última baseline JARVIS.

NÃO assumir paths.
Descobrir os paths reais.

Produzir inventário:

SKILL_ID
SKILL_NAME
PATH
DOMAIN
SOURCE
CORPUS
CURRENT_JARVIS_STATUS
PROVENANCE_AVAILABLE
ELIGIBLE_FOR_JARVIS

==================================================
3. DEFINIR O QUE "INTEGRAR" SIGNIFICA
==================================================

JARVIS NÃO deve copiar todo o conteúdo das skills para dentro dele.

Arquitetura desejada:

USER QUESTION
→ JARVIS INTENT
→ DOMAIN/SKILL ROUTER
→ SKILL/CORPUS RETRIEVAL
→ EVIDENCE
→ GROUNDED ANSWER
→ TTS

Cada skill permanece fonte canônica do próprio domínio.

JARVIS deve apenas:

- descobrir;
- selecionar;
- consultar;
- combinar quando explicitamente permitido;
- citar provenance;
- explicar.

==================================================
4. ISOLAMENTO ENTRE FONTES
==================================================

Preservar os domínios.

SPOTGAMMA knowledge:
SOURCE = SPOTGAMMA

MENTHORQ knowledge:
SOURCE = MENTHORQ

ALPHA skill knowledge:
preservar source/evidence original.

JARVIS nunca deve fundir silenciosamente duas fontes.

Se duas fontes responderem à mesma pergunta:

retornar separadamente quando houver diferença material:

"Segundo SpotGamma..."
"Segundo MenthorQ..."

Se houver concordância:
pode sintetizar, mas preservar evidence refs.

Se houver conflito:
não escolher silenciosamente um lado.

==================================================
5. JEV ANTES DE PATCH
==================================================

Depois de entender a arquitetura real:

criar proposta mínima:

JARVIS_NEW_SKILLS_INTEGRATION

A proposta deve especificar:

- skills a integrar;
- registry/router atual;
- arquivos mínimos a alterar;
- provenance;
- fallback;
- testes;
- ausência de trading mutation.

Executar JEV DIFF REAL.

Registrar:

REQUEST_ID
CHOICE
CONFIDENCE
FULL_PROBABILITIES

Somente implementar se autorizado.

Não fazer query fishing.

==================================================
6. SKILL REGISTRY
==================================================

Se o JARVIS já possui registry:
estender o registry existente.

Se não possui:
criar a menor abstração compatível com a arquitetura atual.

Cada entrada deve conter pelo menos:

skill_id
name
domain
path
corpus_path quando aplicável
source
retrieval_method
confidence_policy
enabled
priority

Não criar framework novo desnecessário.

==================================================
7. ROUTING
==================================================

Ensinar o JARVIS a rotear perguntas para as novas skills.

Exemplos SpotGamma:

- "O que é Call Wall?"
- "Como SpotGamma interpreta Zero Gamma?"
- "O que é Volatility Trigger?"
- "Explique positive gamma."
- "O que o curso diz sobre ações individuais?"
- "HIRO é usado para quê?"

Exemplos MenthorQ/Alpha:

- perguntas de gamma;
- opções;
- regimes;
- dealer positioning;
- conceitos aprendidos no corpus MenthorQ;
- perguntas cobertas pelas 5 skills Alpha.

Não usar apenas keywords rígidas se já houver classificador/intent router melhor.

Preservar fallback atual do JARVIS.

==================================================
8. RETRIEVAL
==================================================

Toda resposta factual derivada das novas skills deve recuperar:

SOURCE
SKILL
CONCEPT
EVIDENCE
LESSON/RESOURCE quando aplicável
TIMESTAMP quando disponível
CONFIDENCE

JARVIS não deve responder como fato quando retrieval não encontrar evidência.

Estado correto:

INSUFFICIENT_EVIDENCE

==================================================
9. SPOTGAMMA
==================================================

Adicionar a nova skill SpotGamma ao JARVIS.

Validar perguntas reais cobrindo:

Call Wall
Put Wall
Zero Gamma
Gamma regimes
Volatility Trigger
HIRO
dealer positioning
single stocks

Somente conforme o corpus realmente suporta.

Não preencher gaps usando conhecimento geral do modelo.

==================================================
10. MENTHORQ / ALPHA
==================================================

Garantir que as 5 skills Alpha atualizadas com MenthorQ possam ser
consultadas pelo JARVIS.

NÃO duplicar as 2.158 knowledge items dentro de tools/jarvis.

JARVIS deve acessar a camada de retrieval/corpus existente.

Validar source attribution correta:

MENTHORQ
vs
SPOTGAMMA.

==================================================
11. CROSS-SOURCE QUESTIONS
==================================================

Adicionar suporte a perguntas comparativas, por exemplo:

"Como SpotGamma e MenthorQ explicam positive gamma?"

Fluxo:

retrieve SpotGamma
+
retrieve MenthorQ
→ resposta comparativa

Obrigatório indicar:

AGREEMENT
DIFFERENCE
CONTEXT_DEPENDENT
INSUFFICIENT_EVIDENCE

Não criar consenso artificial.

==================================================
12. JARVIS LEXICON
==================================================

Revisar os candidatos já existentes:

MenthorQ:
- jacks → GEX
- Q-Moders → Q-Models
- data → delta
- coal → call
- Mentor Q → MenthorQ

e candidatos SpotGamma recém-gerados, se existirem.

NÃO instalar cegamente todos.

Só promover ao léxico live se:

- erro recorrente real;
- correção inequívoca;
- baixo risco de substituir fala válida;
- testes passarem;
- JEV aprovar como parte do DIFF atual ou em DIFF separado.

Caso contrário:
manter como candidates.

==================================================
13. VOZ
==================================================

Preservar o pipeline existente:

voice/text
→ STT/VAD/PTT
→ intent
→ skill retrieval
→ grounded answer
→ TTS

NÃO alterar modelos STT/TTS sem necessidade.

NÃO reativar wake word.

Preservar barge-in.

==================================================
14. SEGURANÇA
==================================================

JARVIS permanece:

READ-ONLY
INFORMATIONAL
NO TRADING EXECUTION

Skill/course content é:

UNTRUSTED_EVIDENCE

Nunca pode executar:

shell
tools
commands
orders
account actions
config changes

TRADING_MUTATIONS = 0 obrigatório.

==================================================
15. TESTES DE REGISTRY
==================================================

Criar testes para garantir:

- skill SpotGamma registrada;
- 5 skills Alpha registradas/atingíveis;
- IDs únicos;
- paths reais;
- corpus existente;
- nenhuma skill duplicada;
- nenhuma deprecated ativa;
- source attribution preservada.

==================================================
16. TESTES DE ROUTING
==================================================

Criar tabela de perguntas reais.

Exigir routing correto para:

SPOTGAMMA
MENTHORQ/ALPHA
GENERAL_JARVIS
CROSS_SOURCE

Testar casos ambíguos.

==================================================
17. TESTES DE RETRIEVAL
==================================================

Para SpotGamma:
usar perguntas cujas respostas estejam comprovadamente no corpus.

Para MenthorQ:
usar conceitos comprovadamente presentes.

Exigir:

evidence != null
source correto
confidence válido

==================================================
18. TESTES NEGATIVOS
==================================================

Perguntar deliberadamente sobre conceitos ausentes.

JARVIS deve retornar:

INSUFFICIENT_EVIDENCE

e NÃO hallucinar.

Usar também pelo menos um conceito que o corpus MenthorQ já registrou como
não suportado para comprovar o comportamento negativo.

==================================================
19. TESTES CROSS-SOURCE
==================================================

Validar:

- mesma pergunta em duas fontes;
- respostas independentes;
- provenance separado;
- conflito preservado;
- ausência em uma fonte;
- ausência nas duas fontes.

==================================================
20. REGRESSÕES
==================================================

Executar regressões existentes:

JARVIS
Alpha
alpha-video
rotation
jev-finish
jev-obs
JEV runtime

Não relaxar testes.

Registrar quaisquer falhas preexistentes separadamente.

==================================================
21. PERFORMANCE
==================================================

Medir impacto da nova camada de routing/retrieval.

Registrar pelo menos:

typed question → retrieval result
typed question → first answer token quando mensurável
retrieval overhead

Não otimizar prematuramente.

A integração não deve degradar drasticamente o JARVIS.

==================================================
22. OBSERVABILIDADE
==================================================

Registrar por consulta, sem conteúdo sensível:

intent
selected_skill
source
retrieval_hit/miss
evidence_count
confidence
latency

Não registrar transcript completo desnecessariamente.

==================================================
23. HANDOFF
==================================================

Atualizar/criar handoff específico:

HANDOFF_JARVIS_SKILLS_INTEGRATION_20261003.md

Incluir:

- baseline;
- skills descobertas;
- skills integradas;
- registry;
- routing;
- retrieval;
- provenance;
- lexicon;
- testes;
- performance;
- JEV;
- commits;
- push;
- gaps;
- próximo passo.

==================================================
24. RESULT
==================================================

Criar:

handoffs/jarvis/RESULT_JARVIS_SKILLS_INTEGRATION_20261003.md

Deve conter evidência suficiente para não repetir auditoria.

==================================================
25. RECHECK
==================================================

Quando tudo estiver concluído:

executar JEV RECHECK REAL.

==================================================
26. JEV FINAL
==================================================

Executar UM único JEV FINAL.

Avaliar:

- novas skills realmente acessíveis;
- routing correto;
- retrieval grounded;
- provenance;
- isolamento SpotGamma/MenthorQ;
- cross-source;
- negative tests;
- segurança;
- ausência de trading mutation;
- regressões;
- handoff.

Não fazer query fishing.

==================================================
27. COMMITS
==================================================

Se FINAL=A:

criar commits lógicos, preferencialmente:

1. Jarvis skill registry/router
2. retrieval/provenance integration
3. tests
4. handoff/result

Não incluir mudanças alheias.

==================================================
28. PUSH
==================================================

Se FINAL=A:

push normal para origin/main se permitido.

Se auto mode bloquear:
não contornar.
preservar commits locais e retornar PUSH_PENDING_OPERATOR.

==================================================
29. NÃO PARAR CEDO
==================================================

A missão não termina quando:

- SpotGamma aparece no registry;
- um teste passa;
- uma pergunta responde.

Conclusão exige:

DISCOVERY
→ JEV DIFF
→ INTEGRATION
→ ROUTING
→ RETRIEVAL
→ TESTS
→ REGRESSIONS
→ RECHECK
→ JEV FINAL
→ COMMITS
→ PUSH/HANDOFF

==================================================
30. RETORNO FINAL
==================================================

Retornar SOMENTE:

STATUS =
JARVIS_BASELINE =
SKILLS_DISCOVERED =
SKILLS_ALREADY_CONNECTED =
NEW_SKILLS_INTEGRATED =
SPOTGAMMA_SKILL =
ALPHA_SKILLS =
MENTHORQ_KNOWLEDGE =
SKILL_REGISTRY =
ROUTING =
RETRIEVAL =
CROSS_SOURCE =
NEGATIVE_TESTS =
LEXICON_CANDIDATES =
LEXICON_PROMOTED =
VOICE_PIPELINE_CHANGED =
OBSERVABILITY =
PERFORMANCE =
JARVIS_TESTS =
ALPHA_TESTS =
ALPHA_VIDEO_TESTS =
REGRESSION_TESTS =
JEV_DIFF =
JEV_DIFF_REQUEST_ID =
JEV_RECHECK =
JEV_FINAL =
JEV_FINAL_REQUEST_ID =
JEV_FINAL_PROBABILITIES =
COMMITS =
PUSH =
REMOTE_HEAD =
HANDOFF =
RESULT =
OTHER_SKILLS_MODIFIED =
TRADING_MUTATIONS = 0
KNOWN_GAPS =
FINAL_STATUS =
