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
- Geometry stays **pure + unit-tested** here (no three/React imports beyond types).
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
