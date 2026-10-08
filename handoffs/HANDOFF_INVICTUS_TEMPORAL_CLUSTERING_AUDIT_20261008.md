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
