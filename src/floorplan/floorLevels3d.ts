/**
 * BSJ-8 follow-up — 3D floor-level representation.
 *
 * `floorLevels.ts` derives the DOCUMENTATION-level view (FFL tags, doorway step
 * markers, kerb advisory) from `PlanRoom.floorLevelMm`. This module is the pure
 * geometry layer that actually MOVES the 3D scene to match: per-room Y offsets
 * for the floor/skirting/furniture, a wall-base extension so a lowered floor
 * doesn't leave a visible gap under the wall, and threshold-riser specs for the
 * short vertical step face at a doorway between two rooms at different levels.
 *
 * Gated on the `floorLevels` flag throughout — callers pass `flagOn` (read via
 * `isFeatureEnabled('floorLevels')` / `useFeature('floorLevels')` at the React
 * boundary) rather than this module reading the flag itself, keeping it pure
 * and independently testable with the flag forced either way.
 *
 * Reuses `floorLevels.ts:buildFloorTransitions` for the doorway pairing (never
 * re-derives which rooms flank an opening) and `types.ts:pointInRoom` for the
 * furniture re-seat lookup (the same point-in-room test the room editor and
 * `FurnitureLayer`'s room-scoping already use) — no new geometry primitives.
 *
 * Design notes (BSJ-8 follow-up decisions):
 *  - **Wall-base gap.** Plan wall boxes (`planGeometry.ts:wallBoxes`) start at
 *    world Y=0 (`cy - height/2 === 0`) and are NOT owned by a single room (a
 *    shared wall can flank two rooms at different levels) — extending the box
 *    itself per-room would require duplicating wall geometry per adjacent room,
 *    which is out of scope for this pass. Instead `wallBaseExtensionM` gives the
 *    renderer the amount (m, always ≥0) to grow a wall/skirting box downward
 *    from y=0 so a LOWERED room's floor never shows daylight under the wall —
 *    the isolated per-room editor (`PlanRoomShell`, where every wall belongs to
 *    exactly one room) applies it directly; the whole-plan overview
 *    (`PlanShell`) applies it per-room-adjacent wall box, which is exact for an
 *    exterior/single-room-facing wall and a harmless few-mm over-extension into
 *    a neighbour's own (differently-offset) floor void for a shared partition —
 *    acceptable at the mm-scale steps this feature models (a raised floor,
 *    `offsetM > 0`, needs no extension at all: `wallBaseExtensionM` floors at 0).
 *  - **Furniture re-seat.** Render-time only (`FurnitureLayer` wraps an item's
 *    node in an extra Y offset group, mirroring the existing per-storey
 *    elevation wrapper) — stored `item.position`/`FurnitureItem` never gains a
 *    Y field, so a session's furniture layout stays level-agnostic exactly like
 *    multi-storey `levelId` elevation already works.
 *  - **Walk-mode.** `FirstPersonCamera` already resolves a `floorElev` (storey
 *    elevation) once per spawn/level-change; this module's `roomFloorOffsetM`
 *    is ADDED to that per-frame from the walker's current room (found via
 *    `pointInRoom`), so standing height follows a lowered/raised room
 *    continuously as the walker crosses a threshold — no separate collision
 *    framework needed since it's a smooth Y follow, not a hard step (a big
 *    offset would still just be walked up as a slope-free step, matching how a
 *    real ≤60 mm kerb behaves underfoot).
 */
import { buildFloorTransitions } from './floorLevels'
import { planLevels } from './levels'
import type { FloorPlan, PlanRoom } from './types'
import { pointInRoom } from './types'

/** A room's finished-floor-level offset in METRES (0 when the flag is off, or
 *  the room has no explicit `floorLevelMm`). The single choke-point every
 *  renderer/lookup below composes from — never read `floorLevelMm` directly. */
export function roomFloorOffsetM(room: Pick<PlanRoom, 'floorLevelMm'>, flagOn: boolean): number {
  if (!flagOn) return 0
  const v = room.floorLevelMm
  return typeof v === 'number' && Number.isFinite(v) ? v / 1000 : 0
}

/** How far (m, ≥0) to extend a wall/skirting box downward from its y=0 base so
 *  a lowered room's floor (negative offset) doesn't leave a visible gap under
 *  the wall. A raised floor (offset ≥ 0) needs no extension. */
export function wallBaseExtensionM(offsetM: number): number {
  return Math.max(0, -offsetM)
}

/** The room (if any) whose footprint contains `[x, z]`, scanning a level's
 *  rooms in order (first match wins — rooms don't overlap in a valid plan). */
function roomAt(rooms: readonly PlanRoom[], x: number, z: number): PlanRoom | null {
  for (const r of rooms) {
    if (pointInRoom(r, x, z)) return r
  }
  return null
}

/** Look up a plan-wide (or per-storey) floor offset (m) at a world XZ point —
 *  the furniture re-seat + walk-mode ground-height query. `levelId` scopes the
 *  search to one storey (absent/`'ground'` = the ground floor); a point outside
 *  every room resolves to 0 (no offset), matching an un-roomed area's implicit
 *  datum level. */
export function floorOffsetAtPoint(
  plan: FloorPlan,
  x: number,
  z: number,
  flagOn: boolean,
  levelId?: string,
): number {
  if (!flagOn) return 0
  const level = planLevels(plan).find((l) => l.id === (levelId ?? 'ground'))
  const rooms = level ? level.rooms : plan.rooms
  const room = roomAt(rooms, x, z)
  return room ? roomFloorOffsetM(room, flagOn) : 0
}

/** A precomputed room→offset(m) lookup for a single storey, for callers that
 *  resolve many items/points against the same level in one pass (avoids
 *  re-scanning `planLevels` per item). Room ids are plan-unique across storeys
 *  (floorplan/CLAUDE.md invariant), so one flat map per level is safe. */
export function roomFloorOffsetsForLevel(
  plan: FloorPlan,
  levelId: string | undefined,
  flagOn: boolean,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!flagOn) return out
  const level = planLevels(plan).find((l) => l.id === (levelId ?? 'ground'))
  const rooms = level ? level.rooms : plan.rooms
  for (const r of rooms) {
    const off = roomFloorOffsetM(r, flagOn)
    if (off !== 0) out.set(r.id, off)
  }
  return out
}

/** Resolve the offset (m) + owning room id for a point, scanning one storey's
 *  rooms directly (`levelAsPlan`-shaped input) — used by the isolated per-room
 *  editor and the whole-plan overview, which already have a level's rooms in
 *  hand and don't need the full plan-level lookup above. */
export function roomAndOffsetAtPoint(
  rooms: readonly PlanRoom[],
  x: number,
  z: number,
  flagOn: boolean,
): { room: PlanRoom | null; offsetM: number } {
  const room = flagOn ? roomAt(rooms, x, z) : null
  return { room, offsetM: room ? roomFloorOffsetM(room, flagOn) : 0 }
}

/** A doorway threshold riser: a short vertical quad spanning the door width at
 *  the step between two rooms at different levels, plus a thin nosing strip
 *  along its top edge — the 3D analogue of `floorLevels.ts`'s
 *  `FloorTransition` marker. World XZ centre + angle come straight from the
 *  transition (never re-derived); `riseM` is the absolute step height (m),
 *  `topY`/`bottomY` are the world Y of the riser's top (the higher room's floor)
 *  and bottom (the lower room's floor) so a renderer can place the quad without
 *  re-deriving which side is which. */
export interface ThresholdRiserSpec {
  openingId: string
  center: [number, number]
  /** Host wall heading (radians) — the riser spans `length` along this axis,
   *  matching the existing `ThresholdRect`/plan-threshold convention. */
  angle: number
  /** Span across the doorway (m) — the opening's own width. */
  length: number
  /** Absolute step height (m), always > 0 (rooms level with each other emit no
   *  riser — see {@link buildThresholdRisers}). */
  riseM: number
  /** World Y of the riser's bottom (the lower-level room's floor). */
  bottomY: number
  /** World Y of the riser's top (the higher-level room's floor + nosing sits
   *  here). */
  topY: number
  /** Storey (undefined = ground). */
  levelId?: string
}

/** The doorway geometry a riser needs beyond what `FloorTransition` already
 *  carries — resolved by the caller from its own openings/walls (kept as a
 *  callback so this module stays independent of `PlanOpening`/`PlanWall`'s
 *  exact shape). `undefined` when the opening can't be resolved. */
export interface ThresholdOpeningGeometry {
  width: number
  /** Host wall heading (radians), `atan2(dx, dz)` convention (matches
   *  `wallBoxes`/`ThresholdRect`). */
  angle: number
}

/** Build one {@link ThresholdRiserSpec} per doorway transition in the plan,
 *  reusing `floorLevels.ts:buildFloorTransitions` for the pairing (so the 3D
 *  riser and the 2D step marker can never disagree about WHERE a step exists).
 *  `openingGeometryOf` resolves an opening's width + host-wall angle from its
 *  id; a transition whose opening can't be resolved is skipped rather than
 *  guessing. Empty when the flag is off. */
export function buildThresholdRisers(
  plan: FloorPlan,
  flagOn: boolean,
  openingGeometryOf: (openingId: string, levelId?: string) => ThresholdOpeningGeometry | undefined,
): ThresholdRiserSpec[] {
  if (!flagOn) return []
  const out: ThresholdRiserSpec[] = []
  for (const t of buildFloorTransitions(plan)) {
    const geom = openingGeometryOf(t.openingId, t.levelId)
    if (!geom || geom.width <= 0) continue
    const levelElevation = t.levelId
      ? (planLevels(plan).find((l) => l.id === t.levelId)?.elevation ?? 0)
      : 0
    const aY = levelElevation + t.levelAMm / 1000
    const bY = levelElevation + t.levelBMm / 1000
    out.push({
      openingId: t.openingId,
      center: t.center,
      angle: geom.angle,
      length: geom.width,
      riseM: Math.abs(t.levelAMm - t.levelBMm) / 1000,
      bottomY: Math.min(aY, bY),
      topY: Math.max(aY, bY),
      levelId: t.levelId,
    })
  }
  return out
}
