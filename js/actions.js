// ── State transitions ────────────────────────────────────────
// Every change to the profile, the selection, the compare and the build passes
// through here. Split out of events.js when that file grew past its budget:
// events.js binds listeners, this file says what a listener does. Both halves
// stay short enough to read in one sitting, which is the point of the rule.
//
// Nothing here touches the DOM directly except to move focus. Rendering is
// render.js and panels.js; drawing is the renderer.

import { $, showToast, plural } from './utils.js';
import { persistProfile, setNotice } from './state.js';
import { toggle, setLevel, computeRoutes } from './alloc.js';
import { boundsOfIds } from './atlas/layout.js';
import { hasInner, ensureNodes } from './atlas/load.js';
import { openInner, closeInner } from './inner.js';
import { decode, reconcile, readPasted, saveBackup, PROFILE_VERSION } from './profile.js';
import { compare } from './compare.js';
import { ensureBuilds, listBuilds, applyBuild, buildProgress } from './builds.js';
import { ensureSheet } from './sheet.js';
import { renderSheet } from './render-sheet.js';
import { ensureExamples } from './examples.js';
import { render, renderDetail, paint, announce } from './render.js';
import { renderNotice, renderFocusChip } from './stage.js';
import { renderCompare, renderBuildsList, renderBuildPanel, renderInner, renderSharedPrompt } from './panels.js';
import { openModal, closeModal } from './modal.js';

/**
 * Bring a sidebar panel into view when something opens it.
 *
 * The sidebar is a scrolling column and a build or a compare result renders
 * below the fold, so without this the visitor clicks Compare, the dialog
 * closes, and nothing appears to have happened. On a narrow screen the sidebar
 * is a sheet, so it has to be opened first, and the toggle's state has to move
 * with it or the button lies about what it does.
 */
function revealPanel(id) {
  // The handle is visible at every width now, so sheet mode is the media
  // query, not the toggle's computed display.
  if (window.matchMedia('(max-width: 940px)').matches) {
    document.body.classList.add('side-open');
    $('panelToggle')?.setAttribute('aria-expanded', 'true');
  }
  $(id)?.scrollIntoView({ block: 'nearest' });
}

/**
 * The one path a profile change takes. Routes are recomputed here rather than
 * by each caller so the gold thread can never lag a node behind the map.
 *
 * A payload from a newer version is read but never written back: a stale tab
 * must not be able to downgrade somebody's saved map by opening their link.
 */
export function commit(s, message) {
  // Any profile change closes an open note editor: the row it pointed at may
  // no longer exist, and a stale key must not resurrect the input later.
  if (s.linkNoteEdit) s.linkNoteEdit = null;
  s.routes = computeRoutes(s.atlas, new Set(s.profile.n), s.profile.e || []);
  if (s.profile.v <= PROFILE_VERSION) persistProfile();
  render(s);
  renderBuildPanel(s);
  renderCompare(s);
  renderInner(s);
  if (message) announce(message);
}

export function select(s, id, { centre = false } = {}) {
  // Changing the selection abandons a note edit rather than parking it.
  if (s.linkNoteEdit && id !== s.selected) s.linkNoteEdit = null;
  s.selected = id;
  if (centre && id) {
    const p = s.layout.pos.get(id);
    if (p) s.camera.flyTo({ x: p.x, y: p.y, zoom: Math.max(s.camera.zoom, 1.1) });
  }
  renderDetail(s);
  paint(s);
  const node = id ? s.atlas.nodes.get(id) : null;
  if (node) announce(`${node.label}. ${node.blurb}`);
}

export function toggleNode(s, id) {
  const node = s.atlas.nodes.get(id);
  // The hub is the centre everything connects back through, not something a
  // person practises. render.js offers no button for it; this closes the
  // keyboard and double-click paths to the same place.
  if (!node || node.class === 'hub') return;
  const had = s.profile.n.includes(id);
  s.profile = toggle(s.profile, id);
  commit(s, `${node.label} ${had ? 'removed from' : 'added to'} your map.`);
}

export function applyLevel(s, id, level) {
  const node = s.atlas.nodes.get(id);
  // Dedication is universal: any markable node takes a depth. Setting one also
  // marks the node (setLevel adds it), so the right-click route is one gesture.
  if (!node || node.class === 'hub') return;
  const next = s.profile.l[id] === level ? null : level;
  s.profile = setLevel(s.profile, id, next);
  const d = s.atlas.dedication;
  commit(s, next ? `${node.label} set to ${d[next - 1].label}.` : `${node.label} dedication cleared.`);
}

/** Light the walk between two of the visitor's islands and fly along it. */
export function trace(s, path) {
  s.focusRing = new Set(path);
  s.camera.flyTo(boundsOfIds(s.layout, path, 140));
  paint(s);
  announce(`Tracing ${path.length} nodes.`);
}

export function clearMine(s) {
  s.profile = { ...s.profile, n: [], l: {}, e: [], en: {} };
  s.focusRing = new Set();
  commit(s, 'Your map is empty again.');
}

export function fitMine(s) {
  const ids = s.profile.n.filter((id) => s.layout.pos.has(id));
  if (!ids.length) {
    showToast('Nothing marked yet, so there is nothing to fit to.');
    return;
  }
  s.camera.flyTo(boundsOfIds(s.layout, ids, 160));
}

// ── Cluster focus ────────────────────────────────────────────
/**
 * The deep-down view: one family bright, everything else stepped back. The
 * kept set is the cluster's own nodes plus the crafts they draw on, which is
 * the "what sits underneath this" the mode exists to answer.
 */
export function focusCluster(s, clusterId) {
  const cluster = s.atlas.clusters.get(clusterId);
  if (!cluster) return;
  const keep = new Set(cluster.nodeIds);
  for (const id of cluster.nodeIds) {
    for (const link of s.atlas.adj.get(id) || []) {
      if (link.kind === 'draws-on' && link.dir === 'out') keep.add(link.to);
    }
  }
  s.clusterFocus = clusterId;
  s.clusterFocusIds = keep;
  renderFocusChip(s);
  s.camera.flyTo(boundsOfIds(s.layout, [...keep], 140));
  paint(s);
  announce(`Focused on ${cluster.label}: ${cluster.nodeIds.length} nodes and the crafts they lean on. Escape shows everything again.`);
}

export function leaveFocus(s) {
  if (!s.clusterFocus) return;
  s.clusterFocus = null;
  s.clusterFocusIds = null;
  renderFocusChip(s);
  paint(s);
  announce('Showing the whole atlas.');
}

/** Light every top-layer node sharing a tag. The trace channel, so Escape clears it. */
export function lightAffinity(s, tag) {
  const ids = (s.atlas.byTag.get(tag) || []).filter((id) => s.layout.pos.has(id));
  s.focusRing = new Set(ids);
  paint(s);
  announce(`${ids.length} nodes share ${s.atlas.tags.get(tag) || tag}. Escape clears the highlight.`);
}

/** A #node= address: centre and select, keeping the hash (it is an address,
    not a payload, so unlike #p= it is never consumed). */
export async function openNode(s, id) {
  await ensureNodes(s.atlas, [id]);
  if (!s.atlas.nodes.get(id)) {
    setNotice(`This link points at "${id}", which is not a node here.`);
    renderNotice(s);
    return;
  }
  // An inner node has no place on the top layer, so "centre" means its
  // parent, and the drill-in is where the linked node is actually visible.
  if (!s.layout.pos.has(id)) {
    const parent = id.split('.').slice(0, -1).join('.');
    const pp = s.layout.pos.get(parent);
    if (pp) s.camera.flyTo({ x: pp.x, y: pp.y, zoom: Math.max(s.camera.zoom, 1.1) });
    select(s, id);
    await drillInto(s, parent);
    return;
  }
  select(s, id, { centre: true });
}

export async function drillInto(s, id) {
  if (!hasInner(s.atlas, id)) return;
  try {
    s.inner = await openInner(s.atlas, id);
    renderInner(s);
    $('innerClose')?.focus();
  } catch (err) {
    showToast(`That drill-in did not load: ${err.detail || err.message}`);
  }
}

export function leaveInner(s) {
  closeInner();
  s.inner = null;
  renderInner(s);
  $('atlasCanvas')?.focus();
}

// ── The character sheet ──────────────────────────────────────
export async function openSheet(s) {
  let data;
  try {
    data = await ensureSheet(s.atlas.basePath);
  } catch (err) {
    showToast(`The sheet did not load: ${err.detail || err.message}`);
    return;
  }
  // Quests are a bonus row, not a precondition: a failed builds fetch just
  // renders a sheet without them.
  try {
    await ensureBuilds(s.atlas);
  } catch {
    /* the quests section is simply absent */
  }
  renderSheet(s, data);
  const overlay = $('sheetOverlay');
  if (overlay) overlay.hidden = false;
  // WebKit does not focus on click; the sheet places focus itself.
  $('sheetClose')?.focus();
}

/**
 * First visit only: the map opens as the example rather than an unexplained
 * starfield. Seeded once, persisted, and Clear my map is the reset; a cleared
 * map saves as empty, which is not "never saved", so it never re-seeds.
 */
export async function seedStarter(s) {
  try {
    const doc = await ensureExamples(s.atlas.basePath);
    const ex = doc.examples[0];
    await ensureNodes(s.atlas, ex.profile.n);
    const { profile } = reconcile(s.atlas, ex.profile);
    s.profile = profile;
    setNotice(`This is ${ex.name}, an example map to explore. Clear my map starts your own.`);
    commit(s, `Opened ${ex.name}, an example map.`);
    fitMine(s);
  } catch {
    /* an empty first map is the quiet fallback */
  }
}

/** Load an example map through the same card a shared link gets. */
export async function openExample(s, id = null) {
  let doc;
  try {
    doc = await ensureExamples(s.atlas.basePath);
  } catch (err) {
    showToast(`Examples did not load: ${err.detail || err.message}`);
    return;
  }
  const ex = (id && doc.examples.find((e) => e.id === id)) || doc.examples[0];
  if (!ex) return;
  await ensureNodes(s.atlas, ex.profile.n);
  const rec = reconcile(s.atlas, ex.profile);
  s.pendingShared = { rec, incoming: ex.profile, example: ex.name };
  renderSharedPrompt(s);
  revealPanel('sharedPanel');
  announce(`Example map: ${ex.name}. Yours is untouched.`);
}

export function closeSheet() {
  const overlay = $('sheetOverlay');
  if (overlay) overlay.hidden = true;
  $('atlasCanvas')?.focus();
}

// ── Compare ──────────────────────────────────────────────────
export function stopCompare(s) {
  s.theirs = null;
  s.theirName = null;
  s.comparison = null;
  renderCompare(s);
  paint(s);
}

/** Their map is held in memory only: never saved, never merged into yours. */
export async function runCompare(s) {
  const input = $('compareInput');
  const err = $('compareError');
  err.hidden = true;
  const parsed = readPasted(input.value);
  if (!parsed) {
    err.hidden = false;
    err.textContent = 'That does not look like an Aficion link. Paste the whole address.';
    return;
  }
  try {
    const theirs = await decode(parsed.key, parsed.payload);
    closeModal('compareModal');
    await applyTheirs(s, theirs);
  } catch (error) {
    err.hidden = false;
    err.textContent = error.message;
  }
}

/** The one compare entry: paste dialog and shared-link card both land here. */
async function applyTheirs(s, theirs) {
  await ensureNodes(s.atlas, theirs.n);
  const { profile } = reconcile(s.atlas, theirs);
  s.theirs = profile;
  s.theirName = profile.t || null;
  s.comparison = compare(s.atlas, s.profile, profile);
  renderCompare(s);
  paint(s);
  revealPanel('comparePanel');
  announce(`Comparing with ${profile.t || 'their map'}.`);
}

// ── Builds ───────────────────────────────────────────────────
export function openBuild(s, id) {
  const build = listBuilds(s.atlas).find((b) => b.id === id);
  if (!build) return;
  s.build = build;
  s.buildCursor = buildProgress(build, new Set(s.profile.n)).nextIndex;
  closeModal('buildsModal');
  renderBuildPanel(s);
  revealPanel('buildPanel');
  s.camera.flyTo(boundsOfIds(s.layout, build.steps.map((x) => x.node), 160));
  paint(s);
}

export function closeBuild(s) {
  s.build = null;
  renderBuildPanel(s);
  paint(s);
}

export function stackBuild(s) {
  if (!s.build) return;
  s.profile = applyBuild(s.profile, s.build, s.build.steps.length);
  commit(s, `${s.build.name} added to your map.`);
}

export async function openBuilds(s) {
  try {
    await ensureBuilds(s.atlas);
  } catch (err) {
    showToast(`Builds did not load: ${err.detail || err.message}`);
    return;
  }
  renderBuildsList(s);
  openModal('buildsModal');
}

/**
 * A profile arriving in the address bar, on load or on a later hash change.
 *
 * A link with thirty nodes and one id the corpus no longer has opens with
 * twenty-nine and says so once, in the panel. It never fails whole, and it
 * never silently falls back to the visitor's own saved map, because that looks
 * exactly like the link having worked.
 */
export async function applyHash(s, parsed) {
  try {
    const incoming = await decode(parsed.key, parsed.payload);
    await ensureNodes(s.atlas, incoming.n);
    const rec = reconcile(s.atlas, incoming);
    const mine = s.profile.n;
    const p = rec.profile;
    const differs = p.n.length !== mine.length || p.n.some((id) => !mine.includes(id));
    if (mine.length && differs) {
      // The natural gesture (clicking a link a friend sent) must never
      // overwrite the visitor's own saved map. Hold the decoded profile and
      // offer the honest outcomes instead of silently adopting it.
      s.pendingShared = { rec, incoming };
      renderSharedPrompt(s);
      revealPanel('sharedPanel');
      clearShareHash();
      announce(`A shared map of ${p.n.length} nodes arrived. Your map is untouched.`);
      return;
    }
    adoptShared(s, { rec, incoming });
  } catch (err) {
    setNotice(err.message);
    renderNotice(s);
  }
}

/** The payload is consumed; a reload must not re-apply it, and a copied
    address should be this page, not somebody's old map. */
function clearShareHash() {
  // Only a payload hash is consumed. A #node= address is kept: it is the
  // visitor's link to a place, not a profile in transit.
  if (/^#pj?=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}

/** Adopt a decoded link as the visitor's own map, backing the old one up. */
export function adoptShared(s, pending = s.pendingShared) {
  if (!pending) return;
  const { rec, incoming } = pending;
  const { profile, unknown, retired, clamped, droppedLinks } = rec;
  if (s.profile.n.length) saveBackup(s.profile);
  s.profile = profile;
  const notes = [];
  if (retired.length) {
    notes.push(`${retired.length} ${plural(retired.length, 'was on the map once and has', 'were on the map once and have')} been retired since`);
  }
  if (unknown.length) {
    notes.push(`${unknown.length} ${plural(unknown.length, 'is not a node here', 'are not nodes here')}`);
  }
  if (clamped.length) notes.push(`${clamped.length} had a depth this atlas no longer goes to`);
  if (droppedLinks) notes.push(`${droppedLinks} hand-tied ${plural(droppedLinks, 'link', 'links')} lost an end`);
  if (incoming.v > PROFILE_VERSION) {
    setNotice('This link was made with a newer version of Aficion. Reload the page to see all of it.');
  } else if (notes.length) {
    setNotice(`Opened ${profile.n.length} of ${incoming.n.length} nodes: ${notes.join(', ')}.`);
  } else {
    setNotice(null);
  }
  s.pendingShared = null;
  renderSharedPrompt(s);
  clearShareHash();
  commit(s, `Opened a shared map of ${profile.n.length} nodes.`);
  if (profile.n.length) fitMine(s);
}

/** Compare the held link with the visitor's map; theirs stays in memory only. */
export async function compareShared(s) {
  if (!s.pendingShared) return;
  const theirs = s.pendingShared.rec.profile;
  s.pendingShared = null;
  renderSharedPrompt(s);
  await applyTheirs(s, theirs);
}

export function dismissShared(s) {
  s.pendingShared = null;
  renderSharedPrompt(s);
  announce('Kept your map.');
}
