// (2026-10-05) Aplica A2 (OrderWatch) + A3 (Robo) da PROPOSED_account_p1s.txt no STAGING. Uso unico; falha se o trecho-alvo nao for unico.
const rep = require('./rep_edit.js');
const S = __dirname + '/staging/AddOns/';

// OrderWatch (A2) ja aplicado na 1a execucao.

rep(S + 'AlfaOmegaRobo.cs', [
// (a) locks + (b) hooks por conta + (f) prontidao
[`					if (alvo == null || _hooks.ContainsKey(alvo)) continue;
					EventHandler<ExecutionEventArgs> h = OnExecucao;
					alvo.ExecutionUpdate += h;
					_hooks[alvo] = h;
				}
			}
			catch { /* sem hook o robo ainda opera; so o P&L por estrategia fica sem fonte */ }
		}

		private static void DesassinarExecucoes()
		{
			foreach (var kv in _hooks)
				try { kv.Key.ExecutionUpdate -= kv.Value; } catch { }
			_hooks.Clear();
		}
`,
`					if (alvo == null) continue;
					lock (_hooks)
					{
						if (_hooks.ContainsKey(alvo)) continue;
						EventHandler<ExecutionEventArgs> h = OnExecucao;
						alvo.ExecutionUpdate += h;
						_hooks[alvo] = h;
					}
				}
			}
			catch { /* sem hook o robo ainda opera; so o P&L por estrategia fica sem fonte */ }
		}

		private static void DesassinarExecucoes()
		{
			lock (_hooks)
			{
				foreach (var kv in _hooks)
					try { kv.Key.ExecutionUpdate -= kv.Value; } catch { }
				_hooks.Clear();
			}
		}

		/// <summary>(2026-10-05) Esta conta NT8 ja tem o hook de ExecutionUpdate do robo?</summary>
		private static bool TemHookExecucao(string nt8Account)
		{
			if (string.IsNullOrEmpty(nt8Account)) return false;
			lock (_hooks)
				foreach (Account k in _hooks.Keys)
					if (k != null && string.Equals(k.Name, nt8Account, StringComparison.OrdinalIgnoreCase)) return true;
			return false;
		}

		/// <summary>
		/// (2026-10-05) Garante o hook de ExecutionUpdate de UMA conta, por nome — idempotente. Chamado a cada ciclo para as
		/// contas EM USO (o AssinarExecucoes roda uma unica vez, no boot, sobre as contas configuradas e presentes NAQUELE
		/// instante). Conta ausente em Account.All ⇒ false. ⚠️ SO DEPOIS DO READY-GATE (lock(Account.All)).
		/// </summary>
		private static bool GarantirHookExecucao(string nt8Account)
		{
			if (string.IsNullOrEmpty(nt8Account)) return false;
			try
			{
				if (TemHookExecucao(nt8Account)) return true;
				Account alvo = null;
				lock (Account.All)
					foreach (Account x in Account.All)
						if (x != null && string.Equals(x.Name, nt8Account, StringComparison.OrdinalIgnoreCase)) { alvo = x; break; }
				if (alvo == null) return false;
				lock (_hooks)
				{
					if (_hooks.ContainsKey(alvo)) return true;
					EventHandler<ExecutionEventArgs> h = OnExecucao;
					alvo.ExecutionUpdate += h;
					_hooks[alvo] = h;
				}
				AoRoboAudit.Log("exec_hook_subscribe", DateTime.UtcNow, null, null,
					new JObject { { "conta", nt8Account }, { "origem", "ciclo" } }, null, null, AoRoboConfig.Tier, null, null, null, null, null, null, "ok");
				return true;
			}
			catch { return false; }
		}

		/// <summary>(2026-10-05) A conta tem os DOIS hooks (ExecutionUpdate + OrderUpdate)? Sem eles o fill nao e observado.</summary>
		private static bool ContaObservavel(string nt8Account)
		{
			return TemHookExecucao(nt8Account) && AoRoboOrderWatch.TemHook(nt8Account);
		}

		// ── (2026-10-05) PRONTIDAO — observabilidade, NUNCA decisao ──────────────────────
		// Snapshot do que o robo usaria AGORA, por ativo: conta (fonte = ATIVOS/ativos.json), disponibilidade da conta,
		// PLAY/STOP, posicao existente no instrumento NAQUELA conta e EXECUTION_READY. Grava <state>\\robo-prontidao.json
		// (atomico) e audita "robo_prontidao" SO quando o conteudo muda. Nenhum gate le este arquivo; nunca envia/cancela
		// ordem; usa a posicao JA lida no ciclo (zero leitura nova de conta). Qualquer excecao e engolida.
		private static string _prontidaoUltima;
		private static string ProntidaoFile { get { return Path.Combine(AoRoboConfig.StateDir ?? "", "robo-prontidao.json"); } }

		private static void ProntidaoPasso(DateTime agora, List<string> contasEmUso)
		{
			try
			{
				bool play = false; string playErro = null;
				try { play = AoRoboOperacional.IsPlay; } catch (Exception ex) { playErro = ex.Message; }
				var ativos = new JObject();
				foreach (AoRoboAlvo a in AoRoboAtivos.Todos())
				{
					string conta = a.Account ?? "";
					bool configurada = a.ContaConfigurada;
					bool hookExec = TemHookExecucao(conta), hookOrdem = AoRoboOrderWatch.TemHook(conta);
					AoPositionState st = (a.Enabled && configurada && conta.Length > 0) ? AoRoboPositions.Get(conta, agora) : null;
					bool alcancavel = st != null && st.Ok;
					bool disponivel = configurada && hookExec && hookOrdem && alcancavel;
					string motivoConta = conta.Length == 0 ? "sem conta selecionada em ATIVOS"
						: !configurada ? "conta nao habilitada no accounts.json"
						: !(hookExec && hookOrdem) ? "conta ausente no NT8 (sem hook de execucao/ordem)"
						: !a.Enabled ? "ativo desligado (posicao nao lida)"
						: !alcancavel ? "conta inalcancavel: " + (st == null ? "sem leitura" : (st.Source + (string.IsNullOrEmpty(st.Error) ? "" : " " + st.Error)))
						: null;
					bool pgPass = false; string pgReason = "nao avaliado";
					if (string.IsNullOrEmpty(a.Nt8)) pgReason = "sem instrumento";
					else if (alcancavel && st.Positions != null)
					{
						AoPosition pos = AoRoboGates.FindPosition(st.Positions, a.Nt8);
						if (pos == null || pos.Side == "FLAT" || pos.Quantity == 0) { pgPass = true; pgReason = "flat em " + a.Nt8 + " na conta " + conta; }
						else pgReason = "posicao " + pos.Side + " " + pos.Quantity.ToString(CultureInfo.InvariantCulture) + "x em " + a.Nt8 + " na conta " + conta;
					}
					bool pronto = a.Enabled && disponivel && play && pgPass;
					string bloqueio = pronto ? null
						: !a.Enabled ? "ASSET_DISABLED"
						: !disponivel ? "ACCOUNT_NOT_AVAILABLE"
						: !play ? "OPERATIONAL_STOP"
						: "POSITION_GUARD";
					ativos[a.Codigo] = new JObject {
						{ "robot_account", conta.Length == 0 ? null : conta }, { "account_id", a.AccountId },
						{ "account_configured", configurada }, { "hook_exec", hookExec }, { "hook_ordem", hookOrdem },
						{ "account_available", disponivel }, { "account_code", disponivel ? null : "ACCOUNT_NOT_AVAILABLE" }, { "account_reason", motivoConta },
						{ "enabled", a.Enabled }, { "qty", a.Qty }, { "nt8", a.Nt8 },
						{ "position_guard", new JObject { { "pass", pgPass }, { "reason", pgReason } } },
						{ "execution_ready", pronto }, { "block_reason", bloqueio }
					};
				}
				string desde = null;
				try { DateTime d = AoRoboOperacional.DesdeUtc; if (d != DateTime.MinValue) desde = d.ToString("o", CultureInfo.InvariantCulture); } catch { }
				var corpo = new JObject {
					{ "schema", "invictus/prontidao v1" },
					{ "account_source", "ATIVOS/ativos.json" }, { "ativos_versao", AoRoboAtivos.Versao },
					{ "play_state", playErro != null ? "UNKNOWN" : (play ? "PLAY" : "STOP") },
					{ "play_desde", desde }, { "play_erro", playErro },
					{ "contas_em_uso", new JArray(contasEmUso == null ? new string[0] : contasEmUso.ToArray()) },
					{ "ativos", ativos },
					{ "_nota", "observabilidade: nenhum gate le este arquivo. position_guard aqui = existe posicao no instrumento NA CONTA DO ATIVO (independe de direcao)." }
				};
				string s = corpo.ToString(Newtonsoft.Json.Formatting.None);
				if (s == _prontidaoUltima) return;
				_prontidaoUltima = s;
				corpo["ts"] = agora.ToString("o", CultureInfo.InvariantCulture);
				if (!string.IsNullOrEmpty(AoRoboConfig.StateDir))
				{
					string f = ProntidaoFile, tmp = f + ".tmp";
					File.WriteAllText(tmp, corpo.ToString(Newtonsoft.Json.Formatting.Indented));
					if (File.Exists(f)) File.Replace(tmp, f, null); else File.Move(tmp, f);
				}
				AoRoboAudit.Log("robo_prontidao", agora, null, null, corpo, null, null, AoRoboConfig.Tier, null, null, null, null, null, null, "ok");
			}
			catch { }
		}
`],
// (c) hooks por ciclo + prontidao
[`			// (2026-10-02, G14) status de conexao conta/feed das contas em uso — so audit/alerta (nenhuma ordem, nenhum gate).
			ConexaoPasso(agora, contasEmUso);
`,
`			// (2026-10-05) hooks de execucao/ordem para as contas EM USO, a cada ciclo (idempotente): conta trocada a quente em
			// ATIVOS, autoprovisionada ou que conectou depois do boot passa a ser observada sem reiniciar o robo.
			foreach (string contaUso in contasEmUso)
			{
				try { GarantirHookExecucao(contaUso); } catch { }
				try { AoRoboOrderWatch.Garantir(contaUso); } catch { }
			}
			// (2026-10-05) prontidao por ativo (conta, PLAY, posicao) — so observabilidade.
			ProntidaoPasso(agora, contasEmUso);

			// (2026-10-02, G14) status de conexao conta/feed das contas em uso — so audit/alerta (nenhuma ordem, nenhum gate).
			ConexaoPasso(agora, contasEmUso);
`],
// (e) codigo ACCOUNT_NOT_AVAILABLE nos account_skip existentes (strings de result inalteradas)
[`										  { "ativo", alvo.Codigo }, { "conta_selecionada", alvo.Account } },
							Gates(new List<KeyValuePair<string, AoGateResult>> { new KeyValuePair<string, AoGateResult>("conta_invalida",`,
`										  { "ativo", alvo.Codigo }, { "conta_selecionada", alvo.Account }, { "code", "ACCOUNT_NOT_AVAILABLE" } },
							Gates(new List<KeyValuePair<string, AoGateResult>> { new KeyValuePair<string, AoGateResult>("conta_invalida",`],
[`										  { "equity_fonte", eqFonte }, { "account_mode", AoRoboConfig.AccountMode } },
							Gates(porConta), c.Id,`,
`										  { "equity_fonte", eqFonte }, { "account_mode", AoRoboConfig.AccountMode },
										  { "code", reprovConta.Key == "nt8_reachable" ? "ACCOUNT_NOT_AVAILABLE" : null } },
							Gates(porConta), c.Id,`],
// (d) gate fail-closed por perna
[`					if (tid != null && JaRegistrada(tid, c.Nt8Account, alvo.Nt8)) continue;   // (B3) ja submetida antes do crash: nunca reenviar
`,
`					// (2026-10-05) CONTA OBSERVAVEL (fail-closed): sem os hooks de ExecutionUpdate + OrderUpdate NA CONTA DO ATIVO o fill
					// nao e observado ⇒ o bracket pos-fill (stop+take) nao nasce. Nunca cai para outra conta. Dry-run nao tem conta real.
					bool dryConta = ctxConta.PositionState != null && ctxConta.PositionState.Source == "dry-run";
					if (!dryConta && !ContaObservavel(c.Nt8Account))
					{
						bool hkExec = TemHookExecucao(c.Nt8Account), hkOrdem = AoRoboOrderWatch.TemHook(c.Nt8Account);
						AoRoboAudit.Log("account_skip", agora, signalId, fam,
							new JObject { { "reason", alvo.Codigo + ": conta " + c.Id + " sem hook de execucao/ordem no NT8 — fill nao seria observado; nenhuma ordem enviada" },
										  { "ativo", alvo.Codigo }, { "conta_selecionada", alvo.Account }, { "code", "ACCOUNT_NOT_AVAILABLE" },
										  { "hook_exec", hkExec }, { "hook_ordem", hkOrdem } },
							Gates(new List<KeyValuePair<string, AoGateResult>> { new KeyValuePair<string, AoGateResult>("account_available",
								new AoGateResult { Pass = false, Reason = "ACCOUNT_NOT_AVAILABLE: conta sem hook de execucao/ordem" }) }),
							c.Id, AoRoboConfig.Tier, alvo.Nt8, action, alvo.Qty, stopPt, null, null, "blocked:account_not_available");
						AddMotivo(r, "account_skip: " + alvo.Codigo + " conta " + c.Id + " (ACCOUNT_NOT_AVAILABLE): sem hook de execucao/ordem");
						continue;
					}

					if (tid != null && JaRegistrada(tid, c.Nt8Account, alvo.Nt8)) continue;   // (B3) ja submetida antes do crash: nunca reenviar
`],
]);
