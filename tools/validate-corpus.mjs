#!/usr/bin/env node
/**
 * Aficion corpus validator.
 *
 * Implements every check in docs/delivery/CONTRACTS.md contract 1.12, numbered
 * 1 to 33 in the messages it prints. Checks 1 to 30 fail the run; 31 to 33 are
 * reported as warnings and do not.
 *
 * Zero npm dependencies. Plain node, reads the corpus from disk.
 *
 *   node tools/validate-corpus.mjs        # from inside projects/aficion-site
 *   make validate
 *
 * Three places where contract 1's normative text and its own worked examples
 * disagree. All three are recorded in data/README.md and were reported to
 * delivery-lead. One principle resolves them: the normative rule wins, and the
 * corpus is authored to satisfy it. The single exception is where no content
 * can satisfy the normative rule, in which case the example proves the intent.
 *
 * 1. Check 9 ("class === 'core' if and only if the id's first segment is
 *    'core'") is applied to TOP-LAYER nodes only. Contract 1.3's own atlas
 *    example gives core.painting "inner": true, and contract 1.9 requires every
 *    inner node to be class "node" or "notable", never "core". An inner node of
 *    a core skill therefore has first segment "core" and class "node" by
 *    construction, and no value satisfies both clauses. Inner nodes are checked
 *    against 1.9's class rule instead. Rule 8 already pins their id shape.
 *
 * 2. Check 24's radius band (60 to 600) is applied to every layout block,
 *    coreLayout included. Contract 1.3's example coreLayout carries radius
 *    1500, which that check rejects, so the corpus ships a compliant value
 *    rather than the validator shipping an exemption.
 *
 * 3. Contract 1.10 rule 1, "steps span at least two distinct clusters", counts
 *    only real clusters. A core skill has no cluster (DESIGN.md 5, Q1:
 *    cluster null is legal only for class core), so the illustrative
 *    build.pixel-saber in 1.10, whose only cluster is starwars, does not
 *    satisfy it. Every build shipped here crosses two hobby clusters for real.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'data');

const ID_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
const BUILD_ID_RE = /^build\.[a-z0-9][a-z0-9-]*$/;
const RECIPES = ['ring', 'spiral', 'fan', 'arc', 'orbit'];
const RESERVED_SEGMENTS = ['core', 'hub', 'build'];
const BANNED_WORDS = ['powerful', 'seamless', 'leverages', 'robust', 'utilize'];
// Written as an escape, not as the character. Root `make smoke` check 12
// (scripts/no-em-dash.py) scans string literals in .mjs and would otherwise fail
// on the constant this file needs in order to enforce contract rule 28.
const EM_DASH = '\u2014';
const MIN_ANCHOR_GAP = 240;

const errors = [];
const warnings = [];

const fail = (check, file, where, msg) =>
  errors.push(`[${String(check).padStart(2, ' ')}] ${file} :: ${where} :: ${msg}`);
const warnAt = (check, file, where, msg) =>
  warnings.push(`[${String(check).padStart(2, ' ')}] ${file} :: ${where} :: ${msg}`);

/* ------------------------------------------------------------------ files */

async function readJSON(relPath) {
  let raw;
  try {
    raw = await readFile(join(DATA, relPath), 'utf8');
  } catch (e) {
    fail(1, `data/${relPath}`, 'file', `cannot be read (${e.code || e.message})`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(1, `data/${relPath}`, 'file', `does not parse as JSON (${e.message})`);
    return null;
  }
}

async function listJSON(relDir) {
  try {
    const names = await readdir(join(DATA, relDir));
    return names.filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------- text rules */

/** Checks 27, 28, 29 for one string. `banned` gates the word list (29). */
function checkText(file, where, value, maxLen, { banned = false, minLen = 1 } = {}) {
  if (typeof value !== 'string') {
    fail(27, file, where, `must be a string, got ${typeof value}`);
    return;
  }
  if (value.length < minLen) fail(27, file, where, `is shorter than ${minLen} characters`);
  if (value.length > maxLen) fail(27, file, where, `is ${value.length} characters, max ${maxLen}`);
  if (value !== value.trim()) fail(27, file, where, 'has leading or trailing whitespace');
  if (value.includes('  ')) fail(27, file, where, 'contains a double space');
  if (value.includes(EM_DASH)) fail(28, file, where, 'contains an em dash');
  if (banned) {
    const low = value.toLowerCase();
    for (const w of BANNED_WORDS) {
      if (new RegExp(`\\b${w}`, 'i').test(low)) fail(29, file, where, `uses the banned word "${w}"`);
    }
  }
}

/** Check 28 over every string in a document, including keys nothing else reads. */
function scanForEmDash(file, value, path = '$') {
  if (typeof value === 'string') {
    if (value.includes(EM_DASH)) fail(28, file, path, 'contains an em dash');
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanForEmDash(file, v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scanForEmDash(file, v, `${path}.${k}`);
  }
}

/* ----------------------------------------------------------------- layout */

function checkLayout(file, where, layout, world, { inner = false } = {}) {
  if (!layout || typeof layout !== 'object') {
    fail(24, file, where, 'layout block is missing');
    return;
  }
  if (!RECIPES.includes(layout.recipe)) {
    fail(24, file, `${where}.recipe`, `"${layout.recipe}" is not one of ${RECIPES.join(', ')}`);
  }
  const a = layout.anchor;
  if (!Array.isArray(a) || a.length !== 2 || a.some((n) => typeof n !== 'number')) {
    fail(24, file, `${where}.anchor`, 'must be [x, y] numbers');
  } else if (inner) {
    if (a[0] !== 0 || a[1] !== 0) {
      fail(24, file, `${where}.anchor`, `an inner tree anchor must be [0, 0], got [${a}]`);
    }
  } else if (world) {
    if (a[0] < world.minX || a[0] > world.maxX || a[1] < world.minY || a[1] > world.maxY) {
      fail(24, file, `${where}.anchor`, `[${a}] is outside atlas.json world`);
    }
  }
  if (typeof layout.radius !== 'number' || layout.radius < 60 || layout.radius > 600) {
    fail(24, file, `${where}.radius`, `must be a number from 60 to 600, got ${layout.radius}`);
  }
  if (layout.startAngle !== undefined && typeof layout.startAngle !== 'number') {
    fail(24, file, `${where}.startAngle`, 'must be a number when present');
  }
  if (layout.spread !== undefined && typeof layout.spread !== 'number') {
    fail(24, file, `${where}.spread`, 'must be a number when present');
  }
}

/** Check 25. */
function checkOrder(file, where, order, nodeIds) {
  if (order === undefined) return;
  if (!Array.isArray(order)) {
    fail(25, file, where, 'must be an array of node ids when present');
    return;
  }
  const seen = new Set();
  for (const id of order) {
    if (!nodeIds.has(id)) fail(25, file, where, `"${id}" is not a node in this file`);
    if (seen.has(id)) fail(25, file, where, `"${id}" appears twice`);
    seen.add(id);
  }
  for (const id of nodeIds) {
    if (!seen.has(id)) fail(25, file, where, `"${id}" is missing from the order`);
  }
}

/* ------------------------------------------------------------------ nodes */

/**
 * Validates one node record (contract 1.4) and registers it.
 * `layer` is 'hub' | 'core' | 'cluster' | 'inner'.
 */
function checkNode(file, node, ctx, reg) {
  const where = `node ${node && node.id ? node.id : '(no id)'}`;
  if (!node || typeof node !== 'object') {
    fail(5, file, 'node', 'is not an object');
    return;
  }

  // 5, 6: id grammar and global uniqueness
  if (typeof node.id !== 'string' || !ID_RE.test(node.id)) {
    fail(5, file, where, `id "${node.id}" does not match the contract 1.2 grammar`);
    return;
  }
  if (reg.nodes.has(node.id)) {
    fail(6, file, where, `id is already declared in ${reg.nodes.get(node.id).file}`);
    return;
  }

  const segments = node.id.split('.');
  const first = segments[0];

  // 7, 8, 9, 10: namespace rules
  if (ctx.layer === 'cluster') {
    if (first !== ctx.clusterId) {
      fail(7, file, where, `first segment "${first}" is not this file's cluster id "${ctx.clusterId}"`);
    }
    if (segments.length !== 2) {
      fail(7, file, where, 'a top-layer clustered id has exactly two segments');
    }
  }
  if (ctx.layer === 'inner') {
    const parent = ctx.parentId;
    if (!node.id.startsWith(parent + '.') || segments.length !== parent.split('.').length + 1) {
      fail(8, file, where, `must be "${parent}" plus exactly one segment`);
    }
    // 1.9: an inner node is never core or hub. See the header note on check 9.
    if (node.class === 'core' || node.class === 'hub') {
      fail(9, file, where, `an inner node may not carry class "${node.class}" (contract 1.9)`);
    }
  }
  if (ctx.layer === 'core' || ctx.layer === 'cluster' || ctx.layer === 'hub') {
    const isCoreClass = node.class === 'core';
    const isCoreId = first === 'core';
    if (isCoreClass !== isCoreId) {
      fail(9, file, where, `class "${node.class}" and first segment "${first}" disagree on core`);
    }
    const isHubClass = node.class === 'hub';
    const isHubId = node.id === 'hub';
    if (isHubClass !== isHubId) {
      fail(10, file, where, `class "${node.class}" and id "${node.id}" disagree on hub`);
    }
  }

  // 11: no live id in retired
  if (reg.retired.has(node.id)) {
    fail(11, file, where, 'is listed in atlas.json retired and must never be reused');
  }

  // 12: class vocabulary
  if (!reg.classes.includes(node.class)) {
    fail(12, file, where, `class "${node.class}" is not in atlas.json classes`);
  }

  // 13: tag vocabulary
  if (!Array.isArray(node.tags)) {
    fail(13, file, where, 'tags must be an array (it may be empty)');
  } else {
    if (node.tags.length > 8) fail(13, file, where, `has ${node.tags.length} tags, max 8`);
    for (const t of node.tags) {
      if (!reg.tagIds.has(t)) fail(13, file, `${where}.tags`, `"${t}" is not a key of atlas.json tags`);
      else reg.usedTags.add(t);
    }
  }

  // 14: accent vocabulary
  if (node.accent !== undefined && node.accent !== null) {
    if (!reg.accents.includes(node.accent)) {
      fail(14, file, where, `accent "${node.accent}" is not in atlas.json accents`);
    }
  }

  // 27, 28, 29: content quality
  checkText(file, `${where}.label`, node.label, 40);
  checkText(file, `${where}.blurb`, node.blurb, 220, { banned: true });
  if (node.aka !== undefined) {
    if (!Array.isArray(node.aka)) fail(27, file, `${where}.aka`, 'must be an array when present');
    else node.aka.forEach((a, i) => checkText(file, `${where}.aka[${i}]`, a, 60));
  }

  // 1.5: levels
  if (node.levels !== undefined && node.levels !== null) {
    if (!Array.isArray(node.levels) || node.levels.length < 2 || node.levels.length > 6) {
      fail(27, file, `${where}.levels`, 'must have 2 to 6 entries');
    } else {
      node.levels.forEach((lv, i) => {
        checkText(file, `${where}.levels[${i}].label`, lv.label, 12);
        checkText(file, `${where}.levels[${i}].note`, lv.note, 120, { banned: true });
      });
    }
  }

  // 1.4: inner flag
  if (node.inner !== undefined && typeof node.inner !== 'boolean') {
    fail(27, file, `${where}.inner`, 'must be a boolean when present');
  }
  if (node.inner === true && ctx.layer === 'inner') {
    fail(4, file, where, 'an inner node may not carry inner: true; the tree is one level deep');
  }

  reg.nodes.set(node.id, {
    id: node.id,
    node,
    file,
    layer: ctx.layer,
    clusterId: ctx.layer === 'cluster' ? ctx.clusterId : null
  });
  if (node.inner === true) reg.wantsInner.set(node.id, file);
}

/* ------------------------------------------------------------------ edges */

function checkEdges(file, edges, reg, scope) {
  if (!Array.isArray(edges)) {
    fail(17, file, 'edges', 'must be an array (it may be empty)');
    return;
  }
  edges.forEach((e, i) => {
    const where = `edges[${i}] ${e && e.from}|${e && e.to}`;
    if (!e || typeof e !== 'object') {
      fail(17, file, `edges[${i}]`, 'is not an object');
      return;
    }
    const from = reg.nodes.get(e.from);
    const to = reg.nodes.get(e.to);
    // 17
    if (!from) fail(17, file, where, `from "${e.from}" is not a node in the corpus`);
    if (!to) fail(17, file, where, `to "${e.to}" is not a node in the corpus`);
    // 18
    if (e.from === e.to) fail(18, file, where, 'is a self loop');
    // 15
    const kind = reg.edgeKinds[e.kind];
    if (!kind) {
      fail(15, file, where, `kind "${e.kind}" is not a key of atlas.json edgeKinds`);
    }
    // 1.8: weight and note
    if (e.weight !== undefined) {
      if (typeof e.weight !== 'number' || e.weight < 0.25 || e.weight > 8) {
        fail(17, file, `${where}.weight`, `must be a number from 0.25 to 8, got ${e.weight}`);
      }
    }
    if (e.note !== undefined && e.note !== null) checkText(file, `${where}.note`, e.note, 140, { banned: true });

    // 18: duplicates, and reversed duplicates on an undirected kind
    const exact = `${e.from}|${e.to}`;
    if (reg.edgeKeys.has(exact)) {
      fail(18, file, where, `duplicates the pair already written in ${reg.edgeKeys.get(exact)}`);
    } else {
      reg.edgeKeys.set(exact, file);
    }
    if (kind && kind.directed === false) {
      const sorted = [e.from, e.to].sort().join('|');
      if (reg.undirectedPairs.has(sorted)) {
        fail(18, file, where, `reverses an undirected pair already written in ${reg.undirectedPairs.get(sorted)}`);
      } else {
        reg.undirectedPairs.set(sorted, file);
      }
    }

    // 19: draws-on
    if (e.kind === 'draws-on') {
      if (to && to.node.class !== 'core') {
        fail(19, file, where, `draws-on must point at a class "core" node, "${e.to}" is "${to.node.class}"`);
      }
      if (from && from.node.class === 'core') {
        fail(19, file, where, 'draws-on may not start at a core node');
      }
    }

    // 20: scope
    if (from && to) scope(where, from, to);

    if (from && to) {
      reg.edges.push({ from: e.from, to: e.to, kind: e.kind, file, directed: kind ? kind.directed : true });
    }
  });
}

/* ------------------------------------------------------------------- main */

async function main() {
  const reg = {
    nodes: new Map(),
    edges: [],
    edgeKeys: new Map(),
    undirectedPairs: new Map(),
    retired: new Set(),
    classes: [],
    accents: [],
    tagIds: new Set(),
    usedTags: new Set(),
    edgeKinds: {},
    wantsInner: new Map(),
    clusters: new Map(),
    innerFiles: new Map()
  };

  /* ---- atlas.json --------------------------------------------------- */
  const atlas = await readJSON('atlas.json');
  if (!atlas) return finish(reg);
  scanForEmDash('data/atlas.json', atlas);

  // 2
  if (atlas.schema !== 1) fail(2, 'data/atlas.json', 'schema', `must be 1, got ${atlas.schema}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(atlas.generated || '')) {
    fail(27, 'data/atlas.json', 'generated', 'must be a YYYY-MM-DD string');
  }
  const world = atlas.world;
  for (const k of ['minX', 'minY', 'maxX', 'maxY']) {
    if (!world || typeof world[k] !== 'number') fail(27, 'data/atlas.json', `world.${k}`, 'must be a number');
  }
  reg.classes = Array.isArray(atlas.classes) ? atlas.classes : [];
  reg.accents = Array.isArray(atlas.accents) ? atlas.accents : [];
  reg.edgeKinds = atlas.edgeKinds || {};
  for (const [id, k] of Object.entries(reg.edgeKinds)) {
    if (typeof k.label !== 'string' || typeof k.directed !== 'boolean' || typeof k.weight !== 'number') {
      fail(27, 'data/atlas.json', `edgeKinds.${id}`, 'needs label (string), directed (boolean), weight (number)');
    }
  }
  for (const [id, label] of Object.entries(atlas.tags || {})) {
    reg.tagIds.add(id);
    checkText('data/atlas.json', `tags.${id}`, label, 24);
  }
  for (const id of atlas.retired || []) reg.retired.add(id);

  checkLayout('data/atlas.json', 'coreLayout', atlas.coreLayout, world);

  // hub and core node records
  checkNode('data/atlas.json', atlas.hub, { layer: 'hub' }, reg);
  if (!Array.isArray(atlas.core)) {
    fail(27, 'data/atlas.json', 'core', 'must be an array of node records');
  } else {
    for (const n of atlas.core) checkNode('data/atlas.json', n, { layer: 'core' }, reg);
  }
  // 10: exactly one hub
  const hubs = [...reg.nodes.values()].filter((r) => r.node.class === 'hub');
  if (hubs.length !== 1) fail(10, 'data/atlas.json', 'hub', `there must be exactly one hub node, found ${hubs.length}`);

  /* ---- clusters ----------------------------------------------------- */
  const declared = Array.isArray(atlas.clusters) ? atlas.clusters : [];
  const onDisk = (await listJSON('clusters')).map((n) => basename(n, '.json'));
  // 3, both directions
  for (const id of declared) {
    if (!onDisk.includes(id)) fail(3, 'data/atlas.json', `clusters["${id}"]`, 'has no file under data/clusters/');
    if (RESERVED_SEGMENTS.includes(id)) {
      fail(7, 'data/atlas.json', `clusters["${id}"]`, `"${id}" is a reserved first segment`);
    }
  }
  for (const id of onDisk) {
    if (!declared.includes(id)) fail(3, `data/clusters/${id}.json`, 'file', 'is not listed in atlas.json clusters');
  }

  for (const id of declared) {
    if (!onDisk.includes(id)) continue;
    const file = `data/clusters/${id}.json`;
    const doc = await readJSON(`clusters/${id}.json`);
    if (!doc) continue;
    scanForEmDash(file, doc);
    if (doc.id !== id) fail(7, file, 'id', `is "${doc.id}" but the file is named "${id}.json"`);
    checkText(file, 'label', doc.label, 32);
    checkText(file, 'blurb', doc.blurb, 220, { banned: true });
    if (!Array.isArray(doc.nodes) || doc.nodes.length < 3 || doc.nodes.length > 40) {
      fail(27, file, 'nodes', `must hold 3 to 40 records, found ${Array.isArray(doc.nodes) ? doc.nodes.length : 'none'}`);
    }
    for (const n of doc.nodes || []) checkNode(file, n, { layer: 'cluster', clusterId: id }, reg);

    const nodeIds = new Set((doc.nodes || []).map((n) => n.id));
    checkLayout(file, 'layout', doc.layout, world);
    checkOrder(file, 'layout.order', doc.layout && doc.layout.order, nodeIds);

    // 30: accent cap
    const accented = (doc.nodes || []).filter((n) => n.accent).length;
    const cap = Math.max(1, Math.round(0.12 * (doc.nodes || []).length));
    if (accented > cap) {
      fail(30, file, 'nodes', `${accented} accented nodes exceeds the cap of ${cap} for ${(doc.nodes || []).length} nodes`);
    }

    reg.clusters.set(id, { id, doc, file, nodeIds });
  }

  // 21 (first half): notable must be a node in this file with class notable
  for (const { id, doc, file, nodeIds } of reg.clusters.values()) {
    if (!nodeIds.has(doc.notable)) {
      fail(21, file, 'notable', `"${doc.notable}" is not a node in this file`);
    } else {
      const rec = reg.nodes.get(doc.notable);
      if (rec && rec.node.class !== 'notable') {
        fail(21, file, 'notable', `"${doc.notable}" has class "${rec.node.class}", must be "notable"`);
      }
    }
    void id;
  }

  // 26: cluster anchors at least MIN_ANCHOR_GAP apart
  const anchored = [...reg.clusters.values()].filter((c) => c.doc.layout && Array.isArray(c.doc.layout.anchor));
  for (let i = 0; i < anchored.length; i++) {
    for (let j = i + 1; j < anchored.length; j++) {
      const a = anchored[i].doc.layout.anchor;
      const b = anchored[j].doc.layout.anchor;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < MIN_ANCHOR_GAP) {
        fail(26, anchored[i].file, 'layout.anchor',
          `is ${d.toFixed(0)} units from ${anchored[j].id}, minimum is ${MIN_ANCHOR_GAP}`);
      }
    }
  }

  /* ---- inner trees --------------------------------------------------- */
  const innerOnDisk = (await listJSON('inner')).map((n) => basename(n, '.json'));
  // 4, both directions
  for (const [nodeId, declaredIn] of reg.wantsInner) {
    if (!innerOnDisk.includes(nodeId)) {
      fail(4, declaredIn, `node ${nodeId}`, 'carries inner: true but data/inner/' + nodeId + '.json is missing');
    }
  }
  for (const nodeId of innerOnDisk) {
    if (!reg.wantsInner.has(nodeId)) {
      fail(4, `data/inner/${nodeId}.json`, 'file', 'has no node claiming it with inner: true');
    }
  }

  for (const nodeId of innerOnDisk) {
    const file = `data/inner/${nodeId}.json`;
    const doc = await readJSON(`inner/${nodeId}.json`);
    if (!doc) continue;
    scanForEmDash(file, doc);
    if (doc.of !== nodeId) fail(4, file, 'of', `is "${doc.of}" but the file is named "${nodeId}.json"`);
    const parent = reg.nodes.get(nodeId);
    if (!parent) fail(4, file, 'of', `"${nodeId}" is not a node in the corpus`);
    checkText(file, 'label', doc.label, 40);
    if (doc.blurb !== undefined) checkText(file, 'blurb', doc.blurb, 220, { banned: true });
    if (!Array.isArray(doc.nodes) || doc.nodes.length < 2 || doc.nodes.length > 24) {
      fail(27, file, 'nodes', `must hold 2 to 24 records, found ${Array.isArray(doc.nodes) ? doc.nodes.length : 'none'}`);
    }
    for (const n of doc.nodes || []) {
      checkNode(file, n, { layer: 'inner', parentId: nodeId }, reg);
      if (n && n.class !== 'node' && n.class !== 'notable') {
        fail(12, file, `node ${n && n.id}`, `class must be "node" or "notable" inside an inner tree, got "${n && n.class}"`);
      }
    }
    checkLayout(file, 'layout', doc.layout, world, { inner: true });
    checkOrder(file, 'layout.order', doc.layout && doc.layout.order, new Set((doc.nodes || []).map((n) => n.id)));
    reg.innerFiles.set(nodeId, { file, doc, nodeIds: new Set((doc.nodes || []).map((n) => n.id)) });
  }

  /* ---- edges --------------------------------------------------------- */
  // Every node is registered by now, so a forward reference across files is safe.
  const clusterOf = (rec) => rec.clusterId || (rec.layer === 'inner' ? rec.id.split('.')[0] : null);

  for (const { doc, file, nodeIds } of reg.clusters.values()) {
    checkEdges(file, doc.edges || [], reg, (where, from, to) => {
      if (!nodeIds.has(from.id) || !nodeIds.has(to.id)) {
        fail(20, file, where, 'both endpoints of a cluster edge must be nodes in that cluster file');
      }
    });
  }

  for (const [nodeId, { file, doc, nodeIds }] of reg.innerFiles) {
    checkEdges(file, doc.edges || [], reg, (where, from, to) => {
      if (!nodeIds.has(from.id) || !nodeIds.has(to.id)) {
        fail(20, file, where, `both endpoints of an inner edge must be nodes in inner/${nodeId}.json`);
      }
    });
  }

  const edgesDoc = await readJSON('edges.json');
  if (edgesDoc) {
    scanForEmDash('data/edges.json', edgesDoc);
    if (edgesDoc.schema !== 1) fail(2, 'data/edges.json', 'schema', `must be 1, got ${edgesDoc.schema}`);
    checkEdges('data/edges.json', edgesDoc.edges || [], reg, (where, from, to) => {
      const cf = clusterOf(from);
      const ct = clusterOf(to);
      if (cf && ct && cf === ct) {
        fail(20, 'data/edges.json', where, `both endpoints are inside cluster "${cf}"; that edge belongs in clusters/${cf}.json`);
      }
    });
  }

  // 21 (second half): exactly one kin edge from each cluster notable to hub
  for (const { doc, file } of reg.clusters.values()) {
    const hits = reg.edges.filter(
      (e) => e.kind === 'kin' &&
        ((e.from === doc.notable && e.to === 'hub') || (e.to === doc.notable && e.from === 'hub'))
    );
    if (hits.length !== 1) {
      fail(21, file, `notable ${doc.notable}`, `needs exactly one kin edge to hub, found ${hits.length}`);
    } else if (hits[0].file !== 'data/edges.json') {
      fail(21, file, `notable ${doc.notable}`, `its hub edge lives in ${hits[0].file}, it belongs in data/edges.json`);
    }
  }

  // 16: every declared tag is used
  for (const t of reg.tagIds) {
    if (!reg.usedTags.has(t)) fail(16, 'data/atlas.json', `tags.${t}`, 'is declared but no node uses it');
  }

  /* ---- builds -------------------------------------------------------- */
  let builds = [];
  const buildsDoc = await readJSON('builds.json');
  if (buildsDoc) {
    scanForEmDash('data/builds.json', buildsDoc);
    if (buildsDoc.schema !== 1) fail(2, 'data/builds.json', 'schema', `must be 1, got ${buildsDoc.schema}`);
    builds = Array.isArray(buildsDoc.builds) ? buildsDoc.builds : [];
    const seenBuildIds = new Set();
    for (const b of builds) {
      const where = `build ${b && b.id}`;
      if (typeof b.id !== 'string' || !BUILD_ID_RE.test(b.id)) {
        fail(22, 'data/builds.json', where, `id must match ${BUILD_ID_RE}`);
      }
      if (seenBuildIds.has(b.id)) fail(22, 'data/builds.json', where, 'id appears twice');
      seenBuildIds.add(b.id);
      checkText('data/builds.json', `${where}.name`, b.name, 32);
      checkText('data/builds.json', `${where}.summary`, b.summary, 240, { banned: true });
      for (const t of b.tags || []) {
        if (!reg.tagIds.has(t)) fail(13, 'data/builds.json', `${where}.tags`, `"${t}" is not a key of atlas.json tags`);
      }
      const steps = Array.isArray(b.steps) ? b.steps : [];
      if (steps.length < 3 || steps.length > 12) {
        fail(22, 'data/builds.json', `${where}.steps`, `must hold 3 to 12 entries, found ${steps.length}`);
      }
      const seenNodes = new Set();
      const clusters = new Set();
      let hasCore = false;
      steps.forEach((s, i) => {
        const sw = `${where}.steps[${i}]`;
        const rec = reg.nodes.get(s.node);
        if (!rec) {
          fail(22, 'data/builds.json', sw, `node "${s.node}" is not in the corpus`);
          return;
        }
        if (seenNodes.has(s.node)) fail(22, 'data/builds.json', sw, `node "${s.node}" appears twice in this build`);
        seenNodes.add(s.node);
        if (rec.node.class === 'core') hasCore = true;
        const c = clusterOf(rec);
        if (c) clusters.add(c);
        checkText('data/builds.json', `${sw}.why`, s.why, 160, { banned: true });
        // 23
        const levels = rec.node.levels;
        if (s.level === undefined || s.level === null) {
          // fine either way
        } else if (!Array.isArray(levels)) {
          fail(23, 'data/builds.json', sw, `node "${s.node}" has no levels, level must be null`);
        } else if (!Number.isInteger(s.level) || s.level < 1 || s.level > levels.length) {
          fail(23, 'data/builds.json', sw, `level ${s.level} is outside 1..${levels.length} for "${s.node}"`);
        }
      });
      if (clusters.size < 2) {
        fail(22, 'data/builds.json', where, `spans ${clusters.size} cluster(s); a build must span at least two`);
      }
      if (!hasCore) fail(22, 'data/builds.json', where, 'has no class "core" step');
    }
  }

  /* ---- graph health, warnings only ------------------------------------ */
  const topLayer = [...reg.nodes.values()].filter((r) => r.layer !== 'inner');
  const degree = new Map();
  const out = new Map();
  for (const r of reg.nodes.values()) {
    degree.set(r.id, 0);
    out.set(r.id, []);
  }
  for (const e of reg.edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
    out.get(e.from).push(e.to);
    if (e.directed === false) out.get(e.to).push(e.from);
  }

  // 31
  for (const r of reg.nodes.values()) {
    if ((degree.get(r.id) || 0) === 0) {
      warnAt(31, r.file, `node ${r.id}`, 'has degree 0 and cannot be reached by a route');
    }
  }

  // 32: reachability from hub, following directed edges forward only
  const seen = new Set(['hub']);
  const queue = ['hub'];
  while (queue.length) {
    const id = queue.shift();
    for (const next of out.get(id) || []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  for (const r of topLayer) {
    if (!seen.has(r.id)) warnAt(32, r.file, `node ${r.id}`, 'is not reachable from hub');
  }

  // 33
  for (const r of reg.nodes.values()) {
    if (r.node.class !== 'core') continue;
    const n = reg.edges.filter((e) => e.kind === 'draws-on' && e.to === r.id).length;
    if (n < 3) warnAt(33, r.file, `node ${r.id}`, `is drawn on by only ${n} node(s); a core skill wants at least 3`);
  }

  return finish(reg, { topLayer, builds });
}

function finish(reg, extra = {}) {
  const topLayer = extra.topLayer || [];
  const innerNodes = [...reg.nodes.values()].filter((r) => r.layer === 'inner');
  const topEdges = reg.edges.filter((e) => !e.file.startsWith('data/inner/'));
  const innerEdges = reg.edges.length - topEdges.length;

  console.log('Aficion corpus');
  console.log(`  clusters      ${reg.clusters.size}`);
  console.log(`  top nodes     ${topLayer.length}  (hub + core + clustered)`);
  console.log(`  inner trees   ${reg.innerFiles.size}`);
  console.log(`  inner nodes   ${innerNodes.length}`);
  console.log(`  top edges     ${topEdges.length}`);
  console.log(`  inner edges   ${innerEdges}`);
  console.log(`  builds        ${(extra.builds || []).length}`);
  console.log(`  tags          ${reg.tagIds.size} declared, ${reg.usedTags.size} used`);
  console.log('');

  if (warnings.length) {
    console.log(`${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ${w}`);
    console.log('');
  }
  if (errors.length) {
    console.error(`${errors.length} error(s):`);
    for (const e of errors) console.error(`  ${e}`);
    console.error('');
    console.error('FAIL');
    process.exitCode = 1;
    return;
  }
  console.log('PASS');
}

await main();
