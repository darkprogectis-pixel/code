// Envio generico ao JEV: node jev_send.js <TAG> [--dry] — le JEV_<TAG>_INPUT.txt (state) e JEV_<TAG>_QUESTIONS.json; grava JEV_<TAG>_RESULT.json
const fs = require('fs'); const L = require('C:/Users/ADM/.claude/alfaomega-context/scripts/lib.js');
const D = __dirname + '/..', TAG = process.argv[2], dry = process.argv.includes('--dry');
const OUT = D + '/JEV_' + TAG + '_RESULT.json';
if (fs.existsSync(OUT) && !dry) { console.log('JA ENVIADO: ' + fs.readFileSync(OUT, 'utf8')); process.exit(0); }
const st0 = fs.readFileSync(D + '/JEV_' + TAG + '_INPUT.txt', 'utf8'), Q = JSON.parse(fs.readFileSync(D + '/JEV_' + TAG + '_QUESTIONS.json', 'utf8'));
const st = L.sanitize(st0);
if (st.removedLines !== 0) { console.log('ABORT removedLines=' + st.removedLines); process.exit(3); }
if (st.redactions !== 0) { console.log('ABORT redactions=' + st.redactions); process.exit(4); }
if (dry) { L.assertClean(JSON.stringify({ state: st, questions: Q })); L.validateQuestions(Q); console.log('DRY_OK chars=' + st0.length); process.exit(0); }
(async () => {
  try {
    const { response, meta } = await L.jevAsk({ state: st, questions: Q, purpose: 'invictus-temporal-clustering-' + TAG.toLowerCase(), sessionId: '6b86565f-0ed1-474b-85ff-2c43e1c80f48' });
    const out = { request_id: meta.request_id, model: response.model, answers: response.answers };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
  } catch (e) { console.log('ERROR', String(e.message).slice(0, 400)); }
})();
