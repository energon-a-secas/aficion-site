import { $, escHtml as esc } from './utils.js';
import { hasInner } from './atlas/load.js';
import { select, focusCluster, leaveFocus } from './actions.js';
import { icon } from './explore-copy.js';

const say = (s, en, es) => s.prefs.lang === 'es' ? es : en;

export function depthEntry(s, node, compact = false) {
  if (!hasInner(s.atlas, node.id)) return '';
  const count = (s.explore?.records || []).filter((record) => record.id.startsWith(node.id + '.')).length;
  const label = `${count || ''} ${say(s, 'subtopics', 'subtemas')}`.trim();
  return `<button type="button" class="${compact ? 'atlas-depth-short' : 'atlas-depth-entry'}" data-act="inner" data-node="${esc(node.id)}"><span class="atlas-depth-icon" aria-hidden="true">${icon('arrow', 14)}</span><span>${compact ? label : say(s, 'Go deeper', 'Profundizar')}${compact ? '' : `<small>${esc(label)} ${say(s, 'inside', 'dentro de')} ${esc(node.label)}</small>`}</span></button>`;
}

export function renderAtlasOrientation(s) {
  const host = $('atlasLocation');
  const node = s.atlas.nodes.get(s.selected);
  const cluster = s.atlas.clusters.get(node?.cluster || s.clusterFocus);
  const key = `${cluster?.id}:${s.prefs.lang}`;
  if (host.dataset.location !== key) {
    host.dataset.location = key;
    host.innerHTML = `<button type="button" data-map-overview>${say(s, 'Whole atlas', 'Todo el atlas')}</button>${cluster ? `<span aria-hidden="true">/</span><button type="button" data-map-region="${esc(cluster.id)}">${esc(cluster.label)}</button>` : `<span aria-hidden="true">/</span><span>${say(s, 'Shared crafts & hobby regions', 'Habilidades y regiones')}</span>`}`;
  }
  host.hidden = !!s.inner;
  const picker = $('atlasRegion');
  if (picker.dataset.lang !== s.prefs.lang) {
    picker.dataset.lang = s.prefs.lang;
    $('atlasRegionPrompt').textContent = say(s, 'Jump to section', 'Ir a una región');
    picker.innerHTML = `<option value="">${say(s, 'Whole atlas', 'Todo el atlas')}</option>${(s.explore?.content.families || []).map((family) => `<optgroup label="${esc(family.label)}">${family.clusters.map((id) => `<option value="${esc(id)}">${esc(s.atlas.clusters.get(id)?.label || id)}</option>`).join('')}</optgroup>`).join('')}`;
  }
  if (document.activeElement !== picker) picker.value = cluster?.id || '';
}

export function bindAtlasOrientation(s) {
  const overview = () => { leaveFocus(s); s.camera.flyTo(s.layout.bounds); };
  const region = (id) => {
    const cluster = s.atlas.clusters.get(id);
    if (!cluster) { overview(); return; }
    select(s, cluster.notable);
    focusCluster(s, id);
    $('side').scrollTop = 0;
  };
  $('atlasLocation').addEventListener('click', (event) => {
    if (event.target.closest('[data-map-overview]')) overview();
    const button = event.target.closest('[data-map-region]');
    if (button) region(button.dataset.mapRegion);
  });
  $('atlasRegion').addEventListener('change', (event) => {
    region(event.target.value);
    $('mapOptions').open = false;
    $('atlasCanvas').focus({ preventScroll: true });
  });
}
