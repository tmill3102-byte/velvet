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
// A "reader" is { size, read(offset, length) -> Promise<Uint8Array> }: either a File/Blob, or an encrypted
// item decrypted chunk by chunk (Store.rangeReader), so big videos never have to be fully in memory.
export const blobReader = b => ({ size: b.size, read: async (o, n) => new Uint8Array(await b.slice(o, o + n).arrayBuffer()) });
const dv = u => new DataView(u.buffer, u.byteOffset, u.byteLength);
// Parse the MP4/MOV container: duration, display size + rotation, codec, and the video track's sample tables
// (enough to locate and decode a single keyframe). Works even when no <video> element can decode the file.
export async function parseMp4(rd) {
  const out = {};
  try {
    let off = 0, moov = null, guard = 0;
    while (off + 8 <= rd.size && guard++ < 64) {
      const h = dv(await rd.read(off, 16)); let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
      if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = rd.size - off;
      if (size < 8) break;
      if (type === 'moov') { if (size > 64 * 1024 * 1024) { out.why = 'moov box too large'; break; } moov = dv(await rd.read(off, size)); break; }
      off += size;
    }
    if (!moov) { out.why = out.why || 'no moov box found (not an MP4/MOV, or truncated)'; return out; }
    const fourcc = o => String.fromCharCode(moov.getUint8(o), moov.getUint8(o + 1), moov.getUint8(o + 2), moov.getUint8(o + 3));
    const kids = (s, e) => { const r = []; let o = s; while (o + 8 <= e) { const sz = moov.getUint32(o); if (sz < 8 || o + sz > e) break; r.push({ t: fourcc(o + 4), s: o + 8, e: o + sz }); o += sz; } return r; };
    const u32 = o => moov.getUint32(o);
    for (const b of kids(8, moov.byteLength)) {
      if (b.t === 'mvhd') { const v1 = moov.getUint8(b.s) === 1; const ct = v1 ? Number(moov.getBigUint64(b.s + 4)) : u32(b.s + 4); if (ct > 2082844800 + 315532800) out.created = (ct - 2082844800) * 1000; const ts = u32(b.s + (v1 ? 20 : 12)); const du = v1 ? Number(moov.getBigUint64(b.s + 24)) : u32(b.s + 16); if (ts) out.dur = du / ts; }
      if (b.t !== 'trak' || out.track) continue;
      const tk = kids(b.s, b.e); const tkhd = tk.find(x => x.t === 'tkhd'), mdia = tk.find(x => x.t === 'mdia'); if (!tkhd || !mdia) continue;
      const md = kids(mdia.s, mdia.e), hdlr = md.find(x => x.t === 'hdlr'); if (!hdlr || fourcc(hdlr.s + 8) !== 'vide') continue;
      const base = tkhd.s + (moov.getUint8(tkhd.s) === 1 ? 36 : 24) + 16; // -> matrix
      const a = moov.getInt32(base), bb = moov.getInt32(base + 4);
      const rot = ((Math.round(Math.atan2(bb, a) * 180 / Math.PI) % 360) + 360) % 360;
      let w = u32(base + 36) / 65536, hh = u32(base + 40) / 65536;
      if (rot === 90 || rot === 270) [w, hh] = [hh, w];
      if (w && hh) { out.w = Math.round(w); out.h = Math.round(hh); }
      const mdhd = md.find(x => x.t === 'mdhd'), ts = mdhd ? u32(mdhd.s + (moov.getUint8(mdhd.s) === 1 ? 20 : 12)) : 0;
      const minf = md.find(x => x.t === 'minf'), stbl = minf && kids(minf.s, minf.e).find(x => x.t === 'stbl'); if (!stbl) continue;
      const st = {}; kids(stbl.s, stbl.e).forEach(x => { st[x.t] = x; });
      if (!st.stsd) continue;
      const ent = st.stsd.s + 8; out.codec = fourcc(ent + 4);
      const track = { rot, ts, codec: out.codec, cw: moov.getUint16(ent + 32), ch: moov.getUint16(ent + 34) };
      for (const c of kids(ent + 86, ent + u32(ent))) if (/^(avcC|hvcC)$/.test(c.t)) { track.cfgType = c.t; track.cfg = new Uint8Array(moov.buffer.slice(moov.byteOffset + c.s, moov.byteOffset + c.e)); }
      try {
        const list = (box, n, f) => { const r = []; if (!box) return r; const c = u32(box.s + 4); for (let i = 0; i < c; i++) r.push(f(box.s + 8 + i * n)); return r; };
        track.stts = list(st.stts, 8, o => [u32(o), u32(o + 4)]);
        track.stss = st.stss ? list(st.stss, 4, o => u32(o)) : null;
        track.stsc = list(st.stsc, 12, o => [u32(o), u32(o + 4)]);
        track.chunks = st.stco ? list(st.stco, 4, o => u32(o)) : st.co64 ? list(st.co64, 8, o => Number(moov.getBigUint64(o))) : [];
        if (st.stsz) { const fixed = u32(st.stsz.s + 4), n = u32(st.stsz.s + 8); track.n = n; track.sizes = fixed ? null : list({ s: st.stsz.s + 4 }, 4, o => u32(o)); track.fixed = fixed; }
      } catch (e) { track.tablesErr = String(e.message || e); }
      out.track = track;
    }
  } catch (e) { out.why = 'container parse error: ' + (e.message || e); }
  return out;
}
export const probeMp4 = file => parseMp4(blobReader(file));
const hex = (n, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
// RFC 6381 codec string for WebCodecs, from the avcC / hvcC record
export function codecString(tk) {
  if (!tk || !tk.cfg) return '';
  const c = tk.cfg;
  if (tk.cfgType === 'avcC') return 'avc1.' + hex(c[1]) + hex(c[2]) + hex(c[3]);
  if (tk.cfgType === 'hvcC') {
    const space = c[1] >> 6, tier = (c[1] >> 5) & 1, prof = c[1] & 31;
    let compat = ((c[2] << 24) | (c[3] << 16) | (c[4] << 8) | c[5]) >>> 0, rev = 0;
    for (let i = 0; i < 32; i++) { rev = (rev << 1) | (compat & 1); compat >>>= 1; }
    const cons = Array.from(c.slice(6, 12)); while (cons.length && !cons[cons.length - 1]) cons.pop();
    const fam = /^hev1$/.test(tk.codec) ? 'hev1' : 'hvc1';
    return `${fam}.${['', 'A', 'B', 'C'][space]}${prof}.${(rev >>> 0).toString(16).toUpperCase()}.${tier ? 'H' : 'L'}${c[12]}${cons.map(x => '.' + x.toString(16).toUpperCase()).join('')}`;
  }
  return '';
}
// locate sample #k (0-based): byte offset + size + decode time (s)
function sampleAt(tk, k) {
  let size = tk.fixed || (tk.sizes && tk.sizes[k]); if (!size) return null;
  let t = 0, left = k; for (const [cnt, d] of tk.stts) { const m = Math.min(cnt, left); t += m * d; left -= m; if (!left) break; }
  let s = 0; // sample index at the start of the current chunk
  for (let e = 0; e < tk.stsc.length; e++) {
    const [first, spc] = tk.stsc[e], last = e + 1 < tk.stsc.length ? tk.stsc[e + 1][0] - 1 : tk.chunks.length;
    const span = (last - first + 1) * spc;
    if (k < s + span) {
      const ci = first - 1 + Math.floor((k - s) / spc), fs = s + Math.floor((k - s) / spc) * spc;
      let off = tk.chunks[ci]; if (off == null) return null;
      for (let j = fs; j < k; j++) off += tk.fixed || tk.sizes[j];
      return { off, size, t: tk.ts ? t / tk.ts : 0 };
    }
    s += span;
  }
  return null;
}
function sampleForTime(tk, sec) {
  const target = sec * (tk.ts || 1); let t = 0, k = 0;
  for (const [cnt, d] of tk.stts) { if (t + cnt * d > target) { k += Math.floor((target - t) / Math.max(1, d)); return Math.min(k, tk.n - 1); } t += cnt * d; k += cnt; }
  return Math.max(0, tk.n - 1);
}
// rotate a (small) canvas by the track's display rotation
function rotated(c, rot) {
  if (!rot) return c;
  const r = document.createElement('canvas'), q = rot === 90 || rot === 270; r.width = q ? c.height : c.width; r.height = q ? c.width : c.height;
  const x = r.getContext('2d'); x.translate(r.width / 2, r.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(c, -c.width / 2, -c.height / 2);
  c.width = c.height = 0; return r;
}
export const hasWebCodecs = () => typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
// Element-free preview: decode up to 3 keyframes (≈10/40/70 % in) with WebCodecs and keep the best-looking one.
export async function keyframeThumb(rd, meta, opts = {}) {
  const tk = meta.track;
  if (!tk) throw new Error(meta.why || 'no video track in container');
  if (!hasWebCodecs()) throw new Error('WebCodecs VideoDecoder not available in this browser');
  if (!tk.cfg) throw new Error(`no decoder config (avcC/hvcC) for codec ${tk.codec || '?'}`);
  if (!tk.n || !tk.chunks || !tk.chunks.length || !tk.stts || !tk.stsc) throw new Error('sample tables missing' + (tk.tablesErr ? ': ' + tk.tablesErr : ''));
  const codec = codecString(tk), cfg = { codec, codedWidth: tk.cw, codedHeight: tk.ch, description: tk.cfg };
  const sup = await VideoDecoder.isConfigSupported(cfg).catch(e => ({ supported: false, e }));
  if (!sup.supported) throw new Error(`decoder doesn’t support ${codec}${sup.e ? ' (' + (sup.e.message || sup.e) + ')' : ''}`);
  const dur = meta.dur || 0, sync = tk.stss ? tk.stss.map(x => x - 1) : null;
  const want = opts.at != null ? [opts.at] : dur > 1.5 ? [.1, .4, .7].map(f => f * dur) : [0];
  const picks = [], seen = new Set();
  for (const sec of want) {
    let k = sampleForTime(tk, sec);
    if (sync) { let best = sync[0]; for (const s of sync) { if (s <= k) best = s; else break; } k = best; }
    if (seen.has(k)) continue; seen.add(k); const p = sampleAt(tk, k); if (p) picks.push(p);
  }
  if (!picks.length) throw new Error('could not locate a keyframe');
  const frames = []; let derr = null;
  const dec = new VideoDecoder({ output: f => frames.push(f), error: e => { derr = e; } });
  try {
    dec.configure(cfg);
    for (const p of picks) dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: Math.round(p.t * 1e6), data: await rd.read(p.off, p.size) }));
    await timed(dec.flush(), isIOS ? 20000 : 10000, 'keyframe decode');
  } catch (e) { derr = derr || e; } finally { try { dec.close(); } catch (e) { } }
  if (!frames.length) { throw new Error('keyframe decode failed: ' + (derr ? (derr.message || derr.name || derr) : 'no frame produced')); }
  try {
    let best = null;
    for (const f of frames) {
      const fw = f.displayWidth || f.codedWidth, fh = f.displayHeight || f.codedHeight;
      const c = rotated(drawScaled(f, fw, fh), tk.rot); const st = sample(c); if (isBlank(st)) { c.width = c.height = 0; continue; }
      const s = document.createElement('canvas'); s.width = 160; s.height = Math.max(1, Math.round(160 * c.height / c.width));
      const sx = s.getContext('2d', { willReadFrequently: true }); sx.drawImage(c, 0, 0, s.width, s.height);
      const score = picks.length > 1 ? scoreFrame(sx, s.width, s.height).score : 0;
      if (!best || score > best.score) { if (best) best.c.width = best.c.height = 0; best = { c, score, t: f.timestamp / 1e6 }; } else c.width = c.height = 0;
    }
    if (!best) throw new Error('decoded keyframes were blank');
    return { blob: await toJpeg(best.c), t: +best.t.toFixed(3) };
  } finally { frames.forEach(f => f.close()); }
}
const HEVC = c => /^(hvc1|hev1|dvh1|dvhe)$/.test(c || '');
/* Safari (unlike in-app WKWebViews, which usually allow all playback) applies its Auto-Play setting and Low Power Mode
   to muted videos too: play() is refused and frames are never decoded. WebKit lifts those restrictions per element once
   it is played from a user gesture, so we "bless" one hidden element on the first tap and reuse it for previews. */
const VSTYLE = 'position:fixed;left:0;top:0;width:160px;height:90px;opacity:0.01;pointer-events:none;z-index:2147483646';
function makeVideo() {
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', '');
  v.preload = 'auto'; v.style.cssText = VSTYLE; document.body.appendChild(v); return v;
}
let blessed = null, blessedBusy = false;
export const isBlessed = () => !!blessed;
export function blessMedia(ev) {             // call synchronously inside a (trusted) user-gesture handler
  if (ev && ev.isTrusted === false) return;
  if (!blessed) blessed = makeVideo(); if (blessedBusy) return;      // re-bless on every tap while idle: cheap, and survives a missed first gesture
  const v = blessed; try { const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } try { v.pause(); } catch (e) { }
  v.style.display = 'none';      // idle: no permanent layer (the unlock is kept per element, not per render)
}
export function takeVideo() { if (blessed && !blessedBusy) { blessedBusy = true; blessed.style.display = ''; return blessed; } return makeVideo(); }
export function releaseVideo(v) {
  try { v.pause(); } catch (e) { } v.removeAttribute('src'); try { v.load(); } catch (e) { }
  if (v === blessed) { blessedBusy = false; v.style.display = 'none'; } else v.remove();
}
export async function frameReady(v, ms = 700) {
  if (v.requestVideoFrameCallback) await timed(new Promise(r => v.requestVideoFrameCallback(() => r())), ms, 'frame').catch(() => { });
  else await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}
const short = e => String((e && (e.message || e.name)) || e).slice(0, 160);
// Preview for a video. `file` is a File/Blob (may be null when only a ranged reader is available for a huge
// stored video). Tries a hidden <video> element first (best-frame pick), then the WebCodecs keyframe path.
// Always returns { blob|null, dur, w, h, codec, diag: { mime, size, codec, cs, steps[] } }.
export async function videoThumb(file, mime, opts = {}) {
  const rd = opts.reader || blobReader(file), name = (file && file.name) || opts.name || '';
  const mp4ish = /mp4|quicktime|m4v|3gpp/.test(mime || '') || /\.(mp4|m4v|mov|3gp)$/i.test(name);
  const meta = mp4ish ? await parseMp4(rd) : {};
  const diag = { mime: mime || '', size: rd.size, codec: meta.codec || '', cs: codecString(meta.track), steps: [] };
  if (meta.why) diag.steps.push('container: ' + meta.why);
  const base = { dur: meta.dur || 0, w: meta.w || 16, h: meta.h || 9, codec: meta.codec || '' };
  let r = { ...base, blob: null };
  if (file && !opts.forceKeyframe) {
    // media pipelines sometimes refuse the first load(s): retry with a fresh element (and an mp4 hint for .mov)
    const t0 = performance.now(), window = isIOS ? 30000 : 12000;
    for (let n = 0; n < 3 && !r.blob && performance.now() - t0 < window; n++) {
      const alt = n === 1 && /quicktime/.test(file.type) ? new File([file], name, { type: 'video/mp4' }) : file;
      if (n) await sleep(250 * n);
      const r2 = await videoThumbOnce(alt, base, opts);
      diag.steps.push(`element${n ? ' retry ' + n : ''}${alt !== file ? ' (as video/mp4)' : ''}: ${r2.blob ? 'ok' : r2.err || 'no frame'}`);
      if (r2.blob || !r.w || r.w === 16) r = { ...r, ...r2 };
      if (r2.fatal) break;                       // e.g. play() refused (Low Power Mode): retrying the element won't help
    }
  } else if (!file) diag.steps.push('element: skipped (file too large to load whole on this device)');
  if (!r.blob && mp4ish) {
    try { const k = await keyframeThumb(rd, meta, opts); r = { ...r, blob: k.blob, t: k.t, via: 'keyframe' }; diag.steps.push('keyframe (WebCodecs): ok'); }
    catch (e) { diag.steps.push('keyframe (WebCodecs): ' + short(e)); }
  } else if (r.blob && !r.via) r.via = 'element';
  if (!mp4ish && !r.blob) diag.steps.push('keyframe: not tried (only MP4/MOV containers)');
  r.diag = diag; r.err = r.blob ? null : diag.steps.join('; ');
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
  // in the DOM (but invisible, never display:none): some WebKit builds never decode frames for detached/hidden videos
  const url = URL.createObjectURL(file), v = takeVideo();
  try {
    v.src = url; v.load();
    await once(v, 'loadedmetadata', isIOS ? 20000 : 10000).catch(e => { throw new Error(/timed out/.test(e.message) ? `loadedmetadata timed out (readyState ${v.readyState}, networkState ${v.networkState})` : e.message); });
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : base.dur;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return { ...base, dur, blob: null, err: 'no video dimensions (audio-only, or codec not decodable)' };
    if (v.readyState < 2) await once(v, 'loadeddata', isIOS ? 12000 : 6000).catch(() => { });
    const seek = async (t, ms = 4000) => { if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return true; v.currentTime = t; const okk = await once(v, 'seeked', ms).then(() => true, () => false); await frameReady(v, 400); return okk; };
    // small reusable canvas for scoring (memory-safe on iOS)
    const sw = 160, sh = Math.max(1, Math.round(160 * h / w)), sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
    const sx = sc.getContext('2d', { willReadFrequently: true });
    const painted = () => { try { sx.clearRect(0, 0, sw, sh); sx.drawImage(v, 0, 0, sw, sh); return !isBlank(sample(sc)); } catch (e) { return false; } };
    let t0 = Math.min(0.5, dur > 0 ? dur / 10 : 0); await seek(t0);
    let firstOk = painted();
    let playErr = null;
    if (!firstOk) {                               // iOS: frames aren't painted until the video has actually played
      try { await timed(v.play(), 4000, 'play'); await frameReady(v, 1500); await sleep(120); } catch (e) { playErr = e; }
      v.pause(); for (let k = 0; k < 3 && !(firstOk = painted()); k++) { await frameReady(v, 500); await sleep(150); }
      if (firstOk) t0 = v.currentTime;
      else if (playErr && playErr.name === 'NotAllowedError') return { ...base, dur, w, h, blob: null, fatal: true, err: 'play() refused (NotAllowedError: autoplay blocked, e.g. Low Power Mode) and no frame was painted' };
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
    if (best.score === -1e9 && fixed == null) return { ...base, dur, w, h, blob: null, err: `only blank/black frames (readyState ${v.readyState}${playErr ? ', play: ' + (playErr.name || playErr.message) : ''})` };
    await seek(best.t);
    let c = drawScaled(v, w, h);
    for (let k = 0; k < 3 && isBlank(sample(c)); k++) { c.width = c.height = 0; if (k) await seek(t0); await frameReady(v, 600); await sleep(100 * (k + 1)); c = drawScaled(v, w, h); if (k) best.t = t0; }
    if (isBlank(sample(c))) return { ...base, dur, w, h, blob: null, err: 'canvas drawImage stayed black after retries' };
    return { ...base, dur, w, h, t: +best.t.toFixed(3), blob: await toJpeg(c) };
  } catch (e) {
    return { ...base, blob: null, err: String(e.message || e) + (v.error ? ` (MediaError ${v.error.code}${v.error.message ? ': ' + v.error.message : ''})` : '') };
  } finally { releaseVideo(v); URL.revokeObjectURL(url); }
}
/* thumbnail from an element that is already showing the right frame (player "Set as preview") */
export async function frameFromVideo(v) { const c = drawScaled(v, v.videoWidth, v.videoHeight); if (isBlank(sample(c))) throw new Error('frame not available'); return toJpeg(c); }
export const isHevc = HEVC;
