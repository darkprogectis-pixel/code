// PROTECTION_MANDATORY test_real_flow (2026-10-02) — extrai do AlfaOmegaRobo.cs (STAGING ou LIVE-controle) os membros REAIS do fluxo
// de protecao/saida/desvio/watchdog e gera out\RealFlowHarness.g.cs (classe AlfaOmegaRoboSim, namespace NinjaTrader.NinjaScript.AddOns).
// Stubs (RealFlowStubs.cs) so do que fala com NT8/broker. AoRoboAtivos: Retirado/TickDe/ArredondarStop REAIS extraidos do Ativos.cs.
// Uso: node gen_real_flow_harness.js <AlfaOmegaRobo.cs> <AlfaOmegaRoboAtivos.cs> <saida.cs>
const fs = require('fs');
const path = require('path');
const SRC = process.argv[2] || path.join(__dirname, 'staging', 'AddOns', 'AlfaOmegaRobo.cs');
const ATV = process.argv[3] || 'C:\\Users\\ADM\\Documents\\NinjaTrader 8\\bin\\Custom\\AddOns\\AlfaOmegaRoboAtivos.cs';
const OUT = process.argv[4] || path.join(__dirname, 'out', 'RealFlowHarness.g.cs');
const ler = f => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const src = ler(SRC), atv = ler(ATV);

function fim(txt, i, abre, fecha) {
  let d = 0, str = false, ch = false, vs = false;
  for (; i < txt.length; i++) {
    const c = txt[i];
    if (vs) { if (c === '"' && txt[i + 1] === '"') i++; else if (c === '"') vs = false; continue; }
    if (str) { if (c === '\\') i++; else if (c === '"') str = false; continue; }
    if (ch) { if (c === '\\') i++; else if (c === "'") ch = false; continue; }
    if (c === '/' && txt[i + 1] === '/') { i = txt.indexOf('\n', i); continue; }
    if (c === '@' && txt[i + 1] === '"') { vs = true; i++; continue; }
    if (c === '"') { str = true; continue; }
    if (c === "'") { ch = true; continue; }
    if (c === abre) d++;
    else if (c === fecha && --d === 0) return i;
  }
  throw new Error('sem fim');
}
function bloco(txt, sig) {
  const a = txt.indexOf(sig);
  if (a < 0) return null;
  return txt.slice(a, fim(txt, txt.indexOf('{', a), '{', '}') + 1);
}
function decl(txt, re) {   // declaracao de campo (possivelmente multi-linha) ate o ';' de nivel 0
  const m = txt.match(re); if (!m) return null;
  let i = m.index, d = 0;
  for (; i < txt.length; i++) { const c = txt[i]; if (c === '{' || c === '(') d++; else if (c === '}' || c === ')') d--; else if (c === ';' && d === 0) break; }
  return txt.slice(m.index, i + 1);
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
  linha(/private static AoExecReport _execReport;[^\n]*/),   // (2026-10-02) invictus/exec v1 (ausente no live-controle)
  linha(/private static AoRoboAlertas _alertas;[^\n]*/),   // (2026-10-02) G8/G13/G14 (ausentes no live-controle)
  linha(/private static bool _bootGarantiaPendente;[^\n]*/),
  linha(/private static readonly Dictionary<string, bool> _conexaoEstado = [^\n]*/),
  linha(/private const string AlertaIlegivel = [^\n]*/),
].filter(Boolean);
const NOMES = ['ExecutarSaida', 'AuditarRejeicao', 'PrepararExecucoesRetiradas', 'ExecucoesGerenciadas', 'RevalidarClose', 'AtivaNt8', 'Resp', 'LerOrdens',
  'EsperarFilled', 'Reconciliar', 'ReavaliarDesvio', 'FecharPernaEmDesvio', 'GarantirProtecao', 'RelerXOrder', 'QtyOutrasPreenchidas', 'GarantirPerna', 'DecidirGarantia',
  'AjustarProtecao', 'ConfirmarCancel', 'ReprotegerPerna', 'EsgotouFecha', 'FecharPernaSemProtecao', 'AuditarIlegivel', 'AuditarDivergenciaProtecao',
  'EsperarEstadoStop', 'RegistrarExecucao', 'GravarExecucoes', 'OnFillEntrada', 'GuardarFillOrfao', 'AplicarFillOrfao', 'AplicarFillsOrfaosPendentes',
  'RemoverExecucao', 'DblOuNulo', 'IntOu', 'ProtegerFill', 'ChangeOrdem', 'SafeParse', 'ExtrairOrderId', 'PrecoOuNulo',
  'ExecEmitir', 'ExecOrigem', 'ExecGarantia', 'ReportarExecucaoTrades',
  'Alertar', 'LimparAlertaIlegivel', 'GarantiaBoot', 'ConexaoPasso', 'AvaliarCanal'];   // (2026-10-02) G8/G13/G14 — LerConexoes/EstadoConexao (NT8) = stub no ProgramRealFlow   // (2026-10-02) invictus/exec v1 — ausentes no live-controle
const metodos = NOMES.map(n => {
  const m = src.match(new RegExp('(public|private) static [\\w<>\\[\\]?., ]+? ' + n + '\\('));
  return { n, b: m ? bloco(src, m[0]) : null };
});
const presentes = metodos.filter(m => m.b).map(m => m.n), ausentes = metodos.filter(m => !m.b).map(m => m.n);
const temSnap = campos.some(c => c.includes('SnapExecucoes')), temClone = campos.some(c => c.includes('ClonarExecucao'));
const temEmCurso = campos.some(c => c.includes('_protEmCurso'));

// PM1 (estrutural sobre o source real): no ExecutarAlvo, P0 antes de AoPermissao.Avaliar, RegistrarExecucao(reg) e ExecutarOrdem(
const alvo = bloco(src, 'private static string ExecutarAlvo(') || '';
const ix = s => alvo.indexOf(s);
const p0 = { p0: ix('AoRoboFechamento.ProtecaoPreTrade('), perm: ix('AoPermissao.Avaliar('), reg: ix('RegistrarExecucao(reg)'), ord: ix('ExecutarOrdem(c,') };
const p0Ok = p0.p0 >= 0 && p0.perm > p0.p0 && p0.reg > p0.p0 && p0.ord > p0.p0;
// o retorno do P0 aborta (return) antes de qualquer envio
const p0Ret = p0.p0 >= 0 && /if \(semProtecao != null\)[\s\S]{0,600}?return /.test(alvo.slice(p0.p0, p0.perm > 0 ? p0.perm : undefined));

const atvMembros = [
  decl(atv, /public static readonly string\[\] CodigosRetirados\s*=/),
  bloco(atv, 'public static bool Retirado('),
  decl(atv, /(private|public|internal) static readonly Dictionary<string, double> TickCme\s*=/),
  bloco(atv, 'public static double? TickDe('),
  bloco(atv, 'public static double? ArredondarStop('),
];
if (atvMembros.some(x => !x)) throw new Error('AoRoboAtivos: membro real ausente');

const q = s => JSON.stringify(s);
const g = `// GERADO por gen_real_flow_harness.js a partir de ${SRC.replace(/\\/g, '/')} — NAO editar.
using System; using System.Collections.Generic; using System.Globalization; using System.IO; using System.Linq; using System.Threading;
using Newtonsoft.Json; using Newtonsoft.Json.Linq;
using SS = NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState;
namespace NinjaTrader.NinjaScript.AddOns
{
  public static class AoRoboAtivos
  {
${atvMembros.map(m => '    ' + m.trim()).join('\n')}
  }
  public static partial class AlfaOmegaRoboSim
  {
    public static readonly string Fonte = ${q(SRC.replace(/\\/g, '/'))};
    public static readonly string[] Presentes = new string[] { ${presentes.map(q).join(', ')} };
    public static readonly string[] Ausentes = new string[] { ${ausentes.map(q).join(', ')} };
    public static readonly bool P0Ordem = ${p0Ok ? 'true' : 'false'}, P0Aborta = ${p0Ret ? 'true' : 'false'};
    public static readonly string P0Indices = ${q(JSON.stringify(p0))};
${campos.map(c => '    ' + c.trim()).join('\n')}
${temEmCurso ? '' : '    private static readonly HashSet<string> _protEmCurso = new HashSet<string>(StringComparer.Ordinal);'}
${temSnap ? '' : '    private static List<JObject> SnapExecucoes() { lock (_protGate) return _execucoes.ToList(); }'}
${temClone ? '' : '    private static JObject ClonarExecucao(JObject e) { lock (_protGate) return (JObject)e.DeepClone(); }'}

${metodos.filter(m => m.b).map(m => '    ' + m.b.trim()).join('\n\n')}
  }
}
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, g);
console.log('gerado ' + OUT + ' · metodos reais: ' + presentes.length + '/' + NOMES.length + (ausentes.length ? ' · ausentes: ' + ausentes.join(', ') : '') + ' · P0ordem=' + p0Ok + ' P0aborta=' + p0Ret);
