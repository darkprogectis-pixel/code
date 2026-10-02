# JEV FINAL — Press de SESSÃO COMPLETA (P1S) · loop jf-20261002133345-50a6d7 · 2026-10-02

## Objetivo (operador)
Eliminar, de forma determinística e testada, a dependência do horário de carga/reset do FlowOne no cálculo de Press/anchor do gate AoGate.EsNq, preservando o filtro de força (minForce = 0.03). Requisitos: estudo quantitativo em dados locais (NT8 .ncd ES/NQ 12-26), JEV DIFF, implementação só no staging, testes de invariância + controle negativo, regressões (test_equity, test_wiring, test_real_flow, test_exec, test_race, run_sync, build_sync), JEV FINAL, pacote de instalação regenerado e documentação. Sem live/F5/ordens.

## Estudo (feito; handoff canônico §AB)
- Decodificador .ncd validado contra o audit do robô: preço com Δ médio de 0,287 pt no offset +3 h; me/mvi do porte JS dos canais concordam 0,85–0,88.
- 15 sessões, cooldown de 60 s. A regra atual P0 é LOAD_TIME_DEPENDENT: 2,71 % dos segundos diferem entre cargas 0h/4h/8h, e as aberturas variam de 164 a 414 conforme a hora de carga.
- As janelas móveis (tempo 1800–14400 s; volume) são invariantes, mas geram 1,5–7× mais aberturas SEM ganho de qualidade: acerto do ES 5/15/60 min de 0,42–0,54, contra 0,506/0,508/0,549 na P1. Foram rejeitadas como inflação artificial.
- Escolhida a P1S, "sessão completa ou zero": fórmula, reset e minForce inalterados. O Press só é publicado se a virada de sessão foi vista ao vivo e não houve buraco de tape realtime > 300 s; senão é 0 e o gate fecha por força (fail-safe). O valor publicado é sempre P1(t) ou 0, para qualquer horário de carga.
- JEV DIFF = A SAFE_TO_APPLY, conf 0.67, `req_01a0fcea7ae375088d882537094259b4`. Proposta: `handoffs/PROPOSAL_PRESS_SESSAO_COMPLETA_20261002.md`.

## Implementação (só no staging `conf-tests\sync\staging\Indicators\TTW_DarkProjects\`)
| arquivo | sha256/16 staging | live (inalterado) |
|---|---|---|
| AoPressSessao.cs (novo, classe pura, só System) | 47c2db5cc9ab462f | — |
| AoTapeEngine.cs (Press = Publicavel; TickRealtime no bloco realtime; ResetSessao(bool)) | dd32fd1409ac2bfe | e7a73c04e299d1d9 |
| AoMarketDataPublisher.cs (repassa realtime; aviso de painel) | 840deb6482a69d84 | ec0d38d74e228080 |
| AoControlCenter.cs (ResetSessao(..., State == State.Realtime)) | 7010a7a3058d6060 | 1c9c2e335ecf7169 |
| AlfaOmegaFlowOne.cs (campo + 4 chamadas: Carga / TickRealtime / Publicavel / ViradaSessao) | d17574ca126e6f80 | f6248b6c8cee3aaf |

- O diff staging×live é exatamente o da proposta (conferido com `diff` e pelo PR5 por multiconjunto de linhas).
- Não mudaram: AoGate/SharedState (DefaultMinForce 0.03), EsNqMinForce, me/mvi/conf/LastPrice, painel híbrido/DoubleConf/footprint do FlowOne.

## Testes (todos executados pelo CLI; `finish.mjs recheck` = 10/10 PASS)
- build_sync: compila limpo, 0 erros (inclui o overlay Indicators do staging).
- test_press: C# 65/65 em ticks REAIS (ES 710.623 / NQ 258.019, 288 checkpoints).
  - PR1: unidade do AoPressSessao (gap 300 mantém, 301 zera, virada histórica ⇒ 0).
  - PR2 invariância: Press publicado idêntico tick a tick entre cargas; = Ref(t) após a virada; = referência JS P1 a 1e-12; carga após a virada ⇒ 0.
  - PR2c: buraco ≤ 300 s mantém; > 300 s ⇒ 0 até o fim.
  - PR3: me/mvi/conf/LastPrice/PressBruta do staging = live.
  - **PR4 CONTROLE NEGATIVO**: o motor LIVE viola o predicado Press(t) ∈ {Ref(t), 0}. Exemplos: ES L=+1h live 1 × Ref −0,0174; NQ L=+1h live 1 × Ref 0,0419.
  - PR5 fiação estrutural: 28/28.
- press_wiring 28/28 · test_equity 34/34 · test_wiring 12/12 · test_real_flow 39/39 · test_exec C#+JS 14/14 · test_race 7/7 + C# · run_sync 13/13 · package_press 11/11.
- FIX durante o loop: só no harness. O PR5 marcava 2 linhas de comentário da própria proposta; foram adicionadas ao allow-list como texto exato. Antes disso, o harness ganhou o AssemblyResolve.

## Pacote (regenerado, NÃO instalado)
`conf-tests\sync\install-package-20261002-press\` — 11 arquivos (AddOns 4: Robo 14a36da7 · Fech c061880c · Saida 9fef98d2 · EventoAot 4bdc5e09 · Indicators 5 · aot 2: aot-sim e4133438 · aot-bff e7fa74b5), mais `SHA256_PAYLOAD.txt` e `MANIFEST_INSTALL_NAO_EXECUTADO.md`.
- O manifesto traz: F5 único para os 9 .cs; o AoPressSessao novo e obrigatório; F5 no meio da sessão ⇒ Press 0 até a próxima virada ao vivo; preferir F5 antes das 18:00 ET; e rollback que apaga o AoPressSessao.
- O pacote fica dentro de conf-tests\sync porque a ordem do operador limita a escrita a essa área. O pacote anterior está obsoleto.

## Escopo / segurança
- Live conferido só por leitura e inalterado (Robo f0fe739b · FlowOne f6248b6c · AoTapeEngine e7a73c04 · aot-sim 0aa6ed35 …).
- Sem F5, sem cópia para o live, sem ordens/posições/contas/config/permissões.
- Handoff canônico atualizado: §AC de `handoffs/HANDOFF_AOT_INVICTUS_CLOSE_DIVERGENCE_20261001.md`.

## Riscos residuais (documentados, aceitos na proposta)
- Restart/F5 no meio da sessão ⇒ zero sinais até a próxima virada (intencional, fail-safe, visível no painel).
- Desconexão < 300 s não é detectada; um feriado ou sessão fina com gap > 300 s invalida a sessão (fail-safe).
- A diluição intra-sessão (sinais concentrados no início) foi mantida de propósito; o estudo de threshold fica para uma fase separada.
- O runtime NT8 real não foi testado: só a validação Sim101 depois da instalação, com ordem do operador, fecha esse ponto.
