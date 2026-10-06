// RECONCILIATION test_rec (2026-10-05) — gera out/RecStubs.g.cs a partir de EntradaStubs.cs (conta NT8/config/audit simulados) +
// a Corretora COM ESTADO de RealFlowStubs.cs (livro de ordens + posicao por conta). Diferencas para o test_entrada:
//   · NinjaTrader.Cbi ganha Execution / MarketPosition / ExecutionEventArgs completos e Account.RaiseOrder / RaiseExecution
//   · AlfaOmegaTrader delega a Corretora (ordens e posicoes POR CONTA) · AoRoboPositions le a Corretora (Source "in-process")
//   · AoRoboLedger NAO e stub: o AlfaOmegaRoboLedger.cs REAL do staging e compilado
//   · ReconciliarPernas / AplicarFillOrfao / GravarExecucoes / OnExecucao / OnFillEntrada NAO sao stubs: saem do AlfaOmegaRobo.cs real
const fs = require('fs');
const path = require('path');
const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
let e = ler('EntradaStubs.cs');
const rf = ler('RealFlowStubs.cs');
function troca(de, para) { if (e.indexOf(de) < 0) throw new Error('trecho ausente em EntradaStubs.cs: ' + de.slice(0, 60)); e = e.replace(de, () => para); }
function corta(ini, fim, para) {
  const a = e.indexOf(ini), b = e.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error('corte ausente: ' + ini.slice(0, 50));
  e = e.slice(0, a) + para + e.slice(b);
}

troca('public class ExecutionEventArgs : EventArgs { }',
  'public enum MarketPosition { Flat, Long, Short }\n' +
  '\tpublic class Execution { public Order Order; public string Name, ExecutionId; public double Commission; public Account Account; public Instrument Instrument; }\n' +
  '\tpublic class ExecutionEventArgs : EventArgs { public Execution Execution; public MarketPosition MarketPosition; public int Quantity; public double Price; }');
troca('public string Name; public OrderAction OrderAction; }', 'public string Name, OrderId; public OrderAction OrderAction; }');
troca('public double Get(AccountItem item, Currency c)',
  'public void RaiseOrder(OrderEventArgs a) { var h = _ord; if (h != null) h(this, a); }\n' +
  '\t\tpublic void RaiseExecution(ExecutionEventArgs a) { var h = _exec; if (h != null) h(this, a); }\n' +
  '\t\tpublic double Get(AccountItem item, Currency c)');

// Corretora com estado (classes Ordem + Corretora + AlfaOmegaTrader) de RealFlowStubs.cs
const ci = rf.indexOf('\tpublic class Ordem');
// (2026-10-06) o RealFlowStubs.cs ganhou no FIM um namespace NinjaTrader.Cbi (Provider/Account, rodada ORDER_NAME) que o
// EntradaStubs.cs ja define: a Corretora termina no '}' do namespace AddOns, ANTES desse bloco.
const ordemNs = rf.indexOf('\n// (2026-10-06) ORDER_NAME');
const cf = (ordemNs > 0 ? rf.slice(0, ordemNs) : rf).lastIndexOf('}');
if (ci < 0) throw new Error('Corretora ausente em RealFlowStubs.cs');
const corretora = rf.slice(ci, cf);

const posicoes =
  '/// <summary>Posicoes POR CONTA lidas do livro da Corretora (chave "conta|instrumento"). Source "in-process" = leitura confiavel (ReconciliarPernas).</summary>\n' +
  '\tpublic static class AoRoboPositions\n\t{\n' +
  '\t\tpublic static readonly List<string> Lidas = new List<string>();\n' +
  '\t\tpublic static readonly HashSet<string> Ilegiveis = new HashSet<string>(StringComparer.OrdinalIgnoreCase);\n' +
  '\t\tpublic static string Source = "in-process"; public static double AgeMs = 0; public static int Refreshes;\n' +
  '\t\tpublic static int RefreshAll(IEnumerable<string> accountNames, DateTime nowUtc, bool force = false) { Refreshes++; return 0; }\n' +
  '\t\tpublic static AoPositionState Get(string accountName, DateTime nowUtc)\n\t\t{\n' +
  '\t\t\tLidas.Add(accountName);\n' +
  '\t\t\tbool presente; lock (Account.All) presente = Account.All.Any(a => a != null && string.Equals(a.Name, accountName, StringComparison.OrdinalIgnoreCase));\n' +
  '\t\t\tif (!presente) return new AoPositionState { Ok = false, Source = "no-account", Positions = null, AgeMs = -1, Error = "conta nao encontrada em Account.All: " + accountName };\n' +
  '\t\t\tif (Ilegiveis.Contains(accountName ?? "")) return new AoPositionState { Ok = false, Source = "erro", Positions = null, AgeMs = -1, Error = "simulado: ilegivel" };\n' +
  '\t\t\tvar lista = new List<AoPosition>();\n' +
  '\t\t\tlock (Corretora.G)\n' +
  '\t\t\t\tforeach (var kv in Corretora.Posicoes)\n\t\t\t\t{\n' +
  '\t\t\t\t\tstring[] p = kv.Key.Split(\'|\');\n' +
  '\t\t\t\t\tif (!string.Equals(p[0], accountName, StringComparison.OrdinalIgnoreCase) || kv.Value == 0) continue;\n' +
  '\t\t\t\t\tlista.Add(new AoPosition { Instrument = p[1], Side = kv.Value > 0 ? "LONG" : "SHORT", Quantity = Math.Abs(kv.Value) });\n' +
  '\t\t\t\t}\n' +
  '\t\t\treturn new AoPositionState { Ok = true, Source = Source, Positions = lista, AgeMs = AgeMs, MaxAgeMs = 15000 };\n' +
  '\t\t}\n\t}\n\n' + corretora + '\n\t';
corta('/// <summary>Posicoes POR CONTA', 'public class AoRoboEntryMqResult', posicoes);

// membros do robo: so o que fala com NT8/telemetria continua stub; o resto vem do AlfaOmegaRobo.cs real
corta('public static int FillsEntrada;', '// ── acesso de teste ──',
  'private static JObject ResumoStack() { return null; }\n' +
  '\t\tprivate static JObject ResumoRefAot(string localSide) { return null; }\n' +
  '\t\tprivate static void LerConexoes(List<string> accs, out Dictionary<string, bool?> conta, out Dictionary<string, bool?> preco) { conta = new Dictionary<string, bool?>(); preco = new Dictionary<string, bool?>(); }\n\t\t');
troca('public static AoResultadoEntrada Entrar(AoMotorCanonico m, DateTime agora, AoEventoAot ev) {',
  'public static AoResultadoEntrada Retomar(AoMotorCanonico m, DateTime agora, AoEventoAot ev, bool fresco) { return ExecutarEntrada(m, agora, AoRoboConfig.Accounts.Where(a => a.Enabled).ToList(), ev, fresco, true); }\n' +
  '\t\tpublic static void Fechar(string motivo, DateTime agora, bool retry) { ExecutarSaida(motivo, agora, AoRoboConfig.Accounts.Where(a => a.Enabled).ToList(), retry); }\n' +
  '\t\tpublic static void ReconciliarTick(AoMotorCanonico m, DateTime agora) { Reconciliar(m, agora); }\n' +
  '\t\tpublic static void ProtecaoTick(DateTime agora) { AplicarFillsOrfaosPendentes(agora); GarantirProtecao(agora); }\n' +
  '\t\tpublic static void Boot(DateTime agora) { _bootGarantiaPendente = true; GarantiaBoot(agora); }\n' +
  '\t\t/// <summary>Restart (F5): TODO o estado estatico do robo some; volta so o que esta em disco (motor-execucoes.json).</summary>\n' +
  '\t\tpublic static void Restart(string fechamentoFile) { lock (_protGate) { _execucoes.Clear(); _fillsOrfaos.Clear(); _protEmCurso.Clear(); } lock (_hooks) _hooks.Clear(); lock (_reenvioLiberado) { _reenvioLiberado.Clear(); _ultimoLogPerna.Clear(); } _fechamento = new AoRoboFechamento(fechamentoFile); CarregarExecucoes(); }\n' +
  '\t\tpublic static void PrepararFechamento(string f) { _fechamento = new AoRoboFechamento(f); }\n' +
  '\t\tpublic static JObject RegDe(string conta, string instr) { lock (_protGate) { JObject e = _execucoes.FirstOrDefault(x => (string)x["nt8_account"] == conta && (string)x["instrumento"] == instr); return e == null ? null : (JObject)e.DeepClone(); } }\n' +
  '\t\tpublic static string ArquivoExecucoes { get { return ExecucoesFile; } }\n' +
  '\t\tpublic static int Orfaos { get { lock (_protGate) return _fillsOrfaos.Count; } }\n' +
  '\t\tpublic static AoResultadoEntrada Entrar(AoMotorCanonico m, DateTime agora, AoEventoAot ev) {');
troca('lock (_protGate) _execucoes.Clear(); lock (_hooks) _hooks.Clear(); }', 'lock (_protGate) { _execucoes.Clear(); _fillsOrfaos.Clear(); _protEmCurso.Clear(); } lock (_hooks) _hooks.Clear(); }');

const out = path.join(__dirname, 'out', 'RecStubs.g.cs');
fs.writeFileSync(out, '// GERADO por gen_rec_stubs.js (EntradaStubs.cs + Corretora de RealFlowStubs.cs) — NAO editar.\n' + e);
console.log('gerado ' + out);
