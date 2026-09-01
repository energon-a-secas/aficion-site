// ── The character sheet ──────────────────────────────────────
// The payoff view: name plate, the domain radar, the inventory, threads and
// quests. Real DOM and SVG, so unlike the canvas map it reads aloud. All of
// it derives from one computeSheet() result per render, so the picture and
// the printed integers cannot disagree. The polygon is shape; the printed
// number is the truth.

import { $, escHtml, plural } from './utils.js';
import { buckets } from './alloc.js';
import { bucketLabel } from './render.js';
import { levelOf } from './state.js';
import { computeSheet, computeTitles } from './sheet.js';
import { listBuilds, buildProgress } from './builds.js';

const R = 150;
const CX = 220;
const CY = 220;

function pt(i, r) {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}

function poly(vals, M) {
  return vals.map((v, i) => pt(i, (R * v) / M).map((n) => n.toFixed(1)).join(',')).join(' ');
}

function radarSvg(axes, theirsAxes) {
  const claimed = axes.map((a) => a.claimed);
  const implied = axes.map((a) => a.implied);
  const theirs = theirsAxes ? theirsAxes.map((a) => a.claimed) : null;
  // Absolute floor: a one-mark profile draws a modest spike, never a
  // full-radius hexagon. Shared max keeps the two polygons comparable.
  const M = Math.max(4, ...claimed, ...(theirs || implied));
  const grid = [1 / 3, 2 / 3, 1]
    .map((f) => `<polygon class="radar__grid" points="${axes.map((_, i) => pt(i, R * f).map((n) => n.toFixed(1)).join(',')).join(' ')}"/>`)
    .join('');
  const spokes = axes
    .map((_, i) => {
      const [x, y] = pt(i, R);
      return `<line class="radar__grid" x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    })
    .join('');
  const labels = axes
    .map((a, i) => {
      const [x, y] = pt(i, R + 34);
      return `<text class="radar__label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${escHtml(a.label)}</text>
        <text class="radar__value" x="${x.toFixed(1)}" y="${(y + 15).toFixed(1)}" text-anchor="middle">${a.claimed}</text>`;
    })
    .join('');
  const second = theirs
    ? `<polygon class="radar__theirs" points="${poly(theirs, M)}"/>`
    : `<polygon class="radar__implied" points="${poly(implied, M)}"/>`;
  const dots = axes
    .map((a, i) => {
      const [x, y] = pt(i, (R * a.claimed) / M);
      return `<circle class="radar__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4"/>`;
    })
    .join('');
  const label = `Domain chart. ${axes.map((a) => `${a.label} ${a.claimed}`).join(', ')}.`;
  return `<svg class="sheet__radar" viewBox="0 0 440 440" role="img" aria-label="${escHtml(label)}">
    ${grid}${spokes}${second}<polygon class="radar__claimed" points="${poly(claimed, M)}"/>${dots}${labels}</svg>`;
}

function chip(s, id, extra = '') {
  const node = s.atlas.nodes.get(id);
  if (!node) return '';
  const mine = s.profile.n.includes(id) ? ' is-mine' : '';
  return `<button type="button" class="chipnode${mine}" data-act="sheet-goto" data-node="${escHtml(id)}">
    <span class="chipnode__dot" data-class="${escHtml(node.class)}"></span>${escHtml(node.label)}${extra}</button>`;
}

function levelBadge(s, id) {
  const node = s.atlas.nodes.get(id);
  const lv = levelOf(id);
  if (!lv || !node || !node.levels) return '';
  // The local profile is not re-clamped by reconcile; never index past the ladder.
  const li = Math.min(lv, node.levels.length);
  return ` <span class="chipnode__lv">${escHtml(node.levels[li - 1].label)}</span>`;
}

function domainRows(sheet) {
  return sheet.axes
    .map((a) => {
      const practised = a.crafts.filter((c) => c.mine);
      const lean = `${a.implied} of your hobbies ${plural(a.implied, 'leans', 'lean')} on it`;
      const doing = practised.length
        ? `; you practise ${practised.map((c) => (c.level ? `${escHtml(c.label)} (${escHtml(c.level)})` : escHtml(c.label))).join(', ')}`
        : '';
      const chips = a.crafts
        .map((c) => `<button type="button" class="chipnode${c.mine ? ' is-mine' : ''}" data-act="sheet-goto" data-node="${escHtml(c.id)}">
          <span class="chipnode__dot" data-class="core"></span>${escHtml(c.label)}</button>`)
        .join('');
      return `<li class="sheet__domain">
        <p class="sheet__domain-head"><span class="sheet__domain-name">${escHtml(a.label)}</span><span class="pill">${a.claimed}</span></p>
        <p class="panel__lead">${lean}${doing}.</p>
        <div class="chips">${chips}</div>
      </li>`;
    })
    .join('');
}

function inventory(s) {
  const groups = buckets(s.atlas, s.profile.n);
  const blocks = [...groups.values()]
    .sort((a, b) => b.ids.length - a.ids.length)
    .map((group) => {
      const chips = group.ids.map((id) => chip(s, id, levelBadge(s, id))).join('');
      return `<div class="minegroup"><p class="field-label">${escHtml(bucketLabel(s, group))}</p><div class="chips">${chips}</div></div>`;
    })
    .join('');
  return blocks ? `<section class="sheet__section"><h3 class="sheet__h">Inventory</h3>${blocks}</section>` : '';
}

function threads(s) {
  if (!s.routes.bridges.length) return '';
  const rows = s.routes.bridges
    .slice(0, 4)
    .map((b) => {
      const from = s.atlas.nodes.get(b.from)?.label || b.from;
      const to = s.atlas.nodes.get(b.to)?.label || b.to;
      const steps = b.path.length - 1;
      return `<li><span class="bridge__text">${escHtml(from)} and ${escHtml(to)}, ${steps} ${plural(steps, 'step', 'steps')} apart.</span>
        <button type="button" class="btn btn--ghost btn--sm" data-act="sheet-trace" data-path="${escHtml(b.path.join(','))}">Trace</button></li>`;
    })
    .join('');
  return `<section class="sheet__section"><h3 class="sheet__h">Threads not yet joined</h3><ul class="bridges">${rows}</ul></section>`;
}

function quests(s) {
  let builds = [];
  try {
    builds = listBuilds(s.atlas);
  } catch {
    return '';
  }
  const allocated = new Set(s.profile.n);
  const rows = builds
    .map((b) => ({ b, p: buildProgress(b, allocated) }))
    .filter((x) => x.p.done > 0)
    .map(({ b, p }) => {
      const pct = Math.round((p.done / p.total) * 100);
      return `<li class="sheet__quest">
        <span class="sheet__quest-name">${escHtml(b.name)}</span>
        <span class="sheet__meter" role="presentation"><span style="width:${pct}%"></span></span>
        <span class="panel__lead">${p.done} of ${p.total}</span>
        <button type="button" class="btn btn--ghost btn--sm" data-act="sheet-quest" data-build="${escHtml(b.id)}">Open</button>
      </li>`;
    })
    .join('');
  return rows ? `<section class="sheet__section"><h3 class="sheet__h">Quests underway</h3><ul class="sheet__quests">${rows}</ul></section>` : '';
}

function compareStrip(s, mineSheet, theirSheet) {
  const c = s.comparison;
  if (!c || !theirSheet) return '';
  const who = s.theirName ? escHtml(s.theirName) : 'Them';
  const mineMarked = new Set(s.profile.n);
  const theirsMarked = new Set(s.theirs.n);
  const frontier = mineSheet.axes
    .flatMap((a) => a.crafts)
    .filter((cr) => theirsMarked.has(cr.id) && !mineMarked.has(cr.id))
    .map((cr) => chip(s, cr.id))
    .join('');
  return `<section class="sheet__section">
    <h3 class="sheet__h">Against ${who}</h3>
    <div class="sheet__tiles">
      <div class="sheet__tile"><span>${c.both.size}</span>Both</div>
      <div class="sheet__tile"><span>${c.mineOnly.size}</span>Only you</div>
      <div class="sheet__tile"><span>${c.theirsOnly.size}</span>Only ${who}</div>
    </div>
    ${frontier ? `<p class="field-label">Crafts on their map, not yet on yours</p><div class="chips">${frontier}</div>` : ''}
  </section>`;
}

const HEX = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/></svg>';

export function renderSheet(s, doc) {
  const domains = doc.domains;
  const body = $('sheetBody');
  const title = $('sheetTitle');
  const stat = $('sheetStat');
  if (!body || !title || !stat || !s.atlas) return;
  const mineSheet = computeSheet(s.atlas, s.profile, domains);
  const theirSheet = s.comparison && s.theirs ? computeSheet(s.atlas, s.theirs, domains) : null;
  title.textContent = s.profile.t || 'Unsigned map';
  const badgeHost = $('sheetTitles');
  if (badgeHost) {
    const earned = computeTitles(s.atlas, s.profile, doc.titles);
    badgeHost.innerHTML = earned
      .map((t) => `<span class="sheet__badge">${HEX}${escHtml(t.label)}</span>`)
      .join('');
    badgeHost.hidden = !earned.length;
  }
  const n = mineSheet.basis;
  const groups = buckets(s.atlas, s.profile.n);
  const clusters = [...groups.values()].filter((g) => g.kind === 'cluster').length;
  const crafts = [...groups.values()].some((g) => g.kind === 'craft');
  stat.textContent = n
    ? `${n} ${plural(n, 'node', 'nodes')} in ${clusters} ${plural(clusters, 'cluster', 'clusters')}${crafts ? ' and the crafts underneath' : ''}, joined by ${s.routes.edges.size} ${plural(s.routes.edges.size, 'link', 'links')}.`
    : 'Nothing marked yet. The sheet fills in as the map does.';
  const caption =
    n && n < 4
      ? `Drawn from ${n} ${plural(n, 'mark', 'marks')}. A shape this small is a sketch, not a summary.`
      : `The shape compares your six domains with each other, drawn from ${n} marked ${plural(n, 'node', 'nodes')}. It is not a rating.`;
  const legend = theirSheet
    ? `<span class="sheet__key sheet__key--mine">You</span><span class="sheet__key sheet__key--theirs">${s.theirName ? escHtml(s.theirName) : 'Them'}</span>`
    : `<span class="sheet__key sheet__key--mine">What you practise</span><span class="sheet__key sheet__key--implied">What your hobbies lean on</span>`;
  body.innerHTML = `
    <div class="sheet__hero">
      <div class="sheet__radar-wrap">
        ${radarSvg(mineSheet.axes, theirSheet ? theirSheet.axes : null)}
        <p class="sheet__legend">${legend}</p>
        <p class="panel__lead">${caption}</p>
      </div>
      <ul class="sheet__domains">${domainRows(mineSheet)}</ul>
    </div>
    ${compareStrip(s, mineSheet, theirSheet)}
    ${inventory(s)}
    ${threads(s)}
    ${quests(s)}
    <p class="sheet__prov"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/></svg> aficion.neorgon.com</p>`;
}
