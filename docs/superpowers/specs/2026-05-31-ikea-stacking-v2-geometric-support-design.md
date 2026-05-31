# IKEA stacking v2 — geometric support plane + placement semantics

Addendum to `2026-05-31-ikea-stacking-compatible-models-design.md`, correcting a
root-cause bug found in visual review and broadening the model per user request.

## Why this addendum

**Bug (root cause, verified by decoding the MALM GLB):** v1 placed the mattress
*bottom* at `footboardHeight − thickness` (≈0.126 m), anchoring the mattress
*top* to the footboard rail. Decoding the actual GLB geometry shows the
slatted-base/plank surface — where the mattress truly rests — is at **~0.25 m**
(dominant vertex-density bands: 7661 verts @0.24 m, 6658 @0.26 m). The mattress
sat ~12 cm too low. The "footboard = mattress top" premise was an estimate and
is physically wrong (a thick mattress sits proud above the footboard).

**Research (facts, not estimates):** IKEA publishes no slat-surface height and no
authored snap/anchor data in their GLBs (plain geometry + materials). A
third-party source independently measures MALM platform height ≈27 cm, matching
the decoded ~25 cm. Real modular planners (Roomle `ParentDocking`/`ChildDocking`
masks, Configura CET "intelligent components") use **authored per-model snap
points** we cannot scrape. The recommended self-contained route is to **derive
the support plane geometrically from the GLB**, with lightweight category-level
snap semantics.

**Generalization gap (user-flagged, confirmed):** only 2 local products carry
`accepts_categories`:
- MALM frame → mattresses = **vertical** stack (rest on slat plane).
- VOXLÖV dining table → chairs/stools/benches = **around/beside** (seating on the
  floor around the table, NOT on the tabletop). v1's `resolveStack` always
  returns a vertical `supportY`, so it would wrongly stack a chair on the
  tabletop (`tables` falls through to `default: baseH` ≈0.74 m). Broken.

## Combination data model (what the scrape actually encodes)

The scraper captures exactly THREE combination signals — verified by scanning
all local metadata (every `compatibility` object has the single shape
`{accepts_categories, example_products, size}`):

1. **`accepts_categories`** (the "Complete with" module) — category-rule
   compatibility (mattress↔frame, chair↔table).
2. **Sets** ("What's included") — pre-defined bundles → `sets/<key>.json`
   (already handled by `ikeaSets.ts`).
3. **Nothing for modular sections/corners.** VIMLE sofa sections exist as
   separate products, but "section"/"corner" appears only in their *names* — no
   structured mating data. IKEA expresses modular assembly through a separate
   interactive configurator widget the scraper does not crawl, and its GLBs
   carry no connection-point data (per research). So modular assembly is NOT
   derivable from the current scrape and needs a new scraper pass + schema.

Consequence: downloading the full catalog (or a sitemap) would only yield more
examples of signals (1)/(2) — it cannot surface modular data that isn't scraped.
The only catalog-wide signal worth harvesting cheaply is the set of
`accepts_categories` *phrases* (no GLBs needed) to make the classifier robust.

## Decisions (approved)

1. **Support height = geometric slat-plane detection from the GLB** (runtime),
   cached per def. No estimate; no scraper change for this part.
2. **Per-category placement semantics**: each accepted relationship is classified
   VERTICAL / AROUND / MODULAR. The combine path branches on the kind.
3. **Scraper: compatibility-phrase index** — a lightweight no-GLB scraper mode
   dumps `{category, accepts_categories[]}` per product to a small JSON; we
   analyse it to build an evidence-based classifier table (vs. inferring from 2
   local examples).
4. **Scraper: sofa-configurator pass + section-mating schema** — extend the
   scraper to crawl IKEA's modular sofa configurator and emit real section
   connection metadata (mating edges, corner rules) in a new metadata block;
   the app consumes it for MODULAR edge-snap. (Geometric edge-snap is the
   fallback when a section lacks mating metadata.)

## Design

### A. Support-plane detection — `furniture/ikea/supportPlane.ts` (new)

`detectSupportPlaneY(meshes) → number | null`: given the base GLB's loaded mesh
geometry (the same traversal `GltfModel` already does for the footprint), find
the **dominant interior horizontal surface**:
- Histogram triangle area by Y (2 cm bins), counting only near-horizontal faces
  (normal·up > 0.9) whose XЗ lies inside the footprint interior.
- The support plane is the **highest Y band** with substantial horizontal area
  that is **below** the headboard/footboard top (i.e. below ~0.6 × bbox height,
  to exclude the headboard) — the slat plane, not the rails.
- Returns null if no clear plane (caller falls back to a category constant).

Wire it into `GltfModel`'s existing geometry pass: when a def is a stack-capable
base (has `compatibility.acceptsCategories` with a VERTICAL rule), compute and
cache `supportPlaneY` alongside the footprint (`seedGltfSupportPlane` mirroring
`seedGltfFootprint`). A pure `detectSupportPlaneY` keeps the math unit-testable
with synthetic geometry (no GLB decode in tests).

### B. Placement semantics — `furniture/ikea/placementSemantics.ts` (new)

`placementKind(acceptedCategory) → 'vertical' | 'around' | 'modular' | null`:
- VERTICAL: mattresses, bed bases, cushions, seat pads, tabletops-on-legs.
- AROUND: dining chairs, stools, upholstered chairs, dining/storage benches.
- MODULAR: sofa sections/corners (driven by the configurator metadata, not the
  `accepts_categories` rule — see G).
- Unknown → **null** (gate the action off; no wrong combine).

The VERTICAL/AROUND keyword table is built from the **scraper phrase index**
(workstream 3), not guessed from the 2 local examples.

### C. `resolveStack` rework — `furniture/ikea/stacking.ts`

`resolveStack(base, baseVariant, top, topVariant, acceptedCategory)`:
- VERTICAL: `supportY = cachedSupportPlaneY(base) ?? STACK fallback`; topThickness
  no longer subtracted (the bottom rests on the plane). centerOffset as today.
  Returns `{ kind:'vertical', supportY, centerOffset, rotation:0 }`.
- AROUND: returns `{ kind:'around' }` — the caller arranges the seating around
  the base footprint using the EXISTING `arrangeSet` logic (`ikeaSets.ts`:
  chairs/stools around edges, benches along sides), on the floor (no Y lift).
- The accepted-category that matched is available from `resolveCompatible`
  (it's keyed by category), so the trigger passes it in.

### D. Triggers

- Inspector "Place on this" + drag-snap call a single `combineOnto` that switches
  on placement kind: VERTICAL → today's stacked-item path; AROUND → place the
  dragged seating beside the base (one item at the nearest free edge slot) /
  drop a full ring when invoked from a "complete the set" affordance. For the
  drag case, AROUND simply snaps the seat to the table edge facing the drag, on
  the floor, grouped.

### E. Collision / shadow

- Group-mate collision skip (v1) stands. For AROUND, items are floor-standing and
  beside the base, so normal collision applies between non-group-mates.
- Contact-shadow grounding (v1 `y={-liftY}`) stands; AROUND items have liftY 0.

### F. Scraper — compatibility phrase index (workstream 3)

New scraper mode (e.g. `--phrase-index <out.json>`): crawl product pages, emit
`[{group_key, product_name, category, accepts_categories[]}]` with **no GLB
download**. We analyse the distribution of `accepts_categories` phrases to author
the VERTICAL/AROUND keyword table in `placementSemantics.ts` from real data, and
to enumerate which phrases need MODULAR handling.

### G. Scraper — sofa configurator + section-mating schema (workstream 4)

Extend `ikea_model_scraper.py` to detect a modular sofa (series with
section/corner products) and crawl IKEA's sofa configurator widget to capture
**section connection metadata**: per section, its mating edges (which footprint
edge connects to which neighbour type) and corner rules. Emit a new
`modular` block in `metadata.json` (additive; absence = non-modular).
`translate.ts` parses it into the `IkeaGltfDef`; the app's MODULAR placement
snaps a section to a compatible neighbour's free mating edge (geometric
edge-align using the footprint + mating-edge id, share rotation, group). When a
section has no mating metadata, fall back to plain geometric edge-snap of
same-series sections. New schema is versioned/optional so existing imports and
saves stay valid.

## YAGNI / scope

- Geometry-based support plane is decoded at RUNTIME (no scraper change for the
  mattress fix). The two scraper workstreams (3, 4) serve the classifier and
  modular sofas respectively and are separable deliverables.
- No authored-anchor system for non-modular products (unavailable from scrape).
- AROUND for the drag-snap places ONE seat at the facing edge; dropping a full
  ring of seating is the existing Sets path and is not duplicated here.
- MODULAR ships after VERTICAL + AROUND; it depends on the new scraper pass.

## Tests

- `supportPlane.test.ts`: synthetic geometry (a box with a horizontal shelf at
  Y=0.25 plus a tall headboard) → detects 0.25, ignores the headboard top.
  Real-number regression using the decoded MALM bands (~0.25).
- `placementSemantics.test.ts`: mattress→vertical, dining chair→around,
  unknown→null.
- `stacking.test.ts`: VERTICAL mattress rests bottom at the detected plane
  (update the v1 expectation from 0.1257 → plane height); AROUND returns
  `kind:'around'` and does not lift.
- Visual verification (required): re-shoot — mattress top now sits proud above
  the footboard, bottom on the planks; a chair dragged onto the table lands on
  the floor beside it, not on the tabletop.

## Docs

Update CLAUDE.md + README stacking entries: support height is geometric
(slat-plane detection), and combining is vertical OR around per category.
