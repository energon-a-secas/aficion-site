# The Aficion corpus

The taxonomy is the product. It lives here as static JSON and nowhere else.
**No taxonomy entry ever goes inside a `.js` file.** The validator is code, the
corpus is not.

Schema: `docs/delivery/CONTRACTS.md` contract 1, frozen 2026-08-31. This file
does not restate it. It says how to work in here without breaking it.

```
data/
  atlas.json                 vocabularies, the hub, the core-skill band, the cluster index
  clusters/<clusterId>.json  the cluster record, its nodes, its internal edges
  edges.json                 every edge that is not internal to one cluster
  inner/<nodeId>.json        one file per node with an inner tree, fetched on demand
  builds.json                curated builds
```

## Before you commit anything in here

```bash
cd projects/aficion-site
make validate
```

It exits 0, or it exits 1 and names the file, the record and the field. Nothing
runs it for you: it is not in root `make smoke`. Running it is part of the
definition of done for any change under `data/`.

## Adding a cluster

1. **Pick the id.** Lowercase, one word if possible, and it becomes the first
   segment of every node in it. `core`, `hub` and `build` are reserved. The id
   is the file name: `clusters/rail.json` holds `rail.*` and nothing else.
2. **Place it.** Choose an `anchor` inside `atlas.json.world` and at least 240
   world units from every other cluster anchor. Check 26 enforces the distance,
   because two clusters on top of each other is invisible in a text editor.
   Pick a `recipe` (`ring`, `spiral`, `fan`, `arc`, `orbit`) and a `radius`
   between 60 and 600. **You never write an x/y for a member node.** You declare
   the shape; `js/atlas/layout.js` computes the coordinates. That is the seam
   between the two workstreams and it only works if nobody crosses it.
3. **Write the nodes.** 3 to 40 of them. Exactly one carries
   `"class": "notable"` and is named in the cluster's `notable` field; it
   anchors the layout and carries the cluster label. Others may also be
   `notable` and will render large.
4. **Tag from the closed vocabulary.** Every tag must be a key of
   `atlas.json.tags`, maximum 8 per node. A new tag is an `atlas.json` edit, and
   it is expensive at this corpus size: renaming one is a find and replace
   across every cluster file. Check 16 fails on a declared tag no node uses.
5. **Accent sparingly.** At most `max(1, round(0.12 * n))` nodes in a cluster may
   carry an `accent`. An accent that is everywhere is a palette.
6. **Wire it up.** Internal edges go in the cluster file and both endpoints must
   be in it. Everything else goes in `edges.json`: the one `kin` edge from the
   cluster's notable to `hub`, every `draws-on` edge to a core skill, and every
   cross-cluster edge. `edges.json` sees the whole corpus, so a forward
   reference to a cluster written later is safe.
7. **Register it** in `atlas.json.clusters`. Check 3 fails in both directions: a
   file with no entry, and an entry with no file.
8. `make validate`.

### The cross-cluster edge is the product

A `shares-gear` edge with a `note` is the only thing on this map that says
"you already paid for the expensive half of this other hobby". Nothing in a
taxonomy makes gunpla and a lightsaber hilt the same pursuit; one airbrush does.
Write the note. An edge without one is a line; an edge with one is the reason
somebody came.

## `levels` or an inner tree

> **Can a person hold two of them at once?**
> Yes, they are siblings: **inner tree**.
> No, the deeper one implies the shallower: **levels**.

Gunpla grades (HG, RG, MG, PG) are levels: you are at exactly one point on that
axis and the deeper one implies the shallower. Gunpla techniques are an inner
tree: you can do all four or one, in any order. A node may carry both. Most
nodes carry neither, and the top layer must stay dense enough to read as a map,
so do not push content down into inner trees to tidy the surface.

An inner tree is one level deep, by design. An inner node never carries
`inner: true`.

## Adding an inner tree

File name is the node id with the dots intact: `inner/model.gunpla.json`. Set
`"inner": true` on the parent node, or check 4 fails. Its `layout.anchor` is
always `[0, 0]`: an inner tree is laid out in its own local space and drawn
centred on its parent.

## House rules the validator enforces locally

- **No em dash anywhere in the corpus.** Root `make smoke` check 12 sweeps
  living prose; JSON strings under a project's `data/` are exactly where it does
  not look. Check 28 closes that hole.
- **Banned words** in any `blurb`, `note`, `why` or `summary`: powerful,
  seamless, leverages, robust, utilize.
- Labels 1 to 40 characters, blurbs 1 to 220, no leading or trailing
  whitespace, no double space.

## Ids are append-only after P3

The moment somebody shares a URL, the ids in it are a published format. A node
that is removed moves into `atlas.json.retired` and **its id is never reused**.
That is the only thing that lets an old link be reported honestly rather than
misread. Renaming a node id is not a rename, it is a retirement plus a new node.

## Three places contract 1 disagrees with its own worked examples

Reported to `delivery-lead`; no amendment was needed for any of them. The
validator resolves all three by one principle: **the normative rule wins and the
corpus is authored to satisfy it**, except where no content can satisfy the
normative rule, in which case the example proves the intent.

| Where | The disagreement | What this corpus does |
|---|---|---|
| Check 9 vs 1.3 + 1.9 | 1.3's example atlas gives `core.painting` an inner tree. 1.9 forbids an inner node from carrying class `core`. So an inner node of a core skill has first segment `core` and class `node`, which check 9 as written rejects. No value satisfies both. | Check 9 applies to top-layer nodes only. Inner nodes are checked against 1.9's class rule; rule 8 already pins their id shape. `core.painting` keeps its inner tree. |
| Check 24 vs 1.3 | Check 24 caps `radius` at 600. 1.3's example `coreLayout` carries `radius: 1500`. | The rule wins. `coreLayout` ships a compliant radius and the core band is a compact arc at the bottom of the world rather than a wide one. |
| 1.10 rule 1 vs the 1.10 example | A build's steps must span at least two distinct clusters. Core skills have no cluster, and the example `build.pixel-saber` touches only `starwars`. | The rule wins. Every build here crosses two real hobby clusters, and the core steps are on top of that rather than instead of it. |

## Where the clusters sit, and why that is not what the research recommended

Clusters are **subject matter** (`model`, `radio`, `film`), because contract 1.6
and its worked example in 1.13 are written that way and the contract is frozen.

`RESEARCH.md` Q3 recommends the opposite for spatial position: Stebbins' five
hobbyist types plus one, arguing that "putting subject matter in space is what
makes a hobby map look like a directory". That research landed **after** the
contract froze. Rather than ignore it or break the contract, the corpus takes it
as a **placement** rule instead of a clustering rule: the 18 subject clusters are
anchored in an activity-form gradient rather than at random.

| Region of the world box | Clusters | Activity form |
|---|---|---|
| left and lower left | `music`, `cosplay`, `tabletop`, `rail`, `model`, `figure` | makers and tinkerers |
| upper band | `brick`, `retro`, `anime`, `game`, `film`, `video` | watchers, players, producers |
| right and lower right | `maker`, `starwars`, `radio`, `drone`, `astro`, `coffee` | electronics, outdoors, gear |

Moving a cluster is one `anchor` pair in one file, so this is the cheapest thing
on the map to change. The divergence was reported to `delivery-lead`; adopting
Stebbins as the actual clustering axis would be a contract 1 amendment and a
full rewrite of every cluster file.

## Research backing

`docs/delivery/RESEARCH.md` is the source for the build stacks, the licence
ladders, the named failure modes, the coverage check and the cross-hobby
adjacencies. Phase 1 of this corpus was authored while Q3, Adjacency findings,
Verified vs inferred and Could not determine still read "Not yet written"; all
four landed during Phase 2 and the corpus was reconciled against them before
close.

**Carried from research, traceable to a section:**

- the six builds. Five map one-to-one onto Q1's stacks A to E, with Q1's Build D
  split into `build.mesh-node` and `build.hf-station` because Q1 says explicitly
  that conflating licence-free mesh with licensed amateur radio is the mistake
- the stated orders inside those builds, including the two Q1 calls out as
  genuinely irreversible: wiring and running trains **before** ballast and
  scenery, and degreasing resin **before** primer
- the ham licence ladder as `levels` (Technician, General, Extra, with question
  counts from ARRL), and the gunpla grade ladder as `levels`
- the Meshtastic facts: region and modem preset must match the mesh, region is a
  legal envelope, and never power a radio with no antenna attached
- 11 of the 22 pairs in Adjacency findings are in `edges.json` as a single edge
  with a `note`. Items 1, 2, 3, 4, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21 and 22
  are present; 5, 6, 7, 8, 9, 12 and 16 need clusters this corpus does not have
  (homebrewing, aquaria, crochet, origami, juggling, bell ringing, hiking, model
  rocketry) and are the strongest candidates for cluster 19 onward
- `core.hand-tools`' inner tree exists because Adjacency findings names
  `abrasive-grit-progression` a top transversal node present in three of five
  builds while appearing in no hobby taxonomy at all
- Q3's coverage check found 6 of the 16 must-haves absent from every enumerable
  taxonomy and 5 only partial. All 16 are authored here, which means eleven of
  them have no upstream source to check against by construction

**Authored without research backing.** Audit these first if the map ever reads
as arbitrary:

- the `brick`, `coffee`, `game`, `retro`, `music`, `astro`, `drone`, `cosplay`
  and `film` clusters in full, and `tabletop` beyond its overlap with painting
- every cross-cluster edge not listed above
- the `levels` on `core.electronics`, `core.soldering`, `core.photography`,
  `core.3d-printing`, `maker.arduino`, `figure.mini-painting`,
  `starwars.pixel-saber` and `starwars.vintage-figures`

**Deliberately absent.** No blurb states a price. Q2 shows cost is the axis the
existing catalogue already competes on, and Could not determine item 12 says the
airbrush step-change magnitude is unsourced. The two step-changes Q1 does
evidence (airbrush plus compressor, DC to DCC) appear as edges and as prose, with
no number. The widely repeated "60 percent quit in year one" figure is **not
used**; Could not determine item 2 says do not put it in the product.

**Corpus size.** DESIGN.md sets the v1 floor at 240 top-layer nodes across 18
clusters, which this corpus exceeds. RESEARCH.md Q3, which landed later,
estimates a defensible v1 at 600 to 900 nodes total. That is a scope decision for
`delivery-lead`, not something workstream A took on its own; the schema, the
validator and the renderer budget all carry it without change.
