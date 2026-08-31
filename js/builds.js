// ── Curated builds ───────────────────────────────────────────
// A build references the graph rather than being part of it: an ordered stack
// that crosses at least two clusters and touches at least one craft. The order
// is the recommended order, so the cursor walks it rather than sorting it.

import { loadBuilds, ensureNodes } from './atlas/load.js';
import { setLevel, toggle } from './alloc.js';

/** Fetched lazily: a visitor who never opens the panel never downloads it. */
export async function ensureBuilds(atlas) {
  await loadBuilds(atlas);
  // A build step may point at an inner node (contract 1.13's last note), and
  // inner trees are lazy, so resolve them now or the panel prints raw ids.
  await ensureNodes(atlas, atlas.builds.flatMap((b) => b.steps.map((s) => s.node)));
  return atlas.builds;
}

export function listBuilds(atlas) {
  return atlas.builds;
}

export function buildProgress(build, allocated) {
  let done = 0;
  let nextIndex = -1;
  build.steps.forEach((step, i) => {
    if (allocated.has(step.node)) done += 1;
    else if (nextIndex === -1) nextIndex = i;
  });
  return { done, total: build.steps.length, nextIndex: nextIndex === -1 ? build.steps.length : nextIndex };
}

/** Apply the first `upTo` steps. Returns a NEW profile; the caller assigns. */
export function applyBuild(profile, build, upTo) {
  let next = profile;
  build.steps.slice(0, upTo).forEach((step) => {
    if (step.level === null || step.level === undefined) {
      if (!next.n.includes(step.node)) next = toggle(next, step.node);
    } else {
      next = setLevel(next, step.node, step.level);
    }
  });
  return next;
}

/** The node ids a build touches, in order, for the ViewModel. */
export function buildSteps(build) {
  return build.steps.map((s) => s.node);
}

/**
 * What a build stacks: the clusters it crosses and the crafts underneath it.
 * This is the sentence the panel prints under the summary, and it is derived
 * rather than authored so it can never disagree with the steps.
 */
export function buildSpan(atlas, build) {
  const clusters = new Set();
  const cores = [];
  for (const step of build.steps) {
    const node = atlas.nodes.get(step.node);
    if (!node) continue;
    if (node.class === 'core') cores.push(node.label);
    else if (node.cluster) clusters.add(node.cluster);
  }
  return {
    clusters: [...clusters].map((id) => (atlas.clusters.get(id) || { label: id }).label),
    cores,
  };
}
