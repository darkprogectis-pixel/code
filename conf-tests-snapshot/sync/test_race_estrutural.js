// RACE_EXECUCOES 2026-10-01 — T3 estrutural sobre AlfaOmegaRobo.cs (staging por padrao).
// T3a nenhuma mutacao/enumeracao de _execucoes/_fillsOrfaos/_protEmCurso fora de lock(_protGate)
// T3b nenhuma chamada ao broker/IO bloqueante (*Core, LerOrdens, EsperarFilled, RefreshAll, ChangeOrdem, ProtegerFill) dentro de
//     lock(_protGate) na thread do robo — excecao: OnFillEntrada (thread do NT8, comportamento mantido; TRADER_CORE_CROSS_THREAD = NAO)
// T3c idem transitivo: metodo do arquivo que alcanca o broker nao e chamado dentro de lock(_protGate) fora do OnFillEntrada
// T3d R5: catch do OnFillEntrada guarda o fill como orfao; Ciclo aplica os orfaos pendentes a cada ciclo
// Uso: node test_race_estrutural.js [AlfaOmegaRobo.cs]
const fs = require('fs');
const path = require('path');
const F = process.argv[2] || path.join(__dirname, 'staging', 'AddOns', 'AlfaOmegaRobo.cs');
const raw = fs.readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, nome, det) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + nome + (det ? '   [' + det + ']' : '')); };

// comentarios e conteudo de strings viram espacos (mesmo comprimento, mesmas quebras de linha)
function limpar(s) {
  const o = s.split('');
  const branco = (a, b) => { for (let k = a; k < b; k++) if (o[k] !== '\n') o[k] = ' '; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); const f = e < 0 ? s.length : e; branco(i, f); i = f; continue; }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2) + 2; branco(i, e); i = e - 1; continue; }
    if (c === '@' && n === '"') { let j = i + 2; for (; j < s.length; j++) { if (s[j] === '"') { if (s[j + 1] === '"') { j++; continue; } break; } } branco(i + 2, j); i = j; continue; }
    if (c === '"') { let j = i + 1; for (; j < s.length && s[j] !== '"'; j++) if (s[j] === '\\') j++; branco(i + 1, j); i = j; continue; }
    if (c === "'") { let j = i + 1; for (; j < s.length && s[j] !== "'"; j++) if (s[j] === '\\') j++; branco(i + 1, j); i = j; continue; }
  }
  return o.join('');
}
const src = limpar(raw);

// mapa "dentro de lock(_protGate)" por posicao
const travado = new Uint8Array(src.length);
{
  const pilha = []; let pend = false, pendProf = -1;
  const reLock = /lock\s*\(\s*_protGate\s*\)/y;
  for (let i = 0; i < src.length; i++) {
    reLock.lastIndex = i;
    if (src[i] === 'l' && reLock.test(src)) { pend = true; pendProf = pilha.length; const f = reLock.lastIndex; for (let k = i; k < f; k++) travado[k] = 1; i = f - 1; continue; }
    const c = src[i];
    if (c === '{') { pilha.push(pend || pilha.some(Boolean)); pend = false; }
    else if (c === '}') pilha.pop();
    else if (c === ';' && pend && pilha.length === pendProf) { travado[i] = 1; pend = false; continue; }
    travado[i] = (pend || pilha.some(Boolean)) ? 1 : 0;
  }
}
// metodo que envolve uma posicao
const reMet = /\b(?:private|public|internal|protected)\s+static\s+(?!readonly)[\w<>\[\],\.\s]+?\s+(\w+)\s*\(/g;
const metodos = [];
for (let m; (m = reMet.exec(src));) metodos.push({ nome: m[1], ini: m.index });
const metodoEm = p => { let r = null; for (const m of metodos) { if (m.ini <= p) r = m.nome; else break; } return r; };
const linhaEm = p => raw.slice(0, p).split('\n').length;
// corpo de cada metodo (do inicio ate o proximo metodo) para o grafo de chamadas
const corpos = {};
metodos.forEach((m, k) => { const fim = k + 1 < metodos.length ? metodos[k + 1].ini : src.length; corpos[m.nome] = (corpos[m.nome] || '') + src.slice(m.ini, fim); });

// T3a
// (V3, 2026-10-01 PROTECTION_MANDATORY) auxiliar "sob lock": metodo cujas chamadas (>=1) estao TODAS dentro de lock(_protGate),
//     direta ou via outro auxiliar sob lock — o acesso dentro dele roda com o lock do chamador. Os aceitos sao listados no resultado.
const declEm = new Set(metodos.map(m => src.indexOf(m.nome, m.ini + src.slice(m.ini).search(new RegExp('\\b' + m.nome + '\\s*\\(')) - 0)));
const chamadasDe = nome => { const r = [], re = new RegExp('\\b' + nome + '\\s*\\(', 'g');
  for (let m; (m = re.exec(src));) if (!declEm.has(m.index)) r.push({ p: m.index, met: metodoEm(m.index) });
  return r; };
const sobLock = new Set();
for (let mudou = true; mudou;) {
  mudou = false;
  for (const m of metodos) {
    if (sobLock.has(m.nome)) continue;
    const ch = chamadasDe(m.nome);
    if (ch.length && ch.every(c => travado[c.p] || sobLock.has(c.met))) { sobLock.add(m.nome); mudou = true; }
  }
}
const violA = [], aceitosA = new Set();
for (const id of ['_execucoes', '_fillsOrfaos', '_protEmCurso']) {
  const re = new RegExp('\\b' + id + '\\b', 'g');
  for (let m; (m = re.exec(src));) {
    const ln = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
    if (/static readonly/.test(ln)) continue;   // declaracao
    if (travado[m.index]) continue;
    const met = metodoEm(m.index);
    if (sobLock.has(met)) { aceitosA.add(met); continue; }
    violA.push(id + '@' + linhaEm(m.index) + '(' + met + ')');
  }
}
ok(violA.length === 0, 'T3a nenhuma mutacao/enumeracao de _execucoes/_fillsOrfaos/_protEmCurso fora de lock(_protGate)',
   violA.length ? violA.join(' ') : (aceitosA.size ? 'auxiliares so chamados sob lock: ' + [...aceitosA].join(',') : null));

// T3b / T3c
const BROKER = ['CancelCore', 'PlaceCore', 'ChangeCore', 'OrdersCore', 'BracketCore', 'FlattenCore', 'LerOrdens', 'EsperarFilled', 'RefreshAll', 'ChangeOrdem', 'ProtegerFill'];
const PERMITIDO = new Set(['OnFillEntrada']);   // thread do NT8 (ProtegerFill sob o lock, como antes)
const violB = [];
for (const b of BROKER) {
  const re = new RegExp('\\b' + b + '\\s*\\(', 'g');
  for (let m; (m = re.exec(src));) {
    const met = metodoEm(m.index);
    if (met === b) continue;   // a propria declaracao
    if (travado[m.index] && !PERMITIDO.has(met)) violB.push(b + '@' + linhaEm(m.index) + '(' + met + ')');
  }
}
ok(violB.length === 0, 'T3b nenhuma chamada *Core/LerOrdens/EsperarFilled/RefreshAll/ChangeOrdem/ProtegerFill dentro de lock(_protGate) na thread do robo', violB.length ? violB.join(' ') : null);

const alcanca = new Set(BROKER.filter(b => corpos[b]));
for (let mudou = true; mudou;) {
  mudou = false;
  for (const [nome, corpo] of Object.entries(corpos)) {
    if (alcanca.has(nome)) continue;
    if ([...alcanca, ...BROKER].some(b => new RegExp('\\b' + b + '\\s*\\(').test(corpo.slice(corpo.indexOf('(') + 1)))) { alcanca.add(nome); mudou = true; }
  }
}
const violC = [];
for (const nome of alcanca) {
  const re = new RegExp('\\b' + nome + '\\s*\\(', 'g');
  for (let m; (m = re.exec(src));) {
    const met = metodoEm(m.index);
    if (met === nome) continue;
    if (travado[m.index] && !PERMITIDO.has(met)) violC.push(nome + '@' + linhaEm(m.index) + '(' + met + ')');
  }
}
ok(violC.length === 0, 'T3c transitivo: nenhum metodo que alcanca o broker e chamado dentro de lock(_protGate) fora do OnFillEntrada',
   violC.length ? violC.join(' ') : ('metodos que alcancam o broker: ' + [...alcanca].filter(x => !BROKER.includes(x)).length));

// T3d
const onFill = corpos['OnFillEntrada'] || '';
const catchOnFill = onFill.indexOf('catch (Exception') < 0 ? '' : onFill.slice(onFill.indexOf('catch (Exception'));
ok(/GuardarFillOrfao\s*\(/.test(catchOnFill), 'T3d catch do OnFillEntrada guarda o fill como orfao (R5)');
ok(/AplicarFillsOrfaosPendentes\s*\(/.test(corpos['Ciclo'] || ''), 'T3d Ciclo aplica os fills orfaos pendentes a cada ciclo (R5)');
ok(/_protEmCurso\.Contains\s*\(\s*intentId\s*\)/.test(onFill), 'T3d OnFillEntrada: perna com chamada ao broker em curso fora do lock → fill vira orfao');

// T3e (V2, 2026-10-01) escrita em campo do JObject de execucao (`e["..."] =`) so sob lock(_protGate): GravarExecucoes (thread do NT8,
//     outra perna) serializa todos os registros sob o lock — escrita fora dele poderia coincidir com a serializacao
const violE = [];
{
  const re = /\be\s*\[\s*"[^"]*"\s*\]\s*=(?!=)/g;
  for (let m; (m = re.exec(src));) if (!travado[m.index]) violE.push('@' + linhaEm(m.index) + '(' + metodoEm(m.index) + ')');
}
ok(violE.length === 0, 'T3e nenhuma escrita em campo de registro de execucao (e["..."] =) fora de lock(_protGate)', violE.length ? violE.join(' ') : null);

console.log('RESULTADO race estrutural: pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
