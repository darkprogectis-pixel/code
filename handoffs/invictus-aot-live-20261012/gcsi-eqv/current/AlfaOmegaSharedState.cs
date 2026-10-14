// AlfaOmegaSharedState — estado compartilhado em memoria entre os indicadores Alfa Omega.
// Evita o BIP (factory posicional fragil). Cada indicador publica sua direcao/eventos
// aqui; o AlfaOmegaFusion apenas le. Estatico = uma instancia por processo NT8.
using System;
using System.Collections.Generic;

namespace NinjaTrader.NinjaScript.Indicators
{
	// Idiomas de voz (Kokoro TTS) — dropdown nos Copilots
	public enum AlfaVoiceLang { PT_BR, EN_US, EN_GB, ES_ES, FR_FR, JA_JP, ZH_CN }

	public static class AlfaOmegaSharedState
	{
		// ===== TAREFA 6: base de sinais do dia (ate 100 por ativo por dia, reset por data) =====
		public struct SignalRecord
		{
			public DateTime Time;
			public string   Instrument;   // "ES","NQ","GC"
			public string   Direction;    // "COMPRA"/"VENDA"
			public string   Type;         // SIG/REV/ABS/SWP
			public double   EntryPrice;
			public double   ExitPrice;    // 0 = ainda aberto
			public double   Points;       // resultado final (MFE para CONF; mark-to-market para outros)
			public double   PnlUsd;       // Points * PointValue
			public string   Source;       // "CONF"/"NEXUS"/"PULSE"/"PHANTOM"/"STOPS"/"GRAVITY"/"PRESSURE"
			public int      Tier;         // peso: CONF=4, NEXUS/PULSE=3, PHANTOM/STOPS=2, GRAVITY/PRESSURE=1
			public int      EntryBar;     // barra da entrada (p/ mark-to-market via SettlePending)
			public double   MaxFavorable; // MFE: maxima excursao favoravel desde a entrada (pts, CONF only)
		}

		private static readonly object _sigLock = new object();
		private static readonly Dictionary<string, List<SignalRecord>> _signalDB = new Dictionary<string, List<SignalRecord>>();

		// Chave = "ES_20260630" (instrumento + data). Troca de dia gera chave nova (reset por data).
		public static string SignalKey(string instrument)
		{
			return (instrument ?? "?") + "_" + DateTime.Today.ToString("yyyyMMdd");
		}

		// Adiciona um sinal (max 100/ativo/dia). Retorna o indice no dia, ou -1 se cheio.
		public static int AddSignal(SignalRecord r)
		{
			lock (_sigLock)
			{
				string today = DateTime.Today.ToString("yyyyMMdd");
				// reset por data: descarta chaves de outros dias
				List<string> stale = null;
				foreach (var k in _signalDB.Keys)
					if (!k.EndsWith(today)) { if (stale == null) stale = new List<string>(); stale.Add(k); }
				if (stale != null) foreach (var k in stale) _signalDB.Remove(k);

				string key = SignalKey(r.Instrument);
				List<SignalRecord> list;
				if (!_signalDB.TryGetValue(key, out list)) { list = new List<SignalRecord>(); _signalDB[key] = list; }
				if (list.Count >= 100) return -1;
				list.Add(r);
				return list.Count - 1;
			}
		}

		// Marca a saida (mark-to-market 1 barra) de um sinal ja adicionado.
		public static void SetSignalExit(string instrument, int idx, double exitPrice, double pointValue)
		{
			lock (_sigLock)
			{
				string key = SignalKey(instrument);
				List<SignalRecord> list;
				if (!_signalDB.TryGetValue(key, out list)) return;
				if (idx < 0 || idx >= list.Count) return;
				SignalRecord r = list[idx];
				int dir = r.Direction == "COMPRA" ? 1 : -1;
				r.ExitPrice = exitPrice;
				r.Points    = (exitPrice - r.EntryPrice) * dir;
				r.PnlUsd    = r.Points * pointValue;
				list[idx]   = r;
			}
		}

		// Mark-to-market:
		//   closeConf=false → fecha nao-CONF na barra seguinte (comportamento original).
		//   closeConf=true  → fecha SÓ sinais CONF agora; usa MaxFavorable se capturado.
		public static void SettlePending(string instrument, int currentBar, double exitPrice, double pointValue, bool closeConf = false)
		{
			lock (_sigLock)
			{
				List<SignalRecord> list;
				if (!_signalDB.TryGetValue(SignalKey(instrument), out list)) return;
				for (int i = 0; i < list.Count; i++)
				{
					SignalRecord r = list[i];
					if (r.ExitPrice != 0 || r.EntryBar < 0) continue;
					bool isConf      = r.Source == "CONF";
					bool shouldClose = closeConf ? isConf : (!isConf && currentBar > r.EntryBar);
					if (!shouldClose) continue;
					int dir = r.Direction == "COMPRA" ? 1 : -1;
					r.ExitPrice = exitPrice;
					r.Points    = (isConf && r.MaxFavorable > 0) ? r.MaxFavorable : (exitPrice - r.EntryPrice) * dir;
					r.PnlUsd    = r.Points * pointValue;
					list[i]     = r;
				}
			}
		}

		// Atualiza MaxFavorable dos sinais CONF abertos (High/Low da barra atual). Chamar em OnBarUpdate.
		public static void TrackMfe(string instrument, int currentBar, double high, double low)
		{
			lock (_sigLock)
			{
				List<SignalRecord> list;
				if (!_signalDB.TryGetValue(SignalKey(instrument), out list)) return;
				for (int i = 0; i < list.Count; i++)
				{
					SignalRecord r = list[i];
					if (r.ExitPrice != 0 || r.Source != "CONF" || currentBar <= r.EntryBar) continue;
					int dir    = r.Direction == "COMPRA" ? 1 : -1;
					double fav = dir > 0 ? high - r.EntryPrice : r.EntryPrice - low;
					if (fav > r.MaxFavorable) { r.MaxFavorable = fav; list[i] = r; }
				}
			}
		}

		// Resumo de pontos por Source (todos os ativos do dia). Ex.: "CONF: +12pts | NEX: +5pts | ..."
		public static string GetSourceSummaryAll()
		{
			double cCONF = 0, cNEX = 0, cPUL = 0, cPHT = 0, cSTO = 0, cGRV = 0, cPRS = 0;
			lock (_sigLock)
			{
				foreach (var kv in _signalDB)
					foreach (SignalRecord r in kv.Value)
					{
						if      (r.Source == "CONF")     cCONF += r.Points;
						else if (r.Source == "NEXUS")    cNEX  += r.Points;
						else if (r.Source == "PULSE")    cPUL  += r.Points;
						else if (r.Source == "PHANTOM")  cPHT  += r.Points;
						else if (r.Source == "STOPS")    cSTO  += r.Points;
						else if (r.Source == "GRAVITY")  cGRV  += r.Points;
						else if (r.Source == "PRESSURE") cPRS  += r.Points;
					}
			}
			return "CONF: " + P(cCONF) + " | NEX: " + P(cNEX) + " | PUL: " + P(cPUL) + " | PHT: " + P(cPHT)
				 + " | STO: " + P(cSTO) + " | GRV: " + P(cGRV) + " | PRS: " + P(cPRS);
		}
		private static string P(double v) { return (v >= 0 ? "+" : "") + v.ToString("F0") + "pts"; }

		// Copia thread-safe dos sinais do dia de um ativo (ordem cronologica de insercao).
		public static List<SignalRecord> GetSignals(string instrument)
		{
			lock (_sigLock)
			{
				List<SignalRecord> list;
				if (_signalDB.TryGetValue(SignalKey(instrument), out list)) return new List<SignalRecord>(list);
				return new List<SignalRecord>();
			}
		}

		// Resumo: "ES: 23 sinais | +12/-11 | +4.5pts medio | +$225"
		public static string GetSignalSummary(string instrument)
		{
			List<SignalRecord> list = GetSignals(instrument);
			int n = list.Count;
			if (n == 0) return instrument + ": 0 sinais";
			int win = 0, loss = 0, closed = 0;
			double sumPts = 0, sumUsd = 0;
			foreach (SignalRecord r in list)
			{
				if (r.ExitPrice == 0) continue; // ainda nao marcado
				closed++; sumPts += r.Points; sumUsd += r.PnlUsd;
				if (r.PnlUsd > 0) win++; else if (r.PnlUsd < 0) loss++;
			}
			double avg = closed > 0 ? sumPts / closed : 0;
			string avgStr = (avg >= 0 ? "+" : "") + avg.ToString("F1");
			string usdStr = (sumUsd >= 0 ? "+$" : "-$") + Math.Abs(sumUsd).ToString("F0");
			return string.Format("{0}: {1} sinais | +{2}/-{3} | {4}pts medio | {5}", instrument, n, win, loss, avgStr, usdStr);
		}

		public static int  MeDirection      { get; set; } // +1 compra, -1 venda, 0 neutro
		public static int  MviDirection     { get; set; }
		public static bool MeIsReversal     { get; set; }
		public static bool MviIsReversal    { get; set; }
		public static DateTime LastMeAbsorptionTime  { get; set; }
		public static DateTime LastMviAbsorptionTime { get; set; }
		private const double AbsorptionLatchSec = 5.0; // MeIsAbsorption/MviIsAbsorption ficam true por 5s
		public static bool MeIsAbsorption  { get { return (DateTime.Now - LastMeAbsorptionTime).TotalSeconds  < AbsorptionLatchSec; } }
		public static bool MviIsAbsorption { get { return (DateTime.Now - LastMviAbsorptionTime).TotalSeconds < AbsorptionLatchSec; } }
		// Campos publicados pelo AlfaOmegaCopilotIndicator
		public static double        LastPrice      { get; set; }
		public static string        LastEvent      { get; set; }
		public static int           TotalSignals   { get; set; }
		public static System.DateTime LastSignalTime { get; set; }

		// Contadores de marker por tipo, HOJE (reset por sessão pelo FlowOne). Globais (somam
		// ES+NQ se houver FlowOne em ambos). Incrementados no FlowOne (FireSignal/AddTapeMark),
		// lidos pelo Copilot p/ o badge. Contam DISPARO, independente do filtro de densidade.
		public static int MkrCountStop  { get; set; }
		public static int MkrCountIce   { get; set; }
		public static int MkrCountSweep { get; set; }
		public static int MkrCountAbs   { get; set; }
		public static int MkrCountRev   { get; set; }
		public static int MkrCountExh   { get; set; }
		// VOLUME por tipo de evento (2026-07-26). Contratos = bruto do disparo; Usd = contratos x
		// preco x PointValue (mesma origem, sem coleta duplicada). REV herda o volume do STOP que
		// o disparou (nao tem volume proprio — e evento de confluencia). Reset junto com a contagem.
		public static long   MkrVolStop  { get; set; }
		public static long   MkrVolIce   { get; set; }
		public static long   MkrVolSweep { get; set; }
		public static long   MkrVolAbs   { get; set; }
		public static long   MkrVolRev   { get; set; }
		public static long   MkrVolExh   { get; set; }
		public static double MkrUsdStop  { get; set; }
		public static double MkrUsdIce   { get; set; }
		public static double MkrUsdSweep { get; set; }
		public static double MkrUsdAbs   { get; set; }
		public static double MkrUsdRev   { get; set; }
		public static double MkrUsdExh   { get; set; }

		public static void ResetMarkerCounts()
		{
			MkrCountStop = MkrCountIce = MkrCountSweep = MkrCountAbs = MkrCountRev = MkrCountExh = 0;
			MkrVolStop = MkrVolIce = MkrVolSweep = MkrVolAbs = MkrVolRev = MkrVolExh = 0;
			MkrUsdStop = MkrUsdIce = MkrUsdSweep = MkrUsdAbs = MkrUsdRev = MkrUsdExh = 0;
		}

		// ── DIMENSOES FITA x OPCOES (2026-07-26) ────────────────────────────────────
		// FITA: acumuladores de sessao do tape de futuros (publicados pelo FlowOne).
		public static double TapeDeltaUsd  { get; set; }
		public static double TapeVolumeUsd { get; set; }
		public static System.DateTime TapeUpdate { get; set; }
		// OPCOES: publicados pelo OptionsFlowHiro (standalone E camada embutida do Hybrid).
		// OptDeltaUsd  = agg.netDeltaDollar ; OptVolumeUsd = callPremium + putPremium (premio $).
		public static double OptDeltaUsd  { get; set; }
		public static double OptVolumeUsd { get; set; }
		public static System.DateTime OptUpdate { get; set; }
		// MODO (b) DA "Ω Pressao" (2026-07-26) — RESERVADO, AINDA NAO ALIMENTADO.
		// Denominador de sessao INTEIRA p/ a pressao de opcoes, sem o teto de 2000 trades que
		// limita o OfhNet. Requer um campo novo no servidor (:3500) — ver TODO em
		// AlfaOmegaFlowOne.OptionsPressure(). Enquanto o servidor nao publicar, OptNetDirUpdate
		// fica em MinValue => nunca "fresh" => o painel mostra "—" em vez de um numero errado.
		public static double OptNetDirPremium { get; set; }
		public static System.DateTime OptNetDirUpdate { get; set; }

		// ── REPLAY REAL DE OPCOES (2026-07-26) — pedido/resposta entre indicadores ──
		// POR QUE ASSIM: o FlowOne e quem TEM o cursor do replay e o toggle, mas e um
		// indicador de fita PURO — sem AoConfig/AoWebClient, zero rede (isso e valor do kit
		// minimo, nao acidente). Quem tem encanamento HTTP e o OptionsFlowHiro e a camada
		// embutida do Hybrid. Entao: o FlowOne PEDE (escreve ReplayOptWantDate) e quem tem
		// rede ATENDE (busca /tape/{sym}/optseries?date=... UMA VEZ e publica a serie).
		// A serie e CUMULATIVA POR MINUTO: [tsMs, netDeltaDollar, premio(call+put), netDirPremium, trades]
		// Fetch pontual, NAO poll: a fita daquele dia nao muda mais.
		public static string ReplayOptWantDate { get; set; }   // "YYYY-MM-DD" pedido pelo FlowOne ("" = nada)
		public static string ReplayOptHaveDate { get; set; }    // data JA carregada; "404:<data>" = sem fita gravada
		public static double[][] ReplayOptSeries { get; set; }  // publicada por referencia (troca atomica)
		public static System.DateTime ReplayOptUpdate { get; set; }

		// ── MEDIDOR DE RAIOS (2026-07-26) ───────────────────────────────────────────
		// Publicado pelo FlowOne p/ o Copilot exibir os MESMOS valores (evita calculo duplicado
		// que poderia divergir). RaioDir: +1 LONG / -1 SHORT / 0 sem confluencia.
		public static int RaioCount    { get; set; }
		public static int RaioMaxSlots { get; set; }
		public static int RaioDir      { get; set; }

		// Resumo do que o badge do Copilot está EXIBINDO agora (JSON cru, ou null). Fonte única da
		// verdade p/ o narrador no modo "Só Copilot" — só o que está na tela, não o dado bruto.
		public static string CopilotBadge { get; set; }

		// Marker (Liquidity Marker)
		public static double MarkerBidSize   { get; set; }
		public static double MarkerAskSize   { get; set; }
		public static int    MarkerBidEvents { get; set; }
		public static int    MarkerAskEvents { get; set; }

		// TrackerPro (Liquidity Tracker Pro)
		public static double TpBid  { get; set; }
		public static double TpAsk  { get; set; }
		public static double TpDiff { get; set; }
		public static double TpCvd  { get; set; }

		// Stops & Icebergs
		public static int    StopsThreshold  { get; set; }
		public static int    StopsLastSize   { get; set; }
		public static string StopsLastSide   { get; set; }

		// ═════════════════════════════════════════════════════════════════════════════
		//  OPENFLOW (publicado pelo AlfaOmegaOpenFlow) — fluxo de OPCOES da abertura
		// ═════════════════════════════════════════════════════════════════════════════
		//  ⚠️⚠️ LEIA ANTES DE CONSUMIR ISTO EM QUALQUER LUGAR: ⚠️⚠️
		//
		//  `OfDirection` (LONG/SHORT) **NAO TEM EDGE DIRECIONAL COMPROVADO.**
		//  Foi testado em 285 sessoes com TRES hipoteses pre-registradas — as tres MORRERAM:
		//    1. seguir o HIRO da abertura ....... 0 de 60 combinacoes passaram Bonferroni
		//    2. fadear o HIRO (pre-registrado) .. 45,3% de acerto em 192 sessoes VIRGENS
		//    3. HIRO filtrado pelo regime ....... 35,0% (G<0) vs 51,7% (G>0) — reprovado 3/3
		//  => Como preditor de DIRECAO, isto e ESTATISTICAMENTE INDISTINGUIVEL DE MOEDA.
		//
		//  Por que existe, entao: o operador usa como UMA camada de contexto visual numa
		//  confluencia MANUAL com 21+ outros indicadores, entrando 5–15 min apos a abertura.
		//  Ele NAO opera por isto. E uma leitura de fato ("o fluxo de opcoes esta comprador"),
		//  nao uma previsao.
		//
		//  ⭐ POR ISSO O TIER E 1 — O MENOR DA SUITE (CONF=4 · NEXUS/PULSE=3 · PHANTOM/STOPS=2).
		//     O aviso vive AQUI, no codigo, e nao num .md — porque o .md NAO viaja para o
		//     escritorio 4 junto com o .zip, e o badge viaja.
		//     ⛔ NUNCA promova OfDirection a peso maior sem um novo pre-registro que o aprove.
		//
		//  ✅ `OfRegime` / `OfExpectedPts` SIM tem respaldo (p = 0,0001, 274 sessoes):
		//       G dealer < 0 (AMPLIFICA) -> deslocamento medio |29,9 pts|
		//       G dealer > 0 (ABSORVE)   -> deslocamento medio |19,4 pts|
		//     Isso prediz MAGNITUDE, nunca DIRECAO. Serve p/ tamanho de posicao e largura de stop.
		public const int OfTier = 1;                        // menor peso da suite. Codificado, nao opcional.
		public static int      OfDirection    { get; set; } // +1 LONG · -1 SHORT · 0 NEUTRO  (SEM EDGE)
		public static double   OfFlowUsd      { get; set; } // HIRO cumulativo da janela, em $ (delta notional)
		public static int      OfRegime       { get; set; } // -1 AMPLIFICA (G<0) · +1 ABSORVE (G>0) · 0 ?
		public static double   OfGamma        { get; set; } // Gamma dealer no fechamento da janela ($)
		public static double   OfExpectedPts  { get; set; } // deslocamento esperado (backtest, magnitude)
		public static bool     OfFrozen       { get; set; } // janela de abertura ja fechou -> leitura travada
		public static DateTime OfUpdate       { get; set; }

		// ---- Painel Hibrido FlowOne (2026-07-24): publicados pelas fontes, lidos pelo FlowOne ----
		// Cada campo tem seu *Update p/ o FlowOne mostrar "stale" honesto quando a fonte nao publica.
		public static double          HiroCum          { get; set; } // HIRO cumulativo (AlfaOmegaHiro), delta notional
		public static int             HiroDir          { get; set; } // +1/-1/0 inclinacao recente do cumulativo
		// HIRO net$ (2026-07-26): soma dos f4 dos ULTIMOS N MINUTOS (janela MOVEL, default 5).
		// NAO e o candle unico nem o acumulado de sessao — e o fluxo recente. Unidade: $ delta
		// notional. Base de tempo = timestamp do ULTIMO CANDLE (idade do dado), nao DateTime.Now.
		// Publicado pelo AlfaOmegaHiro E pela camada embutida do Hybrid (regra de paridade).
		public static double          HiroNet5m        { get; set; }
		public static System.DateTime HiroUpdate       { get; set; }
		public static double          VixLast          { get; set; } // ultimo VIX (AlfaOmegaVixLine)
		public static System.DateTime VixUpdate        { get; set; }
		public static double          NetGex0DTE       { get; set; } // net gex 0DTE (>0 compra / <0 venda)
		public static System.DateTime NetGex0DTEUpdate { get; set; }
		public static double          GammaPressB      { get; set; } // GammaPressure formula B' (P = 100*prox*tanh(z))
		public static int             GammaPressRegime { get; set; } // +1 absorve (G>0) / -1 amplifica (G<0) / 0
		public static System.DateTime GammaPressUpdate { get; set; }
		// OptionsFlow HIRO (AlfaOmegaOptionsFlowHiro) — 5 metricas em $ (acumulado sessao)
		public static double          OfhNet           { get; set; }
		public static double          OfhSweep         { get; set; }
		public static double          OfhCross         { get; set; }
		public static double          OfhMulti         { get; set; }
		public static double          OfhBlock         { get; set; }
		public static System.DateTime OfhUpdate        { get; set; }

		// ── STALENESS UNIFICADA (2026-07-26) ────────────────────────────────────────
		// Uma linha de painel que combina DUAS fontes so pode ser considerada fresca se as
		// DUAS estiverem frescas. Sem isto, a "Ω Pressao" (OfhNet / OptVolumeUsd) mostraria
		// numero vivo com um dos lados congelado. Regra: qualquer fonte sem dado (MinValue)
		// derruba a linha inteira p/ "—"; havendo dado nas duas, vale a MAIS ANTIGA.
		public static System.DateTime OldestOf(params System.DateTime[] ts)
		{
			if (ts == null || ts.Length == 0) return System.DateTime.MinValue;
			System.DateTime oldest = System.DateTime.MaxValue;
			for (int i = 0; i < ts.Length; i++)
			{
				if (ts[i] == System.DateTime.MinValue) return System.DateTime.MinValue;   // sem dado => "—"
				if (ts[i] < oldest) oldest = ts[i];
			}
			return oldest;
		}
		// Mesmo criterio de frescor usado nos paineis do FlowOne (120s).
		public static bool IsFresh(System.DateTime t, double maxAgeSec)
		{
			return t != System.DateTime.MinValue && (System.DateTime.Now - t).TotalSeconds < maxAgeSec;
		}
		public static bool IsFresh(System.DateTime t) { return IsFresh(t, 120.0); }

		// StopRun (publicado pelo AlfaOmegaNexus, lido pelo AlfaOmegaPhantom p/ classificacao)
		public static double          LastStopRunPrice { get; set; }
		public static int             LastStopRunDir   { get; set; } // +1/-1
		public static System.DateTime LastStopRunTime  { get; set; }
		public static long            LastStopRunVol   { get; set; }

		// ===== Multi-instrumento (ES/NQ/GC) — publicado pelo Nexus/Pulse de cada chart =====
		public static int MeDirection_ES  { get; set; }
		public static int MeDirection_NQ  { get; set; }
		public static int MeDirection_GC  { get; set; }
		public static int MviDirection_ES { get; set; }
		public static int MviDirection_NQ { get; set; }
		public static int MviDirection_GC { get; set; }
		public static double LastPrice_ES { get; set; }
		public static double LastPrice_NQ { get; set; }
		// FASE 0 replay (2026-07-24): true durante Market Replay (Playback) do NT8. Escrito por um indicador
		// com contexto (FlowOne), lido pelo AlfaOmegaBridge — impede sinal de replay vazar no Telegram/narrador.
		public static bool IsInReplay { get; set; }
		public static double LastPrice_GC { get; set; }
		public static System.DateTime LastUpdate_ES { get; set; }
		public static System.DateTime LastUpdate_NQ { get; set; }
		public static System.DateTime LastUpdate_GC { get; set; }

		// ===== 6E (Euro FX) — mini, mesmo padrao ES/NQ/GC (Lote A, aditivo) =====
		public static int MeDirection_6E  { get; set; }
		public static int MviDirection_6E { get; set; }
		public static double LastPrice_6E { get; set; }
		public static System.DateTime LastUpdate_6E { get; set; }

		// ===== CL (Crude Oil) — mini, mesmo padrao ES/NQ/GC (Lote C, aditivo) =====
		public static int MeDirection_CL  { get; set; }
		public static int MviDirection_CL { get; set; }
		public static double LastPrice_CL { get; set; }
		public static System.DateTime LastUpdate_CL { get; set; }

		// ===== SI (Silver) — mini, sem micro (Lote D, aditivo) =====
		public static int MeDirection_SI  { get; set; }
		public static int MviDirection_SI { get; set; }
		public static double LastPrice_SI { get; set; }
		public static System.DateTime LastUpdate_SI { get; set; }

		// ===== RTY (Russell 2000) — mini, sem micro (#21 2026-07-21, aditivo). "Carona" gated ES×NQ. =====
		public static int MeDirection_RTY  { get; set; }
		public static int MviDirection_RTY { get; set; }
		public static double LastPrice_RTY { get; set; }
		public static System.DateTime LastUpdate_RTY { get; set; }

		// ===== BTC (Bitcoin) — mini, sem micro (Lote E, aditivo) =====
		public static int MeDirection_BTC  { get; set; }
		public static int MviDirection_BTC { get; set; }
		public static double LastPrice_BTC { get; set; }
		public static System.DateTime LastUpdate_BTC { get; set; }

		// ===== Micro (MES/MNQ) — voto de MENOR peso p/ fusao ES+MES / NQ+MNQ (aditivo) =====
		public static int MeDirection_MES  { get; set; }
		public static int MeDirection_MNQ  { get; set; }
		public static int MviDirection_MES { get; set; }
		public static int MviDirection_MNQ { get; set; }
		public static System.DateTime LastUpdate_MES { get; set; }
		public static System.DateTime LastUpdate_MNQ { get; set; }
		public static int MeDirection_M6E  { get; set; }
		public static int MviDirection_M6E { get; set; }
		public static System.DateTime LastUpdate_M6E { get; set; }
		public static int MeDirection_MCL  { get; set; }
		public static int MviDirection_MCL { get; set; }
		public static System.DateTime LastUpdate_MCL { get; set; }
		public static int MeDirection_MGC  { get; set; }
		public static int MviDirection_MGC { get; set; }
		public static System.DateTime LastUpdate_MGC { get; set; }

		// ===== Por-ativo dos globais que os Copilots escrevem (isolamento ES/NQ/GC) =====
		public static string          LastEvent_ES { get; set; }
		public static string          LastEvent_NQ { get; set; }
		public static string          LastEvent_GC { get; set; }
		public static int             TotalSignals_ES { get; set; }
		public static int             TotalSignals_NQ { get; set; }
		public static int             TotalSignals_GC { get; set; }
		public static System.DateTime LastSignalTime_ES { get; set; }
		public static System.DateTime LastSignalTime_NQ { get; set; }
		public static System.DateTime LastSignalTime_GC { get; set; }

		// Deteccao de ativo por nome (StartsWith)
		private static bool IsES(string n) { return n != null && (n.StartsWith("ES") || n.StartsWith("MES")); }
		private static bool IsNQ(string n) { return n != null && (n.StartsWith("NQ") || n.StartsWith("MNQ")); }
		private static bool IsGC(string n) { return n != null && n.StartsWith("GC"); }
		private static bool IsSI(string n)  { return n != null && n.StartsWith("SI"); }                        // #21
		private static bool IsRTY(string n) { return n != null && (n.StartsWith("RTY") || n.StartsWith("M2K")); } // #21

		// Acessores por-ativo (fallback = campo global quando o ativo nao e ES/NQ/GC)
		private const double FallbackSec_ES = 90;
		private const double FallbackSec_NQ = 90;
		private const double FallbackSec_GC = 150;
		private const double FallbackSec_6E = 150;
		private const double FallbackSec_CL = 120;
		public static int GetMeDir(string n)
		{
			if (IsES(n)) { bool stale = LastUpdate_ES == DateTime.MinValue || (DateTime.Now - LastUpdate_ES).TotalSeconds > FallbackSec_ES; return (stale && VectorDir_ES != 0) ? VectorDir_ES : MeDirection_ES; }
			if (IsNQ(n)) { bool stale = LastUpdate_NQ == DateTime.MinValue || (DateTime.Now - LastUpdate_NQ).TotalSeconds > FallbackSec_NQ; return (stale && VectorDir_NQ != 0) ? VectorDir_NQ : MeDirection_NQ; }
			if (IsGC(n)) { bool stale = LastUpdate_GC == DateTime.MinValue || (DateTime.Now - LastUpdate_GC).TotalSeconds > FallbackSec_GC; return (stale && VectorDir_GC != 0) ? VectorDir_GC : MeDirection_GC; }
			if (IsSI(n))  return MeDirection_SI;   // #21 mini-só
			if (IsRTY(n)) return MeDirection_RTY;  // #21 mini-só
			return MeDirection;
		}
		public static int    GetMviDir(string n)     { return IsES(n) ? MviDirection_ES : (IsNQ(n) ? MviDirection_NQ : (IsGC(n) ? MviDirection_GC : (IsSI(n) ? MviDirection_SI : (IsRTY(n) ? MviDirection_RTY : MviDirection)))); }
		public static double GetLastPrice(string n)  { return IsES(n) ? LastPrice_ES : (IsNQ(n) ? LastPrice_NQ : (IsGC(n) ? LastPrice_GC : (IsSI(n) ? LastPrice_SI : (IsRTY(n) ? LastPrice_RTY : LastPrice)))); }
		public static void   SetLastPrice(string n, double p) { if (IsES(n)) LastPrice_ES = p; else if (IsNQ(n)) LastPrice_NQ = p; else if (IsGC(n)) LastPrice_GC = p; else if (IsSI(n)) LastPrice_SI = p; else if (IsRTY(n)) LastPrice_RTY = p; else LastPrice = p; }
		public static string GetLastEvent(string n)  { return IsES(n) ? LastEvent_ES : (IsNQ(n) ? LastEvent_NQ : (IsGC(n) ? LastEvent_GC : LastEvent)); }
		public static void   SetLastEvent(string n, string e) { if (IsES(n)) LastEvent_ES = e; else if (IsNQ(n)) LastEvent_NQ = e; else if (IsGC(n)) LastEvent_GC = e; else LastEvent = e; }
		public static int    GetTotalSignals(string n) { return IsES(n) ? TotalSignals_ES : (IsNQ(n) ? TotalSignals_NQ : (IsGC(n) ? TotalSignals_GC : TotalSignals)); }
		public static void   IncTotalSignals(string n) { if (IsES(n)) TotalSignals_ES++; else if (IsNQ(n)) TotalSignals_NQ++; else if (IsGC(n)) TotalSignals_GC++; else TotalSignals++; }
		public static System.DateTime GetLastSignalTime(string n) { return IsES(n) ? LastSignalTime_ES : (IsNQ(n) ? LastSignalTime_NQ : (IsGC(n) ? LastSignalTime_GC : LastSignalTime)); }
		public static void   SetLastSignalTime(string n, System.DateTime t) { if (IsES(n)) LastSignalTime_ES = t; else if (IsNQ(n)) LastSignalTime_NQ = t; else if (IsGC(n)) LastSignalTime_GC = t; else LastSignalTime = t; }

		// ===== Fusao ES+MES / NQ+MNQ — voto direcional ponderado normalizado (aditivo) =====
		// Peso do MICRO (MES/MNQ) no voto combinado. Mini=1.0 (fixo). Recomendado 0<MicroWeight<1
		// (w<1 garante que o micro nunca inverte nem origina sinal sozinho — ver auditoria).
		public static double MicroWeight { get; set; } = 0.30;

		private static bool MicroStale(System.DateTime last, double limitSec)
		{
			return last == DateTime.MinValue || (DateTime.Now - last).TotalSeconds > limitSec;
		}
		// score = (mini*1.0 + micro*w) / (1.0 + w); micro stale => w=0 e voto micro=0 (sai do denominador).
		// score >= +0.5 => +1 (compra); score <= -0.5 => -1 (venda); senao 0 (neutro).
		private static int WeightedVote(int miniDir, int microDir, System.DateTime microLast, double limitSec)
		{
			bool stale = MicroStale(microLast, limitSec);
			double w = stale ? 0.0 : MicroWeight;
			if (w < 0.0) w = 0.0; // guard: denominador (1+w) sempre >= 1, sem divisao por zero
			double md = stale ? 0.0 : microDir;
			double score = (miniDir * 1.0 + md * w) / (1.0 + w);
			if (score >=  0.5) return  1;
			if (score <= -0.5) return -1;
			return 0;
		}
		public static int GetMeDir_ES_Combined()  { return WeightedVote(MeDirection_ES,  MeDirection_MES,  LastUpdate_MES, FallbackSec_ES); }
		public static int GetMeDir_NQ_Combined()  { return WeightedVote(MeDirection_NQ,  MeDirection_MNQ, LastUpdate_MNQ, FallbackSec_NQ); }
		public static int GetMviDir_ES_Combined() { return WeightedVote(MviDirection_ES, MviDirection_MES, LastUpdate_MES, FallbackSec_ES); }
		public static int GetMviDir_NQ_Combined() { return WeightedVote(MviDirection_NQ, MviDirection_MNQ, LastUpdate_MNQ, FallbackSec_NQ); }
		public static int GetMeDir_6E_Combined()  { return WeightedVote(MeDirection_6E,  MeDirection_M6E,  LastUpdate_M6E, FallbackSec_6E); }
		public static int GetMviDir_6E_Combined() { return WeightedVote(MviDirection_6E, MviDirection_M6E, LastUpdate_M6E, FallbackSec_6E); }
		public static int GetMeDir_CL_Combined()  { return WeightedVote(MeDirection_CL,  MeDirection_MCL,  LastUpdate_MCL, FallbackSec_CL); }
		public static int GetMviDir_CL_Combined() { return WeightedVote(MviDirection_CL, MviDirection_MCL, LastUpdate_MCL, FallbackSec_CL); }
		public static int GetMeDir_GC_Combined()  { return WeightedVote(MeDirection_GC,  MeDirection_MGC,  LastUpdate_MGC, FallbackSec_GC); }
		public static int GetMviDir_GC_Combined() { return WeightedVote(MviDirection_GC, MviDirection_MGC, LastUpdate_MGC, FallbackSec_GC); }
		// #21 — SI e RTY são MINI-SÓ (sem micro) → o "combined" é o próprio mini (sem WeightedVote).
		public static int GetMeDir_SI_Combined()   { return MeDirection_SI; }
		public static int GetMviDir_SI_Combined()  { return MviDirection_SI; }
		public static int GetMeDir_RTY_Combined()  { return MeDirection_RTY; }
		public static int GetMviDir_RTY_Combined() { return MviDirection_RTY; }
		// Ancora ES×NQ (calculada pelo Copilot)
		public static int AnchorDirection { get; set; } // +1/-1/0
		public static int AnchorStrength  { get; set; } // 0..4

		// ===== FORCA por simbolo (2026-07-27) — insumo do gate de confluencia ES×NQ =====
		// Pressao de SESSAO assinada = cumDelta / sessVolume, faixa util -1..+1 (na pratica
		// raramente passa de |0.3|). Publicada pelo FlowOne de cada grafico em PublishDirBySymbol().
		// ⚠️ MOTIVO DE EXISTIR: MeDirection_*/MviDirection_* sao latches de +1/-1/0 e NAO carregam
		//    magnitude. Sem estes campos a regra "com forca suficiente, nao perto de zero" nao e
		//    representavel — o AnchorStrength e CONTAGEM DE VOTOS (0..4), nao intensidade.
		public static double Press_ES { get; set; }
		public static double Press_NQ { get; set; }
		// (2026-10-05) ESTADO do Press publicado, por simbolo: "PRESS_WARMUP" | "PRESS_VALID" | "PRESS_UNAVAILABLE".
		// null = o publicador ainda nao publicou. SO observabilidade (:5151/state): o AoGate NAO le estes campos.
		public static string PressState_ES { get; set; }
		public static string PressState_NQ { get; set; }
		// (2026-10-07) PRESS_RECALIBRATION_30D — volume da sessao do Press publicado (denominador, contratos) e o carimbo
		// do publish que o escreveu. O passo 4 do AoGate so usa o volume quando PressVolUpdate_* == LastUpdate_* (mesmo
		// publish, mesmo publicador); qualquer outro caso (publicador que nao escreve volume, ex. FlowOne) = limiar minForce de sempre.
		public static double          PressVol_ES       { get; set; }
		public static double          PressVol_NQ       { get; set; }
		public static System.DateTime PressVolUpdate_ES { get; set; }
		public static System.DateTime PressVolUpdate_NQ { get; set; }
		// (2026-10-08) FORCA_JANELA_30 — medida de forca do passo 4 do AoGate.EsNq (z-score em janela movel de 30 min),
		// publicada pelo AoMarketDataPublisher (eleicao propria "<sym>|Z"). null = sem publicador ⇒ o gate reprova por forca.
		public static AoForcaJanela Forca_ES { get; set; }
		public static AoForcaJanela Forca_NQ { get; set; }
		public static double Press_GC { get; set; }   // #GCSI Fase 0 — dado, NAO insumo de gate
		public static double Press_SI { get; set; }   // #GCSI Fase 0 — dado, NAO insumo de gate

		// ===== VEREDITO HIBRIDO (2026-07-27) — modelo BASE + REFORCO =====
		// Publicado pelo FlowOne. Regra do operador: FUTUROS define a direcao (100%), OPCOES so
		// REFORCA quando concorda e NUNCA subtrai/veta. Quem veta e o gate ES×NQ, separado.
		//   HybDir        = direcao final (0 = NEUTRO; ja com o gate ES×NQ aplicado)
		//   HybFutScore   = score de futuros  -1..+1  (sinal = direcao da Fita CME)
		//   HybOptScore   = score de opcoes   -1..+1  (so INFORMA; nao muda HybDir)
		//   HybConfidence = 0.5*|fut| + 0.5*(opcoes concordando ? |opt| : 0), modulada pelo regime
		//   HybConfirmed  = opcoes concordam  ·  HybDivergent = opcoes contra (informativo)
		public static int      HybDir        { get; set; }
		public static double   HybFutScore   { get; set; }
		public static double   HybOptScore   { get; set; }
		public static double   HybConfidence { get; set; }
		public static bool     HybConfirmed  { get; set; }
		public static bool     HybDivergent  { get; set; }
		public static System.DateTime HybUpdate { get; set; }

		// ===== CURVA DE GAMMA POR STRIKE — DIAGNOSTICO (2026-07-28) =====
		// Publicado pelo AlfaOmegaHiro depois de parsear o gammaCurve do /levels/:sym.
		// EXISTE PARA SER VERIFICAVEL: sem isto, a unica forma de saber se a curva chegou ao
		// NT8 seria olhar a tela. Com estes 4 campos o :5151 responde por fora.
		// NAO alimenta decisao nenhuma — e telemetria.
		public static int      GammaCurvePts    { get; set; }   // nº de pontos recebidos (0 = nao chegou)
		public static double   GammaCurveMaxAbs { get; set; }   // maior |gamma| da curva
		public static double   GammaCurveZero   { get; set; }   // cruzamento de zero interpolado (preco do FUTURO)
		public static string   GammaCurveSym    { get; set; }   // simbolo que alimentou (ES/NQ) — auditoria
		public static System.DateTime GammaCurveUpdate { get; set; }

		// #21 — Confluência auxiliar GC×SI (tape). Escrita pelo CopilotGC. NUNCA operada (só display/contexto).
		public static int AuxGcSiDir      { get; set; } // +1/-1/0
		public static int AuxGcSiStrength { get; set; } // 0..4

		// Velocity (Speed)
		public static double VelocityPace  { get; set; }
		public static double VelocitySpeed { get; set; }

		// Vector (Trend)
		public static double VectorTrend   { get; set; }
		public static int    VectorDir     { get; set; } // +1 alta / -1 baixa (global, compatibilidade)
		public static int    VectorDir_ES  { get; set; } // per-ativo (fallback GetMeDir)
		public static int    VectorDir_NQ  { get; set; }
		public static int    VectorDir_GC  { get; set; }

		// Pressure (Imbalance)
		public static double PressureL1    { get; set; }
		public static double PressureL2    { get; set; }

		// Gravity (Outside Liquidity)
		public static double GravityDelta  { get; set; }

		// Depth (Liquidity Tracker)
		public static double DepthBid      { get; set; }
		public static double DepthAsk      { get; set; }

		// ===== DarkFlow Bridge (escrito pelo DarkFlowZeroDTE, lido pelo Copilot/AssetWindow) =====
		public static string       GammaCondES  { get; set; }  // "POSITIVE"/"NEGATIVE"/"NEUTRAL"/"--"
		public static string       GammaCondNQ  { get; set; }
		public static double       ProbFinalES  { get; set; }  // 0-100 (Reactor Central)
		public static double       ProbFinalNQ  { get; set; }
		public static double       VbpiCont     { get; set; }  // 0-100 (continuacao)
		public static System.DateTime GammaUpdated { get; set; } // timestamp do ultimo write
		// ===== DarkFlow Gamma Levels (escrito pelo DarkFlowZeroDTE, lido pelos Copilots) =====
		public static double CallWallES    { get; set; }  // ES Call Wall (GL Pipeline)
		public static double PutWallES     { get; set; }  // ES Put Wall (GL Pipeline)
		public static double ZeroGammaES   { get; set; }  // ES Zero Gamma (OPRA extended / HVL proxy)
		public static string VbpiBarrierES { get; set; }  // "CALL WALL"/"PUT WALL" (muro mais proximo)
		public static double HvlES         { get; set; }  // ES HVL — zona de controle dealer
		public static double CallWallNQ    { get; set; }  // NQ Major Pos Vol (OPRA)
		public static double PutWallNQ     { get; set; }  // NQ Major Neg Vol (OPRA)
		public static double ZeroGammaNQ   { get; set; }  // NQ Zero Gamma (OPRA extended)
		// ===== DarkFlow MAPA Levels (escrito pelo DarkFlowMap, lido pelos Copilots) =====
		public static double   VolTriggerES  { get; set; }  // ES Volatility Trigger (MAPA.txt)
		public static double   HedgeWallES   { get; set; }  // ES Hedge Wall (MAPA.txt)
		public static double   DarkPoolTopES { get; set; }  // ES Dark Pool nivel #1 por nocional (MAPA.txt)
		public static double   VolTriggerNQ  { get; set; }  // NQ Volatility Trigger (MAPA.txt)
		public static double   HedgeWallNQ   { get; set; }  // NQ Hedge Wall (MAPA.txt)
		public static double   DarkPoolTopNQ { get; set; }  // NQ Dark Pool nivel #1 por nocional (MAPA.txt)
		public static System.DateTime MapaUpdated { get; set; }  // timestamp do ultimo reload do MAPA.txt
	}

	// ─────────────────────────────────────────────────────────────────────────────
	//  RESULTADO DO GATE DE CONFLUENCIA ES×NQ (2026-07-27)
	// ─────────────────────────────────────────────────────────────────────────────
	public struct AoGateResult
	{
		public int    Dir;        // +1 LONG · -1 SHORT · 0 NEUTRO (0 sempre que !Ok)
		public int    Strength;   // 0..4 — quantos dos 4 canais (ME/MVI × ES/NQ) alinhados
		public bool   Ok;         // passou o gate (confluencia REAL ES+NQ)
		public string Why;        // motivo do NEUTRO — "" quando Ok
	}

	// ─────────────────────────────────────────────────────────────────────────────
	//  GATE DE CONFLUENCIA ES×NQ — FONTE UNICA (2026-07-27)
	//
	//  Regra do operador (analise propria de 180 dias, base preco/convergencia direcional):
	//  so ha veredito de COMPRA/VENDA quando ES **e** NQ apontam para o MESMO lado, os dois
	//  com forca suficiente (nao perto de zero). Sem isso => NEUTRO EXPLICITO, nunca some da tela.
	//
	//  🔴 O QUE ISTO CORRIGE (bug real, medido em 2026-07-27):
	//  O calculo antigo somava os simbolos ANTES de decidir —
	//      combMe = Math.Sign(MeDirection_ES + MeDirection_NQ)
	//  Com ES=+1 e NQ=0 (NQ silencioso ou sem grafico) isso dava combMe=+1 e o badge escrevia
	//  "ES·NQ AO CONF LONG" com o NQ **sem ter votado nada**. A soma tratava "NQ neutro" como
	//  "NQ nao discorda" em vez de "NQ nao confirma". Aqui cada simbolo e avaliado SEPARADO e
	//  os dois precisam confirmar (AND), nunca a soma.
	//
	//  Strength (0..4) segue sendo a CONTAGEM de canais alinhados e e independente de Ok — serve
	//  de termometro visual (as 4 bolinhas do Copilot). Da pra ter Strength=3 com Ok=false: e
	//  informacao util ("quase la"), nao contradicao.
	// ─────────────────────────────────────────────────────────────────────────────
	// ═══════════════════════════════════════════════════════════════════════════════════════
	//  AoPublisher — ELEICAO DE PUBLICADOR UNICO POR SIMBOLO. 2026-08-19.
	//
	//  🔴 O DEFEITO QUE ISTO CORRIGE (medido em 19/08, ES 09-26)
	//  Duas instancias do FlowOne no MESMO ativo, ambas com PublishHub ligado, escreviam nos
	//  MESMOS campos static: MeDirection_ES, MviDirection_ES, Press_ES, LastUpdate_ES — e em
	//  AoGate.PublishedMinForce/FreshSec. Ultimo a escrever vencia, no ritmo do tape.
	//
	//  Isso nao era so cosmetico. Press_ES e insumo do passo 4 do AoGate.EsNq(). Uma instancia
	//  recem-carregada publica pressao ~0 (os acumuladores dela zeram em DataLoaded e so contam
	//  em tempo real — decisao "forward-only" de 2026-07-24, mantida); a outra publica a pressao
	//  real da sessao. O gate entao alternava entre Ok=true e "forca fraca ES" a cada escrita, e
	//  o veredito oscilava entre "AO CONF LONG" e "AO offline" — inclusive FORA do NT8, porque
	//  o AlfaOmegaBridge :5151 chama AoGate.EsNq() e alimenta :3495 -> AOT :3600 -> Copilot.
	//
	//  O comentario do proprio AoGate ja dizia "nao ha disputa de ultimo-a-escrever-vence". Essa
	//  premissa valia para UMA instancia por simbolo. Com duas, caiu. Isto a restaura.
	//
	//  ── A REGRA DE DESEMPATE: MENOR ID VENCE ────────────────────────────────────────────────
	//  Os ids sao monotonicos, atribuidos na ordem de carga. Menor id = instancia que esta no ar
	//  ha mais tempo = a que acumulou MAIS sessao. Como os acumuladores sao forward-only, essa e
	//  literalmente a instancia com o dado mais completo — a escolha nao e arbitraria, e a
	//  unica defensavel.
	//
	//  ⚠️ DETERMINISMO (o requisito central): a eleicao NAO depende de quem chegou primeiro. Se
	//  uma instancia de id maior reivindicar antes, ela publica; quando a de id menor aparecer,
	//  TOMA o posto. O estado final e sempre o mesmo conjunto -> o mesmo dono, qualquer que
	//  tenha sido a ordem dos ticks. E o que separa isto de "ultimo a escrever vence".
	//
	//  ── POR QUE HA TOMADA POR SILENCIO, E NAO SO Release() ──────────────────────────────────
	//  Se o dono sumisse sem liberar (F5, excecao, grafico fechado torto), o posto ficaria preso
	//  num morto e o barramento inteiro emudeceria — :5151 sem tape, gate CLOSED em pleno RTH.
	//  Falhar para "ninguem publica" e MUITO pior do que publicar de uma fonte subotima. Por
	//  isso: dono calado por mais de TomadaSec perde o posto para quem estiver vivo.
	//
	//  🔴 ISTO NAO SILENCIA O PAINEL DE NINGUEM. A instancia que perde a eleicao continua
	//  desenhando os proprios numeros no proprio grafico, exatamente como antes. O que ela deixa
	//  de fazer e ESCREVER no barramento compartilhado. Divergencia entre paineis continua
	//  possivel (Causa 1, forward-only) — o que acaba e a oscilacao do veredito.
	// ═══════════════════════════════════════════════════════════════════════════════════════
	public static class AoPublisher
	{
		/// <summary>
		/// Silencio do dono que autoriza a tomada do posto.
		/// ⚠️ Tem de ser MAIOR que o intervalo normal entre publicacoes (o FlowOne publica no
		/// OnBarUpdate, OnEachTick) e MENOR que o frescor do gate (AoGate.DefaultFreshSec = 90s).
		/// Fora dessa faixa: curto demais faz dois donos revezarem — o defeito de volta com
		/// outro nome; longo demais deixa o barramento mudo alem do frescor e o gate fecha.
		/// </summary>
		public const double TomadaSec = 5.0;

		private sealed class Posse { public long Dono; public DateTime Batida; }

		private static readonly object _gate = new object();
		private static readonly Dictionary<string, Posse> _posses =
			new Dictionary<string, Posse>(StringComparer.OrdinalIgnoreCase);
		private static long _seq;

		/// <summary>Id monotonico da instancia. Chamar UMA vez por carga (State.DataLoaded).</summary>
		public static long NovoId()
		{
			lock (_gate) { return ++_seq; }
		}

		/// <summary>
		/// true SO para a instancia eleita dona deste simbolo. Quem receber false deve pular a
		/// escrita no barramento — e seguir desenhando o proprio painel normalmente.
		/// </summary>
		public static bool PodePublicar(string simbolo, long id)
		{
			if (string.IsNullOrEmpty(simbolo) || id <= 0) return false;
			DateTime agora = DateTime.Now;
			lock (_gate)
			{
				Posse p;
				if (!_posses.TryGetValue(simbolo, out p))
				{
					_posses[simbolo] = new Posse { Dono = id, Batida = agora };
					return true;
				}
				if (p.Dono == id) { p.Batida = agora; return true; }          // dono confirma presenca

				// menor id = mais tempo no ar = mais sessao acumulada -> toma o posto.
				// E o que torna a eleicao independente da ordem de chegada.
				if (id < p.Dono) { p.Dono = id; p.Batida = agora; return true; }

				// dono calado tempo demais: pode ter morrido sem liberar. Assume.
				if ((agora - p.Batida).TotalSeconds > TomadaSec)
				{
					p.Dono = id; p.Batida = agora; return true;
				}
				return false;
			}
		}

		/// <summary>Libera o posto no Terminated. So o proprio dono libera — nunca um terceiro.</summary>
		public static void Liberar(string simbolo, long id)
		{
			if (string.IsNullOrEmpty(simbolo) || id <= 0) return;
			lock (_gate)
			{
				Posse p;
				if (_posses.TryGetValue(simbolo, out p) && p.Dono == id) _posses.Remove(simbolo);
			}
		}

		/// <summary>Dono atual do simbolo (0 = ninguem). Diagnostico e texto de painel.</summary>
		public static long DonoDe(string simbolo)
		{
			if (string.IsNullOrEmpty(simbolo)) return 0;
			lock (_gate)
			{
				Posse p;
				return _posses.TryGetValue(simbolo, out p) ? p.Dono : 0;
			}
		}
	}

	public static class AoGate
	{
		// Limiar de forca UNICO p/ ES e NQ (decisao do operador: nao diferenciar por ativo).
		// ⚠️ CALIBRACAO: a analise de 180 dias do operador e de PRECO/convergencia direcional,
		//    nao de delta agressor — ela NAO fixa um limiar de pressao de tape. 0.03 (3% de
		//    agressao liquida da sessao) e um default AFROUXADO — era 0.05 ate 2026-08-16 — e
		//    segue NAO MEDIDO.
		//    ⚠️ MUDOU DE FAIXA: 0.05 ficava NO MEIO entre o OptPressNeutralMin (0.02 = banda de
		//    ruido das opcoes) e o DoubleConfPressMin (0.10 = "Delta confirma" da DOUBLE
		//    CONFLUENCE). 0.03 ENCOSTA na banda de ruido: o gate passa a ser PERMISSIVO — mais
		//    vereditos, e alguns deles em regiao que a propria suite classifica como ruido.
		//    Ajustavel por Property em cada indicador. MEDIR AO VIVO antes de tratar como
		//    verdade — mesma pendencia do RaioLimiarBi. Instrumentacao ja pronta p/ medir:
		//    .claude\gate-monitor\gate-monitor.js (coleta anchor.why do :5151 e separa
		//    reprovacao por FRESCOR x FORCA, que e o que decide se este limiar e mesmo o alvo).
		public const  double DefaultMinForce = 0.03;
		public const  double DefaultFreshSec = 90.0;

		// Valores publicados pelo FlowOne (dono natural do tape) p/ consumidores SEM Property
		// propria — hoje so o AlfaOmegaBridge :5151. Quem TEM Property passa o proprio valor
		// na sobrecarga explicita, entao nao ha disputa de "ultimo a escrever vence" na tela.
		public static double PublishedMinForce = DefaultMinForce;
		public static double PublishedFreshSec = DefaultFreshSec;

		public static AoGateResult EsNq() { return EsNq(PublishedMinForce, PublishedFreshSec); }

		// (2026-10-07) PRESS_RECALIBRATION_30D — limiar do passo 4 em funcao do volume REAL da sessao (formula G_CAP,
		// JEV req_01a118b075e971b6adc56b0ba060d1ce). Medido em 30 pregoes reais (2026-08-25..2026-10-06, tick db NT8):
		// |cumDelta| cresce como cumVol^alpha com alpha < 1, logo |Press| = |cumDelta|/cumVol cai so pelo crescimento do
		// denominador (RTH: passo 4 passava em 0,01 % dos minutos x 8,4 % fora do RTH). Limiar:
		//     limiar = minForce * min(1, C * (vol / Vbar)^-(1 - alpha))
		// TETO = minForce: nunca mais estrito que antes (OUTSIDE_RTH preservado); cai com o volume real do dia.
		// Constantes por simbolo, da janela de 30 pregoes (Vbar = volume medio da sessao inteira; C = multiplicador
		// que iguala a taxa total do passo 4 a do baseline). Sem volume valido => minForce (comportamento anterior).
		public const double PressNormC       = 0.3985;
		public const double PressNormAlphaEs = 0.6935;
		public const double PressNormAlphaNq = 0.6390;
		public const double PressNormVbarEs  = 1383035.0;
		public const double PressNormVbarNq  = 520328.0;

		// (2026-10-08) FORCA_JANELA_30 — limiar do passo 4 sobre o z-score da janela (AoForcaJanela), unico p/ ES e NQ.
		// Calibrado em 16 pregoes reais (2026-08-03..2026-08-26) para ~17,5 entradas/sessao e conferido fora da amostra em 28
		// (2026-08-27..2026-10-06): 20,7 entradas/sessao, contra 148/sessao sem passo de forca.
		public const double ForcaZMin = 3.454;

		public static double LimiarForca(double minForce, double vol, double alpha, double vbar)
		{
			if (!(vol > 0) || !(vbar > 0)) return minForce;
			double f = PressNormC * Math.Pow(vol / vbar, -(1.0 - alpha));
			if (double.IsNaN(f) || !(f < 1.0)) return minForce;
			return minForce * f;
		}

		/// <summary>
		/// (2026-08-19) O `Why` do gate e de INFRAESTRUTURA (algo quebrado, ha o que consertar)
		/// ou de ESTADO DE MERCADO (leitura legitima, nao ha o que consertar)?
		///
		/// 🔴 POR QUE ISTO EXISTE: as quatro razoes saiam na MESMA cor no painel. "sem tape NQ"
		/// (= falta FlowOne no grafico de NQ, ou o feed caiu) e "ES x NQ divergentes" (= o
		/// mercado esta em rotacao entre os indices) liam identicas. A primeira e uma TAREFA;
		/// a segunda e INFORMACAO. Confundi-las faz o operador ou ignorar uma pane ou procurar
		/// conserto para um mercado que esta apenas indeciso.
		///
		///   passos 1-2 do EsNq() -> INFRA  : "sem tape ..." · "... indefinido(s)"
		///   passos 3-4 do EsNq() -> MERCADO: "ES x NQ divergentes" · "forca fraca ..."
		///
		/// ⚠️ MORA AQUI, COLADO NAS MENSAGENS, DE PROPOSITO. Se este classificador vivesse no
		/// painel, um `Why` novo acrescentado ao EsNq() seria classificado como MERCADO em
		/// silencio — e uma pane nova nasceria invisivel. Quem acrescentar razao ali tem de
		/// passar por aqui: as duas coisas estao a dez linhas uma da outra.
		/// </summary>
		public static bool WhyEhInfra(string why)
		{
			if (string.IsNullOrEmpty(why)) return false;
			return why.StartsWith("sem tape", StringComparison.OrdinalIgnoreCase)
				|| why.IndexOf("indefinid", StringComparison.OrdinalIgnoreCase) >= 0;
		}

		public static AoGateResult EsNq(double minForce, double freshSec) { return EsNq(minForce, freshSec, DateTime.Now); }

		// (2026-10-08) o MESMO gate com o relogio explicito (harness offline). Producao entra pela sobrecarga acima.
		public static AoGateResult EsNq(double minForce, double freshSec, DateTime now)
		{
			var r = new AoGateResult();
			r.Dir = 0; r.Ok = false; r.Why = "";

			int esMe  = AlfaOmegaSharedState.MeDirection_ES,  esMvi = AlfaOmegaSharedState.MviDirection_ES;
			int nqMe  = AlfaOmegaSharedState.MeDirection_NQ,  nqMvi = AlfaOmegaSharedState.MviDirection_NQ;

			// Termometro (independente do gate): quantos dos 4 canais puxam p/ o lado majoritario.
			int total = esMe + esMvi + nqMe + nqMvi;
			int st = total < 0 ? -total : total;
			r.Strength = st > 4 ? 4 : st;

			// 1) tape VIVO nos DOIS simbolos (exige FlowOne no grafico de ES e no de NQ)
			DateTime uEs = AlfaOmegaSharedState.LastUpdate_ES, uNq = AlfaOmegaSharedState.LastUpdate_NQ;
			bool esFresh = uEs != DateTime.MinValue && (now - uEs).TotalSeconds < freshSec;
			bool nqFresh = uNq != DateTime.MinValue && (now - uNq).TotalSeconds < freshSec;
			if (!esFresh || !nqFresh)
			{
				r.Why = (!esFresh && !nqFresh) ? "sem tape ES/NQ" : (!esFresh ? "sem tape ES" : "sem tape NQ");
				return r;
			}

			// 2) direcao POR SIMBOLO — ME e MVI do MESMO simbolo tem que concordar.
			//    (e aqui que "NQ neutro" deixa de ser tratado como "NQ concorda")
			int esDir = (esMe != 0 && esMe == esMvi) ? esMe : 0;
			int nqDir = (nqMe != 0 && nqMe == nqMvi) ? nqMe : 0;
			if (esDir == 0 || nqDir == 0)
			{
				r.Why = (esDir == 0 && nqDir == 0) ? "ES e NQ indefinidos" : (esDir == 0 ? "ES indefinido" : "NQ indefinido");
				return r;
			}

			// 3) os DOIS no MESMO lado
			if (esDir != nqDir) { r.Why = "ES x NQ divergentes"; return r; }

			// 4) forca nos DOIS — (2026-10-08) FORCA_JANELA_30 (JEV DESIGN req_01a11b83310e7c01a1bd133b3ab8f0cc): z-score do fluxo
			//    agressor em janela movel de 30 min por simbolo (AoForcaJanela), sem reset de sessao. Aprova so com o SINAL de z igual
			//    a direcao do simbolo E |z| >= ForcaZMin, nos dois. Medida indisponivel (sem publicador / janela nao coberta) = reprova.
			//    As mensagens seguem "forca fraca ..." (o motor e o aot-sim tratam esse prefixo como NEUTRO transitorio).
			//    `minForce`, Press_* e LimiarForca ficam como telemetria/compatibilidade: nao decidem mais o passo 4.
			double zEs, zNq;
			bool okEs = AoForcaJanela.Avaliar(AlfaOmegaSharedState.Forca_ES, now, out zEs) && (esDir > 0 ? zEs >= ForcaZMin : zEs <= -ForcaZMin);
			bool okNq = AoForcaJanela.Avaliar(AlfaOmegaSharedState.Forca_NQ, now, out zNq) && (nqDir > 0 ? zNq >= ForcaZMin : zNq <= -ForcaZMin);
			if (!okEs || !okNq)
			{
				r.Why = (!okEs && !okNq) ? "forca fraca ES/NQ" : (!okEs ? "forca fraca ES" : "forca fraca NQ");
				return r;
			}

			r.Dir = esDir; r.Ok = true; r.Why = "";
			return r;
		}
	}

	/// <summary>
	/// (2026-10-08) FORCA_JANELA_30 — medida de forca do passo 4 do AoGate.EsNq.
	/// JEV CAUSAL T2 req_01a11b7fcb7078d9b0f571dfbf4071e9 · JEV DESIGN req_01a11b83310e7c01a1bd133b3ab8f0cc.
	///
	/// PROBLEMA: o Press (cumDelta / volume acumulado desde a virada) so passava o limiar com o denominador pequeno logo
	/// apos o reset das 18:00 ET e morria com o volume do dia — rajada de entradas apos o reset e horas de zona morta depois.
	///
	/// MEDIDA: por simbolo, z = soma(lado x volume) / raiz(soma(volume^2)) sobre os negocios dos ultimos JanelaSeg segundos.
	/// Sob fluxo sem direcao z tem variancia 1 em qualquer horario e qualquer volume; nao ha reset de sessao e a janela
	/// atravessa a pausa das 17-18h ET. O gate exige o SINAL de z igual a direcao e |z| >= AoGate.ForcaZMin nos dois simbolos.
	///
	/// VALIDADE (fail-closed, mesmo espirito do AoPressSessao): a janela so vale se foi coberta inteira — a cobertura
	/// recomeca na carga e depois de um buraco de tape > GapMaxSeg que NAO seja a pausa de virada de sessao. Tick historico
	/// real (reconstrucao na carga) conta como cobertura. Sem medida valida o gate reprova por forca.
	///
	/// CLASSE PURA (so System), thread-safe: o tape escreve na thread de dados e o gate le na thread do robo.
	/// </summary>
	public sealed class AoForcaJanela
	{
		public const int    JanelaSeg = 1800;
		public const double GapMaxSeg = 300;

		private readonly object _l = new object();
		private readonly long[]   _seg = new long[JanelaSeg];     // segundo (Ticks / TicksPerSecond) dono do balde
		private readonly long[]   _d   = new long[JanelaSeg];     // soma(lado x volume) do segundo
		private readonly double[] _q   = new double[JanelaSeg];   // soma(volume^2) do segundo
		private DateTime _ultimoTick = DateTime.MinValue;
		private DateTime _parTick = DateTime.MinValue, _parLocal = DateTime.MinValue;   // relogio do tape x relogio local, no ultimo publish
		private DateTime _cobertoDesde = DateTime.MinValue, _cobertoAntes = DateTime.MinValue;
		private DateTime _viradaEm = DateTime.MinValue, _buracoEm = DateTime.MinValue;

		/// <summary>Um negocio (tempo real ou historico real), com o lado ja classificado pelo motor de tape.</summary>
		public void Tick(int side, long vol, DateTime t)
		{
			if (t == DateTime.MinValue || vol <= 0) return;
			lock (_l)
			{
				if (_ultimoTick != DateTime.MinValue && (t - _ultimoTick).TotalSeconds > GapMaxSeg)
				{
					bool pausa = _viradaEm != DateTime.MinValue && Math.Abs((t - _viradaEm).TotalSeconds) <= GapMaxSeg;
					if (!pausa) { _cobertoAntes = _cobertoDesde; _buracoEm = t; _cobertoDesde = t; }
				}
				if (_cobertoDesde == DateTime.MinValue) _cobertoDesde = t;
				long s = t.Ticks / TimeSpan.TicksPerSecond;
				int i = (int)(s % JanelaSeg);
				if (_seg[i] > s) return;                              // negocio mais velho que a janela: descarta
				if (_seg[i] != s) { _seg[i] = s; _d[i] = 0; _q[i] = 0; }
				_d[i] += (long)side * vol;
				_q[i] += (double)vol * vol;
				if (t > _ultimoTick) _ultimoTick = t;
			}
		}

		/// <summary>
		/// Virada de sessao (primeira barra da sessao): o silencio da pausa NAO e buraco de tape. Vale nas duas ordens
		/// (virada antes ou depois do 1o negocio da sessao), como no AoPressSessao.
		/// </summary>
		public void ViradaSessao(DateTime t)
		{
			if (t == DateTime.MinValue) return;
			lock (_l)
			{
				_viradaEm = t;
				if (_buracoEm != DateTime.MinValue && Math.Abs((t - _buracoEm).TotalSeconds) <= GapMaxSeg)
				{ _cobertoDesde = _cobertoAntes; _buracoEm = DateTime.MinValue; }
			}
		}

		/// <summary>Carimbo do publish: amarra o relogio do tape ao relogio local (so diferencas de tempo sao usadas depois).</summary>
		public void MarcarLocal(DateTime localNow)
		{
			lock (_l) { _parTick = _ultimoTick; _parLocal = localNow; }
		}

		/// <summary>z da janela que termina em localNow. false = medida indisponivel (nunca publicada, velha ou janela nao coberta).</summary>
		public bool Ler(DateTime localNow, out double z)
		{
			z = 0.0;
			lock (_l)
			{
				if (_parTick == DateTime.MinValue || _cobertoDesde == DateTime.MinValue) return false;
				double el = (localNow - _parLocal).TotalSeconds;
				if (el < 0) el = 0;
				if (el > GapMaxSeg) return false;
				DateTime asOf = _parTick.AddSeconds(el);
				if ((asOf - _cobertoDesde).TotalSeconds < JanelaSeg) return false;
				long sFim = asOf.Ticks / TimeSpan.TicksPerSecond, sIni = sFim - JanelaSeg + 1;
				long d = 0; double q = 0.0;
				for (int i = 0; i < JanelaSeg; i++)
					if (_seg[i] >= sIni && _seg[i] <= sFim) { d += _d[i]; q += _q[i]; }
				if (q > 0.0) z = d / Math.Sqrt(q);
				return true;
			}
		}

		/// <summary>Leitura nula-segura para o gate.</summary>
		public static bool Avaliar(AoForcaJanela f, DateTime localNow, out double z)
		{
			z = 0.0;
			return f != null && f.Ler(localNow, out z);
		}
	}
}
