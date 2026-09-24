// INVICTUS JEV CODE — CAMINHO MANUAL (operador). Leitura de CONTA/PNL/POSICAO: IjcAccounts em IjcExecutor.cs.
// Instalacao: fora do lote RTH de 4 arquivos (MANUAL_ORDER_INSTALLATION = DEFERRED); a janela so o usa com IJC_MANUAL_ORDERS.
// CODIGO-FONTE NO REPOSITORIO ate a instalacao controlada (F5 unico pelo operador).
//
// MANUAL ORDER PATH (independente do Robot, do Node, do bridge, do Agent Gateway e da web):
//   OPERADOR -> clique BUY/SELL na janela NT8 -> IjcManualOrderController -> conta SELECIONADA -> Account.CreateOrder/Submit.
//   Nao le sinal JEV, nao le control plane, nao tem timer, nao reenvia apos reconexao. Um clique = no maximo 1 ordem.
//   Nome da ordem: "IJC-MANUAL|<id>" (origin=MANUAL_OPERATOR, OrderEntry.Manual). Nunca e robot-owned.
//
// APIs NT8 usadas (confirmadas por reflection em NinjaTrader.Core.dll 8.1.8.1 e pelo uso em producao, somente leitura):
//   Account.All / Name / Provider / ConnectionStatus / Denomination / Positions / OrderUpdate
//   Account.Get(AccountItem.RealizedProfitLoss | AccountItem.UnrealizedProfitLoss, Currency)
//   Account.CreateOrder(Instrument, OrderAction, OrderType, OrderEntry, TimeInForce, int, double, double, string, string, DateTime, CustomOrder)
//   Account.Submit(IEnumerable<Order>)
//   Instrument.GetInstrument(string, bool) · Instrument.FullName · MasterInstrument.TickSize
//   Position.Instrument / MarketPosition / Quantity / AveragePrice / GetUnrealizedProfitLoss(PerformanceUnit, double)
#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NinjaTrader.Cbi;
#endregion

namespace NinjaTrader.NinjaScript.AddOns.InvictusJevCode
{
	/// <summary>Controlador da boleta MANUAL. So e chamado pelo clique BUY/SELL da janela (thread da UI).</summary>
	public sealed class IjcManualOrderController : IIjcManualOrders
	{
		private readonly IjcSubmitGate gate = new IjcSubmitGate();
		private readonly object sync = new object();
		private Account watched;
		private string pendingName;

		/// <summary>Estado textual da ultima intencao manual (PENDING/ACCEPTED/WORKING/FILLED/REJECTED/...). Lido pela janela.</summary>
		private volatile string status = "IDLE";
		private volatile string detail = "";
		public string Status { get { return status; } private set { status = value; } }
		public string Detail { get { return detail; } private set { detail = value; } }
		public bool Available { get { return true; } }
		public bool InFlight { get { return gate.InFlight(DateTime.UtcNow); } }

		/// <summary>Clique EXPLICITO do operador. Valida, aplica anti-double-submit e envia 1 ordem para a conta selecionada.</summary>
		public string Click(string side, IjcTicketDraft d)
		{
			DateTime now = DateTime.UtcNow;
			Account a = Find(d == null ? null : d.Account);
			Instrument ins = d == null ? null : IjcAccounts.ResolveInstrument(d.Instrument);
			var input = new IjcTicketInput
			{
				Side = side,
				Account = d == null ? null : d.Account,
				AccountFound = a != null,
				Connection = a == null ? null : SafeConnection(a),
				Instrument = d == null ? null : d.Instrument,
				InstrumentFound = ins != null,
				TickSize = ins == null || ins.MasterInstrument == null ? 0 : ins.MasterInstrument.TickSize,
				Quantity = d == null ? 0 : d.Quantity,
				OrderType = d == null ? null : d.OrderType,
				LimitPrice = d == null ? null : d.LimitPrice
			};
			List<string> errs = IjcTicketValidator.Validate(input);
			if (errs.Count > 0) return Set("INVALID_INPUT", string.Join(", ", errs), side, d, null);

			string why;
			if (!gate.TryBegin(now, out why)) return Set("DOUBLE_SUBMIT_BLOCKED", why, side, d, null);

			string name = IjcOrigin.NewManualName();
			try
			{
				OrderAction action = side == IjcTicketValidator.Buy ? OrderAction.Buy : OrderAction.Sell;
				OrderType type = input.OrderType == IjcTicketValidator.Limit ? OrderType.Limit : OrderType.Market;
				double limit = type == OrderType.Limit ? input.LimitPrice.Value : 0;
				Watch(a, name);
				Order o = a.CreateOrder(ins, action, type, OrderEntry.Manual, TimeInForce.Day, input.Quantity, limit, 0, null, name, NinjaTrader.Core.Globals.MaxDate, null);
				if (o == null) { gate.Release(); Unwatch(); return Set("REJECTED", "CreateOrder devolveu null", side, d, name); }
				a.Submit(new[] { o });
				return Set("PENDING", "enviada; aguardando confirmacao do NT8 (sem fill presumido)", side, d, name);
			}
			catch (Exception ex)
			{
				gate.Release(); Unwatch();
				return Set("REJECTED", ex.GetType().Name + ": " + ex.Message, side, d, name);
			}
		}

		private static Account Find(string name) { return IjcAccounts.Find(name); }
		private static string SafeConnection(Account a) { try { return a.ConnectionStatus.ToString(); } catch { return "Unknown"; } }

		private string Set(string status, string detail, string side, IjcTicketDraft d, string orderName)
		{
			Status = status; Detail = detail ?? "";
			IjcDiag.LogOrder("manual_order_" + status.ToLowerInvariant(), status == "REJECTED" || status == "INVALID_INPUT" ? "warn" : "info", IjcOrigin.Manual, orderName,
				side + " " + (d == null ? "" : d.Quantity.ToString(CultureInfo.InvariantCulture) + " " + d.Instrument + " " + d.OrderType + (d.LimitPrice.HasValue ? " @" + d.LimitPrice.Value.ToString("0.########", CultureInfo.InvariantCulture) : "")) + " · " + detail);
			return status;
		}

		private void Watch(Account a, string name)
		{
			lock (sync)
			{
				Unwatch();
				watched = a; pendingName = name;
				a.OrderUpdate += OnOrderUpdate;
			}
		}

		private void Unwatch()
		{
			lock (sync)
			{
				if (watched != null) { try { watched.OrderUpdate -= OnOrderUpdate; } catch { } }
				watched = null; pendingName = null;
			}
		}

		// eventos REAIS do NT8: so estes movem o estado; nenhum fill e presumido.
		private void OnOrderUpdate(object sender, OrderEventArgs e)
		{
			try
			{
				if (e == null || e.Order == null) return;
				string n = e.Order.Name;
				if (n == null || !string.Equals(n, pendingName, StringComparison.Ordinal)) return;
				string st = e.OrderState.ToString();
				Status = st.ToUpperInvariant();
				Detail = "filled " + e.Filled.ToString(CultureInfo.InvariantCulture) + "/" + e.Quantity.ToString(CultureInfo.InvariantCulture)
					+ (e.Error != ErrorCode.NoError ? " · " + e.Error + " " + e.Comment : "");
				gate.OnOrderState(st);
				IjcDiag.LogOrder("manual_order_update", e.OrderState == OrderState.Rejected ? "warn" : "info", IjcOrigin.Manual, n, st + " · " + Detail);
				if (IjcSubmitGate.IsTerminalState(st)) Unwatch();
			}
			catch { }
		}

		public void Dispose() { Unwatch(); }
	}
}
