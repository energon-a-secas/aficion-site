// ── Shared state ─────────────────────────────────────────────
// One mutable object every module imports, plus the two localStorage keys.
// Both go through the vendored Persist Kit, so a quota failure or private
// browsing degrades to a returned false rather than a thrown exception on the
// boot path. Keys are namespaced with the site name and the format version:
// never skillTreeData and never skillmap-*, which belong to a different product
// served from the same *.neorgon.com origin.

import { safeGetJSON, safeSetJSON } from './neorgon-persist.js';
import { emptyProfile, load as loadProfile, save as saveProfile } from './profile.js';

export const PREFS_KEY = 'aficion:prefs:v1';

const DEFAULT_PREFS = {
  camera: null,
  panel: null,
  showDrawsOn: true,
  labelMode: 'auto',
  seenIntro: false,
};

export const state = {
  atlas: null,
  layout: null,
  camera: null,
  renderer: null,
  index: null,

  profile: emptyProfile(),
  routes: { edges: new Set(), components: [], bridges: [] },
  suggestions: [],

  selected: null,
  hover: null,
  focusRing: new Set(), // ids lit by a bridge trace, and only by one. Escape clears it
  dimOthers: false,

  inner: null,
  build: null,
  buildCursor: 0,

  theirs: null,
  theirName: null,
  comparison: null,
  pendingShared: null, // a decoded link held for the visitor's choice, never persisted

  notice: null, // one quiet line: reconcile results, decode failures
  search: '',
  prefs: { ...DEFAULT_PREFS },
};

export function loadPrefs() {
  const raw = safeGetJSON(PREFS_KEY, null);
  state.prefs = raw && typeof raw === 'object' ? { ...DEFAULT_PREFS, ...raw } : { ...DEFAULT_PREFS };
  return state.prefs;
}

export function savePrefs() {
  return safeSetJSON(PREFS_KEY, state.prefs);
}

export function rememberCamera(camera) {
  state.prefs.camera = { x: camera.x, y: camera.y, zoom: camera.zoom };
  savePrefs();
}

/** Reopen where the visitor left off, or fit the whole atlas on a first visit. */
export function applySavedCamera(camera, layout) {
  const saved = state.prefs.camera;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.zoom)) {
    camera.x = saved.x;
    camera.y = saved.y;
    camera.zoom = saved.zoom;
    camera.clampTo(layout.bounds);
    return;
  }
  camera.fit(layout.bounds);
}

/** The visitor's own map. A profile opened from a link is applied by events.js. */
export function restoreProfile() {
  const saved = loadProfile();
  if (saved) state.profile = saved;
  return state.profile;
}

export function persistProfile() {
  return saveProfile(state.profile);
}

/** The allocated set, rebuilt from the profile whenever it changes. */
export function allocatedSet() {
  return new Set(state.profile.n);
}

export function setNotice(text) {
  state.notice = text || null;
}

/** Level 1 is levels[0]: the profile's indices are 1-based. */
export function levelOf(nodeId) {
  const v = state.profile.l[nodeId];
  return Number.isInteger(v) ? v : null;
}

export function isAllocated(nodeId) {
  return state.profile.n.includes(nodeId);
}
