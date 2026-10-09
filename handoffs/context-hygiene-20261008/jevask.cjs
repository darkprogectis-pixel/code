// one JEV query: node jevask.cjs <BASE>  (reads <BASE>_INPUT.txt + <BASE>_QUESTIONS.json, writes <BASE>_RESULT.json)
const fs = require('fs'), path = require('path'), os = require('os');
const lib = require(path.join(os.homedir(), '.claude', 'alfaomega-context', 'scripts', 'lib.js'));
const base = process.argv[2];
(async () => {
  const state = lib.sanitize(fs.readFileSync(base + '_INPUT.txt', 'utf8'));
  const questions = JSON.parse(fs.readFileSync(base + '_QUESTIONS.json', 'utf8'));
  const res = await lib.jevAsk({ state, questions, purpose: path.basename(base) });
  fs.writeFileSync(base + '_RESULT.json', JSON.stringify(res, null, 1));
  const a = res.answers || {};
  console.log(res.request_id, res.model, Object.keys(a).map((k) => `${k}=${a[k].choice}(${a[k].confidence})`).join(' '));
})().catch((e) => { console.error('JEV_ERROR', String(e.message).slice(0, 300)); process.exit(3); });
