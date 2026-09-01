// ── Example maps ─────────────────────────────────────────────
// Full profiles in the shared-link shape, shipped as content. Loading one
// goes through the same pendingShared card a real shared link uses, so an
// example can never overwrite the visitor's own map either.

let cache = null;

export async function ensureExamples(basePath = 'data/') {
  if (cache) return cache;
  const res = await fetch(`${basePath}examples.json`);
  if (!res.ok) throw new Error(`${basePath}examples.json answered ${res.status}`);
  const raw = await res.json();
  if (!raw || !Array.isArray(raw.examples) || !raw.examples.length) {
    throw new Error('data/examples.json declares no examples');
  }
  cache = raw;
  return cache;
}
