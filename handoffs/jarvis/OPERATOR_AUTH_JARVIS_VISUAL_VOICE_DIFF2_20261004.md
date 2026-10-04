AUTORIZAÇÃO DO OPERADOR — REVISAR A PROPOSTA E EXECUTAR UM NOVO JEV DIFF.
(verbatim, recebida na sessão 95e94057, 2026-10-04)

Continuar a missão:
JARVIS_FLOATING_AVATAR_AND_ROBOTIC_VOICE

NÃO repetir o DIFF anterior.
NÃO reutilizar a proposta anterior sem mudanças materiais.
NÃO implementar nada antes do novo DIFF resultar A.

Estado preservado:
- baseline = ade771a
- avatar encontrado:
  Downloads\Avatar Android com Olhos Neon Roxos.png
  PNG 1254x1254 com alpha
- voice atual = sherpa-onnx + piper-faber
- PTT/VAD/barge-in existentes
- wake word disabled
- trading mutations = 0
- DIFF anterior:
  F INCOMPLETE_PROPOSAL
  req_01a104ab67f17e6887d4eaa726b0b3c4

Crie uma PROPOSTA REVISADA materialmente diferente cobrindo explicitamente
os três pontos apontados pelo JEV: F, E e G.

==================================================
1. F — PROPOSTA TÉCNICA COMPLETA
==================================================

Documentar exatamente:

A) AVATAR WINDOW
- tecnologia escolhida e justificativa;
- processo responsável;
- lifecycle;
- como inicia/encerra;
- window flags/ex-styles;
- frameless;
- transparent;
- always-on-top;
- drag;
- persistence;
- DPI awareness;
- click-through idle, se usado;
- tratamento de crash;
- caminho canônico do asset.

Se WPF/PowerShell 5.1 continuar sendo a solução:
documentar os elementos/classes/flags realmente usados.
Não deixar “implementar depois”.

B) CONTRATO UI/CORE
Definir contrato completo de comunicação:
- transport;
- endpoint/event name;
- direção;
- payload JSON exato;
- allowed enum values;
- validation;
- timeout/reconnect;
- comportamento se UI estiver offline.

Estados permitidos somente:
IDLE
LISTENING
THINKING
SPEAKING
ERROR

Se usar POST /api/ui-state:
documentar schema exato e provar que ele somente altera estado visual.

Se usar SSE:
documentar:
- endpoint;
- event names;
- payload;
- reconnect;
- heartbeat;
- clientes;
- ausência de comandos reversos para trading.

C) VOZ / DSP
Documentar parâmetros reais do perfil ROBOTIC:

- base voice = piper-faber existente;
- rate;
- pitch;
- gain;
- EQ;
- compression;
- robotic effect strength;
- qualquer filtro usado.

Definir intervalos seguros e defaults concretos.

Não instalar cloud.
Não substituir sherpa-onnx.
Não comprometer inteligibilidade.

D) ACEITAÇÃO NUMÉRICA
Definir antes da implementação limites objetivos para:
- startup;
- idle CPU;
- memory;
- state transition latency;
- TTS added latency;
- knowledge-query regression.

Não inventar valores impossíveis.
Usar baseline já medido e tolerâncias razoáveis explicitadas.

==================================================
2. E — PROVAR ISOLAMENTO DE TRADING/LIVE
==================================================

A proposta deve incluir um SECURITY/BOUNDARY MAP explícito:

avatar process
→ UI state only

voice DSP
→ synthesized audio only

PTT/mic
→ pipeline JARVIS existente

knowledge retrieval
→ read-only

Nenhum desses componentes pode alcançar:
- order placement;
- broker APIs;
- NinjaTrader order paths;
- AOT/INVICTUS;
- account mutation;
- SpotGamma/MenthorQ capture mutation.

Provar por:
- imports/dependencies;
- route registration;
- call graph ou busca estrutural;
- allowlist dos handlers;
- negative tests.

POST /api/ui-state, se mantido:
- aceitar somente enum visual;
- sem payload arbitrário;
- sem forwarding;
- sem shell;
- sem tool invocation;
- sem ordem/trading.

O avatar NÃO precisa ser desligado em RTH.
Ele pode permanecer disponível 24/7, mas deve ser estritamente
informacional/read-only e incapaz de atingir caminhos de execução.

TRADING_MUTATIONS = 0 obrigatório.

==================================================
3. G — MATRIZ DE TESTES COM CRITÉRIOS EXATOS
==================================================

Na proposta, listar AVATAR01–14 e VOICE01–10 individualmente.

Para CADA teste registrar:

TEST_ID
TYPE = AUTOMATED | INTEGRATION | MANUAL_PHYSICAL
PRECONDITION
ACTION
EXPECTED_RESULT
PASS_CRITERION
EVIDENCE

Exemplos que precisam ficar objetivos:

AVATAR01:
asset abre e alpha é válido.

AVATAR02:
pixels fora do rosto permanecem transparentes; nenhuma janela opaca.

AVATAR03:
sem chrome/titlebar.

AVATAR04:
topmost flag confirmado.

AVATAR05:
drag físico é MANUAL_PHYSICAL se não puder ser automatizado;
não fingir automação.

AVATAR06:
posição salva, processo reiniciado, posição restaurada dentro da tolerância.

AVATAR07:
teste DPI com escala suportada/inspecionável.

AVATAR08–12:
cada estado visual acionável pelo contrato real.

AVATAR13:
close/reopen sem processo órfão.

AVATAR14:
asset ausente não derruba JARVIS core.

VOICE01–10:
definir igualmente critérios mensuráveis.

VOICE03 inteligibilidade:
não declarar subjetivamente “boa”.
Usar teste reprodutível disponível, por exemplo:
TTS → áudio → STT local → comparação textual,
com limiar documentado, além de evidência auditiva apenas como complementar.

VOICE07:
barge-in continua interrompendo playback.

VOICE08:
SPEAKING começa/termina por eventos reais do TTS.

VOICE10:
zero nova dependência cloud verificada.

E2E:
typed/voice query
→ LISTENING
→ THINKING
→ retrieval
→ SPEAKING
→ IDLE

Usar uma consulta comprovada do corpus, sem inventar resposta.

==================================================
4. ROLLBACK
==================================================

Definir rollback exato:

- arquivos adicionados;
- arquivos modificados;
- como desabilitar avatar;
- como desabilitar ROBOTIC profile;
- como retornar ao JARVIS ade771a sem afetar skills/core.

==================================================
5. ESCOPO MÍNIMO
==================================================

Não criar Electron.
Não criar projeto paralelo.
Não criar servidor adicional se :3594 já atender.
Não reescrever voice pipeline.
Não alterar skills/corpora.
Não alterar trading.

Reutilizar o máximo possível da arquitetura existente.

==================================================
6. NOVO JEV DIFF
==================================================

Depois de escrever a proposta revisada:

executar UM novo JEV DIFF REAL usando a NOVA evidência/proposta.

Registrar:
JEV_DIFF_2 =
REQUEST_ID =
CHOICE =
CONFIDENCE =
FULL_PROBABILITIES =

Não fazer query fishing.

==================================================
7. SE E SOMENTE SE JEV_DIFF_2 = A
==================================================

Continuar automaticamente até o fim:

IMPLEMENTATION
→ AVATAR ASSET COPY
→ FLOATING WINDOW
→ STATE INTEGRATION
→ ROBOTIC VOICE
→ TESTS AVATAR01–14
→ TESTS VOICE01–10
→ E2E
→ REGRESSIONS
→ PERFORMANCE
→ JEV RECHECK
→ UM JEV FINAL
→ COMMITS LÓGICOS
→ PUSH se FINAL=A e permitido
→ HANDOFF/RESULT

Não devolver ao operador entre essas etapas.

Se JEV_DIFF_2 != A:
parar sem editar código e retornar o motivo.

==================================================
8. RETORNO
==================================================

Se bloqueado no novo DIFF, retornar somente:

STATUS =
JEV_DIFF_2 =
JEV_DIFF_2_REQUEST_ID =
JEV_DIFF_2_PROBABILITIES =
PROPOSAL_REVISED =
CODE_MODIFIED = NO
TRADING_MUTATIONS = 0
BLOCK_REASON =
FINAL_STATUS =

Se conseguir concluir a missão, usar o retorno final completo já definido
em HANDOFF_JARVIS_VISUAL_VOICE_20261004.md.
