import { safeGetJSON, safeSetJSON } from './neorgon-persist.js';

export const TRAILS_KEY = 'aficion:trails:v1';
export const MAX_TRAILS = 50;
export const MAX_STOPS = 12;
export const MAX_NAME = 80;
const validId = (id) => typeof id === 'string' && /^[a-z0-9.-]{1,100}$/.test(id);
const validShape = (route) => route && validId(route.id) && typeof route.name === 'string' && route.name.trim().length > 0 && route.name.length <= MAX_NAME && Array.isArray(route.path) && route.path.length >= 2 && route.path.length <= MAX_STOPS && route.path.every(validId) && new Set(route.path).size === route.path.length;

export function isConnectedTrail(atlas, path) {
  return Array.isArray(path) && path.length >= 2 && path.length <= MAX_STOPS && new Set(path).size === path.length && path.every((id, i) => atlas.topNodes.includes(id) && (!i || (atlas.adj.get(path[i - 1]) || []).some((edge) => edge.to === id)));
}

/** Keep structurally valid but unavailable routes so a corpus change never erases them. */
export function readSavedTrails() {
  const raw = safeGetJSON(TRAILS_KEY);
  if (raw?.v > 1) return { routes: [], readonly: true };
  const seen = new Set();
  const routes = (raw?.v === 1 && Array.isArray(raw.routes) ? raw.routes : []).filter((route) => {
    if (!validShape(route) || seen.has(route.id)) return false;
    seen.add(route.id);
    return true;
  }).map(({ id, name, path }) => ({ id, name, path: path.slice() }));
  return { routes, readonly: false };
}

function persist(store, routes, extra = {}) {
  if (store.readonly) return { ok: false, reason: 'newer' };
  if (!safeSetJSON(TRAILS_KEY, { v: 1, routes })) return { ok: false, reason: 'storage' };
  return { ok: true, routes, ...extra };
}

export function saveNamedTrail(atlas, { id, name, path }) {
  const store = readSavedTrails();
  if (store.readonly) return { ok: false, reason: 'newer' };
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName || cleanName.length > MAX_NAME) return { ok: false, reason: 'name' };
  const existing = id ? store.routes.find((route) => route.id === id) : store.routes.find((route) => route.path.join('|') === path?.join('|'));
  if (id && !existing) return { ok: false, reason: 'missing' };
  // Renaming preserves an unavailable route; creating one requires valid graph edges.
  if (!existing && !isConnectedTrail(atlas, path)) return { ok: false, reason: 'path' };
  if (!existing && store.routes.length >= MAX_TRAILS) return { ok: false, reason: 'limit' };
  const route = { id: existing?.id || crypto.randomUUID(), name: cleanName, path: (existing?.path || path).slice() };
  const routes = existing ? store.routes.map((item) => item.id === route.id ? route : item) : [route, ...store.routes];
  return persist(store, routes, { route });
}

export function removeNamedTrail(id) {
  const store = readSavedTrails();
  if (store.readonly) return { ok: false, reason: 'newer' };
  const removed = store.routes.find((route) => route.id === id);
  if (!removed) return { ok: false, reason: 'missing' };
  return persist(store, store.routes.filter((route) => route.id !== id), { removed });
}

export function restoreNamedTrail(route) {
  const store = readSavedTrails();
  if (store.readonly) return { ok: false, reason: 'newer' };
  if (!validShape(route)) return { ok: false, reason: 'path' };
  if (store.routes.some((item) => item.id === route.id)) return { ok: false, reason: 'exists' };
  if (store.routes.length >= MAX_TRAILS) return { ok: false, reason: 'limit' };
  return persist(store, [route, ...store.routes]);
}

const catalogs = new Map();
export async function loadCuratedTrails(atlas) {
  if (!catalogs.has(atlas.basePath)) {
    const task = fetch(atlas.basePath + 'trails.json').then(async (response) => {
      if (!response.ok) throw new Error('Trails unavailable');
      const data = await response.json();
      if (data.v !== 1 || !Array.isArray(data.trails) || new Set(data.trails.map((trail) => trail.id)).size !== data.trails.length || !data.trails.every((trail) => validShape({ ...trail, name: trail.title }) && isConnectedTrail(atlas, trail.path) && typeof trail.blurb === 'string' && trail.blurb.trim() && Array.isArray(trail.notes) && trail.notes.length === trail.path.length - 1 && trail.notes.every((note) => typeof note === 'string' && note.trim()))) throw new Error('Invalid trail catalog');
      return data.trails;
    }).catch((error) => { catalogs.delete(atlas.basePath); throw error; });
    catalogs.set(atlas.basePath, task);
  }
  return catalogs.get(atlas.basePath);
}
