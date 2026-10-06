// (2026-10-05) Aplica A4 (sinalizacao ACCOUNT_MISMATCH) da PROPOSED_account_p1s.txt no STAGING. Uso unico.
const rep = require('./rep_edit.js');
const S = __dirname + '/staging/';

rep(S + 'AddOns/AlfaOmegaRoboAtivos.cs', [
[`	public static class AoRoboAtivos
	{`,
`	/// <summary>
	/// (2026-10-05) SINALIZACAO de conta divergente — peca pura, SO texto de painel. A conta de EXECUCAO do robo e a do
	/// ativo (secao ATIVOS → ativos.json); a propriedade "Conta" do painel e a da boleta manual daquele grafico. Quando o
	/// grafico e de um ativo do robo e as duas diferem, o painel avisa. Nunca troca conta, nunca bloqueia, nunca propaga.
	/// </summary>
	public static class AoContaMismatch
	{
		public const string Codigo = "ACCOUNT_MISMATCH";

		/// <summary>O grafico (FullName do instrumento, ex.: "MES 12-26") e o do ativo? Pelo contrato resolvido; senao pela raiz.</summary>
		public static bool Corresponde(string instrChart, string codigoAtivo, string nt8Ativo)
		{
			if (string.IsNullOrEmpty(instrChart) || string.IsNullOrEmpty(codigoAtivo)) return false;
			string ic = instrChart.Trim();
			if (!string.IsNullOrEmpty(nt8Ativo)) return string.Equals(ic, nt8Ativo.Trim(), StringComparison.OrdinalIgnoreCase);
			int sp = ic.IndexOf(' ');
			string raiz = sp > 0 ? ic.Substring(0, sp) : ic;
			return string.Equals(raiz, codigoAtivo.Trim(), StringComparison.OrdinalIgnoreCase);
		}

		/// <summary>
		/// null = sem divergencia (grafico de outro instrumento, painel sem conta, ou contas iguais).
		/// Senao "ACCOUNT_MISMATCH: robo=&lt;ROBOT_ACCOUNT&gt; · grafico=&lt;CHART_ACCOUNT&gt; (&lt;ATIVO&gt;)".
		/// </summary>
		public static string Avaliar(string instrChart, string contaChart, string codigoAtivo, string nt8Ativo, string contaAtivo)
		{
			if (!Corresponde(instrChart, codigoAtivo, nt8Ativo)) return null;
			string cc = (contaChart ?? "").Trim(), ca = (contaAtivo ?? "").Trim();
			if (cc.Length == 0) return null;
			if (string.Equals(cc, ca, StringComparison.OrdinalIgnoreCase)) return null;
			return Codigo + ": robo=" + (ca.Length == 0 ? "(nenhuma)" : ca) + " · grafico=" + cc + " (" + codigoAtivo.Trim() + ")";
		}
	}

	public static class AoRoboAtivos
	{`]]);

rep(S + 'Indicators/TTW_DarkProjects/AoControlCenter.cs', [
// helper
[`		private string Acc()
		{
			return string.IsNullOrEmpty(Conta) ? "" : Conta.Trim();
		}
`,
`		private string Acc()
		{
			return string.IsNullOrEmpty(Conta) ? "" : Conta.Trim();
		}

		/// <summary>
		/// (2026-10-05) ACCOUNT_MISMATCH — SO sinalizacao. A conta de EXECUCAO do robo e a do ativo (secao ATIVOS → ativos.json);
		/// a propriedade "Conta" deste painel e a da boleta manual. Se este grafico e de um ativo do robo e as duas diferem,
		/// devolve o aviso (ROBOT_ACCOUNT × CHART_ACCOUNT). Nunca chama SetConta, nunca bloqueia. null = sem divergencia.
		/// </summary>
		private string ContaMismatchMsg(out string codigoAtivo)
		{
			codigoAtivo = null;
			try
			{
				string instr = Instr(), conta = Acc();
				if (instr.Length == 0 || conta.Length == 0) return null;
				foreach (var a in AoRoboAtv.Todos())
				{
					if (NinjaTrader.NinjaScript.AddOns.AoContaMismatch.Avaliar(instr, conta, a.Codigo, a.Nt8, a.Account) == null) continue;
					codigoAtivo = a.Codigo;
					return "⚠ CONTA ≠ ROBÔ · robô=" + (string.IsNullOrEmpty(a.Account) ? "(nenhuma)" : AoAccountNames.Display(a.Account))
						 + " · gráfico=" + AoAccountNames.Display(conta) + " (" + a.Codigo + ")";
				}
			}
			catch { }
			return null;
		}
`],
// COMPACTO: aviso na faixa do titulo do PNL (sem mudar layout)
[`					AoSkin.Text(rt, pnlTitulo, _fBand, cx0, cy0, cw, hBand, AoTheme.Dx(CcLabel), AoAlign.Left, true);
					string heroTxt = pnlOk ? Money(pnlCentral) : "—";`,
`					AoSkin.Text(rt, pnlTitulo, _fBand, cx0, cy0, cw, hBand, AoTheme.Dx(CcLabel), AoAlign.Left, true);
					// (2026-10-05) ACCOUNT_MISMATCH tambem no COMPACTO (a secao ATIVOS fica oculta aqui): mesma faixa do titulo, a direita.
					{
						string mmCod; string mmMsg = ContaMismatchMsg(out mmCod);
						if (mmMsg != null)
						{
							float tW = AoSkin.Measure(pnlTitulo, _fBand) + lh * 0.6f;
							if (cw - tW > lh * 2f)
								AoSkin.Text(rt, Truncar(mmMsg, _fSmall, cw - tW), _fSmall, cx0 + tW, cy0, cw - tW, hBand, AoTheme.Dx(AoTheme.Warn), AoAlign.Right, true);
						}
					}
					string heroTxt = pnlOk ? Money(pnlCentral) : "—";`],
// FULL: linha do ativo do proprio grafico
[`					if (_dropCod != null && DateTime.Now > _dropUntil) _dropCod = null;
					foreach (var a in AoRoboAtv.Todos())
					{`,
`					if (_dropCod != null && DateTime.Now > _dropUntil) _dropCod = null;
					string mismatchCod; string mismatchMsg = ContaMismatchMsg(out mismatchCod);   // (2026-10-05) so sinalizacao
					foreach (var a in AoRoboAtv.Todos())
					{`],
[`						string inst = a.Nt8 ?? "sem vencimento (runtime.json)";
						AoSkin.Text(rt, inst, _fSmall, ix, y, xR - ix - lh * 0.3f, hAtv,
									AoTheme.Dx(a.Nt8 == null ? AoTheme.Warn : CcGrey), AoAlign.Left, true);`,
`						string inst = a.Nt8 ?? "sem vencimento (runtime.json)";
						bool mismatchAqui = mismatchCod != null && mismatchCod == a.Codigo;   // (2026-10-05) conta do robo ≠ conta deste grafico
						if (mismatchAqui) inst += " ≠ gráfico";
						AoSkin.Text(rt, inst, _fSmall, ix, y, xR - ix - lh * 0.3f, hAtv,
									AoTheme.Dx(a.Nt8 == null || mismatchAqui ? AoTheme.Warn : CcGrey), AoAlign.Left, true);`],
[`						if (AoCopyMst.UltimoErro != null || AoRoboAtv.UltimoErro != null)
							AoSkin.Text(rt, "⚠ " + (AoCopyMst.UltimoErro ?? AoRoboAtv.UltimoErro), _fSmall, x0 + pad, y, tw, hAtv, AoTheme.Dx(AoTheme.Short_), AoAlign.Right, true);`,
`						if (AoCopyMst.UltimoErro != null || AoRoboAtv.UltimoErro != null)
							AoSkin.Text(rt, "⚠ " + (AoCopyMst.UltimoErro ?? AoRoboAtv.UltimoErro), _fSmall, x0 + pad, y, tw, hAtv, AoTheme.Dx(AoTheme.Short_), AoAlign.Right, true);
						else if (mismatchMsg != null && !copyArmed)   // (2026-10-05) mesma vaga de aviso, sem linha nova
						{
							float livre = tw * 0.5f;
							AoSkin.Text(rt, Truncar(mismatchMsg, _fSmall, livre), _fSmall, x0 + pad + tw - livre, y, livre, hAtv, AoTheme.Dx(AoTheme.Warn), AoAlign.Right, true);
						}`],
]);
