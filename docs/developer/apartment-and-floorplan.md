# Apartment & floor plan

## The default flat (`src/apartment/`)

`constants.ts` is the **source of truth** for walls/doors/windows/rooms (derived
from the floor-plan SVG). `walls/`, `floor/`, `Window.tsx`, `Door.tsx`,
`Ceiling.tsx`, `Skirting.tsx`, plus a grounding slab in `Apartment.tsx`.
**Wall reveal** (`walls/wallReveal` + pure `walls/wallRevealMath`): the walls the
orbit camera looks THROUGH fade out (windows/doors/skirting fade with them). The
fade is **orientation-only** (`wallRevealFacing`): it compares the wall's outward
normal to the camera's *look direction* (`camera.getWorldDirection`), so a wall
whose outward face turns toward the camera goes translucent while a far/back wall
stays opaque. Because it uses only the look direction, **zoom (dolly) and pan
never change the fade — only orbiting does**; a near-vertical top-down view keeps
every wall solid. Two settings (`wallRevealStrength` × `wallRevealScope`, both
session-only): a single **fade-strength** slider `wallRevealStrength` (0..1, step
0.05, default 0.95 — WALL-REVEAL-STRENGTH) where `0` = never fade (fully opaque),
`1` = fade fully hidden, and in between the head-on opacity floor is `1 − strength`
(0.95 → 0.05); scope = `exterior` (perimeter only, default) / `all` (interior
partitions fade too), applied together with the fade. Exterior walls orient "outward" via a
point-in-room probe (`orientOutward`); interior partitions (rooms on both sides)
flip their normal toward the camera so they fade when faced. The body is a single
watertight extruded shape (`walls/wallBodyShape`) so it has no internal seams when
translucent. Materials flip `needsUpdate` on the transparent transition (else the
blend never engages).

## Custom plans

`PlanShell.tsx` renders a user-authored plan instead (walls extruded with
openings + per-room floor finishes) when a non-default plan is active. It has no
grounding slab (each room draws its own floor); walled-in floor with no room gets
a **neutral fallback ground** (`UnroomedFloor`) so there's never a hole. The
enclosed footprint is the exact polygon traced from the exterior wall centre-lines
(`floorplan/footprint.ts` `traceBuildingOutline`), rendered just below the room
floors so only un-roomed floor shows. The **red** un-roomed flag (same polygon
filled `--danger`) lives in the 2D editor (`FloorPlanEditor`, `unroomedFlag`,
simple tier), not the orbit view. Skirting strips fade with their wall
(`FadeSkirting`, sharing `planWallRevealTarget` with `FadeWall`).

**Wall thickness** (pro `wallThickness` flag) is configurable: a plan-wide
default per category (`FloorPlan.wallThickness?: {external?, internal?}`) plus an
optional per-wall override (`PlanWall.thicknessM?`). Custom plans resolve it via
`planGeometry.planWallThickness(wall, plan)` (override → plan default → built-in
0.2 m / 0.1 m). The curated flat reads BOTH the global default and per-wall overrides through a
module-level holder in `wallSegments.ts` (`setFlatWallThicknessDefaults` +
`setFlatWallThicknessOverrides`, kept in sync with `floorPlan.wallThickness` and
`floorPlan.walls` by a `state/store.ts` subscription) so its render + collision
track them — the default plan's wall ids match the curated `WALLS`
(`buildDefaultPlan`), so 2D-editor per-wall edits flow to the curated render with
no extra selection UI. All edited in the 2D `PlanInspector` (plan-level defaults +
selected-wall override).

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
