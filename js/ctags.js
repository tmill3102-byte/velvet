// Velvet v1.6: custom AI tags + built-in tag aliases. Everything here runs on this device over the encrypted AI index;
// tag definitions live in the encrypted library index (idx.settings.ctags / idx.settings.tagAlias), so they're in backups.
import * as AI from './ai.js';

export const MAX_EX = 40;
export const clean = s => String(s || '').trim().replace(/\s+/g, ' ');
// plain-language validation for anything the user names (custom tags, phrases, renames)
export function checkName(name, { phrase = '', others = [], self = null } = {}) {
  const n = clean(name);
  if (!n) return 'Give the tag a name.';
  if (n.length > 40) return 'Keep the name under 40 characters.';
  if (AI.blockedTerm(n) || AI.blockedTerm(phrase)) return AI.BLOCKED_MSG;
  if (others.some(o => o !== self && o.toLowerCase() === n.toLowerCase())) return `There’s already a tag called “${n}”.`;
  return null;
}

const norm = v => { let n = 0; for (let i = 0; i < 512; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; const o = new Float32Array(512); for (let i = 0; i < 512; i++) o[i] = v[i] / n; return o; };
function centroid(ids) {
  const m = new Float32Array(512); let k = 0;
  for (const id of ids) { const v = AI.itemVec(id); if (!v) continue; for (let i = 0; i < 512; i++) m[i] += v[i]; k++; }
  return k ? norm(m) : null;
}
// query vector: MobileCLIP text embedding of the phrase (or name) blended with the centroid of the example photos
export async function model(t) {
  const posC = centroid(t.pos || []), negC = centroid(t.neg || []);
  const text = !posC || clean(t.phrase) ? norm(await AI.embedText(clean(t.phrase) || clean(t.name))) : null;
  let q;
  if (text && posC) { q = new Float32Array(512); const wt = (t.pos || []).length >= 6 ? .35 : .5; for (let i = 0; i < 512; i++) q[i] = wt * text[i] * 3 + (1 - wt) * posC[i]; q = norm(q); }  // text sims run ~3x lower than image sims
  else q = text || posC;
  return { q, posC, negC };
}
// library-wide score distribution -> z-scores, so text, photo and mixed tags share one scale
function scores(m, ids) {
  const out = new Map(); let s = 0, s2 = 0, n = 0;
  for (const id of ids) { const v = AI.itemVec(id); if (!v) continue; const x = AI.dot(m.q, v); out.set(id, x); s += x; s2 += x * x; n++; }
  const mean = n ? s / n : 0, sd = n ? Math.sqrt(Math.max(1e-6, s2 / n - mean * mean)) : 1;
  return { out, mean, sd };
}
// threshold from the examples: just under the weakest positive, and above the strongest "not this"
export function calibrate(t, S) {
  const z = id => S.out.has(id) ? (S.out.get(id) - S.mean) / S.sd : null;
  const zp = (t.pos || []).map(z).filter(x => x != null).sort((a, b) => a - b), zn = (t.neg || []).map(z).filter(x => x != null).sort((a, b) => b - a);
  let thr = 2;                                                 // text only: like built-in auto-tags
  if (zp.length) thr = Math.min(3, Math.max(.9, zp[Math.floor(zp.length * .15)] - .3));
  if (zn.length) { const hi = zn[0] + .1; thr = zp.length && hi > zp[0] ? Math.max(thr, (zn[0] + zp[0]) / 2) : Math.max(thr, hi); }
  return +thr.toFixed(3);
}
// sensitivity 0..1 (default .5) moves the cut-off by up to ±1 standard deviation
export const effThr = t => (t.thr != null ? t.thr : 2) + (.5 - (t.sens != null ? t.sens : .5)) * 2;
// -> { ids: matching item ids (best first), z: Map id->z, thr }
export async function run(t, ids) {
  const m = await model(t); if (!m.q) return { ids: [], z: new Map(), thr: 0 };
  const S = scores(m, ids); t.thr = calibrate(t, S); const thr = effThr(t), z = new Map(), hit = [];
  const pos = new Set(t.pos || []), neg = new Set(t.neg || []);
  for (const [id, x] of S.out) {
    const zz = (x - S.mean) / S.sd; z.set(id, zz);
    if (neg.has(id)) continue;
    if (pos.has(id)) { hit.push([id, 99]); continue; }
    if (zz < thr) continue;
    if (m.negC) { const v = AI.itemVec(id), dn = AI.dot(m.negC, v); if (m.posC ? dn > AI.dot(m.posC, v) : dn > .9) continue; }   // closer to the "not this" examples
    hit.push([id, zz]);
  }
  hit.sort((a, b) => b[1] - a[1]);
  return { ids: hit.map(h => h[0]), z, thr };
}
// review queue: suggestions the user hasn't confirmed, least certain first
export const reviewQueue = (t, res, max = 24) => res.ids.filter(id => !(t.pos || []).includes(id)).sort((a, b) => (res.z.get(a) || 0) - (res.z.get(b) || 0)).slice(0, max);
export function confirm(t, id, yes) {
  t.pos = (t.pos || []).filter(x => x !== id); t.neg = (t.neg || []).filter(x => x !== id);
  (yes ? t.pos : t.neg).push(id); if (t.pos.length > MAX_EX) t.pos.shift(); if (t.neg.length > MAX_EX) t.neg.shift();
  t.reviewed = (t.reviewed || 0) + 1;
}

/* ---------- built-in tag aliases: rename, hide, merge (applied in the UI, albums, search and rules) ---------- */
// alias map: rawTag -> { name?, hidden?, into? (another raw tag) }
export function makeView(alias = {}, ctags = []) {
  const canon = t => { let k = t, guard = 0; while (alias[k] && alias[k].into && guard++ < 8) k = alias[k].into; return k; };
  const show = t => { const k = canon(t); const a = alias[k]; return a && a.hidden ? null : (a && a.name) || k; };
  const ctById = new Map(ctags.map(c => [c.id, c]));
  return {
    canon, show,
    hidden: t => { const k = canon(t); return !!(alias[k] && alias[k].hidden); },
    // display names of an item's AI tags (built-in, aliased; hidden removed) and custom tags
    ai: it => [...new Set((it.aiTags || []).map(show).filter(Boolean))],
    custom: it => (it.ct || []).map(id => ctById.get(id)).filter(c => c && !c.hidden).map(c => c.name),
    all: it => new Set([...(it.tags || []), ...(it.aiTags || []).map(show).filter(Boolean), ...(it.ct || []).map(id => ctById.get(id)).filter(c => c && !c.hidden).map(c => c.name)]),
  };
}
