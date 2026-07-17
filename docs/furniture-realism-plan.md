# Furniture realism program — audit + fix + expand

**PROGRAM COMPLETE (2026-07-17, v0.21.2.79–.87):** audit — all 131 defs verified, 45
defects fixed, structural-soundness harness shipped as a permanent CI gate; expansion —
E1–E4 shipped (12 new primitives, 14 variant families, sectional builder + wardrobe
fit-out system). Wave-by-wave record in the Findings log.

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
   **Attachment is verified, not assumed (2026-07-17 directive):** every component —
   legs to aprons/tops, shelves to carcasses, arms to frames, hardware to fronts —
   must be *properly attached*, not dangling or floating. Verification is TWO-channel:
   (a) visually at closeup joint level, and (b) programmatically via the
   structural-soundness harness (`src/furniture/primitives/structuralSoundness.test.tsx`),
   which renders every primitive headless (@react-three/test-renderer), computes
   per-mesh world AABBs, and asserts the part graph is one connected component
   (ε-inflated AABB adjacency, union-find) AND touches the floor (floor-anchored defs)
   or spans its mount height (mounted/windowBound/doorBound). Runs across ALL defs ×
   default props + each visually-distinct enum mode.
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
| 1 | seating (10) + tables (6) | beds (5) + storage (11) | done (v0.21.2.79) |
| 2 | kitchen (5) + appliances (9) | bathroom (7) + laundry (3) + electronics (4) | done (v0.21.2.80) |
| 3 | decor (26) | lighting (5) + textiles (3) + outdoor (5) + kids (5) | done (v0.21.2.82) |
| 4 | others (1) + pets spot-check (26) | coordinated cross-cutting pass | done (v0.21.2.83) |

## Expansion (after audit)

**Ground rule (licensing).** `ikea_optimized/` is a **dimension + demand reference only** —
licensed, dev-gated, never bundled (see the dev-gating hard rule). Every expansion item below is
a **procedural original inspired by a product FAMILY** (a shoe-bench, a glass-door display
cabinet, a fold-out sofa-bed), sized to real-world/SG norms. **No IKEA design is copied and no
IKEA name (BILLY/PAX/KALLAX/MALM/POÄNG/ALEX/…) ships** — those names appear here purely to name
the demand cluster.

### Coverage map — ours vs IKEA family demand

Our catalog: **131 parametric defs / 16 categories** (seating 10, tables 6, beds 5, storage 11,
kitchen 5, appliances 9, bathroom 7, laundry 3, electronics 4, decor 26, lighting 5, textiles 3,
outdoor 5, kids 5, others 1, pets 26). Most defs already carry a `style`/`shape`/`size`/`seats`
enum — a cheap variant surface (the pets & dining precedents).

IKEA family SKU counts (demand proxy, from folder-name clustering of 3,563 GLBs): table 264 ·
cabinet 160 · wardrobe 115 · lamp 115 · desk 95 · shelving-unit 88 · rug 67 · rack 64 ·
glass-door cabinet 63 · chest-of-drawers 58 · mirror 57 · tv/stand 56 · stool 49 · bench 49 ·
bookcase 47 · side-table 41 · wall-shelf 36 · plant/stand 36 · sofa-bed 25 + day-bed 9 · footstool
22 + pouffe 9 · trolley 20 · swivel chair 18 · bedside 16 · drawer-unit-on-castors 16 · gaming 16 ·
clock 14 · sideboard 12 · corner-sofa 11 · blind 11 · coat/hook 19 · pegboard 8 · changing 7 ·
nesting 7 · dressing-table 6 · cot 5 · plant-stand 5 · loft-bed 4.

**Top-10 gaps (high demand, no/weak procedural counterpart):**

1. **Sofa-bed / daybed** (34 SKUs) — no counterpart; core HDB living/study/guest piece.
2. **Glass-door display cabinet / vitrine** (63) — we have wardrobe/sideboard/bookshelf but no
   glazed display carcass.
3. **Shoe bench / hallway bench with hooks** (bench 49 + shoe 27) — HDB **entry** is a named
   design-guideline zone; we have `bench` + `shoe-cabinet` but no combined entry piece.
4. **Wall/floating shelf variety** (36) — `wall-shelf` exists but lacks floating-shelf / picture
   ledge / corner-shelf modes (all cheap enum adds).
5. **Under-desk drawer pedestal on castors** (16) — home-office staple; `dresser` doesn't do the
   slim mobile pedestal.
6. **Gaming chair + gaming desk** (16) — distinct silhouette from `office-chair`/`desk`; cheap
   enum on both.
7. **Stool variety — step stool / kitchen stool** (49) — `bar-stool` only; a low step/kitchen
   stool is a cheap `type` enum.
8. **Wall coat/hook rail + pegboard** (19 + 8) — HDB **entry/service-yard**; only a freestanding
   `coat-rack` today (wall-mounted organiser missing).
9. **Nesting tables & bar/counter-height table** (7 + high-tables) — cheap `set`/`height` enums on
   coffee/side/dining tables.
10. **Utility / broom tall cabinet + display glass on sideboard** — HDB **service-yard/store**
    storage; no tall utility carcass.

### Prioritized expansion table

Effort: **S** = new `paramSchema` enum on an existing primitive (hours) · **M** = new primitive in
an existing category (day) · **L** = new primitive with novel geometry / a system builder (multi-day).
Ordered by value ÷ effort.

| # | Item | Category | Base / approach | Evidence (family / HDB) | Effort | Key dims (m) |
|---|---|---|---|---|---|---|
| **Tier 1 — new enum on an existing primitive (cheapest, ships fast)** |
| 1 | Floating shelf / picture ledge / corner shelf | decor | `wall-shelf` `style` enum | wall-shelf 36 | S | 0.6–1.2 w × 0.18 d |
| 2 | Nesting table set (2–3 pcs) | tables | `coffee-table`/`side-table` `set` enum | nesting 7 | S | nested Ø0.4–0.5 |
| 3 | Bar / counter-height table | tables | `dining-table-4` `height` enum | bar-table demand | S | 0.6×0.6 × 0.9–1.05 h |
| 4 | Step / kitchen stool | seating | `bar-stool` `type` enum | stool 49 | S | 0.35 × 0.45 h |
| 5 | Gaming chair | seating | `office-chair` `style: gaming` | gaming 16 | S | 0.7 × 1.3 h |
| 6 | Swivel accent / tub chair (swivel base) | seating | `armchair` swivel-base enum | swivel 18 | S | 0.75 × 0.75 |
| 7 | Under-desk mobile drawer pedestal | storage | `dresser` `castors`+`slim` enum | drawer-unit 16 | S | 0.4 × 0.5 × 0.6 h |
| 8 | Bedside size variants (narrow/wide) | storage | `nightstand` `size` enum | bedside 16 | S | 0.4–0.6 w |
| 9 | Pouffe / knitted footstool | seating | `ottoman` `style: pouffe` | footstool 31 | S | Ø0.45 × 0.4 h |
| 10 | Plant stand (raised pot) | decor | `potted-plant` `stand` enum / small prim | plant-stand 5 | S | Ø0.3 × 0.5 h |
| 11 | Corner / mirror-door wardrobe | storage | `wardrobe-3door` `layout`+`door: mirror` | wardrobe 115 | S | 1.0–2.4 w × 0.6 d |
| 12 | Gaming desk (cable-tray, riser) | tables | `desk` `style: gaming` enum | desk 95 / gaming | S | 1.2–1.4 w × 0.75 h |
| **Tier 2 — new primitive in an existing category** |
| 13 | Sofa-bed / daybed | seating | new prim (fold-out back, storage base) | sofa-bed 34 · HDB guest | L | 1.9–2.0 × 0.9 |
| 14 | Glass-door display cabinet / vitrine | storage | new prim (glazed carcass, lit shelves) | glass-door 63 | M | 0.8–1.2 w × 1.8 h |
| 15 | Shoe bench with cushion + hooks | storage | new prim (bench + open shoe cubbies) | bench 49 + shoe · HDB entry | M | 0.9–1.2 w × 0.85 h |
| 16 | Wall coat/hook rail | storage | new prim (wall board + pegs/hooks) | coat/hook 19 · HDB entry | M | 0.6–1.0 w |
| 17 | Pegboard organiser | storage | new prim (board + shelf/hook accessories) | pegboard 8 | M | 0.6–1.0 w |
| 18 | Tall utility / broom cabinet | storage | new prim (full-height single-door + shelves) | HDB service-yard/store | M | 0.4–0.6 w × 2.0 h |
| 19 | Recliner armchair | seating | new prim (reclined back + footrest) | recliner/swivel demand | M | 0.85 × 1.0 |
| 20 | Wall-mounted fold-down / floating desk | tables | new prim (wall-anchored, `mounted`) | desk 95 · HDB study corner | M | 0.9–1.1 w × 0.75 h |
| 21 | Loft / cabin bed (kids) | kids/beds | new prim (raised platform + ladder + desk void) | loft-bed 4 · HDB space-save | L | 0.9–1.4 × 1.6 h |
| 22 | Trestle / adjustable-leg work desk | tables | new prim (trestle legs) | desk/trestle | M | 1.2–1.6 w |
| 23 | TV media lowboy (long, drawers+open bay) | storage | new prim OR `tv-console` `style` enum | tv 56 | M | 1.6–2.0 w × 0.45 h |
| 24 | Ottoman storage bench (blanket box) | storage | new prim (lift-lid upholstered box) | footstool/bench | M | 1.0 × 0.45 × 0.45 h |
| **Tier 3 — larger lines / configurable systems** |
| 25 | Modular sectional / corner-sofa builder | seating | parametric-type or multi-module def | corner-sofa 11 + modular 24 | L | per-module 0.9 |
| 26 | Modular wardrobe system (PAX-like) | storage | extend `parametric` type (wardrobe) w/ fit-outs | wardrobe 115 + modular | L | up to 2.5 w × 2.36 h |
| 27 | Bay-window daybed / window bench | seating | new prim (bench + bolsters, condo bay window) | day-bed 9 · HDB/condo bay | M | 1.4–2.0 w × 0.45 h |
| 28 | Highchair / cot-bed convertible (kids) | kids | `high-chair`/`crib` size+convert enums | cot 5 / changing 7 | M | — |
| 29 | Outdoor lounge/dining set (coordinated) | outdoor | new prims (bistro set, corner lounge) | outdoor family | M | — |
| 30 | Pendant-cluster / multi-lamp ceiling | lighting | `ceiling-light`/`pendant` `arrangement` enum | pendant 29 + lamp 115 | S | drop 0.4–1.2 |

### Proposed wave structure (implementation)

Same cadence as the audit: **2 parallel agents (2 dev-server cap)**, one commit per batch with
CHANGELOG + build bump, full suite once per commit, **a scenario capture per batch** (grid room +
per-item profile closeups) reviewed against the audit rubric (scale/physics/z-fight/fidelity) plus
the structural-soundness harness (every new primitive/enum mode must pass the connected-component +
floor-touch assertions). Flag policy (corrected 2026-07-17 to match repo precedent): catalog **content** — new enum
variants and new defs inside existing categories — is NOT individually flag-gated (flags gate
features/surfaces; the pets flag gated a whole new category+tab, and parametric TYPES like
kitchen-run carry flags). E1–E3 items therefore ship un-flagged like every other catalog def.
E4's configurable **systems** extend the `parametric`/configurator types and DO get flags with a
`tier` per the src/furniture/CLAUDE.md parametric-type checklist, tested in both modes.

| Wave | Batch A | Batch B | Rationale |
|---|---|---|---|
| E1 | Tier 1 rows 1–6 (shelf/nesting/bar-table/step-stool/gaming-chair/swivel) | Tier 1 rows 7–12 (pedestal/bedside/pouffe/plant-stand/wardrobe-variant/gaming-desk) | All pure enum adds on audited primitives — fastest value, validates the enum→footprint/structural pipeline before new geometry |
| E2 | Rows 13–14 (sofa-bed **L**, display cabinet) | Rows 15–18 (shoe-bench, hook-rail, pegboard, utility cabinet) | HDB **entry + service-yard** cluster; Batch A carries the one L so batches stay balanced |
| E3 | Rows 19–22 (recliner, fold-down desk, loft bed **L**, trestle desk) | Rows 23–24 + 27 + 30 (media lowboy, storage bench, bay-window daybed, pendant cluster) | Remaining Tier-2 new prims + the two cheap tail items |
| E4 | Row 25 (sectional builder **L**) | Row 26 (wardrobe system **L**) + rows 28–29 | Configurable systems (extend the `parametric` type + scenario ladder per the furniture CLAUDE.md); slot last, largest effort |

Re-scope after E1: the enum work will reveal which "M" new-primitive rows can collapse into an
enum on a Tier-1 primitive (e.g. media lowboy → `tv-console` style, plant stand → `potted-plant`).

## Findings log

(append per wave)

### Structural-soundness harness — 2026-07-17

Built the programmatic attachment harness (rubric point 2): a pure graph helper
`src/furniture/primitives/structuralSoundness.ts` (ε-inflated AABB adjacency →
union-find connected components + floor-contact, unit-tested in
`structuralSoundness.unit.test.ts`) driven by `structuralSoundness.test.tsx`,
which renders EVERY parametric def headless via **@react-three/test-renderer**
(added as a devDependency, v9.1.0 — matches @react-three/fiber 9 / React 19),
extracts each mesh's world-space AABB (InstancedMesh decomposed per instance via
`instanceMatrix`), and asserts (a) one connected component and (b) floor contact
for floor-anchored defs. Covered with default props **and** the first structural
enum's modes (≈264 cases, ~12 s). **ε = 8 mm** — abutting parts with a sub-mm
reveal still read as attached, but every real float found (19–75 mm) fails; 8 mm
sits below the smallest real defect and above modelling noise. Canvas 2D is
stubbed (happy-dom has none) so the procedural texture generators run; the
`performance` tier + `showCeilingFixtures` are set so no primitive needs real GL
or hides its body. Meshes are duck-typed via `.isMesh`/`.isInstancedMesh` (the
test-renderer resolves a separate `three` instance, so `instanceof` fails).

**Real attachment bugs found + FIXED** (pure-geometry, safe categories; harness
re-run green after each):
- `bar-cart` (tables) — the top guard-rail rotation was swapped, so the back/side
  rails pointed the wrong way (along depth instead of spanning the edge); and the
  push handle floated ~2 cm above the frame. Fixed the rail axis→rotation mapping
  and mounted the handle on two short stems rising from the back corner posts.
- `coffee-table` (tables, round/oval mode) — the single centre stretcher sat at
  z=0 and reached no leg; replaced with an H-stretcher (two side rails + centre
  bar) tying all four splayed legs.
- `office-chair` (seating, esp. mesh mode) — the backrest floated ~2.5 cm above
  the seat; added a back-support bracket anchoring the back to the seat.
- `bench` (seating, slat mode) — 4 slats + 4 legs were all disconnected (slats
  floated 3 cm above the legs); added two side rails on the leg tops that tie the
  legs together and carry the slats.
- `outdoor-chair` (outdoor) — the slatted back floated behind the seat with no
  post; added a reclined back stile (matching the −0.18 rad slats) rising from the
  rear leg.
- `high-chair` (kids) — the tray floated ~7 cm off the seat; added two tray
  mounting arms from the seat sides.
- `changing-table` (kids) — the top guard rails floated ~4 cm above the top with
  no posts; added four corner posts.
- `crib` (kids) — the mattress floated (no base was modelled); added a solid
  mattress-base board spanning to the frame.
- `cube-shelf` (storage) — decorative storage boxes floated centred in their
  cubbies; reseated them on the shelf floor.
- `garment-rack` (storage) — hung garments floated ~3 cm below their hanger hooks;
  raised the garment shoulders to meet the hooks/rail.
- `wardrobe` (storage, open mode) — the hanging rail stopped ~3 cm short at each
  end, leaving the rail + garments floating clear of the carcass; extended it to
  socket into the side wall + divider.
- `floor-lamp` (lighting, arc mode) — the bulb glow disc hung 2 cm below the shade
  (arc offset differed from the pole case); tucked it up into the shade mouth.
- `cove-light` (lighting) — the concealed LED strip floated in the trough; extended
  it to abut the lip fascia.
- `wall-sconce` (lighting) — the "arm" was a vertical stub that didn't bridge the
  backplate to the shade; made it a horizontal spar spanning backplate→diffuser.
- `wall-tapestry` (textiles) — the panel hung ~1.6 cm below its dowel; raised the
  panel top to the dowel line.
- `ceiling-light` (lighting, linear mode) — a central round rose left the ±0.45 m
  drop cords (and the whole bar) hanging off nothing; gave the linear style a wide
  canopy bar spanning both cords.

**Deferred findings (real gaps, not fixed here — owned by another concurrent wave
or the light-touch pet audit; each is an explicit `KNOWN_DISCONNECTED` entry with
this reason so the harness stays green until fixed with visual verification):**
- `shower` (bathroom wave) — riser rail / head / mixer are wall-mounted fittings
  that attach to the absent wall, not the tray; split into separate components.
- `bathtub` freestanding (bathroom wave) — basin/feet split into two components.
- `drying-rack` (laundry wave) — the hanging bars don't reach the two A-frame ends.
- `bird-cage` (pet audit) — interior perch dowels fall ~2–7 cm short of the bars
  and the tripod feet dip below the floor.
- `staircase` L-shape (staircase-model pass) — the turn produces AABB-separable
  flights/railing at the landing (straight/U/spiral are fine).

**Intentional multi-piece (`KNOWN_DISCONNECTED`, not bugs):** `curtains` (rod +
two draped panels), `roller-blind` venetian (individual louvre slats), and
`cat-wall-steps` (separately wall-mounted steps).

**Surface-/wall-mounted (`FLOOR_EXEMPT`, connected but render off the floor):**
`microwave`, `monitor`, `table-lamp`, `tabletop-decor` (all placed on a surface),
`fireplace` wall style, `bathroom-sink` wall-hung, `flatscreen-tv` wall mount —
their floor-standing sibling modes are still floor-asserted.

#### Deferred findings resolved — 2026-07-17 (owning files now free)

All five deferred `KNOWN_DISCONNECTED` findings were genuine geometry gaps (none
"by design") and have been **FIXED** in their primitives; their harness entries
were removed so each is asserted like every other def. Harness re-run: all five
defs + every one of their structural-enum modes now report **1 connected
component** (plus floor contact for the floor-anchored ones). `tsc --noEmit`
clean; Biome clean on all touched files.

- `shower` (`primitives/Shower.tsx`) — the riser rail / mixer / head were floating
  in the −X/−Z corner, attached only to an absent wall. **Fixed:** extended the
  riser rail DOWN into the tray (y 0.05, embedded in the 0–0.08 m tray) so the
  plumbing column is grounded + tied to the tray, and added a short diagonal
  shower-head arm bridging the riser top to the head (was hanging ~4–8 cm clear).
  Whole shower is now one grounded assembly in both `corner` and `walkin` modes.
- `bathtub::freestanding` (`primitives/Bathtub.tsx`) — the deck mixer tap sat at a
  fixed inset (`width/2 − 0.12`) that floated ~2.9 cm inboard of the thinner
  freestanding rim wall (wallT 0.07 vs built-in 0.09). **Fixed:** anchored the tap
  group over the rim-wall top (`width/2 − wallT/2`) so the stem overlaps the rim
  in both styles (built-in was previously connected only marginally, at exactly ε).
- `drying-rack` (`primitives/slatLayout.ts` `dryingRackCylinders`) — NOT a harness
  InstancedMesh artifact (the per-instance AABB decomposition was correct). The
  three middle drying bars ran along X (parallel to the two end frames) at
  intermediate Z, touching neither frame, so they floated as separate components.
  **Fixed:** the two end bars became explicit top rails (run along X, tie each
  frame's legs), and the three drying bars now run along **Z**, frame-to-frame,
  spanning the full `RACK_SPREAD` so both ends meet the top rails — matching the
  Wave-2B review's stated intent ("bars span the two frames"). Still 11 rods / one
  `InstancedCylinders` draw call (instancing NOT regressed); `slatLayout.test.ts`
  bar-layout assertions updated to the corrected spanning geometry.
- `bird-cage` (`primitives/BirdCage.tsx`) — real gaps, not epsilon-marginal: the
  tripod feet applied their splay tilt about Z regardless of azimuth, so a foot
  leant sideways, detached from the pole, and dipped ~9 cm below the floor; and the
  perch dowels (length `dia*0.75`) fell ~2–7 cm short of the cage bars. **Fixed:**
  rebuilt each foot inside a Y-azimuth group running pole-base→floor (grounded at
  y=0, socketed into the pole), made the stability ring horizontal, and lengthened
  the perches to `dia*1.02` so their ends socket into the bars. Verified across
  `stand`/`tabletop` mounts and `dome`/`rect` shapes.
- `staircase::lshape` (`primitives/staircaseModel.ts` `buildLShape`) — the turned
  second flight was passed `rot = π/2` ON TOP of `axis:'x'`, which already swaps the
  box dims + marches the run along X. The redundant rotation spun every
  already-correct box 90°: the wide treads still overlapped enough to read connected,
  but the thin railing posts + handrail segments were spun perpendicular to the run,
  so each post+rail pair broke into its own component (6 fragments). **Fixed:**
  `rot` stays 0 for the turned flight (it also corrects the treads' visual
  orientation). `staircaseModel.test.ts`'s "second flight rotated 90°" case rewritten
  to assert the turn via the swapped tread dimensions + perpendicular runs (rot=0),
  which is the actual mechanism. Straight/U/spiral were already connected.

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

### Wave 2A — kitchen (5) + appliances (9) — 2026-07-17

Audit scenario: `scripts/scenarios/realism-kitchen-appliances.json` (each def alone at the L/D
centre, low 3/4 side + front + tall/ceiling cameras; variant frames per finish / sink / hob /
integrated / mount / screen mode). Scale cross-checked vs `ikea_optimized/` (KNOXHULT base cabinet
80×85, METOD 60×80, EKET 35-deep uppers) + standard appliance dims (fridge 70, DW/oven/DW 60×60,
washer/DW 85 high) — all within family. **Attachment verified per def** (closeup frames + primitive
coordinate math): every joint overlaps/abuts, nothing floats.

Kitchen:
- **wall-cabinet** — OK (slab/shaker × wood/painted/gloss). Mounted carcass; door fronts proud (+3 mm),
  handles overlap the door face, shaker rails proud of the door — joints verified.
- **range-hood** — **fixed(taper)**. The canopy→duct transition was a 4-segment cylinder reading as a
  corner-forward *diamond*; rotated 45° + widened to a proper trapezoidal frustum (flat faces
  front/back/side). Joints: canopy top = taper bottom (abut), taper top overlaps duct bottom, grease
  lip on canopy underside. steel/matte/gloss all read. (`primitives/RangeHood.tsx`)
- **stove** — OK. Oven body + cooktop abut at 0.85 m; burners on the cooktop, front knobs on the back
  lip, door window/handle proud of the front. Grounded.
- **kitchen-island** — **fixed(sink)**. The sink was a solid box interpenetrating the worktop + a plain
  faucet stick; rebuilt as a worktop **frame around the cutout** + a **recessed stainless basin**
  (drops into the cabinet cavity, rim just below the surface) + a curved-spout faucet (mirrors the
  counter). Plain/hob paths unchanged (full slab). Joints: worktop bottom = cabinet top, fronts proud,
  faucet base on the worktop surface, basin walls non-coplanar. (`primitives/KitchenIsland.tsx`)
- **kitchen-counter** — OK (slab/shaker/drawers × solid/marble/concrete/wood; ±sink). Recessed basin +
  curved spout + tiled backsplash; worktop on cabinet, backsplash abuts worktop top. Wood finish shows
  the shared oak-grain watermark (Wave-1 cross-cutting note, not per-def).

Appliances:
- **microwave** — OK (gloss/steel/matte). Body + glazed door + control strip + handle, all proud; sits
  at `surfaceHeight` (a counter-top item — "floats" alone by design).
- **refrigerator** — OK (steel/matte/gloss). Two-door body + seam + left bar handles (1 cm standoff).
  Grounded.
- **tv-wall** (FlatscreenTV, shared w/ monitor) — OK (wall/stand × 43-75" × screen off/on/content). Wall:
  panel flush to wall. Stand: foot→neck→panel all overlap (neck bridges foot top→panel bottom). Grounded.
- **aircon-unit** — OK. Body + inset fascia + bottom louvre; mounted high. White plastic (correctly NOT
  routed through `applianceBody`).
- **standing-fan** — OK. Weighted base→pole→motor housing→hub+blades→wire guard all overlap; base grounded.
- **wine-cooler** — **fixed(glass front)**. The solid opaque carcass occluded the whole interior → the
  cooler read as a featureless **black box**. Rebuilt the carcass as an **open-front shell** (back + 4
  sides, no front panel) so the tinted glass reveals **chrome wire shelves + resting bottles + the LED
  glow** — now unmistakably a wine cooler. Joints: shell pieces abut at edges, shelves/bottles inside the
  shell, glass on the front, handle proud. (`primitives/WineCooler.tsx`)
- **built-in-oven** — OK. Body + recessed glass door + top fascia + knobs + full-width bar handle;
  grounded (built-under) or eye-level via `mountHeight`.
- **dishwasher** — OK (visible/integrated × steel/matte/gloss). Body + proud door + recessed bar handle +
  control strip (dials + status LEDs, hidden when integrated). Grounded.
- **ceiling-fan** — OK (2-5 blades). Downrod→motor→light + blades attach to the hub; mounted near ceiling.

Cross-cutting note (not fixed — out of batch scope): **appliance finish-swap-in-place** leaves a stale
white body. `shared.tsx:applianceBody` sets the steel material on the mesh `material` prop but the
non-steel material as a `<meshStandardMaterial>` **child**; R3F doesn't reconcile a mesh switching
between prop-material and child-material (it resets to drei's default white). Placing an item *fresh*
renders correctly (verified); only an **in-place** finish change (inspector, steel↔matte/gloss) shows
it. Affects all 8 steel-bodied appliances across BOTH batches (2B's WashingMachine too), so it belongs
in a coordinated MAT-004b fix (e.g. `key` the body mesh on finish-type to force a remount, or always
render the body material as a child) rather than a per-def patch. The audit scenario sidesteps it by
placing each variant under a unique item id.

### Wave 2B — bathroom (7) + laundry (3) + electronics (4) — 2026-07-17

Audit scenario: `scripts/scenarios/realism-bath-laundry-electronics.json` (each def placed alone at the
L/D centre; low 3/4 side for floor items, taller/mid frame for mounted + a top-down frame for the tub
basin; variant frames per distinct enum mode — GPU/High tier). Scale cross-checked vs standards (toilet
seat ~0.40–0.45 m, basin rim ~0.85 m, tub 1.6×0.75×0.56, TV diagonal→16:9 width). Attachment verified
per rubric-2 (closeup + coordinate math).

Bathroom:
- **toilet** — fixed(seat+lid, cistern, attachment). The seat ring torus had **no X-rotation** so it stood
  *vertical* — a white arch/handle over the bowl (both close-coupled + wall-hung); rebuilt as a FLAT
  horizontal seat ring + a closed lid disc on the rim → reads as a normal WC. Also moved the cistern
  forward/down (`z −0.20`, `0.31–0.73 m`) so it overlaps + rests on the bowl's back shelf (was cantilevered
  with a marginal contact) and put the flush button on the cistern top. Joints: pedestal→bowl overlap ~5 cm,
  bowl→seat/lid abut, cistern→bowl overlap in Z. (`primitives/Toilet.tsx`)
- **bathroom-sink** — fixed(tap contact + metal). The shared mixer base sat at `basinY+0.13` (bottom ≈0.95 m)
  → floated ~4 cm ABOVE the vanity counter (0.82 m); lowered/lengthened it (bottom ≈0.78 m) so it sits ON the
  deck for pedestal/vanity/wall-hung alike, and routed tap + bottle trap through the shared brushed-metal
  material (`metalLeg` satin) so they read as light steel not a black mirror. Pulls left as small hardware.
  Joints: pedestal→basin overlap ~8 cm, tap base→deck embed. (`primitives/BathroomSink.tsx`)
- **bathtub** — fixed(basin recess). Was a solid capped `RoundedBox` — its flat top face at `h` OCCLUDED the
  water plane below, so the tub read as a featureless block with a raised rim ridge and NO visible basin.
  Rebuilt as a rounded base body (basin floor) + four rim walls enclosing an OPEN top, with the water surface
  recessed inside → real basin visible at every angle. Deck mixer base sits on the rim; freestanding feet
  bridge base→floor; fittings via `metalLeg`. (`primitives/Bathtub.tsx`)
- **shower** — fixed(metal). Fittings (drain/frame/riser/head/mixer) routed through shared `metalLeg`
  (stainless) so chrome reads as brushed steel; glass panels + tray + wall-mounted riser/head/mixer all
  connect (glass foot meets tray, frame bar on panel top). No z-fight. (`primitives/Shower.tsx`)
- **towel-rail** — OK. Chromed bar on two brackets (bracket bridges wall→bar), draped towel over the bar; mounted at height.
- **towel-ladder** — fixed(towel thickness). Draped towels were `0.006 m` thick → vanished edge-on; thickened
  to `0.022 m`. Posts→floor, feet cross-bars under posts, rungs span between posts; chrome/black/brass/wood via
  shared metal/wood material. (`primitives/TowelLadder.tsx`)
- **bathroom-mirror** — fixed(round frame orientation). The round variant's frame torus was rotated
  `[π/2,0,0]` → it lay FLAT as a horizontal halo cutting through the pane instead of ringing it; removed the
  rotation so the ring faces the room (+Z) around the pane. Rect/frameless already fine; frame/backing embed
  into the wall plane. (`primitives/Mirror.tsx`)

Laundry:
- **drying-rack** — OK. A-frame splayed legs→floor, foot rails, top drying bars span the two frames; single
  `InstancedCylinders` draw call preserved (not regressed).
- **laundry-hamper** — OK (round rattan / rect canvas × liner over rim × optional lid); body→floor, liner + lid stack on the rim.
- **washing-machine** — OK. Steel/matte/gloss body, recessed door glass + door ring on the front face, control panel + knob; body→floor. Front-load reads well.

Electronics:
- **flatscreen-tv** — OK (43/55/65/75 × stand/wall × screen off/on × content). Panel↔neck↔foot connected
  (neck bottom overlaps foot, panel bottom overlaps neck); lit screen self-illuminates + blooms. *Note (not
  fixed — deliberate):* `defaultFootprint` is fixed at the 55" size and does not track the `size` enum, so a
  75" (~1.66 m wide) under-reports its collision box. Unlike Wave-1's dining table (whose footprint IS its
  collision core), a TV lives on a console/wall where the box matters less; deferred to avoid the enum→bbox
  enclose-invariant churn (would need `defaultFootprint` grown to the 75" max, hurting small-TV room-fit).
- **soundbar** — OK. Slim wall-mounted enclosure (back meets wall) + cloth/metal grille front + LED; optional wireless sub is a separate floor block (correctly standalone).
- **floor-speaker** — OK (matte/wood × 1–3 woofers). Plinth→floor, cabinet on plinth, driver cones on the front baffle; silhouette good (dark cones low-contrast on black baffle, minor).
- **monitor** — OK (24/27/32 × off/on × content). Base→stem→panel connected; rests at desk height.

Cross-cutting (shared with Wave 2A/1): chrome fittings read dark under the dark-floor IBL — addressed here by
routing taps/fittings through `metalLeg` (satin/stainless) per the program's METAL-LEGS guidance; still
somewhat reflective on High but no longer black. The `mat:floor-wood-oak` busy grain (Wave-1 note) also shows
on the vanity cabinet — left for the coordinated global retune.

### Cross-cutting fixes (post-wave-2)

Two targeted fixes in already-committed categories (unit/code-verified this round; no dev server —
flagged below for a later visual pass):

- **MAT-004b appliance finish-swap reconciliation (`shared.tsx` + 8 appliance primitives).** The old
  `applianceBody`/`applianceBodyMeshProps`/`ApplianceBodyMaterial` trio put the steel material on the
  body mesh's `material=` PROP but rendered matte/gloss as a `<meshStandardMaterial>` CHILD. Swapping
  steel↔matte in the inspector crossed that prop↔child boundary and R3F left a stale white body.
  Replaced the trio with a single-representation resolver `applianceBodyMaterial(color, finish)` that
  returns ONE cached `Material` for every finish (steel → `getMetalMaterial`; matte/gloss →
  `getSolidMaterial` with the byte-identical `applianceFinish` roughness/metalness), always set on the
  `material=` prop — so a swap is a plain instance change on one mesh and reconciles cleanly. MAT-004b
  invariants preserved (shared cached instances, no per-instance materials, glass/panels/handles
  untouched); no intended visual change (painted params identical). Regression tests in
  `primitives/applianceBody.test.tsx` (helper: steel/non-steel/cache/flat-tier/exact-params + a
  steel→matte instance-change assertion; element-tree walk proving the body material is a `material=`
  prop that changes instance on swap and is never a child; a `@testing-library` render+rerender harness
  asserting the material prop actually changes). *Later visual check:* open an appliance inspector,
  toggle finish steel↔matte↔gloss and confirm the body repaints (no white ghost) on all tiers.
- **TV footprint doesn't track the `size` enum (`electronics.ts` flatscreen-tv, `appliances.ts`
  tv-wall).** Same class as the committed dog-crate/aquarium-stand fix: enums can't feed
  `footprintParams`, so pinned `defaultFootprint` to the LARGEST size (75" → 16:9 from a 1.905 m diag →
  w ≈ 1.66 m; stand-top ≈ 1.03 m, wall panel ≈ 0.94 m) — a conservative over-report, never an
  under-report that lets a 75" panel clip a wall/neighbour. `flatscreen-tv` → `{ w: 1.66, d: 0.25,
  h: 1.04 }`; `tv-wall` (mounted, less collision-critical) → `{ w: 1.66, d: 0.1, h: 0.94 }`, with the
  same comment style as pets.ts. No test asserted exact TV dims (autoArrange reads footprints
  dynamically). This supersedes the deliberate-defer note in the flatscreen-tv findings above.

### Wave 3A — decor (26), 2026-07-17

Audit scenario: `scripts/scenarios/realism-decor.json` (54 frames — every def at the L/D area;
`noClip` surface props placed ON a coffee-table host, mounted/wall items at their `mountHeight`
against the wall, floor items at a low 3/4; variant frames per distinct enum mode) +
`realism-decor-suspects.json` (close cameras on the four suspects). **Attachment (rubric-2) verified
two-channel:** the structural probe reported **comps=1 and gap=0.0 mm for ALL 26 defs** (one
connected component, no dangling/floating parts), and the closeups confirm it visually; the
asserting `structuralSoundness.test.tsx` stays green with the fixes. Scale cross-checked vs
`ikea_optimized/` where comparable (fluted TV wall, room divider, floor vase, wall shelf/mirror).

- **feature-wall** — OK (fluted half-round ribs / slat battens on a backing board; instanced, flush,
  floor-to-ceiling). Attached: ribs proud of the shared backing board.
- **room-divider** — OK across slat / fluted / grid; slim floor frame (bottom rail on the floor),
  battens/lattice inside the frame. Attached. (Fluted panel shows the shared oak watermark — X-cut.)
- **tabletop-decor** — **fixed(noClip)**. Was the ONLY surface-styling prop def missing `noClip` (its
  book-stack/candle/tray siblings all have it) — so it participated in floor collision AND the
  structural probe read it as floating (anchored, minY 420 mm). Added `noClip: true`; now consistent,
  non-anchored. Geometry itself (tray + books + vase + sprig) reads fine on a table. (`defs/decor.ts`)
- **roller-blind** — OK (roller fabric panel / venetian slat stack). Cassette→fabric/slats→weighted
  bottom rail; the venetian bottom slats looked scattered in the wide frame but the closeup shows a
  clean stack + rail (the "splay" was the full 1.7 m drop foreshortened) — no fix.
- **hanging-plant** — OK. Three ceiling cords → pot rim, mounded crown on the pot, trailing
  cone-vines below; cords reach the mount height. Attached.
- **floor-vase** — OK (tall taper / round belly / wide × pampas / branch / empty). Stems insert into
  the neck; two-cylinder body grounded. Round-belly has a slightly hard mid-shoulder (minor).
- **wall-mirror** — OK (round / arch / rect). Frame + mirror pane proud of the frame face, wall-flush.
- **wall-art** — OK (thin / gallery / box / frameless × solid/gradient/stripes/blocks/chevron). Print
  proud of the frame; frameless gets a wrapped-canvas slab. Attached to the wall plane.
- **wall-clock** — OK (round / square × quarter/all-hour markers). Rim+face+markers+10:10 hands+cap,
  wall-flush. Attached.
- **wall-shelf** — OK (bracket / floating / two-tier). Plank against the wall + L-brackets under it
  (or hidden cleat / end panels for two-tier). Attached.
- **floor-mirror** — OK (leaning rect / round cheval). Rect pivots about its floor base; cheval ring
  overlaps its side posts (ring tube r+0.03 vs post inner r+0.025) on a foot-bar tripod. Grounded.
- **aquarium** — **fixed(glass+water)**. The glass shell (opacity 0.18) and tinted water (0.42) both
  washed out to near-invisible against the bright window, so the tank walls vanished and only the
  black top rim showed — reading as a black cabinet with a **floating lid over an air gap**, not a
  filled tank. Raised the water opacity (0.42→0.7) and the glass opacity (0.18→0.30, metalness 0 to
  kill the dark mirror-black front) + filled a touch higher; the glass box now reads at every tier,
  enclosing the gravel/plants and connecting the stand to the rim. (`primitives/Aquarium.tsx`)
- **potted-plant** — OK (bush / snake / palm / fiddle × tapered/cylinder/square pot × S/M/L). Trunk/
  leaves rise from the soil, canopy blobs attached; grounded.
- **fireplace** — OK. Wall style: linear firebox + glowing flame/ember bed, wall-mounted (floats by
  design — it's the wall variant). Console style: hearth+surround+mantel reach the floor. *Judgment
  call (not fixed):* the def models BOTH a wall-mounted and a floor variant, so a single static
  `mounted` flag can't be right for both — left floor-anchored (default style is `wall`, which the
  structural probe flags as floating, but that IS a wall fixture); changing it has collision-placement
  ripple beyond this batch. Console reads dark under SwiftShader (dark-navy gloss + weak faked IBL) —
  the flame renders (verified on the wall variant); a real-GPU highlight pass is a X-cut, not a defect.
- **piano** — OK (upright / digital). Plinth→body→keybed→white/black keys→pedals→music desk, grounded.
  Black gloss reads dark under SwiftShader (IBL limitation) but the keyboard/pedals/silhouette read.
- **book-stack** — OK. Flat stack + two leaning volumes; page edges proud. On host, grounded.
- **throw-cushion** — OK (square / rect × plain/stripe). Puffed RoundedBox + flange seam. On host.
- **throw-blanket** — OK (plain/stripe/herringbone). Folded slabs + draped corner. On host.
- **candle-cluster** — OK (lit/unlit). Three pillars + wicks + flames on a plate. On host.
- **fruit-bowl** — OK (fruit/empty × glazed/matte/stoneware). Bowl body+rim+foot ring + fruit inside.
- **magazine-stack** — OK. Fanned thin magazines with page edges. On host.
- **small-sculpture** — OK (twist / arch / sphere) on a dark plinth. Reads (small).
- **desk-plant** — OK (succulent / trailing). Compact pot + rosette / arching stems. On host.
- **photo-frame-cluster** — OK. Three framed photos (mat + art + lean foot), overlapping group.
- **trailing-plant** — OK (full / sparse). Raised pot with deterministic polyline vines cascading over
  the surface edge with leaf pairs; upright crown tuft. Hero prop reads well. On host.
- **decor-tray** — OK (mixed / candles / minimal × full/sparse). Tray base+rim walls + candle/bowl/
  books vignette sitting on the base. On host.

Gates: `structuralSoundness.test.tsx` + `decorStyling` + `furnitureSets` + `collision/placement`
vitest green (295); tsc + biome clean on the two changed source files (`defs/decor.ts`,
`primitives/Aquarium.tsx`). The stray `_diag.test.tsx` tsc/vitest error in the tree is a concurrent
agent's scratch file, not this batch. Cross-cutting (unchanged, shared with Wave 1/2): the app-wide
`mat:floor-wood-oak` "cathedral" watermark grain shows on dark decor (aquarium stand, coffee-table
host, fluted panels), and dark-gloss items (piano, console fireplace) go flat-black under SwiftShader's
faked IBL — both belong to the coordinated global material retune, not a per-def fix.

### Wave 3B — lighting (5) + textiles (3) + outdoor (5) + kids (5), 2026-07-17

Audit scenario: `scripts/scenarios/realism-light-textile-outdoor-kids.json` (each def at the L/D
centre under the 2.6 m ceiling, or on the MB north window for curtains; low 3/4 + eye-level +
up-look cameras, daylight + a night pass for every lit fixture; variant frames per enum mode) plus
rechecks `realism-w3b-recheck.json` (ceiling fixtures with `showCeilingFixtures` on, cove reframed,
toy-storage wood lit from the window side) and `realism-w3b-curtains{,-cur2}.json` (in-room oblique
+ blackout/sheer opacity A/B). Real-GPU (`SHOT_GPU=1`) so night glow/bloom reads truthfully.
Attachment verified per rubric-2 TWO-channel: closeup frames + the structural-soundness harness
(`structuralSoundness.test.tsx`, 265 tests green across all defs incl. these 18). Every piece sits
flat / spans its mount with no float/sink, no self-z-fighting, no dangling members. **No per-def
geometry fixes were required — all 18 pass.**

Lighting (glow verified at night — cove washes the ceiling, sconce/table/floor/ceiling shades
self-illuminate + bloom; emissive intensities untouched):
- **cove-light** — OK. Wall lip + returning soffit + concealed up-facing LED strip; strip glows,
  ceiling wash reads as the HDB cove signature. Lip→soffit→strip abut.
- **wall-sconce** — OK. Backplate→arm→frosted diffuser (the short spar physically bridges wall to
  shade, no float). Diffuser glows at night. Modest silhouette but reads.
- **table-lamp** — OK (empire/drum/cone). Base→slim stem→emissive shade all overlap; grounded when
  sat on a surface (floats alone by design — a surface item).
- **floor-lamp** — OK (disc / tripod / arc × empire/drum/cone). Disc/tripod legs grounded; arc =
  heavy marble base→riser→12-seg arch→drop stem→shade hanging at reach, all connected; bulb glow
  disc under each shade.
- **ceiling-light** — OK (pendant dome/globe/cone/drum, linear bar, flush). Rose on ceiling→cord(s)→
  shade/bar; flush disc abuts the ceiling. Only renders with `showCeilingFixtures` on (store default
  off — not a def defect). `mountHeight` fixed at 2.55 (no schema param) leaves a ~4 cm rose gap
  under a 2.6 m ceiling — visually hidden by the cornice, acceptable.

Textiles:
- **rug** — OK (rect / round / oval × solid/gradient/striped/herringbone/checkered/plaid/dots).
  Border slab + inset field on the `+0.006`/`+0.013` coplanar offsets (noClip decal pattern kept);
  lies flat, no floor z-fight, woven texture reads. Oval `scaleZ`, round = true circle.
- **curtains** — OK (drawn/open/half × floor/sill × cotton/velvet × sheer→blackout). Rod→finials→
  two wavy draped panels→hem all correct and connected; draw/gather + opacity axis behave. *Cross-
  cutting observation (not a curtain defect, not fixed):* the window **sill/frame projects through
  the panel's fold troughs** — confirmed via the blackout (opaque) A/B, the "tabs" persist IN FRONT
  of the opaque cloth, so it is sill-vs-curtain interpenetration, not show-through. The snap plants
  the panel ~5 cm off the wall (`windowSnap.position` = wall centre) while the sill projects further;
  a free-placed curtain also inherits a `sillY` fallback (0.9) that can leave a real window's lower
  grille exposed below a sill-length hem. Belongs to a coordinated curtain-standoff / sill-depth pass
  (touches snap/sizing, out of batch scope), not a per-def geometry edit.
- **wall-tapestry** — OK (macramé fringed / woven panel). Dowel rod→panel (top reaches the dowel
  line, draped, not floating)→knotted fringe tassels; woven=rattan weave, macramé=fabric.

Outdoor:
- **outdoor-parasol** — OK. Weighted base→metal pole→octagonal canopy cone + valance skirt + finial;
  grounded, `verticalSpan` keeps the high canopy from reading as a floor obstacle.
- **outdoor-table** — OK (teak/rattan/painted/metal × low/dining). Slatted top on 4 tapered legs +
  two X-stretchers (front/back ladder frame); legs grounded, top slats abut legs.
- **outdoor-chair** — OK (teak/rattan/…). Side frames (front+back legs, seat rail, armrest, arm
  support, reclined back stile), slatted seat + reclined back slats attach to the back stile (the
  earlier float fix holds). Grounded.
- **outdoor-lounger** — OK (teak/metal/…). Short feet→side rails→base slats + thick seat cushion +
  inclined head cushion; grounded, all abut.
- **planter-trough** — OK. Tapered box + soil + bushy foliage clusters + tall sprigs, grounded.
  *Minor def note (harmless, not fixed):* `footprintParams.d: 'depth'` references a param the schema
  doesn't expose — the `d` mapping is inert (depth stays the honest 0.28), no functional impact.

Kids (prior attachment fixes all verified holding — changing-table guard posts, high-chair tray
arms, crib mattress platform):
- **changing-table** — OK (drawers / open shelves). Carcass + proud drawer fronts + bar pulls (or
  shelves) + padded mat + corner posts carrying the guard rails down to the top; grounded.
- **high-chair** — OK (wood / moulded plastic). Splayed legs→footrest bar→seat→back; tray carried up
  from the seat sides by the mounting arms (no float). Grounded.
- **crib** — OK (slatted / solid ends × low/high base). 4 posts + top/bottom rails all 4 sides +
  instanced vertical slats + mattress platform board + mattress; connected, grounded. Default finish
  `mat:floor-wood-oak` reads very dark (see wood-texture note).
- **toddler-bed** — OK. Legs→low base→mattress+pillow + tall headboard/low footboard + head-half
  safety side rails; grounded, connected.
- **toy-storage** — OK (2–4 cols × 1–3 rows). Instanced carcass (back + dividers + shelves) + bright
  fabric bins in most cubbies; grounded. `finish:'painted'` reads crisp and cheerful; `finish:'wood'`
  goes near-black in shadow (wood-texture note) — geometry is identical and sound in both.

Cross-cutting (shared with Wave 1/2, NOT fixed per-def): the procedural **`wood` / `mat:floor-wood-
oak` surface reads either as the silvery "cathedral" watermark grain (changing-table `wood`) or near-
black in shadow (crib default, toy-storage `wood`), hurting the kids category's default look. Same
app-wide wood-material issue the Wave-1/2 notes flagged for a coordinated global retune — deferred
here (a `painted`/light default reads correctly, proving the geometry). Gates: `structuralSoundness`
+ `slatLayout` vitest green (265); no source changed in this batch (audit-only), so tsc/biome are
unaffected by it (a stray `_diag.test.tsx` tsc error in the tree is a concurrent agent's scratch
file, not this batch).

### Wave 4B — others + pets spot-check, 2026-07-17

Audit scenario: `scripts/scenarios/realism-wave4-pets-others.json` (19 frames — each item placed at
the L/D centre and framed with `requestFrameSelection`; door-/window-bound items on the real
`door-main` / `win-livingDining-N` openings; the dog ramp against a real 3-seat sofa; the cat-wall
run on the N wall). **Camera lesson (added for the next pet/others audit):** the room-editor Canvas
camera is **polar-clamped near top-down** (a vertical drag only spins azimuth), which hides
float/sink — run pet/others closeups in the **whole-flat ORBIT (dollhouse)** camera instead
(`exitRoomEditor` + `setCameraMode('orbit')`), whose ~3/4 elevation reveals attachment; every
`requestFrameSelection` inherits that angle. **Attachment (rubric-2) verified two-channel:** the
asserting `structuralSoundness.test.tsx` renders staircase (all 4 styles) + every pets def × its
structural-enum modes and stays green (comps=1 + floor/mount contact), and the ORBIT closeups
confirm each joint visually.

others (1):
- **staircase** — OK across straight / lshape / ushape / spiral × railing side/both. The **L-shape
  landing-railing fix (v0.21.2.82)** holds visually: at the turn the railing posts + handrail run
  parallel to each flight (no post/rail spun perpendicular off the run into its own fragment — the
  old `buildLShape` double-rotation bug). Straight = treads/risers + both-side rail climb cleanly;
  U-shape = two parallel flights + half-landing, rails follow; spiral = treads fan around a grounded
  central newel with an outer-edge post+handrail. Treads show the shared oak watermark grain
  (Wave-1 X-cut), geometry sound.

pets spot-check (the ~8 most artifact-prone, closeup incl. joints — all pass except the fix below):
- **cat-tree** — OK (3-tier + house cube + top perch AND 5-tier / no house / ribbed posts / perch).
  Base slab grounded, each sisal/ribbed post segment bridges the platform below (or base) to the one
  above, house cube seats on the middle platform, top-perch rim cup on the top platform. Zig-zag
  stagger keeps the stack over the base.
- **rabbit-hutch** — OK. Two-zone (enclosed timber sleeping box + pitched roof / open wire run) on
  four legs; shared floor pan ties the zones, legs reach the floor, wire bars frame the run.
- **bird-cage** — OK (dome-on-stand default + rect/tabletop). The deferred-finding fix holds: the
  tripod feet are grounded (y=0) with the horizontal stability ring, and the interior perch dowels
  span the full inner diameter to socket into the bars (no ~2–7 cm short).
- **dog-ramp** — OK against a real sofa. Inclined carpeted board on side skirts + a high-end support
  post (grounded), side rails; rises to ~sofa-seat height.
- **cat-wall shelf/steps/bridge** — OK as a wall run at spacing. Each ledge = plank + plush grip pad
  on two under-brackets reaching back to the wall; steps climb diagonally, bridge slats span between
  two anchor shelves. (`cat-wall-steps` stays a sanctioned `KNOWN_DISCONNECTED` — separately
  wall-mounted steps.)
- **cat-window-perch** — OK. Snaps windowBound to the sill; cushion plank projects into the room on
  two diagonal brackets angling back down to the wall below the sill.
- **litter-cabinet** — OK. Closed bench-style wood carcass grounded (side entry hole + rear vent
  slots are on the non-camera faces; geometry sound). Oak watermark grain (X-cut).
- **pet-gate** — OK in the `door-main` doorway (doorBound). Two posts to the floor + top/bottom rails
  frame the infill (bars OR fine mesh) + the walk-through flap outline; spans the opening.

**FIXED — aquarium-stand vs decor-aquarium consistency (`primitives/AquariumStand.tsx`).** The
pets `aquarium-stand` tank still used the OLD low opacities the decor `Aquarium` fixed in Wave 3A
(water 0.42, glass 0.16, glass metalness 0.1), so under the faked IBL the tank washed out to a
**black box with the rim floating over an air gap** — the exact defect Wave 3A cured on the sibling.
Matched the decor values (water 0.42→**0.7**, glass 0.16→**0.30**, metalness 0.1→**0**, roughness
0.05→0.06); the tank now reads as a filled glass box (gravel + tinted water + plants + glass + black
rim) and the two aquaria read alike side-by-side. Opacity-only change — no structural/collision
impact, harness stays green. Verified at closeup (`13b`) + side-by-side (`13`).

Gates: `structuralSoundness` + `pets` (defs + catalog) + `staircaseModel` vitest green (294); `tsc
--noEmit` clean; Biome clean on the one changed source file (`AquariumStand.tsx`). No
version.ts/CHANGELOG edit (per batch scope). Cross-cutting unchanged: the app-wide `wood`/
`mat:floor-wood-oak` watermark grain shows on the staircase treads, rabbit-hutch, litter-cabinet and
aquarium-stand cabinet — the coordinated global material retune, not a per-def fix.

### Wave 4A — coordinated cross-cutting pass, 2026-07-17

Five cross-cutting items the earlier waves deferred. Verified visually on **real GPU**
(`SHOT_GPU=1`) via `scripts/scenarios/realism-wave4-materials.json` (wardrobe/bookshelf/
tv-console/crib/changing-table + floor + fridge/washer finish toggle + fireplace wall/console)
and `realism-wave4-curtain-sill.json` (curtain-sill A/B). Gates: `tsc --noEmit` clean; Biome clean
on the 6 changed files; targeted vitest **402 green** (windowSnap, structuralSoundness, materials,
pets, autoArrange, windowFixture). Structural-soundness harness stays green.

1. **Wood-grain retune (the big one) — FIXED.** Diagnosed TWO distinct wood surfaces, both
   flagged by waves 1–3, and confirmed the worst offenders split across them:
   - **`mat:floor-wood-*` (the shared oak, floor + furniture)** — wardrobe / bookshelf / crib /
     changing-table. Root cause: the `woodFields` painter (`procedural/patterns/wood.ts`) is tuned
     for the FLOOR (a large world-UV tile at `uvScale [1.9,1.2]`, viewed from standing distance).
     Furniture re-scopes the SAME tile to `FURNITURE_UV [0.5,0.5]` (`FurnitureMaterialLoader.tsx`)
     and then a per-primitive `repeat` (1.4–2), so the tile is squished onto tall thin panels →
     the cathedral warp reads as a busy wavy watermark, worst up close. **Floor-safe fix
     (`materials/furnitureMaterials.ts`):** furniture wood (`mat:` ids matching `/wood/`) is
     COARSENED (`FURNITURE_WOOD_COARSEN 0.5` → wider boards, fewer grain bands per panel) and its
     baked relief SOFTENED (`FURNITURE_WOOD_NORMAL_SCALE 0.24` vs 0.4) in
     `getSurfaceMaterial`/`getFurnitureMatWithRepeat` — the FLOOR never routes through those
     functions (it builds via the world-UV `cache.ts` path), so the floor grain is byte-unchanged
     (before/after floor frames identical).
   - **`wood` procedural token (furniture-only)** — tv-console (`#3a2f24` dark), cube-shelf. Root
     cause: `getWoodMaps` (a SEPARATE generator from the floor painter) had a strong low-freq warp
     ("cathedral arches" per its own comment) + 11 ring cycles + heavy latewood darkening, which on
     a dark tint multiplied down to a near-black watermark. **Floor-safe fix (same file):** calmer,
     straighter grain (waver 0.25→0.12, 11→7 rings), gentler darkening (`late` 0.3→0.2, groove
     0.45→0.34, height relief eased) so a dark stain keeps a plausible tonal range, and
     `getWoodMaterial` normalScale 0.7→0.45. `getWoodMaps` is used ONLY by `getWoodMaterial`
     (furniture) — never the floor — so this is inherently floor-safe.
   - A/B result: wardrobe/bookshelf read calm at room + closeup (soft figured grain, no embossed
     zebra); tv-console reads a clean dark unit; crib is now plausible light oak (was near-black);
     floor frame unchanged. Judgment call: kept the shared `woodFields` painter (and thus the floor)
     untouched and pushed all calming into the furniture-only consumer path, per the charter.
2. **Curtain-sill standoff — FIXED.** The snap plants the panel on the wall centre-line while the
   interior sill/frame projects ~0.14 m into the room (`apartment/Window.tsx` sill box: z 0.06,
   depth 0.16 → front face 0.14), so the sill poked through the fabric fold troughs (Wave 3B). Added
   a `standoff` prop to the `Curtain` primitive (offsets the panels + rod in +Z; default 0 keeps
   free-placed curtains wall-flush) and set `standoff: 0.16` in `windowFixtureProps` (`windowSnap.ts`)
   — applied via **fixture props, not the snap point**, so the exact-snap contract (windowSnap
   position d=0) is untouched (windowSnap tests green). Geometry: panel front 0.05→0.21 m, troughs
   (drawn) ≥0.16 m > sill front 0.14 → clears. Verified with a top-down A/B (blackout drawn): the
   fold-strip visibly shifts off the wall from standoff 0 (hugging) to 0.16 (offset into room).
   *Harness note:* the single-room room editor CULLS a windowBound curtain whose snapped window is
   owned by a neighbouring room (a shared-wall opening), so the A/B was captured in the main orbit
   scene where all items render — pre-existing room-editor visibility quirk, unrelated to this fix.
3. **Appliance finish toggle — VERIFIED (not broken).** Scenarioed a fridge + washer, toggled
   `body` steel→matte→gloss→steel via `updateItemProps` at **Performance AND High** tiers. The
   MAT-004b single-representation body (`applianceBodyMaterial`) repaints cleanly at every step —
   NO stale white carcass at either tier through the full cycle including back-to-steel. No fix.
4. **Fireplace wall-mode — FIXED (smallest correct).** The def defaulted to the floating `wall`
   style (harness FLOOR_EXEMPT'd) while the `console` style stands. A single static `mounted` flag
   can't serve both. Chose the minimal convention-matching fix: **default → `console`** (floor,
   reaches the floor, harness-asserted), mirroring how `flatscreen-tv` defaults to its floor `stand`
   rather than the wall mount; the `wall` style stays the wall-fixture alternative (renders at
   `mountHeight`, `fireplace::wall` FLOOR_EXEMPT, exactly like `flatscreen-tv::wall`). No new def
   needed. Updated the harness exemption comment. Verified: console default stands with hearth +
   mantel; wall style renders at mount height with the glowing firebox.
5. **planter-trough dead footprint mapping — FIXED.** Dropped the inert `footprintParams.d:
   'depth'` (the schema exposes only `length`; depth is a fixed 0.28 m in the primitive, which is the
   honest `defaultFootprint.d`). `footprintParams: { w: 'length' }`. No test asserted the mapping;
   the generic `autoArrange`/`PlanFurnitureInspector` `?? 'depth'` fallback resolves identically
   (the `depth` prop never existed), so behaviour is unchanged.

### Wave E1B — Expansion Tier-1 rows 7–12 (enum variants on audited primitives), 2026-07-17

Six new catalog-content modes (procedural originals inspired by product families; NO new feature
flags — enum variants are content). All sized to real-metre/SG norms (cross-checked vs
`ikea_optimized/` folder dims as reference only). Audit scenario:
`scripts/scenarios/expansion-e1b.json` (14 frames, whole-flat ORBIT dollhouse camera, High tier
under `SHOT_GPU=1` so mirror reflectors + knit/metal read truthfully; every new mode + its existing
sibling for regression). **Attachment verified two-channel:** the structural-soundness harness
(`structuralSoundness.test.tsx`) renders and passes EVERY new mode (comps=1 + floor contact) and the
closeups confirm each joint. tsc clean; Biome clean on all touched files; targeted vitest **337
green** (structuralSoundness + builtinCatalog + builtinKeywords + furniturePrices +
furnitureMaterialFinish + granular/roundOval footprint).

- **7. drawer-pedestal (NEW def, reuses the `Dresser` primitive)** — the slim under-desk mobile
  pedestal. Bolting a `pedestal` variant straight onto `dresser` would distort its honest
  1.2×0.5×0.93 footprint, so per the row's sanctioned fallback this is its own def with slim defaults
  (0.4 w × 0.5 d × 0.6 h, 1 col × 3 drawers, bar pulls, painted). A `variant` enum drives the body in
  the shared primitive: `pedestal` = 4 swivel castors (a dark housing socketing into the body
  underside + a wheel touching y=0 — the assembly runs body→housing→wheel to the floor, one grounded
  component) on a ~0.54 m body (~0.6 total, desk-clearance); `chest` = the taller 0.85 m body on
  legs (a narrow drawer tower). Footprint pinned to the taller `chest` height (0.93, height is not
  collision-critical); width tracked via `footprintParams`. Price 180 SGD, office/castor keywords.
  Verified: slim single-column drawer unit on visible castors, grounded; chest sibling taller on
  legs.
- **8. nightstand `size` enum (narrow/standard/wide)** — replaced the redundant continuous `width`
  slider with a discrete `size` enum (DogCrate precedent) that maps to a width in the primitive
  (narrow 0.38 / standard 0.45 / wide 0.6 m). Since `size` is an enum (can't feed `footprintParams`),
  the width is pinned to the LARGEST (wide 0.6) per the pets.ts largest-mode comment style; depth
  stays numeric → tracked via `footprintParams`. Geometry identical across sizes (structure sound at
  every width). Verified: three progressively wider bedside cabinets, grounded.
- **9. ottoman knitted pouffe** — added `pouffe` as a `shape` value (round/square/rect/**pouffe**)
  rather than a separate `style` key, so the structural harness (first-structural-enum = `shape`,
  MAX_EXTRA_MODES=3) auto-covers it alongside the three existing shapes with ZERO coverage loss
  (default round + [square, rect, pouffe] = exactly 3 extras). Rendered as a single lathed body with
  a gently barrelled (bulged) silhouette — widest point at the footprint radius so the collision box
  stays honest, top/bottom pulled in for the plump hand-knit look — plus a small braided crown
  button, no feet, seated flush on the floor; uses the existing fabric/upholstery material (knit
  reads as fabric). Verified: clear bulge + button vs the straight round drum, both grounded.
- **10. potted-plant raised mid-century stand** — new `stand` enum (none/raised) + a `standColor`.
  `raised` lifts the pot (and everything above) so its lower body seats INSIDE a wooden cradle ring,
  carried by three splayed legs running floor→ring — one grounded assembly (legs reach the floor, pot
  seated in the ring, ring hugs the scaled pot base). Leg splay is bounded so the foot circle stays
  within the honest 0.55 footprint even at the large size. `stand` isn't a first-structural enum
  (`type` stays first, keeping bush/snake/palm/fiddle coverage), so `stand=raised` is asserted via a
  new **`EXTRA_STRUCTURAL_MODES`** map added to the harness (general "cover a def's second
  shape-changing enum" mechanism). Verified (hero shot): pot cradled in the ring on splayed legs vs
  the on-floor sibling.
- **11. wardrobe corner (L-plan) + mirror-door finish** — two additions to `wardrobe-3door`.
  `layout` enum (straight/corner): corner renders two 0.6 m-deep arms meeting at the back-left
  corner (overlapping there → connected), the concave inner corner left open (sofa-lshape precedent);
  a props-driven `footprintParts` returns the single width-tracking box for straight and the two L
  OBBs for corner (also fixes the pre-existing straight under-report where width wasn't tracked).
  `doorFinish` enum (panel/mirror): mirror door faces render `MirrorMaterial` (tier-aware — real
  planar reflection on High/Maximum, cheap fake-shiny on Performance/Medium, so the flat fallback is
  automatic) on the hinged/sliding/corner panels. `layout` placed AFTER `doorStyle` (doorStyle stays
  first structural → hinged/sliding/open keep coverage); `layout=corner` covered via
  `EXTRA_STRUCTURAL_MODES`. Verified: L-plan carcass with open notch (panel); bright mirrored panels
  on both L arms (corner mirror). *Note:* the straight-mirror closeup framed the carcass from behind
  (doors face +Z away from the dollhouse camera), so mirror vs panel read identical there — the
  mirror finish is proven by the camera-facing corner-mirror frame.
- **12. gaming desk (`desk` `style: gaming`)** — new `style` enum (standard/gaming), placed AFTER
  `legStyle` (legStyle stays first structural → panel/legs/hairpin keep coverage; gaming covered via
  `EXTRA_STRUCTURAL_MODES`). Gaming renders two black-steel closed-loop side frames (front+back posts
  + foot rail + top rail, `metalLeg` black-steel, reaching the floor and meeting the desktop
  underside) + a rear cross stretcher, a cable-management tray slung under the rear edge between the
  frames (ends meet the back posts), and a monitor riser shelf on two blocks resting on the desktop —
  all grounded/connected. Default width 1.3–1.4 (wider top). Verified: O-leg steel frames + riser +
  tray, grounded (best read on the rear closeup; the front frame washed under the dollhouse
  translucency).

**Harness extension (shared, general):** added `EXTRA_STRUCTURAL_MODES: Record<defId, {label →
props patch}>` to `structuralSoundness.test.tsx`'s `buildCases`, appended after the first-enum sweep
— covers a def's SECOND shape-changing enum (`potted-plant` stand, `wardrobe-3door` layout, `desk`
style) without displacing the first enum's coverage. All new modes report comps=1 + floor contact.

**Judgment calls:** (a) pouffe as a `shape` value not a separate `style` key — full harness coverage,
no loss; (b) nightstand `size` enum replaces the width slider (DogCrate pattern) rather than
coexisting with it — avoids a confusing double width control; (c) drawer-pedestal as its own def
(sanctioned fallback) rather than a `dresser` variant — keeps both footprints honest; (d) new-enum
ordering (layout after doorStyle, style after legStyle) chosen to preserve existing first-enum harness
coverage, with the new modes covered via the `EXTRA_STRUCTURAL_MODES` mechanism. Cross-cutting
unchanged: the dollhouse orbit camera renders near-walls translucent, washing some mid-room closeups
(the clear-angle frames + the harness carry the verification); the shared `mat:floor-wood-oak`
watermark grain still shows on wood finishes (coordinated global retune, not a per-def fix).

### Wave E1A — Tier-1 rows 1–6 (enum variants on audited primitives), 2026-07-17

Six items, all new `paramSchema` enum variants (no new feature flags — catalog content).
Scenario `scripts/scenarios/expansion-e1a.json` (26-item grid staged on open ground BESIDE the
flat — mounted/floor items read as clean product shots with no wall occlusion/camera clipping;
wide overview + 12 per-item profile closeups) reviewed against the rubric; every new mode also
passes the structural-soundness harness (comps=1 + floor contact where anchored). tsc clean, biome
clean, targeted vitest green (structuralSoundness + builtinCatalog + furniturePrices +
builtinKeywords + catalogSearch + footprintShapes + roundOvalFootprint).

- **1 · wall-shelf (decor) `style`** — added `ledge` (picture ledge: plank + raised front lip rail),
  `corner` (L-plan: a long back arm + a short side arm overlapping at the corner block), and made
  `floating` a thick solid slab (was a thin plank). Kept `bracket`/`twotier`. Enum ordered
  bracket(default)/ledge/corner/twotier/floating so the multi-part modes fall in the harness's
  auto-covered default+3; `floating` (a single BeveledBox, trivially one component) is the mode left
  out of the auto-sample. Visual: lip, L-plan, and the chunky slab all read; mounted, so placed at
  1.4 m (floats free in the open-ground scenario, as expected). (`primitives/WallShelf.tsx`,
  `defs/decor.ts`)
- **2 · side-table (tables) `set`** — nesting set of 2–3 round tables (`nest2`/`nest3`) staggered
  along +X, re-centred, each ~4 cm shorter so the smaller ones tuck under. hStep = topThk+4 mm keeps
  each piece's top within ε of the next taller piece's underside → the whole set is ONE connected
  component (verified). A nest always renders round pieces regardless of `shape`. Footprint tracks
  the whole-set extent via a shared pure `defs/nestingTables.ts` (`nestPieces`/`nestFootprint`) wired
  into both the primitive and the def `footprintParts` (honest over-report vs the largest single
  piece, pets.ts convention). `set` is NOT in STRUCTURAL_ENUM_KEYS (so `shape` stays the first enum,
  keeping round/square/drum auto-covered); the nest modes get coverage via `EXTRA_STRUCTURAL_MODES`
  (E1B's mechanism). Visual: three staggered round tops read clearly as a nest, grounded.
  (`primitives/SideTable.tsx`, `defs/nestingTables.ts`, `defs/tables.ts`)
- **3 · bar-table (tables, NEW def reusing the DiningTable primitive)** — bolting a height onto
  dining-table-4 would have distorted its seat-enum sizing, so a separate `bar-table` def (still
  content, no flag) drives the DiningTable primitive with an explicit small `width`/`depth`
  (override the seat-derived top) and a `tableHeight` (0.9–1.1, default 1.05). Parametrised
  DiningTable to read optional `width`/`depth`/`tableHeight` (dining-table-4 has none → unchanged,
  totalH still 0.74). `shape` rect/round(pedestal). Price 340. Visual: reads as a counter/bar table,
  4-leg apron + round pedestal both grounded at counter height. (`primitives/DiningTable.tsx`,
  `defs/tables.ts`, `furniturePrices.ts`)
- **4 · bar-stool (seating) `style`** — added `step` (two-tread wooden step stool ~0.45 m: two side
  panels carry a top tread + a lower front step, both treads span/overlap the panels) and `kitchen`
  (low ~0.6 m backless stool: round seat on four splayed metal legs + a low stretcher ring). Existing
  splayed/pedestal/backed untouched. Enum ordered so the new modes fall in the auto-covered
  default+3; `pedestal` (unchanged Wave-1A column-on-disc) is the mode left out of the auto-sample.
  Visual: 2-tread step + low kitchen stool both read distinct, grounded. (`primitives/BarStool.tsx`,
  `defs/seating.ts`)
- **5 · office-chair (seating) `style: gaming`** — racing bucket silhouette on the existing 5-star
  castor base: taller (0.7) padded back panel + angled contrast side wings + lumbar pillow + headrest
  pillow + contrast seat bolsters. Contrast trim = a darkened shade of the upholstery colour
  (`darkenHex`), routed through the shared upholstery material. Visual: unmistakably a gaming chair,
  grounded on the gas-lift + castors (contrast reads muted on the very-dark default upholstery — pops
  with a lighter colour). (`primitives/OfficeChair.tsx`, `defs/seating.ts`)
- **6 · armchair (seating) `style: swivel`** — the tub barrel silhouette lifted 6 cm onto a round
  metal swivel plate + central hub (satin `metalLeg`) instead of the four tapered feet; reuses the
  tub shell/base/seat geometry (`style === 'tub' || 'swivel'`). Plate→hub→body all overlap (one
  grounded assembly, verified). Visual: barrel tub on a round pedestal base reads as a swivel accent
  chair. (`primitives/Armchair.tsx`, `defs/seating.ts`)

**Judgment calls:** (a) staged the audit grid on OPEN GROUND beside the flat (not in the furnished
rooms) — the mounted wall-shelves + closeups were being occluded/clipped by walls in-room; open
ground gives clean product-shot silhouettes with correct daylight + grounding shadows. (b) bar-table
as its own def (the task's sanctioned fallback) rather than a dining-table `height` enum — keeps the
dining table's seat sizing undistorted and its footprint honest. (c) wall-shelf `floating` and
bar-stool `pedestal` are the modes dropped from the harness auto-sample (both single-mesh-trivial or
unchanged+previously-verified); every NEW mode is auto-covered, and side-table's nests use
`EXTRA_STRUCTURAL_MODES` so no existing mode loses coverage. (d) a nest renders round pieces only
(the classic nesting look) even under shape=square/drum — documented in the primitive. Cross-cutting
unchanged: the shared `mat:floor-wood-oak` cathedral-grain watermark still shows on wood finishes
(coordinated global retune, not a per-def fix).

### Wave E2A — Tier-2 rows 13–14 (two NEW primitives), 2026-07-17

Two new catalog-content primitives (procedural originals inspired by product families; NO new feature
flags — new defs in existing categories are content). All sized to real-metre/SG norms. Audit
scenario: `scripts/scenarios/expansion-e2a.json` (9 frames, whole-flat ORBIT dollhouse camera, High
tier under `SHOT_GPU=1` so glass + fabric + the emissive lit strip read truthfully; wide + profile
closeups + a bed-mode fold-seam closeup + a lit-vitrine night frame). **Attachment verified
two-channel:** the structural-soundness harness (`structuralSoundness.test.tsx`) renders and passes
EVERY new def × mode (`sofa-bed` sofa/bed, `display-cabinet` full-glass/half/wall — comps=1 + floor
contact where anchored) and the closeups confirm each joint. tsc clean on the two new source files;
Biome clean on all touched files; targeted vitest **302 green** (structuralSoundness + builtinCatalog
+ furniturePrices + builtinKeywords + defaultLayout).

- **13. sofa-bed (seating, NEW primitive `SofaBed.tsx`, effort L)** — a click-clack/fold-out sleeper.
  Real dims: sofa ~1.9 w × 0.95 d × 0.85 h; `bed` mode extends depth to 1.2 m for a real single
  sleeping surface (~1.78 × 1.08 m at ~0.5 m top). `mode` enum sofa/bed: **sofa** = upholstered frame
  on short tapered feet + 3 seat cushions + back cushions + reclined backrest with a visible
  horizontal FOLD-LINE seam + two throw pillows near the arms; **bed** = the back folded flat into a
  mattress with a visible mid FOLD SEAM (the click-clack hinge) + two head pillows + RETAINED lower
  side arms. Optional `storage` enum (default drawer) = a proud drawer front + metal bar pull on the
  base front (verified visible in both modes). Studied `Sofa.tsx` for the cushion/arm idiom + shared
  `getUpholsteryMaterial`/`getFabricMaterial` handling. **Footprint approach (honest per-mode, the
  chosen option over pinning-to-deepest):** the two modes differ in DEPTH and `mode` is an enum (can't
  feed `footprintParams`), so a **props-driven `footprintParts` keyed on `mode`** (sofa-lshape /
  wardrobe-corner precedent) serves each mode its TRUE depth — the piece's back (wall) edge is pinned
  at −bboxDepth/2 so it only grows FORWARD into the room when unfolded, matching how a real sofa-bed
  pulls out. **Justification:** this is more honest than pinning every mode to the deeper bed box
  (which would over-report collision in the common sofa state and block a piece that could sit in
  front of a folded sofa); the shared `SOFA_BED_DEPTH` map keeps the primitive + def in lockstep, and
  `defaultFootprint.d` = the deeper bed depth so the enclosing bbox still covers every part (broadphase
  invariant). Price 899 SGD; keywords sofa bed/sleeper/futon/daybed/guest bed/click-clack. `mode` is a
  first-structural-enum key → the harness auto-sweeps both modes (storage defaults on so the drawer is
  asserted too). Verified: sofa reads as a 3-seat sofa-bed (cushions + drawer + feet grounded); bed
  reads as a flat sleeper with the fold seam + drawer + retained arms.
- **14. display-cabinet (storage, NEW primitive `DisplayCabinet.tsx`, effort M)** — a glazed vitrine.
  Dims ~1.0 w × 0.4 d × 1.8 h. Wood corner posts + solid back/top/bottom panels; glass sides + a glass
  front door + interior glass shelves via the same tier-agnostic inline transparent
  `MeshStandardMaterial` (metalness 0, opacity ~0.28) as WineCooler/Aquarium. `style` enum:
  **full-glass** (default, full-height glazing, 4 glass shelves, thin frame) / **half** (glazed upper
  vitrine with a counter divider over a solid 2-door base cabinet + handles, 3 shelves) / **wall**
  (compact 0.9 m variant, 2 shelves). `lit` enum adds a warm-glow **emissive strip mesh** under the top
  panel (NOT a registered `lightEmitters` emitter — an emissive mesh is enough and keeps fixtureGlow/
  bloom constants untouched; verified glowing in the night frame). Price 449 SGD; keywords vitrine/
  glass cabinet/curio/display case/showcase. **Floor + wall duality (judgment call, fireplace
  precedent):** a single static `mounted` def-flag can't serve the tall floor styles AND a wall box, so
  the def stays **FLOOR-anchored** for collision and the `wall` style renders LIFTED to a mount height
  (bottom ≈1.1 m) inside the primitive (exactly like `fireplace::wall` / `flatscreen-tv::wall`), with a
  new harness `FLOOR_EXEMPT['display-cabinet::wall']` entry; the full-glass/half floor styles ARE
  floor-asserted. `style` is the first structural enum → the harness auto-sweeps all three. Verified:
  full-glass reads as a glazed case with 4 shelves; half = glazed-over-solid-doors; wall = a clean
  floating vitrine (wood top/posts + transparent glass + 2 shelves + door pull) — the clearest read;
  lit = a warm interior glow at night.

**Judgment calls:** (a) sofa-bed footprint = props-driven per-mode `footprintParts` (honest per-mode
depth) over pinning to the deepest box — justified above; the back edge is pinned so unfolding grows
forward, not symmetrically. (b) display-cabinet kept as ONE def with the `wall` style rendered at a
mount height + FLOOR_EXEMPT (fireplace precedent) rather than a `mounted` flag (would break the floor
styles) or a separate def — the note documents the collision caveat (wall variant's collision box
stays at the floor). (c) glass via the inline transparent material the task pointed at (WineCooler/
Aquarium), not the tier-aware `getGlassMaterial` — matches the referenced precedent, no store-tier
threading. Cross-cutting unchanged: the dollhouse orbit camera renders near-walls translucent, washing
the full-glass/half mid-room closeups (the wall-variant clear-angle frame + the harness carry the
verification, per E1A/E1B); glass reads faint under the bright daylight IBL (the same WineCooler/
Aquarium note) but clearly at the wall variant + lit night frame.

### Wave E2B — Expansion Tier-2 rows 15–18 (HDB entry + service-yard storage), 2026-07-17

Four NEW procedural-original storage defs (inspired by product families, no IKEA designs/names;
catalog content, no feature flags). All real-metre/SG-sized; registered in `PrimitiveKind` +
`primitives/index.ts` + `defs/storage.ts` + `furniturePrices.ts`. Audit scenario
`scripts/scenarios/expansion-e2b.json` (15 frames, staged on OPEN GROUND beside the flat so the two
mounted defs read as clean product shots with no wall occlusion; whole-flat ORBIT dollhouse camera at
High tier under `SHOT_GPU=1`; per-item joint closeups). **Attachment verified two-channel:** the
structural-soundness harness (`structuralSoundness.test.tsx`) renders + passes every new def × every
enum mode (comps=1; floor contact for the two floor-anchored defs) and the closeups confirm each
joint. Gates: tsc clean; Biome clean on all touched files; targeted vitest green — structuralSoundness
(271) + builtinCatalog + builtinKeywords + furniturePrices + pegboardTexture + meshGridTexture (303 in
the batch run).

- **15 · shoe-bench (NEW, `ShoeBench.tsx`)** — entryway bench, 1.0 w × 0.35 d × ~0.49 h (seat
  ~0.42 + a plump 0.07 upholstered cushion). Wooden carcass (two side panels to the floor + back +
  bottom + a mid shelf → **two cubby rows**, split into ~0.33 m columns by dividers) carrying a
  RoundedBox seat cushion (fabric/velvet/leather). `style` enum: **cubbies** (open front, shoes on
  display) / **flip** (two tilt-open flip fronts with a finger-pull reveal per row, the ShoeCabinet
  precedent). Cushion overlaps the seat deck; every panel/shelf/divider ties the sides. Price 199.
  Verified: 2×3 open cubbies + plump seated cushion; flip fronts read distinctly; grounded, cushion
  flush (no gap), no z-fight.
- **16 · wall-hook-rail (NEW, `WallHookRail.tsx`, `mounted`)** — coat/hook rail, 0.8 w, mount 1.6 m
  (`verticalSpan` 1.5–1.72). A slim wooden mounting board with a row of `hooks` (3–8). `style` enum:
  **rail** (metal J-hooks — a back plate socketing into the board + a forward stem + a descending
  hook tip + an up-turned catch, `metalLeg` satin) / **pegs** (turned Shaker wooden pegs — a tapered
  forward dowel + a ball tip). Every hook/peg's base overlaps the board front → the whole rail is one
  connected assembly (mounted → connectivity-only in the harness, per its mounted handling). Price 39.
  Verified (rail 5-hook, pegs, 8-hook): hooks/pegs socket into the board, project into the room, no
  float.
- **17 · pegboard (NEW, `Pegboard.tsx`, `mounted`)** — perforated organiser, 0.8 w × 0.9 h, mount
  1.3 m. The board face carries a **real peg-hole grid** via a new bounded-LRU canvas texture
  (`pegboardTexture.ts` — one hole cell tiled to the hole count, the `meshGridTexture` precedent; no
  per-hole geometry; cache capped 24, dispose-on-evict; unit-tested `pegboardTexture.test.ts`), in a
  slim wooden frame. `kit` enum: **shelf+hooks** (a forward shelf on two brackets + two J-hooks) /
  **hooks** (a row of three J-hooks) / **cups** (three small open cups on brackets). Every accessory
  sockets into the board front (one connected assembly). `kit` is not a structural-enum key, so the
  hooks/cups kits are asserted via the harness `EXTRA_STRUCTURAL_MODES` (shelf+hooks is the default
  swept case). Price 59. Verified: crisp hole-grid texture reads at High; shelf/hooks/cups all
  attached and projecting.
- **18 · utility-cabinet (NEW, `UtilityCabinet.tsx`)** — tall broom/utility cupboard, 0.5 w × 0.4 d
  × 2.0 h. Closed carcass (sides + back + top/bottom decks + two interior shelves in the upper third)
  on a **recessed dark plinth/toe-kick** (grounded). Door fronts stand PROUD of the carcass with a
  shadow-gap reveal (the TVConsole "fronts never buried" lesson) and a vertical bar handle. `doors`
  enum: **single** / **double**; `doorStyle` enum: **panel** (flat) / **louvre** (a stile+rail frame
  filled with tilted horizontal slats via one `InstancedBoxes` draw call). `doorStyle` is the
  first-structural enum (panel default + louvre swept); `doors=double` is covered via
  `EXTRA_STRUCTURAL_MODES` (single/double is not a structural-enum key). Doors connect to the carcass
  via top/bottom-deck overlap (the leaf spans just inboard of the sides). Price 329. Verified across
  single/double × panel/louvre: proud doors + reveals + dark plinth + full-height louvre slats;
  grounded on the plinth, no float, no z-fight.

**Harness additions:** `EXTRA_STRUCTURAL_MODES` gained `utility-cabinet` (`doors=double`) and
`pegboard` (`kit=hooks`, `kit=cups`) so each def's second (non-first) shape-changing enum is asserted
without displacing the first-enum sweep (the E1 mechanism). No new escape-hatch exemptions — every new
def + mode passes connectivity, and the two floor-anchored defs pass floor contact.

**Judgment calls:** (a) shoe-bench `style` = cubbies/flip as the first-structural enum (auto-swept),
matching the ShoeCabinet open/closed pattern; both grounded via the full-height side panels. (b)
utility-cabinet models two interior shelves behind the closed opaque doors (honest carcass, negligible
cost, connected) rather than omitting them — occluded when closed but correct if a future open state is
added. (c) Both mounted defs (rail/pegboard) staged on open ground at their mount height so the
hook→board / accessory→board joints read cleanly — the dollhouse-orbit camera occluded the two mounted
frames' floor-anchored utility-cabinet neighbours in a couple of mid-room closeups (frames 10–11), so
verification leans on the clear-angle louvre/plinth frames + the harness (the E1A/E1B occlusion note).
(d) Pegboard holes drawn as a tiled colour texture (dark recessed discs on the board colour) rather
than see-through alpha or per-hole geometry — reads convincingly as a peg-hole grid at every tier with
zero geometry cost. Cross-cutting unchanged: the shared `mat:floor-wood-oak` grain shows on the wood
finishes (coordinated global retune, not a per-def fix).

### Wave E3A — Expansion Tier-2 rows 19–22 (four NEW primitives), 2026-07-17

Four new catalog-content primitives (procedural originals inspired by product families; NO new
feature flags — new defs in existing categories are content). All real-metre/SG-sized; registered in
`PrimitiveKind` + `primitives/index.ts` + the matching `defs/*.ts` + `furniturePrices.ts`. Audit
scenario `scripts/scenarios/expansion-e3a.json` (13 frames, staged on OPEN GROUND beside the flat so
the mounted wall-desk reads as a clean product shot; whole-flat ORBIT dollhouse camera at High tier
under `SHOT_GPU=1`; per-item profile closeups + a reclined-mode footrest-linkage closeup + loft-bed
under-desk / under-wardrobe fit-out frames). **Attachment verified two-channel:** the
structural-soundness harness (`structuralSoundness.test.tsx`) renders + passes every new def × every
enum mode (comps=1; floor contact for the floor-anchored defs) and the closeups confirm each joint.
Gates: `tsc --noEmit` clean; Biome clean on all touched files; targeted vitest green —
structuralSoundness (287, incl. all E3A cases) + builtinCatalog + furniturePrices + builtinKeywords.

- **19 · recliner (seating, NEW `Recliner.tsx`)** — a plush single-seat lounger. ~0.85 w; the deep
  `reclined` state is the enclosing bbox depth (`RECLINER_BBOX_DEPTH` 1.45 m). `position`: **upright**
  (back near-vertical, footrest folded down as a padded flap against the seat front) / **reclined**
  (back leaned ~29°, footrest DEPLOYED forward as a padded leg ramp). The footrest stays CONNECTED in
  both modes via a chromed hinge rod at the seat front + two visible steel scissor-linkage bars
  (`metalLeg` satin) — verified in the footrest-linkage closeup (frame 03/04). **Footprint approach
  (honest per-mode, sofa-bed precedent):** `position` is an enum (can't feed `footprintParams`), so a
  props-driven `footprintParts` keyed on `position` serves each mode its true [rear, front] extent
  (`RECLINER_EXTENT`, shared const the primitive builds back-pinned from); the wall (back) edge is
  pinned at −bboxDepth/2 so the piece only grows FORWARD as it reclines, and upright reports a
  shallower box than reclined. `defaultFootprint.d` = the deep reclined depth (bbox encloses all
  modes). Leather default; `getUpholsteryMaterial` for the shell/cushions. Price 649. `position` is
  not a first-structural-enum key, so `upright` is the base swept case and `reclined` is asserted via
  the harness `EXTRA_STRUCTURAL_MODES` map. Verified: leather tub-chair silhouette with headrest;
  upright folds the footrest flush, reclined deploys the ramp on visible steel links — connected.
- **20 · wall-desk (tables, NEW `WallDesk.tsx`, `mounted`)** — a wall-hung HDB study-corner worktop.
  ~1.0 w × 0.5 d at 0.75 m. `style`: **floating** (thick worktop + a slim back cleat + two angled
  steel wall braces, cantilevered off the wall, no floor contact) / **fold-down** (shown DEPLOYED: the
  worktop drops on a piano-hinge batten + chromed hinge rod along the wall and is propped level by two
  drop legs + a front foot rail reaching the floor). **Harness/mount treatment (justified):** the def
  is `mounted` (primary attachment is the wall — the braces / the piano-hinge batten), so the harness
  treats it as connectivity-only (no floor assert). This is correct for the floating style (never
  touches the floor) and harmless for the deployed fold-down legs (they reach the floor but the piece
  is still wall-anchored) — cleaner than modelling it as floor-anchored, which the floating style
  would fail. `style` is the first structural enum → both modes auto-swept. `verticalSpan { base: 0,
  top: 0.78 }`; width tracked via `footprintParams`. Price 229. Verified: floating reads as a braced
  cantilevered worktop; fold-down reads as a proper desk with a front leg-frame.
- **21 · loft-bed (kids, NEW `LoftBed.tsx`, effort L)** — a raised single sleeping platform (~1.0 ×
  2.0 m) at ~1.75 m with ~1.6 m under-clearance, on four sturdy posts (BunkBed idiom). Guardrails
  (top rails + vertical balusters on the long sides + the head end, the +X foot-half left open for
  ladder access) + an integral end ladder + a slat platform, mattress + head pillow. `under`:
  **open** (clear void) / **desk** (a built-in worktop spanning the head-end posts + an under-shelf on
  two floor-reaching end supports) / **wardrobe** (a boxed closet under the head end — sides/back/
  top/bottom + a proud door with a bar handle, floor-grounded). All members connect (posts→floor; the
  fit-outs overlap the posts / reach the floor). Fixed dims (BunkBed precedent) → no per-mode footprint
  change; the fit-out sits inside the 1.0 × 2.0 footprint. `under` is not a first-structural-enum key
  → `open` is the base swept case and desk/wardrobe are asserted via `EXTRA_STRUCTURAL_MODES`. Price
  799. Verified: posts/guardrails/balusters/ladder/mattress read as a cabin bed; desk and wardrobe
  fit-outs read distinctly under the head end, grounded.
- **22 · trestle-desk (tables, NEW `TrestleDesk.tsx`)** — a worktop on two trestle supports. Width
  1.2–1.6 m (default 1.4) × 0.7 d at 0.74 h, tracked via `footprintParams`. `legStyle`: **trestle-a**
  (splayed wooden A-frame trestles + a low stretcher tie) / **trestle-h** (vertical wooden H-frame:
  front+back legs + a mid crossbar) / **adjustable** (steel telescoping legs — outer+inner tube +
  foot pad — with a row of visible dark height-adjust pin holes down each outer tube + a steel mid
  crossbar). `legStyle` matches the Desk convention and IS a first-structural-enum key → the harness
  auto-sweeps all three modes (default + 2 extras within MAX_EXTRA_MODES). Each trestle is internally
  connected + grounded and meets the worktop underside (the whole desk connects through the worktop —
  a trestle desk authentically has no inter-trestle stretcher, so none was added). `metalLeg` satin
  for the adjustable legs; shared wood otherwise. Price 279. Verified: A-frame splay + tie, vertical
  H-frame, and the industrial pin-hole telescoping legs all read distinctly, grounded, no z-fight.

**Harness additions:** `EXTRA_STRUCTURAL_MODES` gained `recliner` (`position=reclined`) and `loft-bed`
(`under=desk`, `under=wardrobe`) so each def's non-first shape-changing enum is asserted without
displacing the base swept case (the E1/E2 mechanism). `wall-desk` (`style`) and `trestle-desk`
(`legStyle`) use first-structural-enum keys and are auto-swept. No new escape-hatch exemptions — every
new def + mode passes connectivity, and the three floor-anchored defs pass floor contact; the mounted
wall-desk is connectivity-only by the harness's standard `mounted` handling.

**Judgment calls:** (a) recliner footprint = props-driven per-mode `footprintParts` keyed on
`position` (back-pinned, grows forward) over pinning every mode to the deep reclined box — honest in
the common upright state, justified as the sofa-bed precedent. (b) wall-desk kept as ONE `mounted` def
(both styles) with the harness's connectivity-only mounted treatment — the fold-down's floor legs are
auxiliary to the wall mount, so a floor-anchored flag would wrongly fail the floating style. (c)
trestle-desk enum named `legStyle` (matching Desk) rather than the task's `legs` label so it auto-
sweeps as the first structural enum — the label reads "Legs" in the inspector; the key is an
implementation detail chosen for harness coverage. (d) loft-bed kept fixed dims (BunkBed precedent) —
the under-bed fit-out sits inside the footprint, so no per-mode footprint churn. Cross-cutting
unchanged: the dollhouse orbit camera occluded the small recliner closeups behind the tall loft-bed
frames (the clear footrest-linkage frame + the harness carry the verification, per the E1A/E2B
occlusion note); the shared `mat:floor-wood-oak` cathedral-grain watermark shows on the wood worktops
/ loft frame (coordinated global retune, not a per-def fix).

### Wave E3B — Expansion Tier-2/tail rows 23–24 + 27 + 30, 2026-07-17

Four catalog-content additions (procedural originals inspired by product families; NO new feature
flags — enum variants + new defs in existing categories are content). All real-metre/SG-sized. Audit
scenario `scripts/scenarios/expansion-e3b.json` (19 frames, whole-flat ORBIT dollhouse camera on open
ground beside the flat, High tier under `SHOT_GPU=1`; wide + per-item joint closeups + a pendant-
cluster NIGHT pass; `showCeilingFixtures` on so the ceiling lights render) + a focused lowboy recheck.
**Attachment verified two-channel:** the structural-soundness harness renders + passes every new def ×
mode (comps=1; floor contact for the three floor-anchored defs) and the closeups confirm each joint.
Gates: `tsc --noEmit` **clean (0 errors)**; Biome clean on all touched files; targeted vitest **349
green** (structuralSoundness + builtinCatalog + furniturePrices + builtinKeywords + defs).

- **23 · media-lowboy → `tv-console` `front: 'lowboy'` enum (ENUM, no new def).** *Decision (enum over
  new prim):* per the E1 re-scope note, tv-console's `width` is **numeric** (min 1.2 / max 2.4 /
  default 1.8), so the lowboy's 1.6–2.0 m profile fits with **zero footprint distortion** — no new def
  is warranted. Added `lowboy` to the existing `front` enum (drawers/doors/lowboy) + `lowboy`/`media
  lowboy` keywords. Render: **two solid side cabinet blocks flank a GENUINELY OPEN centre bay** (the
  first pass buried the niche behind the full-width solid body — the tv-console Wave-1B "fronts never
  buried" lesson struck twice; rebuilt so the centre has NO front face, framed by top/bottom decks that
  span+tie the two blocks + a dark back panel + a mid shelf = two open AV compartments) with a rear
  cable-management notch on the top-back edge; each side block carries two stacked drawer faces + bar
  pulls. `front` is not a structural-enum key (tv-console's first structural enum is `base`, swept
  block/plinth/legs), so `front=lowboy` is asserted via `EXTRA_STRUCTURAL_MODES`. Verified (painted +
  dark default): the open centre bay + mid shelf + cable notch read clearly, drawer banks grounded.
- **24 · storage-bench (NEW, `StorageBench.tsx`, storage).** Ottoman/blanket box 1.0 w × 0.45 d × 0.45
  h. Fully-upholstered box body on a base + a lift lid hinged along the back (a satin `metalLeg` piano-
  hinge dowel bridges lid↔body). `style`: **plain** (a piped welt seam ringing the lid top edge) /
  **tufted** (a grid of buttoned dimples). `base`: **legs** (short tapered feet) / **plinth** (recessed
  dark toe-kick) — `base` is the first-structural enum (auto-swept legs+plinth, both grounding
  variants); `style=tufted` covered via `EXTRA_STRUCTURAL_MODES`. Price 229. Verified: plain piped lid
  on legs reads crisply; tufted buttons subtle-but-present on the dark fabric; plinth toe-kick grounded;
  lid proud of the body, hinge line at the back.
- **27 · bay-daybed (NEW, `BayDaybed.tsx`, seating).** Window-bench daybed, numeric width 1.4–2.0 (def
  1.7) × 0.6 d × 0.45 h seat. **Freestanding (NOT windowBound)** — ordinary furniture placed near a
  window, so it keeps full transform/collision (depth fixed 0.6, width tracked via `footprintParams`).
  A boxed wooden storage base with **two front drawers** (proud faces + bar pulls) carries a full-length
  seat cushion; **two cylindrical bolsters** cap the short ends and a row of **back cushions** leans
  along the long (window) edge — all resting on / overlapping the seat (one grounded assembly). No
  structural enum (only material/pattern/finish colour axes) → the harness asserts the single default
  case. Price 549. Verified: base drawers + seat + 3 back cushions + tan end bolsters all read and
  ground; wide (2.0) variant scales cleanly.
- **30 · ceiling-light pendant-cluster → `arrangement: 'cluster'` enum (ENUM extend, lighting).** Added
  `arrangement` (single/cluster) + a `count` integer (3–5, default 4) to the existing CeilingLight def/
  primitive. Cluster renders ONE wide round canopy at the ceiling with `count` cords descending to
  **staggered drops (0.42–1.15 m)** at scattered (x,z) offsets, each cord physically bridging canopy→
  shade (the linear-mode precedent — a shade left hanging off nothing fails the harness). Reuses the
  existing per-pendant emissive shade approach (dome/globe/cone/drum) — **fixtureGlow/bloom + emissive
  intensities untouched** (a shared `fixtureEmissiveIntensity('shade')` drives all cluster shade
  materials via a collected ref array). `verticalSpan.base` lowered 2.0→1.35 to cover the longest drop
  (a realistic over-table pendant height); footprint widened 0.45→0.55 for the cluster spread. Not a
  structural-enum key → `arrangement=cluster` covered via `EXTRA_STRUCTURAL_MODES` (ceiling-light is
  `mounted` → connectivity-only). Verified: the canopy→cords→shades read as one hanging cluster across
  dome/globe/cone × 3/4/5 counts; the **NIGHT frame confirms every shade self-illuminates + blooms**;
  the single-pendant regression is intact.

**Harness additions:** `EXTRA_STRUCTURAL_MODES` gained `tv-console` (`front=lowboy`), `ceiling-light`
(`arrangement=cluster`), and `storage-bench` (`style=tufted`) — each a def's second (non-first) shape-
changing enum asserted without displacing the first-enum sweep (the E1 mechanism). No new escape-hatch
exemptions.

**Judgment calls:** (a) media-lowboy as a tv-console `front` enum, NOT a new def — width is numeric and
already spans the lowboy range, so the enum keeps the footprint honest (the sanctioned E1 re-scope). (b)
The lowboy centre had to be built as two side blocks + an open frame (no full-width body) so the open
bay isn't occluded by a solid carcass front — the same "fronts never buried" trap the tv-console
Wave-1B fix flagged. (c) bay-daybed left freestanding (task directive) with per-width footprint
tracking rather than windowBound — it's furniture, not a window fixture. (d) storage-bench `base`
(legs/plinth) chosen as the auto-swept first-structural enum (both ground the piece) with `style`
(plain/tufted, lid decoration only) covered via EXTRA. (e) pendant cluster reuses the shade emissive +
a single `lightEmitters` point source (unchanged) rather than N per-pendant lights — keeps the glow
budget + bloom constants untouched per the src/furniture/CLAUDE.md lighting rule. Cross-cutting
unchanged: the shared `mat:floor-wood-oak` cathedral-grain watermark shows on the tv-console/daybed
base wood (coordinated global retune, not a per-def fix); the dollhouse orbit camera's large mid-air
cluster domes occluded a couple of neighbouring closeups (the clear cords-canopy + night frames carry
the verification, per the E1A/E2B occlusion note).

### Wave E4A — Expansion row 25: modular sectional / corner-sofa builder, 2026-07-17

**Architecture decision — EXTEND the `productConfigurator` `MODULAR_SOFA` (Option A), not a new
`sofa-sectional` parametric def (Option B).** Decisive factor: the deliverable's "**per-module fabric
via the existing finish channels**" is specifically the configurator's mechanism — each slot option's
`finishKey` bakes into a named material group, surfaced as a per-section finish picker on the placed
GLB through the existing finish-override channel (`props['finish:<key>']`). A live parametric def can
NOT do per-mesh finish overrides (those apply only to GLB-rendered items via `GltfModel`), so Option B
would have to fake per-module fabric with N colour params — not "the existing finish channels". Option A
also rides the existing `productConfigurator` flag (simple tier, on in both modes — **no new flag**),
reuses the whole bake/persist/dialog/preview pipeline, and keeps `SofaSectional` (the parametric
`sofa-lshape` primitive) untouched for the fixed-shape L. The one thing Option B wins natively — an
honest concave footprint via a `footprintParts` function — I recovered for the baked product by
teaching `composeProduct` to EMIT a composite `footprintParts` (see below), so Option A now delivers
BOTH requirements. (The pre-existing `SofaSectional` primitive / `sofa-lshape` def stays as the
single-shape catalog L; this builder is the compose-your-own surface.)

**What a user can now compose** (configurator → "Modular sectional" tab → per-end option → Add/Save):
a **2–6-module** sectional from a 2-seat armless CORE (1.8 × 0.95 m) plus a self-terminating slot at
each end (`leftEnd`/`rightEnd`), each offering **Armrest** (+0), **Seat + arm** (+1), **Corner (L)**
(+1, forward-turning return), **Seat + corner** (+2). Reachable configs: **2-mod loveseat** (arm+arm),
**3-mod L either way** (one corner — flip precedent is native, not a mirror flag), **4-mod U**
(corner+corner), **5-mod U** (seat-corner + corner), **6-mod U** (seat-corner both ends), and a
straight **4-seat run** (seat-arm both ends). Real metres: seat module 0.9 w × 0.95 d, corner
0.95 × 0.95 with a 1.525 m forward chaise return, seat 0.85 h. Per-end fabric via `base:` / `leftEnd:`
/ `rightEnd:` finishKeys. Every option carries an explicit SGD price (90 / 330 / 420 / 690); base 520.

**No-gap design (why no constraint is needed).** The old `MODULAR_SOFA` used a fixed 3-seat base + a
separate `corner` slot with `mutex`/`excludes` to stop gaps/overflow, and could NOT make a loveseat
(base too big) or a U (excludes forbade two forward returns). The rebuild makes each END option author
its OWN complete geometry extending from the core edge (`endParts(side, kind)`), so the two ends share
one option table (differing only by a side sign + finishKey) and `clampConfig`'s output is ALWAYS
buildable with **zero constraints** — every module abuts the next at a shared face plane. Both ends may
turn forward independently → U is naturally expressible.

**Honest composite footprint (the `footprintParts` thread).** `composeProduct` now tracks a per-
contribution AABB (base + each filled slot) from the ACTUAL transformed box parts (exact) plus any GLB
piece footprint, unions them for `bounds`, and emits one `FootprintPart` per contribution **relative to
the bounds centre** — so an L/U collides with its true concave notch instead of the full bbox (the
`sofa-lshape` precedent, but composed; a single-contribution product collapses to one part = the plain
OBB, a no-op). Threaded onto the baked def: `ComposedModel.footprintParts` → `saveConfiguredAsset`
(passed only when >1 contribution) → `PersistOptions.footprintParts` → IDB meta (JSON) + the def object
→ `hydrateAssets` decode (back-compat: absent on legacy records) → `schema.ts` (Zod + serialize, for
design export/import round-trip). Collision reads it through the EXISTING `itemFootprintParts` (which
already resolves `def.footprintParts` for any def kind + mirrors on flip) — no new collision path.
Bounds also became part-exact (was per-option-footprint-at-anchor), a strict improvement; the mattress/
cat-tree bounds assertions still hold.

**Verification.** Scenario `scripts/scenarios/expansion-e4a.json` drives the REAL dialog on port 5301
(SHOT_GPU=1): opens the configurator, switches to the Modular sectional tab, and sets per-end options
via an eval helper that finds each `.sec` by its `.sec-h` label (both end slots share option labels, so
`clickByText` alone is ambiguous), screenshotting the live composed preview (the same
`buildConfiguredPreview` the bake uses). 8 frames reviewed — **01 loveseat** (arms abut the seat,
cushions seated, tight joints), **02 L-left / 03 L-right** (corner projects forward, reads as an L both
ways), **04 U-4 + 05 U-4 profile** (both returns forward, symmetric U, solid junctions, no gaps at the
corner-to-core joint), **06 U-5** (extra left seat before the corner), **07 max-6** (large U), **08
4-seat run** (straight extended sofa). No z-fighting (abutting boxes share face planes back-to-back,
interior joins hidden), no floating parts, scale correct. (Camera persisted at the profile-drag angle
for frames 06–08 — a harmless OrbitControls carry-over; frames 01–05 are the hero/profile angles.)

**Gates.** tsc clean on all touched files (the only tree errors are the concurrent E4B wave's
`parametric/buildParts.test.ts`). Biome clean. Targeted vitest green: `configurator` (78:
compose/clamp/constraints/persist/saveConfigured **both-modes flag** + the new sectional compose cases)
+ `structuralSoundness` (unaffected — no parametric def/primitive touched) + `collision` (granular
footprintParts) + `schema` + `storage`. (`broadphase.test.ts`'s random "huge sparse extents" fuzz case
flaked in the batch run; passes in isolation — not this change.) The `visibleConfigurableProducts` pets
gate is untouched and still tested in both modes.

**Judgment calls.** (a) Extended the configurator over a parametric def — justified by the per-module-
fabric-via-finish-channel requirement (above). (b) Per-section fabric grain (base / left / right = 3
finish channels) rather than per-individual-seat: matches the slot model (each end IS a module/section)
and the "corner module / chaise end / armless middle" vocabulary; a finer per-seat grain would need
per-seat roles on one shared base slab (overkill). (c) Emitted a static `footprintParts` through persist
+ schema (additive, back-compat, guarded) rather than accept the over-wide bbox — a U-sofa bbox would
block its own open interior (a coffee table couldn't sit in the U), so the notch matters; this is the
smallest additive infra change and reuses the existing `itemFootprintParts` consumer. (d) Kept box parts
on the `painted` token material (the configurator's box-part model, matching the old MODULAR_SOFA and
mattress/cat-tree) — photoreal fabric is available post-bake via the per-section finish pickers. (e) No
constraints on the new product (self-terminating end options can't gap/overflow within the 2–6 range
the charter asks for); the `clampConfig` mutex/excludes MECHANISM coverage moved to a small inline test
fixture so it stays covered independently of the sofa's (now empty) constraint set.

### Wave E4B — Expansion row 26 (modular wardrobe system) + rows 28–29 (kids convertibles, outdoor bistro set), 2026-07-17

**Row 26 — modular wardrobe system.** Extended the EXISTING `parametric` `wardrobe` type in place (per
the corrected flag policy — a configurable system extends a parametric type, no parallel channel), not
a new type/channel. `spec.ts`: added `WardrobeFitOut` ('hang' / 'double-hang' / 'shelves' / 'drawers' /
'shoe', + `WARDROBE_FIT_OUTS`/`_LABEL`), `WardrobeFront` ('sliding' / 'hinged' / 'open', +
`WARDROBE_FRONTS`/`_LABEL`), and two new `ParametricSpec` fields — `wardrobeFront` and
`wardrobeFitOuts: WardrobeFitOut[]` (per-bay, index = bay) — both clamped in `clampSpec`
(`clampFitOuts` validates/repairs unknown entries to `'hang'`) and defaulted per-type in `DEFAULT_SPECS`
(wardrobe's default `bays` bumped 1→2 so the fit-out picker has something to show out of the box).
`bays` (already used by kitchen-run) is now shared by wardrobe too — it drives the modular column count
directly (unlike bookshelf/sideboard, which still auto-divide via `bayCount`/`MAX_BAY_SPAN`).
`buildParts.ts`: added `buildWardrobe(spec)` — a dedicated builder (the shared bookshelf/sideboard
carcass builder's wardrobe branches were removed, since the fixed "one shelf + one rail" layout no
longer applies): recessed plinth, floor→top sides carrying `spec.bays` divided columns, and per-bay
interior fit-out (`hang` = top shelf + rail at hanging height; `double-hang` = top shelf + an upper AND
a lower rail for short garments; `shelves` = an evenly-spaced stack sized off `autoShelfCount`; `shoe` =
a denser stack, ~0.24 m gaps; `drawers` = a stacked drawer bank via the existing shared
`addDrawerFronts` helper). Front covering is independent of the fit-out: `open` emits nothing proud
(interior visible), `hinged` emits per-bay leaves (reusing `doorLeafCount`/`MAX_DOOR_LEAF` so no leaf
exceeds 0.6 m) each with a vertical bar handle, `sliding` emits two bypass panels on two Z-offset tracks
(so they never z-fight) each spanning half the width plus a small centre overlap, with a slim
finger-pull near its leading edge instead of a handle (real sliding-wardrobe doors have no protruding
pulls). Max envelope 2.5 w × 2.36 h × 0.58 d (fits the row's "up to 2.5 w × 2.36 h × 0.58 d" spec,
inside the existing `PARAMETRIC_LIMITS.wardrobe` — unchanged, since 2.5/2.36/0.58 already sit within
0.5–3.0 / 1.8–2.4 / 0.55–0.65). `ParametricControls.tsx`: added a dedicated `WardrobeControls` layout
(dimensions → bay-count slider + front segmented control → per-bay `WardrobeFitOutPicker` rows →
finish), mirroring the existing `KitchenControls` dedicated-layout precedent (wardrobe no longer shares
the generic bookshelf/sideboard/desk controls branch — its options diverged too far: no `doors`
boolean, no `shelves`/`base` fields, a wholly different per-bay vocabulary). Bakes through the
UNCHANGED, existing `exportGlb → persistUserGlb` channel — `buildWardrobe`'s output is still a flat
list of box `ParametricPart`s consumed by `buildParametricObject`/`saveParametricAsset` exactly like
every other parametric type; `footprint: model.bounds` (a plain rectangular AABB — the sliding front's
proud bulge folds into `bounds.d`, the same convention `buildKitchenRun`/the old wardrobe branch already
used for a proud door) and `price: estimatePrice(model)` are the only `PersistOptions` fields touched,
both pre-existing. **No schema/persist/hydrate changes were needed or made for this row** (see the
schema-change note below — those files' diffs in the shared tree belong to the concurrent E4A wave).

**Flag.** `parametricFurniture` already gates the whole parametric dialog (simple tier, default on,
prod-safe pure code — set at PF1). Wardrobe is one of its existing tabs, so no new flag was needed;
extended its existing both-modes coverage instead: `ParametricDialog.test.tsx`'s wardrobe test now
asserts the new bay-count slider + front segmented control + per-bay pickers render, plus an explicit
"wardrobe modular controls are present in BOTH Simple and Pro" case (loops `['simple','pro']`,
re-resolving `parametricFurniture` is `true` in both, and that the Wardrobe tab's new controls are
reachable in both — per the corrected flag policy, this is content ON an existing simple-tier feature,
not a new gate).

**Schema-change note (why `src/state/schema.ts` / `src/furniture/upload/persist.ts` /
`src/state/storage/hydrateAssets.ts` show as modified in this tree).** Those three files were touched
by the CONCURRENT E4A wave (row 25, the modular-sectional/corner-sofa configurator builder running in
the same shared working directory), not by this wardrobe work — confirmed via `git diff` (the diff is
entirely the `footprintParts` granular-footprint plumbing E4A's findings section documents above) and
by grep (nothing in `parametric/saveParametric.ts`, `parametric/buildObject.ts`, or this wave's own
diffs references `footprintParts`/`schema`/`hydrateAssets`). The brief's "bake through the EXISTING
`exportGlb → persistUserGlb` channel, no parallel persistence" applies cleanly here with ZERO schema
changes: `buildWardrobe` always returns a single rectangular `bounds` AABB (never a concave notch — a
wardrobe carcass, even with a proud sliding/hinged front, is representable as one enclosing box, unlike
E4A's L/U sectional whose bbox would block its own open interior), so the existing `footprint` field
already carried by `PersistOptions` is sufficient; nothing new needed persisting or hydrating.

**Row 28 — kids convertibles.** `crib` gained a `convert` enum (`crib` / `toddler`) reusing the SAME
crib geometry per the brief: the front long side (+Z) drops its slat height and top rail from the full
`railTopY` (0.92 m) to a low `guardTopY` (0.36 m) — a low toddler-bed guard rail — while the back/two
ends stay full height, so the mattress-base + frame + joinery are 100% shared between modes (pure
parametrised height, no new parts). Keyword `'convertible'` added to the def (+ `'cot-bed'`/`'toddler'`)
per the brief. `high-chair` `size` grow-modes: **skipped, with a note** — the primitive's every
dimension (`seatY`/`seatW`/`seatD`/tray/footrest) is a hardcoded literal with no size-derived scaling
anywhere, so a real "grows with the child" mode would mean re-deriving ~10 interdependent offsets (tray
height relative to seat, footrest position, leg splay reach) for at least 2 more sizes — not the "cheap
enum" the brief allows to skip; the crib conversion was cheap (7 constants gated behind one boolean)
because it only ever touches the ALREADY-parametrised front-side height. Deferred to a dedicated
high-chair pass if/when demanded.

**Row 29 — outdoor bistro set.** Decision: **two new discrete defs + a `furnitureSets` entry**
(`bistro-table` + `folding-chair` + the `'bistro-set'` set), not a single 3-part composite def. Rationale
(per the brief's own steer): `furnitureSets.ts` is the established precedent for exactly this shape — a
coordinated multi-item vignette the user can drop in one click while each piece remains independently
selectable/movable/collidable afterward (see `'balcony'`/`'sun-deck'`, the outdoor sets already there).
A single composite def would need either (a) one dishonest bbox spanning table+chairs+the gaps between
them (the walkway between an armchair and a bistro table is real walkable space, not part of the
"footprint"), or (b) `footprintParts` faking three separate OBBs on one def — extra machinery for zero
benefit over just having three real catalog items, since bistro sets are routinely rearranged (chairs
pulled out, table pushed to a rail) unlike a single rigid product. `BistroTable` (new primitive): round
top (Ø0.6 default, 0.5–0.8 m range) on a central column over a weighted round foot — table Ø0.6 × 0.71 h
matches the brief exactly. `FoldingChair` (new primitive): scissor-crossed leg pairs (the folding-chair
silhouette) carrying a slatted seat + slim slatted back, 0.42 w matching the brief. Both share the same
`finish` vocabulary as the existing outdoor defs (teak/rattan/painted/metal) via `getSurfaceMaterial`,
with the metal option routed through the shared `metalLeg` helper (METAL-LEGS) for a proper brushed
finish rather than a flat painted grey. `furnitureSets.ts` gained `'bistro-set'` ("Balcony bistro set")
— table centred, two chairs facing it front/back at 0.62 m offsets (clear of the table's 0.3 m radius +
the chair's own depth). No flags (catalog content, per the corrected flag policy — new defs in an
existing category). Prices added to `furniturePrices.ts` (`bistro-table` 130, `folding-chair` 70 — in
the existing `outdoor-*` band).

**Harness coverage.** The parametric generator bakes to a static GLB, so the primitive-sweeping
`structuralSoundness.test.tsx` (which renders BUILTIN parametric defs headless) does not cover it —
per the brief, added `parametric/__tests__/wardrobe.test.ts` calling the render-agnostic
`connectedComponents` helper directly on `buildWardrobe`'s output boxes: every `front × fit-out ×
bay-count` combination (3 fronts × 5 fit-outs × [1,2,4] bays = 45 cases) plus a mixed 5-bay layout and
the smallest single-bay wardrobe all assert **one connected component + floor contact** (ε = 8 mm,
matching the primitive harness's tolerance). `BistroTable`/`FoldingChair`, being ordinary primitives (not
baked GLBs), ARE covered by the existing `structuralSoundness.test.tsx` sweep automatically (registered
in `PRIMITIVE_COMPONENTS`/`PrimitiveKind`, no harness edit needed) — both pass at default props. The
new `bistro-table`/`folding-chair` default cases plus the crib's new `convert=toddler` extra-mode case
bring the sweep to 290 total structural cases (harness green throughout). `crib`'s toddler mode was
added to the harness's `EXTRA_MODES` map (`convert=toddler`) since `convert` is not one of the swept
first-structural-enum keys — asserts the dropped front side stays one grounded assembly, not a
disconnected low guard floating apart from the tall back/ends.

**Verification.** Scenario `scripts/scenarios/expansion-e4b.json` (dev server port 5302, `SHOT_GPU=1`
for the in-room frames) plus follow-up scenarios iterated to get robust dialog automation (see judgment
call below): **crib** — `e4b-crib-default`/`e4b-crib-toddler`/`e4b-crib-toddler-3q` (the toddler frame
at a low angle clearly shows the front dropped to a low guard rail with short slats while the back/ends
stay full height, mattress-base still spans the frame, all joints attached; the 3/4 frame happened to
frame two TALL sides, not a defect — the low-angle frame is the informative one). **Bistro set** —
`e4b-bistro-table` (round top, central column, weighted foot, all overlapping/abutting), `e4b-folding-
chair` + `e4b-folding-chair-teak` (scissor legs read clearly, slatted seat/back attached), `e4b-bistro-
set` + `e4b-bistro-set-low` (table + two facing chairs, walkable gaps between pieces, reads as a real
café two-seater). **Wardrobe** (parametric dialog, live preview — the SAME `buildParametricObject` the
bake path exports, so preview never drifts from the saved GLB) — `e4b-wardrobe-open-mixed-4bay` (4
bays: Shelves / Drawers / Shoe rack / Double hang, each visibly distinct — dense even shelf stack,
drawer fronts+handles, denser shoe stack, top-shelf-plus-two-rails), `e4b-wardrobe-sliding-4bay` (same
mixed interior, front switched to Sliding — two bypass panels with finger-pulls, fit-out state
preserved across the front change), `e4b-wardrobe-hinged-4bay` (per-bay hinged leaves with vertical bar
handles, one per ≤0.6 m leaf), `e4b-wardrobe-open-config3` (a second mixed layout: Hang / Shelves /
Double hang / Drawers). All four wardrobe frames were captured with an explicit in-page assertion
(`classList.contains('on')`) confirming each clicked option actually took effect before the screenshot,
not merely "the click fired" — see the judgment call below on why that mattered.

**Judgment calls.**
(a) **Dedicated `buildWardrobe` builder vs. extending the shared bookshelf/sideboard carcass function.**
The shared builder's wardrobe branches (fixed one-shelf-one-rail layout, `doors` boolean, per-bay
`CompartmentConfig` reused from sideboard) could not express 5 independent fit-outs × an independent
3-way front without turning `CompartmentStyle`/`bayStyle` into a wardrobe-specific mess that would also
have back-compat implications for the OLD wardrobe defaults (`doors: true` meaning "hinged", now one of
3 front options). A separate builder keeps both call paths simple and the diff auditable; the shared
carcass primitives (`PANEL_T`, `addDrawerFronts`, `doorLeafCount`, `bayFitOut`) are still reused, so
there's no geometry duplication, only the assembly order differs.
(b) **`bays` field reused across kitchen-run AND wardrobe** (both drive an explicit user-set column
count, unlike bookshelf/sideboard's auto-dividing `bayCount`) rather than adding a second field — the
field's doc comment was updated to describe both uses; this keeps `ParametricSpec` from growing a
near-duplicate field for the same concept.
(c) **Sliding-panel proud depth folds into `bounds.d`** rather than emitting `footprintParts` — a
sliding wardrobe's collision-relevant footprint is still a single rectangle (unlike E4A's concave U
sofa), so the existing "bounds absorb the proud front" convention (already used by hinged wardrobe/
sideboard doors and kitchen worktops) is the right level of honesty; no new persistence machinery
earned its cost here.
(d) **High-chair size grow-modes skipped** (see row 28 above) — the brief explicitly allows skipping
"if not trivially cheap", and every dimension in `HighChair.tsx` is a hardcoded literal with no existing
size-driven scaling to hook into, unlike the crib conversion which only touches an already-parametrised
height constant.
(e) **Bistro set as two defs + a `furnitureSets` entry, not one composite** (row 29 above) — matches the
established multi-item-vignette precedent instead of introducing footprint machinery for a set of
pieces that are routinely rearranged independently in real use.
(f) **Scenario automation iteration.** The first scenario pass used raw `eval` steps ending in a
trailing `true` (to make the JS expression truthy) — this **silently swallows a failed element lookup**
(a missed click becomes a no-op that still reports step "OK"), which masked two real problems in
sequence: React state-update batching (four rapid synchronous `.click()` calls in one eval only ever
read the FIRST stale `spec` closure, so only the last click's effect won) and, later, CDP round-trip
latency spiking to 15–40 s per trivial step (system-wide, from a concurrent agent's own `SHOT_GPU=1`
Chrome instance contending for the same GPU — confirmed via a diagnostic scenario showing the dialog
WAS open with the correct state while a plain-text `waitFor` still timed out). Fixed by switching to the
harness's `click`/`waitFor` step types (which throw/timeout loudly instead of no-op) with generous
timeouts, one settle-wait between each single click (avoiding the batching issue), and an explicit
in-page `classList.contains('on')` assertion before each screenshot — cheap insurance against ever
reporting a stale/no-op frame as verified again.

**Gates.** `tsc --noEmit` clean (repo-wide, including the concurrent E4A tree). Biome clean on all 17
touched/added files for this wave. Targeted vitest green: `furniture/parametric` (spec/buildParts/price/
the new `wardrobe.test.ts`) + `ui/parametric` (`ParametricControls`/`ParametricDialog`, both-modes) +
`furnitureSets.test.ts` + `furniturePrices.test.ts` + `structuralSoundness.test.tsx` (290 cases,
crib/bistro-table/folding-chair included) + `featureFlags.test.ts` — **511 tests, 0 failures**.
