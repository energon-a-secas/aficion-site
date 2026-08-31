// ── Discovery ────────────────────────────────────────────────
// "One step away", scored and justified. Scoring is never the UI's business and
// the UI never composes the sentence: `reason` arrives finished and is printed
// verbatim. Tag labels come from the corpus vocabulary, never from a literal
// here, so a new tag is a data edit with no code change.

import { joinList, plural } from './utils.js';

const W_ADJACENT = 3.2;
const W_CORE_SHARED = 2.6;
const W_TAG = 1.15;
const W_SURPRISE = 1.8; // shares-gear across two clusters is the product's best line

function labelOf(atlas, id) {
  const node = atlas.nodes.get(id);
  return node ? node.label : id;
}

function tagLabels(atlas, tags) {
  return tags.map((t) => (atlas.tags.get(t) || t).toLowerCase());
}

/** How many allocated nodes lean on this core skill. */
function coreSupport(atlas, id, allocated) {
  const via = [];
  for (const link of atlas.adj.get(id) || []) {
    if (link.kind === 'draws-on' && link.dir === 'in' && allocated.has(link.to)) via.push(link.to);
  }
  return via;
}

function neighbourSupport(atlas, id, allocated) {
  const via = [];
  let weight = 0;
  let surprise = false;
  for (const link of atlas.adj.get(id) || []) {
    if (link.kind === 'draws-on') continue;
    if (!allocated.has(link.to)) continue;
    via.push(link.to);
    weight += link.weight;
    if (link.kind === 'shares-gear') surprise = true;
  }
  return { via, weight, surprise };
}

function tagSupport(atlas, node, allocated) {
  const mineTags = new Map();
  for (const id of allocated) {
    const other = atlas.nodes.get(id);
    if (!other) continue;
    for (const tag of other.tags) mineTags.set(tag, (mineTags.get(tag) || 0) + 1);
  }
  const shared = node.tags.filter((t) => mineTags.has(t));
  const strength = shared.reduce((sum, t) => sum + Math.min(4, mineTags.get(t)), 0);
  return { shared, strength };
}

/**
 * The sentence. One template per dominant reason, so the copy says why this
 * node rather than restating what the node is.
 */
function reasonFor(atlas, node, parts) {
  const { core, near, tags } = parts;
  if (core.length >= 2) {
    return `${core.length} things you already do draw on this, and it is the craft they share.`;
  }
  if (near.surprise) {
    const names = joinList(near.via.map((id) => labelOf(atlas, id)));
    return `Shares gear with ${names}. Same kit, different shelf.`;
  }
  if (near.via.length >= 2) {
    return `Sits next to ${joinList(near.via.map((id) => labelOf(atlas, id)))}, both already yours.`;
  }
  if (near.via.length === 1) {
    return `One step from ${labelOf(atlas, near.via[0])}, which is already on your map.`;
  }
  if (core.length === 1) {
    return `${labelOf(atlas, core[0])} draws on the same craft this does.`;
  }
  const names = tagLabels(atlas, tags.shared);
  return `Shares ${joinList(names, 3)} with ${tags.strength} ${plural(tags.strength, 'thing', 'things')} you already do.`;
}

/**
 * Ranked suggestions. Every candidate must have some real support: a node that
 * only scores on one weak tag is not a suggestion, it is filler.
 */
export function suggest(atlas, allocated, { limit = 8 } = {}) {
  if (!allocated.size) return [];
  const out = [];
  for (const id of atlas.topNodes) {
    if (allocated.has(id) || id === atlas.hubId) continue;
    const node = atlas.nodes.get(id);
    const near = neighbourSupport(atlas, id, allocated);
    const core = node.class === 'core' ? coreSupport(atlas, id, allocated) : [];
    const tags = tagSupport(atlas, node, allocated);
    const score =
      near.via.length * W_ADJACENT +
      near.weight * 0.4 +
      (near.surprise ? W_SURPRISE : 0) +
      core.length * W_CORE_SHARED +
      tags.strength * W_TAG;
    if (score < 2.5) continue;
    out.push({
      id,
      score: Math.round(score * 100) / 100,
      reason: reasonFor(atlas, node, { core, near, tags }),
      via: [...new Set([...core, ...near.via])],
    });
  }
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return out.slice(0, limit);
}

/**
 * The opening state: nothing allocated, so nothing can be suggested. These are
 * the anchors, which is where a person starts reading a map they have not seen.
 */
export function startingPoints(atlas, limit = 6) {
  const out = [];
  for (const cluster of atlas.clusters.values()) {
    const node = atlas.nodes.get(cluster.notable);
    if (node) out.push({ id: node.id, score: 0, reason: cluster.blurb, via: [] });
  }
  return out.slice(0, limit);
}
