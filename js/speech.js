// Velvet v1.7 speech search: turns a video's audio into timestamped text on this device (Whisper tiny).
import * as VT from './vtools.js';
let w = null, seq = 0; const pend = new Map();
function worker() {
  if (w) return w;
  w = new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data: m }) => { const p = pend.get(m.id); if (!p) return; pend.delete(m.id); m.ok ? p.res(m) : p.rej(new Error(m.error)); };
  w.onerror = e => { for (const p of pend.values()) p.rej(new Error(e.message || 'speech engine stopped')); pend.clear(); w = null; };
  return w;
}
const call = (msg, tr) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); worker().postMessage({ ...msg, id }, tr || []); });
export function shutdown() { if (w) w.terminate(); w = null; for (const p of pend.values()) p.rej(new Error('stopped')); pend.clear(); }
export const load = () => call({ type: 'load' });
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const MAX_SEC = isIOS ? 20 * 60 : 90 * 60;        // transcribe at most this much of a video
export const MAX_DECODE = isIOS ? 250 * 1024 ** 2 : 1500 * 1024 ** 2;
// 16 kHz mono audio: the browser's own decoder first, then Velvet's video engine (if downloaded) for formats it can't read
export async function audioOf(blob, name, canFFmpeg) {
  if (blob.size <= MAX_DECODE) {
    try {
      const AC = self.OfflineAudioContext || self.webkitOfflineAudioContext, ctx = new AC(1, 16000, 16000);
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const n = Math.min(buf.length, MAX_SEC * 16000), out = new Float32Array(n);
      for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
      return out;
    } catch (e) { if (!canFFmpeg) throw new Error('this video’s sound can’t be read here'); }
  } else if (!canFFmpeg) throw new Error('too large to read the sound here');
  return VT.audioPCM(blob, name, MAX_SEC);
}
const rms = (a, s, e) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / Math.max(1, e - s)); };
// Whisper tends to invent text on silence, hums and tones: drop empty/bracketed lines and runaway repetition
const junk = t => {
  if (!t || /^[\s.,!?♪-]*$/.test(t) || /^\s*[\[(].*[\])]\s*$/.test(t)) return true;
  if (/(.)\1{5,}/u.test(t.replace(/[\s.!?]/g, ''))) return true;                         // "Mmmmmmmm", "!!!!!!!"
  const w = t.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []; if (!w.length) return true;
  if (w.length >= 6 && new Set(w).size / w.length < 0.3) return true;                     // "the the the the …"
  const letters = t.replace(/[^\p{L}]/gu, ''); return letters.length >= 12 && new Set(letters.toLowerCase()).size < 4;
};
// steady sounds (test tones, hum, fans) have almost constant loudness; speech rises and falls between syllables
function steady(a, s, e) {
  const F = 320, v = []; for (let i = s; i + F <= e; i += F) { let x = 0; for (let j = i; j < i + F; j++) x += a[j] * a[j]; v.push(Math.sqrt(x / F)); }
  const loud = v.filter(x => x > 0.004); if (loud.length < 10) return false;
  const m = loud.reduce((p, x) => p + x, 0) / loud.length, sd = Math.sqrt(loud.reduce((p, x) => p + (x - m) ** 2, 0) / loud.length);
  return sd / m < 0.18;
}
// Transcribe in 30 s windows so indexing can pause between them. Silent windows are skipped (Whisper invents words on silence).
export async function transcribe(pcm, { onProgress, shouldPause, shouldStop } = {}) {
  const W = 30 * 16000, segs = []; let lastText = '';
  for (let s = 0; s < pcm.length; s += W) {
    if (shouldStop && shouldStop()) throw new Error('stopped');
    if (shouldPause) await shouldPause();
    const e = Math.min(pcm.length, s + W); if (e - s < 16000 * 0.6) break;
    if (rms(pcm, s, e) < 0.004 || steady(pcm, s, e)) { onProgress && onProgress(e / pcm.length); continue; }
    const part = pcm.slice(s, e), off = s / 16000;
    const r = await call({ type: 'asr', pcm: part }, [part.buffer]);
    for (const c of r.chunks.length ? r.chunks : [{ t: [0, (e - s) / 16000], text: r.text }]) {
      const text = (c.text || '').trim(); if (junk(text) || text === lastText) continue; lastText = text;
      const t0 = Math.round(((c.t && c.t[0]) || 0) * 10) / 10 + off, t1 = Math.round(((c.t && c.t[1]) || (e - s) / 16000) * 10) / 10 + off;
      segs.push([Math.round(t0 * 10) / 10, Math.round(t1 * 10) / 10, text.slice(0, 400)]);
    }
    onProgress && onProgress(e / pcm.length);
  }
  return segs;
}
