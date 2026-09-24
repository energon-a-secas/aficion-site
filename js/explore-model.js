// Pure queries shared by browsing, search and the connection lenses.
export const normalise = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchHobbies(records, query, { cluster = null, filter = 'all', saved = null } = {}) {
  const words = normalise(query).trim().split(/\s+/).filter(Boolean);
  return records.filter((node) => {
    if (node.class === 'hub' || (cluster && node.cluster !== cluster)) return false;
    if (saved && !saved.has(node.id)) return false;
    if (filter === 'easy' && !node.tags.includes('cheap-start')) return false;
    if (filter === 'deep' && !node.inner) return false;
    const hay = normalise([node.label, ...(node.aka || []), node.blurb, ...(node.tags || [])].join(' '));
    return words.every((word) => hay.includes(word));
  }).sort((a, b) => {
    if (words.length) {
      const starts = (n) => normalise(n.label).startsWith(words.join(' ')) ? 0 : 1;
      return starts(a) - starts(b) || a.label.localeCompare(b.label);
    }
    return a.label.localeCompare(b.label);
  });
}

export function parentId(id) {
  const parts = id.split('.');
  return parts.length > 2 ? parts.slice(0, -1).join('.') : null;
}

/** Actual graph edges and two explicit, explained two-hop/tag inferences. */
export function connections(atlas, id, lens = 'related') {
  const node = atlas.nodes.get(id);
  if (!node) return [];
  const links = (atlas.adj.get(id) || []).filter((link) => link.to !== atlas.hubId);
  const results = new Map();
  const add = (target, reason, path, inferred = false) => {
    const next = atlas.nodes.get(target);
    if (!next || target === id || next.class === 'hub' || results.has(target)) return;
    results.set(target, { node: next, reason, path, inferred });
  };
  if (lens === 'interests') {
    for (const target of atlas.topNodes) {
      const next = atlas.nodes.get(target);
      const tags = next.tags.filter((tag) => node.tags.includes(tag));
      if (tags.length >= 2) add(target, tags.map((tag) => atlas.tags.get(tag)).join(' · '), [], true);
    }
  } else if (lens === 'skills') {
    for (const link of links.filter((link) => link.kind === 'draws-on')) {
      const craft = atlas.nodes.get(link.to);
      add(link.to, link.note || craft.blurb, [id, link.to]);
      if (craft.class !== 'core') continue;
      for (const other of atlas.adj.get(link.to) || []) {
        if (other.kind !== 'draws-on' || other.dir !== 'in') continue;
        add(other.to, craft.label, [id, craft.id, other.to], true);
      }
    }
  } else {
    for (const link of links) {
      if (lens === 'gear' ? link.kind !== 'shares-gear' : !['kin', 'leads-to'].includes(link.kind)) continue;
      add(link.to, link.note || atlas.nodes.get(link.to)?.blurb || '', [id, link.to]);
    }
  }
  return [...results.values()].sort((a, b) => {
    // Keep direct skills first, then surface connections beyond the current family.
    const rank = (r) => (r.node.class === 'core' ? -2 : 0) + (r.node.cluster !== node.cluster ? -1 : 0);
    return rank(a) - rank(b) || a.node.label.localeCompare(b.node.label);
  });
}
