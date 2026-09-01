// ── Event handlers ───────────────────────────────────────────
// Every listener on the page, and nothing else: what a listener does is
// actions.js. No inline onclick anywhere. The sidebar and the dialogs render
// markup carrying data-act, and one delegated handler reads it, so a panel that
// is re-rendered never leaves a dead listener or a stale node reference behind.
// Nothing is exposed on window.

import { $, showToast, copyText, debounce } from './utils.js';
import { savePrefs, rememberCamera, persistProfile } from './state.js';
import { nodeAt, nodeToward } from './atlas/pick.js';
import { openModal, closeModal, openModalEl, onModalKeydown } from './modal.js';
import { renderShare, renderBuildPanel } from './panels.js';
import { renderSearch, renderHint, renderDetail, paint, updateCanvasLabel } from './render.js';
import {
  select,
  toggleNode,
  applyLevel,
  trace,
  clearMine,
  fitMine,
  drillInto,
  leaveInner,
  stopCompare,
  runCompare,
  openBuild,
  closeBuild,
  stackBuild,
  openBuilds,
  applyHash,
  compareShared,
  adoptShared,
  dismissShared,
  openSheet,
  closeSheet,
  openExample,
  focusCluster,
  leaveFocus,
  lightAffinity,
} from './actions.js';
import { openContextMenu, closeContextMenu, refreshContextMenu } from './context-menu.js';
import { openTour, tourNext, tourBack, closeTour } from './tour.js';

export { applyHash };

// ── Canvas: pointer ──────────────────────────────────────────
function bindCanvas(s) {
  const canvas = $('atlasCanvas');
  if (!canvas) return;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map();
  let pinch = 0;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    closeContextMenu();
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
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) s.camera.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch);
      pinch = dist;
      return;
    }
    if (dragging) {
      moved += Math.abs(p.x - lastX) + Math.abs(p.y - lastY);
      s.camera.panBy(p.x - lastX, p.y - lastY);
      lastX = p.x;
      lastY = p.y;
      s.camera.clampTo(s.atlas.meta.world);
      return;
    }
    const hit = nodeAt(s.index, s.camera, p.x, p.y);
    canvas.style.cursor = hit ? 'pointer' : '';
    if (hit !== s.hover) {
      s.hover = hit;
      paint(s);
    }
  });

  // A drag that moved more than a few pixels is a pan, not a click.
  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (!dragging) return;
    dragging = false;
    if (moved > 6) {
      rememberCamera(s.camera);
      return;
    }
    const p = local(e);
    const hit = nodeAt(s.index, s.camera, p.x, p.y);
    if (hit && e.shiftKey) toggleNode(s, hit);
    else select(s, hit);
  });

  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    dragging = false;
  });

  canvas.addEventListener('dblclick', (e) => {
    const p = local(e);
    const hit = nodeAt(s.index, s.camera, p.x, p.y);
    if (hit) toggleNode(s, hit);
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
}

// ── Canvas: keyboard ─────────────────────────────────────────
// A canvas has no tab order, so arrow keys walk the graph geometrically and
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
    const next = s.selected ? nodeToward(s.index, s.selected, dir[0], dir[1]) : s.atlas.hubId;
    if (next) select(s, next, { centre: true });
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && s.selected) {
    e.preventDefault();
    toggleNode(s, s.selected);
    return;
  }
  if (e.key === 'Escape') {
    if (s.inner) leaveInner(s);
    else if (s.focusRing.size) {
      s.focusRing = new Set();
      paint(s);
    } else if (s.clusterFocus) leaveFocus(s);
    else select(s, null);
    return;
  }
  const key = e.key.toLowerCase();
  if (key === 'f') s.camera.flyTo(s.layout.bounds);
  else if (key === 'm') fitMine(s);
  else if (key === 'i' && s.selected) drillInto(s, s.selected);
  else if (key === '+' || key === '=') s.camera.zoomAt(s.camera.w / 2, s.camera.h / 2, 1.4);
  else if (key === '-') s.camera.zoomAt(s.camera.w / 2, s.camera.h / 2, 0.714);
}

// ── One delegated handler for every rendered control ─────────
const ACTIONS = {
  select: (s, el) => select(s, el.dataset.node, { centre: true }),
  centre: (s, el) => select(s, el.dataset.node, { centre: true }),
  toggle: (s, el) => toggleNode(s, el.dataset.node),
  level: (s, el) => applyLevel(s, el.dataset.node, Number(el.dataset.level)),
  inner: (s, el) => drillInto(s, el.dataset.node),
  trace: (s, el) => trace(s, el.dataset.path.split(',')),
  'fit-mine': (s) => fitMine(s),
  'clear-mine': (s) => clearMine(s),
  'compare-clear': (s) => stopCompare(s),
  'build-open': (s, el) => openBuild(s, el.dataset.build),
  'build-close': (s) => closeBuild(s),
  'build-apply': (s) => stackBuild(s),
  'build-step': (s, el) => {
    s.buildCursor = Number(el.dataset.index);
    select(s, el.dataset.node, { centre: true });
    renderBuildPanel(s);
  },
  'open-panel': () => {
    document.body.classList.add('side-open');
    $('panelToggle')?.setAttribute('aria-expanded', 'true');
    $('side')?.focus();
  },
  'shared-compare': (s) => compareShared(s),
  'shared-adopt': (s) => adoptShared(s),
  'shared-dismiss': (s) => dismissShared(s),
  'sheet-open': (s) => openSheet(s),
  'example-open': (s) => openExample(s),
  'sheet-goto': (s, el) => {
    closeSheet();
    select(s, el.dataset.node, { centre: true });
  },
  'sheet-trace': (s, el) => {
    closeSheet();
    trace(s, el.dataset.path.split(','));
  },
  'sheet-quest': (s, el) => {
    closeSheet();
    openBuild(s, el.dataset.build);
  },
  'focus-cluster': (s, el) => focusCluster(s, el.dataset.cluster),
  'focus-exit': (s) => leaveFocus(s),
  affinity: (s, el) => lightAffinity(s, el.dataset.tag),
  'tour-open': () => {
    closeModal('helpModal');
    openTour();
  },
  'tour-next': (s) => tourNext(s),
  'tour-back': () => tourBack(),
  'tour-skip': (s) => closeTour(s),
};

function onDelegatedClick(s, e) {
  const modal = e.target.closest('.modal');
  if (modal && !modal.hasAttribute('hidden') && e.target.closest('[data-modal-close]')) closeModal(modal.id);
  // Any click outside the context menu dismisses it; a level click inside
  // refreshes it in place, any other menu action closes it after running.
  const inMenu = e.target.closest('#ctxMenu');
  if (!inMenu) closeContextMenu();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(s, el);
  if (inMenu) {
    if (el.dataset.act === 'level') refreshContextMenu(s);
    else closeContextMenu();
  }
}

function bindTools(s) {
  $('zoomIn')?.addEventListener('click', () => s.camera.zoomAt(s.camera.w / 2, s.camera.h / 2, 1.5));
  $('zoomOut')?.addEventListener('click', () => s.camera.zoomAt(s.camera.w / 2, s.camera.h / 2, 0.667));
  $('fitBtn')?.addEventListener('click', () => s.camera.flyTo(s.layout.bounds));
  $('fitMineBtn')?.addEventListener('click', () => fitMine(s));

  $('drawsOnBtn')?.addEventListener('click', (e) => {
    s.prefs.showDrawsOn = !s.prefs.showDrawsOn;
    e.currentTarget.setAttribute('aria-pressed', String(s.prefs.showDrawsOn));
    savePrefs();
    paint(s);
  });
  $('labelBtn')?.addEventListener('click', (e) => {
    const order = ['auto', 'all', 'none'];
    s.prefs.labelMode = order[(order.indexOf(s.prefs.labelMode) + 1) % order.length];
    const val = e.currentTarget.querySelector('.tool__val');
    if (val) val.textContent = s.prefs.labelMode;
    savePrefs();
    paint(s);
  });
  $('layersBtn')?.addEventListener('click', (e) => {
    s.prefs.layers = s.prefs.layers === 'main' ? 'full' : 'main';
    const val = e.currentTarget.querySelector('.tool__val');
    if (val) val.textContent = s.prefs.layers;
    savePrefs();
    paint(s);
  });
  // One toggle, two modes: below 940px it opens the sheet, above it collapses
  // the sidebar column outright and the map takes the full width.
  const sheetMode = () => window.matchMedia('(max-width: 940px)').matches;
  $('panelToggle')?.addEventListener('click', (e) => {
    let open;
    if (sheetMode()) {
      open = document.body.classList.toggle('side-open');
      if (open) $('side')?.focus();
    } else {
      open = !document.body.classList.toggle('side-collapsed');
      s.prefs.panel = open ? null : 'collapsed';
      savePrefs();
      s.camera.resize();
    }
    e.currentTarget.setAttribute('aria-expanded', String(open));
    // WebKit does not focus a button on click (CLAUDE.md), so the closing
    // branch places focus explicitly.
    if (!open) e.currentTarget.focus();
  });

  // The HTML ships the defaults; persisted prefs have to reach the toggles'
  // faces, or a reload leaves them lying about their state.
  $('drawsOnBtn')?.setAttribute('aria-pressed', String(s.prefs.showDrawsOn));
  const labelVal = $('labelBtn')?.querySelector('.tool__val');
  if (labelVal) labelVal.textContent = s.prefs.labelMode;
  const layersVal = $('layersBtn')?.querySelector('.tool__val');
  if (layersVal) layersVal.textContent = s.prefs.layers;
  if (s.prefs.panel === 'collapsed' && !sheetMode()) {
    document.body.classList.add('side-collapsed');
    s.camera.resize();
  }
  $('panelToggle')?.setAttribute(
    'aria-expanded',
    String(sheetMode() ? document.body.classList.contains('side-open') : !document.body.classList.contains('side-collapsed')),
  );
}

function bindDialogs(s) {
  $('btnShare')?.addEventListener('click', () => {
    openModal('shareModal');
    renderShare(s);
  });
  $('shareName')?.addEventListener(
    'input',
    debounce(() => {
      s.profile = { ...s.profile, t: $('shareName').value.trim().slice(0, 24) || null };
      persistProfile();
      renderShare(s);
    }, 260),
  );
  $('shareCopy')?.addEventListener('click', async () => {
    const ok = await copyText($('shareUrl').value);
    showToast(ok ? 'Link copied.' : 'Copy did not work. Select the text and copy it.');
  });

  $('btnCompare')?.addEventListener('click', () => openModal('compareModal'));
  $('compareGo')?.addEventListener('click', () => runCompare(s));
  $('compareClear')?.addEventListener('click', () => {
    $('compareInput').value = '';
    $('compareError').hidden = true;
    stopCompare(s);
  });

  $('btnBuilds')?.addEventListener('click', () => openBuilds(s));
  $('btnHelp')?.addEventListener('click', () => openModal('helpModal'));
  $('btnSheet')?.addEventListener('click', () => openSheet(s));
  $('sheetClose')?.addEventListener('click', () => closeSheet());
  $('sheetShare')?.addEventListener('click', () => {
    openModal('shareModal');
    renderShare(s);
  });
  // Escape listens on the overlay, never on document: events.js already binds
  // a document Escape for modals, and a second reachable path makes one
  // keypress close two things (CLAUDE.md, the drill-in gotcha).
  $('sheetOverlay')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeSheet();
  });
  $('innerClose')?.addEventListener('click', () => leaveInner(s));

  // Escape has to listen where the focus actually is. Opening the drill-in
  // moves focus to its close button (actions.js), and the only other Escape on
  // this route is onCanvasKey, bound to the canvas, which by then is not
  // focused. Bound on the overlay so it works from the close button and from
  // any row in the list.
  $('innerOverlay')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    leaveInner(s);
  });

  // Same Escape discipline for the two new overlays: each listens on itself.
  $('tourOverlay')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeTour(s);
  });
  $('ctxMenu')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeContextMenu();
    $('atlasCanvas')?.focus();
  });
}

function bindSearch(s) {
  const search = $('searchInput');
  if (!search) return;
  search.addEventListener(
    'input',
    debounce(() => {
      s.search = search.value;
      renderSearch(s);
    }, 140),
  );
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    search.value = '';
    s.search = '';
    renderSearch(s);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || openModalEl()) return;
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    search.focus();
  });
}

export function bindEvents(s) {
  document.addEventListener('keydown', onModalKeydown);
  document.addEventListener('click', (e) => onDelegatedClick(s, e));

  bindCanvas(s);
  $('atlasCanvas')?.addEventListener('keydown', (e) => onCanvasKey(s, e));

  s.camera.onChange(() => s.renderer.requestFrame());
  window.addEventListener(
    'resize',
    debounce(() => {
      s.camera.resize();
      s.renderer.requestFrame();
      // The docked card only exists on narrow stages; crossing the breakpoint
      // with a node selected has to re-decide it.
      renderDetail(s);
    }, 120),
  );

  bindTools(s);
  bindDialogs(s);
  bindSearch(s);

  window.addEventListener('hashchange', () => {
    const parsed = /^#(pj?)=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (parsed) applyHash(s, { key: parsed[1], payload: parsed[2] });
  });

  updateCanvasLabel(s);
}
