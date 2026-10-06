// ACCOUNT BINDING test_entrada (2026-10-05) — EXECUTA o caminho REAL de abertura do AlfaOmegaRobo.cs do STAGING
// (ExecutarEntrada → ExecutarEntradaCore → ExecutarAlvo → ExecutarOrdem) com AoRoboAtivos / AoRoboOrderWatch reais do staging e
// Gates / Permissao (position_guard) / Dedup / Operacional reais do live. Conta NT8, posicoes e adapter (PlaceCore) = simulados.
// Sem NT8, sem conta, sem ordem. Raiz temporaria propria (nunca o alfaomega-robo real).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript.AddOns;

public static class ProgramEntrada
{
	static int _fails, _oks, _n;
	static string _root;
	static void Ok(bool c, string nome) { if (c) { _oks++; Console.WriteLine("PASS " + nome); } else { _fails++; Console.WriteLine("FAIL " + nome); } }
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

	/// <summary>Estado limpo: contas NT8 novas (contadores de assinatura zerados), sem hooks, sem posicoes, sem registros, PLAY.</summary>
	static void Zerar(params string[] contasNt8)
	{
		AlfaOmegaRobo.Limpar(); AoRoboOrderWatch.Desassinar(); AoRoboOrderWatch.Reset();
		lock (Account.All) { Account.All.Clear(); foreach (string c in contasNt8) Account.All.Add(new Account { Name = c }); }
		AoRoboPositions.Pos.Clear(); AoRoboPositions.Lidas.Clear(); AoRoboPositions.Source = "sim";
		AlfaOmegaTrader.Places.Clear(); AoRoboAudit.Eventos.Clear(); AoRoboLedger.Atribuicoes.Clear(); AoRoboDedup.Reset();
		AoRoboOperacional.Set(true, "teste", "t");
	}
	/// <summary>O que o Ciclo() faz a cada volta (A3c): garante os dois hooks para as contas EM USO.</summary>
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
	static List<JObject> Places(string instr = null) { return AlfaOmegaTrader.Places.Where(p => instr == null || (string)p["instrument"] == instr).ToList(); }
	static List<AoRoboAudit.Ev> Skips(string result) { return AoRoboAudit.Eventos.Where(e => e.Evento == "account_skip" && e.Result == result).ToList(); }
	static string Contas(IEnumerable<JObject> ps) { return string.Join(",", ps.Select(p => (string)p["instrument"] + "@" + (string)p["account"])); }

	public static int Main(string[] args)
	{
		_root = Path.Combine(Path.GetTempPath(), "ao-entrada-test-" + Guid.NewGuid().ToString("N"));
		Directory.CreateDirectory(_root);
		try
		{
			AoRoboConfig.RootDir = _root; AoRoboConfig.StateDir = Path.Combine(_root, "state"); AoRoboConfig.ConfigDir = Path.Combine(_root, "config");
			Directory.CreateDirectory(AoRoboConfig.StateDir); Directory.CreateDirectory(AoRoboConfig.ConfigDir);
			AoRoboDedup.StateFile = Path.Combine(AoRoboConfig.StateDir, "dedup-intents.json");
			foreach (var kv in new[] { new[] { "a", "ContaA" }, new[] { "b", "ContaB" }, new[] { "sim", "Sim101" }, new[] { "c", "ContaC" }, new[] { "d", "ContaD" } })
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

			// ── E1 — EXEC01 / ACC04 / EXEC02: sinal → gates → OPEN → conta SELECIONADA chega identica ao adapter ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos); CicloHooks();
			AoResultadoEntrada r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(r.Enviadas == 2 && Places().Count == 2, "E1a EXEC01 2 ativos habilitados => 2 entradas submetidas (enviadas=" + r.Enviadas + " places=" + Places().Count + " motivo=" + r.Motivo + ")");
			Ok(Places("ES 12-26").Count == 1 && (string)Places("ES 12-26")[0]["account"] == "ContaA" && Places("NQ 12-26").Count == 1 && (string)Places("NQ 12-26")[0]["account"] == "ContaB",
				"E1b ACC04 conta do ativo chega IDENTICA ao PlaceCore: " + Contas(Places()));
			Ok(Places().All(p => (string)p["account"] != "Sim101"), "E1c EXEC02/ACC05 nenhuma ordem para Sim101 (conta nao selecionada)");
			Ok(((string)Places("ES 12-26")[0]["orderName"]).StartsWith("AO|" + AoRoboGuard.ContaToken("a") + "|") && ((string)Places("NQ 12-26")[0]["orderName"]).StartsWith("AO|" + AoRoboGuard.ContaToken("b") + "|"), "E1d nome da ordem carrega a conta (AO|<token da conta>|<intent>) — base da reconciliacao por conta");
			var regs = AlfaOmegaRobo.Regs();
			Ok(regs.Count == 2 && regs.Any(e => (string)e["instrumento"] == "ES 12-26" && (string)e["nt8_account"] == "ContaA") && regs.Any(e => (string)e["instrumento"] == "NQ 12-26" && (string)e["nt8_account"] == "ContaB"),
				"E1e ACC07 registro da perna grava a conta de ORIGEM (motor-execucoes) == conta do submit");
			Ok(AoRoboLedger.Atribuicoes.Count == 2 && AoRoboLedger.Atribuicoes.Any(a => a.EndsWith("|ContaA")) && AoRoboLedger.Atribuicoes.Any(a => a.EndsWith("|ContaB")), "E1f P14 atribuicao do ledger (PnL) por conta");
			Ok(Places().All(p => (bool)p["guards"]["requireFlat"] && (int)p["guards"]["maxPositions"] == 1), "E1g EXEC07/EXEC08 guards.requireFlat=true e maxPositions = ativos habilitados NAQUELA conta (1 e 1)");
			Ok(AoRoboPositions.Lidas.Distinct().OrderBy(x => x).SequenceEqual(new[] { "ContaA", "ContaB" }), "E1h POS a posicao lida para o guard e SO a das contas dos ativos (" + string.Join(",", AoRoboPositions.Lidas.Distinct()) + ")");
			// mesmo evento de novo (retomada sem crash): nunca duplica
			int antes = Places().Count;
			AoEventoAot mesmo = new AoEventoAot { Seq = 1, EventId = "ev-dup", TradeId = (string)regs[0]["trade_id"], Action = "OPEN", Direction = "LONG" };
			AoResultadoEntrada rd = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, mesmo);
			Ok(rd.Enviadas == 0 && Places().Count == antes && rd.JaRegistradas == 2, "E1i COPY03/ACC14 mesmo trade_id de novo => 0 ordens novas (ja registradas=" + rd.JaRegistradas + ")");

			// ── E2 — ACC06 / EXEC03 / P15: conta sem hooks => ACCOUNT_NOT_AVAILABLE, fail-closed, 0 ordens ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos);   // SEM CicloHooks
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			var sk = Skips("blocked:account_not_available");
			Ok(r.Enviadas == 0 && Places().Count == 0 && AlfaOmegaRobo.Execucoes == 0, "E2a sem hook de execucao/ordem => NENHUMA ordem, nenhum registro (enviadas=" + r.Enviadas + " places=" + Places().Count + ")");
			Ok(sk.Count == 2 && sk.All(e => (string)e.Payload["code"] == "ACCOUNT_NOT_AVAILABLE" && (bool)e.Payload["hook_exec"] == false && (bool)e.Payload["hook_ordem"] == false),
				"E2b audit account_skip blocked:account_not_available x2 com code=ACCOUNT_NOT_AVAILABLE, hook_exec=false, hook_ordem=false");
			Ok((r.Motivo ?? "").Contains("ACCOUNT_NOT_AVAILABLE"), "E2c motivo devolvido ao canal de execucao cita ACCOUNT_NOT_AVAILABLE");

			// ── E3 — so UM dos dois hooks: continua bloqueado; a outra perna (conta observavel) segue ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos);
			AlfaOmegaRobo.GarantirExec("ContaA");                                   // ContaA: so ExecutionUpdate
			AlfaOmegaRobo.GarantirExec("ContaB"); AoRoboOrderWatch.Garantir("ContaB");
			r = AlfaOmegaRobo.Entrar(Motor("SHORT"), DateTime.UtcNow, Ev("SHORT"));
			sk = Skips("blocked:account_not_available");
			Ok(Places().Count == 1 && (string)Places()[0]["account"] == "ContaB" && (string)Places()[0]["instrument"] == "NQ 12-26" && (string)Places()[0]["action"] == "sell",
				"E3a ContaA so com hook de execucao => ES bloqueado; NQ na ContaB enviado (" + Contas(Places()) + ")");
			Ok(sk.Count == 1 && (bool)sk[0].Payload["hook_exec"] && !(bool)sk[0].Payload["hook_ordem"] && (string)sk[0].Payload["conta_selecionada"] == "ContaA", "E3b skip informa qual hook falta (hook_exec=true, hook_ordem=false, conta_selecionada=ContaA)");
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos);
			AoRoboOrderWatch.Garantir("ContaA");                                    // ContaA: so OrderUpdate
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places().Count == 0, "E3c ContaA so com hook de ordem => bloqueado tambem (precisa dos DOIS)");

			// ── E4 — hooks so em OUTRA conta: nunca cai para ela ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(new Dictionary<string, string> { { "ES", "ContaA" } });
			AlfaOmegaRobo.GarantirExec("Sim101"); AoRoboOrderWatch.Garantir("Sim101"); AlfaOmegaRobo.GarantirExec("ContaB"); AoRoboOrderWatch.Garantir("ContaB");
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places().Count == 0 && Skips("blocked:account_not_available").Count == 1, "E4 EXEC03 Sim101/ContaB observaveis, ContaA (a selecionada) nao => 0 ordens; NAO cai para outra conta");

			// ── E5 — conta selecionada AUSENTE do NT8 (Account.All): hook nao nasce, perna bloqueada ──
			Zerar("ContaB", "Sim101"); Ativos(doisAtivos);                           // ContaA nao existe no NT8
			Ok(!AlfaOmegaRobo.GarantirExec("ContaA") && !AoRoboOrderWatch.Garantir("ContaA") && !AlfaOmegaRobo.Observavel("ContaA"), "E5a ACC06 conta fora de Account.All => Garantir=false nos dois hooks");
			CicloHooks();
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places().Count == 1 && (string)Places()[0]["account"] == "ContaB" && Places().All(p => (string)p["instrument"] != "ES 12-26"), "E5b conta ausente => ES sem ordem; NQ (ContaB presente) enviado");
			var skA = AoRoboAudit.Eventos.Where(e => e.Evento == "account_skip" && e.Payload != null && (string)e.Payload["ativo"] == "ES").ToList();
			Ok(skA.Count == 1 && (string)skA[0].Payload["code"] == "ACCOUNT_NOT_AVAILABLE", "E5c skip do ES com code=ACCOUNT_NOT_AVAILABLE (result=" + (skA.Count == 1 ? skA[0].Result : "?") + ")");
			// a conta "conecta depois do boot": o ciclo seguinte assina e a perna passa a operar, sem restart
			lock (Account.All) Account.All.Add(new Account { Name = "ContaA" });
			CicloHooks();
			AlfaOmegaTrader.Places.Clear();
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places("ES 12-26").Count == 1 && (string)Places("ES 12-26")[0]["account"] == "ContaA", "E5d conta aparece depois do boot => proximo ciclo assina e o ES opera na ContaA, sem restart");

			// ── E6 — ACC14: idempotencia dos hooks (sem handler duplicado) ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos);
			for (int i = 0; i < 5; i++) CicloHooks();
			Ok(Nt8("ContaA").AssinaturasExec == 1 && Nt8("ContaA").AssinaturasOrdem == 1 && Nt8("ContaB").AssinaturasExec == 1 && Nt8("ContaB").AssinaturasOrdem == 1,
				"E6a ACC14 5 ciclos => exatamente 1 handler de execucao e 1 de ordem por conta em uso");
			Ok(Nt8("Sim101").AssinaturasExec == 0 && Nt8("Sim101").AssinaturasOrdem == 0, "E6b conta que nenhum ativo usa NAO e assinada");
			Ok(AoRoboAudit.Eventos.Count(e => e.Evento == "exec_hook_subscribe") == 2 && AoRoboAudit.Eventos.Count(e => e.Evento == "order_watch_subscribe") == 2, "E6c audit de assinatura so quando o hook e CRIADO (2 + 2, nao 10 + 10)");

			// ── E7 — ACC13 / ACCOUNT_CHANGE_WITHOUT_RESTART: troca a quente ──
			AoRoboAtivos.SetConta("ES", "Sim101", "teste", "t");
			Ok(AlfaOmegaRobo.EmUso().Contains("Sim101") && !AlfaOmegaRobo.EmUso().Contains("ContaA"), "E7a troca ES ContaA -> Sim101: contas em uso = " + string.Join(",", AlfaOmegaRobo.EmUso()));
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));     // ANTES do ciclo seguinte: conta nova ainda sem hook
			Ok(Places("ES 12-26").Count == 0, "E7b entre a troca e o ciclo seguinte a perna fica bloqueada (nunca opera na conta ANTIGA nem sem hook)");
			CicloHooks(); AlfaOmegaTrader.Places.Clear();
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places("ES 12-26").Count == 1 && (string)Places("ES 12-26")[0]["account"] == "Sim101" && Places().All(p => (string)p["account"] != "ContaA"), "E7c ACC13 ciclo seguinte: hooks seguem a troca e o ES opera na conta NOVA (" + Contas(Places()) + ")");

			// ── E8 — ACC01/02/03 · POS01/02: posicao em OUTRA conta nao bloqueia; na MESMA conta segue a politica ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos); CicloHooks();
			AoRoboPositions.Pos["ContaB|ES 12-26"] = 3; AoRoboPositions.Pos["Sim101|ES 12-26"] = -2; AoRoboPositions.Pos["Sim101|NQ 12-26"] = 5;   // manuais, sem tag, em outras contas
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places("ES 12-26").Count == 1 && (string)Places("ES 12-26")[0]["account"] == "ContaA", "E8a ACC01/ACC02/POS01 posicao sem tag no MESMO instrumento em ContaB e Sim101 NAO bloqueia o ES na ContaA");
			Ok(Places("NQ 12-26").Count == 1 && (string)Places("NQ 12-26")[0]["account"] == "ContaB", "E8b posicao em Sim101 (NQ) nao bloqueia o NQ na ContaB");
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos); CicloHooks();
			AoRoboPositions.Pos["ContaA|ES 12-26"] = 1;                              // manual, sem tag, NA conta do ativo
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places("ES 12-26").Count == 0 && Skips("blocked:position_guard").Count == 1 && Skips("blocked:position_guard")[0].Account == "a", "E8c POS02 posicao sem tag NA MESMA conta+instrumento => position_guard bloqueia (politica mantida)");
			Ok(Places("NQ 12-26").Count == 1, "E8d POS06 o bloqueio do ES na ContaA nao contamina o NQ na ContaB");
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(new Dictionary<string, string> { { "ES", "Sim101" }, { "NQ", "ContaB" } }); CicloHooks();
			AoRoboPositions.Pos["ContaA|ES 12-26"] = 4;                              // firm com posicao, Sim101 selecionada
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places("ES 12-26").Count == 1 && (string)Places("ES 12-26")[0]["account"] == "Sim101", "E8e ACC03 outra conta com posicao + Sim101 selecionada => nao bloqueia");

			// ── E9 — ACC05: ativo SEM conta gravada => nenhuma ordem, nenhuma conta por omissao ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos);
			foreach (string c in new[] { "ContaA", "ContaB", "Sim101" }) { AlfaOmegaRobo.GarantirExec(c); AoRoboOrderWatch.Garantir(c); }   // TODAS observaveis: se houvesse fallback, a ordem sairia
			File.WriteAllText(AoRoboAtivos.Arquivo, "{\"version\":900,\"ativos\":{\"ES\":{\"enabled\":true,\"qty\":1},\"NQ\":{\"enabled\":true,\"qty\":1,\"account\":\"ContaB\"}}}");
			AoRoboAtivos.Carregar(true);
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			var inv = Skips("blocked:conta_invalida");
			Ok(Places("ES 12-26").Count == 0 && Places().All(p => (string)p["account"] != "Sim101") && inv.Count == 1 && (string)inv[0].Payload["code"] == "ACCOUNT_NOT_AVAILABLE" && (string)inv[0].Payload["conta_selecionada"] == "",
				"E9a ACC05 ES sem conta gravada (todas as contas observaveis) => 0 ordens do ES, nada em Sim101, skip conta_invalida code=ACCOUNT_NOT_AVAILABLE");
			Ok(Places("NQ 12-26").Count == 1 && (string)Places("NQ 12-26")[0]["account"] == "ContaB", "E9b o ativo com conta explicita segue normal");

			// ── E10 — EXEC05 / EXEC06: STOP bloqueia, PLAY libera ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos); CicloHooks();
			AoRoboOperacional.Set(false, "teste", "t");
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(r.Enviadas == 0 && Places().Count == 0 && (r.Motivo ?? "").StartsWith("operational_stop"), "E10a EXEC05 STOP => 0 ordens, motivo operational_stop");
			AoRoboOperacional.Set(true, "teste", "t");
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(r.Enviadas == 2 && Places().Count == 2, "E10b EXEC06 PLAY => pipeline normal (2 ordens)");

			// ── E11 — EXEC04 / ACC10 / P18 / EXEC08: seis pernas, cada uma na SUA conta ──
			var seis = new Dictionary<string, string> { { "ES", "ContaA" }, { "NQ", "ContaB" }, { "MES", "ContaB" }, { "MNQ", "ContaA" }, { "NES", "Sim101" }, { "NNQ", "ContaB" } };
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(seis); CicloHooks();
			r = AlfaOmegaRobo.Entrar(Motor("SHORT"), DateTime.UtcNow, Ev("SHORT"));
			bool ok6 = Places().Count == 6; string det = "";
			foreach (var kv in seis)
			{
				var p = Places(AoRoboConfig.Nt8Instrument[kv.Key]);
				if (p.Count != 1 || (string)p[0]["account"] != kv.Value) { ok6 = false; det += kv.Key + " "; }
			}
			Ok(ok6, "E11a EXEC04/ACC10 seis pernas, cada instrumento na conta do SEU ativo: " + Contas(Places()) + (det == "" ? "" : " — divergiu: " + det));
			var teto = new Dictionary<string, int> { { "ContaA", 2 }, { "ContaB", 3 }, { "Sim101", 1 } };
			Ok(Places().All(p => (int)p["guards"]["maxPositions"] == teto[(string)p["account"]]), "E11b EXEC08 maxPositions por conta = ativos habilitados NAQUELA conta (A=2, B=3, Sim101=1)");
			Ok(AlfaOmegaRobo.Regs().Count == 6 && AlfaOmegaRobo.Regs().All(e => Places().Any(p => (string)p["instrument"] == (string)e["instrumento"] && (string)p["account"] == (string)e["nt8_account"])), "E11c registro de cada perna == conta do submit (reconciliacao por conta)");

			// ── E13 — ACCOUNT-AGNOSTIC: troca dinamica ES ContaA -> ContaC -> ContaD sem restart, com hooks ──
			string[] cinco = { "ContaA", "ContaB", "ContaC", "ContaD", "Sim101" };
			Zerar(cinco); Ativos(doisAtivos); CicloHooks();
			string anterior = "ContaA"; bool e13 = true, e13Old = true, e13Hook = true; string e13det = "";
			foreach (string nova in new[] { "ContaC", "ContaD" })
			{
				AoRoboAtivos.SetConta("ES", nova, "teste", "t"); AlfaOmegaTrader.Places.Clear();
				AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));             // antes do ciclo: conta nova sem hook
				if (Places("ES 12-26").Count != 0) { e13 = false; e13det += "ES enviado antes do hook da " + nova + "; "; }
				CicloHooks(); AlfaOmegaTrader.Places.Clear();
				AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
				var es = Places("ES 12-26");
				if (es.Count != 1 || (string)es[0]["account"] != nova) { e13 = false; e13det += "ES@" + nova + "=" + Contas(es) + "; "; }
				if (Places().Any(p => (string)p["account"] == anterior || ((string)p["instrument"] == "ES 12-26" && (string)p["account"] != nova))) e13Old = false;
				if (Nt8(nova).AssinaturasExec != 1 || Nt8(nova).AssinaturasOrdem != 1) e13Hook = false;
				anterior = nova;
			}
			Ok(e13, "E13a ACCOUNT_CHANGE_WITHOUT_RESTART ES ContaA -> ContaC -> ContaD: bloqueado entre a troca e o ciclo, depois opera na conta NOVA " + e13det);
			Ok(e13Old, "E13b OLD_ACCOUNT_NOT_USED_FOR_NEW_ENTRY: nenhuma entrada nova na conta anterior");
			Ok(e13Hook, "E13c NEW_ACCOUNT_HOOK: 1 handler de execucao + 1 de ordem na conta nova");
			Ok(cinco.All(c => Nt8(c).AssinaturasExec <= 1 && Nt8(c).AssinaturasOrdem <= 1), "E13d DUPLICATE_HANDLERS = 0 em todas as contas (" + string.Join(",", cinco.Select(c => c + "=" + Nt8(c).AssinaturasExec + "/" + Nt8(c).AssinaturasOrdem)) + ")");

			// ── E14 — ACCOUNT-AGNOSTIC: 6 pernas em 4 contas (ES→A, NQ→B, MES→C, MNQ→A, NES→D, NNQ→B), simultaneas ──
			var quatro = new Dictionary<string, string> { { "ES", "ContaA" }, { "NQ", "ContaB" }, { "MES", "ContaC" }, { "MNQ", "ContaA" }, { "NES", "ContaD" }, { "NNQ", "ContaB" } };
			Zerar(cinco); Ativos(quatro); CicloHooks();
			AlfaOmegaRobo.Entrar(Motor("SHORT"), DateTime.UtcNow, Ev("SHORT"));
			bool e14 = Places().Count == 6; string e14det = "";
			foreach (var kv in quatro) { var p = Places(AoRoboConfig.Nt8Instrument[kv.Key]); if (p.Count != 1 || (string)p[0]["account"] != kv.Value) { e14 = false; e14det += kv.Key + " "; } }
			Ok(e14, "E14a 6 pernas em 4 contas, EXECUTION_TARGET == conta configurada de cada ativo: " + Contas(Places()) + (e14det == "" ? "" : " — divergiu: " + e14det));
			var teto4 = new Dictionary<string, int> { { "ContaA", 2 }, { "ContaB", 2 }, { "ContaC", 1 }, { "ContaD", 1 } };
			Ok(Places().All(p => (int)p["guards"]["maxPositions"] == teto4[(string)p["account"]]) && AlfaOmegaRobo.Regs().Count == 6
				&& AlfaOmegaRobo.Regs().All(e => (string)e["nt8_account"] == quatro.First(k => AoRoboConfig.Nt8Instrument[k.Key] == (string)e["instrumento"]).Value),
				"E14b guard (maxPositions por conta A=2 B=2 C=1 D=1) e registro de reconciliacao de cada perna == conta configurada");
			Ok(new[] { "ContaA", "ContaB", "ContaC", "ContaD" }.All(c => Nt8(c).AssinaturasExec == 1 && Nt8(c).AssinaturasOrdem == 1) && Nt8("Sim101").AssinaturasExec == 0,
				"E14c HOOK_ACCOUNT: 1+1 handler em cada uma das 4 contas em uso; conta nao usada sem hook");

			// ── E15 — conta configurada some do NT8 e volta (objeto Account NOVO, mesmo nome), sem recompilar ──
			// (E15b, 2026-10-05) HOOK_READY so por IDENTIDADE do objeto vivo em Account.All (ReferenceEquals), nunca por nome.
			string iMES = AoRoboConfig.Nt8Instrument["MES"], iNES = AoRoboConfig.Nt8Instrument["NES"];
			Func<Account, string> hk = a => a.AssinaturasExec + "/" + a.AssinaturasOrdem;
			Func<Account, bool> hk11 = a => a.AssinaturasExec == 1 && a.AssinaturasOrdem == 1, hk00 = a => a.AssinaturasExec == 0 && a.AssinaturasOrdem == 0;
			// code ACCOUNT_NOT_AVAILABLE em qualquer dos 2 gates: conta fora do Account.All => blocked:nt8_reachable; conta presente sem hook vivo => blocked:account_not_available
			Func<string, bool> skipAcc = instr => AoRoboAudit.Eventos.Any(e => e.Evento == "account_skip" && e.Instrument == instr && e.Payload != null && (string)e.Payload["code"] == "ACCOUNT_NOT_AVAILABLE");
			Func<string, string> gateDe = instr => string.Join(",", AoRoboAudit.Eventos.Where(e => e.Evento == "account_skip" && e.Instrument == instr).Select(e => e.Result));
			Zerar(cinco); Ativos(quatro); CicloHooks();
			Account cVelha = Nt8("ContaC");
			lock (Account.All) Account.All.RemoveAll(a => a.Name == "ContaC");
			CicloHooks();                                                                    // conta ausente: Garantir = false, nada assinado
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places(iMES).Count == 0 && Places().Count == 5 && skipAcc(iMES) && Places().All(p => (string)p["account"] != "ContaC"),
				"E15a ContaC sumiu => MES SUBMIT=0 com ACCOUNT_NOT_AVAILABLE; as outras 5 pernas seguem; MES nunca vai para outra conta (" + Contas(Places()) + ") gate=" + gateDe(iMES));

			Account cNova = new Account { Name = "ContaC" };
			lock (Account.All) Account.All.Add(cNova);
			AlfaOmegaTrader.Places.Clear(); AoRoboAudit.Eventos.Clear();
			bool obsAntes = AlfaOmegaRobo.Observavel("ContaC");
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));               // ANTES do ciclo: objeto vivo SEM hook (era o defeito)
			bool b1 = !obsAntes && Places(iMES).Count == 0 && skipAcc(iMES); string gateB = gateDe(iMES);
			CicloHooks(); AlfaOmegaTrader.Places.Clear();
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			bool b2 = Places(iMES).Count == 1 && (string)Places(iMES)[0]["account"] == "ContaC" && hk11(cNova) && hk00(cVelha)
				&& AlfaOmegaRobo.HooksExec == 4 && AoRoboOrderWatch.ContasAssinadas == 4
				&& AoRoboAudit.Eventos.Any(e => e.Evento == "exec_hook_stale_removed") && AoRoboAudit.Eventos.Any(e => e.Evento == "order_watch_stale_removed");
			Ok(b1 && b2, "E15b ContaC volta como objeto NOVO: antes do ciclo MES bloqueado (ACCOUNT_NOT_AVAILABLE, observavel=" + obsAntes + ", gate=" + gateB + "); no ciclo o hook do objeto antigo e removido ("
				+ hk(cVelha) + ") e o vivo recebe 1+1 (" + hk(cNova) + "); so depois o MES opera na ContaC [places=" + Contas(Places()) + " chaves exec/ordem=" + AlfaOmegaRobo.HooksExec + "/" + AoRoboOrderWatch.ContasAssinadas + "]");

			var antigas = new List<Account> { cVelha }; Account cViva = cNova; string c15det = "";
			for (int i = 0; i < 3; i++)
			{
				antigas.Add(cViva);
				lock (Account.All) Account.All.RemoveAll(a => a.Name == "ContaC");
				CicloHooks();
				cViva = new Account { Name = "ContaC" };
				lock (Account.All) Account.All.Add(cViva);
				CicloHooks(); CicloHooks();                                                  // idempotente: 2 ciclos seguidos
				if (!hk11(cViva) || !antigas.All(hk00) || AlfaOmegaRobo.HooksExec != 4 || AoRoboOrderWatch.ContasAssinadas != 4 || !AlfaOmegaRobo.Observavel("ContaC"))
					c15det += "volta" + (i + 1) + ": vivo=" + hk(cViva) + " antigos=" + string.Join(",", antigas.Select(hk)) + " chaves=" + AlfaOmegaRobo.HooksExec + "/" + AoRoboOrderWatch.ContasAssinadas + "; ";
			}
			Ok(c15det == "", "E15c ContaC volta 3x com instancias novas => sempre 1+1 no objeto vivo, " + antigas.Count + " objetos antigos 0/0, 1 chave por conta (4/4), 0 duplicado " + c15det);

			int ex0 = AlfaOmegaRobo.ExecRecebidos; long or0 = AoRoboOrderWatch.EventosRecebidos;
			foreach (Account o in antigas) { o.DispararExec(); o.DispararOrdem(); }
			Ok(AlfaOmegaRobo.ExecRecebidos == ex0 && AoRoboOrderWatch.EventosRecebidos == or0,
				"E15d " + antigas.Count + " objetos antigos disparam ExecutionUpdate/OrderUpdate depois da substituicao => 0 eventos chegam ao robo (exec +" + (AlfaOmegaRobo.ExecRecebidos - ex0) + ", ordem +" + (AoRoboOrderWatch.EventosRecebidos - or0) + ")");
			cViva.DispararExec(); cViva.DispararOrdem();
			Ok(AlfaOmegaRobo.ExecRecebidos == ex0 + 1 && AoRoboOrderWatch.EventosRecebidos == or0 + 1, "E15e objeto VIVO dispara ExecutionUpdate/OrderUpdate => chegam normalmente (exec +1, ordem +1)");

			Account aAntes = Nt8("ContaA"), bVelha = Nt8("ContaB"), bNova = new Account { Name = "ContaB" };
			lock (Account.All) { Account.All.Remove(bVelha); Account.All.Add(bNova); }
			CicloHooks(); AlfaOmegaTrader.Places.Clear();
			AlfaOmegaRobo.Entrar(Motor("SHORT"), DateTime.UtcNow, Ev("SHORT"));
			Ok(ReferenceEquals(Nt8("ContaA"), aAntes) && hk11(aAntes) && hk00(bVelha) && hk11(bNova) && Places().Count == 6
				&& (string)Places("ES 12-26")[0]["account"] == "ContaA" && (string)Places(AoRoboConfig.Nt8Instrument["MNQ"])[0]["account"] == "ContaA"
				&& (string)Places("NQ 12-26")[0]["account"] == "ContaB",
				"E15f ContaB reconecta (objeto novo) => ContaA intacta (mesmo objeto, " + hk(aAntes) + "), ContaB antiga " + hk(bVelha) + " / nova " + hk(bNova) + "; 6 pernas nas contas configuradas (" + Contas(Places()) + ")");

			Account dVelha = Nt8("ContaD"), dNova = new Account { Name = "ContaD", FalharAssinatura = true };
			lock (Account.All) { Account.All.Remove(dVelha); Account.All.Add(dNova); }
			CicloHooks(); AlfaOmegaTrader.Places.Clear(); AoRoboAudit.Eventos.Clear();
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			bool g1 = !AlfaOmegaRobo.Observavel("ContaD") && Places(iNES).Count == 0 && skipAcc(iNES) && Places().Count == 5 && Places().All(p => (string)p["account"] != "ContaD") && hk00(dNova) && hk00(dVelha);
			string g1det = Contas(Places()) + " D antiga " + hk(dVelha) + " nova " + hk(dNova);
			dNova.FalharAssinatura = false; CicloHooks(); AlfaOmegaTrader.Places.Clear();
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			bool g2 = Places(iNES).Count == 1 && (string)Places(iNES)[0]["account"] == "ContaD" && hk11(dNova) && hk00(dVelha);
			Ok(g1 && g2, "E15g ContaD volta mas a assinatura falha => fail-closed: NES SUBMIT=0 ACCOUNT_NOT_AVAILABLE, nada em outra conta, gate=" + gateDe(iNES) + " (" + g1det + "); assinatura volta a funcionar => NES opera na ContaD (" + hk(dNova) + ")");

			Account bAntes = Nt8("ContaB"), bNova2 = new Account { Name = "ContaB" };
			lock (Account.All) { Account.All.Remove(bAntes); Account.All.Add(bNova2); }
			CicloHooks();
			AoRoboAtivos.SetConta("ES", "ContaB", "teste", "t"); CicloHooks(); AlfaOmegaTrader.Places.Clear();
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Places("ES 12-26").Count == 1 && (string)Places("ES 12-26")[0]["account"] == "ContaB" && hk11(bNova2) && hk00(bAntes) && hk00(bVelha) && AlfaOmegaRobo.Observavel("ContaB"),
				"E15h troca ES ContaA -> ContaB depois de ContaB reconectar => submit na ContaB, hooks no objeto ContaB VIVO (" + hk(bNova2) + "), objetos antigos " + hk(bAntes) + "/" + hk(bVelha) + " (" + Contas(Places()) + ")");

			// ── E16 (UNIVERSAL 2026-10-06) — 2 contas que diferem SO por caixa: ATIVOS RAW == ROBO RAW == SUBMIT RAW, sem 1o match ──
			foreach (var kv in new[] { new[] { "cdup77", "CASE-DUP-77" }, new[] { "cdup77l", "Case-Dup-77" } })
			{ var acc = new AoRoboAccount { Id = kv[0], Nt8Account = kv[1] }; foreach (string c in Seis) acc.MaxContracts[c] = 10; AoRoboConfig.Accounts.Add(acc); }
			string iMES16 = AoRoboConfig.Nt8Instrument["MES"], iMNQ16 = AoRoboConfig.Nt8Instrument["MNQ"];
			var dup = new Dictionary<string, string> { { "MES", "CASE-DUP-77" }, { "MNQ", "Case-Dup-77" } };
			Zerar("Case-Dup-77", "CASE-DUP-77"); Ativos(dup); CicloHooks();
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			var regs16 = AlfaOmegaRobo.Regs();
			Func<string, string, bool> trio = (cod, instr) => {
				string ativos = AoRoboAtivos.ContaDe(cod), robo = AoRoboAtivos.Alvo(cod).Account, cfg16 = AoRoboAtivos.ContaDoAtivo(cod) == null ? null : AoRoboAtivos.ContaDoAtivo(cod).Nt8Account;
				string submit = Places(instr).Count == 1 ? (string)Places(instr)[0]["account"] : null;
				Console.WriteLine("   E16 " + cod + " ATIVOS_ACCOUNT_RAW='" + ativos + "' ROBOT_ACCOUNT_RAW='" + robo + "'/cfg='" + cfg16 + "' SUBMIT_ACCOUNT_RAW='" + submit + "'");
				return ativos == dup[cod] && robo == dup[cod] && cfg16 == dup[cod] && submit == dup[cod]
					&& regs16.Any(e => (string)e["instrumento"] == instr && (string)e["nt8_account"] == dup[cod]) && AoRoboLedger.Atribuicoes.Any(a => a.EndsWith("|" + dup[cod]));
			};
			bool t16a = trio("MES", iMES16), t16b = trio("MNQ", iMNQ16);
			Ok(t16a && t16b && Places().Count == 2 && AlfaOmegaRobo.Observavel("CASE-DUP-77") && AlfaOmegaRobo.Observavel("Case-Dup-77")
				&& ((string)Places(iMES16)[0]["orderName"]).StartsWith("AO|" + AoRoboGuard.ContaToken("cdup77") + "|") && ((string)Places(iMNQ16)[0]["orderName"]).StartsWith("AO|" + AoRoboGuard.ContaToken("cdup77l") + "|"),
				"E16a MES='CASE-DUP-77' e MNQ='Case-Dup-77': ATIVOS RAW == ROBO RAW == SUBMIT RAW == registro == ledger em cada perna; hooks nas 2 contas; nome da ordem com o token de CADA conta (" + Contas(Places()) + ")");
			Zerar("Case-Dup-77"); Ativos(dup); CicloHooks();   // so 'Case-Dup-77' no NT8: 'CASE-DUP-77' ausente
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(!AlfaOmegaRobo.Observavel("CASE-DUP-77") && Places(iMES16).Count == 0 && Places(iMNQ16).Count == 1 && (string)Places(iMNQ16)[0]["account"] == "Case-Dup-77"
				&& Places().All(p => (string)p["account"] == "Case-Dup-77" && (string)p["instrument"] == iMNQ16) && AoRoboAudit.Eventos.Count(e => e.Evento == "account_skip" && (e.Result ?? "").StartsWith("blocked:")) == 1,
				"E16b 'CASE-DUP-77' ausente do NT8 (so 'Case-Dup-77') => MES SUBMIT=0 fail-closed (account_skip blocked), nenhum hook/ordem na conta de outra caixa; MNQ segue na Case-Dup-77 (" + Contas(Places()) + ") obs=" + AlfaOmegaRobo.Observavel("CASE-DUP-77") + " ev=" + string.Join(",", AoRoboAudit.Eventos.Select(e => e.Evento + ":" + e.Result)));
			Zerar("CASE-DUP-77"); Ativos(dup); CicloHooks();   // simetrico: so 'CASE-DUP-77'
			AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(!AlfaOmegaRobo.Observavel("Case-Dup-77") && Places(iMNQ16).Count == 0 && Places(iMES16).Count == 1 && (string)Places(iMES16)[0]["account"] == "CASE-DUP-77"
				&& Places().All(p => (string)p["account"] == "CASE-DUP-77") && AoRoboAudit.Eventos.Count(e => e.Evento == "account_skip" && (e.Result ?? "").StartsWith("blocked:")) == 1,
				"E16c simetrico: 'Case-Dup-77' ausente => MNQ SUBMIT=0 fail-closed (account_skip blocked); MES segue na CASE-DUP-77 (" + Contas(Places()) + ") obs=" + AlfaOmegaRobo.Observavel("Case-Dup-77") + " ev=" + string.Join(",", AoRoboAudit.Eventos.Select(e => e.Evento + ":" + e.Result)));
			AoRoboConfig.Accounts.RemoveAll(a => a.Id == "cdup77" || a.Id == "cdup77l");

			// ── E12 — dry-run: sem conta real, o gate de hook nao se aplica (excecao declarada na proposta A3d) ──
			Zerar("ContaA", "ContaB", "Sim101"); Ativos(doisAtivos); AoRoboPositions.Source = "dry-run";
			r = AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
			Ok(Skips("blocked:account_not_available").Count == 0, "E12 leitura de posicao dry-run => gate de hook nao bloqueia (excecao declarada; enviadas=" + r.Enviadas + ")");
			Orn();
		}
		finally { try { Directory.Delete(_root, true); } catch { } }
		Console.WriteLine();
		Console.WriteLine("ENTRADA: checks=" + (_oks + _fails) + " ok=" + _oks + " fail=" + _fails + " => " + (_fails == 0 ? "PASS" : "FAIL"));
		return _fails == 0 ? 0 : 1;
	}

	// ── ORN01–ORN14 (2026-10-06) — ORDER_NAME_TOO_LONG: nome <= 50 p/ QUALQUER conta, correlacao preservada, fail-closed ──
	static void Orn()
	{
		const string TP = "TAKEPROFIT619605210", LONGA = "PROP-FIRM-EVALUATION-ACCOUNT-0000123456-FUTURE", CJK = "Sim阿爾法・歐米伽 止盈 — 艾克斯・懷伊 零零一";
		const string ID30 = "propfirmevaluationaccount00001";   // 30 chars: o loader recusa > 12, aqui prova que o nome independe do id
		foreach (var kv in new[] { new[] { "takeprofit61", TP }, new[] { ID30, LONGA }, new[] { "aotp001", CJK } })
		{
			var acc = new AoRoboAccount { Id = kv[0], Nt8Account = kv[1] };
			foreach (string c in Seis) acc.MaxContracts[c] = 10;
			AoRoboConfig.Accounts.Add(acc);
		}
		var idsTeste = new[] { "a", "takeprofit61", ID30, "aotp001" };
		Func<JObject, string> nome = p => (string)p["orderName"];
		Func<JObject, string> intent = p => (string)p["clientOrderId"];
		Func<string, bool> cabe = n => n != null && n.Length + AoRoboGuard.MaxSufixoOrdem <= 50;
		Func<JObject, string> idDe = p => AoRoboConfig.Accounts.First(a => a.Nt8Account == (string)p["account"]).Id;
		string m;

		// ORN01 conta curta · ORN02 TAKEPROFIT619605210 · ORN03 30+ chars · ORN04 CJK longa — 6 pernas, SHORT (pior caso)
		var mapa = new Dictionary<string, string> { { "ES", "ContaA" }, { "NQ", "ContaA" }, { "MES", TP }, { "MNQ", TP }, { "NES", LONGA }, { "NNQ", CJK } };
		Zerar("ContaA", TP, LONGA, CJK); Ativos(mapa); CicloHooks();
		AoResultadoEntrada r = AlfaOmegaRobo.Entrar(Motor("SHORT"), DateTime.UtcNow, Ev("SHORT"));
		var ps = Places();
		Func<string, JObject> P = i => Places(i).FirstOrDefault();
		Func<string, string> L = i => P(i) == null ? "-" : nome(P(i)).Length.ToString();
		bool seis = ps.Count == 6 && r.Enviadas == 6 && !AoRoboAudit.Eventos.Any(e => e.Evento == "exec_abort");
		Ok(seis && cabe(nome(P("ES 12-26"))) && nome(P("ES 12-26")) == AoRoboGuard.NomeOrdem("a", intent(P("ES 12-26"))),
			"ORN01 conta curta (a): ES SHORT submetida, nome " + (P("ES 12-26") == null ? "-" : nome(P("ES 12-26"))) + " (" + L("ES 12-26") + ") = NomeOrdem(a, intent)");
		Ok(seis && (string)P("MES 12-26")["account"] == TP && (string)P("MNQ 12-26")["account"] == TP && cabe(nome(P("MES 12-26"))) && cabe(nome(P("MNQ 12-26"))),
			"ORN02 TAKEPROFIT619605210 (id takeprofit61): MES/MNQ SHORT SUBMETIDAS na conta exata, nomes " + L("MES 12-26") + "/" + L("MNQ 12-26") + " chars (antes 57 => HTTP 400)");
		Ok(seis && (string)P("NES 12-26")["account"] == LONGA && cabe(nome(P("NES 12-26"))),
			"ORN03 conta de 46 chars / id de 30 chars: NES submetida, nome " + L("NES 12-26") + " chars");
		Ok(seis && (string)P("NNQ 12-26")["account"] == CJK && cabe(nome(P("NNQ 12-26"))),
			"ORN04 conta CJK longa (RAW intacto): NNQ submetida, nome " + L("NNQ 12-26") + " chars");
		var reais = new[] { "sim101", "aotp001", "aotp002", "aotp003", "aotp004", "aotp005", "aotp006", "aotp007", "aotp008", "aotp009", "aotp010", "sim", "sim2", "takeprofit13", "sim001", "takeprofit61", "sim002", "sim3", "sim003", "sim005" };
		Ok(seis && idsTeste.Select(AoRoboGuard.ContaToken).Distinct().Count() == 4 && ps.Select(nome).Distinct().Count() == 6 && reais.Select(AoRoboGuard.ContaToken).Distinct().Count() == reais.Length
			&& ps.All(p => AoRoboGuard.ProblemaNomeOrdem(idDe(p), nome(p), idsTeste, out m) == null),
			"ORN05 sem colisao: 4 contas do teste => 4 tokens, 6 nomes distintos; 20 ids do accounts.json real => 20 tokens distintos");

		// ORN06 ES/NQ LONG e SHORT · ORN07 MES/MNQ/NES/NNQ
		var lens = new List<string>(); bool ok6 = true;
		foreach (string lado in new[] { "LONG", "SHORT" })
		{
			Zerar("ContaA", "ContaB"); Ativos(new Dictionary<string, string> { { "ES", "ContaA" }, { "NQ", "ContaB" } }); CicloHooks();
			AlfaOmegaRobo.Entrar(Motor(lado), DateTime.UtcNow, Ev(lado));
			ok6 &= Places().Count == 2 && Places().All(p => cabe(nome(p)) && intent(p).Contains("-" + lado + "-"));
			lens.AddRange(Places().Select(p => (string)p["instrument"] + " " + lado + "=" + nome(p).Length));
		}
		Ok(ok6, "ORN06 ES/NQ LONG e SHORT submetidas com nome <= 48 (+2 sufixo): " + string.Join(", ", lens));
		var micro = ps.Where(p => !((string)p["instrument"]).StartsWith("ES ") && !((string)p["instrument"]).StartsWith("NQ ")).ToList();
		Ok(micro.Count == 4 && micro.All(p => nome(p).Length <= 45), "ORN07 MES/MNQ/NES/NNQ SHORT (pior caso) <= 45 (+2 = 47): " + string.Join(", ", micro.Select(p => (string)p["instrument"] + "=" + nome(p).Length)));

		// ORN08 ledger/audit correlacionam · ORN09 cancel/fechamento/protecao reconhecem a perna (eventos/registros da rodada de 6)
		Zerar("ContaA", TP, LONGA, CJK); Ativos(mapa); CicloHooks();
		AlfaOmegaRobo.Entrar(Motor("SHORT"), DateTime.UtcNow, Ev("SHORT")); ps = Places();
		bool ok8 = ps.Count == 6, ok9 = ps.Count == 6; var diag = new List<string>();
		foreach (JObject p in ps)
		{
			string n = nome(p), id = intent(p), contaId = idDe(p), fech = AoRoboSaida.NomeFechamento(n);
			bool parse = AoOrigem.IntentIdDe(n) == id && AoOrigem.IntentIdDe(n + "|S") == id + "|S" && AoOrigem.IntentIdDe(n + "|T") == id + "|T" && AoOrigem.De(n) == AoOrigemOrdem.ROBO;
			bool aud = AoRoboAudit.Eventos.Any(e => e.Evento == "place_ok" && e.IntentId == id && e.Account == contaId && e.Payload != null && (string)e.Payload["order_name"] == n);
			bool dono = AoRoboSaida.EhPropria(n, contaId) && AoRoboSaida.EhPropria(n + "|S", contaId) && AoRoboSaida.EhPropria(fech, contaId);
			bool fch = fech.Length <= 50 && AoOrigem.IntentIdDe(fech) == id + AoRoboSaida.SufixoFechamento;
			var alheias = AoRoboConfig.Accounts.Where(a => a.Id != contaId && AoRoboSaida.EhPropria(n, a.Id)).Select(a => a.Id).ToList();
			if (!(parse && aud && dono && fch && alheias.Count == 0)) diag.Add((string)p["instrument"] + ":parse=" + parse + ",aud=" + aud + ",dono=" + dono + ",fech=" + fch + ",alheias=" + string.Join("/", alheias));
			ok8 &= parse && aud; ok9 &= dono && fch && alheias.Count == 0;
		}
		bool regs = AlfaOmegaRobo.Regs().Count == 6 && AlfaOmegaRobo.Regs().All(e => ps.Any(p => intent(p) == (string)e["intentId"] && nome(p) == (string)e["order_name"] && (string)p["account"] == (string)e["nt8_account"]));
		if (!regs) diag.Add("regs=" + AlfaOmegaRobo.Regs().Count);
		ok9 &= regs;
		if (diag.Count > 0) Console.WriteLine("  ORN08/09 diag: " + string.Join(" | ", diag));
		Ok(ok8, "ORN08 OrderState.IntentIdDe = intentId (+ sufixo |S/|T intacto, como no formato antigo; Ledger.IntentDe intocado corta o sufixo); audit place_ok grava conta (c.Id) + order_name = vinculo token->conta");
		Ok(ok9, "ORN09 cancel/fechamento/protecao: EhPropria so na conta dona (+|S, |X), fechamento <= 50, registro do motor order_name == enviado (protecao pos-fill le e[order_name])");

		// ORN10 prontidao reconhece nome valido (mesma composicao do ProntidaoPasso: pior caso BAIXA)
		string src = File.ReadAllText(AlfaOmegaRobo.Fonte);
		int ip = src.IndexOf("private static void ProntidaoPasso", StringComparison.Ordinal);
		string corpo = ip < 0 ? "" : src.Substring(ip, Math.Min(7000, src.Length - ip));
		bool estr = corpo.Contains("AoRoboGuard.NomeOrdem(a.AccountId, AoPermissao.IntentId(a.Codigo, \"BAIXA\", agora, a.AccountId, agora))")
			&& corpo.Contains("bool pronto = a.Enabled && disponivel && nomeOk && play && pgPass;") && corpo.Contains("\"order_name_generatable\"");
		bool valido = Seis.All(c => idsTeste.All(id => AoRoboGuard.ProblemaNomeOrdem(id, AoRoboGuard.NomeOrdem(id, AoPermissao.IntentId(c, "BAIXA", DateTime.UtcNow, id, DateTime.UtcNow)), idsTeste, out m) == null));
		Ok(estr && valido, "ORN10 prontidao: ProntidaoPasso gera o nome do pior caso e exige nomeOk p/ execution_ready (estrutural, staging) + 6 ativos x 4 contas => order_name_generatable=true");

		// ORN11 geracao invalida => fail-closed ANTES do submit (colisao real de token entre 2 contas em uso)
		var vistos = new Dictionary<string, string>(); string c1 = null, c2 = null;
		for (int i = 0; c1 == null; i++) { string id = "k" + i, t = AoRoboGuard.ContaToken(id); if (vistos.ContainsKey(t)) { c1 = vistos[t]; c2 = id; } else vistos[t] = id; }
		foreach (var kv in new[] { new[] { c1, "ColA" }, new[] { c2, "ColB" } })
		{ var acc = new AoRoboAccount { Id = kv[0], Nt8Account = kv[1] }; foreach (string c in Seis) acc.MaxContracts[c] = 10; AoRoboConfig.Accounts.Add(acc); }
		Zerar("ColA", "ColB"); Ativos(new Dictionary<string, string> { { "ES", "ColA" }, { "NQ", "ColB" } }); CicloHooks();
		AlfaOmegaRobo.Entrar(Motor("LONG"), DateTime.UtcNow, Ev("LONG"));
		var aborts = AoRoboAudit.Eventos.Where(e => e.Evento == "exec_abort" && e.Result == "blocked:order_name_token_collision").ToList();
		Ok(Places().Count == 0 && aborts.Count == 2 && AlfaOmegaRobo.Execucoes == 0,
			"ORN11 colisao de token (" + c1 + "/" + c2 + " => " + AoRoboGuard.ContaToken(c1) + "): SUBMIT=0, exec_abort blocked:order_name_token_collision x" + aborts.Count + ", registro removido (execucoes=" + AlfaOmegaRobo.Execucoes + ")");
		AoRoboConfig.Accounts.RemoveAll(a => a.Nt8Account == "ColA" || a.Nt8Account == "ColB");

		// ORN12 formato ANTIGO (raiz) seria recusado antes do submit · ORN13 independe do id/nome · ORN14 deterministico
		string antigo = "AO|takeprofit61|AO-20261005-takeprofit61-MES-SHORT-223539";
		string cod12 = AoRoboGuard.ProblemaNomeOrdem("takeprofit61", antigo, null, out m);
		string cod12b = AoRoboGuard.ProblemaNomeOrdem("a", new string('x', 49), null, out m);
		Ok(antigo.Length == 57 && cod12 == "ORDER_NAME_TOO_LONG" && cod12b == "ORDER_NAME_TOO_LONG" && AoRoboGuard.ProblemaNomeOrdem("a", "", null, out m) == "ORDER_NAME_INVALID",
			"ORN12 nome antigo de 57 chars e nome de 49 (+2) => ORDER_NAME_TOO_LONG (nunca trunca); vazio => ORDER_NAME_INVALID");
		var ids = new[] { "a", "sim101", "takeprofit61", ID30, "测试账户", new string('z', 200) };
		var t0 = DateTime.UtcNow;
		var lensIds = ids.Select(id => AoRoboGuard.NomeOrdem(id, AoPermissao.IntentId("MES", "BAIXA", t0, id, t0)).Length).Distinct().ToList();
		Ok(ids.All(id => AoRoboGuard.ContaToken(id).Length == 6) && lensIds.Count == 1 && lensIds[0] == 45,
			"ORN13 ACCOUNT_NAME_LENGTH_DEPENDENCY=0: ids de 1 a 200 chars (+CJK) => token 6 chars, nome MES SHORT sempre " + string.Join("/", lensIds));
		Ok(AoRoboGuard.ContaToken("takeprofit61") == "aaa5cd" && AoRoboGuard.NomeOrdem("a", "X") == AoRoboGuard.NomeOrdem("a", "X") && Places().Count == 0,
			"ORN14 token deterministico (takeprofit61 => aaa5cd, igual ao calculado fora do harness); ORDERS_SENT reais = 0 (adapter simulado)");
	}
}
