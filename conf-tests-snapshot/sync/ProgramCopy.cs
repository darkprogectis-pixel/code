// COPY test_copy (2026-10-05) — COPY01/COPY02 por EXECUCAO da peca pura REAL do Copy Engine (AlfaOmegaCopyEngineContas.cs do LIVE,
// fora do lote, somente leitura): AoCeInventario.Reconciliar (REAL ∩ CONFIG, leader) e AoCePnl.Somar (PnL agregado por conta).
// Sem NT8, sem conta, sem ordem.
using System;
using System.Collections.Generic;
using System.Linq;
using NinjaTrader.NinjaScript.AddOns;

public static class ProgramCopy
{
	static int _fails, _oks;
	static void Ok(bool c, string nome) { if (c) { _oks++; Console.WriteLine("PASS " + nome); } else { _fails++; Console.WriteLine("FAIL " + nome); } }
	static AoCeContaNt8 C(string n, string status) { return new AoCeContaNt8 { Name = n, DisplayName = n, Status = status, Presente = AoCeInventario.StatusPresente(status) }; }
	static AoCeFollowerInfo F(string n, bool en, bool def = false) { return new AoCeFollowerInfo { AccountName = n, Enabled = en, Default = def }; }
	static string J(IEnumerable<string> l) { return string.Join(",", l); }

	public static int Main(string[] args)
	{
		try
		{
			// inventario NT8: duas contas firm-like vivas, Sim101 viva, uma conta de conexao antiga (desconectada), uma em queda temporaria
			var nt8 = new List<AoCeContaNt8> { C("ContaB", "Connected"), C("ContaA", "Connected"), C("Sim101", "Connected"), C("Velha", "Disconnected"), C("Caiu", "ConnectionLost") };
			var cfg = new List<AoCeFollowerInfo> { F("ContaB", true), F("Velha", true), F("Fantasma", false, true), F("Sumiu", true), F("VelhaDefault", false, true) };
			nt8.Add(C("VelhaDefault", "Disconnected"));

			// ── COPY01 — leader/followers so por lista explicita ──
			AoCeReconcilio r = AoCeInventario.Reconciliar(nt8, cfg, "ContaA");
			Ok(J(r.Visiveis) == "Caiu,ContaA,ContaB,Sim101", "COPY01a visiveis = SO contas com conexao viva do NT8, por nome (" + J(r.Visiveis) + ")");
			Ok(r.Leader == "ContaA" && r.LeaderValido && r.LeaderMotivo == "ok", "COPY01b leader = o configurado (ContaA), valido");
			Ok(J(r.Novas) == "Caiu,ContaA,Sim101", "COPY01c contas vivas sem config = linha NOVA (desligada), nunca follower automatico (" + J(r.Novas) + ")");
			Ok(J(r.Orfas) == "Fantasma,Sumiu,VelhaDefault" && J(r.Ocultas) == "Velha", "COPY01d config sem conta no NT8 = orfa (purgada); sem conexao viva COM preferencia = oculta (orfas=" + J(r.Orfas) + " ocultas=" + J(r.Ocultas) + ")");
			AoCeReconcilio r2 = AoCeInventario.Reconciliar(nt8, cfg, "ContaA");
			Ok(r2.Resumo() == r.Resumo(), "COPY01e deterministico: mesma entrada => mesmo resultado (" + r.Resumo() + ")");

			// ── COPY02 — nenhum fallback de conta (Sim101 nunca e inventada nem promovida) ──
			AoCeReconcilio s1 = AoCeInventario.Reconciliar(nt8, cfg, "NaoExiste");
			Ok(s1.Leader == null && !s1.LeaderValido && s1.LeaderMotivo.Contains("nao existe"), "COPY02a leader inexistente => SEM leader (invalido); nunca troca para Sim101 nem outra conta (" + s1.LeaderMotivo + ")");
			AoCeReconcilio s2 = AoCeInventario.Reconciliar(nt8, cfg, "Velha");
			Ok(s2.Leader == null && !s2.LeaderValido && s2.LeaderMotivo.Contains("sem conexao viva"), "COPY02b leader sem conexao viva => SEM leader; nenhum substituto (" + s2.LeaderMotivo + ")");
			AoCeReconcilio s3 = AoCeInventario.Reconciliar(nt8, cfg, null);
			Ok(s3.Leader == null && s3.LeaderValido && s3.LeaderMotivo == "sem leader", "COPY02c leader vazio => nenhum leader escolhido sozinho");
			var semSim = nt8.Where(c => c.Name != "Sim101").ToList();
			AoCeReconcilio s4 = AoCeInventario.Reconciliar(semSim, new List<AoCeFollowerInfo> { F("Sim101", true), F("ContaB", true) }, "Sim101");
			Ok(!s4.Visiveis.Contains("Sim101") && s4.Orfas.Contains("Sim101") && s4.Leader == null && !s4.LeaderValido,
				"COPY02d Sim101 ausente do NT8: nunca exibida/inventada; follower Sim101 = orfa; leader Sim101 = invalido (" + s4.Resumo() + ")");
			AoCeReconcilio s5 = AoCeInventario.Reconciliar(new List<AoCeContaNt8>(), cfg, "ContaA");
			Ok(s5.Visiveis.Count == 0 && s5.Novas.Count == 0 && s5.Leader == null && !s5.LeaderValido && s5.Orfas.Count == cfg.Count, "COPY02e NT8 sem contas => nada visivel, sem leader, toda config = orfa (nenhuma conta inventada)");
			AoCeReconcilio s6 = AoCeInventario.Reconciliar(null, null, "ContaA");
			Ok(s6.Visiveis.Count == 0 && s6.Leader == null && !s6.LeaderValido, "COPY02f entradas nulas => fail-closed (sem conta, sem leader)");
			AoCeReconcilio s7 = AoCeInventario.Reconciliar(nt8, cfg, "contaa");
			Ok(!s7.LeaderValido && s7.Leader == null && s7.Visiveis.Contains("ContaA"), "COPY02g (2026-10-06 RAW) leader 'contaa' != conta REAL 'ContaA' => SEM leader, nunca casa por caixa (" + s7.LeaderMotivo + ")");

			// ── PNL — escopo por conta do PnL agregado do Copy ──
			var pnl = new List<AoCePnlConta> {
				new AoCePnlConta { Name = "ContaA", Enabled = true,  Presente = true,  Realizado = 1000, Aberto = 100 },   // leader
				new AoCePnlConta { Name = "ContaB", Enabled = true,  Presente = true,  Realizado = 50.5, Aberto = -10.25 },
				new AoCePnlConta { Name = "contab", Enabled = true,  Presente = true,  Realizado = 999,  Aberto = 999 },   // duplicata
				new AoCePnlConta { Name = "Sim101", Enabled = false, Presente = true,  Realizado = 7777, Aberto = 7777 },  // nao e follower
				new AoCePnlConta { Name = "Velha",  Enabled = true,  Presente = false, Realizado = 5555, Aberto = 5555 },  // sem conexao
			};
			AoCePnlAgregado g = AoCePnl.Somar(pnl, "ContaA");
			Ok(g.Contas == 2 && J(g.Nomes) == "ContaB,contab" && g.Realizado == 1049.5 && g.Aberto == 988.75,
				"COPYPNL01 (2026-10-06 RAW) PnL agregado = followers habilitados e presentes, sem o leader, 'contab' = conta distinta de 'ContaB', sem Sim101 desligada (" + J(g.Nomes) + " total=" + g.Total + ")");
			AoCePnlAgregado g0 = AoCePnl.Somar(pnl, null);
			Ok(g0.Contas == 3 && J(g0.Nomes) == "ContaA,ContaB,contab", "COPYPNL02 sem leader: soma as contas habilitadas e presentes, cada uma 1x (" + J(g0.Nomes) + ")");
			Ok(AoCePnl.Somar(null, "ContaA").Contas == 0, "COPYPNL03 lista nula => zero contas");
		}
		catch (Exception ex) { _fails++; Console.WriteLine("FAIL EXCECAO " + ex); }
		Console.WriteLine();
		Console.WriteLine("COPY: " + _oks + " PASS / " + _fails + " FAIL");
		return _fails == 0 ? 0 : 1;
	}
}
