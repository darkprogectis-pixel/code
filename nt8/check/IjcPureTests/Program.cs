// Harness offline das pecas puras do INVICTUS JEV CODE (sem NT8, sem rede externa, sem ordem). Exit 0 = PASS.
using System.Linq;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading;
using NinjaTrader.NinjaScript.AddOns.InvictusJevCode;

public static class Program
{
	private static int pass, fail;
	private static void Check(string name, bool ok) { if (ok) pass++; else { fail++; Console.WriteLine("FAIL " + name); } }

	public static int Main()
	{
		// maquina pt-BR: prova que o parse numerico nao depende da cultura
		Thread.CurrentThread.CurrentCulture = new CultureInfo("pt-BR");

		Check("safety: JEV_CAN_SEND_ORDER false", IjcSafety.JEV_CAN_SEND_ORDER == false);
		Check("safety: ORDER_PATH HARD_DISABLED", IjcSafety.ORDER_PATH == "HARD_DISABLED");
		Check("guard: Simulator aceito", IjcGuard.IsEligibleProvider("Simulator"));
		Check("guard: Playback aceito", IjcGuard.IsEligibleProvider("Playback"));
		foreach (string real in new[] { "Rithmic", "Tradovate", "CQG", "Interactive Brokers", "Kinetick", "simulator", "SIMULATOR", "Sim", "", null, "Playback ", " Simulator" })
			Check("guard: rejeita '" + real + "'", !IjcGuard.IsEligibleProvider(real));
		Check("prefix: IJC-ROBOT| e do robo", IjcGuard.IsRobotOrderName("IJC-ROBOT|abc"));
		foreach (string other in new[] { "IJC-MANUAL|x", "IJC|x", "AO|x", "AoBoleta-LONG", "ijc-robot|x", "IJC-ROBOTx", "", null, " IJC-ROBOT|x" })
			Check("prefix: '" + other + "' nao e do robo", !IjcGuard.IsRobotOrderName(other));
		Check("ownership: manual", IjcOrigin.OwnerOf("IJC-MANUAL|a1") == "MANUAL_OPERATOR" && IjcGuard.IsManualOrderName("IJC-MANUAL|a1"));
		Check("ownership: robot", IjcOrigin.OwnerOf("IJC-ROBOT|a1") == "JEV_ROBOT");
		Check("ownership: foreign", IjcOrigin.OwnerOf("AoBoleta-LONG") == "FOREIGN" && IjcOrigin.OwnerOf(null) == "FOREIGN" && IjcOrigin.OwnerOf("IJC|old") == "FOREIGN");
		string mn = IjcOrigin.NewManualName(), mn2 = IjcOrigin.NewManualName();
		Check("ownership: nome manual prefixado, <= 50, unico", mn.StartsWith("IJC-MANUAL|", StringComparison.Ordinal) && mn.Length <= IjcOrigin.MaxOrderNameLen && mn != mn2 && !IjcGuard.IsRobotOrderName(mn));
		Check("account kind: Simulator => SIM", IjcGuard.AccountKind("Simulator") == "SIM" && IjcGuard.AccountKind("Playback") == "SIM");
		Check("account kind: provider real => LIVE (so exibicao)", IjcGuard.AccountKind("Rithmic") == "LIVE" && IjcGuard.AccountKind("Provider1") == "LIVE");
		Check("account kind: desconhecido", IjcGuard.AccountKind(null) == "UNKNOWN" && IjcGuard.AccountKind("") == "UNKNOWN");
		Check("session: nasce sem conta (nunca autoescolhida)", IjcSession.SelectedAccount == null);
		IjcSession.SelectedAccount = "Conta-X"; Check("session: conta do operador", IjcSession.SelectedAccount == "Conta-X");
		IjcSession.SelectedAccount = ""; Check("session: vazio => null", IjcSession.SelectedAccount == null);

		// ── boleta manual: validacao tecnica ──
		Func<IjcTicketInput> ok = () => new IjcTicketInput { Side = "BUY", Account = "A1", AccountFound = true, Connection = "Connected", Instrument = "ES 12-26", InstrumentFound = true, TickSize = 0.25, Quantity = 1, OrderType = "MARKET" };
		Check("ticket: MARKET valido", IjcTicketValidator.Validate(ok()).Count == 0);
		var sell = ok(); sell.Side = "SELL"; Check("ticket: SELL valido", IjcTicketValidator.Validate(sell).Count == 0);
		var lim = ok(); lim.OrderType = "LIMIT"; lim.LimitPrice = 7635.25; Check("ticket: LIMIT valido no tick", IjcTicketValidator.Validate(lim).Count == 0);
		var mk = ok(); mk.LimitPrice = 1.13; Check("ticket: MARKET ignora preco", IjcTicketValidator.Validate(mk).Count == 0);
		Action<string, Action<IjcTicketInput>, string> bad = (name, mut, code) => { var x = ok(); mut(x); Check("ticket: " + name + " => " + code, IjcTicketValidator.Validate(x).Contains(code)); };
		bad("sem conta", x => x.Account = null, "NO_ACCOUNT");
		bad("conta inexistente", x => x.AccountFound = false, "ACCOUNT_NOT_FOUND");
		bad("conta desconectada", x => x.Connection = "ConnectionLost", "ACCOUNT_DISCONNECTED");
		bad("sem instrumento", x => x.Instrument = " ", "NO_INSTRUMENT");
		bad("instrumento invalido", x => x.InstrumentFound = false, "INSTRUMENT_INVALID");
		bad("qty 0", x => x.Quantity = 0, "QUANTITY_INVALID");
		bad("qty negativa", x => x.Quantity = -2, "QUANTITY_INVALID");
		bad("tipo invalido", x => x.OrderType = "STOP", "ORDER_TYPE_INVALID");
		bad("tipo nulo", x => x.OrderType = null, "ORDER_TYPE_INVALID");
		bad("LIMIT sem preco", x => { x.OrderType = "LIMIT"; x.LimitPrice = null; }, "LIMIT_PRICE_REQUIRED");
		bad("LIMIT preco <= 0", x => { x.OrderType = "LIMIT"; x.LimitPrice = 0; }, "LIMIT_PRICE_REQUIRED");
		bad("LIMIT NaN", x => { x.OrderType = "LIMIT"; x.LimitPrice = double.NaN; }, "LIMIT_PRICE_REQUIRED");
		bad("LIMIT fora do tick", x => { x.OrderType = "LIMIT"; x.LimitPrice = 7635.30; }, "LIMIT_PRICE_OFF_TICK");
		bad("lado invalido", x => x.Side = "buy", "SIDE_INVALID");
		Check("ticket: preco pt-BR com virgula", IjcTicketValidator.ParsePrice("7635,25") == 7635.25 && IjcTicketValidator.ParsePrice("7635.25") == 7635.25);
		Check("ticket: preco vazio/lixo => null", IjcTicketValidator.ParsePrice("") == null && IjcTicketValidator.ParsePrice("abc") == null);
		var dft = new IjcTicketDraft(); Check("ticket: rascunho sem conta/instrumento por padrao", dft.Account == null && dft.Instrument == null && dft.OrderType == "MARKET" && dft.Quantity == 1);

		// ── anti-double-submit ──
		var gate = new IjcSubmitGate(); DateTime t0 = new DateTime(2026, 9, 24, 14, 0, 0, DateTimeKind.Utc); string why;
		Check("gate: primeiro clique passa", gate.TryBegin(t0, out why) && gate.InFlight(t0));
		Check("gate: duplo clique (100 ms) bloqueado", !gate.TryBegin(t0.AddMilliseconds(100), out why));
		Check("gate: 2o clique com ordem em voo bloqueado", !gate.TryBegin(t0.AddMilliseconds(1500), out why) && why.Contains("sem confirmacao"));
		gate.OnOrderState("Initialized"); Check("gate: Initialized nao libera", gate.InFlight(t0.AddMilliseconds(2000)));
		gate.OnOrderState("Submitted"); Check("gate: evento real do NT8 libera", !gate.InFlight(t0.AddMilliseconds(2100)));
		Check("gate: novo clique explicito apos confirmacao", gate.TryBegin(t0.AddMilliseconds(3000), out why));
		Check("gate: timeout nao reenvia, so deixa de bloquear", !gate.InFlight(t0.AddMilliseconds(3000 + IjcSubmitGate.InFlightTimeoutMs + 1)));
		Check("gate: terminais", IjcSubmitGate.IsTerminalState("Filled") && IjcSubmitGate.IsTerminalState("Rejected") && IjcSubmitGate.IsTerminalState("Cancelled") && !IjcSubmitGate.IsTerminalState("Working"));

		// ── PNL / posicao ──
		Check("pnl: sem conta", IjcPnlView.Compose(false, false, 1, 2, "UsDollar").Status == "NO_ACCOUNT");
		var off = IjcPnlView.Compose(true, false, 10, 5, "UsDollar"); Check("pnl: conta offline nao mostra valor", off.Status == "OFFLINE" && !off.Pnl.HasValue && !off.Realized.HasValue);
		var av = IjcPnlView.Compose(true, true, 125.5, -25.25, "UsDollar");
		Check("pnl: PNL = realizado + aberto", av.Status == "AVAILABLE" && av.Pnl == 100.25 && av.Realized == 125.5 && av.Open == -25.25);
		Check("pnl: abas escolhem a metrica", av.Metric("PNL") == 100.25 && av.Metric("REALIZED") == 125.5 && av.Metric("OPEN") == -25.25);
		var part = IjcPnlView.Compose(true, true, 50, null, "UsDollar"); Check("pnl: parcial => PNL NOT_REPORTED", part.Status == "PARTIAL" && !part.Pnl.HasValue && part.Realized == 50);
		var none = IjcPnlView.Compose(true, true, null, null, "UsDollar"); Check("pnl: nada reportado", none.Status == "NOT_REPORTED" && !none.Pnl.HasValue);
		Check("pnl: sem moeda => NOT_REPORTED", IjcPnlView.Compose(true, true, 1, 1, null).Status == "NOT_REPORTED");
		Check("pnl: formato", IjcPnlView.Money(1234.5) == "+1,234.50" && IjcPnlView.Money(-80) == "−80.00" && IjcPnlView.Money(0) == "0.00" && IjcPnlView.Money(null) == "NOT_REPORTED");
		var fl = IjcPositionView.From(true, "Flat", 0, 0, null); Check("pos: FLAT valido", fl.State == "FLAT" && fl.Size == 0 && !fl.AvgPrice.HasValue);
		var lg = IjcPositionView.From(true, "Long", 2, 7635.25, 37.5); Check("pos: LONG", lg.State == "LONG" && lg.Size == 2 && lg.AvgPrice == 7635.25 && lg.OpenPnl == 37.5);
		var sh = IjcPositionView.From(true, "Short", 1, 7640, null); Check("pos: SHORT sem open pnl => null", sh.State == "SHORT" && sh.Size == 1 && !sh.OpenPnl.HasValue);
		Check("pos: leitura invalida => UNKNOWN (nunca FLAT)", IjcPositionView.From(false, "Flat", 0, 0, null).State == "UNKNOWN" && IjcPositionView.Unknown("DISCONNECTED").Size == null);

		// ── log de auditoria com origem ──
		var rec = IjcDiag.Record(DateTime.UtcNow, "manual_order_pending", "info", "BUY 1", null, null, "MANUAL_OPERATOR", "IJC-MANUAL|abc");
		Check("log: origin + order_name", (string)rec["origin"] == "MANUAL_OPERATOR" && (string)rec["order_name"] == "IJC-MANUAL|abc" && (string)rec["component"] == "nt8-addon");
		Check("robot stub (binding isolado): SubmitIntent HARD_DISABLED", IjcExecutionStub.SubmitIntent("i", "s") == "HARD_DISABLED");
		Check("stub: CancelOwnedEntries HARD_DISABLED", IjcExecutionStub.CancelOwnedEntries("a") == "HARD_DISABLED");
		Check("stub: EmergencyExitOwned HARD_DISABLED", IjcExecutionStub.EmergencyExitOwned("a") == "HARD_DISABLED");

		var j = IjcJson.Parse("{\"a\":7635.25,\"s\":\"7635.25\",\"d\":\"2026-09-24T15:00:00.000Z\",\"n\":null}");
		Check("json: numero pelo valor em pt-BR", IjcJson.Num(j["a"]) == 7635.25);
		Check("json: string invariante em pt-BR", IjcJson.Num(j["s"]) == 7635.25);
		Check("json: data ISO continua string", IjcJson.S(j, "d") == "2026-09-24T15:00:00.000Z");
		Check("json: formato invariante", IjcJson.Fmt(7635.25, "0.00") == "7635.25");
		Check("json: nulo => travessao", IjcJson.S(j, "n") == "—");

		int st;
		Check("http: recusa host nao-loopback", IjcHttp.Request("GET", "http://example.com/", null, null, 500, out st) == null && st == 0);
		Check("http: recusa https externo", IjcHttp.Request("GET", "https://127.0.0.1:3590/", null, null, 500, out st) == null && st == 0);

		var t = new IjcOrderTrack();
		Check("order: avanca Submitted", t.Apply(IjcOrderPhase.Submitted));
		Check("order: avanca Working", t.Apply(IjcOrderPhase.Working));
		Check("order: R1 nao regride", !t.Apply(IjcOrderPhase.Accepted) && t.Phase == IjcOrderPhase.Working);
		Check("order: fill acumula", t.ApplyFill("e1", 1) && t.ApplyFill("e2", 2) && t.FilledQty == 3);
		Check("order: R3 dedup por ExecutionId", !t.ApplyFill("e1", 1) && t.FilledQty == 3);
		Check("order: vai a Filled", t.Apply(IjcOrderPhase.Filled));
		Check("order: R2 terminal imutavel", !t.Apply(IjcOrderPhase.Cancelled) && t.Phase == IjcOrderPhase.Filled);

		string f = Path.Combine(Path.GetTempPath(), "ijc-dedup-" + Guid.NewGuid().ToString("N") + ".json");
		var d1 = new IjcDedup(f);
		Check("dedup: primeira marca", d1.MarkConsumed("ijc-1", "snap-A", "2026-09-24"));
		Check("dedup: duplicado recusado", !d1.MarkConsumed("ijc-1", "snap-A", "2026-09-24"));
		var d2 = new IjcDedup(f); // "restart"/F5
		Check("dedup: persiste apos restart", d2.IsConsumed("ijc-1", "snap-A") && !d2.MarkConsumed("ijc-1", "snap-A", "2026-09-25"));
		Check("dedup: outro snapshot e outra intencao", d2.MarkConsumed("ijc-1", "snap-B", "2026-09-24"));
		try { File.Delete(f); } catch { }

		var orders = new List<IjcOrderDto> { new IjcOrderDto { Name = "IJC-ROBOT|orfa", State = "Working" }, new IjcOrderDto { Name = "IJC-MANUAL|m1", State = "Working" }, new IjcOrderDto { Name = "AoBoleta-LONG", State = "Working" } };
		var r0 = IjcOwnership.Reconstruct(false, orders, new HashSet<string>());
		Check("recon: NT8 nao pronto => PENDING_NT8", r0.Status == "PENDING_NT8" && r0.PositionState == "NOT_REPORTED");
		var r1 = IjcOwnership.Reconstruct(true, orders, new HashSet<string>());
		Check("recon: so ordens IJC-ROBOT| sao do robo (manual nunca)", r1.OwnedOrders.Count == 1);
		Check("recon: orfa explicita", r1.Orphans == 1 && r1.PositionState == "UNKNOWN_RECONCILING" && r1.Status == "COMPLETE");
		var r2 = IjcOwnership.Reconstruct(true, orders, new HashSet<string> { "IJC-ROBOT|orfa" });
		Check("recon: com ledger nao ha orfa => FLAT", r2.Orphans == 0 && r2.PositionState == "FLAT");

		Console.WriteLine("IjcPureTests: " + pass + " PASS, " + fail + " FAIL");
		return fail == 0 ? 0 : 1;
	}
}
