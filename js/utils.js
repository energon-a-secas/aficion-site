// ── Shared utilities ─────────────────────────────────────────
// Only what the vendored DOM Kit does not already cover. Everything the kit
// owns is re-exported from here so no module reaches around it: the kit's
// escHtml escapes the apostrophe and its showToast sets role/aria-live, and a
// hand-rolled local copy of either is how those two defects came back.
// Canonical source: packages/neorgon-ui/dom/dom.js (sync-dom.sh).

export {
  escHtml,
  debounce,
  throttle,
  clamp,
  uid,
  showToast,
  copyText,
  prefersReducedMotion,
} from './neorgon-dom.js';

/** Cached element lookup by id. */
const _els = {};
export function $(id) {
  const hit = _els[id];
  if (hit && hit.isConnected) return hit;
  return (_els[id] = document.getElementById(id));
}

/** Degrees to radians. 0 is east, positive is clockwise (y grows downward). */
export function rad(deg) {
  return (deg * Math.PI) / 180;
}

/** "a, b and 2 more", for a list that must not run past one line. */
export function joinList(items, max = 2) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length <= max) return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}

/** Plural helper that keeps copy out of template literals. */
export function plural(n, one, many) {
  return n === 1 ? one : many;
}
