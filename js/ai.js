// Velvet on-device AI: smart search, auto-tags, duplicates & similar.
// Everything runs locally (Web Worker + WASM/WebGPU). Embeddings live in an encrypted sidecar record
// (same AES-GCM key as the library); tags live in the encrypted library index. Nothing leaves the device.
import * as Store from './store.js';
import { grabFrames, analyzeImage, hamming } from './vision.js';
import { imageThumb } from './thumbs.js';
export const MODEL = 'mobileclip_s0@fp16v/q8t#1';
export const MODEL_MB = 93;          // vision fp16 22.9 MB + text q8 42.8 MB (+ 27 MB runtime, shared)
let worker = null, seq = 0; const pend = new Map(); let device = null;
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); if (e.data.device) device = e.data.device; e.data.ok ? p.res(e.data) : p.rej(new Error(e.data.error)); };
  worker.onerror = e => { for (const p of pend.values()) p.rej(new Error(e.message || 'AI worker failed')); pend.clear(); worker = null; };
  return worker;
}
// Free the model's memory (important on iPhone) when the AI has been idle for a while; it reloads on demand in ~1-2 s.
const IDLE_MS = 45000; let idleT = null;
let extBusy = false; export function setBusy(b) { extBusy = !!b; if (!b) armIdle(); }   // People indexing keeps the worker warm
function armIdle() { clearTimeout(idleT); idleT = setTimeout(() => { if (worker && !running && !extBusy && !pend.size) { worker.terminate(); worker = null; } }, IDLE_MS); }
function call(msg, transfer) { const w = ensureWorker(); clearTimeout(idleT); return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res: v => { res(v); armIdle(); }, rej: e => { rej(e); armIdle(); } }); w.postMessage({ ...msg, id }, transfer || []); }); }
export const workerLoaded = () => !!worker;
export const workerCall = (msg, transfer) => call(msg, transfer);
export const deviceName = () => device;
export function shutdown() { clearTimeout(idleT); if (worker) worker.terminate(); worker = null; for (const p of pend.values()) p.rej(new Error('stopped')); pend.clear(); data = null; vecs.clear(); textCache.clear(); running = false; }

/* ---------- vocabulary (precomputed text embeddings for auto-tags; not user data) ---------- */
let vocab = null;
// Age-related labels are never produced (auto-tags, smart albums, chapter names), whatever vocabulary file is cached.
export const BLOCKED_TAGS = new Set(['child', 'children', 'kid', 'kids', 'baby', 'babies', 'toddler', 'toddlers', 'infant', 'infants', 'teen', 'teens', 'teenager', 'teenagers',
  'minor', 'minors', 'boy', 'boys', 'girl', 'girls', 'youth', 'elderly', 'senior', 'seniors', 'adult', 'adults']);
export const isBlockedTag = t => BLOCKED_TAGS.has(String(t || '').trim().toLowerCase());
export const hasBlockedWord = s => String(s || '').toLowerCase().split(/[^a-z]+/).some(w => BLOCKED_TAGS.has(w));
async function loadVocab() {
  if (vocab) return vocab;
  const j = await (await fetch(new URL('../models/velvet-vocab-v2.json', import.meta.url))).json();
  const raw = Uint8Array.from(atob(j.emb), c => c.charCodeAt(0));
  const E0 = new Float32Array(raw.buffer), keep = j.tags.map((t, i) => i).filter(i => !isBlockedTag(j.tags[i][0]));
  const E = new Float32Array(keep.length * j.dim); keep.forEach((i, k) => E.set(E0.subarray(i * j.dim, (i + 1) * j.dim), k * j.dim));
  vocab = { tags: keep.map(i => j.tags[i]), E, dim: j.dim }; return vocab;
}

/* ---------- encrypted AI sidecar ---------- */
let data = null; const vecs = new Map();   // id -> [{q:Int8Array, s:number}]
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function quant(v) { let m = 0; for (const x of v) m = Math.max(m, Math.abs(x)); const s = (m || 1) / 127, q = new Int8Array(v.length); for (let i = 0; i < v.length; i++) q[i] = Math.round(v[i] / s); return { q, s }; }
function decodeEntry(id, e) { const raw = new Int8Array(unb64(e.e).buffer), out = []; for (let k = 0; k < e.s.length; k++) out.push({ q: raw.subarray(k * 512, (k + 1) * 512), s: e.s[k] }); vecs.set(id, out); }
export async function open(idx) {
  if (data) return data;
  const m = idx.settings.ai || {};
  if (m.file && m.model === MODEL) { try { const b = await Store.readFile(m.file.id, m.file.chunks, 'application/json'); data = JSON.parse(await b.text()); } catch (e) { console.warn('AI data unreadable, rebuilding', e); } }
  if (!data || data.model !== MODEL) data = { v: 1, model: MODEL, items: {} };
  vecs.clear(); for (const [id, e] of Object.entries(data.items)) if (e.e) decodeEntry(id, e);
  return data;
}
export async function persist(idx) {
  if (!data) return;
  const m = idx.settings.ai = idx.settings.ai || {}; const old = m.file, id = old && old.id === 'ai_a' ? 'ai_b' : 'ai_a';
  const r = await Store.putFile(id, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  m.file = { id, chunks: r.chunks, stored: r.stored }; m.model = MODEL; m.updated = Date.now();
  await Store.saveIndex(idx); if (old && old.id !== id) await Store.deleteFile(old.id).catch(() => { });
}
export async function wipe(idx) {
  const m = idx.settings.ai; if (m && m.file) await Store.deleteFile(m.file.id).catch(() => { });
  idx.items.forEach(i => { delete i.aiTags; delete i.aiRej; });
  idx.settings.ai = { on: false }; data = { v: 1, model: MODEL, items: {} }; vecs.clear(); await Store.saveIndex(idx);
}
export const stats = idx => ({ indexed: data ? idx.items.filter(i => data.items[i.id]).length : 0, total: idx.items.length, bytes: (idx.settings.ai && idx.settings.ai.file && idx.settings.ai.file.stored) || 0 });
export function forget(ids) { if (!data) return; ids.forEach(id => { delete data.items[id]; vecs.delete(id); }); }

/* ---------- maths ---------- */
function dotQ(f32, e) { let s = 0; const q = e.q; for (let i = 0; i < 512; i++) s += f32[i] * q[i]; return s * e.s; }
function dotQQ(a, b) { let s = 0; const x = a.q, y = b.q; for (let i = 0; i < 512; i++) s += x[i] * y[i]; return s * a.s * b.s; }
function meanVec(list) { const m = new Float32Array(512); for (const e of list) for (let i = 0; i < 512; i++) m[i] += e.q[i] * e.s; let n = 0; for (const x of m) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < 512; i++) m[i] /= n; return m; }

/* ---------- auto-tags ---------- */
export function zeroShot(mean, { minSim = .16, minZ = 2.2, max = 5 } = {}) {
  const { tags, E } = vocab, N = tags.length, s = new Float32Array(N);
  for (let i = 0; i < N; i++) { let d = 0; for (let j = 0; j < 512; j++) d += mean[j] * E[i * 512 + j]; s[i] = d; }
  let m = 0; for (const x of s) m += x; m /= N; let v = 0; for (const x of s) v += (x - m) ** 2; const sd = Math.sqrt(v / N) || 1;
  return [...s].map((x, i) => [tags[i][0], x, (x - m) / sd]).filter(t => t[1] >= minSim && t[2] >= minZ).sort((a, b) => b[1] - a[1]).slice(0, max).map(t => t[0]);
}

/* ---------- indexing ---------- */
let running = false, stopFlag = false;
export const isRunning = () => running;
export function stop() { stopFlag = true; }
const waitVisible = () => document.hidden ? new Promise(r => { const f = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', f); r(); } }; document.addEventListener('visibilitychange', f); }) : null;
/* ctx: { idx, thumbBlob(it), fileBlob(it), maxVideoBytes, onProgress({done,total,item,msPer}), onItem(it) } */
export async function indexLibrary(ctx) {
  if (running) return; running = true; stopFlag = false;
  try {
    const { idx } = ctx; await open(idx); await loadVocab();
    const todo = idx.items.filter(i => !data.items[i.id]); let done = 0, t0 = performance.now(), dirty = 0;
    ctx.onProgress && ctx.onProgress({ done, total: todo.length, phase: 'loading' });
    await call({ type: 'init', text: false, vision: true });
    for (const it of todo) {
      if (stopFlag || !Store.isUnlocked()) break;
      const w = waitVisible(); if (w) { ctx.onProgress && ctx.onProgress({ done, total: todo.length, phase: 'paused' }); await w; }   // pause while hidden
      if (!idx.items.includes(it)) continue;
      try {
        let thumb = await ctx.thumbBlob(it);
        if (!thumb && it.type === 'photo') { const f = await ctx.fileBlob(it); const th = await imageThumb(f, it.mime).catch(() => null); thumb = th && th.blob; }
        const list = [];
        if (thumb) { const r = await call({ type: 'image', blob: thumb }); list.push(quant(r.vec)); }
        if (it.type === 'video' && it.size <= ctx.maxVideoBytes) {
          try { const f = await ctx.fileBlob(it); const fr = await grabFrames(f, { fractions: [.2, .5, .8], max: 320, budget: 6000 });
            for (const x of fr) { const r = await call({ type: 'image', blob: x.blob }); list.push(quant(r.vec)); } } catch (e) { console.warn('frames', it.name, e); }
        }
        const an = thumb ? await analyzeImage(thumb).catch(() => null) : null;
        if (!list.length && !an) { data.items[it.id] = { s: [], n: 0, none: 1 }; }
        else {
          const raw = new Int8Array(list.length * 512); list.forEach((e, k) => raw.set(e.q, k * 512));
          data.items[it.id] = { e: b64(new Uint8Array(raw.buffer)), s: list.map(e => e.s), ph: an && an.ph, q: an && an.q };
          vecs.set(it.id, list);
          const tags = list.length ? zeroShot(meanVec(list)) : [];
          if (an) { if (an.bw) { if (!tags.includes('black & white')) tags.push('black & white'); } else an.colors.forEach(c => tags.push(c)); }
          const rej = new Set(it.aiRej || []), mine = new Set(it.tags || []);
          it.aiTags = [...new Set(tags)].filter(t => !rej.has(t) && !mine.has(t) && !isBlockedTag(t)).slice(0, 7);
        }
      } catch (e) { console.warn('AI index failed', it.name, e); data.items[it.id] = { s: [], n: 0, none: 1, err: String(e.message || e).slice(0, 80) }; }
      done++; dirty++;
      ctx.onItem && ctx.onItem(it);
      ctx.onProgress && ctx.onProgress({ done, total: todo.length, phase: 'indexing', msPer: (performance.now() - t0) / done, device });
      if (dirty >= 8) { await persist(idx); dirty = 0; }
    }
    if (dirty) await persist(idx);
    ctx.onProgress && ctx.onProgress({ done, total: todo.length, phase: 'done', msPer: done ? (performance.now() - t0) / done : 0, device });
  } finally { running = false; }
}

/* ---------- smart search ---------- */
const textCache = new Map();
export async function embedText(q) {
  if (textCache.has(q)) return textCache.get(q);
  const r = await call({ type: 'text', texts: ['a photo of ' + q] }); const v = r.vecs[0];
  textCache.set(q, v); if (textCache.size > 50) textCache.delete(textCache.keys().next().value); return v;
}
export const hasIndex = () => vecs.size > 0;
/* returns [[id, sim]] above an adaptive threshold, best first */
export async function search(q, ids) {
  if (!vecs.size) return [];
  const t = await embedText(q); const out = [];
  for (const id of ids) { const l = vecs.get(id); if (!l || !l.length) continue; let b = -1; for (const e of l) b = Math.max(b, dotQ(t, e)); out.push([id, b]); }
  out.sort((a, b) => b[1] - a[1]); if (!out.length) return out;
  const thr = Math.max(.165, out[0][1] - .08);
  return out.filter(x => x[1] >= thr).slice(0, 200);
}



/* chapter labels (v1.3): embed a few frames on-device and name each with its best vocabulary tag */
const LABEL_SKIP = new Set(['indoor', 'outdoor', 'screenshot', 'document', 'close-up', 'bokeh', 'vintage', 'aerial', 'silhouette', 'low light', 'smiling', 'man', 'woman', 'sky', 'clouds', 'travel']);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
export async function labelFrames(blobs) {
  await loadVocab(); const out = [];
  try { await withTimeout(call({ type: 'init', text: false, vision: true }), 120000); } catch (e) { return blobs.map(() => ({ label: null, tags: [], vec: null })); }
  for (const b of blobs) {
    try {
      const r = await withTimeout(call({ type: 'image', blob: b }), 30000), v = r.vec, q = quant(v);
      const tags = zeroShot(meanVec([q]), { minSim: .14, minZ: 1.6, max: 8 }).filter(t => !LABEL_SKIP.has(t));
      out.push({ label: tags[0] || null, tags: tags.slice(0, 3), vec: v });
    } catch (e) { out.push({ label: null, tags: [], vec: null }); }
  }
  return out;
}

/* ---------- helpers for smart albums / best shots / rules (batch 2) ---------- */
export const entryOf = id => (data && data.items[id]) || null;
export function itemVec(id) { const l = vecs.get(id); return l && l.length ? meanVec(l) : null; }
export const dot = (a, b) => { let s = 0; for (let i = 0; i < 512; i++) s += a[i] * b[i]; return s; };
export async function vocabInfo() { await loadVocab(); return vocab; }
export function tagVec(tag) { if (!vocab) return null; const i = vocab.tags.findIndex(t => t[0] === tag); return i < 0 ? null : vocab.E.subarray(i * 512, i * 512 + 512); }
/* per-item absolute match for rules: query must score like one of the image's top tags (same test as auto-tags) */
export async function matchQuery(q, ids, { minSim = .17, minZ = 2 } = {}) {
  if (!vecs.size) return []; await loadVocab(); const t = await embedText(q), { E, tags } = vocab, N = tags.length, out = [];
  for (const id of ids) {
    const v = itemVec(id); if (!v) continue; const sq = dot(t, v); if (sq < minSim) continue;
    let m = 0, m2 = 0; for (let i = 0; i < N; i++) { let d = 0; for (let j = 0; j < 512; j++) d += v[j] * E[i * 512 + j]; m += d; m2 += d * d; }
    m /= N; const sd = Math.sqrt(Math.max(1e-6, m2 / N - m * m)); if ((sq - m) / sd >= minZ) out.push([id, sq]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/* ---------- duplicates & similar ---------- */
/* returns { dupes: [[id...]], similar: [[id...]] }; yields to keep the UI responsive */
export async function findGroups(items, { onProgress } = {}) {
  const L = items.filter(i => data && data.items[i.id] && (data.items[i.id].ph || vecs.get(i.id)));
  const n = L.length, pa = new Int32Array(n).map((_, i) => i), pb = new Int32Array(n).map((_, i) => i);
  const find = (p, x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }, uni = (p, a, b) => { a = find(p, a); b = find(p, b); if (a !== b) p[b] = a; };
  for (let i = 0; i < n; i++) {
    const A = L[i], ea = data.items[A.id], va = vecs.get(A.id);
    for (let j = i + 1; j < n; j++) {
      const B = L[j]; if (A.type !== B.type) continue;
      if (A.type === 'video' && Math.abs((A.dur || 0) - (B.dur || 0)) > 1.5) continue;
      const eb = data.items[B.id], vb = vecs.get(B.id);
      const ham = hamming(ea.ph, eb.ph), cos = va && va.length && vb && vb.length ? dotQQ(va[0], vb[0]) : 0;
      if (ham <= 10 && (cos === 0 || cos >= .9) || cos >= .975) uni(pa, i, j);
      else if (cos >= .9) uni(pb, i, j);
    }
    if (i % 64 === 63) { onProgress && onProgress(i / n); await new Promise(r => setTimeout(r)); }
  }
  const groups = p => { const m = new Map(); for (let i = 0; i < n; i++) { const r = find(p, i); if (!m.has(r)) m.set(r, []); m.get(r).push(L[i].id); } return [...m.values()].filter(g => g.length > 1); };
  const dupes = groups(pa), inDupe = new Map(); dupes.forEach((g, k) => g.forEach(id => inDupe.set(id, k)));
  // similar groups: show each duplicate set once (its first member) and drop groups that are only one duplicate set
  const similar = groups(pb).map(g => { const seen = new Set(); return g.filter(id => { const k = inDupe.has(id) ? 'd' + inDupe.get(id) : id; if (seen.has(k)) return false; seen.add(k); return true; }); }).filter(g => g.length > 1);
  return { dupes, similar };
}
/* keep-best ranking: resolution first, then visual quality, then file size */
export function quality(it) { const e = data && data.items[it.id]; return Math.log2(Math.max(1, (it.w || 1) * (it.h || 1))) + .15 * ((e && e.q) || 0) + (it.size || 0) / 5e8; }
