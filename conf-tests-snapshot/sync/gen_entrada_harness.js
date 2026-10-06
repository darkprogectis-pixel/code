// ACCOUNT BINDING test_entrada (2026-10-05) — extrai do AlfaOmegaRobo.cs do STAGING o caminho REAL de ABERTURA
// (ExecutarEntrada → ExecutarEntradaCore → ExecutarAlvo → ExecutarOrdem) + hooks/gates de conta e gera out\EntradaHarness.g.cs
// (classe parcial AlfaOmegaRobo). Stubs (EntradaStubs.cs) so do que fala com NT8/broker/disco do robo.
// Uso: node gen_entrada_harness.js <AlfaOmegaRobo.cs> <saida.cs>
const fs = require('fs');
const path = require('path');
const SRC = process.argv[2] || path.join(__dirname, 'staging', 'AddOns', 'AlfaOmegaRobo.cs');
const OUT = process.argv[3] || path.join(__dirname, 'out', 'EntradaHarness.g.cs');
const src = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

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
function decl(re) {   // declaracao de campo (possivelmente multi-linha) ate o ';' de nivel 0
  const m = src.match(re); if (!m) return null;
  let i = m.index, d = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{' || c === '(') d++; else if (c === '}' || c === ')') d--; else if (c === ';' && d === 0) break; }
  return src.slice(m.index, i + 1);
}
const linha = re => { const m = src.match(re); return m ? m[0] : null; };

const camposDef = {
  _execucoes: linha(/private static readonly List<JObject> _execucoes = [^\n]*/),
  _protGate: linha(/private static readonly object _protGate = [^\n]*/),
  SnapExecucoes: linha(/private static List<JObject> SnapExecucoes\(\)[^\n]*/),
  _fillsOrfaos: linha(/private static readonly Dictionary<string, JObject> _fillsOrfaos = [^\n]*/),
  _reenvioLiberado: linha(/private static readonly HashSet<string> _reenvioLiberado = [^\n]*/),
  _equity: linha(/private static AoRoboEquity _equity;[^\n]*/),
  _fontes: linha(/private static AoReadiness _fontes;[^\n]*/),
  _motor: linha(/private static AoMotorCanonico _motor;[^\n]*/),
  GatesConfirmacao: linha(/private static readonly HashSet<string> GatesConfirmacao = [^\n]*/),
  _hooks: decl(/private static readonly Dictionary<Account, EventHandler<ExecutionEventArgs>> _hooks\s*=/),
};
const faltou = Object.keys(camposDef).filter(k => !camposDef[k]);
if (faltou.length) throw new Error('campo real ausente: ' + faltou.join(', '));

// Caminho de ABERTURA + conta, tudo REAL. (Fora: ReconciliarPernas, AplicarFillOrfao, GravarExecucoes, OnExecucao, ResumoStack,
// ResumoRefAot — stubs declarados em EntradaStubs.cs; nenhum deles decide conta nem envia ordem de entrada.)
const NOMES = ['ExecutarEntrada', 'ExecutarEntradaCore', 'ExecutarAlvo', 'ExecutarOrdem', 'AddMotivo', 'JaRegistrada', 'LerEquity',
  'ContaViva', 'IdsContasAtivos', 'TemHookExecucao', 'GarantirHookExecucao', 'ContaObservavel', 'GateOperacional', 'GateTurno', 'TurnoJson', 'GateJanela', 'LerOuNulo',
  'GateLicenca', 'GateFontes', 'Gates', 'ContasEmUso', 'RegistrarExecucao', 'RemoverExecucao', 'LerOrdens', 'Resp', 'SafeParse', 'ExtrairOrderId'];
const metodos = NOMES.map(n => {
  const m = src.match(new RegExp('(public|private) static [\\w<>\\[\\]?., ]+? ' + n + '\\('));
  return { n, b: m ? bloco(src, m[0]) : null };
});
const ausentes = metodos.filter(m => !m.b).map(m => m.n);
if (ausentes.length) throw new Error('metodo real ausente: ' + ausentes.join(', '));

const q = s => JSON.stringify(s);
const g = `// GERADO por gen_entrada_harness.js a partir de ${SRC.replace(/\\/g, '/')} — NAO editar.
using System; using System.Collections.Generic; using System.Globalization; using System.IO; using System.Linq; using System.Threading;
using Newtonsoft.Json; using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
using SS = NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState;
namespace NinjaTrader.NinjaScript.AddOns
{
  public static partial class AlfaOmegaRobo
  {
    public static readonly string Fonte = ${q(SRC.replace(/\\/g, '/'))};
    public static readonly string[] MetodosReais = new string[] { ${NOMES.map(q).join(', ')} };
${Object.values(camposDef).map(c => '    ' + c.trim()).join('\n')}

${metodos.map(m => '    ' + m.b.trim()).join('\n\n')}
  }
}
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, g);
console.log('gerado ' + OUT + ' · metodos reais: ' + NOMES.length + '/' + NOMES.length);
