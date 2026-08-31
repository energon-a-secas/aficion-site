// ── Allocation and pathing ───────────────────────────────────
// Set maths over the visitor's profile. Every function is pure: toggle and
// setLevel return a NEW profile and the caller assigns, so nothing mutates a
// profile that another module is already holding.
//
// Routing runs over the top layer only. Inner-tree nodes live in the same id
// space and belong on a person's map, but they are not drawn on the top layer
// and the corpus declares no edge from a parent to its inner children, so
// inventing one here to make them route would be inventing content.

const MAX_BRIDGE_STEPS = 6;

export function toggle(profile, nodeId) {
  const n = new Set(profile.n);
  const l = { ...profile.l };
  if (n.has(nodeId)) {
    n.delete(nodeId);
    delete l[nodeId];
  } else {
    n.add(nodeId);
  }
  return { ...profile, n: [...n].sort(), l };
}

export function setLevel(profile, nodeId, level) {
  const n = new Set(profile.n);
  n.add(nodeId);
  const l = { ...profile.l };
  if (level === null || level === undefined) delete l[nodeId];
  else l[nodeId] = level;
  return { ...profile, n: [...n].sort(), l };
}

/** Only the ids the map actually draws. */
function onTopLayer(atlas, allocated) {
  const top = new Set(atlas.topNodes);
  const out = new Set();
  for (const id of allocated) if (top.has(id)) out.add(id);
  return out;
}

function componentsOf(atlas, allocated) {
  const seen = new Set();
  const out = [];
  for (const id of allocated) {
    if (seen.has(id)) continue;
    const stack = [id];
    const group = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      group.push(cur);
      for (const link of atlas.adj.get(cur) || []) {
        if (allocated.has(link.to) && !seen.has(link.to)) {
          seen.add(link.to);
          stack.push(link.to);
        }
      }
    }
    out.push(group.sort());
  }
  return out;
}

/**
 * The shortest walk from one allocated island to any other, through nodes the
 * visitor has not marked. This is what shows a person that two of their hobbies
 * are three steps apart, which is the real payload of the gold thread.
 */
function bridgeFrom(atlas, group, ownerOf, allocated) {
  // Never through the hub. Contract 1.8 gives every cluster's notable a kin
  // edge to it, so a walk through the centre makes any two anchors "two steps
  // apart" and the readout stops carrying information. A bridge is only worth
  // printing when it runs through something the two hobbies actually share.
  const prev = new Map();
  const queue = [];
  for (const id of group) {
    prev.set(id, null);
    queue.push(id);
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const depth = pathBack(prev, cur).length - 1;
    if (depth > MAX_BRIDGE_STEPS) continue;
    for (const link of atlas.adj.get(cur) || []) {
      if (link.to === atlas.hubId || prev.has(link.to)) continue;
      prev.set(link.to, cur);
      const owner = ownerOf.get(link.to);
      if (owner !== undefined) {
        const path = pathBack(prev, link.to);
        return { from: path[0], to: link.to, path, owner };
      }
      if (!allocated.has(link.to)) queue.push(link.to);
    }
  }
  return null;
}

function pathBack(prev, id) {
  const out = [id];
  let cur = prev.get(id);
  while (cur) {
    out.push(cur);
    cur = prev.get(cur);
  }
  return out.reverse();
}

/**
 * The gold route is every edge whose two endpoints are both allocated. Islands
 * that do not touch are reported as components, and the shortest walk between
 * each island and its nearest neighbour is reported as a bridge.
 */
export function computeRoutes(atlas, allocated) {
  const mine = onTopLayer(atlas, allocated);
  const edges = new Set();
  for (const edge of atlas.edges) {
    if (mine.has(edge.from) && mine.has(edge.to)) edges.add(edge.key);
  }
  const components = componentsOf(atlas, mine);

  const ownerOf = new Map();
  components.forEach((group, i) => {
    for (const id of group) ownerOf.set(id, i);
  });

  const bridges = [];
  const pairs = new Set();
  components.forEach((group, i) => {
    const others = new Map(ownerOf);
    for (const id of group) others.delete(id);
    const found = bridgeFrom(atlas, group, others, mine);
    if (!found) return;
    const key = i < found.owner ? `${i}:${found.owner}` : `${found.owner}:${i}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    bridges.push({ from: found.from, to: found.to, path: found.path });
  });
  bridges.sort((a, b) => a.path.length - b.path.length);

  return { edges, components, bridges };
}

/** Adjacent to something allocated, not allocated. The ring of near misses. */
export function nearMisses(atlas, allocated) {
  const mine = onTopLayer(atlas, allocated);
  const out = new Set();
  for (const id of mine) {
    for (const link of atlas.adj.get(id) || []) {
      if (!mine.has(link.to) && link.to !== atlas.hubId) out.add(link.to);
    }
  }
  return [...out].sort();
}

/**
 * The one bucket a marked node counts in.
 *
 * An inner node counts where its top-layer parent counts. An inner id is its
 * parent's id plus one segment (contract 1.2 rule 2), so the parent is
 * computable from the id alone, and someone who marks a grade inside Gunpla is
 * doing something in scale models, not in a nineteenth cluster of their own.
 * The alternative rule does not exist: an inner node has no cluster of its own,
 * which is why load.js stamps it with its parent's.
 *
 * Crafts and the hub are their own buckets. They sit outside every cluster by
 * design, so counting them as clusters would be counting something the atlas
 * does not have.
 */
export function bucketOf(atlas, id) {
  const parts = id.split('.');
  const top = atlas.nodes.get(parts.length > 2 ? parts.slice(0, 2).join('.') : id);
  if (!top) return null;
  if (top.class === 'hub') return { key: 'centre', kind: 'centre', cluster: null };
  if (top.class === 'core') return { key: 'crafts', kind: 'craft', cluster: null };
  return { key: `cluster:${top.cluster}`, kind: 'cluster', cluster: top.cluster };
}

/**
 * The visitor's map grouped into buckets, in the order their ids arrive. One
 * call, so the sentence that counts the buckets and the headings that render
 * them cannot disagree: they read the same Map.
 */
export function buckets(atlas, allocated) {
  const out = new Map();
  for (const id of allocated) {
    const bucket = bucketOf(atlas, id);
    if (!bucket) continue;
    const hit = out.get(bucket.key);
    if (hit) hit.ids.push(id);
    else out.set(bucket.key, { ...bucket, ids: [id] });
  }
  return out;
}
