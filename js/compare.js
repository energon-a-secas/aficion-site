// ── Compare ──────────────────────────────────────────────────
// Two reconciled profiles in, four sets and a per-bucket tally out.
//
// There is no score. No percentage, no total, no ranking, no "compatibility".
// The shape enforces it because this is not a bingo card: the useful output is
// "you both do this", "they do this and you are one step from it", not a number
// that turns two people's hobbies into a league table. Adding one is a contract
// 3 amendment and it needs the user, not an engineer.

import { bucketOf } from './alloc.js';

function setOf(profile) {
  return new Set(profile.n);
}

/**
 * Row order: the clusters in the order the corpus declares them, then the two
 * layers that sit under all of them. It reads off the atlas, not off either
 * profile, so the table does not reshuffle depending on whose map is whose.
 */
function rowOrder(atlas) {
  const rank = new Map();
  for (const id of atlas.byCluster.keys()) rank.set(`cluster:${id}`, rank.size);
  const clusters = rank.size;
  rank.set('crafts', clusters);
  rank.set('centre', clusters + 1);
  return rank;
}

/**
 * The tally, counted through the same `bucketOf` the mine panel groups by.
 *
 * This used to walk `atlas.byCluster`, which holds the top layer only, so a map
 * carrying a parent and its inner children counted fewer nodes than the chip
 * lists printed directly above the table, in the same panel and the same
 * viewport: "2 things sit on both maps" over a Both column summing to 1. An
 * inner node counts where its top-layer parent counts, that rule is written
 * once in alloc.js, and a second implementation of it here is exactly how the
 * two came to disagree.
 *
 * Crafts and the centre get a row for the same reason. A visitor marks into
 * them, so a table that silently drops them cannot add up to the lists it sits
 * under. `bucketOf` returns one of those three kinds and nothing else, which is
 * what `rowOrder` is keyed on.
 */
function tally(atlas, mine, theirs) {
  const rows = new Map();
  const rowFor = (id) => {
    const bucket = bucketOf(atlas, id);
    if (!bucket) return null;
    let hit = rows.get(bucket.key);
    if (!hit) {
      hit = { ...bucket, mine: 0, theirs: 0, both: 0 };
      rows.set(bucket.key, hit);
    }
    return hit;
  };
  for (const id of mine) {
    const row = rowFor(id);
    if (!row) continue;
    row.mine += 1;
    if (theirs.has(id)) row.both += 1;
  }
  for (const id of theirs) {
    const row = rowFor(id);
    if (row) row.theirs += 1;
  }
  const rank = rowOrder(atlas);
  return new Map([...rows].sort((x, y) => rank.get(x[0]) - rank.get(y[0])));
}

export function compare(atlas, mine, theirs) {
  const a = setOf(mine);
  const b = setOf(theirs);

  const both = new Set();
  const mineOnly = new Set();
  const theirsOnly = new Set();
  for (const id of a) (b.has(id) ? both : mineOnly).add(id);
  for (const id of b) if (!a.has(id)) theirsOnly.add(id);

  // Theirs, adjacent to something of mine, not mine. The interesting bucket:
  // it is the shortest honest answer to "what could I pick up from them".
  const nearMiss = new Set();
  for (const id of theirsOnly) {
    for (const link of atlas.adj.get(id) || []) {
      if (link.to !== atlas.hubId && a.has(link.to)) {
        nearMiss.add(id);
        break;
      }
    }
  }

  return { both, mineOnly, theirsOnly, nearMiss, byBucket: tally(atlas, a, b) };
}

/**
 * The one line worth printing above the lists. Deliberately a sentence about
 * what is shared, not a figure: "four things" is a fact, "62% match" is a claim.
 */
export function compareHeadline(result, theirName) {
  const who = theirName ? theirName : 'They';
  const shared = result.both.size;
  const near = result.nearMiss.size;
  if (!shared && !near) return `Nothing overlaps yet. ${who} start somewhere else entirely.`;
  const parts = [];
  if (!shared) parts.push('Nothing sits on both maps');
  else parts.push(shared === 1 ? 'One thing sits on both maps' : `${shared} things sit on both maps`);
  if (near) parts.push(near === 1 ? 'one of theirs is a single step from yours' : `${near} of theirs are a single step from yours`);
  return `${parts.join(', and ')}.`;
}
