// JARVIS pt-BR speech text: pronunciation lexicon for market jargon + number verbalization. Pure.
export const LEXICON = [
  [/\bHIRO\b/gi, 'Ráirou'], [/\bCall Wall\b/gi, 'Cól Uól'], [/\bPut Wall\b/gi, 'Púti Uól'], [/\bGamma Wall\b/gi, 'Gama Uól'],
  [/\bCall Resistance\b/gi, 'Cól Resistance'], [/\bPut Support\b/gi, 'Púti Support'], [/\bZero Gamma\b/gi, 'Zero Gama'], [/\bHVL\b/g, 'agá vê éle'],
  [/\bGamma\b/gi, 'Gama'], [/\bCharm\b/gi, 'Tchárm'], [/\bVanna\b/gi, 'Vána'], [/\bGEX\b/g, 'guéx'], [/\bDEX\b/g, 'déx'],
  [/\bMNQ\b/g, 'ême ene quê'], [/\bMES\b/g, 'ême é ésse'], [/\bNQ\b/g, 'ene quê'], [/\bES\b/g, 'é ésse'], [/\bSPX\b/g, 'ésse pê xis'], [/\bSPY\b/g, 'ésse pê ípsilon'],
  [/\bFusion\b/gi, 'Fiújon'], [/\bQuant\b/gi, 'Cuónt'], [/\bBot\b/g, 'Bóti'], [/\bα\s*/g, 'alfa '], [/\bJEV\b/g, 'jév'], [/\bRTH\b/g, 'pregão regular'],
  [/\bBUY\b/g, 'compra'], [/\bSELL\b/g, 'venda'], [/\bNO_SIGNAL\b/g, 'sem sinal'], [/\bNEUTRAL\b/g, 'neutro'], [/\bUNKNOWN\b/g, 'desconhecido'],
  [/\bSTALE\b/g, 'desatualizado'], [/\bPARTIAL\b/g, 'parcial'], [/\bOK\b/g, 'ok'], [/\bERROR\b/g, 'com erro'], [/\bUNCALIBRATED\b/g, 'não calibrado'],
];
const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const T = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const H = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function upTo999(n) {
  if (n < 20) return U[n];
  if (n < 100) return T[Math.floor(n / 10)] + (n % 10 ? ' e ' + U[n % 10] : '');
  if (n === 100) return 'cem';
  return H[Math.floor(n / 100)] + (n % 100 ? ' e ' + upTo999(n % 100) : '');
}
export function intWords(n) {
  n = Math.abs(Math.trunc(n));
  if (n < 1000) return upTo999(n);
  if (n < 1e6) { const k = Math.floor(n / 1000), r = n % 1000; return (k === 1 ? 'mil' : upTo999(k) + ' mil') + (r ? (r < 100 || r % 100 === 0 ? ' e ' : ' ') + upTo999(r) : ''); }
  const m = Math.floor(n / 1e6), r = n % 1e6; return (m === 1 ? 'um milhão' : intWords(m) + ' milhões') + (r ? ' ' + intWords(r) : '');
}
// 7775.75 → "sete mil setecentos e setenta e cinco vírgula setenta e cinco"; -0.5 → "menos zero vírgula cinco"
export function numberWords(x, maxDec = 2) {
  if (!Number.isFinite(x)) return String(x);
  const neg = x < 0, s = Math.abs(x).toFixed(maxDec).replace(/\.?0+$/, '');
  const [i, d] = s.split('.');
  let w = intWords(Number(i));
  if (d) w += ' vírgula ' + (d.length === 2 && d[0] !== '0' ? upTo999(Number(d)) : [...d].map((c) => U[Number(c)]).join(' '));
  return (neg ? 'menos ' : '') + w;
}
// Display number in pt-BR (7.775,75).
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('pt-BR', { maximumFractionDigits: d }) : '—');
// Converts display text to speakable text: jargon + numbers in words.
export function toSpeech(text) {
  let t = String(text).replace(/\|/g, '').replace(/\s<\s/g, ' menor que ').replace(/\s>\s/g, ' maior que ').replace(/α\s*/g, 'alfa ');
  t = t.replace(/-?\b\d+\.\d{1,2}\b(?!\d)/g, (m) => (/^\-?\d{1,3}\.\d{3}$/.test(m) ? m : m.replace('.', ',')));
  t = t.replace(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/g, (m) => numberWords(Number(m.replace(/\./g, '').replace(',', '.'))));
  for (const [re, rep] of LEXICON) t = t.replace(re, rep);
  return t.replace(/%/g, ' por cento').replace(/\s+/g, ' ').trim();
}
