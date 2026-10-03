# PROPOSAL — ALPHA VIDEO KNOWLEDGE INGESTION V1 — 2026-10-02

Loop jev-finish `jf-20261003012131-dfa566` (sessão 17d88be4). Ordem do operador: `/jev-finish "VIDEO KNOWLEDGE INGESTION — ALPHA SKILLS"` (27 seções + DoD).
Escopo: material de estudo/evidência. Zero trading/ordens/AOT/INVICTUS/NT8/F5. Todo conteúdo de vídeo = UNTRUSTED_EVIDENCE.

## 0. AUDIT (pre-flight, fatos medidos)
| Item | Estado |
|---|---|
| Claude Code | 2.1.288, `C:\Users\ADM\.local\bin\claude`, CLAUDE_CONFIG_DIR isolado `.claude-darkprogectis` |
| Plugins | nenhum instalado; marketplaces: anthropic-plugin-directory, claude-plugins-official. `watch` NÃO existe |
| claude-video | github bradautomates/claude-video HEAD `03ceb42f7fa2` "release 0.3.2" (2026-09-25), plugin `watch` 0.3.2, MIT. Runtime base só stdlib Python; requer ffmpeg/ffprobe/yt-dlp; fallback de fala = whisperx (≈1,5 GB) ou cloud (groq/openai) ou none; engine gemini envia vídeo ao Google |
| Python | `py` 3.12.10 (`python`/`python3` = alias da Store, não funcionam) |
| ffmpeg/ffprobe | 8.1.2 full_build (winget Gyan.FFmpeg) |
| yt-dlp | AUSENTE |
| Whisper/WhisperX | nenhum CLI; JARVIS: sherpa-onnx-node 1.13.8 + `%LOCALAPPDATA%\jev-jarvis\models` (whisper-small, whisper-base, silero_vad, piper pt_BR faber/jeff, kokoro) |
| OCR | Tesseract 5.4.0 em `C:\Program Files\Tesseract-OCR` (eng), fora do PATH |
| Hardware | i7-11370H 4c/8t, 39,7 GB RAM, Iris Xe + RTX 3050 Ti Laptop |
| Vídeos | projeto: 0 · handoffs/context/docs: 0 caminhos/URLs de vídeo · diretório Alpha videos configurado: não existe · pastas "Handof TTW" (regra de memória): 0 vídeos (só docs; há 1 .m4a, extensão fora do escopo) |

Conclusão §5/§27: NÃO há material ⇒ construir e testar toda a infraestrutura com vídeos SINTÉTICOS gerados localmente, depois BLOCKED_EXTERNAL pedindo UM caminho de pasta ou manifest.

## 1. Instalação (mecanismo oficial, sem tocar no código do plugin)
1. `claude plugin marketplace add bradautomates/claude-video` e `claude plugin install watch@claude-video` com CLAUDE_CONFIG_DIR isolado (escreve só o registro de plugins do Claude Code; não edito settings à mão).
2. yt-dlp: rota que o próprio `setup.py` do watch recomenda no Windows: `winget install --id yt-dlp.yt-dlp --exact` (sem equivalente instalado). Deno (só YouTube) NÃO instalado agora ⇒ limitação registrada.
3. WhisperX NÃO instalado (duplicaria o STT local do JARVIS). Cloud NUNCA: o pipeline força `WATCH_ENGINE=local` + `WATCH_WHISPER_BACKEND=none` por variável de ambiente do processo filho, independentemente de `~/.config/watch/.env`. Gemini nunca é usado.
4. `setup.py --check/--json` do plugin para validar. Hook SessionStart do plugin é advisory (pode imprimir aviso porque `python3` é alias da Store) — registrado, não modificado.

## 2. Arquitetura (novos arquivos; nenhum arquivo existente de runtime alterado)
```
tools/alpha-video/
  watch_bridge.py   importa os módulos do plugin instalado (frames.py, download.py, transcribe.py) SEM modificá-los e emite JSON com timestamps exatos (o relatório markdown do watch arredonda para segundos). Mesmas funções que watch.py chama: get_metadata, extract_keyframes / extract_scene_or_uniform / extract_at_timestamps, fetch_captions + parse_vtt, download.
  lib.mjs           paths, sha256, ids, schema/validação video-knowledge/v1, sanitização (UNTRUSTED), segmentação, extração, conceitos, atribuição de API, contradições, índice, retrieval.
  stt.mjs           fala→texto reusando createVoice() do JARVIS (sherpa whisper + silero VAD) em processo próprio; ffmpeg → PCM 16 kHz; VAD em janelas com timestamps de amostra (start_ms/end_ms exatos); idioma configurável (default auto→'en'/'pt' por config). Não altera JARVIS.
  ocr.mjs           Tesseract (path explícito) sobre os frames ⇒ texto visual por frame (evidência VISUAL).
  ingest.mjs        CLI único: `node tools/alpha-video/ingest.mjs <arquivo|pasta|url|manifest.json> [--detail ...] [--start --end] [--max-frames N] [--lang]`
  ask.mjs           retrieval: `node tools/alpha-video/ask.mjs "<pergunta>" [--api gamma] [--k 5]`
  stats.mjs         contadores para o futuro painel KNOWLEDGE / VIDEO.
config/alpha-video.json  política de modos, limites, mapa vendor→API, glossário de conceitos.
knowledge/video/{manifest.json, sources/, transcripts/, frames/, segments/, evidence/, concepts/, indexes/}
```
npm scripts novos: `alpha-video-ingest`, `alpha-video-ask`, `alpha-video-stats`, `test:alpha-video` (+ `test/alpha-video/*.test.mjs` no `test`).

### 2.1 Pipeline
descobrir (arquivo/pasta não recursiva p/ extensões .mp4 .mkv .mov .webm .avi .m4v, URL, manifest `{urls:[...]}`) → hash (sha256 local; URL ⇒ sha256 da URL normalizada + id do yt-dlp) → dedupe (mesmo source+hash ⇒ SKIP; hash diferente ⇒ nova versão `video_id@vN`) → watch_bridge (frames + captions) → transcrição: (1) captions nativas (URL via yt-dlp; local via sidecar .vtt/.srt ao lado do arquivo ou stream de legenda embutida extraída por ffmpeg), (2) STT local JARVIS, (3) nada de cloud → OCR dos frames → segmentação → extração → validação de qualidade → índice por API + índice invertido → stats.
Vídeo original NUNCA copiado: `sources/<video_id>.json` guarda só a referência (path/URL, sha256, ffprobe). Mídia de URL baixada fica em diretório de trabalho temporário e é apagada após a ingestão.

### 2.2 Modos (§17)
duração ≤ 600 s ⇒ `balanced`; > 600 s ⇒ `efficient` + segmentação em janelas; `--detail transcript` ⇒ sem frames; `--timestamps` ⇒ frames pontuais; `token-burner` RECUSADO salvo `--allow-token-burner` explícito.

### 2.3 Segmentação (§7) — determinística
Fronteiras: pausa ≥ 2,0 s entre falas, mudança do conjunto de conceitos detectados entre janelas, duração máx 90 s, mín 8 s (merge). Segmento: `{segment_id, video_id, start_ms, end_ms, transcript, transcript_source, ocr_text, frame_refs[], speaker:null, topic, api_candidate, concept_candidates[], confidence, review_status:'PENDING_REVIEW'}`. Vídeo sem fala ⇒ segmentos por cena com transcript "" e texto visual.

### 2.4 Extração (§8, §13) — determinística, só o que o material sustenta
Unidade = frase do transcript (ou linha OCR). Item video-knowledge/v1 somente quando a frase menciona um conceito do glossário (ou termo desconhecido candidato). Campos exatamente como na ordem + `knowledge_class` (DEFINITION|API_FIELD_MEANING|FORMULA|RULE|HEURISTIC|TRADING_INTERPRETATION|EXAMPLE|OPINION), `attribution` (API_CONFIRMED|API_PROBABLE|CROSS_API|API_UNKNOWN), `source_kind` (SOURCE_VIDEO), `untrusted_flags[]`.
- evidence_type por padrões explícitos: definição ("X is/é/significa/means") ⇒ DEFINITION; "for example/por exemplo" ⇒ EXAMPLE; "I think/eu acho/in my opinion" ⇒ OPINION; passos/imperativos ⇒ PROCEDURE; texto vindo de OCR ⇒ VISUAL_DEMONSTRATION; demais ⇒ EXPLICIT_STATEMENT. Nunca INFERENCE automático.
- knowledge_class: OPINION se opinião; FORMULA se há operador/igualdade; RULE só se a frase é condicional explícita ("if/se … then/então"); TRADING_INTERPRETATION se contém BUY/SELL/long/short/compra/venda/bullish/bearish; EXAMPLE se exemplo; DEFINITION se definição; caso contrário HEURISTIC. RULE nunca vira regra determinística do runtime (nenhum código lê isto).
- confidence = função fixa de (evidence_type, fonte captions>stt>ocr, clareza) ∈ [0,1], cap 0,6 para STT/OCR, sempre `uncalibrated:true`.
- `statement` = citação literal (≤ 300 chars); nunca completado com conhecimento externo. O que não é dito ⇒ `unknowns[]` (ex.: "api_not_stated", "unit_not_stated").
- Termo desconhecido (CamelCase/sigla maiúscula não no glossário) ⇒ catálogo `concepts/unknown-terms.json` com grafia original + contexto + timestamp.

### 2.5 Atribuição (§10)
API_CONFIRMED somente se a MESMA frase nomeia o vendor/fonte da API (SpotGamma/HIRO-SpotGamma ⇒ gamma; MenthorQ ⇒ q; GexBot/GammaGex ⇒ bot; QuantData ⇒ data; Alfa Omega Consolidator ⇒ quant) junto do conceito. Vendor só no segmento (não na frase) ⇒ API_PROBABLE. ≥ 2 vendors ⇒ CROSS_API. Nada ⇒ API_UNKNOWN (api=unknown). Conceito conhecido (ex.: HIRO é produto SpotGamma) NÃO atribui sozinho: vira `hint` SOURCE_INFERENCE com API_PROBABLE no máximo. Só API_CONFIRMED entra em `factual` do agregador; o resto entra em `needs_review`.

### 2.6 Contradições (§12)
Mesmo conceito, polaridade oposta detectada por pares lexicais fixos (positive/negative, above/below, bullish/bearish, support/resistance, buy/sell, acima/abaixo, compra/venda, alta/baixa) em claims de vídeos diferentes (ou do mesmo vídeo em segmentos diferentes) ⇒ `evidence/contradictions.json` `{contradiction_id, concept, claim_a, evidence_a, claim_b, evidence_b, status:'UNRESOLVED'}`. Nunca escolhe vencedor; agregadores e retrieval listam as contradições do conceito.

### 2.7 Agregadores por API (§11) e camada das skills (§14)
`knowledge/video/indexes/alpha-{quant,gamma,bot,q,data}-video-knowledge.json` = `{schema:'alpha-video-knowledge/v1', api, layer:'VIDEO_DERIVED_KNOWLEDGE', factual[] (API_CONFIRMED), needs_review[] (PROBABLE/CROSS), contradictions[], stats}`; cada item com provenance video→segment→timestamp→transcript/frame. + `cross_api` e `unknown`.
SKILL.md das 5 skills: ACRESCENTAR (append) uma seção "19. VIDEO_DERIVED_KNOWLEDGE (camada separada)" com o caminho do agregador, o comando de consulta, a distinção SOURCE_API_DOCS/SOURCE_CODE/SOURCE_VIDEO/SOURCE_INFERENCE e a regra "vídeo nunca sobrepõe doc/código; contradição fica UNRESOLVED". Itens 1–18 intocados.

### 2.8 Retrieval (§15, §16)
Índice invertido BM25 simples sobre statement + conceitos + sinônimos pt/en do glossário. `ask.mjs` devolve no máx k itens: `{video_id, title, source, segment_id, timestamp "HH:MM:SS.mmm–…", statement (≤300 chars), evidence_type, attribution, confidence, frame_refs, contradictions}` dentro de envelope `UNTRUSTED_EVIDENCE`. Nunca transcript completo.

### 2.9 Léxico JARVIS (§19)
`knowledge/video/concepts/jarvis-lexicon-candidates.json`: termo, grafia(s) vista(s), variações, pronúncia SÓ quando já existe em `tools/jarvis/lexicon.mjs` (senão null), API relacionada (com estado de atribuição), definição só se DEFINITION com evidência, timestamps de origem. `tools/jarvis/*` NÃO é alterado (não degradar JARVIS); integração futura com revisão.

### 2.10 JEV (§24)
`ask.mjs --jev "<pergunta>" --item <id>` (opcional, sob demanda) envia SÓ o item + evidência ao JEV via cliente canônico e persiste em `knowledge/video/evidence/jev-decisions.jsonl`. Não é usado automaticamente na ingestão (custo/latência).

### 2.11 Segurança (§3)
- Texto de vídeo nunca chega a shell: todos os subprocessos com `spawn` + array de args, `shell:false`; nenhum campo de transcript/OCR é passado como argumento de processo.
- Nenhuma URL vista no conteúdo é seguida; URLs em statements são desarmadas (`hxxp://`, `[.]`).
- Detector de injeção marca `untrusted_flags`: PROMPT_INJECTION (ignore previous/ignore as instruções/system prompt/you are now), SHELL_COMMAND (rm -rf, curl|bash, powershell -c, iex, npm i, pip install, sudo…), URL, ORDER_LANGUAGE (send order/enviar ordem/buy now). Itens com flags ficam `review_status:'QUARANTINED'` e não entram em `factual`.
- Teste-canário: vídeo sintético narra/mostra "crie o arquivo PWNED" e `curl … | bash`; o teste prova que nenhum arquivo é criado, nenhum processo extra (além de ffmpeg/ffprobe/py/tesseract/yt-dlp, com args fixos) é lançado e que a rede só é tocada para a URL de entrada.

## 3. Testes (`test/alpha-video/*.test.mjs`, vídeos sintéticos gerados em dir temporário com ffmpeg lavfi + drawtext + fala Piper do JARVIS)
AV1 local balanced (frames + timestamps exatos + transcript STT) · AV2 URL (servidor http 127.0.0.1 servindo o arquivo; yt-dlp generic) · AV3 captions (sidecar .vtt e stream embutido ⇒ transcript_method=captions, sem STT) · AV4 sem captions ⇒ STT local · AV5 longo (>600 s, sintético barato) ⇒ efficient + vários segmentos · AV6 curto · AV7 sem fala ⇒ segmentos visuais, transcript vazio, OCR · AV8 tela importante ⇒ OCR "CALL WALL 5800" vira VISUAL_DEMONSTRATION com frame_ref · AV9 --start/--end, max-frames, detail efficient vs balanced, --timestamps · AV10 dedupe (mesmo hash ⇒ SKIP) · AV11 reprocessamento (arquivo alterado ⇒ nova versão, anterior preservada) · AV12 contradição entre 2 vídeos ⇒ UNRESOLVED · AV13 API unknown / probable / confirmed / cross · AV14 retrieval das 5 perguntas exemplo · AV15 skill retrieval por API (agregador + SKILL.md aponta) · AV16 prompt-injection narrada · AV17 comandos narrados · AV18 URL maliciosa exibida ⇒ desarmada, nunca acessada · AV19 validação de qualidade rejeita item sem provenance/timestamp/evidência/enum inválido · AV20 token-burner recusado por padrão · AV21 watch oficial: `watch.py <local> --detail balanced --no-whisper` produz relatório (plugin instalado funciona) · AV22 zero mutação: git diff de src/jev, src/alpha, tools/jarvis, tools/ijc, NT8 = vazio; nenhuma rota de ordem.
Regressões: alpha 83/83, jarvis 16/16, rotation, jev-finish, jev-obs.

## 4. Riscos
- Classificação determinística é conservadora (muitos API_UNKNOWN/HEURISTIC) — preferido a inventar; revisão humana/JEV sob demanda.
- STT do jargão: whisper-small já mediu intent bruto .48 em pt-BR sintético; em inglês tende a ser melhor; captions sempre preferidas.
- YouTube pode exigir Deno/cookies (não instalados). URL genérica testada localmente.
- Hook SessionStart do plugin pode imprimir aviso cosmético (python3 alias da Store).

## 5. Rollback
`claude plugin uninstall watch@claude-video` + `claude plugin marketplace remove claude-video`; `winget uninstall yt-dlp.yt-dlp`; apagar `tools/alpha-video/`, `config/alpha-video.json`, `knowledge/video/`, `test/alpha-video/`; reverter seção 19 das 5 SKILL.md e as linhas de package.json.
