#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const languages = [];
for (const dir of ['data', 'data-es']) {
  const read = async (file) => JSON.parse(await readFile(new URL(`${dir}/${file}`, root), 'utf8'));
  const atlas = await read('atlas.json');
  const content = await read('explore.json');
  const index = await read('search-index.json');
  const ids = new Set(index.nodes.map((node) => node.id));
  assert.equal(ids.size, index.nodes.length, `${dir}: duplicate search ids`);
  const assigned = content.families.flatMap((family) => family.clusters);
  assert.equal(new Set(assigned).size, assigned.length, `${dir}: duplicated category assignment`);
  assert.deepEqual(assigned.toSorted(), atlas.clusters.toSorted(), `${dir}: category coverage`);
  for (const family of content.families) {
    assert.match(family.id, /^[a-z][a-z-]+$/);
    assert.ok(family.label && family.blurb && family.clusters.length);
  }
  for (const [id, firstStep] of Object.entries(content.starters)) {
    assert.ok(ids.has(id), `${dir}: unknown starter ${id}`);
    assert.ok(firstStep.length > 30 && firstStep.length < 350, `${dir}: starter length ${id}`);
  }
  for (const id of content.featuredCategories) assert.ok(atlas.clusters.includes(id), `${dir}: featured category ${id}`);
  const clusterFiles = await Promise.all(atlas.clusters.map((id) => read(`clusters/${id}.json`)));
  const edges = [...(await read('edges.json')).edges, ...clusterFiles.flatMap((cluster) => cluster.edges || [])];
  const connected = (from, to) => edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
  const examples = content.feature.examples;
  assert.ok(examples.length > 0 && new Set(examples.map((example) => example.id)).size === examples.length, `${dir}: unique example ids`);
  for (const example of examples) {
    assert.ok(example.label && example.title && example.blurb && example.branch.note, `${dir}: example descriptions`);
    assert.equal(example.path.length, 4, `${dir}: four stops in the preview`);
    assert.equal(new Set(example.path).size, 4, `${dir}: distinct example stops`);
    assert.ok(example.path.every((id, i) => ids.has(id) && (!i || connected(example.path[i - 1], id))), `${dir}: preview paths must follow real connections`);
    assert.equal(example.notes.length, example.path.length - 1, `${dir}: explain every connection`);
    assert.ok(example.notes.every((note) => typeof note === 'string' && note.trim()), `${dir}: connection explanations`);
    assert.ok(example.path.includes(example.branch.from) && !example.path.includes(example.branch.to) && ids.has(example.branch.to) && connected(example.branch.from, example.branch.to), `${dir}: branch must leave the path on an authored edge`);
    assert.ok(example.path.includes(example.depth.parent) && example.depth.node.startsWith(example.depth.parent + '.') && ids.has(example.depth.node), `${dir}: depth must be a real subtopic of a path stop`);
  }
  const files = (await readdir(new URL(`${dir}/inner/`, root))).filter((name) => name.endsWith('.json'));
  for (const name of files) {
    const tree = await read(`inner/${name}`);
    for (const node of tree.nodes) assert.ok(ids.has(node.id), `${dir}: unsearchable subtopic ${node.id}`);
  }
  assert.ok(!JSON.stringify(content).includes('\u2014'), `${dir}: em dash in browse copy`);
  languages.push({ ids: [...ids].sort(), families: content.families.map((f) => ({ id: f.id, clusters: f.clusters })), starters: Object.keys(content.starters).sort(), examples: examples.map(({ id, path, branch, depth }) => ({ id, path, branch: [branch.from, branch.to], depth })) });
  console.log(`${dir}: browse directions, starters, diagram connections and subtopic search verified.`);
}
assert.deepEqual(languages[0], languages[1], 'English and Spanish exploration structure must match.');
