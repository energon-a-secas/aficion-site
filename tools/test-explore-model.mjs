#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchHobbies, connections } from '../js/explore-model.js';
import { loadAtlas, loadInner } from '../js/atlas/load.js';

const root = new URL('../', import.meta.url);
const requests = new Map();
globalThis.fetch = async (url) => {
  requests.set(url, (requests.get(url) || 0) + 1);
  return new Response(await readFile(new URL(url, root)));
};
const atlas = await loadAtlas('data/');
const index = JSON.parse(await readFile(new URL('data/search-index.json', root)));
const spanish = JSON.parse(await readFile(new URL('data-es/search-index.json', root)));
assert.ok(searchHobbies(spanish.nodes, 'fotografia').some((n) => n.id === 'core.photography'), 'Accent-insensitive Spanish search');
assert.ok(searchHobbies(index.nodes, 'worldbuilding').some((n) => n.id === 'core.writing.worldbuilding'), 'Unopened subtopics are searchable');
assert.ok(searchHobbies(index.nodes, 'natural light').some((n) => n.id === 'core.photography.natural-light'), 'Multiword search');
assert.equal(searchHobbies(index.nodes, 'guitar', { cluster: 'garden' }).length, 0, 'Category filtering');
assert.ok(searchHobbies(index.nodes, '', { filter: 'deep' }).every((n) => n.inner), 'Only expandable hobbies in deep filter');
assert.ok(searchHobbies(index.nodes, '', { filter: 'easy' }).every((n) => n.tags.includes('cheap-start')), 'Easy to start uses corpus tags');
assert.equal(searchHobbies(index.nodes, '', { saved: new Set(['core.writing.worldbuilding']) }).length, 1, 'Saved subtopics stay in the collection');
for (const lens of ['related', 'skills', 'gear', 'interests']) {
  const rows = connections(atlas, 'model.gunpla', lens);
  assert.equal(new Set(rows.map((r) => r.node.id)).size, rows.length, `No repeated ${lens} results`);
  assert.ok(rows.every((r) => r.node.id !== 'hub' && r.node.id !== 'model.gunpla'));
  for (const result of rows) {
    if (lens === 'interests') {
      assert.ok(result.inferred && !result.path.length, 'Tag affinities must not claim a physical graph path');
      continue;
    }
    for (let i = 1; i < result.path.length; i++) {
      const edge = atlas.adj.get(result.path[i - 1]).find((e) => e.to === result.path[i]);
      assert.ok(edge, 'A displayed path uses only real graph edges');
      if (lens === 'skills') assert.equal(edge.kind, 'draws-on');
      if (lens === 'gear') assert.equal(edge.kind, 'shares-gear');
    }
  }
}
assert.ok(connections(atlas, 'model.gunpla', 'skills').some((r) => r.node.id === 'figure.mini-painting' && r.path.includes('core.painting')), 'Shared painting connects models and miniatures');
assert.ok(!connections(atlas, 'model.gunpla', 'gear').some((r) => r.node.id === 'anime.mecha'), 'Fandom is not equipment');
const [first, second] = await Promise.all([loadInner(atlas, 'core.photography'), loadInner(atlas, 'core.photography')]);
assert.equal(first, second, 'Concurrent loads resolve to the same tree');
assert.equal(requests.get('data/inner/core.photography.json'), 1, 'Concurrent loads make one request');
for (const id of first.nodeIds) {
  const adj = atlas.adj.get(id);
  assert.equal(new Set(adj.map((e) => `${e.to}:${e.kind}`)).size, adj.length, 'Concurrent loading does not duplicate connections');
}
console.log('PASS: search, filters, saved subtopics, four connection lenses, graph paths and concurrent inner loading.');
