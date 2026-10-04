// JARVIS floating avatar — SHADOW / READ-ONLY visual + PTT client of the existing JARVIS core (127.0.0.1:<port>, default 3594).
// Built by tools/jarvis/avatar/build.mjs with the Windows built-in .NET Framework csc (C# 5, WPF). Contract: PROPOSAL R2 §2–§3.
// Network: ONLY http://127.0.0.1:<port> — GET /api/events (SSE), /api/ui-state, /api/audio/<cycle>/<n>; POST /api/ui-state {state,cycle},
// /api/ask-audio, /api/cancel. No order/trading/account paths, no Process.Start, no shell, answer text is never executed or shown.
// Exit codes: 0 quit · 2 usage · 3 already running · 4 fatal · 5 self-test error.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;

[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]

namespace Jev.Jarvis
{
    static class Native
    {
        public const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
        public const long WS_CAPTION = 0xC00000, WS_THICKFRAME = 0x40000, WS_SYSMENU = 0x80000;
        public const long WS_EX_TOPMOST = 0x8, WS_EX_TOOLWINDOW = 0x80, WS_EX_LAYERED = 0x80000, WS_EX_NOACTIVATE = 0x08000000;
        public const int WM_CLOSE = 0x10;
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr64(IntPtr h, int i);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern IntPtr GetWindowLong32(IntPtr h, int i);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr64(IntPtr h, int i, IntPtr v);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] static extern IntPtr SetWindowLong32(IntPtr h, int i, IntPtr v);
        public static long GetLong(IntPtr h, int i) { return (IntPtr.Size == 8 ? GetWindowLongPtr64(h, i) : GetWindowLong32(h, i)).ToInt64(); }
        public static void SetLong(IntPtr h, int i, long v) { if (IntPtr.Size == 8) SetWindowLongPtr64(h, i, new IntPtr(v)); else SetWindowLong32(h, i, new IntPtr((int)v)); }
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, int flags);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr h);
        [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr c);
        // winmm wave-in (microphone), CALLBACK_NULL + polling of WHDR_DONE
        [StructLayout(LayoutKind.Sequential)] public struct WAVEFORMATEX { public ushort wFormatTag, nChannels; public uint nSamplesPerSec, nAvgBytesPerSec; public ushort nBlockAlign, wBitsPerSample, cbSize; }
        [StructLayout(LayoutKind.Sequential)] public struct WAVEHDR { public IntPtr lpData; public uint dwBufferLength, dwBytesRecorded; public IntPtr dwUser; public uint dwFlags, dwLoops; public IntPtr lpNext, reserved; }
        public const int WAVE_MAPPER = -1; public const uint WHDR_DONE = 1;
        [DllImport("winmm.dll")] public static extern int waveInOpen(out IntPtr h, int dev, ref WAVEFORMATEX f, IntPtr cb, IntPtr inst, int flags);
        [DllImport("winmm.dll")] public static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
        [DllImport("winmm.dll")] public static extern int waveInUnprepareHeader(IntPtr h, IntPtr hdr, int size);
        [DllImport("winmm.dll")] public static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
        [DllImport("winmm.dll")] public static extern int waveInStart(IntPtr h);
        [DllImport("winmm.dll")] public static extern int waveInReset(IntPtr h);
        [DllImport("winmm.dll")] public static extern int waveInClose(IntPtr h);
    }

    // 16 kHz mono 16-bit microphone capture (4 × 100 ms buffers, polled on a worker thread).
    sealed class Mic
    {
        IntPtr h = IntPtr.Zero; IntPtr[] hdrs; Thread th; volatile bool run; readonly MemoryStream pcm = new MemoryStream(); readonly object gate = new object();
        static readonly int HS = Marshal.SizeOf(typeof(Native.WAVEHDR));
        public bool Start(out string err)
        {
            err = null; var f = new Native.WAVEFORMATEX { wFormatTag = 1, nChannels = 1, nSamplesPerSec = 16000, nAvgBytesPerSec = 32000, nBlockAlign = 2, wBitsPerSample = 16, cbSize = 0 };
            int r = Native.waveInOpen(out h, Native.WAVE_MAPPER, ref f, IntPtr.Zero, IntPtr.Zero, 0);
            if (r != 0) { err = "waveInOpen=" + r; h = IntPtr.Zero; return false; }
            hdrs = new IntPtr[4];
            for (int i = 0; i < 4; i++)
            {
                var hd = new Native.WAVEHDR { lpData = Marshal.AllocHGlobal(3200), dwBufferLength = 3200 };
                hdrs[i] = Marshal.AllocHGlobal(HS); Marshal.StructureToPtr(hd, hdrs[i], false);
                Native.waveInPrepareHeader(h, hdrs[i], HS); Native.waveInAddBuffer(h, hdrs[i], HS);
            }
            run = true; Native.waveInStart(h);
            th = new Thread(Poll) { IsBackground = true, Name = "mic" }; th.Start(); return true;
        }
        void Drain(IntPtr p, bool requeue)
        {
            var hd = (Native.WAVEHDR)Marshal.PtrToStructure(p, typeof(Native.WAVEHDR));
            if ((hd.dwFlags & Native.WHDR_DONE) == 0) return;
            if (hd.dwBytesRecorded > 0) { var b = new byte[hd.dwBytesRecorded]; Marshal.Copy(hd.lpData, b, 0, b.Length); lock (gate) pcm.Write(b, 0, b.Length); }
            if (requeue) { hd.dwFlags &= ~Native.WHDR_DONE; hd.dwBytesRecorded = 0; Marshal.StructureToPtr(hd, p, false); Native.waveInAddBuffer(h, p, HS); }
        }
        void Poll() { while (run) { foreach (var p in hdrs) Drain(p, true); Thread.Sleep(20); } }
        // ⇒ float32 little-endian samples
        public float[] Stop()
        {
            if (h == IntPtr.Zero) return new float[0];
            run = false; if (th != null) th.Join(500);
            Native.waveInReset(h);
            foreach (var p in hdrs) { Drain(p, false); Native.waveInUnprepareHeader(h, p, HS); var hd = (Native.WAVEHDR)Marshal.PtrToStructure(p, typeof(Native.WAVEHDR)); Marshal.FreeHGlobal(hd.lpData); Marshal.FreeHGlobal(p); }
            Native.waveInClose(h); h = IntPtr.Zero;
            byte[] b; lock (gate) b = pcm.ToArray();
            var x = new float[b.Length / 2]; for (int i = 0; i < x.Length; i++) x[i] = BitConverter.ToInt16(b, i * 2) / 32768f; return x;
        }
    }

    sealed class Opts
    {
        public string Repo, VarDir, Asset, SelfTest, InjectAudio; public int Port = 3594; public bool Mute, Close, ExitAfterCycle; public double? PosX, PosY;
        public int HoldMs = 0, BargeInAfterMs = -1, BackoffBaseMs = 1000; public bool MuteSet;
        public string MutexName { get { return "Local\\JEV_JARVIS_AVATAR_" + ((uint)VarDir.ToLowerInvariant().GetHashCode()).ToString("x8"); } }
    }

    sealed class AvatarApp
    {
        // ---------- entry ----------
        [STAThread]
        public static int Main(string[] args)
        {
            try { AppContext.SetSwitch("Switch.System.Windows.DoNotScaleForDpiChanges", false); } catch { }
            return Run(args);
        }
        [MethodImpl(MethodImplOptions.NoInlining)]
        static int Run(string[] args)
        {
            Opts o;
            try { o = Parse(args); } catch (Exception e) { Console.Error.WriteLine("usage: " + e.Message); return 2; }
            if (o.Close) return CloseExisting(o);
            bool created; var mutex = new Mutex(true, o.MutexName, out created);
            if (!created) { Console.Error.WriteLine("JarvisAvatar already running"); return 3; }
            var app = new AvatarApp(o);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => { app.Fatal(e.ExceptionObject as Exception); };
            int code;
            try { code = app.RunUi(); }
            catch (Exception e) { app.Fatal(e); code = 4; }
            try { mutex.ReleaseMutex(); } catch { }
            return code;
        }

        static Opts Parse(string[] a)
        {
            var o = new Opts();
            string exeDir = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
            o.Repo = System.IO.Path.GetFullPath(System.IO.Path.Combine(exeDir, "..", "..", ".."));
            for (int i = 0; i < a.Length; i++)
            {
                string k = a[i]; Func<string> v = () => { if (i + 1 >= a.Length) throw new ArgumentException(k + " needs a value"); return a[++i]; };
                switch (k)
                {
                    case "--repo": o.Repo = v(); break;
                    case "--var": o.VarDir = v(); break;
                    case "--asset": o.Asset = v(); break;
                    case "--port": o.Port = int.Parse(v()); break;
                    case "--selftest": o.SelfTest = v(); break;
                    case "--hold-ms": o.HoldMs = int.Parse(v()); break;
                    case "--inject-audio": o.InjectAudio = v(); break;
                    case "--exit-after-cycle": o.ExitAfterCycle = true; break;
                    case "--barge-in-after-ms": o.BargeInAfterMs = int.Parse(v()); break;
                    case "--backoff-ms": o.BackoffBaseMs = int.Parse(v()); break;
                    case "--mute": o.Mute = true; o.MuteSet = true; break;
                    case "--close": o.Close = true; break;
                    case "--pos": { var p = v().Split(','); o.PosX = double.Parse(p[0], System.Globalization.CultureInfo.InvariantCulture); o.PosY = double.Parse(p[1], System.Globalization.CultureInfo.InvariantCulture); break; }
                    default: throw new ArgumentException("unknown option " + k);
                }
            }
            var cfg = ReadJson(System.IO.Path.Combine(o.Repo, "config", "jarvis.json"));
            if (o.VarDir == null) o.VarDir = System.IO.Path.Combine(o.Repo, (Get(cfg, "jarvis_dir") as string) ?? "var/jarvis");
            o.VarDir = System.IO.Path.GetFullPath(o.VarDir);
            bool portArg = Array.IndexOf(a, "--port") >= 0;
            if (!portArg) { string ep = Environment.GetEnvironmentVariable("JARVIS_PORT"); var srv = Get(cfg, "server") as Dictionary<string, object>; if (!string.IsNullOrEmpty(ep)) o.Port = int.Parse(ep); else if (srv != null && srv.ContainsKey("port")) o.Port = Convert.ToInt32(srv["port"]); }
            if (o.Asset == null) { var av = Get(cfg, "avatar") as Dictionary<string, object>; o.Asset = System.IO.Path.Combine(o.Repo, av != null && av.ContainsKey("asset") ? (string)av["asset"] : "assets/jarvis/jarvis-avatar.png"); }
            return o;
        }
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        static Dictionary<string, object> ReadJson(string f) { try { return Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(f)); } catch { return new Dictionary<string, object>(); } }
        static object Get(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) ? v : null; }

        static int CloseExisting(Opts o)
        {
            var rt = ReadJson(System.IO.Path.Combine(o.VarDir, "avatar", "runtime.json"));
            if (Get(rt, "hwnd") == null) return 1;
            var hwnd = new IntPtr(Convert.ToInt64(rt["hwnd"])); int pid = Convert.ToInt32(rt["pid"]);
            Native.PostMessage(hwnd, Native.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            try { var p = System.Diagnostics.Process.GetProcessById(pid); return p.WaitForExit(3000) ? 0 : 1; } catch { return 0; }
        }

        // ---------- instance ----------
        readonly Opts o; readonly DateTime t0 = DateTime.UtcNow; string token = "";
        Window win; Grid root; Image img; DropShadowEffect glow; IntPtr hwnd; System.Windows.Forms.NotifyIcon tray;
        string assetStatus = "OK"; string assetFormat = null; int assetW, assetH;
        double sizeDip = 240; bool muted;
        readonly List<Dictionary<string, object>> stateLog = new List<Dictionary<string, object>>();
        readonly List<string> events = new List<string>();
        string busState = "IDLE"; string shownState = null; bool coreOffline; Storyboard anim; DispatcherTimer speakTimer, errorTimer, saveTimer;
        // own cycle
        volatile bool recording, ownSpeaking, barged; Mic mic; System.Media.SoundPlayer player; double[] envelope; DateTime chunkStart; readonly object playGate = new object();
        readonly ManualResetEvent stopEvt = new ManualResetEvent(false); // barge-in wakes the playback wait at once
        Dictionary<string, object> lastAnswer; readonly List<double> speakOpacity = new List<double>(); double bargeStopMs = -1; string lastCycle;
        bool dragWired, dragging; Point downAt; bool down;
        public AvatarApp(Opts opts) { o = opts; }

        string AvatarDir { get { var d = System.IO.Path.Combine(o.VarDir, "avatar"); Directory.CreateDirectory(d); return d; } }
        void Log(string s) { try { File.AppendAllText(System.IO.Path.Combine(AvatarDir, "avatar.log"), DateTime.UtcNow.ToString("o") + " " + s + Environment.NewLine); } catch { } lock (events) events.Add(Ms() + " " + s); }
        double Ms() { return Math.Round((DateTime.UtcNow - t0).TotalMilliseconds, 1); }
        public void Fatal(Exception e)
        {
            string m = e == null ? "unknown" : (e.GetType().Name + ": " + e.Message + " " + e.StackTrace);
            if (m.Length > 2048) m = m.Substring(0, 2048);
            Log("FATAL " + m);
            try { if (tray != null) tray.Dispose(); } catch { }
            Environment.Exit(4);
        }

        int RunUi()
        {
            try { token = File.ReadAllText(System.IO.Path.Combine(o.VarDir, "token")).Trim(); } catch { Log("TOKEN_MISSING (POST disabled until core creates it)"); }
            LoadPrefs();
            var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
            app.DispatcherUnhandledException += (s, e) => { Fatal(e.Exception); };
            BuildWindow();
            app.Startup += (s, e) => { win.Show(); };
            int code = app.Run(win);
            try { if (tray != null) { tray.Visible = false; tray.Dispose(); } } catch { }
            try { File.Delete(System.IO.Path.Combine(AvatarDir, "runtime.json")); } catch { }
            return code;
        }

        // ---------- window (R2 §2.3) ----------
        void BuildWindow()
        {
            win = new Window
            {
                WindowStyle = WindowStyle.None, ResizeMode = ResizeMode.NoResize, AllowsTransparency = true, Background = Brushes.Transparent,
                Topmost = true, ShowInTaskbar = false, ShowActivated = false, SizeToContent = SizeToContent.Manual, UseLayoutRounding = true,
                Width = sizeDip, Height = sizeDip, Title = "JARVIS", WindowStartupLocation = WindowStartupLocation.Manual,
            };
            root = new Grid { Background = Brushes.Transparent };
            glow = new DropShadowEffect { ShadowDepth = 0, Color = Hex("#8A2BE2"), BlurRadius = 12, Opacity = 0.25, RenderingBias = RenderingBias.Performance };
            FrameworkElement face;
            if (File.Exists(o.Asset))
            {
                try
                {
                    var bi = new BitmapImage(); bi.BeginInit(); bi.UriSource = new Uri(o.Asset, UriKind.Absolute); bi.CacheOption = BitmapCacheOption.OnLoad; bi.DecodePixelWidth = (int)Math.Min(1254, sizeDip * 2); bi.EndInit(); bi.Freeze();
                    var raw = BitmapFrame.Create(new Uri(o.Asset, UriKind.Absolute), BitmapCreateOptions.DelayCreation, BitmapCacheOption.None);
                    assetFormat = raw.Format.ToString(); assetW = raw.PixelWidth; assetH = raw.PixelHeight;
                    img = new Image { Source = bi, Stretch = Stretch.Uniform }; RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality); face = img;
                }
                catch (Exception e) { assetStatus = "INVALID"; Log("AVATAR_ASSET_INVALID " + e.Message); face = Placeholder(); }
            }
            else { assetStatus = "MISSING"; Log("AVATAR_ASSET_MISSING " + o.Asset); face = Placeholder(); }
            face.Effect = glow; root.Children.Add(face); win.Content = root;
            PlaceInitial();
            win.SourceInitialized += (s, e) =>
            {
                hwnd = new WindowInteropHelper(win).Handle;
                long ex = Native.GetLong(hwnd, Native.GWL_EXSTYLE);
                Native.SetLong(hwnd, Native.GWL_EXSTYLE, ex | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE); Native.SetLong(hwnd, Native.GWL_STYLE, Native.GetLong(hwnd, Native.GWL_STYLE) & ~Native.WS_SYSMENU); // no system menu (Alt+Space)
            };
            win.ContentRendered += (s, e) => OnReady();
            // drag vs click (R2 §2.4)
            win.MouseLeftButtonDown += (s, e) => { down = true; dragging = false; downAt = e.GetPosition(win); };
            win.MouseMove += (s, e) =>
            {
                if (!down || e.LeftButton != MouseButtonState.Pressed) return;
                var p = e.GetPosition(win);
                if (Math.Abs(p.X - downAt.X) >= 4 || Math.Abs(p.Y - downAt.Y) >= 4) { dragging = true; down = false; try { win.DragMove(); } catch (InvalidOperationException) { } }
            };
            win.MouseLeftButtonUp += (s, e) => { bool click = down && !dragging; down = false; if (click) OnClick(); };
            dragWired = true;
            saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            saveTimer.Tick += (s, e) => { saveTimer.Stop(); SavePrefs(); };
            win.LocationChanged += (s, e) => { saveTimer.Stop(); saveTimer.Start(); };
            win.Closed += (s, e) => { try { if (tray != null) { tray.Visible = false; tray.Dispose(); tray = null; } } catch { } };
            BuildMenu(); BuildTray();
            ApplyVisual("IDLE", "init");
        }
        FrameworkElement Placeholder()
        {
            var g = new Grid();
            g.Children.Add(new Ellipse { Stroke = new SolidColorBrush(Hex("#9B4DFF")), StrokeThickness = 4, Fill = new SolidColorBrush(Color.FromArgb(200, 12, 8, 20)), Margin = new Thickness(20) });
            g.Children.Add(new TextBlock { Text = "Ω", Foreground = new SolidColorBrush(Hex("#B44CFF")), FontSize = 96, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
            return g;
        }
        static Color Hex(string h) { return (Color)ColorConverter.ConvertFromString(h); }

        void PlaceInitial()
        {
            var wa = SystemParameters.WorkArea; double l = wa.Right - sizeDip - 24, t = wa.Bottom - sizeDip - 24;
            if (savedLeft.HasValue && savedTop.HasValue)
            {
                double vl = SystemParameters.VirtualScreenLeft, vt = SystemParameters.VirtualScreenTop, vr = vl + SystemParameters.VirtualScreenWidth, vb = vt + SystemParameters.VirtualScreenHeight;
                double ix = Math.Max(0, Math.Min(savedLeft.Value + sizeDip, vr) - Math.Max(savedLeft.Value, vl)), iy = Math.Max(0, Math.Min(savedTop.Value + sizeDip, vb) - Math.Max(savedTop.Value, vt));
                if (ix * iy >= 0.5 * sizeDip * sizeDip) { l = savedLeft.Value; t = savedTop.Value; } else Log("SAVED_POSITION_OFFSCREEN ⇒ default");
            }
            win.Left = l; win.Top = t;
        }

        // ---------- prefs (var/jarvis/avatar.json) ----------
        double? savedLeft, savedTop;
        string PrefsFile { get { return System.IO.Path.Combine(o.VarDir, "avatar.json"); } }
        void LoadPrefs()
        {
            var d = ReadJson(PrefsFile);
            if (Get(d, "left") != null && Get(d, "top") != null) { savedLeft = Convert.ToDouble(d["left"]); savedTop = Convert.ToDouble(d["top"]); }
            if (Get(d, "size") != null) sizeDip = Math.Max(160, Math.Min(320, Convert.ToDouble(d["size"])));
            else { var av = Get(ReadJson(System.IO.Path.Combine(o.Repo, "config", "jarvis.json")), "avatar") as Dictionary<string, object>; if (av != null && av.ContainsKey("size_dip")) sizeDip = Math.Max(160, Math.Min(320, Convert.ToDouble(av["size_dip"]))); }
            if (Get(d, "muted") is bool) muted = (bool)d["muted"];
            if (o.MuteSet) muted = o.Mute;
        }
        void SavePrefs()
        {
            try
            {
                Directory.CreateDirectory(o.VarDir);
                var d = new Dictionary<string, object> { { "schema", "jarvis-avatar/v1" }, { "left", Math.Round(win.Left, 1) }, { "top", Math.Round(win.Top, 1) }, { "size", sizeDip }, { "muted", muted } };
                string tmp = PrefsFile + ".tmp-" + System.Diagnostics.Process.GetCurrentProcess().Id;
                File.WriteAllText(tmp, Json.Serialize(d));
                if (File.Exists(PrefsFile)) File.Replace(tmp, PrefsFile, null); else File.Move(tmp, PrefsFile);
                Log("PREFS_SAVED " + Json.Serialize(d));
            }
            catch (Exception e) { Log("PREFS_SAVE_FAILED " + e.Message); }
        }

        // ---------- menu + tray (R2 §2.7) ----------
        MenuItem muteItem;
        void BuildMenu()
        {
            var m = new ContextMenu();
            muteItem = new MenuItem { Header = "Mudo", IsCheckable = true, IsChecked = muted }; muteItem.Click += (s, e) => SetMute(muteItem.IsChecked); m.Items.Add(muteItem);
            var size = new MenuItem { Header = "Tamanho" };
            foreach (var kv in new[] { new KeyValuePair<string, double>("P", 180), new KeyValuePair<string, double>("M", 240), new KeyValuePair<string, double>("G", 300) })
            { var it = new MenuItem { Header = kv.Key }; double v = kv.Value; it.Click += (s, e) => SetSize(v); size.Items.Add(it); }
            m.Items.Add(size);
            var hide = new MenuItem { Header = "Esconder" }; hide.Click += (s, e) => win.Hide(); m.Items.Add(hide);
            var quit = new MenuItem { Header = "Sair" }; quit.Click += (s, e) => win.Close(); m.Items.Add(quit);
            win.ContextMenu = m;
        }
        void BuildTray()
        {
            try
            {
                tray = new System.Windows.Forms.NotifyIcon { Text = "JARVIS (read-only)", Visible = true };
                try { using (var bmp = new System.Drawing.Bitmap(o.Asset)) using (var small = new System.Drawing.Bitmap(bmp, 32, 32)) tray.Icon = System.Drawing.Icon.FromHandle(small.GetHicon()); }
                catch { tray.Icon = System.Drawing.SystemIcons.Application; }
                var cm = new System.Windows.Forms.ContextMenuStrip();
                cm.Items.Add("Mostrar", null, (s, e) => win.Dispatcher.BeginInvoke(new Action(() => win.Show())));
                cm.Items.Add("Esconder", null, (s, e) => win.Dispatcher.BeginInvoke(new Action(() => win.Hide())));
                cm.Items.Add("Sair", null, (s, e) => win.Dispatcher.BeginInvoke(new Action(() => win.Close())));
                tray.ContextMenuStrip = cm;
                tray.DoubleClick += (s, e) => win.Dispatcher.BeginInvoke(new Action(() => win.Show()));
            }
            catch (Exception e) { Log("TRAY_UNAVAILABLE " + e.Message); }
        }
        void SetMute(bool m)
        {
            muted = m; if (muteItem != null) muteItem.IsChecked = m; SavePrefs();
            if (m && ownSpeaking) BargeIn(false);
        }
        void SetSize(double v) { sizeDip = v; win.Width = v; win.Height = v; SavePrefs(); }

        // ---------- ready ----------
        double readyMs = -1;
        void OnReady()
        {
            if (readyMs >= 0) return;
            readyMs = (DateTime.Now - System.Diagnostics.Process.GetCurrentProcess().StartTime).TotalMilliseconds;
            try { File.WriteAllText(System.IO.Path.Combine(AvatarDir, "runtime.json"), Json.Serialize(new Dictionary<string, object> { { "pid", System.Diagnostics.Process.GetCurrentProcess().Id }, { "hwnd", hwnd.ToInt64() }, { "port", o.Port }, { "ready_ms", Math.Round(readyMs) }, { "at", DateTime.UtcNow.ToString("o") } })); } catch { }
            Log("READY " + Math.Round(readyMs) + " ms asset=" + assetStatus);
            try { Console.Out.WriteLine("READY"); Console.Out.Flush(); } catch { }
            var sse = new Thread(SseLoop) { IsBackground = true, Name = "sse" }; sse.Start();
            if (o.SelfTest != null) StartSelfTest();
        }

        // ---------- SSE client (R2 §3.2, §3.6) ----------
        void SseLoop()
        {
            int fails = 0;
            while (true)
            {
                try
                {
                    var rq = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + o.Port + "/api/events");
                    rq.Timeout = 5000; rq.ReadWriteTimeout = 40000; rq.Proxy = null; rq.KeepAlive = true;
                    using (var rs = (HttpWebResponse)rq.GetResponse())
                    using (var rd = new StreamReader(rs.GetResponseStream(), Encoding.UTF8))
                    {
                        fails = 0; if (coreOffline) { coreOffline = false; Log("CORE_ONLINE"); }
                        string ev = null, line;
                        while ((line = rd.ReadLine()) != null)
                        {
                            if (line.StartsWith("event: ")) ev = line.Substring(7);
                            else if (line.StartsWith("data: ") && ev == "state")
                            {
                                var d = Json.Deserialize<Dictionary<string, object>>(line.Substring(6)); var recv = DateTime.UtcNow;
                                win.Dispatcher.BeginInvoke(new Action(() => OnBus(d, recv)));
                            }
                        }
                    }
                }
                catch (Exception e)
                {
                    fails++;
                    if (fails == 3) { coreOffline = true; Log("CORE_OFFLINE " + e.Message); win.Dispatcher.BeginInvoke(new Action(() => ApplyVisual("ERROR", "CORE_OFFLINE"))); }
                }
                int wait = Math.Min(10000, o.BackoffBaseMs * (1 << Math.Min(fails > 0 ? fails - 1 : 0, 4)));
                Thread.Sleep(wait);
            }
        }
        void OnBus(Dictionary<string, object> d, DateTime recv)
        {
            busState = (string)d["state"];
            ApplyVisual(busState, "bus:" + (d.ContainsKey("source") ? d["source"] : "?") + " seq=" + d["seq"], recv);
        }

        // ---------- visuals (R2 §7.1 AVATAR08–12 parameters) ----------
        void ApplyVisual(string state, string why, DateTime? recv = null)
        {
            glow.BeginAnimation(DropShadowEffect.OpacityProperty, null); if (anim != null) { anim.Stop(); anim = null; }
            if (speakTimer != null) speakTimer.Stop(); if (errorTimer != null) errorTimer.Stop();
            string color; double op, blur; bool animating = false; int fps = 0;
            switch (state)
            {
                case "LISTENING": color = "#B44CFF"; op = 0.95; blur = 30; break;
                case "THINKING": color = "#9B4DFF"; op = 0.6; blur = 22; Pulse(0.35, 0.85, 600); animating = true; fps = 20; break;
                case "SPEAKING":
                    color = "#B44CFF"; op = 0.6; blur = 26; animating = true;
                    if (ownSpeaking) { StartSpeakTimer(); fps = 20; } else { Pulse(0.45, 0.9, 250); fps = 20; }
                    break;
                case "ERROR":
                    color = "#E0A040"; op = 0.6; blur = 18;
                    errorTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) }; errorTimer.Tick += (s, e) => { errorTimer.Stop(); if (shownState == "ERROR") ApplyVisual("IDLE", "error-timeout"); }; errorTimer.Start();
                    break;
                default: state = "IDLE"; color = "#8A2BE2"; op = 0.25; blur = 12; break;
            }
            glow.Color = Hex(color); glow.BlurRadius = blur; if (!animating || state == "SPEAKING" && ownSpeaking) glow.Opacity = op;
            shownState = state;
            var e2 = new Dictionary<string, object> { { "t_ms", Ms() }, { "state", state }, { "why", why }, { "color", color }, { "opacity", op }, { "blur", blur }, { "animating", animating }, { "fps", fps } };
            if (recv.HasValue) e2["latency_ms"] = Math.Round((DateTime.UtcNow - recv.Value).TotalMilliseconds, 2);
            lock (stateLog) stateLog.Add(e2);
        }
        void Pulse(double from, double to, int ms)
        {
            var da = new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(ms)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
            Timeline.SetDesiredFrameRate(da, 20);
            Storyboard.SetTarget(da, img != null ? (DependencyObject)img : root.Children[0]);
            Storyboard.SetTargetProperty(da, new PropertyPath("(UIElement.Effect).(DropShadowEffect.Opacity)"));
            anim = new Storyboard(); anim.Children.Add(da); Timeline.SetDesiredFrameRate(anim, 20); anim.Begin();
        }
        void StartSpeakTimer()
        {
            if (speakTimer == null) { speakTimer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(50) }; speakTimer.Tick += (s, e) => SpeakTick(); }
            speakTimer.Start();
        }
        void SpeakTick()
        {
            double lv = 0; double[] env; DateTime cs; lock (playGate) { env = envelope; cs = chunkStart; }
            if (env != null && env.Length > 0) { int k = (int)((DateTime.UtcNow - cs).TotalMilliseconds / 50); if (k >= 0 && k < env.Length) lv = env[k]; }
            double opv = Math.Round(0.3 + 0.7 * Math.Min(1, lv * 3), 3); glow.Opacity = opv;
            lock (speakOpacity) if (speakOpacity.Count < 200) speakOpacity.Add(opv);
        }

        // ---------- own PTT cycle (R2 §3.5) ----------
        void OnClick()
        {
            Log("CLICK recording=" + recording + " speaking=" + ownSpeaking);
            if (recording) { StopAndSend(); return; }
            if (ownSpeaking) { BargeIn(true); return; }
            StartListening();
        }
        float[] injected;
        void StartListening()
        {
            PostState("LISTENING", null);
            recording = true;
            if (o.InjectAudio != null)
            {
                var b = File.ReadAllBytes(o.InjectAudio); injected = new float[b.Length / 4]; Buffer.BlockCopy(b, 0, injected, 0, injected.Length * 4);
                var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) }; t.Tick += (s, e) => { t.Stop(); if (recording) StopAndSend(); }; t.Start();
                return;
            }
            mic = new Mic(); string err;
            if (!mic.Start(out err)) { recording = false; mic = null; Log("MIC_UNAVAILABLE " + err); PostState("ERROR", null); return; }
            var lim = new DispatcherTimer { Interval = TimeSpan.FromSeconds(15) }; lim.Tick += (s, e) => { lim.Stop(); if (recording) StopAndSend(); }; lim.Start();
        }
        void StopAndSend()
        {
            recording = false;
            float[] x = injected ?? (mic != null ? mic.Stop() : new float[0]); injected = null; mic = null;
            if (x.Length < 4000) { Log("TOO_SHORT " + x.Length); PostState("IDLE", null); return; }
            bool speak = !muted;
            var th = new Thread(() => Cycle(x, speak)) { IsBackground = true, Name = "cycle" }; th.Start();
        }
        void Cycle(float[] x, bool speak)
        {
            try
            {
                var body = new byte[x.Length * 4]; Buffer.BlockCopy(x, 0, body, 0, body.Length);
                var res = Http("POST", "/api/ask-audio?speak=" + (speak ? "1" : "0"), body, "application/octet-stream", 30000);
                lastAnswer = Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(res));
                lastCycle = lastAnswer.ContainsKey("voice_cycle_id") ? lastAnswer["voice_cycle_id"] as string : null;
                Log("ANSWER cycle=" + lastCycle + " intent=" + Get(lastAnswer, "intent"));
                var audio = Get(lastAnswer, "audio") as Dictionary<string, object>;
                if (audio == null || !speak) { CycleDone(); return; } // core already set IDLE
                Play((string)audio["chunks_url"]);
            }
            catch (Exception e) { Log("CYCLE_ERROR " + e.Message); PostState("ERROR", lastCycle); CycleDone(); }
        }
        void Play(string url)
        {
            var q = new BlockingCollection<byte[]>(4); barged = false; stopEvt.Reset();
            var fetch = new Thread(() =>
            {
                try { for (int n = 0; !barged; n++) { var b = HttpChunk(url + n); if (b == null) break; q.Add(b); } }
                catch (Exception e) { Log("AUDIO_FETCH_ERROR " + e.Message); }
                finally { q.CompleteAdding(); }
            }) { IsBackground = true }; fetch.Start();
            bool first = true;
            foreach (var wav in q.GetConsumingEnumerable())
            {
                if (barged) break;
                var env = Envelope(wav);
                lock (playGate) { envelope = env; chunkStart = DateTime.UtcNow; player = new System.Media.SoundPlayer(new MemoryStream(wav)); }
                if (first) { first = false; ownSpeaking = true; PostState("SPEAKING", lastCycle); scheduleBarge(); }
                // async Play + cancellable wait: SoundPlayer.Stop() against a PlaySync on another thread blocks for seconds
                try { player.Load(); player.Play(); stopEvt.WaitOne(WavMs(wav)); } catch (Exception e) { Log("PLAY_ERROR " + e.Message); }
            }
            bool wasSpeaking = ownSpeaking; ownSpeaking = false; lock (playGate) { envelope = null; }
            if (!barged && wasSpeaking) PostState("IDLE", lastCycle);
            if (!wasSpeaking && !barged) PostState("IDLE", lastCycle);
            CycleDone();
        }
        void scheduleBarge()
        {
            if (o.BargeInAfterMs < 0) return;
            win.Dispatcher.BeginInvoke(new Action(() => { var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(o.BargeInAfterMs) }; t.Tick += (s, e) => { t.Stop(); if (ownSpeaking) OnClick(); }; t.Start(); }));
        }
        // click while speaking: stop playback, cancel synthesis, listen again (PTT barge-in)
        void BargeIn(bool listen)
        {
            var c0 = DateTime.UtcNow; barged = true; stopEvt.Set();
            System.Media.SoundPlayer p; lock (playGate) p = player;
            try { if (p != null) p.Stop(); } catch { }
            ownSpeaking = false; bargeStopMs = Math.Round((DateTime.UtcNow - c0).TotalMilliseconds, 1);
            Log("BARGE_IN stop_ms=" + bargeStopMs);
            ThreadPool.QueueUserWorkItem(_ => { try { Http("POST", "/api/cancel", Encoding.UTF8.GetBytes("{}"), "application/json", 2000); } catch (Exception e) { Log("CANCEL_FAILED " + e.Message); } });
            if (listen && o.InjectAudio == null) StartListening(); else if (listen) PostState("LISTENING", null); else PostState("IDLE", lastCycle);
        }
        bool cycleDone;
        void CycleDone() { cycleDone = true; }
        static int WavMs(byte[] wav) { if (wav.Length < 44) return 0; int br = BitConverter.ToInt32(wav, 28); return br > 0 ? (int)((wav.Length - 44) * 1000L / br) + 30 : 0; }
        static double[] Envelope(byte[] wav)
        {
            if (wav.Length < 44) return new double[0];
            int sr = BitConverter.ToInt32(wav, 24), n = (wav.Length - 44) / 2, win = Math.Max(1, sr / 20), m = (n + win - 1) / win; var e = new double[m];
            for (int k = 0; k < m; k++) { double s = 0; int a = k * win, b = Math.Min(n, a + win); for (int i = a; i < b; i++) { double v = BitConverter.ToInt16(wav, 44 + i * 2) / 32768.0; s += v * v; } e[k] = Math.Sqrt(s / Math.Max(1, b - a)); }
            return e;
        }

        // ---------- HTTP to the local core only ----------
        void PostState(string state, string cycle)
        {
            string body = cycle != null ? "{\"state\":\"" + state + "\",\"cycle\":\"" + cycle + "\"}" : "{\"state\":\"" + state + "\"}";
            try { Http("POST", "/api/ui-state", Encoding.UTF8.GetBytes(body), "application/json", 2000); }
            catch (Exception e) { Log("UI_STATE_POST_FAILED " + state + " " + e.Message); win.Dispatcher.BeginInvoke(new Action(() => ApplyVisual(state, "local (core unreachable)"))); }
        }
        byte[] Http(string method, string path, byte[] body, string type, int timeout)
        {
            var rq = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + o.Port + path);
            rq.Method = method; rq.Timeout = timeout; rq.ReadWriteTimeout = timeout; rq.Proxy = null;
            if (method == "POST") { rq.Headers["x-jarvis-token"] = token; rq.ContentType = type; rq.ContentLength = body.Length; using (var s = rq.GetRequestStream()) s.Write(body, 0, body.Length); }
            using (var rs = (HttpWebResponse)rq.GetResponse()) using (var ms = new MemoryStream()) { rs.GetResponseStream().CopyTo(ms); return ms.ToArray(); }
        }
        byte[] HttpChunk(string path)
        {
            var rq = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + o.Port + path); rq.Timeout = 20000; rq.ReadWriteTimeout = 20000; rq.Proxy = null;
            using (var rs = (HttpWebResponse)rq.GetResponse()) { if ((int)rs.StatusCode != 200) return null; using (var ms = new MemoryStream()) { rs.GetResponseStream().CopyTo(ms); return ms.Length > 0 ? ms.ToArray() : null; } }
        }

        // ---------- self-test (R2 §7.1) ----------
        readonly Dictionary<string, object> st = new Dictionary<string, object>();
        void StartSelfTest()
        {
            st["ready_ms"] = Math.Round(readyMs); st["asset_status"] = assetStatus; st["asset_format"] = assetFormat; st["asset_size"] = new[] { assetW, assetH };
            st["drag_wiring"] = new Dictionary<string, object> { { "handlers", dragWired }, { "threshold_dip", 4 }, { "persist_debounce_ms", 500 } };
            Native.RECT wr, cr; Native.GetWindowRect(hwnd, out wr); Native.GetClientRect(hwnd, out cr);
            long style = Native.GetLong(hwnd, Native.GWL_STYLE), ex = Native.GetLong(hwnd, Native.GWL_EXSTYLE);
            st["style"] = "0x" + style.ToString("X8"); st["exstyle"] = "0x" + ex.ToString("X8");
            st["flags"] = new Dictionary<string, object> { { "caption", (style & Native.WS_CAPTION) == Native.WS_CAPTION }, { "thickframe", (style & Native.WS_THICKFRAME) != 0 }, { "sysmenu", (style & Native.WS_SYSMENU) != 0 },
                { "topmost", (ex & Native.WS_EX_TOPMOST) != 0 }, { "layered", (ex & Native.WS_EX_LAYERED) != 0 }, { "toolwindow", (ex & Native.WS_EX_TOOLWINDOW) != 0 }, { "noactivate", (ex & Native.WS_EX_NOACTIVATE) != 0 }, { "wpf_topmost", win.Topmost } };
            st["rect"] = new Dictionary<string, object> { { "window", new[] { wr.Left, wr.Top, wr.Right - wr.Left, wr.Bottom - wr.Top } }, { "client", new[] { 0, 0, cr.Right, cr.Bottom } } };
            var dpi = VisualTreeHelper.GetDpi(win); int awareness = -1; uint wdpi = 0;
            try { wdpi = Native.GetDpiForWindow(hwnd); awareness = Native.GetAwarenessFromDpiAwarenessContext(Native.GetWindowDpiAwarenessContext(hwnd)); } catch { }
            st["dpi"] = new Dictionary<string, object> { { "scale", dpi.DpiScaleX }, { "window_dpi", wdpi }, { "awareness", awareness }, { "size_dip", sizeDip }, { "physical_w", wr.Right - wr.Left }, { "expected_w", (int)Math.Round(sizeDip * dpi.DpiScaleX) } };
            st["position_loaded"] = new[] { win.Left, win.Top }; st["muted"] = muted;
            Transparency(wr);
            var seq = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) }; int phase = 0; DateTime ph = DateTime.UtcNow;
            seq.Tick += (s, e) =>
            {
                if (phase == 0) { if (o.PosX.HasValue) { win.Left = o.PosX.Value; win.Top = o.PosY.Value; } phase = 1; ph = DateTime.UtcNow; return; }
                if (phase == 1) { if ((DateTime.UtcNow - ph).TotalMilliseconds < 900) return; if (o.PosX.HasValue) st["prefs_after_move"] = ReadJson(PrefsFile); phase = 2; ph = DateTime.UtcNow; if (o.InjectAudio != null) OnClick(); return; }
                bool holdDone = (DateTime.UtcNow - ph).TotalMilliseconds >= o.HoldMs;
                bool cycleOk = o.InjectAudio == null || (o.ExitAfterCycle && cycleDone && (DateTime.UtcNow - ph).TotalMilliseconds > 1500);
                if ((o.InjectAudio == null && holdDone) || (o.InjectAudio != null && (cycleOk || (DateTime.UtcNow - ph).TotalMilliseconds > Math.Max(o.HoldMs, 90000)))) { seq.Stop(); FinishSelfTest(); }
            };
            seq.Start();
        }
        void Transparency(Native.RECT wr)
        {
            var t = new Dictionary<string, object>(); st["transparency"] = t;
            try
            {
                int pw = wr.Right - wr.Left, phh = wr.Bottom - wr.Top; var dpi = VisualTreeHelper.GetDpi(win);
                var rtb = new RenderTargetBitmap(pw, phh, 96 * dpi.DpiScaleX, 96 * dpi.DpiScaleY, PixelFormats.Pbgra32); rtb.Render(root);
                var px = new byte[pw * phh * 4]; rtb.CopyPixels(px, pw * 4, 0);
                int cornerMax = 0; for (int y = 0; y < 24; y++) for (int x = 0; x < 24; x++) cornerMax = Math.Max(cornerMax, px[(y * pw + x) * 4 + 3]);
                int cmax = 0; for (int y = phh / 2 - 6; y < phh / 2 + 6; y++) for (int x = pw / 2 - 6; x < pw / 2 + 6; x++) cmax = Math.Max(cmax, px[(y * pw + x) * 4 + 3]);
                t["rendered_corner_alpha_max"] = cornerMax; t["rendered_centre_alpha_max"] = cmax;
                var corner = new System.Drawing.Rectangle(wr.Left + 2, wr.Top + 2, 24, 24); var centre = new System.Drawing.Rectangle(wr.Left + pw / 2 - 12, wr.Top + phh / 2 - 12, 24, 24);
                var c1 = Grab(corner); var m1 = Grab(centre);
                var pc = new Native.POINT { X = wr.Left + 6, Y = wr.Top + 6 }; var pm = new Native.POINT { X = wr.Left + pw / 2, Y = wr.Top + phh / 2 };
                IntPtr wc = Native.GetAncestor(Native.WindowFromPoint(pc), 2), wm = Native.GetAncestor(Native.WindowFromPoint(pm), 2);
                t["hit_corner_is_avatar"] = wc == hwnd; t["hit_centre_is_avatar"] = wm == hwnd;
                win.Hide(); DoEvents(350); var c0 = Grab(corner); var m0 = Grab(centre); win.Show(); DoEvents(350);
                t["screen_corner_mean_abs_diff"] = Diff(c0, c1); t["screen_centre_mean_abs_diff"] = Diff(m0, m1);
            }
            catch (Exception e) { t["error"] = e.Message; }
        }
        static void DoEvents(int ms) { var end = DateTime.UtcNow.AddMilliseconds(ms); while (DateTime.UtcNow < end) { var f = new DispatcherFrame(); Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() => f.Continue = false)); Dispatcher.PushFrame(f); Thread.Sleep(15); } }
        static byte[] Grab(System.Drawing.Rectangle r)
        {
            using (var b = new System.Drawing.Bitmap(r.Width, r.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            {
                using (var g = System.Drawing.Graphics.FromImage(b)) g.CopyFromScreen(r.Left, r.Top, 0, 0, r.Size);
                var d = b.LockBits(new System.Drawing.Rectangle(0, 0, r.Width, r.Height), System.Drawing.Imaging.ImageLockMode.ReadOnly, b.PixelFormat);
                var a = new byte[d.Stride * r.Height]; Marshal.Copy(d.Scan0, a, 0, a.Length); b.UnlockBits(d); return a;
            }
        }
        static double Diff(byte[] a, byte[] b) { double s = 0; int n = 0; for (int i = 0; i < a.Length; i += 4) { s += Math.Abs(a[i] - b[i]) + Math.Abs(a[i + 1] - b[i + 1]) + Math.Abs(a[i + 2] - b[i + 2]); n += 3; } return Math.Round(s / Math.Max(1, n), 2); }
        void FinishSelfTest()
        {
            lock (stateLog) st["states"] = stateLog.ToArray();
            lock (speakOpacity) st["speak_opacity"] = speakOpacity.ToArray();
            lock (events) st["events"] = events.ToArray();
            st["barge_stop_ms"] = bargeStopMs; st["last_answer"] = lastAnswer; st["core_offline"] = coreOffline; st["total_ms"] = Ms();
            try { File.WriteAllText(o.SelfTest, Json.Serialize(st)); } catch (Exception e) { Log("SELFTEST_WRITE_FAILED " + e.Message); Environment.Exit(5); }
            win.Close();
        }
    }
}
