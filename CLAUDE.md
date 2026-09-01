# CLAUDE.md: Aficion

One connected map of hobbies and the crafts underneath them. A visitor marks
what they practise, sees the gold paths between their own nodes, drills into
inner trees, gets "one step away" suggestions justified by shared crafts, tags
or gear, and saves, shares and compares maps by URL. Zero build, no backend.

**Live:** aficion.neorgon.com · **Port:** 8877

## Run

```bash
make serve       # http://localhost:8877
make validate    # corpus validator, 33 structural checks
make corpus      # the same target under its CONTRACTS.md name
```

It must be served over HTTP. The app is ES modules and `file://` blocks them.

## Architecture

| Module | Lines | Owns |
|---|---:|---|
| `js/render.js` | 484 | `buildViewModel`, `paint`, `announce`, `renderDetail`, `renderFocusChip`, `renderLinkChip`, `bucketLabel` |
| `js/actions.js` | 452 | `commit`, `select`, `toggleNode`, `applyLevel`, `focusCluster`, `startLink`, `completeLink`, `openSheet`, `adoptShared`, `seedStarter` |
| `js/events.js` | 313 | `bindEvents` (the delegated data-act layer) |
| `js/atlas/draw-nodes.js` | 311 | `drawCoreNodes`, `drawPlainNodes`, `drawNotables`, `drawHub`, `drawHalos` |
| `js/atlas/load.js` | 294 | `SCHEMA`, `AtlasError`, `loadAtlas`, `hasInner`, `loadInner` |
| `js/canvas-input.js` | 255 | `bindCanvas` (pointer, keyboard, link mode, long-press) |
| `js/alloc.js` | 235 | `toggle`, `setLevel`, `addLink`, `removeLink`, `computeRoutes`, `nearMisses`, `bucketOf` |
| `js/panels.js` | 231 | `renderShare`, `renderCompare`, `renderBuildsList`, `renderBuildPanel`, `renderInner`, `renderSharedPrompt` |
| `js/profile.js` | 226 | `PROFILE_VERSION`, `STORAGE_KEY`, `emptyProfile`, `encode`, `decode`, `saveBackup`, `hasSaved` |
| `js/render-sheet.js` | 222 | `renderSheet` (the character sheet view) |
| `js/atlas/draw-edges.js` | 219 | `drawDrawsOn`, `drawBaseEdges`, `drawRoute`, `drawPersonalEdges`, `drawCompareEdges` |
| `js/atlas/layout.js` | 166 | `computeLayout`, `layoutInner`, `boundsOfIds` |
| `js/atlas/camera.js` | 160 | `MIN_ZOOM`, `MAX_ZOOM`, `createCamera` (stage-aware `minZoom` floor) |
| `js/discover.js` | 131 | `suggest`, `startingPoints` |
| `js/atlas/draw-labels.js` | 131 | `drawLabels` |
| `js/atlas/theme.js` | 128 | `withAlpha`, `shade`, `resolveTheme`, `onThemeChange` |
| `js/atlas/draw.js` | 116 | `createRenderer` |
| `js/state.js` | 113 | `PREFS_KEY`, `state`, `loadPrefs`, `savePrefs`, `rememberCamera` |
| `js/compare.js` | 111 | `compare`, `compareHeadline` |
| `js/sheet.js` | 104 | `ensureSheet`, `computeSheet`, `computeTitles` |
| `js/atlas/pick.js` | 84 | `HIT_FLOOR`, `NODE_RADIUS`, `radiusOf`, `buildIndex`, `nodeAt` |
| `js/tour.js` | 82 | `openTour`, `tourNext`, `tourBack`, `closeTour` (first-visit tour) |
| `js/builds.js` | 68 | `ensureBuilds`, `listBuilds`, `buildProgress`, `applyBuild`, `buildSteps` |
| `js/modal.js` | 64 | `getFocusable`, `openModalEl`, `openModal`, `closeModal`, `onModalKeydown` |
| `js/context-menu.js` | 63 | `openContextMenu`, `closeContextMenu`, `refreshContextMenu` |
| `js/inner.js` | 56 | `openInner`, `closeInner`, `currentInner`, `normalise`, `innerProgress` |
| `js/utils.js` | 43 | `$`, `rad`, `joinList`, `plural` |
| `js/examples.js` | 18 | `ensureExamples` |
| `js/app.js` | 44 | entry point, must stay under 50 lines |

Vendored from `packages/neorgon-ui/`, never edited in place, refreshed by the
sync scripts: `js/neorgon-header.js`, `js/neorgon-footer.js`,
`js/neorgon-beacon.js`, `js/neorgon-dom.js`, `js/neorgon-persist.js` and the
matching `css/neorgon-*.css`.

## Data

`data/` is the product. 39 files: `atlas.json` (clusters, tags, retired ids,
and the universal `dedication` ladder), `edges.json` (typed top-layer edges,
every shares-gear edge noted), `builds.json` (9 curated builds),
`clusters/*.json` (22 files, each declaring a cluster-level `accent` hue),
`inner/*.json` (12 trees), `sheet.json` (the character sheet's six-domain
fold of the nine core crafts, plus the earned profile-title rules) and
`examples.json` (loadable example maps in the shared-link shape). Totals move
with the corpus; `make validate` prints the live census (331 top nodes, 662
top edges, 90 inner nodes as of 2026-09-01). Content is data, never inside a
`.js` file.

## Conventions

- Zero build. Plain ES modules loaded by `js/app.js`. No bundler, no npm
  dependency for the app, no backend.
- Header, footer and beacon come from the shared kits. No site-local
  `.neo-footer` or `.header-bar` CSS.
- No single JS file over 500 lines, `js/app.js` under 50. It currently holds.
- No inline `onclick`, anywhere. Wiring lives in `js/events.js`.
- The only identity knob is `--accent: #fbbf24` plus `--accent-bright: #fcd34d`
  in `css/style.css`. Everything else comes from CDN `base.css`.

## Gotchas

**`ctx.filter` is never set, and that is deliberate.** WebKit has never shipped
`CanvasRenderingContext2D.filter`; it is not Baseline. The gold halo and the
suggestion glow are layered alpha strokes instead, and they were measured
pixel-for-pixel identical in Chromium and WebKit. A `ctx.filter = 'blur(...)'`
added anywhere under `js/atlas/` looks fine in Chrome and silently paints
nothing in Safari, which is the worst failure mode available here. The
prohibition is documented in comments at `js/atlas/draw.js:9` and
`js/atlas/draw-edges.js:7`, and `grep -rn '\.filter\s*=' js/` should stay empty.

**"An inner node counts where its top-layer parent counts" has exactly one
implementation.** It is `bucketOf()` / `buckets()` at `js/alloc.js:171`. Two
surfaces have shipped their own copy of that rule and both undercounted:
`coverage()` in the mine panel, and the `byCluster` loop in `js/compare.js`.
Both printed a number that contradicted the list of chips directly above it, and
`Builds → Garage Kit → Add every step → Compare` reached the second one in one
click. `atlas.byCluster` holds **top-layer nodes only**, so anything that walks
it will miss every inner node. If you add a third surface that counts nodes per
cluster, call `bucketOf()`. Do not re-derive.

**The layout recipe list is declared twice, across the data/code seam.**
`js/atlas/layout.js:30` implements the five recipes, `tools/validate-corpus.mjs:49`
hardcodes their names, and nothing checks the two agree. `js/atlas/layout.js:71`
throws at runtime on an unknown recipe. Adding a sixth means editing both files,
in what were two different owners' zones. The same seam runs through cluster
geometry generally: `data/atlas.json` declares each cluster's anchor and recipe
parameters and `js/atlas/layout.js` derives every coordinate from them, so a
corpus edit moves the map without touching a line of rendering code. Anchors
closer than 240 world units to another cluster's fail the validator, which is
the only guard on that.

**WebKit does not focus a `<button>` on a plain mouse click.** After a click,
`document.activeElement` is `BODY`, not the button. Anything that reads focus to
decide what to close, or that restores focus on modal close, is a no-op in
Safari. Concretely: Escape after a *mouse* click on a drill-in row does nothing
in WebKit, while the keyboard route works in both engines and "Back to the map"
always works. This is a platform convention, not a bug in this code. If it is
ever worth closing, give the row focus explicitly when it is activated. Do
**not** move the Escape listener back onto `document`: `js/events.js:374`
already binds one there, and a second reachable path makes one keypress close
two things.

**Never rename `aficion:profile:v1`.** Once the site is live that key holds real
visitor state and nothing warns you. The FORMAT inside it is now v2
(`PROFILE_VERSION = 2`): `e` carries hand-tied links as canonically sorted id
pairs, and `MIGRATIONS[0]` (append-only, never edited after shipping) lifts a
v1 payload forward. The protection is unchanged: an app reading a payload
NEWER than its own `PROFILE_VERSION` must read what it understands and
**refuse to write**, which `commit()` and the share-name input both enforce.
Downgrading somebody's saved map from a stale tab is the failure that looks
exactly like the link having worked.

**A hand tie implies both ends are marked, everywhere.** `addLink` marks both
endpoints, `toggle` removes a node's ties with the node, and `clearMine`
empties `e` alongside `n` (the adversarial review caught it keeping ties on an
"empty" map). Every `computeRoutes` caller passes `profile.e`, including the
boot call in `app.js`; the one that did not made a reload offer bridges across
islands the visitor had already tied. Pairs are canonical (`a < b`), built and
compared via `join('|')`.

**Pointer discipline in `canvas-input.js` is load-bearing.** A pinch is never
a click (either finger lifting must not select, tie or cancel), only button 0
acts as a click (right-click belongs to the menu), a long-press swallows the
click iOS synthesises after it, and the second click of a tie-completing
double must not unmark the tie. Each guard exists because an adversarial pass
produced the concrete failure without it.

**Suggestions light six nodes on the canvas, not the whole frontier.**
`nearMisses()` returns 15, 34 and 56 ids at 3, 8 and 14 marks, and ringing all
of them would put 21% of the atlas in the "one step away" state while the panel
still listed six. The on-canvas set is deliberately the same six the panel
prints, in the same `--atlas-accent-ember` token. Keep them the same set: the
panel and the map disagreeing is the defect this channel was built to close.

**A shared `#p=` link never adopts silently over a non-empty map.** applyHash
holds the decoded profile in `state.pendingShared` and renders a three-way
card (compare, replace, dismiss); "replace" writes a one-step backup to
`aficion:profile:prev:v1` first, and the hash is consumed and cleared via
`history.replaceState` either way, so a reload cannot replay it. Only an
empty local profile adopts directly. Regressing this reintroduces the
data-loss bug where clicking a friend's link destroyed your saved map.

**The character sheet's Escape is bound on `#sheetOverlay`, its numbers on
`computeSheet()`.** Same Escape rule as the drill-in (never a second
`document` path). The radar polygon and the printed domain rows must both
come from one `computeSheet()` result per render; a second derivation is the
bucketOf defect wearing a new shirt. The domain fold is `data/sheet.json`.

**`prefs.panel: 'collapsed'` collapses the desktop sidebar.** The toggle is
the `.side-handle` drawer box on the sidebar's own border (not a header
button); the same `#panelToggle` id opens the sheet below 940px and that mode
is deliberately not persisted. After toggling the desktop collapse,
`camera.resize()` must run or the canvas keeps painting at the old width.

**First visit seeds the example map.** `seedStarter` (actions.js) adopts
`data/examples.json`'s first profile only when `hasSaved()` is false, meaning
the profile key has never been written. Clear my map saves an empty profile,
which is a choice, not a first visit, so a reset never re-seeds. A `#p=` link
on first visit wins over the seed.

**Dedication is one universal ladder, defined once.** `atlas.json` declares
`dedication` (Low, Medium, High, Hardcore); `profile.l` holds 1..4 on ANY
markable node, and `reconcile` clamps to that ladder's length, never to
`node.levels`. Per-node `levels` arrays are flavour under the picker now,
nothing more: any surface printing a level label must read `atlas.dedication`.
Old profiles (1..3 on laddered nodes) read as Low..High unchanged, which is
why the `v1` format did not bump.

**The context menu's close policy lives in `onDelegatedClick`, nowhere else.**
Opening (canvas `contextmenu`) selects the node first so the panel and the
menu tell one story; a `level` click inside the menu refreshes it in place,
any other menu action closes it, any click outside dismisses it. Its Escape,
like the tour's, listens on its own element, never on document.

**Escape unwinds in a fixed order:** drill-in, then the trace/search/affinity
ring, then cluster focus, then the selection. Adding a new dismissable state
means choosing its slot in that chain deliberately, not appending a listener.

**`coreLayout` is an orbit around the hub, and that is load-bearing.** The
crafts ring the centre at radius 420; the nearest cluster anchor sits 1009
world units out, so the orbit clears every hull. The `orbit` recipe divides
360 by n, so adding a tenth craft redistributes the ring with no data edit
beyond the node itself.

**Cluster `accent` is a cluster-file key, not a node accent.** `draw.js`
tints the hull wash with it and `draw-nodes.js` tints unaccented faces;
validator check 30 caps node-level accents only, so the cluster key is
uncapped and every cluster carries one.

**`make corpus` and `make validate` are one target under two names.** The alias
is prerequisite-only (`corpus: validate`) so it cannot swallow an exit code.
`CONTRACTS.md` and `DESIGN.md` send readers to `corpus`; the fleet convention is
`validate`.

## Do not touch

- `js/neorgon-*.js` and `css/neorgon-*.css`: vendored kits, regenerated by
  `packages/neorgon-ui/sync-*.sh`.
- `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png`,
  `site.webmanifest`: generated by `packages/neorgon-ui/sync-favicon.sh` from
  this site's hub card. Recolouring the card without regenerating fails smoke
  check 24.
- `docs/atlas/model.json`: output of `.claude/skills/atlas/scripts/scan.py`, not
  a corpus file and not hand-edited.
