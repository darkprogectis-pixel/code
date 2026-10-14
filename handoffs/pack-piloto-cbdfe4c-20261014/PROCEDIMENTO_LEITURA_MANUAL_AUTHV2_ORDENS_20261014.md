# PROCEDIMENTO MANUAL — leitura AuthV2 (user 29 / device 92) e origem das ordens MES/MNQ do PC piloto

Somente leitura. Saída REDIGIDA: o filtro imprime apenas status, licença e metadados, sem token/chave/hash/senha. Não altera nada.

## A. Servidor AuthV2 — operador na OLIVER (PowerShell)
```
wsl -d Ubuntu-24.04 -e ssh -i /home/magnumbrokeroficial/.ssh/id_ed25519 root@167.233.25.27 "cd /root/auth-service && node authv2-admin.js user-list --json | python3 -c 'import json,sys;d=json.load(sys.stdin);d=d.get(\"users\",d) if isinstance(d,dict) else d;[print({k:v for k,v in u.items() if any(s in k for s in (\"id\",\"login\",\"status\",\"licen\",\"slot\",\"devices\"))}) for u in d if u.get(\"id\")==29]' && node authv2-admin.js device-list --json | python3 -c 'import json,sys;d=json.load(sys.stdin);d=d.get(\"devices\",d) if isinstance(d,dict) else d;[print({k:v for k,v in x.items() if not any(s in k for s in (\"key\",\"secret\",\"hash\",\"token\",\"pub\",\"fp\",\"finger\"))}) for x in d if x.get(\"id\")==92]'"
```
Colar a saída (2 linhas). Interpretação, pelo código do pack Z30X2 (`AoLogin.AplicarConta`):
- user ou device ≠ active ⇒ "Acesso bloqueado" (LastError `conta:<user>/<device>`);
- license_valid=false ⇒ "Acesso expirado";
- license_valid=null ou sem `license_expires_at` (caso documentado em 07/10) ⇒ status `blocked`. O AlfaOmegaLogin exibe o MESMO texto "Acesso bloqueado. Contate o operador." (AlfaOmegaLogin.cs l.145), embora a mensagem interna seja "Licenca nao configurada".

## B. Ordens MES/MNQ — operador ou Claude no PC PILOTO (somente leitura)
1. NT8 Control Center → aba **Accounts**: conexão da conta TAKEPROFIT619605210 (nome da conexão/provedor). Sim101/Playback = SIM; conexão de corretora/prop = transmitida ao provedor.
2. Abas **Orders** e **Executions**, filtradas por TAKEPROFIT619605210, de 14/10 entre 19:34 e 19:41: estado (Submitted/Working/Filled/Cancelled/Rejected), Name/tag e qty. Aba **Positions**: posição aberta?
3. `Documentos\NinjaTrader 8\log\log.20261014*.txt`: linhas com `TAKEPROFIT619605210` e `Order`/`Execution`. A coluna de origem indica o processo (AddOn AlfaOmegaTrader = robô INVICTUS; CopyEngine = replicação).
4. `Documentos\NinjaTrader 8\alfaomega-robo\logs\audit-2026-10.jsonl`: eventos `gate_check`, `entrada*` e `place*` desse intervalo. O campo `confirmacao.licenca` mostra se a licença estava NEGATIVA no momento da entrada.
5. `Documentos\NinjaTrader 8\alfaomega-robo\config\operacional.json`: `play`, `desde`, `quem`. O arquivo não tem segredo.
6. `Documentos\NinjaTrader 8\alfaomega_copyengine.log`: houve replicação?
Não enviar ordens, não fazer flatten, não mudar PLAY/STOP durante a leitura.
