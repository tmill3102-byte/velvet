// Velvet batch 2: smart albums, best-shot picker and smart rules. Pure on-device logic over the encrypted AI index.
import * as AI from './ai.js';
import * as People from './people.js';

const KIND = { scene: 'place', setting: 'place', object: 'theme', animal: 'theme', activity: 'theme', people: 'theme', season: 'theme', light: 'theme', style: 'theme' };
const SKIP = new Set(['indoor', 'outdoor', 'sky', 'clouds', 'screenshot', 'document', 'close-up', 'smiling', 'woman', 'man', 'trees', 'plants', 'field', 'travel']);
const NAMES = { beach: 'Beach days', ocean: 'By the sea', mountains: 'Mountains', snow: 'Snow', forest: 'Forest walks', city: 'City life', night: 'After dark', sunset: 'Sunsets',
  skyline: 'Skylines', street: 'Streets', food: 'Food', pizza: 'Pizza', dessert: 'Sweet things', flowers: 'Flowers', dog: 'Dogs', cat: 'Cats', pet: 'Pets', bird: 'Birds',
  travel: 'Travel', party: 'Parties', concert: 'Live music', painting: 'Art', 'golden hour': 'Golden hour', neon: 'Neon', winter: 'Winter', summer: 'Summer', autumn: 'Autumn',
  christmas: 'Christmas', island: 'Islands', countryside: 'Countryside', garden: 'Gardens', dress: 'Dresses', 'black & white': 'Black & white', portrait: 'Portraits', wedding: 'Weddings' };
const title = t => NAMES[t] || t.replace(/\b\w/g, c => c.toUpperCase());
const tagsOf = it => new Set([...(it.tags || []), ...(it.aiTags || [])]);
export const timeOf = it => it.taken || (it.modified && it.modified < (it.added || Date.now()) - 120000 ? it.modified : null); // capture date; file date only if it isn't just the pick/import time (iOS)

/* ---------- smart albums ---------- */
// themes & place-like scenes from tags (refined with embeddings), plus time clusters ("moments") from file dates
export async function smartAlbums(items, { min = 3, maxEach = 10, gapH = 12 } = {}) {
  const out = [];
  if (AI.hasIndex()) {
    const voc = await AI.vocabInfo(), group = new Map(voc.tags.map(t => [t[0], t[1]]));
    const by = new Map();
    for (const it of items) for (const t of tagsOf(it)) if (group.has(t) && !SKIP.has(t)) { if (!by.has(t)) by.set(t, new Set()); by.get(t).add(it.id); }
    const vec = new Map(); for (const it of items) { const v = AI.itemVec(it.id); if (v) vec.set(it.id, v); }
    const cands = [];
    for (const [t, set] of by) {
      if (set.size < 2) continue;
      // embedding refinement: pull in untagged look-alikes that score at least like the weakest quarter of tagged members
      const tv = AI.tagVec(t);
      if (tv) {
        const sims = [...set].map(id => vec.has(id) ? AI.dot(vec.get(id), tv) : null).filter(x => x != null).sort((a, b) => a - b);
        const thr = Math.max(.2, sims.length ? sims[Math.floor(sims.length / 4)] : 1);
        for (const [id, v] of vec) if (!set.has(id) && AI.dot(v, tv) >= thr) set.add(id);
      }
      if (set.size >= min) cands.push({ id: 'smart:tag:' + t, tag: t, kind: KIND[group.get(t)] || 'theme', name: title(t), ids: [...set] });
    }
    cands.sort((a, b) => b.ids.length - a.ids.length);
    const kept = [];
    for (const c of cands) {                 // drop near-identical albums (e.g. "Pets" vs "Cats")
      const s = new Set(c.ids);
      if (kept.some(k => { const inter = k.ids.filter(x => s.has(x)).length; return inter / (k.ids.length + c.ids.length - inter) >= .8; })) continue;
      if (kept.filter(k => k.kind === c.kind).length >= maxEach) continue;
      kept.push(c);
    }
    out.push(...kept);
  }
  // moments: cluster by file date with gaps > gapH hours
  const dated = items.filter(timeOf).sort((a, b) => timeOf(a) - timeOf(b));
  let cur = [];
  const flush = () => {
    if (cur.length >= min && !(items.length > 10 && cur.length > .6 * items.length)) {
      const a = new Date(timeOf(cur[0])), b = new Date(timeOf(cur[cur.length - 1]));
      const f = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), y = b.getFullYear();
      const name = a.toDateString() === b.toDateString() ? a.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : `${f(a)} – ${f(b)}, ${y}`;
      const cnt = new Map(); cur.forEach(it => tagsOf(it).forEach(t => { if (!SKIP.has(t) && !/^(red|orange|yellow|green|blue|purple|pink)$/.test(t)) cnt.set(t, (cnt.get(t) || 0) + 1); }));
      const top = [...cnt].sort((x, z) => z[1] - x[1]).slice(0, 2).map(e => e[0].replace(/^\w/, c => c.toUpperCase()));
      out.push({ id: 'smart:time:' + timeOf(cur[0]), kind: 'moment', name, sub: top.join(' · '), ids: cur.map(i => i.id) });
    }
    cur = [];
  };
  for (const it of dated) { if (cur.length && timeOf(it) - timeOf(cur[cur.length - 1]) > gapH * 3600e3) flush(); cur.push(it); }
  flush();
  return out;
}

/* ---------- best-shot picker ---------- */
// groups = bursts (photos taken within a few seconds that look alike) + duplicate/similar groups; best = sharpness/exposure + how typical it is of the set + resolution
export async function bestShots(items, { burstS = 4, burstCos = .72 } = {}) {
  const ph = items.filter(i => i.type === 'photo');
  const idxOf = new Map(ph.map((it, k) => [it.id, k])), p = ph.map((_, k) => k);
  const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) p[b] = a; };
  const vec = id => AI.itemVec(id);
  const dated = ph.filter(timeOf).sort((a, b) => timeOf(a) - timeOf(b));
  for (let i = 0; i < dated.length; i++) for (let j = i + 1; j < dated.length && timeOf(dated[j]) - timeOf(dated[i]) <= burstS * 1000; j++) {
    const a = vec(dated[i].id), b = vec(dated[j].id); if (!a || !b || AI.dot(a, b) >= burstCos) uni(idxOf.get(dated[i].id), idxOf.get(dated[j].id));
  }
  const g = await AI.findGroups(ph);
  for (const grp of [...g.dupes, ...g.similar]) for (let k = 1; k < grp.length; k++) if (idxOf.has(grp[0]) && idxOf.has(grp[k])) uni(idxOf.get(grp[0]), idxOf.get(grp[k]));
  const m = new Map(); ph.forEach((it, k) => { const r = find(k); if (!m.has(r)) m.set(r, []); m.get(r).push(it); });
  return [...m.values()].filter(x => x.length > 1).map(rankShots);
}
export function rankShots(list) {
  const vs = list.map(it => AI.itemVec(it.id));
  const rows = list.map((it, k) => {
    const e = AI.entryOf(it.id) || {}; let c = 0, n = 0;
    vs.forEach((v, j) => { if (j !== k && v && vs[k]) { c += AI.dot(v, vs[k]); n++; } });
    return { it, q: e.q || 0, cent: n ? c / n : 0, res: Math.log2(Math.max(1, (it.w || 1) * (it.h || 1))) };
  });
  // absolute weights: quality (sharpness/exposure/contrast, ~0-10) matters most within a burst; resolution decides between copies; typicality breaks ties
  rows.forEach(r => r.score = .5 * r.q + r.res + 2 * r.cent + (r.it.size || 0) / 5e8);
  rows.sort((a, b) => b.score - a.score);
  return { ids: rows.map(r => r.it.id), best: rows[0].it.id, rows: rows.map(r => ({ id: r.it.id, q: +r.q.toFixed(2), cent: +r.cent.toFixed(3), score: +r.score.toFixed(3) })) };
}

/* ---------- smart rules ---------- */
// rule: { id, on, kind: 'tag'|'search', value, action: 'vault'|'col', col, name }
export function describe(r, colName) {
  const pp = r.kind === 'person' ? People.person(r.value) : null;
  const what = r.kind === 'tag' ? `tagged “${r.value}”` : r.kind === 'person' ? (pp && pp.name ? `showing “${pp.name}”` : pp ? 'showing an unnamed person' : 'showing a person (People is off)') : `looking like “${r.value}”`;
  return `Items ${what} → ${r.action === 'vault' ? 'Vault' : `collection “${colName || '?'}”`}`;
}
// returns ids that match a rule among candidates (ignores items this rule already handled)
export async function matchRule(r, items) {
  const cand = items.filter(it => !it.archived && !(it.ruled || []).includes(r.id) && !(r.action === 'vault' && it.vault) && !(r.action === 'col' && (it.cols || []).includes(r.col)));
  if (r.kind === 'tag') { const v = r.value.toLowerCase(); return cand.filter(it => [...tagsOf(it)].some(t => t.toLowerCase() === v)).map(it => it.id); }
  if (r.kind === 'person') { if (!People.isOpen()) return []; const ids = new Set(People.itemsOf(r.value)); return cand.filter(it => ids.has(it.id)).map(it => it.id); }
  if (!AI.hasIndex()) return [];
  return (await AI.matchQuery(r.value, cand.map(i => i.id))).map(x => x[0]);
}
