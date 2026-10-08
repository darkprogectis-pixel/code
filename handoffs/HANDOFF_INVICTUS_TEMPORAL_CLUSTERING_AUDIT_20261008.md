# HANDOFF — INVICTUS_TEMPORAL_CLUSTERING_AUDIT_20261008

Sessão 6b86565f (2026-10-08). Auditoria CAUSAL, somente leitura. **ZERO PATCH · PATCH_AUTHORIZED = NO · ORDERS 0 · F5 0.** Nada escrito em `Documents\NinjaTrader 8`.

## 1. Pergunta do operador
Por que o INVICTUS produz clusters curtos de entradas e depois longas dead zones, overnight e RTH (hipótese a testar: TEMPORAL_CLUSTERING + LONG_DEAD_ZONES; nada assumido).

## 2. Status
STATUS = AUDIT_COMPLETE · JEV_CAUSAL_DECISION = A (conf 1,0) · prova = A 0,53 / B 0,47 (ROOT_CAUSE_PROVEN com ressalva: medir o Press real em runtime) · **req_01a11b689c827f79b8769f4682e9d5ba** (jev-1.13.0).

## 3. Pasta de trabalho
`W` = `Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\invictus-temporal-clustering-audit-20261008`
- `tools\` extract_audit.js · phase12.js · funnel_rt.js · replay.js · compare.js · resetprox.js · cf.js · pubs.js · jev_causal.js · collect_bridge.js
- `tests\01..07_*.txt` (saídas) · `tests\entries.json` · `JEV_CAUSAL_T1_{INPUT.txt,RESULT.json}` · `data\bridge_5151.csv` (coleta passiva em andamento)
- Intermediários grandes (ticks_*.csv, events_*.jsonl, replay_out.json) ficam no scratch da sessão; regeneráveis pelos tools (ordem: extract_audit sep/oct → phase12 → funnel_rt → pubs → replay → compare → resetprox → cf). Os tools leem os intermediários de `__dirname`: rodar a partir de uma pasta que os contenha.

## 4. Fontes (todas read-only)
`alfaomega-robo\history\trades-2026-{09,10}.jsonl` · `alfaomega-robo\logs\audit-2026-{09,10}.jsonl` · tick db `Documents\NinjaTrader 8\db\tick\{ES,NQ} 12-26` (decoder validado `press-policy\tools\ncd_decode.js`) · código do snapshot pós-import (`scratch 19ed00ed\oliver_postimport`) · bridge local `:5151/state` (GET).

## 5. Mecanismo (código)
- Motor (`AlfaOmegaRoboMotor.cs` l.423–434): entrada só com anchor 4/4 + cooldown 60 s + histerese + preço dos dois legs. Entradas do motor = anchor local + spots locais + exec-block local; nenhuma API.
- `AoGate.EsNq` (`AlfaOmegaSharedState.cs` l.841–893), sequencial: 1) tape < 90 s · 2) ME==MVI≠0 por símbolo · 3) ES==NQ · 4) |Press| ≥ limiar nos dois.
- Press = cumDelta/cumVol; zera só na virada (`AoControlCenter.cs` l.1239, primeira barra da sessão = 18:00 ET) e por instância nova do publicador. ME/MVI são latches (não zeram). Sem reset em 00:00 / 09:30 / 16:00.
- Limiar: 0,03 fixo em OLIVER_BASE e P-RTH1 (mesmo arquivo de gate 7e64fc18); P-GCAP = 0,03·min(1, C·(vol/Vbar)^-(1-α)), teto 0,03 — desconto só acima de ~69 mil contratos ES / ~41 mil NQ.

## 6. Resultados
- **Entradas:** 320 registros, 6 TEST_RT_VALIDATION excluídos, 314 orgânicos (287 nativos + 27 por evento canônico do AOT 01–06/10), replay 0, simulados 0. ENTRY = CLOSE − DURATION confere com openedAt (erro máx. 0,5 s).
- **Gaps (tempo de mercado aberto):** mediana 11 min · p75 26 min · p90 2,73 h · p95 8,2 h · máx. 42,3 h.
- **Clusters (Otsu no log do gap, quebra 43 min):** 60 · mediana 3,5 trades · máx. 23 · duração mediana 25 min · dead zone entre clusters mediana 2,8 h · p90 13,2 h · máx. 42,1 h.
- **Hora ET:** 18h 50 · 20h 36 · 19h 33 · 08h 30 · 07h 24 · 09h 22 · 11h 3 · 13h 2 · 17h 0. Entrada no minuto 18:00 ET em 7 dos 19 dias (10 até 18:02).
- **Replay tick a tick (18 sessões, por segundo), P(força | alinhado) a 0,03:** 0–5 min 71,8 % · 30–60 min 52,5 % · 60–120 min 21,1 % · 2–4 h 14,1 % · 4–8 h 5,2 % · 13–15,5 h 8,1 % · RTH 0,01 % / 0,00 %. P(definido) 73–86 % e P(alinhado | definido) 43–73 % estáveis. Mediana |Press| ES 0,112 → 0,036 → 0,020 → 0,013 → 0,006; cumVol ES mediano 793 → 44 mil → 489 mil.
- **Contrafactual (mesmos ticks/motor):** sem passo 4 = 2705 entradas, p90 gap 20 min, máx. 2,4 h, 0 gaps > 4 h · BASE/P-RTH1 = 182 entradas, p90 8,9 h, 23 gaps > 4 h, 0 entradas 10–16h ET · P-GCAP = 317 entradas, p90 1,7 h, 27 gaps > 4 h, 15 > 8 h, 44 entradas 10–16h ET; 18–20h ET idêntico ao BASE.
- **Runtime ATIVO × MORTO (audit):** P(definido) 81,9 × 76,7 % · P(alinhado | definido) 64,2 × 67,2 % · strength 4 52,5 × 51,6 % · **P(força | alinhado) 66,0 × 0,0 %** · |Press| ES 0,0275 × 0,0087.
- **Fim do cluster (48 clusters):** P(força | alinhado) 2,9 % (−30 min) → 66,0 % (durante) → 33,6 % (+0..15) → 4,2 % (+15..45); direção não muda. Primeira variável a mudar = |Press| abaixo de 0,03.
- **Resets (antes de 02/10, acumuladores forward-only por instância):** 188 trocas de instância ES / 162 NQ no audit. 40 de 48 partidas de cluster até 15 min após um reset (mediana 1 min). Entradas até 15 min de um reset: 63,9 % (base 12,5 %); até 120 min: 97,9 % (base 54,1 %). As 50 entradas em RTH foram todas precedidas por troca de instância na sessão. Depois de 02/10 (Press de sessão inteira ou 0): 29 entradas, 0 em RTH, 3 de 5 clusters no minuto 0–1 da sessão.
- **Runtime × replay (passo 4):** concordância 95,7 % (antes de 02/10) e 99,0 % (depois); divergência = origem do acumulador.
- **Tempo morto 15/09–07/10 (256 h de mercado aberto):** sem tick do motor 21,9 % · sem tape 14,0 % · indefinido 14,6 % · divergente 16,1 % · força fraca 33,3 % · OK sem entrada 0,0 %. Com motor e tape vivos: força 51,9 % · divergente 25,2 % · indefinido 22,9 %.
- **APIs:** fora do caminho de decisão do motor. 325 aberturas com gate_check: 58 com ecossistema parcial, 223 pronto. Bloqueios são de EXECUÇÃO: STOP 139 · turno 72 · licença 12 · source_readiness 2 · pass 100.
- **Runtime ao vivo (bridge, 2026-10-08 12:06Z, P-GCAP):** strength 4, ES e NQ ME/MVI = +1, Press ES −0,01702 / NQ −0,01051, PRESS_VALID, block FORCE_BELOW_MIN.

## 7. Conclusão
ROOT_CAUSE = passo 4 do gate compara uma razão acumulada (Press) a um limiar; só passa com denominador pequeno logo após um reset de acumulador (virada 18:00 ET; antes de 02/10 também cada instância nova do publicador) e decai com o volume ⇒ rajada após o reset + dead zone depois. Direção (indefinido/divergente) = modulador comum a ativo e morto. Infra (motor/tape fora) = causa secundária separada (35,9 % do tempo morto). API_CAUSAL = NO. Cooldown/histerese = 0,0 % do tempo morto.

## 8. Limitações
Press não é gravado no audit (reconstruído do tick db). Trocas de instância só vistas quando o audit amostra (p90 22 min). 27,4 % das entradas de antes de 02/10 não reproduzidas pelo Press reconstruído (carga exata desconhecida). P-GCAP sem entrada real ainda. JEV prova A 0,53 / B 0,47.

## 9. Em andamento nesta sessão
- Coletor passivo `tools\collect_bridge.js` (GET :5151/state a cada 20 s → `data\bridge_5151.csv`) — mede o Press real em runtime (ressalva B do JEV). Morre com a sessão; relançar com `node tools\collect_bridge.js`.
- Vigia da primeira entrada real P-GCAP (ver `HANDOFF_OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007.md`): ainda sem entrada em 2026-10-08 12:06Z.

## 10. EXACT_NEXT_STEP
1. Deixar o coletor rodar ≥ 1 sessão completa (inclui a virada das 18:00 ET) e comparar Press/limiar real com o replay ⇒ reenviar JEV de prova se o operador quiser fechar a ressalva B.
2. Decisão do operador: abrir (ou não) a fase de DESENHO de correção. Nenhum patch sem ordem explícita.

## 11. Evidências no repositório
Cópia das saídas e ferramentas em `handoffs/invictus-temporal-clustering-audit/` (`01..07_*.txt`, `JEV_CAUSAL_T1_{INPUT.txt,RESULT.json}`, `tools/*.js`). Originais em `W`.

## 12. FASE T2 — prova direta com Press real de runtime (em andamento, sessão 6b86565f)
- Commit do handoff + evidências: `cac1fe2` (sem push).
- **Press runtime × tick db (16 marcadores `AoPress PRESS_VALID vol/cum/press` do `alfaomega_erros.log`, 4 sessões 05–08/10, 161 a 1312 min após 18:00 ET, inclui RTH):** MATCH (|erro| ≤ 0,001) 16/16 · erro mediano 0,00023 · erro máx. 0,00054 · erro de volume ≤ 0,39 % · mesmo lado do limiar 0,03 em 16/16. Saída: `W\tests\08_runtime_press_markers_vs_db.txt` (tool `tools\marco_cmp.js`).
- Coleta ao vivo: `tools\collect_bridge.js` → `W\data\bridge_5151.csv` desde 2026-10-08 12:07Z (20 s). Campos do bridge: anchor (dir, strength, why, block), ME/MVI/Press/pressState por símbolo, minForce. **O bridge não publica PressVol nem o limiar efetivo**: LimiarForca efetivo = fórmula P-GCAP sobre o volume reconstruído do tick db (que só é gravado quando o NT8 baixa histórico; última gravação 08/10 00:07 BRT) + cota direta pelo veredito do próprio runtime (block FORCE_BELOW_MIN × OK com os 4 canais alinhados).
- Janela-alvo: até ≥ 120 min após a virada de 18:00 ET de 08/10 (≥ 2026-10-09 00:00Z). Depois: análise por marcos (reset, +15, +30, +60, +120, overnight, pré-RTH, RTH, tarde) ⇒ JEV CAUSAL T2. Sem desenho de correção antes do T2.
- Se a sessão cair: relançar `node tools\collect_bridge.js` (append no mesmo CSV; buracos ficam visíveis pelo timestamp).

## 13. FASE T2 FECHADA + DESENHO DA CORREÇÃO (sessão 6b86565f, 2026-10-08) — ZERO PATCH, NT8 intocado
Ordem do operador: não esperar coleta ao vivo; decidir com o conjunto retrospectivo.

### 13.1 Marcos históricos (18 sessões reais 14/09–07/10; `tests\09_milestones_and_alternatives.txt`, parte 1)
| Marco | abs(Press) ES / NQ | Vol ES / NQ | Limiar P-GCAP ES / NQ | P(força dado alinhado) 0,03 / P-GCAP | Alinhado |
|---|---|---|---|---|---|
| reset 0–2 min | 0,1106 / 0,1314 | 493 / 338 | 0,0300 / 0,0300 | 81,8 % / 81,8 % | 41,1 % |
| +15 min | 0,0570 / 0,0551 | 2437 / 2149 | 0,0300 / 0,0300 | 47,4 % / 47,4 % | 42,6 % |
| +30 min | 0,0420 / 0,0529 | 3617 / 3378 | 0,0300 / 0,0300 | 40,7 % / 40,7 % | 50,0 % |
| +60 min | 0,0403 / 0,0354 | 5611 / 5486 | 0,0300 / 0,0300 | 21,2 % / 21,2 % | 33,2 % |
| +120 min | 0,0357 / 0,0313 | 10163 / 9773 | 0,0300 / 0,0300 | 18,3 % / 18,3 % | 35,4 % |
| overnight +6 h | 0,0180 / 0,0210 | 46987 / 36608 | 0,0300 / 0,0300 | 9,3 % / 14,6 % | 45,6 % |
| pré-RTH 08:30 ET | 0,0197 / 0,0130 | 196 mil / 106 mil | 0,0218 / 0,0213 | 4,0 % / 12,8 % | 50,7 % |
| RTH 10:30 ET | 0,0128 / 0,0058 | 500 mil / 237 mil | 0,0163 / 0,0159 | 0,0 % / 3,0 % | 55,7 % |
| tarde 14:00 ET | 0,0099 / 0,0040 | 999 mil / 407 mil | 0,0132 / 0,0131 | 0,0 % / 6,2 % | 57,0 % |

Direção definida 72–96 % em todos os marcos. RESET_EFFECT_CONFIRMED = YES · PRESS_DECAY_CONFIRMED = YES · STEP4_FIRST_BLOCKER_CONFIRMED = YES · PGCAP_INSUFFICIENT_TO_REMOVE_DEAD_ZONES = YES.

### 13.2 JEV
- **CAUSAL T2 = A · prob. 0,87 (conf 0,83) · req_01a11b7fcb7078d9b0f571dfbf4071e9** — ROOT_CAUSE_PROVEN = YES. Lacuna residual apontada: série contínua do Press real através de uma virada (0,56) / P-GCAP em runtime (0,39) — coleta passiva segue em background, sem bloquear.
- **SELECT T1 · req_01a11b80d65a7e388304fbc0f4d2acbd** — família ZSCORE em janela 0,61 (razão local por volume 0,21; EMA razão 0,06; resto ≤ 0,04) · exigir sinal = direção: SIM 0,74 · seletividade 1,42/2 · suficiência B 0,99 (pediu teste adicional).
- **DESIGN T1 = A · prob. 0,79 (conf 0,72) · req_01a11b83310e7c01a1bd133b3ab8f0cc** — variante JANELA_30 0,66 (JANELA_15 0,21; JANELA_10 0,07) · viés temporal removido 1,84/2 · seletividade 1,42/2 · lacuna residual: validação em runtime/playback 0,64 · aceite da semântica de sinal 0,22.

### 13.3 Alternativas testadas (mesmos ticks; `tests\09_*`, 18 sessões, 20 variantes; `tests\10_*`, 44 sessões 03/08–06/10, com stops do motor, 27 variantes)
Famílias: limiar fixo menor · normalização dinâmica sem teto · janela móvel de tempo (15/30/60) · EMA razão (10/30) · reset periódico (2 h/4 h) · reset por volume · razão local por volume (3k/10k/30k) · z-score (sessão, janela 10/15/30/60/120, EMA 5/10/20/30/60), com e sem sinal.
44 sessões (N | por sessão | p90 gap | gaps > 4 h / > 8 h | 18–20h ET | CV horário | horas sem entrada | máx/mín P(força dado alinhado) | RTH):
- SEM_FORCE: 6516 | 148,1 | 20 min | 3 / 3 | 7 % | 0,56 | 0 | 1,0 | 3356
- BASE/P-RTH1: 341 | 7,8 | 13,3 h | 52 / 44 | 56 % | 1,60 | 7 | 405 mil | 0
- P-GCAP: 612 | 13,9 | 3,9 h | 61 / 42 | 31 % | 0,84 | 0 | 17,1 | 160
- **Z janela 30 min + sinal (θ 3,454):** 859 | 19,5 | 3,1 h | 56 / 15 | 9 % | 0,50 | 0 | 2,0 | 419 · fora da amostra (28 sessões): 20,7 por sessão, CV horário 0,48, 18–20h 9 %.
PnL com stops troca de sinal entre metades em todas as variantes ⇒ não é critério (descritivo). Gaps > 4 h não caem no giro igualado; > 8 h caem de 42–44 para 15.

### 13.4 Especificação aprovada (DESIGN A)
Passo 4 novo, por símbolo: z = Σ(lado·vol) / √Σ(vol²) em janela móvel de 30 min, sem reset de sessão; aprova se sinal(z) = direção e |z| ≥ θ nos dois símbolos (θ 3,454 na calibração de 16 sessões para 17,5 entradas/sessão). Passos 1–3, ME/MVI, motor, cooldown, histerese, saídas, stops e proteções inalterados. Arquivos previstos: `AoTapeEngine.cs` (baldes de 1 s de delta e vol²), `AoMarketDataPublisher.cs`, `AlfaOmegaSharedState.cs` (campos + passo 4), bridge só leitura.

### 13.5 PATCH_STATUS = NOT_STARTED (design aprovado; nenhuma linha de C# escrita). NT8_MAIN_CHANGED = NO · ORDERS 0 · F5 0.

### 13.6 EXACT_NEXT_STEP
1. Staging fora do NT8 (cópia de `scratch 19ed00ed\oliver_postimport` ou novo `snapshot_oliver.ps1`): implementar 13.4; validade do dado no molde do `AoPressSessao` (buraco > 300 s na janela = inválido = gate fechado; reconstrução por ticks históricos na carga).
2. Compilar com `oliver-main-pgcap-20261007\tools\compile_oliver.ps1` (0 erros) · harness de equivalência C# × `tools\alt2.js` (mesmos ticks, mesmo veredito) · replay completo 44 sessões.
3. JEV DIFF (pergunta: o diff implementa exatamente a especificação 13.4 e nada mais?) ⇒ se A, montar import zip OLIVER + rollback. Importação só pelo operador.
4. Fechar lacunas do JEV: validação em runtime/playback; aceite explícito do operador para o gate passar a exigir sinal.

## 14. FORCA_JANELA_30 — IMPLEMENTADO EM STAGING, JEV DIFF A, PACOTE OLIVER PRONTO (sessão 6b86565f, 2026-10-08)
**STATUS = READY_FOR_OPERATOR_IMPORT.** NT8 principal NÃO alterado (só leitura de 3 arquivos para o backup) · ORDERS 0 · F5 0. Pasta `W` = `Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\invictus-temporal-clustering-audit-20261008`.

### 14.1 Implementação (3 arquivos, +143 / −12 linhas; `W\tests\Z30_STAGING.diff`; gerador `W\tools\apply_z30.js`; `W\staging\{before,after}`)
| Arquivo (`Indicators\TTW_DarkProjects\`) | SHA256 antes (= instalado) | SHA256 depois | Mudança |
|---|---|---|---|
| `AlfaOmegaSharedState.cs` | cb1dc884… | 70ba382f… | classe pura `AoForcaJanela` (1800 baldes de 1 s; `Tick`, `ViradaSessao`, `MarcarLocal`, `Ler`, `Avaliar`) · campos `Forca_ES/NQ` · `AoGate.ForcaZMin = 3.454` · sobrecarga `EsNq(minForce, freshSec, now)` · passo 4 = sinal(z) = direção e abs(z) ≥ ForcaZMin nos dois; mensagens "forca fraca …" mantidas |
| `AoTapeEngine.cs` | 845700b9… | 7e2a1c38… | alimenta a janela em todo negócio (ao vivo e Backfill) e avisa a virada de sessão |
| `AoMarketDataPublisher.cs` | c7e23175… | 19452fcb… | `PublicarForca` com eleição própria (chave símbolo + sufixo Z); `Encerrar` libera o posto |

UNEXPECTED_CHANGED_FILES = 0 (474 arquivos). Inalterados: Robo 32c84685 · RoboFontes 172a758a · RoboMotor ecfe8f9c · AuthV2 4a64c54e · AoLicenca 9887afe9 · AoLogin 83268d92 · AoControlCenter e4d935d9 · AoPressSessao 097279c8. Press/PressVol/LimiarForca seguem compilados e publicados como telemetria, sem decidir.

### 14.2 Provas
- **Compile** (oráculo Roslyn, bin oficial 8.1.8.2 extraído, Program Files não carregado): 464/464, fontes ausentes 0, **erros 0** (`tests\COMPILE_Z30_AFTER.json`).
- **Harness C# × replay** (`harness\Z30Driver.cs` + `run_z30_harness.ps1`; fontes reais do staging: SharedState, TapeEngine, PressSessao, RoboMotor; 73,9 milhões de negócios reais; `tests\11_harness_cs_vs_replay_z30.txt`): 182 160 passos · anchor 100,000000 % · passos 1–3 100 % · direção 100 % · MAX_NUMERIC_ERROR z ES 1,8e-15 / NQ 8,9e-16 · GATE_MISMATCH 0 / 0 · ANCHOR_MISMATCH 0 · entradas do motor C# real 860 = modelo JS 860 (860 no mesmo timestamp).
- **Casos sintéticos no C# real:** 18/18 PASS (`tests\HARNESS_Z30_CASES.json`) — fail-closed sem publicador / janela não coberta / medida velha / buraco > 300 s; pausa de virada aceita nas duas ordens; sinal contrário reprova; passos 1 e 3 intactos.
- **Replay 44 sessões (motor C# real):** 860 entradas · 19,5/sessão · clusters 374 · gap mediano 30 min · p90 3,1 h · máx. 27,7 h · gaps > 2 h / 4 h / 8 h = 170 / 56 / 15 · overnight 440 · RTH 420 · 18–20h ET 9,3 % · horas sem entrada 0 · CV horário 0,50 · consistência de direção 100 % · PnL descritivo com stops reais +16,3/trade, acerto 44 % (826 anchor_neutro, 22 trailing NQ, 11 hard stop NQ, 1 trailing ES).
  Referências: BASE/P-RTH1 341 · 7,8 · p90 13,3 h · 52 / 44 · 56 % · RTH 0 — P-GCAP 612 · 13,9 · p90 3,9 h · 61 / 42 · 31 % · RTH 160 — SEM_FORCE 6516 · 148,1/sessão.
- **JEV DIFF = A · prob. 0,93 (conf 0,91) · req_01a11b953e517b13b2bab1bad0b833f1** — fidelidade 1,96/2 · seletividade 1,85/2 · risco de regressão baixo 1,96/2. Itens residuais apontados (não bloqueantes): validação em runtime 0,62 · observabilidade no bridge 0,26.

### 14.3 Pacote OLIVER (`W\build\`; `tests\BUILD_Z30_ZIPS.json`)
- **OLIVER_IMPORT_ZIP** = `AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_import.zip` · SHA256 **7230586bc22f281dccf1d3804aac9df59b526fa3dcacd2fedddc8a18300cd0a7** · 4 entradas: Info.xml + os 3 arquivos acima (cada entrada == staging\after). Sem Auth/Login/Licença/DLL/config.
- **ROLLBACK_ZIP** = `AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_ROLLBACK_import.zip` · SHA256 **16497feeead5f38835bc43c8ee83ced6817ec1d1fa38cbb9d840f4ad1e500b37** · Info.xml + os 3 instalados hoje (cb1dc884 / 845700b9 / c7e23175).
- Backup versionado: `W\backup\20261008-095559\` + SHA256SUMS.txt (== instalado no momento).
- Roundtrip em cópia: import sobre o snapshot instalado == árvore do staging (474 arquivos, 3 alterados); rollback por cima == snapshot pré-import.
- Hash NORMALIZADO para conferir depois do import (o NT8 reescreve BOM/fim de linha): SharedState dc57b9a9cba61c2e · TapeEngine 7bc6e19f0212f3df · Publisher d5b37d4023fe76d4 (sem BOM, CRLF→LF, sem quebra de linha final; `tests\Z30_NORMALIZED_SHA.txt`).

### 14.4 Comportamentos novos que o operador vai ver
1. Depois de carregar o NT8 (ou de um buraco de tape > 300 s) o passo de força só volta a valer quando a janela de 30 min estiver coberta; os ticks históricos da carga contam. Pode haver até 30 min de "forca fraca" após reiniciar.
2. A medida é publicada pelo Control Center (eleição própria). Sem Control Center carregado o gate fecha por força.
3. O bridge `:5151` não expõe z; o campo `block` continua derivado do estado do Press e pode rotular FORCE_BELOW_MIN / PRESS_NOT_VALID um bloqueio que agora é do z. `press`/`pressState` seguem publicados como telemetria.
4. Giro esperado ~19,5 entradas/sessão (P-GCAP 13,9), entradas distribuídas por todas as horas; gaps > 4 h continuam existindo.

### 14.5 EXACT_NEXT_STEP = OPERATOR_STOP_FLAT_IMPORT_VALIDATION
1. Operador: robô em STOP, FLAT, sem ordens working ⇒ Tools > Import > `AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_import.zip` (compila sozinho, sem F5) ⇒ avisar "IMPORT FEITO". Não dar PLAY antes da verificação.
2. Claude (somente leitura): hash normalizado dos 3 instalados == 14.3; Robo/AuthV2/AoLicenca/AoLogin == originais; log NT8 sem erro de compilação; snapshot + oráculo de compilação pós-import; bridge/audit: o anchor volta a avaliar de forma coerente depois que a janela cobrir.
3. Fechar as lacunas do JEV: observar o runtime por uma sessão (incluindo a virada das 18:00 ET) com o coletor passivo; JEV FINAL antes de liberar PLAY.
4. Rollback, se necessário: importar o zip ROLLBACK (mesmo procedimento).

## 15. PÓS-IMPORT FORCA_JANELA_30 (sessão 6b86565f, 2026-10-08 13:05Z) — **NÃO PRONTO PARA PLAY: falta reiniciar o NT8**
Operador: STOP 13:00:35Z (v54) ⇒ "IMPORT FEITO" (NT8: "importou com êxito todos os scripts"). Claude: só leitura. ORDERS 0 · F5 0.

- **Arquivos instalados × staging aprovado:** conteúdo 3/3 idêntico (hash normalizado SharedState dc57b9a9cba61c2e · TapeEngine 7bc6e19f0212f3df · Publisher d5b37d4023fe76d4). Raw: Publisher 19452fcb = staging; SharedState 49c43777 e TapeEngine 59e168d8 diferem do staging só por 1 byte (fim de linha final reescrito pelo import do NT8).
- **UNEXPECTED_CHANGED_FILES = 0:** snapshot pós-import (474 arquivos, `scratch\oliver_post_z30`) × snapshot pré-import: mudaram exatamente os 3.
- **Compilação real do NT8:** `NinjaTrader.Custom.dll` gravado 10:02:29 BRT, contém `AoForcaJanela` e `ForcaZMin`; log/trace do NT8 sem erro de compilação. Oráculo sobre a árvore instalada: 464/464, 0 erros (`W\tests\COMPILE_Z30_POSTIMPORT.json`).
- **Preservados (raw):** AuthV2 4a64c54e · AoLicenca 9887afe9 · AoLogin 83268d92 · Robo 32c84685 · RoboFontes 172a758a · RoboMotor ecfe8f9c · AoControlCenter e4d935d9 · AoPressSessao 097279c8.
- **ACHADO BLOQUEANTE (runtime):** o import recarregou os AddOns no assembly novo (audit `engine_stop` 13:02:29Z / `engine_start` 13:02:31Z; `AoBasicEntryBoleta` Terminated→Active), mas os indicadores dos gráficos NÃO foram recarregados: nenhum `AoControlCenter.OnStateChange` depois das 10:02 BRT (o mesmo painel segue em `State=Realtime`). Resultado: o robô novo lê um `SharedState` sem publicador — audit desde 13:02:31Z: `source_readiness` NOT_READY, tape ES/NQ UNDEFINED, "nenhum publicador eleito"; âncora local do motor = **"sem tape ES/NQ"** em todos os ticks. O gate está fechado no passo 1 (fail-closed): nenhuma entrada é possível, motor FLAT, sem risco. A medida FORCA_JANELA_30 está compilada mas **ainda não está sendo alimentada/publicada**.
- O bridge `:5151` que ainda responde com Press/ME/MVI é a leitura do barramento antigo (indicadores no assembly anterior); não serve de prova do código novo. A coleta `data\bridge_5151.csv` a partir de 13:02Z deve ser lida com essa ressalva.
- **OPERATOR_ACTION necessária:** fechar e reabrir o NinjaTrader (mesmo procedimento do import P-GCAP, reinício 00:05 BRT), mantendo o robô em STOP. Sem F5. Depois avisar "NT8 REINICIADO".
- **Verificação após o reinício (Claude, só leitura):** audit `source_readiness_ready` com tape/spot ES/NQ READY e publicador eleito; âncora local do motor deixa de ser "sem tape"; `AoControlCenter.OnStateChange` novo no `alfaomega_erros.log`; até 30 min de "forca fraca" enquanto a janela cobre (ticks históricos da carga contam); log NT8 sem erros; licença/login OK. Só então NEXT = OPERATOR_PLAY.
- Rollback disponível: `AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_ROLLBACK_import.zip` (16497fee…), também seguido de reinício do NT8.

- **Leitura 13:19Z (após "NT8 REINICIADO"):** reinício NÃO confirmado — processo NinjaTrader PID 12752 com StartTime 2026-10-08 00:05:26 BRT (o mesmo de antes do import); nenhum log/trace novo do NT8 depois das 09:51 BRT; último `engine_start` 13:02:31Z; último `AoControlCenter.OnStateChange` = 00:43 BRT (antes do import); âncora local do motor segue "sem tape ES/NQ" (13:18:40Z). Robô em STOP v54. Bloqueio inalterado: o NT8 precisa ser fechado e reaberto. ORDERS 0 · F5 0.

## 16. PÓS-REINÍCIO FORCA_JANELA_30 (sessão 6b86565f, 2026-10-08 13:25Z) — **RUNTIME NOVO CARREGADO · NEXT = OPERATOR_PLAY**
Somente leitura. ORDERS 0 · F5 0. Robô em STOP v54 durante toda a verificação.

- **Boot real:** processo NinjaTrader novo, PID 30300, StartTime 2026-10-08 10:23:04 BRT (anterior: PID 12752, 00:05:26). `log.20261008.00002.txt` "Session Break" 10:23:07; workspace 'ALFA  OMEGA' 10:23:58; conexão Connected 10:24:48. `NinjaTrader.Custom.dll` = o compilado no import (10:02:29, contém `AoForcaJanela`/`ForcaZMin`); este processo só conhece o código novo.
- **Indicadores recarregados:** `alfaomega_erros.log` — `AoControlCenter.OnStateChange` SetDefaults → Configure → DataLoaded → Historical → Transition → Realtime (10:24:04–10:24:24 e demais instâncias até 10:25:06); `AoControlCenter.tape: series de tape: ES=ES 12-26 · NQ=NQ 12-26` (é o caminho que instancia AoTapeEngine/AoMarketDataPublisher); marcos `AoPress` às 10:24:49 emitidos pelo AoMarketDataPublisher novo.
- **Eleição/publicação:** audit `source_readiness_ready` 13:24:50.836Z — READY, local_market_data_ready=true; tape ES READY 0,7 s · tape NQ READY 0,2 s · spot ES/NQ READY · publicador #3 eleito. Ecossistema: GexBot :3457 READY, AOT :3600 READY, SpotGamma :3500 OFFLINE — todos hard=false (api_ecosystem_ready=false sem efeito).
- **Âncora:** 13:24:48Z "sem tape ES/NQ" (boot) → 13:25:09Z **"forca fraca ES/NQ" com strength 4** (passos 1–3 aprovados, passo 4 novo reprovando). Bridge 13:25:30Z: "NQ indefinido".
- **FORCA_JANELA_30 — warm-up esperado:** o histórico do gráfico termina no volume da carga da madrugada (marcos AoPress 10:24:49: ES vol 41111 / NQ 31641, "buraco > 300 s entre o historico e o tempo real"); pelo desenho, esse buraco reinicia a cobertura da janela no primeiro negócio ao vivo (≈ 10:24:24–10:24:49 BRT). A medida fica indisponível (gate fechado por força, fail-closed) até a janela de 30 min cobrir: **≈ 10:55 BRT (13:55Z)**. Depois disso o passo 4 passa a decidir por z. O Press segue só como telemetria (o código do passo 4 não o lê).
- **Limite da observação:** o z não é exposto em log/bridge; a prova direta de z válido será a primeira âncora OK (ou a primeira entrada) depois do warm-up. Não há como distinguir, só pelo texto "forca fraca", janela não coberta de z abaixo do limiar.
- **Erros:** log NT8 novo sem linha de erro; trace: só o aviso interno "SQLite error (17) database schema has changed" do próprio NT8 no boot e linhas de status de conexão com errorCode=NoError; `alfaomega_erros.log` desde o boot: 0 `[erro]`, 0 exceções, 0 menções a AoForcaJanela. Compilação: 0 erros (DLL do import + oráculo pós-import 464/464).
- **Preservados (raw, relidos 13:25Z):** AuthV2 4a64c54e · AoLicenca 9887afe9 · AoLogin 83268d92 · Robo 32c84685 · RoboFontes 172a758a. Instalados: SharedState 49c43777 · TapeEngine 59e168d8 · Publisher 19452fcb (= staging por conteúdo). UNEXPECTED_CHANGED_FILES = 0.
- **Proteções no boot:** boot_protection_check pernas_no_boot=2 (resíduo 09-26 pré-existente), ilegiveis 0, alertas 0; prontidão: 6 ativos com conta disponível, block_reason OPERATIONAL_STOP (só o STOP impede execução).
- **FINAL_VERDICT = FORCA_JANELA_30_RUNTIME_LOADED_WARMUP.** PLAY liberado ao operador. Pendências não bloqueantes (JEV): observar a primeira âncora OK / primeira entrada com o gate novo e uma virada de sessão (18:00 ET); bridge sem z.

- **PLAY confirmado (leitura 13:29:34Z):** `operacional.json` play=true v55 desde 2026-10-08T13:29:15.797Z (AoControlCenter, ADM@OLIVER); audit `robo_play` 13:29:15.797Z; prontidão 13:29:17Z PLAY com execution_ready=true nos 6 ativos. Motor FLAT, armed=true, exec_bloqueia_entrada=false. Âncoras locais 13:24:48–13:29:33Z: forca fraca ES/NQ ×6 (strength 4), NQ indefinido ×2, ES indefinido ×1, indefinidos ×1, divergentes ×1; aprovadas 0; entradas 0 (warm-up da janela até ≈ 13:55Z). Erros 0. Vigia passivo armado (primeira âncora LONG/SHORT, entrada, engine_stop, perda de prontidão).

- **Primeira evidência material do gate novo (leitura 13:38:50Z):** ciclos do motor com strength 4 (passos 1–3 aprovados) desde o boot = 11 (13:25:09Z–13:37:19Z): 9 com "forca fraca ES/NQ" e **2 com "forca fraca ES" (13:34:58.040Z e 13:37:19.625Z)** — só o ES reprovado ⇒ o NQ foi APROVADO no passo 4. No mesmo instante o bridge mostrava ES e NQ com ME/MVI = +1 e Press NQ = −0,00258 (13:34:25Z), −0,00060 (13:37:05Z), −0,00063 (13:37:26Z): módulo 5 a 50 vezes abaixo de qualquer limiar de Press (0,03 fixo; P-GCAP ≥ 0,013). Pelo gate antigo o NQ não poderia passar ⇒ o passo 4 em vigor é o z-score, a janela do NQ está VÁLIDA e z_NQ ≥ +3,454 no sentido da direção. A validade veio antes da estimativa de 13:55Z: a janela foi coberta pelo histórico da carga (a estimativa assumia o buraco visto numa das instâncias do Control Center). ES: reprovado nesses ciclos; z_ES NÃO COMPROVÁVEL por leitura (z não exposto; o tick db do NT8 só é gravado na carga, último arquivo 10:25 BRT). Âncora 4/4 aprovada: 0. Entradas: 0. Motor FLAT, PLAY v55, fontes READY (RTH). Erros 0.

- **JEV RUNTIME T1 (13:44Z) · req_01a11bc0f21c7654a87751e479625cc4:** suficiência para auditar o ES agora = **B (não ainda) 0,99**; estado de prova = PARCIAL 1,00; critério de disparo = T60 (0,31; T30/T81/T120 0,18 cada — confiança baixa 0,15). Base: runtime 13:24:48–13:42:11Z = 39 ciclos, 13 chegaram ao passo 4 (NQ aprovado 2, ES 0, ambos 0); modelo 44 sessões no RTH: P(ES aprova) 27,6 % por passo alinhado, espera até a próxima aprovação ES mediana 7 min / p90 36 / p99 81; âncora 4/4 mediana 36 min / p90 134; P(ES nunca aprova) em janela de 12 / 30 / 60 / 120 min = 42,6 / 19,6 / 5,7 / 0,1 % (`tests
_wait_distribution_rth.txt`, tool `wait_dist.js`). Regra adotada: auditoria somente leitura do ES se não houver nenhuma aprovação do ES até 14:55Z (60 min após o fim do aquecimento mais conservador, 13:55Z), havendo alinhamento no período.

## 17. PRIMEIRA ÂNCORA 4/4 E PRIMEIRA ENTRADA REAL COM FORCA_JANELA_30 (sessão 6b86565f, leitura 2026-10-08 13:50:31Z)
Somente leitura. Executor: 0 ordens criadas/alteradas/canceladas · F5 0 · nenhum parâmetro alterado.

- **Timestamp:** 2026-10-08T13:49:49.676Z = 09:49:49 ET (10:49:49 BRT) · **sessão RTH** · 26 min após o boot do runtime novo (13:23:04Z) e 20 min após o PLAY (13:29:15Z).
- **Âncora:** `{"dir":"LONG","strength":4,"why":null}` — primeira âncora aprovada do gate novo. Decisão nativa do motor (`fonte nt8_native_decision`, `reason anchor_4_4`, seq 9, trade_id f411ddf4-dca0-406f-aa45-2645abc3fb07). Direção LONG; preço de decisão ES 7832,75 · NQ 31232; hard stop de decisão ES 7812,75 · NQ 31182.
- **Passo 4 pelo z, não pelo Press:** leitura do barramento 4 s antes (13:49:46Z): ES e NQ com ME/MVI = +1, Press ES −0,00082 · Press NQ −0,00076 (PRESS_VALID). Pelo gate antigo (0,03 fixo, ou ≥ 0,013 no P-GCAP) nenhum dos dois passaria ⇒ ES e NQ foram aprovados pelo z-score (janela do ES válida; z_ES e z_NQ ≥ +3,454 com direção LONG). **ES_STEP4_PASS = comprovado.**
- **gate_check:** result `pass` · engine_play PASS · turno POSITIVA (RTH 09:49 ET) · source_readiness POSITIVA (READY; local true; api_ecosystem_ready=false) · licença POSITIVA ("LICENCA ativa").
- **Fontes no instante:** tape ES/NQ e spot ES/NQ READY (0,1 s) · GexBot :3457 READY (59,7 s) · AOT :3600 READY (51,1 s) · **SpotGamma :3500 OFFLINE** — todos hard=false; a entrada ocorreu com o ecossistema de API parcial (sem hard gate / veto de API).
- **Ordens (todas pelo robô, 6 `place_ok`, 0 `place_fail`, 0 `account_skip`):** conta Sim 001: ES 12-26 buy 1 · NQ 12-26 buy 1 — conta real TAKEPROFIT (nº mascarado ***210): MES 12-26 buy 3 · MNQ 12-26 buy 2 — conta Sim 002: NES 12-26 buy 5 · NNQ 12-26 buy 5. Stops de 20 pt (família ES) e 50 pt (família NQ).
- **Proteções:** 6 `bracket_ok` (Stop + Take OCO criados no 1º fill com a qty executada): ES fill 7833 stop 7812,75 take 7893 · NES fill 7833,5 stop 7812,5 take 7893,5 · MES fill 7833 stop 7812,75 take 7893 · NQ fill 31232,5 stop 31182 take 31382,5 · NNQ fill 31232 stop 31182 take 31382 (ajuste de qty 1→5 `protecao_ajuste_ok`) · MNQ fill 31231,75 stop 31182 take 31381,75. order_state: SUBMITTED 18 · ACCEPTED 18 · WORKING 14 · FILLED 6 · PART_FILLED 1.
- **Motor depois da entrada:** 13:50:10Z âncora "forca fraca ES" (transitório, não fecha), side LONG, P&L de decisão −165; 13:50:31Z "ES indefinido" (transitório), side LONG, P&L de decisão −525 (ES 7830,25 · NQ 31212). Posição ABERTA no momento da leitura.
- **Contagem desde o boot (até 13:50:31Z):** ciclos que chegaram ao passo 4: forca fraca ES/NQ 11 · forca fraca ES (NQ aprovado) 7+ · âncora 4/4 aprovada 1 · entradas 1.
- **Warnings/erros:** `place_fail` 0 · alertas 0 · erros 0. AOT de referência estava FLAT/NEUTRO ("ES x NQ divergentes", estado de 13:48:58Z) — só telemetria. Bridge rotulou o instante como FORCE_BELOW_MIN (campo `block` derivado do Press, ressalva já registrada).
- **T60:** não atingido; auditoria do ES NÃO disparada (ES aprovado antes do critério).

### 17.1 Fechamento da primeira entrada (leitura 2026-10-08 13:51:43Z)
- **Saída:** 13:50:51.583Z · motivo `anchor_neutro` (âncora "ES x NQ divergentes", NEUTRO não transitório ⇒ regra canônica de saída) · duração da decisão 62 s · P&L de decisão (escala E-mini) ES −62,50 · NQ −325,00 · total −387,50.
- **Execução da saída:** 4 pernas Sim FLAT no mesmo ciclo (`flatten_ok`); as 2 pernas da conta real TAKEPROFIT (MES x3, MNQ x2) saíram como `flatten_sent sent:unverified`, com `trade_closed` às 13:50:52.349Z (MES) e 13:50:55.839Z (MNQ); retry de verificação 13:51:12Z (`flatten_wait`) e confirmação 13:51:33Z (`exec_desvio desvio:ja_fechada`). `trade_lifecycle`: EXIT_DECIDED → EXIT_PARTIAL (4/6) → **CLOSED 13:51:33.148Z** ("todas as 6 pernas FLAT confirmadas + fills de saída cobrem os de entrada").
- **P&L executado (descritivo, `trade_ledger_closed`, pnl_status ok):** total **−566,65 USD** nas 6 pernas — ES Sim −7,50 · NES Sim −50,00 · NQ Sim −37,50 · NNQ Sim −174,00 · **conta real: MES −26,25 · MNQ −68,00 (= −94,25)**.
- **Proteções:** os 6 brackets Stop+Take foram cancelados na saída (order_state CANCELLED 2 por instrumento); prontidão 13:51:00Z: 6 ativos flat, execution_ready=true; `robo-alertas.json` alerts=[]; `motor-canonico.json` side FLAT.
- **Bloqueio de entrada durante a saída (por desenho):** `exec_block_entrada` exit_pending de 13:51:12Z a 13:51:33Z; no ciclo 13:51:33.148Z a âncora voltou a LONG 4/4 e o motor NÃO reabriu (exit_pending + histerese armed=false + cooldown até 13:51:51.583Z).
- **Falhas:** `place_fail` 0 · `flatten_fail` 0 · `take_escort_fail` 0 · alertas 0 · erros 0. PLAY segue ativo (v55).
- Uma entrada não avalia a qualidade do gate: o P&L é descritivo e não é critério (JEV DESIGN).

### 17.2 Entradas 2 e 3 e falha de ajuste do take na conta real (leitura 2026-10-08 14:26:56Z)
- **Entrada 2:** 14:07:47.729Z LONG, RTH, âncora 4/4 (seq 10, trade_id d944105e-c0ba-4bc1-b300-ce76a91732ee), gate_check pass; saída 14:15:14.930Z por anchor_neutro (447 s); CLOSED 14:15:56.555Z com as 6 pernas FLAT; P&L executado **+50,55 USD**.
- **Entrada 3:** 14:24:42.624Z LONG, RTH, âncora 4/4 (seq 11, trade_id 09d20468-e532-463b-81e3-928d4d38f2a5), gate_check pass; 6 `place_ok`, 6 `bracket_ok`; ABERTA na leitura (P&L de decisão +432,50 às 14:26:24Z; âncora "ES indefinido", transitória, às 14:26:45Z).
- **Evento que acionou o vigia — `take_escort_fail` (MNQ 12-26, conta real TAKEPROFIT ***210), 14:26:04Z e 14:26:24Z:** ao subir o TAKE de 31466,75 para 31479,25 (degrau 0→1 com lucro do motor ≥ 250 USD/perna), o robô procurou a ordem pelo id interno `0ffaff1a…` e a corretora a conhece por `674389780929` ⇒ `ORDER_NOT_FOUND`. O take NÃO foi movido e permanece no nível original. **Proteção da perna real intacta** (log do NT8, 11:24:43 BRT): Stop Market 31267 qty 2 Working + Limite 31466,75 qty 2 Working, mesmo OCO.
- **Mesmo instante, contas Sim:** `take_escort` OK em NQ (Sim 001) e NNQ (Sim 002); em seguida `protecao_reprotegida` (critical:reprotegida, regra W2 "stops ativos 1, takes ativos 0" durante a alteração) cancelou o resto e recriou o bracket nas duas — posições seguiram protegidas.
- **PRÉ-EXISTENTE, não é regressão da FORCA_JANELA_30:** o audit de outubro já tinha `take_escort_fail` ORDER_NOT_FOUND na mesma conta real em 06/10 (12) e 07/10 (5) e ORDER_NOT_ACTIVE em 01/10 (17); `protecao_reprotegida` em 05, 06 e 07/10. O código de proteção/escolta do take (AlfaOmegaRobo*.cs) não foi tocado (hash igual). Com o gate novo há entradas no RTH com lucro suficiente para acionar a escolta, então o defeito aparece mais vezes.
- **Efeito prático:** na conta real o take não acompanha os degraus (fica em +150 pt NQ / +60 pt ES do fill); a saída continua valendo pelas regras do motor (anchor_neutro, hard stop, trailing) e pelo bracket original.
- Executor: nenhuma intervenção · 0 ordens manuais · F5 0. Alertas do robô: 0.

### 17.3 Alerta de price feed e entradas 3 e 4 (leitura 2026-10-08 14:32:33Z)
- **Entrada 3** fechada 14:28:26.756Z por anchor_neutro (224 s); CLOSED 14:29:08.643Z, 6 pernas FLAT; P&L executado **+663,55 USD**.
- **Entrada 4:** 14:30:50.356Z LONG, RTH, âncora 4/4 (seq 12, trade_id b0218e44-4181-43f6-bc93-6f6d72a12a74); saída 14:31:52.932Z por anchor_neutro (63 s). Conta real FLAT pelo log do NT8: MES 11:31:53.662 BRT, MNQ 11:31:57.237 BRT; brackets cancelados. Confirmação interna do robô (EXIT_PARTIAL → CLOSED) ainda pendente na leitura.
- **Evento que acionou o vigia — `robo_alerta` critical price_feed_disconnected, 14:32:06.247Z:** o NT8 registrou "Price feed=Connection lost" às 11:32:06.092 BRT e "Price feed=Connected" às 11:32:08.076 BRT (2 s; conexão primária permaneceu Connected). O robô emitiu o alerta para a conta real com "pernas_abertas 2" (as 2 pernas reais ainda em verificação de saída) e o limpou às 14:32:08.301Z (`alerta_limpo true`; `robo-alertas.json` alerts=[]). No instante do corte a conta real já estava FLAT havia 9–13 s. Sem ordem, sem perda de proteção, sem intervenção do executor.
- Origem: provedor de dados/conexão; sem relação com o gate. Fontes locais seguem READY; bridge 14:32:34Z tapeLive=true.
- Placar do gate novo até 14:32Z: 4 entradas em RTH (13:49:49Z −566,65 · 14:07:47Z +50,55 · 14:24:42Z +663,55 · 14:30:50Z pendente), todas LONG, todas saídas por anchor_neutro; place_fail 0 · flatten_fail 0 · hard stop 0.

## 18. INCIDENTE CRÍTICO — CONTA REAL INVERTIDA E SEM PROTEÇÃO (leitura 2026-10-08 16:26:55Z)
- **Estado (log do NT8, última linha de posição):** conta real TAKEPROFIT ***210 **SHORT 3 MES 12-26 @ 7836,75** (desde 13:24:01.648 BRT) e **SHORT 2 MNQ 12-26 @ 31252,25** (desde 13:24:06.135 BRT). Nenhuma ordem working nessa conta depois disso (Stop e Take cancelados). Motor do robô FLAT; posição não intencional e sem bracket. Spot 16:26:39Z: ES 7835,50 · NQ 31250,25.
- **Robô:** `broker_internal_divergence` critical 16:24:16Z ("perna LONG 3x × conta SHORT 3x em MES", "perna LONG 2x × conta SHORT 2x em MNQ" — "nenhuma ordem automatica (nunca inverter); perna em falha"); `trade_lifecycle` EXIT_FAILED_RETRY nos trades 6108a7a7… e d8cf6d8c…; `flatten_fail` critical a cada ~20 s (32 até 16:26:55Z); prontidão 16:24:10Z: MES/MNQ POSITION_GUARD; `exec_bloqueia_entrada`=true (exit_pending) ⇒ sem novas entradas. `robo-alertas.json` NÃO registrou alerta (alerts=[]).
- **Sequência (audit + log NT8):** entrada 6 LONG 16:17:23.688Z; saída por `trailing_stop_nq` 16:18:27.758Z com REENTRADA IMEDIATA no mesmo ciclo (entrada 7, regra do motor para trailing com 4/4). As pernas reais da entrada 6 ficaram `flatten_sent sent:unverified`. Na saída da entrada 7 (anchor_neutro, 16:23:54.834Z) o robô reenviou o flatten das pernas da entrada 6 E enviou o das pernas da entrada 7: MES vendeu 3 às 13:23:55 BRT (conta FLAT) e vendeu 3 de novo às 13:24:01 (conta SHORT 3); MNQ vendeu 2 às 13:23:58 (FLAT) e 2 de novo às 13:24:06 (SHORT 2). Saída em dobro ⇒ inversão.
- **Origem:** camada de execução/saída na conta real (verificação de flatten + reentrada imediata), arquivos NÃO alterados pela FORCA_JANELA_30 (AlfaOmegaRobo.cs 32c84685). O gate novo gerou a sequência trailing + reentrada que expôs o defeito. Causa raiz NÃO auditada ainda.
- **Executor:** nenhuma ordem, nenhuma alteração, F5 0. Ação necessária é do OPERADOR (zerar manualmente MES e MNQ na conta real e decidir STOP).

## CRITICAL_EXECUTION_INCIDENT_20261008
Auditoria causal SOMENTE LEITURA (sessão 6b86565f, 2026-10-08 ~16:45Z). Nenhum patch · executor: 0 ordens, F5 0, nenhuma alteração. Estado: **robô STOP** (`operacional.json` play=false v56 desde 16:40:19.220Z, AoControlCenter) · conta real FLAT (prontidão 16:40:20Z "flat em MES/MNQ"; operador zerou às 16:40:12Z: MES coberto a 7830, MNQ a 31223,25) · **SAFE_TO_PLAY com conta real = NO**.

### Cronologia provada (audit do robô × log de ordens/execuções/posições do NT8)
| UTC | Fato |
|---|---|
| 16:17:23.688 | Entrada 6 LONG (trade_id 6108a7a7-da48-4a01-a90b-e946a619c607). Conta real: compra 3 MES 7838,75 e 2 MNQ 31249; Stop+Take criados. |
| 16:18:27.758 | Motor fecha a entrada 6 por `trailing_stop_nq` e reabre LONG no MESMO ciclo (entrada 7, trade_id d8cf6d8c-5fc7-4184-8cd6-61137c694be3). `exec_bloqueia_entrada` ainda false nesse ciclo (true só em 16:18:47). |
| 16:18:28.585 / 16:18:32.513 | Corretora executa as ordens `…161723|X`: MES vende 3 a 7838 (conta FLAT) · MNQ vende 2 a 31249 (conta FLAT). O rastreador de ordens do robô registra FILLED (latência 0,58 s). |
| 16:18:27.758 (registro) | Robô grava `flatten_sent sent:unverified` nas 2 pernas reais; `x_estado` = "Initialized". Pernas Sim: `flatten_ok` imediato. `trade_lifecycle` 6108a7a7: EXIT_PARTIAL (4/6). |
| 16:18:36 | Entrada 7 na conta real: compra 3 MES 7838,75 e 2 MNQ 31251,5; novo bracket. Registro passa a ter 2 pernas LONG por instrumento na mesma conta. |
| 16:18:47 → 16:23:34 | 15 ciclos com o motor LONG: nenhuma reverificação das pernas da entrada 6 (0 `flatten_wait`, 0 `exec_desvio`). |
| 16:23:54.834 | Motor fecha a entrada 7 (`anchor_neutro`). Decisões gravadas, mesma leitura de conta: perna 161723 MES "Fechar 3 — conta LONG 3x" · perna 161827 MES "CancelarEFechar 3 — conta LONG 3x"; idem MNQ com 2. |
| 16:23:55.129 / 16:24:01.617 | MES vende 3 a 7836,75 (FLAT) e vende mais 3 (SHORT 3 @ 7836,75). |
| 16:23:58.189 / 16:24:06.081 | MNQ vende 2 a 31255,25 (FLAT) e vende mais 2 a 31252,25 (SHORT 2 @ 31252,25). |
| 16:24:16.726 | `broker_internal_divergence` ×4 ("perna LONG × conta SHORT — nenhuma ordem automatica (nunca inverter)"); trades EXIT_FAILED_RETRY; `flatten_fail` a cada ~20 s (188 no dia); POSITION_GUARD; entradas bloqueadas. `robo-alertas.json` sem alerta. |
| 16:40:12 | Operador zera manualmente (ordens "Zerar"). 16:40:19 STOP. |

### Mecanismo no código (lido em `scratch\oliver_post_z30\AddOns`, não alterado)
1. `AlfaOmegaRobo.cs` l.1596–1611 `EsperarFilled(ntAcc, orderId, 3000)`: procura a ordem de fechamento pelo `orderId` interno devolvido no envio. Na conta real a ordem existe na corretora com outro id numérico (ex.: interno `bb1b08f6…` × corretora `674389781092`); a busca devolve "Initialized" ⇒ `flatten_sent sent:unverified`, perna não marcada `fechada`.
2. `AlfaOmegaRoboSaida.cs` `Decidir`, regra 2: fechamento já enviado que não está FILLED nem ativo ("rejeitada/cancelada/nao encontrada") ⇒ cai para nova tentativa; regra 3: conta com posição no MESMO lado ⇒ `Fechar min(qty, conta)`.
3. `AlfaOmegaRobo.cs` l.686–689: `flatten_retry` só roda com `!m.TemPosicao`; com o motor posicionado as saídas pendentes não são relidas.
4. `AlfaOmegaRobo.cs` l.1430–1436: leitura de posição "uma vez, antes do laço" para todas as pernas; duas pernas da mesma conta/instrumento usam a mesma leitura.
5. `AlfaOmegaRobo.cs` l.668–684: no mesmo ciclo, `ExecutarSaida` e em seguida `ProcessarOpenNativo` (reentrada do motor após trailing com 4/4).
6. `RevalidarClose` l.1541–1572: lado oposto ⇒ BROKER_INTERNAL_DIVERGENCE, nenhuma ordem (por desenho); sem escrita em `robo-alertas.json`.

### Avaliação por fator
- DOUBLE_FLATTEN_CAUSAL = YES (causa imediata: 2 vendas para 1 posição).
- REENTRY_CAUSAL = YES (condição necessária: reabertura no mesmo ciclo, mesma conta/instrumento/lado).
- SENT_UNVERIFIED_CAUSAL = YES (causa raiz segundo o JEV: a perna fechada continua registrada como aberta).
- BROKER_ACK_CAUSAL = NO para a corretora (ACK e fill em 0,6 s) · YES para a leitura do ACK pelo robô (id interno × id da corretora).
- POSITION_RECONCILIATION_CAUSAL = YES (leitura única no laço; posição da entrada nova atribuída à perna antiga).
- EXIT_STATE_MACHINE_CAUSAL = YES (reverificação só com motor sem posição; bloqueio por saída pendente vale um ciclo depois).
- ORDER_OWNERSHIP_CAUSAL = YES (propriedade por conta/instrumento/lado, não por trade).
- OTHER_CAUSE = FORCA_JANELA_30 é gatilho, não causa (arquivos de execução com o mesmo hash); divergência crítica não gera alerta.

### Histórico (audit setembro + outubro)
- Conta real: `flatten_ok` imediato = 0 em todos os dias; `flatten_sent` não verificado = 26 (06/10) · 4 (07/10) · 16 (08/10). Contas Sim: centenas de `flatten_ok`.
- Reabertura no mesmo ciclo da saída: 14/09 ×3 (só Sim) · 08/10 ×1.
- `broker_internal_divergence`: 06/10 ×2 (11:34:23Z, legs 112215: trailing + reabertura no lado OPOSTO; regra "nunca inverter" evitou dano) · 08/10 ×4 (este incidente, reabertura no MESMO lado).
- EXIT_FAILED_RETRY: só 08/10 (2 trades). `flatten_fail` real: 06/10 ×2 · 08/10 ×188. Posição invertida comprovada: só 08/10.
- `take_escort_fail` ORDER_NOT_FOUND na conta real (mesma classe de id): 06/10 ×29 · 07/10 ×17 · 08/10 ×8.

### BLAST_RADIUS
Somente a conta real TAKEPROFIT (nas Sim a perna sai do registro na hora) · MES e MNQ igualmente · qualquer motivo de saída deixa a perna real não verificada · o dano exige nova entrada na mesma conta/instrumento/lado antes da reverificação · caminho determinístico: saída por trailing stop com âncora 4/4 (reabre no mesmo ciclo e no mesmo lado em decisão nativa).

### JEV INCIDENT T1 · req_01a11c682b8d719f8b4468d1fc3537c0 (jev-1.13.0)
- Resposta operacional = **A** (causa comprovada; manter STOP e corrigir antes de novo PLAY) · prob. 0,78 · conf 0,71 (B 0,17 · C 0,04).
- Causa raiz primária = **VERIFICACAO_ID** 0,94 (conf 0,93).
- Se houver PLAY antes da correção: **SO_SIM** 0,88 (PLAY só com contas Sim, ativos da conta real desligados); NENHUMA 0,12; conta real sob vigia 0,00.
- Gate: defeito PRÉ-EXISTENTE exposto pela FORCA_JANELA_30 = 1,00 (não reverter o gate por isso).
- Arquivos: `W\JEV_INCIDENT_T1_{INPUT.txt,QUESTIONS.json,RESULT.json}`.

### Não provado
Por que a lista de ordens da conta real mantém o id interno em "Initialized" (adaptador `AlfaOmegaTrader` não lido); se há outra via além de trailing + reabertura no mesmo lado; estado atual do registro `motor-execucoes.json` das 4 pernas em falha após o zeramento manual.

### PATCH_STATUS = NOT_STARTED
Pontos candidatos para o JEV decidir depois (não é proposta escolhida): verificação do fechamento por nome da ordem/id da corretora; reverificação de saídas pendentes também com o motor posicionado; leitura de posição por perna (ou abatimento por conta/instrumento) no laço de saída; bloquear reentrada enquanto houver perna não verificada na mesma conta/instrumento; alerta em `robo-alertas.json` na divergência. Qualquer patch exige JEV DESIGN/DIFF.

### EXACT_NEXT_STEP
1. Manter STOP. Não dar PLAY com a conta real.
2. Decisão do operador: (a) abrir o desenho da correção (dossiê + JEV); (b) se quiser operar antes disso, só contas Sim (JEV 0,88) — exige desligar MES/MNQ da conta real nos ativos, ação do operador.
3. Antes de qualquer PLAY: conferir, só leitura, o registro `alfaomega-robo\state\motor-execucoes.json` (pernas 161723/161827) e o estado EXIT_FAILED_RETRY dos trades 6108a7a7 e d8cf6d8c.
4. Pendente: concluir a auditoria de comportamento da FORCA_JANELA_30 (dados em `W\tests\13_runtime_audit_since_play.txt`; JEV não enviado).

## EXIT_LAYER_FIX_DESIGN_20261008 (sessão 6b86565f, ~17:00Z) — desenho escolhido pelo JEV, aprovação para staging AINDA NÃO concedida
Somente leitura + consultas ao JEV. Nenhum código escrito. Robô STOP · conta real FLAT · SAFE_TO_PLAY_REAL = NO · PATCH_STATUS = NOT_STARTED.

### Lacunas fechadas
1. **Por que "Initialized":** `AlfaOmegaTrader.cs` — `PlaceCore` (l.1110–1125) cria a ordem, faz `Submit` e devolve `ord.OrderId` lido naquele instante; `OrdersJson` (l.992–1025) lista `a.Orders` emitindo o `OrderId` ATUAL de cada ordem. Na conta real o NT8 troca o id inicial pelo id da corretora depois do envio (resposta do envio `bb1b08f6…` × log do NT8 e rastreador de ordens `674389781092` para a MESMA ordem de nome `…161723|X`); nas Sim o id não muda. `EsperarFilled` (Robo.cs l.1596–1611) procura pelo id inicial por 3 s, guarda o último estado visto antes da troca ("Initialized") e o devolve. O NOME da ordem é estável e único por perna/tipo (entrada, `|S`, `|T`, `|X`) e já é usado para achar stop/take e pelo rastreador (FILLED em 0,58 s). Mesma origem do `take_escort_fail ORDER_NOT_FOUND` (`ChangeCore` procura por `orderId`, l.1245–1260).
2. **Outras vias de dano (código):** via 1 (ocorrida) trailing 4/4 + reabertura no mesmo ciclo e lado — o bloqueio `BloqueiaEntrada` (exit_pending) é avaliado antes do `Tick` do motor e não cobre a reabertura decidida dentro do mesmo ciclo. Via 2 (não observada): com o motor FLAT, `flatten_retry` de perna real não verificada cai em "nova tentativa" (`Decidir` regra 2) e, se a conta tiver posição no mesmo lado/instrumento que não é do robô (manual, cópia), fecha essa posição alheia. Via 3 (não observada): reinício/recarga com perna não verificada persistida — mesma regra. Via 4 (06/10, sem dano): reabertura no lado oposto ⇒ "nunca inverter" bloqueia. Saídas comuns: cooldown 60 s + bloqueio por saída pendente cobrem a janela de 20–40 s. **OTHER_DAMAGE_PATH_FOUND = YES (vias 2 e 3, só em código).**

### Consultas ao JEV (jev-1.13.0)
| Rodada | request_id | Resultado |
|---|---|---|
| T1 | req_01a11c70a9487c11b1bdcde7a716a6d4 | desenho D3 = A+B+C 0,54 (D4 0,29 · D5 0,12) · confirmação por evento de ordem/execução casado por NOME, lista por nome como reforço 0,82 · propriedade por saldo próprio da perna 0,98 · reentrada: pular só a conta/instrumento 0,97 · retry só após terminal 0,76 · corretora FLAT: fechar perna sem ordem 0,53 (outro 0,39) · lado oposto: sem ordem + alerta + bloqueio, sem STOP automático 0,60 (com STOP 0,38) · alerta em divergência/falha/prazo 0,95 · aprovação **B 0,73** |
| T2 | req_01a11c714b91776e93d517ada0cf6656 | especificação consolidada A+B+C+D+E: aprovação **B 0,91** · item: reduzir para D3, retirando reentrada e alerta 0,54 · take em pacote separado 0,83 · evidência com conta FLAT: evento por nome OU duas leituras 1,00 · prazo de alerta 60 s 1,00 |
| T3 | req_01a11c71d37772f5ad4bedbf27576128 | desenho final **X2 = D3 + alerta crítico, sem política de reentrada** 0,92 · I4 atendido pelo saldo por perna 0,96 · risco residual baixo 1,71/2 · aprovação **B 0,77** |
| T4 | req_01a11c72472a787eadd4d8070b61b996 | item faltante: especificação em nível de código 0,38 (outro 0,33 · nada 0,23) · próximo passo: **dossiê de detalhe e novo JEV DESIGN antes de escrever código 0,92** |

### Desenho selecionado (X2) — direção fixada, detalhe pendente
- **Confirmação:** fechamento confirmado por evento de ordem/execução da conta casado pelo NOME da ordem de fechamento; lista de ordens por nome como reforço e recuperação; o id devolvido no envio deixa de ser usado para verificar.
- **Propriedade:** saldo próprio por perna = executado na entrada − executado nas saídas (fechamento do robô, stop ou take da própria perna), por nome de ordem; saldo zero ⇒ perna sai do registro e não volta.
- **Quantidade a fechar:** no máximo min(saldo da perna, posição da conta no mesmo lado), com abatimento dentro do laço (a soma por conta/instrumento nunca passa da posição lida).
- **Reverificação:** saídas pendentes reavaliadas em todo ciclo, com o motor posicionado ou não.
- **Retry:** novo fechamento só com o anterior comprovadamente rejeitado/cancelado e saldo > 0; estado desconhecido ou ativo ⇒ nenhuma ordem.
- **Reentrada:** sem bloqueio novo (I4 atendido pelo saldo por perna).
- **Corretora FLAT:** nunca enviar fechamento; perna encerrada por evento de execução por nome OU duas leituras independentes de conta FLAT; cancela só a proteção da própria perna.
- **Corretora no lado oposto:** nenhuma ordem automática; entradas bloqueadas; alerta crítico; sem STOP automático.
- **Alerta crítico (`robo-alertas.json`):** divergência, falha de saída, fechamento não confirmado por mais de 60 s.
- **Escopo:** só saída, registro de pernas e alerta. Motor, FORCA_JANELA_30, entradas, bracket, identidade/licença intocados. Ajuste do take: pacote separado.

### Invariantes (operador) × desenho
I1 nunca inverter conta FLAT (limite pela posição + abatimento) · I2 posição agregada nunca atribuída a duas pernas (abatimento no laço + saldo por perna) · I3 perna confirmada não volta (saldo zero sai do registro) · I4 atendido pelo saldo por perna, sem bloqueio de reentrada (JEV 0,96) · I5 corretora prevalece (limite pela posição; FLAT nunca recebe ordem) · I6 alerta crítico incluído · I7 mesmo código para Sim e real · I8 gate intocado.

### Matriz de teste exigida (harness offline com o código real do staging; depois conta Sim)
Reprodução do incidente (LONG → saída → reentrada no mesmo ciclo → saída) · trailing stop · anchor_neutro · saída comum sem reentrada · confirmação rápida · atrasada (> 3 s) · evento de execução perdido · execução parcial · estado da ordem não encontrado · corretora já FLAT · corretora no lado oposto · MES · MNQ · conta com troca de id (real) e sem troca (Sim) · retry · reinício com perna pendente · posição alheia no mesmo lado. Cada caso verifica I1–I8.

### JEV_DESIGN_DECISION = B (não aprovado ainda para staging) · PATCH_STATUS = NOT_STARTED
### EXACT_NEXT_STEP
1. Dossiê de detalhe (só leitura do código atual): funções a alterar e fluxo (`ExecutarSaida`, `AoRoboSaida.Decidir`, `RevalidarClose`, `EsperarFilled`, registro `_execucoes`/`motor-execucoes.json`, rastreador de ordens/`OrderUpdate`/`ExecutionUpdate`, rotina de alertas); estrutura e persistência do saldo por perna; recuperação após reinício; comportamento com evento perdido/atrasado.
2. JEV DESIGN T5 sobre o dossiê ⇒ só com A: implementar em staging + harness da matriz ⇒ JEV DIFF ⇒ pacote OLIVER + rollback ⇒ importação manual.
3. Conta real em STOP até lá. Pendente em paralelo: JEV da auditoria de comportamento temporal da FORCA_JANELA_30.

## EXIT_LAYER_FIX_DESIGN_T5_20261008 — especificação em nível de código APROVADA para staging (sessão 6b86565f, ~17:20Z)
Somente leitura + JEV. Nenhum código escrito. Robô STOP · conta real FLAT · SAFE_TO_PLAY_REAL = NO · PATCH_STATUS = NOT_STARTED.

- **Dossiê:** `W\DOSSIER_EXIT_LAYER_FIX_X2_20261008.md` (cópia em `handoffs/invictus-temporal-clustering-audit/`). Contém: causa do id "Initialized", vias de dano classificadas, 7 alterações com FILE/FUNCTION/CURRENT/REQUIRED/STATE/INVARIANT/RISK, modelo de estado da perna, 9 casos de reinício, algoritmos, matriz T01–T27, procedimento de rollout dos packs.
- **JEV DESIGN T5 = A · prob. 0,93 (conf 0,91) · req_01a11c78e1cc70948150ca238dacc7d6** — completude 1,89/2 · minimalidade 1,45/2 (conf baixa 0,19) · risco de regressão MODERADO 1,07/2 · ponto residual apontado: a parte de `ExecutarSaida` que fala com o NinjaTrader fica fora do harness e precisa de teste adicional definido (0,69; nenhum 0,17).
- **Achado que reduz o escopo:** o saldo por perna deriva de estado já existente e persistido — `AoRoboFechamento._fills` (execuções por `intentId` com nome da ordem, alimentado por `OnExecucao`, gravado em `state\motor-fechamentos.json`). Nenhum campo persistido novo; nenhuma migração.
- **Alterações (3 arquivos):** C1 `AlfaOmegaRoboFechamento.cs` novo `SaldoPerna` (puro) · C2 `AlfaOmegaRoboSaida.cs` `Decidir` (sobrecarga com saldo/posição disponível; fechamento por NOME; estado desconhecido nunca reenvia) + função pura nova `PlanejarSaidas` · C3 `AlfaOmegaRobo.cs` `ExecutarSaida` (posição disponível por conta/instrumento/lado com abatimento no laço; `soPendentes`) · C4 `RevalidarClose` (min(saldo, disponível)) · C5 `MotorPasso` l.686–689 (reverificação em todo ciclo, só pernas com fechamento já enviado) · C6 alertas via `AoRoboAlertas` (`broker_divergence`, `flatten_fail`, `close_unconfirmed` > 60 s) · C7 `EsperarFilled` → confirmação por saldo/nome.
- **Não mudam:** `AlfaOmegaTrader.cs`, `AlfaOmegaRoboMotor.cs`, `AlfaOmegaSharedState.cs`/`AoTapeEngine.cs`/`AoMarketDataPublisher.cs` (FORCA_JANELA_30), entradas, proteção, escolta do take (pacote separado), identidade/licença.
- **ORDER_ID_INITIALIZED_CAUSE:** `PlaceCore` devolve o `OrderId` lido no envio; `OrdersJson` emite o `OrderId` atual; na conta real o NT8 troca o id (bb1b08f6… → 674389781092); `EsperarFilled` procura o id inicial e devolve o último estado visto. Não provado: o instante exato da troca dentro do NT8.
- **OTHER_DAMAGE_PATHS:** trailing + reabertura mesmo ciclo/lado PROVEN · lado oposto PROVEN sem dano · `flatten_retry` com posição alheia POSSIBLE · reinício com perna não verificada POSSIBLE · saída comum/anchor_neutro + nova entrada NOT_FOUND · stop/take executado NOT_FOUND · retry após rejeição NOT_FOUND.

### EXACT_NEXT_STEP = IMPLEMENT_STAGING_ONLY (aguardando retorno do operador/ChatGPT; não iniciado)
1. Staging fora do NT8: cópia da árvore instalada (snapshot novo por `snapshot_oliver.ps1`, conferir hashes) + C1–C7; SHA256 antes/depois; inesperados 0.
2. Harness com as peças puras reais: T01 primeiro contra o código ATUAL (reproduzir a inversão), depois T01–T27 no staging.
3. Fechar o ponto residual do T5: definir e executar teste do executor (`ExecutarSaida` real) — por exemplo em conta Sim com o NT8 isolado — antes do JEV DIFF.
4. Compile (oráculo 464 itens) → JEV DIFF → pacote OLIVER + rollback → importação manual → validação.
5. Depois: rollout dos demais packs conforme dossiê §F (inventário, classificação por hash, patch só nos AFFECTED, sem distribuição automática).
6. Pendente em paralelo: JEV da auditoria de comportamento temporal da FORCA_JANELA_30.

## EXIT_LAYER_FIX_STAGING_20261008 — implementação SOMENTE em staging · JEV DIFF T1 = B (teste em NT8 real exigido) · pacote OLIVER NÃO gerado (sessão 6b86565f)
Nada instalado. Robô STOP · conta real FLAT · NT8 principal NÃO alterado · packs alterados 0 · nenhuma ordem · SAFE_TO_PLAY_REAL = NO.

- **Staging (fora do NT8):** `W\staging_exit\before|after\AddOns` · gerador `W\tools\apply_exitfix.js` (substituições exatas; aborta se âncora não bate) · diff `W\tests\EXITFIX_STAGING.diff` (+370/−45).
  - `AlfaOmegaRobo.cs` 32c84685d1381e6bfd8d10156dea9de38f01acdd002aa5ab4ace3128c69060c6 → f678d200fe4ca7e9b8f6211d6436eb86dac2838f4422cee23d8791b79041298e
  - `AlfaOmegaRoboFechamento.cs` c061880c962cfbaa1b563f983ed24bd1ad4622c523993228c46ad10506b30163 → a1fc99a8cce2bbbcbe1428b545ec2efc15355c571919e23f1843945347d7774d
  - `AlfaOmegaRoboSaida.cs` ca59088d38c798544f9fe69cf92ed815db520cc1a17892b98c9718d48f574470 → 90e0020ad3187f6a360a5a661ade4e610ea16a101ff44e3538757032518eacf9
  - UNEXPECTED_CHANGED_FILES = 0 (árvore base × staging: 3 arquivos diferentes, os previstos) · FORCA_JANELA_30 idêntica ao instalado (49c43777 / 59e168d8 / 19452fcb; `W\tests\T27_FORCA_JANELA30_UNCHANGED.txt`).
  - Refino em relação ao dossiê: `EstadoFechamentoPorNome` devolve também a qty executada; fechamento `|X` Filled por NOME conta como verificação quando o evento de execução se perde (T08/R02/R04).
- **Compile:** árvore completa do staging 464/464, fontes ausentes 0, **erros 0** (`W\tests\COMPILE_EXITFIX_AFTER.json`).
- **Harness** (`W\harness\ExitDriver.cs` + `run_exit_full.ps1`: compila a árvore inteira em memória e roda o driver contra ela; corretora simulada com troca de id = modelo da conta real):
  - **BASE (código instalado) T01 = REPRODUZIU o incidente:** perna antiga pendente (2 pernas), 3 fechamentos = 9 contratos para 3+3, 1 fechamento com conta FLAT, conta final **SHORT 3** (LONG→FLAT→SHORT). Base 12/28 (`W\tests\EXIT_HARNESS_BASE.json`). No ramo base o laço do executor e o `RevalidarClose` são transcrição do fonte instalado; `AoRoboSaida.Decidir` é o real.
  - **STAGING 28/28** (`W\tests\EXIT_HARNESS_STAGING.json`) — T01–T26 + T08b + T23b; T27 PASS por hash. T01: 2 fechamentos, 6 contratos, FLAT, 0 pernas, 0 reenvios.
  - Invariantes I1–I8 PASS (0 inversão · 0 fechamento com conta FLAT/oposta · 0 fechamento de perna encerrada · soma dos fechamentos de um ciclo ≤ posição lida).
- **Ponto residual do T5 (executor real):** JEV EXECUTOR T1 `req_01a11c8d44ed7cdc885300234248a8f4` → método **M1** 0,89 (bancada fora do NT8), cenários COMPLETO 0,87, executar = B 0,42 (C 0,33 · A 0,25; confiança baixa), risco de falsa segurança do M1 = alto 0,65.
  - **Bancada M1** (`W\tools\mk_rig.js`): árvore do staging com SOMENTE 2 fontes de fronteira trocados (`AoTraderCore.cs` dublê com a mesma API estática; `AlfaOmegaRoboPositions.cs` com gancho de leitura) — `AlfaOmegaRobo.cs` do staging sem alteração (`W\tests\RIG_TREE_DIFF.txt`). `ExecutarSaida`, `EsperarFilled`, `RevalidarClose`, `TemSaidaPendenteEnviada`, `GravarExecucoes`/`CarregarExecucoes`, `FecharPernaEmDesvio`, `FecharPernaSemProtecao` REAIS por reflexão.
  - **Resultado 32/32** (`W\tests\EXIT_RIG_EXECUTOR.json`): T01–T26, T08b, T23b, R01–R04.
  - Limites: não exercita threads/eventos reais do NinjaTrader nem `OnExecucao` (execuções entregues direto ao registro).
- **JEV DIFF T1 = B 0,66 (A 0,31) · `req_01a11c94be5e775c812f9a07b54e3143`** — pendência **TESTE_NT8_REAL 0,88** (teste em NinjaTrader real, conta Sim, antes do pacote) · porta pós-import SIM_CICLO_COMPLETO 0,98 · prova do executor 0,94/2 (conf 0,13) · risco de regressão 1,39/2 (conf 0,09).
  ⇒ **OLIVER_PACKAGE_READY = NO.** Pacote oficial NÃO gerado.
- **JEV DIFF T2 `req_01a11c9547347b71a7a90e58c67dc8fd`** (como cumprir): caminho **N1** instância isolada `jevnt8test` com o operador destravando a janela de registro (0,56) · segundo **N2** zip de TESTE na própria OLIVER com conta real desmarcada e PLAY só em Sim (0,42 / segundo 1,00) · preparar zip de TESTE agora sem importar = SIM 0,91 · critério de PASS = CICLO_COMPLETO 0,99 (entrada → saída → reentrada → saída, cada fechamento verificado, 0 fechamento em dobro, FLAT ao fim, 0 alerta crítico indevido).
- **Zip de TESTE (NÃO é o pacote OLIVER; não importado):** `W\build_test\`
  - `AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_import.zip` SHA256 72c057db4353aac269115be5f9f079b288fa952402da9bbc5e14b7e84367b499
  - `AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_ROLLBACK_import.zip` SHA256 745b8651170b478fc2f328af12a7390596d4fdd0f49e875087ad99f1901d8286
  - roundtrip 4/4 entradas conferem, entradas proibidas 0, rollback = instalado agora (`W\tests\BUILD_EXITFIX_TEST_ZIPS.json`; backup `W\backup_exit_test\20261008-143543`).
- **Limites conhecidos do desenho (declarados ao JEV):** L2 ordem de fechamento que some sem rastro ⇒ robô não reenvia; posição fica aberta até o alerta de 60 s e a ação do operador (T10/T19/T26) · L3 perna sem execução de entrada registrada ⇒ saldo desconhecido, vale o teto da posição disponível · em conta Sim o id NÃO troca (o caso exato da conta real só existe em conta de corretora).

### EXACT_NEXT_STEP = OPERADOR decide o ambiente do teste em NT8 real (conta Sim)
1. N1 (preferido pelo JEV): destravar o registro na instância isolada `jevnt8test`; importar SOMENTE lá o zip de TESTE; Playback/Sim até CICLO_COMPLETO. NT8 principal intocado.
2. N2 (segundo): operador importa o zip de TESTE na OLIVER com robô em STOP e conta real DESMARCADA; PLAY só em Sim até CICLO_COMPLETO; rollback pronto.
3. Com PASS ⇒ JEV DIFF T3 ⇒ se A, gerar o pacote oficial OLIVER (mesmo conteúdo) + rollback + roundtrip.
4. Depois: `VALIDATE_OLIVER_THEN_REBUILD_ALL_AFFECTED_PACKS` (nenhum pack tocado até aqui) · correção da escolta do take em pacote separado · JEV da auditoria de comportamento da FORCA_JANELA_30 (dados em `tests\13_runtime_audit_since_play.txt`).
- **Decisão do operador (após JEV DIFF T2):** caminho N1 confirmado; N2 EXCLUÍDO. Operador vai apenas destravar o registro da instância isolada `jevnt8test`. Claude AGUARDA a frase "JEVNT8TEST LIBERADO"; até lá nenhuma importação, nada no NT8 principal/OLIVER. Depois: importar SOMENTE na instância isolada o zip de TESTE, Playback/Sim, CICLO_COMPLETO + fluxo real OrderUpdate/ExecutionUpdate ⇒ JEV DIFF T3 ⇒ só com A o pacote oficial OLIVER (retornar ao operador antes de importar).
- **Estado real da execução N1 (auditoria de histórico, ~14:45 BRT) — substitui a linha de espera acima:** N1_BLOCKED_REGISTRATION_NEVER_PASSED. Evidência: (a) nenhum registro de hoje sobre `jevnt8test` além dos escritos nesta sessão; o único procedimento existente é o de 07/10 (`HANDOFF_PRESS_RECALIBRATION_30D_20261007.md` l.77–90): `provision_isolated_nt8.ps1` + `Start-Process -Credential` com a senha DPAPI ⇒ NinjaTrader abre como `jevnt8test` e PARA na janela "NinjaTrader8 Registration" (ID + Key) do carregador `bin\Plugins\nt8_plugins.dll`, registro por usuário Windows; esse procedimento nunca passou da janela (próximo passo ficou com o operador). (b) `C:\Users\jevnt8test\Documents\NinjaTrader 8` contém só `db\` (07/10 21:16) — sem `bin\Custom`, sem workspaces: o NT8 isolado nunca chegou ao Control Center. (c) processo isolado não está rodando; único NinjaTrader = PID 30300 (ADM, principal, intocado). Reabrir a instância só reproduz a mesma janela; ID + Key não existem em nenhum arquivo do projeto e contornar o carregador é alteração de registro/licença (proibido). Nada importado; NT8 principal intocado; N2 excluído.
- **Estado canônico confirmado (~14:55 BRT):** N1_BLOCKED_REGISTRATION_NEVER_PASSED. Regras: sem bypass, sem copiar/reutilizar chave, sem alterar o carregador; ID/Key NUNCA informados ao chat. Portão de decisão do operador: (a) POSSUI legitimamente ID + Key ⇒ Claude abre `jevnt8test` pelo procedimento de 07/10, traz a janela à frente, operador digita; depois N1 (isolamento → zip de TESTE → Playback/Sim → CICLO_COMPLETO → OrderUpdate/ExecutionUpdate reais → JEV DIFF T3). (b) NÃO possui ⇒ N3 (NinjaTrader oficial em VM/outra máquina, só Sim/Playback, só o zip de TESTE, mesmo CICLO_COMPLETO, depois JEV DIFF T3). N3 não inicia sem a escolha do operador. N2 excluído; OLIVER intocada; staging preservado.
- **CORREÇÃO DE PREMISSA + AUDITORIA mãe × `jevnt8test` (~15:10 BRT; somente leitura):** as linhas acima que dizem "exige ID + Key do operador" ficam CORRIGIDAS assim: a janela "NinjaTrader8 Registration" NÃO é licença do NinjaTrader. Evidência já existente (`HANDOFF_PRESS_RECALIBRATION_30D_20261007.md` l.86–89, `press-recalibration-20261007\physical\PLUGIN_AUDIT.json`): em Program Files (instalação compartilhada) a biblioteca de proteção original do NT8 foi substituída por um carregador de terceiros sem assinatura (`NT8Loader`, original renomeado ao lado) que carrega `bin\Plugins\nt8_plugins.dll` (empacotado, sem assinatura; fornecedor desconhecido; sem relação com o projeto). A janela é a ativação DESSE carregador, por usuário Windows: ADM ativado, `jevnt8test` não. Provisionamento de 07/10 (`provision_isolated_nt8.ps1`): usuário local novo + perfil próprio + só dados de Playback e zips; nenhum estado per-user do ADM copiado, por desenho ⇒ não há erro de provisionamento; a diferença é só o estado de ativação do carregador. Passar da janela = ativar o carregador para o 2º usuário ou levar o estado do ADM = estender um contorno de licença ⇒ Claude NÃO faz nem investiga onde o estado fica (mesma recusa de 07/10, independente do JEV). REGISTRATION_IS_LICENSE_PROVEN = NO · N1_RECOVERABLE = NO (por meio legítimo nesta instalação) · gatilho exato dentro da DLL NÃO provado (binário empacotado, não analisado). **JEV ROUTE T1 `req_01a11c9fa0dc74f3820f4b9abc7bd325`:** rota **R1** NinjaTrader OFICIAL em ambiente limpo (VM/outra máquina), Sim/Playback, só o zip de TESTE (0,88, conf 0,84) · segunda R2 manter STOP (1,00) · reconsiderar N2 0,10 · dispensar o teste 0,00 · encerrar N1 = SIM 0,61 (conf 0,22). EXACT_NEXT_STEP: operador providencia ambiente limpo com NT8 oficial (instalador do fabricante) ⇒ importar lá o zip de TESTE ⇒ CICLO_COMPLETO + OrderUpdate/ExecutionUpdate reais ⇒ JEV DIFF T3. Até lá robô em STOP. Nada executado nesta rodada; OLIVER intocada.
- **R1 — auditoria curta do host (~15:25 BRT, somente leitura): R1_ENVIRONMENT_FOUND = NO ⇒ PARADO.** Windows 11 Home; Hyper-V ausente (serviço vmms inexistente, Get-VM indisponível); VirtualBox/VMware/Windows Sandbox ausentes; WSL = Ubuntu-24.04 + docker-desktop (Linux, não roda NT8); únicos discos virtuais = LDPlayer (emulador Android). Usuários locais: ADM, jevnt8test (N1 encerrado), CodexSandboxOffline/Online, perfil magnumbrokeroficial — nenhum com NT8 próprio. Única instalação NinjaTrader = `C:\Program Files\NinjaTrader 8` 8.1.8.1 (a da OLIVER, com o carregador); único processo = PID 30300 (ADM). Histórico confirma: `HANDOFF_PACK_INVICTUS_NATIVE_POINTER_20261006.md` l.42 CLEAN_PC_ENVIRONMENT = NOT_AVAILABLE; `HANDOFF_PRESS_RECALIBRATION_30D_20261007.md` l.72. O bin oficial extraído no scratchpad (`msiexec /a` do MSI oficial) é só referência de compilação, não é ambiente instalado. Requisito físico ausente: uma máquina ou VM Windows SEPARADA com NinjaTrader 8 do instalador oficial, login NinjaTrader do operador em modo Sim/Playback, sem conta real. Nada importado; nada executado; OLIVER intocada; JEV DIFF T3 não submetido. EXACT_NEXT_STEP: operador providencia esse ambiente (R1) ou mantém STOP (R2, segunda do JEV ROUTE T1).

## EXIT_LAYER_FIX_FINAL_GATE_20261008 — decisão de simplificação do operador + JEV GATE T1 = B (~15:40 BRT)
- **Restrição do operador:** NO_NEW_ENVIRONMENT · NO_VM · NO_OTHER_MACHINE · FINISH_WITH_EXISTING_MACHINE · SIMPLICITY_PRIORITY alta. R1 (ambiente limpo) e N1 ficam ENCERRADOS. N2 deixa de estar excluído apenas na forma decidida abaixo pelo JEV e só depois da revisão do procedimento pelo ChatGPT/operador.
- **JEV GATE T1 `req_01a11ca5380570cd90aa0d7a8d1e3018`:** porta = **B 0,71** (A 0,28 · C 0,00 · D 0,01; conf 0,61) — falta somente um teste Sim na própria OLIVER, conta real excluída, ANTES do pacote oficial · evidência suficiente para gerar o pacote agora = NÃO 0,63 (conf 0,25) · ciclo completo em Sim obrigatório antes de qualquer conta real = SIM 1,00 · primeiro uso em conta real depois = operador presente + quantidade mínima + primeira saída e reentrada acompanhadas + STOP a qualquer alerta 0,66 (não liberar 0,27) · risco residual de importar com robô em STOP, conta real excluída e rollback pronto = 1,47/2 (moderado→baixo; conf 0,21).
- **Nada executado.** OLIVER intocada · import 0 · packs 0 · SAFE_TO_PLAY_REAL = NO.

### PROCEDIMENTO MÍNIMO PROPOSTO (aguarda revisão; NÃO executar antes)
Artefatos: `W\build_test\AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_import.zip` SHA256 72c057db4353aac269115be5f9f079b288fa952402da9bbc5e14b7e84367b499 · rollback `…_ROLLBACK_import.zip` SHA256 745b8651170b478fc2f328af12a7390596d4fdd0f49e875087ad99f1901d8286.
0. **Pré-condições (Claude, somente leitura):** robô STOP; conta real FLAT e sem ordens ativas; os 3 arquivos instalados = hashes base (32c84685 / c061880c / ca59088d); SHA dos dois zips confere.
1. **Operador:** na seleção de contas do robô, deixar SOMENTE uma conta Sim; conta real desmarcada. **CopyEngine desligado ou sem a conta real como seguidora** (senão uma ordem Sim pode ser replicada na conta real).
2. **Claude (somente leitura):** confirmar nos arquivos de configuração/estado que nenhuma conta real está habilitada para o robô nem como seguidora do CopyEngine. Se não conseguir provar ⇒ PARAR.
3. **Operador:** importar o zip de TESTE pelo menu do NinjaTrader (compilação da própria importação; sem F5 do Claude) e REINICIAR o NinjaTrader de verdade (lição da FORCA_JANELA_30: sem reinício os indicadores não recarregam).
4. **Claude (somente leitura):** 3 arquivos instalados = hashes do staging (f678d200 / a1fc99a8 / 90e0020a); FORCA_JANELA_30 e arquivos de identidade/licença inalterados; PID novo; robô ainda STOP; conta real fora.
5. **Operador:** PLAY com a conta Sim apenas.
6. **Claude (observação passiva, sem ordens):** até o CICLO_COMPLETO — entrada → saída → reentrada → saída. Em cada saída verificar no audit e em `state\motor-fechamentos.json`: execução `|X` registrada pelo evento real de execução; fechamento confirmado (flatten_ok por saldo/nome); nenhuma perna antiga pendente; nenhum segundo fechamento; posição da conta Sim FLAT ao fim; 0 alerta crítico (`broker_divergence`, `flatten_fail`, `close_unconfirmed`); 0 ordem na conta real.
7. **Operador:** STOP ao fim do ciclo.
8. **Claude:** JEV DIFF T3 com a evidência. Só com A: pacote OFICIAL OLIVER (mesmo conteúdo já instalado) + rollback + SHA256 + roundtrip, e retorno antes de qualquer conta real.
- **Aborto/rollback (qualquer etapa):** alerta crítico, ordem na conta real, fechamento em dobro ou posição invertida ⇒ operador dá STOP, zera a conta Sim manualmente, importa o zip de ROLLBACK e reinicia; Claude confere os 3 hashes base.
- **Limites que o teste Sim NÃO fecha:** em conta Sim o id da ordem não é trocado (gatilho do incidente só existe em conta de corretora — coberto só por simulação: base T01, staging 29/29, bancada 32/32). A reentrada "no mesmo ciclo" depende do mercado (saída por trailing com força 4/4); o critério do JEV é o ciclo entrada → saída → reentrada → saída. As entradas são orgânicas: o ciclo pode levar horas de pregão.
- **Depois (já definido):** primeiro uso em conta real só com operador presente e quantidade mínima (JEV) · `VALIDATE_OLIVER_THEN_REBUILD_ALL_AFFECTED_PACKS` · escolta do take em pacote separado.

### PORTA B — pré-checagens e decisão de Playback (~16:00 BRT; somente leitura; nada importado)
- **Pré-checagens (PASS):** robô STOP (`config\operacional.json` play=false v56, 16:40:19Z) · 3 arquivos instalados = hashes base (32c84685 / c061880c / ca59088d) · zips de TESTE e ROLLBACK presentes com os SHA registrados · registro de execuções do robô sem perna ativa (só 2 legados NES/NNQ fora de gestão) · alertas ativos 0 · `robo-prontidao.json`: conta real FLAT em MES e MNQ.
- **Contas do robô (fonte `config\ativos.json` v183):** ES e NQ → conta Sim `sim001` (qty 1) · **MES (qty 3) e MNQ (qty 2) → conta REAL TAKEPROFIT***210, enabled=true** · NES/NNQ legado → Sim. ⇒ **REAL_ACCOUNT_EXCLUDED = NO no estado atual.**
- **CopyEngine:** `config\copy.json` on=false desde 2026-10-05T21:54Z (interruptor mestre desligado) ⇒ nenhuma réplica para conta real enquanto ficar assim. (606 vínculos existem em disco; inativos com o mestre desligado.)
- **Playback determinístico: NÃO disponível.** Ticks em disco de ES/NQ 12-26 vão só até o arquivo 11:00 UTC de 08/10 (janela do incidente 16:17–16:24Z não gravada); sem dados de Market Replay para 12-26; ciclo do robô, cooldown, checagem de dado fresco e trailing usam relógio real (só a janela de 30 min usa a hora do tick) ⇒ em Playback acelerado a sequência não se reproduz, em 1x leva o mesmo tempo do ao vivo; Playback na OLIVER exige desconectar a corretora; robô nunca rodou em Playback nesta máquina.
- **JEV PLAYBACK T1 `req_01a11ca974497f128d8ca4e7e00747d1`:** Playback = **NO 1,00** ⇒ mercado ao vivo, robô só em conta Sim, ciclo orgânico em pregão regular · isolamento = **DESLIGAR_MES_MNQ 1,00** (únicos ativos mapeados para a conta real; ES/NQ já em Sim) · ciclo suficiente = entrada → saída → nova entrada → saída com cada fechamento verificado, mesmo sem reentrada no mesmo ciclo (0,66; exigir mesmo ciclo 0,34; conf 0,31).
- **PARADO antes da importação.** Motivos: (1) o isolamento ainda não é verdadeiro (MES/MNQ ligados na conta real) e a mudança é parâmetro do robô ao vivo, feita pelo Control Center; (2) importação e reinício do NinjaTrader são ações de interface.
- **EXACT_NEXT_STEP (uma instrução ao operador):** no Control Center desligar os ativos MES e MNQ (ES/NQ permanecem em Sim; CopyEngine permanece desligado; robô permanece em STOP) → importar `AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_import.zip` → reiniciar o NinjaTrader → avisar "IMPORT TESTE FEITO". Claude então prova por leitura: MES/MNQ enabled=false, copy on=false, PID novo, 3 hashes do staging, FORCA_JANELA_30 inalterada, STOP ⇒ libera o PLAY em Sim ⇒ observação passiva até o ciclo ⇒ STOP ⇒ JEV DIFF T3.
- **Incidente de importação do zip de TESTE (~16:20 BRT; auditoria somente leitura; nada alterado):** no diálogo Importar apareceu "Nome do arquivo — Falha catastrófica" com o breadcrumb terminando em `…\build_test\AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_import` (sem `.zip`) e lista vazia. Achados: zip existe, 92.903 bytes, SHA256 72c057db… = esperado; abre e lê as 4 entradas íntegras (`Info.xml` 130 B + `AddOns/AlfaOmegaRobo.cs`, `AlfaOmegaRoboFechamento.cs`, `AlfaOmegaRoboSaida.cs`); mesmo layout e mesmo `Info.xml` do pacote FORCA_JANELA_30 aceito hoje (entradas na raiz, sem zip dentro de zip, sem pasta raiz extra); extensão real `.zip`, assinatura PK; sem Zone.Identifier nem outro fluxo NTFS, atributo Archive; caminho 176 caracteres (o aceito tinha 172; maior caminho interno 206 contra 221 do aceito; todos < 260). Log/trace do NinjaTrader sem nenhuma linha de importação (log parado em 13:40:12, PID 30300 inalterado) ⇒ o arquivo nunca chegou ao importador. Causa: PARCIALMENTE provada — o pacote é válido e a falha ocorreu no diálogo do Windows, que ENTROU no zip como pasta compactada (breadcrumb sem `.zip`, lista vazia pelo filtro *.zip) em vez de selecioná-lo; "Falha catastrófica" é o erro genérico do Shell nessa situação. O gesto exato que fez o diálogo entrar no zip não é comprovável por log. NEW_ZIP_REQUIRED = NO. Correção = só o gesto: voltar à pasta `build_test`, UM clique no arquivo e botão Abrir (ou colar o caminho completo no campo "Nome do arquivo", não na barra de endereço).

### MISSÃO FINAL — execução parcial (~15:35–15:50 BRT; autorização DIGITADA pelo operador)
- **Fase 1 (isolamento) FEITA no arquivo:** `alfaomega-robo\config\ativos.json` v183 → **v184**: MES enabled=false, MNQ enabled=false (únicos ativos mapeados para a conta real); ES/NQ seguem ON em conta Sim; NES/NNQ são legados retirados (o código ignora `enabled`). Backup `ativos.json.bak-exitfix-simtest-20261008`. ATENÇÃO: o robô carrega esse arquivo uma única vez; a mudança só vale em memória DEPOIS do reinício do NinjaTrader — conferir em `robo-prontidao.json` antes de qualquer PLAY. CopyEngine on=false; robô play=false.
- **Fase 2 (import) EM ANDAMENTO, parada no meio:** Ferramentas > Importar > Complemento de NinjaScript aberto por UI Automation; diálogo na pasta `…\build`; item `AlfaOmega_TESTE_NAO_OFICIAL_EXITFIX_X2_import` selecionado com um clique (campo preenchido pelo próprio diálogo). Achado: com o nome SEM extensão o botão Abrir não importa (o Shell resolve o nome exibido para a pasta compactada — causa das falhas do operador, extensões ocultas); com o nome `…_import.zip` no campo + clique em Abrir o NinjaTrader aceitou o pacote e abriu a caixa "Arquivo bin\Custom\AddOns\AlfaOmegaRobo já existe no seu PC. Gostaria de substituir o arquivo existente?" (Sim / Não / Cancelar).
- **BLOQUEIO:** a ação seguinte (responder "Sim" às 3 perguntas de substituição) foi NEGADA pelo classificador de permissões do modo automático do Claude Code. Não contornado. Nenhum arquivo substituído ainda: instalados = base (32c84685 / c061880c / ca59088d). A caixa de confirmação ficou ABERTA no NinjaTrader (PID 30300).
- EXACT_NEXT_STEP: operador clica "Sim" nas 3 perguntas (AlfaOmegaRobo, AlfaOmegaRoboFechamento, AlfaOmegaRoboSaida) e confirma a mensagem final; OU libera a permissão do PowerShell para o executor. Depois: conferir hashes do staging → reinício → fase 4 (prontidão com MES/MNQ off) → PLAY só Sim → ciclo → STOP → JEV DIFF T3 → pacote oficial → packs. Reverter o isolamento ao final do teste: restaurar MES/MNQ só por decisão do operador (backup acima).
- **Pós-import (leitura, ~15:55 BRT): IMPORT OK, TRUE_RESTART = NO ⇒ PARADO antes do PLAY.** Instalados = staging: Robo f678d200… · Fechamento a1fc99a8… · Saida 90e0020a… (importação concluída pelo operador; `NinjaTrader.Custom.dll` recompilada 15:40; log sem erro de compilação). FORCA_JANELA_30 49c43777/59e168d8/19452fcb, Motor ecfe8f9c, Fontes 172a758a, Trader 07a93922, Auth 4a64c54e/9887afe9/83268d92 inalterados. Robô STOP (play=false v56) · CopyEngine off · `robo-prontidao.json` 18:40:02Z: ativos_versao 184, MES e MNQ `ASSET_DISABLED`, contas em uso só Sim (o AddOn recarregou o arquivo na recompilação) · conta real FLAT (últimos eventos 13:40:12 = zeragem do operador; nenhuma ordem depois) · alertas 0. **FALHA do item 1:** NinjaTrader continua PID 30300 iniciado 10:23:04 — NÃO foi reiniciado (mesmo caso da manhã na FORCA_JANELA_30: sem reinício real os indicadores dos gráficos ficam no assembly antigo e o robô pode ficar sem tape). EXACT_NEXT_STEP: reinício real do NinjaTrader (fechar e abrir; PID novo) ⇒ Claude repete a leitura ⇒ PLAY só Sim.
- **Reinício real FEITO (~15:45–15:47 BRT):** inspeção: PID 30300 sem diálogo pendente (o NinjaTrader simplesmente não tinha sido fechado). Fechamento gracioso pelo executor (`CloseMainWindow` no Control Center) ⇒ pergunta "Você deseja salvar espaço de trabalho ALFA  OMEGA?" (resposta dada na tela, não pelo executor) ⇒ processo encerrou (log.00002 fechado 15:45:56; NinjaTrader.exe = 0). Reaberto pelo executor pelo executável normal do atalho público ⇒ **OLD_PID 30300 → NEW_PID 32520, início 15:46:15**. **PARADO na tela "Bem-vindo!" (login do NinjaTrader: usuário + senha).** O executor não digita credenciais. Robô STOP · ativos v184 (MES/MNQ off) · CopyEngine off · hashes do staging instalados. EXACT_NEXT_STEP: operador faz o login ⇒ Claude confere (PID 32520, STOP, MES/MNQ off em memória, conta real FLAT, hashes, tape ES/NQ) ⇒ PLAY só Sim ⇒ ciclo ⇒ STOP ⇒ JEV DIFF T3.
