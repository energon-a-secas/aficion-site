// ── The frame ────────────────────────────────────────────────
// Owns the frame and nothing else: clear, backdrop, one camera.applyTo, then
// the passes in their fixed order. Draw order is a contract; changing it is a
// contract 3 amendment.
//
// No draw file reads state.js. The renderer is handed a ViewModel and reads
// nothing else, which is what keeps it independent of the UI.
//
// ctx.filter is never set anywhere under js/atlas/. It is not Baseline, WebKit
// has never shipped it, and a glow built on it looks correct on Chrome and does
// nothing at all on every iPhone.

import { resolveTheme, onThemeChange, withAlpha } from './theme.js';
import { drawDrawsOn, drawBaseEdges, drawRoute, drawPersonalEdges, drawCompareEdges } from './draw-edges.js';
import { drawCoreNodes, drawPlainNodes, drawNotables, drawHub, drawHalos, drawRings } from './draw-nodes.js';
import { drawLabels } from './draw-labels.js';

// ── Starfield ────────────────────────────────────────────────
// Deterministic like the layout: the same sky on every visit, seeded and
// placed in world space so the stars belong to the map, not to the screen.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(world) {
  const rnd = mulberry32(20260901);
  const stars = [];
  for (let i = 0; i < 420; i++) {
    stars.push({
      x: world.minX + rnd() * (world.maxX - world.minX),
      y: world.minY + rnd() * (world.maxY - world.minY),
      r: 0.7 + rnd() * 1.5,
      a: 0.06 + rnd() * 0.2,
    });
  }
  return stars;
}

export function createRenderer(canvas, atlas, layout) {
  const ctx = canvas.getContext('2d');
  let camera = null;
  let view = null;
  let theme = resolveTheme();
  const stars = makeStars(atlas.meta.world);
  let pending = 0;
  let dead = false;

  const dropTheme = onThemeChange((next) => {
    theme = next;
    api.requestFrame();
  });

  /** The wash behind everything: a flat ground plus one soft centre glow. */
  function backdrop() {
    const { dpr, w, h } = camera;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.void;
    ctx.fillRect(0, 0, w, h);
    const c = camera.toScreen(0, 0);
    const r = Math.max(w, h) * 0.72;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, withAlpha(theme.hub, 0.07));
    g.addColorStop(0.55, withAlpha(theme.nodeCore, 0.03));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Pass 2b: the sky. Stars recede as you zoom in, a cheap depth cue. */
  function starfield(env) {
    const shrink = Math.max(1, Math.sqrt(env.camera.zoom));
    ctx.fillStyle = env.theme.label;
    for (const st of stars) {
      if (st.x < env.rect.minX || st.x > env.rect.maxX || st.y < env.rect.minY || st.y > env.rect.maxY) continue;
      ctx.globalAlpha = st.a;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r / shrink, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** One translucent disc per cluster, so a constellation reads as a region.
      Tinted with the cluster's declared accent, so a region also has a hue. */
  function hulls(env) {
    for (const [id, hull] of layout.hulls) {
      const cluster = atlas.clusters.get(id);
      const accent = cluster && cluster.accent ? env.theme.accents[cluster.accent] : null;
      const g = ctx.createRadialGradient(hull.cx, hull.cy, hull.r * 0.15, hull.cx, hull.cy, hull.r);
      g.addColorStop(0, accent ? withAlpha(accent, 0.085) : env.theme.hull);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hull.cx, hull.cy, hull.r, 0, Math.PI * 2);
      ctx.fill();
      // The region's edge, barely there: a boundary to sense, not a fence.
      ctx.strokeStyle = accent ? withAlpha(accent, 0.16) : env.theme.hullEdge;
      ctx.lineWidth = 1.2 * env.px;
      ctx.setLineDash([10 * env.px, 14 * env.px]);
      ctx.beginPath();
      ctx.arc(hull.cx, hull.cy, hull.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function paint() {
    pending = 0;
    if (dead || !camera || !view) return;
    backdrop();
    camera.applyTo(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const env = {
      ctx,
      atlas,
      layout,
      camera,
      view,
      theme,
      rect: camera.viewRect(120),
      px: 1 / camera.zoom, // one CSS pixel, expressed in world units
    };

    starfield(env);
    hulls(env);
    drawDrawsOn(env);
    drawBaseEdges(env);
    drawRoute(env);
    drawPersonalEdges(env);
    drawCompareEdges(env);
    drawCoreNodes(env);
    drawPlainNodes(env);
    drawNotables(env);
    drawHub(env);
    drawHalos(env);
    drawRings(env);
    drawLabels(env);
  }

  const api = {
    setCamera(next) {
      camera = next;
    },
    setView(next) {
      view = next;
    },
    requestFrame() {
      if (pending || dead) return;
      pending = requestAnimationFrame(paint);
    },
    destroy() {
      dead = true;
      if (pending) cancelAnimationFrame(pending);
      dropTheme();
    },
  };
  return api;
}
