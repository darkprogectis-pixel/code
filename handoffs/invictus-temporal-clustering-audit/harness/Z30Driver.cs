// Harness FORCA_JANELA_30: executa o codigo C# REAL do staging (AoTapeEngine + AoForcaJanela + AoGate.EsNq + AoMotorCanonico)
// sobre os MESMOS ticks do replay JS e grava, por passo de 20 s das 44 sessoes: categoria do gate, direcao, z ES/NQ, veredito, e as
// entradas do motor real. O publish replica as linhas do AoMarketDataPublisher (sem eleicao: ha um unico motor por simbolo).
// Entrada/saida por variaveis de ambiente: Z30_DIR (ticks_ES.bin, ticks_NQ.bin, sessions.txt) -> cs_steps.csv, cs_entries.csv.
using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.AddOns;
using SS = NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState;

public static class Z30Driver
{
	static readonly CultureInfo ci = CultureInfo.InvariantCulture;
	static readonly DateTime Epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
	const double TickSz = 0.25;

	sealed class Feed
	{
		public readonly string Sym; public readonly AoTapeEngine Eng; readonly BinaryReader _r; readonly long _n; long _i;
		public double Ms, Px; public int Vol, Side; public bool Has; long _sess = long.MinValue; public long Count;
		public Feed(string sym, string file) { Sym = sym; Eng = new AoTapeEngine(sym); var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 22); _r = new BinaryReader(fs); _n = fs.Length / 24; Next(); }
		public void Next() { if (_i >= _n) { Has = false; return; } Ms = _r.ReadDouble(); Px = _r.ReadDouble(); Vol = _r.ReadInt32(); Side = _r.ReadInt32(); _i++; Has = true; }
		public void Apply()
		{
			DateTime t = Epoch.AddMilliseconds(Ms);
			// virada de sessao = 18:00 ET = 22:00 UTC (EDT em toda a janela), como o Bars.IsFirstBarOfSession do Control Center
			long sess = (long)Math.Floor((Ms - 22.0 * 3600e3) / 86400e3);
			if (sess != _sess) { if (_sess != long.MinValue) Eng.ResetSessao(true, t, t); _sess = sess; }
			double bid, ask;
			if (Side > 0) { ask = Px; bid = Px - TickSz; } else if (Side < 0) { bid = Px; ask = Px + TickSz; } else { bid = Px - TickSz; ask = Px + TickSz; }
			Eng.Tick(AoTick.Last, Px, bid, ask, Vol, t, true);
			// replica do AoMarketDataPublisher.PublicarForca + Publicar
			Eng.Forca.MarcarLocal(t);
			if (Sym == "ES") { SS.Forca_ES = Eng.Forca; SS.MeDirection_ES = Eng.MeDir; SS.MviDirection_ES = Eng.MviDir; SS.LastUpdate_ES = t; if (Px > 0) SS.LastPrice_ES = Px; }
			else             { SS.Forca_NQ = Eng.Forca; SS.MeDirection_NQ = Eng.MeDir; SS.MviDirection_NQ = Eng.MviDir; SS.LastUpdate_NQ = t; if (Px > 0) SS.LastPrice_NQ = Px; }
			Count++;
		}
	}

	// ── casos sinteticos de validade (fail-closed) e do passo 4 com sinal ──
	static AoForcaJanela Serie(DateTime ini, int seg, int side) { var f = new AoForcaJanela(); for (int i = 0; i < seg; i++) f.Tick(side, 1, ini.AddSeconds(i)); return f; }
	static string Gate(AoForcaJanela fe, AoForcaJanela fn, int de, int dn, DateTime now)
	{
		SS.Forca_ES = fe; SS.Forca_NQ = fn; SS.MeDirection_ES = de; SS.MviDirection_ES = de; SS.MeDirection_NQ = dn; SS.MviDirection_NQ = dn; SS.LastUpdate_ES = now.AddSeconds(-1); SS.LastUpdate_NQ = now.AddSeconds(-1);
		AoGateResult g = AoGate.EsNq(AoGate.DefaultMinForce, AoGate.DefaultFreshSec, now); return (g.Ok ? "OK dir=" + g.Dir : "NO why=" + g.Why);
	}
	public static string RunCases()
	{
		var sb = new StringBuilder("["); DateTime T = new DateTime(2026, 10, 6, 12, 0, 0); double z; bool v; int n = 0;
		Action<string, string, string> add = (nome, obtido, esperado) => { if (n++ > 0) sb.Append(","); sb.Append("{\"caso\":\"" + nome + "\",\"obtido\":\"" + obtido + "\",\"esperado\":\"" + esperado + "\",\"pass\":" + (obtido == esperado ? "true" : "false") + "}"); };
		v = AoForcaJanela.Avaliar(null, T, out z); add("sem publicador", v.ToString(), "False");
		var f = Serie(T, 1200, 1); v = f.Ler(T.AddSeconds(1199), out z); add("nunca publicado (sem MarcarLocal)", v.ToString(), "False");
		f.MarcarLocal(T.AddSeconds(1199)); v = f.Ler(T.AddSeconds(1199), out z); add("janela nao coberta (20 min desde a carga)", v.ToString(), "False");
		f = Serie(T, 1801, 1); f.MarcarLocal(T.AddSeconds(1800)); v = f.Ler(T.AddSeconds(1800), out z); add("janela coberta: z = 1800/raiz(1800)", v + " " + z.ToString("0.0000", ci), "True 42.4264");
		v = f.Ler(T.AddSeconds(1800 + 301), out z); add("medida velha (301 s sem publish)", v.ToString(), "False");
		v = f.Ler(T.AddSeconds(1800 + 60), out z); add("janela desliza sem negocio (60 s): z = 1740/raiz(1740)", v + " " + z.ToString("0.0000", ci), "True 41.7133");
		f = Serie(T, 1801, 1); f.Tick(1, 1, T.AddSeconds(1800 + 400)); f.MarcarLocal(T.AddSeconds(2200)); v = f.Ler(T.AddSeconds(2200), out z); add("buraco de 400 s sem virada: invalida", v.ToString(), "False");
		for (int i = 1; i <= 1800; i++) f.Tick(1, 1, T.AddSeconds(2200 + i)); f.MarcarLocal(T.AddSeconds(4000)); v = f.Ler(T.AddSeconds(4000), out z); add("30 min depois do buraco: volta a valer", v.ToString(), "True");
		f = Serie(T, 1801, 1); f.ViradaSessao(T.AddSeconds(1800 + 3600)); f.Tick(-1, 1, T.AddSeconds(5400)); f.MarcarLocal(T.AddSeconds(5400)); v = f.Ler(T.AddSeconds(5400), out z); add("pausa de 60 min com virada ANTES do 1o negocio: valida", v + " " + z.ToString("0.0000", ci), "True -1.0000");
		f = Serie(T, 1801, 1); f.Tick(-1, 1, T.AddSeconds(5400)); f.MarcarLocal(T.AddSeconds(5400)); bool antes = f.Ler(T.AddSeconds(5400), out z); f.ViradaSessao(T.AddSeconds(5401)); v = f.Ler(T.AddSeconds(5400), out z); add("pausa com virada DEPOIS do 1o negocio: invalida ate a virada, depois valida", antes + " " + v, "False True");
		DateTime N = T.AddSeconds(1800); var up = Serie(T, 1801, 1); up.MarcarLocal(N); var dn = Serie(T, 1801, -1); dn.MarcarLocal(N);
		add("gate: z+ nos dois, direcao LONG", Gate(up, up, 1, 1, N), "OK dir=1");
		add("gate: z- nos dois, direcao SHORT", Gate(dn, dn, -1, -1, N), "OK dir=-1");
		add("gate: z+ nos dois, direcao SHORT (sinal contrario)", Gate(up, up, -1, -1, N), "NO why=forca fraca ES/NQ");
		add("gate: ES z+ LONG, NQ z- LONG", Gate(up, dn, 1, 1, N), "NO why=forca fraca NQ");
		add("gate: sem publicador de forca no ES", Gate(null, up, 1, 1, N), "NO why=forca fraca ES");
		add("gate: direcoes divergentes (passo 3 intacto)", Gate(up, dn, 1, -1, N), "NO why=ES x NQ divergentes");
		var fraco = new AoForcaJanela(); for (int i = 0; i <= 1800; i++) fraco.Tick(i % 2 == 0 ? 1 : -1, 1, T.AddSeconds(i)); fraco.Tick(1, 1, N); fraco.Tick(1, 1, N); fraco.MarcarLocal(N);
		add("gate: z abaixo do limiar com sinal certo", Gate(fraco, fraco, 1, 1, N), "NO why=forca fraca ES/NQ");
		SS.LastUpdate_ES = N.AddSeconds(-91); AoGateResult g2 = AoGate.EsNq(0.03, 90.0, N); add("gate: tape ES velho (passo 1 intacto)", g2.Why, "sem tape ES");
		sb.Append("]"); return sb.ToString();
	}

	public static string Run()
	{
		if (Environment.GetEnvironmentVariable("Z30_MODE") == "cases") return RunCases();
		string dir = Environment.GetEnvironmentVariable("Z30_DIR");
		var es = new Feed("ES", Path.Combine(dir, "ticks_ES.bin")); var nq = new Feed("NQ", Path.Combine(dir, "ticks_NQ.bin"));
		var sess = new List<double>(); foreach (string l in File.ReadAllLines(Path.Combine(dir, "sessions.txt"))) if (l.Trim().Length > 0) sess.Add(double.Parse(l.Trim(), ci));
		var motor = new AoMotorCanonico(null, null, new AoMotorParams());
		long steps = 0, entries = 0, okCount = 0;
		using (var sw = new StreamWriter(Path.Combine(dir, "cs_steps.csv"), false, new UTF8Encoding(false), 1 << 20))
		using (var se = new StreamWriter(Path.Combine(dir, "cs_entries.csv"), false, new UTF8Encoding(false)))
		{
			for (int k = 0; k < sess.Count; k++)
			{
				double t0 = sess[k];
				for (int i = 0; i < 4140; i++)
				{
					double evalMs = t0 + i * 20000.0 + 999.0;
					while (true)
					{
						bool e = es.Has && es.Ms <= evalMs, n = nq.Has && nq.Ms <= evalMs;
						if (!e && !n) break;
						if (e && (!n || es.Ms <= nq.Ms)) { es.Apply(); es.Next(); } else { nq.Apply(); nq.Next(); }
					}
					DateTime now = Epoch.AddMilliseconds(evalMs);
					AoGateResult g = AoGate.EsNq(AoGate.DefaultMinForce, AoGate.DefaultFreshSec, now);
					double zE, zN; bool vE = AoForcaJanela.Avaliar(SS.Forca_ES, now, out zE), vN = AoForcaJanela.Avaliar(SS.Forca_NQ, now, out zN);
					string why = g.Why ?? "";
					int cat = g.Ok ? 4 : why.StartsWith("sem tape", StringComparison.Ordinal) ? 1 : why.IndexOf("indefinid", StringComparison.Ordinal) >= 0 ? 2 : why.IndexOf("divergentes", StringComparison.Ordinal) >= 0 ? 3 : 4;
					int esDir = (SS.MeDirection_ES != 0 && SS.MeDirection_ES == SS.MviDirection_ES) ? SS.MeDirection_ES : 0;
					int dirAl = cat == 4 ? esDir : 0;
					int okE = (cat == 4 && why.IndexOf("ES", StringComparison.Ordinal) < 0) ? 1 : 0, okN = (cat == 4 && why.IndexOf("NQ", StringComparison.Ordinal) < 0) ? 1 : 0;
					sw.Write(k); sw.Write(','); sw.Write(i); sw.Write(','); sw.Write(cat); sw.Write(','); sw.Write(dirAl); sw.Write(',');
					sw.Write(zE.ToString("R", ci)); sw.Write(','); sw.Write(zN.ToString("R", ci)); sw.Write(','); sw.Write(g.Ok ? 1 : 0); sw.Write(','); sw.Write(okE); sw.Write(','); sw.Write(okN); sw.Write(',');
					sw.Write(vE ? 1 : 0); sw.Write(','); sw.Write(vN ? 1 : 0); sw.Write(','); sw.Write(g.Strength); sw.Write('\n');
					if (g.Ok) okCount++;
					var anchor = new AoMotorAnchor { Dir = g.Ok ? (g.Dir > 0 ? "LONG" : "SHORT") : "NEUTRO", Strength = g.Strength, Why = string.IsNullOrEmpty(why) ? null : why };
					double pe = SS.LastPrice_ES, pn = SS.LastPrice_NQ;
					AoMotorTick mt = motor.Tick(anchor, pe > 0 ? (double?)pe : null, pn > 0 ? (double?)pn : null, now, "harness", false);
					if (mt.Fechou && mt.Trade != null) { se.Write("C,"); se.Write(evalMs.ToString("R", ci)); se.Write(','); se.Write(mt.MotivoSaida); se.Write(','); se.Write(((double)mt.Trade["totalUsd"]).ToString("R", ci)); se.Write('\n'); }
					if (mt.Abriu) { se.Write("O,"); se.Write(evalMs.ToString("R", ci)); se.Write(','); se.Write(motor.Side); se.Write(",0\n"); entries++; }
					steps++;
				}
			}
		}
		return "{\"steps\":" + steps + ",\"gate_ok_steps\":" + okCount + ",\"motor_entries\":" + entries + ",\"ticks_es\":" + es.Count + ",\"ticks_nq\":" + nq.Count + ",\"zmin\":" + AoGate.ForcaZMin.ToString("R", ci) + ",\"janela_seg\":" + AoForcaJanela.JanelaSeg + "}";
	}
}
