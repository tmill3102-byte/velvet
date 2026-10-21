// Velvet v1.3: video chapters (scene-change detection) and highlight segments. All on-device.
// One scan of a video gives, per sampled frame: a small visual signature (colour histogram + luma grid),
// the thumbnail quality score (scoreFrame: sharpness/exposure/contrast/colour) and a small JPEG.
import { once, frameReady, drawScaled, sample, isBlank, toJpeg, scoreFrame, timed, isIOS } from './thumbs.js';

const FW = 32, FH = 18;
function features(c) {
  const s = document.createElement('canvas'); s.width = FW; s.height = FH;
  const x = s.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, FW, FH);
  const d = x.getImageData(0, 0, FW, FH).data, n = FW * FH, grid = new Float32Array(n), hist = new Float32Array(64);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = d[i], g = d[i + 1], b = d[i + 2]; grid[j] = (.299 * r + .587 * g + .114 * b) / 255;
    hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)] += 1 / n;
  }
  return { grid, hist };
}
// 0 = identical .. ~1 = completely different
export function frameDiff(a, b) {
  let h = 0; for (let i = 0; i < 64; i++) h += Math.abs(a.hist[i] - b.hist[i]); h /= 2;
  let g = 0; for (let i = 0; i < a.grid.length; i++) g += Math.abs(a.grid[i] - b.grid[i]); g /= a.grid.length;
  return .6 * h + .4 * Math.min(1, g * 2.5);
}

/* scan: src = Blob or object URL. Evenly spaced samples, bounded by maxN and a time budget. */
export async function scanVideo(src, { step = 1, maxN = isIOS ? 60 : 120, minN = 12, budget = isIOS ? 25000 : 30000, thumbMax = 240, onProgress, shouldStop } = {}) {
  const own = typeof src !== 'string', url = own ? URL.createObjectURL(src) : src;
  const v = document.createElement('video'), frames = [];
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:90px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(v); const t0 = performance.now(), end = t0 + budget;
  let dur = 0, partial = false;
  try {
    v.src = url; v.load(); await once(v, 'loadedmetadata', 10000);
    if (!isFinite(v.duration)) { v.currentTime = 1e7; await once(v, 'durationchange', 3000).catch(() => { }); }   // e.g. MediaRecorder WebM
    if (v.readyState < 2) await once(v, 'loadeddata', 6000).catch(() => { });
    dur = isFinite(v.duration) ? v.duration : 0; if (!v.videoWidth || !dur) return { dur, frames, partial: true };
    const n = Math.max(Math.min(minN, Math.floor(dur / .4)), Math.min(maxN, Math.round(dur / step)));
    let unlocked = false, miss = 0;
    let reloads = 0;
    const revive = async () => {                                                  // a failed seek can kill the element (seen on GStreamer builds): reload it
      if (reloads++ > 6) return false; v.removeAttribute('src'); v.load(); v.src = url; v.load();
      try { await once(v, 'loadedmetadata', 6000); if (v.readyState < 2) await once(v, 'loadeddata', 4000).catch(() => { }); return true; } catch (e) { return false; }
    };
    const seekTo = async (t, ms = 2500) => {
      if (v.error && !(await revive())) return false;
      v.currentTime = t; const ok = await once(v, 'seeked', ms).then(() => true, () => false);
      if (v.error) { await revive(); return false; }
      return ok || (Math.abs(v.currentTime - t) < .3 && v.readyState >= 2);       // some WebKit builds drop 'seeked' but still land
    };
    const unlock = async () => {                                                  // iOS/WebKit: decode only starts after one real play
      unlocked = true; try { await timed(v.play(), 2500, 'play'); await frameReady(v, 1000); } catch (e) { } v.pause();
    };
    { const ok = await seekTo(dur * .1, 3000); await frameReady(v, 400);
      if (!ok || isBlank(sample(drawScaled(v, v.videoWidth, v.videoHeight, 64)))) await unlock(); }
    // coarse-to-fine order (every 4th sample first), so a scan cut short by the time budget still spans the whole video
    const order = []; for (const o of [0, 2, 1, 3]) for (let i = o; i < n; i += 4) order.push(i);
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      if (performance.now() > end || (shouldStop && shouldStop())) { partial = true; break; }
      const t = Math.min(dur - .05, (i + .5) * dur / n);
      const ok = await seekTo(t);
      if (!ok) { if (++miss === 3 && !unlocked) await unlock(); if (miss > 8 && !frames.length) { partial = true; break; } continue; } miss = 0;
      await frameReady(v, 400);
      let c = drawScaled(v, v.videoWidth, v.videoHeight, thumbMax);
      if (isBlank(sample(c)) && !unlocked) {                       // iOS: one real play before frames paint
        await unlock();
        await seekTo(t, 2000); await frameReady(v, 400); c = drawScaled(v, v.videoWidth, v.videoHeight, thumbMax);
      }
      const st = sample(c);
      const x = c.getContext('2d', { willReadFrequently: true });
      const f = { t: v.currentTime, blank: isBlank(st), score: scoreFrame(x, c.width, c.height).score, ...features(c) };
      f.blob = await toJpeg(c, .72);
      frames.push(f); onProgress && onProgress((k + 1) / n);
    }
    frames.sort((a, b) => a.t - b.t);
    return { dur, frames, partial, w: v.videoWidth, h: v.videoHeight, ms: performance.now() - t0 };
  } catch (e) { return { dur, frames, partial: true, error: String(e.message || e) }; }
  finally { try { v.pause(); } catch (e) { } v.removeAttribute('src'); v.load(); v.remove(); if (own) URL.revokeObjectURL(url); }
}

/* scene cuts: robust threshold on frame-to-frame differences, local maxima, minimum chapter length */
export function findCuts(scan, { max = 12, minLen = null, absMin = .16 } = {}) {
  const F = scan.frames.filter(f => !f.blank), dur = scan.dur; if (F.length < 3) return [];
  const d = F.map((f, i) => i ? frameDiff(F[i - 1], f) : 0);
  const xs = d.slice(1).slice().sort((a, b) => a - b), med = xs[Math.floor(xs.length / 2)];
  const mad = xs.map(x => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(xs.length / 2)] || .01;
  const thr = Math.max(absMin, med + 5 * mad);
  const ml = minLen || Math.max(2, dur / 40);
  const cand = [];
  for (let i = 1; i < F.length; i++) if (d[i] >= thr && d[i] >= (d[i - 1] || 0) && d[i] >= (d[i + 1] || 0)) cand.push({ t: (F[i - 1].t + F[i].t) / 2, d: d[i], i });
  cand.sort((a, b) => b.d - a.d);
  const cuts = [];
  for (const c of cand) {
    if (cuts.length >= max - 1) break;
    if (c.t < ml * .5 || dur - c.t < ml * .5) continue;
    if (cuts.some(x => Math.abs(x.t - c.t) < ml)) continue;
    cuts.push(c);
  }
  return cuts.sort((a, b) => a.t - b.t);
}
/* chapters = [{t, end, frame}] where frame is the best-scoring sampled frame inside the chapter (used for thumb + label) */
export function chaptersFrom(scan, cuts) {
  const F = scan.frames.filter(f => !f.blank), starts = [0, ...cuts.map(c => c.t)], out = [];
  starts.forEach((s, k) => {
    const e = k + 1 < starts.length ? starts[k + 1] : scan.dur;
    const inside = F.filter(f => f.t >= s && f.t < e), mid = inside.filter(f => f.t > s + (e - s) * .15 && f.t < e - (e - s) * .1);
    const pool = mid.length ? mid : inside; if (!pool.length) return;
    const fr = pool.reduce((a, b) => b.score > a.score ? b : a);
    out.push({ t: +s.toFixed(2), end: +e.toFixed(2), frame: fr });
  });
  return out;
}

/* highlights: best-scoring windows (sharp, well-exposed, some motion), not straddling a scene cut */
export function pickSegments(scan, { target = 20, seg = 3, max = 8, cuts = null } = {}) {
  const F = scan.frames.filter(f => !f.blank), dur = scan.dur; if (!F.length || !dur) return [];
  const L = Math.min(seg, dur), cutT = (cuts || findCuts(scan)).map(c => c.t);
  const diffs = F.map((f, i) => i ? frameDiff(F[i - 1], f) : 0);
  const wins = [];
  for (let i = 0; i < F.length; i++) {
    let s = Math.max(0, Math.min(dur - L, F[i].t - L / 2)); const e = s + L;
    // snap away from cuts: a highlight shouldn't show half of two scenes
    const c = cutT.find(x => x > s + .2 && x < e - .2); if (c != null) { if (c - s > e - c) s = Math.max(0, c - L); else s = Math.min(dur - L, c); }
    const inW = F.map((f, k) => [f, k]).filter(([f]) => f.t >= s && f.t <= s + L);
    if (!inW.length) continue;
    const q = inW.reduce((a, [f]) => a + f.score, 0) / inW.length;
    const motion = inW.length > 1 ? inW.slice(1).reduce((a, [, k]) => a + Math.min(.15, diffs[k]), 0) / (inW.length - 1) : 0;
    wins.push({ start: +s.toFixed(2), end: +(s + L).toFixed(2), score: q + 6 * motion });
  }
  wins.sort((a, b) => b.score - a.score);
  const best = wins[0] ? wins[0].score : 0, out = []; let total = 0;
  for (const w of wins) {
    if (out.length >= max || total >= target) break;
    if (w.score < best - 3.5) break;                                  // don't pad with weak footage
    if (out.some(o => w.start < o.end + .5 && w.end > o.start - .5)) continue;
    out.push(w); total += w.end - w.start;
  }
  return out.sort((a, b) => a.start - b.start);
}

/* MediaRecorder support for reel export (canvas capture). Returns a mime type or null. */
export function recorderType() {
  try {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    for (const t of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
      if (MediaRecorder.isTypeSupported(t)) return t;
  } catch (e) { }
  return null;
}
