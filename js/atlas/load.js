// ── Corpus loader and index ──────────────────────────────────
// Fetches data/, applies every default contract 1.4 declares, and returns a
// frozen Atlas. Three guarantees everything downstream depends on:
//   1. every optional field is materialised, so nothing below here writes `?.`
//   2. adj covers both directions, so nothing below here scans edges
//   3. a corpus that violates the contract throws; it never half-renders

export const SCHEMA = 1;

// The universal dedication ladder, used when the corpus does not declare one.
// One scale for every node: time and commitment, not skill grades.
const DEFAULT_DEDICATION = [
  { label: 'Low', note: 'It happens when it happens.' },
  { label: 'Medium', note: 'A regular slot most weeks.' },
  { label: 'High', note: 'Most free evenings end up here.' },
  { label: 'Hardcore', note: 'The thing you organise other things around.' },
];

export class AtlasError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'AtlasError';
    this.detail = detail || message;
  }
}

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (err) {
    throw new AtlasError('Corpus unreachable', `${url} could not be fetched: ${err.message}`);
  }
  if (!res.ok) throw new AtlasError('Corpus missing', `${url} returned ${res.status}`);
  try {
    return await res.json();
  } catch (err) {
    throw new AtlasError('Corpus unreadable', `${url} is not valid JSON: ${err.message}`);
  }
}

function need(value, where, field) {
  if (value === undefined || value === null) {
    throw new AtlasError('Corpus incomplete', `${where} is missing the required field "${field}"`);
  }
  return value;
}

/** Materialise one node record to its complete shape. */
function normNode(raw, where, clusterId) {
  const id = need(raw.id, where, 'id');
  return Object.freeze({
    id,
    label: need(raw.label, `${where} ${id}`, 'label'),
    class: need(raw.class, `${where} ${id}`, 'class'),
    tags: Object.freeze(need(raw.tags, `${where} ${id}`, 'tags').slice()),
    blurb: need(raw.blurb, `${where} ${id}`, 'blurb'),
    aka: Object.freeze(raw.aka ? raw.aka.slice() : []),
    accent: raw.accent === undefined ? null : raw.accent,
    inner: raw.inner === true,
    levels: raw.levels ? Object.freeze(raw.levels.map((l) => Object.freeze({ ...l }))) : null,
    cluster: clusterId,
  });
}

function normEdge(raw, where, edgeKinds) {
  const from = need(raw.from, where, 'from');
  const to = need(raw.to, where, 'to');
  const kind = need(raw.kind, `${where} ${from}|${to}`, 'kind');
  const spec = edgeKinds.get(kind);
  if (!spec) throw new AtlasError('Unknown edge kind', `${where}: "${kind}" is not in atlas.json edgeKinds`);
  return Object.freeze({
    key: `${from}|${to}`,
    from,
    to,
    kind,
    directed: spec.directed,
    weight: raw.weight === undefined ? spec.weight : raw.weight,
    note: raw.note === undefined ? null : raw.note,
  });
}

function addAdj(adj, edge) {
  const push = (id, entry) => {
    const list = adj.get(id);
    if (list) list.push(entry);
    else adj.set(id, [entry]);
  };
  if (edge.directed) {
    push(edge.from, { to: edge.to, kind: edge.kind, weight: edge.weight, note: edge.note, dir: 'out' });
    push(edge.to, { to: edge.from, kind: edge.kind, weight: edge.weight, note: edge.note, dir: 'in' });
  } else {
    push(edge.from, { to: edge.to, kind: edge.kind, weight: edge.weight, note: edge.note, dir: 'both' });
    push(edge.to, { to: edge.from, kind: edge.kind, weight: edge.weight, note: edge.note, dir: 'both' });
  }
}

function indexNode(atlas, node) {
  atlas.nodes.set(node.id, node);
  for (const tag of node.tags) {
    const list = atlas.byTag.get(tag);
    if (list) list.push(node.id);
    else atlas.byTag.set(tag, [node.id]);
  }
}

export async function loadAtlas(basePath = 'data/') {
  const manifest = await getJSON(`${basePath}atlas.json`);
  if (manifest.schema !== SCHEMA) {
    throw new AtlasError(
      'Corpus schema mismatch',
      `data/atlas.json declares schema ${manifest.schema}; this build reads schema ${SCHEMA}`,
    );
  }
  const clusterIds = need(manifest.clusters, 'atlas.json', 'clusters');
  const [clusterDocs, edgeDoc] = await Promise.all([
    Promise.all(clusterIds.map((id) => getJSON(`${basePath}clusters/${id}.json`))),
    getJSON(`${basePath}edges.json`),
  ]);

  const edgeKinds = new Map(
    Object.entries(need(manifest.edgeKinds, 'atlas.json', 'edgeKinds')).map(([id, k]) => [
      id,
      Object.freeze({ id, label: k.label, directed: !!k.directed, weight: k.weight }),
    ]),
  );

  const atlas = {
    meta: Object.freeze({
      schema: manifest.schema,
      generated: manifest.generated || '',
      world: Object.freeze({ ...need(manifest.world, 'atlas.json', 'world') }),
    }),
    tags: new Map(Object.entries(need(manifest.tags, 'atlas.json', 'tags'))),
    edgeKinds,
    accents: Object.freeze((manifest.accents || []).slice()),
    classes: Object.freeze((manifest.classes || []).slice()),
    dedication: Object.freeze(
      (Array.isArray(manifest.dedication) && manifest.dedication.length ? manifest.dedication : DEFAULT_DEDICATION).map(
        (d) => Object.freeze({ label: d.label, note: d.note || '' }),
      ),
    ),
    coreLayout: Object.freeze({ ...need(manifest.coreLayout, 'atlas.json', 'coreLayout') }),
    nodes: new Map(),
    topNodes: [],
    clusters: new Map(),
    edges: [],
    adj: new Map(),
    byTag: new Map(),
    byCluster: new Map(),
    builds: [],
    retired: new Set(manifest.retired || []),
    basePath,
  };

  const hub = normNode(need(manifest.hub, 'atlas.json', 'hub'), 'atlas.json hub', null);
  indexNode(atlas, hub);
  atlas.topNodes.push(hub.id);
  atlas.hubId = hub.id;

  for (const raw of need(manifest.core, 'atlas.json', 'core')) {
    const node = normNode(raw, 'atlas.json core', null);
    indexNode(atlas, node);
    atlas.topNodes.push(node.id);
  }
  atlas.coreIds = Object.freeze(atlas.topNodes.slice(1));

  clusterDocs.forEach((doc, i) => {
    const where = `clusters/${clusterIds[i]}.json`;
    const id = need(doc.id, where, 'id');
    const ids = [];
    for (const raw of need(doc.nodes, where, 'nodes')) {
      const node = normNode(raw, where, id);
      indexNode(atlas, node);
      ids.push(node.id);
      atlas.topNodes.push(node.id);
    }
    atlas.byCluster.set(id, ids);
    atlas.clusters.set(
      id,
      Object.freeze({
        id,
        label: need(doc.label, where, 'label'),
        blurb: need(doc.blurb, where, 'blurb'),
        notable: need(doc.notable, where, 'notable'),
        accent: doc.accent === undefined ? null : doc.accent,
        layout: Object.freeze({ ...need(doc.layout, where, 'layout') }),
        nodeIds: Object.freeze(ids.slice()),
      }),
    );
    for (const raw of need(doc.edges, where, 'edges')) atlas.edges.push(normEdge(raw, where, edgeKinds));
  });

  for (const raw of need(edgeDoc.edges, 'edges.json', 'edges')) {
    atlas.edges.push(normEdge(raw, 'edges.json', edgeKinds));
  }

  for (const edge of atlas.edges) {
    for (const end of [edge.from, edge.to]) {
      if (!atlas.nodes.has(end)) {
        throw new AtlasError('Dangling edge', `edge ${edge.key} references "${end}", which no file declares`);
      }
    }
    addAdj(atlas.adj, edge);
  }

  Object.freeze(atlas.topNodes);
  Object.freeze(atlas.edges);
  return Object.freeze(atlas);
}

const innerCache = new WeakMap();

export function hasInner(atlas, nodeId) {
  const node = atlas.nodes.get(nodeId);
  return !!node && node.inner;
}

/** Fetch, index and splice in one inner tree. Memoised per atlas. */
export async function loadInner(atlas, nodeId) {
  let cache = innerCache.get(atlas);
  if (!cache) innerCache.set(atlas, (cache = new Map()));
  const hit = cache.get(nodeId);
  if (hit) return hit;

  const where = `inner/${nodeId}.json`;
  const doc = await getJSON(`${atlas.basePath}${where}`);
  const parent = atlas.nodes.get(need(doc.of, where, 'of'));
  if (!parent) throw new AtlasError('Orphan inner tree', `${where} claims "${doc.of}", which no file declares`);

  const nodes = need(doc.nodes, where, 'nodes').map((raw) => normNode(raw, where, parent.cluster));
  for (const node of nodes) indexNode(atlas, node);
  const edges = need(doc.edges, where, 'edges').map((raw) => normEdge(raw, where, atlas.edgeKinds));
  for (const edge of edges) addAdj(atlas.adj, edge);

  const tree = Object.freeze({
    of: parent.id,
    label: need(doc.label, where, 'label'),
    blurb: doc.blurb || parent.blurb,
    layout: Object.freeze({ ...need(doc.layout, where, 'layout') }),
    nodes: Object.freeze(nodes),
    nodeIds: Object.freeze(nodes.map((n) => n.id)),
    edges: Object.freeze(edges),
  });
  cache.set(nodeId, tree);
  return tree;
}

/**
 * Resolve ids the top layer does not carry.
 *
 * Inner trees are fetched on demand, so a shared profile or a curated build
 * that references one arrives before its tree does. Contract 1.2 rule 2 makes
 * the parent computable from the id (an inner node's id is its parent's id
 * plus exactly one segment), so the demand is precisely this: load that
 * parent's tree once and the id resolves. Without it a shared map silently
 * loses every inner selection and reports it as an id the corpus never had.
 *
 * A tree that genuinely fails to load is left unresolved on purpose. reconcile
 * then reports the id in its `unknown` bucket, which is the channel contract
 * 2.6 rule 3 already built for saying so out loud.
 */
export async function ensureNodes(atlas, ids) {
  const parents = new Set();
  for (const id of ids) {
    if (atlas.nodes.has(id)) continue;
    const parent = id.split('.').slice(0, -1).join('.');
    if (parent && hasInner(atlas, parent)) parents.add(parent);
  }
  if (!parents.size) return;
  await Promise.allSettled([...parents].map((p) => loadInner(atlas, p)));
}

/** Curated builds, fetched lazily. Pushes into atlas.builds, which starts empty. */
export async function loadBuilds(atlas) {
  if (atlas.builds.length) return atlas.builds;
  const doc = await getJSON(`${atlas.basePath}builds.json`);
  for (const raw of need(doc.builds, 'builds.json', 'builds')) {
    atlas.builds.push(
      Object.freeze({
        id: need(raw.id, 'builds.json', 'id'),
        name: need(raw.name, 'builds.json', 'name'),
        summary: need(raw.summary, 'builds.json', 'summary'),
        tags: Object.freeze((raw.tags || []).slice()),
        steps: Object.freeze(
          need(raw.steps, `builds.json ${raw.id}`, 'steps').map((s) =>
            Object.freeze({ node: s.node, level: s.level === undefined ? null : s.level, why: s.why }),
          ),
        ),
      }),
    );
  }
  return atlas.builds;
}
