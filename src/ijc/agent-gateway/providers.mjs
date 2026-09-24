// Providers de raciocinio do AGENT GATEWAY (plugaveis). Nenhum e obrigatorio: sem provider = NOT_CONFIGURED (estado valido).
// Contrato: { id, status() -> {status, detail}, advise(context, {timeoutMs}) -> Promise<{text, model}> }.
// Chaves SO por variavel de ambiente (nunca em config/Git/log). Provider nunca ve conta, ordem, token do robo.

const SYSTEM_PROMPT = [
  'Você é o assistente ADVISORY do INVICTUS JEV CODE. Explique, em português e em no máximo 6 frases, o estado atual do classificador JEV descrito no JSON.',
  'Regras: você NÃO emite sinal, NÃO sugere compra/venda, NÃO estima probabilidade e NÃO contradiz o motor; o estado do motor é a fonte canônica.',
  'UNKNOWN é estado operacional legítimo (sem regra direcional ativa), não falha. Destaque apenas qualidade de dados, razões e campos não resolvidos.',
].join(' ');
export { SYSTEM_PROMPT };

function notConfigured(id, detail) {
  return { id, status: () => ({ status: 'NOT_CONFIGURED', detail }), advise: async () => { throw Object.assign(new Error('provider nao configurado'), { code: 'NOT_CONFIGURED' }); } };
}

// Claude via SDK oficial (@anthropic-ai/sdk), carregado sob demanda. Sem o pacote instalado => NOT_INSTALLED.
function claudeProvider(cfg) {
  const model = cfg.model || 'claude-opus-5';
  let client = null; let state = { status: 'NOT_CHECKED', detail: null };
  async function ensure() {
    if (client) return client;
    let mod;
    try { mod = await import('@anthropic-ai/sdk'); } catch { state = { status: 'NOT_INSTALLED', detail: 'pacote @anthropic-ai/sdk nao instalado (npm install @anthropic-ai/sdk)' }; throw Object.assign(new Error(state.detail), { code: 'NOT_INSTALLED' }); }
    const Anthropic = mod.default;
    client = new Anthropic(); // credenciais pela cadeia padrao do SDK (env/perfil); nada lido do repo
    state = { status: 'READY', detail: model };
    return client;
  }
  return {
    id: 'claude',
    status: () => state,
    async advise(context, { timeoutMs = 20000 } = {}) {
      const c = await ensure();
      const res = await c.beta.messages.create({
        model, max_tokens: 1024, // saida curta por design (resumo advisory)
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(context) }],
      }, { timeout: timeoutMs, maxRetries: 0 });
      if (res.stop_reason === 'refusal') return { text: null, model: res.model, refused: true };
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text, model: res.model };
    },
  };
}

// Provider OpenAI-compatible generico (Kimi e similares): POST {base}/chat/completions com Bearer da env.
function openAiCompatibleProvider(id, { baseUrl, model, keyEnv }) {
  const key = () => process.env[keyEnv];
  return {
    id,
    status: () => (key() ? { status: 'READY', detail: `${model} @ ${baseUrl}` } : { status: 'NOT_CONFIGURED', detail: `variavel de ambiente ${keyEnv} ausente` }),
    async advise(context, { timeoutMs = 20000 } = {}) {
      if (!key()) throw Object.assign(new Error('provider nao configurado'), { code: 'NOT_CONFIGURED' });
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${key()}` },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(context) }], max_tokens: 800 }),
        });
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { code: r.status === 403 || r.status === 429 ? 'QUOTA_OR_RATE_LIMIT' : `HTTP_${r.status}` });
        const j = await r.json();
        return { text: String(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim(), model };
      } finally { clearTimeout(t); }
    },
  };
}

export const PROVIDER_REGISTRY = {
  none: { kind: 'NONE', note: 'sem provider: Analyzer 100% funcional' },
  claude: { kind: 'IMPLEMENTED', note: 'SDK oficial @anthropic-ai/sdk (opcional; carregado sob demanda)' },
  kimi: { kind: 'IMPLEMENTED', note: 'OpenAI-compatible (KIMI_API_KEY)' },
  'openai-compatible': { kind: 'IMPLEMENTED', note: 'generico: base_url + key_env' },
  hermes: { kind: 'FUTURE_PROVIDER_OPTION', note: 'nao instalado nem avaliado localmente' },
};

export function createProvider(cfg = {}) {
  const id = cfg.id || 'none';
  if (id === 'none') return notConfigured('none', 'nenhum provider configurado (valido)');
  if (id === 'claude') return claudeProvider(cfg);
  if (id === 'kimi') return openAiCompatibleProvider('kimi', { baseUrl: cfg.base_url || 'https://api.moonshot.ai/v1', model: cfg.model || 'kimi-k3', keyEnv: 'KIMI_API_KEY' });
  if (id === 'openai-compatible') return openAiCompatibleProvider('openai-compatible', { baseUrl: cfg.base_url, model: cfg.model, keyEnv: cfg.key_env || 'OPENAI_COMPATIBLE_API_KEY' });
  if (id === 'hermes') return notConfigured('hermes', 'FUTURE_PROVIDER_OPTION: nao instalado/avaliado');
  return notConfigured(id, 'provider desconhecido');
}

// Adaptadores de MENSAGEM (entrega ao operador). OpenClaw: apenas registrado; nunca cerebro, nunca acesso a ordens.
export const MESSAGING_ADAPTERS = {
  openclaw: { status: 'REGISTERED_NOT_WIRED', role: 'OPTIONAL_MESSAGING_ADAPTER (alertas/mensagens/consulta remota futura)', order_access: 'NONE' },
};
