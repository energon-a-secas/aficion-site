import { withAlpha } from './theme.js';
import { relationshipGroup } from './traversal.js';

/** Straight paths keep each arrow exactly on its destination's bearing. */
function segment(env, from, to, color, alpha, progress = 1, head = false) {
  const a = env.layout.pos.get(from);
  const b = env.layout.pos.get(to);
  if (!a || !b) return;
  const { ctx, px } = env;
  const t = progress;
  const end = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  for (const [width, opacity] of [[8, .08 * alpha], [2, alpha]]) {
    ctx.strokeStyle = withAlpha(color, opacity);
    ctx.lineWidth = width * px;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  if (head) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 3.5 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, .3);
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 8 * px, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Finite interaction animation; an idle atlas never runs a perpetual loop. */
export function drawNavigation(env) {
  const { view, theme } = env;
  const nav = view.navigation;
  if (!nav) return false;
  const motion = nav.motion;
  const elapsed = motion ? performance.now() - motion.start : 0;
  const t = motion?.duration ? Math.min(1, elapsed / motion.duration) : 1;
  const isTravellingEdge = (from, to) => t < 1 && ((from === motion.from && to === motion.to) || (from === motion.to && to === motion.from));
  if (!view.tracePath.length) {
    for (const link of nav.links) {
      const step = nav.journey?.path.indexOf(nav.anchor) ?? -1;
      if (step >= 0 && (nav.journey.path[step - 1] === link.to || nav.journey.path[step + 1] === link.to)) continue;
      const group = relationshipGroup(env.atlas, nav.anchor, link);
      const color = group === 'bridge' ? theme.accents.violet : group === 'craft' ? theme.accents.cyan : theme.nodeCore;
      segment(env, nav.anchor, link.to, color, isTravellingEdge(nav.anchor, link.to) ? .08 : nav.preview?.to === link.to ? .65 : nav.journey ? .1 : .28);
    }
  }
  if (nav.journey) {
    env.ctx.save();
    env.ctx.setLineDash([5 * env.px, 7 * env.px]);
    for (let i = nav.journey.step + 1; i < nav.journey.path.length; i++) segment(env, nav.journey.path[i - 1], nav.journey.path[i], theme.route, .5);
    env.ctx.restore();
  }
  for (let i = 1; i < nav.path.length; i++) segment(env, nav.path[i - 1], nav.path[i], theme.route, isTravellingEdge(nav.path[i - 1], nav.path[i]) ? .08 : .95);
  if (nav.preview) segment(env, nav.preview.from, nav.preview.to, theme.focus, .95, 1, true);
  if (!motion) return false;
  if (t >= 1) return false;
  segment(env, motion.from, motion.to, theme.route, 1, 1 - (1 - t) ** 2, true);
  return true;
}
