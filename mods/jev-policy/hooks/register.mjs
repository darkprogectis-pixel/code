// jev-policy — mod LOCAL do Claude-JEV. Modo OBSERVAR (JEV MODS DESIGN req_01a11dba02127c88bfbdaabd77a1cafd):
//  · nunca aprova, nunca nega, nunca responde no lugar da ferramenta: todo tool.call e repassado com next(e) sem alteracao;
//  · so comandos que casam com o filtro local de risco geram UMA chamada ao Jev ($.jev do mod "jev"), com estado minimo sanitizado;
//  · falha/demora/ausencia do provedor => apenas registra e segue (falha segura);
//  · as decisoes sao OBSERVACAO: a autoridade continua sendo o JEV canonico do projeto (DESIGN / DIFF / FINAL) e os hooks existentes.
import { Q_DIFF, Q_HANDOFF, Q_READY, Q_RISCO, handoffChecklist, ledgerEntry, parseEvidence, riskLabel, riskOf, sanitize } from './policy.mjs'

const MAX_POR_SESSAO = 40      // teto de chamadas ao Jev por sessao (R7)
const MAX_LIVRO = 300          // entradas guardadas
const ESPERA_MS = 8000         // quanto o registro espera a resposta depois que a ferramenta ja rodou
let chamadas = 0
const cache = new Map()        // comando sanitizado -> respostas (R7: uma chamada por comando)

async function perguntar($, estado, perguntas) {
  // Sem o mod "jev" carregado a chamada abaixo lanca; quem chama trata como falha segura.
  if (chamadas >= MAX_POR_SESSAO) throw new Error('teto de chamadas ao Jev por sessao atingido')
  chamadas += 1
  const t0 = Date.now()
  const r = await $.jev.ask({ state: estado, questions: perguntas })
  return { respostas: r.answers, modelo: r.model, ms: Date.now() - t0 }
}

async function gravar($, entrada) {
  try {
    const livro = (await $.store.get('livro')) || []
    livro.push(entrada)
    await $.store.set('livro', livro.slice(-MAX_LIVRO))
  } catch { /* o livro nunca derruba o fluxo */ }
}

const limite = (ms) => new Promise((resolve) => setTimeout(() => resolve({ erro: 'tempo esgotado' }), ms))

export function register(on) {
  on('session.start', async ($, e, next) => {
    for (const c of [
      { name: 'jev-ledger', description: 'Livro de decisoes do jev-policy (ultimas entradas)', argumentHint: '[n]' },
      { name: 'jev-diff', description: 'Pre-classifica o diff atual com o Jev (prepara o JEV DIFF canonico; nao o substitui)' },
      { name: 'jev-ready', description: 'Pre-avalia prontidao: tests=.. compile=.. unexpected=.. rollback=.. security=.. handoff=.. deploy=..', argumentHint: 'chave=valor ...' },
      { name: 'jev-handoff', description: 'Avalia a completude de um handoff (so o checklist estrutural sai da maquina)', argumentHint: '<arquivo>' },
    ]) { try { await $.command.register(c) } catch { /* nome ja usado: segue */ } }
    return next(e)
  })

  // A — risco de comando + B — acao destrutiva: OBSERVAR. A ferramenta roda como rodaria sem o mod.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const comando = typeof e.command === 'string' ? e.command : ''
    const padrao = riskOf(comando)
    if (!padrao) return next(e)
    const chave = sanitize(comando, 300)
    const pendente = cache.has(chave)
      ? Promise.resolve(cache.get(chave))
      : perguntar($, { comando: chave, padrao_local: padrao, ferramenta: e.tool }, Q_RISCO).then((r) => { cache.set(chave, r); return r }).catch((err) => ({ erro: err && err.message ? err.message : String(err) }))
    const resultado = await next(e)   // permissoes, hooks existentes e a propria ferramenta decidem; o mod nao interfere
    const d = await Promise.race([pendente, limite(ESPERA_MS)])
    const agora = new Date().toISOString()
    await gravar($, ledgerEntry({ agora, tipo: 'tool_risk', padrao, texto: comando, respostas: d.respostas, erro: d.erro, ms: d.ms, modelo: d.modelo }))
    try {
      if (d.respostas) { const r = riskLabel(d.respostas.risco); $.ui.log(`risco ${r.rotulo}${r.confianca === null ? '' : ' (conf ' + r.confianca.toFixed(2) + ')'} · padrao ${padrao} · observacao, nao bloqueia`) }
      else $.ui.log(`sem classificacao (${String(d.erro).slice(0, 60)}) · padrao ${padrao} · comando seguiu o fluxo normal`)
    } catch { /* sem interface: segue */ }
    return resultado
  }).catch(async ($, e, next) => next(e))   // falha do proprio hook: a chamada segue o fluxo normal (nunca bloqueia)

  on('command.run', { command: 'jev-ledger' }, async ($, e) => {
    const n = Math.min(50, Math.max(1, parseInt(e.args, 10) || 10))
    const livro = ((await $.store.get('livro')) || []).slice(-n)
    if (!livro.length) return { text: 'jev-policy: livro vazio.' }
    return { text: 'jev-policy — livro de decisoes (observacao; autoridade = JEV canonico)\n' + livro.map((x) => `${x.ts} ${x.tipo} ${x.padrao || ''} ${x.erro ? 'ERRO ' + x.erro : JSON.stringify(Object.fromEntries(Object.entries(x.respostas || {}).map(([k, v]) => [k, v.valor])))} | ${x.resumo}`).join('\n') }
  })

  // D — classificacao de diff: so nomes de arquivo e contagens saem da maquina.
  on('command.run', { command: 'jev-diff' }, async ($, e) => {
    try {
      const cwd = await $.session.cwd()
      const run = await $.process.run(['git', 'diff', '--numstat', 'HEAD'], { cwd, timeoutMs: 15000 })
      const linhas = String(run.stdout || '').split('\n').filter(Boolean).slice(0, 60).map((l) => { const [a, r, f] = l.split('\t'); return { arquivo: sanitize(f, 140), mais: a, menos: r } })
      if (!linhas.length) return { text: 'jev-policy: nenhum arquivo alterado em relacao a HEAD.' }
      const d = await perguntar($, { arquivos_alterados: linhas, total: linhas.length }, Q_DIFF)
      await gravar($, ledgerEntry({ agora: new Date().toISOString(), tipo: 'diff_class', texto: linhas.length + ' arquivos', respostas: d.respostas, ms: d.ms, modelo: d.modelo }))
      const c = d.respostas.classe || {}, k = d.respostas.criticidade || {}
      return { text: `jev-policy /jev-diff (PRE-classificacao; o JEV DIFF canonico continua obrigatorio)\nclasse = ${c.choice} (conf ${c.confidence ?? 'n/d'}) · criticidade = ${k.score ?? 'n/d'} de 2 · ${linhas.length} arquivos` }
    } catch (err) { return { text: 'jev-policy /jev-diff: sem classificacao (' + String(err && err.message || err).slice(0, 120) + '). Siga o JEV DIFF canonico.' } }
  })

  // E — prontidao: so as evidencias declaradas (chave=valor curtos).
  on('command.run', { command: 'jev-ready' }, async ($, e) => {
    const ev = parseEvidence(e.args)
    if (!Object.keys(ev).length) return { text: 'uso: /jev-ready tests=pass compile=pass unexpected=0 rollback=yes security=pass handoff=yes deploy=none' }
    try {
      const d = await perguntar($, { evidencias_declaradas: ev }, Q_READY)
      await gravar($, ledgerEntry({ agora: new Date().toISOString(), tipo: 'readiness', texto: JSON.stringify(ev), respostas: d.respostas, ms: d.ms, modelo: d.modelo }))
      const p = d.respostas.prontidao || {}, l = d.respostas.lacuna || {}
      return { text: `jev-policy /jev-ready (PRE-avaliacao; o JEV FINAL canonico continua obrigatorio)\nprontidao = ${p.choice} (conf ${p.confidence ?? 'n/d'}) · lacuna = ${l.choice}` }
    } catch (err) { return { text: 'jev-policy /jev-ready: sem avaliacao (' + String(err && err.message || err).slice(0, 120) + ').' } }
  })

  // F — qualidade de handoff: o texto NAO sai da maquina; so o checklist estrutural.
  on('command.run', { command: 'jev-handoff' }, async ($, e) => {
    const arq = String(e.args || '').trim()
    if (!arq) return { text: 'uso: /jev-handoff <caminho do handoff>' }
    try {
      const texto = await $.fs.read(arq)
      const chk = handoffChecklist(typeof texto === 'string' ? texto : (texto && texto.text) || '')
      const d = await perguntar($, { checklist_estrutural: chk }, Q_HANDOFF)
      await gravar($, ledgerEntry({ agora: new Date().toISOString(), tipo: 'handoff_quality', texto: 'handoff ' + chk.tamanho_caracteres + ' caracteres', respostas: d.respostas, ms: d.ms, modelo: d.modelo }))
      const c = d.respostas.completude || {}, f = d.respostas.falta || {}
      return { text: `jev-policy /jev-handoff (observacao; nao altera a rotacao)\ncompletude = ${c.score ?? 'n/d'} de 2 (conf ${c.confidence ?? 'n/d'}) · falta = ${f.choice}\nchecklist = ${JSON.stringify(chk)}` }
    } catch (err) { return { text: 'jev-policy /jev-handoff: sem avaliacao (' + String(err && err.message || err).slice(0, 120) + ').' } }
  })
}
