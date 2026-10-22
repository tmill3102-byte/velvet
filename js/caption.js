// Velvet v1.8 search descriptions: a short caption per photo and per video preview frame, made on this device
// (Florence-2 in caption-worker.js). Captions are cleaned of age-related words before they are stored or used,
// with the same word list as tags (ai.js BLOCKED_TAGS / blockedTerm). They are never used to make tags or albums.
import { blockedTerm } from './ai.js';
export const SIZE = 768;                                       // Florence-2's input size
let w = null, seq = 0, pref = null; const pend = new Map();
function worker() {
  if (w) return w;
  w = new Worker(new URL('./caption-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data: m }) => { const p = pend.get(m.id); if (!p) return; pend.delete(m.id); m.ok ? p.res(m) : p.rej(new Error(m.error)); };
  w.onerror = e => { e.preventDefault && e.preventDefault(); const err = new Error(e.message || 'the caption model stopped'); for (const p of pend.values()) p.rej(err); pend.clear(); try { w.terminate(); } catch (_) { } w = null; };
  return w;
}
function call(msg, transfer = []) { return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); worker().postMessage({ ...msg, id, pref }, transfer); }); }
export function setDevice(d) { pref = d; }
export function shutdown() { if (w) { try { w.terminate(); } catch (e) { } w = null; } for (const p of pend.values()) { const e = new Error('stopped'); e.cancelled = true; p.rej(e); } pend.clear(); }
export const load = () => call({ type: 'load' });
// image blob -> raw caption (not cleaned)
export async function describe(blob) {
  const src = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = c.height = SIZE; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, SIZE, SIZE); src.close && src.close();
  const bmp = await createImageBitmap(c);
  return (await call({ type: 'describe', bmp }, [bmp])).text;
}
const PEOPLE_PL = new Set(['children', 'kids', 'kiddos', 'kiddies', 'babies', 'toddlers', 'infants', 'newborns', 'teens', 'teenagers', 'preteens', 'tweens', 'minors', 'juveniles', 'adolescents', 'youngsters', 'youths', 'boys', 'girls', 'gurls', 'schoolgirls', 'schoolboys', 'adults', 'seniors']);
const PEOPLE_SG = new Set(['child', 'kid', 'kiddo', 'kiddie', 'baby', 'toddler', 'infant', 'newborn', 'teen', 'teenager', 'preteen', 'tween', 'minor', 'juvenile', 'adolescent', 'youngster', 'youth', 'boy', 'girl', 'gurl', 'schoolgirl', 'schoolboy', 'loli', 'lolita', 'shota', 'adult', 'senior']);
const POSS = new Set(['her', 'his', 'their', 'my', 'your', 'our', 'its']);
const STEMS = ['children', 'school', 'kids', 'child', 'babies', 'baby', 'teens', 'teen', 'girls', 'girl', 'boys', 'boy', 'kid'];
const PLACE = { school: 'building', schools: 'buildings', preschool: 'building', kindergarten: 'building', schoolyard: 'yard', schoolhouse: 'building' };
const SOFT = new Set(['little', 'small', 'tiny', 'young', 'cute', 'lil']);
// Remove or neutralise age-related words: "a little girl on a swing" -> "a person on a swing".
// Returns { text, changed }. Text is '' if nothing sensible is left.
export function clean(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 300); if (!s) return { text: '', changed: false };
  const toks = s.split(' '); let changed = false; const out = [];
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti], last = ti === toks.length - 1;
    const m = t.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/), core = m[2], low = core.toLowerCase().replace(/['’]s$/, '');
    const hit = core && blockedTerm(core);
    if (!hit) { out.push(t); continue; }
    changed = true;
    const repl = PEOPLE_PL.has(low) || /s$/.test(low) && PEOPLE_PL.has(hit + 's') || PEOPLE_PL.has(hit) ? 'people' : PEOPLE_SG.has(low) || PEOPLE_SG.has(hit) ? 'person' : '';
    let rest = ''; for (const st of STEMS) if (low.includes(st)) { rest = low.replace(st, ''); break; }
    if (!repl && rest.length >= 4 && !blockedTerm(rest)) { out.push(m[1] + rest + m[3]); continue; }   // "schoolyard" -> "yard", "babysitter" -> "sitter"
    if (repl) {
      while (out.length && SOFT.has(out[out.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) out.pop();
      let r = repl; if (out.length && POSS.has(out[out.length - 1].toLowerCase())) { out.pop(); if (r === 'person') r = 'someone'; }   // "her baby" -> "someone"
      const tail = /^['’]/.test(m[3]) ? '’s' + m[3].replace(/^['’]s?/, '') : m[3];
      out.push(m[1] + (core[0] === core[0].toUpperCase() && core[0] !== core[0].toLowerCase() ? r[0].toUpperCase() + r.slice(1) : r) + tail);
    }
    else if (PLACE[low] && (m[3] || last)) out.push(m[1] + PLACE[low] + m[3]);   // "near the old school." -> "near the old building."
    else if (m[3]) { if (out.length) out[out.length - 1] += m[3]; }          // drop the word, keep trailing punctuation
  }
  let r = out.join(' ').replace(/\b(an?|An?) (person|people)\b/g, (_, a, p) => (p === 'people' ? '' : (a[0] === 'A' ? 'A ' : 'a ')) + p).replace(/\b(person|people)( \1\b)+/gi, '$1')
    .replace(/\b(an?|the)\s*([.,;:!?]|$)/gi, '$2').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  if (r) r = r[0].toUpperCase() + r.slice(1);
  if (blockedTerm(r)) {                                            // still something age-related (split spellings etc.): drop the words that trip it
    r = r.split(' ').filter(x => !blockedTerm(x)).join(' ');
    if (blockedTerm(r)) r = '';
    changed = true;
  }
  if (!/[a-z]{3}/i.test(r)) r = '';
  return { text: r, changed };
}
