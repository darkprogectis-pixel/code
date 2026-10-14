# ATUALIZAÇÃO GLOBAL — PACKS INVICTUS + LICENÇAS AuthV2 30 d (14/10/2026, sessão 2ce90375)

## Packs
- Fonte: `AUDIT_LINHAGEM_PACKS_CREDENCIAIS_20261014.md` (28/28 ZIPs conferem), reaproveitada sem nova auditoria.
- Os 13 clientes, o piloto e a OLIVER estão em **Z30X2 (08/10)**.
- O pack de referência do piloto (TESTE_ATUALIZADO) usa o MESMO import Z30X2 (3baa59b0…); a auditoria 48 h não achou nenhuma alteração aplicável a cliente.
- A correção homologada no piloto foi só a licença no servidor ⇒ nada técnico a transferir.
- Resultado: 0 packs gerados, ZIPs originais intactos, JEV DIFF/FINAL não aplicáveis (sem alteração técnica).

## Licenças (servidor, leituras redigidas 23:42Z e depois; comando `node /root/auth-service/authv2-admin.js renew-user <login> --days 30`, com aprovação manual)
| Cliente | Pack | Versão antes/depois | AuthV2 (user/device) | Licença antes | Licença depois | Vencimento | Status |
|---|---|---|---|---|---|---|---|
| NELSON_CASCO | 402a67c0 | Z30X2/Z30X2 | 63 / 115 active | vencido (06/10) | ativo 30 d | 2026-11-13 23:43Z | RENOVADA |
| AIRISON | 092c7c57 | Z30X2/Z30X2 | 70 / 123 active | ativo até 29/10 | ativo +30 d | 2026-11-28 23:01Z | RENOVADA |
| MAGNUM | 2fa36df0 | Z30X2/Z30X2 | 72 / sem device (CLEAN_MACHINE_ONLY) | ativo até 06/11 | ativo +30 d | 2026-12-06 03:46Z | RENOVADA |
| DESTINO CBDFE4C (piloto) | 7bc0e3ff / TESTE_ATUALIZADO a90a74e8 | Z30X2 | 29 / 92 active | sem prazo | ativo 30 d | 2026-11-13 23:27Z | RENOVADA (antes, mesma sessão) |
| JOAO_HS | 09334716 | Z30X2 | 64 / 116 | ativo 365 d | inalterada | 2027-09-21 | JÁ VÁLIDA (> 30 d, não reduzida) |
| RANYERE | bae5734a | Z30X2 | 65 / 117 | ativo 365 d | inalterada | 2027-09-22 | JÁ VÁLIDA |
| WJAVERTJR | 5d7e7156 | Z30X2 | 66 / 118 | ativo 365 d | inalterada | 2027-09-22 | JÁ VÁLIDA |
| ANAVIEIRA10 | 65701747 | Z30X2 | 67 / 119 | ativo 365 d | inalterada | 2027-09-24 | JÁ VÁLIDA |
| LUFDUTRA | 0ad297a2 | Z30X2 | 68 / 121 | ativo 180 d | inalterada | 2027-03-27 | JÁ VÁLIDA |
| HAMZEH | 41992321 | Z30X2 | 69 / 120 | ativo 365 d | inalterada | 2027-09-29 | JÁ VÁLIDA |
| MARCOS | 3f9b8441 | Z30X2 | 71 / 122 | ativo 365 d | inalterada | 2027-09-30 | JÁ VÁLIDA |
| ASSISMOREIRA25 | 0bbabb80 | Z30X2 | 73 / 125 (sem uso) | ativo 180 d | inalterada | 2027-04-06 | JÁ VÁLIDA |
| RFOGLIO | 8aa0de60 | Z30X2 | 74 / 124 (sem uso) | ativo 180 d | inalterada | 2027-04-06 | JÁ VÁLIDA |
| ANAALICEGUSTAVO | 2dcd4f3a | Z30X2 | nenhuma conta (IDENTITY_UNPROVEN) | — | — | — | BLOQUEADA (sem vínculo) |

- Fora de escopo, não tocados: user 22 OLIVER (sem_prazo, privada); user 30 escritorio-novopc (conta de teste, vencida desde 05/10, fora dos packs).
- Exceções:
  - renew-user SOMA 30 d ao vencimento vigente (AIRISON e MAGNUM ficaram com mais de 30 d a partir de hoje). O CLI não tem modo "exatamente 30 d a partir de hoje" sem reduzir.
  - 9 contas com prazo maior que 30 d foram mantidas (sem redução).
- Rollback: o CLI não reduz prazo; reverter = UPDATE em users (license_days/started/expires) com os valores ANTES. O snapshot redigido fica só no scratchpad da sessão; os valores ANTES estão na tabela acima.
- Instalação: nada a reinstalar nos clientes (packs inalterados). Clientes renovados reconhecem a licença sozinhos (AoLogin restaura a cada 60 s / AoLicenca revalida); no máximo reabrir o NT8.
- PLAY/STOP, OLIVER, Gate, BFF e FLOWs não foram tocados; nenhuma ordem enviada.
