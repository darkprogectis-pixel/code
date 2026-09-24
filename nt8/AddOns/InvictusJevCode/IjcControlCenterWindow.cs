// INVICTUS JEV CODE by ALFA OMEGA — janela NT8 V2 (handoffs/HANDOFF_CODEX_INVICTUS_JEV_UI_V2_20260924.md).
// Uma NTWindow, um viewmodel, dois modos de APRESENTACAO: FULL (1440x1000) e COMPACT (440x900). Trocar o modo nao muda
// conta, dados, engine nem execucao, e nao cria comando.
// Fontes (nunca misturadas):
//  - Analyzer/Robot status: bridge 127.0.0.1:3590 (/jev/v1/state), somente leitura; agente opcional :3592 (advisory).
//  - Conta/PNL/posicao: NT8 (IjcAccounts), conta ESCOLHIDA pelo operador. Nunca do motor JEV.
//  - Boleta MANUAL: clique explicito -> IjcManualOrderController. Nao depende de bridge, Node, Robot, agente ou web.
//  - Robot: bloco separado; OFF/ON falam com o control plane (:3591, token); ON passa pelos gates do Robot Core.
// Polls em Task de background; UI so via Dispatcher. Bridge fora => ultimo conhecido esmaecido (a boleta segue igual).
#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Shapes;
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
		private const int AccountPollMs = 1000;
		private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

		private static Brush B(string hex) { var b = (SolidColorBrush)new BrushConverter().ConvertFromString(hex); b.Freeze(); return b; }
		private static readonly Brush Bg = B("#10151C"), Card = B("#171E28"), Line = B("#2B3543"), Text = B("#E7EDF4"), Muted = B("#AAB7C7"),
			Cyan = B("#68CFE5"), Gold = B("#D0B478"), Long = B("#6ED3A6"), Short = B("#FF8A8A"), Amber = B("#F0BC62"), Unknown = B("#AFC4DA"),
			RobotBg = B("#131922"), BuyBg = B("#1E4D3B"), SellBg = B("#5A2A2E"), Disabled = B("#222A35");

		private readonly CancellationTokenSource cts = new CancellationTokenSource();
#if IJC_MANUAL_ORDERS
		private readonly IIjcManualOrders manual = new IjcManualOrderController();
#else
		private readonly IIjcManualOrders manual = new IjcManualOrdersDeferred();   // lote RTH de 4 arquivos: boleta nao instalada
#endif
		private readonly IjcTicketDraft draft = new IjcTicketDraft { Account = null, Instrument = null, Quantity = 1, OrderType = IjcTicketValidator.Market };
		private readonly List<string> localLog = new List<string>();
		private Dictionary<string, TextBlock> v = new Dictionary<string, TextBlock>(StringComparer.Ordinal);

		private bool compact;
		private string pnlTab = "PNL";
		private JObject last, lastAgent;
		private bool lastWasOffline, bridgeOffline = true;
		private IjcAccountSnapshot acct;                 // snapshot da conta/instrumento ATUAL (null = LOADING)
		private IjcPnlView lastGoodPnl; private DateTime lastGoodPnlAt; private string lastGoodPnlAccount;
		private List<IjcAccountInfo> accounts = new List<IjcAccountInfo>();
		private string accountsSig = "";
		private string robotControlMsg = "";

		// controles recriados a cada layout (estado vive no draft/campos acima)
		private TextBlock ctxLabel, pnlBig, bridgeBanner;
		private ComboBox accountBox, instrumentBox;
		private TextBox qtyBox, priceBox;
		private ToggleButton marketBtn, limitBtn;
		private ToggleButton[] pnlTabs;
		private Button buyBtn, sellBtn, modeBtn;
		private FrameworkElement analysisArea;
		private bool building;

		public IjcControlCenterWindow()
		{
			Caption = IjcSafety.ProductName + " · " + IjcSafety.Brand;
			Background = Bg;
			ApplyGeometry();
			BuildLayout();
			Closed += (s, e) => { cts.Cancel(); manual.Dispose(); };   // fecha SO os polls desta janela (motor/bridge/executor seguem)
			Task.Run(() => PollLoop(cts.Token));
			Task.Run(() => AccountLoop(cts.Token));
		}

		private void ApplyGeometry()
		{
			if (compact) { MinWidth = 400; MinHeight = 760; Width = 440; Height = 900; }
			else { MinWidth = 1100; MinHeight = 760; Width = 1440; Height = 1000; }
		}

		// ── marca ALFA OMEGA (vetor simplificado: Alfa dourado + Omega cinza + barras e seta) ─────────────
		private static FrameworkElement BrandMark(double size)
		{
			Canvas c = new Canvas { Width = 44, Height = 44 };
			TextBlock omega = new TextBlock { Text = "Ω", FontSize = 38, FontWeight = FontWeights.Bold, Foreground = B("#8A96A6") };
			Canvas.SetLeft(omega, 10); Canvas.SetTop(omega, -2); c.Children.Add(omega);
			TextBlock alpha = new TextBlock { Text = "α", FontSize = 34, FontWeight = FontWeights.Bold, Foreground = Gold };
			Canvas.SetLeft(alpha, 0); Canvas.SetTop(alpha, 2); c.Children.Add(alpha);
			double[] h = { 8, 13, 18 };
			for (int i = 0; i < 3; i++)
			{
				Rectangle r = new Rectangle { Width = 3.5, Height = h[i], Fill = Gold };
				Canvas.SetLeft(r, 20 + i * 5.5); Canvas.SetTop(r, 34 - h[i]); c.Children.Add(r);
			}
			c.Children.Add(new Polyline { Points = new PointCollection { new Point(17, 22), new Point(26, 14), new Point(30, 17), new Point(40, 6) }, Stroke = Gold, StrokeThickness = 2 });
			c.Children.Add(new Polygon { Points = new PointCollection { new Point(41, 4), new Point(35, 6), new Point(40, 10) }, Fill = Gold });
			return new Viewbox { Width = size, Height = size, Child = c, Margin = new Thickness(0, 0, 10, 0), VerticalAlignment = VerticalAlignment.Center };
		}

		// ── layout ────────────────────────────────────────────────────────────────────────────────
		private void BuildLayout()
		{
			building = true;
			v = new Dictionary<string, TextBlock>(StringComparer.Ordinal);
			DockPanel root = new DockPanel { Background = Bg, LastChildFill = true };

			// header
			DockPanel header = new DockPanel { Margin = new Thickness(16, compact ? 10 : 14, 16, compact ? 6 : 8), Height = compact ? 44 : 50 };
			modeBtn = new Button { Content = compact ? "FULL VIEW" : "COMPACT", Padding = new Thickness(12, 4, 12, 4), VerticalAlignment = VerticalAlignment.Center, Focusable = false,
				ToolTip = "Muda só a apresentação (conta, dados, engine e execução não mudam)" };
			modeBtn.Click += (s, e) => { compact = !compact; ApplyGeometry(); BuildLayout(); };
			DockPanel.SetDock(modeBtn, Dock.Right); header.Children.Add(modeBtn);
			header.Children.Add(BrandMark(compact ? 26 : 40));
			StackPanel title = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
			StackPanel t1 = new StackPanel { Orientation = Orientation.Horizontal };
			t1.Children.Add(new TextBlock { Text = IjcSafety.ProductName, Foreground = Text, FontSize = compact ? 17 : 24, FontWeight = FontWeights.SemiBold });
			if (!compact) t1.Children.Add(Chip("ONE SHARED ENGINE", Cyan, new Thickness(12, 0, 0, 0)));
			title.Children.Add(t1);
			title.Children.Add(new TextBlock { Text = IjcSafety.Brand + (compact ? " · ONE SHARED ENGINE" : " · Market Analyzer / Operator Control Center"), Foreground = Gold, FontSize = compact ? 10.5 : 12 });
			header.Children.Add(title);
			DockPanel.SetDock(header, Dock.Top); root.Children.Add(header);

			// status
			UniformGrid status = new UniformGrid { Columns = compact ? 2 : 4, Margin = new Thickness(12, 0, 12, 6) };
			foreach (string k in new[] { "ENGINE", "LIVE DATA", "JEV AGENT", "ROBOT" }) status.Children.Add(StatusCell(k));
			DockPanel.SetDock(status, Dock.Top); root.Children.Add(status);
			bridgeBanner = new TextBlock { Foreground = Amber, TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed, Margin = new Thickness(16, 0, 16, 6), FontSize = 12,
				Text = "Bridge indisponível — Analyzer exibe o ÚLTIMO CONHECIDO (não atual). Conta, PNL e boleta manual não dependem do bridge." };
			DockPanel.SetDock(bridgeBanner, Dock.Top); root.Children.Add(bridgeBanner);

			// rodape + robot (regiao inferior SEPARADA)
			StackPanel bottom = new StackPanel();
			bottom.Children.Add(RobotCard());
			DockPanel foot = new DockPanel { Margin = new Thickness(16, 3, 16, 5), Height = 20 };
			TextBlock rule = new TextBlock { Text = "SIGNAL ≠ ORDER · JEV CONTEXT ≠ AUTO EXECUTION", Foreground = Muted, FontSize = 10.5 };
			DockPanel.SetDock(rule, Dock.Right); foot.Children.Add(rule);
			foot.Children.Add(Val("footer", "Último snapshot: —", 10.5, Muted, new Thickness(0)));
			bottom.Children.Add(foot);
			DockPanel.SetDock(bottom, Dock.Bottom); root.Children.Add(bottom);

			TabControl tabs = new TabControl { Background = Bg, BorderBrush = Line, Margin = new Thickness(8, 0, 8, 0) };
			tabs.Items.Add(Tab("Analyzer", compact ? CompactMain() : FullMain()));
			tabs.Items.Add(Tab("Robot", RobotPanel()));
			tabs.Items.Add(Tab("Details", DetailsPanel()));
			tabs.Items.Add(Tab("Settings", SettingsPanel()));
			tabs.Items.Add(Tab("Logs", LogsPanel()));
			root.Children.Add(tabs);
			Content = root;
			building = false;
			RenderAll();
		}

		private UIElement FullMain()
		{
			StackPanel p = new StackPanel();
			// faixa prioritaria: contexto 30% | boleta 40% | PNL 30%
			Grid band = new Grid { MinHeight = 300, Margin = new Thickness(0, 0, 0, 12) };
			band.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3, GridUnitType.Star) });
			band.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(4, GridUnitType.Star) });
			band.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3, GridUnitType.Star) });
			Border c0 = ContextCard(); c0.Margin = new Thickness(0, 0, 6, 0);
			Border c1 = TicketCard(); c1.Margin = new Thickness(6, 0, 6, 0); Grid.SetColumn(c1, 1);
			Border c2 = PnlCard(); c2.Margin = new Thickness(6, 0, 0, 0); Grid.SetColumn(c2, 2);
			band.Children.Add(c0); band.Children.Add(c1); band.Children.Add(c2);
			p.Children.Add(band);

			StackPanel analysis = new StackPanel();
			UniformGrid market = new UniformGrid { Columns = 4 };
			foreach (var kv in new[] { new[] { "mk.instrument", "CONTEXT TARGET" }, new[] { "mk.timeframe", "TIMEFRAME" }, new[] { "mk.state", "MARKET STATE" }, new[] { "mk.dq", "DATA QUALITY" } })
			{
				StackPanel cell = new StackPanel { Margin = new Thickness(0, 0, 12, 0) };
				cell.Children.Add(new TextBlock { Text = kv[1], Foreground = Muted, FontSize = 10.5 });
				cell.Children.Add(Val(kv[0], "—", 13.5, Text, new Thickness(0)));
				market.Children.Add(cell);
			}
			analysis.Children.Add(CardBox("Market", Stack(market)));
			Grid cols = new Grid();
			cols.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			cols.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			Border dealer = CardBox("JEV Native Dealer", DealerRows()); dealer.Margin = new Thickness(0, 0, 6, 12);
			StackPanel right = new StackPanel { Margin = new Thickness(6, 0, 0, 0) };
			right.Children.Add(CardBox("SPX Final Context", SpxRows()));
			right.Children.Add(CardBox("Analysis", AnalysisRows()));
			Grid.SetColumn(right, 1);
			cols.Children.Add(dealer); cols.Children.Add(right);
			analysis.Children.Add(cols);
			analysisArea = analysis;
			p.Children.Add(analysis);
			return p;
		}

		private UIElement CompactMain()
		{
			StackPanel p = new StackPanel();
			Border ctx = ContextCard(); ctx.Margin = new Thickness(0, 0, 0, 10); p.Children.Add(ctx);
			Border pnl = PnlCard(); pnl.Margin = new Thickness(0, 0, 0, 10); p.Children.Add(pnl);
			Border tk = TicketCard(); tk.Margin = new Thickness(0, 0, 0, 10); p.Children.Add(tk);
			// dealer/SPX recolhidos no Compact (disponiveis na aba Details e no FULL VIEW)
			StackPanel mini = Rows("mk.dq", "Data quality", "an.reasons", "Reason (principal)");
			mini.Children.Add(new TextBlock { Text = "Dealer / SPX / MenthorQ recolhidos — ver Details ou FULL VIEW", Foreground = Muted, FontSize = 11, TextWrapping = TextWrapping.Wrap });
			analysisArea = CardBox("Analysis (resumo)", mini);
			p.Children.Add(analysisArea);
			return p;
		}

		private Border ContextCard()
		{
			StackPanel sp = new StackPanel();
			ctxLabel = new TextBlock { FontSize = compact ? 26 : 34, FontWeight = FontWeights.Bold, Text = "—", Foreground = Unknown, TextWrapping = TextWrapping.Wrap };
			sp.Children.Add(ctxLabel);
			sp.Children.Add(Val("ctx.why", "Aguardando primeiro snapshot", 12.5, Muted, new Thickness(0, 4, 0, 0)));
			sp.Children.Add(new TextBlock { Text = "Contexto, não ordem · sem probabilidade (conviction UNCALIBRATED)", Foreground = Muted, FontSize = 11, Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap });
			sp.Children.Add(Val("ctx.scope", "Contexto: — · Ordem: —", 11, Cyan, new Thickness(0, 6, 0, 0)));
			if (compact) sp.Children.Add(Val("ctx.dq", "DQ —", 11, Muted, new Thickness(0, 4, 0, 0)));
			return CardBox("Directional context", sp);
		}

		private Border PnlCard()
		{
			StackPanel sp = new StackPanel();
			sp.Children.Add(Val("pnl.acct", "Selecione conta", 12, Muted, new Thickness(0, 0, 0, 6)));
			StackPanel tabsRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
			string[] keys = { "PNL", "REALIZED", "OPEN" }; string[] labels = { "PNL", "REALIZADO", "ABERTO" };
			pnlTabs = new ToggleButton[3];
			for (int i = 0; i < 3; i++)
			{
				string k = keys[i];
				ToggleButton tb = new ToggleButton { Content = labels[i], IsChecked = pnlTab == k, Padding = new Thickness(10, 3, 10, 3), Margin = new Thickness(0, 0, 4, 0), MinHeight = 30, Focusable = false };
				tb.Click += (s, e) => { pnlTab = k; foreach (ToggleButton x in pnlTabs) x.IsChecked = false; ((ToggleButton)s).IsChecked = true; RenderAccount(); };
				pnlTabs[i] = tb; tabsRow.Children.Add(tb);
			}
			sp.Children.Add(tabsRow);
			pnlBig = new TextBlock { Text = "—", FontSize = compact ? 40 : 50, FontWeight = FontWeights.SemiBold, Foreground = Muted, FontFamily = new FontFamily("Segoe UI"), Typography = { NumeralAlignment = FontNumeralAlignment.Tabular } };
			sp.Children.Add(pnlBig);
			sp.Children.Add(Val("pnl.label", "PNL (Realizado + Aberto) · conta", 11, Muted, new Thickness(0, 0, 0, 6)));
			sp.Children.Add(Row("pnl.pnl", "PNL"));
			sp.Children.Add(Row("pnl.realized", "Realizado"));
			sp.Children.Add(Row("pnl.open", "Aberto (conta)"));
			sp.Children.Add(Val("pnl.status", "Sem telemetria de conta", 11, Muted, new Thickness(0, 6, 0, 0)));
			return CardBox("PNL · conta selecionada", sp);
		}

		private Border TicketCard()
		{
			StackPanel sp = new StackPanel();
			accountBox = new ComboBox { MinHeight = 32, Margin = new Thickness(0, 0, 0, 6), ToolTip = "Conta escolhida pelo operador (nunca autoescolhida)" };
			FillAccountBox();
			accountBox.SelectionChanged += (s, e) =>
			{
				if (building) return;
				ComboBoxItem it = accountBox.SelectedItem as ComboBoxItem;
				string name = it == null ? null : it.Tag as string;
				if (name == draft.Account) return;
				draft.Account = name; IjcSession.SelectedAccount = name;
				acct = null; lastGoodPnl = null;                       // troca de conta => LOADING (nada da conta anterior)
				LogLocal("conta selecionada: " + (name ?? "—"));
				RenderAccount();
			};
			sp.Children.Add(Field("ACCOUNT", accountBox));

			instrumentBox = new ComboBox { IsEditable = true, MinHeight = 32, Text = draft.Instrument ?? "", ToolTip = "Contrato NT8 completo, ex.: ES 12-26 (não só o símbolo raiz)" };
			instrumentBox.AddHandler(TextBoxBase.TextChangedEvent, new TextChangedEventHandler((s, e) => { if (building) return; string t = instrumentBox.Text; if (t != draft.Instrument) { draft.Instrument = string.IsNullOrWhiteSpace(t) ? null : t.Trim(); acct = null; RenderAccount(); } }));
			sp.Children.Add(Field("INSTRUMENT", instrumentBox));

			Grid qtyRow = new Grid();
			qtyRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			qtyRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
			qtyRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
			qtyBox = new TextBox { Text = draft.Quantity.ToString(Inv), MinHeight = 32, VerticalContentAlignment = VerticalAlignment.Center };
			qtyBox.TextChanged += (s, e) => { if (building) return; int q; draft.Quantity = int.TryParse(qtyBox.Text.Trim(), NumberStyles.Integer, Inv, out q) ? q : 0; RenderTicket(); };
			Button minus = new Button { Content = "−", Width = 32, Focusable = false }, plus = new Button { Content = "+", Width = 32, Focusable = false };
			minus.Click += (s, e) => { if (draft.Quantity > 1) qtyBox.Text = (draft.Quantity - 1).ToString(Inv); };
			plus.Click += (s, e) => { qtyBox.Text = (Math.Max(0, draft.Quantity) + 1).ToString(Inv); };
			Grid.SetColumn(minus, 1); Grid.SetColumn(plus, 2);
			qtyRow.Children.Add(qtyBox); qtyRow.Children.Add(minus); qtyRow.Children.Add(plus);
			sp.Children.Add(Field("QUANTITY", qtyRow));

			StackPanel typeRow = new StackPanel { Orientation = Orientation.Horizontal };
			marketBtn = new ToggleButton { Content = "MARKET", MinHeight = 32, MinWidth = 90, Focusable = false, IsChecked = draft.OrderType == IjcTicketValidator.Market };
			limitBtn = new ToggleButton { Content = "LIMIT", MinHeight = 32, MinWidth = 90, Focusable = false, IsChecked = draft.OrderType == IjcTicketValidator.Limit, Margin = new Thickness(4, 0, 0, 0) };
			marketBtn.Click += (s, e) => { draft.OrderType = IjcTicketValidator.Market; RenderTicket(); };
			limitBtn.Click += (s, e) => { draft.OrderType = IjcTicketValidator.Limit; RenderTicket(); };
			typeRow.Children.Add(marketBtn); typeRow.Children.Add(limitBtn);
			sp.Children.Add(Field("ORDER TYPE", typeRow));

			priceBox = new TextBox { MinHeight = 32, VerticalContentAlignment = VerticalAlignment.Center, Text = draft.LimitPrice.HasValue ? draft.LimitPrice.Value.ToString("0.########", Inv) : "" };
			priceBox.TextChanged += (s, e) => { if (building) return; draft.LimitPrice = IjcTicketValidator.ParsePrice(priceBox.Text); RenderTicket(); };
			sp.Children.Add(Field("LIMIT PRICE", priceBox));

			// BUY / SELL lado a lado, mesmo peso. Focusable=false: so clique do mouse executa (teclado nao dispara ordem).
			Grid bs = new Grid { Margin = new Thickness(0, 8, 0, 4) };
			bs.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			bs.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			buyBtn = new Button { Content = "BUY", Height = 46, FontSize = 16, FontWeight = FontWeights.Bold, Foreground = Long, Background = BuyBg, Focusable = false, IsDefault = false, Margin = new Thickness(0, 0, 4, 0) };
			sellBtn = new Button { Content = "SELL", Height = 46, FontSize = 16, FontWeight = FontWeights.Bold, Foreground = Short, Background = SellBg, Focusable = false, IsDefault = false, Margin = new Thickness(4, 0, 0, 0) };
			buyBtn.Click += (s, e) => OnManualClick(IjcTicketValidator.Buy);
			sellBtn.Click += (s, e) => OnManualClick(IjcTicketValidator.Sell);
			Grid.SetColumn(sellBtn, 1);
			bs.Children.Add(buyBtn); bs.Children.Add(sellBtn);
			sp.Children.Add(bs);
			sp.Children.Add(Val("tk.status", "—", 11.5, Muted, new Thickness(0, 2, 0, 6)));

			UniformGrid pos = new UniformGrid { Columns = compact ? 2 : 4 };
			foreach (var kv in new[] { new[] { "pos.state", "POSITION" }, new[] { "pos.size", "SIZE" }, new[] { "pos.avg", "AVG PRICE" }, new[] { "pos.open", "OPEN PNL (posição)" } })
			{
				StackPanel cell = new StackPanel { Margin = new Thickness(0, 2, 8, 2) };
				cell.Children.Add(new TextBlock { Text = kv[1], Foreground = Muted, FontSize = 10.5 });
				cell.Children.Add(Val(kv[0], "—", 13.5, Text, new Thickness(0)));
				pos.Children.Add(cell);
			}
			sp.Children.Add(pos);
			sp.Children.Add(new TextBlock { Text = "Ordem manual: clique explícito do operador · origin MANUAL_OPERATOR · independe do Robot e do sinal JEV", Foreground = Muted, FontSize = 10.5, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
			return CardBox("Manual order ticket", sp);
		}

		private void FillAccountBox()
		{
			if (accountBox == null) return;
			bool was = building; building = true;
			accountBox.Items.Clear();
			accountBox.Items.Add(new ComboBoxItem { Content = "Selecione conta", Tag = null });
			ComboBoxItem sel = (ComboBoxItem)accountBox.Items[0];
			foreach (IjcAccountInfo a in accounts)
			{
				ComboBoxItem it = new ComboBoxItem { Content = a.Name + " · " + a.Kind + " · " + (a.Connection ?? "Unknown"), Tag = a.Name };
				accountBox.Items.Add(it);
				if (a.Name == draft.Account) sel = it;
			}
			if (draft.Account != null && sel.Tag == null)
			{
				ComboBoxItem missing = new ComboBoxItem { Content = draft.Account + " · NÃO ENCONTRADA", Tag = draft.Account };
				accountBox.Items.Add(missing); sel = missing;
			}
			accountBox.SelectedItem = sel;
			building = was;
		}

		private Border RobotCard()
		{
			StackPanel sp = new StackPanel();
			DockPanel head = new DockPanel();
			StackPanel seg = new StackPanel { Orientation = Orientation.Horizontal };
			Button off = new Button { Content = "OFF", Padding = new Thickness(14, 4, 14, 4), Focusable = false, ToolTip = "Desligar o robô (não cancela ordens manuais nem fecha posições)" };
			Button on = new Button { Content = "ON", Padding = new Thickness(14, 4, 14, 4), Margin = new Thickness(4, 0, 0, 0), Focusable = false, ToolTip = "Pedir ON: passa por todos os gates do Robot Core" };
			off.Click += (s, e) => RobotControl("disable");
			on.Click += (s, e) => RobotControl("enable");
			seg.Children.Add(off); seg.Children.Add(on);
			DockPanel.SetDock(seg, Dock.Right); head.Children.Add(seg);
			StackPanel ht = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
			ht.Children.Add(new TextBlock { Text = "AUTOMATED ROBOT", Foreground = Text, FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center });
			ht.Children.Add(Val("rc.mode", "OFF", 12.5, Gold, new Thickness(10, 0, 0, 0)));
			head.Children.Add(ht);
			sp.Children.Add(head);
			UniformGrid g = new UniformGrid { Columns = compact ? 2 : 4, Margin = new Thickness(0, 6, 0, 0) };
			foreach (var kv in new[] { new[] { "rc.exec", "EXECUTION" }, new[] { "rc.strategy", "STRATEGY" }, new[] { "rc.decision", "DECISION / ACTION" }, new[] { "rc.position", "POSITION (robot)" } })
			{
				StackPanel cell = new StackPanel { Margin = new Thickness(0, 0, 8, 0) };
				cell.Children.Add(new TextBlock { Text = kv[1], Foreground = Muted, FontSize = 10 });
				cell.Children.Add(Val(kv[0], "—", 12, Text, new Thickness(0)));
				g.Children.Add(cell);
			}
			sp.Children.Add(g);
			sp.Children.Add(Val("rc.why", "Robot OFF por padrão.", 11, Muted, new Thickness(0, 4, 0, 0)));
			sp.Children.Add(new TextBlock { Text = "Analyzer e Robot: mesmo JEV Shared Engine · posição da conta ≠ posição do Robot", Foreground = Muted, FontSize = 10.5, TextWrapping = TextWrapping.Wrap });
			return new Border { Background = RobotBg, BorderBrush = Line, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(16, 10, 16, 10), Margin = new Thickness(0, 10, 0, 0), Child = sp };
		}

		private StackPanel DealerRows() { return Rows("nd.gamma", "Gamma regime", "nd.structure", "Structure", "nd.delta", "Delta positioning", "nd.second", "Second-order flows", "nd.vol", "Vol / skew", "nd.trans", "Transitions"); }

		private StackPanel SpxRows()
		{
			StackPanel spx = Rows("spx.trace", "TRACE", "spx.vs", "VolSignals", "spx.effect", "Efeito sobre o nativo", "spx.mq", "MENTHORQ · CONFIRMATION OVERLAY");
			spx.Children.Add(new TextBlock { Text = "MenthorQ: Positive only · Non-blocking (ZERO não é erro, veto nem penalidade)", Foreground = Muted, FontSize = 11, TextWrapping = TextWrapping.Wrap });
			return spx;
		}

		private StackPanel AnalysisRows() { return Rows("an.ctx", "Current context", "an.reasons", "Reason codes", "an.conflicts", "Conflicts", "an.unres", "Unresolved", "an.quality", "Source quality"); }

		private StackPanel RobotPanel()
		{
			StackPanel p = new StackPanel();
			p.Children.Add(CardBox("Robot · estado", Rows("rb.mode", "Modo", "rb.exec", "Execution", "rb.path", "Order path (robot)", "rb.decision", "Decisão (snapshot)",
				"rb.local", "Executor NT8 (local)", "rb.cp", "Control plane", "rb.recon", "Reconciliação", "rb.orphans", "Ordens IJC-ROBOT| órfãs", "rb.accts", "Contas reportadas", "rb.control", "Último comando OFF/ON")));
			StackPanel gates = new StackPanel(); gates.Children.Add(Val("rb.gates", "—", 12, Text, new Thickness(0)));
			gates.Children.Add(new TextBlock { Text = "ON só arma com TODOS os gates em PASS. Sem regra direcional ativa: DECISION = NONE, ACTION = NONE (nenhum sinal inventado).", Foreground = Muted, FontSize = 11, TextWrapping = TextWrapping.Wrap });
			p.Children.Add(CardBox("Gates de habilitação", gates));
			return p;
		}

		private StackPanel DetailsPanel()
		{
			StackPanel p = new StackPanel();
			if (compact)
			{
				p.Children.Add(CardBox("Market", Rows("mk.instrument", "Context target", "mk.timeframe", "Timeframe", "mk.state", "Market state")));
				p.Children.Add(CardBox("JEV Native Dealer", DealerRows()));
				p.Children.Add(CardBox("SPX Final Context", SpxRows()));
				p.Children.Add(CardBox("Analysis", Rows("an.ctx", "Current context", "an.conflicts", "Conflicts", "an.unres", "Unresolved", "an.quality", "Source quality")));
			}
			foreach (var kv in new[] { new[] { "dt.reasons", "Reason codes" }, new[] { "dt.unres", "Unresolved (amostra)" }, new[] { "dt.quality", "Source quality" }, new[] { "dt.audit", "Auditoria" }, new[] { "dt.pnl", "PNL · origem de cada valor (NT8)" } })
			{ StackPanel b = new StackPanel(); b.Children.Add(Val(kv[0], "—", 12, Text, new Thickness(0))); p.Children.Add(CardBox(kv[1], b)); }
			return p;
		}

		private StackPanel SettingsPanel()
		{
			StackPanel b = new StackPanel();
			b.Children.Add(new TextBlock { Foreground = Text, TextWrapping = TextWrapping.Wrap, Text =
				"Bridge 127.0.0.1:3590 (GET, somente leitura)\nAgent Gateway 127.0.0.1:3592 (opcional, advisory)\nControl plane 127.0.0.1:3591 (Robot, token local)\n" +
				"Boleta manual: API do NT8 direto (sem rede, sem Node)\nLogs: " + (IjcDiag.LogDir ?? "—") + "\n\nPreferências persistidas: nenhuma (conta, comando e ON nunca são restaurados)." });
			StackPanel p = new StackPanel(); p.Children.Add(CardBox("Endereços e fontes", b)); return p;
		}

		private StackPanel LogsPanel()
		{
			StackPanel b = new StackPanel(); b.Children.Add(Val("logs", "—", 11.5, Muted, new Thickness(0)));
			StackPanel p = new StackPanel(); p.Children.Add(CardBox("Eventos locais desta janela", b)); return p;
		}

		// ── primitivas de UI ───────────────────────────────────────────────────────────────────────
		private TextBlock Val(string key, string initial, double size, Brush fg, Thickness margin)
		{
			TextBlock t = new TextBlock { Text = initial, FontSize = size, Foreground = fg, Margin = margin, TextWrapping = TextWrapping.Wrap };
			v[key] = t; return t;
		}

		private static Border Chip(string text, Brush fg, Thickness margin)
		{
			return new Border { BorderBrush = fg, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4), Padding = new Thickness(6, 1, 6, 1), Margin = margin, VerticalAlignment = VerticalAlignment.Center,
				Child = new TextBlock { Text = text, Foreground = fg, FontSize = 10.5, FontWeight = FontWeights.SemiBold } };
		}

		private Border StatusCell(string label)
		{
			StackPanel sp = new StackPanel();
			sp.Children.Add(new TextBlock { Text = label, Foreground = Muted, FontSize = 10 });
			sp.Children.Add(Val("st:" + label, label == "ROBOT" ? "OFF" : label == "JEV AGENT" ? "NOT REPORTED" : "—", 12.5, Text, new Thickness(0)));
			v["st:" + label].FontWeight = FontWeights.SemiBold;
			return new Border { Background = Card, BorderBrush = Line, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(6), Padding = new Thickness(8, 4, 8, 4), Margin = new Thickness(4), Child = sp };
		}

		private static StackPanel Stack(UIElement e) { StackPanel s = new StackPanel(); s.Children.Add(e); return s; }

		private Border CardBox(string title, StackPanel body)
		{
			body.Children.Insert(0, new TextBlock { Text = title.ToUpperInvariant(), Foreground = Muted, FontSize = 11, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 6) });
			return new Border { Background = Card, BorderBrush = Line, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(6), Padding = new Thickness(12), Margin = new Thickness(0, 0, 0, 12), Child = body };
		}

		private static StackPanel Field(string label, UIElement control)
		{
			StackPanel s = new StackPanel { Margin = new Thickness(0, 0, 0, 6) };
			s.Children.Add(new TextBlock { Text = label, Foreground = Muted, FontSize = 10.5, Margin = new Thickness(0, 0, 0, 2) });
			s.Children.Add(control);
			return s;
		}

		private Grid Row(string key, string label)
		{
			Grid g = new Grid { MinHeight = 26 };
			g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
			g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.4, GridUnitType.Star) });
			TextBlock l = new TextBlock { Text = label, Foreground = Muted, VerticalAlignment = VerticalAlignment.Center };
			TextBlock r = Val(key, "—", 13, Text, new Thickness(8, 0, 0, 0)); r.TextAlignment = TextAlignment.Right; r.VerticalAlignment = VerticalAlignment.Center;
			Grid.SetColumn(r, 1); g.Children.Add(l); g.Children.Add(r);
			return g;
		}

		private StackPanel Rows(params string[] keyLabel)
		{
			StackPanel sp = new StackPanel();
			for (int i = 0; i + 1 < keyLabel.Length; i += 2) sp.Children.Add(Row(keyLabel[i], keyLabel[i + 1]));
			return sp;
		}

		private static TabItem Tab(string header, UIElement content)
		{
			return new TabItem { Header = header, Content = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, Content = content, Padding = new Thickness(8, 10, 8, 10) } };
		}

		private void Set(string key, string text, Brush fg = null) { TextBlock t; if (v.TryGetValue(key, out t)) { t.Text = text; if (fg != null) t.Foreground = fg; } }

		private void LogLocal(string msg)
		{
			localLog.Insert(0, DateTime.UtcNow.ToString("HH:mm:ss", Inv) + " · " + msg);
			if (localLog.Count > 100) localLog.RemoveAt(localLog.Count - 1);
			Set("logs", string.Join("\n", localLog));
		}

		// ── acoes do operador ───────────────────────────────────────────────────────────────────────
		private void OnManualClick(string side)
		{
			// clique explicito: 1 chamada ao controlador. Sem popup (decisao do operador). Anti-double-submit no controlador.
			string st = manual.Click(side, draft.Clone());
			LogLocal("MANUAL " + side + " → " + st + (manual.Detail.Length > 0 ? " · " + manual.Detail : ""));
			RenderTicket();
		}

		private void RobotControl(string action)
		{
			robotControlMsg = action.ToUpperInvariant() + " enviado…";
			Set("rb.control", robotControlMsg);
			Task.Run(() =>
			{
				string r = IjcExecutor.RobotControl(action);
				string msg;
				try
				{
					JObject j = IjcJson.Parse(r);
					JArray failed = j["failed_gates"] as JArray;
					msg = action.ToUpperInvariant() + " → modo " + IjcJson.S(j, "mode") + (failed != null && failed.Count > 0 ? " · gates FAIL: " + string.Join(", ", failed.Select(x => (string)x)) : "") + (j["error"] != null ? " · " + IjcJson.S(j, "error") : "");
				}
				catch { msg = action.ToUpperInvariant() + " → resposta inválida"; }
				try { Dispatcher.InvokeAsync(() => { robotControlMsg = msg; Set("rb.control", msg); LogLocal("ROBOT " + msg); }); } catch { }
			});
		}

		// ── polls (background) ──────────────────────────────────────────────────────────────────────
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
				try { await Dispatcher.InvokeAsync(() => Safe(() => RenderBridge(snap, ag))); } catch { return; }
				try { await Task.Delay(PollMs, token).ConfigureAwait(false); } catch (TaskCanceledException) { return; }
			}
		}

		private async Task AccountLoop(CancellationToken token)
		{
			while (!token.IsCancellationRequested)
			{
				List<IjcAccountInfo> list = null; IjcAccountSnapshot snap = null;
				string acc = draft.Account, ins = draft.Instrument;
				try
				{
					list = IjcAccounts.List();
					snap = acc == null ? null : IjcAccounts.Read(acc, ins);
				}
				catch (Exception ex) { IjcDiag.Log("account_poll_error", "warn", ex.GetType().Name + ": " + ex.Message, "account_poll_error"); }
				try
				{
					await Dispatcher.InvokeAsync(() => Safe(() =>
					{
						if (list != null)
						{
							string sig = string.Join("|", list.Select(x => x.Name + ":" + x.Connection + ":" + x.Kind));
							if (sig != accountsSig) { accounts = list; accountsSig = sig; FillAccountBox(); }
						}
						// descarta leitura de conta/instrumento que ja nao sao os selecionados (sem vazamento entre contas)
						if (snap != null && acc == draft.Account && ins == draft.Instrument) acct = snap;
						RenderAccount();
					}));
				}
				catch { return; }
				try { await Task.Delay(AccountPollMs, token).ConfigureAwait(false); } catch (TaskCanceledException) { return; }
			}
		}

		private void Safe(Action a)
		{
			try { a(); } catch (Exception ex) { IjcDiag.Log("render_error", "error", ex.GetType().Name + ": " + ex.Message, "render_error"); }
		}

		// ── render ──────────────────────────────────────────────────────────────────────────────────
		private void RenderAll()
		{
			Safe(() => RenderBridge(last, lastAgent, true));
			Safe(RenderAccount);
			Set("logs", string.Join("\n", localLog));
			Set("rb.control", robotControlMsg.Length > 0 ? robotControlMsg : "—");
		}

		private void RenderAccount()
		{
			if (pnlBig == null) return;
			string account = draft.Account;
			IjcAccountSnapshot s = acct;
			IjcPnlView pnl = s == null ? null : s.Pnl;
			string kind = s != null && s.Info != null ? s.Info.Kind : "—";
			string cur = pnl != null && pnl.Currency != null ? pnl.Currency : "—";
			Set("pnl.acct", account == null ? "Selecione conta" : "ACCOUNT " + account + " · " + kind + " · " + cur, account == null ? Amber : Muted);

			bool stale = false; string status;
			if (account == null) { status = "Selecione conta"; pnl = null; }
			else if (s == null) { status = "LOADING…"; pnl = null; }
			else if (s.Info == null) { status = "Conta não encontrada no NT8"; pnl = null; }
			else if (pnl.Status == "OFFLINE")
			{
				status = "OFFLINE (conta " + (s.Info.Connection ?? "Unknown") + ")";
				if (lastGoodPnl != null && lastGoodPnlAccount == account) { pnl = lastGoodPnl; stale = true; status += " · Último conhecido " + lastGoodPnlAt.ToLocalTime().ToString("HH:mm:ss", Inv); }
			}
			else
			{
				status = pnl.Status == "AVAILABLE" ? "NT8 · " + s.AtUtc.ToLocalTime().ToString("HH:mm:ss", Inv) : pnl.Status == "PARTIAL" ? "Métrica parcial: PNL = NOT_REPORTED" : "Sem telemetria de conta (NOT_REPORTED)";
				if (pnl.Status == "AVAILABLE" || pnl.Status == "PARTIAL") { lastGoodPnl = pnl; lastGoodPnlAt = s.AtUtc; lastGoodPnlAccount = account; }
			}

			double? big = pnl == null ? null : pnl.Metric(pnlTab);
			pnlBig.Text = pnl == null ? "—" : IjcPnlView.Money(big);
			pnlBig.FontSize = pnl == null || big.HasValue ? (compact ? 40 : 50) : (compact ? 24 : 28);
			pnlBig.Foreground = !big.HasValue ? Unknown : big.Value > 0 ? Long : big.Value < 0 ? Short : Text;
			pnlBig.Opacity = stale ? 0.55 : 1.0;
			Set("pnl.label", pnlTab == "REALIZED" ? "REALIZADO · AccountItem.RealizedProfitLoss" : pnlTab == "OPEN" ? "ABERTO · AccountItem.UnrealizedProfitLoss (conta)" : "PNL = Realizado + Aberto (conta)");
			Set("pnl.pnl", pnl == null ? "—" : IjcPnlView.Money(pnl.Pnl));
			Set("pnl.realized", pnl == null ? "—" : IjcPnlView.Money(pnl.Realized));
			Set("pnl.open", pnl == null ? "—" : IjcPnlView.Money(pnl.Open));
			Set("pnl.status", status, stale || pnl == null ? Amber : Muted);

			IjcPositionView p = s == null ? null : s.Position;
			string ps = account == null ? "UNKNOWN" : p == null ? "LOADING" : p.State;
			Set("pos.state", ps + (p != null && p.State == "UNKNOWN" && p.Reason != null ? " · " + p.Reason : ""), ps == "LONG" ? Long : ps == "SHORT" ? Short : ps == "FLAT" ? Text : Unknown);
			Set("pos.size", p == null || !p.Size.HasValue ? "—" : p.Size.Value.ToString(Inv));
			Set("pos.avg", p == null || !p.AvgPrice.HasValue ? (p != null && p.State == "FLAT" ? "n/a" : "—") : p.AvgPrice.Value.ToString("0.00########", Inv));
			Set("pos.open", p == null || p.State == "UNKNOWN" ? "—" : IjcPnlView.Money(p.OpenPnl));
			Set("dt.pnl", "PNL = Account.Get(AccountItem.RealizedProfitLoss) + Account.Get(AccountItem.UnrealizedProfitLoss), moeda Account.Denomination (" + cur + "); só quando ambos reportados.\n" +
				"REALIZADO = AccountItem.RealizedProfitLoss (escopo/sessão definidos pelo provider NT8 da conta; não rotulado como \"do dia\" sem confirmação).\n" +
				"ABERTO (conta) = AccountItem.UnrealizedProfitLoss.\n" +
				"OPEN PNL (posição) = Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency) da posição conta+instrumento.\n" +
				"POSITION / SIZE / AVG PRICE = Position.MarketPosition / Quantity / AveragePrice (Account.Positions).\n" +
				"Ausente ⇒ NOT_REPORTED (nunca 0 fabricado). Comissão: conforme o provider (não recalculada aqui).");
			Set("ctx.scope", "Contexto: " + (last == null ? "—" : IjcJson.S(last, "market_state.target")) + " · Ordem: " + (draft.Instrument ?? "—"));
			RenderTicket();
		}

		private void RenderTicket()
		{
			if (buyBtn == null) return;
			if (marketBtn != null) { marketBtn.IsChecked = draft.OrderType == IjcTicketValidator.Market; limitBtn.IsChecked = draft.OrderType == IjcTicketValidator.Limit; }
			if (priceBox != null) priceBox.IsEnabled = draft.OrderType == IjcTicketValidator.Limit;
			IjcAccountSnapshot s = acct;
			// pre-validacao visual (a validacao AUTORITATIVA e refeita no clique, contra o NT8)
			var input = new IjcTicketInput
			{
				Side = IjcTicketValidator.Buy, Account = draft.Account, AccountFound = s != null && s.Info != null, Connection = s != null && s.Info != null ? s.Info.Connection : null,
				Instrument = draft.Instrument, InstrumentFound = s != null && s.Position != null && s.Position.Reason != "INSTRUMENT_INVALID" && s.Position.Reason != "NO_INSTRUMENT",
				TickSize = 0, Quantity = draft.Quantity, OrderType = draft.OrderType, LimitPrice = draft.LimitPrice
			};
			List<string> errs = IjcTicketValidator.Validate(input).Where(x => x != "LIMIT_PRICE_OFF_TICK").ToList();
			if (draft.Account != null && s == null) errs.Insert(0, "LOADING");
			bool inFlight = manual.InFlight;
			if (!manual.Available) errs.Insert(0, "BOLETA_DEFERRED");
			bool ok = errs.Count == 0 && !inFlight;
			buyBtn.IsEnabled = ok; sellBtn.IsEnabled = ok;
			buyBtn.Background = ok ? BuyBg : Disabled; sellBtn.Background = ok ? SellBg : Disabled;
			string lastTxt = manual.Status == "IDLE" ? "" : " · última: " + manual.Status + (manual.Detail.Length > 0 ? " (" + manual.Detail + ")" : "");
			Set("tk.status", (inFlight ? "PENDING — aguardando NT8" : ok ? "READY" : "BLOQUEADO: " + string.Join(", ", errs)) + lastTxt, ok ? Long : inFlight ? Cyan : Amber);
		}

		private static Brush CtxBrush(string c)
		{
			switch (c) { case "LONG_CONTEXT": return Long; case "SHORT_CONTEXT": return Short; case "CONFLICTED_CONTEXT": case "NO_TRADE_CONTEXT": return Amber; case "NEUTRAL_CONTEXT": return Text; default: return Unknown; }
		}
		private static string CtxIcon(string c)
		{
			switch (c) { case "LONG_CONTEXT": return "↑ "; case "SHORT_CONTEXT": return "↓ "; case "NEUTRAL_CONTEXT": return "— "; case "CONFLICTED_CONTEXT": return "⇅ "; case "NO_TRADE_CONTEXT": return "⏸ "; default: return "ⓘ "; }
		}

		private void RenderBridge(JObject p, JObject agent, bool replay = false)
		{
			bool offline = p == null;
			if (!replay)
			{
				if (offline && !lastWasOffline) LogLocal("bridge indisponível (boleta manual e PNL não são afetados)");
				if (!offline && lastWasOffline) LogLocal("bridge reconectada");
				if (!offline && (last == null || IjcJson.S(last, "snapshot_id") != IjcJson.S(p, "snapshot_id"))) LogLocal("snapshot " + IjcJson.S(p, "snapshot_id"));
				lastWasOffline = offline; bridgeOffline = offline; lastAgent = agent;
				if (!offline) last = p;
			}
			offline = bridgeOffline;
			if (bridgeBanner != null) bridgeBanner.Visibility = offline && last != null ? Visibility.Visible : Visibility.Collapsed;
			if (analysisArea != null) analysisArea.Opacity = offline ? 0.55 : 1.0;
			if (ctxLabel != null) ctxLabel.Opacity = offline ? 0.55 : 1.0;

			Set("st:ENGINE", last == null ? "UNKNOWN" : offline ? "UNKNOWN · last known" : (IjcJson.S(last, "status") == "STARTING" ? "STARTING" : "OPERATIONAL"));
			Set("st:LIVE DATA", offline ? "OFFLINE" : IjcJson.S(last, "bridge.mode"), offline ? Amber : Text);
			Set("st:JEV AGENT", lastAgent == null ? "NOT REPORTED" : IjcJson.S(lastAgent, "status") + " · " + IjcJson.S(lastAgent, "provider.id"));
			Set("rb.local", IjcExecutor.State);
			Set("rb.cp", IjcExecutor.ControlPlaneStatus);
			Set("rb.orphans", IjcExecutor.Orphans.ToString(Inv));
			Set("rb.accts", IjcExecutor.AccountsReported.ToString(Inv));

			JObject s = last;
			if (s == null) { Set("rc.exec", "NOT_REPORTED"); Set("rc.decision", "NONE · sem snapshot"); Set("rc.strategy", "NOT AVAILABLE"); Set("rc.position", "UNKNOWN"); return; }
			if (IjcJson.S(s, "status") == "STARTING") { Set("ctx.why", "Aguardando primeiro snapshot"); return; }

			string c = IjcJson.S(s, "jev.directional_context");
			if (ctxLabel != null) { ctxLabel.Text = CtxIcon(c) + c; ctxLabel.Foreground = CtxBrush(c); }
			Set("ctx.why", c == "NO_TRADE_CONTEXT" ? "Contexto desfavorável à exposição direcional; não é ordem"
				: (c == "UNKNOWN" && IjcJson.S(s, "jev.context_reason") == "RC_NO_ACTIVE_DIRECTIONAL_RULE" ? "Sem regra direcional ativa — estado operacional legítimo" : IjcJson.S(s, "jev.context_explanation")));
			Set("ctx.scope", "Contexto: " + IjcJson.S(s, "market_state.target") + " · Ordem: " + (draft.Instrument ?? "—"));
			Set("ctx.dq", "DQ " + IjcJson.S(s, "data_quality.status"));
			Set("mk.instrument", IjcJson.S(s, "market_state.target"));
			Set("mk.timeframe", "—");
			Set("mk.state", "Descritivo · " + IjcJson.S(s, "market_state.gamma_regime"));
			string dq = IjcJson.S(s, "data_quality.status");
			Set("mk.dq", dq, dq == "VALID" ? Long : dq == "DATA_INVALID" ? Short : Amber);
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
			Set("spx.trace", IjcJson.S(s, "spx_context.trace_freshness") + " · " + effOf("TRACE"), Unknown);
			Set("spx.vs", IjcJson.S(s, "spx_context.volsignals_freshness") + " · " + effOf("VOLSIGNALS"), Unknown);
			Set("spx.effect", s.SelectToken("spx_context.effect_on_native") == null || s.SelectToken("spx_context.effect_on_native").Type == JTokenType.Null ? "Efeitos por dimensão (sem agregado)" : IjcJson.S(s, "spx_context.effect_on_native"));
			Set("spx.mq", IjcJson.S(s, "menthorq.confirmation"));
			JArray reasons = s.SelectToken("reason_codes") as JArray ?? new JArray();
			Set("an.ctx", c);
			Set("an.reasons", reasons.Count > 0 ? IjcJson.S(reasons[0], "label") : "—");
			Set("an.conflicts", "Ver Details / output");
			Set("an.unres", IjcJson.S(s, "unresolved.count") + " campos");
			Set("an.quality", dq + " · por fonte em Details");
			Set("dt.reasons", string.Join("\n", reasons.Select(r => IjcJson.S(r, "code") + " — " + IjcJson.S(r, "label"))));
			Set("dt.unres", IjcJson.S(s, "unresolved.count") + " campos com semântica/sinal UNKNOWN. Amostra: " + string.Join(", ", (s.SelectToken("unresolved.sample") as JArray ?? new JArray()).Select(x => (string)x)));
			JObject ps = s.SelectToken("data_quality.per_source") as JObject ?? new JObject();
			JObject dims = s.SelectToken("data_quality.dimensions") as JObject ?? new JObject();
			Set("dt.quality", string.Join("\n", ps.Properties().Select(x => x.Name.Replace("FR_", "") + ": " + x.Value)) + "\n" + string.Join("\n", dims.Properties().Select(x => x.Name + ": " + x.Value)));
			Set("dt.audit", "core_comparison " + IjcJson.S(s, "core_comparison") + " · ordens emitidas pelo motor " + IjcJson.S(s, "guarantees.orders_emitted") + " · snapshot " + IjcJson.S(s, "snapshot_id"));

			string mode = IjcJson.S(s, "robot.state");
			Set("rc.mode", mode, mode == "ARMED" ? Long : Gold);
			Set("st:ROBOT", mode);
			Set("rc.why", IjcJson.S(s, "robot.locked_reason"));
			Set("rc.exec", IjcJson.S(s, "robot.execution"));
			Set("rc.strategy", IjcJson.S(s, "robot.strategy"));
			string action = IjcJson.S(s, "robot.decision.action");
			Set("rc.decision", (action == "—" ? "NONE" : action) + " / " + (action == "NONE" || action == "—" ? "NONE" : action));
			string pos = IjcJson.S(s, "robot.position.state");
			Set("rc.position", pos == "NOT_REPORTED" || pos == "—" ? "UNKNOWN · Não reportada" : pos);
			Set("rb.mode", mode);
			Set("rb.exec", IjcJson.S(s, "robot.execution"));
			Set("rb.path", IjcJson.S(s, "robot.order_path"));
			Set("rb.decision", action + " · " + IjcJson.S(s, "robot.decision.snapshot_id"));
			Set("rb.recon", IjcJson.S(s, "robot.executor.reconciliation.status") + " (local " + IjcExecutor.ReconStatus + ")");
			JArray gates = s.SelectToken("robot.gates") as JArray ?? new JArray();
			Set("rb.gates", string.Join("\n", gates.Select(g => ((bool?)g["pass"] == true ? "PASS  " : "FAIL  ") + IjcJson.S(g, "id") + " — " + IjcJson.S(g, "detail"))));
			Set("footer", (offline ? "Último conhecido: " : "Último snapshot: ") + IjcJson.S(s, "jev.evaluated_at") + " · " + IjcJson.S(s, "snapshot_id"));
		}
	}
}
