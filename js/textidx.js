// Velvet v1.7: encrypted text index for speech transcripts and text found in photos.
// Each kind is one JSON document stored as an encrypted file (like the AI index), referenced from the encrypted
// library index, so it is included in backups and never stored in the clear.
import * as Store from './store.js';
const FILES = { speech: ['sp_a', 'sp_b'], ocr: ['oc_a', 'oc_b'] };
const D = { speech: null, ocr: null };
export async function open(idx, kind) {
  if (D[kind]) return D[kind];
  const m = idx.settings[kind] || {};
  if (m.file) { try { D[kind] = JSON.parse(await (await Store.readFile(m.file.id, m.file.chunks, 'application/json')).text()); } catch (e) { console.warn(kind + ' data unreadable', e); } }
  if (!D[kind] || !D[kind].items) D[kind] = { v: 1, items: {} };
  return D[kind];
}
export const isOpen = kind => !!D[kind];
export const get = (kind, id) => D[kind] ? D[kind].items[id] : undefined;
export function set(kind, id, val) { if (D[kind]) D[kind].items[id] = val; }
export function forget(ids) { for (const k of Object.keys(D)) if (D[k]) ids.forEach(id => delete D[k].items[id]); }
export const count = (kind, ids) => D[kind] ? ids.filter(id => D[kind].items[id]).length : 0;
export async function persist(idx, kind) {
  if (!D[kind]) return;
  const m = idx.settings[kind] = idx.settings[kind] || {}; const old = m.file, [a, b] = FILES[kind], id = old && old.id === a ? b : a;
  const r = await Store.putFile(id, new Blob([JSON.stringify(D[kind])], { type: 'application/json' }));
  m.file = { id, chunks: r.chunks, stored: r.stored }; m.updated = Date.now();
  await Store.saveIndex(idx); if (old && old.id !== id) await Store.deleteFile(old.id).catch(() => { });
}
export async function wipe(idx, kind) {
  const m = idx.settings[kind]; if (m && m.file) await Store.deleteFile(m.file.id).catch(() => { });
  idx.settings[kind] = { on: false }; D[kind] = { v: 1, items: {} }; await Store.saveIndex(idx);
}
export function close() { D.speech = null; D.ocr = null; }
// lower-case searchable text of an item (photo text + what's said)
export function textOf(id) {
  let s = ''; const o = get('ocr', id), t = get('speech', id);
  if (o && o.text) s += ' ' + o.text; if (t && t.segs) s += ' ' + t.segs.map(x => x[2]).join(' ');
  return s.toLowerCase();
}
// timestamped transcript hits for a query: [{id, t, text}] (best segment per word set)
export function spokenHits(q, okId) {
  const out = []; if (!D.speech || !q) return out; const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  for (const [id, e] of Object.entries(D.speech.items)) {
    if (!e.segs || !e.segs.length || (okId && !okId(id))) continue;
    const all = e.segs.map(s => s[2]).join(' ').toLowerCase(); if (!ws.every(w => all.includes(w))) continue;
    let best = null, bs = -1;
    e.segs.forEach((s, i) => { const win = (s[2] + ' ' + ((e.segs[i + 1] || [])[2] || '')).toLowerCase(); const sc = ws.filter(w => win.includes(w)).length; if (sc > bs) { bs = sc; best = s; } });
    out.push({ id, t: best[0], text: best[2] });
  }
  return out;
}
