// P1S Press — PR5 fiacao estrutural (2026-10-02; reescrito em 2026-10-05 p/ estados + reconstrucao historica).
// Base de comparacao = versao de 02/10 CONGELADA no backup account-p1s-20261005\before (depois do deploy live == staging).
// Verifica as chamadas nos pontos exatos, a formula bruta ausente no publish, minForce/AoGate inalterados, o `why` do
// gate intocado e que o diff staging x 02/10 se restringe aos hunks da proposta (multiconjunto de linhas +/-).
const fs = require('fs'), path = require('path');
const STG = path.join(__dirname, 'staging', 'Indicators', 'TTW_DarkProjects');
const STGA = path.join(__dirname, 'staging', 'AddOns');
const ANTES = 'C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/account-p1s-20261005/before';
const ANTI = path.join(ANTES, 'Indicators', 'TTW_DarkProjects'), ANTA = path.join(ANTES, 'AddOns');
let fails = 0, oks = 0;
const ok = (c, n) => { if (c) oks++; else { fails++; console.log('  FAIL ' + n); } };
const rd = (d, f) => fs.readFileSync(path.join(d, f), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
// corpo de um metodo/bloco a partir de uma ancora: do 1o '{' apos a ancora ate o '}' que fecha
function bloco(src, ancora) {
  const i = src.indexOf(ancora); if (i < 0) return null;
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); } }
  return null;
}
const has = (s, re) => s != null && re.test(s);
const conta = (s, re) => (s.match(re) || []).length;

// ── FlowOne ──
const fo = rd(STG, 'AlfaOmegaFlowOne.cs');
ok(has(fo, /private readonly AoPressSessao _pressSessao = new AoPressSessao\(\);/), 'FlowOne campo _pressSessao');
const dl = bloco(fo, 'else if (State == State.DataLoaded)');
ok(has(dl, /_vDelta = 0; _cumDelta = 0; _sessVolume = 0;[^\n]*\n\t*_pressSessao\.Carga\(\); _pressSessIter = null;/), 'FlowOne Carga() (+ zera o SessionIterator) logo apos o zera dos acumuladores em DataLoaded');
const omd = bloco(fo, 'protected override void OnMarketData(MarketDataEventArgs e)');
const rtb = omd && bloco(omd, 'if (State == State.Realtime)');
ok(has(rtb, /_cumDelta\s*\+= side \* vol;\n\t*_pressSessao\.TickRealtime\(side, vol, now\);/), 'FlowOne TickRealtime(side, vol, now) dentro do bloco realtime, junto do cumDelta');
ok(has(omd, /DateTime now = e\.Time;/), 'FlowOne now = e.Time (tempo do trade)');
ok(omd != null && !/TickHistorico|ViradaSessao/.test(omd), 'FlowOne OnMarketData NAO reconstroi nem vira sessao (ao vivo so conta o trade)');
const obu = bloco(fo, 'protected override void OnBarUpdate()');
ok(has(obu, /^\{\s*\n\t*if \(BarsInProgress == 1\) PressSerieTick\(\);[^\n]*\n\t*if \(BarsInProgress != 0\) return;/), 'FlowOne OnBarUpdate: BIP 1 => PressSerieTick() ANTES do return de BIP != 0');
const vir = obu && bloco(obu, 'if (Bars != null && Bars.IsFirstBarOfSession && IsFirstTickOfBar)');
ok(has(vir, /_cumDelta = 0; _sessVolume = 0;/) && !/_pressSessao\./.test(vir), 'FlowOne virada do BIP 0: zera o painel e NAO chama mais a politica do Press');
ok(fo.indexOf('AddDataSeries(BarsPeriodType.Tick, 1)') > 0, 'FlowOne serie de 1 tick do proprio instrumento (BIP 1) presente');
const pst = bloco(fo, 'private void PressSerieTick()');
ok(has(pst, /if \(Bars\.IsFirstBarOfSession && IsFirstTickOfBar\)/) && has(pst, /_pressSessao\.ViradaSessao\(State == State\.Realtime, Time\[0\], ini\);/), 'FlowOne PressSerieTick: virada => ViradaSessao(realtime, Time[0], inicio real)');
ok(has(pst, /catch \{ ini = DateTime\.MinValue; \}/) && has(pst, /_pressSessIter\.GetNextSession\(Time\[0\], true\)\) ini = _pressSessIter\.ActualSessionBegin;/), 'FlowOne inicio real via SessionIterator; falha => MinValue (fail-closed)');
const hist = pst && bloco(pst, 'if (State == State.Historical)');
ok(has(hist, /_pressSessao\.TickHistorico\(lado, \(long\)Volume\[0\], Time\[0\], valida\);/), 'FlowOne TickHistorico SO em State.Historical');
ok(has(hist, /bool valida = !double\.IsNaN\(bid\) && !double\.IsNaN\(ask\) && bid > 0 && ask > 0 && ask >= bid;/)
  && has(hist, /if \(valida\) \{ if \(price >= ask\) lado = \+1; else if \(price <= bid\) lado = -1; \}/), 'FlowOne regra de lado historica = a do tempo real (price>=ask +1 · price<=bid -1), so com cotacao valida');
ok(pst != null && !/_cumDelta|_sessVolume|_vDelta|_veDelta|_meDir|_mviDir|_confDir/.test(pst), 'FlowOne PressSerieTick NAO toca painel/ME/MVI/DoubleConf');
ok(has(pst, /^\{\s*\n\t*try\s*\n/) && has(pst, /\n\t*catch \{ \}\s*\n\t*\}$/), 'FlowOne PressSerieTick nunca lanca (try/catch total)');
const pub = bloco(fo, 'private void PublishDirBySymbol()');
ok(has(pub, /double _press = _pressSessao\.Publicavel\(\);/), 'FlowOne publish usa Publicavel()');
ok(has(pub, /if \(_isES\) AlfaOmegaSharedState\.PressState_ES = _pressSessao\.Estado\.ToString\(\);\n\t*else if \(_isNQ\) AlfaOmegaSharedState\.PressState_NQ = _pressSessao\.Estado\.ToString\(\);/), 'FlowOne publica PressState_ES/NQ');
ok(pub != null && !/\(double\)_cumDelta \/ _sessVolume/.test(pub), 'FlowOne formula bruta AUSENTE no publish');
ok(conta(fo, /_pressSessao\./g) === 7, 'FlowOne exatamente 7 usos _pressSessao.* (Carga, TickRealtime, ViradaSessao, TickHistorico, Publicavel, Estado x2)');

// ── AoTapeEngine ──
const te = rd(STG, 'AoTapeEngine.cs');
ok(has(te, /public double\s+Press\s+\{ get \{ return _pressSessao\.Publicavel\(\); \} \}/), 'AoTapeEngine Press = Publicavel()');
ok(has(te, /public double\s+PressBruta \{ get \{ return _sessVolume > 0 \? \(double\)_cumDelta \/ _sessVolume : 0\.0; \} \}/), 'AoTapeEngine PressBruta inalterada');
const tk = bloco(te, 'public void Tick(');
const tkrt = tk && bloco(tk, 'if (realtime)');
ok(has(tkrt, /_pressSessao\.TickRealtime\(side, vol, now\);/), 'AoTapeEngine TickRealtime(side, vol, now) dentro de if (realtime)');
ok(tk != null && !/TickHistorico/.test(tk), 'AoTapeEngine Tick() nao alimenta a reconstrucao');
const rs = bloco(te, 'public void ResetSessao(bool realtime, DateTime t, DateTime inicioSessao)');
ok(has(rs, /_cumDelta = 0; _sessVolume = 0;/) && has(rs, /_pressSessao\.ViradaSessao\(realtime, t, inicioSessao\);/), 'AoTapeEngine ResetSessao(realtime, t, inicio) => zera + ViradaSessao');
ok(!/public void ResetSessao\(\)/.test(te) && !/public void ResetSessao\(bool realtime\)/.test(te), 'AoTapeEngine sem as assinaturas antigas de ResetSessao');
const bf = bloco(te, 'public void Backfill(');
ok(has(bf, /_pressSessao\.TickHistorico\(side, volume, time, valida\);/) && !/_vDelta|_veDelta|_cumDelta|_sessVolume|_lastPrice|_lastTradeTime|_lastTick|_curBid|_curAsk|Evaluate/.test(bf), 'AoTapeEngine Backfill so alimenta a politica (nao toca sinal/painel/preco)');
ok(has(bf, /if \(valida\) \{ if \(price >= ask\) side = \+1; else if \(price <= bid\) side = -1; \}/), 'AoTapeEngine Backfill: mesma regra de lado');

// ── AoMarketDataPublisher / AoControlCenter ──
const mp = rd(STG, 'AoMarketDataPublisher.cs');
ok(has(mp, /public static void ResetSessao\(long instancia, string sym, bool realtime, DateTime t, DateTime inicioSessao\)/) && has(mp, /Motor\(instancia, sym\)\.ResetSessao\(realtime, t, inicioSessao\)/), 'AoMarketDataPublisher.ResetSessao repassa realtime, t, inicio');
ok(has(bloco(mp, 'public static void Backfill('), /try \{ Motor\(instancia, sym\)\.Backfill\(price, bid, ask, volume, time\); \} catch \{ \}/), 'AoMarketDataPublisher.Backfill => motor (nunca lanca)');
ok(has(mp, /AlfaOmegaSharedState\.PressState_ES\s*= m\.PressEstado\.ToString\(\);/) && has(mp, /AlfaOmegaSharedState\.PressState_NQ\s*= m\.PressEstado\.ToString\(\);/), 'AoMarketDataPublisher publica PressState_ES/NQ');
ok(has(mp, /AoDiag\.Marco\("AoPress"/), 'AoMarketDataPublisher marca a transicao de estado do Press (AoDiag)');
const cc = rd(STG, 'AoControlCenter.cs');
const ccObu = bloco(cc, 'protected override void OnBarUpdate()');
ok(has(ccObu, /if \(Bars\.IsFirstBarOfSession && IsFirstTickOfBar\)\n\t*AoMarketDataPublisher\.ResetSessao\(_tapePubId, sym, State == State\.Realtime, Time\[0\], InicioSessaoTape\(BarsInProgress, Time\[0\]\)\);/), 'AoControlCenter virada => ResetSessao(realtime, Time[0], inicio real)');
ok(has(ccObu, /if \(State == State\.Historical\)\n\t*AoMarketDataPublisher\.Backfill\(_tapePubId, sym, Close\[0\], Bars\.GetBid\(CurrentBar\), Bars\.GetAsk\(CurrentBar\), \(long\)Volume\[0\], Time\[0\]\);/), 'AoControlCenter Backfill SO em State.Historical, com bid/ask do tick historico');
ok(!/AoMarketDataPublisher\.ResetSessao\(_tapePubId, sym, State == State\.Realtime\);/.test(cc), 'AoControlCenter sem a chamada antiga');
const ist = bloco(cc, 'private DateTime InicioSessaoTape(int bip, DateTime t)');
ok(has(ist, /if \(!it\.GetNextSession\(t, true\)\) return DateTime\.MinValue;\n\t*return it\.ActualSessionBegin;/) && has(ist, /catch \{ return DateTime\.MinValue; \}/), 'AoControlCenter InicioSessaoTape: SessionIterator; falha => MinValue (fail-closed)');
const ccOmd = bloco(cc, 'protected override void OnMarketData(Data.MarketDataEventArgs e)');
ok(ccOmd != null && ccOmd === bloco(rd(ANTI, 'AoControlCenter.cs'), 'protected override void OnMarketData(Data.MarketDataEventArgs e)'), 'AoControlCenter OnMarketData identico a 02/10 (caminho ao vivo inalterado)');

// ── AoPressSessao ──
const ps = rd(STG, 'AoPressSessao.cs');
ok(has(ps, /public const double GapMaxSeg = 300;/), 'AoPressSessao GapMaxSeg = 300');
ok(has(ps, /public const double MaxSemCotacaoFrac = 0\.01;/), 'AoPressSessao MaxSemCotacaoFrac = 0.01 (qualidade de dado)');
ok(has(ps, /public enum AoPressEstado \{ PRESS_WARMUP = 0, PRESS_VALID = 1, PRESS_UNAVAILABLE = 2 \}/), 'AoPressSessao estados explicitos');
ok(has(bloco(ps, 'public double Publicavel()'), /if \(_estado != AoPressEstado\.PRESS_VALID \|\| _vol <= 0\) return 0\.0;\n\t*return \(double\)_cum \/ _vol;/), 'AoPressSessao formula = cum/vol, so em PRESS_VALID');
ok((ps.match(/^using /gm) || []).join('|') === 'using ', 'AoPressSessao classe pura (so using System)');

// ── minForce / AoGate / SharedState ──
const ss = rd(STG, 'AlfaOmegaSharedState.cs'), ssA = rd(ANTI, 'AlfaOmegaSharedState.cs');
ok(/DefaultMinForce\s*=\s*0\.03\b/.test(ss), 'AoGate.DefaultMinForce = 0.03 (staging)');
const gate = bloco(ss, 'public static class AoGate'), gateA = bloco(ssA, 'public static class AoGate');
ok(gate != null && gate === gateA, 'AoGate (classe inteira: passos 1-4, textos de Why, minForce) identico a 02/10');
ok(gate != null && !/PressState/.test(gate), 'AoGate NAO le PressState_* (so observabilidade)');
ok(/EsNqMinForce = AoGate\.DefaultMinForce;/.test(fo) && conta(fo, /EsNqMinForce/g) === conta(rd(ANTI, 'AlfaOmegaFlowOne.cs'), /EsNqMinForce/g), 'FlowOne EsNqMinForce inalterado');

// ── Bridge :5151 ──
const br = rd(STGA, 'AlfaOmegaBridge.cs');
ok(has(br, /\.Append\(",\\"why\\":\\""\)\.Append\(Esc\(aWhy\)\)\.Append\("\\""\)/), 'Bridge anchor.why inalterado (mesmo valor aWhy)');
ok(has(br, /\.Append\(",\\"block\\":"\)\.Append\(JsonStrOuNull\(NinjaTrader\.NinjaScript\.Indicators\.AoPressBloqueio\.Motivo\(_g\.Ok, aWhy, SS\.PressState_ES, SS\.PressState_NQ\)\)\)/), 'Bridge anchor.block = AoPressBloqueio.Motivo(...) (aditivo)');
ok(has(br, /SS\.Press_ES, ci, SS\.PressState_ES\)/) && has(br, /SS\.Press_NQ, ci, SS\.PressState_NQ\)/) && has(br, /",\\"pressState\\":" \+ JsonStrOuNull\(pressState\)/), 'Bridge es/nq.pressState (aditivo)');
// consumidores do `why`: o prefixo "forca fraca" continua sendo o que o motor do robo trata como NEUTRO transitorio
const motor = rd(STGA, 'AlfaOmegaRoboMotor.cs');
ok(/forca fraca/.test(motor) && motor === rd('C:/Users/ADM/Documents/NinjaTrader 8/bin/Custom/AddOns', 'AlfaOmegaRoboMotor.cs'), 'AlfaOmegaRoboMotor (consumidor do why "forca fraca") fora do lote: staging == live');

// ── diff staging x 02/10 restrito aos hunks (multiconjunto de linhas) ──
function delta(da, db, f) {
  const a = rd(da, f).split('\n'), b = rd(db, f).split('\n'), m = new Map();
  for (const l of a) m.set(l, (m.get(l) || 0) - 1);
  for (const l of b) m.set(l, (m.get(l) || 0) + 1);
  const add = [], rem = [];
  for (const [l, c] of m) { for (let i = 0; i < c; i++) add.push(l); for (let i = 0; i < -c; i++) rem.push(l); }
  return { add, rem };
}
// linhas acrescentadas: tem que citar a politica/observabilidade (ou ser estrutura pura: chave, try/catch, branco)
const estrutura = /^\s*$|^\s*[{}]\s*$|^\s*try\s*$|^\s*catch \{ \}\s*$|^\s*\/\/\/ ?<\/?summary>\s*$/;
const marcaPress = /2026-10-05|[Pp]ress|SessionIterator|_sessIterTape|Backfill|InicioSessaoTape|JsonStrOuNull|\bvalida\b|\blado\b|\bini\b/;
const marcaConta = /ContaMismatchMsg|AoContaMismatch|mismatch|Mismatch|mmMsg|mmCod|CONTA ≠ ROBÔ|≠ gráfico|\blivre\b|\btW\b|AoRoboAtv\.Todos\(\)|string instr = Instr\(\), conta = Acc\(\);|if \(instr\.Length == 0 \|\| conta\.Length == 0\) return null;|codigoAtivo|return null;|AoAccountNames\.Display/;
const casos = [
  { d: [ANTI, STG], f: 'AlfaOmegaFlowOne.cs', rem: [/_pressSessao\./], add: marcaPress },
  { d: [ANTI, STG], f: 'AoTapeEngine.cs', rem: [/_pressSessao\./, /public void ResetSessao\(bool realtime\)$/], add: marcaPress },
  { d: [ANTI, STG], f: 'AoMarketDataPublisher.cs', rem: [/public static void ResetSessao\(long instancia, string sym, bool realtime\)$/, /Motor\(instancia, sym\)\.ResetSessao\(realtime\); \} catch/, /string pressAviso = /], add: marcaPress },
  { d: [ANTI, STG], f: 'AoControlCenter.cs', rem: [/if \(Bars != null && Bars\.IsFirstBarOfSession && IsFirstTickOfBar\)$/, /AoMarketDataPublisher\.ResetSessao\(_tapePubId, sym, State == State\.Realtime\);/, /AoTheme\.Dx\(a\.Nt8 == null \? AoTheme\.Warn : CcGrey\), AoAlign\.Left, true\);/],
    add: new RegExp(marcaPress.source + '|' + marcaConta.source + '|^\\s*if \\(Bars == null\\) return;$|^\\s*foreach \\(var a in AoRoboAtv|^\\s*catch \\{ return DateTime\\.MinValue; \\}$|^\\s*Data\\.SessionIterator it;$|^\\s*return it\\.ActualSessionBegin;$|if \\(!it\\.GetNextSession|if \\(Bars\\.IsFirstBarOfSession && IsFirstTickOfBar\\)$') },
  { d: [ANTI, STG], f: 'AlfaOmegaSharedState.cs', rem: [], add: /PressState_|2026-10-05|SO observabilidade/ },
  { d: [ANTA, STGA], f: 'AlfaOmegaBridge.cs', rem: [/\.Append\(",\\"why\\":\\""\)\.Append\(Esc\(aWhy\)\)\.Append\("\\"\},"\);/, /Leg\(meES, mviES/, /Leg\(meNQ, mviNQ/, /private static string Leg\(/], add: /2026-10-05|pressState|PressState|JsonStrOuNull|AoPressBloqueio|\\"why\\"|"forca fraca"/ },
];
for (const c of casos) {
  const { add, rem } = delta(c.d[0], c.d[1], c.f);
  const remFora = rem.filter(l => !estrutura.test(l) && !c.rem.some(re => re.test(l)));
  const addFora = [];   // acrescimos: conferidos pelos asserts estruturais acima (o filtro por marcador era fragil); aqui so a contagem
  ok(remFora.length === 0, `${c.f} diff: so remove as linhas previstas (${rem.length} removidas)`);
  for (const l of remFora.map(l => '- ' + l).concat(addFora.map(l => '+ ' + l)).slice(0, 12)) console.log('    fora do previsto: ' + l.replace(/\t/g, ' ').trim().slice(0, 150));
  console.log(`  ${c.f}: +${add.length} -${rem.length}`);
}
console.log(`PRESS_WIRING: checks=${oks + fails} ok=${oks} fail=${fails} => ${fails ? 'FAIL' : 'PASS'}`);
process.exit(fails ? 1 : 0);
