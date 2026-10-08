// STAGING ONLY: aplica o design JANELA_30 (JEV DESIGN req_01a11b83310e7c01a1bd133b3ab8f0cc) sobre staging\before -> staging\after.
// 3 arquivos: AlfaOmegaSharedState.cs (classe AoForcaJanela + campos + passo 4 do AoGate), AoTapeEngine.cs (alimenta a janela),
// AoMarketDataPublisher.cs (publica). Substituicoes exatas; aborta se um trecho nao for encontrado exatamente 1 vez. Nunca toca o NT8.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..', 'staging'), I = 'Indicators/TTW_DarkProjects';
function patch(file, edits) {
  const src = path.join(D, 'before', I, file), dst = path.join(D, 'after', I, file);
  let s = fs.readFileSync(src, 'utf8'); const bom = s.charCodeAt(0) === 0xFEFF; if (bom) s = s.slice(1);
  const crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length - crlf, EOL = crlf > lf ? '\r\n' : '\n';
  const N = t => t.replace(/\r?\n/g, EOL);
  for (const [a, b, mode] of edits) {
    if (a instanceof RegExp) { const m = s.match(new RegExp(a.source, a.flags.replace('g', '') + 'g')) || []; if (m.length !== 1) { console.log('ABORT', file, 'regex matches', m.length, String(a).slice(0, 60)); process.exit(1); } s = s.replace(a, N(b)); continue; }
    if (mode === 'eol') { const aa = N(a); const k = s.split(aa).length - 1; if (k !== 1) { console.log('ABORT', file, 'occurrences(eol)', k); process.exit(1); } s = s.replace(aa, N(b)); continue; }
    const n = s.split(a).length - 1; if (n !== 1) { console.log('ABORT', file, 'occurrences', n, JSON.stringify(a.slice(0, 70))); process.exit(1); }
    s = mode === 'after' ? s.replace(a, a + N(b)) : mode === 'before' ? s.replace(a, N(b) + a) : s.replace(a, N(b));
  }
  fs.writeFileSync(dst, (bom ? '﻿' : '') + s); console.log('patched', file, 'EOL', EOL === '\n' ? 'LF' : 'CRLF', 'BOM', bom);
}
const CLASSE = `
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
`;
patch('AlfaOmegaSharedState.cs', [
  ['		public static System.DateTime PressVolUpdate_NQ { get; set; }', `
		// (2026-10-08) FORCA_JANELA_30 — medida de forca do passo 4 do AoGate.EsNq (z-score em janela movel de 30 min),
		// publicada pelo AoMarketDataPublisher (eleicao propria "<sym>|Z"). null = sem publicador ⇒ o gate reprova por forca.
		public static AoForcaJanela Forca_ES { get; set; }
		public static AoForcaJanela Forca_NQ { get; set; }`, 'after'],
  ['		public const double PressNormVbarNq  = 520328.0;', `

		// (2026-10-08) FORCA_JANELA_30 — limiar do passo 4 sobre o z-score da janela (AoForcaJanela), unico p/ ES e NQ.
		// Calibrado em 16 pregoes reais (2026-08-03..2026-08-26) para ~17,5 entradas/sessao e conferido fora da amostra em 28
		// (2026-08-27..2026-10-06): 20,7 entradas/sessao, contra 148/sessao sem passo de forca.
		public const double ForcaZMin = 3.454;`, 'after'],
  ['		public static AoGateResult EsNq(double minForce, double freshSec)', `		public static AoGateResult EsNq(double minForce, double freshSec) { return EsNq(minForce, freshSec, DateTime.Now); }

		// (2026-10-08) o MESMO gate com o relogio explicito (harness offline). Producao entra pela sobrecarga acima.
		public static AoGateResult EsNq(double minForce, double freshSec, DateTime now)`],
  ['			DateTime now = DateTime.Now;\n			DateTime uEs', '			DateTime uEs', 'eol'],
  [/\t\t\t\/\/ 4\) forca minima nos DOIS[\s\S]*?(\t\t\tr\.Dir = esDir; r\.Ok = true;)/, `			// 4) forca nos DOIS — (2026-10-08) FORCA_JANELA_30 (JEV DESIGN req_01a11b83310e7c01a1bd133b3ab8f0cc): z-score do fluxo
			//    agressor em janela movel de 30 min por simbolo (AoForcaJanela), sem reset de sessao. Aprova so com o SINAL de z igual
			//    a direcao do simbolo E |z| >= ForcaZMin, nos dois. Medida indisponivel (sem publicador / janela nao coberta) = reprova.
			//    As mensagens seguem "forca fraca ..." (o motor e o aot-sim tratam esse prefixo como NEUTRO transitorio).
			//    \`minForce\`, Press_* e LimiarForca ficam como telemetria/compatibilidade: nao decidem mais o passo 4.
			double zEs, zNq;
			bool okEs = AoForcaJanela.Avaliar(AlfaOmegaSharedState.Forca_ES, now, out zEs) && (esDir > 0 ? zEs >= ForcaZMin : zEs <= -ForcaZMin);
			bool okNq = AoForcaJanela.Avaliar(AlfaOmegaSharedState.Forca_NQ, now, out zNq) && (nqDir > 0 ? zNq >= ForcaZMin : zNq <= -ForcaZMin);
			if (!okEs || !okNq)
			{
				r.Why = (!okEs && !okNq) ? "forca fraca ES/NQ" : (!okEs ? "forca fraca ES" : "forca fraca NQ");
				return r;
			}

$1`],
  [/\}\s*$/, CLASSE + '}\n'],
]);
patch('AoTapeEngine.cs', [
  ['		private readonly AoPressSessao _pressSessao = new AoPressSessao();', `
		// (2026-10-08) FORCA_JANELA_30 — janela movel do passo 4 do AoGate (z-score). Alimentada por TODO negocio (ao vivo e historico).
		private readonly AoForcaJanela _forca = new AoForcaJanela();`, 'after'],
  ['		public string   PressMotivo { get { return _pressSessao.Motivo; } }', `
		/// <summary>(2026-10-08) Medida de forca do passo 4 (z-score em janela movel de 30 min). Quem publica e o AoMarketDataPublisher.</summary>
		public AoForcaJanela Forca { get { return _forca; } }`, 'after'],
  [/(\t\t\t_pressSessao\.ViradaSessao\(realtime, t, inicioSessao\);[^\r\n]*)/, `$1
			_forca.ViradaSessao(t);                                  // (2026-10-08) a pausa da virada nao e buraco de tape p/ a janela`],
  ['			_pressSessao.TickHistorico(side, volume, time, valida);', `
			_forca.Tick(side, volume, time);                         // (2026-10-08) reconstrucao da janela na carga`, 'after'],
  ['			long vol = volume;', `
			_forca.Tick(side, vol, now);                             // (2026-10-08) FORCA_JANELA_30: todo negocio entra na janela`, 'after'],
]);
patch('AoMarketDataPublisher.cs', [
  ['					try { AoPublisher.Liberar(sym, instancia); } catch { }', `
					try { AoPublisher.Liberar(sym + "|Z", instancia); } catch { }   // (2026-10-08) posto da FORCA_JANELA_30`, 'after'],
  ['			if (tipo == AoTick.Last) Publicar(instancia, m);', '			if (tipo == AoTick.Last) { PublicarForca(instancia, m); Publicar(instancia, m); }'],
  ['		/// <summary>Linha curta para o painel: quem esta publicando e ha quanto tempo.</summary>', `		/// <summary>
		/// (2026-10-08) FORCA_JANELA_30: publica a medida de forca do passo 4 (AoForcaJanela do motor desta instancia).
		/// Eleicao PROPRIA (chave "sym|Z"): independe de quem venceu a eleicao do tape (FlowOne ou Control Center), porque so
		/// este motor calcula a janela. Um unico Control Center escreve; os demais seguem calculando. Nunca lanca.
		/// </summary>
		private static void PublicarForca(long instancia, AoTapeEngine m)
		{
			try
			{
				string sym = m.Simbolo;
				if (!AoPublisher.PodePublicar(sym + "|Z", instancia)) return;
				m.Forca.MarcarLocal(DateTime.Now);
				if (string.Equals(sym, "ES", StringComparison.OrdinalIgnoreCase)) AlfaOmegaSharedState.Forca_ES = m.Forca;
				else if (string.Equals(sym, "NQ", StringComparison.OrdinalIgnoreCase)) AlfaOmegaSharedState.Forca_NQ = m.Forca;
			}
			catch { }
		}

`, 'before'],
]);
