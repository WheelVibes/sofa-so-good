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
