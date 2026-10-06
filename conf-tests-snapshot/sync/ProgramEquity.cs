// EQUITY_GUARD test_equity (2026-10-02) — E1–E6 sobre o codigo REAL (gen_equity_harness.js): AoRoboEquity (Fechamento staging),
// LerEquity + trecho do ctx de conta do ExecutarEntradaCore (Robo da fonte escolhida) e PropfirmGuard/JsNum/JsStr do LIVE (so leitura).
// Stub so do NT8: NinjaTrader.Cbi.Account/AccountItem/Currency/Provider. Sem NT8, sem conta, sem ordem.
// Controle (Robo fe048080, bloco `AccountMode != "live" ⇒ 25000`): E3/E4/E5 devem FALHAR.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading;
using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript.AddOns;

namespace NinjaTrader.Cbi
{
	public enum AccountItem { NetLiquidation, CashValue }
	public enum Currency { UsDollar }
	public enum Provider { Simulator, Playback, Rithmic, Tradovate, Unknown }
	public class Account
	{
		public static List<Account> All = new List<Account>();
		public string Name; public Provider Provider; public double Nl = double.NaN, Cv = double.NaN; public bool Lanca;
		public double Get(AccountItem i, Currency c)
		{
			if (Lanca) throw new InvalidOperationException("stub: Account.Get falhou");
			return i == AccountItem.NetLiquidation ? Nl : Cv;
		}
	}
}

namespace NinjaTrader.NinjaScript.AddOns
{
	public class AoRoboAccount { public string Id, Nt8Account, AccountType; }
	public static class AoRoboConfig { public static string AccountMode = "paper"; }
	public static class AoMotorCanonico
	{
		public static string Iso(DateTime utc) { return (utc.Kind == DateTimeKind.Utc ? utc : utc.ToUniversalTime()).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture); }
	}
}

static class ProgramEquity
{
	static int pass, fail;
	static readonly Dictionary<string, string> Status = new Dictionary<string, string>();
	static void Ok(string nome, bool ok, string det = null)
	{
		if (ok) pass++; else fail++;
		string k = nome.Split(' ')[0]; Status[k] = Status.ContainsKey(k) && Status[k] != "PASS" ? Status[k] : (ok ? "PASS" : "FAIL");
		Console.WriteLine((ok ? "PASS " : "FAIL ") + nome + (det == null ? "" : "   [" + det + "]"));
	}
	static string Tmp(string n) { return Path.Combine(Path.GetTempPath(), "equity_" + System.Diagnostics.Process.GetCurrentProcess().Id + "_" + n + ".json"); }

	class Decisao { public bool Pass; public string Reason, Fonte; public double? Peak, Current; public override string ToString() { return (Pass ? "pass" : "recusa") + " fonte=" + Fonte + " peak=" + Peak + " cur=" + Current + " | " + Reason; } }

	/// <summary>Uma entrada pela conta: Account.All = {conta}, modo, equity → trecho REAL do Robo → PropfirmGuard REAL.</summary>
	static Decisao Entrada(AoRoboEquity eqs, string mode, Account conta, string nome, string tipo)
	{
		Account.All = conta == null ? new List<Account>() : new List<Account> { conta };
		AoRoboConfig.AccountMode = mode;
		AlfaOmegaRoboEquitySim.SetEquity(eqs);
		var c = new AoRoboAccount { Id = "acc-" + nome, Nt8Account = nome, AccountType = tipo };
		var ctx = new AoRoboCtx { Symbol = "ES", Instrument = "MES 12-26", AccountId = c.Id, Nt8Account = nome, TradeIntentId = "t", SignalId = "t", NowUtc = DateTime.UtcNow };
		string fonte = AlfaOmegaRoboEquitySim.PreencherEquity(ctx, c, DateTime.UtcNow);
		AoGateResult g = AlfaOmegaRoboEquitySim.Guard(null, ctx);
		return new Decisao { Pass = g.Pass, Reason = g.Reason, Fonte = fonte, Peak = ctx.PeakEquity, Current = ctx.CurrentEquity };
	}
	static Account Conta(string nome, Provider p, double nl, double cv) { return new Account { Name = nome, Provider = p, Nl = nl, Cv = cv }; }

	public static int Main(string[] args)
	{
		bool controle = args.Length > 0 && args[0] == "controle";
		Console.WriteLine("fonte Robo: " + AlfaOmegaRoboEquitySim.Fonte + " · LerEquity=" + AlfaOmegaRoboEquitySim.TemLerEquity);
		Console.WriteLine("trecho ctx: " + AlfaOmegaRoboEquitySim.Trecho.Replace("\n", " ").Substring(0, Math.Min(160, AlfaOmegaRoboEquitySim.Trecho.Length)) + " …");
		string fonte;

		// ── E1 Valida (NetLiquidation > CashValue > null; NaN/∞/≤0 invalidos) ──
		Ok("E1a NL valido", AoRoboEquity.Valida(25000, 1, out fonte) == 25000 && fonte == AoRoboEquity.FonteNl);
		Ok("E1b NL=0 ⇒ CV", AoRoboEquity.Valida(0, 24000, out fonte) == 24000 && fonte == AoRoboEquity.FonteCv);
		Ok("E1c NL NaN ⇒ CV", AoRoboEquity.Valida(double.NaN, 24000, out fonte) == 24000 && fonte == AoRoboEquity.FonteCv);
		Ok("E1d NL ∞ e CV<0 ⇒ null", AoRoboEquity.Valida(double.PositiveInfinity, -1, out fonte) == null && fonte == AoRoboEquity.FonteNenhuma);
		Ok("E1e NL<0 e CV=0 ⇒ null", AoRoboEquity.Valida(-5, 0, out fonte) == null && fonte == AoRoboEquity.FonteNenhuma);
		Ok("E1f NaN/NaN ⇒ null", AoRoboEquity.Valida(double.NaN, double.NaN, out fonte) == null);

		// ── E2 Peak (high-water mark por conta, persistido, so sobe; corrompido ⇒ null) ──
		string pf = Tmp("peak"); if (File.Exists(pf)) File.Delete(pf);
		var e2 = new AoRoboEquity(pf);
		DateTime t0 = new DateTime(2026, 10, 2, 13, 30, 0, DateTimeKind.Utc);
		Ok("E2a 1a leitura = atual", e2.Peak("A", 25000, t0) == 25000);
		Ok("E2b sobe com alta", e2.Peak("A", 26000.5, t0) == 26000.5);
		Ok("E2c nao desce com queda", e2.Peak("A", 24000, t0) == 26000.5);
		Ok("E2d por conta (B independente de A)", e2.Peak("B", 10000, t0) == 10000 && e2.Peak("A", 1, t0) == 26000.5);
		Ok("E2e leitura invalida ⇒ null, peak intacto", e2.Peak("A", double.NaN, t0) == null && e2.Peak("A", 0, t0) == null && e2.Peak("A", 20000, t0) == 26000.5);
		var cult = Thread.CurrentThread.CurrentCulture;
		Thread.CurrentThread.CurrentCulture = new CultureInfo("pt-BR");
		var e2r = new AoRoboEquity(pf);   // restart (F5) com cultura pt-BR
		Thread.CurrentThread.CurrentCulture = cult;
		JObject arq;   // ler como o robo le (sem conversao de data) — o arquivo guarda string ISO
		using (var jr = new Newtonsoft.Json.JsonTextReader(new StringReader(File.ReadAllText(pf))) { DateParseHandling = Newtonsoft.Json.DateParseHandling.None })
			arq = JObject.Load(jr);
		Ok("E2f sobrevive ao restart (arquivo, pt-BR)", !e2r.Corrompido && e2r.Peak("A", 20000, t0) == 26000.5 && e2r.Peak("B", 9000, t0) == 10000,
			(string)arq["schema"] + " " + (string)arq["updated_utc"]);
		Ok("E2g updated_utc ISO invariante", (string)arq["updated_utc"] == "2026-10-02T13:30:00.000Z");
		string pc = Tmp("corrompido"); File.WriteAllText(pc, "{ oops");
		var e2c = new AoRoboEquity(pc);
		Ok("E2h arquivo corrompido ⇒ Peak null (fail-closed)", e2c.Corrompido && e2c.Peak("A", 25000, t0) == null);

		// ── E3 PropfirmGuard com equity real (trecho REAL do Robo), paper e live ──
		foreach (string mode in new[] { "paper", "live" })
		{
			var e3 = new AoRoboEquity(null);
			var acc = Conta("Sim101", Provider.Simulator, 25000, 25000);
			Decisao d1 = Entrada(e3, mode, acc, "Sim101", "sim");
			Ok("E3a " + mode + " equity 25000 ⇒ pass", d1.Pass && d1.Fonte == AoRoboEquity.FonteNl && d1.Current == 25000 && d1.Peak == 25000, d1.ToString());
			acc.Nl = 26500; Decisao d2 = Entrada(e3, mode, acc, "Sim101", "sim");
			Ok("E3b " + mode + " alta 26500 ⇒ pass, peak 26500", d2.Pass && d2.Peak == 26500, d2.ToString());
			acc.Nl = 24990; Decisao d3 = Entrada(e3, mode, acc, "Sim101", "sim");
			Ok("E3c " + mode + " queda 24990 (cushion -10) ⇒ RECUSA", !d3.Pass && d3.Peak == 26500 && d3.Current == 24990 && (d3.Reason ?? "").Contains("drawdown"), d3.ToString());
		}

		// ── E4 Matriz de contas arbitrarias: nome × provider × account_type × account_mode ⇒ decisao identica ──
		string[] nomes = { "Sim101", "TAKEPROFIT130445759", "Rithmic-X", "Playback101", "Conta Ação ünï 101" };
		Provider[] provs = { Provider.Simulator, Provider.Playback, Provider.Rithmic, Provider.Unknown };
		string[] tipos = { "sim", "real", "propfirm" };
		string[] modos = { "paper", "live" };
		var passa = new HashSet<string>(); var recusa = new HashSet<string>(); int casos = 0;
		foreach (string n in nomes) foreach (Provider p in provs) foreach (string tp in tipos) foreach (string md in modos)
		{
			casos++;
			var ea = new AoRoboEquity(null); var a = Conta(n, p, 25000, 25000);
			passa.Add(Entrada(ea, md, a, n, tp).ToString());
			var eb = new AoRoboEquity(null); var b = Conta(n, p, 26500, 0);
			Entrada(eb, md, b, n, tp); b.Nl = 24990;
			recusa.Add(Entrada(eb, md, b, n, tp).ToString());
		}
		Ok("E4a " + casos + " combinacoes, equity 25000 ⇒ 1 decisao (pass)", passa.Count == 1 && passa.First().StartsWith("pass"), string.Join(" || ", passa.Take(3)));
		Ok("E4b " + casos + " combinacoes, peak 26500/24990 ⇒ 1 decisao (recusa)", recusa.Count == 1 && recusa.First().StartsWith("recusa"), string.Join(" || ", recusa.Take(3)));

		// ── E5 equity ilegivel ⇒ recusa fail-closed com equity_fonte; legivel ⇒ pass (live e paper) ──
		foreach (string mode in new[] { "live", "paper" })
		{
			Decisao ausente = Entrada(new AoRoboEquity(null), mode, null, "Fantasma", "real");
			Ok("E5a " + mode + " conta ausente do NT8 ⇒ recusa, fonte=indisponivel", !ausente.Pass && ausente.Fonte == AoRoboEquity.FonteNenhuma && ausente.Peak == null, ausente.ToString());
			Decisao inval = Entrada(new AoRoboEquity(null), mode, Conta("Prop-1", Provider.Rithmic, double.NaN, 0), "Prop-1", "propfirm");
			Ok("E5b " + mode + " NL/CV invalidos ⇒ recusa", !inval.Pass && inval.Fonte == AoRoboEquity.FonteNenhuma, inval.ToString());
			var lanca = Conta("Real-1", Provider.Rithmic, 30000, 30000); lanca.Lanca = true;
			Decisao exc = Entrada(new AoRoboEquity(null), mode, lanca, "Real-1", "real");
			Ok("E5c " + mode + " Account.Get lanca ⇒ recusa", !exc.Pass && exc.Fonte == AoRoboEquity.FonteNenhuma, exc.ToString());
			Decisao leg = Entrada(new AoRoboEquity(null), mode, Conta("Real-1", Provider.Rithmic, 30000, 30000), "Real-1", "real");
			Ok("E5d " + mode + " equity legivel ⇒ pass (NetLiquidation)", leg.Pass && leg.Fonte == AoRoboEquity.FonteNl && leg.Current == 30000, leg.ToString());
			Decisao cv = Entrada(new AoRoboEquity(null), mode, Conta("Real-2", Provider.Unknown, 0, 27000), "Real-2", "real");
			Ok("E5e " + mode + " NL=0 ⇒ CashValue ⇒ pass", cv.Pass && cv.Fonte == AoRoboEquity.FonteCv && cv.Current == 27000, cv.ToString());
			Decisao corr = Entrada(new AoRoboEquity(pc), mode, Conta("Real-1", Provider.Rithmic, 30000, 30000), "Real-1", "real");
			Ok("E5f " + mode + " peak corrompido ⇒ recusa, fonte=indisponivel:peak", !corr.Pass && corr.Fonte == AoRoboEquity.FonteNenhuma + ":peak" && corr.Peak == null, corr.ToString());
		}
		try { File.Delete(pf); File.Delete(pc); } catch { }

		Console.WriteLine();
		Console.WriteLine("TOTAL: " + pass + " PASS · " + fail + " FAIL");
		if (controle)
		{
			string[] esperadas = { "E3c", "E4a", "E4b", "E5a", "E5d" };
			bool todas = esperadas.All(k => Status.ContainsKey(k) && Status[k] != "PASS");
			Console.WriteLine("CONTROLE (Robo antigo): falhas esperadas em E3/E4/E5 ⇒ " + string.Join(", ", esperadas.Select(k => k + "=" + (Status.ContainsKey(k) ? Status[k] : "N/A"))));
			Console.WriteLine(todas ? "CONTROLE_OK (o harness detecta a equity inventada/ausente)" : "CONTROLE_FALHOU (o harness NAO detecta o defeito)");
			return todas ? 0 : 1;
		}
		return fail == 0 ? 0 : 1;
	}
}
