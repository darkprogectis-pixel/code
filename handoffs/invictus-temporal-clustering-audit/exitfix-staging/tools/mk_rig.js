// Bancada M1: aplica no ExitDriver.cs os ramos #if RIG (executor REAL por reflexao) e gera a arvore-bancada (2 dubles de fronteira).
// uso: node mk_rig.js <W> <scratch>
const fs = require('fs'), path = require('path');
const [W, S] = process.argv.slice(2);
const drv = path.join(W, 'harness', 'ExitDriver.cs');
let s = fs.readFileSync(drv, 'utf8');
function rep(a, b) { const n = s.split(a).length - 1; if (n !== 1) { console.log('ANCHOR x' + n + ': ' + a.slice(0, 70)); process.exit(1); } s = s.replace(a, () => b); }
if (!s.includes('#if RIG')) {
rep('public readonly List<JObject> Legs = new List<JObject>();', `public List<JObject> Legs = new List<JObject>();
		public readonly Dictionary<string, int> ExecPos0 = new Dictionary<string, int>(), ExecSum = new Dictionary<string, int>(); public bool InExec; public string Root;`);
rep(`if ((longClose && p <= 0) || (!longClose && p >= 0)) ClosesWhenFlatOrOpposite++; }`, `if ((longClose && p <= 0) || (!longClose && p >= 0)) ClosesWhenFlatOrOpposite++;
#if RIG
				JObject leg = Legs.FirstOrDefault(x => (string)x["order_name"] + "|X" == name);
				if (leg != null && leg["x_enviada"] != null && leg["x_enviada"].Type != JTokenType.Null) Resends++;
				if (ClosedLegs.Contains(IntentOf(name))) ClosesAfterClosed++;
				if (InExec) { string k = acc + "|" + instr; int soma; ExecSum.TryGetValue(k, out soma); soma += qty; ExecSum[k] = soma; int p0; ExecPos0.TryGetValue(k, out p0); if (soma > Math.Abs(p0)) PlanOverPosition++; }
				Log.Add(Now.ToString("HH:mm:ss", ci) + " PLACE " + name + " " + action + " q" + qty + " (conta antes " + p + ")");
#endif
			}`);
rep(`		public void Exec(string motivo, bool retry, bool soPendentes)
		{
`, `		public void Exec(string motivo, bool retry, bool soPendentes)
		{
#if RIG
			// BANCADA M1: chama o AlfaOmegaRobo.ExecutarSaida REAL (fonte do staging sem alteracao) — nada emulado aqui.
			ExecPos0.Clear(); ExecSum.Clear(); foreach (var kv in Pos) ExecPos0[kv.Key] = kv.Value; InExec = true;
			List<string> antes = Legs.Select(e => (string)e["intentId"]).ToList();
			try { Rig.M("ExecutarSaida").Invoke(null, new object[] { motivo, Now, new List<AoRoboAccount>(), retry, soPendentes }); } finally { InExec = false; }
			foreach (string i in antes) if (!Legs.Any(e => (string)e["intentId"] == i)) ClosedLegs.Add(i);
			Log.Add(Now.ToString("HH:mm:ss", ci) + " EXEC " + motivo + " retry=" + retry + " soPend=" + soPendentes + " pernas " + antes.Count + " -> " + Legs.Count);
			Colher();
			if (Legs.Count >= 0) return;
#endif
`);
rep(`			if (!motorPosicionado) { if (Legs.Count > 0) Exec("flatten_retry", true, false); }
#if STAGING
			else if (Legs.Any(e => Enviado(e) && !B(e["fechada"]))) Exec("flatten_retry", true, true);   // C5
#endif`, `			if (!motorPosicionado) { if (Legs.Count > 0) Exec("flatten_retry", true, false); }
#if RIG
			else if ((bool)Rig.M("TemSaidaPendenteEnviada").Invoke(null, null)) Exec("flatten_retry", true, true);   // C5 — guarda REAL
#elif STAGING
			else if (Legs.Any(e => Enviado(e) && !B(e["fechada"]))) Exec("flatten_retry", true, true);   // C5
#endif`);
rep(`		public void Tick(bool motorPosicionado)`, `#if RIG
		public void Colher()
		{
			try
			{
				if (!File.Exists(Al.Arquivo)) return;
				string t = File.ReadAllText(Al.Arquivo);
				foreach (string k in new[] { "broker_divergence", "flatten_fail", "close_unconfirmed" })
					if (t.Contains(k) && !Alerts.Contains(k + ":ativo")) { Alerts.Add(k + ":ativo"); if (k == "broker_divergence") Divergences++; }
			}
			catch { }
		}
		public string RigPlace(JObject j) { string id = Place((string)j["account"], (string)j["instrument"], (string)j["action"], (int)j["quantity"], (string)j["orderName"]); return new JObject { { "ok", true }, { "orderId", id } }.ToString(Newtonsoft.Json.Formatting.None); }
		public string RigCancel(JObject j)
		{
			int n = 0; string acc = (string)j["account"]; JArray ids = j["orderIds"] as JArray; string oco = j["ocoId"] == null ? null : (string)j["ocoId"];
			foreach (Ord o in Orders.Where(x => x.Acc == acc && x.State == "Working"))
				if ((ids != null && ids.Any(i => (string)i == o.Id)) || (oco != null && o.Oco == oco)) { o.State = "Cancelled"; n++; }
			return new JObject { { "ok", true }, { "cancelled", n } }.ToString(Newtonsoft.Json.Formatting.None);
		}
		public string RigOrders(string acc) { return new JObject { { "ok", true }, { "orders", OrdersJson(acc) } }.ToString(Newtonsoft.Json.Formatting.None); }
#endif
		public void Tick(bool motorPosicionado)`);
rep(`	static World New(bool idSwap, string tmp, string tag) { var w = new World { IdSwap = idSwap };`, `#if RIG
	/// <summary>Acesso por reflexao aos membros privados estaticos do AlfaOmegaRobo REAL (staging) e ligacao dos dubles de fronteira ao mundo simulado.</summary>
	static class Rig
	{
		const System.Reflection.BindingFlags F = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static;
		static readonly System.Reflection.Assembly A = typeof(AoRoboSaida).Assembly;
		public static readonly Type Robo = A.GetType("NinjaTrader.NinjaScript.AddOns.AlfaOmegaRobo", true), Trader = A.GetType("NinjaTrader.NinjaScript.AddOns.AlfaOmegaTrader", true);
		public static World Cur;
		public static System.Reflection.MethodInfo M(string n) { System.Reflection.MethodInfo m = Robo.GetMethod(n, F); if (m == null) throw new Exception("metodo ausente: " + n); return m; }
		public static void Bind(World w, string tmp, string tag)
		{
			Cur = w; w.Root = Path.Combine(tmp, "root-" + tag + "-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(Path.Combine(w.Root, "state")); Directory.CreateDirectory(Path.Combine(w.Root, "logs"));
			AoRoboConfig.RootDir = w.Root; AoRoboAudit.Reset(); AoRoboAudit.LogDir = Path.Combine(w.Root, "logs");
			AoRoboPositions.Reset(); AoRoboPositions.RigHook = a => Cur.PosState(a);
			Trader.GetField("RigPlace", F).SetValue(null, (Func<JObject, string>)(j => Cur.RigPlace(j)));
			Trader.GetField("RigCancel", F).SetValue(null, (Func<JObject, string>)(j => Cur.RigCancel(j)));
			Trader.GetField("RigOrders", F).SetValue(null, (Func<string, string>)(a => Cur.RigOrders(a)));
			var l = (List<JObject>)Robo.GetField("_execucoes", F).GetValue(null); l.Clear(); w.Legs = l;
			Robo.GetField("_fechamento", F).SetValue(null, w.Fe); Robo.GetField("_alertas", F).SetValue(null, w.Al);
		}
	}
#endif
	static World New(bool idSwap, string tmp, string tag) { var w0 = New0(idSwap, tmp, tag);
#if RIG
		Rig.Bind(w0, tmp, tag);
#endif
		return w0; }
	static World New0(bool idSwap, string tmp, string tag) { var w = new World { IdSwap = idSwap };`);
rep(`			var legs = JArray.Parse(new JArray(x.Legs.ToArray()).ToString()); x.Legs.Clear(); foreach (JToken t in legs) x.Legs.Add((JObject)t);   // recarrega o registro de pernas`,
`#if RIG
			Rig.Robo.GetField("_fechamento", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static).SetValue(null, x.Fe);
			Rig.M("GravarExecucoes").Invoke(null, null); x.Legs.Clear(); Rig.M("CarregarExecucoes").Invoke(null, null);   // registro REAL: grava e recarrega o arquivo de execucoes
			if (x.Legs.Count != 2) throw new Exception("recarga do registro: " + x.Legs.Count);
#else
			var legs = JArray.Parse(new JArray(x.Legs.ToArray()).ToString()); x.Legs.Clear(); foreach (JToken t in legs) x.Legs.Add((JObject)t);   // recarrega o registro de pernas
#endif`);
rep(`		try { Directory.Delete(tmp, true); } catch { }
#if STAGING
		string modo = "STAGING";`, `#if RIG
		// caminhos FecharPernaEmDesvio / FecharPernaSemProtecao REAIS (tambem mandam fechamento |X e chamam EsperarFilled)
		Func<string, string, int, World> desvio = (tag, modoF, n) =>
		{
			World x = New(true, tmp, tag); if (n > 0) { x.CloseMode = modoF; x.CloseModeCount = n; }
			JObject e = x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.CancelProtection(e);
			Rig.M("FecharPernaEmDesvio").Invoke(null, new object[] { e, 3, "LONG", REAL, (string)e["intentId"], "ES", (string)e["conta"], "MES 12-26", x.Now, new JObject() });
			x.Open("B", "LONG", REAL, "MES 12-26", 3);                 // reabertura logo depois, mesma conta/lado
			for (int i = 0; i < 3; i++) x.Tick(true);
			x.Exec("anchor_neutro", false, false); for (int i = 0; i < 5; i++) x.Tick(false); return x;
		};
		T("R01", "FecharPernaEmDesvio REAL + reabertura + saida (ids modelo real)", () => desvio("r1", "fill", 0), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6 && x.Closes == 2, null, null);
		T("R02", "FecharPernaEmDesvio REAL com evento de execucao PERDIDO + reabertura + saida", () => desvio("r2", "noevent", 1), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6 && x.Closes == 2, null, null);
		Func<string, string, int, World> semProt = (tag, modoF, n) =>
		{
			World x = New(true, tmp, tag); if (n > 0) { x.CloseMode = modoF; x.CloseModeCount = n; }
			JObject e = x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true);
			List<string> ids = x.Orders.Where(o => o.Oco == (string)e["oco_id"] && o.State == "Working").Select(o => o.Id).ToList();
			Rig.M("FecharPernaSemProtecao").Invoke(null, new object[] { e, (string)e["intentId"], REAL, "LONG", "ES", (string)e["conta"], "MES 12-26", 3, ids, x.Now, new JObject() });
			x.Open("B", "LONG", REAL, "MES 12-26", 3);
			for (int i = 0; i < 3; i++) x.Tick(true);
			x.Exec("anchor_neutro", false, false); for (int i = 0; i < 5; i++) x.Tick(false); return x;
		};
		T("R03", "FecharPernaSemProtecao REAL (cancela protecao, fecha) + reabertura + saida", () => semProt("r3", "fill", 0), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6 && x.Closes == 2, null, null);
		T("R04", "FecharPernaSemProtecao REAL com evento de execucao PERDIDO + reabertura + saida", () => semProt("r4", "noevent", 1), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6 && x.Closes == 2, null, null);
#endif
		try { Directory.Delete(tmp, true); } catch { }
#if RIG
		string modo = "RIG_EXECUTOR_REAL";
#elif STAGING
		string modo = "STAGING";`);
fs.writeFileSync(drv, s);
console.log('driver RIG ok');
} else console.log('driver ja tem RIG');

// arvore-bancada
const src = path.join(S, 'oliver_exitfix'), dst = path.join(S, 'oliver_exitfix_rig');
fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true });
// duble 1: AoTraderCore.cs — mesma API estatica, miolo ligado a ganchos da bancada
fs.writeFileSync(path.join(dst, 'AddOns', 'AoTraderCore.cs'), `// DUBLE DE BANCADA (M1) — NAO vai para pacote. Mesma API estatica do AoTraderCore.cs; o miolo chama a corretora simulada.
using System;
using Newtonsoft.Json.Linq;
namespace NinjaTrader.NinjaScript.AddOns
{
	public partial class AlfaOmegaTrader
	{
		public class AoResult { public int HttpCode; public string Json; public bool Ok { get { return HttpCode == 200; } } }
		public static Func<JObject, string> RigPlace, RigCancel; public static Func<string, string> RigOrders;
		public static AoResult PlaceCore(JObject j) { return new AoResult { HttpCode = 200, Json = RigPlace(j) }; }
		public static AoResult CancelCore(JObject j) { return new AoResult { HttpCode = 200, Json = RigCancel(j) }; }
		public static AoResult OrdersCore(string account, bool activeOnly) { return new AoResult { HttpCode = 200, Json = RigOrders(account) }; }
		public static AoResult BracketCore(JObject j) { throw new NotSupportedException("bancada: BracketCore"); }
		public static AoResult FlattenCore(JObject j) { throw new NotSupportedException("bancada: FlattenCore"); }
		public static AoResult FlattenAllCore(JObject j) { throw new NotSupportedException("bancada: FlattenAllCore"); }
		public static AoResult ChangeCore(JObject j) { throw new NotSupportedException("bancada: ChangeCore"); }
	}
}
`);
// duble 2: AlfaOmegaRoboPositions.cs — fonte original + gancho de leitura no inicio do RefreshAll
const pf = path.join(dst, 'AddOns', 'AlfaOmegaRoboPositions.cs'); let p = fs.readFileSync(pf, 'utf8');
const a1 = 'public static bool DryRun = false;', a2 = 'if (want.Count == 0) return 0;';
if (p.split(a1).length !== 2 || p.split(a2).length !== 2) { console.log('ANCHOR positions'); process.exit(1); }
p = p.replace(a1, a1 + '\n\t\tpublic static Func<string, AoPositionState> RigHook;   // DUBLE DE BANCADA (M1) — NAO vai para pacote')
     .replace(a2, a2 + '\n\t\t\tif (RigHook != null) { lock (_gate) { foreach (string a in want) _cache[a] = RigHook(a); _lastRefreshUtc = nowUtc; } return want.Count; }');
fs.writeFileSync(pf, p);
console.log('arvore-bancada ok');
