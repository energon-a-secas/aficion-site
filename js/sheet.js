// ── Character sheet model ────────────────────────────────────
// One computation per open: computeSheet() returns the axes both the radar
// SVG and the printed domain rows render from, so the picture and the numbers
// cannot disagree (the bucketOf lesson, applied forward). The domain fold is
// content and lives in data/sheet.json, never in this file.

let sheetData = null;

export async function ensureSheet() {
  if (sheetData) return sheetData;
  const res = await fetch('data/sheet.json');
  if (!res.ok) throw new Error(`data/sheet.json answered ${res.status}`);
  const raw = await res.json();
  if (!raw || !Array.isArray(raw.domains) || raw.domains.length !== 6) {
    throw new Error('data/sheet.json does not declare six domains');
  }
  sheetData = raw;
  return sheetData;
}

/** The exact parent rule bucketOf uses: computable from the id alone, so an
    unloaded inner node still attributes to its top-layer parent. */
function parentOf(id) {
  const parts = id.split('.');
  return parts.length > 2 ? parts.slice(0, 2).join('.') : id;
}

/**
 * Per domain, three honest integers from the real model:
 * - implied: distinct marked hobbies whose cluster parent draws on a craft in
 *   the domain (what your hobbies lean on).
 * - practice: marked nodes whose parent IS a craft in the domain (the craft
 *   itself plus its marked inner nodes).
 * - depth: the set level values on marked, levelled crafts in the domain,
 *   clamped to the craft's own ladder (a local profile is not re-clamped by
 *   reconcile, so an out-of-range value must not throw here).
 * The polygon draws claimed = practice + depth against implied; the rows
 * print the integers separately, and the printed number is the truth.
 */
export function computeSheet(atlas, profile, domains) {
  const craftHobbies = new Map();
  for (const e of atlas.edges) {
    if (e.kind !== 'draws-on') continue;
    if (!craftHobbies.has(e.to)) craftHobbies.set(e.to, new Set());
    craftHobbies.get(e.to).add(e.from);
  }
  const marked = new Set(profile.n);
  const markedParents = new Set();
  for (const id of marked) {
    const p = parentOf(id);
    const node = atlas.nodes.get(p);
    if (node && node.class !== 'core' && node.class !== 'hub') markedParents.add(p);
  }
  const axes = domains.map((d) => {
    const implied = new Set();
    let practice = 0;
    let depth = 0;
    const crafts = d.crafts.map((cid) => {
      const cnode = atlas.nodes.get(cid);
      for (const h of craftHobbies.get(cid) || []) if (markedParents.has(h)) implied.add(h);
      const mine = marked.has(cid);
      let level = null;
      if (mine && cnode && cnode.levels && Number.isInteger(profile.l[cid])) {
        const li = Math.min(profile.l[cid], cnode.levels.length);
        if (li > 0) {
          depth += li;
          level = cnode.levels[li - 1].label;
        }
      }
      return { id: cid, label: cnode ? cnode.label : cid, mine, level };
    });
    for (const id of marked) if (d.crafts.includes(parentOf(id))) practice += 1;
    return { id: d.id, label: d.label, crafts, implied: implied.size, practice, depth, claimed: practice + depth };
  });
  return { axes, basis: profile.n.length };
}

/**
 * Earned profile titles, judged against data/sheet.json's rules. Semantics:
 * all = every id marked; any + min = at least min of the list marked;
 * levels = minimum set level per id; crafts / clusters = distinct marked
 * craft or cluster count. Titles are earned, never free.
 */
export function computeTitles(atlas, profile, titles) {
  const marked = new Set(profile.n);
  const parents = [...marked].map(parentOf);
  const craftCount = new Set(parents.filter((p) => atlas.nodes.get(p)?.class === 'core')).size;
  const clusterCount = new Set(
    parents
      .filter((p) => {
        const n = atlas.nodes.get(p);
        return n && n.class !== 'core' && n.class !== 'hub';
      })
      .map((p) => p.split('.')[0]),
  ).size;
  return (titles || []).filter((t) => {
    if (t.all && !t.all.every((id) => marked.has(id))) return false;
    if (t.any && t.any.filter((id) => marked.has(id)).length < (t.min || 1)) return false;
    if (t.levels && !Object.entries(t.levels).every(([id, min]) => (profile.l[id] || 0) >= min)) return false;
    if (t.crafts && craftCount < t.crafts) return false;
    if (t.clusters && clusterCount < t.clusters) return false;
    return true;
  });
}
