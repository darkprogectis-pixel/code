// AlfaOmegaBridge — AddOn ADITIVO (arquivo novo, não toca em nenhum .cs existente).
// Lê o AlfaOmegaSharedState (classe estática, mesmo processo/assembly) e expõe um
// snapshot READ-ONLY em http://127.0.0.1:5151/state para a extensão Chrome copiloto.
//
// * Somente leitura: não escreve no SharedState, não recebe comandos, não executa nada.
// * TcpListener (não HttpListener) → bind em 127.0.0.1 sem exigir urlacl/admin no NT8.
// * Servidor único por processo (guarda estática _running); vive enquanto o NT8 roda.
// * Contrato: schema "alfaomega-bridge/1" (ver /state abaixo).
#region Using declarations
using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using SS = NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState;
// Gate de confluencia ES×NQ (2026-07-27) — mesmo alias-style do SS: este AddOn vive em
// NinjaTrader.NinjaScript.AddOns, e o gate mora no namespace .Indicators.
using AoGate = NinjaTrader.NinjaScript.Indicators.AoGate;
//
// ⚠️ NAO REINTRODUZIR "using AoGateResult = ..." AQUI (nem dentro do namespace). 2026-08-18.
// O AlfaOmegaRoboGates.cs (17/08) declara uma OUTRA "public class AoGateResult" — shape
// totalmente diferente (Pass/Reason/StopPt/...) — dentro deste MESMO namespace
// NinjaTrader.NinjaScript.AddOns. Com o alias existindo em qualquer lugar, o build quebra:
//    • alias no TOPO do arquivo  -> o tipo do namespace vence em silencio
//                                   => CS0029 + 4x CS1061 (Ok/Dir/Strength/Why) no uso
//    • alias DENTRO do namespace -> ter os dois e ilegal
//                                   => CS0576 "contains a definition conflicting with alias"
// Nao existe posicao que resolva: o conflito e entre o NOME do alias e um tipo homonimo no
// namespace que envolve este codigo. Por isso o tipo e escrito QUALIFICADO no uso (ver o
// AoGate.EsNq() mais abaixo) e o alias foi removido.
//
// O alias de AoGate acima CONTINUA valido: nao ha tipo "AoGate" no namespace AddOns.
// Se a outra frente um dia declarar um, o mesmo tratamento se aplica a ele.
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
	public class AlfaOmegaBridge : AddOnBase
	{
		private const int Port = 5151;

		private static TcpListener   _listener;
		private static Thread        _thread;
		private static volatile bool _running;
		private static readonly object _gate = new object();

		// Heartbeat de preço (para priceAgeMs): LastPrice é escrito a cada tick, LastUpdate não.
		// Detecta "tape vivo" pela MUDANÇA de preço, não pelo LastUpdate (que só muda em evento de direção).
		private static double   _pxES, _pxNQ, _pxRTY;                                          // #21: +RTY
		private static DateTime _pxESAt = DateTime.MinValue, _pxNQAt = DateTime.MinValue, _pxRTYAt = DateTime.MinValue;
		private static double   _pxGC, _pxSI;                                                 // (2026-10-12) +GC +SI
		private static DateTime _pxGCAt = DateTime.MinValue, _pxSIAt = DateTime.MinValue;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Name = "AlfaOmega Bridge";
				Description = "Ponte read-only: expõe AnchorDirection/Strength, ME/MVI (ES/NQ/RTY), confluência GC×SI, latches e LastPrice em http://127.0.0.1:5151/state. Não executa ordens.";
				StartServer();          // idempotente (guarda estática) — inicia 1x por processo
				AoGcSiNativePublisher.Start();   // (2026-10-12 r3) publicador nativo GC/SI — idempotente, so leitura de Level 1
			}
			else if (State == State.Terminated)
			{
				// Libera a porta no unload/recompile — assim o F5 seguinte consegue rebind
				// (evita "apenas uma utilização de cada endereço de soquete"). Sem isso, a
				// thread antiga segura a 5151 e o código novo nao sobe ate reiniciar o NT8.
				StopServer();
				AoGcSiNativePublisher.Stop();    // (2026-10-12 r3) desassina o Level 1 de GC/SI desta geracao
			}
		}

		#region Server lifecycle
		private static void StartServer()
		{
			lock (_gate)
			{
				if (_running) return;
				try
				{
					_listener = new TcpListener(IPAddress.Loopback, Port);
					_listener.Start();
					_running = true;
					_thread = new Thread(Loop) { IsBackground = true, Name = "AlfaOmegaBridge" };
					_thread.Start();
					AppDomain.CurrentDomain.ProcessExit += (s, e) => StopServer();
					Log("iniciado em 127.0.0.1:" + Port);
				}
				catch (Exception ex)
				{
					_running = false;
					Log("FALHA ao iniciar: " + ex.Message);
				}
			}
		}

		private static void StopServer()
		{
			lock (_gate)
			{
				if (!_running) return;
				_running = false;
				try { if (_listener != null) _listener.Stop(); } catch { }
				Log("parado");
			}
		}

		private static void Loop()
		{
			while (_running)
			{
				try
				{
					TcpClient client = _listener.AcceptTcpClient();
					Handle(client);
				}
				catch
				{
					if (!_running) break;   // Stop() derruba o AcceptTcpClient — saída limpa
				}
			}
		}
		#endregion

		#region HTTP (mínimo)
		private static void Handle(TcpClient client)
		{
			try
			{
				using (client)
				using (NetworkStream ns = client.GetStream())
				{
					client.ReceiveTimeout = 1000;
					byte[] buf = new byte[2048];
					int read = ns.Read(buf, 0, buf.Length);
					if (read <= 0) return;

					string first = Encoding.ASCII.GetString(buf, 0, read).Split('\n')[0].Trim();
					string[] parts = first.Split(' ');
					string method = parts.Length > 0 ? parts[0] : "GET";
					string path   = parts.Length > 1 ? parts[1] : "/";

					if (method == "OPTIONS")            { Write(ns, 204, "text/plain", ""); return; }
					if (method != "GET")                { Write(ns, 405, "text/plain", "Method Not Allowed"); return; }
					if (path.StartsWith("/health"))     { Write(ns, 200, "text/plain", "ok"); return; }
					if (path.StartsWith("/state"))      { Write(ns, 200, "application/json", BuildState()); return; }
					Write(ns, 404, "text/plain", "Not Found");
				}
			}
			catch (Exception ex) { Log("req erro: " + ex.Message); }
		}

		private static void Write(NetworkStream ns, int code, string ctype, string body)
		{
			string status = code == 200 ? "OK" : code == 204 ? "No Content"
						  : code == 404 ? "Not Found" : code == 405 ? "Method Not Allowed" : "Error";
			byte[] b = Encoding.UTF8.GetBytes(body ?? "");
			StringBuilder h = new StringBuilder();
			h.Append("HTTP/1.1 ").Append(code).Append(' ').Append(status).Append("\r\n");
			h.Append("Access-Control-Allow-Origin: *\r\n");
			h.Append("Access-Control-Allow-Methods: GET, OPTIONS\r\n");
			h.Append("Cache-Control: no-store\r\n");
			h.Append("Content-Type: ").Append(ctype).Append("; charset=utf-8\r\n");
			h.Append("Content-Length: ").Append(b.Length).Append("\r\n");
			h.Append("Connection: close\r\n\r\n");
			byte[] hb = Encoding.ASCII.GetBytes(h.ToString());
			ns.Write(hb, 0, hb.Length);
			if (b.Length > 0) ns.Write(b, 0, b.Length);
			ns.Flush();
		}
		#endregion

		#region Snapshot do SharedState (read-only)
		// (2026-10-06) generation-safe tape — ver AoTapeGen abaixo. Depois de um F5 este AddOn nasce na geracao
		// NOVA do NinjaTrader.Custom, mas os produtores do tape (FlowOne / AoControlCenter dos graficos) seguem na
		// geracao ANTIGA e escrevem o SharedState ANTIGO. Se a propria geracao nao tem tape vivo e outra tem, o
		// /state inteiro e montado pelo BuildState DAQUELA geracao (codigo e dados coerentes). Senao: como antes.
		private static string BuildState()
		{
			try
			{
				string other = AoTapeGen.TryOther(typeof(SS), AoTapeGen.Newest(SS.LastUpdate_ES, SS.LastUpdate_NQ), DateTime.Now);
				if (other != null)
				{
					// (2026-10-12 r2) o JSON delegado vem do codigo de OUTRA geracao (pode nao conhecer gc/si). ES/NQ e
					// todo o resto ficam byte a byte como vieram; so as pernas gc/si sao inseridas/substituidas.
					try { return AoGcSiGen.Merge(other, GcSiLeg("GC", ref _pxGC, ref _pxGCAt), GcSiLeg("SI", ref _pxSI, ref _pxSIAt)); }
					catch { return other; }
				}
			}
			catch { }
			return BuildStateLocal();
		}

		private static string BuildStateLocal()
		{
			CultureInfo ci = CultureInfo.InvariantCulture;
			long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

			// ── ANCORA ES×NQ (2026-07-27) — gate aplicado TAMBEM neste canal ────────────
			// Decisao do operador: a mesma regra vale na tela do NT8 E no Telegram/AOT.
			// Calculado AQUI (AoGate) em vez de so reler SS.AnchorDirection: o campo do bus so e
			// preenchido pelo Copilot com PublishAnchor=true; sem Copilot no grafico ele fica
			// parado e o Telegram receberia direcao velha. Assim o gate vale mesmo sem Copilot.
			// Limiar/frescor vem do que o FlowOne publicou (AoGate.Published*) — este AddOn nao
			// tem Property propria.
			// Tipo QUALIFICADO de proposito (2026-08-18): "AoGateResult" simples colide com a
			// classe homonima do AlfaOmegaRoboGates.cs neste mesmo namespace. Ver o bloco de
			// usings no topo do arquivo. Nao trocar por alias.
			NinjaTrader.NinjaScript.Indicators.AoGateResult _g = AoGate.EsNq();
			int aDir = _g.Ok ? _g.Dir : 0;      // fail-closed: sem confluencia real => NEUTRO
			int aStr = _g.Strength;
			string aWhy = _g.Why ?? "";

			int meES = SS.MeDirection_ES, mviES = SS.MviDirection_ES;
			int meNQ = SS.MeDirection_NQ, mviNQ = SS.MviDirection_NQ;
			int confES = (meES != 0 && meES == mviES) ? meES : 0;
			int confNQ = (meNQ != 0 && meNQ == mviNQ) ? meNQ : 0;

			int meCombES = 0, mviCombES = 0, meCombNQ = 0, mviCombNQ = 0;
			try { meCombES = SS.GetMeDir_ES_Combined(); mviCombES = SS.GetMviDir_ES_Combined();
			      meCombNQ = SS.GetMeDir_NQ_Combined(); mviCombNQ = SS.GetMviDir_NQ_Combined(); } catch { }

			double pES = SS.LastPrice_ES, pNQ = SS.LastPrice_NQ;
			long ageES = AgeMs(SS.LastUpdate_ES), ageNQ = AgeMs(SS.LastUpdate_NQ);

			bool rev = SS.MeIsReversal   && SS.MviIsReversal;
			bool abs = SS.MeIsAbsorption && SS.MviIsAbsorption;
			double vPace = SS.VelocityPace, vSpeed = SS.VelocitySpeed;

			long pAgeES = PriceAge(pES, ref _pxES, ref _pxESAt);
			long pAgeNQ = PriceAge(pNQ, ref _pxNQ, ref _pxNQAt);

			// #21 — leg RTY ("carona" gated ES×NQ, manual) + confluência auxiliar GC×SI (display, nunca operada)
			int meRTY = SS.MeDirection_RTY, mviRTY = SS.MviDirection_RTY;
			int confRTY = (meRTY != 0 && meRTY == mviRTY) ? meRTY : 0;
			int meCombRTY = 0, mviCombRTY = 0;
			try { meCombRTY = SS.GetMeDir_RTY_Combined(); mviCombRTY = SS.GetMviDir_RTY_Combined(); } catch { }
			double pRTY = SS.LastPrice_RTY;
			long ageRTY = AgeMs(SS.LastUpdate_RTY);
			long pAgeRTY = PriceAge(pRTY, ref _pxRTY, ref _pxRTYAt);
			int auxDir = SS.AuxGcSiDir, auxStr = SS.AuxGcSiStrength;

			// (2026-10-12, aditivo; r2 generation-safe) pernas individuais GC e SI — mesmos campos das pernas es/nq/rty,
			// lidos do SharedState da geracao com LastUpdate_GC/SI mais novo (ver GcSiLeg / AoGcSiGen). So publica:
			// nenhum gate, nenhuma decisao, nenhuma ordem muda.

			bool ready    = pES > 0 || pNQ > 0;
			bool tapeLive = ready && Math.Min(pAgeES, pAgeNQ) < 15000;   // tape vivo = preço mudou nos últimos 15s

			StringBuilder sb = new StringBuilder(640);
			sb.Append("{");
			sb.Append("\"schema\":\"alfaomega-bridge/1\",");
			sb.Append("\"ts\":").Append(now).Append(",");
			sb.Append("\"ready\":").Append(ready ? "true" : "false").Append(",");
			sb.Append("\"tapeLive\":").Append(tapeLive ? "true" : "false").Append(",");
			sb.Append("\"isReplay\":").Append(SS.IsInReplay ? "true" : "false").Append(",");   // FASE 0 replay: consumidores (consolidator/BFF) bloqueiam Telegram/narração e seguem o horário do replay
			// "why" = motivo do NEUTRO (novo em 2026-07-27, aditivo — consumidores antigos ignoram).
			// Permite o narrador/Telegram dizer POR QUE nao ha sinal em vez de so silenciar.
			sb.Append("\"anchor\":{\"dir\":").Append(aDir).Append(",\"strength\":").Append(aStr)
			  .Append(",\"why\":\"").Append(Esc(aWhy)).Append("\"")
			  // (2026-10-05, aditivo) motivo de bloqueio em codigo estavel; distingue "forca abaixo do minimo" de
			  // "Press ainda nao valido" SEM mudar o `why` (o motor e o aot-sim leem o prefixo "forca fraca").
			  .Append(",\"block\":").Append(JsonStrOuNull(NinjaTrader.NinjaScript.Indicators.AoPressBloqueio.Motivo(_g.Ok, aWhy, SS.PressState_ES, SS.PressState_NQ))).Append("},");
			// ── VEREDITO HIBRIDO (2026-07-27, aditivo) — Futuros = direcao · Opcoes = reforco ──
			// Publicado pelo FlowOne no SharedState; aqui so relaiado. Consumidores antigos ignoram.
			// ⚠️ SEMANTICA P/ QUEM CONSOME (narrador/Telegram/AOT):
			//    `dir` JA vem com o gate ES×NQ aplicado (0 = NEUTRO). NAO reprocessar.
			//    `optScore` e INFORMATIVO: opcoes NUNCA vetam nem invertem a direcao. Quando
			//    `divergent` = true, a direcao segue valendo — e contexto, nao contra-ordem.
			//    `confidence` = 0.5*|fut| + 0.5*(concordando ? |opt| : 0), modulada pelo regime 0DTE.
			//    `stale` = o FlowOne nao publica ha >120s (sem grafico aberto, p.ex.) -> ignore o resto.
			bool hybStale = SS.HybUpdate == default(DateTime) || (DateTime.Now - SS.HybUpdate).TotalSeconds > 120;
			sb.Append("\"hybrid\":{\"dir\":").Append(hybStale ? 0 : SS.HybDir)
			  .Append(",\"futScore\":").Append((hybStale ? 0.0 : SS.HybFutScore).ToString("0.###", ci))
			  .Append(",\"optScore\":").Append((hybStale ? 0.0 : SS.HybOptScore).ToString("0.###", ci))
			  .Append(",\"confidence\":").Append((hybStale ? 0.0 : SS.HybConfidence).ToString("0.###", ci))
			  .Append(",\"confirmed\":").Append(!hybStale && SS.HybConfirmed ? "true" : "false")
			  .Append(",\"divergent\":").Append(!hybStale && SS.HybDivergent ? "true" : "false")
			  .Append(",\"stale\":").Append(hybStale ? "true" : "false").Append("},");
			// ── CURVA DE GAMMA — TELEMETRIA (2026-07-28, aditivo) ────────────────────────
			// Existe p/ tornar verificavel, sem olhar a tela, se o AlfaOmegaHiro esta RECEBENDO
			// a curva do /levels/:sym. pts=0 ou stale=true => nao chegou (ou o Hiro nao esta em
			// nenhum grafico). NAO alimenta decisao: e diagnostico, nao sinal.
			bool gcStale = SS.GammaCurveUpdate == default(DateTime) || (DateTime.Now - SS.GammaCurveUpdate).TotalSeconds > 300;
			sb.Append("\"gammaCurve\":{\"pts\":").Append(gcStale ? 0 : SS.GammaCurvePts)
			  .Append(",\"maxAbs\":").Append((gcStale ? 0.0 : SS.GammaCurveMaxAbs).ToString("0.##", ci))
			  .Append(",\"zeroCrossFut\":").Append((gcStale || double.IsNaN(SS.GammaCurveZero) ? 0.0 : SS.GammaCurveZero).ToString("0.##", ci))
			  .Append(",\"sym\":\"").Append(Esc(gcStale ? "" : (SS.GammaCurveSym ?? "")))
			  .Append("\",\"stale\":").Append(gcStale ? "true" : "false").Append("},");
			sb.Append("\"global\":{\"reversal\":").Append(rev ? "true" : "false")
			  .Append(",\"absorption\":").Append(abs ? "true" : "false")
			  .Append(",\"velocityPace\":").Append(vPace.ToString("0.###", ci))
			  .Append(",\"velocitySpeed\":").Append(vSpeed.ToString("0.###", ci)).Append("},");
			sb.Append("\"es\":").Append(Leg(meES, mviES, confES, meCombES, mviCombES, pES, ageES, pAgeES, SS.Press_ES, ci, SS.PressState_ES)).Append(",");
			sb.Append("\"nq\":").Append(Leg(meNQ, mviNQ, confNQ, meCombNQ, mviCombNQ, pNQ, ageNQ, pAgeNQ, SS.Press_NQ, ci, SS.PressState_NQ)).Append(",");
			sb.Append("\"rty\":").Append(Leg(meRTY, mviRTY, confRTY, meCombRTY, mviCombRTY, pRTY, ageRTY, pAgeRTY, 0d, ci)).Append(",");   // #21
			sb.Append("\"gc\":").Append(GcSiLeg("GC", ref _pxGC, ref _pxGCAt)).Append(",");   // (2026-10-12) GC individual
			sb.Append("\"si\":").Append(GcSiLeg("SI", ref _pxSI, ref _pxSIAt)).Append(",");   // (2026-10-12) SI individual
			sb.Append("\"auxGcSi\":{\"dir\":").Append(auxDir).Append(",\"strength\":").Append(auxStr).Append("},");
			// limiares EM VIGOR no gate (vem da Property do FlowOne). Sem eles o `press` publicado
			// acima nao tem referencia: quem le nao sabe contra que numero ele foi comparado.
			sb.Append("\"gateParams\":{\"minForce\":").Append(AoGate.PublishedMinForce.ToString("0.#####", ci))
			  .Append(",\"freshSec\":").Append(AoGate.PublishedFreshSec.ToString("0.##", ci)).Append("},");                   // #21
			// resumo do que o badge do Copilot está exibindo (fonte única p/ o narrador modo "Só Copilot")
			// (2026-10-06) generation-safe: depois de um F5 os Copilots dos graficos seguem na geracao ANTIGA do
			// NinjaTrader.Custom (State=Realtime, nao recarregados) e escrevem o SharedState ANTIGO; este AddOn e
			// recriado na geracao NOVA. AoCopilotBadgeGen le o CopilotBadge de todas as geracoes e fica com o mais novo.
			string copilotBadge = AoCopilotBadgeGen.Read(SS.CopilotBadge, typeof(SS), AoCopilotBadgeGen.NowMs());
			sb.Append("\"copilotBadge\":").Append(string.IsNullOrEmpty(copilotBadge) ? "null" : copilotBadge);
			sb.Append("}");
			return sb.ToString();
		}

		// ⚠️ 2026-08-19 (C1) — `press` passou a ser PUBLICADO.
		// MOTIVO: a forca (`Press_ES`/`Press_NQ`) e o que o AoGate compara contra o EsNqMinForce,
		// e era a UNICA entrada do gate que nao saia em lugar nenhum. Medido em 14.776 ciclos
		// (03-19/08): a forca barra 2.853 dos 3.710 episodios de 4/4 — 77% — e nao havia como
		// calibrar o limiar porque o valor nao existia em nenhum log. Publicar aqui e o passo
		// que torna a calibracao mensuravel em vez de chute.
		// ⚠️ ADITIVO: nao altera nenhum calculo, nenhum gate, nenhuma decisao. So expoe o numero.
		// (2026-10-12 r2) perna GC ou SI lida por reflexao do SharedState da geracao com LastUpdate_<sym> mais novo
		// (propria geracao vence empate). Depois de um F5 os graficos de GC/SI podem estar em geracao diferente
		// da deste AddOn; sem isto a perna sairia vazia ate recarregar o grafico. So leitura.
		private static string GcSiLeg(string sym, ref double px, ref DateTime pxAt)
		{
			Type t = AoGcSiGen.Best(typeof(SS), sym);
			int me = AoGcSiGen.I(t, "MeDirection_" + sym), mvi = AoGcSiGen.I(t, "MviDirection_" + sym);
			int conf = (me != 0 && me == mvi) ? me : 0;
			int meComb = AoGcSiGen.Call(t, "GetMeDir_" + sym + "_Combined"), mviComb = AoGcSiGen.Call(t, "GetMviDir_" + sym + "_Combined");
			double p = AoGcSiGen.D(t, "LastPrice_" + sym);
			long age = AgeMs(AoGcSiGen.T(t, "LastUpdate_" + sym));
			long pAge = PriceAge(p, ref px, ref pxAt);
			return Leg(me, mvi, conf, meComb, mviComb, p, age, pAge, AoGcSiGen.D(t, "Press_" + sym), CultureInfo.InvariantCulture);
		}

		private static string Leg(int me, int mvi, int conf, int meComb, int mviComb, double price, long age, long priceAge, double press, CultureInfo ci, string pressState = null)
		{
			return "{\"me\":" + me + ",\"mvi\":" + mvi + ",\"conf\":" + conf
				 + ",\"meComb\":" + meComb + ",\"mviComb\":" + mviComb
				 + ",\"press\":" + press.ToString("0.#####", ci)
				 // (2026-10-05, aditivo) estado do Press publicado: PRESS_WARMUP | PRESS_VALID | PRESS_UNAVAILABLE | null (nao publicado).
				 + ",\"pressState\":" + JsonStrOuNull(pressState)
				 // (2026-09-16) preco invalido (0 apos recarga da assembly, NaN, Inf) sai como null — NUNCA como 0.
				 // Em 15/09 22:55Z o F5 zerou SharedState.LastPrice_*, esta linha publicou "lastPrice":0 e o
				 // simulador do AOT fechou uma posicao com exit 0 (−$968.682,50 falsos). null = "sem preco".
				 + ",\"lastPrice\":" + ((price > 0 && !double.IsNaN(price) && !double.IsInfinity(price)) ? price.ToString("0.##", ci) : "null")
				 + ",\"ageMs\":" + age + ",\"priceAgeMs\":" + priceAge + "}";
		}

		private static string JsonStrOuNull(string s) { return s == null ? "null" : "\"" + Esc(s) + "\""; }

		// Escape JSON minimo p/ o campo anchor.why. O vocabulario do AoGate e ASCII fixo e nao
		// contem aspas nem barras, mas escapar aqui evita que um motivo novo quebre o payload.
		private static string Esc(string s)
		{
			if (string.IsNullOrEmpty(s)) return "";
			return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
		}

		private static long AgeMs(DateTime t)
		{
			if (t == default(DateTime)) return 86400000L;   // nunca publicado → tratar como stale
			double ms = (DateTime.Now - t).TotalMilliseconds;
			return ms < 0 ? 0 : (long)ms;
		}

		// priceAgeMs = tempo desde a última MUDANÇA de LastPrice. Serializado por request (loop
		// single-thread do TcpListener), então o ref sobre os campos estáticos é seguro.
		private static long PriceAge(double current, ref double last, ref DateTime lastAt)
		{
			DateTime now = DateTime.Now;
			if (current > 0 && current != last) { last = current; lastAt = now; }
			if (lastAt == default(DateTime)) return 86400000L;   // ainda sem preço → stale
			double ms = (now - lastAt).TotalMilliseconds;
			return ms < 0 ? 0 : (long)ms;
		}
		#endregion

		#region Log diagnóstico (arquivo próprio; não interfere em nada)
		private static string LogPath
		{
			get
			{
				try { return Path.Combine(NinjaTrader.Core.Globals.UserDataDir, "alfaomega_bridge.log"); }
				catch { return "alfaomega_bridge.log"; }
			}
		}
		private static void Log(string msg)
		{
			try { File.AppendAllText(LogPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  AlfaOmegaBridge  " + msg + Environment.NewLine); }
			catch { }
		}
		#endregion
	}
	// ── BEGIN AoCopilotBadgeGen (2026-10-06) ─────────────────────────────────────────────────
	// CAUSA (ClrMD 2026-10-06): o compile/F5 carrega uma geracao nova do NinjaTrader.Custom e recria os
	// AddOns (este Bridge), mas os indicadores ja abertos nos graficos (AlfaOmegaCopilotUnificado) seguem
	// vivos na geracao anterior ate o grafico recarregar. Cada geracao tem o SEU static AlfaOmegaSharedState
	// => o produtor escrevia um, o Bridge lia outro (null) => "Selo do Copilot" DOWN ate reiniciar o NT8.
	// FIX: so leitura, so no consumidor. Le o CopilotBadge (string, tipo do mscorlib) de toda geracao de
	// AlfaOmegaSharedState carregada no AppDomain e devolve o mais novo pelo carimbo "at" do proprio badge.
	// Geracao propria: comportamento de antes (vale sem limite de idade). Outras geracoes: so com "at" ate
	// OtherGenMaxAgeMs atras (geracao morta/parada nao mascara null verdadeiro). Sem timer, sem thread,
	// sem escrita em SharedState; a varredura de assemblies so refaz quando o numero de assemblies muda.
	public static class AoCopilotBadgeGen
	{
		public const string SharedStateType = "NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState";
		public const long OtherGenMaxAgeMs = 120000;
		private static readonly object _lock = new object();
		private static int _asmCount = -1;
		private static System.Reflection.PropertyInfo[] _props = new System.Reflection.PropertyInfo[0];
		public static int Scans;     // diagnostico/teste: quantas varreduras de assemblies ja ocorreram

		public static long NowMs()
		{
			return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
		}

		public static string Read(string own, Type ownType, long nowMs)
		{
			string best = string.IsNullOrEmpty(own) ? null : own;
			long bestAt = best == null ? long.MinValue : At(best);
			System.Reflection.PropertyInfo[] props = Others(ownType);
			for (int i = 0; i < props.Length; i++)
			{
				string v = null;
				try { v = props[i].GetValue(null, null) as string; } catch { }
				if (string.IsNullOrEmpty(v)) continue;
				long at = At(v);
				if (at <= 0 || nowMs - at > OtherGenMaxAgeMs) continue;
				if (best == null || at > bestAt) { best = v; bestAt = at; }
			}
			return best;
		}

		private static System.Reflection.PropertyInfo[] Others(Type ownType)
		{
			System.Reflection.Assembly[] asms;
			try { asms = AppDomain.CurrentDomain.GetAssemblies(); } catch { return new System.Reflection.PropertyInfo[0]; }
			lock (_lock)
			{
				if (asms.Length == _asmCount) return _props;
				var list = new System.Collections.Generic.List<System.Reflection.PropertyInfo>();
				for (int i = 0; i < asms.Length; i++)
				{
					if (ownType != null && asms[i] == ownType.Assembly) continue;
					Type t = null;
					try { t = asms[i].GetType(SharedStateType, false); } catch { }
					if (t == null) continue;
					System.Reflection.PropertyInfo p = null;
					try { p = t.GetProperty("CopilotBadge", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static); } catch { }
					if (p != null && p.CanRead && p.PropertyType == typeof(string)) list.Add(p);
				}
				_props = list.ToArray();
				_asmCount = asms.Length;
				Scans++;
				return _props;
			}
		}

		// carimbo "at" (epoch ms) do JSON do badge; 0 se ausente/ilegivel.
		public static long At(string json)
		{
			if (string.IsNullOrEmpty(json)) return 0;
			int k = json.LastIndexOf("\"at\":", StringComparison.Ordinal);
			if (k < 0) return 0;
			k += 5;
			long v = 0; bool any = false;
			while (k < json.Length && json[k] >= '0' && json[k] <= '9' && v < 100000000000000L) { v = v * 10 + (json[k] - '0'); k++; any = true; }
			return any ? v : 0;
		}
	}
	// ── END AoCopilotBadgeGen ────────────────────────────────────────────────────────────────

	// ── BEGIN AoTapeGen (2026-10-06) ─────────────────────────────────────────────────────────
	// CAUSA (ClrMD 2026-10-06 13:44Z, handoffs/alfaomega-audit/CLR_INSPECT_TAPE_STALL_20261006.txt): o F5 das
	// 12:59Z recriou este Bridge na geracao nova (tmp/2d11e607…), cujo SharedState ES/NQ ficou vazio
	// (LastPrice=0, LastUpdate=default => AgeMs devolve o sentinel 86400000), enquanto FlowOne x4 e
	// AoControlCenter x5 (State=Realtime) seguiam publicando o tape na geracao do boot => "Fita ES/NQ STALLED".
	// FIX: so leitura, so no consumidor. Propria geracao com tape vivo (LastUpdate ES/NQ ate MaxAgeSec) =>
	// comportamento de antes. Senao, a geracao com LastUpdate mais novo dentro de MaxAgeSec monta o /state com
	// o PROPRIO BuildState (prefere BuildStateLocal, que existe a partir deste fix; geracao pre-fix so tem
	// BuildState, sem delegacao => sem recursao). Nenhuma geracao viva => propria (stall real continua visivel).
	// Sem timer, sem thread, sem escrita em SharedState; varredura so quando o numero de assemblies muda.
	public static class AoTapeGen
	{
		public const string SharedStateType = "NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState";
		public const string BridgeType = "NinjaTrader.NinjaScript.AddOns.AlfaOmegaBridge";
		public const double MaxAgeSec = 120;
		private static readonly object _lock = new object();
		private static int _asmCount = -1;
		private static Gen[] _gens = new Gen[0];
		public static int Scans;            // diagnostico/teste: varreduras de assemblies
		public static string LastSource;    // diagnostico/teste: "own" ou o assembly que montou o ultimo /state

		public sealed class Gen
		{
			public string Name;
			public System.Reflection.PropertyInfo Es, Nq;
			public System.Reflection.MethodInfo Build;
		}

		public static DateTime Newest(DateTime a, DateTime b) { return a > b ? a : b; }

		public static bool Vivo(DateTime t, DateTime now)
		{
			if (t == default(DateTime)) return false;
			double s = (now - t).TotalSeconds;
			return s <= MaxAgeSec;
		}

		// escolha pura: -1 = propria geracao; senao o indice da outra geracao com tape vivo mais novo.
		public static int Escolher(DateTime own, DateTime[] others, DateTime now)
		{
			if (Vivo(own, now)) return -1;
			int best = -1; DateTime bestT = default(DateTime);
			for (int i = 0; i < others.Length; i++)
			{
				if (!Vivo(others[i], now)) continue;
				if (best < 0 || others[i] > bestT) { best = i; bestT = others[i]; }
			}
			return best;
		}

		public static string TryOther(Type ownSS, DateTime ownNewest, DateTime now)
		{
			if (Vivo(ownNewest, now)) { LastSource = "own"; return null; }
			Gen[] gens = Others(ownSS);
			if (gens.Length == 0) { LastSource = "own"; return null; }
			DateTime[] ts = new DateTime[gens.Length];
			for (int i = 0; i < gens.Length; i++)
			{
				try { ts[i] = Newest((DateTime)gens[i].Es.GetValue(null, null), (DateTime)gens[i].Nq.GetValue(null, null)); }
				catch { ts[i] = default(DateTime); }
			}
			int k = Escolher(ownNewest, ts, now);
			if (k < 0) { LastSource = "own"; return null; }
			string json = null;
			try { json = gens[k].Build.Invoke(null, null) as string; } catch { }
			if (string.IsNullOrEmpty(json) || json[0] != '{') { LastSource = "own"; return null; }
			LastSource = gens[k].Name;
			return json;
		}

		private static Gen[] Others(Type ownSS)
		{
			System.Reflection.Assembly[] asms;
			try { asms = AppDomain.CurrentDomain.GetAssemblies(); } catch { return new Gen[0]; }
			lock (_lock)
			{
				if (asms.Length == _asmCount) return _gens;
				var list = new System.Collections.Generic.List<Gen>();
				const System.Reflection.BindingFlags PS = System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static;
				const System.Reflection.BindingFlags NS = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static;
				for (int i = 0; i < asms.Length; i++)
				{
					if (ownSS != null && asms[i] == ownSS.Assembly) continue;
					Type ss = null, br = null;
					try { ss = asms[i].GetType(SharedStateType, false); br = asms[i].GetType(BridgeType, false); } catch { }
					if (ss == null || br == null) continue;
					Gen g = new Gen();
					try
					{
						g.Name = asms[i].ManifestModule.ScopeName + "#" + i;
						g.Es = ss.GetProperty("LastUpdate_ES", PS);
						g.Nq = ss.GetProperty("LastUpdate_NQ", PS);
						g.Build = br.GetMethod("BuildStateLocal", NS, null, Type.EmptyTypes, null) ?? br.GetMethod("BuildState", NS, null, Type.EmptyTypes, null);
					}
					catch { continue; }
					if (g.Es == null || g.Nq == null || g.Build == null || g.Build.ReturnType != typeof(string)) continue;
					if (g.Es.PropertyType != typeof(DateTime) || g.Nq.PropertyType != typeof(DateTime)) continue;
					list.Add(g);
				}
				_gens = list.ToArray();
				_asmCount = asms.Length;
				Scans++;
				return _gens;
			}
		}
	}
	// ── END AoTapeGen ────────────────────────────────────────────────────────────────────────

	// ── BEGIN AoGcSiGen (2026-10-12 r2) ──────────────────────────────────────────────────────
	// CAUSA (2026-10-12): depois do F5 o /state e montado pela geracao ANTIGA (AoTapeGen, tape ES/NQ vivo la),
	// cujo codigo nao publica gc/si; e os graficos de GC/SI recarregados gravam o SharedState de outra geracao.
	// FIX: so leitura, so GC/SI. Best() escolhe o AlfaOmegaSharedState (de qualquer geracao carregada) com o
	// LastUpdate_<sym> mais novo — propria geracao vence empate; Merge() insere/substitui so "gc" e "si" no JSON
	// delegado. Sem timer, sem thread, sem escrita; varredura de assemblies so quando o numero delas muda.
	public static class AoGcSiGen
	{
		public const string SharedStateType = "NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState";
		private const System.Reflection.BindingFlags PS = System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static;
		private static readonly object _lock = new object();
		private static int _asmCount = -1;
		private static Type[] _others = new Type[0];

		public static int I(Type t, string n) { try { return (int)t.GetProperty(n, PS).GetValue(null, null); } catch { return 0; } }
		public static double D(Type t, string n) { try { return (double)t.GetProperty(n, PS).GetValue(null, null); } catch { return 0d; } }
		public static DateTime T(Type t, string n) { try { return (DateTime)t.GetProperty(n, PS).GetValue(null, null); } catch { return default(DateTime); } }
		public static int Call(Type t, string n) { try { return (int)t.GetMethod(n, PS, null, Type.EmptyTypes, null).Invoke(null, null); } catch { return 0; } }

		// escolha pura: indice em 'others' com carimbo estritamente mais novo que o proprio; -1 = propria geracao.
		public static int Escolher(DateTime own, DateTime[] others)
		{
			int best = -1; DateTime bestT = own;
			for (int i = 0; i < others.Length; i++) if (others[i] > bestT) { best = i; bestT = others[i]; }
			return best;
		}

		public static Type Best(Type own, string sym)
		{
			try
			{
				Type[] o = Others(own);
				if (o.Length == 0) return own;
				DateTime[] ts = new DateTime[o.Length];
				for (int i = 0; i < o.Length; i++) ts[i] = T(o[i], "LastUpdate_" + sym);
				int k = Escolher(T(own, "LastUpdate_" + sym), ts);
				return k < 0 ? own : o[k];
			}
			catch { return own; }
		}

		// insere/substitui so as pernas "gc" e "si" (objetos planos); o resto do JSON fica byte a byte igual.
		public static string Merge(string json, string gc, string si)
		{
			if (string.IsNullOrEmpty(json) || json[0] != '{') return json;
			return Put(Put(json, "gc", gc), "si", si);
		}

		public static string Put(string json, string key, string obj)
		{
			if (string.IsNullOrEmpty(obj) || obj[0] != '{') return json;
			string k = "\"" + key + "\":";
			int i = json.IndexOf(k + "{", StringComparison.Ordinal);
			if (i >= 0)
			{
				int e = json.IndexOf('}', i);
				return e < 0 ? json : json.Substring(0, i) + k + obj + json.Substring(e + 1);
			}
			if (json.IndexOf(k, StringComparison.Ordinal) >= 0) return json;            // chave existe com valor nao-objeto: nao mexe
			int a = json.IndexOf("\"auxGcSi\":", StringComparison.Ordinal);
			if (a >= 0) return json.Substring(0, a) + k + obj + "," + json.Substring(a);
			int z = json.LastIndexOf('}');
			return z <= 0 ? json : json.Substring(0, z) + "," + k + obj + json.Substring(z);
		}

		private static Type[] Others(Type own)
		{
			System.Reflection.Assembly[] asms;
			try { asms = AppDomain.CurrentDomain.GetAssemblies(); } catch { return new Type[0]; }
			lock (_lock)
			{
				if (asms.Length == _asmCount) return _others;
				var list = new System.Collections.Generic.List<Type>();
				for (int i = 0; i < asms.Length; i++)
				{
					if (own != null && asms[i] == own.Assembly) continue;
					Type ss = null;
					try { ss = asms[i].GetType(SharedStateType, false); } catch { }
					if (ss == null || ss.GetProperty("LastUpdate_GC", PS) == null || ss.GetProperty("LastUpdate_SI", PS) == null) continue;
					list.Add(ss);
				}
				_others = list.ToArray();
				_asmCount = asms.Length;
				return _others;
			}
		}
	}
	// ── END AoGcSiGen ────────────────────────────────────────────────────────────────────────

	// ── BEGIN AoGcSiNativePublisher (2026-10-12 r3) ──────────────────────────────────────────
	// CAUSA: no pacote standalone so ES/NQ tem publicador (AoControlCenter -> AoMarketDataPublisher). Nenhum tick
	// de GC/SI chegava a um AoTapeEngine, entao MeDirection_/MviDirection_/LastPrice_/LastUpdate_ de GC/SI nunca
	// eram gravados e a ponte publicava pernas vazias — com GC 12-26 e SI 12-26 negociando no NT8.
	// FIX: este AddOn assina o Level 1 (Last/Bid/Ask) do contrato vigente de GC e de SI e entrega cada evento ao
	// MESMO motor do ES/NQ (AoTapeEngine, matematica verbatim), com os gatilhos que a suite ja usa:
	// GC = 8 (AlfaOmegaFlowOne.cs:1304) e SI = 3 (AlfaOmegaFlowOne.cs:1309 / AlfaOmegaPulse.cs:274).
	// Grava SO os campos *_GC e *_SI, e so se for o dono do posto no AoPublisher (mesma disciplina do ES/NQ).
	// Nao toca ES/NQ/RTY, AuxGcSi, gates, ordens. Sem timer, sem thread propria.
	// Press: sem historico da sessao o AoPressSessao fica PRESS_UNAVAILABLE e publica 0 — nada e fabricado.
	// Contrato vigente: mesma regra do AoControlCenter.ContratoVigente (GetNextExpiry do proprio NT8).
	public static class AoGcSiNativePublisher
	{
		private static readonly object _lock = new object();
		private static NinjaTrader.Data.MarketData _mdGC, _mdSI;
		private static NinjaTrader.NinjaScript.Indicators.AoTapeEngine _mGC, _mSI;
		private static long _id;                     // posto no AoPublisher (publicador unico por simbolo)
		public static string Status = "parado";      // diagnostico
		public static long TicksGC, TicksSI;         // negocios (Last) recebidos nesta geracao — diagnostico

		// Mesma regra do AoControlCenter.ContratoVigente: calendario de rolagem do proprio NT8, sem tabela propria.
		private static NinjaTrader.Cbi.Instrument Vigente(string raiz)
		{
			try
			{
				NinjaTrader.Cbi.Instrument cont = NinjaTrader.Cbi.Instrument.GetInstrument(raiz + " ##-##");
				if (cont == null || cont.MasterInstrument == null) return null;
				DateTime exp = cont.MasterInstrument.GetNextExpiry(DateTime.Now);
				if (exp.Year < 2000) return null;
				return NinjaTrader.Cbi.Instrument.GetInstrument(raiz + " " + exp.ToString("MM-yy", CultureInfo.InvariantCulture));
			}
			catch { return null; }
		}

		public static void Start()
		{
			lock (_lock)
			{
				try
				{
					if (_id <= 0) _id = NinjaTrader.NinjaScript.Indicators.AoPublisher.NovoId();
					if (_mdGC == null)
					{
						NinjaTrader.Cbi.Instrument i = Vigente("GC");
						if (i != null)
						{
							_mGC = new NinjaTrader.NinjaScript.Indicators.AoTapeEngine("GC") { EffVDelta = 8 };
							_mdGC = new NinjaTrader.Data.MarketData(i); _mdGC.Update += OnGC;
						}
					}
					if (_mdSI == null)
					{
						NinjaTrader.Cbi.Instrument i = Vigente("SI");
						if (i != null)
						{
							_mSI = new NinjaTrader.NinjaScript.Indicators.AoTapeEngine("SI") { EffVDelta = 3 };
							_mdSI = new NinjaTrader.Data.MarketData(i); _mdSI.Update += OnSI;
						}
					}
					Status = "GC=" + (_mdGC != null ? "assinado" : "nao resolvido") + " SI=" + (_mdSI != null ? "assinado" : "nao resolvido");
				}
				catch (Exception ex) { Status = "falha ao assinar: " + ex.GetType().Name; }
			}
		}

		public static void Stop()
		{
			lock (_lock)
			{
				try { if (_mdGC != null) _mdGC.Update -= OnGC; } catch { }
				try { if (_mdSI != null) _mdSI.Update -= OnSI; } catch { }
				try { NinjaTrader.NinjaScript.Indicators.AoPublisher.Liberar("GC", _id); } catch { }
				try { NinjaTrader.NinjaScript.Indicators.AoPublisher.Liberar("SI", _id); } catch { }
				_mdGC = null; _mdSI = null; _mGC = null; _mSI = null; Status = "parado";
			}
		}

		private static void OnGC(object sender, NinjaTrader.Data.MarketDataEventArgs e)
		{
			try
			{
				if (e == null) return;
				Tick("GC", _mGC, Tipo(e.MarketDataType), e.Price, e.Bid, e.Ask, e.Volume, e.Time);
			}
			catch { }
		}

		private static void OnSI(object sender, NinjaTrader.Data.MarketDataEventArgs e)
		{
			try
			{
				if (e == null) return;
				Tick("SI", _mSI, Tipo(e.MarketDataType), e.Price, e.Bid, e.Ask, e.Volume, e.Time);
			}
			catch { }
		}

		// Mesmo mapeamento do AoControlCenter.OnMarketData: Last/Bid/Ask; o resto e ignorado.
		private static NinjaTrader.NinjaScript.Indicators.AoTick Tipo(NinjaTrader.Data.MarketDataType t)
		{
			return t == NinjaTrader.Data.MarketDataType.Last ? NinjaTrader.NinjaScript.Indicators.AoTick.Last
				 : t == NinjaTrader.Data.MarketDataType.Bid  ? NinjaTrader.NinjaScript.Indicators.AoTick.Bid
				 : t == NinjaTrader.Data.MarketDataType.Ask  ? NinjaTrader.NinjaScript.Indicators.AoTick.Ask
				 : NinjaTrader.NinjaScript.Indicators.AoTick.Outro;
		}

		/// <summary>
		/// UM evento de Level 1 de GC ou SI. Publico e sem tipo do NT8 para o teste offline alimentar o MESMO caminho
		/// que o evento real usa. Alimenta o motor e, a cada negocio (Last), grava SO os campos do simbolo — e so se
		/// este publicador for o dono do posto (AoPublisher): um FlowOne de grafico em GC/SI nao e atropelado.
		/// </summary>
		public static void Tick(string sym, NinjaTrader.NinjaScript.Indicators.AoTapeEngine m, NinjaTrader.NinjaScript.Indicators.AoTick tipo,
			double price, double bid, double ask, long volume, DateTime time)
		{
			if (m == null || tipo == NinjaTrader.NinjaScript.Indicators.AoTick.Outro) return;
			int me, mvi; double press, px;
			lock (m)
			{
				m.Tick(tipo, price, bid, ask, volume, time, true);
				me = m.MeDir; mvi = m.MviDir; press = m.Press; px = m.LastPrice;
			}
			if (tipo != NinjaTrader.NinjaScript.Indicators.AoTick.Last) return;
			bool gc = sym == "GC";
			if (gc) Interlocked.Increment(ref TicksGC); else Interlocked.Increment(ref TicksSI);
			if (!NinjaTrader.NinjaScript.Indicators.AoPublisher.PodePublicar(sym, _id)) return;
			DateTime now = DateTime.Now;     // carimbo do publish (hora local), como o publicador ES/NQ
			if (gc)
			{
				SS.MeDirection_GC = me; SS.MviDirection_GC = mvi; SS.LastUpdate_GC = now; SS.Press_GC = press;
				if (px > 0) SS.LastPrice_GC = px;
			}
			else
			{
				SS.MeDirection_SI = me; SS.MviDirection_SI = mvi; SS.LastUpdate_SI = now; SS.Press_SI = press;
				if (px > 0) SS.LastPrice_SI = px;
			}
		}

		/// <summary>So para o teste offline: motor com os MESMOS gatilhos do Start(), sem assinar nada.</summary>
		public static NinjaTrader.NinjaScript.Indicators.AoTapeEngine NovoMotor(string sym)
		{
			lock (_lock) { if (_id <= 0) _id = NinjaTrader.NinjaScript.Indicators.AoPublisher.NovoId(); }
			return new NinjaTrader.NinjaScript.Indicators.AoTapeEngine(sym) { EffVDelta = sym == "GC" ? 8 : 3 };
		}
	}
	// ── END AoGcSiNativePublisher ────────────────────────────────────────────────────────────

}
