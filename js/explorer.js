import { $, escHtml as esc } from './utils.js';
import { searchHobbies, parentId } from './explore-model.js';
import { copy, icon } from './explore-copy.js';
import { hobbyRow, detailPage } from './explore-detail.js';
import { featureMarkup, positionFeature } from './explore-feature.js';

function breadcrumb(s) {
  const c = copy(s);
  const { route, content } = s.explore;
  const node = route.node && s.atlas.nodes.get(route.node);
  const cluster = s.atlas.clusters.get(route.cluster || node?.cluster);
  const family = content.families.find((f) => f.id === route.family || (cluster && f.clusters.includes(cluster.id)));
  const parent = node && parentId(node.id);
  const items = [`<a href="#explore">${c.explore}</a>`];
  if (family) items.push(`<a href="#direction=${esc(family.id)}">${esc(family.label)}</a>`);
  if (cluster) items.push(`<a href="#category=${esc(cluster.id)}">${esc(cluster.label)}</a>`);
  if (parent && s.atlas.nodes.has(parent)) items.push(`<a href="#hobby=${esc(parent)}">${esc(s.atlas.nodes.get(parent).label)}</a>`);
  if (node) items.push(`<span aria-current="page">${esc(node.label)}</span>`);
  return `<nav class="ex-breadcrumb" aria-label="${c.browse}">${items.join('<span aria-hidden="true">/</span>')}</nav>`;
}

function familyNavigation(s) {
  const c = copy(s);
  const ex = s.explore;
  const node = ex.route.node && s.atlas.nodes.get(ex.route.node);
  const current = ex.content.families.find((f) => f.id === ex.route.family || f.clusters.includes(ex.route.cluster || node?.cluster));
  return `<aside class="ex-sidebar" aria-label="${c.directions}">
    <p class="ex-sidebar__label">${c.directions}</p>
    <nav class="ex-directions"><a href="#explore" ${!current && ex.route.view !== 'mine' ? 'aria-current="page"' : ''}>${icon('network', 18)}<span>${c.all}</span></a>
    ${ex.content.families.map((f, i) => `<a href="#direction=${esc(f.id)}" ${f === current ? 'aria-current="page"' : ''}><span class="ex-direction-number">${String(i + 1).padStart(2, '0')}</span><span>${esc(f.label)}</span></a>`).join('')}</nav>
    <div class="ex-map-invite">${icon('network', 28)}<h3>${c.mapHelp}</h3><p>${c.mapHint}</p><a href="#atlas">${c.openMap} ${icon('arrow', 16)}</a></div>
  </aside>`;
}

function hero(s) {
  const c = copy(s);
  return `<header class="ex-hero"><div><p class="ex-eyebrow">${c.eyebrow}</p><h2 id="exploreHeading" tabindex="-1">${c.headline}</h2><p class="ex-intro">${c.intro}</p><p class="ex-hero__note">${icon('bookmark', 15)} ${c.local}</p></div></header>`;
}

function searchBox(s) {
  const c = copy(s);
  const ex = s.explore;
  return `<div class="ex-search-area"><div class="ex-search">${icon('search', 21)}<label class="sr-only" for="exploreSearch">${c.search}</label><input id="exploreSearch" type="search" autocomplete="off" placeholder="${c.search}" value="${esc(ex.query)}" aria-describedby="exploreSearchHint"><kbd aria-hidden="true">/</kbd></div><p class="sr-only" id="exploreSearchHint">${c.searchHint}</p>
    <div class="ex-filters" role="group" aria-label="${c.hobbies}">${[['all', c.allHobbies], ['easy', c.easy], ['deep', c.deep]].map(([id, label]) => `<button type="button" data-ex="filter" data-filter="${id}" aria-pressed="${ex.filter === id}">${label}</button>`).join('')}</div></div>`;
}

function categoryRows(s, categories) {
  const c = copy(s);
  return `<ul class="ex-categories">${categories.map((cluster) => {
    const samples = cluster.nodeIds.slice(0, 3).map((id) => s.atlas.nodes.get(id).label).join(' · ');
    return `<li><a href="#category=${esc(cluster.id)}"><span class="ex-category__text"><span class="ex-category__name">${esc(cluster.label)}</span><span class="ex-category__samples">${esc(samples)}</span></span><span class="ex-category__count">${cluster.nodeIds.length}</span>${icon('arrow', 18)}</a></li>`;
  }).join('')}</ul><p class="ex-caption ex-list-note">${c.hobbies} / ${c.subtopics}</p>`;
}

export function resultsMarkup(s) {
  const c = copy(s);
  const ex = s.explore;
  const { route } = ex;
  const family = ex.content.families.find((f) => f.id === route.family);
  const searching = ex.query.trim() || ex.filter !== 'all' || route.view === 'mine';
  if (!searching && !route.cluster) {
    const order = ex.content.featuredCategories || [];
    const rank = (cluster) => order.includes(cluster.id) ? order.indexOf(cluster.id) : order.length;
    const clusters = [...s.atlas.clusters.values()].sort((a, b) => rank(a) - rank(b)).filter((cluster) => !family || family.clusters.includes(cluster.id));
    const visible = clusters.slice(0, ex.limit);
    return `<div class="ex-section-head"><div><h3>${c.categories}</h3><p>${c.categoryHint}</p></div><span class="ex-total">${clusters.length}</span></div>${categoryRows(s, visible)}
      ${visible.length < clusters.length ? `<button type="button" class="ex-more" data-ex="more">${c.allCategories} (${clusters.length}) ${icon('arrow', 16)}</button>` : ''}`;
  }
  let records = ex.records;
  if (family) records = records.filter((n) => family.clusters.includes(n.cluster));
  if (!ex.query.trim()) records = records.filter((n) => !parentId(n.id) || route.view === 'mine');
  const hits = searchHobbies(records, ex.query, { cluster: route.cluster, filter: ex.filter, saved: route.view === 'mine' ? new Set(s.profile.n) : null });
  const visible = hits.slice(0, ex.limit);
  return `<div class="ex-results-heading"><h3>${route.cluster && !searching ? c.hobbies : c.results}</h3><span role="status">${hits.length} ${c.results}</span></div>
    ${hits.length ? `<ul class="ex-hobbies">${visible.map((node) => hobbyRow(s, node)).join('')}</ul>` : `<div class="ex-empty"><h3>${c.noResults}</h3><p>${c.noResultsHint}</p><button type="button" class="ex-text-button" data-ex="reset">${c.reset}</button></div>`}
    ${hits.length > visible.length ? `<button type="button" class="ex-more" data-ex="more">${c.more} (${hits.length - visible.length}) ${icon('arrow', 16)}</button>` : ''}`;
}

function listing(s) {
  const c = copy(s);
  const ex = s.explore;
  const mine = ex.route.view === 'mine';
  const family = ex.content.families.find((f) => f.id === ex.route.family);
  const cluster = s.atlas.clusters.get(ex.route.cluster);
  if ((ex.route.family && !family) || (ex.route.cluster && !cluster)) return unavailable(s);
  const intro = mine ? `<header class="ex-list-intro"><p class="ex-eyebrow">${c.mine} · ${s.profile.n.length}</p><h2 id="exploreHeading" tabindex="-1">${c.collectionTitle}</h2><p class="ex-intro">${c.collectionIntro}</p>${s.profile.n.length ? `<div class="toolbar"><button type="button" class="btn btn--secondary" data-ex="my-atlas">${c.openMap}</button><button type="button" class="btn btn--ghost" data-act="sheet-open">${c.viewSummary}</button><button type="button" class="btn btn--ghost" data-ex="share">${c.share}</button></div>` : ''}</header>`
    : cluster || family ? `<header class="ex-list-intro"><p class="ex-eyebrow">${cluster ? c.hobbies : c.directions}</p><h2 id="exploreHeading" tabindex="-1">${esc((cluster || family).label)}</h2><p class="ex-intro">${esc((cluster || family).blurb)}</p>${cluster ? `<button type="button" class="ex-text-button" data-ex="map-cluster" data-cluster="${esc(cluster.id)}">${c.openMap} ${icon('arrow', 16)}</button>` : ''}</header>` : '';
  if (mine && !s.profile.n.length) return `${intro}<div class="ex-empty ex-empty--collection">${icon('bookmark', 36)}<h3>${c.emptyTitle}</h3><p>${c.emptyHint}</p><a href="#explore" class="btn btn--primary">${c.start} ${icon('arrow', 17)}</a><p class="ex-caption">${c.local}</p></div>`;
  return `${intro}${searchBox(s)}<div id="exploreResults">${resultsMarkup(s)}</div>`;
}

function unavailable(s) {
  const c = copy(s);
  const known = s.explore.records.some((node) => node.id === s.explore.route.node);
  if (known) return `<div class="ex-empty"><h2 id="exploreHeading" tabindex="-1">${c.treeError}</h2><a class="btn btn--secondary" href="#hobby=${esc(s.explore.route.node)}">${c.retry}</a></div>`;
  return `<div class="ex-empty"><h2 id="exploreHeading" tabindex="-1">${c.unavailable}</h2><p>${c.unavailableHint}</p><a class="btn btn--secondary" href="#explore">${c.browseAll}</a></div>`;
}

export function renderExplorer(s) {
  if (!s.explore) return;
  const c = copy(s);
  const ex = s.explore;
  const count = $('collectionCount');
  if (count) { count.textContent = s.profile.n.length; count.hidden = !s.profile.n.length; }
  document.querySelectorAll('[data-view-label]').forEach((el) => { el.textContent = c[el.dataset.viewLabel]; });
  if (ex.route.view === 'atlas') return;
  const host = $('explorer');
  const held = document.activeElement;
  const active = host.contains(held) ? { id: held.id, action: held.dataset.ex, node: held.dataset.node, lens: held.dataset.lens, filter: held.dataset.filter } : null;
  const opened = [...host.querySelectorAll('details[open]')].map((el) => el.className);
  const scroll = host.scrollTop;
  const node = ex.route.node && s.atlas.nodes.get(ex.route.node);
  const home = ex.route.view === 'explore' && !ex.route.node && !ex.route.cluster && !ex.route.family;
  host.innerHTML = `<div class="ex-wrap${ex.route.node ? ' ex-wrap--detail' : ''}${home ? ' ex-wrap--home' : ''}">${home ? hero(s) + featureMarkup(s) : breadcrumb(s)}${ex.partial ? `<p class="ex-load-note" role="status">${c.partial}</p>` : ''}<div class="ex-layout">${familyNavigation(s)}<div class="ex-content">${ex.route.node ? node ? detailPage(s, node) : unavailable(s) : listing(s)}</div></div></div>`;
  host.querySelector('.ex-wrap--home')?.classList.toggle('is-searching', !!ex.query.trim() || ex.filter !== 'all');
  positionFeature();
  for (const cls of opened) { const el = host.getElementsByClassName(cls)[0]; if (el) el.open = true; }
  host.scrollTop = scroll;
  if (active) {
    let next = active.id ? $(active.id) : null;
    if (!next && active.action) next = [...host.querySelectorAll('[data-ex]')].find((el) => el.dataset.ex === active.action && el.dataset.node === active.node && el.dataset.lens === active.lens && el.dataset.filter === active.filter);
    next?.focus({ preventScroll: true });
  }
}
