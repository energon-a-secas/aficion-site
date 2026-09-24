import { $, debounce, showToast, copyText } from './utils.js';
import { navigate, readExploreRoute, rememberExplore } from './navigation.js';
import { renderExplorer, resultsMarkup } from './explorer.js';
import { parentId } from './explore-model.js';
import { copy } from './explore-copy.js';
import { ensureNodes } from './atlas/load.js';
import { toggleNode, applyLevel, openNode, select, focusCluster, fitMine, trace, leaveFocus } from './actions.js';
import { renderShare, renderInner } from './panels.js';
import { openModal } from './modal.js';
import { paint } from './render.js';
import { changeExample, selectedExample, positionFeature } from './explore-feature.js';
import { startJourney } from './trails.js';

export async function showAtlas(s, { node, cluster, path, mine } = {}) {
  await navigate(s, { view: 'atlas' });
  if (s.clusterFocus) leaveFocus(s);
  s.focusRing = new Set();
  s.tracePath = [];
  if (node) await openNode(s, node);
  if (cluster) focusCluster(s, cluster);
  if (path) {
    await ensureNodes(s.atlas, path);
    if (path.some((id) => !s.layout.pos.has(id))) {
      s.focusRing = new Set(path);
      s.tracePath = path.slice();
      await openNode(s, path.find((id) => parentId(id)) || path[0]);
      renderInner(s);
    } else { select(s, path[0]); trace(s, path); }
  }
  if (mine) fitMine(s);
  paint(s);
}

const ACTIONS = {
  feature: (s, el) => changeExample(s, el.dataset.example),
  'feature-atlas': async (s) => {
    const example = selectedExample(s);
    if (!example) return;
    await navigate(s, { view: 'atlas' }, { focus: false });
    startJourney(s, example);
  },
  'copy-hobby': async (s, el) => {
    const url = new URL(location.href);
    url.hash = `hobby=${el.dataset.node}`;
    if (s.prefs.lang === 'es') url.searchParams.set('lang', 'es');
    const ok = await copyText(url.href);
    showToast(ok ? copy(s).copied : url.href);
  },
  jump: (s, el) => { const target = $(el.dataset.target); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); },
  save: async (s, el) => {
    const id = el.dataset.node;
    await ensureNodes(s.atlas, [id]);
    if (!s.atlas.nodes.has(id)) { showToast(copy(s).treeError); return; }
    const saved = s.profile.n.includes(id);
    toggleNode(s, id);
    showToast(saved ? copy(s).removeFeedback : copy(s).saveFeedback);
  },
  level: async (s, el) => {
    await ensureNodes(s.atlas, [el.dataset.node]);
    applyLevel(s, el.dataset.node, Number(el.dataset.level));
  },
  filter: (s, el) => { s.explore.filter = el.dataset.filter; s.explore.limit = 12; renderExplorer(s); },
  lens: (s, el) => { s.explore.lens = el.dataset.lens; s.explore.connectionLimit = 5; renderExplorer(s); },
  more: (s) => { s.explore.limit += 24; renderExplorer(s); },
  'more-connections': (s) => { s.explore.connectionLimit += 12; renderExplorer(s); },
  reset: (s) => { s.explore.query = ''; s.explore.filter = 'all'; renderExplorer(s); $('exploreSearch')?.focus(); },
  'map-node': (s, el) => showAtlas(s, { node: el.dataset.node }),
  'map-cluster': (s, el) => showAtlas(s, { cluster: el.dataset.cluster }),
  'my-atlas': (s) => showAtlas(s, { mine: true }),
  trace: (s, el) => showAtlas(s, { path: el.dataset.path.split(',') }),
  share: (s) => { openModal('shareModal'); renderShare(s); },
};

export function bindExplorer(s) {
  matchMedia('(max-width: 780px)').addEventListener('change', positionFeature);
  document.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-ex]');
    if (action && ACTIONS[action.dataset.ex]) {
      event.preventDefault();
      try { await ACTIONS[action.dataset.ex](s, action); } catch { showToast(copy(s).treeError); }
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const hash = link.getAttribute('href');
    if (!/^#(explore|atlas|mine|hobby=|category=|direction=)/.test(hash)) return;
    event.preventDefault();
    rememberExplore(s);
    history.pushState(null, '', hash);
    await readExploreRoute(s, true);
  });
  $('explorer').addEventListener('input', debounce((event) => {
    if (event.target.id !== 'exploreSearch' || !event.target.isConnected) return;
    s.explore.query = event.target.value;
    s.explore.limit = 12;
    $('explorer').querySelector('.ex-wrap--home')?.classList.toggle('is-searching', !!s.explore.query.trim() || s.explore.filter !== 'all');
    const results = $('exploreResults');
    if (results) {
      results.innerHTML = resultsMarkup(s);
      $('live').textContent = results.querySelector('[role="status"]')?.textContent || '';
    }
  }, 120));
  $('explorer').addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target.id === 'exploreSearch') {
      s.explore.query = '';
      event.target.value = '';
      $('explorer').querySelector('.ex-wrap--home')?.classList.toggle('is-searching', s.explore.filter !== 'all');
      $('exploreResults').innerHTML = resultsMarkup(s);
    }
  });
  // hashchange also covers browser Back/Forward; pushState is rendered above.
  window.addEventListener('hashchange', () => readExploreRoute(s, true));
  document.querySelectorAll('[data-panel-tab]').forEach((button) => {
    button.addEventListener('click', () => setPanelTab(button.dataset.panelTab));
  });
  setPanelTab('detail');
  $('mapOptions')?.addEventListener('toggle', () => { if ($('mapOptions').open) $('appMore').open = false; });
  $('appMore')?.addEventListener('click', (event) => {
    if (event.target.closest('button')) $('appMore').open = false;
  });
  $('appMore')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { $('appMore').open = false; $('appMore').querySelector('summary').focus(); }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#appMore')) $('appMore').open = false;
  });
}

export function setPanelTab(name) {
  for (const id of ['detail', 'mine', 'suggest']) {
    const panel = $(id + 'Panel');
    if (panel) panel.hidden = id !== name;
    document.querySelector(`[data-panel-tab="${id}"]`)?.setAttribute('aria-pressed', String(id === name));
  }
}
