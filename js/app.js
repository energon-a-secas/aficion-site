// ── Entry point ──────────────────────────────────────────────
// Import, load, wire, first render. Nothing else lives here.

import { $ } from './utils.js';
import { state, loadPrefs, restoreProfile, applySavedCamera } from './state.js';
import { loadAtlas, ensureNodes } from './atlas/load.js';
import { computeLayout } from './atlas/layout.js';
import { createCamera } from './atlas/camera.js';
import { buildIndex } from './atlas/pick.js';
import { createRenderer } from './atlas/draw.js';
import { computeRoutes } from './alloc.js';
import { readHash, hasSaved } from './profile.js';
import { render, showFatal } from './render.js';
import { bindEvents, applyHash } from './events.js';
import { seedStarter, openNode } from './actions.js';
import { openTour } from './tour.js';

async function init() {
  loadPrefs();
  restoreProfile();
  try {
    state.atlas = await loadAtlas(state.prefs.lang === 'es' ? 'data-es/' : 'data/');
  } catch (err) {
    showFatal(err.detail || err.message);
    return;
  }
  const canvas = $('atlasCanvas');
  state.layout = computeLayout(state.atlas);
  state.camera = createCamera(canvas, state.layout.bounds);
  state.index = buildIndex(state.atlas, state.layout);
  state.renderer = createRenderer(canvas, state.atlas, state.layout);
  state.renderer.setCamera(state.camera);
  applySavedCamera(state.camera, state.layout);
  await ensureNodes(state.atlas, state.profile.n);
  state.routes = computeRoutes(state.atlas, new Set(state.profile.n), state.profile.e || []);
  render(state);
  bindEvents(state);
  const hash = readHash();
  const deep = /^#node=([a-z0-9.-]+)$/.exec(location.hash || '');
  if (hash) await applyHash(state, hash);
  else if (!state.profile.n.length && !hasSaved()) await seedStarter(state);
  if (deep) await openNode(state, deep[1]);
  if (!state.prefs.seenTour) openTour();
}

init();
