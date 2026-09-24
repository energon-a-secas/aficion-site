import { $, escHtml as esc } from './utils.js';
import { icon } from './explore-copy.js';

const say = (s, en, es) => s.prefs.lang === 'es' ? es : en;
const nodeOf = (s, id) => s.atlas.nodes.get(id) || s.explore.records.find((node) => node.id === id);

export function selectedExample(s) {
  const examples = s.explore.content.feature?.examples || [];
  return examples.find((example) => example.id === s.explore.featureId) || examples[0];
}

function preview(s) {
  const example = selectedExample(s);
  if (!example || example.path.some((id) => !nodeOf(s, id))) return '';
  const nodes = example.path.map((id) => nodeOf(s, id));
  const branch = nodeOf(s, example.branch.to);
  const depth = nodeOf(s, example.depth.node);
  return `<div class="ex-feature__picker" role="group" aria-label="${say(s, 'Choose an example interest', 'Elige un interés de ejemplo')}">${s.explore.content.feature.examples.map((item) => `<button type="button" data-ex="feature" data-example="${esc(item.id)}" aria-pressed="${item.id === example.id}">${esc(item.label)}</button>`).join('')}</div>
    <div class="ex-feature__story"><h3 id="featureTitle">${esc(example.title)}</h3><p>${esc(example.blurb)}</p></div>
    <div class="ex-feature__map"><svg viewBox="0 0 440 190" preserveAspectRatio="none" aria-hidden="true"><path class="ex-feature__thread" d="M88 32H352C405 32 405 87 352 87H88C35 87 35 132 88 132H352"/></svg>
      <ol class="ex-feature__stops" aria-label="${say(s, 'Connected path through the atlas', 'Recorrido conectado por el atlas')}">${nodes.map((node, i) => `<li class="ex-feature__stop ex-feature__stop--${i}"><a href="#hobby=${esc(node.id)}" title="${esc(example.notes[Math.min(i, example.notes.length - 1)])}"><span class="ex-feature__dot" aria-hidden="true">${i + 1}</span><span>${esc(node.label)}</span>${node.class === 'core' ? `<small>${say(s, 'Shared craft', 'Habilidad compartida')}</small>` : ''}</a></li>`).join('')}</ol>
    </div>
    <div class="ex-feature__branches">${branch ? `<a class="ex-feature__branch" href="#hobby=${esc(branch.id)}"><span class="ex-feature__branch-icon" aria-hidden="true">↗</span><span><small>${say(s, 'Branch from', 'Otra rama desde')} ${esc(nodeOf(s, example.branch.from).label)}</small><strong>${esc(branch.label)}</strong></span>${icon('arrow', 15)}</a>` : ''}${depth ? `<a class="ex-feature__branch ex-feature__branch--depth" href="#hobby=${esc(depth.id)}"><span class="ex-feature__branch-icon" aria-hidden="true">↓</span><span><small>${say(s, 'Go deeper in', 'Profundiza en')} ${esc(nodeOf(s, example.depth.parent).label)}</small><strong>${esc(depth.label)}</strong></span>${icon('arrow', 15)}</a>` : ''}</div>
    <button type="button" class="ex-feature__open" data-ex="feature-atlas">${say(s, 'Follow this path in the atlas', 'Sigue esta ruta en el atlas')}${icon('arrow', 17)}</button>`;
}

export function featureMarkup(s) {
  if (!selectedExample(s)) return '';
  return `<section class="ex-feature" id="exploreFeature" aria-labelledby="featureTitle"><p class="ex-eyebrow">${say(s, 'See how far one interest goes', 'Descubre hasta dónde lleva un interés')}</p><div id="featurePreview">${preview(s)}</div></section>`;
}

export function changeExample(s, id) {
  if (!s.explore.content.feature?.examples.some((example) => example.id === id)) return;
  s.explore.featureId = id;
  $('featurePreview').innerHTML = preview(s);
  $('featurePreview').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  $('live').textContent = `${selectedExample(s).title} ${selectedExample(s).blurb}`;
}

/** Keep reading and keyboard order aligned with the mobile layout. */
export function positionFeature() {
  const host = $('exploreFeature');
  const home = host?.closest('.ex-wrap--home');
  if (!home) return;
  const target = home.querySelector(matchMedia('(max-width: 780px)').matches ? '.ex-search-area' : '.ex-hero');
  if (!target || target.nextElementSibling === host) return;
  const focus = host.contains(document.activeElement) ? document.activeElement : null;
  target.after(host);
  focus?.focus({ preventScroll: true });
}
