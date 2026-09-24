// INVICTUS JEV CODE — EXECUTOR NT8 V1: READ-ONLY / RECONCILIATION ONLY.
// CODIGO-FONTE NO REPOSITORIO: NAO instalado no NT8, NAO compilado no NT8 (F5 NOT PERFORMED).
//
// Faz: heartbeat, descoberta de contas, elegibilidade (so Simulator/Playback), descoberta de posicoes/ordens,
//      reconstrucao do estado proprio (prefixo IJC|), reconciliacao na reconexao, report ao control plane (PULL).
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
		public static volatile string State = "STOPPED";
		public static volatile string ControlPlaneStatus = "UNKNOWN";
		public static volatile string ReconStatus = "PENDING_NT8";
		public static volatile int Orphans;
		public static volatile int AccountsEligible;
		public static volatile int AccountsReported;
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
			if (recon.Orphans > 0) IjcDiag.Log("orphan_orders", "warn", recon.Orphans + " ordem(ns) IJC| sem registro no ledger (estado explicito ORPHAN)", "orphans", State);

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
				{ "selected_account", null },
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
					IjcDiag.Log("reconnect_reconciliation", "info", "conta reconectada (provider " + dto.Provider + "); ordens IJC| re-varridas", "reconnect:" + a.Name, "RECONCILING");
				}
				lastConnection[a.Name] = dto.Connection;
			}
			lastAccounts = accounts;
			lastRobotOrders = robotOrders;
			AccountsReported = accounts.Count;
			AccountsEligible = accounts.Count(x => IjcGuard.IsEligibleProvider(x.Provider));
		}
	}
}
