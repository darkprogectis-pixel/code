# JARVIS VOICE V1 — SHADOW / READ-ONLY (pt-BR, local, free)

Loop `jf-20261002230017-ced0d2` · proposta `handoffs/PROPOSAL_JARVIS_ALPHA_VOICE_20261002.md` (JEV DIFF **A** `req_01a0fef3ab4a7bf98e61f22ba7bdae69`) · handoff `handoffs/HANDOFF_JARVIS_ALPHA_VOICE_20261002.md`.

## O que é
Assistente de voz/texto que **responde** sobre o estado Alpha (5 especialistas + Fusion) com evidência. Não envia, cancela nem modifica ordens; não tem tool de ação; não lê APIs de mercado (só `var/alpha/*` escrito por `src/alpha/service.mjs`); não toca NT8/AOT/INVICTUS. BUY/SELL = leitura analítica.

## Arquitetura
```
HUD 127.0.0.1:3594 (mic getUserMedia + AEC, PTT botão/barra de espaço, barge-in local)
  └─ POST /api/ask-audio (f32le 16 kHz, token) ─▶ Silero VAD (trim) ─▶ Whisper (sherpa-onnx, CPU) ─▶ normalizador de glossário
  └─ POST /api/ask {text} (token) ──────────────────────────────────────────────────────────────┐
router determinístico (12 intents) ─▶ tools read-only (9) sobre var/alpha ─▶ grounding (frase sem fato = removida)
  ─▶ NLG pt-BR ─▶ jarvis-answer/v1 ─▶ lexicon (jargão + números por extenso) ─▶ TTS Piper por frase ─▶ GET /api/audio/<id>/<n> (WAV)
  ─▶ var/jarvis/voice-cycles-YYYY-MM-DD.ndjson (sem áudio bruto) ─▶ jev-obs 3593 aba JARVIS (GET only)
```
Camadas: o núcleo texto (`router/tools/answer/lexicon`) funciona sem modelo; voz é opcional e degrada para `VOICE_UNAVAILABLE(<motivo>)`.

## Arquivos
`tools/jarvis/{router,lexicon,tools,answer,voice,voice-log,server,bench,install-models}.mjs`, `tools/jarvis/public/index.html`, `config/jarvis.json`, `config/jarvis-models.lock.json`, `tools/jev-obs/jarvis.mjs` (+ rota/aba), `scripts/jev-stack.mjs`, `test/jarvis/*.test.mjs`.

## Stack e licenças (modelos fora do repo: `%LOCALAPPDATA%\jev-jarvis\models`, manifest SHA-256)
| peça | escolha | licença | nota |
|---|---|---|---|
| runtime | sherpa-onnx-node 1.13.8 | Apache-2.0 | CPU, sem Python/CUDA |
| VAD | Silero VAD | MIT | SHA publisher verificado |
| STT | Whisper base int8 (padrão) · small (alternativa) | MIT | SHA TOFU (release sem digest) |
| TTS | Piper pt_BR faber-medium (padrão) · jeff | voz: dataset CC0, fine-tune de lessac ⇒ comercial PER_MODEL_CARD; espeak-ng-data GPL-3.0 uso local | SHA verificado |
| TTS alt. | Kokoro-82M int8 pf_dora (sid 42) | Apache-2.0 | melhor pronúncia, mas RTF > 1 nesta CPU ⇒ TOO_SLOW, fora do padrão |
| wake word | OFF | modelos pré-treinados CC BY-NC-SA / Porcupine sem free tier | PTT pleno; wake plugável (`input.wake_word`) |
| LLM | nenhum no caminho | — | números nunca passam por LLM |

## Segurança
Bind 127.0.0.1; Host e Origin checados; HUD same-origin com token (`var/jarvis/token`, 48 hex); POST somente `/api/ask`, `/api/ask-audio`, `/api/cancel` com token (timing-safe); sem rotas de ordem (teste verifica 404); sem shell/fs/rede no caminho da requisição; áudio bruto nunca gravado; transcript desligável (`privacy.store_transcript`); strings das APIs são dados (teste de injeção).

## Operação
- Stack único: `node scripts/jev-stack.mjs start|stop|status` (jev-obs 3593 + Alpha service + JARVIS 3594).
- Só JARVIS: `npm run jarvis` · modelos: `npm run jarvis:models` · bench: `npm run jarvis:bench` · testes: `npm run test:jarvis`.
- Dashboard: `http://127.0.0.1:3593/#JARVIS` · falar: `http://127.0.0.1:3594/` (segure o botão ou a barra de espaço; Esc para interromper).

## Benchmarks
Ver `var/jarvis/bench-latest.json` e a seção de resultado no handoff. Benchmark de STT é **round-trip sintético TTS→STT** (pessimista para voz humana; o normalizador foi derivado do mesmo conjunto de frases ⇒ métrica `intent_preserved` é otimista, `intent_preserved_raw_no_normalizer` é a imparcial). Validação com microfone real e notas subjetivas do operador = **NÃO BLOQUEANTE**, pós-entrega.

## Limites conhecidos
Jargão inglês em STT pt-BR é o ponto fraco (Whisper base); hotwords não são suportados para Whisper no sherpa-onnx. Kokoro excede tempo real na CPU 4C/8T. Barge-in por voz depende do AEC do navegador (headset recomendado). Hotkey global fora do navegador = fase futura.

## Resultado do bench (2026-10-02 23:51Z, i7-11370H, CPU, NT8 aberto)
| métrica | valor | classe §16 |
|---|---|---|
| route p95 | 0,21 ms | EXCELLENT |
| answer (tools+grounding+NLG) p95 | 6,8 ms | EXCELLENT |
| TTS Piper faber TTFA p50 / p95 | 269 / 741 ms (RTF 0,075) | ACCEPTABLE |
| STT Whisper small@2t p50 / p95 | 1313 / 2091 ms | TOO_SLOW (etapa) |
| STT Whisper base@2t p50 / p95 | 342 / 501 ms | EXCELLENT (fallback) |
| texto → 1º áudio p50 / p95 | 289 / 689 ms | EXCELLENT |
| fim da fala → 1º áudio p50 / p95 (small) | 1403 / 2925 ms | ACCEPTABLE (p50) |
| barge-in (cancel servidor) p95 | 0 ms + parada local no navegador | EXCELLENT |
| intent preservado STT bruto (small / base) | 0,48 / 0,40 (sintético) | limitação conhecida |
