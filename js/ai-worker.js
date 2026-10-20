// Velvet on-device AI worker: runs MobileCLIP-S0 (quantized ONNX) fully offline.
// Model + runtime are served from this same origin; nothing is ever sent anywhere.
import { env, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } from './vendor/transformers/transformers.min.js';
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
self.onmessage = async e => {
  const { id, type } = e.data;
  try {
    if (type === 'init') { await load(e.data.device, e.data.text !== false, e.data.vision !== false); postMessage({ id, ok: true, device }); }
    else if (type === 'image') { await load(e.data.device, false, true); const t0 = performance.now(); const v = await embedImage(e.data.blob); postMessage({ id, ok: true, vec: v, ms: performance.now() - t0, device }, [v.buffer]); }
    else if (type === 'text') { await load(e.data.device, true, false); const vs = await embedTexts(e.data.texts); postMessage({ id, ok: true, vecs: vs }, vs.map(v => v.buffer)); }
    else if (type === 'unload') { for (const m of [visM, textM]) try { await m?.dispose(); } catch (x) { } visM = textM = null; postMessage({ id, ok: true }); }
  } catch (err) { postMessage({ id, ok: false, error: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 900) }); }
};
