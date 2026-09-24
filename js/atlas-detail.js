import { escHtml as esc } from './utils.js';
import { connectedNodes, connectionLabel, relationshipGroup } from './atlas/traversal.js';
import { icon } from './explore-copy.js';

const text = (s, en, es) => s.prefs.lang === 'es' ? es : en;

export function quietSave(s, node) {
  if (node.class === 'hub') return '';
  const saved = s.profile.n.includes(node.id);
  return `<button type="button" class="atlas-save" data-act="toggle" data-node="${esc(node.id)}" aria-pressed="${saved}" aria-label="${esc(text(s, saved ? 'Remove saved hobby: ' : 'Save hobby: ', saved ? 'Quitar afición guardada: ' : 'Guardar afición: ') + node.label)}">${icon(saved ? 'check' : 'bookmark', 15)}<span>${text(s, saved ? 'Saved' : 'Save', saved ? 'Guardado' : 'Guardar')}</span></button>`;
}

export function connectionList(s, node) {
  const links = connectedNodes(s.atlas, s.layout, node.id);
  if (!links.length) return '';
  const row = (link) => `<li><button type="button" class="atlas-connection" data-walk-from="${esc(node.id)}" data-walk-to="${esc(link.to)}">
    <span class="atlas-connection__heading"><span class="atlas-connection__name">${esc(link.node.label)}</span>${icon('arrow', 17)}</span>
    <span class="atlas-connection__kind">${esc(connectionLabel(link, s.prefs.lang === 'es'))}${link.node.cluster && link.node.cluster !== node.cluster ? ` · ${esc(s.atlas.clusters.get(link.node.cluster).label)}` : ''}</span>
    ${link.note ? `<span class="atlas-connection__note">${esc(link.note)}</span>` : ''}
  </button></li>`;
  const groups = [
    ['local', text(s, 'Branches in this region', 'Ramas de esta región')],
    ['craft', text(s, 'Shared crafts', 'Habilidades compartidas')],
    ['bridge', text(s, 'Bridges to other regions', 'Puentes hacia otras regiones')],
  ];
  return `<section class="atlas-connections" aria-label="${text(s, 'Follow a connection', 'Sigue una conexión')}">
    <div class="atlas-connections__heading"><h3>${text(s, 'Follow a connection', 'Sigue una conexión')}</h3><span>${links.length}</span></div>
    <p class="atlas-connections__hint">${text(s, 'Arrows follow the map. Numbers reveal crowded paths.', 'Las flechas siguen el mapa. Los números agrupan caminos cercanos.')}</p>
    ${groups.map(([group, label]) => {
      const members = links.filter((link) => relationshipGroup(s.atlas, node.id, link) === group);
      if (!members.length) return '';
      return `<h4 class="atlas-branch-heading" data-group="${group}">${label}<span>${members.length}</span></h4><ul class="atlas-connections__list">${members.slice(0, 6).map(row).join('')}</ul>${members.length > 6 ? `<details class="atlas-connections__more atlas-connections__more--${group}"><summary>${text(s, `Show all ${members.length}`, `Ver las ${members.length}`)}</summary><ul class="atlas-connections__list">${members.slice(6).map(row).join('')}</ul></details>` : ''}`;
    }).join('')}
  </section>`;
}

export function detailLinks(s, node, hasInner) {
  return `<div class="atlas-detail-links">
    <a class="atlas-inline-link" href="#hobby=${esc(node.id)}">${text(s, 'Read the hobby guide', 'Leer la guía de esta afición')} ${icon('arrow', 15)}</a>
  </div>`;
}
