import { $ } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { select, leaveFocus, leaveInner, closeBuild, stopCompare } from './actions.js';
import { followConnection } from './atlas-navigation.js';
import { paint, announce } from './render.js';
import { boundsOfIds } from './atlas/layout.js';
import { TRAILS_KEY, readSavedTrails, loadCuratedTrails, isConnectedTrail, saveNamedTrail, removeNamedTrail, restoreNamedTrail } from './trail-model.js';
import { renderTrailLibrary, renderTrailError, trailCopy as say } from './trail-view.js';

const refresh = (s) => Object.assign(s.trails, readSavedTrails());
const canvasFocus = () => $('atlasCanvas').focus({ preventScroll: true });

async function fetchCatalog(s) {
  if (s.trails.loading || s.trails.catalog.length) return;
  s.trails.loading = true;
  s.trails.failed = false;
  renderTrailLibrary(s);
  try { s.trails.catalog = await loadCuratedTrails(s.atlas); }
  catch { s.trails.failed = true; }
  finally {
    s.trails.loading = false;
    if (!s.trails.edit && !$('trailModal').hidden) renderTrailLibrary(s);
  }
}

function openLibrary(s, trigger) {
  refresh(s);
  s.trails.edit = null;
  s.trails.removed = null;
  renderTrailLibrary(s);
  trigger?.focus({ preventScroll: true });
  openModal('trailModal');
  fetchCatalog(s);
}

function editRoute(s, route, trigger) {
  refresh(s);
  const path = route?.path || s.walk.journey?.path || s.walk.path;
  const existing = route || s.trails.routes.find((item) => item.path.join('|') === path.join('|'));
  s.trails.edit = { id: existing?.id, name: existing?.name || s.walk.journey?.title || '', path: path.slice() };
  renderTrailLibrary(s);
  if ($('trailModal').hidden) {
    trigger?.focus({ preventScroll: true });
    openModal('trailModal');
  }
  $('trailName').focus();
}

function fitJourney(s) {
  const bounds = boundsOfIds(s.layout, s.walk.journey.path, 60);
  const mobile = matchMedia('(max-width: 940px)').matches;
  const top = mobile ? 85 : 105;
  const bottom = mobile ? 245 : 95;
  const zoom = Math.max(s.camera.minZoom, Math.min(1.1, (s.camera.w - 56) / (bounds.maxX - bounds.minX), Math.max(80, s.camera.h - top - bottom) / (bounds.maxY - bounds.minY)));
  s.camera.flyTo({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 + (bottom - top) / (2 * zoom), zoom });
}

export function startJourney(s, route) {
  if (!isConnectedTrail(s.atlas, route.path)) { renderTrailError(s, 'path'); return; }
  closeModal('trailModal');
  if (s.inner) leaveInner(s);
  if (s.build) closeBuild(s);
  if (s.comparison) stopCompare(s);
  s.linking = null;
  s.pathing = null;
  leaveFocus(s);
  s.tracePath = [];
  s.focusRing = new Set();
  select(s, route.path[0]);
  s.walk.path = [route.path[0]];
  s.walk.journey = { title: route.name || route.title, path: route.path.slice(), notes: route.notes || [], step: 0 };
  s.walk.motion = null;
  document.body.classList.remove('side-open');
  $('panelToggle').setAttribute('aria-expanded', String(!matchMedia('(max-width: 940px)').matches && !document.body.classList.contains('side-collapsed')));
  $('side').scrollTop = 0;
  paint(s);
  fitJourney(s);
  canvasFocus();
  announce(`${s.walk.journey.title}. 1/${route.path.length}. ${s.atlas.nodes.get(route.path[0]).label}`);
}

export function bindTrails(s) {
  s.trails = { ...readSavedTrails(), catalog: [], loading: false, failed: false, tab: 'suggested', edit: null, removed: null };
  $('trailLibraryBtn').addEventListener('click', (event) => openLibrary(s, event.currentTarget));
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const d = button.dataset;
    if ('trailSave' in d) editRoute(s, null, button);
    else if ('trailTab' in d) {
      s.trails.tab = d.trailTab;
      refresh(s);
      renderTrailLibrary(s);
      $('trailLibrary').querySelector(`[data-trail-tab="${s.trails.tab}"]`).focus();
    } else if ('trailRetry' in d) fetchCatalog(s);
    else if ('trailOpen' in d) {
      refresh(s);
      const route = (d.source === 'saved' ? s.trails.routes : s.trails.catalog).find((item) => item.id === d.trailOpen);
      if (route) startJourney(s, route);
      else renderTrailError(s, 'missing');
    } else if ('trailRename' in d) {
      const route = s.trails.routes.find((item) => item.id === d.trailRename);
      if (route) editRoute(s, route);
    } else if ('trailCancel' in d) {
      s.trails.edit = null;
      renderTrailLibrary(s);
      $('trailLibrary').querySelector('[data-trail-tab]')?.focus();
    } else if ('trailRemove' in d || 'trailUndo' in d) {
      const result = 'trailRemove' in d ? removeNamedTrail(d.trailRemove) : restoreNamedTrail(s.trails.removed);
      if (!result.ok) { renderTrailError(s, result.reason); return; }
      refresh(s);
      s.trails.removed = result.removed || null;
      renderTrailLibrary(s);
      $('trailLibrary').querySelector('[data-trail-undo], [data-trail-tab="saved"]')?.focus();
    } else if ('journeyNext' in d || 'journeyBack' in d) {
      const j = s.walk.journey;
      if (!j) return;
      const host = button.closest('.journey');
      const direction = 'journeyNext' in d ? 1 : -1;
      const to = j.path[j.step + direction];
      if (to) followConnection(s, j.path[j.step], to);
      const primary = direction > 0 ? '[data-journey-next]' : '[data-journey-back]:not([disabled])';
      (host?.querySelector(primary) || host?.querySelector('[data-journey-next], [data-journey-back]:not([disabled])'))?.focus({ preventScroll: true });
    } else if ('journeyFit' in d && s.walk.journey) fitJourney(s);
    else if ('journeyClose' in d) { s.walk.journey = null; paint(s); canvasFocus(); }
  });
  $('trailLibrary').addEventListener('submit', (event) => {
    if (event.target.id !== 'trailForm') return;
    event.preventDefault();
    const result = saveNamedTrail(s.atlas, { ...s.trails.edit, name: $('trailName').value });
    if (!result.ok) { renderTrailError(s, result.reason); return; }
    s.trails.edit = null;
    s.trails.tab = 'saved';
    s.trails.removed = null;
    refresh(s);
    renderTrailLibrary(s);
    $('trailLibrary').querySelector('[data-trail-tab="saved"]').focus();
    announce(say(s, 'Route saved in this browser.', 'Ruta guardada en este navegador.'));
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== TRAILS_KEY && event.key !== null) return;
    refresh(s);
    if (!$('trailModal').hidden && !s.trails.edit) renderTrailLibrary(s);
  });
}
