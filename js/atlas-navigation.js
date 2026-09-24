import { $, escHtml as esc, prefersReducedMotion } from './utils.js';
import { radialTargets, connectedNodes, connectionLabel, extendTrail } from './atlas/traversal.js';
import { select, leaveFocus } from './actions.js';
import { paint, announce } from './render.js';
import { icon } from './explore-copy.js';
import { boundsOfIds } from './atlas/layout.js';
import { renderAtlasOrientation, bindAtlasOrientation } from './atlas-orientation.js';
import { bindDepth } from './atlas-depth.js';
import { bindTrails } from './trails.js';

const say = (s, en, es) => s.prefs.lang === 'es' ? es : en;

export function followConnection(s, from, to) {
  const edge = connectedNodes(s.atlas, s.layout, from, { includeHub: true }).find((link) => link.to === to);
  if (!edge) return false;
  const journey = s.walk.journey;
  if (journey) {
    const step = journey.path.indexOf(to);
    if (from === journey.path[journey.step] && Math.abs(step - journey.step) === 1) journey.step = step;
    else s.walk.journey = null;
  }
  s.walk.path = extendTrail(s.walk.path, from, to);
  s.walk.motion = { from, to, start: performance.now(), duration: prefersReducedMotion() ? 0 : 460 };
  s.walk.hover = null;
  s.walk.group = null;
  s.walk.preview = null;
  s.tracePath = [];
  s.focusRing = new Set();
  if (s.clusterFocus && !s.clusterFocusIds?.has(to)) leaveFocus(s);
  s.hover = null;
  select(s, to, { following: true });
  $('side').scrollTop = 0;
  const point = s.layout.pos.get(to);
  const zoom = Math.max(.8, s.camera.zoom);
  const inset = window.matchMedia('(max-width: 940px)').matches ? 64 / zoom : 0;
  s.camera.flyTo({ x: point.x, y: point.y + inset, zoom }, { ms: 360 });
  const why = connectionLabel(edge, s.prefs.lang === 'es');
  announce(`${s.atlas.nodes.get(from).label} → ${edge.node.label}. ${why}. ${edge.note || edge.node.blurb}`);
  return true;
}

function trailMarkup(s) {
  const path = s.walk.path;
  const visible = path.slice(-4);
  return `<span class="atlas-trail__label">${say(s, 'Your trail', 'Tu recorrido')}</span>
    <button type="button" class="atlas-trail__back" data-walk-back aria-label="${say(s, 'Back along this connection', 'Volver por esta conexión')}">${icon('arrow', 16)}</button>
    <div class="atlas-trail__crumbs">${path.length > 4 ? '<span aria-hidden="true">…</span>' : ''}${visible.map((id, i) => `${i ? '<span class="atlas-trail__separator" aria-hidden="true">›</span>' : ''}<button type="button" data-walk-return="${esc(id)}" ${id === s.selected ? 'aria-current="step"' : ''}>${esc(s.atlas.nodes.get(id)?.label || id)}</button>`).join('')}</div>
    <button type="button" class="atlas-trail__fit" data-walk-fit>${say(s, 'See path', 'Ver recorrido')}</button>
    <button type="button" class="atlas-trail__save" data-trail-save aria-label="${say(s, 'Save route', 'Guardar ruta')}">${icon('bookmark', 15)}<span>${say(s, 'Save route', 'Guardar ruta')}</span></button>
    <button type="button" class="atlas-trail__clear" data-walk-clear aria-label="${say(s, 'Clear exploration trail', 'Borrar recorrido')}">×</button>`;
}

/** Reposition on camera changes, but rebuild buttons only when the anchor changes. */
export function renderAtlasNavigation(s) {
  const host = $('nodeCompass');
  const trail = $('atlasTrail');
  if (!host || !s.walk) return;
  renderAtlasOrientation(s);
  const anchor = s.walk.hover || s.selected;
  const point = anchor && s.layout.pos.get(anchor);
  const ready = s.explore?.route.view === 'atlas' && point && !s.inner && !s.linking && !s.pathing && !s.build && !s.comparison && !s.walk.dragging;
  const screen = point && s.camera.toScreen(point.x, point.y);
  const visible = ready && screen.x > 124 && screen.x < s.camera.w - 124 && screen.y > 150 && screen.y < s.camera.h - 145;
  host.hidden = !visible;
  if (visible) {
    const targets = radialTargets(s.atlas, s.layout, anchor);
    const key = `${anchor}:${s.prefs.lang}`;
    if (host.dataset.anchor !== key) {
      host.dataset.anchor = key;
      host.setAttribute('aria-label', `${say(s, 'Follow connections from', 'Seguir conexiones desde')} ${s.atlas.nodes.get(anchor).label}`);
      host.innerHTML = targets.map((target, index) => {
        const link = target.links[0];
        const grouped = target.links.length > 1;
        const label = grouped ? `${target.links.length} ${say(s, 'connections in this direction', 'conexiones en esta dirección')}` : `${say(s, 'Follow to', 'Seguir hasta')} ${link.node.label}. ${connectionLabel(link, s.prefs.lang === 'es')}.`;
        const names = target.links.map((edge) => edge.node.label).join(' · ');
        return `<button type="button" class="node-compass__arrow" data-group="${target.group}" data-tip="${target.x < -35 ? 'left' : target.x > 35 ? 'right' : 'centre'}" data-walk-from="${esc(anchor)}" ${grouped ? `data-walk-group="${index}" aria-expanded="false" aria-controls="atlasChoices"` : `data-walk-to="${esc(link.to)}"`} aria-label="${esc(label)}" style="--bearing:${target.angle * 180 / Math.PI}deg;left:${target.x.toFixed(2)}px;top:${target.y.toFixed(2)}px"><span class="node-compass__face">${icon('arrow', 13)}${grouped ? `<b>${target.links.length}</b>` : ''}</span><span class="node-compass__tip" role="tooltip">${esc(grouped ? label : link.node.label)}<small>${esc(grouped ? names : connectionLabel(link, s.prefs.lang === 'es'))}</small></span></button>`;
      }).join('');
    }
    host.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
  }
  renderChoices(s, visible ? anchor : null, screen);
  if (trail) {
    trail.hidden = s.walk.path.length < 2 || s.explore?.route.view !== 'atlas' || !!s.inner;
    const key = s.walk.path.join(',') + s.prefs.lang;
    if (trail.dataset.path !== key) { trail.dataset.path = key; trail.innerHTML = trailMarkup(s); }
  }
}

function renderChoices(s, anchor, screen) {
  const panel = $('atlasChoices');
  const group = s.walk.group;
  panel.hidden = !anchor || !group || group.anchor !== anchor;
  if (panel.hidden) return;
  const port = radialTargets(s.atlas, s.layout, anchor)[group.index];
  if (!port) { panel.hidden = true; return; }
  const key = `${anchor}:${group.index}:${s.prefs.lang}`;
  if (panel.dataset.group !== key) {
    panel.dataset.group = key;
    panel.innerHTML = `<div class="atlas-choices__head"><strong>${port.links.length} ${say(s, 'connections here', 'conexiones aquí')}</strong><button type="button" data-walk-close aria-label="${say(s, 'Close connection choices', 'Cerrar conexiones')}">×</button></div>${port.links.map((link) => `<button type="button" class="atlas-connection" data-walk-from="${esc(anchor)}" data-walk-to="${esc(link.to)}"><span class="atlas-connection__heading">${esc(link.node.label)}${icon('arrow', 14)}</span><span class="atlas-connection__kind">${esc(connectionLabel(link, s.prefs.lang === 'es'))}</span></button>`).join('')}`;
  }
  panel.style.left = `${Math.max(12, Math.min(s.camera.w - 300, screen.x + 116))}px`;
  panel.style.top = `${Math.max(68, Math.min(s.camera.h - 330, screen.y - 110))}px`;
  for (const button of $('nodeCompass').querySelectorAll('[data-walk-group]')) button.setAttribute('aria-expanded', String(Number(button.dataset.walkGroup) === group.index));
}

let hoverTimer;
export function hoverCompass(s, id) {
  clearTimeout(hoverTimer);
  if (s.walk.group) return;
  if (id) {
    if (s.walk.hover !== id) { s.walk.hover = id; s.walk.preview = null; paint(s); }
  } else {
    hoverTimer = setTimeout(() => {
      if (s.walk.group || $('nodeCompass')?.matches(':hover, :focus-within')) return;
      s.walk.hover = null;
      s.walk.preview = null;
      paint(s);
    }, 260);
  }
}

export function bindAtlasNavigation(s) {
  bindAtlasOrientation(s);
  bindDepth(s);
  bindTrails(s);
  const host = $('nodeCompass');
  s.camera.onChange(() => renderAtlasNavigation(s));
  host.addEventListener('pointerenter', () => clearTimeout(hoverTimer));
  host.addEventListener('pointerleave', () => hoverCompass(s, null));
  const preview = (event) => {
    const button = event.target.closest('[data-walk-to]');
    if (!button) return;
    s.walk.preview = { from: button.dataset.walkFrom, to: button.dataset.walkTo };
    paint(s);
  };
  document.addEventListener('pointerover', preview);
  document.addEventListener('focusin', preview);
  const clearPreview = (event) => {
    if (!event.target.closest('[data-walk-to]') || event.relatedTarget?.closest?.('[data-walk-to]') === event.target.closest('[data-walk-to]')) return;
    s.walk.preview = null;
    paint(s);
  };
  document.addEventListener('pointerout', clearPreview);
  document.addEventListener('focusout', clearPreview);
  document.addEventListener('click', (event) => {
    const grouped = event.target.closest('[data-walk-group]');
    if (grouped) {
      const anchor = grouped.dataset.walkFrom;
      s.walk.hover = anchor;
      s.walk.group = { anchor, index: Number(grouped.dataset.walkGroup) };
      paint(s);
      $('atlasChoices').querySelector('[data-walk-to]')?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('[data-walk-close]')) { closeChoices(s); return; }
    if (s.walk.group && !event.target.closest('#atlasChoices, #nodeCompass')) closeChoices(s, false);
    const button = event.target.closest('[data-walk-to]');
    if (button) {
      const keyboard = event.detail === 0;
      if (followConnection(s, button.dataset.walkFrom, button.dataset.walkTo)) {
        if (keyboard) $('atlasCanvas').focus({ preventScroll: true });
        if (document.body.classList.contains('side-open')) {
          document.body.classList.remove('side-open');
          $('panelToggle').setAttribute('aria-expanded', 'false');
          $('atlasCanvas').focus({ preventScroll: true });
        }
      }
    } else if (event.target.closest('[data-walk-back]')) {
      const from = s.walk.path.at(-1);
      const to = s.walk.path.at(-2);
      if (from && to) followConnection(s, from, to);
      $('atlasCanvas').focus({ preventScroll: true });
    } else if (event.target.closest('[data-walk-return]')) {
      const id = event.target.closest('[data-walk-return]').dataset.walkReturn;
      const index = s.walk.path.indexOf(id);
      if (index < 0) return;
      s.walk.path = s.walk.path.slice(0, index + 1);
      if (s.walk.journey) s.walk.journey.step = s.walk.journey.path.indexOf(id);
      s.walk.motion = null;
      select(s, id, { centre: true, following: true });
      $('atlasCanvas').focus({ preventScroll: true });
    } else if (event.target.closest('[data-walk-clear]')) {
      s.walk.path = [];
      s.walk.journey = null;
      s.walk.motion = null;
      paint(s);
      $('atlasCanvas').focus({ preventScroll: true });
    } else if (event.target.closest('[data-walk-fit]')) {
      s.camera.flyTo(boundsOfIds(s.layout, s.walk.path, 60));
      $('atlasCanvas').focus({ preventScroll: true });
    }
  });
  $('atlasChoices').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closeChoices(s); }
  });
  host.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    s.walk.hover = null;
    s.walk.preview = null;
    $('atlasCanvas').focus({ preventScroll: true });
    paint(s);
  });
}

function closeChoices(s, restoreFocus = true) {
  const group = s.walk.group;
  s.walk.group = null;
  s.walk.preview = null;
  paint(s);
  if (restoreFocus) $('nodeCompass').querySelector(`[data-walk-group="${group?.index}"]`)?.focus({ preventScroll: true });
  for (const button of $('nodeCompass').querySelectorAll('[data-walk-group]')) button.setAttribute('aria-expanded', 'false');
}
