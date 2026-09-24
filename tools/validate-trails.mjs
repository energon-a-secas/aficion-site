import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAtlas } from '../js/atlas/load.js';
import { loadCuratedTrails } from '../js/trail-model.js';

const root = new URL('../', import.meta.url);
globalThis.fetch = async (url) => new Response(await readFile(new URL(url, root)));
const structures = [];
for (const language of ['data/', 'data-es/']) {
  const atlas = await loadAtlas(language);
  const trails = await loadCuratedTrails(atlas);
  assert.ok(trails.length >= 1, 'The library must include at least one suggested trail');
  structures.push(trails.map(({ id, path, notes }) => ({ id, path, notes: notes.length })));
  console.log(`${language} ${trails.length} curated trails: every stop, connection and explanation verified.`);
}
assert.deepEqual(structures[0], structures[1], 'Trail ids, paths and explanation counts must match between languages');
