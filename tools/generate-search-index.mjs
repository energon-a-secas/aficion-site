#!/usr/bin/env node
// Generated search content includes inner trees without loading every graph at boot.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
for (const dir of ['data', 'data-es']) {
  const base = resolve(root, dir);
  const read = async (file) => JSON.parse(await readFile(resolve(base, file), 'utf8'));
  const atlas = await read('atlas.json');
  const nodes = [];
  const add = (node, cluster) => nodes.push({ id: node.id, label: node.label, class: node.class, blurb: node.blurb, tags: node.tags, aka: node.aka || [], inner: !!node.inner, cluster });
  atlas.core.forEach((node) => add(node, null));
  for (const id of atlas.clusters) (await read(`clusters/${id}.json`)).nodes.forEach((node) => add(node, id));
  for (const file of (await readdir(resolve(base, 'inner'))).filter((file) => file.endsWith('.json')).sort()) {
    const tree = await read(`inner/${file}`);
    const parent = nodes.find((node) => node.id === tree.of);
    if (!parent) throw new Error(`Missing parent: ${tree.of}`);
    tree.nodes.forEach((node) => add(node, parent.cluster));
  }
  const output = JSON.stringify({ nodes }) + '\n';
  const path = resolve(base, 'search-index.json');
  if (check) {
    if (await readFile(path, 'utf8') !== output) throw new Error(`${dir}/search-index.json is stale. Run make search-index.`);
  } else await writeFile(path, output);
  console.log(`${dir}: ${nodes.length} searchable hobbies, crafts and subtopics${check ? ' verified' : ''}.`);
}
