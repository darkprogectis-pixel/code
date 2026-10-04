// JARVIS deterministic intent router (pt-BR) + glossary (term ⇒ source/field). No LLM. Pure.
export const INTENTS = ['CANCEL', 'DIRECT_FIELD', 'LEVEL_QUERY', 'PRESSURE_QUERY', 'SOURCE_STATUS', 'COMPARISON', 'FUSION_EXPLANATION', 'CHANGE_QUERY', 'HISTORICAL_QUERY', 'MARKET_SUMMARY', 'FOLLOW_UP', 'KNOWLEDGE_QUERY', 'CROSS_SOURCE', 'UNKNOWN'];
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Source aliases (α names, vendor names, common STT spellings).
export const SOURCE_ALIASES = {
  quant: ['quant', 'quanti', 'cuant', 'consolidator', 'consolidador', 'alfa quant'],
  gamma: ['gamma', 'gama', 'spotgamma', 'spot gamma', 'alfa gamma'],
  bot: ['bot', 'gexbot', 'gex bot', 'gammagex', 'robo', 'alfa bot'],
  q: ['menthorq', 'menthor', 'mentor q', 'alfa q', 'o q', 'fonte q', 'agente q'],
  data: ['quantdata', 'quant data', 'data', 'dados', 'alfa data'],
  fusion: ['fusion', 'fusao', 'fiujon', 'sinal final', 'sinal agregado', 'agregado'],
};
// Level names (as published in envelope.levels) ⇒ aliases.
export const LEVEL_ALIASES = {
  'Call Wall': ['call wall', 'col wall', 'parede de call', 'callwall'], 'Put Wall': ['put wall', 'puti wall', 'parede de put', 'putwall'],
  'Zero Gamma': ['zero gamma', 'zero gama', 'gamma zero', 'flip de gamma', 'zero g'], 'Call Resistance': ['call resistance', 'resistencia de call'],
  'Put Support': ['put support', 'suporte de put'], 'HVL': ['hvl', 'high vol level'], 'Gamma Wall 0DTE': ['gamma wall'], 'Hedge Wall': ['hedge wall'],
  'Key Gamma Strike': ['key gamma', 'strike chave'], 'Day Max': ['maxima do dia', 'day max'], 'Day Min': ['minima do dia', 'day min'],
};
// Field terms ⇒ {source, field} (fields that exist in the Alpha envelopes' evidence).
export const FIELD_ALIASES = [
  { re: /\b(hiro|rairou|hairo|hiru)\b/, source: 'gamma', field: 'hiro.slope_15m' },
  { re: /\bcharm\b|\btcharm\b|\bcharme\b/, source: 'bot', field: 'zcharm' }, { re: /\bvanna\b|\bvana\b/, source: 'bot', field: 'zvanna' },
  { re: /\bdex\b/, source: 'bot', field: 'net_dex' }, { re: /\b(gex|regime de gamma|condicao de gamma)\b/, source: 'bot', field: 'gamma_condition' },
  { re: /\bscore\b/, source: 'data', field: 'score' }, { re: /\b(s1|agressao)\b/, source: 'data', field: 'primary.S1' }, { re: /\bmag ?7\b/, source: 'data', field: 'mag7.score' },
];
export const MARKETS = { es: 'ES', mes: 'ES', nq: 'NQ', mnq: 'NQ', spx: 'SPX', spy: 'SPY' };

const has = (t, words) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(t));
export function findSources(t) {
  const out = [];
  for (const [s, al] of Object.entries(SOURCE_ALIASES)) if (has(t, al)) out.push(s);
  // "quant data" is α Data, not α Quant + α Data
  if (out.includes('data') && out.includes('quant') && /quant ?data/.test(t) && !/\bquant\b(?! ?data)/.test(t.replace(/quant ?data/g, ''))) out.splice(out.indexOf('quant'), 1);
  return out;
}
export const findLevel = (t) => Object.entries(LEVEL_ALIASES).find(([, al]) => al.some((a) => t.includes(a)))?.[0] ?? null;
export const findField = (t) => FIELD_ALIASES.find((f) => f.re.test(t)) || null;
export const findMarkets = (t) => [...new Set(t.split(' ').filter((w) => MARKETS[w]).map((w) => MARKETS[w]))];

// Knowledge (course/skill) questions: definitional phrasing without live-value cues. Answered from the skill corpora, not the live state.
export const KNOWLEDGE_RE = /(^| )(o que (e|sao|significa|quer dizer)|que e (o|a)|significa\w*|defin\w*|conceito\w*|expli\w*|interpreta\w*|para que serve|serve para|usad[oa]s? para|curso|aula|ensina\w*)( |$)/;
export const LIVE_CUE_RE = /(^| )(onde|agora|atual|atualmente|valor|quanto|neste momento|hoje|nivel atual)( |$)/;
export const CROSS_RE = /(compar|diferenca|diferem|ambas|ambos|as duas fontes|cada fonte)/;
const KNOWLEDGE_VENDORS = [/(^| )(spot ?gamm?a|alfa gamm?a)( |$)/, /(^| )(menth?or ?q|mentor que|menthor|alfa q)( |$)/];

export function route(text, mem = {}) {
  const t = norm(text);
  const slots = { sources: findSources(t), level: findLevel(t), field: findField(t), markets: findMarkets(t) };
  const I = (intent, conf) => ({ intent, confidence: conf, slots, text: t });
  if (!t) return I('UNKNOWN', 0);
  if (/^(pare|para|parar|cancela|cancelar|silencio|chega|stop)\b/.test(t)) return I('CANCEL', 1);
  if (/(por que|porque|explica|explique|justifica|razao|motivo)/.test(t) && (slots.sources.includes('fusion') || /sinal/.test(t))) return I('FUSION_EXPLANATION', 0.9);
  if (KNOWLEDGE_RE.test(t) && !LIVE_CUE_RE.test(t)) {
    const both = KNOWLEDGE_VENDORS.every((re) => re.test(t));
    return I(both || CROSS_RE.test(t) ? 'CROSS_SOURCE' : 'KNOWLEDGE_QUERY', 0.85);
  }
  if (/(compar|mais forte|mais fraco|versus|\bvs\b|diferenca entre)/.test(t) || (slots.sources.filter((s) => s !== 'fusion').length >= 2 && /(e o|e a|ou)/.test(t)) || slots.markets.length >= 2) return I('COMPARISON', 0.85);
  if (/(virou|mudou|flip|inverteu|trocou|mudanca)/.test(t)) return I('CHANGE_QUERY', 0.85);
  if (/(historico|ultimos|ultimas|mais cedo|ao longo|hoje inteiro|quantas vezes)/.test(t)) return I('HISTORICAL_QUERY', 0.8);
  if (/(status|saude|online|offline|parcial|stale|atrasad|fresc|funcionando|caiu|erro)/.test(t)) return I('SOURCE_STATUS', 0.85);
  if (slots.level || /(onde esta|onde fica|nivel|niveis|suporte|resistencia)/.test(t)) return I('LEVEL_QUERY', slots.level ? 0.9 : 0.7);
  if (slots.field) return I('DIRECT_FIELD', 0.85);
  if (/(resumo|panorama|como esta o mercado|visao geral|situacao geral|como estamos)/.test(t)) return I('MARKET_SUMMARY', 0.85);
  if (/(pressao|comprador|compradora|vendedor|vendedora|direcao|sinal|lado|bullish|bearish|alta|baixa)/.test(t)) return I('PRESSURE_QUERY', 0.8);
  if (mem.last && (/^e (o|a|os|as|no|na)?\b/.test(t) || t.split(' ').length <= 3) && (slots.sources.length || slots.level || slots.field)) return { ...I('FOLLOW_UP', 0.7), follow: mem.last.intent };
  return I('UNKNOWN', 0.2);
}
