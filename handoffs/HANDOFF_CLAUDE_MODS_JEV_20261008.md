# HANDOFF — CLAUDE CODE MODS + JEV — 2026-10-08 (sessão 6b86565f)

STATUS = INSTALADO E VALIDADO · JEV FINAL ver seção "Decisões JEV" · autorização DIGITADA do operador para a missão completa.

## Snapshot antes dos mods
- Claude Code 2.1.294 (Mods exigem >= 2.1.287; sem atualização). Plugins: nenhum. Marketplaces: anthropic-plugin-directory, claude-plugins-official.
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` não definida (ignorada nesta versão).
- Configuração: `CLAUDE_CONFIG_DIR = C:\Users\ADM\.claude-gomesgomestrader` (`settings.json` só com `theme`; backup `settings.json.bak-premods-20261008`). Hooks do projeto em `.claude/settings.json` (SessionStart, PreToolUse, PostToolUse, Stop → `tools/jev-finish/hook.mjs`), sha256 57f9c0ac… ANTES e DEPOIS.
- Linha de base: `npm run test:rotation` 22/22.

## Documentação oficial lida (code.claude.com/docs/en/plugins/mods/: overview, create, events, api, interface, test, troubleshoot, admin, reference; + plugins/security)
- ANTHROPIC_MODS_VERSION_REQUIREMENT = 2.1.287 (terminal), 2.1.286 (Desktop) · MODS_DEFAULT_STATE = ligados.
- MOD_ARCHITECTURE = plugin com `.claude-plugin/plugin.json` + `hooks/hooks.json` (`modules`) + módulo com `register(on)`; handlers rodam dentro do Claude Code.
- EVENT_MODEL / HOOK_CHAIN_MODEL = cadeia de middleware por evento (`next(e)`); ordem: guarda embutida e mods da organização → mods do usuário → `appendPlugins` → embutidos. Hooks de configuração `PreToolUse` não gerenciados rodam DEPOIS do último `next`; um mod que responde sem `next` impede que rodem; `tool.check` pode aprovar o que eles bloquearam.
- SECURITY_MODEL / SANDBOX_BEHAVIOR = sem isolamento; permissões do usuário; lê arquivos, env, settings; rede; processos; pode aprovar chamadas. A guarda `sec-default` só carrega com configurações gerenciadas ou plano Team/Enterprise.
- TEST_FRAMEWORK = `claude plugin test` (kit `claude-code/testing`, stubs `{ value }`); validação estática = `claude plugin validate` (linhas `hooks:` e `calls:`); o Claude Code recusa mod cujo uso da API não é legível estaticamente (ex.: `$.jev` lido como valor).
- BUILTIN_MODS = agents-md, diff, plugin-authoring, sec-default, telemetry, you-should-know (desligado por padrão). OFFICIAL_SAMPLE_MODS = token-weather, blast-radius, replay-theater (sem suporte).
- KNOWN_LIMITS = hook 10 s; `$.store` 4 MiB; `$.process.run` 30 s padrão; teste 5 s. `disableAllHooks` desliga TAMBÉM os hooks de configuração (pararia a rotação) ⇒ NUNCA usar como rollback.
- A documentação oficial não menciona JEV, "noun contracts" nem `/plugin-types`; `$.jev` vem do mod de terceiros via `engine.create`.

## Auditoria (clones em pasta isolada do scratchpad; 43 mods; `claude plugin validate` em todos)
| Repositório | Commit | Licença | Resultado |
|---|---|---|---|
| anthropics/claude-code (mods embutidos) | e47cc82 | — | referência; não instalar (já embutidos) |
| anthropics/claude-code-playground | 569c528 | Apache-2.0 | 3 amostras: instaladas (blast-radius desligada) |
| chrishan17/claude-jev-mod | f004877 | MIT | **instalado** (lido por inteiro; 12/12 testes) |
| hamzafer/claude-code-mods (23 mods) | e687416 | ver repo | **rejeitado em bloco** nesta rodada |
| mishgoldenberg/claude-mods (12 mods) | 0954c97 | ver repo | **rejeitado em bloco** nesta rodada |

Rejeições e motivo: `switchboard` (roteia modelo, lê chaves de outros provedores, rede) — modelo oficial preservado; `context-keeper` (escreve handoffs, `model.fork`, `command.run`) — concorre com o Rotation Controller V3; `loop-breaker` (`session.append`); `activity`, `notify` (`$.tool.check`); `changes`, `toolbox` (`prompt.submit`); duplicatas das amostras oficiais (blast-radius, replay-theater, token-weather, usage-meter, context-bar); irrelevantes (snake, reels, now-playing, prayer-times, openai-balance etc.).

Dossiê do mod JEV: HOOKS = `engine.create` · CALLS = `$.env.get`, `$.http.fetch` · lê só as próprias variáveis (JEV_*, TYPESAFE_*, OPENROUTER_*, AI_GATEWAY_*, CLOUDFLARE_*, LITELLM_*) · rede só para o provedor escolhido (TypeSafe: `https://api.typesafe.ai/v1/systemone`, mesmo endereço/cabeçalho do `lib.js` existente) · sem fs/processo/sessão/prompt/tool · erro ⇒ exceção · **não sanitiza o estado** (responsabilidade de quem chama).

## Instalado (escopo `user` da configuração isolada; marketplace LOCAL `mods/` no repositório)
| Plugin | Estado | Função |
|---|---|---|
| `jev@claude-jev-mods` 0.3.3 | LIGADO, `provider=typesafe` fixo | `$.jev.ask` (Choice / Score / Noul) |
| `jev-policy@claude-jev-mods` 0.1.0 | LIGADO | mod local, modo OBSERVAR |
| `token-weather@claude-jev-mods` | LIGADO | faixa de contexto |
| `replay-theater@claude-jev-mods` | LIGADO | `/replay` das edições do turno |
| `blast-radius@claude-jev-mods` | INSTALADO, **DESLIGADO** | segura comandos destrutivos (JEV dividido: ligar 0,52 × desligada 0,48) |
- Chave do JEV: lida de `TYPESAFE_API_KEY` no ambiente (a mesma do JEV existente). Nenhuma chave copiada/gravada; `settings.json` conferido sem chave.
- Não instalado: roteamento de modelo (Opus 5.5 inalterado), gerenciadores de contexto, mods da comunidade.

## Mod local `mods/jev-policy` (casos de uso)
- A/B risco de comando e ação destrutiva: `tool.call` de Bash/PowerShell; 14 padrões locais; quando casa, UMA chamada `$.jev.ask` em paralelo (risco score, irreversível noul, categoria choice) sobre o comando sanitizado ≤ 300 caracteres; a ferramenta roda como rodaria; depois grava no livro e escreve uma linha discreta. Cache por comando; teto 40/sessão; espera 8 s; `.catch` repassa.
- D `/jev-diff` (só nomes de arquivo e contagens) · E `/jev-ready chave=valor…` · F `/jev-handoff <arquivo>` (texto não sai; só checklist de booleanos) · H `/jev-ledger [n]` (livro em `$.store`, 300 entradas, sem comando com padrão de segredo).
- G limite de projeto: padrão `fora_do_projeto` só OBSERVA; o gate existente continua sendo a barreira.
- C roteamento de modelo: NÃO implementado (decisão JEV 0,87).
- Autoridade: tudo é observação; JEV DESIGN/DIFF/FINAL canônicos e os hooks existentes continuam obrigatórios.

## Testes
- `claude plugin validate`: 5/5 PASS. `claude plugin test`: jev 12/12 · jev-policy 10/10 (achou e fez corrigir vazamento: valor após `Bearer`).
- `npm run test:mods` (novo, `test/mods/mods.test.mjs` + `mods/INTEGRITY.json`, 46 arquivos): 10/10 — hashes fixados; lista fechada de chamadas por mod; proibidas `tool.check`, `prompt.*`, `session.append/send`, `env.set`, `model.*`, `mcp.call`, `command.run`, `fs.write`, `process.spawn`; rede só no `jev`; mod local nunca nega/aprova/responde; sem Dolphin/Ollama; sem chave; hooks do projeto declarados.
- Ao vivo com o provedor real (repositórios de rascunho): comando inofensivo ⇒ risco 0,02; `rm -rf` não permitido ⇒ negado pela permissão, pasta intacta, risco 1,7; provedor indisponível ⇒ ferramenta rodou, falha registrada; `/jev-diff` TRIVIAL 0,84; `/jev-ready` completo B 0,16 / teste falho C 0,98; `/jev-handoff` 1,8/2; provedor fixo responde mesmo com variável-isca de outro provedor.
- **Prova em execução dos hooks (E2):** projeto de rascunho com um `PreToolUse` de configuração que bloqueia `BLOCKME`: com os mods ligados o hook disparou nas 2 chamadas, o bloqueio valeu (BLOCKED) e o comando liberado rodou; o mod observou os dois.
- Regressão: `npm run test:rotation` 22/22 antes e depois; `.claude/settings.json` mesmo hash; rollback por plugin ensaiado (disable/enable de `replay-theater`).
- `npm test` completo depois: 438 testes, 412 PASS, 25 FAIL — AV1–AV26 (vídeo) e VOICE02b (voz), sem relação com mods; NÃO foi rodado antes de instalar (inferência pelo conteúdo, não comparação).
- Matriz M01–M32: PASS exceto — M21–M23 roteamento N/A (não instalado; Opus preservado) · M25 `rotation:force` ao vivo = último ato (ver abaixo) · M02/M03/M29 embutidos e recarga não conferidos em interface (provas sem interface) · desempenho parcial (~7 s por rodada com comando classificado, incluindo o turno do modelo; latência por chamada gravada no livro).

## Rede e privacidade
- Único destino externo dos mods: `api.typesafe.ai` (mod `jev`, provedor fixo). Sai: estado mínimo da pergunta (comando sanitizado ≤ 300 caracteres + rótulo do padrão; ou nomes de arquivo/contagens; ou evidências chave=valor; ou checklist de booleanos) + perguntas + id do modelo. Não sai: arquivos, handoffs, conversa, chaves.

## Regras em vigor
R1 nenhum mod usa `tool.check` nem responde no lugar da ferramenta · R2 mínimo sanitizado · R3 cópia local fixada, rollback por plugin · R4 regressão da rotação após cada instalação · R5 integridade por hash (`npm run test:mods`) · R6 rede só no `jev` · R8 não interferência em prompt/conversa/sessões · R9 sem segredo no livro · R10 falha segura · R11 autoridade do JEV canônico · R12 só na configuração isolada · R13 nunca `disableAllHooks` · E3 provedor fixo · E6 marketplace é diretório local (sem atualização automática); qualquer mudança em `mods/` = nova auditoria + JEV + regenerar `INTEGRITY.json`.

## Rollback
- PRE_MODS_SETTINGS_BACKUP = `C:\Users\ADM\.claude-gomesgomestrader\settings.json.bak-premods-20261008` · PLUGIN_LIST_BEFORE = nenhum.
- Por plugin: `claude plugin disable <nome>@claude-jev-mods` (ou `uninstall`). Tudo: `uninstall` dos 5 + `claude plugin marketplace remove claude-jev-mods` + restaurar o backup. NÃO usar `disableAllHooks`.

## Decisões JEV
- DESIGN T1 `req_01a11dba02127c88bfbdaabd77a1cafd` S1 1,00 · mod JEV A 0,98 · roteamento não 0,87 · contexto rejeitar 1,00 · mod local OBSERVAR 1,00.
- DESIGN T2 `req_01a11dba4cf472eaa9c6b2018972a334` regra faltante = integridade 0,43; conjunto incompleto 0,69.
- DIFF T1 `req_01a11dbfae197668ae5283eb7da435ac` A 0,57 (B 0,35); ressalva guarda destrutiva.
- FINAL T1 `req_01a11dcb5e147ddb92362dd94e9339d9` B 0,76 (regra faltante 0,61; rotação forçada ao vivo 0,22).
- FINAL T2 `req_01a11dcbc92c775983bca9869888d706` exigidas: E4 rotação forçada ao vivo 0,66 · E2 prova em execução dos hooks 0,63 · E6 atualização controlada 0,53 (E1 0,45, E3 0,42, E5 0,35, E7 0,34).
- FINAL T3: ver linha final deste arquivo.

## Pendências / próximos passos
- Conferir visualmente `token-weather` e `/replay` numa sessão interativa nova (os mods carregam no próximo início).
- Decidir com o operador se liga `blast-radius` (segura comandos até alguém decidir — ruim para sessão sem operador).
- E1 (rodar `npm run test:mods` no `START_JEV_CLAUDE.ps1` antes de abrir a sessão) não implementado: o lançador não foi alterado.
- A cada atualização do Claude Code: `npm run test:mods` + `npm run test:rotation`.
