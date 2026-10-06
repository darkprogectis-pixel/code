// RESIDUAL (2026-10-06) — R01–R09 por EXECUCAO: pecas puras REAIS do staging (AlfaOmegaCopyEngineContas.cs, AoAccountNames.cs)
// + metodos de conta extraidos verbatim do staging (out\ResidualExtracted.cs). Sem NT8, sem conta real, sem ordem.
using System;
using System.Collections.Generic;
using System.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript.AddOns;
using NinjaTrader.NinjaScript.Indicators;
using ResidualX;

public static class ProgramResidual
{
	static int _fails, _oks;
	static void Ok(bool c, string nome) { if (c) { _oks++; Console.WriteLine("PASS " + nome); } else { _fails++; Console.WriteLine("FAIL " + nome); } }
	static Account A(string n, Provider p) { var a = new Account { Name = n, Provider = p }; Account.All.Add(a); return a; }
	static AoCeContaNt8 C(string n) { return new AoCeContaNt8 { Name = n, DisplayName = n, Status = "Connected", Presente = true }; }
	static string J(IEnumerable<string> l) { return string.Join(",", l); }
	const string UP = "CASE-DUP-77", MX = "Case-Dup-77", LOW = "case-dup-77";
	const string CJK = "Sim阿爾法・歐米伽 止盈 — 艾克斯・懷伊 零零一", LONG = "PROP-ACCOUNT-WITH-A-VERY-LONG-IDENTIFIER-0123456789-ABCDEFGHIJ-阿爾法歐米伽-0001";

	public static int Main(string[] args)
	{
		try
		{
			// inventario: ordem de insercao poe a variante MX ANTES de UP (o 1o match antigo escolheria MX para UP)
			Account mx = A(MX, Provider.Simulator), up = A(UP, Provider.Rithmic), cjk = A(CJK, Provider.Simulator),
					lng = A(LONG, Provider.Unknown), tv = A("TradovateX", Provider.Tradovate);

			// R01 — contas que diferem so por caixa sao identidades distintas
			Ok(ReferenceEquals(Motor.Find(UP), up) && ReferenceEquals(Motor.Find(MX), mx), "R01a Motor.Find: CASE-DUP-77 -> CASE-DUP-77 e Case-Dup-77 -> Case-Dup-77");
			Ok(Links.K("L1", UP) != Links.K("L1", MX), "R01b Links.K: vinculos distintos por caixa (" + Links.K("L1", UP) + " != " + Links.K("L1", MX) + ")");
			Ok(Links.SourceKey(UP, "o1", "MES 12-26") != Links.SourceKey(MX, "o1", "MES 12-26"), "R01c SourceKey: origem distinta por caixa");
			Ok(Links.K("663763181118", "TAKEPROFIT236132934") == "663763181118|TAKEPROFIT236132934", "R01d compat: chave RAW de conta MAIUSCULA == formato persistido (links.json 606 vinculos)");

			// R02 — CopyEngine nunca redireciona para variante de caixa
			Ok(ReferenceEquals(new Follower { AccountName = UP }.Resolve(), up) && ReferenceEquals(new Follower { AccountName = MX }.Resolve(), mx), "R02a follower.Resolve RAW exato por caixa");
			string why;
			Ok(!Filters.WouldLoop(MX, UP, new[] { UP }, out why), "R02b WouldLoop: Case-Dup-77 follower de CASE-DUP-77 = contas distintas, sem falso self-copy");
			Ok(Filters.WouldLoop(UP, UP, null, out why) && Filters.WouldLoop(MX, "X", new[] { MX }, out why), "R02c WouldLoop: a MESMA conta RAW continua bloqueada (self/loop)");
			var nt8 = new List<AoCeContaNt8> { C(MX), C(UP), C(CJK) };
			var cfg = new List<AoCeFollowerInfo> { new AoCeFollowerInfo { AccountName = LOW, Enabled = true }, new AoCeFollowerInfo { AccountName = UP, Enabled = true } };
			AoCeReconcilio r = AoCeInventario.Reconciliar(nt8, cfg, UP);
			Ok(r.Visiveis.Contains(MX) && r.Visiveis.Contains(UP) && r.Visiveis.Count == 3, "R02d Reconciliar: as duas variantes aparecem (nenhuma some por 1o match) (" + J(r.Visiveis) + ")");
			Ok(r.Orfas.Contains(LOW) && !r.Novas.Contains(UP) && r.Novas.Contains(MX), "R02e follower persistido 'case-dup-77' = ORFA (nao herda CASE-DUP-77); Case-Dup-77 = nova (" + r.Resumo() + ")");
			Ok(r.Leader == UP && r.LeaderValido, "R02f leader CASE-DUP-77 valido e exato");
			AoCeReconcilio r2 = AoCeInventario.Reconciliar(nt8, cfg, LOW);
			Ok(r2.Leader == null && !r2.LeaderValido, "R02g leader 'case-dup-77' (nao existe RAW) => SEM leader, nunca CASE-DUP-77/Case-Dup-77 (" + r2.LeaderMotivo + ")");
			var pnl = new List<AoCePnlConta> {
				new AoCePnlConta { Name = UP, Enabled = true, Presente = true, Realizado = 10, Aberto = 0 },
				new AoCePnlConta { Name = MX, Enabled = true, Presente = true, Realizado = 5, Aberto = 1 } };
			AoCePnlAgregado g = AoCePnl.Somar(pnl, UP);
			Ok(g.Contas == 1 && J(g.Nomes) == MX && g.Total == 6, "R02h PnL: leader CASE-DUP-77 excluido, Case-Dup-77 somada (contas distintas) (" + J(g.Nomes) + " " + g.Total + ")");

			// R03 — boleta (e boleta do Control Center) resolvem a Account RAW escolhida
			Ok(ReferenceEquals(Boleta.Conta(UP), up) && ReferenceEquals(Boleta.Conta(MX), mx), "R03a AoBasicEntryBoleta.Conta RAW exato");
			Ok(ReferenceEquals(CC.FindAcc(UP), up) && ReferenceEquals(CC.FindAcc(MX), mx), "R03b AoControlCenter.FindAcc RAW exato");

			// R04 — AoAccountNames nao colapsa identidades
			AoAccountNames.Publish(UP, "LEADER-REAL");
			Ok(AoAccountNames.Display(UP) == "LEADER-REAL" && AoAccountNames.Display(MX) == MX && AoAccountNames.IsRawName(MX), "R04a alias de CASE-DUP-77 NAO aparece em Case-Dup-77 (" + AoAccountNames.Display(MX) + ")");
			AoAccountNames.SetOverride(MX, "SIM-CASE");
			Ok(AoAccountNames.Display(MX) == "SIM-CASE" && AoAccountNames.Display(UP) == "LEADER-REAL", "R04b rotulos proprios por caixa");
			AoAccountNames.ClearPublished(); AoAccountNames.RevertAll();

			// R05 — inexistente => fail-closed (null), sem fallback
			Ok(Motor.Find(LOW) == null && Boleta.Conta(LOW) == null && CC.FindAcc(LOW) == null && new Follower { AccountName = LOW }.Resolve() == null, "R05a 'case-dup-77' inexistente RAW => null em Find/Conta/FindAcc/Resolve");
			Ok(Motor.Find("") == null && Boleta.Conta(null) == null && new Follower { AccountName = null }.Resolve() == null, "R05b vazio/nulo => null");

			// R06 — provider/tipo nao muda resolucao (sem gate)
			Ok(ReferenceEquals(Motor.Find(LONG), lng) && ReferenceEquals(Motor.Find("TradovateX"), tv) && ReferenceEquals(Motor.Find(UP), up), "R06 Unknown/Tradovate/Rithmic resolvidos igual a Simulator (provider so telemetria)");

			// R07 — Unicode/CJK e nome longo
			Ok(ReferenceEquals(Boleta.Conta(CJK), cjk) && ReferenceEquals(new Follower { AccountName = LONG }.Resolve(), lng) && Links.K("x", CJK).EndsWith(CJK), "R07 CJK e nome longo resolvidos RAW, chave preserva o nome exato");

			// R08 — nenhum fallback: removendo a conta, nada a substitui
			Account.All.Remove(up);
			Ok(Motor.Find(UP) == null && Boleta.Conta(UP) == null && CC.FindAcc(UP) == null, "R08a CASE-DUP-77 removida do NT8 => null (Case-Dup-77 presente NAO a substitui)");
			Account.All.Add(up);

			// R09 — nenhuma ordem: o harness nao tem caminho de submit (stub sem CreateOrder/Submit)
			Ok(typeof(Account).GetMethods().All(m => m.Name != "Submit" && m.Name != "CreateOrder"), "R09 stub sem Submit/CreateOrder => ORDERS_SENT=0 por construcao");
		}
		catch (Exception ex) { _fails++; Console.WriteLine("FAIL EXCECAO " + ex); }
		Console.WriteLine();
		Console.WriteLine("RESIDUAL: " + _oks + " PASS / " + _fails + " FAIL");
		return _fails == 0 ? 0 : 1;
	}
}
