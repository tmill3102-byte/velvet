// Velvet on-device AI worker: runs MobileCLIP-S0 (quantized ONNX) fully offline.
// Model + runtime are served from this same origin; nothing is ever sent anywhere.
import { env, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, AutoModel, Tensor } from './vendor/transformers/transformers.min.js';
const MODEL = 'Xenova/mobileclip_s0';
const base = new URL('../', import.meta.url).href;            // app root (works under /velvet/ on Pages)
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = new URL('../models/', import.meta.url).pathname; // path, not URL (needed for local file detection)
env.useBrowserCache = false;                                  // the app service worker caches these same-origin files
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm' };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
env.backends.onnx.wasm.proxy = false;
let tok, proc, textM, visM, device = 'wasm', loading = null;
async function pickDevice(pref) {
  if (pref === 'wasm') return 'wasm';
  try { if (self.navigator.gpu) { const a = await navigator.gpu.requestAdapter(); if (a) return 'webgpu'; } } catch (e) { }
  return 'wasm';
}
async function load(pref, wantText = true, wantVision = true) {
  if (loading) await loading;
  loading = (async () => {
    if (!device || (!visM && !textM)) device = await pickDevice(pref);
    const opt = (d, dtype) => ({ dtype, device: d, local_files_only: true }); // vision fp16 (q8 vision export is broken), text q8
    const tryLoad = async (fn) => { try { return await fn(device); } catch (e) { if (device !== 'wasm') { device = 'wasm'; return await fn('wasm'); } throw e; } };
    if (wantVision && !visM) { proc = proc || await AutoProcessor.from_pretrained(MODEL, { local_files_only: true }); visM = await tryLoad(d => CLIPVisionModelWithProjection.from_pretrained(MODEL, opt(d, 'fp16'))); }
    if (wantText && !textM) { tok = tok || await AutoTokenizer.from_pretrained(MODEL, { local_files_only: true }); textM = await tryLoad(d => CLIPTextModelWithProjection.from_pretrained(MODEL, opt(d, 'q8'))); }
  })();
  try { await loading; } finally { loading = null; }
}
const norm = a => { let s = 0; for (const x of a) s += x * x; s = Math.sqrt(s) || 1; const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] / s; return o; };
async function embedImage(blob) {
  const img = await RawImage.fromBlob(blob);
  const inputs = await proc(img);
  const { image_embeds } = await visM(inputs);
  return norm(image_embeds.data);
}
async function embedTexts(texts) {
  const inputs = tok(texts, { padding: 'max_length', truncation: true });
  const { text_embeds } = await textM(inputs);
  const d = text_embeds.dims[1], out = [];
  for (let i = 0; i < texts.length; i++) out.push(norm(text_embeds.data.slice(i * d, (i + 1) * d)));
  return out;
}
/* ---------- People (v1.4): YuNet face detector (MIT) + SFace face embedder (Apache-2.0), both from OpenCV Zoo ---------- */
let fdet = null, frec = null, floading = null;
async function loadFaces() {
  if (fdet && frec) return; if (floading) return floading;
  floading = (async () => {
    const o = { local_files_only: true, dtype: 'fp32', device: 'wasm' };     // tiny models: WASM is fast and works everywhere
    fdet = fdet || await AutoModel.from_pretrained('opencv/face_detection_yunet', o);
    frec = frec || await AutoModel.from_pretrained('opencv/face_recognition_sface', o);
  })();
  try { await floading; } finally { floading = null; }
}
const FS = 640;
// input: 1x3x640x640 BGR float (0..255). Output: faces in 640-space after NMS.
async function detectFaces(data, thr) {
  const o = await fdet({ input: new Tensor('float32', data, [1, 3, FS, FS]) }); const cand = [];
  for (const s of [8, 16, 32]) {
    const cols = FS / s, cls = o['cls_' + s].data, obj = o['obj_' + s].data, bb = o['bbox_' + s].data, kp = o['kps_' + s].data, n = cls.length;
    for (let i = 0; i < n; i++) {
      const sc = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i]))); if (sc < thr) continue;
      const r = Math.floor(i / cols), c = i % cols, cx = (c + bb[i * 4]) * s, cy = (r + bb[i * 4 + 1]) * s, w = Math.exp(bb[i * 4 + 2]) * s, h = Math.exp(bb[i * 4 + 3]) * s;
      const kps = []; for (let j = 0; j < 5; j++) kps.push((kp[i * 10 + 2 * j] + c) * s, (kp[i * 10 + 2 * j + 1] + r) * s);
      cand.push({ score: sc, box: [cx - w / 2, cy - h / 2, w, h], kps });
    }
  }
  cand.sort((a, b) => b.score - a.score); const keep = [];
  const iou = (a, b) => { const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])), I = ix * iy; return I / (a[2] * a[3] + b[2] * b[3] - I); };
  for (const f of cand) if (keep.every(g => iou(f.box, g.box) < .3)) { keep.push(f); if (keep.length >= 40) break; }
  return keep;
}
// input: n aligned 112x112 RGB crops (float 0..255, planar). Output: n L2-normalised 128-d vectors.
async function embedFaces(data, n) {
  const out = [], sz = 3 * 112 * 112;
  for (let k = 0; k < n; k++) { const r = await frec({ data: new Tensor('float32', data.subarray(k * sz, (k + 1) * sz), [1, 3, 112, 112]) }); out.push(norm(r.fc1.data)); }
  return out;
}
self.onmessage = async e => {
  const { id, type } = e.data;
  try {
    if (type === 'init') { await load(e.data.device, e.data.text !== false, e.data.vision !== false); postMessage({ id, ok: true, device }); }
    else if (type === 'image') { await load(e.data.device, false, true); const t0 = performance.now(); const v = await embedImage(e.data.blob); postMessage({ id, ok: true, vec: v, ms: performance.now() - t0, device }, [v.buffer]); }
    else if (type === 'text') { await load(e.data.device, true, false); const vs = await embedTexts(e.data.texts); postMessage({ id, ok: true, vecs: vs }, vs.map(v => v.buffer)); }
    else if (type === 'finit') { await loadFaces(); postMessage({ id, ok: true }); }
    else if (type === 'fdet') { await loadFaces(); const t0 = performance.now(); const faces = await detectFaces(e.data.data, e.data.thr || .75); postMessage({ id, ok: true, faces, ms: performance.now() - t0 }); }
    else if (type === 'femb') { await loadFaces(); const vs = await embedFaces(e.data.data, e.data.n); postMessage({ id, ok: true, vecs: vs }, vs.map(v => v.buffer)); }
    else if (type === 'unload') { for (const m of [visM, textM, fdet, frec]) try { await m?.dispose(); } catch (x) { } visM = textM = fdet = frec = null; postMessage({ id, ok: true }); }
  } catch (err) { postMessage({ id, ok: false, error: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 900) }); }
};
