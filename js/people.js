// Velvet v1.4: on-device People. Faces are found (YuNet) and described (SFace) inside the AI worker,
// grouped into people on this device, and stored only in an encrypted sidecar record (same AES-GCM key as the
// library). Names, face boxes and face vectors never leave the device and are never stored in plaintext.
import * as Store from './store.js';
import * as AI from './ai.js';
import { scanVideo } from './scenes.js';
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
function avatarCrop(src, b, W, H) {      // small square JPEG of a face (only kept for video faces, which have no matching thumbnail)
  const s = Math.max(b[2], b[3]) * 1.5, cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2, c = canvas(96, 96), x = c.getContext('2d');
  x.drawImage(src, Math.max(0, cx - s / 2), Math.max(0, cy - s / 2), Math.min(s, W), Math.min(s, H), 0, 0, 96, 96);
  return c.toDataURL('image/jpeg', .78).split(',')[1];
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
    if (t != null) o.t = +t.toFixed(2); if (crop) o.c = avatarCrop(src, bx, W, H); return o; });
}
async function bitmapOf(blob) { return createImageBitmap(blob); }
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
        data.items[it.id] = { f: fs.map(f => { const q = quant(f.v), o = { b: f.b, s: f.s, e: q.e, q: q.q }; if (f.t != null) o.t = f.t; if (f.c) o.c = f.c; return o; }) };
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

/* ---------- grouping ---------- */
export const itemOf = k => k.slice(0, k.lastIndexOf(':'));
export function faceInfo(k) { const id = itemOf(k), n = +k.slice(k.lastIndexOf(':') + 1), e = data && data.items[id]; const f = e && e.f && e.f[n]; return f ? { key: k, itemId: id, b: f.b, s: f.s, t: f.t, c: f.c } : null; }
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
  for (const k of p.faces) { const f = faceInfo(k); if (!f || !ok(f.itemId)) continue; const s = f.s * Math.sqrt(f.b[2] * f.b[3]) * (f.c ? .8 : 1); if (s > bs) { bs = s; best = f; } }
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
