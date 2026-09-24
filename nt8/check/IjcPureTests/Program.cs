// Harness offline das pecas puras do INVICTUS JEV CODE (sem NT8, sem rede externa, sem ordem). Exit 0 = PASS.
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
		Check("prefix: IJC| e do robo", IjcGuard.IsRobotOrderName("IJC|abc"));
		foreach (string other in new[] { "AO|x", "AoBoleta-LONG", "ijc|x", "IJC-x", "IJCx", "", null, " IJC|x" })
			Check("prefix: '" + other + "' nao e do robo", !IjcGuard.IsRobotOrderName(other));
		Check("stub: SubmitIntent HARD_DISABLED", IjcExecutionStub.SubmitIntent("i", "s") == "HARD_DISABLED");
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

		var orders = new List<IjcOrderDto> { new IjcOrderDto { Name = "IJC|orfa", State = "Working" }, new IjcOrderDto { Name = "AoBoleta-LONG", State = "Working" } };
		var r0 = IjcOwnership.Reconstruct(false, orders, new HashSet<string>());
		Check("recon: NT8 nao pronto => PENDING_NT8", r0.Status == "PENDING_NT8" && r0.PositionState == "NOT_REPORTED");
		var r1 = IjcOwnership.Reconstruct(true, orders, new HashSet<string>());
		Check("recon: so ordens IJC| sao proprias", r1.OwnedOrders.Count == 1);
		Check("recon: orfa explicita", r1.Orphans == 1 && r1.PositionState == "UNKNOWN_RECONCILING" && r1.Status == "COMPLETE");
		var r2 = IjcOwnership.Reconstruct(true, orders, new HashSet<string> { "IJC|orfa" });
		Check("recon: com ledger nao ha orfa => FLAT", r2.Orphans == 0 && r2.PositionState == "FLAT");

		Console.WriteLine("IjcPureTests: " + pass + " PASS, " + fail + " FAIL");
		return fail == 0 ? 0 : 1;
	}
}
