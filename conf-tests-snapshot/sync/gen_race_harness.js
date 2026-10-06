// RACE_EXECUCOES (2026-10-01) — extrai do STAGING AlfaOmegaRobo.cs os membros REAIS que tocam _execucoes/_fillsOrfaos na
// corrida thread do NT8 × thread do robo e gera out\RaceHarness.g.cs (classe AlfaOmegaRoboSim) com stubs so para o que fala com
// NT8/broker (ProtegerFill, AoRoboAudit, AoRoboConfig, AoRoboSaida). Uso: node gen_race_harness.js [fonte.cs] [saida.cs]
const fs = require('fs');
const path = require('path');
const SRC = process.argv[2] || path.join(__dirname, 'staging', 'AddOns', 'AlfaOmegaRobo.cs');
const OUT = process.argv[3] || path.join(__dirname, 'out', 'RaceHarness.g.cs');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

function bloco(sig) {
  const a = src.indexOf(sig);
  if (a < 0) return null;
  let i = src.indexOf('{', a), d = 0, str = false, ch = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (str) { if (c === '\\') i++; else if (c === '"') str = false; continue; }
    if (ch) { if (c === '\\') i++; else if (c === "'") ch = false; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '"') { str = true; continue; }
    if (c === "'") { ch = true; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return src.slice(a, i + 1);
  }
  throw new Error('bloco sem fim: ' + sig);
}
function linha(re) { const m = src.match(re); return m ? m[0] : null; }

const campos = [
  linha(/private static readonly List<JObject> _execucoes = [^\n]*/),
  linha(/private static readonly object _protGate = [^\n]*/),
  linha(/private static readonly Dictionary<string, JObject> _fillsOrfaos = [^\n]*/),
  linha(/private static readonly HashSet<string> _protEmCurso = [^\n]*/),
  linha(/private static List<JObject> SnapExecucoes\(\)[^\n]*/),
  linha(/private static int ContarExecucoes\(\)[^\n]*/),
  linha(/private static JObject ClonarExecucao\(JObject e\)[^\n]*/),
].filter(Boolean);
const metodos = ['private static void RegistrarExecucao(', 'private static void GravarExecucoes(', 'private static void RemoverExecucao(',
  'public static void OnFillEntrada(', 'private static bool GuardarFillOrfao(', 'private static void AplicarFillOrfao(',
  'private static void AplicarFillsOrfaosPendentes(', 'private static List<JObject> ExecucoesGerenciadas(']
  .map(s => ({ s, b: bloco(s) }));
const presentes = metodos.filter(m => m.b).map(m => m.s.replace(/^.*static \S+ /, '').replace('(', ''));
const ausentes = metodos.filter(m => !m.b).map(m => m.s.replace(/^.*static \S+ /, '').replace('(', ''));

const g = `// GERADO por gen_race_harness.js a partir de ${SRC.replace(/\\/g, '/')} — NAO editar.
using System; using System.Collections.Generic; using System.IO; using System.Linq; using System.Threading;
using Newtonsoft.Json; using Newtonsoft.Json.Linq;
namespace RaceSim
{
  public static class AoMotorCanonico { public static string Iso(DateTime t) { return t.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"); } }
  public static class AoRoboConfig { public static string Tier = "sim"; }
  public static class AoRoboSaida { public static bool ForaGestao(JObject e) { return e["gestao_manual"] != null && (bool)e["gestao_manual"]; } }
  public static class AoRoboAudit
  {
    public static readonly List<string> Eventos = new List<string>();
    public static void Log(string ev, params object[] resto) { lock (Eventos) Eventos.Add(ev + "|" + (resto.Length > 1 ? resto[1] as string : null)); }
  }
  public static partial class AlfaOmegaRoboSim
  {
    public static string ExecucoesFile = Path.Combine(Path.GetTempPath(), "race_sim_execucoes_" + System.Diagnostics.Process.GetCurrentProcess().Id + ".json");
    public static readonly string[] Presentes = new string[] { ${presentes.map(p => JSON.stringify(p)).join(', ')} };
    public static readonly string[] Ausentes = new string[] { ${ausentes.map(p => JSON.stringify(p)).join(', ')} };
    public static readonly bool TemProtEmCurso = ${campos.some(c => c.includes('_protEmCurso')) ? 'true' : 'false'};
${campos.map(c => '    ' + c.trim()).join('\n')}
${campos.some(c => c.includes('_protEmCurso')) ? '' : '    private static readonly HashSet<string> _protEmCurso = new HashSet<string>(StringComparer.Ordinal);'}
${metodos.filter(m => m.b).map(m => '    ' + m.b.trim()).join('\n\n')}
  }
}
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, g);
console.log('gerado ' + OUT + ' · metodos reais: ' + presentes.join(', ') + (ausentes.length ? ' · ausentes: ' + ausentes.join(', ') : ''));
