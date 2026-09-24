// INVICTUS JEV CODE — EXECUTOR NT8 do ROBOT: RECONCILIATION / REPORT. Binding de ordem do ROBOT isolado (HARD_DISABLED; ver IjcPure.cs).
// A boleta MANUAL nao passa por aqui (IjcManualOrders.cs) e nao depende do control plane.
//
// Faz: heartbeat, descoberta de contas, elegibilidade (so Simulator/Playback), descoberta de posicoes/ordens,
//      reconstrucao do estado proprio (prefixo IJC-ROBOT|; ordens IJC-MANUAL| nunca sao do robo), reconciliacao na reconexao, report ao control plane (PULL).
// NAO faz (e nao contem codigo para): enviar, alterar ou cancelar ordem, zerar posicao, ATM. Intents recebidas
//      (nunca existem neste build) sao recusadas como HARD_DISABLED.
// Threads (padrao Invictus): thread dedicada IsBackground, nunca Timer; nada de WPF/Dispatcher aqui;
//      ready-gate por latch de Account.All.Count lido sem lock; lock(Account.All) so para COPIAR, 1 varredura a cada 10 s.
#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
#endregion

namespace NinjaTrader.NinjaScript.AddOns.InvictusJevCode
{
	public static class IjcExecutor
	{
		private const string ControlPlane = "http://127.0.0.1:3591";
		private const int CycleMs = 2000;
		private const int ScanEveryCycles = 5;

		private static readonly object Gate = new object();
		private static Thread thread;
		private static volatile bool running;
		private static volatile bool nt8Ready;
		private static string token;
		private static int cycle;
		private static long intentsRejected;
		private static List<IjcAccountDto> lastAccounts = new List<IjcAccountDto>();
		private static List<IjcOrderDto> lastRobotOrders = new List<IjcOrderDto>();
		private static readonly Dictionary<string, string> lastConnection = new Dictionary<string, string>(StringComparer.Ordinal);
		private static readonly HashSet<string> ledgerOrderNames = new HashSet<string>(StringComparer.Ordinal); // vazio neste build

		// estado publico para a janela (somente leitura; atualizado pela thread do executor)
		// campos volateis privados + propriedades publicas: o NinjaTrader.Custom declara [assembly: CLSCompliant(true)],
		// e campo publico volatil gera CS3026 no F5 (detectado pelo shadow compile).
		private static volatile string state = "STOPPED";
		private static volatile string controlPlaneStatus = "UNKNOWN";
		private static volatile string reconStatus = "PENDING_NT8";
		private static volatile int orphans;
		private static volatile int accountsEligible;
		private static volatile int accountsReported;
		public static string State { get { return state; } private set { state = value; } }
		public static string ControlPlaneStatus { get { return controlPlaneStatus; } private set { controlPlaneStatus = value; } }
		public static string ReconStatus { get { return reconStatus; } private set { reconStatus = value; } }
		public static int Orphans { get { return orphans; } private set { orphans = value; } }
		public static int AccountsEligible { get { return accountsEligible; } private set { accountsEligible = value; } }
		public static int AccountsReported { get { return accountsReported; } private set { accountsReported = value; } }
		public static DateTime LastReportUtc = DateTime.MinValue;

		public static void Start()
		{
			lock (Gate)
			{
				if (running) return;
				running = true;
				State = "STARTING";
				thread = new Thread(Loop) { IsBackground = true, Name = "IJC.Executor" };
				thread.Start();
				IjcDiag.Log("executor_start", "info", "READ_ONLY; ORDER_PATH=" + IjcSafety.ORDER_PATH, null, "STARTING");
			}
		}

		public static void Stop()
		{
			Thread t;
			lock (Gate) { running = false; t = thread; thread = null; }
			try { if (t != null) t.Join(3000); } catch { }
			State = "STOPPED";
			IjcDiag.Log("executor_stop", "info", "shutdown", null, "STOPPED");
		}

		private static bool IsNt8Ready()
		{
			if (nt8Ready) return true;
			try
			{
				var all = Account.All;               // SEM lock (ready-gate): ler .Count nao trava durante o boot
				if (all != null && all.Count > 0) { nt8Ready = true; return true; }
			}
			catch { }
			return false;
		}

		private static string TokenPath()
		{
			return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InvictusJevCode", "secrets", "control-plane.token");
		}

		private static string Token()
		{
			if (token != null) return token;
			try { string p = TokenPath(); if (File.Exists(p)) token = File.ReadAllText(p).Trim(); } catch { }
			return token;
		}

		/// <summary>Controle do ROBOT pela janela NT8 (unica autoridade de ON): "enable-request" (origin NT8_WINDOW) ou "disable".
		/// O pedido de ON passa pelos gates do Robot Core; sem politica/regra ativa ele volta a OFF com os motivos.
		/// Nao envolve a boleta manual. Chamar fora da thread da UI.</summary>
		public static string RobotControl(string action)
		{
			string tok = Token();
			if (tok == null) return "{\"ok\":false,\"error\":\"NO_TOKEN\"}";
			string path = action == "disable" ? "/robot/v1/disable" : action == "enable" ? "/robot/v1/enable-request" : null;
			if (path == null) return "{\"ok\":false,\"error\":\"ACTION_INVALID\"}";
			int st;
			string body = action == "enable" ? "{\"origin\":\"NT8_WINDOW\"}" : "{}";
			string r = IjcHttp.Request("POST", ControlPlane + path, body, tok, 2000, out st);
			IjcDiag.Log("robot_control", "info", action + " -> HTTP " + st.ToString(CultureInfo.InvariantCulture), null, State);
			return r ?? "{\"ok\":false,\"error\":\"CONTROL_PLANE_" + (st == 0 ? "OFFLINE" : st.ToString(CultureInfo.InvariantCulture)) + "\"}";
		}

		private static void Loop()
		{
			int errors = 0;
			while (running)
			{
				try { Cycle(); errors = 0; }
				catch (Exception ex)
				{
					errors++;
					IjcDiag.Log("executor_error", "error", ex.GetType().Name + ": " + ex.Message, "executor_error", State);
					if (errors >= 3) State = "HALTED_ERRORS";
				}
				Thread.Sleep(CycleMs);
			}
		}

		private static void Cycle()
		{
			cycle++;
			bool ready = IsNt8Ready();
			bool forceScan = false;
			if (ready && (cycle % ScanEveryCycles == 1 || lastAccounts.Count == 0)) forceScan = true;
			if (ready && forceScan) Scan();
			IjcReconResult recon = IjcOwnership.Reconstruct(ready, lastRobotOrders, ledgerOrderNames);
			ReconStatus = recon.Status;
			Orphans = recon.Orphans;
			State = !ready ? "WAITING_NT8" : (State == "HALTED_ERRORS" ? State : "READ_ONLY");
			if (recon.Orphans > 0) IjcDiag.Log("orphan_orders", "warn", recon.Orphans + " ordem(ns) IJC-ROBOT| sem registro no ledger (estado explicito ORPHAN)", "orphans", State);

			string tok = Token();
			if (tok == null) { ControlPlaneStatus = "NO_TOKEN"; return; } // sem token: nenhuma operacao de controle

			// PULL de intents: neste build o control plane sempre devolve lista vazia; qualquer intent recebida e recusada.
			int st;
			string intents = IjcHttp.Request("GET", ControlPlane + "/robot/v1/intents?after=0", null, tok, 1500, out st);
			if (st == 401) { token = null; ControlPlaneStatus = "UNAUTHORIZED"; return; }
			ControlPlaneStatus = st == 200 ? "CONNECTED" : "OFFLINE";
			if (st == 200 && intents != null)
			{
				JObject j = IjcJson.Parse(intents);
				JArray arr = j["intents"] as JArray;
				if (arr != null && arr.Count > 0)
				{
					foreach (JToken it in arr) IjcExecutionStub.SubmitIntent(IjcJson.S(it, "intent_id"), IjcJson.S(it, "snapshot_id")); // devolve HARD_DISABLED
					intentsRejected += arr.Count;
					IjcDiag.Log("intent_rejected", "warn", arr.Count + " intent(s) recusada(s): " + IjcSafety.ORDER_PATH, "intent_rejected", State);
				}
			}

			JObject report = new JObject
			{
				{ "executor_state", State }, { "nt8_ready", ready }, { "order_path", IjcSafety.ORDER_PATH },
				{ "selected_account", IjcSession.SelectedAccount },   // conta escolhida pelo operador na janela (null = nenhuma)
				{ "accounts", new JArray(lastAccounts.Select(a => new JObject { { "name", a.Name }, { "provider", a.Provider }, { "connection", a.Connection }, { "eligible", IjcGuard.IsEligibleProvider(a.Provider) }, { "foreign_positions", a.ForeignPositions } })) },
				{ "orders_owned", new JArray(recon.OwnedOrders.Select(o => new JObject { { "name", o.Name }, { "state", o.State }, { "instrument", o.Instrument }, { "quantity", o.Quantity } })) },
				{ "positions_owned", new JArray() },   // propriedade de posicao so via ledger (vazio neste build)
				{ "reconciliation", new JObject { { "status", recon.Status }, { "orphans", recon.Orphans }, { "completed_at", DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) } } },
				{ "position_state", recon.PositionState },
				{ "rejected_intents", intentsRejected }
			};
			IjcHttp.Request("POST", ControlPlane + "/robot/v1/report", report.ToString(Formatting.None), tok, 1500, out st);
			if (st == 200) LastReportUtc = DateTime.UtcNow;
		}

		private static void Scan()
		{
			var accounts = new List<IjcAccountDto>();
			var robotOrders = new List<IjcOrderDto>();
			Account[] snap;
			lock (Account.All) { snap = Account.All.ToArray(); }            // dentro do lock: SO copia
			foreach (Account a in snap)
			{
				var dto = new IjcAccountDto { Name = a.Name };
				try { dto.Provider = a.Provider.ToString(); } catch { dto.Provider = null; }        // nulo => inelegivel (fail-closed)
				try { dto.Connection = a.ConnectionStatus.ToString(); } catch { dto.Connection = "Unknown"; }
				Order[] orders; Position[] positions;
				lock (a.Orders) { orders = a.Orders.ToArray(); }
				lock (a.Positions) { positions = a.Positions.ToArray(); }
				foreach (Order o in orders)
				{
					if (o == null || !IjcGuard.IsRobotOrderName(o.Name)) continue;   // ordens de outras origens nunca sao lidas como proprias
					robotOrders.Add(new IjcOrderDto { Account = a.Name, Name = o.Name, State = o.OrderState.ToString(), Instrument = o.Instrument == null ? null : o.Instrument.FullName, Quantity = o.Quantity, Filled = o.Filled });
				}
				dto.ForeignPositions = positions.Count(p => p != null && p.MarketPosition != MarketPosition.Flat); // nao sao do robo (ledger vazio)
				accounts.Add(dto);

				// reconexao: conta volta a Connected => reconciliacao obrigatoria registrada (esta varredura E a reconciliacao)
				string prev;
				if (lastConnection.TryGetValue(a.Name, out prev) && prev != dto.Connection && dto.Connection == "Connected")
				{
					ReconStatus = "RECONCILING";
					IjcDiag.Log("reconnect_reconciliation", "info", "conta reconectada (provider " + dto.Provider + "); ordens IJC-ROBOT| re-varridas", "reconnect:" + a.Name, "RECONCILING");
				}
				lastConnection[a.Name] = dto.Connection;
			}
			lastAccounts = accounts;
			lastRobotOrders = robotOrders;
			AccountsReported = accounts.Count;
			AccountsEligible = accounts.Count(x => IjcGuard.IsEligibleProvider(x.Provider));
		}
	}

	public class IjcAccountInfo { public string Name; public string Provider; public string Kind; public string Connection; public string Currency; }

	public class IjcAccountSnapshot
	{
		public IjcAccountInfo Info;          // null => conta nao encontrada
		public IjcPnlView Pnl;
		public IjcPositionView Position;
		public DateTime AtUtc;
	}

	/// <summary>Leitura de contas do NT8. Dentro do lock so se copia; nenhuma escrita.</summary>
	public static class IjcAccounts
	{
		public static Account[] Snapshot()
		{
			try { lock (Account.All) { return Account.All.ToArray(); } } catch { return new Account[0]; }
		}

		public static Account Find(string name)
		{
			if (string.IsNullOrEmpty(name)) return null;
			return Snapshot().FirstOrDefault(a => a != null && string.Equals(a.Name, name, StringComparison.Ordinal));
		}

		public static IjcAccountInfo Info(Account a)
		{
			var i = new IjcAccountInfo { Name = a.Name };
			try { i.Provider = a.Provider.ToString(); } catch { i.Provider = null; }
			try { i.Connection = a.ConnectionStatus.ToString(); } catch { i.Connection = "Unknown"; }
			try { i.Currency = a.Denomination.ToString(); } catch { i.Currency = null; }
			i.Kind = IjcGuard.AccountKind(i.Provider);            // SIM/LIVE so para exibicao (metadado real do NT8)
			return i;
		}

		public static List<IjcAccountInfo> List()
		{
			return Snapshot().Where(a => a != null).Select(Info).OrderBy(x => x.Name, StringComparer.Ordinal).ToList();
		}

		/// <summary>Resolve contrato NT8 completo (ex.: "ES 12-26"). Nunca cria instrumento. null = invalido.</summary>
		public static Instrument ResolveInstrument(string fullName)
		{
			if (string.IsNullOrWhiteSpace(fullName)) return null;
			try { return Instrument.GetInstrument(fullName.Trim(), false); } catch { return null; }
		}

		private static double? Item(Account a, AccountItem item, Currency cur)
		{
			try { double v = a.Get(item, cur); return double.IsNaN(v) || double.IsInfinity(v) ? (double?)null : v; } catch { return null; }
		}

		/// <summary>PNL da CONTA (AccountItem) + posicao conta+instrumento. Fonte: NT8, nunca o motor JEV.</summary>
		public static IjcAccountSnapshot Read(string accountName, string instrumentName)
		{
			var snap = new IjcAccountSnapshot { AtUtc = DateTime.UtcNow };
			Account a = Find(accountName);
			if (a == null)
			{
				snap.Pnl = IjcPnlView.Compose(!string.IsNullOrEmpty(accountName), false, null, null, null);
				snap.Position = IjcPositionView.Unknown("NO_ACCOUNT");
				return snap;
			}
			snap.Info = Info(a);
			bool connected = snap.Info.Connection == "Connected";
			Currency cur = Currency.UsDollar;
			bool curOk = true;
			try { cur = a.Denomination; } catch { curOk = false; }
			double? realized = curOk ? Item(a, AccountItem.RealizedProfitLoss, cur) : null;
			double? unrealized = curOk ? Item(a, AccountItem.UnrealizedProfitLoss, cur) : null;
			snap.Pnl = IjcPnlView.Compose(true, connected, realized, unrealized, curOk ? cur.ToString() : null);

			Instrument ins = ResolveInstrument(instrumentName);
			if (ins == null) { snap.Position = IjcPositionView.Unknown(string.IsNullOrWhiteSpace(instrumentName) ? "NO_INSTRUMENT" : "INSTRUMENT_INVALID"); return snap; }
			if (!connected) { snap.Position = IjcPositionView.Unknown("DISCONNECTED"); return snap; }
			Position[] positions;
			try { lock (a.Positions) { positions = a.Positions.ToArray(); } } catch { snap.Position = IjcPositionView.Unknown("READ_FAILED"); return snap; }
			Position p = positions.FirstOrDefault(x => x != null && x.Instrument != null && string.Equals(x.Instrument.FullName, ins.FullName, StringComparison.Ordinal));
			if (p == null || p.MarketPosition == MarketPosition.Flat) { snap.Position = IjcPositionView.From(true, "Flat", 0, 0, null); return snap; }
			double? open = null;
			try { double u = p.GetUnrealizedProfitLoss(PerformanceUnit.Currency, double.MinValue); if (!double.IsNaN(u) && !double.IsInfinity(u)) open = u; } catch { open = null; }
			snap.Position = IjcPositionView.From(true, p.MarketPosition.ToString(), p.Quantity, p.AveragePrice, open);
			return snap;
		}
	}
}
