// ── Layout stage ─────────────────────────────────────────────
// The A-to-B seam: the corpus declares a recipe and its parameters, this file
// turns them into coordinates. Pure and deterministic. No DOM, no Math.random,
// no Date, no reading the viewport: the map is a place, and a place does not
// move between visits.

import { rad } from '../utils.js';

const HUB_ORIGIN = { x: 0, y: 0 };
const BOUNDS_PAD = 220;
const HULL_PAD = 78;

/** Evenly spaced angles. A full sweep divides by n so the ends do not collide. */
function angles(startAngle, spread, n) {
  if (n <= 0) return [];
  if (n === 1) return [startAngle];
  const full = Math.abs(spread) >= 359.5;
  const step = full ? spread / n : spread / (n - 1);
  return Array.from({ length: n }, (_, i) => startAngle + i * step);
}

function place(out, id, cx, cy, r, deg) {
  out.set(id, { x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) });
}

// ── The five recipes ─────────────────────────────────────────
// Every one takes the same parameters and ignores the ones it does not use,
// so a cluster changes shape by editing one string in its JSON.

const RECIPES = {
  ring(out, ids, p) {
    angles(p.startAngle, p.spread, ids.length).forEach((deg, i) => place(out, ids[i], p.x, p.y, p.radius, deg));
  },

  spiral(out, ids, p) {
    const near = 0.35 * p.radius;
    const n = ids.length;
    angles(p.startAngle, p.spread, n).forEach((deg, i) => {
      const t = n === 1 ? 1 : i / (n - 1);
      place(out, ids[i], p.x, p.y, near + (p.radius - near) * t, deg);
    });
  },

  fan(out, ids, p) {
    const n = ids.length;
    const from = p.startAngle - p.spread / 2;
    angles(from, p.spread, n).forEach((deg, i) => {
      const r = n > 7 && i % 2 === 1 ? p.radius * 1.35 : p.radius;
      place(out, ids[i], p.x, p.y, r, deg);
    });
  },

  arc(out, ids, p) {
    angles(p.startAngle, p.spread, ids.length).forEach((deg, i) => place(out, ids[i], p.x, p.y, p.radius, deg));
  },

  orbit(out, ids, p) {
    angles(p.startAngle, 360, ids.length).forEach((deg, i) => place(out, ids[i], p.x, p.y, p.radius, deg));
  },
};

/**
 * Walk one layout block.
 *
 * `anchorId` is the cluster's notable. Four recipes park it on the anchor point
 * and walk the rest around it; `arc` has no centre to park on, so the anchor
 * takes the middle slot of the arc instead.
 */
function runRecipe(out, block, ids, anchorId) {
  const recipe = RECIPES[block.recipe];
  if (!recipe) throw new Error(`layout recipe "${block.recipe}" is not one of the five`);
  const p = {
    x: block.anchor[0],
    y: block.anchor[1],
    radius: block.radius,
    startAngle: block.startAngle === undefined ? 0 : block.startAngle,
    spread: block.spread === undefined ? 360 : block.spread,
  };
  const ordered = block.order ? block.order.filter((id) => ids.includes(id)) : ids.slice();
  for (const id of ids) if (!ordered.includes(id)) ordered.push(id);

  if (!anchorId) {
    recipe(out, ordered, p);
    return;
  }
  const rest = ordered.filter((id) => id !== anchorId);
  if (block.recipe === 'arc') {
    rest.splice(Math.floor(rest.length / 2), 0, anchorId);
    recipe(out, rest, p);
    return;
  }
  out.set(anchorId, { x: p.x, y: p.y });
  recipe(out, rest, p);
}

function boundsOf(positions, pad) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of positions) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return { minX: -pad, minY: -pad, maxX: pad, maxY: pad };
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** The circle that contains a cluster, for the backdrop wash. */
function hullOf(pos, ids) {
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    cx += p.x;
    cy += p.y;
    n += 1;
  }
  if (!n) return null;
  cx /= n;
  cy /= n;
  let r = 0;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
  }
  return { cx, cy, r: r + HULL_PAD };
}

/** Same atlas in, byte-identical layout out, on any machine. */
export function computeLayout(atlas) {
  const pos = new Map();
  pos.set(atlas.hubId, { ...HUB_ORIGIN });
  runRecipe(pos, atlas.coreLayout, atlas.coreIds.slice(), null);

  const hulls = new Map();
  for (const [id, cluster] of atlas.clusters) {
    runRecipe(pos, cluster.layout, cluster.nodeIds.slice(), cluster.notable);
    const hull = hullOf(pos, cluster.nodeIds);
    if (hull) hulls.set(id, hull);
  }
  return { pos, hulls, bounds: boundsOf(pos.values(), BOUNDS_PAD) };
}

/** One inner tree, in its own local space centred on [0, 0]. */
export function layoutInner(atlas, tree) {
  const pos = new Map();
  runRecipe(pos, tree.layout, tree.nodeIds.slice(), null);
  return { pos, hulls: new Map(), bounds: boundsOf(pos.values(), 90) };
}

/** The box that contains a subset of ids, for fit-to-selection. */
export function boundsOfIds(layout, ids, pad = BOUNDS_PAD) {
  const points = [];
  for (const id of ids) {
    const p = layout.pos.get(id);
    if (p) points.push(p);
  }
  if (!points.length) return layout.bounds;
  return boundsOf(points, pad);
}
