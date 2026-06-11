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
