// ── DOM rendering ────────────────────────────────────────────
// Everything the canvas cannot draw: the node detail panel, the visitor's own
// list, suggestions, bridges, counters and the search results.
//
// This is also the accessibility story. A canvas is one element with no
// accessible content, so a screen reader on this page would otherwise find a
// header, a footer and a rectangle. Every node reachable by pointer is also
// reachable here, as a real button, with its cluster, tags and neighbours
// readable as text.

import { $, escHtml, joinList, plural } from './utils.js';
import { levelOf } from './state.js';
import { suggest, startingPoints } from './discover.js';
import { buckets } from './alloc.js';
import { hasInner } from './atlas/load.js';

const KIND_ORDER = ['kin', 'leads-to', 'shares-gear', 'draws-on'];

/**
 * The whole interface between the UI and the canvas. Every set is non-null.
 *
 * `suggested` is built from the same list the suggestions panel prints, so the
 * text half and the map half of requirement 4 can never disagree: what the
 * panel names, the map rings. `focus` is the separate channel for ids the
 * visitor asked to see, a traced bridge today. They were one slot until the two
 * states started overwriting each other, which is the defect the reference
 * product still ships.
 */
export function buildViewModel(s) {
  // The hovered node's neighbourhood: rung and named while the pointer rests,
  // which is the "what sits beside this" answer without a click.
  const hoverAdj = new Set();
  if (s.hover) {
    for (const link of s.atlas.adj.get(s.hover) || []) hoverAdj.add(link.to);
    hoverAdj.delete(s.atlas.hubId);
  }
  return {
    allocated: new Set(s.profile.n),
    levels: s.profile.l,
    route: s.routes.edges,
    hover: s.hover,
    hoverAdj,
    selected: s.selected,
    suggested: new Set(s.suggestions.map((x) => x.id)),
    focus: s.focusRing,
    clusterFocus: s.clusterFocusIds,
    layers: s.prefs.layers,
    personal: (s.profile.e || []).filter((p) => s.layout.pos.has(p[0]) && s.layout.pos.has(p[1])),
    linking: s.linking,
    compare: s.comparison
      ? {
          both: s.comparison.both,
          mineOnly: s.comparison.mineOnly,
          theirsOnly: s.comparison.theirsOnly,
          nearMiss: s.comparison.nearMiss,
          personal: (s.theirs && s.theirs.e ? s.theirs.e : []).filter(
            (p) => s.layout.pos.has(p[0]) && s.layout.pos.has(p[1]),
          ),
        }
      : null,
    build: s.build ? { steps: s.build.steps.map((x) => x.node), cursor: s.buildCursor } : null,
    dimOthers: s.dimOthers,
    showDrawsOn: s.prefs.showDrawsOn,
    labelMode: s.prefs.labelMode,
  };
}

export function paint(s) {
  if (!s.renderer) return;
  s.renderer.setView(buildViewModel(s));
  s.renderer.requestFrame();
}

export function announce(text) {
  const el = $('live');
  if (el) el.textContent = text;
}

function nodeButton(s, id, extra = '') {
  const node = s.atlas.nodes.get(id);
  if (!node) return '';
  const mine = s.profile.n.includes(id) ? ' is-mine' : '';
  return `<button type="button" class="chipnode${mine}" data-act="select" data-node="${escHtml(id)}">
    <span class="chipnode__dot" data-class="${escHtml(node.class)}"></span>${escHtml(node.label)}${extra}</button>`;
}

function tagChips(s, node) {
  if (!node.tags.length) return '';
  return `<p class="tags">${node.tags
    .map((t) => `<span class="tag">${escHtml(s.atlas.tags.get(t) || t)}</span>`)
    .join('')}</p>`;
}

function whereOf(s, node) {
  if (node.class === 'hub') return 'The centre of the atlas';
  if (node.class === 'core') return 'A craft that sits under several hobbies';
  const cluster = s.atlas.clusters.get(node.cluster);
  const parts = node.id.split('.');
  if (parts.length > 2) {
    const parent = s.atlas.nodes.get(parts.slice(0, -1).join('.'));
    if (parent) return `Inside ${escHtml(parent.label)}`;
  }
  return cluster ? escHtml(cluster.label) : 'Unclustered';
}

function levelPicker(s, node) {
  if (node.class === 'hub') return '';
  const current = levelOf(node.id);
  const buttons = s.atlas.dedication
    .map((lv, i) => {
      const on = current === i + 1 ? ' is-on' : '';
      return `<button type="button" class="depth depth--${i + 1}${on}" data-act="level" data-node="${escHtml(node.id)}"
        data-level="${i + 1}" aria-pressed="${current === i + 1}">${escHtml(lv.label)}</button>`;
    })
    .join('');
  let note = '';
  if (current) {
    const step = s.atlas.dedication[current - 1];
    // A node with an authored ladder keeps it as flavour under the one scale.
    const flavour = node.levels && current <= node.levels.length ? ` Here that looks like: ${node.levels[current - 1].label}.` : '';
    note = `<p class="panel__lead">${escHtml((step.note || '') + flavour)}</p>`;
  }
  return `<div class="field-block">
    <p class="field-label">Dedication, in time it takes</p>
    <div class="depths">${buttons}</div>${note}</div>`;
}

function neighbourList(s, node) {
  const links = (s.atlas.adj.get(node.id) || []).slice();
  if (!links.length) return '';
  links.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const rows = links
    .map((link) => {
      const kind = s.atlas.edgeKinds.get(link.kind);
      const verb = link.dir === 'in' && kind ? `${kind.label} this` : kind ? kind.label : link.kind;
      const note = link.note ? `<span class="link__note">${escHtml(link.note)}</span>` : '';
      return `<li>${nodeButton(s, link.to)}<span class="rel">${escHtml(verb)}</span>${note}</li>`;
    })
    .join('');
  return `<div class="field-block"><p class="field-label">Connects to</p><ul class="linklist">${rows}</ul></div>`;
}

export function renderDetail(s) {
  const title = $('detailTitle');
  const body = $('detailBody');
  if (!title || !body) return;
  const node = s.selected ? s.atlas.nodes.get(s.selected) : null;
  renderStageCard(s, node);
  if (!node) {
    title.textContent = 'Nothing selected';
    body.innerHTML =
      '<p class="panel__lead">Click a node on the map, or search for one. Arrow keys walk between nodes once the map has focus.</p>';
    return;
  }
  const mine = s.profile.n.includes(node.id);
  const markable = node.class !== 'hub';
  const drill = hasInner(s.atlas, node.id)
    ? `<button type="button" class="btn btn--secondary btn--sm" data-act="inner" data-node="${escHtml(node.id)}">Drill in</button>`
    : '';
  title.textContent = node.label;
  body.innerHTML = `
    <p class="panel__where">${whereOf(s, node)}</p>
    <p class="panel__blurb">${escHtml(node.blurb)}</p>
    ${tagChips(s, node)}
    <div class="toolbar">
      ${markable ? `<button type="button" class="btn ${mine ? 'btn--secondary' : 'btn--primary'} btn--sm"
              data-act="toggle" data-node="${escHtml(node.id)}">${mine ? 'Remove from my map' : 'Mark as mine'}</button>` : ''}
      ${markable ? `<button type="button" class="btn btn--ghost btn--sm" data-act="link-start" data-node="${escHtml(node.id)}">Link from here</button>` : ''}
      ${drill}
      ${node.cluster ? `<button type="button" class="btn btn--ghost btn--sm" data-act="focus-cluster" data-cluster="${escHtml(node.cluster)}">Focus cluster</button>` : ''}
      <button type="button" class="btn btn--ghost btn--sm" data-act="centre" data-node="${escHtml(node.id)}">Centre</button>
    </div>
    ${levelPicker(s, node)}
    ${personalLinks(s, node)}
    ${neighbourList(s, node)}`;
}

/** The visitor's own ties through this node: the note, its editor, the undo. */
function personalLinks(s, node) {
  const pairs = (s.profile.e || []).filter((p) => p[0] === node.id || p[1] === node.id);
  if (!pairs.length) return '';
  const en = s.profile.en || {};
  const rows = pairs
    .map((p) => {
      const other = p[0] === node.id ? p[1] : p[0];
      const key = p.join('|');
      const note = en[key];
      if (s.linkNoteEdit === key) {
        return `<li class="linkedit">
          <input type="text" class="field" maxlength="120" value="${escHtml(note || '')}"
                 placeholder="Why these two, in a line" aria-label="Note for this tie" data-note-input="${escHtml(key)}">
          <button type="button" class="btn btn--primary btn--sm" data-act="link-note-save" data-a="${escHtml(p[0])}" data-b="${escHtml(p[1])}">Save</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="link-note-cancel">Cancel</button>
        </li>`;
      }
      return `<li>${nodeButton(s, other)}<span class="rel">your link</span>
        <button type="button" class="btn btn--ghost btn--sm" data-act="link-note-edit" data-key="${escHtml(key)}">${note ? 'Edit note' : 'Add note'}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="unlink" data-a="${escHtml(p[0])}" data-b="${escHtml(p[1])}">Unlink</button>
        ${note ? `<span class="link__note">${escHtml(note)}</span>` : ''}</li>`;
    })
    .join('');
  return `<div class="field-block"><p class="field-label">Your links</p><ul class="linklist">${rows}</ul></div>`;
}

/**
 * Narrow screens: the docked card that answers a tap while the sheet is
 * closed. Without it the phone loop was tap, open the sheet, mark, close the
 * sheet: four taps with the map hidden in between. Same data-act plumbing as
 * the sheet, so the two can never act differently.
 */
function renderStageCard(s, node) {
  const card = $('stageCard');
  if (!card) return;
  if (!node || !window.matchMedia('(max-width: 940px)').matches) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  const mine = s.profile.n.includes(node.id);
  const markable = node.class !== 'hub';
  card.hidden = false;
  card.innerHTML = `
    <p class="panel__where">${whereOf(s, node)}</p>
    <p class="panel__title">${escHtml(node.label)}</p>
    <div class="toolbar">
      ${markable ? `<button type="button" class="btn ${mine ? 'btn--secondary' : 'btn--primary'} btn--sm"
              data-act="toggle" data-node="${escHtml(node.id)}">${mine ? 'Remove' : 'Mark as mine'}</button>` : ''}
      ${hasInner(s.atlas, node.id) ? `<button type="button" class="btn btn--secondary btn--sm" data-act="inner" data-node="${escHtml(node.id)}">Drill in</button>` : ''}
      <button type="button" class="btn btn--ghost btn--sm" data-act="open-panel">Details</button>
    </div>`;
}

function bridgeLines(s) {
  if (s.routes.bridges.length === 0) return '';
  const rows = s.routes.bridges
    .slice(0, 4)
    .map((b) => {
      const steps = b.path.length - 2;
      const via = b.path.slice(1, -1).map((id) => s.atlas.nodes.get(id)?.label).filter(Boolean);
      const how = steps <= 0 ? 'directly' : `through ${escHtml(joinList(via, 2))}`;
      return `<li><span class="bridge__text">${escHtml(s.atlas.nodes.get(b.from)?.label || b.from)} and
        ${escHtml(s.atlas.nodes.get(b.to)?.label || b.to)} are ${steps + 1}
        ${plural(steps + 1, 'step', 'steps')} apart, ${how}.</span>
        <button type="button" class="btn btn--ghost btn--sm" data-act="trace"
                data-path="${escHtml(b.path.join(','))}">Trace</button></li>`;
    })
    .join('');
  return `<div class="field-block"><p class="field-label">Not yet joined up</p><ul class="bridges">${rows}</ul></div>`;
}

/**
 * The heading a bucket renders under. alloc.js owns the rule, this owns the
 * copy, and the compare table imports it rather than writing its own, so the
 * two panels cannot end up calling the same bucket different things.
 */
export function bucketLabel(s, group) {
  if (group.kind === 'craft') return 'Crafts';
  if (group.kind === 'centre') return 'The centre';
  return s.atlas.clusters.get(group.cluster)?.label || 'Elsewhere';
}

/**
 * The sentence over the headings, counting exactly the buckets rendered under
 * it. Clusters are counted; crafts and the centre are named instead, because
 * each is one heading however many nodes sit in it and neither is a cluster.
 * Counting them as clusters is how the line came to contradict the headings it
 * sits on top of.
 */
function spreadLine(groups) {
  const all = [...groups.values()];
  const clusters = all.filter((g) => g.kind === 'cluster').length;
  const parts = [];
  if (clusters) parts.push(`${clusters} ${plural(clusters, 'cluster', 'clusters')}`);
  if (all.some((g) => g.kind === 'craft')) parts.push('the crafts underneath');
  if (all.some((g) => g.kind === 'centre')) parts.push('the centre');
  // No buckets means no headings either, and a sentence about a spread of
  // nothing is not a sentence.
  return parts.length ? ` in ${joinList(parts, 3)}` : '';
}

export function renderMine(s) {
  const body = $('mineBody');
  const count = $('mineCount');
  if (!body || !count) return;
  const ids = s.profile.n;
  count.textContent = String(ids.length);
  if (!ids.length) {
    body.innerHTML = `<p class="panel__lead">Nothing marked yet. Pick one thing you actually do and the map will start joining it up.</p>
      <div class="toolbar"><button type="button" class="btn btn--ghost btn--sm" data-act="example-open">See an example map</button></div>`;
    return;
  }
  const groups = buckets(s.atlas, ids);
  const blocks = [...groups.values()]
    .map((group) => {
      const label = bucketLabel(s, group);
      const chips = group.ids
        .map((id) => {
          const lv = levelOf(id);
          const badge = lv
            ? `<span class="chipnode__lv">${escHtml(s.atlas.dedication[Math.min(lv, s.atlas.dedication.length) - 1].label)}</span>`
            : '';
          return nodeButton(s, id, badge);
        })
        .join('');
      return `<div class="minegroup"><p class="field-label">${escHtml(label)}</p><div class="chips">${chips}</div></div>`;
    })
    .join('');
  const hand = (s.profile.e || []).length;
  body.innerHTML = `
    <p class="panel__lead">${ids.length} ${plural(ids.length, 'node', 'nodes')}${spreadLine(groups)},
      joined by ${s.routes.edges.size} ${plural(s.routes.edges.size, 'link', 'links')}${hand ? ` and ${hand} ${plural(hand, 'tie', 'ties')} of your own` : ''}.</p>
    ${blocks}
    ${bridgeLines(s)}
    <div class="toolbar">
      <button type="button" class="btn btn--ghost btn--sm" data-act="fit-mine">Fit to my map</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="sheet-open">Character sheet</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="example-open">Example map</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="clear-mine">Clear my map</button>
    </div>`;
}

/**
 * The threads through what the visitor marked, as clickable tag chips. A chip
 * lights every top-layer node sharing the tag, through the trace channel.
 */
function affinityChips(s, allocated) {
  if (allocated.size < 2) return '';
  const counts = new Map();
  for (const id of allocated) {
    const node = s.atlas.nodes.get(id);
    if (!node) continue;
    for (const t of node.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const top = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!top.length) return '';
  const chips = top
    .map(
      ([t, n]) => `<button type="button" class="tag tag--affinity" data-act="affinity" data-tag="${escHtml(t)}">
        ${escHtml(s.atlas.tags.get(t) || t)}<span class="tag__count">${n}</span></button>`,
    )
    .join('');
  return `<div class="field-block"><p class="field-label">Your affinities</p>
    <div class="chips">${chips}</div>
    <p class="panel__lead">Pick one to light everything on the map that shares it.</p></div>`;
}

export function renderSuggest(s) {
  const body = $('suggestBody');
  if (!body) return;
  const allocated = new Set(s.profile.n);
  s.suggestions = allocated.size ? suggest(s.atlas, allocated, { limit: 6 }) : startingPoints(s.atlas, 5);
  if (!s.suggestions.length) {
    body.innerHTML = `${affinityChips(s, allocated)}<p class="panel__lead">Nothing new is adjacent to what you have marked. Pan out and pick something further away.</p>`;
    return;
  }
  const intro = allocated.size
    ? ''
    : '<p class="panel__lead">Nothing marked yet, so here are the anchors each constellation is built around.</p>';
  const rows = s.suggestions
    .map((sug) => {
      const node = s.atlas.nodes.get(sug.id);
      if (!node) return '';
      return `<li class="sug">
        <div class="sug__head">${nodeButton(s, sug.id)}</div>
        <p class="sug__why">${escHtml(sug.reason)}</p>
        <div class="toolbar">
          <button type="button" class="btn btn--ghost btn--sm" data-act="toggle" data-node="${escHtml(sug.id)}">Add</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="centre" data-node="${escHtml(sug.id)}">Show me</button>
        </div>
      </li>`;
    })
    .join('');
  body.innerHTML = `${affinityChips(s, allocated)}${intro}<ul class="suglist">${rows}</ul>`;
}

export function renderSearch(s) {
  const list = $('searchResults');
  if (!list) return;
  const q = s.search.trim().toLowerCase();
  if (q.length < 2) {
    list.hidden = true;
    list.innerHTML = '';
    // The ring channel is shared with trace; typing claimed it, clearing
    // releases it.
    if (s.focusRing.size) {
      s.focusRing = new Set();
      paint(s);
    }
    return;
  }
  const hits = [];
  for (const [id, node] of s.atlas.nodes) {
    const hay = `${node.label} ${node.aka.join(' ')}`.toLowerCase();
    if (hay.includes(q)) hits.push({ id, node, rank: node.label.toLowerCase().startsWith(q) ? 0 : 1 });
    if (hits.length > 60) break;
  }
  hits.sort((a, b) => a.rank - b.rank || a.node.label.localeCompare(b.node.label));
  // The map answers with the panel: the same capped list the results print
  // gets the focus ring, so a match off-screen is still visibly somewhere.
  s.focusRing = new Set(hits.slice(0, 10).map((h) => h.id));
  paint(s);
  if (!hits.length) {
    list.hidden = false;
    list.innerHTML = '<li class="side__empty">Nothing by that name</li>';
    return;
  }
  list.hidden = false;
  list.innerHTML = hits
    .slice(0, 10)
    .map((h) => `<li>${nodeButton(s, h.id)}<span class="rel">${whereOf(s, h.node)}</span></li>`)
    .join('');
}

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

export function render(s) {
  renderHint(s);
  renderNotice(s);
  renderFocusChip(s);
  renderLinkChip(s);
  renderDetail(s);
  renderMine(s);
  renderSuggest(s);
  renderMeta(s);
  updateCanvasLabel(s);
  paint(s);
}
