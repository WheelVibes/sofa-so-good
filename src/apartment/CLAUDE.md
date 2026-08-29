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

