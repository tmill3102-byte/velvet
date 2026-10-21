// Velvet v1.4: on-device People. Faces are found (YuNet) and described (SFace) inside the AI worker,
// grouped into people on this device, and stored only in an encrypted sidecar record (same AES-GCM key as the
// library). Names, face boxes and face vectors never leave the device and are never stored in plaintext.
import * as Store from './store.js';
import * as AI from './ai.js';
import { scanVideo } from './scenes.js';
import { once, frameReady, timed, takeVideo, releaseVideo } from './thumbs.js';
export const MODEL = 'yunet2023mar+sface2021dec#1';
export const MODEL_MB = 39;
const DST = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]; // ArcFace 112x112 template
const T_JOIN = .5, T_SEED = .52, T_SAME_ITEM = .6, MIN_SCORE = .75, MIN_FACE = 28, MIN_PERSON = 2;
let data = null; const vecs = new Map();      // faceKey "itemId:n" -> Float32Array(128)

/* ---------- encoding ---------- */
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
function quant(v) { let m = 0; for (const x of v) m = Math.max(m, Math.abs(x)); const s = (m || 1) / 127, q = new Int8Array(v.length); for (let i = 0; i < v.length; i++) q[i] = Math.round(v[i] / s); return { e: b64(new Uint8Array(q.buffer)), q: s }; }
function dequant(f) { const q = new Int8Array(unb64(f.e).buffer), v = new Float32Array(q.length); let n = 0; for (let i = 0; i < q.length; i++) { v[i] = q[i] * f.q; n += v[i] * v[i]; } n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n; return v; }
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const normed = v => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / n; return o; };
function meanOf(keys) { const m = new Float32Array(128); let k = 0; for (const key of keys) { const v = vecs.get(key); if (!v) continue; k++; for (let i = 0; i < 128; i++) m[i] += v[i]; } return k ? normed(m) : null; }

/* ---------- open / persist / wipe ---------- */
export async function open(idx) {
  if (data) return data;
  const m = idx.settings.faces || {};
  if (m.file && m.model === MODEL) { try { const b = await Store.readFile(m.file.id, m.file.chunks, 'application/json'); data = JSON.parse(await b.text()); } catch (e) { console.warn('People data unreadable, rebuilding', e); } }
  if (!data || data.model !== MODEL) data = { v: 1, model: MODEL, items: {}, people: [] };
  vecs.clear(); for (const [id, e] of Object.entries(data.items)) (e.f || []).forEach((f, n) => vecs.set(id + ':' + n, dequant(f)));
  return data;
}
export const isOpen = () => !!data;
export const on = idx => !!(idx && idx.settings.faces && idx.settings.faces.on);
export async function persist(idx) {
  if (!data) return;
  const m = idx.settings.faces = idx.settings.faces || {}; const old = m.file, id = old && old.id === 'pf_a' ? 'pf_b' : 'pf_a';
  const r = await Store.putFile(id, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  m.file = { id, chunks: r.chunks, stored: r.stored }; m.model = MODEL; m.updated = Date.now();
  await Store.saveIndex(idx); if (old && old.id !== id) await Store.deleteFile(old.id).catch(() => { });
}
export async function wipe(idx) {
  stop(); const m = idx.settings.faces; if (m && m.file) await Store.deleteFile(m.file.id).catch(() => { });
  (idx.settings.rules || []).forEach(r => { if (r.kind === 'person') r.on = false; });
  idx.settings.faces = { on: false }; data = { v: 1, model: MODEL, items: {}, people: [] }; vecs.clear(); await Store.saveIndex(idx);
}
export function shutdown() { stopFlag = true; data = null; vecs.clear(); }
export function forget(ids) {
  if (!data) return; const gone = new Set(ids);
  ids.forEach(id => { const e = data.items[id]; if (e) (e.f || []).forEach((_, n) => vecs.delete(id + ':' + n)); delete data.items[id]; });
  data.people.forEach(p => { p.faces = p.faces.filter(k => !gone.has(itemOf(k))); p.not = (p.not || []).filter(k => !gone.has(itemOf(k))); });
  data.people = data.people.filter(p => p.faces.length);
}
export const stats = idx => ({ indexed: data ? idx.items.filter(i => data.items[i.id]).length : 0, total: idx.items.length, faces: vecs.size, people: data ? data.people.length : 0, bytes: (idx.settings.faces && idx.settings.faces.file && idx.settings.faces.file.stored) || 0 });

/* ---------- pixels -> model inputs ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function detInput(src, W, H) {
  const k = 640 / Math.max(W, H), c = canvas(640, 640), x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, 640, 640); x.drawImage(src, 0, 0, Math.round(W * k), Math.round(H * k));
  const d = x.getImageData(0, 0, 640, 640).data, n = 640 * 640, out = new Float32Array(3 * n);
  for (let i = 0, j = 0; j < n; i += 4, j++) { out[j] = d[i + 2]; out[n + j] = d[i + 1]; out[2 * n + j] = d[i]; }   // BGR, 0..255
  return { data: out, k };
}
// least-squares similarity transform (rotation + uniform scale + shift, no reflection) mapping 5 landmarks onto the template
function similarity(pts) {
  let mx = 0, my = 0, dx = 0, dy = 0; for (let i = 0; i < 5; i++) { mx += pts[2 * i]; my += pts[2 * i + 1]; dx += DST[i][0]; dy += DST[i][1]; } mx /= 5; my /= 5; dx /= 5; dy /= 5;
  let sa = 0, sb = 0, ss = 0;
  for (let i = 0; i < 5; i++) { const sx = pts[2 * i] - mx, sy = pts[2 * i + 1] - my, tx = DST[i][0] - dx, ty = DST[i][1] - dy; sa += sx * tx + sy * ty; sb += sx * ty - sy * tx; ss += sx * sx + sy * sy; }
  const a = sa / (ss || 1), b = sb / (ss || 1); return { a, b, tx: dx - (a * mx - b * my), ty: dy - (b * mx + a * my) };
}
function alignedCrop(src, kps, into, off) {
  const c = canvas(112, 112), x = c.getContext('2d', { willReadFrequently: true }), T = similarity(kps);
  x.setTransform(T.a, T.b, -T.b, T.a, T.tx, T.ty); x.drawImage(src, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
  const d = x.getImageData(0, 0, 112, 112).data, n = 112 * 112;
  for (let i = 0, j = 0; j < n; i += 4, j++) { into[off + j] = d[i]; into[off + n + j] = d[i + 1]; into[off + 2 * n + j] = d[i + 2]; }   // RGB, 0..255
}
/* Avatar framing (v1.4.1): the detector box is tight (brows to chin), so expand it ~2.1x around its centre with
   extra headroom for forehead + hair, make it square in pixels, and clamp to the image by shifting (not shrinking)
   so a round mask never cuts the face. `b` is normalised [x,y,w,h] in the displayed (EXIF-oriented / rotated) image,
   `ar` = image width/height. Returns the normalised square crop [x,y,w,h]. */
export const AVATAR_K = 2.1, AVATAR_UP = .14;
export function avatarRect(b, ar) {
  const W = ar >= 1 ? ar : 1, H = ar >= 1 ? 1 : 1 / ar;              // virtual pixels, long side = 1·ar
  const bw = b[2] * W, bh = b[3] * H, side = Math.min(Math.max(bw, bh) * AVATAR_K, W, H);
  const cx = (b[0] + b[2] / 2) * W, cy = (b[1] + b[3] / 2) * H - AVATAR_UP * bh;
  const x = Math.max(0, Math.min(W - side, cx - side / 2)), y = Math.max(0, Math.min(H - side, cy - side / 2));
  return [x / W, y / H, side / W, side / H];
}
export const AVATAR_PX = 128, CROP_V = 2;
function avatarCrop(src, b, W, H) {      // square JPEG of a face (only kept for video faces, which have no matching thumbnail)
  const r = avatarRect(b, W / H), c = canvas(AVATAR_PX, AVATAR_PX), x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(src, r[0] * W, r[1] * H, r[2] * W, r[3] * H, 0, 0, AVATAR_PX, AVATAR_PX);
  return c.toDataURL('image/jpeg', .8).split(',')[1];
}
// how frontal a face is (1 = looking at the camera) from the 5 landmarks, and how sharp its region is
function faceQuality(src, box, kps) {
  const [lx, ly, rx, ry, nx] = kps, eye = Math.hypot(rx - lx, ry - ly) || 1, mid = (lx + rx) / 2;
  const fr = +Math.max(0, 1 - Math.abs(nx - mid) / (eye * .5)).toFixed(3);
  const n = 48, c = canvas(n, n), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, box[0], box[1], Math.max(1, box[2]), Math.max(1, box[3]), 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data, L = new Float32Array(n * n); for (let i = 0; i < n * n; i++) L[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  let a = 0, a2 = 0, k = 0; for (let y = 1; y < n - 1; y++) for (let x2 = 1; x2 < n - 1; x2++) { const o = y * n + x2, v = 4 * L[o] - L[o - 1] - L[o + 1] - L[o - n] - L[o + n]; a += v; a2 += v * v; k++; }
  return { fr, sh: +Math.max(0, a2 / k - (a / k) ** 2).toFixed(1) };
}
// one image -> faces [{b:[x,y,w,h] normalised, s, v, (c)}]
export async function facesIn(src, W, H, { t = null, crop = false } = {}) {
  const { data: inp, k } = detInput(src, W, H);
  const r = await AI.workerCall({ type: 'fdet', data: inp, thr: MIN_SCORE }, [inp.buffer]);
  const fs = r.faces.map(f => ({ s: f.score, box: f.box.map(v => v / k), kps: f.kps.map(v => v / k) })).filter(f => Math.min(f.box[2], f.box[3]) >= MIN_FACE * Math.min(1, Math.max(W, H) / 640));
  if (!fs.length) return [];
  const sz = 3 * 112 * 112, buf = new Float32Array(fs.length * sz); fs.forEach((f, i) => alignedCrop(src, f.kps, buf, i * sz));
  const e = await AI.workerCall({ type: 'femb', data: buf, n: fs.length }, [buf.buffer]);
  return fs.map((f, i) => { const bx = f.box, o = { b: [bx[0] / W, bx[1] / H, bx[2] / W, bx[3] / H].map(x => +Math.max(0, Math.min(1, x)).toFixed(4)), s: +f.s.toFixed(3), v: e.vecs[i] };
    Object.assign(o, faceQuality(src, bx, f.kps)); o.px = Math.round(Math.max(bx[2], bx[3]));
    if (t != null) o.t = +t.toFixed(2); if (crop) { o.c = avatarCrop(src, o.b, W, H); o.cv = CROP_V; } return o; });
}
// EXIF orientation applied explicitly so boxes match the (oriented) thumbnails and on-screen photos
async function bitmapOf(blob) { try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { return createImageBitmap(blob); } }
async function facesOfItem(it, ctx) {
  if (it.type === 'photo') {
    let bmp = null;
    if (!(it.w && it.h && it.w * it.h > 40e6)) { try { bmp = await bitmapOf(await ctx.fileBlob(it)); } catch (e) { } }     // full image (HEIC on non-Apple browsers falls back)
    if (!bmp) { const tb = await ctx.thumbBlob(it); if (tb) bmp = await bitmapOf(tb); }
    if (!bmp) return [];
    try { return await facesIn(bmp, bmp.width, bmp.height); } finally { bmp.close && bmp.close(); }
  }
  let found = [];
  if (it.size <= ctx.maxVideoBytes) {
    const scan = await scanVideo(await ctx.fileBlob(it), { maxN: 6, minN: 6, step: 1e9, thumbMax: 960, budget: 15000 });
    for (const f of scan.frames) { if (f.blank || !Store.isUnlocked()) continue; const bmp = await bitmapOf(f.blob); try { found.push(...await facesIn(bmp, bmp.width, bmp.height, { t: f.t, crop: true })); } finally { bmp.close && bmp.close(); } }
  }
  if (!found.length) { const tb = await ctx.thumbBlob(it); if (tb) { const bmp = await bitmapOf(tb); try { found = await facesIn(bmp, bmp.width, bmp.height, { t: it.thumbT || 0, crop: true }); } finally { bmp.close && bmp.close(); } } }
  // same person in several frames -> keep the clearest face once
  found.sort((a, b) => b.s * b.b[2] * b.b[3] - a.s * a.b[2] * a.b[3]); const keep = [];
  for (const f of found) if (keep.every(g => dot(f.v, g.v) < T_SAME_ITEM)) keep.push(f);
  return keep.slice(0, 12);
}

/* ---------- indexing ---------- */
let running = false, stopFlag = false;
export const isRunning = () => running;
export function stop() { stopFlag = true; }
export async function indexFaces(ctx) {
  if (running) return; running = true; stopFlag = false;
  const { idx } = ctx;
  try {
    await open(idx);
    AI.setBusy(true); await refreshFaces(ctx);
    const todo = idx.items.filter(i => !data.items[i.id]); let done = 0, dirty = 0; const t0 = performance.now();
    if (!todo.length) { if (recluster()) await persist(idx); return; }
    ctx.onProgress && ctx.onProgress({ phase: 'loading', done, total: todo.length }); AI.setBusy(true);
    await AI.workerCall({ type: 'finit' });
    for (const it of todo) {
      if (stopFlag || !Store.isUnlocked()) break;
      if (document.hidden) { ctx.onProgress && ctx.onProgress({ phase: 'paused', done, total: todo.length }); await new Promise(r => { const f = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', f); r(); } }; document.addEventListener('visibilitychange', f); }); }
      if (!idx.items.includes(it) || !data) continue;
      try {
        const fs = await facesOfItem(it, ctx); if (!data) break;
        data.items[it.id] = { f: fs.map(f => { const q = quant(f.v), o = { b: f.b, s: f.s, e: q.e, q: q.q, fr: f.fr, sh: f.sh, px: f.px }; if (f.t != null) o.t = f.t; if (f.c) { o.c = f.c; o.cv = f.cv; } return o; }) };
        fs.forEach((f, n) => vecs.set(it.id + ':' + n, normed(f.v)));
      } catch (e) { console.warn('faces failed', it.name, e); if (data) data.items[it.id] = { f: [], err: String(e.message || e).slice(0, 80) }; }
      done++; dirty++;
      ctx.onProgress && ctx.onProgress({ phase: 'indexing', done, total: todo.length, msPer: (performance.now() - t0) / done });
      if (dirty >= 10) { recluster(); await persist(idx); dirty = 0; ctx.onBatch && ctx.onBatch(); }
    }
    if (data) { recluster(); await persist(idx); }
    ctx.onProgress && ctx.onProgress({ phase: 'done', done, total: todo.length });
  } finally { running = false; AI.setBusy(false); }
}

/* v1.4.1: faces indexed by v1.4.0 have tight video crops and no quality info. Upgrade them in place from the
   stored boxes (re-detect only to recover landmarks; no re-embedding, so People/names are untouched). */
const needsRefresh = e => e && e.f && e.f.length && e.f.some(f => f.fr == null || (f.c && f.cv !== CROP_V));
const iou = (a, b) => { const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]), r = Math.min(a[0] + a[2], b[0] + b[2]), u = Math.min(a[1] + a[3], b[1] + b[3]); const i = Math.max(0, r - x) * Math.max(0, u - y); return i / (a[2] * a[3] + b[2] * b[3] - i || 1); };
async function upgradeFrom(src, W, H, faces, crop) {
  const { data: inp, k } = detInput(src, W, H);
  const r = await AI.workerCall({ type: 'fdet', data: inp, thr: .5 }, [inp.buffer]);
  const det = r.faces.map(f => ({ box: f.box.map(v => v / k), kps: f.kps.map(v => v / k) }));
  for (const f of faces) {
    const bpx = [f.b[0] * W, f.b[1] * H, f.b[2] * W, f.b[3] * H]; let best = null, bi = .3;
    for (const d of det) { const o = iou(bpx, d.box); if (o > bi) { bi = o; best = d; } }
    Object.assign(f, best ? faceQuality(src, best.box, best.kps) : { fr: .5, sh: 0 }); f.px = Math.round(Math.max(bpx[2], bpx[3]));
    if (crop) { f.c = avatarCrop(src, f.b, W, H); f.cv = CROP_V; }
  }
}
async function videoFrames(blob, times) {
  const url = URL.createObjectURL(blob), v = takeVideo(), out = new Map();
  try {
    v.src = url; await once(v, 'loadedmetadata', 20000); if (v.readyState < 2) await once(v, 'loadeddata', 12000).catch(() => { });
    const W = v.videoWidth, H = v.videoHeight, kk = Math.min(1, 960 / Math.max(W, H));
    for (const t of times) {
      v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - .05)); await once(v, 'seeked', 6000).catch(() => { }); await frameReady(v, 600);
      const c = canvas(Math.round(W * kk), Math.round(H * kk)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.set(t, c);
    }
  } finally { releaseVideo(v); URL.revokeObjectURL(url); }
  return out;
}
export async function refreshFaces(ctx) {
  const ids = Object.keys(data.items).filter(id => needsRefresh(data.items[id])); if (!ids.length) return 0;
  await AI.workerCall({ type: 'finit' }); let n = 0;
  for (const id of ids) {
    if (stopFlag || !Store.isUnlocked() || !data) break;
    const it = ctx.idx.items.find(i => i.id === id), e = data.items[id]; if (!it) continue;
    try {
      if (it.type === 'photo') {
        const tb = await ctx.thumbBlob(it); if (tb) { const bmp = await bitmapOf(tb); try { await upgradeFrom(bmp, bmp.width, bmp.height, e.f, false); } finally { bmp.close && bmp.close(); } }
      } else {
        const byT = new Map(); e.f.forEach(f => { const t = f.t || 0; if (!byT.has(t)) byT.set(t, []); byT.get(t).push(f); });
        let frames = null;
        if (it.size <= ctx.maxVideoBytes) frames = await videoFrames(await ctx.fileBlob(it), [...byT.keys()]).catch(() => null);
        for (const [t, fs] of byT) {
          const c = frames && frames.get(t);
          if (c) await upgradeFrom(c, c.width, c.height, fs, true);
          else fs.forEach(f => { if (f.fr == null) { f.fr = .5; f.sh = 0; } if (f.c) f.cv = CROP_V; f.old = 1; });   // can't re-decode here: keep the old crop
        }
      }
    } catch (err) { console.warn('face refresh', it.name, err); e.f.forEach(f => { if (f.fr == null) { f.fr = .5; f.sh = 0; } if (f.c) f.cv = CROP_V; }); }
    if (++n % 10 === 0) { await persist(ctx.idx); ctx.onBatch && ctx.onBatch(); }
  }
  await persist(ctx.idx); ctx.onBatch && ctx.onBatch(); return n;
}

/* ---------- grouping ---------- */
export const itemOf = k => k.slice(0, k.lastIndexOf(':'));
export function faceInfo(k) { const id = itemOf(k), n = +k.slice(k.lastIndexOf(':') + 1), e = data && data.items[id]; const f = e && e.f && e.f[n]; return f ? { key: k, itemId: id, b: f.b, s: f.s, t: f.t, c: f.c, cv: f.cv, fr: f.fr, sh: f.sh, px: f.px } : null; }
export const _raw = () => data;   // tests
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// assign new faces to known people, group the rest; returns true if anything changed
export function recluster() {
  if (!data) return false; let changed = false;
  const owner = new Map(); data.people.forEach(p => { p.faces = p.faces.filter(k => vecs.has(k)); p.faces.forEach(k => owner.set(k, p)); });
  const cents = data.people.map(p => [p, meanOf(p.faces), new Set(p.not || [])]).filter(x => x[1]);
  const left = [];
  for (const k of vecs.keys()) {
    if (owner.has(k)) continue; const f = faceInfo(k); if (!f || f.s < MIN_SCORE) continue;
    const v = vecs.get(k); let best = null, bs = T_JOIN;
    for (const [p, c, not] of cents) { if (not.has(k)) continue; const s = dot(v, c); if (s >= bs) { bs = s; best = p; } }
    if (best) { best.faces.push(k); owner.set(k, best); changed = true; } else left.push(k);
  }
  // leader clustering of what's left, then merge close clusters
  let cl = [];
  for (const k of left) { const v = vecs.get(k); let best = null, bs = T_SEED;
    for (const c of cl) { const s = dot(v, c.m); if (s >= bs) { bs = s; best = c; } }
    if (best) { best.keys.push(k); for (let i = 0; i < 128; i++) best.sum[i] += v[i]; best.m = normed(best.sum); } else cl.push({ keys: [k], sum: Float32Array.from(v), m: v }); }
  for (let merged = true; merged;) { merged = false;
    for (let i = 0; i < cl.length && !merged; i++) for (let j = i + 1; j < cl.length; j++) if (dot(cl[i].m, cl[j].m) >= T_SEED) { cl[i].keys.push(...cl[j].keys); for (let d = 0; d < 128; d++) cl[i].sum[d] += cl[j].sum[d]; cl[i].m = normed(cl[i].sum); cl.splice(j, 1); merged = true; break; } }
  for (const c of cl) if (new Set(c.keys.map(itemOf)).size >= MIN_PERSON) { data.people.push({ id: newId(), name: '', hidden: false, faces: c.keys, not: [], made: Date.now() }); changed = true; }
  const before = data.people.length; data.people = data.people.filter(p => p.faces.length); if (data.people.length !== before) changed = true;
  return changed;
}

/* ---------- queries ---------- */
export const people = () => (data ? data.people : []);
export const person = id => people().find(p => p.id === id) || null;
export const itemsOf = (p, ok = () => true) => [...new Set((typeof p === 'string' ? person(p) : p)?.faces.map(itemOf) || [])].filter(ok);
export function peopleOf(itemId) { return people().filter(p => p.faces.some(k => itemOf(k) === itemId)); }
export function facesOfItemId(itemId) { const e = data && data.items[itemId]; return e && e.f ? e.f.map((_, n) => faceInfo(itemId + ':' + n)) : []; }
// best face to show for a person: big, confident, and (if given) from an item the caller may show
export function cover(p, ok = () => true) {
  let best = null, bs = -1;
  // the person's largest, most frontal, sharpest face (detector confidence as a tie-breaker)
  for (const k of p.faces) {
    const f = faceInfo(k); if (!f || !ok(f.itemId)) continue;
    const size = Math.min(1, (f.px || 120) / 160), fr = f.fr == null ? .7 : f.fr, sh = f.sh == null ? .6 : Math.min(1, Math.log1p(f.sh) / 7);
    const s = (.35 + .65 * size) * (.25 + .75 * fr) * (.5 + .5 * sh) * (.7 + .3 * f.s) * (f.old ? .7 : 1);
    if (s > bs) { bs = s; best = f; }
  }
  return best;
}
export const displayName = (p, i) => p.name || `Person ${i + 1}`;
export function find(q) { q = (q || '').trim().toLowerCase(); if (q.length < 2) return []; return people().filter(p => p.name && !p.hidden && p.name.toLowerCase().includes(q)); }
export function byName(name) { const n = (name || '').trim().toLowerCase(); return people().find(p => p.name && p.name.toLowerCase() === n) || null; }

/* ---------- edits (all saved encrypted by the caller via persist) ---------- */
export function rename(id, name) { const p = person(id); if (p) p.name = (name || '').trim().slice(0, 60); return p; }
export function setHidden(id, h) { const p = person(id); if (p) p.hidden = !!h; return p; }
export function merge(intoId, fromId) {
  const a = person(intoId), b = person(fromId); if (!a || !b || a === b) return null;
  a.faces = [...new Set([...a.faces, ...b.faces])]; a.not = [...new Set([...(a.not || []), ...(b.not || [])])].filter(k => !a.faces.includes(k));
  if (!a.name && b.name) a.name = b.name; a.hidden = a.hidden && b.hidden;
  data.people = data.people.filter(p => p !== b); return a;
}
// move faces out into a new person (split) or into an existing one
export function moveFaces(fromId, keys, toId = null) {
  const a = person(fromId); if (!a) return null; const ks = new Set(keys);
  a.faces = a.faces.filter(k => !ks.has(k)); a.not = [...new Set([...(a.not || []), ...keys])];
  let b = toId ? person(toId) : null;
  if (!b) { b = { id: newId(), name: '', hidden: false, faces: [], not: [], made: Date.now() }; data.people.push(b); }
  b.faces = [...new Set([...b.faces, ...keys])]; b.not = (b.not || []).filter(k => !ks.has(k));
  data.people = data.people.filter(p => p.faces.length); return b;
}
// "not this person": take faces out and never put them back into this person automatically
export function notThis(id, keys) {
  const p = person(id); if (!p) return; const ks = new Set(keys);
  p.faces = p.faces.filter(k => !ks.has(k)); p.not = [...new Set([...(p.not || []), ...keys])];
  if (!p.faces.length) data.people = data.people.filter(x => x !== p);
}
