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
- **Per-room ceiling finish (`ceilingFinish`):** a room's ceiling can be painted/textured with any
  catalog material, mirroring floor/wall finish. Stored in the finishes slice (`finishes.ceiling`,
  keyed by room id) with write-through to the plan room's `ceilingFinish` field; resolved by
  `roomFinishes.ts:resolvePlanRoomCeiling` (slice → `room.ceilingFinish` → `null`/plain white).
  Rendered by `apartment/Ceiling.tsx` (default flat, via `ceiling/RoomCeilingTile`) and
  `apartment/floor/PlanRoomCeiling` (custom plans) — the finished plane faces down (front-side) so
  it reads from below and stays culled from above. Applies to the **flat** ceiling only; a designed
  (tray/coffered/dropped/sloped) treatment keeps its plain planes. Same additive schema shape.
- **Door/window styles (`openingStyles`):** `PlanOpening.style` selects a door type
  (`panel`/`flush`/`glazed`) or window type (`plain`/`grille`/`louvre`), rendered as pure procedural
  geometry by `PlanDoorLeaf` (panel/glaze branches) and `PlanShell`'s `FadeWindow` (grille/louvre bars);
  same additive schema shape as `color`.
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
