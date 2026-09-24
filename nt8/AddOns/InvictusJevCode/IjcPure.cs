// INVICTUS JEV CODE — pecas PURAS do AddOn (sem tipos do NinjaTrader): testaveis fora do NT8 (nt8/check/IjcPureTests).
// CODIGO-FONTE NO REPOSITORIO: NAO instalado no NT8, NAO compilado no NT8 (F5 NOT PERFORMED).
//
// Padroes reutilizados do Invictus anterior (REUSE_PATTERN / REUSE_CODE_CANDIDATE, ver handoff de arquitetura):
//  - conta: so Simulator/Playback, decidido pelo PROPRIO NT8 (AoRoboGuard ORIGINAL de 18/08; NAO a versao reduzida de 03/09);
//  - prefixo de propriedade com pipe e comparacao Ordinal ("IJC|"; licao AO x AoBoleta);
//  - HTTP por chamada (HttpWebRequest, Proxy=null, KeepAlive=false) — nunca HttpClient estatico (incidente de socket no NT8);
//  - parse numerico invariante de cultura (licao AoJsonNum, maquina pt-BR);
//  - log de diagnostico em ARQUIVO (licao AoDiag: Print nao persiste);
//  - maquina de ordem monotonica R1/R2/R3 e dedup persistido (AoRoboOrderState / AoRoboDedup).
// NESTE BUILD NAO EXISTE CAMINHO DE ORDEM: IjcExecutionStub devolve HARD_DISABLED e nao referencia API de ordem.
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
		public const bool JEV_CAN_SEND_ORDER = false;           // constante: nenhuma config/botao/endpoint/agente muda isto
		public const string ORDER_PATH = "HARD_DISABLED";
		public const string OrderPrefix = "IJC|";                // fonte unica do prefixo de propriedade
		public const string ProductName = "INVICTUS JEV CODE";
	}

	public static class IjcGuard
	{
		/// <summary>true SO para conta que o NinjaTrader classifica como Simulator ou Playback. Nome exato, Ordinal; nulo/vazio => false.</summary>
		public static bool IsEligibleProvider(string providerName)
		{
			if (string.IsNullOrEmpty(providerName)) return false;
			return string.Equals(providerName, "Simulator", StringComparison.Ordinal)
				|| string.Equals(providerName, "Playback", StringComparison.Ordinal);
		}

		/// <summary>Ordem pertence ao INVICTUS JEV CODE? Comparacao Ordinal sobre "IJC|" (o pipe faz parte do prefixo).</summary>
		public static bool IsRobotOrderName(string name)
		{
			return name != null && name.StartsWith(IjcSafety.OrderPrefix, StringComparison.Ordinal);
		}
	}

	/// <summary>Contrato futuro de execucao. Neste build: todo metodo devolve HARD_DISABLED e nao toca conta nem ordem.</summary>
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
					JObject rec = new JObject
					{
						{ "ts", now.ToString("o", CultureInfo.InvariantCulture) }, { "component", "nt8-addon" }, { "event", evt }, { "severity", severity },
						{ "snapshot_id", snapshotId }, { "intention_id", null }, { "state", state }, { "reason", reason == null ? null : (reason.Length > 500 ? reason.Substring(0, 500) : reason) }
					};
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
