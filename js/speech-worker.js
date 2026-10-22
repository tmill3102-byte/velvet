// Velvet v1.7 speech worker: Whisper tiny (multilingual, 8-bit) via Transformers.js, fully on this device.
// Model files come from Velvet's own site (addons/whisper); nothing is ever sent anywhere.
import { env, pipeline } from './vendor/transformers/transformers.min.js';
const MODEL = 'onnx-community/whisper-tiny';
const base = new URL('../', import.meta.url).href;
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = new URL('../addons/whisper/', import.meta.url).pathname;
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm' };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
env.backends.onnx.wasm.proxy = false;
let asr = null;
async function load() {
  if (!asr) asr = await pipeline('automatic-speech-recognition', MODEL, { dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, device: 'wasm', local_files_only: true });
  return asr;
}
onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') { await load(); postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'asr') {
      const p = await load();
      const out = await p(m.pcm, { return_timestamps: true, chunk_length_s: 30, task: 'transcribe' });
      postMessage({ id: m.id, ok: true, text: out.text, chunks: (out.chunks || []).map(c => ({ t: c.timestamp, text: c.text })) });
    }
  } catch (e) { postMessage({ id: m.id, ok: false, error: String(e && e.message || e) }); }
};
