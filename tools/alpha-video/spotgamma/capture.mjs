#!/usr/bin/env node
// SpotGamma course capture — raw CDP on the EXISTING central browser (:9222), one dedicated course tab (JEV req_01a103d036a5770f986230e2e6ead2ff).
// Read-only on the site: navigates and reads the DOM; never clicks Start/Submit/Mark-complete, never posts forms, never reads
// cookies/storage/passwords. Captions come from the embedded YouTube player of the logged-in page (no yt-dlp/cookies); the signed
// caption URL is used in-page and never stored. Course content is UNTRUSTED_EVIDENCE: stored as data, never executed.
//   node tools/alpha-video/spotgamma/capture.mjs [--out <raw dir>] [--tab <targetId>] [--only <ytid,...>] [--force] [--skip-pages] [--skip-videos]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CFG = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'alpha-video-spotgamma.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = async () => (await fetch(`${CFG.cdp}/json/list`)).json();

async function attach(targetId) {
  const t = (await list()).find((x) => x.id === targetId); if (!t) throw new Error(`TARGET_NOT_FOUND ${targetId}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { r, j } = pend.get(d.id); pend.delete(d.id); d.error ? j(new Error(JSON.stringify(d.error))) : r(d.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pend.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression, timeout = 120000) => { const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout }); if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'EVAL_ERROR'); return res.result.value; };
  return { send, evaluate, close: () => ws.close() };
}
async function go(s, url) {
  await s.send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) { await sleep(500); if ((await s.evaluate('document.readyState')) === 'complete') break; }
  await sleep(1500);
  return s.evaluate('location.href');
}

const EXTRACT = `(()=>{const main=document.querySelector('.mpcs-main')||document.querySelector('main')||document.body;const c=main.cloneNode(true);
c.querySelectorAll('script,style,noscript,.mpcs-sidebar-wrapper,nav,aside').forEach(e=>e.remove());
const iframes=[...main.querySelectorAll('iframe')].map(f=>f.src).filter(Boolean);
const yt=[...new Set(iframes.map(u=>(u.match(/youtube(?:-nocookie)?\\.com\\/embed\\/([A-Za-z0-9_-]{6,})/)||[])[1]).filter(Boolean))];
const isBanner=u=>/SpotGamma-Tools-Best|Subscription-Level-Banner/i.test(u);
const imgs=[...main.querySelectorAll('img')].map(i=>({src:(i.currentSrc||i.src).split('?')[0],alt:i.alt||'',w:i.naturalWidth,h:i.naturalHeight}));
const links=[...main.querySelectorAll('a[href]')].map(a=>({text:a.innerText.trim().slice(0,160),href:a.href.split('#')[0]})).filter(l=>!/\\/courses\\/how-to-use-spotgamma\\/(lessons|quizzes)\\//.test(l.href)&&!/^javascript/.test(l.href));
return {final_url:location.href,doc_title:document.title,text:c.innerText,html:main.innerHTML,iframes:iframes.map(u=>u.split('?')[0]),youtube_ids:yt,
other_embeds:iframes.filter(u=>!/youtube|about:blank|wordpress\\.com\\/widgets/.test(u)).map(u=>u.split('?')[0]),
images:imgs.filter(i=>!isBanner(i.src)),tier_banners:imgs.filter(i=>isBanner(i.src)).map(i=>i.src.split('/').pop()),links,
files:links.filter(l=>/\\.(pdf|xlsx?|csv|zip|docx?|pptx?)(\\?|$)/i.test(l.href)),tables:[...main.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(x=>x.innerText.trim())))}})()`;

export async function capturePages(s, out, { force = false } = {}) {
  fs.mkdirSync(path.join(out, 'pages'), { recursive: true }); fs.mkdirSync(path.join(out, 'quizzes'), { recursive: true });
  await go(s, CFG.course.url);
  const modules = await s.evaluate(`[...document.querySelectorAll('.mpcs-section')].map((sec,i)=>({module:sec.querySelector('.mpcs-section-title-text')?.innerText.trim(),lessons:[...sec.querySelectorAll('li.mpcs-lesson')].map(li=>{const a=li.querySelector('a');return {wp_id:li.id.replace('mpcs-lesson-',''),title:(a?.innerText||'').trim().replace(/\\s+/g,' '),url:a?a.href:null}})}))`);
  // the curriculum is rendered twice (sidebar + main list): keep the first occurrence of each module
  const seen = new Set(), mods = modules.filter((m) => !seen.has(m.module) && seen.add(m.module)).map((m, i) => ({ module_index: i + 1, ...m, lessons: m.lessons.map((l, j) => ({ lesson_index: j + 1, ...l })) }));
  const quizzes = await s.evaluate(`[...new Map([...document.querySelectorAll('a[href*="/quizzes/"]')].map(a=>[a.href,a.innerText.trim().replace(/\\s+/g,' ')])).entries()]`);
  const overview = await s.evaluate(EXTRACT);
  fs.writeFileSync(path.join(out, 'structure.json'), JSON.stringify({ course: CFG.course, captured_at: new Date().toISOString(), doc_title: overview.doc_title, modules: mods, quizzes: quizzes.map(([url, title]) => ({ url, title })) }, null, 1));
  fs.writeFileSync(path.join(out, 'pages', 'course-overview.json'), JSON.stringify({ wp_id: 'course-overview', title: 'Course Overview', module: null, url: CFG.course.url, captured_at: new Date().toISOString(), access_status: 'ACCESSIBLE', ...overview }, null, 1));
  for (const m of mods) for (const l of m.lessons) {
    const f = path.join(out, 'pages', `${l.wp_id}.json`); if (fs.existsSync(f) && !force) continue;
    await go(s, l.url); const d = await s.evaluate(EXTRACT);
    fs.writeFileSync(f, JSON.stringify({ ...l, module: m.module, module_index: m.module_index, captured_at: new Date().toISOString(), access_status: /__gex_auth|\/login/.test(d.final_url) ? 'LOGIN_REDIRECT' : 'ACCESSIBLE', ...d }, null, 1));
    console.log(`page ${l.wp_id} ${m.module} | ${l.title}`);
  }
  for (const [url, title] of quizzes) {
    const slug = url.split('/quizzes/')[1].replace(/\/$/, ''), f = path.join(out, 'quizzes', `${slug}.json`); if (fs.existsSync(f) && !force) continue;
    await go(s, url);
    const d = await s.evaluate(`(()=>{const m=document.querySelector('.mpcs-main')||document.body;const c=m.cloneNode(true);c.querySelectorAll('script,style,.mpcs-sidebar-wrapper,nav,aside').forEach(e=>e.remove());const sec=[...document.querySelectorAll('.mpcs-section')].find(x=>x.querySelector('a[href="'+location.pathname+'"]'));return {final_url:location.href,text:c.innerText,html:m.innerHTML,module:sec?.querySelector('.mpcs-section-title-text')?.innerText.trim()||null}})()`);
    fs.writeFileSync(f, JSON.stringify({ url, title, slug, captured_at: new Date().toISOString(), access_status: /__gex_auth|\/login/.test(d.final_url) ? 'LOGIN_REDIRECT' : 'ACCESSIBLE', interaction: 'NONE (quiz not started, not submitted; answer key not revealed)', ...d }, null, 1));
    console.log(`quiz ${slug} ${d.module}`);
  }
  return mods;
}

export async function captureVideo(s, page, ytid, out) {
  await go(s, page.url);
  let frame = null;
  for (let i = 0; i < 30 && !frame; i++) { frame = (await list()).find((t) => t.type === 'iframe' && t.url.includes(`/embed/${ytid}`)); if (!frame) await sleep(500); }
  if (!frame) throw new Error('EMBED_TARGET_NOT_FOUND');
  const y = await attach(frame.id);
  try {
    const meta = await y.evaluate(`(async()=>{const p=document.querySelector('#movie_player');p.mute();p.playVideo();let pr=null;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));pr=p.getPlayerResponse();if(pr&&pr.videoDetails)break}
      const tracks=(pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[]);const pick=tracks.find(t=>t.languageCode==='en'&&t.kind!=='asr')||tracks.find(t=>t.languageCode==='en')||tracks[0];
      let events=null;if(pick){const j=await (await fetch(pick.baseUrl+'&fmt=json3')).json();events=(j.events||[]).filter(e=>e.segs).map(e=>({t:e.tStartMs,d:e.dDurationMs||0,text:e.segs.map(x=>x.utf8).join('')}))}
      p.pauseVideo();return {status:pr?.playabilityStatus?.status||null,duration_s:Number(pr?.videoDetails?.lengthSeconds||0),title:pr?.videoDetails?.title||null,author:pr?.videoDetails?.author||null,
      tracks:tracks.map(t=>({lang:t.languageCode,kind:t.kind||'manual'})),track:pick?{lang:pick.languageCode,kind:pick.kind||'manual'}:null,events}})()`, 90000);
    fs.mkdirSync(path.join(out, 'captions'), { recursive: true });
    fs.writeFileSync(path.join(out, 'captions', `${ytid}.json`), JSON.stringify({ video_id: ytid, provider: 'youtube', lesson_wp_id: page.wp_id, captured_at: new Date().toISOString(), method: 'embedded-player captionTracks (json3), signed URL not stored', ...meta }, null, 1));
    // representative frames: seek + screenshot clipped to the iframe
    const fr = CFG.frames, dur = meta.duration_s || 60, n = Math.max(fr.min, Math.min(fr.max, Math.floor(dur / fr.every_s)));
    const times = Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * dur * 1000) / n));
    const fdir = path.join(out, 'frames', ytid); fs.mkdirSync(fdir, { recursive: true });
    await s.evaluate(`document.querySelector('iframe[src*="/embed/${ytid}"]').scrollIntoView({block:'center'})`); await sleep(500);
    const frames = [];
    for (const [i, t] of times.entries()) {
      await y.evaluate(`(async()=>{const p=document.querySelector('#movie_player');p.seekTo(${t / 1000},true);p.playVideo();await new Promise(r=>setTimeout(r,1800));p.pauseVideo();await new Promise(r=>setTimeout(r,400));})()`);
      const r = await s.evaluate(`(()=>{const b=document.querySelector('iframe[src*="/embed/${ytid}"]').getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height}})()`);
      const shot = await s.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
      const name = `f_${String(i + 1).padStart(4, '0')}@${t}ms.jpg`; fs.writeFileSync(path.join(fdir, name), Buffer.from(shot.data, 'base64'));
      frames.push({ ref: `raw/frames/${ytid}/${name}`, t_ms: t });
    }
    fs.writeFileSync(path.join(fdir, 'index.json'), JSON.stringify({ video_id: ytid, frames }, null, 1));
    return { ytid, duration_s: meta.duration_s, track: meta.track, events: meta.events?.length || 0, frames: frames.length };
  } finally { y.close(); }
}

export async function main(argv = process.argv.slice(2)) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; }, flag = (n) => argv.includes(n);
  const out = path.resolve(arg('--out') || path.join(REPO, CFG.corpus_dir, 'raw'));
  let tab = arg('--tab'), created = false;
  if (!tab) { tab = (await (await fetch(`${CFG.cdp}/json/new?about:blank`, { method: 'PUT' })).json()).id; created = true; }
  const s = await attach(tab); await s.send('Page.enable');
  try {
    if (!flag('--skip-pages')) await capturePages(s, out, { force: flag('--force') });
    if (!flag('--skip-videos')) {
      const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
      for (const f of fs.readdirSync(path.join(out, 'pages')).filter((x) => x.endsWith('.json'))) {
        const page = JSON.parse(fs.readFileSync(path.join(out, 'pages', f), 'utf8'));
        for (const ytid of page.youtube_ids || []) {
          if (only && !only.has(ytid)) continue;
          if (!flag('--force') && fs.existsSync(path.join(out, 'captions', `${ytid}.json`)) && fs.existsSync(path.join(out, 'frames', ytid, 'index.json'))) continue;
          try { console.log('video', JSON.stringify(await captureVideo(s, page, ytid, out))); }
          catch (e) { console.log('video FAILED', ytid, page.wp_id, String(e.message || e)); fs.mkdirSync(path.join(out, 'captions'), { recursive: true }); fs.writeFileSync(path.join(out, 'captions', `${ytid}.failed.json`), JSON.stringify({ video_id: ytid, lesson_wp_id: page.wp_id, at: new Date().toISOString(), error: String(e.message || e) })); }
        }
      }
    }
  } finally { s.close(); if (created) await fetch(`${CFG.cdp}/json/close/${tab}`).catch(() => {}); }
  return 0;
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
