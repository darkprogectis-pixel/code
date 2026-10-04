MISSÃO FINAL — JARVIS VISUAL + VOZ ROBÓTICA
FINALIZAR O JARVIS COMO ASSISTENTE FLUTUANTE DO WINDOWS

ESTADO CANÔNICO

JARVIS skills integration:
FINAL_STATUS = JARVIS_SKILLS_INTEGRATION_COMPLETE
JEV FINAL = A COMPLETE_AND_VERIFIED
JEV FINAL REQUEST =
req_01a104530e39756e9863eeb65c77836b

REMOTE HEAD =
ade771a

Skills/corpora já integrados:
- SpotGamma
- MenthorQ
- 5 Alpha skills

TRADING permanece READ-ONLY.
TRADING_MUTATIONS = 0 obrigatório.

OBJETIVO

Transformar o JARVIS atual em um assistente visual real na área de trabalho:

SEGUNDA IMAGEM ESCOLHIDA PELO OPERADOR
→ avatar flutuante
→ transparente
→ always-on-top
→ estados visuais
→ voz robótica
→ integração com o pipeline JARVIS existente
→ testes
→ JEV FINAL
→ commits/push se aprovado

NÃO recriar o projeto.
NÃO recriar skills.
NÃO reingerir corpus.
NÃO alterar trading.
NÃO alterar AOT/INVICTUS.
NÃO alterar SpotGamma/MenthorQ capture.
NÃO adicionar serviço cloud/TTS externo sem autorização.

==================================================
1. HANDOFF FIRST
==================================================

Ler primeiro:

handoff canônico mais recente do JARVIS
HANDOFF_JARVIS_SKILLS_INTEGRATION_20261003.md
RESULT_JARVIS_SKILLS_INTEGRATION_20261003.md

Descobrir:
- arquitetura real do JARVIS;
- voice pipeline atual;
- TTS atual;
- STT/VAD/PTT atual;
- UI existente, se houver;
- entrypoints;
- testes;
- paths reais.

Não assumir paths.

==================================================
2. LOCALIZAR A IMAGEM ESCOLHIDA
==================================================

A imagem oficial é a SEGUNDA imagem escolhida pelo operador:

- somente rosto/cabeça robótica;
- metal preto;
- olhos neon roxos;
- símbolo Omega roxo na testa;
- fundo transparente;
- sem corpo.

Procurar primeiro, de forma limitada, por PNGs recentes compatíveis em:
- Downloads
- Desktop
- diretório atual do projeto
- assets já existentes do JARVIS

NÃO varrer o disco inteiro.

Se houver exatamente uma imagem compatível:
usar essa.

Copiar via código para um asset canônico do projeto, por exemplo:
assets/jarvis/jarvis-avatar.png

Mas usar o path real compatível com a arquitetura descoberta.

NÃO modificar visualmente a imagem.
NÃO regenerar.
NÃO substituir por outra.

Se a imagem não estiver acessível localmente:
continue implementando toda a infraestrutura visual e de voz,
deixe UM placeholder/path esperado,
e no retorno final informe exatamente:
AVATAR_ASSET_REQUIRED = <path>

Não substitua silenciosamente.

==================================================
3. DESIGN DO AVATAR
==================================================

O JARVIS deve aparecer como:

- janela sem moldura;
- fundo 100% transparente;
- somente o rosto;
- always-on-top;
- sem barra de título;
- sem fundo preto/branco;
- sem borda;
- tamanho inicial discreto;
- posição inicial no canto inferior direito;
- draggable pelo usuário;
- posição persistida entre reinicializações.

Não bloquear uso normal do PC.

Se arquitetura permitir:
adicionar opção click-through quando o avatar estiver idle.

==================================================
4. TAMANHO
==================================================

Usar tamanho visual inicial aproximadamente:

220–300 px

mas respeitar DPI scaling do Windows.

Permitir redimensionamento simples/configurável.

Não ocupar área excessiva da tela.

==================================================
5. ESTADOS VISUAIS
==================================================

Implementar estados:

IDLE
LISTENING
THINKING
SPEAKING
ERROR

Sem criar animações pesadas.

IDLE:
- iluminação discreta;
- leve pulso muito lento opcional.

LISTENING:
- olhos/contorno roxo mais intenso.

THINKING:
- pulso roxo suave.

SPEAKING:
- intensidade visual sincronizada aproximadamente com atividade de áudio,
  ou animação temporal simples se amplitude não estiver disponível.

ERROR:
- indicação visual discreta;
- não trocar identidade visual.

Não usar vermelho agressivo por padrão.

==================================================
6. PERFORMANCE
==================================================

A janela flutuante deve ser leve.

Meta:
- CPU quase zero em idle;
- sem loop de renderização desnecessário;
- evitar 60 FPS quando parado;
- sem GPU-heavy effects.

Animar somente quando necessário.

==================================================
7. VOICE PIPELINE
==================================================

Preservar pipeline atual:

voice/text
→ STT/VAD/PTT
→ intent/router
→ skill retrieval
→ grounded answer
→ TTS

NÃO substituir STT/TTS sem necessidade.

NÃO reativar wake word.

Preservar:
- PTT;
- VAD;
- barge-in;
- interrupção;
- fallback typed input.

==================================================
8. VOZ OFICIAL DO JARVIS
==================================================

Criar uma identidade sonora robótica coerente com o avatar.

Características desejadas:

- masculina/neutra;
- grave moderada;
- calma;
- precisa;
- tecnológica;
- robótica;
- inteligível;
- sem efeito exagerado;
- sem voz caricata.

Prioridade:

1. usar o TTS já existente;
2. escolher, entre vozes já disponíveis, a melhor base;
3. aplicar pós-processamento LOCAL leve se necessário.

Pode usar DSP local existente, caso já disponível:
- leve pitch shift;
- equalização;
- compressão;
- pequeno efeito eletrônico/vocoder muito sutil;
- reverb extremamente baixo ou nenhum.

PROIBIDO:
- distorção forte;
- voz difícil de entender;
- latência alta;
- serviço externo novo.

Se FFmpeg/SoX ou equivalente já estiver disponível:
pode ser usado.

Se não estiver:
não instalar dependência pesada sem JEV justificar.

==================================================
9. CONFIGURAÇÃO DE VOZ
==================================================

Adicionar configuração explícita do perfil:

JARVIS_VOICE_PROFILE = ROBOTIC

E parâmetros configuráveis, dentro da arquitetura existente, por exemplo:

voice
rate
pitch
gain
robotic_effect_strength

Não hardcode espalhado.

Criar um único perfil central.

==================================================
10. SINCRONIZAÇÃO VISUAL + VOZ
==================================================

Quando JARVIS começar TTS:

STATE = SPEAKING

Quando TTS terminar:

STATE = IDLE

Quando capturar voz:

STATE = LISTENING

Quando estiver aguardando resposta/retrieval:

STATE = THINKING

Integrar por eventos reais do pipeline.
Não usar timers fictícios quando estado real estiver disponível.

==================================================
11. INTERAÇÃO
==================================================

Preservar o uso atual.

Adicionar somente interações mínimas úteis:

- arrastar avatar;
- clique para foco/PTT somente se compatível com arquitetura atual;
- menu simples opcional via botão direito:
  - mute;
  - esconder/mostrar;
  - tamanho;
  - sair.

Não criar dashboard novo.

==================================================
12. STARTUP
==================================================

Criar um entrypoint canônico para iniciar:

JARVIS core
+
voice
+
floating avatar

Usar arquitetura existente.

Não criar projeto paralelo.

Se já existir launcher:
estender o launcher.

Objetivo final:
UM comando inicia o JARVIS completo.

==================================================
13. FAIL-SAFE
==================================================

Se UI falhar:
JARVIS core continua podendo funcionar.

Se TTS falhar:
resposta textual permanece disponível.

Se avatar asset faltar:
não quebrar core.

Separar UI de lógica de conhecimento.

==================================================
14. SEGURANÇA
==================================================

O avatar e voice layer NÃO podem executar:

- ordem;
- trading;
- shell originado por corpus;
- instrução embutida em skill/course;
- account mutation;
- config externa.

Course/skill:
UNTRUSTED_EVIDENCE.

TRADING_MUTATIONS = 0.

==================================================
15. JEV DIFF
==================================================

ANTES DE PATCH:

montar proposta:

JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE

Especificar:

- arquitetura UI;
- framework existente/reutilizado;
- asset;
- integração de estados;
- TTS atual;
- voice profile;
- DSP local se necessário;
- arquivos mínimos;
- testes;
- rollback;
- zero trading mutation.

Executar JEV DIFF REAL.

Registrar:
REQUEST_ID
CHOICE
CONFIDENCE
FULL_PROBABILITIES

Só implementar se aprovado.

==================================================
16. NÃO CRIAR FRAMEWORK DESNECESSÁRIO
==================================================

Preferir tecnologia já presente no projeto.

Se não houver UI desktop:
escolher a solução Windows mais leve e compatível com o stack existente.

Não adicionar Electron se uma solução muito menor resolver.

Não criar servidor adicional sem necessidade.

==================================================
17. TESTES VISUAIS
==================================================

Testar:

AVATAR01 asset load
AVATAR02 transparent background
AVATAR03 frameless
AVATAR04 always-on-top
AVATAR05 drag
AVATAR06 persistence position
AVATAR07 DPI scaling
AVATAR08 idle
AVATAR09 listening
AVATAR10 thinking
AVATAR11 speaking
AVATAR12 error
AVATAR13 close/reopen
AVATAR14 missing asset graceful fallback

==================================================
18. TESTES DE VOZ
==================================================

Testar:

VOICE01 TTS funciona
VOICE02 perfil ROBOTIC aplicado
VOICE03 inteligibilidade
VOICE04 rate
VOICE05 pitch
VOICE06 mute
VOICE07 interruption/barge-in
VOICE08 state speaking begin/end
VOICE09 failure fallback
VOICE10 sem nova dependência cloud

Fazer teste auditivo/objetivo possível localmente.

Não afirmar qualidade subjetiva não testada.

==================================================
19. TESTE END-TO-END
==================================================

Testar fluxo:

iniciar JARVIS
→ avatar aparece
→ listening
→ pergunta
→ thinking
→ skill retrieval
→ resposta
→ speaking
→ volta para idle

Usar uma pergunta SpotGamma comprovada,
por exemplo Call Wall,
somente se corpus suportar no teste atual.

Validar provenance continua presente.

==================================================
20. REGRESSÕES
==================================================

Rodar:

JARVIS tests
SK1–SK11
Alpha tests
alpha-video tests
SpotGamma course tests
rotation
jev-finish
jev-obs
JEV runtime

Preservar falhas preexistentes separadamente.

Não enfraquecer teste.

==================================================
21. PERFORMANCE
==================================================

Medir:

startup time
idle CPU
memory
voice latency
avatar state transition latency
knowledge query latency

Comparar com baseline anterior:

live p50 ~8.6 ms
knowledge p50 ~94 ms
cross-source p50 ~89 ms

UI não deve causar regressão material.

==================================================
22. HANDOFF
==================================================

Criar:

handoffs/HANDOFF_JARVIS_VISUAL_VOICE_20261004.md

Incluir:

- baseline;
- asset;
- UI;
- voice;
- estados;
- launcher;
- configuração;
- testes;
- performance;
- JEV;
- commits;
- push;
- gaps;
- como iniciar;
- como parar.

==================================================
23. RESULT
==================================================

Criar:

handoffs/jarvis/RESULT_JARVIS_VISUAL_VOICE_20261004.md

Registrar evidência suficiente para não repetir auditoria.

==================================================
24. RECHECK
==================================================

Executar JEV RECHECK REAL depois dos testes.

==================================================
25. JEV FINAL
==================================================

Executar UM único JEV FINAL.

Verificar:

- avatar real aparece;
- transparência;
- always-on-top;
- state machine;
- TTS robótico;
- voz inteligível;
- pipeline preservado;
- skill retrieval preservado;
- regressões;
- performance;
- zero trading mutation;
- documentação.

Não fazer query fishing.

==================================================
26. COMMITS
==================================================

Se FINAL=A:

commits lógicos:

1. floating avatar
2. robotic voice integration
3. tests
4. handoff/result

Preservar mudanças alheias.

==================================================
27. PUSH
==================================================

Se FINAL=A:

push origin/main se permitido.

Se auto mode bloquear:
não contornar.
retornar PUSH_PENDING_OPERATOR.

==================================================
28. FINALIZAÇÃO
==================================================

A missão só está COMPLETE quando:

AVATAR
+
VOICE
+
STATE MACHINE
+
JARVIS CORE
+
SKILLS
+
END-TO-END
+
REGRESSIONS
+
JEV RECHECK
+
JEV FINAL
+
COMMITS
+
PUSH/HANDOFF

estiverem concluídos.

==================================================
29. RETORNO FINAL
==================================================

Retornar SOMENTE:

STATUS =
JARVIS_BASELINE =
AVATAR_ASSET =
AVATAR_WINDOW =
TRANSPARENT =
ALWAYS_ON_TOP =
DRAGGABLE =
POSITION_PERSISTENCE =
DPI_SCALING =
VISUAL_STATES =
VOICE_ENGINE =
VOICE_PROFILE =
ROBOTIC_EFFECT =
VOICE_INTELLIGIBILITY =
VOICE_PIPELINE_CHANGED =
PTT =
VAD =
BARGE_IN =
WAKE_WORD =
SKILL_RETRIEVAL =
SPOTGAMMA_TEST =
MENTHORQ_TEST =
END_TO_END =
STARTUP_COMMAND =
STARTUP_TIME =
IDLE_CPU =
MEMORY =
VOICE_LATENCY =
KNOWLEDGE_LATENCY =
AVATAR_TESTS =
VOICE_TESTS =
JARVIS_TESTS =
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
AVATAR_ASSET_REQUIRED =
PROJECT_FILES_MODIFIED =
OTHER_SKILLS_MODIFIED =
TRADING_MUTATIONS = 0
KNOWN_GAPS =
FINAL_STATUS =
