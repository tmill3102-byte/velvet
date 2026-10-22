// Velvet v1.7 video tools: convert (HEVC/MOV -> H.264 MP4), compress (Small/Medium/High) and trim, all on this device.
// Results are always saved by the app as NEW encrypted copies; the original is never touched.
import * as Addons from './addons.js';
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// iPhone/iPad Safari kills pages that use too much memory, so inputs are capped there (the output is held in memory too)
export let LIMIT = isIOS ? 400 * 1024 ** 2 : 1800 * 1024 ** 2;
export let LIMIT_OUT = isIOS ? 350 * 1024 ** 2 : 1500 * 1024 ** 2;
export const IOS = isIOS;
export function setLimit(inp, out) { LIMIT = inp; if (out) LIMIT_OUT = out; }   // tests only
export const PRESETS = {
  small: { label: 'Small', h: 720, bpp: 0.045, a: 96, note: 'For sharing and saving space' },
  medium: { label: 'Medium', h: 1080, bpp: 0.06, a: 128, note: 'Good balance' },
  high: { label: 'High quality', h: 1080, bpp: 0.1, a: 160, note: 'Close to the original' },
};
// multithreaded core only where the page is cross-origin isolated (the Windows app); Pages can't send those headers
const useMT = () => self.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined' && Addons.isHost() && mtAvailable;
let mtAvailable = false;
export async function init() { if (Addons.isHost()) { try { const r = await fetch(Addons.url('addons/ffmpeg/mt/ffmpeg-core.js'), { method: 'HEAD' }); mtAvailable = r.ok; } catch (e) { mtAvailable = false; } } }
export const threads = () => (useMT() ? 'multi' : 'single');
let cur = null;
// The multithreaded engine has a fixed pool of 8 threads, and FFmpeg must never ask for more (it would wait forever):
// 2 decoder threads per input, 1 filter thread, 2 encoder threads.
function mtArgs(a) {
  const out = ['-filter_threads', '1'];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-i') out.push('-threads', '2');
    if (a[i] === '-threads' && a[i + 1] === '1') { out.push('-threads', '2'); i++; continue; }
    out.push(a[i]);
  }
  return out;
}
function run(file, name, args, out, onLine) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./ffmpeg-worker.js', import.meta.url), { type: 'module' });
    cur = { w, reject };
    w.onmessage = ({ data: m }) => {
      if (m.type === 'log') { onLine && onLine(m.line); return; }
      w.terminate(); cur = null;
      if (m.type === 'error') reject(Object.assign(new Error(m.message), { log: m.log })); else resolve(m);
    };
    w.onerror = e => { w.terminate(); cur = null; reject(new Error(e.message || 'the video engine stopped (out of memory?)')); };
    const mt = useMT(); w.postMessage({ type: 'run', file, name, args: mt ? mtArgs(args) : args, out, mt });
  });
}
export function cancel() { if (cur) { cur.w.terminate(); const r = cur.reject; cur = null; r(Object.assign(new Error('Cancelled'), { cancelled: true })); } }
export const busy = () => !!cur;
const safeName = n => 'input.' + ((/\.([a-z0-9]{2,4})$/i.exec(n || '') || [, 'mp4'])[1].toLowerCase());
const hms = s => { const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
// read duration, size, codecs and rotation from FFmpeg's own report
export async function probe(file, name) {
  const lines = []; await run(file, safeName(name), ['-hide_banner', '-i', '$IN'], null, l => lines.push(l)).catch(e => { if (e.cancelled) throw e; });
  const txt = lines.join('\n'), info = { dur: 0, w: 0, h: 0, vcodec: '', acodec: '', fps: 30, rot: 0, vbr: 0, abr: 0, br: 0 };
  const d = /Duration: (\d+:\d+:\d+(?:\.\d+)?)/.exec(txt); if (d) info.dur = hms(d[1]) || 0;
  const b = /bitrate: (\d+) kb\/s/.exec(txt); if (b) info.br = +b[1] * 1000;
  const v = /Stream #\d+:\d+[^:]*: Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})/.exec(txt); if (v) { info.vcodec = v[1]; info.w = +v[2]; info.h = +v[3]; }
  const vl = (/Stream #\d+:\d+[^:]*: Video:[^\n]*/.exec(txt) || [''])[0];
  const f = /([\d.]+) fps/.exec(vl); if (f) info.fps = Math.min(120, +f[1]) || 30;
  const vb = /(\d+) kb\/s/.exec(vl); if (vb) info.vbr = +vb[1] * 1000;
  const a = /Stream #\d+:\d+[^:]*: Audio: (\w+)[^\n]*/.exec(txt); if (a) { info.acodec = a[1]; const ab = /(\d+) kb\/s/.exec(a[0]); if (ab) info.abr = +ab[1] * 1000; }
  const r = /rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+) degrees/.exec(txt); if (r) info.rot = Math.round(+(r[1] || r[2])) % 360;
  info.ok = !!(info.vcodec && info.dur);
  return info;
}
const even = x => Math.max(2, Math.round(x / 2) * 2);
// output plan for a job: { args, w, h, vbr, abr, est, copy }
export function plan(info, job) {
  const t0 = Math.max(0, job.start || 0), t1 = Math.min(info.dur, job.end || info.dur), dur = Math.max(0.1, t1 - t0);
  const turned = Math.abs(info.rot) === 90 || Math.abs(info.rot) === 270;
  let w = turned ? info.h : info.w, h = turned ? info.w : info.h;
  const P = job.mode === 'compress' ? PRESETS[job.preset || 'medium'] : null;
  const short = Math.min(w, h), cap = P ? P.h : 2160;
  if (short > cap) { const k = cap / short; w = even(w * k); h = even(h * k); } else { w = even(w); h = even(h); }
  const fps = Math.min(info.fps || 30, 60), bpp = P ? P.bpp : 0.09;
  let vbr = Math.round(w * h * fps * bpp); if (info.vbr && P) vbr = Math.min(vbr, Math.round(info.vbr * 0.9)); vbr = Math.max(250e3, vbr);
  const abr = (P ? P.a : 160) * 1000;
  const trimmed = t0 > 0.05 || t1 < info.dur - 0.05;
  // already H.264 + AAC and only a container change? then copy the streams (fast, lossless)
  const copy = job.mode === 'convert' && !trimmed && info.vcodec === 'h264' && (!info.acodec || info.acodec === 'aac');
  const args = [];
  if (trimmed) args.push('-ss', t0.toFixed(3));
  args.push('-i', '$IN'); if (trimmed) args.push('-t', dur.toFixed(3));
  args.push('-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-dn', '-sn');
  if (copy) args.push('-c', 'copy');
  else {
    args.push('-c:v', 'libopenh264', '-rc_mode', 'bitrate', '-b:v', String(vbr), '-maxrate', String(Math.round(vbr * 1.6)), '-g', String(Math.round(fps * 2)), '-threads', '1');
    args.push('-vf', `scale=${w}:${h}:flags=bicubic,format=yuv420p`, '-r', String(Math.round(fps * 1000) / 1000));
    args.push('-c:a', 'aac', '-b:a', String(abr), '-ac', '2');
  }
  args.push('-movflags', '+faststart', '-f', 'mp4', '/out.mp4');
  const est = copy ? (info.br ? info.br * dur / 8 : 0) : (vbr + abr) * dur / 8 * 1.02;
  return { args, w, h, vbr, abr, dur, est: Math.round(est), copy, trimmed, t0, t1 };
}
export async function exec(file, name, p, onProgress) {
  let last = 0;
  const m = await run(file, safeName(name), p.args, '/out.mp4', l => { const t = /time=(\d+:\d+:\d+(?:\.\d+)?)/.exec(l); if (t) { const s = hms(t[1]); if (s != null) { last = Math.min(1, s / p.dur); onProgress && onProgress(last); } } });
  if (!m.data || !m.data.byteLength || m.ret !== 0) throw Object.assign(new Error('the conversion didn’t finish' + (m.log ? ': ' + (m.log.filter(l => /error|invalid|unsupported|not/i.test(l)).slice(-2).join(' ') || 'code ' + m.ret) : '')), { log: m.log });
  return new Blob([m.data], { type: 'video/mp4' });
}
// audio for speech search when the browser can't decode it: 16 kHz mono float PCM
export async function audioPCM(file, name, maxSec) {
  const args = ['-i', '$IN', '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000']; if (maxSec) args.push('-t', String(maxSec)); args.push('-f', 'f32le', '/out.pcm');
  const m = await run(file, safeName(name), args, '/out.pcm');
  if (!m.data || !m.data.byteLength) throw new Error('no audio track');
  return new Float32Array(m.data);
}
