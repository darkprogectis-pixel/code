// ACCOUNT BINDING 2026-10-05 — fiacao ESTRUTURAL (leitura de codigo; nada executa, nenhuma conta, nenhuma ordem).
// Arvore efetiva = staging (lote) sobre o live (arquivos fora do lote, SOMENTE LEITURA). O comportamento do AoRoboAtivos
// real e exercitado em C# (ProgramAccount.cs); aqui se prova por onde a conta passa no Robo/OrderWatch/Gates/Positions/Trader/Copy.
const fs = require('fs'), path = require('path');
const STGA = path.join(__dirname, 'staging', 'AddOns');
const LIVA = 'C:/Users/ADM/Documents/NinjaTrader 8/bin/Custom/AddOns';
const ANTA = 'C:/Users/ADM/AppData/Local/InvictusJevCode/fix-backups/account-p1s-20261005/before/AddOns';
let fails = 0, oks = 0;
const ok = (c, n) => { if (c) oks++; else { fails++; console.log('  FAIL ' + n); } };
const ler = f => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const efetivo = f => fs.existsSync(path.join(STGA, f)) ? path.join(STGA, f) : path.join(LIVA, f);
const noLote = f => fs.existsSync(path.join(STGA, f)) && fs.existsSync(path.join(ANTA, f));
const semComentario = s => s.split('\n').map(l => { const i = l.indexOf('//'); return i < 0 ? l : l.slice(0, i); }).join('\n');
const conta = (s, re) => (s.match(re) || []).length;
function bloco(src, ancora) {
  const i = src.indexOf(ancora); if (i < 0) return null;
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); } }
  return null;
}
const robo = ler(efetivo('AlfaOmegaRobo.cs')), ow = ler(efetivo('AlfaOmegaRoboOrderWatch.cs')), atv = ler(efetivo('AlfaOmegaRoboAtivos.cs'));
const gates = ler(efetivo('AlfaOmegaRoboGates.cs')), posi = ler(efetivo('AlfaOmegaRoboPositions.cs')), trader = ler(efetivo('AlfaOmegaTrader.cs'));

// ── ACC05 — zero fallback / zero hardcode de conta ──
ok(!/ContaPadrao/.test(semComentario(atv)), 'ACC05 AoRoboAtivos: identificador ContaPadrao AUSENTE do codigo');
for (const [n, s] of [['Ativos', atv], ['OrderWatch', ow], ['Gates', gates], ['Positions', posi], ['Trader', trader]])
  ok(!/Sim101/.test(semComentario(s)), `ACC05 ${n}: nenhum "Sim101" fora de comentario`);
const sim = semComentario(robo).split('\n').filter(l => /Sim101/.test(l));
ok(sim.every(l => !/Nt8Account\s*=|"account"|ContaDe|FindAccount|Get\(/.test(l)), `ACC05 Robo: ${sim.length} mencao(oes) a Sim101 fora de comentario, nenhuma em caminho de conta (texto)`);
ok(conta(robo, /\{ "account", "[^"]*" \}/g) === 0, 'ACC05/EXEC02 Robo: nenhum body com conta literal');

// ── ACC01-04 / POS01-02 / EXEC01-02 — a MESMA conta do ativo no guard, no dedup e no submit ──
const ent = robo.slice(robo.indexOf('AoRoboAccount c = AoRoboAtivos.ContaConfigurada(alvo.Account)') > 0 ? robo.indexOf('AoRoboAccount c = AoRoboAtivos.ContaConfigurada(alvo.Account)') : 0);
ok(/AoRoboAccount c = AoRoboAtivos\.ContaConfigurada\(alvo\.Account\)/.test(robo), 'ACC04 Robo: conta da perna = ContaConfigurada(alvo.Account) (ativos.json), sem alternativa');
ok(/PositionState = AoRoboPositions\.Get\(c\.Nt8Account, agora\),/.test(robo), 'ACC01-03/POS01 position_guard le SO a posicao da conta do ativo (AoRoboPositions.Get(c.Nt8Account))');
ok(/new Dictionary<string, AoPositionState>\(StringComparer\.Ordinal\)/.test(posi) && /public static AoPositionState Get\(string accountName, DateTime nowUtc\)/.test(posi), 'ACC01/POS01 AoRoboPositions: cache POR NOME RAW de conta (Ordinal, UNIVERSAL 2026-10-06)');
ok(/AoPosition pos = FindPosition\(st\.Positions, instrument\);/.test(gates), 'POS02 AoRoboGates.position_guard: FindPosition na lista daquela conta + instrumento (politica da mesma conta mantida)');
ok(/JaRegistrada\(tid, c\.Nt8Account, alvo\.Nt8\)/.test(robo), 'ACC07/POS05 dedup/recuperacao por (trade, conta, instrumento)');
ok(/\{ "account", c\.Nt8Account \}, \{ "instrument", instrumento \},/.test(robo), 'ACC04/EXEC01 submit: body.account = c.Nt8Account (a conta do ativo chega identica ao adapter)');
ok(conta(robo, /\(string\)e\["nt8_account"\]/g) >= 1, 'ACC08/POS03-06 reconciliacao/fechamento leem a conta gravada NA perna (e["nt8_account"])');
ok(!noLote('AlfaOmegaRoboGates.cs') && !noLote('AlfaOmegaRoboPositions.cs') && !noLote('AlfaOmegaTrader.cs') && !fs.existsSync(path.join(STGA, 'AlfaOmegaRoboGates.cs')), 'POS/EXEC07-08 Gates, Positions e Trader FORA do lote (live inalterado)');
ok(/if \(requireFlat && pos != null && pos\.MarketPosition != MarketPosition\.Flat\)/.test(trader) && /GUARD_MAX_POSITIONS", "conta ja com "/.test(trader), 'EXEC07/EXEC08 :5152 requireFlat / maxPositions avaliados na conta do pedido');

// ── ACC06 / EXEC03 — conta indisponivel: fail-closed, codigo explicito, nenhuma troca ──
ok(conta(robo, /\{ "code", "ACCOUNT_NOT_AVAILABLE" \}/g) === 2 && /\{ "code", reprovConta\.Key == "nt8_reachable" \? "ACCOUNT_NOT_AVAILABLE" : null \}/.test(robo), 'ACC06 account_skip carrega code ACCOUNT_NOT_AVAILABLE (conta invalida, inalcancavel, sem hook)');
const iInv = robo.indexOf('"blocked:conta_invalida"'), iReach = robo.indexOf('"blocked:" + reprovConta.Key'), iObs = robo.indexOf('"blocked:account_not_available"'), iDed = robo.indexOf('JaRegistrada(tid, c.Nt8Account, alvo.Nt8)'), iExec = robo.indexOf('string mAlvo = ExecutarAlvo(c,');
ok(iInv > 0 && iInv < iReach && iReach < iObs && iObs < iDed && iDed < iExec, 'EXEC03 ordem dos gates por perna: conta_invalida < gates da conta < account_not_available < dedup < ExecutarAlvo');
const gObs = robo.slice(robo.indexOf('bool dryConta ='), iDed);
ok(/if \(!dryConta && !ContaObservavel\(c\.Nt8Account\)\)/.test(gObs) && /continue;\s*\}\s*if \(tid != null &&$/.test(gObs.trimEnd()), 'EXEC03 sem hook de execucao/ordem => continue (perna nao executa); dry-run isento');
ok(/private static bool ContaObservavel\(string nt8Account\)\s*\{\s*return TemHookExecucao\(nt8Account\) && AoRoboOrderWatch\.TemHook\(nt8Account\);/.test(robo), 'ACC06 ContaObservavel = hook de ExecutionUpdate E de OrderUpdate na conta do ativo');
ok(conta(robo, /"blocked:conta_invalida"/g) === conta(ler(path.join(ANTA, 'AlfaOmegaRobo.cs')), /"blocked:conta_invalida"/g), 'ACC06 strings de result existentes inalteradas (consumidores)');

// ── ACC13 / ACC14 — hooks acompanham a conta em uso, sem duplicar ──
const iUso = robo.indexOf('List<string> contasEmUso = ContasEmUso(contas);'), iGar = robo.indexOf('foreach (string contaUso in contasEmUso)'), iCon = robo.indexOf('ConexaoPasso(agora, contasEmUso);');
const laco = bloco(robo, 'foreach (string contaUso in contasEmUso)');
ok(iUso > 0 && iUso < iGar && iGar < iCon && /GarantirHookExecucao\(contaUso\)/.test(laco) && /AoRoboOrderWatch\.Garantir\(contaUso\)/.test(laco), 'ACC13 a CADA ciclo: hooks garantidos para as contas em uso (troca a quente / conta que conecta depois)');
ok(/private static List<string> ContasEmUso\(List<AoRoboAccount> contasCfg\)/.test(robo), 'ACC13 contas em uso derivadas da config vigente (ContasEmUso)');
const gh = bloco(robo, 'private static bool GarantirHookExecucao(string nt8Account)'), go = bloco(ow, 'public static bool Garantir(string nt8Account)');
// (E15b, 2026-10-05) idempotencia por IDENTIDADE do objeto vivo (antes: retorno cedo por NOME — defeito E15b)
const assinaSoSemVivo = (b, dic, ev) => new RegExp('if \\(ReferenceEquals\\(k, alvo\\)\\) \\{ temVivo = true; continue; \\}').test(b)
  && new RegExp('if \\(!temVivo\\)\\s*\\{\\s*EventHandler<\\w+> h = \\w+;\\s*alvo\\.' + ev + ' \\+= h;\\s*' + dic + '\\[alvo\\] = h;').test(b);
ok(/Account alvo = ContaViva\(nt8Account\);/.test(gh) && assinaSoSemVivo(gh, '_hooks', 'ExecutionUpdate') && !/if \(TemHookExecucao\(nt8Account\)\) return true;/.test(gh), 'ACC14 GarantirHookExecucao idempotente pelo OBJETO VIVO (assina so se o vivo nao esta no dicionario, sob lock)');
ok(/Account alvo = ContaViva\(nt8Account\);/.test(go) && assinaSoSemVivo(go, '_hooksOrdem', 'OrderUpdate') && !/if \(TemHook\(nt8Account\)\) return true;/.test(go), 'ACC14 AoRoboOrderWatch.Garantir idempotente pelo OBJETO VIVO (assina so se o vivo nao esta no dicionario, sob lock)');
ok(/if \(alvo == null\) return false;/.test(gh) && /if \(alvo == null\) return false;/.test(go), 'ACC06 conta ausente em Account.All => Garantir = false, nada assinado');
ok(conta(robo, /\.ExecutionUpdate \+= h;/g) === 2 && conta(ow, /\.OrderUpdate \+= h;/g) === 2, 'ACC14 pontos de assinatura: 2 + 2 (boot atras de ContainsKey, ciclo atras de temVivo)');
const temO = bloco(ow, 'public static bool TemHook(string nt8Account)') || '', temR = bloco(robo, 'private static bool TemHookExecucao(string nt8Account)') || '';
ok([temR, temO].every(b => /Account vivo = ContaViva\(nt8Account\);/.test(b) && /if \(ReferenceEquals\(k, vivo\)\) return true;/.test(b) && !/\.Name/.test(b)),
  'E15b HOOK_READY por identidade: TemHookExecucao e TemHook comparam o objeto VIVO de Account.All (ReferenceEquals), nunca o nome da chave');
ok([[gh, /k\.ExecutionUpdate -= _hooks\[k\];/, /_hooks\.Remove\(k\);/], [go, /k\.OrderUpdate -= _hooksOrdem\[k\];/, /_hooksOrdem\.Remove\(k\);/]].every(([b, des, rem]) => des.test(b) && rem.test(b)),
  'E15b DEAD_HOOK_CLEANUP: chave de mesmo nome com objeto antigo => -= + Remove antes de assinar o vivo (Robo e OrderWatch)');
const semLock = semComentario(robo).split('\n').filter(l => /_hooks\b/.test(l) && !/lock \(_hooks\)|private static readonly/.test(l));
const ass = bloco(robo, 'private static void AssinarExecucoes()') || '', des = bloco(robo, 'private static void DesassinarExecucoes()') || '', tem = bloco(robo, 'private static bool TemHookExecucao(string nt8Account)') || '';
ok(conta(ass, /lock \(_hooks\)/g) === 1 && conta(des, /lock \(_hooks\)/g) === 1 && conta(tem, /lock \(_hooks\)/g) === 1 && conta(gh, /lock \(_hooks\)/g) === 1, `ACC14 todo acesso a _hooks sob lock (${semLock.length} linhas de uso em 4 metodos)`);

// ── EXEC05 / EXEC06 — STOP/PLAY inalterado ──
const antes = ler(path.join(ANTA, 'AlfaOmegaRobo.cs'));
ok(conta(robo, /engine_play/g) === conta(antes, /engine_play/g) && conta(robo, /engine_play/g) > 0 && !fs.existsSync(path.join(STGA, 'AlfaOmegaRoboOperacional.cs')), 'EXEC05/EXEC06 gate engine_play (STOP/PLAY) e AoRoboOperacional inalterados');

// ── P20 — prontidao (observabilidade) ──
const pr = bloco(robo, 'private static void ProntidaoPasso(DateTime agora, List<string> contasEmUso)') || '';
for (const k of ['robot_account', 'account_available', 'position_guard', 'execution_ready', 'block_reason', 'play_state', 'account_source'])
  ok(pr.includes('"' + k + '"'), 'P20 robo-prontidao.json expoe ' + k);
ok(!/PlaceCore|CancelCore|ChangeOrdem|\/place|\/cancel/.test(pr) && /^\{\s*try\s*\{/.test(pr) && /catch \{ \}\s*\}$/.test(pr), 'P20 ProntidaoPasso nunca envia/cancela ordem e nunca lanca');
ok(conta(robo, /ProntidaoFile|robo-prontidao\.json/g) >= 2 && !/ProntidaoFile/.test(robo.replace(pr, '').replace(/private static string ProntidaoFile[^\n]*/, '')), 'P20 nenhum gate le o arquivo de prontidao (so o proprio ProntidaoPasso)');

// ── COPY01-03 — Copy Engine fora do lote ──
const copy = fs.readdirSync(LIVA).filter(f => /^AlfaOmegaCopy.*\.cs$/.test(f));
// (2026-10-06) lote RESIDUAL: o Copy Engine pode estar no staging SO com troca de comparador de conta (Ordinal RAW, linha marcada (2026-10-06)); mesma contagem de linhas, nada mais muda
const copyDiffOk = f => { if (!fs.existsSync(path.join(STGA, f))) return true; const L = ler(path.join(LIVA, f)).split('\n'), S = ler(path.join(STGA, f)).split('\n'); if (L.length !== S.length) return false; return S.every((l, i) => l === L[i] || (/Ordinal|\(2026-10-06\)/.test(l) && !/OrdinalIgnoreCase/.test(l))); };
ok(copy.length >= 3 && copy.every(copyDiffOk), `COPY01-03 Copy Engine (${copy.length} arquivos): fora do lote OU so troca de comparador de conta para Ordinal RAW (lote residual 2026-10-06); mapeamento leader/followers inalterado`);
const copyAtrib = copy.flatMap(f => semComentario(ler(path.join(LIVA, f))).split('\n').filter(l => /Sim101/.test(l) && /=\s*"Sim101"|Leader\s*=|Follower/.test(l)));
ok(copyAtrib.length === 0, 'COPY02 Copy Engine: nenhuma conta Sim101 atribuida em codigo (leader/followers so por configuracao)');
ok(/public static AoCeReconcilio Reconciliar\(IList<AoCeContaNt8> nt8, IList<AoCeFollowerInfo> cfg, string/.test(ler(path.join(LIVA, 'AlfaOmegaCopyEngineContas.cs'))), 'COPY01 reconciliacao de contas do Copy por lista explicita (nt8 × cfg × leader)');

console.log(`ACCOUNT_WIRING: checks=${oks + fails} ok=${oks} fail=${fails} => ${fails ? 'FAIL' : 'PASS'}`);
process.exit(fails ? 1 : 0);
