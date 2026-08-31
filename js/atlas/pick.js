// ── Hit-testing ──────────────────────────────────────────────
// The hit radius is in screen space with a 12 CSS pixel floor: a node drawn at
// three pixels across when zoomed out must still be clickable. The floor is the
// contract; the radius the renderer draws is not the hit radius.
//
// A linear scan over the 1,200-node design budget is roughly 1,200 distance
// tests per pointer move, which is not measurable. buildIndex exists so the
// signature does not change when a uniform grid replaces it.

export const HIT_FLOOR = 12;

/** World-space radius per class. draw-nodes.js draws from the same table. */
export const NODE_RADIUS = { hub: 30, core: 16, notable: 12, node: 7 };

export function radiusOf(node) {
  return NODE_RADIUS[node.class] || NODE_RADIUS.node;
}

export function buildIndex(atlas, layout) {
  const items = [];
  for (const id of atlas.topNodes) {
    const p = layout.pos.get(id);
    if (!p) continue;
    items.push({ id, x: p.x, y: p.y, r: radiusOf(atlas.nodes.get(id)) });
  }
  return { items };
}

/** Nearest node whose screen-space hit radius contains the point, or null. */
export function nodeAt(index, camera, sx, sy) {
  const w = camera.toWorld(sx, sy);
  let best = null;
  let bestDist = Infinity;
  for (const item of index.items) {
    const d = Math.hypot(item.x - w.x, item.y - w.y) * camera.zoom;
    const hit = Math.max(HIT_FLOOR, item.r * camera.zoom + 4);
    if (d <= hit && d < bestDist) {
      bestDist = d;
      best = item.id;
    }
  }
  return best;
}

/** Ids inside a screen-space rectangle, for rubber-band selection. */
export function nodesInRect(index, camera, rect) {
  const a = camera.toWorld(Math.min(rect.x1, rect.x2), Math.min(rect.y1, rect.y2));
  const b = camera.toWorld(Math.max(rect.x1, rect.x2), Math.max(rect.y1, rect.y2));
  const out = [];
  for (const item of index.items) {
    if (item.x >= a.x && item.x <= b.x && item.y >= a.y && item.y <= b.y) out.push(item.id);
  }
  return out;
}

/**
 * The nearest node in a compass direction from a starting node.
 *
 * This is the keyboard route across the map: a canvas has no tab order, so
 * arrow keys walk the graph geometrically and the landing node is announced.
 * Candidates inside a 100 degree cone score by distance and by how squarely
 * they sit in the requested direction.
 */
export function nodeToward(index, fromId, dx, dy) {
  const from = index.items.find((i) => i.id === fromId);
  if (!from) return null;
  let best = null;
  let bestScore = Infinity;
  for (const item of index.items) {
    if (item.id === fromId) continue;
    const vx = item.x - from.x;
    const vy = item.y - from.y;
    const dist = Math.hypot(vx, vy);
    if (dist < 1) continue;
    const align = (vx * dx + vy * dy) / dist;
    if (align < 0.64) continue;
    const score = dist / (align * align);
    if (score < bestScore) {
      bestScore = score;
      best = item.id;
    }
  }
  return best;
}
