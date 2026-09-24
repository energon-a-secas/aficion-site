// Navigation follows authored edges, never simply the next dot on the screen.
export const DIRECTIONS = [
  { id: 'right', dx: 1, dy: 0, angle: 0 },
  { id: 'down', dx: 0, dy: 1, angle: 90 },
  { id: 'left', dx: -1, dy: 0, angle: 180 },
  { id: 'up', dx: 0, dy: -1, angle: 270 },
];

export function connectedNodes(atlas, layout, fromId, { includeHub = false } = {}) {
  const origin = layout.pos.get(fromId);
  if (!origin) return [];
  const seen = new Set();
  return (atlas.adj.get(fromId) || []).flatMap((edge) => {
    const node = atlas.nodes.get(edge.to);
    const point = layout.pos.get(edge.to);
    if (!node || !point || seen.has(node.id) || (!includeHub && node.class === 'hub') || node.id === fromId) return [];
    seen.add(node.id);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const angle = Math.atan2(dy, dx);
    const sector = (Math.round(angle / (Math.PI / 2)) + 4) % 4;
    return [{ ...edge, node, angle, sector, distance: Math.hypot(dx, dy) }];
  });
}

/** Keyboard shortcut: one destination per arrow key. The visual ports expose all. */
export function compassTargets(atlas, layout, fromId) {
  const links = connectedNodes(atlas, layout, fromId);
  return DIRECTIONS.flatMap((direction, sector) => {
    const options = links.filter((link) => link.sector === sector).sort((a, b) => a.distance - b.distance || a.to.localeCompare(b.to));
    return options.length ? [{ ...direction, link: options[0], count: options.length }] : [];
  });
}

export function relationshipGroup(atlas, from, link) {
  if (link.node.class === 'core') return 'craft';
  return link.node.cluster && link.node.cluster === atlas.nodes.get(from)?.cluster ? 'local' : 'bridge';
}

/** Exact bearings, two small rings, and counted ports instead of lost edges.
 * A port keeps its bearing when another edge joins it, so packing is stable. */
export function radialTargets(atlas, layout, fromId) {
  const order = { local: 0, craft: 1, bridge: 2 };
  const links = connectedNodes(atlas, layout, fromId).sort((a, b) =>
    order[relationshipGroup(atlas, fromId, a)] - order[relationshipGroup(atlas, fromId, b)] || a.angle - b.angle || a.to.localeCompare(b.to));
  const ports = [];
  const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (const link of links) {
    const point = [56, 102].map((radius) => ({ x: Math.cos(link.angle) * radius, y: Math.sin(link.angle) * radius, radius }))
      .find((p) => ports.every((port) => Math.hypot(p.x - port.x, p.y - port.y) >= 42));
    if (point && ports.length < 12) ports.push({ ...point, angle: link.angle, links: [link], group: relationshipGroup(atlas, fromId, link) });
    else {
      const nearest = ports.reduce((best, port) => angleGap(port.angle, link.angle) < angleGap(best.angle, link.angle) ? port : best);
      nearest.links.push(link);
    }
  }
  return ports;
}

export function extendTrail(path, from, to) {
  const current = path.at(-1) === from ? path : [from];
  const previous = current.indexOf(to);
  return previous >= 0 ? current.slice(0, previous + 1) : [...current, to].slice(-12);
}

export function connectionLabel(edge, spanish = false) {
  if (edge.kind === 'draws-on') return edge.dir === 'in' ? (spanish ? 'Usa esta habilidad' : 'Uses this skill') : (spanish ? 'Habilidad compartida' : 'Shared skill');
  if (edge.kind === 'shares-gear') return spanish ? 'Equipo compartido' : 'Shared equipment';
  if (edge.kind === 'leads-to') return edge.dir === 'in' ? (spanish ? 'Un camino hasta aquí' : 'A way into this') : (spanish ? 'Otra dirección' : 'A next step');
  return spanish ? 'Interés relacionado' : 'Related pursuit';
}
