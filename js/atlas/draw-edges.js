// ── Edge passes (draw order 3 to 6) ──────────────────────────
// draws-on, base edges, the gold route, compare overlays. One pass per
// exported function; a pass that grows a second concern gets its own file
// rather than a longer one.
//
// The glow is additive strokes under globalCompositeOperation = 'lighter',
// widest and faintest first. ctx.filter is never set: see draw.js.

import { withAlpha } from './theme.js';

// Seven crafts with edges into every cluster is the classic hairball, and the
// whole-atlas view is where it lands. Two of the three mitigations DESIGN Q1
// names live here: the unlit ones are hidden until the visitor has zoomed into
// a region rather than surveying the map, and they carry a low enough alpha
// that a hundred of them crossing still read as a wash. The third is that a
// craft lit by an allocated or hovered endpoint always draws, at any zoom,
// because that one is the answer to "what does this stack on".
const DRAWS_ON_ZOOM = 0.78;

function segment(env, edge) {
  const a = env.layout.pos.get(edge.from);
  const b = env.layout.pos.get(edge.to);
  if (!a || !b) return null;
  const r = env.rect;
  if (Math.max(a.x, b.x) < r.minX || Math.min(a.x, b.x) > r.maxX) return null;
  if (Math.max(a.y, b.y) < r.minY || Math.min(a.y, b.y) > r.maxY) return null;
  return { a, b };
}

function stroke(ctx, a, b, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * A curve, not a straight line, so two edges between the same neighbourhood do
 * not stack into one thick bar. The control point is the midpoint pushed
 * perpendicular by a twelfth of the span, always to the same side, so the map
 * bends the same way on every load.
 */
function arcPath(ctx, a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(mx - dy / 12, my + dx / 12, b.x, b.y);
}

/** Pass 3: long dim lines from a hobby to the craft underneath it. */
export function drawDrawsOn(env) {
  const { ctx, view, theme } = env;
  if (!view.showDrawsOn) return;
  const lit = (edge) =>
    view.allocated.has(edge.from) ||
    view.allocated.has(edge.to) ||
    view.hover === edge.from ||
    view.hover === edge.to ||
    view.selected === edge.from ||
    view.selected === edge.to ||
    // In cluster focus the crafts underneath are the point: light the stack.
    (view.clusterFocus !== null && view.clusterFocus.has(edge.from));

  for (const edge of env.atlas.edges) {
    if (edge.kind !== 'draws-on') continue;
    const on = lit(edge);
    if (!on && env.camera.zoom < DRAWS_ON_ZOOM) continue;
    const seg = segment(env, edge);
    if (!seg) continue;
    ctx.strokeStyle = on ? theme.edgeSoftLit : theme.edgeSoft;
    ctx.lineWidth = (on ? 1.6 : 1) * env.px;
    arcPath(ctx, seg.a, seg.b);
    ctx.stroke();
  }
}

/** Pass 4: the fabric. kin, leads-to and shares-gear. */
export function drawBaseEdges(env) {
  const { ctx, view, theme } = env;
  const dim = view.dimOthers || view.compare || view.build || view.clusterFocus;
  const mainMode = view.layers === 'main';
  for (const edge of env.atlas.edges) {
    if (edge.kind === 'draws-on') continue;
    const near =
      view.allocated.has(edge.from) ||
      view.allocated.has(edge.to) ||
      view.hover === edge.from ||
      view.hover === edge.to;
    // Layers "main": only the fabric between anchors survives; an edge into a
    // plain node steps back with the node it reached.
    if (mainMode && !near) {
      const a = env.atlas.nodes.get(edge.from);
      const b = env.atlas.nodes.get(edge.to);
      if ((a && a.class === 'node') || (b && b.class === 'node')) continue;
    }
    const seg = segment(env, edge);
    if (!seg) continue;
    // The focused family's own fabric stays bright while everything else dims.
    const inFocus = view.clusterFocus && view.clusterFocus.has(edge.from) && view.clusterFocus.has(edge.to);
    const color = near || inFocus ? theme.edge : dim ? withAlpha(theme.edgeDim, 0.5) : theme.edgeDim;
    if (edge.kind === 'shares-gear') ctx.setLineDash([7 * env.px, 5 * env.px]);
    stroke(ctx, seg.a, seg.b, color, (edge.kind === 'shares-gear' ? 1.5 : 1.1) * env.px);
    ctx.setLineDash([]);
  }
}

/**
 * Pass 5: the visitor's own path, lit as one continuous gold thread.
 * Three additive passes, widest and faintest first.
 */
export function drawRoute(env) {
  const { ctx, view, theme } = env;
  if (!view.route.size) return;
  const segs = [];
  for (const edge of env.atlas.edges) {
    if (!view.route.has(edge.key)) continue;
    const seg = segment(env, edge);
    if (seg) segs.push(seg);
  }
  if (!segs.length) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const passes = [
    [9, withAlpha(theme.route, 0.1)],
    [5, withAlpha(theme.route, 0.18)],
    [2.4, withAlpha(theme.routeBright, 0.55)],
  ];
  for (const [width, color] of passes) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * env.px;
    ctx.beginPath();
    for (const seg of segs) {
      ctx.moveTo(seg.a.x, seg.a.y);
      ctx.lineTo(seg.b.x, seg.b.y);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = theme.route;
  ctx.lineWidth = 1.5 * env.px;
  ctx.beginPath();
  for (const seg of segs) {
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
  }
  ctx.stroke();
}

/**
 * Pass 5b: the ties the visitor made by hand. Gold like the route, dashed
 * because a hand tie is the visitor's assertion rather than a corpus fact.
 * Additive underglow first, then the bright dash, no filter.
 */
export function drawPersonalEdges(env) {
  const { ctx, view, theme } = env;
  if (!view.personal.length) return;
  const segs = [];
  for (const [a, b] of view.personal) {
    const seg = segment(env, { from: a, to: b });
    if (seg) segs.push(seg);
  }
  if (!segs.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.setLineDash([6 * env.px, 5 * env.px]);
  ctx.strokeStyle = withAlpha(theme.route, 0.2);
  ctx.lineWidth = 5 * env.px;
  ctx.beginPath();
  for (const seg of segs) {
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([6 * env.px, 5 * env.px]);
  ctx.strokeStyle = withAlpha(theme.routeBright, 0.85);
  ctx.lineWidth = 1.6 * env.px;
  ctx.beginPath();
  for (const seg of segs) {
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Pass 6: the friend's thread, drawn beside yours in its own colour. */
export function drawCompareEdges(env) {
  const { ctx, view, theme } = env;
  const cmp = view.compare;
  if (!cmp) return;
  const theirs = (id) => cmp.both.has(id) || cmp.theirsOnly.has(id);
  ctx.setLineDash([9 * env.px, 6 * env.px]);
  for (const edge of env.atlas.edges) {
    if (edge.kind === 'draws-on') continue;
    if (!theirs(edge.from) || !theirs(edge.to)) continue;
    const seg = segment(env, edge);
    if (!seg) continue;
    const shared = cmp.both.has(edge.from) && cmp.both.has(edge.to);
    stroke(ctx, seg.a, seg.b, shared ? theme.compareBoth : theme.compareTheirs, 2 * env.px);
  }
  // Their hand ties, in a tighter dash so an asserted link reads apart from
  // the corpus fabric on their side too.
  ctx.setLineDash([4 * env.px, 4 * env.px]);
  for (const [a, b] of cmp.personal || []) {
    const seg = segment(env, { from: a, to: b });
    if (!seg) continue;
    const shared = cmp.both.has(a) && cmp.both.has(b);
    stroke(ctx, seg.a, seg.b, shared ? theme.compareBoth : theme.compareTheirs, 1.6 * env.px);
  }
  ctx.setLineDash([]);
}
