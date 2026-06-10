# Multi-storey floor plans (F13 / Q-MULTILEVEL) — design

Status: **design accepted, phased build pending** (phases tracked in `TASKS.md`).
Unblocks: HDB Maisonette upper floor, terrace/landed 2nd storey, condo loft —
templates that today ship single-floor approximations.

## Competitor grounding
Live Home 3D / Sweet Home 3D / RoomSketcher / Planner 5D all model storeys as a
**list of levels on one plan**, each with its own walls/rooms/openings and an
elevation offset; a level switcher in the 2D editor; the 3D view stacks levels
with a per-level visibility control (all / one). Stairs are ordinary furniture
that *advisorily* connect levels. We follow that shape — it is additive to our
existing single-level `FloorPlan` and keeps every current consumer working.

## Data model (additive, no schema-version bump)
The existing top-level `walls/openings/rooms` REMAIN the ground floor —
untouched, fully back-compatible. Upper storeys are optional extras:

```ts
interface PlanUpperLevel {
  id: string            // 'lvl-…'
  name: string          // 'Upper floor'
  /** Floor-slab height above the ground floor's y=0 (m). Typically
   *  groundCeiling + slab ≈ 2.6 + 0.3. */
  elevation: number
  /** Optional per-level ceiling height; plan default when unset. */
  ceilingHeight?: number
  walls: PlanWall[]
  openings: PlanOpening[]
  rooms: PlanRoom[]     // ids must be plan-unique across ALL levels
}
interface FloorPlan { …existing…; upperLevels?: PlanUpperLevel[] }
```

- `FurnitureItem.levelId?: string` (absent = ground). Heights stay relative to
  the item's level floor; renderers add the level elevation.
- Room ids are unique across levels → the `finishes` slice, room editor,
  design score, reports all keep working keyed by room id with **zero change**
  to their data model; only geometry resolution becomes level-aware.

## Resolution layer (the only place that knows about levels)
New pure `src/floorplan/levels.ts`:
- `planLevels(plan)` → `[{id:'ground', elevation:0, …ground refs}, …upperLevels]`
- `levelOfRoom(plan, roomId)` / `levelOfItem(plan, item)`
- `levelCollisionWalls(plan, doors, levelId)` (wraps `planCollisionWalls` per level)
- `levelElevation(plan, levelId)`
Existing helpers (`planBounds`, `pointInRoom`, `planRoomArea`, …) are already
per-room/per-wall pure — they get level-scoped *callers*, not rewrites.

## Rendering
- `PlanShell`: render ground as today; for each upper level render a floor slab
  (level footprint extruded ~0.3 m), its rooms' floors (reuse `PlanRoomFloor`
  with a group y-offset), walls (`wallBoxes` offset by elevation), openings.
- Level visibility: `viewLevelId: string | 'all'` in a UI slice; View menu
  segment (All / per-level) desktop + mobile. Walls of hidden levels unmount
  (not just invisible) so picking/drag can't hit them.
- `FurnitureLayer`: group items by `levelId`, each group y-offset by elevation;
  hidden levels' items unmount with their level.
- Room editor: `PlanRoomShell` gets the room's level elevation as a group
  offset; the orbit camera focus already keys off the room centre (add y).

## Editing
- 2D `FloorPlanEditor`: a level tab strip (Ground | Upper… | ＋ Add level).
  All existing tools operate on the ACTIVE level's wall/room/opening arrays —
  the slice actions gain an optional `levelId` (default ground), implemented by
  routing array updates through one `withLevel(plan, levelId, fn)` helper.
- Stairs: the existing parametric staircase (F8/C171) placed on a level;
  an advisory check (HDB-hints style) flags levels unreachable by any stair
  whose footprint lands in both levels' footprints. No hard constraint.
- Walk mode: stays on the ground level in v1 (stair climbing = later phase);
  the View level control lets users walk an upper floor by hiding others and
  teleporting (focus room → eye at level elevation + 1.55).

## Phases (one commit each — add to TASKS.md)
1. **ML1** types + schema round-trip (`upperLevels`, `FurnitureItem.levelId`) + `levels.ts` resolution helpers + tests.
2. **ML2** `PlanShell` stacked rendering (slab + floors + walls + openings per level) + level visibility state/View-menu control (desktop+mobile) + visual verify.
3. **ML3** `FurnitureLayer`/drag/placement level-awareness (collision walls + containment scoped to the item's level).
4. **ML4** 2D editor level tabs + per-level editing + Add/Remove level (remove = confirm + items orphan-check).
5. **ML5** room-editor + finishes + design score/report/daylight scoped per level (audit each consumer; most are room-keyed already).
6. **ML6** stair-connectivity advisory + walk-mode level teleport + Maisonette/terrace/loft templates gain real upper floors.
7. **ML7** docs (user + developer + ARCHITECTURE) — and each prior phase updates its own slice of docs too.

## Risks
- Many consumers assume "the plan's rooms" = `plan.rooms` — ML1 adds
  `allPlanRooms(plan)` and a lint-by-grep pass replaces direct `.rooms` reads
  where cross-level lists are wanted (report, score, finishes pruning, …).
- Headless verification: stacked rendering + visibility are screenshot-friendly;
  walk/stair behaviour needs the usual real-GPU caveats.
