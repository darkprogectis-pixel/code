# PROPOSTA — JARVIS VOICE INTELLIGENCE para os 5 Alpha Specialists + Fusion — FASE 0

Ordem do operador: 2026-10-02, sessão c205d615.
Esta fase é só AUDITORIA GLOBAL + LOCAL + ARQUITETURA + JEV DIFF. Nada é implementado, instalado ou alterado.

Rótulos de evidência usados abaixo:
- OFFICIAL: documentação ou model card do autor;
- COMMUNITY: fórum, blog ou Reddit;
- PROJECT: repositório;
- ISSUE: falha conhecida;
- BENCHMARK: número publicado;
- LOCAL: medido nesta máquina.

Um projeto individual não é tratado como consenso.

## 0. Relação com a ORDER_ALPHA_AGENTS e dependência bloqueante
- O JARVIS é um CONSUMIDOR somente-leitura dos envelopes `alpha-specialist/v1` (Quant, Gamma, Bot, Q, Data) e `alpha-fusion/v1`. Não substitui nenhum agente.
- **Dependência:** esses contratos ainda NÃO existem, porque a FASE 0 da ORDER_ALPHA está pendente.
  - Portanto, a implementação do JARVIS fica atrás da FASE 2/4 da ORDER_ALPHA.
  - Até lá, o JARVIS só pode ser construído e testado com envelopes FIXTURE, marcados `fixture:true`. Nunca são apresentados como mercado real.
- **Regra de concorrência:**
  - frente Alpha escreve só em `tools/alpha/**` e `test/alpha/**`;
  - JARVIS escreve só em `tools/jarvis/**` e `test/jarvis/**`;
  - arquivos compartilhados (`tools/jev-obs/public/*`, `tools/jev-obs/aggregate.mjs`, `sources.mjs`) são alterados de forma SERIAL: uma frente por vez, cada uma com seu próprio JEV DIFF.

## 1. GLOBAL_RESEARCH (resumo; fontes em §25)
| tema | achado | rótulo |
|---|---|---|
| Orçamento de latência | Gap humano típico entre turnos ≈ 200 ms (estudo em 10 línguas). ~800 ms é o orçamento voice-to-voice aceito. > 1,5 s é percebido como "quebrado". Streaming em todas as etapas (STT parcial, tokens, chunks TTS) é o que viabiliza. | COMMUNITY + BENCHMARK (twig.so, tianpan.co, soniox) |
| Pipeline local padrão 2026 | wake → STT (Whisper) → intent/LLM → TTS (Piper/Kokoro), via Wyoming no Home Assistant. Piper com streaming no wyoming-piper 1.6.3. | OFFICIAL/COMMUNITY (HA) |
| Interrupção | VAD durante a fala do agente cancela o TTS (Pipecat). Barge-in EXIGE AEC (WebRTC APM/speexdsp) ou headset; senão o microfone ouve o próprio agente. | PROJECT + COMMUNITY |
| End-of-turn | Semântico local: smart-turn v3 (BSD-2, 23 línguas incl. pt, ONNX 8 MB, ~12 ms CPU). LiveKit turn-detector multilíngue (pt: precisão 99,4 %, recall 87,4 %, ~400 MB RAM, ~25 ms). | OFFICIAL (daily.co, livekit docs) |
| STT runtimes | faster-whisper (CTranslate2 int8) vence em NVIDIA. whisper.cpp vence em Apple/Metal. Em CPU os dois são usáveis para tiny/base. large-v3-turbo ≈ 4× mais rápido que large-v3 em GPU. | BENCHMARK (terceiros; validar localmente) |
| STT pt-BR | Estudo PROPOR 2026 com 6 modelos Whisper em pt-BR: turbo com melhor equilíbrio acurácia/velocidade. Distil-Whisper CV-Brasil ≈ 8,2 % WER em áudio limpo. | BENCHMARK (aclanthology/HF) |
| Runtime unificado | sherpa-onnx (Apache-2.0): ASR streaming e offline, TTS, VAD (silero), keyword spotting. Windows e Node.js entre 12 linguagens. | PROJECT |

## 2. PROJECTS_REVIEWED (13). Padrões extraídos, sem copiar código
| projeto | stack | wake | STT | TTS | LLM/tools | streaming / barge-in | UI | Windows | licença | força | fraqueza / issue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Home Assistant Assist + Wyoming | protocolo JSON/TCP por serviço | openWakeWord / microWakeWord | faster-whisper | Piper | Ollama como agente de conversa | TTS streaming (2025) | HA | via Docker | Apache (HA) | serviços plugáveis por contrato | Piper arquivado em 10/2025; modelos de wake NC |
| Pipecat | pipeline de frames | — | faster-whisper / Speaches | Kokoro / Piper | qualquer LLM, tools | interrupção por VAD com frames de cancelamento; smart-turn | web (RTVI) | sim | BSD-2 | interrupção bem resolvida | framework, não produto |
| LiveKit Agents | WebRTC | — | plugáveis | plugáveis | tools | turn detector + interrupção | web | sim | Apache (plugin) | turn detection contextual | modelo do turn-detector: licença a verificar (PENDING) |
| GLaDOS (dnhkng) | buffer circular + VAD | — | ASR ONNX | TTS ONNX | LLM local streaming | quebra por sentença ⇒ TTS em paralelo; interrompível; alvo < 600 ms | terminal | parcial | MIT (código) | sem PyTorch, alvo de latência explícito | personagem fixo |
| Kyutai Unmute | WebSocket estilo OpenAI Realtime | — | Kyutai STT 1B (en/fr, VAD semântico, delay 500 ms) | Kyutai TTS | LLM via vLLM | full streaming, ~450 ms TTS (multi-GPU) | web | não (servidor GPU) | código MIT / pesos CC-BY | estado da arte em latência | sem pt; precisa de GPU grande |
| RealtimeSTT / RealtimeTTS (KoljaB) | Python multiprocess | Porcupine / openWakeWord | faster-whisper | vários | — | VAD start/stop, parciais | lib | sim (exige guard `__main__`) | MIT | API simples | Porcupine sem free tier desde 30/06/2026 |
| Open-LLM-VTuber | backends trocáveis | — | vários | vários | multi-tool | hands-free, interrompível | Live2D web | sim | MIT | componentes trocáveis | foco em companion |
| Willow | ESP32-S3 + servidor | on-device | WIS (Whisper) | WIS | opcional | rápido no device | — | servidor | Apache | wake/comando no device | hardware dedicado |
| OpenVoiceOS | fork Mycroft, skills | plugável | plugável | plugável | skills | — | GUI | Linux-first | Apache | ecossistema de skills | Windows fraco |
| Leon AI | skills modulares | — | local | local | LLM + skills | — | web | sim | MIT | offline-first | maturidade de voz |
| Speaches | servidor OpenAI-compatível | — | faster-whisper | Kokoro / Piper | — | streaming | API | Docker | MIT | troca cloud ↔ local por API | Docker no Windows |
| sherpa-onnx (k2-fsa) | runtime C++ com bindings | KWS open-vocab | Whisper / Parakeet / zipformer | Kokoro / Piper / VITS | — | ASR streaming, VAD | lib | sim (Node, C#, Python) | Apache-2.0 | 1 runtime, sem PyTorch | modelos pt-BR variam por pacote |
| Rhasspy (legado) | origem de Piper e Wyoming | — | — | Piper | intents por gramática | — | — | — | MIT (arquivado) | intents determinísticos | descontinuado |

**Padrões comprovados (repetidos em ≥ 3 projetos):**
- (P1) serviços desacoplados por contrato;
- (P2) streaming por sentença LLM→TTS;
- (P3) VAD durante o TTS cancela a fala (barge-in), com AEC;
- (P4) end-of-turn = VAD + modelo semântico;
- (P5) intents determinísticos + LLM só como fallback ou para fraseado;
- (P6) runtimes ONNX/CTranslate2, evitando PyTorch.

## 3. LOCAL_HARDWARE (LOCAL, somente leitura, 2026-10-02 ~22:45Z)
| item | valor |
|---|---|
| CPU | i7-11370H, 4 núcleos / 8 threads, 3,3 GHz; carga instantânea 36 % |
| RAM | 39,7 GB total; **6,4 GB livres**. NinjaTrader 5,85 GB, Bookmap 1,4 GB, WSL 0,97 GB, Chrome vários |
| GPU | RTX 3050 Ti Laptop, **4 GB VRAM, 2,8 GB já em uso** (desktop, NT8, Bookmap, NVIDIA Broadcast, MT5…), util. 38 %; Iris Xe integrada |
| CUDA / DirectML | driver 581.29; sem toolkit CUDA (nvcc ausente, sem CUDA_PATH); DirectML.dll presente |
| ONNX Runtime | apenas DLLs embutidas em outros apps (Edge, Firefox, Acrobat, Proton); não há ORT do sistema |
| Python | 3.12 via `py` (`python`/`python3` são stubs da WindowsApps) |
| Node | v26.4.0 |
| Ollama | 0.34.4 em 127.0.0.1:11434; nenhum modelo carregado |

Conclusão: **LOCAL_HARDWARE_SUITABLE = PARTIAL.**
- Sobra ≈ 1,2 GB de VRAM, que só comporta STT pequeno ou nenhum modelo na GPU.
- A RAM livre (6,4 GB) e a CPU de 4 núcleos competem com NT8, Bookmap, Claude Code e JEV durante o RTH.
- Cabe uma stack CPU-first enxuta: VAD + STT small/turbo-int8 + TTS 82M.
- NÃO cabe um LLM 8B+ residente sem degradar o NT8.

## 4. AVAILABLE_LOCAL_MODELS (Ollama, LOCAL)
| modelo | tamanho | capabilities | uso no JARVIS |
|---|---|---|---|
| dolphin-llama3:latest | 8B Q4_0, 4,7 GB, ctx 8k | completion (sem tools) | **NÃO integrar**: sem tool calling; fine-tune "uncensored" inadequado para grounding. Lab auditado, fica fora da proposta |
| dolphin-phi:latest | 3B Q4_0, 1,6 GB, ctx 2k | completion | não (sem tools, ctx 2k) |
| deepseek-coder:latest | 1B | completion | não |
| llama3:latest | 8B Q4_0, 4,7 GB | completion | não (sem tools) |
| gpt-oss:20b | 13 GB MXFP4 | tools + thinking | não residente: excede RAM livre e VRAM |
| qwen3-coder:30b | 18 GB | tools | não: idem |

Nenhum modelo instalado serve como cérebro residente com tools dentro do orçamento. Ver §9: o desenho NÃO precisa de LLM no caminho crítico.

## 5. AUDIO_DEVICES (LOCAL, registro MMDevices, somente leitura)
- **Captura (todas 48 kHz/16 bit):**
  - Microfone (NVIDIA Broadcast), 2 ch: já aplica supressão de ruído;
  - AI Noise-cancelling Input (ASUS Utility), 2 ch;
  - Grupo de microfones (Realtek), 2 ch;
  - WO Mic Device, 1 ch.
- **Saída:**
  - Alto-falantes Realtek, 48 kHz/32 bit;
  - Tempest 34" (HDMI), 44,1 kHz/32 bit;
  - Speakers (NVIDIA Broadcast), 48 kHz/16 bit;
  - ASUS AI NC Output, 48 kHz/16 bit.
- **Implicações:**
  - STT/VAD esperam 16 kHz mono ⇒ resample 48k→16k obrigatório;
  - o dispositivo é selecionável por nome em `config/jarvis.json`;
  - recomendado: mic NVIDIA Broadcast ou headset; AEC continua necessário se a saída for alto-falante.

## 6. STT_CANDIDATES (pt-BR)
| candidato | runtime | pt-BR | recursos | observação |
|---|---|---|---|---|
| Whisper large-v3-turbo (int8) | faster-whisper ou sherpa-onnx | sim | GPU ~1,5 GB ou CPU lento | melhor equilíbrio no estudo PROPOR; em CPU de 4 núcleos a latência pode passar o orçamento ⇒ medir |
| Whisper small (int8) | faster-whisper / whisper.cpp / sherpa | sim | CPU viável, < 1 GB | candidato CPU primário; frases curtas de comando |
| Whisper medium (int8) | idem | sim | CPU pesado | só se small falhar no WER de jargão |
| Parakeet TDT 0.6b v3 | sherpa-onnx (NeMo transducer) | pt (25 línguas EU) | CPU/GPU, muito rápido | WER pt-BR com jargão desconhecido; treinado com pt europeu+BR (variante não garantida) ⇒ A/B |
| Distil-Whisper pt (comunidade) | faster-whisper | pt-BR | menor | qualidade e licença por checkpoint ⇒ PENDING |

**Mitigação de jargão:**
- prompt inicial do Whisper com o vocabulário: Call Wall, Put Wall, HIRO, Charm, Vanna, Gamma, Delta, ES, NQ, Fusion, Quant, Bot, Q;
- normalizador léxico pós-STT com fuzzy match restrito ao glossário. Exemplos: "rio/hiro/airo" ⇒ HIRO; "col uol" ⇒ Call Wall.

## 7. TTS_CANDIDATES (pt-BR, voz humana)
| candidato | vozes pt-BR | qualidade (público) | recursos | streaming | licença |
|---|---|---|---|---|---|
| Kokoro-82M | pf_dora (F), pm_alex (M), pm_santa (M) | MOS geral 4,2 (todas as línguas); pf_dora nota "C" no OfflineTTS ⇒ pt-BR abaixo do inglês | CPU, 82M | por sentença | pesos Apache-2.0; G2P pt via espeak-ng (GPL-3.0) |
| Piper (vozes pt_BR: faber, cadu, jeff, edresson) | 4 | "mais robótico que Kokoro", muito rápido em CPU | CPU mínimo | sim (wyoming-piper 1.6.3) | runtime piper1-gpl GPL-3.0 (antigo MIT arquivado); vozes pela MODEL_CARD (faber e jeff: dataset CC0) |
| Chatterbox Multilingual | pt (23 línguas) | alta, clonagem | GPU (0,5B), não cabe no 1,2 GB livre | sim | MIT; marca d'água PerTH |
| XTTS v2 | pt | alta, clonagem | 4–6 GB VRAM | sim | CPML **não comercial** |
| F5-TTS / Fish Speech / Orpheus pt | checkpoints da comunidade | alta | GPU | parcial | CC-BY-NC / NC ⇒ excluídos |
| Sesame CSM | en | alta | GPU | — | sem pt ⇒ excluído |

**Decisão de fase:**
- A/B local entre Kokoro (pf_dora, pm_alex) e Piper (faber, cadu, jeff); vencedor por nota do operador + latência;
- nenhum candidato NC e nenhum candidato só-GPU no caminho padrão;
- Chatterbox fica como opção futura se houver VRAM livre (ex.: GPU dedicada).

**Pronúncia:**
- Kokoro e Piper não aceitam SSML pleno, logo a camada `tts-lexicon` reescreve o texto antes do TTS.
- O que ela reescreve:
  - siglas: "ES" ⇒ "é-ésse", "NQ" ⇒ "ene-quê", "HIRO" ⇒ grafia fonética escolhida pelo operador no A/B;
  - termos do jogo: "Call Wall", "Put Wall", "Charm", "Gamma";
  - números financeiros: 6512,25 ⇒ "seis mil quinhentos e doze vírgula vinte e cinco"; "+0,35 %"; "−1,2 bilhão".
- A tabela fica editável em `config/jarvis-lexicon.json`.

## 8. VAD_CANDIDATES / END-OF-TURN
| candidato | licença | nota |
|---|---|---|
| Silero VAD (v5/v6) | MIT (código e modelo) | padrão de fato; < 1 ms por chunk de 30 ms em CPU (README oficial); embutido no sherpa-onnx |
| TEN VAD | Apache-2.0 + condições Agora (não-concorrência; proibido em end-user device) | **excluído** por licença |
| WebRTC VAD (APM) | BSD | mais fraco; vem junto do AEC do navegador |
| smart-turn v3 (end-of-turn) | BSD-2 | pt suportado; ~12 ms CPU; fase 2 (com PTT não é necessário) |
| LiveKit turn-detector | plugin Apache; licença do MODELO PENDING | ~400 MB RAM; avaliar só após verificação de licença |

## 9. WAKE_CANDIDATES
| candidato | código | modelo | comercial | situação |
|---|---|---|---|---|
| openWakeWord + `hey_jarvis` pré-treinado | Apache-2.0 | **CC BY-NC-SA 4.0** | NÃO | uso pessoal permitido, mas NC/SA ⇒ não adotar como padrão |
| openWakeWord com modelo próprio treinado | Apache-2.0 | depende dos dados de treino (os dados negativos padrão têm licenças restritivas) | PENDING | exige auditoria dos datasets |
| microWakeWord | Apache-2.0 | treino próprio (Piper sintético) | PENDING (dados) | foco em ESP32, roda em TFLite |
| sherpa-onnx KWS (open-vocabulary) | Apache-2.0 | modelos zipformer (gigaspeech en / wenetspeech zh) | PENDING (licença do dataset) | "jarvis" sem treino; a palavra é inglesa, logo serve |
| Porcupine (Picovoice) | Apache (SDK) | proprietário + AccessKey | não; free tier encerrado em 30/06/2026 | **excluído** |

**Decisão:**
- PUSH-TO-TALK é a camada 1 obrigatória.
- Wake word fica plugável e DESLIGADO até auditoria de licença do modelo ⇒ `WAKE_WORD_LICENSE_SAFE = PENDING`.

## 10. LLM_CANDIDATES (opcional, nunca no caminho crítico de números)
- **Desenho:** intent router determinístico (gramática pt-BR + slots) + NLG por templates ⇒ responde 100 % da taxonomia §13 sem LLM. Os números vêm SEMPRE dos tools.
- **LLM opcional (fase posterior, por ordem própria):**
  - usos: paráfrase de MARKET_SUMMARY, FUSION_EXPLANATION em linguagem natural, desambiguação de FOLLOW_UP;
  - saída em JSON schema fechado; validador de grounding (§15) obrigatório.
- **Candidato:** Qwen3-4B (Apache-2.0, tool calling nativo no Ollama).
  - Não está instalado, logo seria nova dependência.
  - Cabe só em CPU/RAM (~3 GB), com latência a medir.
- **Lab Dolphin:** auditado e disponível, mas NÃO integrado. Motivos: sem tools, fine-tune sem alinhamento, licença Llama 3.
- **Modelos grandes:** gpt-oss:20b / qwen3-coder:30b inviáveis com 6,4 GB livres.

## 11. LICENSE_MATRIX
| COMPONENT | CODE_LICENSE | MODEL_LICENSE | COMMERCIAL_ALLOWED | ATTRIBUTION | SHARE_ALIKE | NON_COMMERCIAL | REDISTRIBUTION_RESTRICTIONS | SOURCE |
|---|---|---|---|---|---|---|---|---|
| sherpa-onnx | Apache-2.0 | (por modelo) | sim | sim (NOTICE) | não | não | não | github k2-fsa/sherpa-onnx |
| ONNX Runtime | MIT | — | sim | sim | não | não | não | github microsoft/onnxruntime |
| faster-whisper / CTranslate2 | MIT | — | sim | sim | não | não | não | github SYSTRAN |
| whisper.cpp | MIT | — | sim | sim | não | não | não | github ggml-org |
| Whisper (pesos OpenAI) | MIT | MIT | sim | sim | não | não | não | github openai/whisper |
| Parakeet TDT 0.6b v3 | — | CC-BY-4.0 | sim | **sim** | não | não | atribuição | HF nvidia / NGC |
| Silero VAD | MIT | MIT | sim | sim | não | não | não | github snakers4/silero-vad |
| TEN VAD | Apache-2.0 + condições | idem | **restrito** | sim | — | — | não-concorrência Agora; proibido em end-user device | github TEN-framework |
| smart-turn v3 | BSD-2 | BSD-2 | sim | sim | não | não | não | HF pipecat-ai/smart-turn-v3 |
| LiveKit turn-detector | Apache-2.0 (plugin) | PENDING | PENDING | — | — | — | PENDING | HF livekit/turn-detector |
| Kokoro-82M | Apache-2.0 (kokoro) | Apache-2.0 | sim | sim | não | não | não | HF hexgrad/Kokoro-82M |
| espeak-ng (G2P pt do Kokoro e Piper) | GPL-3.0 | — | sim (uso local) | sim | **sim (copyleft na redistribuição)** | não | distribuir binário linkado ⇒ GPL | github espeak-ng |
| Piper runtime (piper1-gpl) | GPL-3.0 | — | sim (uso local) | sim | **sim** | não | GPL na redistribuição | github OHF-Voice/piper1-gpl |
| Vozes Piper pt_BR faber / jeff | — | dataset CC0 (MODEL_CARD) | sim | recomendada | não | não | ver MODEL_CARD | HF rhasspy/piper-voices |
| Vozes Piper pt_BR cadu / edresson | — | PENDING (MODEL_CARD) | PENDING | — | — | — | PENDING | HF rhasspy/piper-voices |
| Chatterbox | MIT | MIT | sim | sim | não | não | marca d'água PerTH | github resemble-ai |
| XTTS v2 | MPL-2.0 (coqui-tts) | CPML | **não** | — | — | **sim** | — | coqui |
| F5-TTS | MIT | CC-BY-NC-4.0 | **não** | sim | não | **sim** | — | github SWivid |
| openWakeWord | Apache-2.0 | CC BY-NC-SA 4.0 (pré-treinados) | **não** | sim | **sim** | **sim** | NC + SA | github dscripka |
| microWakeWord | Apache-2.0 | treino próprio (dados PENDING) | PENDING | — | — | — | — | esphome |
| Porcupine | Apache (SDK) | proprietário + AccessKey | não (free tier fim 30/06/2026) | — | — | — | chave obrigatória | picovoice |
| Qwen3-4B | — | Apache-2.0 | sim | sim | não | não | não | HF Qwen |
| dolphin-llama3 / llama3 | — | Llama 3 Community License | sim com limites (≥ 700M MAU; AUP) | "Built with Llama" | não | não | AUP | Meta |
| dolphin-phi | — | base phi-2 MIT; datasets dolphin PENDING | PENDING | — | — | — | — | HF cognitivecomputations |
| gpt-oss:20b | — | Apache-2.0 | sim | sim | não | não | política de uso | OpenAI |

"Open source" ≠ "comercialmente livre": NC/SA/condições estão marcados. O projeto é de uso local e privado: GPL só obriga na redistribuição. Mesmo assim, o padrão escolhido evita NC e condições de não-concorrência.

## 12. TARGET_ARCHITECTURE (local-first, somente leitura)
```
MIC ─▶ HUD JARVIS (navegador, 127.0.0.1:3593/#JARVIS)
        getUserMedia {echoCancellation, noiseSuppression, autoGainControl} = AEC WebRTC do navegador ⇒ barge-in seguro
        PTT (tecla segurada na HUD) │ wake word (plugável, OFF)
        resample 16 kHz mono ─ WebSocket local (127.0.0.1:3594, token) ─▶
JARVIS SERVER (Node, tools/jarvis/server.mjs, processo separado, bind 127.0.0.1)
  VAD (Silero via sherpa-onnx) ─▶ STT pt-BR streaming/offline (Whisper small|turbo int8 ou Parakeet v3; A/B)
  ─▶ normalizador léxico (glossário) ─▶ INTENT ROUTER determinístico (§13; LLM só fallback opcional)
  ─▶ SPECIALIST TOOL REGISTRY (§14, read-only): Quant · Gamma · Bot · Q · Data · Fusion
         lê os envelopes alpha-specialist/v1 e alpha-fusion/v1 (store de snapshots da frente Alpha); nunca payload bruto quando há envelope
  ─▶ GROUNDING / FRESHNESS / EVIDENCE (§15) ─▶ NLG pt-BR por templates (+ paráfrase LLM opcional e validada)
  ─▶ tts-lexicon ─▶ TTS pt-BR por sentença (Kokoro|Piper; A/B) ─ chunks PCM ─▶ HUD toca
  ─▶ voice-cycles.ndjson (métricas; áudio bruto OFF) ─▶ JEV Observability (aba JARVIS)
```
- **Barge-in:** a HUD mantém o VAD ativo durante o playback.
  - Fala detectada ⇒ a HUD para o áudio imediatamente (local, < 50 ms) e envia `cancel` ao servidor, que aborta a síntese em curso.
  - A nova fala vai ao STT.
  - Comandos de voz "pare", "cancela" e "silêncio" atuam só no áudio.
- **Fallback se o navegador não estiver em foco:** hotkey global é fase posterior. Ela precisaria de um helper nativo, que seria dependência e entraria em proposta própria.
- **Recursos:**
  - STT na CPU com 2 threads (configurável) e prioridade BelowNormal; GPU só se a VRAM livre for ≥ 1,5 GB, medida no start;
  - modelos carregados sob demanda, com unload após inatividade;
  - nada residente na GPU por padrão;
  - limite de RAM do processo JARVIS: alvo ≤ 1,5 GB.
- **Por que Node + sherpa-onnx:**
  - 1 dependência nativa (Apache) cobre VAD, STT e TTS;
  - sem Python/PyTorch;
  - Node já é o runtime do projeto.
  - Plano B (só se o A/B exigir faster-whisper): sidecar Python 3.12 em venv isolado, por proposta própria.

## 13. INTENT_TAXONOMY
| intent | exemplo | tools | resposta sem evidência |
|---|---|---|---|
| DIRECT_FIELD | "qual o HIRO?" | get_field | "Não tenho evidência suficiente para responder." |
| LEVEL_QUERY | "onde está a Call Wall?" | get_levels | idem |
| PRESSURE_QUERY | "como está a pressão de Charm?" | get_field / get_specialist_state | idem |
| SOURCE_STATUS | "o Gamma está atualizado?" | get_source_health | sempre responde (saúde é fato) |
| COMPARISON | "Quant e Gamma concordam?" | compare_sources | idem, se ≥ 1 fonte stale |
| FUSION_EXPLANATION | "por que o Fusion está SELL?" | explain_fusion | idem |
| CHANGE_QUERY | "o que mudou em cinco minutos?" | get_history (janela) | idem, sem histórico |
| HISTORICAL_QUERY | "como estava Gamma às 14h?" | get_history | idem |
| MARKET_SUMMARY | "resuma o mercado" | get_market_snapshot | resumo só das fontes frescas + aviso das stale |
| FOLLOW_UP | "e acima disso?", "por quê?", "qual mudou mais?" | resolve referente da memória efêmera ⇒ intent alvo | "A que você se refere?" |
| CONTROL | "pare", "cancela", "silêncio", "mais devagar" | — (só áudio e preferências) | — |
| UNKNOWN / UNSUPPORTED | qualquer outra coisa; pedidos de ação/ordem | — | "Não posso fazer isso" ou "Não tenho evidência suficiente para responder." |

**Mapeamento termo ⇒ fonte competente** (glossário):
- vem da auditoria FASE 0 da ORDER_ALPHA;
- termo sem fonte mapeada ⇒ UNSUPPORTED;
- NUNCA inferir que "Call Wall" existe numa API sem campo documentado.

## 14. TOOL_CONTRACT (somente leitura; whitelist; o LLM nunca recebe acesso a filesystem/shell)
```
get_specialist_state(source)              source ∈ {quant,gamma,bot,q,data}
get_field(source, field)                  field ∈ dicionário da skill da fonte
get_levels(source, type)                  type ∈ {call_wall,put_wall,…} conforme FIELD_DICTIONARY
get_history(source, field, window)        window ≤ política de retenção do store
compare_sources(sources[], aspect)        aspect ∈ {direction,freshness,field}
get_fusion_state()
explain_fusion()                          evidências/contradições/ignored do alpha-fusion/v1
get_market_snapshot()
get_source_health()
```
Cada tool retorna:
`{ value, unit, source, field, source_timestamp, age_ms, fresh, confidence, evidence[], raw_ref{endpoint,snapshot_id,envelope_id}, status: OK|PARTIAL|STALE|ERROR|UNSUPPORTED }`

- `fresh` e `confidence` vêm do envelope do especialista; o JARVIS não recalcula nem fabrica.
- Ausente ⇒ `status: UNSUPPORTED`, `value: null`.

## 15. ANSWER_CONTRACT `jarvis-answer/v1` + grounding obrigatório
```
{ schema:"jarvis-answer/v1", voice_cycle_id, question_text, intent, slots,
  answer_text, answer_tts_text, sources[], evidence[{source,field,value,unit,source_timestamp,age_ms,fresh,raw_ref}],
  confidence, fresh, warnings[], unsupported_claims[], latency_ms{stt,route,tools,nlg,tts_first,total}, fixture:false }
```
**Validador determinístico:**
- todo número, nível, direção (BUY/SELL/bullish…) e nome de fonte em `answer_text` precisa casar com um item de `evidence[]`;
- o que não casa vai para `unsupported_claims` e é removido de `answer_tts_text` antes de falar;
- se nada sobra ⇒ "Não tenho evidência suficiente para responder.";
- dado stale ⇒ fala o dado com aviso explícito de idade ("há 4 minutos, desatualizado") ou omite, conforme a política da fonte; STALE nunca vira sinal.

## 16. LATENCY_BUDGET (PTT; fim de turno = soltar a tecla). Números PROVISÓRIOS até o bench local
| etapa | EXCELLENT | ACCEPTABLE | TOO_SLOW | base |
|---|---|---|---|---|
| wake detection (quando ativo) | ≤ 200 ms | ≤ 500 ms | > 800 ms | gap humano ~200 ms |
| VAD (por chunk 30 ms) | ≤ 1 ms | ≤ 5 ms | > 10 ms | Silero README |
| end-of-turn (modo VAD) | ≤ 300 ms de silêncio | ≤ 600 ms | > 1000 ms | smart-turn 12 ms + hangover |
| STT parcial | ≤ 300 ms | ≤ 600 ms | > 1000 ms | Kyutai delay 500 ms como referência |
| STT final (frase ≤ 4 s) | ≤ 400 ms | ≤ 900 ms | > 1500 ms | turbo/small int8; medir RTF local |
| intent routing (regras) | ≤ 5 ms | ≤ 20 ms | > 50 ms | determinístico |
| specialist lookup (store local) | ≤ 10 ms | ≤ 50 ms | > 200 ms | leitura local |
| Fusion lookup | ≤ 10 ms | ≤ 50 ms | > 200 ms | idem |
| LLM first token (opcional) | ≤ 300 ms | ≤ 800 ms | > 1500 ms | só para paráfrase |
| TTS first audio (1ª sentença) | ≤ 150 ms | ≤ 400 ms | > 800 ms | Kokoro/Piper em CPU; medir |
| **total time-to-first-spoken-word** (fim da fala → 1º áudio) | **≤ 800 ms** | **≤ 1500 ms** | **> 1500 ms** | regra de 800 ms; > 1,5 s = quebrado |
| barge-in (fala → silêncio do TTS) | ≤ 100 ms | ≤ 250 ms | > 500 ms | parada local na HUD |

## 17. MEMÓRIA
- **EPHEMERAL_CONVERSATION:** últimos 6 turnos ou 10 min, em RAM; só serve para resolver referentes de FOLLOW_UP; nunca contém valores de mercado reutilizáveis.
- **MARKET_STATE:** sempre relido dos envelopes a cada pergunta; cache máximo = janela de freshness da fonte. Memória antiga NUNCA substitui dado atual.
- **USER_PREFERENCES:** `config/jarvis.json` com voz, velocidade, idioma, dispositivo de entrada/saída, tecla PTT e wake on/off.

## 18. HUD (aba JARVIS no JEV Observability Control Plane, 3593)
- **Estado:** MIC STATUS · LISTENING · TRANSCRIBING · THINKING · QUERYING <fonte> · SPEAKING · MUTED.
- **Última interação:** pergunta, transcrição, resposta, fontes, freshness, confidence.
- **Latência:** breakdown (STT, route, tools, NLG, TTS first, total).
- **Áudio:** waveform/nível do mic.
- **Histórico:** de `voice-cycles.ndjson`.
- **Mic:** a mesma página captura o microfone. localhost é contexto seguro, logo getUserMedia funciona.
- O painel atual continua somente leitura. Só a captura de áudio é nova e fica isolada na aba.

## 19. VOICE OBSERVABILITY
Arquivo: `<CLAUDE_CONFIG_DIR>/jev-obs/voice-cycles.ndjson`, 1 linha por ciclo.

Campos:
- identificação: voice_cycle_id, mode (ptt|wake);
- tempos: wake_time, speech_start, speech_end, stt_partial_first, stt_final, answer_ready, tts_first_audio, tts_end;
- conteúdo: transcript (texto, ON por padrão, desligável), intent, tools_called[], agent_sources[];
- resultado: confidence, fresh, unsupported_claims_n, barge_in, errors[];
- latências por etapa.

Áudio bruto: OFF por padrão. O agregador do jev-obs ganha a seção `voice` (p50/p95 por etapa, taxa de UNSUPPORTED, barge-ins).

## 20. SECURITY_BOUNDARY (FASE INICIAL = READ ONLY)
- **Pode:** consultar envelopes e saúde, responder, explicar, comparar, resumir.
- **NÃO pode:** enviar, cancelar ou modificar ordem; fechar posição; editar config de trading; executar shell; acessar filesystem livre; alterar AOT/INVICTUS/NT8/JEV.
  - O registry não contém nenhum tool de ação. O teste verifica a ausência.
- **Rede:** server bind 127.0.0.1; WebSocket com token local; Host check; sem telemetria externa; sem cloud obrigatória.
- **Injeção:** strings vindas das APIs são tratadas como dados (nunca como instrução ao LLM); o validador de grounding filtra a saída.
- **Capacidade de ação futura:** exige outra fase JEV + confirmation gate + ordem do operador.

## 21. FREE / LOCAL
- FREE = custo zero por request de STT e de TTS, nenhum serviço cloud obrigatório, modelos locais; só hardware e energia.
- Componentes cloud: NENHUM no desenho padrão.

## 22. FILES_TO_CREATE (fase de implementação futura, após JEV DIFF A e após os contratos Alpha)
- `tools/jarvis/`:
  - `server.mjs`: HTTP + WebSocket 127.0.0.1:3594, token, Host check;
  - `audio.mjs`: resample, framing;
  - `vad.mjs`, `stt.mjs`, `tts.mjs`: adapters sherpa-onnx, carregamento sob demanda;
  - `router.mjs`: intents + slots pt-BR;
  - `glossary.mjs`: termo ⇒ fonte/campo, gerado do FIELD_DICTIONARY Alpha;
  - `tools.mjs`: registry read-only;
  - `grounding.mjs`: validador;
  - `nlg-ptbr.mjs`: templates + verbalização de números;
  - `lexicon.mjs`;
  - `memory.mjs`: efêmera;
  - `voice-log.mjs`;
  - `README.md`.
- `config/jarvis.json`, `config/jarvis-lexicon.json`.
- `test/jarvis/*.test.mjs`, `test/jarvis/fixtures/` (envelopes alpha fixture, corpus de texto).
- Modelos FORA do repo: `%LOCALAPPDATA%\jev-jarvis\models\`, com manifest SHA-256 + licença por modelo.

## 23. FILES_TO_MODIFY (serial, cada um com JEV DIFF próprio)
- `tools/jev-obs/public/{index.html,app.js,style.css}`: aba JARVIS. Compartilhado com a aba ALPHA ⇒ serializar.
- `tools/jev-obs/aggregate.mjs` + `sources.mjs`: fonte `voice-cycles`.
- Nada em src/jev, src/ijc, nt8, AOT, INVICTUS, settings, hooks.

## 24. DEPENDENCIES
**DEPENDENCIES_REQUIRED** (cada uma só com ordem explícita; nada instalado nesta fase):
- npm `sherpa-onnx-node` (Apache-2.0, binário nativo Windows), ou WebSocket mínimo em Node stdlib (sem dep). Se o WebSocket in-house não for robusto, `ws` (MIT).
- Modelos:
  - Silero VAD (MIT);
  - Whisper small e/ou large-v3-turbo int8 (MIT);
  - Parakeet TDT 0.6b v3 (CC-BY-4.0), opcional para o A/B;
  - Kokoro-82M multi-língua (Apache-2.0 + espeak-ng-data GPL-3.0, uso local);
  - vozes Piper pt_BR faber/jeff (CC0; MODEL_CARD a conferir).

**DEPENDENCIES_NOT_REQUIRED:**
- PyTorch, CUDA toolkit, Docker;
- Python no caminho padrão;
- Ollama no caminho crítico;
- qualquer serviço cloud;
- Porcupine;
- TEN VAD;
- XTTS / F5 / Fish;
- modelos openWakeWord pré-treinados.

## 25. RISKS
1. Contratos Alpha inexistentes ⇒ JARVIS bloqueado para dados reais (só fixture).
2. Contenção de CPU/RAM com NT8 no RTH ⇒ limites de threads/prioridade, unload, bench com NT8 ativo; kill-switch.
3. VRAM quase cheia (2,8/4 GB) ⇒ CPU-first; GPU só com folga medida.
4. WER de jargão pt-BR (HIRO, Charm, Call Wall) ⇒ prompt de vocabulário + normalizador + A/B.
5. Kokoro pt-BR com qualidade inferior ao inglês ⇒ A/B com Piper; possível troca futura.
6. GPL (espeak-ng / piper1-gpl): ok para uso local; redistribuição exige conformidade.
7. Wake word sem licença segura ⇒ PTT primeiro.
8. Barge-in falso por eco ⇒ AEC do navegador; headset recomendado.
9. Alucinação ⇒ sem LLM no caminho de números + validador + UNSUPPORTED.
10. Prompt injection via strings de API ⇒ dados nunca viram instrução.
11. Seleção errada de dispositivo de áudio (Broadcast × Realtek) ⇒ config por nome + teste de nível.
12. Privacidade ⇒ áudio bruto OFF, transcript desligável, tudo em 127.0.0.1.
13. Colisão de edição com a frente Alpha ⇒ separação de diretórios + serialização dos arquivos compartilhados.

## 26. TEST_PLAN
- **Unit (sem modelos):**
  - router (corpus de texto com ≥ 60 frases cobrindo todos os intents + variações + fora de escopo);
  - glossário (termo sem fonte ⇒ UNSUPPORTED);
  - grounding (número/nível/direção sem evidência ⇒ removido; nada restante ⇒ frase padrão);
  - NLG/números pt-BR;
  - lexicon;
  - memória (follow-up resolve; dado de mercado nunca vem da memória);
  - registry (zero tools de ação);
  - segurança (injection em string de API não altera a resposta).
- **Integração com envelopes fixture:** 5 OK; 1 stale; 2 offline; Fusion SELL com contradições; histórico vazio ⇒ "Não tenho evidência suficiente para responder."; `fixture:true` propagado.
- **STT bench (operador grava, local, sem upload):**
  - frases: "onde está a call wall?", "qual o HIRO?", "como está a pressão de charm?", "o gamma virou?", "o quant está comprador?", "o bot está parcial?", "qual é o sinal do fusion?", "o NQ está mais forte que o ES?" + 12 frases gerais;
  - 3 repetições, mic Broadcast e Realtek;
  - métricas: WER, WER-de-glossário, latência final, RTF, CPU %, RAM, VRAM.
- **TTS A/B:** Kokoro pf_dora/pm_alex × Piper faber/jeff/cadu sobre 20 frases financeiras.
  - Métricas: nota 1–5 do operador (naturalidade, inteligibilidade, números, siglas), first-audio, RTF, CPU.
- **Barge-in:** 20 interrupções. Métricas: tempo até silêncio, falsos disparos com alto-falante × headset, comandos "pare/cancela/silêncio".
- **Latência ponta a ponta:** p50/p95 por etapa versus §16, com NT8 + Bookmap + Claude Code ativos; delta de CPU/RAM no NT8.
- **Regressão:** `npm run test:rotation`, `npm run test:jev-finish`, `node --test test/jev-obs/*.test.mjs` PASS; zero ordens emitidas (verificação estática + runtime).

## 27. Fontes (web, 2026-10-02)
- openWakeWord (licença dos modelos): https://huggingface.co/davidscripka/openwakeword/raw/main/README.md · https://pypi.org/project/openwakeword
- Picovoice free tier: https://community.home-assistant.io/t/fyi-picovoice-confirmed-free-tier-accesskeys-will-stop-working-after-june-30-2026/1012744
- Piper / piper1-gpl: https://www.promptquorum.com/power-local-llm/piper-tts-review · https://huggingface.co/rhasspy/piper-voices/blob/refs%2Fpr%2F11/pt/pt_BR/faber/medium/MODEL_CARD
- Kokoro: https://replicate.com/alphanumericuser/kokoro-82m · https://offlinetts.com/voice/pf-dora/ · https://docsearch.algolia.com/mcp/docs/repo/hexgrad/kokoro
- TTS comparativo / licenças NC: https://codesota.com/speech/best-open-source · https://www.promptquorum.com/power-local-llm/local-tts-voice-cloning-piper-coqui-xtts · https://www.promptquorum.com/power-local-llm/piper-vs-kokoro-tts
- Chatterbox: https://www.resemble.ai/products/text-to-speech
- Whisper runtimes: https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026 · https://vexascribe.com/whisper-large-v3-vs-turbo
- Whisper pt-BR: https://preview.aclanthology.org/new-sigs/2026.propor-1.30/ · https://huggingface.co/fsicoli/whisper-large-v3-pt-cv16
- Parakeet v3: https://build.nvidia.com/nvidia/parakeet-tdt-0_6b/modelcard · https://together.ai/models/parakeet-tdt-0-6b-v3
- TEN VAD: https://github.com/TEN-framework/ten-vad · https://raw.githubusercontent.com/TEN-framework/ten-framework/main/LICENSE
- smart-turn v3: https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/ · https://huggingface.co/pipecat-ai/smart-turn-v3
- LiveKit turn detector: https://docs.livekit.io/agents/logic/turns/turn-detector
- microWakeWord: https://esphome.io/components/micro_wake_word/
- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx · https://k2-fsa.github.io/sherpa/onnx/
- Speaches / Kokoro servers: https://ariya.io/2026/03/local-cpu-friendly-high-quality-tts-text-to-speech-with-kokoro
- HA/Wyoming: https://community.home-assistant.io/t/tts-streaming-support/909884 · https://www.kunalganglani.com/blog/local-ai-voice-assistant-whisper-piper-ollama
- Pipecat: https://webrtc.ventures/2026/02/building-an-open-source-voice-ai-agent-that-avoids-vendor-lock-in/ · https://github.com/kwindla/macos-local-voice-agents
- GLaDOS: https://github.com/dnhkng/GlaDOS
- Kyutai Unmute: https://kyutai.org/2025/06/19/stt-open-source.html · https://www.mintlify.com/kyutai-labs/unmute/architecture/overview
- RealtimeSTT: https://github.com/KoljaB/RealtimeSTT
- Open-LLM-VTuber / Willow / OVOS / Leon: https://docs.llmvtuber.com/en/docs/intro/ · https://www.sourcepulse.org/projects/2126256 · https://blog.openvoiceos.org/about
- AEC / barge-in: https://strandsagents.com/docs/labs/pywebrtc-audio/index.md · https://github.com/koljab/echoff
- Latência: https://www.twig.so/blog/voice-ai-agents-latency-budget-800ms · https://tianpan.co/blog/2026-05-10-voice-agent-turn-taking-250ms-threshold-reshapes-architecture · https://soniox.com/wiki/voice-agent-latency-budget
- Qwen3 tools / VRAM: https://localllm.in/blog/ollama-vram-requirements-for-local-llms

## 28. Recomendação (para o JEV DIFF)
**RECOMMENDED_STACK (padrão, 100 % local/free, sem NC):**
- PTT na HUD (navegador, com AEC WebRTC);
- Silero VAD (MIT);
- STT: Whisper small-int8 em CPU, ou turbo-int8 se o bench aprovar, via sherpa-onnx (Apache) — A/B com Parakeet v3 (CC-BY);
- router determinístico + tools read-only sobre `alpha-specialist/v1` e `alpha-fusion/v1`;
- grounding validator; NLG por templates pt-BR;
- TTS: Kokoro pf_dora/pm_alex (Apache) × Piper faber/jeff (CC0) em A/B;
- LLM: nenhum no caminho crítico (Qwen3-4B opcional e posterior);
- wake word: OFF (PENDING licença).

**Sequência de implementação** (cada passo com ordem/JEV próprio):
1. contratos Alpha (ORDER_ALPHA FASE 0–4);
2. JARVIS texto-only (router + tools + grounding + NLG) sobre fixtures;
3. instalação de sherpa-onnx + modelos (ordem de install);
4. benches STT/TTS/barge-in;
5. aba JARVIS;
6. wake word, só após auditoria de licença.

## 29. ADENDO DE IMPLEMENTAÇÃO — MISSÃO FINAL (loop `jf-20261002230017-ced0d2`, 2026-10-02 ~23:35Z)
Autorização: ordem do operador `handoffs/ORDER_MISSION_ALPHA_JARVIS_FINAL_20261002.md` (passos 11–25: JEV DIFF desta proposta → stack por evidência + hardware → instalar só dependências necessárias com licença validada, fonte oficial, versão e hash → JARVIS completo → integração → painel → E2E → benchmarks → RECHECK/FINAL → commits → push → runtime local). Substitui a regra "cada passo com ordem própria" de §28: a ordem única cobre a sequência, mantendo JEV por componente.
1. **Dependência §0/§25.1 RESOLVIDA**: contratos `alpha-specialist/v1` e `alpha-fusion/v1` IMPLEMENTADOS em `src/alpha/**` (83/83 testes; JEV FINAL Alpha **A** `req_01a0fef2e91c7c979d9605e394301a16`); estado live em `var/alpha/{latest.json,history-*.ndjson,metrics.json}`. JARVIS lê esses arquivos (somente leitura) — nunca chama as APIs de mercado diretamente, nunca chama os especialistas.
2. **Caminhos**: Alpha ficou em `src/alpha/**` (não `tools/alpha`). JARVIS em `tools/jarvis/**`, `config/jarvis*.json`, `test/jarvis/**`; aba JARVIS em `tools/jev-obs/public/app.js` (serial, depois da aba ALPHA já concluída) + rota `GET /api/jarvis/*` lendo `var/jarvis/` (mesmo padrão de `tools/jev-obs/alpha.mjs`). Nada em src/jev, src/ijc, nt8, AOT, INVICTUS, settings, hooks.
3. **Camadas e fallback (degradação sem quebrar)**: núcleo texto-only determinístico (router + tools + grounding + NLG pt-BR + memória efêmera) é o caminho crítico e funciona sem nenhum modelo. Voz é camada adicional: STT/TTS/VAD via `sherpa-onnx-node` (Apache-2.0, prebuilt win-x64, CPU) carregados sob demanda. Se a dependência/modelo falhar ao instalar/carregar ⇒ JARVIS continua em texto e o status de voz reporta `VOICE_UNAVAILABLE(<motivo>)` (não é falso PASS).
4. **Stack escolhida por evidência + hardware** (i7-11370H 4C/8T, 4 GB VRAM com 2,8 GB ocupados ⇒ CPU-first): VAD Silero (MIT); STT Whisper (MIT) via sherpa-onnx — `small` int8 por padrão, `tiny`/`base` como fallback de latência; TTS Piper pt_BR (vits, MODEL_CARD verificado: só vozes com licença permissiva) e Kokoro multi-lang v1.0 (Apache-2.0; espeak-ng-data GPL-3.0 uso local, sem redistribuição) em A/B automático; wake word OFF (licença CC BY-NC-SA dos modelos pré-treinados ⇒ PTT pleno, wake plugável). Sem LLM no caminho crítico.
5. **Instalação** (somente o necessário): `npm i sherpa-onnx-node` (versão fixada em package.json) + modelos dos releases oficiais `k2-fsa/sherpa-onnx` baixados para `%LOCALAPPDATA%\jev-jarvis\models\` (fora do repo), com `models/manifest.json` (url, versão, SHA-256, licença, atribuição) gravado e espelhado em `config/jarvis-models.lock.json` no repo. Sem PyTorch/CUDA/Docker/Python/cloud/SaaS pago.
6. **Servidor**: `tools/jarvis/server.mjs` em 127.0.0.1:3594, Host check, token local em `var/jarvis/token` para rotas POST de pergunta/áudio (o único POST é "perguntar ao JARVIS": não muda estado de mercado nem de trading); áudio bruto NÃO é gravado por padrão; transcript desligável.
7. **Benchmarks sem ação humana** (ordem: ZERO ação humana): STT medido por round-trip TTS→STT nas 8 frases da ordem + 12 gerais (WER, WER-de-glossário, latência, RTF, CPU/RAM); TTS por TTFA, RTF, duração, CPU/RAM; barge-in por comando "pare/cancela/silêncio" no pipeline de texto e cancelamento de reprodução (tempo até silêncio); E2E p50/p95/p99 por estágio, classificação EXCELLENT/ACCEPTABLE/TOO_SLOW vs §16. Notas subjetivas do operador (naturalidade 1–5, gravação de microfone real) ficam como validação NÃO bloqueante pós-entrega, explicitamente registradas como tal.
8. **Testes** (`node --test "test/jarvis/*.test.mjs"`): §26 unit + integração com envelopes Alpha reais/fixture (5 OK, 1 stale, 2 offline, Fusion SELL com contradições, histórico vazio ⇒ "Não tenho evidência suficiente para responder."), `jarvis-answer/v1` validado, segurança (localhost only, sem segredos, sem shell/filesystem nas tools, zero rotas/tools de ordem, injection em strings de API não altera resposta), painel (GET JARVIS, 405/403), regressão (`test:alpha`, `test:jev-finish`, `test:rotation`, jev-obs).
9. **Start/stop único**: `scripts/jev-stack.mjs start|stop|status` (dashboard 3593 + Alpha service + JARVIS 3594), PIDs em `var/stack/`, tudo 127.0.0.1, SHADOW; não toca NT8/AOT/INVICTUS.
10. **Riscos adicionais**: download grande (centenas de MB) e CPU durante bench com NT8 aberto ⇒ threads limitadas (num_threads 2), carregamento sob demanda, unload por inatividade; se o host negar instalação/rede ⇒ BLOCKED_EXTERNAL real com o estado salvo.
