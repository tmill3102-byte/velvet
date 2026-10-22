// Velvet v1.7 text in photos: Tesseract OCR (English) on this device. Engine and language data come from
// Velvet's own site (addons/ocr); blob workers and CDNs are not used.
let worker = null, loading = null;
const base = new URL('../addons/ocr/', import.meta.url).href;
async function get() {
  if (worker) return worker;
  if (!loading) loading = (async () => {
    const T = await import('../addons/ocr/tesseract.esm.min.js'), Tess = T.default || T;
    worker = await Tess.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', workerBlobURL: false, cacheMethod: 'none', gzip: true, logger: () => { } });
    return worker;
  })().finally(() => { loading = null; });
  return loading;
}
export async function shutdown() { const w = worker; worker = null; if (w) await w.terminate().catch(() => { }); }
// downscale big photos (OCR is slow and memory-hungry on 12 MP+ images)
async function prep(blob) {
  const bmp = await createImageBitmap(blob); const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  return c.convertToBlob ? c.convertToBlob({ type: 'image/png' }) : new Promise(r => c.toBlob(r, 'image/png'));
}
// returns cleaned text ('' if nothing readable)
export async function read(blob) {
  const w = await get(); const img = await prep(blob);
  const { data } = await w.recognize(img, {}, { text: true, blocks: true });
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const words = (l.words || []).filter(x => x.confidence >= 55 && /[\p{L}\p{N}]/u.test(x.text));
    if (!words.length) continue; const t = words.map(x => x.text).join(' ').trim();
    const alnum = (t.match(/[\p{L}\p{N}]/gu) || []).length; if (alnum >= 3 && alnum / t.length > 0.5) lines.push(t);
  }
  if (!data.blocks) { (data.text || '').split('\n').map(s => s.trim()).filter(s => (s.match(/[\p{L}\p{N}]/gu) || []).length >= 3).forEach(s => lines.push(s)); }
  return lines.join('\n').slice(0, 4000);
}
