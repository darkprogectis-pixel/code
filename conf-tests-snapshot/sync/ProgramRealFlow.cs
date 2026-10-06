// PROTECTION_MANDATORY test_real_flow (2026-10-02) — PM1–PM14, C1–C13, T2e sobre os metodos REAIS do AlfaOmegaRobo.cs (extraidos por
// gen_real_flow_harness.js) + AoRoboFechamento/AoRoboSaida/AoProtecaoFill/AoTakeEscort/AoMotorCanonico REAIS; stub so do broker (RealFlowStubs.cs).
// Chamadas por reflexao: o MESMO programa roda contra o LIVE (controle) — metodo ausente = N/A. Tempo: carencia/janela simuladas
// envelhecendo protecao_t0/protecao_falha_t0 no registro (o codigo usa DateTime.UtcNow); ConfirmarCancel/EsperarFilled rodam em tempo real.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using Newtonsoft.Json.Linq;
using NinjaTrader.NinjaScript.AddOns;
using SS = NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState;

namespace NinjaTrader.NinjaScript.AddOns
{
	public static partial class AlfaOmegaRoboSim
	{
		private static string ExecucoesFile { get { return Path.Combine(Path.GetTempPath(), "real_flow_execucoes_" + System.Diagnostics.Process.GetCurrentProcess().Id + ".json"); } }
		private static long _ticksMotor;
		public static readonly List<string> PernaEventos = new List<string>();
		private static void PernaSaida(string intentId, string evento, DateTime agora, string detalhe) { lock (PernaEventos) PernaEventos.Add(intentId + "|" + evento); }
		// (2026-10-02, G14) stub do que fala com o NT8 (Account.ConnectionStatus / Connection.PriceStatus): o teste escreve aqui.
		public static readonly Dictionary<string, bool?> ConexaoConta = new Dictionary<string, bool?>(StringComparer.OrdinalIgnoreCase);
		public static readonly Dictionary<string, bool?> ConexaoPreco = new Dictionary<string, bool?>(StringComparer.OrdinalIgnoreCase);
		private static void LerConexoes(List<string> accs, out Dictionary<string, bool?> conta, out Dictionary<string, bool?> preco)
		{
			conta = new Dictionary<string, bool?>(ConexaoConta, StringComparer.OrdinalIgnoreCase); preco = new Dictionary<string, bool?>(ConexaoPreco, StringComparer.OrdinalIgnoreCase);
		}
	}
}

static class ProgramRealFlow
{
	static int pass, fail, na;
	static readonly Dictionary<string, string> Status = new Dictionary<string, string>();
	static readonly Type S = typeof(AlfaOmegaRoboSim), F = typeof(AoRoboFechamento);
	const BindingFlags BF = BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public;
	static object Call(string m, params object[] a)
	{
		MethodInfo mi = S.GetMethod(m, BF); if (mi == null) throw new MissingMethodException(m);
		try { return mi.Invoke(null, a); } catch (TargetInvocationException ex) { throw ex.InnerException; }
	}
	static object FCall(string m, params object[] a)
	{
		MethodInfo mi = F.GetMethod(m, BF); if (mi == null) throw new MissingMethodException("AoRoboFechamento." + m);
		try { return mi.Invoke(null, a); } catch (TargetInvocationException ex) { throw ex.InnerException; }
	}
	static T Campo<T>(string f) { FieldInfo fi = S.GetField(f, BF); return fi == null ? default(T) : (T)fi.GetValue(null); }
	static object Gate { get { return Campo<object>("_protGate") ?? new object(); } }
	static List<JObject> Execs { get { return Campo<List<JObject>>("_execucoes"); } }
	static Dictionary<string, JObject> Orfaos { get { return Campo<Dictionary<string, JObject>>("_fillsOrfaos"); } }
	static HashSet<string> EmCurso { get { return Campo<HashSet<string>>("_protEmCurso"); } }
	static JObject Reg(string id) { lock (Gate) return Execs.FirstOrDefault(x => (string)x["intentId"] == id); }

	static void Res(string nome, bool ok, string det)
	{
		if (ok) pass++; else fail++;
		string k = nome.Split(' ')[0]; Status[k] = Status.ContainsKey(k) && Status[k] != "PASS" ? Status[k] : (ok ? "PASS" : "FAIL");
		Console.WriteLine((ok ? "PASS " : "FAIL ") + nome + (det == null ? "" : "   [" + det + "]"));
	}
	static void Teste(string id, string titulo, Action corpo)
	{
		Reset();
		try { corpo(); }
		catch (MissingMethodException ex) { na++; Status[id] = "N/A"; Console.WriteLine("N/A  " + id + " " + titulo + "   [ausente na fonte: " + ex.Message + "]"); }
		catch (Exception ex) { Res(id + " " + titulo, false, "EXCECAO " + ex.GetType().Name + ": " + ex.Message); }
	}
	static string Inv() { lock (Corretora.G) return "I1viol=" + Corretora.ViolI1 + " I2viol=" + Corretora.ViolI2 + " ocoReuso=" + Corretora.OcoReuso + " maxStops=" + Corretora.MaxStopsAtivos; }
	static bool InvOk() { lock (Corretora.G) return Corretora.ViolI1 == 0 && Corretora.ViolI2 == 0 && Corretora.OcoReuso == 0; }
	static void Reset()
	{
		lock (Gate) { Execs.Clear(); Orfaos.Clear(); if (EmCurso != null) EmCurso.Clear(); }
		lock (AoRoboAudit.Eventos) AoRoboAudit.Eventos.Clear();
		Corretora.Reset();
		AoRoboPositions.Falha = false; AoRoboPositions.AgeMs = 0; AoRoboPositions.Congelada = null; AoRoboPositions.Sobrescrita = null;
		SS.LastPrice_ES = 6000; SS.LastPrice_NQ = 21000;
		// (G8/G13/G14) estado estatico novo — so quando existe na fonte (o live-controle nao tem)
		FieldInfo fa = S.GetField("_alertas", BF); if (fa != null) fa.SetValue(null, null);
		FieldInfo fb = S.GetField("_bootGarantiaPendente", BF); if (fb != null) fb.SetValue(null, false);
		var ce = Campo<Dictionary<string, bool>>("_conexaoEstado"); if (ce != null) lock (ce) ce.Clear();
		AlfaOmegaRoboSim.ConexaoConta.Clear(); AlfaOmegaRoboSim.ConexaoPreco.Clear();
		lock (Notifs) Notifs.Clear();
	}

	// ── (2026-10-02) G8/G13/G14 — AoRoboAlertas por reflexao (ausente no Fechamento live-controle ⇒ N/A) ──
	static readonly List<string> Notifs = new List<string>();
	static Type AL { get { Type t = typeof(ProgramRealFlow).Assembly.GetType("NinjaTrader.NinjaScript.AddOns.AoRoboAlertas"); if (t == null) throw new MissingMethodException("AoRoboAlertas"); return t; } }
	static object ACall(object inst, string m, params object[] a)
	{
		MethodInfo mi = AL.GetMethod(m, BF | BindingFlags.Instance); if (mi == null) throw new MissingMethodException("AoRoboAlertas." + m);
		try { return mi.Invoke(inst, a); } catch (TargetInvocationException ex) { throw ex.InnerException; }
	}
	static int ACount(object al) { return (int)AL.GetProperty("Count").GetValue(al, null); }
	static string TmpAlertas() { return Path.Combine(Path.GetTempPath(), "rf_alertas_" + Guid.NewGuid().ToString("N") + ".json"); }
	static void SetCampo(string f, object v) { FieldInfo fi = S.GetField(f, BF); if (fi == null) throw new MissingMethodException(f); fi.SetValue(null, v); }
	/// <summary>Instala um AoRoboAlertas real (arquivo temporario) no robo + Notificar contando em Notifs.</summary>
	static object InstalarAlertas(out string arquivo)
	{
		arquivo = TmpAlertas();
		object al = Activator.CreateInstance(AL, arquivo);
		SetCampo("_alertas", al);
		AL.GetField("Notificar", BF).SetValue(null, (Action<string>)(k => { lock (Notifs) Notifs.Add(k); }));
		return al;
	}
	static int NNotif() { lock (Notifs) return Notifs.Count; }
	static JObject LerAlertas(string f) { try { return JObject.Parse(File.ReadAllText(f)); } catch { return null; } }

	// ── fixtures ──
	static JObject Perna(string id, string acc, string instr, string ativo, string side, int qty, double entrada, double tick)
	{
		string fam = ativo.Contains("NQ") ? "NQ" : "ES";
		double pts = fam == "NQ" ? 50 : 20;
		double nivel = side == "LONG" ? entrada - pts : entrada + pts;
		double? arred = AoRoboAtivos.ArredondarStop(ativo, nivel, side);
		var e = new JObject { { "intentId", id }, { "conta", "c1" }, { "nt8_account", acc }, { "instrumento", instr }, { "familia", fam }, { "ativo", ativo },
							  { "side", side }, { "qty", qty }, { "order_name", "AO|c1|" + id }, { "stop_level", arred ?? nivel }, { "take_pt", AoRoboConfig.TakePtDe(ativo) },
							  { "tick", tick }, { "mult_familia", AoRoboConfig.MultFamiliaDe(ativo) }, { "qty_protegida", 0 },
							  { "registrada_utc", AoMotorCanonico.Iso(DateTime.UtcNow.AddSeconds(-60)) } };
		Corretora.LadoPerna[id] = side == "LONG" ? 1 : -1; Corretora.InstrPerna[id] = acc + "|" + instr;
		return e;
	}
	static JObject Abrir(string id, string acc = "Sim101", string instr = "MES 12-26", string ativo = "MES", string side = "LONG", int qty = 3, int fill = -1, double entrada = 6000, double tick = 0.25)
	{
		if (fill < 0) fill = qty;
		JObject e = Perna(id, acc, instr, ativo, side, qty, entrada, tick);
		Call("RegistrarExecucao", e);
		Corretora.Entrada(acc, instr, (side == "LONG" ? 1 : -1) * fill);
		Call("OnFillEntrada", id, instr, "c1", fill, entrada, DateTime.UtcNow);
		return e;
	}
	/// <summary>Envelhece o registro (carencia/janela W3) — simula a passagem de ms sem dormir.</summary>
	static void Envelhecer(JObject e, double ms)
	{
		lock (Gate)
			foreach (string k in new[] { "protecao_t0", "protecao_falha_t0" })
			{
				DateTime? t = AoMotorCanonico.ParseIso(e[k]);
				if (t.HasValue) e[k] = AoMotorCanonico.Iso(t.Value.AddMilliseconds(-ms));
			}
	}
	static void Tick(DateTime? agora = null) { Call("GarantirProtecao", agora ?? DateTime.UtcNow); }
	static void TickEnvelhecido(params JObject[] es) { foreach (var e in es) Envelhecer(e, 2000); Tick(); }
	static List<Ordem> Ativas(string id, string tipo = null) { lock (Corretora.G) return Corretora.Ordens.Where(o => Corretora.Ativa(o.Estado) && Corretora.PernaDoOco(o.Oco) == id && (tipo == null || o.Tipo == tipo)).ToList(); }
	static Ordem Ord(string id, string tipo, string oco) { lock (Corretora.G) return Corretora.Ordens.LastOrDefault(o => Corretora.PernaDoOco(o.Oco) == id && o.Tipo == tipo && (oco == null || o.Oco == oco)); }
	static int[] Cont() { lock (Corretora.G) return new[] { Corretora.Brackets, Corretora.Places, Corretora.Cancels, Corretora.Changes }; }
	static int Delta(int[] a) { int[] b = Cont(); return (b[0] - a[0]) + (b[1] - a[1]) + (b[2] - a[2]) + (b[3] - a[3]); }
	static List<AoRoboAudit.Ev> Aud(string evento) { lock (AoRoboAudit.Eventos) return AoRoboAudit.Eventos.Where(x => x.Evento == evento).ToList(); }
	static AoMotorCanonico Motor() { string d = Path.Combine(Path.GetTempPath(), "rf_motor_" + Guid.NewGuid().ToString("N")); return new AoMotorCanonico(Path.Combine(d, "m.json"), d, null); }
	static void Fechar(bool retry = false) { Call("ExecutarSaida", "CLOSE", DateTime.UtcNow, (List<AoRoboAccount>)null, retry); }
	/// <summary>Perna ja protegida por um grupo |P2 (o |P1 terminal), montada direto no livro — independe do codigo (vale para o controle).</summary>
	static JObject PernaP2(string id, int qty, bool p2StopFilled = false)
	{
		JObject e = Perna(id, "Sim101", "MES 12-26", "MES", "LONG", qty, 6000, 0.25);
		e["qty_protegida"] = qty; e["qty_preenchida"] = qty; e["entry_fill"] = 6000.0; e["oco_id"] = id + "|P2"; e["protecao_n"] = 2;
		Call("RegistrarExecucao", e);
		Corretora.Entrada("Sim101", "MES 12-26", qty);
		Corretora.Injetar("Sim101", "MES 12-26", "stopmarket", "sell", qty, 5980, 0, id + "|P1", "Rejected", "AO|c1|" + id + "|S");
		Corretora.Injetar("Sim101", "MES 12-26", "limit", "sell", qty, 0, 6060, id + "|P1", "Cancelled", "AO|c1|" + id + "|T");
		Ordem s = Corretora.Injetar("Sim101", "MES 12-26", "stopmarket", "sell", qty, 5980, 0, id + "|P2", "Accepted", "AO|c1|" + id + "|S");
		Ordem t = Corretora.Injetar("Sim101", "MES 12-26", "limit", "sell", qty, 0, 6060, id + "|P2", "Working", "AO|c1|" + id + "|T");
		e["stop_order_id"] = s.Id; e["take_order_id"] = t.Id;
		if (p2StopFilled) Corretora.Preencher(s.Id, qty);
		return e;
	}

	public static int Main(string[] args)
	{
		bool controle = args.Length > 0 && args[0] == "controle";
		Console.WriteLine("fonte: " + AlfaOmegaRoboSim.Fonte);
		Console.WriteLine("metodos reais: " + AlfaOmegaRoboSim.Presentes.Length + (AlfaOmegaRoboSim.Ausentes.Length > 0 ? " · ausentes: " + string.Join(", ", AlfaOmegaRoboSim.Ausentes) : ""));

		Teste("PM1", "P0 pre-trade", () =>
		{
			Func<double?, double?, string> p0 = (s, t) => (string)FCall("ProtecaoPreTrade", s, t);
			bool puro = p0(5980, null) != null && p0(5980, 0.0) != null && p0(5980, double.NaN) != null && p0(null, 60.0) != null && p0(5980, 60.0) == null
						&& p0(5980, null).StartsWith("blocked:sem_protecao");
			Res("PM1 P0: stop/take_pt invalidos => blocked:sem_protecao; ExecutarAlvo chama P0 antes de AoPermissao/RegistrarExecucao/ExecutarOrdem e aborta",
				puro && AlfaOmegaRoboSim.P0Ordem && AlfaOmegaRoboSim.P0Aborta, "puro=" + puro + " ordem=" + AlfaOmegaRoboSim.P0Ordem + " aborta=" + AlfaOmegaRoboSim.P0Aborta + " " + AlfaOmegaRoboSim.P0Indices);
		});

		Teste("PM2", "fill => bracket |P1; watchdog OK", () =>
		{
			JObject e = Abrir("PM2");
			Ordem s = Ord("PM2", "stopmarket", null), t = Ord("PM2", "limit", null);
			var c = Cont(); TickEnvelhecido(e); TickEnvelhecido(e);
			Res("PM2 fill => stop+take mesmo oco PM2|P1 qty 3; watchdog OK com 0 ordens", s != null && t != null && s.Oco == "PM2|P1" && t.Oco == s.Oco && s.Qty == 3 && t.Qty == 3
				&& Corretora.Ativa(s.Estado) && Corretora.Ativa(t.Estado) && Delta(c) == 0 && InvOk(), "oco=" + (s == null ? null : s.Oco) + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("PM3", "bracket rejeitado sincrono", () =>
		{
			Corretora.BracketFalhaSync = 1;
			JObject e = Abrir("PM3");
			bool semProt = Ativas("PM3").Count == 0;
			TickEnvelhecido(e); var c = Cont(); TickEnvelhecido(e);
			Ordem s = Ord("PM3", "stopmarket", null);
			Res("PM3 bracket rejeitado SINCRONO no fill => watchdog apos carencia => |P2 => protegida (OK, 0 ordens no tick seguinte)",
				semProt && s != null && s.Oco == "PM3|P2" && Ativas("PM3", "stopmarket").Count == 1 && Ativas("PM3", "limit").Count == 1 && Delta(c) == 0 && Corretora.Ativa(s.Estado) && InvOk(),
				"sem_protecao_apos_fill=" + semProt + " oco=" + (s == null ? null : s.Oco) + " " + Inv());
		});

		Teste("PM4", "stop rejeitado assincrono", () =>
		{
			JObject e = Abrir("PM4");
			Ordem s1 = Ord("PM4", "stopmarket", "PM4|P1"), t1 = Ord("PM4", "limit", "PM4|P1");
			Corretora.PorFora(s1.Id, o => o.Estado = "Rejected");
			TickEnvelhecido(e);
			Ordem s2 = Ord("PM4", "stopmarket", "PM4|P2"), t2 = Ord("PM4", "limit", "PM4|P2");
			var c = Cont(); TickEnvelhecido(e);
			Res("PM4 stop rejeitado ASSINCRONO => watchdog cancela o take |P1 (confirmado) => |P2 (OCO |P1 nunca reusado)",
				t1.Estado == "Cancelled" && s2 != null && t2 != null && Corretora.Ativa(s2.Estado) && Corretora.Ativa(t2.Estado) && Delta(c) == 0 && InvOk(),
				"take_P1=" + t1.Estado + " P2=" + (s2 != null) + " " + Inv());
		});

		Teste("PM5", "2 falhas de re-protecao => FECHAR", () =>
		{
			// (a) falhas SINCRONAS (BracketCore != 200)
			Corretora.BracketFalhaSync = 3;
			JObject e = Abrir("PM5a");
			double sim = 0; int ticks = 0;
			while (Corretora.Pos("Sim101", "MES 12-26") != 0 && ticks < 6) { TickEnvelhecido(e); sim += 2000; ticks++; }
			bool a = Corretora.Pos("Sim101", "MES 12-26") == 0 && sim <= 5000 && Ativas("PM5a", "stopmarket").Count == 0 && InvOk();
			Res("PM5a 2 re-protecoes falhas (SINCRONAS) => perna FECHADA (market) em <= 5 s da 1a falha; 0 stops; conta FLAT", a,
				"fechada_em_ms_sim=" + sim + " ticks=" + ticks + " tentativas=" + (e["protecao_tentativas"] ?? "-") + " " + Inv());
			// (b) falhas ASSINCRONAS (bracket aceito, stop rejeitado depois — G4)
			Reset();
			Corretora.StopRejeitaAssincN = 99;
			JObject e2 = Abrir("PM5b");
			sim = 0; ticks = 0;
			while (Corretora.Pos("Sim101", "MES 12-26") != 0 && ticks < 6) { TickEnvelhecido(e2); sim += 2000; ticks++; }
			int brk; lock (Corretora.G) brk = Corretora.Brackets;
			bool b = Corretora.Pos("Sim101", "MES 12-26") == 0 && sim <= 5000 + 2000 && InvOk();
			Res("PM5b 2 re-protecoes falhas (stop rejeitado ASSINCRONO apos aceite, G4) => perna FECHADA em <= 5 s (+1 ciclo); conta FLAT", b,
				"posicao_apos_" + ticks + "_ticks(" + sim + "ms_sim)=" + Corretora.Pos("Sim101", "MES 12-26") + " brackets=" + brk + " tentativas=" + (e2["protecao_tentativas"] ?? "0")
				+ " falha_t0=" + (e2["protecao_falha_t0"] ?? "null") + " oco_atual=" + e2["oco_id"] + " " + Inv());
		});

		Teste("PM6", "take cancelado por fora", () =>
		{
			JObject e = Abrir("PM6");
			Ordem s1 = Ord("PM6", "stopmarket", "PM6|P1"), t1 = Ord("PM6", "limit", "PM6|P1");
			Corretora.PorFora(t1.Id, o => o.Estado = "Cancelled");
			TickEnvelhecido(e);
			Ordem s2 = Ord("PM6", "stopmarket", "PM6|P2");
			Res("PM6 take cancelado por fora => stop |P1 cancelado+confirmado => |P2; max stops ativos = 1 no fluxo",
				s1.Estado == "Cancelled" && s2 != null && Ativas("PM6", "stopmarket").Count == 1 && Ativas("PM6", "limit").Count == 1 && Corretora.MaxStopsAtivos == 1 && InvOk(), Inv());
		});

		Teste("PM7", "fill parcial => AJUSTAR; W1", () =>
		{
			JObject e = Abrir("PM7", qty: 3, fill: 2);
			Ordem s = Ord("PM7", "stopmarket", null), t = Ord("PM7", "limit", null);
			bool q2 = s.Qty == 2 && t.Qty == 2;
			Corretora.Entrada("Sim101", "MES 12-26", 1);
			Call("OnFillEntrada", "PM7", "MES 12-26", "c1", 3, 6000.0, DateTime.UtcNow);
			bool q3 = s.Qty == 3 && t.Qty == 3;
			Corretora.PorFora(s.Id, o => o.Qty = 2);   // qty divergente por fora
			TickEnvelhecido(e);
			int brk; lock (Corretora.G) brk = Corretora.Brackets;
			Res("PM7 fill parcial 2/3 => bracket 2; 3o fill => Change para 3 (sem 2o bracket); qty divergente por fora => W1 Change",
				q2 && q3 && s.Qty == 3 && t.Qty == 3 && brk == 1 && Corretora.Ativa(s.Estado) && InvOk(), "q2=" + q2 + " q3=" + q3 + " stop_final=" + s.Qty + " brackets=" + brk + " " + Inv());
		});

		Teste("PM8", "preco alem do hard stop sem stop => FECHAR", () =>
		{
			JObject e = Abrir("PM8");
			foreach (Ordem o in Ativas("PM8")) Corretora.PorFora(o.Id, x => x.Estado = "Cancelled");
			SS.LastPrice_ES = (double)e["stop_level"] - 1;
			var c = Cont(); TickEnvelhecido(e);
			int[] d = Cont();
			Res("PM8 preco alem do hard stop sem stop ativo => FECHAR direto (sem bracket); conta FLAT",
				d[0] == c[0] && d[1] == c[1] + 1 && Corretora.Pos("Sim101", "MES 12-26") == 0 && InvOk(), "brackets+" + (d[0] - c[0]) + " places+" + (d[1] - c[1]) + " " + Inv());
		});

		Teste("PM9", "ilegivel", () =>
		{
			JObject e = Abrir("PM9");
			foreach (Ordem o in Ativas("PM9")) Corretora.PorFora(o.Id, x => x.Estado = "Cancelled");   // mesmo SEM protecao: ilegivel nao age
			Envelhecer(e, 2000);
			Corretora.OrdersFalha = true;
			DateTime t0 = DateTime.UtcNow; var c = Cont();
			Tick(t0); var r1 = Aud("protecao_ilegivel").Select(x => x.Result).ToList();
			Tick(t0.AddSeconds(31)); var r2 = Aud("protecao_ilegivel").Select(x => x.Result).ToList();
			Tick(t0.AddSeconds(40)); int n3 = Aud("protecao_ilegivel").Count;
			Tick(t0.AddSeconds(92)); int n4 = Aud("protecao_ilegivel").Count;
			bool ordens = r1.Count == 1 && r1[0] == "critical:protecao_ilegivel" && r2.Count == 2 && r2[1] == "critical:protection_unverifiable" && n3 == 2 && n4 == 3 && Delta(c) == 0;
			Corretora.OrdersFalha = false; AoRoboPositions.Falha = true;
			var c2 = Cont(); Tick(t0.AddSeconds(200));
			bool pos = Delta(c2) == 0 && Aud("protecao_ilegivel").Count == 4;
			Res("PM9 ordens ilegiveis / posicao ilegivel => nenhuma ordem; critical:protecao_ilegivel; >30 s protection_unverifiable; throttle 60 s",
				ordens && pos && InvOk(), "ordens=" + ordens + " [" + string.Join(",", r2) + "] n3=" + n3 + " n4=" + n4 + " posicao=" + pos);
		});

		Teste("PM10", "CLOSE com grupo |P2", () =>
		{
			JObject e = PernaP2("PM10", 3);
			Fechar();
			int stops = Ativas("PM10", "stopmarket").Count, takes = Ativas("PM10", "limit").Count;
			Res("PM10 CLOSE com |P2 ativo => helper acha o stop |P2 => cancel por ids => fecha; 0 stops vivos, conta FLAT",
				stops == 0 && takes == 0 && Corretora.Pos("Sim101", "MES 12-26") == 0 && InvOk(), "stops_vivos=" + stops + " takes_vivos=" + takes + " pos=" + Corretora.Pos("Sim101", "MES 12-26") + " " + Inv());
		});

		Teste("PM11", "NES tick 0.5", () =>
		{
			JObject e = Abrir("PM11", instr: "NES 12-26", ativo: "NES", tick: 0.5);
			double nivel = (double)e["stop_level"];
			bool noTick = Math.Abs(nivel / 0.5 - Math.Round(nivel / 0.5)) < 1e-9 && AoRoboAtivos.ArredondarStop("NES", 5980.3, "LONG") == 5980.0;
			Ordem s = Ord("PM11", "stopmarket", "PM11|P1");
			Corretora.PorFora(s.Id, o => o.Stop = nivel - 0.25);
			var c = Cont(); TickEnvelhecido(e); bool ok025 = Delta(c) == 0;
			Corretora.PorFora(s.Id, o => o.Stop = nivel - 0.75);
			TickEnvelhecido(e);
			Ordem s2 = Ord("PM11", "stopmarket", "PM11|P2");
			Res("PM11 NES: stop no tick 0.5; stop a 0.25 do nivel = OK; a 0.75 = REPROTEGER (|P2 no nivel)",
				noTick && ok025 && s2 != null && Math.Abs(s2.Stop - nivel) < 1e-9 && s.Estado == "Cancelled" && InvOk(), "nivel=" + nivel + " ok_0.25=" + ok025 + " P2=" + (s2 == null ? "-" : s2.Stop.ToString(CultureInfo.InvariantCulture)) + " " + Inv());
		});

		Teste("PM12", "stop FILLED + cache aberto", () =>
		{
			S.GetMethod("GarantirProtecao", BF).ToString();   // controle: sem watchdog => N/A
			JObject e = Abrir("PM12");
			Ordem s = Ord("PM12", "stopmarket", null);
			Corretora.Preencher(s.Id, 3);
			AoRoboPositions.Congelada = new Dictionary<string, int> { { "Sim101|MES 12-26", 3 } };
			var c = Cont(); TickEnvelhecido(e); TickEnvelhecido(e);
			Res("PM12 stop do broker FILLED + cache de posicao ainda aberto => 0 ordens (E1)", Delta(c) == 0 && Corretora.Pos("Sim101", "MES 12-26") == 0 && InvOk(), "delta=" + Delta(c) + " " + Inv());
		});

		Teste("PM13", "stop PartFilled", () =>
		{
			JObject e = Abrir("PM13");
			Ordem s = Ord("PM13", "stopmarket", null), t = Ord("PM13", "limit", null);
			Corretora.Preencher(s.Id, 1);
			int b0; lock (Corretora.G) b0 = Corretora.Brackets;
			TickEnvelhecido(e); TickEnvelhecido(e);
			int b1; lock (Corretora.G) b1 = Corretora.Brackets;
			Res("PM13 stop PartFilled => nenhum bracket novo; so Change do take do MESMO grupo para o restante (2)",
				b1 == b0 && t.Qty == 2 && s.Estado == "PartFilled" && Corretora.Ativa(t.Estado) && InvOk(), "brackets+" + (b1 - b0) + " take_qty=" + t.Qty + " " + Inv());
		});

		Teste("PM14", "so o take sumiu", () =>
		{
			JObject e = Abrir("PM14");
			Ordem t1 = Ord("PM14", "limit", "PM14|P1");
			Corretora.PorFora(t1.Id, o => o.Estado = "Rejected");
			TickEnvelhecido(e);
			var ev = Aud("protecao_reprotegida");
			JToken jan = ev.Count == 1 ? ev[0].Payload["janela_sem_stop_ms"] : null;
			double med; Corretora.JanelaSemStopMs.TryGetValue("PM14", out med);
			Res("PM14 so o take sumiu => substitui o par; 0 momentos com 2 stops; janela_sem_stop_ms auditada e medida",
				ev.Count == 1 && jan != null && Corretora.MaxStopsAtivos == 1 && Ativas("PM14", "stopmarket").Count == 1 && Ativas("PM14", "limit").Count == 1 && InvOk(),
				"janela_auditada_ms=" + jan + " janela_medida_livro_ms=" + med.ToString("0.0", CultureInfo.InvariantCulture) + " " + Inv());
			Console.WriteLine("JANELA_SEM_STOP_MS auditada=" + jan + " medida=" + med.ToString("0.0", CultureInfo.InvariantCulture));
		});

		var seis = new[] { new[] { "C-ES", "Sim101", "ES 12-26", "ES", "LONG" }, new[] { "C-NQ", "Sim101", "NQ 12-26", "NQ", "LONG" }, new[] { "C-MES", "Sim101", "MES 12-26", "MES", "LONG" },
						   new[] { "C-MNQ", "Sim102", "MNQ 12-26", "MNQ", "SHORT" }, new[] { "C-NES", "Sim102", "NES 12-26", "NES", "SHORT" }, new[] { "C-NNQ", "Sim102", "NNQ 12-26", "NNQ", "SHORT" } };
		Func<List<JObject>> abrir6 = () => seis.Select(p => Abrir(p[0], p[1], p[2], p[3], p[4], 1, -1, p[3].Contains("NQ") ? 21000 : 6000, p[3].StartsWith("N") && p[3] != "NQ" ? 0.5 : 0.25)).ToList();
		Teste("C1", "OPEN 6 pernas", () =>
		{
			var es = abrir6();
			bool p1 = seis.All(p => Ativas(p[0], "stopmarket").Count == 1 && Ativas(p[0], "limit").Count == 1 && Ord(p[0], "stopmarket", null).Oco == p[0] + "|P1");
			var c = Cont(); TickEnvelhecido(es.ToArray());
			Res("C1 OPEN 6 pernas (ES/NQ/MES/MNQ/NES/NNQ, 2 contas) => 6 brackets |P1; watchdog OK; 0 ordens extras", p1 && Delta(c) == 0 && InvOk(), "p1=" + p1 + " delta=" + Delta(c) + " " + Inv());
		});
		Teste("C2", "CLOSE 6 pernas", () =>
		{
			abrir6(); var c = Cont();
			Fechar();
			int[] d = Cont();
			bool flat = seis.All(p => Corretora.Pos(p[1], p[2]) == 0), semProt = seis.All(p => Ativas(p[0]).Count == 0);
			Res("C2 CLOSE 6 pernas => 6 cancels por ids + 6 fechamentos; contas FLAT; 0 stops vivos", flat && semProt && d[2] - c[2] == 6 && d[1] - c[1] == 6 && Execs.Count == 0 && InvOk(),
				"cancels=" + (d[2] - c[2]) + " places=" + (d[1] - c[1]) + " flat=" + flat + " " + Inv());
		});

		Teste("C3", "FLAT transitoria", () =>
		{
			JObject e = Abrir("C3"); var m = Motor(); var c = Cont();
			AoRoboPositions.Sobrescrita = new Dictionary<string, int>();
			Call("Reconciliar", m, DateTime.UtcNow.AddSeconds(-2));
			FieldInfo fc = F.GetField("CampoDesvioCandidato", BF); if (fc == null) throw new MissingMethodException("AoRoboFechamento.CampoDesvioCandidato");
			bool cand = e[(string)fc.GetValue(null)] != null;
			AoRoboPositions.Sobrescrita = null;
			Call("Reconciliar", m, DateTime.UtcNow.AddSeconds(-1));
			TickEnvelhecido(e);
			Res("C3 FLAT transitoria (1 leitura FLAT, depois OPEN) => so candidato; nenhum cancel; watchdog OK", cand && !(e["desvio"] != null && (bool)e["desvio"]) && Delta(c) == 0 && InvOk(),
				"candidato=" + cand + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("C4", "desvio confirmado", () =>
		{
			JObject e = PernaP2("C4", 1);
			Ordem leg = Corretora.Injetar("Sim101", "MES 12-26", "limit", "sell", 1, 0, 6060, "C4", "Working", "AO|c1|C4|T");   // grupo legado (oco = intentId)
			Corretora.Entrada("Sim101", "MES 12-26", -1);   // conta zerada por fora
			var m = Motor();
			Call("Reconciliar", m, DateTime.UtcNow.AddSeconds(-3));
			Call("Reconciliar", m, DateTime.UtcNow.AddSeconds(-2));
			bool desv = e["desvio"] != null && (bool)e["desvio"];
			bool todos = Ativas("C4").Count == 0 && leg.Estado == "Cancelled";
			var c = Cont(); TickEnvelhecido(e);
			Res("C4 desvio confirmado (2 FLAT) => cancel de TODOS os grupos (legado + |P2) por ids; watchdog ignora a perna em desvio", desv && todos && Delta(c) == 0 && InvOk(),
				"desvio=" + desv + " todos_cancelados=" + todos + " delta_watchdog=" + Delta(c) + " " + Inv());
		});

		Teste("C5", "desvio revertido (A2B)", () =>
		{
			JObject e = PernaP2("C5", 1);
			Corretora.Entrada("Sim101", "MES 12-26", -1);
			var m = Motor();
			Call("Reconciliar", m, DateTime.UtcNow.AddSeconds(-4)); Call("Reconciliar", m, DateTime.UtcNow.AddSeconds(-3));
			bool desv = e["desvio"] != null && (bool)e["desvio"];
			Corretora.Entrada("Sim101", "MES 12-26", 1);   // broker volta LONG 1x
			var c = Cont();
			Call("Reconciliar", m, DateTime.UtcNow);
			int[] d = Cont();
			var c2 = Cont(); TickEnvelhecido(e);
			Res("C5 desvio revertido => FECHAR_PERNA (OcoReuseAceito=false): 1 fechamento, 0 brackets; watchdog nao interfere",
				desv && d[1] - c[1] == 1 && d[0] == c[0] && Corretora.Pos("Sim101", "MES 12-26") == 0 && Delta(c2) == 0 && InvOk(), "desvio=" + desv + " places+" + (d[1] - c[1]) + " brackets+" + (d[0] - c[0]) + " " + Inv());
		});

		Teste("C6", "divergencia de lado no CLOSE", () =>
		{
			Abrir("C6", qty: 1);
			lock (Corretora.G) { Corretora.MonitorI2 = false; Corretora.Posicoes["Sim101|MES 12-26"] = -1; }
			var c = Cont(); Fechar(); int[] d = Cont();
			Res("C6 conta no lado OPOSTO no CLOSE => SemLeitura + broker_internal_divergence; nenhuma ordem", d[1] == c[1] && Aud("broker_internal_divergence").Count == 1,
				"places+" + (d[1] - c[1]) + " divergencias=" + Aud("broker_internal_divergence").Count);
		});

		Teste("C7", "posicao > soma das pernas", () =>
		{
			JObject e = Abrir("C7", qty: 1);
			Corretora.Entrada("Sim101", "MES 12-26", 2);
			var c = Cont(); TickEnvelhecido(e);
			var dv = Aud("broker_internal_divergence");
			Res("C7 posicao 3 > perna 1 => watchdog BROKER_INTERNAL_DIVERGENCE; nenhuma ordem", Delta(c) == 0 && dv.Count == 1 && (string)dv[0].Payload["origem"] == "GarantirProtecao" && InvOk(), "delta=" + Delta(c) + " div=" + dv.Count);
		});

		// (2026-10-02, invictus/exec v1 + G12) X9 sobre GarantirProtecao/ExecGarantia REAIS: contratos alheios no mesmo lado ⇒ DIVERGENT,
		// a perna propria continua protegida na qty PROPRIA (re-protecao 1x com a conta em 3x), alheios intocados; sem alheios ⇒ RECONCILED.
		// Por reflexao (AoExecReport/_execReport ausentes no live-controle ⇒ N/A).
		Teste("X9", "G12 contratos alheios => DIVERGENT/RECONCILED", () =>
		{
			Type tR = S.Assembly.GetType("NinjaTrader.NinjaScript.AddOns.AoExecReport");
			FieldInfo fR = S.GetField("_execReport", BF);
			if (tR == null || fR == null) throw new MissingMethodException("AoExecReport/_execReport");
			string dir = Path.Combine(Path.GetTempPath(), "rf_exec_" + Guid.NewGuid().ToString("N"));
			object rep = Activator.CreateInstance(tR, dir);
			fR.SetValue(null, rep);
			try
			{
				Func<string> sts = () => string.Join(",", ((List<JObject>)tR.GetMethod("Ler").Invoke(rep, null)).Where(o => (string)o["trade_id"] == "TX9").Select(o => (string)o["status"]));
				JObject e = Perna("X9", "Sim101", "MES 12-26", "MES", "LONG", 1, 6000, 0.25);
				e["trade_id"] = "TX9";
				Call("RegistrarExecucao", e);
				Corretora.Entrada("Sim101", "MES 12-26", 1);
				Call("OnFillEntrada", "X9", "MES 12-26", "c1", 1, 6000.0, DateTime.UtcNow);
				Corretora.Entrada("Sim101", "MES 12-26", 2);                     // alheios: conta 3x, perna 1x
				var c = Cont(); TickEnvelhecido(e);
				string s1 = sts(); int d1 = Delta(c);
				Ordem st = Ord("X9", "stopmarket", null);
				Corretora.PorFora(st.Id, o => o.Estado = "Cancelled");          // stop da perna some sob divergencia
				TickEnvelhecido(e); TickEnvelhecido(e);
				List<Ordem> stops = Ativas("X9", "stopmarket"), takes = Ativas("X9", "limit");
				bool reprot = stops.Count == 1 && takes.Count == 1 && stops[0].Qty == 1 && takes[0].Qty == 1 && stops[0].Oco != st.Oco;
				int pos = Corretora.Pos("Sim101", "MES 12-26");
				string s2 = sts();
				Corretora.Entrada("Sim101", "MES 12-26", -2);                    // alheios saem: so a perna
				TickEnvelhecido(e);
				string s3 = sts();
				Res("X9 conta 3x > perna 1x => DIVERGENT 1x, 0 ordens; stop cancelado => re-protegida em 1x (alheios intocados, conta 3x); sem alheios => RECONCILED",
					s1 == "DIVERGENT" && d1 == 0 && reprot && pos == 3 && s2 == "DIVERGENT" && s3 == "DIVERGENT,RECONCILED" && InvOk(),
					"s1=" + s1 + " delta=" + d1 + " reprot=" + reprot + " stops=" + string.Join("|", stops.Select(o => o.Oco + ":" + o.Qty)) + " pos=" + pos + " s3=" + s3 + " " + Inv());
			}
			finally { fR.SetValue(null, null); }
		});

		Teste("C8", "cancel falho no CLOSE", () =>
		{
			Abrir("C8");
			Corretora.CancelHttpFalha = 1;
			var c = Cont(); Fechar(); int[] d = Cont();
			bool naoFechou = d[1] == c[1] && Ativas("C8", "stopmarket").Count == 1;
			Fechar(true);
			Res("C8 CancelCore 500 no CLOSE => nao fecha (sem dobro); retry no tick seguinte fecha", naoFechou && Corretora.Pos("Sim101", "MES 12-26") == 0 && Ativas("C8").Count == 0 && InvOk(),
				"nao_fechou=" + naoFechou + " pos_final=" + Corretora.Pos("Sim101", "MES 12-26") + " " + Inv());
		});

		Teste("C9", "cancel do watchdog nao confirmado", () =>
		{
			JObject e = Abrir("C9");
			Corretora.PorFora(Ord("C9", "limit", null).Id, o => o.Estado = "Cancelled");
			Corretora.CancelNuncaConfirma = true;
			int b0; lock (Corretora.G) b0 = Corretora.Brackets;
			DateTime t = DateTime.UtcNow; TickEnvelhecido(e); double ms = (DateTime.UtcNow - t).TotalMilliseconds;
			int b1; lock (Corretora.G) b1 = Corretora.Brackets;
			Res("C9 cancel nao confirmado em 1500 ms => nenhum bracket; tentativa contada (E4)", b1 == b0 && (int?)e["protecao_tentativas"] == 1 && Corretora.MaxStopsAtivos <= 1 && InvOk(),
				"brackets+" + (b1 - b0) + " tentativas=" + e["protecao_tentativas"] + " espera_ms=" + ms.ToString("0") + " " + Inv());
		});

		Teste("C10", "stop FILLED no CLOSE", () =>
		{
			PernaP2("C10", 1, true);
			var c = Cont(); Fechar(); int[] d = Cont();
			Res("C10 stop |P2 FILLED no CLOSE => JaFechada; nenhuma ordem", d[1] == c[1] && d[0] == c[0] && Execs.Count == 0 && InvOk(), "places+" + (d[1] - c[1]) + " registros=" + Execs.Count);
		});

		Teste("C11", "AOT offline", () =>
		{
			JObject e = Abrir("C11");
			Corretora.PorFora(Ord("C11", "limit", null).Id, o => o.Estado = "Cancelled");
			var c = Cont(); TickEnvelhecido(e); int[] d = Cont();
			Res("C11 sem evento do AOT com perna aberta => watchdog sozinho re-protege; nenhuma entrada/saida nova", d[1] == c[1] && Ativas("C11", "stopmarket").Count == 1 && Ativas("C11", "limit").Count == 1 && InvOk(),
				"places+" + (d[1] - c[1]) + " " + Inv());
		});

		Teste("C12", "2 pernas mesma conta/instrumento/lado", () =>
		{
			JObject a = Abrir("C12A", qty: 2), b = Abrir("C12B", qty: 1);
			var c = Cont(); TickEnvelhecido(a, b); bool ok = Delta(c) == 0;
			Corretora.PorFora(Ord("C12B", "limit", null).Id, o => o.Estado = "Cancelled");
			TickEnvelhecido(a, b);
			Ordem sb = Ord("C12B", "stopmarket", "C12B|P2"), sa = Ord("C12A", "stopmarket", null);
			Res("C12 2 pernas (2x + 1x) => OK sem ordens; re-protecao da B com qty 1 (qtyOutras = preenchida da A); A intacta",
				ok && sb != null && sb.Qty == 1 && sa.Oco == "C12A|P1" && sa.Qty == 2 && Corretora.Ativa(sa.Estado) && InvOk(), "ok_inicial=" + ok + " qtyB=" + (sb == null ? 0 : sb.Qty) + " " + Inv());
		});

		Teste("C13", "fill durante REPROTEGER", () =>
		{
			JObject e = Abrir("C13", qty: 3, fill: 2);
			Corretora.PorFora(Ord("C13", "limit", null).Id, o => o.Estado = "Cancelled");
			bool orfao = false;
			Corretora.AoCancelar = acc =>
			{
				Corretora.Entrada("Sim101", "MES 12-26", 1);
				var th = new Thread(() => Call("OnFillEntrada", "C13", "MES 12-26", "c1", 3, 6000.0, DateTime.UtcNow)); th.Start(); th.Join(3000);
				lock (Gate) orfao = Orfaos.ContainsKey("C13");
			};
			TickEnvelhecido(e);
			Call("AplicarFillsOrfaosPendentes", DateTime.UtcNow);
			Ordem s = Ativas("C13", "stopmarket").FirstOrDefault(), t = Ativas("C13", "limit").FirstOrDefault();
			int brk; lock (Corretora.G) brk = Corretora.Brackets;
			Res("C13 fill do NT8 durante REPROTEGER (perna reservada) => orfao; ciclo seguinte AJUSTA o grupo novo para 3; nunca 2 brackets ativos",
				orfao && s != null && t != null && s.Oco == "C13|P2" && s.Qty == 3 && t.Qty == 3 && brk == 2 && Corretora.MaxStopsAtivos == 1 && !Orfaos.ContainsKey("C13") && InvOk(),
				"orfao=" + orfao + " oco=" + (s == null ? null : s.Oco) + " qty=" + (s == null ? 0 : s.Qty) + " brackets=" + brk + " " + Inv());
		});

		Teste("T2e", "AplicarFillOrfao com ProtegerFill lancando", () =>
		{
			JObject e = Perna("T2E", "Sim101", "MES 12-26", "MES", "LONG", 1, 6000, 0.25);
			Corretora.Entrada("Sim101", "MES 12-26", 1);
			Call("OnFillEntrada", "T2E", "MES 12-26", "c1", 1, 6000.0, DateTime.UtcNow);   // antes do registro => orfao
			Call("RegistrarExecucao", e);
			Corretora.BracketLanca = 1;
			Call("AplicarFillOrfao", "T2E", DateTime.UtcNow);
			JObject o; bool guardado; lock (Gate) guardado = Orfaos.TryGetValue("T2E", out o);
			bool livre; lock (Gate) livre = EmCurso == null || !EmCurso.Contains("T2E");
			bool crit = Aud("protecao_erro").Any(x => x.Result == "critical:protecao_erro");
			Call("AplicarFillsOrfaosPendentes", DateTime.UtcNow);
			Res("T2e ProtegerFill lanca no AplicarFillOrfao => fill re-guardado (protecao_erro_orfao) + critical; reserva liberada; ciclo seguinte protege",
				guardado && (string)o["origem"] == "protecao_erro_orfao" && crit && livre && Ativas("T2E", "stopmarket").Count == 1 && InvOk(),
				"guardado=" + guardado + " origem=" + (o == null ? null : (string)o["origem"]) + " critical=" + crit + " livre=" + livre + " " + Inv());
		});

		Teste("G9", "fechamento W3 rejeitado => backoff => re-protege", () =>
		{
			// re-protecoes falham (sincronas) ate esgotar W3 => fechamento market aceito e depois REJECTED (backoff); proximo tick: re-protecao, 0 fechamentos
			Corretora.BracketFalhaSync = 99; Corretora.PlaceRejeitaAssincN = 1;
			JObject e = Abrir("G9");
			int ticks = 0;
			while (Cont()[1] == 0 && ticks < 6) { TickEnvelhecido(e); ticks++; }
			bool rej, bk; lock (Gate) { rej = (string)e["x_estado"] == "Rejected"; bk = AoRoboSaida.EmBackoff(e, DateTime.UtcNow); }
			bool semStop = Ativas("G9", "stopmarket").Count == 0;
			Corretora.BracketFalhaSync = 0;
			int placesAntes = Cont()[1];
			TickEnvelhecido(e);
			bool prot = Ativas("G9", "stopmarket").Count == 1 && Ativas("G9", "limit").Count == 1;
			int placesBackoff = Cont()[1] - placesAntes;
			// backoff expira com a protecao OK => nada de fechamento, perna protegida
			lock (Gate) e["x_retry_after"] = AoMotorCanonico.Iso(DateTime.UtcNow.AddSeconds(-1));
			var c = Cont(); TickEnvelhecido(e);
			bool okDepois = Delta(c) == 0 && Ativas("G9", "stopmarket").Count == 1 && Corretora.Pos("Sim101", "MES 12-26") == 3;
			Res("G9 fechamento W3 REJEITADO (backoff) => tick seguinte re-protege (stop+take |Pn); 0 fechamentos no backoff; nunca 2 stops; backoff expirado com protecao OK => sem fechamento",
				rej && bk && semStop && prot && placesBackoff == 0 && okDepois && Corretora.MaxStopsAtivos <= 1 && InvOk(),
				"ticks_ate_close=" + ticks + " x_estado_rejected=" + rej + " backoff=" + bk + " sem_stop_antes=" + semStop + " reprotegida=" + prot + " places_no_backoff=" + placesBackoff
				+ " ok_apos_expirar=" + okDepois + " oco=" + (Ord("G9", "stopmarket", null) == null ? null : Ord("G9", "stopmarket", null).Oco) + " " + Inv());
		});

		Teste("G10", "fechamento Working => rejeitado depois => watchdog rele o x_order", () =>
		{
			Corretora.BracketFalhaSync = 99; Corretora.PlaceFicaWorkingN = 1;
			JObject e = Abrir("G10");
			int ticks = 0;
			while (Cont()[1] == 0 && ticks < 6) { TickEnvelhecido(e); ticks++; }
			string oid, est1; lock (Gate) { oid = (string)e["x_order_id"]; est1 = (string)e["x_estado"]; }
			Corretora.BracketFalhaSync = 0;
			var c0 = Cont(); TickEnvelhecido(e);
			int brkWorking = Cont()[0] - c0[0], placesWorking = Cont()[1] - c0[1];   // fechamento vivo: watchdog nao compete
			Corretora.PorFora(oid, o => o.Estado = "Rejected");
			int placesAntes = Cont()[1];
			TickEnvelhecido(e);
			string est2; bool bk; lock (Gate) { est2 = (string)e["x_estado"]; bk = AoRoboSaida.EmBackoff(e, DateTime.UtcNow); }
			bool aud = Aud("flatten_rejected").Any(x => x.IntentId == "G10");
			bool prot = Ativas("G10", "stopmarket").Count == 1 && Ativas("G10", "limit").Count == 1;
			Res("G10 fechamento do watchdog fica Working apos EsperarFilled 3 s; broker rejeita depois => tick seguinte: x_estado=Rejected, backoff registrado, protecao re-colocada",
				!string.IsNullOrEmpty(oid) && est1 != "Filled" && est1 != "Rejected" && brkWorking == 0 && placesWorking == 0 && est2 == "Rejected" && bk && aud && prot
				&& Cont()[1] == placesAntes && Corretora.MaxStopsAtivos <= 1 && InvOk(),
				"x_order=" + oid + " estado_apos_espera=" + est1 + " brk/places_com_working=" + brkWorking + "/" + placesWorking + " estado_relido=" + est2 + " backoff=" + bk
				+ " flatten_rejected=" + aud + " reprotegida=" + prot + " " + Inv());
		});

		// ── (2026-10-02) G8 / G13 / G14 ──
		Teste("G8a", "ilegivel prolongado => alerta escalado", () =>
		{
			Call("Alertar", "x", null, null, null, null, 0, DateTime.UtcNow, new JObject());   // controle: metodo ausente => N/A
			JObject e = Abrir("G8A");
			Envelhecer(e, 2000);
			string arq; object al = InstalarAlertas(out arq);
			Corretora.OrdersFalha = true;
			DateTime t0 = DateTime.UtcNow; var c = Cont();
			Tick(t0); int n0 = NNotif(), a0 = ACount(al);
			Tick(t0.AddSeconds(31)); int n1 = NNotif();
			JObject f1 = LerAlertas(arq);
			Tick(t0.AddSeconds(50)); int n2 = NNotif();          // < 60 s desde a notificacao: nada
			Tick(t0.AddSeconds(95)); int n3 = NNotif();          // >= 60 s: re-notifica
			Tick(t0.AddSeconds(121)); int n4 = NNotif();         // nivel 2: notifica na subida
			Tick(t0.AddSeconds(140)); int n5 = NNotif();         // < 30 s: nada
			Tick(t0.AddSeconds(152)); int n6 = NNotif();         // >= 30 s no nivel 2
			JObject f2 = LerAlertas(arq);
			DateTime ti; lock (Gate) ti = AoMotorCanonico.ParseIso(e["protecao_ilegivel_t0"]).Value;   // t0 gravado (ISO em ms)
			Func<double, int> niv = s => { lock (Gate) return (int)FCall("NivelIlegivel", e, ti.AddSeconds(s)); };
			bool puro = niv(10) == 0 && niv(30) == 0 && niv(31) == 1 && niv(119) == 1 && niv(120) == 2;
			JObject a1 = f1 == null ? null : (JObject)((JArray)f1["alerts"]).FirstOrDefault(), a2 = f2 == null ? null : (JObject)((JArray)f2["alerts"]).FirstOrDefault();
			bool arquivo = f1 != null && (string)f1["schema"] == "invictus/alerts v1" && a1 != null && (string)a1["kind"] == "protection_unverifiable" && (string)a1["intent_id"] == "G8A"
						   && (int)a1["level"] == 1 && a2 != null && (int)a2["level"] == 2 && ((JArray)f2["alerts"]).Count == 1;
			var aud = Aud("robo_alerta");
			bool audOk = aud.Count == 4 && aud.All(x => x.Result == "critical:alert:protection_unverifiable");
			Res("G8a ilegivel 0/30/120 s => nivel 0/1/2; alerta em robo-alertas.json (invictus/alerts v1) + som 1o aos 30 s, cadencia 60 s (nivel 1) / 30 s (nivel 2); 0 ordens",
				puro && n0 == 0 && a0 == 0 && n1 == 1 && n2 == 1 && n3 == 2 && n4 == 3 && n5 == 3 && n6 == 4 && arquivo && audOk && Delta(c) == 0 && InvOk(),
				"puro=" + puro + " notifs=" + n0 + "/" + n1 + "/" + n2 + "/" + n3 + "/" + n4 + "/" + n5 + "/" + n6 + " arquivo=" + arquivo + " robo_alerta=" + aud.Count + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("G8b", "legivel de novo => alerta limpo", () =>
		{
			Call("LimparAlertaIlegivel", "x", null, null, null, "OK", DateTime.UtcNow);
			JObject e = Abrir("G8B");
			Envelhecer(e, 2000);
			string arq; object al = InstalarAlertas(out arq);
			Corretora.OrdersFalha = true;
			DateTime t0 = DateTime.UtcNow; var c = Cont();
			Tick(t0); Tick(t0.AddSeconds(31));
			bool ativo = ACount(al) == 1;
			Corretora.OrdersFalha = false;
			Tick(t0.AddSeconds(40));
			JObject f = LerAlertas(arq);
			bool limpo = ACount(al) == 0 && f != null && ((JArray)f["alerts"]).Count == 0 && Aud("protection_readable_again").Count == 1;
			// perna sai do registro com alerta ativo => LimparAusentes
			Corretora.OrdersFalha = true; Tick(t0.AddSeconds(50)); Tick(t0.AddSeconds(85));
			bool reativou = ACount(al) == 1;
			lock (Gate) Execs.Clear();
			Tick(t0.AddSeconds(90));
			bool ausente = ACount(al) == 0 && Aud("protection_alert_cleared").Count == 1;
			Corretora.OrdersFalha = false;
			Res("G8b leitura legivel de novo => alerta limpo (arquivo vazio) + info:protection_readable_again; perna fora do registro => alerta removido; 0 ordens",
				ativo && limpo && reativou && ausente && Delta(c) == 0 && InvOk(), "ativo=" + ativo + " limpo=" + limpo + " reativou=" + reativou + " ausente=" + ausente + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("G8c", "AoRoboAlertas puro: persistencia/throttle/restart + AvaliarConexao", () =>
		{
			string f = TmpAlertas(); DateTime t = DateTime.UtcNow;
			Func<object, string, int, double, bool> at = (o, k, n, s) => (bool)ACall(o, "Ativar", k, "Sim101", "MES 12-26", "X1", n, t.AddSeconds(s));
			object a1 = Activator.CreateInstance(AL, f);
			bool p1 = at(a1, "protection_unverifiable", 1, 0) && !at(a1, "protection_unverifiable", 1, 10);
			object a2 = Activator.CreateInstance(AL, f);                     // restart (F5): carrega do disco
			bool p2 = ACount(a2) == 1 && !at(a2, "protection_unverifiable", 1, 20) && at(a2, "protection_unverifiable", 1, 61)
					  && at(a2, "protection_unverifiable", 2, 62) && !at(a2, "protection_unverifiable", 2, 80) && at(a2, "protection_unverifiable", 2, 93);
			bool p3 = (bool)ACall(a2, "Limpar", "protection_unverifiable", "Sim101", "MES 12-26", "X1") && ACount(Activator.CreateInstance(AL, f)) == 0
					  && !(bool)ACall(a2, "Limpar", "protection_unverifiable", "Sim101", "MES 12-26", "X1");
			File.WriteAllText(f, "{ corrompido");
			bool p4 = ACount(Activator.CreateInstance(AL, f)) == 0;
			FieldInfo nf = AL.GetField("Notificar", BF);
			nf.SetValue(null, (Action<string>)(k => { throw new InvalidOperationException("sem som"); }));
			bool p5 = AL.GetMethod("TentarNotificar", BF).Invoke(null, new object[] { "k" }) != null;
			Func<bool?, bool?, string> cx = (a, b) => (string)AL.GetMethod("AvaliarConexao", BF).Invoke(null, new object[] { a, b });
			bool p6 = cx(null, null) == "NONE" && cx(null, true) == "NONE" && cx(null, false) == "DISCONNECTED" && cx(true, false) == "DISCONNECTED"
					  && cx(false, false) == "NONE" && cx(false, true) == "RECONNECTED" && cx(true, true) == "NONE" && cx(false, null) == "NONE" && cx(true, null) == "NONE";
			try { File.Delete(f); } catch { }
			Res("G8c AoRoboAlertas: 1a ativacao notifica, throttle 60/30 s, subida de nivel notifica, throttle sobrevive ao restart, Limpar persiste, arquivo corrompido => vazio, falha do som engolida; AvaliarConexao (desconhecido nunca transiciona)",
				p1 && p2 && p3 && p4 && p5 && p6, "ativar=" + p1 + " restart=" + p2 + " limpar=" + p3 + " corrompido=" + p4 + " som_falha=" + p5 + " conexao=" + p6);
		});

		Teste("G13a", "boot (F5) com perna persistida sem protecao => re-protege antes de qualquer evento", () =>
		{
			Call("GarantiaBoot", DateTime.UtcNow);   // controle: ausente => N/A (o W10 do test_wiring prova a ordem no Ciclo)
			JObject e = Abrir("G13A");
			foreach (Ordem o in Ativas("G13A")) Corretora.PorFora(o.Id, x => x.Estado = "Cancelled");   // brackets perdidos com o NT8 fora
			Envelhecer(e, 2000);
			JObject disco; lock (Gate) { disco = (JObject)e.DeepClone(); Execs.Clear(); Execs.Add(disco); }   // F5: registro recarregado do disco
			SetCampo("_bootGarantiaPendente", true);
			var c = Cont();
			Call("GarantiaBoot", DateTime.UtcNow);
			bool prot = Ativas("G13A", "stopmarket").Count == 1 && Ativas("G13A", "limit").Count == 1;
			var b = Aud("boot_protection_check");
			bool aud = b.Count == 1 && b[0].Result == "ok" && (int)b[0].Payload["pernas_no_boot"] == 1;
			bool flag = !Campo<bool>("_bootGarantiaPendente");
			var c2 = Cont(); Call("GarantiaBoot", DateTime.UtcNow);
			bool umaVez = Delta(c2) == 0 && Aud("boot_protection_check").Count == 1;
			Res("G13a 1o ciclo apos F5 (registro recarregado, brackets perdidos) => GarantiaBoot re-protege (stop+take) + boot_protection_check ok; roda 1x so",
				prot && aud && flag && umaVez && Corretora.MaxStopsAtivos <= 1 && InvOk(), "protegida=" + prot + " audit=" + aud + " flag_limpa=" + flag + " uma_vez=" + umaVez + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("G13b", "boot com conta ilegivel => sem acao cega; alerta depois de 30 s", () =>
		{
			Call("GarantiaBoot", DateTime.UtcNow);
			JObject e = Abrir("G13B");
			foreach (Ordem o in Ativas("G13B")) Corretora.PorFora(o.Id, x => x.Estado = "Cancelled");
			Envelhecer(e, 2000);
			string arq; object al = InstalarAlertas(out arq);
			Corretora.OrdersFalha = true;
			SetCampo("_bootGarantiaPendente", true);
			DateTime t0 = DateTime.UtcNow; var c = Cont();
			Call("GarantiaBoot", t0);
			var b = Aud("boot_protection_check");
			bool aud = b.Count == 1 && b[0].Result == "warning:boot_protection_unverifiable" && Aud("protecao_ilegivel").Count == 1;
			Tick(t0.AddSeconds(31));
			bool alerta = ACount(al) == 1 && NNotif() == 1;
			Corretora.OrdersFalha = false;
			Res("G13b boot com ordens ilegiveis => 0 ordens, boot_protection_check warning:boot_protection_unverifiable, critical:protecao_ilegivel; >30 s => alerta G8",
				aud && alerta && Delta(c) == 0 && InvOk(), "audit=" + aud + " alerta=" + alerta + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("G14a", "conta desconectada com perna aberta => critical + alerta; volta => limpo", () =>
		{
			var contas = new List<string> { "Sim101" };
			Call("ConexaoPasso", DateTime.UtcNow, new List<string>());
			string arq; object al = InstalarAlertas(out arq);
			Abrir("G14A");
			DateTime t0 = DateTime.UtcNow; var c = Cont();
			AlfaOmegaRoboSim.ConexaoConta["Sim101"] = true; AlfaOmegaRoboSim.ConexaoPreco["Sim101"] = true;
			Call("ConexaoPasso", t0, contas);
			bool quieto = Aud("connection_status").Count == 0 && ACount(al) == 0;
			AlfaOmegaRoboSim.ConexaoConta["Sim101"] = false;
			Call("ConexaoPasso", t0.AddSeconds(2), contas);
			bool caiu = Aud("connection_status").Any(x => x.Result == "critical:account_disconnected") && ACount(al) == 1 && NNotif() == 1;
			Call("ConexaoPasso", t0.AddSeconds(12), contas);
			bool throttle = NNotif() == 1 && Aud("connection_status").Count == 1;
			AlfaOmegaRoboSim.ConexaoPreco["Sim101"] = null;                           // leitura desconhecida: nada
			Call("ConexaoPasso", t0.AddSeconds(14), contas);
			bool desconhecido = Aud("connection_status").Count == 1;
			AlfaOmegaRoboSim.ConexaoConta["Sim101"] = true;
			Call("ConexaoPasso", t0.AddSeconds(20), contas);
			bool voltou = Aud("connection_status").Any(x => x.Result == "info:account_reconnected") && ACount(al) == 0;
			AlfaOmegaRoboSim.ConexaoPreco["Sim101"] = false;
			Call("ConexaoPasso", t0.AddSeconds(25), contas);
			bool feed = Aud("connection_status").Any(x => x.Result == "critical:price_feed_disconnected") && ACount(al) == 1;
			Res("G14a conta/feed desconectados com perna aberta => critical:<canal>_disconnected + alerta (throttle); desconhecido nao transiciona; reconexao => info + alerta limpo; 0 ordens",
				quieto && caiu && throttle && desconhecido && voltou && feed && Delta(c) == 0 && InvOk(),
				"quieto=" + quieto + " caiu=" + caiu + " throttle=" + throttle + " desconhecido=" + desconhecido + " voltou=" + voltou + " feed=" + feed + " delta=" + Delta(c) + " " + Inv());
		});

		Teste("G14b", "desconexao sem perna => so warning", () =>
		{
			Call("ConexaoPasso", DateTime.UtcNow, new List<string>());
			string arq; object al = InstalarAlertas(out arq);
			var c = Cont();
			AlfaOmegaRoboSim.ConexaoConta["Sim101"] = false; AlfaOmegaRoboSim.ConexaoPreco["Sim101"] = true;
			Call("ConexaoPasso", DateTime.UtcNow, new List<string> { "Sim101" });
			var a = Aud("connection_status");
			Res("G14b conta desconectada SEM perna do robo => warning:account_disconnected, nenhum alerta, nenhum som, 0 ordens",
				a.Count == 1 && a[0].Result == "warning:account_disconnected" && ACount(al) == 0 && NNotif() == 0 && Delta(c) == 0,
				"audits=" + string.Join(",", a.Select(x => x.Result)) + " alertas=" + ACount(al) + " notifs=" + NNotif());
		});

		try { File.Delete(Path.Combine(Path.GetTempPath(), "real_flow_execucoes_" + System.Diagnostics.Process.GetCurrentProcess().Id + ".json")); } catch { }
		Console.WriteLine();
		Console.WriteLine("STATUS " + string.Join(" ", Status.Select(kv => kv.Key + "=" + kv.Value)));
		Console.WriteLine("RESULTADO real_flow: pass=" + pass + " fail=" + fail + " na=" + na);
		if (controle)
		{
			string[] esperadas = { "PM4", "PM5", "PM10", "PM12" };
			bool todas = esperadas.All(k => Status.ContainsKey(k) && Status[k] != "PASS");
			Console.WriteLine("CONTROLE LIVE: " + string.Join(" ", esperadas.Select(k => k + "=" + (Status.ContainsKey(k) ? Status[k] : "?"))) + " => " + (todas ? "ESPERADO (todas FAIL/N/A)" : "INESPERADO"));
			return todas ? 0 : 1;
		}
		return fail + na;
	}
}
