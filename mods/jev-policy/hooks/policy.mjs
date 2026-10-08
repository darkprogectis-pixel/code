// jev-policy — pecas PURAS (sem mods API): filtro local de risco, sanitizacao, perguntas tipadas e leitura das respostas.
// Regras do JEV MODS DESIGN (req_01a11dba02127c88bfbdaabd77a1cafd): OBSERVAR; minimo sanitizado; sem segredo no livro; falha segura.

/** Padroes locais de comando de risco. So um comando que casa aqui gera chamada ao Jev (R7: custo). */
export const RISKY = [
  ['rm_recursivo', /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/],
  ['remove_item_recurse', /\bRemove-Item\b[^|;\n]*-Recurse\b/i],
  ['rmdir_del_recursivo', /\b(rd|rmdir|del)\b[^|;\n]*\s\/s\b/i],
  ['git_reset_hard', /\bgit\b[^|;\n]*\breset\b[^|;\n]*--hard\b/],
  ['git_clean', /\bgit\b[^|;\n]*\bclean\b[^|;\n]*\s-[a-zA-Z]*[fdxX]/],
  ['git_push_force', /\bgit\b[^|;\n]*\bpush\b[^|;\n]*(--force\b|--force-with-lease\b|\s-f\b|\s\+\S+)/],
  ['git_checkout_descarta', /\bgit\b[^|;\n]*\b(checkout|restore)\b[^|;\n]*\s--\s+\.(\s|$)/],
  ['git_branch_delete', /\bgit\b[^|;\n]*\bbranch\b[^|;\n]*\s-D\b/],
  ['shred_ou_formatacao', /\b(shred|mkfs\S*|Format-Volume|Clear-Disk|diskpart)\b/i],
  ['sql_destrutivo', /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*(;|$))/i],
  ['deploy_producao', /\b(deploy|publish|release)\b[^|;\n]*\b(prod|production|producao)\b|\b(kubectl|terraform|helm)\b[^|;\n]*\b(apply|destroy|delete|uninstall)\b/i],
  ['servidor_remoto_privilegiado', /\bssh\b[^|;\n]*\broot@/i],
  ['encerrar_processo', /\b(taskkill|Stop-Process|kill\s+-9|pkill)\b/i],
  ['fora_do_projeto', /\b(rm|del|Remove-Item|mv|Move-Item|cp|Copy-Item)\b[^|;\n]*(C:\\Windows|C:\\Program Files|\/etc\/|\/usr\/|~\/\.ssh|\\\.ssh\\)/i],
]

/** Primeiro padrao local que casa, ou null. */
export function riskOf(command) {
  const c = String(command || '')
  for (const [label, re] of RISKY) if (re.test(c)) return label
  return null
}

const ASSIGN = /\b(password|passwd|senha|api[_-]?key|apikey|authorization|bearer|secret|token|credential|credencial)\b(\s*[:=]\s*|\s+)["'`]?[^\s"'`,;)]+/gi
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{6,}/gi
const LONGHEX = /\b[A-Fa-f0-9]{24,}\b/g
const LONGB64 = /\b[A-Za-z0-9+/_-]{32,}={0,2}/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Texto minimo para sair da maquina: segredos e identificadores redigidos, tamanho limitado (R2). */
export function sanitize(text, max = 300) {
  let s = String(text || '').replace(/\s+/g, ' ').trim()
  s = s.replace(BEARER, (m, k) => k + ' <REDACTED>').replace(ASSIGN, (m, k) => k + '=<REDACTED>').replace(EMAIL, '<EMAIL>').replace(LONGHEX, '<HEX>').replace(LONGB64, '<B64>')
  return s.length > max ? s.slice(0, max) + ' …[cortado]' : s
}

/** true quando o texto ainda parece conter segredo depois de sanitizado (entao nem o resumo e guardado). */
export function looksSecret(text) {
  return /<REDACTED>/.test(sanitize(text, 100000))
}

export const Q_RISCO = {
  risco: { type: 'score', instructions: 'Risco operacional de executar este comando de shell no estado descrito.', criteria: ['baixo', 'moderado', 'alto'] },
  irreversivel: { type: 'noul', instructions: 'O efeito do comando e dificil ou impossivel de desfazer.', criteria: { true: 'Apaga, sobrescreve ou altera algo que nao pode ser reconstruido facilmente (fonte, historico, dados, servidor).', false: 'Atinge so saida de build, cache, temporarios, ou e facilmente desfeito.' } },
  categoria: { type: 'choice', instructions: 'Qual categoria descreve melhor o comando?', criteria: { ARQUIVOS: 'remocao ou sobrescrita de arquivos', GIT: 'reescrita ou descarte de historico ou de trabalho no git', PRODUCAO: 'implantacao ou alteracao em producao ou servidor remoto', PROCESSO: 'encerramento de processo', DADOS: 'banco de dados', OUTRO: 'outro' } },
}

export const Q_DIFF = {
  classe: { type: 'choice', instructions: 'Classifique este conjunto de arquivos alterados. Isto PREPARA o JEV DIFF canonico; nao o substitui.', criteria: { TRIVIAL: 'documentacao, comentarios ou formatacao', FUNCIONAL: 'logica de aplicacao', CRITICO: 'caminho de ordens, dinheiro ou execucao', AUTH_LICENCA: 'autenticacao, licenca ou identidade', PRODUCAO: 'configuracao ou artefato de producao', INFRA: 'build, ferramentas, hooks ou rotacao', SEGURANCA: 'segredos, permissoes ou controles' } },
  criticidade: { type: 'score', instructions: 'Criticidade da revisao necessaria para este conjunto de alteracoes.', criteria: ['baixa', 'media', 'alta'] },
}

export const Q_READY = {
  prontidao: { type: 'choice', instructions: 'Com as evidencias declaradas, a mudanca esta pronta para ser submetida ao JEV FINAL canonico? Isto e so uma pre-avaliacao.', criteria: { A: 'evidencias completas; submeter ao JEV FINAL', B: 'falta evidencia especifica', C: 'nao pronta' } },
  lacuna: { type: 'choice', instructions: 'Qual a principal lacuna de evidencia?', criteria: { NENHUMA: 'nenhuma', TESTES: 'testes', COMPILE: 'compilacao', INESPERADOS: 'arquivos inesperados', ROLLBACK: 'rollback', SEGURANCA: 'seguranca', HANDOFF: 'handoff', DEPLOY: 'risco de implantacao' } },
}

export const Q_HANDOFF = {
  completude: { type: 'score', instructions: 'Completude deste handoff para outra sessao continuar o trabalho sem perguntar, a partir do checklist estrutural.', criteria: ['insuficiente', 'parcial', 'completo'] },
  falta: { type: 'choice', instructions: 'O que mais falta no handoff?', criteria: { NADA: 'nada', ESTADO: 'estado atual', EVIDENCIAS: 'evidencias', ARQUIVOS: 'arquivos e caminhos', COMMITS: 'commits', BLOQUEIOS: 'bloqueios', PROXIMO_PASSO: 'proximo passo exato' } },
}

/** Checklist estrutural LOCAL de um handoff: so booleanos e contagens saem da maquina, nunca o texto (R2). */
export function handoffChecklist(text) {
  const t = String(text || '')
  return {
    tamanho_caracteres: t.length,
    tem_status: /\bSTATUS\b/i.test(t),
    tem_proximo_passo: /(EXACT_NEXT_STEP|PR[OÓ]XIMO PASSO|\bNEXT\b)/i.test(t),
    tem_commit: /\b[0-9a-f]{7,40}\b/.test(t) && /commit/i.test(t),
    tem_caminhos: /([A-Za-z]:\\|\/[a-z]+\/)[^\s`]+/.test(t),
    tem_bloqueios: /(BLOCKER|BLOQUEIO|PEND[EÊ]NCIA)/i.test(t),
    tem_evidencias: /(sha256|PASS|FAIL|req_[0-9a-z]{6,})/i.test(t),
    tem_data: /\b20\d{2}[-/]?\d{2}[-/]?\d{2}\b/.test(t),
    tem_decisao_jev: /\bJEV\b/.test(t),
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Le uma resposta tipada sem confiar no formato: valor, confianca e probabilidades NORMALIZADAS (ou null). */
export function readAnswer(a) {
  if (!a || typeof a !== 'object') return { valor: null, confianca: null, probabilidades: null }
  const valor = a.choice ?? (num(a.score) !== null ? a.score : (num(a.noul) !== null ? a.noul : null))
  let probabilidades = null
  if (a.probabilities && typeof a.probabilities === 'object') {
    const e = Object.entries(a.probabilities).filter(([, v]) => num(v) !== null && v >= 0)
    const soma = e.reduce((s, [, v]) => s + v, 0)
    if (e.length && soma > 0) probabilidades = Object.fromEntries(e.map(([k, v]) => [k, Math.round((v / soma) * 1000) / 1000]))
  }
  return { valor, confianca: num(a.confidence), probabilidades }
}

/** Rotulo de risco a partir da nota 0..2; confianca ausente e tratada como desconhecida, nunca como alta. */
export function riskLabel(ans) {
  const r = readAnswer(ans)
  if (r.valor === null || typeof r.valor !== 'number') return { rotulo: 'desconhecido', ...r }
  return { rotulo: r.valor >= 1.5 ? 'alto' : r.valor >= 0.75 ? 'moderado' : 'baixo', ...r }
}

/** Entrada do livro de decisoes: sem comando inteiro; resumo so quando nao ha padrao de segredo (R9). */
export function ledgerEntry({ agora, tipo, padrao, texto, respostas, erro, ms, modelo }) {
  const e = { ts: agora, tipo, padrao: padrao || null, resumo: looksSecret(texto) ? '<omitido: padrao de segredo>' : sanitize(texto, 120), ms: num(ms), modelo: modelo || null }
  if (erro) e.erro = String(erro).replace(ASSIGN, '<REDACTED>').slice(0, 160)
  if (respostas) e.respostas = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, readAnswer(v)]))
  return e
}

/** Evidencias "chave=valor" de /jev-ready, limitadas a chaves conhecidas e valores curtos. */
export function parseEvidence(args) {
  const ok = ['tests', 'compile', 'unexpected', 'rollback', 'security', 'handoff', 'deploy']
  const out = {}
  for (const m of String(args || '').matchAll(/\b([a-z]+)\s*=\s*([A-Za-z0-9/._-]{1,24})/g)) if (ok.includes(m[1])) out[m[1]] = m[2]
  return out
}
