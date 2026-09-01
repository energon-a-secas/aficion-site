// ── Profile codec ────────────────────────────────────────────
// A saved map is a URL fragment. A fragment is never part of an HTTP request,
// so nothing about a shared profile reaches a server. That is a property of the
// mechanism rather than a promise on a page, and two rules keep it true: this
// file never fetches, and it never moves a payload into a query string or a
// redirect.
//
// The four primitives below (toBase64Url, fromBase64Url, gzip, gunzip) are
// copied verbatim from projects/character-sheet-site/js/share/link.js:36-58,
// which is where they were proven. projects/resume-forge-site/js/share.js:31-53
// is the second copy and carries the same note. This is the third.
//
// No length guard, deliberately. A 30-node profile measures 447 characters of
// full URL and the 120-node ceiling measures under 900, which is two orders of
// magnitude inside every browser limit. resume-forge refuses at 78,000 because
// it carries embedded images; nothing here does.

import { safeGetJSON, safeSetJSON, safeRemove } from './neorgon-persist.js';

export const PROFILE_VERSION = 2;
export const STORAGE_KEY = 'aficion:profile:v1';

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Capability test, not a user-agent test.
const canGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export function emptyProfile() {
  return { v: PROFILE_VERSION, n: [], l: {}, e: [], en: {}, t: null };
}

/** Migrations are append-only and are never edited after they ship. */
const MIGRATIONS = [
  // v1 to v2: hand-tied links (`e`) arrive. A v1 payload simply has none yet.
  (p) => ({ ...p, v: 2, e: p.e || [] }),
];

export async function encode(profile) {
  const payload = { v: PROFILE_VERSION, n: [...profile.n].sort() };
  if (profile.l && Object.keys(profile.l).length) payload.l = profile.l;
  if (profile.e && profile.e.length) payload.e = profile.e;
  // Tie notes ride beside the pairs, never inside them: a reader that predates
  // `en` keeps every tie and loses only the annotation, so no version bump.
  if (profile.en && Object.keys(profile.en).length) payload.en = profile.en;
  if (profile.t) payload.t = String(profile.t).trim().slice(0, 24);
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (!canGzip) return { key: 'pj', payload: toBase64Url(json) };
  return { key: 'p', payload: toBase64Url(await gzip(json)) };
}

/** Throws on any malformed payload. Never partially applies one. */
export async function decode(key, payload) {
  let json;
  try {
    const bytes = fromBase64Url(payload);
    json = new TextDecoder().decode(key === 'p' ? await gunzip(bytes) : bytes);
  } catch {
    // The underlying rejection here is a stream error that surfaces as
    // "Failed to fetch", which would tell the visitor a network story about a
    // page that makes no request. Say what actually happened instead.
    throw new Error('This link is not readable. It looks truncated, so copy the whole address and try again.');
  }
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('This link is not readable: the payload is not JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This link is not readable: not a profile.');
  if (!Number.isInteger(raw.v) || raw.v < 1) throw new Error('This link is not readable: no format version.');
  if (!Array.isArray(raw.n)) throw new Error('This link is not readable: no node list.');

  // Hand-tied links: canonical sorted pairs of node ids. Sanitised here so
  // nothing downstream meets a malformed pair; the cap is a payload sanity
  // bound, far above any real map.
  const seenPairs = new Set();
  const links = [];
  for (const p of Array.isArray(raw.e) ? raw.e.slice(0, 400) : []) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const [a, b] = p;
    if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
    const pair = a < b ? [a, b] : [b, a];
    const key = pair.join('|');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    links.push(pair);
  }
  // Tie notes: keyed by the canonical pair string, values plain short strings.
  const notes = {};
  if (raw.en && typeof raw.en === 'object' && !Array.isArray(raw.en)) {
    for (const [k, v] of Object.entries(raw.en)) {
      if (typeof v !== 'string') continue;
      const m = /^([a-z0-9.-]+)\|([a-z0-9.-]+)$/.exec(k);
      if (!m || m[1] >= m[2]) continue;
      const note = v.trim().slice(0, 120);
      if (note) notes[k] = note;
    }
  }
  let out = {
    v: raw.v,
    n: raw.n.filter((id) => typeof id === 'string'),
    l: raw.l && typeof raw.l === 'object' ? { ...raw.l } : {},
    e: links,
    en: notes,
    t: typeof raw.t === 'string' ? raw.t.trim().slice(0, 24) : null,
  };
  // A v1 URL opened by a v2 app: migrate it forward. A v2 URL opened by a v1
  // app keeps its higher `v`, and the caller refuses to save it.
  for (let v = out.v; v < PROFILE_VERSION && MIGRATIONS[v - 1]; v++) out = MIGRATIONS[v - 1](out);
  return out;
}

/**
 * Resolve ids against the corpus. decode() never does this: a link with thirty
 * nodes and one removed id opens with twenty-nine, and the two failure buckets
 * stay separate because the honest message differs. `retired` means this was on
 * the map and is not any more; `unknown` means this is not a node here at all.
 */
export function reconcile(atlas, profile) {
  const unknown = [];
  const retired = [];
  const clamped = [];
  const keep = [];
  for (const id of profile.n) {
    if (atlas.nodes.has(id)) keep.push(id);
    else if (atlas.retired.has(id)) retired.push(id);
    else unknown.push(id);
  }
  const l = {};
  // Dedication is one universal ladder (atlas.dedication), so a depth is legal
  // on any kept node. Old ladder positions (1..3) read as Low..High unchanged.
  const maxDepth = atlas.dedication.length;
  for (const [id, level] of Object.entries(profile.l || {})) {
    if (!keep.includes(id)) continue;
    if (!Number.isInteger(level) || level < 1) continue;
    if (level > maxDepth) {
      l[id] = maxDepth;
      clamped.push(id);
    } else {
      l[id] = level;
    }
  }
  // A hand-tied link survives only while both of its ends do, and a note only
  // while its tie does.
  const keepSet = new Set(keep);
  const e = [];
  let droppedLinks = 0;
  for (const pair of profile.e || []) {
    if (keepSet.has(pair[0]) && keepSet.has(pair[1])) e.push(pair);
    else droppedLinks += 1;
  }
  const en = {};
  for (const pair of e) {
    const k = pair.join('|');
    if (profile.en && profile.en[k]) en[k] = profile.en[k];
  }
  return { profile: { ...profile, n: keep.sort(), l, e, en }, unknown, retired, clamped, droppedLinks };
}

export async function buildShareUrl(profile, base) {
  const { key, payload } = await encode(profile);
  const root = base || `${location.origin}${location.pathname}`;
  return `${root}#${key}=${payload}`;
}

export function readHash(hash = location.hash) {
  const m = /^#(pj?)=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? { key: m[1], payload: m[2] } : null;
}

/** Accepts a full URL or a bare payload, for the compare box. */
export function readPasted(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const hashAt = trimmed.indexOf('#');
  if (hashAt !== -1) return readHash(trimmed.slice(hashAt));
  const bare = /^(pj?)=([A-Za-z0-9_-]+)$/.exec(trimmed);
  if (bare) return { key: bare[1], payload: bare[2] };
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return { key: 'p', payload: trimmed };
  return null;
}

/** A saved-empty map is a choice; never-saved is a first visit. */
export function hasSaved() {
  return load() !== null;
}

/** Uncompressed on purpose: a synchronous read on the boot path. */
export function load() {
  const raw = safeGetJSON(STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.n)) return null;
  return {
    v: raw.v || PROFILE_VERSION,
    n: raw.n,
    l: raw.l || {},
    e: Array.isArray(raw.e) ? raw.e : [],
    en: raw.en && typeof raw.en === 'object' && !Array.isArray(raw.en) ? raw.en : {},
    t: raw.t || null,
  };
}

export function save(profile) {
  return safeSetJSON(STORAGE_KEY, {
    v: PROFILE_VERSION,
    n: profile.n,
    l: profile.l,
    e: profile.e || [],
    en: profile.en || {},
    t: profile.t,
  });
}

/** One-step backup written just before "Replace mine" adopts a shared link.
    A separate key, same format version as save(). */
export function saveBackup(profile) {
  return safeSetJSON('aficion:profile:prev:v1', {
    v: PROFILE_VERSION,
    n: profile.n,
    l: profile.l,
    e: profile.e || [],
    en: profile.en || {},
    t: profile.t,
  });
}

export function clearSaved() {
  return safeRemove(STORAGE_KEY);
}
