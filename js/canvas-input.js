// ── Canvas input ─────────────────────────────────────────────
// The pointer and keyboard half of the event layer, split from events.js when
// link mode and the touch long-press pushed that file past its 500-line
// budget. Same rules apply: listeners only; what a listener does is
// actions.js, and nothing is exposed on window.

import { $ } from './utils.js';
import { savePrefs, rememberCamera } from './state.js';
import { nodeAt, nodeToward } from './atlas/pick.js';
import { openContextMenu, closeContextMenu } from './context-menu.js';
import { hoverCompass, followConnection } from './atlas-navigation.js';
import { compassTargets } from './atlas/traversal.js';
import { paint, announce } from './render.js';
import { renderHint } from './stage.js';
import {
  select,
  toggleNode,
  fitMine,
  drillInto,
  leaveInner,
  leaveFocus,
} from './actions.js';
import { startLink, cancelLink, completeLink, startPath, cancelPath, completePath } from './links.js';

const LONG_PRESS_MS = 550;

export function bindCanvas(s) {
  const canvas = $('atlasCanvas');
  if (!canvas) return;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map();
  let pinch = 0;
  let pinched = false;
  let lpTimer = 0;
  let lpFired = false;
  let suppressClick = false;
  let linkedAt = 0;
  let doubleTarget = null;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    closeContextMenu();
    s.camera.stop();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (!s.prefs.seenIntro) {
      s.prefs.seenIntro = true;
      savePrefs();
      renderHint(s);
    }
    if (pointers.size === 1) {
      dragging = true;
      moved = 0;
      const p = local(e);
      lastX = p.x;
      lastY = p.y;
      // iOS never fires contextmenu, so a still touch becomes the quick menu.
      // Android fires both; reopening the same menu for one press is a
      // repaint, not a second menu.
      lpFired = false;
      if (e.pointerType === 'touch') {
        lpTimer = setTimeout(() => {
          if (!dragging || moved > 6) return;
          const hit = nodeAt(s.index, s.camera, p.x, p.y);
          if (!hit) return;
          dragging = false;
          lpFired = true;
          select(s, hit);
          openContextMenu(s, hit, p.x, p.y);
        }, LONG_PRESS_MS);
      }
    } else {
      clearTimeout(lpTimer);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      clearTimeout(lpTimer);
      pinched = true;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) s.camera.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch);
      pinch = dist;
      return;
    }
    if (dragging) {
      moved += Math.abs(p.x - lastX) + Math.abs(p.y - lastY);
      if (moved > 6) {
        clearTimeout(lpTimer);
        s.walk.dragging = true;
        s.walk.hover = null;
      }
      s.camera.panBy(p.x - lastX, p.y - lastY);
      lastX = p.x;
      lastY = p.y;
      s.camera.clampTo(s.atlas.meta.world);
      return;
    }
    const hit = nodeAt(s.index, s.camera, p.x, p.y);
    hoverCompass(s, hit);
    canvas.style.cursor = s.linking || s.pathing ? 'crosshair' : hit ? 'pointer' : '';
    if (hit !== s.hover) {
      s.hover = hit;
      paint(s);
    }
  });

  canvas.addEventListener('pointerleave', () => { s.hover = null; hoverCompass(s, null); });

  // A drag that moved more than a few pixels is a pan, not a click.
  canvas.addEventListener('pointerup', (e) => {
    clearTimeout(lpTimer);
    s.walk.dragging = false;
    pointers.delete(e.pointerId);
    paint(s);
    if (pointers.size < 2) pinch = 0;
    if (pinched) {
      // A pinch is never a click: neither finger lifting may select, tie or
      // cancel anything. The gesture closes when the last finger leaves.
      dragging = false;
      if (pointers.size === 0) pinched = false;
      return;
    }
    if (lpFired) {
      // The long-press already answered this press; the lifted finger is not
      // also a click, and iOS synthesises one that must not reach the
      // document handler (which would close the menu the press just opened).
      lpFired = false;
      dragging = false;
      suppressClick = true;
      return;
    }
    if (!dragging) return;
    dragging = false;
    if (moved > 6) {
      rememberCamera(s.camera);
      return;
    }
    // Only the primary button acts as a click; right-click is the menu's.
    if (e.button !== 0) return;
    const p = local(e);
    const hit = nodeAt(s.index, s.camera, p.x, p.y);
    if (s.linking) {
      if (hit) {
        linkedAt = performance.now();
        completeLink(s, hit);
      } else cancelLink(s);
      return;
    }
    if (s.pathing) {
      if (hit) completePath(s, hit);
      else cancelPath(s);
      return;
    }
    if (hit && e.shiftKey) toggleNode(s, hit);
    else if (hit && s.selected && connectedTo(s, s.selected, hit)) followConnection(s, s.selected, hit);
    else select(s, hit, { centre: !!hit });
  });

  // One-shot swallow of the click a long-press leaves behind.
  canvas.addEventListener('click', (e) => {
    if (!suppressClick) {
      // Keep the first destination if its camera flight moves the dot before
      // the second click arrives.
      if (e.detail === 1) doubleTarget = s.selected;
      return;
    }
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.addEventListener('pointercancel', (e) => {
    clearTimeout(lpTimer);
    s.walk.dragging = false;
    pointers.delete(e.pointerId);
    paint(s);
    if (pointers.size === 0) pinched = false;
    dragging = false;
  });

  canvas.addEventListener('dblclick', (e) => {
    // A double-click opens depth; saving remains an explicit, quiet action.
    if (linkedAt && performance.now() - linkedAt < 500) return;
    const p = local(e);
    const hit = doubleTarget || nodeAt(s.index, s.camera, p.x, p.y);
    if (hit) drillInto(s, hit);
  });

  // Right-click: the quick menu. Selecting first keeps the panel and the menu
  // telling one story about the same node.
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = local(e);
    const hit = nodeAt(s.index, s.camera, p.x, p.y);
    if (!hit) {
      closeContextMenu();
      return;
    }
    select(s, hit);
    openContextMenu(s, hit, p.x, p.y);
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      closeContextMenu();
      const p = local(e);
      s.camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0028));
      s.camera.clampTo(s.atlas.meta.world);
      rememberCamera(s.camera);
    },
    { passive: false },
  );

  canvas.addEventListener('keydown', (e) => onCanvasKey(s, e));
}

// ── Keyboard ─────────────────────────────────────────────────
// A canvas has no tab order, so arrow keys follow actual connections and
// render.js announces the landing node through the live region. This is the
// route across the map for anyone not using a pointer.
const ARROWS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function onCanvasKey(s, e) {
  const dir = ARROWS[e.key];
  if (dir) {
    e.preventDefault();
    if (e.shiftKey) {
      s.camera.panBy(-dir[0] * 90, -dir[1] * 90);
      s.camera.clampTo(s.atlas.meta.world);
      return;
    }
    if (!s.selected) { select(s, s.atlas.hubId, { centre: true }); return; }
    if (s.linking || s.pathing) {
      const next = nodeToward(s.index, s.selected, ...dir);
      if (next) select(s, next, { centre: true });
      return;
    }
    const next = compassTargets(s.atlas, s.layout, s.selected).find((target) => target.dx === dir[0] && target.dy === dir[1]);
    if (next) followConnection(s, s.selected, next.link.to);
    else announce(s.prefs.lang === 'es' ? 'No hay una conexión en esa dirección.' : 'No connection in that direction.');
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && s.selected) {
    e.preventDefault();
    // In link mode Enter ties the walked-to node; in path mode it traces;
    // outside both, Enter marks.
    if (s.linking) completeLink(s, s.selected);
    else if (s.pathing) completePath(s, s.selected);
    else toggleNode(s, s.selected);
    return;
  }
  if (e.key === 'Escape') {
    if (s.linking) cancelLink(s);
    else if (s.pathing) cancelPath(s);
    else if (s.inner) leaveInner(s);
    else if (s.walk.path.length > 1) { s.walk.path = []; s.walk.motion = null; paint(s); }
    else if (s.focusRing.size) {
      s.focusRing = new Set();
      paint(s);
    } else if (s.clusterFocus) leaveFocus(s);
    else select(s, null);
    return;
  }
  if (e.key === 'Backspace' && s.walk.path.length > 1) {
    e.preventDefault();
    followConnection(s, s.walk.path.at(-1), s.walk.path.at(-2));
    return;
  }
  const key = e.key.toLowerCase();
  if (key === 'f') s.camera.flyTo(s.layout.bounds);
  else if (key === 'm') fitMine(s);
  else if (key === 'i' && s.selected) drillInto(s, s.selected);
  else if (key === 'l' && s.selected) startLink(s, s.selected);
  else if (key === 'p' && s.selected) startPath(s, s.selected);
  else if (key === '+' || key === '=') s.camera.zoomAt(s.camera.w / 2, s.camera.h / 2, 1.4);
  else if (key === '-') s.camera.zoomAt(s.camera.w / 2, s.camera.h / 2, 0.714);
}

function connectedTo(s, from, to) {
  return from !== to && to !== s.atlas.hubId && (s.atlas.adj.get(from) || []).some((link) => link.to === to);
}
