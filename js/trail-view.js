import { $, escHtml as esc } from './utils.js';
import { icon } from './explore-copy.js';
import { isConnectedTrail, MAX_NAME } from './trail-model.js';

export const trailCopy = (s, en, es) => s.prefs.lang === 'es' ? es : en;
const label = (s, id) => esc(s.atlas.nodes.get(id)?.label || id);
const say = trailCopy;

function stops(s, route) {
  return `<ol class="trail-stops">${route.path.map((id, i) => `<li><span>${label(s, id)}</span>${route.notes?.[i] ? `<p>${esc(route.notes[i])}</p>` : ''}</li>`).join('')}</ol>`;
}

function routeRow(s, route, saved) {
  const available = isConnectedTrail(s.atlas, route.path);
  return `<details class="trail-row"><summary><span><strong>${esc(route.name || route.title)}</strong><small>${saved ? route.path.map((id) => label(s, id)).join(' → ') : esc(route.blurb)}</small></span><span class="trail-row__count">${route.path.length} ${say(s, 'stops', 'paradas')}${icon('arrow', 16)}</span></summary>
    <div class="trail-row__body">${stops(s, route)}${available ? '' : `<p class="trail-message">${say(s, 'Some stops are no longer available. Your saved route is still here.', 'Algunas paradas ya no están disponibles. Tu ruta sigue guardada.')}</p>`}
    <div class="trail-actions"><button type="button" class="btn btn--secondary btn--sm" data-trail-open="${esc(route.id)}" data-source="${saved ? 'saved' : 'suggested'}" ${available ? '' : 'disabled'}>${say(s, 'Explore this trail', 'Explorar esta ruta')}${icon('arrow', 15)}</button>${saved ? `<button type="button" class="trail-text" data-trail-rename="${esc(route.id)}">${say(s, 'Rename', 'Renombrar')}</button><button type="button" class="trail-text" data-trail-remove="${esc(route.id)}">${say(s, 'Remove', 'Quitar')}</button>` : ''}</div></div></details>`;
}

function errorText(s, reason) {
  const messages = {
    storage: ['This browser could not save the route. Try again or allow local storage.', 'El navegador no pudo guardar la ruta. Reintenta o permite el almacenamiento local.'],
    newer: ['These routes were saved by a newer version. Reload before making changes.', 'Estas rutas se guardaron con una versión más reciente. Recarga antes de modificarlas.'],
    name: ['Give this route a name of up to 80 characters.', 'Ponle un nombre de hasta 80 caracteres.'],
    path: ['This route needs at least two connected stops.', 'Esta ruta necesita al menos dos paradas conectadas.'],
    missing: ['This route was removed in another tab. Reopen the library to refresh it.', 'Esta ruta se eliminó en otra pestaña. Vuelve a abrir la biblioteca para actualizarla.'],
    limit: ['You have 50 saved routes. Remove one to make room.', 'Tienes 50 rutas guardadas. Quita una para dejar espacio.'],
    exists: ['This route has already been restored.', 'Esta ruta ya se ha restaurado.'],
  };
  return say(s, ...(messages[reason] || messages.storage));
}

export function renderTrailError(s, reason) {
  const el = $('trailError');
  el.textContent = reason ? errorText(s, reason) : '';
  el.hidden = !reason;
}

export function renderTrailLibrary(s) {
  const library = s.trails;
  const edit = library.edit;
  $('trailModalTitle').textContent = edit ? say(s, 'Name your route', 'Ponle nombre a tu ruta') : say(s, 'A trail for your curiosity', 'Una ruta para tu curiosidad');
  $('trailModal').querySelector('[data-modal-close].btn').setAttribute('aria-label', say(s, 'Close trails', 'Cerrar rutas'));
  const error = '<p class="trail-message" id="trailError" role="alert" hidden></p>';
  if (edit) {
    $('trailLibrary').innerHTML = `<form id="trailForm" class="trail-form"><label class="field-label" for="trailName">${say(s, 'Route name', 'Nombre de la ruta')}</label><input class="field" id="trailName" name="name" maxlength="${MAX_NAME}" required value="${esc(edit.name)}" autocomplete="off" aria-describedby="trailStorage trailError">${stops(s, edit)}${error}<p class="trail-footnote" id="trailStorage">${say(s, 'Saved in this browser. Your hobby collection stays separate.', 'Se guarda en este navegador. Tu colección de aficiones es independiente.')}</p><div class="trail-actions"><button type="submit" class="btn btn--primary">${say(s, 'Save route', 'Guardar ruta')}</button><button type="button" class="trail-text" data-trail-cancel>${say(s, 'Cancel', 'Cancelar')}</button></div></form>`;
    return;
  }
  const saved = library.tab === 'saved';
  let content;
  if (saved) content = library.routes.length ? library.routes.map((route) => routeRow(s, route, true)).join('') : `<p class="trail-empty">${say(s, 'Follow a few connections, then save your route from the trail bar. Give it a name and pick it up here next time.', 'Sigue algunas conexiones y guarda tu ruta desde la barra del recorrido. Ponle un nombre y retómala aquí la próxima vez.')}</p>`;
  else if (library.loading) content = `<p class="trail-empty" role="status">${say(s, 'Finding trails…', 'Buscando rutas…')}</p>`;
  else if (library.failed) content = `<p class="trail-empty">${say(s, 'The suggested trails could not load.', 'No se pudieron cargar las rutas sugeridas.')} <button type="button" class="trail-text" data-trail-retry>${say(s, 'Try again', 'Reintentar')}</button></p>`;
  else content = library.catalog.map((route) => routeRow(s, route, false)).join('');
  $('trailLibrary').innerHTML = `<p class="trail-intro">${say(s, 'Small journeys through unexpected connections. Open one to see where it leads.', 'Pequeños viajes por conexiones inesperadas. Abre uno para ver adónde lleva.')}</p><div class="trail-tabs" role="group" aria-label="${say(s, 'Trail library', 'Biblioteca de rutas')}"><button type="button" data-trail-tab="suggested" aria-pressed="${!saved}">${say(s, 'Suggested', 'Sugeridas')}</button><button type="button" data-trail-tab="saved" aria-pressed="${saved}">${say(s, 'Saved', 'Guardadas')} <span>${library.routes.length}</span></button></div>${error}${library.removed ? `<p class="trail-message" role="status">${say(s, 'Route removed.', 'Ruta eliminada.')} <button type="button" class="trail-text" data-trail-undo>${say(s, 'Undo', 'Deshacer')}</button></p>` : ''}${content}<p class="trail-footnote">${say(s, 'Explore at your own pace. Saving a route never adds its stops to your hobbies.', 'Explora a tu ritmo. Guardar una ruta no añade sus paradas a tus aficiones.')}</p>`;
  if (library.readonly) renderTrailError(s, 'newer');
}

/** Render only when the journey changes; camera movement must not steal focus. */
export function renderJourney(s) {
  const j = s.walk.journey;
  const active = !!j && s.explore?.route.view === 'atlas' && !s.inner && !s.build && !s.comparison && !s.linking && !s.pathing;
  document.body.classList.toggle('journey-open', active);
  $('trailLibraryBtn').textContent = say(s, 'Trails', 'Rutas');
  for (const host of [$('journeyPanel'), $('journeyDock')]) {
    host.hidden = !active;
    if (!active) continue;
    const key = JSON.stringify([j.title, j.path, j.step, s.prefs.lang]);
    if (host.dataset.journey === key) continue;
    host.dataset.journey = key;
    const next = j.path[j.step + 1];
    host.innerHTML = `<div class="journey__head"><span>${say(s, 'Trail', 'Ruta')} · ${j.step + 1}/${j.path.length}</span><button type="button" class="trail-text" data-journey-close aria-label="${say(s, 'Leave guided trail', 'Salir de la ruta guiada')}">×</button></div><h3>${esc(j.title)}</h3><p class="journey__note">${esc(next ? j.notes?.[j.step] || say(s, 'Follow the connection to the next stop.', 'Sigue la conexión hasta la próxima parada.') : say(s, 'Trail complete. Keep exploring any connection that interests you.', 'Ruta completa. Sigue explorando las conexiones que te interesen.'))}</p><div class="journey__controls"><button type="button" class="trail-text journey__back" data-journey-back ${j.step ? '' : 'disabled'} aria-label="${say(s, 'Previous stop', 'Parada anterior')}">${icon('arrow', 16)}</button>${next ? `<button type="button" class="journey__next" data-journey-next><span>${say(s, 'Next', 'Siguiente')}<strong>${label(s, next)}</strong></span>${icon('arrow', 18)}</button>` : `<span class="journey__complete">${icon('check', 16)} ${say(s, 'All stops explored', 'Recorrido completo')}</span>`}</div><div class="journey__footer"><button type="button" class="trail-text" data-journey-fit>${say(s, 'Whole route', 'Ruta completa')}</button><span><i></i>${say(s, 'Explored', 'Visitado')} <i class="is-planned"></i>${say(s, 'Ahead', 'Por explorar')}</span><button type="button" class="trail-text" data-trail-save aria-label="${say(s, 'Save route', 'Guardar ruta')}">${icon('bookmark', 15)}</button></div>`;
  }
}
