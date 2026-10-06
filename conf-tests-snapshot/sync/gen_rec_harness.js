// RECONCILIATION test_rec (2026-10-05) — extrai do AlfaOmegaRobo.cs do STAGING, numa UNICA classe parcial AlfaOmegaRobo, o caminho REAL de
// ABERTURA (test_entrada) + FILL de entrada/protecao + SAIDA + reconciliacao/desvio + restart (CarregarExecucoes/ReconciliarPernas/
// GarantiaBoot) + OnExecucao (fill real → ledger/PnL por conta). Stubs (RecStubs.cs) so do que fala com NT8/broker.
// Uso: node gen_rec_harness.js <AlfaOmegaRobo.cs> <saida.cs>
const fs = require('fs');
const path = require('path');
const SRC = process.argv[2] || path.join(__dirname, 'staging', 'AddOns', 'AlfaOmegaRobo.cs');
const OUT = process.argv[3] || path.join(__dirname, 'out', 'RecHarness.g.cs');
const src = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

const BS = String.fromCharCode(92);   // barra invertida
const barras = s => s.split(BS).join('/');
function fim(txt, i, abre, fecha) {
  let d = 0, str = false, ch = false, vs = false;
  for (; i < txt.length; i++) {
    const c = txt[i];
    if (vs) { if (c === '"' && txt[i + 1] === '"') i++; else if (c === '"') vs = false; continue; }
    if (str) { if (c === BS) i++; else if (c === '"') str = false; continue; }
    if (ch) { if (c === BS) i++; else if (c === "'") ch = false; continue; }
    if (c === '/' && txt[i + 1] === '/') { i = txt.indexOf('\n', i); continue; }
    if (c === '@' && txt[i + 1] === '"') { vs = true; i++; continue; }
    if (c === '"') { str = true; continue; }
    if (c === "'") { ch = true; continue; }
    if (c === abre) d++;
    else if (c === fecha && --d === 0) return i;
  }
  throw new Error('sem fim');
}
function bloco(txt, sig) { const a = txt.indexOf(sig); if (a < 0) return null; return txt.slice(a, fim(txt, txt.indexOf('{', a), '{', '}') + 1); }
// declaracao de membro de classe (campo/const/metodo de uma linha/propriedade) que DECLARA <nome>, ate o ';' ou '}' de nivel 0
function campo(nome) {
  const re = new RegExp('^[ \t]*(?:private|public|internal) (?:static |const |readonly |volatile )+[^\n(=;]*?[ ]' + nome + '(?![A-Za-z0-9_])', 'm');
  const m = src.match(re); if (!m) return null;
  let i = m.index, d = 0, viuChave = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '(') { d++; if (c === '{') viuChave = true; }
    else if (c === '}' || c === ')') { d--; if (c === '}' && d === 0 && viuChave && !/=\s*new\b[^;]*$/.test(src.slice(m.index, i))) { i++; break; } }
    else if (c === ';' && d === 0) { i++; break; }
  }
  return src.slice(m.index, i);
}
const CAMPOS = ['_execucoes', '_protGate', '_fillsOrfaos', '_protEmCurso', 'SnapExecucoes', 'ContarExecucoes', 'ClonarExecucao', '_execReport', '_alertas',
  '_bootGarantiaPendente', '_conexaoEstado', 'AlertaIlegivel', '_reenvioLiberado', '_ultimoLogPerna', '_equity', '_fontes', '_motor', 'GatesConfirmacao',
  '_hooks', '_fechamento', '_ticksMotor', 'ExecucoesFile'];
const campos = CAMPOS.map(n => ({ n, b: campo(n) }));
const semCampo = campos.filter(c => !c.b).map(c => c.n);
if (semCampo.length) throw new Error('campo real ausente: ' + semCampo.join(', '));

const NOMES = [
  // abertura + conta (test_entrada)
  'ExecutarEntrada', 'ExecutarEntradaCore', 'ExecutarAlvo', 'ExecutarOrdem', 'AddMotivo', 'JaRegistrada', 'LerEquity', 'ContaViva', 'IdsContasAtivos', 'TemHookExecucao', 'GarantirHookExecucao',
  'ContaObservavel', 'GateOperacional', 'GateTurno', 'TurnoJson', 'GateJanela', 'LerOuNulo', 'GateLicenca', 'GateFontes', 'Gates', 'ContasEmUso',
  // fill de entrada / protecao / saida / desvio / watchdog (test_real_flow)
  'ExecutarSaida', 'AuditarRejeicao', 'PrepararExecucoesRetiradas', 'ExecucoesGerenciadas', 'RevalidarClose', 'AtivaNt8', 'Resp', 'LerOrdens', 'EsperarFilled',
  'Reconciliar', 'ReavaliarDesvio', 'FecharPernaEmDesvio', 'GarantirProtecao', 'RelerXOrder', 'QtyOutrasPreenchidas', 'GarantirPerna', 'DecidirGarantia',
  'AjustarProtecao', 'ConfirmarCancel', 'ReprotegerPerna', 'EsgotouFecha', 'FecharPernaSemProtecao', 'AuditarIlegivel', 'AuditarDivergenciaProtecao',
  'EsperarEstadoStop', 'RegistrarExecucao', 'GravarExecucoes', 'OnFillEntrada', 'GuardarFillOrfao', 'AplicarFillOrfao', 'AplicarFillsOrfaosPendentes',
  'RemoverExecucao', 'DblOuNulo', 'IntOu', 'ProtegerFill', 'ChangeOrdem', 'SafeParse', 'ExtrairOrderId', 'PrecoOuNulo', 'ExecEmitir', 'ExecOrigem', 'ExecGarantia',
  'ReportarExecucaoTrades', 'Alertar', 'LimparAlertaIlegivel', 'GarantiaBoot',
  // NOVO neste harness: reconciliacao da retomada, restart e o handler de execucao (fill real → ledger/PnL)
  'ReconciliarPernas', 'CarregarExecucoes', 'OnExecucao', 'PernaSaida'];
const metodos = NOMES.map(n => {
  const m = src.match(new RegExp('(public|private) static [A-Za-z0-9_<>?., [\\]]+? ' + n + '[(]'));
  return { n, b: m ? bloco(src, m[0]) : null };
});
const ausentes = metodos.filter(m => !m.b).map(m => m.n);
if (ausentes.length) throw new Error('metodo real ausente: ' + ausentes.join(', '));

const q = s => JSON.stringify(s);
const g = `// GERADO por gen_rec_harness.js a partir de ${barras(SRC)} — NAO editar.
using System; using System.Collections.Generic; using System.Globalization; using System.IO; using System.Linq; using System.Threading;
using Newtonsoft.Json; using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
using SS = NinjaTrader.NinjaScript.Indicators.AlfaOmegaSharedState;
namespace NinjaTrader.NinjaScript.AddOns
{
  public static partial class AlfaOmegaRobo
  {
    public static readonly string Fonte = ${q(barras(SRC))};
    public static readonly string[] MetodosReais = new string[] { ${NOMES.map(q).join(', ')} };
${campos.map(c => '    ' + c.b.trim()).join('\n')}

${metodos.map(m => '    ' + m.b.trim()).join('\n\n')}
  }
}
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, g);
console.log('gerado ' + OUT + ' · metodos reais: ' + NOMES.length + '/' + NOMES.length + ' · campos reais: ' + campos.length);
