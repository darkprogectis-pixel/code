# AUDITORIA — LINHAGEM DOS PACKS E CREDENCIAIS (2026-10-14, sessão 6da2f5d6) — SOMENTE LEITURA

Escopo: leitura. Nenhum TXT foi aberto, lido, copiado, alterado ou hasheado (só nome, tamanho e data). Foram hasheados apenas ZIPs. Nada foi alterado.

## Fontes (caminhos verificados)
- `C:\Users\ADM\Desktop\Handof TTW\HANDOFF\` — existe (packs em `conf-tests\pack-native-20261006\…`).
- `C:\Users\ADM\Downloads\Club gamma\Handof TTW\HANDOFF\` — **NÃO existe**; os handoffs estão direto em `Downloads\Club gamma\Handof TTW\` (158 itens).
- `C:\Users\ADM\Claude-JEV\code\handoffs\` — existe.
- Canônicos usados: `HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md` (inventário de 07/10: 70 ZIPs / 50 sha; famílias; P-GCAP; OLIVER), `Club gamma\…\HANDOFF_MIGRACAO_CHAVES_SERVER_SIDE_20260917.md` §AB.2–AB.4 (convenção de credencial), `HANDOFF_URGENTE_AUTHV2_APIS_20260918.md` (piloto-01), `HANDOFF_ASSISMOREIRA25_20261008.md`, `HANDOFF_RFOGLIO_20261008.md`, `credenciais-packs-20261013/STATE.md`.

## Convenção de credencial (MIGRACAO §AB.2/AB.3, 23/09)
Senha gerada no servidor (`authv2-admin.js user-create-password … --out`), copiada UMA vez para `C:\Users\ADM\Downloads\CREDENCIAL_PILOTO_<NOME>.txt` (só a senha, 20 B), nunca no ZIP; ZIP universal sem identidade. Exceções documentadas: MAGNUM (`CREDENCIAL_MAGNUMTRADERAXI.txt`, 550 B, com rótulos), LUFDUTRA (256 B, com rótulos), ASSISMOREIRA25/RFOGLIO (`CREDENCIAL_<NOME>.txt`, sem "PILOTO_"). piloto-01 (DESTINO) é anterior à senha: usou **código de enrollment** de uso único `Desktop\codigo-piloto-01.txt` (18/09, 24 B, expirado) ⇒ device 92.

## Gerações (cronologia)
| geração | data | o que é | estado |
|---|---|---|---|
| V1 | jul/2026 | `AlfaOmega_suite_import_FIXED.zip` 13be807b (DESTINO, 25/07); escritorio-piloto | SUPERSEDED (migração AuthV2) |
| AuthV2 piloto | 18–20/09 | 5d32a9d3, 6c21d0f7, 8602912b, fe5fd9a2, aaa2dcb3 (SWEET27) | SUPERSEDED |
| pré-INVICTUS indicadores | 21–30/09 | F1 6cae9e5b · F2 eed0e880 · F3 be06f2f6 · FULL 383619a9 · RANYERE robo-only bbfbe755 · HAMZEH 28567964/c52f8034 e LUFDUTRA db8ec051 SUPERSEDED | substituídas pela linha INVICTUS |
| INVICTUS ATUALIZADO | 07/10 | 11 entregas + MAGNUM (packs-clientes-invictus-20261007) | SUPERSEDED (P-RTH1) |
| P-RTH1 | 07/10 | global-rth-api-independence | SUPERSEDED (P-GCAP) |
| **P-GCAP** | 07/10 20:45 | 12 entregas (press-recalibration-20261007) + OLIVER 08/10 00:26 | anterior ao Z30X2 |
| **Z30X2** | 08/10 18:18 | rollout 12 + OLIVER BASELINE (`rollout_20261008\entregas`, `entregas_oliver`) | **ATUAL** |
| Z30X2 novos | 08/10 18:52 / 19:15 | ASSISMOREIRA25, RFOGLIO (`entregas_novos`, `build_delivery_new_client.js`) | **ATUAL** |

## Cópias repetidas pré-INVICTUS (sha medido hoje; mesmo sha = mesmo pack, não cliente novo)
- 6cae9e5b ×7: AIRISON_CESAR_INDICADORES, HAMZEH_INDICADORES, PILOTO_ANAVIEIRA10, PILOTO_RANYERE_MENDONCA, PILOTO_WJAVERTJR (Desktop) + PILOTO_JOAO_HS_FULL_20260921, PILOTO_MARCOS_FULL_20260930 (Downloads).
- eed0e880 ×3: PILOTO_NELSON_CASCO (Desktop e Downloads) + SWEET27_LOGIN_SENHA_20260921_FIX.
- 383619a9 ×2: PILOTO_LUFDUTRA_FULL_STANDALONE = PILOTO_MARCOS_FULL_STANDALONE.
- Distintos: be06f2f6 (WJAVERTJR_FIX_MIRROR), bbfbe755 (RANYERE_INVICTUS_STANDALONE), db8ec051, 28567964, c52f8034, aaa2dcb3, 4 AuthV2 de 18/09.

## Pasta do print — `Downloads\Telegram Desktop\invictus pack 1000` (33 itens)
- 28 ZIPs = 13 P-GCAP (12 + OLIVER) + 13 Z30X2 do rollout (12 + OLIVER BASELINE) + 2 Z30X2 novos. **28/28 SHA conferem** com `MANIFEST_PACOTES_INVICTUS_PGCAP_20261007.txt`, `MASTER_MANIFEST_INVICTUS_Z30X2_20261008.txt` e os 2 manifests novos.
- 4 manifests + 1 pasta `ALFA_OMEGA_WJAVERTJR_INVICTUS_Z30X2_20261008_NAO_IMPORTAR\` (13/10 21:47) = **extração do próprio ZIP Z30X2 do WJAVERTJR** (import Z30X2 7fd049d3 e rollback = P-GCAP F3 8f0aa295, ambos no MASTER_MANIFEST; LEIA_PRIMEIRO, AVISO, ENTRIES, SHA256SUMS). Não é pack novo.
- 0 arquivos de credencial na pasta. Cada cliente aparece 2× (P-GCAP e Z30X2) = **gerações**, não clientes.

## Tabela por cliente
TXT = só metadado. "Doc." = caminho expresso em handoff; "assoc." = vínculo login↔TXT.

| CLIENTE | PRÉ-INVICTUS | P-GCAP 07/10 | Z30X2 08/10 | VERSÃO ATUAL | CONTA AuthV2 | TXT documentado | TXT encontrado | ASSOCIAÇÃO |
|---|---|---|---|---|---|---|---|---|
| AIRISON | 6cae9e5b | 6ce38842 | 092c7c57 | Z30X2 | piloto-airison-cesar (70) | Downloads (handoff) | CREDENCIAL_PILOTO_AIRISON_CESAR.txt 20 B 29/09 | comprovada por nome + data do cadastro; conteúdo não verificado |
| ANAVIEIRA10 | 6cae9e5b | 3f01158a | 65701747 | Z30X2 | piloto-anavieira10 (67) | Downloads (MIGRACAO §AB) | CREDENCIAL_PILOTO_ANAVIEIRA10.txt 20 B 24/09 | comprovada (nome + data = cadastro §AB.4) |
| HAMZEH | 6cae9e5b (28567964/c52f8034 SUPERSEDED) | 5e11ab46 | 41992321 | Z30X2 | piloto-hamzeh-karaki (69) | Downloads (handoff) | CREDENCIAL_PILOTO_HAMZEH.txt 20 B 29/09 | comprovada por nome + data |
| JOAO_HS | 6cae9e5b | 90768f1a | 09334716 | Z30X2 | piloto-joao-hs (64) | só convenção §AB (caminho literal só no dossiê 13/10) | CREDENCIAL_PILOTO_JOAO_HS.txt 20 B 21/09 | **por convenção**; registro de emissão não localizado |
| LUFDUTRA | 383619a9 (db8ec051 SUPERSEDED) | badc1a7b | 0ad297a2 | Z30X2 | piloto-lufdutra (68) | Downloads (handoff) | CREDENCIAL_PILOTO_LUFDUTRA.txt 256 B 28/09 | comprovada por nome + data; formato diferente (com rótulos) |
| MAGNUM | linha native out/2026 (feb2e97a/4f987b6c, documentado, não reconferido) | 8cf9ecc7 | 2fa36df0 | Z30X2 (CLEAN_MACHINE_ONLY) | magnumtraderaxi (72) | `C:\Users\ADM\Downloads\CREDENCIAL_MAGNUMTRADERAXI.txt` | presente 550 B 07/10 00:46 | comprovada (caminho literal) |
| MARCOS | 6cae9e5b → 383619a9 | f8c667c5 | 3f9b8441 | Z30X2 | piloto-marcos-monteiro (71) | `C:\Users\ADM\Downloads\CREDENCIAL_PILOTO_MARCOS_SJC_MONTEIRO.txt` | presente 20 B 30/09 | comprovada (caminho literal) |
| NELSON_CASCO | eed0e880 | c3f8a452 | 402a67c0 | Z30X2 | piloto-nelson-casco (63) | só convenção §AB | CREDENCIAL_PILOTO_NELSON_CASCO.txt 20 B 21/09 | **por convenção**; registro de emissão não localizado |
| RANYERE | 6cae9e5b + bbfbe755 | 7b6965fd | bae5734a | Z30X2 | piloto-ranyere-mendonca (65) | só convenção §AB | CREDENCIAL_PILOTO_RANYERE_MENDONCA.txt 20 B 21/09 | **por convenção**; registro de emissão não localizado |
| WJAVERTJR | 6cae9e5b + be06f2f6 (FIX_MIRROR) | 7ac348fb | 5d7e7156 (+ pasta extraída) | Z30X2 | piloto-wjavertjr (66) | só convenção §AB | CREDENCIAL_PILOTO_WJAVERTJR.txt 21 B 22/09 | **por convenção**; registro de emissão não localizado |
| ASSISMOREIRA25 | — (cliente novo 08/10) | — | 0bbabb80 | Z30X2 novo | assismoreira25@gmail.com | `C:\Users\ADM\Downloads\CREDENCIAL_ASSISMOREIRA25.txt` | presente 20 B 08/10 18:51 | comprovada (handoff próprio) |
| RFOGLIO | — (cliente novo 08/10) | — | 8aa0de60 | Z30X2 novo | rfoglio@gmail.com | `C:\Users\ADM\Downloads\CREDENCIAL_RFOGLIO.txt` | presente 20 B 08/10 19:14 | comprovada (handoff próprio) |
| ANAALICEGUSTAVO | nenhum | 01e63de8 | 2dcd4f3a | Z30X2 | **nenhuma** (IDENTITY_UNPROVEN) | nenhum | nenhum | não existe credencial; conta nunca criada |
| DESTINO_DESKTOP-CBDFE4C | 13be807b (V1, 25/07) + 5d32a9d3 (AuthV2 18/09) | 92371aa9 | 7bc0e3ff | Z30X2 | piloto-01 (29), device 92, **sem licença** | `Desktop\codigo-piloto-01.txt` (enrollment, não senha) | presente 24 B 18/09 (código de uso único, expirado) | PC piloto do operador; sem senha por desenho |
| OLIVER_MAIN_MACHINE | pack-native-20261006 (57 .cs instalados) | 90568795 | 63d5b3e2 BASELINE | Z30X2 BASELINE | maquina-mae.oliver (device 86) | n/a | n/a | máquina-mãe do operador; não é cliente |

## Conclusões
1. **Contagem real:** 15 nomes no print = 12 clientes com conta e senha + ANAALICEGUSTAVO (pack sem conta) + DESTINO (PC piloto do operador) + OLIVER (máquina-mãe). O "12 clientes + OLIVER" do handoff 07/10 é o lote P-GCAP: 12 = 9 pilotos com senha (AIRISON, ANAVIEIRA10, HAMZEH, JOAO_HS, LUFDUTRA, MARCOS, NELSON_CASCO, RANYERE, WJAVERTJR) + MAGNUM + ANAALICEGUSTAVO + DESTINO. ASSISMOREIRA25 e RFOGLIO entraram em 08/10 ⇒ 14 + OLIVER no Z30X2; com senha: 9 + MAGNUM + 2 novos = 12.
2. **12 TXT = 12 contas com senha.** Todos em `C:\Users\ADM\Downloads\`, nenhum dentro de ZIP, nenhum na pasta do print. Cada TXT tem a data do cadastro da sua conta.
3. **Repetições:** os 28 ZIPs do print são 2 gerações dos mesmos clientes; os ZIPs pré-INVICTUS em Desktop/Downloads são cópias de 6 bases (6cae9e5b ×7, eed0e880 ×3, 383619a9 ×2, …), não clientes.
4. **Lacunas:** JOAO_HS, NELSON_CASCO, RANYERE e WJAVERTJR têm o TXT pela convenção §AB, mas o registro de emissão por cliente (como os de LUFDUTRA/MARCOS/ASSIS/RFOGLIO) não foi localizado nos 3 diretórios; o vínculo login↔TXT só se prova pelo conteúdo, que não foi aberto (proibido). ANAALICEGUSTAVO e DESTINO não têm (nem devem ter) TXT de senha sem decisão de provisionamento.

Nada alterado. Próximo passo: decisão do operador (cópia manual dos 12 TXT para a pasta individual de cada cliente; provisionamento de ANAALICEGUSTAVO/DESTINO).
