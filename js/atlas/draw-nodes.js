// ── Node passes (draw order 7 to 12) ─────────────────────────
// core, plain, notable, hub, allocated halos, then the state rings: suggestion,
// focus, compare, build cursor, hover and selection.
// One visual treatment per member of atlas.classes.

import { withAlpha } from './theme.js';
import { NODE_RADIUS } from './pick.js';
import { hasInner } from './load.js';

const MIN_SCREEN_R = 2.4;

function visible(env, p, pad) {
  const r = env.rect;
  return p.x > r.minX - pad && p.x < r.maxX + pad && p.y > r.minY - pad && p.y < r.maxY + pad;
}

/** Keeps a node clickable-looking when the map is zoomed out. */
function radius(env, cls) {
  return Math.max(NODE_RADIUS[cls] || NODE_RADIUS.node, MIN_SCREEN_R * env.px);
}

function disc(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx, x, y, r, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function accentOf(env, node) {
  return node.accent ? env.theme.accents[node.accent] || env.theme.node : null;
}

/**
 * A node with an inner tree advertises it: a fine dashed orbit outside the
 * face, the map's answer to "where are the subcategories". Skipped when
 * zoomed out (env.px is one CSS pixel in world units, so px > 1.1 means the
 * orbit would be sub-pixel noise).
 */
function innerMark(env, node, p, r) {
  if (env.px > 1.1 || !hasInner(env.atlas, node.id)) return;
  const { ctx, theme } = env;
  const lit = env.view.allocated.has(node.id);
  const rr = (node.class === 'notable' ? r * 1.55 : r) + 5.5 * env.px;
  ctx.setLineDash([2 * env.px, 3 * env.px]);
  ring(ctx, p.x, p.y, rr, withAlpha(lit ? theme.routeBright : theme.nodeNotable, lit ? 0.6 : 0.4), 1 * env.px);
  ctx.setLineDash([]);
}

/** Dim everything that is not part of the current story. */
function fade(env, id) {
  const { view } = env;
  if (view.build) return view.build.steps.includes(id) ? 1 : 0.28;
  if (view.compare) {
    const c = view.compare;
    return c.both.has(id) || c.mineOnly.has(id) || c.theirsOnly.has(id) || c.nearMiss.has(id) ? 1 : 0.3;
  }
  if (view.dimOthers) return view.allocated.has(id) || view.suggested.has(id) ? 1 : 0.32;
  return 1;
}

function eachOfClass(env, cls, fn) {
  for (const id of env.atlas.topNodes) {
    const node = env.atlas.nodes.get(id);
    if (node.class !== cls) continue;
    const p = env.layout.pos.get(id);
    if (!p || !visible(env, p, 40)) continue;
    fn(node, p);
  }
}

/** Pass 7: a ring rather than a filled dot, so a craft reads as a different kind of thing. */
export function drawCoreNodes(env) {
  const { ctx, theme } = env;
  eachOfClass(env, 'core', (node, p) => {
    const r = radius(env, 'core');
    // Allocated keeps the hollow (the hollow is the class signal); only the
    // ring and centre switch to the route gold.
    const lit = env.view.allocated.has(node.id);
    const c = lit ? theme.route : theme.nodeCore;
    ctx.globalAlpha = fade(env, node.id);
    disc(ctx, p.x, p.y, r, withAlpha(c, 0.14));
    ring(ctx, p.x, p.y, r, c, 1.7 * env.px);
    disc(ctx, p.x, p.y, r * 0.3, lit ? theme.routeBright : theme.nodeCore);
    innerMark(env, node, p, r);
    ctx.globalAlpha = 1;
  });
}

/** Pass 8: the small circular nodes the constellations are made of. */
export function drawPlainNodes(env) {
  const { ctx, theme } = env;
  eachOfClass(env, 'node', (node, p) => {
    const r = radius(env, 'node');
    ctx.globalAlpha = fade(env, node.id);
    const accent = accentOf(env, node);
    // The gold thread gets gold beads: an allocated node's own face lights,
    // the way the reference's allocated sockets do. Layered fills, no filter.
    const lit = env.view.allocated.has(node.id);
    disc(ctx, p.x, p.y, r, lit ? theme.route : accent || theme.node);
    if (lit) disc(ctx, p.x, p.y, r * 0.35, theme.routeBright);
    else if (accent) ring(ctx, p.x, p.y, r + 2.5 * env.px, withAlpha(accent, 0.4), 1.2 * env.px);
    innerMark(env, node, p, r);
    ctx.globalAlpha = 1;
  });
}

/** Pass 9: the larger nodes that anchor a cluster. */
export function drawNotables(env) {
  const { ctx, theme } = env;
  eachOfClass(env, 'notable', (node, p) => {
    const r = radius(env, 'notable');
    ctx.globalAlpha = fade(env, node.id);
    const accent = accentOf(env, node);
    const lit = env.view.allocated.has(node.id);
    const face = lit ? theme.route : accent || theme.nodeNotable;
    disc(ctx, p.x, p.y, r * 1.55, withAlpha(face, 0.1));
    disc(ctx, p.x, p.y, r, face);
    if (lit) disc(ctx, p.x, p.y, r * 0.35, theme.routeBright);
    ring(ctx, p.x, p.y, r * 1.55, withAlpha(face, 0.55), 1.4 * env.px);
    innerMark(env, node, p, r);
    ctx.globalAlpha = 1;
  });
}

/** Pass 10: the ornate centre everything connects back through. */
export function drawHub(env) {
  const { ctx, theme, atlas } = env;
  const p = env.layout.pos.get(atlas.hubId);
  if (!p || !visible(env, p, 120)) return;
  const r = radius(env, 'hub');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  disc(ctx, p.x, p.y, r * 2.1, withAlpha(theme.hub, 0.07));
  disc(ctx, p.x, p.y, r * 1.35, withAlpha(theme.hub, 0.09));
  ctx.restore();

  ring(ctx, p.x, p.y, r * 1.5, withAlpha(theme.hub, 0.35), 1.2 * env.px);
  ring(ctx, p.x, p.y, r, withAlpha(theme.hub, 0.85), 2.4 * env.px);

  // Eight spokes, an even ring of ticks: an ornate centre, not a bigger dot.
  ctx.strokeStyle = withAlpha(theme.hub, 0.55);
  ctx.lineWidth = 1.4 * env.px;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.moveTo(p.x + Math.cos(a) * r * 1.05, p.y + Math.sin(a) * r * 1.05);
    ctx.lineTo(p.x + Math.cos(a) * r * 1.42, p.y + Math.sin(a) * r * 1.42);
  }
  ctx.stroke();
  disc(ctx, p.x, p.y, r * 0.42, theme.hub);
}

/** Pass 11: the halo that says "this one is mine". */
export function drawHalos(env) {
  const { ctx, view, theme } = env;
  if (!view.allocated.size) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const id of view.allocated) {
    const p = env.layout.pos.get(id);
    if (!p || !visible(env, p, 60)) continue;
    const node = env.atlas.nodes.get(id);
    if (!node) continue;
    const r = radius(env, node.class);
    disc(ctx, p.x, p.y, r * 2.4, withAlpha(theme.halo, 0.12));
    disc(ctx, p.x, p.y, r * 1.5, withAlpha(theme.halo, 0.2));
  }
  ctx.restore();

  for (const id of view.allocated) {
    const p = env.layout.pos.get(id);
    if (!p || !visible(env, p, 60)) continue;
    const node = env.atlas.nodes.get(id);
    if (!node) continue;
    ring(ctx, p.x, p.y, radius(env, node.class) + 3.5 * env.px, theme.halo, 1.8 * env.px);
  }
}

/**
 * The suggestion channel, and the reason it is not a ring in the focus colour.
 *
 * A suggested node is frequently also a focused one (trace a bridge and half
 * the walk is one step from your map), so the two states get different colour
 * AND different geometry: a tinted face plus a tight dashed ember ring here,
 * against a solid cyan ring further out there. Both on one node still reads.
 *
 * It is quiet on purpose. `view.suggested` is the same ranked, capped list the
 * panel prints, six nodes rather than the whole near-miss frontier. The
 * frontier is not a fixed size: it grows with the map, measured at 15 nodes on
 * a 3-mark profile, 34 on 8 and 56 on 14, which is 21% of a 268-node atlas
 * ringed as "one step away". The panel would still name six of them. Lighting
 * the rest puts the map and the sidebar back into disagreement about what is
 * being suggested, which is the one thing this channel exists to prevent.
 * (It is not that a lit frontier would re-light a marked node: `nearMisses()`
 * already excludes everything allocated.)
 */
function markSuggested(env, id) {
  const { ctx, theme } = env;
  const p = env.layout.pos.get(id);
  if (!p || !visible(env, p, 60)) return;
  const node = env.atlas.nodes.get(id);
  if (!node) return;
  const r = radius(env, node.class);
  ctx.globalAlpha = fade(env, id);
  // A craft is a hollow ring around a small centre dot. Tinting its whole face
  // would fill the hollow, and the hollow is what says "craft, not hobby".
  disc(ctx, p.x, p.y, node.class === 'core' ? r * 0.36 : r, withAlpha(theme.suggest, 0.42));
  ctx.setLineDash([3.4 * env.px, 3.4 * env.px]);
  ring(ctx, p.x, p.y, r + 3.5 * env.px, withAlpha(theme.suggest, 0.85), 1.5 * env.px);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Pass 12: suggestions, focus, hover, selection and the compare buckets. */
export function drawRings(env) {
  const { ctx, view, theme } = env;
  const mark = (id, color, width, gap) => {
    const p = env.layout.pos.get(id);
    if (!p || !visible(env, p, 60)) return;
    const node = env.atlas.nodes.get(id);
    if (!node) return;
    ring(ctx, p.x, p.y, radius(env, node.class) + gap * env.px, color, width * env.px);
  };

  for (const id of view.suggested) markSuggested(env, id);
  for (const id of view.focus) mark(id, theme.focus, 1.6, 7);
  if (view.compare) {
    for (const id of view.compare.theirsOnly) mark(id, theme.compareTheirs, 1.8, 6);
    for (const id of view.compare.both) mark(id, theme.compareBoth, 2, 6);
    for (const id of view.compare.nearMiss) mark(id, withAlpha(theme.compareTheirs, 0.55), 1.4, 10);
  }
  if (view.build) {
    const step = view.build.steps[view.build.cursor];
    if (step) mark(step, theme.focus, 2.4, 9);
  }
  if (view.hover && view.hover !== view.selected) mark(view.hover, withAlpha(theme.hover, 0.6), 1.6, 5);
  if (view.selected) {
    mark(view.selected, theme.select, 2.2, 5);
    mark(view.selected, withAlpha(theme.select, 0.3), 1.2, 10);
  }
}
