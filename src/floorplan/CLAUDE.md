# src/floorplan — plan model rules

Area rules for the editable plan model. Full map in `docs/ARCHITECTURE.md`;
multi-storey design rationale in `docs/research/multi-level-design.md`.

- **Multi-storey (F13): `plan.rooms`/`plan.walls`/`plan.openings` are the GROUND
  floor only.** For "all the home's rooms" use `levels.ts` `allPlanRooms(plan)`;
  resolve a room's storey with `levelOfRoom`, an item's with `levelOfItem`
  (`item.levelId`, absent = ground). Run any single-level geometry helper on one
  storey via `levelAsPlan(plan, level)` — never hand-roll level math.
- **Cross-item spatial scans must be level-gated**: two items only interact when
  `(a.levelId ?? 'ground') === (b.levelId ?? 'ground')` (see `itemsCollide`,
  `findNarrowGaps`, `findWallClipsByLevel`, `isItemInRoom`). Same for item↔wall
  tests — resolve the item's own storey's walls (`placementWalls(state, levelId)`).
- **Room ids are plan-unique across ALL storeys** — room-keyed consumers
  (finishes, score, reports) stay level-agnostic because of this invariant;
  preserve it when generating templates/levels.
- Plan-mutating slice actions route through `withLevelGeometry(plan, levelId, fn)`
  (ground default). Schema: `upperLevels` + `levelId` are optional + additive —
  no version bump needed for level features that follow that shape.
- **An opening's `[offset, offset+width]` must always stay inside its host wall's
  span — route every offset/width-affecting edit through `types.ts`'s
  `clampOpeningWidth(width, wallLen, margin?)` / `clampOpeningOffset(offset, width,
  wallLen, margin?)`** (pure, default `margin=0`, floor `MIN_PLAN_OPENING_WIDTH`).
  `floorPlanSlice.updateOpening` re-derives BOTH from the current wall on every
  patch that touches `width` or `offset` (not just the field that changed) — a
  width increase alone used to leave a stale offset that pushed the opening past
  the wall's far end (BUG-7); clamping in the slice action (rather than only in
  the `OpeningInspector` control) covers every entry point, including
  `duplicateOpening`'s nudge-along-wall math. `gridSnap.ts`'s `snapOpening` predates this helper and re-implements the
  same `margin=0` formula inline — reuse `clampOpeningOffset`/`clampOpeningWidth`
  there on next touch rather than hand-rolling another copy. (`sh3dPlacement.ts`
  was migrated to the shared helpers in the SH3D exact-sill work, v0.22.2.16 —
  it also maps a window's SH3D `elevation` to `sill`/`head`, clamped to the
  ceiling, with the old defaults as the missing/corrupt fallback.)
- **Per-element colour (`elementColors`):** `PlanWall.color` overrides the plan-wide `wallColor` for
  one wall; `PlanOpening.color` paints a door leaf (panels derive a darker shade) or tints window glass.
  Both are optional hex strings, edited in `PlanInspector`, round-tripped via `schema.ts`
  (`PlanWallZ`/`PlanOpeningZ`), and rendered by `PlanShell` (`FadeWall`/`SlopedWallMesh`/`FadeWindow`) +
  `PlanDoorLeaf`. Adding another per-element appearance field follows the same additive shape (no
  version bump).
- **Open railings (`PlanWall.railing`):** same additive shape as `topHeight` (no version bump) —
  when true alongside a set `topHeight`, the wall renders as an open metal railing (top rail +
  posts + balusters, pure layout in `railingLayout.ts`) instead of a solid half-wall/parapet;
  edited in `WallInspector` (shown only when `topHeight` is set), rendered by the curated flat's
  `WallSegment.tsx` and `PlanShell`'s wall loop.
- **Per-room ceiling finish (`ceilingFinish`):** a room's ceiling can be painted/textured with any
  catalog material, mirroring floor/wall finish. Stored in the finishes slice (`finishes.ceiling`,
  keyed by room id) with write-through to the plan room's `ceilingFinish` field; resolved by
  `roomFinishes.ts:resolvePlanRoomCeiling` (slice → `room.ceilingFinish` → `null`/plain white).
  Rendered by `apartment/Ceiling.tsx` (default flat, via `ceiling/RoomCeilingTile`) and
  `apartment/floor/PlanRoomCeiling` (custom plans) — the finished plane faces down (front-side) so
  it reads from below and stays culled from above. Applies to the **flat** ceiling only; a designed
  (tray/coffered/dropped/sloped) treatment keeps its plain planes. Same additive schema shape.
- **Door/window styles (`openingStyles`):** `PlanOpening.style` selects a door type
  (`panel`/`flush`/`glazed`/`bifold`/`sliding`/`double`) or window type
  (`plain`/`grille`/`invisible-grille`/`louvre`),
  rendered as pure procedural geometry by `PlanDoorLeaf` (panel/glaze/bifold branches — bifold is two
  half-width leaves that fold at a mid-hinge, a simple visual not true accordion kinematics; the 2D
  swing arc keeps the standard full-width envelope for it; **`sliding`** is a single slab that
  TRANSLATES along the wall — barn-door style, proud of the wall on the room side — driven by the same
  open/close timing; **`double`** is two half-width leaves hinged at BOTH jambs swinging the same side,
  mirror rotations, the SG condo main-door / large master-bedroom norm) and `PlanShell`'s `FadeWindow`
  (grille/invisible-grille/louvre bars — invisible-grille is hair-thin near-transparent cables vs.
  grille's chunky visible bars; the vertical-bar/louvre-slat layout maths lives in
  `windowGrilleLayout.ts`, pure + unit-tested. **Each window's members collapse to ONE InstancedMesh
  per bucket (PERF):** `grilleBarInstances`/`louvreSlatInstances` → one `InstancedBoxes`,
  `invisibleGrilleCableInstances` → one `InstancedCylinders` (AE=0 vs. the old per-bar/per-cable
  mesh, unit-tested). Each bucket keeps its OWN material — the wall-reveal fade touches only the
  glass pane (`FadeWindow`'s `ref`), NOT the grille members (they were never faded), so instancing
  is byte-identical to the prior reveal behaviour); same additive schema shape as `color`. A door ALSO
  carries `PlanOpening.material` (`painted`/`wood`/`vinyl`/`metal`, `doorMaterial.ts:
  resolveDoorLeafMaterialKind` — defaults to `vinyl` for `bifold`, `painted` otherwise) selecting its
  leaf's real finish via `materials/furnitureMaterials.ts` (`getPaintedMaterial`/`getWoodMaterial`/
  `getVinylMaterial`/`getMetalMaterial` — `metal` is the HDB household-shelter blast door /
  aluminium-framed yard door finish, SNV spec v0.23.1.5); windows ignore it. The FIXED flat's
  `DoorSpec` (apartment/constants.ts) carries the same `style`/`material`/`color` axes (+ `gate` for
  the entrance's HDB metal security gate), rendered by `Door.tsx` and mirrored onto the plan
  openings by `buildDefaultPlan` so 2D/3D/schedule never disagree. Same additive schema shape as `style`. The **2D plan
  symbol** is built ONCE by `doorSwing.ts:doorPlanSymbol(wall, o)` (world metres) and shared by every
  consumer — `OpeningsLayer` (editor), `reportPlanSvg` (report/drawing set); DXF export draws a door
  as a plain gap LINE for ALL styles (the geometry is style-agnostic), **but** the door/window
  **schedule is style-aware** (v0.22.2.72+): `analysis/openingSchedule.ts` folds the normalised
  `style` + resolved leaf `material` into the mark grouping key, so a sliding door and a swing door
  of identical size — or a grille vs plain window — are SEPARATE marks (D1/D2…), and the schedule
  sheet + report print a "Style / material" column ("Sliding · Wood" for doors, the style alone for
  windows). Legacy openings with no style/material normalise to the kind's default (`panel`/`plain`,
  `painted`) so a plan predating those fields groups byte-identically. It returns either swing
  `leaves` (one for panel/flush/glazed/bifold, TWO quarter-arcs
  for `double`) or a `sliding` `{bar, arrow}` (leaf bar beside the opening + a slide-direction arrow,
  NO arc). **Keep-out** (`doorSwingClearRect`, consumed by `layout/clearance.ts`): `sliding` returns
  **null** — a slider sweeps nothing, so it contributes NO quarter-circle keep-out, only the
  both-sides walk-through strip from `doorApproachRects`; `double` returns a **conservative full-width
  rect** (both quarters + the gap between them, `width/2` deep) rather than a literal two-arc trace.
  `style` stays a FREE string (no closed zod enum) in `types.ts` + `schema.ts` — adding a style needs
  no version bump; keep the two files' documented value list in parity.
- **Wall structural classification (TODO G7, `wallStructure` pro flag):**
  `PlanWall.structure?: 'load-bearing'|'rc-partition'|'brick-partition'|'drywall'|'gable-end'|'unknown'`
  (absent = `'unknown'`) is **user-declared, never verified** — the app cannot tell a
  load-bearing beam-and-column wall from a non-structural precast/Ferrolite partition from
  plan geometry alone (a documented HDB hacking-plan failure mode; see
  `docs/research/2026-07-18-contractor-handover-research.md`). `'gable-end'` is the flat block's
  exposed external END wall (walls.jpg legend #3 — a thick wall with its own distinct lining
  symbol, distinct from the plain solid-black structural wall #1/#2's hollow double-line normal
  wall) — RC/structural exactly like `'load-bearing'`/`'rc-partition'` (`wallHackability`
  classifies it `'no'`, never hackable), tagged separately purely so 2D/3D rendering can draw its
  distinct symbol. **Exception: the curated default flat seeds it** — `apartment/constants.ts`'s
  `WALLS` carry a `structure` traced from the official plan's line types
  (`assets/floor_plan/default.png` legend: solid black → `'load-bearing'`, hollow double lines →
  `'brick-partition'`; `assets/floor_plan/walls.jpg` legend: the gable-end symbol on the west wall
  → `'gable-end'`, seeded on `wall-ext-W`), copied through by `buildDefaultPlan`; the
  household-shelter RC ring and the B3/LD column stub are separate walls
  (`wall-int-hs-N`/`wall-int-hs-S`/`wall-int-b3-LD-col`) so the never-hackable classification
  doesn't spill onto adjacent normal partitions. Same additive schema shape as `color`/`style`
  above. Edited per-wall in `WallInspector` (a `Select`, with an inline "confirm against HDB/BCA
  records" hint) or in bulk across a multi-wall selection via `floorPlanSlice.setWallsStructure`
  (`PlanInspector`'s multi-wall panel — "Mixed" placeholder when the selection disagrees).
  `diffWalls`/`diffWallsByLevel` (`demolitionPlan.ts`) never clone wall objects — they just bucket
  references into `kept`/`demolished`/`added` — so `structure` rides straight through into
  `WallDiff` with no extra plumbing. `demolitionPlanSvg.ts` reads it directly, deciding
  "demolition-restricted?" via the ONE shared classifier (`wallHackability.ts:
  isDemolitionRestricted`) so the sheet can NEVER diverge from the live hackability overlay +
  wall-delete guard: a **structural** wall — `'load-bearing'`, `'rc-partition'` (reinforced-
  concrete partition), **OR** `'gable-end'` — always renders heavy/solid (+ a "Structural —
  load-bearing / RC / gable-end" legend row); a structural wall marked for demolition escalates
  to a hard danger treatment + an inline "NOT PERMITTED" label ("structural (load-bearing / RC /
  gable-end)" — off-limits under SG rules, never just "needs a permit"); an `'unknown'`
  (or unset) wall being demolished gets an inline "⚠" + a "confirm with HDB/PE" legend note.
  Demolished walls also get a real diagonal-hatch tick pattern (not just a dashed colour) per
  drafting convention. The sheet prints a concise SG permit-note block alongside the legend
  (HDB permit required for any demolition, PE endorsement when RC is touched, load-bearing
  off-limits, classification is user-declared, weekday-only working hours).
  **2D plan editor structure-driven rendering (`WallsLayer.tsx`, unconditional — the HDB plan
  drawing convention, not a toggle):** the wall BODY stroke strengthens for any structural wall
  (`isDemolitionRestricted`) — strongest ink (`var(--text)`) + a heavier body width — and a
  `'gable-end'` wall additionally overlays a thin dashed lengthwise lining stripe
  (`var(--surface)`, `6 4` dash) reading as its distinct plan symbol; non-structural/unknown walls
  keep today's look. Selection/stray halos, the hit target, skeleton mode, and the bulge handle are
  unchanged. `ui/reportPlanSvg.ts`'s drawing-set floor plan mirrors the structural=heavier-stroke
  treatment (a small localized change — no gable-end lining stripe there, since that sheet strokes
  every wall as a plain `<line>`).
  **3D wall-types overlay (`wallTypes3d` pro flag):** a View-menu toggle (`showWallTypes` on
  `uiSlice`, session-only, mirrors `clearanceOn`) tints each wall's translucent overlay jacket by
  `structure` in BOTH the whole-flat orbit view and the per-room editor — see
  `docs/ARCHITECTURE.md`'s wall-structure section for the render-site details
  (`wallTypeColor.ts`/`WallTypeOverlayJacket`).
- **Parametric roof (UX research round 3, `parametricRoof` pro flag): `PlanRoof` on
  `FloorPlan` + pure `roofModel.ts`.** `roof?: PlanRoof` (`style`
  `gable`/`hip`/`flat-parapet`, `pitchDeg` 15–45, `overhang` 0–0.6, `ridgeAxis`
  `auto`/`x`/`z`, optional `material` clay-tile/metal-seam + `dormers`) is additive/optional —
  no version bump; the schema enums MUST stay in parity with `RoofStyle`/`RoofMaterialKind`/
  `RoofDormerSide` in `types.ts` (adding a value needs both files). `roofModel.ts:buildRoofModel`
  is the ONE pure builder: it takes the top storey's outer footprint **bounding box**
  (`outerFootprintBounds` over the level's external walls — v1 roofs the AABB, so an L/U plan
  gets a clean rectangular roof; documented in the module header) + the eave world Y
  (`level.elevation + level.ceilingHeight`) and emits triangulatable `RoofPlane`s (gable: 2 slopes
  + 2 end gables; hip: 2 trapezoids + 2 hip triangles; flat-parapet: 1 slab + a `ParapetBox` ring)
  plus positioned `DormerBox`es (gable dormers on the two main planes; a dormer on a non-facing
  side for the resolved ridge axis is dropped). Clamps pitch/overhang; `rise = halfSpan ×
  tan(pitch)`; a degenerate footprint → `{ fallback: true }` (no roof). Rendered by
  `apartment/Roof.tsx` (world-space, mounted in `PlanShell`), which **fades the whole roof out
  when the orbit camera looks down into the dollhouse** (`camera forward.y < −0.35`) so the
  interior stays visible, and keeps it solid (DoubleSide) for a shallow exterior orbit + walk mode.
  Edited via `ui/floorplan/RoofSettings.tsx` in the plan-defaults panel, shown only when
  `planRoofEligible` (landed `housingType` OR multi-level). The Terrace + Maisonette templates seed
  a default 30° gable.
- Geometry stays **pure + unit-tested** here (no three/React imports beyond types).
- **Ruler guides (PARITY-PLAN-GUIDES): `plan.guides: {axis:'x'|'z',pos}[]`** are plan-wide reference
  lines (not level-tagged) the 2D editor snaps points to. Pure `snapToGuides.ts`
  (`snapToGuides`/`nearestGuide`/`addGuide`) snaps each axis independently within a threshold; the
  editor applies it in `pointerGrid` (guide beats grid). Store: `addPlanGuide`/`removePlanGuide`/
  `clearPlanGuides` (fork-default, one undo). Additive schema field — no version bump. `planGuides` pro flag.
- **Corner fillet/bevel (PARITY-CORNER-FILLET): `cornerFillet.ts`** (pure tangent/bisector geometry) +
  `filletWalls.ts` `applyWallFillet(walls, idA, idB, amount, mode)` trims two connected walls to their
  tangent/setback points and inserts a connecting wall (curved `arc` for `'round'`, straight for
  `'bevel'`). Store `filletCorner(idA, idB, amount, mode, levelId)`; editor shows Round/Bevel when 2
  connected walls are selected. Openings on a filleted wall keep their offset (may shift) — same
  limitation as `insetRoom`. `cornerFillet` pro flag.
- **Chained dimensions (PARITY-DIM-CHAIN): `dimensionChain.ts`** (`chainDimensions`/`runningDimensions`)
  projects points onto a baseline and emits consecutive segments. Store `addChainDimensions(levelId)`
  generates a row of `PlanDimension`s along the level's bottom + left baselines from the wall-vertex
  positions (ground dims carry no `levelId`). `dimensionChain` pro flag.
- **Whole-plan transforms scale ALL storeys about one anchor.** `rescalePlan.ts`
  (PARITY-PLAN-SCALE) multiplies every wall endpoint / room polygon / opening
  offset / note·dim·polyline vertex / upper-storey geometry + furniture POSITION
  by a factor (or `targetLength/currentLength`) about an anchor point (origin, or
  the anchor wall's `start`). Furniture **sizes are preserved** by default (SH3D
  "scale walls" parity) — opt in with `scaleFurnitureSize`. Pure + composable
  (double-scale composes); factor ≤ 0 / NaN throws; factor 1 is a deep-clone
  no-op. The store action is `floorPlanSlice.rescaleFloorPlan` (one undo step);
  UI is `ui/floorplan/ScalePlanModal.tsx` behind the `planScale` Pro flag.
- **Whole-plan transforms reflect/scale ALL storeys consistently.** `mirrorPlanRegion.ts`
  (PARITY-PLAN-MIRROR-REGION) reflects every wall endpoint / room origin·polygon·labelOffset /
  opening / note·dim·polyline vertex / upper-storey geometry + furniture POSITION across the
  vertical world line `x = axisX` (`x → 2·axisX − x`, Z untouched). Because a reflection is
  orientation-REVERSING it also flips handedness: opening `hinge` (start↔end) + `swing` (left↔right),
  wall `arc` sign, room `labelAngle` sign, and furniture yaw (`rotation → −rotation`) + `flipX`. Lengths
  and areas are preserved (it's an isometry — sizes/`extent`/`elevation` are untouched). Pure +
  composable: a double-mirror about the same axis is the identity; non-finite `axisX` throws. The store
  action is `floorPlanSlice.mirrorFloorPlan(axisX?)` (defaults to the plan's centre-X; one undo step;
  forks the default plan); UI is the "Mirror plan" entry in the editor's Plan menu behind the
  `planMirrorRegion` Pro flag.
- **Whole-plan transforms snap ALL storeys to a grid.** `gridSnap.ts` (PARITY-GRID-SNAP) rounds
  every wall endpoint / room origin·width·depth·extension·polygon·labelOffset / opening offset+width /
  note·dim·polyline vertex / upper-storey geometry + `elevation` + the plan `extent` to the nearest
  multiple of `gridM` (`Math.round(v/gridM)*gridM`) — to tidy a traced/imported plan. Openings are
  **re-threaded** against the snapped wall (offset snapped + clamped to `[0, wallLen−width]`) so they
  stay on their wall; a wall that would **collapse to zero length** is left unsnapped (never dropped).
  Furniture POSITIONS snap only with `{snapFurniture}` (sizes always preserved). Pure + idempotent
  (`snap∘snap === snap`); `gridM ≤ 0` / NaN / Infinity throws. The store action is
  `floorPlanSlice.snapFloorPlanToGrid(gridM?, opts?)` (one undo step; defaults `gridM` to the editor
  `gridSize`, else 0.05 m; forks the default plan); UI is the "Snap to grid" entry in the editor's
  Plan menu behind the `planGridSnap` Pro flag.
- **Room inset/outset (PARITY-ROOM-INSET): `insetRoom.ts` `insetPolygon(points, dist)`** offsets
  every edge of a simple polygon by a signed distance and re-intersects adjacent offset edges:
  `dist>0` shrinks inward (dropped soffit / set-down), `dist<0` grows outward (setback). Handles
  convex AND simple concave (L-shape) rooms; winding is auto-detected (folded into the offset
  sign) so CW/CCW both work. A degenerate result (the offset over-runs — an edge reverses
  direction, the winding sign flips, or the area collapses to ~0) returns **`null`** rather than a
  self-intersecting polygon. Pure (reuses `polygonArea`). The store action
  `floorPlanSlice.insetRoom(id, dist)` (+ `insetSelectedRoom`) runs it on the room's outline
  (`roomPolygon`), writes the result back as an explicit `polygon` (subsuming any L-`extension`),
  re-flows the room's auto wall/opening names, pushes ONE undo step, and rejects a `null` result
  with an error toast (no fork / no history). Boundary WALLS are not re-traced, so openings keep
  their wall offsets — a known limitation for large insets. `roomInset` Pro flag.
- **Contractor-grade finish schedule (G4): `finishSchedule.ts:buildFinishSchedule`** is the ONE pure
  builder for both the report's "Finishes schedule" section and the drawing set's sheet
  (`ui/finishScheduleHtml.ts` is the shared HTML renderer both consume — never fork the table markup).
  Wall area is perimeter × ceiling height **net of door/window openings**: an opening's area
  (`width × (head−sill)`) is deducted from EVERY room a probe (`openingProbe.ts:openingProbePoints`,
  both sides of its host wall) lands in — each bordering room independently loses that much of its OWN
  wall face (not halved/shared between the two rooms a door connects). Ceiling area is always the flat
  footprint; a non-flat `room.ceiling` treatment is flagged as a verify-on-site note rather than adding
  an invented surface number. Material codes (`FL-`/`WL-`/`CL-`/`AW-` + 2-digit index) are assigned in
  **first-seen order** over the room/wall iteration — same input always yields the same codes, and a
  finish introduced later is appended after every code already assigned rather than renumbering them
  (`assignCodes`). Accent walls (`PlanWall.color`) are a separate `AccentWallRow` list keyed by
  distinct colour (two walls sharing a colour share one `AW-0N`). `floorTexScale` is surfaced as an
  honest tiling-scale factor in the floor cell's `spec` — there is no base tile mm size stored
  anywhere in the model, so none is invented.
- **MEP points (G1, contractor-handover goal): `electricalPoints?`/`plumbingPoints?` on
  `FloorPlan`** (`PlanElectricalPoint`/`PlanPlumbingPoint`) — free XZ (not wall-anchored; a
  `{wallId, offset}` binding would need re-homing on `splitWall`/`removeWall`/`filletCorner` like
  openings do), level-tagged, mount height in mm AFFL (per-kind default in `mepPoints.ts`) +
  optional label. `ElectricalKind`/`PlumbingKind` live HERE (moved from `electricalPlan.ts`/
  `plumbingPlan.ts`, which re-export them type-only) so this file can host the point interfaces
  without an import cycle. Editor: the `'mep'` tool (`ui/floorplan/editor/DrawToolPalette.tsx`'s
  4th group + mobile `PlanToolsSheet` MEP section) snaps a placement onto the nearest wall FACE
  within 0.25 m (`editor/mepPlacement.ts`, pure, given an already-computed `nearestWall()` hit);
  `layers/MepLayer.tsx` renders the same glyph vocabulary the exported sheets use
  (`electricalPlanSvg.ts`/`plumbingPlanSvg.ts` export `ELEC_SYM_TEXT`/`PLUMB_SYM_TEXT`). All six
  store actions (`add`/`update`/`remove` × electrical/plumbing) fork the default plan + push
  history — unlike `addNote`'s pre-existing non-forking quirk (don't copy it here). `mepEditor` Pro
  flag (default on) gates the tool/layer/inspector; `electricalPlan`/`plumbingPlan` still gate the
  exported sheets separately. **Suggest MEP points (G1 PR4):** `floorPlanSlice.suggestMepPoints()`
  derives a starting layout from the current furniture + doors via the ONE shared heuristic
  (`furniture/mepSuggest.ts:deriveElectricalPoints`/`derivePlumbingPoints` — moved verbatim out of
  `ui/openDrawingSet.ts`, which now imports from there too, so the export fallback and the editor
  Suggest action can never drift apart), drops any candidate duplicating an existing point
  (`isDuplicateMepPoint`, 0.3 m/same-kind/same-storey), assigns ids + per-kind default mount
  heights, and appends both families under ONE undo step + fork-if-default (the `mepEditor`-gated
  "Suggest MEP points" entry in the Plan ▾ menu / mobile Plan-tools sheet). **Sheets prefer
  persisted points (G1 PR5):** `ui/openDrawingSet.ts` reads `floorPlan.electricalPoints`/
  `plumbingPoints` first, falling back to the heuristic only when a family's array is empty;
  `ui/drawingSet.ts:buildDrawingSetHtml` takes each family as a bundled `{points, source:
  'persisted'|'heuristic'}` object (not a positional array) so the sheet can print the right
  provenance note ("Points as designed — heights in mm AFFL" vs the pre-existing indicative
  caveat) and the right `@mm` mount-height suffix beside each symbol (only for points that carry
  one — heuristic-derived points never do).
- **Lighting & switching schematic (BSJ-3, `switchCircuits` pro flag):** additive
  `PlanElectricalPoint.controls?: string[]` (+ `gang?`/`way?`) links a `switch` point to the
  light fixtures it drives (schema.ts ⇄ types.ts parity, no version bump). **ID vocabulary
  (documented decision):** a controlled id is a placed light-fixture item id
  (`PlanLight.id === item.id`) — there is NO lighting-kind electrical POINT (`ElectricalKind`
  has none), so a raw id is unambiguous; a future point target would be `point:`-prefixed. Pure
  `switchCircuits.ts` is the ONE builder: `buildSwitchCircuits(switches, lights, roomNameAt?)`
  → deterministic tags (switches/lights ordered by (x,z,id) → S1/S2…, L1/L2…), **two-way** =
  two switches with the same `controls` + `way:2` paired into one circuit number with `Sna`/`Snb`
  tags; plus `unswitchedLightCount`/`emptySwitchCount` advisory + `suggestCircuitLinks(plan,
  switches, lights)` (per room, the switch NEAREST any of the room's doors controls that room's
  lights — SG entry-door convention). `floorPlanSlice.suggestSwitchCircuits` applies it (one undo,
  fork-if-default). The electrical sheet (`electricalPlanSvg`, when the caller passes `opts.lights`
  — gated by the flag in `drawingSet`) suffixes each linked switch's side label with its tag,
  draws controlled-light crossed-circle markers (L-mark + tag) through the SAME `mepLabelLayout`
  declutter pass as the electrical symbols, adds a "Lighting circuits" legend + the switching
  advisory line; **DXF** (`export/dxf.ts:mepSection`, same flag) suffixes the ELECTRICAL layer's
  switch text with the identical tag so sheet↔DXF never diverge. Editor: the selected switch's
  inspector shows a room-grouped "Controls" list + two-way/gang (`SwitchControlsSection`, list-only
  v1 — on-plan pick deferred), and `SwitchLinksLayer` dashes leader lines to its controlled lights.
- **Setting-out & datum dimensioning (TODO G3, `settingOutDims` Pro flag):
  `settingOut.ts`** is the ONE pure builder (`datumPoint`/`settingOutDimensions`/
  `tileSettingOutPoints`) for both the dimensioned-plan sheet's setting-out row and
  the floor-plan sheet's tile marks — contractors set out from a FIXED datum (a
  structural/external wall corner), not cumulative wall-to-wall chains (per
  `docs/research/2026-07-18-contractor-handover-research.md`). `datumPoint` defaults
  to the plan's min-x/min-z EXTERNAL wall corner (`plan.datum?: {x,z}` is reserved on
  the schema for a future user-placement UI, unused by any editor in this pass — the
  computed corner is already the SG-practical answer, so v1 ships it without that
  extra surface). `settingOutDimensions` offsets each axis-aligned wall's centreline
  by half its resolved thickness (`planGeometry.ts:planWallThickness` — reused, never
  re-derived) TOWARD the datum (the face a tape from the datum reaches first), then
  measures each face's distance directly from the datum via `dimensionChain.ts`'s
  `projectToBaseline` — **not** that file's `runningDimensions` (which anchors at the
  smallest INPUT position, not an arbitrary origin; a datum-forming wall's own face
  can land fractionally before the true datum via the tie-break, so reusing it would
  silently shift every distance). Curved (`arc`) and diagonal walls are skipped (no
  single planar face). Rendered on the SAME dimensioned-plan sheet as the existing
  auto-dims (`autoDimensionSvg.ts`'s `dimensionSvg({settingOut:true})` — chosen over a
  new sheet because it already draws the plan walls at the exact scale/padding this
  row needs; a new sheet would just duplicate that), as a dashed datum-coloured row
  further outside the plan than the auto-dims so the two never overlap.
  `tileSettingOutPoints` returns one point per room (its centroid, via the shared
  `roomCentroid.ts:roomLabelPoint` — every room in this model always resolves to SOME
  floor finish via `roomFinishes.ts`'s default-oak fallback, so there's no real
  "has no floor" state to filter on) — rendered on the **floor-plan** sheet
  (`reportPlanSvg.ts`'s `showTileMarks` param, gated by the caller to when the
  Finishes schedule sheet is ALSO included) as a small cross per room + ONE shared
  caption in the scale-bar strip (not repeated per mark — a full sentence at every
  centroid overlapped illegibly in a compact multi-room HDB layout).
- **Reflected ceiling plan (TODO H4, `rcpSheet` Pro flag): `rcp.ts` + `rcpSvg.ts`.** `rcp.ts`'s
  `buildReflectedCeilingPlan(plan, fixtures, electricalPoints)` is the ONE pure core for the
  drawing set's RCP sheet — it reuses `apartment/ceiling/ceilingModel.ts:buildCeiling` (pure, no
  three/React — safe to import here) directly rather than re-deriving zone/treatment geometry, so
  a printed "FFL to false ceiling: …mm" note + its inset dashed rect/beam grid can never drift from
  what the 3D ceiling render actually builds; a room the geometry engine falls back on
  (non-rectangular, or too shallow for the drop — `CeilingModel.fallback`) prints "treatment not
  applied — verify room shape/height on site" instead of claiming a treatment that isn't real.
  `CEILING_FIXTURE_TYPES` (`ceiling-light`/`ceiling-fan`/`cove-light`, matching
  `furniture/lightEmitters.ts`'s `LIGHT_EMITTERS` registry) filters the SAME `PlanLight[]` the
  lighting plan derives down to ceiling-mounted fixtures only; each is dimensioned off the nearest
  wall on each axis by CENTRELINE distance (`nearestAxisWall` — deliberately not
  `settingOut.ts`'s face-offset precision; a ceiling point only needs "roughly here off that
  wall", the same convention the electrical/lighting plans already use). Aircon marking reuses
  whatever electrical points the caller already has (persisted or heuristic) filtered to
  `kind==='aircon'` — for cross-reference only, the full schedule stays on the Electrical plan.
  `rcpSvg.ts` mirrors `electricalPlanSvg.ts`'s shape (wall context + circle/marking symbols +
  legend, `printMmPerM` sizing) and reuses `mepLabelLayout.ts:layoutMepLabels` to declutter
  fixture distance labels exactly like the MEP sheets (H-D1) — don't re-derive a second declutter
  scheme. `ui/drawingSet.ts` fans this out per storey (every storey with rooms, not just ones with
  fixtures — a flat-ceiling room's zone note is still useful on its own). **Aircon trunking overlay
  (BSJ-2 follow-up, `airconTrunking` flag):** `buildReflectedCeilingPlan`'s optional 4th/5th args
  (`trunkingItems`/`orientationDeg`, both default to no-op) feed `analysis/airconTrunking.ts`'s
  router; only RESOLVED runs land in `ReflectedCeilingPlan.trunking`, drawn by `rcpSvg.ts` as a
  dashed polyline + `~XXm` label + a legend row (an unresolved run draws nothing on the sheet,
  same as it draws nothing in 3D — the DaylightPanel advisory is the only surface for that case).
- **On-plan D/W mark callouts (H1-F): `analysis/openingSchedule.ts:assignOpeningMarks(plan)`.** A
  per-opening (keyed by opening id, not aggregated) variant of `buildOpeningSchedule`'s
  (kind, width, head−sill, style, material) grouping, reusing the SAME `markKey`/`openingHeight`
  helpers so the two can never assign different marks to the same opening. **Plan-wide + level-ordered
  (multi-storey fix, v0.22.2.72+):** it flattens `planLevels(plan)` ground-first and numbers ONCE
  across every storey, so an upper-floor opening continues the ground numbering (D2/W2…) instead of
  restarting. Consumers rendering one storey at a time MUST pass this whole-plan map, not a stripped
  single level: `ui/drawingSet.ts` computes `assignOpeningMarks(plan)` once and threads it into each
  per-level `reportPlanSvg(…, openingMarkMap)` call (the FLOOR-PLAN sheet's `showOpeningMarks` param,
  gated to the `openingSchedule` `DrawingLayer` being on — same "don't reference a hidden sheet" rule
  the G3 tile marks follow); a single-storey `reportPlanSvg` call with no map derives it from its own
  plan. `export/dxf.ts` now imports the shared `assignOpeningMarks` (its old local copy is gone) and
  calls it with the whole `plan`; the DXF draws the **ground storey only**, so it looks up its ground
  openings in the plan-wide map — their marks match the schedule's ground marks, while the
  upper-storey marks in the map are simply never drawn.
- **Room categories (RM1, `PlanRoom.category?`, additive/optional — no version bump):** the
  persisted, USER-declared room type (13 values — see `types.ts`'s `RoomCategory`/
  `ROOM_CATEGORIES`). `roomCategory.ts` is the ONE resolver — `roomCategory(room)` (explicit
  `category` wins, else `roomCategoryFromName` infers from the name, else `'other'`) plus
  `toRoomKind`/`toArrangeKind` downmaps to the pre-existing coarser classifiers
  (`analysis/suggestions.ts` `RoomKind`, `layout/autoArrange.ts`'s internal arranger kind) so
  every existing name-inference consumer keeps working unchanged when a room has no explicit
  category. This module owns its own regex set (documented in its module doc) rather than
  delegating to `roomKindFromName` — `RoomCategory` is a strict refinement of the coarser
  buckets (`bath`→`bath`/`powder`, `bedroom`→`bedroom`/`masterBedroom`, the catch-all
  `balcony` bucket→`serviceYard`/`storeroom`/`foyer`/`balcony`) those regexes can't recover
  once already collapsed. Edited via `RoomInspector`'s "Room type" `Select` (undoable,
  `updateRoom`). `templates/shared.ts`'s `room()` builder takes an optional trailing `category`
  param — seeded across the HDB + condo starter templates. **RM1 migration is COMPLETE** — every
  name-inference consumer now resolves through `roomCategory` (explicit category wins): the coarse
  arranger/catalog/furnishPlan set plus the RM1-tail consumers (suggestions, roomLux,
  planStatistics, handoverChecklist, electricalSchedule, designChatContext, resetSlice). All keep
  byte-identical name-inference output when a room has no explicit category; the ONE intentional
  change is that `suggestions` maps `serviceYard`/`storeroom` to a local non-habitable `'utility'`
  kind instead of `'balcony'` (no more bogus "add outdoor seating" for a household shelter). See
  `docs/ARCHITECTURE.md` for the full consumer list.
- **Waterproofing zones (BSJ-7, `waterproofing` pro flag): `waterproofing.ts`** (pure) is the ONE
  builder — `buildWaterproofingZones(plan, items)` → one zone per wet/hard-service room
  (`WATERPROOF_CATEGORIES` = bath/powder/kitchen/serviceYard/balcony) = floor area + wall upturn
  (`GENERAL_UPTURN_MM` 300 on every wall; `SHOWER_UPTURN_MM` 1800 at shower walls, bath/powder only)
  + a total `membraneAreaM2` (floor + upturn bands). **Shower detection:** a placed item whose defId
  matches `/shower/` and whose centre is `pointInRoom` LOCALIZES the 1800 mm run (`showerDetected`,
  a nominal two-wall run); a bath with NO placed shower uses the FULL perimeter at 1800 mm
  conservatively. Kitchen/yard/balcony get the 300 mm general upturn only (no modeled sink-run
  geometry — documented). Items are a minimal `{ defId, position }` shape so this stays free of the
  furniture types; `it.position` is guarded (fixtures cast in tests may omit it). Consumed by the
  dimensioned-plan hatch (`autoDimensionSvg.ts`), the tiler pack (`ui/tradePacks.ts`), and the budget
  allocator's `waterproofing` sub-line. The finish schedule's wet floor rows carry an UNCONDITIONAL
  "waterproofing membrane below" note (factual, not flag-gated).
- **Floor levels & transitions (BSJ-8, `floorLevels` pro flag): `floorLevels.ts`** (pure) over the
  additive `PlanRoom.floorLevelMm?` (mm vs the FFL datum; schema.ts ⇄ types.ts parity, no version
  bump). `roomFloorLevelMm` (absent/NaN → 0), `fflTag`
  (`FFL ±0`/`FFL +25`/`FFL −50`), `buildRoomFflTags` (tags only rooms with an EXPLICIT level, at their
  `roomLabelPosition`), `buildFloorTransitions` (doorway steps between rooms at different levels, via
  `openingProbe.roomsAcrossOpening`), `buildKerbAdvisories` (a bath/powder level with an adjacent dry
  room → "verify hob/kerb"). Rendered as FFL pills + step diamonds + a legend on the dimensioned plan
  (`autoDimensionSvg.ts` overlay, same sheet as setting-out) and in the tiler pack; edited in the
  `RoomInspector` "Floor level (mm)" field (pro-gated). `intakeStates.ts` deliberately does NOT seed a
  default level (see its module note — default-flat mutations are session-only).
  **3D representation (BSJ-8 follow-up): `floorLevels3d.ts`** (pure) resolves per-room Y offsets
  (`roomFloorOffsetM`, flag off ⇒ 0) + a wall-base extension amount (`wallBaseExtensionM`, for the
  plinth that fills a lowered floor's gap under a wall) + doorway riser specs
  (`buildThresholdRisers`, reusing `buildFloorTransitions` for the pairing — the 3D riser and the 2D
  step marker can never disagree). Consumed by `apartment/PlanRoomShell.tsx` (isolated room editor)
  and `apartment/PlanShell.tsx` (whole-plan overview) for the floor/skirting offset + plinth +
  `ThresholdRiser` mesh, `furniture/FurnitureLayer.tsx` for the render-time furniture re-seat
  (no new field on `FurnitureItem`), and `scene/cameras/FirstPersonCamera.tsx` for the walk-mode
  ground-height follow. Plan-room feature only — the curated default flat has no `floorLevelMm`
  concept and is unaffected.
