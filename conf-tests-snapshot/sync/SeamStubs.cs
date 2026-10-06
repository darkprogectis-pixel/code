// SEAM P1S 2026-10-05 — adapter que IMITA a superficie do NT8 usada pela costura do Press (nada de NT8 real aqui):
// State, BarsInProgress, Bars/BarsArray (IsFirstBarOfSession, GetBid, GetAsk), CurrentBar, IsFirstTickOfBar, Time/Close/Volume[0],
// Data.SessionIterator (GetNextSession / ActualSessionBegin), Data.MarketDataEventArgs, Cbi.Connection.PlaybackConnection, AoDiag.Marco.
// LIMITE DECLARADO: o que Bars.GetBid/GetAsk e SessionIterator devolvem DENTRO do NT8 nao e provado aqui — so o que o codigo
// do staging FAZ com cada resposta possivel (valor bom, NaN, 0, excecao, sessao desconhecida).
using System;
using System.Collections.Generic;

namespace NinjaTrader.Cbi
{
	public class Connection { public static Connection PlaybackConnection = null; }
}

namespace NinjaTrader.Data
{
	public enum MarketDataType { Ask = 0, Bid = 1, Last = 2, Other = 9 }
	public class MarketDataEventArgs
	{
		public MarketDataType MarketDataType; public double Price, Bid, Ask; public long Volume; public DateTime Time;
	}

	/// <summary>Serie de 1 tick simulada. O driver escreve o estado da barra corrente antes de cada OnBarUpdate.</summary>
	public class Bars
	{
		public bool IsFirstBarOfSession;
		public double BidAtual = double.NaN, AskAtual = double.NaN;
		public int BarraAtual = -1;
		public bool GetBidLanca;
		public Func<DateTime, DateTime> SessaoDe;      // inicio real da sessao que contem t (template de sessao)
		public bool IteradorFalha, IteradorLanca;
		public int IteradoresCriados;
		public double GetBid(int barra) { if (GetBidLanca) throw new InvalidOperationException("GetBid indisponivel"); if (barra != BarraAtual) throw new ArgumentOutOfRangeException("barra"); return BidAtual; }
		public double GetAsk(int barra) { if (GetBidLanca) throw new InvalidOperationException("GetAsk indisponivel"); if (barra != BarraAtual) throw new ArgumentOutOfRangeException("barra"); return AskAtual; }
	}

	public class SessionIterator
	{
		private readonly Bars _bars;
		public DateTime ActualSessionBegin { get; private set; }
		public SessionIterator(Bars bars)
		{
			if (bars == null) throw new ArgumentNullException("bars");
			if (bars.IteradorLanca) throw new InvalidOperationException("SessionIterator indisponivel");
			_bars = bars; bars.IteradoresCriados++;
		}
		public bool GetNextSession(DateTime t, bool includesEndTimeStamp)
		{
			if (_bars.IteradorFalha || _bars.SessaoDe == null) return false;
			ActualSessionBegin = _bars.SessaoDe(t);
			return true;
		}
	}
}

namespace NinjaTrader.NinjaScript
{
	public enum State { SetDefaults, Configure, Active, DataLoaded, Historical, Transition, Realtime, Terminated }
}

namespace NinjaTrader.NinjaScript.Indicators
{
	using NinjaTrader.Data;

	public class SerieD { public double Valor; public double this[int barsAgo] { get { if (barsAgo != 0) throw new ArgumentOutOfRangeException("barsAgo"); return Valor; } } }
	public class SerieT { public DateTime Valor; public DateTime this[int barsAgo] { get { if (barsAgo != 0) throw new ArgumentOutOfRangeException("barsAgo"); return Valor; } } }

	/// <summary>O que o indicador enxerga do NT8 no instante do evento.</summary>
	public class SeamHost
	{
		public State State = State.Historical;
		public int BarsInProgress;
		public Bars[] BarsArray = new Bars[3];
		public Bars Bars { get { return BarsInProgress >= 0 && BarsInProgress < BarsArray.Length ? BarsArray[BarsInProgress] : null; } }
		public int CurrentBar = -1;
		public bool IsFirstTickOfBar = true;      // serie de 1 tick: cada tick e uma barra
		public readonly SerieD Close = new SerieD(), Volume = new SerieD();
		public readonly SerieT Time = new SerieT();
	}

	public static class AoDiag
	{
		public static readonly List<string> Marcos = new List<string>();
		public static void Marco(string origem, string texto) { lock (Marcos) Marcos.Add(origem + "|" + texto); }
	}
}
