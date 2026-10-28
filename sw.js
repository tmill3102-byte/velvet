// Velvet service worker: caches the app shell so Velvet opens fully offline.
// It never sees your library key. Photos/videos live encrypted in IndexedDB and are decrypted in the page.
// v1.8.1: for video playback it answers HTTP Range requests for ./__vstream/<token> by asking the page that
// owns the token for just those bytes (the page decrypts only the chunks needed). Nothing is cached or stored.
const VERSION = 'velvet-v14';
// AI model + runtime (~93 MB) live in their own cache so app updates don't re-download them
const MODELS = 'velvet-ai-v1';
const isModel = p => p.includes('/models/') || p.includes('/js/vendor/transformers/');
// v1.7 add-ons (video tools, speech search, text in photos): fetched only when first used, then kept for offline use
const ADDONS = 'velvet-addons-v1';
const isAddon = p => p.includes('/addons/') && !p.endsWith('/addons/manifest.json');
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/fonts.css', 'css/base.css', 'css/app.css', 'css/ios.css', 'js/app.js', 'js/vstream.js', 'js/ios.js', 'js/ctags.js', 'js/dedupe.js', 'js/addons.js', 'js/textidx.js', 'js/vtools.js', 'js/ffmpeg-worker.js', 'js/speech.js', 'js/speech-worker.js', 'js/ocr.js', 'js/imgtools.js', 'js/imgai-worker.js', 'js/caption.js', 'js/caption-worker.js', 'addons/manifest.json', 'js/store.js', 'js/thumbs.js', 'js/vision.js', 'js/smart.js', 'js/scenes.js', 'js/people.js', 'media/probe.mp4', 'js/ai.js', 'js/ai-worker.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon.png',
  'fonts/GreatVibes-normal-400.woff2', 'fonts/Inter-normal-300.woff2', 'fonts/Inter-normal-400.woff2', 'fonts/Inter-normal-500.woff2', 'fonts/Inter-normal-600.woff2',
  'fonts/PlayfairDisplay-italic-400.woff2', 'fonts/PlayfairDisplay-italic-500.woff2', 'fonts/PlayfairDisplay-normal-500.woff2'];
// Install with cache:'reload' so a new version never copies stale files out of the browser's HTTP cache
// (Safari keeps GitHub Pages files for up to 10 min and could otherwise pin old code into the new cache).
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return c.put(u, r); })))
    .then(() => fetch(new Request('js/vendor/libheif.js', { cache: 'reload' })).then(r => r.ok && c.put('js/vendor/libheif.js', r)).catch(() => { })))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== MODELS && k !== ADDONS).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'version' && e.ports[0]) e.ports[0].postMessage({ version: VERSION });
  else if (d.type === 'vs-revoke') revoke(d.tokens);
  // 'vs-ping' needs no answer: a message from the page just keeps this worker awake while a video plays
});

// ---------- v1.8.1 streaming playback (Range requests -> 206), see js/vstream.js ----------
const VS = '/__vstream/', PIECE = 1 << 20, ASK_MS = 5000, READ_MS = 30000;
const routes = new Map();   // token -> Promise<route|null>; route = { port, size, mime, rid, pend }
function revoke(tokens) {
  for (const [t, p] of routes) if (!tokens || tokens.includes(t)) { routes.delete(t); p.then(r => { if (r) { r.dead = true; r.pend.forEach(f => f({ err: 'gone' })); r.pend.clear(); try { r.port.close(); } catch (_) { } } }); }
}
async function findOwner(token) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
  return new Promise(resolve => {
    let left = list.length, done = false; const fin = r => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const t = setTimeout(() => fin(null), ASK_MS); if (!left) fin(null);
    for (const c of list) {
      const ch = new MessageChannel(); let first = true;
      ch.port1.onmessage = m => {
        const d = m.data || {};
        if (first) { first = false; if (d.ok) fin({ port: ch.port1, size: d.size, mime: d.mime || 'video/mp4', rid: 0, pend: new Map() }); else { ch.port1.close(); if (--left === 0) fin(null); } return; }
        const r = routeOf.get(ch.port1); const f = r && r.pend.get(d.rid); if (f) { r.pend.delete(d.rid); f(d); }
      };
      try { c.postMessage({ type: 'vs-find', token }, [ch.port2]); } catch (_) { if (--left === 0) fin(null); }
    }
  }).then(r => { if (r) routeOf.set(r.port, r); return r; });
}
const routeOf = new WeakMap();
function readRange(r, start, end) {
  return new Promise((res, rej) => {
    if (r.dead) { rej(new Error('gone')); return; }
    const rid = ++r.rid, t = setTimeout(() => { r.pend.delete(rid); rej(new Error('timeout')); }, READ_MS);
    r.pend.set(rid, d => { clearTimeout(t); if (d.err || !d.buf) rej(new Error(d.err || 'no data')); else res(new Uint8Array(d.buf)); });
    r.port.postMessage({ op: 'read', rid, start, end });
  });
}
// "bytes=a-b" | "bytes=a-" | "bytes=-n" (first range only). null = no Range header, 'bad' = unsatisfiable.
function parseRange(h, size) {
  if (!h) return null; const m = /^bytes=\s*(\d*)\s*-\s*(\d*)/i.exec(h); if (!m || (m[1] === '' && m[2] === '')) return null;
  let a, b, open = false;
  if (m[1] === '') { const n = +m[2]; if (!n) return 'bad'; a = Math.max(0, size - n); b = size - 1; }
  else { a = +m[1]; if (m[2] === '') { b = size - 1; open = true; } else b = Math.min(+m[2], size - 1); }
  if (a >= size || b < a) return 'bad'; return { a, b, open };
}
async function streamResponse(req, token) {
  let p = routes.get(token); if (!p) { p = findOwner(token); routes.set(token, p); }
  const r = await p; if (!r || r.dead) { routes.delete(token); return new Response('This video is locked or closed.', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }); }
  const size = r.size, H = { 'Content-Type': r.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
  const rg = parseRange(req.headers.get('range'), size);
  if (rg === 'bad') return new Response(null, { status: 416, headers: { ...H, 'Content-Range': `bytes */${size}` } });
  let a = 0, b = size - 1, status = 200;
  if (rg) { a = rg.a; b = rg.b; status = 206; H['Content-Range'] = `bytes ${a}-${b}/${size}`; }
  H['Content-Length'] = String(b - a + 1);
  // read the first piece before answering: if the page can't serve it (locked, closed, failing) the player gets a
  // clean error response (and Velvet falls back) instead of a stream that breaks after the headers
  const read = (s, e) => readRange(r, s, e);
  let pos = a, first;
  try { first = await read(a, Math.min(b, (Math.floor(a / PIECE) + 1) * PIECE - 1)); if (!first.length) throw new Error('short read'); }
  catch (err) { if (err.message === 'gone') routes.delete(token); return new Response('This video is locked or closed.', { status: err.message === 'gone' ? 404 : 503, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }); }
  const body = new ReadableStream({
    async pull(c) {
      if (first) { c.enqueue(first); pos += first.length; first = null; if (pos > b) c.close(); return; }
      if (pos > b) { c.close(); return; }
      const e = Math.min(b, (Math.floor(pos / PIECE) + 1) * PIECE - 1);
      try { const u = await read(pos, e); if (!u.length) throw new Error('short read'); c.enqueue(u); pos += u.length; if (pos > b) c.close(); }
      catch (err) { try { if (String(err.message) === 'gone') { routes.delete(token); c.close(); } else c.error(err); } catch (_) { } }   // revoked: the player is gone, end quietly
    },
    cancel() { pos = b + 1; first = null; }
  });
  return new Response(body, { status, statusText: status === 206 ? 'Partial Content' : 'OK', headers: H });
}
// network-first (revalidated against the server, so updates always win) with a fast fallback to the cache offline
function fresh(req, key) {
  const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok && res.status === 200) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(key || req, c)); } return res; });
  const cached = () => caches.match(key || req, { ignoreSearch: true });
  return new Promise(resolve => {
    let done = false; const t = setTimeout(() => cached().then(r => { if (r && !done) { done = true; resolve(r); } }), 4000);
    net.then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } })
      .catch(() => cached().then(r => { if (!done) { done = true; clearTimeout(t); resolve(r || Response.error()); } }));
  });
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const vi = u.pathname.indexOf(VS); if (vi >= 0) { e.respondWith(streamResponse(e.request, u.pathname.slice(vi + VS.length))); return; }
  if (isAddon(u.pathname)) { e.respondWith(caches.open(ADDONS).then(c => c.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok && res.status === 200) c.put(e.request, res.clone()); return res; })))); return; }
  if (u.pathname.endsWith('/addons/manifest.json')) { e.respondWith(fresh(e.request)); return; }
  if (isModel(u.pathname)) { e.respondWith(caches.open(MODELS).then(c => c.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok && res.status === 200) c.put(e.request, res.clone()); return res; })))); return; }
  if (e.request.mode === 'navigate') { e.respondWith(fresh(e.request, 'index.html')); return; }
  if (/\.(js|css|webmanifest|html)$/.test(u.pathname)) { e.respondWith(fresh(e.request)); return; }
  // fonts/icons: cache-first (immutable per version)
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(e.request, c)); } return res; })));
});
