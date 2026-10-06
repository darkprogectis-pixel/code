// PROTECTION_MANDATORY test_real_flow (2026-10-02) — stubs SO do que fala com NT8/broker, com ESTADO (livro de ordens + posicao).
// OCO de grupo terminal rejeita reuso · rejeicao sincrona/assincrona programavel · cancel com confirmacao atrasada · fills de stop/take/
// fechamento · posicao derivada dos fills · monitor de invariantes em TODA mutacao (I1 stops ativos por perna <= 1; I2 nunca lado oposto).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace NinjaTrader.NinjaScript.Indicators
{
	public static class AlfaOmegaSharedState { public static double LastPrice_ES, LastPrice_NQ; }
	public static class AoMarcadores
	{
		public static void AtualizarProtecao(string intentId, double? stop, double? take, string instrumento, int qty) { }
		public static void EncerrarOperacao(string intentId) { }
	}
}

namespace NinjaTrader.NinjaScript.AddOns
{
	public class AoRoboAccount { public string Id, Nt8Account; }
	public class AoPosition { public string Instrument; public string Side; public int Quantity; public string StrategyTag; }
	public class AoPositionState { public bool Ok; public string Source; public List<AoPosition> Positions; public double AgeMs; public double MaxAgeMs; public string Error; }
	public static class AoRoboGates
	{
		public static AoPosition FindPosition(List<AoPosition> positions, string instrument)
		{
			if (positions == null || string.IsNullOrEmpty(instrument)) return null;
			return positions.FirstOrDefault(p => p != null && p.Instrument == instrument);
		}
	}
	public static class AoRoboConfig
	{
		public static string Tier = "TEST";
		public static string StateDir = null;
		public static double? TakePtDe(string codigo) { return (codigo ?? "").ToUpperInvariant().Contains("NQ") ? 150.0 : 60.0; }
		public static double MultFamiliaDe(string codigo) { return (codigo ?? "").ToUpperInvariant().Contains("NQ") ? 20 : 50; }
	}
	public static class AoRoboAudit
	{
		public class Ev { public string Evento, IntentId, Result; public JToken Payload; }
		public static readonly List<Ev> Eventos = new List<Ev>();
		public static void Log(string evento, DateTime whenUtc, string signalId = null, string symbol = null, JToken payload = null,
							   JToken gateResults = null, string account = null, string tier = null, string instrument = null, string action = null, int? qty = null,
							   double? stopPt = null, double? targetPt = null, string orderIdNt8 = null, string result = null)
		{
			lock (Eventos) Eventos.Add(new Ev { Evento = evento, IntentId = signalId, Result = result, Payload = payload == null ? null : payload.DeepClone() });
		}
	}
	public static class AoRoboPositions
	{
		public static int TtlMs = 5000;
		public static bool Falha;                                  // posicao ilegivel
		public static double AgeMs = 0;                            // idade reportada
		public static Dictionary<string, int> Congelada;           // "acc|instr" -> qty assinada (cache velho que ignora o livro)
		public static Dictionary<string, int> Sobrescrita;         // leitura forcada (ex.: FLAT transitoria) — consumida por Get
		public static int Refreshes;
		public static int RefreshAll(IEnumerable<string> accountNames, DateTime nowUtc, bool force = false) { Refreshes++; return 0; }
		public static AoPositionState Get(string accountName, DateTime nowUtc)
		{
			if (Falha) return new AoPositionState { Ok = false, Error = "simulado: ilegivel", AgeMs = -1 };
			var lista = new List<AoPosition>();
			Dictionary<string, int> fonte = Sobrescrita ?? Congelada ?? Corretora.Posicoes;
			foreach (var kv in fonte)
			{
				string[] p = kv.Key.Split('|');
				if (!string.Equals(p[0], accountName, StringComparison.OrdinalIgnoreCase) || kv.Value == 0) continue;
				lista.Add(new AoPosition { Instrument = p[1], Side = kv.Value > 0 ? "LONG" : "SHORT", Quantity = Math.Abs(kv.Value) });
			}
			return new AoPositionState { Ok = true, Source = "sim", Positions = lista, AgeMs = AgeMs, MaxAgeMs = 15000 };
		}
	}

	public class Ordem
	{
		public string Id, Conta, Instrumento, Acao, Tipo, Estado, Oco, Nome; public int Qty, Filled; public double Stop, Limit;
		public int LeiturasAteRejeitar = -1, LeiturasAteCancelar = -1;
		public JObject Json()
		{
			return new JObject { { "orderId", Id }, { "name", Nome }, { "instrument", Instrumento }, { "action", Acao }, { "orderType", Tipo }, { "quantity", Qty },
								 { "filled", Filled }, { "stopPrice", Stop }, { "limitPrice", Limit }, { "state", Estado }, { "oco", Oco } };
		}
	}

	/// <summary>Livro de ordens simulado (o "broker"). Thread-safe por lock unico.</summary>
	public static class Corretora
	{
		public static readonly object G = new object();
		public static readonly List<Ordem> Ordens = new List<Ordem>();
		public static readonly Dictionary<string, int> Posicoes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
		public static readonly Dictionary<string, int> LadoPerna = new Dictionary<string, int>(StringComparer.Ordinal);   // intentId -> +1/-1 (I2)
		public static readonly Dictionary<string, string> InstrPerna = new Dictionary<string, string>(StringComparer.Ordinal); // intentId -> acc|instr
		public static int Seq;
		// programacao
		public static int BracketFalhaSync, BracketLanca, StopRejeitaAssincN, CancelHttpFalha, PlaceRejeita;
		public static int PlaceRejeitaAssincN, PlaceFicaWorkingN;  // (G9/G10) market aceito e depois Rejected sem fill · market fica Working sem fill
		public static bool OrdersFalha, CancelNuncaConfirma, ChangeFalha;
		public static Action<string> AoCancelar;                   // gancho (C13): chamado com o account dentro do CancelCore, fora do lock do livro
		// contadores / monitor
		public static int Brackets, BracketsRejeitados, Places, Cancels, Changes, OcoReuso, ViolI1, ViolI2, MaxStopsAtivos;
		public static readonly List<string> Violacoes = new List<string>();
		public static readonly Dictionary<string, DateTime> SemStopDesde = new Dictionary<string, DateTime>(StringComparer.Ordinal);
		public static readonly Dictionary<string, double> JanelaSemStopMs = new Dictionary<string, double>(StringComparer.Ordinal);
		public static bool MonitorI2 = true;

		public static void Reset()
		{
			lock (G)
			{
				Ordens.Clear(); Posicoes.Clear(); LadoPerna.Clear(); InstrPerna.Clear(); Seq = 0;
				BracketFalhaSync = BracketLanca = StopRejeitaAssincN = CancelHttpFalha = PlaceRejeita = PlaceRejeitaAssincN = PlaceFicaWorkingN = 0; OrdersFalha = CancelNuncaConfirma = ChangeFalha = false; AoCancelar = null;
				Brackets = BracketsRejeitados = Places = Cancels = Changes = OcoReuso = ViolI1 = ViolI2 = MaxStopsAtivos = 0; Violacoes.Clear();
				SemStopDesde.Clear(); JanelaSemStopMs.Clear(); MonitorI2 = true;
			}
		}
		public static bool Ativa(string s) { return s == "Accepted" || s == "Working" || s == "Submitted" || s == "PartFilled" || s == "TriggerPending" || s == "PendingSubmit" || s == "PendingChange" || s == "PendingCancel"; }
		static bool Terminal(string s) { return s == "Filled" || s == "Cancelled" || s == "Rejected"; }
		public static string PernaDoOco(string oco)
		{
			if (string.IsNullOrEmpty(oco)) return null;
			int i = oco.IndexOf("|P", StringComparison.Ordinal); return i > 0 ? oco.Substring(0, i) : oco;
		}
		public static int StopsAtivos(string intentId) { lock (G) return Ordens.Count(o => o.Tipo == "stopmarket" && Ativa(o.Estado) && PernaDoOco(o.Oco) == intentId); }
		public static int Pos(string acc, string instr) { lock (G) { int v; Posicoes.TryGetValue(acc + "|" + instr, out v); return v; } }
		public static void Entrada(string acc, string instr, int qtyAssinada) { lock (G) { Mover(acc, instr, qtyAssinada); Monitor(); } }
		static void Mover(string acc, string instr, int d) { string k = acc + "|" + instr; int v; Posicoes.TryGetValue(k, out v); Posicoes[k] = v + d; }
		static int Sinal(string acao) { return acao == "buy" || acao == "BuyToCover" || acao == "Buy" ? 1 : -1; }

		/// <summary>I1 / I2 / janela sem stop — chamado sob G apos TODA mutacao.</summary>
		static void Monitor()
		{
			foreach (var kv in LadoPerna)
			{
				string id = kv.Key;
				int n = Ordens.Count(o => o.Tipo == "stopmarket" && Ativa(o.Estado) && PernaDoOco(o.Oco) == id);
				if (n > MaxStopsAtivos) MaxStopsAtivos = n;
				if (n > 1) { ViolI1++; Violacoes.Add("I1 " + id + " stops ativos=" + n); }
				string k; InstrPerna.TryGetValue(id, out k); int pos = 0; if (k != null) Posicoes.TryGetValue(k, out pos);
				if (MonitorI2 && pos * kv.Value < 0) { ViolI2++; Violacoes.Add("I2 " + id + " posicao " + pos + " oposta ao lado " + kv.Value); }
				bool aberta = pos * kv.Value > 0;
				if (aberta && n == 0) { if (!SemStopDesde.ContainsKey(id)) SemStopDesde[id] = DateTime.UtcNow; }
				else if (SemStopDesde.ContainsKey(id))
				{
					double ms = (DateTime.UtcNow - SemStopDesde[id]).TotalMilliseconds; SemStopDesde.Remove(id);
					double ant; JanelaSemStopMs.TryGetValue(id, out ant); if (ms > ant) JanelaSemStopMs[id] = ms;
				}
			}
		}
		static void Executar(Ordem o, int q, double preco)
		{
			o.Filled += q; o.Estado = o.Filled >= o.Qty ? "Filled" : "PartFilled";
			Mover(o.Conta, o.Instrumento, Sinal(o.Acao) * q);
			if (o.Estado == "Filled" && !string.IsNullOrEmpty(o.Oco))   // OCO: o irmao e cancelado
				foreach (Ordem x in Ordens.Where(x => x != o && x.Oco == o.Oco && Ativa(x.Estado))) x.Estado = "Cancelled";
		}
		// ── acoes "por fora" (teste) ──
		public static void PorFora(string orderId, Action<Ordem> f) { lock (G) { Ordem o = Ordens.First(x => x.Id == orderId); f(o); Monitor(); } }
		public static void Preencher(string orderId, int q) { lock (G) { Ordem o = Ordens.First(x => x.Id == orderId); Executar(o, q, o.Tipo == "limit" ? o.Limit : o.Stop); Monitor(); } }
		public static Ordem Injetar(string acc, string instr, string tipo, string acao, int qty, double stop, double limit, string oco, string estado, string nome)
		{
			lock (G)
			{
				var o = new Ordem { Id = "ord-" + (++Seq), Conta = acc, Instrumento = instr, Tipo = tipo, Acao = acao, Qty = qty, Stop = stop, Limit = limit, Oco = oco, Estado = estado, Nome = nome };
				Ordens.Add(o); Monitor(); return o;
			}
		}

		// ── AlfaOmegaTrader.*Core ──
		static AlfaOmegaTrader.AoResult R(int code, JObject j) { return new AlfaOmegaTrader.AoResult { HttpCode = code, Json = j.ToString(Newtonsoft.Json.Formatting.None) }; }
		static AlfaOmegaTrader.AoResult Erro(int code, string m) { return R(code, new JObject { { "ok", false }, { "error", m } }); }
		public static AlfaOmegaTrader.AoResult Orders(string acc)
		{
			lock (G)
			{
				if (OrdersFalha) return Erro(500, "simulado: orders ilegivel");
				foreach (Ordem o in Ordens.Where(o => string.Equals(o.Conta, acc, StringComparison.OrdinalIgnoreCase)))
				{
					if (o.LeiturasAteRejeitar >= 0 && Ativa(o.Estado) && o.LeiturasAteRejeitar-- == 0) o.Estado = "Rejected";
					if (o.LeiturasAteCancelar >= 0 && o.Estado == "PendingCancel" && o.LeiturasAteCancelar-- == 0) o.Estado = "Cancelled";
				}
				Monitor();
				var arr = new JArray(); foreach (Ordem o in Ordens.Where(o => string.Equals(o.Conta, acc, StringComparison.OrdinalIgnoreCase))) arr.Add(o.Json());
				return R(200, new JObject { { "ok", true }, { "orders", arr } });
			}
		}
		public static AlfaOmegaTrader.AoResult Bracket(JObject j)
		{
			lock (G)
			{
				if (BracketLanca > 0) { BracketLanca--; throw new InvalidOperationException("simulado: BracketCore lancou"); }
				Brackets++;
				if (BracketFalhaSync > 0) { BracketFalhaSync--; BracketsRejeitados++; return Erro(500, "simulado: CREATE_FAILED"); }
				string acc = (string)j["account"], instr = (string)j["instrument"], oco = (string)j["ocoId"], pref = (string)j["orderNamePrefix"];
				string exit = (string)j["positionAction"] == "buy" ? "sell" : "buy";
				int qty = (int)j["quantity"];
				bool reuso = !string.IsNullOrEmpty(oco) && Ordens.Any(o => o.Oco == oco && Terminal(o.Estado));
				if (reuso) OcoReuso++;
				var arr = new JArray();
				if (j["stopLoss"] != null)
				{
					var s = new Ordem { Id = "ord-" + (++Seq), Conta = acc, Instrumento = instr, Tipo = "stopmarket", Acao = exit, Qty = qty, Stop = (double)j["stopLoss"], Oco = oco, Nome = pref + "|S", Estado = reuso ? "Rejected" : "Accepted" };
					if (!reuso && StopRejeitaAssincN > 0) { StopRejeitaAssincN--; s.LeiturasAteRejeitar = 0; }
					Ordens.Add(s); arr.Add(new JObject { { "kind", "stop" }, { "orderId", s.Id }, { "price", s.Stop }, { "state", "Submitted" } });
				}
				if (j["takeProfit"] != null)
				{
					var t = new Ordem { Id = "ord-" + (++Seq), Conta = acc, Instrumento = instr, Tipo = "limit", Acao = exit, Qty = qty, Limit = (double)j["takeProfit"], Oco = oco, Nome = pref + "|T", Estado = reuso ? "Rejected" : "Working" };
					Ordens.Add(t); arr.Add(new JObject { { "kind", "target" }, { "orderId", t.Id }, { "price", t.Limit }, { "state", "Submitted" } });
				}
				Monitor();
				return R(200, new JObject { { "ok", true }, { "account", acc }, { "ocoId", oco }, { "cancelled", 0 }, { "orders", arr } });
			}
		}
		public static AlfaOmegaTrader.AoResult Place(JObject j)
		{
			lock (G)
			{
				Places++;
				if (PlaceRejeita > 0) { PlaceRejeita--; return Erro(409, "simulado: place rejeitado"); }
				var o = new Ordem { Id = "ord-" + (++Seq), Conta = (string)j["account"], Instrumento = (string)j["instrument"], Tipo = "market", Acao = (string)j["action"], Qty = (int)j["quantity"], Nome = (string)j["orderName"], Estado = "Working" };
				Ordens.Add(o);
				if (PlaceRejeitaAssincN > 0) { PlaceRejeitaAssincN--; o.LeiturasAteRejeitar = 0; }   // proxima leitura do livro: Rejected, sem fill
				else if (PlaceFicaWorkingN > 0) PlaceFicaWorkingN--;                               // fica Working (teste decide o desfecho)
				else Executar(o, o.Qty, 0);   // mercado: preenche na hora
				Monitor();
				return R(200, new JObject { { "ok", true }, { "orderId", o.Id }, { "state", "Submitted" } });
			}
		}
		public static AlfaOmegaTrader.AoResult Cancel(JObject j)
		{
			Action<string> g = AoCancelar; if (g != null) { AoCancelar = null; g((string)j["account"]); }
			lock (G)
			{
				Cancels++;
				if (CancelHttpFalha > 0) { CancelHttpFalha--; return Erro(500, "simulado: cancel falhou"); }
				string acc = (string)j["account"], scope = (string)j["scope"];
				IEnumerable<Ordem> alvo;
				if (scope == "ids") { var ids = ((JArray)j["orderIds"]).Select(x => (string)x).ToList(); alvo = Ordens.Where(o => ids.Contains(o.Id)); }
				else if (scope == "ocoId") { string oco = (string)j["ocoId"]; alvo = Ordens.Where(o => o.Oco == oco && string.Equals(o.Conta, acc, StringComparison.OrdinalIgnoreCase)); }
				else return Erro(400, "scope");
				int n = 0;
				foreach (Ordem o in alvo.Where(o => Ativa(o.Estado) && o.Estado != "PartFilled").ToList()) { o.Estado = CancelNuncaConfirma ? "PendingCancel" : "Cancelled"; n++; }
				Monitor();
				return R(200, new JObject { { "ok", true }, { "cancelled", n } });
			}
		}
		public static AlfaOmegaTrader.AoResult Change(JObject j)
		{
			lock (G)
			{
				Changes++;
				if (ChangeFalha) return Erro(500, "simulado: change falhou");
				Ordem o = Ordens.FirstOrDefault(x => x.Id == (string)j["orderId"]);
				if (o == null || !Ativa(o.Estado)) return Erro(404, "ordem nao ativa");
				if (j["quantity"] != null) o.Qty = (int)j["quantity"] + (o.Estado == "PartFilled" ? 0 : 0);
				if (j["stopPrice"] != null) o.Stop = (double)j["stopPrice"];
				if (j["limitPrice"] != null) o.Limit = (double)j["limitPrice"];
				Monitor();
				return R(200, new JObject { { "ok", true }, { "orderId", o.Id } });
			}
		}
	}

	public static class AlfaOmegaTrader
	{
		public class AoResult { public int HttpCode; public string Json; public bool Ok { get { return HttpCode == 200; } } }
		public static AoResult PlaceCore(JObject j) { return Corretora.Place(j); }
		public static AoResult BracketCore(JObject j) { return Corretora.Bracket(j); }
		public static AoResult CancelCore(JObject j) { return Corretora.Cancel(j); }
		public static AoResult ChangeCore(JObject j) { return Corretora.Change(j); }
		public static AoResult OrdersCore(string account, bool activeOnly) { return Corretora.Orders(account); }
	}
}

// (2026-10-06) ORDER_NAME: AlfaOmegaRoboSaida.PrefixoProprio usa AoRoboGuard.ContaToken -> o AoRoboGuard.cs REAL entra no conjunto; ele so precisa de Account/Provider.
namespace NinjaTrader.Cbi
{
	public enum Provider { Simulator, Playback, Rithmic, Tradovate }
	public class Account { public string Name; public Provider Provider = Provider.Simulator; }
}
