# GC/SI = ES/NQ (gcsi-eqv) — instalação e rollback (OPERADOR)

Estado em 14/10/2026: **somente staging**. Nada instalado no NT8 nem no AOT; nenhum F5; nenhum deploy; zero ordens.
JEV: modify_file `jd_mv87oan299086e` (0,78) · JEV DIFF A `req_01a13add7635705ebd0106b75b80ef76` (0,78).

## Arquivos
| staging | destino (instalação = operador) |
|---|---|
| `candidate/AlfaOmegaSharedState.cs` | `Documents\NinjaTrader 8\bin\Custom\Indicators\TTW_DarkProjects\AlfaOmegaSharedState.cs` |
| `candidate/AlfaOmegaBridge.cs` | `Documents\NinjaTrader 8\bin\Custom\AddOns\AlfaOmegaBridge.cs` |
| `candidate/aot-bff.js` | `.claude\aot\aot-bff.js` |
| `candidate/aot-gcsi-sim.js` (novo) | `.claude\aot\aot-gcsi-sim.js` |

Originais em `current/` (sha256 em `current.sha256`). `aot-sim.js` NÃO muda.

## Instalação (quando o operador ordenar)
1. Confirmar que os arquivos de destino ainda batem com `current.sha256` (se não baterem, NÃO copiar: refazer o candidato sobre a versão nova).
2. Copiar os dois `.cs` e dar **um** F5 no NT8 (operador). Conferir no `:5151/state` a chave `anchorGcSi` (`source: "AoGate.GcSi"`). Força GC/SI só fica válida após 30 min de cobertura contínua de tape (fail-closed até lá: `why = "forca fraca ..."`).
3. Copiar `aot-bff.js` + `aot-gcsi-sim.js` e reiniciar o BFF. Com `AOT_GCSI_SIM` ausente/off nada de simulação GC/SI roda; o FLOW GC·SI passa a mostrar `ESPERANDO CONFIRMAÇÃO` quando radar 4/4 sem força.
4. Simulação GC/SI (opcional, só simulação): `AOT_GCSI_SIM=on`. Estado/eventos/trades em `.claude\aot\history-gcsi\` (exclusivo). Conferir `GET /gcsi/sim`, `/gcsi/events`, `/gcsi/history`. Nunca aparece em `/sim/events`.

## Rollback
- BFF: `AOT_GCSI_SIM=off` (desliga só a simulação) **ou** restaurar `current/aot-bff.js`, apagar `aot-gcsi-sim.js`, reiniciar o BFF. `history-gcsi/` pode ser arquivado; não é lido por mais nada.
- NT8: restaurar `current/AlfaOmegaSharedState.cs` e `current/AlfaOmegaBridge.cs` e F5. Sem `anchorGcSi` o BFF candidato fica fail-closed (nunca abre GC/SI).

## Limites
Sem ordens reais, sem conta `NT8CONTA - 2026082018LIVE` (não observada no NT8), sem ligação ao executor INVICTUS. Homologação real só em simulação/host NT8 isolado.
