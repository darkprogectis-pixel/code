// invictus/exec v1 (2026-10-02) — X1–X12 lado ROBO sobre as pecas REAIS do STAGING: AoExecReport (EventoAot) + G12 (AoRoboFechamento).
// Mesma sequencia de chamadas do wiring do AlfaOmegaRobo.cs (MarcarOrigemPerna/OrigemProtecaoFilled/EstadoTrade/RegistrarOrigem/Emitir),
// sem NT8/conta/ordem. Gera out/exec-fixture.jsonl (o MESMO arquivo que o robo escreveria) para o test_exec.js (lado AOT).
// trade_id da fixture = "X<n>" (o test_exec.js troca pelo trade_id real do aot-sim de cada cenario).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NinjaTrader.NinjaScript.AddOns;

static class ProgramExec
{
	static int pass, fail;
	static void Ok(bool c, string what, string det = null) { if (c) { pass++; Console.WriteLine("PASS " + what); } else { fail++; Console.WriteLine("FAIL " + what + (det == null ? "" : "  -> " + det)); } }

	static DateTime T = new DateTime(2026, 10, 2, 14, 0, 0, DateTimeKind.Utc);
	static DateTime Agora() { T = T.AddSeconds(5); return T; }

	static JObject Perna(string tid, string id, string side = "LONG")
	{
		return new JObject { { "intentId", id }, { "trade_id", tid }, { "side", side }, { "qty", 1 }, { "qty_preenchida", 1 }, { "entry_fill", 6000.0 },
							 { "oco_id", id + "|P1" }, { "stop_level", side == "LONG" ? 5980.0 : 6020.0 }, { "tick", 0.25 } };
	}
	static JObject Ordem(string id, string oco, string tipo, string estado, int qty = 1, double stop = 5980)
	{
		return new JObject { { "orderId", id }, { "oco", oco }, { "orderType", tipo }, { "state", estado }, { "quantity", qty }, { "filled", estado == "Filled" ? qty : 0 },
							 { "stopPrice", tipo.StartsWith("stop") ? (JToken)stop : JValue.CreateNull() } };
	}
	static JArray Bracket(JObject e, string estStop, string estTake, int qty = 1)
	{
		string oco = (string)e["oco_id"];
		return new JArray(Ordem(e["intentId"] + "S", oco, "stopmarket", estStop, qty), Ordem(e["intentId"] + "T", oco, "limit", estTake, qty));
	}

	// = wiring do robo: GarantirPerna/ExecGarantia (NADA + protecao FILLED ⇒ origem da perna) e ReportarExecucaoTrades (EstadoTrade ⇒ origem do trade + registro)
	static void MarcarE1(JObject e, JArray ordens, DateTime agora)
	{
		string of = AoExecReport.OrigemProtecaoFilled(ordens, e);
		if (of != null) AoExecReport.MarcarOrigemPerna(e, of, agora);
	}
	static string Reportar(AoExecReport r, IEnumerable<JObject> pernas, DateTime agora)
	{
		string origem, est = AoExecReport.EstadoTrade(pernas, out origem);
		if (est == null) return null;
		string tid = (string)pernas.First()["trade_id"], erro;
		r.RegistrarOrigem(tid, origem, agora);
		r.Emitir(tid, null, est, origem, null, false, agora, out erro);
		return est + "/" + origem;
	}
	// = AvaliarFechamentos: transicao do lifecycle ⇒ registro com origem = OrigemDe(tid) ?? aot_close
	static bool Lifecycle(AoExecReport r, string tid, string status, DateTime agora)
	{
		string erro; return r.Emitir(tid, null, status, r.OrigemDe(tid) ?? AoExecOrigem.AotClose, null, false, agora, out erro);
	}
	static bool Open(AoExecReport r, string tid, string status, string motivo = null)
	{
		string erro; return r.Emitir(tid, tid, status, null, motivo, false, Agora(), out erro);
	}
	static List<JObject> Do(AoExecReport r, string tid) { return r.Ler().Where(o => (string)o["trade_id"] == tid).ToList(); }
	static string Sts(List<JObject> l) { return string.Join(",", l.Select(o => (string)o["status"] + ((string)o["origin"] == null ? "" : ":" + (string)o["origin"]))); }

	public static int Main(string[] args)
	{
		string outDir = args.Length > 0 ? args[0] : "out";
		string dir = Path.Combine(outDir, "exec", "robo-state");
		if (Directory.Exists(Path.Combine(outDir, "exec"))) Directory.Delete(Path.Combine(outDir, "exec"), true);
		Directory.CreateDirectory(dir);
		var R = new AoExecReport(dir);
		Ok(R.ExecSeq == 0 && R.Ler().Count == 0, "X0 diretorio novo: exec_seq=0, log vazio");

		// ── X1 stop FILLED no broker ⇒ EXIT_PENDING broker_stop (outra perna aberta) ⇒ CLOSED broker_stop; CLOSE do AOT depois = no-op ──
		{
			JObject es = Perna("X1", "X1-ES"), nq = Perna("X1", "X1-NQ");
			Open(R, "X1", AoExecStatus.OpenExecutado);
			string r0 = Reportar(R, new[] { es, nq }, Agora());
			MarcarE1(es, Bracket(es, "Filled", "Cancelled"), Agora());
			string r1 = Reportar(R, new[] { es, nq }, Agora());
			MarcarE1(nq, Bracket(nq, "Filled", "Cancelled"), Agora());
			string r2 = Reportar(R, new[] { es, nq }, Agora());
			long seqAntes = R.ExecSeq;
			R.RegistrarOrigem("X1", AoExecOrigem.AotClose, Agora());                    // = ExecOrigem no lambda do CLOSE do AOT
			bool dup = Lifecycle(R, "X1", AoExecStatus.Closed, Agora()) || Lifecycle(R, "X1", AoExecStatus.ExitPending, Agora());
			var l = Do(R, "X1");
			Ok(r0 == null && r1 == "EXIT_PENDING/broker_stop" && r2 == "CLOSED/broker_stop", "X1a stop FILLED ⇒ origem broker_stop; EXIT_PENDING com perna aberta, CLOSED com todas FLAT", r0 + " " + r1 + " " + r2);
			Ok(Sts(l) == "OPEN_EXECUTED,EXIT_PENDING:broker_stop,CLOSED:broker_stop" && !dup && R.ExecSeq == seqAntes && R.OrigemDe("X1") == AoExecOrigem.BrokerStop,
				"X1b CLOSE do AOT depois do CLOSED = no-op (nenhum registro; 1a origem broker_stop mantida)", Sts(l) + " origem=" + R.OrigemDe("X1"));
		}
		// ── X2 take FILLED ⇒ broker_take ──
		{
			JObject es = Perna("X2", "X2-ES", "SHORT"), nq = Perna("X2", "X2-NQ", "SHORT");
			Open(R, "X2", AoExecStatus.OpenExecutado);
			MarcarE1(es, Bracket(es, "Cancelled", "Filled"), Agora()); MarcarE1(nq, Bracket(nq, "Cancelled", "Filled"), Agora());
			string r = Reportar(R, new[] { es, nq }, Agora());
			Ok(r == "CLOSED/broker_take" && Sts(Do(R, "X2")) == "OPEN_EXECUTED,CLOSED:broker_take", "X2 take FILLED nas 2 pernas ⇒ CLOSED broker_take", r + " " + Sts(Do(R, "X2")));
		}
		// ── X3 PROTECTION_MANDATORY (FecharPernaSemProtecao) ⇒ protection_mandatory ──
		{
			JObject es = Perna("X3", "X3-ES"), nq = Perna("X3", "X3-NQ");
			Open(R, "X3", AoExecStatus.OpenExecutado);
			AoExecReport.MarcarOrigemPerna(es, AoExecOrigem.Protecao, Agora()); es["x_order_id"] = "X3-ES-X";   // = FecharPernaSemProtecao (junto do x_order_id)
			string r1 = Reportar(R, new[] { es, nq }, Agora());
			es["x_estado"] = "Filled";
			nq["fechada"] = true;                                                       // seguidor fechou a 2a perna (CLOSE canonico do espelho)
			string r2 = Reportar(R, new[] { es, nq }, Agora());
			Ok(r1 == "EXIT_PENDING/protection_mandatory" && r2 == "CLOSED/protection_mandatory", "X3 fechamento PROTECTION_MANDATORY ⇒ EXIT_PENDING ⇒ CLOSED protection_mandatory", r1 + " " + r2);
		}
		// ── X4 sessao (FecharSessao 09:29 ET): origem session_end ANTES do FecharPorSessao; lifecycle ⇒ EXIT_PENDING/CLOSED session_end ──
		{
			Open(R, "X4", AoExecStatus.OpenExecutado);
			R.RegistrarOrigem("X4", AoExecOrigem.Sessao, Agora());
			bool a = Lifecycle(R, "X4", AoExecStatus.ExitPending, Agora()), b = Lifecycle(R, "X4", AoExecStatus.Closed, Agora());
			Ok(a && b && Sts(Do(R, "X4")) == "OPEN_EXECUTED,EXIT_PENDING:session_end,CLOSED:session_end", "X4 flatten de sessao ⇒ EXIT_PENDING ⇒ CLOSED session_end", Sts(Do(R, "X4")));
		}
		// ── X5 fechamento manual da perna do robo (MAN1: desvio confirmado) ⇒ manual_leg ──
		{
			JObject es = Perna("X5", "X5-ES"), nq = Perna("X5", "X5-NQ");
			Open(R, "X5", AoExecStatus.OpenExecutado);
			es["desvio"] = true;
			AoExecReport.MarcarOrigemPerna(es, AoExecReport.OrigemProtecaoFilled(Bracket(es, "Cancelled", "Cancelled"), es) ?? AoExecOrigem.Manual, Agora());   // = LeituraConfirmado
			string r1 = Reportar(R, new[] { es, nq }, Agora());
			bool soMan = AoExecReport.MarcarOrigemPerna(es, AoExecOrigem.BrokerStop, Agora()) == false;      // 1a vence
			nq["fechada"] = true;
			string r2 = Reportar(R, new[] { es, nq }, Agora());
			// A2B (FecharPernaEmDesvio) sobrescreve manual_leg ⇒ desvio_revertido (so a perna; a origem do TRADE ja registrada nao muda)
			JObject z = Perna("X5b", "X5b-ES"); AoExecReport.MarcarOrigemPerna(z, AoExecOrigem.Manual, Agora());
			bool sob = AoExecReport.MarcarOrigemPerna(z, AoExecOrigem.DesvioRevertido, Agora(), true) && (string)z[AoExecReport.CampoOrigem] == AoExecOrigem.DesvioRevertido;
			Ok(r1 == "EXIT_PENDING/manual_leg" && r2 == "CLOSED/manual_leg" && soMan && sob, "X5 desvio confirmado ⇒ manual_leg (1a origem vence; A2B sobrescreve com desvio_revertido)", r1 + " " + r2 + " sob=" + sob);
		}
		// ── X6 OPEN_BLOCKED por motivo ⇒ codigo fechado (D2); 1 registro por trade ──
		{
			var casos = new Dictionary<string, string> {
				{ "contract_invalid: ES 12-26 sem contrato vigente", "contract_invalid" }, { "stale: evento com 95 s", "stale" },
				{ "operational_stop: perda diaria", "operational_stop" }, { "active_position: Sim101 MES 12-26 LONG 3", "active_position" },
				{ "nenhuma conta habilitada", "no_accounts" }, { "blocked:sem_protecao stop=null take=60", "sem_protecao" },
				{ "reconciliation_pending", "reconciliation_pending" }, { "replay: evento de replay", "replay" }, { "", "other" } };
			bool todos = casos.All(kv => AoExecReport.CodigoMotivo(kv.Key) == kv.Value);
			bool a = Open(R, "X6", AoExecStatus.OpenBloqueado, "stale: evento com 95 s | Sim101 6001.25 qty 3");
			bool dup = Open(R, "X6", AoExecStatus.OpenBloqueado, "stale");
			var l = Do(R, "X6");
			Ok(todos && a && !dup && l.Count == 1 && (string)l[0]["reason"] == "stale" && (string)l[0]["event_id"] == "X6",
				"X6 OPEN_BLOCKED: motivo reduzido a codigo fechado (9 motivos), 1 registro por trade, event_id = OPEN", string.Join(" ", casos.Keys.Select(k => AoExecReport.CodigoMotivo(k))) + " n=" + l.Count);
		}
		// ── X7 fill parcial / 3 pernas em 2 contas: EXECUTED; CLOSED so com TODAS as pernas FLAT ──
		{
			JObject a = Perna("X7", "X7-ES-c1"), b = Perna("X7", "X7-NQ-c1"), c = Perna("X7", "X7-ES-c2");
			a["qty"] = 3; a["qty_preenchida"] = 1;                                         // parcial: perna existe com 1 de 3
			Open(R, "X7", AoExecStatus.OpenExecutado);
			string r0 = Reportar(R, new[] { a, b, c }, Agora());
			MarcarE1(a, Bracket(a, "Filled", "Cancelled"), Agora());
			string r1 = Reportar(R, new[] { a, b, c }, Agora());
			MarcarE1(b, Bracket(b, "Filled", "Cancelled"), Agora());
			string r2 = Reportar(R, new[] { a, b, c }, Agora());
			c["x_estado"] = "Filled";
			string r3 = Reportar(R, new[] { a, b, c }, Agora());
			Ok(r0 == null && r1 == "EXIT_PENDING/broker_stop" && r2 == "EXIT_PENDING/broker_stop" && r3 == "CLOSED/broker_stop"
				&& Sts(Do(R, "X7")) == "OPEN_EXECUTED,EXIT_PENDING:broker_stop,CLOSED:broker_stop", "X7 CLOSED so quando as 3 pernas estao FLAT (EXIT_PENDING deduplicado no meio)", r1 + " " + r2 + " " + r3 + " | " + Sts(Do(R, "X7")));
		}
		// ── X8 CLOSE do AOT rejeitado no NT8 ⇒ EXIT_PENDING ⇒ EXIT_FAILED_RETRY ⇒ (retry ok) CLOSED aot_close ──
		{
			Open(R, "X8", AoExecStatus.OpenExecutado);
			R.RegistrarOrigem("X8", AoExecOrigem.AotClose, Agora());
			bool a = Lifecycle(R, "X8", AoExecStatus.ExitPending, Agora()), b = Lifecycle(R, "X8", AoExecStatus.ExitFailedRetry, Agora());
			bool b2 = Lifecycle(R, "X8", AoExecStatus.ExitFailedRetry, Agora());          // mesmo (trade,status,origem) ⇒ dedup
			bool c = Lifecycle(R, "X8", AoExecStatus.Closed, Agora());
			bool depois = Lifecycle(R, "X8", AoExecStatus.ExitPending, Agora());          // nada depois de CLOSED
			Ok(a && b && !b2 && c && !depois && Sts(Do(R, "X8")) == "OPEN_EXECUTED,EXIT_PENDING:aot_close,EXIT_FAILED_RETRY:aot_close,CLOSED:aot_close",
				"X8 CLOSE rejeitado ⇒ EXIT_PENDING/EXIT_FAILED_RETRY (dedup) ⇒ CLOSED; nada emitido depois do CLOSED", Sts(Do(R, "X8")));
		}
		// ── X9 G12: conta 3x > perna 1x ⇒ divergente=true, garantia SEGUE com qtyAlvo = 1 (contratos alheios intocados); DIVERGENT/RECONCILED alternando ──
		{
			JObject e = Perna("X9", "X9-ES");
			int q; List<string> ids; string mot; bool div;
			string okDec = AoRoboFechamento.DecidirGarantiaProtecao(e, Bracket(e, "Accepted", "Working"), true, 0, 1000, "LONG", 3, 0, 6000, T, out q, out ids, out mot, out div);
			int q2; List<string> ids2; string mot2; bool div2;
			string rep = AoRoboFechamento.DecidirGarantiaProtecao(e, new JArray(Ordem("X9-ESS", "X9-ES|P1", "stopmarket", "Cancelled"), Ordem("X9-EST", "X9-ES|P1", "limit", "Working")),
																 true, 0, 1000, "LONG", 3, 0, 6000, T.AddMinutes(5), out q2, out ids2, out mot2, out div2);
			int q3; List<string> ids3; string mot3;
			string antiga = AoRoboFechamento.DecidirGarantiaProtecao(e, Bracket(e, "Accepted", "Working", 3), true, 0, 1000, "LONG", 3, 0, 6000, T, out q3, out ids3, out mot3);
			int q4; List<string> ids4; string mot4; bool div4;
			string limpo = AoRoboFechamento.DecidirGarantiaProtecao(e, Bracket(e, "Accepted", "Working"), true, 0, 1000, "LONG", 1, 0, 6000, T, out q4, out ids4, out mot4, out div4);
			Ok(okDec == AoRoboFechamento.GarOk && div && q == 1 && mot.StartsWith("G12:"), "X9a G12 conta 3x / perna 1x protegida em 1x ⇒ OK + divergente (nao retorna mais BROKER_INTERNAL_DIVERGENCE)", okDec + " q=" + q + " div=" + div);
			Ok(rep == AoRoboFechamento.GarReproteger && div2 && q2 == 1 && ids2.SequenceEqual(new[] { "X9-EST" }), "X9b stop da perna cancelado sob divergencia ⇒ REPROTEGER com qtyAlvo=1; ids so da perna", rep + " q=" + q2 + " ids=" + string.Join("|", ids2));
			Ok(antiga == AoRoboFechamento.GarAjustar && q3 == 1 && ids3.Count == 2 && !div4 && limpo == AoRoboFechamento.GarOk && q4 == 1,
				"X9c protecao 3x sobre perna 1x ⇒ AJUSTAR para 1x (assinatura antiga delega); conta 1x ⇒ OK sem divergencia", antiga + " q=" + q3 + " / " + limpo + " div=" + div4);
			string err;
			Open(R, "X9", AoExecStatus.OpenExecutado);
			bool d1 = R.Emitir("X9", null, AoExecStatus.Divergent, null, null, false, Agora(), out err), d2 = R.Emitir("X9", null, AoExecStatus.Divergent, null, null, false, Agora(), out err);
			bool divOn = R.Divergente("X9");
			bool r1 = R.Emitir("X9", null, AoExecStatus.Reconciled, null, null, false, Agora(), out err), r2 = R.Emitir("X9", null, AoExecStatus.Reconciled, null, null, false, Agora(), out err);
			Ok(d1 && !d2 && divOn && r1 && !r2 && !R.Divergente("X9") && Sts(Do(R, "X9")) == "OPEN_EXECUTED,DIVERGENT,RECONCILED",
				"X9d DIVERGENT 1x enquanto divergente; RECONCILED limpa (1x)", Sts(Do(R, "X9")));
			// alternancia: nova divergencia depois do RECONCILED vira novo registro (fora da fixture: trade X9alt)
			R.Emitir("X9alt", null, AoExecStatus.Divergent, null, null, false, Agora(), out err); R.Emitir("X9alt", null, AoExecStatus.Reconciled, null, null, false, Agora(), out err);
			bool alt = R.Emitir("X9alt", null, AoExecStatus.Divergent, null, null, false, Agora(), out err);
			Ok(alt && Sts(Do(R, "X9alt")) == "DIVERGENT,RECONCILED,DIVERGENT", "X9e alternancia DIVERGENT→RECONCILED→DIVERGENT = 3 registros", Sts(Do(R, "X9alt")));
		}
		// ── X10 copia/manual sem correlacao (sem trade_id) ⇒ nenhum registro ──
		{
			long s0 = R.ExecSeq; string err;
			bool a = R.Emitir(null, null, AoExecStatus.Closed, AoExecOrigem.Manual, null, false, Agora(), out err);
			bool b = R.Emitir("", null, AoExecStatus.ExitPending, null, null, false, Agora(), out err);
			string o; string est = AoExecReport.EstadoTrade(new[] { Perna(null, "EXT-1") }, out o);   // perna externa sem origem ⇒ nada
			string e2; bool inv = R.Emitir("X10", null, "FILLED_QTY", null, null, false, Agora(), out e2) || R.Emitir("X10", null, AoExecStatus.Closed, "conta_sim101", null, false, Agora(), out e2);
			Ok(!a && !b && err != null && err.Contains("D4") && est == null && !inv && R.ExecSeq == s0, "X10 sem trade_id (externo, D4) / status ou origem fora do contrato ⇒ nenhum registro", "err=" + err + " seq=" + R.ExecSeq);
		}
		// replay=true: registro gravado com replay (o AOT ignora) — trade XR
		{ string err; R.Emitir("XR", "XR", AoExecStatus.OpenExecutado, null, null, true, Agora(), out err); }

		// ── fixture = o log real do robo (antes do X11 mexer em copias) ──
		string log = Directory.GetFiles(dir).Single(f => AoExecReport.ArquivoRe.IsMatch(Path.GetFileName(f)));
		File.Copy(log, Path.Combine(outDir, "exec-fixture.jsonl"), true);

		// ── X11 idempotencia: mesmo registro 2x, F5 (instancia nova: exec_seq + dedup do log), linha torta, crash entre append e save ──
		{
			long seq = R.ExecSeq; string err;
			bool rep = Open(R, "X1", AoExecStatus.OpenExecutado);
			var F5 = new AoExecReport(dir);
			bool dupF5 = F5.Emitir("X1", null, AoExecStatus.Closed, AoExecOrigem.BrokerStop, null, false, Agora(), out err);
			bool divF5 = F5.Divergente("X9alt") && !F5.Divergente("X9") && F5.OrigemDe("X1") == AoExecOrigem.BrokerStop;
			File.AppendAllText(log, "{\"schema\":\"invictus/exec v1\",\"exec_seq\":99");   // linha torta (crash no meio do append)
			var F5b = new AoExecReport(dir);
			bool novo = F5b.Emitir("X11", "X11", AoExecStatus.OpenExecutado, null, null, false, Agora(), out err);
			// crash entre o append e o save: estado em disco com exec_seq atrasado ⇒ o LOG vence
			File.WriteAllText(F5b.StatePath, "{\"_schema\":\"invictus/exec-state v1\",\"exec_seq\":1,\"origens\":{}}");
			var F5c = new AoExecReport(dir);
			bool novo2 = F5c.Emitir("X11b", "X11b", AoExecStatus.OpenExecutado, null, null, false, Agora(), out err);
			var seqs = F5c.Ler().Select(o => o["exec_seq"]).Where(t => t != null).Select(t => (long)t).ToList();
			Ok(!rep && F5.ExecSeq == seq && !dupF5 && divF5, "X11a mesmo registro 2x ⇒ 1; F5 (instancia nova) recupera exec_seq/dedup/divergencia/origem do log", "seq=" + seq + "/" + F5.ExecSeq + " dup=" + dupF5 + " div=" + divF5);
			Ok(F5b.LinhasRuins == 1 && novo && F5b.ExecSeq == seq + 1 && novo2 && F5c.ExecSeq == seq + 2 && seqs.Count == seqs.Distinct().Count(),
				"X11b linha torta contada e ignorada; estado atrasado (crash append→save) nao reusa exec_seq", "ruins=" + F5b.LinhasRuins + " seq=" + F5c.ExecSeq + " unicos=" + (seqs.Count == seqs.Distinct().Count()));
		}
		// ── X12 privacidade (D2): so os 9 campos do contrato; nenhum preco/qty/conta/PnL, nem no reason ──
		{
			var permitidos = new HashSet<string> { "schema", "exec_seq", "trade_id", "event_id", "status", "origin", "at", "reason", "replay" };
			var regs = R.Ler();
			string txt = File.ReadAllText(Path.Combine(outDir, "exec-fixture.jsonl"));
			bool campos = regs.All(o => o.Properties().All(p => permitidos.Contains(p.Name)));
			bool reasons = regs.All(o => o["reason"].Type == JTokenType.Null || Array.IndexOf(new[] { "contract_invalid", "stale", "operational_stop", "active_position", "no_accounts",
				"sem_protecao", "reconciliation_pending", "replay", "account_skip", "execution_not_available", "other" }, (string)o["reason"]) >= 0);
			bool vaz = txt.Contains("Sim101") || txt.Contains("6001") || txt.Contains("qty") || txt.Contains("price") || txt.Contains("pnl") || txt.Contains("account");
			string st = File.ReadAllText(R.StatePath);
			Ok(campos && reasons && !vaz && !st.Contains("Sim101"), "X12 registros: so os 9 campos do contrato; reason em codigo fechado; nada de conta/preco/qty (log e estado)", "campos=" + campos + " reasons=" + reasons + " vaz=" + vaz);
		}

		int n = File.ReadAllLines(Path.Combine(outDir, "exec-fixture.jsonl")).Length;
		Console.WriteLine();
		Console.WriteLine("fixture: " + Path.Combine(outDir, "exec-fixture.jsonl") + " (" + n + " registros)");
		Console.WriteLine("RESULTADO exec C#: pass=" + pass + " fail=" + fail);
		return fail;
	}
}
