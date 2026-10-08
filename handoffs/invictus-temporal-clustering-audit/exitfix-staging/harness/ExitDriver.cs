// Harness da camada de SAIDA do INVICTUS (EXIT_LAYER_FIX X2). Roda contra o assembly COMPLETO compilado da arvore (base OU staging):
//  · base    (sem STAGING): AoRoboSaida.Decidir(e, st, ordens) REAL + RevalidarClose TRANSCRITO do AlfaOmegaRobo.cs base + laco do executor emulado
//                           (uma leitura de posicao antes do laco; verificacao do fechamento pelo orderId devolvido no envio).
//  · staging (STAGING)    : AoRoboFechamento.SaldoPerna + AoRoboSaida.PlanejarSaidas REAIS; o executor emulado so aplica o plano
//                           (verificacao por saldo / nome), como o ExecutarSaida do staging.
// Corretora simulada: posicoes, ordens (com troca de id opcional = modelo da conta real), eventos de execucao (entregues, atrasados ou perdidos).
// Nao toca NT8, nao le nem grava nada fora de EXIT_TMP.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using NinjaTrader.NinjaScript.AddOns;

public static class ExitDriver
{
	static readonly CultureInfo ci = CultureInfo.InvariantCulture;

	sealed class Ord { public string Id, Name, Acc, Instr, Action, Type, State, Oco; public int Qty, Filled; public DateTime Time; public int WorkTicks; public bool Hidden; }
	sealed class Ev { public DateTime Due; public string Intent, Name; public bool Buy; public int Qty; public double Px; }

	sealed class World
	{
		public bool IdSwap;                       // modelo da conta real: o id listado difere do devolvido no envio
		public string CloseMode = "fill";         // fill | noevent | lateevent | working | reject | cancel | partial | vanish
		public int CloseModeCount = 99;           // quantos fechamentos seguem CloseMode (depois: fill)
		public DateTime Now = new DateTime(2026, 10, 8, 16, 0, 0, DateTimeKind.Utc);
		public readonly Dictionary<string, int> Pos = new Dictionary<string, int>();
		public readonly List<Ord> Orders = new List<Ord>();
		public readonly List<Ev> Pend = new List<Ev>();
		public List<JObject> Legs = new List<JObject>();
		public readonly Dictionary<string, int> ExecPos0 = new Dictionary<string, int>(), ExecSum = new Dictionary<string, int>(); public bool InExec; public string Root;
		public AoRoboFechamento Fe; public AoRoboAlertas Al;
		public int Seq, Closes, CloseQty, Resends, Divergences, ClosesWhenFlatOrOpposite, PlanOverPosition, ClosesAfterClosed;
		public bool Inversion; public readonly List<string> Log = new List<string>(); public readonly List<string> Alerts = new List<string>();
		public readonly HashSet<string> ClosedLegs = new HashSet<string>();
		public double Px(string instr) { return instr.StartsWith("MNQ") ? 31250.0 : 7838.0; }
		public int P(string acc, string instr) { int v; return Pos.TryGetValue(acc + "|" + instr, out v) ? v : 0; }
		void AddPos(string acc, string instr, int d) { Pos[acc + "|" + instr] = P(acc, instr) + d; }
		public static string IntentOf(string name) { string[] p = (name ?? "").Split('|'); return p.Length >= 3 ? p[2] : null; }

		public void Deliver() { foreach (Ev e in Pend.Where(x => x.Due <= Now).ToList()) { Fe.RegistrarFill(e.Intent, e.Buy, e.Qty, e.Px, Now, e.Name); Pend.Remove(e); } }
		void Fill(Ord o, int q, bool evento, double atrasoSeg)
		{
			bool buy = o.Action == "buy";
			int antes = P(o.Acc, o.Instr);
			AddPos(o.Acc, o.Instr, buy ? q : -q);
			int depois = P(o.Acc, o.Instr);
			o.Filled += q;
			if (o.Name.EndsWith("|X")) { if ((antes > 0 && depois < 0) || (antes < 0 && depois > 0) || (antes == 0 && depois != 0) || (antes > 0 && depois > antes) || (antes < 0 && depois < antes)) { Inversion = true; Log.Add("INVERSAO " + o.Name + " pos " + antes + " -> " + depois); } }
			if (evento) { var ev = new Ev { Due = Now.AddSeconds(atrasoSeg), Intent = IntentOf(o.Name), Name = o.Name, Buy = buy, Qty = q, Px = Px(o.Instr) }; if (atrasoSeg <= 0) Fe.RegistrarFill(ev.Intent, ev.Buy, ev.Qty, ev.Px, Now, ev.Name); else Pend.Add(ev); }
		}
		/// <summary>Envio a mercado. Devolve o id "do envio" (o que o PlaceCore devolve).</summary>
		public string Place(string acc, string instr, string action, int qty, string name)
		{
			string idEnvio = Guid.NewGuid().ToString("N");
			var o = new Ord { Id = IdSwap ? (674389780000L + (++Seq)).ToString(ci) : idEnvio, Name = name, Acc = acc, Instr = instr, Action = action, Type = "market", Qty = qty, State = "Working", Time = Now };
			Orders.Add(o);
			bool close = name.EndsWith("|X");
			string mode = close && CloseModeCount > 0 ? CloseMode : "fill";
			if (close) { Closes++; CloseQty += qty; CloseModeCount--; int p = P(acc, instr); bool longClose = action == "sell"; if ((longClose && p <= 0) || (!longClose && p >= 0)) ClosesWhenFlatOrOpposite++;
#if RIG
				JObject leg = Legs.FirstOrDefault(x => (string)x["order_name"] + "|X" == name);
				if (leg != null && leg["x_enviada"] != null && leg["x_enviada"].Type != JTokenType.Null) Resends++;
				if (ClosedLegs.Contains(IntentOf(name))) ClosesAfterClosed++;
				if (InExec) { string k = acc + "|" + instr; int soma; ExecSum.TryGetValue(k, out soma); soma += qty; ExecSum[k] = soma; int p0; ExecPos0.TryGetValue(k, out p0); if (soma > Math.Abs(p0)) PlanOverPosition++; }
				Log.Add(Now.ToString("HH:mm:ss", ci) + " PLACE " + name + " " + action + " q" + qty + " (conta antes " + p + ")");
#endif
			}
			switch (mode)
			{
				case "fill": Fill(o, qty, true, 0); o.State = "Filled"; break;
				case "noevent": Fill(o, qty, false, 0); o.State = "Filled"; break;
				case "lateevent": Fill(o, qty, true, 45); o.State = "Filled"; break;
				case "working": o.WorkTicks = 2; break;
				case "reject": o.State = "Rejected"; break;
				case "cancel": o.State = "Cancelled"; break;
				case "partial": { int q = Math.Max(1, qty / 2); Fill(o, q, true, 0); o.State = "Cancelled"; break; }
				case "vanish": o.Hidden = true; o.State = "Initialized"; break;
			}
			return idEnvio;
		}
		public void StepOrders() { foreach (Ord o in Orders.Where(x => x.State == "Working" && x.Type == "market" && x.WorkTicks > 0).ToList()) { if (--o.WorkTicks == 0) { Fill(o, o.Qty - o.Filled, true, 0); o.State = "Filled"; } } }
		public JArray OrdersJson(string acc)
		{
			var a = new JArray();
			foreach (Ord o in Orders.Where(x => x.Acc == acc && !x.Hidden))
				a.Add(new JObject { { "orderId", o.Id }, { "name", o.Name }, { "instrument", o.Instr }, { "action", o.Action }, { "orderType", o.Type }, { "quantity", o.Qty }, { "filled", o.Filled },
									{ "state", o.State }, { "oco", o.Oco }, { "time", o.Time.ToString("o", ci) } });
			return a;
		}
		public AoPositionState PosState(string acc)
		{
			var l = new List<AoPosition>();
			foreach (var kv in Pos) { string[] p = kv.Key.Split('|'); if (p[0] != acc || kv.Value == 0) continue; l.Add(new AoPosition { Instrument = p[1], Side = kv.Value > 0 ? "LONG" : "SHORT", Quantity = Math.Abs(kv.Value) }); }
			return new AoPositionState { Ok = true, Source = "harness", Positions = l, AgeMs = 0, MaxAgeMs = 5000 };
		}
		public void CancelProtection(JObject e) { foreach (Ord o in Orders.Where(x => x.Acc == (string)e["nt8_account"] && x.Oco == (string)e["oco_id"] && x.State == "Working")) o.State = "Cancelled"; }

		public JObject Open(string tag, string side, string acc, string instr, int qty)
		{
			string conta = acc.StartsWith("TAKE") ? "aaa5cd" : "de43ab";
			string intent = "AO-T-" + conta + "-" + instr.Split(' ')[0] + "-" + side + "-" + tag;
			string name = "AO|" + conta + "|" + intent;
			Place(acc, instr, side == "LONG" ? "buy" : "sell", qty, name);
			string oco = intent + "|P1"; string exit = side == "LONG" ? "sell" : "buy";
			Orders.Add(new Ord { Id = "S" + (++Seq), Name = name + "|S", Acc = acc, Instr = instr, Action = exit, Type = "stopmarket", Qty = qty, State = "Working", Oco = oco, Time = Now });
			Orders.Add(new Ord { Id = "T" + (++Seq), Name = name + "|T", Acc = acc, Instr = instr, Action = exit, Type = "limit", Qty = qty, State = "Working", Oco = oco, Time = Now });
			var e = new JObject { { "conta", conta }, { "nt8_account", acc }, { "instrumento", instr }, { "familia", instr.StartsWith("MNQ") ? "NQ" : "ES" }, { "ativo", instr.Split(' ')[0] }, { "qty", qty },
								  { "intentId", intent }, { "order_name", name }, { "side", side }, { "openedAt", AoMotorCanonico.Iso(Now) }, { "registrada_utc", AoMotorCanonico.Iso(Now) },
								  { "oco_id", oco }, { "qty_protegida", qty }, { "entry_fill", Px(instr) } };
			Legs.Add(e); return e;
		}
		/// <summary>Stop ou take da PROPRIA perna executa na corretora (OCO cancela o irmao).</summary>
		public void ProtectionFills(JObject e, string suf, bool evento)
		{
			Ord o = Orders.First(x => x.Name == (string)e["order_name"] + suf && x.State == "Working");
			Fill(o, o.Qty, evento, 0); o.State = "Filled";
			foreach (Ord s in Orders.Where(x => x.Oco == o.Oco && x != o && x.State == "Working")) s.State = "Cancelled";
		}

#if !STAGING
		// TRANSCRICAO do AlfaOmegaRobo.RevalidarClose da arvore BASE (linhas 1541-1572 do arquivo instalado, hash 32c84685).
		static AoSaidaDecisao RevalidarCloseBase(JObject e, AoPositionState st, JArray ordens, AoSaidaDecisao d, DateTime agora, out string divergencia)
		{
			divergencia = null;
			if (d.Acao != AoSaidaAcao.JaFechada && d.Acao != AoSaidaAcao.Fechar && d.Acao != AoSaidaAcao.CancelarEFechar) return d;
			string side = (string)e["side"], instrumento = (string)e["instrumento"];
			Func<JObject, bool> stopDoRobo = o => AoRoboFechamento.EhStopDaPerna(o, e);
			if (d.Acao == AoSaidaAcao.JaFechada && ordens != null && ordens.OfType<JObject>().Any(o => stopDoRobo(o) && (string)o["state"] == "Filled")) return d;
			bool ok = st != null && st.Ok && st.Positions != null;
			AoPosition p = ok ? AoRoboGates.FindPosition(st.Positions, instrumento) : null;
			int qty = e["qty"] != null && e["qty"].Type == JTokenType.Integer ? (int)e["qty"] : 0, qf;
			bool emDesvio = e["desvio"] != null && e["desvio"].Type == JTokenType.Boolean && (bool)e["desvio"];
			string cls = AoRoboFechamento.ClassificarBrokerNoClose(side, qty, ok, st == null ? -1 : st.AgeMs, p == null ? "FLAT" : p.Side, p == null ? 0 : p.Quantity, out qf);
			string r = AoRoboFechamento.DecidirClose(e, agora.AddMilliseconds(-(st == null ? 0 : st.AgeMs)), cls);
			string conta = (p == null || p.Quantity <= 0 ? "FLAT" : p.Side + " " + p.Quantity + "x") + " em " + instrumento;
			d.QtyFechar = 0; d.Parcial = false; d.OcoCancelar = null;
			if (r == AoRoboFechamento.CloseJaFechada) { d.Acao = AoSaidaAcao.JaFechada; d.Motivo = "conta FLAT confirmada"; return d; }
			if (r == AoRoboFechamento.CloseAguardarFlat) { d.Acao = AoSaidaAcao.Aguardar; d.Motivo = "conta FLAT ainda nao confirmada"; return d; }
			if (r == AoRoboFechamento.CloseFechar)
			{
				if (emDesvio) divergencia = "registro em desvio × conta " + conta;
				bool stopAtivo = ordens != null && ordens.OfType<JObject>().Any(o => stopDoRobo(o) && AoRoboFechamento.EstadoAtivoNt8((string)o["state"]));
				d.Acao = stopAtivo ? AoSaidaAcao.CancelarEFechar : AoSaidaAcao.Fechar; d.OcoCancelar = stopAtivo ? AoRoboSaida.OcoAtual(e) : null;
				d.QtyFechar = qf; d.Parcial = qf < qty; d.Motivo = "fechar " + qf + "x " + side + " em " + instrumento + " (conta " + conta + ")";
				return d;
			}
			if (r == AoRoboFechamento.CloseDivergencia) { divergencia = "perna " + side + " " + qty + "x × conta " + conta; d.Acao = AoSaidaAcao.SemLeitura; d.Motivo = "BROKER_INTERNAL_DIVERGENCE: " + divergencia; return d; }
			d.Acao = AoSaidaAcao.SemLeitura; d.Motivo = "posicao ilegivel"; return d;
		}
#endif
		static bool B(JToken t) { return t != null && t.Type == JTokenType.Boolean && (bool)t; }
		static bool Enviado(JObject e) { return (e["x_order_id"] != null && e["x_order_id"].Type == JTokenType.String) || (e["x_enviada"] != null && e["x_enviada"].Type != JTokenType.Null); }

		/// <summary>Executor emulado (= laco do ExecutarSaida). Uma leitura de posicao/ordens por conta ANTES do laco, como no robo.</summary>
		public void Exec(string motivo, bool retry, bool soPendentes)
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
			List<JObject> ger = Legs.Where(e => !B(e["fechada"])).ToList();
			if (soPendentes) ger = ger.Where(Enviado).ToList();
			if (ger.Count == 0) return;
			var pos = new Dictionary<string, AoPositionState>(); var ords = new Dictionary<string, JArray>();
			foreach (string acc in ger.Select(e => (string)e["nt8_account"]).Distinct()) { pos[acc] = PosState(acc); ords[acc] = OrdersJson(acc); }
			var dec = new Dictionary<JObject, AoSaidaDecisao>(); var div = new Dictionary<JObject, string>();
#if STAGING
			var saldos = new Dictionary<string, KeyValuePair<int, bool>>();
			foreach (JObject e in ger) { bool c; int s = Fe.SaldoPerna((string)e["intentId"], (string)e["side"], (int)e["qty"], out c); saldos[(string)e["intentId"]] = new KeyValuePair<int, bool>(s, c); }
			List<AoPlanoPerna> plano = AoRoboSaida.PlanejarSaidas(ger, a => pos[a], a => ords[a], e => saldos[(string)e["intentId"]], Now);
			foreach (AoPlanoPerna pp in plano) { dec[pp.E] = pp.D; div[pp.E] = pp.Divergencia; }
#else
			foreach (JObject e in ger) { string dv; AoSaidaDecisao d0 = AoRoboSaida.Decidir(e, pos[(string)e["nt8_account"]], ords[(string)e["nt8_account"]]); d0 = RevalidarCloseBase(e, pos[(string)e["nt8_account"]], ords[(string)e["nt8_account"]], d0, Now, out dv); dec[e] = d0; div[e] = dv; }
#endif
			// invariante do plano: soma dos fechamentos por conta/instrumento/lado <= posicao lida
			foreach (var g in ger.Where(e => dec[e].Acao == AoSaidaAcao.Fechar || dec[e].Acao == AoSaidaAcao.CancelarEFechar).GroupBy(e => (string)e["nt8_account"] + "|" + (string)e["instrumento"] + "|" + (string)e["side"]))
			{
				JObject f = g.First(); int p = P((string)f["nt8_account"], (string)f["instrumento"]); int lado = (string)f["side"] == "LONG" ? Math.Max(0, p) : Math.Max(0, -p);
				if (g.Sum(e => dec[e].QtyFechar) > lado) PlanOverPosition++;
			}
			foreach (JObject e in ger)
			{
				AoSaidaDecisao d = dec[e]; string acc = (string)e["nt8_account"], instr = (string)e["instrumento"], intent = (string)e["intentId"];
				Log.Add(Now.ToString("HH:mm:ss", ci) + " " + motivo + " " + intent + " => " + d.Acao + " q" + d.QtyFechar + " | " + d.Motivo);
				if (div[e] != null) { Divergences++; try { if (Al.Ativar("broker_divergence", acc, instr, intent, 1, Now)) Alerts.Add("broker_divergence:" + intent); } catch { } }
				switch (d.Acao)
				{
					case AoSaidaAcao.Verificada: e["fechada"] = true; break;
					case AoSaidaAcao.JaFechada: e["fechada"] = true; e["desvio"] = true; CancelProtection(e); break;
					case AoSaidaAcao.Aguardar:
						{ DateTime? env = AoMotorCanonico.ParseIso(e["x_enviada"]); if (env.HasValue && (Now - env.Value).TotalSeconds > 60) { try { if (Al.Ativar("close_unconfirmed", acc, instr, intent, 1, Now)) Alerts.Add("close_unconfirmed:" + intent); } catch { } } }
						break;
					case AoSaidaAcao.SemLeitura: try { if (Al.Ativar("flatten_fail", acc, instr, intent, 1, Now)) Alerts.Add("flatten_fail:" + intent); } catch { } break;
					case AoSaidaAcao.CancelarEFechar:
					case AoSaidaAcao.Fechar:
						{
							if (ClosedLegs.Contains(intent)) ClosesAfterClosed++;
							if (d.Acao == AoSaidaAcao.CancelarEFechar) CancelProtection(e);
							if (Enviado(e)) Resends++;
							string nomeX = AoRoboSaida.NomeFechamento((string)e["order_name"]);
							string oid = Place(acc, instr, d.AcaoOrdem, d.QtyFechar, nomeX);
							e["x_order_id"] = oid; e["x_enviada"] = AoMotorCanonico.Iso(Now); e["x_tentativas"] = (e["x_tentativas"] == null ? 0 : (int)e["x_tentativas"]) + 1;
							string est = null;
#if STAGING
							{ bool c; if (Fe.SaldoPerna(intent, (string)e["side"], (int)e["qty"], out c) <= 0 && c) est = "Filled";
							  else { bool xa, xf, xt; string xu; int xq; AoRoboSaida.EstadoFechamentoPorNome(OrdersJson(acc), nomeX, out xa, out xf, out xt, out xu, out xq); est = xf ? "Filled" : xu; } }
#else
							{ JObject o = OrdersJson(acc).OfType<JObject>().FirstOrDefault(x => (string)x["orderId"] == oid); est = o != null ? (string)o["state"] : "Initialized"; }   // id trocado: o robo so viu o estado inicial
#endif
							e["x_estado"] = est;
							if (est == "Filled") e["fechada"] = true;
							break;
						}
				}
			}
			foreach (JObject e in Legs.Where(x => B(x["fechada"])).ToList()) { ClosedLegs.Add((string)e["intentId"]); Legs.Remove(e); }
		}
#if RIG
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
		public void Tick(bool motorPosicionado)
		{
			Now = Now.AddSeconds(20); StepOrders(); Deliver();
			if (!motorPosicionado) { if (Legs.Count > 0) Exec("flatten_retry", true, false); }
#if RIG
			else if ((bool)Rig.M("TemSaidaPendenteEnviada").Invoke(null, null)) Exec("flatten_retry", true, true);   // C5 — guarda REAL
#elif STAGING
			else if (Legs.Any(e => Enviado(e) && !B(e["fechada"]))) Exec("flatten_retry", true, true);   // C5
#endif
		}
	}

	const string REAL = "TAKEPROFIT-REAL", SIM = "Sim-001";
#if RIG
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
	static World New0(bool idSwap, string tmp, string tag) { var w = new World { IdSwap = idSwap }; w.Fe = new AoRoboFechamento(Path.Combine(tmp, "fe-" + tag + "-" + Guid.NewGuid().ToString("N") + ".json")); w.Al = new AoRoboAlertas(Path.Combine(tmp, "al-" + tag + "-" + Guid.NewGuid().ToString("N") + ".json")); return w; }

	static JObject Res(string id, string nome, World w, bool pass, string detalhe, string acc = REAL, string instr = "MES 12-26")
	{
		return new JObject { { "id", id }, { "nome", nome }, { "pass", pass }, { "detalhe", detalhe }, { "pos_final", w.P(acc, instr) }, { "inversao", w.Inversion }, { "fechamentos", w.Closes }, { "qty_fechada", w.CloseQty },
			{ "reenvios", w.Resends }, { "plano_acima_da_posicao", w.PlanOverPosition }, { "fech_com_conta_flat_ou_oposta", w.ClosesWhenFlatOrOpposite }, { "fech_apos_encerrada", w.ClosesAfterClosed },
			{ "pernas_restantes", w.Legs.Count }, { "divergencias", w.Divergences }, { "alertas", new JArray(w.Alerts.ToArray()) }, { "log", new JArray(w.Log.Skip(Math.Max(0, w.Log.Count - 14)).ToArray()) } };
	}
	/// <summary>I1/I2/I3/I5 comuns: sem inversao, plano nunca acima da posicao, nenhum fechamento com conta FLAT/oposta, nenhum fechamento de perna ja encerrada.</summary>
	static bool Inv(World w) { return !w.Inversion && w.PlanOverPosition == 0 && w.ClosesWhenFlatOrOpposite == 0 && w.ClosesAfterClosed == 0; }

	/// <summary>Cadeia do incidente: entrada A → saida de A com REABERTURA no mesmo ciclo (B) → N ciclos posicionado → saida de B → ciclos FLAT.</summary>
	static World Reentrada(bool idSwap, string side, string instr, int qty, string tmp, string closeMode = "fill", int modeCount = 0)
	{
		World w = New(idSwap, tmp, "re"); if (modeCount > 0) { w.CloseMode = closeMode; w.CloseModeCount = modeCount; }
		w.Open("A", side, REAL, instr, qty); w.Tick(true); w.Tick(true);
		w.Exec("trailing_stop_nq", false, false);              // saida de A …
		w.Open("B", side, REAL, instr, qty);                   // … e reabertura no MESMO ciclo
		for (int i = 0; i < 4; i++) w.Tick(true);
		w.Exec("anchor_neutro", false, false);                 // saida de B
		for (int i = 0; i < 6; i++) w.Tick(false);
		return w;
	}
	static World Simples(bool idSwap, string side, string instr, int qty, string tmp, string motivo, string closeMode = "fill", int modeCount = 0, int ticksDepois = 8)
	{
		World w = New(idSwap, tmp, "si"); if (modeCount > 0) { w.CloseMode = closeMode; w.CloseModeCount = modeCount; }
		w.Open("A", side, REAL, instr, qty); w.Tick(true); w.Tick(true);
		w.Exec(motivo, false, false);
		for (int i = 0; i < ticksDepois; i++) w.Tick(false);
		return w;
	}

	public static string Run()
	{
		string tmp = Environment.GetEnvironmentVariable("EXIT_TMP"); if (string.IsNullOrEmpty(tmp)) tmp = Path.GetTempPath();
		tmp = Path.Combine(tmp, "exit-harness-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(tmp);
		var R = new JArray(); World w;
		Action<string, string, Func<World>, Func<World, bool>, string, string> T = (id, nome, mk, ok, acc, instr) =>
		{
			try { World x = mk(); R.Add(Res(id, nome, x, ok(x), "", acc ?? REAL, instr ?? "MES 12-26")); }
			catch (Exception ex) { R.Add(new JObject { { "id", id }, { "nome", nome }, { "pass", false }, { "detalhe", "EXCECAO: " + (ex.InnerException ?? ex).Message } }); }
		};
		T("T01", "LONG → saida → reentrada mesmo ciclo → saida (ids modelo real)", () => Reentrada(true, "LONG", "MES 12-26", 3, tmp), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T02", "SHORT → saida → reentrada mesmo ciclo → saida", () => Reentrada(true, "SHORT", "MES 12-26", 3, tmp), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T03", "trailing stop + reentrada, MNQ x2", () => Reentrada(true, "LONG", "MNQ 12-26", 2, tmp), x => Inv(x) && x.P(REAL, "MNQ 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 4, null, "MNQ 12-26");
		T("T04", "anchor_neutro sem reentrada (ids modelo real)", () => Simples(true, "LONG", "MES 12-26", 3, tmp, "anchor_neutro"), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.Closes == 1, null, null);
		T("T05", "saida comum sem reentrada (ids modelo Sim)", () => Simples(false, "SHORT", "MES 12-26", 3, tmp, "anchor_neutro"), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.Closes == 1, null, null);
		T("T06", "confirmacao rapida: perna sai do registro no proprio ciclo da saida", () => { World x = New(true, tmp, "t6"); x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Exec("anchor_neutro", false, false); return x; }, x => Inv(x) && x.Legs.Count == 0 && x.P(REAL, "MES 12-26") == 0, null, null);
		T("T07", "confirmacao atrasada: ordem fica Working por 2 ciclos, nao duplica", () => Simples(true, "LONG", "MES 12-26", 3, tmp, "anchor_neutro", "working", 1), x => Inv(x) && x.Closes == 1 && x.Resends == 0 && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0, null, null);
		T("T08", "ExecutionUpdate do fechamento PERDIDO, com reentrada no mesmo ciclo", () => Reentrada(true, "LONG", "MES 12-26", 3, tmp, "noevent", 1), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T08b", "ExecutionUpdate do fechamento ATRASADO 45 s, com reentrada", () => Reentrada(true, "LONG", "MES 12-26", 3, tmp, "lateevent", 1), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T09", "fill parcial (metade) + cancelamento do resto: fecha so o saldo", () => Simples(true, "LONG", "MES 12-26", 4, tmp, "anchor_neutro", "partial", 1), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6 && x.Closes == 2, null, null);
		T("T10", "ordem de fechamento nao encontrada (sumiu): nunca reenvia; alerta > 60 s", () => Simples(true, "LONG", "MES 12-26", 3, tmp, "anchor_neutro", "vanish", 1), x => Inv(x) && x.Closes == 1 && x.Resends == 0 && x.Alerts.Any(a => a.StartsWith("close_unconfirmed")), null, null);
		T("T11", "corretora ja FLAT na saida (stop/manual zerou): nenhuma ordem", () => { World x = New(true, tmp, "t11"); JObject e = x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Pos[REAL + "|MES 12-26"] = 0; x.Exec("anchor_neutro", false, false); for (int i = 0; i < 4; i++) x.Tick(false); return x; }, x => Inv(x) && x.Closes == 0 && x.Legs.Count == 0, null, null);
		T("T12", "corretora no lado OPOSTO: nenhuma ordem, divergencia", () => { World x = New(true, tmp, "t12"); x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Pos[REAL + "|MES 12-26"] = -3; x.Exec("anchor_neutro", false, false); for (int i = 0; i < 3; i++) x.Tick(false); return x; }, x => !x.Inversion && x.Closes == 0 && x.Divergences > 0 && x.P(REAL, "MES 12-26") == -3, null, null);
		T("T13", "MES x3 reentrada", () => Reentrada(true, "LONG", "MES 12-26", 3, tmp), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0, null, null);
		T("T14", "MNQ x2 reentrada SHORT", () => Reentrada(true, "SHORT", "MNQ 12-26", 2, tmp), x => Inv(x) && x.P(REAL, "MNQ 12-26") == 0 && x.Legs.Count == 0, null, "MNQ 12-26");
		T("T15", "modelo de ids da conta real (id listado ≠ id do envio)", () => Reentrada(true, "LONG", "MES 12-26", 3, tmp), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T16", "modelo de ids Sim (id estavel)", () => Reentrada(false, "LONG", "MES 12-26", 3, tmp), x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T17", "retry apos REJECTED comprovado", () => Simples(true, "LONG", "MES 12-26", 3, tmp, "anchor_neutro", "reject", 1), x => Inv(x) && x.Closes == 2 && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0, null, null);
		T("T18", "retry apos CANCELLED comprovado", () => Simples(true, "LONG", "MES 12-26", 3, tmp, "anchor_neutro", "cancel", 1), x => Inv(x) && x.Closes == 2 && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0, null, null);
		T("T19", "ordem UNKNOWN/ACTIVE nao reenvia (com reentrada e fechamento sumido)", () => Reentrada(true, "LONG", "MES 12-26", 3, tmp, "vanish", 1), x => Inv(x) && x.Resends == 0, null, null);
		T("T20", "restart com perna pendente (registro e execucoes recarregados do disco)", () =>
		{
			World x = New(true, tmp, "t20"); x.CloseMode = "working"; x.CloseModeCount = 1; /* fechamento de A fica Working: perna A PENDENTE no reinicio */ x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Exec("trailing_stop_nq", false, false); x.Open("B", "LONG", REAL, "MES 12-26", 3);
			string fePath = Directory.GetFiles(tmp, "fe-t20-*.json").First(); x.Fe = new AoRoboFechamento(fePath);                       // "reinicio": recarrega _fills do disco
#if RIG
			Rig.Robo.GetField("_fechamento", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static).SetValue(null, x.Fe);
			Rig.M("GravarExecucoes").Invoke(null, null); x.Legs.Clear(); Rig.M("CarregarExecucoes").Invoke(null, null);   // registro REAL: grava e recarrega o arquivo de execucoes
			if (x.Legs.Count != 2) throw new Exception("recarga do registro: " + x.Legs.Count);
#else
			var legs = JArray.Parse(new JArray(x.Legs.ToArray()).ToString()); x.Legs.Clear(); foreach (JToken t in legs) x.Legs.Add((JObject)t);   // recarrega o registro de pernas
#endif
			for (int i = 0; i < 3; i++) x.Tick(true); x.Exec("anchor_neutro", false, false); for (int i = 0; i < 5; i++) x.Tick(false); return x;
		}, x => Inv(x) && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0 && x.CloseQty == 6, null, null);
		T("T21", "stop da propria perna executado na corretora", () => { World x = New(true, tmp, "t21"); JObject e = x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.ProtectionFills(e, "|S", true); x.Exec("anchor_neutro", false, false); for (int i = 0; i < 3; i++) x.Tick(false); return x; }, x => Inv(x) && x.Closes == 0 && x.Legs.Count == 0 && x.P(REAL, "MES 12-26") == 0, null, null);
		T("T22", "take da propria perna executado (sem evento de execucao)", () => { World x = New(true, tmp, "t22"); JObject e = x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.ProtectionFills(e, "|T", false); x.Exec("anchor_neutro", false, false); for (int i = 0; i < 4; i++) x.Tick(false); return x; }, x => Inv(x) && x.Closes == 0 && x.Legs.Count == 0 && x.P(REAL, "MES 12-26") == 0, null, null);
		T("T23", "posicao alheia/manual no mesmo lado: robo fecha so o proprio saldo", () => { World x = New(true, tmp, "t23"); x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Pos[REAL + "|MES 12-26"] = 5; x.Tick(true); x.Exec("anchor_neutro", false, false); for (int i = 0; i < 5; i++) x.Tick(false); return x; }, x => Inv(x) && x.CloseQty == 3 && x.P(REAL, "MES 12-26") == 2 && x.Legs.Count == 0, null, null);
		T("T23b", "posicao alheia + perna antiga ja zerada e nao verificada (via 2 do dossie)", () =>
		{
			World x = New(true, tmp, "t23b"); x.CloseMode = "noevent"; x.CloseModeCount = 1; x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Exec("anchor_neutro", false, false);
			x.Pos[REAL + "|MES 12-26"] = 2;   // operador abre 2 manualmente logo depois
			for (int i = 0; i < 5; i++) x.Tick(false); return x;
		}, x => Inv(x) && x.CloseQty == 3 && x.P(REAL, "MES 12-26") == 2, null, null);
		T("T24", "duas pernas ABERTAS na mesma conta/instrumento: fecha as duas, soma = posicao", () => { World x = New(true, tmp, "t24"); x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Open("B", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Exec("anchor_neutro", false, false); for (int i = 0; i < 4; i++) x.Tick(false); return x; }, x => Inv(x) && x.CloseQty == 6 && x.P(REAL, "MES 12-26") == 0 && x.Legs.Count == 0, null, null);
		T("T25", "divergencia corretora × estado interno gera alerta", () => { World x = New(true, tmp, "t25"); x.Open("A", "LONG", REAL, "MES 12-26", 3); x.Tick(true); x.Pos[REAL + "|MES 12-26"] = -3; x.Exec("anchor_neutro", false, false); return x; }, x => x.Closes == 0 && x.Alerts.Any(a => a.StartsWith("broker_divergence")) && File.Exists(x.Al.Arquivo), null, null);
		T("T26", "fechamento nao confirmado > 60 s gera alerta", () => Simples(true, "LONG", "MES 12-26", 3, tmp, "anchor_neutro", "vanish", 1), x => x.Alerts.Any(a => a.StartsWith("close_unconfirmed")) && x.Resends == 0, null, null);
#if RIG
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
		string modo = "STAGING";
#else
		string modo = "BASE";
#endif
		return new JObject { { "modo", modo }, { "total", R.Count }, { "pass", R.Count(t => (bool)t["pass"]) }, { "testes", R } }.ToString(Newtonsoft.Json.Formatting.None);
	}
}
