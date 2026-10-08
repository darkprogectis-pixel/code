# HANDOFF — OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007

Atualizado por 41f1f360 (rotação #18) por ordem urgente do operador ("tokens esgotando, handoff primeiro"). Trabalho técnico PARADO no ponto descrito abaixo.

## 1. MISSION
OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007 — ordem integral: `handoffs/OPERATOR_ORDER_OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007.md` (14 fases). A ordem foi colada na 132665f6 já ROTATED_READ_ONLY ⇒ bloqueada pelo hook, nada executado lá; extraída do transcript e persistida por 41f1f360.

## 2. OBJECTIVE
Atualizar a máquina-mãe OLIVER (NT8 principal, usuário Windows ADM) para P-GCAP VERIFIED, preservando identidade/AuthV2/login/credencial/licença/device/config/contas/bindings/execução/risco; APIs/opções/fluxo NÃO podem ser requisito de entrada (RTH_OPTIONS_API_* = 0, EXTERNAL_API_NETWORK_REQUIRED_FOR_ENTRY = NO). Gerar pack OLIVER (import + delivery), JEV DIFF A, JEV FINAL A, handoffs + pointer, adicionar pack OLIVER à pasta `Downloads\Telegram Desktop\invictus pack 1000` + manifest (CLIENT = OLIVER_MAIN_MACHINE).

## 3. CURRENT_STATUS
IN_PROGRESS — Fases 1, 2 e 4 FEITAS (read-only + JEV procedimento). Fase 5 (matriz) feita como candidata. Oráculo de compilação em construção (1ª rodada INVÁLIDA, ver §4). NADA alterado no NT8 principal.

## 4. EXACT_STATE
- Fase 1/2 (base real) CONCLUÍDA por evidência de hash (§11). **OLIVER_CURRENT_BASE = pack-native-20261006 `src` = `before` = `build\_import_stage`** (57/57 .cs idênticos). NÃO é CANON / F1–F4 / P-RTH1 / MAGNUM. Família não se aplica (OLIVER é a árvore de desenvolvimento-mãe).
- Fase 4: precheck operacional + JEV procedimento CONCLUÍDOS (§12/§13).
- Compile oracle: `oliver-main-pgcap-20261007\tools\compile_oliver.ps1` (compila os `<Compile Include>` do csproj da OLIVER, refs do csproj, bin OFICIAL 8.1.8.2 extraído, Program Files nunca carregado: pfModules=0). Snapshot read-only feito em scratch `oliver_before` via `tools\snapshot_oliver.ps1`. **1ª rodada BEFORE = INVÁLIDA como baseline** (`tests\COMPILE_OLIVER_BEFORE.json`: items 464, parsed 173, missingSrc 291, erros 267) — causa identificada: os Include do csproj vêm URL-encoded (`%40` = `@`, ex. `Indicators\%40FVG.cs`) e o snapshot/compilador não decodificou ⇒ 291 fontes não copiadas; erros CS0433 (`TextPosition` em GammaLinesFlow e GammaLinesFlowSignals) são consequência/ambiente a reavaliar após a correção. 3 refs faltando no bin oficial (SharpDX.DirectWrite, Actipro…DotNet, UIAutomationTypes) — mapear para WPF/Framework ou ignorar se não usadas.

## 5. EXACT_NEXT_STEP
1. Corrigir `tools\snapshot_oliver.ps1` e `tools\compile_oliver.ps1`: `[Uri]::UnescapeDataString($i)` em cada Include; apagar scratch `oliver_before` antigo (o script recusa destino existente — usar novo nome, ex. `oliver_before2`); rerodar BEFORE ⇒ esperado erros 0 (o NT8 real compila esta árvore). Se BEFORE ≠ 0, investigar refs (não é regressão do merge).
2. Árvore AFTER = cópia do snapshot + 3 arquivos do CANON P-GCAP (scratch `canon_PGCAP\AddOns\AlfaOmegaRoboFontes.cs`, `canon_PGCAP\Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs`, `...\AoMarketDataPublisher.cs`) ⇒ compile AFTER erros 0 ⇒ `tests\COMPILE_OLIVER_AFTER.json`.
3. Static checks no AFTER: Fontes spotgamma_3500/relay_3457 Hard=false (Ready = LocalReady); G_CAP/LimiarForca presente em SharedState; AuthV2/AoLicenca/AoLogin sha == OLIVER (§11).
4. Fase 6 JEV DIFF (`tools\jev_oliver_diff.js`, modelo `tools\jev_oliver_procedure.js`; cuidado redator: não usar "credencial"/"Credential", versão "8.1.8 build 1", SHAs só prefixo 8) — pergunta literal da ordem ⇒ se ≠ A corrigir/reenviar.
5. Fase 7: backup versionado dos 3 arquivos atuais (`oliver-main-pgcap-20261007\backup\<ts>\` + SHA256) + import zip de ROLLBACK (3 originais) + script restore testado em cópia.
6. Fase 8 (decisão JEV): gerar `AlfaOmega_OLIVER_INVICTUS_PGCAP_import.zip` SÓ com os 3 arquivos (formato Info.xml igual aos imports existentes; ver `packs-clientes-invictus-20261007\tools\mkimport_pack.ps1`) ⇒ OPERATOR_ACTION: robô STOP + FLAT + sem working ⇒ Tools > Import (compila sozinho, sem F5) ⇒ Claude verifica hashes instalados (read-only) ⇒ operador PLAY.
7. Fases 9–14 conforme ordem (validação, regressão sem ordens, pack OLIVER import+delivery, JEV FINAL, handoffs, pasta final + manifest).

## 6. COMPLETED_WORK
- Ordem persistida em `handoffs/OPERATOR_ORDER_OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007.md`.
- Inventário SHA256 read-only dos 130 .cs instalados (Indicators\TTW_DarkProjects + AddOns) — scratch `oliver_installed.csv`.
- Hash de todas as entradas dos 10 import zips (P-GCAP CANON/F1–F4, P-RTH1 CANON/F1–F4) — scratch `zip_entries.csv`; comparação `cmp1.js`.
- Identificação da base por hash contra snapshots históricos (§4).
- Precheck operacional read-only (§21) + JEV PROCEDURE T1 (§12/§13).
- Ferramentas criadas (não executam nada no NT8): `Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\oliver-main-pgcap-20261007\tools\{jev_oliver_procedure.js, compile_oliver.ps1, snapshot_oliver.ps1}`; pastas `staging\`, `backup\` (vazias), `tests\`.

## 7. NOT_STARTED
Compile AFTER válido; static checks; Fase 6 JEV DIFF; Fase 7 backup/rollback; Fase 8 aplicação (import pelo operador); Fase 9 validação pós-import; Fase 10 regressão; Fase 11 pack OLIVER; Fase 12 JEV FINAL; Fase 13 seção OLIVER nos 3 handoffs + cópias; Fase 14 pasta final + manifest. Nenhum commit desta missão.

## 8. FILES_INSPECTED (read-only)
`Documents\NinjaTrader 8\bin\Custom\{Indicators\TTW_DarkProjects,AddOns}\*.cs` (130), `bin\Custom\NinjaTrader.Custom.csproj` (464 Compile, 30 Reference), `Documents\NinjaTrader 8\log\log.20261007.00001{,.pt}.txt`, `alfaomega-robo\config\operacional.json`, `press-recalibration-20261007\physical\PRECHECK.v2.json`, zips `press-recalibration-20261007\build\*.zip` e `global-rth-api-independence-20261007\build\*.zip`, snapshots `pack-native-20261006\{before,src,build\_import_stage,authv2-pauth1-20261007\staging,global-rth-api-independence-20261007\staging_new}`.

## 9. FILES_CHANGED
No NT8 principal: **0**. Criados (fora do NT8): ordem + este handoff (repo), ferramentas/resultados em `oliver-main-pgcap-20261007\`, scratch da sessão.

## 10. FILES_NOT_CHANGED
Todo `Documents\NinjaTrader 8` (bin\Custom, config, logs), Program Files\NinjaTrader 8 (incl. loader), packs/zips/releases, credenciais, servidor.

## 11. HASHES (SHA256, prefixos; completos em scratch csv)
- OLIVER instalado: AlfaOmegaRobo 32c84685… · AlfaOmegaRoboFontes 55880b55… · AlfaOmegaAuthV2 4a64c54e… · AoLicenca 9887afe9… · AoLogin 83268d92… · AlfaOmegaSharedState 7e64fc18… (= P-RTH1) · AoMarketDataPublisher 4794f82b… (= P-RTH1).
- P-GCAP (idêntico em CANON e F1–F4): AlfaOmegaSharedState e59b2ae7… · AoMarketDataPublisher f88735c3… · AlfaOmegaRoboFontes 172a758a… (= P-RTH1) · AlfaOmegaRobo dc6d45c4… (P-RTH1/P-GCAP, contém bloco CLEAN INSTALL — NÃO aplicar na OLIVER).
- Imports P-GCAP: CANON f95cb59e… · F1 b68f1bbc… · F2 9db17f11… · F3 8f0aa295… · F4 28006bc7….
- vs CANON P-RTH1: 53 iguais; diferentes Robo, RoboFontes, AuthV2, AoLicenca, AoLogin; ausentes AlfaOmegaRoboConfigInicial, AoSizing.
- Fora de qualquer pack (DO_NOT_TOUCH): AlfaOmegaQuantEngineB3, AlfaOmegaSMC, AlfaOmegaTraceB3, AoInputProbe, AoNiveis, AoProbeBidAsk, AddOns {AlfaOmegaCopilot, AlfaOmegaCopyEngine, AlfaOmegaCopyEngineUI, AlfaOmegaExtrategyCore, AoBasicEntryBoleta, AoBasicEntryProbe, AoXFeed, AO_HistoryClient, AO_HistoryWindow}.

## 12. JEV_REQUEST_IDS
- JEV OLIVER PROCEDURE T1: **req_01a1196f4e337087999d27d24b89b1c8** (jev-1.13.0) — `oliver-main-pgcap-20261007\JEV_OLIVER_PROCEDURE_T1_{INPUT.txt,RESULT.json}`.
- Contexto: JEV FINAL T3 P-GCAP req_01a119300e367e49b270d19b6447cab7.

## 13. JEV_DECISIONS
- procedure = **OLIVER_3FILE_IMPORT_ZIP_ROBOT_STOP_FLAT** (0,73; p 0,77) — zip de import OLIVER só com os 3 arquivos; operador STOP robô, confirma FLAT/sem working, Tools > Import (compila sozinho, sem F5), confere, PLAY.
- files_scope = **THREE_FILES** (0,97): AlfaOmegaRoboFontes + AlfaOmegaSharedState + AoMarketDataPublisher; Robo/AuthV2/AoLicenca/AoLogin/resto = KEEP_OLIVER.
- rollback = **VERSIONED_BACKUP_3FILES_PLUS_RESTORE_SCRIPT** (0,55).

## 14. ROTATION_CHAIN
lineage root 0b15af86 → … → 055414e1 (#16) → 132665f6 (#17, ROTATED_READ_ONLY) → **41f1f360 (#18, atual)**. Brief: `handoffs/rotation/ROTATION_132665f6_TO_41f1f360.md`.

## 15. CURRENT_SESSION
41f1f360-46c3-492a-9bc7-174c625c27cd. Nesta sessão também: release P-GCAP finalizado (commit fdf4ab5) e cópia dos 12 packs para `invictus pack 1000` — ambos COMPLETE, NÃO retomar.

## 16. SOURCE_OF_TRUTH_HANDOFFS
`handoffs/HANDOFF_PRESS_RECALIBRATION_30D_20261007.md` · `handoffs/HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md` · `handoffs/HANDOFF_PACK_INVICTUS_NATIVE_POINTER_20261006.md` · `handoffs/rotation/ROTATION_132665f6_TO_41f1f360.md` · `handoffs/HANDOFF_GLOBAL_RTH_API_INDEPENDENCE_FIX_20261007.md` · este arquivo · ordem `handoffs/OPERATOR_ORDER_OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007.md`.

## 17. RELEASE_MANIFEST
`Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\press-recalibration-20261007\entregas\RELEASE_PGCAP_VERIFIED_20261007.json` (12 packs RELEASED_VERIFIED_PGCAP; OLIVER não consta).

## 18. CURRENT_CANONICAL_VERSION
CURRENT_CANONICAL_PRESS_VERSION = P-GCAP · PGCAP = VERIFIED · PRTH1 = SUPERSEDED / NAO_DISTRIBUIR · JEV FINAL T3 = A 0,64 req_01a119300e367e49b270d19b6447cab7 · commit fdf4ab5.

## 19. AUTH/CREDENTIAL PRESERVATION RULE
AlfaOmegaAuthV2.cs, AoLicenca.cs, AoLogin.cs (e qualquer login/device/licença/config) = KEEP_OLIVER. OLIVER usa AoLogin V1 + ponte AoLicenca 2026-09-15 (pré-P-AUTH1) — NÃO migrar para P-AUTH1 dos clientes. Nunca importar pack de cliente (CANON/F*) na OLIVER (sobrescreveria Auth). Nada de senha em handoff/zip.

## 20. API-INDEPENDENCE REQUIREMENTS
OLIVER hoje é PRÉ-API-independence: RoboFontes com spotgamma_3500 e relay_3457 Hard=true ⇒ Ready exige APIs. Aplicar RoboFontes 172a758a… (P-RTH1) ⇒ ecossistema = telemetria (Hard=false), Ready = LocalReady. Provar após merge: RTH_OPTIONS_API_HARD_GATE/VETO/FRESHNESS/READINESS = 0, EXTERNAL_API_NETWORK_REQUIRED_FOR_ENTRY = NO (static + runtime).

## 21. SAFETY CONSTRAINTS
- Estado real (2026-10-07 ~23:50 BRT): NT8 principal PID 24744 (ADM) desde 09:01; conta de BROKER REAL TAKEPROFIT (nº mascarado) + Sim; robô INVICTUS em **PLAY** (operacional.json play=true v49) com CopyEngine ativo; últimas execuções 20:02 (MNQ broker + NNQ Sim), posições FLAT; sem working após 20:02. NT8 isolado (jevnt8test PID 32324) NÃO está mais rodando.
- Aplicação só com robô STOP + FLAT + sem working (JEV). ORDERS = 0 · F5 = 0. Não tocar loader/nt8_plugins (fora do escopo, não interfere na compilação de bin\Custom). Não apagar histórico.
- Auto mode: um `ls` de bin\Custom foi NEGADO como [Production Deploy]; Get-FileHash/Glob/cópia read-only PARA scratch funcionaram. Escrita em bin\Custom e GUI do NT8 serão negadas ⇒ aplicação = OPERATOR_ACTION (import pela GUI).

## 22. KNOWN LIMITATIONS
Compile oracle ainda não validado (§4). AoSizing.cs do base não foi localizado nas 2 pastas inventariadas (procurar em outras pastas de bin\Custom; o csproj é a verdade). Validação P-GCAP herdada = HEADLESS (GUI/Playback não exercitados). Robô usa relógio de parede para RTH.

## 23. OPEN QUESTIONS
- Janela da aplicação: operador decide quando pôr STOP (sessão Globex aberta).
- Nome do pack OLIVER: seguir padrão `AlfaOmega_OLIVER_INVICTUS_PGCAP_import.zip` / `ALFA_OMEGA_OLIVER_MAIN_MACHINE_INVICTUS_PGCAP_VERIFIED_20261007_NAO_IMPORTAR.zip` (confirmar padrão de build_deliveries_pgcap.js). Pack de recuperação deve conter a árvore AlfaOmega da OLIVER (base + 3) sem segredos — escopo exato a definir no JEV DIFF.

## 24. BLOCKERS
- Nenhum bloqueio de decisão até a Fase 8. Fase 8 exige ação do operador na GUI do NT8 (STOP/Import/PLAY) — auto mode impede Claude de escrever em bin\Custom.

## 25. EXACT COMMAND/ENTRY POINT FOR SUCCESSOR
```
W='C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\oliver-main-pgcap-20261007'
OB='C:\Users\ADM\AppData\Local\Temp\claude\C--Users-ADM-Claude-JEV-code\055414e1-6c3e-41eb-a017-35d059c35544\scratchpad\nt8_official_8182\PFiles64\NinjaTrader 8\bin'
# (se OB sumiu: msiexec /a "Downloads\NinjaTrader.Install (2).msi" /qn TARGETDIR=<scratch>\nt8_official_8182)
# 1) corrigir %40 (UnescapeDataString) em snapshot_oliver.ps1 e compile_oliver.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "$W\tools\snapshot_oliver.ps1" -Dest <scratch>\oliver_before2
powershell -NoProfile -ExecutionPolicy Bypass -File "$W\tools\compile_oliver.ps1" -Tree <scratch>\oliver_before2 -Out "$W\tests\COMPILE_OLIVER_BEFORE.json" -OfficialBin $OB
```
3 arquivos P-GCAP: extrair de `press-recalibration-20261007\build\AlfaOmega_INVICTUS_Native_PGCAP_import.zip` (AddOns/AlfaOmegaRoboFontes.cs, Indicators/TTW_DarkProjects/AlfaOmegaSharedState.cs, Indicators/TTW_DarkProjects/AoMarketDataPublisher.cs). JEV: `node tools\jev_oliver_*.js [--dry]` (PATH curto: `/c/Program Files/nodejs:/usr/bin:/c/Windows/System32`).

## 26. NEXT_JEV_STAGE
Fase 6 JEV DIFF (após compile BEFORE=0 e AFTER=0): "Qual é o merge mínimo e correto para transformar a instalação atual da máquina-mãe OLIVER no padrão P-GCAP VERIFIED, preservando integralmente sua identidade e sem alterar componentes não relacionados?" — se ≠ A, corrigir e reenviar. Depois Fase 12 JEV FINAL OLIVER.

## 27. COMPLETION_CRITERIA
FINAL_VERDICT = OLIVER_MAIN_MACHINE_PGCAP_COMPLETE_AND_VERIFIED só com: JEV DIFF A; backup + rollback testado; 3 arquivos instalados com SHA = P-GCAP e Auth/Login/Licenca SHA = OLIVER original; compile PASS (import NT8 sem erro); RTH_OPTIONS_API_* = 0 e EXTERNAL_API_NETWORK_REQUIRED_FOR_ENTRY = NO; PRESS = P-GCAP (G_CAP/LimiarForca); regressão PASS sem ordens; pack OLIVER import+delivery com SHA; JEV FINAL A; seção OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007 nos 3 handoffs + cópias Desktop/Downloads; pack OLIVER na pasta `invictus pack 1000` + manifest (CLIENT = OLIVER_MAIN_MACHINE, STATUS = VERIFIED_PGCAP); commit. ORDERS 0 · F5 0.
