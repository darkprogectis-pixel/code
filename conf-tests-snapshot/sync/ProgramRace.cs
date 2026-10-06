// RACE_EXECUCOES (2026-10-01) — T1 estresse + T2 fill durante Add/reserva/erro, sobre os metodos REAIS do staging
// (RegistrarExecucao, GravarExecucoes, RemoverExecucao, OnFillEntrada, AplicarFillOrfao, GuardarFillOrfao, AplicarFillsOrfaosPendentes,
// ExecucoesGerenciadas, SnapExecucoes) extraidos por gen_race_harness.js. Stub so do ProtegerFill (BracketCore/ChangeCore = broker).
// Chamadas por reflexao: o mesmo programa roda contra a fonte ANTERIOR (controle) sem os metodos novos.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using Newtonsoft.Json.Linq;

namespace RaceSim
{
	public static partial class AlfaOmegaRoboSim
	{
		public static readonly Dictionary<string, int> Brackets = new Dictionary<string, int>(StringComparer.Ordinal);
		public static int ThrowNext;                         // >0: proximo ProtegerFill lanca (simula erro na thread do NT8)
		public static Action<string> DuranteProtecao;        // gancho chamado no meio do ProtegerFill (fora de qualquer lock do stub)

		/// <summary>Stub idempotente com a mesma forma do real: escrita no registro sob _protGate; CRIAR na 1a qty, AJUSTAR depois.</summary>
		private static void ProtegerFill(JObject e, int preenchida, double precoMedio, DateTime agora)
		{
			string id = (string)e["intentId"];
			if (Interlocked.Decrement(ref ThrowNext) >= 0) throw new InvalidOperationException("simulado: falha no ProtegerFill");
			Action<string> g = DuranteProtecao; if (g != null) g(id);
			lock (_protGate)
			{
				int protegida = e["qty_protegida"] == null ? 0 : (int)e["qty_protegida"];
				if (preenchida <= protegida) return;
				e["qty_protegida"] = preenchida;
				lock (Brackets) { int n; Brackets.TryGetValue(id, out n); Brackets[id] = protegida == 0 ? n + 1 : n; }
			}
		}
	}

	public static class ProgramRace
	{
		static int pass, fail;
		static readonly Type S = typeof(AlfaOmegaRoboSim);
		static object Call(string m, params object[] a)
		{
			MethodInfo mi = S.GetMethod(m, BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public);
			if (mi == null) throw new MissingMethodException(m);
			try { return mi.Invoke(null, a); } catch (TargetInvocationException ex) { throw ex.InnerException; }
		}
		static bool Tem(string m) { return S.GetMethod(m, BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public) != null; }
		static T Campo<T>(string f) { return (T)S.GetField(f, BindingFlags.Static | BindingFlags.NonPublic).GetValue(null); }
		static void Ok(bool c, string nome, string det) { if (c) pass++; else fail++; Console.WriteLine((c ? "PASS " : "FAIL ") + nome + (det == null ? "" : "   [" + det + "]")); }
		static JObject Reg(string id) { return new JObject { { "intentId", id }, { "qty_protegida", 0 }, { "instrumento", "ES" }, { "nt8_account", "Sim101" } }; }
		static void Fill(string id, int q) { Call("OnFillEntrada", id, "ES", "c1", q, 100.0, DateTime.UtcNow); }
		static void Ciclo() { if (Tem("AplicarFillsOrfaosPendentes")) Call("AplicarFillsOrfaosPendentes", DateTime.UtcNow); }
		static int Erros() { lock (AoRoboAudit.Eventos) return AoRoboAudit.Eventos.Count(x => x.StartsWith("protecao_erro|")); }
		static int Bk(string id) { lock (AlfaOmegaRoboSim.Brackets) { int n; AlfaOmegaRoboSim.Brackets.TryGetValue(id, out n); return n; } }
		static void Reset()
		{
			lock (Campo<object>("_protGate")) { Campo<List<JObject>>("_execucoes").Clear(); Campo<Dictionary<string, JObject>>("_fillsOrfaos").Clear(); }
			lock (AlfaOmegaRoboSim.Brackets) AlfaOmegaRoboSim.Brackets.Clear();
			lock (AoRoboAudit.Eventos) AoRoboAudit.Eventos.Clear();
			AlfaOmegaRoboSim.ThrowNext = 0; AlfaOmegaRoboSim.DuranteProtecao = null;
		}

		public static int Main(string[] args)
		{
			Console.WriteLine("metodos reais: " + string.Join(", ", AlfaOmegaRoboSim.Presentes) + (AlfaOmegaRoboSim.Ausentes.Length > 0 ? "  · ausentes na fonte: " + string.Join(", ", AlfaOmegaRoboSim.Ausentes) : ""));
			int n = args.Length > 0 ? int.Parse(args[0]) : 600;

			// ── T1 estresse: A registra (+ ruido Add/Remove) e aplica orfao como o ExecutarAlvo; B = fills do NT8; C = enumeracoes da thread do robo
			Reset();
			int excC = 0, excA = 0, excB = 0, enumeracoes = 0;
			bool fim = false;
			var ids = Enumerable.Range(0, n).Select(i => "AO-T1-" + i).ToArray();
			var tA = new Thread(() =>
			{
				for (int i = 0; i < n; i++)
				{
					try
					{
						Call("RegistrarExecucao", Reg("RUIDO-" + i)); Call("RegistrarExecucao", Reg(ids[i]));
						Call("AplicarFillOrfao", ids[i], DateTime.UtcNow);   // = ExecutarAlvo apos o place
						Call("RemoverExecucao", "RUIDO-" + i);
					}
					catch { Interlocked.Increment(ref excA); }
				}
			});
			var tB = new Thread(() => { for (int i = 0; i < n; i++) { try { Fill(ids[i], 1); } catch { Interlocked.Increment(ref excB); } } });
			var tC = new Thread(() =>
			{
				while (!Volatile.Read(ref fim))
				{
					try
					{
						var l = Tem("SnapExecucoes") ? (List<JObject>)Call("SnapExecucoes") : Campo<List<JObject>>("_execucoes");
						int c = 0; foreach (JObject e in l) if ((string)e["intentId"] != null) c++;
						c += ((List<JObject>)Call("ExecucoesGerenciadas")).Count;
						enumeracoes++;
					}
					catch { Interlocked.Increment(ref excC); }
				}
			});
			tA.Start(); tB.Start(); tC.Start(); tA.Join(); tB.Join(); Volatile.Write(ref fim, true); tC.Join();
			Ciclo();   // ciclo seguinte do robo
			int perdidos = ids.Count(id => Bk(id) != 1);
			int erros = Erros();
			Ok(erros == 0 && excA == 0 && excB == 0 && excC == 0, "T1 estresse " + n + " registros × " + n + " fills NT8 × " + enumeracoes + " enumeracoes: 0 excecoes",
			   "protecao_erro=" + erros + " excA=" + excA + " excB=" + excB + " excC=" + excC);
			Ok(perdidos == 0, "T1 0 fill perdido: toda perna com fill recebeu exatamente 1 bracket", "sem_bracket_ou_duplicado=" + perdidos + "/" + n);

			// ── T2 fill que chega durante/antes do Add ⇒ bracket (direto ou via orfao no ciclo seguinte)
			Reset();
			Fill("AO-T2a", 1);
			bool orfao = Campo<Dictionary<string, JObject>>("_fillsOrfaos").ContainsKey("AO-T2a");
			Call("RegistrarExecucao", Reg("AO-T2a"));
			Ciclo();
			Ok(orfao && Bk("AO-T2a") == 1, "T2a fill antes do registro → orfao → bracket no ciclo seguinte (sem depender do ExecutarAlvo)", "orfao=" + orfao + " brackets=" + Bk("AO-T2a"));

			Reset();
			Call("RegistrarExecucao", Reg("AO-T2b"));
			bool reservaOk = AlfaOmegaRoboSim.TemProtEmCurso;
			HashSet<string> emCurso = reservaOk ? Campo<HashSet<string>>("_protEmCurso") : null;
			if (reservaOk) lock (Campo<object>("_protGate")) emCurso.Add("AO-T2b");
			Fill("AO-T2b", 1);
			int durante = Bk("AO-T2b");
			if (reservaOk) lock (Campo<object>("_protGate")) emCurso.Remove("AO-T2b");
			Ciclo();
			Ok(reservaOk && durante == 0 && Bk("AO-T2b") == 1, "T2b fill com chamada ao broker em curso na perna (reserva) → orfao → bracket no ciclo seguinte", "reserva=" + reservaOk + " durante=" + durante + " depois=" + Bk("AO-T2b"));

			Reset();
			Call("RegistrarExecucao", Reg("AO-T2c"));
			AlfaOmegaRoboSim.ThrowNext = 1;
			Fill("AO-T2c", 1);
			int errC = Erros();
			Ciclo();
			Ok(errC == 1 && Bk("AO-T2c") == 1, "T2c erro no ProtegerFill (thread NT8) → fill guardado como orfao (R5) → bracket no ciclo seguinte", "protecao_erro=" + errC + " brackets=" + Bk("AO-T2c"));

			// T2d: fill do NT8 enquanto a thread do robo esta no ProtegerFill do orfao (fora do lock): sem deadlock, AJUSTAR no ciclo seguinte
			Reset();
			Fill("AO-T2d", 1);
			Call("RegistrarExecucao", Reg("AO-T2d"));
			bool fezFill = false, terminou = false;
			AlfaOmegaRoboSim.DuranteProtecao = id =>
			{
				if (id != "AO-T2d" || fezFill) return;
				fezFill = true;
				var t = new Thread(() => Fill("AO-T2d", 2)); t.Start(); terminou = t.Join(5000);
			};
			Call("AplicarFillOrfao", "AO-T2d", DateTime.UtcNow);
			AlfaOmegaRoboSim.DuranteProtecao = null;
			int qtyAntes = (int)Campo<List<JObject>>("_execucoes").First(x => (string)x["intentId"] == "AO-T2d")["qty_protegida"];
			Ciclo();
			int qtyDepois = (int)Campo<List<JObject>>("_execucoes").First(x => (string)x["intentId"] == "AO-T2d")["qty_protegida"];
			Ok(terminou && Bk("AO-T2d") == 1 && qtyDepois == 2, "T2d fill NT8 durante a protecao do orfao na thread do robo: sem deadlock, 1 bracket, qty ajustada a 2 no ciclo seguinte",
			   "fill_nt8_terminou=" + terminou + " brackets=" + Bk("AO-T2d") + " qty_apos_orfao=" + qtyAntes + " qty_ciclo_seguinte=" + qtyDepois);

			try { System.IO.File.Delete(AlfaOmegaRoboSim.ExecucoesFile); } catch { }
			Console.WriteLine("RESULTADO race: pass=" + pass + " fail=" + fail);
			return fail;
		}
	}
}
