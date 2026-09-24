// Authored browse directions and a compact index make unopened subtopics searchable.
const cache = new Map();

export async function loadExploreData(atlas) {
  if (cache.has(atlas.basePath)) return cache.get(atlas.basePath);
  const task = Promise.allSettled(['explore.json', 'search-index.json'].map(async (file) => {
    const response = await fetch(atlas.basePath + file);
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    return response.json();
  })).then(([content, index]) => ({
    content: content.status === 'fulfilled' ? content.value : { families: [], starters: {}, feature: null },
    records: index.status === 'fulfilled' ? index.value.nodes : [...atlas.nodes.values()],
    partial: content.status !== 'fulfilled' || index.status !== 'fulfilled',
  }));
  cache.set(atlas.basePath, task);
  return task;
}
