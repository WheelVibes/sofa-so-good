# src/furniture — catalog & rendering rules

Area rules for furniture. Full sub-dir map in `docs/ARCHITECTURE.md`.

- **Realistic mode swaps hero primitives for photo-scanned CC0 GLBs (PHOTOREAL-HERO,
  `photorealProxies.ts`, flag `photorealModels`, `v0.33.0.0`).** `Furniture.tsx` asks
  `photorealProxyFor(def, props, enabled)` and, when it answers, draws a `GltfModel` in the
  PRIMITIVE's frame with the primitive as the Suspense/error fallback. Three rules:
  1. **It is a RENDER swap only.** The item keeps its parametric `defId`; collision, the arranger,
     prices, ratchets and exports of the plan all still read the parametric def. Never make a
     placement decision read the proxy.
  2. **The GLB must arrive floor-centred and facing +Z with a measured sidecar footprint** — baked
     by `scripts/asset-pipeline/fetch-hero-models.mjs` (yaw read off Blender turntables), so the
     runtime does UNIFORM X/Z scale only: width-matched to the live `width` param, clamped so depth
     and height never exceed the parametric footprint by more than `tolerance` (0.15; chairs 0.2). A
     proxy that pokes past its own collision box clips walls. **Surface hosts set `fitHeight`**: a
     bounded (≤1.25×) VERTICAL stretch puts the top exactly at the parametric `h`, because every
     decor prop self-lifts to that height and a top 6 cm lower left the fruit bowl hovering.
  4. **Decor authored into the DEFAULT flat must sit on a surface both shapes share.** A throw
     draped over the box sofa's arm protruded through the chesterfield's rolled arm, and cushions
     authored at the box sofa's FRONT edge overhung the chesterfield's set-back seat, then poked out
     through its BOWED back when moved against it; all three now sit mid-seat, 0.45 m inboard of
     the ends (`defaults/livingDining.ts`). Verify a decor move on BOTH shapes, cropped.
  3. **Gate on the MODE (`qualityTier === 'realistic'`), never the device class.** The adaptive
     ladder moves the class; the mode is user intent. `performance` stays byte-identical.
  Adding a piece: add the Poly Haven id to `HERO_MODELS` (fetch script), run the script +
  `optimize:glb` + `index-assets`, map the parametric id in `PHOTOREAL_PROXIES`, and confirm the
  facing with `inspect_asset.py` (view_00 is the glTF +Z face). No modern dining table, bed or
  floor lamp exists on Poly Haven — those stay parametric on purpose; `sideboard`, `bookshelf` and
  `cube-shelf` are deliberately unmapped because their only candidates need >1.25× stretch or leave
  the trailing plant on top floating.
- **Do NOT try to fix "moulded-looking" upholstery by jittering the CUSHIONS' positions** (tested and
  reverted, v0.31.5.158). Offsetting each seat/back cushion by a few millimetres and a fraction of a
  degree — deterministic, bounded, tested, so the row could never overlap or float — is invisible:
  micro-sd over the sofa crop went **9.11 → 9.13** at ±5 mm and **9.11 → 9.09** at ±12 mm with a
  downward sink, i.e. nothing, twice. Adjacent cushions are the same colour, so sliding the seam
  between them by a few pixels changes no shading. The flatness is **surface curvature and creases**,
  not part placement — see `docs/research/2026-08-31-photoreal-shadow-depth.md` (`.157`, `.158`).
  **A tessellated cushion with a sag + crease field was then built and also reverted** (v0.31.5.159):
  four iterations, ten passing tests, and micro/mean went **0.0470 → 0.0455 → 0.0452**, i.e. *down*
  every time. Smooth curvature catches light more evenly than a flat face with a crisp edge, so it
  LOWERS high-frequency contrast. The reference photographs' 0.157–0.174 comes from creases far finer
  than a cushion-sized deformation. Closing it needs cloth simulation or an authored crease normal
  map, not a tweak.

- **A built-in's tiled surface takes a PHYSICAL tile period, not a panel-relative one
  (KITCHEN-DETAIL, `kitchenDetail` flag, v0.33).** The kitchen counter's backsplash is now real
  glazed ceramic — `getTiledSurfaceMaterial(finish, colour, 0.6)` over the shared `subway`/`tile`
  procedural painters (`materials/procedural/patterns/tile.ts`), selected by a `backsplashFinish`
  prop (`subway` | `tile` | `solid`, default `subway`); with the flag off the slab renders the
  pre-v0.33 `#e4e7e3` panel byte-identically.
  · **`getSurfaceMaterialForBox` is the WRONG sizer for tile, and this was measured.** It derives
  the repeat from the panel's own metres (a grain scale), so on the 2.6 m run it produced
  `repeat (4.35, 0.8)` — and because `furnitureBoxUv` (MAT-006c) has already re-projected every
  parametric part's UVs INTO METRES, that repeat multiplies a metre UV and lands at
  **56 × 145 mm PORTRAIT tiles** (measured off the real-GPU frame: 30 px joint pitch at 538 px/m
  horizontally, 74 px vertically). Tile is a PRODUCT: 150 × 75 mm whatever the run measures. With
  metre UVs the correct repeat is simply `1/period` on both axes, which is what
  `materials/furnitureMaterials.ts:getTiledSurfaceMaterial` does (through `getSurfaceMaterialSized`,
  so it shares the quantisation + the owned-texture LRU) → repeat 1.65 → 151.5 × 75.8 mm. **Before
  sizing any tiled furniture panel, remember the UVs are already in metres.**
  · The tap is a `SinkMixer` local to `KitchenCounter.tsx` — escutcheon, Ø26 mm riser, a swan-neck
  `TubeGeometry` over a `CatmullRomCurve3` whose FIRST control point sits INSIDE the riser (so the
  structural-soundness harness sees one body), an aerator ring, and a side lever whose stem starts
  inside the riser — plus a Ø90 mm strainer on the bowl floor. It is deliberately not the standalone
  `MixerTap` primitive (the selectable `mixer-tap` fitting), which is floor-anchored with its own
  height/finish params. `hasSink` is not a `STRUCTURAL_ENUM_KEYS` key, so the harness only ever
  rendered the counter WITHOUT a sink — `EXTRA_STRUCTURAL_MODES['kitchen-counter-l']` now adds the
  `hasSink=yes` case, which is what asserts the tap at all.

- **Chamfer visible hard edges — `primitives/BeveledBox.tsx`, not a raw `<boxGeometry>`.** A razor
  90° edge is one of the strongest CG tells: real edges have a small radius that catches a thin
  specular highlight, and without one a slab reads as flat cardboard. `BeveledBox` is a drei
  `RoundedBox` with an auto-clamped chamfer (7 mm default; `safeBevelRadius` keeps it under half the
  thinnest side) and detail-scaled smoothness — a drop-in for `<mesh><boxGeometry/></mesh>`. Pass a
  smaller `bevel=` on thin members (≈3 mm on a 40 mm chair leg; the 7 mm default there reads as a
  dowel rather than a squared leg). Raw `boxGeometry` stays right for surfaces never seen edge-on
  (drawer interiors, carcass backs, hidden structure) and for instanced meshes, which cannot carry
  the chamfer.
  **Coverage is incomplete** (audited 2026-08-31, v0.31.5.145): **326 `boxGeometry` uses across 108
  files, and 48 primitives are still entirely sharp.** `DiningChair`, `FlatscreenTV`, `Monitor`,
  `Toilet` and `BarStool`'s step style were converted first as the most visible in the default flat;
  the rest is open work — take it by visibility, not alphabetically.

- **The seed-point rescue must avoid DOOR KEEP-OUTS, or the piece gets deleted (SETTLE-ORIGIN,
  v0.31.5.108).** `placeSeededMounts` pulls a piece off `seedRoom`'s room-centre placeholder,
  but three later passes can remove it — `dropOverlaps`, `dropDoorBlockers`, `dropWallClippers`.
  Measured across the 19 templates: overlap 102, **door 10**, wall 2, and the door casualties
  were exactly the kinds this pass moves. Flushing a fixture to the only wall it fits against is
  worthless when that wall sits behind a door swing. The slide loop therefore tests
  `doorKeepOutRects(levelAsPlan(plan, level))` as well as the furniture claims.
  · **Claims are level-wide and use `itemAabbBox`** — the same box the real broadphase uses, on
  BOTH sides. Same-room-only claims let a piece near a room edge land on a neighbour's
  furniture; mixing rotated and unrotated extents produced phantom clearance.
  · **Mounts neither reserve floor space nor yield to it.** The overlap narrowphase is
  height-aware (`itemsCollide` takes a `verticalSpan`), so a mirror above a basin is not a
  clash — verified, after `.106` asserted the opposite and `.107` retracted it.
  · **Never stack: a piece with no clear slot stays where it is.** Two earlier attempts traded
  20 misplaced fixtures for 7 deleted ones (900 → 893). Losing furniture is worse than leaving
  it misplaced, and the test that pins it is the item COUNT, not the stranded count.
  · Selection is by **category** (`bathroom`/`storage`/`seating`), not arrange-role: `bench` and
  `coffee-table` share role `lowTable`, `toilet` and `outdoor-table` share role `other`.
  `tables` and `textiles` are excluded — a rug or coffee table belongs at the room centre.
- **A kit-seeded WALL/CEILING MOUNT must be placed by `placeSeededMounts`, because the arranger
  will not move it (MOUNTED-SEED, v0.31.5.103).** `seedRoom` gives every kit piece the ROOM
  CENTRE as a placeholder, and `layout/autoArrange.ts:arrangeCore` treats role
  `'mounted'`/`'ceiling'` as FIXED — deliberately, so a fixture a USER positioned (or locked) is
  never shuffled. On the furnish-from-scratch path those two facts combine badly: the arranger
  faithfully preserves a position nobody chose. Measured before the fix: **19 of 19 shipped
  templates, 59 stranded fixtures** (`range-hood`, `bathroom-mirror`, `wall-mirror`, 2–6 each).
  On `tpl-terrace-ground` the `range-hood` sat at the kitchen's exact centre, 1.0026 m from the
  `stove`, hanging at `mountHeight` 1.5 m in open space — at the room-centroid walk pose that
  put a metallic cone 0.06 m above the walker's eye and blacked out the top of the frame
  (ceiling band 37 luma against the identically-sized dining room's 210; 223 after the fix).
  · **The guard is the whole safety argument: a mount is repositioned ONLY while it still sits
  at its room's exact centre (1e-6).** That is what makes it demonstrably an unplaced seed
  rather than someone's choice. **Do not widen it, and do not weaken `isFixed`** — moving
  user-placed mounts is exactly what that flag exists to prevent.
  · A `range-hood` follows the `stove` (position + rotation), which is what the default flat's
  hand-authored preset already does — there `stove` and `range-hood` share identical
  coordinates. Everything else goes `flushToWall` on `nearestWallEdge` via `layout/faceWall.ts`;
  don't hand-roll placement maths.
  · The pass is level-scoped through `planLevels`, so an upper-storey mount can never be pulled
  onto a ground-floor room. **The DEFAULT FLAT never exercises any of this** — `applyLayoutPreset`
  takes the `buildPresetItems` branch there and never runs this arranger, which is precisely why
  the bug survived: every visual round before `.95` was the default flat.
- **CPU-heavy steps run in a pooled Worker, never the main thread.** Three instances today:
  `optimize/runOptimize.ts` (Draco/WebP re-encode — its own from-scratch pool, don't refactor it),
  `convert/runConvert.ts` (OBJ/FBX/STL/… → GLB via `convertModel`) and `glbEdit/csgWorkerPool.ts`
  (CSG v2 boolean folds via `glbEdit/csgEval.ts:foldCsg` + `csg.worker.ts`, Stage 1b) — the latter
  two are built on the generic `furniture/worker/workerPool.ts`; **any new pool builds on it too,
  never a fourth copy of the pattern.** All: spawn-on-contention
  (reuse an idle worker before growing the pool), a worker `error`/`messageerror` retires only
  that worker (its own queued calls fall back, the rest of the pool is unaffected), idle-teardown
  after 30s so a burst doesn't hold its peak size all session, and a graceful **per-file** fallback
  to a direct main-thread call — never the whole batch — when no Worker is available at all. A
  THIRD such pool should build on `workerPool.ts` rather than copy the pattern again. The one
  DOM gap a Worker has for model conversion (`ImageLoader`'s `document.createElementNS('img')`
  texture decode, used by every texture-bearing convert format) is bridged by
  `convert/imageLoaderWorkerPatch.ts` (decodes via `createImageBitmap` instead — `GLTFExporter`
  already accepts an `ImageBitmap` for `texture.image`) — don't reintroduce a DOM-only image path
  in a new convert-adjacent worker without checking that file first. `upload/bulkImport.ts`'s own
  `concurrency` knob (how many files' convert→optimize→persist pipeline run in parallel, ahead of
  the two pools above) is likewise hardware-aware by DEFAULT — `defaultImportConcurrency` reuses
  the same `computePoolMax` ceiling so a batch doesn't over-queue a low-end pool or under-use a
  many-core one; an explicit caller-supplied `concurrency` always wins over the default.
- **New parametric item** = `primitives/<Name>.tsx` (a fn taking `{ props }`) + register in
  `primitives/index.ts` + the `PrimitiveKind` union + a `ParametricDef` in the matching
  `defs/<category>.ts` (assembled into `BUILTIN_CATALOG` by `builtinCatalog.ts`).
  Set `verticalSpan`/`mounted`/`noClip` for non-floor items; `lightEmitters.ts` to emit light
  at night; add to `defaults/` to ship in the move-in flat (collision-checked by
  `defaultLayout.test.ts`).
- **Parametric `Staircase` (F8/C171, `parametricStairs` pro flag).** Pure geometry in
  `primitives/staircaseModel.ts` (`buildStaircase` → treads/risers/landings/posts + rail/newel;
  `Staircase.tsx` only maps parts → boxes), like `cabinetModel.ts`. Straight / L / U / spiral;
  each step is a solid box stacked on the one below (closed stringer, grounded to the floor — no
  floating). **Instanced buckets (PERF):** `staircaseInstanceBuckets(parts)` (pure, in
  `staircaseModel.ts`) splits the ~40 per-part meshes into `risers` (one surface material) +
  `metal` (`post`/`rail`/`newel`, one brushed-metal material) — each ONE `InstancedBoxes` draw
  call — leaving `treads`+`landings` as `BeveledBox` meshes (their subtle chamfer catches light on
  the horizontal surface a foot lands on; there is no instanced beveled-box primitive, so
  instancing them would drop the chamfer — a visible regression on the most prominent surface).
  Rotation (incl. the rail's pitch/roll rake) bakes into the instance matrix as T·R·S, AE=0 vs. the
  old per-mesh `rotation={[pitch, rot, roll]}` (unit-tested, `staircaseModel.test.ts`). The
  per-item ghost/opacity path (`Furniture.tsx`) clones each mesh's material per-node, so it applies
  to the shared cached instanced material without mutating other staircases — unchanged behaviour.
  **Handrail is ONE continuous sloped rail per flight** (first→last post), tilted up the
  rake via a `pitch` (X, for Z-running flights) or `roll` (Z, for the turned X-running flight) field
  on `StaircasePart` — the renderer applies `rotation={[pitch, rot, roll]}`; NEVER a short
  horizontal cap per tread (that leaves per-step vertical gaps — a visual FAIL). Balusters/rail are
  inset to `width/2 - RAIL_T` so the rail's outer face isn't coplanar with the tread edge (the
  structural-soundness harness z-fights a flush face). **Honest footprint:** `staircaseFootprintParts`
  traces the L/U flights (an L occupies an L, not the full box) + a straight flight's depth tracks
  `steps × treadDepth`; wired as the `staircase` def's `footprintParts` function (`defs/others.ts`).
  The def is **hidden in Simple mode** — `useUnifiedCatalog(…, includeStairs)` drops it when
  `parametricStairs` is off. `analysis/stairConnectivity.ts:isStaircaseItem` recognises it by def id
  OR the `Staircase` primitive.
- **Extendable-table leaf keeps render + footprint in lock-step (CAT-B).** A drop-in leaf that
  widens a piece must widen its collision box by the SAME amount, or the extended top clips through
  neighbours. `defs/diningSeatDims.ts:diningLeafExtension(props)` is the single shared source of the
  extra width (0 unless `leaf:'extended'` on a rect top) — the `DiningTable` primitive adds it to the
  rendered top width AND the `dining-table-4` def's `footprintParts` adds it to the OBB. Never compute
  a leaf/extension delta in only one of the two; route both through one pure helper (the same
  render↔collision discipline the `seats` enum already uses via `diningSeatDim`).
- **Translucent fluted glass (CAT-B `FlutedPartition`).** A floor-standing fluted-glass screen reuses
  two existing pieces rather than new art: the vertical rib layout comes from
  `primitives/slatLayout.ts` (`battenCount`/`battenStep`/`battenOffset`, same as `RoomDivider`), and
  the panes/ribs share ONE `getGlassMaterial(tier, …)` instance (tier read from `useStore`, cheap
  transparent pane in `performance` → real transmission in `realistic`, like `GlassMaterial`). The
  half-round ribs are cylinders (`thetaLength: Math.PI`) so they never trigger the coplanar detector,
  and collapse to **one `InstancedCylinders` draw call** (unit half-cylinder scaled `[ribR,innerH,ribR]`
  — `InstancedCylinders` takes optional `thetaStart`/`thetaLength` for the arc, AE=0-equivalent to the
  old per-rib mesh, verified in `InstancedBoxes.test.ts`); the frame is one `InstancedBoxes` draw call.
- **Round/oval footprints (`footprintShapes.ts:ellipseFootprintParts`).** `footprintParts` is a
  UNION of OBBs — it can only add area, never carve a rectangle down to a disc — so a true
  circle/ellipse isn't representable exactly. `ellipseFootprintParts(width, depth, steps=4)`
  approximates one as a small "staircase" of axis-aligned boxes inscribed in the ellipse (each
  box's far corner sits exactly on the curve, so the whole union is a provable subset of the
  ellipse and therefore of the bbox); default `steps=4` yields 5 boxes. Wired into
  `defs/tables.ts`'s `footprintParts` for `dining-table-4` / `coffee-table` (round **and** oval
  both call it with the item's live `width`/`depth`, `[]` for `'rect'` → falls back to the single
  enclosing OBB, unchanged) and `side-table` (`'round'`/`'drum'` — the `diameter`×`diameter` bbox
  is already square, so the union is a true circle; `'square'` stays a single box). Pure geometry,
  render-agnostic, unit-tested in `footprintShapes.test.ts` (subset-of-ellipse + subset-of-bbox
  invariants, part count, degenerate/scale edge cases) with `canPlace`-level integration coverage
  in `collision/roundOvalFootprint.test.ts` (corner freed vs centre still blocked, scale/rotation).
- **Window-bound fixtures (`def.windowBound`, WINDOW-FIXTURE)** — curtains, roller blinds, and any
  other fixture that lives ON a window — place ONLY on windows and are static once placed. Setting
  `windowBound: true` does three things: the inspector hides the Transform section + Rotate/Flip
  actions, the scene drag is blocked (`Furniture.tsx`), and at placement time the fixture **snaps to
  the nearest window opening**. The **2D plan editor mirrors the same gating** (`PlanFurnitureInspector`
  hides X/Z/angle + shows a "fixed to its window" hint but keeps the size fields; `FurnitureRotateHandle`
  renders nothing; `FurnitureLayer`'s footprint keeps the fixture selectable but never starts a move
  drag) — a fixture can't be detached from its window on either surface. Placement **snaps to
  the nearest window opening** via the pure `placement/windowSnap.ts:snapToNearestWindow(walls,
  openings, dropPos)` — both the commit (`ui/catalog/usePlacementController.ts`, bypassing the floor
  `canPlace` gate; an info toast + no-add when the plan has no window) and the `scene/PlacementGhost`
  preview (snaps the ghost, keeps the raw drop point in `ghostWorld` so the commit re-derives the same
  snap incl. facing). The **2D plan editor** places them the same way (PLAN-FURNISH Phase 3):
  `ui/floorplan/editor/planFurnishPlacement.ts:buildPlanWindowGhostItem` wraps the same
  `snapToNearestWindow` + `windowFixtureProps` pair scoped to the EDITED level's walls/openings
  (`levelAsPlan`), ghost and commit both snapped; no-window levels toast + disarm on arming.
  Window grilles stay an opening `style` (`grille`/`invisible-grille`/`louvre`), not a fixture.
  Placement also **sizes** the fixture to its window via the pure `windowFixtureProps(defId, window,
  ceilingHeight)` — curtains wider than the glass + floor-to-ceiling, blinds slightly wider with a
  covering drop. The `Curtain` primitive is a **double-sided wavy draped sheet** (two gathering panels,
  `drawAmount` 0 = open/clear, 1 = drawn) and `RollerBlind` **raises/lowers** (`lower` 0 = up, 1 =
  down); both ease in demand mode (hold `registerAnimatedSource` only while moving). The closed amount
  (curtain `drawAmount` / blind `lower`) feeds `windowLightModifiers.curtainDrawAmount` for graduated
  daylight attenuation. Both are customizable as **fabric surfaces** (CURTAIN-FABRIC): a `material`
  weave (cotton/linen/velvet — **fabric only**, no wood/stone) + a `pattern` (the shared tone-on-tone
  set, now on blinds too) + `color`, mapped via `materials/furnitureMaterials.ts:getDraperyMaterial`.
  A separate **opacity / light-blocking** axis `lightBlock` (sheer → light-filtering → room-darkening
  → blackout, CURTAIN-OPACITY / `materials/draperyOpacity.ts`) drives BOTH the rendered transparency
  (passed as `getDraperyMaterial`'s `opacity`) AND the daylight blocked (`windowLightModifiers`
  `curtainTransmission` — blackout blocks nearly all). Legacy `material: 'sheer'` maps to the sheer
  opacity. **Walk-mode toggle (WINDOW-FIXTURE-INTERACT)**: click/tap or press E on a placed
  curtain/blind to flip its `drawAmount`/`lower` between 0 and 1 (a discrete step, like a door's
  fixed swing — not a partial drag), gated behind the `walkWindowFixtures` flag (simple tier) and
  `isInteractableWindowFixture(def)` (`furniture/windowFixtureInteract.ts` — true only for a
  `windowBound` def whose primitive is `Curtain`/`RollerBlind`). Unlike doors (a fixed
  `DoorSpec`/`PlanOpening` table + a separate `doors` store slice), a fixture's open/closed value
  already lives on the placed item's own `props`, so the toggle (`toggleWindowFixture`,
  `state/slices/windowFixtureSlice.ts`) just patches `items` — no new schema field, it round-trips
  via the existing `items` persistence. `FirstPersonCamera`'s E-key aim reuses the door aim's exact
  ray/segment math (`collision/aimRay.ts:nearestAimedSegment`) against per-item segments built by
  `windowFixtureAimSegments` (recomputed from live `items`, unlike doors' precomputed table, since a
  fixture can be placed/moved). Every interact entry point (this click, the door click, the E-key
  handler in `App.tsx`) is gated through the single `state/editing.ts:dispatchWalkInteract` — orbit
  mode never toggles a door/fixture, only walk mode does (VIEW-EDIT-SPLIT). Venetian-blind slats
  render through **one rotation-capable `InstancedBoxes` draw call** (the earlier instancing pass
  had to skip them because the slats tilt): `bakeInstanceMatrix` now bakes an optional per-instance
  Euler rotation as `T·R·S` (size innermost), so a tilted instance is exactly equivalent to a
  `<mesh position rotation>` box — verified byte-identical (AE=0) across the raise/lower range. The
  slat layout is pure geometry in `primitives/slatLayout.ts` (`venetianSlatInstances`/
  `venetianSlatCount`, unit-tested); the raise/lower toggle stays a Y-scale on the parent group.
  **Zebra/combi** (`kind:'zebra'`, SG's most popular blind) reuses the same anchored-stack pattern
  for its alternating opaque/sheer bands (`zebraBandInstances`, two `InstancedBoxes` buckets — one
  material per band type, since a shared instanced material can't vary opacity per instance) —
  the sheer band rides the drapery sheer-opacity path (translucent cloth, not a flat tint).
  **Roman** (`kind:'roman'`) is a small fixed stack of overlapping `RoundedBox` folds right under
  the cassette (`romanFoldOffsets`, few enough to render as plain meshes) plus the ordinary flat
  roller panel below, scaled by `lower` exactly like the roller.
  The **drying rack** does the same for its rods via the sibling `InstancedCylinders`
  (unit-cylinder scaled `[radius, length, radius]` + rotation; `dryingRackCylinders` in the same
  module) — all 11 legs/rails/bars collapse to one draw call (bars unified to the leg tessellation).
- **A curtain's standoff is derived from the wall FACE, never typed (CURTAIN-FLUSH, flag
  `curtainFlush`, simple, default on).** `placement/curtainStandoff.ts` is the pure derivation and
  `apartment/windowProjection.ts` the geometry it clears; `Curtain.tsx`, `windowFixtureProps` and
  the seeded default flat all read them, so no number is written twice.
  · **The panel plane sits at `wallFace + max(0.10, sillProjection + openTrough + 0.01)`**, measured
    from the wall CENTRE-line the snap plants the item on, and the standoff is that minus the
    primitive's baked-in `CURTAIN_PANEL_BASE_Z` (0.05). `windowInteriorProjection(t)` is how far the
    window assembly reaches past the face (0.04 on a 0.2 m external wall, **0.09 on a 0.1 m internal
    one** — same sill ledge, less wall around it), and `openTrough` is `FOLD_DEPTH × 1.02 × 1.8 =
    0.092`. On the default flat that is a **0.142 m panel plane / 0.132 m rod off the face**,
    standoff **0.192**.
  · **A ≤ 0.03 m "flush" wall gap and a clear sill are mutually exclusive, and this is arithmetic,
    not a tuning choice.** An OPEN panel bunches at the curtain's outer edges, which still straddle
    the sill ledge (the ledge is `glass + 0.10` wide, the curtain `glass + 0.36`), so any plane
    closer than `sillProjection + openTrough` buries the gathered folds in the sill — i.e. the wall
    gap can never be smaller than `sillProjection` (0.04). No-penetration wins; measured, the open
    troughs clear the bare face by 0.052 and the sill by 0.086 (bedrooms) / 0.025 (living).
  · **The old `CURTAIN_SILL_STANDOFF = 0.2` was very nearly RIGHT, and the real bug was the SEED
    POSITIONS.** The four hand-authored entries in `defaults/` sat 0.18 m (bedrooms) / 0.22 m
    (living) off the wall centre-line their own snap plants a curtain on, and the standoff was added
    on top — 0.33 / 0.37 m of fabric-to-face where the standoff alone would have given 0.15. The fix
    is therefore `defaults/curtainFlush.ts:applyCurtainFlush`, a pass inside `defaultLayout()` that
    re-derives position/rotation/standoff through the SAME `snapToNearestWindow` the live placement
    uses. **Do not re-type corrected coordinates into the tables** — that is exactly what drifted.
  · **The rod ducks under a mount over the window, and the discriminator is a CAP, not a height
    test.** `curtainRodHeight` lowers the rod so its top (`height + 0.04 + 0.025`, the finial, not
    the bar) clears an obstacle's underside by 0.03 — the living room's aircon fan-coil (body
    2.10–2.40 m) takes the rod from 2.55 to **2.005**. An obstacle it cannot clear within
    `CURTAIN_ROD_MAX_DROP` (0.7 m) is IGNORED: the main bedroom's reading sconces at 1.45 m also
    overlap the drape, and "clearing" them would hang a knee-high curtain.
  · **Read the OBSTACLE span off the rendered body (`mountHeight ± h/2`), not `verticalSpan`.** The
    aircon's collision envelope is 1.9–2.55 against a real 2.10–2.40 body; clearing the envelope
    would have cost the curtain a further quarter metre it never needed.
  · **Verify with GEOMETRY, not frames** — `scripts/dev-probes/curtain-clearance.mjs` samples every
    fabric vertex through its real `matrixWorld` in both draw states and reports the signed distance
    to the wall face, sill, frame, grille and every mount. A trough 30 mm inside a sill is invisible
    from every camera. Two traps it encodes: measure in the **snap** frame (measuring in the ITEM's
    frame silently subtracts the very drift being measured), and reach the OPEN state by ANIMATING
    out of drawn — `Curtain.tsx` only applies the open state's deeper `depthScale` (1.8) inside its
    `useFrame` easing, so a curtain that has never animated renders at z-scale 1 and understates its
    own fold depth by 45%.
  · **KNOWN, not fixed:** with the curtain flush, the main bedroom's drawn drape now passes 0.063 m
    into the reading sconces' footprint (it cleared them by 0.103 before). The shipped default is
    `drawAmount: 0`, where it clears by 0.147, and the sconces sit INSIDE the curtain's span at
    x 1.1 / 2.3 against a 0.75–2.65 curtain — a content siting question (like CURTAIN-NIGHTSTAND),
    not a placement-rule one.

- **Screen wallpaper cycle (WALK-SCREEN-INTERACT)**: click/tap or press E on a placed screen to
  advance `props.screenContent` to the next option, wrapping around. "Screen" is a **capability**,
  not a def-id list: `isInteractableScreen(def)` (`furniture/screenInteract.ts`) is true for any
  *parametric* def whose `paramSchema` carries a `screenContent` enum field — today that's
  `monitor`/`flatscreen-tv`/`tv-wall`, which all share the `Monitor`/`FlatscreenTV` primitives and
  the same 3-option enum (`landscape`/`sunset`/`abstract`, rendered by
  `primitives/screenContent.ts:getScreenContent`) — so a future screen def that reuses the same
  field is automatically covered with no eligibility-list edit. Gated by the `walkScreens` flag
  (simple tier); state in `state/slices/screenInteractSlice.ts` (`nearbyScreenId` +
  `cycleScreenContent`, no new schema field — `screenContent` already round-trips via `items`).
  Prompt copy is fixed ("Change wallpaper") since every screen def shares the same cycle
  semantics; a future screen kind with genuinely different content can branch in
  `screenInteract.ts:screenLabel` the way `windowFixtureLabel` branches on Curtain/RollerBlind.
- **Light on/off toggle (WALK-LIGHT-INTERACT)**: click/tap or press E on a light-capable item to
  flip it on/off — a registered `lightEmitters.ts` fixture (table/floor lamp, wall sconce,
  ceiling light/fan, cove light, vanity, aquarium) OR any item already flagged via the
  `itemAsLight` inspector override, keyed on `isInteractableLight(defId, props)`
  (`furniture/lightInteract.ts`), not a hardcoded list. The toggle is a discrete flip of
  `props.lightOn` between on (`'yes'`/absent) and off (`'no'`) — mirroring curtains/blinds'
  binary `drawAmount`/`lower` flip, not a dimmer. See `lightEmitters.ts` for how this composes
  with the scene-wide `lightsMode` brightness multiplier (per-item toggle always wins — a
  switched-off item is excluded from the active-lights set in every `lightsMode`, not merely
  dimmed). Gated by the `walkLights` flag (simple tier); state in
  `state/slices/lightInteractSlice.ts` (`nearbyLightId` + `toggleLightPower`, no new schema
  field). Prompt copy is "Turn on/off {def.name, lowercased}" — generic across every registered
  fixture, no per-primitive noun table needed. Screens and lights are the first pair of
  walk-mode interactables to use genuine **nearest-wins** disambiguation instead of the fixed
  door>fixture priority order: `FirstPersonCamera` merges their aim segments into a single
  `nearestAimedSegment` call (id-prefixed `screen:`/`light:`) so whichever is physically closer
  claims the "nearby" slot.
- **Cabinet open/close (CABINET-OPEN)**: cabinet-family primitives with visible fronts —
  `CabinetBase`/`CabinetWall`/`CabinetTall` (kitchen), `Wardrobe` (hinged doors), `Sideboard`,
  `Dresser` — swing their doors + slide their drawers open with an eased ~0.4 s motion, mirroring
  the room-door swing + curtain/blind draw. Like curtains, the open/closed value lives on the
  placed item's own `props.open` (`'yes'`/`'no'`, default absent = closed), so it round-trips via
  the existing `items` persistence with **no new schema field or slice** — the inspector toggle
  just calls `updateItemProps`. Capability is keyed on the primitive kind
  (`cabinetOpen.ts:OPENABLE_CABINET_PRIMITIVES` / `supportsCabinetOpen(def)`); the pure hinge/ease
  math (`easeInOut`, `advanceOpen`, `doorHingePivot`) is unit-tested and render-agnostic. The
  animation runs in the shared `primitives/openable.tsx` `HingedDoor`/`SlideDrawer` wrappers, which
  ease toward the target each frame and hold the demand render-loop + frozen shadow map open only
  while moving (`registerAnimatedSource` + `pulseShadowRefreshForMotion`, exactly like
  `Curtain`/`RollerBlind`). `cabinet/cabinetModel.ts` tags each front `CabinetPart` with its
  `column` (+ door `hinge` side) so `CabinetModule` can group a column's parts into one animated
  unit. Gated by the `cabinetOpen` flag (simple tier — a furnish/view delight, not an analytical
  tool). The inspector control lives in `ui/inspector/ParametricBody.tsx`, shown only when the flag
  is on AND `supportsCabinetOpen(def)`.
- **Real planar mirrors are gated on RELEVANCE, not just on tier (MIRROR-RELEVANCE).**
  drei's `<MeshReflectorMaterial>` re-renders the ENTIRE scene from the mirror's plane inside its
  own `useFrame`, unconditionally — no frustum test, no visibility test, no throttle. Attributed
  with `scripts/dev-probes/render-attrib.mjs` on a Mac mini M4, ONE orbit frame at High: the
  beauty pass was 2130 draw calls and the mirror's reflection was **1710 draw calls / 464K tris —
  43% of the whole frame** for a bathroom pane a few dozen pixels tall. It is also
  FIXED-resolution (512²/1024²), which is why the post tiers' cost barely tracked screen
  resolution at all (7× the viewport pixels moved orbit FPS by ~9%; the frame was never
  fill-bound). Gating it took an orbit frame at High from **4,002 draw calls to 2,283** and from
  two full-scene passes to one. (Earlier revisions of this note quoted an fps gain; those numbers
  came from a probe counting `requestAnimationFrame` ticks, which under `frameloop="demand"` is not
  the render rate — see `scene/frameCost.ts`. Measure cost with `scripts/dev-probes/frame-time.mjs`.)
  So `mirrorReflectorConfig(tier)` now only says a reflection is PERMITTED; `useMirrorRelevance`
  decides whether it is WORTH it, and every `MeshReflectorMaterial` call site goes through it
  (`MirrorMaterial` — used by `Mirror`/`WallMirror`/`FloorMirror`/`Wardrobe` — plus `GltfModel`'s
  detected-GLB `ReflectorOverlay`). Rules, pure + unit-tested in `mirrorRelevance.ts`:
  the pane must cover ≥ `MIRROR_REAL_ON_FRACTION` of viewport HEIGHT to engage and drops below
  `MIRROR_REAL_OFF_FRACTION` to release (wide hysteresis band — every flip is a material swap,
  i.e. a shader recompile), and at most `MIRROR_REAL_BUDGET` panes hold a reflection at once.
  **Resolve hysteresis and the budget TOGETHER over the whole candidate set** (`rankRealMirrors`),
  never per pane: a pane cannot see that a bigger mirror already claimed the budget, and the
  first cut of this let two bathroom mirrors both render a full extra scene pass. The gate is
  throttled on a camera-move threshold (like `lighting/chooseEmitters.ts`) and never flips while
  a camera gesture is held (like `InteractiveDprController`). Verify BOTH directions with
  `node scripts/dev-probes/mirror-gate.mjs` — a gate that never upgrades has silently deleted the
  feature while looking like a pure perf win. NOTE when writing such a probe: drei's reflector
  EXTENDS `MeshStandardMaterial`, so `material.type` cannot tell the two apart — discriminate on
  its `uniforms.textureMatrix`.
- **Categories**: 16 `FurnitureCategory` values. A new one must update the union,
  `FURNITURE_CATEGORIES`, **every** exhaustive `Record<FurnitureCategory,…>` consumer the
  type-checker flags, and `ui/catalog/CategoryTabs`/`CategoryIcon`. Category is auto-detected
  for imports, **never** typed by hand. The `pets` category (Pet program) is gated behind the
  `petFittings` flag: `useUnifiedCatalog(includeRemote, includeShared, includePets)` zeroes the
  pets block when off so the tab hides + its cards never surface (browse/search/favourites).
- **Door-bound fixtures (`def.doorBound`, DOOR-FIXTURE)** — pet gates, pet-door inserts, and any
  fixture that spans a doorway — are the door analog of `windowBound` (above): placed ONLY on a
  door opening, static once placed (inspector hides Transform, scene drag blocked, 2D plan
  gating mirrored), and at placement **snap to the nearest door** via the pure
  `placement/doorSnap.ts:snapToNearestDoor(walls, openings, dropPos)` (a clone of `windowSnap`
  filtering `kind==='door'`, spanning `op.width`, floor-anchored at the opening). Threaded through
  the SAME three call sites windowBound uses — `usePlacementController` commit (`commitDoorBound`),
  `scene/PlacementGhost` preview, and the plan editor (`planFurnishPlacement.ts:buildPlanDoorGhostItem`
  + `planHasDoor`, wired in `FloorPlanEditor`). `doorFixtureProps(defId, door)` spans the fixture
  to the doorway. Every `windowBound` gate that means "static fixture" (`Furniture.tsx` drag,
  `ItemActionButtons`/`InspectorPanel`/`PlanFurnitureInspector` Transform, `FurnitureLayer`/
  `FurnitureRotateHandle`) now also checks `|| def.doorBound`.
- **Per-part finish** of any GLB: a placed item's `props['finish:<materialOrMeshName>']` re-skins that
  named group — value is either a hex `#colour` (retints the part's own material, keeping its maps) OR a
  material token (`wood`/`marble`/`stone`/`metal`/`rattan`/`concrete`/`painted`/`gloss`/`mat:<id>`,
  resolved via `getSurfaceMaterial` and swapped in). `selectGltfRender` collects these for **every** GLB
  kind (IKEA, builtin, upload, remote), merging over any def-level `finishOverrides` (item wins) and
  dropping blanks. `GltfModel`'s apply pass captures each touched part's **original** material once
  (`userData.__finishOrig`) and restores it each run, so clearing one finish among several reverts that
  part cleanly. The inspector (`GltfBody`) lists a model's parts from `getCachedFinishTargets(url)` —
  `GltfModel` runs `listFinishTargets` once on load, caches by base url, and fires
  `subscribeFinishTargets` so the panel shows the per-part colour/material pickers as soon as the model
  is ready. (LOD note: material/mesh names can differ between tier variants, so the cached targets
  reflect whichever variant rendered.)
- **Pre-placement finish/variant resolution (CATALOG-VARIANT) was removed.** The pure
  `placement/catalogVariants.ts` module + its `CatalogVariantPopover` card popover are gone (the
  card finish-picker was mobile-broken and redundant with the inspector). The generic
  `placementSlice.armWithVariant`/`armedVariantProps` plumbing — merged over `defaultItemProps(def)`
  at commit by `usePlacementController.ts` — remains (tested, UI-unused) for a future variant-arming
  entry point. Post-placement finish selection is the inspector's `IkeaBody`/`ikeaBodyProps.ts` +
  FinishPicker/QuickFinishes.
- **All GLB items** (bundled CC0 / user uploads / IKEA) render through `GltfModel`/`gltfRender.ts`
  — set the same collision flags; run `npm run optimize:glb` for `-low`/`-medium` LOD variants
  (uploads generate theirs in-browser via `optimize/lodVariants.ts`, routed by the `gltf/lod.ts`
  variant registry).
- **Every GLB loader — convert or render — must block foreign fetches (SEC-1).** A model's own
  embedded `buffer[].uri`/`image[].uri` can be an absolute URL; without a guard, three.js fetches
  it verbatim at parse/render time — a crafted/shared model could beacon out to an attacker host
  just by being opened. `gltf/loaderSecurity.ts` is the **one** shared allow/block policy: allow
  `data:`/`blob:` (every user/IKEA/remote asset is pre-fetched to a `blob:` `runtimeUrl` before it
  ever reaches a loader) and same-origin absolute URLs (the app's own bundled/served GLBs +
  sibling `.bin`/texture files); block everything else, resolving to a blank fallback rather than
  throwing. `secureGltfLoader` is drei `useGLTF`'s `extendLoader` injection point — pass it as the
  4th arg (`useGLTF(url, true, true, secureGltfLoader)`, keeping `true, true` so DRACO/meshopt
  defaults aren't dropped) on every runtime `useGLTF` call site (`GltfModel.tsx`,
  `ui/catalog/thumbnails.tsx`, `ui/glbEditor/DesignerViewport.tsx`); it mutates only the single
  `GLTFLoader` instance drei memoizes for `useGLTF` (never `THREE.DefaultLoadingManager`), so
  material/HDRI loaders elsewhere are untouched. A raw `GLTFLoader` (not via `useGLTF`) —
  `catalog/packs/thumbnail.ts`'s `ThumbnailRenderer` — takes `getSecureGltfManager()` straight into
  its constructor. `convert/loadToObject.ts`'s drag-drop-conversion manager is stricter (a closed
  sibling-file allowlist, since local drops have no real "origin") but shares the same
  `isEmbeddedOrBlobUrl`/`BLOCKED_RESOURCE_FALLBACK` primitives — don't fork a second copy of the
  policy; any new GLB loader (convert or render) must route through this module.
- **Pre-render footprint seed for GLB defs.** A GLB's true footprint is only learned after
  `GltfModel` renders + caches its bbox (`FOOTPRINT_CACHE`), so anything placed/sized/collided
  *before* first render needs a real seed, not a 1×1×1 guess. Two pure helpers do this from glTF
  POSITION accessor `min`/`max` (no render): `catalog/packs/footprint.ts:glbFootprint` (GLB *bytes*,
  used by the pack/upload path) and `catalog/remote/gltfBounds.ts:gltfJsonFootprint` (parsed glTF
  *JSON*, used by `catalog/remote/resolver.ts:bundleToFurnitureDef` for remote furniture defs).
  Both union multi-mesh bounds, clamp axes ≥0.05 m, reject absurd non-metre scales, and fall back
  to the caller's 1×1×1 placeholder when bounds are unavailable. The render-time cache stays
  authoritative — these only make the pre-render value honest. The same `def.defaultFootprint`
  this seeds is also the input to the catalog's "fits this room" size cue
  (`catalog/roomFit.ts:itemFitsRoom`, CATALOG-FITS, see `src/ui/CLAUDE.md`) — one more reason a
  placeholder 1×1×1 must never be reported as confidently "fits"/"won't fit" (the predicate treats
  a degenerate footprint as `'unknown'`, not a guess).
- **GLTF cache eviction on removal (PERF-001/008).** When a GLB asset is removed/replaced/
  uninstalled, call `evictGltfAsset(url)` (`GltfModel.tsx`) so its parsed GPU geometry/textures
  leave the drei `useGLTF` cache and are disposed, and its `FOOTPRINT_CACHE`/`SUPPORT_PLANE_*`
  entries are pruned — otherwise GPU memory ratchets toward context loss over a session. It evicts
  the base url **and** every tier-variant url (`lodUrlsForBase` in `gltf/lod.ts`); GPU disposal is
  deferred one frame so the asset's instances unmount first. It is wired into `freeResource`
  (`state/slices/userAssetsSlice.ts`) and `markPackUninstalled` (`installedPacksSlice.ts`). **Only
  evict an asset no live item still references** (pack uninstall guards on placed `items`; user/IKEA
  removal drops the def + its items together). Any NEW asset removal/replace path must call it too.
- **Pure geometry stays render-agnostic + unit-tested** (e.g. `cabinet/cabinetModel.ts`
  `buildCabinet`, `parametric/buildParts.ts` `buildParametric`); the primitive/renderer only
  maps parts → meshes/materials. The parametric generator (`parametric/`) saves through the
  GLB-designer path (`exportGlb` → `persistUserGlb`) so its output is a regular user def —
  don't invent a parallel persistence channel for generated geometry.
- **Parametric types** (`parametric/spec.ts` `ParametricType`): `bookshelf` / `wardrobe` /
  `sideboard` / `desk` / `kitchen-run`. Adding a new type: extend the union + `PARAMETRIC_TYPES`
  + `PARAMETRIC_TYPE_LABEL` + `PARAMETRIC_LIMITS` + `DEFAULT_SPECS` + `clampSpec` handling;
  add a `build<Type>` function in `buildParts.ts`; add a controls branch in
  `ui/parametric/ParametricControls.tsx`; add a feature flag if the type needs its own gate;
  add unit tests in `parametric/__tests__/<type>.test.ts`; add a scenario ladder
  (`scripts/scenarios/parametric-<type>-simple.json` + journey). Kitchen-run specifics:
  `kitchenCabinets` flag (tier: `simple`), `TYPE_CATEGORY` maps to `'kitchen'`. Every
  generated piece's `ParametricSpec` round-trips onto its saved def as
  `UserGltfDef.parametricSpec` (JSON string, set by `saveParametricAsset` → `persistUserGlb` →
  `hydrateAssets.ts`/`schema.ts`, the same pattern as `slotSpec`/`assetSpec`) — this is what
  lets `carpentryElevation.ts` (below) rebuild a placed piece's exact geometry for its drawing-
  set sheet without a parallel model; adding a new `build<Type>` here is what a new type's
  carpentry cut/dims are derived from, so no extra wiring is needed there beyond
  `pickSectionCut`'s per-type branch.
- **Carpentry/joinery elevations + sections (TODO G8, `carpentrySheets` flag, pro).**
  `carpentryElevation.ts:buildCarpentryPiece(spec)` is the pure geometry step for the drawing
  set's per-piece "Carpentry — `<name>`" sheet (see `docs/ARCHITECTURE.md` for the full design):
  it reuses `buildParametric`'s part list unchanged, projects it to a front elevation (drop Z)
  + one representative section (a per-type cut X reconstructed from the parts' own bay-boundary
  positions, never a second bay-math formula), and reads every dimension (overall W/H/D, bay
  widths, panel/plinth/worktop thickness, shelf/rail/drawer-front heights AFF) straight off the
  cut parts — never inventing a number the spec/parts don't already encode. `ui/carpentrySheets.ts`
  resolves + dedupes placed instances via each def's persisted `parametricSpec` (see the bullet
  above); `ui/carpentrySheetSvg.ts` renders the dimensioned SVG (mm-only labels, dashed hidden
  lines, a `declutterLabelY` collision pass for closely-stacked AFF heights). **Buildability
  callouts (TODO H2):** `buildCarpentryPiece` also returns `sectionTitle` ("SECTION A-A") +
  `elevationCutX` (drawn by `carpentrySheetSvg.ts`'s `cutX` opt as a dash-dot cut-line + "A"
  bubbles on the elevation only) and `materialNotes`/`hardwareCallouts` (both exported, pure,
  unit-tested) — an honest finish/board/edge-banding note (hedged "confirm … with fabricator",
  never an invented laminate code; `"TBC by fabricator"` when a thickness can't be read off the
  parts) and a hardware note whose counts are read straight off the piece's real
  `door`/`handle`/`drawer-front`/`drawer-handle` parts — never estimated from the spec alone.
  `role:'door'` doesn't distinguish a wardrobe's sliding vs hinged front, so `hardwareCallouts`
  is the one place that reads `spec.wardrobeFront` (sliding → track+rollers; hinged → a hinge
  count via the standard 2-per-door-≤1200mm/3-above rule); every other type/bay is generic over
  the shared role vocabulary. Zero doors + zero drawers → "shelf supports as required by
  fabricator" (the spec has no fixed-vs-adjustable field to report). Scoped to the 5
  `ParametricType`s only — a standalone kitchen-cabinet catalog item (`cabinet/cabinetModel.ts`
  `buildCabinet`, placed via `primitives/CabinetModule.tsx`) keeps its spec live on the item's own
  `props` (no GLB-export/spec-loss step to begin with) rather than a persisted `parametricSpec`
  JSON string, so it doesn't share this exact resolution path yet — a future extension would add
  a `CabinetSpec`-based sheet builder alongside this one, not fold it into
  `collectCarpentrySheets`.
- **Array helpers** — pure geometry, render-agnostic, unit-tested, no store imports:
  - `arrayPlacement.ts` — linear/grid array:
    - `arrayOffsets(src, count, spacing, axis)` — N evenly-spaced positions along the item's
      local `'right'` (+X), `'left'` (−X), `'forward'` (+Z), or `'back'` (−Z), honoring
      Y-rotation. Count capped at `ARRAY_MAX_COUNT` (200).
    - `gridArrayPlacements(src, opts)` — 2D `cols × rows` grid of positions with independent
      `colSpacing`/`rowSpacing` and `colAxis`/`rowAxis` (defaults: right/forward). Source cell
      (0,0) excluded from output. Spacing clamped to ≥ 0.001 m; total capped at `ARRAY_MAX_COUNT`.
    - Both functions return only positions; the UI in `InspectorPanel.tsx` does collision-checking,
      batches commits via `setItems`/`pushHistory`, and surfaces a dropped-count toast.
  - `radialArray.ts` — radial/polar array: N positions around a circle with optional
    `faceCenter` yaw. Facing convention: `atan2(-cos angle, -sin angle)` so the item's
    Three.js local +Z points toward the center. A sweep `>= 2π − RADIAL_SEAM_EPS` (~1e-3 rad —
    incl. a dragged "almost full circle") is treated as **full-circle** (exclusive seam,
    `step = 2π/n`), so a near-2π drag can't double-up at the seam (BUG-RADIAL-FULLCIRCLE);
    smaller sweeps use the inclusive-both-ends partial formula `sweep/(n−1)`. Gated by the
    `radialArray` Pro flag (and `proMode`) in `InspectorPanel.tsx`; committed via `setItems` in
    a single undo step.
  - `pathArray.ts` — path/polyline array (PARITY-DUP-PATH): `pathArrayPlacements(points, opts)`
    samples N copies along an ordered polyline by **arc-length** (evenly along the path, not
    chord-spaced), with optional tangent-facing yaw (`align`, facing `atan2(dx, dz)` so +Z
    follows the travel direction) and `mode: 'count' | 'spacing'`. Handles <2 points, zero-length
    segments, closed-vs-open loops, and spacing > path length; capped at `PATH_ARRAY_MAX_COUNT`
    (200). The path source is any **plan polyline** (`floorPlan.polylines`, PARITY-POLYLINE). Gated
    by the `pathArray` Pro flag (+ `proMode`); the UI lives in a sibling
    `ui/inspector/PathArraySection.tsx` (not InspectorPanel) which collision-checks each copy
    (skip-and-report blocked slots, like radial) and commits via `setItems` in a single undo step.
- **Selection axis-mirror (FEAT-2)** — `mirrorSelection.ts`: pure, unit-tested, no store
  imports. `mirrorSelection(items, axis)` reflects a whole selection as a **rigid group** about
  its own centroid line (`selectionCentroid`) on a room axis — `'x'` reflects X (left↔right,
  keeps Z), `'z'` reflects Z (front↔back, keeps X) — preserving the spacing between pieces. Per
  item: `mirrorPosition` flips the perpendicular coordinate; `mirrorRotation` flips the Y-yaw
  heading consistent with `layout/faceWall.ts`'s `(sin θ, cos θ)` forward convention (`-rotation`
  for axis `'x'`, `π - rotation` for axis `'z'`); `mirrorItem` also toggles the matching
  `flipX`/`flipZ` in-place mirror flag so an asymmetric piece (an L-sofa, a chaise) reads as its
  true mirror image. `layout/selectionActions.ts:mirrorSelectionAxis(catalog, axis)` wires it to
  the store — collision-checks every mirrored placement and commits **all-or-nothing** (a piece
  that would clip a wall on the far side never leaves the layout half-mirrored), one undo step via
  `moveItem`/`rotateItem`/`flipItem` (never per-item pushes). The pre-existing left↔right-only
  `mirrorSelectionX` (used by the command palette + 2D plan editor, both ungated) is now a thin
  `mirrorSelectionAxis(catalog, 'x')` wrapper — unchanged behavior/call sites. The **Z-axis**
  option (+ the explicit "Mirror X"/"Mirror Z" pair of buttons replacing the single ungated
  "Mirror" label) is gated by the `mirrorSelection` Pro flag in `MultiSelectPanel.tsx` (3D room
  editor, shared desktop/mobile) and the `sel-mirror-z` ⌘K command (`sel-mirror` stays ungated).
- **In-canvas catalog consumers** use `catalog.ts` `useCatalogGetter` (non-rendering
  subscription) so catalog churn never re-renders the R3F tree. Bulk/IKEA imports **batch
  store writes** (`runImport.ts`) — never commit per-item (O(n²) catalog rebuilds → WebGL loss).
- **Universal parametric resize (CUSTOMIZE-PARAM-SIZE)**: any parametric item scales via
  `props.scale` (+ optional per-axis `scaleX`/`scaleY`/`scaleZ`). `Furniture` wraps the primitive in a
  `<group scale=…>` (about its floor-anchored, footprint-centred origin; no wrapper at 1×), and
  `collision/placement.ts:itemFootprint` already multiplies the same props into the footprint — so
  render + collision stay consistent. The inspector's `ParametricBody` Size section sets them (uniform
  / per-axis / exact metres, mirroring `GltfBody`). Primitives stay pure geometry — don't read scale
  inside a primitive; let the group handle it. (Decor auto-styling still reads `def.defaultFootprint`
  unscaled — a minor density/height imperfection for a *scaled* decor host, not a crash.)
- Match the surrounding primitive style: real-world metres, real three `Material` instances.
- **Appliance bodies (MAT-004b — single representation)**: the 8 steel-bodied appliance primitives
  (`Refrigerator`/`Oven`/`Stove`/`RangeHood`/`Dishwasher`/`Microwave`/`WashingMachine`/`WineCooler`)
  render their carcass through `primitives/shared.tsx:applianceBodyMaterial(color, finish)`, which
  returns **ONE `Material` instance for EVERY finish**, always set on the body mesh's `material=`
  prop: steel → the shared brushed-metal material (`materials/furnitureMaterials.ts:getMetalMaterial`);
  matte/gloss/unknown → a shared painted material (`getSolidMaterial(color, roughness, metalness)`
  with the exact `applianceFinish` preset — byte-identical to the old inline `<meshStandardMaterial>`).
  Both branches are cached (one instance reused across every body part + appliance — no per-instance
  material). A body mesh is always `<BeveledBox material={body} …/>` (or
  `<mesh material={body}>…geometry…</mesh>`) — **never** a `<meshStandardMaterial>` child.
  **Why one representation:** the old split (steel on the mesh PROP, non-steel as a
  `<meshStandardMaterial>` CHILD) did not reconcile when the user swapped steel↔matte in the
  inspector — R3F left a stale (white) body. Routing both finishes through the `material=` prop makes
  a swap a plain material-instance change on one mesh, which reconciles reliably. Don't put the body
  material on the door glass / control panels / handles — those keep their own inline finishes.
  (`shared.tsx`, `.tsx` for JSX-adjacent primitive helpers.)
- **Metal legs / frames (METAL-LEGS)**: a primitive's structural metal members (legs, frames,
  rails, posts, gas-lifts, taps) route through `primitives/shared.tsx:metalLeg(color?, finish?, repeat?)`
  — a thin wrapper over `getMetalMaterial` that inherits its `pbrSurfaces` gate (brushed
  `MeshPhysicalMaterial` on / identical plain `MeshStandardMaterial` off, so Performance is
  unchanged). Set the returned shared instance on the `<mesh material={…}>` prop (don't spread a
  plain props object onto a `<meshStandardMaterial>` for metal parts). Pick a finish by colour
  intent: `stainless` (bright chrome), `satin` (soft brushed), `black-steel` (matte industrial);
  tint via `color`. Wired into `BarCart` (frame), `OfficeChair` (gas-lift), `BarStool` (legs/column/
  footrest), `Sideboard` (hairpin legs), `TowelLadder` (frame), `DryingRack` (A-frame), `Desk`
  (hairpin legs), `KitchenIsland` (faucet). Leave painted/plastic parts and small hardware (knobs,
  small drawer pulls) as-is; don't touch wood/fabric.
- **Auto-arrange decor styling** (`layout/decorStyling.ts`): `applyDecorStyling(arranged, defs, seed?)`
  places `noClip` decor props per host surface (sofa→cushions/blanket, coffee-table→bowl/magazines/
  candles, bed→cushions, nightstand→plant/candle, desk→plant/books, sideboard→frames/sculpture).
  **Per-surface budget (RD408-001)** scales with the host's footprint area + a per-type ceiling
  (`budget = clamp(round(area / AREA_PER_PROP), 1, HOST_MAX[type])`); a per-room `ROOM_DECOR_CAP`
  bounds total density (trimmed tail-first in `applyDecorStylingForPlan`). **Props are spread across
  the host's real footprint (RD408-002)** — rotation-aware (offsets rotated by the host yaw), inset
  from edges + clamped so nothing spills off, with a small seeded position jitter. **Each prop gets a
  small seeded yaw jitter around the host facing (RD408-003)** (soft goods tilt more than frames).
  `applyDecorStylingForPlan` wraps it per-room. Both stay pure + seedable + deterministic →
  unit-testable. Wired into `furnishPlanItems` (`withDecor=true` by default); skip with
  `withDecor=false`. No feature flag — enriches the existing auto-furnish surface. Decor ids are
  `decor-<hostId>-<propId>-<slot>`. **Prop colour variety (RD-408):** repeated soft goods
  (cushion/blanket `color`) + book stacks (`spineColor`) draw a seeded colour from a curated
  `VARIETY` palette (offset by slot) so they aren't identical clones. **Hero props (RD-408):**
  richer set-dressing primitives with real silhouettes — e.g. `trailing-plant` (a raised pot whose
  vines cascade over the edge, leading the prop list on open shelving `bookshelf`/`cube-shelf` and a
  secondary option on `console-table`/`sideboard`); `decor-tray` (a shallow styled tray holding a
  small index-seeded candle/bowl/books vignette, `style`/`fullness` controls — leading on
  `coffee-table`/`ottoman` and a secondary option on `console-table`/`sideboard`). **Wall pass
  (RD408-008):** a separate loop hangs one `wall-art` piece on the wall BEHIND each wall-flushed host
  (`WALL_ART_HOSTS` — sofas/beds/sideboard/console; L-shapes excluded) at the host's back edge, facing
  the room, sized `widthFrac`×host width and self-lifting via the def's `mountHeight` (the def is
  `mounted`+`noClip`). Artifact-safe: the host already occupies a clear wall span, so the art never
  overlaps a door/window. Deterministic seeded art tint; excluded from the surface-prop budget/cap.
- **Furniture wears the FURNITURE wood painter, not the floor's (FURNITURE-WOOD-SCALE).** 21 defs
  across `defs/{beds,decor,kids,storage,tables}.ts` defaulted their wood finish to
  `mat:floor-wood-oak`, described in the C264 test as "the CC0 oak mat". It is not a CC0 photo
  material: that id is `kind: 'procedural'`, pattern `wood`, **`uvScale: [1.9, 1.2]` metres** — the
  FLOOR plank painter. On a 0.55 m coffee-table top that is a ~3x scale mismatch, and it rendered
  as saturated orange-red decking. Measured over a raycast mask (`surface-detail.mjs`, which
  selects by `DEF=<defId>` so no NDC guessing is involved) at walk/Medium/09:00, all arms in ONE
  run: `mat:floor-wood-oak` chroma **0.669 with 96.9% of its pixels past 0.35 saturation** against
  the whole frame's ~0.18 and the sofa's 0.220; the procedural `wood` painter **0.474 / 84.4%**
  with by far the calmest microcontrast (1.50 vs 3.51). Two lighter catalog woods were measured and
  rejected ON SIGHT despite better numbers — `mat:floor-wood-ash` (0.243) streaks like driftwood
  and `mat:floor-wood-maple` (0.313) reads as animal-print blotch, its microcontrast of 8.66 being
  noise rather than grain. **Higher microcontrast is not automatically better; look at it.**
  **The swap is piece-dependent, and this is the part to remember:** a `mat:<id>` finish supplies
  its own albedo and IGNORES the primitive's `color` prop, while the procedural `wood` painter
  MULTIPLIES it. So switching wakes up a `color` default that may never have been validated.
  `tv-console` is exactly that case — `TvConsole`'s `color` is #3a2f24, nearly black, and the swap
  took its mean luminance 61.8 → 37.7 for a chroma gain of only 0.794 → 0.612. It deliberately
  keeps `mat:floor-wood-oak` (see the comment at its def) until its colour is re-chosen. Before
  changing a `mat:` finish default to a procedural one, check the primitive's `color` default:
  everything else in the sweep sits between #6f553f and #cdb89c and is fine.
  Secondary defect fixed along the way: `mat:floor-wood-oak` was NOT among the `finish` enum's own
  `options`, so the default was unselectable and a user who changed the finish could never return
  to it. `'wood'` is the first listed option.
- **A def's `paramSchema` default is the EFFECTIVE default; a primitive's `readStr` fallback is
  DEAD whenever the def declares the same key (PARAM-DEFAULT-AUTHORITY).** `defaultParamProps(def)`
  materialises every schema default into the item's props at creation, so `readStr(props, 'color',
  '#8a6b48')` inside the primitive never fires — the stored prop always wins. This is silent and
  expensive: changing only `TVConsole.tsx`'s fallback produced a BYTE-IDENTICAL measurement, and so
  did a second attempt whose regex missed the schema's one-line form
  (`{ kind: 'color', key: 'color', label: 'Colour', default: '#3a2f24' },` — a pattern written for
  the multi-line form does not match it). Change BOTH, and confirm with `git diff` that the edit
  landed where you meant: a slice taken from `'<defId>': {` to the next `\n  '` over-runs the def,
  because sibling keys are not all quoted. Byte-identical means "prove the mutation landed" before
  it means anything about the render.
- **`tv-console` is resolved — FURNITURE-WOOD-SCALE now covers all 21 defs (v0.31.5.13).** It was
  the one piece held back, because a `mat:` finish supplies its own albedo and IGNORES the
  primitive's `color` while the procedural `wood` painter MULTIPLIES it, so the switch had woken up
  an unvalidated #3a2f24 (nearly black). Swept item-masked at walk/Medium/09:00 against
  `finish='wood'` — mean 72.7 / 97.5 / 109.9 / 122.1 / 131.8 and chroma 0.521 / 0.497 / 0.489 /
  0.415 / 0.396 for #3a2f24 / #6f553f / #8a6b48 / #a08464 / #b89a72. Shipped #8a6b48 (mean 109.9,
  chroma 0.489): #a08464 measured lower chroma and looked near-identical, so the tiebreak was
  coherence — #8a6b48 is exactly the dresser and nightstand default, so the flat's wood furniture
  reads as one family. The shipped state re-measured to the swept arm exactly, which cross-validates
  the live-sweep method against a real source change.
  **Mask by ITEM, not by painter, for a per-item decision** (`surface-detail.mjs MASK=item`). The
  first sweep used the default painter mask and covered 402 cells across 17 materials sharing the
  wood tile, so the entire #3a2f24 -> #a08464 range moved mean only 80.2 -> 92.9 — most of the mask
  was other furniture. Item-masked it is 106 cells and the range moves 72.7 -> 122.1.
  **The other dark `color` defaults are NOT the same trap.** A grep of
  `readStr(props, 'color'|'topColor'|'frameColor'|'legColor')` across `primitives/` flags 33 values
  below luminance 70, but they are dark BY DESIGN on small parts (`legColor` on chairs/sofas/tables,
  which goes straight to `getWoodMaterial` and was always live) or on legitimately dark objects
  (appliances, speakers, a piano, picture frames). The trap only existed where a def's finish
  default WAS `mat:<id>`, and all 21 of those were checked in v0.31.5.9.

- **Emitter intensities are RELATIVE, not photometric — do not "correct" them against a real
  fixture (LIGHT-UNITS-RELATIVE, v0.31.5.47).** `lightEmitters.ts` described its `intensity`
  field as "candela; renderer uses physical units". That is wrong, and it is the kind of wrong
  that causes damage: taken literally, the shipped ceiling light (9) sits against a real 9 W
  LED bulb at ~800 lm / 4-pi = **~64 cd** and reads as 7x too dim, so the obvious "fix" is to
  multiply the whole table — which would blow out every night interior.
  Censused live with `scripts/dev-probes/light-units.mjs`:

  | light            | day 13:00 | night 21:00 |
  | ---------------- | --------- | ----------- |
  | DirectionalLight (sun) | **0.999** | 0.013 |
  | HemisphereLight  | 0.136     | 0.057       |
  | AmbientLight     | 0.043     | 0.018       |
  | PointLight (19 fixtures) | 2.6–9 | 2.6–9   |
  | `toneMappingExposure`    | 1.38  | 0.897     |

  A sun at **0.999** where a physical midday sun is ~100,000 lux settles it: the rig is
  eyeball-calibrated against the tone curve. The fixtures being **9x the sun's number** makes
  the point twice over (and three treats a DirectionalLight as irradiance and a PointLight as
  intensity/d², so the two are not on one scale anyway).
  · **What IS meaningful is ordering and the fixture-to-fill ratio, and both are sound.** Room
    lighting (ceiling-light 9, ceiling-fan 8) > task (floor-lamp 7, table-lamp 4) > accent
    (sconce 3.5, vanity 2.8, cove 2.6, aquarium 2.4). The day/night ramp drops the fill ~8x
    while the fixtures hold constant, so lamps take over at night by construction — ~150:1
    over the hemisphere fill at 21:00, which is why NIGHT-WALL-CAP measures lit-room wall caps
    at roughly twice the vertical walls.
  · **So the table is DEFENSIBLE and nothing was changed.** FIXTURE-NEARFIELD-REFUTED named
    this table the only remaining lever for fixture brightness after ruling out the falloff
    shape by arithmetic; this closes the follow-up — the lever exists, but nothing measured
    says it is set wrong. The near-field hot spots BLOOM-NIGHT-NEARFIELD found are ordinary
    1/d² behaviour, not an intensity error.

- **First furniture audit of the run: the chroma ranking is topped by the wardrobe metal, and it is
  CORRECT (FURNITURE-CHROMA, v0.31.5.77).** With the shell verified (`.56`–`.76`), `chroma-audit.mjs`
  was re-run to pick the next target by measurement rather than hunch. Walk mode, medium, three
  poses, run at 21:11 local (so the flat booted `lightsMode: 'on'` per `ensureDaylightFirstPaint`):

  | pose | top chroma budget (coverage x saturation) |
  | --- | --- |
  | living | **2.6** `#7a5c3c` wood, sat 0.51, 5.2% cover, mapped |
  | dining | **1.6** `#b9b0a0` sat 0.14, 11.6% cover |
  | bedroom | **3.4** `#b8bcc0` sat 0.04, **82.3%** cover, metal 0.75, NO maps |

  · **`#b8bcc0` is the sliding wardrobe's frame metal** — `class-id.mjs` finds 6 instances,
    `Group{itemId}` (furniture), `0.49 x 2.04 x 0.03` in runs of three, matching
    `defaults/mainBedroom.ts`'s `wardrobe-3door` (`width 1.4`, `doorStyle 'sliding'`).
  · **The obvious hypothesis was already found and fixed — meta-rule (xvii-b), seventh round
    running.** `primitives/Wardrobe.tsx` routes it through `getSolidMaterial` *"rather than spread
    inline, so it inherits the no-IBL metalness cap: at 0.75 metalness with no environment to
    reflect, these ~1 m² frame panels rendered as **black slabs** on the default Performance tier
    (Chrome audit 2026-08)"*. Door faces additionally use a tier-aware `MirrorMaterial` (real
    planar reflection in `realistic`, a cheap fake-shiny fallback in `performance`).
  · **The frame confirms the fix holds.** `/tmp/ssg-chroma/walk-bedroom-medium-h13.png` shows satin
    metal with soft broad specular blooms and a correct vertical seam — not black slabs, not
    plastic. Featureless at nose distance (metal 0.75, rough 0.35, no maps), but a metal wardrobe
    door IS smooth; this is the same situation as the vinyl bifold in `.58`, where flat was right.
  · **The 82.3% is a POSE ARTEFACT, not a coverage claim.** `chroma-audit`'s bedroom pose stands
    in `bedroom2` essentially against the wardrobe, so its doors fill the frame. Quote it as "82%
    of THAT pose", never as the wardrobe's share of the walk view — the pose-honest census
    (`.71`/`.72`) is the authority for that. Same lesson as `.71`, one probe further on.
  · **The shared furniture WOOD painter is healthy.** `surface-detail.mjs DEF=wardrobe-3door`
    seeds the carcass (`#caa478`, 17 materials share the tile) and measures **microcontrast
    0.959**, chroma 0.602, mean 91.9, sigma 19.00 — on par with the plaster's post-fix 0.961.
    Note this is the SAME class `.58` labelled "a furniture wall-slat panel"; it is a shared wood
    tile used by many pieces, so treat that earlier label as "one member of a shared painter"
    rather than as an identification of the class.

- **The flat's highest-SATURATION class was already solved, and the ORBIT ranking is not the walk
  ranking (WOOD-ARM-STALE, v0.31.5.78).** `.77` left `#7a5c3c` (sat 0.51, budget 2.6 in the living
  pose) as the next target. `class-id.mjs COLOURS=7a5c3c` finds **8 meshes, all under
  `Group{itemId}`** — four dining chairs, each a `0.44 x 0.05 x 0.44` seat at y=0.43 plus a
  `0.44 x 0.46 x 0.04` back at y=0.69, clustered at x≈10.65/11.35, z≈4.85–6.75. The neighbouring
  `#9e7b53` (sat 0.47) is the dining/side **table top** (`primitives/DiningTable.tsx`,
  `SideTable.tsx`), so both warm woods in the boot view are the same dining set.
  · **Meta-rule (xvii-b) pays for the EIGHTH round running.** `materials/CLAUDE.md` already
    measured this exact hex: TONE-CURVE-CHOICE (v0.31.5.6, shipped with the user's sign-off)
    decomposed its 0.508 albedo saturation and moved the default view transform to AgX.
    Re-running the same instrument today (`wood-detail.mjs`, walk/Medium/09:00) **confirms the fix
    still ships**: baseline is byte-identical to the explicit-AgX arm (`meanAbsDiff 0.00`,
    `pixels>8 = 0.00%`), while explicit filmic costs chroma **0.601 → 0.750** with **6.6x** the
    clipping (0.0028 → 0.0185), reproducing the recorded "4–7x". Effect size holds too: today's
    filmic/AgX ratio is 1.248 vs the originally published 1.229. Nothing to fix; do not re-audit.
  · **Read the two numbers as DIFFERENT metrics.** The published 0.833/0.678 pair is wood-pixel
    *saturation*; this table's column is *chroma*. They are not comparable term-for-term — compare
    the ratio, not the absolute.
  · **`chroma-audit MODE=orbit` reorders the ranking, and orbit is the BOOT view.** `.77` ran walk
    only. In orbit/medium/09:00 `#7a5c3c` falls to **0.7%** cover (budget 0.4, sixth) from 5.2% in
    the walk/living pose — so the flat's highest-saturation class is nearly absent from the first
    frame a user sees. Rendered frame: mean chroma 0.158, 3.2% of pixels past 0.35 saturation,
    consistent with the shipped AgX row. **Always state which pose a coverage figure came from**
    (meta-rule lxxxi); walk-pose budgets do not rank the boot view.
  · **The largest surface in the boot frame is the SKY, and it is correct by construction.** 38.5%
    of orbit rays hit a white mapped `MeshBasicMaterial` — `scene/lighting/Sky.tsx:129`, drawn
    `side={BackSide}`, `depthWrite={false}`, `fog={false}`. Unlit on purpose, sat 0.00, so it
    carries zero chroma budget. Being top of a coverage table is not being a defect (meta-rule lii).

- **The bedside lamps no longer have a notch bitten out of them (CURTAIN-NIGHTSTAND, v0.31.5.87 —
  shipped on the user's decision).** `.61` diagnosed it correctly and left it: the render was never
  wrong, the curtain plane simply passed through the shades (shade z 0.30-0.60, curtain panel
  z 0.48-0.58, `side=2` so the shade's inside showed through the bite). Fixed as CONTENT in
  `defaults/mainBedroom.ts`, not by touching the placement rules.
  · **There was no z solution, and none at the old curtain width either — that is why `.61`'s three
    candidates all failed.** The room's north interior wall is at z 0.20, so a 0.40-deep nightstand
    against it always reaches z >= 0.60 and cannot clear a panel at 0.48-0.58; `.61` measured the
    only z fix as 0.33 m out into the room, which reads wrong for a bedside table. In x, the 2.2 m
    curtain spanned 0.6-2.8 while the west wall forces the left nightstand's centre to x >= 0.425
    (max x >= 0.65) — so no placement existed at that width.
  · **Both had to move.** Curtain `width 2.2 -> 1.9` (x 0.75-2.65, still overhanging the
    `x=[0.8,2.6]` glass ~0.05 each side, so the window stays covered), and the nightstands, their
    table lamps and the desk plant went outboard to **x 0.475 / 2.925** — symmetric about the window
    centre, clear of the bed (x 0.95-2.45) and inside the room (x 0.20-3.28).
  · **Pinned by `defaults/mainBedroom.test.ts`**, which asserts the x spans do not overlap, that the
    curtain still covers the glass, that each nightstand fits the room, and that the lamps and plant
    stay co-located with their nightstand. It **fails 4 of 9 on the old geometry** — verified by
    restoring it — so it discriminates rather than merely passing.
  · Verified visually: `walk-tour HOUR=13 LIGHTS=on`, `mainBedroom-y0` cropped on the lamp/curtain
    junction shows a complete unbroken shade with bare wall between it and the curtain edge.

- **The default flat now ships with its curtains OPEN (WINDOW-TIME-INVARIANT, v0.31.5.88 — shipped
  on the user's decision).** `.44` measured that the app bakes a city backdrop the out-of-box user
  never sees: facing any of the 5 window openings in walk mode, a ray grid found essentially no
  exterior pixels, because every curtain shipped drawn. `drawAmount: 0` is now set on all four
  curtain entries in `defaults/` (mainBedroom, bedroom2, bedroom3, livingDining).
  · **The DEF default stays `drawAmount: 1`.** Staging the demo flat must not change what happens
    when a user drops a new curtain on a window — that still arrives drawn. Both halves are pinned
    by `defaults/curtainsOpen.test.ts`.
  · **Opening cannot re-introduce the `.87` lamp intersection, and this was checked rather than
    assumed.** `panelTransform` bunches each panel to the outer edge at `drawAmount 0`:
    `bunchW = max(0.12, width * 0.07)`, so the 1.9 m bedroom curtain's panels occupy x 0.750-0.883
    and 2.517-2.650 — inside the drawn span and still disjoint from the nightstands at x 0.25-0.70
    and 2.70-3.15. In general an open panel is a SUBSET of the drawn span in x, so anything that
    cleared when drawn also clears when open. (Fold depth does grow — `depthScale` 1.0 -> 1.8 — but
    that is in z, and x-disjointness alone rules out intersection.)
  · **⚠️ It also makes WINDOW-TIME-INVARIANT VISIBLE.** The backdrop is a static authored `city`
    palette; `.44` measured it identical at 09:00 and 13:00 to within ~1 rgb unit. With the curtains
    drawn nobody saw that. Open, a `HOUR=13` walk frame shows a dark sky with lit tower windows and
    glowing street lamps — a night skyline at midday, next to a TV playing a bright daylight image.
    The sun-driven alternative is the `sky` backdrop, still gated on `proceduralSky` (false in
    Simple, the app default) by the user's own decision. **This is a live trade-off, not a solved
    problem** — see `docs/open-graphics-decisions.md` item (b).

## A room that cannot hold its kit may have the WRONG KIT (v0.31.9.33)

`kitForRoom` picks by category, and it already varied by SIZE in one place
(`planRoomArea(room) >= 11` chooses the master-bedroom kit). v0.31.9.33 added the second case and
the reasoning generalises.

Two bathrooms shipped without a basin — `tpl-terrace-ground/ctu-mbath` since **v0.31.8.9.8**, and
`tpl-hdb-maisonette/emu-cbath` since v0.31.9.29 — and **five arranger changes were built and
measured against it before anyone asked whether the FITTING was right for the room**
(v0.31.9.30-.32: height-aware mounted obstacles, excluding seed-parked mounts, an 800 mm tray,
mounts-first ordering, a wall preference plus seed exclusion; the cheapest of them cost five other
severity-1 fixtures).

The arithmetic that settles it: a 0.9 x 0.9 m shower CUBICLE against one wall of a 1.4 m room
leaves 0.5 m to reach the WC and the basin, under `CLEARANCE.walkwayMin` (0.6). And an HDB
bathroom of 2-3 m² is not built with a tray-and-door cubicle — it is an open WET AREA with a floor
drain, graded screed and a fixed glass panel. So `KITS.bathWetArea` uses `shower-screen`
(0.9 x 0.06) below `WET_AREA_SHORT_M`, and both basins came back: ranked score
**60,813,163,803 -> 40,813,163,803**, `missing-fixture` 6 -> 4, +13 items, no other class moved.

**Widening the templates 0.1 m was the alternative and is rejected on principle.** These are
accurate HDB and condo plans; "fully to scale" is the product, so the plan does not move to suit
the arranger.

**Check the kit against the room before making the placer cleverer.**

## A param that changes the render must change the COLLISION too (v0.31.9.30/.34)

Twice now, a def has exposed a size param that its primitive honoured and the collision did not:

- **`shower`'s `size`** drove the tray, screen, rail and glass and the def had no
  `footprintParams`, so a 1.2 m shower collided as 0.9 and a 0.8 m one reserved floor it did not
  occupy (v0.31.9.30).
- **any def's `height`** drives the rendered box while `verticalSpan` always takes
  `defaultFootprint.h`, so a shortened piece reserves space it does not occupy and a raised one
  under-reserves. **Twelve defs carry such a param** — `refrigerator`, `bookshelf`, `ottoman`,
  `floor-mirror`, `floor-speaker`, `shower-screen`, `fluted-partition`, `aircon-condenser` and four
  pet fittings. **STILL OPEN (v0.31.9.34): the one-line fix passes the whole suite but is
  held back** behind the unresolved scenario/corpus discrepancy in `TODO.md`; do not re-apply it
  before that is understood.

Both were invisible in the corpus, because no kit sets either prop — they only bite a USER who
resizes a piece in the inspector, which is why neither showed up as a test failure for months.

**When adding a size param, wire it to the footprint (`footprintParams`) or the span, and add a
test that asserts the collision changed.** A def with an explicit `verticalSpan` stays
authoritative.
