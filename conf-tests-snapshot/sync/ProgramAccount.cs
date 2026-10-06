// ACCOUNT BINDING (2026-10-05) — test_account. Compila o AlfaOmegaRoboAtivos.cs REAL do STAGING (AoRoboAtivos + AoContaMismatch)
// com stubs so de config/audit (nada de NT8, nenhuma conta, nenhuma ordem). Raiz temporaria propria (nunca o alfaomega-robo real).
//   ACC05 zero fallback Sim101 · ACC06 conta ausente nao troca · ACC09 restart mantem binding · ACC10/EXEC04 seis pernas
//   ACC11 o painel le o que esta em ativos.json · ACC12 mudanca persiste · ACC15 ACCOUNT_MISMATCH (peca pura)
using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;

namespace NinjaTrader.NinjaScript.AddOns
{
	public class AoRoboAccount { public string Id, Nt8Account; public bool Enabled = true; }
	public class AoContaRuntime { public string Nome, Tipo, Provider, Motivo; }
	public static class AoRoboConfig
	{
		public static string RootDir; public static bool Loaded = true; public static string Tier = "T";
		public static double Contracts = 1;
		public static List<AoRoboAccount> Accounts = new List<AoRoboAccount>();
		public static Dictionary<string, string> Nt8Instrument = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { { "ES", "ES 12-26" }, { "NQ", "NQ 12-26" } };
		public static Dictionary<string, double> Multiplier = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase) { { "ES", 50 }, { "NQ", 20 } };
		public static Dictionary<string, int> MaxContractsDefault = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
		public static void Load() { }
		public static int RuntimeConsultas;
		public static AoContaRuntime RuntimeDeConta(string n) { RuntimeConsultas++; return null; }   // NT8 nao tem a conta
		public static bool AutoProvisionarConta(string nome, string tipo, string provider, out string motivo, out string id) { motivo = "stub"; id = null; return false; }
	}
	public static class AoRoboAudit
	{
		public static string LogDir; public static List<string> Eventos = new List<string>();
		public static void Log(string evento, DateTime when, string signalId = null, string symbol = null, JToken payload = null, object gates = null, string accountId = null,
			string tier = null, string instrument = null, object a1 = null, object a2 = null, object a3 = null, object a4 = null, object a5 = null, string result = null)
		{ Eventos.Add(evento + "|" + (payload == null ? "" : payload.ToString(Newtonsoft.Json.Formatting.None))); }
	}
	public static class AoRoboOperacional { public static string QuemPadrao() { return "teste"; } }
}
namespace NinjaTrader.NinjaScript.Indicators
{
	public static class AoAccounts { public static List<string> DiscoverPresentes() { return new List<string>(); } }
}

namespace AccountSim
{
	using NinjaTrader.NinjaScript.AddOns;

	public static class ProgramAccount
	{
		static int _fails, _oks;
		static void Ok(bool c, string nome) { if (c) _oks++; else { _fails++; Console.WriteLine("  FAIL " + nome); } }
		static readonly string[] Seis = { "ES", "NQ", "MES", "MNQ", "NES", "NNQ" };

		public static int Main(string[] args)
		{
			string root = Path.Combine(Path.GetTempPath(), "ao-account-test-" + Guid.NewGuid().ToString("N"));
			Directory.CreateDirectory(root);
			try
			{
				AoRoboConfig.Accounts.Add(new AoRoboAccount { Id = "a", Nt8Account = "ContaA" });
				AoRoboConfig.Accounts.Add(new AoRoboAccount { Id = "b", Nt8Account = "ContaB" });
				AoRoboConfig.Accounts.Add(new AoRoboAccount { Id = "sim", Nt8Account = "Sim101" });
				AoRoboConfig.Accounts.Add(new AoRoboAccount { Id = "off", Nt8Account = "ContaOff", Enabled = false });
				AoRoboAtivos.Init(root);
				string arq = AoRoboAtivos.Arquivo;
				Ok(!string.IsNullOrEmpty(arq) && arq.StartsWith(root, StringComparison.OrdinalIgnoreCase), "arquivo de ativos dentro da raiz temporaria (" + arq + ")");

				// ── ACC05 — instalacao sem arquivo: NENHUMA conta por omissao ──
				if (File.Exists(arq)) File.Delete(arq);
				AoRoboAtivos.Carregar(true);
				bool vazias = true, semCfg = true;
				foreach (string c in Seis) { if (AoRoboAtivos.ContaDe(c) != "") vazias = false; if (AoRoboAtivos.ContaDoAtivo(c) != null) semCfg = false; }
				Ok(vazias, "ACC05 sem ativos.json => ContaDe = \"\" nos 6 ativos (zero fallback Sim101)");
				Ok(semCfg, "ACC05/ACC06 sem conta gravada => ContaDoAtivo = null nos 6 (a perna cai no account_skip conta_invalida / ACCOUNT_NOT_AVAILABLE)");
				bool alvoVazio = true; foreach (AoRoboAlvo a in AoRoboAtivos.Todos()) if (!string.IsNullOrEmpty(a.Account) || a.ContaConfigurada) alvoVazio = false;
				Ok(alvoVazio && AoRoboAtivos.Todos().Count == 6, "ACC05/ACC11 Todos() (o que o painel desenha): 6 ativos, conta vazia, ContaConfigurada=false");

				// ── ACC05 — arquivo ilegivel / ativo sem `account` ──
				Directory.CreateDirectory(Path.GetDirectoryName(arq));
				File.WriteAllText(arq, "{ isto nao e json");
				AoRoboAtivos.Carregar(true);
				bool v2 = true; foreach (string c in Seis) if (AoRoboAtivos.ContaDe(c) != "") v2 = false;
				Ok(v2, "ACC05 ativos.json ILEGIVEL => conta vazia nos 6 (antes: Sim101 em silencio)");
				File.WriteAllText(arq, "{\"version\":7,\"ativos\":{\"ES\":{\"enabled\":true,\"qty\":1},\"NQ\":{\"enabled\":true,\"qty\":1,\"account\":\"ContaB\"}}}");
				AoRoboAtivos.Carregar(true);
				Ok(AoRoboAtivos.ContaDe("ES") == "" && AoRoboAtivos.ContaDe("NQ") == "ContaB", "ACC05 ativo SEM `account` no arquivo => vazio; o que tem conta explicita e respeitado");

				// ── ACC12 / ACC09 — mudanca persiste e sobrevive ao restart ──
				File.Delete(arq); AoRoboAtivos.Carregar(true);
				int mudou = 0; Action h = () => mudou++;
				AoRoboAtivos.Mudou += h;
				Ok(AoRoboAtivos.SetConta("ES", "ContaA", "teste", "t"), "ACC12 SetConta(ES, ContaA) aceito");
				Ok(AoRoboAtivos.ContaDe("ES") == "ContaA" && AoRoboAtivos.ContaDoAtivo("ES") != null && AoRoboAtivos.ContaDoAtivo("ES").Id == "a", "ACC12 runtime passa a usar ContaA imediatamente (sem recompilar/reiniciar)");
				Ok(mudou == 1, "ACC13 a troca dispara AoRoboAtivos.Mudou (" + mudou + ")");
				JObject j = JObject.Parse(File.ReadAllText(arq));
				Ok((string)j["ativos"]["ES"]["account"] == "ContaA", "ACC12 ativos.json gravado com ES = ContaA");
				bool outrosVazios = true; foreach (string c in Seis) if (c != "ES" && (string)j["ativos"][c]["account"] != "") outrosVazios = false;
				Ok(outrosVazios && !File.ReadAllText(arq).Contains("Sim101"), "ACC05 Gravar() NAO escreve conta por omissao nos outros 5 (nenhum \"Sim101\" no arquivo)");
				AoRoboAtivos.Carregar(true);
				Ok(AoRoboAtivos.ContaDe("ES") == "ContaA", "ACC09 restart (recarga do arquivo) mantem ES = ContaA");

				// ── ACC06 — conta inexistente: nada muda, nada cai para outra conta ──
				int ev0 = AoRoboAudit.Eventos.Count;
				Ok(!AoRoboAtivos.SetConta("ES", "Fantasma", "teste", "t") && AoRoboAtivos.ContaDe("ES") == "ContaA" && (AoRoboAtivos.UltimoErro ?? "").Contains("indisponivel"), "ACC06 conta que o NT8 nao tem => recusada (fail-closed), binding inalterado, erro explicito");
				Ok(!AoRoboAtivos.SetConta("ES", "ContaOff", "teste", "t") && AoRoboAtivos.ContaDe("ES") == "ContaA", "ACC06 conta desabilitada no accounts.json => recusada, binding inalterado");
				Ok(!AoRoboAtivos.SetConta("ES", "", "teste", "t") && AoRoboAtivos.ContaDe("ES") == "ContaA", "ACC06 conta vazia => recusada");
				Ok(AoRoboAudit.Eventos.Count == ev0, "ACC06 recusa nao gera robo_account_change");
				Ok(AoRoboAtivos.ContaConfigurada("") == null && AoRoboAtivos.ContaConfigurada(null) == null && AoRoboAtivos.ContaConfigurada("ContaOff") == null, "ACC06 ContaConfigurada(\"\"/null/desabilitada) = null");

				// ── ACC10 / EXEC04 / P18 — seis pernas, cada uma na SUA conta ──
				var esperado = new Dictionary<string, string> { { "ES", "ContaA" }, { "NQ", "ContaB" }, { "MES", "ContaB" }, { "MNQ", "ContaA" }, { "NES", "Sim101" }, { "NNQ", "ContaB" } };
				foreach (var kv in esperado) if (AoRoboAtivos.ContaDe(kv.Key) != kv.Value) AoRoboAtivos.SetConta(kv.Key, kv.Value, "teste", "t");
				for (int volta = 0; volta < 2; volta++)
				{
					bool ok6 = true; string det = "";
					foreach (AoRoboAlvo a in AoRoboAtivos.Todos())
					{
						string e = esperado[a.Codigo]; AoRoboAccount cfg = AoRoboAtivos.ContaDoAtivo(a.Codigo);
						// CONFIG (arquivo) == RUNTIME (ContaDe) == alvo usado pelo robo (a.Account / AccountId) == conta do accounts.json que vai ao submit (cfg.Nt8Account)
						string noArquivo = (string)JObject.Parse(File.ReadAllText(arq))["ativos"][a.Codigo]["account"];
						if (!(noArquivo == e && AoRoboAtivos.ContaDe(a.Codigo) == e && a.Account == e && cfg != null && cfg.Nt8Account == e && a.AccountId == cfg.Id)) { ok6 = false; det += a.Codigo + " "; }
					}
					Ok(ok6, "ACC10/EXEC04 seis pernas: CONFIG == RUNTIME == ALVO == conta do submit" + (volta == 1 ? " (apos restart)" : "") + (det == "" ? "" : " — divergiu: " + det));
					AoRoboAtivos.Carregar(true);
				}
				Ok(AoRoboAtivos.SetConta("NES", "ContaA", "teste", "t") && AoRoboAtivos.ContaDe("NES") == "ContaA" && AoRoboAtivos.ContaDe("ES") == "ContaA" && AoRoboAtivos.ContaDe("NQ") == "ContaB",
					"ACC02/ACC03 trocar Sim101 -> ContaA em UM ativo nao altera os outros (escopo por ativo)");
				int nChange = 0; foreach (string e in AoRoboAudit.Eventos) if (e.StartsWith("robo_account_change|")) nChange++;
				Ok(nChange >= 7, "P20 toda troca auditada (robo_account_change x" + nChange + ")");
				AoRoboAtivos.Mudou -= h;

				// ── ACC15 — ACCOUNT_MISMATCH (peca pura usada pelo painel) ──
				Ok(AoContaMismatch.Avaliar("ES 12-26", "ContaA", "ES", "ES 12-26", "ContaA") == null, "ACC15 contas iguais => sem aviso");
				Ok(AoContaMismatch.Avaliar("ES 12-26", "contaa", "ES", "ES 12-26", "ContaA") != null, "ACC15 (UNIVERSAL 2026-10-06) identidade RAW: grafico=contaa x robo=ContaA => ACCOUNT_MISMATCH (contas que diferem so por caixa sao distintas)");
				string mm = AoContaMismatch.Avaliar("ES 12-26", "Conta001", "ES", "ES 12-26", "Sim101");
				Ok(mm == "ACCOUNT_MISMATCH: robo=Sim101 · grafico=Conta001 (ES)", "ACC15 grafico=Conta001 x robo=Sim101 => " + mm);
				Ok(AoContaMismatch.Avaliar("ES 12-26", "Conta001", "ES", "ES 12-26", "") == "ACCOUNT_MISMATCH: robo=(nenhuma) · grafico=Conta001 (ES)", "ACC15 ativo sem conta => robo=(nenhuma)");
				Ok(AoContaMismatch.Avaliar("ES 12-26", "Conta001", "MES", "MES 12-26", "Sim101") == null && AoContaMismatch.Avaliar("MES 12-26", "Conta001", "ES", "ES 12-26", "Sim101") == null, "ACC15 grafico de ES nao acusa o ativo MES (e vice-versa): casa pelo contrato");
				Ok(AoContaMismatch.Avaliar("CL 11-26", "Conta001", "ES", "ES 12-26", "Sim101") == null, "ACC15 grafico fora do universo do robo => sem aviso");
				Ok(AoContaMismatch.Avaliar("ES 12-26", "", "ES", "ES 12-26", "Sim101") == null && AoContaMismatch.Avaliar("ES 12-26", null, "ES", "ES 12-26", "Sim101") == null, "ACC15 painel sem conta => sem aviso");
				Ok(AoContaMismatch.Avaliar("NQ 12-26", "Conta001", "NQ", null, "Sim101") != null && AoContaMismatch.Avaliar("MNQ 12-26", "Conta001", "NQ", null, "Sim101") == null, "ACC15 sem contrato resolvido => casa pela raiz exata (NQ != MNQ)");
				Ok(AoContaMismatch.Codigo == "ACCOUNT_MISMATCH", "ACC15 codigo estavel ACCOUNT_MISMATCH");
			}
			finally { try { Directory.Delete(root, true); } catch { } }
			Console.WriteLine();
			Console.WriteLine("ACCOUNT: checks=" + (_oks + _fails) + " ok=" + _oks + " fail=" + _fails + " => " + (_fails == 0 ? "PASS" : "FAIL"));
			return _fails == 0 ? 0 : 1;
		}
	}
}
