# ALFA OMEGA — INDICATOR LINEAGE (generated)

Built by `tools/jarvis/aot/catalog-build.mjs` from `config/alfaomega-lineage.curated.json`. Every lifecycle claim cites evidence resolved to file:line; unresolvable evidence fails the build. UNKNOWN is kept where unproven; nothing is declared DEPRECATED. Documentation only: no NT8 file is changed.

Rule: Every lineage_status is backed by {file: '<root>:<relpath>', match: '<literal>'} evidence that resolves; roots: nt8 (TTW_DarkProjects), nt8root (Indicators), hist (Desktop/Handof TTW), pkg (Downloads/AlfaOmega_pacote_20260825). Unresolvable evidence FAILS. mtime alone is never lifecycle evidence.

## Generations

- **G1_ORDERFLOW_DOM**: 2026-06-29..2026-07-07 (21 original files; SharedState bus; CONF = ME(Nexus) x MVI(Pulse))
- **G2_FLOWONE**: 2026-07-22.. (FlowOne absorbs ME/CONF, tape detectors, Marker, DOM, Velocity)
- **G3_OPTIONS_GEX**: <=2026-07-13..2026-08 (11 options indicators on :3500/:3457 + FlowOne HYBRID)
- **G4_CONSOLIDATOR_ALFA**: 2026-08..2026-09 (consolidator :3495, Copilot Unificado, alpha relays, Classic/State)
- **DIST_20260825**: 26-name client distribution set = operator visible list (+Login, Boleta)

## Counts (lifecycle_status; kind for non-components)

| status | entries |
|---|---|
| SUPPORT_COMPONENT | 31 |
| OUT_OF_SUITE_PRE_HISTORY | 22 |
| ACTIVE_STANDALONE | 21 |
| UNKNOWN | 17 |
| MERGED_INTO_FLOWONE | 7 |
| SEPARATE_PROJECT_B3 | 6 |
| CONTROL_UI | 2 |
| ACTIVE_AGGREGATOR | 1 |
| SOURCE_TOPOLOGY | 1 |
| PROPOSAL_NEVER_BUILT | 1 |
| CAPABILITY_LAYER | 1 |
| GROUP | 1 |
| FLOWONE_HYBRID | 1 |
| SUPERSEDED | 1 |
| **total** | 113 (evidence resolved: 129) |

## Entries

| id | kind | lifecycle | generation | successor | evidence |
|---|---|---|---|---|---|
| `nt8:AlfaOmegaNexus` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:46<br>nt8:AlfaOmegaFlowOne.cs:501 |
| `nt8:AlfaOmegaPulse` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:501<br>nt8:AlfaOmegaFlowOne.cs:4619 |
| `nt8:AlfaOmegaFusion` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:501 |
| `nt8:AlfaOmegaMarker` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:45 |
| `nt8:AlfaOmegaPressure` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:44 |
| `nt8:AlfaOmegaDepth` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:44 |
| `nt8:AlfaOmegaVelocity` | COMPONENT | MERGED_INTO_FLOWONE | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:44 |
| `nt8:AlfaOmegaPhantom` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:732 |
| `nt8:AlfaOmegaStops` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM | nt8:AlfaOmegaFlowOne | nt8:AlfaOmegaFlowOne.cs:732 |
| `nt8:AlfaOmegaGravity` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | nt8:AlfaOmegaFlowOne.cs:732 |
| `nt8:AlfaOmegaVision` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | nt8:AlfaOmegaFlowOne.cs:39 |
| `nt8:AlfaOmegaCopilotUnificado` | COMPONENT | ACTIVE_AGGREGATOR | G4_CONSOLIDATOR_ALFA |  | nt8root:AlfaOmegaCopilotUnificado.cs:2<br>pkg:MANIFESTO.md:35 |
| `nt8:MenthorQGammaEngine` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | nt8root:MenthorQGammaEngine.cs:329<br>pkg:MANIFESTO.md:37 |
| `nt8:AlfaOmegaOrderflow` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | nt8:AlfaOmegaOrderflow.cs:4<br>pkg:MANIFESTO.md:39 |
| `nt8:AO_DataLayer` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | nt8root:AO_DataLayer.cs:4<br>nt8root:MenthorQGammaEngine.cs:419 |
| `relay:GammaGexUpstream3530` | SOURCE_TOPOLOGY |  | G4_CONSOLIDATOR_ALFA |  | nt8:AlfaOmegaAlfaBotRelay.cs:27 |
| `hist:AlfaOmegaWallsNQ` | PROPOSAL_NEVER_BUILT |  | G3_OPTIONS_GEX |  | hist:HANDOFF_8_INDICADORES_NOVOS_20260728.md:16 |
| `nt8:AlfaOmegaDivergenceESX` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | hist:HANDOFF_8_INDICADORES_NOVOS_20260728.md:20<br>pkg:MANIFESTO.md:17 |
| `layer:Hiro.GammaCurve` | CAPABILITY_LAYER |  | G3_OPTIONS_GEX |  | hist:HANDOFF_8_INDICADORES_NOVOS_20260728.md:276 |
| `group:OptionsFamily11` | GROUP |  | G3_OPTIONS_GEX |  | hist:LEVANTAMENTO_11_INDICADORES_OPCOES_AOT_20260722.md:7 |
| `nt8:AlfaOmegaCallPutClassing` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:16 |
| `nt8:AlfaOmegaFlowOneHybrid` | COMPONENT | FLOWONE_HYBRID | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:18 |
| `nt8:AlfaOmegaOptionsFlowHiro` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:19 |
| `nt8:AlfaOmegaClassic` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:20 |
| `nt8:AlfaOmegaDexGexFlow` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:21 |
| `nt8:AlfaOmegaGammaPressure` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:22 |
| `nt8:AlfaOmegaGexByStrike` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:23 |
| `nt8:AlfaOmegaHiro` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:24 |
| `nt8:AlfaOmegaLogin` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:25 |
| `nt8:AlfaOmegaNetGex0DTE` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:26 |
| `nt8:AlfaOmegaOpenFlow` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:27 |
| `nt8:AlfaOmegaState` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:28 |
| `nt8:AlfaOmegaTrace` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:29 |
| `nt8:AlfaOmegaTraceCloud` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:30 |
| `nt8:AlfaOmegaVixLine` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:31 |
| `nt8:AlfaOmegaVolDashboard` | COMPONENT | ACTIVE_STANDALONE | G3_OPTIONS_GEX |  | pkg:MANIFESTO.md:32 |
| `nt8:AoBoleta` | COMPONENT | CONTROL_UI | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:33 |
| `nt8:AoControlCenter` | COMPONENT | CONTROL_UI | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:34 |
| `nt8:AlfaOmegaFlowOne` | COMPONENT | ACTIVE_STANDALONE | G2_FLOWONE |  | pkg:MANIFESTO.md:36 |
| `nt8:AlfaOmegaNetDrift` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:38 |
| `nt8:QuantDataEngine` | COMPONENT | ACTIVE_STANDALONE | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:40 |
| `nt8:AlfaOmegaVectorPro` | COMPONENT | ACTIVE_STANDALONE | G1_ORDERFLOW_DOM |  | pkg:MANIFESTO.md:41 |
| `nt8:AlfaOmegaSharedState` | COMPONENT | SUPPORT_COMPONENT | G1_ORDERFLOW_DOM |  | pkg:MANIFESTO.md:49 |
| `nt8:AlfaOmegaTapeStyle` | COMPONENT | SUPPORT_COMPONENT | G1_ORDERFLOW_DOM |  | pkg:MANIFESTO.md:50 |
| `nt8:AlfaOmegaVector` | COMPONENT | SUPPORT_COMPONENT | G1_ORDERFLOW_DOM |  | pkg:MANIFESTO.md:51 |
| `nt8:AoAccountNames` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:52 |
| `nt8:AoAccounts` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:53 |
| `nt8:AoBrand` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:55 |
| `nt8:AoCopyStatus` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:56 |
| `nt8:AoDiag` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:57 |
| `nt8:AoExecClient` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:58 |
| `nt8:AoHud` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:59 |
| `nt8:AoInput` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:60 |
| `nt8:AoNiveis` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:61 |
| `nt8:AoSkin` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:62 |
| `nt8:AoStopTakeCore` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:63 |
| `nt8:AoTheme` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:64 |
| `addon:AoBasicEntryLink` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | pkg:MANIFESTO.md:54 |
| `nt8:AlfaOmegaCopilotES` | COMPONENT | SUPERSEDED | G1_ORDERFLOW_DOM |  | hist:PROPOSTA_HUB_MOBILIDADE_E_DECISOES_20260724.md:5 |
| `nt8:AlfaOmegaCopilotNQ` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | hist:PROPOSTA_HUB_MOBILIDADE_E_DECISOES_20260724.md:6 |
| `nt8:AlfaOmegaCallPutClassingB3` | SEPARATE_PROJECT_B3 |  |  |  | pkg:MANIFESTO.md:83 |
| `nt8:AlfaOmegaGammaEngineB3` | SEPARATE_PROJECT_B3 |  |  |  | pkg:MANIFESTO.md:83 |
| `nt8:AlfaOmegaGexByStrikeB3` | SEPARATE_PROJECT_B3 |  |  |  | pkg:MANIFESTO.md:83 |
| `nt8:AlfaOmegaQuantEngineB3` | SEPARATE_PROJECT_B3 |  |  |  | pkg:MANIFESTO.md:83 |
| `nt8:AlfaOmegaTraceB3` | SEPARATE_PROJECT_B3 |  |  |  | pkg:MANIFESTO.md:83 |
| `nt8:AoB3Core` | SEPARATE_PROJECT_B3 |  |  |  | pkg:MANIFESTO.md:83 |
| `nt8:AlfaOmegaAlfaBotRelay` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaAlfaBotRelay.cs:41 |
| `nt8:AlfaOmegaAlfaConsolidatorRelay` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaAlfaConsolidatorRelay.cs:23 |
| `nt8:AlfaOmegaAlfaDataRelay` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaAlfaDataRelay.cs:26 |
| `nt8:AlfaOmegaAlfaGammaRelay` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaAlfaGammaRelay.cs:32 |
| `nt8:AlfaOmegaAlfaQRelay` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaAlfaQRelay.cs:25 |
| `nt8:AlfaOmegaAuthV2` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaAuthV2.cs:37 |
| `nt8:AlfaOmegaCopilotAssetWindow` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | nt8:AlfaOmegaCopilotAssetWindow.cs:16<br>hist:HANDOFF_SUITE_ALFA_OMEGA_NT8.md:146 |
| `nt8:AlfaOmegaCopilotGC` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AlfaOmegaCopilotGC.cs:29 |
| `nt8:AlfaOmegaCopilotIndicator` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | nt8:AlfaOmegaCopilotIndicator.cs:29<br>hist:HANDOFF_SUITE_ALFA_OMEGA_NT8.md:144 |
| `nt8:AlfaOmegaFlowOnePersistence` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaFlowOnePersistence.cs:31 |
| `nt8:AlfaOmegaRelayEndpoint` | COMPONENT | SUPPORT_COMPONENT | UNKNOWN |  | nt8:AlfaOmegaRelayEndpoint.cs:26 |
| `nt8:AlfaOmegaSMC` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AlfaOmegaSMC.cs:38 |
| `nt8:AlfaOmegaStorm` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | nt8:AlfaOmegaStorm.cs:28<br>hist:HANDOFF_SUITE_ALFA_OMEGA_NT8.md:140 |
| `nt8:AlfaOmegaTrackerPro` | COMPONENT | UNKNOWN | G1_ORDERFLOW_DOM |  | nt8:AlfaOmegaTrackerPro.cs:23<br>hist:HANDOFF_SUITE_ALFA_OMEGA_NT8.md:142 |
| `nt8:AoInputProbe` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AoInputProbe.cs:40 |
| `nt8:AoLicenca` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AoLicenca.cs:29 |
| `nt8:AoLicencaUi` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AoLicencaUi.cs:20 |
| `nt8:AoLogin` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AoLogin.cs:30 |
| `nt8:AoMarcadores` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | nt8:AoMarcadores.cs:41<br>nt8:AoMarcadores.cs:2 |
| `nt8:AoMarketDataPublisher` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | nt8:AoMarketDataPublisher.cs:36<br>nt8:AoMarketDataPublisher.cs:2 |
| `nt8:AoPressSessao` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | nt8:AoPressSessao.cs:24<br>nt8:AoPressSessao.cs:2 |
| `nt8:AoProbeBidAsk` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8:AoProbeBidAsk.cs:38 |
| `nt8:AoTapeEngine` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | nt8:AoTapeEngine.cs:41<br>nt8:AoTapeEngine.cs:4 |
| `nt8:AO_DecisionLayer` | COMPONENT | SUPPORT_COMPONENT | G4_CONSOLIDATOR_ALFA |  | nt8root:AO_DecisionLayer.cs:62<br>nt8root:MenthorQGammaEngine.cs:1446 |
| `nt8:BmAbsorptionSweeps` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:BmAbsorptionSweeps.cs:40 |
| `nt8:BmBreakevenPoint` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:BmBreakevenPoint.cs:52 |
| `nt8:BmCorrelationTracker` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:BmCorrelationTracker.cs:42 |
| `nt8:BmCrossBbo` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:BmCrossBbo.cs:33 |
| `nt8:BmPriceInversion` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:BmPriceInversion.cs:37 |
| `nt8:FlowSubPanel` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:FlowSubPanel.cs:29 |
| `nt8:GammaChartOverlayEngine` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaChartOverlayEngine.cs:28 |
| `nt8:GammaClassificationTypes` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaClassificationTypes.cs:23 |
| `nt8:GammaDashboardAPI` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaDashboardAPI.cs:34 |
| `nt8:GammaDataMiner` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaDataMiner.cs:44 |
| `nt8:GammaEventEngine` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaEventEngine.cs:22 |
| `nt8:GammaExportServer` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaExportServer.cs:60 |
| `nt8:GammaExportTypes` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaExportTypes.cs:23 |
| `nt8:GammaLiveInspector` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaLiveInspector.cs:35 |
| `nt8:GammaMarketClassifier` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaMarketClassifier.cs:18 |
| `nt8:GammaRegimeDetector` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaRegimeDetector.cs:23 |
| `nt8:GammaRuntimeDumper` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaRuntimeDumper.cs:38 |
| `nt8:GammaSnapshotEngine` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaSnapshotEngine.cs:22 |
| `nt8:GammaStressScore` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GammaStressScore.cs:19 |
| `nt8:GexDexVision` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:GexDexVision.cs:26 |
| `nt8:MenthorQGammaEntryCore` | COMPONENT | UNKNOWN | UNKNOWN |  | nt8root:MenthorQGammaEntryCore.cs:41 |
| `nt8:ShadowWavesFlow` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:ShadowWavesFlow.cs:30 |
| `nt8:SpotGamma` | OUT_OF_SUITE_PRE_HISTORY |  |  |  | nt8root:SpotGamma.cs:48 |
