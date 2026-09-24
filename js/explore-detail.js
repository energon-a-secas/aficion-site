import { escHtml as esc } from './utils.js';
import { connections, parentId } from './explore-model.js';
import { copy, icon } from './explore-copy.js';

export function saveButton(s, node, compact = false) {
  const c = copy(s);
  const saved = s.profile.n.includes(node.id);
  return `<button type="button" class="ex-save ${saved ? 'is-saved' : ''} ${compact ? 'ex-save--small' : ''}" data-ex="save" data-node="${esc(node.id)}" aria-pressed="${saved}" aria-label="${esc((saved ? c.remove : c.save) + ': ' + node.label)}">${icon(saved ? 'check' : 'plus', 17)}${compact ? '' : `<span>${saved ? c.saved : c.save}</span>`}</button>`;
}

export function hobbyRow(s, node, { description = true } = {}) {
  const c = copy(s);
  const parent = parentId(node.id);
  const parentNode = parent && s.explore.records.find((n) => n.id === parent);
  const count = node.inner ? s.explore.records.filter((n) => parentId(n.id) === node.id).length : 0;
  return `<li class="ex-hobby">
    <a class="ex-hobby__link" href="#hobby=${esc(node.id)}">
      <span class="ex-hobby__name">${esc(node.label)}${count ? `<span class="ex-depth">${count} ${c.subtopics}</span>` : ''}</span>
      ${parentNode ? `<span class="ex-hobby__parent">${c.inside} ${esc(parentNode.label)}</span>` : ''}
      ${description ? `<span class="ex-hobby__description">${esc(node.blurb)}</span>` : ''}
    </a>${saveButton(s, node, true)}</li>`;
}

export function connectionSection(s, node) {
  const c = copy(s);
  const lens = s.explore.lens;
  const rows = connections(s.atlas, node.id, lens);
  const visible = rows.slice(0, s.explore.connectionLimit);
  return `<section class="ex-connections" aria-labelledby="connectionsHeading">
    <div class="ex-section-head"><div><p class="ex-eyebrow">${c.connectionsHint}</p><h3 id="connectionsHeading" tabindex="-1">${c.connections}</h3></div>${icon('network', 28)}</div>
    <div class="ex-lenses" role="group" aria-label="${c.connections}">${['related', 'skills', 'gear', 'interests'].map((id) => `<button type="button" data-ex="lens" data-lens="${id}" aria-pressed="${id === lens}">${c[id]}</button>`).join('')}</div>
    <p class="ex-caption" id="lensDescription">${c[lens + 'Hint']}</p>
    <div class="ex-connection-list" aria-describedby="lensDescription">
      ${visible.length ? visible.map((r) => `<article class="ex-connection">
        <span class="ex-connection__line" aria-hidden="true"></span>
        <div><a href="#hobby=${esc(r.node.id)}" class="ex-connection__title">${esc(r.node.label)} ${icon('arrow', 15)}</a>
        <p>${r.inferred ? `<span class="ex-connection__reason">${lens === 'skills' ? c.through : c.tags}: </span>` : ''}${esc(r.reason)}</p>
        ${r.path.length ? `<button type="button" class="ex-text-button" data-ex="trace" data-path="${esc(r.path.join(','))}">${c.showMap}</button>` : ''}</div>
        ${saveButton(s, r.node, true)}
      </article>`).join('') : `<p class="ex-empty-line">${c.noConnections}</p>`}
    </div>
    ${rows.length > visible.length ? `<button type="button" class="ex-more" data-ex="more-connections">${c.more} (${rows.length - visible.length}) ${icon('arrow', 16)}</button>` : ''}
  </section>`;
}

export function detailPage(s, node) {
  const c = copy(s);
  const ex = s.explore;
  const starter = ex.content.starters[node.id];
  const parent = parentId(node.id);
  const guide = starter || (parent && ex.content.starters[parent]);
  const children = ex.records.filter((n) => parentId(n.id) === node.id);
  return `<article class="ex-detail">
    <header class="ex-detail__head"><p class="ex-eyebrow">${esc(s.atlas.clusters.get(node.cluster)?.label || c.skill)}</p>
      <h2 id="exploreHeading" tabindex="-1">${esc(node.label)}</h2>
      <p class="ex-intro">${esc(node.blurb)}</p>
      <div class="ex-detail__actions">${saveButton(s, node)}<button type="button" class="btn btn--ghost" data-ex="map-node" data-node="${esc(node.id)}">${icon('network', 17)} ${c.openMap}</button></div>
      <p class="ex-caption">${c.local}</p>
      <nav class="ex-jump" aria-label="${c.advanced}">${children.length ? `<button type="button" data-ex="jump" data-target="subtopicsHeading">${c.subtopics} <span>${children.length}</span></button>` : ''}<button type="button" data-ex="jump" data-target="connectionsHeading">${c.connections} ${icon('arrow', 14)}</button></nav>
    </header>
    ${guide && !parent ? `<section class="ex-first"><span class="ex-first__number" aria-hidden="true">01</span><div><h3>${c.first}</h3><p>${esc(guide)}</p></div></section>` : ''}
    ${children.length ? `<section class="ex-subtopics"><div class="ex-section-head"><div><h3 id="subtopicsHeading" tabindex="-1">${c.deeper}</h3><p>${c.deeperHint}</p></div><span class="ex-total">${children.length}</span></div><ul class="ex-hobbies">${children.map((n) => hobbyRow(s, n)).join('')}</ul></section>` : ''}
    ${connectionSection(s, node)}
    <details class="ex-advanced"><summary>${c.advanced}</summary><div class="ex-advanced__body"><h3>${c.commitment}</h3><p class="ex-caption">${c.commitmentHint}</p><div class="depths">${s.atlas.dedication.map((level, i) => `<button type="button" class="depth depth--${i + 1}" data-ex="level" data-node="${esc(node.id)}" data-level="${i + 1}" aria-pressed="${s.profile.l[node.id] === i + 1}">${esc(level.label)}</button>`).join('')}</div><button type="button" class="ex-text-button" data-ex="copy-hobby" data-node="${esc(node.id)}">${c.copyHobby}</button></div></details>
  </article>`;
}
