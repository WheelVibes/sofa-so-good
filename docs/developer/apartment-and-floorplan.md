# Apartment & floor plan

## The default flat (`src/apartment/`)

`constants.ts` is the **source of truth** for walls/doors/windows/rooms (derived
from the floor-plan SVG). `walls/`, `floor/`, `Window.tsx`, `Door.tsx`,
`Ceiling.tsx`, `Skirting.tsx`, plus a grounding slab in `Apartment.tsx`.
**Wall reveal** (`walls/wallReveal` + pure `walls/wallRevealMath`): walls between
the orbit camera and the interior fade out (windows/doors/skirting fade with
them). Two settings (`wallRevealMode` × `wallRevealScope`, both session-only):
mode = `translucent` (15% opacity, default) / `auto-hide` (fully hidden) /
`opaque` (no fade); scope = `exterior` (perimeter only, default) / `all`
(interior partitions fade too). Exterior walls orient "outward" via a
point-in-room probe (`orientOutward`); interior partitions (rooms on both sides)
fade when faced via `cameraFacingNormal`. The body is a single watertight
extruded shape (`walls/wallBodyShape`) so it has no internal seams when
translucent. Materials flip `needsUpdate` on the transparent transition (else the
blend never engages).

## Custom plans

`PlanShell.tsx` renders a user-authored plan instead (walls extruded with
openings + per-room floor finishes) when a non-default plan is active.

## Multi-storey plans (F13)

The plan's top-level `walls/openings/rooms` are the **ground floor**; optional
`upperLevels` adds storeys (own geometry at an `elevation`). `levels.ts` is the
single resolution layer — `planLevels` / `levelAsPlan` (run any single-level
helper on one storey) / `allPlanRooms` (every storey's rooms) / `levelOfRoom` /
`levelOfItem` (`FurnitureItem.levelId`, absent = ground). Rendering stacks one
`PlanLevelShell` per visible level (`viewLevelId`, View → Levels); the 2D editor
edits one storey at a time (`LevelTabs` + `withLevelGeometry` routing); collision,
walkways, wall clips, score, daylight and lux are all level-gated. See
`src/floorplan/CLAUDE.md` for the hard rules and
`docs/research/multi-level-design.md` for the design.

## The floor-plan model (`src/floorplan/`)

`types.ts` (`FloorPlan` = walls/openings/rooms + area/bounds helpers),
`defaultPlan.ts` (seeds from `apartment/constants`), `planGeometry.ts` (plan →
renderable wall boxes + door-aware collision walls; `isDefaultPlan`),
`templates.ts` (starter apartments). The 2D editor is `ui/floorplan/`
(`FloorPlanEditor` + `PlanInspector`) — it also renders live furniture as
top-down footprints, supports a photo-trace **reference backdrop**, a 2D⇄3D
`P` toggle, and experimental AI wall recognition (`ai/floorPlanAi.ts`).

## Per-room editor

`scene/RoomEditorScene.tsx` + `apartment/roomShell.ts` + `RoomShell.tsx`
(`uiSlice.roomEditor`): isolates one room, clips shared walls to the room
footprint, hides camera-facing walls, pins Performance render + Original assets,
and bounds walk to the room. Spec:
`docs/superpowers/specs/2026-05-31-per-room-editor-design.md`.

## Collision

`collision/placement.ts` (`canPlace`, `itemFootprint` → OBB), with optional
`walls` override for custom plans (`planCollisionWalls`) and the room editor
(`roomCollisionWalls`). The auto-arranger lives in `layout/autoArrange.ts`
(`arrangeRoom`/`arrangeAllRooms`), driven by `layout/designRules.ts` clearances.
