// v1.8.1 streaming playback. Instead of decrypting a whole video into memory before it can play,
// the <video> element gets a virtual same-origin URL (./__vstream/<token>). Whoever answers that URL
// (the service worker in the browser/PWA, the app:// protocol handler in the Windows app) only does the
// HTTP part (Range requests -> 206 Partial Content). For every piece of bytes it asks THIS page, which
// decrypts just the 1 MiB chunks that cover the range. The library key therefore never leaves the page:
// the service worker / main process only ever see the decrypted bytes the video element asked for,
// held in memory for the duration of one request, and nothing is written anywhere.
// Lock (or closing the player) revokes every token at once: later requests get "404 / not found".
import * as Store from './store.js';

const host = window.velvetHost || null;
const KEEP = 8;                        // recently decrypted chunks kept per stream (fast seeking back and forth)
const streams = new Map();             // token -> { id, n, size, mime, reader, opened, bytes, reads }
let gen = 0, wired = false, pingT = null;
export const stats = { reads: 0, bytes: 0, chunks: 0 };

const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
function reader(id, n, size) {
  const cache = new Map();
  const chunk = async i => {
    let u = cache.get(i); if (u) { cache.delete(i); cache.set(i, u); return u; }
    if (i < 0 || i >= n) throw new Error('out of range'); u = await Store.readChunk(id, i); stats.chunks++;
    cache.set(i, u); while (cache.size > KEEP) cache.delete(cache.keys().next().value); return u;
  };
  return { chunk, clear: () => cache.clear() };
}
// answer one request from the SW / main process: { op:'info' } or { op:'read', start, end } (inclusive)
async function answer(token, op, start, end) {
  const s = streams.get(token);
  if (!s || !Store.isUnlocked() || window.__velvetStreamBreak) return { err: 'gone' };   // (__velvetStreamBreak: tests simulate a failing stream)
  if (op === 'info') return { size: s.size, mime: s.mime };
  start = Math.max(0, start | 0); end = Math.min(s.size - 1, end);
  if (!(end >= start)) return { buf: new ArrayBuffer(0) };
  const C = Store.CHUNK, out = new Uint8Array(end - start + 1); let w = 0;
  for (let i = Math.floor(start / C); w < out.length; i++) {
    const u = await s.reader.chunk(i); if (!streams.has(token) || !Store.isUnlocked()) return { err: 'gone' };
    const a = Math.max(0, start + w - i * C), b = Math.min(u.length, end + 1 - i * C);
    out.set(u.subarray(a, b), w); w += b - a; if (b - a <= 0) break;
  }
  s.reads++; s.bytes += w; s.hi = Math.max(s.hi || 0, start + w); s.lo = Math.min(s.lo == null ? Infinity : s.lo, start); stats.reads++; stats.bytes += w;
  return { buf: out.buffer };
}
function wire() {
  if (wired) return; wired = true;
  if (host && host.onStreamRequest) {
    host.onStreamRequest(async q => { let r; try { r = await answer(q.token, q.op, q.start, q.end); } catch (e) { r = { err: String(e.message || e) }; } host.streamReply(q.rid, r); });
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  // The SW asks "who owns token X?" with a fresh MessageChannel; only this page answers yes, then serves reads on that port.
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data; if (!d || d.type !== 'vs-find' || !e.ports[0]) return;
    const port = e.ports[0], s = streams.get(d.token);
    if (!s || !Store.isUnlocked()) { port.postMessage({ ok: false }); port.close(); return; }
    (s.ports || (s.ports = new Set())).add(port);
    port.onmessage = async m => { const q = m.data || {}; let r; try { r = await answer(d.token, q.op, q.start, q.end); } catch (err) { r = { err: String(err.message || err) }; }
      try { port.postMessage({ rid: q.rid, ...r }, r.buf ? [r.buf] : []); } catch (_) { } };
    port.postMessage({ ok: true, size: s.size, mime: s.mime });
  });
}
// Can this page stream right now? (browser: an active service worker controls the page; Windows app: protocol support)
export function available() {
  if (window.__velvetNoStream) return false;
  if (host) return !!(host.onStreamRequest && host.streamReply);
  return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
}
export function open(it, mime) {
  wire(); const token = rnd() + '-' + (++gen);
  streams.set(token, { id: it.id, n: it.chunks, size: it.size, mime: mime || it.mime || 'video/mp4', reader: reader(it.id, it.chunks, it.size), opened: Date.now(), bytes: 0, reads: 0 });
  // keep the service worker awake while something is streaming (browsers stop idle workers after ~30 s; it would
  // recover by asking again, but this avoids a hiccup on the first seek after a long pause)
  if (!host && !pingT) pingT = setInterval(() => { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c && streams.size) c.postMessage({ type: 'vs-ping' }); }, 20000);
  return { token, url: (host ? 'app://velvet/' : new URL('./', location.href).href) + '__vstream/' + token, info: () => streams.get(token) };
}
export function close(token) {
  const s = streams.get(token); if (!s) return; streams.delete(token); s.reader.clear();
  if (s.ports) s.ports.forEach(p => { try { p.close(); } catch (_) { } });
  forget([token]);
}
export function closeAll() {
  const toks = [...streams.keys()]; toks.forEach(t => { const s = streams.get(t); streams.delete(t); s.reader.clear(); if (s.ports) s.ports.forEach(p => { try { p.close(); } catch (_) { } }); });
  clearInterval(pingT); pingT = null; forget(null);
}
function forget(tokens) {
  try { if (host && host.streamRevoke) host.streamRevoke(tokens); else { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({ type: 'vs-revoke', tokens }); } } catch (_) { }
}
export const openCount = () => streams.size;
