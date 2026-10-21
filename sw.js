// Velvet service worker: caches the app shell so Velvet opens fully offline.
// It never sees your photos/videos (those live encrypted in IndexedDB and are decrypted in the page).
const VERSION = 'velvet-v9';
// AI model + runtime (~93 MB) live in their own cache so app updates don't re-download them
const MODELS = 'velvet-ai-v1';
const isModel = p => p.includes('/models/') || p.includes('/js/vendor/transformers/');
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/fonts.css', 'css/base.css', 'css/app.css', 'css/ios.css', 'js/app.js', 'js/ios.js', 'js/store.js', 'js/thumbs.js', 'js/vision.js', 'js/smart.js', 'js/scenes.js', 'js/people.js', 'media/probe.mp4', 'js/ai.js', 'js/ai-worker.js',
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
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== MODELS).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'version' && e.ports[0]) e.ports[0].postMessage({ version: VERSION }); });
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
  if (isModel(u.pathname)) { e.respondWith(caches.open(MODELS).then(c => c.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok && res.status === 200) c.put(e.request, res.clone()); return res; })))); return; }
  if (e.request.mode === 'navigate') { e.respondWith(fresh(e.request, 'index.html')); return; }
  if (/\.(js|css|webmanifest|html)$/.test(u.pathname)) { e.respondWith(fresh(e.request)); return; }
  // fonts/icons: cache-first (immutable per version)
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(e.request, c)); } return res; })));
});
