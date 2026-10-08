# INVICTUS — PACK BASELINE DO ESTADO INSTALADO (OLIVER) — 2026-10-08

**Classificação (JEV NEWPACK DIFF T2, req_01a11d387b8c7c768ab5b803fc1a76e2): BASELINE do estado instalado, validado OFFLINE.**
**NÃO é candidato a release. NÃO é patch. NÃO é versão nova.**

## Restrições
- NÃO importar no NinjaTrader vivo. NÃO distribuir a clientes. NÃO usar em conta real.
- O NinjaTrader vivo está congelado e somente em observação (regra canônica de 2026-10-08).
- Este pack só vira candidato a release depois de: (1) JEV DIFF T3 = A do EXIT_LAYER_FIX X2, que exige um ciclo real em conta Sim no NinjaTrader (entrada, saída, entrada, saída); (2) validação em mercado ao vivo; (3) JEV FINAL.

## O que é
Reprodução importável do estado instalado na OLIVER em 2026-10-08 17:20 BRT:
P-GCAP + FORCA_JANELA_30 + EXIT_LAYER_FIX X2.

- Baseline de origem: `newpack_baseline\20261008-172053` (481/481 arquivos conferidos contra o instalado; sha256 do manifesto 9372631a773345a29f9f3db849461c1fea995ca7f444d357ebfc3a79866067f4).
- Zip: `AlfaOmega_OLIVER_INVICTUS_BASELINE_ATUAL_20261008_import.zip`
  SHA256 975b5955b9f4280cb9945981e07c89670a304fce93d8d2c94cea0cc98b79ba49 · 700.149 bytes · 60 entradas
  (Info.xml + AdditionalReferences.txt + Newtonsoft.Json.dll + 57 fontes; mesma lista do pack OLIVER já aceito pelo importador).
- Manifesto das entradas: `MANIFEST_SHA256.txt` · relatório: `EQUIVALENCIA.json`.

## O que NÃO está no zip
- As outras 8 DLLs da máquina (terceiros e outros produtos) e os fontes de outros produtos.
- `AlfaOmegaAuthV2.cs` (fica como está em cada máquina; hash do baseline 4a64c54e…).
- Configuração, estado de execução, logs, arquivos de ligação/segredo.

## Validado OFFLINE (pasta `tests`)
| Prova | Resultado |
|---|---|
| Equivalência com o baseline | faltando 0 · sobrando 0 · alterados 0 |
| Roundtrip do zip | 60/60 · diferença de conteúdo 0 |
| Árvore reconstruída | 474/474 idêntica ao baseline |
| Compilação completa | 464/464 · 0 erros |
| EXIT_LAYER_FIX X2 — harness | 28/28 |
| EXIT_LAYER_FIX X2 — bancada do executor | 32/32 |
| FORCA_JANELA_30 — 44 sessões | 182.160 passos 100% iguais · 860/860 entradas |
| P-GCAP — independência de API | idêntico ao resultado da OLIVER instalada |
| P-GCAP — harness antigo do gate por Press | NÃO APLICÁVEL (passo substituído pela FORCA_JANELA_30) |
| Varredura de segredos | 0 achados em 59 entradas de texto |
| Comparação com o pack de referência | 54 iguais · 6 diferentes (3 da FORCA_JANELA_30 + 3 do EXIT_LAYER_FIX X2) |
| NinjaTrader vivo | 0 arquivos alterados |

## PENDENTE (não validado)
- **Validação em mercado ao vivo.** No teste Sim de 2026-10-08 o robô não abriu nenhuma entrada; a camada de saída não foi exercitada no NinjaTrader real.
- **JEV DIFF do EXIT_LAYER_FIX X2 = B** (req_01a11c94be5e775c812f9a07b54e3143); T3 não submetido.
- **Importação deste zip** em um NinjaTrader: não feita nesta rodada (proibida no vivo). A aceitação pelo importador é inferida pela lista/metadados iguais aos do pack de referência.
- Limite conhecido do desenho da saída: ordem de fechamento que some sem rastro não é reenviada; a posição fica aberta até o alerta de 60 s e a ação do operador.

## Configuração (pasta `config_companheira`)
Cópia de referência dos 7 arquivos de configuração do robô no momento da captura, com o identificador da conta de corretora MASCARADO. Não é instalável pelo importador. Os hashes dos arquivos originais estão em `SHA256SUMS_ORIGINAIS.txt`; os originais ficam só no baseline.
Estado na captura: ES/NQ em conta Sim (1 contrato); MES/MNQ desligados (mapeados para a conta real); CopyEngine desligado; PLAY ligado (só Sim).

## Rollback (pasta `rollback_estado_anterior`)
Cópias byte a byte de pacotes já existentes:
- `AlfaOmega_OLIVER_INVICTUS_ROLLBACK_PRE_EXITFIX_X2_import.zip` — devolve os 3 arquivos da saída ao estado anterior ao EXIT_LAYER_FIX X2 — SHA256 745b8651170b478fc2f328af12a7390596d4fdd0f49e875087ad99f1901d8286
- `AlfaOmega_OLIVER_INVICTUS_FORCAJANELA30_ROLLBACK_import.zip` — devolve os 3 arquivos do gate ao estado anterior à FORCA_JANELA_30 (P-GCAP) — SHA256 16497feeead5f38835bc43c8ee83ced6817ec1d1fa38cbb9d840f4ad1e500b37
Para voltar ao estado P-GCAP: aplicar os dois, primeiro o da saída, depois o do gate.

## Decisões JEV desta montagem
- DESIGN T1 req_01a11d3288917ba3ad718c53356754d0 · DESIGN T2 req_01a11d34423f7e0d90dc208e635ad1d3
- DIFF T1 req_01a11d37f74870a98a757a88729dd871 (B) · DIFF T2 req_01a11d387b8c7c768ab5b803fc1a76e2 (pendências de empacotamento)
- FINAL T1 req_01a11d3989bc75a49119fda1994e0370 = **A (1,00) como BASELINE validado offline** · ponto de partida para alterações offline: SIM 0,84 · distribuição/conta real: NÃO 1,00
