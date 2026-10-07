# HANDOFF — RESTORE TRUE STANDALONE AUTH — P-AUTH2 FINAL (2026-10-07)

Cópia da seção §15 de `C:\Users\ADM\Downloads\Club gamma\Handof TTW\HANDOFF_BUILD_PACK_INVICTUS_20261006.md`.

## RESTORE TRUE STANDALONE AUTH — P-AUTH2 FINAL (sessões d59b5fc1 → f2dcf500, 2026-10-07) — COMPLETE_AND_VERIFIED

Ordem do operador: "CONTINUAR A MISSÃO E2E AUTH NA SESSÃO SUCESSORA" (texto integral em `C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\authv2-pauth2-20261007\ORDER_CONTINUAR_E2E_20261007.txt`). Pasta de trabalho: `C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\authv2-pauth2-20261007\` (achados A–D em `FINDINGS_E2E_AUTH.md`, inventário `INVENTORY_PACKS.tsv`).

- **Auditoria:** 37 ZIPs (Desktop, Downloads, Club gamma\Handof TTW, conf-tests) com matriz dos arquivos de auth; 217 arquivos HANDOFF*.md nas 3 pastas de handoff (56 + 116 + 45), lidos de forma direcionada.
- **Last known good = P10:** `C:\Users\ADM\Desktop\ALFA_OMEGA_PILOTO_LUFDUTRA_FULL_STANDALONE.zip`, sha 383619a9ca7ac219c7e0f65812a2e68cf27ccbe85251fa3594a29150802520fb (cópia idêntica = PILOTO_MARCOS). AoLicenca 23023d80 → AoAuthV2 direto; helper c54b5696 com r31. Evidência: harness LUFDUTRA 26/26 + bootstrap AuthV2 real com usuários lab no endpoint público (HANDOFF_MIGRACAO §Y.4 10/10 + 15/15). Não exige aprovação humana. Ressalva: o 1º bootstrap real no PC do piloto não tem registro.
- **Regressão:** pack native de 06/10 (8930a322 / import 7ac92fe0), montado do NT8 live que ainda tinha o AoLicenca 9887afe9 de 15/09 (ponte V1). Todos os packs seguintes herdaram. "Cadastro recebido…" só sai do caminho V1.
- **Defeito do P-AUTH1 (f9717be1 / cda65309):** helper 4a64c54e L315/L364 lê `license_expires_at` na cultura do Windows. Em pt-BR, com a senha correta, o login termina "Acesso bloqueado" e a vaga já foi consumida (controle reproduzido no harness). Não é a senha: a mesma credencial em en-US libera.
- **Patch P-AUTH2 R2:** `authv2-pauth2-20261007\PROPOSED_PAUTH2_R2.patch` sha 737c2e5fb2461f8d005a5176b1001115d26826edf0efe068ca55264ff1e26b94 (243 l). O R1 e6465183 foi preservado. Arquivos:
  - AoLicenca.cs 1b725237 = LKG 23023d80 + marcador "(AuthV2)".
  - AlfaOmegaAuthV2.cs 6c3bb8b0 = 4a64c54e + r31 (2 linhas) + guarda `UrlHttps` no único ponto de rede.
  - AoLogin.cs 6eb74dfb (inalterado).
  - Os demais 56 .cs são byte-idênticos.
- **Processo:** o código em staging foi exportado para patch e o staging restaurado (diff 0). JEV DIFF = **A 0.71** (A 0.77 / B 0.19), req_01a1178830537d05947203d8d52a44b1, na 1ª tentativa. Depois o R2 foi reaplicado exatamente (staging = proposta, diff 0).
- **Critério 39 (HTTPS_ONLY_NT8_BUILD):** no R1 era uma falha real, não um N/A: o build sem símbolo de harness mandava requisição por http. O R2 corrigiu e o teste agora é PASS ("URL do AuthV2 precisa ser HTTPS", 0 chamadas). N/A_BY_DESIGN = 0.
- **Testes:**
  - T01–T24 da ordem = **24/24 PASS** (`authv2-pauth2-20261007\tests\t24.js` → `results_t24.json`).
  - Harness auth lab = **39/39** em pt-BR e en-US, 0 chamadas /login (`harness\results.json`; o R1 38/39 está em `results.r1.json`).
  - Instalação limpa T01–T13 = **16/16**. A 1ª rodada deu 15/16 por uma constante do harness em `zipinfo.ps1`; a entrega não mudou.
  - A identidade real do device ficou idêntica antes e depois da reinstalação e do rollback no sandbox.
  - T18: o texto `MensagemDe("pending")` continua no AoLicenca (igual ao LKG), mas é inalcançável: nenhum produtor de status pending.
- **Import novo:** `C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\delivery-cleaninstall-pauth2-20261007\import\AlfaOmega_INVICTUS_Native_import.zip`, sha **de14ccebb631f155a43b787007c604966858181028a7dc6b314c068ce133ec90** (701124 B, 62 entradas, 59 .cs; delta vs cda65309 = AoLicenca + AlfaOmegaAuthV2). Ferramenta: tools\mkimport_pauth2.ps1.
- **Entrega nova (CLEAN_INSTALL_ONLY):** `C:\Users\ADM\Desktop\Handof TTW\HANDOFF\conf-tests\pack-native-20261006\delivery-cleaninstall-pauth2-20261007\AlfaOmega-INVICTUS-InstalacaoLimpa-AuthV2-PAUTH2-20261007_NAO_IMPORTAR_NO_NINJATRADER.zip`, sha **17c83e53f189e612d87c48a30147ddfc5c6f1cc55ea8f1264b9413f1d3e32ac7** (1417946 B, 18 entradas, sidecar .sha256).
  - O cliente importa só `02_IMPORTAR_NO_NINJATRADER\IMPORTAR_ESTE_NO_NINJATRADER.zip` (= de14cceb).
  - `01_SETUP\NinjaTrader\` tem uma cópia de referência com o mesmo sha, que o setup só lê.
  - Setup e5209d02 e Config byte-idênticos. Ferramentas: tools\build_delivery_pauth2.js e mkzip_pauth2.ps1.
- **Histórico SUPERSEDED/NAO_DISTRIBUIR:** `SUPERSEDED_NAO_DISTRIBUIR.txt` em build, build-upgrade-20261006, build-cleanpc-20261006, build-cleanpc-nt8181-20261007 (7ac92fe0/52f4333b), delivery-client-20261007 (1a976feb), delivery-cleaninstall-20261007 (d0d36001) e delivery-cleaninstall-authv2-20261007 (f9717be1/cda65309). Os ZIPs não foram alterados.
- **JEV FINAL = A 0.77** (final A 0.81 / B 0.15; tests A 0.72; external_pending A 0.89), req_01a11792a2847a259912db4d14f2fcbb, na 1ª tentativa (`delivery-cleaninstall-pauth2-20261007\JEV_FINAL_PAUTH2_T1_*`).
- **O que não foi tocado:** user 72, vaga real, senha, licença, servidor, NT8 live. ORDERS 0 · F5 0.
- **Instruções ao cliente:**
  1. Instalar o NinjaTrader 8, abrir uma vez e fechar.
  2. Extrair o ZIP e rodar `01_SETUP\1_VERIFICAR.cmd`.
  3. Com o NT8 fechado, rodar `01_SETUP\2_INSTALAR.cmd`.
  4. Abrir o NT8 e fazer Tools → Import → NinjaScript Add-On com `02_IMPORTAR_NO_NINJATRADER\IMPORTAR_ESTE_NO_NINJATRADER.zip`.
  5. Abrir o Ao Control Center, clicar em LICENÇA e entrar com login e senha (com internet). O 1º acesso registra o PC e libera na hora; nos seguintes a senha não é pedida.
- **Pendente externo:** o 1º bootstrap real no PC do cliente e a instalação física (operador/cliente).
