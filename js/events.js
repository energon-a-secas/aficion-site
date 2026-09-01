// ── Event handlers ───────────────────────────────────────────
// Every listener on the page, and nothing else: what a listener does is
// actions.js. No inline onclick anywhere. The sidebar and the dialogs render
// markup carrying data-act, and one delegated handler reads it, so a panel that
// is re-rendered never leaves a dead listener or a stale node reference behind.
// Nothing is exposed on window.

import { $, showToast, copyText, debounce } from './utils.js';
import { savePrefs, persistProfile } from './state.js';
import { PROFILE_VERSION } from './profile.js';
import { openModal, closeModal, openModalEl, onModalKeydown } from './modal.js';
import { renderShare, renderBuildPanel } from './panels.js';
import { renderSearch, renderDetail, paint, updateCanvasLabel } from './render.js';
import { bindCanvas } from './canvas-input.js';
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
  startLink,
  cancelLink,
  unlink,
  editLinkNote,
  saveLinkNote,
  openNode,
  startPath,
  cancelPath,
} from './actions.js';
import { closeContextMenu, refreshContextMenu } from './context-menu.js';
import { downloadPostcard } from './postcard.js';
import { openTour, tourNext, tourBack, closeTour } from './tour.js';

export { applyHash };

// The canvas pointer and keyboard listeners live in canvas-input.js.

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
  'link-start': (s, el) => startLink(s, el.dataset.node),
  'link-cancel': (s) => cancelLink(s),
  'path-start': (s, el) => startPath(s, el.dataset.node),
  'path-cancel': (s) => cancelPath(s),
  unlink: (s, el) => unlink(s, el.dataset.a, el.dataset.b),
  'link-note-edit': (s, el) => editLinkNote(s, el.dataset.key),
  'link-note-cancel': (s) => editLinkNote(s, null),
  'link-note-save': (s, el) => {
    const input = el.closest('li')?.querySelector('[data-note-input]');
    saveLinkNote(s, el.dataset.a, el.dataset.b, input ? input.value : '');
  },
  'node-link': async (s, el) => {
    const url = `${location.origin}${location.pathname}#node=${el.dataset.node}`;
    const ok = await copyText(url);
    // replaceState fires no hashchange, so the fallback cannot re-enter the router.
    if (!ok) history.replaceState(null, '', `#node=${el.dataset.node}`);
    showToast(ok ? 'Link to this node copied.' : 'Copy was blocked, so the link is in the address bar instead.');
  },
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
      // Same refusal commit() applies: never write a newer-version profile down.
      if (s.profile.v <= PROFILE_VERSION) persistProfile();
      renderShare(s);
    }, 260),
  );
  $('shareCopy')?.addEventListener('click', async () => {
    const ok = await copyText($('shareUrl').value);
    showToast(ok ? 'Link copied.' : 'Copy did not work. Select the text and copy it.');
  });
  $('postcardBtn')?.addEventListener('click', async () => {
    const ok = await downloadPostcard(s);
    showToast(ok ? 'Postcard saved.' : 'Nothing marked yet, so there is no postcard to make.');
  });

  $('btnCompare')?.addEventListener('click', () => openModal('compareModal'));
  $('compareGo')?.addEventListener('click', () => runCompare(s));
  $('compareClear')?.addEventListener('click', () => {
    $('compareInput').value = '';
    $('compareError').hidden = true;
    stopCompare(s);
  });

  // The language button names the language it switches TO; a reload rebuilds
  // the atlas from the other corpus directory. Ids are shared between the
  // two, so saved maps and share links survive the switch untouched.
  const langBtn = $('langBtn');
  if (langBtn) {
    langBtn.textContent = s.prefs.lang === 'es' ? 'EN' : 'ES';
    langBtn.addEventListener('click', () => {
      s.prefs.lang = s.prefs.lang === 'es' ? 'en' : 'es';
      savePrefs();
      location.reload();
    });
  }

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

  // The tie-note input: Enter saves, Escape abandons. Bound once on the
  // panel's stable body (the input itself is re-rendered), and stopped from
  // propagating so no other Escape path sees it.
  $('detailBody')?.addEventListener('keydown', (e) => {
    if (!e.target.closest('[data-note-input]')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.closest('li')?.querySelector('[data-act="link-note-save"]')?.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      editLinkNote(s, null);
    }
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

  s.camera.onChange(() => s.renderer.requestFrame());
  window.addEventListener(
    'resize',
    debounce(() => {
      s.camera.resize();
      s.renderer.requestFrame();
      // The docked card only exists on narrow stages; crossing the breakpoint
      // with a node selected has to re-decide it. Not while a note is being
      // typed, though: the re-render would wipe the draft mid-word.
      if (!s.linkNoteEdit) renderDetail(s);
    }, 120),
  );

  bindTools(s);
  bindDialogs(s);
  bindSearch(s);

  window.addEventListener('hashchange', () => {
    const parsed = /^#(pj?)=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (parsed) {
      applyHash(s, { key: parsed[1], payload: parsed[2] });
      return;
    }
    const deep = /^#node=([a-z0-9.-]+)$/.exec(location.hash);
    if (deep) openNode(s, deep[1]);
  });

  updateCanvasLabel(s);
}
