// Velvet v1.8 photo tools: upscaler and background remover (both optional add-ons, run in imgai-worker.js).
// Results are always new encrypted copies; the original photo is never changed.
export const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Largest result, in pixels. iPhone/iPad Safari limits canvases to about 16.7 MP and closes tabs that use too much memory.
export let MAX_OUT = IOS ? 12e6 : 40e6;
export function setMaxOut(n) { MAX_OUT = n; }                  // tests only
export const TILE = IOS ? 96 : 160, PAD = 12;
let w = null, seq = 0, pref = null, isBusy = false; const pend = new Map();
function worker() {
  if (w) return w;
  w = new Worker(new URL('./imgai-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data: m }) => { const p = pend.get(m.id); if (!p) return; if (m.progress != null && m.ok === undefined) { p.onProgress && p.onProgress(m.progress, m); return; } pend.delete(m.id); m.ok ? p.res(m) : p.rej(new Error(m.error)); };
  w.onerror = e => { e.preventDefault && e.preventDefault(); const err = new Error(e.message || 'the image tools stopped (out of memory?)'); for (const p of pend.values()) p.rej(err); pend.clear(); try { w.terminate(); } catch (_) { } w = null; };
  return w;
}
function call(msg, transfer = [], onProgress) { return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej, onProgress }); worker().postMessage({ ...msg, id, pref }, transfer); }); }
export function setDevice(d) { pref = d; }                       // tests: 'wasm' forces WebAssembly
export const busy = () => isBusy;
export function cancel() { if (w) { try { w.terminate(); } catch (e) { } w = null; } for (const p of pend.values()) { const e = new Error('stopped'); e.cancelled = true; p.rej(e); } pend.clear(); isBusy = false; }
export const shutdown = cancel;
// which scales fit on this device for a w x h photo
export function scales(w0, h0) { return [2, 4].map(s => ({ s, ok: w0 * h0 * s * s <= MAX_OUT, w: w0 * s, h: h0 * s })); }
export async function upscale(blob, mime, scale, onProgress) {
  if (isBusy) throw new Error('already working on a photo'); isBusy = true;
  try {
    const bmp = await createImageBitmap(blob);
    if (bmp.width * bmp.height * scale * scale > MAX_OUT) { bmp.close(); throw new Error('this photo is too large to upscale ' + scale + '× on this device'); }
    return await call({ type: 'upscale', bmp, scale, tile: TILE, pad: PAD, mime }, [bmp], onProgress);
  } finally { isBusy = false; }
}
// IS-Net mask (1024x1024, 0..255)
export async function mask(blob, onProgress) {
  if (isBusy) throw new Error('already working on a photo'); isBusy = true;
  try { const bmp = await createImageBitmap(blob, { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' }).catch(() => createImageBitmap(blob)); return await call({ type: 'mask', bmp }, [bmp], onProgress); }
  finally { isBusy = false; }
}
const canvas = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
// soft blur that works everywhere (Safari has no canvas filters): shrink, then scale back up smoothly, twice
function blurred(img, cw, ch) {
  const f = Math.max(8, Math.round(Math.max(cw, ch) / 48)), sw = Math.max(1, Math.round(cw / f)), sh = Math.max(1, Math.round(ch / f));
  const s = canvas(sw, sh), sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(img, 0, 0, sw, sh);
  const s2 = canvas(Math.max(1, sw >> 1), Math.max(1, sh >> 1)); s2.getContext('2d').drawImage(s, 0, 0, s2.width, s2.height); sx.clearRect(0, 0, sw, sh); sx.drawImage(s2, 0, 0, sw, sh);
  const c = canvas(cw, ch), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(s, 0, 0, cw, ch); return c;
}
// Put the photo together with its mask. bg: 'none' (transparent PNG), 'color' (solid) or 'blur'.
// Returns a canvas (preview) or, with asBlob, the encoded image.
export async function compose(img, m, opt = {}) {
  let cw = img.naturalWidth || img.width, ch = img.naturalHeight || img.height;
  const f = Math.min(1, Math.sqrt(MAX_OUT / (cw * ch)), (opt.max || Infinity) / Math.max(cw, ch)); cw = Math.max(1, Math.round(cw * f)); ch = Math.max(1, Math.round(ch * f));
  const mc = canvas(m.size, m.size), mx = mc.getContext('2d'), id = mx.createImageData(m.size, m.size);
  for (let i = 0, n = m.mask.length; i < n; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; id.data[j + 3] = m.mask[i]; }
  mx.putImageData(id, 0, 0);
  const cut = canvas(cw, ch), cx = cut.getContext('2d'); cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, 0, 0, cw, ch); cx.globalCompositeOperation = 'destination-in'; cx.drawImage(mc, 0, 0, cw, ch); cx.globalCompositeOperation = 'source-over';
  let out = cut;
  if (opt.bg === 'color' || opt.bg === 'blur') {
    out = canvas(cw, ch); const ox = out.getContext('2d');
    if (opt.bg === 'color') { ox.fillStyle = opt.color || '#ffffff'; ox.fillRect(0, 0, cw, ch); }
    else {                                   // blur only the background, so the subject doesn't leave a glow around itself
      const bo = canvas(cw, ch), bx = bo.getContext('2d'); bx.drawImage(img, 0, 0, cw, ch); bx.globalCompositeOperation = 'destination-out'; bx.drawImage(mc, 0, 0, cw, ch);
      ox.drawImage(blurred(img, cw, ch), 0, 0); const bb = blurred(bo, cw, ch); for (let i = 0; i < 4; i++) ox.drawImage(bb, 0, 0);
    }
    ox.drawImage(cut, 0, 0);
  }
  if (!opt.asBlob) return out;
  const type = opt.bg === 'none' || !opt.bg ? 'image/png' : 'image/jpeg';
  const blob = await new Promise(r => out.toBlob(r, type, .92)); if (!blob) throw new Error('couldn’t encode the image');
  return { blob, w: cw, h: ch, type };
}
// share of the photo that's kept (0..1), used to warn when nothing stands out
export function coverage(m) { let s = 0; for (let i = 0; i < m.mask.length; i += 7) s += m.mask[i]; return s / (m.mask.length / 7) / 255; }
