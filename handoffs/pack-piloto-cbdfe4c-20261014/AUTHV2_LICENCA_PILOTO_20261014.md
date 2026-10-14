# AUTHV2 — LICENÇA DO PC PILOTO REGULARIZADA (14/10/2026, sessão 2ce90375)

Ordem: "CORREÇÃO AUTHV2 INVICTUS", com autorização expressa do operador. O auto mode negou a leitura de produção ⇒ a sessão saiu do auto mode e cada comando de servidor passou por aprovação manual. Prazo escolhido pelo operador: **30 dias**.

## Estado ANTES (servidor, leitura redigida 2026-10-14T23:23Z)
- user 29 `piloto-01@alfaomega`: status active, travado false, tem_senha false, device_slots 0.
  - Licença sem prazo: license_days, license_started_at e license_expires_at = NULL; licenca = `sem_prazo`.
- device 92: login piloto-01, label DESKTOP-CBDFE4C, status active, revoked_at null, scopes bot/consolidator/data/gamma/q.read, last_seen 2026-10-07T02:19:54Z.
- Vínculo user 29 ↔ device 92 confirmado no servidor (`device-list piloto-01@alfaomega`).

## Causa raiz
Licença sem prazo (NULL desde a migration 004 de 20/09). O whoami devolve `license_valid = null` ⇒ `AoLogin.AplicarConta` dá status `blocked` com a mensagem "Licenca nao configurada", e `AoLicenca.Decidir` dá false ⇒ a tela mostra "LICENÇA: não ativada".
- User e device estavam ativos ⇒ nenhuma reativação foi necessária; nenhum novo enrollment.

## Correção executada (comando oficial)
```
cd /root/auth-service && node authv2-admin.js renew-user piloto-01@alfaomega --days 30
⇒ login=piloto-01@alfaomega renovado +30d  inicio=2026-10-14 23:27  nova_expiracao=2026-11-13 23:27 UTC
```

## Estado DEPOIS (releitura redigida)
- user 29: active, license_days 30, started 2026-10-14T23:27:17.102Z, **expires 2026-11-13T23:27:17.102Z**, licenca = `ativo`.
- device 92: inalterado (active, mesmo label, mesmos scopes).
- Nenhum outro usuário ou device foi tocado.

## Rollback
O CLI não tem comando para voltar a "sem prazo". Para reverter (somente com ordem do operador), SQL no Postgres do auth-service:
`UPDATE users SET license_days=NULL, license_started_at=NULL, license_expires_at=NULL WHERE id=29;`
A alternativa mais forte, `user-revoke`, bloqueia a conta (não é rollback).

## Consistência dos componentes (pack Z30X2; código lido, sem mudança)
| Componente | Caminho de autorização | Efeito da licença renovada |
|---|---|---|
| AlfaOmegaLogin / AoLogin | whoami: user+device active **e** license_valid=true com prazo; restauro automático a cada 60 s (`IntervaloRestauro`) | passa a "Acesso autorizado"; sem relogin manual em ~1 min |
| AoLicenca (`Liberado`/`Decidir`) | mesma regra + idade máx. da consulta; revalida em background | `Liberado = true` |
| AlfaOmegaAuthV2 (tokens dos relays) | token() aceita conta ativa com licença válida; scopes do device 92 = 5 `.read` | indicadores com dados; já recebiam token com prazo NULL |
| AlfaOmegaRobo | `GateLicenca` usa `AoLicenca.Liberado`, mas `licenca` ∈ `GatesConfirmacao` (override de 30/09) | confirmação passa a POSITIVA; **não muda a execução**: só PLAY/STOP veta entrada |
| AlfaOmegaTrader (:5152) | só X-AO-Token local; sem AuthV2 | nenhum |
| CopyEngine | token compartilhado do Trader; sem AuthV2 | nenhum |

**Divergência registrada (não corrigida):** indicadores e login exigem licença; a abertura do robô não exige (só PLAY/STOP); Trader e CopyEngine não consultam AuthV2. Essa é a política vigente (OPERATOR_OVERRIDE de 30/09) ⇒ não alterada. Mudá-la exige proposta em staging + JEV DIFF + homologação + ordem do operador. Nenhum patch foi preparado: a licença foi resolvida sem código.

## Validação no PC piloto (operador ou Claude do piloto; NÃO pressionar PLAY, NÃO enviar ordens)
1. Com o NT8 aberto, aguardar ~1–2 min (restauro automático) ou abrir o indicador AlfaOmegaLogin.
   - Esperado: "Acesso autorizado" / licença ativa até 13/11/2026.
2. Indicadores (NetGex0DTE, DexGexFlow, Classic, relays α): dados presentes, sem "licença não ativada".
3. Robô INVICTUS: Control Center ⇒ licença reconhecida (gate_check com `confirmacao.licenca = POSITIVA` em `Documentos\NinjaTrader 8\alfaomega-robo\logs\audit-2026-10.jsonl`, só quando houver sinal); estado **PARADO** preservado.
   - `operacional.json` ausente ou `play=false`: só leitura do arquivo.
4. Se depois de 2 min continuar "não ativada": fechar e reabrir o NT8 (sem F5, sem reimportar). Persistindo, mandar a mensagem exata da tela.

## Pendências
- Confirmação funcional no PC piloto (itens 1–3) ⇒ só então o problema está RESOLVIDO.
- Renovação antes de 13/11/2026 (`renew-user piloto-01@alfaomega --days N`).
- Origem das ordens MES/MNQ de 14/10 19:34–19:41 continua não comprovada (procedimento B em `PROCEDIMENTO_LEITURA_MANUAL_AUTHV2_ORDENS_20261014.md`).
