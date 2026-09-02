#!/usr/bin/env node
/**
 * Per-node stub pages for crawlers, plus sitemap.xml.
 *
 * The atlas is a canvas, which a crawler reads as one empty element. These
 * stubs give every top-layer node a real page: title, description, its
 * family, its neighbours as real anchors, and a JS redirect into the live
 * atlas at #node=<id> for humans. Regenerate with `make pages` after any
 * corpus change; the files are committed, not built on deploy.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = 'https://aficion.neorgon.com';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJSON = async (rel) => JSON.parse(await readFile(resolve(ROOT, rel), 'utf8'));

const atlas = await readJSON('data/atlas.json');
const nodes = new Map();
const whereOf = new Map();
const adj = new Map();

const addAdj = (a, b) => {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.get(a).includes(b)) adj.get(a).push(b);
};

for (const core of atlas.core) {
  nodes.set(core.id, core);
  whereOf.set(core.id, 'A craft under several families');
}
const edgeLists = [];
for (const id of atlas.clusters) {
  const doc = await readJSON(`data/clusters/${id}.json`);
  for (const node of doc.nodes) {
    nodes.set(node.id, node);
    whereOf.set(node.id, doc.label);
  }
  edgeLists.push(...doc.edges);
}
const edgesDoc = await readJSON('data/edges.json');
edgeLists.push(...edgesDoc.edges);
for (const e of edgeLists) {
  if (e.from === 'hub' || e.to === 'hub') continue;
  addAdj(e.from, e.to);
  addAdj(e.to, e.from);
}

await mkdir(resolve(ROOT, 'n'), { recursive: true });

const urls = [`${SITE}/`];
for (const [id, node] of nodes) {
  const neighbours = (adj.get(id) || [])
    .filter((n) => nodes.has(n))
    .slice(0, 8)
    .map((n) => `<li><a href="/n/${esc(n)}.html">${esc(nodes.get(n).label)}</a></li>`)
    .join('\n      ');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(node.label)} | Aficion</title>
<meta name="description" content="${esc(node.blurb)}">
<link rel="canonical" href="${SITE}/n/${esc(id)}.html">
<meta property="og:title" content="${esc(node.label)} | Aficion">
<meta property="og:description" content="${esc(node.blurb)}">
<meta property="og:url" content="${SITE}/n/${esc(id)}.html">
<meta name="robots" content="index, follow">
<style>body{font-family:system-ui,sans-serif;background:#040714;color:#f9f9f9;max-width:640px;margin:0 auto;padding:48px 24px;line-height:1.6}a{color:#fcd34d}p.where{color:#fbbf24;text-transform:uppercase;font-size:.8rem;letter-spacing:.06em}</style>
</head>
<body>
<main>
  <p class="where">${esc(whereOf.get(id) || 'Aficion')}</p>
  <h1>${esc(node.label)}</h1>
  <p>${esc(node.blurb)}</p>
  ${neighbours ? `<h2>Connects to</h2>\n  <ul>\n      ${neighbours}\n  </ul>` : ''}
  <p><a href="/#node=${encodeURIComponent(id)}">Open ${esc(node.label)} in the atlas</a></p>
</main>
<script>location.replace('/#node=${encodeURIComponent(id)}');</script>
</body>
</html>
`;
  await writeFile(resolve(ROOT, 'n', `${id}.html`), html);
  urls.push(`${SITE}/n/${id}.html`);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile(resolve(ROOT, 'sitemap.xml'), sitemap);
console.log(`generate-node-pages: wrote ${nodes.size} pages under n/ and sitemap.xml with ${urls.length} urls`);
