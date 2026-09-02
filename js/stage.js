// ── Stage chrome ─────────────────────────────────────────────
// The chips over the map and the small status surfaces: cluster focus, link
// and path chips, the notice line, the corpus meta line, the canvas
// aria-label, the first-visit hint and the fatal-error card. Split from
// render.js when tie notes pushed that file past its 500-line budget.

import { $, escHtml, plural } from './utils.js';

/** The chip over the stage naming the focused cluster, with the way out. */
export function renderFocusChip(s) {
  const el = $('focusChip');
  if (!el) return;
  const cluster = s.clusterFocus ? s.atlas.clusters.get(s.clusterFocus) : null;
  el.hidden = !cluster;
  el.innerHTML = cluster
    ? `<span class="stage__focus-label">Focused: ${escHtml(cluster.label)}</span>
       <button type="button" class="btn btn--ghost btn--sm" data-act="focus-exit">Show everything</button>`
    : '';
}

/** The chip while a hand link is being tied, plus the crosshair state. */
export function renderLinkChip(s) {
  const el = $('linkChip');
  if (!el) return;
  const node = s.linking ? s.atlas.nodes.get(s.linking) : null;
  el.hidden = !node;
  document.body.classList.toggle('is-linking', !!(node || s.pathing));
  el.innerHTML = node
    ? `<span class="stage__focus-label">Linking from ${escHtml(node.label)}: click another node</span>
       <button type="button" class="btn btn--ghost btn--sm" data-act="link-cancel">Cancel</button>`
    : '';
}

/** The chip while a shortest walk is being traced; same crosshair as linking. */
export function renderPathChip(s) {
  const el = $('pathChip');
  if (!el) return;
  const node = s.pathing ? s.atlas.nodes.get(s.pathing) : null;
  el.hidden = !node;
  document.body.classList.toggle('is-linking', !!(node || s.linking));
  el.innerHTML = node
    ? `<span class="stage__focus-label">Pathing from ${escHtml(node.label)}: click another node</span>
       <button type="button" class="btn btn--ghost btn--sm" data-act="path-cancel">Cancel</button>`
    : '';
}

export function renderNotice(s) {
  const el = $('notice');
  if (!el) return;
  el.hidden = !s.notice;
  el.textContent = s.notice || '';
}

export function renderMeta(s) {
  const el = $('corpusMeta');
  if (!el || !s.atlas) return;
  const nodes = s.atlas.topNodes.length;
  const clusters = s.atlas.clusters.size;
  el.textContent = `${nodes} nodes, ${clusters} ${plural(clusters, 'cluster', 'clusters')}, ${s.atlas.edges.length} links. Corpus of ${s.atlas.meta.generated}.`;
}

/** The canvas states its counts; the sidebar carries the detail. */
export function updateCanvasLabel(s) {
  const canvas = $('atlasCanvas');
  if (!canvas || !s.atlas) return;
  canvas.setAttribute(
    'aria-label',
    `Atlas of ${s.atlas.topNodes.length} hobby nodes in ${s.atlas.clusters.size} clusters. ` +
      `You have marked ${s.profile.n.length}. Use the controls beside the map to search and select.`,
  );
}

/** The one-time tip over the map, dropped as soon as the visitor touches it. */
export function renderHint(s) {
  const el = $('stageHint');
  if (!el) return;
  el.hidden = !!s.prefs.seenIntro;
  el.textContent = 'Drag to pan, scroll to zoom. Click a node to read it, then mark it as yours.';
}

/**
 * A corpus that violates the contract produces a visible error, not a
 * half-drawn map. The loader's detail names the file and the field.
 */
export function showFatal(detail) {
  const box = $('stageError');
  const hint = $('stageHint');
  if (hint) hint.hidden = true;
  if (!box) return;
  $('stageErrorDetail').textContent = detail;
  box.hidden = false;
}
