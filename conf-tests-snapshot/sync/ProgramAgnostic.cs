// ACCOUNT-AGNOSTIC (2026-10-05) — EXECUTA o AlfaOmegaRoboConfig.cs REAL (live, fora do lote: RuntimeDeConta / AutoProvisionarConta /
// Load) e o AlfaOmegaRoboAtivos.cs REAL do STAGING (SetConta / ContaDe / ContaConfigurada / Alvo / persistencia) com nomes de conta
// ARBITRARIOS. Os nomes abaixo sao FIXTURES: o codigo de producao nao os conhece (AG02 confere no fonte).
// Fluxo provado: conta existe no NT8 → operador escolhe em ATIVOS (SetConta) → accounts.json autoprovisionado pelo produto →
// ativos.json → runtime (Alvo/ContaConfigurada) resolve EXATAMENTE a conta escolhida. Sem NT8, sem ordem; raiz temporaria propria.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript.AddOns;

public static class ProgramAgnostic
{
	static int _fails, _oks;
	static void Ok(bool c, string nome) { if (c) { _oks++; Console.WriteLine("PASS " + nome); } else { _fails++; Console.WriteLine("FAIL " + nome); } }
	static readonly string[] Seis = { "ES", "NQ", "MES", "MNQ", "NES", "NNQ" };

	// fixture: nome NT8 arbitrario, provider, account_type esperado (derivado SO do provider)
	static readonly object[][] Fx = {
		new object[] { "ES",  "Conta-X",                    Provider.Simulator, "sim"  },
		new object[] { "NQ",  "PROP-ABC",                   Provider.Rithmic,   "real" },
		new object[] { "MES", "REAL-987",                   Provider.Tradovate, "real" },
		new object[] { "MNQ", "SIM-CUSTOM",                 Provider.Simulator, "sim"  },
		new object[] { "NES", "Sim阿爾法・歐米伽 零零一",       Provider.Simulator, "sim"  },
		new object[] { "NNQ", "Conta Nova 2027 (futura)",   Provider.Cqg,       "real" },
	};

	static JArray ContasNoDisco(string cfg) { return (JArray)JObject.Parse(File.ReadAllText(Path.Combine(cfg, "accounts.json")))["accounts"]; }
	// (2026-10-06 UNIVERSAL) contagem RAW (Ordinal): contas que diferem so por caixa sao identidades distintas.
	static int Entradas(string cfg, string nome) { return ContasNoDisco(cfg).Count(o => string.Equals((string)o["nt8_account"], nome, StringComparison.Ordinal)); }
	static JObject EntradaRaw(string cfg, string nome) { return ContasNoDisco(cfg).OfType<JObject>().FirstOrDefault(o => (string)o["nt8_account"] == nome); }
	static void Nt8(string nome, Provider p) { lock (Account.All) Account.All.Add(new Account { Name = nome, Provider = p }); }

	public static int Main(string[] args)
	{
		string root = Path.Combine(Path.GetTempPath(), "ao-agnostic-test-" + Guid.NewGuid().ToString("N"));
		string cfg = Path.Combine(root, "config");
		Directory.CreateDirectory(cfg); Directory.CreateDirectory(Path.Combine(root, "state")); Directory.CreateDirectory(Path.Combine(root, "logs"));
		try
		{
			var instr = new JObject();
			foreach (string c in Seis) instr[c] = new JObject { { "nt8", c + " 12-26" }, { "multiplier", 1.0 } };
			File.WriteAllText(Path.Combine(cfg, "runtime.json"), new JObject { { "shadow", true }, { "instruments", instr } }.ToString());
			// accounts.json SEM nenhuma conta: so os defaults reais. Nenhuma conta pre-cadastrada.
			File.WriteAllText(Path.Combine(cfg, "accounts.json"), new JObject {
				{ "defaults", new JObject { { "contracts", 1 }, { "max_positions", 1 }, { "max_risk_usd", 150 },
											{ "symbols", new JArray("ES", "NQ") }, { "max_contracts", new JObject { { "MES", 5 }, { "MNQ", 5 } } } } },
				{ "accounts", new JArray() } }.ToString());
			foreach (var f in Fx) Nt8((string)f[1], (Provider)f[2]);
			AoRoboAtivos.Init(root);

			// ── AG00 — sem default: com 6 contas no NT8 nenhuma e escolhida sozinha ──
			Ok(Seis.All(c => AoRoboAtivos.ContaDe(c) == "" && AoRoboAtivos.Alvo(c).AccountId == null && AoRoboAtivos.ContaDoAtivo(c) == null),
				"AG00 SILENT_FALLBACK=0: 6 contas presentes no NT8 e ativos.json sem conta => todo ativo fica SEM conta (nenhuma 1a conta, nenhum default)");
			Ok(AoRoboConfig.Accounts.Count == 0, "AG00b accounts.json sem contas => nenhuma conta autorizada por codigo");

			// ── AG01 — qualquer nome / qualquer provider: escolher em ATIVOS = autoprovisiona + resolve EXATAMENTE a conta ──
			foreach (var f in Fx)
			{
				string cod = (string)f[0], nome = (string)f[1], tipo = (string)f[3];
				bool set = AoRoboAtivos.SetConta(cod, nome, "teste", "t");
				AoRoboAccount c = AoRoboAtivos.ContaConfigurada(nome);
				Ok(set && AoRoboAtivos.ContaDe(cod) == nome && c != null && c.Nt8Account == nome && c.AccountType == tipo
					&& AoRoboAtivos.Alvo(cod).Account == nome && AoRoboAtivos.Alvo(cod).AccountId == c.Id && Entradas(cfg, nome) == 1,
					"AG01 " + cod + " -> '" + nome + "' (" + f[2] + "): CONFIGURE_ACCOUNT ok, runtime resolve a conta EXATA, account_type=" + (c == null ? "?" : c.AccountType)
					+ " (do Provider), accounts.json autoprovisionado 1x, id=" + (c == null ? "?" : c.Id) + (set ? "" : " erro=" + AoRoboAtivos.UltimoErro));
			}
			var ids = Fx.Select(f => AoRoboAtivos.ContaConfigurada((string)f[1])).Where(c => c != null).Select(c => c.Id).ToList();
			Ok(ids.Count == 6 && ids.Distinct(StringComparer.OrdinalIgnoreCase).Count() == 6, "AG01b ids internos unicos (" + string.Join(",", ids) + ") => nome da ordem AO|<id>|... distingue as 6 contas");

			// ── AG02 — o codigo de producao nao conhece nenhum desses nomes ──
			string fonte = File.ReadAllText(args[0]) + File.ReadAllText(args[1]);
			Ok(Fx.All(f => fonte.IndexOf((string)f[1], StringComparison.OrdinalIgnoreCase) < 0) && (fonte.IndexOf("Sim101", StringComparison.Ordinal) < 0 || OnlyComments(args, "Sim101")),
				"AG02 nenhum nome de fixture aparece no fonte de producao executado (Config live + Ativos staging); 'Sim101' so em comentario");

			// ── AG03 — reinicio: config relida do disco resolve as mesmas contas ──
			AoRoboConfig.Load(); AoRoboAtivos.Carregar(true);
			Ok(Fx.All(f => AoRoboAtivos.ContaDe((string)f[0]) == (string)f[1] && AoRoboAtivos.ContaDoAtivo((string)f[0]) != null),
				"AG03 apos recarregar ativos.json + accounts.json do disco: cada ativo continua na SUA conta");

			// ── AG04 (UNIVERSAL 2026-10-06) — identidade RAW: 'conta-x' NAO e 'Conta-X'. Nome RAW ausente do NT8 => fail-closed, sem troca ──
			int n04 = ContasNoDisco(cfg).Count;
			Ok(!AoRoboAtivos.SetConta("MNQ", "conta-x", "teste", "t") && AoRoboAtivos.ContaDe("MNQ") == "SIM-CUSTOM" && Entradas(cfg, "conta-x") == 0 && ContasNoDisco(cfg).Count == n04,
				"AG04 escolher 'conta-x' (so 'Conta-X' existe no NT8) => recusado fail-closed (" + AoRoboAtivos.UltimoErro + "); MNQ segue SIM-CUSTOM; nada gravado; nenhuma aproximacao por caixa");
			Ok(AoRoboAtivos.SetConta("MNQ", "Conta-X", "teste", "t") && AoRoboAtivos.ContaDe("MNQ") == "Conta-X" && Entradas(cfg, "Conta-X") == 1,
				"AG04b escolher 'Conta-X' RAW: 2 ativos na mesma conta = 1 entrada no accounts.json (idempotente)");

			// ── AG05 — troca dinamica sem restart: ES Conta-X → PROP-ABC → REAL-987 ──
			AoRoboAudit.Eventos.Clear();
			bool t1 = AoRoboAtivos.SetConta("ES", "PROP-ABC", "teste", "t"); string e1 = AoRoboAtivos.ContaDe("ES");
			bool t2 = AoRoboAtivos.SetConta("ES", "REAL-987", "teste", "t"); string e2 = AoRoboAtivos.ContaDe("ES");
			var mud = AoRoboAudit.Eventos.Where(e => e.Evento == "robo_account_change").ToList();
			Ok(t1 && t2 && e1 == "PROP-ABC" && e2 == "REAL-987" && AoRoboAtivos.Alvo("ES").Account == "REAL-987",
				"AG05 ACCOUNT_CHANGE_WITHOUT_RESTART: ES Conta-X -> PROP-ABC -> REAL-987; Alvo(ES) = REAL-987");
			Ok(mud.Count == 2 && (string)mud[0].Payload["anterior"] == "Conta-X" && (string)mud[0].Payload["novo"] == "PROP-ABC"
				&& (string)mud[1].Payload["anterior"] == "PROP-ABC" && (string)mud[1].Payload["novo"] == "REAL-987",
				"AG05b audit robo_account_change 2x com anterior/novo exatos");
			AoRoboAtivos.Carregar(true);
			Ok(AoRoboAtivos.ContaDe("ES") == "REAL-987", "AG05c troca persistida no ativos.json (relido = REAL-987)");

			// ── AG06 — conta inexistente no NT8: nada gravado, nada trocado ──
			int antes = ContasNoDisco(cfg).Count;
			Ok(!AoRoboAtivos.SetConta("NQ", "Fantasma-555", "teste", "t") && AoRoboAtivos.ContaDe("NQ") == "PROP-ABC" && ContasNoDisco(cfg).Count == antes,
				"AG06 conta fora do NT8 => recusada (" + AoRoboAtivos.UltimoErro + "); NQ segue PROP-ABC; accounts.json intocado");

			// ── AG07 (UNIVERSAL 2026-10-06) — Provider Unknown: conta presente em Account.All e SUPORTADA; tipo = "unknown" (so telemetria) ──
			Nt8("Broker-Sem-Provider", Provider.Unknown);
			bool s07 = AoRoboAtivos.SetConta("NNQ", "Broker-Sem-Provider", "teste", "t");
			AoRoboAccount c07 = AoRoboAtivos.ContaDoAtivo("NNQ");
			JObject e07 = EntradaRaw(cfg, "Broker-Sem-Provider");
			Ok(s07 && AoRoboAtivos.ContaDe("NNQ") == "Broker-Sem-Provider" && c07 != null && c07.Nt8Account == "Broker-Sem-Provider"
				&& AoRoboAtivos.Alvo("NNQ").AccountId == c07.Id && Entradas(cfg, "Broker-Sem-Provider") == 1,
				"AG07 Provider=Unknown => conta SUPORTADA: autoprovisionada 1x, NNQ resolve a conta EXATA (id=" + (c07 == null ? "?" : c07.Id) + ")" + (s07 ? "" : " erro=" + AoRoboAtivos.UltimoErro));
			Ok(c07 != null && c07.AccountType == "unknown" && e07 != null && (string)e07["account_type"] == "unknown",
				"AG07b telemetria verdadeira: account_type='" + (c07 == null ? "?" : c07.AccountType) + "' (nao rotulado sim nem real) no runtime e no accounts.json");

			// ── AG08 — conta escolhida SOME do NT8: nunca e trocada por outra ──
			lock (Account.All) Account.All.RemoveAll(a => a.Name == "PROP-ABC");
			AoRoboAtivos.Carregar(true);
			Ok(AoRoboAtivos.ContaDe("NQ") == "PROP-ABC" && Seis.All(c => AoRoboAtivos.ContaDe(c) != "") ,
				"AG08 PROP-ABC desconectada/removida do NT8 => NQ continua apontando para PROP-ABC (nenhuma troca automatica); bloqueio de envio = gate de hook (test_entrada E5/E15)");
			Nt8("PROP-ABC", Provider.Rithmic);
			Ok(AoRoboAtivos.ContaDe("NQ") == "PROP-ABC" && AoRoboAtivos.ContaDoAtivo("NQ") != null, "AG08b PROP-ABC volta ao NT8 => reconhecida pelo fluxo normal, sem recompilar");

			// ── AG09 (UNIVERSAL 2026-10-06) — identidade RAW: 2 contas do NT8 que diferem SO por caixa sao contas DISTINTAS ──
			Nt8("Case-Dup-77", Provider.Simulator); Nt8("CASE-DUP-77", Provider.Rithmic);
			bool s9a = AoRoboAtivos.SetConta("MES", "CASE-DUP-77", "teste", "t");
			bool s9b = AoRoboAtivos.SetConta("MNQ", "Case-Dup-77", "teste", "t");
			AoRoboAccount c9a = AoRoboAtivos.ContaDoAtivo("MES"), c9b = AoRoboAtivos.ContaDoAtivo("MNQ");
			Ok(s9a && s9b && AoRoboAtivos.ContaDe("MES") == "CASE-DUP-77" && AoRoboAtivos.ContaDe("MNQ") == "Case-Dup-77",
				"AG09a MES='CASE-DUP-77' e MNQ='Case-Dup-77' gravados RAW (ContaDe MES=" + AoRoboAtivos.ContaDe("MES") + " MNQ=" + AoRoboAtivos.ContaDe("MNQ") + ")");
			Ok(c9a != null && c9b != null && c9a.Nt8Account == "CASE-DUP-77" && c9b.Nt8Account == "Case-Dup-77" && c9a.Id != c9b.Id
				&& c9a.AccountType == "real" && c9b.AccountType == "sim",
				"AG09b runtime resolve cada ativo na SUA conta exata (MES->" + (c9a == null ? "null" : c9a.Nt8Account + "/" + c9a.Id + "/" + c9a.AccountType)
				+ " MNQ->" + (c9b == null ? "null" : c9b.Nt8Account + "/" + c9b.Id + "/" + c9b.AccountType) + ")");
			Ok(ContasNoDisco(cfg).Count(o => (string)o["nt8_account"] == "CASE-DUP-77") == 1 && ContasNoDisco(cfg).Count(o => (string)o["nt8_account"] == "Case-Dup-77") == 1,
				"AG09c accounts.json tem 1 entrada RAW para CADA uma das 2 contas");
			Ok(AoRoboAtivos.ContaConfigurada("CASE-DUP-77") == c9a && AoRoboAtivos.ContaConfigurada("Case-Dup-77") == c9b && AoRoboAtivos.ContaConfigurada("case-dup-77") == null,
				"AG09d resolucao RAW: 'CASE-DUP-77' -> so CASE-DUP-77; 'Case-Dup-77' -> so Case-Dup-77; 'case-dup-77' -> null (nenhum 1o match aproximado)");
			int n09 = ContasNoDisco(cfg).Count;
			Ok(!AoRoboAtivos.SetConta("NES", "case-dup-77", "teste", "t") && AoRoboAtivos.ContaDe("NES") == "Sim阿爾法・歐米伽 零零一" && ContasNoDisco(cfg).Count == n09,
				"AG09e conta RAW ausente 'case-dup-77' => fail-closed (" + AoRoboAtivos.UltimoErro + "); NES intocado; sem fallback para CASE-DUP-77/Case-Dup-77");

			// ── AG10 (UNIVERSAL 2026-10-06) — 6 pernas em 6 contas DISTINTAS ao mesmo tempo (sim/real/unknown, caixa, CJK, nome longo) ──
			string longo = "Conta Operador Muito Longa 0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ ÇÃÕ 長い口座名 — fim";
			Nt8(longo, Provider.Simulator);
			var alvo10 = new Dictionary<string, string> {
				{ "ES", longo }, { "NQ", "PROP-ABC" }, { "MES", "CASE-DUP-77" }, { "MNQ", "Case-Dup-77" }, { "NES", "Sim阿爾法・歐米伽 零零一" }, { "NNQ", "Broker-Sem-Provider" } };
			foreach (var kv in alvo10) AoRoboAtivos.SetConta(kv.Key, kv.Value, "teste", "t");
			bool ok10 = true; var ids10 = new List<string>();
			foreach (var kv in alvo10)
			{
				AoRoboAccount c = AoRoboAtivos.ContaDoAtivo(kv.Key); var a = AoRoboAtivos.Alvo(kv.Key);
				bool ok = c != null && AoRoboAtivos.ContaDe(kv.Key) == kv.Value && c.Nt8Account == kv.Value && a.Account == kv.Value && a.AccountId == c.Id && Entradas(cfg, kv.Value) == 1;
				Console.WriteLine("   " + kv.Key + " ATIVOS='" + AoRoboAtivos.ContaDe(kv.Key) + "' ROBO='" + (c == null ? "null" : c.Nt8Account) + "' id=" + (c == null ? "?" : c.Id) + " tipo=" + (c == null ? "?" : c.AccountType) + (ok ? "" : "  <== FALHA"));
				ok10 &= ok; if (c != null) ids10.Add(c.Id);
			}
			Ok(ok10 && ids10.Distinct(StringComparer.Ordinal).Count() == 6, "AG10 6 pernas / 6 contas distintas simultaneas: ATIVOS RAW == runtime RAW em cada perna, ids distintos");
			AoRoboConfig.Load(); AoRoboAtivos.Carregar(true);
			Ok(alvo10.All(kv => AoRoboAtivos.ContaDe(kv.Key) == kv.Value && AoRoboAtivos.ContaDoAtivo(kv.Key) != null && AoRoboAtivos.ContaDoAtivo(kv.Key).Nt8Account == kv.Value),
				"AG10b apos recarregar do disco: as 6 pernas continuam nas MESMAS contas RAW (nome longo + CJK + caixa + Unknown)");

			// ── AG11 (UNIVERSAL 2026-10-06) — tipo/provider = TELEMETRIA: nenhum leitor de AccountType fora de payload de telemetria ──
			if (args.Length > 2 && Directory.Exists(args[2]))
			{
				var leitores = new List<string>();
				foreach (string f in Directory.GetFiles(args[2], "*.cs"))
					foreach (string l in File.ReadAllLines(f))
						if (l.Contains(".AccountType") && !l.Contains("\"account_type\"") && !l.Contains("\"is_real_money\"") && !l.Contains("AccountType = (string)o[\"account_type\"]"))
							leitores.Add(Path.GetFileName(f) + ": " + l.Trim());
				Ok(leitores.Count == 0, "AG11 ACCOUNT_TYPE_EXECUTION_GATE=0: AccountType so aparece em payload de telemetria (account_type/is_real_money) nos .cs do staging" + (leitores.Count == 0 ? "" : " — " + string.Join(" | ", leitores)));
			}
			else Ok(false, "AG11 pasta do staging nao informada (args[2])");
		}
		finally { try { Directory.Delete(root, true); } catch { } }
		Console.WriteLine();
		Console.WriteLine("AGNOSTIC: checks=" + (_oks + _fails) + " ok=" + _oks + " fail=" + _fails + " => " + (_fails == 0 ? "PASS" : "FAIL"));
		return _fails == 0 ? 0 : 1;
	}

	/// <summary>true se TODA ocorrencia de `s` nos fontes estiver numa linha de comentario (// ou ///).</summary>
	static bool OnlyComments(string[] fontes, string s)
	{
		foreach (string f in fontes.Take(2))
			foreach (string l in File.ReadAllLines(f))
			{
				int i = l.IndexOf(s, StringComparison.Ordinal); if (i < 0) continue;
				int k = l.IndexOf("//", StringComparison.Ordinal);
				if (k < 0 || k > i) return false;
			}
		return true;
	}
}
