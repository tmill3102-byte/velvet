// Velvet vision helpers: frame sampling, perceptual hash, colours, quality.
// Shared by thumbnails, on-device AI indexing, duplicates, and future chapters/highlights.
import { once, frameReady, drawScaled, sample, isBlank, toJpeg, scoreFrame, timed } from './thumbs.js';

/* Sample frames from a video file. fractions: positions 0..1 (or times: seconds).
   Reuses one <video> + one canvas; total time capped by budget (ms). Returns [{t, blob, score}]. */
export async function grabFrames(file, { fractions = [.2, .5, .8], times = null, max = 256, budget = 6000, score = false } = {}) {
  const url = URL.createObjectURL(file), v = document.createElement('video'), out = [];
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:90px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(v); const end = performance.now() + budget;
  try {
    v.src = url; v.load(); await once(v, 'loadedmetadata', 8000);
    if (v.readyState < 2) await once(v, 'loadeddata', 5000).catch(() => { });
    const dur = isFinite(v.duration) ? v.duration : 0; if (!v.videoWidth || !dur) return out;
    const ts = (times || fractions.map(f => f * dur)).map(t => Math.max(0, Math.min(dur - 0.05, t)));
    let unlocked = false;
    for (const t of ts) {
      if (performance.now() > end) break;
      v.currentTime = t; const ok = await once(v, 'seeked', Math.max(300, Math.min(2500, end - performance.now()))).then(() => true, () => false);
      if (!ok) continue; await frameReady(v, 400);
      let c = drawScaled(v, v.videoWidth, v.videoHeight, max);
      if (isBlank(sample(c)) && !unlocked) {            // iOS: needs one real play before frames paint
        unlocked = true; try { await timed(v.play(), 2500, 'play'); await frameReady(v, 1000); } catch (e) { } v.pause();
        v.currentTime = t; await once(v, 'seeked', 2000).catch(() => { }); await frameReady(v, 400); c = drawScaled(v, v.videoWidth, v.videoHeight, max);
      }
      if (isBlank(sample(c))) continue;
      const r = { t: v.currentTime, blob: await toJpeg(c, .85) };
      if (score) r.score = scoreFrame(c.getContext('2d', { willReadFrequently: true }), c.width, c.height).score;
      out.push(r);
    }
    return out;
  } catch (e) { return out; }
  finally { try { v.pause(); } catch (e) { } v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(url); }
}

/* One decode of an image blob -> perceptual hash (DCT, 64-bit hex), dominant colours, black&white flag, quality score */
export async function analyzeImage(blob) {
  const bmp = await createImageBitmap(blob);
  try {
    // pHash: 32x32 greyscale -> 2D DCT -> top-left 8x8 (minus DC) vs median
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data, g = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
    const coef = []; const cosT = (u, n) => Math.cos(((2 * n + 1) * u * Math.PI) / 64);
    for (let u = 0; u < 8; u++) for (let w = 0; w < 8; w++) { let s = 0; for (let y = 0; y < 32; y++) { const cy = cosT(u, y); for (let z = 0; z < 32; z++) s += g[y * 32 + z] * cy * cosT(w, z); } coef.push(s); }
    const ac = coef.slice(1), med = ac.slice().sort((a, b) => a - b)[31];
    let hex = ''; for (let i = 0; i < 64; i += 4) { let n = 0; for (let k = 0; k < 4; k++) n = (n << 1) | ((coef[i + k] > med && i + k > 0) ? 1 : 0); hex += n.toString(16); }
    // colours + quality on a 96px version
    const s = document.createElement('canvas'), k = 96 / Math.max(bmp.width, bmp.height); s.width = Math.max(1, Math.round(bmp.width * k)); s.height = Math.max(1, Math.round(bmp.height * k));
    const sx = s.getContext('2d', { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, s.width, s.height);
    const p = sx.getImageData(0, 0, s.width, s.height).data, bins = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, pink: 0 }; let sat = 0, n = 0;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i] / 255, gg = p[i + 1] / 255, b = p[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dl = mx - mn; n++;
      const S = dl === 0 ? 0 : dl / (1 - Math.abs(2 * l - 1)); sat += S;
      if (S < .35 || l < .12 || l > .92) continue;
      let h = dl === 0 ? 0 : mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4; h = (h * 60 + 360) % 360;
      const bin = h < 15 || h >= 345 ? (l > .62 ? 'pink' : 'red') : h < 40 ? 'orange' : h < 68 ? 'yellow' : h < 165 ? 'green' : h < 255 ? 'blue' : h < 300 ? 'purple' : 'pink';
      bins[bin]++;
    }
    const colors = Object.entries(bins).filter(([, v]) => v / n >= .22).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
    const bw = sat / n < .06;
    const q = scoreFrame(sx, s.width, s.height).score;
    return { ph: hex, colors, bw, q };
  } finally { bmp.close && bmp.close(); }
}
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64; let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}
