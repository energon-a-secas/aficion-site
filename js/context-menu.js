// ── Context menu ─────────────────────────────────────────────
// Right-click on a node: the quick actions where the pointer already is. The
// menu is rendered markup carrying data-act, so the delegated click handler in
// events.js runs the exact actions the panel offers; nothing here mutates
// state. events.js owns opening (contextmenu), refreshing (a level click) and
// closing (any other action, an outside click, Escape, or a pan).

import { $, escHtml } from './utils.js';
import { levelOf } from './state.js';
import { hasInner } from './atlas/load.js';

let openId = null;
let openAt = { x: 0, y: 0 };

export function contextMenuNode() {
  return openId;
}

export function closeContextMenu() {
  const el = $('ctxMenu');
  if (!el || el.hidden) return;
  el.hidden = true;
  el.innerHTML = '';
  openId = null;
}

/** Re-render in place after a level click, so Medium then Hardcore is two clicks. */
export function refreshContextMenu(s) {
  if (openId) openContextMenu(s, openId, openAt.x, openAt.y, { focus: false });
}

export function openContextMenu(s, id, x, y, { focus = true } = {}) {
  const el = $('ctxMenu');
  const node = s.atlas.nodes.get(id);
  if (!el || !node) return;
  const mine = s.profile.n.includes(id);
  const current = levelOf(id);
  const markable = node.class !== 'hub';
  const depths = s.atlas.dedication
    .map(
      (d, i) => `<button type="button" class="depth depth--${i + 1}${current === i + 1 ? ' is-on' : ''}"
      data-act="level" data-node="${escHtml(id)}" data-level="${i + 1}" aria-pressed="${current === i + 1}">${escHtml(d.label)}</button>`,
    )
    .join('');
  el.innerHTML = `
    <p class="ctx__title">${escHtml(node.label)}</p>
    ${markable ? `<button type="button" class="ctx__item${mine ? '' : ' ctx__item--primary'}" data-act="toggle" data-node="${escHtml(id)}">${mine ? 'Remove from my map' : 'Mark as mine'}</button>` : ''}
    ${markable ? `<div class="ctx__depths" role="group" aria-label="Dedication">${depths}</div>` : ''}
    <button type="button" class="ctx__item" data-act="centre" data-node="${escHtml(id)}">Centre here</button>
    ${hasInner(s.atlas, id) ? `<button type="button" class="ctx__item" data-act="inner" data-node="${escHtml(id)}">Drill in</button>` : ''}
    ${node.cluster ? `<button type="button" class="ctx__item" data-act="focus-cluster" data-cluster="${escHtml(node.cluster)}">Focus this cluster</button>` : ''}
    <button type="button" class="ctx__item" data-act="open-panel">Details in the panel</button>`;
  el.hidden = false;
  openId = id;
  openAt = { x, y };
  const stage = $('stage');
  const bounds = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x + 4, bounds.width - r.width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(y + 4, bounds.height - r.height - 8))}px`;
  if (focus) el.querySelector('button')?.focus();
}
