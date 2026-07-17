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
| 1 | seating (10) + tables (6) | beds (5) + storage (11) | dispatched |
| 2 | kitchen (5) + appliances (9) | bathroom (7) + laundry (3) + electronics (4) | 2A done · 2B pending |
| 3 | decor (26) | lighting (5) + textiles (3) + outdoor (5) + kids (5) | 3A done · 3B pending |
| 4 | others (1) + pets spot-check (26) | — | pending |

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
floor-touch assertions). Every new user-facing item gets a `FEATURE_FLAGS` entry with a `tier`
(entry/storage staples → `simple`; gaming/utility/system builders → `pro`) and is tested in both
Simple and Pro modes.

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
