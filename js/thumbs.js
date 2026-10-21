// Velvet: robust preview (thumbnail) generation for real-world files.
// Handles iOS Safari quirks (frames not painted until seeked/played), HEVC .mov from iPhones,
// HEIC/HEIF photos (native in Safari, bundled offline libheif decoder elsewhere), EXIF orientation,
// very large photos (downscaled in steps to stay well under iOS canvas limits), GIF and WebP.
const MAX = 640;
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isHeic = (mime, name) => /image\/hei[cf]/i.test(mime || '') || /\.(heic|heif|hif)$/i.test(name || '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
export function timed(p, ms, what) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error((what || 'step') + ' timed out')), ms))]); }
export function once(el, ev, ms) {
  return timed(new Promise((res, rej) => {
    const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error('media error ' + (el.error && el.error.code))); };
    const off = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
    el.addEventListener(ev, ok); el.addEventListener('error', bad);
  }), ms, ev);
}

/* draw any source into a <=640px canvas; large sources go via one intermediate step for quality
   (intermediate is at most 1280px, so no huge canvases are ever created). */
export function drawScaled(src, w, h, max = MAX) {
  const k = Math.min(1, max / Math.max(w, h)), tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
  let from = src, fw = w, fh = h;
  if (k < 1 / 3) {
    const mid = document.createElement('canvas'); mid.width = tw * 2; mid.height = th * 2;
    const mx = mid.getContext('2d'); mx.imageSmoothingQuality = 'high'; mx.drawImage(src, 0, 0, mid.width, mid.height);
    from = mid; fw = mid.width; fh = mid.height;
  }
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(from, 0, 0, fw, fh, 0, 0, tw, th);
  if (from !== src) { from.width = from.height = 0; }
  return c;
}
/* sample the canvas: painted = any non-transparent pixel; lum/sd tell a black/blank frame apart */
export function sample(c) {
  const s = document.createElement('canvas'); s.width = 24; s.height = 24;
  const x = s.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data; let a = 0, sum = 0, sq = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { a = Math.max(a, d[i + 3]); const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sq += l * l; n++; }
  const lum = sum / n; return { painted: a > 0, lum, sd: Math.sqrt(Math.max(0, sq / n - lum * lum)) };
}
// opaque solid black is what WebKit/iOS hands back when no frame has been decoded yet
export const isBlank = st => !st.painted || (st.lum < 4 && st.sd < 2);
export const toJpeg = (c, q = .82) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', q));

/* ---------- photos ---------- */
async function viaBitmap(file) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
  return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close && bmp.close() };
}
async function viaImg(file) {
  const url = URL.createObjectURL(file), img = new Image(); img.decoding = 'async'; img.src = url;
  try { await timed(img.decode(), 20000, 'image decode'); } catch (e) { URL.revokeObjectURL(url); throw e; }
  if (!img.naturalWidth) { URL.revokeObjectURL(url); throw new Error('empty image'); }
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => { URL.revokeObjectURL(url); img.src = ''; } };
}
// Both paths honour EXIF orientation. iOS: <img> first (WebKit subsamples big JPEGs on decode, avoiding
// full-resolution bitmaps that can exhaust memory); elsewhere createImageBitmap first.
async function decodeNative(file) {
  const order = isIOS ? [viaImg, viaBitmap] : [viaBitmap, viaImg]; let last;
  for (const f of order) { try { return await f(file); } catch (e) { last = e; } }
  throw last || new Error('cannot decode');
}

let heicLib = null;
async function heicDecode(file, max) {
  if (!heicLib) { const m = await import('./vendor/libheif.js'); heicLib = m.default(); if (heicLib.then) heicLib = await heicLib; }
  const dec = new heicLib.HeifDecoder(); const imgs = dec.decode(new Uint8Array(await file.arrayBuffer()));
  if (!imgs || !imgs.length) throw new Error('not a readable HEIC');
  const im = imgs[0], w = im.get_width(), h = im.get_height();
  try {
    const data = await new Promise((res, rej) => im.display({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }, d => d ? res(d) : rej(new Error('HEIC decode failed'))));
    const full = document.createElement('canvas'); full.width = w; full.height = h;
    full.getContext('2d').putImageData(new ImageData(data.data, w, h), 0, 0);
    const c = drawScaled(full, w, h, max); full.width = full.height = 0; return { canvas: c, w, h };
  } finally { imgs.forEach(i => i.free && i.free()); }
}
export async function imageThumb(file, mime) {
  let err;
  try {
    const d = await decodeNative(file);
    try { const c = drawScaled(d.src, d.w, d.h); if (!sample(c).painted) throw new Error('blank'); return { blob: await toJpeg(c), w: d.w, h: d.h }; }
    finally { d.done(); }
  } catch (e) { err = e; }
  if (isHeic(mime, file.name)) { const r = await heicDecode(file, MAX); return { blob: await toJpeg(r.canvas), w: r.w, h: r.h, heicSoft: true }; }
  throw err;
}
/* full-size display copy for HEIC where the browser can't show it natively (Windows/Chromium) */
export async function displayableImage(blob, mime, name) {
  if (!isHeic(mime, name)) return blob;
  try { const b = await createImageBitmap(blob); b.close && b.close(); return blob; } catch (e) { }
  const r = await heicDecode(blob, 4096); return toJpeg(r.canvas, .9);
}

/* ---------- videos ---------- */
// Read duration, display size (with rotation) and codec straight from the MP4/MOV container.
// Works even when this browser can't decode the codec (e.g. iPhone HEVC on Windows).
export async function probeMp4(file) {
  const out = {};
  try {
    const rd = async (o, n) => new DataView(await file.slice(o, o + n).arrayBuffer());
    let off = 0, moov = null, guard = 0;
    while (off + 8 <= file.size && guard++ < 64) {
      const h = await rd(off, 16); let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
      if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - off;
      if (size < 8) break;
      if (type === 'moov') { if (size > 64 * 1024 * 1024) break; moov = await rd(off, size); break; }
      off += size;
    }
    if (!moov) return out;
    const fourcc = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    const kids = (s, e) => { const r = []; let o = s; while (o + 8 <= e) { const sz = moov.getUint32(o); if (sz < 8 || o + sz > e) break; r.push({ t: fourcc(moov, o + 4), s: o + 8, e: o + sz }); o += sz; } return r; };
    for (const b of kids(8, moov.byteLength)) {
      if (b.t === 'mvhd') { const v1 = moov.getUint8(b.s) === 1; const ct = v1 ? Number(moov.getBigUint64(b.s + 4)) : moov.getUint32(b.s + 4); if (ct > 2082844800 + 315532800) out.created = (ct - 2082844800) * 1000; const ts = moov.getUint32(b.s + (v1 ? 20 : 12)); const du = v1 ? Number(moov.getBigUint64(b.s + 24)) : moov.getUint32(b.s + 16); if (ts) out.dur = du / ts; }
      if (b.t !== 'trak') continue;
      const tk = kids(b.s, b.e); const tkhd = tk.find(x => x.t === 'tkhd'), mdia = tk.find(x => x.t === 'mdia'); if (!tkhd || !mdia) continue;
      const md = kids(mdia.s, mdia.e), hdlr = md.find(x => x.t === 'hdlr'); if (!hdlr || fourcc(moov, hdlr.s + 8) !== 'vide') continue;
      const base = tkhd.s + (moov.getUint8(tkhd.s) === 1 ? 36 : 24) + 16; // -> matrix
      const a = moov.getInt32(base), bb = moov.getInt32(base + 4);
      let w = moov.getUint32(base + 36) / 65536, hh = moov.getUint32(base + 40) / 65536;
      if (a === 0 && bb !== 0) [w, hh] = [hh, w];
      if (w && hh) { out.w = Math.round(w); out.h = Math.round(hh); }
      const minf = md.find(x => x.t === 'minf'), stbl = minf && kids(minf.s, minf.e).find(x => x.t === 'stbl'), stsd = stbl && kids(stbl.s, stbl.e).find(x => x.t === 'stsd');
      if (stsd) out.codec = fourcc(moov, stsd.s + 12);
      break;
    }
  } catch (e) { }
  return out;
}
const HEVC = c => /^(hvc1|hev1|dvh1|dvhe)$/.test(c || '');
export async function frameReady(v, ms = 700) {
  if (v.requestVideoFrameCallback) await timed(new Promise(r => v.requestVideoFrameCallback(() => r())), ms, 'frame').catch(() => { });
  else await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}
export async function videoThumb(file, mime, opts = {}) {
  const meta = /mp4|quicktime|m4v/.test(mime || '') || /\.(mp4|m4v|mov)$/i.test(file.name || '') ? await probeMp4(file) : {};
  const base = { dur: meta.dur || 0, w: meta.w || 16, h: meta.h || 9, codec: meta.codec || '' };
  // media pipelines sometimes refuse the first load(s): retry with a fresh element (and an mp4 hint for .mov)
  const t0 = performance.now(); let r = await videoThumbOnce(file, base, opts);
  for (let n = 1; !r.blob && n < 3 && performance.now() - t0 < 12000; n++) {
    const alt = n === 1 && /quicktime/.test(file.type) ? new File([file], file.name, { type: 'video/mp4' }) : file;
    await sleep(250 * n); const r2 = await videoThumbOnce(alt, base, opts); if (r2.blob || !r.w || r.w === 16) r = r2;
  }
  return r;
}
/* score a small frame: sharp, well exposed, contrasty and colourful frames win; black/blown-out/faded ones lose */
export function scoreFrame(x, w, h) {
  const d = x.getImageData(0, 0, w, h).data, n = w * h, L = new Float32Array(n);
  let sum = 0, sq = 0, clip = 0, rg = 0, rg2 = 0, yb = 0, yb2 = 0;
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = d[i], g = d[i + 1], b = d[i + 2], l = .299 * r + .587 * g + .114 * b; L[j] = l; sum += l; sq += l * l;
    if (l < 10 || l > 245) clip++;
    const a = r - g, c = .5 * (r + g) - b; rg += a; rg2 += a * a; yb += c; yb2 += c * c;
  }
  const m = sum / n, sd = Math.sqrt(Math.max(0, sq / n - m * m));
  const mrg = rg / n, myb = yb / n, colour = Math.sqrt(Math.max(0, rg2 / n - mrg * mrg) + Math.max(0, yb2 / n - myb * myb)) + .3 * Math.sqrt(mrg * mrg + myb * myb);
  let ls = 0, ls2 = 0, k = 0;                          // Laplacian variance = sharpness
  for (let y = 1; y < h - 1; y++) for (let x2 = 1; x2 < w - 1; x2++) {
    const o = y * w + x2, v = 4 * L[o] - L[o - 1] - L[o + 1] - L[o - w] - L[o + w]; ls += v; ls2 += v * v; k++;
  }
  const lap = k ? ls2 / k - (ls / k) ** 2 : 0, cf = clip / n;
  const expo = m < 45 ? (45 - m) / 45 : m > 210 ? (m - 210) / 45 : 0;
  const score = Math.log1p(Math.max(0, lap)) * 1.0 + Math.min(sd, 80) / 28 + Math.min(colour, 90) / 45 - expo * 3 - cf * 3 - (sd < 14 ? 2.5 : 0);
  return { score, m, sd, lap, colour, cf };
}
async function videoThumbOnce(file, base, opts = {}) {
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', '');
  v.preload = 'auto';
  // in the DOM (but invisible): some WebKit builds never decode frames for detached video elements
  v.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:90px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(v);
  try {
    v.src = url; v.load();
    await once(v, 'loadedmetadata', 8000);
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : base.dur;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return { ...base, dur, blob: null };
    if (v.readyState < 2) await once(v, 'loadeddata', 6000).catch(() => { });
    const seek = async (t, ms = 4000) => { if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return true; v.currentTime = t; const okk = await once(v, 'seeked', ms).then(() => true, () => false); await frameReady(v, 400); return okk; };
    // small reusable canvas for scoring (memory-safe on iOS)
    const sw = 160, sh = Math.max(1, Math.round(160 * h / w)), sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
    const sx = sc.getContext('2d', { willReadFrequently: true });
    const painted = () => { try { sx.clearRect(0, 0, sw, sh); sx.drawImage(v, 0, 0, sw, sh); return !isBlank(sample(sc)); } catch (e) { return false; } };
    let t0 = Math.min(0.5, dur > 0 ? dur / 10 : 0); await seek(t0);
    let firstOk = painted();
    if (!firstOk) {                               // iOS: frames aren't painted until the video has actually played
      try { await timed(v.play(), 3000, 'play'); await frameReady(v, 1200); await sleep(80); } catch (e) { }
      v.pause(); firstOk = painted(); if (firstOk) t0 = v.currentTime;
    }
    let best = { t: t0, score: firstOk ? scoreFrame(sx, sw, sh).score : -1e9 };
    const fixed = opts.at != null ? Math.max(0, Math.min(dur || 0, opts.at)) : null;
    if (fixed == null && dur > 1.5) {
      // smart pick: ~11 evenly spaced candidates, skipping the first/last 5%; whole search capped at ~8 s
      const N = 11, deadline = performance.now() + (opts.budget || 8000); let prev = null, miss = 0;
      for (let i = 0; i < N && performance.now() < deadline && miss < 2; i++) {
        const t = dur * (0.05 + 0.9 * (i + .5) / N);
        if (!(await seek(t, Math.max(300, Math.min(1200, deadline - performance.now()))))) { miss++; continue; } miss = 0;
        if (!painted()) continue;
        const f = scoreFrame(sx, sw, sh);
        if (prev && Math.abs(f.m - prev.m) < 1.5 && Math.abs(f.sd - prev.sd) < 1.5) f.score -= .5; // near-duplicate of the previous candidate
        prev = f;
        if (f.score > best.score) best = { t: v.currentTime || t, score: f.score };
      }
    } else if (fixed != null) best = { t: fixed, score: 0 };
    if (best.score === -1e9 && fixed == null) return { ...base, dur, w, h, blob: null }; // nothing but blank frames
    await seek(best.t);
    let c = drawScaled(v, w, h);
    if (isBlank(sample(c))) { await seek(t0); await frameReady(v, 600); c = drawScaled(v, w, h); if (isBlank(sample(c))) return { ...base, dur, w, h, blob: null }; best.t = t0; }
    return { ...base, dur, w, h, t: +best.t.toFixed(3), blob: await toJpeg(c) };
  } catch (e) {
    return { ...base, blob: null, err: String(e.message || e) };
  } finally { try { v.pause(); } catch (e) { } v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(url); }
}
/* thumbnail from an element that is already showing the right frame (player "Set as preview") */
export async function frameFromVideo(v) { const c = drawScaled(v, v.videoWidth, v.videoHeight); if (isBlank(sample(c))) throw new Error('frame not available'); return toJpeg(c); }
export const isHevc = HEVC;
