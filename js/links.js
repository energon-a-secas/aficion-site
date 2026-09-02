// ── Link and path modes ──────────────────────────────────────
// The two crosshair gestures: tying a hand link between two nodes, and
// tracing the shortest walk between another two. Split from actions.js when
// tie notes pushed that file past its 500-line budget. Same contract as
// actions.js: state transitions only, and the one DOM touch is moving focus
// so Escape (which listens on the canvas) stays reachable.

import { $, showToast, plural, joinList } from './utils.js';
import { addLink, removeLink, setLinkNote, shortestPath } from './alloc.js';
import { renderDetail, paint, announce } from './render.js';
import { renderLinkChip, renderPathChip } from './stage.js';
import { commit, trace } from './actions.js';

// ── Hand-tied links ──────────────────────────────────────────
export function startLink(s, id) {
  const node = s.atlas.nodes.get(id);
  if (!node || node.class === 'hub') return;
  s.linking = id;
  renderLinkChip(s);
  paint(s);
  // The only Escape for link mode listens on the canvas, and a button click
  // leaves focus on the button (or on body, in WebKit). Move it.
  $('atlasCanvas')?.focus();
  announce(`Linking from ${node.label}. Click another node to tie them together; Escape cancels.`);
}

export function cancelLink(s) {
  if (!s.linking) return;
  s.linking = null;
  renderLinkChip(s);
  paint(s);
  announce('Link cancelled.');
}

export function completeLink(s, targetId) {
  const from = s.linking;
  s.linking = null;
  renderLinkChip(s);
  const source = s.atlas.nodes.get(from);
  const target = s.atlas.nodes.get(targetId);
  if (!source || !target || target.class === 'hub' || from === targetId) {
    paint(s);
    announce('Nothing tied: a link needs two different nodes, and never the hub.');
    return;
  }
  const before = (s.profile.e || []).length;
  s.profile = addLink(s.profile, from, targetId);
  const added = (s.profile.e || []).length !== before;
  commit(s, added ? `${source.label} and ${target.label} tied together.` : `${source.label} and ${target.label} were already tied.`);
}

export function editLinkNote(s, key) {
  s.linkNoteEdit = key || null;
  renderDetail(s);
}

export function saveLinkNote(s, a, b, note) {
  s.linkNoteEdit = null;
  s.profile = setLinkNote(s.profile, a, b, note);
  const key = (a < b ? [a, b] : [b, a]).join('|');
  commit(s, (s.profile.en || {})[key] ? 'Note saved on the tie.' : 'Note cleared from the tie.');
}

export function unlink(s, a, b) {
  const la = s.atlas.nodes.get(a)?.label || a;
  const lb = s.atlas.nodes.get(b)?.label || b;
  s.profile = removeLink(s.profile, a, b);
  commit(s, `${la} and ${lb} untied.`);
}

// ── Path between two nodes ───────────────────────────────────
export function startPath(s, id) {
  const node = s.atlas.nodes.get(id);
  if (!node || node.class === 'hub') return;
  s.pathing = id;
  renderPathChip(s);
  $('atlasCanvas')?.focus();
  announce(`Pathing from ${node.label}. Click another node to trace the shortest walk; Escape cancels.`);
}

export function cancelPath(s) {
  if (!s.pathing) return;
  s.pathing = null;
  renderPathChip(s);
  announce('Path cancelled.');
}

export function completePath(s, targetId) {
  const from = s.pathing;
  s.pathing = null;
  renderPathChip(s);
  const source = s.atlas.nodes.get(from);
  const target = s.atlas.nodes.get(targetId);
  if (!source || !target || target.class === 'hub' || from === targetId) {
    announce('No path traced: it needs two different nodes, and never the hub.');
    return;
  }
  const walk = shortestPath(s.atlas, from, targetId);
  if (!walk) {
    showToast(`No walk connects ${source.label} and ${target.label}.`);
    announce(`No walk connects ${source.label} and ${target.label}.`);
    return;
  }
  trace(s, walk);
  const via = walk.slice(1, -1).map((id) => s.atlas.nodes.get(id)?.label).filter(Boolean);
  announce(
    `${source.label} to ${target.label}: ${walk.length - 1} ${plural(walk.length - 1, 'step', 'steps')}${via.length ? ` via ${joinList(via, 3)}` : ''}. Escape clears the trace.`,
  );
}
