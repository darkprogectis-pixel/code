// JARVIS AOT pages client (same origin as JARVIS; read-only). Never blocks: every fetch has a timeout and a visible fallback.
(() => {
  const TOKEN = document.querySelector('meta[name="jarvis-token"]')?.content || '';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cid = Math.random().toString(16).slice(2, 10);
  const tfetch = (url, opt = {}) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };
  const post = (url, body) => tfetch(url, { method: 'POST', headers: { 'x-jarvis-token': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  let ctx = null, speaking = null;
  async function play(audio) {
    if (!audio) return; ctx = ctx || new AudioContext(); await ctx.resume();
    const me = { stopped: false }; speaking = me;
    for (let i = 0; !me.stopped; i++) {
      const r = await tfetch(audio.chunks_url + i).catch(() => null); if (!r || r.status !== 200) break;
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      await new Promise((res) => { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.onended = res; s.start(); });
    }
    if (speaking === me) speaking = null;
  }
  window.JarvisAot = { post, tfetch, play, esc, cid };
  if (document.body.dataset.page !== 'areas') return;

  let areas = [], area = null, timer = null;
  const status = (t) => { $('status').textContent = t; };
  function feed(text, cls) { const f = $('feed'); if (f.classList.contains('muted')) { f.textContent = ''; f.classList.remove('muted'); } const d = document.createElement('div'); d.innerHTML = `<span class="tag">${new Date().toLocaleTimeString()}</span> ${esc(text)}${cls ? ` <span class="tag">${esc(cls)}</span>` : ''}`; f.prepend(d); while (f.children.length > 40) f.lastChild.remove(); }
  function table(obs) {
    $('items').tBodies[0].innerHTML = obs.items.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${esc(i.value)}</td><td>${esc(i.state)}</td><td class="${esc(i.data_state)}">${esc(i.data_state)}</td><td class="tag">${esc(i.provenance)}</td><td>${esc(i.source)}<br><span class="tag">${esc(i.endpoint)}</span></td><td class="num">${i.age_ms == null ? '—' : Math.round(i.age_ms / 1000) + ' s'}</td></tr>`).join('');
  }
  async function tick() {
    if (!area) return;
    try {
      const n = await post('/api/aot/narrate', { area: area.id, mode: $('mode').value, speak: $('voice').checked, cid });
      if (n.error) { status(`AOT indisponível (${n.detail || n.error})`); return; }
      if (n.utterance) feed(n.utterance, n.first ? 'estado atual' : n.events.map((e) => e.cls).join(','));
      if (n.audio) play(n.audio);
      const o = await tfetch(`/api/aot/observe?area=${area.id}`).then((r) => r.json());
      if (o.observation) { table(o.observation); status(o.observation.aot_available ? `observando · ${new Date().toLocaleTimeString()}` : 'AOT indisponível — sem dado inventado'); }
    } catch { status('JARVIS/AOT indisponível'); }
  }
  function select(a) {
    area = a; $('areaLabel').textContent = a.label; $('aotLink').href = `http://127.0.0.1:3600${a.aot_path}`;
    document.querySelectorAll('#areaTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.id === a.id));
    $('feed').textContent = 'carregando…'; $('feed').classList.add('muted'); clearInterval(timer); tick(); timer = setInterval(tick, Math.max(5000, a.cadence_ms));
  }
  $('askForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const text = $('q').value.trim(); if (!text || !area) return;
    $('ans').textContent = '…';
    try { const a = await post('/api/aot/ask', { area: area.id, text, speak: $('voice').checked }); $('ans').innerHTML = a.sentences ? a.sentences.map((s) => `${esc(s.text)} <span class="tag">${esc(s.provenance)}</span>`).join('<br>') : esc(a.error); if (a.audio) play(a.audio); }
    catch { $('ans').textContent = 'JARVIS indisponível'; }
  });
  tfetch('/api/aot/areas').then((r) => r.json()).then((d) => {
    areas = d.areas; $('mode').value = d.default_mode || 'IMPORTANT';
    $('areaTabs').innerHTML = areas.map((a) => `<button class="tab" data-id="${a.id}" title="${esc(a.label)}">${esc(a.button)}</button>`).join('');
    $('areaTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) select(areas.find((a) => a.id === b.dataset.id)); });
    const want = new URLSearchParams(location.search).get('area'); select(areas.find((a) => a.id === want) || areas[0]);
  }).catch(() => status('JARVIS indisponível'));
})();
