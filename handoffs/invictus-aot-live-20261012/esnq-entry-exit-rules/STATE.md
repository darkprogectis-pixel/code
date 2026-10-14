# ES/NQ — NOVAS REGRAS DE ENTRADA/SAÍDA/RISCO (R1–R10) — STAGING, SEM DEPLOY — STATE (append-only)

Ordem do operador 14/10/2026 (sessão 6da2f5d6, auto mode). Escopo: motor ES/NQ, staging apenas. Proibido: produção, conta/posição LIVE, ordens reais, GC/SI/RUSSELL/HIRO internos, APIs externas.

## ETAPA PRÉ-CÓDIGO — achados (sessão 6da2f5d6, só leitura de `C:\Users\ADM\.claude\aot\`)
1. **Arquitetura de entrada atual** (`aot-sim.js` L310; robô igual, 106/106 DECISION_OPEN 4/LONG|SHORT — handoff AOT 14/10): abre só com `gate.anchor.strength===4 ∧ dir∈{LONG,SHORT} ∧ cooldownOk ∧ freshOk ∧ spots válidos` + histerese `requireFreshFourOfFour`. Entrada sempre conjunta ES+NQ (já cumpre R6).
2. **Origem de 50/70%: NÃO EXISTE no motor ES/NQ.** `strength` é contagem 0..4 de passos binários do radar (AoGate.EsNq), não percentual (item 10: 4/4 ≠ 70%). Percentuais vistos na UI: (a) hero card `conf` = `tier0.confidence` do Consolidator :3495 por ativo (só exibição); (b) `edge.value` do card v2 (ES/NQ: `multi/edge UNAVAILABLE`, aot-bff L1189); (c) `reactor_pct` × `ROBO_CFG.REACTOR_MIN` (aot-bff L3119–3224, caminho AlfaBot/robô de sinal — a confirmar se é ES/NQ). Nenhum é "% bullish/bearish por ativo" com contrato definido ⇒ **LACUNA DE CONTRATO para R1/R2/R4/R5** — o operador precisa dizer QUAL métrica é o "%" (candidatos: tier0.confidence, reactor_pct, bull_pct/bear_pct do sinal L3165). Não inventar.
3. **HIRO convergente — DEFINIDO:** `v2.<sym>.c2.confirm === 'CONFIRMA'` (`c2ForSym` aot-bff L1258 → `hiroDarkflow.hiroConfirmDarkflow(c1dir, sym, flowHiro, now, {rth})`); valores CONFIRMA | NEUTRO | DIVERGE | N/A. Para R4: exigir CONFIRMA em ES E NQ (N/A ⇒ bloqueia).
4. **P&L:** por perna `(spot − entry) × dirMul × mult × contratos(1)`; cesta = esUsd + nqUsd (`aot-sim.js` L160–175, L345). Calculado sobre spot, **sem comissão nem slippage**; exit sem preço válido ⇒ `pnlStatus exit_desconhecido`.
5. **Parâmetros atuais (`DEFAULT_PARAMS` L33–44):** 1 ES + 1 NQ · $50/pt ES, $20/pt NQ · **hardStopUsd 1000 por ativo** (20 pt ES / 50 pt NQ) · BE ao atingir +$500 · degrau $250 → stop +$250 · cooldown 60 s · requireFreshFourOfFour true. Take fixo: não existe (saída por trailing/anchor). Reentrada imediata só após trailing com 4/4.
6. **Saídas atuais (L270–300), precedência:** (1) `anchor_neutro` se dir NEUTRO e motivo NÃO transitório ("forca fraca", "sem tape", "indefinid" são transitórios ⇒ mantém) — fecha sem olhar P&L; (2) hard stop por ativo; (3) trailing por perna. Uma perna que bate stop fecha a CESTA inteira.
7. **Impacto R7/R8:** hoje NEUTRO não transitório fecha sempre. R7 (positivo ⇒ manter, proteger entrada, buscar take) é comportamento NOVO e precisa de definição de "take" (não existe) e de "proteger entrada" (= stop em BE? já existe via trailing só a partir de +$500). R8 = comportamento atual para cesta negativa. Positivo/negativo deve ser medido na cesta com spot atual (não presumir fechamento no zero).
8. **Impacto R9:** $500 por ativo / $1000 cesta = REDUZ o hard stop (1000→500 por ativo) e cria limite de cesta novo. Reduz risco (R10 permite), mas altera parâmetro homologado ⇒ JEV DIFF obrigatório.
9. **RTH:** ainda NÃO verificado nesta sessão (grep `rth` no aot-sim.js não achou gate RTH; a flag `rth` é passada ao HIRO em aot-bff). Verificar onde o robô/sim restringe RTH (native-automation.cjs / AoGate C#) antes de R5.
10. **Execução real:** o robô NT8 (`Documents/NinjaTrader 8/alfaomega-robo`, engine invictus) e `native-automation.cjs` replicam a lógica; mudanças no sim NÃO mudam o robô. O escopo staging deve ser o `aot-sim.js` (cópia em staging) + testes; porte ao C# = fase separada com F5 do operador.

## PRÓXIMO PASSO EXATO (sucessora)
a) Verificar RTH-only atual (grep `rth|RTH|session` em native-automation.cjs e aot-bff `gate`/`buildGate`) e o caminho `ROBO_CFG.REACTOR_MIN` (é ES/NQ?).
b) Escrever `DESIGN.md` nesta pasta: máquina de estados (FLAT → OPEN → PROTECTED → EXITING → COOLDOWN), precedência de saída (hard stop/limite por ativo > limite de cesta > NEUTRO negativo > trailing > NEUTRO positivo⇒PROTECTED), idempotência (1 CLOSE por trade_id).
c) Implementar em staging (cópia de `aot-sim.js`) SÓ o que está definido: R3 (já), R6 (já), R8 (atual), R9 como parâmetros ($500/ativo, $1000 cesta), R7 com "proteger entrada" = stop em BE imediato; R1/R2/R4/R5 ficam BLOQUEADOS por lacuna de contrato do "%" até o operador definir a métrica.
d) Testes determinísticos por cenário (lista da ordem) → JEV DIFF (jev-diff.mjs, loop jev-finish) → handoff + commit. Sem deploy.

## Passo a) FEITO (sessão 6da2f5d6, ~219k)
- **RTH-only:** NÃO existe restrição RTH na entrada do motor ES/NQ: `aot-sim.js` 0 ocorrências; `native-automation.cjs` 0 reais (só "birthtimeMs"). A flag `rth` em aot-bff só entra no HIRO (`c2ForSym`, `hiroConfirmGate`), em `buildGate(ao, rth)` e na confluência/RUSSELL. O robô C# tem saídas `session_close` (2 no histórico) — a conferir no `AlfaOmegaRoboEntry.cs`/AoGate antes de R5. ⇒ R5 ("fora do RTH sem HIRO") não abre janela nova no sim; só muda a exigência de HIRO.
- **`REACTOR_MIN` 65%** (aot-bff L2870–2875) = `AlfaOmegaRoboEntry.cs:51 ReactorMin` / `robo-trade/src/signal-engine.js:69` — caminho do robô de sinal reactor (robo-trade, fora do escopo e de produção protegida), **não** o motor anchor ES/NQ. É o único threshold percentual por direção encontrado; não é 50/70 e não é por ativo ES+NQ.
- Próximo passo exato: b) DESIGN.md → c) staging → d) testes + JEV DIFF (ver acima). R1/R2/R4/R5 seguem com lacuna de contrato do "%" (pergunta ao operador: qual métrica? tier0.confidence por ativo, reactor_pct, ou bull_pct/bear_pct?).

## ORDEM R2 do operador (14/10/2026, sessão 6da2f5d6 a ~229k — NÃO INICIADA; a SUCESSORA EXECUTA sem nova ordem)
Continuar sem reauditoria: (1) DESIGN.md com estados FLAT→OPEN→PROTECTED→EXITING→COOLDOWN, precedência limites protetivos × neutralização × trailing, idempotência (1 decisão de fechamento por operação); (2) verificar origem/fórmula/disponibilidade/atualização de bull_pct/bear_pct (aot-bff L3165, sinal AlfaBot) e comparar com convicção direcional 50%/70% — não adotar por semelhança de nome; (3) JEV aplicável + JEV DIFF ANTES de qualquer patch; (4) só após aprovação, cópia isolada de aot-sim.js com R7 (NEUTRO positivo ⇒ proteger entrada, sem presumir fill no zero), R8 (NEUTRO negativo ⇒ fechar já), R9 ($500/ativo, $1000 cesta, preservando proteções); (5) testes: positivos, negativos, mudança rápida do Gate, gaps, preço de entrada, custos, stops, trailing, eventos duplicados; (6) sem take-profit arbitrário (documentar lacuna); R1/R2/R4/R5 não aplicar sem métrica comprovada; sem C#/NT8/BFF/Gate/LIVE/ordens; (7) handoff + commit sem push. Resposta final = bloco CHATGPT com os campos METRICA_PERCENTUAL, DESIGN, R7, R8, R9, JEV_DIFF, IMPLEMENTACAO_STAGING, TESTES, LACUNAS, LIVE, HANDOFF, COMMIT, STATUS_FINAL, nada após o delimitador.

## DECISÃO DO OPERADOR (14/10/2026, sessão 6da2f5d6 ~233k): métrica do "%" = bull_pct / bear_pct
- Para R1/R2/R4/R5 usar `bull_pct` (LONG) / `bear_pct` (SHORT); 70% e 50% aplicam-se a essas métricas.
- A sucessora ainda VERIFICA tecnicamente, antes de codificar: origem (aot-bff L3165, `sig.bull_pct/bear_pct`), escala (0–100 ou 0–1), se existe valor SEPARADO para ES e para NQ (a regra exige os dois ativos), frequência/idade (stale ⇒ bloquear entrada). Se não houver valor por ativo ou estiver indisponível, registrar como lacuna real e não aplicar R1/R2/R4/R5.
- Fluxo inalterado: DESIGN.md → JEV DIFF → staging (cópia de aot-sim.js) → testes → handoff/commit. LIVE intocado.

## ORDEM R2 EXECUTADA (sessão fb698be1, loop `/jev-finish` jf-20261014202204-c3b423) — COMPLETE (aceito pelo CLI)
- Métrica bull_pct/bear_pct VERIFICADA: escala 0–100, um valor separado para ES e para NQ, frescor de 90 s. É um escore não calibrado: 50 ⇔ score ≥ 0, e com R3 vale na prática a partir de 58. Detalhe em `DESIGN.md` §1.
- `DESIGN.md`: estados, precedência e lacunas. Staging em `candidate/aot-sim.js`; a base é a cópia da produção em `base/`; diff em `esnq-rules.diff`.
- JEV DIFF A 0,81 `req_01a13c1460817f4f8cf613001e0e1fe4`. JEV FINAL A 0,53 `req_01a13c14f8af7e5ea506cc4be567372d`.
- Testes: `tests/esnq-rules.test.cjs` 19/19 PASS, recheck do CLI PASS.
- A produção NÃO foi alterada. O candidato com `pctRules:true` BLOQUEIA toda entrada enquanto o BFF não passar `pct`/`hiro`/`rth`. Por isso a aplicação é uma fase própria: ligação no BFF, porte para o C# e autorização do operador.
- **Próximo passo (exige ordem do operador):**
  - (a) decidir se o % é só um filtro adicional ao anchor 4/4 (implementado) ou se vira o gatilho;
  - (b) definir o take-profit, se desejado;
  - (c) autorizar a fase de ligação no BFF (`pct` = relay `signals.ES/NQ` + ts, `hiro` = `v2.<sym>.c2.confirm`, `rth`) com JEV DIFF próprio;
  - (d) depois disso, porte para o C# do robô com F5 do operador.

## DECISÃO DEFINITIVA DO OPERADOR (14/10/2026, sessão fb698be1): GATE 4/4 OBRIGATÓRIO PARA TODAS AS ENTRADAS
- Os percentuais 50/70 (bull_pct/bear_pct) são SÓ filtros adicionais. Nunca substituem nem enfraquecem o Gate existente. A lacuna 4 do DESIGN (“filtro × gatilho”) está FECHADA: o % é filtro.
- Ordem R3: preservar R7/R8/R9 em staging; preparar a ligação no BFF de bull_pct, bear_pct, HIRO e RTH; exigir Gate OPEN 4/4, ES/NQ na mesma direção, 70% nos dois ativos como regra normal; 50% nos dois só com HIRO convergente no RTH (fora do RTH sem HIRO); bloquear NEUTRO, divergência, stale, ausente e direção não confirmada; provar que nada abre com o Gate fechado; JEV DIFF antes; staging apenas; testes integrados + recheck; sem C#/NT8/LIVE/deploy; handoff + commit sem push.

## CHECKPOINT ORDEM R3 (sessão fb698be1, JEV_SOFT_STOP) — CONCLUÍDO pela sucessora e6ce8ee4 (ver §"ORDEM R3 EXECUTADA")
- **FEITO:**
  - decisão registrada (acima + handoff, sem commit);
  - base do BFF copiada da produção para `base/bff/` (aot-bff.js SHA256 prefixo 3ec88e91, hiro-darkflow-adapter.cjs b9d4ccf3) e para `candidate/bff/`;
  - fixture real do relay em `tests/fixtures/relay-3457-snapshot.json` (signals + flow_hiro; sem credenciais).
- **CANDIDATO EDITADO (ainda sem testes, sem JEV DIFF, sem commit):**
  - `candidate/aot-sim.js`:
    - `requireGateOpen:true`: a entrada exige `gateOpen===true` (= `buildGate().open`); senão bloqueia com `gate_nao_open`;
    - `tick` passa a aceitar `gateOpen`;
    - novo export puro `simEntryInputs({gex,gate,rth,hiroFor})`.
  - `candidate/bff/aot-bff.js`:
    - import de `simEntryInputs` (L57);
    - no bloco SIM (~L2327): `simIn = simEntryInputs({gex, gate, rth:t.rth, hiroFor:(sym,d)=>c2ForSym(sym,d,gex.flow_hiro,t.rth).confirm})` e `tick(Object.assign({...}, simIn))`.
  - O payload `gexbot '/'` já traz `signals` e `flow_hiro`, então não há fetch novo.
- **PRÓXIMO PASSO EXATO:**
  1. `tests/esnq-rules.test.cjs`:
     - os testes de entrada passam `gateOpen:true`;
     - a paridade passa a usar `requireGateOpen:false`;
     - o teste de API aceita o export extra `simEntryInputs`;
     - novos testes: Gate fechado com 98/98 nunca abre (sequência aleatória); `gate_nao_open` com `gateOpen` ausente.
  2. `tests/esnq-bff-integration.test.cjs`:
     - `simEntryInputs` com a fixture real + `base/bff/hiro-darkflow-adapter.cjs`;
     - verificação estática da ligação no BFF candidato;
     - `node --check candidate/bff/aot-bff.js`;
     - o diff do BFF tem só as 2 mudanças.
  3. `esnq-rules-r3.diff` + `jev-diff-proposal-esnq-rules-r3.md`.
  4. Loop `/jev-finish` novo (`finish.mjs start`) → JEV DIFF → testes pelo CLI → recheck → JEV FINAL → handoff → complete → commit sem push (inclui as edições não commitadas desta sessão).
  5. Resposta final = bloco CHATGPT da ordem R3 (GATE_4_4, FILTRO_70, FILTRO_50_RTH, FILTRO_50_FORA_RTH, BFF, JEV_DIFF, TESTES, R7_R8_R9, LIVE, HANDOFF, COMMIT, PENDENCIAS, STATUS_FINAL).
- LIVE, BFF de produção, C#, NT8 e ordens: intocados.

## ORDEM R3 EXECUTADA (sessão e6ce8ee4, loop `/jev-finish` jf-20261014203453-6f74f6) — COMPLETE (aceito pelo CLI)
- Gate OPEN 4/4 obrigatório em toda entrada (`requireGateOpen:true`, `gateOpen===true` estrito, `gate_nao_open`), avaliado após o anchor 4/4 legado e antes do filtro %; saídas não dependem do Gate. R7/R8/R9 sem mudança.
- BFF em staging: `candidate/bff/aot-bff.js` (SHA256 db797149…, base produção 3ec88e91…) — import de `simEntryInputs` + `tick(Object.assign({...}, simEntryInputs({gex, gate, rth:t.rth, hiroFor: c2ForSym(...).confirm})))`. Sem fetch novo / ordem / NT8.
- `candidate/aot-sim.js` SHA256 60aed804…. Diff: `esnq-rules-r3.diff`. Proposta: `jev-diff-proposal-esnq-rules-r3.md`. Resultado: `jev-final-result-esnq-rules-r3.md`.
- JEV DIFF A 0,92 `req_01a13c207133787aa8cb84ce19e8f605` · JEV FINAL A 0,94 `req_01a13c21025d7530a91b515944d5dddd`.
- Testes pelo CLI + recheck PASS: `esnq-rules-r3` 23/23 · `esnq-bff-integration-r3` 6/6 (fixture real do relay + adapter HIRO de produção; 5000 ticks com Gate fechado = 0 OPEN).
- LIVE/produção (BFF, motor), C#, NT8, contas e ordens: intocados. Sem deploy. Sem push.
- **Próximo passo (exige ordem do operador):** deploy do BFF+motor candidatos em produção (script do operador; classifier nega no auto mode) e/ou porte para o C# do robô com F5 do operador.

- **AUDITORIA HISTÓRICA ES/NQ A(70)/B(50) (14/10/2026, sessão `e6ce8ee4`, SOMENTE LEITURA) — PARTIAL (não comprovável).** 687 listados / 685 contados (+US$ 38.872,60) = 683 únicos + 2 duplicatas + 2 testes; 683 únicos +US$ 39.180,80. Gate OPEN histórico NÃO existe; bull_pct/bear_pct só em 122 snapshots fim-de-dia (darkcode-*.json) ⇒ A e B: 0 aprovados comprováveis, 1 rejeitado (ES divergente/NQ NEUTRO, −180), 682 INDETERMINADOS; replay causal não executável. Próximo passo (ordem do operador): logger append-only de gate.open + signals por tick. Ver `invictus-aot-live-20261012/esnq-entry-exit-rules/audit-historica-20261014/REPORT_AUDITORIA_HISTORICA_ESNQ_20261014.md`.
- **ADENDO 14/10 (só hoje, sessão `e6ce8ee4`, SOMENTE LEITURA):** 9 trades AOT SIM hoje (7 LONG / 2 SHORT, −US$ 1.687,50); A e B = 0 aprovados / 0 rejeitados / 9 INDETERMINADOS; único snapshot de % do dia (20:51Z) é posterior às entradas; Gate OPEN intradiário inexistente; replay causal não executável. Ver o REPORT da auditoria histórica, §ADENDO.
