// INVICTUS JEV CODE — janela Control Center (NTWindow) segundo o handoff do Codex (Front A).
// CODIGO-FONTE NO REPOSITORIO: NAO instalado, NAO compilado no NT8 (F5 NOT PERFORMED).
// So LE: bridge 127.0.0.1:3590 (/jev/v1/state), agente opcional 127.0.0.1:3592 (/agent/v1/health) e o estado local do executor.
// Poll em Task de background (HttpWebRequest por chamada); a UI so renderiza via Dispatcher. Bridge fora => ultimo conhecido esmaecido.
// Robo: [OFF | ON] com ON DESABILITADO (sem caminho de codigo para habilitar). Sem BUY/SELL, sem probabilidade.
#region Using declarations
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using Newtonsoft.Json.Linq;
using NinjaTrader.Gui.Tools;
#endregion

namespace NinjaTrader.NinjaScript.AddOns.InvictusJevCode
{
	public class IjcControlCenterWindow : NTWindow
	{
		private const string StateUrl = "http://127.0.0.1:3590/jev/v1/state";
		private const string AgentUrl = "http://127.0.0.1:3592/agent/v1/health";
		private const int PollMs = 3000;

		private static Brush B(string hex) { var b = (SolidColorBrush)new BrushConverter().ConvertFromString(hex); b.Freeze(); return b; }
		private static readonly Brush Bg = B("#10151C"), Card = B("#171E28"), Line = B("#2B3543"), Text = B("#E7EDF4"), Muted = B("#AAB7C7"),
			Cyan = B("#68CFE5"), Brass = B("#D0B478"), Long = B("#6ED3A6"), Short = B("#FF8A8A"), Amber = B("#F0BC62"), Unknown = B("#AFC4DA");

		private readonly CancellationTokenSource cts = new CancellationTokenSource();
		private readonly Dictionary<string, TextBlock> v = new Dictionary<string, TextBlock>(StringComparer.Ordinal);
		private readonly TextBlock banner = new TextBlock { Foreground = B("#F0BC62"), TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed, Margin = new Thickness(16, 0, 16, 8),
			Text = "Bridge indisponível — exibindo o ÚLTIMO CONHECIDO (não atual). Nenhum sistema de trading é afetado." };
		private readonly TextBlock ctxLabel = new TextBlock { FontSize = 24, FontWeight = FontWeights.Bold };
		private readonly TabControl tabs = new TabControl { Background = Bg, BorderBrush = Line };
		private readonly List<string> localLog = new List<string>();
		private JObject last;
		private bool lastWasOffline;

		public IjcControlCenterWindow()
		{
			Caption = IjcSafety.ProductName;
			Width = 480; Height = 960; MinWidth = 400; MinHeight = 640;
			Background = Bg;

			DockPanel root = new DockPanel { Background = Bg, LastChildFill = true };

			StackPanel header = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(16, 16, 16, 8) };
			header.Children.Add(new Border { Width = 28, Height = 28, BorderBrush = Brass, BorderThickness = new Thickness(1.5), CornerRadius = new CornerRadius(6), Margin = new Thickness(0, 0, 10, 0),
				Child = new TextBlock { Text = "IJ", Foreground = Brass, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } });
			StackPanel title = new StackPanel();
			title.Children.Add(new TextBlock { Text = IjcSafety.ProductName, Foreground = Text, FontSize = 18, FontWeight = FontWeights.SemiBold });
			title.Children.Add(new TextBlock { Text = "Market Analyzer / Robot Control Center · ONE SHARED ENGINE", Foreground = Muted, FontSize = 11 });
			header.Children.Add(title);
			DockPanel.SetDock(header, Dock.Top); root.Children.Add(header);

			UniformGrid status = new UniformGrid { Columns = 4, Margin = new Thickness(12, 0, 12, 8) };
			foreach (string k in new[] { "ENGINE", "LIVE DATA", "JEV AGENT", "ROBOT" }) status.Children.Add(StatusCell(k));
			DockPanel.SetDock(status, Dock.Top); root.Children.Add(status);
			DockPanel.SetDock(banner, Dock.Top); root.Children.Add(banner);

			// rodape fixo: ROBOT + snapshot
			StackPanel bottom = new StackPanel();
			bottom.Children.Add(RobotCard());
			bottom.Children.Add(Val("footer", "Último snapshot: —", 11, Muted, new Thickness(16, 4, 16, 10)));
			DockPanel.SetDock(bottom, Dock.Bottom); root.Children.Add(bottom);

			tabs.Items.Add(Tab("Analyzer", AnalyzerPanel()));
			tabs.Items.Add(Tab("Robot", RobotPanel()));
			tabs.Items.Add(Tab("Details", DetailsPanel()));
			tabs.Items.Add(Tab("Settings", SettingsPanel()));
			tabs.Items.Add(Tab("Logs", LogsPanel()));
			root.Children.Add(tabs);

			Content = root;
			Closed += (s, e) => cts.Cancel();       // fechar a janela encerra SO o poll dela (motor/bridge/executor seguem)
			Task.Run(() => PollLoop(cts.Token));
		}

		// ── construcao ───────────────────────────────────────────────────────────────────────────
		private TextBlock Val(string key, string initial, double size, Brush fg, Thickness margin)
		{
			TextBlock t = new TextBlock { Text = initial, FontSize = size, Foreground = fg, Margin = margin, TextWrapping = TextWrapping.Wrap };
			v[key] = t; return t;
		}

		private Border StatusCell(string label)
		{
			StackPanel sp = new StackPanel();
			sp.Children.Add(new TextBlock { Text = label, Foreground = Muted, FontSize = 10.5 });
			sp.Children.Add(Val("st:" + label, label == "ROBOT" ? "🔒 OFF" : label == "JEV AGENT" ? "NOT REPORTED" : "—", 12.5, Text, new Thickness(0)));
			v["st:" + label].FontWeight = FontWeights.SemiBold;
			return new Border { Background = Card, BorderBrush = Line, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(6), Padding = new Thickness(8, 6, 8, 6), Margin = new Thickness(4), Child = sp };
		}

		private Border CardBox(string title, StackPanel body)
		{
			body.Children.Insert(0, new TextBlock { Text = title.ToUpperInvariant(), Foreground = Muted, FontSize = 11, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 6) });
			return new Border { Background = Card, BorderBrush = Line, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(6), Padding = new Thickness(12), Margin = new Thickness(0, 0, 0, 12), Child = body };
		}

		private Grid Row(string key, string label)
		{
			Grid g = new Grid { MinHeight = 28 };
			g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.4, GridUnitType.Star) });
			TextBlock l = new TextBlock { Text = label, Foreground = Muted, VerticalAlignment = VerticalAlignment.Center };
			TextBlock r = Val(key, "—", 13, Text, new Thickness(8, 0, 0, 0)); r.TextAlignment = TextAlignment.Right; r.VerticalAlignment = VerticalAlignment.Center;
			Grid.SetColumn(r, 1); g.Children.Add(l); g.Children.Add(r);
			return g;
		}

		private static TabItem Tab(string header, UIElement content)
		{
			return new TabItem { Header = header, Content = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = content, Padding = new Thickness(16, 12, 16, 12) } };
		}

		private StackPanel Rows(params string[] keyLabel)
		{
			StackPanel sp = new StackPanel();
			for (int i = 0; i + 1 < keyLabel.Length; i += 2) sp.Children.Add(Row(keyLabel[i], keyLabel[i + 1]));
			return sp;
		}

		private StackPanel AnalyzerPanel()
		{
			StackPanel p = new StackPanel();
			p.Children.Add(CardBox("Market", Rows("mk.instrument", "Instrument", "mk.timeframe", "Timeframe", "mk.state", "Market state", "mk.dq", "Data quality")));
			StackPanel ctx = new StackPanel();
			ctx.Children.Add(ctxLabel);
			ctx.Children.Add(Val("ctx.why", "Aguardando primeiro snapshot", 12.5, Muted, new Thickness(0, 2, 0, 0)));
			ctx.Children.Add(new TextBlock { Text = "Contexto, não ordem · sem probabilidade (conviction UNCALIBRATED)", Foreground = Muted, FontSize = 11, Margin = new Thickness(0, 6, 0, 0) });
			p.Children.Add(CardBox("Directional context", ctx));
			p.Children.Add(CardBox("JEV Native Dealer", Rows("nd.gamma", "Gamma regime", "nd.structure", "Structure", "nd.delta", "Delta positioning", "nd.second", "Second-order flows", "nd.vol", "Vol / skew", "nd.trans", "Transitions")));
			StackPanel spx = Rows("spx.trace", "TRACE", "spx.vs", "VolSignals", "spx.effect", "Efeito sobre o nativo", "spx.mq", "MENTHORQ · CONFIRMATION OVERLAY");
			spx.Children.Add(new TextBlock { Text = "MenthorQ: Positive only · Non-blocking (ZERO não é erro, veto nem penalidade)", Foreground = Muted, FontSize = 11 });
			p.Children.Add(CardBox("SPX Final Context", spx));
			p.Children.Add(CardBox("Analysis", Rows("an.ctx", "Current context", "an.reasons", "Reason codes", "an.conflicts", "Conflicts", "an.unres", "Unresolved", "an.quality", "Source quality")));
			return p;
		}

		private StackPanel RobotPanel()
		{
			StackPanel p = new StackPanel();
			p.Children.Add(CardBox("Robot · estado", Rows("rb.mode", "Modo", "rb.exec", "Execution", "rb.path", "Order path", "rb.decision", "Decisão (snapshot)",
				"rb.local", "Executor NT8 (local)", "rb.cp", "Control plane", "rb.recon", "Reconciliação", "rb.orphans", "Ordens órfãs", "rb.accts", "Contas Sim/Playback")));
			StackPanel gates = new StackPanel(); gates.Children.Add(Val("rb.gates", "—", 12, Text, new Thickness(0)));
			gates.Children.Add(new TextBlock { Text = "ON indisponível neste build: JEV_CAN_SEND_ORDER=false e ORDER_PATH=HARD_DISABLED.", Foreground = Muted, FontSize = 11, TextWrapping = TextWrapping.Wrap });
			p.Children.Add(CardBox("Gates de habilitação", gates));
			return p;
		}

		private StackPanel DetailsPanel()
		{
			StackPanel p = new StackPanel();
			foreach (var kv in new[] { new[] { "dt.reasons", "Reason codes" }, new[] { "dt.unres", "Unresolved (amostra)" }, new[] { "dt.quality", "Source quality" }, new[] { "dt.audit", "Auditoria" } })
			{ StackPanel b = new StackPanel(); b.Children.Add(Val(kv[0], "—", 12, Text, new Thickness(0))); p.Children.Add(CardBox(kv[1], b)); }
			return p;
		}

		private StackPanel SettingsPanel()
		{
			return CardBoxPanel("Endereços (somente leitura)", "Bridge 127.0.0.1:3590 (GET/HEAD)\nAgent Gateway 127.0.0.1:3592 (opcional)\nControl plane 127.0.0.1:3591 (executor, token local)\nLogs: " + (IjcDiag.LogDir ?? "—"));
		}

		private StackPanel LogsPanel()
		{
			StackPanel b = new StackPanel(); b.Children.Add(Val("logs", "—", 11.5, Muted, new Thickness(0)));
			StackPanel p = new StackPanel(); p.Children.Add(CardBox("Eventos locais desta janela", b)); return p;
		}

		private StackPanel CardBoxPanel(string title, string text)
		{
			StackPanel b = new StackPanel(); b.Children.Add(new TextBlock { Text = text, Foreground = Text, TextWrapping = TextWrapping.Wrap });
			StackPanel p = new StackPanel(); p.Children.Add(CardBox(title, b)); return p;
		}

		private Border RobotCard()
		{
			StackPanel sp = new StackPanel();
			DockPanel head = new DockPanel();
			head.Children.Add(new TextBlock { Text = "ROBOT", Foreground = Text, FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center });
			StackPanel seg = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
			seg.Children.Add(new ToggleButton { Content = "OFF", IsChecked = true, IsEnabled = false, Padding = new Thickness(12, 3, 12, 3) });
			seg.Children.Add(new ToggleButton { Content = "🔒 ON", IsChecked = false, IsEnabled = false, Padding = new Thickness(12, 3, 12, 3), ToolTip = "Executor ainda não operacional" });
			DockPanel.SetDock(seg, Dock.Right); head.Children.Insert(0, seg);
			sp.Children.Add(head);
			sp.Children.Add(Val("rc.why", "Executor ainda não operacional.", 11.5, Muted, new Thickness(0, 4, 0, 4)));
			sp.Children.Add(Row("rc.exec", "Execution"));
			sp.Children.Add(Row("rc.strategy", "Strategy"));
			sp.Children.Add(Row("rc.position", "Position"));
			sp.Children.Add(new TextBlock { Text = "Execução bloqueada · Analyzer ativo · Analyzer e Robot usam o mesmo motor", Foreground = Muted, FontSize = 11, TextWrapping = TextWrapping.Wrap });
			return new Border { Background = B("#131922"), BorderBrush = Line, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(16, 12, 16, 12), Child = sp };
		}

		// ── poll (background) ───────────────────────────────────────────────────────────────────
		private async Task PollLoop(CancellationToken token)
		{
			while (!token.IsCancellationRequested)
			{
				JObject state = null, agent = null;
				try
				{
					int st;
					string s = IjcHttp.Request("GET", StateUrl, null, null, 2000, out st);
					if (st == 200 && s != null) state = IjcJson.Parse(s);
					string a = IjcHttp.Request("GET", AgentUrl, null, null, 1000, out st);
					if (st == 200 && a != null) agent = IjcJson.Parse(a);
				}
				catch (Exception ex) { IjcDiag.Log("poll_error", "warn", ex.GetType().Name + ": " + ex.Message, "poll_error"); }
				JObject snap = state, ag = agent;
				try { await Dispatcher.InvokeAsync(() => SafeRender(snap, ag)); } catch { return; }
				try { await Task.Delay(PollMs, token).ConfigureAwait(false); } catch (TaskCanceledException) { return; }
			}
		}

		private void SafeRender(JObject p, JObject agent)
		{
			try { Render(p, agent); }
			catch (Exception ex) { IjcDiag.Log("render_error", "error", ex.GetType().Name + ": " + ex.Message, "render_error"); }
		}

		private void Set(string key, string text, Brush fg = null) { TextBlock t; if (v.TryGetValue(key, out t)) { t.Text = text; if (fg != null) t.Foreground = fg; } }

		private void LogLocal(string msg)
		{
			localLog.Insert(0, DateTime.UtcNow.ToString("HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture) + " · " + msg);
			if (localLog.Count > 100) localLog.RemoveAt(localLog.Count - 1);
			Set("logs", string.Join("\n", localLog));
		}

		private static Brush CtxBrush(string c)
		{
			switch (c) { case "LONG_CONTEXT": return Long; case "SHORT_CONTEXT": return Short; case "CONFLICTED_CONTEXT": case "NO_TRADE_CONTEXT": return Amber; case "NEUTRAL_CONTEXT": return Text; default: return Unknown; }
		}
		private static string CtxIcon(string c)
		{
			switch (c) { case "LONG_CONTEXT": return "↑ "; case "SHORT_CONTEXT": return "↓ "; case "NEUTRAL_CONTEXT": return "— "; case "CONFLICTED_CONTEXT": return "⇅ "; case "NO_TRADE_CONTEXT": return "⏸ "; default: return "ⓘ "; }
		}

		private void Render(JObject p, JObject agent)
		{
			bool offline = p == null;
			if (offline && !lastWasOffline) LogLocal("bridge indisponível");
			if (!offline && lastWasOffline) LogLocal("bridge reconectada");
			if (!offline && (last == null || IjcJson.S(last, "snapshot_id") != IjcJson.S(p, "snapshot_id"))) LogLocal("snapshot " + IjcJson.S(p, "snapshot_id"));
			lastWasOffline = offline;
			if (!offline) last = p;
			banner.Visibility = offline ? Visibility.Visible : Visibility.Collapsed;
			tabs.Opacity = offline ? 0.55 : 1.0;

			Set("st:ENGINE", offline ? "UNKNOWN · last known" : (IjcJson.S(p, "status") == "STARTING" ? "STARTING" : "OPERATIONAL"));
			Set("st:LIVE DATA", offline ? "OFFLINE" : IjcJson.S(p, "bridge.mode"));
			Set("st:JEV AGENT", agent == null ? "NOT REPORTED" : IjcJson.S(agent, "status") + " · " + IjcJson.S(agent, "provider.id"));
			Set("rb.local", IjcExecutor.State);
			Set("rb.cp", IjcExecutor.ControlPlaneStatus);
			Set("rb.orphans", IjcExecutor.Orphans.ToString(System.Globalization.CultureInfo.InvariantCulture));
			Set("rb.accts", IjcExecutor.AccountsEligible + "/" + IjcExecutor.AccountsReported);

			JObject s = p ?? last;
			if (s == null) return;
			if (IjcJson.S(s, "status") == "STARTING") { Set("ctx.why", "Aguardando primeiro snapshot"); return; }

			string c = IjcJson.S(s, "jev.directional_context");
			ctxLabel.Text = CtxIcon(c) + c; ctxLabel.Foreground = CtxBrush(c);
			Set("ctx.why", c == "NO_TRADE_CONTEXT" ? "Contexto desfavorável à exposição direcional; não é ordem"
				: (c == "UNKNOWN" && IjcJson.S(s, "jev.context_reason") == "RC_NO_ACTIVE_DIRECTIONAL_RULE" ? "Sem regra direcional ativa — estado operacional legítimo" : IjcJson.S(s, "jev.context_explanation")));
			Set("mk.instrument", IjcJson.S(s, "market_state.target"));
			Set("mk.timeframe", "—");
			Set("mk.state", "Descritivo · " + IjcJson.S(s, "market_state.gamma_regime"));
			Set("mk.dq", IjcJson.S(s, "data_quality.status"));
			Set("nd.gamma", IjcJson.S(s, "dealer_context.gamma_regime.zero") + " · next " + IjcJson.S(s, "dealer_context.gamma_regime.next") + " · full " + IjcJson.S(s, "dealer_context.gamma_regime.full"));
			Set("nd.structure", "acima " + IjcJson.S(s, "dealer_context.nearest_above.level") + " (" + IjcJson.Fmt(IjcJson.Num(s.SelectToken("dealer_context.nearest_above.distance_pts")), "+0.00;-0.00") + ") · abaixo "
				+ IjcJson.S(s, "dealer_context.nearest_below.level") + " (" + IjcJson.Fmt(IjcJson.Num(s.SelectToken("dealer_context.nearest_below.distance_pts")), "+0.00;-0.00") + ")");
			Set("nd.delta", "DEX put/call " + IjcJson.Fmt(IjcJson.Num(s.SelectToken("dealer_context.put_call_dex_ratio")), "0.000") + " · direção " + IjcJson.S(s, "dealer_context.dex_direction"));
			Set("nd.second", IjcJson.S(s, "dealer_context.second_order_flows"));
			Set("nd.vol", IjcJson.S(s, "dealer_context.vol_skew"));
			JToken tr = s.SelectToken("dealer_context.change_transition");
			Set("nd.trans", tr is JArray ? (((JArray)tr).Count == 0 ? "Nenhuma transição reportada" : string.Join(", ", ((JArray)tr).Select(e => IjcJson.S(e, "type")))) : (IjcJson.S(s, "dealer_context.change_transition") == "NONE" ? "Nenhuma transição reportada" : IjcJson.S(s, "dealer_context.change_transition")));
			JArray eff = s.SelectToken("spx_context.effects") as JArray ?? new JArray();
			Func<string, string> effOf = src => string.Join(" · ", eff.Where(e => IjcJson.S(e, "source") == src).Select(e => IjcJson.S(e, "dimension") + "=" + IjcJson.S(e, "effect")));
			Set("spx.trace", IjcJson.S(s, "spx_context.trace_freshness") + " · " + effOf("TRACE"));
			Set("spx.vs", IjcJson.S(s, "spx_context.volsignals_freshness") + " · " + effOf("VOLSIGNALS"));
			Set("spx.effect", s.SelectToken("spx_context.effect_on_native") == null || s.SelectToken("spx_context.effect_on_native").Type == JTokenType.Null ? "Efeitos por dimensão (sem agregado)" : IjcJson.S(s, "spx_context.effect_on_native"));
			Set("spx.mq", IjcJson.S(s, "menthorq.confirmation"));
			JArray reasons = s.SelectToken("reason_codes") as JArray ?? new JArray();
			Set("an.ctx", c);
			Set("an.reasons", reasons.Count > 0 ? IjcJson.S(reasons[0], "label") : "—");
			Set("an.conflicts", "Ver Details / output");
			Set("an.unres", IjcJson.S(s, "unresolved.count") + " campos");
			Set("an.quality", IjcJson.S(s, "data_quality.status") + " · por fonte em Details");
			Set("dt.reasons", string.Join("\n", reasons.Select(r => IjcJson.S(r, "code") + " — " + IjcJson.S(r, "label"))));
			Set("dt.unres", IjcJson.S(s, "unresolved.count") + " campos com semântica/sinal UNKNOWN. Amostra: " + string.Join(", ", (s.SelectToken("unresolved.sample") as JArray ?? new JArray()).Select(x => (string)x)));
			JObject ps = s.SelectToken("data_quality.per_source") as JObject ?? new JObject();
			JObject dims = s.SelectToken("data_quality.dimensions") as JObject ?? new JObject();
			Set("dt.quality", string.Join("\n", ps.Properties().Select(x => x.Name.Replace("FR_", "") + ": " + x.Value)) + "\n" + string.Join("\n", dims.Properties().Select(x => x.Name + ": " + x.Value)));
			Set("dt.audit", "core_comparison " + IjcJson.S(s, "core_comparison") + " · ordens emitidas " + IjcJson.S(s, "guarantees.orders_emitted") + " · snapshot " + IjcJson.S(s, "snapshot_id"));

			Set("rc.why", IjcJson.S(s, "robot.locked_reason"));
			Set("rc.exec", IjcJson.S(s, "robot.execution"));
			Set("rc.strategy", IjcJson.S(s, "robot.strategy"));
			string pos = IjcJson.S(s, "robot.position.state");
			Set("rc.position", pos == "NOT_REPORTED" || pos == "—" ? "UNKNOWN · Não reportada" : pos);
			Set("st:ROBOT", "🔒 " + IjcJson.S(s, "robot.state"));
			Set("rb.mode", IjcJson.S(s, "robot.state"));
			Set("rb.exec", IjcJson.S(s, "robot.execution"));
			Set("rb.path", IjcJson.S(s, "robot.order_path"));
			Set("rb.decision", IjcJson.S(s, "robot.decision.action") + " · " + IjcJson.S(s, "robot.decision.snapshot_id"));
			Set("rb.recon", IjcJson.S(s, "robot.executor.reconciliation.status") + " (local " + IjcExecutor.ReconStatus + ")");
			JArray gates = s.SelectToken("robot.gates") as JArray ?? new JArray();
			Set("rb.gates", string.Join("\n", gates.Select(g => ((bool?)g["pass"] == true ? "PASS  " : "FAIL  ") + IjcJson.S(g, "id") + " — " + IjcJson.S(g, "detail"))));
			Set("footer", (offline ? "Último conhecido: " : "Último snapshot: ") + IjcJson.S(s, "jev.evaluated_at") + " · " + IjcJson.S(s, "snapshot_id"));
		}
	}
}
