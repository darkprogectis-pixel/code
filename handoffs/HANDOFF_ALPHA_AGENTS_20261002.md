# HANDOFF — ALPHA SIGNAL INTELLIGENCE (5 especialistas + Fusion) — SHADOW / READ-ONLY

Loop `/jev-finish` `jf-20261002230017-ced0d2` (MISSÃO FINAL Alpha + JARVIS). Sessões 2918b740 → 4e14fd6b (rotação #16). 2026-10-02.
Proposta aprovada: `handoffs/PROPOSAL_ALPHA_AGENTS_20261002.md` — JEV DIFF **A** `req_01a0fee466a07af785c15e7e72e854e7` (p A 0.63).

## Estado: Alpha IMPLEMENTADO e TESTADO (componente). JEV FINAL Alpha: ver §6.

## 1. Arquitetura (implementada conforme §7 da proposta)
`timer 30 s → cycle_id → 5 especialistas em paralelo (GET próprio → snapshot sha256 → evaluate puro → alpha-specialist/v1) → fuse (puro) → JEV Q1–Q12 (throttled, advisory) → alpha-fusion/v1 → var/alpha/{latest.json, history-YYYY-MM-DD.ndjson, metrics.json, jev-state.json, service.json} → outcomes (+1/+5/+15/+30/+60 min) → dashboard :3593 aba ALPHA`.

## 2. Arquivos
- Código: `src/alpha/{config,contracts,http,snapshots,stats,fusion,jev-fusion,pipeline,outcomes,service}.mjs`, `src/alpha/specialists/{common,quant,gamma,bot,q,data}.mjs`; `config/alpha.json` (constantes PROVISÓRIAS/UNCALIBRATED).
- Skills: `.claude/skills/skill-alpha-{quant,gamma,bot,q,data}/SKILL.md` (18 itens cada; `rules_version: alpha-rules/1`; teste de consistência skill↔código). Doc Fusion: `context/jev-future/ALPHA_FUSION_V1.md`.
- Painel: `tools/jev-obs/alpha.mjs` (read model), `tools/jev-obs/server.mjs` (+ `GET /api/alpha/{latest,history,metrics}`; redactor com `omitContent=false` só para Alpha — segredos continuam removidos), `tools/jev-obs/public/app.js` (aba ALPHA, refresh 10 s).
- Testes: `test/alpha/{helpers,specialists,fusion,pipeline,security,panel}.test.mjs`; fixtures reais sanitizadas `fixtures/alpha/*.json` + README.
- `package.json`: `test:alpha`, `alpha`, `alpha:once`; `npm test` inclui `test/alpha`. `.gitignore` += `var/`.

## 3. Os 5 agentes (rules `alpha-rules/1`)
| agente | fonte | papel | direção | confidence |
|---|---|---|---|---|
| AGENT_QUANT | Consolidator :3495 | SOURCE_CLASSIFICATION | classificação publicada; STALE se asof>120 s ou freshness≠LIVE | conf/100 × coverage × 0.6 |
| AGENT_GAMMA | SpotGamma :3500 | DIRECTIONAL_PRESSURE | HIRO slope 15 min vs p50 do dia; STALE se último candle>60 s | 1 × coverage × 0.3 |
| AGENT_BOT | GexBot relay :3457 | NON_DIRECTIONAL | sempre UNKNOWN (regime/níveis) | 0 |
| AGENT_Q | MenthorQ :3480 | NON_DIRECTIONAL | sempre UNKNOWN (SIDE_ORIGIN=FALSE) | 0 |
| AGENT_DATA | QuantData :3490 | SOURCE_CLASSIFICATION | classificação publicada; STALE se asof>600 s | conf/100 × coverage(S1..S4) × 0.6 |
Fusion: grupos de independência (Quant+Data = 1), massa = conf×strength, agreement ≥ 0.6, |score| ≥ 0.1, sem contradição material, ≥ 2 fontes frescas; sem votação 3×2; Q/Bot nunca originam nem vetam; JEV nunca altera o sinal.

## 4. Testes (verificados)
`node --test "test/alpha/*.test.mjs"` = **83/83 PASS** (registrado no loop como `alpha`). Cobertura: por API (válido, incompleto, stale, offline ECONNREFUSED, HTTP 500, JSON inválido, timeout, flip, contradição Quant×Data, determinismo); Fusion (5 OK, 1 e 2+ offline, neutros, consenso, conflito material, 3×2, forte×fraca, stale não vota, Q/Bot nunca originam/vetam, redundância, reprodutibilidade); JEV (mock A/B, erro, timeout, throttle, margin/ratio); pipeline (timeout isolado < 1,5 s, persistência atômica, histórico, métricas, dedupe de snapshot, retenção, outcomes, service sem overlap); painel (GET OK, POST/PUT 405, Host estranho 403, 404, NO_DATA); segurança (allowlist GET 127.0.0.1 6 portas, varredura estática sem POST/ordem/shell, escrita só em var/). `test/jev-obs/obs.test.mjs` 18/18 PASS após a mudança do server.
Fixes durante o teste: `jev-fusion.decide` passou a exigir leitura direcional fresca ≠ UNKNOWN; timer do timeout do JEV limpo (evitava 20 s de processo pendurado).

## 5. Live read-only (2026-10-02 23:27Z, fora do RTH)
`node src/alpha/service.mjs --once` ⇒ `ac-20261002232744-a8228a`: quant/gamma/bot/q STALE→UNKNOWN, data PARTIAL NEUTRAL 0.018; FUSION **NO_SIGNAL** ("só 1 fonte fresca"); 5 envelopes e fusion sem erro de contrato; total 771 ms (especialistas 267 ms; fetch bot 240 ms). JEV real OK `req_01a0fef1fafc7c07a04d41890fc20f06` (jev-1.13.0, 501 ms): Q1–Q4 UNKNOWN p=1, Q5 NEUTRAL 0.92, Q6/Q7/Q9 NO, Q10 INDETERMINATE p=1 ⇒ `agrees_with_signal=true`.

## 6. JEV FINAL Alpha — escopo deste gate
- Escopo: este FINAL avalia SOMENTE o componente Alpha (passo 10 da ordem: "JEV FINAL Alpha"). O objetivo do loop também inclui JARVIS (passos 11–25), executado em seguida NESTE MESMO loop e coberto pelo JEV RECHECK/FINAL da missão; JARVIS não é requisito deste gate.
- Tentativa 1: **F** (HANDOFF_INCOMPLETE) `req_01a0fef2ab387d52976664b04dc21071` p F .44 · A .39 · B .14 — causa: §6 era placeholder e o escopo não estava declarado. Correção: escopo + reprodução + rastreabilidade (esta seção). Sem mudança de código.
- Reprodução: `npm run test:alpha` (83/83) · `node --test test/jev-obs/obs.test.mjs` (18/18) · `npm run alpha:once` (1 ciclo live read-only, sem JEV) · dashboard `node tools/jev-obs/server.mjs` → http://127.0.0.1:3593/#ALPHA.
- Rastreabilidade: handoff canônico do loop `handoffs/HANDOFF_JARVIS_ALPHA_VOICE_20261002.md` (seção "Sessão 4e14fd6b") aponta para este arquivo; loop `jf-20261002230017-ced0d2` registra o teste `alpha` PASS.
- Riscos residuais (declarados, não bloqueantes): constantes UNCALIBRATED; só 2 grupos direcionais; fora do RTH tudo STALE ⇒ caminho fresco validado só por fixtures reais rebased (replay HIRO real do dia); formato do `tail` HIRO live não verificado em RTH hoje (parser tolera e registra warnings); custo JEV limitado por throttle + teto 300/dia.
- Sem commit ainda (commits por fase na etapa 21 da ordem, preservando mudanças não relacionadas).

## 7. Zero ordens
Allowlist GET-only 127.0.0.1:{3495,3500,3457,3480,3490,5151}; nenhum POST/PUT; nenhuma rota de ordem; nenhuma escrita fora de `var/`; AOT/INVICTUS/NT8/Consolidator/GexBot intocados. BUY/SELL = leitura analítica UNCALIBRATED.

## 8. Próximo passo
JARVIS: JEV DIFF de `handoffs/PROPOSAL_JARVIS_ALPHA_VOICE_20261002.md` (Parte J), stack voice, implementação, integração, testes E2E, benchmarks, RECHECK/FINAL da missão, commits, push.
- Tentativa 2: **A** (COMPLETE_AND_VERIFIED) `req_01a0fef2e91c7c979d9605e394301a16`, confidence 0.78, p A .81 · B .11 · F .04 · G .02; proposal_sha f83b6ab44057af6e; 2026-10-02T23:29Z. ⇒ **JEV FINAL Alpha = A**.
