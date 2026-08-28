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

