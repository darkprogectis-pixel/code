// RECONCILIATION test_rec (2026-10-05) — REC01–REC08 + PnL por conta, EXECUTANDO o AlfaOmegaRobo.cs REAL do staging com DUAS contas:
// abertura → fill de entrada (AoRoboOrderWatch real → OnFillEntrada/ProtegerFill) → desvio (Reconciliar) → saida (ExecutarSaida) →
// fill de saida (OnExecucao → AlfaOmegaRoboLedger real) → restart (CarregarExecucoes / ReconciliarPernas / GarantiaBoot).
// Conta NT8, livro de ordens e posicoes = simulados (Corretora por conta). Sem NT8, sem conta, sem ordem. Raiz temporaria propria.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript.AddOns;

public static class ProgramRec
{
	static int _fails, _oks, _n, _achados;
	static string _root;
	const string ES = "ES 12-26", NQ = "NQ 12-26";
	static void Ok(bool c, string nome) { if (c) { _oks++; Console.WriteLine("PASS " + nome); } else { _fails++; Console.WriteLine("FAIL " + nome); } }
	static void Achado(bool reproduz, string nome) { if (reproduz) { _achados++; Console.WriteLine("ACHADO " + nome); } else { _fails++; Console.WriteLine("FAIL (achado nao reproduziu) " + nome); } }
	static readonly string[] Seis = { "ES", "NQ", "MES", "MNQ", "NES", "NNQ" };

	static AoMotorCanonico Motor(string side)
	{
		string d = Path.Combine(_root, "motor-" + (++_n)); Directory.CreateDirectory(d);
		string f = Path.Combine(d, "m.json");
		File.WriteAllText(f, new JObject { { "side", side }, { "armed", false }, { "openedAt", DateTime.UtcNow.AddSeconds(-_n).ToString("o") },
			{ "legs", new JObject { { "es", new JObject { { "entry", 6000.0 }, { "active", false }, { "pnlUsd", 0 } } }, { "nq", new JObject { { "entry", 21000.0 }, { "active", false }, { "pnlUsd", 0 } } } } } }.ToString());
		return new AoMotorCanonico(f, d, new AoMotorParams());
	}
	static AoEventoAot Ev(string side) { _n++; return new AoEventoAot { Seq = _n, EventId = "ev-" + _n, TradeId = "T" + _n, Action = "OPEN", Direction = side, CreatedAt = DateTime.UtcNow }; }
	static void NovasContas(params string[] nomes) { lock (Account.All) { Account.All.Clear(); foreach (string c in nomes) Account.All.Add(new Account { Name = c }); } }
	static void Zerar()
	{
		AlfaOmegaRobo.Limpar(); AoRoboOrderWatch.Desassinar(); AoRoboOrderWatch.Reset();
		NovasContas("ContaA", "ContaB", "Sim101");
		Corretora.Reset(); AoRoboPositions.Lidas.Clear(); AoRoboPositions.Ilegiveis.Clear();
		lock (AoRoboAudit.Eventos) AoRoboAudit.Eventos.Clear();
		AoRoboLedger.Reset(); AoRoboDedup.Reset();
		foreach (string f in new[] { "ledger.jsonl", "ledger-abertos.json", "stats-por-estrategia.json", "motor-execucoes.json" })
			try { File.Delete(Path.Combine(AoRoboConfig.StateDir, f)); } catch { }
		AlfaOmegaRobo.PrepararFechamento(Path.Combine(AoRoboConfig.StateDir, "fech-" + (++_n) + ".json"));
		AoRoboOperacional.Set(true, "teste", "t");
	}
	static void CicloHooks() { foreach (string c in AlfaOmegaRobo.EmUso()) { AlfaOmegaRobo.GarantirExec(c); AoRoboOrderWatch.Garantir(c); } }
	static void Ativos(Dictionary<string, string> mapa)
	{
		foreach (string c in Seis)
		{
			bool on = mapa.ContainsKey(c);
			if (on && AoRoboAtivos.ContaDe(c) != mapa[c]) AoRoboAtivos.SetConta(c, mapa[c], "teste", "t");
			AoRoboAtivos.SetEnabled(c, on, "teste", "t");
		}
	}
	static Account Nt8(string n) { lock (Account.All) return Account.All.First(a => a.Name == n); }
	static List<Ordem> Ords(Func<Ordem, bool> f) { lock (Corretora.G) return Corretora.Ordens.Where(f).ToList(); }
	static List<Ordem> Mercado(string conta = null) { return Ords(o => o.Tipo == "market" && (conta == null || o.Conta == conta)); }
	static List<Ordem> ProtAtivas(string conta) { return Ords(o => o.Tipo != "market" && o.Conta == conta && Corretora.Ativa(o.Estado)); }
	static List<AoRoboAudit.Ev> Aud(string evento) { lock (AoRoboAudit.Eventos) return AoRoboAudit.Eventos.Where(x => x.Evento == evento).ToList(); }
	static string Desc(IEnumerable<Ordem> os) { return string.Join(",", os.Select(o => o.Tipo + ":" + o.Acao + ":" + o.Instrumento + "@" + o.Conta + ":" + o.Estado)); }

	/// <summary>O que o NT8 entrega quando a ordem `nome` executa na conta: OrderUpdate (Filled) + ExecutionUpdate, NA CONTA DA ORDEM.</summary>
	static void EventoFill(string conta, string instr, string nome, string orderId, bool compra, int qty, double preco, bool ordem = true, bool exec = true)
	{
		Account a = Nt8(conta);
		var o = new Order { Account = a, Instrument = new Instrument { FullName = instr }, Name = nome, OrderId = orderId, OrderAction = compra ? OrderAction.Buy : OrderAction.Sell };
		if (ordem) a.RaiseOrder(new OrderEventArgs { Order = o, OrderState = OrderState.Filled, OrderId = orderId, Quantity = qty, Filled = qty, AverageFillPrice = preco, Time = DateTime.UtcNow });
		if (exec) a.RaiseExecution(new ExecutionEventArgs { Execution = new Execution { Order = o, Name = nome, Account = a, Instrument = o.Instrument, Commission = 1.5, ExecutionId = "x-" + (++_n) },
			MarketPosition = compra ? MarketPosition.Long : MarketPosition.Short, Quantity = qty, Price = preco });
	}
	static void FillEntrada(JObject reg, double preco)
	{
		string nome = (string)reg["order_name"], conta = (string)reg["nt8_account"];
		Ordem o = Ords(x => x.Nome == nome && x.Conta == conta).First();
		EventoFill(conta, (string)reg["instrumento"], nome, o.Id, o.Acao == "buy", o.Qty, preco);
	}
	static List<JObject> LinhasLedger()
	{
		string f = AoRoboLedger.LedgerFile;
		return File.Exists(f) ? File.ReadAllLines(f).Where(l => l.Trim().Length > 0).Select(l => JObject.Parse(l)).ToList() : new List<JObject>();
	}

	public static int Main(string[] args)
	{
		_root = Path.Combine(Path.GetTempPath(), "ao-rec-test-" + Guid.NewGuid().ToString("N"));
		Directory.CreateDirectory(_root);
		try
		{
			AoRoboConfig.RootDir = _root; AoRoboConfig.StateDir = Path.Combine(_root, "state"); AoRoboConfig.ConfigDir = Path.Combine(_root, "config");
			Directory.CreateDirectory(AoRoboConfig.StateDir); Directory.CreateDirectory(AoRoboConfig.ConfigDir);
			AoRoboLedger.StateDir = AoRoboConfig.StateDir;
			AoRoboDedup.StateFile = Path.Combine(AoRoboConfig.StateDir, "dedup-intents.json");
			foreach (var kv in new[] { new[] { "a", "ContaA" }, new[] { "b", "ContaB" }, new[] { "sim", "Sim101" } })
			{
				var acc = new AoRoboAccount { Id = kv[0], Nt8Account = kv[1] };
				foreach (string c in Seis) acc.MaxContracts[c] = 10;
				AoRoboConfig.Accounts.Add(acc);
			}
			AoRoboOperacional.Init(_root);
			AoRoboAtivos.Init(_root);
			AlfaOmegaRobo.PrepararEquity(Path.Combine(AoRoboConfig.StateDir, "robo-equity-peak.json"));
			Console.WriteLine("fonte robo: " + AlfaOmegaRobo.Fonte + " · metodos reais: " + AlfaOmegaRobo.MetodosReais.Length);
			var doisAtivos = new Dictionary<string, string> { { "ES", "ContaA" }, { "NQ", "ContaB" } };
			DateTime t0 = DateTime.UtcNow;

			// ════ S1 — ciclo completo com duas contas ════
			Zerar(); Ativos(doisAtivos); CicloHooks();
			Corretora.Entrada("ContaB", ES, 2);                                    // REC07: posicao MANUAL sem tag, MESMO instrumento, OUTRA conta
			AoMotorCanonico m = Motor("LONG"); AoEventoAot ev = Ev("LONG");
			AoResultadoEntrada r = AlfaOmegaRobo.Entrar(m, t0, ev);
			Ok(r.Enviadas == 2 && Mercado("ContaA").Count == 1 && Mercado("ContaA")[0].Instrumento == ES && Mercado("ContaB").Count == 1 && Mercado("ContaB")[0].Instrumento == NQ && Mercado("Sim101").Count == 0,
				"REC01 entrada: ES na ContaA, NQ na ContaB, nada em outra conta (" + Desc(Mercado()) + ")");
			Ok(Corretora.Pos("ContaA", ES) == 1 && Corretora.Pos("ContaB", ES) == 2, "REC07 posicao manual sem tag de ES na ContaB (2) NAO bloqueou a entrada de ES na ContaA (posA=" + Corretora.Pos("ContaA", ES) + ")");
			JObject ra = AlfaOmegaRobo.RegDe("ContaA", ES), rb = AlfaOmegaRobo.RegDe("ContaB", NQ);
			string ia = (string)ra["intentId"], ib = (string)rb["intentId"];

			FillEntrada(ra, 6000); FillEntrada(rb, 21000);
			AlfaOmegaRobo.ProtecaoTick(t0.AddSeconds(1));
			var pa = ProtAtivas("ContaA"); var pb = ProtAtivas("ContaB");
			Ok(pa.Count >= 1 && pa.All(o => o.Instrumento == ES && o.Acao == "sell" && Corretora.PernaDoOco(o.Oco) == ia) && pa.Any(o => o.Tipo == "stopmarket"),
				"REC02a fill de entrada na ContaA (OrderUpdate real → OnFillEntrada/ProtegerFill reais) => protecao da perna SO na ContaA (" + Desc(pa) + ")");
			Ok(pb.Count >= 1 && pb.All(o => o.Instrumento == NQ && Corretora.PernaDoOco(o.Oco) == ib) && Ords(o => o.Tipo != "market" && o.Conta == "Sim101").Count == 0,
				"REC02b protecao da perna B SO na ContaB; nenhuma protecao cruzada nem em Sim101 (" + Desc(pb) + ")");
			ra = AlfaOmegaRobo.RegDe("ContaA", ES); rb = AlfaOmegaRobo.RegDe("ContaB", NQ);
			Ok((int)ra["qty_protegida"] == 1 && (int)rb["qty_protegida"] == 1 && AlfaOmegaRobo.Orfaos == 0, "REC02c registro de cada perna recebeu o SEU fill (qty_protegida 1 e 1; orfaos=" + AlfaOmegaRobo.Orfaos + ")");
			Ok(AoRoboLedger.IntentsAbertos() == 2 && AoRoboLedger.IntentAbertoUnico("ContaA") == ia && AoRoboLedger.IntentAbertoUnico("ContaB") == ib && AoRoboLedger.IntentAbertoUnico("Sim101") == null,
				"REC02d ledger REAL (OnExecucao real): 2 intents abertos, cada um atribuido a SUA conta");

			// REC05 — fill na ContaB (manual, mesmo instrumento da perna A) nao altera a ContaA
			string antesA = AlfaOmegaRobo.RegDe("ContaA", ES).ToString(); int ordA = Ords(o => o.Conta == "ContaA").Count;
			Corretora.Entrada("ContaB", ES, -1); EventoFill("ContaB", ES, "Close", "man-1", false, 1, 6005);   // venda manual de 1 ES na ContaB (2 -> 1)
			var ign = Aud("fill_ignorado");
			Ok(AlfaOmegaRobo.RegDe("ContaA", ES).ToString() == antesA && Ords(o => o.Conta == "ContaA").Count == ordA && Corretora.Pos("ContaA", ES) == 1 && AoRoboLedger.IntentsAbertos() == 2,
				"REC05a fill manual de ES na ContaB => registro, ordens e posicao da perna A (ContaA) INALTERADOS; ledger segue com 2 abertos");
			Ok(Aud("trade_closed").Count == 0 && ign.All(x => x.IntentId != ia && (x.Payload == null || (string)x.Payload["intentId"] != ia)) && Corretora.Pos("ContaB", ES) == 1,
				"REC05b fill manual da ContaB nunca correlacionado ao intent da ContaA: nenhum trade_closed, nenhum evento com o intent da perna A");
			bool castLanca = false; try { JToken x = (JToken)(object)"s"; castLanca = x == null; } catch (InvalidCastException) { castLanca = true; }
			Achado(ign.Count == 0 && castLanca && AoRoboLedger.IntentAbertoUnico("ContaB") == ib,
				"REC05x DEFEITO PRE-EXISTENTE (live identico, AlfaOmegaRobo.cs OnExecucao, campo intentId do fill_ignorado): (JToken)(object)string lanca InvalidCastException quando a conta tem exatamente 1 intent aberto => auditoria fill_ignorado PERDIDA (n=" + ign.Count + "); sem efeito em ordem/posicao/ledger");

			// REC08 — perna B zerada por fora => exec_desvio SO na perna B
			Corretora.Entrada("ContaB", NQ, -1);
			AlfaOmegaRobo.ReconciliarTick(m, t0.AddSeconds(10)); AlfaOmegaRobo.ReconciliarTick(m, t0.AddSeconds(20)); AlfaOmegaRobo.ReconciliarTick(m, t0.AddSeconds(30));
			var dv = Aud("exec_desvio");
			ra = AlfaOmegaRobo.RegDe("ContaA", ES); rb = AlfaOmegaRobo.RegDe("ContaB", NQ);
			Ok(dv.Count == 1 && dv[0].Account == "b" && dv[0].Instrument == NQ && rb != null && rb["desvio"] != null && (bool)rb["desvio"], "REC08a exec_desvio confirmado SO para a perna da ContaB (n=" + dv.Count + ")");
			Ok(!(bool)ra["desvio"] && ra["desvio_candidato_snapshot_utc"] == null && ra["desvio_confirmed_snapshot_utc"] == null && ProtAtivas("ContaA").Count == pa.Count && ProtAtivas("ContaB").Count == 0,
				"REC08b perna A sem desvio e com a protecao intacta na ContaA; protecao cancelada SO na ContaB (A=" + ProtAtivas("ContaA").Count + " B=" + ProtAtivas("ContaB").Count + ")");

			// REC03 / REC04 — saida real: fechamento na conta da perna, fill de saida, FLAT, PnL por conta
			int mercB = Mercado("ContaB").Count;
			AlfaOmegaRobo.Fechar("CLOSE", t0.AddSeconds(40), false);
			var xa = Mercado("ContaA").Where(o => o.Nome != null && o.Nome.EndsWith("|X")).ToList();
			Ok(xa.Count == 1 && xa[0].Acao == "sell" && xa[0].Instrumento == ES && xa[0].Estado == "Filled" && Mercado("ContaB").Count == mercB && Mercado("Sim101").Count == 0,
				"REC03a ExecutarSaida REAL: fechamento |X enviado SO na ContaA (perna viva); nenhuma ordem de saida na ContaB/Sim101 (" + Desc(xa) + ")");
			Ok(Corretora.Pos("ContaA", ES) == 0 && Corretora.Pos("ContaB", ES) == 1 && ProtAtivas("ContaA").Count == 0, "REC04a ContaA FLAT em ES, protecao da perna cancelada; posicao manual da ContaB intocada (" + Corretora.Pos("ContaB", ES) + ")");
			Ok(Aud("flatten_ok").Count == 1 && Aud("flatten_ok")[0].Account == "a" && AlfaOmegaRobo.Execucoes == 0, "REC04b flatten_ok da conta a; registros de execucao removidos (restam " + AlfaOmegaRobo.Execucoes + ")");
			EventoFill("ContaA", ES, xa[0].Nome, xa[0].Id, false, 1, 6010, false, true);                 // fill de SAIDA da perna A
			int ignAntes = Aud("fill_ignorado").Count;
			EventoFill("ContaA", ES, "Close", "man-2", true, 1, 6011, false, true);   // manual na ContaA, ja sem intent aberto (o da ContaB segue aberto)
			var ign2 = Aud("fill_ignorado");
			Ok(ign2.Count == ignAntes + 1 && (string)ign2.Last().Payload["account"] == "ContaA" && ign2.Last().Payload["intentId"].Type == JTokenType.Null && AoRoboLedger.IntentsAbertos() == 1,
				"REC05c controle: fill manual em conta SEM intent aberto unico => fill_ignorado gravado com a conta certa e intentId null (nao atribuido)");
			EventoFill("ContaB", NQ, (string)rb["order_name"] + "|S", "stp-b", false, 1, 20950, false, true);   // stop do broker da perna B
			var fechados = Aud("trade_closed"); var linhas = LinhasLedger();
			JObject la = linhas.FirstOrDefault(l => (string)l["intentId"] == ia), lb = linhas.FirstOrDefault(l => (string)l["intentId"] == ib);
			Ok(fechados.Count == 2 && linhas.Count == 2 && la != null && lb != null && (string)la["conta"] == "ContaA" && (string)la["instrumento"] == ES && (string)lb["conta"] == "ContaB" && (string)lb["instrumento"] == NQ,
				"REC03b fill de saida (OnExecucao real) => trade_closed + linha do ledger com a CONTA e o instrumento de cada perna");
			Ok(la != null && lb != null && Math.Abs((double)la["pnl_usd"] - 10 * (double)la["point_value"]) < 1e-9 && Math.Abs((double)lb["pnl_usd"] - (-50) * (double)lb["point_value"]) < 1e-9,
				"PNL01 PnL por conta: ContaA = (6010-6000) x pv, ContaB = (20950-21000) x pv — sem mistura (A=" + (la == null ? "?" : (string)la["pnl_usd"].ToString()) + " B=" + (lb == null ? "?" : lb["pnl_usd"].ToString()) + ")");
			Ok(AoRoboLedger.IntentsAbertos() == 0 && la["commission_usd"] != null && Math.Abs((double)la["commission_usd"] - 3.0) < 1e-9, "REC04c ledger volta a 0 abertos; comissao real somada so dos fills da perna (A=" + la["commission_usd"] + ")");

			// ════ S2 — REC06 restart com pernas abertas nas duas contas ════
			Zerar(); Ativos(doisAtivos); CicloHooks();
			m = Motor("SHORT"); ev = Ev("SHORT"); t0 = DateTime.UtcNow;
			r = AlfaOmegaRobo.Entrar(m, t0, ev);
			ra = AlfaOmegaRobo.RegDe("ContaA", ES); rb = AlfaOmegaRobo.RegDe("ContaB", NQ); ia = (string)ra["intentId"]; ib = (string)rb["intentId"];
			FillEntrada(ra, 6000); FillEntrada(rb, 21000); AlfaOmegaRobo.ProtecaoTick(t0.AddSeconds(1));
			int ordensAntes = Ords(o => true).Count; int protA = ProtAtivas("ContaA").Count, protB = ProtAtivas("ContaB").Count;
			// F5: estaticos somem, objetos Account novos, hooks antigos mortos
			AoRoboOrderWatch.Desassinar(); AoRoboOrderWatch.Reset(); NovasContas("ContaA", "ContaB", "Sim101");
			AoRoboLedger.Reset(); AlfaOmegaRobo.Restart(Path.Combine(AoRoboConfig.StateDir, "fech-r.json")); AoRoboLedger.Carregar();
			ra = AlfaOmegaRobo.RegDe("ContaA", ES); rb = AlfaOmegaRobo.RegDe("ContaB", NQ);
			Ok(AlfaOmegaRobo.Execucoes == 2 && ra != null && (string)ra["intentId"] == ia && rb != null && (string)rb["intentId"] == ib, "REC06a restart: motor-execucoes recarregado com a conta+instrumento de cada perna (ES@ContaA, NQ@ContaB)");
			Ok(AoRoboLedger.IntentsAbertos() == 2 && AoRoboLedger.IntentAbertoUnico("ContaA") == ia && AoRoboLedger.IntentAbertoUnico("ContaB") == ib, "REC06b ledger de abertos restaurado por conta (2 intents, cada um na sua conta)");
			Ok(!AlfaOmegaRobo.HookExec("ContaA") && !AoRoboOrderWatch.TemHook("ContaA"), "REC06c depois do restart nenhuma conta esta observavel ate o 1o ciclo");
			for (int i = 0; i < 3; i++) CicloHooks();
			Ok(Nt8("ContaA").AssinaturasExec == 1 && Nt8("ContaA").AssinaturasOrdem == 1 && Nt8("ContaB").AssinaturasExec == 1 && Nt8("ContaB").AssinaturasOrdem == 1 && Nt8("Sim101").AssinaturasExec == 0,
				"REC06d 3 ciclos pos-restart => 1 handler de execucao + 1 de ordem por conta em uso; Sim101 sem hook (DUPLICATE_HANDLERS = 0)");
			AlfaOmegaRobo.Boot(t0.AddSeconds(5));
			var boot = Aud("boot_protection_check");
			Ok(boot.Count == 1 && (int)boot[0].Payload["pernas_no_boot"] == 2 && ProtAtivas("ContaA").Count == protA && ProtAtivas("ContaB").Count == protB && ProtAtivas("ContaA").All(o => Corretora.PernaDoOco(o.Oco) == ia),
				"REC06e GarantiaBoot real: 2 pernas conferidas, protecao de cada uma segue na SUA conta (A=" + ProtAtivas("ContaA").Count + " B=" + ProtAtivas("ContaB").Count + ")");
			int mercAntes = Mercado().Count;
			AoResultadoEntrada rr = AlfaOmegaRobo.Retomar(Motor("SHORT"), t0.AddSeconds(6), ev, true);
			var recs = Aud("perna_reconciliada");
			Ok(rr.JaRegistradas == 2 && rr.Enviadas == 0 && Mercado().Count == mercAntes && recs.Count == 2 && recs.All(e => e.Result == "reconcile:NAO_REENVIAR"),
				"REC06f retomada do OPEN (ReconciliarPernas real): 2 pernas com evidencia na propria conta => NAO_REENVIAR, 0 ordens novas");

			// ════ S3 — REC06g: perna registrada SEM ordem na ContaA; a MESMA posicao existe por fora na ContaB ════
			Zerar(); Ativos(doisAtivos); CicloHooks();
			m = Motor("LONG"); ev = Ev("LONG"); t0 = DateTime.UtcNow;
			r = AlfaOmegaRobo.Entrar(m, t0, ev);
			ia = (string)AlfaOmegaRobo.RegDe("ContaA", ES)["intentId"];
			lock (Corretora.G) { Corretora.Ordens.RemoveAll(o => o.Conta == "ContaA"); Corretora.Posicoes["ContaA|" + ES] = 0; }   // o place da perna A nunca chegou ao broker
			Corretora.Entrada("ContaB", ES, 1);                                                                                   // ES LONG manual na OUTRA conta
			AoRoboOrderWatch.Desassinar(); AoRoboOrderWatch.Reset(); NovasContas("ContaA", "ContaB", "Sim101");
			AoRoboLedger.Reset(); AlfaOmegaRobo.Restart(Path.Combine(AoRoboConfig.StateDir, "fech-s3.json")); AoRoboLedger.Carregar();
			AoRoboDedup.Reset(); CicloHooks();
			rr = AlfaOmegaRobo.Retomar(Motor("LONG"), t0.AddSeconds(3), ev, true);
			recs = Aud("perna_reconciliada");
			var recA = recs.FirstOrDefault(e => e.Instrument == ES); var recB = recs.FirstOrDefault(e => e.Instrument == NQ);
			Ok(recA != null && recA.Result == "reconcile:REENVIAR" && (string)recA.Payload["evidencia"] == "AUSENTE_CONFIRMADA" && recB != null && recB.Result == "reconcile:NAO_REENVIAR",
				"REC06g evidencia lida SO na conta da perna: ES ausente na ContaA (apesar de ES LONG na ContaB) => REENVIAR; NQ presente na ContaB => NAO_REENVIAR (A=" + (recA == null ? "?" : recA.Result) + " B=" + (recB == null ? "?" : recB.Result) + ")");
			Ok(Mercado("ContaA").Count == 1 && Mercado("ContaA")[0].Instrumento == ES && Mercado("ContaB").Count == 1 && Corretora.Pos("ContaB", ES) == 1,
				"REC06h reenvio 1x, na ContaA; nenhuma ordem nova na ContaB (" + Desc(Mercado()) + ")");
			// stale: mesma situacao, OPEN fora do frescor => remove sem enviar
			Zerar(); Ativos(doisAtivos); CicloHooks();
			m = Motor("LONG"); ev = Ev("LONG"); t0 = DateTime.UtcNow;
			AlfaOmegaRobo.Entrar(m, t0, ev);
			lock (Corretora.G) { Corretora.Ordens.RemoveAll(o => o.Conta == "ContaA"); Corretora.Posicoes["ContaA|" + ES] = 0; }
			rr = AlfaOmegaRobo.Retomar(Motor("LONG"), t0.AddSeconds(3), ev, false);
			Ok(Mercado("ContaA").Count == 0 && AlfaOmegaRobo.RegDe("ContaA", ES) == null && AlfaOmegaRobo.RegDe("ContaB", NQ) != null, "REC06i OPEN stale: perna ausente da ContaA removida SEM envio; perna da ContaB preservada");
			// conta ilegivel => INCERTO => nada enviado (ausencia de evidencia com conta indisponivel nunca e prova)
			Zerar(); Ativos(doisAtivos); CicloHooks();
			m = Motor("LONG"); ev = Ev("LONG"); t0 = DateTime.UtcNow;
			AlfaOmegaRobo.Entrar(m, t0, ev);
			lock (Corretora.G) { Corretora.Ordens.RemoveAll(o => o.Conta == "ContaA"); Corretora.Posicoes["ContaA|" + ES] = 0; }
			AoRoboPositions.Ilegiveis.Add("ContaA");
			rr = AlfaOmegaRobo.Retomar(Motor("LONG"), t0.AddSeconds(3), ev, true);
			Ok(rr.Incertas == 1 && Mercado("ContaA").Count == 0 && AlfaOmegaRobo.RegDe("ContaA", ES) != null, "REC06j posicao da ContaA ilegivel => perna INCERTA (reconciliation_pending), 0 ordens, registro mantido (incertas=" + rr.Incertas + ")");
		}
		catch (Exception ex) { _fails++; Console.WriteLine("FAIL EXCECAO " + ex); }
		finally { try { Directory.Delete(_root, true); } catch { } }
		Console.WriteLine();
		Console.WriteLine("REC: " + _oks + " PASS / " + _fails + " FAIL / " + _achados + " ACHADO (defeito pre-existente fora do lote, nao corrigido)");
		return _fails == 0 ? 0 : 1;
	}
}
