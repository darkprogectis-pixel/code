# HANDOFF — INVICTUS JEV CODE · NT8 READ-ONLY INSTALLATION PREPARATION (24/09/2026)

Autocontido. Continua `handoffs/HANDOFF_INVICTUS_JEV_CODE_V1_20260924.md` (Fronts A/B/C concluídos, não reabertos).
Partida: `7e61960`. Fase: **preparar** a instalação read-only do AddOn no NT8. **Nada foi copiado para o NT8 e o F5 não foi feito.**

> **ESTADO ATUAL (24/09/2026):** o cabeçalho abaixo e as §1–§12 são o **registro histórico** da preparação. O estado mais recente do lote está na **§13.6**: instalado (4 arquivos, backup `20260924-124658`), **F5 = 1**, PostF5 PASS, validação visual PARCIAL, **FINAL = PARTIAL** (`JEV_INSTALL_COMPLETE_RUNTIME_DATA_PARTIAL`), NEXT = `DIAGNOSE_RUNTIME_DATA_PLANE`.

| | |
|---|---|
| 3A CONFLICT AUDIT | **PASS** (1 risco real encontrado e corrigido só no código IJC, ver §1.3) |
| EXTERNAL BUILD | **PASS**: isolado 0 erros / 0 avisos; shadow-compile com toda a produção: delta 0 / 0 |
| INSTALL DESTINATION | `C:\Users\ADM\Documents\NinjaTrader 8\bin\Custom\AddOns\InvictusJevCode\` (hoje **ABSENT**) |
| BACKUP PLAN / HASH MANIFEST / ROLLBACK | **READY** (ensaio completo em sandbox: PASS, rollback byte-exato em 468 arquivos) |
| JEV_CAN_SEND_ORDER / ORDER_PATH | `false` / `HARD_DISABLED` (constantes, C# e Node) |
| NO LIVE ORDER PATH · SIM/PLAYBACK ONLY · REAL ACCOUNT | PASS · PASS · REJECTED |
| PRODUCTION | **UNCHANGED** (bin\Custom: csproj/DLL/PDB/XML ainda com a data de 22/09 18:21–18:22; pasta alvo ausente; 0 entradas IJC no csproj) |
| FILES COPIED TO NT8 | **0** |
| F5 | **NOT PERFORMED** |
| READY FOR CONTROLLED INSTALL | **YES** (a execução exige ordem do operador e NT8 fechado) |

## 1. CONFLICT AUDIT (3a, somente leitura)

Alvo: `bin\Custom` do NT8 8.1.8.1, com 456 `.cs` compilados (lista explícita no `NinjaTrader.Custom.csproj`, `EnableDefaultCompileItems=false`) e 13 DLLs de terceiros na raiz.

### 1.1 Resultado

| Item | Resultado | Evidência |
|---|---|---|
| NAMESPACE COLLISION | **PASS** | `NinjaTrader.NinjaScript.AddOns.InvictusJevCode` não aparece em nenhum `.cs` de produção nem nas DLLs da raiz de `Custom`. Nenhum tipo chamado `InvictusJevCode` em `NinjaTrader.NinjaScript.AddOns`. |
| TYPE COLLISION | **PASS** | Os 16 tipos `Ijc*` (`IjcRuntime`, `IjcAddOn`, `IjcControlCenterWindow`, `IjcExecutor`, `IjcSafety`, `IjcGuard`, `IjcExecutionStub`, `IjcJson`, `IjcHttp`, `IjcDiag`, `IjcOrderPhase`, `IjcOrderTrack`, `IjcDedup`, `IjcAccountDto`, `IjcOrderDto`, `IjcReconResult`, `IjcOwnership`) não aparecem na produção nem nas DLLs. Não há `partial`. O shadow-compile confirma: 0 erros novos (CS0101/CS0104/CS0436 seriam os sintomas). |
| AddOnBase / NTWindow / menu | **PASS** | 1 `AddOnBase` (`IjcAddOn`) e 1 `NTWindow` (`IjcControlCenterWindow`). O menu entra em `ControlCenterMenuItemNew` com o Header `INVICTUS JEV CODE`. Os menus de produção são "Alfa Omega" (2×), "Copy Engine", "Alfa Omega Copilot" e "Historico", então não há duplicata. Sem `IWorkspacePersistence`: a janela não é salva no workspace. |
| Resources | **PASS** | O AddOn não usa `.resx`, `pack://` nem `Resource.*`. |
| Portas / arquivos em runtime | **PASS** | Nenhum `.cs` de produção usa 3590/3591/3592. Logs em `Documents\NinjaTrader 8\invictus-jev-code\logs`, token em `%LOCALAPPDATA%\InvictusJevCode\secrets`. Nada é gravado em `bin\Custom`. |
| OLD JEV ADDON COLLISION | **PASS** | `JevControlCenter.cs` saiu do repo em `7e61960` e nunca foi instalado. Não existe `*JevControl*` nem `*InvictusJev*` em `Documents\NinjaTrader 8`. |
| DEPENDENCY COLLISION | **PASS** | O payload usa só referências que o csproj real já tem: `NinjaTrader.Core`, `NinjaTrader.Gui`, `Newtonsoft.Json` (a cópia em `bin\Custom`, usada no shadow-compile), WPF e `System` (`HttpWebRequest`). Nenhuma DLL nova, nenhum `PackageReference` novo. |
| COMPILE RISK | **LOW** | O shadow-compile do `NinjaTrader.Custom` real com o payload dá 0 erros e 0 avisos novos. O csproj pós-instalação (sandbox) compila tal como está. O que sobra: o NT8 compila com o próprio Roslyn (LangVersion 13) e o shadow com o SDK 8 (`latest`=12). O payload é C# 7.3 (check.csproj), então essa diferença não afeta o código IJC. |

### 1.2 Método

- `nt8/install/shadow-compile.mjs` lê o `NinjaTrader.Custom.csproj` real e aponta cada `<Compile>` para o `.cs` real pelo caminho absoluto (somente leitura). Compila numa pasta temporária duas vezes: **BASELINE** (produção como está: exit 0, 0 erros, 3009 avisos pré-existentes) e **WITH_IJC** (produção + 4 arquivos: exit 0, 0 erros, 3009 avisos, **delta 0**, 0 diagnósticos em arquivos IJC). A DLL-sombra com IJC contém `IjcAddOn`; a baseline não.
- `--as-is`: compila o csproj de uma sandbox **depois** do `03-install.ps1`, com as 4 linhas `<Compile>` inseridas pelo script. Resultado: exit 0, 0 erros, 0 diagnósticos IJC.

### 1.3 Risco real encontrado e corrigido (só no código IJC)

O `AssemblyInfo.cs` do NT8 declara `[assembly: CLSCompliant(true)]`, e os 6 campos `public static volatile` de `IjcExecutor` (`State`, `ControlPlaneStatus`, `ReconStatus`, `Orphans`, `AccountsEligible`, `AccountsReported`) gerariam **6 avisos CS3026 no F5**. O build isolado não pegava porque não tinha esse atributo.
**Correção:** os campos voláteis viraram privados e ganharam propriedades públicas com `private set`, sem mudança de comportamento. A janela só lê esses valores.
Arquivo: `nt8/AddOns/InvictusJevCode/IjcExecutor.cs`. Produção não foi tocada.

## 2. EXTERNAL BUILD RESULT (revalidado contra as DLLs atuais do NT8 8.1.8.1)

| Verificação | Resultado |
|---|---|
| `npm run check:nt8` (4 arquivos, DLLs reais, C# 7.3) | **0 erros / 0 avisos** |
| `node nt8/install/shadow-compile.mjs` (produção inteira + IJC) | **PASS**: delta 0 erros / 0 avisos |
| `shadow-compile --as-is` (csproj pós-instalação) | **PASS** |
| `npm run test:nt8` (C#) | 50/50 PASS |
| `npm test` (Node) | **78/78** PASS (75 + N01–N03 novos) |
| `npm run smoke` | SAFE_UNKNOWN PASS · NO_ORDER PASS |
| Payload sem API de ordem (`.Submit(`, `CreateOrder(`, `.Cancel(<args>)`, `.Change(`, `.Flatten(`, `Enter*/Exit*`) | PASS (o único `Cancel()` é do `CancellationTokenSource` da janela) |
| `JEV_CAN_SEND_ORDER = false`, `ORDER_PATH = "HARD_DISABLED"`, `IsEligibleProvider` ∈ {Simulator, Playback} Ordinal | PASS (checados também pelo `01-precheck.ps1`) |

## 3. INSTALL PLAN

Artefatos em `nt8/install/` (Windows PowerShell 5.1; `powershell -NoProfile -ExecutionPolicy Bypass -File ...`):

| Script | Escreve? | Função |
|---|---|---|
| `Ijc-Nt8Common.ps1` | não | caminhos, SHA256, conjunto de backup, leitura do csproj |
| `01-precheck.ps1 [-ForInstall]` | **não** | pasta alvo (ABSENT/PRESENT + inventário), entradas IJC no csproj, AddOn antigo, nomes IJC na produção, hash do payload == manifesto, sem API de ordem, travas, NT8 aberto/fechado, disco |
| `02-backup.ps1` | só em `%LOCALAPPDATA%\InvictusJevCode\install-backups\<id>\` | backup + `pre-manifest.json` (SHA256) + re-hash da cópia ⇒ `verified` |
| `03-install.ps1 -BackupId <id> -Confirm INSTALL-IJC [-WhatIf]` | **sim** (bin\Custom) | copia os 4 `.cs` e acrescenta 4 linhas `<Compile>` no csproj |
| `04-verify.ps1 -BackupId <id> -Stage PreF5\|PostF5` | **não** | verificação pós-cópia / pós-F5 |
| `05-rollback.ps1 -BackupId <id> -Confirm ROLLBACK-IJC [-WhatIf]` | **sim** (bin\Custom) | restauração integral |
| `90-rehearsal.ps1 -Sandbox <dir>` | só na sandbox | ensaio completo fora do NT8 |
| `ijc-payload-manifest.json` / `build-payload-manifest.mjs` | — | SHA256 do payload (manifesto: sha256 `3a84cf49…6c40`) |
| `shadow-compile.mjs` | só em `%TEMP%` | compilação-sombra (§1.2) |

O `03-install.ps1` recusa **sem escrever nada** quando:
- o NinjaTrader está aberto;
- o backup não existe, não está `verified` ou está corrompido;
- `bin\Custom` mudou desde o backup;
- o payload não bate com o manifesto ou contém API de ordem;
- a pasta alvo já existe (sem `-ReplaceExisting`);
- o csproj tem entradas IJC parciais;
- falta `-Confirm INSTALL-IJC`.

No csproj, as 4 linhas entram depois do último `<Compile>`, preservando BOM e CRLF. O XML é validado, e cada entrada tem que aparecer exatamente 1 vez. Se algo falhar depois da primeira escrita, o script roda `05-rollback` automaticamente.

**Por que o csproj é editado:** no NT8 8.1 o `NinjaTrader.Custom.csproj` lista cada arquivo explicitamente. As instalações anteriores de produção seguiram o mesmo padrão (ex.: `csproj.bak-etapa6` → atual: só linhas `<Compile>` acrescentadas).

**Por que NT8 fechado:** o NT8 observa `bin\Custom`. Copiar com ele aberto pode disparar uma compilação fora do F5 único. Além disso, o rollback precisa substituir a DLL, que fica em uso com o NT8 aberto.

## 4. BACKUP PLAN

- **Destino:** `%LOCALAPPDATA%\InvictusJevCode\install-backups\<yyyyMMdd-HHmmss>\files\` (fora de `bin\Custom`, então nunca é compilado).
- **Conjunto** (tudo que o F5 lê ou grava; 468 arquivos hoje):
  - `NinjaTrader.Custom.csproj` (o NT8 o **reescreve** no F5);
  - `NinjaTrader.Custom.dll`, `.pdb`, `.xml`;
  - os 8 satélites `<cultura>\NinjaTrader.Custom.resources.dll` (de-DE, es-ES, fr-FR, it-IT, ko-KR, pt-PT, ru-RU, zh-Hans);
  - os 456 `.cs` compilados;
  - `AddOns\InvictusJevCode\*`, se existir.

  Esse conjunto foi levantado pelo F5 de 22/09, que gravou exatamente esses 12 arquivos de build.
- **Fora do conjunto:**
  - `bin\Custom\obj` (intermediários, não carregados pelo NT8);
  - `AoClassicCache` e `graphify-out` (dados de runtime/ferramentas, alheios ao build);
  - `bin\Custom\bin\Release` (parado desde jun/18).
- **Pasta anterior `InvictusJevCode`:** **não existe** hoje (registrado pelo `01-precheck` e em `target_pre_state`). Se existir na hora de instalar, é inventariada, hasheada e salva antes de qualquer substituição.

## 5. HASH MANIFEST

- **Payload:** `nt8/install/ijc-payload-manifest.json` (SHA256 + tamanho dos 4 `.cs`). O teste N01 falha se o `.cs` e o manifesto divergirem; nesse caso rode `node nt8/install/build-payload-manifest.mjs`. O `.gitattributes` fixa `eol=lf` no payload, para que o `core.autocrlf=true` não mude os bytes.
  - `IjcAddOn.cs` `de122011…f5b2`
  - `IjcControlCenterWindow.cs` `43bd939b…cc7c`
  - `IjcExecutor.cs` `013e822c…fffd`
  - `IjcPure.cs` `771f20f5…d655`
- **Pré-instalação:** `<backup>\pre-manifest.json` (path, size, sha256, mtime de cada arquivo do conjunto) com `verified=true` só quando 100% das cópias batem.
- **Registros:** `install-record.json` e `rollback-record-<ts>.json` na pasta do backup.

## 6. ROLLBACK PLAN

`05-rollback.ps1 -BackupId <id> -Confirm ROLLBACK-IJC`, com o **NT8 fechado**:
1. Confere se o backup continua íntegro. Se não estiver, aborta sem tocar em nada.
2. **Não apaga nada:** tudo que sai de `bin\Custom` vai para `<backup>\quarantine-<ts>\`. Isso inclui a pasta `InvictusJevCode` (quando ela não existia antes), as versões pós-F5 de csproj/DLL/PDB/XML/satélites e qualquer arquivo extra.
3. Restaura do backup todo arquivo do `pre-manifest` que esteja ausente ou alterado.
4. Re-hasheia 100% do conjunto. Só dá PASS com diferença 0 e a pasta alvo de volta ao estado anterior.
5. Ao reabrir, o NT8 carrega a DLL anterior, que é coerente com o csproj e os `.cs` restaurados. **Não precisa de F5 depois do rollback.**

**Ensaio (`90-rehearsal.ps1`, sandbox copiada do `bin\Custom` real): PASS em 13/13 etapas.** Sequência:
1. precheck;
2. backup;
3. install -WhatIf;
4. recusa sem -Confirm;
5. recusa com backup inexistente;
6. install;
7. recusa de install repetido;
8. verify PreF5;
9. verify PostF5 sem F5 ⇒ FAIL (esperado);
10. F5 simulado (DLL + 8 satélites + csproj reescritos + log de start) e verify PostF5;
11. rollback -WhatIf;
12. recusa sem -Confirm;
13. rollback.

Diferença após o rollback: **0 arquivos, 0 extras** (468/468 hashes iguais ao original).

## 7. CHECKLIST DO ÚNICO F5 (operador, depois da ordem de instalação)

**Janela:** fechar o NT8 para a produção (robôs, Copy Engine, relays). Escolha um horário **sem posição aberta nem operação em andamento**.

**A. Preparação (NT8 ainda aberto)**
1. [ ] `npm test`, `npm run check:nt8`, `npm run test:nt8` e `node nt8/install/shadow-compile.mjs` ⇒ tudo PASS.
2. [ ] `01-precheck.ps1` ⇒ PASS (`target_folder.state = ABSENT`, `csproj_ijc_entries.count = 0`).

**B. Instalação (NT8 FECHADO)**
3. [ ] Fechar o NinjaTrader por completo (o processo `NinjaTrader` não pode estar rodando).
4. [ ] `01-precheck.ps1 -ForInstall` ⇒ PASS.
5. [ ] `02-backup.ps1` ⇒ PASS. **Anotar o `backup_id`.**
6. [ ] `03-install.ps1 -BackupId <id> -WhatIf` ⇒ conferir o plano: 4 COPY + 4 linhas no csproj.
7. [ ] `03-install.ps1 -BackupId <id> -Confirm INSTALL-IJC` ⇒ PASS.
8. [ ] `04-verify.ps1 -BackupId <id> -Stage PreF5` ⇒ PASS.
9. [ ] `npm run serve` (bridge `:3590` + control plane `:3591`) rodando.

**C. O F5 único**
10. [ ] Abrir o NT8. Se ele compilar sozinho ao abrir, **essa compilação é o F5 único**: não aperte F5 e pule para o item 12.
11. [ ] NinjaScript Editor ⇒ **F5 uma única vez**. Não haverá segundo F5.
12. [ ] Compilação do `NinjaTrader.Custom` concluída **sem erros** (painel do NinjaScript Editor e aba Log do Control Center).

**D. Validação**
13. [ ] Control Center → **New → INVICTUS JEV CODE** aparece no menu.
14. [ ] A janela abre (480×960, identidade INVICTUS JEV CODE).
15. [ ] Bridge `:3590` conectado (ENGINE/LIVE DATA sem OFFLINE).
16. [ ] Analyzer atualiza (o `snapshot_id` muda a cada ciclo).
17. [ ] `UNKNOWN` + `RC_NO_ACTIVE_DIRECTIONAL_RULE` aparecem. É o **estado normal** (0 regras de lado ativas), não é falha.
18. [ ] Robot **OFF**; o botão **ON aparece bloqueado (🔒)** e desabilitado.
19. [ ] Executor **READ_ONLY** (ou `WAITING_NT8` enquanto conecta); control plane `CONNECTED`; gate de conta FAIL é esperado (`selected_account=null` na V1).
20. [ ] **Nenhuma ordem:** aba Orders sem nenhuma ordem nova e sem nenhum nome `IJC|`; posições inalteradas.
21. [ ] `04-verify.ps1 -BackupId <id> -Stage PostF5` ⇒ PASS: DLL recompilada com os tipos IJC, `addon_start` no log, 0 `severity=error` em `Documents\NinjaTrader 8\invictus-jev-code\logs`.
22. [ ] Aba Log do NT8 sem erro crítico vindo do IJC ou de qualquer outro AddOn.
23. [ ] **Produção operacional:**
    - menus Alfa Omega / Copy Engine / Alfa Omega Copilot / Historico presentes e abrindo;
    - indicadores AlfaOmega carregam nos charts;
    - relays e robôs de produção com o status de antes.

**E. Critério de rollback**
Se houver erro de compilação, qualquer ordem, log IJC com `error` ou anomalia de produção:
1. fechar o NT8;
2. rodar `05-rollback.ps1 -BackupId <id> -Confirm ROLLBACK-IJC` ⇒ PASS;
3. reabrir o NT8 (**sem F5**).

Não tente corrigir com um segundo F5.

## 8. Decisões e pendências

> **Desatualizada (histórico).** As pendências "executar B–E" e "commit desta fase" foram concluídas: commit `22631e0` (payload de 4 arquivos), instalação §13.4, F5 + PostF5 §13.5. Pendências atuais: **§13.6**.

- **Decisão:** a instalação edita o `NinjaTrader.Custom.csproj`, com 4 linhas, backup e rollback. Nenhum outro arquivo de produção é alterado.
- **Decisão:** backups ficam fora do NT8; o rollback manda para quarentena e nunca apaga.
- **Pendente (ordem do operador):**
  - executar B–E (cópia + F5 único);
  - fazer o commit desta fase (arquivos abaixo, ainda **não commitados**).
- **Arquivos novos desta fase:**
  - `nt8/install/*`
  - `test/ijc/nt8-install.test.mjs`
  - `.gitattributes`
  - este handoff
  - edições em `nt8/AddOns/InvictusJevCode/IjcExecutor.cs`, `nt8/README.md`, `package.json`, `CLAUDE.md`
- **Não tocados:**
  - `START_JEV_CLAUDE.ps1`, `config/kimi-provider.json`, `context/jev-future/JEV_KIMI_PROVIDER_20260924.md`, `scripts/`;
  - arquivos do Codex que apareceram durante a fase: `handoffs/HANDOFF_CODEX_INVICTUS_JEV_UI_V2_20260924.md`, `handoffs/assets/*V2*`.
- **Continuam fora de escopo:** execução simulada (etapa 5), contas reais, fusão Core×JEV, agentes em caminho crítico.

## 9. Próximo passo exato

> **Superado.** A seção 7 (B → C → D) foi executada (§13.4–§13.5); o estado não é `NT8_COMPILED_READ_ONLY` isolado, e sim o da **§13.6** (FINAL = PARTIAL). Próximo passo atual: **§13.6 → `DIAGNOSE_RUNTIME_DATA_PLANE`**.

Com a ordem do operador: executar a seção 7 (B → C → D) numa janela sem posição aberta. Sucesso ⇒ registrar `PENDING_FINAL_NT8_COMPILE → NT8_COMPILED_READ_ONLY` com o `backup_id` e o resultado do `04-verify PostF5`. Falha ⇒ seção 7.E.

## 10. ROTAÇÃO DE SESSÃO (24/09/2026)

`JEV_ROTATION_REASON = HARD_CONTEXT_THRESHOLD_EXCEEDED`

- **Estado exato:** a fase NT8 READ-ONLY INSTALL está **PREPARED** (§1–§7 válidos). A sessão de rotação só recuperou o estado: **nenhuma implementação, nenhum teste, nenhuma auditoria, nenhuma cópia para o NT8, nenhum F5.**
- **Commit atual:** `7e61960` (`main`). Esta fase **não foi commitada**.
- **Modificados (não commitados):** `CLAUDE.md`, `nt8/AddOns/InvictusJevCode/IjcExecutor.cs`, `nt8/README.md`, `package.json`.
- **Untracked desta fase:** `.gitattributes`, `nt8/install/`, `test/ijc/nt8-install.test.mjs`, este handoff.
- **Untracked de fora desta fase (não incluir no commit sem ordem):** `START_JEV_CLAUDE.ps1`, `config/kimi-provider.json`, `context/jev-future/JEV_KIMI_PROVIDER_20260924.md`, `scripts/`, `handoffs/HANDOFF_CODEX_INVICTUS_JEV_UI_V2_20260924.md`, `handoffs/assets/INVICTUS_JEV_CODE_{COMPACT,DASHBOARD}_V2_20260924.png`.
- **Testes executados (fase de preparação, ver §2):** Node 78/78, C# 50/50, `check:nt8` com 0 erros / 0 avisos, shadow-compile com delta 0, shadow-compile `--as-is` PASS, smoke PASS, rehearsal 13/13 PASS. Nesta sessão de rotação: **nenhum**.
- **Nenhum retrabalho necessário:** não reabrir as Fronts A/B/C nem a preparação. Conflict audit, build, scripts, backup, manifest e rollback estão prontos.
- **Próximo passo exato (só com ordem do operador):**
  1. commitar os arquivos desta fase;
  2. executar a §7 (A → B → C → D) numa janela sem posição aberta: **um único F5**, rollback pela §7.E em caso de falha;
  3. se der certo, registrar `PENDING_FINAL_NT8_COMPILE → NT8_COMPILED_READ_ONLY` com o `backup_id` e o resultado do `04-verify PostF5`.

## 11. LOTE V2 — PRODUTO FINAL ANTES DO F5 (24/09/2026, EM ANDAMENTO · rotação por WARNING 230k)

Partida `283c476`. Working tree da preparação NT8 preservado (nada descartado). **Nada commitado, nada copiado ao NT8, F5 NOT PERFORMED.**

**Feito e testado:**
- APIs NT8 confirmadas por reflection (`NinjaTrader.Core.dll` 8.1.8.1) + uso em produção (só leitura): `Account.CreateOrder(Instrument, OrderAction, OrderType, OrderEntry, TimeInForce, int, double, double, string, string, DateTime, CustomOrder)`, `Account.Submit(IEnumerable<Order>)`, `Account.Get(AccountItem, Currency)`, `Account.Denomination`, `Account.OrderUpdate`, `Position.GetUnrealizedProfitLoss(PerformanceUnit, double)`, `Instrument.GetInstrument(string,bool)`, `MasterInstrument.TickSize`, `ErrorCode.NoError`. Nome de ordem ≤ 50.
- `nt8/AddOns/InvictusJevCode/IjcManualOrders.cs` (NOVO): caminho MANUAL (clique → `IjcManualOrderController` → conta selecionada → CreateOrder/Submit, `OrderEntry.Manual`, `TimeInForce.Day`, nome `IJC-MANUAL|<16hex>`), leitura de conta/PNL/posição (`IjcAccounts`).
- `IjcPure.cs`: `IjcOrigin` (MANUAL_OPERATOR/JEV_ROBOT, prefixos `IJC-MANUAL|`/`IJC-ROBOT|`), `IjcSession.SelectedAccount`, `IjcTicketDraft/Input/Validator`, `IjcSubmitGate` (anti-double-submit 750 ms + 1 em voo, libera só por evento NT8, timeout 5 s sem reenvio), `IjcPnlView` (PNL=Realized+Unrealized só com ambos; ausente ⇒ NOT_REPORTED), `IjcPositionView`, `IjcDiag.LogOrder` (origin+order_name).
- `IjcControlCenterWindow.cs` reescrita V2: FULL 1440×1000 / COMPACT 440×900, marca Alfa/Omega vetorial + "by ALFA OMEGA", seletor de conta (sem default), PNL grande com abas PNL/REALIZADO/ABERTO, boleta completa, posição, Robot separado (OFF/ON via `IjcExecutor.RobotControl` → gates), laço de conta independente do bridge.
- `IjcExecutor.cs`: reporta `IjcSession.SelectedAccount`; prefixo robot `IJC-ROBOT|`; `RobotControl(enable|disable)`.
- Node: `src/ijc/robot/constants.mjs` só ganhou ORIGIN/prefixos/`orderOwner`/`accountKind` (robot prefix `IJC-ROBOT|`).
- Testes: `npm run check:nt8` 0 erros/0 avisos · C# **103/103** · Node: tudo PASS exceto **N01 (manifesto — regenerar)** · nova suíte `test/ijc/v2-product.test.mjs` 12/12; I01/B09 reescritos para o contrato V2.

**RECUSA DO AMBIENTE (registrada, NÃO contornada):** a edição de `src/ijc/robot/gates.mjs` que removia `L0_SEND_ORDER_LOCK`/`ORDER_PATH` e trocava `ACCOUNT_SIMULATOR_OR_PLAYBACK` por `ACCOUNT_SELECTED` foi negada pelo classificador do Claude Code. Isolado: **ROBOT ORDER BINDING = PENDING_ENVIRONMENT_REFUSAL** (Robot mantém `JEV_CAN_SEND_ORDER=false`/`HARD_DISABLED`/gate Sim-Playback e `IjcExecutionStub`). Não é regra de produto. Com decisão NONE o robô não teria ação de qualquer forma. O caminho MANUAL foi aceito e implementado.

**Próximo passo exato (nova sessão):**
1. `nt8/install/Ijc-Nt8Common.ps1`: `$IjcForbidden` deve permitir `CreateOrder`/`.Submit(` SOMENTE em `IjcManualOrders.cs` (continuar proibindo Cancel/Change/Flatten/Enter*/Exit* em todos); `01-precheck.ps1` idem; `build-payload-manifest.mjs`: `order_path` → `{ manual: 'OPERATOR_CLICK', robot: 'HARD_DISABLED (binding isolado)' }` e ajustar N01; payload agora **5 arquivos** (5 linhas `<Compile>`: conferir 03/04/90 e N-tests).
2. `npm run nt8:manifest` → `npm test`, `npm run test:nt8`, `npm run check:nt8`, `npm run smoke`, `npm run smoke:bridge`, `node nt8/install/shadow-compile.mjs` (+ `--as-is`), `90-rehearsal.ps1` (delta).
3. Textos V1 em `robot-core.mjs publicStatus.locked_reason`, `panel-model.mjs`, `cli.mjs` (mencionam HARD_DISABLED: manter e acrescentar "binding do robô isolado").
4. Atualizar `HANDOFF_INVICTUS_JEV_CODE_V1_20260924.md`, `CLAUDE.md`; commit com stage explícito (sem Kimi/`scripts/`/`START_JEV_CLAUDE.ps1`): "Add V2 dashboard and operator execution paths to Invictus JEV Code"; push.
5. Parar em READY FOR CONTROLLED INSTALL (F5 único pelo operador, §7) → READY_FOR_OPERATOR_MANUAL_ORDER_TEST.

## 12. LOTE PRÉ-INSTALAÇÃO V2 — INTERROMPIDO POR BLOQUEIO DO AMBIENTE (24/09/2026)

**BLOCKER: `INSTALL_PRECHECK_MANUAL_ORDER_EXCEPTION_ENVIRONMENT_REFUSAL`**

Partida `283c476` (`main`). Nada commitado, nada copiado ao NT8, install NÃO executado, F5 NOT PERFORMED, produção inalterada.

### 12.1 Estado exato

| | |
|---|---|
| MANUAL ORDER CODE | IMPLEMENTED (`nt8/AddOns/InvictusJevCode/IjcManualOrders.cs`, mantido no código-fonte) |
| MANUAL ORDER INFRASTRUCTURE | EXECUTION_CAPABLE |
| INSTALL PRECHECK INTEGRATION | **BLOCKED_BY_ENVIRONMENT_REFUSAL** |
| ROBOT ORDER INFRASTRUCTURE | PARTIAL (decision / gates / control plane / dedup / reconciliation PRESENT) |
| ROBOT SUBMIT BINDING | PENDING_ENVIRONMENT_REFUSAL |
| ROBOT_DEFAULT / ROBOT_CURRENT_DECISION | OFF / NONE |
| WEB / AGENT | READ_ONLY / ADVISORY_ONLY |
| PAYLOAD DESIRED | 5 FILES |
| PAYLOAD INSTALLABLE UNDER CURRENT PRECHECK | 4 FILES (o precheck atual recusa `IjcManualOrders.cs`; como o manifesto agora lista 5 arquivos, o precheck/install atuais recusam o payload inteiro) |
| CONTROLLED INSTALL | **BLOCKED** |
| FILES COPIED TO NT8 | 0 |
| F5 | NOT PERFORMED |
| FINAL | **NOT READY FOR CONTROLLED INSTALL** |

### 12.2 O que o bloqueio É e NÃO É

É uma **restrição do ambiente executor atual**: o classificador do Claude Code ([Security Weaken]) negou a edição de `01-precheck.ps1` / `03-install.ps1`. Decisão do operador: **não contornar** (sem edição manual fora do Claude, sem regra de permissão, sem outro método) e **não retirar** a boleta manual do produto.

O bloqueio **NÃO é**:
- bug do produto;
- decisão arquitetural de remover a boleta manual;
- SIM_ONLY;
- HARD_DISABLED por desenho.

O mesmo vale para o ROBOT SUBMIT BINDING (§11): pendência do ambiente, não regra de produto.

### 12.3 Resultados válidos preservados (desta rodada)

| Verificação | Resultado |
|---|---|
| `npm run nt8:manifest` | PASS (5 arquivos; `IjcManualOrders.cs` sha256 `ee164e28…f0ca`) |
| N01 | PASS |
| Node (`npm test`) | 100/100 PASS |
| C# (`npm run test:nt8`) | 103/103 PASS |
| v2-product | 12/12 PASS |
| smoke / smoke:bridge | PASS |
| EXTERNAL BUILD (`check:nt8`) | PASS, 0 erros / 0 avisos |
| SHADOW COMPILE NORMAL (5 arquivos vs produção inteira) | PASS, delta 0 erros / 0 avisos |
| CONFLICT AUDIT DELTA (`IjcManualOrders.cs`) | PASS: 12 tipos novos + `IJC-MANUAL` ausentes da produção e das DLLs; só `System.*` + `NinjaTrader.Cbi` (já referenciados); sem menu; pasta alvo ABSENT; 0 entradas IJC no csproj; csproj/DLL de 22/09 inalterados |
| BACKUP / ROLLBACK | READY (scripts inalterados; ensaio de 13/13 da fase anterior com 4 arquivos) |

### 12.4 Integração técnica que falta (registrada, NÃO aplicada)

Já presente e **sem uso**: `nt8/install/Ijc-Nt8Common.ps1` define `$IjcManualOrderFile = 'IjcManualOrders.cs'`, `$IjcManualAllowed` (`.Submit(` ≤ 1, `CreateOrder(` ≤ 1 em linhas de código; comentários `//` não contam) e `Get-IjcOrderApiViolations($Name, $Path)`. Cancel / Change / Flatten / Enter* / Exit* continuam proibidos em todos os arquivos, inclusive no manual.

As duas ligações que faltariam:
1. `nt8/install/01-precheck.ps1`, no loop do payload (seção "payload do repositorio == manifesto"), trocar a linha
   `foreach ($pat in $IjcForbidden) { $hit = Select-String ...; if ($hit) { $orderHits += ... } }`
   por `$orderHits += @(Get-IjcOrderApiViolations $f.name $p)`.
2. `nt8/install/03-install.ps1`, no loop `foreach ($f in $m.files)`, trocar a linha
   `foreach ($pat in $IjcForbidden) { if (Select-String ... -Quiet) { $refuse += "payload contem API de ordem ($pat): ..." } }`
   por `foreach ($v in @(Get-IjcOrderApiViolations $f.name $p)) { $refuse += "payload contem API de ordem nao autorizada: $v" }`.

Ajustes decorrentes (ainda não feitos): N01 e `build-payload-manifest.mjs` (`order_path` → manual `OPERATOR_CLICK` / robot `HARD_DISABLED`, binding isolado); 5º tipo (`IjcManualOrderController`) no `04-verify.ps1` e no DLL simulado do `90-rehearsal.ps1`; cabeçalho do `03-install.ps1` ("5 linhas <Compile>").

### 12.5 Working tree desta rodada (não commitado)

- `nt8/install/Ijc-Nt8Common.ps1`: função da exceção (inerte);
- `nt8/install/ijc-payload-manifest.json`: regenerado com 5 arquivos;
- este handoff.
- Docs finais (`nt8/README.md`, `CLAUDE.md`, handoff V1) **não** atualizados, para não declarar o produto concluído.
- Não tocar / não incluir em commit: artefatos Kimi / INVICTUS AOT audit, `config/kimi-provider.json`, `scripts/`, `START_JEV_CLAUDE.ps1`.

### 12.6 Pendentes somente por causa do bloqueio

N04 (manual allowed / robot denied / unexpected denied) · shadow-compile `--as-is` · `90-rehearsal.ps1` com 5 arquivos · docs finais · commit final · push final · controlled install · F5 · operator manual order test.

### 12.7 Próximo passo exato

**NEXT:** resolver legitimamente a integração do precheck do arquivo manual num ambiente/processo que permita essa revisão, **sem contornar a recusa atual**. Depois retomar exatamente de:

N04 → rehearsal 5 files → shadow `--as-is` → docs → commit (stage explícito) → push → controlled install → **único F5 final** → READY_FOR_OPERATOR_MANUAL_ORDER_TEST.

## 13. LOTE DE INSTALAÇÃO RTH — PAYLOAD DE 4 ARQUIVOS (24/09/2026, ordem do operador)

Objetivo: rodar o INVICTUS JEV CODE no NT8 no RTH atual. Este é o **lote operacional atual para testar o JEV no RTH**, não a versão final do produto.

| | |
|---|---|
| CURRENT INSTALL LOT | **READ_ONLY / NO MANUAL ORDER EXECUTION** |
| PAYLOAD_INSTALL | 4 arquivos: `IjcAddOn.cs`, `IjcControlCenterWindow.cs`, `IjcExecutor.cs`, `IjcPure.cs` (4 linhas `<Compile>`) |
| MANUAL ORDER CODE | IMPLEMENTED, mas NÃO incluído neste lote (`IjcManualOrders.cs` continua no repositório, intacto na lógica) |
| MANUAL ORDER INSTALLATION | **DEFERRED** (próximo lote; o bloqueio da §12 continua valendo) |
| ROBOT SUBMIT | PENDING_ENVIRONMENT_REFUSAL · Robot default OFF · decisão NONE |
| WEB / AGENT | READ_ONLY / ADVISORY_ONLY |

### 13.1 Mudanças para o payload de 4 arquivos compilar sem a boleta

A janela V2 dependia de `IjcManualOrders.cs` (controlador da boleta **e** leitura de conta/PNL/posição). Ajustes mínimos, sem alterar a lógica da boleta:
- `IjcAccountInfo` / `IjcAccountSnapshot` / `IjcAccounts` (somente leitura) movidos, sem mudança, de `IjcManualOrders.cs` para o fim de `IjcExecutor.cs`;
- `IjcPure.cs`: interface `IIjcManualOrders` + `IjcManualOrdersDeferred` (Available=false, Click ⇒ `"DEFERRED"`, nunca envia);
- `IjcManualOrderController : IIjcManualOrders` (+ `Available = true`);
- janela: `#if IJC_MANUAL_ORDERS` ⇒ controlador real; senão ⇒ `IjcManualOrdersDeferred`. O NT8 não define o símbolo, então os botões BUY/SELL ficam bloqueados com `BOLETA_DEFERRED`. O próximo lote religa a boleta instalando o 5º arquivo + o símbolo, depois de resolver a §12;
- comentário em `IjcPure.cs:50` reescrito ("Account.CreateOrder (licao…" casava com o padrão proibido do precheck);
- `build-payload-manifest.mjs`: `DEFERRED = ['IjcManualOrders.cs']`, `install_lot`, `deferred_not_installed`; `shadow-compile.mjs` compila exatamente os arquivos do manifesto; `01-precheck.ps1`: arquivo em `deferred_not_installed` não é tratado como extra (a varredura de API de ordem continua sobre todo o payload, sem exceção);
- testes: N01 ignora os adiados; **N04** novo (4 arquivos, boleta adiada preservada no repo, payload sem API de ordem, janela usa o adiado sem o símbolo, `IjcAccounts` no payload); V03/V04/V05/V07 apontam a leitura de conta para `IjcExecutor.cs`.
- `Get-IjcOrderApiViolations` (§12) continua em `Ijc-Nt8Common.ps1`, **inerte** (não integrada).

### 13.2 Validação pré-instalação (todos PASS)

| Check | Resultado |
|---|---|
| manifesto de 4 arquivos (`npm run nt8:manifest`) | PASS |
| `01-precheck.ps1` (produção real, somente leitura) | PASS |
| Node `npm test` | 101/101 PASS (N01, N04) |
| C# `npm run test:nt8` | 103/103 PASS |
| v2-product | 12/12 PASS |
| smoke / smoke:bridge | PASS |
| build externo `check:nt8` | 0 erros / 0 avisos (também com `-p:DefineConstants=IJC_MANUAL_ORDERS`: 0 / 0) |
| shadow-compile normal (4 arquivos vs produção inteira) | PASS, delta 0 erros / 0 avisos |
| sandbox install + shadow-compile `--as-is` | PASS (4 entradas `<Compile>`, exit 0, 0 diagnósticos IJC) |
| `90-rehearsal.ps1` | PASS 13/13, rollback byte-exato (468 arquivos, diff 0, extra 0) |
| backup / rollback | READY |

### 13.3 Instalação real

Pré-condição que o agente não resolve: o **NinjaTrader estava ABERTO** durante a validação. A cópia exige o NT8 fechado pelo operador, sem posição ou operação crítica em andamento; o agente não fecha o NT8 nem aperta F5. Sequência (§7 B–D): `01-precheck -ForInstall` → `02-backup` (anotar `backup_id`) → `03-install -WhatIf` (4 COPY + 4 linhas) → `03-install -Confirm INSTALL-IJC` → `04-verify -Stage PreF5` → `npm run serve` → abrir o NT8: **exatamente um F5 final** (se o NT8 compilar sozinho ao abrir, essa compilação é o F5 deste lote) → `04-verify -Stage PostF5` → validação da janela. Rollback: §7.E.

Pós-F5 (requisitos deste lote): menu INVICTUS JEV CODE · janela abre · FULL e COMPACT · marca Alfa Omega · live data · `snapshot_id` mudando · estado JEV · seletor de conta · PNL / realizado / aberto · posição / preço médio · Robot OFF · 0 ordens · produção operacional. A execução da boleta manual NÃO é requisito deste lote.

### 13.4 Execução da parte B (24/09/2026 ~15:47Z, ordem do operador)

- NT8 fechado (checagem read-only) · `01-precheck -ForInstall` PASS (alvo ABSENT, 0 entradas IJC, payload 4 arquivos = manifesto, `IjcManualOrders.cs` em `deferred_not_installed`).
- `02-backup` PASS · **backup_id `20260924-124658`** · `%LOCALAPPDATA%\InvictusJevCode\install-backups\20260924-124658` · 468 arquivos · verified=true · pre-manifest sha256 `6DEC9911…2D3D` · csproj `9d17d579…ee4b` · DLL `f2bc038a…0812`.
- `03-install -WhatIf` PASS (4 COPY, +4 `<Compile>`, sem arquivo manual) → `03-install -Confirm INSTALL-IJC` PASS (4 `.cs` + csproj).
- `04-verify -Stage PreF5` PASS (4/4 ok, 0 extras, resto do csproj idêntico, 0 saídas de build / fontes de produção alteradas).
- `npm run serve` UP (`:3590` listen, `:3591` listen, 401 sem token; ciclo 1 UNKNOWN, orders=0).
- NT8 NÃO aberto · F5 deste lote: 0 · PostF5 NÃO executado.
- ~~Próximo passo: operador abre o NT8~~ **SUPERADO por §13.5** (NT8 aberto e F5 feito pelo operador).

### 13.5 F5 do operador + PostF5 (24/09/2026)

| | |
|---|---|
| OPERATOR_OPENED_NT8 | **YES** |
| FINAL_F5_PERFORMED | **YES** (operador confirmou "f5 ok"; `addon_start` no log às 15:57:54Z) |
| F5_COUNT_THIS_LOT | **1** |
| SECOND_F5_ALLOWED | **NO** |
| backup_id | `20260924-124658` (rollback §7.E, se necessário, **sem** F5) |
| `04-verify -Stage PostF5` | **PASS** (16:29Z): 4/4 arquivos ok, 0 extras, resto do csproj idêntico ao backup, DLL recompilada **com os tipos IJC**, DLL/PDB/XML + 8 satélites alterados (esperado), 0 fontes de produção alteradas, 1 `addon_start`, 0 erros no log |
| Log IJC | `addon_start` (OFF, HARD_DISABLED, JEV_CAN_SEND_ORDER=false) · `executor_start` (READ_ONLY) · `reconnect_reconciliation` ×4 (info) · 0 error |
| Bridge `:3590` | RUNNING, LIVE, relay 15/15 rotas, `snapshot_id` avança (#72→#74, ciclo ~35 s), `last_cycle_error` null |
| JEV | UNKNOWN + `RC_NO_ACTIVE_DIRECTIONAL_RULE` (estado seguro) · session RTH · gamma_regime POSITIVE_GAMMA · DQ DEGRADED · conviction UNCALIBRATED |
| Robot | OFF · decisão NONE (`RC_ROBOT_NO_ACTIVE_SIDE_RULE`, `RC_ROBOT_NO_EXECUTION_POLICY`) · can_enable/can_arm false · order_path HARD_DISABLED |
| Executor NT8 / control plane `:3591` | READ_ONLY · nt8_ready true · heartbeat < 2 s · reconciliação COMPLETE, 0 órfãs · contas reportadas 27, elegíveis (Sim/Playback) 5 · posição FLAT |
| Ordens | 0 (`guarantees.orders_emitted=0`, 0 órfãs `IJC-`) |
| Produção | NT8 rodando (Control Center + Copy Engine abertos), 0 fontes de produção alteradas, relay OK |

**Não verificado pelo agente (exige olho do operador):** a janela INVICTUS JEV CODE **não está aberta** (janelas visíveis do processo NT8: só "Centro de controle" e "Copy Engine"). O agente não clica no NT8. Ficam pendentes de confirmação visual: menu New → INVICTUS JEV CODE, abertura da janela, FULL/COMPACT, marca Alfa Omega, seletor de conta, PNL/realizado/aberto, posição/preço médio.

**Próximo passo exato:** o operador abre Control Center → New → INVICTUS JEV CODE e confirma os itens visuais acima. **Sem F5, sem recompilar, sem testar boleta ou ordens.** Se todos passarem, marcar `RTH_TEST_READY`.

### 13.6 Reconciliação final do lote: validação visual do operador + auditoria independente (24/09/2026)

Este é o **estado atual do lote**. Ele substitui o "Próximo passo exato" da §13.5: **não** marcar `RTH_TEST_READY`.

**Auditoria independente (somente leitura, 16:35Z):**
- processo NT8 iniciado às 15:52:21Z;
- `NinjaTrader.Custom.dll` gravada uma única vez depois disso (15:57:52Z);
- log IJC com um único `addon_start` (15:57:54Z) e 0 erros;
- csproj com exatamente 4 entradas IJC;
- hash igual ao do repositório nos 4 `.cs` instalados;
- backup `20260924-124658` presente;
- `:3590`, `:3591` e `:3457` escutando.

| | |
|---|---|
| F5_COUNT_THIS_LOT | **1** |
| SECOND_F5 | **NO** (não permitido) |
| POSTF5_VERIFY | **PASS** |
| backup_id | `20260924-124658` |
| INSTALLATION | **PASS** |
| UI_INSTALLATION | **PASS** |
| RUNTIME_DATA_VALIDATION | **PARTIAL** |
| **FINAL** | **PARTIAL** · `JEV_INSTALL_COMPLETE_RUNTIME_DATA_PARTIAL` |

**Validação visual (o operador abriu a janela; prints revisados):**

| Item | Resultado |
|---|---|
| WINDOW_OPEN / FULL / COMPACT / ALFA_OMEGA_BRANDING | PASS / PASS / PASS / PASS |
| ENGINE / LIVE_DATA | OPERATIONAL / LIVE |
| DIRECTIONAL_CONTEXT | UNKNOWN |
| DATA_QUALITY | **DATA_INVALID** |
| JEV_AGENT | **NOT_REPORTED** |
| ACCOUNT_SELECTOR / ACCOUNT_SELECTED | VISIBLE / NO (não confirmada) |
| PNL_UI / REALIZED_UI / OPEN_PNL_UI | PASS / PASS / PASS |
| PNL_VALUES | NOT_VALIDATED (nenhuma conta selecionada) |
| POSITION_UI / POSITION_VALUE / AVG_PRICE_VALUE | VISIBLE / UNKNOWN / NOT_VALIDATED |
| ROBOT / ROBOT_DECISION / EXECUTION | OFF / NONE/NONE / DISABLED |
| Boleta manual | `BOLETA_DEFERRED` (esperado: `IjcManualOrders.cs` não faz parte do lote de 4 arquivos) |
| TRACE / VolSignals | UNAVAILABLE/UNKNOWN · UNAVAILABLE/UNKNOWN |
| SPX FINAL CONTEXT | UNAVAILABLE |

**Desligados por projeto (NÃO são defeitos deste lote):**
- execução do Robot: OFF, `ORDER_PATH=HARD_DISABLED`;
- execução da boleta manual: DEFERRED.

**Problemas de runtime pendentes (por que o FINAL é PARTIAL):**
1. `DATA_INVALID`.
2. JEV Agent `NOT_REPORTED`.
3. TRACE indisponível no runtime.
4. VolSignals indisponível no runtime.
5. Seleção/enumeração de conta ainda não validada.
6. PNL, posição e preço médio não podem ser validados sem uma conta selecionada.

Nesta etapa, nenhum desses problemas foi investigado nem corrigido. Nenhuma alteração em C#/Node, nenhum F5, nenhuma recompilação, reinstalação, rollback ou ordem.

**Próximo passo exato:** `DIAGNOSE_RUNTIME_DATA_PLANE`, somente leitura e com ordem do operador:
- origem do `DATA_INVALID` (dimensões de data quality no snapshot do bridge `:3590`);
- por que o JEV Agent não reporta;
- rotas TRACE/VolSignals no relay `:3457`;
- enumeração de contas pelo control plane `:3591` (27 reportadas, 5 elegíveis).

Regras para a próxima etapa:
- **ZERO novos F5.** Qualquer correção que exija recompilar o NT8 é um lote novo, com ordem própria.
- O rollback continua sendo o da §7.E, **sem** F5.

## 14. RUNTIME_DATA_PLANE_DIAGNOSIS_20260924 (somente leitura · zero F5 · zero alteração)

Base: commit `82a2064` e §13.6. A instalação não foi reauditada.
- Nesta etapa: só GETs em `:3590`, leitura de código, de config e dos logs locais (`%LOCALAPPDATA%\InvictusJevCode\logs`).
- Não houve: edição de C#/Node/JSON, início ou reinício de serviço, F5, ordem.
- `:3591` não foi consultado com token: o token é segredo e não foi lido. Os dados do executor vieram do `/jev/v1/state`.

### 14.1 Snapshot real

| | |
|---|---|
| Endpoints | `GET :3590/jev/v1/{health,state,output,audit}` (`/health` na raiz = 404, não existe) |
| snapshot_id (amostra) | `2026-09-24T16:47:46.766Z#mufphwso-103` → ciclo 104 às 16:48:26Z |
| schema / versão | `jev-output/v1` · `jev-runtime/v1.0.0` · input `jev-input/v1` · decision_logic v1 · feature_contract v1 |
| jev_market_state | target ES · gamma_regime POSITIVE_GAMMA · delta_positioning UNAVAILABLE · second_order_flows / vol_skew / flow_unknown_semantics UNRESOLVED |
| jev_directional_context / native_directional_context | UNKNOWN / UNKNOWN |
| spx_final_context | TRACE e VolSignals `freshness_state` UNKNOWN, `families` [] · `effect_on_native` UNAVAILABLE · `numeric_equivalence_allowed` false |
| data_quality | **alterna** entre DEGRADED e DATA_INVALID (ver 14.2) |
| reason_codes | `RC_NO_ACTIVE_DIRECTIONAL_RULE` (ou `RC_DATA_INVALID`) · `RC_SPX_TRACE_*_UNAVAILABLE` · `RC_SPX_VOLSIGNALS_*_UNAVAILABLE` · `RC_DQ_DEGRADED` · `RC_MENTHORQ_ZERO` |
| inputs | 122 recebidos / 68 ausentes / 3 null_at_source / 0 não reconhecidos (total 190) |
| menthorq | confirmation ZERO · levels_available false · effect NONE |
| core_comparison | NOT_AVAILABLE |
| SNAPSHOT_ADVANCING | **YES** (ciclo ≈ 35 s, `last_cycle_error` null, relay 15/15 rotas OK) |

### 14.2 DATA_INVALID: causa raiz exata (PROVADA)

**Fato 1.** `DATA_INVALID` é **intermitente**, não um estado permanente.
- Log `engine_cycle` de 15:48Z a ~17:05Z: DEGRADED ×109, DATA_INVALID ×21 (~16%).
- Transições isoladas a cada 3–10 min, voltando a DEGRADED no ciclo seguinte.
- O print do operador pegou um ciclo DATA_INVALID. A UI está correta: lê `data_quality.status` de `/jev/v1/state` sem transformar (`IjcControlCenterWindow.cs:713`).

**Fato 2.** Ciclo DATA_INVALID capturado ao vivo: `evaluated_at` 2026-09-24T17:01:38.092Z.
- As 15 rotas do relay vieram `OK`, todas **não cacheadas**, e o adapter não registrou nenhum issue.
- Mesmo assim, todas as fontes dealer ficaram `UNKNOWN` com o motivo *"vendor_timestamp no futuro relativo a evaluated_at"*.
- Por consequência, as 6 dimensões dealer ficaram UNAVAILABLE e o status foi DATA_INVALID (`quality.mjs:113`).

| SOURCE (FR) | rotas | vendor_ts mín. | vendor_ts − evaluated_at | FRESH | PARSED | REACHED_ENGINE | motivo |
|---|---|---|---|---|---|---|---|
| FR_ROOT_ORDERFLOW | 1 | 17:01:40Z | **+1,91 s** | NO (UNKNOWN) | YES | YES | idade negativa |
| FR_CLASSIC | 3 | 17:01:40Z | **+1,91 s** | NO (UNKNOWN) | YES | YES | idade negativa |
| FR_STATE | 11 | 17:01:40Z | **+1,91 s** | NO (UNKNOWN) | YES | YES | idade negativa |

No ciclo DEGRADED, que é o normal, há rotas **cacheadas** no relay (`cached:true`, ~8 s de idade). Elas puxam o `min(vendor_ts)` de FR_CLASSIC e FR_STATE para antes de `evaluated_at`: idade +4,8 s e +6,8 s, FRESH. Já FR_ROOT_ORDERFLOW (1 rota, não cacheada) fica **UNKNOWN em todos os ciclos observados**.

**Mecanismo, com três fatores combinados:**
1. `live-relay-adapter.mjs:98`: `t0 = now()` e `evaluated_at = t0` são fixados **antes** das 15 leituras sequenciais do relay (~4–5 s no total). Todo dado gerado depois de t0 tem `vendor_ts > evaluated_at`.
2. `live-relay-adapter.mjs:133`: `vendor_timestamp` por fonte = `min` das rotas. Só fica ≤ t0 se ao menos uma rota da fonte vier do cache do relay.
3. `quality.mjs:30`: `age_sec < 0` ⇒ `UNKNOWN`, que não é utilizável. Não há tolerância para desvio de relógio. Agravante: o `vendor_ts` chega até **+1,9 s à frente da hora local de chegada**, e o serviço **W32Time está Stopped** (relógio local sem sincronização).

⇒ **Paradoxo:** o `DATA_INVALID` acontece justamente quando os dados estão **mais frescos**, com nenhuma rota vinda do cache.

**Primeiro salto quebrado:**
- Estão OK: SOURCE → relay `:3457` → adapter (fetch/parse) → normalized input → engine.
- A quebra está no **carimbo temporal do adapter (`evaluated_at` pré-fetch) combinado com a regra de freshness do engine (idade negativa ⇒ UNKNOWN)**.
- Snapshot → NT8 UI: OK (fiel).

### 14.3 Four-source / native dealer

- NATIVE_SOURCE_PRESENT = **YES**. Campos recebidos por bloco: root 38, classic 25, state_gex 28, state_greek 31.
- Ausentes: root 35 (inclui os níveis MenthorQ, que só existem na raiz composta), cache 11 (histórico local do NT8, não lido), ind 2, classic 1, state_gex 1, state_greek 2.
- Campos SPX ausentes: TRACE 9 e VolSignals 7.
- NATIVE_REACHED_ENGINE = **YES**.
- NATIVE_INPUT_VALID = **INTERMITENTE**:
  - FRESH nos ciclos em que alguma rota vem do cache;
  - UNKNOWN nos demais.
- FR_ROOT_ORDERFLOW (root/orderflow, 38 campos) = UNKNOWN em todos os ciclos observados, pela mesma causa. Por isso `delta_positioning` fica UNAVAILABLE e o gate do Robot `SOURCE_NOT_FROZEN` aparece como FAIL (`FR_ROOT_ORDERFLOW=UNKNOWN`).
- NATIVE_DATA_QUALITY_REASON: *vendor_timestamp no futuro relativo a evaluated_at* (e não dado ausente, stale ou frozen).

### 14.4 VolSignals

| | |
|---|---|
| VOLSIGNALS_SOURCE_AVAILABLE | YES |
| VOLSIGNALS_CAPTURE_EXISTS | YES: `C:\Users\ADM\.claude\volsignals-audit\data\runs\rth-20260924T155720Z\market-frames.ndjson` (10,7 MB). O `*.v1-lossy-int64.ndjson` não foi usado |
| VOLSIGNALS_RUNTIME_ADAPTER_EXISTS | **NO** (`relay-mapping.mjs:64`: `SOURCE_NOT_AVAILABLE` — "não é servido pelo relay") |
| VOLSIGNALS_RUNTIME_BINDING | **NO** (nenhuma referência a volsignals-audit/market-frames em `src/` ou `config/`) |
| VOLSIGNALS_RUNTIME_INPUT_PRESENT / REACHED_ENGINE | NO / NO |
| Contrato | `FR_VOLSIGNALS` freshness_basis UNKNOWN ⇒ nunca FRESH por default, mesmo com binding |

Não é falha do VolSignals: a integração com o runtime não existe.

### 14.5 TRACE

TRACE_SOURCE_AVAILABLE = NO no runtime. A única captura é a 1D, feita fora do adapter.

| Item | Estado |
|---|---|
| TRACE_RUNTIME_ADAPTER_EXISTS | **NO** (`relay-mapping.mjs:62`: "SpotGamma TRACE não é servido pelo relay") |
| TRACE_INPUT_PRESENT | NO |
| TRACE_TIMESTAMP | — |
| TRACE_FRESH | NO (UNKNOWN, "fonte ausente no input") |
| TRACE_PARSED | NO |
| TRACE_REACHED_ENGINE | NO |

Não há produtor conectado ao runtime. Nenhum dado TRACE foi inventado.

### 14.6 MenthorQ

- confirmation ZERO · levels_available false · effect_on_context NONE · `RC_MENTHORQ_ZERO`. A fonte `FR_MENTHORQ_MERGE` está ausente: os níveis só existem na raiz composta, que o JEV não lê.
- As famílias `DC_MENTHORQ_LEVELS` ficam na dimensão `MENTHORQ_CONFIRMATION_LEVELS`, **fora** das 6 dimensões dealer usadas pelo `DATA_INVALID` (`quality.mjs:4`). ⇒ MENTHORQ_CAUSES_DATA_INVALID = **NO**.
- Ausente, neutra, stale ou desalinhada: não bloqueia, não gera NO_TRADE e não reduz conviction (UNCALIBRATED). O efeito é **ZERO**, conforme `POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING`.

### 14.7 JEV Agent `:3592`

- `:3592` não está escutando: o `npm run serve` sobe só `:3590`/`:3591`, e o gateway é um processo separado (`npm run agent`).
- Config: provider `none` ⇒ NOT_CONFIGURED mesmo se estivesse rodando.
- O painel (`panel-model.mjs:47`) fixa `agent.status = NOT_REPORTED`. A janela consulta `:3592/agent/v1/health` e mostra "NOT REPORTED" quando não há resposta.

| | |
|---|---|
| AGENT_EXPECTED_TO_RUN | NO (não faz parte do `serve`; opcional/advisory) |
| AGENT_OPTIONAL | YES |
| AGENT_REQUIRED_FOR_ENGINE | NO (engine/quality não leem o agente) |
| AGENT_REQUIRED_FOR_DATA_QUALITY | **NO** |

Conclusão: a ausência do agente não tem relação com o `DATA_INVALID`. O agente não foi iniciado.

### 14.8 Contas

Trajeto: NT8 `Account.All` → `IjcExecutor`, que faz a varredura a cada 10 s e reporta ao control plane → `IjcAccounts.List()`, que alimenta o seletor da UI.

| | |
|---|---|
| NT8_ACCOUNT_COUNT | 27 (via `Account.All`, reportado pelo executor) |
| IJC_ACCOUNT_COUNT | 27 reportadas · 5 elegíveis (Sim/Playback) |
| UI_ACCOUNT_COUNT | Esperado 27 + "Selecione conta": mesma fonte `Account.All`, sem filtro (`IjcExecutor.cs:257`). **Não confirmado visualmente** |
| Nomes | não lidos (exigiriam o token do `:3591` ou a tela do NT8) |
| Gate `ACCOUNT_SIMULATOR_OR_PLAYBACK` | FAIL, "nenhuma conta selecionada/reportada". Esperado: a V1 não autoescolhe conta e o `selected_account` é null |

Nada foi selecionado e nenhuma ordem foi enviada.

### 14.9 Causas raiz

1. **DATA_INVALID intermitente e FR_ROOT_ORDERFLOW sempre UNKNOWN.** São causados por idade negativa de freshness: `evaluated_at` é fixado antes do fetch sequencial, o `vendor_timestamp` da fonte é o `min` das rotas, e a regra `age<0 ⇒ UNKNOWN` não tem tolerância.
2. **Relógio local sem sincronização.** Com o W32Time parado, o `vendor_ts` chega até +1,9 s à frente da hora local de chegada, o que amplia o problema 1.
3. **TRACE e VolSignals** não têm adapter nem binding no runtime. A captura do VolSignals existe, mas não está ligada.
4. **JEV Agent** não é iniciado pelo `serve` e não tem provider. Isso é opcional e não afeta a DQ.
5. **Conta:** nenhuma foi selecionada pelo operador, então PNL, posição e preço médio não podem ser validados.

### 14.10 Correções necessárias (NÃO implementadas)

1. **Semântica temporal da freshness (decisão canônica do operador).** Opções:
   - (a) fixar `evaluated_at` **depois** do fetch;
   - (b) usar a chegada por rota como referência;
   - (c) tolerância explícita e PROVISIONAL para idade negativa pequena.

   Mexe em R_S10/freshness e no adapter, portanto exige pré-registro e ordem. **Não** afrouxar o `min` por conta própria.
2. **Sincronizar o relógio do Windows** (W32Time), ação de ambiente do operador. Depois, medir de novo o desvio `vendor_ts − chegada`.
3. **Binding de runtime para TRACE e VolSignals** (fase própria). VolSignals também precisa definir `freshness_basis`, hoje UNKNOWN no contrato.
4. **Agent:** opcional. Se desejado, iniciar `npm run agent` com provider configurado.
5. **Conta:** o operador seleciona uma conta Sim/Playback na UI para validar PNL e posição. Somente leitura, sem ordem.

**Próximo passo exato:** com a ordem do operador, decidir a correção 1 (a, b ou c) e executar a correção 2. Depois, implementar, testar e smoke **somente em Node**: a correção fica no adapter/quality e não exige F5, porque o C# não muda. Por fim, revalidar a proporção de DATA_INVALID nos logs `engine_cycle`. **Zero F5.**

### 14.11 Pré-registro FRESHNESS_FIX_V1 (decisão do operador, 24/09/2026, ANTES do código)

| | |
|---|---|
| FRESHNESS_FIX_V1 | **EVALUATED_AT_AFTER_FETCH**: `evaluated_at` é definido **depois** que as leituras das rotas do ciclo terminam |
| RATIONALE | Preservar o `vendor_timestamp` como referência canônica de freshness e corrigir a causalidade temporal. O bug é a ordem: o `evaluated_at` era congelado antes das 15 leituras |
| Invariante | `evaluated_at >= conclusão da última leitura do ciclo` |
| (b) ROUTE_ARRIVAL_REFERENCE | **REJECTED**: o tempo de chegada não substitui adequadamente o `vendor_timestamp` para freshness |
| (c) NEGATIVE_AGE_TOLERANCE | **DEFERRED**: não usar tolerância para mascarar o erro antes de corrigir a ordem temporal |
| W32TIME | **Separado do fix.** Pode amplificar o skew, mas não justifica mudança semântica. Nesta etapa, só diagnóstico read-only |

**Continua inalterado:**
- `vendor_timestamp` e a escolha do timestamp da fonte (mínimo das rotas);
- thresholds, enums de qualidade e regra `age<0 ⇒ UNKNOWN`;
- Feature Contract, Decision Logic, pesos e side rules;
- MenthorQ, TRACE e VolSignals.

**Regra do patch:** um timestamp genuinamente futuro, mesmo depois do fix, continua UNKNOWN.

**Nota 17:15Z:** o `npm run serve` iniciado por esta sessão (15:48Z) saiu com código 255 após o ciclo 149, sem erro no log (último dq DEGRADED, orders=0). No mesmo segundo, outro `npm run serve` foi iniciado por um shell externo a esta sessão (bash → npm → node PID 30468, 17:15:14Z) e hoje responde em `:3590` (RUNNING, LIVE) e `:3591` (401 sem token). A bridge/control plane estão **UP**; o contador de ciclos reiniciou. Esta sessão não reiniciou nada.

### 14.12 FRESHNESS_FIX_V1: patch, testes e validação ao vivo (24/09/2026)

**Patch** (somente Node; C# e NT8 intocados; zero F5)

`src/jev/adapters/live-relay-adapter.mjs`:
- `t0` continua marcando o início do ciclo, usado só na observação de FROZEN;
- `tEval = now()` passa a ser tomado **depois** do laço de fetch e define `evaluated_at` e `session`.

Não mudaram:
- `vendor_timestamp` e o mínimo por fonte;
- thresholds, enums e a regra `age<0 ⇒ UNKNOWN`;
- contrato, Decision Logic, MenthorQ, TRACE e VolSignals.

**Testes** (`test/jev/adapter.test.mjs`, F01–F06). O relógio sintético avança durante o fetch, e cada rota live carimba o `vendor_ts` na leitura.

| Teste | Caso | Resultado com o patch | Código antigo |
|---|---|---|---|
| F01 | A: 15 rotas live, idade ≥ 0, sem DATA_INVALID por ts futuro | PASS | FAIL |
| F02 | B: rota cacheada, freshness normal | PASS | FAIL |
| F03 | C: ts genuinamente futuro continua UNKNOWN | PASS | PASS (invariante) |
| F04 | D: stale continua STALE | PASS | FAIL |
| F05 | E: ts ausente continua UNKNOWN | PASS | PASS (invariante) |
| F06 | F: FR_ROOT_ORDERFLOW lido primeiro, com latência de 1,5 s, fica FRESH | PASS | FAIL |

Suíte Node completa (`npm test`): **107/107 PASS** (antes 101 + 6 novos). `smoke` e `smoke:bridge`: PASS.

**Validação ao vivo**
- Reinício: só o runtime Node. `node src/jev/cli.mjs --serve` (PID 3860) foi parado às 17:14:56Z e o `npm run serve` subiu de novo às 17:15Z.
- O executor NT8 reconectou sozinho: READ_ONLY, `nt8_ready` true.
- Observação com GETs em `:3590/jev/v1/{output,audit}`, 25 ciclos consecutivos entre 17:15:19Z e 17:29:12Z.

| | ANTES (15:48–17:14Z, código antigo) | DEPOIS (25 ciclos, patch) |
|---|---|---|
| DATA_INVALID | 25/149 (~17%); 21/130 (~16%) no momento do diagnóstico | **0/25** |
| Falhas por "vendor_timestamp no futuro relativo a evaluated_at" (nível fonte) | todas as fontes dealer nos ciclos DATA_INVALID | **0/25** |
| Distribuição DQ | DEGRADED/DATA_INVALID alternando | DEGRADED 25/25 |
| FR_ROOT_ORDERFLOW | UNKNOWN em todos os ciclos observados | **FRESH 25/25** |
| FR_CLASSIC / FR_STATE | FRESH ou UNKNOWN (intermitente) | FRESH 25/25 / FRESH 25/25 |
| Rotas | 15/15 | 15/15 |
| last_cycle_error / engine_cycle_error | null / 0 | null / 0 |
| SNAPSHOT_ADVANCING | YES | YES (ciclos 1→25, ~35 s) |
| Robot / ordens | OFF · HARD_DISABLED / 0 | OFF · HARD_DISABLED · decisão NONE / 0 (órfãs 0) |

Faixas por rota, pós-patch:

| Medida | Faixa |
|---|---|
| min_age (`evaluated_at` − maior vendor_ts) | −1,93 s … +0,82 s |
| max_age (`evaluated_at` − menor vendor_ts) | 2,97 s … 26,07 s |
| `vendor_ts − chegada local` | até +2,48 s |

**Resíduo, fora do escopo do fix.** Algumas rotas individuais ainda chegam com `vendor_ts` até ~1,9 s à frente do `evaluated_at` local. Isso é skew do relógio local, não ordenação. A freshness por fonte usa o mínimo das rotas, então nenhuma fonte ficou UNKNOWN por isso nos 25 ciclos. **Nenhuma tolerância foi adicionada.**

DEGRADED continua sendo o estado esperado nesta etapa. Continuam não utilizáveis:
- cache histórico (AoClassicCache);
- MenthorQ, TRACE e VolSignals;
- `FR_FROZEN_BLOCK`.

Nenhuma dessas é bug de ordenação.

**Critérios de PASS**

| Critério | Resultado |
|---|---|
| 1. DATA_INVALID por ts futuro | 0/25 ✅ |
| 2. FR_ROOT_ORDERFLOW | FRESH 25/25 ✅ |
| 3. stale / missing / futuro real | regras mantidas (F03, F04, F05) ✅ |
| 4. 15/15 rotas e snapshot avançando | ✅ |
| 5. Regressão Node | 107/107 ✅ |

⇒ **FRESHNESS_TIMESTAMP_FIX_VALIDATED**

**W32TIME** (registro separado; não entra no resultado do patch)

| | |
|---|---|
| SERVICE | STOPPED (StartType Manual; NtpServer `time.windows.com,0x9`) |
| MEASURED_OFFSET | ≈ −3,6 s: relógio local atrás da referência (`w32tm /stripchart`, 3 amostras +3,61 s, read-only) |
| ACTION | NONE |

Se o skew residual vier a causar falha na fonte, decidir entre sincronizar o Windows ou, só com evidência, pré-registrar uma tolerância.

**Próximo passo:** com ordem do operador, escolher uma das frentes:
- sincronização do relógio (W32Time);
- binding de runtime para TRACE e VolSignals (§14.4–14.5);
- validação de conta/PNL na UI (§14.8).

Zero F5.

### 14.13 CHECKPOINT CANÔNICO pós-`dc09d57` + ROTAÇÃO (24/09/2026 ~17:50Z · contexto 222k = WARNING)

Somente estado. Nada foi implementado, nenhum serviço foi reiniciado, sem F5, NT8 não foi tocado, 0 ordens.

**Correção da §14.12.**
- O `DEGRADED` atual tem **uma única causa: o cache histórico**. O `data_quality.degradation` traz exatamente 2 entradas `RC_DQ_FAMILY_UNUSABLE`:
  - gamma_regime: `EF_DC_ZERO_GAMMA_FULL__abot.cache.zg`;
  - structure_location: `EF_DC_CLASSIC_GEX_PROFILE_FULL__abot.cache.so` e `…sv`.
- TRACE, VolSignals, MenthorQ, FR_FROZEN_BLOCK e FR_ROOT_CLASSIC_COPY **não** entram na degradação. Aparecem só como reason codes informativos ou efeito zero.
- `FR_CACHE_HISTORY` é fixo em UNKNOWN em `quality.mjs` ("freshness não se aplica a leitura ao vivo"). Essas famílias pertencem a grupos com leitura ativa ⇒ **DQ VALID é inalcançável ao vivo com o contrato atual**. É um teto estrutural, não defeito de dado. Mudar isso exige decisão canônica pré-registrada.

**Estado confirmado (snapshot `…#mufslpj2-60`, 17:49Z)**

| Item | Estado |
|---|---|
| Runtime | RUNNING LIVE · 15/15 rotas · `last_cycle_error` null |
| DQ | DEGRADED · DATA_INVALID 0 desde o fix |
| Fontes | FR_ROOT_ORDERFLOW / FR_CLASSIC / FR_STATE FRESH |
| Dimensões | delta_positioning, second_order_flows e flow_unknown_semantics USABLE · gamma_regime, structure_location e vol_skew PARTIAL |
| Robot | OFF · HARD_DISABLED · NONE · gate `SOURCE_NOT_FROZEN` agora PASS |
| Executor | READ_ONLY · 27 contas / 5 elegíveis · FLAT · 0 ordens |

**FR_FROZEN_BLOCK**
- 8 campos legados da raiz (iv30d, extended_zone, spotgamma, qscore, dark_pool_analysis, blind_spots, bl_scores, implied_vol).
- Congelados **na fonte**, por constância de valor.
- Família NON_EVIDENCE: sem efeito no JEV e sem relação com o gate `SOURCE_NOT_FROZEN`, que olha só FR_ROOT_ORDERFLOW.

**Cache histórico**
- AoClassicCache (PersistCache do AlfaOmegaClassic, no NT8): 11 campos `abot.cache.*`.
- O snapshot congelado `context/jev-future/data/aoclassiccache-frozen/20260923/` é só pesquisa.
- Não há adapter nem binding.

**MenthorQ**
- ZERO_EFFECT, sem conexão com o runtime: o bloco `levels` só existe na raiz composta, que não é lida, e o HT09 continua BLOCKED_PENDING.
- O contrato `POSITIVE_CONFIRMATION_ONLY_NON_BLOCKING` está preservado.

**Runtime: SESSION_BOUND** ⚠️
- `node src/jev/cli.mjs --serve` **PID 30468**, cadeia de pais: cmd 55228 ← npm 24188 ← bash 37280/79892, a tarefa em segundo plano da sessão Claude `8292e7dd…` (tarefa `by272zwfr`).
- **Deve morrer quando esta sessão encerrar.**
- Não existe launcher, watchdog, tarefa agendada ou serviço do JEV. O `pm2` da máquina é da produção (bot01–bot25, fora de escopo, intocado).
- **Ao abrir a próxima sessão:** verificar se `:3590`/`:3591` escutam. Se não, subir `npm run serve`; o mecanismo documentado é o da §13.4. O executor NT8 reconecta sozinho, sem F5.

**Agent:** `:3592` sem processo · provider none · opcional · não afeta a DQ · adiado.

**Contas:** NT8 27 · IJC 27/5 · UI não confirmada · nenhuma conta selecionada · PNL, posição e preço médio NÃO validados.

**W32Time:** STOPPED · offset ≈ −3,6 s · ACTION NONE.

**Testes desta sessão:**
- `npm test` 107/107 PASS;
- `smoke` PASS;
- `smoke:bridge` PASS;
- F01–F06: regressão confirmada contra o código antigo.

**Git**
- HEAD `dc09d57` = origin/main.
- Não commitado: só esta §14.13, neste handoff.
- Não rastreados, fora de escopo e intocados:
  - `config/kimi-provider.json`
  - `context/jev-future/JEV_KIMI_PROVIDER_20260924.md`
  - `handoffs/HANDOFF_CODEX_INVICTUS_JEV_UI_V2_20260924.md`
  - `handoffs/assets/*V2*`
  - `handoffs/rotation/`
  - `scripts/`
- Evidências de captura (JSON) ficaram só no scratchpad da sessão, fora do repositório.

**Sequência técnica por dependência (nada executado):**
1. Launcher persistente do runtime.
2. Validação de conta/PNL pelo operador (pode correr em paralelo).
3. Sincronizar o W32Time e medir o skew de novo.
4. Decisão canônica sobre as famílias só-históricas (cache) na DQ.
5. Binding do TRACE.
6. VolSignals: primeiro a `freshness_basis` no contrato, depois o adapter.
7. MenthorQ (níveis + HT09).
8. Depois disso: regras de lado, validação 20–40 dias, Robot/SIM e a boleta manual (lote novo, com F5 próprio). Sempre com ordem explícita.

**PRÓXIMO PASSO EXATO (nova sessão via `START_JEV_CLAUDE.ps1`):**
1. Ler `CLAUDE.md` e esta §14.13.
2. Checar `:3590` (`GET /jev/v1/health`). Se estiver fora do ar, subir `npm run serve`.
3. Aguardar a ordem do operador para o item 1 da sequência. **Zero F5.**

### 14.14 JEV_RUNTIME_PERSISTENCE (24/09/2026 ~19:00–19:24Z, ordem do operador · etapa 1 de readiness)

Somente infraestrutura de execução. Lógica JEV intocada (`src/` sem diff), NT8 não tocado, sem F5, 0 ordens. Não alterados: `quality.mjs`, cache histórico, TRACE, VolSignals, Agent `:3592`, regras de lado, Robot, boleta, conta/PNL, W32Time.

**Before (reconciliação pós-rotação, 18:28–19:00Z)**
- `:3590`/`:3591` UP · PID **30468** (`node src/jev/cli.mjs --serve`) · **UNMANAGED_ORPHAN**: pais cmd 55228 ← npm 24188 ← bash 37280/79892 vivos, ancestral 75448 (sessão Claude anterior) morto. Sobreviveu à rotação por acaso; nada o recuperaria.
- Captura antes da transição (snapshot `…#mufslpj2-183`): `read_only` true · `orders_enabled` false · `last_cycle_error` null · DQ DEGRADED (só cache: zg / so / sv) · DATA_INVALID 0 · ORDERFLOW/CLASSIC/STATE/INDICATOR_DERIVED FRESH · Robot OFF · `orders_emitted` 0.

**Artefatos (novos, `tools/jev-runtime/`)**
- `Start-JevRuntime.ps1`: supervisor. Sobe **o mesmo comando de `npm run serve`** (`"C:\Program Files\nodejs\node.exe" src/jev/cli.mjs --serve`, cwd `C:\Users\ADM\Claude-JEV\code`), sem npm/cmd/bash intermediários. Caminhos absolutos.
  - Single-instance em duas camadas:
    - mutex `Local\INVICTUS_JEV_RUNTIME_SUPERVISOR`: um segundo launcher sai com `NO_SECOND_INSTANCE`, exit 0;
    - listener `:3590` já é JEV: **ADOPTED_EXISTING**, sem spawn.
  - Identidade JEV: `node.exe` + CommandLine `src/jev/cli.mjs … --serve` (sem `--replay`). Se a CommandLine for ilegível (processo nascido no token restrito da sessão Claude, caso do 30468), a identidade vem da API (`IDENTITY_VIA_HEALTH_API`): o node é dono do `:3590` e o health tem o schema JEV em LIVE.
  - Saúde (probe 15 s): `ok`, `mode=LIVE`, `read_only=true`, `orders_enabled=false`, `:3591` listen e `last_cycle_at` ≤ 300 s.
  - Recuperação controlada:
    - processo morreu ⇒ `NODE_EXITED` + backoff de 5→60 s + `NODE_STARTED`;
    - 4 probes ruins seguidos (após 90 s de tolerância) ⇒ `NODE_KILL_CONTROLLED` só se for JEV ⇒ restart;
    - porta ocupada por não-JEV ⇒ `PORT_CONFLICT_FOREIGN`, nada é morto, exit 3.
  - Exit codes: 0 = NO_SECOND_INSTANCE / `-Once` OK · 3 = PORT_CONFLICT_FOREIGN · 4 = node/repo ausente.
  - O node roda com console **próprio e oculto** (`-WindowStyle Hidden`, não `-NoNewWindow`). Ver o defeito D1 abaixo.
- `Install-JevRuntimeTask.ps1`: registra (idempotente, `-Force` só na própria tarefa) ou remove (`-Uninstall`) a tarefa. Não toca em nenhuma outra tarefa, no PM2 nem em outro projeto.

**Task Scheduler**
- `\InvictusJev\INVICTUS_JEV_RUNTIME`: única tarefa nessa pasta; não há outras tarefas JEV/INVICTUS.
- Principal: `OLIVER\ADM` · Interactive · RunLevel Limited (sem admin; roda enquanto o usuário estiver logado).
- Gatilhos:
  - AtLogOn do usuário;
  - watchdog Once + repetição de 5 min, indefinida.
- Settings: MultipleInstances **IgnoreNew** · RestartOnFailure **999 × 1 min** · ExecutionTimeLimit **0 (ilimitado)** · roda em bateria · StartWhenAvailable · não para em idle.
- Ação: `conhost.exe --headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Users\ADM\Claude-JEV\code\tools\jev-runtime\Start-JevRuntime.ps1" -RepoRoot "C:\Users\ADM\Claude-JEV\code"`. Sem janela, sem depender de terminal.
- Reinstalar ou remover: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\jev-runtime\Install-JevRuntimeTask.ps1 [-Uninstall]`.

**Logs**
- Supervisor: `%LOCALAPPDATA%\InvictusJevCode\runtime\supervisor-YYYYMMDD.log`.
- Node: `%LOCALAPPDATA%\InvictusJevCode\runtime\node-<ts>.out.log` / `.err.log`, um par de arquivos por start, retenção de 40 pares.
- Os logs JSONL do runtime continuam em `%LOCALAPPDATA%\InvictusJevCode\logs\`, sem mudança.

**Transição do PID 30468**
1. Tarefa registrada e iniciada.
2. O supervisor 78592 adotou o 30468 (`IDENTITY_VIA_HEALTH_API` + `ADOPTED_EXISTING`).
3. Só então foi feito `Stop-Process` **somente no node 30468**.
4. O supervisor fez `NODE_EXITED` e subiu o **PID gerenciado 9680** em ~7 s. Os pais antigos (cmd/npm/bash) morreram junto.
5. Executor NT8 reconectou sozinho (`executor_report` READ_ONLY / COMPLETE a cada 2 s). NT8 não foi reiniciado.

**Testes**

| Teste | Resultado | Evidência |
|---|---|---|
| T1 tarefa existe/enabled | PASS | Enabled=True, IgnoreNew, 999×PT1M, ExecTimeLimit PT0S |
| T2 `:3590`/`:3591` UP gerenciado | PASS | listener = PID do supervisor; `:3591` 401 sem token (esperado) |
| T3 ≥ 3 ciclos | PASS | `#mufwgjp9-2→6` (4 avanços, ~34 s) |
| T4 `last_cycle_error` | PASS | null em todas as amostras |
| T5 DATA_INVALID | PASS | 0 |
| T6 ORDERFLOW/CLASSIC/STATE | PASS | FRESH |
| T7 launcher de novo | PASS | manual: `NO_SECOND_INSTANCE` EXIT 0 (2×) · `Start-ScheduledTask` extra ignorado · 1 supervisor, 1 node |
| T8 matar só o node gerenciado | PASS | 9680 → 26576 (~7 s); após a correção D1: 26576 → **25316** (~8 s) |
| T9 pós-restart | PASS | `#mufwm341-2→5` e `#mufx0d9i-6→10`; err null; DATA_INVALID 0; FRESH |
| T10 independe de Claude/bash | PASS | cadeia `25316 node ← 27376 powershell ← conhost ← svchost -s Schedule` |
| Extra: matar o supervisor | PASS (após D1) | watchdog subiu o supervisor 27376 em ~147 s; `ADOPTED_EXISTING` 25316; runtime sem interrupção |

**Defeito D1 (achado e corrigido nesta etapa)**
- Na 1ª versão, o node era iniciado com `-NoNewWindow` e ficava preso ao console do `conhost --headless` da tarefa.
- Com o supervisor morto, o conhost continuava vivo. O Scheduler via a tarefa como "Running" e ignorava o watchdog: `LastTaskResult 0x800710E0`, instância já em execução.
- Correção: o node passa a ter console próprio oculto. Revalidado: supervisor morto ⇒ conhost sai ⇒ tarefa Ready ⇒ watchdog recupera.

**Não testado:** reboot/logoff (fora do escopo desta rodada). A tarefa é Interactive, então só roda com o usuário logado. "Rodar sem login" exigiria S4U/admin, que não está disponível nesta sessão.

**Estado final (19:24Z)**

| Item | Estado |
|---|---|
| Runtime | **PERSISTENT / AUTO-RECOVERABLE / SINGLE-INSTANCE** · supervisor 27376 · node gerenciado **25316** |
| Portas | `:3590` UP · `:3591` UP |
| Snapshot / erros | snapshot avançando · `last_cycle_error` null · `read_only` true · `orders_enabled` false |
| DQ | DEGRADED, só cache: `abot.cache.zg` / `so` / `sv` · DATA_INVALID 0 |
| Fontes | ORDERFLOW / CLASSIC / STATE FRESH |
| Robot / ordens | Robot OFF · 0 ordens · executor READ_ONLY |

- **Suítes:** Node/C# não re-rodadas; o código JEV não mudou.

**Próximo passo:** o `npm run serve` manual **não é mais o mecanismo**. Se `:3590` cair, o supervisor e a tarefa recuperam sozinhos. Diagnóstico: `Get-Content $env:LOCALAPPDATA\InvictusJevCode\runtime\supervisor-*.log -Tail 20`. Próxima etapa da sequência §14.13 (item 2 em paralelo ou item 4, decisão do cache histórico) **só com ordem do operador**. Zero F5.

## 14. ROTAÇÃO DE SESSÃO (24/09/2026, WARNING 220k)

- **Estado JEV exato:** lote RTH de 4 arquivos INSTALADO (backup `20260924-124658`) · F5 feito pelo operador (F5_COUNT_THIS_LOT=1, SECOND_F5_ALLOWED=NO) · `04-verify PostF5` PASS · backend PASS (bridge :3590 LIVE, control plane :3591 UP, JEV UNKNOWN, Robot OFF, decisão NONE, 0 ordens) · checagens VISUAIS da janela IJC pendentes do operador (§13.5) · FINAL do lote = PARTIAL até o operador confirmar.
- **Serve:** o processo atual em :3590/:3591 (PID 30468) NÃO foi iniciado por esta sessão (nota §13.5).
- **Commit:** HEAD `62973f3` (main; commit feito fora desta sessão, já inclui §13.4–§13.5 e a linha do `CLAUDE.md`). Só a §14 deste handoff fica pendente de commit. Nenhum código JEV alterado. Untracked alheios (Kimi, `scripts/`, Codex V2, `handoffs/rotation/`) continuam fora de commit.
- **Testes nesta sessão:** `01-precheck -ForInstall` PASS · `02-backup` PASS · `03-install -WhatIf`/`-Confirm` PASS · `04-verify PreF5` PASS · `04-verify PostF5` PASS. Suítes Node/C# não re-rodadas (código inalterado).
- **Fora do JEV nesta sessão (registrado nos handoffs próprios, não neste repo):**
  - VolSignals RTH capture COMPLETE → `C:\Users\ADM\.claude\volsignals-audit\SESSION_PACK_TRACE_COMPARISON_HANDOFF_V2.md` §7 (run canônico `data/runs/rth-20260924T155720Z/market-frames.ndjson`).
  - Copy Engine order storm: root cause REENTRY + self-copy; patch planejado NÃO aplicado, testes 0/6 → `C:\Users\ADM\Downloads\Club gamma\Handof TTW\HANDOFF_COPY_ENGINE_ORDER_STORM_20260924.md` (último checkpoint). NT8 aberto: não editar `bin\Custom`.
- **Próximo passo exato:** (1) operador confirma os itens visuais da janela IJC (§13.5) → marcar RTH_TEST_READY; (2) commitar docs desta sessão com stage explícito (`CLAUDE.md`, este handoff) só com ordem; (3) Copy Engine: nova sessão executa o NEXT_STEP do handoff ORDER_STORM. Zero F5.
