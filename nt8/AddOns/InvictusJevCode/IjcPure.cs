// INVICTUS JEV CODE by ALFA OMEGA — pecas PURAS do AddOn (sem tipos do NinjaTrader): testaveis fora do NT8 (nt8/check/IjcPureTests).
// CODIGO-FONTE NO REPOSITORIO ate a instalacao controlada (F5 unico pelo operador).
//
// Dois caminhos de ordem INDEPENDENTES:
//  - MANUAL (IjcManualOrders.cs): clique explicito do operador -> conta SELECIONADA. Validacao/anti-double-submit aqui (puros).
//  - ROBOT (IjcExecutor.cs): IjcSafety.JEV_CAN_SEND_ORDER / ORDER_PATH valem SO para o robo. Remover essa trava do robo
//    foi RECUSADO pelo ambiente de implementacao em 24/09 (ROBOT_ORDER_BINDING = PENDING_ENVIRONMENT_REFUSAL, isolado);
//    nao e regra de produto. Com decisao NONE (0 regras de lado ativas) o robo nao teria acao de qualquer forma.
//
// Padroes reutilizados do Invictus anterior (REUSE_PATTERN / REUSE_CODE_CANDIDATE, ver handoff de arquitetura):
//  - gate de conta do ROBOT: so Simulator/Playback (estado herdado, ver acima); a boleta MANUAL usa a conta selecionada;
//  - prefixos de propriedade com pipe e comparacao Ordinal ("IJC-ROBOT|" / "IJC-MANUAL|"; licao AO x AoBoleta);
//  - HTTP por chamada (HttpWebRequest, Proxy=null, KeepAlive=false) — nunca HttpClient estatico (incidente de socket no NT8);
//  - parse numerico invariante de cultura (licao AoJsonNum, maquina pt-BR);
//  - log de diagnostico em ARQUIVO (licao AoDiag: Print nao persiste);
//  - maquina de ordem monotonica R1/R2/R3 e dedup persistido (AoRoboOrderState / AoRoboDedup).
// ROBOT: IjcExecutionStub devolve HARD_DISABLED e nao referencia API de ordem (binding do robo isolado, ver acima).
#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
#endregion

namespace NinjaTrader.NinjaScript.AddOns.InvictusJevCode
{
	public static class IjcSafety
	{
		// ROBOT somente (binding de execucao do robo isolado; ver cabecalho). NAO se aplica a boleta manual.
		public const bool JEV_CAN_SEND_ORDER = false;
		public const string ORDER_PATH = "HARD_DISABLED";
		public const string OrderPrefix = IjcOrigin.RobotPrefix;  // prefixo de propriedade do ROBOT
		public const string ProductName = "INVICTUS JEV CODE";
		public const string Brand = "by ALFA OMEGA";
	}

	/// <summary>Origem das ordens e nomes. Manual e Robot nunca compartilham prefixo.</summary>
	public static class IjcOrigin
	{
		public const string Manual = "MANUAL_OPERATOR";
		public const string Robot = "JEV_ROBOT";
		public const string Foreign = "FOREIGN";
		public const string ManualPrefix = "IJC-MANUAL|";
		public const string RobotPrefix = "IJC-ROBOT|";
		public const int MaxOrderNameLen = 50;                    // limite rigido do nome de ordem no NT8 (licao AlfaOmegaTrader)

		public static string OwnerOf(string orderName)
		{
			if (orderName == null) return Foreign;
			if (orderName.StartsWith(RobotPrefix, StringComparison.Ordinal)) return Robot;
			if (orderName.StartsWith(ManualPrefix, StringComparison.Ordinal)) return Manual;
			return Foreign;
		}

		/// <summary>Nome unico da ordem manual: "IJC-MANUAL|" + 16 hex (27 chars &lt;= 50).</summary>
		public static string NewManualName() { return ManualPrefix + Guid.NewGuid().ToString("N").Substring(0, 16); }
	}

	public static class IjcGuard
	{
		/// <summary>Gate de conta do ROBOT (estado herdado, isolado): Simulator/Playback, Ordinal; nulo/vazio => false. Nao se aplica a boleta manual.</summary>
		public static bool IsEligibleProvider(string providerName)
		{
			if (string.IsNullOrEmpty(providerName)) return false;
			return string.Equals(providerName, "Simulator", StringComparison.Ordinal)
				|| string.Equals(providerName, "Playback", StringComparison.Ordinal);
		}

		/// <summary>Tipo da conta para EXIBICAO, a partir do Provider real do NT8 (nunca do nome): SIM | LIVE | UNKNOWN.</summary>
		public static string AccountKind(string providerName)
		{
			if (string.IsNullOrEmpty(providerName)) return "UNKNOWN";
			return IsEligibleProvider(providerName) ? "SIM" : "LIVE";
		}

		/// <summary>Ordem pertence ao ROBOT? Ordinal sobre "IJC-ROBOT|". Ordens "IJC-MANUAL|" NUNCA sao do robo.</summary>
		public static bool IsRobotOrderName(string name)
		{
			return name != null && name.StartsWith(IjcOrigin.RobotPrefix, StringComparison.Ordinal);
		}

		public static bool IsManualOrderName(string name)
		{
			return name != null && name.StartsWith(IjcOrigin.ManualPrefix, StringComparison.Ordinal);
		}
	}

	/// <summary>Conta ESCOLHIDA PELO OPERADOR (OPERATOR_SELECTED): fonte unica para PNL, posicao, boleta manual e report do robo.
	/// Nunca autoescolhida, nunca persistida entre reinicios (nasce null).</summary>
	public static class IjcSession
	{
		private static volatile string selectedAccount;
		public static string SelectedAccount { get { return selectedAccount; } set { selectedAccount = string.IsNullOrEmpty(value) ? null : value; } }
	}

	// ── BOLETA MANUAL (puro) ─────────────────────────────────────────────────────────────────────────
	/// <summary>Rascunho da boleta (estado de UI compartilhado Full/Compact). Nunca persistido como comando.</summary>
	public class IjcTicketDraft
	{
		public string Account;
		public string Instrument;
		public int Quantity = 1;
		public string OrderType = IjcTicketValidator.Market;
		public double? LimitPrice;
		public IjcTicketDraft Clone() { return (IjcTicketDraft)MemberwiseClone(); }
	}

	public class IjcTicketInput
	{
		public string Side, Account, Connection, Instrument, OrderType;
		public bool AccountFound, InstrumentFound;
		public double TickSize;
		public int Quantity;
		public double? LimitPrice;
	}

	public static class IjcTicketValidator
	{
		public const string Buy = "BUY", Sell = "SELL", Market = "MARKET", Limit = "LIMIT";

		/// <summary>Validacoes TECNICAS apenas (sem politica baseada em contexto JEV). Lista vazia = valida.</summary>
		public static List<string> Validate(IjcTicketInput t)
		{
			var e = new List<string>();
			if (t == null) { e.Add("NO_INPUT"); return e; }
			if (t.Side != Buy && t.Side != Sell) e.Add("SIDE_INVALID");
			if (string.IsNullOrEmpty(t.Account)) e.Add("NO_ACCOUNT");
			else if (!t.AccountFound) e.Add("ACCOUNT_NOT_FOUND");
			else if (t.Connection != "Connected") e.Add("ACCOUNT_DISCONNECTED");
			if (string.IsNullOrWhiteSpace(t.Instrument)) e.Add("NO_INSTRUMENT");
			else if (!t.InstrumentFound) e.Add("INSTRUMENT_INVALID");
			if (t.Quantity <= 0) e.Add("QUANTITY_INVALID");
			if (t.OrderType != Market && t.OrderType != Limit) e.Add("ORDER_TYPE_INVALID");
			if (t.OrderType == Limit)
			{
				if (!t.LimitPrice.HasValue || double.IsNaN(t.LimitPrice.Value) || double.IsInfinity(t.LimitPrice.Value) || t.LimitPrice.Value <= 0) e.Add("LIMIT_PRICE_REQUIRED");
				else if (t.InstrumentFound && !OnTick(t.LimitPrice.Value, t.TickSize)) e.Add("LIMIT_PRICE_OFF_TICK");
			}
			return e;
		}

		public static bool OnTick(double price, double tick)
		{
			if (!(tick > 0)) return false;
			double n = price / tick;
			return Math.Abs(n - Math.Round(n)) < 1e-6;
		}

		/// <summary>Parse invariante do preco limite digitado ("7635.25" ou "7635,25"). Vazio/invalido => null.</summary>
		public static double? ParsePrice(string s)
		{
			if (string.IsNullOrWhiteSpace(s)) return null;
			double v;
			return double.TryParse(s.Trim().Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? (double?)v : null;
		}
	}

	/// <summary>Anti-double-submit: no maximo UMA ordem manual em voo. Libera so com evento real do NT8 (estado alem de
	/// Initialized) ou apos o timeout — e nesse caso o estado vira UNCONFIRMED; NUNCA ha reenvio automatico.</summary>
	public class IjcSubmitGate
	{
		public const int MinIntervalMs = 750;       // cliques repetidos (duplo clique) dentro deste intervalo sao ignorados
		public const int InFlightTimeoutMs = 5000;
		private readonly object sync = new object();
		private bool inFlight;
		private DateTime startedUtc = DateTime.MinValue;
		private DateTime lastClickUtc = DateTime.MinValue;

		public bool InFlight(DateTime nowUtc)
		{
			lock (sync) { return inFlight && (nowUtc - startedUtc).TotalMilliseconds < InFlightTimeoutMs; }
		}

		public bool TryBegin(DateTime nowUtc, out string reason)
		{
			lock (sync)
			{
				reason = null;
				if ((nowUtc - lastClickUtc).TotalMilliseconds < MinIntervalMs) { reason = "clique repetido em < " + MinIntervalMs + " ms ignorado"; return false; }
				lastClickUtc = nowUtc;
				if (inFlight && (nowUtc - startedUtc).TotalMilliseconds < InFlightTimeoutMs) { reason = "ordem manual anterior ainda sem confirmacao do NT8"; return false; }
				inFlight = true; startedUtc = nowUtc;
				return true;
			}
		}

		/// <summary>Estado real vindo do NT8. Qualquer estado alem de Initialized confirma que a ordem saiu: libera novo clique.</summary>
		public void OnOrderState(string orderState)
		{
			if (orderState == null || orderState == "Initialized") return;
			lock (sync) { inFlight = false; }
		}

		public void Release() { lock (sync) { inFlight = false; } }

		public static bool IsTerminalState(string s) { return s == "Filled" || s == "Cancelled" || s == "Rejected"; }
	}

	// ── PNL / POSICAO (puro) ─────────────────────────────────────────────────────────────────────────
	/// <summary>PNL da conta selecionada. Fonte: NT8 Account.Get(AccountItem.*, Account.Denomination). Nunca o motor JEV.
	/// REALIZED = AccountItem.RealizedProfitLoss · OPEN = AccountItem.UnrealizedProfitLoss · PNL = REALIZED + OPEN (so com ambos).
	/// Ausente => null (exibido como NOT_REPORTED), nunca 0 fabricado.</summary>
	public class IjcPnlView
	{
		public string Status;            // NO_ACCOUNT | OFFLINE | AVAILABLE | PARTIAL | NOT_REPORTED
		public string Currency;
		public double? Pnl, Realized, Open;

		public static IjcPnlView Compose(bool accountSelected, bool connected, double? realized, double? unrealized, string currency)
		{
			var v = new IjcPnlView { Currency = currency };
			if (!accountSelected) { v.Status = "NO_ACCOUNT"; return v; }
			if (!connected) { v.Status = "OFFLINE"; return v; }
			if (currency == null) { v.Status = "NOT_REPORTED"; return v; }
			v.Realized = realized; v.Open = unrealized;
			v.Pnl = realized.HasValue && unrealized.HasValue ? realized.Value + unrealized.Value : (double?)null;
			v.Status = v.Pnl.HasValue ? "AVAILABLE" : (realized.HasValue || unrealized.HasValue ? "PARTIAL" : "NOT_REPORTED");
			return v;
		}

		public double? Metric(string tab) { return tab == "REALIZED" ? Realized : tab == "OPEN" ? Open : Pnl; }

		/// <summary>+1,234.50 / −1,234.50 / 0.00; ausente => NOT_REPORTED.</summary>
		public static string Money(double? v)
		{
			if (!v.HasValue) return "NOT_REPORTED";
			if (v.Value == 0) return "0.00";
			return (v.Value > 0 ? "+" : "−") + Math.Abs(v.Value).ToString("#,0.00", CultureInfo.InvariantCulture);
		}
	}

	/// <summary>Posicao conta+instrumento. FLAT so com leitura valida de tamanho zero; sem leitura => UNKNOWN.</summary>
	public class IjcPositionView
	{
		public string State;             // LONG | SHORT | FLAT | UNKNOWN
		public string Reason;
		public int? Size;
		public double? AvgPrice, OpenPnl;

		public static IjcPositionView Unknown(string reason) { return new IjcPositionView { State = "UNKNOWN", Reason = reason }; }

		public static IjcPositionView From(bool valid, string marketPosition, int quantity, double avgPrice, double? openPnl)
		{
			if (!valid) return Unknown("NOT_REPORTED");
			if (marketPosition == "Flat" || quantity == 0) return new IjcPositionView { State = "FLAT", Size = 0, AvgPrice = null, OpenPnl = openPnl.HasValue ? openPnl : 0 };
			if (marketPosition == "Long") return new IjcPositionView { State = "LONG", Size = quantity, AvgPrice = avgPrice, OpenPnl = openPnl };
			if (marketPosition == "Short") return new IjcPositionView { State = "SHORT", Size = quantity, AvgPrice = avgPrice, OpenPnl = openPnl };
			return Unknown("MARKET_POSITION_UNKNOWN");
		}
	}

	/// <summary>Contrato futuro de execucao. Neste build: todo metodo devolve HARD_DISABLED e nao toca conta nem ordem.</summary>
	/// <summary>Boleta manual vista pela janela. Implementacoes: IjcManualOrderController (IjcManualOrders.cs, com IJC_MANUAL_ORDERS)
	/// e IjcManualOrdersDeferred (lote de instalacao sem a boleta: nunca envia).</summary>
	public interface IIjcManualOrders : IDisposable
	{
		bool Available { get; }
		string Status { get; }
		string Detail { get; }
		bool InFlight { get; }
		string Click(string side, IjcTicketDraft d);
	}

	/// <summary>MANUAL_ORDER_INSTALLATION = DEFERRED: a boleta nao faz parte deste lote de instalacao; o clique nao envia nada.</summary>
	public sealed class IjcManualOrdersDeferred : IIjcManualOrders
	{
		public bool Available { get { return false; } }
		public string Status { get { return "DEFERRED"; } }
		public string Detail { get { return "boleta nao instalada neste lote"; } }
		public bool InFlight { get { return false; } }
		public string Click(string side, IjcTicketDraft d) { return "DEFERRED"; }
		public void Dispose() { }
	}

	public static class IjcExecutionStub
	{
		public static string SubmitIntent(string intentId, string snapshotId) { return IjcSafety.ORDER_PATH; }
		public static string CancelOwnedEntries(string account) { return IjcSafety.ORDER_PATH; }
		public static string EmergencyExitOwned(string account) { return IjcSafety.ORDER_PATH; }
	}

	public static class IjcJson
	{
		private static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
		{
			DateParseHandling = DateParseHandling.None,   // datas ISO continuam string (nada de DateTime localizado)
			FloatParseHandling = FloatParseHandling.Double,
			Culture = CultureInfo.InvariantCulture
		};

		public static JObject Parse(string json) { return JsonConvert.DeserializeObject<JObject>(json, Settings); }

		/// <summary>Numero pelo VALOR do token (Integer/Float) ou string em cultura INVARIANTE. Nunca via ToString() localizado.</summary>
		public static double? Num(JToken t)
		{
			if (t == null) return null;
			if (t.Type == JTokenType.Integer || t.Type == JTokenType.Float) return (double)t;
			if (t.Type == JTokenType.String)
			{
				double v;
				if (double.TryParse((string)t, NumberStyles.Float, CultureInfo.InvariantCulture, out v)) return v;
			}
			return null;
		}

		public static string Fmt(double? v, string format)
		{
			return v.HasValue ? v.Value.ToString(format, CultureInfo.InvariantCulture) : "—";
		}

		public static string S(JToken root, string path)
		{
			JToken v = root == null ? null : root.SelectToken(path);
			if (v == null || v.Type == JTokenType.Null) return "—";
			if (v.Type == JTokenType.Integer || v.Type == JTokenType.Float) return Fmt(Num(v), "0.###");
			return v.Type == JTokenType.String ? (string)v : v.ToString(Formatting.None);
		}
	}

	public static class IjcHttp
	{
		/// <summary>Uma requisicao por chamada; so loopback 127.0.0.1. Nunca lanca: status 0 = transporte falhou.</summary>
		public static string Request(string method, string url, string body, string token, int timeoutMs, out int status)
		{
			status = 0;
			if (url == null || !url.StartsWith("http://127.0.0.1:", StringComparison.Ordinal)) return null;
			try
			{
				HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
				req.Method = method;
				req.Proxy = null;
				req.KeepAlive = false;
				req.Timeout = timeoutMs;
				req.ReadWriteTimeout = timeoutMs;
				req.Accept = "application/json";
				if (token != null) req.Headers["X-IJC-Token"] = token;
				if (body != null)
				{
					byte[] b = Encoding.UTF8.GetBytes(body);
					req.ContentType = "application/json";
					req.ContentLength = b.Length;
					using (Stream s = req.GetRequestStream()) s.Write(b, 0, b.Length);
				}
				using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
				using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
				{
					status = (int)resp.StatusCode;
					return r.ReadToEnd();
				}
			}
			catch (WebException ex)
			{
				HttpWebResponse er = ex.Response as HttpWebResponse;
				if (er != null) { status = (int)er.StatusCode; try { er.Close(); } catch { } }
				return null;
			}
			catch (Exception) { return null; }
		}
	}

	/// <summary>Log JSONL de diagnostico/auditoria do AddOn. Limite de taxa por chave; falha de escrita nunca propaga.</summary>
	public static class IjcDiag
	{
		public static string LogDir;                    // injetado pelo AddOn: UserDataDir\invictus-jev-code\logs
		public static long WriteFailures;
		private static readonly object Gate = new object();
		private static readonly Dictionary<string, DateTime> LastByKey = new Dictionary<string, DateTime>();

		public static void Log(string evt, string severity, string reason, string rateKey = null, string state = null, string snapshotId = null)
		{
			Write(evt, severity, reason, rateKey, state, snapshotId, null, null);
		}

		/// <summary>Auditoria de ordem: origin (MANUAL_OPERATOR | JEV_ROBOT) + nome da ordem. Sem conta/token no log.</summary>
		public static void LogOrder(string evt, string severity, string origin, string orderName, string reason)
		{
			Write(evt, severity, reason, null, null, null, origin, orderName);
		}

		public static JObject Record(DateTime now, string evt, string severity, string reason, string state, string snapshotId, string origin, string orderName)
		{
			return new JObject
			{
				{ "ts", now.ToString("o", CultureInfo.InvariantCulture) }, { "component", "nt8-addon" }, { "event", evt }, { "severity", severity },
				{ "snapshot_id", snapshotId }, { "intention_id", null }, { "state", state }, { "origin", origin }, { "order_name", orderName },
				{ "reason", reason == null ? null : (reason.Length > 500 ? reason.Substring(0, 500) : reason) }
			};
		}

		private static void Write(string evt, string severity, string reason, string rateKey, string state, string snapshotId, string origin, string orderName)
		{
			try
			{
				DateTime now = DateTime.UtcNow;
				lock (Gate)
				{
					if (rateKey != null)
					{
						DateTime last;
						if (LastByKey.TryGetValue(rateKey, out last) && (now - last).TotalSeconds < 30) return;
						LastByKey[rateKey] = now;
					}
					if (string.IsNullOrEmpty(LogDir)) return;
					Directory.CreateDirectory(LogDir);
					JObject rec = Record(now, evt, severity, reason, state, snapshotId, origin, orderName);
					File.AppendAllText(Path.Combine(LogDir, "nt8-" + now.ToString("yyyy-MM", CultureInfo.InvariantCulture) + ".jsonl"), rec.ToString(Formatting.None) + "\n");
				}
			}
			catch { WriteFailures++; }
		}
	}

	// ── maquina de estado de ordem (para a fase de execucao futura; testada offline) ─────────────────────
	public enum IjcOrderPhase { Unknown = -1, Initialized = 0, Submitted = 1, Accepted = 2, Working = 3, PartFilled = 4, Filled = 10, Cancelled = 11, Rejected = 12 }

	public class IjcOrderTrack
	{
		public IjcOrderPhase Phase = IjcOrderPhase.Initialized;
		public int FilledQty;
		private readonly HashSet<string> seenExecutions = new HashSet<string>(StringComparer.Ordinal);

		public static bool IsTerminal(IjcOrderPhase p) { return p == IjcOrderPhase.Filled || p == IjcOrderPhase.Cancelled || p == IjcOrderPhase.Rejected; }

		/// <summary>R1 monotonica (rank menor ignorado) · R2 terminal imutavel.</summary>
		public bool Apply(IjcOrderPhase next)
		{
			if (IsTerminal(Phase)) return false;
			if ((int)next <= (int)Phase) return false;
			Phase = next;
			return true;
		}

		/// <summary>R3: fill acumula por ExecutionId (dedup).</summary>
		public bool ApplyFill(string executionId, int qty)
		{
			if (string.IsNullOrEmpty(executionId) || qty <= 0 || !seenExecutions.Add(executionId)) return false;
			FilledQty += qty;
			return true;
		}
	}

	/// <summary>Registro PERSISTIDO de intencoes consumidas (intent_id|snapshot_id). Sobrevive a restart/F5 futuro.</summary>
	public class IjcDedup
	{
		private readonly string file;
		private JObject db;

		public IjcDedup(string file)
		{
			this.file = file;
			try { db = File.Exists(file) ? IjcJson.Parse(File.ReadAllText(file)) : null; } catch { db = null; }
			if (db == null || !(db["sessions"] is JObject)) db = new JObject { { "schema", "ijc-dedup/v1" }, { "sessions", new JObject() } };
		}

		private static string Key(string intentId, string snapshotId) { return intentId + "|" + snapshotId; }

		public bool IsConsumed(string intentId, string snapshotId)
		{
			string k = Key(intentId, snapshotId);
			return ((JObject)db["sessions"]).Properties().Any(p => p.Value is JObject && ((JObject)p.Value)[k] != null);
		}

		public bool MarkConsumed(string intentId, string snapshotId, string sessionEt)
		{
			if (IsConsumed(intentId, snapshotId)) return false;
			JObject sessions = (JObject)db["sessions"];
			JObject s = sessions[sessionEt] as JObject;
			if (s == null) { s = new JObject(); sessions[sessionEt] = s; }
			s[Key(intentId, snapshotId)] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
			string tmp = file + ".tmp";
			File.WriteAllText(tmp, db.ToString(Formatting.None));
			if (File.Exists(file)) File.Delete(file);
			File.Move(tmp, file);
			return true;
		}
	}

	// ── DTOs copiados das colecoes do NT8 (dentro do lock so se copia) ─────────────────────────────────
	public class IjcAccountDto { public string Name; public string Provider; public string Connection; public int ForeignPositions; }
	public class IjcOrderDto { public string Account; public string Name; public string State; public string Instrument; public int Quantity; public int Filled; }

	public class IjcReconResult
	{
		public string Status;              // PENDING_NT8 | RECONCILING | COMPLETE
		public int Orphans;                // ordens IJC| sem registro no ledger
		public List<IjcOrderDto> OwnedOrders = new List<IjcOrderDto>();
		public string PositionState;       // NOT_REPORTED | FLAT | UNKNOWN_RECONCILING
	}

	public static class IjcOwnership
	{
		/// <summary>Reconstroi o estado proprio: so ordens IJC|; ordem IJC| fora do ledger = ORFA (estado explicito).
		/// Posicoes nao tem dono no NT8: so o ledger atribui propriedade (neste build o ledger e vazio => nada proprio).</summary>
		public static IjcReconResult Reconstruct(bool nt8Ready, IEnumerable<IjcOrderDto> allRobotOrders, ICollection<string> ledgerOrderNames)
		{
			IjcReconResult r = new IjcReconResult();
			if (!nt8Ready) { r.Status = "PENDING_NT8"; r.PositionState = "NOT_REPORTED"; return r; }
			foreach (IjcOrderDto o in allRobotOrders ?? new List<IjcOrderDto>())
			{
				if (!IjcGuard.IsRobotOrderName(o.Name)) continue;
				r.OwnedOrders.Add(o);
				if (ledgerOrderNames == null || !ledgerOrderNames.Contains(o.Name)) r.Orphans++;
			}
			r.Status = "COMPLETE";
			r.PositionState = r.Orphans > 0 ? "UNKNOWN_RECONCILING" : "FLAT";
			return r;
		}
	}
}
