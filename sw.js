// Velvet service worker: caches the app shell so Velvet opens fully offline.
// It never sees your photos/videos (those live encrypted in IndexedDB and are decrypted in the page).
const VERSION = 'velvet-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/fonts.css', 'css/base.css', 'css/app.css', 'js/app.js', 'js/store.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon.png',
  'fonts/GreatVibes-normal-400.woff2', 'fonts/Inter-normal-300.woff2', 'fonts/Inter-normal-400.woff2', 'fonts/Inter-normal-500.woff2', 'fonts/Inter-normal-600.woff2',
  'fonts/PlayfairDisplay-italic-400.woff2', 'fonts/PlayfairDisplay-italic-500.woff2', 'fonts/PlayfairDisplay-normal-500.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network-first for the page so updates arrive; cache-first for static assets
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(ca => ca.put('index.html', c)); return r; }).catch(() => caches.match('index.html'))); return; }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(e.request, c)); } return res; })));
});
