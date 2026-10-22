// Velvet v1.8 captions worker: Florence-2-base (MIT, 4-bit) writes a short description of a photo or video frame.
// Model and runtime come from Velvet's own site (addons/caption); nothing is ever sent anywhere.
import { env, Florence2ForConditionalGeneration, AutoProcessor, RawImage } from './vendor/transformers/transformers.min.js';
const ID = 'caption/Florence-2-base-ft', TASK = '<CAPTION>';
const base = new URL('../', import.meta.url).href;
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = new URL('../addons/', import.meta.url).pathname;
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm' };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
env.backends.onnx.wasm.proxy = false;
const DTYPE = { embed_tokens: 'q8', vision_encoder: 'q4', encoder_model: 'q4', decoder_model_merged: 'q4' };
let model = null, proc = null, device = 'wasm', prompt = null;
async function gpuOK() { try { if (self.navigator.gpu) { const a = await navigator.gpu.requestAdapter(); return !!a; } } catch (e) { } return false; }
async function load(pref) {
  if (model) return;
  proc = proc || await AutoProcessor.from_pretrained(ID, { local_files_only: true }); prompt = prompt || proc.construct_prompts(TASK);
  if (pref !== 'wasm' && await gpuOK()) { try { model = await Florence2ForConditionalGeneration.from_pretrained(ID, { dtype: DTYPE, device: 'webgpu', local_files_only: true }); device = 'webgpu'; return; } catch (e) { console.warn('webgpu unavailable for captions', e); } }
  model = await Florence2ForConditionalGeneration.from_pretrained(ID, { dtype: DTYPE, device: 'wasm', local_files_only: true }); device = 'wasm';
}
async function describe(m) {
  const c = new OffscreenCanvas(m.bmp.width, m.bmp.height), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(m.bmp, 0, 0); m.bmp.close && m.bmp.close();
  const img = new RawImage(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 4).rgb();
  const inputs = await proc(img, prompt);
  let ids;
  try { ids = await model.generate({ ...inputs, max_new_tokens: 40, num_beams: 1, do_sample: false }); }
  catch (e) { if (device !== 'webgpu') throw e; console.warn('webgpu caption failed, using wasm', e); try { await model.dispose(); } catch (_) { } model = null; await load('wasm'); ids = await model.generate({ ...inputs, max_new_tokens: 40, num_beams: 1, do_sample: false }); }
  const txt = proc.batch_decode(ids, { skip_special_tokens: false })[0];
  return String(proc.post_process_generation(txt, TASK, img.size)[TASK] || '').trim();
}
onmessage = async ({ data: m }) => {
  try {
    await load(m.pref);
    if (m.type === 'load') { postMessage({ id: m.id, ok: true, device }); return; }
    postMessage({ id: m.id, ok: true, text: await describe(m), device });
  } catch (e) { postMessage({ id: m.id, ok: false, error: String(e && e.message || e) }); }
};
