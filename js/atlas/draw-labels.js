// ── Label pass (draw order 13) ───────────────────────────────
// Labels are drawn in screen space, not world space: text scaled by a world
// transform goes soft the moment the zoom is not 1, and a label that shrinks
// with the map stops being readable long before the node it names does.
// draw.js has already spent its one world setTransform; this pass swaps to the
// device-pixel transform for its own duration and touches nothing else.
//
// Level of detail plus collision rejection: at a low zoom only the anchors and
// the visitor's own nodes are named, and a label that would overlap one already
// placed is dropped rather than drawn on top of it.

import { withAlpha } from './theme.js';
import { NODE_RADIUS } from './pick.js';

const ZOOM_NOTABLE = 0.34;
const ZOOM_CORE = 0.5;
const ZOOM_NODE = 0.95;
const LINE_H = 15;

function overlaps(boxes, box) {
  for (const b of boxes) {
    if (box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y) return true;
  }
  return false;
}

function priorityOf(env, id, node) {
  const { view } = env;
  if (view.selected === id || view.hover === id) return 0;
  if (view.allocated.has(id)) return 1;
  if (view.focus.has(id)) return 2;
  if (view.suggested.has(id)) return 3;
  if (node.class === 'hub') return 4;
  if (node.class === 'notable') return 5;
  if (node.class === 'core') return 6;
  return 7;
}

function named(view, id) {
  if (view.selected === id || view.hover === id || view.allocated.has(id) || view.focus.has(id)) return true;
  // A suggestion is named only while it is the story on screen. A compare or a
  // build is its own story, and the map dims everything outside it: six names
  // at full strength over six dimmed dots is the noise this channel avoids.
  return view.suggested.has(id) && !view.compare && !view.build;
}

function wanted(env, id, node) {
  const { view, camera } = env;
  if (view.labelMode === 'none') return false;
  if (named(view, id)) return true;
  if (view.labelMode === 'all') return true;
  if (node.class === 'hub') return true;
  if (node.class === 'notable') return camera.zoom >= ZOOM_NOTABLE;
  if (node.class === 'core') return camera.zoom >= ZOOM_CORE;
  return camera.zoom >= ZOOM_NODE;
}

export function drawLabels(env) {
  const { ctx, camera, theme, view } = env;
  if (view.labelMode === 'none' && !view.selected && !view.hover) return;

  ctx.setTransform(camera.dpr, 0, 0, camera.dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const candidates = [];
  for (const id of env.atlas.topNodes) {
    const node = env.atlas.nodes.get(id);
    if (!wanted(env, id, node)) continue;
    const p = env.layout.pos.get(id);
    if (!p) continue;
    const s = camera.toScreen(p.x, p.y);
    if (s.x < -120 || s.y < -40 || s.x > camera.w + 120 || s.y > camera.h + 40) continue;
    candidates.push({ id, node, s, pri: priorityOf(env, id, node) });
  }
  candidates.sort((a, b) => a.pri - b.pri);

  const boxes = [];
  for (const c of candidates) {
    const strong = c.pri <= 3 || c.node.class === 'hub' || c.node.class === 'notable';
    ctx.font = `${strong ? '600 13px ' : '11.5px '}${theme.font}`;
    const text = c.node.label;
    const w = ctx.measureText(text).width;
    const gap = (NODE_RADIUS[c.node.class] || NODE_RADIUS.node) * camera.zoom;
    const box = {
      x: c.s.x - w / 2 - 4,
      y: c.s.y + Math.min(28, gap + 6),
      w: w + 8,
      h: LINE_H,
    };
    if (overlaps(boxes, box)) continue;
    boxes.push(box);

    ctx.fillStyle = withAlpha(theme.labelShadow, 0.72);
    ctx.fillRect(box.x, box.y - 1, box.w, box.h + 1);
    if (view.allocated.has(c.id)) ctx.fillStyle = theme.route;
    else if (view.suggested.has(c.id)) ctx.fillStyle = theme.suggest;
    else if (c.pri === 0) ctx.fillStyle = theme.label;
    else ctx.fillStyle = strong ? theme.label : theme.labelDim;
    ctx.fillText(text, c.s.x, box.y);
  }

  drawClusterTitles(env, boxes);
}

/** Cluster names sit over the wash while the map is zoomed out, then step aside. */
function drawClusterTitles(env, boxes) {
  const { ctx, camera, theme } = env;
  if (camera.zoom > 0.8 || env.view.labelMode === 'none') return;
  ctx.font = `600 12px ${theme.font}`;
  for (const [id, hull] of env.layout.hulls) {
    const cluster = env.atlas.clusters.get(id);
    if (!cluster) continue;
    const s = camera.toScreen(hull.cx, hull.cy - hull.r);
    if (s.x < -80 || s.y < -30 || s.x > camera.w + 80 || s.y > camera.h + 30) continue;
    const text = cluster.label.toUpperCase();
    const w = ctx.measureText(text).width;
    const box = { x: s.x - w / 2 - 4, y: s.y - 16, w: w + 8, h: LINE_H };
    if (overlaps(boxes, box)) continue;
    boxes.push(box);
    ctx.fillStyle = withAlpha(theme.labelDim, 0.85);
    ctx.fillText(text, s.x, box.y);
  }
}
