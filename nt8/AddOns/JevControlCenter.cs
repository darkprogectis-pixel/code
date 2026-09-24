// JEV Control Center — NinjaTrader 8 AddOn (Analyzer). CODIGO-FONTE NO REPOSITORIO: NAO instalado no NT8, NAO compilado no NT8 (F5 NOT PERFORMED).
// Papel: exibir o estado do JEV lido da JEV Bridge local (http://127.0.0.1:3590/jev/v1/state, somente GET).
// Garantias:
//  - nenhuma API de conta/ordem e usada (sem Account, sem SubmitOrder/CreateOrder, sem ATM);
//  - todo I/O de rede roda em Task de background (thread pool), nunca no thread de UI nem em thread critico do NT8;
//  - bridge/agente/internet indisponivel => painel mostra OFFLINE e o NT8 segue normalmente;
//  - botao ROBO existe mas esta travado OFF (JEV_CAN_SEND_ORDER=false no JEV V1);
//  - sem probabilidade LONG/SHORT (conviction UNCALIBRATED).
#region Using declarations
using System;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using Newtonsoft.Json.Linq;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
	public class JevControlCenter : AddOnBase
	{
		private NTMenuItem jevMenuItem;
		private NTMenuItem newMenu;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Name = "JEV Control Center";
				Description = "JEV Analyzer (somente leitura da JEV Bridge local). Nao envia ordens.";
			}
		}

		protected override void OnWindowCreated(Window window)
		{
			ControlCenter cc = window as ControlCenter;
			if (cc == null)
				return;
			newMenu = cc.FindFirst("ControlCenterMenuItemNew") as NTMenuItem;
			if (newMenu == null)
				return;
			jevMenuItem = new NTMenuItem { Header = "JEV Control Center", Style = Application.Current.TryFindResource("MainMenuItem") as Style };
			newMenu.Items.Add(jevMenuItem);
			jevMenuItem.Click += OnJevMenuClick;
		}

		protected override void OnWindowDestroyed(Window window)
		{
			if (jevMenuItem != null && window is ControlCenter)
			{
				if (newMenu != null && newMenu.Items.Contains(jevMenuItem))
					newMenu.Items.Remove(jevMenuItem);
				jevMenuItem.Click -= OnJevMenuClick;
				jevMenuItem = null;
			}
		}

		private void OnJevMenuClick(object sender, RoutedEventArgs e)
		{
			Core.Globals.RandomDispatcher.BeginInvoke(new Action(() => new JevControlCenterWindow().Show()));
		}
	}

	public class JevControlCenterWindow : NTWindow
	{
		// Endpoint somente leitura da bridge local (loopback). Nenhuma outra URL e acessada.
		private const string StateUrl = "http://127.0.0.1:3590/jev/v1/state";
		private const int PollMs = 3000;
		private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };

		private readonly CancellationTokenSource cts = new CancellationTokenSource();
		private readonly TextBlock header = new TextBlock { FontWeight = FontWeights.Bold, FontSize = 14 };
		private readonly TextBlock offline = new TextBlock { Foreground = Brushes.IndianRed, TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed,
			Text = "JEV Bridge indisponivel — nenhum sistema de trading e afetado." };
		private readonly TextBlock context = new TextBlock { FontSize = 22, FontWeight = FontWeights.Bold };
		private readonly TextBlock contextWhy = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray };
		private readonly TextBlock robotWhy = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray, FontSize = 11 };
		private readonly TextBlock body = new TextBlock { TextWrapping = TextWrapping.Wrap, FontFamily = new FontFamily("Consolas"), FontSize = 11.5 };

		public JevControlCenterWindow()
		{
			Caption = "JEV Control Center";
			Width = 400;
			Height = 720;

			ToggleButton robot = new ToggleButton
			{
				Content = "ROBO OFF (travado)",
				IsChecked = false,
				IsEnabled = false, // JEV V1: execucao desabilitada; nao ha caminho de codigo para habilitar
				Margin = new Thickness(0, 6, 0, 2),
				ToolTip = "Robot Executor exige fase propria, pre-registro e ordem explicita do operador"
			};

			StackPanel panel = new StackPanel { Margin = new Thickness(10) };
			panel.Children.Add(header);
			panel.Children.Add(offline);
			panel.Children.Add(new TextBlock { Text = "CONTEXTO DIRECIONAL", Foreground = Brushes.Gray, Margin = new Thickness(0, 8, 0, 0) });
			panel.Children.Add(context);
			panel.Children.Add(contextWhy);
			panel.Children.Add(new TextBlock { Text = "Classificacao, nao ordem · conviction UNCALIBRATED · probabilidade nao exibida", Foreground = Brushes.Gray, FontSize = 11, TextWrapping = TextWrapping.Wrap });
			panel.Children.Add(robot);
			panel.Children.Add(robotWhy);
			panel.Children.Add(new Separator { Margin = new Thickness(0, 8, 0, 8) });
			panel.Children.Add(body);
			Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };

			header.Text = "JEV Control Center · conectando...";
			Closed += (s, e) => cts.Cancel();
			Task.Run(() => PollLoop(cts.Token));
		}

		private async Task PollLoop(CancellationToken token)
		{
			while (!token.IsCancellationRequested)
			{
				JObject state = null;
				try
				{
					string json = await Http.GetStringAsync(StateUrl).ConfigureAwait(false);
					state = JObject.Parse(json);
				}
				catch (Exception)
				{
					state = null; // bridge fora do ar, timeout ou JSON invalido: so o painel reflete; NT8 nao e afetado
				}
				JObject snapshot = state;
				try { await Dispatcher.InvokeAsync(() => Render(snapshot)); } catch (Exception) { return; }
				try { await Task.Delay(PollMs, token).ConfigureAwait(false); } catch (TaskCanceledException) { return; }
			}
		}

		private static string S(JToken t, string path)
		{
			JToken v = t == null ? null : t.SelectToken(path);
			return v == null || v.Type == JTokenType.Null ? "—" : v.ToString();
		}

		private void Render(JObject p)
		{
			if (p == null)
			{
				offline.Visibility = Visibility.Visible;
				header.Text = "JEV Control Center · OFFLINE";
				return;
			}
			offline.Visibility = Visibility.Collapsed;
			header.Text = string.Format("JEV Control Center · {0} · {1} · ciclo {2}", S(p, "status"), S(p, "bridge.mode"), S(p, "bridge.cycles"));
			context.Text = S(p, "jev.directional_context");
			contextWhy.Text = S(p, "jev.context_explanation");
			robotWhy.Text = S(p, "robot.locked_reason");

			string sources = string.Join("  ", ((p.SelectToken("data_quality.per_source") as JObject) ?? new JObject()).Properties()
				.Where(x => !x.Name.Contains("FROZEN_BLOCK") && !x.Name.Contains("CACHE") && !x.Name.Contains("INDICATOR"))
				.Select(x => x.Name.Replace("FR_", "") + "=" + x.Value));
			string dims = string.Join("  ", ((p.SelectToken("data_quality.dimensions") as JObject) ?? new JObject()).Properties().Select(x => x.Name + "=" + x.Value));
			string effects = string.Join("  ", ((p.SelectToken("spx_context.effects") as JArray) ?? new JArray()).Select(e => S(e, "source") + "·" + S(e, "dimension") + "=" + S(e, "effect")));
			string reasons = string.Join("\n", ((p.SelectToken("reason_codes") as JArray) ?? new JArray()).Select(r => "· " + S(r, "code")));

			body.Text =
				"MARKET STATE\n" +
				"avaliado " + S(p, "jev.evaluated_at") + " · sessao " + S(p, "jev.session") + "\n" +
				"regime 0DTE " + S(p, "market_state.gamma_regime") + "\n\n" +
				"DATA QUALITY  " + S(p, "data_quality.status") + "\n" + sources + "\n" + dims + "\n\n" +
				"DEALER CONTEXT (descritivo)\n" +
				"regime 0DTE/next/full " + S(p, "dealer_context.gamma_regime.zero") + " / " + S(p, "dealer_context.gamma_regime.next") + " / " + S(p, "dealer_context.gamma_regime.full") + "\n" +
				"acima " + S(p, "dealer_context.nearest_above.level") + " (" + S(p, "dealer_context.nearest_above.distance_pts") + ")\n" +
				"abaixo " + S(p, "dealer_context.nearest_below.level") + " (" + S(p, "dealer_context.nearest_below.distance_pts") + ")\n" +
				"DEX put/call " + S(p, "dealer_context.put_call_dex_ratio") + " · direcao DEX/2a ordem/skew UNRESOLVED\n\n" +
				"SPX CONTEXT (origem SPX)\n" +
				"efeito escalar " + S(p, "spx_context.effect_on_native") + "\n" + effects + "\n\n" +
				"REASON CODES\n" + reasons + "\n\n" +
				"UNRESOLVED " + S(p, "unresolved.count") + " campos\n" +
				"MenthorQ " + S(p, "menthorq.confirmation") + " · Core " + S(p, "core_comparison");
		}
	}
}
