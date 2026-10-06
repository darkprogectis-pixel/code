// SEAM P1S 2026-10-05 — extrai, SEM alterar o corpo, os metodos REAIS do staging que costuram o NT8 a politica do Press:
//   AoControlCenter.cs : OnMarketData, OnBarUpdate, InicioSessaoTape (+ campo _sessIterTape)
//   AlfaOmegaFlowOne.cs: PressSerieTick (+ campo _pressSessIter)
// e os embrulha em classes parciais SeamCC / SeamFlowOne que herdam de SeamHost (adapter que imita State / Bars / Time / Close /
// Volume / BarsArray / SessionIterator). Unica troca de texto: o modificador de acesso (protected override / private -> public).
// Uso: node gen_seam_harness.js <AoControlCenter.cs> <AlfaOmegaFlowOne.cs> <saida.g.cs>
const fs = require('fs');
const [ccPath, foPath, outPath] = process.argv.slice(2);
if (!ccPath || !foPath || !outPath) { console.error('uso: node gen_seam_harness.js <cc.cs> <flowone.cs> <saida>'); process.exit(2); }

function unico(src, marca, arq) {
  const i = src.indexOf(marca);
  if (i < 0) throw new Error('nao achei em ' + arq + ': ' + marca);
  if (src.indexOf(marca, i + 1) >= 0) throw new Error('nao unico em ' + arq + ': ' + marca);
  return i;
}
// metodo inteiro a partir da assinatura: casa chaves (os trechos extraidos nao tem chave em string/comentario)
function metodo(src, assinatura, arq) {
  const i = unico(src, assinatura, arq);
  const a = src.indexOf('{', i);
  let n = 0, j = a;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') n++; else if (c === '}') { n--; if (n === 0) break; } }
  if (n !== 0) throw new Error('chaves nao fecham: ' + assinatura);
  return src.slice(i, j + 1);
}
function linha(src, marca, arq) {
  const i = unico(src, marca, arq);
  const f = src.indexOf('\n', i);
  return src.slice(i, f).trim();
}

const cc = fs.readFileSync(ccPath, 'utf8');
const fo = fs.readFileSync(foPath, 'utf8');

const ccOmd = metodo(cc, 'protected override void OnMarketData(Data.MarketDataEventArgs e)', 'CC');
const ccObu = metodo(cc, 'protected override void OnBarUpdate()', 'CC');
const ccIni = metodo(cc, 'private DateTime InicioSessaoTape(int bip, DateTime t)', 'CC');
const ccFld = linha(cc, 'private readonly Dictionary<int, Data.SessionIterator> _sessIterTape', 'CC');
const foPst = metodo(fo, 'private void PressSerieTick()', 'FlowOne');
const foFld = linha(fo, 'private SessionIterator _pressSessIter;', 'FlowOne');
const foDecl = linha(fo, 'private readonly AoPressSessao _pressSessao = new AoPressSessao();', 'FlowOne');

// prova de que o corpo extraido usa a API que o lote introduziu (falha se o staging mudar de forma)
for (const [txt, marca] of [
  [ccObu, 'AoMarketDataPublisher.ResetSessao(_tapePubId, sym, State == State.Realtime, Time[0], InicioSessaoTape(BarsInProgress, Time[0]))'],
  [ccObu, 'AoMarketDataPublisher.Backfill(_tapePubId, sym, Close[0], Bars.GetBid(CurrentBar), Bars.GetAsk(CurrentBar), (long)Volume[0], Time[0])'],
  [ccOmd, 'AoMarketDataPublisher.Tick(_tapePubId, sym, tipo, e.Price, e.Bid, e.Ask, e.Volume, e.Time, State == State.Realtime)'],
  [foPst, '_pressSessao.ViradaSessao(State == State.Realtime, Time[0], ini)'],
  [foPst, '_pressSessao.TickHistorico(lado, (long)Volume[0], Time[0], valida)'],
]) if (!txt.includes(marca)) throw new Error('corpo extraido sem a chamada esperada: ' + marca);

const pub = s => s.replace('protected override void', 'public void').replace('private void PressSerieTick', 'public void PressSerieTick');
const out = `// GERADO por gen_seam_harness.js — NAO EDITAR. Corpos REAIS do staging (so o modificador de acesso foi trocado).
// fonte CC: ${ccPath.replace(/\\/g, '/')}
// fonte FlowOne: ${foPath.replace(/\\/g, '/')}
using System;
using System.Collections.Generic;
using NinjaTrader.Data;

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class SeamCC : SeamHost
	{
		public long _tapePubId;
		public int _biEs = 1, _biNq = 2;

		${pub(ccOmd)}

		${pub(ccObu)}

		${ccFld}
		${ccIni}
	}

	public partial class SeamFlowOne : SeamHost
	{
		${foDecl}
		public AoPressSessao Politica { get { return _pressSessao; } }
		${foFld}
		public void CargaDataLoaded() { _pressSessao.Carga(); _pressSessIter = null; }   // FlowOne State.DataLoaded (linha "_pressSessao.Carga(); _pressSessIter = null;")

		${pub(foPst)}
	}
}
`;
if (!fo.includes('_pressSessao.Carga(); _pressSessIter = null;')) throw new Error('FlowOne sem a carga do DataLoaded esperada');
fs.writeFileSync(outPath, out);
console.log('gerado ' + outPath + ' · CC: OnMarketData/OnBarUpdate/InicioSessaoTape reais · FlowOne: PressSerieTick real');
