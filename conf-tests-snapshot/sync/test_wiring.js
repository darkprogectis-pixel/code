// (2026-10-01) RESIDUAL A — prova ESTRUTURAL do wiring no AlfaOmegaRobo.cs REAL (le o source; nao e modelo).
// Uso: node test_wiring.js [caminho AlfaOmegaRobo.cs]   (padrao: staging). W1–W7. Esperado: FALHA no Robo 9809bf77… (sem ligacao), PASS na versao integrada.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const f = process.argv[2] || path.join(__dirname, 'staging', 'AddOns', 'AlfaOmegaRobo.cs');
const src = fs.readFileSync(f, 'utf8');
console.log('fonte: ' + f + '  sha16=' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16));
function metodo(nome) {   // corpo do metodo por contagem de chaves a partir da assinatura
  const m = new RegExp('private static [\\w<>]+ ' + nome + '\\(').exec(src); if (!m) return '';
  let i = src.indexOf('{', m.index), n = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}' && --n === 0) break; }
  return src.slice(i, j + 1);
}
const rec = metodo('Reconciliar'), sai = metodo('ExecutarSaida'), rev = metodo('RevalidarClose');
const close = sai + rev;   // revalidacao pode estar inline ou no metodo RevalidarClose chamado pelo ExecutarSaida
let pass = 0, fail = 0;
function ok(c, w) { if (c) { pass++; console.log('PASS ' + w); } else { fail++; console.log('FAIL ' + w); } }
const iConf = rec.indexOf('LeituraConfirmado'), iCancel = rec.indexOf('CancelCore(');
ok(/AoRoboFechamento\.AvaliarLeituraDesvio\(/.test(rec), 'W1 Reconciliar chama AvaliarLeituraDesvio');
ok(iConf >= 0 && iCancel > iConf && !/e\["desvio"\]\s*=\s*true/.test(rec), 'W2 cancel_oco so dentro do ramo LeituraConfirmado (1a leitura/candidato nao cancela; desvio so via peca pura)');
ok(/AoRoboFechamento\.ClassificarBrokerNoClose\(/.test(close) && /AoRoboFechamento\.DecidirClose\(/.test(close)
   && (/AoRoboSaida\.Decidir\([^;]*;\s*d\s*=\s*RevalidarClose\(/.test(sai) || /AoRoboFechamento\.ClassificarBrokerNoClose\(/.test(sai)), 'W3 ExecutarSaida revalida o broker no CLOSE (ClassificarBrokerNoClose + DecidirClose sobre o Decidir)');
ok(/CloseJaFechada/.test(close) && /AoSaidaAcao\.JaFechada/.test(rev || sai) && /stop/i.test(rev || sai), 'W4 JaFechada so por classificacao atual do broker (FLAT) ou stop do robo FILLED — desvio sozinho nao encerra');
ok(/CloseFechar/.test(close) && /QtyFechar\s*=\s*qf/.test(close) && /out qf/.test(close), 'W5 BrokerMesmoLado → fechamento com qty = qf (min(perna, conta))');
ok(/CloseDivergencia[\s\S]{0,400}AoSaidaAcao\.SemLeitura/.test(close) && /"broker_internal_divergence"/.test(sai), 'W6 BrokerDivergente → SemLeitura (nenhuma ordem) + audit broker_internal_divergence');
// (2026-10-01, RESIDUAL_A2_REPROTECTION_GAP) W7: perna em desvio=true nao e mais pulada sem reavaliar; peca pura nova decide; stop so sem stop ativo.
const rea = metodo('ReavaliarDesvio');
const fF = path.join(path.dirname(f), 'AlfaOmegaRoboFechamento.cs'), fech = fs.existsSync(fF) ? fs.readFileSync(fF, 'utf8') : '';
const iBr = rea.indexOf('AlfaOmegaTrader.BracketCore('), iDec = rea.indexOf('AoRoboFechamento.DecidirReprotecao(');
ok(!/if\s*\(\s*fora\s*\|\|\s*desv\s*\)\s*continue/.test(rec) && /if\s*\(\s*desv\s*\)\s*\{\s*if\s*\(\s*ReavaliarDesvio\(e,/.test(rec)
   && /AoRoboFechamento\.ClassificarReversaoDesvio\(/.test(rea) && iDec >= 0 && iBr > iDec && /"cancelExisting", false/.test(rea)
   && /AoRoboFechamento\.MarcarDesvioRevertido\(/.test(rea) && /FecharPernaEmDesvio\(/.test(rea)
   && /"positionAction", side == "LONG" \? "buy" : "sell"/.test(rea)   // stop protege a perna no MESMO lado (nunca inverte)
   // (A2B) DecidirReprotecao no Fechamento (mesma pasta) nunca devolve REPROTEGER enquanto OcoReuseAceito=false (NT8 rejeita OCO reusado)
   && /return OcoReuseAceito \? ReprotegerStop : ReprotecaoFechar;/.test(fech) && /public const bool OcoReuseAceito = false;/.test(fech),
   'W7 Reconciliar reavalia perna em desvio (ReavaliarDesvio → ClassificarReversaoDesvio + DecidirReprotecao); BracketCore so apos a decisao, cancelExisting=false; sem inversao; A2B OcoReuseAceito=false ⇒ FECHAR_PERNA');
// (2026-10-01, PROTECTION_MANDATORY) W8: TODA ocorrencia de OCO da perna passa pelo helper unico (AoRoboFechamento.OcoDoIntent/OcoDaPerna/
//     EhStopDaPerna/EstadoStopDaPerna/OcoDaTentativa) em Robo, Saida e EventoAot; nenhuma igualdade crua oco==intentId; nenhum ocoId=intentId;
//     CorpoCancelStop sem chamador no Robo (J7: mantido no Saida por compat.); watchdog GarantirProtecao no MotorPasso apos EscortarTakes;
//     ProtegerFill com OCO |P<n>; P0 presente. Controle: Robo 24808ada + Saida bbd3030a + EventoAot aacdfe52 + Fech 26b2d1a4 ⇒ FAIL.
{
  const semCom = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const ler = n => { const p = path.join(path.dirname(f), n); return fs.existsSync(p) ? semCom(fs.readFileSync(p, 'utf8')) : ''; };
  const robo = semCom(src), sd = ler('AlfaOmegaRoboSaida.cs'), ev = ler('AlfaOmegaRoboEventoAot.cs'), fc = semCom(fech);
  const cru = /\["oco"\]\s*==|==\s*\(string\)\s*\w+\["oco"\]|\boco\s*==\s*intentId|"ocoId",\s*intentId\b|Equals\(\s*(\(string\)\s*\w+\["oco"\]|oco)\s*,\s*intentId\b/;
  const ocoIds = robo.match(/\{\s*"ocoId",\s*[^}]+\}/g) || [];
  const ocoIdOk = ocoIds.length > 0 && ocoIds.every(x => /OcoDaTentativa\(|"ocoId",\s*(oco|ocoPf)\s*\}/.test(x));
  const mp = metodo('MotorPasso'), iEsc = mp.indexOf('EscortarTakes('), iGar = iEsc < 0 ? -1 : mp.indexOf('GarantirProtecao(agora)', iEsc);   // G11: ha tambem a chamada do ramo flatten_retry (W9)
  const det = [];
  if (cru.test(robo)) det.push('robo:oco cru'); if (cru.test(sd)) det.push('saida:oco cru'); if (cru.test(ev)) det.push('evento:oco cru');
  if (/CorpoCancelStop\s*\(/.test(robo)) det.push('robo:CorpoCancelStop');
  if (!ocoIdOk) det.push('robo:ocoId fora de OcoDaTentativa');
  if (!/AoRoboFechamento\.OcoDoIntent\(/.test(ev)) det.push('evento:sem OcoDoIntent');
  if (!/AoRoboFechamento\.EstadoStopDaPerna\(/.test(sd) || !/OcoCancelar\s*=\s*OcoAtual\(e\)/.test(sd)) det.push('saida:regra1/OcoCancelar');
  if (!/StartsWith\(intentId \+ "\|P"/.test(fc)) det.push('fech:OcoDoIntent');
  if (!(iEsc >= 0 && iGar > iEsc)) det.push('ciclo:GarantirProtecao');
  if (!/OcoDaTentativa\(/.test(metodo('ProtegerFill'))) det.push('ProtegerFill:|P<n>');
  if (!/AoRoboFechamento\.ProtecaoPreTrade\(/.test(robo)) det.push('P0');
  ok(det.length === 0, 'W8 OCO da perna so via helper unico (Robo/Saida/EventoAot), CorpoCancelStop sem chamador no Robo, ocoId so OcoDaTentativa (' + ocoIds.length + ' brackets), watchdog no ciclo apos EscortarTakes, P0 presente' + (det.length ? '  [' + det.join(' ') + ']' : ''));
}
// (2026-10-02, G11) W9: motor FLAT com perna aberta — o ramo flatten_retry chama o watchdog GarantirProtecao logo apos ExecutarSaida("flatten_retry")
{
  const mp = metodo('MotorPasso').replace(/\/\/[^\n]*/g, '');
  ok(/ExecutarSaida\("flatten_retry",[^;]*;\s*GarantirProtecao\(agora\);/.test(mp), 'W9 ramo flatten_retry (motor FLAT) chama GarantirProtecao apos ExecutarSaida("flatten_retry") (G11)');
}
// (2026-10-02, G13/G14/G8) W10: no Ciclo, RefreshAll → ConexaoPasso → GarantiaBoot ANTES de SessaoPasso/MotorPasso (MotorPasso consome os eventos do AOT);
//     GarantiaBoot so roda com o flag do Start e chama GarantirProtecao. W11: AuditarIlegivel escala via NivelIlegivel + Alertar; GarantirPerna limpa o alerta
//     quando a decisao nao e ILEGIVEL; nenhum caminho de ordem nos metodos novos. Controle: Robo 0e7a0d5e ⇒ FAIL.
{
  const ci = metodo('Ciclo').replace(/\/\/[^\n]*/g, '');
  const iR = ci.indexOf('AoRoboPositions.RefreshAll('), iC = ci.indexOf('ConexaoPasso(agora'), iB = ci.indexOf('GarantiaBoot(agora)'),
        iS = ci.indexOf('SessaoPasso(agora'), iM = ci.indexOf('MotorPasso(agora');
  const gb = metodo('GarantiaBoot'), st = metodo('Start').replace(/\/\/[^\n]*/g, '');
  ok(iR >= 0 && iC > iR && iB > iC && iS > iB && iM > iS && /_bootGarantiaPendente\s*=\s*true/.test(st)
     && /if\s*\(\s*!_bootGarantiaPendente\s*\)\s*return;\s*_bootGarantiaPendente\s*=\s*false;/.test(gb) && /GarantirProtecao\(agora\)/.test(gb),
     'W10 Ciclo: RefreshAll → ConexaoPasso → GarantiaBoot antes de SessaoPasso/MotorPasso (= antes de consumir evento do AOT); flag ligado no Start, 1x so (G13/G14)');
  const ai = metodo('AuditarIlegivel'), gp = metodo('GarantirPerna');
  const novos = ['Alertar', 'LimparAlertaIlegivel', 'GarantiaBoot', 'ConexaoPasso', 'AvaliarCanal', 'LerConexoes'].map(metodo).join('\n');
  ok(/AoRoboFechamento\.NivelIlegivel\(/.test(ai) && /Alertar\(AlertaIlegivel,/.test(ai) && /if \(dec != AoRoboFechamento\.GarIlegivel\) LimparAlertaIlegivel\(/.test(gp)
     && novos.trim().length > 0 && !/(PlaceCore|BracketCore|CancelCore|ChangeCore|ExecutarOrdem|ExecutarSaida)\(/.test(novos),
     'W11 AuditarIlegivel escala (NivelIlegivel + Alertar); GarantirPerna limpa o alerta fora de ILEGIVEL; metodos G8/G13/G14 sem caminho de ordem');
}
// (2026-10-02, EQUITY_GUARD) W12: ExecutarEntradaCore le a equity REAL (LerEquity → AoRoboEquity.Valida) e o peak (_equity.Peak) ANTES do
//     PropfirmGuard; nenhuma equity constante (PeakEquity/CurrentEquity = numero) no Robo; account_mode nao decide a equity; nenhum literal de
//     nome de conta no caminho; LerEquity sem caminho de ordem e sem _protGate; _equity criado no Start. Controle: Robo fe048080 ⇒ FAIL.
{
  const semCom = s => s.replace(/\/\/[^\n]*/g, '');
  const ee = semCom(metodo('ExecutarEntradaCore'));
  const mLe = /private static double\? LerEquity\(/.exec(src);
  let le = '';
  if (mLe) { let i = src.indexOf('{', mLe.index), n = 0, j = i; for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}' && --n === 0) break; } le = semCom(src.slice(i, j + 1)); }
  const iL = ee.indexOf('LerEquity(c.Nt8Account'), iP = ee.search(/\.Peak\(c\.Nt8Account, eq\.Value, agora\)/), iG = ee.indexOf('AoRoboGates.PropfirmGuard(');
  const iCtx = ee.indexOf('var ctxConta'), iPor = ee.indexOf('var porConta');
  const trecho = iCtx >= 0 && iPor > iCtx ? ee.slice(iCtx, iPor) : '';
  ok(le.length > 0 && iL >= 0 && iP > iL && iG > iP
     && /AoRoboEquity\.Valida\(/.test(le) && /AccountItem\.NetLiquidation/.test(le) && /AccountItem\.CashValue/.test(le)
     && !/(PeakEquity|CurrentEquity)\s*=\s*\d/.test(semCom(src)) && !/AccountMode/.test(trecho)
     && !/"(Sim101|Playback101|TAKEPROFIT[^"]*|Rithmic[^"]*)"/.test(le + trecho)
     && !/(PlaceCore|BracketCore|CancelCore|ChangeCore|ExecutarOrdem|ExecutarSaida|_protGate)/.test(le)
     && /_equity\s*=\s*new AoRoboEquity\(/.test(semCom(metodo('Start'))),
     'W12 equity real (LerEquity NL→CV + _equity.Peak) antes do PropfirmGuard; sem equity constante; account_mode e nome de conta fora da equity; LerEquity sem ordem/_protGate (EQUITY_GUARD)');
}
console.log('RESULTADO wiring: pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
