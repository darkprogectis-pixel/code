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
