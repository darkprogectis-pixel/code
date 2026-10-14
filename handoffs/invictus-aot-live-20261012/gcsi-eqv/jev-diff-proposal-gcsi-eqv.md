# JEV DIFF — GC/SI = ES/NQ (staging gcsi-eqv, 14/10/2026) — proposta NÃO aplicada em produção

Objetivo (ordem do operador): GC/SI funcionam exatamente como ES/NQ no Alfa Omega Gate, incluindo o passo 4 (força). 4/4 com força fraca ⇒ ESPERANDO CONFIRMAÇÃO, sem direção nem ordem. Simulador GC/SI independente com canal isolado e histórico exclusivo. Zero ordens reais, conta LIVE não tocada, ES/NQ e HIRO preservados.

Causa provada (checkpoint do handoff, JEV jd_mv86smz3a338eb + leitura desta sessão): `buildFlowGcSi` aplicava só os passos 1–3 (`GCSI_NO_FORCE`) e podia dar `open=true` sem força; `AoGcSiNativePublisher` já alimenta `AoTapeEngine` GC/SI (cuja `AoForcaJanela` existe) mas não publicava `Forca_GC/SI`; não havia `AoGate.GcSi`.

Mudança (somente staging `handoffs/invictus-aot-live-20261012/gcsi-eqv/candidate/`; produção intocada; F5/deploy = operador):
1. `AlfaOmegaSharedState.cs`: + `Forca_GC`/`Forca_SI`; + `AoGate.GcSi()` = mesmos 4 passos do `EsNq` (mesmo freshSec, mesmo `ForcaZMin` 3,454, mesmo vocabulário de `why`). `EsNq` não alterado (diff só aditivo).
2. `AlfaOmegaBridge.cs`: publicador nativo publica a força (eleição própria `"<sym>|Z"`, igual `AoMarketDataPublisher.PublicarForca`); `/state` ganha `anchorGcSi {dir,strength,why,ok,source}` via `AoGate.GcSi` da geração com GC mais novo (reflexão; geração antiga ⇒ chave omitida). Caminho delegado recebe o mesmo campo via `Put`.
3. `aot-bff.js`: `buildFlowGcSi` consome `anchorGcSi`; sem ele ⇒ fail-closed (`open=false`, `phase=ESPERANDO_CONFIRMACAO` com radar 4/4). Novo `phase`, `radarDir`, `radarOpen`, `forceStep` aplicado. 2ª instância do sim (`AOT_GCSI_SIM`, OFF por padrão) via novo `aot-gcsi-sim.js`; rotas GET `/gcsi/sim|events|history`. `aot-sim.js` NÃO alterado; `simEmitEvent`, `/sim/events`, `buildGate`, sim ES/NQ idênticos (teste I03/I04).
4. `aot-gcsi-sim.js` (novo): reusa `createSimEngine` (mult GC 100, SI 5000 com escala ×10 para manter o grid de 0,005), journal isolado `history-gcsi/gcsi-events-*.jsonl` (schema `aot-gcsi-sim/event v1`, `orders: NONE`), estado e trades exclusivos em `history-gcsi/`.

Evidência: shadow compile NinjaTrader.Custom baseline × candidato (2 arquivos trocados) = PASS, 0 erros, 0 avisos novos (`evidence-shadow-compile.json`). Teste C# offline sobre a DLL candidata 20/20 PASS (sem tape, indefinido, divergentes, 4/4 sem força, 4/4 força fraca ⇒ Ok=false dir 0, força contra, janela não coberta, aprovado LONG/SHORT, WhyEhInfra, EsNq idêntico, publicação Forca no Last e não no Bid/Ask, anchorGcSi no /state local e no Put). Node 27/27 PASS (`evidence-node-tests.txt`): gate N01–N11, sim S01–S12 (força fraca ⇒ zero eventos; canal isolado; breakeven; restart; divergentes fecha; hard stop SI US$1000 exato; histórico exclusivo), isolamento I01–I04. Fixtures sintéticas, não dado real.

Riscos: (a) muda a semântica de exibição de `flowGcSi.gate.open` (antes podia ser true sem força) — intencional, mais restritivo; a UI só lê `reason/state`. (b) Janela GC/SI começa sem histórico ⇒ 30 min de cobertura antes de qualquer força válida (fail-closed). (c) Instalação exige F5 no NT8 e deploy do BFF, ambos do operador; nada aplicado aqui.

Rollback: nada foi instalado. Se instalado depois: restaurar `current/*` (sha256 em `current.sha256`) para `bin/Custom/AddOns/AlfaOmegaBridge.cs`, `bin/Custom/Indicators/TTW_DarkProjects/AlfaOmegaSharedState.cs` + F5; `aot-bff.js` do backup e remover `aot-gcsi-sim.js`/`history-gcsi/`; ou apenas manter `AOT_GCSI_SIM` off (padrão).

## Diffs

### AlfaOmegaSharedState.cs
```diff
--- current/AlfaOmegaSharedState.cs	2026-10-14 11:32:13.102892900 -0300
+++ candidate/AlfaOmegaSharedState.cs	2026-10-14 11:35:14.797268900 -0300
@@ -539,6 +539,10 @@
 		// publicada pelo AoMarketDataPublisher (eleicao propria "<sym>|Z"). null = sem publicador ⇒ o gate reprova por forca.
 		public static AoForcaJanela Forca_ES { get; set; }
 		public static AoForcaJanela Forca_NQ { get; set; }
+		// (2026-10-14) GC/SI = ES/NQ — mesma medida do passo 4, agora do AoGate.GcSi. Publicada pelo AoGcSiNativePublisher
+		// (AlfaOmegaBridge.cs) com eleicao propria "<sym>|Z", como o ES/NQ. null = sem publicador ⇒ o gate GC/SI reprova por forca.
+		public static AoForcaJanela Forca_GC { get; set; }
+		public static AoForcaJanela Forca_SI { get; set; }
 		public static double Press_GC { get; set; }   // #GCSI Fase 0 — dado, NAO insumo de gate
 		public static double Press_SI { get; set; }   // #GCSI Fase 0 — dado, NAO insumo de gate
 
@@ -903,6 +907,60 @@
 			r.Dir = esDir; r.Ok = true; r.Why = "";
 			return r;
 		}
+
+		public static AoGateResult GcSi() { return GcSi(PublishedFreshSec, DateTime.Now); }
+
+		// (2026-10-14) GC/SI = ES/NQ (decisao do operador): os MESMOS 4 passos do EsNq — tape vivo, direcao por simbolo
+		// (ME = MVI), mesmo lado, forca da janela (|z| >= ForcaZMin no sentido da direcao) — sobre GC e SI, com o mesmo
+		// freshSec e o mesmo ForcaZMin. So muda o par. EsNq acima NAO e tocado. Mensagens no mesmo vocabulario
+		// ("sem tape", "indefinid", "divergentes", "forca fraca") para o WhyEhInfra e o aot-sim valerem sem alteracao.
+		public static AoGateResult GcSi(double freshSec, DateTime now)
+		{
+			var r = new AoGateResult();
+			r.Dir = 0; r.Ok = false; r.Why = "";
+
+			int gcMe = AlfaOmegaSharedState.MeDirection_GC, gcMvi = AlfaOmegaSharedState.MviDirection_GC;
+			int siMe = AlfaOmegaSharedState.MeDirection_SI, siMvi = AlfaOmegaSharedState.MviDirection_SI;
+
+			int total = gcMe + gcMvi + siMe + siMvi;
+			int st = total < 0 ? -total : total;
+			r.Strength = st > 4 ? 4 : st;
+
+			// 1) tape VIVO nos DOIS simbolos
+			DateTime uGc = AlfaOmegaSharedState.LastUpdate_GC, uSi = AlfaOmegaSharedState.LastUpdate_SI;
+			bool gcFresh = uGc != DateTime.MinValue && (now - uGc).TotalSeconds < freshSec;
+			bool siFresh = uSi != DateTime.MinValue && (now - uSi).TotalSeconds < freshSec;
+			if (!gcFresh || !siFresh)
+			{
+				r.Why = (!gcFresh && !siFresh) ? "sem tape GC/SI" : (!gcFresh ? "sem tape GC" : "sem tape SI");
+				return r;
+			}
+
+			// 2) direcao POR SIMBOLO — ME e MVI do MESMO simbolo tem que concordar
+			int gcDir = (gcMe != 0 && gcMe == gcMvi) ? gcMe : 0;
+			int siDir = (siMe != 0 && siMe == siMvi) ? siMe : 0;
+			if (gcDir == 0 || siDir == 0)
+			{
+				r.Why = (gcDir == 0 && siDir == 0) ? "GC e SI indefinidos" : (gcDir == 0 ? "GC indefinido" : "SI indefinido");
+				return r;
+			}
+
+			// 3) os DOIS no MESMO lado
+			if (gcDir != siDir) { r.Why = "GC x SI divergentes"; return r; }
+
+			// 4) forca nos DOIS — mesma AoForcaJanela e mesmo ForcaZMin do EsNq. Medida indisponivel = reprova.
+			double zGc, zSi;
+			bool okGc = AoForcaJanela.Avaliar(AlfaOmegaSharedState.Forca_GC, now, out zGc) && (gcDir > 0 ? zGc >= ForcaZMin : zGc <= -ForcaZMin);
+			bool okSi = AoForcaJanela.Avaliar(AlfaOmegaSharedState.Forca_SI, now, out zSi) && (siDir > 0 ? zSi >= ForcaZMin : zSi <= -ForcaZMin);
+			if (!okGc || !okSi)
+			{
+				r.Why = (!okGc && !okSi) ? "forca fraca GC/SI" : (!okGc ? "forca fraca GC" : "forca fraca SI");
+				return r;
+			}
+
+			r.Dir = gcDir; r.Ok = true; r.Why = "";
+			return r;
+		}
 	}
 
 	/// <summary>
@@ -1007,4 +1065,4 @@
 			return f != null && f.Ler(localNow, out z);
 		}
 	}
-}
+}
```

### AlfaOmegaBridge.cs
```diff
--- current/AlfaOmegaBridge.cs	2026-10-14 11:32:13.069311400 -0300
+++ candidate/AlfaOmegaBridge.cs	2026-10-14 11:35:43.144677600 -0300
@@ -186,7 +186,7 @@
 				{
 					// (2026-10-12 r2) o JSON delegado vem do codigo de OUTRA geracao (pode nao conhecer gc/si). ES/NQ e
 					// todo o resto ficam byte a byte como vieram; so as pernas gc/si sao inseridas/substituidas.
-					try { return AoGcSiGen.Merge(other, GcSiLeg("GC", ref _pxGC, ref _pxGCAt), GcSiLeg("SI", ref _pxSI, ref _pxSIAt)); }
+					try { return AoGcSiGen.Put(AoGcSiGen.Merge(other, GcSiLeg("GC", ref _pxGC, ref _pxGCAt), GcSiLeg("SI", ref _pxSI, ref _pxSIAt)), "anchorGcSi", AoGcSiGen.Anchor(typeof(SS))); }
 					catch { return other; }
 				}
 			}
@@ -299,6 +299,10 @@
 			sb.Append("\"rty\":").Append(Leg(meRTY, mviRTY, confRTY, meCombRTY, mviCombRTY, pRTY, ageRTY, pAgeRTY, 0d, ci)).Append(",");   // #21
 			sb.Append("\"gc\":").Append(GcSiLeg("GC", ref _pxGC, ref _pxGCAt)).Append(",");   // (2026-10-12) GC individual
 			sb.Append("\"si\":").Append(GcSiLeg("SI", ref _pxSI, ref _pxSIAt)).Append(",");   // (2026-10-12) SI individual
+			// (2026-10-14) GC/SI = ES/NQ — ancora GC×SI com os 4 passos do AoGate (forca incluida), da geracao com GC mais novo.
+			// Ausente (geracao sem AoGate.GcSi) = chave omitida ⇒ o BFF mantem o fail-closed. So publica: nenhuma ordem.
+			string anchorGcSi = AoGcSiGen.Anchor(typeof(SS));
+			if (anchorGcSi != null) sb.Append("\"anchorGcSi\":").Append(anchorGcSi).Append(",");
 			sb.Append("\"auxGcSi\":{\"dir\":").Append(auxDir).Append(",\"strength\":").Append(auxStr).Append("},");
 			// limiares EM VIGOR no gate (vem da Property do FlowOne). Sem eles o `press` publicado
 			// acima nao tem referencia: quem le nao sabe contra que numero ele foi comparado.
@@ -648,6 +652,34 @@
 			return z <= 0 ? json : json.Substring(0, z) + "," + k + obj + json.Substring(z);
 		}
 
+		// (2026-10-14) ancora GC×SI = AoGate.GcSi() da geracao com o LastUpdate_GC mais novo (a mesma que fornece a perna gc),
+		// por reflexao: codigo e dados da MESMA geracao. Sem AoGate.GcSi nessa geracao (codigo anterior) ⇒ null (chave omitida).
+		public static string Anchor(Type own)
+		{
+			try
+			{
+				Type ss = Best(own, "GC");
+				Type gate = ss.Assembly.GetType("NinjaTrader.NinjaScript.Indicators.AoGate", false);
+				System.Reflection.MethodInfo m = gate == null ? null : gate.GetMethod("GcSi", PS, null, Type.EmptyTypes, null);
+				if (m == null) return null;
+				object r = m.Invoke(null, null);
+				Type rt = r.GetType();
+				bool ok = (bool)rt.GetField("Ok").GetValue(r);
+				int dir = (int)rt.GetField("Dir").GetValue(r), str = (int)rt.GetField("Strength").GetValue(r);
+				string why = (string)rt.GetField("Why").GetValue(r) ?? "";
+				return AnchorJson(ok, dir, str, why);
+			}
+			catch { return null; }
+		}
+
+		// mesmo shape do "anchor" ES/NQ ({dir,strength,why}) + ok e a origem. fail-closed: sem Ok => dir 0.
+		public static string AnchorJson(bool ok, int dir, int strength, string why)
+		{
+			string w = (why ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
+			return "{\"dir\":" + (ok ? dir : 0).ToString(CultureInfo.InvariantCulture) + ",\"strength\":" + strength.ToString(CultureInfo.InvariantCulture)
+				+ ",\"why\":\"" + w + "\",\"ok\":" + (ok ? "true" : "false") + ",\"source\":\"AoGate.GcSi\"}";
+		}
+
 		private static Type[] Others(Type own)
 		{
 			System.Reflection.Assembly[] asms;
@@ -745,6 +777,8 @@
 				try { if (_mdSI != null) _mdSI.Update -= OnSI; } catch { }
 				try { NinjaTrader.NinjaScript.Indicators.AoPublisher.Liberar("GC", _id); } catch { }
 				try { NinjaTrader.NinjaScript.Indicators.AoPublisher.Liberar("SI", _id); } catch { }
+				try { NinjaTrader.NinjaScript.Indicators.AoPublisher.Liberar("GC|Z", _id); } catch { }   // (2026-10-14) forca GC/SI
+				try { NinjaTrader.NinjaScript.Indicators.AoPublisher.Liberar("SI|Z", _id); } catch { }
 				_mdGC = null; _mdSI = null; _mGC = null; _mSI = null; Status = "parado";
 			}
 		}
@@ -796,6 +830,17 @@
 			if (tipo != NinjaTrader.NinjaScript.Indicators.AoTick.Last) return;
 			bool gc = sym == "GC";
 			if (gc) Interlocked.Increment(ref TicksGC); else Interlocked.Increment(ref TicksSI);
+			// (2026-10-14) GC/SI = ES/NQ — forca do passo 4 (AoForcaJanela do MESMO motor), mesma disciplina do
+			// AoMarketDataPublisher.PublicarForca: eleicao propria "<sym>|Z", carimbo local no publish. Nunca lanca.
+			try
+			{
+				if (NinjaTrader.NinjaScript.Indicators.AoPublisher.PodePublicar(sym + "|Z", _id))
+				{
+					m.Forca.MarcarLocal(DateTime.Now);
+					if (gc) SS.Forca_GC = m.Forca; else SS.Forca_SI = m.Forca;
+				}
+			}
+			catch { }
 			if (!NinjaTrader.NinjaScript.Indicators.AoPublisher.PodePublicar(sym, _id)) return;
 			DateTime now = DateTime.Now;     // carimbo do publish (hora local), como o publicador ES/NQ
 			if (gc)
```

### aot-bff.js
```diff
--- current/aot-bff.js	2026-10-14 11:32:13.114066700 -0300
+++ candidate/aot-bff.js	2026-10-14 11:40:01.593611100 -0300
@@ -159,6 +159,13 @@
   return { seq, event_id };
 }
 const simEngine = SIM_ON ? createSimEngine({ persistPath: SIM_STATE_FILE, historyDir: SIM_HISTORY_DIR, emitEvent: simEmitEvent }) : null;
+// ── (2026-10-14) SIMULADOR GC/SI INDEPENDENTE — GC/SI = ES/NQ (decisão do operador). off por padrão (AOT_GCSI_SIM=on liga).
+// 2ª instância do MESMO motor (aot-gcsi-sim.js → createSimEngine) com estado, histórico e canal de eventos PRÓPRIOS em
+// history-gcsi/. NUNCA usa simEmitEvent nem /sim/events (consumidos pelo executor INVICTUS): zero ordem, zero conta.
+const GCSI_SIM_ON = String(process.env.AOT_GCSI_SIM || 'off').toLowerCase() === 'on';
+const GCSI_SIM_DIR = process.env.AOT_GCSI_SIM_DIR || path.join(__dirname, 'history-gcsi');
+let gcsiSim = null;
+if (GCSI_SIM_ON) { try { gcsiSim = require('./aot-gcsi-sim').createGcSiSim({ dir: GCSI_SIM_DIR }); } catch (e) { console.warn('[gcsi-sim] off:', (e && e.message) || e); gcsiSim = null; } }
 // ── EXEC DE VOLTA (2026-10-02, invictus/exec v1) ──
 // O robo (unico escritor) grava em <roboDir>\state\aot-exec-YYYY-MM.jsonl o que o NT8 EXECUTOU por trade_id (sem preco/qty/conta).
 // O BFF so LE: execRead(after) tolerante a linha torta; ingestao no poll ANTES do tick, em ordem de exec_seq; o cursor
@@ -1088,6 +1095,16 @@
 const GCSI_NO_MULTI = 'sem fonte: o GexBot/OPRA só publica ES e NQ (charm/vol/vanna de ouro/prata não existem)';
 const GCSI_NO_EDGE = 'sem fonte: o consolidator :3495 (Tier/confiança) só cobre ES e NQ';
 const GCSI_NO_FORCE = 'etapa de força não aplicada: AoForcaJanela (passo 4 do AoGate.EsNq) só tem publicador para ES e NQ';
+// (2026-10-14) GC/SI = ES/NQ: a ponte publica `anchorGcSi` = AoGate.GcSi() (4 passos, força incluída). Presente ⇒ o passo 4
+// é APLICADO a partir dele (o gate não é reimplementado em JS). Ausente/inválido ⇒ força NÃO comprovada ⇒ fail-closed:
+// open=false e fase ESPERANDO_CONFIRMACAO mesmo com radar 4/4 (exemplo obrigatório do operador). Nunca libera ordem.
+const GCSI_WAIT = 'ESPERANDO CONFIRMAÇÃO';
+function gcsiAnchorOf(ao) {
+  const a = (ao && !ao._err) ? ao.anchorGcSi : null;
+  if (!a || typeof a !== 'object' || a.source !== 'AoGate.GcSi' || typeof a.ok !== 'boolean') return null;
+  const d = sgn(numOrNull(a.dir) || 0);
+  return { ok: a.ok === true && d !== 0, dir: (a.ok === true && d !== 0) ? dirWord(d) : 'NEUTRO', strength: numOrNull(a.strength), why: (typeof a.why === 'string' && a.why) ? a.why : null };
+}
 function buildFlowGcSi(ao, hGLD, hSLV) {
   const online = !!(ao && !ao._err);
   const hasLegs = !!(online && ao.gc && ao.si);
@@ -1132,8 +1149,18 @@
     else dir = dirWord(gc.rawDir);
   }
   const temDirecao = (dir === 'LONG' || dir === 'SHORT');
-  const open = !!(hasLegs && ready && tapeLive && strength === 4 && temDirecao);
+  const radarDir = dir;                                            // passos 1–3 (radar), antes da força
+  const radarOpen = !!(hasLegs && ready && tapeLive && strength === 4 && temDirecao);
+  const ga = gcsiAnchorOf(ao);                                     // passo 4 (AoGate.GcSi na ponte)
+  const forceOk = !!(ga && ga.ok && ga.dir === radarDir);
+  const open = radarOpen && forceOk;
+  const waiting = radarOpen && !forceOk;                           // 4/4 + força insuficiente/não comprovada
+  if (waiting) { dir = 'NEUTRO'; why = (ga && ga.why) || 'forca fraca GC/SI (anchorGcSi ausente)'; }
   const state = !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : open ? 'OPEN' : 'CLOSED';
+  const phase = !online ? 'OFFLINE' : !hasLegs ? 'UNAVAILABLE' : open ? 'CONFIRMADO' : waiting ? 'ESPERANDO_CONFIRMACAO' : 'SEM_SINAL';
+  const forceStep = ga
+    ? { applied: true, status: forceOk ? 'PASS' : ((ga.why && ga.why.indexOf('forca fraca') === 0) ? 'WEAK' : 'NOT_REACHED'), source: 'anchorGcSi (AoGate.GcSi, ponte :5151)', why: ga.why, anchorDir: ga.dir }
+    : { applied: false, status: 'UNAVAILABLE', source: null, note: 'anchorGcSi ausente na ponte :5151 — força não comprovada ⇒ fail-closed (' + GCSI_WAIT + ' com radar 4/4)' };
   const pAgeTxt = isFinite(pAgeMin) ? (pAgeMin >= 60000 ? Math.round(pAgeMin / 60000) + 'min' : Math.round(pAgeMin / 1000) + 's') : '?';
   let reason;
   if (!online) reason = 'Ponte Alfa Omega :5151 fora do ar (NT8 fechado ou bridge down). Radar GC·SI sem dado.';
@@ -1141,7 +1168,8 @@
   else if (why && why.indexOf('sem tape') === 0) reason = 'Radar GC+SI sem dado vivo — ' + why + ' (sem evento de tape há mais de ' + freshSec + 's: falta FlowOne no gráfico ou o mercado está parado).';
   else if (!tapeLive) reason = 'Tape GC/SI sem atualização de preço há ' + pAgeTxt + ' (tapeLive exige <15s) — o radar não valida.';
   else if (!temDirecao) reason = 'Radar GC+SI incompleto (' + strength + '/4)' + (why ? ' — ' + why + '.' : '.');
-  else reason = 'Radar formado 4/4 · tape ao vivo · direção ' + dir + '. Passos 1–3 do gate confirmados; ' + GCSI_NO_FORCE + '. Contexto — nunca operado.';
+  else if (waiting) reason = GCSI_WAIT + ' — Radar 4/4 ' + radarDir + ' · tape ao vivo · ' + (ga ? 'força insuficiente (' + (ga.why || 'AoGate.GcSi reprovou') + ')' : 'força não comprovada (anchorGcSi ausente na ponte)') + '. Sem direção, sem ordem.';
+  else reason = 'Gate GC×SI CONFIRMADO 4/4 · tape ao vivo · força aprovada (AoGate.GcSi) · direção ' + dir + '. Sem ordem real (simulação apenas).';
   // Confluência do par — MESMA regra do buildV2Stack (ES×NQ).
   const agree = gc.c1.signal && si.c1.signal && gc.c1.dir === si.c1.dir && gc.c1.dir !== 'NEUTRO';
   const bothMax = gc.conv.level === 'MAXIMA' && si.conv.level === 'MAXIMA';
@@ -1149,19 +1177,29 @@
   return {
     schema: 'aot-flow-gcsi/1', asof: new Date().toISOString(), operated: false, available: hasLegs,
     gate: { source: 'alfaomega', role: 'radar GC+SI (mercado futuro real) — contexto, nunca operado', online, ready, tapeLive, strength,
-      anchor: { dir, strength, why }, open, state, dir, reason, why,
-      forceStep: { applied: false, status: 'UNAVAILABLE', note: GCSI_NO_FORCE } },
+      anchor: { dir, strength, why }, open, state, phase, dir, radarDir, radarOpen, reason, why,
+      forceStep },
     gc, si,
     confluence: { agree, live: gc.state === 'LIVE' && si.state === 'LIVE', dir: agree ? gc.c1.dir : 'NEUTRO', level: agree ? (bothMax ? 'MAXIMA' : 'CONFIRMADA') : '—',
       note: agree ? 'GC e SI imprimindo tape na mesma direção — reforço cross-asset' : 'trilhas independentes (sem confluência dupla)' },
     auxNt8: aux,
     params: { freshSec, freshSecSource: (fsPub != null && fsPub > 0) ? 'ponte :5151 gateParams.freshSec' : 'padrão AoGate.DefaultFreshSec',
       priceLiveMs: GCSI_PRICE_LIVE_MS, tape: 'c1FromLeg (ME∧MVI)', hiro: 'hiroConfirm (Net $ 5 min) sobre GLD/SLV (ETF proxy)',
-      conviction: 'convOfSym', pair: 'regra do buildV2Stack', gateSteps: 'AoGate.EsNq passos 1–3', forceStep: 'UNAVAILABLE', multi: 'UNAVAILABLE', edge: 'UNAVAILABLE' },
+      conviction: 'convOfSym', pair: 'regra do buildV2Stack', gateSteps: 'AoGate.EsNq passos 1–3 (radar) + passo 4 via anchorGcSi (AoGate.GcSi)', forceStep: forceStep.status, multi: 'UNAVAILABLE', edge: 'UNAVAILABLE' },
     _note: 'FLOW GC·SI — mesma lógica do FLOW ES·NQ aplicada às pernas gc/si do :5151. Contexto, NUNCA operado. Convicção máxima alcançável = CONFIRMADA (MULTI sem fonte). HIRO = ETF (GLD/SLV), proxy.',
   };
 }
 
+// (2026-10-14) flowGcSi → entrada do sim GC/SI. Âncora operável SÓ com gate CONFIRMADO (força aprovada); o `why` só passa
+// quando a força foi aplicada (sem anchorGcSi o motor recebe why=null = fechamento fail-visible, como o anchor ES/NQ ausente).
+function gcsiSimInput(fg) {
+  const g = fg ? fg.gate : null;
+  const anchor = g ? { dir: g.open ? g.dir : 'NEUTRO', strength: typeof g.strength === 'number' ? g.strength : 0,
+    why: (g.forceStep && g.forceStep.applied) ? (g.why || null) : null } : null;
+  const px = (leg) => (leg && leg.state === 'LIVE') ? spotOrNull(leg.lastPrice) : null;
+  return { anchor, gcSpot: fg ? px(fg.gc) : null, siSpot: fg ? px(fg.si) : null };
+}
+
 // Confluência ES×NQ com FONTE por horário (P2 / Camada 1). Extraída p/ TESTE ISOLADO.
 //   rth (pregão de OPÇÕES US 09:30–16:00 ET) → stack completo (consolidator, mistura as camadas).
 //   fora do pregão → SÓ tape ES∧NQ (c1FromLeg do :5151) + tapeLive obrigatório; ignora C2/C3.
@@ -2293,6 +2331,14 @@
         forReplay: simReplay };
     } catch (e) { STATE.sim = { _err: (e && e.message) || 'sim err' }; }
   }
+  // (2026-10-14) SIMULADOR GC/SI independente — try próprio; só com AOT_GCSI_SIM=on. Âncora = gate GC/SI (força via
+  // anchorGcSi); preço = lastPrice das pernas gc/si do :5151 só com perna LIVE. Canal isolado; nunca toca STATE.sim.
+  if (GCSI_SIM_ON && gcsiSim) {
+    try {
+      const fg = (flowGcSi && !flowGcSi._err) ? flowGcSi : null;
+      STATE.simGcSi = gcsiSim.tick(Object.assign(gcsiSimInput(fg), { nowIso, replay: !!REPLAY || !!(ao && ao.isReplay) }));
+    } catch (e) { STATE.simGcSi = { _err: (e && e.message) || 'gcsi sim err' }; }
+  }
   // Modo replay/demo — ADITIVO: só entra no /state com AOT_REPLAY_DATE setada (produção não tem a chave).
   if (REPLAY) STATE.replay = { active: true, source: 'env', anchorET: etPretty(new Date(REPLAY.anchorUtcMs)), simNowET: etPretty(effectiveNow()), simNowUtc: effectiveNow().toISOString(), speed: REPLAY.speed, session: t.session, rth: t.rth,
     // W3: declara EXATAMENTE quais fontes estão no passado e quais não. Sem isto, o operador
@@ -3246,6 +3292,19 @@
     const includeReplay = u.searchParams.get('includeReplay') === '1';
     return sendJson(res, 200, Object.assign({ days, includeReplay, enabled: SIM_ON }, simHistoryRead(days, includeReplay)));
   }
+  // ── (2026-10-14) GC/SI — rotas SOMENTE LEITURA do simulador independente (canal isolado; nunca /sim/events) ──
+  if (p === '/gcsi/sim' || p === '/gcsi/events' || p === '/gcsi/history') {
+    if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });
+    if (!gcsiSim) return sendJson(res, 200, { enabled: false, note: 'AOT_GCSI_SIM=off (padrão)' });
+    if (p === '/gcsi/sim') return sendJson(res, 200, Object.assign({ enabled: true }, gcsiSim.getState()));
+    if (p === '/gcsi/events') {
+      const after = Math.max(0, parseInt(u.searchParams.get('after') || '0', 10) || 0);
+      const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit') || '200', 10) || 200));
+      return sendJson(res, 200, Object.assign({ schema: 'aot-gcsi-sim/events v1', enabled: true, source: 'AOT_GCSI_SIM_ISOLATED', after, limit }, gcsiSim.readEvents(after, limit)));
+    }
+    const days = Math.min(180, Math.max(1, parseInt(u.searchParams.get('days') || '30', 10) || 30));
+    return sendJson(res, 200, Object.assign({ enabled: true }, gcsiSim.readHistory(days, u.searchParams.get('includeReplay') === '1')));
+  }
   // ── STREAM CANONICO DE EVENTOS (sync total) — GET /sim/events?after=<seq>&limit=<n> ──
   // Read-only, ordenado por seq. O consumidor (INVICTUS) recupera o que perdeu apos restart pelo cursor.
   if (p === '/sim/events') {
@@ -3406,7 +3465,7 @@
   server.listen(PORT, BIND, () => { log('BFF ouvindo http://' + BIND + ':' + PORT); heartbeat('boot'); loop(); });
 })().catch(e => { log('FATAL ' + (e && e.stack || e)); releaseLock(); process.exit(1); });
 } else {
-  module.exports = { computeConfluence, c1FromLeg, buildFlowGcSi, buildFlowGc, buildGate, buildV2Stack, computeSymbol,
+  module.exports = { computeConfluence, c1FromLeg, buildFlowGcSi, gcsiAnchorOf, gcsiSimInput, buildFlowGc, buildGate, buildV2Stack, computeSymbol,
     // Aba ROBÔ — exposta p/ teste isolado da agregação (mesma razão do computeConfluence).
     roboState, roboGaps, roboContencao, roboUltimoEvento, roboAoDiag, roboConexaoNT8,
     // Migração dos Níveis — exposta p/ teste isolado da persistência (mesma razão do computeConfluence).
```

### aot-gcsi-sim.js (novo)
```js
// ─────────────────────────────────────────────────────────────────────────────
// AOT — Simulador GC/SI INDEPENDENTE (aot-gcsi-sim.js) — 2026-10-14, GC/SI = ES/NQ (decisão do operador).
//
// Reusa o MESMO motor do ES/NQ (aot-sim.js createSimEngine, sem alteração): entrada só com 4/4 + LONG|SHORT da
// âncora (AoGate.GcSi, força incluída), 1 GC + 1 SI, hard stop US$1000/ativo, breakeven com US$500, trailing de
// US$250 em US$250, cooldown 60 s, histerese 4/4, NEUTRO transitório ("forca fraca"/"sem tape"/"indefinid") mantém,
// "GC x SI divergentes" fecha. As pernas do motor se chamam es/nq; aqui elas SÃO gc/si (mapeadas na saída).
//
// ISOLAMENTO (risco do checkpoint, item 4): este motor NUNCA usa o emissor do ES/NQ nem /sim/events (consumido pelo
// executor INVICTUS no NT8). Eventos vão para um journal PRÓPRIO (<dir>/gcsi-events-YYYY-MM.jsonl, schema
// 'aot-gcsi-sim/event v1', source 'AOT_GCSI_SIM_ISOLATED'), estado em <dir>/gcsi-sim-state.json e histórico
// EXCLUSIVO GC/SI em <dir>/trades-YYYY-MM.jsonl (diretório próprio, nunca o history/ do ES/NQ). Nenhuma ordem.
//
// SI: tick 0,005 (3 casas). O motor arredonda preços a 2 casas (r2); para não deslocar a entrada do SI do grid de
// tick, o preço entra multiplicado por SI_PX_SCALE (10) e o multiplicador em $/pt é dividido pelo mesmo fator
// (5000/10 = 500): P&L em US$ idêntico, preços exatos; a saída devolve o preço do SI na escala real.
// GC: tick 0,1, US$100/pt — sem escala. Hard stop US$1000 = 10 pt GC / 0,20 SI.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSimEngine } = require('./aot-sim');

const SI_PX_SCALE = 10;
const GCSI_PARAMS = { contractsEs: 1, contractsNq: 1, multEs: 100, multNq: 5000 / SI_PX_SCALE };
const EVENTS_RE = /^gcsi-events-(\d{4})-(\d{2})\.jsonl$/;
const TRADES_RE = /^trades-(\d{4})-(\d{2})\.jsonl$/;
const EVENT_SCHEMA = 'aot-gcsi-sim/event v1';
const EVENT_SOURCE = 'AOT_GCSI_SIM_ISOLATED';

const pxOk = (x) => typeof x === 'number' && isFinite(x) && x > 0;
const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
const siOut = (x) => (x == null ? null : r3(x / SI_PX_SCALE));
const mapReason = (r) => typeof r === 'string' ? r.replace(/_es$/, '_gc').replace(/_nq$/, '_si') : r;

function readLines(dir, re) {
  const out = []; let bad = 0;
  let files = [];
  try { files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).sort() : []; } catch { files = []; }
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { bad++; }
    }
  }
  return { rows: out, bad };
}

// Registro do motor (pernas es/nq) → registro GC/SI (pernas gc/si, SI na escala real).
function mapTrade(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const leg = (l, si) => l ? { entry: si ? siOut(l.entry) : l.entry, exit: si ? siOut(l.exit) : l.exit, pnlUsd: l.pnlUsd } : null;
  const o = Object.assign({}, rec);
  delete o.es; delete o.nq;
  o.gc = leg(rec.es, false); o.si = leg(rec.nq, true);
  o.reason = mapReason(rec.reason);
  o.instruments = { gc: 'GC', si: 'SI' };
  o.book = 'GCSI_SIM';
  return o;
}

function createGcSiSim({ dir } = {}) {
  if (!dir) throw new Error('aot-gcsi-sim: dir obrigatório (diretório EXCLUSIVO GC/SI)');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // ── canal de eventos ISOLADO (idempotente por event_id, como o emissor ES/NQ; outro arquivo, outro seq) ──
  let seq = 0; const idx = new Map();
  for (const e of readLines(dir, EVENTS_RE).rows) {
    if (e && Number.isInteger(e.seq)) { if (e.seq > seq) seq = e.seq; if (typeof e.event_id === 'string') idx.set(e.event_id, e.seq); }
  }
  function emitEvent(evt) {
    if (evt && typeof evt.event_id === 'string' && idx.has(evt.event_id)) return { seq: idx.get(evt.event_id), event_id: evt.event_id, duplicate: true };
    const s = seq + 1;
    const event_id = (evt && typeof evt.event_id === 'string' && evt.event_id) || crypto.randomUUID();
    const rec = Object.assign({}, evt, { schema: EVENT_SCHEMA, source: EVENT_SOURCE, seq: s, event_id,
      gc_price: evt ? (evt.es_price == null ? null : evt.es_price) : null,
      si_price: evt ? siOut(evt.nq_price) : null,
      reason: evt ? mapReason(evt.reason) : null, instruments: { gc: 'GC', si: 'SI' }, simulated: true, orders: 'NONE' });
    delete rec.es_price; delete rec.nq_price;
    if (rec.action === 'OPEN' && !rec.trade_id) rec.trade_id = event_id;
    if (!rec.created_at) rec.created_at = new Date().toISOString();
    rec.replay = !!rec.replay;
    fs.appendFileSync(path.join(dir, 'gcsi-events-' + String(rec.created_at).slice(0, 7) + '.jsonl'), JSON.stringify(rec) + '\n');
    seq = s; idx.set(event_id, s);
    return { seq: s, event_id };
  }

  const engine = createSimEngine({ persistPath: path.join(dir, 'gcsi-sim-state.json'), historyDir: dir, params: GCSI_PARAMS, emitEvent });

  function mapState(s) {
    if (!s || typeof s !== 'object') return s;
    const pos = s.position ? {
      gc: s.position.es ? Object.assign({}, s.position.es) : null,
      si: s.position.nq ? Object.assign({}, s.position.nq, { entry: siOut(s.position.nq.entry), stop: siOut(s.position.nq.stop), hardStop: siOut(s.position.nq.hardStop) }) : null,
    } : null;
    return {
      schema: 'aot-gcsi-sim/1', mode: 'simulation', book: 'GCSI_SIM', orders: 'NONE', channel: 'ISOLATED (journal gcsi-events-*.jsonl proprio)',
      meta: { simulated: true, note: 'Simulação GC/SI independente — sem execução real, sem conta, sem ordem. Histórico exclusivo GC/SI.' },
      side: s.side, position: pos,
      pnl: s.pnl ? { gcUsd: s.pnl.esUsd, siUsd: s.pnl.nqUsd, totalUsd: s.pnl.totalUsd } : null,
      marks: s.marks ? { gcSpot: s.marks.esSpot, siSpot: siOut(s.marks.nqSpot) } : null,
      openedAt: s.openedAt, closedAt: s.closedAt, cooldownUntil: s.cooldownUntil, trade: s.trade || null,
      anchor: s.anchor,
      params: { contractsGc: 1, contractsSi: 1, multGc: 100, multSi: 5000, hardStopUsd: s.params.hardStopUsd, beAtProfitUsd: s.params.beAtProfitUsd,
        stepProfitUsd: s.params.stepProfitUsd, stepStopUsd: s.params.stepStopUsd, cooldownSec: s.params.cooldownSec, requireFreshFourOfFour: s.params.requireFreshFourOfFour,
        siPxScale: SI_PX_SCALE },
      history: Array.isArray(s.history) ? s.history.map(mapTrade) : [],
    };
  }

  // anchor = âncora do gate GC/SI já resolvida pelo BFF ({dir:'LONG'|'SHORT'|'NEUTRO', strength, why}).
  function tick({ anchor, gcSpot, siSpot, nowIso, replay }) {
    const s = engine.tick({ anchor, esSpot: pxOk(gcSpot) ? gcSpot : null, nqSpot: pxOk(siSpot) ? siSpot * SI_PX_SCALE : null,
      nowIso, priceSource: 'nt8-5151-gcsi', replay: !!replay });
    return mapState(s);
  }

  function readEvents(after, limit) {
    const rows = readLines(dir, EVENTS_RE).rows.filter(e => Number.isInteger(e.seq)).sort((a, b) => a.seq - b.seq);
    const out = rows.filter(e => e.seq > after);
    return { events: out.slice(0, limit), more: out.length > limit, last_seq: seq };
  }

  // Histórico EXCLUSIVO GC/SI: só os trades-*.jsonl deste diretório; sem replay por padrão.
  function readHistory(days, includeReplay) {
    const r = readLines(dir, TRADES_RE);
    const since = Date.now() - days * 86400000;
    const trades = r.rows.filter(t => t && t.closedAt && Date.parse(t.closedAt) >= since && (includeReplay || !t.replay)).map(mapTrade)
      .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));
    const ok = trades.filter(t => t.pnlStatus === 'ok' && typeof t.totalUsd === 'number');
    const wins = ok.filter(t => t.totalUsd > 0).length;
    const sum = ok.reduce((a, t) => a + t.totalUsd, 0);
    return { schema: 'aot-gcsi-history/1', book: 'GCSI_SIM', exclusive: true, simulated: true, days, includeReplay: !!includeReplay,
      count: trades.length, bad_lines: r.bad,
      summary: { trades: ok.length, wins, losses: ok.length - wins, totalUsd: Math.round(sum * 100) / 100, winRate: ok.length ? Math.round(wins / ok.length * 1000) / 10 : null },
      trades };
  }

  return { tick, getState: () => mapState(engine.getState()), readEvents, readHistory, dir, params: GCSI_PARAMS };
}

module.exports = { createGcSiSim, SI_PX_SCALE, GCSI_PARAMS, mapTrade, EVENT_SCHEMA, EVENT_SOURCE };
```
