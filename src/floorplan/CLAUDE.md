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
