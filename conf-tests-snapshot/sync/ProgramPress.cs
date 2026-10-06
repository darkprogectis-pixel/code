// P1S Press (2026-10-02; reescrito em 2026-10-05 p/ a API com estados + reconstrucao) — test_press.
// Compila AoPressSessao + AoTapeEngine do STAGING e a versao de 02/10 (backup account-p1s-20261005\before, congelada)
// renomeada p/ AoTapeEngineAntes/AoPressSessaoAntes. Sem NT8, sem conta, sem ordem.
// SEM backfill (modo de 02/10): ticks antes da carga L = Tick(realtime=false) nos dois motores.
// COM backfill (semantica NT8 real): ticks antes da carga = so Backfill() no staging (OnMarketData nao dispara no historico).
//   PR1 unidade AoPressSessao · PR2 invariancia em dados reais + referencia JS · PR2c buraco de tape
//   PR3 nao-regressao staging x 02/10 (ME/MVI/conf/LastPrice/PressBruta + Press publicado SEM historico identico)
//   PR4 controle: carga no meio da sessao — 02/10 publica 0 o resto da sessao; staging reconstroi == Ref(t)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using NinjaTrader.NinjaScript.Indicators;

namespace PressSim
{
	public static class ProgramPress
	{
		static int _fails, _oks;
		static void Ok(bool c, string nome) { if (c) { _oks++; } else { _fails++; Console.WriteLine("  FAIL " + nome); } }

		struct T { public long Ut; public double Px, Bid, Ask; public long Vol; }
		class Serie { public string Sym; public List<T> Ticks = new List<T>(); public int Virada; public long ViradaUt; public DateTime Inicio; }

		public static int Main(string[] args)
		{
			string fx = args.Length > 0 ? args[0] : "fixtures";
			string tag = args.Length > 1 ? args[1] : "20260930";
			PR1();
			var meta = File.ReadAllText(Path.Combine(fx, "press_meta_" + tag + ".json"));
			var series = new Dictionary<string, Serie>();
			foreach (var s in new[] { "ES", "NQ" })
			{
				var m = Regex.Match(meta, "\"" + s + "\"\\s*:\\s*\\{[^}]*\"viradaTicks\"\\s*:\\s*\"(\\d+)\"");
				if (!m.Success) { Console.WriteLine("meta sem virada " + s); return 2; }
				long vu = long.Parse(m.Groups[1].Value);
				series[s] = new Serie { Sym = s, ViradaUt = vu, Virada = -1, Inicio = new DateTime(vu - vu % TimeSpan.TicksPerSecond, DateTimeKind.Utc) };
			}
			// indice global (linha) -> (sym, indice local) p/ casar com a referencia JS
			var globalLocal = new Dictionary<int, int>();
			int gi = 0;
			foreach (var ln in File.ReadLines(Path.Combine(fx, "press_ticks_" + tag + ".csv")))
			{
				if (ln.StartsWith("utcTicks")) continue;
				var c = ln.Split(',');
				var sr = series[c[1]];
				var t = new T { Ut = long.Parse(c[0]), Px = D(c[2]), Bid = D(c[3]), Ask = D(c[4]), Vol = long.Parse(c[5]) };
				if (sr.Virada < 0 && t.Ut == sr.ViradaUt) sr.Virada = sr.Ticks.Count;
				globalLocal[gi] = sr.Ticks.Count; gi++;
				sr.Ticks.Add(t);
			}
			var refs = new List<string[]>();
			foreach (var ln in File.ReadLines(Path.Combine(fx, "press_ref_" + tag + ".csv"))) if (!ln.StartsWith("idx")) refs.Add(ln.Split(','));
			Console.WriteLine("fixture: ticks=" + gi + " ES=" + series["ES"].Ticks.Count + " NQ=" + series["NQ"].Ticks.Count + " refCheckpoints=" + refs.Count);

			foreach (var s in new[] { "ES", "NQ" })
			{
				var sr = series[s];
				Ok(sr.Virada > 0, s + " virada encontrada");
				var cargasAntes = new[] { -6 * 3600, -30 * 60, -5 * 60 };
				var cargasDepois = new[] { 3600, 4 * 3600 };
				// referencia por tick = PressBruta do staging com carga -6h (validada contra o JS nos checkpoints)
				double[] refT = null;
				double[] primeiro = null;
				foreach (int L in cargasAntes)
				{
					double[] pub, bruta, antesPress; bool regOk, polOk; int rt0;
					Rodar(sr, L, -1, 0, false, out pub, out bruta, out antesPress, out regOk, out polOk, out rt0);
					if (refT == null) refT = bruta;
					Ok(regOk, s + " PR3 me/mvi/conf/LastPrice/PressBruta staging == 02/10 (L=" + L + "s)");
					Ok(polOk, s + " PR3 Press publicado staging == 02/10 tick a tick, virada ao vivo (L=" + L + "s)");
					bool antes0 = true; for (int i = 0; i < sr.Virada; i++) if (pub[i] != 0.0) { antes0 = false; break; }
					Ok(antes0, s + " PR2 Press=0 antes da virada (L=" + L + "s)");
					if (primeiro == null) primeiro = pub;
					else { bool igual = true; for (int i = sr.Virada; i < pub.Length; i++) if (pub[i] != primeiro[i]) { igual = false; break; } Ok(igual, s + " PR2 Press publicado identico tick a tick entre cargas (L=" + L + "s vs -6h)"); }
					bool igRef = true; for (int i = sr.Virada; i < pub.Length; i++) if (pub[i] != refT[i]) { igRef = false; break; }
					Ok(igRef, s + " PR2 Press publicado == Ref(t) apos a virada (L=" + L + "s)");
				}
				// referencia JS (checkpoints): |Ref - JS| <= 1e-12
				int nChk = 0; bool jsOk = true;
				foreach (var r in refs)
				{
					if (r[1] != s) continue;
					int loc = globalLocal[int.Parse(r[0])];
					double js = D(r[4]);
					if (Math.Abs(refT[loc] - js) > 1e-12) { jsOk = false; Console.WriteLine("  " + s + " idx " + r[0] + " ref " + refT[loc].ToString("R") + " js " + js.ToString("R")); }
					nChk++;
				}
				Ok(nChk > 10 && jsOk, s + " PR2 Ref(t) == referencia JS P1 em " + nChk + " checkpoints (1e-12)");

				foreach (int L in cargasDepois)
				{
					double[] pub, bruta, antesPress; bool regOk, polOk; int rt0;
					Rodar(sr, L, -1, 0, false, out pub, out bruta, out antesPress, out regOk, out polOk, out rt0);
					Ok(regOk, s + " PR3 staging == 02/10 (L=+" + L + "s)");
					Ok(polOk, s + " PR3 Press publicado staging == 02/10 tick a tick, SEM historico (L=+" + L + "s)");
					bool zero = true; for (int i = 0; i < pub.Length; i++) if (pub[i] != 0.0) { zero = false; break; }
					Ok(zero, s + " PR2 carga apos a virada SEM historico da sessao => Press publicado = 0 em todo tick (L=+" + L + "s)");
					Ok(Predicado(pub, refT, sr.Virada), s + " PR2 predicado Press(t) in {Ref(t),0} no staging (L=+" + L + "s)");
					// PR4 (2026-10-05): MESMA carga COM o historico real da sessao (semantica NT8: Backfill no historico, Tick so ao vivo)
					double[] pubB, brutaB, antesB; bool regB, polB; int rtB;
					Rodar(sr, L, -1, 0, true, out pubB, out brutaB, out antesB, out regB, out polB, out rtB);
					Ok(regB, s + " PR3 backfill NAO altera ME/MVI/conf/LastPrice/PressBruta (staging == 02/10, L=+" + L + "s)");
					bool rec = rtB > sr.Virada, naoTrivial = false;
					for (int i = rtB; rec && i < pubB.Length; i++) { if (pubB[i] != refT[i]) rec = false; if (pubB[i] != 0.0) naoTrivial = true; }
					Ok(rec && naoTrivial, s + " PR4 staging COM historico: Press publicado == Ref(t) desde o 1o tick ao vivo (L=+" + L + "s)");
					bool antes0b = true; for (int i = 0; i < rtB && i < pubB.Length; i++) if (pubB[i] != 0.0) { antes0b = false; break; }
					Ok(antes0b, s + " PR4 durante a reconstrucao (historico) o staging publica 0 (L=+" + L + "s)");
					Ok(Predicado(pubB, refT, sr.Virada), s + " PR2 predicado Press(t) in {Ref(t),0} no staging COM historico (L=+" + L + "s)");
					bool antesZero = true; for (int i = 0; i < antesB.Length; i++) if (antesB[i] != 0.0) { antesZero = false; break; }
					Ok(antesZero, s + " PR4 CONTROLE: a versao de 02/10 publica 0 o resto da sessao na mesma carga (L=+" + L + "s)");
				}
				// PR2c buraco de tape: carga -5 min, remove ticks em [virada+2h, virada+2h+G)
				foreach (int G in new[] { 360, 100 })
				{
					double[] pub, bruta, antesPress; bool regOk, polOk; int rt0;
					int ini = Rodar(sr, -5 * 60, 2 * 3600, G, false, out pub, out bruta, out antesPress, out regOk, out polOk, out rt0);
					Ok(polOk, s + " PR3 Press publicado staging == 02/10 com buraco de tape (G=" + G + "s)");
					bool antesOk = true, depoisOk = true;
					for (int i = sr.Virada; i < pub.Length; i++)
					{
						if (double.IsNaN(pub[i])) continue;   // tick removido
						if (i < ini) { if (pub[i] != bruta[i]) antesOk = false; }
						else if (G > AoPressSessao.GapMaxSeg) { if (pub[i] != 0.0) depoisOk = false; }
						else { if (pub[i] != bruta[i]) depoisOk = false; }
					}
					Ok(antesOk, s + " PR2c antes do buraco Press = pressao da sessao (G=" + G + "s)");
					Ok(depoisOk, s + (G > AoPressSessao.GapMaxSeg ? " PR2c buraco > 300 s => Press 0 ate o fim" : " PR2c buraco <= 300 s => Press mantido") + " (G=" + G + "s)");
				}
			}
			Console.WriteLine();
			Console.WriteLine("PRESS: checks=" + (_oks + _fails) + " ok=" + _oks + " fail=" + _fails + " => " + (_fails == 0 ? "PASS" : "FAIL"));
			return _fails == 0 ? 0 : 1;
		}

		static double D(string s) { return double.Parse(s, CultureInfo.InvariantCulture); }

		static bool Predicado(double[] p, double[] refT, int virada) { return PrimeiraViolacao(p, refT, virada) < 0; }
		static int PrimeiraViolacao(double[] p, double[] refT, int virada)
		{
			for (int i = 0; i < p.Length; i++)
			{
				double r = i >= virada ? refT[i] : 0.0;
				if (p[i] != 0.0 && p[i] != r) return i;
			}
			return -1;
		}

		/// <summary>
		/// Roda staging + versao de 02/10 sobre a serie com carga em virada+L s. Opcionalmente remove os ticks em
		/// [virada+buracoIni, virada+buracoIni+buracoSeg) (marcados NaN). Retorna o indice do 1o tick apos o buraco.
		/// backfill=false: ticks antes da carga = Tick(realtime=false) nos dois (modo de 02/10, sem historico da politica).
		/// backfill=true : ticks antes da carga = so Backfill() no staging; nenhum Tick (OnMarketData nao dispara no historico).
		/// </summary>
		static int Rodar(Serie sr, int L, int buracoIni, int buracoSeg, bool backfill, out double[] pub, out double[] bruta, out double[] antesPress, out bool regOk, out bool polOk, out int primeiroRt)
		{
			int n = sr.Ticks.Count;
			pub = new double[n]; bruta = new double[n]; antesPress = new double[n]; regOk = true; polOk = true; primeiroRt = -1;
			long carga = sr.ViradaUt + (long)L * TimeSpan.TicksPerSecond;
			long bIni = buracoSeg > 0 ? sr.ViradaUt + (long)buracoIni * TimeSpan.TicksPerSecond : long.MaxValue;
			long bFim = buracoSeg > 0 ? bIni + (long)buracoSeg * TimeSpan.TicksPerSecond : long.MaxValue;
			int aposBuraco = n;
			AoTapeEngine stg = new AoTapeEngine(sr.Sym); AoTapeEngineAntes ant = new AoTapeEngineAntes(sr.Sym);
			for (int i = 0; i < n; i++)
			{
				var t = sr.Ticks[i];
				if (t.Ut >= bIni && t.Ut < bFim) { pub[i] = double.NaN; bruta[i] = double.NaN; antesPress[i] = double.NaN; continue; }
				if (t.Ut >= bFim && aposBuraco == n) aposBuraco = i;
				bool rt = t.Ut >= carga;
				if (rt && primeiroRt < 0) primeiroRt = i;
				var dt = new DateTime(t.Ut, DateTimeKind.Utc);
				if (i == sr.Virada) { stg.ResetSessao(rt, dt, sr.Inicio); ant.ResetSessao(rt); }
				if (backfill && !rt) stg.Backfill(t.Px, t.Bid, t.Ask, t.Vol, dt);
				else
				{
					stg.Tick(AoTick.Last, t.Px, t.Bid, t.Ask, t.Vol, dt, rt);
					ant.Tick(AoTick.Last, t.Px, t.Bid, t.Ask, t.Vol, dt, rt);
				}
				pub[i] = stg.Press; bruta[i] = stg.PressBruta; antesPress[i] = ant.Press;
				if (stg.MeDir != ant.MeDir || stg.MviDir != ant.MviDir || stg.ConfDir != ant.ConfDir || stg.LastPrice != ant.LastPrice
					|| stg.PressBruta != ant.PressBruta || stg.CumDelta != ant.CumDelta || stg.SessVolume != ant.SessVolume) regOk = false;
				if (stg.Press != ant.Press) polOk = false;
			}
			return aposBuraco;
		}

		static void PR1()
		{
			var t0 = new DateTime(2026, 9, 30, 22, 0, 0, DateTimeKind.Utc);
			Ok(AoPressSessao.GapMaxSeg == 300, "PR1 GapMaxSeg = 300");
			var p = new AoPressSessao();
			Ok(p.Publicavel() == 0.0 && !p.Completa && p.Motivo != null && p.Estado == AoPressEstado.PRESS_WARMUP, "PR1 motor novo (carga) => 0, WARMUP");
			p.ViradaSessao(true, t0, t0); p.TickRealtime(+1, 15, t0.AddSeconds(1)); p.TickRealtime(-1, 5, t0.AddSeconds(2));
			Ok(p.Publicavel() == 0.5 && p.Completa && p.Motivo == null, "PR1 virada ao vivo => cum/vol dos ticks ao vivo (10/20)");
			p.Carga();
			Ok(p.Publicavel() == 0.0 && !p.Completa && p.Vol == 0, "PR1 Carga() => 0");
			p.ViradaSessao(false, t0, t0);
			Ok(p.Publicavel() == 0.0 && !p.Completa && p.Estado == AoPressEstado.PRESS_WARMUP, "PR1 virada historica => 0 (WARMUP ate o 1o tick ao vivo)");
			p.ViradaSessao(true, t0, t0); p.TickRealtime(-1, 3, t0); p.TickRealtime(0, 9, t0.AddSeconds(1));
			Ok(p.Publicavel() == -0.25, "PR1 sinal negativo preservado (-3/12)");
			p.ViradaSessao(true, t0, t0);
			Ok(p.Completa && p.Publicavel() == 0.0, "PR1 volume 0 => 0");
			p.TickRealtime(+1, 5, t0); p.TickRealtime(+1, 5, t0.AddSeconds(113));
			Ok(p.Completa, "PR1 gap 113 s => mantem");
			p.TickRealtime(+1, 5, t0.AddSeconds(413));
			Ok(p.Completa, "PR1 gap exatamente 300 s => mantem (regra > 300)");
			p.TickRealtime(+1, 5, t0.AddSeconds(714));
			Ok(!p.Completa && p.Publicavel() == 0.0 && p.Estado == AoPressEstado.PRESS_UNAVAILABLE, "PR1 gap 301 s => 0 (UNAVAILABLE)");
			p.TickRealtime(+1, 5, t0.AddSeconds(720));
			Ok(!p.Completa, "PR1 continua 0 apos o buraco ate a proxima virada");
			DateTime t1 = t0.AddDays(1);
			p.ViradaSessao(true, t1, t1); p.TickRealtime(+1, 5, t1); p.TickRealtime(0, 5, t1.AddSeconds(1));
			Ok(p.Completa && p.Publicavel() == 0.5, "PR1 proxima virada ao vivo => volta");
			p.TickRealtime(+1, 5, DateTime.MinValue);
			Ok(p.Completa && p.Vol == 10, "PR1 tick sem tempo ignorado");
			// ordem A: 1o trade da sessao ANTES da virada (pausa de 60 min desliga, a virada religa)
			DateTime tb = t0.AddMinutes(60);
			var a = new AoPressSessao(); a.ViradaSessao(true, t0, t0); a.TickRealtime(+1, 1, t0); a.TickRealtime(+1, 1, tb); bool aIncompl = !a.Completa; a.ViradaSessao(true, tb, tb);
			// ordem B: virada ANTES do 1o trade (o carimbo foi zerado, o gap nao e checado)
			var b = new AoPressSessao(); b.ViradaSessao(true, t0, t0); b.TickRealtime(+1, 1, t0); b.ViradaSessao(true, tb, tb); b.TickRealtime(+1, 1, tb);
			Ok(aIncompl && a.Completa && b.Completa, "PR1 ordem tick/virada A e B => mesmo resultado (completa)");
			// tick fora de ordem (mais antigo) nao recua o carimbo
			var c = new AoPressSessao(); c.ViradaSessao(true, t0, t0); c.TickRealtime(+1, 1, t0.AddSeconds(200)); c.TickRealtime(+1, 1, t0); c.TickRealtime(+1, 1, t0.AddSeconds(450));
			Ok(c.Completa, "PR1 tick fora de ordem nao recua o carimbo");
		}
	}
}
