import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAtlas } from '../js/atlas/load.js';
import { computeLayout } from '../js/atlas/layout.js';
import { connectedNodes, compassTargets, radialTargets, extendTrail, connectionLabel } from '../js/atlas/traversal.js';

const root = new URL('../', import.meta.url);
globalThis.fetch = async (url) => new Response(await readFile(new URL(url, root)));
for (const language of ['data/', 'data-es/']) {
  const atlas = await loadAtlas(language);
  const layout = computeLayout(atlas);
  for (const id of atlas.topNodes) {
    const neighbours = connectedNodes(atlas, layout, id);
    const arrows = compassTargets(atlas, layout, id);
    const ports = radialTargets(atlas, layout, id);
    assert.deepEqual(ports.flatMap((port) => port.links.map((link) => link.to)).sort(), neighbours.map((link) => link.to).sort(), 'Every direct connection is represented by a visible port');
    assert.ok(ports.length <= 12, 'Busy nodes stay readable');
    for (const [i, port] of ports.entries()) {
      assert.ok(Math.abs(Math.atan2(port.y, port.x) - port.angle) < 1e-10, 'Arrow position matches its actual bearing');
      if (port.links.length === 1) assert.equal(port.angle, port.links[0].angle, 'Individual arrows point exactly at their destination');
      for (const other of ports.slice(i + 1)) assert.ok(Math.hypot(port.x - other.x, port.y - other.y) >= 42, 'Hit targets never overlap');
    }
    assert.equal(new Set(neighbours.map((link) => link.to)).size, neighbours.length, 'Each destination appears once');
    assert.ok(neighbours.every((link) => link.to !== id && link.to !== atlas.hubId), 'No self loops or hub shortcuts');
    assert.ok(arrows.length <= 4 && new Set(arrows.map((arrow) => arrow.id)).size === arrows.length, 'At most one arrow in each direction');
    for (const { link } of arrows) {
      assert.ok(atlas.adj.get(id).some((edge) => edge.to === link.to), 'Every arrow follows an authored edge');
      assert.ok(connectedNodes(atlas, layout, link.to, { includeHub: true }).some((edge) => edge.to === id), 'Every followed connection can be retraced, including from the hub');
      assert.ok(connectionLabel(link, language === 'data-es/'));
    }
  }
  const arduino = radialTargets(atlas, layout, 'maker.arduino');
  assert.equal(arduino.flatMap((port) => port.links).length, 11, 'All eleven Arduino connections remain reachable');
  assert.ok(arduino.length > 4, 'Arduino is no longer limited to four arrows');
}
assert.deepEqual(extendTrail(['a', 'b', 'c'], 'c', 'b'), ['a', 'b'], 'Backtracking truncates the trail');
assert.deepEqual(extendTrail(['a', 'b', 'c'], 'c', 'a'), ['a'], 'Revisiting a node removes a loop');
assert.deepEqual(extendTrail(['a', 'b'], 'x', 'y'), ['x', 'y'], 'Exploring elsewhere starts a fresh trail');
const longPath = Array.from({ length: 12 }, (_, i) => String(i));
assert.deepEqual(extendTrail(longPath, '11', '12'), [...longPath.slice(1), '12'], 'Long trails stay bounded');
console.log('PASS: real directional connections, backtracking, deduplication, cycle removal and bounded trails in both languages.');
