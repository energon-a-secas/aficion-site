// ── Inner trees ──────────────────────────────────────────────
// A drill-in is 24 nodes at most and it wants crisp text and real focus order,
// so it renders as an SVG overlay rather than on the canvas. That keeps the
// canvas renderer free of drill-in state and gives inner nodes a keyboard route
// and an accessibility tree for nothing, which the map itself has to buy with
// a parallel DOM surface.
//
// One level deep, by design. An inner node never carries inner: true.

import { loadInner, hasInner } from './atlas/load.js';
import { layoutInner } from './atlas/layout.js';

let current = null;

export { hasInner };

/** Fetch (memoised), lay out in local space, return the subview. */
export async function openInner(atlas, nodeId) {
  const tree = await loadInner(atlas, nodeId);
  const layout = layoutInner(atlas, tree);
  current = { tree, layout, bounds: layout.bounds, of: nodeId };
  return current;
}

export function closeInner() {
  current = null;
}

export function currentInner() {
  return current;
}

/**
 * Local coordinates to a 0-to-1 box, so the overlay can scale to whatever room
 * the panel has without the layout knowing anything about the viewport.
 */
export function normalise(view, size = 100) {
  const b = view.bounds;
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const k = size / Math.max(w, h);
  const ox = (size - w * k) / 2;
  const oy = (size - h * k) / 2;
  const pos = new Map();
  for (const [id, p] of view.layout.pos) {
    pos.set(id, { x: (p.x - b.minX) * k + ox, y: (p.y - b.minY) * k + oy });
  }
  return pos;
}

/** Which of the tree's nodes the visitor has marked. */
export function innerProgress(view, allocated) {
  let done = 0;
  for (const id of view.tree.nodeIds) if (allocated.has(id)) done += 1;
  return { done, total: view.tree.nodeIds.length };
}
