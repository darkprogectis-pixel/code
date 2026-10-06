// SEAM P1S test_press_seam (2026-10-05) — EXECUTA a costura REAL do staging entre o NT8 e a politica do Press:
//   AoControlCenter.OnBarUpdate / OnMarketData / InicioSessaoTape (corpos reais extraidos) → AoMarketDataPublisher REAL →
//   AoTapeEngine + AoPressSessao REAIS → AlfaOmegaSharedState REAL (Press_ES/NQ, PressState_ES/NQ, AoPublisher real).
//   AlfaOmegaFlowOne.PressSerieTick (corpo real extraido) → AoPressSessao REAL.
// O NT8 e imitado por SeamHost (SeamStubs.cs). Fixture REAL do tick db (press_ticks_<tag>.csv). Sem NT8, sem conta, sem ordem.
// Semantica NT8 simulada: serie de 1 tick ⇒ 1 barra por tick; antes da carga = State.Historical (so OnBarUpdate); depois =
// State.Realtime (OnMarketData + OnBarUpdate, nas DUAS ordens); IsFirstBarOfSession = 1a barra da serie em cada sessao.
// LIMITE: o que Bars.GetBid/GetAsk e SessionIterator devolvem dentro do NT8 so se prova pos-F5; aqui se prova o que o codigo faz
// com cada resposta possivel (boa, NaN, 0, excecao, sessao desconhecida).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;

public static class ProgramSeam
{
	static int _fails, _oks;
	static void Ok(bool c, string nome) { if (c) { _oks++; Console.WriteLine("PASS " + nome); } else { _fails++; Console.WriteLine("FAIL " + nome); } }
	struct Tk { public long Ut; public int Bi; public double Px, Bid, Ask; public long Vol; }
	static readonly List<Tk> _t = new List<Tk>();
	static readonly long[] _viradaUt = new long[3];
	static readonly int[] _viradaIdx = { -1, -1, -1 };
	static readonly string[] Sym = { null, "ES", "NQ" };
	static double D(string s) { return double.Parse(s, CultureInfo.InvariantCulture); }
	static DateTime Dt(long ut) { return new DateTime(ut, DateTimeKind.Utc); }
	/// <summary>Template de sessao do fixture: a sessao comeca as 22:00:00Z (18:00 ET).</summary>
	static DateTime SessaoDe(DateTime t) { DateTime d = new DateTime(t.Year, t.Month, t.Day, 22, 0, 0, DateTimeKind.Utc); return t >= d ? d : d.AddDays(-1); }
	const string W = "PRESS_WARMUP", V = "PRESS_VALID", U = "PRESS_UNAVAILABLE";

	class Cfg
	{
		public int L;                         // carga em virada + L segundos
		public bool SemHistorico;             // serie de tick sem nenhuma barra historica
		public int HistoricoDesde = int.MinValue;   // historico so a partir de virada + N s (int.MinValue = desde o inicio do fixture)
		public bool OmdAntes = true;          // tempo real: OnMarketData antes do OnBarUpdate (false = depois)
		public bool IterFalha, IterLanca;     // SessionIterator: GetNextSession false / construtor lanca
		public int CotacaoHist;               // 0 = real · 1 = NaN · 2 = zero · 3 = GetBid/GetAsk lancam
		public long Id;                       // 0 = id novo do AoPublisher
		public bool IdZero;                   // _tapePubId = 0 (painel sem tape interno)
	}
	class Res { public double[] Pub; public string[] Est; public int[] PrimeiroRt = { -1, -1, -1 }; public int IteradoresEs; public int BarrasHist; }

	static double PubDe(int bi) { return bi == 1 ? AlfaOmegaSharedState.Press_ES : AlfaOmegaSharedState.Press_NQ; }
	static string EstDe(int bi) { return bi == 1 ? AlfaOmegaSharedState.PressState_ES : AlfaOmegaSharedState.PressState_NQ; }

	static Res Rodar(Cfg c)
	{
		int n = _t.Count;
		var r = new Res { Pub = new double[n], Est = new string[n] };
		long id = c.IdZero ? 0 : AoPublisher.NovoId();
		var h = new SeamCC { _tapePubId = id };
		for (int b = 0; b < 3; b++) h.BarsArray[b] = new Bars { SessaoDe = SessaoDe, IteradorFalha = c.IterFalha, IteradorLanca = c.IterLanca, GetBidLanca = c.CotacaoHist == 3 };
		long baseVirada = Math.Min(_viradaUt[1], _viradaUt[2]);
		long carga = baseVirada + (long)c.L * TimeSpan.TicksPerSecond;
		long histDesde = c.HistoricoDesde == int.MinValue ? long.MinValue : baseVirada + (long)c.HistoricoDesde * TimeSpan.TicksPerSecond;
		var barra = new int[] { -1, -1, -1 };
		var sess = new DateTime[3];
		try
		{
			for (int i = 0; i < n; i++)
			{
				Tk t = _t[i];
				bool rt = t.Ut >= carga;
				if (!rt && (c.SemHistorico || t.Ut < histDesde)) { r.Pub[i] = double.NaN; continue; }
				DateTime dt = Dt(t.Ut);
				Bars bs = h.BarsArray[t.Bi];
				DateTime s = SessaoDe(dt);
				bs.IsFirstBarOfSession = s != sess[t.Bi]; sess[t.Bi] = s;
				bs.BarraAtual = ++barra[t.Bi];
				bool cotReal = rt || c.CotacaoHist == 0;
				bs.BidAtual = cotReal ? t.Bid : (c.CotacaoHist == 1 ? double.NaN : 0.0);
				bs.AskAtual = cotReal ? t.Ask : (c.CotacaoHist == 1 ? double.NaN : 0.0);
				h.BarsInProgress = t.Bi; h.CurrentBar = barra[t.Bi]; h.IsFirstTickOfBar = true;
				h.Close.Valor = t.Px; h.Volume.Valor = t.Vol; h.Time.Valor = dt;
				if (!rt)
				{
					h.State = State.Historical; r.BarrasHist++;
					h.OnBarUpdate();
					r.Pub[i] = double.NaN;
				}
				else
				{
					h.State = State.Realtime;
					if (r.PrimeiroRt[t.Bi] < 0) r.PrimeiroRt[t.Bi] = i;
					var e = new MarketDataEventArgs { MarketDataType = MarketDataType.Last, Price = t.Px, Bid = t.Bid, Ask = t.Ask, Volume = t.Vol, Time = dt };
					if (c.OmdAntes) { h.OnMarketData(e); h.OnBarUpdate(); } else { h.OnBarUpdate(); h.OnMarketData(e); }
					r.Pub[i] = PubDe(t.Bi); r.Est[i] = EstDe(t.Bi);
				}
			}
			r.IteradoresEs = h.BarsArray[1].IteradoresCriados;
		}
		finally { if (id > 0) AoMarketDataPublisher.Encerrar(id); }   // State.Terminated real: libera o posto de publicador
		return r;
	}

	/// <summary>Referencia: motor REAL que viu a sessao INTEIRA ao vivo. resetAntes = virada antes do 1o trade da sessao (ou depois).</summary>
	static double[] Referencia(bool resetAntes)
	{
		var m = new AoTapeEngine[] { null, new AoTapeEngine("ES"), new AoTapeEngine("NQ") };
		var p = new double[_t.Count];
		for (int i = 0; i < _t.Count; i++)
		{
			Tk t = _t[i]; DateTime dt = Dt(t.Ut);
			bool vir = i == _viradaIdx[t.Bi];
			if (vir && resetAntes) m[t.Bi].ResetSessao(true, dt, SessaoDe(dt));
			m[t.Bi].Tick(AoTick.Last, t.Px, t.Bid, t.Ask, t.Vol, dt, true);
			if (vir && !resetAntes) m[t.Bi].ResetSessao(true, dt, SessaoDe(dt));
			p[i] = m[t.Bi].Press;
		}
		return p;
	}

	static bool Igual(Res x, double[] rf, int bi, int de) { for (int i = de; i < _t.Count; i++) if (_t[i].Bi == bi && x.Pub[i] != rf[i]) return false; return true; }
	static bool Zero(Res x, int bi) { int k = 0; for (int i = 0; i < _t.Count; i++) if (_t[i].Bi == bi && x.Est[i] != null) { k++; if (x.Pub[i] != 0.0) return false; } return k > 0; }
	static bool Estado(Res x, int bi, int de, string e) { int k = 0; for (int i = de; i < _t.Count; i++) if (_t[i].Bi == bi && x.Est[i] != null) { k++; if (x.Est[i] != e) return false; } return k > 0; }
	static bool NaoTrivial(double[] rf, int bi, int de) { for (int i = de; i < _t.Count; i++) if (_t[i].Bi == bi && Math.Abs(rf[i]) >= 0.03) return true; return false; }
	static bool Ambos(Func<int, bool> f) { return f(1) && f(2); }

	public static int Main(string[] args)
	{
		try
		{
			string fx = args.Length > 0 ? args[0] : "fixtures", tag = args.Length > 1 ? args[1] : "20260930";
			string meta = File.ReadAllText(Path.Combine(fx, "press_meta_" + tag + ".json"));
			for (int b = 1; b <= 2; b++)
			{
				var m = Regex.Match(meta, "\"" + Sym[b] + "\"\\s*:\\s*\\{[^}]*\"viradaTicks\"\\s*:\\s*\"(\\d+)\"");
				if (!m.Success) { Console.WriteLine("meta sem virada " + Sym[b]); return 2; }
				_viradaUt[b] = long.Parse(m.Groups[1].Value);
			}
			foreach (string ln in File.ReadLines(Path.Combine(fx, "press_ticks_" + tag + ".csv")))
			{
				if (ln.StartsWith("utcTicks")) continue;
				string[] c = ln.Split(',');
				int bi = c[1] == "ES" ? 1 : 2;
				var t = new Tk { Ut = long.Parse(c[0]), Bi = bi, Px = D(c[2]), Bid = D(c[3]), Ask = D(c[4]), Vol = long.Parse(c[5]) };
				if (_viradaIdx[bi] < 0 && t.Ut == _viradaUt[bi]) _viradaIdx[bi] = _t.Count;
				_t.Add(t);
			}
			bool ordenado = true; for (int i = 1; i < _t.Count; i++) if (_t[i].Ut < _t[i - 1].Ut) { ordenado = false; break; }
			Ok(ordenado && Ambos(b => _viradaIdx[b] > 0 && (Dt(_viradaUt[b]) - SessaoDe(Dt(_viradaUt[b]))).TotalSeconds < 1),
				"SEAM00 fixture real " + tag + ": " + _t.Count + " ticks ES+NQ em ordem de tempo; virada de cada serie a < 1 s das 22:00:00Z");

			double[] rf = Referencia(true), rfDepois = Referencia(false);
			Ok(Ambos(b => NaoTrivial(rf, b, _viradaIdx[b] + 1000)), "SEAM00b referencia (sessao inteira ao vivo) tem |Press| >= 0.03 nas duas series (comparacao nao trivial)");

			// ── SEAM01 — startup no meio da sessao COM historico: a costura real reconstrui e publica ──
			foreach (int L in new[] { 300, 3600, 4 * 3600 })
				foreach (bool omd in new[] { true, false })
				{
					Res r = Rodar(new Cfg { L = L, OmdAntes = omd });
					Ok(Ambos(b => r.PrimeiroRt[b] > _viradaIdx[b] && r.Est[r.PrimeiroRt[b]] == V && Estado(r, b, r.PrimeiroRt[b], V)),
						"SEAM01a carga +" + L + " s (" + (omd ? "OnMarketData→OnBarUpdate" : "OnBarUpdate→OnMarketData") + "): PressState publicado = PRESS_VALID desde o 1o tick ao vivo, ES e NQ (" + r.BarrasHist + " barras historicas pelo OnBarUpdate real)");
					Ok(Ambos(b => Igual(r, rf, b, r.PrimeiroRt[b])),
						"SEAM01b carga +" + L + " s: Press_ES/Press_NQ PUBLICADOS no SharedState == motor que viu a sessao inteira ao vivo, tick a tick");
					Ok(r.IteradoresEs == 1, "SEAM01c SessionIterator criado 1x por serie (cache por BarsInProgress), nao a cada virada (" + r.IteradoresEs + ")");
				}
			Ok(AoDiag.Marcos.Any(x => x.StartsWith("AoPress|ES PRESS_VALID")) && AoDiag.Marcos.Any(x => x.StartsWith("AoPress|NQ PRESS_VALID")), "SEAM01d transicao para PRESS_VALID publicada vira marco de diagnostico AoPress (ES e NQ; marcos=" + AoDiag.Marcos.Count + ")");

			// ── SEAM02 — sem historico: o 1o tick ao vivo chega como IsFirstBarOfSession (o vazamento de 05/10) ──
			foreach (bool omd in new[] { true, false })
			{
				Res r = Rodar(new Cfg { L = 3600, SemHistorico = true, OmdAntes = omd });
				Ok(r.BarrasHist == 0 && Ambos(b => Estado(r, b, 0, U) && Zero(r, b)),
					"SEAM02 sem historico (" + (omd ? "OMD→OBU" : "OBU→OMD") + "): virada falsa no 1o tick ao vivo NAO valida a sessao ⇒ PRESS_UNAVAILABLE, Press publicado 0 o tempo todo");
			}

			// ── SEAM03 — inicio da sessao ilegivel (SessionIterator) ⇒ fail-closed ──
			Res r3 = Rodar(new Cfg { L = 3600, IterLanca = true });
			Ok(Ambos(b => Estado(r3, b, 0, U) && Zero(r3, b)), "SEAM03a SessionIterator lanca ⇒ InicioSessaoTape devolve desconhecido ⇒ PRESS_UNAVAILABLE, Press 0 (nenhuma excecao sobe)");
			Res r3b = Rodar(new Cfg { L = 3600, IterFalha = true });
			Ok(Ambos(b => Estado(r3b, b, 0, U) && Zero(r3b, b)), "SEAM03b GetNextSession = false ⇒ PRESS_UNAVAILABLE, Press 0");

			// ── SEAM04 — historico que comeca DEPOIS do inicio da sessao ──
			Res r4 = Rodar(new Cfg { L = 3600, HistoricoDesde = 600 });
			Ok(r4.BarrasHist > 0 && Ambos(b => Estado(r4, b, 0, U) && Zero(r4, b)), "SEAM04 historico so a partir de virada + 600 s (1a barra carregada ≠ inicio real) ⇒ PRESS_UNAVAILABLE, Press 0");
			Res r4b = Rodar(new Cfg { L = 3600, HistoricoDesde = 120 });
			Ok(Ambos(b => Estado(r4b, b, r4b.PrimeiroRt[b], V)), "SEAM04b historico a partir de virada + 120 s (dentro da janela de 300 s) ⇒ PRESS_VALID");

			// ── SEAM05 — cotacao historica inutilizavel ⇒ fail-closed ──
			string[] nomeCot = { null, "NaN", "zero", "GetBid/GetAsk lancam" };
			for (int k = 1; k <= 3; k++)
			{
				Res r5 = Rodar(new Cfg { L = 3600, CotacaoHist = k });
				Ok(Ambos(b => Estado(r5, b, 0, U) && Zero(r5, b)), "SEAM05 bid/ask historico = " + nomeCot[k] + " ⇒ PRESS_UNAVAILABLE, Press 0 (nunca um Press reconstruido sem lado)");
			}

			// ── SEAM06 — virada vista AO VIVO pela costura (carga antes da virada) ──
			Res r6 = Rodar(new Cfg { L = -7200, OmdAntes = false });
			Ok(Ambos(b => Estado(r6, b, _viradaIdx[b], V) && Igual(r6, rf, b, _viradaIdx[b])),
				"SEAM06a carga 2 h antes da virada, OnBarUpdate→OnMarketData: PRESS_VALID a partir da virada e Press publicado == referencia (virada antes do 1o trade)");
			Res r6b = Rodar(new Cfg { L = -7200, OmdAntes = true });
			Ok(Ambos(b => r6b.Est[_viradaIdx[b]] == U && r6b.Pub[_viradaIdx[b]] == 0.0 && Estado(r6b, b, _viradaIdx[b] + 1, V) && Igual(r6b, rfDepois, b, _viradaIdx[b])),
				"SEAM06b mesma carga, OnMarketData→OnBarUpdate: no tick da virada o publicado ainda e UNAVAILABLE/0 (publica antes do reset: fail-closed por 1 tick), PRESS_VALID do tick seguinte em diante e Press publicado == referencia (1o trade antes da virada) — as duas ordens sao seguras");
			Ok(Ambos(b => { int k = 0; for (int j = r6.PrimeiroRt[b]; j < _viradaIdx[b]; j++) if (_t[j].Bi == b) { k++; if (r6.Est[j] != U || r6.Pub[j] != 0.0) return false; } return k > 0; }),
				"SEAM06c ANTES da virada (ticks ao vivo das 20:00Z ate a pausa) (resto da sessao anterior, carregada pela metade): PRESS_UNAVAILABLE, Press 0");

			// ── SEAM07 — roteamento: serie primaria e painel sem tape interno nao tocam o barramento ──
			{
				long id = AoPublisher.NovoId();
				var h = new SeamCC { _tapePubId = id };
				for (int b = 0; b < 3; b++) h.BarsArray[b] = new Bars { SessaoDe = SessaoDe };
				DateTime antes = AlfaOmegaSharedState.LastUpdate_ES; string estAntes = AlfaOmegaSharedState.PressState_ES; double pAntes = AlfaOmegaSharedState.Press_ES;
				Tk t = _t[_viradaIdx[1] + 5000]; DateTime dt = Dt(t.Ut);
				h.BarsInProgress = 0; h.State = State.Realtime; h.CurrentBar = 0; h.BarsArray[0].BarraAtual = 0; h.BarsArray[0].IsFirstBarOfSession = true;
				h.Close.Valor = t.Px; h.Volume.Valor = t.Vol; h.Time.Valor = dt;
				var e = new MarketDataEventArgs { MarketDataType = MarketDataType.Last, Price = t.Px, Bid = t.Bid, Ask = t.Ask, Volume = t.Vol, Time = dt };
				h.OnBarUpdate(); h.OnMarketData(e);
				Ok(AlfaOmegaSharedState.LastUpdate_ES == antes && AlfaOmegaSharedState.PressState_ES == estAntes && AlfaOmegaSharedState.Press_ES == pAntes,
					"SEAM07a serie primaria (BarsInProgress 0) nao entra no tape interno: barramento intocado");
				AoMarketDataPublisher.Encerrar(id);
				var h0 = new SeamCC { _tapePubId = 0 };
				for (int b = 0; b < 3; b++) h0.BarsArray[b] = new Bars { SessaoDe = SessaoDe, BarraAtual = 0, IsFirstBarOfSession = true };
				h0.BarsInProgress = 1; h0.State = State.Realtime; h0.CurrentBar = 0; h0.Close.Valor = t.Px; h0.Volume.Valor = t.Vol; h0.Time.Valor = dt;
				h0.OnBarUpdate(); h0.OnMarketData(e);
				Ok(AlfaOmegaSharedState.LastUpdate_ES == antes && AlfaOmegaSharedState.PressState_ES == estAntes, "SEAM07b painel sem id de tape (_tapePubId 0) nao publica nada");
				h0.BarsInProgress = 1; h0._tapePubId = AoPublisher.NovoId(); h0.BarsArray[1] = null;
				bool lancou = false; try { h0.OnBarUpdate(); h0.OnMarketData(null); } catch { lancou = true; }
				Ok(!lancou, "SEAM07c Bars nulo / evento nulo: nenhuma excecao sobe do handler");
				AoMarketDataPublisher.Encerrar(h0._tapePubId);
			}

			// ── SEAM08 — FlowOne.PressSerieTick REAL (serie de 1 tick, BarsInProgress 1) ──
			foreach (int modo in new[] { 0, 1, 2 })   // 0 = normal · 1 = SessionIterator lanca · 2 = sem historico
			{
				var fo = new SeamFlowOne(); fo.CargaDataLoaded();
				fo.BarsArray[1] = new Bars { SessaoDe = SessaoDe, IteradorLanca = modo == 1 };
				fo.BarsInProgress = 1;
				var esperado = new AoTapeEngine("ES");       // caminho ja provado pelo test_press_p1s (ResetSessao + Backfill)
				long carga = _viradaUt[1] + 3600L * TimeSpan.TicksPerSecond;
				int barra = -1; DateTime sess = DateTime.MinValue; int primeiroRt = -1;
				for (int i = 0; i < _t.Count; i++)
				{
					Tk t = _t[i]; if (t.Bi != 1) continue;
					DateTime dt = Dt(t.Ut);
					if (t.Ut >= carga) { primeiroRt = i; break; }
					if (modo == 2) continue;
					Bars bs = fo.BarsArray[1];
					DateTime s = SessaoDe(dt); bs.IsFirstBarOfSession = s != sess; sess = s;
					bs.BarraAtual = ++barra; bs.BidAtual = t.Bid; bs.AskAtual = t.Ask;
					fo.State = State.Historical; fo.CurrentBar = barra; fo.Close.Valor = t.Px; fo.Volume.Valor = t.Vol; fo.Time.Valor = dt;
					fo.PressSerieTick();
					if (i == _viradaIdx[1]) esperado.ResetSessao(false, dt, SessaoDe(dt));
					esperado.Backfill(t.Px, t.Bid, t.Ask, t.Vol, dt);
				}
				Tk p = _t[primeiroRt]; DateTime pdt = Dt(p.Ut);
				if (modo == 0)
				{
					Ok(fo.Politica.Estado == AoPressEstado.PRESS_WARMUP && fo.Politica.Cum == esperado.PressCum && fo.Politica.Vol == esperado.PressVol && fo.Politica.Vol > 0,
						"SEAM08a FlowOne.PressSerieTick real: reconstrucao historica (cum=" + fo.Politica.Cum + " vol=" + fo.Politica.Vol + ") == motor do Control Center para os mesmos ticks");
					int lado = p.Px >= p.Ask ? +1 : (p.Px <= p.Bid ? -1 : 0);
					fo.Politica.TickRealtime(lado, p.Vol, pdt);      // FlowOne :1423 (chamada ao vivo; lado classificado pelo FlowOne)
					esperado.Tick(AoTick.Last, p.Px, p.Bid, p.Ask, p.Vol, pdt, true);
					Ok(fo.Politica.Estado == AoPressEstado.PRESS_VALID && fo.Politica.Publicavel() == esperado.Press && esperado.Press == rf[primeiroRt],
						"SEAM08b 1o trade ao vivo ⇒ PRESS_VALID; Press do FlowOne == Press do Control Center == referencia (" + esperado.Press.ToString("0.#####", CultureInfo.InvariantCulture) + ")");
				}
				else
				{
					fo.State = State.Realtime; fo.BarsArray[1].IsFirstBarOfSession = modo == 2; fo.BarsArray[1].BarraAtual = ++barra;
					fo.CurrentBar = barra; fo.Close.Valor = p.Px; fo.Volume.Valor = p.Vol; fo.Time.Valor = pdt;
					fo.PressSerieTick(); fo.Politica.TickRealtime(+1, p.Vol, pdt);
					Ok(fo.Politica.Estado == AoPressEstado.PRESS_UNAVAILABLE && fo.Politica.Publicavel() == 0.0,
						"SEAM08" + (modo == 1 ? "c FlowOne: SessionIterator lanca" : "d FlowOne: sem historico, virada falsa no 1o tick ao vivo") + " ⇒ PRESS_UNAVAILABLE, Press 0 (" + fo.Politica.Motivo + ")");
				}
			}
		}
		catch (Exception ex) { _fails++; Console.WriteLine("FAIL EXCECAO " + ex); }
		Console.WriteLine();
		Console.WriteLine("SEAM: " + _oks + " PASS / " + _fails + " FAIL");
		return _fails == 0 ? 0 : 1;
	}
}
