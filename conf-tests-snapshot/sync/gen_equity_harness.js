// EQUITY_GUARD test_equity (2026-10-02) — extrai o codigo REAL do caminho de equity do PropfirmGuard e gera out\EquityHarness.<tag>.g.cs:
//  · AlfaOmegaRobo.cs (STAGING ou controle fe048080): LerEquity (se existir) + o trecho que preenche o ctx de conta, entre o
//    `PositionState = AoRoboPositions.Get(c.Nt8Account, agora),\n};` e o `var porConta` (ExecutarEntradaCore), embrulhado em PreencherEquity;
//  · AlfaOmegaRoboFechamento.cs (staging): classe AoRoboEquity;
//  · AlfaOmegaRoboGates.cs (LIVE, so leitura): AoGateResult, AoPosition, AoRoboCtx e PropfirmGuard/Family/NormSide/N.
// Stub so do NT8 (NinjaTrader.Cbi.Account/AccountItem/Currency) em ProgramEquity.cs.
// Uso: node gen_equity_harness.js <AlfaOmegaRobo.cs> <AlfaOmegaRoboFechamento.cs> <AlfaOmegaRoboGates.cs> <saida.cs>
const fs = require('fs');
const path = require('path');
const [ROBO, FECH, GATES, OUT] = process.argv.slice(2);
if (!OUT) { console.error('uso: node gen_equity_harness.js <Robo.cs> <Fechamento.cs> <Gates.cs> <saida.cs>'); process.exit(2); }
const ler = f => fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const robo = ler(ROBO), fech = ler(FECH), gates = ler(GATES);
const entry = ler(path.join(path.dirname(GATES), 'AlfaOmegaRoboEntry.cs'));   // JsNum/JsStr reais (N() e Rule 6 do PropfirmGuard)

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
function precisa(x, o) { if (!x) throw new Error('membro real ausente: ' + o); return x; }

// Robo: trecho do ctx de conta (o MESMO texto que roda no ExecutarEntradaCore)
const ancora = robo.search(/PositionState = AoRoboPositions\.Get\(c\.Nt8Account, agora\),\s*\n\s*\};/);
if (ancora < 0) throw new Error('ancora do ctxConta ausente');
const iniTrecho = robo.indexOf('};', ancora) + 2;
const fimTrecho = robo.indexOf('var porConta', iniTrecho);
if (fimTrecho < 0) throw new Error('var porConta ausente');
const trecho = robo.slice(iniTrecho, fimTrecho).trim();
const trechoDeclaraFonte = /string eqFonte;/.test(trecho);
const lerEquity = bloco(robo, 'private static double? LerEquity(');
const campoEquity = (robo.match(/private static AoRoboEquity _equity;[^\n]*/) || [null])[0];
// PropfirmGuard: chamada real (parametros) do ExecutarEntradaCore
const chamada = (robo.match(/AoRoboGates\.PropfirmGuard\(snap, ctxConta, [^;]*?\)\)\);/) || [null])[0];
if (!chamada) throw new Error('chamada do PropfirmGuard ausente');
const args = chamada.replace(/^AoRoboGates\.PropfirmGuard\(snap, ctxConta, /, '').replace(/\)\)\);$/, '');

const equityCls = precisa(bloco(fech, 'public class AoRoboEquity'), 'AoRoboEquity');
const cls = n => precisa(bloco(gates, 'public class ' + n), n);
const gm = sig => precisa(bloco(gates, sig), sig);

const q = s => JSON.stringify(s);
const g = `// GERADO por gen_equity_harness.js — NAO editar. Robo=${ROBO.replace(/\\/g, '/')} Fech=${FECH.replace(/\\/g, '/')} Gates=${GATES.replace(/\\/g, '/')}
using System; using System.Collections.Generic; using System.Globalization; using System.IO; using System.Linq;
using Newtonsoft.Json; using Newtonsoft.Json.Linq;
using NinjaTrader.Cbi;
namespace NinjaTrader.NinjaScript.AddOns
{
  ${cls('AoGateResult').trim()}
  ${cls('AoPosition').trim()}
  ${cls('AoPositionState').trim()}
  ${cls('AoRoboCtx').trim()}
  ${equityCls.trim()}
  public static partial class AoRoboGates
  {
    ${gm('public static AoGateResult PropfirmGuard(').trim()}
    ${gm('public static string Family(').trim()}
    ${gm('private static string NormSide(').trim()}
    ${gm('private static string N(').trim()}
  }
  public static class AoRoboEntry
  {
    ${precisa(bloco(entry, 'public static string JsNum('), 'JsNum').trim()}
    ${precisa(bloco(entry, 'public static string JsStr('), 'JsStr').trim()}
  }
  public static partial class AlfaOmegaRoboEquitySim
  {
    public static readonly string Fonte = ${q(ROBO.replace(/\\/g, '/'))};
    public static readonly bool TemLerEquity = ${lerEquity ? 'true' : 'false'};
    public static readonly string Trecho = ${q(trecho)};
    ${campoEquity ? campoEquity.trim() : 'private static AoRoboEquity _equity;   // ausente na fonte (controle)'}
    public static void SetEquity(AoRoboEquity e) { _equity = e; }
    ${lerEquity ? lerEquity.trim() : ''}
    /// <summary>Trecho REAL do ExecutarEntradaCore entre o ctxConta e o porConta. Retorna equity_fonte (controle: "n/a").</summary>
    public static string PreencherEquity(AoRoboCtx ctxConta, AoRoboAccount c, DateTime agora)
    {
      ${trechoDeclaraFonte ? '' : 'string eqFonte = "n/a";'}
      ${trecho}
      return eqFonte;
    }
    public static AoGateResult Guard(JObject snap, AoRoboCtx ctxConta) { return AoRoboGates.PropfirmGuard(snap, ctxConta, ${args}); }
  }
}
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, g);
console.log('gerado ' + OUT + ' · LerEquity=' + !!lerEquity + ' · trecho=' + trecho.split('\n').length + ' linhas · guard(' + args + ')');
