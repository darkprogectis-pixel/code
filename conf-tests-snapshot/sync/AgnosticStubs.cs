// ACCOUNT-AGNOSTIC (2026-10-05) — stubs MINIMOS para compilar o AlfaOmegaRoboConfig.cs REAL (live, fora do lote) e o
// AlfaOmegaRoboAtivos.cs REAL do STAGING. Simulado: so o inventario de contas do NT8 (Cbi.Account.All + Provider) e o audit.
// Nenhum nome de conta aparece aqui: os nomes sao fixtures do ProgramAgnostic.cs.
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace NinjaTrader.Cbi
{
	public enum Provider { Simulator, Playback, Unknown, Rithmic, Tradovate, Cqg, Ibkr }
	public class Account
	{
		public string Name;
		public Provider Provider;
		public static readonly List<Account> All = new List<Account>();
	}
}

namespace NinjaTrader.NinjaScript.AddOns
{
	public static class AoRoboAudit
	{
		public class Ev { public string Evento, Account; public JToken Payload; }
		public static string LogDir;
		public static readonly List<Ev> Eventos = new List<Ev>();
		public static void Log(string evento, DateTime whenUtc, string signalId = null, string symbol = null, JToken payload = null,
							   JToken gateResults = null, string account = null, string tier = null, string instrument = null, string action = null, int? qty = null,
							   double? stopPt = null, double? targetPt = null, string orderIdNt8 = null, string result = null)
		{
			lock (Eventos) Eventos.Add(new Ev { Evento = evento, Account = account, Payload = payload == null ? null : payload.DeepClone() });
		}
	}
	public static class AoRoboOperacional { public static string QuemPadrao() { return "teste"; } }
	public static class AoRoboEntry { public static string JsStr(JToken t) { return t == null ? "null" : t.ToString(); } }
	public class AoMotorParams { public double MultEs = 50, MultNq = 20, HardStopUsd = 0; }   // so take_pt/multiplicador (fora do escopo de conta)
}
