import { $ } from './utils.js';
import { renderExplorer } from './explorer.js';
import { loadExploreData } from './explore-data.js';
import { ensureNodes } from './atlas/load.js';
import { paint } from './render.js';

export function routeUrl(route) {
  if (route.view === 'atlas') return '#atlas';
  if (route.view === 'mine') return '#mine';
  if (route.node) return `#hobby=${encodeURIComponent(route.node)}`;
  if (route.cluster) return `#category=${encodeURIComponent(route.cluster)}`;
  if (route.family) return `#direction=${encodeURIComponent(route.family)}`;
  return '#explore';
}

export function syncWorkspace(s) {
  const map = s.explore.route.view === 'atlas';
  $('atlasWorkspace').hidden = !map;
  $('explorer').hidden = map;
  document.body.dataset.workspace = s.explore.route.view;
  document.querySelectorAll('[data-view]').forEach((link) => {
    const active = link.dataset.view === s.explore.route.view;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (map) {
    s.camera.resize();
    if (!s.explore.mapOpened && !s.prefs.camera) s.camera.fit(s.layout.bounds);
    s.explore.mapOpened = true;
    paint(s);
  } else renderExplorer(s);
}

let request = 0;
export function rememberExplore(s) {
  const ex = s.explore;
  if (!ex) return;
  history.replaceState({ ...history.state, aficionExplore: { query: ex.query, filter: ex.filter, limit: ex.limit, lens: ex.lens, connectionLimit: ex.connectionLimit, scroll: $('explorer').scrollTop } }, '');
}

export async function navigate(s, route, { historyMode = 'push', focus = true } = {}) {
  const version = ++request;
  if (route.node) await ensureNodes(s.atlas, [route.node]);
  if (version !== request) return;
  if (historyMode === 'push') rememberExplore(s);
  s.explore.route = { view: 'explore', ...route };
  s.explore.query = '';
  s.explore.filter = 'all';
  s.explore.limit = 12;
  s.explore.lens = 'related';
  s.explore.connectionLimit = 5;
  if (historyMode === 'push') history.pushState(null, '', routeUrl(s.explore.route));
  syncWorkspace(s);
  $('explorer').scrollTop = 0;
  if (focus) (route.view === 'atlas' ? $('atlasCanvas') : $('exploreHeading'))?.focus({ preventScroll: true });
}

export async function readExploreRoute(s, focus = false) {
  const hash = location.hash;
  if (focus && hash && !/^#(explore$|atlas$|mine$|hobby=|category=|direction=|node=|pj?=)/.test(hash)) return;
  const restored = history.state?.aficionExplore;
  let route = { view: 'explore' };
  if (/^#(atlas|node=|pj?=)/.test(hash)) route = { view: 'atlas' };
  else if (hash === '#mine') route = { view: 'mine' };
  else {
    const match = /^#(hobby|category|direction)=([a-z0-9.-]+)$/.exec(hash);
    if (match) route[{ hobby: 'node', category: 'cluster', direction: 'family' }[match[1]]] = match[2];
  }
  await navigate(s, route, { historyMode: 'none', focus });
  if (restored && s.explore.route.view !== 'atlas') {
    Object.assign(s.explore, { query: restored.query || '', filter: restored.filter || 'all', limit: restored.limit || 12, lens: restored.lens || 'related', connectionLimit: restored.connectionLimit || 5 });
    renderExplorer(s);
    $('explorer').scrollTop = restored.scroll || 0;
  }
}

export async function initExplorer(s) {
  document.documentElement.lang = s.prefs.lang === 'es' ? 'es' : 'en';
  const data = await loadExploreData(s.atlas);
  s.explore = { ...data, route: { view: 'explore' }, query: '', filter: 'all', limit: 12, lens: 'related', connectionLimit: 5, mapOpened: false };
  await readExploreRoute(s);
}
