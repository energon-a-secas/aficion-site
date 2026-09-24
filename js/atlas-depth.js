import { $, escHtml as esc } from './utils.js';
import { normalise } from './inner.js';
import { quietSave } from './atlas-detail.js';
import { extendTrail } from './atlas/traversal.js';
import { leaveInner } from './actions.js';

const say = (s, en, es) => s.prefs.lang === 'es' ? es : en;

export function renderDepth(s) {
  document.body.classList.toggle('depth-open', !!s.inner);
  const overlay = $('innerOverlay'), svg = $('innerSvg'), list = $('innerList');
  if (!overlay || !svg || !list) return;
  if (!s.inner) { overlay.hidden = true; svg.innerHTML = ''; list.innerHTML = ''; return; }
  const view = s.inner;
  const { tree } = view;
  if (!view.exploration) {
    const selected = tree.nodeIds.includes(s.selected) ? s.selected : tree.nodeIds[0];
    const requested = s.tracePath.filter((id) => tree.nodeIds.includes(id) && s.focusRing.has(id));
    const valid = requested.length > 1 && requested.every((id, i) => !i || tree.edges.some((edge) => (edge.from === requested[i - 1] && edge.to === id) || (edge.to === requested[i - 1] && edge.from === id)));
    view.exploration = valid ? { selected: requested.at(-1), path: requested } : { selected, path: [selected] };
  }
  const { selected, path } = view.exploration;
  const held = overlay.contains(document.activeElement) ? document.activeElement : null;
  const keep = held?.dataset.depthNode || held?.dataset.node;
  const fromSvg = held?.closest('#innerSvg');
  const wasSave = held?.classList.contains('atlas-save');
  const parent = s.atlas.nodes.get(view.of);
  $('innerTitle').textContent = `${parent.label} / ${say(s, 'Subtopics', 'Subtemas')}`;
  $('innerBlurb').textContent = `${tree.blurb} ${say(s, 'Choose a node to explore its branches.', 'Elige un punto para explorar sus ramas.')}`;
  $('innerClose').textContent = `${say(s, 'Back to', 'Volver a')} ${parent.label}`;
  svg.setAttribute('viewBox', '-12 -12 124 124');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', say(s, 'Subtopic connections', 'Conexiones entre subtemas'));
  svg.removeAttribute('aria-hidden');
  const pos = normalise(view, 100);
  const neighbours = new Set(tree.edges.flatMap((edge) => edge.from === selected ? [edge.to] : edge.to === selected ? [edge.from] : []));
  const traced = (edge) => path.some((id, i) => i && ((path[i - 1] === edge.from && id === edge.to) || (path[i - 1] === edge.to && id === edge.from)));
  svg.innerHTML = tree.edges.map((edge) => {
    const a = pos.get(edge.from), b = pos.get(edge.to);
    const on = traced(edge);
    return `<path d="M${a.x},${a.y} L${b.x},${b.y}" pathLength="1" class="inner__edge${on ? ' is-trail' : ''}${edge.from === selected || edge.to === selected ? ' is-focus' : ''}"/>`;
  }).join('') + tree.nodeIds.map((id, i) => {
    const p = pos.get(id);
    const node = s.atlas.nodes.get(id);
    return `<g role="button" tabindex="0" aria-pressed="${id === selected}" aria-label="${esc(node.label)}" data-depth-node="${esc(id)}" class="depth-dot${id === selected ? ' is-selected' : ''}${neighbours.has(id) ? ' is-neighbour' : ''}${path.includes(id) ? ' is-trail' : ''}${s.profile.n.includes(id) ? ' is-saved' : ''}" transform="translate(${p.x},${p.y})"><circle r="7" class="depth-dot__hit"/><circle r="4" class="depth-dot__face"/><text y="1.1" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  list.innerHTML = tree.nodes.map((node, i) => `<li class="inner__row${node.id === selected ? ' is-selected' : ''}"><button type="button" class="inner__pick" data-depth-node="${esc(node.id)}" aria-pressed="${node.id === selected}"><span class="inner__pick-name"><span class="depth-index">${i + 1}</span>${esc(node.label)}</span><span class="inner__pick-blurb">${esc(node.blurb)}</span></button>${quietSave(s, node)}</li>`).join('');
  const node = s.atlas.nodes.get(selected);
  const branches = neighbours.size === 1 ? say(s, 'connected branch', 'rama conectada') : say(s, 'connected branches', 'ramas conectadas');
  $('innerFocus').innerHTML = `<p class="depth-focus__eyebrow">${say(s, 'Exploring', 'Explorando')}</p><h3>${esc(node.label)}</h3><p>${neighbours.size} ${branches}</p><a class="atlas-inline-link" href="#hobby=${esc(selected)}">${say(s, 'Open this subtopic', 'Abrir este subtema')} →</a>`;
  overlay.hidden = false;
  if (keep) {
    const root = fromSvg ? svg : list;
    root.querySelector(wasSave ? `.atlas-save[data-node="${keep}"]` : `[data-depth-node="${keep}"]`)?.focus({ preventScroll: true });
  }
}

export function bindDepth(s) {
  const choose = (target) => {
    if (!s.inner || !target) return;
    const to = target.dataset.depthNode;
    if (!s.inner.tree.nodeIds.includes(to)) return;
    const view = s.inner.exploration;
    const linked = s.inner.tree.edges.some((edge) => (edge.from === view.selected && edge.to === to) || (edge.to === view.selected && edge.from === to));
    view.path = linked ? extendTrail(view.path, view.selected, to) : [to];
    view.selected = to;
    const fromSvg = target.closest('#innerSvg');
    renderDepth(s);
    $(fromSvg ? 'innerSvg' : 'innerList').querySelector(`[data-depth-node="${to}"]`)?.focus({ preventScroll: true });
    $('live').textContent = s.atlas.nodes.get(to).label;
  };
  $('innerOverlay').addEventListener('click', (event) => {
    if (event.target.closest('a[href^="#hobby="]')) leaveInner(s);
    else choose(event.target.closest('[data-depth-node]'));
  });
  $('innerSvg').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(event.target.closest('[data-depth-node]')); }
  });
}
