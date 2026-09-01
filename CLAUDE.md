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
| `js/events.js` | 402 | `bindEvents` |
| `js/render.js` | 389 | `buildViewModel`, `paint`, `announce`, `renderDetail`, `bucketLabel` |
| `js/actions.js` | 363 | `commit`, `select`, `toggleNode`, `applyLevel`, `trace`, `openSheet`, `adoptShared`, `seedStarter` |
| `js/atlas/load.js` | 280 | `SCHEMA`, `AtlasError`, `loadAtlas`, `hasInner`, `loadInner` |
| `js/atlas/draw-nodes.js` | 250 | `drawCoreNodes`, `drawPlainNodes`, `drawNotables`, `drawHub`, `drawHalos` |
| `js/panels.js` | 224 | `renderShare`, `renderCompare`, `renderBuildsList`, `renderBuildPanel`, `renderInner`, `renderSharedPrompt` |
| `js/render-sheet.js` | 212 | `renderSheet` (the character sheet view) |
| `js/alloc.js` | 196 | `toggle`, `setLevel`, `computeRoutes`, `nearMisses`, `bucketOf` |
| `js/profile.js` | 178 | `PROFILE_VERSION`, `STORAGE_KEY`, `emptyProfile`, `encode`, `decode`, `saveBackup`, `hasSaved` |
| `js/atlas/layout.js` | 167 | `computeLayout`, `layoutInner`, `boundsOfIds` |
| `js/atlas/draw-edges.js` | 161 | `drawDrawsOn`, `drawBaseEdges`, `drawRoute`, `drawCompareEdges` |
| `js/atlas/camera.js` | 160 | `MIN_ZOOM`, `MAX_ZOOM`, `createCamera` (stage-aware `minZoom` floor) |
| `js/discover.js` | 131 | `suggest`, `startingPoints` |
| `js/atlas/theme.js` | 129 | `withAlpha`, `shade`, `resolveTheme`, `onThemeChange` |
| `js/atlas/draw-labels.js` | 125 | `drawLabels` |
| `js/atlas/draw.js` | 113 | `createRenderer` |
| `js/compare.js` | 112 | `compare`, `compareHeadline` |
| `js/state.js` | 110 | `PREFS_KEY`, `state`, `loadPrefs`, `savePrefs`, `rememberCamera` |
| `js/sheet.js` | 104 | `ensureSheet`, `computeSheet`, `computeTitles` |
| `js/examples.js` | 18 | `ensureExamples` |
| `js/atlas/pick.js` | 85 | `HIT_FLOOR`, `NODE_RADIUS`, `radiusOf`, `buildIndex`, `nodeAt` |
| `js/builds.js` | 69 | `ensureBuilds`, `listBuilds`, `buildProgress`, `applyBuild`, `buildSteps` |
| `js/modal.js` | 65 | `getFocusable`, `openModalEl`, `openModal`, `closeModal`, `onModalKeydown` |
| `js/inner.js` | 57 | `openInner`, `closeInner`, `currentInner`, `normalise`, `innerProgress` |
| `js/utils.js` | 44 | `$`, `rad`, `joinList`, `plural` |
| `js/app.js` | 41 | entry point, must stay under 50 lines |

Vendored from `packages/neorgon-ui/`, never edited in place, refreshed by the
sync scripts: `js/neorgon-header.js`, `js/neorgon-footer.js`,
`js/neorgon-beacon.js`, `js/neorgon-dom.js`, `js/neorgon-persist.js` and the
matching `css/neorgon-*.css`.

## Data

`data/` is the product. 35 files: `atlas.json` (clusters, tags, retired ids),
`edges.json` (typed top-layer edges, every shares-gear edge noted),
`builds.json` (9 curated builds), `clusters/*.json` (18 files),
`inner/*.json` (11 trees), `sheet.json` (the character sheet's six-domain
fold of the nine core crafts, plus the earned profile-title rules) and
`examples.json` (loadable example maps in the shared-link shape). Totals move
with the corpus; `make validate` prints the live census (269 top nodes, 566
top edges, 81 inner nodes as of 2026-08-31). Content is data, never inside a
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
visitor state and nothing warns you. Same for the `#p=` fragment format: a v1
app reading a v2 payload must read what it understands and **refuse to write**,
which is what `js/profile.js` does today. Downgrading somebody's saved map from
a stale tab is the failure that looks exactly like the link having worked.

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
