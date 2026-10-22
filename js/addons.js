// Velvet v1.7 add-ons: optional on-device tools (video converter, speech search, text in photos).
// Their files live on Velvet's own site (same origin, never a CDN). They are fetched only when a feature is
// first used, after the user sees the size, and kept in the browser cache so they work offline afterwards.
// The Windows app ships them inside the app, so nothing is downloaded there.
const base = new URL('../', import.meta.url).href;
export const CACHE = 'velvet-addons-v1', MODELS = 'velvet-ai-v1';
const cacheFor = p => (p.startsWith('addons/') ? CACHE : MODELS);
const host = typeof window !== 'undefined' && window.velvetHost;
let manifest = null;
async function man() {
  if (manifest) return manifest;
  const r = await fetch(base + 'addons/manifest.json', { cache: 'no-cache' }).catch(() => null) || await caches.match(base + 'addons/manifest.json').catch(() => null);
  if (!r || !r.ok) throw new Error('add-on list unavailable (are you offline?)');
  manifest = await r.json(); return manifest;
}
const v = a => WebAssembly.validate(new Uint8Array(a));
export const simd = () => { try { return v([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]); } catch (e) { return false; } };
export const relaxed = () => { try { return v([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11]); } catch (e) { return false; } };
export const INFO = {
  video: { name: 'Video tools', what: 'convert, compress and trim videos' },
  speech: { name: 'Speech search', what: 'find videos by what’s said and show subtitles' },
  ocr: { name: 'Text in photos', what: 'find photos and screenshots by the text in them' },
};
// files each add-on needs (the OCR engine variant depends on the device's WebAssembly features, like tesseract.js picks it)
export async function files(key) {
  const m = await man(), a = m.addons[key]; if (!a) return [];
  let list = a.files.slice();
  if (key === 'ocr') { const core = relaxed() ? 'relaxedsimd-lstm' : simd() ? 'simd-lstm' : 'lstm'; list = list.filter(f => !f.includes('/core/') || f.endsWith(`tesseract-core-${core}.wasm.js`)); }
  return list.map(f => ({ path: f, size: m.sizes[f] || 0 }));
}
async function cached(path) { try { const c = await caches.open(cacheFor(path)); return !!(await c.match(base + path, { ignoreSearch: true })); } catch (e) { return false; } }
// { total, missing } in bytes. In the Windows app everything is built in.
export async function status(key) {
  const fs = await files(key), total = fs.reduce((a, f) => a + f.size, 0);
  if (host || typeof caches === 'undefined') return { total, missing: 0, builtIn: !!host };
  let missing = 0; for (const f of fs) if (!(await cached(f.path))) missing += f.size;
  return { total, missing, builtIn: false };
}
// Fetch whatever is missing, with byte progress. Resolves true when everything is cached.
export async function download(key, onProgress, signal) {
  if (host || typeof caches === 'undefined') return true;
  const fs = []; for (const f of await files(key)) if (!(await cached(f.path))) fs.push(f);
  const total = fs.reduce((a, f) => a + f.size, 0) || 1; let got = 0;
  for (const f of fs) {
    const r = await fetch(base + f.path, { cache: 'reload', signal });
    if (!r.ok || !r.body) throw new Error(`couldn’t download ${f.path.split('/').pop()} (${r.status})`);
    const rd = r.body.getReader(), parts = [];
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress && onProgress(Math.min(1, got / total), got, total); }
    const blob = new Blob(parts, { type: r.headers.get('content-type') || 'application/octet-stream' });
    const c = await caches.open(cacheFor(f.path)); await c.put(base + f.path, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }));
  }
  return true;
}
// Remove an add-on's cached files (shared AI runtime files stay, they belong to on-device AI too)
export async function remove(key) {
  if (host || typeof caches === 'undefined') return;
  const c = await caches.open(CACHE); for (const f of await files(key)) if (f.path.startsWith('addons/')) await c.delete(base + f.path, { ignoreSearch: true });
}
export const url = p => base + p;
export const isHost = () => !!host;
