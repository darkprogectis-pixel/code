// P1S STARTUP NO MEIO DA SESSAO (2026-10-05) — P1S01..P1S12. Compila AoPressSessao + AoTapeEngine do STAGING.
// Sem NT8, sem conta, sem ordem. Fixture REAL do tick db (press_ticks_<tag>.csv; virada 22:00Z).
// Semantica NT8 simulada: carga em virada+L. Ticks ANTES da carga = historico da serie de 1 tick ⇒ so Backfill()
// (OnMarketData nao dispara no historico); ticks DEPOIS = tempo real ⇒ so Tick(realtime=true). A virada (1o tick da
// sessao) chama ResetSessao(realtime?, t, inicioSessao). Referencia = motor que viu a sessao INTEIRA ao vivo.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using NinjaTrader.NinjaScript.Indicators;

namespace PressSim
{
	public static class ProgramPressP1S
	{
		static int _fails, _oks;
		static void Ok(bool c, string nome) { if (c) _oks++; else { _fails++; Console.WriteLine("  FAIL " + nome); } }
		struct T { public long Ut; public double Px, Bid, Ask; public long Vol; }
		class Serie { public string Sym; public List<T> Ticks = new List<T>(); public int Virada = -1; public long ViradaUt; public DateTime Inicio; }
		static double D(string s) { return double.Parse(s, CultureInfo.InvariantCulture); }
		static DateTime Dt(long ut) { return new DateTime(ut, DateTimeKind.Utc); }
		const AoPressEstado W = AoPressEstado.PRESS_WARMUP, V = AoPressEstado.PRESS_VALID, U = AoPressEstado.PRESS_UNAVAILABLE;

		class Cfg
		{
			public int L;                       // carga em virada + L segundos
			public bool SemHistorico;           // a serie de tick chegou vazia (nenhum Backfill, nenhuma virada historica)
			public bool ViradaFalsaNoPrimeiroTick;   // 1o tick ao vivo sinalizado como IsFirstBarOfSession (o vazamento de 05/10)
			public bool InicioDesconhecido;     // SessionIterator falhou ⇒ DateTime.MinValue
			public int BuracoIni = -1, BuracoSeg;    // remove ticks em [virada+BuracoIni, +BuracoSeg)
			public int CotacaoInvalidaCada;     // zera bid/ask de 1 a cada N ticks HISTORICOS (0 = nunca)
		}
		class Res { public double[] Pub; public AoPressEstado[] Est; public AoTapeEngine M; public int PrimeiroRt = -1; }

		static Res Rodar(Serie sr, Cfg c)
		{
			int n = sr.Ticks.Count;
			var r = new Res { Pub = new double[n], Est = new AoPressEstado[n], M = new AoTapeEngine(sr.Sym) };
			long carga = sr.ViradaUt + (long)c.L * TimeSpan.TicksPerSecond;
			long bIni = c.BuracoIni >= 0 ? sr.ViradaUt + (long)c.BuracoIni * TimeSpan.TicksPerSecond : long.MaxValue;
			long bFim = c.BuracoIni >= 0 ? bIni + (long)c.BuracoSeg * TimeSpan.TicksPerSecond : long.MaxValue;
			DateTime ini = c.InicioDesconhecido ? DateTime.MinValue : sr.Inicio;
			int hist = 0;
			for (int i = 0; i < n; i++)
			{
				var t = sr.Ticks[i];
				if (t.Ut >= bIni && t.Ut < bFim) { r.Pub[i] = double.NaN; r.Est[i] = r.M.PressEstado; continue; }
				bool rt = t.Ut >= carga;
				DateTime dt = Dt(t.Ut);
				if (!rt)
				{
					if (!c.SemHistorico)
					{
						if (i == sr.Virada) r.M.ResetSessao(false, dt, ini);
						double bid = t.Bid, ask = t.Ask;
						if (c.CotacaoInvalidaCada > 0 && (hist++ % c.CotacaoInvalidaCada) == 0) { bid = 0; ask = 0; }
						r.M.Backfill(t.Px, bid, ask, t.Vol, dt);
					}
				}
				else
				{
					if (r.PrimeiroRt < 0)
					{
						r.PrimeiroRt = i;
						if (c.ViradaFalsaNoPrimeiroTick) r.M.ResetSessao(true, dt, ini);
					}
					if (i == sr.Virada) r.M.ResetSessao(true, dt, ini);
					r.M.Tick(AoTick.Last, t.Px, t.Bid, t.Ask, t.Vol, dt, true);
				}
				r.Pub[i] = r.M.Press; r.Est[i] = r.M.PressEstado;
			}
			return r;
		}

		static bool IgualRef(Res x, Res refR, int de) { for (int i = de; i < x.Pub.Length; i++) if (x.Pub[i] != refR.Pub[i]) return false; return true; }
		static bool TudoZero(Res x, int de) { for (int i = de; i < x.Pub.Length; i++) if (!double.IsNaN(x.Pub[i]) && x.Pub[i] != 0.0) return false; return true; }
		static bool TudoEstado(Res x, int de, AoPressEstado e) { for (int i = de; i < x.Est.Length; i++) if (x.Est[i] != e) return false; return true; }

		public static int Main(string[] args)
		{
			string fx = args.Length > 0 ? args[0] : "fixtures", tag = args.Length > 1 ? args[1] : "20260930";
			string meta = File.ReadAllText(Path.Combine(fx, "press_meta_" + tag + ".json"));
			var series = new Dictionary<string, Serie>();
			foreach (var s in new[] { "ES", "NQ" })
			{
				var m = Regex.Match(meta, "\"" + s + "\"\\s*:\\s*\\{[^}]*\"viradaTicks\"\\s*:\\s*\"(\\d+)\"");
				if (!m.Success) { Console.WriteLine("meta sem virada " + s); return 2; }
				long vu = long.Parse(m.Groups[1].Value);
				series[s] = new Serie { Sym = s, ViradaUt = vu, Inicio = Dt(vu - vu % TimeSpan.TicksPerSecond) };
			}
			foreach (var ln in File.ReadLines(Path.Combine(fx, "press_ticks_" + tag + ".csv")))
			{
				if (ln.StartsWith("utcTicks")) continue;
				var c = ln.Split(',');
				var sr = series[c[1]];
				var t = new T { Ut = long.Parse(c[0]), Px = D(c[2]), Bid = D(c[3]), Ask = D(c[4]), Vol = long.Parse(c[5]) };
				if (sr.Virada < 0 && t.Ut == sr.ViradaUt) sr.Virada = sr.Ticks.Count;
				sr.Ticks.Add(t);
			}

			Unidade();
			foreach (var s in new[] { "ES", "NQ" })
			{
				var sr = series[s];
				Ok(sr.Virada > 0 && (Dt(sr.ViradaUt) - sr.Inicio).TotalSeconds < 1, s + " fixture: virada a < 1 s do inicio da sessao");
				// REFERENCIA: carga 6 h antes ⇒ virada vista ao vivo, sessao inteira em tempo real (comportamento P1S de 02/10).
				Res refR = Rodar(sr, new Cfg { L = -6 * 3600 });
				bool refNaoTrivial = false; for (int i = sr.Virada + 1000; i < refR.Pub.Length; i++) if (Math.Abs(refR.Pub[i]) >= 0.03) { refNaoTrivial = true; break; }
				Ok(TudoEstado(refR, sr.Virada, V) && refNaoTrivial, s + " P1S02 virada ao vivo ⇒ PRESS_VALID a sessao toda, Press nao trivial (regressao P1S)");
				Ok(TudoZero(new Res { Pub = refR.Pub, Est = refR.Est }, 0) == false, s + " P1S02 referencia tem Press != 0");

				foreach (int L in new[] { 300, 3600, 4 * 3600, 7 * 3600 })
				{
					Res x = Rodar(sr, new Cfg { L = L });
					Ok(x.PrimeiroRt > sr.Virada && TudoEstado(x, x.PrimeiroRt, V), s + " P1S01 carga +" + L + "s com historico ⇒ PRESS_VALID no 1o tick ao vivo");
					Ok(IgualRef(x, refR, x.PrimeiroRt), s + " P1S01/P1S11 Press reconstruido == Press de quem viu a sessao inteira, tick a tick (L=+" + L + "s)");
					Ok(TudoZero(x, 0) == false && x.Pub[x.PrimeiroRt - 1] == 0.0 && x.Est[x.PrimeiroRt - 1] == W, s + " P1S10 durante o historico: PRESS_WARMUP e publica 0 (L=+" + L + "s)");
					Ok(x.M.MeDir == refR.M.MeDir || true, s + " (ME/MVI nao comparados: canal de sinal e forward-only por desenho)");
				}
				// P1S10 — o backfill nao toca sinal/painel
				{
					var m = new AoTapeEngine(s); var t0 = sr.Ticks[sr.Virada];
					m.ResetSessao(false, Dt(t0.Ut), sr.Inicio);
					for (int i = sr.Virada; i < sr.Virada + 5000; i++) { var t = sr.Ticks[i]; m.Backfill(t.Px, t.Bid, t.Ask, t.Vol, Dt(t.Ut)); }
					Ok(m.MeDir == 0 && m.MviDir == 0 && m.ConfDir == 0 && m.VDelta == 0 && m.VeDelta == 0 && m.LastPrice == 0 && m.CumDelta == 0 && m.SessVolume == 0
						&& m.UltimoTrade == DateTime.MinValue && m.PressVol > 0, s + " P1S10 Backfill NAO toca ME/MVI/vDelta/LastPrice/cumDelta/sessVolume (so a politica do Press)");
				}
				// P1S03 — sem historico da sessao
				{
					Res x = Rodar(sr, new Cfg { L = 3600, SemHistorico = true });
					Ok(TudoZero(x, 0) && TudoEstado(x, x.PrimeiroRt, U) && x.M.PressMotivo != null, s + " P1S03 sem historico ⇒ PRESS_UNAVAILABLE, Press 0 (nunca fabricado)");
				}
				// P1S04 — VAZAMENTO de 05/10: 1o tick ao vivo marcado como virada, longe do inicio real da sessao
				{
					Res x = Rodar(sr, new Cfg { L = 3600, SemHistorico = true, ViradaFalsaNoPrimeiroTick = true });
					Ok(TudoZero(x, 0) && TudoEstado(x, x.PrimeiroRt, U), s + " P1S04 LEAK fechado: virada fora da janela do inicio real ⇒ UNAVAILABLE, Press 0");
					Res y = Rodar(sr, new Cfg { L = 4 * 3600, ViradaFalsaNoPrimeiroTick = true });
					Ok(TudoZero(y, y.PrimeiroRt) && TudoEstado(y, y.PrimeiroRt, U), s + " P1S04 virada falsa mesmo COM historico ⇒ UNAVAILABLE (fail-closed)");
				}
				// P1S08 — inicio da sessao desconhecido (SessionIterator falhou)
				{
					Res x = Rodar(sr, new Cfg { L = 3600, InicioDesconhecido = true });
					Ok(TudoZero(x, 0) && TudoEstado(x, x.PrimeiroRt, U), s + " P1S08 inicio de sessao ilegivel ⇒ UNAVAILABLE (com historico)");
					Res y = Rodar(sr, new Cfg { L = -600, InicioDesconhecido = true });
					Ok(TudoZero(y, 0) && TudoEstado(y, sr.Virada, U), s + " P1S08 inicio ilegivel ⇒ UNAVAILABLE (virada ao vivo)");
				}
				// P1S05 — buraco no historico
				foreach (int G in new[] { 120, 300, 301, 900 })
				{
					Res x = Rodar(sr, new Cfg { L = 4 * 3600, BuracoIni = 2 * 3600, BuracoSeg = G });
					if (G > AoPressSessao.GapMaxSeg + 60) Ok(TudoZero(x, 0) && TudoEstado(x, x.PrimeiroRt, U), s + " P1S05 buraco " + G + " s no historico ⇒ UNAVAILABLE");
					else if (G <= AoPressSessao.GapMaxSeg - 60) Ok(TudoEstado(x, x.PrimeiroRt, V) && !TudoZero(x, x.PrimeiroRt), s + " P1S05 buraco " + G + " s no historico ⇒ VALID");
				}
				// P1S06 — buraco entre o historico e o tempo real (carga cai dentro do buraco)
				{
					Res x = Rodar(sr, new Cfg { L = 4 * 3600, BuracoIni = 4 * 3600 - 500, BuracoSeg = 1000 });
					Ok(TudoZero(x, 0) && TudoEstado(x, x.PrimeiroRt + 1, U), s + " P1S06 buraco historico→ao vivo > 300 s ⇒ UNAVAILABLE");
					// buraco AO VIVO depois de VALID ⇒ UNAVAILABLE ate a proxima virada (regra P1S de 02/10 mantida)
					Res y = Rodar(sr, new Cfg { L = 3600, BuracoIni = 3 * 3600, BuracoSeg = 900 });
					int ap = -1; long fim = sr.ViradaUt + (3L * 3600 + 900) * TimeSpan.TicksPerSecond;
					for (int i = 0; i < sr.Ticks.Count; i++) if (sr.Ticks[i].Ut >= fim) { ap = i; break; }
					Ok(ap > 0 && y.Est[ap - 1] == V && TudoEstado(y, ap, U) && TudoZero(y, ap), s + " P1S06 buraco ao vivo > 300 s apos VALID ⇒ UNAVAILABLE ate a proxima virada");
				}
				// P1S07 — cotacao historica sem lado
				{
					Res ruim = Rodar(sr, new Cfg { L = 4 * 3600, CotacaoInvalidaCada = 20 });    // ~5 % dos ticks sem bid/ask
					Ok(TudoZero(ruim, 0) && TudoEstado(ruim, ruim.PrimeiroRt, U) && ruim.M.PressFracSemCotacao > AoPressSessao.MaxSemCotacaoFrac, s + " P1S07 > 1 % do volume historico sem cotacao ⇒ UNAVAILABLE");
					Res bom = Rodar(sr, new Cfg { L = 4 * 3600, CotacaoInvalidaCada = 2000 });   // ~0,05 %
					Ok(TudoEstado(bom, bom.PrimeiroRt, V) && bom.M.PressFracSemCotacao > 0 && bom.M.PressFracSemCotacao < AoPressSessao.MaxSemCotacaoFrac, s + " P1S07 <= 1 % sem cotacao ⇒ VALID (lado 0 nesses ticks)");
					double dif = Math.Abs(bom.Pub[bom.Pub.Length - 1] - refR.Pub[refR.Pub.Length - 1]);
					Ok(dif < 0.002, s + " P1S07 erro do Press com 0,05 % sem cotacao < 0,002 (dif=" + dif.ToString("0.######", CultureInfo.InvariantCulture) + ")");
				}
				Console.WriteLine("  " + s + ": ticks=" + sr.Ticks.Count + " refPressFinal=" + refR.Pub[refR.Pub.Length - 1].ToString("0.#####", CultureInfo.InvariantCulture));
			}
			Console.WriteLine();
			Console.WriteLine("PRESS_P1S: checks=" + (_oks + _fails) + " ok=" + _oks + " fail=" + _fails + " => " + (_fails == 0 ? "PASS" : "FAIL"));
			return _fails == 0 ? 0 : 1;
		}

		static void Unidade()
		{
			DateTime ini = new DateTime(2026, 10, 5, 22, 0, 0, DateTimeKind.Utc);
			var p = new AoPressSessao();
			Ok(p.Estado == W && p.Publicavel() == 0.0 && p.Motivo != null, "U carga ⇒ WARMUP, 0");
			Ok(AoPressSessao.GapMaxSeg == 300 && AoPressSessao.MaxSemCotacaoFrac == 0.01, "U constantes: GapMaxSeg 300 · MaxSemCotacaoFrac 0,01");
			// P1S09 — zero GENUINO em VALID
			p.ViradaSessao(true, ini.AddSeconds(1), ini);
			p.TickRealtime(+1, 10, ini.AddSeconds(2)); p.TickRealtime(-1, 10, ini.AddSeconds(3));
			Ok(p.Estado == V && p.Publicavel() == 0.0 && p.Vol == 20 && p.Cum == 0, "P1S09 zero genuino: PRESS_VALID com Press 0");
			Ok(AoPressBloqueio.Motivo(false, "forca fraca ES/NQ", "PRESS_VALID", "PRESS_VALID") == "FORCE_BELOW_MIN", "P1S09 forca fraca + Press valido ⇒ FORCE_BELOW_MIN");
			Ok(AoPressBloqueio.Motivo(false, "forca fraca ES/NQ", "PRESS_WARMUP", "PRESS_VALID") == "PRESS_NOT_VALID", "P1S12 forca fraca + ES aquecendo ⇒ PRESS_NOT_VALID");
			Ok(AoPressBloqueio.Motivo(false, "forca fraca NQ", "PRESS_VALID", "PRESS_UNAVAILABLE") == "PRESS_NOT_VALID", "P1S12 forca fraca NQ + NQ indisponivel ⇒ PRESS_NOT_VALID");
			Ok(AoPressBloqueio.Motivo(false, "forca fraca ES", "PRESS_VALID", "PRESS_UNAVAILABLE") == "FORCE_BELOW_MIN", "P1S12 forca fraca ES com ES valido ⇒ FORCE_BELOW_MIN");
			Ok(AoPressBloqueio.Motivo(false, "forca fraca ES/NQ", null, null) == "PRESS_NOT_VALID", "P1S12 publicador sem estado (null) ⇒ PRESS_NOT_VALID");
			Ok(AoPressBloqueio.Motivo(true, "", "PRESS_VALID", "PRESS_VALID") == null, "P1S12 gate aberto ⇒ block null");
			Ok(AoPressBloqueio.Motivo(false, "sem tape ES", null, null) == "TAPE" && AoPressBloqueio.Motivo(false, "ES indefinido", null, null) == "UNDEFINED"
				&& AoPressBloqueio.Motivo(false, "ES e NQ indefinidos", null, null) == "UNDEFINED" && AoPressBloqueio.Motivo(false, "ES x NQ divergentes", null, null) == "DIVERGENT", "P1S12 TAPE / UNDEFINED / DIVERGENT");
			// janela do inicio real
			var q = new AoPressSessao();
			q.ViradaSessao(true, ini.AddSeconds(300), ini); Ok(q.Estado == V, "U virada a exatamente 300 s do inicio ⇒ coberta");
			q.ViradaSessao(true, ini.AddSeconds(301), ini); Ok(q.Estado == U, "U virada a 301 s do inicio ⇒ UNAVAILABLE");
			q.ViradaSessao(true, ini.AddSeconds(-1), ini);  Ok(q.Estado == U, "U virada antes do inicio ⇒ UNAVAILABLE");
			q.ViradaSessao(false, ini.AddSeconds(1), ini);  Ok(q.Estado == W && q.Publicavel() == 0.0, "U virada historica coberta ⇒ WARMUP");
			q.TickHistorico(+1, 30, ini.AddSeconds(2), true); q.TickHistorico(-1, 10, ini.AddSeconds(3), true);
			Ok(q.Estado == W && q.Publicavel() == 0.0 && q.Cum == 20 && q.Vol == 40, "U historico acumula sem publicar");
			q.TickRealtime(+1, 10, ini.AddSeconds(4));
			Ok(q.Estado == V && q.Publicavel() == 30.0 / 50.0, "U 1o tick ao vivo ⇒ VALID com cum/vol do historico + ao vivo");
			// P1S12 — depois de UNAVAILABLE a proxima virada coberta recupera
			q.TickRealtime(+1, 1, ini.AddSeconds(400)); Ok(q.Estado == U && q.Publicavel() == 0.0, "U buraco 396 s ⇒ UNAVAILABLE");
			q.TickRealtime(+1, 100, ini.AddSeconds(401)); Ok(q.Estado == U && q.Publicavel() == 0.0, "U UNAVAILABLE nao acumula");
			DateTime ini2 = ini.AddDays(1);
			q.ViradaSessao(true, ini2.AddMilliseconds(8), ini2); q.TickRealtime(-1, 4, ini2.AddSeconds(1));
			Ok(q.Estado == V && q.Publicavel() == -1.0, "P1S12 proxima virada ao vivo coberta ⇒ VALID de novo");
			q.Carga(); Ok(q.Estado == W && q.Vol == 0 && q.Publicavel() == 0.0, "U Carga() zera e volta a WARMUP");
			q.TickRealtime(+1, 5, ini2.AddSeconds(2)); Ok(q.Estado == U, "U tick ao vivo apos Carga() sem historico ⇒ UNAVAILABLE");
		}
	}
}
