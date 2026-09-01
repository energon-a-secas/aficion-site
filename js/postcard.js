// ── Postcard export ──────────────────────────────────────────
// A 1200x630 PNG of the visitor's own constellation, drawn fresh on an
// offscreen canvas from the same layout and theme the live map uses. Made in
// the browser, saved from the browser: no request leaves the page, matching
// the share link's promise.

import { resolveTheme, withAlpha } from './atlas/theme.js';
import { NODE_RADIUS } from './atlas/pick.js';
import { plural } from './utils.js';
import { buckets } from './alloc.js';

const W = 1200;
const H = 630;
const MAP_BOX = { x: 440, y: 70, w: 700, h: 480 };

function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = text.split(/\s+/);
  let line = '';
  let drawn = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lineH;
      drawn += 1;
      line = word;
      if (drawn >= maxLines - 1) break;
    } else {
      line = next;
    }
  }
  ctx.fillText(line, x, y);
  return y + lineH;
}

export async function downloadPostcard(s) {
  const ids = s.profile.n.filter((id) => s.layout.pos.has(id));
  if (!ids.length) return false;
  const theme = resolveTheme();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = theme.void;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.65, H * 0.45, 40, W * 0.65, H * 0.45, 560);
  glow.addColorStop(0, withAlpha(theme.hub, 0.1));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Fit the marked constellation into the card's right side.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const p = s.layout.pos.get(id);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const k = Math.min(MAP_BOX.w / Math.max(1, maxX - minX), MAP_BOX.h / Math.max(1, maxY - minY));
  const ox = MAP_BOX.x + (MAP_BOX.w - (maxX - minX) * k) / 2 - minX * k;
  const oy = MAP_BOX.y + (MAP_BOX.h - (maxY - minY) * k) / 2 - minY * k;
  const at = (id) => {
    const p = s.layout.pos.get(id);
    return { x: p.x * k + ox, y: p.y * k + oy };
  };

  const mine = new Set(ids);
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(theme.route, 0.65);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const edge of s.atlas.edges) {
    if (!mine.has(edge.from) || !mine.has(edge.to)) continue;
    const a = at(edge.from);
    const b = at(edge.to);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = withAlpha(theme.routeBright, 0.8);
  ctx.beginPath();
  for (const pair of s.profile.e || []) {
    if (!s.layout.pos.has(pair[0]) || !s.layout.pos.has(pair[1])) continue;
    const a = at(pair[0]);
    const b = at(pair[1]);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const id of ids) {
    const node = s.atlas.nodes.get(id);
    const p = at(id);
    const r = (NODE_RADIUS[node.class] || NODE_RADIUS.node) * 0.5 + 2.5;
    ctx.fillStyle = theme.route;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.routeBright;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const groups = buckets(s.atlas, ids);
  const clusters = [...groups.values()].filter((g) => g.kind === 'cluster').length;
  const links = s.routes.edges.size + (s.profile.e || []).length;

  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.route;
  ctx.font = `600 15px ${theme.font}`;
  ctx.fillText('AFICION · ATLAS OF HOBBIES', 60, 88);
  ctx.fillStyle = theme.label;
  ctx.font = `700 42px ${theme.font}`;
  const after = wrapText(ctx, s.profile.t || 'My hobby atlas', 60, 126, 330, 50, 3);
  ctx.fillStyle = withAlpha(theme.label, 0.75);
  ctx.font = `400 19px ${theme.font}`;
  ctx.fillText(`${ids.length} ${plural(ids.length, 'hobby', 'hobbies')} in ${clusters} ${plural(clusters, 'family', 'families')}`, 60, after + 16);
  ctx.fillText(`${links} ${plural(links, 'link', 'links')} of gold`, 60, after + 46);
  ctx.fillStyle = theme.routeBright;
  ctx.font = `600 17px ${theme.font}`;
  ctx.fillText('aficion.neorgon.com', 60, H - 76);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aficion-postcard.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
