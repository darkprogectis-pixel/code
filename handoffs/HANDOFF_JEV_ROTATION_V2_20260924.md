# HANDOFF — JEV ROTATION CONTROLLER V2 (24/09/2026)

Autocontido. Fase de correção prioritária, **antes** de retomar o INVICTUS JEV CODE.
O estado do INVICTUS continua em `handoffs/HANDOFF_INVICTUS_JEV_NT8_INSTALL_20260924.md` (§10 = rotação anterior). Esse estado não foi alterado.

| | |
|---|---|
| JEV_ROTATION_V2 | **IMPLEMENTED** |
| MEASUREMENT_SOURCE | API `usage` da última mensagem de assistente (cadeia principal) no transcript JSONL da sessão (`$CLAUDE_CONFIG_DIR/projects/<proj>/<session>.jsonl`, recebido pelo hook em `transcript_path`) |
| WARNING / SOFT_STOP / HARD_ROTATION / CEILING | 220 000 / 235 000 / 240 000 / 250 000 tokens (absolutos; sem porcentagem) |
| 250K_GUARD | **PASS** (RT09/RT10; premissas em §4) |
| SYNTHETIC TEST | **PASS** 10/10 (`npm run test:rotation`) · suíte completa 88/88 |
| E2E real (Claude Code 2.1.281 headless) | **PASS** (§3) |
| MODEL_DEPENDENCE | **PARTIAL** (medição e bloqueio: nenhuma dependência do modelo; conteúdo narrativo do handoff e tamanho da própria resposta: dependem do modelo, §4) |
| Produção NT8 / F5 | **não tocados** / **não feito** |

## 1. Por que a V1 falhou (evidência)

A "rotação" V1 era só uma instrução ao modelo, sem nada que a fizesse valer. Medido com a mesma fonte da V2:
- sessão `dfea5c6a`: **939 087** tokens de contexto, 0 compactações;
- sessão `98556146`: 240 546 tokens.

## 2. Arquitetura

| Arquivo | Função |
|---|---|
| `tools/jev-rotation/config.json` | limiares absolutos e limites de leitura; reserva de handoff de 4 000 tokens |
| `tools/jev-rotation/controller.mjs` | lógica pura: `measureTranscript`, `levelFor`, `decide` |
| `tools/jev-rotation/hook.mjs` | ponto de entrada dos hooks, com estado *sticky* por sessão, snapshot automático e log |
| `tools/jev-rotation/install-hooks.mjs` | instala e verifica os hooks em `--config-dir`; recusa `~/.claude` padrão; faz backup `settings.json.bak-<ts>`; `--verify` roda um autoteste real do processo |
| `tools/jev-rotation/status.mjs` | estado da última sessão; o exit code segue o nível (0/10/20/30/40; 2 = sem estado) |
| `START_JEV_CLAUDE.ps1` | instala e verifica os hooks (se falhar, a sessão não abre) → `claude` → `status` → se ≥ SOFT_STOP, oferece abrir uma nova instância já com o prompt de leitura do handoff |
| `test/rotation/rotation.test.mjs` | RT01–RT10, todos rodam o processo real do hook |

Hooks registrados em `C:\Users\ADM\.claude-darkprogectis-jev\settings.json` (o `CLAUDE_CONFIG_DIR` isolado): `SessionStart`, `UserPromptSubmit`, `PreToolUse(*)`, `PostToolUse(*)` e `Stop`.

Estado em `…\.claude-darkprogectis-jev\jev-rotation\` (`state/<sid>.json`, `last-session.json`, `events.jsonl`).

**Medição:** `input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens` da última mensagem `assistant` com `isSidechain=false` e usage > 0.
- Lê só o final do arquivo (2 MB); se não achar, lê o arquivo inteiro.
- Arquivo ausente numa sessão nova ⇒ `NO_USAGE_YET` (0).
- Transcript ilegível ⇒ `UNAVAILABLE`: aviso visível, e o último nível sticky continua valendo.
- A medida reflete a última chamada da API. O resultado da ferramenta pendente só entra na chamada seguinte, e é por isso que existem os limites por passo de §4.

### Comportamento por nível (níveis são sticky: uma queda posterior, por exemplo compactação, não destrava)

| Nível | Prompt novo (lote) | Ferramentas | Stop | Outros |
|---|---|---|---|---|
| OK (<220k) | livre | livres | livre | — |
| WARNING (≥220k) | permitido + aviso ao usuário e ao modelo | livres, exceto `Read` sem limite (>300 linhas e >40 KB) | **bloqueado 1×** se nenhum `handoffs/*.md` mudou desde o cruzamento (handoff obrigatório) | snapshot automático; lembrete a cada 5k tokens |
| SOFT_STOP (≥235k) | **bloqueado**, exceto prompt com `JEV_HANDOFF_ONLY` | só `Read` (≤120 linhas ou ≤24 KB), `Glob`, `Write`, `Edit`, `MultiEdit`, `TodoWrite` | idem + ROTATE | — |
| HARD_ROTATION (≥240k) | **bloqueado** com `ROTATE_SESSION_NOW` | **só** `Write`/`Edit` em `handoffs/*.md` e `Read` limitado do handoff | exige handoff | depois da edição do handoff, `PostToolUse` ⇒ `continue:false` ⇒ turno encerrado com ROTATE_SESSION_NOW |
| Reserva (≥246k) | bloqueado, inclusive `JEV_HANDOFF_ONLY` | tudo negado + `continue:false` | — | o `handoffs/rotation/AUTO_ROTATION_<sid8>.md` mecânico passa a ser o handoff |

O snapshot automático é gravado pelo hook, não pelo modelo, a cada subida de nível. Ele contém: nível, tokens, HEAD, `git status --short`, transcript e fluxo de rotação.

## 3. Provas

- **Sintético (RT01–RT10):**
  - RT01: limiares;
  - RT02: medição (sidechain e usage zerado ignorados; tail de 2 MB; ausente/ilegível);
  - RT03–RT06: warning, soft stop e hard rotation;
  - RT07: sticky;
  - RT08: medição indisponível;
  - RT09: agente no pior caso, partindo de 200k, 225k, 234 999, 237k, 239 999 e 245 999 ⇒ sempre parado, máximo < 250k;
  - RT10: reserva.
- **E2E real:** `claude -p` com o config isolado, limiares de teste 1k/2k/3k (`JEV_ROTATION_TEST=1`) e estado numa sandbox. `events.jsonl`:
  - `PreToolUse Bash tokens=27163 MEASURED HARD_ROTATION deny`;
  - `Stop … block` (handoff obrigatório);
  - `Read deny` e `Write deny` (fora dos `handoffs/` da sandbox);
  - `status.mjs` com exit 30 e `ROTATE_SESSION_NOW`;
  - `AUTO_ROTATION_6f293647.md` gravado.

  Isso prova que o transcript já está gravado quando o `PreToolUse` roda e que o deny do hook vale no Claude Code real.
- **Hot-reload:** a própria sessão de implementação (`5b7603ff`) passou a ser medida pelos hooks logo após a instalação: `last-session.json`, 113 512 tokens, OK.
- `install-hooks --verify` ⇒ PASS; instalar de novo ⇒ `unchanged`; `--config-dir ~/.claude` ⇒ recusado.

## 4. Limites honestos (por que MODEL_DEPENDENCE = PARTIAL)

1. **A resposta do próprio modelo não é interrompível por hook.** Uma única resposta (texto + thinking + conteúdo de `Write`) cresce antes de qualquer hook rodar.
2. **Premissas do 250K_GUARD:** o pior crescimento por passo permitido é de ~13k tokens (resultado de ferramenta ≤10k, já que o Claude Code corta a saída do Bash em 30k caracteres, mais ≤3k de saída do modelo). A margem SOFT→CEILING é de 15k, e a reserva de handoff é de 4k. Ferramentas MCP ou saídas acima disso na zona OK/WARNING não são limitadas.
3. **O conteúdo narrativo do handoff depende do modelo.** A garantia mecânica é o `AUTO_ROTATION_*.md` mais o bloqueio de novos lotes.
4. **O hook não mata o processo.** A instância fica inerte: todo prompt é bloqueado e toda ferramenta negada. O operador faz `/exit`, e o launcher oferece a nova instância.
5. **Erro interno do controlador:** fail-open visível (`JEV_ROTATION_CONTROLLER_ERROR` + `events.jsonl`), para que um bug não trave a sessão em silêncio.
6. **Slash commands** (`/compact` etc.) não passam por `UserPromptSubmit`. Mesmo assim, os níveis sticky mantêm a sessão travada depois de uma compactação.
7. **Latência:** cada ferramenta paga um processo `node` a mais (~0,2–0,5 s; `git` só roda no cruzamento de nível).

## 5. Fluxo de rotação

handoff (modelo, obrigatório pelo Stop hook; ou AUTO_ROTATION mecânico) → `ROTATE_SESSION_NOW` → operador faz `/exit` → `START_JEV_CLAUDE.ps1` detecta `status ≥ 20` → nova instância com o prompt de leitura do handoff → continuidade. **Nunca `/clear`.**

## 6. Git

- Commit desta fase: só os arquivos de rotação, mais os trechos de rotação em `package.json` e `CLAUDE.md` (montados a partir do HEAD).
- Os arquivos da fase NT8 INSTALL continuam **não commitados**, como estavam (ver o handoff NT8 §10).

## 7. Próximo passo exato

NEXT PHASE = retomar o INVICTUS JEV CODE a partir de `handoffs/HANDOFF_INVICTUS_JEV_NT8_INSTALL_20260924.md` §10, **abrindo a sessão por `START_JEV_CLAUDE.ps1`** (que agora verifica o controlador), e aguardar a ordem do operador. Pendências de lá: commit da fase NT8 e checklist §7 (F5 único).
