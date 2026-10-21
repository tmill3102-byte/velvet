import * as Store from './store.js';
import * as Thumbs from './thumbs.js';
import * as AI from './ai.js';
import * as Vision from './vision.js';
import * as Smart from './smart.js';
import * as Scenes from './scenes.js';
import * as People from './people.js';
const host = window.velvetHost || null; // provided by the Electron preload; null in the browser/PWA
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/* ---------- icons ---------- */
const S = (p, o) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${o || ''}>${p}</svg>`;
const IC = {
  grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  cols: S('<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M6 4h12"/><path d="M8 13.5l3 3 5-5"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  vault: S('<rect x="3.5" y="4" width="17" height="16" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V7M12 17v-1.8M8.8 12H7M17 12h-1.8"/>'),
  user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  heart: S('<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 4 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.3 0 5.7 3.1 4.5 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>'),
  lockSm: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>', 'width="12" height="12"'),
  lockBig: S('<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M7.5 10V7.5a4.5 4.5 0 019 0V10"/><circle cx="12" cy="14.6" r="1.4"/><path d="M12 16v2"/>', 'stroke-width="1.4"'),
  shield: S('<path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  sliders: S('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: S('<path d="M15 5l-7 7 7 7"/>'),
  chev: S('<path d="M9 5l7 7-7 7"/>'),
  play: S('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pause: S('<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor"/>'),
  rew: S('<path d="M4.5 12a7.5 7.5 0 107.5-7.5H8.5"/><path d="M11 2l-3 2.5L11 7"/>'),
  fwd: S('<path d="M19.5 12A7.5 7.5 0 1112 4.5h3.5"/><path d="M13 2l3 2.5L13 7"/>'),
  vol: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>'),
  mute: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  full: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitfull: S('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  photo: S('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8 8"/>'),
  film: S('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/>'),
  chap: S('<path d="M4 6.5h3M4 12h3M4 17.5h3"/><rect x="9.5" y="4.5" width="10.5" height="4" rx="1.2"/><rect x="9.5" y="10" width="10.5" height="4" rx="1.2"/><rect x="9.5" y="15.5" width="10.5" height="4" rx="1.2"/>'),
  people: S('<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.9-3.3 3.2-5 6-5s5.1 1.7 6 5"/><circle cx="16.8" cy="7.5" r="2.6"/><path d="M16.5 12.6c2.3 0 4 1.4 4.6 4"/>'),
  reel: S('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17M3.5 15h17M8 5v4M16 5v4M8 15v4M16 15v4"/><path d="M11 10.6v2.8l2.4-1.4z" fill="currentColor"/>'),
  disk: S('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  bolt: S('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  spark: S('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  tag: S('<path d="M3.5 12.2V4.5a1 1 0 011-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.4"/>'),
  star: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  folder: S('<path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.4"'),
  more: S('<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>'),
  trash: S('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  edit: S('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  download: S('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  upload: S('<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>'),
  image: S('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M20.5 15l-4.5-4.5L7 19.5"/>'),
  key: S('<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5"/>'),
  minus: S('<path d="M5 12h14"/>')
};
function hydrateIcons(root) { (root || document).querySelectorAll('[data-ic]').forEach(el => { if (!el.dataset.done) { el.innerHTML = IC[el.dataset.ic] || ''; el.dataset.done = '1'; if (el.tagName === 'SPAN') el.style.display = 'inline-flex'; } }); }

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { if (!isFinite(t) || t < 0) t = 0; t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const bytes = n => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024))); return (n / 1024 ** i).toFixed(i >= 3 ? 2 : i ? 1 : 0).replace(/\.0+$/, '') + ' ' + u[i]; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FB = ['linear-gradient(150deg,#5A0F24,#14040a)', 'linear-gradient(200deg,#8E0E36,#2a0612 70%)', 'radial-gradient(circle at 30% 20%,#C2185B,#3A0A18 70%)', 'linear-gradient(160deg,#3A0A18,#0B0306)', 'radial-gradient(circle at 70% 70%,#FF2E88 0,#6d0b2a 40%,#14040a 80%)', 'linear-gradient(120deg,#4A0716,#A3123F,#1A060C)'];
const fbFor = id => FB[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % FB.length];
let toastT; function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2800); }
function progress(label, f) {
  const o = $('#progOv'); if (label === null) { o.classList.remove('show'); return; }
  o.classList.add('show'); $('#progL').textContent = label; $('#progP').textContent = f == null ? '' : Math.round(f * 100) + '%'; $('#progBar').style.width = ((f || 0) * 100) + '%';
}

/* ---------- modal helpers ---------- */
function modal(html, onMount) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
    document.body.appendChild(m); hydrateIcons(m); requestAnimationFrame(() => m.classList.add('show'));
    let done = false;
    const close = v => { if (done) return; done = true; m.classList.remove('show'); setTimeout(() => m.remove(), 300); resolve(v); };
    m.addEventListener('click', e => { if (e.target === m) close(undefined); const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(undefined); } });
    onMount && onMount(m, close);
    const f = m.querySelector('input:not([type=checkbox])'); if (f && matchMedia('(hover:hover)').matches) setTimeout(() => f.focus(), 80);
  });
}
const confirmBox = (title, text, ok = 'OK', danger = false) => modal(`<h3>${esc(title)}</h3><p>${text}</p><div class="actions"><button class="btn btn-ghost" data-r="">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="ok">${esc(ok)}</button></div>`).then(r => r === 'ok');
function promptBox(title, text, value = '', ok = 'Save', type = 'text') {
  return modal(`<h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}<input class="field" type="${type}" value="${esc(value)}" autocomplete="off"><div class="actions"><button class="btn btn-ghost" data-r="">Cancel</button><button class="btn btn-primary" data-ok>${esc(ok)}</button></div>`, (m, close) => {
    const inp = m.querySelector('input'); const go = () => close(inp.value);
    m.querySelector('[data-ok]').onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

/* ---------- state ---------- */
let idx = null;            // decrypted library index (only while unlocked)
let view = 'library', curCol = null, libFilter = 'all', vaultOpen = false;
const thumbs = new Map();  // itemId -> object URL of decrypted thumbnail
const fulls = new Map();   // itemId -> object URL of decrypted original (small LRU)
const save = () => Store.saveIndex(idx);
const visible = () => idx.items.filter(i => !i.vault && !i.archived);
const itemById = id => idx.items.find(i => i.id === id);
const colById = id => idx.collections.find(c => c.id === id);

/* ---------- navigation ---------- */
const TABS = [['library', 'Library', 'grid'], ['collections', 'Collections', 'cols'], ['search', 'Search', 'search'], ['vault', 'Vault', 'vault'], ['profile', 'Profile', 'user']];
$('#sideNav').innerHTML = TABS.map(t => `<button class="nav-btn" data-nav="${t[0]}"><span data-ic="${t[2]}"></span>${t[1]}</button>`).join('');
$('#bottomNav').innerHTML = TABS.map(t => `<button class="bn" data-nav="${t[0]}"><span data-ic="${t[2]}"></span>${t[1]}</button>`).join('');
function nav(v, opt = {}) {
  if (!idx) return;
  if (view === 'vault' && v !== 'vault') vaultOpen = false;
  endSelect();
  const tab = v === 'collection' || v === 'people' || v === 'person' ? 'collections' : v;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  $$('.nav-btn[data-nav],.bn').forEach(b => b.classList.toggle('active', b.dataset.nav === tab));
  view = v; render();
  $$('#sideCols .nav-btn').forEach(b => b.classList.toggle('active', v === 'collection' && b.dataset.col === curCol));
  if (v === 'search' && opt.focus) setTimeout(() => { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 60);
  if (!opt.keepScroll) window.scrollTo(0, 0);
}
function render() {
  if (!idx) return;
  renderSideCols();
  if (view === 'library') renderLibrary();
  else if (view === 'collections') renderCollections();
  else if (view === 'collection') renderCollection();
  else if (view === 'search') renderSearch();
  else if (view === 'vault') renderVault();
  else if (view === 'profile') renderProfile();
  else if (view === 'dupes') renderDupes();
  else if (view === 'best') renderBest();
  else if (view === 'archive') renderArchive();
  else if (view === 'rules') renderRules();
  else if (view === 'people') renderPeople();
  else if (view === 'person') renderPerson();
}
document.addEventListener('click', e => {
  if (e.target.closest('.modal')) return;
  const n = e.target.closest('[data-nav]'); if (n) { e.preventDefault(); nav(n.dataset.nav); return; }
  const a = e.target.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'lock') lockNow(); else if (act === 'import') pickFiles(); else if (act === 'folder') $('#folder').click(); else if (act === 'select') toggleSelect();
    return;
  }
  const c = e.target.closest('[data-col]'); if (c && !e.target.closest('.cmenu')) { openCollection(c.dataset.col); }
});

/* ---------- lock / setup gate ---------- */
const app = $('#app'), lockEl = $('#lock'), gate = $('#gate');
const isLocked = () => lockEl.classList.contains('open');
function tick() { const d = new Date(); $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); }
tick(); setInterval(tick, 15000);
function gateSetup() {
  gate.innerHTML = `<div class="mono">V</div><h1>Welcome to Velvet</h1>
   <p class="sub">Create a passcode. Everything you add is encrypted on this device with it.</p>
   <input class="pass" id="p1" type="password" placeholder="Choose a passcode (min 6)" autocomplete="new-password">
   <input class="pass" id="p2" type="password" placeholder="Repeat passcode" autocomplete="new-password">
   <div class="warnbox"><b>Important:</b> there is no reset. If you forget this passcode, your photos and videos <b>cannot be recovered</b> by anyone, not even us.</div>
   <label class="check"><input type="checkbox" id="pAck"> I understand a forgotten passcode means my files are gone for good.</label>
   <div class="err" id="gErr"></div>
   <button class="btn btn-primary" id="gGo">Create my private gallery</button>
   <button class="btn btn-ghost" id="gRestore" style="height:44px">Restore from a .velvet backup</button>`;
  const go = async () => {
    const a = $('#p1').value, b = $('#p2').value, err = $('#gErr');
    if (a.length < 6) { err.textContent = 'Use at least 6 characters.'; return; }
    if (a !== b) { err.textContent = 'The two passcodes don’t match.'; $('#p2').classList.add('shake'); setTimeout(() => $('#p2').classList.remove('shake'), 500); return; }
    if (!$('#pAck').checked) { err.textContent = 'Please tick the box to confirm you understand.'; return; }
    const btn = $('#gGo'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Securing…';
    await Store.setup(a); idx = await Store.loadIndex(); afterUnlock(true);
  };
  $('#gGo').onclick = go; $('#p2').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#gRestore').onclick = () => startRestore();
  if (matchMedia('(hover:hover)').matches) setTimeout(() => $('#p1').focus(), 100);
}
let fails = 0, lockoutUntil = 0;
function gateUnlock() {
  gate.innerHTML = `<div class="mono">V</div><h1>Velvet is<br>locked</h1>
   <input class="pass" id="pin" type="password" placeholder="Enter passcode" autocomplete="current-password">
   <div class="err" id="gErr"></div>
   <button class="btn btn-primary" id="gGo">Unlock</button>
   <div class="hint">Unlock to enter your private world.</div>`;
  const go = async () => {
    const inp = $('#pin'), err = $('#gErr'), btn = $('#gGo');
    if (Date.now() < lockoutUntil) { err.textContent = `Too many attempts. Try again in ${Math.ceil((lockoutUntil - Date.now()) / 1000)}s.`; return; }
    if (!inp.value) return;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Unlocking…';
    const ok = await Store.unlock(inp.value);
    if (!ok) {
      fails++; if (fails >= 5) lockoutUntil = Date.now() + 30000 * (fails - 4);
      err.textContent = 'Wrong passcode.'; inp.value = ''; inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 500);
      btn.disabled = false; btn.textContent = 'Unlock'; inp.focus(); return;
    }
    fails = 0; idx = await Store.loadIndex(); afterUnlock(false);
  };
  $('#gGo').onclick = go; $('#pin').onkeydown = e => { if (e.key === 'Enter') go(); };
  if (matchMedia('(hover:hover)').matches) setTimeout(() => $('#pin').focus(), 100);
}
function afterUnlock(first) {
  idx.settings = Object.assign(Store.emptyIndex().settings, idx.settings || {});
  lockEl.classList.remove('open'); app.classList.remove('locked'); app.removeAttribute('aria-hidden');
  gate.innerHTML = '';
  nav('library'); resetIdle(); if (host && host.setPrivacy) host.setPrivacy(idx.settings.hide);
  if (first) setTimeout(() => toast('Your gallery is ready. Import something to begin.'), 600);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (aiOn() && People.on(idx)) People.open(idx).then(() => { if (view === 'collections') renderPeopleRow('#peopleRow'); }).catch(e => console.warn('People open', e));
  if (aiOn()) AI.open(idx).then(() => { if (view === 'search') renderSearch(); setTimeout(startAI, 2500); }).catch(e => console.warn('AI open', e));
}
function lockNow() { try { closeReel(); } catch (e) { } if (typeof ruleSeen !== 'undefined') ruleSeen.clear();
  closePlayer(); closeLightbox(); endSelect();
  $$('.modal').forEach(m => m.remove());
  AI.shutdown(); aiProg = null; People.shutdown(); pplProg = null; curPerson = null; drawAIChip();
  Store.lock(); idx = null; vaultOpen = false;
  for (const u of thumbs.values()) URL.revokeObjectURL(u); thumbs.clear();
  for (const u of fulls.values()) URL.revokeObjectURL(u); fulls.clear();
  ['#libGrid', '#colItems', '#results', '#vaultBody', '#profileBody', '#colGrid', '#sideCols', '#colHero', '#rel', '#lbStage', '#smartAlbums', '#bestBody', '#archBody', '#rulesBody', '#dupesBody', '#peopleRow', '#searchPeople', '#peopleBody', '#personBody'].forEach(s => { const e = $(s); if (e) e.innerHTML = ''; });
  app.classList.add('locked'); app.setAttribute('aria-hidden', 'true'); lockEl.classList.add('open');
  gateUnlock();
}
let idleT;
function resetIdle() {
  clearTimeout(idleT); if (!idx || !idx.settings.autolock) return;
  idleT = setTimeout(() => { if (!isLocked() && !(curVid && !vid.paused)) { lockNow(); } else resetIdle(); }, (idx.settings.autolockMin || 1) * 60000);
}
['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (!isLocked()) resetIdle(); }, { passive: true, capture: true }));
function privacy(on) { document.body.classList.toggle('privacy', !!(on && idx && idx.settings.hide)); }
document.addEventListener('visibilitychange', () => {
  privacy(document.hidden);
  if (document.hidden && idx && idx.settings.lockOnHide) lockNow();
});
window.addEventListener('blur', () => privacy(true)); window.addEventListener('focus', () => privacy(false));

/* ---------- thumbnails (decrypted lazily, cached as object URLs) ---------- */
const thumbQ = []; let thumbBusy = 0;
function wantThumb(it, img) { thumbQ.push([it, img]); pumpThumbs(); }
async function pumpThumbs() {
  while (thumbBusy < 4 && thumbQ.length) {
    const [it, img] = thumbQ.shift(); thumbBusy++;
    (async () => {
      try {
        let u = thumbs.get(it.id);
        if (!u && it.thumb && Store.isUnlocked()) { const b = await Store.readFile(it.thumb.id, it.thumb.chunks, 'image/jpeg'); if (!Store.isUnlocked()) return; u = URL.createObjectURL(b); thumbs.set(it.id, u); }
        if (u && img.isConnected) { img.src = u; img.onload = () => { img.classList.add('ok'); img.parentElement && img.parentElement.classList.add('ready'); }; }
        else if (img.parentElement) img.parentElement.classList.add('ready');
      } catch (e) { console.warn('thumb', e); if (img.parentElement) img.parentElement.classList.add('ready'); }
      finally { thumbBusy--; pumpThumbs(); }
    })();
  }
}
const io = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); const it = itemById(en.target.dataset.tid); if (it) wantThumb(it, en.target); } }), { rootMargin: '400px' });

/* ---------- grid ---------- */
const ctx = new WeakMap();
function tileHTML(it, i, opts = {}) {
  const v = it.type === 'video';
  const ph = it.thumb ? '' : `<div class="ph">${v ? IC.play.replace('<svg', '<svg class="phic"') : IC.photo.replace('<svg', '<svg class="phic"')}<small>${v ? (Thumbs.isHevc(it.codec) ? 'HEVC video' : 'Video') : (Thumbs.isHeic(it.mime, it.name) ? 'HEIC photo' : 'Photo')} · no preview</small></div>`;
  return `<div class="tile${it.thumb ? '' : ' nothumb'}${opts.veiled ? ' veiled' : ''}${sel.has(it.id) ? ' picked' : ''}" data-id="${it.id}" style="--ar:${Math.max(.5, Math.min(2, it.ar || 1))};--fb:${fbFor(it.id)};--i:${i % 14}" tabindex="0" role="button" aria-label="${esc(it.title)}">
    <div class="media"><img alt="" data-tid="${it.id}">${ph}</div><div class="tint user"></div><div class="shade"></div>
    ${v ? `<div class="playbub">${IC.play}</div><span class="dur">${fmt(it.dur)}</span>` : `<span class="badge">${it.mime === 'image/gif' ? '<b style="font-size:8px">GIF</b>' : IC.photo}</span>`}
    ${opts.veiled ? `<div class="veil" style="position:absolute;inset:0;display:grid;place-items:center">${IC.eye}</div>` : ''}
    <span class="sel">${IC.check}</span>
    <button class="heart ${it.fav ? 'on' : ''}" aria-label="Favorite">${IC.heart}</button><div class="cap">${esc(it.title)}</div></div>`;
}
/* JS masonry: explicit flex columns, filled shortest-first by aspect ratio.
   Avoids CSS multi-column / grid masonry, which mis-render in iOS Safari. */
function gridCols(el) {
  const w = el.clientWidth || el.parentElement?.clientWidth || innerWidth;
  if (w < 700) return 2;
  return Math.max(2, Math.min(5, Math.floor((w + 16) / (220 + 16))));
}
function layoutGrid(el) {
  const st = el._grid; if (!st || !st.list.length) return;
  const n = gridCols(el); st.n = n;
  const cols = Array.from({ length: n }, () => ({ h: 0, html: [] }));
  st.list.forEach((it, i) => {
    let c = cols[0]; for (const x of cols) if (x.h < c.h - 1e-6) c = x;
    c.h += 1 / Math.max(.5, Math.min(2, it.ar || 1)) + .04;
    c.html.push(tileHTML(it, i, st.opts));
  });
  el.style.setProperty('--gcols', n);
  el.innerHTML = cols.map(c => `<div class="gcol">${c.html.join('')}</div>`).join('');
  el.querySelectorAll('img[data-tid]').forEach(img => { const u = thumbs.get(img.dataset.tid); if (u) { img.src = u; img.classList.add('ok'); img.parentElement.classList.add('ready'); } else io.observe(img); });
}
const gridRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ents => {
  for (const e of ents) { const el = e.target, st = el._grid; if (st && st.list.length && el.clientWidth && gridCols(el) !== st.n) layoutGrid(el); }
}) : null;
function renderGrid(el, list, empty, opts) {
  ctx.set(el, list);
  el._grid = { list, opts: opts || {}, n: 0 };
  if (gridRO && !el._ro) { gridRO.observe(el); el._ro = 1; }
  if (!list.length) { el.classList.add('is-empty'); el.innerHTML = empty || `<div class="empty"><b>Nothing here yet</b>Import something to begin.</div>`; hydrateIcons(el); return; }
  el.classList.remove('is-empty');
  layoutGrid(el);
}
function gridClick(e) {
  const tile = e.target.closest('.tile'); if (!tile) return;
  const it = itemById(tile.dataset.id); if (!it) return;
  if (longPressed) { longPressed = false; return; }
  if (selecting) { togglePick(it.id, tile); return; }
  if (e.target.closest('.heart')) { e.stopPropagation(); toggleFav(it); return; }
  if (tile.classList.contains('veiled') && !tile.classList.contains('revealed')) { tile.classList.add('revealed'); return; }
  const list = ctx.get(e.currentTarget) || visible();
  if (it.type === 'video') openPlayer(it, list); else openLightbox(it, list.filter(x => x.type === 'photo'));
}
let lpT = null, longPressed = false;
function bindGrid(el) {
  el.addEventListener('click', gridClick);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('tile')) e.target.click(); });
  el.addEventListener('contextmenu', e => { const t = e.target.closest('.tile'); if (!t) return; e.preventDefault(); itemSheet(itemById(t.dataset.id)); });
  el.addEventListener('pointerdown', e => { const t = e.target.closest('.tile'); if (!t || e.pointerType === 'mouse') return; clearTimeout(lpT); lpT = setTimeout(() => { longPressed = true; if (navigator.vibrate) navigator.vibrate(10); itemSheet(itemById(t.dataset.id)); }, 550); });
  ['pointerup', 'pointercancel', 'pointermove'].forEach(ev => el.addEventListener(ev, e => { if (ev !== 'pointermove' || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(lpT); }));
}
['#libGrid', '#colItems', '#results'].forEach(s => bindGrid($(s)));
function toggleFav(it) {
  it.fav = !it.fav; save();
  $$(`.tile[data-id="${it.id}"] .heart`).forEach(h => { h.classList.toggle('on', it.fav); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); });
  toast(it.fav ? 'Added to Favorites' : 'Removed from Favorites');
  if (libFilter === 'favorites' && view === 'library') setTimeout(renderLibrary, 350);
  syncFavButtons();
}

/* ---------- library ---------- */
const FILTERS = [['all', 'All'], ['photos', 'Photos'], ['videos', 'Videos'], ['favorites', 'Favorites']];
const sortNew = list => list.slice().sort((a, b) => b.added - a.added);
function renderLibrary() {
  $('#libChips').innerHTML = FILTERS.map(c => `<button class="chip ${libFilter === c[0] ? 'on' : ''}" data-f="${c[0]}">${c[0] === 'favorites' ? IC.heart : ''}${c[1]}</button>`).join('');
  const all = visible();
  const list = sortNew(all.filter(i => libFilter === 'all' || (libFilter === 'photos' && i.type === 'photo') || (libFilter === 'videos' && i.type === 'video') || (libFilter === 'favorites' && i.fav)));
  const empty = all.length ? `<div class="empty"><b>${libFilter === 'favorites' ? 'No favorites yet' : 'Nothing here'}</b>${libFilter === 'favorites' ? 'Tap the heart on anything you love.' : 'Try another filter.'}</div>` :
    `<div class="hero-empty"><div class="v">V</div><h2>Your private world starts here</h2><p>Add photos and videos from this device. They’re encrypted with your passcode and never leave ${host ? 'this PC' : 'this device'}.</p>
     <div class="row2"><button class="btn btn-primary" data-act="import"><span data-ic="plus"></span>Import photos &amp; videos</button>${!isIOS ? '<button class="btn btn-ghost" data-act="folder"><span data-ic="folder"></span>Import a folder</button>' : ''}</div>
     ${!isIOS ? '<p style="margin:18px 0 0;font-size:12.5px">Tip: you can also drag files or whole folders onto this window.</p>' : ''}</div>`;
  renderGrid($('#libGrid'), list, empty);
}
$('#libChips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; libFilter = c.dataset.f; renderLibrary(); });
$('#libSearch').addEventListener('input', e => { const v = e.target.value; e.target.value = ''; $('#q').value = v; nav('search', { focus: true }); });
if (isIOS) $('#folderBtn').style.display = 'none';

/* ---------- collections ---------- */
const colItems = c => visible().filter(i => (i.cols || []).includes(c.id));
const coverOf = c => { const items = colItems(c); return (c.cover && items.find(i => i.id === c.cover)) || items[0] || null; };
function coverImg(c) { const it = coverOf(c); return it ? `<img alt="" data-tid="${it.id}">` : ''; }
function hydrateCovers(root) { root.querySelectorAll('img[data-tid]').forEach(img => { img.onload = () => img.classList.add('ok'); const u = thumbs.get(img.dataset.tid); if (u) img.src = u; else { const it = itemById(img.dataset.tid); if (it) wantThumb(it, img); } }); }
function renderSideCols() {
  $('#sideCols').innerHTML = idx.collections.map(c => `<button class="nav-btn side-col" data-col="${c.id}"><span class="dot" style="background:${fbFor(c.id)}"></span>${esc(c.name)}<span class="n">${colItems(c).length}</span></button>`).join('') +
    `<button class="nav-btn" id="sideNewCol"><span data-ic="plus"></span>New collection</button>`;
  hydrateIcons($('#sideCols')); $('#sideNewCol').onclick = () => newCollection();
}
function renderCollections() {
  $('#colCount').textContent = idx.collections.length + ' collection' + (idx.collections.length === 1 ? '' : 's');
  $('#colGrid').innerHTML = idx.collections.map((c, i) => `<div class="col-card" data-col="${c.id}" style="--fb:${fbFor(c.id)};--i:${i}" role="button" tabindex="0">${coverImg(c)}<div class="tint user"></div><div class="gloss"></div>
     <div class="cmenu"><button class="iconbtn" data-cm="${c.id}" aria-label="Collection options">${IC.more}</button></div>
     <div class="info"><div><h3>${esc(c.name)}</h3><p>${colItems(c).length} items</p></div><span class="lockchip">${IC.lock}</span></div></div>`).join('') +
    `<button class="col-card col-new" id="newCol" style="--i:${idx.collections.length}">${IC.plus}New collection</button>`;
  hydrateCovers($('#colGrid')); renderSmartAlbums(); renderPeopleRow('#peopleRow');
  $('#newCol').onclick = () => newCollection();
  $$('[data-cm]').forEach(b => b.onclick = e => { e.stopPropagation(); collectionMenu(colById(b.dataset.cm)); });
}
async function newCollection(addIds) {
  const name = (await promptBox('New collection', '', '', 'Create') || '').trim(); if (!name) return null;
  const c = { id: uid(), name: name.slice(0, 60), cover: null, created: Date.now() }; idx.collections.push(c);
  if (addIds) addIds.forEach(id => { const it = itemById(id); if (it && !it.cols.includes(c.id)) it.cols.push(c.id); });
  await save(); render(); toast(`Created “${c.name}”`); return c;
}
async function collectionMenu(c) {
  const r = await modal(`<h3>${esc(c.name)}</h3><div class="menu"><button data-r="rename">${IC.edit}Rename</button><button data-r="import">${IC.plus}Import into this collection</button><button class="danger" data-r="delete">${IC.trash}Delete collection</button></div><div class="actions"><button class="btn btn-ghost" data-r="">Close</button></div>`);
  if (r === 'rename') { const n = (await promptBox('Rename collection', '', c.name) || '').trim(); if (n) { c.name = n.slice(0, 60); await save(); render(); } }
  else if (r === 'import') { curCol = c.id; pickFiles(c.id); }
  else if (r === 'delete') {
    if (await confirmBox('Delete collection?', `“${esc(c.name)}” will be removed. The photos and videos inside stay in your Library.`, 'Delete', true)) {
      idx.collections = idx.collections.filter(x => x !== c); idx.items.forEach(i => i.cols = (i.cols || []).filter(id => id !== c.id));
      await save(); if (view === 'collection') nav('collections'); else render(); toast('Collection deleted');
    }
  }
}
function openCollection(id) { curCol = id; nav('collection'); }
function renderCollection() {
  if (isSmart(curCol)) { renderSmartCollection(); return; }
  const c = colById(curCol); if (!c) { nav('collections'); return; }
  const h = $('#colHero'); h.style.setProperty('--fb', fbFor(c.id));
  h.innerHTML = `${coverImg(c)}<div class="tint user"></div><div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(14,3,7,.9),transparent 70%)"></div>
    <div class="info"><h2>${esc(c.name)}</h2><p>${IC.lock}${colItems(c).length} items · Private</p></div>
    <div class="hero-actions"><button class="btn btn-ghost btn-sm" id="colReel">${IC.reel}<span>Highlights</span></button><button class="btn btn-primary btn-sm" id="colImport">${IC.plus}<span>Import</span></button><button class="iconbtn" id="colMore" aria-label="Options">${IC.more}</button></div>`;
  hydrateCovers(h);
  $('#colImport').onclick = () => pickFiles(c.id); $('#colReel').onclick = () => openReel(colItems(c), c.name); $('#colMore').onclick = () => collectionMenu(c);
  renderGrid($('#colItems'), sortNew(colItems(c)), `<div class="empty"><b>This collection is empty</b>Import straight into it, or use <i>Select</i> in your Library and choose “Add to collection”.</div>`);
}

/* ---------- search ---------- */
const activeTags = new Set();
function hl(s, q) { s = esc(s); if (!q) return s; const i = s.toLowerCase().indexOf(q); return i < 0 ? s : s.slice(0, i) + '<mark>' + s.slice(i, i + q.length) + '</mark>' + s.slice(i + q.length); }
function tagCounts() { const m = new Map(); visible().forEach(i => (i.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); }
function aiTagCounts() { const m = new Map(), mine = new Set(tagCounts()); visible().forEach(i => (i.aiTags || []).forEach(t => { if (!mine.has(t)) m.set(t, (m.get(t) || 0) + 1); })); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); }
const hasTag = (i, t) => (i.tags || []).includes(t) || (i.aiTags || []).includes(t);
let smartTok = 0;
function renderSearch() {
  const q = $('#q').value.trim().toLowerCase();
  const tags = tagCounts().slice(0, 24);
  const special = [['__fav', 'Favorites', 'star'], ['__photo', 'Photos', 'photo'], ['__video', 'Videos', 'film']];
  const aiT = aiTagCounts().slice(0, 16);
  $('#tags').innerHTML = special.concat(tags.map(t => [t, t, 'tag'])).concat(aiT.map(t => [t, t, 'spark', 'ai'])).map(([k, l, ic, cls]) => `<button class="tag ${cls || ''} ${activeTags.has(k) ? 'on' : ''}" data-tag="${esc(k)}" ${cls ? 'title="AI tag"' : ''}>${IC[ic]}${esc(l)}${activeTags.has(k) ? '<span class="x">×</span>' : ''}</button>`).join('') +
    (tags.length || aiT.length ? '' : '<span style="color:var(--dim);font-size:13px;line-height:38px">Add tags to items (right-click or long-press → Edit) and they’ll appear here.</span>');
  let sug = [];
  if (q) {
    sug = tags.filter(t => t.includes(q)).slice(0, 3).map(t => ({ k: 'tag', v: t }))
      .concat(visible().filter(i => i.title.toLowerCase().includes(q)).slice(0, 4).map(i => ({ k: 'title', v: i.title })));
  } else sug = tags.slice(0, 4).map(t => ({ k: 'tag', v: t }));
  const pOn = peopleOn() && People.isOpen(), names = new Map();
  if (pOn) { People.people().forEach(p => { if (p.hidden || !p.name) return; People.itemsOf(p).forEach(id => names.set(id, (names.get(id) || '') + ' ' + p.name)); });
    if (q) sug = People.find(q).filter(p => !p.hidden && People.itemsOf(p, visibleId).length).slice(0, 3).map(p => ({ k: 'person', v: p.name, id: p.id })).concat(sug); }
  if (!pOn) $('#searchPeople').innerHTML = ''; else if (!q) renderPeopleRow('#searchPeople'); else $('#searchPeople').innerHTML = '';
  $('#suggest').innerHTML = sug.length ? sug.map(s => `<button class="chip" data-s="${esc(s.v)}" data-k="${s.k}"${s.id ? ` data-pid="${s.id}"` : ''}>${s.k === 'tag' ? IC.tag : s.k === 'person' ? IC.people : IC.search}<span>${hl(s.v, q)}</span></button>`).join('') : '<span style="color:var(--dim);font-size:13px;line-height:36px">No suggestions yet</span>';
  const res = visible().filter(i => {
    const hay = (i.title + ' ' + (i.tags || []).join(' ') + ' ' + (i.aiTags || []).join(' ') + ' ' + i.type + ' ' + (i.cols || []).map(id => (colById(id) || {}).name || '').join(' ') + (names.get(i.id) || '')).toLowerCase();
    if (q && !q.split(/\s+/).every(w => hay.includes(w))) return false;
    for (const t of activeTags) {
      if (t === '__fav') { if (!i.fav) return false; } else if (t === '__photo') { if (i.type !== 'photo') return false; } else if (t === '__video') { if (i.type !== 'video') return false; }
      else if (!hasTag(i, t)) return false;
    }
    return true;
  });
  $('#resH').textContent = (q || activeTags.size) ? `Results · ${res.length}` : `Everything · ${res.length}`;
  renderGrid($('#results'), sortNew(res), `<div class="empty"><b>No matches</b>Try another word or clear a tag.</div>`);
  const tok = ++smartTok;
  if (q.length >= 3 && aiOn() && AI.hasIndex()) {
    const ids = visible().filter(i => [...activeTags].every(t => t === '__fav' ? i.fav : t === '__photo' ? i.type === 'photo' : t === '__video' ? i.type === 'video' : hasTag(i, t))).map(i => i.id);
    $('#resH').textContent = `Results · ${res.length} · searching smartly…`;
    setTimeout(() => { if (tok !== smartTok) return; AI.search(q, ids).then(hits => {
      if (tok !== smartTok || !idx) return;
      const seen = new Set(res.map(i => i.id)), rank = new Map(hits.map(([id, sc]) => [id, sc]));
      const textHits = res.slice().sort((a, b) => (rank.get(b.id) || 0) - (rank.get(a.id) || 0));
      const extra = hits.filter(([id]) => !seen.has(id)).map(([id]) => itemById(id)).filter(Boolean);
      const all = textHits.concat(extra);
      $('#resH').innerHTML = `Results · ${all.length}${extra.length ? ` <span class="ai-pill">${IC.spark}${extra.length} smart match${extra.length > 1 ? 'es' : ''}</span>` : ''}`;
      renderGrid($('#results'), all, `<div class="empty"><b>No matches</b>Try another word or clear a tag.</div>`);
      hydrateIcons($('#resH'));
    }).catch(e => { if (tok === smartTok) { console.warn('smart search', e); $('#resH').textContent = `Results · ${res.length}`; } }); }, 250);
  }
}
let sT; $('#q').addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(renderSearch, 80); });
$('#qClear').addEventListener('click', e => { e.preventDefault(); $('#q').value = ''; activeTags.clear(); renderSearch(); });
$('#tags').addEventListener('click', e => { const t = e.target.closest('.tag'); if (!t) return; const k = t.dataset.tag; activeTags.has(k) ? activeTags.delete(k) : activeTags.add(k); renderSearch(); });
$('#suggest').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; if (c.dataset.k === 'person') { openPerson(c.dataset.pid); return; } if (c.dataset.k === 'tag') { activeTags.add(c.dataset.s); $('#q').value = ''; } else $('#q').value = c.dataset.s.toLowerCase(); renderSearch(); });

/* ---------- vault ---------- */
function renderVault() {
  const body = $('#vaultBody'); const pin = idx.settings.vaultPin;
  if (pin && !vaultOpen) {
    body.innerHTML = `<div class="gate" style="margin:10px auto 0"><p class="sub">Enter your vault PIN</p><input class="pass" id="vpin" type="password" inputmode="numeric" autocomplete="off" placeholder="Vault PIN"><div class="err" id="vErr"></div><button class="btn btn-primary" id="vGo">Open vault</button></div>`;
    const go = async () => {
      const v = $('#vpin').value; const h = await Store.vaultHash(v, pin.salt);
      if (h.hash === pin.hash) { vaultOpen = true; renderVault(); } else { $('#vErr').textContent = 'Wrong PIN.'; $('#vpin').value = ''; $('#vpin').classList.add('shake'); setTimeout(() => $('#vpin').classList.remove('shake'), 500); }
    };
    $('#vGo').onclick = go; $('#vpin').onkeydown = e => { if (e.key === 'Enter') go(); }; return;
  }
  const items = sortNew(idx.items.filter(i => i.vault && !i.archived));
  body.innerHTML = `<div class="toolrow" style="justify-content:center"><div class="tools"><button class="btn btn-ghost btn-sm" id="vReveal">${IC.eye}<span>Reveal all</span></button><button class="btn btn-ghost btn-sm" data-act="select">${IC.check}<span>Select</span></button>${pin ? `<button class="btn btn-ghost btn-sm" id="vClose">${IC.lock}<span>Close vault</span></button>` : ''}</div></div>
    <div class="grid" id="vaultGrid"></div><div class="pill">${IC.lock}Encrypted on device</div>
    <p class="demo-note" style="text-align:center">Vault items are hidden from Library, Collections and Search. Tap once to reveal, again to open.${pin ? '' : ' Add a separate vault PIN in Profile for a second layer.'}</p>`;
  const g = $('#vaultGrid'); if (!g._bound) { bindGrid(g); g._bound = 1; }
  renderGrid(g, items, `<div class="empty"><b>Your vault is empty</b>Use <i>Select</i> in the Library (or an item’s ⋯ menu) and choose “Move to Vault”.</div>`, { veiled: true });
  $('#vReveal').onclick = () => $$('#vaultGrid .tile').forEach(t => t.classList.add('revealed'));
  if (pin) $('#vClose').onclick = () => { vaultOpen = false; renderVault(); };
}

/* ---------- profile & settings ---------- */
async function renderProfile() {
  const s = idx.settings, items = idx.items;
  const photos = items.filter(i => i.type === 'photo').length, videos = items.filter(i => i.type === 'video').length, vaultN = items.filter(i => i.vault).length;
  const libBytes = items.reduce((a, i) => a + (i.stored || 0) + ((i.thumb && i.thumb.stored) || 0), 0);
  let est = {}; try { est = await navigator.storage.estimate(); } catch (e) { }
  let free = null; if (host && host.diskFree) { try { free = await host.diskFree(); } catch (e) { } }
  let persisted = null; try { persisted = await navigator.storage.persisted(); } catch (e) { }
  if (view !== 'profile' || !idx) return;
  const quota = free != null ? libBytes + free : (est.quota || 0);
  const frac = quota ? Math.min(1, libBytes / quota) : 0;
  const [num, unit] = bytes(libBytes).split(' ');
  $('#profileBody').innerHTML = `<div class="eyebrow">Profile &amp; storage</div><div class="script">Velvet</div>
    <div class="ring-wrap"><svg viewBox="0 0 200 200"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7AB4"/><stop offset=".5" stop-color="#FF2E88"/><stop offset="1" stop-color="#C2185B"/></linearGradient></defs><circle class="ring-bg" cx="100" cy="100" r="86"/><circle class="ring-fg" id="ring" cx="100" cy="100" r="86"/></svg>
      <div class="ring-label"><b>${num}<small>${unit}</small></b><span>${quota ? 'of ' + bytes(quota) + (free != null ? ' (disk)' : ' available') : 'used'}</span><span data-ic="lockSm"></span></div></div>
    <div class="stat-grid"><div class="stat"><b>${photos}</b><span>Photos</span></div><div class="stat"><b>${videos}</b><span>Videos</span></div><div class="stat"><b>${vaultN}</b><span>In vault</span></div></div>
    <div class="card rows">
      <div class="row">${IC.disk}<div class="meta">Library size<small>Encrypted data on this device</small></div><span class="v">${bytes(libBytes)}</span></div>
      <div class="row">${IC.bolt}<div class="meta">${free != null ? 'Free disk space' : 'Browser storage used'}<small>${free != null ? 'On the drive that holds Velvet' : 'Velvet + app files (estimate)'}</small></div><span class="v">${free != null ? bytes(free) : bytes(est.usage || 0)}</span></div>
      ${!host ? `<div class="row">${IC.shield}<div class="meta">Protected from cleanup<small>${persisted ? 'Storage marked persistent' : 'Not guaranteed — see tip below'}</small></div><span class="v">${persisted ? 'Yes' : 'No'}</span></div>` : ''}
    </div>
    <div class="card rows">
      <div class="row"><div class="meta">Auto-lock<small>Lock after inactivity</small></div><select id="alMin">${[1, 2, 5, 10, 30].map(m => `<option value="${m}" ${s.autolockMin == m ? 'selected' : ''}>${m} min</option>`).join('')}</select><button class="switch" role="switch" data-key="autolock" aria-checked="${s.autolock}" aria-label="Auto-lock"></button></div>
      <div class="row"><div class="meta">Lock when hidden<small>Lock as soon as you switch apps or minimise</small></div><button class="switch" role="switch" data-key="lockOnHide" aria-checked="${s.lockOnHide}" aria-label="Lock when hidden"></button></div>
      <div class="row"><div class="meta">Video chapters<small>Find scenes automatically when you open a video (on this device)</small></div><button class="switch" role="switch" data-key="autoChapters" aria-checked="${s.autoChapters !== false}" aria-label="Video chapters"></button></div>
      <div class="row"><div class="meta">Hide from recents<small>Blur Velvet when it loses focus</small></div><button class="switch" role="switch" data-key="hide" aria-checked="${s.hide}" aria-label="Hide from recents"></button></div>
      <div class="row"><div class="meta">Vault PIN<small>${s.vaultPin ? 'On: vault asks for a second PIN' : 'Off: vault opens with your passcode session'}</small></div><button class="btn btn-ghost btn-sm" id="vpinBtn">${s.vaultPin ? 'Change / remove' : 'Set PIN'}</button></div>
      <div class="row"><div class="meta">Passcode<small>Re-wraps your key; files aren’t re-encrypted</small></div><button class="btn btn-ghost btn-sm" id="chPass">Change</button></div>
    </div>
    ${aiCard()}
    <div class="card rows">
      <div class="row">${IC.download}<div class="meta">Back up library<small>One encrypted .velvet file. Move it to another device and restore.</small></div><button class="btn btn-primary btn-sm" id="bkBtn">Export</button></div>
      <div class="row">${IC.upload}<div class="meta">Restore from backup<small>Replaces the library on this device</small></div><button class="btn btn-ghost btn-sm" id="rsBtn">Restore</button></div>
      ${host ? `<div class="row">${IC.folder}<div class="meta">Data folder<small>Where Velvet keeps its encrypted data</small></div><button class="btn btn-ghost btn-sm" id="dataBtn">Open</button></div>` : ''}
      <div class="row">${IC.photo}<div class="meta">Regenerate previews<small>Rebuild thumbnails for everything already in Velvet</small></div><button class="btn btn-ghost btn-sm" id="regenBtn">Rebuild</button></div>
      <div class="row">${IC.trash}<div class="meta">Erase everything<small>Deletes the passcode and every file in Velvet</small></div><button class="btn btn-danger btn-sm" id="wipeBtn">Erase</button></div>
    </div>
    ${!host && isIOS && !standalone ? `<div class="install-tip"><b>Install Velvet:</b> tap the Share button, then <b>Add to Home Screen</b>. Safari can clear data from websites you haven’t opened for a while. Installed apps are much safer, and you should still export a backup now and then.</div>` : ''}
    ${!host && !isIOS && !persisted ? `<div class="install-tip">Install Velvet from your browser’s menu (Install app) so the browser keeps your library safe from automatic cleanup.</div>` : ''}
    <p class="sub-note">Forgot your passcode? There is no recovery. Your files are encrypted with it, so keep a backup and remember the passcode.</p>
    <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" data-act="import">${IC.plus}Import media</button><button class="btn btn-ghost" data-act="lock">${IC.lock}Lock now</button></div>`;
  hydrateIcons($('#profileBody'));
  const ring = $('#ring'), RC = 2 * Math.PI * 86; ring.style.strokeDasharray = RC; ring.style.strokeDashoffset = RC;
  requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = RC * (1 - Math.max(frac, libBytes ? 0.02 : 0)); }));
  $$('#profileBody .switch').forEach(sw => sw.onclick = () => { const k = sw.dataset.key; if (k === 'autoChapters' && s[k] === undefined) s[k] = true; s[k] = !s[k]; sw.setAttribute('aria-checked', String(s[k])); save(); resetIdle(); if (k === 'hide' && host && host.setPrivacy) host.setPrivacy(s.hide); toast({ autolock: s[k] ? `Auto-lock on (${s.autolockMin} min)` : 'Auto-lock off', lockOnHide: s[k] ? 'Velvet locks when hidden' : 'Lock-when-hidden off', hide: s[k] ? 'Velvet blurs when it loses focus' : 'Blur off', autoChapters: s[k] ? 'Chapters are found automatically' : 'Chapters only when you ask' }[k]); });
  $('#alMin').onchange = e => { s.autolockMin = +e.target.value; save(); resetIdle(); };
  $('#vpinBtn').onclick = vaultPinFlow; $('#chPass').onclick = changePassFlow; $('#bkBtn').onclick = exportBackup; $('#rsBtn').onclick = () => startRestore();
  bindAICard(); $('#regenBtn').onclick = () => regenPreviews(); $('#wipeBtn').onclick = wipeFlow; if (host) $('#dataBtn').onclick = () => host.openDataFolder();
}
async function vaultPinFlow() {
  const s = idx.settings;
  if (s.vaultPin) {
    const r = await modal(`<h3>Vault PIN</h3><div class="menu"><button data-r="change">${IC.key}Change PIN</button><button class="danger" data-r="remove">${IC.trash}Remove PIN</button></div><div class="actions"><button class="btn btn-ghost" data-r="">Close</button></div>`);
    if (r === 'remove') { s.vaultPin = null; vaultOpen = false; await save(); renderProfile(); toast('Vault PIN removed'); return; }
    if (r !== 'change') return;
  }
  const p = await promptBox('Set vault PIN', 'At least 4 digits or characters. It protects the Vault even while Velvet is unlocked.', '', 'Save', 'password');
  if (p == null) return; if (p.length < 4) { toast('PIN must be at least 4 characters'); return; }
  s.vaultPin = await Store.vaultHash(p); vaultOpen = false; await save(); renderProfile(); toast('Vault PIN set');
}
async function changePassFlow() {
  const r = await modal(`<h3>Change passcode</h3><p>Your files stay encrypted. Only the key wrapper changes.</p><input class="field" id="o" type="password" placeholder="Current passcode"><div style="height:8px"></div><input class="field" id="n1" type="password" placeholder="New passcode (min 6)"><div style="height:8px"></div><input class="field" id="n2" type="password" placeholder="Repeat new passcode"><div class="err" id="cErr" style="margin-top:8px"></div><div class="actions"><button class="btn btn-ghost" data-r="">Cancel</button><button class="btn btn-primary" id="cGo">Change</button></div>`, (m, close) => {
    m.querySelector('#cGo').onclick = async () => {
      const o = m.querySelector('#o').value, a = m.querySelector('#n1').value, b = m.querySelector('#n2').value, err = m.querySelector('#cErr');
      if (a.length < 6) { err.textContent = 'Use at least 6 characters.'; return; } if (a !== b) { err.textContent = 'New passcodes don’t match.'; return; }
      m.querySelector('#cGo').disabled = true; const ok = await Store.changePasscode(o, a); m.querySelector('#cGo').disabled = false;
      if (!ok) { err.textContent = 'Current passcode is wrong.'; return; } close('ok');
    };
  });
  if (r === 'ok') toast('Passcode changed');
}
async function wipeFlow() {
  const r = await promptBox('Erase everything?', 'This permanently deletes every photo, video, collection and your passcode from Velvet on this device. Type <b>ERASE</b> to confirm.', '', 'Erase');
  if (r !== 'ERASE') { if (r != null) toast('Not erased. You need to type ERASE.'); return; }
  closePlayer(); closeLightbox(); for (const u of thumbs.values()) URL.revokeObjectURL(u); thumbs.clear(); fulls.clear();
  await Store.wipe(); idx = null; app.classList.add('locked'); lockEl.classList.add('open'); gateSetup(); toast('Velvet was erased');
}

/* ---------- import ---------- */
const EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
const extOf = n => (n.split('.').pop() || '').toLowerCase();
function mimeOf(f) { const t = (f.type || '').toLowerCase(); if (/^(image|video)\//.test(t)) return t; return EXT[extOf(f.name)] || ''; }
const LIMIT = isIOS ? 400 * 1024 ** 2 : 2 * 1024 ** 3;
let pendingCol = null;
function pickFiles(colId) { pendingCol = colId || (view === 'collection' ? curCol : null); $('#file').click(); }
$('#file').addEventListener('change', e => { const fs = Array.from(e.target.files || []).map(f => ({ file: f })); e.target.value = ''; importFiles(fs, pendingCol); pendingCol = null; });
$('#folder').addEventListener('change', e => { const fs = Array.from(e.target.files || []).map(f => ({ file: f, folder: (f.webkitRelativePath || '').split('/')[0] || null })); e.target.value = ''; importFiles(fs, null); });

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]); }
async function makeThumb(f, type, mime) { return type === 'video' ? Thumbs.videoThumb(f, mime) : Thumbs.imageThumb(f, mime); }
async function importFiles(entries, colId) {
  if (!idx) return;
  const ok = entries.filter(e => mimeOf(e.file)), skipped = entries.length - ok.length;
  if (!ok.length) { toast(skipped ? 'Those files aren’t photos or videos Velvet can open.' : 'No files selected'); return; }
  const big = ok.filter(e => e.file.size > LIMIT);
  if (big.length && !(await confirmBox('Very large file' + (big.length > 1 ? 's' : ''), `${big.length} file(s) are over ${bytes(LIMIT)} (largest ${bytes(Math.max(...big.map(e => e.file.size)))}). Velvet decrypts a video into memory to play it, so ${isIOS ? 'an iPhone may not be able to play files this big' : 'playback needs that much free RAM'}. Import anyway?`, 'Import anyway'))) return;
  const folderCols = new Map();
  let done = 0, failed = 0;
  for (const e of ok) {
    const f = e.file, mime = mimeOf(f), type = mime.startsWith('video') ? 'video' : 'photo';
    progress(`Importing ${done + 1} of ${ok.length} · ${f.name}`, done / ok.length);
    const id = uid();
    try {
      let th = null; try { th = await withTimeout(makeThumb(f, type, mime), 45000); } catch (err) { console.warn('thumb failed', f.name, err); }
      if (type === 'photo' && !th && !Thumbs.isHeic(mime, f.name)) throw new Error('This image format can’t be displayed here');
      const res = await Store.putFile(id, f, p => progress(`Importing ${done + 1} of ${ok.length} · ${f.name}`, (done + p * .95) / ok.length));
      let thumb = null;
      if (th && th.blob) { const tr = await Store.putFile(id + '_t', th.blob); thumb = { id: id + '_t', chunks: tr.chunks, stored: tr.stored }; }
      const it = { id, type, title: f.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Untitled', name: f.name, ext: extOf(f.name), mime, size: f.size, chunks: res.chunks, stored: res.stored,
        added: Date.now() + done, modified: f.lastModified || null, taken: await Vision.captureDate(f, mime), tags: [], fav: false, cols: [], vault: view === 'vault', thumb, ar: th ? (th.w / th.h) : (type === 'video' ? 16 / 9 : 1), dur: th && th.dur || 0, w: th && th.w, h: th && th.h, codec: th && th.codec || '', thumbT: th && th.t != null ? th.t : null };
      if (colId && colById(colId)) it.cols.push(colId);
      if (e.folder) {
        let c = folderCols.get(e.folder) || idx.collections.find(x => x.name === e.folder);
        if (!c) { c = { id: uid(), name: e.folder.slice(0, 60), cover: null, created: Date.now() }; idx.collections.push(c); }
        folderCols.set(e.folder, c); if (!it.cols.includes(c.id)) it.cols.push(c.id);
      }
      idx.items.push(it); done++;
      if (done % 5 === 0) await save();
    } catch (err) {
      failed++; console.warn('import failed', f.name, err); await Store.deleteFile(id).catch(() => { }); await Store.deleteFile(id + '_t').catch(() => { });
      if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message))) { toast('Storage is full, so the import stopped.', 5000); break; }
    }
  }
  await save(); progress(null); render(); if (aiOn() && done) setTimeout(startAI, 800);
  toast(`Added ${done} item${done === 1 ? '' : 's'}${failed ? ` · ${failed} couldn’t be imported` : ''}${skipped ? ` · ${skipped} skipped` : ''}${folderCols.size ? ` · ${folderCols.size} collection${folderCols.size > 1 ? 's' : ''} created from folders` : ''}`, 4000);
}
// drag & drop (files and whole folders)
async function readEntry(entry, top, out) {
  if (entry.isFile) { await new Promise(res => entry.file(f => { out.push({ file: f, folder: top }); res(); }, res)); return; }
  if (entry.isDirectory) {
    const r = entry.createReader(); let batch;
    do { batch = await new Promise(res => r.readEntries(res, () => res([]))); for (const en of batch) await readEntry(en, top || entry.name, out); } while (batch.length);
  }
}
let dragN = 0; const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragenter', e => { if (isLocked() || !hasFiles(e)) return; dragN++; $('#drop').classList.add('show'); });
window.addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('#drop').classList.remove('show'); });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', async e => {
  if (!hasFiles(e)) return; e.preventDefault(); dragN = 0; $('#drop').classList.remove('show'); if (isLocked()) return;
  const out = []; const its = Array.from(e.dataTransfer.items || []);
  const entries = its.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.length) { for (const en of entries) await readEntry(en, en.isDirectory ? en.name : null, out); }
  else Array.from(e.dataTransfer.files).forEach(f => out.push({ file: f }));
  importFiles(out, view === 'collection' ? curCol : null);
});

/* ---------- item actions ---------- */
/* ---------- on-device AI glue ---------- */
const aiOn = () => !!(idx && idx.settings.ai && idx.settings.ai.on);
let aiProg = null;
function drawAIChip() {
  let el = $('#aiChip'); if (!el) { el = document.createElement('button'); el.id = 'aiChip'; el.className = 'ai-chip'; el.onclick = () => nav('profile'); document.body.appendChild(el); }
  const act = p => p && (p.phase === 'indexing' || p.phase === 'loading' || p.phase === 'paused');
  const face = !act(aiProg) && act(pplProg), p = face ? pplProg : aiProg, show = act(p) && idx;
  el.classList.toggle('show', !!show); if (!show) return;
  el.innerHTML = face ? `${IC.people}<span>${p.phase === 'loading' ? 'Loading face models…' : p.phase === 'paused' ? 'People paused' : `Finding faces ${p.done}/${p.total}`}</span>`
    : `${IC.spark}<span>${p.phase === 'loading' ? 'Loading on-device AI…' : p.phase === 'paused' ? 'AI paused' : `AI indexing ${p.done}/${p.total}`}</span>`;
}
function aiStatusText() {
  if (!idx) return ''; const st = AI.stats(idx), p = aiProg;
  if (p && p.phase === 'loading') return 'Loading the on-device model…';
  if (p && p.phase === 'indexing') return `Indexing ${p.done} of ${p.total}${p.msPer ? ` · ${(p.msPer / 1000).toFixed(1)} s/item` : ''}${p.device ? ' · ' + p.device.toUpperCase() : ''}`;
  if (p && p.phase === 'paused') return `Paused while Velvet is in the background (${p.done} of ${p.total})`;
  return `${st.indexed} of ${st.total} indexed${p && p.phase === 'done' && p.device ? ' · ' + p.device.toUpperCase() : ''}`;
}
async function startAI() {
  if (!aiOn() || AI.isRunning() || !Store.isUnlocked()) return;
  const thumbBlob = async it => it.thumb ? Store.readFile(it.thumb.id, it.thumb.chunks, 'image/jpeg') : null;
  const fileBlob = async it => new File([await Store.readFile(it.id, it.chunks, it.mime)], it.name || it.title, { type: it.mime });
  try {
    await AI.indexLibrary({ idx, thumbBlob, fileBlob, maxVideoBytes: isIOS ? 150 * 1024 ** 2 : 1024 ** 3,
      onProgress: p => { aiProg = p; drawAIChip(); const s = $('#aiStatus'); if (s) s.textContent = aiStatusText(); },
      onItem: () => { } });
  } catch (e) { console.warn('AI indexing', e); aiProg = { phase: 'error' }; drawAIChip(); toast('On-device AI couldn’t start: ' + (e.message || e)); }
  if (idx && Store.isUnlocked()) { smartCache = null; await applyRules().catch(e => console.warn('rules', e)); }
  if (idx && (view === 'search' || view === 'profile' || view === 'library' || view === 'collections')) render();
  if (peopleOn() && idx && Store.isUnlocked() && !AI.isRunning()) startPeople();
}
function aiCard() {
  const on = aiOn(), st = AI.stats(idx);
  return `<div class="card rows" id="aiCard">
    <div class="row">${IC.spark}<div class="meta">On-device AI<small>Smart search, auto-tags and duplicate finder. Runs only on this device. Nothing is uploaded.</small></div><button class="switch" role="switch" id="aiSw" aria-checked="${on}" aria-label="On-device AI"></button></div>
    ${on ? `<div class="row"><div class="meta">Index library<small id="aiStatus">${aiStatusText()}</small></div><button class="btn btn-ghost btn-sm" id="aiIdx">${AI.isRunning() ? 'Pause' : 'Index now'}</button></div>
    <div class="row"><div class="meta">Duplicates &amp; similar<small>Review look-alikes side by side and keep the best</small></div><button class="btn btn-ghost btn-sm" id="aiDup">Review</button></div>
    <div class="row"><div class="meta">Best shots<small>Pick the best of bursts and look-alikes, archive the rest</small></div><button class="btn btn-ghost btn-sm" id="aiBest">Review</button></div>
    <div class="row"><div class="meta">Smart rules<small>${(idx.settings.rules || []).length ? (idx.settings.rules || []).filter(r => r.on).length + ' active · auto-move items by tag, AI search or person' : 'Auto-move items by tag, AI search or person into the Vault or a collection'}</small></div><button class="btn btn-ghost btn-sm" id="aiRules">Manage</button></div>
    ${peopleCardRows()}
    <div class="row"><div class="meta">AI data<small>Encrypted on this device. AI model ≈ ${AI.MODEL_MB} MB, downloaded once and works offline.</small></div><span class="v" id="aiBytes">${bytes(st.bytes)}</span><button class="btn btn-ghost btn-sm" id="aiWipe" style="margin-left:8px">Remove</button></div>` : ''}
    ${idx.items.some(i => i.archived) ? `<div class="row"><div class="meta">Archive<small>Hidden extras kept encrypted on this device</small></div><span class="v">${idx.items.filter(i => i.archived).length}</span><button class="btn btn-ghost btn-sm" id="aiArch" style="margin-left:8px">Open</button></div>` : ''}
  </div>`;
}
function bindAICard() {
  const sw = $('#aiSw'); if (!sw) return;
  sw.onclick = async () => {
    const s = idx.settings; s.ai = s.ai || {};
    if (!s.ai.on) {
      if (!(await confirmBox('Turn on on-device AI?', (host ? `Velvet will use its built-in AI model (about ${AI.MODEL_MB} MB, included with the app). ` : `Velvet will download its AI model (about ${AI.MODEL_MB} MB) once from this app’s own site, then work offline. `) + `Your photos are analysed only on this device. Nothing is uploaded, ever. Indexing runs in the background and pauses when Velvet is hidden.`, 'Turn on'))) return;
      s.ai.on = true; await save(); await AI.open(idx); renderProfile(); startAI();
    } else { s.ai.on = false; AI.stop(); People.stop(); await save(); renderProfile(); render(); }
  };
  bindPeopleCard();
  const ib = $('#aiIdx'); if (ib) ib.onclick = () => { if (AI.isRunning()) { AI.stop(); ib.textContent = 'Index now'; } else { startAI(); ib.textContent = 'Pause'; } };
  const db = $('#aiDup'); if (db) db.onclick = () => nav('dupes'); const bb = $('#aiBest'); if (bb) bb.onclick = () => nav('best'); const rb = $('#aiRules'); if (rb) rb.onclick = () => nav('rules'); const ab = $('#aiArch'); if (ab) ab.onclick = () => nav('archive');
  const wb = $('#aiWipe'); if (wb) wb.onclick = async () => { if (!(await confirmBox('Remove AI data?', 'Deletes smart-search data and AI tag suggestions from this device. Your photos, videos and your own tags stay. You can index again any time.', 'Remove', true))) return; AI.stop(); await AI.wipe(idx); renderProfile(); toast('AI data removed'); };
}
/* ---------- People (v1.4): on-device face grouping ---------- */
const peopleOn = () => aiOn() && People.on(idx);
let pplProg = null, curPerson = null, showHiddenPeople = false;
const visibleId = id => { const it = itemById(id); return !!(it && !it.vault && !it.archived); };
// face avatar: photos crop their (encrypted, already cached) thumbnail with CSS; video faces carry a tiny encrypted crop
function faceHTML(f, cls = '') {
  if (!f) return `<span class="face ${cls} none">${IC.user}</span>`;
  if (f.c) return `<span class="face ${cls}"><img alt="" src="data:image/jpeg;base64,${f.c}" style="width:100%;height:100%;left:0;top:0"></span>`;
  const it = itemById(f.itemId), W = (it && it.w) || 1000, H = (it && it.h) || Math.round(1000 / ((it && it.ar) || 1));
  const side = Math.max(f.b[2] * W, f.b[3] * H) * 1.45, sx = side / W, sy = side / H, cx = f.b[0] + f.b[2] / 2, cy = f.b[1] + f.b[3] / 2 - f.b[3] * .04;
  const st = `width:${(100 / sx).toFixed(2)}%;height:${(100 / sy).toFixed(2)}%;left:${(-(cx - sx / 2) / sx * 100).toFixed(2)}%;top:${(-(cy - sy / 2) / sy * 100).toFixed(2)}%`;
  return `<span class="face ${cls}"><img alt="" data-tid="${f.itemId}" style="${st}"></span>`;
}
function peopleList({ hidden = false } = {}) {
  return People.people().map((p, i) => ({ p, i, n: People.itemsOf(p, visibleId).length })).filter(x => x.n && (hidden || !x.p.hidden))
    .sort((a, b) => (!!b.p.name - !!a.p.name) || b.n - a.n);
}
const pName = p => p.name || 'Unnamed';
function personCard(x, k) {
  return `<button class="pcard ${x.p.hidden ? 'hidden' : ''}" data-person="${x.p.id}" style="--i:${k}">${faceHTML(People.cover(x.p, visibleId))}<b>${esc(pName(x.p))}</b><small>${x.n} item${x.n === 1 ? '' : 's'}${x.p.hidden ? ' · hidden' : ''}</small></button>`;
}
function bindPeople(root) { hydrateCovers(root); root.querySelectorAll('[data-person]').forEach(b => b.onclick = () => openPerson(b.dataset.person)); }
function peopleRowHTML(title) {
  if (!peopleOn() || !People.isOpen()) return '';
  const L = peopleList().slice(0, 14);
  if (!L.length) return `<div class="sub-h smart-h">${IC.people}People</div><div class="smart-empty">${IC.people}<span>${People.isRunning() || (pplProg && pplProg.phase === 'indexing') ? 'Finding faces on this device…' : 'People appear here when someone shows up in at least two photos or videos.'}</span></div>`;
  return `<div class="sub-h smart-h people-h">${IC.people}${title}<button class="btn btn-ghost btn-sm" data-nav="people">See all</button></div><div class="prow">${L.map(personCard).join('')}</div>`;
}
async function renderPeopleRow(sel) {
  const el = $(sel); if (!el) return;
  if (!peopleOn()) { el.innerHTML = ''; return; }
  await People.open(idx); el.innerHTML = peopleRowHTML('People'); bindPeople(el);
}
function openPerson(id) { curPerson = id; nav('person'); }
function renderPeople() {
  const body = $('#peopleBody'); if (!body) return;
  if (!peopleOn()) { body.innerHTML = `<div class="empty"><b>People is off</b>Turn it on in Profile → On-device AI → People.</div>`; return; }
  if (!People.isOpen()) { People.open(idx).then(() => view === 'people' && renderPeople()); body.innerHTML = '<div class="lb-loading" style="margin:40px auto"></div>'; return; }
  const all = peopleList({ hidden: true }), L = all.filter(x => showHiddenPeople || !x.p.hidden), nh = all.filter(x => x.p.hidden).length, st = People.stats(idx);
  body.innerHTML = `<div class="section-title"><h2>People</h2><span>${L.length} ${L.length === 1 ? 'person' : 'people'}</span></div>
    <p class="sub-note">Faces are found and grouped on this device. Names and face data are encrypted and never leave it. ${People.isRunning() ? `Finding faces… ${pplProg && pplProg.total ? `${pplProg.done}/${pplProg.total}` : ''}` : `${st.faces} faces in ${st.indexed} of ${st.total} items`}</p>
    ${nh ? `<div class="dact top"><button class="btn btn-ghost btn-sm" id="pplHidden">${showHiddenPeople ? 'Hide hidden people' : `Show hidden (${nh})`}</button></div>` : ''}
    <div class="pgrid">${L.map(personCard).join('') || `<div class="empty"><b>No people yet</b>People appear when someone shows up in at least two photos or videos.</div>`}</div>`;
  bindPeople(body); hydrateIcons(body);
  const hb = $('#pplHidden'); if (hb) hb.onclick = () => { showHiddenPeople = !showHiddenPeople; renderPeople(); };
}
const remapRules = (from, to) => (idx.settings.rules || []).forEach(r => { if (r.kind === 'person' && r.value === from) r.value = to; });
async function peopleChanged(msg) { await People.persist(idx); smartCache = null; if (msg) toast(msg); await applyRules({ quiet: false }).catch(() => { }); }
function renderPerson() {
  const body = $('#personBody'); if (!body) return;
  if (!peopleOn() || !People.isOpen()) { nav('people'); return; }
  const p = People.person(curPerson); if (!p) { nav('people'); return; }
  const items = People.itemsOf(p, visibleId).map(itemById), cv = People.cover(p, visibleId);
  const faces = p.faces.map(People.faceInfo).filter(f => f && visibleId(f.itemId));
  body.innerHTML = `<div class="phero">${faceHTML(cv, 'big')}<div class="pmeta"><h2 id="pName" class="${p.name ? '' : 'unnamed'}">${esc(p.name || 'Add a name')}</h2><p>${items.length} item${items.length === 1 ? '' : 's'} · ${faces.length} face${faces.length === 1 ? '' : 's'}${p.hidden ? ' · hidden' : ''}</p>
      <div class="pact"><button class="btn btn-primary btn-sm" id="pRen">${IC.edit || IC.tag}<span>${p.name ? 'Rename' : 'Name'}</span></button><button class="btn btn-ghost btn-sm" id="pMerge">${IC.people}<span>Merge…</span></button>
      <button class="btn btn-ghost btn-sm" id="pReel">${IC.reel}<span>Highlights</span></button><button class="btn btn-ghost btn-sm" id="pRule">${IC.vault}<span>Auto-move…</span></button><button class="btn btn-ghost btn-sm" id="pHide">${p.hidden ? 'Unhide' : 'Hide'}</button></div></div></div>
    <div class="sub-h">Faces<span class="sub-hint">Tap faces that aren’t ${esc(p.name || 'this person')} to fix the group</span></div>
    <div class="frow" id="pFaces">${faces.map(f => `<button class="fpick" data-fk="${esc(f.key)}" title="${esc((itemById(f.itemId) || {}).title || '')}">${faceHTML(f)}<i>${IC.check}</i></button>`).join('')}</div>
    <div class="dact top fbar" id="pFbar"><span id="pSel">0 selected</span><button class="btn btn-ghost btn-sm" id="pNot">Not ${esc(p.name || 'this person')}</button><button class="btn btn-ghost btn-sm" id="pSplit">Move to new person</button><button class="btn btn-ghost btn-sm" id="pMove">Move to…</button></div>
    <div class="sub-h">Photos &amp; videos</div><div class="grid" id="personGrid"></div>`;
  hydrateIcons(body); hydrateCovers(body); bindGrid($('#personGrid'));
  renderGrid($('#personGrid'), sortNew(items), `<div class="empty"><b>Nothing to show</b>Their photos may be in the Vault or archived.</div>`);
  const picked = () => [...body.querySelectorAll('.fpick.on')].map(b => b.dataset.fk);
  const upd = () => { const n = picked().length; $('#pSel').textContent = `${n} selected`; $('#pFbar').classList.toggle('show', n > 0); };
  body.querySelectorAll('.fpick').forEach(b => b.onclick = () => { b.classList.toggle('on'); upd(); });
  $('#pRen').onclick = $('#pName').onclick = async () => {
    const n = await promptBox(p.name ? 'Rename person' : 'Name this person', 'Names are encrypted and stay on this device. Use the same name on two people to merge them.', p.name, 'Save'); if (n == null) return;
    const other = n.trim() && People.byName(n); if (other && other !== p) { if (!(await confirmBox('Merge people?', `“${esc(n.trim())}” already exists. Merge these faces into that person?`, 'Merge'))) return; People.merge(other.id, p.id); remapRules(p.id, other.id); curPerson = other.id; await peopleChanged(`Merged into ${n.trim()}`); renderPerson(); return; }
    People.rename(p.id, n); await peopleChanged(n.trim() ? `Named “${n.trim()}”` : 'Name removed'); renderPerson(); };
  $('#pHide').onclick = async () => { People.setHidden(p.id, !p.hidden); await peopleChanged(p.hidden ? `${pName(p)} is hidden from People and search` : `${pName(p)} is visible again`); renderPerson(); };
  $('#pReel').onclick = () => openReel(items, p.name || 'Person');
  $('#pRule').onclick = () => addRuleDialog({ person: p.id });
  const pickPerson = async (title, text) => { const L = peopleList({ hidden: true }).filter(x => x.p !== p); if (!L.length) { toast('There’s nobody else to pick yet'); return null; }
    return modal(`<h3>${esc(title)}</h3><p>${text}</p><div class="pgrid pick">${L.map(personCard).join('')}</div><div class="actions"><button class="btn btn-ghost" data-r="">Cancel</button></div>`, (m, close) => { bindPeople(m); m.querySelectorAll('[data-person]').forEach(b => b.onclick = () => close(b.dataset.person)); }); };
  $('#pMerge').onclick = async () => { const id = await pickPerson('Merge with…', `Pick the same person to combine their faces with ${esc(pName(p))}.`); if (!id || typeof id !== 'string') return; const o = People.person(id); People.merge(p.id, id); remapRules(id, p.id); await peopleChanged(`Merged ${esc(pName(o))} into ${pName(p)}`); renderPerson(); };
  $('#pNot').onclick = async () => { const ks = picked(); if (!ks.length) return; People.notThis(p.id, ks); People.recluster(); await peopleChanged(`Removed ${ks.length} face${ks.length === 1 ? '' : 's'} from ${pName(p)}`); People.person(p.id) ? renderPerson() : nav('people'); };
  $('#pSplit').onclick = async () => { const ks = picked(); if (!ks.length) return; const q = People.moveFaces(p.id, ks); await peopleChanged(`Moved ${ks.length} face${ks.length === 1 ? '' : 's'} to a new person`); openPerson(q.id); };
  $('#pMove').onclick = async () => { const ks = picked(); if (!ks.length) return; const id = await pickPerson('Move faces to…', 'Pick who these faces belong to.'); if (!id || typeof id !== 'string') return; People.moveFaces(p.id, ks, id); await peopleChanged(`Moved ${ks.length} face${ks.length === 1 ? '' : 's'}`); People.person(p.id) ? renderPerson() : openPerson(id); };
}
function pplStatusText() {
  if (!idx || !People.isOpen()) return 'Faces are found on this device only';
  const st = People.stats(idx), p = pplProg;
  if (p && p.phase === 'loading') return 'Loading the face models…';
  if (p && p.phase === 'indexing') return `Finding faces ${p.done} of ${p.total}${p.msPer ? ` · ${(p.msPer / 1000).toFixed(1)} s/item` : ''}`;
  if (p && p.phase === 'paused') return `Paused while Velvet is in the background (${p.done} of ${p.total})`;
  const n = peopleList({ hidden: true }).length; return `${n} ${n === 1 ? 'person' : 'people'} · ${st.faces} faces · ${st.indexed} of ${st.total} items checked`;
}
async function startPeople() {
  if (!peopleOn() || People.isRunning() || !Store.isUnlocked()) return;
  if (AI.isRunning()) return; // startAI() chains into startPeople() when it finishes; they share one worker
  const thumbBlob = async it => it.thumb ? Store.readFile(it.thumb.id, it.thumb.chunks, 'image/jpeg') : null;
  const fileBlob = async it => new File([await Store.readFile(it.id, it.chunks, it.mime)], it.name || it.title, { type: it.mime });
  const refresh = () => { if (!idx) return; if (view === 'people') renderPeople(); else if (view === 'collections') renderPeopleRow('#peopleRow'); else if (view === 'search' && !$('#q').value) renderPeopleRow('#searchPeople'); };
  try {
    await People.indexFaces({ idx, thumbBlob, fileBlob, maxVideoBytes: isIOS ? 150 * 1024 ** 2 : 1024 ** 3,
      onProgress: p => { pplProg = p; drawAIChip(); const s = $('#pplStatus'); if (s) s.textContent = pplStatusText(); }, onBatch: refresh });
  } catch (e) { console.warn('People indexing', e); pplProg = { phase: 'error' }; drawAIChip(); toast('People couldn’t start: ' + (e.message || e)); }
  if (idx && Store.isUnlocked()) { await applyRules().catch(e => console.warn('rules', e)); refresh(); if (view === 'profile') { const s = $('#pplStatus'); if (s) s.textContent = pplStatusText(); } }
}
function peopleCardRows() {
  const on = People.on(idx), st = People.isOpen() ? People.stats(idx) : null;
  return `<div class="row">${IC.people}<div class="meta">People<small>Group faces into people, name them and search by name. Face data is encrypted and stays on this device.</small></div><button class="switch" role="switch" id="pplSw" aria-checked="${on}" aria-label="People"></button></div>
    ${on ? `<div class="row"><div class="meta">Faces<small id="pplStatus">${pplStatusText()}</small></div><button class="btn btn-ghost btn-sm" id="pplOpen">Open</button></div>
    <div class="row"><div class="meta">People data<small>Encrypted on this device. Face models ≈ ${People.MODEL_MB} MB, downloaded once.</small></div><span class="v">${bytes((st && st.bytes) || (idx.settings.faces && idx.settings.faces.file && idx.settings.faces.file.stored) || 0)}</span><button class="btn btn-ghost btn-sm" id="pplWipe" style="margin-left:8px">Remove</button></div>` : ''}`;
}
function bindPeopleCard() {
  const sw = $('#pplSw'); if (!sw) return;
  sw.onclick = async () => {
    const s = idx.settings; s.faces = s.faces || {};
    if (!s.faces.on) {
      if (!(await confirmBox('Turn on People?', (host ? `Velvet will use its built-in face models (about ${People.MODEL_MB} MB). ` : `Velvet will download two small face models (about ${People.MODEL_MB} MB) once from this app’s own site. `) + 'It finds faces in your photos and videos <b>on this device only</b> and groups them into people. Face data and names are encrypted with your passcode and never uploaded. You can remove it any time.', 'Turn on'))) return;
      s.faces.on = true; await save(); await People.open(idx); renderProfile(); startPeople();
    } else { s.faces.on = false; People.stop(); await save(); renderProfile(); toast('People is off. Face data is kept (encrypted) until you remove it.'); }
  };
  const ob = $('#pplOpen'); if (ob) ob.onclick = () => nav('people');
  const wb = $('#pplWipe'); if (wb) wb.onclick = async () => { if (!(await confirmBox('Remove People data?', 'Deletes all face data and names from this device and turns People off. Person-based smart rules are paused. Your photos and videos stay.', 'Remove', true))) return; await People.wipe(idx); pplProg = null; renderProfile(); toast('People data removed'); };
}

/* ---------- duplicates & similar ---------- */
let dupState = null;
$('#dupBack').onclick = () => nav('profile');
async function renderDupes() {
  const body = $('#dupesBody'); if (!body) return;
  if (!aiOn()) { body.innerHTML = `<div class="empty"><b>On-device AI is off</b>Turn it on in Profile to find duplicates.</div>`; return; }
  await AI.open(idx);
  const st = AI.stats(idx);
  body.innerHTML = `<div class="section-title"><h2>Duplicates &amp; similar</h2><span>${st.indexed} of ${st.total} indexed</span></div><div class="lb-loading" style="margin:40px auto"></div>`;
  const g = await AI.findGroups(visible());
  if (view !== 'dupes') return;
  const keepOf = ids => ids.slice().sort((a, b) => AI.quality(itemById(b)) - AI.quality(itemById(a)))[0];
  dupState = { picks: new Map() };
  const card = (ids, kind, gi) => { const keep = keepOf(ids), dup = kind === 'd'; return `<div class="dgroup" data-g="${kind}${gi}">
      <div class="dgh"><b>${dup ? 'Duplicates' : 'Similar'} · ${ids.length}</b><span>${dup ? 'Velvet pre-selected the best one to keep (highest resolution and quality).' : 'These look alike but may be different shots. Nothing is selected — tick the ones you want to delete.'}</span></div>
      <div class="drow">${ids.map(id => { const it = itemById(id); const k = !dup || id === keep; return `<label class="dtile ${k ? 'keep' : ''}" data-id="${id}"><input type="checkbox" ${k ? '' : 'checked'} data-del="${id}"><div class="dimg" style="--ar:${Math.max(.5, Math.min(2, it.ar || 1))}"><img data-tid="${id}" alt=""></div><small>${esc(it.title)}<br>${it.w ? it.w + '×' + it.h + ' · ' : ''}${bytes(it.size)}</small><span class="kb">${k ? 'Keep' : 'Delete'}</span></label>`; }).join('')}</div>
      <div class="dact"><button class="btn btn-danger btn-sm" data-delg="${kind}${gi}">${IC.trash}Delete selected</button></div></div>`; };
  body.innerHTML = `<div class="section-title"><h2>Duplicates &amp; similar</h2><span>${st.indexed} of ${st.total} indexed</span></div>
    ${st.indexed < st.total ? `<p class="sub-note">Still indexing (${st.total - st.indexed} to go). More groups may appear.</p>` : ''}
    ${g.dupes.length ? `<h3 class="dsec">Duplicates</h3>` + g.dupes.map((ids, i) => card(ids, 'd', i)).join('') : ''}
    ${g.similar.length ? `<h3 class="dsec">Similar</h3>` + g.similar.map((ids, i) => card(ids, 's', i)).join('') : ''}
    ${!g.dupes.length && !g.similar.length ? `<div class="empty"><b>No duplicates found</b>Nothing in your library looks the same.</div>` : ''}`;
  hydrateCovers(body); hydrateIcons(body);
  body.querySelectorAll('input[data-del]').forEach(cb => cb.onchange = () => { const t = cb.closest('.dtile'); t.classList.toggle('keep', !cb.checked); t.querySelector('.kb').textContent = cb.checked ? 'Delete' : 'Keep'; });
  body.querySelectorAll('[data-delg]').forEach(b => b.onclick = async () => {
    const grp = b.closest('.dgroup'), ids = [...grp.querySelectorAll('input[data-del]:checked')].map(x => x.dataset.del), all = grp.querySelectorAll('input[data-del]').length;
    if (!ids.length) { toast('Nothing selected to delete'); return; }
    if (ids.length === all && !(await confirmBox('Delete every copy?', 'You selected all items in this group, so nothing will be kept.', 'Continue', true))) return;
    if (await deleteItems(ids)) nav('dupes', { keepScroll: true });
  });
}
async function replaceThumb(it, blob) {
  if (it.thumb) await Store.deleteFile(it.thumb.id);
  const tid = it.id + '_t', tr = await Store.putFile(tid, blob); it.thumb = { id: tid, chunks: tr.chunks, stored: tr.stored };
  if (thumbs.has(it.id)) { URL.revokeObjectURL(thumbs.get(it.id)); thumbs.delete(it.id); }
}
async function setPreviewFromPlayer() {
  if (!curVid) return; const it = curVid;
  try {
    if (!vid.videoWidth || vid.readyState < 2) throw new Error('not ready');
    const b = await Thumbs.frameFromVideo(vid);
    await replaceThumb(it, b); it.thumbT = +vid.currentTime.toFixed(3); it.w = vid.videoWidth; it.h = vid.videoHeight; it.ar = it.w / it.h;
    await save(); render(); flash('Preview set to ' + fmt(vid.currentTime));
  } catch (e) { console.warn('set preview', e); flash('Couldn’t capture this frame. Try again once the video is playing.'); }
}
async function regenPreviews(opts = {}) {
  const items = idx.items.slice(); if (!items.length) { toast('Nothing to rebuild yet'); return; }
  if (!opts.noConfirm && !(await confirmBox('Regenerate previews?', `Velvet will decrypt each of your ${items.length} item(s) on this device and rebuild its thumbnail. Your files aren’t changed.`, 'Rebuild'))) return;
  let ok = 0, none = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; progress(`Rebuilding previews · ${i + 1} of ${items.length}`, i / items.length);
    try {
      if (it.size > LIMIT) { none++; continue; }
      const b = await Store.readFile(it.id, it.chunks, it.mime); if (!Store.isUnlocked()) return;
      const f = new File([b], it.name || it.title, { type: it.mime });
      const th = await withTimeout(makeThumb(f, it.type, it.mime), 45000).catch(e => { console.warn('regen', it.name, e); return null; });
      if (th) { if (th.dur) it.dur = th.dur; if (th.codec) it.codec = th.codec; if (th.w && th.h && (th.blob || !it.thumb)) { it.w = th.w; it.h = th.h; it.ar = th.w / th.h; } }
      if (th && th.blob) { await replaceThumb(it, th.blob); if (th.t != null) it.thumbT = th.t; ok++; } else none++;
    } catch (e) { console.warn('regen failed', it.name, e); none++; }
    if (i % 10 === 9) await Store.saveIndex(idx);
  }
  await Store.saveIndex(idx); progress(null); render();
  toast(`Rebuilt ${ok} preview${ok === 1 ? '' : 's'}` + (none ? ` · ${none} couldn’t be read on this device` : ''));
}
async function getFull(it, onP) {
  let u = fulls.get(it.id); if (u) { fulls.delete(it.id); fulls.set(it.id, u); return u; }
  const type = it.type === 'video' && it.mime === 'video/quicktime' && !isIOS ? 'video/mp4' : it.mime;
  let b = await Store.readFile(it.id, it.chunks, type, onP); if (!Store.isUnlocked()) throw new Error('locked');
  if (it.type === 'photo' && Thumbs.isHeic(it.mime, it.name)) b = await Thumbs.displayableImage(b, it.mime, it.name);
  u = URL.createObjectURL(b); fulls.set(it.id, u);
  const maxKeep = 6; for (const [k, v] of fulls) { if (fulls.size <= maxKeep) break; if (k !== it.id && (!curVid || k !== curVid.id)) { URL.revokeObjectURL(v); fulls.delete(k); } }
  if (it.type === 'video') for (const [k, v] of fulls) { const o = itemById(k); if (k !== it.id && o && o.type === 'video') { URL.revokeObjectURL(v); fulls.delete(k); } } // keep only one decrypted video in memory
  return u;
}
async function saveBlob(blob, name) {
  if (isIOS && navigator.canShare) { const f = new File([blob], name, { type: blob.type }); if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function exportItem(it) {
  progress('Decrypting ' + it.title, 0);
  try { const b = await Store.readFile(it.id, it.chunks, it.mime, p => progress('Decrypting ' + it.title, p)); progress(null); await saveBlob(b, (it.title || 'velvet') + '.' + (it.ext || (it.type === 'video' ? 'mp4' : 'jpg'))); }
  catch (e) { progress(null); toast('Couldn’t export: ' + e.message); }
}
async function deleteItems(ids) {
  const n = ids.length; if (!n) return false;
  if (!(await confirmBox(`Delete ${n === 1 ? 'this item' : n + ' items'}?`, 'They’ll be permanently removed from Velvet on this device. Originals elsewhere aren’t affected.', 'Delete', true))) return false;
  for (const id of ids) {
    const it = itemById(id); if (!it) continue;
    await Store.deleteFile(id); if (it.thumb) await Store.deleteFile(it.thumb.id); if (it.chap && it.chap.file) await Store.deleteFile(it.chap.file.id).catch(() => { });
    if (thumbs.has(id)) { URL.revokeObjectURL(thumbs.get(id)); thumbs.delete(id); } if (fulls.has(id)) { URL.revokeObjectURL(fulls.get(id)); fulls.delete(id); }
    idx.items = idx.items.filter(x => x.id !== id); idx.collections.forEach(c => { if (c.cover === id) c.cover = null; });
  }
  AI.forget(ids); if (aiOn()) await AI.persist(idx).catch(() => { });
  if (People.isOpen()) { People.forget(ids); await People.persist(idx).catch(() => { }); }
  await save(); render(); toast(`Deleted ${n} item${n === 1 ? '' : 's'}`); return true;
}
function setVault(ids, on) { ids.forEach(id => { const it = itemById(id); if (it) it.vault = on; }); save(); render(); toast(on ? `Moved ${ids.length} to the Vault` : `Moved ${ids.length} back to the Library`); }
async function addToCollections(ids) {
  if (!idx.collections.length) { const c = await newCollection(ids); return !!c; }
  const r = await modal(`<h3>Add to collection</h3><p>${ids.length} item${ids.length > 1 ? 's' : ''} selected</p><div class="clist">${idx.collections.map(c => `<label><input type="checkbox" value="${c.id}">${esc(c.name)}</label>`).join('')}</div>
    <div class="actions"><button class="btn btn-ghost" data-r="new">${IC.plus}New collection</button><button class="btn btn-primary" data-ok>Add</button></div>`, (m, close) => {
    m.querySelector('[data-ok]').onclick = () => close(Array.from(m.querySelectorAll('input:checked')).map(i => i.value));
  });
  if (r === 'new') return !!(await newCollection(ids));
  if (!Array.isArray(r) || !r.length) return false;
  ids.forEach(id => { const it = itemById(id); r.forEach(cid => { if (it && !it.cols.includes(cid)) it.cols.push(cid); }); });
  await save(); render(); toast(`Added to ${r.length} collection${r.length > 1 ? 's' : ''}`); return true;
}
async function itemSheet(it) {
  if (!it) return;
  const tags = (it.tags || []).slice(), aiT = (it.aiTags || []).slice(), aiRej = (it.aiRej || []).slice();
  const res = await modal(`<h3>Details</h3><div class="meta-line">${it.type === 'video' ? 'Video' : 'Photo'} · ${bytes(it.size)}${it.w ? ` · ${it.w}×${it.h}` : ''}${it.dur ? ' · ' + fmt(it.dur) : ''} · added ${new Date(it.added).toLocaleDateString()}</div>
    <span class="lbl">Title</span><input class="field" id="tTitle" value="${esc(it.title)}" maxlength="80">
    <span class="lbl">Tags</span><div class="taged" id="tTags"></div>
    ${(it.aiTags || []).length ? `<span class="lbl">AI tags <small style="color:var(--dim);text-transform:none;letter-spacing:0">· suggested on this device. Tap ✓ to keep or × to remove</small></span><div class="taged ai" id="tAI"></div>` : ''}
    <span class="lbl">Collections</span><div class="clist">${idx.collections.map(c => `<label><input type="checkbox" value="${c.id}" ${it.cols.includes(c.id) ? 'checked' : ''}>${esc(c.name)}${c.cover === it.id ? ' <small style="color:var(--mag2)">· cover</small>' : ''}</label>`).join('') || '<span style="color:var(--dim);font-size:13px">No collections yet. Create one in Collections.</span>'}</div>
    <div class="menu" style="margin-top:14px">
      <button data-a="fav">${IC.heart}${it.fav ? 'Remove from Favorites' : 'Add to Favorites'}</button>
      ${it.cols.length ? `<button data-a="cover">${IC.image}Use as cover of its collection${it.cols.length > 1 ? 's' : ''}</button>` : ''}
      <button data-a="vault">${IC.vault}${it.vault ? 'Move back to Library' : 'Move to Vault'}</button>
      <button data-a="export">${IC.download}Save a decrypted copy…</button>
      <button class="danger" data-a="delete">${IC.trash}Delete</button></div>
    <div class="actions"><button class="btn btn-primary" data-ok>Done</button></div>`, (m, close) => {
    const box = m.querySelector('#tTags');
    const draw = () => { box.innerHTML = tags.map((t, i) => `<span class="tag on">${esc(t)}<button data-x="${i}" aria-label="Remove">×</button></span>`).join('') + `<input id="tIn" placeholder="Add a tag and press Enter" autocomplete="off">`; const inp = box.querySelector('#tIn');
      inp.onkeydown = e => { if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); const v = inp.value.trim().toLowerCase().slice(0, 30); if (!tags.includes(v)) tags.push(v); draw(); box.querySelector('#tIn').focus(); } else if (e.key === 'Backspace' && !inp.value && tags.length) { tags.pop(); draw(); box.querySelector('#tIn').focus(); } }; };
    draw(); box.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (x) { tags.splice(+x.dataset.x, 1); draw(); } });
    const aiBox = m.querySelector('#tAI');
    const drawAI = () => { if (!aiBox) return; aiBox.innerHTML = aiT.map((t, i) => `<span class="tag ai">${IC.spark}${esc(t)}<button data-aiok="${i}" aria-label="Keep tag">✓</button><button data-aino="${i}" aria-label="Remove tag">×</button></span>`).join('') || '<span style="color:var(--dim);font-size:13px">No AI suggestions left</span>'; };
    drawAI(); if (aiBox) aiBox.addEventListener('click', e => { const ok = e.target.closest("[data-aiok]"), no = e.target.closest("[data-aino]");
      if (ok) { const t = aiT.splice(+ok.dataset.aiok, 1)[0]; if (!tags.includes(t)) tags.push(t); draw(); drawAI(); }
      if (no) { const t = aiT.splice(+no.dataset.aino, 1)[0]; aiRej.push(t); drawAI(); } });
    const collect = () => { const inp = box.querySelector('#tIn'); if (inp && inp.value.trim()) { const v = inp.value.trim().toLowerCase(); if (!tags.includes(v)) tags.push(v); } return { title: m.querySelector('#tTitle').value.trim() || it.title, cols: Array.from(m.querySelectorAll('.clist input:checked')).map(i => i.value) }; };
    m.querySelector('[data-ok]').onclick = () => close({ a: 'done', ...collect() });
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => close({ a: b.dataset.a, ...collect() }));
  });
  if (!res) return;
  it.title = res.title; it.tags = tags; it.cols = res.cols; if (it.aiTags) { it.aiTags = aiT.filter(t => !tags.includes(t)); it.aiRej = aiRej; } await save(); applyRules({ ids: [it.id] });
  if (res.a === 'fav') toggleFav(it);
  else if (res.a === 'cover') { it.cols.forEach(cid => { const c = colById(cid); if (c) c.cover = it.id; }); await save(); toast('Cover updated'); }
  else if (res.a === 'vault') { closeLightbox(); closePlayer(); setVault([it.id], !it.vault); return; }
  else if (res.a === 'export') exportItem(it);
  else if (res.a === 'delete') { if (await deleteItems([it.id])) { closeLightbox(); closePlayer(); } return; }
  render(); if (lb.classList.contains('open')) { $('#lbTitle').textContent = it.title; $('#lbTags').innerHTML = it.tags.map(t => `<span>#${esc(t)}</span>`).join(''); }
  if (curVid === it) $('#plTitle').textContent = it.title;
}

/* ---------- select mode ---------- */
let selecting = false; const sel = new Set();
function toggleSelect() { if (selecting) endSelect(); else { selecting = true; document.body.classList.add('selecting'); drawSelbar(); } }
function endSelect() { if (!selecting && !sel.size) return; selecting = false; sel.clear(); document.body.classList.remove('selecting'); $$('.tile.picked').forEach(t => t.classList.remove('picked')); $('#selbar').classList.remove('show'); }
function togglePick(id, tile) { sel.has(id) ? sel.delete(id) : sel.add(id); tile.classList.toggle('picked', sel.has(id)); drawSelbar(); }
function drawSelbar() {
  const b = $('#selbar'), n = sel.size, ids = [...sel];
  b.innerHTML = `<span class="count">${n} selected</span><button data-s="all">${IC.check}All</button>
    <button data-s="fav">${IC.heart}Favorite</button><button data-s="reel">${IC.reel}Highlights</button><button data-s="col">${IC.cols}Add to collection</button>
    ${view === 'collection' && !isSmart(curCol) ? `<button data-s="uncol">${IC.minus}Remove from collection</button>` : ''}
    ${view === 'vault' ? `<button data-s="unvault">${IC.vault}Back to Library</button>` : `<button data-s="vault">${IC.vault}Move to Vault</button>`}
    <button data-s="del" class="danger">${IC.trash}Delete</button><button data-s="x">${IC.close}</button>`;
  b.classList.add('show');
  b.onclick = async e => {
    const a = e.target.closest('[data-s]'); if (!a) return; const s = a.dataset.s;
    if (s === 'x') return endSelect();
    if (s === 'all') { const g = view === 'library' ? '#libGrid' : view === 'collection' ? '#colItems' : view === 'search' ? '#results' : '#vaultGrid'; $$(g + ' .tile').forEach(t => { sel.add(t.dataset.id); t.classList.add('picked'); }); return drawSelbar(); }
    if (!n) return toast('Tap items to select them first');
    if (s === 'fav') { const on = !ids.every(id => itemById(id).fav); ids.forEach(id => itemById(id).fav = on); await save(); endSelect(); render(); toast(on ? 'Added to Favorites' : 'Removed from Favorites'); }
    else if (s === 'col') { if (await addToCollections(ids)) endSelect(); }
    else if (s === 'reel') { const its = ids.map(itemById).filter(Boolean); endSelect(); openReel(its, its.length === 1 ? its[0].title : `${its.length} picks`); }
    else if (s === 'uncol') { ids.forEach(id => { const it = itemById(id); it.cols = it.cols.filter(c => c !== curCol); }); await save(); endSelect(); render(); toast('Removed from collection'); }
    else if (s === 'vault' || s === 'unvault') { endSelect(); setVault(ids, s === 'vault'); }
    else if (s === 'del') { if (await deleteItems(ids)) endSelect(); }
  };
}

/* ---------- lightbox ---------- */
const lb = $('#lightbox'); let lbList = [], lbIdx = 0, lbTok = 0;
function openLightbox(it, list) { lbList = list.length ? list : [it]; lbIdx = Math.max(0, lbList.indexOf(it)); lb.classList.add('open'); showLb(); }
async function showLb() {
  const it = lbList[lbIdx]; if (!it) return; const tok = ++lbTok, st = $('#lbStage');
  $('#lbTitle').textContent = it.title; $('#lbCount').textContent = `${lbIdx + 1} / ${lbList.length}`;
  $('#lbTags').innerHTML = (it.tags || []).map(t => `<span>#${esc(t)}</span>`).join(''); $('#lbFav').classList.toggle('on', !!it.fav);
  if (!fulls.has(it.id)) st.innerHTML = thumbs.has(it.id) ? `<img src="${thumbs.get(it.id)}" alt="" style="filter:blur(6px)">` : '<div class="lb-loading"></div>';
  try {
    const u = await getFull(it); if (tok !== lbTok) return;
    const img = new Image(); img.alt = it.title; img.draggable = false; img.src = u; await img.decode().catch(() => { });
    if (tok !== lbTok) return; st.innerHTML = ''; img.classList.add('swap'); st.appendChild(img); requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove('swap')));
    const n = lbList[(lbIdx + 1) % lbList.length]; if (n && n !== it && !fulls.has(n.id)) getFull(n).catch(() => { });
  } catch (e) { if (tok === lbTok && Store.isUnlocked()) st.innerHTML = `<div class="empty"><b>Can’t show this file</b>${esc(e.message)}</div>`; }
}
function lbStep(d) { if (lbList.length < 2) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); }
function closeLightbox() { lb.classList.remove('open'); lbTok++; }
$('#lbClose').onclick = closeLightbox; $('#lbPrev').onclick = () => lbStep(-1); $('#lbNext').onclick = () => lbStep(1);
$('#lbFav').onclick = () => { const it = lbList[lbIdx]; if (it) toggleFav(it); };
$('#lbMore').onclick = () => itemSheet(lbList[lbIdx]);
lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
let sx = null, sy = 0; lb.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; sx = e.clientX; sy = e.clientY; });
lb.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) lbStep(dx < 0 ? 1 : -1); else if (dy > 90) closeLightbox(); });

/* ---------- player ---------- */
const pl = $('#player'), vid = $('#vid'); let curVid = null, plList = [], hideT, dragging = false, speedI = 0, plTok = 0; const SPEEDS = [1, 1.5, 2];
function setIcon(btn, name) { const s = btn.querySelector('[data-ic]'); s.dataset.ic = name; s.innerHTML = IC[name]; }
function syncFavButtons() { if (lb.classList.contains('open')) $('#lbFav').classList.toggle('on', !!(lbList[lbIdx] || {}).fav); $('#cFav').classList.toggle('on', !!(curVid && curVid.fav)); }
async function openPlayer(it, list) {
  curVid = it; plList = (list || visible()).filter(x => x.type === 'video'); const tok = ++plTok;
  pl.classList.add('open', 'loading'); pl.classList.remove('idle');
  $('#plTitle').textContent = it.title; $('#fill').style.width = '0%'; $('#knob').style.left = '0%'; $('#buf').style.width = '0%';
  vid.removeAttribute('src'); vid.load(); vid.poster = thumbs.get(it.id) || '';
  renderRelated(); syncFavButtons(); wake(); updProg();
  try {
    const u = await getFull(it, p => { if (tok === plTok) flash('Decrypting ' + Math.round(p * 100) + '%', true); });
    if (tok !== plTok) return; $('#plMsg').classList.remove('show');
    vid.src = u; playerChapters(it, u, tok); vid.playbackRate = SPEEDS[speedI]; const p = vid.play(); if (p && p.catch) p.catch(() => { pl.classList.remove('loading'); syncPlay(); });
  } catch (e) { if (tok === plTok) { pl.classList.remove('loading'); flash('Can’t open this video: ' + e.message); } }
}
function closePlayer() { if (!pl.classList.contains('open')) return; plTok++; clearChapters(); vid.pause(); vid.removeAttribute('src'); vid.load(); pl.classList.remove('open', 'idle'); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); curVid = null; }
function renderRelated() {
  const vids = plList.length > 1 ? plList : (curVid && curVid.vault ? idx.items.filter(i => i.vault && i.type === 'video') : visible().filter(i => i.type === 'video'));
  $('#rel').innerHTML = vids.slice(0, 30).map(v => `<div class="rel-item ${v === curVid ? 'cur' : ''}" data-id="${v.id}" style="--fb:${fbFor(v.id)}"><img alt="" data-tid="${v.id}"><div class="shade"></div><span class="t">${esc(v.title)}</span><span class="dur">${fmt(v.dur)}</span></div>`).join('');
  $('#rel').querySelectorAll('img[data-tid]').forEach(img => { const u = thumbs.get(img.dataset.tid); if (u) img.src = u; else wantThumb(itemById(img.dataset.tid), img); });
}
$('#rel').addEventListener('click', e => { const r = e.target.closest('.rel-item'); if (!r) return; const it = itemById(r.dataset.id); if (it && it !== curVid) openPlayer(it, plList); });
function togglePlay() { if (!vid.src) return; if (vid.paused || vid.ended) { const p = vid.play(); if (p && p.catch) p.catch(() => { }); } else vid.pause(); }
function syncPlay() { const n = vid.paused ? 'play' : 'pause'; setIcon($('#plPlay'), n); setIcon($('#cPlay'), n); if (vid.paused) { pl.classList.remove('idle'); clearTimeout(hideT); } else wake(); }
let flashT; function flash(m, sticky) { const el = $('#plMsg'); el.textContent = m; el.classList.add('show'); clearTimeout(flashT); if (!sticky) flashT = setTimeout(() => el.classList.remove("show"), Math.max(1100, m.length * 45)); }
function skip(d) { if (!isFinite(vid.duration)) return; vid.currentTime = Math.max(0, Math.min(vid.duration - .05, vid.currentTime + d)); flash((d > 0 ? '+' : '−') + Math.abs(d) + 's'); wake(); }
$('#plPlay').onclick = $('#cPlay').onclick = togglePlay; $('#plBack').onclick = $('#cBack').onclick = () => skip(-10); $('#plFwd').onclick = $('#cFwd').onclick = () => skip(10);
$('#cSpeed').onclick = () => { speedI = (speedI + 1) % SPEEDS.length; vid.playbackRate = SPEEDS[speedI]; $('#cSpeed').textContent = SPEEDS[speedI] + 'x'; flash('Speed ' + SPEEDS[speedI] + 'x'); };
$('#cMute').onclick = () => { vid.muted = !vid.muted; setIcon($('#cMute'), vid.muted ? 'mute' : 'vol'); flash(vid.muted ? 'Muted' : 'Sound on'); };
$('#cFav').onclick = () => { if (curVid) toggleFav(curVid); };
$('#plThumb').onclick = () => setPreviewFromPlayer();
$('#plMore').onclick = () => { if (curVid) { vid.pause(); itemSheet(curVid); } };
$('#cFull').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  else if (pl.requestFullscreen) pl.requestFullscreen().catch(() => { if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen(); });
  else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
};
document.addEventListener('fullscreenchange', () => setIcon($('#cFull'), document.fullscreenElement ? 'exitfull' : 'full'));
$('#plClose').onclick = closePlayer;
vid.addEventListener('play', syncPlay); vid.addEventListener('pause', syncPlay);
vid.addEventListener('waiting', () => pl.classList.add('loading'));
['playing', 'canplay', 'loadeddata', 'pause'].forEach(ev => vid.addEventListener(ev, () => pl.classList.remove('loading')));
vid.addEventListener('loadedmetadata', () => { vid.playbackRate = SPEEDS[speedI]; if (curVid && isFinite(vid.duration) && Math.abs((curVid.dur || 0) - vid.duration) > .5) { curVid.dur = vid.duration; save(); } updProg(); });
vid.addEventListener('timeupdate', updProg); vid.addEventListener('progress', updProg);
vid.addEventListener('ended', () => { pl.classList.remove('idle'); const i = plList.indexOf(curVid); const n = plList[(i + 1) % plList.length]; if (n && n !== curVid) { flash('Up next: ' + n.title); const c = curVid; setTimeout(() => { if (curVid === c && vid.ended) openPlayer(n, plList); }, 1600); } });
vid.addEventListener('error', () => { if (curVid && vid.getAttribute('src')) { pl.classList.remove('loading'); flash(Thumbs.isHevc(curVid.codec) ? 'This is an HEVC (iPhone) video, which this device can’t decode. It plays on iPhone; on Windows install “HEVC Video Extensions”, or record in “Most Compatible”.' : 'This video format can’t play here (try H.264 MP4)'); } });
vid.addEventListener('click', togglePlay);
function updProg() {
  const d = vid.duration || (curVid && curVid.dur) || 0, t = vid.currentTime || 0, p = d ? Math.min(100, t / d * 100) : 0;
  if (!dragging) { $('#fill').style.width = p + '%'; $('#knob').style.left = p + '%'; }
  try { if (vid.buffered.length && isFinite(vid.duration)) $('#buf').style.width = (vid.buffered.end(vid.buffered.length - 1) / vid.duration * 100) + '%'; } catch (e) { }
  $('#time').textContent = fmt(t) + ' / ' + fmt(d);
}
const prog = $('#prog');
const posAt = x => { const r = prog.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };
function showTip(f) { const d = vid.duration || (curVid && curVid.dur) || 0; $('#tip').style.left = (f * 100) + '%'; const k = chapAt(f * d); $('#tip').textContent = fmt(f * d) + (chap.list && chap.list.length > 1 && k >= 0 ? ' · ' + chap.list[k].label : ''); }
function seekTo(f) { $('#fill').style.width = f * 100 + '%'; $('#knob').style.left = f * 100 + '%'; if (isFinite(vid.duration)) vid.currentTime = f * vid.duration; }
prog.addEventListener('pointermove', e => { const f = posAt(e.clientX); showTip(f); if (dragging) seekTo(f); });
prog.addEventListener('pointerdown', e => { dragging = true; prog.classList.add('drag'); try { prog.setPointerCapture(e.pointerId); } catch (_) { } const f = posAt(e.clientX); showTip(f); seekTo(f); wake(); });
const endDrag = () => { if (!dragging) return; dragging = false; prog.classList.remove('drag'); updProg(); wake(); };
prog.addEventListener('pointerup', endDrag); prog.addEventListener('pointercancel', endDrag);
function wake() { pl.classList.remove('idle'); clearTimeout(hideT); hideT = setTimeout(() => { if (!vid.paused && !dragging && pl.classList.contains('open')) pl.classList.add('idle'); }, 2500); }
['pointermove', 'pointerdown', 'touchstart'].forEach(ev => pl.addEventListener(ev, wake, { passive: true }));

/* ---------- video chapters (v1.3): on-device scene detection, encrypted per-video sidecar ---------- */
const b64of = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const blobOf = (b64, type) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u], { type }); };
const capLabel = t => t.replace(/^\w/, c => c.toUpperCase());
let chap = { id: null, list: null, busy: false, urls: [] };
function clearChapters() { chap.urls.forEach(u => URL.revokeObjectURL(u)); chap = { id: null, list: null, busy: false, urls: [] }; $('#chMarks').innerHTML = ''; $('#chStrip').innerHTML = ''; $('#chBadge').textContent = ''; pl.classList.remove('chap-open'); }
async function loadChapters(it) {
  if (!it.chap || !it.chap.file) return null;
  try { const j = JSON.parse(await (await Store.readFile(it.chap.file.id, it.chap.file.chunks, 'application/json')).text());
    return j.list.map(c => { const u = c.img ? URL.createObjectURL(blobOf(c.img, 'image/jpeg')) : ''; if (u) chap.urls.push(u); return { t: c.t, label: c.label, url: u }; });
  } catch (e) { console.warn('chapters unreadable', e); return null; }
}
function chapAt(t) { const L = chap.list; if (!L) return -1; let k = -1; for (let i = 0; i < L.length; i++) if (L[i].t <= t + .05) k = i; return k; }
function drawChapters() {
  const L = chap.list, d = vid.duration || (curVid && curVid.dur) || 0, strip = $('#chStrip');
  $('#chBadge').textContent = L && L.length > 1 ? L.length : '';
  $('#chMarks').innerHTML = L && d ? L.slice(1).map(c => `<button class="chm" style="left:${(c.t / d * 100).toFixed(3)}%" data-t="${c.t}" aria-label="Chapter: ${esc(c.label)} at ${fmt(c.t)}"><span class="chpop">${c.url ? `<img alt="" src="${c.url}">` : ''}<b>${esc(c.label)}</b><i>${fmt(c.t)}</i></span></button>`).join('') : '';
  const head = `<div class="chhead">${IC.chap}<b>Chapters</b><span>${chap.busy ? 'Finding scenes on this device…' : L ? (L.length > 1 ? `${L.length} scenes · tap to jump` : 'No scene changes found') : ''}</span><span class="sp"></span>${!chap.busy && curVid ? `<button class="btn btn-ghost btn-sm" id="chRedo">${L ? 'Re-detect' : 'Find chapters'}</button>` : ''}</div>`;
  strip.innerHTML = head + (chap.busy && !L ? `<div class="chbusy"><div class="lb-loading"></div></div>` : '') + (L && L.length ? `<div class="chrow">${L.map((c, k) => `<button class="chcard" data-t="${c.t}" data-k="${k}"><span class="chimg">${c.url ? `<img alt="" src="${c.url}">` : ''}<i>${fmt(c.t)}</i></span><b>${esc(c.label)}</b></button>`).join('')}</div>` : '');
  hiChapter(); const r = $('#chRedo'); if (r) r.onclick = e => { e.stopPropagation(); if (curVid && vid.src) detectChapters(curVid, vid.src, true); };
}
function hiChapter() { const k = chapAt(vid.currentTime || 0); $$('#chStrip .chcard').forEach(c => c.classList.toggle('on', +c.dataset.k === k)); }
const jumpTo = t => { if (!isFinite(vid.duration)) return; vid.currentTime = Math.min(vid.duration - .05, +t); const p = vid.play(); if (p && p.catch) p.catch(() => { }); updProg(); wake(); };
$('#chMarks').addEventListener('pointerdown', e => { if (e.target.closest('.chm')) e.stopPropagation(); });
$('#chMarks').addEventListener('click', e => { const m = e.target.closest('.chm'); if (!m) return; e.stopPropagation(); jumpTo(m.dataset.t); const k = chapAt(+m.dataset.t); if (chap.list && chap.list[k]) flash(chap.list[k].label); });
$('#chStrip').addEventListener('click', e => { const c = e.target.closest('.chcard'); if (c) { jumpTo(c.dataset.t); flash(c.querySelector('b').textContent); } });
$('#cReel').onclick = () => { if (curVid) openReel([curVid], curVid.title); };
$('#cChap').onclick = () => { pl.classList.toggle('chap-open'); if (pl.classList.contains('chap-open') && curVid && !chap.list && !chap.busy && vid.src) detectChapters(curVid, vid.src, true); drawChapters(); wake(); };
vid.addEventListener('timeupdate', hiChapter);
async function detectChapters(it, url, force) {
  if (chap.busy || (!force && it.chap)) return; const tok = plTok; chap.busy = true; drawChapters();
  try {
    const scan = await Scenes.scanVideo(url, { shouldStop: () => tok !== plTok || !Store.isUnlocked() });
    if (tok !== plTok || !Store.isUnlocked() || !scan.frames.length) return;
    const ch = Scenes.chaptersFrom(scan, Scenes.findCuts(scan));
    let labels = [];
    if (aiOn()) { try { await AI.open(idx); labels = await AI.labelFrames(ch.map(c => c.frame.blob)); } catch (e) { console.warn('chapter labels', e); } }
    if (tok !== plTok) return;
    const list = [];
    ch.forEach((c, k) => { const L = labels[k] || {}, prev = list[list.length - 1];
      if (prev && L.vec && prev.vec && AI.dot(L.vec, prev.vec) >= .93) return;          // AI sees the same scene: merge
      list.push({ t: c.t, label: L.label ? capLabel(L.label) : null, blob: c.frame.blob, vec: L.vec }); });
    list.forEach((c, k) => { if (!c.label) c.label = 'Scene ' + (k + 1); });
    const seen = {}; list.forEach(c => { const n = (seen[c.label] = (seen[c.label] || 0) + 1); if (n > 1) c.label += ' ' + n; });
    const json = { v: 1, dur: scan.dur, list: await Promise.all(list.map(async c => ({ t: c.t, label: c.label, img: await b64of(c.blob) }))) };
    const old = it.chap && it.chap.file, fid = it.id + (old && old.id.endsWith('_chA') ? '_chB' : '_chA');
    const r = await Store.putFile(fid, new Blob([JSON.stringify(json)], { type: 'application/json' }));
    it.chap = { v: 1, n: list.length, labels: list.map(c => c.label), at: Date.now(), ai: !!labels.length, partial: !!scan.partial, ms: Math.round(scan.ms || 0), file: { id: fid, chunks: r.chunks, stored: r.stored } };
    await save(); if (old && old.id !== fid) Store.deleteFile(old.id).catch(() => { });
    if (tok === plTok && curVid === it) { chap.urls.forEach(u => URL.revokeObjectURL(u)); chap.urls = []; chap.list = await loadChapters(it); chap.id = it.id; }
  } catch (e) { console.warn('chapters', e); }
  finally { chap.busy = false; if (tok === plTok) drawChapters(); }
}
function playerChapters(it, url, tok) {
  clearChapters(); chap.id = it.id; drawChapters();
  if (it.chap) loadChapters(it).then(l => { if (tok === plTok) { chap.list = l; drawChapters(); } });
  else if (idx.settings.autoChapters !== false && !(isIOS && (it.dur || 0) > 1200)) setTimeout(() => { if (tok === plTok && Store.isUnlocked()) detectChapters(it, url); }, 1500);
}
vid.addEventListener('loadedmetadata', () => { if (!isFinite(vid.duration)) { const t = vid.currentTime; vid.currentTime = 1e7; vid.addEventListener('durationchange', () => { vid.currentTime = t; drawChapters(); }, { once: true }); } else drawChapters(); });

/* ---------- highlight reels (v1.3): best segments, seamless double-buffered playback, optional export ---------- */
const rl = $('#reel'), rvs = [$('#rvA'), $('#rvB')], rlImg = $('#rlImg');
const PHOTO_S = 2.6;
let R = null;   // { title, segs:[{kind,id,url,start,end,dur,label,el}], i, playing, urls:[], tok, rec, thumb, src:[ids], startedAt }
async function buildReel(items, title) {
  const urls = [], segs = [];
  const vids = items.filter(i => i.type === 'video').slice(0, 10), pics = items.filter(i => i.type === 'photo');
  const single = items.length === 1 && vids.length === 1;
  const cap = isIOS ? 500 * 1024 ** 2 : 3 * 1024 ** 3; let used = 0, skipped = 0, best = null;
  try {
    for (let k = 0; k < vids.length; k++) {
      const v = vids[k]; if (used + v.size > cap) { skipped++; continue; } used += v.size;
      progress(`Finding highlights · ${v.title}`, k / Math.max(1, vids.length + (pics.length ? 1 : 0)));
      const type = v.mime === 'video/quicktime' && !isIOS ? 'video/mp4' : v.mime;
      const blob = await Store.readFile(v.id, v.chunks, type); if (!Store.isUnlocked()) throw new Error('locked');
      const url = URL.createObjectURL(blob); urls.push(url);
      const scan = await Scenes.scanVideo(url, single ? {} : { maxN: 40, budget: isIOS ? 9000 : 12000 });
      const picks = Scenes.pickSegments(scan, single ? { target: 20, max: 8 } : { target: Math.max(3, 30 / vids.length), max: Math.max(1, Math.round(12 / vids.length)) });
      picks.forEach(p => segs.push({ kind: 'video', id: v.id, url, start: p.start, end: p.end, score: p.score, w: scan.w, h: scan.h, when: (Smart.timeOf(v) || v.added) + p.start * 1000 }));
      for (const f of scan.frames) if (!f.blank && (!best || f.score > best.score)) best = f;
    }
    if (pics.length) {
      const top = pics.slice().sort((a, b) => AI.quality(b) - AI.quality(a)).slice(0, vids.length ? 6 : 12);
      for (const p of top) {
        let b = await Store.readFile(p.id, p.chunks, p.mime); if (!Store.isUnlocked()) throw new Error('locked');
        if (Thumbs.isHeic(p.mime, p.name)) b = await Thumbs.displayableImage(b, p.mime, p.name);
        const own = URL.createObjectURL(b); urls.push(own); segs.push({ kind: 'photo', id: p.id, url: own, start: 0, end: PHOTO_S, w: p.w, h: p.h, when: Smart.timeOf(p) || p.added }); }
    }
  } catch (e) { progress(null); urls.forEach(u => URL.revokeObjectURL(u)); if (e.message !== 'locked') toast('Couldn’t build the reel: ' + e.message, 4000); return null; }
  progress(null);
  if (!single) segs.sort((a, b) => a.when - b.when);
  if (!segs.length) { urls.forEach(u => URL.revokeObjectURL(u)); toast(vids.length ? 'No highlight-worthy moments found (videos may be too dark or blurry, or can’t be decoded here)' : 'Nothing to make a reel from'); return null; }
  if (skipped) toast(`Skipped ${skipped} large video${skipped === 1 ? '' : 's'} to stay within memory`, 4000);
  let vi = 0; segs.forEach(s => { s.dur = s.end - s.start; if (s.kind === 'video') s.el = vi++ % 2; const it = itemById(s.id); s.label = it ? it.title : ''; });
  return { title, segs, urls, thumb: best && best.blob, src: items.map(i => i.id), vault: items.some(i => i.vault), col: (view === 'collection' && !isSmart(curCol)) ? curCol : null };
}
async function openReel(items, title) {
  if (R) closeReel();
  const r = await buildReel(items, title); if (!r) return;
  if (curVid) vid.pause();
  R = { ...r, i: 0, playing: true, tok: Math.random() };
  $('#rlTitle').textContent = title; $('#rlBars').innerHTML = R.segs.map((s, k) => `<i style="flex:${s.dur.toFixed(2)}"><b id="rlb${k}"></b></i>`).join('');
  rvs.forEach(v => { v.muted = !reelSound; v.removeAttribute('src'); delete v.dataset.src; });
  rl.classList.add('open'); rl.classList.remove('paused', 'ended'); setIcon($('#rlPlay'), 'pause'); setIcon($('#rlSound'), reelSound ? 'vol' : 'mute');
  $('#rlSave').classList.toggle('unsupported', !Scenes.recorderType());
  await reelShow(0); reelLoop();
  const rr = R; if (rr) rr.iv = setInterval(() => { if (R !== rr) return clearInterval(rr.iv); if (performance.now() - (rr.lastTick || 0) > 120) reelTick(); }, 150);
}
let reelSound = false;
function reelPrep(s) {
  if (!s || s.kind !== 'video') return Promise.resolve(); const el = rvs[s.el];
  if (el.dataset.src !== s.url || el.error) { el.src = s.url; el.dataset.src = s.url; el.load(); }
  const go = () => { el.currentTime = s.start; return Thumbs.once(el, 'seeked', 3000).catch(() => { if (el.error) delete el.dataset.src; }); };
  return el.readyState >= 1 ? go() : Thumbs.once(el, 'loadedmetadata', 6000).then(go, () => { });
}
async function reelShow(i) {
  if (!R) return; const tk = R.tok; if (i >= R.segs.length) return reelEnd();
  R.i = i; const s = R.segs[i];
  R.segs.forEach((x, k) => { const b = $('#rlb' + k); if (b) b.style.width = k < i ? '100%' : '0%'; });
  $('#rlSub').textContent = `${s.label}${s.kind === 'video' ? ' · ' + fmt(s.start) : ''} · ${i + 1}/${R.segs.length}`;
  if (s.kind === 'photo') {
    rlImg.classList.remove('on', 'kb'); void rlImg.offsetWidth; rlImg.src = s.url; rlImg.classList.add('on', 'kb'); rlImg.style.animationDuration = (PHOTO_S + .4) + 's';
    rvs.forEach(v => { v.classList.remove('on'); v.pause(); }); R.t0 = performance.now(); R.pausedAt = null;
  } else {
    const el = rvs[s.el], other = rvs[1 - s.el];
    if (el.dataset.src !== s.url || Math.abs(el.currentTime - s.start) > .35) await reelPrep(s);
    if (!R || R.tok !== tk) return;
    el.classList.add('on'); other.classList.remove('on'); other.pause(); rlImg.classList.remove('on');
    if (R.playing) { el.muted = !reelSound || !!R.rec; const p = el.play(); if (p && p.catch) p.catch(() => { el.muted = true; el.play().catch(() => { }); }); }
  }
  const n = R.segs.slice(i + 1).find(x => x.kind === 'video'); if (n && (s.kind !== 'video' || n.el !== s.el)) reelPrep(n);
}
// driven by rAF for smooth bars, plus a timer watchdog: some WebKit builds (and iOS Low Power Mode) throttle rAF hard
function reelLoop() { if (!R) return; reelTick(); R && (R.raf = requestAnimationFrame(reelLoop)); }
function reelTick() {
  if (!R) return; R.lastTick = performance.now(); const s = R.segs[R.i];
  if (s && R.playing) {
    let f = 0;
    if (s.kind === 'photo') f = (performance.now() - R.t0) / (PHOTO_S * 1000);
    else { const el = rvs[s.el]; f = (el.currentTime - s.start) / s.dur; if (el.ended) f = 1;
      const now = performance.now(); if (R.lastI !== R.i || Math.abs(el.currentTime - R.lastT) > .01) { R.lastI = R.i; R.lastT = el.currentTime; R.lastMove = now; }
      else if (now - R.lastMove > 4000 || el.error) { R.lastMove = now; f = 1; } }        // a clip that won't play: skip it rather than stall the reel
    const b = $('#rlb' + R.i); if (b) b.style.width = Math.max(0, Math.min(100, f * 100)) + '%';
    if (f >= .995 && !R.adv) { R.adv = true; reelShow(R.i + 1).finally(() => { if (R) R.adv = false; }); }
  }
  if (R && R.rec) reelDraw();
}
function reelSetPlaying(on) {
  if (!R) return; R.playing = on; const s = R.segs[R.i]; setIcon($('#rlPlay'), on ? 'pause' : 'play'); rl.classList.toggle('paused', !on);
  if (s && s.kind === 'video') { const el = rvs[s.el]; if (on) el.play().catch(() => { }); else el.pause(); }
  else if (s) { if (on) { R.t0 = performance.now() - (R.pausedAt || 0); R.pausedAt = null; } else R.pausedAt = performance.now() - R.t0; }
  rlImg.style.animationPlayState = on ? 'running' : 'paused';
}
function reelEnd() {
  if (!R) return;
  if (R.rec) { R.rec.stop(); return; }
  R.playing = false; setIcon($('#rlPlay'), 'play'); rl.classList.add('paused', 'ended'); rvs.forEach(v => v.pause());
  $('#rlSub').textContent = 'End of reel · tap play to watch again';
}
function closeReel() {
  if (!R) return; const r = R; R = null; cancelAnimationFrame(r.raf); clearInterval(r.iv);
  if (r.rec) { try { r.rec.stop(); } catch (e) { } }
  rvs.forEach(v => { v.pause(); v.removeAttribute('src'); delete v.dataset.src; v.load(); v.classList.remove('on'); }); rlImg.removeAttribute('src'); rlImg.classList.remove('on', 'kb');
  r.urls.forEach(u => URL.revokeObjectURL(u)); rl.classList.remove('open', 'paused', 'ended', 'recording'); $('#rlMsg').classList.remove('show');
}
$('#rlClose').onclick = closeReel;
$('#rlPlay').onclick = () => { if (!R || R.rec) return; if (rl.classList.contains('ended')) { rl.classList.remove('ended'); R.playing = true; reelShow(0); reelSetPlaying(true); return; } reelSetPlaying(!R.playing); };
$('#rlPrev').onclick = () => { if (R && !R.rec) reelShow(Math.max(0, R.i - 1)); };
$('#rlNext').onclick = () => { if (R && !R.rec) reelShow(R.i + 1); };
$('#rlSound').onclick = () => { reelSound = !reelSound; setIcon($('#rlSound'), reelSound ? 'vol' : 'mute'); if (R && !R.rec) rvs.forEach(v => { v.muted = !reelSound; }); };
rl.addEventListener('keydown', e => { if (e.key === 'Escape') closeReel(); });
document.addEventListener('keydown', e => { if (!R || document.querySelector('.modal')) return; if (e.key === 'Escape') { e.stopImmediatePropagation(); closeReel(); } else if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); $('#rlPlay').click(); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); $(e.key === 'ArrowRight' ? '#rlNext' : '#rlPrev').click(); } }, true);

/* export: draw the reel into a canvas and record it with MediaRecorder (silent), then save it encrypted like any import */
function reelDraw() {
  const { cv, cx } = R.rec; const s = R.segs[R.i]; if (!s) return;
  const src = s.kind === 'photo' ? rlImg : rvs[s.el]; const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
  cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height); if (!sw || !sh) return;
  let k = Math.min(cv.width / sw, cv.height / sh);
  if (s.kind === 'photo') k *= 1 + .06 * Math.min(1, (performance.now() - R.t0) / (PHOTO_S * 1000));    // gentle zoom, like the on-screen reel
  const w = sw * k, h = sh * k; try { cx.drawImage(src, (cv.width - w) / 2, (cv.height - h) / 2, w, h); } catch (e) { }
}
$('#rlSave').onclick = async () => {
  if (!R || R.rec) return; const type = Scenes.recorderType();
  if (!type) { await modal(`<h3>Saving reels isn’t supported here</h3><p>${isIOS ? 'This version of iOS Safari can’t record video from the page.' : 'This browser can’t record video from the page (it needs MediaRecorder with canvas capture).'} You can still watch the reel any time. It’s rebuilt on this device in a few seconds. On Windows, the Velvet app can save reels.</p><div class="actions"><button class="btn btn-primary" data-r="">OK</button></div>`); return; }
  const total = R.segs.reduce((a, s) => a + s.dur, 0), mp4 = type.includes('mp4');
  if (!(await confirmBox('Save reel to your library?', `Velvet plays the reel once (${Math.round(total)} s) and records it on this device as a silent ${mp4 ? 'MP4' : 'WebM'} video. It’s encrypted and added to your ${R.vault ? 'Vault' : 'Library'}. Keep Velvet open while it records.`, 'Record & save'))) return;
  const land = R.segs.filter(s => (s.w || 16) >= (s.h || 9)).length >= R.segs.length / 2, big = isIOS ? 960 : 1280, small = Math.round(big * 9 / 16 / 2) * 2;
  const cv = document.createElement('canvas'); cv.width = land ? big : small; cv.height = land ? small : big;
  const cx = cv.getContext('2d'); const stream = cv.captureStream(30);
  let rec; try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: isIOS ? 2.5e6 : 5e6 }); } catch (e) { toast('Recording failed to start: ' + e.message, 4000); return; }
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { rec.onstop = res; });
  R.rec = { rec, cv, cx }; R.rec.stop = () => rec.state !== 'inactive' && rec.stop();
  rl.classList.add('recording'); rl.classList.remove('ended', 'paused'); rvs.forEach(v => { v.muted = true; });
  const msg = $('#rlMsg'); msg.classList.add('show'); const t0 = performance.now();
  const prog = setInterval(() => { if (R && R.rec) msg.textContent = `Recording reel… ${Math.min(99, Math.round((performance.now() - t0) / 10 / total))}%`; }, 300);
  R.playing = true; setIcon($('#rlPlay'), 'pause'); await reelShow(0); reelDraw(); rec.start(500);
  await done; clearInterval(prog);
  if (!R) return;                                                   // closed while recording: discard
  const r = R; r.rec = null; rl.classList.remove('recording'); msg.textContent = 'Encrypting & saving…';
  const blob = new Blob(chunks, { type: type.split(';')[0] });
  try {
    const it = await saveReelItem(blob, r, total, cv.width, cv.height);
    msg.classList.remove('show'); reelEnd(); toast(`Saved “${it.title}” to your ${it.vault ? 'Vault' : 'Library'}`, 3500);
  } catch (e) { msg.classList.remove('show'); toast('Couldn’t save the reel: ' + e.message, 5000); reelEnd(); }
};
async function saveReelItem(blob, r, dur, w, h) {
  if (!blob.size) throw new Error('nothing was recorded');
  const id = uid(), mime = blob.type || 'video/webm', ext = /mp4/.test(mime) ? 'mp4' : 'webm';
  const res = await Store.putFile(id, blob);
  let th = null; try { th = await withTimeout(Thumbs.videoThumb(new File([blob], 'reel.' + ext, { type: mime }), mime), 20000); } catch (e) { }
  const tb = (th && th.blob) || r.thumb; let thumb = null;
  if (tb) { const tr = await Store.putFile(id + '_t', tb); thumb = { id: id + '_t', chunks: tr.chunks, stored: tr.stored }; }
  const title = `${r.title} · Highlights`.slice(0, 80);
  const it = { id, type: 'video', title, name: title + '.' + ext, ext, mime, size: blob.size, chunks: res.chunks, stored: res.stored, added: Date.now(), modified: Date.now(), taken: null,
    tags: ['highlights'], fav: false, cols: r.col && colById(r.col) ? [r.col] : [], vault: r.vault, thumb, ar: w / h, dur, w, h, codec: /mp4/.test(mime) ? 'avc1' : 'vp8', thumbT: null, reel: { from: r.src.slice(0, 50), clips: r.segs.length } };
  idx.items.push(it); await save(); render(); startAI(); return it;
}

/* ---------- smart albums, best shots, archive, smart rules (v1.2) ---------- */
let smartCache = null;
const isSmart = id => typeof id === 'string' && id.startsWith('smart:');
const smartKey = () => [idx.items.length, AI.stats(idx).indexed, idx.items.reduce((a, i) => a + (i.aiTags || []).length * 3 + (i.tags || []).length * 7 + (i.vault ? 11 : 0) + (i.archived ? 13 : 0), 0)].join(':');
async function getSmart(force) {
  if (!aiOn()) return [];
  await AI.open(idx); const k = smartKey();
  if (!force && smartCache && smartCache.key === k) return smartCache.albums;
  const albums = await Smart.smartAlbums(visible()); smartCache = { key: k, albums }; return albums;
}
const smartById = id => smartCache && smartCache.albums.find(a => a.id === id);
const KINDL = { place: 'Places', theme: 'Themes', moment: 'Moments' };
const smartCover = a => a.ids.map(itemById).filter(Boolean).sort((x, y) => AI.quality(y) - AI.quality(x))[0];
async function renderSmartAlbums() {
  const el = $('#smartAlbums'); if (!el) return;
  if (!aiOn()) { el.innerHTML = ''; return; }
  const al = await getSmart(); if (view !== 'collections') return;
  if (!al.length) { el.innerHTML = `<div class="smart-empty">${IC.spark}<span>Smart albums appear here once on-device AI has indexed a few photos.</span></div>`; return; }
  el.innerHTML = Object.entries(KINDL).map(([k, l]) => { const xs = al.filter(a => a.kind === k); if (!xs.length) return '';
    return `<div class="sub-h smart-h">${IC.spark}${l}</div><div class="smart-row">${xs.map((a, i) => { const cv = smartCover(a);
      return `<div class="col-card smart" data-smart="${esc(a.id)}" style="--fb:${fbFor(a.id)};--i:${i}" role="button" tabindex="0">${cv ? `<img alt="" data-tid="${cv.id}">` : ''}<div class="tint user"></div><div class="gloss"></div>
        <span class="auto-chip">${IC.spark}Auto</span><div class="info"><div><h3>${esc(a.name)}</h3><p>${a.ids.length} items${a.sub ? ' · ' + esc(a.sub) : ''}</p></div></div></div>`; }).join('')}</div>`; }).join('') +
    `<div class="sub-h smart-h mine">Your collections</div>`;
  hydrateCovers(el);
  el.querySelectorAll('[data-smart]').forEach(c => c.onclick = () => openCollection(c.dataset.smart));
}
async function renderSmartCollection() {
  await getSmart(); const a = smartById(curCol); if (!a) { nav('collections'); return; }
  const items = a.ids.map(itemById).filter(i => i && !i.vault && !i.archived), cv = smartCover(a);
  const h = $('#colHero'); h.style.setProperty('--fb', fbFor(a.id));
  h.innerHTML = `${cv ? `<img alt="" data-tid="${cv.id}">` : ''}<div class="tint user"></div><div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(14,3,7,.9),transparent 70%)"></div>
    <div class="info"><h2>${esc(a.name)}</h2><p>${IC.spark}${items.length} items · Smart album · ${KINDL[a.kind].replace(/s$/, '')}${a.sub ? ' · ' + esc(a.sub) : ''}</p></div>
    <div class="hero-actions"><button class="btn btn-ghost btn-sm" id="smReel">${IC.reel}<span>Highlights</span></button><button class="btn btn-primary btn-sm" id="smSave">${IC.plus}<span>Save as collection</span></button></div>`;
  hydrateCovers(h);
  $('#smReel').onclick = () => openReel(items, a.name);
  $('#smSave').onclick = async () => {
    const name = (await promptBox('Save as collection', 'Creates a normal collection with these items. It won’t change automatically.', a.name, 'Save') || '').trim(); if (!name) return;
    const c = { id: uid(), name: name.slice(0, 60), cover: cv ? cv.id : null, created: Date.now() }; idx.collections.push(c);
    items.forEach(it => { if (!it.cols.includes(c.id)) it.cols.push(c.id); }); await save(); toast(`Saved “${c.name}”`); openCollection(c.id);
  };
  const list = a.kind === 'moment' ? items.slice().sort((x, y) => Smart.timeOf(x) - Smart.timeOf(y)) : sortNew(items);
  renderGrid($('#colItems'), list, `<div class="empty"><b>Nothing here right now</b>Smart albums update as your library changes.</div>`);
}

function archiveItems(ids, on = true) {
  ids.forEach(id => { const it = itemById(id); if (!it) return; if (on) it.archived = Date.now(); else delete it.archived; });
  return save().then(() => toast(on ? `Archived ${ids.length} item${ids.length === 1 ? '' : 's'}. Find them in Profile → Archive.` : `Restored ${ids.length} item${ids.length === 1 ? '' : 's'}`));
}
const qLabel = (r, top) => r.q >= top - .8 ? 'Sharp' : r.q >= top - 2 ? 'Softer' : 'Blurry or dark';
async function renderBest() {
  const body = $('#bestBody'); if (!body) return;
  if (!aiOn()) { body.innerHTML = `<div class="empty"><b>On-device AI is off</b>Turn it on in Profile to find your best shots.</div>`; return; }
  await AI.open(idx); const st = AI.stats(idx);
  body.innerHTML = `<div class="section-title"><h2>Best shots</h2><span>${st.indexed} of ${st.total} indexed</span></div><div class="lb-loading" style="margin:40px auto"></div>`;
  const groups = await Smart.bestShots(visible()); if (view !== 'best') return;
  const extras = groups.reduce((a, g) => a + g.ids.length - 1, 0);
  body.innerHTML = `<div class="section-title"><h2>Best shots</h2><span>${groups.length} set${groups.length === 1 ? '' : 's'}</span></div>
    <p class="sub-note">Bursts and look-alike photos, grouped on this device. Velvet picks the sharpest, best-exposed, most typical shot. Archived extras are hidden but kept encrypted until you delete them.</p>
    ${groups.length > 1 ? `<div class="dact top"><button class="btn btn-primary btn-sm" id="bestAll">${IC.check}Keep best in all sets · archive ${extras}</button></div>` : ''}
    ${groups.map((g, gi) => `<div class="dgroup bgroup" data-bg="${gi}"><div class="dgh"><b>${g.ids.length} similar shots</b><span>Best pick is highlighted. Untick anything you want to keep too.</span></div>
      <div class="drow">${g.rows.map(r => { const it = itemById(r.id), b = r.id === g.best;
        return `<label class="dtile ${b ? 'keep best' : ''}" data-id="${r.id}"><input type="checkbox" ${b ? '' : 'checked'} data-arch="${r.id}"><div class="dimg" style="--ar:${Math.max(.5, Math.min(2, it.ar || 1))}"><img data-tid="${r.id}" alt=""></div><small>${esc(it.title)}<br>${qLabel(r, Math.max(...g.rows.map(x => x.q)))} · ${it.w ? it.w + '×' + it.h : ''}</small><span class="kb">${b ? '★ Best' : 'Archive'}</span></label>`; }).join('')}</div>
      <div class="dact"><button class="btn btn-primary btn-sm" data-keepbest="${gi}">${IC.check}Keep best, archive rest</button></div></div>`).join('')}
    ${!groups.length ? `<div class="empty"><b>No bursts or look-alikes</b>When you have several similar shots, they’ll show up here.</div>` : ''}`;
  hydrateCovers(body); hydrateIcons(body);
  body.querySelectorAll('input[data-arch]').forEach(cb => cb.onchange = () => { const t = cb.closest('.dtile'); t.classList.toggle('keep', !cb.checked); t.querySelector('.kb').textContent = cb.checked ? 'Archive' : (t.classList.contains('best') ? '★ Best' : 'Keep'); });
  const run = async grps => { const ids = grps.flatMap(g => [...g.querySelectorAll('input[data-arch]:checked')].map(x => x.dataset.arch)); if (!ids.length) { toast('Nothing selected to archive'); return; } await archiveItems(ids); nav('best', { keepScroll: true }); };
  body.querySelectorAll('[data-keepbest]').forEach(b => b.onclick = () => run([b.closest('.dgroup')]));
  const all = $('#bestAll'); if (all) all.onclick = async () => { if (await confirmBox('Archive all extras?', `Keeps the best shot in each of ${groups.length} sets and archives ${extras} others. You can restore them any time from Profile → Archive.`, 'Archive')) run([...body.querySelectorAll('.bgroup')]); };
}
function renderArchive() {
  const body = $('#archBody'); if (!body) return;
  const items = idx.items.filter(i => i.archived).sort((a, b) => b.archived - a.archived);
  body.innerHTML = `<div class="section-title"><h2>Archive</h2><span>${items.length} item${items.length === 1 ? '' : 's'}</span></div>
    <p class="sub-note">Archived items are hidden from Library, Collections, Search and smart albums. They stay encrypted on this device until you delete them.</p>
    ${items.length ? `<div class="dact top"><button class="btn btn-ghost btn-sm" id="archSelAll">${IC.check}Select all</button><button class="btn btn-primary btn-sm" id="archRestore">Restore selected</button><button class="btn btn-danger btn-sm" id="archDel">${IC.trash}Delete selected</button></div>
      <div class="drow arch">${items.map(it => `<label class="dtile" data-id="${it.id}"><input type="checkbox" data-a="${it.id}"><div class="dimg" style="--ar:${Math.max(.5, Math.min(2, it.ar || 1))}"><img data-tid="${it.id}" alt=""></div><small>${esc(it.title)}<br>archived ${new Date(it.archived).toLocaleDateString()}</small></label>`).join('')}</div>`
      : `<div class="empty"><b>Archive is empty</b>Use Best shots to tidy up bursts and look-alikes.</div>`}`;
  hydrateCovers(body); hydrateIcons(body);
  const picked = () => [...body.querySelectorAll('input[data-a]:checked')].map(x => x.dataset.a);
  const sa = $('#archSelAll'); if (sa) sa.onclick = () => { const cbs = [...body.querySelectorAll('input[data-a]')], on = cbs.some(c => !c.checked); cbs.forEach(c => c.checked = on); };
  const rs = $('#archRestore'); if (rs) rs.onclick = async () => { const ids = picked(); if (!ids.length) return toast('Select items to restore'); await archiveItems(ids, false); renderArchive(); };
  const dl = $('#archDel'); if (dl) dl.onclick = async () => { const ids = picked(); if (!ids.length) return toast('Select items to delete'); if (await deleteItems(ids)) renderArchive(); };
}

/* smart rules: run on this device after indexing/tag edits; each rule handles an item once (so manual moves stick) */
const rulesOf = () => (idx.settings.rules = idx.settings.rules || []);
const ruleSeen = new Map();   // in-memory only; cleared on lock
async function applyRules({ ids = null, only = null, quiet = false } = {}) {
  const rules = rulesOf().filter(r => r.on && (!only || only.includes(r.id))); if (!rules.length) return 0;
  if (aiOn()) await AI.open(idx).catch(() => { });
  let pool = idx.items.filter(i => !i.archived); if (ids) pool = pool.filter(i => ids.includes(i.id));
  let total = 0; const msgs = [];
  for (const r of rules) {
    if (r.action === 'col' && !colById(r.col)) continue;
    // AI-search rules: within a session only look at indexed items this rule hasn't checked yet (avoids re-scanning on every run)
    let cand = pool;
    if (r.kind === 'search') { const seen = ruleSeen.get(r.id) || new Set(); ruleSeen.set(r.id, seen); cand = pool.filter(i => !seen.has(i.id)); if (!cand.length) continue; cand.forEach(i => { if (AI.itemVec(i.id)) seen.add(i.id); }); }
    const m = await Smart.matchRule(r, cand); if (!m.length) continue;
    for (const id of m) { const it = itemById(id); if (!it) continue; if (r.action === 'vault') it.vault = true; else if (!it.cols.includes(r.col)) it.cols.push(r.col); it.ruled = [...(it.ruled || []), r.id]; }
    r.count = (r.count || 0) + m.length; r.last = Date.now(); total += m.length;
    msgs.push(`${m.length} → ${r.action === 'vault' ? 'Vault' : '“' + colById(r.col).name + '”'}`);
  }
  if (total) { await save(); if (!quiet) toast('Smart rules: ' + msgs.join(', '), 4000); if (view !== 'best' && view !== 'dupes') render(); }
  return total;
}
function renderRules() {
  const body = $('#rulesBody'); if (!body) return; const rules = rulesOf();
  body.innerHTML = `<div class="section-title"><h2>Smart rules</h2><span>${rules.length} rule${rules.length === 1 ? '' : 's'}</span></div>
    <p class="sub-note">Rules run on this device whenever new items are indexed or you edit tags. Each rule moves an item once, so if you take something back out of the Vault it stays out.</p>
    <div class="card rows rules">${rules.map(r => `<div class="row rule" data-rid="${r.id}"><div class="meta">${esc(r.name || Smart.describe(r, (colById(r.col) || {}).name))}<small>${Smart.describe(r, (colById(r.col) || {}).name)}${r.count ? ` · applied to ${r.count}` : ''}${r.action === 'col' && !colById(r.col) ? ' · collection was deleted' : ''}</small></div>
      <button class="switch" role="switch" aria-checked="${!!r.on}" data-ron="${r.id}" aria-label="Rule on"></button><button class="iconbtn sm" data-rdel="${r.id}" aria-label="Delete rule">${IC.trash}</button></div>`).join('') ||
      `<div class="row"><div class="meta">No rules yet<small>Example: items tagged “beach” → collection “Summer”, or items looking like “documents” → Vault.</small></div></div>`}</div>
    <div class="dact top"><button class="btn btn-primary btn-sm" id="ruleAdd">${IC.plus}Add rule</button>${rules.length ? `<button class="btn btn-ghost btn-sm" id="ruleRun">Run rules now</button>` : ''}</div>`;
  hydrateIcons(body);
  body.querySelectorAll('[data-ron]').forEach(b => b.onclick = async () => { const r = rules.find(x => x.id === b.dataset.ron); r.on = !r.on; await save(); renderRules(); if (r.on) applyRules({ only: [r.id] }); });
  body.querySelectorAll('[data-rdel]').forEach(b => b.onclick = async () => { const r = rules.find(x => x.id === b.dataset.rdel); if (!(await confirmBox('Delete rule?', 'Items it already moved stay where they are.', 'Delete', true))) return; idx.settings.rules = rules.filter(x => x !== r); await save(); renderRules(); });
  $('#ruleAdd').onclick = addRuleDialog;
  const rr = $('#ruleRun'); if (rr) rr.onclick = async () => { const n = await applyRules(); if (!n) toast('Rules ran: nothing new to move'); renderRules(); };
}
async function addRuleDialog(pre = {}) {
  const PL = peopleOn() && People.isOpen() ? peopleList({ hidden: true }) : [];
  const tags = [...new Set(idx.items.flatMap(i => [...(i.tags || []), ...(i.aiTags || [])]))].sort();
  const res = await modal(`<h3>New smart rule</h3>
    <div class="rule-form"><label class="fl">When an item is</label><select class="field" id="rKind"><option value="tag">tagged</option>${AI.hasIndex() ? '<option value="search">looking like (AI search)</option>' : ''}${PL.length ? '<option value="person">showing a person (People)</option>' : ''}</select>
    <input class="field" id="rVal" placeholder="e.g. beach" list="rTags" autocomplete="off"><datalist id="rTags">${tags.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    ${PL.length ? `<select class="field" id="rPer" style="display:none">${PL.map(x => `<option value="${x.p.id}">${esc(pName(x.p))} · ${x.n} item${x.n === 1 ? '' : 's'}</option>`).join('')}</select>` : ''}
    <label class="fl">then</label><select class="field" id="rAct"><option value="vault">move it to the Vault</option>${idx.collections.map(c => `<option value="col:${c.id}">add it to “${esc(c.name)}”</option>`).join('')}<option value="new">add it to a new collection…</option></select>
    <label class="chk"><input type="checkbox" id="rNow" checked> Also apply to items already in my library</label><p class="sub-note" id="rPrev"></p></div>
    <div class="actions"><button class="btn btn-ghost" data-r="">Cancel</button><button class="btn btn-primary" data-ok>Create rule</button></div>`, (m, close) => {
    const kindEl = m.querySelector('#rKind'), perEl = m.querySelector('#rPer'), valEl = m.querySelector('#rVal');
    const getVal = () => kindEl.value === 'person' ? (perEl ? perEl.value : '') : valEl.value.trim();
    const sync = () => { const per = kindEl.value === 'person'; valEl.style.display = per ? 'none' : ''; if (perEl) perEl.style.display = per ? '' : 'none'; };
    const prev = async () => { sync(); const v = getVal(), p = m.querySelector('#rPrev'); if (!v) { p.textContent = ''; return; }
      const r = { id: '_', kind: m.querySelector('#rKind').value, value: v, action: 'vault' }; const n = (await Smart.matchRule(r, idx.items.filter(i => !i.vault))).length; p.textContent = `${n} item${n === 1 ? '' : 's'} in your library match right now.`; };
    let t; m.querySelector('#rVal').addEventListener('input', () => { clearTimeout(t); t = setTimeout(prev, 350); }); kindEl.onchange = prev; if (perEl) perEl.onchange = prev;
    if (pre.person && perEl) { kindEl.value = 'person'; perEl.value = pre.person; prev(); }
    m.querySelector('[data-ok]').onclick = () => { const v = getVal(); if (!v) { valEl.focus(); return; } close({ kind: kindEl.value, value: v.slice(0, 80), act: m.querySelector('#rAct').value, now: m.querySelector('#rNow').checked }); };
  });
  if (!res || typeof res !== 'object') return;
  let action = 'vault', col = null;
  if (res.act === 'new') { const c = await newCollection(); if (!c) return; action = 'col'; col = c.id; }
  else if (res.act.startsWith('col:')) { action = 'col'; col = res.act.slice(4); }
  const r = { id: uid(), on: true, kind: res.kind, value: res.value, action, col, created: Date.now(), count: 0 };
  if (!res.now) idx.items.forEach(it => { it.ruled = [...(it.ruled || []), r.id]; });   // only future items
  rulesOf().push(r); await save(); if (view === 'rules') renderRules();
  const n = await applyRules({ only: [r.id] }); if (!n) toast('Rule created'); if (view === 'rules') renderRules();
}

/* ---------- backup / restore ---------- */
async function exportBackup() {
  const files = []; idx.items.forEach(i => { files.push({ id: i.id, n: i.chunks }); if (i.thumb) files.push({ id: i.thumb.id, n: i.thumb.chunks }); if (i.chap && i.chap.file) files.push({ id: i.chap.file.id, n: i.chap.file.chunks }); });
  const aif = idx.settings.ai && idx.settings.ai.file; if (aif) files.push({ id: aif.id, n: aif.chunks });
  const pff = idx.settings.faces && idx.settings.faces.file; if (pff) files.push({ id: pff.id, n: pff.chunks });
  const total = idx.items.reduce((a, i) => a + (i.stored || 0) + ((i.thumb && i.thumb.stored) || 0), 0);
  const name = `velvet-backup-${new Date().toISOString().slice(0, 10)}.velvet`;
  if (!(await confirmBox('Export encrypted backup', `This creates <b>${esc(name)}</b> (about ${bytes(total)}). It’s encrypted with your current passcode, so you’ll need that passcode to restore it on any device.`, 'Export'))) return;
  const onP = p => progress('Exporting backup', p);
  try {
    if (host && host.backupBegin) {
      const tok = await host.backupBegin(name); if (!tok) return;
      let buf = [], size = 0; const flush = async () => { if (!size) return; const all = new Uint8Array(size); let o = 0; for (const b of buf) { all.set(b, o); o += b.length; } buf = []; size = 0; await host.backupWrite(tok, all); };
      await Store.exportBackup(files, async d => { buf.push(d); size += d.length; if (size > 8 * 1024 * 1024) await flush(); }, onP);
      await flush(); await host.backupEnd(tok); progress(null); toast('Backup saved');
    } else if (window.showSaveFilePicker && !isIOS) {
      let h; try { h = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'Velvet backup', accept: { 'application/octet-stream': ['.velvet'] } }] }); } catch (e) { return; }
      const w = await h.createWritable(); await Store.exportBackup(files, d => w.write(d), onP); await w.close(); progress(null); toast('Backup saved');
    } else {
      if (total > (isIOS ? 800 : 2000) * 1024 ** 2 && !(await confirmBox('Large backup', `Your library is ${bytes(total)}. This browser has to build the backup in memory, which may fail on ${isIOS ? 'an iPhone' : 'this device'}.`, 'Try anyway'))) return;
      const parts = []; await Store.exportBackup(files, d => parts.push(d), onP); progress(null);
      await saveBlob(new Blob(parts, { type: 'application/octet-stream' }), name); toast('Backup ready');
    }
  } catch (e) { progress(null); toast('Backup failed: ' + e.message, 5000); }
}
function startRestore() { $('#restoreFile').click(); }
$('#restoreFile').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  let info; try { info = await Store.readBackupHeader(f); } catch (err) { toast(err.message || 'Not a Velvet backup'); return; }
  const had = await Store.isSetUp();
  if (had && !(await confirmBox('Replace this library?', `Restoring <b>${esc(f.name)}</b> (${bytes(f.size)}, ${info.header.files.length} files) <b>replaces everything</b> currently in Velvet on this device. After that, the backup’s passcode is your passcode.`, 'Replace', true))) return;
  const pass = await promptBox('Backup passcode', 'Enter the passcode that was used when this backup was made.', '', 'Restore', 'password'); if (!pass) return;
  closePlayer(); closeLightbox(); progress('Checking passcode…', 0);
  try {
    const ok = await Store.restoreBackup(f, pass, p => progress('Restoring backup', p)); progress(null);
    if (!ok) { toast('Wrong passcode for this backup.', 4000); if (!had) gateSetup(); return; }
    for (const u of thumbs.values()) URL.revokeObjectURL(u); thumbs.clear(); fulls.clear(); await AI.shutdown(); People.shutdown();
    idx = await Store.loadIndex(); afterUnlock(false); toast('Backup restored', 3500);
  } catch (err) { progress(null); toast('Restore failed: ' + err.message, 6000); if (!(await Store.isSetUp())) gateSetup(); }
});

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (isLocked() || document.querySelector('.modal')) return;
  if (pl.classList.contains('open')) {
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); } else if (k === 'ArrowLeft' || k === 'j') skip(-10); else if (k === 'ArrowRight' || k === 'l') skip(10);
    else if (k === 'f') $('#cFull').click(); else if (k === 'm') $('#cMute').click(); else if (k === 'Escape' && !document.fullscreenElement) closePlayer();
    wake(); return;
  }
  if (lb.classList.contains('open')) { if (e.key === 'ArrowLeft') lbStep(-1); else if (e.key === 'ArrowRight') lbStep(1); else if (e.key === 'Escape') closeLightbox(); return; }
  if (e.key === 'Escape' && selecting) endSelect();
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); nav('search', { focus: true }); }
});

/* ---------- boot ---------- */
hydrateIcons();
if ('serviceWorker' in navigator && !host && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
(async () => {
  try { await Store.open(); (await Store.isSetUp()) ? gateUnlock() : gateSetup(); }
  catch (e) { gate.innerHTML = `<div class="mono">V</div><h1>Storage unavailable</h1><p class="sub">Velvet couldn’t open its encrypted storage (${esc(e.message)}). Private browsing modes block it; open Velvet in a normal window.</p>`; }
})();
window.Velvet = { People, openPerson, startPeople, toggleSelect, get reel() { return R; }, get chap() { return chap; }, Scenes, openReel, closeReel, nav, lockNow, importFiles, get idx() { return idx; }, Store, openPlayer, openLightbox, openCollection, newCollection, regenPreviews, Thumbs, AI, startAI, Smart, applyRules };
