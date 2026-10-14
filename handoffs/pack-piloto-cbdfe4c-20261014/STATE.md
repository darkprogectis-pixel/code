# PACK PC PILOTO DESKTOP-CBDFE4C — TESTE ATUALIZADO (ordem do operador 14/10/2026) — EM ANDAMENTO

Sessão e6ce8ee4 (checkpoint pré-rotação, ~210k tokens). A sucessora CONTINUA sem nova ordem.

## Ordem (resumo)
Gerar um pack atualizado e funcional do INVICTUS para o piloto DESKTOP-CBDFE4C, com referência na instalação atual da OLIVER.
- O ZIP externo `*_NAO_IMPORTAR.zip` contém o import interno.
- Manter a estrutura externo/interno; novo ZIP com nome "TESTE_ATUALIZADO", sem sobrescrever o original.
- JEV DIFF antes de qualquer patch técnico. Validar estrutura e integridade, NT8, versões e testes locais; manifesto e SHA256.
- Documentar instalação, pré-requisitos, validação no piloto e rollback.
- Proibido:
  - alterar a OLIVER, a V1 de produção, contas ou ordens;
  - incluir AO 2.0 ou o staging R1–R10;
  - instalar no piloto;
  - colocar credenciais no ZIP;
  - copiar IDs, tokens ou licenças da OLIVER.
- Fechar com handoff canônico + commit sem push. Resposta = bloco CHATGPT (campos da ordem).

## Achados até aqui (somente leitura)
- Pasta dos packs: `C:\Users\ADM\Downloads\Telegram Desktop\invictus pack 1000`.
- Original citado: `ALFA_OMEGA_DESTINO_DESKTOP-CBDFE4C_INVICTUS_PGCAP_20261007_NAO_IMPORTAR.zip`, SHA256 92371aa946cfc3f839acf4a464e76bd592b48a88aca0e7fff238d492ccf1ff85 (= DELIVERY_SHA256 do release P-GCAP no `HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md`). 4 entradas:
  - `LEIA_PRIMEIRO.txt`;
  - `SHA256SUMS.txt`;
  - `ENTRIES.json`;
  - **`ALFA_OMEGA_DESTINO_DESKTOP-CBDFE4C_INVICTUS_PGCAP_import.zip`** (1.232.941 B; família F4, import 28006bc7…).
- **JÁ EXISTE uma versão mais nova:** `ALFA_OMEGA_DESTINO_DESKTOP-CBDFE4C_INVICTUS_Z30X2_20261008_NAO_IMPORTAR.zip` (rollout Z30X2 de 08/10 = P-GCAP + FORCA_JANELA_30 + EXIT_LAYER_FIX X2).
  - `MASTER_MANIFEST_INVICTUS_Z30X2_20261008.txt`: F4 import = `...\invictus-temporal-clustering-audit-20261008\rollout_20261008\build\AlfaOmega_F4_INVICTUS_Z30X2_import.zip`, HARNESS 28/28, BANCADA 32/32, PGCAP_API b7535a5e23f9 (= OLIVER).
  - A OLIVER tem `..._OLIVER_MAIN_MACHINE_INVICTUS_Z30X2_BASELINE_20261008_NAO_IMPORTAR.zip`.
  - Handoff do Z30X2: `handoffs/HANDOFF_INVICTUS_TEMPORAL_CLUSTERING_AUDIT_20261008.md`. Linhagem: `handoffs/AUDIT_LINHAGEM_PACKS_CREDENCIAIS_20261014.md`.
- Licença do piloto (handoffs): credencial piloto-01@alfaomega (user 29, device 92) com licença NULL no servidor ⇒ INVICTUS fail-closed (indicadores ok). Liberar = decisão do operador no servidor. Não há `CREDENCIAL_*.txt` legítimo (credenciais-packs R5).

## Próximo passo exato
1. Ler (bounded) o HANDOFF_INVICTUS_TEMPORAL_CLUSTERING_AUDIT_20261008 (§rollout/OLIVER) e a AUDIT_LINHAGEM para saber se a OLIVER hoje está em Z30X2 e se há algo DEPOIS do Z30X2 instalado na OLIVER.
2. Comparar os .cs do import Z30X2 F4 × bin\Custom da OLIVER (`C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom`, só leitura; normalizar BOM/CRLF), limitado aos arquivos do pack.
3. Sem diferença real ⇒ o novo pack = import Z30X2 F4 sem mudança, reembalado com o nome TESTE_ATUALIZADO, LEIA_PRIMEIRO de teste, SHA256SUMS, ENTRIES e manifesto. Sem patch técnico ⇒ JEV DIFF não aplicável. Com diferença ⇒ proposta + JEV DIFF antes.
4. Validar: roundtrip do ZIP, SHA, ausência de credenciais/IDs da OLIVER, ausência de AO2/staging; compile/harness disponíveis no rollout_20261008\tools, se houver.
5. Handoff canônico (HANDOFF_PACKS_CLIENTES…) + commit sem push + bloco CHATGPT.

## Checkpoint 2 (sessão e6ce8ee4, ~221k tokens — rotação iminente)
- A linhagem (`AUDIT_LINHAGEM_PACKS_CREDENCIAIS_20261014.md` l.23/55/56) dá o **Z30X2 (08/10) como ATUAL**:
  - DESTINO Z30X2 delivery SHA256 7bc0e3ffdb59cef1da48456964777340ae7f609265c947340813eefdbc7d83fd;
  - OLIVER = Z30X2 BASELINE (63d5b3e2).
- Delivery Z30X2 do DESTINO, 6 entradas:
  - `ALFA_OMEGA_DESTINO_DESKTOP-CBDFE4C_INVICTUS_Z30X2_import.zip` (SHA256 3baa59b0d2282ebdfbfe614a931cdf9960df81a1458379218726648c8512b757) = **arquivo de importação**;
  - `..._PGCAP_ROLLBACK_import.zip` = rollback;
  - `AVISO_OPERACIONAL.txt`, `ENTRIES.json`, `LEIA_PRIMEIRO.txt`, `SHA256SUMS.txt`.
- Comparação import Z30X2 F4 × OLIVER `Documents\NinjaTrader 8\bin\Custom` (normalizado BOM/CRLF; script em scratchpad `cmp.cjs`, recriar se preciso):
  - 39 iguais no mesmo caminho;
  - 5 diferentes: `AddOns\AlfaOmegaRobo.cs` (OLIVER mtime 08/10 17:23; política KEEP_OLIVER — o Robo da OLIVER é próprio), `Indicators\AlfaOmegaCopilotUnificado.cs`, `AO_DataLayer.cs`, `AO_DecisionLayer.cs`, `MenthorQGammaEngine.cs` (OLIVER mtime 22–30/09, anteriores ao Z30X2 ⇒ provavelmente versões de cliente × OLIVER, NÃO atualização posterior; VERIFICAR conteúdo);
  - ~50 "missing", porque a OLIVER usa `Indicators\TTW_DarkProjects\` ⇒ REFAZER a comparação por basename.
- **Hipótese de trabalho (a verificar):** a OLIVER não recebeu nada depois do Z30X2 ⇒ o pack piloto atualizado = Z30X2 F4 sem patch técnico (JEV DIFF não aplicável), reembalado como `..._Z30X2_TESTE_ATUALIZADO_20261014_NAO_IMPORTAR.zip` com LEIA_PRIMEIRO de teste no piloto.
- Próximo passo: comparação por basename + diff das 5 diferenças (descrever finalidade) → decidir → montar o ZIP novo em `invictus pack 1000` (sem sobrescrever) → validar (roundtrip, SHA, sem credencial/ID OLIVER, sem AO2/staging) → handoff canônico + commit sem push + bloco CHATGPT.

## Checkpoint 3 (sessão e6ce8ee4, ~226k — a sucessora continua daqui)
- Comparação POR BASENAME (scratchpad `cmp2.cjs`; recriar: normaliza BOM/CRLF, indexa os .cs de bin\Custom por basename):
  - import Z30X2 F4 × OLIVER ⇒ **87 iguais, 18 diferentes, 2 ausentes na OLIVER** (`AlfaOmegaRoboConfigInicial.cs` e `AoSizing.cs`, que são só do pack de cliente — esperado);
  - mtimes na OLIVER: `oliver_diff_mtimes.txt` (nesta pasta).
- Leitura das 18 diferenças (VERIFICAR conteúdo antes de concluir):
  - Identidade/auth da OLIVER (KEEP_OLIVER, NUNCA copiar para o piloto): AlfaOmegaAuthV2, AlfaOmegaLogin, AoLicenca, AoLogin, AlfaOmegaRobo (Robo 08/10 14:23 = baseline Z30X2 da OLIVER).
  - Anteriores ao Z30X2 (15/09–01/10), logo NÃO são atualizações posteriores da OLIVER, e sim diferença de base (OLIVER = pack-native-20261006 × F4): relays Alfa*, NetDrift, QuantDataEngine, DexGexFlow, NetGex0DTE, AO_DataLayer, AO_DecisionLayer, MenthorQGammaEngine, CopilotUnificado, Hiro.
  - **ÚNICA mudança posterior ao Z30X2 na OLIVER: `Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs`, mtime 14/10/2026 12:13** ⇒ investigar a origem (handoff/commit de 14/10 que tocou o SharedState? ex.: GC/SI, Jarvis, AOT live) e se ela está homologada (JEV FINAL A) e é aplicável a cliente. Se for homologada e funcional ⇒ proposta de patch de 1 arquivo + JEV DIFF. Se não for homologada ou for específica da OLIVER ⇒ NÃO incluir; o pack = Z30X2 F4 sem patch.
- Depois: montar `ALFA_OMEGA_DESTINO_DESKTOP-CBDFE4C_INVICTUS_Z30X2_TESTE_ATUALIZADO_20261014_NAO_IMPORTAR.zip` em `invictus pack 1000`, mantendo a estrutura (import interno + rollback + LEIA_PRIMEIRO de teste + ENTRIES + SHA256SUMS + MANIFEST), e validar.

## Checkpoint 4 — DECISÃO (sessão e6ce8ee4)
- A mudança de 14/10 no `AlfaOmegaSharedState.cs` da OLIVER é a equivalência GC/SI do AOT:
  - `Forca_GC`/`Forca_SI` + `AoGate.GcSi()`, com `AoGate.EsNq` intocado;
  - fonte: `HANDOFF_INVICTUS_AOT_LIVE_AUTOMATION_20261012.md` l.1011–1034, staging `invictus-aot-live-20261012/gcsi-eqv/`;
  - é recurso do simulador GC/SI do terminal AOT da máquina-mãe, fora do release de cliente homologado (P-GCAP/Z30X2) e sem efeito no ES/NQ do robô.
- ⇒ **Nenhuma diferença real a incorporar.** Pack piloto TESTE ATUALIZADO = import Z30X2 F4 (3baa59b0…) + rollback P-GCAP, sem patch técnico ⇒ JEV DIFF NÃO APLICÁVEL.
- Próximo passo: montar o ZIP novo + validar + handoff canônico + commit.

## Checkpoint 5 — PACK CRIADO (sessão e6ce8ee4, ~234k)
- Novo pack: `C:\Users\ADM\Downloads\Telegram Desktop\invictus pack 1000\ALFA_OMEGA_DESTINO_DESKTOP-CBDFE4C_INVICTUS_Z30X2_TESTE_ATUALIZADO_20261014_NAO_IMPORTAR.zip`
  - SHA256 a90a74e8ce3220721104ce0cf7c0cf367d3a19c6cbab5ab783e6be05db12ce7b; original intacto.
  - 6 entradas: Z30X2_import (3baa59b0…, inalterado), PGCAP_ROLLBACK_import (28006bc7… = import P-GCAP F4), AVISO_OPERACIONAL.txt, ENTRIES.json (copiados do delivery Z30X2), LEIA_PRIMEIRO_TESTE_ATUALIZADO.txt (novo: instalação, pré-requisitos, validação no piloto, licença, rollback), SHA256SUMS.txt.
  - Fonte da montagem: scratchpad `build/`.
- PENDENTE (sucessora):
  1. Roundtrip: extrair e conferir o SHA256SUMS.
  2. Varredura das 6 entradas e do import interno por senha/token/ID da OLIVER (maquina-mae.oliver, device 86) e por AO2/staging.
  3. Manifesto `MANIFEST_DESTINO_CBDFE4C_TESTE_ATUALIZADO_20261014.txt` na pasta dos packs.
  4. Ponteiro no HANDOFF_PACKS_CLIENTES… + commit sem push + bloco CHATGPT.
     - Validação NT8 herdada do rollout Z30X2: HARNESS 28/28, BANCADA 32/32.
     - LICENCA_PILOTO = piloto-01 sem licença no servidor ⇒ fail-closed esperado.

## SOFT_STOP (sessão e6ce8ee4, ~237k) — estado exato para a sucessora
- A verificação de roundtrip e a varredura (passos 1 e 2 acima) foram BLOQUEADAS pelo JEV_SOFT_STOP: NÃO rodaram.
- Arquivos novos sem commit:
  - `handoffs/pack-piloto-cbdfe4c-20261014/STATE.md` e `oliver_diff_mtimes.txt`;
  - o ZIP novo em `invictus pack 1000`, fora do repo.
- Último commit da sessão: 3f57e19 (AO 2.0 F0).
- Testes deste pack: nenhum executado ainda. Herdado: Z30X2 HARNESS 28/28 / BANCADA 32/32 sobre o mesmo import (3baa59b0…, inalterado).
- Próximo passo exato = passos 1–4 do Checkpoint 5:
  1. Roundtrip: `unzip` + `sha256sum -c SHA256SUMS.txt`.
  2. grep por oliver, maquina-mae, senha, token, AO2, pctRules (com saída limitada).
  3. Manifesto na pasta dos packs.
  4. Ponteiro em `HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md` + commit sem push + bloco CHATGPT final da ordem PACK PC PILOTO.

## FECHAMENTO (sessão 2ce90375) — ENTREGUE
- Roundtrip: `sha256sum -c` 5/5 OK; import e rollback com 110 arquivos cada; NT8 export 8.0.22.2.
- Varredura: nenhuma credencial, token ou ID da OLIVER; nenhum AO 2.0 / R1–R10 / EsnqRules / Forca_GC.
  - Ocorrências benignas: comentários históricos "maquina-mae"/"STAGING" no import Z30X2 homologado, inalterado; base64 do logo em AoBrand.
- Manifesto: `invictus pack 1000\MANIFEST_DESTINO_CBDFE4C_TESTE_ATUALIZADO_20261014.txt` (e5b74686a436a1b2d20259c5c47b60f9e8d7f8234338c5ae4eed2a7723585754).
- Ponteiro gravado no HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md. Commit sem push.
- Próximo passo: depende do operador (liberar a licença do piloto-01 no servidor; instalar no piloto conforme o LEIA_PRIMEIRO_TESTE_ATUALIZADO).

## CREDENCIAL DO PILOTO (ordem 14/10, somente leitura, sessão 2ce90375)
- TXT associado ao piloto: `C:\Users\ADM\Desktop\codigo-piloto-01.txt` (24 B, 18/09/2026 17:46, sha256 1d688ed24b1c…). O conteúdo não foi exibido.
- Tipo: **código de ENROLLMENT de uso único** (AuthV2), não é senha de login. Já foi consumido em 18/09 ⇒ device 92 do piloto-01 (user 29).
- Vínculo, por evidência documental:
  - HANDOFF_PACKS_CLIENTES…20261007 l.34 (DESKTOP-CBDFE4C ⇒ 18/09 piloto-01@alfaomega user 29 ⇒ enrollment ⇒ device 92);
  - AUDIT_LINHAGEM_PACKS_CREDENCIAIS_20261014 l.55;
  - roteiro `Downloads\# PC PILOTO — CONSUMIR ENROLLMENT.txt` (18/09 18:09).
- Credencial de login (`CREDENCIAL_PILOTO_*.txt`): NÃO EXISTE, por desenho (credenciais-packs STATE l.36/84).
- Procedimento oficial, se o operador quiser senha: `authv2-admin.js user-create-password … --out` no servidor ⇒ `Downloads\CREDENCIAL_PILOTO_<NOME>.txt`.
- A licença do piloto-01 continua NULL; liberar é decisão do operador no servidor. Nada foi criado nem alterado.

## AUTHV2 PC PILOTO — confirmação do bloqueio (ordem 14/10, somente leitura, sessão 2ce90375) — PARTIAL
- **Leitura no servidor BLOQUEADA**: o classificador do auto mode negou ("Production Reads") a execução de `wsl … ssh root@167.233.25.27` + `node /root/auth-service/authv2-admin.js user-list/device-list --json`, filtrada para user 29 e device 92. Não foi contornada.
- **Leitura do log NT8 da OLIVER (ordens da TAKEPROFIT) também BLOQUEADA** pelo mesmo motivo.
- Último estado do servidor documentado (dossier `Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\authv2-device-rootcause-20261007\DOSSIER_AUTHV2_DEVICE_ROOT_CAUSE.md` l.89-110, leitura de 07/10):
  - user 29: active, license_expires_at NULL ("sem prazo"), tem_senha false;
  - device 92: active, label DESKTOP-CBDFE4C, revoked_at null.
  - Código: whoami devolve `license_valid = null` quando o prazo é NULL ⇒ o cliente AoLicenca mostra "licenca nao configurada" ⇒ INVICTUS fail-closed. Mas `licencaValida(NULL)=true` ⇒ token() continua emitindo tokens (indicadores funcionam).
  - Um "blocked" literal exige mudança de status depois de 07/10 (user/device) ⇒ **não verificável sem a leitura no servidor.**
- Ordens MES/MNQ na TAKEPROFIT619605210: a config operacional da OLIVER (`Documents\NinjaTrader 8\alfaomega-robo\config\ativos.json`, v200 de 13/10) mapeia MES (qty 3) e MNQ (qty 2) para essa conta, com `operacional.json` play=true desde 14/10 11:40Z (ADM@OLIVER).
  - ⇒ Origem mais provável: o robô INVICTUS da **OLIVER** (user 22/device 86), não o piloto.
  - Não confirmado contra o log/executions (leitura negada).
- Próximo passo (decisão do operador): autorizar as duas leituras (VPS authv2-admin user-list/device-list; log NT8 da OLIVER de 14/10) ou executá-las e colar o resultado.

## AUTHV2 PC PILOTO — R2 (ordem 14/10, somente leitura, sessão 2ce90375) — PARTIAL
- A chamada ao servidor NÃO foi repetida (negada antes por "Production Reads"). Procedimento manual redigido em `PROCEDIMENTO_LEITURA_MANUAL_AUTHV2_ORDENS_20261014.md`.
- O log do PC piloto não está nesta máquina. O único arquivo do piloto em Downloads (`pc piloto 02 _ MÁQUINADESKTOPCBDFE4C.txt`, 19:46) é a ORDEM enviada ao Claude do piloto, não o resultado. A leitura integral dele foi negada ("Credential Materialization"); foram lidas só linhas filtradas.
- **Código (pack Z30X2 = rollback = OLIVER):**
  - A tela "Acesso bloqueado. Contate o operador." sai de `status=blocked`, que tem 2 causas indistinguíveis na UI:
    - (a) user/device ≠ active;
    - (b) licença sem prazo / license_valid null (`AoLogin.cs` l.163-169; `AlfaOmegaLogin.cs` l.145).
  - O motivo só fica em memória (`AoLogin.LastError`, sem log). Estado documentado em 07/10 (user/device active, prazo NULL) ⇒ (b), a confirmar no servidor.
- **RISCO REAL:** a licença NÃO bloqueia o robô.
  - `AlfaOmegaRobo.cs` l.3279: `GatesConfirmacao = { turno, source_readiness, licenca }` (OPERATOR_OVERRIDE de 30/09) ⇒ só `engine_play` (PLAY/STOP de `alfaomega-robo\config\operacional.json`) veta entrada.
  - Com PLAY no piloto, o robô abre posições via `AlfaOmegaTrader.PlaceCore` mesmo com login "Acesso bloqueado".
  - O padrão do pack é STOP (sem `operacional.json`; o ConfigInicial não o cria) ⇒ entrar exige PLAY explícito no piloto.
  - `AlfaOmegaTrader` (:5152, X-AO-Token local) e `AlfaOmegaCopyEngineMotor` também enviam ordens sem nenhuma checagem AuthV2.
- **Correção de registro:** o "fail-closed" escrito antes para o INVICTUS do piloto (manifesto/LEIA_PRIMEIRO TESTE_ATUALIZADO e respostas anteriores) é impreciso. Indicadores e login ficam bloqueados, mas a EXECUÇÃO do robô depende só de PLAY/STOP.
- Ordens MES/MNQ TAKEPROFIT619605210 19:34–19:41: origem e ambiente NÃO verificados (sem evidência do piloto). NÃO atribuídas à OLIVER.
- Correção mínima recomendada (não executada, decisão do operador):
  - (1) leituras A/B do procedimento;
  - (2) imediata e reversível: STOP no Control Center do piloto (`operacional.json` play=false) enquanto a licença estiver irregular;
  - (3) causa (b): renovar a licença do piloto-01 com o CLI oficial `/root/auth-service/authv2-admin.js` (comando de renovação listado pelo usage); causa (a): reativar user/device pelo mesmo CLI;
  - (4) política: voltar `licenca` a gate bloqueante = mudança de código no robô ⇒ JEV DIFF + ordem do operador (reverte o override de 30/09).

## AUTHV2 — LICENÇA REGULARIZADA (sessão 2ce90375, 14/10 23:27Z)
- Servidor:
  - ANTES: user 29 active / device 92 active, licença `sem_prazo`;
  - comando: `renew-user piloto-01@alfaomega --days 30` (operador escolheu 30 d);
  - DEPOIS: licenca `ativo`, expira 2026-11-13T23:27:17Z.
- Detalhes, componentes, rollback e validação no piloto: `AUTHV2_LICENCA_PILOTO_20261014.md`.
- Próximo passo: validação funcional no PC piloto (sem PLAY, sem ordens).

## ATUALIZAÇÃO GLOBAL DOS PACKS + LICENÇAS 30d (ordem 14/10, sessão 2ce90375) — EM ANDAMENTO
- Packs: os 13 clientes da linhagem já estão em Z30X2 = mesmo import do pack de referência do piloto. A correção do piloto foi só a licença no servidor ⇒ 0 packs a refazer; JEV DIFF não aplicável.
- AuthV2 ANTES (23:42Z): todos os users active, nenhum travado, nenhum device revogado. O snapshot fica só no scratchpad da sessão, não no repo.
- Plano (renew-user +30 d):
  - RENOVAR: 63 (vencido 06/10), 70 (expira 29/10), 72 (expira 06/11);
  - MANTER, prazo > 30 d (não reduzir): 64, 65, 66, 67, 68, 69, 71, 73, 74;
  - já feito: 29 (até 13/11);
  - fora de escopo: 22 OLIVER, 30 escritorio-novopc (teste);
  - sem conta: ANAALICEGUSTAVO.
- Próximo passo: 3 renovações + releitura + tabela + commit.
