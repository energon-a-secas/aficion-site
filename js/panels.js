// ── The dialogs and the drill-in ─────────────────────────────
// Share, compare, builds, and the inner-tree overlay. Each one renders into
// markup index.html already declares; none of them wires a listener, which is
// events.js's job, and none of them writes an inline onclick.

import { $, escHtml, joinList, plural } from './utils.js';
import { bucketLabel } from './render.js';
import { buildShareUrl } from './profile.js';
import { compareHeadline } from './compare.js';
import { buildProgress, buildSpan, listBuilds } from './builds.js';
import { renderDepth } from './atlas-depth.js';

export async function renderShare(s) {
  const field = $('shareUrl');
  const name = $('shareName');
  if (!field) return;
  if (name && document.activeElement !== name) name.value = s.profile.t || '';
  field.value = 'Building the link';
  const url = await buildShareUrl({ ...s.profile, t: name ? name.value : s.profile.t });
  field.value = url;
  const note = $('shareNote');
  if (note) {
    note.textContent =
      `${url.length} characters, and everything is after the hash, which browsers never send to a server.`;
  }
}

function bucket(s, title, ids, tone) {
  if (!ids.size) return '';
  const chips = [...ids]
    .map((id) => {
      const node = s.atlas.nodes.get(id);
      if (!node) return '';
      return `<button type="button" class="chipnode chipnode--${tone}" data-act="select" data-node="${escHtml(id)}">${escHtml(node.label)}</button>`;
    })
    .join('');
  return `<div class="minegroup"><p class="field-label">${escHtml(title)}</p><div class="chips">${chips}</div></div>`;
}

export function renderCompare(s) {
  const panel = $('comparePanel');
  const body = $('compareBody');
  if (!panel || !body) return;
  if (!s.comparison) {
    panel.hidden = true;
    body.innerHTML = '';
    return;
  }
  const c = s.comparison;
  const who = s.theirName ? escHtml(s.theirName) : 'Their map';
  // One row per bucket, labelled by the same function the mine panel's headings
  // use, counted by the same rule. The chip lists above and the columns below
  // are then two views of one set of numbers rather than two tallies.
  const rows = [...c.byBucket.values()]
    .map((n) => `<tr><th scope="row">${escHtml(bucketLabel(s, n))}</th><td>${n.mine}</td><td>${n.theirs}</td><td>${n.both}</td></tr>`)
    .join('');
  panel.hidden = false;
  body.innerHTML = `
    <p class="panel__lead">${escHtml(compareHeadline(c, s.theirName))}</p>
    ${bucket(s, 'On both maps', c.both, 'both')}
    ${bucket(s, `${who} only, one step from you`, c.nearMiss, 'near')}
    ${bucket(s, `${who} only`, new Set([...c.theirsOnly].filter((id) => !c.nearMiss.has(id))), 'theirs')}
    ${bucket(s, 'Yours only', c.mineOnly, 'mine')}
    <!-- aria-label rather than a .sr-only caption: base.css's .sr-only is
         position:absolute, and an absolutely positioned caption box resolves
         its static position outside the table, which leaves an invisible but
         real 1px box a thousand pixels down the page and inflates the
         document's scroll height. The label names the table just as well. -->
    <table class="tally" aria-label="Node counts by where each node sits">
      <thead><tr><th scope="col">Where</th><th scope="col">You</th><th scope="col">${who}</th><th scope="col">Both</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="toolbar"><button type="button" class="btn btn--ghost btn--sm" data-act="compare-clear">Stop comparing</button></div>`;
}

/** The card a shared link opens instead of overwriting the visitor's map. */
export function renderSharedPrompt(s) {
  const panel = $('sharedPanel');
  const body = $('sharedBody');
  if (!panel || !body) return;
  if (!s.pendingShared) {
    panel.hidden = true;
    body.innerHTML = '';
    return;
  }
  const ps = s.pendingShared;
  const p = ps.rec.profile;
  const title = $('sharedTitle');
  if (title) title.textContent = ps.example ? 'An example map' : 'A shared map';
  const line = ps.example
    ? `${escHtml(ps.example)}: ${p.n.length} nodes across the atlas. Yours is untouched.`
    : `${p.t ? escHtml(p.t) : 'Someone'} sent a map of ${p.n.length} ${plural(p.n.length, 'node', 'nodes')}. Yours is untouched.`;
  panel.hidden = false;
  body.innerHTML = `
    <p class="panel__blurb">${line}</p>
    <div class="toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-act="shared-compare">Compare with yours</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="shared-adopt">Replace mine with it</button>
    </div>
    <p class="panel__lead">Replacing keeps a one-step backup of your current map.</p>`;
}

export function renderBuildsList(s) {
  const host = $('buildsList');
  if (!host) return;
  const builds = listBuilds(s.atlas);
  if (!builds.length) {
    host.innerHTML = '<p class="panel__lead">No builds in this corpus yet.</p>';
    return;
  }
  const allocated = new Set(s.profile.n);
  host.innerHTML = builds
    .map((b) => {
      const p = buildProgress(b, allocated);
      const span = buildSpan(s.atlas, b);
      const stack = span.cores.length
        ? `Stacks ${escHtml(joinList(span.cores, 3))} under ${escHtml(joinList(span.clusters, 3))}.`
        : `Crosses ${escHtml(joinList(span.clusters, 3))}.`;
      return `<article class="card card--flat">
        <h3 class="panel__title">${escHtml(b.name)}</h3>
        <p class="panel__blurb">${escHtml(b.summary)}</p>
        <p class="panel__lead">${stack} ${p.done} of ${p.total} already yours.</p>
        <div class="toolbar">
          <button type="button" class="btn btn--primary btn--sm" data-act="build-open" data-build="${escHtml(b.id)}">Open this build</button>
        </div>
      </article>`;
    })
    .join('');
}

export function renderBuildPanel(s) {
  const panel = $('buildPanel');
  const body = $('buildBody');
  const title = $('buildTitle');
  if (!panel || !body || !title) return;
  if (!s.build) {
    panel.hidden = true;
    body.innerHTML = '';
    return;
  }
  const allocated = new Set(s.profile.n);
  const p = buildProgress(s.build, allocated);
  title.textContent = s.build.name;
  const steps = s.build.steps
    .map((step, i) => {
      const node = s.atlas.nodes.get(step.node);
      const label = node ? node.label : step.node;
      const done = allocated.has(step.node);
      const cur = i === s.buildCursor ? ' is-cursor' : '';
      const depth = step.level
        ? ` <span class="chipnode__lv">${escHtml(s.atlas.dedication[Math.min(step.level, s.atlas.dedication.length) - 1].label)}</span>`
        : '';
      return `<li class="step${done ? ' is-done' : ''}${cur}">
        <button type="button" class="chipnode" data-act="build-step" data-index="${i}" data-node="${escHtml(step.node)}">${escHtml(label)}${depth}</button>
        <p class="sug__why">${escHtml(step.why)}</p>
      </li>`;
    })
    .join('');
  panel.hidden = false;
  body.innerHTML = `
    <p class="panel__blurb">${escHtml(s.build.summary)}</p>
    <p class="panel__lead">${p.done} of ${p.total} ${plural(p.total, 'step', 'steps')} already on your map. The order is the order.</p>
    <ol class="steps">${steps}</ol>
    <div class="toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-act="build-apply">Add every step to my map</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="build-close">Put it back</button>
    </div>`;
}

/**
 * The drill-in. SVG rather than canvas, because 24 nodes want crisp text and a
 * real focus order, and because it keeps drill-in state out of the renderer.
 */
export function renderInner(s) {
  renderDepth(s);
}
