// RESIDUAL (2026-10-06) — extrai VERBATIM do STAGING (ou do LIVE com -live = mutacao) os metodos de conta que dependem de
// Cbi.Account.All e gera out\ResidualExtracted.cs (stub minimo de Account). Tambem faz a varredura estatica R08.
// Uso: node gen_residual_harness.js [-live]
const fs = require('fs'), path = require('path');
const live = process.argv.includes('-live');
const ROOT = live ? 'C:/Users/ADM/Documents/NinjaTrader 8/bin/Custom' : path.join(__dirname, 'staging');
const rd = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
function extract(src, sig, label) {
  const i = src.indexOf(sig); if (i < 0 || src.indexOf(sig, i + 1) >= 0) throw new Error('assinatura ' + label + ' nao unica/ausente');
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) break; }
  return src.slice(i, k + 1);
}
const core = rd('AddOns/AlfaOmegaCopyEngineCore.cs'), motor = rd('AddOns/AlfaOmegaCopyEngineMotor.cs');
const bol = rd('AddOns/AoBasicEntryBoleta.cs'), cc = rd('Indicators/TTW_DarkProjects/AoControlCenter.cs');
const out = `// GERADO por gen_residual_harness.js (${live ? 'LIVE/mutacao' : 'STAGING'}) — corpos copiados sem alteracao.
using System; using System.Linq; using System.Collections.Generic;
namespace NinjaTrader.Cbi {
  public enum Provider { Simulator, Playback, Unknown, Rithmic, Tradovate, Cqg }
  public class Account { public string Name; public Provider Provider; public static readonly List<Account> All = new List<Account>(); }
}
namespace ResidualX {
  using NinjaTrader.Cbi;
  public class Follower { public string AccountName;
    ${extract(core, 'public Account Resolve()', 'AoCeFollower.Resolve')} }
  public static class Filters {
    ${extract(core, 'public static bool WouldLoop(', 'AoCeFilters.WouldLoop')} }
  public static class Links {
    ${extract(core, 'private static string K(string leaderOrderId, string followerAccount)', 'AoCeLinks.K').replace('private static', 'public static')}
    ${extract(core, 'public static string SourceKey(string account, string orderId, string instrument)', 'AoCeLinks.SourceKey')} }
  public static class Motor {
    ${extract(motor, 'internal static Account Find(string name)', 'Motor.Find').replace('internal static', 'public static')} }
  public static class Boleta {
    ${extract(bol, 'private static Account Conta(string nome)', 'Boleta.Conta').replace('private static', 'public static')} }
  public static class CC {
    ${extract(cc, 'private Account FindAcc(string name)', 'CC.FindAcc').replace('private Account', 'public static Account')} }
}
`;
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'ResidualExtracted.cs'), out);
// R08 varredura: nenhuma comparacao de Account.Name sem diferenciar caixa nos pontos de identidade (lista de padroes = os 34 pontos)
const proibidos = [
  [core, /Account\.All\.FirstOrDefault\(a => string\.Equals\(a\.Name, AccountName, StringComparison\.OrdinalIgnoreCase/],
  [core, /candidateFollower, (leaderOfThisTab|l), StringComparison\.OrdinalIgnoreCase/], [core, /followerAccount \?\? ""\)\.ToUpperInvariant/],
  [core, /account = account\.ToUpperInvariant/], [motor, /(_hooked|_hookAccounts) = new \w+<[^>]+>\(StringComparer\.OrdinalIgnoreCase/],
  [motor, /LeaderAccount, (account|leaderName|leaderAcc\.Name), StringComparison\.OrdinalIgnoreCase/], [motor, /a\.Name, name, StringComparison\.OrdinalIgnoreCase/],
  [motor, /AccountName, (f\.AccountName|t\.LeaderAccount), StringComparison\.OrdinalIgnoreCase/], [motor, /desired\.Contains\(name, StringComparer\.OrdinalIgnoreCase/],
  [bol, /a\.Name, nome, StringComparison\.OrdinalIgnoreCase/], [bol, /\.Real, manter, StringComparison\.OrdinalIgnoreCase/],
  [cc, /a\.Name, name, StringComparison\.OrdinalIgnoreCase/], [cc, /conta, selecionada, StringComparison\.OrdinalIgnoreCase/],
  [rd('AddOns/AlfaOmegaCopyEngineUI.cs'), /(porNome = new Dictionary<string, Account>\(StringComparer\.OrdinalIgnoreCase|Orfas\.Contains\(f\.AccountName, StringComparer\.OrdinalIgnoreCase|\.Name, (keep|f\.AccountName), StringComparison\.OrdinalIgnoreCase|it\.Real, keep, StringComparison\.OrdinalIgnoreCase|f\.AccountName, a\.Name, StringComparison\.OrdinalIgnoreCase)/],
  [rd('AddOns/AlfaOmegaCopyEngineContas.cs'), /(todas|cfgPorNome) = new Dictionary<[^>]+>\(StringComparer\.OrdinalIgnoreCase|Visiveis\.Contains\(leader, StringComparer\.OrdinalIgnoreCase|vistos = new HashSet<string>\(StringComparer\.OrdinalIgnoreCase|c\.Name, leader, StringComparison\.OrdinalIgnoreCase/],
  [rd('Indicators/TTW_DarkProjects/AoAccountNames.cs'), /new Dictionary<string, string>\(StringComparer\.OrdinalIgnoreCase/],
];
const hits = proibidos.filter(([s, re]) => re.test(s)).length;
console.log('R08_SCAN ' + (hits === 0 ? 'PASS' : 'FAIL') + ' pontos de identidade de conta sem diferenciar caixa = ' + hits + ' (de ' + proibidos.length + ' padroes)');
process.exit(hits === 0 ? 0 : 1);
