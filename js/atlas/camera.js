// ── Camera ───────────────────────────────────────────────────
// Pan, zoom, clamp, fit, fly. toWorld and toScreen are derived from the same
// numbers applyTo uses, which is the one place a renderer and a hit-tester can
// silently disagree; the disagreement shows up as clicks landing on the wrong
// node at a non-unit device pixel ratio. Discipline copied from
// projects/minimap-site/js/render.js:72 and :477-486. fit() is the computation
// at projects/cartograph-site/js/canvas.js:199-215.

import { clamp, prefersReducedMotion } from '../utils.js';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export function createCamera(canvas, fitBounds = null) {
  const listeners = new Set();
  let flight = null;

  const cam = {
    x: 0,
    y: 0,
    zoom: 1,
    dpr: 1,
    w: 1,
    h: 1,
    minZoom: MIN_ZOOM,

    resize() {
      const rect = canvas.getBoundingClientRect();
      cam.dpr = Math.min(2, window.devicePixelRatio || 1);
      cam.w = Math.max(1, Math.round(rect.width));
      cam.h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(cam.w * cam.dpr);
      canvas.height = Math.round(cam.h * cam.dpr);
      // The zoom floor is stage-aware. MIN_ZOOM was tuned on desktop widths;
      // on a phone it left "Fit the whole atlas" unreachable (a 375px stage
      // needs about 0.07 for this world). The floor is whatever fits the full
      // layout bounds plus flyTo's padding, never higher than MIN_ZOOM.
      if (fitBounds) {
        const bw = fitBounds.maxX - fitBounds.minX + 320;
        const bh = fitBounds.maxY - fitBounds.minY + 320;
        cam.minZoom = Math.min(MIN_ZOOM, cam.w / bw, cam.h / bh);
      }
      emit();
    },

    toWorld(sx, sy) {
      return { x: cam.x + (sx - cam.w / 2) / cam.zoom, y: cam.y + (sy - cam.h / 2) / cam.zoom };
    },

    toScreen(wx, wy) {
      return { x: (wx - cam.x) * cam.zoom + cam.w / 2, y: (wy - cam.y) * cam.zoom + cam.h / 2 };
    },

    /** Exactly one setTransform per frame establishes world space. */
    applyTo(ctx) {
      const k = cam.zoom * cam.dpr;
      ctx.setTransform(k, 0, 0, k, (cam.w / 2) * cam.dpr - cam.x * k, (cam.h / 2) * cam.dpr - cam.y * k);
    },

    /** The world rectangle currently on screen, for culling. */
    viewRect(margin = 0) {
      const a = cam.toWorld(-margin, -margin);
      const b = cam.toWorld(cam.w + margin, cam.h + margin);
      return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
    },

    panBy(dxScreen, dyScreen) {
      cam.x -= dxScreen / cam.zoom;
      cam.y -= dyScreen / cam.zoom;
      emit();
    },

    /** Keeps the world point under (sx, sy) fixed while the scale changes. */
    zoomAt(sx, sy, factor) {
      const before = cam.toWorld(sx, sy);
      const next = clamp(cam.zoom * factor, cam.minZoom, MAX_ZOOM);
      if (next === cam.zoom) return;
      cam.zoom = next;
      const after = cam.toWorld(sx, sy);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      emit();
    },

    fit(bounds, padding = 80) {
      const bw = Math.max(1, bounds.maxX - bounds.minX);
      const bh = Math.max(1, bounds.maxY - bounds.minY);
      cam.zoom = clamp(
        Math.min(cam.w / (bw + padding * 2), cam.h / (bh + padding * 2)),
        cam.minZoom,
        MAX_ZOOM,
      );
      cam.x = (bounds.minX + bounds.maxX) / 2;
      cam.y = (bounds.minY + bounds.maxY) / 2;
      emit();
    },

    /** target is a bounds box or a world point. Reduced motion jumps instead. */
    flyTo(target, { ms = 420, padding = 160 } = {}) {
      const to = targetState(cam, target, padding);
      if (prefersReducedMotion() || ms <= 0) {
        cam.x = to.x;
        cam.y = to.y;
        cam.zoom = to.zoom;
        emit();
        return;
      }
      const from = { x: cam.x, y: cam.y, zoom: cam.zoom };
      const start = performance.now();
      if (flight) cancelAnimationFrame(flight);
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        cam.x = from.x + (to.x - from.x) * e;
        cam.y = from.y + (to.y - from.y) * e;
        cam.zoom = from.zoom + (to.zoom - from.zoom) * e;
        emit();
        flight = t < 1 ? requestAnimationFrame(step) : null;
      };
      flight = requestAnimationFrame(step);
    },

    /** Keeps the camera centre inside the declared world box. */
    clampTo(bounds) {
      cam.x = clamp(cam.x, bounds.minX, bounds.maxX);
      cam.y = clamp(cam.y, bounds.minY, bounds.maxY);
      emit();
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    stop() {
      if (flight) cancelAnimationFrame(flight);
      flight = null;
    },
  };

  function emit() {
    for (const fn of listeners) fn(cam);
  }

  function targetState(c, target, padding) {
    if (typeof target.minX === 'number') {
      const bw = Math.max(1, target.maxX - target.minX);
      const bh = Math.max(1, target.maxY - target.minY);
      return {
        x: (target.minX + target.maxX) / 2,
        y: (target.minY + target.maxY) / 2,
        zoom: clamp(Math.min(c.w / (bw + padding * 2), c.h / (bh + padding * 2)), c.minZoom, MAX_ZOOM),
      };
    }
    return { x: target.x, y: target.y, zoom: target.zoom === undefined ? c.zoom : clamp(target.zoom, c.minZoom, MAX_ZOOM) };
  }

  cam.resize();
  return cam;
}
