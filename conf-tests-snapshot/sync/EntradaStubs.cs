// ACCOUNT BINDING test_entrada (2026-10-05) — stubs SO do que fala com NT8 / broker / disco do robo.
// REAIS (compilados da fonte): caminho de abertura do AlfaOmegaRobo.cs (gen_entrada_harness.js), AlfaOmegaRoboAtivos.cs e
// AlfaOmegaRoboOrderWatch.cs do STAGING; Gates, Permissao (position_guard/dedup/teto), Dedup, Turno, Fontes, Operacional,
// OrderState, EventoAot, Fechamento, Saida, Motor, Protecao, Historico, AoJsonNum do live (fora do lote, inalterados).
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace NinjaTrader.Cbi
{
	public enum Provider { Simulator, Playback, Rithmic, Tradovate }
	public enum AccountItem { NetLiquidation, CashValue }
	public enum Currency { UsDollar }
	public enum OrderState { Unknown, Submitted, Accepted, Working, PartFilled, Filled, Cancelled, Rejected }
	public enum OrderAction { Buy, Sell, SellShort, BuyToCover }
	public enum ErrorCode { NoError, OrderRejected }
	public class Instrument { public string FullName; }
	public class Order { public Account Account; public Instrument Instrument; public string Name; public OrderAction OrderAction; }
	public class OrderEventArgs : EventArgs
	{
		public Order Order; public OrderState OrderState; public string OrderId; public int Quantity, Filled; public double AverageFillPrice;
		public ErrorCode Error; public string Comment; public DateTime Time;
	}
	public class ExecutionEventArgs : EventArgs { }
	/// <summary>Conta NT8 simulada: lista global (Account.All), contadores de assinatura (duplicidade de handler).</summary>
	public class Account
	{
		public static readonly List<Account> All = new List<Account>();
		public string Name; public Provider Provider = Provider.Simulator; public double NetLiq = 50000;
		private EventHandler<ExecutionEventArgs> _exec; private EventHandler<OrderEventArgs> _ord;
		public int AssinaturasExec, AssinaturasOrdem;
		/// <summary>(E15g) true => a proxima assinatura (+=) lanca, como um objeto NT8 que recusa o handler.</summary>
		public bool FalharAssinatura;
		public event EventHandler<ExecutionEventArgs> ExecutionUpdate { add { if (FalharAssinatura) throw new InvalidOperationException("stub: assinatura recusada"); _exec += value; AssinaturasExec++; } remove { _exec -= value; AssinaturasExec--; } }
		public event EventHandler<OrderEventArgs> OrderUpdate { add { if (FalharAssinatura) throw new InvalidOperationException("stub: assinatura recusada"); _ord += value; AssinaturasOrdem++; } remove { _ord -= value; AssinaturasOrdem--; } }
		/// <summary>(E15d/E15e) o NT8 dispara os eventos DESTE objeto (sender = this), para quem estiver assinado nele.</summary>
		public void DispararExec() { var h = _exec; if (h != null) h(this, new ExecutionEventArgs()); }
		public void DispararOrdem() { var h = _ord; if (h != null) h(this, new OrderEventArgs()); }
		public double Get(AccountItem item, Currency c) { return item == AccountItem.NetLiquidation ? NetLiq : double.NaN; }
	}
}

namespace NinjaTrader.NinjaScript.Indicators
{
	public static class AlfaOmegaSharedState { public static double LastPrice_ES, LastPrice_NQ; }
	public enum AoMarcadorTipo { EntradaLong, EntradaShort }
	public static class AoMarcadores
	{
		public static void Registrar(AoMarcadorTipo tipo, string intentId, string instrumento, double preco, int qty, DateTime agora) { }
		public static void AtualizarProtecao(string intentId, double? stop, double? take, string instrumento, int qty) { }
		public static void EncerrarOperacao(string intentId) { }
	}
	public static class AoLicenca { public static bool Liberado = true; public static string Motivo() { return "stub"; } }
	public static class AoAccounts { public static List<string> DiscoverPresentes() { return NinjaTrader.Cbi.Account.All.Select(a => a.Name).ToList(); } }
}

namespace NinjaTrader.NinjaScript.AddOns
{
	using NinjaTrader.Cbi;
	public class AoRoboAccount
	{
		public string Id, Nt8Account, AccountType = "sim"; public bool Enabled = true;
		public int Contracts = 1, MaxPositions = 1; public double MaxRiskUsd = 150;
		public List<string> Symbols = new List<string>();
		public Dictionary<string, int> MaxContracts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
		public int? MaxContractsDe(string raiz) { int m; return MaxContracts.TryGetValue(raiz ?? "", out m) ? m : (int?)null; }
	}
	public class AoContaRuntime { public string Nome, Tipo, Provider, Motivo; }
	public static class AoRoboConfig
	{
		public static string RootDir, StateDir, ConfigDir; public static bool Loaded = true, Shadow = false; public static string Tier = "TEST", AccountMode = "paper";
		public static double Contracts = 1, MaxRiskUsd = 100000;
		public static List<AoRoboAccount> Accounts = new List<AoRoboAccount>();
		public static Dictionary<string, string> Nt8Instrument = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
			{ "ES", "ES 12-26" }, { "NQ", "NQ 12-26" }, { "MES", "MES 12-26" }, { "MNQ", "MNQ 12-26" }, { "NES", "NES 12-26" }, { "NNQ", "NNQ 12-26" } };
		public static Dictionary<string, double> Multiplier = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase) {
			{ "ES", 50 }, { "NQ", 20 }, { "MES", 5 }, { "MNQ", 2 }, { "NES", 5 }, { "NNQ", 2 } };
		public static Dictionary<string, int> MaxContractsDefault = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
		public static void Load() { }
		public static AoContaRuntime RuntimeDeConta(string n) { return null; }
		public static bool AutoProvisionarConta(string nome, string tipo, string provider, out string motivo, out string id) { motivo = "stub"; id = null; return false; }
		public static double? TakePtDe(string codigo) { return (codigo ?? "").ToUpperInvariant().Contains("NQ") ? 150.0 : 60.0; }
		public static double MultFamiliaDe(string codigo) { return (codigo ?? "").ToUpperInvariant().Contains("NQ") ? 20 : 50; }
	}
	public static class AoRoboAudit
	{
		public class Ev { public string Evento, IntentId, Result, Account, Instrument; public JToken Payload; }
		public static string LogDir;
		public static readonly List<Ev> Eventos = new List<Ev>();
		public static void Log(string evento, DateTime whenUtc, string signalId = null, string symbol = null, JToken payload = null,
							   JToken gateResults = null, string account = null, string tier = null, string instrument = null, string action = null, int? qty = null,
							   double? stopPt = null, double? targetPt = null, string orderIdNt8 = null, string result = null)
		{
			lock (Eventos) Eventos.Add(new Ev { Evento = evento, IntentId = signalId, Result = result, Account = account, Instrument = instrument, Payload = payload == null ? null : payload.DeepClone() });
		}
	}
	/// <summary>Posicoes POR CONTA (chave "conta|instrumento" → qty assinada). Source "sim" (nao dry-run): o gate de hook vale.</summary>
	public static class AoRoboPositions
	{
		// (2026-10-06 UNIVERSAL) conta = identidade RAW (Ordinal), espelhando AlfaOmegaRoboPositions.cs do staging.
		public static readonly Dictionary<string, int> Pos = new Dictionary<string, int>(StringComparer.Ordinal);
		public static readonly List<string> Lidas = new List<string>();
		public static string Source = "sim";
		public static int RefreshAll(IEnumerable<string> accountNames, DateTime nowUtc, bool force = false) { return 0; }
		public static AoPositionState Get(string accountName, DateTime nowUtc)
		{
			Lidas.Add(accountName);
			// espelha AlfaOmegaRoboPositions.cs:200-202 (real): conta fora de Account.All ⇒ leitura NAO ok, Source "no-account"
			bool presente; lock (Account.All) presente = Account.All.Any(a => a != null && string.Equals(a.Name, accountName, StringComparison.Ordinal));
			if (!presente && Source != "dry-run")
				return new AoPositionState { Ok = false, Source = "no-account", Positions = null, AgeMs = -1, Error = "conta nao encontrada em Account.All: " + accountName };
			var lista = new List<AoPosition>();
			foreach (var kv in Pos)
			{
				string[] p = kv.Key.Split('|');
				if (!string.Equals(p[0], accountName, StringComparison.Ordinal) || kv.Value == 0) continue;
				lista.Add(new AoPosition { Instrument = p[1], Side = kv.Value > 0 ? "LONG" : "SHORT", Quantity = Math.Abs(kv.Value) });
			}
			return new AoPositionState { Ok = true, Source = Source, Positions = lista, AgeMs = 0, MaxAgeMs = 15000 };
		}
	}
	/// <summary>Adapter de execucao simulado: registra cada PlaceCore (o corpo que iria ao NT8). Nunca envia nada.</summary>
	public static class AlfaOmegaTrader
	{
		public class AoResult { public int HttpCode; public string Json; public bool Ok { get { return HttpCode == 200; } } }
		public static readonly List<JObject> Places = new List<JObject>();
		public static int Cancels, Brackets, Seq;
		public static AoResult PlaceCore(JObject j) { Places.Add((JObject)j.DeepClone()); return new AoResult { HttpCode = 200, Json = "{\"ok\":true,\"orderId\":\"ord-" + (++Seq) + "\",\"state\":\"Submitted\"}" }; }
		public static AoResult BracketCore(JObject j) { Brackets++; return new AoResult { HttpCode = 200, Json = "{\"ok\":true,\"orders\":[]}" }; }
		public static AoResult CancelCore(JObject j) { Cancels++; return new AoResult { HttpCode = 200, Json = "{\"ok\":true,\"cancelled\":0}" }; }
		public static AoResult ChangeCore(JObject j) { return new AoResult { HttpCode = 200, Json = "{\"ok\":true}" }; }
		public static AoResult OrdersCore(string account, bool activeOnly) { return new AoResult { HttpCode = 200, Json = "{\"ok\":true,\"orders\":[]}" }; }
	}
	public static class AoRoboLedger
	{
		public static readonly List<string> Atribuicoes = new List<string>();
		public static void Atribuir(string intentId, string estrategia, string nome, string fam, string nt8Account) { Atribuicoes.Add(intentId + "|" + nt8Account); }
	}
	public class AoRoboEntryMqResult { public double? Stop, Target; }

	/// <summary>Membros do AlfaOmegaRobo FORA do caminho de decisao de conta/abertura — stubs declarados.</summary>
	public static partial class AlfaOmegaRobo
	{
		public static int FillsEntrada;
		private static void ReconciliarPernas(string tid, DateTime agora, bool fresco, AoResultadoEntrada r) { }
		private static void AplicarFillOrfao(string intentId, DateTime agora) { }
		private static void GravarExecucoes() { }
		/// <summary>(E15d/E15e) stub do handler real (fora do harness): so conta quantos ExecutionUpdate chegaram.</summary>
		public static int ExecRecebidos;
		private static void OnExecucao(object sender, ExecutionEventArgs e) { ExecRecebidos++; }
		public static void OnFillEntrada(string intentId, string instrumento, string conta, int preenchida, double precoMedio, DateTime agora) { FillsEntrada++; }
		private static JObject ResumoStack() { return null; }
		private static JObject ResumoRefAot(string localSide) { return null; }
		// ── acesso de teste ──
		public static AoResultadoEntrada Entrar(AoMotorCanonico m, DateTime agora, AoEventoAot ev) { return ExecutarEntrada(m, agora, AoRoboConfig.Accounts.Where(a => a.Enabled).ToList(), ev, true, false); }
		public static bool HookExec(string conta) { return TemHookExecucao(conta); }
		public static bool GarantirExec(string conta) { return GarantirHookExecucao(conta); }
		public static bool Observavel(string conta) { return ContaObservavel(conta); }
		public static List<string> EmUso() { return ContasEmUso(AoRoboConfig.Accounts); }
		public static int HooksExec { get { lock (_hooks) return _hooks.Count; } }
		public static void Limpar() { lock (_protGate) _execucoes.Clear(); lock (_hooks) _hooks.Clear(); }
		public static int Execucoes { get { lock (_protGate) return _execucoes.Count; } }
		public static List<JObject> Regs() { return SnapExecucoes(); }
		public static void PrepararEquity(string arquivo) { _equity = new AoRoboEquity(arquivo); }
		public static void PrepararFontes(AoReadiness r) { _fontes = r; }
	}
}
