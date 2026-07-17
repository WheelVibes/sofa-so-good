# Furniture realism program — audit + fix + expand

**Goal (2026-07-17):** go through all existing procedurally generated furniture, make sure
they are as realistic-looking as possible, high fidelity, to scale, follow physics, no
z-fighting. Fix them if not. Once verified, build more furniture variants and expand
categories. Reference: `ikea_optimized/` (3,563 shared-library GLBs, dev-only/licensed —
inspiration + dimension reference ONLY, never bundled; see the dev-gating hard rule).

## Scope

131 parametric defs across 16 def files (`src/furniture/defs/`), rendered by 135
primitives (`src/furniture/primitives/`). Pets (26 defs) shipped 2026-07-17 with per-stage
visual review + an adversarial pass — audit them last, lightly.

## Audit rubric (per def, worst offender first)

1. **Scale** — real-metre dims vs real-world reference (IKEA product dims where a
   comparable exists); footprint honest (`defaultFootprint` vs rendered extent).
2. **Physics / structure** — parts connect (no floating members), supports reach the
   floor, legs inside the footprint, nothing interpenetrates, gravity-plausible.
3. **Z-fighting / artifacts** — coplanar overlaps offset, no clipping; verify at a
   side/profile angle (top-down hides float/sink), and close-up.
4. **Fidelity** — silhouette detail (bevels, reveals, hardware, taper), material
   plausibility (PBR via `furnitureMaterials.ts` helpers, no flat plastic look), texture
   scale. Aim: reads as the real product family at room + closeup range.

## Method

- Per-category audit scenario: place every def of the category in a grid room, capture a
  wide frame + per-item profile closeups (software rendering OK); review every frame
  against the rubric; fix in the same batch; re-screenshot to verify; targeted tests.
- Waves of 2 parallel agents (2 dev-server cap). Commit per wave with CHANGELOG + build
  bump. Full suite once per commit.
- Fixes follow the area rules: pure geometry, real `Material` instances, shared/cached
  textures (bounded LRU + dispose), tier-gated cost, no per-frame allocation.

## Waves

| Wave | Batch A | Batch B | Status |
|---|---|---|---|
| 1 | seating (10) + tables (6) | beds (5) + storage (11) | dispatched |
| 2 | kitchen (5) + appliances (9) | bathroom (7) + laundry (3) + electronics (4) | pending |
| 3 | decor (26) | lighting (5) + textiles (3) + outdoor (5) + kids (5) | pending |
| 4 | others (1) + pets spot-check (26) | — | pending |

## Expansion (after audit)

New variants + categories inspired by `ikea_optimized/` coverage gaps vs our catalog —
candidates: dressers/chests line, wardrobe systems (PAX-like), office (desks/chairs
line-up), kids line, hallway (shoe cabinets, coat racks), curtains/blinds variants,
outdoor set. Scoped after the audit closes (findings inform which primitives generalise
into variants cheaply via paramSchema enums).

## Findings log

(append per wave)

### Wave 1A — seating (10) + tables (6), 2026-07-17

Audit scenarios: `scripts/scenarios/realism-seating-tables.json` (40-item grid, wide +
per-item frames) + `realism-seating-tables-profile.json` (low side-angle profiles for
floor-contact). All items reviewed at room + closeup range; every piece sits flat on the
floor with no float/sink, no z-fighting, no clipping.

Seating:
- `sofa-3seat` — OK (tapered feet grounded, rounded arms/cushions, throw pillows read well).
- `sofa-2seat` — OK (same primitive, narrower).
- `sofa-lshape` — OK (chaise + main run, corner pillows; L-notch footprint correct both sides).
- `dining-chair` — OK (wood + upholstered; legs grounded, inset within seat).
- `office-chair` — OK (task/executive/mesh; 5-star castors on floor, gas-lift + headrest sound).
- `bar-stool` — OK (splayed/pedestal/backed; footrest ring + weighted disc base grounded).
- `bench` — OK (upholstered/storage/slat; legs grounded).
- `armchair` — OK (standard/wingback/tub; barrel shell + wings read, feet grounded).
- `ottoman` — OK (round/square/rect; tufting + feet fine).
- `chaise-lounge` — OK (angled back + bolster on short legs, grounded).

Tables:
- `dining-table-4` — **fixed**: footprint now tracks the `seats` enum. The primitive sizes its
  top off `seats` (4/6/8 → 1.4×0.85 / 1.8×0.95 / 2.2×1.0) but the def's footprint was a fixed
  1.5×0.9 and its round/oval `footprintParts` read non-existent `width`/`depth` props, so a
  6/8-seater kept a 4-seater collision box. Extracted `DINING_SEAT_DIMENSIONS` to
  `defs/diningSeatDims.ts` (shared, pure), drove both the primitive and `footprintParts`
  (rect → seat-sized OBB, round/oval → seat-sized ellipse union) from it, and set the honest
  `defaultFootprint` to the 4-seat 1.4×0.85. Also **fixed** a ~1 cm gap between the round
  pedestal column base and its disc foot. Updated `roundOvalFootprint.test.ts` dining cases to
  drive `seats` in lock-step.
- `desk` — OK (panel/legs/hairpin; hairpin metal legs grounded, drawer knob on front).
- `coffee-table` — OK (rect shelf + legs, round/oval splayed legs + stretcher, grounded).
- `console-table` — **fixed**: `drawers` bar pulls floated ~5 cm in front of the recessed
  drawer band (were placed at `depth/2` while the band front sits at `(depth−inset*2)/2`); now
  proud of the actual drawer front.
- `bar-cart` — OK (2/3-tier glass/wood/marble, brass/black/chrome frame, guard rail, push
  handle, castors all grounded).
- `side-table` — **fixed (minor)**: round 3-leg variant's legs used a raw `meshStandardMaterial`
  instead of the shared `getSurfaceMaterial` (`legMat`) used by the square/drum variants —
  now consistent (+ tier-scaled segment count).

### Wave 1B — beds (5) + storage (11) — 2026-07-17

Audit scenario: `scripts/scenarios/realism-beds-storage.json` (each def placed alone at
the L/D centre, low 3/4 side angle, daylight; variant frames per distinct mode). Scale
cross-checked against `ikea_optimized/` (BRIMNES/PAX depths, BILLY 28 cm, BESTÅ TV-bench
40 cm, dressing-table 100×42, KALLAX cube) — all within family.

- **bed-single / -double / -queen / -king** — OK. SG-standard mattress footprints correct;
  mattress ~0.55 m top, frame/headboard/duvet/pillows/throw grounded and connected across
  flat/paneled/upholstered headboards and standard/platform/storage bases. No float/sink/z-fight.
- **bunk-bed** — OK. Four posts, two grounded platforms + mattresses/pillows, ladder + guardrail all connect.
- **garment-rack** — OK. Feet on floor, uprights+rail+shelf connected, hung garments read.
- **wardrobe-3door** — OK across hinged / sliding (Al-framed bypass panels) / open (rail+shelf+drawer fit-outs). Grounded, no z-fight.
- **dresser** — OK. Drawer grid + knob/bar/recessed handles + legs/plinth all read and ground.
- **shoe-cabinet** — OK (closed flip-fronts + open angled shelves), recessed dark plinth reads as toe-kick.
- **cube-shelf** — OK. Instanced carcass + decorative fills, no back, grounded.
- **bookshelf** — OK (open shelves + books, closed base cabinet); plinth/carcass/books connect.
- **sideboard** — OK across doors/drawers/mixed × tapered/hairpin/plinth; proud fronts read, legs ground.
- **nightstand** — OK (drawers / drawer-shelf / open cubby) on dark legs.
- **vanity** — OK (legs/single/double-pedestal × round/rect mirror × Hollywood bulbs); mirror post bridges top→mirror, grounded.
- **tv-console** — fixed(fronts). Drawer/door faces were positioned `depth/2 − 0.015`, i.e. *buried
  inside the solid carcass* → invisible; the front read as a featureless slab with floating handles.
  Moved fronts proud (`depth/2 + 0.004`), inset from bay edges for a shadow-gap reveal, and split the
  drawer front into two stacked faces per bay. (`primitives/TVConsole.tsx`)
- **coat-rack** — fixed(feet). The three splayed feet were tilted only ~29° off vertical with too-low a
  centre, so their lower ends sank through the floor and the base looked unsupported. Re-modelled as a
  proper tripod (~37° splay, centre raised) so each foot runs pole-base→floor at ~0.26 m radius; thickened
  the pole slightly. (`primitives/CoatRack.tsx`)

Cross-cutting note (not fixed — out of batch scope): the shared `mat:floor-wood-oak` surface (default
`finish` for most wood defs) shows a strong wavy "cathedral"/watermark grain at the furniture texture
repeats under SwiftShader; it reads busy on large vertical panels (wardrobe/bookshelf). It's an
app-wide material used by floors + all wood furniture (also Batch A's seating/tables), so any repeat/
grain retune should be coordinated globally rather than tuned per-def in one batch.
