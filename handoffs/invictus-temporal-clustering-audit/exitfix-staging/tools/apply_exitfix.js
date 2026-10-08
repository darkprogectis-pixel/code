// STAGING ONLY — EXIT_LAYER_FIX X2 (JEV DESIGN T5 = A, req_01a11c78e1cc70948150ca238dacc7d6). Aplica C1..C7 sobre staging_exit\before -> staging_exit\after.
// 3 arquivos: AlfaOmegaRoboFechamento.cs (C1), AlfaOmegaRoboSaida.cs (C2 + plano puro + revalidacao pura), AlfaOmegaRobo.cs (C3..C7).
// Substituicoes exatas; aborta se um trecho nao for encontrado exatamente 1 vez (ou N vezes quando indicado). Nunca toca o NT8.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..', 'staging_exit'), SUB = 'AddOns';
function patch(file, edits) {
  const src = path.join(D, 'before', SUB, file), dst = path.join(D, 'after', SUB, file);
  let s = fs.readFileSync(src, 'utf8'); const bom = s.charCodeAt(0) === 0xFEFF; if (bom) s = s.slice(1);
  const crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length - crlf, EOL = crlf > lf ? '\r\n' : '\n';
  const N = t => t.replace(/\r?\n/g, EOL);
  for (const [a, b, mode, count] of edits) {
    const want = count || 1;
    if (a instanceof RegExp) { const m = s.match(new RegExp(a.source, a.flags.replace('g', '') + 'g')) || []; if (m.length !== want) { console.log('ABORT', file, 'regex matches', m.length, 'want', want, String(a).slice(0, 80)); process.exit(1); } s = s.replace(new RegExp(a.source, a.flags.replace('g', '') + 'g'), N(b)); continue; }
    const n = s.split(a).length - 1; if (n !== want) { console.log('ABORT', file, 'occurrences', n, 'want', want, JSON.stringify(a.slice(0, 80))); process.exit(1); }
    s = s.split(a).join(mode === 'after' ? a + N(b) : mode === 'before' ? N(b) + a : N(b));
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, (bom ? '﻿' : '') + s); console.log('patched', file, 'EOL', EOL === '\n' ? 'LF' : 'CRLF', 'BOM', bom);
}

// ───────────────────────── C1 — AlfaOmegaRoboFechamento.cs ─────────────────────────
patch('AlfaOmegaRoboFechamento.cs', [
  ['		public void RegistrarFill(string intentId, bool compra, int qty, double preco, DateTime quandoUtc, string orderName)', `		/// <summary>
		/// (2026-10-08) EXIT_LAYER_FIX X2 · C1 — SALDO PROPRIO DA PERNA, derivado das execucoes REAIS ja registradas por nome de ordem
		/// (OnExecucao → RegistrarFill). JEV INCIDENT T1 req_01a11c682b8d719f8b4468d1fc3537c0 · JEV DESIGN T5 req_01a11c78e1cc70948150ca238dacc7d6.
		///   entrada = soma das execucoes no lado da perna cujo nome NAO e de saida (|X fechamento, |S stop, |T take);
		///   saidas  = soma das execucoes no lado oposto (fechamento do robo, stop ou take da propria perna);
		///   saldo   = max(0, entrada − saidas).
		/// conhecido=false quando nao ha execucao de ENTRADA registrada para o intent (registro antigo, evento perdido): devolve o
		/// fallback informado e quem chama trata como saldo desconhecido (nunca reenvia fechamento ja enviado). Pura: so le _fills.
		/// </summary>
		public int SaldoPerna(string intentId, string side, int qtyEntradaFallback, out bool conhecido)
		{
			conhecido = false;
			int fb = qtyEntradaFallback < 0 ? 0 : qtyEntradaFallback;
			if (string.IsNullOrEmpty(intentId)) return fb;
			bool ladoCompra = string.Equals(side, "LONG", StringComparison.Ordinal);
			int entrada = 0, saidas = 0;
			lock (_gate)
			{
				JArray l;
				if (!_fills.TryGetValue(intentId, out l) || l == null) return fb;
				foreach (JToken t in l)
				{
					JObject f = t as JObject; if (f == null) continue;
					bool c = f["c"] != null && f["c"].Type == JTokenType.Boolean && (bool)f["c"];
					int q = f["q"] != null && f["q"].Type == JTokenType.Integer ? (int)f["q"] : 0;
					string n = f["n"] != null && f["n"].Type == JTokenType.String ? (string)f["n"] : null;
					if (q <= 0) continue;
					if (c == ladoCompra) { if (!AoRoboSaida.EhNomeDeSaida(n)) entrada += q; }
					else saidas += q;
				}
			}
			if (entrada <= 0) return fb;
			conhecido = true;
			return entrada > saidas ? entrada - saidas : 0;
		}

`, 'before'],
]);

// ───────────────────────── C2 — AlfaOmegaRoboSaida.cs ─────────────────────────
patch('AlfaOmegaRoboSaida.cs', [
  ['	public static class AoRoboSaida', `	/// <summary>(2026-10-08) EXIT_LAYER_FIX X2 — decisao de UMA perna dentro do plano de saida (AoRoboSaida.PlanejarSaidas).</summary>
	public class AoPlanoPerna
	{
		public JObject E;
		public AoSaidaDecisao D;
		public string Divergencia;
		public int    Saldo;             // saldo proprio da perna (entrada − saidas, por nome de ordem)
		public bool   SaldoConhecido;    // false = sem execucoes de entrada registradas (fallback)
		public int    DisponivelAntes;   // posicao da conta no lado da perna ainda nao comprometida por outra perna neste ciclo
	}

`, 'before'],
  ['		/// <summary>Corpo do PlaceCore para o fechamento: mercado, qty decidida, SEM guardas de entrada (requireFlat/maxPositions nao se aplicam a reducao).</summary>', `		// ════════════════════════════════════════════════════════════════════════════════════════════
		//  (2026-10-08) EXIT_LAYER_FIX X2 — JEV INCIDENT T1 req_01a11c682b8d719f8b4468d1fc3537c0 · JEV DESIGN T5 req_01a11c78e1cc70948150ca238dacc7d6
		//
		//  INCIDENTE: na conta real o NT8 troca o orderId devolvido no envio pelo id da corretora. A regra 2 acima procurava o fechamento
		//  pelo id inicial, nao achava, e tratava como "nova tentativa". Com uma reabertura no mesmo ciclo (trailing 4/4) ficaram duas
		//  pernas LONG registradas na mesma conta/instrumento; na saida seguinte cada uma fechou a posicao INTEIRA lida uma unica vez:
		//  LONG → FLAT → SHORT.
		//
		//  DESENHO X2 (pecas puras abaixo; o robo so executa o plano):
		//   · fechamento reconhecido pelo NOME da ordem ("…|X"), nunca pelo id do envio;
		//   · saldo PROPRIO da perna (AoRoboFechamento.SaldoPerna): saldo 0 = perna verificada, sai do registro e nao volta;
		//   · fechamento ja enviado e NAO comprovadamente Rejected/Cancelled (inclui nao encontrado / Initialized) = aguardar, NUNCA reenviar;
		//   · qty a fechar = min(saldo da perna, posicao da conta no lado da perna AINDA disponivel neste ciclo) — o plano abate o que
		//     cada perna consome, entao a soma dos fechamentos por conta/instrumento nunca passa da posicao lida;
		//   · conta FLAT nunca recebe ordem; lado oposto nunca recebe ordem automatica (regras preexistentes, mantidas).
		// ════════════════════════════════════════════════════════════════════════════════════════════

		/// <summary>Nome de ordem de SAIDA da perna: fechamento do robo (|X), stop (|S) ou take (|T).</summary>
		public static bool EhNomeDeSaida(string orderName)
		{
			if (string.IsNullOrEmpty(orderName)) return false;
			return orderName.EndsWith(SufixoFechamento, StringComparison.Ordinal)
				|| orderName.EndsWith("|S", StringComparison.Ordinal)
				|| orderName.EndsWith("|T", StringComparison.Ordinal);
		}

		/// <summary>A perna ja teve fechamento enviado pelo robo (qualquer tentativa)?</summary>
		public static bool FechamentoJaEnviado(JObject e)
		{
			if (e == null) return false;
			JToken x = e["x_order_id"], env = e["x_enviada"];
			return (x != null && x.Type == JTokenType.String && !string.IsNullOrEmpty((string)x))
				|| (env != null && env.Type != JTokenType.Null && env.Type != JTokenType.Undefined);
		}

		/// <summary>
		/// Estado das ordens de fechamento da perna procuradas pelo NOME. ativa = alguma ainda viva · filled = alguma FILLED ·
		/// terminalRejeitada = existe ao menos uma e TODAS estao Rejected/Cancelled · ultimo = estado da mais recente (null = nenhuma) ·
		/// qtyFilled = soma do executado nas ordens com esse nome.
		/// </summary>
		public static void EstadoFechamentoPorNome(JArray ordens, string nomeX, out bool ativa, out bool filled, out bool terminalRejeitada, out string ultimo, out int qtyFilled)
		{
			ativa = false; filled = false; terminalRejeitada = false; ultimo = null; qtyFilled = 0;
			if (ordens == null || string.IsNullOrEmpty(nomeX)) return;
			int n = 0, rej = 0; string ultT = null;
			foreach (JToken t in ordens)
			{
				JObject o = t as JObject; if (o == null) continue;
				string nome = null, est = null, tm = null;
				try { nome = (string)o["name"]; est = (string)o["state"]; tm = o["time"] == null || o["time"].Type == JTokenType.Null ? null : o["time"].ToString(); } catch { continue; }
				if (!string.Equals(nome, nomeX, StringComparison.Ordinal)) continue;
				n++;
				try { if (o["filled"] != null && o["filled"].Type == JTokenType.Integer && (int)o["filled"] > 0) qtyFilled += (int)o["filled"]; } catch { }
				if (Filled(est)) filled = true;
				else if (Ativa(est)) ativa = true;
				else if (string.Equals(est, "Rejected", StringComparison.OrdinalIgnoreCase) || string.Equals(est, "Cancelled", StringComparison.OrdinalIgnoreCase)) rej++;
				if (ultT == null || string.CompareOrdinal(tm ?? "", ultT) >= 0) { ultT = tm ?? ""; ultimo = est; }
			}
			terminalRejeitada = n > 0 && rej == n;
		}

		/// <summary>
		/// (EXIT_LAYER_FIX X2 · C2) Decide UMA perna com o saldo proprio dela e a posicao ainda disponivel neste ciclo.
		///   saldo/saldoConhecido = AoRoboFechamento.SaldoPerna · posDisponivel = posicao da conta no lado da perna menos o que as pernas
		///   anteriores deste mesmo ciclo ja mandaram fechar.
		/// </summary>
		public static AoSaidaDecisao Decidir(JObject e, AoPositionState st, JArray ordens, int saldo, bool saldoConhecido, int posDisponivel)
		{
			var d = new AoSaidaDecisao { Acao = AoSaidaAcao.SemLeitura, QtyFechar = 0 };
			if (ForaGestao(e)) { d.Acao = AoSaidaAcao.ForaGerenciamento; d.Motivo = "ativo retirado: gestao manual; nenhuma ordem automatica"; return d; }
			string instrumento = (string)e["instrumento"];
			string side = (string)e["side"];
			int qty = e["qty"] != null && e["qty"].Type == JTokenType.Integer ? (int)e["qty"] : 0;
			d.AcaoOrdem = side == "LONG" ? "sell" : "buy";
			string nomeX = NomeFechamento((string)e["order_name"]);
			bool xAtiva, xFilled, xTerminal; string xUlt; int xQty;
			EstadoFechamentoPorNome(ordens, nomeX, out xAtiva, out xFilled, out xTerminal, out xUlt, out xQty);
			d.EstadoOrdemEnviada = xUlt;
			int qtyEntrada = AoRoboFechamento.QtyPreenchidaDe(e); if (qtyEntrada <= 0) qtyEntrada = qty;
			bool jaEnviado = FechamentoJaEnviado(e);

			// 2a. saldo proprio zerado pelas execucoes reais = perna verificada (nunca volta ao conjunto pendente)
			if (saldoConhecido && saldo <= 0) { d.Acao = AoSaidaAcao.Verificada; d.Motivo = "saldo da perna zerado pelas execucoes (entrada − saidas = 0)"; return d; }
			// 2b. fechamento com este nome ainda vivo → aguardar (nunca duplicar)
			if (xAtiva) { d.Acao = AoSaidaAcao.Aguardar; d.Motivo = "fechamento " + nomeX + " ainda ativo — nao duplicar"; return d; }
			// 2c. fechamento com este nome FILLED: saldo nao conhecido, ou o executado por nome cobre a perna (evento de execucao perdido) → verificada pela ordem
			if (xFilled && (!saldoConhecido || xQty >= qtyEntrada)) { d.Acao = AoSaidaAcao.Verificada; d.Motivo = "fechamento " + nomeX + " FILLED por nome (" + xQty + " de " + qtyEntrada + ")"; return d; }

			// 0. registro ja marcado como DESVIO: qualquer posicao que exista AGORA nao e nossa.
			if (e["desvio"] != null && e["desvio"].Type == JTokenType.Boolean && (bool)e["desvio"])
			{ d.Acao = AoSaidaAcao.JaFechada; d.Motivo = "registro em desvio (conta ja esteve FLAT em " + instrumento + " apos a entrada): posicao atual, se houver, nao e do robo — nenhuma ordem"; return d; }

			// 1. stop de protecao do robo ja preencheu?
			string stopEst = AoRoboFechamento.EstadoStopDaPerna(ordens, e);
			if (Filled(stopEst)) { d.Acao = AoSaidaAcao.JaFechada; d.Motivo = "stop de protecao do robo (oco " + OcoAtual(e) + ") FILLED — posicao ja fechada pela corretora; nada a enviar"; return d; }

			// 3. posicao da conta de origem — fail-closed sem leitura; FLAT / lado contrario → nada nosso sobrou (a revalidacao confirma)
			if (st == null || !st.Ok || st.Positions == null) { d.Acao = AoSaidaAcao.SemLeitura; d.Motivo = "posicao da conta ilegivel: " + (st == null ? "null" : st.Error ?? "?"); return d; }
			AoPosition pos = AoRoboGates.FindPosition(st.Positions, instrumento);
			if (pos == null || pos.Side == "FLAT" || pos.Quantity <= 0 || !string.Equals(pos.Side, side, StringComparison.Ordinal))
			{
				d.Acao = AoSaidaAcao.JaFechada;
				d.Motivo = "conta " + (pos == null || pos.Side == "FLAT" ? "FLAT" : pos.Side + " " + pos.Quantity + "x") + " em " + instrumento + " — nada do robo (" + side + " " + qty + "x) sobrou: saida manual/desvio; nenhuma ordem (nunca inverter)";
				return d;
			}

			// 2d. fechamento ja enviado e NAO comprovadamente Rejected/Cancelled (nao encontrado, Initialized, estado desconhecido) → aguardar, nunca reenviar
			if (jaEnviado && !xTerminal && !xFilled)
			{
				d.Acao = AoSaidaAcao.Aguardar;
				d.Motivo = "fechamento ja enviado e nao comprovado (" + (xUlt ?? "nao encontrado por nome") + "): aguardar execucao/conta FLAT — nunca reenviar";
				return d;
			}

			// 3b. qty = min(saldo da perna, posicao ainda disponivel neste ciclo); o que as ordens |X ja executaram por nome tambem abate o saldo
			if (xQty > 0) { int restoPorOrdens = qtyEntrada > xQty ? qtyEntrada - xQty : 0; if (restoPorOrdens < saldo) saldo = restoPorOrdens; }
			int disp = posDisponivel < pos.Quantity ? posDisponivel : pos.Quantity;
			d.QtyFechar = saldo < disp ? saldo : disp;
			d.Parcial = d.QtyFechar < qty;
			if (d.QtyFechar <= 0)
			{
				d.QtyFechar = 0; d.Acao = AoSaidaAcao.Aguardar;
				d.Motivo = "nada a fechar neste ciclo (saldo da perna " + saldo + ", posicao disponivel " + posDisponivel + " de " + pos.Quantity + "): nenhuma ordem";
				return d;
			}

			// 4. stop do robo ativo → cancelar antes
			if (Ativa(stopEst)) { d.Acao = AoSaidaAcao.CancelarEFechar; d.OcoCancelar = OcoAtual(e); }
			else d.Acao = AoSaidaAcao.Fechar;
			d.Motivo = "fechar " + d.QtyFechar + "x " + side + " em " + instrumento + " (conta " + pos.Side + " " + pos.Quantity + "x; saldo da perna " + saldo
					 + (saldoConhecido ? "" : " [desconhecido: qty do registro]") + "; disponivel " + posDisponivel + ")"
					 + (Ativa(stopEst) ? " — stop do robo ativo: cancelar oco " + OcoAtual(e) + " antes" : " — sem stop ativo do robo");
			return d;
		}

		/// <summary>
		/// (EXIT_LAYER_FIX X2 · C4) Revalidacao do CLOSE — a mesma regra que vivia em AlfaOmegaRobo.RevalidarClose, agora pura e com o limite
		/// min(saldo da perna, posicao disponivel). CLOSE nunca confia cegamente em desvio=true nem numa unica FLAT.
		/// </summary>
		public static AoSaidaDecisao Revalidar(JObject e, AoPositionState st, JArray ordens, AoSaidaDecisao d, DateTime agora, int saldo, int posDisponivel, out string divergencia)
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
			if (r == AoRoboFechamento.CloseJaFechada) { d.Acao = AoSaidaAcao.JaFechada; d.Motivo = "conta FLAT confirmada (" + (emDesvio ? "desvio + leitura fresca do CLOSE" : "2 leituras independentes") + ") — nenhuma ordem"; return d; }
			if (r == AoRoboFechamento.CloseAguardarFlat) { d.Acao = AoSaidaAcao.Aguardar; d.Motivo = "conta FLAT em " + instrumento + " ainda nao confirmada: nenhuma ordem, perna pendente ate a 2a leitura independente"; return d; }
			if (r == AoRoboFechamento.CloseFechar)
			{
				int lim = saldo < posDisponivel ? saldo : posDisponivel;
				if (qf > lim) qf = lim;
				if (qf <= 0)
				{
					d.Acao = AoSaidaAcao.Aguardar;
					d.Motivo = "nada a fechar neste ciclo (saldo da perna " + saldo + ", posicao disponivel " + posDisponivel + "; conta " + conta + "): nenhuma ordem";
					return d;
				}
				if (emDesvio) divergencia = "registro em desvio (interno considerava a perna FLAT) × conta " + conta;
				bool stopAtivo = ordens != null && ordens.OfType<JObject>().Any(o => stopDoRobo(o) && AoRoboFechamento.EstadoAtivoNt8((string)o["state"]));
				d.Acao = stopAtivo ? AoSaidaAcao.CancelarEFechar : AoSaidaAcao.Fechar; d.OcoCancelar = stopAtivo ? OcoAtual(e) : null;
				d.QtyFechar = qf; d.Parcial = qf < qty;
				d.Motivo = "fechar " + qf + "x " + side + " em " + instrumento + " (conta " + conta + "; max = min(saldo da perna " + saldo + ", disponivel " + posDisponivel + ", qty da perna " + qty + "))" + (emDesvio ? " — registro em desvio revalidado: posicao ainda aberta" : "");
				return d;
			}
			if (r == AoRoboFechamento.CloseDivergencia)
			{
				divergencia = "perna " + side + " " + qty + "x × conta " + conta + (emDesvio ? " (registro em desvio)" : "");
				d.Acao = AoSaidaAcao.SemLeitura; d.Motivo = "BROKER_INTERNAL_DIVERGENCE: " + divergencia + " — nenhuma ordem automatica (nunca inverter); perna em falha"; return d;
			}
			d.Acao = AoSaidaAcao.SemLeitura; d.Motivo = "posicao da conta ilegivel/nao fresca: nenhuma ordem, retry (nunca CLOSED)"; return d;
		}

		/// <summary>
		/// (EXIT_LAYER_FIX X2 · C3) PLANO PURO DA SAIDA: uma decisao por perna, na ordem do registro, com a posicao de cada
		/// conta/instrumento/lado lida UMA vez e ABATIDA a cada perna que manda fechar. Invariante: a soma dos fechamentos planejados para
		/// uma conta/instrumento/lado nunca passa da posicao lida ⇒ o plano nao consegue inverter a conta. Excecao numa perna = SemLeitura
		/// so para ela (fail-closed). saldoDe devolve (saldo, conhecido).
		/// </summary>
		public static List<AoPlanoPerna> PlanejarSaidas(IList<JObject> pernas, Func<string, AoPositionState> posDe, Func<string, JArray> ordensDe,
														Func<JObject, KeyValuePair<int, bool>> saldoDe, DateTime agora)
		{
			var plano = new List<AoPlanoPerna>();
			if (pernas == null) return plano;
			var disponivel = new Dictionary<string, int>(StringComparer.Ordinal);
			foreach (JObject e in pernas)
			{
				var pp = new AoPlanoPerna { E = e };
				try
				{
					string ntAcc = (string)e["nt8_account"], instrumento = (string)e["instrumento"], side = (string)e["side"];
					int qty = e["qty"] != null && e["qty"].Type == JTokenType.Integer ? (int)e["qty"] : 0;
					AoPositionState st = posDe == null ? null : posDe(ntAcc);
					JArray ordens = ordensDe == null ? null : ordensDe(ntAcc);
					KeyValuePair<int, bool> s = saldoDe == null ? new KeyValuePair<int, bool>(qty, false) : saldoDe(e);
					pp.Saldo = s.Key < 0 ? 0 : s.Key; pp.SaldoConhecido = s.Value;
					string k = (ntAcc ?? "") + "|" + (instrumento ?? "") + "|" + (side ?? "");
					int d0;
					if (!disponivel.TryGetValue(k, out d0))
					{
						d0 = 0;
						if (st != null && st.Ok && st.Positions != null)
						{
							AoPosition p = AoRoboGates.FindPosition(st.Positions, instrumento);
							if (p != null && p.Quantity > 0 && string.Equals(p.Side, side, StringComparison.Ordinal)) d0 = p.Quantity;
						}
						disponivel[k] = d0;
					}
					pp.DisponivelAntes = d0;
					AoSaidaDecisao d = Decidir(e, st, ordens, pp.Saldo, pp.SaldoConhecido, d0);
					string div;
					d = Revalidar(e, st, ordens, d, agora, pp.Saldo, d0, out div);
					pp.D = d; pp.Divergencia = div;
					if ((d.Acao == AoSaidaAcao.Fechar || d.Acao == AoSaidaAcao.CancelarEFechar) && d.QtyFechar > 0)
						disponivel[k] = d0 > d.QtyFechar ? d0 - d.QtyFechar : 0;
				}
				catch (Exception ex) { pp.D = new AoSaidaDecisao { Acao = AoSaidaAcao.SemLeitura, Motivo = "decisao falhou: " + ex.Message }; pp.Divergencia = null; }
				plano.Add(pp);
			}
			return plano;
		}

`, 'before'],
]);

// ───────────────────────── C3..C7 — AlfaOmegaRobo.cs ─────────────────────────
patch('AlfaOmegaRobo.cs', [
  // C5 — reverificacao em todo ciclo (so pernas com fechamento ja enviado), tambem com o motor posicionado
  [/\t\t\tAvaliarFechamentos\(agora\);   \/\/ \(2026-09-30\) EXIT_\*/, `			// (2026-10-08) EXIT_LAYER_FIX X2 · C5 — o ramo acima so reve saidas com o motor SEM posicao. Depois de uma reabertura (trailing 4/4 no
			// mesmo ciclo) a perna antiga ficava pendente sem releitura. Aqui: com o motor POSICIONADO, reve SO as pernas com fechamento ja enviado
			// (soPendentes) — as pernas do trade aberto nao tem fechamento enviado e nunca sao tocadas.
			if (!fechouEv && m.TemPosicao && TemSaidaPendenteEnviada()) ExecutarSaida("flatten_retry", agora, contas, true, true);
			AvaliarFechamentos(agora);   // (2026-09-30) EXIT_*`],
  // C3 — assinatura + filtro soPendentes
  ['		private static void ExecutarSaida(string motivo, DateTime agora, List<AoRoboAccount> contas, bool retry)', '		private static void ExecutarSaida(string motivo, DateTime agora, List<AoRoboAccount> contas, bool retry, bool soPendentes = false)'],
  ['			var gerenciadas = ExecucoesGerenciadas();', `
			// (2026-10-08) EXIT_LAYER_FIX X2 · C5 — soPendentes: so pernas com fechamento ja enviado (nunca as do trade aberto)
			if (soPendentes) { lock (_protGate) gerenciadas = gerenciadas.Where(x => AoRoboSaida.FechamentoJaEnviado(x)).ToList(); }`, 'after'],
  // C3 — plano puro antes do laco
  ['			foreach (string acc in contasOrigem) ordensPorConta[acc] = LerOrdens(acc);', `

			// (2026-10-08) EXIT_LAYER_FIX X2 · C3 — PLANO PURO (AoRoboSaida.PlanejarSaidas): saldo proprio de cada perna (execucoes reais por nome)
			// + posicao da conta abatida a cada perna que manda fechar. O laco abaixo so EXECUTA o plano. Falha ao planejar = nenhuma ordem.
			var saldosX2 = new Dictionary<string, KeyValuePair<int, bool>>(StringComparer.Ordinal);
			AoRoboFechamento feX2 = _fechamento;
			foreach (JObject ex2 in gerenciadas)
			{
				string iid; int fb; string sd;
				lock (_protGate) { iid = (string)ex2["intentId"]; fb = IntOu(ex2["qty"], 0); sd = (string)ex2["side"]; }
				if (string.IsNullOrEmpty(iid) || saldosX2.ContainsKey(iid)) continue;
				bool conhecido = false; int sld = fb;
				try { if (feX2 != null) sld = feX2.SaldoPerna(iid, sd, fb, out conhecido); } catch { sld = fb; conhecido = false; }
				saldosX2[iid] = new KeyValuePair<int, bool>(sld, conhecido);
			}
			List<AoPlanoPerna> planoX2;
			try
			{
				lock (_protGate)
					planoX2 = AoRoboSaida.PlanejarSaidas(gerenciadas,
						a => AoRoboPositions.Get(a, agora),
						a => { JArray o; ordensPorConta.TryGetValue(a ?? "", out o); return o; },
						x => { KeyValuePair<int, bool> kv; return saldosX2.TryGetValue((string)x["intentId"] ?? "", out kv) ? kv : new KeyValuePair<int, bool>(IntOu(x["qty"], 0), false); },
						agora);
			}
			catch { planoX2 = new List<AoPlanoPerna>(); }`, 'after'],
  // C3 — decisao vem do plano
  [/\t\t\t\ttry \{ lock \(_protGate\) \{ d = AoRoboSaida\.Decidir\(e, st, ordens\); d = RevalidarClose\(e, st, ordens, d, agora, out divergencia\); \} \}[^\r\n]*\r?\n\t\t\t\tcatch \(Exception ex\) \{ d = new AoSaidaDecisao \{ Acao = AoSaidaAcao\.SemLeitura, Motivo = "decisao falhou: " \+ ex\.Message \}; \}/,
    `				// (2026-10-08) EXIT_LAYER_FIX X2 · C3 — a decisao desta perna vem do plano puro (saldo + posicao disponivel ja abatida)
				AoPlanoPerna ppX2 = planoX2.FirstOrDefault(x => object.ReferenceEquals(x.E, e));
				if (ppX2 != null && ppX2.D != null) { d = ppX2.D; divergencia = ppX2.Divergencia; }
				else d = new AoSaidaDecisao { Acao = AoSaidaAcao.SemLeitura, Motivo = "decisao falhou: perna fora do plano de saida" };`],
  // C6 — alerta na divergencia
  ['						null, contaId, AoRoboConfig.Tier, instrumento, d.AcaoOrdem, d.QtyFechar, null, null, null, "critical:broker_internal_divergence");', `
					AlertaSaida("broker_divergence", e, ntAcc, instrumento, intentId, agora, divergencia);   // (2026-10-08) EXIT_LAYER_FIX X2 · C6`, 'after'],
  // limpar alertas quando a perna resolve (Verificada / JaFechada / filled)
  ['						lock (_protGate) { e["fechada"] = true; e["x_estado"] = d.EstadoOrdemEnviada; }', `
						LimparAlertasSaida(ntAcc, instrumento, intentId);   // (2026-10-08) EXIT_LAYER_FIX X2 · C6`, 'after'],
  [/(\t\t\t\t\t\tlock \(_protGate\) \{ e\["fechada"\] = true; e\["desvio"\] = true; \}[^\r\n]*)/, `$1
						LimparAlertasSaida(ntAcc, instrumento, intentId);   // (2026-10-08) EXIT_LAYER_FIX X2 · C6`],
  // C6 — fechamento nao confirmado ha mais de 60 s
  [/\t\t\t\t\tcase AoSaidaAcao\.Aguardar:\r?\n\t\t\t\t\t\tif \(!retry \|\| _ticksMotor % 3 == 1\)/, `					case AoSaidaAcao.Aguardar:
						AlertaFechamentoPendente(e, ntAcc, instrumento, intentId, agora);   // (2026-10-08) EXIT_LAYER_FIX X2 · C6
						if (!retry || _ticksMotor % 3 == 1)`],
  // C6 — falha de saida (sem leitura / divergencia) e falha no envio
  ['						AoRoboAudit.Log("flatten_fail", agora, intentId, (string)e["familia"], pay, null, contaId, AoRoboConfig.Tier, instrumento, d.AcaoOrdem, null, null, null, null, "critical:flatten_fail");', `
						AlertaSaida("flatten_fail", e, ntAcc, instrumento, intentId, agora, d.Motivo);   // (2026-10-08) EXIT_LAYER_FIX X2 · C6`, 'after'],
  ['							AoRoboAudit.Log("flatten_fail", agora, intentId, (string)e["familia"], pay, null, contaId, AoRoboConfig.Tier, instrumento, d.AcaoOrdem, d.QtyFechar, null, null, null, "critical:flatten_fail");', `
							AlertaSaida("flatten_fail", e, ntAcc, instrumento, intentId, agora, "PlaceCore sem sucesso");   // (2026-10-08) EXIT_LAYER_FIX X2 · C6`, 'after'],
  // C7 — confirmacao por saldo/nome nos 3 pontos de envio de fechamento
  ['							string est = EsperarFilled(ntAcc, oid, 3000);', '							string est = EsperarFilled(ntAcc, oid, 3000, e);   // (2026-10-08) EXIT_LAYER_FIX X2 · C7: saldo da perna / nome da ordem'],
  ['							if (filled) lock (_protGate) e["fechada"] = true;', '							if (filled) { lock (_protGate) e["fechada"] = true; LimparAlertasSaida(ntAcc, instrumento, intentId); }'],
  ['			string est = EsperarFilled(acc, oid, 3000);   // fora do lock', '			string est = EsperarFilled(acc, oid, 3000, e);   // fora do lock · (2026-10-08) EXIT_LAYER_FIX X2 · C7', null, 2],
  // C4 — RevalidarClose passa a delegar para a peca pura
  [/\t\tprivate static AoSaidaDecisao RevalidarClose\(JObject e, AoPositionState st, JArray ordens, AoSaidaDecisao d, DateTime agora, out string divergencia\)\r?\n\t\t\{[\s\S]*?\r?\n\t\t\}\r?\n(?=\r?\n\t\tprivate static bool AtivaNt8\(string estado\))/,
    `		private static AoSaidaDecisao RevalidarClose(JObject e, AoPositionState st, JArray ordens, AoSaidaDecisao d, DateTime agora, out string divergencia)
		{
			// (2026-10-08) EXIT_LAYER_FIX X2 · C4 — a regra vive na peca pura AoRoboSaida.Revalidar (limite min(saldo da perna, posicao disponivel)).
			// Este atalho, sem saldo/disponivel, equivale ao limite antigo (qty da perna e posicao inteira); o ExecutarSaida usa o plano puro.
			return AoRoboSaida.Revalidar(e, st, ordens, d, agora, IntOu(e["qty"], 0), int.MaxValue, out divergencia);
		}
`],
  // C7 — EsperarFilled: saldo conhecido 0 OU ordem |X por NOME; id inicial so como fallback sem perna
  [/\t\tprivate static string EsperarFilled\(string ntAcc, string orderId, int maxMs\)\r?\n\t\t\{[\s\S]*?\r?\n\t\t\}\r?\n/,
    `		// ── (2026-10-08) EXIT_LAYER_FIX X2 · C6 — alertas criticos da saida (state\\robo-alertas.json; so sinalizam, nenhuma decisao le) ──
		private const double FechamentoNaoConfirmadoSeg = 60.0;
		private static readonly string[] KindsAlertaSaida = { "broker_divergence", "flatten_fail", "close_unconfirmed" };
		private static void AlertaSaida(string kind, JObject e, string ntAcc, string instrumento, string intentId, DateTime agora, string detalhe)
		{
			try
			{
				string fam = null; if (e != null) lock (_protGate) fam = (string)e["familia"];
				Alertar(kind, ntAcc, instrumento, intentId, fam, 1, agora, new JObject { { "canal", "saida" }, { "detalhe", detalhe } });
			}
			catch { }
		}
		private static void LimparAlertasSaida(string ntAcc, string instrumento, string intentId)
		{
			AoRoboAlertas al = _alertas;
			if (al == null) return;
			foreach (string k in KindsAlertaSaida) { try { al.Limpar(k, ntAcc, instrumento, intentId); } catch { } }
		}
		private static void AlertaFechamentoPendente(JObject e, string ntAcc, string instrumento, string intentId, DateTime agora)
		{
			try
			{
				DateTime? env; lock (_protGate) env = AoMotorCanonico.ParseIso(e["x_enviada"]);
				if (env.HasValue && (agora - env.Value).TotalSeconds > FechamentoNaoConfirmadoSeg)
					AlertaSaida("close_unconfirmed", e, ntAcc, instrumento, intentId, agora, "fechamento enviado em " + AoMotorCanonico.Iso(env.Value) + " sem confirmacao ha mais de " + FechamentoNaoConfirmadoSeg + " s");
			}
			catch { }
		}
		/// <summary>(EXIT_LAYER_FIX X2 · C5) ha perna gerenciada com fechamento ja enviado e ainda nao encerrada?</summary>
		private static bool TemSaidaPendenteEnviada()
		{
			lock (_protGate)
				return _execucoes.Any(x => !AoRoboSaida.ForaGestao(x) && AoRoboSaida.FechamentoJaEnviado(x)
										&& !(x["fechada"] != null && x["fechada"].Type == JTokenType.Boolean && (bool)x["fechada"]));
		}

		/// <summary>
		/// Espera a confirmacao do fechamento. (2026-10-08) EXIT_LAYER_FIX X2 · C7: com a perna (e), a autoridade e o SALDO da perna pelas
		/// execucoes reais (conhecido e zero ⇒ "Filled") OU a ordem de fechamento procurada pelo NOME ("…|X"). O orderId devolvido no envio NAO
		/// e autoridade: na conta real o NT8 o troca pelo id da corretora e a busca por ele nunca via o Filled. Sem a perna: busca por id (legado).
		/// </summary>
		private static string EsperarFilled(string ntAcc, string orderId, int maxMs, JObject e = null)
		{
			string est = null, nomeX = null, intentId = null, side = null; int fb = 0;
			if (e != null) lock (_protGate) { nomeX = AoRoboSaida.NomeFechamento((string)e["order_name"]); intentId = (string)e["intentId"]; side = (string)e["side"]; fb = IntOu(e["qty"], 0); }
			if (string.IsNullOrEmpty(orderId) && e == null) return null;
			DateTime t0 = DateTime.UtcNow;
			while ((DateTime.UtcNow - t0).TotalMilliseconds < maxMs)
			{
				if (e != null)
				{
					try { AoRoboFechamento fe = _fechamento; bool conhecido; if (fe != null && fe.SaldoPerna(intentId, side, fb, out conhecido) <= 0 && conhecido) return "Filled"; } catch { }
					bool xAtiva, xFilled, xTerminal; string xUlt; int xQty;
					AoRoboSaida.EstadoFechamentoPorNome(LerOrdens(ntAcc), nomeX, out xAtiva, out xFilled, out xTerminal, out xUlt, out xQty);
					if (xFilled) return "Filled";
					if (xTerminal) return xUlt;
					if (xUlt != null) est = xUlt;
				}
				else
				{
					JArray ordens = LerOrdens(ntAcc);
					if (ordens != null)
						foreach (JToken t in ordens)
							if (t is JObject && string.Equals((string)t["orderId"], orderId, StringComparison.OrdinalIgnoreCase)) { est = (string)t["state"]; break; }
					if (est == "Filled" || est == "Rejected" || est == "Cancelled") return est;
				}
				Thread.Sleep(200);
			}
			return est;
		}
`],
]);
