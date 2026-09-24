// INVICTUS JEV CODE — AddOn NT8 (host). CODIGO-FONTE NO REPOSITORIO: NAO instalado, NAO compilado no NT8 (F5 NOT PERFORMED).
// Ciclo de vida (padrao Invictus AlfaOmegaRobo): SetDefaults sem I/O; Start idempotente em OnWindowCreated(ControlCenter);
// Terminated para threads (executor read-only) e registra no log. O robo SEMPRE nasce OFF (nada de ON e restaurado).
#region Using declarations
using System;
using System.IO;
using System.Windows;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
#endregion

namespace NinjaTrader.NinjaScript.AddOns.InvictusJevCode
{
	public static class IjcRuntime
	{
		private static readonly object Gate = new object();
		private static bool started;

		public static string DataDir()
		{
			return Path.Combine(NinjaTrader.Core.Globals.UserDataDir, "invictus-jev-code");   // nunca bin\Custom
		}

		public static void Start()
		{
			lock (Gate)
			{
				if (started) return;
				started = true;
				IjcDiag.LogDir = Path.Combine(DataDir(), "logs");
				IjcDiag.Log("addon_start", "info", IjcSafety.ProductName + " · ORDER_PATH=" + IjcSafety.ORDER_PATH + " · JEV_CAN_SEND_ORDER=false", null, "OFF");
				IjcExecutor.Start();
			}
		}

		public static void Stop()
		{
			lock (Gate)
			{
				if (!started) return;
				started = false;
				IjcExecutor.Stop();
				IjcDiag.Log("addon_stop", "info", "Terminated", null, "OFF");
			}
		}
	}

	public class IjcAddOn : AddOnBase
	{
		private NTMenuItem ijcMenuItem;
		private NTMenuItem newMenu;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Name = IjcSafety.ProductName;
				Description = "INVICTUS JEV CODE — Market Analyzer / Robot Control Center. Executor READ-ONLY; ordens HARD_DISABLED neste build.";
			}
			else if (State == State.Terminated)
			{
				IjcRuntime.Stop();
			}
		}

		protected override void OnWindowCreated(Window window)
		{
			ControlCenter cc = window as ControlCenter;
			if (cc == null) return;
			try { IjcRuntime.Start(); } catch (Exception ex) { IjcDiag.Log("addon_start_error", "error", ex.Message); }
			newMenu = cc.FindFirst("ControlCenterMenuItemNew") as NTMenuItem;
			if (newMenu == null) return;
			ijcMenuItem = new NTMenuItem { Header = IjcSafety.ProductName, Style = Application.Current.TryFindResource("MainMenuItem") as Style };
			newMenu.Items.Add(ijcMenuItem);
			ijcMenuItem.Click += OnMenuClick;
		}

		protected override void OnWindowDestroyed(Window window)
		{
			if (ijcMenuItem != null && window is ControlCenter)
			{
				if (newMenu != null && newMenu.Items.Contains(ijcMenuItem)) newMenu.Items.Remove(ijcMenuItem);
				ijcMenuItem.Click -= OnMenuClick;
				ijcMenuItem = null;
			}
		}

		private void OnMenuClick(object sender, RoutedEventArgs e)
		{
			NinjaTrader.Core.Globals.RandomDispatcher.BeginInvoke(new Action(() => new IjcControlCenterWindow().Show()));
		}
	}
}
