// ── First-visit tour ─────────────────────────────────────────
// Five cards over the stage, opened once on a first visit and any time from
// the help dialog. Closing in any way stamps prefs.seenTour, so it never
// reopens on its own. Escape listens on the overlay (events.js), never on
// document, per the drill-in gotcha in CLAUDE.md.

import { $, escHtml } from './utils.js';
import { savePrefs } from './state.js';

const STEPS = [
  {
    title: 'This is a map, not a list',
    body: 'Drag to pan, scroll to zoom. Every dot is a hobby: the large coloured ones anchor a family, and the teal rings orbiting the centre are the crafts many families lean on.',
  },
  {
    title: 'Hover, then click',
    body: 'Hover a node and its neighbours light up with their names, so you can see what sits beside what. Click to read it in the panel: what it is, what it connects to, and why.',
  },
  {
    title: 'Right-click marks, rates and ties',
    body: 'Right-click a node for the quick menu: mark it as yours, set your dedication from Low to Hardcore in time rather than talent, or link it by hand to anything else on your map. Gold paths join everything you mark.',
  },
  {
    title: 'Focus and layers',
    body: 'Focus a cluster to dim everything but one family and the crafts under it. The Layers control does the opposite kind of quiet: just the main hobbies, until you want the full network back.',
  },
  {
    title: 'It stays yours',
    body: 'Your map lives in this browser and shares as a link that never touches a server. The Sheet button folds it into a character sheet with titles; Builds are curated paths worth walking.',
  },
];

let idx = 0;

export function openTour() {
  idx = 0;
  renderTour();
}

export function tourNext(s) {
  if (idx >= STEPS.length - 1) {
    closeTour(s);
    return;
  }
  idx += 1;
  renderTour();
}

export function tourBack() {
  if (idx > 0) idx -= 1;
  renderTour();
}

export function closeTour(s) {
  const overlay = $('tourOverlay');
  if (overlay) overlay.hidden = true;
  if (!s.prefs.seenTour) {
    s.prefs.seenTour = true;
    s.prefs.seenIntro = true;
    savePrefs();
  }
  $('atlasCanvas')?.focus();
}

function renderTour() {
  const overlay = $('tourOverlay');
  const card = $('tourCard');
  if (!overlay || !card) return;
  const step = STEPS[idx];
  const last = idx === STEPS.length - 1;
  card.innerHTML = `
    <p class="tour__count">${idx + 1} of ${STEPS.length}</p>
    <h2 class="tour__title" id="tourTitle">${escHtml(step.title)}</h2>
    <p class="tour__body">${escHtml(step.body)}</p>
    <div class="toolbar tour__nav">
      <button type="button" class="btn btn--ghost btn--sm" data-act="tour-skip">Skip the tour</button>
      ${idx > 0 ? '<button type="button" class="btn btn--ghost btn--sm" data-act="tour-back">Back</button>' : ''}
      <button type="button" class="btn btn--primary btn--sm" data-act="tour-next">${last ? 'Start exploring' : 'Next'}</button>
    </div>`;
  overlay.hidden = false;
  card.querySelector('[data-act="tour-next"]')?.focus();
}
