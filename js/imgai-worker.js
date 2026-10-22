// Velvet v1.8 image tools worker: photo upscaler (Real-ESRGAN, BSD-3) and background remover (IS-Net, Apache-2.0).
// Models and runtime come from Velvet's own site (addons/upscale, addons/bgremove); nothing is ever sent anywhere.
// Uses WebGPU when the device has it, otherwise WebAssembly.
import { env, AutoModel, Tensor } from './vendor/transformers/transformers.min.js';
const base = new URL('../', import.meta.url).href;
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = new URL('../addons/', import.meta.url).pathname;
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm' };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
env.backends.onnx.wasm.proxy = false;
const models = {}, devs = {};
async function gpuOK() { try { if (self.navigator.gpu) { const a = await navigator.gpu.requestAdapter(); return !!a; } } catch (e) { } return false; }
async function load(key, pref) {
  if (models[key]) return models[key];
  const id = key === 'upscale' ? 'upscale/realesr-general-x4v3' : 'bgremove/isnet-general-use';
  const tryDev = async d => { models[key] = await AutoModel.from_pretrained(id, { dtype: 'fp32', device: d, local_files_only: true }); devs[key] = d; return models[key]; };
  if (pref !== 'wasm' && await gpuOK()) { try { return await tryDev('webgpu'); } catch (e) { console.warn('webgpu unavailable for ' + key, e); } }
  return tryDev('wasm');
}
async function run(key, feeds, pref) {
  const m = await load(key, pref);
  try { return await m(feeds); }
  catch (e) {                                   // a GPU that can't run the model: fall back to WebAssembly once
    if (devs[key] !== 'webgpu') throw e; console.warn('webgpu run failed, using wasm', e);
    try { await m.dispose(); } catch (_) { } models[key] = null; await load(key, 'wasm'); return models[key](feeds);
  }
}
function pixels(bmp, w, h) {
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, w, h); return x.getImageData(0, 0, w, h).data;
}
// Tiled 4x upscaling. Every tile has the same size (edges are padded by repeating border pixels), so memory stays
// bounded and WebGPU can reuse its compiled shaders. For 2x, each 2x2 block of the 4x result is averaged.
async function upscale(m) {
  const { bmp, scale, tile: T, pad: P } = m, w = bmp.width, h = bmp.height, src = pixels(bmp, w, h); bmp.close && bmp.close();
  const S = T + 2 * P, U = 4, k = U / scale, ow = w * scale, oh = h * scale, out = new Uint8ClampedArray(ow * oh * 4);
  let alpha = false; for (let i = 3; i < src.length; i += 4) if (src[i] < 255) { alpha = true; break; }
  const nx = Math.ceil(w / T), ny = Math.ceil(h / T), total = nx * ny, inp = new Float32Array(3 * S * S), plane = S * S;
  let done = 0; const t0 = performance.now();
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
    const x0 = tx * T, y0 = ty * T, tw = Math.min(T, w - x0), th = Math.min(T, h - y0);
    for (let yy = 0; yy < S; yy++) { const sy = Math.min(h - 1, Math.max(0, y0 - P + yy)); for (let xx = 0; xx < S; xx++) {
      const sx = Math.min(w - 1, Math.max(0, x0 - P + xx)), si = (sy * w + sx) * 4, di = yy * S + xx;
      inp[di] = src[si] / 255; inp[plane + di] = src[si + 1] / 255; inp[2 * plane + di] = src[si + 2] / 255; } }
    const r = await run('upscale', { input: new Tensor('float32', inp, [1, 3, S, S]) }, m.pref);
    const o = r.output.data, OS = S * U, op = OS * OS;
    for (let yy = 0; yy < th * scale; yy++) for (let xx = 0; xx < tw * scale; xx++) {
      let R = 0, G = 0, B = 0; const bx = P * U + xx * k;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const oi = (P * U + yy * k + dy) * OS + bx + dx; R += o[oi]; G += o[op + oi]; B += o[2 * op + oi]; }
      const n = k * k, di = ((y0 * scale + yy) * ow + x0 * scale + xx) * 4;
      out[di] = R / n * 255 + .5; out[di + 1] = G / n * 255 + .5; out[di + 2] = B / n * 255 + .5;
      out[di + 3] = alpha ? src[((y0 + ((yy / scale) | 0)) * w + x0 + ((xx / scale) | 0)) * 4 + 3] : 255;
    }
    done++; postMessage({ id: m.id, progress: done / total, device: devs.upscale, eta: (performance.now() - t0) / done * (total - done) / 1000 });
  }
  const c = new OffscreenCanvas(ow, oh); c.getContext('2d').putImageData(new ImageData(out, ow, oh), 0, 0);
  const type = alpha || m.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await c.convertToBlob(type === 'image/png' ? { type } : { type, quality: .92 });
  return { blob, w: ow, h: oh, device: devs.upscale };
}
// Background mask: IS-Net at 1024x1024, scaled back to 0..255 (like rembg does)
async function mask(m) {
  const N = 1024, src = pixels(m.bmp, N, N); m.bmp.close && m.bmp.close();
  const inp = new Float32Array(3 * N * N), pl = N * N;
  for (let i = 0; i < pl; i++) { inp[i] = src[i * 4] / 255 - .5; inp[pl + i] = src[i * 4 + 1] / 255 - .5; inp[2 * pl + i] = src[i * 4 + 2] / 255 - .5; }
  postMessage({ id: m.id, progress: .15, device: devs.bgremove });
  const r = await run('bgremove', { input_image: new Tensor('float32', inp, [1, 3, N, N]) }, m.pref), o = r.output_image.data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < pl; i++) { const v = o[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const a = new Uint8Array(pl), d = hi - lo || 1; for (let i = 0; i < pl; i++) a[i] = Math.round((o[i] - lo) / d * 255);
  return { mask: a, size: N, device: devs.bgremove };
}
onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') { await load(m.key, m.pref); postMessage({ id: m.id, ok: true, device: devs[m.key] }); return; }
    const r = m.type === 'upscale' ? await upscale(m) : await mask(m);
    postMessage({ id: m.id, ok: true, ...r }, r.mask ? [r.mask.buffer] : []);
  } catch (e) { postMessage({ id: m.id, ok: false, error: String(e && e.message || e) }); }
};
