# src/apartment — curated default flat rules

The fixed HDB 4-room flat: `constants.ts` is the source of truth for walls, doors,
windows and rooms; `walls/`, `floor/`, `ceiling/`, `Window`/`Door`/`Skirting` render it.
`floorplan/defaultPlan.ts` derives the editable `FloorPlan` from the same tables.
Full code map in `docs/ARCHITECTURE.md`.

## A room can be any shape — resolve it through `roomGeometry.ts`, never by hand

- **`RoomDef` is not "a rect + an L".** It is a primary rect (`origin`/`width`/`depth`)
  plus **any number** of `extensions` (offset rects), **or** an explicit free-form
  `polygon` in absolute world metres for a shape no union of rectangles can describe.
  Living/dining is three parts; the main bedroom is two; a splayed or diagonal room
  would be a polygon.
- **`roomGeometry.ts` is the ONE reader.** Never read `origin`/`width`/`depth`/
  `extensions`/`polygon` directly in a consumer — use `roomParts` (non-overlapping
  rects, memoised; a rectilinear polygon is decomposed back into rects so every
  rect-based renderer keeps working), `roomOutline`, `roomBounds`, `roomContains`,
  `roomFloorArea`, `needsTriangulatedFloor`. A consumer that resolves the shape itself
  sees a truncated room the moment someone adds a part: that is exactly how the
  living/dining came to render one footprint, highlight another, and report a third.
  `apartment/rooms.ts` (`roomPolygon`/`roomCentroid`/`roomArea`, keyed by `RoomId`) is a
  thin wrapper over it.
- **Room footprints must not overlap** — not another room's, not the room's own other
  parts. Declare the real space each part covers. `roomGeometry.test.ts` enforces both,
  plus the converse: no cell enclosed by the external walls may lack BOTH a floor and a
  wall over it (that flood-fill is what catches a white gap between two rooms' floors).
  There is no longer an overlap-carve at render time to paper over bad data.
- **A part may run under a wall.** Where a wall's thickness varies along its length a
  single rect can't follow it, so the rect is left at the thinner face and the wall
  renders over the floor — see the `NOTE (v0.23.x)` comments in `constants.ts`. That is
  fine; overlapping ANOTHER ROOM is not.
- **Crossing into the plan model**: `defaultPlan.ts`'s `planRoomShapeOf` is the only
  place `RoomDef` shape becomes `PlanRoom` shape. A rect or single-extension L maps
  across as-is (keeping the 2D editor's L-extension inspector useful); two or more
  extensions, or an explicit polygon, become a `PlanRoom.polygon`. `PlanRoom.polygon`
  is the general form on the plan side — anything reading `PlanRoom.extension` must
  branch on `polygon` FIRST (`floorplan/types.ts`'s `roomPolygon`/`pointInRoom` and
  `planRoomShell.ts`'s `planRoomRects` already do; prefer them to hand-rolling).

## Wall fittings — the plan's electrical points, rendered (WALL-FITTINGS, v0.33.0.4)

`fittings/fittingModel.ts` (pure, tested) resolves `plan.electricalPoints` — or, when the plan has
none, `furniture/mepSuggest.ts:deriveElectricalPoints` plus `generalSockets` (one 13 A socket per
wall run ≥ 2.4 m, two ≥ 3.4 m, skipping openings) — onto WALL FACES: nearest wall within 0.6 m,
the face on the point's own side, plate proud of the face by half its depth, yaw facing the room.
A derived door switch sits on the centreline, so its side is the door's SWING side, except where
only one side of that wall is a room (the main door swings out to the corridor; the switch is
still inside). The DB box goes past the main door's latch jamb at 2.0 m. `fittings/WallFittings.tsx`
draws them as four instanced meshes (glossy white polycarbonate, dark slots, a neon dot, and a dark
CONTACT RIM behind every plate — a metre-scale AO kernel cannot see an 11 mm plate, and without the
rim a switch on a fill-lit corridor wall was a faint outline) and collapses a plate to zero scale
while its host wall is fading in orbit. Rules: never float a point with no wall within reach — drop
it; upper-storey points are skipped (one storey's shell renders at a time). Mounted in BOTH
`Scene.tsx` (the whole flat) and `RoomEditorScene.tsx` (EDITOR-LOCKSTEP — the earlier gap is
closed): the editor isolates one room, so it passes `<WallFittings roomId={roomId} />`, which runs
the whole-plan resolve through `fittingModel.ts:fittingsForRoom(fittings, plan, roomId)` — a pure
filter that keeps a fitting when the point 0.15 m in front of its plate, along its own yaw
(`(sin yaw, cos yaw)`), lies inside that room (`pointInRoom`); an unmatched `roomId` yields an
empty list rather than falling back to the whole flat. `roomId` is optional and only the editor
passes it, so the main-scene mount (`Scene.tsx`, no prop) renders every fitting exactly as before.
Verify with `scripts/scenarios/wall-fittings-verify.json` (whole flat) and
`scripts/scenarios/wall-fittings-editor-verify.json` (room editor, scoped).

## Plumbing fittings — the plan's plumbing points, rendered (PLUMBING-FITTINGS)

`fittings/plumbingModel.ts` (pure, tested) resolves `plan.plumbingPoints` — or, when the plan has
none, `furniture/mepSuggest.ts:derivePlumbingPoints` plus `wetRoomTraps` (one floor trap for every
WET room the fixtures left without one: a shower or washer earns a room its trap, an unfurnished
WC would otherwise get nothing) — into `PlumbingFitting[]`. It shares the nearest-wall maths with
the electrical model through **`fittings/wallSnap.ts`** (`WALL_SNAP_M`, `nearestStraightWall`,
`placeOnWall`, `roomSide`, `rightNormal`): that file was extracted FROM `fittingModel.ts` for this
work — do not re-derive wall snapping a third time, import it.

Rules:
- **`floor-trap` is a FLOOR item, never a wall item** (`wallId: null`, `yaw 0`, `y = 3 mm`). Its
  spot is the nearest point inside its own room that clears every wall centreline by
  `FLOOR_TRAP_CLEAR_M` (0.25 m) AND every furniture footprint — one 50 mm grid search satisfying
  all three constraints at once. Nudging off the walls and *then* off the furniture pushes it
  straight back under the furniture (measured on the service yard's washing machine). No valid
  spot, or a point in no room at all → drop it.
- **TRAP-UNDER-TRAY.** The derived layout puts a shower's trap at the shower's CENTRE, and our
  shower is a raised TRAY: the first real-GPU frame showed the grating buried under it, a chrome
  sliver poking through the tray. Hence `floorObstacles(items, catalog)` (skipping `mounted` /
  `noClip` / anything based above 0.1 m) and the obstacle term in the search. The trap now sits
  on the open tile beside the tray, which is where you can see it and where HDB puts it.
- **TAP-IN-PIPE.** A WC derives its soil pipe and its cistern valve from the same fixture centre,
  so both resolve to the same point on the wall behind the pan and the tap rendered INSIDE the
  100 mm stack. A `water-point` landing within `TAP_PIPE_CLEAR_M` (0.26 m) of a soil stack on the
  same wall steps that far along the wall.
- **Wall kinds** (`water-point`, `drainage`, `soil-pipe`, `water-heater`) snap exactly like the
  electrical plates, each with its own depth (tap 90 mm, stub 50, stack 100, heater 350) so the
  body stands proud of the face. `soil-pipe` and `water-point` get a wider `FIXTURE_SNAP_M`
  (1.2 m) fallback because a derived point sits at the FIXTURE, up to a pan's depth off its wall.
- Heights come from `mepPoints.ts`'s `PLUMBING_MOUNT_DEFAULTS_MM` unless the point carries
  `mountHeightMm`; upper-storey points (`levelId`) are skipped.
- `PlumbingFittings.tsx` draws them as instanced boxes + one unit cylinder over four shared
  materials (`getMetalMaterial('#c9ccd0', 'satin')` for the grating/tap, matte `#9aa0a6` PVC,
  white heater, dark slots) and collapses only the WALL-mounted items to zero scale while their
  host wall fades in orbit — a floor trap has no host wall and the floor never fades. The neon
  indicator is shared with `WallFittings` via `fittings/fittingMaterials.ts:neonMaterial()`.
- Mounted in BOTH `Scene.tsx` and `RoomEditorScene.tsx` (EDITOR-LOCKSTEP), the editor passing
  `roomId` through `plumbingForRoom` (floor traps tested at their own position, wall items on the
  0.15 m probe along their yaw).

What the frames taught: the 150 mm grating with its 3 × 3 slot grid reads correctly at walking
distance in all four wet rooms and needs a pitch around −0.9 to −1.0 from ~1.2 m away to be
framed at all (a −0.6 pitch looks at the far wall, not the floor). The PVC stack reads as a
stack; the heater needs to be sited clear of the bath window. Two known limits: in the ROOM
EDITOR the grating sits under the editor's floor grid overlay and is not discernible at default
framing (scoping is verified by an instance-count assertion instead), and entering walk mode
straight FROM the room editor leaves that room's walls stale-faded, which culls its wall-mounted
fittings — the verify scenario therefore shoots walk before the editor, never after.
Verify with `scripts/scenarios/plumbing-fittings-verify.json`.

## Yard fittings — the service yard's hoses and laundry rack (YARD-FITTINGS)

`fittings/yardModel.ts` (pure, tested) is DOWNSTREAM of `plumbingModel.ts`: it takes the already
resolved `PlumbingFitting[]` plus the washing machines (`yardWashers(items, catalog)` — the only
place it touches the catalog) and emits the three things a real HDB BTO service yard has that the
plumbing model stops short of. `fittings/YardFittings.tsx` draws them: two `TubeGeometry` sweeps
over a `CatmullRomCurve3` (one draw each; a yard has one machine) and three instanced meshes for
the rack, over shared module-level materials like `PlumbingFittings.tsx`. Flag `yardFittings`
(simple, default on). Mounted in BOTH `Scene.tsx` and `RoomEditorScene.tsx` (EDITOR-LOCKSTEP; the
editor passes `roomId` through `yardFittingsForRoom`) — a source-contract test in
`yardModel.test.ts` asserts both mounts.

Rules:
- **The washer's tap is 1150 mm, not 600.** `mepSuggest.ts:derivePlumbingPoints` gives a
  `washing-machine` water point its own `mountHeightMm`; at the generic
  `PLUMBING_MOUNT_DEFAULTS_MM['water-point']` the tap resolves onto the wall BEHIND an 850 mm-tall
  machine, i.e. rendered inside it and never seen. Every other fixture keeps its per-kind default.
  This change is in the DERIVATION, so it is deliberately NOT flag-gated — the same function feeds
  the drawing-set export and the editor's "Suggest MEP points", and a suggested point that moves
  with a render flag would be a data bug. `?ff=yardFittings:off` therefore still shows the raised
  tap; only the hoses and rack disappear.
- **A hose with a missing endpoint is not drawn.** The inlet needs a `water-point` within
  `FIXTURE_SNAP_M` of the machine, the drain needs a `floor-trap` with the machine's own `roomId`.
  Either missing → that hose is skipped; a hose to nowhere reads far worse than no hose.
- **The drain hose routes AROUND the machine.** A straight run from the back panel to the trap
  cuts the corner of the machine's own footprint (the trap sits diagonally off the back corner
  once `plumbingModel` has nudged it out from under the machine), so the route turns out past the
  machine's side first — four points, tested to be outside the footprint at every one.
- **Rotation convention.** Furniture is footprint-centred facing +Z, and three maps a local
  (lx, lz) to world `(lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ)`, so the machine's back is local −Z
  rotated by `item.rotation`. Do NOT copy `plumbingModel.ts:outOfObstacles`'s transposed form —
  it is indistinguishable for the square axis-aligned footprints it is given, and wrong here.
- **The rack is per-room, not per-fixture**: every room resolving to `serviceYard`
  (`roomCategoryFromName`, like `isWetRoom`) gets one. Skipped when the long axis is under 1.6 m,
  the ceiling under 2.3 m, or a pole end falls outside the room polygon (an L-shaped yard hangs
  no pole through a wall). Poles drop from three to as many as fit rather than eating the 0.1 m
  wall clearance — the default yard is 1.42 m across and takes all three at 0.22 m spacing.
- **Nothing here fades.** The hoses hang off the machine (floor) and the rack off the ceiling;
  neither ever fades in orbit, so there is no per-frame wall-fade check at all. The bib tap is a
  wall item and `PlumbingFittings` already collapses it itself.

Geometry placement here needs no Cycles reference — it is dimensioned from real HDB service-yard
hardware (tap 1.1–1.2 m, poles 2.0–2.2 m AFFL), not from a rendered look. The `[probe]` in the
verify scenario reports the exact draw budget: 2 tubes + 2 brackets + 3 poles + 6 cords, identical
in the room editor because the yard is the only room that carries any of it.
Verify with `scripts/scenarios/yard-fittings-verify.json` (walk BEFORE the room editor, never
after — the same stale-fade trap the plumbing scenario documents).

## Door hardware — DOOR-HARDWARE

`doorHardwareModel.ts` (pure, tested) + `DoorHardware.tsx` give every leaf in the flat its
ironmongery: three 100 mm butt hinges, a properly RETURNED lever (rose → 28 mm out → 110 mm back
along the leaf with an 8 mm drop and a rounded end, swept as a `TubeGeometry` over a Catmull-Rom
— the old handle was a straight 12 cm rod) with a Ø 22 mm privacy turn on an escutcheon 75 mm
below it on both faces, the MAIN door's digital lock + kick plate, and a floor stopper. Flag
`doorHardware` (simple, default on); with it off `Door.tsx` renders byte-identically to before
(three `hardwareOn ?` branches, nothing else touched — the panel knob and bifold pull stay).

Rules:
- **Everything is in the leaf's HINGE-LOCAL frame** — the frame the swing group already uses
  (`[hingeLocalX, 0, 0]`, +X along the wall, leaf at `x ∈ [0, direction·width]`, Y from the FLOOR,
  Z the wall normal). The renderer adds no maths: leaf-riding parts go straight into `swingRef`'s
  group, static parts into a plain `<group position={[hingeLocalX, 0, 0]}>`.
- **The swing side is `−direction · swingSign`, not `−swingSign`.** `Door.tsx`'s security-gate
  comment states only the `direction = 1` case; an END-hinged door (bedroom 3, bath 2) swings the
  other way. `swingSideZ` is what puts the stopper on the right side of the wall and the main
  door's digital lock on the INTERIOR face (the side the gate is NOT on).
- **A hinge does not ride the leaf.** The knuckle sits on the pivot's X and, with its jamb plate,
  renders in the door's STATIC group so it stays at the jamb while the leaf swings; only the LEAF
  plate is inside the swing group. It is the one place the model's `rides: 'leaf' | 'jamb'` flag
  matters.
- **The knuckle must be TANGENT to the swing-side face, not sunk into it.** First cut put the
  barrel 2 mm inboard (centre at `leafThick/2 − 2 mm`): only a 5 mm sliver of a Ø 14 mm knuckle
  cleared a 50 mm leaf and NO real-GPU frame showed a hinge at all — you look along a door edge at
  a grazing angle, and the leaf's own face occluded it. Centre is now `leafThick/2 + r`, which
  still sits well inside the 50 mm reveal of a 100 mm wall.
- **Hardware is a wall OVERLAY.** Both part groups carry `markWallOverlay()`, exactly like the
  existing handle and the security gate, so the leaf's fade traverse hides the branch instead of
  compositing yet another translucent layer over a fading wall.
- **The stopper is skipped for the bifold and the blast door** (a bifold folds against its own
  jamb; the shelter has no floor to spare), and drawn for every swing door — 10 dome meshes in the
  default flat.
- **No Blender/Cycles bake, and no GLB.** These are boxes, cylinders, a swept tube and a sphere
  cap, dimensioned from real ironmongery; Poly Haven has no CC0 handle or hinge model (checked).
  Nothing here is matched to a rendered look, so there is nothing to bake.

Cost: 135 extra meshes across the flat's 8 doors (72 hinge parts, 20 lever, 10 rose, 10
escutcheon, 10 cylinder, 10 stopper, 2 lock, 1 kick plate) — measured at +0.1 ms on the Realistic
walk p50 (7.0 → 7.1 ms) and inside the orbit band, so they are plain meshes, NOT instanced.

What the frames taught: a hinge only reads from the side its door OPENS INTO, up close, and the
default layout parks the 3-door wardrobe over bedroom 2's doorway, so that jamb is permanently
occluded — the verify scenario shoots the hinge at the MAIN BEDROOM door instead. A door 0.8 m
away is also too close to frame a 2.1 m leaf: at that range a lever at 0.88 m needs a pitch near
−0.5 to be in shot at all. Verify with `scripts/scenarios/door-hardware-verify.json` (walk BEFORE
the room editor, the same stale-fade trap the plumbing/yard scenarios document).

## Geometry conventions

- Plan mm → app metres: `app x = mm_x / 1000 + 0.10`, `app z = mm_z / 1000 + 0.10`
  (external wall centrelines sit half a thickness inside the footprint corner).
- Room rects are INTERIOR faces (after wall thickness). Every dimension carries a
  `derivation` note tracing it to `assets/floor_plan/default.png` — keep it current when
  you move an edge, including WHY (which wall face moved, and by how much).
- `INTERIOR_AREA_M2` is the overlap-free sum of `roomArea` (shoelace over each outline).
- **A per-face material CLONE must track the source's texture swaps
  (WALL-FACE-CLONE-STALE).** Both wall implementations render the interior face as a
  separate plane 1 mm proud of the wall body, on a CLONE of the shared cached finish —
  so one face can fade for the camera reveal without touching the material every other
  surface in the room renders with, and so it can carry its own `polygonOffset` (the
  world-space offset alone z-fights at zoomed-out orbit distances). Both then cloned in
  a `useMemo` keyed on `[material]` and never touched it again. That is a bug, because
  procedural textures arrive in TWO stages: PERF-C bakes a cheap
  `PROCEDURAL_QUICK_PREVIEW_SIZE` (**64²**) placeholder synchronously, then an
  OffscreenCanvas worker delivers the real 512² maps ~80 ms later and hot-swaps them onto
  the CACHED material. `Material.clone()` copies texture slots by REFERENCE, and the
  source material's IDENTITY never changes across that swap — only its map fields do — so
  the memo never re-ran and **every wall face in the app rendered the 64² preview
  permanently**, at one eighth linear resolution, pointing at textures the swap had
  already disposed.
  Measured in walk mode by raycasting the walls and reading the map off the material three
  is actually drawing with (`scripts/dev-probes/bath-tile-size.mjs`, 12x12 rays x 4 yaws
  per room): both bathrooms and the kitchen came back **64² on every ray**, and cropped
  frames show the grout as a soft smeared band with no line in it. After the fix all three
  rooms read **512²** and resolve to the real `wall-tile-white@512` texture, and the joints
  are hairline-crisp. This was the true cause of the "bathroom tile joint is out of spec"
  finding — see BATH-TILE-OK in `src/materials/CLAUDE.md`.
  Both sites now go through `walls/useWallFaceMaterial.ts` (clone + depth bias + re-sync on
  `proceduralSwapSignal`, with an `invalidate()` since the Canvas is `frameloop="demand"`);
  the copy rule itself is the pure, unit-tested `materials/materialMapSync.ts`. Two details
  are load-bearing: the hook syncs ONCE on mount as well as on the signal (the swap can land
  before the effect attaches, and no future notification would ever correct that clone), and
  `syncMaterialMaps` returns whether anything changed so the global signal — which fires for
  every material's swap — doesn't request a frame for a face it has nothing to do with.
  **Any other clone of a cached finish material needs the same treatment.**
  `useWallReveal`'s fade clones are exempt only because they are transient (created on fade,
  restored to the original when the wall goes opaque); `PlanDoorLeaf`/`Door` clone non-
  procedural bases. A new one that persists must use the hook, or it will silently ship a
  64² surface that no test and no tier setting will reveal.
- **The wall-reveal fade clone is PERSISTENT, not transient — it is safe on TIMING, and
  that distinction is the whole point of this note (CLONE-AUDIT, v0.31.5.40).** An earlier
  revision of the WALL-FACE-CLONE-STALE bullet above excused `useWallReveal`'s clones as
  "transient (created on fade, restored to the original when the wall goes opaque)". The
  restore is real, but the CLONE is not thrown away: it is created on the FIRST fade and
  cached in a `fadeStateRef` WeakMap for the mesh's lifetime, deliberately, so a React
  re-render cannot strand a wall on its opaque original mid-fade. So it is exactly the
  shape meta-rule (xli) warns about — and if it were created inside PERF-C's ~80 ms
  pre-upgrade window it would show 64² preview maps on every fade for the rest of the
  session, in the DEFAULT orbit view.
  **Measured, it does not happen** (`scripts/dev-probes/fade-clone.mjs`, which censuses
  every mid-fade material at boot framing, mid-drag and after the drag, labelling each by
  TEXTURE uuid against the cache's own builds). Of **123 mid-fade materials** the only
  procedural finish map is `wall-tile-white@512` — the correct upgraded generation — and
  there is no 64² anywhere. The reason is ordering: the first fade happens after boot
  framing settles, long after the ~80 ms upgrade. Most fading surfaces carry no map at all
  (plain wall bodies, glass), because WALL-FADE-OVERLAY-CULL hides the textured interior
  face plane for the duration of the fade.
  **Do not re-file this as safe-because-transient.** It is safe because of a timing margin,
  and a timing margin is not a guarantee — a slower first paint, a larger bake, or a fade
  triggered earlier would flip it. Nothing was changed (a fix that moves no metric does not
  ship, meta-rule ii), but if a stale fade ever appears, this is the mechanism.

- **Door leaves are ~13% of the walk view and were the largest UNEXAMINED surface in the flat
  (DOOR-GLOSS, v0.31.5.49).** "The default-surface survey is complete" had been asserted for ten
  rounds and was never tested; it was wrong. `scripts/dev-probes/surface-coverage.mjs` censuses
  what actually RENDERS — 11 rooms x 4 yaws x 1600 rays, grouped by the drawn material — and door
  leaves plus frames come to **~13% of the view**, more than the bathroom tile that three earlier
  rounds went into and far more than the ceiling (**1.45%**, a `MeshLambertMaterial` with no maps,
  which is fine because you barely see it at 1.6 m eye height).
  · **The bedroom leaf rendered as wavy, wet-looking corrugated plastic**, not a flush laminate
    door. `Door.tsx` / `PlanDoorLeaf.tsx` built it with `getWoodMaterial(leafColor, 1, 0.45)` —
    an explicit roughness against the `WOOD_BASE_ROUGHNESS` of 0.85 that WOOD-GLOSS settled.
  · **Four arms at one pose, one variable each** (`dev-probes/door-ab.mjs`, mutating the drawn
    material in-probe): `normalScale 0` removed the ripples entirely (so they ARE the wood-grain
    normal, stretched over a 0.8 x 2.1 m panel); `repeat 2` made them WORSE — finer, denser
    corrugations, so tiling is not the lever; **roughness 0.85 was clearly best**, a matte timber
    panel with subtle grain. Shipped that, and the drawn leaf now reports `roughness: 0.85` with
    the frame byte-matching the winning arm (mean 156.4 / sigma 27.65, against 156.1 / 29.63
    before).
  · **This overturns a deliberate earlier choice, which is why it needed the frames.**
    `woodGloss.test.ts` carried "doors deliberately pass their own value"; that comment is now
    corrected. The test itself still pins the API contract (a caller CAN ask for shinier wood) —
    only the doors stopped using it.
  · **CORRECTION (v0.31.5.50): both residual claims above were artefacts of measuring at the
    OLD gloss, and the follow-up they proposed was the wrong lever.** Re-swept at the shipped
    0.85: `normalScale` 0 / 0.1 / 0.2 / 0.3 / 0.45 are all but indistinguishable, and at
    `normalScale 0` the soft vertical banding is STILL THERE — so at this gloss the bands are
    the ALBEDO grain, not the normal map. The `.49` `normal0` arm only looked decisive because
    0.45 specular exaggerates relief. Nothing was shipped for `normalScale` (meta-rule ii).
  · **The real lever is grain TILING, and `.49` got its sign backwards for the same reason.**
    That round called `repeat 2` "worse" — true at 0.45 gloss, where it read as denser
    corrugation. At 0.85 it is clearly BETTER: repeat 1 stretches the grain over a 0.8 x 2.1 m
    panel into broad soft bands, repeat 2 reads as timber, repeat 3 goes busy and striped
    (bamboo-like). Shipped `getWoodMaterial(leafColor, 2)` on both door paths — which is also
    the grain density WOOD-BANDS (v0.31.5.33) settled for furniture, so it is a principled
    value rather than a tuned one. Verified: the drawn leaf reports `roughness: 0.85,
    repeat: [2, 2]`.
  · **The lesson worth more than the fix: an A/B arm is only valid at the state you will SHIP.**
    Two conclusions from `.49` survived into a written residual because both were measured
    against a gloss that the same round then changed. Re-run the sweep after any change that
    alters how the varied parameter is perceived.

- **The coverage census is STABLE across the door work, and the wall classes dominate it
  (COVERAGE-RECHECK, v0.31.5.55).** The priorities these rounds are ordered by come from
  `surface-coverage.mjs`, so a stale table would misdirect every future round. Re-run after
  `.49`/`.50` changed both door paths: **the ranking is unchanged to the second decimal** —
  curtains `#c8bca8` 3.50%, metal utility doors `#9aa0a6` 3.39%, wooden leaf `#a9825c` 2.79%,
  bifold bath leaves `#cfc8bd` 1.93%, ceiling 1.45%, 322 distinct classes over 70,400 rays.
  That is the expected result and worth having: coverage is GEOMETRY, and `.49`/`.50` changed
  only `roughness` and grain `repeat`, so a shifted table would have meant an unintended
  geometry or material-identity change rather than a finish change.
  · **The census's own headline, stated plainly for the first time:** the flat's walls are
    **~45% of the walk view**, split across two finishes — `#f5f5f0` at ~31.5% carrying
    `normalMap + roughnessMap` and **no albedo `map`**, and `#ffffff` at ~13.4% carrying
    `map + normalMap + roughnessMap`. Every door class in the flat put together is ~10%.
    Recorded as an observation, not a defect: WALL-DETAIL (`wall-detail.mjs`) already swept what
    each wall channel is worth, and nothing here contradicts it. If a future round wants a
    high-coverage target, this is where the pixels are.

- **The flat grey slab is the bifold bath leaf, and it is CORRECT (BIFOLD-VINYL, v0.31.5.58).**
  With the wall mottle gone (`.56`), an interior door in `mainBedroom` started reading as a
  featureless grey slab — no grain, no depth. The suspicion was DOOR-GLOSS all over again on a
  path that round missed: the wooden leaves were fixed from `roughness` 0.45 to 0.85, and this
  one measures **0.35, glossier still**.
  · **Identified by picking the pixel, not by guessing the colour** (new `wall-mottle.mjs`
    `PICK=x,y YAW=n` mode): `MeshPhysicalMaterial #cfc8bd, 0.40 x 2.10 x 0.05, rough 0.35,
    metal 0.05, normalScale 0.2, normalMap 256² @ repeat 1.0, no albedo map` — the bifold bath
    leaf `.51` NAMED but never judged (that round evaluated the curtains and the metal doors and
    said "both hold up"; the bifold was only listed).
  · **The analogy does not hold and nothing was changed (meta-rule ii).** `getVinylMaterial` is a
    deliberate, documented finish — "the standard SG toilet/utility bifold-door finish… slightly
    glossy, subtle plastic sheen, rougher than a lacquered `gloss` paint, smoother/flatter than
    matte `painted`, with no wood grain" — and `constants.ts` asks for it explicitly with
    `material: 'vinyl'`. DOOR-GLOSS was about WOOD at a gloss that contradicted
    `WOOD_BASE_ROUGHNESS` and exaggerated a stretched grain into corrugation. Vinyl has no grain,
    and its sheen is the point. **A real PVC bifold door IS a flat pale slab**; the frame is
    reporting the finish accurately.
  · **The falsifiable part passed.** If `pbrSurfaces` were off, this path returns a plain
    `MeshStandardMaterial` with NO maps — genuinely dead flat, and a real bug. Measured on the
    DRAWN material: `MeshPhysicalMaterial` with the shared paint micro-normal bound at
    `normalScale 0.2`. The PBR branch is live, so the flatness is the finish and not a missing
    map.
  · **`#caa478` (1.69%) is NOT a door frame**, as an earlier round's note guessed from its
    0.4 x 2.0 proportions. It is a **furniture wall-slat panel** — `Group{itemId}` in the ancestor
    chain, `rough 0.85`, all three maps at `repeat 2.0`. Same lesson as the curtains in `.51`:
    a bbox that looks like a door panel is not evidence that it is one.

- **The first pose-honest PER-CLASS ranking — and it promotes nothing unjudged
  (CLASS-RANK-POSE, v0.31.5.72).** The three `classes.json` dumps (down/level/up) joined at the
  stated 20/60/20 weighting. Top 20, with each pose's own share so the weighting can be argued
  with:

  | # | weighted | down | level | up | class |
  | --- | --- | --- | --- | --- | --- |
  | 1 | 7.83 | 6.12 | 9.64 | 4.10 | `#f5f5f0` plaster wall face 3.5×2.6 — fixed `.56` |
  | 2 | 4.14 | 3.64 | 4.82 | 2.62 | `#ffffff` wall tile 1.9×2.6 — verified `.59` |
  | 3 | 3.33 | 2.98 | 3.93 | 1.89 | `#f5f5f0` plaster 1.6×2.6 |
  | 4 | 3.00 | 2.99 | 3.39 | 1.83 | `#9aa0a6` metal utility doors — `.51` |
  | 5 | 2.73 | 1.72 | 3.50 | 1.45 | `#c8bca8` curtains — `.51` |
  | 6 | 2.66 | 2.28 | 3.14 | 1.60 | `#ffffff` wall tile 3.9×2.6 |
  | 7 | 2.44 | 2.62 | 2.79 | 1.19 | `#a9825c` wooden door leaf — `.49`/`.50` |
  | **10** | **2.20** | **0.00** | **1.45** | **6.63** | **`#fafafa` CEILING slab — judged `.70`; the only large promotion (≈23rd → 10th)** |
  | **11** | **2.19** | **2.45** | **1.97** | **2.57** | **`#f1f0ec` WALL BODY — see below** |
  | 14 | 1.97 | 2.11 | 2.09 | 1.49 | `#bcd4e6` shower glass — `.52` |
  | 17 | 1.68 | 1.92 | 1.93 | 0.68 | `#cfc8bd` bifold bath leaf — `.58` |

  · **`#f1f0ec` was the one class in the top 20 never individually examined, and it turns out it
    already was — under another name.** `class-id.mjs` resolves it to **34 full-height slabs**
    (`W × 2.6 × 0.2–0.3`, `rough 0.95`, no maps) around the flat's perimeter, each near a window:
    the structural **wall BODY**, as distinct from the mapped wall FACE (`#f5f5f0`). It is the only
    class whose coverage RISES at both off-level poses (2.45 down / 1.97 level / 2.57 up), because
    what you gain when you tilt is its exposed top and bottom edges. **NIGHT-WALL-CAP already names
    it explicitly** — "every dark sample is an ordinary wall body (`#f1f0ec`, `W x 2.6 x 0.2`)" —
    and measured its bimodal night caps with `wall-cap.mjs`, verdict "by design, not blown out".
    Meta-rule (xvii-b) has now paid **five rounds running**.
  · **So the pose bias cost nothing at class level.** The level-only table mis-ranked the ceiling
    and floors, but every other class in the pose-honest top 20 was already prioritised correctly
    and already judged. The `.49`–`.70` prioritisations stand.

- **The priority table this run steered by was a SINGLE-POSE artefact, and `.70`'s own numbers were
  wrong too (POSE-HONEST-COVERAGE, v0.31.5.71).** `surface-coverage.mjs` now reports a total share
  per ORIENTATION over EVERY class, not just the printed top-26 — which is what exposed both
  problems. Same 11 rooms x 4 yaws x 1600 rays at each pitch:

  | pose | vertical | ceiling | floor | (no hit) | classes |
  | --- | --- | --- | --- | --- | --- |
  | down (`PITCH=-0.75`) | 69.93% | 0.00% | **26.36%** | 3.71% | 401 |
  | level (`PITCH=0`, the shipped census) | **88.61%** | 4.54% | 1.34% | 5.52% | 322 |
  | up (`PITCH=0.75`) | 47.16% | **45.81%** | 0.00% | 7.03% | 161 |

  · **CORRECTION to `.70`.** That round reported the ceiling as "1.45% level -> 43.87% up, a 30x
    swing". Both figures were wrong in the same way: **1.45% was ONE printed CLASS** (the largest
    single ceiling slab) and 43.87% was a hand-sum of the truncated top-26 rows. The honest
    comparison is **4.54% -> 45.81%, about 10x**. The conclusion is unchanged and if anything
    cleaner — the level census badly under-reports the ceiling, and "you barely see it" was never
    true — but comparing a per-class figure with an all-class total is exactly the kind of
    apples-to-oranges error the loop is supposed to catch.
  · **Pose-weighted table (20/60/20 down/level/up).** The weighting is a JUDGEMENT, not a
    measurement, and is stated so it can be argued with: a walking user looks level most of the
    time, glances down at floor finishes and furniture, and up at fans/lights/ceiling designs less
    often — but this is an interior-design tool where all three are deliberately inspected.

    | surface | pose-honest share | level-only share |
    | --- | --- | --- |
    | vertical (walls, doors, curtains, joinery) | **76.6%** | 88.6% |
    | **ceiling** | **11.9%** | 4.5% |
    | floor | **6.1%** | 1.3% |

  · **The ceiling is the SECOND-largest surface in the flat, and floors are third** — not the
    footnotes the level table made them. Every "prioritise by measured coverage" decision from
    `.49` to `.70` used the level-only figure, so treat those rankings as valid for VERTICAL
    surfaces and silent about the other two.
  · **Nothing else jumped.** No skirting, cornice, worktop or wall-unit underside class rises the
    way the ceiling does; the down pose simply redistributes area from walls to floor, and the up
    pose from walls to ceiling. The two surfaces the level census hid are the two this loop has
    now judged (`.69` floors CLEAN, `.70` ceiling CLEAN).
  · `surface-coverage.mjs` writes `classes.json` per run so the three poses can be joined into a
    weighted PER-CLASS ranking without re-shooting each one (~4 min apiece).

- **The ceiling is 1.45% of the view LEVEL and 43.87% when you glance UP — the old reason was
  wrong even though the verdict holds (CEILING-POSE, v0.31.5.70).** `.49` waved the ceiling
  through as "fine because you barely see it at 1.6 m eye height". That reason is false: the
  census sweeps at eye level with a slight DOWNWARD tilt, so it under-counts the ceiling exactly
  as it under-counted floors. Re-run with `surface-coverage.mjs PITCH=0.75` (the glance-up pose),
  same 11 rooms x 4 yaws x 1600 rays:

  | pose | ceiling | all vertical |
  | --- | --- | --- |
  | level (the shipped census) | **1.45%** | ~75% |
  | **up (`PITCH=0.75`)** | **43.87%** | 28.88% |

  A **30x** swing. Looking up, the ceiling is the single largest thing in view — larger than every
  wall combined.
  · **The verdict survives for a different reason.** Cropped in at `livingDining` and at `bath1`
    (the smallest room, where the ceiling is nearest), the mapless `meshLambertMaterial` reads as
    smooth matte painted plaster with a natural falloff — and next to the tiled bath walls it is
    correctly the smoothest surface in the room. **A real ceiling IS smooth**: skim-coated, seen at
    2.6 m and at grazing angles where wall-scale orange peel would not register. So the Lambert is
    a good model, not a shortcut that happens to be hidden.
  · **Retire "you barely see it" and keep "a ceiling is smooth."** The first claim would have
    justified ignoring anything up there — a stain, a badly-lit cornice, a fixture artefact — on a
    number that is off by 30x. The replacement claim is falsifiable and points the right way: if a
    ceiling ever looks wrong, the pose to check it at is `PITCH=0.75`, not the census pose.
  · **If a future round DOES want ceiling texture**, the cost is already recorded in
    `src/scene/CLAUDE.md`: Lambert -> Standard across 247 materials bought 2.17 ms of 34.54, so the
    ceiling alone is cheap. The real constraint is the caveat filed with it — deriving a Lambert
    twin from a CACHED finish material goes stale, because the finish system mutates those in
    place.

- **The coverage census's unnamed classes, IDENTIFIED — and the biggest one was not a door
  (SURFACE-CLASS-ID, v0.31.5.51).** `surface-coverage.mjs` ranks what a walk-mode user sees but
  labels each class only by material + colour + bbox, so two of the top classes went into the
  loop's notes as "door-like" on the strength of their shape. One of them was not.
  `scripts/dev-probes/class-id.mjs` enumerates every mesh carrying a given colour and reports its
  WORLD POSITION, size, ancestor chain and nearest plan opening — the app's own evidence rather
  than an inference from proportions:

  | class | coverage | what it actually is |
  | --- | --- | --- |
  | `#c8bca8` Physical, 1.0 x 2.55 x 0.1, rough 0.95 | **3.50%** | **CURTAINS** — a furniture ITEM (its chain carries `Group{itemId}`, which apartment components never have), repeated along every window wall. Not a door: it is taller than a leaf because it hangs from a rail. |
  | `#9aa0a6` Physical, 0.8 x 2.1, metal 0.25 | 3.39% | the **metal blast / utility doors** at `door-householdShelter` (0.14 m thick — the HDB shelter door) and `door-serviceYard`. |
  | `#cfc8bd` Physical, 0.4 x 2.1, rough 0.35 | — | **bifold bathroom leaves**, TWO per opening (0.4 m each across a 0.8 m door) at `door-bath1` / `door-bath2`. |

  · **Both hold up; nothing was changed.** The curtain reads as matte fabric with soft pleats and
    a visible fine weave from its normal map — plausible at conversational distance. The metal
    doors carry the right metalness for a blast door.
  · **The lesson is the method.** A bbox of 1.0 x 2.55 x 0.1 standing in a wall looks exactly like
    a tall door panel, and that is how it got recorded. The `Group{itemId}` in the ancestor chain
    is the cheap discriminator between FURNITURE and APARTMENT geometry — use it before naming a
    class, because a wrong label sends the next round at the wrong file.
  · Minor, unmeasured observation for whoever looks next: the door handles are visibly OCTAGONAL
    at close range. They are a small fraction of any frame, so no coverage number justifies work
    on them yet — noted rather than filed.


- **Where the wall body's screen share actually comes from: the BOOT view, and its EXTERIOR
  faces (WALLBODY-ORBIT, v0.31.5.79).** `.71`/`.72` judged `#f1f0ec` at its *walk* census figures
  (2.45 down / 1.97 level / 2.57 up) and NIGHT-WALL-CAP judged its night caps. Neither covers the
  **orbit/dollhouse pose, which is the BOOT view** — and there `chroma-audit` puts `#f1f0ec` at
  **19.0%**, second only to the sky. That is a ~10x jump over any walk pose and it was unexplained.
  · **It is not the wall TOPS.** The tops are thin in screen space; four hand-aimed picks intended
    for them all landed on the mapped face (`#f5f5f0`) instead. Two raycast picks that DID resolve
    to `#f1f0ec` came back `[3.39, 2.6, 0.1]` and `[2.15, 2.6, 0.3]` — the large **exterior** faces
    of the perimeter slabs, i.e. the outside of the flat, which a dollhouse camera looks straight at.
    `class-id.mjs` confirms 34 instances, chain `Group < Group < Group < Scene` (**no**
    `Group{itemId}` — shell, not furniture), and confirms `map=. nrm=. rghMap=.`: genuinely
    unmapped, `rough 0.95`, versus the mapped face beside it.
  · **This does NOT yet promote the class.** The obvious follow-up — a masked microcontrast against
    the known-good benchmarks — was NOT obtained: the seed landed on the sky dome and the number it
    produced was discarded (see `.79` in the playbook, and the new `SEED_MAX_DISTANCE` guard that
    now refuses that seed). **The flatness question for the wall body in the boot view is therefore
    OPEN, not clean.** Whoever picks it up: seed by raycast in `surface-detail`'s OWN framing, and
    weigh any fix against meta-rule (lxviii) — 34 slabs on the Performance tier is not free.
  · Meta-rule (xvii-b) paid a **ninth** round on the way in: `#f1f0ec` is `WALL_STRUCTURE_COLOR`
    (`apartment/walls/wallBodyGeometry.ts`), already named and judged above under another name.

- **The wall body does NOT read flat, and the boot-view question `.79` left open is now CLOSED
  (WALLBODY-JUDGED, v0.31.5.80).** `.79` established `#f1f0ec` is 19.0% of `chroma-audit`'s
  orbit/BOOT census, 34 unmapped shell slabs beside a mapped `#f5f5f0` face, but could not
  measure it: the seed hit the sky dome. Two probe fixes made the measurement possible — a
  coordinate-free `COLOUR=<hex>` seed (the shell has no `defId`), and a painter mask that groups
  UNMAPPED materials by equivalence instead of collapsing to one instance (0.2% -> 8.9% of cells).
  · **Measured, `surface-detail MODE=orbit COLOUR=f1f0ec MASK=painter`, 34 materials, 515/5760
    cells: microcontrast 1.408, sigma 23.48, mean 167.7, chroma 0.075, 0.0% past 0.35 saturation.**
    That is ABOVE both mapped benchmarks (plaster post-fix 0.961, shared wood painter 0.862), so
    the "unmapped therefore flat" hypothesis has no support. Chroma is a non-issue outright.
  · **Read that number as an UPPER BOUND (meta-rule lxxi).** The class is 34 narrow bands — wall
    tops seen edge-on plus the perimeter slabs' exterior faces — so much of its cell-scale
    variation is slab boundaries against bright interior faces, not surface detail. It refutes
    "reads flat"; it does not establish "richly textured".
  · **Accepted as correct, with evidence (meta-rule xi).** What the crop shows is the OUTSIDE of
    the flat, largely in shade: an exterior/corridor face and the section-cut tops, which every
    reference app renders as a plain fill. Unmapped is the right authoring choice here, and the
    mapped face is the surface the user actually looks at from inside.
  · **8.9% here vs 19.0% in `.79` is not a contradiction** — `surface-detail MODE=orbit` frames
    the flat smaller than `chroma-audit MODE=orbit`. The same MODE name is not the same camera;
    quote the probe as well as the pose.

- **Baseboard + crown are ONE class, and both are correct (TRIM-JUDGED, v0.31.5.81).** `#eeece6`
  is `DEFAULT_CROWN_COLOR` / the baseboard in `walls/WallSegment.tsx` (`roughness 0.55`, no maps).
  `class-id.mjs` finds **230 instances in matched PAIRS per wall segment** — `y=0.04` at height
  0.09 (baseboard, at the floor) and `y=2.56` at height 0.07 (crown, at the 2.6 m ceiling) — chain
  `Group < Group < Group < Group < Scene`, i.e. shell overlay, no `Group{itemId}`. That 0.07 m
  matches the height the CHANGELOG records for `FadeCrown` before it became per-wall customisable.
  · **Measured** (`surface-detail MODE=orbit COLOUR=eeece6 MASK=painter`, 230 materials, 102/5760
    cells = 1.8%, against a 1.9% census share): microcontrast **2.068**, sigma 23.06, chroma 0.116,
    **0.0%** past 0.35 saturation. Nothing to fix — `rough 0.55` is right for painted trim.
  · **Read 2.068 as an EXTREME upper bound (meta-rule xcii).** The class is 230 strips 0.07–0.09 m
    tall; at cell scale it is almost ALL edge. It refutes "reads flat" and says little else.
  · **This class is also the best validation of `.80`'s mask fix**: 230 sibling unmapped materials
    now group by equivalence. Before it, the painter would have collapsed to a single instance.

- **Kitchen cabinetry `#e3dfd6` is correct, and shares an already-judged painter (v0.31.5.81).**
  `KitchenCounter.tsx` / `WallCabinet.tsx` (`kitchen.ts` defaults). `surface-detail COLOUR=e3dfd6`
  masks 123/5760 cells (2.1%, census 2.7%) and reports microcontrast **1.024**, sigma 27.02, chroma
  0.175, **0.0%** past 0.35 saturation — above both benchmarks (plaster 0.961, wood 0.862).
  · **The mask spans 34 materials across TWO colours (meta-rule lxxxii).** `#e3dfd6` and `#cfc8bd`
    share the paint micro-normal via `getVinylMaterial`/`getPaintedMaterial`, exactly as `.58` and
    `materials/CLAUDE.md` already record — so this measures the shared PAINTER, not the cabinets
    alone, and `.58` had already judged the `#cfc8bd` member (the bifold bath leaf, "flat was
    right"). Meta-rule (xvii-b) pays a **tenth** round.

## Level visibility is per-VIEW, and walk mode inherits it (v0.31.5.110)

`PlanShell` renders one `PlanLevelShell` per level returned by
`floorplan/levels.ts:visibleLevels(plan, viewLevelId)`. That function returns **only the selected
storey** unless `viewLevelId === 'all'` (the store default), and hidden storeys **unmount** — which
is deliberate, so picking cannot hit a floor you are not looking at.

**This is right for the dollhouse and 2D editing views and wrong for walk mode.** Measured on
`tpl-loft`: the same four ground rooms render 126 meshes / 49191 tris at `'all'` and 103 / 41406
with one storey selected — the 23-mesh difference is the mezzanine. And because
`walkLevel(plan, 'all')` walks the GROUND floor, **selecting a storey is the only way to walk it,
which is exactly what unmounts the storey below.** Walking the loft mezzanine therefore shows sky
over the guard rail and black holes in the floor where the double-height volume should be.

Severity tracks how much ground floor has no storey above it — `tpl-loft` 62%, `tpl-hdb-maisonette`
and `tpl-terrace-ground` 13% each (small stairwell voids, which is why `.95` and `.104` walked two
upper storeys and saw nothing).

If you change this, note that un-hiding the storey below is NOT sufficient: it draws its own
ceiling, so you would swap a sky hole for the top of a ceiling slab. The ceiling-occluder path
(`ceiling/CeilingOccluder.tsx`, `ceiling/occluderRects.ts`) has to cull the ceiling of a storey
being overlooked. See `docs/open-graphics-decisions.md` item (g) — the design and the tier cost are
an open call, not a unilateral edit.
