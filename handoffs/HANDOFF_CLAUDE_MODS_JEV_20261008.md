# HANDOFF — CLAUDE CODE MODS + JEV — 2026-10-08 (sessão 6b86565f)

STATUS = PEDIDO RECEBIDO · FASE 0 PARCIAL (somente leitura) · NADA INSTALADO · NADA CLONADO · NENHUMA CONFIGURAÇÃO ALTERADA

## Snapshot antes de qualquer mod (somente leitura)
- Claude Code: 2.1.294 (requisito de Mods no terminal: >= 2.1.287 ⇒ compatível; não atualizar).
- Plugins instalados: nenhum. Marketplaces: anthropic-plugin-directory (embutido) e claude-plugins-official (GitHub anthropics/claude-plugins-official).
- CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: não definida no ambiente.
- Repo HEAD 7d90548; worktree com 64 entradas pendentes (pré-existentes).

## Documentação oficial conferida (code.claude.com/docs/en/plugins/mods/overview)
- Mods existem e são ligados por padrão a partir da v2.1.287 (terminal) / v2.1.286 (Desktop). A variável CLAUDE_CODE_ENABLE_FUNCTION_HOOKS é ignorada nessas versões.
- Um mod é um plugin com handlers JS/TS que rodam DENTRO do Claude Code: `.claude-plugin/plugin.json` + `hooks/hooks.json` + módulo de hooks (`register(on)`); eventos como `tool.call`, `ui.render`.
- Modelo de segurança (texto oficial): um mod roda com as permissões do usuário, NÃO é isolado; pode ler/gravar arquivos, iniciar processos, fazer rede, ler segredos (variáveis de ambiente e arquivos de configuração, inclusive chaves de API), ver todo prompt e toda chamada de ferramenta, reescrever prompts/chamadas, e APROVAR chamadas de ferramenta sem perguntar — inclusive uma que um hook PreToolUse do próprio usuário tenha bloqueado.
- Revisão antes de instalar: `claude plugin validate <dir>` lista `hooks:` e `calls:` sem executar o mod.
- Embutidos: cc-plugin-agents-md, cc-plugin-diff, cc-plugin-plugin-authoring, cc-plugin-sec-default (não desligável pelo usuário), cc-plugin-telemetry, cc-plugin-you-should-know (desligado por padrão).
- Amostras oficiais (sem suporte): anthropics/claude-code-playground → token-weather, blast-radius, replay-theater. Fontes dos embutidos: anthropics/claude-code/mods.
- Desligar: plugin individual em /plugin; `--safe-mode` por sessão; `"disableAllHooks": true` (também para os hooks de settings e a status line — ATENÇÃO: isso desligaria os hooks do Rotation Controller V3).

## Não verificado
- Repositórios de terceiros citados no pedido (chrishan17/claude-jev-mod, hamzafer/claude-code-mods, mishgoldenberg/claude-mods) e o blog em domínio claude.dev: não constam da página oficial lida; não abertos nem auditados.

## Por que não foi adiante
- O pedido chegou só como texto colado. Ele manda instalar código de terceiros que roda dentro do Claude Code com acesso a segredos e poder de aprovar chamadas de ferramenta, entregar a esse código o provedor/chave do JEV, e alterar a configuração do próprio Claude-JEV (hooks, gate do JEV, rotação). Isso muda os controles sob os quais o executor opera ⇒ exige confirmação DIGITADA do operador e escopo definido.

## Próximo passo proposto (após confirmação digitada)
1. Auditoria somente leitura: clonar em pasta isolada os repositórios OFICIAIS e os 3 de terceiros; `claude plugin validate` em cada mod; dossiê por mod (hooks, calls, rede, processo, modelo, credenciais).
2. JEV decide a stack com o dossiê.
3. Instalar primeiro só amostras oficiais, uma a uma, com backup de settings e regressão de rotação (`npm run test:rotation`).
4. Mod de terceiros com acesso ao JEV só depois de leitura integral do código e decisão JEV específica; chave nunca em git.
