// SYNC TOTAL 2026-10-01 — lado INVICTUS (pecas puras do STAGING): consumidor AoRoboEventoAot + motor SEGUIDOR
// (AoMotorCanonico.AplicarEvento) + correlacao do AoRoboFechamento. Entrada = out/events-fixture.json gerado pelo
// test_sync.js a partir do aot-sim.js + bloco verbatim do aot-bff.js (o MESMO stream que o BFF serve). Sem NT8/ordem.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NinjaTrader.NinjaScript.AddOns;

static class ProgramSync
{
	static int pass, fail;
	static void Ok(bool c, string what, string det = null) { if (c) { pass++; Console.WriteLine("PASS " + what); } else { fail++; Console.WriteLine("FAIL " + what + (det == null ? "" : "  -> " + det)); } }

	static AoMotorTick Aplicar(AoMotorCanonico m, AoEventoAot e, out string res)
	{
		return m.AplicarEvento(e.Action, e.TradeId, e.EventId, e.Seq, e.Direction, e.Strength, e.Reason, e.EsPrice, e.NqPrice, e.CreatedAt.Value, e.Replay, 6000, 21000, out res);
	}

	// ═══ (2026-10-01, pos-revisao B1–B4) robo simulado = orquestrador REAL (ProcessarOpen/ProcessarClose) + motor + fechamento
	// do STAGING; so a camada de ordens e simulada (registro persistido ANTES do place, como RegistrarExecucao). "Crash" = excecao
	// no meio do passo + instancias novas lidas do disco. O broker (envios/saidas) sobrevive ao crash. ═══
	class Broker
	{
		public Dictionary<string, int> Envios = new Dictionary<string, int>(); public int Saidas; public int Total { get { return Envios.Values.Sum(); } }
		// (2026-10-01, pre-instalacao B1) estado do broker/conta que sobrevive ao crash do robo: ordens por intentId (nome AO|conta|id),
		// fills, posicoes por instrumento, conta disponivel (conectada + leitura fresca) e o dedup de intencao (persistido como o real).
		public HashSet<string> Ordens = new HashSet<string>(), Fills = new HashSet<string>(), Posicoes = new HashSet<string>(), Dedup = new HashSet<string>();
		public bool ContaOk = true;
		public JArray OrdensJson() { return ContaOk ? new JArray(Ordens.Select(id => new JObject { { "name", "AO|sim101|" + id }, { "oco", id }, { "state", "Filled" } })) : null; }
	}

	class ExecSim
	{
		readonly string _p; public readonly Broker B; public string CrashAt, Bloqueio; public List<JObject> Regs;
		public ExecSim(string p, Broker b) { _p = p; B = b; Regs = File.Exists(p) ? JArray.Parse(File.ReadAllText(p)).Cast<JObject>().ToList() : new List<JObject>(); }
		void Crash(string ponto) { if (CrashAt == ponto) throw new InvalidOperationException("CRASH " + ponto); }
		public List<string> Decisoes = new List<string>();
		void Salvar() { File.WriteAllText(_p, new JArray(Regs).ToString()); }
		/// <summary>= AlfaOmegaRobo.ExecutarEntrada: retomada ⇒ ReconciliarPernas (mesma peca pura AoPernaAot) antes de qualquer envio;
		/// registro ANTES do place (RegistrarExecucao); dedup marcado no registro e liberado SO para a perna ausente confirmada.</summary>
		public AoResultadoEntrada Executar(string tid, string side, DateTime openedAt, bool permitirNovos, bool retomada)
		{
			var r = new AoResultadoEntrada();
			var liberados = new HashSet<string>();
			if (retomada)
				foreach (JObject e in Regs.Where(x => (string)x["trade_id"] == tid).ToList())
				{
					string id = (string)e["intentId"], inst = (string)e["instrumento"];
					string evid = AoPernaAot.Evidencia(B.Fills.Contains(id), AoPernaAot.OrdemPresente(B.OrdensJson(), "AO|sim101|" + id, id), B.ContaOk ? (bool?)B.Posicoes.Contains(inst) : null);
					string dec = AoPernaAot.Decidir(evid, permitirNovos);
					Decisoes.Add(inst + ":" + evid + ":" + dec);
					if (dec == AoPernaAot.NaoReenviar) { r.JaRegistradas++; continue; }
					if (dec == AoPernaAot.Pendente) { r.Incertas++; continue; }
					Regs.Remove(e); Salvar();
					if (dec == AoPernaAot.Reenviar) liberados.Add(id); else r.Motivo = "stale: perna ausente " + inst + " removida sem envio";
				}
			else r.JaRegistradas = Regs.Count(e => (string)e["trade_id"] == tid);
			if (r.Incertas > 0) { r.Motivo = "reconciliation_pending"; return r; }
			if (!permitirNovos) { r.Motivo = (r.Motivo == null ? "" : r.Motivo + " | ") + "stale_on_resume"; return r; }
			if (Bloqueio != null) { r.Motivo = Bloqueio; return r; }
			foreach (string inst in new[] { "ES 12-26", "NQ 12-26" })
			{
				if (Regs.Any(e => (string)e["trade_id"] == tid && (string)e["instrumento"] == inst)) continue;   // perna ja submetida: nunca reenviar
				Crash("before_register:" + inst);
				string id = "AO-" + tid + "-" + inst.Substring(0, 2);
				if (B.Dedup.Contains(id) && !liberados.Remove(id)) { r.Motivo = "dedup: " + id; continue; }
				B.Dedup.Add(id);
				Regs.Add(new JObject { { "intentId", id }, { "trade_id", tid }, { "conta", "sim101" }, { "nt8_account", "Sim101" }, { "instrumento", inst },
									   { "familia", inst.Substring(0, 2) }, { "ativo", inst.Substring(0, 2) }, { "qty", 1 }, { "side", side }, { "multiplier", 50 },
									   { "openedAt", AoMotorCanonico.Iso(openedAt) }, { "order_name", "AO|sim101|" + id } });
				Salvar();
				Crash("after_register:" + inst);   // B1: registro persistido, place AINDA NAO feito
				string k = tid + "|" + inst; int n; B.Envios[k] = (B.Envios.TryGetValue(k, out n) ? n : 0) + 1; r.Enviadas++; B.Ordens.Add(id);
				Crash("after_place:" + inst);
			}
			return r;
		}
	}

	class Robo
	{
		public AoRoboEventoAot Cons; public AoMotorCanonico M; public AoRoboFechamento Fe; public ExecSim X; public string Hist;
		public Robo(string dir, Broker b)
		{
			Directory.CreateDirectory(dir); Hist = Path.Combine(dir, "hist");
			Cons = new AoRoboEventoAot(Path.Combine(dir, "cursor.json"));
			M = new AoMotorCanonico(Path.Combine(dir, "motor.json"), Hist, new AoMotorParams());
			Fe = new AoRoboFechamento(Path.Combine(dir, "fech.json")) { Multiplicador = s => 50 };
			X = new ExecSim(Path.Combine(dir, "execucoes.json"), b);
			// = DecisaoSaidaMotor: EXIT_DECIDED com as pernas do trade_id
			M.LedgerDiferido = rec => Fe.Decidir(rec, X.Regs.Where(e => (string)e["trade_id"] == (string)rec["trade_id"]).Select(e => (JObject)e.DeepClone()).ToList(),
												  new JObject { { "turno", "RTH" } }, AoMotorCanonico.ParseIso(rec["closedAt"]) ?? DateTime.UtcNow);
		}
		public string Open(AoEventoAot e, DateTime agora, out string det)
		{
			string st = Cons.ProcessarOpen(e, agora,
				() => { string res; Aplicar(M, e, out res); return res == AoMotorCanonico.EvJaAplicado && M.TradeId != e.TradeId ? "ALREADY_CLOSED" : res; },
				(p, ret) => X.Executar(e.TradeId, M.Side, M.OpenedAtUtc ?? agora, p, ret), () => M.DesfazerAbertura(e.TradeId), out det);
			if (AoEventoStatus.Final(st)) Cons.Ack(e, e.Seq, st, det, agora);   // RECONCILIATION_PENDING: sem Ack (cursor parado)
			return st;
		}
		public string Close(AoEventoAot e, DateTime agora, out string det, bool crashNaSaida = false)
		{
			string st = Cons.ProcessarClose(e, agora, () => { string res; Aplicar(M, e, out res); return res; },
				() => { if (crashNaSaida) throw new InvalidOperationException("CRASH antes da saida"); X.B.Saidas++; }, out det);
			Cons.Ack(e, e.Seq, st, det, agora);
			return st;
		}
		/// <summary>fills de entrada/saida + FLAT de todas as pernas do trade → Avaliar (CLOSED vai para o outbox).</summary>
		public List<JObject> FecharPernas(string tid, DateTime t)
		{
			foreach (JObject e in X.Regs.Where(e => (string)e["trade_id"] == tid))
			{
				string id = (string)e["intentId"]; bool longo = (string)e["side"] == "LONG";
				Fe.RegistrarFill(id, longo, 1, 6001, t.AddSeconds(-60), "AO|sim101|" + id);
				Fe.RegistrarFill(id, !longo, 1, 6003, t, "AO|sim101|" + id + "|X");
				Fe.Perna(id, AoPernaEvento.FlatVerificado, t, "flatten_ok");
			}
			List<JObject> tr; return Fe.Avaliar(t.AddMilliseconds(100), out tr);
		}
		public List<JObject> Ledger()
		{
			if (!Directory.Exists(Hist)) return new List<JObject>();
			return Directory.GetFiles(Hist, "trades-*.jsonl").SelectMany(File.ReadAllLines).Where(l => l.Trim().Length > 0).Select(JObject.Parse).ToList();
		}
	}

	static AoEventoAot EvSint(JObject baseEv, string action, string tid, string eid, long seq, DateTime created, out JObject raw)
	{
		raw = (JObject)baseEv.DeepClone(); raw["action"] = action; raw["trade_id"] = tid; raw["event_id"] = eid; raw["seq"] = seq; raw["created_at"] = AoEventoAot.Iso(created);
		string erro; return AoEventoAot.De(raw, out erro);
	}

	static bool Crashou(Action a) { try { a(); return false; } catch (InvalidOperationException ex) { return ex.Message.StartsWith("CRASH"); } }

	static void PosRevisao(List<JObject> evs, string tmp)
	{
		DateTime t0 = AoEventoAot.ParseIso(evs[0]["created_at"]).Value;
		JObject raw, rawC; string det = null, st = null; AoEventoAot e, ec, x; string erro; bool gap;

		// ── J3_LEDGER_IDENTITY: identidade completa na LINHA REAL gravada pelo lifecycle (arquivo trades-*.jsonl) ──
		var bJ = new Broker(); var R = new Robo(Path.Combine(tmp, "j3"), bJ); R.Cons.Bootstrap(99, t0);
		e = EvSint(evs[0], "OPEN", "T", "X", 100, t0, out raw);
		ec = EvSint(evs[1], "CLOSE", "T", "Y", 101, t0.AddMinutes(2), out rawC);
		string sO = R.Open(e, t0.AddSeconds(2), out det);
		string sC = R.Close(ec, t0.AddMinutes(2).AddSeconds(1), out det);
		R.FecharPernas("T", t0.AddMinutes(2).AddSeconds(3));
		R.Fe.Commit(R.M.LedgerContemClosed, R.M.GravarLinhaLedger);
		var LJ = R.Ledger();
		JObject lj = LJ.Count == 1 ? LJ[0] : null;
		Ok(sO == AoEventoStatus.OpenExecutado && sC == AoEventoStatus.CloseExecutado && lj != null && (string)lj["lifecycle"] == AoFechamentoEstado.Closed
		   && (string)lj["trade_id"] == "T" && (string)lj["event_id_open"] == "X" && (long)lj["seq_open"] == 100 && (string)lj["event_id_close"] == "Y" && (long)lj["seq_close"] == 101,
		   "J3_LEDGER_IDENTITY linha CLOSED real do ledger = T / X / 100 / Y / 101", lj == null ? "linhas=" + LJ.Count + " " + sO + " " + sC : lj.ToString(Newtonsoft.Json.Formatting.None).Substring(0, 300));

		// ── K1/K2: crash depois do motor OPEN e ANTES de qualquer ordem → restart RETOMA (nao DUPLICATE), entrada enviada 1x ──
		var b = new Broker(); string d1 = Path.Combine(tmp, "k1"); R = new Robo(d1, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "T1", "T1", 1, t0, out raw);
		R.X.CrashAt = "before_register:ES 12-26";
		bool cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		R = new Robo(d1, b);
		Ok(cr && R.Cons.StatusDe("T1") == AoEventoStatus.ExecPendente && R.Cons.LastSeq == 0 && R.M.Side == "LONG" && R.M.TradeId == "T1" && b.Total == 0
		   && R.Cons.Classificar(raw, out x, out erro, out gap) == AoEventoStatus.Retomar,
		   "K1 crash motor OPEN→ordem: status EXECUTION_PENDING persistido, cursor NAO avancou, restart = RESUME (nao DUPLICATE)", R.Cons.StatusDe("T1") + " seq=" + R.Cons.LastSeq);
		st = R.Open(e, t0.AddSeconds(5), out det);
		Ok(st == AoEventoStatus.OpenExecutado && b.Total == 2 && b.Envios["T1|ES 12-26"] == 1 && b.Envios["T1|NQ 12-26"] == 1 && R.Cons.LastSeq == 1,
		   "K2 retomada executa a entrada: evento NAO perdido, 1 envio por perna, OPEN_EXECUTED, cursor=1", st + " " + det + " total=" + b.Total);

		// ── K3: crash APOS a 1a perna submetida → retomada envia so a 2a (sem duplicar a 1a) ──
		b = new Broker(); string d3 = Path.Combine(tmp, "k3"); R = new Robo(d3, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "T3", "T3", 1, t0, out raw);
		R.X.CrashAt = "after_place:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		R = new Robo(d3, b); st = R.Open(e, t0.AddSeconds(4), out det);
		Ok(cr && st == AoEventoStatus.OpenExecutado && b.Envios["T3|ES 12-26"] == 1 && b.Envios["T3|NQ 12-26"] == 1 && det.Contains("submitted=1 already_registered=1"),
		   "K3 crash entre pernas: retomada pula a perna ja registrada e envia so a que faltava (exatamente 1 por perna)", st + " " + det);

		// ── K4: crash com TODAS as ordens enviadas e antes do ACK → retomada nao reenvia; reentrega posterior = DUPLICATE ──
		b = new Broker(); string d4 = Path.Combine(tmp, "k4"); R = new Robo(d4, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "T4", "T4", 1, t0, out raw);
		R.X.CrashAt = "after_place:NQ 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		R = new Robo(d4, b); st = R.Open(e, t0.AddSeconds(4), out det);
		Ok(cr && st == AoEventoStatus.OpenExecutado && b.Total == 2 && det.Contains("submitted=0 already_registered=2")
		   && R.Cons.Classificar(raw, out x, out erro, out gap) == AoEventoStatus.Duplicado,
		   "K4 crash apos envio/antes do ACK: retomada = OPEN_EXECUTED sem 2o envio; depois do ACK = DUPLICATE", st + " " + det + " total=" + b.Total);

		// ── K5: ZERO ordens (contrato invalido) → OPEN_BLOCKED com reason; seguidor NAO fica posicionado (nem apos restart) ──
		b = new Broker(); string d5 = Path.Combine(tmp, "k5"); R = new Robo(d5, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "T5", "T5", 1, t0, out raw);
		R.X.Bloqueio = "contract_invalid: ES ES 09-26 conta sim101: vencido";
		st = R.Open(e, t0.AddSeconds(2), out det);
		bool flatAgora = R.M.Side == "FLAT" && R.M.TradeId == null;
		R = new Robo(d5, b);
		ec = EvSint(evs[1], "CLOSE", "T5", "C5", 2, t0.AddMinutes(1), out rawC);
		string stC = R.Close(ec, t0.AddMinutes(1).AddSeconds(1), out det);
		Ok(st == AoEventoStatus.OpenBloqueado && R.Cons.StatusDe("T5") == AoEventoStatus.OpenBloqueado && flatAgora && b.Total == 0
		   && stC == AoEventoStatus.CloseSemTrade && R.Fe.Pendentes == 0 && R.Ledger().Count == 0,
		   "K5 0 ordens (contract_invalid) = OPEN_BLOCKED (nunca OPEN_EXECUTED); seguidor FLAT; CLOSE dele = CLOSE_SEM_TRADE; ledger 0", st + " / " + stC);
		var cur5 = JObject.Parse(File.ReadAllText(Path.Combine(d5, "cursor.json"))).ToString();
		Ok(cur5.Contains("contract_invalid") && cur5.Contains("\"T5\""), "K5b status persistido com event_id/trade_id + reason contract_invalid");

		// ── K6: outros motivos de zero ordens + OPEN que fica stale durante o crash ──
		var motivos = new[] { "operational_stop: STOP operacional", "execution_not_available: nenhuma conta habilitada" };
		bool k6 = true; string k6d = "";
		for (int i = 0; i < motivos.Length; i++)
		{
			b = new Broker(); R = new Robo(Path.Combine(tmp, "k6" + i), b); R.Cons.Bootstrap(0, t0);
			e = EvSint(evs[0], "OPEN", "T6" + i, "T6" + i, 1, t0, out raw);
			R.X.Bloqueio = motivos[i];
			st = R.Open(e, t0.AddSeconds(2), out det);
			k6 &= st == AoEventoStatus.OpenBloqueado && det == motivos[i] && R.M.Side == "FLAT" && b.Total == 0; k6d += st + ":" + det + " ";
		}
		b = new Broker(); string d6 = Path.Combine(tmp, "k6s"); R = new Robo(d6, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "T6s", "T6s", 1, t0, out raw);
		R.X.CrashAt = "before_register:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		R = new Robo(d6, b); st = R.Open(e, t0.AddSeconds(150), out det);
		Ok(k6 && cr && st == AoEventoStatus.OpenBloqueado && det.StartsWith("stale") && R.M.Side == "FLAT" && b.Total == 0,
		   "K6 operational_stop / execution_not_available / stale na retomada = OPEN_BLOCKED com reason, seguidor FLAT, 0 envios", k6d + "| " + st + ":" + det);

		// ── K7: CLOSE — crash depois do motor fechar e antes da saida → restart RETOMA e executa a saida 1x ──
		b = new Broker(); string d7 = Path.Combine(tmp, "k7"); R = new Robo(d7, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "T7", "X7", 1, t0, out raw);
		R.Open(e, t0.AddSeconds(2), out det);
		ec = EvSint(evs[1], "CLOSE", "T7", "Y7", 2, t0.AddMinutes(2), out rawC);
		cr = Crashou(() => R.Close(ec, t0.AddMinutes(2).AddSeconds(1), out det, true));
		R = new Robo(d7, b);
		bool resume7 = R.Cons.StatusDe("Y7") == AoEventoStatus.Recebido && R.Cons.Classificar(rawC, out x, out erro, out gap) == AoEventoStatus.Retomar && R.M.Side == "FLAT";
		st = R.Close(ec, t0.AddMinutes(2).AddSeconds(3), out det);
		Ok(cr && resume7 && st == AoEventoStatus.CloseExecutado && b.Saidas == 1 && R.Fe.Pendentes == 1 && R.Cons.LastSeq == 2,
		   "K7 crash motor CLOSE→saida: restart = RESUME, saida executada 1x, EXIT_DECIDED unico (Decidir idempotente)", st + " " + det + " saidas=" + b.Saidas);

		// ── K8: crash entre FLAT (pendente removido) e a linha CLOSED → outbox persistido recupera exatamente 1 linha ──
		R.FecharPernas("T7", t0.AddMinutes(2).AddSeconds(5));   // Avaliar → CLOSED no outbox; "crash" antes do Commit
		R = new Robo(d7, b);
		bool antes8 = R.Fe.Pendentes == 0 && R.Fe.Outbox == 1 && R.Ledger().Count == 0;
		var g8 = R.Fe.Commit(R.M.LedgerContemClosed, R.M.GravarLinhaLedger);
		var L8 = R.Ledger();
		Ok(antes8 && g8.Count == 1 && L8.Count == 1 && (string)L8[0]["trade_id"] == "T7" && (string)L8[0]["event_id_close"] == "Y7" && R.Fe.Outbox == 0,
		   "K8 crash FLAT→ledger: restart encontra a linha no outbox e grava EXATAMENTE 1 CLOSED (ids completos)", "outbox/ledger=" + R.Fe.Outbox + "/" + L8.Count);

		// ── K9: crash DEPOIS do append e antes de tirar do outbox → restart NAO duplica ──
		b = new Broker(); string d9 = Path.Combine(tmp, "k9"); R = new Robo(d9, b); R.Cons.Bootstrap(0, t0);
		R.Open(EvSint(evs[0], "OPEN", "T9", "X9", 1, t0, out raw), t0.AddSeconds(2), out det);
		R.Close(EvSint(evs[1], "CLOSE", "T9", "Y9", 2, t0.AddMinutes(2), out rawC), t0.AddMinutes(2).AddSeconds(1), out det);
		R.FecharPernas("T9", t0.AddMinutes(2).AddSeconds(3));
		AoMotorCanonico m9 = R.M;
		var g9a = R.Fe.Commit(m9.LedgerContemClosed, l => { m9.GravarLinhaLedger(l); throw new InvalidOperationException("CRASH apos append"); });
		R = new Robo(d9, b);
		bool antes9 = R.Fe.Outbox == 1 && R.Ledger().Count == 1;
		var g9 = R.Fe.Commit(R.M.LedgerContemClosed, R.M.GravarLinhaLedger);
		Ok(g9a.Count == 0 && antes9 && g9.Count == 0 && R.Fe.Outbox == 0 && R.Ledger().Count == 1,
		   "K9 crash apos append/antes do outbox: restart reconhece o CLOSED ja gravado (trade_id) e NAO grava 2a linha", "ledger=" + R.Ledger().Count);

		// ── K10: falha de escrita do ledger → linha fica no outbox e entra no ciclo seguinte; ciclos extras nao duplicam ──
		b = new Broker(); string d10 = Path.Combine(tmp, "k10"); R = new Robo(d10, b); R.Cons.Bootstrap(0, t0);
		R.Open(EvSint(evs[0], "OPEN", "T10", "X10", 1, t0, out raw), t0.AddSeconds(2), out det);
		R.Close(EvSint(evs[1], "CLOSE", "T10", "Y10", 2, t0.AddMinutes(2), out rawC), t0.AddMinutes(2).AddSeconds(1), out det);
		R.FecharPernas("T10", t0.AddMinutes(2).AddSeconds(3));
		var g10a = R.Fe.Commit(R.M.LedgerContemClosed, l => false);
		bool falhou = g10a.Count == 0 && R.Fe.Outbox == 1 && R.Ledger().Count == 0;
		var g10 = R.Fe.Commit(R.M.LedgerContemClosed, R.M.GravarLinhaLedger);
		for (int i = 0; i < 3; i++) { List<JObject> tr; R.Fe.Avaliar(t0.AddMinutes(3 + i), out tr); R.Fe.Commit(R.M.LedgerContemClosed, R.M.GravarLinhaLedger); }
		Ok(falhou && g10.Count == 1 && R.Ledger().Count == 1 && R.Fe.Outbox == 0 && R.Fe.Pendentes == 0,
		   "K10 escrita falhou → outbox retem; proximo ciclo grava; ciclos extras = sempre 1 CLOSED", "ledger=" + R.Ledger().Count);
	}

	// ═══ (2026-10-01) CORRECAO DOS BLOQUEIOS PRE-INSTALACAO — B1 REGISTER_BEFORE_PLACE_GAP (R1–R7) · B2 CORRUPT_CURSOR_CLOSE_LOSS (C1–C5) ═══
	static void PreInstalacao(List<JObject> evs, string tmp)
	{
		DateTime t0 = AoEventoAot.ParseIso(evs[0]["created_at"]).Value;
		JObject raw; string det = null, st = null, erro; AoEventoAot e, x; bool gap, cr;

		// R1 crash DEPOIS do registro e ANTES do PlaceOrder → restart ve registro orfao → broker confirma ausencia → envia exatamente 1x
		var b = new Broker(); string d = Path.Combine(tmp, "r1"); var R = new Robo(d, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "R1", "R1", 1, t0, out raw);
		R.X.CrashAt = "after_register:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		bool orfao = cr && b.Total == 0 && new ExecSim(Path.Combine(d, "execucoes.json"), b).Regs.Count == 1 && b.Dedup.Contains("AO-R1-ES");
		R = new Robo(d, b); st = R.Open(e, t0.AddSeconds(5), out det);
		Ok(orfao && st == AoEventoStatus.OpenExecutado && b.Envios["R1|ES 12-26"] == 1 && b.Envios["R1|NQ 12-26"] == 1 && b.Total == 2
		   && R.X.Decisoes.SequenceEqual(new[] { "ES 12-26:" + AoPernaAot.Ausente + ":" + AoPernaAot.Reenviar }) && det.StartsWith("submitted=2 already_registered=0") && R.Cons.LastSeq == 1,
		   "R1 crash registro→place: perna orfa, broker confirma AUSENCIA → reenvio exatamente 1x (dedup liberado so p/ ela); OPEN_EXECUTED", st + " " + det + " " + string.Join(",", R.X.Decisoes));

		// R2 crash DEPOIS do PlaceOrder → ordem existe → restart NAO reenvia
		b = new Broker(); d = Path.Combine(tmp, "r2"); R = new Robo(d, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "R2", "R2", 1, t0, out raw);
		R.X.CrashAt = "after_place:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		R = new Robo(d, b); st = R.Open(e, t0.AddSeconds(5), out det);
		Ok(cr && st == AoEventoStatus.OpenExecutado && b.Envios["R2|ES 12-26"] == 1 && b.Envios["R2|NQ 12-26"] == 1
		   && R.X.Decisoes.SequenceEqual(new[] { "ES 12-26:" + AoPernaAot.Ordem + ":" + AoPernaAot.NaoReenviar }) && det.StartsWith("submitted=1 already_registered=1"),
		   "R2 crash apos place: ordem AO|conta|intentId encontrada → NAO reenvia", st + " " + det);

		// R3 fill ja existe (ordem fora da lista) → NAO reenvia · R4 posicao ja existe → NAO reenvia
		string[] casos = { "fill", "posicao" }; string[] evEsp = { AoPernaAot.Fill, AoPernaAot.Posicao };
		for (int i = 0; i < 2; i++)
		{
			string tid = "R" + (3 + i);
			b = new Broker(); d = Path.Combine(tmp, tid.ToLowerInvariant()); R = new Robo(d, b); R.Cons.Bootstrap(0, t0);
			e = EvSint(evs[0], "OPEN", tid, tid, 1, t0, out raw);
			R.X.CrashAt = "after_place:ES 12-26";
			cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
			b.Ordens.Remove("AO-" + tid + "-ES");
			if (i == 0) b.Fills.Add("AO-" + tid + "-ES"); else b.Posicoes.Add("ES 12-26");
			R = new Robo(d, b); st = R.Open(e, t0.AddSeconds(5), out det);
			Ok(cr && st == AoEventoStatus.OpenExecutado && b.Envios[tid + "|ES 12-26"] == 1 && b.Envios[tid + "|NQ 12-26"] == 1
			   && R.X.Decisoes.SequenceEqual(new[] { "ES 12-26:" + evEsp[i] + ":" + AoPernaAot.NaoReenviar }),
			   tid + " " + casos[i] + " ja existe (ordem fora da lista) → NAO reenvia", st + " " + det + " " + string.Join(",", R.X.Decisoes));
		}

		// R5 broker/conta indisponivel → NAO reenvia → RECONCILIATION_PENDING (nao final, cursor parado) → conta volta → 1 envio
		b = new Broker(); d = Path.Combine(tmp, "r5"); R = new Robo(d, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "R5", "R5", 1, t0, out raw);
		R.X.CrashAt = "after_register:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		b.ContaOk = false;
		R = new Robo(d, b); st = R.Open(e, t0.AddSeconds(5), out det);
		string st5b = R.Open(e, t0.AddSeconds(7), out det);
		R = new Robo(d, b);   // restart durante a pendencia
		bool pend = st == AoEventoStatus.ReconPendente && st5b == AoEventoStatus.ReconPendente && b.Total == 0 && R.Cons.LastSeq == 0
				 && R.Cons.StatusDe("R5") == AoEventoStatus.ReconPendente && R.Cons.Classificar(raw, out x, out erro, out gap) == AoEventoStatus.Retomar
				 && R.M.TradeId == "R5" && R.X.Regs.Count == 1 && !AoEventoStatus.Final(AoEventoStatus.ReconPendente);
		Ok(cr && pend, "R5 conta indisponivel: 0 envios, RECONCILIATION_PENDING persistido, cursor NAO avanca, restart = RESUME (fail-closed)", st + "/" + st5b + " seq=" + R.Cons.LastSeq + " " + det);
		b.ContaOk = true; st = R.Open(e, t0.AddSeconds(9), out det);
		Ok(st == AoEventoStatus.OpenExecutado && b.Envios["R5|ES 12-26"] == 1 && b.Envios["R5|NQ 12-26"] == 1 && R.Cons.LastSeq == 1,
		   "R5b conta volta (OPEN ainda fresco): ausencia confirmada → ES 1x + NQ 1x; OPEN_EXECUTED; cursor=1", st + " " + det);

		// R6 evento ficou STALE durante a recuperacao → NAO reenvia; perna ausente removida; nada confirmado ⇒ OPEN_BLOCKED stale, seguidor FLAT
		b = new Broker(); d = Path.Combine(tmp, "r6"); R = new Robo(d, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "R6", "R6", 1, t0, out raw);
		R.X.CrashAt = "after_register:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		R = new Robo(d, b); st = R.Open(e, t0.AddSeconds(150), out det);
		Ok(cr && st == AoEventoStatus.OpenBloqueado && b.Total == 0 && R.X.Regs.Count == 0 && R.M.Side == "FLAT" && det.StartsWith("stale") && det.Contains("removida sem envio")
		   && R.X.Decisoes.SequenceEqual(new[] { "ES 12-26:" + AoPernaAot.Ausente + ":" + AoPernaAot.RemoverSemEnvio }),
		   "R6 OPEN stale na recuperacao: 0 envios, perna orfa removida, OPEN_BLOCKED stale, seguidor FLAT", st + " " + det);
		// R6b stale com conta indisponivel ⇒ continua pendente (nunca remove sem prova)
		b = new Broker(); d = Path.Combine(tmp, "r6b"); R = new Robo(d, b); R.Cons.Bootstrap(0, t0);
		e = EvSint(evs[0], "OPEN", "R6b", "R6b", 1, t0, out raw);
		R.X.CrashAt = "after_register:ES 12-26";
		cr = Crashou(() => R.Open(e, t0.AddSeconds(2), out det));
		b.ContaOk = false;
		R = new Robo(d, b); st = R.Open(e, t0.AddSeconds(150), out det);
		Ok(cr && st == AoEventoStatus.ReconPendente && b.Total == 0 && R.X.Regs.Count == 1 && R.M.TradeId == "R6b",
		   "R6b stale + conta indisponivel: perna NAO removida sem prova; RECONCILIATION_PENDING", st + " " + det);
		// R7 caminho normal (sem crash) inalterado: nenhuma reconciliacao
		b = new Broker(); R = new Robo(Path.Combine(tmp, "r7"), b); R.Cons.Bootstrap(0, t0);
		st = R.Open(EvSint(evs[0], "OPEN", "R7", "R7", 1, t0, out raw), t0.AddSeconds(2), out det);
		Ok(st == AoEventoStatus.OpenExecutado && b.Total == 2 && R.X.Decisoes.Count == 0, "R7 fluxo normal: 2 envios, nenhuma reconciliacao", st + " " + det);

		// ── B2: cursor. Seguidor abre T (seq 3); o AOT segue: seq4 OPEN U (fresco, outro trade), seq5 CLOSE T, seq6 OPEN V (velho) ──
		Func<string, Broker, Robo> montar = (dir, bk) =>
		{
			var r0 = new Robo(dir, bk); r0.Cons.Bootstrap(2, t0); string dd; JObject rr;
			r0.Open(EvSint(evs[0], "OPEN", "T", "T", 3, t0, out rr), t0.AddSeconds(2), out dd);
			return r0;
		};
		DateTime tr = t0.AddSeconds(200);
		var seguintes = new List<JObject> { EvRaw(evs[0], "OPEN", "U", "U", 4, tr.AddSeconds(-5)), EvRaw(evs[1], "CLOSE", "T", "CT", 5, tr.AddSeconds(-4)),
											EvRaw(evs[0], "OPEN", "V", "V", 6, t0.AddSeconds(100)) };
		Func<Robo, List<string>> entregar = rb =>
		{
			var res = new List<string>(); string dd;
			foreach (JObject j in seguintes)
			{
				AoEventoAot ev; string er; bool g; string c = rb.Cons.Classificar(j, out ev, out er, out g);
				if (c == AoEventoStatus.Antigo || c == AoEventoStatus.Duplicado) { res.Add(c); continue; }
				res.Add(ev.Action == "OPEN" ? rb.Open(ev, tr, out dd) : rb.Close(ev, tr, out dd));
			}
			return res;
		};

		// C1 cursor valido: retoma do disco, sem bootstrap, sem flag
		b = new Broker(); d = Path.Combine(tmp, "c1"); R = montar(d, b);
		R = new Robo(d, b);
		Ok(R.Cons.TemCursor && R.Cons.LastSeq == 3 && !R.Cons.CursorCorrompido && !R.Cons.Bootstrap(6, tr, R.M.SeqOpen, R.M.EventIdOpen) && R.Cons.LastSeq == 3,
		   "C1 cursor valido: carregado (last_seq=3), Bootstrap nao age, nada marcado corrompido");

		// C2 cursor CORROMPIDO + T aberto ⇒ .corrupt preservado; bootstrap no seq_open(T); CLOSE T aplicado; 0 entradas
		b = new Broker(); d = Path.Combine(tmp, "c2"); R = montar(d, b);
		string curP = Path.Combine(d, "cursor.json"); File.WriteAllText(curP, "{\"last_seq\": 3, \"processed\": {\"T\": {\"st");
		R = new Robo(d, b);
		string[] corr = Directory.GetFiles(d, "cursor.json.corrupt-*");
		bool c2a = R.Cons.CursorCorrompido && !R.Cons.TemCursor && corr.Length == 1 && File.ReadAllText(corr[0]).Contains("\"st") && R.M.TradeId == "T" && R.M.SeqOpen == 3;
		R.Cons.Bootstrap(6, tr, R.M.SeqOpen, R.M.EventIdOpen);
		bool c2b = R.Cons.LastSeq == 3 && R.Cons.StatusDe("T") == AoEventoStatus.JaAplicado && R.Cons.Classificar(EvRaw(evs[0], "OPEN", "T", "T", 3, t0), out x, out erro, out gap) != AoEventoStatus.Novo;
		var r2 = entregar(R);
		Ok(c2a && c2b && r2.SequenceEqual(new[] { AoEventoStatus.OpenBloqueado, AoEventoStatus.CloseExecutado, AoEventoStatus.OpenBloqueado })
		   && b.Saidas == 1 && b.Total == 2 && R.M.Side == "FLAT" && R.Cons.LastSeq == 6 && File.Exists(curP),
		   "C2 cursor corrompido + T aberto: .corrupt-<ts> preservado; cursor = seq_open 3; U active_position / V stale = OPEN_BLOCKED; CLOSE T aplicado (1 saida); 0 entradas novas",
		   string.Join(",", r2) + " saidas=" + b.Saidas + " envios=" + b.Total + " " + c2a + c2b);

		// C3 cursor APAGADO + T aberto ⇒ mesmo resultado (sem flag de corrupcao)
		b = new Broker(); d = Path.Combine(tmp, "c3"); R = montar(d, b);
		File.Delete(Path.Combine(d, "cursor.json"));
		R = new Robo(d, b); bool c3a = !R.Cons.TemCursor && !R.Cons.CursorCorrompido;
		R.Cons.Bootstrap(6, tr, R.M.SeqOpen, R.M.EventIdOpen);
		var r3 = entregar(R);
		Ok(c3a && R.Cons.LastSeq == 6 && r3[1] == AoEventoStatus.CloseExecutado && b.Saidas == 1 && b.Total == 2 && R.M.Side == "FLAT",
		   "C3 cursor apagado + T aberto: bootstrap no seq_open, CLOSE T aplicado, 0 entradas novas", string.Join(",", r3));

		// C4 cursor corrompido + seguidor FLAT ⇒ bootstrap em last_seq: nada reprocessa, nada executa
		b = new Broker(); d = Path.Combine(tmp, "c4"); R = new Robo(d, b); R.Cons.Bootstrap(2, t0);
		File.WriteAllText(Path.Combine(d, "cursor.json"), "lixo");
		R = new Robo(d, b); bool c4a = R.Cons.CursorCorrompido && R.M.TradeId == null;
		R.Cons.Bootstrap(6, tr, R.M.SeqOpen, R.M.EventIdOpen);
		var r4 = entregar(R);
		Ok(c4a && R.Cons.LastSeq == 6 && r4.All(s => s == AoEventoStatus.Antigo) && b.Total == 0 && b.Saidas == 0,
		   "C4 cursor corrompido + FLAT: bootstrap em last_seq=6, eventos = OLD, nada executa", string.Join(",", r4));

		// C5 intermediarios deduplicados: nova reentrega (e restart) depois da recuperacao = OLD/DUPLICATE, nenhum efeito extra
		b = new Broker(); d = Path.Combine(tmp, "c5"); R = montar(d, b);
		File.WriteAllText(Path.Combine(d, "cursor.json"), "{");
		R = new Robo(d, b); R.Cons.Bootstrap(6, tr, R.M.SeqOpen, R.M.EventIdOpen); entregar(R);
		int s0 = b.Saidas, e0 = b.Total;
		var r5 = entregar(R); R = new Robo(d, b); var r5b = entregar(R);
		Ok(r5.Concat(r5b).All(s => s == AoEventoStatus.Antigo || s == AoEventoStatus.Duplicado) && b.Saidas == s0 && b.Total == e0 && s0 == 1,
		   "C5 reentrega apos a recuperacao (mesma instancia e apos restart): so OLD/DUPLICATE, 1 saida no total, 0 entradas novas", string.Join(",", r5) + " | " + string.Join(",", r5b));
	}

	static JObject EvRaw(JObject baseEv, string action, string tid, string eid, long seq, DateTime created) { JObject r; EvSint(baseEv, action, tid, eid, seq, created, out r); return r; }

	// ═══ (2026-10-01) INC AOT_INVICTUS_CLOSE_DIVERGENCE — modelo do caminho Reconciliar → AoRoboSaida do AlfaOmegaRobo.cs (preso ao NT8,
	// fora das pecas puras): cache de posicoes com TTL 5 s (AoRoboPositions), refresh forcado ANTES do place (ExecutarEntradaCore),
	// desvio cancela o OCO, saida regra 0 (desvio ⇒ JaFechada) e regra 3 (conta FLAT ⇒ JaFechada). O guard e o REAL do staging
	// (AoRoboFechamento.SnapshotValeParaDesvio); motor seguidor e lifecycle (AoRoboFechamento) sao os REAIS. ═══
	class ReconSim
	{
		public bool Fix; public int TtlMs = 5000;
		// (RESIDUAL A) Ra = 2 leituras FLAT (AoRoboFechamento.AvaliarLeituraDesvio) + CLOSE revalida o broker (ClassificarBrokerNoClose + DecidirClose) — pecas REAIS
		public bool Ra, Legivel = true; public string Ultima; public int Divergencias, OrdemQty;
		public Dictionary<string, int> Broker = new Dictionary<string, int>();   // instrumento → qty assinada (SHORT < 0)
		Dictionary<string, int> _cache = new Dictionary<string, int>(); DateTime _stamp = DateTime.MinValue;
		public bool OcoVivo = true; public int OrdensSaida;
		public void Refresh(DateTime agora, bool force)
		{ if (!force && (agora - _stamp).TotalMilliseconds < TtlMs) return; _cache = new Dictionary<string, int>(Broker); _stamp = agora; }
		static string Lado(int q) { return q > 0 ? "LONG" : q < 0 ? "SHORT" : "FLAT"; }
		public void Reconciliar(JObject e, DateTime agora)
		{
			if ((bool)e["desvio"]) return;
			double age = (agora - _stamp).TotalMilliseconds;
			int q; _cache.TryGetValue((string)e["instrumento"], out q);
			if (Ra)
			{
				if (AoRoboFechamento.AvaliarLeituraDesvio(e, agora.AddMilliseconds(-(age < 0 ? 0 : age)), Lado(q), Math.Abs(q)) == AoRoboFechamento.LeituraConfirmado) OcoVivo = false;
				return;
			}
			if (Fix && !AoRoboFechamento.SnapshotValeParaDesvio(agora.AddMilliseconds(-(age < 0 ? 0 : age)), AoMotorCanonico.ParseIso(e["registrada_utc"]))) return;
			if (q == 0) { e["desvio"] = true; OcoVivo = false; }
		}
		public bool Saida(JObject e, DateTime agora)   // true = ordem de fechamento enviada
		{
			if (Ra)
			{
				if (Legivel) Refresh(agora, true);
				int qb; _cache.TryGetValue((string)e["instrumento"], out qb);
				int qf;
				string cls = AoRoboFechamento.ClassificarBrokerNoClose((string)e["side"], (int)e["qty"], Legivel, Legivel ? (agora - _stamp).TotalMilliseconds : -1, Lado(qb), Math.Abs(qb), out qf);
				Ultima = AoRoboFechamento.DecidirClose(e, _stamp, cls);
				if (Ultima == AoRoboFechamento.CloseDivergencia) Divergencias++;
				if (Ultima != AoRoboFechamento.CloseFechar) return false;
				OrdensSaida++; OrdemQty = qf; return true;
			}
			Refresh(agora, true);
			if ((bool)e["desvio"]) return false;
			int q; _cache.TryGetValue((string)e["instrumento"], out q);
			if (q == 0) return false;
			OrdensSaida++; return true;
		}
	}
	class CenarioRes { public bool Desvio, OcoVivo; public int Ordens, BrokerQty; public string Estado; public string MotorSide; }

	// t0 = ciclo da entrada (17:48:15.933Z); ciclo = intervalo entre ciclos do robo; stopEmMs = stop real do broker (null = nao);
	// saida: "fill" | "rejeitada" | "pendente"
	static CenarioRes Cenario(List<JObject> evs, string tmp, string nome, bool fix, int cicloMs, int? stopEmMs, string saida)
	{
		DateTime t0 = new DateTime(2026, 10, 1, 17, 48, 15, 933, DateTimeKind.Utc), tClose = new DateTime(2026, 10, 1, 17, 53, 50, 954, DateTimeKind.Utc);
		string d = Path.Combine(tmp, "cd-" + nome); Directory.CreateDirectory(d);
		var m = new AoMotorCanonico(Path.Combine(d, "motor.json"), Path.Combine(d, "hist"), new AoMotorParams()); m.LedgerDiferido = r => { };
		string erro, res;
		AoEventoAot eo = AoEventoAot.De(EvRaw(evs[0], "OPEN", "T1", "T1", 1, t0.AddSeconds(-1.4)), out erro); Aplicar(m, eo, out res);
		string side = m.Side, inst = "ES 12-26", intent = "AO-sim101-ES-" + nome;
		var sim = new ReconSim { Fix = fix };
		sim.Refresh(t0, true);                                                   // ExecutarEntradaCore L915: refresh forcado ANTES do place
		var e = new JObject { { "intentId", intent }, { "trade_id", "T1" }, { "side", side }, { "instrumento", inst }, { "qty", 1 }, { "desvio", false } };
		if (fix) e["registrada_utc"] = AoMotorCanonico.Iso(t0);                 // RegistrarExecucao (staging): carimbo no registro
		int sinal = side == "SHORT" ? -1 : 1;
		sim.Broker[inst] = sinal;                                                 // fill de entrada (17:48:16.4)
		var fe = new AoRoboFechamento(Path.Combine(d, "fech.json")) { Multiplicador = s => 50 };
		fe.RegistrarFill(intent, side == "LONG", 1, 7732.5, t0.AddMilliseconds(500), "AO|sim101|" + intent);
		for (DateTime c = t0.AddMilliseconds(cicloMs); c < tClose; c = c.AddMilliseconds(cicloMs))
		{
			if (stopEmMs.HasValue && c >= t0.AddMilliseconds(stopEmMs.Value) && sim.Broker[inst] != 0 && sim.OcoVivo) sim.Broker[inst] = 0;
			sim.Refresh(c, false); sim.Reconciliar(e, c);
		}
		AoEventoAot ec = AoEventoAot.De(EvRaw(evs[0], "CLOSE", "T1", "C1", 2, tClose.AddSeconds(-8)), out erro);
		AoMotorTick tk = Aplicar(m, ec, out res);
		fe.Decidir((JObject)tk.Trade, new List<JObject> { e }, null, tClose);
		bool enviou = sim.Saida(e, tClose);
		if (!enviou) fe.Perna(intent, AoPernaEvento.FlatJaFechada, tClose, "desvio/conta FLAT");
		else if (saida == "fill") { sim.Broker[inst] = 0; fe.RegistrarFill(intent, side != "LONG", 1, 7731.25, tClose.AddMilliseconds(200), "AO|sim101|" + intent + "|X"); fe.Perna(intent, AoPernaEvento.FlatVerificado, tClose.AddMilliseconds(300), "flatten_ok"); }
		else if (saida == "rejeitada") fe.Perna(intent, AoPernaEvento.Falha, tClose.AddMilliseconds(300), "Rejected");
		else fe.Perna(intent, AoPernaEvento.Pendente, tClose.AddMilliseconds(300), "flatten_sent");
		List<JObject> tr; fe.Avaliar(tClose.AddSeconds(30), out tr);
		string estado = fe.Pendentes == 0 ? AoFechamentoEstado.Closed : (string)((JArray)fe.Snapshot()["pendentes"])[0]["estado"];
		return new CenarioRes { Desvio = (bool)e["desvio"], OcoVivo = sim.OcoVivo, Ordens = sim.OrdensSaida, BrokerQty = sim.Broker[inst], Estado = estado, MotorSide = m.Side };
	}

	static void CloseDivergence(List<JObject> evs, string tmp)
	{
		DateTime reg = new DateTime(2026, 10, 1, 17, 48, 15, 933, DateTimeKind.Utc);
		// ── R) guard puro ──
		Ok(!AoRoboFechamento.SnapshotValeParaDesvio(reg, reg), "R1 snapshot do cache pre-entrada (17:48:15.933) lido no ciclo 17:48:18.844 NAO vale para desvio");
		Ok(!AoRoboFechamento.SnapshotValeParaDesvio(reg.AddMilliseconds(4900), reg), "R2 snapshot registro+4.9 s NAO vale");
		Ok(AoRoboFechamento.SnapshotValeParaDesvio(reg.AddMilliseconds(6200), reg), "R3 snapshot registro+6.2 s vale");
		Ok(AoRoboFechamento.SnapshotValeParaDesvio(reg.AddMilliseconds(5000), reg), "R4 snapshot registro+5.0 s (limite) vale");
		Ok(AoRoboFechamento.SnapshotValeParaDesvio(reg, null) && AoRoboFechamento.SnapshotValeParaDesvio(DateTime.MinValue, null), "R5 registro legado sem registrada_utc = comportamento anterior (vale)");

		// ── REG) reproducao do FIRST_BAD (ciclo +2.9 s dentro do TTL) antes × depois ──
		CenarioRes a = Cenario(evs, tmp, "bad-antes", false, 2900, null, "fill");
		Ok(a.Desvio && !a.OcoVivo && a.Ordens == 0 && a.BrokerQty != 0 && a.Estado == AoFechamentoEstado.Closed && a.MotorSide == "FLAT",
		   "REG1 ANTES do fix reproduz o incidente: desvio falso, OCO cancelado, CLOSE sem ordem, lifecycle CLOSED com broker ABERTO",
		   a.Desvio + "/" + a.OcoVivo + "/" + a.Ordens + "/" + a.BrokerQty + "/" + a.Estado);
		CenarioRes b = Cenario(evs, tmp, "bad-depois", true, 2900, null, "fill");
		Ok(!b.Desvio && b.OcoVivo && b.Ordens == 1, "REG2 DEPOIS do fix: desvio NAO nasce, OCO preservado, CLOSE envia 1 ordem de saida", b.Desvio + "/" + b.OcoVivo + "/" + b.Ordens);
		Ok(b.BrokerQty == 0 && b.Estado == AoFechamentoEstado.Closed && b.MotorSide == "FLAT", "T12 CLOSE preenchido: AOT/seguidor FLAT + lifecycle CLOSED + broker FLAT juntos", b.BrokerQty + "/" + b.Estado + "/" + b.MotorSide);
		// ── LAST_GOOD (ciclo +6.2 s > TTL): correto antes e depois ──
		CenarioRes g0 = Cenario(evs, tmp, "good-antes", false, 6200, null, "fill"), g1 = Cenario(evs, tmp, "good-depois", true, 6200, null, "fill");
		Ok(!g0.Desvio && g0.Ordens == 1 && g0.BrokerQty == 0 && !g1.Desvio && g1.Ordens == 1 && g1.BrokerQty == 0 && g1.Estado == AoFechamentoEstado.Closed,
		   "REG3 LAST_GOOD (+6.2 s): sem desvio e saida preenchida antes E depois do fix");
		// ── stop real do broker depois da margem continua detectado (o fix nao cega o desvio legitimo) ──
		CenarioRes s = Cenario(evs, tmp, "stop-real", true, 2900, 12000, "fill");
		Ok(s.Desvio && s.Ordens == 0 && s.BrokerQty == 0 && s.Estado == AoFechamentoEstado.Closed, "REG4 stop real (FLAT lido apos registro+5 s) ainda marca desvio; CLOSE sem ordem e broker FLAT", s.Desvio + "/" + s.Ordens + "/" + s.BrokerQty);
		// ── T8/T9: saida rejeitada ou nao verificada com broker ABERTO nunca vira CLOSED ──
		CenarioRes r = Cenario(evs, tmp, "rejeitada", true, 2900, null, "rejeitada");
		Ok(r.BrokerQty != 0 && r.Estado == AoFechamentoEstado.ExitFailedRetry, "T8 CLOSE rejeitado NAO marca FLAT: EXIT_FAILED_RETRY com broker aberto", r.Estado);
		CenarioRes p = Cenario(evs, tmp, "pendente", true, 2900, null, "pendente");
		Ok(p.BrokerQty != 0 && p.MotorSide == "FLAT" && p.Estado == AoFechamentoEstado.ExitPending,
		   "T9 broker OPEN + interno FLAT (saida nao verificada) fica EXIT_PENDING (flatten_retry), nunca CLOSED silencioso", p.Estado);
		// ── T7: parcial (1 de 2 pernas FLAT) continua aberto ──
		var fe = new AoRoboFechamento(Path.Combine(tmp, "cd-parcial.json"));
		var rec = new JObject { { "trade_id", "TP" }, { "openedAt", "2026-10-01T17:48:14.548Z" }, { "closedAt", "2026-10-01T17:53:42.738Z" }, { "side", "SHORT" }, { "reason", "anchor_neutro" } };
		var l1 = new JObject { { "intentId", "P1" }, { "trade_id", "TP" }, { "side", "SHORT" }, { "qty", 1 } };
		var l2 = new JObject { { "intentId", "P2" }, { "trade_id", "TP" }, { "side", "SHORT" }, { "qty", 1 } };
		fe.Decidir(rec, new List<JObject> { l1, l2 }, null, reg); fe.Perna("P1", AoPernaEvento.FlatVerificado, reg, "flatten_ok");
		List<JObject> tr; fe.Avaliar(reg.AddSeconds(30), out tr);
		Ok(fe.Pendentes == 1 && (string)((JArray)fe.Snapshot()["pendentes"])[0]["estado"] == AoFechamentoEstado.ExitPartial, "T7 1/2 pernas FLAT = EXIT_PARTIAL (continua aberto ate zerar)");
	}

	// ═══ (2026-10-01) RESIDUAL A — leitura FLAT fresca porem errada. brokerEm(ms desde t0) = qty no NOSSO lado (negativo = lado oposto,
	// null = sem mudanca); noClose ajusta conta/leitura no instante do CLOSE. ra=false = so o patch 1 (freshness guard). ═══
	class CenarioResRa : CenarioRes { public string Decisao; public int Divergencias, OrdemQty; public bool CandidatoVisto; }
	static CenarioResRa CenarioRa(List<JObject> evs, string tmp, string nome, bool ra, int cicloMs, Func<double, int?> brokerEm, string saida,
								  int qtyPerna = 1, Action<ReconSim, string, int> noClose = null)
	{
		DateTime t0 = new DateTime(2026, 10, 1, 17, 48, 15, 933, DateTimeKind.Utc), tClose = new DateTime(2026, 10, 1, 17, 53, 50, 954, DateTimeKind.Utc);
		string d = Path.Combine(tmp, "ra-" + nome); Directory.CreateDirectory(d);
		var m = new AoMotorCanonico(Path.Combine(d, "motor.json"), Path.Combine(d, "hist"), new AoMotorParams()); m.LedgerDiferido = r => { };
		string erro, res;
		AoEventoAot eo = AoEventoAot.De(EvRaw(evs[0], "OPEN", "T1", "T1", 1, t0.AddSeconds(-1.4)), out erro); Aplicar(m, eo, out res);
		string side = m.Side, inst = "ES 12-26", intent = "AO-sim101-ES-ra-" + nome;
		int sinal = side == "SHORT" ? -1 : 1;
		var sim = new ReconSim { Fix = true, Ra = ra };
		Action<double> aplicar = ms => { int? v = brokerEm(ms); if (v.HasValue) sim.Broker[inst] = sinal * v.Value; };
		aplicar(0);
		sim.Refresh(t0, true);                                                   // refresh forcado ANTES do place
		var e = new JObject { { "intentId", intent }, { "trade_id", "T1" }, { "side", side }, { "instrumento", inst }, { "qty", qtyPerna }, { "desvio", false },
							  { "registrada_utc", AoMotorCanonico.Iso(t0) } };
		var fe = new AoRoboFechamento(Path.Combine(d, "fech.json")) { Multiplicador = s => 50 };
		fe.RegistrarFill(intent, side == "LONG", qtyPerna, 7732.5, t0.AddMilliseconds(500), "AO|sim101|" + intent);
		bool cand = false;
		for (DateTime c = t0.AddMilliseconds(cicloMs); c < tClose; c = c.AddMilliseconds(cicloMs))
		{
			aplicar((c - t0).TotalMilliseconds);
			sim.Refresh(c, false); sim.Reconciliar(e, c);
			if (e[AoRoboFechamento.CampoDesvioCandidato] != null) cand = true;
		}
		if (noClose != null) noClose(sim, inst, sinal);
		AoEventoAot ec = AoEventoAot.De(EvRaw(evs[0], "CLOSE", "T1", "C1", 2, tClose.AddSeconds(-8)), out erro);
		AoMotorTick tk = Aplicar(m, ec, out res);
		fe.Decidir((JObject)tk.Trade, new List<JObject> { e }, null, tClose);
		bool desvioAntesClose = (bool)e["desvio"];
		bool enviou = sim.Saida(e, tClose);
		string dec = ra ? sim.Ultima : (enviou ? AoRoboFechamento.CloseFechar : AoRoboFechamento.CloseJaFechada);
		if (dec == AoRoboFechamento.CloseFechar)
		{
			int qx = ra ? sim.OrdemQty : qtyPerna;
			if (saida == "fill")
			{
				sim.Broker[inst] -= sinal * qx;
				fe.RegistrarFill(intent, side != "LONG", qx, 7731.25, tClose.AddMilliseconds(200), "AO|sim101|" + intent + "|X");
				fe.Perna(intent, AoPernaEvento.FlatVerificado, tClose.AddMilliseconds(300), "flatten_ok");
			}
			else if (saida == "rejeitada") fe.Perna(intent, AoPernaEvento.Falha, tClose.AddMilliseconds(300), "Rejected");
			else fe.Perna(intent, AoPernaEvento.Pendente, tClose.AddMilliseconds(300), "flatten_sent");
		}
		else if (dec == AoRoboFechamento.CloseJaFechada) fe.Perna(intent, AoPernaEvento.FlatJaFechada, tClose, "conta FLAT");
		else if (dec == AoRoboFechamento.CloseAguardarFlat) fe.Perna(intent, AoPernaEvento.Pendente, tClose, "FLAT a confirmar");
		else fe.Perna(intent, AoPernaEvento.Falha, tClose, dec);
		List<JObject> tr; fe.Avaliar(tClose.AddSeconds(30), out tr);
		string estado = fe.Pendentes == 0 ? AoFechamentoEstado.Closed : (string)((JArray)fe.Snapshot()["pendentes"])[0]["estado"];
		return new CenarioResRa { Desvio = desvioAntesClose, OcoVivo = sim.OcoVivo, Ordens = sim.OrdensSaida, BrokerQty = sim.Broker[inst], Estado = estado, MotorSide = m.Side,
								  Decisao = dec, Divergencias = sim.Divergencias, OrdemQty = sim.OrdemQty, CandidatoVisto = cand };
	}
	static string Fmt(CenarioResRa r) { return "desvio=" + r.Desvio + " oco=" + r.OcoVivo + " ordens=" + r.Ordens + " qty=" + r.OrdemQty + " broker=" + r.BrokerQty + " estado=" + r.Estado + " dec=" + r.Decisao + " motor=" + r.MotorSide + " cand=" + r.CandidatoVisto; }

	static void ResidualA(List<JObject> evs, string tmp)
	{
		DateTime t0 = new DateTime(2026, 10, 1, 17, 48, 15, 933, DateTimeKind.Utc);
		Func<JObject> perna = () => new JObject { { "intentId", "RA" }, { "side", "SHORT" }, { "qty", 1 }, { "desvio", false }, { "registrada_utc", AoMotorCanonico.Iso(t0) } };
		string C = AoRoboFechamento.CampoDesvioCandidato;

		// ── RA) camada 1: confirmacao em 2 leituras (peca pura real) ──
		JObject e1 = perna();
		string r1 = AoRoboFechamento.AvaliarLeituraDesvio(e1, t0.AddSeconds(6), "FLAT", 0);
		Ok(r1 == AoRoboFechamento.LeituraCandidato && !(bool)e1["desvio"] && (string)e1[C] == AoMotorCanonico.Iso(t0.AddSeconds(6)),
		   "RA1 1a leitura FLAT fresca (registro+6 s) = so CANDIDATO; desvio=false", r1 + " " + e1.ToString(Newtonsoft.Json.Formatting.None));
		CenarioResRa ra1 = CenarioRa(evs, tmp, "ra1", true, 2900, ms => ms >= 10000 && ms < 12000 ? 0 : 1, "fill");
		Ok(ra1.CandidatoVisto && !ra1.Desvio && ra1.OcoVivo, "RA1 no fluxo: candidato gravado, desvio=false, OCO VIVO (proteção nao cancelada)", Fmt(ra1));
		string r2 = AoRoboFechamento.AvaliarLeituraDesvio(e1, t0.AddSeconds(11.8), "FLAT", 0);
		Ok(r2 == AoRoboFechamento.LeituraConfirmado && (bool)e1["desvio"] && e1[AoRoboFechamento.CampoDesvioConfirmado] != null, "RA2 2a leitura FLAT de refresh posterior = desvio confirmado", r2);
		JObject e3 = perna(); AoRoboFechamento.AvaliarLeituraDesvio(e3, t0.AddSeconds(6), "FLAT", 0);
		string r3a = AoRoboFechamento.AvaliarLeituraDesvio(e3, t0.AddSeconds(6), "FLAT", 0);
		string r3b = AoRoboFechamento.AvaliarLeituraDesvio(e3, t0.AddSeconds(6).AddMilliseconds(2), "FLAT", 0);   // mesmo snapshot reconstruido com jitter de arredondamento
		Ok(r3a == AoRoboFechamento.LeituraRepetida && r3b == AoRoboFechamento.LeituraRepetida && !(bool)e3["desvio"], "RA3 mesmo snapshot repetido (inclusive +2 ms de arredondamento) NAO confirma", r3a + "/" + r3b);
		JObject e4 = perna(); AoRoboFechamento.AvaliarLeituraDesvio(e4, t0.AddSeconds(6), "FLAT", 0);
		string r4 = AoRoboFechamento.AvaliarLeituraDesvio(e4, t0.AddSeconds(11.8), "SHORT", 1);
		string r4b = AoRoboFechamento.AvaliarLeituraDesvio(e4, t0.AddSeconds(17.6), "FLAT", 0);
		Ok(r4 == AoRoboFechamento.LeituraLimpo && r4b == AoRoboFechamento.LeituraCandidato && !(bool)e4["desvio"], "RA4 candidato FLAT → leitura OPEN limpa o candidato; FLAT seguinte recomeca do zero (desvio=false)", r4 + "/" + r4b);
		// RA5: FLAT transitorio (reconexao 10-12 s) e lido UMA vez por um refresh real (11.6 s); antes (so patch 1) isso ja era desvio
		CenarioResRa ra5a = CenarioRa(evs, tmp, "ra5-antes", false, 2900, ms => ms >= 10000 && ms < 12000 ? 0 : 1, "fill");
		CenarioResRa ra5 = CenarioRa(evs, tmp, "ra5", true, 2900, ms => ms >= 10000 && ms < 12000 ? 0 : 1, "fill");
		Ok(ra5a.Desvio && !ra5a.OcoVivo && ra5a.Ordens == 0 && ra5a.BrokerQty != 0 && ra5a.Estado == AoFechamentoEstado.Closed,
		   "RA5 ANTES (so patch 1): FLAT transitorio fresco reproduz o residual A — desvio, OCO cancelado, CLOSE sem ordem, CLOSED com broker ABERTO", Fmt(ra5a));
		Ok(!ra5.Desvio && ra5.OcoVivo && ra5.Ordens == 1 && ra5.BrokerQty == 0 && ra5.Estado == AoFechamentoEstado.Closed && ra5.MotorSide == "FLAT",
		   "RA5 DEPOIS: FLAT transitorio durante reconexao → OPEN = nenhum desvio, OCO vivo, CLOSE fecha (AOT/interno/broker FLAT)", Fmt(ra5));
		// RA6: entrada a mercado preenche so em 7 s (> DesvioGraceSec); o refresh de 5.8 s le FLAT valido
		CenarioResRa ra6a = CenarioRa(evs, tmp, "ra6-antes", false, 2900, ms => ms < 7000 ? 0 : 1, "fill");
		CenarioResRa ra6 = CenarioRa(evs, tmp, "ra6", true, 2900, ms => ms < 7000 ? 0 : 1, "fill");
		Ok(ra6a.Desvio && ra6a.Ordens == 0 && ra6a.BrokerQty != 0, "RA6 ANTES (so patch 1): fill > 5 s reproduz o residual A (desvio + broker aberto)", Fmt(ra6a));
		Ok(ra6.CandidatoVisto && !ra6.Desvio && ra6.OcoVivo && ra6.Ordens == 1 && ra6.BrokerQty == 0 && ra6.Estado == AoFechamentoEstado.Closed,
		   "RA6 DEPOIS: fill > 5 s — uma unica leitura FLAT NAO gera desvio permanente; CLOSE fecha", Fmt(ra6));
		// persistencia: o candidato sobrevive a restart (motor-execucoes.json) e a confirmacao continua exigindo refresh posterior
		JObject e7 = perna(); AoRoboFechamento.AvaliarLeituraDesvio(e7, t0.AddSeconds(6), "FLAT", 0);
		// mesma leitura do CarregarExecucoes do robo (JsonTextReader DateParseHandling.None) e, por defesa, a leitura padrao (token Date)
		JObject e7r;
		using (var jr = new Newtonsoft.Json.JsonTextReader(new StringReader(e7.ToString())) { DateParseHandling = Newtonsoft.Json.DateParseHandling.None }) e7r = JObject.Load(jr);
		JObject e7d = JObject.Parse(e7.ToString());
		string r7a = AoRoboFechamento.AvaliarLeituraDesvio(e7r, t0.AddSeconds(6), "FLAT", 0), r7b = AoRoboFechamento.AvaliarLeituraDesvio(e7r, t0.AddSeconds(12), "FLAT", 0);
		string r7c = AoRoboFechamento.AvaliarLeituraDesvio(e7d, t0.AddSeconds(6), "FLAT", 0);
		Ok(r7a == AoRoboFechamento.LeituraRepetida && r7b == AoRoboFechamento.LeituraConfirmado && r7c == AoRoboFechamento.LeituraRepetida,
		   "RA7 candidato persistido sobrevive a restart; mesmo snapshot nao confirma (string ou Date), refresh posterior confirma", r7a + "/" + r7b + "/" + r7c);
		JObject e8 = perna(); e8.Remove("registrada_utc");
		string r8 = AoRoboFechamento.AvaliarLeituraDesvio(e8, t0, "FLAT", 0);
		Ok(r8 == AoRoboFechamento.LeituraCandidato && !(bool)e8["desvio"], "RA8 registro legado (sem registrada_utc) tambem exige 2 leituras (residual B reduzido)", r8);
		JObject e9 = perna();
		Ok(AoRoboFechamento.AvaliarLeituraDesvio(e9, t0.AddSeconds(3), "FLAT", 0) == AoRoboFechamento.LeituraIgnorada && e9[C] == null, "RA9 FLAT anterior a registro+5 s continua ignorada (freshness guard do patch 1 preservado)");

		// ── RC) camada 2: CLOSE com desvio=true revalida o broker ──
		// desvio legitimo: stop real/saida manual em 12 s (conta fica FLAT) — 2 leituras FLAT confirmam
		Func<double, int?> stopReal = ms => ms >= 12000 ? 0 : 1;
		CenarioResRa rc1 = CenarioRa(evs, tmp, "rc1", true, 2900, stopReal, "fill");
		Ok(rc1.Desvio && rc1.Decisao == AoRoboFechamento.CloseJaFechada && rc1.Ordens == 0 && rc1.BrokerQty == 0 && rc1.Estado == AoFechamentoEstado.Closed,
		   "RC1 desvio=true + CLOSE + broker FLAT (leitura fresca) → JaFechada, 0 ordens, CLOSED", Fmt(rc1));
		// desvio confirmado por reconexao LONGA (10-25 s: 3 refreshes FLAT) mas a posicao voltou: broker OPEN no CLOSE
		Func<double, int?> reconLonga = ms => ms >= 10000 && ms < 25000 ? 0 : 1;
		CenarioResRa rc2a = CenarioRa(evs, tmp, "rc2-antes", false, 2900, reconLonga, "fill");
		CenarioResRa rc2 = CenarioRa(evs, tmp, "rc2", true, 2900, reconLonga, "pendente");
		Ok(rc2a.Desvio && rc2a.Ordens == 0 && rc2a.BrokerQty != 0 && rc2a.Estado == AoFechamentoEstado.Closed, "RC2 ANTES (desvio ⇒ JaFechada cega): CLOSE consumido sem ordem, broker ABERTO silencioso", Fmt(rc2a));
		Ok(rc2.Desvio && rc2.Decisao == AoRoboFechamento.CloseFechar && rc2.Ordens == 1 && rc2.OrdemQty == 1, "RC2 desvio=true + CLOSE + broker OPEN mesmo lado → 1 ordem de saida (qty da perna)", Fmt(rc2));
		CenarioResRa rc3 = CenarioRa(evs, tmp, "rc3", true, 2900, reconLonga, "fill");
		Ok(rc3.Ordens == 1 && rc3.MotorSide == "FLAT" && rc3.Estado == AoFechamentoEstado.Closed && rc3.BrokerQty == 0, "RC3 mesmo cenario + fill → AOT FLAT, interno CLOSED/FLAT, broker FLAT", Fmt(rc3));
		CenarioResRa rc4 = CenarioRa(evs, tmp, "rc4", true, 2900, reconLonga, "rejeitada");
		Ok(rc4.Ordens == 1 && rc4.Estado == AoFechamentoEstado.ExitFailedRetry && rc4.BrokerQty != 0, "RC4 CLOSE rejeitado → EXIT_FAILED_RETRY, nunca CLOSED", Fmt(rc4));
		CenarioResRa rc5 = CenarioRa(evs, tmp, "rc5", true, 2900, reconLonga, "fill", 1, (s, i, sg) => { s.Legivel = false; });
		int qz;
		Ok(rc5.Decisao == AoRoboFechamento.CloseSemLeitura && rc5.Ordens == 0 && rc5.Estado == AoFechamentoEstado.ExitFailedRetry
		   && AoRoboFechamento.ClassificarBrokerNoClose("SHORT", 1, true, 3000, "FLAT", 0, out qz) == AoRoboFechamento.BrokerIlegivel,
		   "RC5 broker sem leitura (ou leitura nao fresca, 3 s) → SEM_LEITURA, 0 ordens, EXIT_FAILED_RETRY — nunca CLOSED", Fmt(rc5));
		CenarioResRa rc6 = CenarioRa(evs, tmp, "rc6", true, 2900, stopReal, "fill", 1, (s, i, sg) => { s.Broker[i] = -sg * 1; });
		CenarioResRa rc6b = CenarioRa(evs, tmp, "rc6b", true, 2900, ms => 1, "fill", 1, (s, i, sg) => { s.Broker[i] = -sg * 2; });
		Ok(rc6.Desvio && rc6.Decisao == AoRoboFechamento.CloseDivergencia && rc6.Ordens == 0 && rc6.Divergencias == 1 && rc6.Estado == AoFechamentoEstado.ExitFailedRetry
		   && !rc6b.Desvio && rc6b.Decisao == AoRoboFechamento.CloseDivergencia && rc6b.Ordens == 0 && rc6b.Estado == AoFechamentoEstado.ExitFailedRetry,
		   "RC6 broker no lado OPOSTO (com e sem desvio) → nenhuma ordem, BROKER_INTERNAL_DIVERGENCE, perna em falha (nunca CLOSED)", Fmt(rc6) + " | " + Fmt(rc6b));
		CenarioResRa rc7 = CenarioRa(evs, tmp, "rc7", true, 2900, ms => ms >= 10000 && ms < 25000 ? 0 : 3, "fill");
		int q7a, q7b, q7c;
		AoRoboFechamento.ClassificarBrokerNoClose("SHORT", 1, true, 0, "SHORT", 3, out q7a);
		AoRoboFechamento.ClassificarBrokerNoClose("SHORT", 2, true, 0, "SHORT", 1, out q7b);
		string c7c = AoRoboFechamento.ClassificarBrokerNoClose("SHORT", 0, true, 0, "SHORT", 3, out q7c);
		Ok(rc7.Ordens == 1 && rc7.OrdemQty == 1 && Math.Abs(rc7.BrokerQty) == 2 && q7a == 1 && q7b == 1
		   && c7c == AoRoboFechamento.BrokerDivergente && q7c == 0,
		   "RC7 broker qty 3 > perna 1 → ordem de 1 (contratos alheios intactos); conta 1 < perna 2 → 1; perna sem qty → divergencia, 0", Fmt(rc7) + " q=" + q7a + "/" + q7b + "/" + c7c);
		// CLOSE sem desvio e conta FLAT tambem exige 2 leituras (o mesmo FLAT transitorio no instante do CLOSE)
		JObject e10 = perna();
		string d10a = AoRoboFechamento.DecidirClose(e10, t0.AddSeconds(300), AoRoboFechamento.BrokerFlat);
		string d10b = AoRoboFechamento.DecidirClose(e10, t0.AddSeconds(300), AoRoboFechamento.BrokerFlat);
		string d10c = AoRoboFechamento.DecidirClose(e10, t0.AddSeconds(303), AoRoboFechamento.BrokerFlat);
		JObject e11 = perna(); AoRoboFechamento.DecidirClose(e11, t0.AddSeconds(300), AoRoboFechamento.BrokerFlat);
		string d11 = AoRoboFechamento.DecidirClose(e11, t0.AddSeconds(303), AoRoboFechamento.BrokerMesmoLado);
		Ok(d10a == AoRoboFechamento.CloseAguardarFlat && d10b == AoRoboFechamento.CloseAguardarFlat && d10c == AoRoboFechamento.CloseJaFechada
		   && d11 == AoRoboFechamento.CloseFechar && e11[C] == null,
		   "RC8 CLOSE sem desvio + conta FLAT: 1a leitura = PENDENTE (sem ordem, sem CLOSED), mesmo snapshot nao confirma, 2a leitura confirma; OPEN no retry fecha e limpa o candidato",
		   d10a + "/" + d10b + "/" + d10c + "/" + d11);
		// regressoes do residual A
		CenarioResRa man = CenarioRa(evs, tmp, "manual", true, 2900, ms => ms >= 60000 ? 0 : 1, "fill");
		Ok(man.Desvio && man.Ordens == 0 && man.BrokerQty == 0 && man.Estado == AoFechamentoEstado.Closed && man.Divergencias == 0,
		   "MAN1 fechamento MANUAL da posicao do robo: desvio confirmado, CLOSE sem ordem (nunca inverte), broker FLAT, CLOSED sem fill externo atribuido", Fmt(man));
		CenarioResRa lg = CenarioRa(evs, tmp, "lastgood", true, 6200, ms => 1, "fill");
		Ok(!lg.Desvio && !lg.CandidatoVisto && lg.Ordens == 1 && lg.BrokerQty == 0 && lg.Estado == AoFechamentoEstado.Closed, "REG5 LAST_GOOD (+6.2 s) com residual A: sem candidato, saida preenchida, FLAT/FLAT", Fmt(lg));
		CenarioResRa fb = CenarioRa(evs, tmp, "firstbad", true, 2900, ms => 1, "fill");
		Ok(!fb.Desvio && fb.OcoVivo && fb.Ordens == 1 && fb.BrokerQty == 0 && fb.Estado == AoFechamentoEstado.Closed, "REG6 FIRST_BAD real (+2.9 s, cache pre-entrada) com residual A: nao reproduz", Fmt(fb));
	}

	// ── (2026-10-01) RESIDUAL_A2_REPROTECTION_GAP: modelo do ReavaliarDesvio do Robo (o wiring real e provado por W7 em test_wiring.js)
	// sobre as pecas PURAS reais (ClassificarReversaoDesvio / DecidirReprotecao / MarcarDesvioRevertido) + broker simulado.
	class A2Sim { public string BrokerSide = "FLAT"; public int BrokerQty; public HashSet<string> Stops = new HashSet<string>(); public bool RejeitaStop; public int Ordens, Fechamentos, FechQty; }
	static string A2Reavaliar(JObject e, A2Sim s, bool leituraOk, double ageMs, DateTime snap, double? preco, int qtyOutras)
	{
		int qp;
		string cls = AoRoboFechamento.ClassificarReversaoDesvio(e, leituraOk, ageMs, AoRoboFechamento.LeituraCloseMaxAgeMs, snap, s.BrokerSide, s.BrokerQty, qtyOutras, out qp);
		if (cls != AoRoboFechamento.RevMesmoLado) return cls;
		string intent = (string)e["intentId"];
		bool fechVivo = e["x_order_id"] != null && e["x_order_id"].Type != JTokenType.Null;
		double? stopLevel = e["stop_level"] == null || e["stop_level"].Type == JTokenType.Null ? (double?)null : (double)e["stop_level"];
		string dec = AoRoboFechamento.DecidirReprotecao((string)e["side"], stopLevel, preco, s.Stops.Contains(intent), fechVivo);
		if (dec == AoRoboFechamento.ReprotecaoAguardar) return dec;
		if (dec == AoRoboFechamento.ReprotecaoJaProtegida) { AoRoboFechamento.MarcarDesvioRevertido(e, snap); return dec; }
		if (dec == AoRoboFechamento.ReprotegerStop)
		{
			s.Ordens++;
			if (!s.RejeitaStop) { s.Stops.Add(intent); AoRoboFechamento.MarcarDesvioRevertido(e, snap); e["qty_protegida"] = qp; return "REPROTEGIDA"; }
		}
		s.Ordens++; s.Fechamentos++; s.FechQty = qp; s.BrokerQty -= qp; if (s.BrokerQty <= 0) s.BrokerSide = "FLAT";
		e["x_order_id"] = "X-" + intent;
		return "FECHADA_PERNA";
	}
	static void ResidualA2()
	{
		DateTime t0 = new DateTime(2026, 10, 1, 17, 48, 15, 933, DateTimeKind.Utc);
		Func<JObject> pernaDesvio = () =>
		{
			var p = new JObject { { "intentId", "RA2" }, { "side", "SHORT" }, { "qty", 1 }, { "stop_level", 7745.0 }, { "desvio", false }, { "registrada_utc", AoMotorCanonico.Iso(t0) } };
			AoRoboFechamento.AvaliarLeituraDesvio(p, t0.AddSeconds(6), "FLAT", 0);       // residual A: 1a FLAT = candidato
			AoRoboFechamento.AvaliarLeituraDesvio(p, t0.AddSeconds(11.8), "FLAT", 0);    // 2a FLAT independente = desvio confirmado (OCO cancelada no Robo)
			return p;
		};
		DateTime conf = t0.AddSeconds(11.8), depois = conf.AddSeconds(3);
		string F(JObject e, A2Sim s) { return "desvio=" + e["desvio"] + " stops=" + s.Stops.Count + " ordens=" + s.Ordens + " fech=" + s.Fechamentos + "/" + s.FechQty + " broker=" + s.BrokerSide + " " + s.BrokerQty; }

		JObject e0 = pernaDesvio();
		Ok((bool)e0["desvio"] && e0[AoRoboFechamento.CampoDesvioConfirmado] != null, "RA2-0 pre-condicao: desvio confirmado pelo residual A (2 leituras FLAT)");

		// RA2-1 broker volta ABERTO no mesmo lado (fresco, posterior) ⇒ DESVIO_REVERTIDO ⇒ (A2B, OcoReuseAceito=false) fecha SO a perna 1x, nunca tenta stop
		Ok(!AoRoboFechamento.OcoReuseAceito && AoRoboFechamento.DecidirReprotecao("SHORT", 7745, 7735, false, false) == AoRoboFechamento.ReprotecaoFechar,
		   "RA2-A2B OcoReuseAceito=false ⇒ DecidirReprotecao nunca devolve REPROTEGER (stop com OCO reusado seria rejeitado, possivelmente depois do timeout)");
		JObject e1 = pernaDesvio(); var s1 = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1 };
		string a1 = A2Reavaliar(e1, s1, true, 200, depois, 7735, 0);
		string a1b = A2Reavaliar(e1, s1, true, 200, depois.AddSeconds(3), 7735, 0);
		Ok(a1 == "FECHADA_PERNA" && (bool)e1["desvio"] && e1["x_order_id"] != null && s1.Stops.Count == 0 && s1.Ordens == 1 && s1.Fechamentos == 1 && s1.FechQty == 1
		   && s1.BrokerQty == 0 && a1b == AoRoboFechamento.RevFlat && s1.Ordens == 1,
		   "RA2-1 desvio confirmado + broker volta SHORT 1x (fresco, posterior) ⇒ DESVIO_REVERTIDO ⇒ fecha so a perna (1 ordem, 0 stops), desvio mantido com x_order_id; leitura seguinte FLAT = nada", a1 + "/" + a1b + " " + F(e1, s1));
		var s1q = new A2Sim { BrokerSide = "SHORT", BrokerQty = 2 }; JObject e1q = pernaDesvio(); e1q["qty"] = 2;
		string a1q = A2Reavaliar(e1q, s1q, true, 200, depois, 7735, 1);   // outra perna viva SHORT 1x na mesma conta
		Ok(a1q == "FECHADA_PERNA" && s1q.FechQty == 1 && s1q.Stops.Count == 0 && s1q.BrokerQty == 1, "RA2-1b qty do fechamento = min(perna, conta - outras pernas vivas); a outra perna fica intacta", a1q + " " + F(e1q, s1q));

		// RA2-2 stop do robo ja ativo ⇒ nao re-protege (sem empilhar); fechamento do robo vivo ⇒ aguarda
		JObject e2 = pernaDesvio(); var s2 = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1 }; s2.Stops.Add("RA2");
		string a2 = A2Reavaliar(e2, s2, true, 200, depois, 7735, 0);
		Ok(a2 == AoRoboFechamento.ReprotecaoJaProtegida && s2.Stops.Count == 1 && s2.Ordens == 0 && !(bool)e2["desvio"],
		   "RA2-2 stop do robo (oco=intentId) ja ativo ⇒ JA_PROTEGIDA: 0 ordens, sem empilhar, desvio revertido", a2 + " " + F(e2, s2));
		JObject e2b = pernaDesvio(); e2b["x_order_id"] = "X-vivo"; var s2b = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1 };
		string a2b = A2Reavaliar(e2b, s2b, true, 200, depois, 7735, 0);
		Ok(a2b == AoRoboFechamento.ReprotecaoAguardar && s2b.Ordens == 0 && (bool)e2b["desvio"], "RA2-2b fechamento do robo vivo/preenchido ⇒ AGUARDAR: 0 ordens, desvio mantido (nunca duplica)", a2b + " " + F(e2b, s2b));

		// RA2-3 (A2B) broker que rejeitaria o stop ⇒ o robo nunca tenta o stop: fecha SO a perna; preco ja alem do hard stop / sem stop_level ⇒ fecha direto
		JObject e3 = pernaDesvio(); var s3 = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1, RejeitaStop = true };
		string a3 = A2Reavaliar(e3, s3, true, 200, depois, 7735, 0);
		string a3b = A2Reavaliar(e3, s3, true, 200, depois.AddSeconds(3), 7735, 0);
		Ok(a3 == "FECHADA_PERNA" && s3.Stops.Count == 0 && s3.Ordens == 1 && s3.Fechamentos == 1 && s3.FechQty == 1 && s3.BrokerQty == 0 && (bool)e3["desvio"]
		   && a3b == AoRoboFechamento.RevFlat && s3.Ordens == 1,
		   "RA2-3 nunca tenta stop (Ordens=1, Stops=0): fechamento so da perna (1x), desvio mantido com x_order_id; leitura seguinte FLAT = nada", a3 + "/" + a3b + " " + F(e3, s3));
		JObject e3c = pernaDesvio(); var s3c = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1 };
		string a3c = A2Reavaliar(e3c, s3c, true, 200, depois, 7746, 0);
		JObject e3d = pernaDesvio(); e3d["stop_level"] = JValue.CreateNull(); var s3d = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1 };
		string a3d = A2Reavaliar(e3d, s3d, true, 200, depois, 7735, 0);
		Ok(a3c == "FECHADA_PERNA" && s3c.Ordens == 1 && s3c.Stops.Count == 0 && a3d == "FECHADA_PERNA" && s3d.Ordens == 1,
		   "RA2-3b SHORT com preco >= hard stop, ou sem stop_level ⇒ fecha so a perna sem tentar stop", a3c + "/" + a3d);

		// RA2-4 lado oposto / qty maior ⇒ divergencia, nenhuma ordem (nunca inverter)
		JObject e4 = pernaDesvio(); var s4 = new A2Sim { BrokerSide = "LONG", BrokerQty = 1 };
		string a4 = A2Reavaliar(e4, s4, true, 200, depois, 7735, 0);
		JObject e4b = pernaDesvio(); var s4b = new A2Sim { BrokerSide = "SHORT", BrokerQty = 3 };
		string a4b = A2Reavaliar(e4b, s4b, true, 200, depois, 7735, 1);
		Ok(a4 == AoRoboFechamento.RevDivergencia && a4b == AoRoboFechamento.RevDivergencia && s4.Ordens + s4b.Ordens == 0 && (bool)e4["desvio"] && (bool)e4b["desvio"],
		   "RA2-4 conta LONG (oposto) ou SHORT 3x (> perna 1 + outras 1) ⇒ BROKER_INTERNAL_DIVERGENCE, 0 ordens, desvio mantido", a4 + "/" + a4b);

		// RA2-5 leitura velha / anterior ao confirmado / ilegivel / desvio legado sem carimbo ⇒ nada
		var s5 = new A2Sim { BrokerSide = "SHORT", BrokerQty = 1 };
		JObject e5a = pernaDesvio(), e5b = pernaDesvio(), e5c = pernaDesvio(), e5d = pernaDesvio(), e5e = pernaDesvio();
		string r5a = A2Reavaliar(e5a, s5, true, 1500, depois, 7735, 0);
		string r5b = A2Reavaliar(e5b, s5, true, 200, conf.AddMilliseconds(200), 7735, 0);
		string r5c = A2Reavaliar(e5c, s5, true, 200, conf.AddSeconds(-2), 7735, 0);
		string r5d = A2Reavaliar(e5d, s5, false, 200, depois, 7735, 0);
		e5e.Remove(AoRoboFechamento.CampoDesvioConfirmado);
		string r5e = A2Reavaliar(e5e, s5, true, 200, depois, 7735, 0);
		Ok(r5a == AoRoboFechamento.RevSemLeitura && r5b == AoRoboFechamento.RevAnterior && r5c == AoRoboFechamento.RevAnterior && r5d == AoRoboFechamento.RevSemLeitura
		   && r5e == AoRoboFechamento.RevAnterior && s5.Ordens == 0 && (bool)e5a["desvio"] && (bool)e5b["desvio"] && (bool)e5c["desvio"] && (bool)e5d["desvio"] && (bool)e5e["desvio"],
		   "RA2-5 leitura velha (1.5 s) / < confirmado+500 ms / anterior / ilegivel / desvio legado sem carimbo ⇒ nada (0 ordens, desvio mantido)",
		   r5a + "/" + r5b + "/" + r5c + "/" + r5d + "/" + r5e);
		JObject e5f = new JObject { { "intentId", "x" }, { "side", "SHORT" }, { "qty", 1 }, { "desvio", false } }; int q5;
		Ok(AoRoboFechamento.ClassificarReversaoDesvio(e5f, true, 200, AoRoboFechamento.LeituraCloseMaxAgeMs, depois, "SHORT", 1, 0, out q5) == AoRoboFechamento.RevNada && q5 == 0,
		   "RA2-6 perna sem desvio ⇒ NADA (regras do residual A seguem pelo AvaliarLeituraDesvio)");
	}

	static int Main(string[] args)
	{
		string dir = args.Length > 0 ? args[0] : "out";
		JObject fx = JObject.Parse(File.ReadAllText(Path.Combine(dir, "events-fixture.json")));
		var evs = ((JArray)fx["events"]).Cast<JObject>().ToList();
		string tmp = Path.Combine(Path.GetTempPath(), "inv-sync-" + Guid.NewGuid().ToString("N").Substring(0, 8));
		Directory.CreateDirectory(tmp);
		string cur = Path.Combine(tmp, "aot-events-cursor.json"), mot = Path.Combine(tmp, "motor.json");
		DateTime agora = AoEventoAot.ParseIso(evs[0]["created_at"]).Value.AddSeconds(2);

		// ── bootstrap: consumidor novo nao reprocessa historico ──
		var boot = new AoRoboEventoAot(Path.Combine(tmp, "boot.json"));
		Ok(!boot.TemCursor, "BOOT0 sem arquivo = sem cursor");
		boot.Bootstrap(4, agora);
		AoEventoAot e; string erro; bool gap;
		Ok(boot.LastSeq == 4 && boot.Classificar(evs[2], out e, out erro, out gap) == AoEventoStatus.Antigo, "BOOT1 bootstrap em last_seq=4: seq 3 = OLD (sem entrada atrasada)");

		// ── A) mesmo evento: OPEN seq1 → seguidor abre com o trade_id do AOT ──
		var cons = new AoRoboEventoAot(cur); cons.Bootstrap(0, agora);
		var m = new AoMotorCanonico(mot, Path.Combine(tmp, "hist"), new AoMotorParams());
		var linhas = new List<JObject>(); m.LedgerDiferido = r => linhas.Add(r);
		string cls = cons.Classificar(evs[0], out e, out erro, out gap);
		Ok(cls == AoEventoStatus.Novo && !gap && e.Action == "OPEN" && e.TradeId == (string)evs[0]["event_id"], "A1 OPEN seq1 classificado NEW, trade_id = event_id do OPEN", cls + " " + erro);
		string res; AoMotorTick t = Aplicar(m, e, out res);
		Ok(res == AoMotorCanonico.EvAplicado && t.Abriu && m.Side == "LONG" && m.TradeId == e.TradeId && m.EventIdOpen == e.EventId, "A2 seguidor abre LONG com trade_id/event_id do evento", res);
		Ok(m.EntryEs == e.EsPrice && m.EntryNq == e.NqPrice && m.OpenedAtUtc == e.CreatedAt, "A3 entrada = precos canonicos do evento; openedAt = created_at");
		cons.Ack(e, e.Seq, AoEventoStatus.OpenExecutado, null, agora);

		// ── B) dedup 3x: o MESMO OPEN reentregue nunca reabre ──
		for (int k = 0; k < 3; k++)
		{
			string c2 = cons.Classificar(evs[0], out e, out erro, out gap);
			Ok(c2 == AoEventoStatus.Duplicado, "B" + (k + 1) + " reentrega do OPEN = DUPLICATE", c2);
		}
		Aplicar(m, e, out res);
		Ok(res == AoMotorCanonico.EvJaAplicado && m.Side == "LONG", "B4 motor: mesmo trade_id = ALREADY_APPLIED (crash entre aplicar e ACK)", res);

		// ── C) restart (F5): cursor e posicao do seguidor voltam do disco ──
		cons = new AoRoboEventoAot(cur);
		m = new AoMotorCanonico(mot, Path.Combine(tmp, "hist"), new AoMotorParams()); m.LedgerDiferido = r => linhas.Add(r);
		Ok(cons.TemCursor && cons.LastSeq == 1 && cons.StatusDe((string)evs[0]["event_id"]) == AoEventoStatus.OpenExecutado, "C1 cursor persistido: last_seq=1 + status do event_id");
		Ok(m.Side == "LONG" && m.TradeId == (string)evs[0]["trade_id"], "C2 seguidor persistido com o trade_id apos restart");
		Ok(cons.Classificar(evs[0], out e, out erro, out gap) != AoEventoStatus.Novo, "C3 apos restart o OPEN ja processado nao e NEW");

		// ── G) CLOSE seq2 refere T → fecha; registro canonico com os ids; ledger diferido recebe o trade_id do AOT ──
		cls = cons.Classificar(evs[1], out e, out erro, out gap);
		t = Aplicar(m, e, out res);
		Ok(cls == AoEventoStatus.Novo && res == AoMotorCanonico.EvAplicado && t.Fechou && m.Side == "FLAT", "G1 CLOSE seq2 fecha o trade T", cls + " " + res);
		Ok((string)t.Trade["trade_id"] == e.TradeId && (string)t.Trade["event_id_open"] == (string)evs[0]["event_id"] && (string)t.Trade["event_id_close"] == e.EventId
		   && (long)t.Trade["seq_open"] == 1 && (long)t.Trade["seq_close"] == 2, "J1 registro INVICTUS grava trade_id/event_id_open/event_id_close/seq");
		Ok(linhas.Count == 1 && (string)linhas[0]["trade_id"] == e.TradeId, "J2 ledger diferido (EXIT_DECIDED) recebe o MESMO trade_id do AOT");
		cons.Ack(e, e.Seq, AoEventoStatus.CloseExecutado, null, agora);
		Aplicar(m, e, out res);
		Ok(res == AoMotorCanonico.EvJaAplicado, "G2 CLOSE reentregue apos fechar = ALREADY_APPLIED (nenhum segundo flatten)", res);

		// ── H/I) lifecycle: correlacao pela trade_id do AOT (nunca pela derivacao MOTOR-<openedAt>) ──
		var rec = (JObject)t.Trade;
		Ok(AoRoboFechamento.TradeIdDoRegistro(rec) == e.TradeId, "H1 TradeIdDoRegistro prefere rec.trade_id (AOT)");
		var execT = new JObject { { "intentId", "ES-x-1" }, { "trade_id", e.TradeId }, { "side", "LONG" }, { "openedAt", rec["openedAt"] } };
		var execOrfa = new JObject { { "intentId", "NES-orfa" }, { "trade_id", "MOTOR-2026-09-14T00:00:00.000Z-LONG" }, { "side", "LONG" }, { "openedAt", rec["openedAt"] } };
		var execOutroT = new JObject { { "intentId", "ES-y" }, { "trade_id", "outro" }, { "side", "LONG" }, { "openedAt", rec["openedAt"] } };
		string via;
		Ok(AoRoboFechamento.PertenceAoTrade(execT, rec, out via) && via == AoRoboFechamento.ViaTradeId, "H2 execucao com trade_id do AOT pertence ao trade (via trade_id)");
		Ok(!AoRoboFechamento.PertenceAoTrade(execOrfa, rec, out via) && !AoRoboFechamento.PertenceAoTrade(execOutroT, rec, out via), "H3 orfa aotp001 / outro trade NAO entram");
		var fe = new AoRoboFechamento(Path.Combine(tmp, "fech.json"));
		JObject tr = fe.Decidir(rec, new List<JObject> { execT }, null, agora);
		Ok(tr != null && (string)tr["trade_id"] == e.TradeId && (string)tr["para"] == AoFechamentoEstado.ExitDecided, "I1 EXIT_DECIDED registrado com o trade_id do AOT (CLOSED so apos fills+flat: 50/50 estrutural)");
		Ok(fe.Decidir(rec, new List<JObject> { execT }, null, agora) == null, "I2 Decidir idempotente por trade_id");

		// ── 2o trade (SHORT seq3/seq4) + CLOSE sem trade ──
		cls = cons.Classificar(evs[2], out e, out erro, out gap); Aplicar(m, e, out res); cons.Ack(e, e.Seq, AoEventoStatus.OpenExecutado, null, agora);
		Ok(res == AoMotorCanonico.EvAplicado && m.Side == "SHORT" && m.TradeId == (string)evs[2]["trade_id"], "A4 seq3 OPEN SHORT aplicado com o trade_id dele");
		var falso = (JObject)evs[3].DeepClone(); falso["trade_id"] = "trade-inexistente"; falso["event_id"] = "ev-x"; falso["seq"] = 9;
		AoEventoAot ef = AoEventoAot.De(falso, out erro); Aplicar(m, ef, out res);
		Ok(res == AoMotorCanonico.EvCloseSemTrade && m.Side == "SHORT", "G3 CLOSE de trade desconhecido = CLOSE_NO_TRADE (posicao intacta)", res);

		// ── D) recuperacao apos stream offline: seq4 chega depois, sem duplicar; lacuna detectada ──
		cls = cons.Classificar(evs[3], out e, out erro, out gap);
		Ok(cls == AoEventoStatus.Novo && !gap, "D1 seq4 entregue apos a volta do stream = NEW sem lacuna");
		Aplicar(m, e, out res); cons.Ack(e, e.Seq, AoEventoStatus.CloseExecutado, null, agora);
		Ok(res == AoMotorCanonico.EvAplicado && m.Side == "FLAT" && cons.LastSeq == 4, "D2 CLOSE seq4 aplicado; cursor=4");
		var pulo = (JObject)evs[2].DeepClone(); pulo["seq"] = 7; pulo["event_id"] = "ev-7"; pulo["trade_id"] = "ev-7";
		Ok(cons.Classificar(pulo, out e, out erro, out gap) == AoEventoStatus.Novo && gap, "D3 seq 7 apos cursor 4 = NEW com gap registrado");

		// ── F) OPEN stale bloqueado; CLOSE nunca stale ──
		AoEventoAot o1 = AoEventoAot.De(evs[0], out erro), c1 = AoEventoAot.De(evs[1], out erro);
		double idade;
		Ok(cons.OpenStale(o1, o1.CreatedAt.Value.AddSeconds(91), out idade) && !cons.OpenStale(o1, o1.CreatedAt.Value.AddSeconds(30), out idade), "F1 OPEN > 90 s = STALE; 30 s = fresco");
		Ok(!cons.OpenStale(c1, c1.CreatedAt.Value.AddHours(5), out idade), "F2 CLOSE nunca e stale (sempre honrado)");

		// ── replay / invalido ──
		AoEventoAot rp = AoEventoAot.De((JObject)fx["replay"], out erro);
		Ok(rp != null && rp.Replay, "R1 evento replay=true reconhecido (o robo nunca executa)");
		var inv = (JObject)evs[0].DeepClone(); inv["source"] = "INVICTUS_LOCAL";
		Ok(cons.Classificar(inv, out e, out erro, out gap) == AoEventoStatus.Invalido, "V1 source diferente de AOT_CANONICAL = INVALID", erro);

		// ── E) sem decisao local: posicao legada so fecha; Tick(permitirEntrada=false) nunca abre ──
		var leg = new AoMotorCanonico(null, null, new AoMotorParams());
		AoMotorTick tl = leg.Tick(new AoMotorAnchor { Dir = "LONG", Strength = 4 }, 6000, 21000, agora, "x", false, false);
		Ok(!tl.Abriu && leg.Side == "FLAT", "E1 Tick(permitirEntrada=false) com 4/4 NAO abre (AoGate local fora da decisao)");
		AoMotorTick tp = leg.Tick(new AoMotorAnchor { Dir = "LONG", Strength = 4 }, 6000, 21000, agora, "x", false);
		Ok(tp.Abriu && leg.TradeId == null, "E2 Tick padrao (paridade aot-sim/sombra) inalterado; sem trade_id");

		// ── CT) contrato ──
		DateTime d30 = new DateTime(2026, 9, 30, 15, 0, 0, DateTimeKind.Utc);
		Ok(AoRoboEventoAot.TerceiraSexta(2026, 9) == new DateTime(2026, 9, 18, 0, 0, 0, DateTimeKind.Utc), "CT1 3a sexta set/2026 = 18/09");
		Ok(AoRoboEventoAot.ValidarContrato("NES 09-26", d30) != null && AoRoboEventoAot.ValidarContrato("ES 09-26", d30) != null, "CT2 NES/ES 09-26 em 30/09 = CONTRATO vencido (bloqueia abertura)");
		Ok(AoRoboEventoAot.ValidarContrato("ES 12-26", d30) == null && AoRoboEventoAot.ValidarContrato("MNQ 12-26", d30) == null, "CT3 12-26 valido");

		PosRevisao(evs, tmp);
		PreInstalacao(evs, tmp);
		CloseDivergence(evs, tmp);
		ResidualA(evs, tmp);
		ResidualA2();

		try { Directory.Delete(tmp, true); } catch { }
		Console.WriteLine();
		Console.WriteLine("C# sync: " + pass + " PASS / " + fail + " FAIL");
		return fail == 0 ? 0 : 1;
	}
}
