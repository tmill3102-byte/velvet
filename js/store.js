// Velvet encrypted storage: IndexedDB + WebCrypto (AES-256-GCM, PBKDF2-SHA256).
// Every file is split into 1 MiB chunks; each chunk is encrypted with a random IV and
// authenticated with "fileId:chunkIndex" as additional data. The library index (titles,
// tags, collections...) is encrypted the same way. A random data key (DEK) is wrapped
// with a key derived from the passcode, so the passcode can be changed without re-encrypting.
const DB_NAME = 'velvet', DB_VER = 1;
export const CHUNK = 1024 * 1024;
const ITER = 600000;
const te = new TextEncoder(), td = new TextDecoder();
let db = null, dek = null;

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function txDone(t) { return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); }); }
export async function open() {
  if (db) return db;
  db = await new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return db;
}
async function metaGet(k) { await open(); return req(db.transaction('meta').objectStore('meta').get(k)); }
async function metaPut(k, v) { await open(); const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').put(v, k); return txDone(t); }

const rnd = n => crypto.getRandomValues(new Uint8Array(n));
async function kekFrom(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const importDek = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
async function enc(key, data, aad) { const iv = rnd(12); const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, data); return { iv, data: out }; }
async function dec(key, rec, aad) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv, additionalData: te.encode(aad) }, key, rec.data); }

export async function isSetUp() { return !!(await metaGet('keys')); }
export const isUnlocked = () => !!dek;
export function lock() { dek = null; }

export async function setup(pass) {
  const salt = rnd(16), raw = rnd(32);
  const kek = await kekFrom(pass, salt, ITER);
  const w = await enc(kek, raw, 'velvet-dek-v1');
  await metaPut('keys', { v: 1, salt, iter: ITER, wiv: w.iv, wrapped: w.data });
  dek = await importDek(raw); raw.fill(0);
  await saveIndex(emptyIndex());
}
export function emptyIndex() { return { v: 1, items: [], collections: [], settings: { autolock: true, autolockMin: 1, lockOnHide: false, hide: true, vaultPin: null }, created: Date.now() }; }

async function unwrap(pass, keys) {
  const kek = await kekFrom(pass, keys.salt, keys.iter);
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: keys.wiv, additionalData: te.encode('velvet-dek-v1') }, kek, keys.wrapped)); }
  catch (e) { return null; }
}
export async function unlock(pass) {
  const keys = await metaGet('keys'); if (!keys) throw new Error('not set up');
  const raw = await unwrap(pass, keys); if (!raw) return false;
  dek = await importDek(raw); raw.fill(0); return true;
}
export async function changePasscode(oldP, newP) {
  const keys = await metaGet('keys'); const raw = await unwrap(oldP, keys); if (!raw) return false;
  const salt = rnd(16); const kek = await kekFrom(newP, salt, ITER); const w = await enc(kek, raw, 'velvet-dek-v1'); raw.fill(0);
  await metaPut('keys', { v: 1, salt, iter: ITER, wiv: w.iv, wrapped: w.data }); return true;
}
export async function loadIndex() {
  const rec = await metaGet('index'); if (!rec) return emptyIndex();
  return JSON.parse(td.decode(await dec(dek, rec, 'velvet-index-v1')));
}
let saving = Promise.resolve();
export function saveIndex(index) {
  saving = saving.then(async () => { const rec = await enc(dek, te.encode(JSON.stringify(index)), 'velvet-index-v1'); await metaPut('index', rec); });
  return saving;
}

// Encrypt a File/Blob into chunks. Reads 1 MiB at a time so memory stays small.
export async function putFile(id, blob, onProgress) {
  const n = Math.max(1, Math.ceil(blob.size / CHUNK)); let stored = 0;
  for (let i = 0; i < n; i++) {
    const part = await blob.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer();
    const rec = await enc(dek, part, id + ':' + i);
    const t = db.transaction('chunks', 'readwrite'); t.objectStore('chunks').put(rec, [id, i]); await txDone(t);
    stored += rec.data.byteLength + 12; onProgress && onProgress((i + 1) / n);
  }
  return { chunks: n, stored };
}
export async function readFile(id, n, type, onProgress) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const rec = await req(db.transaction('chunks').objectStore('chunks').get([id, i]));
    if (!rec) throw new Error('Missing data for ' + id);
    parts.push(await dec(dek, rec, id + ':' + i)); onProgress && onProgress((i + 1) / n);
  }
  return new Blob(parts, { type: type || 'application/octet-stream' });
}
// Decrypt only the chunks covering [start, start+len) of a stored file (fixed CHUNK-size parts).
// Lets previews read a video's index + one keyframe without decrypting the whole file into memory.
export function rangeReader(id, n, size) {
  const cache = new Map();
  const chunk = async i => {
    if (cache.has(i)) return cache.get(i);
    const rec = await req(db.transaction('chunks').objectStore('chunks').get([id, i]));
    if (!rec) throw new Error('Missing data for ' + id);
    const u = new Uint8Array(await dec(dek, rec, id + ':' + i));
    cache.set(i, u); if (cache.size > 3) cache.delete(cache.keys().next().value); return u;
  };
  return {
    size,
    async read(start, len) {
      len = Math.max(0, Math.min(len, size - start)); const out = new Uint8Array(len); let w = 0;
      for (let i = Math.floor(start / CHUNK); w < len && i < n; i++) {
        const u = await chunk(i), s = Math.max(0, start + w - i * CHUNK), e = Math.min(u.length, start + len - i * CHUNK);
        out.set(u.subarray(s, e), w); w += e - s;
      }
      return w === len ? out : out.subarray(0, w);
    },
  };
}
export async function deleteFile(id) {
  await open(); const t = db.transaction('chunks', 'readwrite');
  t.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Infinity])); return txDone(t);
}
export async function wipe() {
  dek = null; await open(); const t = db.transaction(['meta', 'chunks'], 'readwrite');
  t.objectStore('meta').clear(); t.objectStore('chunks').clear(); return txDone(t);
}
export async function vaultHash(pin, saltB64) {
  const salt = saltB64 ? b64d(saltB64) : rnd(16);
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200000 }, base, 256);
  return { salt: b64(salt), hash: b64(new Uint8Array(bits)) };
}

// ---------- backup (.velvet) ----------
// Layout: "VELVETBK1\n" | u32 headerLen | header JSON | for every chunk: u32 len | 12-byte IV | ciphertext
// Chunks stay encrypted with the library key, so a backup is only readable with the passcode.
const MAGIC = 'VELVETBK1\n';
export const b64 = u => { u = new Uint8Array(u); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
export const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
export async function exportBackup(files, write, onProgress) {
  const keys = await metaGet('keys'), idx = await metaGet('index');
  const header = { v: 1, created: Date.now(), keys: { salt: b64(keys.salt), iter: keys.iter, wiv: b64(keys.wiv), wrapped: b64(keys.wrapped) }, index: { iv: b64(idx.iv), data: b64(idx.data) }, files };
  const hb = te.encode(JSON.stringify(header));
  await write(te.encode(MAGIC)); await write(u32(hb.length)); await write(hb);
  const total = files.reduce((a, f) => a + f.n, 0); let done = 0;
  for (const f of files) for (let i = 0; i < f.n; i++) {
    const rec = await req(db.transaction('chunks').objectStore('chunks').get([f.id, i]));
    if (!rec) throw new Error('Missing chunk ' + f.id);
    await write(u32(12 + rec.data.byteLength)); await write(new Uint8Array(rec.iv)); await write(new Uint8Array(rec.data));
    onProgress && onProgress(++done / total);
  }
}
async function readAt(file, pos, len) { return new Uint8Array(await file.slice(pos, pos + len).arrayBuffer()); }
export async function readBackupHeader(file) {
  const m = td.decode(await readAt(file, 0, MAGIC.length)); if (m !== MAGIC) throw new Error('This is not a Velvet backup file.');
  const len = new DataView((await readAt(file, MAGIC.length, 4)).buffer).getUint32(0);
  const header = JSON.parse(td.decode(await readAt(file, MAGIC.length + 4, len)));
  return { header, offset: MAGIC.length + 4 + len };
}
export async function restoreBackup(file, pass, onProgress) {
  const { header, offset } = await readBackupHeader(file);
  const keys = { v: 1, salt: b64d(header.keys.salt), iter: header.keys.iter, wiv: b64d(header.keys.wiv), wrapped: b64d(header.keys.wrapped) };
  const raw = await unwrap(pass, keys); if (!raw) return false;
  const key = await importDek(raw); raw.fill(0);
  // verify index decrypts before touching current data
  const idxRec = { iv: b64d(header.index.iv), data: b64d(header.index.data) };
  await dec(key, idxRec, 'velvet-index-v1');
  await wipe(); await open();
  let pos = offset; const total = header.files.reduce((a, f) => a + f.n, 0); let done = 0;
  for (const f of header.files) for (let i = 0; i < f.n; i++) {
    const len = new DataView((await readAt(file, pos, 4)).buffer).getUint32(0); pos += 4;
    const blob = await readAt(file, pos, len); pos += len;
    const t = db.transaction('chunks', 'readwrite'); t.objectStore('chunks').put({ iv: blob.slice(0, 12), data: blob.slice(12).buffer }, [f.id, i]); await txDone(t);
    onProgress && onProgress(++done / total);
  }
  await metaPut('keys', keys); await metaPut('index', idxRec);
  dek = key; return true;
}
// Used by tests: list raw records to prove nothing is stored in the clear.
export async function _rawSample() { await open(); const r = await req(db.transaction('chunks').objectStore('chunks').getAll(undefined, 3)); return r.map(x => new Uint8Array(x.data).slice(0, 16)); }
